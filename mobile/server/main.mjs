import { mkdirSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createService } from './service.mjs';
import { createAppServer } from './http.mjs';

const dataDirectory=fileURLToPath(new URL('../data/',import.meta.url));
mkdirSync(dataDirectory,{recursive:true,mode:0o700});
const filename=dataDirectory+'club.sqlite';
const service=createService({filename});
try{chmodSync(filename,0o600);}catch{}
const port=Number(process.env.ACA_DEV_PORT||8787);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('ACA_DEV_PORT must be 1024–65535');
const server=createAppServer(service);
server.listen(port,'127.0.0.1',()=>console.log(`同行成长开发版：http://127.0.0.1:${port}\n仅本机可访问。请用两个独立浏览器窗口测试不同账号；不要填写真实隐私数据。`));
function stop(){server.close(()=>{service.close();process.exit(0);});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
