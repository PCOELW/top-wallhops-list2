/* TTWL Victors: read published data/victors.json, show a vertical list for the selected wallhop.
   This file is independent of app.js, config.js and sheet-sync scripts. */
(() => {
  'use strict';
  const DATA_URL = './data/victors.json';
  const $ = id => document.getElementById(id);
  let data = null;
  let fetching = false;
  let lastSelection = '';

  // Keep matching tolerant of Google Sheets formatting: whitespace, smart quotes,
  // Unicode variants, and punctuation differences do not change the wallhop identity.
  function clean(value) {
    return String(value ?? '')
      .normalize('NFKC')
      .replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
      .replace(/[\u2018\u2019\u201b\u00b4\u0060]/g, "'")
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');
  }
  function signature(value) {
    return clean(value).replace(/[^\p{L}\p{N}]+/gu, '');
  }
  function platform() {
    const active = document.querySelector('[data-platform].is-active');
    const candidate = active?.dataset.platform || location.hash.slice(1).toLowerCase();
    return ['pc', 'mobile', 'legacy'].includes(candidate) ? candidate : 'pc';
  }
  function currentTitle() {
    return ($('detailTitle')?.textContent || '').trim();
  }
  function createPanel() {
    const details = $('detailPanel');
    if (!details) return null;
    let panel = $('victorsPanel');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'victorsPanel';
    panel.className = 'ttwl-victors';
    panel.setAttribute('aria-label', 'Victors');
    const head = document.createElement('div');
    head.className = 'ttwl-victors-heading';
    const h3 = document.createElement('h3');
    h3.textContent = 'Victors';
    const count = document.createElement('span');
    count.id = 'victorsCount';
    head.append(h3, count);
    const list = document.createElement('ol');
    list.id = 'victorsList';
    list.className = 'ttwl-victors-list';
    panel.append(head, list);
    const buttons = details.querySelector('.detail-buttons');
    if (buttons) details.insertBefore(panel, buttons);
    else details.append(panel);
    return panel;
  }
  function matches(section, title) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) return [];
    const entries = Object.entries(section).filter(([, value]) => Array.isArray(value));
    const wanted = clean(title);
    let exact = entries.filter(([key]) => clean(key) === wanted);
    if (exact.length === 1) return exact[0][1];
    // Only use punctuation-insensitive matching when it uniquely identifies one title.
    const target = signature(title);
    if (target.length < 4) return [];
    const sameSignature = entries.filter(([key]) => signature(key) === target);
    return sameSignature.length === 1 ? sameSignature[0][1] : [];
  }
  function getPlayers(title) {
    if (!data) return [];
    // Never match the other platform's Victors to a wallhop of the current platform.
    const currentPlatform = platform();
    const fromPlatform = matches(data[currentPlatform], title);
    // An archived wallhop must not accidentally inherit Victors from PC/Mobile.
    const fromAll = currentPlatform === 'legacy' ? [] : matches(data.all, title);
    const names = fromPlatform.length ? fromPlatform : fromAll;
    const result = [], seen = new Set();
    for (const item of names) {
      if (typeof item !== 'string' || !item.trim()) continue;
      const name = item.trim();
      const key = name.toLocaleLowerCase('en');
      if (!seen.has(key)) { result.push(name); seen.add(key); }
    }
    return result;
  }
  function render() {
    const panel = createPanel();
    const count = $('victorsCount');
    const list = $('victorsList');
    if (!panel || !count || !list) return;
    const title = currentTitle();
    if (!title || /^(no selection|select a wallhop)$/i.test(title)) {
      panel.hidden = true;
      return;
    }
    // User wants Victors ONLY on PC and Legacy, not on Mobile.
    // Use inline display too: site styles can override the [hidden] attribute.
    if (platform() === 'mobile') {
      panel.hidden = true;
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';
    panel.hidden = false;
    const players = getPlayers(title);
    count.textContent = `${players.length} player${players.length === 1 ? '' : 's'}`;
    const fragment = document.createDocumentFragment();
    if (!players.length) {
      const item = document.createElement('li');
      item.className = 'ttwl-victors-empty';
      item.textContent = !data ? 'Loading Victors...' : `No Victors matched for this wallhop.`;
      fragment.appendChild(item);
    } else {
      players.forEach((player, index) => {
        const item = document.createElement('li');
        item.className = 'ttwl-victor-item';
        const number = document.createElement('span');
        number.className = 'ttwl-victor-number';
        number.textContent = String(index + 1).padStart(2, '0');
        const name = document.createElement('a');
        name.className = 'ttwl-victor-name ttwl-victor-link';
        name.href = './leaderboard.html?player=' + encodeURIComponent(player);
        name.title = 'See ' + player + ' on the player leaderboard';
        name.textContent = player;
        item.append(number, name);
        fragment.appendChild(item);
      });
    }
    list.replaceChildren(fragment);
  }
  async function refresh() {
    if (fetching) return;
    fetching = true;
    try {
      const response = await fetch(DATA_URL + '?t=' + Date.now(), { cache:'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const received = await response.json();
      if (!received || typeof received !== 'object' || !['pc','mobile','all'].some(k => received[k] && typeof received[k] === 'object')) {
        throw new Error('Victors JSON structure was not recognized.');
      }
      data = received;
      render();
    } catch (error) {
      console.warn('[TTWL Victors] Could not load Victors data:', error.message);
      render();
    } finally { fetching = false; }
  }
  function selectionChanged() {
    const next = platform() + ':' + currentTitle();
    if (next !== lastSelection) {
      lastSelection = next;
      render();
    }
  }
  function init() {
    createPanel();
    if (!document.getElementById('ttwl-victor-link-style')) {
      const style = document.createElement('style');
      style.id = 'ttwl-victor-link-style';
      style.textContent = '.ttwl-victor-link{color:inherit;text-decoration:none;cursor:pointer}.ttwl-victor-link:hover{text-decoration:underline;color:#dceafd}.ttwl-victor-link:focus-visible{outline:2px solid #9db4db;outline-offset:2px;border-radius:3px}';
      document.head.appendChild(style);
    }
    render();
    const target = $('detailTitle');
    if (target) new MutationObserver(selectionChanged).observe(target, {childList:true,characterData:true,subtree:true});
    document.querySelectorAll('[data-platform]').forEach(tab => tab.addEventListener('click', () => setTimeout(selectionChanged, 0)));
    window.addEventListener('hashchange', selectionChanged);
    // Also detects platform/title changes made by external JS without dispatching events.
    setInterval(selectionChanged, 1000);
    refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
