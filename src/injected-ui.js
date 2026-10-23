function installUsageBadge() {
  const VERSION = 46;
  const KEY = '__codexUsageBadge';
  if (window[KEY]?.version === VERSION) {
    window[KEY].place();
    return;
  }
  window[KEY]?.destroy?.();
  const badge = document.createElement('div');
  badge.id = 'codex-session-stats';
  badge.tabIndex = 0;
  badge.setAttribute('role', 'meter');
  badge.setAttribute('aria-valuemin', '0');
  badge.setAttribute('aria-valuemax', '100');
  badge.setAttribute('aria-describedby', 'codex-usage-tooltip');
  function meterMarkup(suffix = '') {
    return `<svg class="usage-ring" viewBox="0 0 36 36" aria-hidden="true">
    <defs><linearGradient id="codex-usage-ring-gradient${suffix}" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop class="usage-gradient-start" offset="0%"/><stop class="usage-gradient-end" offset="100%"/>
    </linearGradient></defs>
    <circle class="usage-ring-track" cx="18" cy="18" r="14"/>
    <circle class="usage-ring-value" cx="18" cy="18" r="14" pathLength="100"/>
  </svg><span class="usage-number">—</span><span class="usage-window"></span>`;
  }
  const primaryMeter = document.createElement('div');
  primaryMeter.className = 'usage-primary';
  primaryMeter.innerHTML = meterMarkup();
  const secondaryMeter = document.createElement('div');
  secondaryMeter.className = 'usage-secondary';
  secondaryMeter.innerHTML = meterMarkup('-weekly');
  secondaryMeter.hidden = true;
  badge.append(primaryMeter, secondaryMeter);
  const tooltip = document.createElement('div');
  tooltip.id = 'codex-usage-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  const style = document.createElement('style');
  style.id = 'codex-session-stats-style';
  const darkPalette = `
      --usage-normal-color: #12f594; --usage-normal-soft: #25d887; --usage-normal-track: #1c6349; --usage-normal-glow: #0be38c1a;
      --usage-warning-color: #ffd279; --usage-warning-soft: #e8aa4c; --usage-warning-track: #69522e; --usage-warning-glow: #ffb53c16;
      --usage-danger-color: #ff9587; --usage-danger-soft: #e76964; --usage-danger-track: #683e3b; --usage-danger-glow: #ff746516;
      --usage-muted-color: #9caaa2; --usage-muted-soft: #7b8981; --usage-muted-track: #505853; --usage-muted-glow: transparent;
      --usage-text: #f5f7f5; --usage-label: #b6bbb7;
      --usage-border: #ffffff17; --usage-border-hover: #ffffff29;
      --usage-surface: linear-gradient(145deg, #414341 0%, #292b29 52%, #363936 100%);
      --usage-shadow: inset 0 1px 1px #ffffff12, inset 0 -1px 1px #0002, 0 2px 5px #0002;
  `;
  style.textContent = `
    #codex-session-stats {
      --usage-normal-color: #0b805b; --usage-normal-soft: #168e65; --usage-normal-track: #d7e7df; --usage-normal-glow: #168e6508;
      --usage-warning-color: #9e6c14; --usage-warning-soft: #b8811c; --usage-warning-track: #efe5cf; --usage-warning-glow: #b8811c08;
      --usage-danger-color: #bc4744; --usage-danger-soft: #d45d56; --usage-danger-track: #f1ddda; --usage-danger-glow: #d45d5608;
      --usage-muted-color: #77858e; --usage-muted-soft: #8c979f; --usage-muted-track: #e0e5e8; --usage-muted-glow: transparent;
      --usage-text: #25313a; --usage-label: #65737c;
      --usage-border: #52647424; --usage-border-hover: #52647440;
      --usage-surface: linear-gradient(145deg, #fcfdfd 0%, #f3f5f6 52%, #e9eef0 100%);
      --usage-shadow: inset 0 1px 0 #fff, inset 0 -1px 1px #23324008, 0 2px 5px #26384712;
      --usage-color: var(--usage-normal-color); --usage-soft: var(--usage-normal-soft);
      --usage-ring-track: var(--usage-normal-track); --usage-glow: var(--usage-normal-glow);
      --usage-width: 34px; --usage-ring-size: 26px;
      position: relative; box-sizing: border-box; width: var(--usage-width); height: 84px; flex: 0 0 84px;
      align-self: center; margin: 0 0 2px; padding: 37px 2px 10px;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
      border: 1px solid var(--usage-border); border-radius: calc(var(--usage-width) / 2); outline: none; color: var(--usage-text);
      background: radial-gradient(ellipse at 50% 17px, var(--usage-glow), transparent 69%),
        var(--usage-surface);
      box-shadow: var(--usage-shadow);
      cursor: default; user-select: none;
      -webkit-app-region: no-drag; font-family: inherit;
      font-variant-numeric: tabular-nums; line-height: 1;
    }
    #codex-session-stats[hidden], #codex-usage-tooltip[hidden] { display: none !important; }
    #codex-session-stats .usage-primary { display: contents; }
    #codex-session-stats .usage-secondary[hidden] { display: none !important; }
    #codex-session-stats[data-mode="dual"] { height: 144px; flex-basis: 144px; justify-content: flex-start; padding: 37px 2px 8px; }
    #codex-session-stats .usage-secondary {
      --usage-color: var(--usage-normal-color); --usage-soft: var(--usage-normal-soft);
      --usage-ring-track: var(--usage-normal-track); --usage-glow: var(--usage-normal-glow);
      position: relative; box-sizing: border-box; width: 100%; flex: 0 0 64px;
      display: flex; flex-direction: column; align-items: center; padding: 33px 0 0; gap: 4px;
    }
    #codex-session-stats:hover { border-color: var(--usage-border-hover); }
    #codex-session-stats:focus-visible { outline: 1px solid var(--usage-color); outline-offset: 2px; }
    #codex-session-stats .usage-ring {
      display: block; position: absolute;
      width: var(--usage-ring-size); height: var(--usage-ring-size);
      top: calc((var(--usage-width) - var(--usage-ring-size)) / 2 - 1px);
      left: 50%; transform: translateX(-50%); overflow: visible;
    }
    #codex-session-stats .usage-ring circle { fill: none; stroke-width: 4; }
    #codex-session-stats .usage-secondary .usage-ring { top: 0; }
    #codex-session-stats .usage-ring-track { stroke: var(--usage-ring-track); }
    #codex-session-stats .usage-gradient-start { stop-color: var(--usage-soft); }
    #codex-session-stats .usage-gradient-end { stop-color: var(--usage-color); }
    #codex-session-stats .usage-ring-value {
      stroke: url(#codex-usage-ring-gradient); stroke-linecap: round;
      transform: rotate(-90deg); transform-origin: 18px 18px;
      stroke-dasharray: 100; stroke-dashoffset: 100; opacity: 0;
      filter: drop-shadow(0 0 2px var(--usage-glow));
      transition: stroke-dashoffset 240ms ease;
    }
    #codex-session-stats .usage-secondary .usage-ring-value { stroke: url(#codex-usage-ring-gradient-weekly); }
    #codex-session-stats .usage-number { font-size: 11px; line-height: 14px; font-weight: 700; letter-spacing: -.3px; white-space: nowrap; }
    #codex-session-stats .usage-window { font-size: 7.5px; line-height: 9px; font-weight: 400; color: var(--usage-label); white-space: nowrap; }
    #codex-session-stats[data-tone="warning"], #codex-session-stats .usage-secondary[data-tone="warning"] { --usage-color: var(--usage-warning-color); --usage-soft: var(--usage-warning-soft); --usage-ring-track: var(--usage-warning-track); --usage-glow: var(--usage-warning-glow); }
    #codex-session-stats[data-tone="danger"], #codex-session-stats .usage-secondary[data-tone="danger"] { --usage-color: var(--usage-danger-color); --usage-soft: var(--usage-danger-soft); --usage-ring-track: var(--usage-danger-track); --usage-glow: var(--usage-danger-glow); }
    #codex-session-stats[data-tone="muted"], #codex-session-stats .usage-secondary[data-tone="muted"] { --usage-color: var(--usage-muted-color); --usage-soft: var(--usage-muted-soft); --usage-ring-track: var(--usage-muted-track); --usage-glow: var(--usage-muted-glow); }
    html.dark #codex-session-stats, html[data-theme="dark"] #codex-session-stats { ${darkPalette} }
    @media (prefers-color-scheme: dark) {
      html:not(.light):not([data-theme="light"]) #codex-session-stats { ${darkPalette} }
    }
    #codex-usage-tooltip {
      box-sizing: border-box; position: fixed; z-index: 2147483000;
      max-width: min(300px, calc(100vw - 16px)); padding: 10px 12px;
      border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 10px;
      background: var(--color-surface-elevated-secondary, #f8f8f7);
      color: var(--color-text-primary, #303630);
      box-shadow: 0 4px 18px #0002; pointer-events: none;
      font: 12px/1.65 -apple-system, BlinkMacSystemFont, sans-serif;
      white-space: pre-line; -webkit-app-region: no-drag;
    }
    html.dark #codex-usage-tooltip, html[data-theme="dark"] #codex-usage-tooltip {
      background: var(--color-surface-elevated-secondary, #2c2e2c);
      color: var(--color-text-primary, #edf0ed);
    }
    @media (prefers-color-scheme: dark) {
      html:not(.light):not([data-theme="light"]) #codex-usage-tooltip {
        background: var(--color-surface-elevated-secondary, #2c2e2c); color: var(--color-text-primary, #edf0ed);
      }
    }
    @media (prefers-reduced-motion: reduce) { #codex-session-stats .usage-ring-value { transition: none; } }
  `;
  let value = { percent: null, title: '正在读取 Codex 剩余用量', tone: 'muted', windowLabel: '', mode: 'single', rings: null };
  let placementTimer = null;
  let hoverTimer = null;
  let rail = null;
  let disposed = false;
  // A dead agent must not leave a healthy-looking quota indefinitely.
  function expireValue() {
    if (disposed || value.stale || !Number.isFinite(value.updatedAt) || Date.now() - value.updatedAt < 150000) return;
    value = { ...value, stale: true, percent: null, tone: 'muted', title: '用量数据已过期，正在等待重新连接',
      rings: value.rings?.map(ring => ({ ...ring, percent: null, tone: 'muted', title: `${ring.label}：暂不可用` })) ?? null };
    render();
  }
  const freshnessTimer = setInterval(expireValue, 1000);
  const visible = (el) => {
    if (!el?.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  function hideTooltip() {
    clearTimeout(hoverTimer);
    hoverTimer = null;
    tooltip.hidden = true;
  }
  function positionTooltip() {
    const r = badge.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(r.right + 12, innerWidth - tooltip.offsetWidth - 8))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(r.top, innerHeight - tooltip.offsetHeight - 8))}px`;
  }
  function showTooltip() {
    clearTimeout(hoverTimer);
    if (!visible(badge) || document.hidden || disposed) return;
    tooltip.hidden = false;
    positionTooltip();
  }
  function scheduleTooltip() {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(showTooltip, 350);
  }
  function renderMeter(element, meter, accessible = true) {
    const percent = Number.isFinite(meter.percent) ? Math.max(0, Math.min(100, Math.round(meter.percent))) : null;
    const number = percent === null ? '—' : `${percent}%`;
    element.dataset.tone = meter.tone;
    if (element.querySelector('.usage-window').textContent !== meter.label) element.querySelector('.usage-window').textContent = meter.label;
    if (element.querySelector('.usage-number').textContent !== number) element.querySelector('.usage-number').textContent = number;
    const ring = element.querySelector('.usage-ring-value');
    ring.style.strokeDashoffset = String(100 - (percent ?? 0));
    ring.style.opacity = percent !== null && percent > 0 ? '1' : '0';
    if (accessible) {
      element.setAttribute('role', 'meter');
      element.setAttribute('aria-label', meter.label);
      element.setAttribute('aria-valuemin', '0'); element.setAttribute('aria-valuemax', '100');
      element.setAttribute('aria-valuetext', meter.title);
      if (percent === null) element.removeAttribute('aria-valuenow');
      else element.setAttribute('aria-valuenow', String(percent));
    } else {
      for (const attr of ['role', 'aria-label', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext']) element.removeAttribute(attr);
    }
  }
  function render() {
    const dual = value.mode === 'dual' && value.rings?.length === 2;
    const percent = Number.isFinite(value.percent) ? Math.max(0, Math.min(100, Math.round(value.percent))) : null;
    badge.dataset.mode = dual ? 'dual' : 'single';
    badge.dataset.tone = dual ? value.rings[0].tone : value.tone;
    secondaryMeter.hidden = !dual;
    renderMeter(primaryMeter, dual ? value.rings[0] : {
      ...value, label: value.windowLabel === '周' ? '周额度' : percent === null ? '用量' : '5h额度'
    }, dual);
    if (dual) renderMeter(secondaryMeter, value.rings[1]);
    badge.setAttribute('role', dual ? 'group' : 'meter');
    badge.setAttribute('aria-label', 'Codex 剩余用量');
    if (dual) {
      for (const attr of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext']) badge.removeAttribute(attr);
    } else {
      badge.setAttribute('aria-valuemin', '0'); badge.setAttribute('aria-valuemax', '100');
      badge.setAttribute('aria-valuetext', value.title);
      if (percent === null) badge.removeAttribute('aria-valuenow');
      else badge.setAttribute('aria-valuenow', String(percent));
    }
    if (tooltip.textContent !== value.title) tooltip.textContent = value.title;
  }
  function place() {
    if (disposed || !document.body) return;
    if (!style.isConnected) (document.head ?? document.documentElement).appendChild(style);
    if (!tooltip.isConnected) document.body.appendChild(tooltip);
    const nextRail = [...document.querySelectorAll('nav[data-app-navigation-rail]')].find(visible);
    if (rail !== nextRail) {
      if (rail) resizeObserver.unobserve(rail);
      rail = nextRail ?? null;
      if (rail) resizeObserver.observe(rail);
    }
    // The current app places its help/profile footer after the flexible navigation list.
    // Own a sibling before that footer; do not reparent any React-owned elements.
    const footer = rail && [...rail.children].filter(el => el !== badge && visible(el) && getComputedStyle(el).position !== 'absolute').at(-1);
    if (!rail || !footer) {
      badge.hidden = true;
      hideTooltip();
      return;
    }
    badge.hidden = false;
    if (badge.parentElement !== rail || badge.nextElementSibling !== footer) rail.insertBefore(badge, footer);
    if (!tooltip.hidden) positionTooltip();
  }
  function schedulePlacement() {
    if (disposed || placementTimer !== null) return;
    placementTimer = setTimeout(() => { placementTimer = null; place(); }, 100);
  }
  const observer = new MutationObserver(records => {
    if (records.some(r => !badge.contains(r.target) && !tooltip.contains(r.target) && r.target !== style)) schedulePlacement();
  });
  const resizeObserver = new ResizeObserver(schedulePlacement);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  badge.addEventListener('mouseenter', scheduleTooltip);
  badge.addEventListener('mouseleave', hideTooltip);
  badge.addEventListener('focus', showTooltip);
  badge.addEventListener('blur', hideTooltip);
  const onKeyDown = e => { if (e.key === 'Escape') hideTooltip(); };
  badge.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', schedulePlacement);
  document.addEventListener('visibilitychange', hideTooltip);
  window[KEY] = {
    version: VERSION,
    place,
    update(next) { value = { ...value, ...next }; expireValue(); render(); place(); },
    status() {
      return { version: VERSION, placed: badge.parentElement === rail && visible(badge) && !badge.hidden,
        percent: value.percent, windowLabel: value.windowLabel, tone: value.tone, mode: value.mode, rings: value.rings,
        updatedAt: value.updatedAt ?? null, stale: value.stale ?? false,
        badgeCount: document.querySelectorAll('#codex-session-stats').length };
    },
    destroy() {
      disposed = true;
      observer.disconnect();
      resizeObserver.disconnect();
      clearTimeout(placementTimer);
      clearInterval(freshnessTimer);
      hideTooltip();
      window.removeEventListener('resize', schedulePlacement);
      document.removeEventListener('visibilitychange', hideTooltip);
      badge.remove(); tooltip.remove(); style.remove();
      delete window[KEY];
    }
  };
  render();
  place();
}
