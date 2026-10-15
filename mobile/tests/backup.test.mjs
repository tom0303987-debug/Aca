import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createService } from '../server/service.mjs';

test('live backup restores login and unified growth from an independent SQLite file',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'growth-backup-'));let s,restored;
 try{
  s=createService({filename:join(dir,'club.sqlite')});const account=await s.register({username:'backupuser',nickname:'备份',password:'backup-password-123',accepted:true});s.record(account.user.id,'checkin','daily');
  const child=spawn(process.execPath,[fileURLToPath(new URL('../scripts/backup.mjs',import.meta.url)),join(dir,'backups')],{env:{...process.env,ACA_DATA_DIR:dir},stdio:'pipe'});let output='';child.stderr.on('data',x=>output+=x);const [code]=await once(child,'exit');assert.equal(code,0,output);
  const file=readdirSync(join(dir,'backups'))[0];restored=createService({filename:join(dir,'backups',file)});const login=await restored.login({username:'backupuser',password:'backup-password-123'});assert.equal(restored.growth.get(login.user.id).data.records.length,1);assert.equal(restored.summary(login.user.id).todayPoints,1);
 }finally{s?.close();restored?.close();rmSync(dir,{recursive:true,force:true});}
});
