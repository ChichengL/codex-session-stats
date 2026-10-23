const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { ThreadMetricsReader, refreshThreadMetrics } = require('../agent.cjs');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'badge-metrics-performance-'));
const ids = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'];
fs.mkdirSync(path.join(home, 'sessions'));
const files = ids.map(id => path.join(home, 'sessions', id + '.jsonl'));
const db = new DatabaseSync(path.join(home, 'state_5.sqlite'));
db.exec('CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT)');
const records = id => [
  { type: 'event_msg', payload: { type: 'task_started', turn_id: 'one', model_context_window: 10000 } },
  { type: 'token_usage_record', payload: { thread_id: id, turn_id: 'one', response_id: 'r1', turn_token_usage: { input_tokens: 1000, output_tokens: 500, total_tokens: 1500 }, thread_token_usage: { input_tokens: 1000, output_tokens: 500, total_tokens: 1500 } } },
  { type: 'event_msg', payload: { type: 'task_complete', turn_id: 'one', duration_ms: 10000, time_to_first_token_ms: 500 } }
].map(value => JSON.stringify(value) + '\n').join('');
fs.writeFileSync(files[0], '{"type":"response_item","payload":{"text":"');
fs.appendFileSync(files[0], Buffer.alloc(20 * 1024 * 1024, 120));
fs.appendFileSync(files[0], '"}}\n' + records(ids[0]));
fs.writeFileSync(files[1], records(ids[1]));
for (let n = 0; n < ids.length; n++) db.prepare('INSERT INTO threads VALUES (?, ?)').run(ids[n], files[n]);
const frames = [[], []];
const sessions = ids.map((id, n) => ({ evaluate: async expression => {
  if (expression.includes('requestedIds()')) return { result: { value: [id] } };
  const prefix = 'window.__codexThreadMetrics?.update(';
  assert.ok(expression.startsWith(prefix) && expression.endsWith(')'));
  frames[n].push(JSON.parse(expression.slice(prefix.length, -1)));
} }));
const injector = { sessions: new Map(sessions.map((session, n) => [n, session])) };
(async () => {
  let heartbeat;
  try {
    const reader = new ThreadMetricsReader({ home });
    let heartbeats = 0, batches = 0;
    heartbeat = setInterval(() => heartbeats++, 1);
    const started = performance.now();
    while (await refreshThreadMetrics(injector, reader)) {
      batches++; assert.ok(batches < 100);
      assert.equal(frames[1][0].complete, true, 'small windows must not wait for the large log to finish');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const coldMs = performance.now() - started;
    assert.ok(coldMs < 2000, `20 MiB cold read took ${coldMs}ms`);
    assert.ok(heartbeats > 0, 'backfill must yield the event loop');
    assert.equal(frames[0].at(-1).complete, true); assert.equal(frames[0].at(-1).totalTokens, 1500);
    assert.equal(frames[0].at(-1).invalidateCached, false);
    assert.ok(frames[0].filter(frame => !frame.complete).every(frame => frame.totalTokens === undefined && frame.invalidateCached));
    fs.appendFileSync(files[0], '{"type":"event_msg"');
    assert.equal(await refreshThreadMetrics(injector, reader), false, 'EOF with a partial line must not request a busy backfill loop');
    assert.equal(frames[0].at(-1).invalidateCached, false, 'an ordinary unfinished append keeps the previous baseline valid');
    const offset = reader.files.get(ids[0]).offset;
    fs.appendFileSync(files[0], '}\n');
    injector.sessions.delete(0); await refreshThreadMetrics(injector, reader);
    assert.equal(reader.files.get(ids[0]).offset, offset, 'unrequested sessions must not continue scanning');
    let emptyReads = 0;
    await refreshThreadMetrics({ sessions: new Map() }, { read: () => { emptyReads++; } }); assert.equal(emptyReads, 0);
    console.log(JSON.stringify({ result: 'PASS', fixture: '20 MiB skipped body plus metric records in a temporary log', coldMs: Math.round(coldMs * 10) / 10, batches: batches + 1, eventLoopHeartbeats: heartbeats, previousScheduleMinimumMs: (Math.ceil(fs.statSync(files[0]).size / (1024 * 1024)) - 1) * 5000 }));
  } finally { clearInterval(heartbeat); db.close(); fs.rmSync(home, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
