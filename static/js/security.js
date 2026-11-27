/* The Security window people see in their own menu.
   Built on the shared kit (zui.js), same as Knowledge / Files / Reminders.
   It answers three questions in plain words: who has been getting into my
   account, from where, and what should I do about it. */
(function () {
  'use strict';
  const { esc, toast, call, icon, modal, confirmBox } = window.ZUI;
  // Some times come back without a time zone; those are UTC.
  const utc = (t) => (typeof t === 'string' && t && !/([zZ]|[+-]\d\d:?\d\d)$/.test(t)) ? t + 'Z' : t;
  const ago = (t) => t ? window.ZUI.ago(utc(t)) : '';
  const when = (t) => {
    if (!t) return '';
    const d = new Date(utc(t));
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
      + ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };
  const KIND = { phone: '📱', tablet: '📟', computer: '💻' };
  const where = (e) => e.here ? 'Your own network' : (e.place || (e.ip ? 'Somewhere else' : ''));

  const S = { m: null, hist: null };

  function line(e) {
    const bits = [e.device, where(e)].filter(Boolean).join(' · ');
    return `<div class="zsec-row ${e.ok ? 'ok' : 'no'}">
      <span class="zsec-ic" aria-hidden="true">${e.ok ? (KIND[e.kind] || '💻') : '⚠️'}</span>
      <div class="zsec-what"><b>${e.ok ? 'Signed in' : 'Wrong password'}</b><span>${esc(bits || 'Unknown device')}</span></div>
      <span class="zsec-when" title="${esc(when(e.at))}">${esc(ago(e.at))}</span></div>`;
  }

  async function open() {
    S.m = modal({ id: 'zsec', title: 'Security', icon: 'lock', tall: true,
      sub: 'Who has been getting into your account, and how to keep it yours.' });
    S.m.body.innerHTML = '<div class="zu-load">Loading…</div>';
    let d;
    try { d = await call('/api/security/dashboard'); } catch (e) {
      S.m.body.innerHTML = `<div class="zu-empty"><b>Couldn't load this</b><span>${esc(e.message)}</span></div>`; return;
    }
    if (!S.m) return;
    draw(d);
  }

  function draw(d) {
    const M = S.m; if (!M) return;
    const bad = d.tips.filter((t) => t.state !== 'good').length;
    M.body.innerHTML = `
      <div class="zsec-top ${bad ? 'warn' : 'good'}">
        <b>${bad ? (bad === 1 ? 'One thing to check' : `${bad} things to check`) : 'Your account looks fine'}</b>
        <span>${d.last ? `You last signed in ${esc(ago(d.last.at))} — ${esc(d.last.device)}${where(d.last) ? ' · ' + esc(where(d.last)) : ''}.` : 'This is your first time signing in.'}</span>
      </div>

      <div class="zsec-nums">
        <div><b>${d.logins}</b><span>times you've signed in</span></div>
        <div class="${d.failed ? 'alert' : ''}"><b>${d.failed}</b><span>wrong passwords, ever</span></div>
        <div><b>${d.places}</b><span>place${d.places === 1 ? '' : 's'} you've signed in from</span></div>
      </div>

      <div class="zsec-tips">${d.tips.map((t) => `<div class="zsec-tip ${t.state}">
        <span class="zsec-dot" aria-hidden="true"></span>
        <div class="zsec-what"><b>${esc(t.title)}</b><span>${esc(t.detail)}</span></div>
        ${t.fix ? `<button class="zu-btn sm${t.state === 'bad' ? ' pri' : ''}" data-do="${esc(t.action)}">${esc(t.fix)}</button>` : ''}
      </div>`).join('')}</div>

      <h4 class="zsec-h">Recent activity</h4>
      <p class="zsec-note">Every time someone signed in as you — or tried to. If you see something here you don't recognise, change your password straight away.</p>
      <div class="zsec-list" id="zsec-list"><div class="zu-load">Loading…</div></div>`;

    M.body.querySelectorAll('[data-do]').forEach((b) => b.onclick = () => act(b.dataset.do, b));
    loadHistory();
  }

  async function loadHistory() {
    const el = document.getElementById('zsec-list'); if (!el) return;
    try { S.hist = (await call('/api/security/login-history')).history; } catch (e) {
      el.innerHTML = `<div class="zu-empty"><b>Couldn't load your activity</b><span>${esc(e.message)}</span></div>`; return;
    }
    if (!document.getElementById('zsec-list')) return;
    if (!S.hist.length) { el.innerHTML = '<div class="zu-empty"><b>Nothing here yet</b><span>Your sign-ins will appear here.</span></div>'; return; }
    const first = S.hist.slice(0, 12), rest = S.hist.slice(12);
    el.innerHTML = first.map(line).join('')
      + (rest.length ? `<button class="zu-btn sm zsec-more" id="zsec-more">Show the rest (${rest.length})</button>` : '');
    const more = document.getElementById('zsec-more');
    if (more) more.onclick = () => { el.innerHTML = S.hist.map(line).join(''); };
  }

  async function act(what, btn) {
    if (what === 'email' || what === 'password') {
      close();
      if (typeof Settings !== 'undefined' && Settings.open) Settings.open('account');
      else toast('Open Settings → Account');
      return;
    }
    if (what === 'signout') {
      const ok = await confirmBox('Sign out everywhere else?',
        'Every other phone, tablet and computer signed in as you is signed out. You stay signed in here. Nothing else about your account changes.', false);
      if (!ok) return;
      btn.disabled = true;
      try { await call('/api/security/signout-others', { method: 'POST' }); toast('Signed out everywhere else'); close(); }
      catch (e) { toast(e.message, true); btn.disabled = false; }
    }
  }

  function close() { if (S.m) { S.m.close(); S.m = null; } }

  window.Security = { open, close };
})();
