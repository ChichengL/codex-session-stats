function installProjectColors() {
  const VERSION = 2;
  const KEY = '__codexProjectColors';
  const PREFIX = 'codex-session-stats.project-color.v1:';
  const ROW = '[data-app-action-sidebar-project-row][data-app-action-sidebar-project-id]';
  const MARK = 'data-codex-project-color';
  if (window[KEY]?.version === VERSION) { window[KEY].refresh(); return; }
  window[KEY]?.destroy?.();
  const colors = [
    ['red', '红色', '#ff5f57', '#cf4b43'], ['orange', '橙色', '#ff9f0a', '#b76c10'], ['yellow', '黄色', '#ffd60a', '#92700b'],
    ['green', '绿色', '#30d158', '#268347'], ['blue', '蓝色', '#0a84ff', '#2674bf'], ['purple', '紫色', '#bf5af2', '#9950c0'], ['gray', '灰色', '#98989d', '#717980']
  ];
  const allowed = new Set(colors.map(c => c[0]));
  const menus = new Map();
  let disposed = false;
  let refreshTimer = null;
  let storageAvailable = true;
  const style = document.createElement('style');
  style.id = 'codex-project-colors-style';
  const iconRules = (selector, dark = false) => colors.map(([id, , darkColor, lightColor]) =>
    `${selector} [${MARK}="${id}"], ${selector} [${MARK}="${id}"] svg { color: ${dark ? darkColor : lightColor} !important; }`).join('\n');
  style.textContent = iconRules('html') + iconRules('html.dark', true) + iconRules('html[data-theme="dark"]', true) + `
    @media (prefers-color-scheme: dark) { ${iconRules('html:not(.light):not([data-theme="light"])', true)} }

    [data-codex-project-palette] { flex-shrink: 0; box-sizing: border-box; min-width: 224px; margin-top: 6px; padding: 10px 8px 8px; border-top: 1px solid color-mix(in srgb, currentColor 14%, transparent); }
    [data-codex-project-palette] .project-colors-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 7px; font: 12px/18px -apple-system, BlinkMacSystemFont, sans-serif; color: inherit; }
    [data-codex-project-palette] .project-colors-label { opacity: .65; }
    [data-codex-project-palette] .project-colors-swatches { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
    [data-codex-project-palette] button { -webkit-app-region: no-drag; cursor: pointer; font: inherit; color: inherit; border: 0; background: none; outline: none; }
    [data-codex-project-palette] .project-color-swatch { width: 26px; height: 28px; flex: 0 0 26px; display: grid; place-items: center; border-radius: 6px; padding: 0; }
    [data-codex-project-palette] .project-color-swatch:hover, [data-codex-project-palette] button:focus-visible { background: color-mix(in srgb, currentColor 12%, transparent); }
    [data-codex-project-palette] button:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
    [data-codex-project-palette] .project-color-dot { width: 17px; height: 17px; border-radius: 50%; box-sizing: border-box; display: grid; place-items: center; box-shadow: inset 0 0 0 1px #0002; font: 700 11px/1 -apple-system, sans-serif; color: #fff; }
    [data-codex-project-palette] [aria-checked="true"] .project-color-dot { outline: 1.5px solid currentColor; outline-offset: 2px; }
    [data-codex-project-palette] .project-color-reset { font-size: 11px; padding: 2px 4px; border-radius: 4px; opacity: .8; }
    [data-codex-project-palette] .project-color-reset:disabled { opacity: .3; cursor: default; }
    [data-codex-project-palette] .project-color-error { margin-top: 5px; font: 11px/16px -apple-system, sans-serif; color: #ff9587; }
  `;
  function projectKey(row) {
    const id = row?.getAttribute('data-app-action-sidebar-project-id');
    if (!id || id.length > 512) return null;
    const kind = row.querySelector('[data-sidebar-project-kind]')?.getAttribute('data-sidebar-project-kind')
      ?? row.closest('[data-sidebar-project-kind]')?.getAttribute('data-sidebar-project-kind') ?? 'project';
    return PREFIX + kind + ':' + id;
  }
  function readColor(key) {
    try { const value = localStorage.getItem(key); storageAvailable = true; return allowed.has(value) ? value : null; }
    catch { storageAvailable = false; return null; }
  }
  function paintRows() {
    for (const row of document.querySelectorAll(ROW)) {
      const key = projectKey(row);
      const icon = row.querySelector('[data-sidebar-project-container-id^="project:"]') ?? row.querySelector('.icon-leading-slot');
      if (!icon || !key) continue;
      const color = readColor(key);
      if (color) { if (icon.getAttribute(MARK) !== color) icon.setAttribute(MARK, color); }
      else icon.removeAttribute(MARK);
    }
  }
  function dismiss(menu) {
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  }
  function attachPalette(menu, row) {
    const key = projectKey(row);
    if (!key) return;
    const existing = menus.get(menu);
    if (existing?.key === key && existing.root.isConnected) { existing.render(); return; }
    existing?.dispose();
    const root = document.createElement('div');
    root.setAttribute('data-codex-project-palette', '');
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', '文件夹颜色');
    const heading = document.createElement('div'); heading.className = 'project-colors-heading';
    const label = document.createElement('span'); label.className = 'project-colors-label'; label.textContent = '文件夹颜色';
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'project-color-reset'; reset.textContent = '恢复默认'; reset.setAttribute('role', 'menuitem');
    heading.append(label, reset);
    const swatches = document.createElement('div'); swatches.className = 'project-colors-swatches';
    const error = document.createElement('div'); error.className = 'project-color-error'; error.setAttribute('role', 'status'); error.hidden = true;
    const buttons = colors.map(([id, name, color]) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'project-color-swatch';
      button.dataset.color = id; button.setAttribute('aria-label', name); button.setAttribute('role', 'menuitemradio'); button.title = name;
      const dot = document.createElement('span'); dot.className = 'project-color-dot'; dot.style.background = color; dot.setAttribute('aria-hidden', 'true');
      if (id === 'yellow' || id === 'orange' || id === 'green') dot.style.color = '#17261b';
      button.append(dot); button.addEventListener('click', e => { e.stopPropagation(); save(id); });
      swatches.append(button); return button;
    });
    function render() {
      const current = readColor(key);
      for (const button of buttons) {
        const selected = current === button.dataset.color;
        button.setAttribute('aria-checked', String(selected));
        const dot = button.firstElementChild;
        const text = selected ? '✓' : '';
        if (dot.textContent !== text) dot.textContent = text;
      }
      reset.disabled = current === null;
    }
    function save(color) {
      // Re-read the identity before writing: a virtualized row may have been reused.
      if (!row.isConnected || projectKey(row) !== key) { dismiss(menu); return; }
      try {
        if (color === null) localStorage.removeItem(key); else localStorage.setItem(key, color);
        storageAvailable = true;
      } catch {
        storageAvailable = false; error.hidden = false; error.textContent = '颜色保存失败，请重试'; return;
      }
      paintRows(); render(); dismiss(menu);
    }
    reset.addEventListener('click', e => { e.stopPropagation(); save(null); });
    root.addEventListener('pointerdown', e => e.stopPropagation());
    root.append(heading, swatches, error);
    menu.append(root);
    function onKeyDown(event) {
      const nativeItems = [...menu.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]')]
        .filter(el => !root.contains(el) && el.getAttribute('aria-disabled') !== 'true' && el.getClientRects().length);
      const choices = [...buttons, ...(!reset.disabled ? [reset] : [])];
      const index = choices.indexOf(event.target);
      if (root.contains(event.target)) {
        if (event.key === 'Escape') return;
        if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); event.target.click(); return; }
        let next;
        if (event.key === 'Home') next = choices[0];
        else if (event.key === 'End') next = choices.at(-1);
        else if (['ArrowRight', 'ArrowDown'].includes(event.key)) next = choices[(index + 1) % choices.length];
        else if (event.key === 'ArrowLeft') next = choices[(index - 1 + choices.length) % choices.length];
        else if (event.key === 'ArrowUp') next = index <= 0 ? nativeItems.at(-1) : choices[index - 1];
        else if (event.key === 'Tab') next = event.shiftKey ? (choices[index - 1] ?? nativeItems.at(-1)) : choices[index + 1];
        else return;
        event.preventDefault(); event.stopPropagation();
        if (next) next.focus({ preventScroll: true }); else dismiss(menu);
      } else if (event.target.closest('[role="menu"]') === menu &&
          ((event.key === 'ArrowDown' && event.target === nativeItems.at(-1)) || (event.key === 'Tab' && !event.shiftKey))) {
        event.preventDefault(); event.stopPropagation(); buttons[0].focus({ preventScroll: true });
      }
    }
    menu.addEventListener('keydown', onKeyDown, true);
    menus.set(menu, { key, root, render, dispose() { menu.removeEventListener('keydown', onKeyDown, true); root.remove(); } });
    render();
  }
  function refresh() {
    if (disposed || !document.body) return;
    if (!style.isConnected) (document.head ?? document.documentElement).append(style);
    paintRows();
    for (const [menu, entry] of menus) if (!menu.isConnected || menu.dataset.state === 'closed') { entry.dispose(); menus.delete(menu); }
    for (const menu of document.querySelectorAll('[role="menu"][aria-labelledby]')) {
      if (menu.dataset.state === 'closed' || !menu.getClientRects().length) continue;
      const trigger = document.getElementById(menu.getAttribute('aria-labelledby'));
      const row = trigger?.closest(ROW);
      if (row) attachPalette(menu, row);
    }
  }
  function scheduleRefresh() {
    if (disposed || refreshTimer !== null) return;
    refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, 60);
  }
  function openProjectMenu(event) {
    if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]')) return;
    const row = event.target instanceof Element ? event.target.closest(ROW) : null;
    const trigger = row?.querySelector('button[aria-haspopup="menu"]');
    if (!row || !trigger || trigger.disabled || !projectKey(row)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    // Reuse the app's own dropdown and actions instead of copying native menu logic.
    if (trigger.getAttribute('aria-expanded') !== 'true') trigger.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, button: 0, pointerType: 'mouse'
    }));
    scheduleRefresh();
  }
  function onContextKey(event) {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) openProjectMenu(event);
  }
  function onStorage(event) { if (event.key === null || event.key.startsWith(PREFIX)) scheduleRefresh(); }
  const observer = new MutationObserver(records => {
    if (records.some(record => !record.target.closest?.('[data-codex-project-palette]') && record.target !== style)) scheduleRefresh();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-app-action-sidebar-project-id', 'data-sidebar-project-kind', 'data-state'] });
  document.addEventListener('contextmenu', openProjectMenu, true);
  document.addEventListener('keydown', onContextKey, true);
  window.addEventListener('storage', onStorage);
  window[KEY] = {
    version: VERSION, refresh,
    status() { return { version: VERSION, projectRows: document.querySelectorAll(ROW).length,
      coloredIcons: document.querySelectorAll(`[${MARK}]`).length, palettes: [...menus.values()].filter(e => e.root.isConnected).length, storageAvailable }; },
    destroy({ clearStorage = false } = {}) {
      disposed = true; observer.disconnect(); clearTimeout(refreshTimer);
      document.removeEventListener('contextmenu', openProjectMenu, true);
      document.removeEventListener('keydown', onContextKey, true);
      window.removeEventListener('storage', onStorage);
      for (const entry of menus.values()) entry.dispose(); menus.clear(); style.remove();
      for (const icon of document.querySelectorAll(`[${MARK}]`)) icon.removeAttribute(MARK);
      if (clearStorage) try { for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key); } catch {}
      delete window[KEY];
    }
  };
  refresh();
}
