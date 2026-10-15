import test from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../server/service.mjs';
import { createAppServer } from '../server/http.mjs';
import { once } from 'node:events';
import { request } from 'node:http';
const password='Test-password-321!';
async function fixture(){let now=Date.parse('2026-10-15T04:00:00Z');const s=createService({clock:()=>now});const a=await s.register({username:'alice',nickname:'甲',password,accepted:true});const b=await s.register({username:'bravo',nickname:'乙',password,accepted:true});return {s,a:a.user.id,b:b.user.id,token:a.token,tick:(days)=>now+=days*86400000};}
const change=(s,u,action,payload)=>s.growth.mutate(u,{revision:s.growth.get(u).revision,action,payload});
function importFile(s,u,document,mode='replace'){const p=s.growth.preview(u,document);return s.growth.applyImport(u,{document,digest:p.digest,confirmed:true,mode,revision:s.growth.get(u).revision});}

test('unified lifecycle: task, goal, idempotence, reward spending, periods and stale writes',async t=>{
 const {s,a,b,tick}=await fixture();t.after(()=>s.close());
 let r=change(s,a,'goal.save',{title:'主线',target:1,reward:50,dimensionId:'learn'});const goal=r.data.goals[0].id;
 r=change(s,a,'task.save',{title:'阅读',dimensionId:'learn',repeat:'daily',xp:20,goalId:goal});const task=r.data.tasks[0].id,stale=r.revision;
 r=change(s,a,'task.complete',{id:task});assert.equal(r.data.coins,20);assert.equal(r.data.goals[0].progress,1);
 r=change(s,a,'task.complete',{id:task});assert.equal(r.data.coins,20);
 assert.throws(()=>s.growth.mutate(a,{revision:stale,action:'task.complete',payload:{id:task}}),e=>e.code==='REVISION_CONFLICT');
 r=change(s,a,'goal.claim',{id:goal});assert.equal(r.data.coins,70);r=change(s,a,'goal.claim',{id:goal});assert.equal(r.data.coins,70);
 const reward=r.data.rewards[0].id;r=change(s,a,'reward.redeem',{id:reward});assert.equal(r.data.coins,50);assert.equal(r.data.rewards[0].owned,1);
 r=change(s,a,'reward.use',{id:reward});assert.equal(r.data.rewards[0].owned,0);assert.throws(()=>change(s,a,'reward.use',{id:reward}));
 tick(1);r=change(s,a,'task.complete',{id:task});assert.equal(r.data.coins,70);assert.equal(r.data.records.length,3);
 assert.throws(()=>change(s,b,'task.complete',{id:task}),e=>e.status===404);assert.equal(s.growth.get(b).data.records.length,0);
 assert.equal(s.summary(a).todayPoints,0,'personal task never awards ranking');
 r=change(s,a,'activity.add',{title:'活动',minutes:30,dimensionId:'health',requestId:'duplicate-activity'});const xp=r.data.coins;
 r=change(s,a,'activity.add',{title:'活动',minutes:30,dimensionId:'health',requestId:'duplicate-activity'});assert.equal(r.data.coins,xp);
});

test('cash uses integer cents, multiple same-day entries, validation and ownership',async t=>{
 const {s,a,b}=await fixture();t.after(()=>s.close());
 let r=change(s,a,'finance.save',{type:'income',amount:0.1,day:'2026-10-15',note:'A'});
 r=change(s,a,'finance.save',{type:'income',amount:0.2,day:'2026-10-15',note:'B'});r=change(s,a,'finance.save',{type:'expense',amount:0.05,day:'2026-10-15'});
 assert.equal(r.data.finance.reduce((v,x)=>v+(x.type==='income'?x.cents:-x.cents),0),25);
 assert.equal(r.data.finance.length,3);const id=r.data.finance[0].id;
 assert.throws(()=>change(s,b,'finance.delete',{id}),e=>e.status===404);
 for(const payload of [{amount:-1},{amount:1.001},{day:'2026-02-30'},{day:'2027-01-01'},{day:'2026-99-99'}])assert.throws(()=>change(s,a,'finance.save',{type:'income',amount:1,day:'2026-10-15',...payload}));
 r=change(s,a,'finance.save',{id,type:'income',amount:10,day:'2026-10-15'});assert.equal(r.data.finance.length,3);assert.equal(r.data.finance[0].cents,1000);
 change(s,a,'finance.delete',{id});assert.equal(s.growth.get(a).data.finance.length,2);
});

