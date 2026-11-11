/* Feedback: send (type, stars, screenshot), my feedback with replies, the ideas board,
   thumbs on AI answers and the once-a-month "How is Zelpophai so far?" question.
   window.ZPFeedback.init({ user, isStaff, isGuest, push }) is called from app.js. */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (id) => document.getElementById(id);
  const toast = (m, t) => { if (window.showToast) window.showToast(m, t || ''); };
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  async function call(path, opts = {}) {
    const o = { credentials: 'same-origin', method: opts.method || 'GET' };
    if (opts.form) o.body = opts.form;
    else if (opts.body) { o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(opts.body); }
    const r = await fetch(path, o);
    let d = {}; try { d = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(d.detail || 'Something went wrong. Please try again.');
    return d;
  }
  function ago(iso) {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const IC = {
    bug: '<path d="M8 6V5a4 4 0 0 1 8 0v1"/><rect x="7" y="6" width="10" height="14" rx="5"/><path d="M3 13h4M17 13h4M4 7l3 2M20 7l-3 2M4 20l3-3M20 20l-3-3M12 11v9"/>',
    idea: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.800 1-2.500A6 6 0 0 0 12 3z"/>',
    praise: '<path d="M20.8 4.6a5.500 5.500 0 0 0-7.800 0L12 5.700l-1-1.100a5.500 5.500 0 0 0-7.800 7.800l1 1.100L12 21l7.800-7.500 1-1.100a5.500 5.500 0 0 0 0-7.800z"/>',
    problem: '<path d="M10.300 3.900 1.800 18a2 2 0 0 0 1.700 3h17a2 2 0 0 0 1.700-3L13.700 3.900a2 2 0 0 0-3.400 0z"/><path d="M12 9v4M12 17h.01"/>',
    request: '<path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><rect x="2" y="7" width="20" height="5" rx="1"/><path d="M12 22V7M12 7H7.500a2.500 2.500 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.500a2.500 2.500 0 0 0 0-5C13 2 12 7 12 7z"/>',
    other: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    pulse: '<path d="M12 2l3 6.500 7 .900-5.200 4.800 1.400 7-6.200-3.600L5.800 21.200l1.400-7L2 9.400l7-.900z"/>',
    up: '<path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3zm0 0 4-8a2.500 2.500 0 0 1 2.500 2.500V8h5.300a2 2 0 0 1 2 2.300l-1.300 8.400a2 2 0 0 1-2 1.700H7"/>',
    down: '<path d="M17 14V3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3zm0 0-4 8a2.500 2.500 0 0 1-2.500-2.500V16H5.200a2 2 0 0 1-2-2.300l1.300-8.400a2 2 0 0 1 2-1.700H17"/>',
    star: '<path d="M12 2l3 6.500 7 .900-5.200 4.800 1.400 7-6.200-3.600L5.800 21.200l1.400-7L2 9.400l7-.900z"/>',
    clip: '<path d="M21.400 11.100 12.200 20.300a6 6 0 0 1-8.500-8.500l9.200-9.200a4 4 0 0 1 5.700 5.700l-9.200 9.200a2 2 0 0 1-2.800-2.800l8.500-8.500"/>',
    caret: '<path d="M6 15l6-6 6 6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
  };
  const svg = (n, cls) => `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || IC.other}</svg>`;
  const KINDS = [
    ['bug', 'Bug', 'Something is broken', 'What happened, and what did you expect instead? The more detail the faster we can fix it.'],
    ['idea', 'Idea', 'Something new you want', 'Describe your idea and why it would help.'],
    ['praise', 'Praise', 'Something you love', 'Tell us what you like — it really helps.'],
    ['problem', 'Problem', 'Something annoying or confusing', 'What is getting in your way?'],
    ['request', 'Personal request', 'Ask the team for something', 'What would you like done, changed or added for you personally?'],
  ];
  const STATUS_CLS = { new: 'new', seen: 'seen', in_progress: 'prog', planned: 'plan', done: 'done', declined: 'no' };
  const S = { cfg: {}, tab: 'send', kind: 'bug', rating: 0, file: null, mine: [], ideaSort: 'top', ideaStatus: '', lastUnread: -1, opened: false };

  /* ───────────────────────── modal shell ───────────────────────── */
  function shell() {
    if (el('zfb')) return el('zfb');
    const d = document.createElement('div');
    d.id = 'zfb'; d.className = 'zfb'; d.hidden = true;
    d.innerHTML = `<div class="zfb-box" role="dialog" aria-modal="true" aria-label="Feedback">
      <div class="zfb-head"><div><h3>Feedback</h3><p>Help make Zelpophai better — we read everything.</p></div><button class="zfb-x" id="zfb-close" aria-label="Close">${svg('x')}</button></div>
      <div class="zfb-tabs" role="tablist"><button data-t="send" role="tab">Send</button><button data-t="mine" role="tab">My feedback<i id="zfb-mine-n" hidden></i></button><button data-t="ideas" role="tab">Ideas board</button></div>
      <div class="zfb-body" id="zfb-body"></div></div>`;
    document.body.appendChild(d);
    d.addEventListener('mousedown', (e) => { if (e.target === d) close(); });
    el('zfb-close').onclick = close;
    d.querySelector('.zfb-tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) show(b.dataset.t); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !d.hidden) close(); });
    return d;
  }
  function open(tab, arg) { shell().hidden = false; S.opened = true; show(tab || 'send', arg); }
  function close() { const d = el('zfb'); if (d) d.hidden = true; S.opened = false; poll(); }
  function show(tab, arg) {
    S.tab = tab;
    el('zfb').querySelectorAll('.zfb-tabs [data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    if (tab === 'send') drawSend(arg); else if (tab === 'mine') (arg ? drawThread(arg) : drawMine()); else drawIdeas();
  }
  const body = () => el('zfb-body');
  const staffBar = () => S.cfg.isStaff ? `<a class="zfb-staff" href="/vault#/feedback" target="_blank" rel="noopener">You're staff — <b>open the feedback inbox in the Vault</b> to read and reply →</a>` : '';

  /* ───────────────────────── send ───────────────────────── */
  function drawSend(preKind) {
    if (preKind && KINDS.some((k) => k[0] === preKind)) S.kind = preKind;
    if (S.cfg.isGuest && S.kind === 'request') S.kind = 'bug';
    const kinds = KINDS.filter((k) => !(S.cfg.isGuest && k[0] === 'request'));
    body().innerHTML = `${staffBar()}
      <label class="zfb-l">What is it about?</label>
      <div class="zfb-kinds" id="zfb-kinds">${kinds.map(([k, n, sub]) => `<button type="button" data-k="${k}" class="k-${k}${k === S.kind ? ' on' : ''}">${svg(k)}<b>${n}</b><span>${sub}</span></button>`).join('')}</div>
      <div id="zfb-idea-title" hidden><label class="zfb-l" for="zfb-title">Give your idea a short title</label><input class="zfb-in" id="zfb-title" maxlength="140" placeholder="e.g. A dark blue theme"></div>
      <label class="zfb-l" for="zfb-text" id="zfb-text-l">Tell us more</label>
      <textarea class="zfb-in" id="zfb-text" rows="5" maxlength="4000"></textarea>
      <div class="zfb-row"><button type="button" class="zfb-attach" id="zfb-attach">${svg('clip')}<span>Add a screenshot</span></button><input type="file" id="zfb-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden><span class="zfb-count" id="zfb-count">0 / 4000</span></div>
      <div class="zfb-shot" id="zfb-shot" hidden></div>
      <div class="zfb-rate"><span>How would you rate Zelpophai? <em>(optional)</em></span><div class="zfb-stars" id="zfb-stars" role="radiogroup" aria-label="Star rating">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-s="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">${svg('star')}</button>`).join('')}</div></div>
      <div id="zfb-idea-opts" hidden><label class="zfb-check"><input type="checkbox" id="zfb-public" checked><span>Show it on the <b>Ideas board</b> so others can vote for it</span></label>
        <label class="zfb-check"><input type="checkbox" id="zfb-anon"><span>Hide my name on the board</span></label></div>
      <button class="zfb-btn pri wide" id="zfb-send">Send feedback</button>
      <p class="zfb-fine">${S.cfg.isGuest ? 'You\'re using a guest account — create an account to get replies on all your devices.' : 'You\'ll get a notification here when the team replies.'}</p>`;
    const sync = () => {
      const k = KINDS.find((x) => x[0] === S.kind);
      el('zfb-kinds').querySelectorAll('[data-k]').forEach((b) => b.classList.toggle('on', b.dataset.k === S.kind));
      el('zfb-text').placeholder = k[3];
      el('zfb-idea-title').hidden = S.kind !== 'idea';
      el('zfb-idea-opts').hidden = S.kind !== 'idea' || S.cfg.isGuest;
      el('zfb-text-l').textContent = S.kind === 'idea' ? 'Describe it' : 'Tell us more';
      el('zfb-send').textContent = S.kind === 'request' ? 'Send request' : S.kind === 'idea' ? 'Share idea' : 'Send feedback';
    };
    const stars = () => el('zfb-stars').querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', +b.dataset.s <= S.rating));
    el('zfb-kinds').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) { S.kind = b.dataset.k; sync(); } };
    el('zfb-stars').onclick = (e) => { const b = e.target.closest('[data-s]'); if (!b) return; S.rating = S.rating === +b.dataset.s ? 0 : +b.dataset.s; stars(); };
    el('zfb-text').oninput = () => { el('zfb-count').textContent = el('zfb-text').value.length + ' / 4000'; };
    const setFile = (f) => {
      if (f && !/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return toast('Please choose a PNG, JPG, WebP or GIF image', 'error');
      if (f && f.size > 5 * 1024 * 1024) return toast('That image is too big (max 5 MB)', 'error');
      S.file = f || null;
      const box = el('zfb-shot');
      if (!f) { box.hidden = true; box.innerHTML = ''; return; }
      const url = URL.createObjectURL(f);
      box.hidden = false; box.innerHTML = `<img src="${url}" alt="Screenshot preview"><span>${esc(f.name || 'Screenshot')}</span><button type="button" class="zfb-x sm" id="zfb-shot-x" aria-label="Remove screenshot">${svg('x')}</button>`;
      el('zfb-shot-x').onclick = () => { el('zfb-file').value = ''; setFile(null); };
    };
    el('zfb-attach').onclick = () => el('zfb-file').click();
    el('zfb-file').onchange = () => setFile(el('zfb-file').files[0]);
    el('zfb-text').addEventListener('paste', (e) => { const it = [...(e.clipboardData || {}).items || []].find((i) => i.type.startsWith('image/')); if (it) { const f = it.getAsFile(); if (f) { setFile(f); toast('Screenshot added', 'success'); } } });
    S.file = null; sync(); stars();
    el('zfb-send').onclick = async () => {
      const text = el('zfb-text').value.trim();
      if (!text && !S.rating) { el('zfb-text').focus(); return toast('Write a few words or pick a star rating', 'error'); }
      if (S.kind === 'idea' && !text) { el('zfb-text').focus(); return toast('Describe your idea', 'error'); }
      const fd = new FormData();
      fd.append('kind', S.kind); fd.append('content', text); fd.append('rating', String(S.rating));
      if (S.kind === 'idea') { fd.append('title', el('zfb-title').value.trim()); fd.append('show_public', el('zfb-public').checked ? 'true' : 'false'); fd.append('anonymous', el('zfb-anon').checked ? 'true' : 'false'); }
      if (S.file) fd.append('screenshot', S.file, S.file.name || 'screenshot.png');
      const btn = el('zfb-send'); btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const r = await call('/api/feedback', { method: 'POST', form: fd });
        const kind = S.kind; S.rating = 0; S.file = null;
        body().innerHTML = `<div class="zfb-done"><div class="zfb-tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg></div>
          <h4>Thank you!</h4><p>${kind === 'idea' ? (r.public ? 'Your idea is on the Ideas board — others can vote for it now.' : r.waiting_review ? 'Your idea was sent. It appears on the Ideas board once the team has looked at it.' : 'Your idea was sent to the team.') : kind === 'request' ? 'Your request was sent to the team. You\'ll get a notification when they reply.' : 'Your feedback was sent. You\'ll get a notification if the team replies.'}</p>
          <div class="zfb-actions"><button class="zfb-btn" id="zfb-again">Send another</button><button class="zfb-btn pri" id="zfb-view">${kind === 'idea' && r.public ? 'See the Ideas board' : 'View it'}</button></div></div>`;
        el('zfb-again').onclick = () => show('send');
        el('zfb-view').onclick = () => (kind === 'idea' && r.public ? show('ideas') : show('mine', r.id));
      } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Send feedback'; }
    };
  }

  /* ───────────────────────── my feedback ───────────────────────── */
  const pill = (t) => `<span class="zfb-pill ${STATUS_CLS[t.status] || ''}">${esc(t.status_label)}</span>`;
  const starsRo = (n) => n ? `<span class="zfb-stars ro" aria-label="${n} out of 5 stars">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}">${svg('star')}</i>`).join('')}</span>` : '';
  async function drawMine() {
    body().innerHTML = '<div class="zfb-load">Loading…</div>';
    try {
      const d = await call('/api/feedback/mine');
      S.mine = d.tickets;
      if (S.tab !== 'mine') return;
      body().innerHTML = staffBar() + (d.tickets.length ? `<div class="zfb-list">${d.tickets.map((t) => `<button class="zfb-item${t.unread ? ' unread' : ''}" data-id="${t.id}">
          <span class="zfb-ic k-${t.kind}">${svg(t.kind)}</span>
          <span class="zfb-item-main"><b>${esc(t.title || t.content.slice(0, 80) || t.kind_label)}</b><span>${esc(t.kind_label)} · ${ago(t.updated_at)}${t.public ? ' · on the Ideas board' : ''}</span></span>
          ${t.unread ? '<span class="zfb-new">New reply</span>' : pill(t)}</button>`).join('')}</div>`
        : `<div class="zfb-empty">${svg('other')}<b>Nothing here yet</b><span>Feedback and requests you send show up here, with the team's replies.</span><button class="zfb-btn pri" id="zfb-first">Send feedback</button></div>`);
      const f = el('zfb-first'); if (f) f.onclick = () => show('send');
      body().querySelectorAll('.zfb-item').forEach((b) => b.onclick = () => drawThread(+b.dataset.id));
    } catch (e) { body().innerHTML = `<div class="zfb-empty"><b>Couldn't load</b><span>${esc(e.message)}</span></div>`; }
  }
  async function drawThread(id) {
    S.tab = 'mine';
    el('zfb').querySelectorAll('.zfb-tabs [data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === 'mine'));
    body().innerHTML = '<div class="zfb-load">Loading…</div>';
    let d;
    try { d = await call('/api/feedback/' + id); } catch (e) { body().innerHTML = `<div class="zfb-empty"><b>Couldn't open it</b><span>${esc(e.message)}</span><button class="zfb-btn" id="zfb-b2">Back</button></div>`; el('zfb-b2').onclick = drawMine; return; }
    const t = d.ticket;
    const steps = t.status === 'declined' ? [['declined', 'Not planned']] : [['new', 'Received'], ['seen', 'Seen'], [t.status === 'planned' ? 'planned' : 'in_progress', t.status === 'planned' ? 'Planned' : 'In progress'], ['done', 'Done']];
    const order = { new: 0, seen: 1, in_progress: 2, planned: 2, done: 3, declined: 0 };
    body().innerHTML = `<button class="zfb-back" id="zfb-back">${svg('back')} All my feedback</button>
      <div class="zfb-thread-head"><span class="zfb-ic k-${t.kind}">${svg(t.kind)}</span><div><b>${esc(t.title || t.kind_label)}</b><span>${esc(t.kind_label)} · sent ${ago(t.created_at)}</span></div>${pill(t)}</div>
      <div class="zfb-steps${t.status === 'declined' ? ' no' : ''}">${steps.map(([k, l], i) => `<div class="${i <= order[t.status] ? 'on' : ''}"><i></i><span>${l}</span></div>`).join('')}</div>
      <div class="zfb-msgs" id="zfb-msgs">
        <div class="zfb-msg me"><div class="zfb-bub">${t.content ? esc(t.content) : '<em>(no text)</em>'}${starsRo(t.rating)}${t.has_screenshot ? `<a href="/api/feedback/shot/${t.id}" target="_blank" rel="noopener"><img class="zfb-shot-img" src="/api/feedback/shot/${t.id}" alt="Your screenshot" loading="lazy"></a>` : ''}</div><span class="zfb-when">You · ${ago(t.created_at)}</span></div>
        ${d.messages.map((m) => m.system ? `<div class="zfb-sys"><span>${esc(m.content)}</span></div>` : `<div class="zfb-msg ${m.staff ? 'them' : 'me'}"><div class="zfb-bub">${esc(m.content)}</div><span class="zfb-when">${m.staff ? `<b class="${m.role}">${esc(m.label)}</b>` : 'You'} · ${ago(m.t)}</span></div>`).join('')}
        ${!d.messages.length ? '<div class="zfb-sys"><span>The team will reply here. You\'ll get a notification.</span></div>' : ''}
      </div>
      ${t.public_reply ? `<div class="zfb-official"><b>Official answer</b>${esc(t.public_reply)}</div>` : ''}
      ${d.can_reply ? `<div class="zfb-reply"><textarea class="zfb-in" id="zfb-reply" rows="2" maxlength="4000" placeholder="Write a reply…"></textarea><button class="zfb-btn pri" id="zfb-reply-go">Send</button></div>` : ''}
      <button class="zfb-link danger" id="zfb-del">Delete this feedback</button>`;
    el('zfb-back').onclick = drawMine;
    const box = el('zfb-msgs'); box.scrollTop = box.scrollHeight;
    if (el('zfb-reply-go')) {
      const send = async () => {
        const v = el('zfb-reply').value.trim(); if (!v) return;
        el('zfb-reply-go').disabled = true;
        try { await call(`/api/feedback/${id}/reply`, { method: 'POST', body: { content: v } }); drawThread(id); } catch (e) { toast(e.message, 'error'); el('zfb-reply-go').disabled = false; }
      };
      el('zfb-reply-go').onclick = send;
      el('zfb-reply').onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); };
    }
    el('zfb-del').onclick = async () => {
      const ok = window.showConfirm ? await window.showConfirm('Delete this feedback?', 'It is removed for you and the team, along with the replies.', true) : confirm('Delete this feedback?');
      if (!ok) return;
      try { await call('/api/feedback/' + id, { method: 'DELETE' }); toast('Deleted', 'success'); drawMine(); } catch (e) { toast(e.message, 'error'); }
    };
    poll();
  }

  /* ───────────────────────── ideas board ───────────────────────── */
  async function drawIdeas() {
    body().innerHTML = '<div class="zfb-load">Loading…</div>';
    let d;
    try { d = await call(`/api/feedback/ideas?sort=${S.ideaSort}&status=${S.ideaStatus}`); } catch (e) { body().innerHTML = `<div class="zfb-empty"><b>Couldn't load ideas</b><span>${esc(e.message)}</span></div>`; return; }
    if (S.tab !== 'ideas') return;
    const F = [['top', '', 'Most wanted'], ['new', '', 'Newest'], ['top', 'planned', `Planned${d.counts.planned ? ' ' + d.counts.planned : ''}`], ['top', 'in_progress', `In progress${d.counts.in_progress ? ' ' + d.counts.in_progress : ''}`], ['top', 'done', `Done${d.counts.done ? ' ' + d.counts.done : ''}`]];
    body().innerHTML = `<div class="zfb-ideas-top"><div class="zfb-chips" id="zfb-if">${F.map(([s, st, l]) => `<button data-s="${s}" data-st="${st}" class="${S.ideaSort === s && S.ideaStatus === st ? 'on' : ''}">${l}</button>`).join('')}</div><button class="zfb-btn pri sm" id="zfb-suggest">+ Suggest an idea</button></div>
      ${d.ideas.length ? `<div class="zfb-ideas">${d.ideas.map((i) => `<div class="zfb-idea" data-id="${i.id}">
        <button class="zfb-vote${i.voted ? ' on' : ''}" data-v="${i.id}" aria-pressed="${i.voted}" aria-label="${i.voted ? 'Remove your vote' : 'Vote for this idea'}" ${i.mine ? 'title="Your idea"' : ''}>${svg('caret')}<b>${i.votes}</b></button>
        <div class="zfb-idea-main"><div class="zfb-idea-t"><b>${esc(i.title)}</b>${i.status !== 'new' && i.status !== 'seen' ? pill(i) : ''}</div>
          ${i.content && i.content !== i.title ? `<p>${esc(i.content)}</p>` : ''}
          ${i.public_reply ? `<div class="zfb-official"><b>Zelpophai team</b>${esc(i.public_reply)}</div>` : ''}
          <span class="zfb-by">${i.mine ? 'Your idea' : i.by ? 'by ' + esc(i.by) : 'by a Zelpophai user'} · ${ago(i.created_at)}</span></div></div>`).join('')}</div>`
        : `<div class="zfb-empty">${svg('idea')}<b>${S.ideaStatus ? 'Nothing in this list yet' : 'No ideas yet — be the first'}</b><span>Ideas people share appear here. Vote for the ones you want and we build the most wanted first.</span></div>`}`;
    el('zfb-if').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.ideaSort = b.dataset.s; S.ideaStatus = b.dataset.st; drawIdeas(); };
    el('zfb-suggest').onclick = () => show('send', 'idea');
    body().querySelectorAll('[data-v]').forEach((b) => b.onclick = async () => {
      if (!d.can_vote) return toast('Create an account to vote on ideas', 'error');
      b.disabled = true;
      try { const r = await call(`/api/feedback/${b.dataset.v}/vote`, { method: 'POST' }); b.classList.toggle('on', r.voted); b.setAttribute('aria-pressed', r.voted); b.querySelector('b').textContent = r.votes; }
      catch (e) { toast(e.message, 'error'); }
      b.disabled = false;
    });
  }

  /* ───────────────────────── badge + reply notifications ───────────────────────── */
  async function poll() {
    try {
      const d = await call('/api/feedback/unread');
      const n = d.count + (S.cfg.isStaff ? (d.staff_open || 0) : 0);
      const badge = el('feedback-badge');
      if (badge) { badge.textContent = n; badge.style.display = n ? 'block' : 'none'; }
      const mn = el('zfb-mine-n'); if (mn) { mn.hidden = !d.count; mn.textContent = d.count; }
      if (d.latest && String(d.latest.message_id) !== ls.get('zf_seen_msg', '') ) {
        ls.set('zf_seen_msg', String(d.latest.message_id));
        if (!S.opened) {
          const title = d.latest.system ? 'Update on your feedback' : d.latest.by + ' replied to your feedback';
          replyCard(title, d.latest.text, d.latest.ticket_id);
          osNotify(title, d.latest.text, 'feedback-reply');
        }
      }
      if (S.cfg.isStaff) {
        const so = d.staff_open || 0, prev = +ls.get('zf_staff_open', '0');
        if (so > prev && S.lastUnread >= 0) { toast(`New feedback: ${so} waiting in the Vault`); osNotify('New feedback', `${so} item${so > 1 ? 's' : ''} waiting for a reply`, 'feedback-new'); }
        ls.set('zf_staff_open', String(so));
      }
      S.lastUnread = n;
    } catch (e) {}
  }
  // System notification (Windows action centre / phone panel) when the tab isn't in front.
  function osNotify(title, text, tag) {
    try {
      if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
      const n = new Notification('Zelpophai AI — ' + title, { body: String(text || '').slice(0, 200), icon: '/static/icons/icon-192.png', tag });
      n.onclick = () => { try { window.focus(); n.close(); } catch (e) {} };
    } catch (e) {}
  }
  function replyCard(title, text, ticketId) {
    const old = el('zfb-card'); if (old) old.remove();
    const c = document.createElement('div');
    c.id = 'zfb-card'; c.className = 'zfb-card';
    c.innerHTML = `<button class="zfb-x sm" aria-label="Dismiss">${svg('x')}</button><div class="zfb-card-h">${svg('other')}<b>${esc(title)}</b></div><p>${esc(text)}</p><button class="zfb-btn pri sm">Open</button>`;
    document.body.appendChild(c);
    requestAnimationFrame(() => c.classList.add('in'));
    const kill = () => { c.classList.remove('in'); setTimeout(() => c.remove(), 250); };
    c.querySelector('.zfb-x').onclick = kill;
    c.querySelector('.zfb-btn').onclick = () => { kill(); open('mine', ticketId); };
    setTimeout(kill, 20000);
  }

  /* ───────────────────────── "How is Zelpophai so far?" ───────────────────────── */
  async function maybePulse() {
    try {
      if (document.hidden || S.opened || el('zfb-pulse')) return;
      if ([...document.querySelectorAll('.modal')].some((m) => getComputedStyle(m).display !== 'none')) return;
      if (typeof window.zpBusy === 'function' && window.zpBusy()) return;
      const d = await call('/api/feedback/pulse');
      if (!d.ask) return;
      const c = document.createElement('div');
      c.id = 'zfb-pulse'; c.className = 'zfb-card zfb-ask';
      c.innerHTML = `<button class="zfb-x sm" aria-label="Not now">${svg('x')}</button><div class="zfb-card-h"><b>How is Zelpophai so far?</b></div><p>One tap — it helps us a lot.</p>
        <div class="zfb-stars big" id="zfp-stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-s="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">${svg('star')}</button>`).join('')}</div>`;
      document.body.appendChild(c);
      requestAnimationFrame(() => c.classList.add('in'));
      const kill = () => { c.classList.remove('in'); setTimeout(() => c.remove(), 250); };
      let answered = false;
      c.querySelector('.zfb-x').onclick = () => { if (!answered) call('/api/feedback/pulse', { method: 'POST', body: { dismiss: true } }).catch(() => {}); kill(); };
      const st = c.querySelector('#zfp-stars');
      st.onmouseover = (e) => { const b = e.target.closest('[data-s]'); if (b) st.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', +x.dataset.s <= +b.dataset.s)); };
      st.onmouseleave = () => st.querySelectorAll('[data-s]').forEach((x) => x.classList.remove('on'));
      st.onclick = async (e) => {
        const b = e.target.closest('[data-s]'); if (!b) return;
        const rating = +b.dataset.s; answered = true;
        try { await call('/api/feedback/pulse', { method: 'POST', body: { rating } }); } catch (err) {}
        c.innerHTML = `<button class="zfb-x sm" aria-label="Close">${svg('x')}</button><div class="zfb-card-h"><b>${rating >= 4 ? 'Thank you! What do you like most?' : 'Thanks. What could be better?'}</b></div>
          <textarea class="zfb-in" rows="3" maxlength="2000" placeholder="Optional — a sentence is plenty"></textarea><div class="zfb-actions"><button class="zfb-btn sm" data-a="skip">Skip</button><button class="zfb-btn pri sm" data-a="send">Send</button></div>`;
        c.querySelector('.zfb-x').onclick = kill;
        c.querySelector('[data-a="skip"]').onclick = kill;
        c.querySelector('[data-a="send"]').onclick = async () => {
          const v = c.querySelector('textarea').value.trim();
          if (v) { try { await call('/api/feedback/pulse', { method: 'POST', body: { rating, comment: v } }); } catch (err) {} }
          toast('Thank you for the feedback!', 'success'); kill();
        };
      };
    } catch (e) {}
  }

  /* ───────────────────────── thumbs on AI answers ───────────────────────── */
  const R = { map: {}, want: new Set(), timer: null, reasons: { wrong: 'Wrong or made up', unhelpful: "Didn't help", ignored: "Didn't do what I asked", long: 'Too long', slow: 'Too slow', unsafe: 'Unsafe or offensive', other: 'Something else' } };
  function paint(mid) {
    document.querySelectorAll(`.zfb-thumb[data-mid="${mid}"]`).forEach((b) => { const on = R.map[mid] === +b.dataset.v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }
  async function fetchRatings() {
    const ids = [...R.want]; R.want.clear(); if (!ids.length) return;
    try { const d = await call('/api/feedback/ratings?ids=' + ids.join(',')); if (d.reasons) R.reasons = d.reasons; ids.forEach((i) => { R.map[i] = d.ratings[i] || 0; paint(i); }); } catch (e) {}
  }
  function closeReason() { const p = el('zfb-reason'); if (p) p.remove(); document.removeEventListener('mousedown', outsideReason, true); }
  function outsideReason(e) { const p = el('zfb-reason'); if (p && !p.contains(e.target) && !e.target.closest('.zfb-thumb')) closeReason(); }
  function reasonPop(anchor, mid) {
    closeReason();
    const p = document.createElement('div');
    p.id = 'zfb-reason'; p.className = 'zfb-reason';
    p.innerHTML = `<b>What went wrong?</b><div class="zfb-chips">${Object.entries(R.reasons).map(([k, l]) => `<button type="button" data-r="${k}">${esc(l)}</button>`).join('')}</div>
      <textarea class="zfb-in" rows="2" maxlength="1000" placeholder="Anything to add? (optional)"></textarea><div class="zfb-actions"><button class="zfb-btn sm" data-a="skip">Skip</button><button class="zfb-btn pri sm" data-a="send">Send</button></div>`;
    anchor.closest('.msg-actions').after(p);
    let reason = '';
    p.querySelector('.zfb-chips').onclick = (e) => { const b = e.target.closest('[data-r]'); if (!b) return; reason = reason === b.dataset.r ? '' : b.dataset.r; p.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x.dataset.r === reason)); };
    p.querySelector('[data-a="skip"]').onclick = closeReason;
    p.querySelector('[data-a="send"]').onclick = async () => {
      try { await call('/api/feedback/rate', { method: 'POST', body: { message_id: mid, value: -1, reason, comment: p.querySelector('textarea').value.trim() } }); toast('Thanks — that helps us improve', 'success'); } catch (e) { toast(e.message, 'error'); }
      closeReason();
    };
    setTimeout(() => document.addEventListener('mousedown', outsideReason, true), 0);
    try { p.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
  }
  function attachRating(actions, mid) {
    if (!actions || !mid || actions.querySelector('.zfb-thumb')) return;
    mid = +mid; if (!mid) return;
    const mk = (v, name, label) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'zfb-thumb'; b.dataset.mid = mid; b.dataset.v = v; b.title = label; b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', 'false'); b.innerHTML = svg(name); return b; };
    const up = mk(1, 'up', 'Good answer'), down = mk(-1, 'down', 'Bad answer');
    const ref = actions.querySelector('[data-action="speak"]');
    if (ref) { ref.after(up); up.after(down); } else { actions.appendChild(up); actions.appendChild(down); }
    const click = async (b) => {
      const v = +b.dataset.v, next = R.map[mid] === v ? 0 : v;
      R.map[mid] = next; paint(mid); closeReason();
      try { await call('/api/feedback/rate', { method: 'POST', body: { message_id: mid, value: next } }); } catch (e) { R.map[mid] = 0; paint(mid); return toast(e.message, 'error'); }
      if (next === -1) reasonPop(b, mid); else if (next === 1) toast('Thanks for the thumbs up!', 'success');
    };
    up.onclick = () => click(up); down.onclick = () => click(down);
    if (mid in R.map) paint(mid); else { R.want.add(mid); clearTimeout(R.timer); R.timer = setTimeout(fetchRatings, 350); }
  }

  function init(cfg) {
    S.cfg = cfg || {};
    const btn = el('feedback-btn');
    if (btn) btn.addEventListener('click', () => open(S.lastUnread > 0 && !S.cfg.isStaff ? 'mine' : 'send'));
    poll(); setInterval(() => { if (!document.hidden) poll(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
    if (!S.cfg.isStaff) { setTimeout(maybePulse, 90000); setInterval(maybePulse, 15 * 60000); }
  }
  window.ZPFeedback = { init, open, attachRating, _pulse: maybePulse };
})();
