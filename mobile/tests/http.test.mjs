import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createService } from '../server/service.mjs';
import { createAppServer } from '../server/http.mjs';

test('HTTP integration: real sessions, untrusted scoring, permissions, origins, persistence',async t=>{
  const service=createService(),server=createAppServer(service);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));service.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  async function api(path,{method='GET',body,token,origin}={}) {
    const res=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})},body:body?JSON.stringify(body):undefined});
    return {status:res.status,data:await res.json(),headers:res.headers};
  }
  assert.equal((await api('/api/me')).status,401);
  assert.equal((await api('/api/health',{origin:'https://evil.invalid'})).status,403);
  const body={username:'owner',nickname:'组长',password:'Dev-password-123!',accepted:true};
  const owner=(await api('/api/register',{method:'POST',body})).data;
  const friend=(await api('/api/register',{method:'POST',body:{...body,username:'friend',nickname:'伙伴'}})).data;
  assert.ok(owner.token&&friend.token);
  const group=(await api('/api/groups',{method:'POST',token:owner.token,body:{name:'测试小组',accepted:true}})).data;
  assert.equal((await api(`/api/groups/${group.id}/board`,{token:friend.token})).status,404);
  const code=(await api(`/api/groups/${group.id}/invite`,{method:'POST',token:owner.token,body:{}})).data.code;
  assert.equal((await api('/api/groups/join',{method:'POST',token:friend.token,body:{code,accepted:true}})).status,200);
  const writes=await Promise.all(Array.from({length:8},()=>api('/api/checkin',{method:'POST',token:friend.token,body:{userId:owner.user.id,day:'2099-01-01',points:9999}})));
  assert.equal(writes.filter(x=>x.data.awarded).length,1,'Repeated requests award exactly once');
  assert.equal((await api('/api/me',{token:friend.token})).data.summary.todayPoints,1);
  assert.equal((await api('/api/me',{token:owner.token})).data.summary.todayPoints,0,'Cannot write another user');
  assert.equal((await api('/api/actions/complete',{method:'POST',token:friend.token,body:{actionId:'invented',points:99}})).status,400);
  assert.equal((await api(`/api/groups/${group.id}/invite`,{method:'POST',token:friend.token,body:{}})).status,403);
  assert.equal((await api(`/api/groups/${group.id}/ranking`,{method:'PATCH',token:friend.token,body:{enabled:false}})).status,200);
  const board=await api(`/api/groups/${group.id}/board`,{token:owner.token});
  assert.equal(board.data.rows.length,1);assert.equal(board.headers.get('cache-control'),'no-store');
  assert.equal((await api('/api/me',{method:'DELETE',token:friend.token,body:{password:'incorrect'}})).status,401);
  assert.equal((await api('/api/me',{method:'DELETE',token:friend.token,body:{password:body.password}})).status,200);
  assert.equal((await api('/api/me',{token:friend.token})).status,401);
  assert.equal((await api('/data/club.sqlite')).status,404,'Database cannot be downloaded');
  assert.equal((await api('/server/service.mjs')).status,404,'Server source cannot be downloaded');
  const staticResponse=await fetch(base+'/');assert.equal(staticResponse.status,200);
  assert.match(await staticResponse.text(),/同行成长/);
  assert.match(staticResponse.headers.get('content-security-policy'),/script-src 'self'/);
  const bad=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(bad.status,400);
  const huge=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'x'.repeat(20000)})});assert.equal(huge.status,413);
  for(let i=0;i<21;i++)await api('/api/login',{method:'POST',body:{username:'absent',password:'incorrect'}});
  assert.equal((await api('/api/login',{method:'POST',body})).status,429,'Authentication is rate limited');
});