test('V12 migration preserves history and spendable points without replaying rank rewards',async t=>{
 const {s,a}=await fixture();t.after(()=>s.close());
 const old={version:12,xp:100,p:40,k:5,b:6,e:7,h:8,profile:{job:'创业冒险者'},t:[{id:'t',n:'阅读',r:3,a:'k',done:true,repeat:'once'}],quests:[{id:'q',n:'旧主线',target:2,progress:2,reward:5,a:'b',claimed:true}],history:[{t:Date.parse('2026-10-14T04:00:00Z'),n:'旧行动',a:'k',reward:10}],earnings:[{date:'2026-10-14',amount:100},{date:'2026-10-13',amount:-20}],expenses:[{date:'2026-10-14',amount:30}],checkins:[{date:'2026-10-14',note:'旧签到'}],rewards:[{n:'休息',c:10,owned:2,used:1}]};
 const p=s.growth.preview(a,old);assert.equal(p.counts.finance,3);let r=importFile(s,a,old);assert.equal(r.data.openingXP,100);assert.equal(r.data.coins,40);assert.equal(r.data.records[0].xp,0);assert.equal(r.data.legacyCheckins.length,1);assert.equal(s.summary(a).todayPoints,0);
 assert.throws(()=>importFile(s,a,old),e=>e.code==='DUPLICATE_IMPORT');
 r=change(s,a,'task.complete',{id:r.data.tasks[0].id});assert.equal(r.data.coins,40);assert.equal(s.growth.archive(a)[0].document.profile.job,'创业冒险者');
 const backup=s.exportAccount(a);assert.equal(backup.format,'aca-unified-v2');assert.equal(backup.growth.data.coins,40);
 r=importFile(s,a,backup);assert.equal(r.data.openingXP,100);assert.equal(r.data.finance.length,3);
});

test('QuantLife migration reads actual daily.days, custom dimensions and completed tasks',async t=>{
 const {s,a}=await fixture();t.after(()=>s.close());
 const q={meta:{dimensions:{defs:{research:{name:'学习',exp_config:{base_rate_per_hour:80}}}}},dimensions:{research:{total_exp:100}},total_exp:150,history:[{date:'2026-10-14',dimension_key:'research',description:'学习',exp_gained:100}],wealth:{current:200,target:5000},task_camp:{daily:{days:{'2026-10-14':{tasks:[{id:'a',title:'昨日任务',done:true,dimension_key:'research',reward_exp:20}]},'2026-10-15':{tasks:[{id:'b',title:'今天任务',done:false,dimension_key:'research'}]}}},monthly:{tasks:[{title:'月任务',status:'done'}]}},ai_plan_direction:{goal:'学习',main_line:'每日积累'}};
 let r=importFile(s,a,q);assert.equal(r.data.dimensions[0].rate,80);assert.equal(r.data.openingXP,150);assert.equal(r.data.coins,0);assert.equal(r.data.tasks.length,3);assert.equal(r.data.tasks.find(x=>x.title==='昨日任务').archived,true);assert.equal(r.data.wealth.openingCents,20000);assert.equal(r.data.goals.length,1);
 const monthly=r.data.tasks.find(x=>x.title==='月任务');r=change(s,a,'task.complete',{id:monthly.id});assert.equal(r.data.coins,0);assert.equal(s.summary(a).todayPoints,0);
});

test('standard checkin awards personal points once with seven-day bonus while rank stays capped',async t=>{
 const {s,a,tick}=await fixture();t.after(()=>s.close());
 for(let i=0;i<7;i++){s.record(a,'checkin','daily');s.record(a,'checkin','daily');if(i<6)tick(1);}
 assert.equal(s.growth.get(a).data.coins,10);assert.equal(s.summary(a).todayPoints,1);assert.equal(s.summary(a).streak,7);
 for(const action of ['focus','learn','move']){s.record(a,'action',action);s.record(a,'action',action);}
 assert.equal(s.summary(a).todayPoints,7);assert.equal(s.growth.get(a).data.coins,70);assert.equal(s.growth.get(a).data.records.length,10);
});

