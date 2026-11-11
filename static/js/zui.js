/* Small shared kit for the newer panels (email, personality, memory, invites, team chat):
   one modal shell, fetch helper, escaping, relative time. Classes are prefixed zu-. */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, t) => { if (window.showToast) window.showToast(m, t || ''); };
  async function call(path, opts = {}) {
    const o = { credentials: 'same-origin', method: opts.method || 'GET' };
    if (opts.body !== undefined) { o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(opts.body); }
    const r = await fetch(path, o);
    let d = {}; try { d = await r.json(); } catch (e) {}
    if (!r.ok) { const err = new Error(d.detail || 'Something went wrong. Please try again.'); err.status = r.status; throw err; }
    return d;
  }
  function ago(iso) {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const P = {
    x: '<path d="M6 6l12 12M18 6 6 18"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', back: '<path d="M15 6l-6 6 6 6"/>',
    spark: '<path d="M12 3l1.900 5.100L19 10l-5.100 1.900L12 17l-1.900-5.100L5 10l5.100-1.900z"/><path d="M19 15l.800 2.200L22 18l-2.200.800L19 21l-.800-2.200L16 18l2.200-.800z"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.500 2 4 2 4-2 4-2M9 9.500h.01M15 9.500h.01"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M9 8h6"/>',
    code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.500 5l-3 14"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.400 0 2-1 2-2 0-1.700-1-2 0-3 1.200-1.200 7 .500 7-4.500C21 6.500 17 3 12 3z"/><circle cx="7.500" cy="11" r="1"/><circle cx="10.500" cy="7.500" r="1"/><circle cx="15" cy="8" r="1"/>',
    flag: '<path d="M5 21V4M5 4h11l-1.500 4L16 12H5"/>',
    laugh: '<circle cx="12" cy="12" r="9"/><path d="M7.500 13h9a4.500 4.500 0 0 1-9 0zM8 9l1.500 1L8 11M16 9l-1.500 1L16 11"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.500V16c0 1.500 2.700 3 6 3s6-1.500 6-3v-4.500M22 9v5"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.500 6.500l4 4"/>',
    pin: '<path d="M9 3h6l-1 6 3 3H7l3-3z"/><path d="M12 12v9"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.500-3.500"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 0V7a3 3 0 0 0-3-3zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 0"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    gift: '<path d="M20 12v8H4v-8M2 7h20v5H2zM12 20V7M12 7H8a2.500 2.500 0 0 1 0-5c3 0 4 5 4 5zM12 7h4a2.500 2.500 0 0 0 0-5c-3 0-4 5-4 5z"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M10 17h4"/>',
    send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
    reply: '<path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 6 6v1"/>',
    more: '<circle cx="5" cy="12" r="1.500"/><circle cx="12" cy="12" r="1.500"/><circle cx="19" cy="12" r="1.500"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    users: '<circle cx="9" cy="8" r="3.500"/><path d="M2.500 20a6.500 6.500 0 0 1 13 0M16 4.500a3.500 3.500 0 0 1 0 7M18 14.500a6 6 0 0 1 3.500 5.500"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    wand: '<path d="M5 19 16 8M14 6l4 4M18 3v3M16.500 4.500h3M6 5v2M5 6h2M19 15v2M18 16h2"/>',
  };
  const icon = (n, cls) => `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || P.spark}</svg>`;

  /* modal({ id, title, sub, wide, lock }) → { el, body, head, close, onClose } */
  function modal(o) {
    const old = document.getElementById(o.id); if (old) old.remove();
    const d = document.createElement('div');
    d.id = o.id; d.className = 'zu-modal' + (o.cls ? ' ' + o.cls : '');
    d.innerHTML = `<div class="zu-box${o.wide ? ' wide' : ''}${o.tall ? ' tall' : ''}" role="dialog" aria-modal="true" aria-label="${esc(o.title || '')}">
      <div class="zu-head"><div class="zu-head-t">${o.icon ? `<span class="zu-head-ic">${icon(o.icon)}</span>` : ''}<div><h3>${esc(o.title || '')}</h3>${o.sub ? `<p>${esc(o.sub)}</p>` : ''}</div></div>
        <div class="zu-head-r"></div>${o.lock ? '' : `<button class="zu-x" aria-label="Close">${icon('x')}</button>`}</div>
      <div class="zu-body"></div></div>`;
    document.body.appendChild(d);
    const api = { el: d, body: d.querySelector('.zu-body'), head: d.querySelector('.zu-head-r'), onClose: null };
    const key = (e) => { if (e.key === 'Escape' && !o.lock && document.body.contains(d)) { const tops = document.querySelectorAll('.zu-modal'); if (tops[tops.length - 1] === d) api.close(); } };
    api.close = () => { document.removeEventListener('keydown', key); d.remove(); if (api.onClose) { try { api.onClose(); } catch (e) {} } };
    if (!o.lock) {
      d.addEventListener('mousedown', (e) => { if (e.target === d) api.close(); });
      d.querySelector('.zu-x').onclick = api.close;
      document.addEventListener('keydown', key);
    }
    return api;
  }
  async function confirmBox(title, text, danger) {
    if (window.showConfirm) return window.showConfirm(title, text, !!danger);
    return window.confirm(title + '\n\n' + text);
  }
  window.ZUI = { esc, toast, call, ago, icon, modal, confirmBox };
})();
