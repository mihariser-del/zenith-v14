/* Account card: hover (or tap) your name at the bottom of the sidebar.
   Shows who you are, your plan, today's usage, a quick theme switch and shortcuts. window.ZPAcctMenu.init({ user }) */
(function () {
  'use strict';
  let U = null, el = null, openT = null, closeT = null, pinned = false;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sv = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    spark: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.500l5.1-1.900z"/>',
    brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 0V7a3 3 0 0 0-3-3z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 0"/>',
    gift: '<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 13h18M12 9v12M8.500 9a2.500 2.500 0 1 1 3.500-3.500V9M15.500 9A2.500 2.500 0 1 0 12 5.500"/>',
    star: '<path d="M12 3l2.7 5.600 6.100.9-4.400 4.300 1 6.100L12 17l-5.400 2.900 1-6.100L3.200 9.500l6.100-.9z"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    kbd: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5"/>',
  };
  Object.keys(IC).forEach((k) => { IC[k] = IC[k].replace(/(\d)?\.(\d)00\b/g, '$1.$2'); });

  function plan() { return (U.role === 'owner' || U.is_ultimate) ? 'Ultimate' : U.is_pro ? 'Pro' : (String(U.tags || '').split(',').includes('friend') ? 'Friend' : 'Free'); }
  function close() { clearTimeout(openT); clearTimeout(closeT); pinned = false; if (el) { el.remove(); el = null; document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', onKey, true); const a = document.querySelector('.user-profile-bar'); if (a) a.setAttribute('aria-expanded', 'false'); } }
  function outside(e) { if (el && !el.contains(e.target) && !e.target.closest('.user-profile-bar')) close(); }
  function onKey(e) { if (e.key === 'Escape') { close(); const a = document.getElementById('user-avatar'); if (a) a.focus(); } }
  function run(fn) { close(); try { fn(); } catch (e) { console.error(e); } }

  function open(pin) {
    clearTimeout(closeT);
    if (el) { if (pin) pinned = true; return; }
    pinned = !!pin;
    const bar = document.querySelector('.user-profile-bar'); if (!bar) return;
    const guest = (U.username || '').startsWith('guest_'), staff = U.is_admin || U.role === 'owner';
    const name = U.display_name || U.username, P = plan();
    const local = (typeof Settings !== 'undefined') ? Settings.getLocal() : { theme: 'auto' };
    const item = (id, ic, label, hint) => `<button type="button" role="menuitem" data-a="${id}">${sv(IC[ic])}<span>${label}</span>${hint ? `<kbd>${hint}</kbd>` : ''}</button>`;
    el = document.createElement('div');
    el.id = 'acct-menu'; el.className = 'zam'; el.setAttribute('role', 'menu'); el.setAttribute('aria-label', 'Account');
    el.innerHTML = `<div class="zam-top"><span class="zam-av">${esc((U.username || '?')[0].toUpperCase())}</span><div><b>${esc(guest ? 'Guest' : name)}</b><span>${guest ? 'Not signed in — chats aren\'t kept' : '@' + esc(U.username)}</span></div><i class="zam-plan p-${P.toLowerCase()}">${P}</i></div>
      <div class="zam-use" id="zam-use"><div class="zam-use-t"><span>Today</span><b id="zam-use-n">…</b></div><div class="zam-bars" id="zam-use-bars"></div><small id="zam-use-s"></small></div>
      <div class="zam-theme" role="radiogroup" aria-label="Theme">${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<button type="button" role="radio" aria-checked="${local.theme === v}" class="${local.theme === v ? 'on' : ''}" data-theme="${v}">${l}</button>`).join('')}</div>
      <div class="zam-list">
        ${guest ? item('signup', 'key', 'Create a free account') : ''}
        ${item('settings', 'settings', 'Settings')}
        ${guest ? '' : item('account', 'key', 'Account and password')}
        ${guest ? '' : item('persona', 'spark', 'Personality')}
        ${guest ? '' : item('memory', 'brain', 'Memory')}
        ${guest || P === 'Owner' ? '' : item('plans', 'star', P === 'Free' || P === 'Friend' ? 'See plans' : 'My plan')}
        ${guest ? '' : item('invite', 'gift', 'Invite friends')}
        ${item('feedback', 'chat', 'Send feedback')}
        ${item('news', 'news', 'What\'s new')}
        ${item('keys', 'kbd', 'Shortcuts')}
        ${staff ? item('vault', 'shield', 'Open the Vault') : ''}
      </div>
      <div class="zam-foot">${guest ? '' : '<button type="button" data-a="outall">Sign out other devices</button>'}<button type="button" class="out" data-a="logout">${sv(IC.out)}Log out</button></div>`;
    document.body.appendChild(el);
    bar.setAttribute('aria-expanded', 'true');
    // place it above the bar, inside the window
    const r = bar.getBoundingClientRect(), w = Math.min(300, window.innerWidth - 16);
    el.style.width = w + 'px';
    el.style.left = Math.max(8, Math.min(r.left + 6, window.innerWidth - w - 8)) + 'px';
    el.style.bottom = Math.max(8, window.innerHeight - r.top + 8) + 'px';
    el.style.maxHeight = Math.max(240, r.top - 16) + 'px';
    el.addEventListener('mouseenter', () => clearTimeout(closeT));
    el.addEventListener('mouseleave', () => { if (!pinned) closeT = setTimeout(close, 280); });
    el.addEventListener('click', (e) => {
      const th = e.target.closest('[data-theme]');
      if (th) { pinned = true; if (typeof Settings !== 'undefined') { Settings.saveLocal({ ...Settings.getLocal(), theme: th.dataset.theme }); Settings.apply(); } el.querySelectorAll('[data-theme]').forEach((b) => { b.classList.toggle('on', b === th); b.setAttribute('aria-checked', b === th); }); return; }
      const b = e.target.closest('[data-a]'); if (!b) return;
      const A = {
        signup: () => document.getElementById('logout-btn').click(),
        settings: () => Settings.open('general'), account: () => Settings.open('account'),
        persona: () => window.ZPPersona && window.ZPPersona.open(), memory: () => { if (typeof Memory !== 'undefined') Memory.open(); },
        plans: () => { if (typeof Billing !== 'undefined' && Billing.showUpgrade) Billing.showUpgrade('Plans'); },
        invite: () => window.ZPInvite && window.ZPInvite.open(), feedback: () => window.ZPFeedback && window.ZPFeedback.open(),
        news: () => window.open('/whats-new', '_blank', 'noopener'), keys: () => Settings.open('chat'), vault: () => { location.href = '/vault'; },
        logout: () => document.getElementById('logout-btn').click(),
        outall: async () => { if (!(await showConfirm('Sign out your other devices?', 'Phones, tablets and other browsers will need to log in again. You stay signed in here.', false))) return; try { await api('/api/auth/logout-all', { method: 'POST' }); showToast('Other devices signed out', 'success'); } catch (err) { showToast(err.message, 'error'); } },
      };
      run(A[b.dataset.a] || (() => {}));
    });
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', onKey, true);
    fetch('/api/usage/meter', { credentials: 'same-origin' }).then((x) => x.json()).then((d) => {
      if (!el) return;
      const n = el.querySelector('#zam-use-n'), bars = el.querySelector('#zam-use-bars'), s = el.querySelector('#zam-use-s');
      const items = (d.items || []).filter((i) => i.limit !== 0);
      const msgs = items.find((i) => i.key === 'messages');
      n.textContent = msgs ? (msgs.limit == null ? 'no limits' : (msgs.left + ' messages left')) : '';
      bars.innerHTML = items.map((i) => {
        const pct = i.limit == null ? 100 : Math.min(100, Math.round(i.used / Math.max(1, i.limit) * 100));
        const cls = i.limit == null ? 'free' : pct >= 100 ? 'hot' : pct >= 70 ? 'warm' : '';
        const right = i.limit == null ? '∞' : i.used + '/' + i.limit;
        return `<div class="zam-row" title="${esc(i.label)}: ${i.limit == null ? i.used + ' used, no limit' : i.left + ' left of ' + i.limit}"><span>${esc(i.label)}</span><div class="zam-bar"><i class="${cls}" style="width:${pct}%"></i></div><b>${right}</b></div>`;
      }).join('');
      let line = d.plan_label ? d.plan_label + ' plan' : '';
      if (d.cooldown_until) {
        const mins = Math.max(1, Math.round((new Date(d.cooldown_until) - Date.now()) / 60000));
        line = 'You\'ve used everything up — you can carry on in ' + mins + ' min';
      } else if (d.resets_at) {
        const h = Math.max(1, Math.round((new Date(d.resets_at) - Date.now()) / 3600000));
        line += ' · starts again in ' + h + (h === 1 ? ' hour' : ' hours');
      }
      s.textContent = line;
    }).catch(() => { const u = el && el.querySelector('#zam-use'); if (u) u.remove(); });
  }

  function init(cfg) {
    U = (cfg && cfg.user) || window.user || {};
    const bar = document.querySelector('.user-profile-bar'); if (!bar) return;
    const av = document.getElementById('user-avatar');
    bar.setAttribute('aria-haspopup', 'menu'); bar.setAttribute('aria-expanded', 'false');
    if (av) { av.setAttribute('role', 'button'); av.setAttribute('tabindex', '0'); av.setAttribute('aria-label', 'Account menu'); av.title = ''; }
    const hoverable = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (hoverable) {
      bar.addEventListener('mouseenter', (e) => { if (e.target.closest && e.target.closest('#logout-btn')) return; clearTimeout(closeT); openT = setTimeout(() => open(false), 220); });
      bar.addEventListener('mouseleave', () => { clearTimeout(openT); if (!pinned) closeT = setTimeout(close, 280); });
    }
    bar.addEventListener('click', (e) => { if (e.target.closest('#logout-btn')) return; if (el && pinned) close(); else open(true); });
    if (av) av.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (el) close(); else { open(true); setTimeout(() => { const f = el && el.querySelector('.zam-list button'); if (f) f.focus(); }, 30); } } });
    window.addEventListener('resize', close);
  }
  window.ZPAcctMenu = { init, open: () => open(true), close };
})();
