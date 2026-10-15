import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source=readFileSync(new URL('../web/native.js',import.meta.url),'utf8');
function bridge(plugins){const window={Capacitor:plugins?{isNativePlatform:()=>true,registerPlugin:name=>plugins[name]}:undefined};runInNewContext(source,{window,navigator:{clipboard:{writeText:async()=>{}}}});return window.MobileBridge;}
test('browser loads without native dependencies or credential persistence',async()=>{
  const mobile=bridge();assert.equal(mobile.isNative,false);assert.equal(await mobile.getToken(),'');await mobile.saveToken('ignored');await mobile.clearToken();
});
test('logout waits for pending secure write and cannot restore the old session',async()=>{
  let token='',release;const gate=new Promise(resolve=>{release=resolve;});
  const mobile=bridge({NativeSession:{async set(value){await gate;token=value.token;},async clear(){token='';},async get(){return {token};}}});
  const save=mobile.saveToken('old-session'),clear=mobile.clearToken(),get=mobile.getToken();release();await Promise.all([save,clear]);assert.equal(await get,'');
});
test('a failed secure write is reported and does not prevent later logout or login',async()=>{
  let token='',fail=true;
  const mobile=bridge({NativeSession:{async set(value){if(fail)throw Error('locked');token=value.token;},async clear(){token='';},async get(){return {token};}}});
  await assert.rejects(mobile.saveToken('a'),/locked/);await mobile.clearToken();fail=false;await mobile.saveToken('b');assert.equal(await mobile.getToken(),'b');
});
test('native export uses a private cache URI and the system share sheet',async()=>{
  const calls=[];const mobile=bridge({NativeSession:{},Filesystem:{async writeFile(value){calls.push(value);return {uri:'file:///private/cache/exports/test.json'};}},Share:{async share(value){calls.push(value);}}});
  await mobile.exportData({records:[1]},'2026-10-15');assert.equal(calls[0].directory,'CACHE');assert.equal(calls[0].path,'exports/Upup有目标-2026-10-15.json');assert.equal(JSON.parse(calls[0].data).records[0],1);assert.equal(calls[1].files[0],'file:///private/cache/exports/test.json');
});
