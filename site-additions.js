/* Safe add-on: existing app.js (including 30-second sheet refresh) remains unchanged. */
(() => {
  'use strict';
  function install() {
  const header = document.querySelector('.site-header-inner');
  if (header && !document.getElementById('discordCta')) {
    const configured = window.WALLHOPS_CONFIG && window.WALLHOPS_CONFIG.discordUrl;
    let invite = '';
    try {
      const parsed = new URL(String(configured || '').trim());
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') invite = parsed.href;
    } catch (_) { /* No invite URL configured yet. */ }
    const button = document.createElement(invite ? 'a' : 'span');
    button.id = 'discordCta';
    button.className = 'discord-cta' + (invite ? '' : ' is-unconfigured');
    if (invite) {
      button.href = invite;
      button.target = '_blank';
      button.rel = 'noopener noreferrer';
      button.setAttribute('aria-label', 'Join Discord (opens in a new tab)');
    } else {
      button.title = 'Add your Discord invite link to discordUrl in config.js';
    }
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19.73 5.12a18.9 18.9 0 0 0-4.72-1.47l-.58 1.19a17.9 17.9 0 0 0-4.86 0l-.59-1.19a18.9 18.9 0 0 0-4.71 1.47C1.3 9.48.49 13.74.9 17.94a19.1 19.1 0 0 0 5.78 2.92l1.24-2.02c-.67-.25-1.32-.56-1.94-.92l.47-.36c3.73 1.71 7.93 1.71 11.62 0l.47.36c-.62.36-1.27.67-1.94.92l1.24 2.02a19.1 19.1 0 0 0 5.78-2.92c.49-4.87-.83-9.09-3.89-12.82ZM8.52 15.37c-1.12 0-2.05-1.02-2.05-2.26s.9-2.26 2.05-2.26c1.16 0 2.07 1.02 2.05 2.26 0 1.24-.9 2.26-2.05 2.26Zm6.96 0c-1.12 0-2.05-1.02-2.05-2.26s.9-2.26 2.05-2.26c1.16 0 2.07 1.02 2.05 2.26 0 1.24-.89 2.26-2.05 2.26Z"/></svg><span>Discord</span>';
    header.appendChild(button);
  }
  // Capture the existing Rules button click before the old modal listener.
  if (!document.body.classList.contains('rules-page')) {
    document.addEventListener('click', (event) => {
      if (!event.target.closest('#rulesButton')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign(new URL('./rules.html', window.location.href).href);
    }, true);
  }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, {once:true});
  } else {
    install();
  }
})();
