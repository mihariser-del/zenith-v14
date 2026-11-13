/* Personality studio: pick who Zelpophai is for you, fine-tune it with sliders, tell it about
   yourself, write your own personality, and try it before you chat. window.ZPPersona.open() */
(function () {
  'use strict';
  const { esc, toast, call, icon, modal, ago, confirmBox } = window.ZUI;
  let D = null, M = null, tab = 'pick', saveT = null, mirror = null;
  const TABS = [['pick', 'Personality'], ['tune', 'Fine-tune'], ['you', 'About you'], ['mirror', 'Mirror']];

  const activeName = () => {
    const a = D.state.active;
    if (a.startsWith('custom:')) { const c = D.state.customs.find((x) => 'custom:' + x.id === a); return c ? c.name : 'Balanced'; }
    return (D.personas.find((p) => p.id === a) || D.personas[0]).name;
  };
  function saved(txt) { const s = M && M.head.querySelector('.zps-saved'); if (!s) return; s.textContent = txt || 'Saved'; s.classList.add('on'); clearTimeout(s._t); s._t = setTimeout(() => s.classList.remove('on'), 1600); }
  async function save(body, quiet) {
    try { const r = await call('/api/personality', { method: 'PUT', body }); D.state = r.state; D.custom_instructions = r.custom_instructions; if (!quiet) saved(); syncButton(); return true; }
    catch (e) { toast(e.message, 'error'); return false; }
  }
  const later = (fn) => { clearTimeout(saveT); saveT = setTimeout(fn, 500); };

  function draw() {
    M.body.querySelector('.zps-tabs').querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    const pane = M.body.querySelector('.zps-pane');
    ({ pick: drawPick, tune: drawTune, you: drawYou, mirror: drawMirror }[tab])(pane);
    M.body.querySelector('.zps-now b').textContent = activeName();
  }

  function drawPick(el) {
    const a = D.state.active;
    el.innerHTML = `<div class="zps-grid">${D.personas.map((p) => `<button class="zps-card${a === p.id ? ' on' : ''}" data-id="${p.id}" style="--c:${p.color}">
        <span class="zps-ic">${icon(p.icon)}</span><b>${esc(p.name)}</b><span class="zps-tag">${esc(p.tagline)}</span><span class="zps-say">“${esc(p.sample)}”</span>${a === p.id ? `<i class="zps-on">${icon('check')}</i>` : ''}</button>`).join('')}</div>
      <div class="zps-sec"><h4>Your own personalities</h4><span>${D.state.customs.length} of ${D.max_customs}</span></div>
      <div class="zps-grid">${D.state.customs.map((c) => `<div class="zps-card own${a === 'custom:' + c.id ? ' on' : ''}" data-id="custom:${c.id}" style="--c:#a78bfa" role="button" tabindex="0">
        <span class="zps-ic">${icon('pen')}</span><b>${esc(c.name)}</b><span class="zps-tag">${esc(c.description)}</span>
        <span class="zps-own-act"><button data-edit="${c.id}" aria-label="Edit ${esc(c.name)}">${icon('pen')}</button><button data-del="${c.id}" aria-label="Delete ${esc(c.name)}">${icon('trash')}</button></span>${a === 'custom:' + c.id ? `<i class="zps-on">${icon('check')}</i>` : ''}</div>`).join('')}
        ${D.state.customs.length < D.max_customs ? `<button class="zps-card new" id="zps-new"><span class="zps-ic">${icon('plus')}</span><b>Create your own</b><span class="zps-tag">Describe exactly how Zelpophai should talk — a pirate, your favourite teacher, anything.</span></button>` : ''}</div>`;
    el.querySelectorAll('.zps-card[data-id]').forEach((c) => {
      const pick = async (e) => { if (e.target.closest('[data-edit],[data-del]')) return; if (D.state.active === c.dataset.id) return; if (await save({ active: c.dataset.id })) { saved('Personality changed'); draw(); } };
      c.onclick = pick; c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e); } };
    });
    el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editor(D.state.customs.find((c) => c.id === b.dataset.edit)));
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      const c = D.state.customs.find((x) => x.id === b.dataset.del);
      if (!(await confirmBox(`Delete “${c.name}”?`, 'This personality is removed. You can make a new one any time.', true))) return;
      try { const r = await call('/api/personality/custom/' + c.id, { method: 'DELETE' }); D.state = r.state; saved('Deleted'); draw(); syncButton(); } catch (e) { toast(e.message, 'error'); }
    });
    const n = el.querySelector('#zps-new'); if (n) n.onclick = () => editor(null);
  }

  function editor(c) {
    const IDEAS = [['Wise grandparent', 'Talk like a wise, gentle grandparent who has seen it all: calm, patient, full of little sayings, and always ends with a word of encouragement.'],
      ['Sports commentator', 'Talk like an excited football commentator: high energy, short punchy sentences, and treat every answer like a big match moment.'],
      ['Study buddy', 'Talk like a friendly classmate who is good at explaining: simple words, quick examples, and ask me a question back to check I understand.'],
      ['Shakespeare', 'Talk in playful Shakespearean English with thee and thou, but keep the facts modern and correct.']];
    const m = modal({ id: 'zps-edit', title: c ? 'Edit personality' : 'Create your own personality', icon: 'pen', sub: 'Describe how Zelpophai should talk when this one is on.' });
    m.body.innerHTML = `<label class="zu-l" for="zpe-name">Name</label><input class="zu-in" id="zpe-name" maxlength="30" placeholder="e.g. Captain Blackbeard" value="${esc(c ? c.name : '')}">
      <label class="zu-l" for="zpe-desc">How should it talk?</label><textarea class="zu-in" id="zpe-desc" rows="5" maxlength="700" placeholder="e.g. Talk like a cheerful pirate captain. Call me matey, use sea words, and keep answers short.">${esc(c ? c.description : '')}</textarea>
      <div class="zu-count" id="zpe-n">0 / 700</div>
      ${c ? '' : `<div class="zu-l" style="margin-top:4px">Need an idea?</div><div class="zu-chips" id="zpe-ideas">${IDEAS.map(([n], i) => `<button data-i="${i}">${n}</button>`).join('')}</div>`}
      <div class="zps-try" id="zpe-try" hidden></div>
      <div class="zu-actions"><button class="zu-btn" id="zpe-test">${icon('wand')} Try it</button><button class="zu-btn pri" id="zpe-save">${c ? 'Save' : 'Create'}</button></div>
      <p class="zu-fine">It changes the voice only — Zelpophai stays honest and safe whatever you write here.</p>`;
    const name = m.body.querySelector('#zpe-name'), desc = m.body.querySelector('#zpe-desc');
    const cnt = () => { m.body.querySelector('#zpe-n').textContent = desc.value.length + ' / 700'; }; cnt(); desc.oninput = cnt;
    const ideas = m.body.querySelector('#zpe-ideas'); if (ideas) ideas.onclick = (e) => { const b = e.target.closest('[data-i]'); if (!b) return; name.value = IDEAS[+b.dataset.i][0]; desc.value = IDEAS[+b.dataset.i][1]; cnt(); };
    m.body.querySelector('#zpe-test').onclick = async (e) => {
      if (desc.value.trim().length < 10) return toast('Describe how it should talk first', 'error');
      const box = m.body.querySelector('#zpe-try'); box.hidden = false; box.innerHTML = '<span class="zps-dots"><i></i><i></i><i></i></span>';
      const btn = e.currentTarget; btn.disabled = true;
      try { const r = await call('/api/personality/preview', { method: 'POST', body: { name: name.value, description: desc.value } }); box.innerHTML = `<small>You: ${esc(r.question)}</small>${esc(r.text)}`; }
      catch (err) { box.innerHTML = `<small>${esc(err.message)}</small>`; }
      btn.disabled = false;
    };
    m.body.querySelector('#zpe-save').onclick = async () => {
      try { const r = await call('/api/personality/custom', { method: 'POST', body: { id: c ? c.id : '', name: name.value, description: desc.value } }); D.state = r.state; m.close(); saved(c ? 'Saved' : 'Created and switched on'); draw(); syncButton(); }
      catch (e) { toast(e.message, 'error'); }
    };
    setTimeout(() => name.focus(), 50);
  }

  function drawTune(el) {
    const t = D.state.effective_traits, custom = !!D.state.traits;
    el.innerHTML = `<p class="zps-lead">Slide to adjust <b>${esc(activeName())}</b>. ${custom ? 'You\'ve changed these from the personality\'s own settings.' : 'These are this personality\'s own settings — move any slider to make it yours.'}</p>
      ${D.traits.map((tr) => `<div class="zps-slide"><div class="zps-slide-h"><b>${esc(tr.name)}</b><span data-v="${tr.id}"></span></div>
        <input type="range" min="${tr.min}" max="${tr.max}" step="1" value="${t[tr.id]}" data-tr="${tr.id}" aria-label="${esc(tr.name)}">
        <div class="zps-ends"><span>${esc(tr.low)}</span><span>${esc(tr.high)}</span></div></div>`).join('')}
      <button class="zu-btn sm" id="zps-reset" ${custom ? '' : 'disabled'}>Back to ${esc(activeName())}'s own settings</button>`;
    const WORD = { warmth: ['', 'Businesslike', 'Polite', 'Friendly', 'Warm', 'Very warm'], humor: ['', 'Serious', 'Mostly serious', 'A little', 'Playful', 'Funny'],
      detail: ['', 'Very short', 'Short', 'Balanced', 'Thorough', 'Very detailed'], formality: ['', 'Very casual', 'Casual', 'Neutral', 'Polished', 'Formal'], emoji: ['None', 'A few', 'Lots'] };
    const label = (id, v) => { el.querySelector(`[data-v="${id}"]`).textContent = WORD[id][v]; };
    el.querySelectorAll('input[type=range]').forEach((r) => {
      const paint = () => { const pct = (r.value - r.min) / (r.max - r.min) * 100; r.style.setProperty('--p', pct + '%'); label(r.dataset.tr, +r.value); };
      paint();
      r.oninput = () => { paint(); later(async () => { const traits = {}; el.querySelectorAll('input[type=range]').forEach((x) => { traits[x.dataset.tr] = +x.value; }); if (await save({ traits })) { const b = el.querySelector('#zps-reset'); if (b) b.disabled = false; } }); };
    });
    el.querySelector('#zps-reset').onclick = async () => { if (await save({ reset_traits: true })) draw(); };
  }

  function drawYou(el) {
    el.innerHTML = `<label class="zu-l" for="zpy-nick">What should Zelpophai call you?</label><input class="zu-in" id="zpy-nick" maxlength="40" placeholder="Your name or a nickname" value="${esc(D.state.nickname)}">
      <label class="zu-l" for="zpy-about">What should it know about you?</label><textarea class="zu-in" id="zpy-about" rows="3" maxlength="600" placeholder="e.g. I'm 16 and in Grade 11. I love football and I'm learning to code. Explain things simply.">${esc(D.state.about)}</textarea>
      <label class="zu-l" for="zpy-lang">Reply language</label><select class="zu-in" id="zpy-lang">${D.languages.map((l) => `<option value="${esc(l)}"${l === D.state.language ? ' selected' : ''}>${l ? esc(l) : 'Same language I write in'}</option>`).join('')}</select>
      <label class="zu-l" for="zpy-rules">Your own instructions <em>(optional)</em></label><textarea class="zu-in" id="zpy-rules" rows="4" maxlength="2000" placeholder="Anything Zelpophai should always do for you. e.g. Always give an example. Use metric units. Never use bullet points.">${esc(D.custom_instructions)}</textarea>
      <p class="zu-fine">Saved automatically. This is used in every chat, on top of the personality you picked. For facts Zelpophai should remember, use Memory.</p>`;
    const push = () => later(() => save({ nickname: el.querySelector('#zpy-nick').value, about: el.querySelector('#zpy-about').value, language: el.querySelector('#zpy-lang').value, custom_instructions: el.querySelector('#zpy-rules').value }));
    el.querySelectorAll('input,textarea').forEach((i) => { i.oninput = push; });
    el.querySelector('#zpy-lang').onchange = push;
  }

  async function drawMirror(el) {
    el.innerHTML = '<div class="zu-load">Loading…</div>';
    try { mirror = await call('/api/personality/profile'); } catch (e) { el.innerHTML = `<div class="zu-empty"><b>Mirror isn't available</b><span>${esc(e.message)}</span></div>`; return; }
    if (tab !== 'mirror') return;
    const p = mirror.profile, need = Math.max(0, 5 - (mirror.message_count || 0));
    const rows = p ? [['Tone', p.tone], ['Formality', p.formality], ['Energy', p.energy], ['Humour', p.humor], ['Emoji', p.emoji_use], ['Detail', p.detail_level]].filter((x) => x[1]) : [];
    el.innerHTML = `<div class="zps-mirror-top"><div><b>Mirror how I talk</b><span>Zelpophai studies how <i>you</i> write — short or long, serious or jokey — and answers in the same style, on top of your personality.</span></div>
        <button class="zu-switch${mirror.enabled ? ' on' : ''}" id="zpm-on" role="switch" aria-checked="${!!mirror.enabled}" aria-label="Mirror how I talk"></button></div>
      ${!mirror.enabled ? '<div class="zu-empty"><b>Mirror is off</b><span>Turn it on and Zelpophai will match your style.</span></div>'
        : p ? `<div class="zps-mirror-card"><p>“${esc(p.style_summary || 'Zelpophai has learned how you write.')}”</p><div class="zps-traits">${rows.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>
            <small>Learned from your messages${mirror.updated_at ? ' · updated ' + ago(mirror.updated_at) : ''}. It refreshes by itself as you chat.</small></div>
            <div class="zu-actions start"><button class="zu-btn sm" id="zpm-now">${icon('wand')} Study my messages again</button><button class="zu-btn sm danger" id="zpm-reset">Forget what it learned</button></div>`
          : `<div class="zu-empty">${icon('users')}<b>${need ? `Chat a bit more first` : 'Ready to learn your style'}</b><span>${need ? `Zelpophai needs ${need} more of your messages before it can tell how you write.` : 'You\'ve chatted enough — let Zelpophai study your messages.'}</span>
              <div class="zps-prog"><i style="width:${Math.min(100, (mirror.message_count || 0) / 5 * 100)}%"></i></div>${need ? '' : '<button class="zu-btn pri sm" id="zpm-now">Study my messages</button>'}</div>`}`;
    el.querySelector('#zpm-on').onclick = async () => { try { await call('/api/personality/settings', { method: 'POST', body: { enabled: !mirror.enabled } }); saved(mirror.enabled ? 'Mirror off' : 'Mirror on'); drawMirror(el); } catch (e) { toast(e.message, 'error'); } };
    const now = el.querySelector('#zpm-now'); if (now) now.onclick = async () => { now.disabled = true; now.textContent = 'Studying…'; try { const r = await call('/api/personality/refresh', { method: 'POST' }); toast(r.ok ? 'Updated' : 'Not enough messages yet', r.ok ? 'success' : 'error'); } catch (e) { toast(e.message, 'error'); } drawMirror(el); };
    const rs = el.querySelector('#zpm-reset'); if (rs) rs.onclick = async () => { if (!(await confirmBox('Forget what it learned?', 'Zelpophai will forget how you write and learn again from your next chats.', false))) return; try { await call('/api/personality/reset', { method: 'POST' }); saved('Forgotten'); } catch (e) { toast(e.message, 'error'); } drawMirror(el); };
  }

  async function tryIt() {
    const q = M.body.querySelector('#zps-q'), out = M.body.querySelector('#zps-out'), b = M.body.querySelector('#zps-go');
    out.hidden = false; out.innerHTML = '<span class="zps-dots"><i></i><i></i><i></i></span>'; b.disabled = true;
    try { const r = await call('/api/personality/preview', { method: 'POST', body: { active: D.state.active, traits: D.state.traits, nickname: D.state.nickname, question: q.value } }); out.innerHTML = `<small>${esc(activeName())} says</small>${esc(r.text)}`; }
    catch (e) { out.innerHTML = `<small>${esc(e.message)}</small>`; }
    b.disabled = false;
  }

  async function open(startTab) {
    tab = startTab || 'pick';
    M = modal({ id: 'zps', title: 'Personality', icon: 'spark', sub: 'Choose who Zelpophai is when it talks to you.', wide: true, tall: true });
    M.head.innerHTML = '<span class="zps-saved">Saved</span>';
    M.body.innerHTML = '<div class="zu-load">Loading…</div>';
    try { D = await call('/api/personality'); } catch (e) { M.body.innerHTML = `<div class="zu-empty"><b>Couldn't load</b><span>${esc(e.message)}</span></div>`; return; }
    M.body.innerHTML = `<div class="zps-top"><div class="zu-tabs zps-tabs">${TABS.map(([k, l]) => `<button data-t="${k}">${l}</button>`).join('')}</div><span class="zps-now">Now: <b></b></span></div>
      <div class="zps-pane"></div>
      <div class="zps-dock"><div class="zps-try" id="zps-out" hidden></div>
        <div class="zps-dock-row"><input class="zu-in" id="zps-q" maxlength="200" placeholder="Try it — ask something, e.g. Why is the sky blue?"><button class="zu-btn pri" id="zps-go">${icon('wand')} Try it</button></div></div>`;
    M.body.querySelector('.zps-tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; draw(); } };
    M.body.querySelector('#zps-go').onclick = tryIt;
    M.body.querySelector('#zps-q').onkeydown = (e) => { if (e.key === 'Enter') tryIt(); };
    draw();
  }

  /* The row in Settings that opens the studio. */
  function syncButton() { const s = document.getElementById('zps-open-name'); if (s && D) s.textContent = activeName(); }
  // The Personality row inside Settings → Personality & memory.
  async function mountSettings() {
    const box = document.getElementById('zst-persona-slot'); if (!box) return;
    box.innerHTML = `<div id="zps-row" class="zem-setrow">${icon('spark')}<div><b>Personality</b><span>Right now: <i id="zps-open-name">Balanced</i></span></div><button class="zu-btn sm pri" id="zps-open">Change</button></div>`;
    box.querySelector('#zps-open').onclick = () => open();
    try { if (!D) D = await call('/api/personality'); syncButton(); } catch (e) {}
  }
  window.ZPPersona = { open, mountSettings };
})();
