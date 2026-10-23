const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {acquireLock}=require('../macos/install-lock.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'session-stats-lock-')),directory=path.join(temp,'lock');
try{
  const unlock=acquireLock(directory);assert.equal(typeof unlock,'function');
  assert.equal(acquireLock(directory),null);unlock();assert.equal(fs.existsSync(directory),false);
  fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'owner.json'),JSON.stringify({pid:123,startedAt:Date.now()}));
  acquireLock(directory,{isAlive:()=>false})();assert.equal(fs.existsSync(directory),false);
  fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'owner.json'),'invalid');
  assert.equal(acquireLock(directory),null);fs.rmSync(directory,{recursive:true});
  fs.symlinkSync(temp,directory);assert.throws(()=>acquireLock(directory),/不能是链接/);
  console.log('PASS live, stale and malformed install locks and symlink rejection');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
