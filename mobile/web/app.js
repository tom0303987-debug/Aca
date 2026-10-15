'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={token:'',user:null,summary:null,authMode:'login',page:'today',board:null,boardGroup:'',inviteGroup:'',joinCode:'',managementGroup:'',authEpoch:0};
  let pending=0,boardRequest=0;
  function feedback(message,error=false){$('feedback').textContent=message;$('feedback').classList.remove('hidden');$('feedback').classList.toggle('error',error);}
  function hideFeedback(){$('feedback').classList.add('hidden');}
  async function clearAccount(forgetSession=true){
    state.authEpoch++;state.token='';state.user=null;state.summary=null;state.board=null;state.boardGroup='';state.inviteGroup='';state.joinCode='';state.managementGroup='';boardRequest++;
    for(const id of ['registration-code','password','current-password','new-password','delete-password','invite-code','created-code'])$(id).value='';
    for(const id of ['actions','group-list','member-list','leaderboard'])$(id).replaceChildren();
    for(const id of ['invite-result','join-preview','manage-group','app-view'])$(id).classList.add('hidden');
    $('board-group').replaceChildren();$('auth-view').classList.remove('hidden');window.GrowthUI?.clear();$('delete-confirm').checked=false;
    for(const id of ['account-info','greeting','sync-status','board-period'])$(id).textContent='';
    if(forgetSession)await window.MobileBridge.clearToken();
  }
  async function api(path,method='GET',body){
    const base=window.ACA_CONFIG?.apiBase||'';
    if(window.Capacitor?.isNativePlatform?.()&&!base)throw Error('原生开发包尚未配置后端，请先完成 HTTPS 服务部署。');
    const epoch=state.authEpoch;
    let response;
    try{response=await fetch(base+path,{method,headers:{Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{}),...(state.token?{Authorization:'Bearer '+state.token}:{})},body:body!==undefined?JSON.stringify(body):undefined,cache:'no-store',credentials:window.MobileBridge.isNative?'omit':'include',signal:AbortSignal.timeout(path==='/api/assistant'?35000:15000)});}
    catch{throw Error('暂时无法连接服务器。请检查网络；新部署的服务需完成域名、HTTPS 配置后才能登录。');}
    let data;try{data=await response.json();}catch{throw Error('未连接到有效的开发接口，请检查启动地址。');}
    if(epoch!==state.authEpoch)throw Error('账号已切换，请重新操作。');
    if(!response.ok){
      if(response.status===401&&['LOGIN_REQUIRED','SESSION_EXPIRED'].includes(data.error?.code))await clearAccount();
      throw Error(data.error?.message||'操作失败，请稍后重试。');
    }
    return data;
  }
  async function perform(fn){
    if(pending)return;
    pending++;const disabled=new Map();
    document.querySelectorAll('button').forEach(button=>{disabled.set(button,button.disabled);button.disabled=true;});
    hideFeedback();
    try{await fn();}catch(error){feedback(error.message,true);}
    finally{
      pending--;disabled.forEach((wasDisabled,button)=>{if(button.isConnected)button.disabled=wasDisabled;});
      // Newly rendered buttons have not been captured above; reapply current business state.
      if(state.summary){$('checkin').disabled=state.summary.checkedIn;document.querySelectorAll('[data-complete]').forEach(button=>{button.disabled=state.summary.completed.includes(button.dataset.complete);});}
    }
  }
  function setAuthMode(mode){
    state.authMode=mode;const registering=mode==='register';
    $('login-tab').classList.toggle('selected',!registering);$('register-tab').classList.toggle('selected',registering);
    $('nickname-field').classList.toggle('hidden',!registering);$('consent-field').classList.toggle('hidden',!registering);
    $('registration-code-field').classList.toggle('hidden',!registering);$('nickname').required=registering;$('auth-consent').required=registering;
    $('auth-heading').textContent=registering?'开始你的同行旅程':'欢迎回来';
    $('auth-description').textContent=registering?'创建测试账号，再邀请朋友加入。':'你的成长，不需要从头开始。';
    $('auth-submit').textContent=registering?'注册并开始 →':'登录并继续 →';
    $('password').autocomplete=registering?'new-password':'current-password';hideFeedback();
  }
  function renderSummary(){
    const s=state.summary;if(!s)return;
    $('greeting').textContent=`${state.user.nickname}，今天向前一点。`;
    $('today-label').textContent=`${s.today} · 北京时间`;
    $('sync-status').textContent=`上次读取：${new Date().toLocaleTimeString('zh-CN',{hour12:false})} · 小组榜单每30秒刷新`;
    $('checkin-totals').textContent=`本月 ${s.checkinMonth} 天 · 累计 ${s.checkinTotal} 天 · 最长连续 ${s.checkinBest} 天`;
    $('checkin-calendar').innerHTML=Array.from({length:7},(_,i)=>{const day=new Date(Date.parse(s.today+'T12:00:00Z')-(6-i)*86400000).toISOString().slice(0,10),yes=s.checkinDays.includes(day);return `<div class="${yes?'checked':''}"><small>${day.slice(5)}</small><b>${yes?'✓':'·'}</b></div>`;}).join('');
    $('streak').textContent=s.streak;$('today-points').textContent=s.todayPoints;$('week-points').textContent=s.weekPoints+' 分';$('daily-progress').value=s.todayPoints;
    $('checkin').textContent=s.checkedIn?'今日已签到 ✓':'今日签到 +1';$('checkin').disabled=s.checkedIn;
    const symbols=['◎','▱','↗'];
    $('actions').innerHTML=s.actions.map((action,i)=>{const done=s.completed.includes(action.id);return `<article class="card action-card ${done?'done':''}"><span class="action-symbol" aria-hidden="true">${done?'✓':symbols[i]}</span><h3>${escape(action.title)}</h3><p class="muted">${escape(action.detail)}</p><button class="${done?'quiet':'secondary'}" data-complete="${escape(action.id)}" ${done?'disabled':''}>${done?'已完成':'确认完成 +2'}</button></article>`;}).join('');
    $('group-list').innerHTML=s.groups.length?s.groups.map(group=>`<article class="card group-card"><h3>${escape(group.name)}</h3><p class="muted">${group.memberCount} 位同行者 · ${group.ownerId===state.user.id?'你是组长':'你是成员'} · ${group.rankingEnabled?'已参榜':'未参榜'}</p><div class="row"><button class="secondary" data-board="${group.id}">查看榜单</button><button class="quiet" data-ranking="${group.id}" data-enabled="${group.rankingEnabled?'false':'true'}">${group.rankingEnabled?'退出排名':'加入排名'}</button>${group.ownerId===state.user.id?`<button class="quiet" data-invite="${group.id}">邀请朋友</button><button class="quiet" data-manage="${group.id}">管理成员</button>`:''}<button class="quiet" data-leave="${group.id}">退出小组</button></div></article>`).join(''):'<div class="card empty">还没有小组。建立一个小组，或使用朋友的邀请码加入。</div>';
    if(!s.groups.some(g=>g.id===state.boardGroup)){state.boardGroup=s.groups[0]?.id||'';state.board=null;}
    $('board-group').innerHTML=s.groups.length?s.groups.map(g=>`<option value="${g.id}">${escape(g.name)}</option>`).join(''):'<option value="">暂无小组</option>';
    $('board-group').value=state.boardGroup;
    const own=groupId=>s.groups.some(g=>g.id===groupId&&g.ownerId===state.user.id);
    if(!own(state.inviteGroup)){$('created-code').value='';$('invite-result').classList.add('hidden');state.inviteGroup='';}
    if(!own(state.managementGroup)){$('manage-group').classList.add('hidden');state.managementGroup='';}
    $('account-info').textContent=`${state.user.nickname} · 用户名 ${state.user.username}`;
    renderBoard();
  }
  async function refresh(){const data=await api('/api/me');state.user=data.user;state.summary=data.summary;renderSummary();if(state.page==='board')await loadBoard();if(window.GrowthUI)await window.GrowthUI.refresh();}
  function showPage(page){
    state.page=page;window.scrollTo({top:0,behavior:'instant'});document.querySelectorAll('[data-panel]').forEach(el=>el.classList.toggle('hidden',el.dataset.panel!==page));
    document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('selected',el.dataset.page===page));
    document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('selected',el.dataset.page===page||(page==='board'&&el.dataset.page==='group')));if(page==='board')return loadBoard();
  }
  async function loadBoard(){
    state.board=null;renderBoard();if(!state.boardGroup)return;
    const request=++boardRequest,groupId=state.boardGroup;
    try{const result=await api(`/api/groups/${groupId}/board`);if(request!==boardRequest||groupId!==state.boardGroup)return;state.board=result;renderBoard();}
    catch(error){if(request===boardRequest){state.board=null;renderBoard();}throw error;}
  }
  function renderBoard(){
    const board=state.board,kind=$('board-kind').value;
    $('board-period').textContent=board?`${board.weekStart} ～ ${board.today} · 北京时间${kind==='improvement'?` · 对比 ${board.previousPeriod.start} ～ ${board.previousPeriod.end}`:''}`:'';
    if(!board){$('leaderboard').innerHTML=`<p class="empty">${state.boardGroup?'点击刷新，获取小组最新榜单。':'先创建或加入一个小组，再看看彼此的成长。'}</p>`;return;}
    const rows=board.rows.slice().sort((a,b)=>b[kind]-a[kind]||a.nickname.localeCompare(b.nickname,'zh-CN')||a.userId.localeCompare(b.userId));
    let rank=0,previous=null;
    $('leaderboard').innerHTML=rows.length?rows.map((row,i)=>{
      if(row[kind]!==previous)rank=i+1;previous=row[kind];const own=row.userId===state.user.id;
      const score=kind==='improvement'&&row[kind]>0?'+'+row[kind]:row[kind];
      return `<div class="rank-row ${own?'me':''}"><span class="rank-index">${rank}</span><div><div class="rank-name">${escape(row.nickname)}${own?'<small>你</small>':''}</div><div class="rank-detail">${row.checkedToday?'今日已签到':'今日未签到'} · 完成 ${row.actionsToday}/3 项</div></div><div class="rank-score">${score}<small>${kind==='checkinDays'?'签到天数':kind==='improvement'?'较上周同期':'本周积分'}</small></div></div>`;
    }).join(''):'<p class="empty">暂时没有成员参榜。每个人都可以选择自己的节奏。</p>';
  }
  async function copyText(value,inputId){
    try{await window.MobileBridge.copyText(value);feedback('已复制，请自行发送给想邀请的朋友。');}
    catch{if(inputId){$(inputId).focus();$(inputId).select();}feedback('浏览器未允许复制，请选中邀请码后手动复制。',true);}
  }
  async function manage(groupId){
    const {members}=await api(`/api/groups/${groupId}/members`);state.managementGroup=groupId;
    $('member-list').innerHTML=members.map(member=>`<div class="member-row"><strong>${escape(member.nickname)}</strong>${member.id===state.user.id?'<span class="pill">组长 · 你</span>':`<div class="row"><button class="secondary" data-transfer="${member.id}">转让组长</button><button class="quiet" data-remove="${member.id}">移出小组</button></div>`}</div>`).join('');
    $('manage-group').classList.remove('hidden');$('manage-group').scrollIntoView({block:'start',behavior:'smooth'});
  }
  $('login-tab').addEventListener('click',()=>setAuthMode('login'));
  $('register-tab').addEventListener('click',()=>setAuthMode('register'));
  $('auth-form').addEventListener('submit',event=>{event.preventDefault();perform(async()=>{
    const registering=state.authMode==='register';
    const data=await api(registering?'/api/register':'/api/login','POST',{username:$('username').value,password:$('password').value,...(registering?{nickname:$('nickname').value,accepted:$('auth-consent').checked,registrationCode:$('registration-code').value}:{})});
    state.token=data.token;state.user=data.user;$('password').value='';
    try{await refresh();await window.MobileBridge.saveToken(state.token);}catch(error){await clearAccount();throw error;}
    $('auth-view').classList.add('hidden');$('app-view').classList.remove('hidden');showPage('today');feedback(registering?'账号已创建，先完成今天的一小步。':'登录成功，欢迎回来。');
  });});
  document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>perform(()=>showPage(button.dataset.page))));
  $('refresh').addEventListener('click',()=>perform(async()=>{await refresh();feedback('已读取最新数据。');}));
  $('checkin').addEventListener('click',()=>perform(async()=>{const data=await api('/api/checkin','POST',{});state.summary=data.summary;renderSummary();await window.GrowthUI.refresh();feedback(data.awarded?'签到成功，今日 +1 分。':'今天已经签到，不会重复加分。');}));
  $('actions').addEventListener('click',event=>{const button=event.target.closest('[data-complete]');if(!button)return;perform(async()=>{
    const action=state.summary.actions.find(x=>x.id===button.dataset.complete);
    if(!confirm(`确认你今天已经完成“${action.title}”？请按实际情况记录。`))return;
    const data=await api('/api/actions/complete','POST',{actionId:action.id});state.summary=data.summary;renderSummary();await window.GrowthUI.refresh();feedback(data.awarded?'已记录行动，+2 分。':'此行动今天已经计分。');
  });});
  $('create-group').addEventListener('submit',event=>{event.preventDefault();perform(async()=>{const group=await api('/api/groups','POST',{name:$('group-name').value,accepted:$('create-consent').checked});$('create-group').reset();state.boardGroup=group.id;await refresh();feedback('小组已创建，可以生成邀请码邀请朋友。');});});
  $('invite-code').addEventListener('input',()=>{state.joinCode='';$('join-preview').classList.add('hidden');$('join-consent').checked=false;});
  $('join-group').addEventListener('submit',event=>{event.preventDefault();perform(async()=>{const code=$('invite-code').value.trim();const group=await api('/api/invites/preview','POST',{code});state.joinCode=code;$('join-name').textContent=`即将加入：${group.name}`;$('join-consent').checked=false;$('join-preview').classList.remove('hidden');});});
  $('join-confirm').addEventListener('click',()=>perform(async()=>{if(!$('join-consent').checked)throw Error('请先确认加入与分享范围。');const group=await api('/api/groups/join','POST',{code:state.joinCode,accepted:true});state.joinCode='';$('join-preview').classList.add('hidden');$('invite-code').value='';state.boardGroup=group.id;await refresh();feedback('已加入小组。你可以随时退出排名。');}));
  $('group-list').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;perform(async()=>{
    const data=button.dataset;
    if(data.board){state.boardGroup=data.board;$('board-group').value=data.board;await showPage('board');}
    else if(data.invite){const invite=await api(`/api/groups/${data.invite}/invite`,'POST',{});state.inviteGroup=data.invite;$('created-code').value=invite.code;$('invite-result').classList.remove('hidden');$('invite-result').scrollIntoView({block:'center',behavior:'smooth'});feedback('邀请码已生成，仅可使用一次；旧码已失效。');}
    else if(data.ranking){await api(`/api/groups/${data.ranking}/ranking`,'PATCH',{enabled:data.enabled==='true'});await refresh();feedback(data.enabled==='true'?'已加入组内排名。':'已退出排名，之后读取的榜单将不再显示你的统计。');}
    else if(data.manage)await manage(data.manage);
    else if(data.leave){if(!confirm('退出后你将无法查看本组榜单，重新加入需要新的邀请。确认退出？'))return;await api(`/api/groups/${data.leave}/leave`,'POST',{});await refresh();feedback('已退出小组，个人记录仍保留。');}
  });});
  $('copy-invite').addEventListener('click',()=>perform(()=>copyText($('created-code').value,'created-code')));
  $('revoke-invite').addEventListener('click',()=>perform(async()=>{await api(`/api/groups/${state.inviteGroup}/invite`,'DELETE',{});$('created-code').value='';$('invite-result').classList.add('hidden');state.inviteGroup='';feedback('邀请码已撤销。');}));
  $('member-list').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;perform(async()=>{
    const group=state.managementGroup;if(!group)return;
    if(button.dataset.transfer){if(!confirm('转让后你会成为普通成员，不能再管理本组。确认转让给该成员？'))return;await api(`/api/groups/${group}/owner`,'POST',{userId:button.dataset.transfer});await refresh();feedback('组长已转让，现有邀请码已撤销。');}
    else if(button.dataset.remove){if(!confirm('确认将该成员移出小组？'))return;await api(`/api/groups/${group}/members/${button.dataset.remove}`,'DELETE',{});await refresh();await manage(group);feedback('成员已移出小组。');}
  });});
  $('board-group').addEventListener('change',()=>perform(async()=>{state.boardGroup=$('board-group').value;await loadBoard();}));
  $('board-kind').addEventListener('change',renderBoard);
  $('logout').addEventListener('click',()=>perform(async()=>{try{await api('/api/logout','POST',{});await clearAccount();feedback('已退出登录。');}catch(error){await clearAccount();feedback('本页面已退出；服务器暂未确认撤销，原会话最长 12 小时后过期。',true);}}));
  $('password-form').addEventListener('submit',event=>{event.preventDefault();perform(async()=>{await api('/api/me/password','POST',{currentPassword:$('current-password').value,newPassword:$('new-password').value});await clearAccount();feedback('密码已修改，所有会话已退出，请重新登录。');});});
  $('delete-form').addEventListener('submit',event=>{event.preventDefault();perform(async()=>{if(!$('delete-confirm').checked)return;if(!confirm('最后确认：永久删除当前开发账号及服务端记录？'))return;await api('/api/me','DELETE',{password:$('delete-password').value});await clearAccount();feedback('开发账号及关联记录已删除。');});});
  $('export-account').addEventListener('click',()=>perform(async()=>{const data=await api('/api/me/export');await window.MobileBridge.exportData(data,state.summary.today);feedback('已打开备份导出；文件含个人记录，请妥善保管。');}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden){state.board=null;renderBoard();}else if(state.user)feedback('欢迎回来，点击“刷新数据”读取伙伴的最新进度。');});
  window.ClubUI={api,perform,feedback,getToday:()=>state.summary?.today||'',getUser:()=>state.user,showPage};
  setInterval(()=>{if(state.user&&!document.hidden&&!pending)perform(()=>refresh());},30000);
  setAuthMode('login');
  async function restoreSession(){
    try{
      if(window.MobileBridge.isNative){state.token=await window.MobileBridge.getToken();if(!state.token)return;}
      await refresh();$('auth-view').classList.add('hidden');$('app-view').classList.remove('hidden');showPage('today');
      $('retry-connection').classList.add('hidden');
    }catch(error){await clearAccount(false);if(window.MobileBridge.isNative){$('retry-connection').classList.remove('hidden');feedback(error.message,true);}}
  }
  $('retry-connection').addEventListener('click',()=>perform(restoreSession));
  perform(async()=>{
    await window.MobileBridge.init({
      back:exit=>{if(pending)return;const dialog=document.querySelector('dialog[open]');if(dialog){if(confirm('关闭编辑窗口？尚未保存的修改会丢失。'))dialog.close();return;}if(state.user&&state.page!=='today'){showPage('today');return;}if(confirm('退出 App？'))exit();},
      resume:()=>{if(!pending)perform(()=>state.user?refresh():restoreSession());}
    });
    await restoreSession();
  });
})();