test('new HTTP endpoints enforce account ownership, cookie restoration, CSRF and private export',async t=>{
 const s=createService(),server=createAppServer(s);server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));s.close();});const base='http://127.0.0.1:'+server.address().port;
 const req=async(path,{method='GET',body,token,cookie,origin}={})=>{const r=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),headers:r.headers};};
 const a=await req('/api/register',{method:'POST',body:{username:'alice',nickname:'甲',password,accepted:true}});const cookie=a.headers.get('set-cookie').split(';')[0];assert.match(a.headers.get('set-cookie'),/HttpOnly/);assert.match(a.headers.get('set-cookie'),/SameSite=Strict/);
 assert.equal((await req('/api/me',{cookie})).status,200);
 assert.equal((await req('/api/checkin',{method:'POST',cookie,body:{}})).status,403);
 assert.equal((await req('/api/checkin',{method:'POST',cookie,origin:base,body:{}})).status,200);
 const before=await req('/api/growth',{cookie});assert.equal(before.data.data.records.length,1);
 const changed=await req('/api/growth/command',{method:'POST',token:a.data.token,body:{revision:before.data.revision,action:'finance.save',payload:{type:'income',amount:20,day:new Date(Date.now()+8*3600000).toISOString().slice(0,10)}}});assert.equal(changed.status,200);
 assert.equal((await req('/api/growth')).status,401);
 assert.equal((await req('/api/assistant',{method:'POST',token:a.data.token,body:{type:'plan',text:'目标'}})).status,503);
 assert.equal((await req('/api/logout',{method:'POST',cookie,origin:base,body:{}})).status,200);assert.equal((await req('/api/me',{cookie})).status,401);
});

test('delete account removes growth, finances and imported originals',async t=>{const {s,a,token}=await fixture();t.after(()=>s.close());change(s,a,'activity.add',{title:'行动',minutes:10,dimensionId:'learn',requestId:'activity-id'});await s.deleteAccount(a,password);assert.throws(()=>s.authenticate(token));assert.throws(()=>s.growth.get(a));});

test('hosted mode uses secure cookies, registration gate and exact native origins',async t=>{
 const s=createService(),server=createAppServer(s,{publicOrigin:'https://growth.example.com',registrationCode:'private-registration-code',nativeOrigins:['capacitor://localhost']});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));s.close();});
 const url='http://127.0.0.1:'+server.address().port;
 const wire=(target,options={})=>new Promise((resolve,reject)=>{const req=request(target,{method:options.method||'GET',headers:options.headers},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,headers:{get:k=>Array.isArray(res.headers[k])?res.headers[k].join(';'):res.headers[k]},text:()=>text}));});req.on('error',reject);req.end(options.body);});
 const post=body=>wire(url+'/api/register',{method:'POST',headers:{Host:'growth.example.com',Origin:'https://growth.example.com','Content-Type':'application/json'},body:JSON.stringify(body)});
 const body={username:'member',nickname:'成员',password,accepted:true};assert.equal((await post(body)).status,403);const yes=await post({...body,registrationCode:'private-registration-code'});assert.equal(yes.status,201);assert.match(yes.headers.get('set-cookie'),/Secure/);
 const native=await wire(url+'/api/health',{headers:{Host:'growth.example.com',Origin:'capacitor://localhost'}});assert.equal(native.status,200);assert.equal(native.headers.get('access-control-allow-origin'),'capacitor://localhost');
 assert.equal((await wire(url+'/api/health',{headers:{Host:'growth.example.com',Origin:'https://unknown.example'}})).status,403);
 assert.equal((await fetch(url+'/api/health')).status,403);
});

test('malformed backup rejected and replacing personal space does not affect another account',async t=>{
 const {s,a,b}=await fixture();t.after(()=>s.close());change(s,a,'finance.save',{type:'expense',amount:1,day:'2026-10-15'});const backup=s.exportAccount(a);const malicious=structuredClone(backup);malicious.growth.data.rewards[0].id='"><img src=x>';
 assert.throws(()=>s.growth.preview(a,malicious));
 const own=change(s,b,'finance.save',{type:'income',amount:9,day:'2026-10-15'});importFile(s,a,backup);assert.deepEqual(s.growth.get(b),own);
});
