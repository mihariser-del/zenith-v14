/* The two questions a new account answers once: roughly how old they are, and
   what they'll mainly use Zelpophai for. The answers set the starting look,
   tone, tool order and suggestions — nothing is taken away for good, and the
   same questions live in Settings afterwards.

   window.ZPSetup = { maybe, open, apply, effects } */
(function () {
  'use strict';
  const { esc, toast, call, modal } = window.ZUI;

  const ICON = {
    professional: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
    everyday: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    casual: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    student: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 9v5"/>',
  };
  const sv = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

  let D = null, M = null, pick = { style: '', age: '' }, step = 0, done = null;

  async function load(force) {
    if (D && !force) return D;
    D = await call('/api/settings/profile');
    return D;
  }

  /* ── what the answers switch on, applied to this browser ── */
  function apply(fx) {
    if (!fx) return;
    // Settings keeps everything under one key; write to that same one, or the
    // choice is stored somewhere nothing ever reads.
    try {
      let s = {};
      try { s = JSON.parse(localStorage.getItem('zenith_settings') || '{}'); } catch (e) { s = {}; }
      s.seasonal = fx.seasonal;
      s.animations = !!fx.animations;
      localStorage.setItem('zenith_settings', JSON.stringify(s));
    } catch (e) {}
    // Tell both seasonal themes straight away; Christmas goes first because it
    // takes precedence over Halloween while it's on.
    try { if (window.Christmas) window.Christmas.apply(fx.seasonal); } catch (e) {}
    try { if (window.Halloween && !document.documentElement.classList.contains('christmas')) window.Halloween.apply(fx.seasonal); } catch (e) {}
    document.documentElement.classList.toggle('zst-no-anim', !fx.animations);
    orderTools(fx.tools);
    try { localStorage.setItem('zp_starters', fx.starters || 'mixed'); } catch (e) {}
    window.ZPSetup.effects = fx;
  }

  // Everything stays available; this only decides what sits first in the row.
  function orderTools(order) {
    if (!order || !order.length) return;
    const box = document.querySelector('.composer-tools .ct-scroll');
    if (!box) return;
    const ID = { attach: 'attach-btn', search: 'search-toggle-btn', think: 'think-btn',
      research: 'research-btn', fact: 'factcheck-btn', image: 'image-gen-btn', video: 'video-gen-btn' };
    order.forEach((k) => {
      const el = document.getElementById(ID[k]);
      if (el) box.appendChild(el);
    });
    // The separators came from the old order, so they'd be meaningless now.
    box.querySelectorAll('.ct-sep').forEach((s) => s.remove());
  }

  /* ── the setup window ── */
  async function open(opts) {
    opts = opts || {};
    done = opts.onDone || null;
    try { await load(true); } catch (e) { if (done) done(); return; }
    // First time through, nothing is pre-selected — a default sitting there
    // would quietly answer the question for them. Coming back from Settings,
    // their current answers are shown.
    pick = D.profile.done ? { style: D.profile.style || '', age: D.profile.age || '' } : { style: '', age: '' };
    step = 0;
    M = modal({ id: 'zsu', title: 'Let\'s set Zelpophai up for you', icon: 'spark', lock: true,
      sub: 'Two quick questions. You can change your answers any time in Settings.' });
    M.onClose = () => { M = null; if (done) done(); };
    render();
  }

  function render() {
    if (!M) return;
    const total = 2;
    const head = step === 0
      ? ['What will you mostly use Zelpophai for?', 'This sets how it talks to you and what it shows first.']
      : ['Roughly how old are you?', 'This is only used to keep answers suitable for you. It is never shown to anyone.'];
    const opts = step === 0 ? D.styles : D.ages;
    const chosen = step === 0 ? pick.style : pick.age;

    M.body.innerHTML = `
      <div class="zsu-steps" aria-hidden="true">${[0, 1].map((i) => `<i class="${i === step ? 'on' : i < step ? 'did' : ''}"></i>`).join('')}</div>
      <h4 class="zsu-q">${esc(head[0])}</h4>
      <p class="zsu-sub">${esc(head[1])}</p>
      <div class="zsu-opts ${step === 0 ? 'big' : ''}" role="radiogroup" aria-label="${esc(head[0])}">
        ${opts.map((o) => `<button type="button" class="zsu-opt${o.id === chosen ? ' on' : ''}" data-id="${esc(o.id)}" role="radio" aria-checked="${o.id === chosen}">
          ${step === 0 ? `<span class="zsu-ic">${sv(ICON[o.id] || ICON.everyday)}</span>` : ''}
          <b>${esc(o.label)}</b><span>${esc(o.about)}</span>
          ${o.example ? `<i>${esc(o.example)}</i>` : ''}</button>`).join('')}
      </div>
      <div class="zsu-foot">
        <button type="button" class="zsu-skip" id="zsu-skip">Skip for now</button>
        <div class="zsu-foot-r">
          ${step ? '<button type="button" class="zu-btn" id="zsu-back">Back</button>' : ''}
          <button type="button" class="zu-btn pri" id="zsu-next" ${chosen ? '' : 'disabled'}>${step === total - 1 ? 'Finish' : 'Next'}</button>
        </div>
      </div>`;

    M.body.querySelectorAll('.zsu-opt').forEach((b) => b.onclick = () => {
      if (step === 0) pick.style = b.dataset.id; else pick.age = b.dataset.id;
      render();
    });
    M.body.querySelector('#zsu-skip').onclick = skip;
    if (M.body.querySelector('#zsu-back')) M.body.querySelector('#zsu-back').onclick = () => { step--; render(); };
    M.body.querySelector('#zsu-next').onclick = () => { if (step === 0) { step = 1; render(); } else finish(); };
  }

  async function skip() {
    try { const r = await call('/api/settings/profile', { method: 'POST', body: { done: true, skipped: true } }); apply(r.effects); } catch (e) {}
    close();
  }

  async function finish() {
    const btn = M && M.body.querySelector('#zsu-next');
    if (btn) { btn.disabled = true; btn.textContent = 'Setting up…'; }
    let r;
    try { r = await call('/api/settings/profile', { method: 'POST', body: { style: pick.style, age: pick.age, done: true } }); }
    catch (e) { toast(e.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Finish'; } return; }
    apply(r.effects);
    summary(r.effects);
  }

  function summary(fx) {
    if (!M) return;
    const style = (D.styles.find((s) => s.id === fx.style) || {}).label || '';
    const rows = [
      ['How Zelpophai talks to you', fx.style === 'professional' ? 'Short and businesslike, no emoji'
        : fx.style === 'casual' ? 'Warm and chatty, happy to suggest pictures and videos'
        : fx.style === 'student' ? 'Explains step by step and shows the working'
        : 'Friendly and balanced'],
      ['Festive looks and animations', fx.seasonal === 'off' ? 'Off — a plain, quiet look' : 'On — seasonal themes appear in season'],
      ['What you see first', fx.starters === 'work' ? 'Work suggestions and the thinking tools'
        : fx.starters === 'fun' ? 'Creative suggestions, with Image and Video first'
        : fx.starters === 'learn' ? 'Learning suggestions and the research tools'
        : 'A bit of everything'],
    ];
    if (fx.safe) rows.push(['Suitable answers', fx.age === 'under13' ? 'Kept simple and safe for under-13s' : 'Kept suitable for under-18s']);
    M.body.innerHTML = `<div class="zsu-done">
        <div class="zsu-tick" aria-hidden="true">${sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>')}</div>
        <h4>You're all set${style ? ' — ' + esc(style) : ''}</h4>
        <p class="zsu-sub">Here's what I've set up. Change any of it in Settings whenever you like.</p>
        <div class="zsu-sum">${rows.map(([k, v]) => `<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div>
        <button type="button" class="zu-btn pri zsu-go" id="zsu-go">Start using Zelpophai</button>
      </div>`;
    M.body.querySelector('#zsu-go').onclick = close;
  }

  function close() { if (M) { const m = M; M = null; m.onClose = null; m.close(); } if (done) { const d = done; done = null; d(); } }

  /* ── on first run ── */
  async function maybe(onDone) {
    let d;
    try { d = await load(); } catch (e) { if (onDone) onDone(); return false; }
    apply(d.effects);                       // always apply what they already chose
    if (d.profile.done) { if (onDone) onDone(); return false; }
    await open({ onDone: onDone });
    return true;
  }

  window.ZPSetup = { maybe, open, apply, load, effects: null };
})();
