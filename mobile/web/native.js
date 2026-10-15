'use strict';
(() => {
  const cap=window.Capacitor;
  const isNative=Boolean(cap?.isNativePlatform?.());
  const plugins=new Map();
  const plugin=name=>{if(!plugins.has(name))plugins.set(name,cap.registerPlugin(name));return plugins.get(name);};
  const session=isNative?plugin('NativeSession'):null;
  let queue=Promise.resolve();
  // Serialize storage mutations: a late login write must never undo a logout.
  const serialize=fn=>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;};
  window.MobileBridge={
    isNative,
    getToken:()=>isNative?serialize(async()=>(await session.get()).token||''):Promise.resolve(''),
    saveToken:token=>isNative?serialize(()=>session.set({token})):Promise.resolve(),
    clearToken:()=>isNative?serialize(()=>session.clear()):Promise.resolve(),
    copyText:text=>isNative?plugin('Clipboard').write({string:text}):navigator.clipboard.writeText(text),
    async exportData(data,date){
      const name=`Upup有目标-${date}.json`,content=JSON.stringify(data,null,2);
      if(isNative){
        const fs=plugin('Filesystem');
        const file=await fs.writeFile({path:'exports/'+name,data:content,directory:'CACHE',encoding:'utf8',recursive:true});
        await plugin('Share').share({title:'导出个人记录',files:[file.uri],dialogTitle:'保存或分享备份'});
        // Share targets may read asynchronously. Cache is cleared on next app launch.
      }else{
        const url=URL.createObjectURL(new Blob([content],{type:'application/json'})),a=document.createElement('a');
        a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
    },
    async init({back,resume}){
      if(!isNative)return;
      document.documentElement.classList.add('native-app');
      await plugin('Filesystem').rmdir({path:'exports',directory:'CACHE',recursive:true}).catch(()=>{});
      const app=plugin('App');
      await app.addListener('backButton',()=>back(()=>app.exitApp()));
      await app.addListener('appStateChange',({isActive})=>{if(isActive)resume();});
    }
  };
})();
