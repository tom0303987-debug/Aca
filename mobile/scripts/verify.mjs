import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=join(root,'test-results');
mkdirSync(out,{recursive:true});
let log=`Started: ${new Date().toISOString()}\nRuntime: ${process.version} | ${process.platform} ${process.arch}\n`;
const results=[];
function step(name,args){
  const run=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:120000,env:{...process.env,ACA_API_BASE:''}});
  const passed=run.status===0&&!run.error;
  const detail=`\n--- ${name}: ${passed?'PASS':'FAIL'} ---\n${run.stdout||''}${run.stderr||''}${run.error?run.error.message+'\n':''}`;
  process.stdout.write(detail);log+=detail;results.push({name,passed,exitCode:run.status});
}
if(Number(process.versions.node.split('.')[0])!==24){
  log+='FAIL: Node.js 24 is required.\n';results.push({name:'runtime',passed:false});
}else{
  step('SQLite runtime',['--input-type=module','-e',"import { DatabaseSync } from 'node:sqlite'; const db=new DatabaseSync(':memory:'); console.log(db.prepare('select sqlite_version() as version').get()); db.close();"]);
  step('Application tests',['--test',...readdirSync(join(root,'tests')).filter(x=>x.endsWith('.test.mjs')).sort().map(x=>join('tests',x))]);
  step('Web resource build',['scripts/build.mjs']);
  if(existsSync(join(root,'../tests/checkin.test.cjs')))step('V12 regression',['--test','../tests/checkin.test.cjs']);
}
const passed=results.every(x=>x.passed);
log+=`\nOverall: ${passed?'PASS':'FAIL'}\nScope: automated local tests only; browser, phone and app-store tests are not included.\n`;
writeFileSync(join(out,'latest.txt'),log);
writeFileSync(join(out,'latest.json'),JSON.stringify({finished:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,passed,results},null,2)+'\n');
console.log(log.split('\n').slice(-4).join('\n'));
console.log(`Report: ${join(out,'latest.txt')}`);
process.exitCode=passed?0:1;
