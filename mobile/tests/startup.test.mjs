import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root=fileURLToPath(new URL('../',import.meta.url));
test('actual server entry point (Windows launcher on Windows) starts with isolated data',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'aca startup '));
  let child;
  try{
    for(const name of ['server','web','START-WINDOWS.cmd'])cpSync(join(root,name),join(dir,name),{recursive:true});
    const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
    const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
    const env={...process.env,ACA_DEV_PORT:String(port),ACA_NONINTERACTIVE:'1'};
    // Ensure the same tested Node runtime is selected even if the machine has other versions.
    const pathKey=Object.keys(env).find(k=>k.toLowerCase()==='path')||'PATH';
    env[pathKey]=dirname(process.execPath)+(process.platform==='win32'?';':':')+(env[pathKey]||'');
    delete env.ACA_NODE_REL;
    child=process.platform==='win32'
      ?spawn(process.env.ComSpec||'cmd.exe',['/d','/c','START-WINDOWS.cmd'],{cwd:dir,env,stdio:['ignore','pipe','pipe']})
      :spawn(process.execPath,['server/main.mjs'],{cwd:dir,env,stdio:['ignore','pipe','pipe']});
    let output='',spawnError;
    child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',e=>spawnError=e);
    let response;
    for(let i=0;i<100;i++){
      if(spawnError)throw spawnError;
      if(child.exitCode!==null)throw Error('Startup exited: '+output);
      try{response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(500)});if(response.ok)break;}catch{}
      await delay(100);
    }
    assert.equal(response?.status,200,output);
    assert.ok(existsSync(join(dir,'data/club.sqlite')),'Startup creates SQLite in app directory');
    const page=await fetch(`http://127.0.0.1:${port}/`);
    assert.match(await page.text(),/同行成长/);
  }finally{
    if(child?.pid&&child.exitCode===null){
      const exited=once(child,'exit');
      if(process.platform==='win32')spawnSync('taskkill',['/pid',String(child.pid),'/t','/f']);else child.kill('SIGTERM');
      await exited;
    }
    rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
