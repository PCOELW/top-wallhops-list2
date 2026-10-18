/* TTWL Victors vertical panel. Does not modify the existing app.js. */
(() => {
  'use strict';
  const FILE = './data/victors.json';
  const $ = id => document.getElementById(id);
  const keyOf = text => String(text || '').trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
  const platformOf = () => document.querySelector('[data-platform="mobile"].is-active') ? 'mobile' : 'pc';
  const titleOf = () => $('detailTitle')?.textContent?.trim() || '';
  let stored = null;
  let fetching = false;

  function ensurePanel() {
    if ($('victorsPanel')) return;
    const details = $('detailPanel');
    if (!details) return;
    const section = document.createElement('section');
    section.id = 'victorsPanel';
    section.className = 'ttwl-victors';
    section.setAttribute('aria-label', 'Victors');
    const head = document.createElement('div');
    head.className = 'ttwl-victors-heading';
    const heading = document.createElement('h3');
    heading.textContent = 'Victors';
    const count = document.createElement('span');
    count.id = 'victorsCount';
    head.append(heading, count);
    const list = document.createElement('ol');
    list.id = 'victorsList';
    list.className = 'ttwl-victors-list';
    section.append(head, list);
    const actions = details.querySelector('.detail-buttons');
    if (actions) details.insertBefore(section, actions);
    else details.append(section);
  }

  function render() {
    ensurePanel();
    const panel = $('victorsPanel');
    const list = $('victorsList');
    const count = $('victorsCount');
    if (!panel || !list || !count) return;
    const title = titleOf();
    if (!title || title === 'No selection' || title === 'Select a wallhop') {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const key = keyOf(title);
    const found = stored?.[platformOf()]?.[key] ?? stored?.all?.[key] ?? [];
    const players = Array.isArray(found) ? found.filter(x => typeof x === 'string' && x.trim()) : [];
    count.textContent = players.length ? `${players.length} player${players.length === 1 ? '' : 's'}` : '0 players';
    list.replaceChildren();
    if (!players.length) {
      const empty = document.createElement('li');
      empty.className = 'ttwl-victors-empty';
      empty.textContent = stored?.status === 'live' ? 'No Victors listed yet.' : 'Waiting for Victors data.';
      list.append(empty);
      return;
    }
    players.forEach((player, index) => {
      const item = document.createElement('li');
      item.className = 'ttwl-victor-item';
      const number = document.createElement('span');
      number.className = 'ttwl-victor-number';
      number.textContent = String(index + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'ttwl-victor-name';
      name.textContent = player;
      item.append(number, name);
      list.append(item);
    });
  }

  async function refresh() {
    if (fetching) return;
    fetching = true;
    try {
      const response = await fetch(FILE + '?v=' + Date.now(), {cache:'no-store'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data || typeof data !== 'object' || !data.pc || !data.mobile || !data.all) {
        throw new Error('Unexpected Victors format');
      }
      stored = data;
      render();
    } catch (error) {
      console.warn('TTWL Victors data:', error.message);
      // Keep the last successful Victors data if the fetch fails.
      render();
    } finally {
      fetching = false;
    }
  }

  function init() {
    ensurePanel();
    render();
    const title = $('detailTitle');
    if (title) new MutationObserver(render).observe(title, {childList:true, characterData:true, subtree:true});
    document.querySelectorAll('[data-platform]').forEach(tab => {
      tab.addEventListener('click', () => setTimeout(render, 0));
    });
    window.addEventListener('hashchange', render);
    refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
