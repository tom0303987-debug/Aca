import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=join(process.env.ACA_DATA_DIR?resolve(process.env.ACA_DATA_DIR):join(root,'data'),'club.sqlite');
if(!existsSync(source))throw Error('Database does not exist; start the app before backing up.');
const dir=process.argv[2]?resolve(process.argv[2]):join(root,'backups');
mkdirSync(dir,{recursive:true,mode:0o700});
const target=join(dir,'club-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
const db=new DatabaseSync(source,{readOnly:true});
try{await backup(db,target);chmodSync(target,0o600);console.log('Backup saved: '+target);}finally{db.close();}
