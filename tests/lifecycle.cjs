// Install and migrate in a disposable home; launchctl, Dock and app activation are isolated.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'badge-install-'));
const installDir=path.join(temp,'Library/Application Support/CodexSessionStats');
const jobs=new Set(),messages=[],calls=[];
let failJob='',failCopy=false;
const testFs={...fs,copyFileSync(source,dest,...args){if(failCopy&&dest===path.join(installDir,'startup-helper/bridge')){failCopy=false;throw Error('simulated helper write failure');}return fs.copyFileSync(source,dest,...args);}};
const execFileSync=(bin,args,options)=>{
  calls.push([bin,...args]);
  if(bin==='/bin/launchctl'){
    const job=args[0]==='bootstrap'?path.basename(args[2],'.plist'):args[1].split('/').at(-1);
    if(args[0]==='print'){if(jobs.has(job))return 'state = running';throw Error('not loaded');}
    if(args[0]==='bootout'){jobs.delete(job);return '';}
    if(args[0]==='bootstrap'){
      if(failJob===job){failJob='';throw Error('simulated bootstrap failure');}
      assert.ok(fs.existsSync(args[2]));jobs.add(job);
      if(job==='com.codexsessionstats.startup'){
        const receipt=path.join(installDir,'startup-helper/state.json');let old={};try{old=JSON.parse(fs.readFileSync(receipt,'utf8'));}catch{}
        fs.writeFileSync(receipt,JSON.stringify({...old,event:'watching',updatedAt:Date.now()}));
      }
      return '';
    }
    throw Error('unexpected launchctl action');
  }
  if(bin.endsWith('/bridge')||bin.endsWith('/macos-startup-bridge'))return JSON.stringify({apps:[]});
  assert.ok(!['/usr/bin/open','/usr/bin/osascript'].includes(bin),'installation must not activate or quit the client');
  return cp.execFileSync(bin,args,options);
};
class FailedSocket{constructor(){this.events={};setImmediate(()=>this.events.error?.());}addEventListener(n,h){this.events[n]=h;}close(){}}
const sandbox={module:{exports:{}},__dirname:root,process,Buffer,URL,setTimeout,clearTimeout,AbortSignal,WebSocket:FailedSocket,
  console:{log:s=>messages.push(s),warn:s=>messages.push(s)},fetch:async()=>({ok:true,json:async()=>[{type:'page',url:'app://-/index.html',webSocketDebuggerUrl:'ws://127.0.0.1/unreachable'}]}),
  require:id=>id==='node:fs'?testFs:id==='node:os'?{...os,homedir:()=>temp}:id==='node:child_process'?{...cp,execFileSync}:id==='./agent.cjs'?require('../agent.cjs'):id==='./macos/install-lock.cjs'?require('../macos/install-lock.cjs'):require(id)};
vm.runInNewContext(fs.readFileSync(path.join(root,'manage.cjs'),'utf8'),sandbox,{filename:'manage.cjs'});
const manager=sandbox.module.exports;
(async()=>{try{
  await manager.uninstall();assert.equal(calls.length,0,'uninstalling an absent extension must not touch another extension UI');
  const oldAgent=path.join(temp,'Library/Application Support/CodexUsageBadge/agent.cjs');
  fs.mkdirSync(path.dirname(oldAgent),{recursive:true});fs.writeFileSync(oldAgent,'existing plugin');
  await assert.rejects(manager.install(),/codex-usage-badge/);
  assert.equal(fs.readFileSync(oldAgent,'utf8'),'existing plugin');assert.equal(jobs.size,0);fs.rmSync(path.dirname(oldAgent),{recursive:true});
  for(const oldJob of ['com.codexusagebadge.agent','com.codexusagebadge.startup']){
    jobs.add(oldJob);await assert.rejects(manager.install(),/codex-usage-badge/);assert.deepEqual([...jobs],[oldJob]);jobs.delete(oldJob);
  }
  fs.symlinkSync(temp,installDir);await assert.rejects(manager.install(),/符号链接/);fs.unlinkSync(installDir);
  const unrelated=path.join(temp,'unrelated');fs.mkdirSync(unrelated);fs.writeFileSync(path.join(unrelated,'controller.cjs'),'keep unrelated contents');
  for(const name of ['startup-helper','macos']){
    fs.mkdirSync(installDir);fs.symlinkSync(unrelated,path.join(installDir,name));
    const before=calls.length;await assert.rejects(manager.install(),/子目录不能是符号链接/);
    assert.equal(fs.readFileSync(path.join(unrelated,'controller.cjs'),'utf8'),'keep unrelated contents');
    assert.ok(!calls.slice(before).some(call=>call[0]==='/bin/launchctl'&&call[1]==='bootout'));fs.rmSync(installDir,{recursive:true});
  }
  fs.mkdirSync(installDir);fs.writeFileSync(path.join(installDir,'unrelated.txt'),'keep');
  const beforeForeignUninstall=calls.length;await assert.rejects(manager.uninstall(),/归属不明/);assert.equal(calls.length,beforeForeignUninstall);
  await assert.rejects(manager.install(),/归属不明/);assert.ok(!calls.slice(beforeForeignUninstall).some(call=>call[0]==='/bin/launchctl'&&call[1]==='bootout'));
  fs.writeFileSync(path.join(installDir,'installed-version.json'),JSON.stringify({product:'other-extension'}));
  await assert.rejects(manager.uninstall(),/归属不明/);await assert.rejects(manager.install(),/归属不明/);
  assert.equal(fs.readFileSync(path.join(installDir,'unrelated.txt'),'utf8'),'keep');fs.rmSync(installDir,{recursive:true});
  failCopy=true;await assert.rejects(manager.install(),/已恢复安装前的程序文件/);
  assert.equal(jobs.size,0);assert.equal(fs.existsSync(installDir),false);
  await manager.install();await manager.install();
  assert.equal(jobs.size,2);assert.ok(!calls.some(call=>call.some(value=>String(value).includes('updater'))));
  assert.equal(JSON.parse(fs.readFileSync(path.join(installDir,'installed-version.json'),'utf8')).version,require('../package.json').version);
  const agent=path.join(installDir,'agent.cjs'),before=fs.readFileSync(agent,'utf8')+'\n// old installed agent\n';
  fs.writeFileSync(agent,before);
  const receipt=path.join(installDir,'startup-helper/state.json');fs.writeFileSync(receipt,JSON.stringify({lastAttemptAt:123,event:'reopened'}));
  for(const job of ['com.codexsessionstats.agent','com.codexsessionstats.startup']){
    failJob=job;await assert.rejects(manager.install(),/已恢复安装前的程序文件/);
    assert.equal(jobs.size,2);assert.equal(fs.readFileSync(agent,'utf8'),before);
    assert.equal(JSON.parse(fs.readFileSync(receipt,'utf8')).lastAttemptAt,123);
  }
  await manager.uninstall();assert.equal(jobs.size,0);assert.equal(fs.existsSync(installDir),false);
  assert.ok(messages.some(s=>s.includes('部分窗口暂不可连接')));
  const afterUninstall=calls.length;await manager.uninstall();assert.equal(calls.length,afterUninstall);
  assert.ok(manager.startupConfig().ProgramArguments.at(-1).endsWith('startup-helper/watch.cjs'));
  console.log('PASS independent install, original-plugin conflict refusal, symlink rejection, two-service rollback, cooldown preservation, offline uninstall and absent-install isolation');
}finally{fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
