function installThreadMetrics() {
  const KEY = '__codexThreadMetrics', VERSION = 8;
  if (window[KEY]?.version === VERSION) { window[KEY].refresh(); return; }
  window[KEY]?.destroy?.();
  const style = document.createElement('style'); style.id = 'codex-thread-metrics-style';
  style.textContent = `
    [data-codex-thread-metrics]{box-sizing:border-box;display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:4px 20px;width:100%;min-width:0;margin-top:8px;padding:0 4px 2px;color:var(--color-text-tertiary,#888);font:12px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;font-variant-numeric:tabular-nums;text-align:center}
    [data-codex-thread-metrics] .codex-metrics-group{appearance:none;display:inline-flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:3px 7px;max-width:100%;padding:2px 4px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer}
    [data-codex-thread-metrics] .codex-metrics-group:hover,[data-codex-thread-metrics] .codex-metrics-group[aria-expanded=true]{background:var(--color-background-primary-soft-hover,rgba(127,127,127,.1))}
    [data-codex-thread-metrics] .codex-metrics-group:focus-visible{outline:2px solid var(--color-background-info-solid,#4b91ff);outline-offset:2px}
    [data-codex-thread-metrics] [hidden]{display:none}
    [data-codex-thread-metrics] .codex-metrics-value{white-space:nowrap}
    [data-codex-thread-metrics] .codex-metrics-value+.codex-metrics-value::before{content:'·';margin-right:7px;opacity:.65}
    [data-codex-thread-metrics] svg{width:14px;height:14px;flex:0 0 14px;opacity:.85}
    [data-codex-thread-metrics-popover]{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:340px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;padding:16px;border:1px solid var(--color-border-primary-outline,rgba(127,127,127,.2));border-radius:16px;background:var(--color-background-primary-soft-alpha,Canvas);color:var(--color-text-primary,CanvasText);box-shadow:0 6px 24px #0002;font:13px/1.6 -apple-system,BlinkMacSystemFont,sans-serif;font-variant-numeric:tabular-nums;text-align:left}
    [data-codex-thread-metrics-popover] h2{margin:0 0 12px;padding-bottom:10px;border-bottom:1px solid var(--color-border-primary-outline,rgba(127,127,127,.15));font-size:13px;font-weight:600}
    [data-codex-thread-metrics-popover] dl{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;margin:0}
    [data-codex-thread-metrics-popover] dt{color:var(--color-text-secondary,#888);overflow-wrap:anywhere}
    [data-codex-thread-metrics-popover] dd{margin:0;text-align:right;white-space:nowrap}
    [data-codex-thread-metrics-popover] p{margin:12px 0 0;color:var(--color-text-secondary,#888);font-size:12px}
    [data-codex-thread-metrics-popover] progress{display:block;width:100%;height:6px;margin:14px 0 0;appearance:none;border:0;border-radius:4px;overflow:hidden}
    [data-codex-thread-metrics-popover] progress::-webkit-progress-bar{background:var(--color-border-primary-outline,#8883)}
    [data-codex-thread-metrics-popover] progress::-webkit-progress-value{background:#4b91ff;border-radius:4px}
  `;
  const cache = new Map(), views = new Map();
  let disposed = false, timer = null, serial = 0, lastOpened = null, managerFamily = null, managerLoadStarted = false;
  function remember(value) {
    cache.delete(value.id); cache.set(value.id, value);
    if (cache.size > 16) cache.delete(cache.keys().next().value);
  }
  const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  const ROW = '[data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-id]';
  function identity(row) {
    if (row?.getAttribute('data-app-action-sidebar-thread-host-id') !== 'local' || row.getAttribute('data-app-action-sidebar-thread-kind') !== 'local') return null;
    return /^local:([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.exec(row.getAttribute('data-app-action-sidebar-thread-id') ?? '')?.[1] ?? null;
  }
  function primaryId() {
    const active = [...document.querySelectorAll(`${ROW}[data-app-action-sidebar-thread-active="true"]`)];
    if (active.length) {
      const ids = active.map(identity);
      return ids[0] && ids.every(id => id === ids[0]) ? ids[0] : null;
    }
    const ids = [...new Set((location.pathname + location.search + location.hash).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/gi) ?? [])];
    if (ids.length !== 1) return null;
    return [...document.querySelectorAll(ROW)].map(identity).find(id => id === ids[0]) ?? null;
  }
  function visibleComposers() {
    return [...document.querySelectorAll('[data-composer-surface-variant]')].filter(element =>
      element.querySelector('[contenteditable="true"][role="textbox"],textarea') && !element.closest('[hidden],[inert],[aria-hidden="true"]') && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0);
  }
  function clientScopes(composer) {
    const keys = Object.keys(composer).filter(key => key.startsWith('__reactFiber$'));
    if (keys.length !== 1) return null;
    let fiber = composer[keys[0]];
    // shortcut: 新版客户端通过 React scope 缓存暴露身份；布局或私有导出改变时需重新适配。
    for (let depth = 0; fiber && depth < 160; depth++, fiber = fiber.return) {
      const scopes = fiber.memoizedProps?.value;
      if (scopes instanceof Map && scopes.size <= 16 && [...scopes.values()].some(entry => entry?.token && entry?.store && entry?.familyBindings instanceof Map)) return scopes;
    }
    return null;
  }
  function clientScope(scopes, id, placement) {
    if (!scopes) return null;
    const matches = [...scopes.values()].filter(entry => entry?.value?.kind === 'local' && entry.value.conversationId === id && entry.value.placement === placement);
    return matches.length === 1 ? matches[0] : null;
  }
  function matchesPrimary(composer, id) {
    if (primaryId() === id) return true;
    const active = [...document.querySelectorAll(`${ROW}[data-app-action-sidebar-thread-active="true"]`)];
    if (!active.length) return false;
    const clients = active.map(row => row.getAttribute('data-app-action-sidebar-thread-host-id') === 'local' && row.getAttribute('data-app-action-sidebar-thread-kind') === 'local' ?
      /^local:(client-new-thread:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.exec(row.getAttribute('data-app-action-sidebar-thread-id') ?? '')?.[1] : null);
    if (!clients[0] || !clients.every(client => client === clients[0])) return false;
    return clientScope(clientScopes(composer), id, 'main')?.value.clientThreadId === clients[0];
  }
  function loadClientManager() {
    if (managerLoadStarted || managerFamily) return;
    const assets = [...new Set([...document.querySelectorAll('link[rel="modulepreload"][href]')].map(link => link.href))].filter(href => {
      const url = new URL(href);
      return url.protocol === location.protocol && url.host === location.host && /^\/assets\/app-initial-[a-f0-9]+\.js$/.test(url.pathname) && !url.search && !url.hash;
    });
    if (assets.length !== 1) return;
    managerLoadStarted = true;
    import(assets[0]).then(module => {
      if (disposed || module.cCn?.kind !== 'signal-family' || !module.cCn.scope) return;
      managerFamily = module.cCn; refresh();
    }).catch(() => {});
  }
  function cachedManager(composer, id) {
    if (!managerFamily) return null;
    const scopes = clientScopes(composer);
    if (!clientScope(scopes, id, 'side')) return null;
    const roots = [...scopes.values()].filter(entry => entry.token === managerFamily.scope);
    if (roots.length !== 1) return null;
    // 仅取已存在的 local member，不创建 signal 或 RPC 订阅。
    const member = roots[0].familyBindings.get(managerFamily)?.get('local')?.value;
    return typeof member?.get === 'function' ? member.get() : null;
  }
  function composerBinding(composer) {
    try {
      const parent = composer.parentElement, keys = Object.keys(parent).filter(key => key.startsWith('__reactProps$'));
      if (keys.length !== 1) return null;
      // shortcut: 只读输入框父节点当前 React 子元素的身份；客户端调整此结构时需重新适配。
      const children = parent[keys[0]]?.children;
      const elements = Array.isArray(children) ? children : [children];
      if (!elements.length || elements.length > 16) return null;
      const ids = new Set(); let owner = null;
      for (const element of elements) {
        const props = element?.props;
        if (!props || typeof props !== 'object') continue;
        if (props.conversationId !== undefined) {
          if (typeof props.conversationId !== 'string' || !UUID.test(props.conversationId)) return null;
          ids.add(props.conversationId);
        }
        if (props.hostId !== undefined && props.hostId !== 'local') return null;
        if (typeof props.conversationId === 'string' && props.hostId === 'local') owner ??= props;
      }
      if (!owner || ids.size !== 1) return null;
      const id = [...ids][0], pane = composer.closest('[data-app-shell-tab-panel-controller]');
      if (pane) {
        const tab = pane.getAttribute('data-tab-id') ?? '';
        if (pane.getAttribute('data-app-shell-tab-panel-controller') !== 'right' || tab !== 'sidechat:' + id) return null;
        const manager = owner.manager ?? cachedManager(composer, id);
        const record = manager?.getConversation?.(id);
        if (record?.id !== id || record.hostId !== 'local' || record.sideConversation !== true) return null;
        if (record.ephemeral === false) return { id, source: 'log' };
        return record.ephemeral === true ? { id, source: 'client-memory', snapshot: memorySnapshot(record, id) } : null;
      }
      return composer.closest('[data-app-shell-focus-area="main"]') && matchesPrimary(composer, id) ? { id, source: 'log' } : null;
    } catch { return null; }
  }
  function memorySnapshot(record, id) {
    const base = { id, source: 'client-memory', checkedAt: Date.now(), ok: true, complete: true,
      rounds: null, steps: null, speed: null, ttftMs: null, durationMs: null, previousSpeed: false,
      inputTokens: null, outputTokens: null, totalTokens: null, cachedInputTokens: null, cachePercent: null,
      contextTokens: null, contextWindow: null, contextPercent: null };
    const valid = n => Number.isSafeInteger(n) && n >= 0;
    let info;
    try { info = record.latestTokenUsageInfo; } catch {}
    try {
      const total = info?.total;
      if (total && valid(total.inputTokens) && valid(total.outputTokens) && valid(total.totalTokens) && total.inputTokens + total.outputTokens === total.totalTokens) {
        base.inputTokens = total.inputTokens; base.outputTokens = total.outputTokens; base.totalTokens = total.totalTokens;
        const cached = total.cachedInputTokens;
        if (valid(cached) && cached <= base.inputTokens) {
          base.cachedInputTokens = cached;
          base.cachePercent = base.inputTokens > 0 ? cached * 100 / base.inputTokens : null;
        }
      }
    } catch {}
    try { if (valid(info?.last?.totalTokens)) base.contextTokens = info.last.totalTokens; } catch {}
    try { if (valid(info?.modelContextWindow) && info.modelContextWindow > 0) base.contextWindow = info.modelContextWindow; } catch {}
    if (base.contextTokens !== null && base.contextWindow !== null) base.contextPercent = base.contextTokens * 100 / base.contextWindow;
    try {
      const history = record.turnHistory?.kind === 'canonical' ? record.turnHistory.history : null;
      if (history?.isComplete === true && Array.isArray(history.islands) && history.islands.length === 1) {
        const entries = history.islands[0]?.entries ?? [];
        if (Array.isArray(entries) && entries.length <= 2048) {
          const seen = new Set(); let latestId = null, completedId = null, durationMs = null, completeMetadata = true;
          for (const entry of entries) {
            const turn = history.entitiesByKey?.[entry?.value];
            if (typeof turn?.turnId !== 'string' || !turn.turnId || !Number.isFinite(turn.turnStartedAtMs) || turn.turnStartedAtMs < 0) { completeMetadata = false; break; }
            seen.add(turn.turnId); latestId = turn.turnId;
            if (turn.status === 'completed' && Number.isFinite(turn.durationMs) && turn.durationMs >= 0) { durationMs = turn.durationMs; completedId = turn.turnId; }
          }
          if (completeMetadata) { base.rounds = seen.size; base.durationMs = durationMs; base.previousSpeed = completedId !== latestId; }
        }
      }
    } catch {}
    return base;
  }
  function number(value) { return Number.isFinite(value) && value >= 0 ? String(Math.round(value)) : '—'; }
  function tokens(value) {
    if (!Number.isSafeInteger(value) || value < 0) return '—';
    for (const [scale, suffix] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) if (value >= scale) return `${Number((value / scale).toFixed(1))}${suffix}`;
    return String(value);
  }
  function exact(value) { return Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('en-US') + ' tok' : '未记录'; }
  function duration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '未记录';
    const seconds = ms / 1000;
    return seconds < 60 ? `${Number(seconds.toFixed(1))} 秒` : `${Math.floor(seconds / 60)} 分 ${Math.floor(seconds % 60)} 秒`;
  }
  function createView(target) {
    const suffix = serial++ ? '-' + serial : '';
    const row = document.createElement('div'); row.id = 'codex-thread-metrics' + suffix; row.dataset.codexThreadMetrics = ''; row.setAttribute('role', 'group'); row.setAttribute('aria-label', '会话指标');
    const panel = document.createElement('div'); panel.id = 'codex-thread-metrics-popover' + suffix; panel.dataset.codexThreadMetricsPopover = ''; panel.setAttribute('popover', 'manual'); panel.setAttribute('role', 'region'); panel.setAttribute('aria-labelledby', panel.id + '-title');
    let snapshot = null, currentId = null, source = null, ready = false, openKey = null, pinned = false, closeTimer = null, panelValue = null, restoredAt = null;
    function stale() { return !!snapshot?.checkedAt && Date.now() - (restoredAt ?? snapshot.checkedAt) > 30000; }
    function closePanel() {
      clearTimeout(closeTimer); closeTimer = null;
      if (panel.matches(':popover-open')) panel.hidePopover();
      panel.remove(); panel.replaceChildren(); panelValue = null; openKey = null; pinned = false;
      for (const button of buttons) { button.setAttribute('aria-expanded', 'false'); button.removeAttribute('aria-describedby'); }
    }
    function positionPanel() {
      if (openKey === null) return;
      const button = buttons[openKey], rect = button.getBoundingClientRect(), strip = row.getBoundingClientRect();
      if (!button.isConnected || rect.width === 0 || rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) { closePanel(); return; }
      const above = strip.top - 16, below = innerHeight - strip.bottom - 16;
      const height = panel.scrollHeight + panel.offsetHeight - panel.clientHeight;
      const up = above >= height || above >= below;
      const space = up ? above : below;
      if (space < 40) { closePanel(); return; }
      panel.style.maxHeight = `${space}px`;
      const size = panel.getBoundingClientRect();
      panel.style.left = `${Math.max(8, Math.min((rect.left + rect.right - size.width) / 2, innerWidth - size.width - 8))}px`;
      panel.style.top = `${up ? strip.top - size.height - 8 : strip.bottom + 8}px`;
    }
    function renderPanel() {
      if (openKey === null) return;
      const s = snapshot;
      const uncached = Number.isSafeInteger(s.inputTokens) && Number.isSafeInteger(s.cachedInputTokens) && s.cachedInputTokens >= 0 && s.cachedInputTokens <= s.inputTokens ? s.inputTokens - s.cachedInputTokens : null;
      const fields = [
        [['最近完成轮次用时', duration(s.durationMs)], ['首 Token 延迟（TTFT）', duration(s.ttftMs)], ['该轮平均输出速度', Number.isFinite(s.speed) && s.speed >= 0 ? `${number(s.speed)} tok/s` : '未记录']],
        [['累计用量', exact(s.totalTokens)], ['输入', exact(s.inputTokens)], ['未缓存输入', exact(uncached)], ['缓存读取', exact(s.cachedInputTokens)], ['输出', exact(s.outputTokens)], ['缓存命中', Number.isFinite(s.cachePercent) ? `${number(s.cachePercent)}%` : '未记录']],
        [['上下文已用（约）', exact(s.contextTokens)], ['上下文窗口', exact(s.contextWindow)], ['占用比例（约）', Number.isFinite(s.contextPercent) ? `${number(s.contextPercent)}%` : '未记录']]
      ][openKey];
      const notes = source === 'client-memory' ? ['仅统计完整加载的轮次元数据。客户端缓存未提供步数、轮输出用量或 TTFT，因此不计算轮均速度。',
        '缓存读取属于输入的一部分。累计用量可能包含分叉前继承的 Token，不代表此临时会话独自产生的用量。',
        '按客户端最近请求用量估算，不是订阅额度。缓存未提供系统提示词、工具定义与对话消息的分类用量。'] : ['包含思考、工具执行与等待。TTFT 是该轮日志记录的首 Token 延迟；模型与工具的独立耗时未提供。',
        '缓存读取属于输入的一部分，未缓存输入 = 输入 − 缓存读取。输出包含推理 Token，不重复加总。',
        '按最近请求用量估算，不是订阅额度。日志未提供系统提示词、工具定义与对话消息的分类用量。'];
      const memory = source === 'client-memory' ? '来源为临时会话的客户端内存缓存，检查时间不代表服务器更新时间。' : '';
      const historical = restoredAt !== null ? `上次统计（${new Date(s.checkedAt).toLocaleString()}），正在校验。` : memory;
      const value = JSON.stringify([openKey, fields, s.contextPercent, historical]);
      if (panelValue !== value) {
        const title = document.createElement('h2'); title.id = panel.id + '-title'; title.textContent = ['会话统计 · 最近完成轮次', 'Token 用量', '上下文占用'][openKey];
        const list = document.createElement('dl');
        for (const [label, value] of fields) { const term = document.createElement('dt'), detail = document.createElement('dd'); term.textContent = label; detail.textContent = value; list.append(term, detail); }
        const note = document.createElement('p'); note.textContent = historical + notes[openKey]; panel.replaceChildren(title, list);
        if (openKey === 2 && Number.isFinite(s.contextPercent) && s.contextPercent >= 0) {
          const bar = document.createElement('progress'); bar.max = 100; bar.value = Math.min(100, s.contextPercent); bar.setAttribute('aria-label', '上下文占用'); bar.setAttribute('aria-valuetext', `约 ${number(s.contextPercent)}%`); panel.append(bar);
        }
        panel.append(note); panelValue = value;
      }
      positionPanel();
    }
    function openPanel(key, pin = false) {
      if (!ready || !row.isConnected) return;
      clearTimeout(closeTimer); closeTimer = null; openKey = key; pinned = pin; lastOpened = view;
      if (!panel.isConnected) document.body.append(panel);
      if (!panel.matches(':popover-open')) panel.showPopover();
      for (const [index, button] of buttons.entries()) {
        button.setAttribute('aria-expanded', String(index === key)); button.removeAttribute('aria-describedby');
        if (index === key) button.setAttribute('aria-describedby', panel.id);
      }
      renderPanel();
    }
    function leavePanel() {
      clearTimeout(closeTimer);
      if (!pinned) closeTimer = setTimeout(() => {
        if (!panel.matches(':hover') && !panel.contains(document.activeElement) && !buttons[openKey]?.matches(':hover,:focus-visible')) closePanel();
      }, 160);
    }
    const paths = ['M4.2 19a9 9 0 1 1 15.6 0M12 13l4-4M6.8 8.8l.7.7M12 6v1M17.2 8.8l-.7.7M4 14h1M19 14h1', 'M20 5c0 2-3.6 3-8 3S4 7 4 5s3.6-3 8-3 8 1 8 3ZM4 5v14c0 2 3.6 3 8 3s8-1 8-3V5M4 12c0 2 3.6 3 8 3s8-1 8-3', 'M20.5 12a8.5 8.5 0 1 1-8.5-8.5M12 3.5a8.5 8.5 0 0 1 8.5 8.5'];
    const buttons = paths.map((path, key) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'codex-metrics-group'; button.dataset.metricsGroup = key;
      button.setAttribute('aria-label', ['查看会话统计', '查看 Token 用量', '查看上下文占用'][key]); button.setAttribute('aria-controls', panel.id); button.setAttribute('aria-expanded', 'false');
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) icon.setAttribute(name, value);
      const shape = document.createElementNS(icon.namespaceURI, 'path'); shape.setAttribute('d', path); icon.append(shape); button.append(icon);
      for (let i = 0; i < (key === 2 ? 1 : 2); i++) { const item = document.createElement('span'); item.className = 'codex-metrics-value'; button.append(item); }
      button.addEventListener('pointerenter', () => { if (!pinned) openPanel(key); }); button.addEventListener('pointerleave', leavePanel);
      button.addEventListener('focus', () => { if (!pinned) openPanel(key); }); button.addEventListener('blur', leavePanel);
      button.addEventListener('click', () => { if (pinned && openKey === key) closePanel(); else openPanel(key, true); });
      return button;
    });
    const message = document.createElement('span'); row.append(...buttons, message);
    panel.addEventListener('pointerenter', () => clearTimeout(closeTimer)); panel.addEventListener('pointerleave', leavePanel);
    panel.addEventListener('focusin', () => clearTimeout(closeTimer)); panel.addEventListener('focusout', leavePanel);
    function outside(event) { if (openKey !== null && !row.contains(event.target) && !panel.contains(event.target)) closePanel(); }
    function escape(event) {
      if (openKey !== null && event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (panel.contains(document.activeElement)) buttons[openKey].focus({ preventScroll: true });
        closePanel();
      }
    }
    function render() {
      let text = '';
      if (stale()) text = '会话指标已过期，等待连接';
      else if (!snapshot || snapshot.id !== currentId) text = '正在读取会话指标';
      else if (!snapshot.ok) text = '会话指标暂不可用';
      else if (!snapshot.complete) text = '正在读取历史统计';
      ready = !text;
      for (const button of buttons) button.hidden = !ready;
      const statusText = ready && restoredAt !== null ? '上次统计 · 校验中' : ready && source === 'client-memory' ? '临时会话 · 内存统计' : text;
      message.hidden = ready && restoredAt === null && source !== 'client-memory';
      if (message.textContent !== statusText) message.textContent = statusText;
      if (!ready) { for (const item of row.querySelectorAll('.codex-metrics-value')) if (item.textContent) item.textContent = ''; closePanel(); return; }
      const fields = [
        [`${number(snapshot.rounds)}轮 · 本轮${number(snapshot.steps)}步`, `${snapshot.previousSpeed ? '上轮均速' : '轮均输出'} ${number(snapshot.speed)} tok/s`],
        [`累计 ${tokens(snapshot.totalTokens)} tok`, `缓存命中 ${number(snapshot.cachePercent)}%`],
        [`上下文约 ${number(snapshot.contextPercent)}%`]
      ];
      for (const [key, button] of buttons.entries()) for (const [index, item] of [...button.querySelectorAll('span')].entries()) if (item.textContent !== fields[key][index]) item.textContent = fields[key][index];
      renderPanel();
    }
    const view = {
      refresh(binding) {
        const id = binding?.id ?? null, nextSource = binding?.source ?? null;
        if (id !== currentId || nextSource !== source) {
          closePanel(); currentId = id; source = nextSource; snapshot = source === 'log' ? cache.get(id) ?? null : null; restoredAt = snapshot ? Date.now() : null;
          if (snapshot) remember(snapshot);
        }
        if (!id) { closePanel(); row.remove(); return; }
        row.dataset.codexMetricsThreadId = id;
        if (row.parentElement !== target.parentElement || row.previousElementSibling !== target) target.after(row);
        if (source === 'client-memory') view.update(binding.snapshot);
        else render();
      },
      update(next) {
        if (next.id !== currentId || (next.source ?? 'log') !== source) return;
        if (!next.ok || next.invalidateCached) { snapshot = next; restoredAt = null; }
        else if (next.complete) { snapshot = next; restoredAt = null; }
        else if (snapshot?.ok && snapshot.complete) restoredAt ??= snapshot.checkedAt;
        else { snapshot = next; restoredAt = null; }
        render();
      },
      status() { return { placed: row.isConnected, threadId: currentId, source, rowId: row.id, panelId: panel.id, checkedAt: snapshot?.checkedAt ?? null, ok: snapshot?.ok === true, stale: stale(), cached: restoredAt !== null, openGroup: openKey, pinned }; },
      contains(node) { return row.contains(node) || panel.contains(node); },
      isOpen() { return openKey !== null; },
      outside, escape, positionPanel,
      destroy() { closePanel(); row.remove(); if (lastOpened === view) lastOpened = null; }
    };
    return view;
  }
  function refresh() {
    if (disposed) return;
    if (!window.__codexThreadTokens) { window[KEY]?.destroy(); return; }
    loadClientManager();
    const composers = visibleComposers(), live = new Set(composers);
    for (const [target, view] of views) if (!live.has(target)) { view.destroy(); views.delete(target); }
    for (const target of composers) {
      let view = views.get(target);
      if (!view) { view = createView(target); views.set(target, view); }
      view.refresh(composerBinding(target));
    }
    if (!style.isConnected) (document.head ?? document.documentElement).append(style);
  }
  function requestedIds() { refresh(); return [...new Set([...views.values()].map(view => view.status()).filter(pane => pane.source === 'log').map(pane => pane.threadId).filter(Boolean))]; }
  function schedule() { if (!disposed && timer === null) timer = setTimeout(() => { timer = null; refresh(); }, 80); }
  const observer = new MutationObserver(records => {
    if (records.some(record => record.target !== style && !record.target.closest?.('[data-codex-thread-metrics],[data-codex-thread-metrics-popover]'))) schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-app-action-sidebar-thread-active', 'data-app-action-sidebar-thread-id', 'data-app-action-sidebar-thread-host-id', 'data-app-action-sidebar-thread-kind', 'data-tab-id', 'data-app-shell-tab-panel-controller', 'hidden', 'inert', 'aria-hidden'] });
  function positionPanels() { for (const view of views.values()) view.positionPanel(); }
  function outside(event) { for (const view of views.values()) view.outside(event); }
  function escape(event) {
    if (event.key !== 'Escape') return;
    const open = [...views.values()].filter(view => view.isOpen());
    const focused = open.find(view => view.contains(document.activeElement));
    (focused ?? (lastOpened?.isOpen() ? lastOpened : open.at(-1)))?.escape(event);
  }
  const freshness = setInterval(refresh, 1000);
  window.addEventListener('popstate', schedule); window.addEventListener('hashchange', schedule);
  window.addEventListener('resize', positionPanels); document.addEventListener('scroll', positionPanels, true);
  document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape, true);
  window[KEY] = {
    version: VERSION, refresh, requestedIds,
    requestedId() { const ids = requestedIds(); return ids.includes(primaryId()) ? primaryId() : ids[0] ?? null; },
    update(next) {
      refresh();
      if (!next || ![...views.values()].some(view => view.status().threadId === next.id && view.status().source === 'log')) return;
      if (cache.has(next.id) && next.checkedAt < cache.get(next.id).checkedAt) return;
      if (!next.ok || next.invalidateCached) cache.delete(next.id);
      else if (next.complete) remember(next);
      for (const view of views.values()) view.update(next);
    },
    status() {
      const panes = [...views.values()].map(view => view.status());
      return { version: VERSION, ...(panes.find(pane => pane.threadId === primaryId()) ?? panes[0]), cachedCount: cache.size, panes };
    },
    destroy() {
      disposed = true; observer.disconnect(); clearTimeout(timer); clearInterval(freshness);
      window.removeEventListener('popstate', schedule); window.removeEventListener('hashchange', schedule);
      window.removeEventListener('resize', positionPanels); document.removeEventListener('scroll', positionPanels, true);
      document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true);
      for (const view of views.values()) view.destroy(); views.clear(); cache.clear(); style.remove(); delete window[KEY];
    }
  };
  refresh();

}
