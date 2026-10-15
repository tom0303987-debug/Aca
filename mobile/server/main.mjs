import { mkdirSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from './service.mjs';
import { createAppServer } from './http.mjs';

const dataDirectory=process.env.ACA_DATA_DIR?resolve(process.env.ACA_DATA_DIR):fileURLToPath(new URL('../data/',import.meta.url));
mkdirSync(dataDirectory,{recursive:true,mode:0o700});
const filename=join(dataDirectory,'club.sqlite');
const service=createService({filename});
try{chmodSync(filename,0o600);}catch{}
const port=Number(process.env.ACA_DEV_PORT||8787);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('ACA_DEV_PORT must be 1024–65535');
if(process.env.ACA_PUBLIC_ORIGIN&&(!process.env.ACA_REGISTRATION_CODE||process.env.ACA_REGISTRATION_CODE.length<12))throw Error('Hosted mode requires ACA_REGISTRATION_CODE (at least 12 characters)');
const server=createAppServer(service,{publicOrigin:process.env.ACA_PUBLIC_ORIGIN||'',nativeOrigins:(process.env.ACA_NATIVE_ORIGINS||'').split(',').filter(Boolean),registrationCode:process.env.ACA_REGISTRATION_CODE||'',trustProxy:process.env.ACA_TRUST_PROXY==='true'});
server.listen(port,process.env.ACA_BIND||'127.0.0.1',()=>console.log(`同行成长整合版 2.0：http://127.0.0.1:${port}\n${process.env.ACA_PUBLIC_ORIGIN?'外部地址：'+process.env.ACA_PUBLIC_ORIGIN:'本机开发模式；请使用测试数据。'}`));
function stop(){server.close(()=>{service.close();process.exit(0);});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
