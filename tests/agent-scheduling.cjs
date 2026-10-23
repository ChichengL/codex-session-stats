const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const startup = deferred(), refresh = deferred();
let now = 0, tokenReads = 0, metricReads = 0, sizeReads = 0, scans = 0, starts = 0, refreshes = 0, interval, injector;
let metricReply = null, serial = 0;
const timeouts = new Map();
const hooks = {};
class FakeInjector {
  constructor() { injector = this; this.sessions = new Map([['local', {}]]); }
  async scan() { scans++; }
  async update(value) { this.currentValue = value; }
  stop() { this.sessions.clear(); }
}
class FakeClient extends EventEmitter {
  start() { starts++; return startup.promise; }
  refresh() { refreshes++; return refresh.promise; }
  stop() {}
}
const noop = () => {};
const sandbox = {
  process: { env: {}, argv: [], once: (name, fn) => hooks[name] = fn, stdout: { write: noop }, exit: noop },
  module: { exports: {} }, require: Object.assign(noop, { main: {} }),
  Date: { now: () => now },
  setInterval: fn => { interval = fn; return 1; }, clearInterval: noop,
  setTimeout: (fn, ms) => { const id = ++serial; timeouts.set(id, { fn, ms }); return id; }, clearTimeout: id => timeouts.delete(id),
  RendererInjector: FakeInjector, AppServerClient: FakeClient, ThreadTokenReader: class {}, ThreadMetricsReader: class {},
  ProjectSizeScanner: class { stop() {} }, refreshProjectSizes: async () => {sizeReads++;},
  measureDirectory: noop, measureDirectoryPortable: noop, measureProjectRoots: noop,
  refreshThreadTokens: async () => { tokenReads++; }, resolveCodexBin: () => 'fake',
  refreshThreadMetrics: async () => { metricReads++; return metricReply ? metricReply.promise : false; },
  unavailableValue: current => ({ ...current, stale: true }),
  installUsageBadge: noop, installProjectColors: noop, installProjectSizes: noop, installThreadTokens: noop,
  installThreadMetrics: noop, newThreadMetrics: noop, foldThreadMetrics: noop, threadMetricsSnapshot: noop,
  buildBootstrapScript: noop, formatRateLimits: noop, mergeRateLimitsResponse: noop, isMainWindow: noop
};
// log() constructs Date; expose both a real constructor and the controlled now().
sandbox.Date = class extends Date { static now() { return now; } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/agent-main.js'), 'utf8'), sandbox);
const flush = () => new Promise(resolve => setImmediate(resolve));
function takeMetrics() { assert.equal(timeouts.size, 1); const [id, timer] = timeouts.entries().next().value; timeouts.delete(id); return timer; }
(async () => {
  const running = sandbox.module.exports.main();
  try {
    await flush();
    assert.equal(tokenReads, 1);
    assert.equal(metricReads, 1);
    const quick = takeMetrics(); assert.equal(quick.ms, 500); now = 500; await quick.fn(); assert.equal(metricReads, 2);
    now = 5000; await interval(); await flush();
    assert.equal(tokenReads, 2, 'slow quota initialization must not block the next local Token refresh');
    assert.equal(starts, 1, 'quota requests must not overlap');
    startup.resolve(); await flush();
    now = 65000; await interval(); await flush();
    assert.equal(refreshes, 1);
    now = 70000; await interval(); await flush();
    assert.equal(tokenReads, 4, 'slow quota refresh must not block subsequent local reads');
    assert.equal(refreshes, 1);
    assert.equal(scans, 4);
    assert.equal(sizeReads, 4, 'slow quota refresh must not block folder size updates');
    assert.equal(metricReads, 2, 'the five-second scan must not duplicate the independent metrics refresh');
    metricReply = deferred();
    const held = takeMetrics().fn(); await flush(); assert.equal(metricReads, 3); assert.equal(timeouts.size, 0, 'no metrics timer may overlap a slow read');
    now = 70500; await interval(); assert.equal(tokenReads, 5, 'a slow metrics read must not block the original local tick');
    metricReply.resolve(true); await held; metricReply = null;
    const catchup = takeMetrics(); assert.equal(catchup.ms, 25); await catchup.fn();
    assert.equal(timeouts.values().next().value.ms, 500, 'EOF returns to the normal metrics cadence');
    refresh.resolve(); await flush();
    injector.sessions.clear(); now = 75000; await interval();
    assert.equal(injector.currentValue.stale, true);
    injector.sessions.set('local', {}); metricReply = deferred();
    const stopping = takeMetrics().fn(); await flush(); hooks.SIGTERM(); metricReply.resolve(false); await stopping;
    assert.equal(timeouts.size, 0, 'shutdown must not rearm an in-flight metrics timer'); metricReply = null;
    console.log('PASS independent 500ms metrics, 25ms backlog catch-up, non-overlap and shutdown; quota/scan isolation and disconnect cleanup');
  } finally { startup.resolve(); refresh.resolve(); await flush(); hooks.SIGTERM?.(); await running; }
})().catch(error => { console.error(error); process.exitCode = 1; });
