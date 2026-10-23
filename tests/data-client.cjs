const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {formatRateLimits,mergeRateLimitsResponse,AppServerClient}=require('../agent.cjs');
const snapshot={limitId:'codex',planType:'plus',primary:{usedPercent:4,windowDurationMins:300},secondary:{usedPercent:16,windowDurationMins:10080}};
const old={accountId:'test-old',rateLimits:snapshot,rateLimitsByLimitId:{codex:snapshot}};
const readings=value=>formatRateLimits(value).rings?.map(r=>r.percent);
assert.equal(formatRateLimits(mergeRateLimitsResponse(old,{rateLimits:null})).percent,null);
assert.equal(formatRateLimits(mergeRateLimitsResponse(old,{rateLimitsByLimitId:{codex:null}})).percent,null);
assert.equal(formatRateLimits(mergeRateLimitsResponse(old,{rateLimitsByLimitId:null})).percent,null);
assert.deepEqual(readings({rateLimits:snapshot,rateLimitsByLimitId:{codex:{...snapshot,primary:{...snapshot.primary,usedPercent:80}}}}),[20,84]);
assert.deepEqual(readings(mergeRateLimitsResponse(old,{rateLimits:{primary:{usedPercent:80}}})),[20,84]);
assert.deepEqual(readings(mergeRateLimitsResponse(old,{rateLimitsByLimitId:{codex:{primary:{usedPercent:70}}}})),[30,84]);
assert.deepEqual(readings(mergeRateLimitsResponse(old,{rateLimits:{limitId:'reserve',primary:{usedPercent:100}}})),[96,84]);
assert.deepEqual(readings(mergeRateLimitsResponse(old,{accountId:'test-new',rateLimits:{planType:'plus',primary:{usedPercent:20,windowDurationMins:300}}})),[80,null]);
assert.equal(formatRateLimits(mergeRateLimitsResponse(old,{rateLimits:{planType:'pro',primary:{usedPercent:20,windowDurationMins:300}}})).percent,null);
for(const resetsAt of [null,undefined,-1,0,NaN,Infinity,1e100])assert.doesNotThrow(()=>formatRateLimits({rateLimits:{...snapshot,primary:{...snapshot.primary,resetsAt}}}));
for(const [remaining,tone] of [[100,'normal'],[51,'normal'],[50,'warning'],[10,'warning'],[9,'danger'],[0,'danger']]) {
  for(const planType of ['plus','pro','prolite']) {
    const value=formatRateLimits({rateLimits:{...snapshot,planType,primary:{...snapshot.primary,usedPercent:100-remaining},secondary:{...snapshot.secondary,usedPercent:100-remaining}}});
    assert.equal(value.tone,tone);
    if(value.rings)assert.deepEqual(value.rings.map(r=>r.tone),[tone,tone]);
  }
}
console.log('PASS null clearing, keyed precedence, delta updates, account/plan changes, reset validation and color boundaries');

(async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'badge-client-'));
  const fake=path.join(temp,'fake.cjs');
  // Every refresh deliberately omits fields; a later snapshot must never inherit them.
  fs.writeFileSync(fake,`const rl=require('node:readline').createInterface({input:process.stdin});let reads=0;rl.on('line',l=>{const m=JSON.parse(l);if(m.id==null)return;process.stdout.write('null\\ninvalid-json\\n');let result={};if(m.method==='account/rateLimits/read'){result=++reads===1?${JSON.stringify(old)}:reads===2?{rateLimits:{planType:'plus',primary:{usedPercent:25,windowDurationMins:300}}}:null;}process.stdout.write(JSON.stringify({id:m.id,result})+'\\n');});`);
  const client=new AppServerClient({command:process.execPath,args:[fake],requestTimeoutMs:1000});
  try {
    await client.start();
    assert.deepEqual(readings(client.rateLimits),[96,84]);
    await client.refresh();
    assert.deepEqual(readings(client.rateLimits),[75,null]);
    await client.refresh();
    assert.equal(formatRateLimits(client.rateLimits).percent,null);
    client.child.kill('SIGKILL');
    await new Promise(resolve=>client.once('server-exit',resolve));
    await assert.rejects(client.refresh());
    console.log('PASS real child process protocol: complete refresh replaces stale fields, malformed lines ignored, server exit handled');
  } finally {client.stop();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
