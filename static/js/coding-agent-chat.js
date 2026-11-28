/* Coding AGT. — the chat-first agent (26.5).
   You describe a task; the agent looks at the files, makes a plan, edits files, runs the
   code, reads the output and fixes problems, step by step, and you can watch every step.
   Each step is one call to /api/code/agent/step; the tools run here, in the browser
   (or on this PC in the Windows app). The code editor (coding-agent.js) is still one
   click away and works on the same project. */
(function () {
    'use strict';
    const CA = window.CA; if (!CA) return;
    const { S, esc, toast } = CA;
    const $ = (id) => document.getElementById(id);
    const sv = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const I = {
        logo: sv('<path d="M8.5 7L4 12l4.5 5M15.5 7L20 12l-4.5 5M13.5 5l-3 14"/>'),
        plus: sv('<path d="M12 5v14M5 12h14"/>'),
        search: sv('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
        code: sv('<path d="M8.5 7L4 12l4.5 5M15.5 7L20 12l-4.5 5"/>'),
        chat: sv('<path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.2-4.6A8 8 0 1 1 21 12z"/>'),
        back: sv('<path d="M15 18l-6-6 6-6"/>'),
        side: sv('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>'),
        panel: sv('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>'),
        globe: sv('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
        pc: sv('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
        shield: sv('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'),
        bolt: sv('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
        mic: sv('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/>'),
        send: sv('<path d="M12 19V5M5 12l7-7 7 7"/>'),
        stop: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
        file: sv('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
        eye: sv('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
        pen: sv('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
        play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
        trash: sv('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
        list: sv('<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'),
        check: sv('<path d="M5 12l5 5L20 7"/>'),
        x: sv('<path d="M6 6l12 12M18 6L6 18"/>'),
        chev: sv('<path d="M6 9l6 6 6-6"/>'),
        share: sv('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'),
        dl: sv('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>'),
        home: sv('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>'),
        menu: sv('<path d="M4 6h16M4 12h16M4 18h16"/>'),
        term: sv('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/>'),
        folder: sv('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
        attach: sv('<path d="M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>'),
    };
    const IS_APP = !!(window.zelpophaiDesktop && window.zelpophaiDesktop.run);
    const SUGGEST = [
        ['🎮', 'A snake game I can play with the arrow keys'],
        ['🌐', 'A one-page website for my bakery with a menu and opening hours'],
        ['🐍', 'A Python script that works out my monthly budget from a list of costs'],
        ['✅', 'A to-do list that remembers my tasks'],
    ];

    /* ───────────── state ───────────── */
    const P = { env: 'browser', mode: 'ask', model: 'smart' };
    try { Object.assign(P, JSON.parse(localStorage.getItem('cx_prefs') || '{}')); } catch (e) {}
    if (!IS_APP) P.env = 'browser';
    const savePrefs = () => { try { localStorage.setItem('cx_prefs', JSON.stringify(P)); } catch (e) {} };
    const X = {
        items: [],            // what's shown (and saved with the project)
        llm: [],              // the conversation in the model's format
        task: '', busy: false, stop: false, ctrl: null, allowAll: false,
        projects: [], planEl: null, saveT: null,
    };

    /* ───────────── layout ───────────── */
    function build() {
        const root = document.createElement('div');
        root.className = 'cx'; root.id = 'cx';
        root.innerHTML = `
        <aside class="cx-side" id="cx-side">
          <div class="cx-side-top">
            <a class="cx-brand" href="/code" title="Coding AGT."><span class="cx-logo">${I.logo}</span><b>Coding <i>AGT.</i></b></a>
            <button class="cx-ib" id="cx-side-x" title="Hide sidebar" aria-label="Hide sidebar">${I.side}</button>
          </div>
          <nav class="cx-nav">
            <button class="cx-nav-b" id="cx-new">${I.plus}<span>New task</span></button>
            <button class="cx-nav-b" id="cx-find-b">${I.search}<span>Search</span></button>
            <button class="cx-nav-b" id="cx-editor-b">${I.code}<span>Code editor</span></button>
            <a class="cx-nav-b" href="/app">${I.chat}<span>Zelpophai chat</span></a>
          </nav>
          <input class="cx-find" id="cx-find" placeholder="Search your projects…" hidden autocomplete="off">
          <div class="cx-rec-h">Recents</div>
          <div class="cx-recents" id="cx-recents"><div class="cx-muted">Loading…</div></div>
          <div class="cx-me" id="cx-me"></div>
        </aside>
        <div class="cx-scrim" id="cx-scrim"></div>
        <main class="cx-main">
          <header class="cx-head">
            <button class="cx-ib cx-only-closed" id="cx-side-o" title="Show sidebar" aria-label="Show sidebar">${I.menu}</button>
            <div class="cx-views" role="tablist" aria-label="View">
              <button class="on" role="tab" aria-selected="true" title="Agent" id="cx-v-chat">${I.chat}</button>
              <button role="tab" aria-selected="false" title="Code editor" id="cx-v-code">${I.code}</button>
            </div>
            <input class="cx-title" id="cx-title" value="New task" maxlength="80" aria-label="Project name" spellcheck="false">
            <span class="cx-saved" id="cx-saved"></span>
            <span class="cx-flex"></span>
            <button class="cx-hb" id="cx-share" title="Share a read-only link">${I.share}<span>Share</span></button>
            <button class="cx-hb" id="cx-zip" title="Download the project (.zip)">${I.dl}<span>Download</span></button>
            <button class="cx-hb" id="cx-panel-b" title="Preview, files and output">${I.panel}<span>Preview</span></button>
          </header>
          <div class="cx-body">
            <div class="cx-col">
              <div class="cx-scroll" id="cx-scroll">
                <section class="cx-empty" id="cx-empty">
                  <span class="cx-big">${I.logo}</span>
                  <h1>What should we build?</h1>
                  <div class="cx-envcard">
                    <button class="cx-envrow" id="cx-env-card">${P.env === 'computer' ? I.pc : I.globe}<span id="cx-env-card-t"></span>${I.chev}</button>
                    <div class="cx-envsub" id="cx-env-sub"></div>
                  </div>
                  <div class="cx-sugs">${SUGGEST.map(s => `<button class="cx-sug"><span>${s[0]}</span>${esc(s[1])}</button>`).join('')}</div>
                </section>
                <div class="cx-thread" id="cx-thread" aria-live="polite"></div>
              </div>
              <form class="cx-comp" id="cx-comp">
                <textarea id="cx-in" rows="1" placeholder="Describe a task or ask a question" aria-label="Describe a task"></textarea>
                <div class="cx-comp-row">
                  <button type="button" class="cx-ib" id="cx-attach" title="Add files to the project">${I.plus}</button>
                  <button type="button" class="cx-chip" id="cx-env" title="Where code runs"></button>
                  <button type="button" class="cx-chip" id="cx-mode" title="Ask before changing files, or let the agent work"></button>
                  <button type="button" class="cx-chip folder" id="cx-folder" title="Work on a folder on your PC" hidden></button>
                  <span class="cx-flex"></span>
                  <button type="button" class="cx-chip quiet" id="cx-model" title="Which AI model"></button>
                  <button type="button" class="cx-ib" id="cx-mic" title="Speak">${I.mic}</button>
                  <button type="submit" class="cx-send" id="cx-send" title="Send (Enter)" aria-label="Send">${I.send}</button>
                </div>
                <input type="file" id="cx-file" multiple hidden>
              </form>
              <div class="cx-note"><span id="cx-left"></span> Coding AGT. can make mistakes — check its work.</div>
            </div>
            <aside class="cx-panel" id="cx-panel" hidden>
              <div class="cx-ptabs">
                <button data-p="preview" class="on">Preview</button><button data-p="files">Files</button><button data-p="output">Output</button>
                <span class="cx-flex"></span>
                <button class="cx-ib" id="cx-run" title="Run">${I.play}</button>
                <button class="cx-ib" id="cx-panel-x" title="Close">${I.x}</button>
              </div>
              <div class="cx-pbody">
                <div data-pv="preview" class="cx-pv"><iframe id="cx-frame" title="Preview" sandbox="allow-scripts allow-modals allow-forms allow-popups allow-pointer-lock"></iframe><div class="cx-pempty" id="cx-pempty">Websites the agent builds show up here. Press ▶ to run.</div></div>
                <div data-pv="files" class="cx-pv" hidden><ul class="cx-files" id="cx-files"></ul></div>
                <div data-pv="output" class="cx-pv" hidden><pre class="cx-out" id="cx-out">Nothing has run yet.</pre></div>
              </div>
            </aside>
          </div>
        </main>`;
        document.body.insertBefore(root, document.body.firstChild);
        // a small menu used by the chips
        const menu = document.createElement('div'); menu.className = 'cx-menu'; menu.id = 'cx-menu'; menu.hidden = true; document.body.appendChild(menu);
    }

    /* ───────────── views ───────────── */
    function showChat(on) {
        document.body.classList.toggle('cx-on', on);
        $('cx-v-chat').classList.toggle('on', on); $('cx-v-code').classList.toggle('on', !on);
        const back = $('cx-back-agent'); if (back) back.hidden = on;
        try { localStorage.setItem('cx_view', on ? 'chat' : 'code'); } catch (e) {}
        if (!on && S.project && Object.keys(S.project.files).length && CA.hideHome) CA.hideHome();
        if (!on && S.cm) setTimeout(() => S.cm.refresh(), 0);
        if (on) { paintFiles(); paintTitle(); }
    }
    function sideOpen(on) {
        const cx = $('cx'); const phone = innerWidth <= 860;
        if (phone) { cx.classList.toggle('side-open', on); return; }
        cx.classList.toggle('side-closed', !on);
        try { localStorage.setItem('cx_side', on ? '1' : '0'); } catch (e) {}
    }
    function panel(which) {
        const p = $('cx-panel');
        if (which === false) { p.hidden = true; $('cx').classList.remove('panel-open'); return; }
        p.hidden = false; $('cx').classList.add('panel-open');
        which = which || 'preview';
        p.querySelectorAll('[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === which));
        p.querySelectorAll('[data-pv]').forEach(v => { v.hidden = v.dataset.pv !== which; });
        if (which === 'files') paintFiles();
    }

    /* ───────────── chips (environment, approvals, model) ───────────── */
    const ENV = { browser: ['Browser', I.globe, 'Runs websites, Python and SQL safely inside this tab.'],
                  computer: ['This computer', I.pc, 'Runs any language on your PC with what you have installed. Asks before running.'] };
    const MODE = { ask: ['Ask for approval', I.shield, 'Shows each change and waits for you to allow it.'],
                   auto: ['Auto', I.bolt, 'Edits files and runs code without asking. You can still stop it.'] };
    function paintChips() {
        const e = ENV[P.env], m = MODE[P.mode];
        $('cx-env').innerHTML = e[1] + `<span>${e[0]}</span>` + I.chev;
        $('cx-mode').innerHTML = m[1] + `<span>${m[0]}</span>` + I.chev;
        $('cx-mode').classList.toggle('warn', P.mode === 'auto');
        const smartOk = !S.status || S.status.smart !== false;
        if (!smartOk) P.model = 'fast';
        $('cx-model').innerHTML = `<b>${P.model === 'fast' ? 'Fast' : 'Smart'}</b>` + I.chev;
        $('cx-env-card').innerHTML = e[1] + `<span>${e[0]}</span>` + I.chev;
        $('cx-env-sub').textContent = e[2] + (IS_APP || P.env === 'computer' ? '' : ' Get the Windows app to run code on your own PC.');
        // 26.6: a folder on the PC (Windows app 1.6+)
        const f = $('cx-folder');
        f.hidden = !(IS_APP && P.env === 'computer');
        if (isLocal()) f.innerHTML = I.folder + `<span>${esc(X.local.name)}</span><i class="cx-fx" title="Close folder">×</i>`;
        else f.innerHTML = I.folder + '<span>Open a folder</span>';
        f.classList.toggle('on', isLocal());
        $('cx').classList.toggle('local', isLocal());
        if (isLocal()) $('cx-env-sub').textContent = 'Working directly in ' + X.local.path + ' — the agent can read, change and run files there (it asks first).';
    }
    async function pickFolder(defaultPath) {
        if (!LFS()) { toast('Update the Zelpophai Windows app (Settings → About → Check for updates) to work with folders on your PC', 'error'); return; }
        if (X.busy) { toast('Wait for the agent to finish, or press Stop', 'error'); return; }
        try {
            const r = await LFS().pick(defaultPath ? { defaultPath } : {});
            if (!r || r.cancelled) return;
            X.local = r; P.env = 'computer'; savePrefs();
            try { await B.list(''); } catch (e) {}
            paintChips(); paintFiles(); paintThread();
            toast('Coding AGT. can now work in ' + r.name);
        } catch (e) { toast(ipcMsg(e), 'error'); }
    }
    function closeFolder() { X.local = null; X.localList = null; paintChips(); paintFiles(); paintThread(); }
    function openMenu(anchor, opts, onPick) {
        const m = $('cx-menu');
        m.innerHTML = opts.map(o => `<button data-v="${o.v}" class="${o.on ? 'on' : ''}" ${o.off ? 'disabled' : ''}>${o.icon || ''}<span><b>${esc(o.t)}</b><small>${esc(o.d || '')}</small></span>${o.on ? I.check : ''}</button>`).join('');
        m.hidden = false;
        const r = anchor.getBoundingClientRect();
        const w = Math.min(320, innerWidth - 16);
        m.style.width = w + 'px';
        m.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
        const h = m.offsetHeight;
        m.style.top = (r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8) + 'px';
        const shut = (ev) => { if (!m.contains(ev.target) && ev.target !== anchor) { m.hidden = true; document.removeEventListener('mousedown', shut, true); } };
        setTimeout(() => document.addEventListener('mousedown', shut, true), 0);
        m.onclick = (ev) => { const b = ev.target.closest('[data-v]'); if (!b || b.disabled) return; m.hidden = true; document.removeEventListener('mousedown', shut, true); onPick(b.dataset.v); };
    }
    function envMenu(anchor) {
        openMenu(anchor, [
            { v: 'browser', t: ENV.browser[0], d: ENV.browser[2], icon: I.globe, on: P.env === 'browser' },
            { v: 'computer', t: ENV.computer[0], d: IS_APP ? ENV.computer[2] : 'Only in the Zelpophai Windows app.', icon: I.pc, on: P.env === 'computer', off: !IS_APP },
        ], (v) => { P.env = v; savePrefs(); paintChips(); });
    }

    /* ───────────── recents ───────────── */
    function when(t) { if (!t) return ''; const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : t + 'Z'), s = (Date.now() - d) / 1000; return s < 90 ? 'now' : s < 3600 ? Math.round(s / 60) + 'm' : s < 86400 ? Math.round(s / 3600) + 'h' : s < 86400 * 30 ? Math.round(s / 86400) + 'd' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
    async function loadRecents() {
        if (CA.isGuest()) { $('cx-recents').innerHTML = '<div class="cx-muted">Guests\' work is kept in this browser only. <a href="/">Create a free account</a> to save tasks.</div>'; return; }
        try { X.projects = (await api('/api/code/projects')).projects || []; } catch (e) { X.projects = []; }
        paintRecents();
    }
    function paintRecents() {
        const q = ($('cx-find').value || '').trim().toLowerCase();
        const list = X.projects.filter(p => !q || (p.name + ' ' + (p.first || '')).toLowerCase().includes(q));
        $('cx-recents').innerHTML = list.map(p => `<div class="cx-rec ${S.project && S.project.id === p.id ? 'on' : ''}" data-id="${p.id}" role="button" tabindex="0" title="${esc(p.first || p.name)}">
            <span class="cx-rec-t">${esc(p.name)}</span><span class="cx-rec-w">${when(p.updated_at)}</span>
            <button class="cx-rec-x" data-del="${p.id}" title="Delete" aria-label="Delete ${esc(p.name)}">${I.trash}</button></div>`).join('')
            || `<div class="cx-muted">${q ? 'Nothing matches.' : 'No tasks yet.'}</div>`;
    }
    async function openProject(id) {
        if (X.busy) { toast('Wait for the agent to finish, or press Stop', 'error'); return; }
        try {
            if (S.dirty.size) await CA.save(false);
            const p = await api('/api/code/projects/' + id);
            CA.loadProject(p);
            history.replaceState(null, '', '/code?project=' + p.id);
            X.items = Array.isArray(p.chat) ? p.chat : [];
            rebuildLlm(); paintThread(); paintRecents(); paintFiles(); paintTitle();
            if (innerWidth <= 860) sideOpen(false);
        } catch (e) { toast(e.message || 'Couldn\'t open that project', 'error'); }
    }
    async function newTask() {
        if (X.busy) { toast('Wait for the agent to finish, or press Stop', 'error'); return; }
        if (S.dirty.size) await CA.save(false);
        CA.loadProject({ id: null, name: 'New task', kind: 'blank', files: {} });
        try { history.replaceState(null, '', '/code'); } catch (e) {}
        X.items = []; X.llm = []; X.task = ''; X.allowAll = false;
        paintThread(); paintRecents(); paintFiles(); paintTitle(); panel(false);
        $('cx-frame').srcdoc = ''; $('cx-pempty').hidden = false; $('cx-out').textContent = 'Nothing has run yet.';
        if (innerWidth <= 860) sideOpen(false);
        $('cx-in').focus();
    }

    /* ───────────── thread ───────────── */
    function md(el, text) {
        if (window.ZRender) ZRender.render(el, text, { inner: true }); else el.textContent = text;
    }
    function scrollDown(force) {
        const s = $('cx-scroll');
        if (force || s.scrollHeight - s.scrollTop - s.clientHeight < 220) s.scrollTop = s.scrollHeight;
    }
    function paintThread() {
        const t = $('cx-thread'); t.innerHTML = ''; X.planEl = null;
        X.items.forEach(it => t.appendChild(itemEl(it)));
        $('cx-empty').hidden = X.items.length > 0;
        scrollDown(true);
    }
    function push(it) {
        X.items.push(it);
        $('cx-empty').hidden = true;
        const el = itemEl(it); $('cx-thread').appendChild(el); scrollDown(true);
        saveChatSoon();
        return el;
    }
    const TOOL_LABEL = { list_files: 'Looked at the files', read_file: 'Read', search_files: 'Searched for', write_file: 'Wrote', edit_file: 'Edited', multi_edit: 'Edited', delete_file: 'Deleted', run: 'Ran', run_command: 'Ran', web_search: 'Searched the web', update_plan: 'Plan' };
    const TOOL_ICON = { list_files: I.list, read_file: I.eye, search_files: I.search, write_file: I.file, edit_file: I.pen, multi_edit: I.pen, delete_file: I.trash, run: I.play, run_command: I.term, web_search: I.globe };
    function itemEl(it) {
        const d = document.createElement('div');
        if (it.t === 'user') { d.className = 'cx-u'; d.innerHTML = `<div class="cx-u-b"></div>`; d.firstChild.textContent = it.text; return d; }
        if (it.t === 'ai') { d.className = 'cx-a'; md(d, it.text); return d; }
        if (it.t === 'note') { d.className = 'cx-n'; d.textContent = it.text; return d; }
        if (it.t === 'folder') {
            d.className = 'cx-fold';
            const live = X.local && X.local.path === it.path;
            d.innerHTML = `${I.folder}<span>Working in <b>${esc(it.name)}</b> <small>${esc(it.path)}</small></span>`;
            if (!live && LFS()) { const b = document.createElement('button'); b.className = 'cx-btn'; b.textContent = 'Reconnect folder'; b.onclick = () => pickFolder(it.path); d.appendChild(b); }
            else if (!LFS()) { const sm = document.createElement('small'); sm.textContent = '(open the Windows app to keep working there)'; d.appendChild(sm); }
            return d;
        }
        if (it.t === 'error') {
            d.className = 'cx-err'; d.innerHTML = `<span>${esc(it.text)}</span>`;
            if (it.retry) { const b = document.createElement('button'); b.className = 'cx-btn'; b.textContent = 'Retry'; b.onclick = () => { d.remove(); X.items = X.items.filter(x => x !== it); loop(); }; d.appendChild(b); }
            return d;
        }
        if (it.t === 'plan') { d.className = 'cx-plan'; paintPlan(d, it.steps); X.planEl = d; X.planIt = it; return d; }
        if (it.t === 'tool') {
            d.className = 'cx-tool ' + (it.status || '');
            const stats = it.add != null ? ` <span class="add">+${it.add}</span> <span class="del">−${it.del}</span>` : '';
            d.innerHTML = `<button class="cx-tool-h" aria-expanded="false">${TOOL_ICON[it.name] || I.bolt}<span class="cx-tool-l">${esc(TOOL_LABEL[it.name] || it.name)}</span><span class="cx-tool-p">${esc(it.label || '')}</span>${stats}<span class="cx-tool-s">${it.status === 'err' ? 'failed' : it.status === 'denied' ? 'not allowed' : it.status === 'run' ? '' : ''}</span>${it.detail ? I.chev : ''}</button>${it.detail ? `<pre class="cx-tool-d" hidden></pre>` : ''}`;
            if (it.detail) {
                const pre = d.querySelector('pre');
                if (it.diff) pre.innerHTML = it.detail; else pre.textContent = it.detail;
                d.querySelector('.cx-tool-h').onclick = () => { pre.hidden = !pre.hidden; d.querySelector('.cx-tool-h').setAttribute('aria-expanded', !pre.hidden); };
                if (it.open) pre.hidden = false;
            }
            if (it.made && it.made.length) {
                const box = document.createElement('div'); box.className = 'cx-made';
                it.made.forEach(f => {
                    const live = (S.made || []).find(x => x.url === f.url);
                    const kb = f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB';
                    const row = document.createElement('div'); row.className = 'cx-made-r';
                    row.innerHTML = `<span>📦</span><b>${esc(f.path)}</b><small>${kb}</small>` + (live ? `<a class="cx-btn pri" href="${live.url}" download="${esc(f.path.split('/').pop())}">${I.dl}Download</a>` : `<small class="cx-made-old">Run it again to download</small>`);
                    box.appendChild(row);
                });
                d.appendChild(box);
            }
            if (it.path && !it.local && (it.name === 'write_file' || it.name === 'edit_file') && it.status !== 'denied' && it.status !== 'err') {
                const dl = document.createElement('button'); dl.className = 'cx-ib sm cx-tool-dl'; dl.title = 'Download ' + it.path.split('/').pop(); dl.innerHTML = I.dl;
                dl.onclick = (e) => { e.stopPropagation(); downloadFile(it.path); };
                d.querySelector('.cx-tool-h').insertBefore(dl, d.querySelector('.cx-tool-h > svg:last-child') || null);
                if (/\.html?$/i.test(it.path)) {
                    const one = document.createElement('button'); one.className = 'cx-ib sm cx-tool-dl'; one.title = 'Download as one file with its CSS & JavaScript built in'; one.innerHTML = I.globe;
                    one.onclick = (e) => { e.stopPropagation(); downloadOne(it.path); };
                    dl.parentNode.insertBefore(one, dl);
                }
            }
            if (it.path && (it.name === 'write_file' || it.name === 'edit_file' || it.name === 'read_file')) {
                const p = d.querySelector('.cx-tool-p'); p.classList.add('link'); p.title = 'Open in the code editor';
                p.onclick = (e) => {
                    e.stopPropagation();
                    if (it.local) { if (isLocal()) LFS().open(X.local.id, it.path).catch(() => {}); return; }
                    if (it.path in S.project.files) { showChat(false); CA.openFile(it.path); }
                };
                if (it.local) p.title = 'Open with its program on your PC';
            }
            return d;
        }
        d.textContent = '';
        return d;
    }
    function paintPlan(el, steps) {
        el.innerHTML = `<div class="cx-plan-h">${I.list}<b>Plan</b><span>${steps.filter(s => s.status === 'done').length}/${steps.length}</span></div>` +
            steps.map(s => `<div class="cx-step ${s.status}"><i>${s.status === 'done' ? I.check : ''}</i><span>${esc(s.text)}</span></div>`).join('');
    }
    function working(on, text) {
        let w = $('cx-working');
        if (!on) { if (w) w.remove(); return; }
        if (!w) { w = document.createElement('div'); w.id = 'cx-working'; w.className = 'cx-working'; $('cx-thread').appendChild(w); }
        else $('cx-thread').appendChild(w);
        w.innerHTML = `<span class="cx-dots"><i></i><i></i><i></i></span>${esc(text || 'Thinking')}`;
        scrollDown();
    }

    /* ───────────── saving the conversation ───────────── */
    function saveChatSoon() {
        clearTimeout(X.saveT);
        X.saveT = setTimeout(saveChat, 1200);
    }
    async function saveChat() {
        const items = X.items.map(it => { const c = { ...it }; if (c.made) c.made = c.made.map(f => ({ path: f.path, size: f.size })); if (c.detail && c.detail.length > 6000) c.detail = c.detail.slice(0, 6000) + '\n…'; delete c.open; return c; });
        if (CA.isGuest()) { try { localStorage.setItem('cx_guest_chat', JSON.stringify(items.slice(-120))); } catch (e) {} return; }
        if (!S.project.id) { await CA.save(false); if (!S.project.id) return; history.replaceState(null, '', '/code?project=' + S.project.id); }
        try { await api('/api/code/projects/' + S.project.id + '/chat', { method: 'PUT', body: JSON.stringify({ chat: items }) }); } catch (e) {}
        const known = X.projects.find(p => p.id === S.project.id);
        if (!known) loadRecents(); else { known.name = S.project.name; known.updated_at = new Date().toISOString(); paintRecents(); }
    }
    // Rebuild what the model needs to know from a saved conversation.
    function rebuildLlm() {
        X.llm = []; X.task = '';
        let notes = [];
        const flush = () => { if (notes.length) { X.llm.push({ role: 'assistant', content: '(Earlier I: ' + notes.join('; ') + ')' }); notes = []; } };
        X.items.forEach(it => {
            if (it.t === 'user') { flush(); X.llm.push({ role: 'user', content: it.text }); }
            else if (it.t === 'ai') { flush(); X.llm.push({ role: 'assistant', content: it.text }); }
            else if (it.t === 'tool' && /write|edit|delete|run/.test(it.name)) notes.push(`${TOOL_LABEL[it.name] || it.name} ${it.label || ''}${it.status === 'err' ? ' (failed)' : ''}`);
        });
        flush();
        // the model expects user/assistant turns to alternate
        const out = [];
        X.llm.forEach(m => { const last = out[out.length - 1]; if (last && last.role === m.role) last.content += '\n\n' + m.content; else out.push({ ...m }); });
        X.llm = out.slice(-24);
        while (X.llm.length && X.llm[0].role !== 'user') X.llm.shift();
    }

    /* ───────────── approvals ───────────── */
    function approve(it, previewHtml) {
        if (P.mode === 'auto' || X.allowAll) return Promise.resolve(true);
        return new Promise((resolve) => {
            const d = document.createElement('div'); d.className = 'cx-ask';
            d.innerHTML = `<div class="cx-ask-h">${TOOL_ICON[it.name] || I.bolt}<b>${esc(it.ask)}</b></div>${previewHtml ? `<pre class="cx-ask-d">${previewHtml}</pre>` : ''}
                <div class="cx-ask-b"><button class="cx-btn pri" data-a="yes">Allow</button><button class="cx-btn" data-a="all">Allow all for this task</button><button class="cx-btn ghost" data-a="no">Don't allow</button></div>`;
            working(false);
            $('cx-thread').appendChild(d); scrollDown(true);
            d.querySelector('[data-a=yes]').focus();
            const done = (v) => { d.remove(); X.waitDeny = null; resolve(v); };
            X.waitDeny = () => done(false);
            d.querySelector('[data-a=yes]').onclick = () => done(true);
            d.querySelector('[data-a=all]').onclick = () => { X.allowAll = true; done(true); };
            d.querySelector('[data-a=no]').onclick = () => done(false);
        });
    }
    function diffHtml(oldS, newS, max) {
        const st = CA.diffStats(oldS || '', newS);
        if (oldS == null) return { add: newS.split('\n').length, del: 0, html: newS.split('\n').slice(0, max || 400).map(l => `<span class="a">+ ${esc(l)}</span>`).join('\n') };
        if (!st.d) return { add: st.add, del: st.del, html: esc(newS.slice(0, 20000)) };
        const keep = st.d.map((x, i) => x[0] !== 'c' || st.d.slice(Math.max(0, i - 2), i + 3).some(y => y[0] !== 'c'));
        const out = []; let gap = false;
        st.d.forEach((x, i) => {
            if (!keep[i]) { if (!gap) { out.push('<span class="g">⋯</span>'); gap = true; } return; }
            gap = false;
            out.push(`<span class="${x[0]}">${x[0] === 'a' ? '+ ' : x[0] === 'd' ? '− ' : '  '}${esc(x[1])}</span>`);
        });
        return { add: st.add, del: st.del, html: out.slice(0, max || 400).join('\n') };
    }

    /* ───────────── tools ───────────── */
    // Two places the agent can work: the project kept in Zelpophai (S.project.files), or — in the
    // Windows app 1.6+ — a real folder on the PC that the person picked (X.local).
    const files = () => S.project.files;
    const LFS = () => (window.zelpophaiDesktop && window.zelpophaiDesktop.fs) || null;
    const isLocal = () => !!(X.local && X.local.id && LFS());
    const cleanPath = (p) => String(p || '').trim().replace(/\\/g, '/').replace(/^\.?\/+/, '');
    const okPath = (p) => /^[\w\-. ()\[\]&+,@'!~#$%=]+(\/[\w\-. ()\[\]&+,@'!~#$%=]+)*$/.test(p) && !p.split('/').includes('..') && p.length <= 240;
    const ipcMsg = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    const kb = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round((n || 0) / 1024)) + ' KB';
    const TEXTY = /\.(txt|md|py|pyw|js|mjs|cjs|ts|tsx|jsx|json|html?|css|scss|less|xml|ya?ml|toml|ini|cfg|conf|bat|cmd|ps1|sh|java|kt|cs|cpp|cc|c|h|hpp|go|rs|rb|php|lua|sql|csv|env|gitignore|mcmeta|mcfunction|lang|properties|gradle|vue|svelte|dart|swift|r|m|pl|vb|vbs|rst|tex|svg)$/i;
    const B = {
        async list(sub) {
            if (isLocal()) {
                const r = await LFS().list(X.local.id, sub || '', { max: 2000 });
                X.localList = r.files;
                return r;
            }
            const F = files(), pre = sub ? cleanPath(sub).replace(/\/?$/, '/') : '';
            return { files: Object.keys(F).sort().filter(p => !pre || p.startsWith(pre)).map(p => ({ path: p, lines: F[p].split('\n').length })) };
        },
        // the text of a file, or null if it doesn't exist (throws for binary / too big)
        async read(p) {
            if (isLocal()) {
                let r;
                try { r = await LFS().read(X.local.id, p); } catch (e) { if (/ENOENT|doesn't exist|no such file/i.test(ipcMsg(e))) return null; throw new Error(ipcMsg(e)); }
                if (r.binary) throw new Error(`${p} is not a text file (${kb(r.size)}) — it can't be read or edited as text`);
                if (r.tooBig) throw new Error(`${p} is too big to read (${kb(r.size)})`);
                return r.text;
            }
            return p in files() ? files()[p] : null;
        },
        async write(p, text) { if (isLocal()) { await LFS().write(X.local.id, p, text); return; } CA.writeFile(p, text); },
        async remove(p) { if (isLocal()) { await LFS().remove(X.local.id, p); return; } CA.removeFile(p); },
    };
    function applyEdits(old, edits, p) {
        let cur = old;
        for (const [i, ed] of edits.entries()) {
            const o = String(ed.old_text == null ? '' : ed.old_text), n = String(ed.new_text == null ? '' : ed.new_text);
            const tag = edits.length > 1 ? ` (edit ${i + 1})` : '';
            if (!o) throw new Error('old_text is empty' + tag);
            const count = cur.split(o).length - 1;
            if (!count) {
                // forgive line-ending differences (Windows files use \r\n)
                if (cur.includes('\r\n') && cur.split(o.replace(/\r?\n/g, '\r\n')).length > 1) { cur = cur.split(o.replace(/\r?\n/g, '\r\n')).join(n.replace(/\r?\n/g, '\r\n')); continue; }
                throw new Error(`old_text wasn't found in ${p}${tag}. Read the file again and copy the text exactly.`);
            }
            if (count > 1 && !ed.replace_all) throw new Error(`old_text appears ${count} times in ${p}${tag}. Include more surrounding lines so it's unique, or set replace_all.`);
            cur = ed.replace_all ? cur.split(o).join(n) : cur.replace(o, () => n);
        }
        return cur;
    }
    // Run a command in the open folder, showing its output live in the Output panel.
    async function execLocal(command, opts, label) {
        const out = [];
        const box = $('cx-out'); box.textContent = '$ ' + command + '\n'; panel('output');
        // colour codes (\x1b[31m…) would show as junk
        const off = window.zelpophaiDesktop.onOutput((c) => { const t = String(c.text || '').replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, ''); out.push(t); box.textContent += t; box.scrollTop = box.scrollHeight; });
        let r;
        try { r = await LFS().exec(X.local.id, command, opts || {}); }
        catch (e) { r = { ok: false, error: ipcMsg(e) }; }
        finally { off(); }
        if (r.cancelled) { push({ t: 'tool', name: 'run_command', label, status: 'denied', local: true }); return { denied: true }; }
        let text = out.join('');
        if (text.length > 9000) text = text.slice(0, 2500) + '\n… (middle cut) …\n' + text.slice(-6000);
        const code = r.error && r.code == null ? r.error : 'exit code ' + r.code + (r.seconds != null ? ` · ${r.seconds}s` : '');
        return { ok: !!r.ok, text, code };
    }
    async function runTool(name, a) {
        a = a || {};
        const local = isLocal();
        if (name === 'list_files') {
            const r = await B.list(a.path ? cleanPath(a.path) : '');
            const fl = r.files.filter(f => !f.dir);
            push({ t: 'tool', name, label: (a.path ? cleanPath(a.path) + ' · ' : '') + fl.length + ' file' + (fl.length === 1 ? '' : 's'), local });
            if (!r.files.length) return 'The folder is empty.';
            return r.files.map(f => f.dir ? `${f.path} (${f.skipped ? 'skipped — big tool folder' : 'not listed — list it to see inside'})` : f.lines != null ? `${f.path} (${f.lines} lines)` : `${f.path} (${kb(f.size)})`).join('\n') + (r.truncated ? '\n… (more files — list a sub-folder)' : '');
        }
        if (name === 'read_file') {
            const p = cleanPath(a.path);
            let text;
            try { text = await B.read(p); } catch (e) { push({ t: 'tool', name, label: p, status: 'err', local }); return 'Error: ' + e.message; }
            if (text == null) { push({ t: 'tool', name, label: p, status: 'err', local }); return `Error: there's no file called ${p}. Use list_files to see what exists.`; }
            const lines = text.split(/\r?\n/);
            const s = Math.max(1, +a.start_line || 1), e = Math.min(lines.length, +a.end_line || lines.length, s + 1999);
            push({ t: 'tool', name, label: p + (a.start_line || a.end_line ? ` (lines ${s}–${e})` : ''), path: p, local });
            let txt = lines.slice(s - 1, e).map((l, i) => `${String(s + i).padStart(4)}  ${l}`).join('\n');
            if (txt.length > 60000) txt = txt.slice(0, 60000) + '\n… (cut — read fewer lines)';
            return txt + (e < lines.length ? `\n(${lines.length - e} more lines — read with start_line=${e + 1})` : '');
        }
        if (name === 'search_files') {
            const raw = String(a.query || ''); const hits = [];
            let test;
            const rx = /^\/(.+)\/([gimsuy]*)$/.exec(raw);
            try { test = rx ? ((re) => (l) => re.test(l))(new RegExp(rx[1], rx[2].replace('g', '') || 'i')) : ((q) => (l) => l.toLowerCase().includes(q))(raw.toLowerCase()); }
            catch (e) { return 'Error: that regular expression is not valid.'; }
            if (raw) {
                const r = await B.list(a.path ? cleanPath(a.path) : '');
                const cands = r.files.filter(f => !f.dir && (f.lines != null || (TEXTY.test(f.path) && (f.size || 0) < 600000))).slice(0, 500);
                for (const f of cands) {
                    if (hits.length >= 150) break;
                    let t; try { t = await B.read(f.path); } catch (e) { continue; }
                    if (t == null) continue;
                    t.split(/\r?\n/).forEach((l, i) => { if (hits.length < 150 && test(l)) hits.push(`${f.path}:${i + 1}: ${l.trim().slice(0, 220)}`); });
                }
            }
            push({ t: 'tool', name, label: `"${raw}" · ${hits.length} found`, local });
            return hits.join('\n') || 'No matches.';
        }
        if (name === 'update_plan') {
            const steps = (Array.isArray(a.steps) ? a.steps : []).slice(0, 12).map(s => ({ text: String(s.text || '').slice(0, 160), status: ['pending', 'doing', 'done'].includes(s.status) ? s.status : 'pending' }));
            if (X.planEl && X.planIt && X.planIt.task === X.task) { X.planIt.steps = steps; paintPlan(X.planEl, steps); saveChatSoon(); }
            else push({ t: 'plan', steps, task: X.task });
            return 'Plan updated.';
        }
        if (name === 'web_search') {
            const q = String(a.query || '').trim();
            working(true, 'Searching the web');
            let d;
            try { d = await api('/api/code/agent/search', { method: 'POST', body: JSON.stringify({ task: X.task, query: q }) }); }
            catch (e) { push({ t: 'tool', name, label: q, status: 'err' }); return 'Error: ' + (e.message || 'search failed'); }
            const src = (d.sources || []).map((s, i) => `[${i + 1}] ${s.title || s.url} — ${s.url}`).join('\n');
            push({ t: 'tool', name, label: q, detail: d.text + (src ? '\n\nSources:\n' + src : '') });
            return d.text + (src ? '\n\nSources:\n' + src : '');
        }
        if (name === 'write_file' || name === 'edit_file' || name === 'multi_edit') {
            const p = cleanPath(a.path);
            if (!okPath(p)) { push({ t: 'tool', name, label: p || '(no name)', status: 'err', local }); return 'Error: use a relative file name with letters, numbers, dots, dashes and / for folders.'; }
            let old;
            try { old = await B.read(p); } catch (e) { push({ t: 'tool', name, label: p, status: 'err', local }); return 'Error: ' + e.message; }
            let next;
            if (name === 'write_file') next = String(a.content == null ? '' : a.content);
            else {
                if (old == null) { push({ t: 'tool', name, label: p, status: 'err', local }); return `Error: ${p} doesn't exist. Use write_file to create it.`; }
                const edits = name === 'multi_edit' ? (Array.isArray(a.edits) ? a.edits : []) : [a];
                if (!edits.length) { push({ t: 'tool', name, label: p, status: 'err', local }); return 'Error: no edits given.'; }
                try { next = applyEdits(old, edits, p); } catch (e) { push({ t: 'tool', name, label: p, status: 'err', local }); return 'Error: ' + e.message; }
            }
            if (next && !next.endsWith('\n')) next += old && old.includes('\r\n') ? '\r\n' : '\n';
            if (old === next) return `No change: ${p} already has that content.`;
            const dh = diffHtml(old == null ? null : old.replace(/\r\n/g, '\n'), next.replace(/\r\n/g, '\n'));
            const it = { t: 'tool', name: name === 'multi_edit' ? 'edit_file' : name, label: p, path: p, add: dh.add, del: dh.del, detail: dh.html, diff: true, local, ask: (old == null ? 'Create ' : 'Edit ') + p + (local ? ' on your PC' : '') };
            if (!(await approve(it, dh.html))) { push({ ...it, status: 'denied', detail: '' }); return 'The user did not allow this change. Ask what they would like instead, or try a different approach.'; }
            try { await B.write(p, next); } catch (e) { push({ ...it, status: 'err', detail: '' }); return 'Error: couldn\'t save it — ' + ipcMsg(e); }
            delete it.ask; push(it); paintFiles(); paintTitle();
            return `${old == null ? 'Created' : 'Updated'} ${p} (${next.split('\n').length} lines).`;
        }
        if (name === 'delete_file') {
            const p = cleanPath(a.path);
            let old; try { old = await B.read(p); } catch (e) { old = ''; }
            if (old == null) { push({ t: 'tool', name, label: p, status: 'err', local }); return `Error: ${p} doesn't exist.`; }
            const it = { t: 'tool', name, label: p, local, ask: 'Delete ' + p + (local ? ' (it goes to the Recycle Bin)' : '') };
            if (!(await approve(it, ''))) { push({ ...it, status: 'denied' }); return 'The user did not allow deleting this file.'; }
            try { await B.remove(p); } catch (e) { push({ ...it, status: 'err' }); return 'Error: ' + ipcMsg(e); }
            delete it.ask; push(it); paintFiles();
            return 'Deleted ' + p + (local ? ' (moved to the Recycle Bin).' : '.');
        }
        if (name === 'run_command') {
            if (!local) { push({ t: 'tool', name, label: '', status: 'err' }); return 'Error: run_command only works when a folder on the PC is open.'; }
            const cmd = String(a.command || '').trim();
            if (!cmd) return 'Error: no command given.';
            if (!(await approve({ name: 'run', ask: 'Run this command in ' + X.local.name + ':' }, esc(cmd)))) { push({ t: 'tool', name, label: cmd, status: 'denied', local }); return 'The user did not allow this command.'; }
            working(true, 'Running ' + cmd.slice(0, 60));
            const r = await execLocal(cmd, { cwd: a.cwd ? cleanPath(a.cwd) : '', timeout: a.timeout }, cmd);
            if (r.denied) return 'The user did not allow this command (it was cancelled in the Windows prompt). Ask what they would prefer.';
            push({ t: 'tool', name, label: cmd, status: r.ok ? '' : 'err', detail: (r.text || '(no output)') + '\n— ' + r.code, open: !r.ok, local });
            paintFiles();
            return `${r.code}\nOutput:\n${r.text || '(no output)'}`;
        }
        if (name === 'run') {
            const p = a.path ? cleanPath(a.path) : '';
            if (local) {
                if (!p) return 'Error: say which file to run (path), or use run_command.';
                let exists; try { exists = await B.read(p); } catch (e) { exists = ''; }
                if (exists == null) { push({ t: 'tool', name, label: p, status: 'err', local }); return `Error: ${p} doesn't exist.`; }
                if (/\.html?$/i.test(p)) {
                    await LFS().open(X.local.id, p);
                    push({ t: 'tool', name, label: p + ' in your browser', local });
                    return 'Opened it in the user\'s web browser. You can\'t see its console from here — ask the user what they see if needed.';
                }
                const base = await LFS().commandFor(p);
                if (!base) { push({ t: 'tool', name, label: p, status: 'err', local }); return `Error: I don't know how to run ${p}. Use run_command with the right command.`; }
                const cmd = base + (a.args ? ' ' + String(a.args) : '');
                if (!(await approve({ name, ask: 'Run ' + p + ' on your PC:' }, esc(cmd)))) { push({ t: 'tool', name, label: p, status: 'denied', local }); return 'The user did not allow running it.'; }
                working(true, 'Running ' + p);
                const r = await execLocal(cmd, {}, p);
                if (r.denied) return 'The user did not allow running it.';
                push({ t: 'tool', name, label: p + ' on your PC', status: r.ok ? '' : 'err', detail: (r.text || '(no output)') + '\n— ' + r.code, open: !r.ok, local });
                paintFiles();
                return `${r.code}\nOutput:\n${r.text || '(no output)'}`;
            }
            const F = files();
            if (p && !(p in F)) { push({ t: 'tool', name, label: p, status: 'err' }); return `Error: ${p} doesn't exist.`; }
            const kind = CA.kindFor(p || null);
            const onPc = P.env === 'computer' && IS_APP && kind !== 'web';
            const label = (p || 'the project') + (onPc ? ' on this computer' : kind === 'web' ? ' in the Preview' : '');
            if (onPc && !(await approve({ name, ask: 'Run ' + (p || 'the project') + ' on this computer' }, ''))) { push({ t: 'tool', name, label, status: 'denied' }); return 'The user did not allow running it on their computer.'; }
            working(true, 'Running ' + (p || 'the project'));
            if (kind === 'web') { panel('preview'); $('cx-pempty').hidden = true; }
            const seen = new Set((S.made || []).map(x => x.url));
            const r = await CA.runCapture(p || null, { frame: $('cx-frame'), local: onPc });
            const out = String(r.output || '').slice(-8000);
            $('cx-out').textContent = out;
            const made = (S.made || []).filter(x => !seen.has(x.url)).map(x => ({ path: x.path, size: x.size, url: x.url }));
            push({ t: 'tool', name, label, status: r.ok ? '' : 'err', detail: out, open: !r.ok, made: made.length ? made : undefined });
            paintMade();
            return (r.ok ? 'It ran.' : 'It ran with errors.') + '\nOutput:\n' + out +
                (made.length ? '\n\nFiles the program created (shown to the user with Download buttons under this step — tell them to click Download; do NOT build a separate download page): ' + made.map(x => x.path).join(', ') : '');
        }
        push({ t: 'tool', name, label: '', status: 'err' });
        return 'Error: unknown tool ' + name;
    }

    /* ───────────── the agent loop ───────────── */
    function setBusy(on) {
        X.busy = on;
        const b = $('cx-send');
        b.innerHTML = on ? I.stop : I.send; b.title = on ? 'Stop' : 'Send (Enter)'; b.classList.toggle('stop', on);
        b.setAttribute('aria-label', on ? 'Stop' : 'Send');
        if (!on) working(false);
    }
    function fileSizes() {
        const o = {};
        if (isLocal()) { (X.localList || []).forEach(f => { o[f.path] = f.dir ? (f.skipped ? 'folder, skipped' : 'folder') : kb(f.size); }); return o; }
        Object.keys(files()).forEach(p => { o[p] = files()[p].split('\n').length; }); return o;
    }
    async function send(text) {
        text = (text || '').trim();
        if (!text) return;
        if (X.busy) return;
        if (S.shared) { toast('Make your own copy to work on this project', 'error'); return; }
        $('cx-in').value = ''; grow();
        if (!X.items.length && (S.project.name === 'New task' || S.project.name === 'Untitled project' || !S.project.name)) {
            S.project.name = text.replace(/\s+/g, ' ').replace(/^(please|can you|could you|can u|make me|build me|create)\s+/i, '').slice(0, 48).replace(/^./, c => c.toUpperCase());
            const nm = $('ca-name'); if (nm) nm.value = S.project.name; paintTitle();
        }
        if (isLocal()) {
            const lastF = [...X.items].reverse().find(x => x.t === 'folder');
            if (!lastF || lastF.path !== X.local.path) push({ t: 'folder', name: X.local.name, path: X.local.path });
            try { await B.list(''); } catch (e) {}
        }
        push({ t: 'user', text });
        X.llm.push({ role: 'user', content: text });
        X.task = ''; X.allowAll = false; X.stop = false;
        await loop();
    }
    async function loop() {
        setBusy(true);
        let guard = 0;
        try {
            for (;;) {
                if (X.stop) { push({ t: 'note', text: 'Stopped.' }); break; }
                if (++guard > 60) break;
                working(true, guard === 1 ? 'Thinking' : 'Working');
                X.ctrl = new AbortController();
                let d;
                try {
                    const res = await fetch('/api/code/agent/step', {
                        method: 'POST', credentials: 'same-origin', signal: X.ctrl.signal, headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ task: X.task, messages: X.llm, files: fileSizes(), name: S.project.name, env: isLocal() ? 'computer' : P.env, model: P.model, local: isLocal() ? { name: X.local.name, path: X.local.path } : {} }),
                    });
                    d = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        const msg = d.detail || ('Request failed (' + res.status + ')');
                        if (res.status === 409) X.task = '';
                        push({ t: 'error', text: msg, retry: res.status === 502 || res.status === 409 || res.status >= 500 });
                        if (/today|plan/i.test(msg)) CA.refreshStatus();
                        break;
                    }
                } catch (e) {
                    if (X.stop) { push({ t: 'note', text: 'Stopped.' }); break; }
                    push({ t: 'error', text: 'Connection problem — check your internet.', retry: true }); break;
                }
                X.task = d.task || X.task;
                if (d.left != null && S.status) { S.status.left = d.left; paintLeft(); }
                const m = d.message || {};
                let content = String(m.content || '');
                let calls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
                // Older habit: files written as <zfile> blocks instead of tool calls.
                if (!calls.length && /<zfile\b/i.test(content)) {
                    content = content.replace(/<zfile\b([^>]*)>([\s\S]*?)(<\/zfile>|$)/gi, (_, at, body) => {
                        const nm = (/(?:name|path)="([^"]+)"/i.exec(at) || [])[1];
                        if (nm) calls.push({ id: 'z' + calls.length + Date.now(), type: 'function', function: { name: /delete="(true|1)"/i.test(at) ? 'delete_file' : 'write_file', arguments: JSON.stringify({ path: nm, content: body.replace(/^\n/, '') }) } });
                        return '';
                    }).trim();
                }
                X.llm.push({ role: 'assistant', content: String(m.content || ''), tool_calls: calls.length ? calls : undefined });
                if (!calls.length) {
                    if (content) push({ t: 'ai', text: content });
                    if (d.finish === 'length') push({ t: 'note', text: 'The answer was cut short — say "continue" to keep going.' });
                    break;
                }
                if (content) push({ t: 'ai', text: content });
                for (const c of calls) {
                    let args = {};
                    try { args = JSON.parse(c.function.arguments || '{}'); } catch (e) { args = null; }
                    let result;
                    if (X.stop) result = 'The user pressed Stop.';
                    else if (!args) { result = 'Error: the arguments were not valid JSON (the file may have been too long for one call — split it into smaller files or edits).'; push({ t: 'tool', name: c.function.name, label: '', status: 'err' }); }
                    else {
                        working(true, { read_file: 'Reading', write_file: 'Writing', edit_file: 'Editing', run: 'Running', search_files: 'Searching' }[c.function.name] || 'Working');
                        try { result = await runTool(c.function.name, args); } catch (e) { result = 'Error: ' + (e.message || e); }
                    }
                    X.llm.push({ role: 'tool', tool_call_id: c.id, content: String(result).slice(0, 24000) });
                }
                if (d.steps_left === 0) { push({ t: 'note', text: 'That task used all its steps. Send a message to keep going.' }); break; }
            }
        } finally {
            setBusy(false); X.ctrl = null; saveChatSoon(); paintFiles();
            if (S.dirty.size) CA.save(false);
        }
    }
    function stopNow() {
        X.stop = true;
        if (X.ctrl) try { X.ctrl.abort(); } catch (e) {}
        if (X.waitDeny) X.waitDeny();
        CA.stop();
        if (isLocal()) LFS().stop().catch(() => {});
    }

    /* ───────────── downloads (26.5.1) ───────────── */
    function saveBlob(blob, name) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    const MIME = { html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json', svg: 'image/svg+xml', md: 'text/markdown' };
    function downloadFile(p) {
        if (!(p in files())) { toast('That file isn\'t in the project any more', 'error'); return; }
        saveBlob(new Blob([files()[p]], { type: (MIME[CA.ext(p)] || 'text/plain') + ';charset=utf-8' }), p.split('/').pop());
    }
    const htmlFiles = () => Object.keys(files()).filter(p => /\.html?$/i.test(p)).sort((a, b) => (/(^|\/)index\.html?$/i.test(b) ? 1 : 0) - (/(^|\/)index\.html?$/i.test(a) ? 1 : 0));
    // A page with its CSS and JavaScript written into it, so the single file works anywhere.
    function downloadOne(p) {
        p = p || htmlFiles()[0];
        if (!p || !window.ZRender || !ZRender.bundleHtml) return;
        const b = ZRender.bundleHtml(p, files());
        saveBlob(new Blob([b.html], { type: 'text/html;charset=utf-8' }), p.split('/').pop());
        toast(b.used.length ? `Saved ${p.split('/').pop()} with ${b.used.map(x => x.split('/').pop()).join(', ')} built in` : 'Saved ' + p.split('/').pop());
        if (b.missing.length) toast('It links to ' + b.missing.join(', ') + ', which isn\'t in the project', 'error');
    }
    function linksOf(p) {
        if (!window.ZRender || !ZRender.bundleHtml) return null;
        const b = ZRender.bundleHtml(p, files());
        return b.used.length || b.missing.length ? b : null;
    }
    function downloadMenu(anchor) {
        const h = htmlFiles();
        const opts = [{ v: 'zip', t: 'Whole project (.zip)', d: Object.keys(files()).length + ' files, folders kept', icon: I.dl }];
        if (h.length) opts.push({ v: 'one', t: 'Website as one file (.html)', d: 'CSS and JavaScript built into ' + h[0].split('/').pop() + ' — open it anywhere', icon: I.globe });
        if (!Object.keys(files()).length) { toast('No files yet', 'error'); return; }
        openMenu(anchor, opts, (v) => (v === 'zip' ? CA.downloadZip() : downloadOne(h[0])));
    }

    function paintMade() {
        const pv = document.querySelector('#cx-panel [data-pv=output]'); if (!pv) return;
        let box = $('cx-made-list');
        if (!box) { box = document.createElement('div'); box.id = 'cx-made-list'; pv.insertBefore(box, pv.firstChild); }
        const list = S.made || [];
        box.innerHTML = list.length ? `<div class="cx-made">${list.map(f => `<div class="cx-made-r"><span>📦</span><b>${esc(f.path)}</b><a class="cx-btn pri" href="${f.url}" download="${esc(f.path.split('/').pop())}">${I.dl}Download</a></div>`).join('')}</div>` : '';
    }
    document.addEventListener('ca:made', paintMade);

    /* ───────────── side bits ───────────── */
    async function paintLocalFiles(ul) {
        let r; try { r = await LFS().list(X.local.id, '', { max: 800 }); X.localList = r.files; } catch (e) { ul.innerHTML = `<li class="cx-muted">${esc(ipcMsg(e))}</li>`; return; }
        ul.innerHTML = `<li class="cx-files-top"><span class="cx-fold-n">${I.folder}<b>${esc(X.local.name)}</b></span><button class="cx-btn" data-lf="show">Show in File Explorer</button><button class="cx-btn" data-lf="change">Change folder</button><button class="cx-btn" data-lf="close">Close</button></li>` +
            (r.files.filter(f => !f.dir).map(f => `<li data-lp="${esc(f.path)}">${I.file}<span>${esc(f.path)}</span><small>${kb(f.size)}</small><button class="cx-ib sm" data-lopen="${esc(f.path)}" title="Open with its program">${I.eye}</button></li>`).join('')
             || '<li class="cx-muted">This folder is empty — files appear here as the agent writes them.</li>') + (r.truncated ? '<li class="cx-muted">…and more files</li>' : '');
    }
    function paintFiles() {
        const ul = $('cx-files'); if (!ul || !S.project) return;
        if (isLocal()) { paintLocalFiles(ul); return; }
        const list = Object.keys(S.project.files).sort();
        const head = list.length ? `<li class="cx-files-top"><button class="cx-btn" data-all="zip">${I.dl}Download all (.zip)</button>${htmlFiles().length ? `<button class="cx-btn" data-all="one">${I.globe}Website as one file</button>` : ''}</li>` : '';
        ul.innerHTML = head + list.map(p => {
            const l = /\.html?$/i.test(p) ? linksOf(p) : null;
            const linked = l && l.used.length ? `<em>uses ${esc(l.used.map(x => x.split('/').pop()).join(', '))}</em>` : '';
            const miss = l && l.missing.length ? `<em class="bad">missing ${esc(l.missing.join(', '))}</em>` : '';
            return `<li data-p="${esc(p)}">${I.file}<span>${esc(p)}${linked}${miss}</span><small>${S.project.files[p].split('\n').length} lines</small>
                ${l && l.used.length ? `<button class="cx-ib sm" data-one="${esc(p)}" title="Download as one file (CSS & JS built in)">${I.globe}</button>` : ''}
                <button class="cx-ib sm" data-dl="${esc(p)}" title="Download ${esc(p.split('/').pop())}">${I.dl}</button></li>`;
        }).join('') || '<li class="cx-muted">No files yet — they appear here as the agent writes them.</li>';
    }
    function paintTitle() {
        if (!S.project) return;
        $('cx-title').value = S.project.name || 'New task';
        document.title = (S.project.name || 'New task') + ' · Coding AGT.';
    }
    function paintLeft() {
        const st = S.status; if (!st) return;
        $('cx-left').textContent = (st.tier === 'owner' || st.limit == null) ? '' : `${st.left} of ${st.limit} tasks left today ·`;
        const name = S.user ? (S.user.display_name || S.user.username) : 'Guest';
        const plan = { owner: 'Owner', ultimate: 'Ultimate', pro: 'Pro', free: 'Free', guest: 'Guest' }[st.tier] || st.tier;
        $('cx-me').innerHTML = `<span class="cx-av">${esc((name || '?')[0].toUpperCase())}</span><span class="cx-me-n"><b>${esc(name)}</b> · ${esc(plan)}</span><a class="cx-ib" href="/app" title="Back to Zelpophai AI">${I.home}</a>`;
        paintChips();
    }
    function grow() { const t = $('cx-in'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 260) + 'px'; }
    function mic() {
        const R = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!R) { toast('Speaking isn\'t supported in this browser', 'error'); return; }
        if (X.rec) { X.rec.stop(); return; }
        const r = new R(); X.rec = r; r.interimResults = true; r.lang = navigator.language || 'en-US';
        const base = $('cx-in').value;
        $('cx-mic').classList.add('on');
        r.onresult = (e) => { $('cx-in').value = (base ? base + ' ' : '') + [...e.results].map(x => x[0].transcript).join(''); grow(); };
        r.onend = () => { X.rec = null; $('cx-mic').classList.remove('on'); };
        r.start();
    }
    function attach(fs) {
        let n = 0;
        [...fs].slice(0, 20).forEach(f => {
            if (f.size > 400000) { toast(f.name + ' is too big (max 400 KB)', 'error'); return; }
            const rd = new FileReader();
            rd.onload = () => {
                const p = f.name.replace(/[^\w\-. ()]/g, '_');
                CA.writeFile(p, String(rd.result)); n++;
                paintFiles();
                push({ t: 'note', text: `Added ${p} to the project.` });
            };
            rd.readAsText(f);
        });
    }

    /* ───────────── wire ───────────── */
    function wire() {
        $('cx-v-chat').onclick = () => showChat(true);
        $('cx-v-code').onclick = () => showChat(false);
        $('cx-editor-b').onclick = () => showChat(false);
        $('cx-new').onclick = newTask;
        $('cx-find-b').onclick = () => { const f = $('cx-find'); f.hidden = !f.hidden; if (!f.hidden) f.focus(); else { f.value = ''; paintRecents(); } };
        $('cx-find').oninput = paintRecents;
        $('cx-side-x').onclick = () => sideOpen(false);
        $('cx-side-o').onclick = () => sideOpen(true);
        $('cx-scrim').onclick = () => sideOpen(false);
        $('cx-recents').onclick = async (e) => {
            const del = e.target.closest('[data-del]');
            if (del) {
                e.stopPropagation();
                const p = X.projects.find(x => x.id === +del.dataset.del);
                if (!confirm(`Delete "${p ? p.name : 'this task'}" and its files? This can't be undone.`)) return;
                try { await api('/api/code/projects/' + del.dataset.del, { method: 'DELETE' }); X.projects = X.projects.filter(x => x.id !== +del.dataset.del); if (S.project.id === +del.dataset.del) newTask(); else paintRecents(); } catch (err) { toast(err.message, 'error'); }
                return;
            }
            const r = e.target.closest('[data-id]'); if (r) openProject(+r.dataset.id);
        };
        $('cx-recents').onkeydown = (e) => { if (e.key === 'Enter') { const r = e.target.closest('[data-id]'); if (r) openProject(+r.dataset.id); } };
        $('cx-title').onchange = () => { S.project.name = $('cx-title').value.trim() || 'New task'; const nm = $('ca-name'); if (nm) nm.value = S.project.name; CA.save(false).then(() => { loadRecents(); }); };
        $('cx-comp').onsubmit = (e) => { e.preventDefault(); if (X.busy) stopNow(); else send($('cx-in').value); };
        $('cx-in').oninput = grow;
        $('cx-in').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!X.busy) send($('cx-in').value); } };
        $('cx-env').onclick = (e) => envMenu(e.currentTarget);
        $('cx-env-card').onclick = (e) => envMenu(e.currentTarget);
        $('cx-mode').onclick = (e) => openMenu(e.currentTarget, [
            { v: 'ask', t: MODE.ask[0], d: MODE.ask[2], icon: I.shield, on: P.mode === 'ask' },
            { v: 'auto', t: MODE.auto[0], d: MODE.auto[2], icon: I.bolt, on: P.mode === 'auto' },
        ], (v) => { P.mode = v; savePrefs(); paintChips(); });
        $('cx-model').onclick = (e) => {
            const smartOk = !S.status || S.status.smart !== false;
            openMenu(e.currentTarget, [
                { v: 'smart', t: 'Smart', d: smartOk ? 'Best for bigger projects and tricky bugs.' : 'Included with Pro and Ultimate.', on: P.model === 'smart', off: !smartOk },
                { v: 'fast', t: 'Fast', d: 'Quicker answers for small changes.', on: P.model === 'fast' },
            ], (v) => { P.model = v; savePrefs(); paintChips(); });
        };
        $('cx-mic').onclick = mic;
        $('cx-attach').onclick = () => $('cx-file').click();
        $('cx-file').onchange = (e) => { attach(e.target.files); e.target.value = ''; };
        document.querySelectorAll('.cx-sug').forEach(b => b.onclick = () => { $('cx-in').value = b.textContent.trim().replace(/^\S+\s*/, ''); grow(); $('cx-in').focus(); });
        $('cx-panel-b').onclick = () => ($('cx-panel').hidden ? panel('preview') : panel(false));
        $('cx-panel-x').onclick = () => panel(false);
        $('cx-panel').querySelector('.cx-ptabs').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) panel(b.dataset.p); };
        $('cx-folder').onclick = (e) => {
            if (e.target.closest('.cx-fx')) { closeFolder(); return; }
            if (isLocal()) { panel('files'); return; }
            pickFolder();
        };
        $('cx-files').addEventListener('click', (e) => {
            if (!isLocal()) return;
            const lf = e.target.closest('[data-lf]');
            if (lf) { e.stopImmediatePropagation(); if (lf.dataset.lf === 'show') LFS().open(X.local.id, '', 'show'); else if (lf.dataset.lf === 'change') pickFolder(X.local.path); else closeFolder(); return; }
            const lo = e.target.closest('[data-lopen]') || e.target.closest('[data-lp]');
            if (lo) { e.stopImmediatePropagation(); LFS().open(X.local.id, lo.dataset.lopen || lo.dataset.lp, lo.dataset.lopen ? '' : 'show').catch((er) => toast(ipcMsg(er), 'error')); }
        }, true);
        $('cx-files').onclick = (e) => {
            const d = e.target.closest('[data-dl]'); if (d) { downloadFile(d.dataset.dl); return; }
            const o = e.target.closest('[data-one]'); if (o) { downloadOne(o.dataset.one); return; }
            const al = e.target.closest('[data-all]'); if (al) { if (al.dataset.all === 'zip') CA.downloadZip(); else downloadOne(); return; }
            const li = e.target.closest('[data-p]'); if (li) { showChat(false); CA.openFile(li.dataset.p); }
        };
        $('cx-run').onclick = async () => {
            const k = CA.kindFor(null);
            if (k === 'web') { panel('preview'); $('cx-pempty').hidden = true; }
            const r = await CA.runCapture(null, { frame: $('cx-frame'), local: P.env === 'computer' && IS_APP });
            $('cx-out').textContent = r.output; paintMade(); if (k !== 'web') panel('output');
        };
        $('cx-share').onclick = () => { showChat(false); CA.share(); };
        $('cx-zip').onclick = (e) => downloadMenu(e.currentTarget);
        // the editor gets a way back
        const top = document.querySelector('.ca-top');
        if (top) {
            const b = document.createElement('button'); b.className = 'ca-btn cx-back'; b.id = 'cx-back-agent'; b.title = 'Back to the agent';
            b.innerHTML = I.chat + '<span>Agent</span>'; b.onclick = () => showChat(true);
            top.insertBefore(b, top.firstChild);
        }
        document.addEventListener('ca:status', paintLeft);
        document.addEventListener('ca:save', (e) => { $('cx-saved').textContent = /saving|unsaved/i.test(e.detail) ? e.detail : ''; });
        document.addEventListener('ca:project', () => { paintTitle(); paintFiles(); });
        addEventListener('keydown', (e) => {
            if (!document.body.classList.contains('cx-on')) return;
            if (e.key === 'Escape' && X.busy) stopNow();
        });
        addEventListener('resize', () => { if (innerWidth > 860) $('cx').classList.remove('side-open'); });
    }

    async function start() {
        build(); wire(); paintChips();
        let side = '1'; try { side = localStorage.getItem('cx_side') || '1'; } catch (e) {}
        if (side === '0' && innerWidth > 860) $('cx').classList.add('side-closed');
        await Promise.resolve(CA.ready);
        if (S.shared) { $('cx').remove(); return; }   // shared projects open in the editor
        const q = new URLSearchParams(location.search);
        let view = 'chat'; try { view = localStorage.getItem('cx_view') || 'chat'; } catch (e) {}
        const pid = q.get('project');
        if (pid && S.project && String(S.project.id) === String(pid)) {
            try { const p = await api('/api/code/projects/' + pid); X.items = Array.isArray(p.chat) ? p.chat : []; } catch (e) { X.items = []; }
        } else if (q.get('import')) {
            X.items = [{ t: 'note', text: 'Your files from the chat are here. Tell the agent what to do next — run it, fix it or add something.' }];
            view = 'chat';
        } else if (CA.isGuest()) {
            try { X.items = JSON.parse(localStorage.getItem('cx_guest_chat') || '[]'); } catch (e) { X.items = []; }
            if (!X.items.length) CA.loadProject({ id: null, name: 'New task', kind: 'blank', files: {} });
        } else if (!pid) {
            // a fresh start: the agent's start screen
            CA.loadProject({ id: null, name: 'New task', kind: 'blank', files: {} });
            X.items = [];
        }
        rebuildLlm(); paintThread(); paintFiles(); paintTitle(); paintLeft();
        showChat(view !== 'code' || !pid ? true : false);
        if (view === 'code' && pid) showChat(false);
        loadRecents();
        if (!X.items.length) $('cx-in').focus();
    }
    // Wait for the editor to be ready (it builds window.CA first).
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    window.CX = { send, newTask, showChat, panel, state: X };
})();
