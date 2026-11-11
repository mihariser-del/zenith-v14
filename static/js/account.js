/* Email: every account needs a real one. Shows the "add your email" screen when it's missing,
   handles the 6-digit code when email sending is set up, and explains what to do if someone
   has no email. window.ZPAccount.init({ user, isGuest }) is called from app.js. */
(function () {
  'use strict';
  const { esc, toast, call, icon, modal } = window.ZUI;
  let cfg = {}, open = false, state = null;

  function help() {
    return `<details class="zem-help"><summary>I don't have an email address</summary>
      <ol>
        <li><b>Make a free one — it takes about 2 minutes.</b> Pick any of these, follow the steps, then come back here and type the new address:
          <div class="zem-links"><a href="https://accounts.google.com/signup" target="_blank" rel="noopener">Gmail</a><a href="https://signup.live.com" target="_blank" rel="noopener">Outlook</a><a href="https://account.proton.me/signup" target="_blank" rel="noopener">Proton Mail</a></div></li>
        <li><b>Under 13, or not allowed to make one?</b> Ask a parent or guardian to type <i>their</i> email here. Anything important about your account will go to them.</li>
        <li><b>A school or work email is fine too</b>, as long as you can open its inbox.</li>
        <li><b>Have one but forgot its password?</b> Use “Forgot password” on Gmail, Outlook or wherever it lives first, then come back.</li>
      </ol>
      <p>Why we ask: your email is the only way to get back into your account if you forget your password, and it stops fake accounts. We don't send adverts.</p></details>`;
  }

  function show(st, why) {
    if (open) return;
    open = true; state = st;
    const lock = !!st.required;
    const m = modal({ id: 'zem', title: st.status === 'verified' || st.status === 'checked' ? 'Change your email' : 'Add your email', icon: 'mail', lock,
      sub: lock ? 'Your account needs a real email address to keep going.' : 'So you can always get back into your account.' });
    m.onClose = () => { open = false; };
    const foot = () => lock
      ? `<p class="zem-fine">You need to add an email to keep using this account. <a href="#" id="zem-logout">Log out instead</a></p>`
      : (st.needs ? `<button class="zu-btn ghost wide" id="zem-later">Later${st.days_left != null ? ` · ${st.days_left} day${st.days_left === 1 ? '' : 's'} left` : ''}</button>` : '');
    const stepEmail = (prefill, err) => {
      m.body.innerHTML = `${why ? `<div class="zem-why">${esc(why)}</div>` : ''}
        ${st.needs && !lock && st.days_left != null ? `<div class="zem-count">${icon('clock')}<span>You have <b>${st.days_left} day${st.days_left === 1 ? '' : 's'}</b> left to add an email. After that you'll need one to keep chatting.</span></div>` : ''}
        <label class="zu-l" for="zem-email">Your email address</label>
        <input class="zu-in" id="zem-email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="name@gmail.com" value="${esc(prefill || '')}">
        <div class="zem-err" id="zem-err">${esc(err || '')}</div>
        <button class="zu-btn pri wide" id="zem-go">${st.can_send ? 'Send me a code' : 'Save email'}</button>
        <p class="zem-fine">${st.can_send ? 'We\'ll email you a 6-digit code to make sure the address is yours.' : 'We check that the address is real. Type it carefully — it\'s how you get back in if you forget your password.'}</p>
        ${help()}${foot()}`;
      const inp = m.body.querySelector('#zem-email');
      setTimeout(() => inp.focus(), 50);
      const go = async () => {
        const v = inp.value.trim(); if (!v) { inp.focus(); return; }
        const b = m.body.querySelector('#zem-go'); b.disabled = true; b.textContent = 'Checking…';
        try {
          const r = await call('/api/auth/email/start', { method: 'POST', body: { email: v } });
          if (r.done) return done(r.email, false);
          stepCode(r.email, r.minutes);
        } catch (e) { stepEmail(v, e.message); }
      };
      m.body.querySelector('#zem-go').onclick = go;
      inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
      wireFoot();
    };
    const stepCode = (email, minutes) => {
      m.body.innerHTML = `<div class="zem-sent">${icon('mail')}<div><b>Check your inbox</b><span>We sent a 6-digit code to <b>${esc(email)}</b>. It works for ${minutes || 15} minutes.</span></div></div>
        <label class="zu-l" for="zem-code">Type the code</label>
        <input class="zu-in zem-code" id="zem-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••">
        <div class="zem-err" id="zem-err"></div>
        <button class="zu-btn pri wide" id="zem-ok">Confirm</button>
        <div class="zem-row"><button class="zu-link" id="zem-resend" disabled>Send it again (30)</button><button class="zu-link" id="zem-change">Use a different email</button></div>
        <p class="zem-fine">Nothing arrived? Look in Spam or Promotions, and check the address is spelled right.</p>${foot()}`;
      const inp = m.body.querySelector('#zem-code');
      setTimeout(() => inp.focus(), 50);
      const ok = async () => {
        const code = inp.value.replace(/\D/g, ''); if (code.length < 6) { inp.focus(); return; }
        const b = m.body.querySelector('#zem-ok'); b.disabled = true;
        try { const r = await call('/api/auth/email/confirm', { method: 'POST', body: { code } }); done(r.email, true); }
        catch (e) { m.body.querySelector('#zem-err').textContent = e.message; b.disabled = false; inp.select(); }
      };
      m.body.querySelector('#zem-ok').onclick = ok;
      inp.oninput = () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 6); if (inp.value.length === 6) ok(); };
      m.body.querySelector('#zem-change').onclick = () => stepEmail(email);
      const rs = m.body.querySelector('#zem-resend');
      let left = 30;
      const tick = setInterval(() => { if (!document.body.contains(rs)) return clearInterval(tick); left--; if (left <= 0) { clearInterval(tick); rs.disabled = false; rs.textContent = 'Send it again'; } else rs.textContent = `Send it again (${left})`; }, 1000);
      rs.onclick = async () => { rs.disabled = true; try { const r = await call('/api/auth/email/start', { method: 'POST', body: { email } }); if (r.done) return done(r.email, false); toast('New code sent', 'success'); stepCode(email, r.minutes); } catch (e) { m.body.querySelector('#zem-err').textContent = e.message; rs.disabled = false; } };
      wireFoot();
    };
    const done = (email, verified) => {
      m.body.innerHTML = `<div class="zu-done"><div class="zu-tick">${icon('check')}</div><h4>${verified ? 'Email confirmed' : 'Email saved'}</h4>
        <p><b>${esc(email)}</b> is now the email for your account.</p><button class="zu-btn pri" id="zem-fin">Done</button></div>`;
      m.body.querySelector('#zem-fin').onclick = () => { m.close(); refreshRow(); };
      state = { needs: false, required: false, email, status: verified ? 'verified' : 'checked', can_send: st.can_send };
    };
    function wireFoot() {
      const l = m.body.querySelector('#zem-later');
      if (l) l.onclick = async () => { try { await call('/api/auth/email/later', { method: 'POST' }); } catch (e) {} m.close(); };
      const lo = m.body.querySelector('#zem-logout');
      if (lo) lo.onclick = async (e) => { e.preventDefault(); try { await call('/api/auth/logout', { method: 'POST' }); } catch (err) {} location.href = '/'; };
    }
    if (st.pending && st.can_send) stepCode(st.pending); else stepEmail(st.needs ? '' : st.email);
  }

  async function check(why) {
    if (cfg.isGuest) return;
    try {
      const st = await call('/api/auth/email/status');
      state = st;
      if (st.needs) {
        // In the grace period, don't nag more than once per visit unless something needs it.
        let seen = false; try { seen = sessionStorage.getItem('zem_seen') === '1'; } catch (e) {}
        if (st.required || why || !seen) { try { sessionStorage.setItem('zem_seen', '1'); } catch (e) {} show(st, why); }
      }
      refreshRow();
    } catch (e) {}
  }

  /* A row at the top of Settings: the account's email, with Change / Confirm. */
  function refreshRow() {
    const box = document.querySelector('#settings-modal .modal-content'); if (!box || cfg.isGuest || !state) return;
    let row = document.getElementById('zem-row');
    if (!row) { row = document.createElement('div'); row.id = 'zem-row'; row.className = 'zem-setrow'; const first = box.querySelector('details'); if (first) box.insertBefore(row, first); else box.appendChild(row); }
    const tag = state.status === 'verified' ? '<span class="zu-tag good">Confirmed</span>' : state.status === 'checked' ? '' : '<span class="zu-tag warn">Needed</span>';
    row.innerHTML = `${icon('mail')}<div><b>Account email</b><span>${state.email ? esc(state.email) : 'No email yet'} ${tag}</span></div><button class="zu-btn sm" id="zem-edit">${state.email ? 'Change' : 'Add'}</button>`;
    row.querySelector('#zem-edit').onclick = async () => { try { const st = await call('/api/auth/email/status'); open = false; show({ ...st, required: false }); } catch (e) { toast(e.message, 'error'); } };
  }

  function init(c) {
    cfg = c || {};
    if (cfg.isGuest) return;
    // A blocked request ("add your email to keep going") opens the screen straight away.
    const of = window.fetch;
    window.fetch = async function (...a) {
      const r = await of.apply(this, a);
      try { if (r.status === 403 && r.headers.get('X-Email-Required') === '1') setTimeout(() => check('Add your email to keep chatting.'), 50); } catch (e) {}
      return r;
    };
    setTimeout(() => check(), 1800);
  }
  window.ZPAccount = { init, check };
})();
