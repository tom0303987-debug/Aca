import { mkdir, readdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=join(root,'dist');
const apiBase=(process.env.ACA_API_BASE||'').replace(/\/$/,'');
if(apiBase){const url=new URL(apiBase);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('ACA_API_BASE must be an HTTPS origin without credentials, path, query or fragment.');}
await mkdir(output,{recursive:true});
for(const file of await readdir(join(root,'web')))await copyFile(join(root,'web',file),join(output,file));
await writeFile(join(output,'config.js'),`window.ACA_CONFIG=Object.freeze(${JSON.stringify({apiBase,mode:apiBase?'backend-configured-unverified':'native-backend-not-configured'})});\n`);
const config=JSON.parse(await readFile(join(root,'capacitor.config.json'),'utf8'));
if(config.webDir!=='dist')throw Error('Native webDir must point to built assets');
console.log(`Web assets prepared: ${output}\n${apiBase?'Configured API origin: '+apiBase:'No native API configured. This is a development bundle, not a working remote app or signed install package.'}`);

// The official Capacitor runtime registers native plugin proxies. Browser hosting uses native.js's web fallback.
await copyFile(join(root,'node_modules/@capacitor/core/dist/capacitor.js'),join(output,'capacitor-runtime.js'));
const html=await readFile(join(output,'index.html'),'utf8');
await writeFile(join(output,'index.html'),html.replace('<script src="./native.js"','<script src="./capacitor-runtime.js" defer></script>\n  <script src="./native.js"'));
