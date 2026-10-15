import { randomUUID, createHash } from 'node:crypto';

export function createGrowth({db,clock,dayKey,AppError}) {
  db.exec(`CREATE TABLE IF NOT EXISTS growth(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,revision INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS imports(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,digest TEXT NOT NULL,source TEXT NOT NULL,created_at INTEGER NOT NULL,original TEXT NOT NULL DEFAULT '',PRIMARY KEY(user_id,digest));`);
  if(!db.prepare('PRAGMA table_info(imports)').all().some(x=>x.name==='original'))db.exec("ALTER TABLE imports ADD COLUMN original TEXT NOT NULL DEFAULT ''");
  const fail=(ok,message,code='INVALID_INPUT',status=400)=>{if(!ok)throw new AppError(status,code,message);};
  const txt=(v,max=120)=>String(v??'').trim().slice(0,max);
  const num=(v,min,max)=>{const n=Number(v);fail(Number.isFinite(n)&&n>=min&&n<=max,'数值超出允许范围');return n;};
  const integer=(v,min,max)=>{const n=num(v,min,max);fail(Number.isInteger(n),'请输入整数');return n;};
  const date=(v,past=false)=>{fail(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v,'日期格式不正确');if(past)fail(v<=dayKey(clock()),'不能记录未来日期');return v;};
  const id=()=>randomUUID();
  function fresh(){return {schema:2,profile:{motto:'每天前进一点点',job:'成长玩家'},dimensions:[['learn','学习成长'],['business','商业能力'],['execute','执行能力'],['health','运动健康']].map(([key,name])=>({id:key,name,goal:'',baseXP:0,target:1000,rate:60})),tasks:[],goals:[],records:[],finance:[],rewards:[{id:id(),name:'自在休息30分钟',cost:20,owned:0,used:0}],openingXP:0,coins:0,wealth:{openingCents:0,targetCents:10000000},legacyCheckins:[],importLog:[]};}
  function read(userId){const row=db.prepare('SELECT * FROM growth WHERE user_id=?').get(userId);return row?{revision:row.revision,data:JSON.parse(row.payload)}:{revision:0,data:fresh()};}
  function get(userId){let row=db.prepare('SELECT * FROM growth WHERE user_id=?').get(userId);if(!row){db.prepare('INSERT INTO growth VALUES(?,0,?)').run(userId,JSON.stringify(fresh()));}return read(userId);}
  function period(repeat,today){if(repeat==='daily')return today;if(repeat==='monthly')return today.slice(0,7);if(repeat==='yearly')return today.slice(0,4);if(repeat==='weekly'){const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);}return 'once';}
  function mutate(userId,body){
    db.exec('BEGIN IMMEDIATE');
    try{const current=get(userId);fail(body.revision===current.revision,'数据已在其他窗口更新，请刷新后重试','REVISION_CONFLICT',409);const d=current.data,today=dayKey(clock()),b=body.payload||{},action=body.action;
      const locate=(list,key)=>{const v=list.find(x=>x.id===key);fail(v,'记录不存在','NOT_FOUND',404);return v;};
      const dimension=key=>locate(d.dimensions,key);
      const award=(title,xp,dim,extra={})=>{d.records.push({id:id(),day:today,title,xp,dimensionId:dim,at:clock(),...extra});d.coins+=xp;};
      if(action==='dimension.save'){
        const name=txt(b.name,24);fail(name,'请输入维度名称');let x=b.id?dimension(b.id):null;if(!x){fail(d.dimensions.length<12,'最多设置12个成长维度');x={id:id(),baseXP:0};d.dimensions.push(x);}Object.assign(x,{name,goal:txt(b.goal,160),target:integer(b.target||1000,1,10000000),rate:integer(b.rate||60,1,1000)});
      }else if(action==='dimension.delete'){
        dimension(b.id);fail(d.dimensions.length>1,'至少保留一个成长维度');fail(!d.tasks.some(x=>x.dimensionId===b.id)&&!d.goals.some(x=>x.dimensionId===b.id)&&!d.records.some(x=>x.dimensionId===b.id),'此维度已关联记录，请保留或修改名称');d.dimensions=d.dimensions.filter(x=>x.id!==b.id);
      }else if(action==='task.save'){
        fail(d.tasks.length<2000||b.id,'任务数量已达上限');const title=txt(b.title);fail(title,'请输入任务名称');dimension(b.dimensionId);if(b.goalId)locate(d.goals,b.goalId);
        let x=b.id?locate(d.tasks,b.id):null;if(!x){x={id:id(),createdAt:clock(),completedPeriods:[],archived:false};d.tasks.push(x);}
        fail(['once','daily','weekly','monthly','yearly'].includes(b.repeat),'请选择重复周期');
        // Changing repeat does not reopen an already completed one-off or today's completed task.
        fail(x.repeat===undefined||x.repeat===b.repeat||!x.completedPeriods.length,'已完成过的任务不能修改重复周期，请新建任务');
        Object.assign(x,{title,dimensionId:b.dimensionId,goalId:b.goalId||'',repeat:b.repeat,priority:['high','normal','low'].includes(b.priority)?b.priority:'normal',xp:integer(b.xp??10,1,200),due:b.due?date(b.due):'',note:txt(b.note,500)});
      }else if(action==='task.archive'){const x=locate(d.tasks,b.id);x.archived=b.archived!==false;
      }else if(action==='task.complete'){
        const x=locate(d.tasks,b.id);fail(!x.archived,'任务已归档');const p=period(x.repeat,today);if(!x.completedPeriods.includes(p)){x.completedPeriods.push(p);award(x.title,x.xp,x.dimensionId,{taskId:x.id,kind:'task'});if(x.goalId){const g=d.goals.find(z=>z.id===x.goalId);if(g&&!g.claimed)g.progress=Math.min(g.target,g.progress+1);}}
      }else if(action==='activity.add'){
        const dim=dimension(b.dimensionId),minutes=integer(b.minutes,1,360),title=txt(b.title);fail(title,'请输入行动内容');const key=txt(b.requestId,80);fail(key.length>=8,'缺少操作标识');if(!d.records.some(x=>x.requestId===key)){const xp=Math.max(1,Math.round(minutes*dim.rate/60));award(title,xp,dim.id,{minutes,kind:'activity',requestId:key});}
      }else if(action==='goal.save'){
        const title=txt(b.title);fail(title,'请输入主线名称');dimension(b.dimensionId);let x=b.id?locate(d.goals,b.id):null;fail(!x?.claimed,'已领奖主线不可编辑');if(!x){fail(d.goals.length<200,'主线数量已达上限');x={id:id(),progress:0,claimed:false};d.goals.push(x);}const target=integer(b.target,1,10000);fail(target>=x.progress,'目标不能低于当前进度');Object.assign(x,{title,target,dimensionId:b.dimensionId,reward:integer(b.reward??50,0,1000),due:b.due?date(b.due):'',note:txt(b.note,500)});
      }else if(action==='goal.adjust'){const x=locate(d.goals,b.id);fail(!x.claimed,'主线已领奖');x.progress=Math.max(0,Math.min(x.target,x.progress+integer(b.delta,-1,1)));
      }else if(action==='goal.claim'){const x=locate(d.goals,b.id);fail(x.progress>=x.target,'主线尚未达标');if(!x.claimed){x.claimed=true;award('主线完成：'+x.title,x.reward,x.dimensionId,{kind:'goal',goalId:x.id});}
      }else if(action==='finance.save'){
        fail(['income','expense'].includes(b.type),'请选择收入或支出');const amount=num(b.amount,0.01,99999999);fail(Math.abs(amount*100-Math.round(amount*100))<1e-5,'金额最多两位小数');const day=date(b.day,true);let x=b.id?locate(d.finance,b.id):null;if(!x){fail(d.finance.length<10000,'账本记录已达上限');x={id:id()};d.finance.push(x);}Object.assign(x,{type:b.type,cents:Math.round(amount*100),day,note:txt(b.note,200),category:txt(b.category||'其他',24),updatedAt:clock()});
      }else if(action==='finance.delete'){locate(d.finance,b.id);d.finance=d.finance.filter(x=>x.id!==b.id);
      }else if(action==='wealth.save'){d.wealth={openingCents:Math.round(num(b.opening,-999999999,999999999)*100),targetCents:Math.round(num(b.target,1,999999999)*100)};
      }else if(action==='reward.save'){
        const name=txt(b.name,60);fail(name,'请输入奖励名称');let x=b.id?locate(d.rewards,b.id):null;if(!x){fail(d.rewards.length<200,'奖励数量已达上限');x={id:id(),owned:0,used:0};d.rewards.push(x);}Object.assign(x,{name,cost:integer(b.cost,1,100000)});
      }else if(action==='reward.redeem'){const x=locate(d.rewards,b.id);fail(d.coins>=x.cost,'奖励点不足');d.coins-=x.cost;x.owned++;
      }else if(action==='reward.use'){const x=locate(d.rewards,b.id);fail(x.owned>0,'背包中暂无此奖励');x.owned--;x.used++;
      }else if(action==='profile.save'){d.profile={motto:txt(b.motto,100),job:txt(b.job,24)};
      }else throw new AppError(400,'UNKNOWN_ACTION','不支持此操作');
      fail(d.records.length<=30000,'成长记录已达本版上限，请先导出备份');
      const revision=current.revision+1;db.prepare('UPDATE growth SET revision=?,payload=? WHERE user_id=?').run(revision,JSON.stringify(d),userId);db.exec('COMMIT');return {revision,data:d};
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  const cleanNumber=(v,max=1e9)=>Number.isFinite(Number(v))?Math.max(0,Math.min(max,Number(v))):0;
  const safeDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v&&v<=dayKey(clock());
  function parseImport(raw){
    fail(raw&&typeof raw==='object'&&!Array.isArray(raw),'请选择有效的 JSON 存档');let source,d=fresh();
    const addDim=(key,name,xp=0)=>{const x={id:txt(key,80),name:txt(name,24),goal:'',baseXP:cleanNumber(xp),rate:60,target:1000};d.dimensions.push(x);return x.id;};
    if(raw.format==='aca-unified-v2'&&raw.growth?.data?.schema===2){
      source='同行成长整合版';d=structuredClone(raw.growth.data);
      // Round-trip backup validation prevents injecting malformed records or oversized collections.
      fail(Array.isArray(d.dimensions)&&d.dimensions.length>=1&&d.dimensions.length<=12,'存档维度无效');
      const unique=(arr)=>new Set(arr.map(x=>x.id)).size===arr.length&&arr.every(x=>x&&typeof x.id==='string'&&/^[A-Za-z0-9:_-]{1,100}$/.test(x.id));
      fail(unique(d.dimensions),'维度标识重复');
      for(const [key,max] of Object.entries({tasks:2000,goals:200,records:30000,finance:10000,rewards:200,legacyCheckins:10000,importLog:100}))fail(Array.isArray(d[key])&&d[key].length<=max,'存档集合不合法：'+key);
      for(const key of ['tasks','goals','records','finance','rewards'])fail(unique(d[key]),'存档记录标识重复');
      const dimIds=new Set(d.dimensions.map(x=>x.id));
      d.dimensions.forEach(x=>{fail(typeof x.name==='string'&&x.name.length<=24,'维度名称无效');num(x.baseXP,0,1e9);integer(x.rate,1,1000);integer(x.target,1,1e7);});
      d.tasks.forEach(x=>{fail(dimIds.has(x.dimensionId)&&['once','daily','weekly','monthly','yearly'].includes(x.repeat)&&Array.isArray(x.completedPeriods),'任务数据无效');integer(x.xp,1,200);});
      d.goals.forEach(x=>{fail(dimIds.has(x.dimensionId),'主线维度无效');integer(x.target,1,10000);integer(x.progress,0,x.target);integer(x.reward,0,1000);});
      d.records.forEach(x=>{fail(dimIds.has(x.dimensionId)&&safeDay(x.day),'成长记录无效');num(x.xp,0,1e9);});
      d.finance.forEach(x=>{fail(['income','expense'].includes(x.type)&&safeDay(x.day),'收支记录无效');integer(x.cents,0,9999999900);});
      d.rewards.forEach(x=>{integer(x.cost,1,100000);integer(x.owned,0,1000000);integer(x.used,0,1000000);});
      d.tasks=d.tasks.map(x=>({...x,title:txt(x.title),note:txt(x.note,500),goalId:txt(x.goalId,100),priority:['high','normal','low'].includes(x.priority)?x.priority:'normal',due:x.due?date(x.due):'',archived:!!x.archived,completedPeriods:x.completedPeriods.filter(p=>typeof p==='string'&&p.length<=10).slice(-10000)}));
      d.goals=d.goals.map(x=>({...x,title:txt(x.title),note:txt(x.note,500),due:x.due?date(x.due):'',claimed:!!x.claimed}));
      d.records=d.records.map(x=>({...x,title:txt(x.title),kind:txt(x.kind,24)}));
      d.finance=d.finance.map(x=>({...x,note:txt(x.note,200),category:txt(x.category,24),updatedAt:Number(x.updatedAt)||0}));
      d.rewards=d.rewards.map(x=>({...x,name:txt(x.name,60)}));
      d.legacyCheckins=d.legacyCheckins.filter(x=>x&&safeDay(x.day)).map(x=>({day:x.day,note:txt(x.note),source:'legacy'}));
      d.importLog=d.importLog.filter(x=>x&&typeof x==='object').map(x=>({source:txt(x.source),at:Number(x.at)||0,mode:x.mode==='append'?'append':'replace'}));
      d.profile={job:txt(d.profile?.job,24),motto:txt(d.profile?.motto,100)};
      num(d.openingXP,0,1e12);num(d.coins,0,1e12);num(d.wealth?.openingCents,-99999999900,99999999900);num(d.wealth?.targetCents,1,99999999900);fail(d.profile&&typeof d.profile==='object','个人资料无效');
    }else if(raw.dimensions&&Array.isArray(raw.history)&&raw.meta){
      source='QuantLife';d.dimensions=[];const defs=raw.meta.dimensions?.defs||{};
      for(const [key,value] of Object.entries(raw.dimensions).slice(0,12)){addDim(key,defs[key]?.name||key,value.total_exp);const x=d.dimensions.at(-1);x.goal=txt(defs[key]?.goal,160);x.rate=Math.max(1,Math.min(1000,Math.round(Number(defs[key]?.exp_config?.base_rate_per_hour)||60)));}
      fail(d.dimensions.length,'存档没有成长维度');d.openingXP=cleanNumber(raw.total_exp);d.coins=0;
      const first=d.dimensions[0].id;
      const camp=raw.task_camp||raw.task_camps||{};
      const mapTask=(t,repeat,day='')=>({id:id(),title:txt(t.title||t.name||'导入任务'),dimensionId:d.dimensions.some(x=>x.id===t.dimension_key)?t.dimension_key:first,goalId:'',repeat,priority:'normal',xp:Math.max(1,Math.min(200,Math.round(cleanNumber(t.reward_exp)||10))),due:day,note:txt(t.note||t.description,500),archived:!!day&&day<dayKey(clock()),completedPeriods:(t.done||t.status==='done')?[repeat==='once'?'once':period(repeat,day||dayKey(clock()))]:[],createdAt:clock()});
      for(const [kind,repeat] of [['monthly','monthly'],['yearly','yearly']])for(const t of (camp[kind]?.tasks||[]).slice(0,400))if(t&&typeof t==='object')d.tasks.push(mapTask(t,repeat));
      for(const t of (camp.daily?.tasks||camp.daily?.templates||[]).slice(0,400))if(t&&typeof t==='object')d.tasks.push(mapTask(t,'daily'));
      for(const [day,doc] of Object.entries(camp.daily?.days||{}).sort((a,b)=>a[0].localeCompare(b[0])).slice(-365))if(safeDay(day)){
        const tasks=Array.isArray(doc?.tasks)?doc.tasks:Object.entries(doc?.tasks||{}).map(([key,v])=>({...v,title:(camp.daily?.templates||[]).find(t=>t.id===key)?.title||key,done:v?.status==='done'}));
        for(const t of tasks)if(t&&typeof t==='object'&&d.tasks.length<2000)d.tasks.push(mapTask(t,'once',day));
      }
      d.wealth={openingCents:Math.round(cleanNumber(raw.wealth?.current)*100),targetCents:Math.max(100,Math.round(cleanNumber(raw.wealth?.target)*100))};
      d.profile={job:'成长玩家',motto:txt(raw.meta.profile?.tagline,100)};
      for(const h of raw.history.slice(-30000))if(safeDay(h.date))d.records.push({id:id(),day:h.date,title:txt(h.description||h.task_type||'历史行动'),xp:0,originalXP:cleanNumber(h.exp_gained),dimensionId:d.dimensions.some(x=>x.id===h.dimension_key)?h.dimension_key:first,kind:'imported',at:Date.parse(h.date+'T12:00:00+08:00')});
      if(raw.ai_plan_direction?.main_line)d.goals.push({id:id(),title:txt(raw.ai_plan_direction.goal||'导入成长主线'),note:txt(raw.ai_plan_direction.main_line,500),dimensionId:first,progress:0,target:10,reward:50,claimed:false,due:''});
    }else if(Array.isArray(raw.t)&&Array.isArray(raw.history)){
      source='Aca V'+(Number(raw.version)||12);d.dimensions=[];for(const [key,name] of [['k','认知学习'],['b','商业能力'],['e','执行能力'],['h','运动健康']])addDim(key,name,raw[key]);
      d.openingXP=cleanNumber(raw.xp??raw.p);d.coins=cleanNumber(raw.p);d.profile={job:txt(raw.profile?.job,24),motto:'每天前进一点点'};
      const goalMap=new Map();for(const g of (raw.quests||[]).slice(0,200)){const key=id();goalMap.set(g.id,key);d.goals.push({id:key,title:txt(g.n||'导入主线'),dimensionId:d.dimensions.some(x=>x.id===g.a)?g.a:'e',target:Math.max(1,Math.min(10000,Math.round(Number(g.target)||10))),progress:Math.max(0,Math.min(Number(g.target)||10,Math.round(Number(g.progress)||0))),reward:Math.min(1000,Math.round(cleanNumber(g.reward))),claimed:!!g.claimed,due:'',note:''});}
      for(const t of raw.t.slice(0,2000))d.tasks.push({id:id(),title:txt(t.n||'导入任务'),dimensionId:d.dimensions.some(x=>x.id===t.a)?t.a:'e',goalId:goalMap.get(t.questId)||'',repeat:t.repeat==='daily'?'daily':'once',priority:['high','normal','low'].includes(t.pri)?t.pri:'normal',xp:Math.max(1,Math.min(200,Math.round(Number(t.r)||10))),due:'',note:'',archived:false,createdAt:clock(),completedPeriods:t.done?(t.repeat==='daily'?(t.completedAt?[dayKey(Number(t.completedAt))]:[]):['once']):[]});
      for(const h of raw.history.slice(-30000)){const n=Number(h.t);if(Number.isFinite(n)&&n>0&&n<=clock())d.records.push({id:id(),day:dayKey(n),title:txt(h.n||'历史任务'),xp:0,originalXP:cleanNumber(h.reward),dimensionId:d.dimensions.some(x=>x.id===h.a)?h.a:'e',kind:'imported',at:n});}
      for(const [list,type] of [[raw.earnings,'income'],[raw.expenses,'expense']])for(const f of (Array.isArray(list)?list:[]).slice(0,5000))if(safeDay(f.date)&&Number.isFinite(Number(f.amount)))d.finance.push({id:id(),type:Number(f.amount)<0?'expense':type,cents:Math.round(Math.min(99999999,Math.abs(Number(f.amount)))*100),day:f.date,note:txt(f.note,200),category:'历史导入',updatedAt:clock()});
      d.legacyCheckins=(raw.checkins||[]).filter(x=>safeDay(x.date)).map(x=>({day:x.date,note:txt(x.note),source:'legacy'}));
      if(Array.isArray(raw.rewards)&&raw.rewards.length)d.rewards=raw.rewards.slice(0,200).map(x=>({id:id(),name:txt(x.n||'奖励',60),cost:Math.max(1,Math.min(100000,Math.round(Number(x.c)||10))),owned:Math.floor(cleanNumber(x.owned,1e6)),used:Math.floor(cleanNumber(x.used,1e6))}));
    }else throw new AppError(400,'UNKNOWN_FORMAT','支持 Aca V9–V12、QuantLife 和整合版导出的 JSON 存档');
    return {source,data:d};
  }
  function preview(userId,raw){let parsed;try{parsed=parseImport(raw);}catch(e){if(e instanceof AppError)throw e;throw new AppError(400,'INVALID_IMPORT','存档结构不完整或包含无效记录，请检查原文件');}const digest=createHash('sha256').update(JSON.stringify(raw)).digest('hex');return {digest,source:parsed.source,counts:Object.fromEntries(['dimensions','tasks','goals','records','finance','rewards','legacyCheckins'].map(k=>[k,parsed.data[k].length])),duplicate:!!db.prepare('SELECT 1 FROM imports WHERE user_id=? AND digest=?').get(userId,digest),notice:'旧经验作为期初值保留；历史记录不重复加经验、不计排行榜。追加导入会把不同来源维度分开；整合版备份仅支持替换个人空间。'};}
  function applyImport(userId,body){
    fail(body.confirmed===true,'请先预览并确认导入');const p=preview(userId,body.document);fail(p.digest===body.digest,'文件与预览不一致');fail(!p.duplicate,'此文件已经导入','DUPLICATE_IMPORT',409);fail(['append','replace'].includes(body.mode),'请选择追加或替换');const parsed=parseImport(body.document);fail(!(parsed.source==='同行成长整合版'&&body.mode!=='replace'),'整合版备份请使用替换个人空间');
    db.exec('BEGIN IMMEDIATE');try{const current=get(userId);fail(body.revision===current.revision,'数据已更新，请重新预览','REVISION_CONFLICT',409);let d=parsed.data;
      if(body.mode==='append'){
        const old=current.data;fail(old.dimensions.length+d.dimensions.length<=12,'合并后超过12个维度，请先整理维度或选择替换');const prefix=id()+':';const map=new Map(d.dimensions.map(x=>[x.id,prefix+x.id]));d.dimensions.forEach(x=>{x.id=map.get(x.id);x.name=txt(x.name,24);});for(const key of ['tasks','goals','records'])d[key].forEach(x=>x.dimensionId=map.get(x.dimensionId));
        for(const key of ['dimensions','tasks','goals','records','finance','rewards','legacyCheckins'])old[key].push(...d[key]);old.openingXP+=d.openingXP;old.coins+=d.coins;d=old;
      }
      d.importLog.push({source:p.source,at:clock(),counts:p.counts,mode:body.mode});d.importLog=d.importLog.slice(-100);fail(d.tasks.length<=2000&&d.records.length<=30000&&d.finance.length<=10000&&d.goals.length<=200&&d.rewards.length<=200&&d.legacyCheckins.length<=10000,'合并后的记录数量超出本版上限');
      const revision=current.revision+1;db.prepare('UPDATE growth SET revision=?,payload=? WHERE user_id=?').run(revision,JSON.stringify(d),userId);db.prepare('INSERT INTO imports(user_id,digest,source,created_at,original) VALUES(?,?,?,?,?)').run(userId,p.digest,p.source,clock(),JSON.stringify(body.document));db.exec('COMMIT');return {revision,data:d};
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  function recordStandard(userId,kind,subject,day){
    const current=get(userId),d=current.data;let xp,dim,title;
    if(kind==='checkin'){
      const days=new Set(db.prepare("SELECT day FROM events WHERE user_id=? AND kind='checkin'").all(userId).map(x=>x.day));let count=0,cursor=day;
      while(days.has(cursor)){count++;cursor=new Date(Date.parse(cursor+'T12:00:00Z')-86400000).toISOString().slice(0,10);}
      xp=1+(count%7===0?3:0);dim=d.dimensions[0];title='每日签到'+(count%7===0?' · 连续7天奖励':'');
    }else{const map={focus:['execute','专注25分钟',25],learn:['learn','学习20分钟',20],move:['health','活动15分钟',15]},info=map[subject];if(!info)return;dim=d.dimensions.find(x=>x.id===info[0])||d.dimensions[0];title=info[1];xp=Math.max(1,Math.round(info[2]*dim.rate/60));}
    d.records.push({id:id(),day,title,xp,dimensionId:dim.id,kind:'standard',at:clock()});d.coins+=xp;
    db.prepare('UPDATE growth SET revision=?,payload=? WHERE user_id=?').run(current.revision+1,JSON.stringify(d),userId);
  }
  const archive=userId=>db.prepare('SELECT source,created_at AS importedAt,original FROM imports WHERE user_id=? ORDER BY created_at').all(userId).map(x=>({source:x.source,importedAt:x.importedAt,document:x.original?JSON.parse(x.original):null}));
  return {get,mutate,preview,applyImport,recordStandard,archive};
}
