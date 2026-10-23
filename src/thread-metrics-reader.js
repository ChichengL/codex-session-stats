function metricUsage(value) {
  if (!value || !['input_tokens', 'output_tokens', 'total_tokens'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)) return null;
  if (value.total_tokens !== value.input_tokens + value.output_tokens) return null;
  const cached = value.cached_input_tokens;
  if (cached !== undefined && (!Number.isSafeInteger(cached) || cached < 0 || cached > value.input_tokens)) return null;
  return { input: value.input_tokens, output: value.output_tokens, total: value.total_tokens, cached: cached ?? null };
}
function newThreadMetrics(id) {
  return { id, turns: new Map(), current: null, completed: null, total: null, context: null, window: null };
}
function foldThreadMetrics(state, event) {
  const p = event?.payload;
  if (!p || typeof p !== 'object') return;
  const turn = id => {
    if (typeof id !== 'string' || !id.length || id.length > 200) return null;
    if (!state.turns.has(id)) {
      if (state.turns.size >= 10000) throw new Error('Too many turns');
      state.turns.set(id, { started: false, responses: new Set(), usage: null, duration: null, ttft: null });
    }
    return state.turns.get(id);
  };
  if (event.type === 'token_usage_record') {
    if (p.thread_id !== state.id) return;
    const current = turn(p.turn_id);
    if (!current || typeof p.response_id !== 'string' || !p.response_id.length || p.response_id.length > 200 || current.responses.has(p.response_id)) return;
    if (current.responses.size >= 10000) throw new Error('Too many responses');
    current.responses.add(p.response_id);
    current.usage = metricUsage(p.turn_token_usage);
    state.total = metricUsage(p.thread_token_usage);
  } else if (event.type === 'event_msg' && p.type === 'task_started') {
    const current = turn(p.turn_id);
    if (current && !current.started) { current.started = true; state.current = p.turn_id; }
    if (Number.isSafeInteger(p.model_context_window) && p.model_context_window > 0) {
      if (state.window !== p.model_context_window) state.context = null;
      state.window = p.model_context_window;
    }
  } else if (event.type === 'event_msg' && p.type === 'task_complete') {
    const current = turn(p.turn_id);
    if (current && Number.isFinite(p.duration_ms) && p.duration_ms > 0) {
      if (current.duration === null) state.completed = p.turn_id;
      current.duration = p.duration_ms;
      current.ttft = Number.isFinite(p.time_to_first_token_ms) && p.time_to_first_token_ms >= 0 && p.time_to_first_token_ms <= p.duration_ms ? p.time_to_first_token_ms : null;
    }
  } else if (event.type === 'event_msg' && p.type === 'token_count') {
    if (p.info === null || p.info === undefined) return;
    const last = p.info?.last_token_usage?.total_tokens;
    const window = p.info?.model_context_window;
    if (Number.isSafeInteger(last) && last >= 0 && Number.isSafeInteger(window) && window > 0) {
      state.context = last; state.window = window;
    } else { state.context = null; state.window = null; }
  }
}
function threadMetricsSnapshot(state) {
  const current = state.turns.get(state.current);
  const completed = state.turns.get(state.completed);
  const speed = completed?.usage && completed.duration ? completed.usage.output * 1000 / completed.duration : null;
  return {
    rounds: state.current ? [...state.turns.values()].filter(turn => turn.started).length : null,
    steps: current?.responses.size ?? null,
    totalTokens: state.total?.total ?? null,
    inputTokens: state.total?.input ?? null,
    cachedInputTokens: state.total?.cached ?? null,
    outputTokens: state.total?.output ?? null,
    cachePercent: state.total?.input > 0 && state.total.cached !== null ? 100 * state.total.cached / state.total.input : null,
    speed: Number.isFinite(speed) && speed >= 0 ? speed : null,
    durationMs: completed?.duration ?? null,
    ttftMs: completed?.ttft ?? null,
    previousSpeed: state.completed !== state.current,
    contextTokens: state.context,
    contextWindow: state.window,
    contextPercent: state.context !== null && state.window > 0 ? 100 * state.context / state.window : null
  };
}
function skippableMetricLine(bytes) {
  // shortcut: 仅识别固定 JSONL 头部的大块正文；日志封装变化时需适配前缀。
  const prefix = bytes.subarray(0, 1024).toString('utf8');
  const header = /^\s*\{\s*(?:"timestamp"\s*:\s*"[^"\\]*"\s*,\s*)?(?:"ordinal"\s*:\s*(?:0|[1-9]\d*)\s*,\s*)?"type"\s*:\s*"(response_item|compacted|event_msg)"\s*,\s*"payload"\s*:\s*\{/.exec(prefix);
  return !!header && (header[1] !== 'event_msg' || /^\s*"type"\s*:\s*"item_completed"\s*[,}]/.test(prefix.slice(header[0].length)));
}
class ThreadMetricsReader {
  constructor({ home = process.env.CODEX_HOME || require('node:path').join(require('node:os').homedir(), '.codex') } = {}) {
    this.home = home; this.files = new Map();
  }
  read(ids) {
    const checkedAt = Date.now(), metrics = Object.create(null);
    const requested = [...new Set(ids)].filter(id => typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)).slice(0, 16);
    if (!requested.length) return { ok: true, metrics, checkedAt };
    let db;
    try {
      db = openThreadDatabase(this.home);
      const query = db.prepare(`SELECT id, rollout_path FROM threads WHERE id IN (${requested.map(() => '?').join(',')})`);
      for (const row of query.all(...requested)) {
        try { metrics[row.id] = this.readFile(row.id, row.rollout_path); }
        catch { this.files.delete(row.id); metrics[row.id] = { ok: false }; }
      }
      return { ok: true, metrics, checkedAt };
    } catch { return { ok: false, metrics, checkedAt }; }
    finally { try { db?.close(); } catch {} }
  }
  readFile(id, file) {
    const fs = require('node:fs'), path = require('node:path');
    const root = fs.realpathSync(path.join(this.home, 'sessions'));
    const resolved = fs.realpathSync(file);
    if (!resolved.startsWith(root + path.sep) || path.extname(resolved) !== '.jsonl') throw new Error('Rollout outside local sessions');
    const fd = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile()) throw new Error('Invalid rollout file');
      const sample = (offset, length) => {
        const bytes = Buffer.alloc(length);
        return bytes.subarray(0, length ? fs.readSync(fd, bytes, 0, length, offset) : 0);
      };
      let entry = this.files.get(id);
      // shortcut: 首部与已读边界抽样检测原地重写；允许任意中部编辑的日志需全量校验。
      const changed = entry && stat.size >= entry.offset && (!sample(0, entry.head.length).equals(entry.head) || !sample(entry.offset - entry.tail.length, entry.tail.length).equals(entry.tail));
      if (!entry || entry.file !== resolved || entry.ino !== stat.ino || entry.dev !== stat.dev || stat.size < entry.offset || changed || (stat.size === entry.offset && stat.mtimeMs !== entry.mtime)) {
        entry = { file: resolved, ino: stat.ino, dev: stat.dev, offset: 0, pending: Buffer.alloc(0), state: newThreadMetrics(id), dropped: false, skippingLine: false, hasComplete: false };
      }
      const chunk = Buffer.alloc(Math.min(1024 * 1024, stat.size - entry.offset));
      const bytes = chunk.length ? fs.readSync(fd, chunk, 0, chunk.length, entry.offset) : 0;
      entry.offset += bytes; entry.mtime = stat.mtimeMs;
      entry.head = sample(0, Math.min(256, entry.offset));
      entry.tail = sample(Math.max(0, entry.offset - 256), Math.min(256, entry.offset));
      const pending = Buffer.concat([entry.pending, chunk.subarray(0, bytes)]);
      let start = 0;
      for (let end = pending.indexOf(10); end >= 0; end = pending.indexOf(10, start)) {
        const line = pending.subarray(start, end); start = end + 1;
        if (entry.skippingLine) { entry.skippingLine = false; continue; }
        if (line.length > 1024 * 1024) { if (!skippableMetricLine(line)) entry.dropped = true; continue; }
        const text = line.toString('utf8');
        if (!/"type"\s*:\s*"(?:token_usage_record|event_msg)"/.test(text)) continue;
        try { foldThreadMetrics(entry.state, JSON.parse(text)); } catch { entry.dropped = true; }
      }
      entry.pending = pending.subarray(start);
      if (entry.skippingLine) entry.pending = Buffer.alloc(0);
      else if (entry.pending.length > 1024 * 1024) {
        if (!skippableMetricLine(entry.pending)) entry.dropped = true;
        entry.pending = Buffer.alloc(0); entry.skippingLine = true;
      }
      this.files.delete(id); this.files.set(id, entry);
      while (this.files.size > 16) this.files.delete(this.files.keys().next().value);
      const complete = entry.offset === stat.size && entry.pending.length === 0 && !entry.dropped && !entry.skippingLine;
      if (complete) entry.hasComplete = true;
      return { ok: !entry.dropped, complete, hasMore: entry.offset < stat.size, invalidateCached: !entry.hasComplete, ...(complete ? threadMetricsSnapshot(entry.state) : {}) };
    } finally { fs.closeSync(fd); }
  }
}
async function refreshThreadMetrics(injector, reader) {
  const requests = await Promise.all([...injector.sessions.values()].map(async session => {
    try {
      const value = (await session.evaluate('window.__codexThreadMetrics?.requestedIds() ?? []'))?.result?.value;
      return { session, ids: Array.isArray(value) ? [...new Set(value.slice(0, 16).filter(id => typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)))] : [] };
    } catch { return { session, ids: [] }; }
  }));
  let pending = [...new Set(requests.flatMap(request => request.ids))].slice(0, 16);
  const metrics = Object.create(null), started = performance.now();
  // 每轮每会话最多 1 MiB；批次受轮数与软时间预算约束，轮间让出事件循环。
  for (let round = 0; pending.length && round < 8; round++) {
    const snapshot = reader.read(pending);
    for (const id of pending) {
      const metric = snapshot.metrics[id];
      metrics[id] = { ...metric, id, checkedAt: snapshot.checkedAt, ok: snapshot.ok && !!metric && metric.ok !== false };
    }
    pending = pending.filter(id => metrics[id].ok && metrics[id].hasMore);
    if (!pending.length || performance.now() - started >= 20) break;
    await new Promise(resolve => setImmediate(resolve));
  }
  await Promise.all(requests.flatMap(({ session, ids }) => ids.filter(id => metrics[id]).map(async id => {
    try { await session.evaluate(`window.__codexThreadMetrics?.update(${JSON.stringify(metrics[id])})`); } catch {}
  })));
  return pending.length > 0;
}
