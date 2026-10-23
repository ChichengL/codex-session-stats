const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { installThreadMetrics, refreshThreadMetrics } = require('../agent.cjs');
const ids = [1, 2, 3].map(n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`);
const fixture = `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{font:14px sans-serif}.shell{display:flex;gap:24px}.pane{width:48%;padding-top:370px}.composer-parent{width:100%}[data-composer-surface-variant]{border:1px solid #ddd;border-radius:16px;padding:12px}[contenteditable]{height:80px}</style>
${ids.map((id, n) => `<div data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="local:${id}" data-app-action-sidebar-thread-host-id="local" data-app-action-sidebar-thread-kind="local" data-app-action-sidebar-thread-active="${n === 0}"></div>`).join('')}
<div class="shell"><section id="left" class="pane" data-app-shell-focus-area="main"><div class="composer-parent"><div data-composer-surface-variant="default"><div contenteditable="true" role="textbox" id="left-editor"></div></div></div></section>
<section id="right" class="pane" data-app-shell-tab-panel-controller="right" data-tab-id="sidechat:${ids[1]}"><div class="composer-parent"><div data-composer-surface-variant="default"><div contenteditable="true" role="textbox" id="right-editor"></div></div></div></section></div>`;
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1540, height: 700 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message)); await page.setContent(fixture);
    await page.evaluate(ids => {
      window.__codexThreadTokens = {};
      window.fixtureRecord = id => {
        const n = ids.indexOf(id) + 1;
        const record = { id, hostId: 'local', ephemeral: true, sideConversation: true,
          latestTokenUsageInfo: { total: { inputTokens: n * 100, outputTokens: n * 11, totalTokens: n * 111, cachedInputTokens: n * 50 }, last: { totalTokens: 100 }, modelContextWindow: 1000 },
          turnHistory: { kind: 'canonical', history: { isComplete: true, islands: [{ entries: [{ value: 'one' }] }], entitiesByKey: { one: { turnId: 'one', turnStartedAtMs: 1, status: 'completed', durationMs: 1000 } } } } };
        for (const object of [record, record.turnHistory.history.entitiesByKey.one]) for (const name of ['messages', 'items', 'params', 'draft', 'turns']) Object.defineProperty(object, name, { get() { throw new Error('Business content must not be read'); } });
        return record;
      };
      window.fixtureRecords = new Map(ids.map(id => [id, window.fixtureRecord(id)]));
      window.fixtureBind = (side, id) => {
        const props = { conversationId: id, hostId: 'local' };
        if (side === 'right') props.manager = { getConversation: id => window.fixtureRecords.get(id) };
        else Object.defineProperty(props, 'manager', { get() { throw new Error('Main conversation manager must not be read'); } });
        for (const name of ['message', 'draft']) Object.defineProperty(props, name, { get() { throw new Error('Business content must not be read'); } });
        document.querySelector('#' + side + ' .composer-parent').__reactProps$fixture = { children: [{ props }, { props: { conversationId: id } }] };
        if (side === 'right') document.getElementById(side).setAttribute('data-tab-id', 'sidechat:' + id);
        else for (const row of document.querySelectorAll('[data-app-action-sidebar-thread-row]')) row.setAttribute('data-app-action-sidebar-thread-active', String(row.getAttribute('data-app-action-sidebar-thread-id') === 'local:' + id));
      };
      window.fixtureBind('left', ids[0]); window.fixtureBind('right', ids[1]);
    }, ids);
    await page.locator('#left-editor').focus(); await page.evaluate(`(${installThreadMetrics.toString()})()`);
    const rows = side => page.locator('#' + side + ' [data-codex-thread-metrics]');
    const button = (side, n) => rows(side).locator(`[data-metrics-group="${n}"]`);
    const panel = async side => page.locator('#' + await button(side, 0).getAttribute('aria-controls'));
    const sample = id => ({ id, ok: true, complete: true, checkedAt: Date.now(), rounds: 1, steps: 2, totalTokens: (ids.indexOf(id) + 1) * 111, inputTokens: 100, cachedInputTokens: 50, outputTokens: 11, cachePercent: 50, speed: 20, contextPercent: 10, contextTokens: 100, contextWindow: 1000 });
    const put = id => page.evaluate(next => window.__codexThreadMetrics.update(next), sample(id));
    const bind = (side, id) => page.evaluate(({ side, id }) => { window.fixtureBind(side, id); window.__codexThreadMetrics.refresh(); }, { side, id });
    const session = { evaluate: async expression => ({ result: { value: await page.evaluate(expression) } }) };
    let reads = [];
    const reader = { read(requested) { reads.push(requested); return { ok: true, checkedAt: Date.now(), metrics: Object.fromEntries(requested.map(id => [id, sample(id)])) }; } };
    await refreshThreadMetrics({ sessions: new Map([['window', session]]) }, reader);
    assert.deepEqual(reads, [[ids[0]]], 'ephemeral side conversations must not query the local DB');
    assert.match(await rows('left').textContent(), /111 tok/); assert.match(await rows('right').textContent(), /222 tok/);
    assert.match(await rows('right').textContent(), /临时会话 · 内存统计/);
    await page.evaluate(next => window.__codexThreadMetrics.update(next), { id: ids[1], ok: false, checkedAt: Date.now() + 1000 });
    assert.match(await rows('right').textContent(), /222 tok/, 'late DB failures must not overwrite client-memory snapshots');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'left-editor');
    const aria = await page.locator('[data-codex-thread-metrics] button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-controls')));
    assert.equal(new Set(aria).size, 2);
    await button('right', 1).click(); const rightPanel = await panel('right'); assert.match(await rightPanel.textContent(), /222 tok/);
    await bind('left', ids[2]); await put(ids[2]);
    assert.match(await rows('left').textContent(), /333 tok/); assert.match(await rows('right').textContent(), /222 tok/);
    assert.equal(await button('right', 1).getAttribute('aria-expanded'), 'true', 'the unchanged pane must keep its fixed details');
    await page.evaluate(next => window.__codexThreadMetrics.update(next), { ...sample(ids[0]), totalTokens: 999 });
    assert.doesNotMatch(await rows('left').textContent(), /999|111 tok/);
    await page.evaluate(next => window.__codexThreadMetrics.update(next), { id: ids[2], ok: false, checkedAt: Date.now() });
    assert.match(await rows('left').textContent(), /不可用/); assert.match(await rightPanel.textContent(), /222 tok/); await put(ids[2]);
    await bind('right', ids[2]); reads = []; await refreshThreadMetrics({ sessions: new Map([['window', session]]) }, reader);
    assert.deepEqual(reads, [[ids[2]]], 'the same thread in two panes must be read once');
    assert.match(await rows('right').textContent(), /333 tok/); await bind('right', ids[1]); await put(ids[1]);
    await page.evaluate(id => { window.fixtureRecords.get(id).ephemeral = false; window.__codexThreadMetrics.refresh(); }, ids[1]);
    reads = []; await refreshThreadMetrics({ sessions: new Map([['window', session]]) }, reader);
    assert.deepEqual(reads, [[ids[2], ids[1]]], 'persistent side conversations must use their own local log');
    assert.match(await rows('right').textContent(), /222 tok/); assert.doesNotMatch(await rows('right').textContent(), /临时会话/);
    await page.evaluate(id => window.fixtureRecords.set(id, window.fixtureRecord(id)), ids[1]); await bind('right', ids[1]);
    for (const fault of ['missing-record', 'wrong-id', 'remote-record', 'missing-ephemeral', 'not-side-chat', 'getter-failure']) {
      await page.evaluate(({ fault, id, other }) => {
        const record = window.fixtureRecords.get(id);
        if (fault === 'missing-record') window.fixtureRecords.delete(id);
        if (fault === 'wrong-id') record.id = other;
        if (fault === 'remote-record') record.hostId = 'remote';
        if (fault === 'missing-ephemeral') delete record.ephemeral;
        if (fault === 'not-side-chat') record.sideConversation = false;
        if (fault === 'getter-failure') document.querySelector('#right .composer-parent').__reactProps$fixture.children[0].props.manager.getConversation = () => { throw new Error('Unavailable metadata'); };
        window.__codexThreadMetrics.refresh();
      }, { fault, id: ids[1], other: ids[0] });
      assert.equal(await rows('right').count(), 0, fault);
      assert.match(await rows('left').textContent(), /333 tok/, fault);
      assert.deepEqual(await page.evaluate(() => window.__codexThreadMetrics.requestedIds()), [ids[2]], 'invalid temporary metadata must not fall back to the DB');
      await page.evaluate(id => window.fixtureRecords.set(id, window.fixtureRecord(id)), ids[1]); await bind('right', ids[1]);
    }
    for (const fault of ['invalid-total', 'invalid-cache', 'total-getter', 'usage-getter', 'history-getter', 'context-getter', 'window-getter']) {
      await page.evaluate(({ fault, id }) => {
        const record = window.fixtureRecords.get(id);
        const fail = () => { throw new Error('Unavailable metric group'); };
        if (fault === 'invalid-total') record.latestTokenUsageInfo.total.totalTokens++;
        if (fault === 'invalid-cache') record.latestTokenUsageInfo.total.cachedInputTokens = 99999;
        if (fault === 'total-getter') Object.defineProperty(record.latestTokenUsageInfo, 'total', { get: fail });
        if (fault === 'usage-getter') Object.defineProperty(record, 'latestTokenUsageInfo', { get: fail });
        if (fault === 'history-getter') Object.defineProperty(record, 'turnHistory', { get: fail });
        if (fault === 'context-getter') Object.defineProperty(record.latestTokenUsageInfo, 'last', { get: fail });
        if (fault === 'window-getter') Object.defineProperty(record.latestTokenUsageInfo, 'modelContextWindow', { get: fail });
        window.__codexThreadMetrics.refresh();
      }, { fault, id: ids[1] });
      const text = await rows('right').textContent();
      assert.doesNotMatch(text, /不可用/, fault);
      assert.match(text, fault === 'history-getter' ? /—轮/ : /1轮/, fault);
      assert.match(text, ['invalid-total', 'total-getter', 'usage-getter'].includes(fault) ? /累计 — tok/ : /222 tok/, fault);
      assert.match(text, ['usage-getter', 'context-getter', 'window-getter'].includes(fault) ? /上下文约 —%/ : /上下文约 10%/, fault);
      if (fault === 'invalid-cache') assert.match(text, /缓存命中 —%/);
      assert.match(await rows('left').textContent(), /333 tok/, fault);
      await page.evaluate(id => window.fixtureRecords.set(id, window.fixtureRecord(id)), ids[1]); await bind('right', ids[1]);
    }
    await page.evaluate(id => {
      const history = window.fixtureRecords.get(id).turnHistory.history;
      history.entitiesByKey.one.status = 'interrupted';
      history.entitiesByKey.pending = { turnId: 'pending', turnStartedAtMs: 5000, status: 'inProgress' };
      history.islands[0].entries.push({ value: 'pending' });
      window.fixtureRecords.get(id).latestTokenUsageInfo.total.totalTokens++;
      window.__codexThreadMetrics.refresh();
    }, ids[1]);
    assert.match(await rows('right').textContent(), /2轮.*累计 — tok.*上下文约 10%/, 'an interrupted turn followed by a running turn must keep independent metrics');
    await page.evaluate(id => window.fixtureRecords.set(id, window.fixtureRecord(id)), ids[1]); await bind('right', ids[1]);
    await page.evaluate(id => { delete window.fixtureRecords.get(id).turnHistory.history.entitiesByKey.one; window.__codexThreadMetrics.refresh(); }, ids[1]);
    assert.match(await rows('right').textContent(), /—轮.*222 tok/, 'a missing history entity must not publish an incomplete round count');
    await page.evaluate(id => window.fixtureRecords.set(id, window.fixtureRecord(id)), ids[1]); await bind('right', ids[1]);
    await page.evaluate(id => {
      const history = window.fixtureRecords.get(id).turnHistory.history;
      history.entitiesByKey.two = { turnId: 'two', turnStartedAtMs: 2000, status: 'completed', durationMs: 2500 };
      history.entitiesByKey.pending = { turnId: 'pending', turnStartedAtMs: 5000, status: 'inProgress' };
      history.islands[0].entries = ['one', 'one', 'two', 'pending'].map(value => ({ value })); window.__codexThreadMetrics.refresh();
    }, ids[1]);
    assert.match(await rows('right').textContent(), /3轮.*上轮均速 — tok\/s/);
    await button('right', 0).click(); assert.match(await (await panel('right')).textContent(), /2\.5 秒/);
    assert.match(await (await panel('right')).textContent(), /TTFT）未记录/); await button('right', 0).click();
    for (const fault of ['incomplete', 'multiple-islands', 'no-islands']) {
      await page.evaluate(({ fault, id }) => {
        const history = window.fixtureRecords.get(id).turnHistory.history;
        if (fault === 'incomplete') history.isComplete = false;
        if (fault === 'multiple-islands') history.islands.push({ entries: [] });
        if (fault === 'no-islands') history.islands = [];
        window.__codexThreadMetrics.refresh();
      }, { fault, id: ids[1] });
      assert.match(await rows('right').textContent(), /—轮.*222 tok/, fault);
      await page.evaluate(id => window.fixtureRecords.set(id, window.fixtureRecord(id)), ids[1]); await bind('right', ids[1]);
    }
    for (const mutation of ['remote', 'missing-pair', 'conflicting-id', 'multiple-keys', 'too-many', 'wrong-tab']) {
      await page.evaluate(({ mutation, other }) => {
        const parent = document.querySelector('#right .composer-parent'), props = parent.__reactProps$fixture;
        if (mutation === 'remote') props.children[0].props.hostId = 'remote';
        if (mutation === 'missing-pair') delete props.children[0].props.hostId;
        if (mutation === 'conflicting-id') props.children[1].props.conversationId = other;
        if (mutation === 'multiple-keys') parent.__reactProps$ambiguous = {};
        if (mutation === 'too-many') props.children = Array(17).fill(props.children[0]);
        if (mutation === 'wrong-tab') document.getElementById('right').setAttribute('data-tab-id', 'sidechat:' + other);
        window.__codexThreadMetrics.refresh();
      }, { mutation, other: ids[0] });
      assert.equal(await rows('right').count(), 0, mutation); assert.match(await rows('left').textContent(), /333 tok/, mutation);
      await page.evaluate(() => delete document.querySelector('#right .composer-parent').__reactProps$ambiguous);
      await bind('right', ids[1]); await put(ids[1]);
    }
    await page.evaluate(id => {
      document.querySelector('[data-app-action-sidebar-thread-active="true"]').setAttribute('data-app-action-sidebar-thread-active', 'false');
      document.querySelector(`[data-app-action-sidebar-thread-id="local:${id}"]`).setAttribute('data-app-action-sidebar-thread-active', 'true');
      window.__codexThreadMetrics.refresh();
    }, ids[0]);
    assert.equal(await rows('left').count(), 0, 'sidebar/composer transition disagreement must hide only the main pane'); assert.match(await rows('right').textContent(), /222 tok/);
    await bind('left', ids[2]); await put(ids[2]);
    await button('left', 0).click(); await button('right', 1).hover(); await button('right', 1).focus();
    assert.equal(await page.locator('[data-codex-thread-metrics-popover]').count(), 2);
    await page.keyboard.press('Escape'); assert.equal(await button('right', 1).getAttribute('aria-expanded'), 'false'); assert.equal(await button('left', 0).getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape'); assert.equal(await button('left', 0).getAttribute('aria-expanded'), 'false');
    await page.evaluate(`(${installThreadMetrics.toString()})()`);
    assert.equal(await page.locator('[data-codex-thread-metrics]').count(), 2); assert.equal(await page.locator('#codex-thread-metrics-style').count(), 1);
    await button('right', 2).click();
    await page.evaluate(() => { window.fixtureRight = document.getElementById('right'); window.fixtureRight.remove(); window.__codexThreadMetrics.refresh(); });
    assert.equal(await page.locator('[data-codex-thread-metrics-popover]').count(), 0); assert.match(await rows('left').textContent(), /333 tok/);
    await page.evaluate(() => { document.querySelector('.shell').append(window.fixtureRight); window.__codexThreadMetrics.refresh(); }); await put(ids[1]);
    assert.equal(await rows('right').count(), 1);
    await page.evaluate(() => window.__codexThreadMetrics.destroy());
    assert.equal(await page.locator('[data-codex-thread-metrics],[data-codex-thread-metrics-popover],#codex-thread-metrics-style').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS two-pane accounting, per-pane current identity, same-DOM switch races, shared reads/cache, local failure, private-field boundaries, fixed details, unique ARIA, Escape ownership and cleanup');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
