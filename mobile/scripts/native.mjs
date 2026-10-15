import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const platform=process.argv[2];
if(!['android','ios'].includes(platform))throw Error('Choose android or ios');
const cli=join(root,'node_modules/@capacitor/cli/bin/capacitor');
if(!existsSync(cli))throw Error('Run npm ci first to restore locked native build dependencies.');
for(const args of [[join(root,'scripts/build.mjs')],[cli,existsSync(join(root,platform))?'sync':'add',platform]]){
 const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',env:process.env});if(result.status!==0)process.exit(result.status||1);
}
