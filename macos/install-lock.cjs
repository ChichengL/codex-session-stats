'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function acquireLock(directory,{pid=process.pid,now=Date.now,isAlive=p=>{try{process.kill(p,0);return true;}catch(e){return e.code!=='ESRCH';}}}={}){
  fs.mkdirSync(path.dirname(directory),{recursive:true,mode:0o700});
  for(let attempt=0;attempt<2;attempt++){
    try{fs.mkdirSync(directory,{mode:0o700});fs.writeFileSync(path.join(directory,'owner.json'),JSON.stringify({pid,startedAt:now()}),{mode:0o600,flag:'wx'});return ()=>fs.rmSync(directory,{recursive:true,force:true});}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      if(fs.lstatSync(directory).isSymbolicLink())throw Error('安装锁目录不能是链接');
      let owner;try{owner=JSON.parse(fs.readFileSync(path.join(directory,'owner.json'),'utf8'));}catch{}
      const predatesBoot=Number.isFinite(owner?.startedAt)&&owner.startedAt<now()-os.uptime()*1000-10000;
      if(owner&&Number.isSafeInteger(owner.pid)&&owner.pid>0){if(!predatesBoot&&isAlive(owner.pid))return null;}
      else if(now()-fs.statSync(directory).mtimeMs<120000)return null;
      fs.rmSync(directory,{recursive:true,force:true});
    }
  }
  return null;
}
module.exports={acquireLock};
