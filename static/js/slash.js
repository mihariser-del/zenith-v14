/* "/" commands in the message box. Type / to see them, keep typing to filter, ↑ ↓ to move,
   Enter or Tab to choose, Esc to close. Commands either do something in the app (/new, /memory…),
   switch a mode (/think, /research…), make something (/image, /video) or send a ready-made
   request (/summarize, /shorter…). A message that merely starts with a slash is sent as normal. */
(function () {
  'use strict';
  const Z = window.ZUI, esc = Z.esc, icon = Z.icon;
  let input, box, items = [], sel = 0, cfg = {}, personas = null;

  const send = (text) => { input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); if (typeof Chat !== 'undefined' && Chat.send) Chat.send(); };
  const mode = (btnId, arg, fallbackHint) => { const b = document.getElementById(btnId); if (b && !b.classList.contains('active')) b.click(); if (arg) send(arg); else { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.placeholder = fallbackHint; input.focus(); } };
  const click = (id) => { const b = document.getElementById(id); if (b) b.click(); };
  const clear = () => { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); };

  // name, what it needs after it (arg), group, icon, description, run(arg)
  const CMDS = [
    { n: 'image', a: 'what to draw', g: 'Create', i: 'palette', d: 'Make a picture', need: true, run: (a) => { clear(); Chat.generateImageNow(a); } },
    { n: 'video', a: 'what to film', g: 'Create', i: 'send', d: 'Make a short video', run: (a) => { clear(); if (a && Chat.generateVideoNow) Chat.generateVideoNow(a); else if (Chat.openVideoDialog) Chat.openVideoDialog(); } },
    { n: 'think', a: 'your question', g: 'Modes', i: 'brain', d: 'Think step by step before answering', run: (a) => mode('think-btn', a, 'Think mode is on — ask your question…') },
    { n: 'research', a: 'topic', g: 'Modes', i: 'search', d: 'Deep research with sources', run: (a) => mode('research-btn', a, 'Research mode is on — what should I research?') },
    { n: 'fact', a: 'a claim to check', g: 'Modes', i: 'check', d: 'Fact-check something', run: (a) => mode('factcheck-btn', a, 'Fact-check mode is on — paste the claim…') },
    { n: 'summarize', a: 'text (optional)', g: 'Quick asks', i: 'book', d: 'Sum up this chat, or some text', run: (a) => send(a ? `Summarise this in a few clear bullet points:\n\n${a}` : 'Summarise our conversation so far in a few clear bullet points.') },
    { n: 'shorter', g: 'Quick asks', i: 'bolt', d: 'Make the last answer shorter', run: () => send('Make your last answer much shorter — just the key points.') },
    { n: 'simpler', g: 'Quick asks', i: 'smile', d: 'Explain the last answer more simply', run: () => send('Explain your last answer again in much simpler words, like I\'m new to this.') },
    { n: 'longer', g: 'Quick asks', i: 'plus', d: 'Add more detail to the last answer', run: () => send('Expand your last answer with more detail and an example.') },
    { n: 'translate', a: 'language', g: 'Quick asks', i: 'users', d: 'Translate the last answer', need: true, run: (a) => send(`Translate your last answer into ${a}.`) },
    { n: 'fix', a: 'your text', g: 'Quick asks', i: 'pen', d: 'Fix spelling and grammar', need: true, run: (a) => send(`Fix the spelling and grammar in this text. Keep my meaning and tone, and show the corrected version first:\n\n${a}`) },
    { n: 'explain', a: 'anything', g: 'Quick asks', i: 'cap', d: 'Explain something clearly', need: true, run: (a) => send(`Explain this clearly with a simple example: ${a}`) },
    { n: 'continue', g: 'Quick asks', i: 'reply', d: 'Carry on from where it stopped', run: () => send('Continue from where you stopped.') },
    { n: 'remember', a: 'a fact about you', g: 'Zelpophai', i: 'pin', d: 'Save something to Memory', need: true, login: true, run: async (a) => { clear(); try { await Z.call('/api/memories', { method: 'POST', body: { content: a } }); Z.toast('Remembered: ' + a, 'success'); } catch (e) { Z.toast(e.message, 'error'); } } },
    { n: 'memory', g: 'Zelpophai', i: 'brain', d: 'See what Zelpophai remembers', login: true, run: () => { clear(); if (typeof Memory !== 'undefined') Memory.open(); } },
    { n: 'personality', a: 'name (optional)', g: 'Zelpophai', i: 'spark', d: 'Change how Zelpophai talks', run: (a) => { clear(); setPersona(a); } },
    { n: 'new', g: 'Zelpophai', i: 'plus', d: 'Start a new chat', run: () => { clear(); click('new-chat-btn'); } },
    { n: 'search', a: 'words to find', g: 'Zelpophai', i: 'search', d: 'Search your chats', run: (a) => { clear(); const p = document.getElementById('search-results'); if (p) p.style.display = 'block'; const s = document.getElementById('universal-search'); if (s) { s.value = a || ''; s.focus(); s.dispatchEvent(new Event('input', { bubbles: true })); } } },
    { n: 'share', g: 'Zelpophai', i: 'send', d: 'Share or export this chat', run: () => { clear(); click('chat-share-btn'); } },
    { n: 'files', g: 'Zelpophai', i: 'download', d: 'Open your files', login: true, run: () => { clear(); click('files-btn'); } },
    { n: 'invite', g: 'Zelpophai', i: 'gift', d: 'Invite friends', login: true, run: () => { clear(); click('invite-btn'); } },
    { n: 'feedback', g: 'Zelpophai', i: 'mail', d: 'Send feedback or an idea', run: () => { clear(); if (window.ZPFeedback) ZPFeedback.open('send'); } },
    { n: 'settings', g: 'Zelpophai', i: 'wand', d: 'Open settings', run: () => { clear(); click('settings-btn'); } },
    { n: 'help', g: 'Zelpophai', i: 'more', d: 'Show every command', run: () => { input.value = '/'; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); render(); } },
  ];
  const ALIAS = { img: 'image', pic: 'image', draw: 'image', vid: 'video', sum: 'summarize', summary: 'summarize', summarise: 'summarize', tldr: 'summarize', short: 'shorter', simple: 'simpler', eli5: 'simpler', more: 'longer', tr: 'translate', grammar: 'fix', mem: 'memory', persona: 'personality', clear: 'new', find: 'search', factcheck: 'fact', '?': 'help', commands: 'help' };

  async function setPersona(name) {
    if (!name) { if (window.ZPPersona) ZPPersona.open(); return; }
    try {
      if (!personas) { const d = await Z.call('/api/personality'); personas = [...d.personas.map((p) => ({ id: p.id, name: p.name })), ...d.state.customs.map((c) => ({ id: 'custom:' + c.id, name: c.name }))]; }
      const q = name.toLowerCase();
      const hit = personas.find((p) => p.name.toLowerCase() === q || p.id === q) || personas.find((p) => p.name.toLowerCase().startsWith(q)) || personas.find((p) => p.name.toLowerCase().includes(q));
      if (!hit) { Z.toast(`No personality called “${name}” — pick one here`); if (window.ZPPersona) ZPPersona.open(); return; }
      await Z.call('/api/personality', { method: 'PUT', body: { active: hit.id } });
      personas = null;
      Z.toast(`Personality: ${hit.name}`, 'success');
    } catch (e) { Z.toast(e.message, 'error'); }
  }

  function parse() {
    const v = input.value;
    if (!v.startsWith('/') || v.includes('\n')) return null;
    const m = /^\/(\S*)(\s+([\s\S]*))?$/.exec(v);
    if (!m) return null;
    return { name: m[1].toLowerCase(), hasSpace: m[2] !== undefined, arg: (m[3] || '').trim() };
  }
  const find = (name) => CMDS.find((c) => c.n === name) || CMDS.find((c) => c.n === ALIAS[name]);
  const usable = (c) => !(c.login && cfg.isGuest);

  function matches(p) {
    if (p.hasSpace) { const c = find(p.name); return c && usable(c) ? [c] : []; }
    const q = p.name;
    const starts = CMDS.filter((c) => usable(c) && (c.n.startsWith(q) || Object.keys(ALIAS).some((a) => ALIAS[a] === c.n && a.startsWith(q) && q)));
    const rest = q ? CMDS.filter((c) => usable(c) && !starts.includes(c) && (c.n.includes(q) || (q.length >= 3 && c.d.toLowerCase().includes(q)))) : [];
    return [...starts, ...rest];
  }

  function hide() { if (box) box.hidden = true; items = []; }
  function render() {
    const p = parse();
    if (!p) return hide();
    items = matches(p);
    if (!box) {
      box = document.createElement('div');
      box.className = 'zsl'; box.id = 'zsl'; box.setAttribute('role', 'listbox'); box.setAttribute('aria-label', 'Commands');
      const host = document.querySelector('.composer-box') || input.parentNode;
      host.style.position = host.style.position || 'relative';
      host.appendChild(box);
      box.addEventListener('mousedown', (e) => { e.preventDefault(); const r = e.target.closest('[data-i]'); if (r) choose(+r.dataset.i); });
    }
    if (!items.length) {
      // Not a command (e.g. "/usr/bin is what?") — get out of the way and let it be sent as a message.
      if (p.name.length > 1 || p.hasSpace) return hide();
      box.hidden = false; box.innerHTML = '<div class="zsl-none">No command starts with that. Press Enter to send it as a message.</div>'; return;
    }
    sel = Math.min(sel, items.length - 1);
    const single = p.hasSpace && items.length === 1;
    let html = '', grp = '';
    items.forEach((c, i) => {
      if (!single && c.g !== grp) { grp = c.g; html += `<div class="zsl-g">${grp}</div>`; }
      html += `<div class="zsl-row${i === sel ? ' on' : ''}" data-i="${i}" role="option" aria-selected="${i === sel}"><span class="zsl-ic">${icon(c.i)}</span><b>/${c.n}</b>${c.a ? `<i>${esc(c.a)}</i>` : ''}<span class="zsl-d">${esc(c.d)}</span></div>`;
    });
    const c0 = items[0];
    html += `<div class="zsl-foot">${single ? (c0.need && !p.arg ? `Type ${esc(c0.a)}, then press <kbd>Enter</kbd>` : `Press <kbd>Enter</kbd> to run <b>/${c0.n}</b>`) : '<kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to choose · <kbd>Esc</kbd> to close'}</div>`;
    box.innerHTML = html; box.hidden = false;
    const on = box.querySelector('.zsl-row.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }

  function choose(i) {
    const c = items[i]; if (!c) return;
    const p = parse() || { arg: '', hasSpace: false };
    const arg = find(p.name) === c ? p.arg : '';
    if (c.a && !arg && (c.need || !p.hasSpace) && !(p.name === c.n && !c.need && !p.hasSpace)) {
      // Needs (or can take) something after it: complete the command and wait for the rest.
      if (!(p.hasSpace && find(p.name) === c)) { input.value = `/${c.n} `; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); sel = 0; render(); return; }
      if (c.need) { Z.toast(`Type ${c.a} after /${c.n}`); return; }
    }
    hide();
    try { c.run(arg); } catch (e) { Z.toast('That command didn\'t work: ' + e.message, 'error'); }
  }

  function onKey(e) {
    if (e.target !== input || !box || box.hidden || !items.length) return;
    if (e.isComposing) return;
    const stop = () => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
    if (e.key === 'ArrowDown') { stop(); sel = (sel + 1) % items.length; render(); }
    else if (e.key === 'ArrowUp') { stop(); sel = (sel - 1 + items.length) % items.length; render(); }
    else if (e.key === 'Escape') { stop(); hide(); }
    else if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { stop(); choose(sel); }
  }

  function init(c) {
    cfg = c || {};
    input = document.getElementById('user-input');
    if (!input || !Z) return;
    input.placeholder = 'Ask anything…  or type / for commands';
    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('blur', () => setTimeout(hide, 150));
    input.addEventListener('focus', render);
    // Capture phase on the document so the menu gets Enter / arrows before the "send message" handler does.
    document.addEventListener('keydown', onKey, true);
  }
  window.ZPSlash = { init, commands: () => CMDS.map((c) => c.n) };
})();
