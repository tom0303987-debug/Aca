import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AppError } from './service.mjs';

const webRoot = new URL('../web/',import.meta.url);
const files = {
  '/': ['index.html','text/html; charset=utf-8'],
  '/index.html': ['index.html','text/html; charset=utf-8'],
  '/app.css': ['app.css','text/css; charset=utf-8'],
  '/app.js': ['app.js','text/javascript; charset=utf-8'],
  '/config.js': ['config.js','text/javascript; charset=utf-8'],
  '/privacy.html': ['privacy.html','text/html; charset=utf-8'],
  '/icon.svg': ['icon.svg','image/svg+xml']
};
const securityHeaders = {
  'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY', 'Referrer-Policy':'no-referrer',
  'Cache-Control':'no-store', 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
};
function json(res,status,data) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data)); }
async function readJSON(req) {
  if(!req.headers['content-type']?.startsWith('application/json'))throw new AppError(415,'JSON_REQUIRED','请求必须使用 JSON');
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>16384)throw new AppError(413,'BODY_TOO_LARGE','请求内容过大');chunks.push(chunk);}
  try{const value=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}
  catch{throw new AppError(400,'BAD_JSON','请求内容格式不正确');}
}

export function createAppServer(service) {
  const buckets=new Map();let authInFlight=0;
  function limit(key,count,windowMs) {
    const now=Date.now();let entry=buckets.get(key);
    if(!entry||now>=entry.until){entry={count:0,until:now+windowMs};buckets.set(key,entry);}
    if(++entry.count>count)throw new AppError(429,'RATE_LIMITED','操作过于频繁，请稍后重试');
    if(buckets.size>10000)for(const [k,v] of buckets){if(v.until<=now)buckets.delete(k);}
  }
  const server=createServer(async(req,res)=>{
    for(const [key,value] of Object.entries(securityHeaders))res.setHeader(key,value);
    try {
      // Development server intentionally accepts only loopback hosts; no public deployment by accident.
      const url=new URL(req.url,'http://'+req.headers.host);
      if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new AppError(403,'LOCAL_ONLY','此开发服务器仅允许本机访问');
      if(req.headers.origin&&req.headers.origin!==url.origin)throw new AppError(403,'ORIGIN_DENIED','不允许此来源访问开发接口');
      if(!url.pathname.startsWith('/api/')) {
        if(req.method!=='GET')throw new AppError(405,'METHOD_NOT_ALLOWED','不支持此操作');
        const file=files[url.pathname];
        if(!file)throw new AppError(404,'NOT_FOUND','页面不存在');
        const bytes=await readFile(fileURLToPath(new URL(file[0],webRoot)));
        res.writeHead(200,{'Content-Type':file[1]});res.end(bytes);return;
      }
      const ip=req.socket.remoteAddress||'local';limit('ip:'+ip,240,60000);
      const method=req.method,path=url.pathname;
      if(path==='/api/health'&&method==='GET'){json(res,200,{ok:true,mode:'local-development',version:'0.1.0'});return;}
      if((path==='/api/register'||path==='/api/login')&&method==='POST') {
        limit('auth:'+ip,20,15*60000);
        if(authInFlight>=4)throw new AppError(429,'AUTH_BUSY','登录服务繁忙，请稍后重试');
        const body=await readJSON(req);authInFlight++;
        try{json(res,path==='/api/register'?201:200,await service[path==='/api/register'?'register':'login'](body));}
        finally{authInFlight--;}
        return;
      }
      const value=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):'';
      const user=service.authenticate(value);limit('user:'+user.id,120,60000);
      const body=['POST','PATCH','PUT','DELETE'].includes(method)?await readJSON(req):{};
      let result;
      if(path==='/api/me'&&method==='GET')result={user,summary:service.summary(user.id)};
      else if(path==='/api/logout'&&method==='POST')result=service.logout(value);
      else if(path==='/api/me/password'&&method==='POST')result=await service.changePassword(user.id,body);
      else if(path==='/api/me/export'&&method==='GET')result=service.exportAccount(user.id);
      else if(path==='/api/me'&&method==='DELETE')result=await service.deleteAccount(user.id,body.password);
      else if(path==='/api/checkin'&&method==='POST')result=service.record(user.id,'checkin','daily');
      else if(path==='/api/actions/complete'&&method==='POST')result=service.record(user.id,'action',body.actionId);
      else if(path==='/api/groups'&&method==='POST')result=service.createGroup(user.id,body);
      else if(path==='/api/invites/preview'&&method==='POST')result=service.previewInvite(body.code);
      else if(path==='/api/groups/join'&&method==='POST')result=service.join(user.id,body);
      else {
        const match=path.match(/^\/api\/groups\/([a-zA-Z0-9-]{36})\/(board|invite|ranking|members|owner|leave)(?:\/([a-zA-Z0-9-]{36}))?$/);
        if(!match)throw new AppError(404,'NOT_FOUND','接口不存在');
        const [,groupId,action,targetId]=match;
        if(action==='board'&&method==='GET')result=service.board(user.id,groupId);
        else if(action==='invite'&&method==='POST')result=service.newInvite(user.id,groupId);
        else if(action==='invite'&&method==='DELETE')result=service.revokeInvite(user.id,groupId);
        else if(action==='ranking'&&method==='PATCH')result=service.setRanking(user.id,groupId,body.enabled);
        else if(action==='members'&&method==='GET'&&!targetId)result={members:service.members(user.id,groupId)};
        else if(action==='members'&&method==='DELETE'&&targetId)result=service.removeMember(user.id,groupId,targetId);
        else if(action==='owner'&&method==='POST')result=service.transfer(user.id,groupId,body.userId);
        else if(action==='leave'&&method==='POST')result=service.leave(user.id,groupId);
        else throw new AppError(404,'NOT_FOUND','接口不存在');
      }
      json(res,200,result);
    }catch(error){
      const status=error instanceof AppError?error.status:500;
      json(res,status,{error:{code:error instanceof AppError?error.code:'INTERNAL_ERROR',message:status===500?'服务暂时异常，请稍后重试':error.message}});
    }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  return server;
}
