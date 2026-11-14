/* Coding AGT. app shell: start page, panels you can hide and resize, search in files, command palette,
   editor settings, status bar and themes. The editor/agent logic lives in coding-agent.js (window.CA). */
(function () {
    'use strict';
    const CA = window.CA; if (!CA) return;
    const $ = (id) => document.getElementById(id);
    const { S, esc, toast } = CA;
    const sv = (d, w) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w || 1.9}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const IC = {
        web: sv('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
        python: sv('<path d="M9 3h5a3 3 0 0 1 3 3v3H9a3 3 0 0 0-3 3v0a3 3 0 0 0 3 3"/><path d="M15 21h-5a3 3 0 0 1-3-3v-3h8a3 3 0 0 0 3-3v0a3 3 0 0 0-3-3"/><path d="M10 6h.01M14 18h.01"/>'),
        data: sv('<path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/>'),
        game: sv('<rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 11v3M5.5 12.5h3M15.5 11.5h.01M18 13.5h.01"/>'),
        sql: sv('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.700 3.100 3 7 3s7-1.300 7-3V6M5 12v6c0 1.700 3.100 3 7 3s7-1.300 7-3v-6"/>'.replace(/\.(\d)00/g, '.$1')),
        blank: sv('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
        copy: sv('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
        trash: sv('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    };
    const KIND_ICON = { web: IC.web, python: IC.python, sql: IC.sql, blank: IC.blank };
    const LANG = { html: 'HTML', htm: 'HTML', css: 'CSS', js: 'JavaScript', mjs: 'JavaScript', ts: 'TypeScript', py: 'Python', json: 'JSON', md: 'Markdown', sql: 'SQL', txt: 'Plain text', csv: 'CSV', java: 'Java', c: 'C', cpp: 'C++', go: 'Go', rb: 'Ruby', php: 'PHP' };

    /* ───────────── preferences ───────────── */
    const DEF = { theme: 'dark', fontSize: 14, tabSize: 2, wrap: false, lineNumbers: true, autoSave: true, autoRun: false, side: 240, out: 420, ai: 360, showSide: true, showOut: true, showAi: true };
    let P = { ...DEF }; try { P = { ...DEF, ...JSON.parse(localStorage.getItem('ca_prefs') || '{}') }; } catch (e) {}
    const savePrefs = () => { try { localStorage.setItem('ca_prefs', JSON.stringify(P)); } catch (e) {} };
    function applyPrefs() {
        const t = P.theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : P.theme;
        document.documentElement.dataset.caTheme = t;
        const mc = document.querySelector('meta[name="theme-color"]'); if (mc) mc.content = t === 'light' ? '#ffffff' : '#0b0f14';
        const r = document.documentElement.style;
        r.setProperty('--fs', P.fontSize + 'px'); r.setProperty('--side', P.side + 'px'); r.setProperty('--out', P.out + 'px'); r.setProperty('--ai', P.ai + 'px');
        const app = $('ca-app');
        app.classList.toggle('no-side', !P.showSide); app.classList.toggle('no-out', !P.showOut); app.classList.toggle('no-ai', !P.showAi);
        $('ca-tog-side').setAttribute('aria-pressed', P.showSide); $('ca-tog-out').setAttribute('aria-pressed', P.showOut); $('ca-tog-ai').setAttribute('aria-pressed', P.showAi);
        $('ca-rail-ai').classList.toggle('on', P.showAi);
        if (S.cm) {
            S.cm.setOption('tabSize', P.tabSize); S.cm.setOption('indentUnit', P.tabSize); S.cm.setOption('lineWrapping', P.wrap); S.cm.setOption('lineNumbers', P.lineNumbers);
            try { S.cm.setOption('autoCloseTags', true); } catch (e) {}
            setTimeout(() => S.cm.refresh(), 0);
        }
        $('ca-st-indent').textContent = 'Spaces: ' + P.tabSize;
    }
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (P.theme === 'auto') applyPrefs(); });

    /* ───────────── status bar + breadcrumb ───────────── */
    function paintFile() {
        const p = S.active;
        $('ca-st-lang').textContent = p ? (LANG[CA.ext(p)] || CA.ext(p).toUpperCase()) : '';
        $('ca-crumb').innerHTML = p ? `${esc(S.project.name)} <span>›</span> ${p.split('/').map((x, i, a) => i === a.length - 1 ? `<b>${esc(x)}</b>` : esc(x)).join(' <span>›</span> ')}` : '';
        paintPos();
    }
    function paintPos() { if (!S.cm) return; const c = S.cm.getCursor(); const sel = S.cm.getSelection().length; $('ca-st-pos').textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}` + (sel ? ` (${sel} selected)` : ''); }
    document.addEventListener('ca:file', paintFile);
    document.addEventListener('ca:project', () => { paintFile(); document.title = (S.project.name || 'Project') + ' · Coding AGT.'; });
    document.addEventListener('ca:save', (e) => { $('ca-st-save').textContent = e.detail; });
    document.addEventListener('ca:kind', (e) => { $('ca-st-kind').textContent = { web: 'Website · runs in Preview', python: 'Python · runs in your browser', sql: 'SQL · runs in your browser', none: 'Edit and download' }[e.detail] || ''; });
    document.addEventListener('ca:status', () => { const st = S.status; if (st) $('ca-st-agent').textContent = st.tier === 'owner' ? 'Agent: unlimited' : `Agent: ${st.left} of ${st.limit} left today`; });
    // Auto-run the preview after a save (websites only), if switched on.
    document.addEventListener('ca:saved', () => { if (P.autoRun && S.project && S.project.kind === 'web') CA.run(); });

    /* ───────────── panels: show / hide / drag to resize ───────────── */
    function toggle(key) { P[key] = !P[key]; savePrefs(); applyPrefs(); }
    function resizer(id, key, dir, min, max) {
        const el = $(id); let startX = 0, startV = 0;
        const move = (e) => { const x = (e.touches ? e.touches[0].clientX : e.clientX); P[key] = Math.max(min, Math.min(max(), startV + (x - startX) * dir)); document.documentElement.style.setProperty('--' + key, P[key] + 'px'); };
        const up = () => { document.body.classList.remove('ca-dragging'); el.classList.remove('drag'); removeEventListener('mousemove', move); removeEventListener('mouseup', up); removeEventListener('touchmove', move); removeEventListener('touchend', up); savePrefs(); if (S.cm) S.cm.refresh(); };
        const down = (e) => { e.preventDefault(); startX = (e.touches ? e.touches[0].clientX : e.clientX); startV = P[key]; document.body.classList.add('ca-dragging'); el.classList.add('drag'); addEventListener('mousemove', move); addEventListener('mouseup', up); addEventListener('touchmove', move, { passive: false }); addEventListener('touchend', up); };
        el.addEventListener('mousedown', down); el.addEventListener('touchstart', down, { passive: false });
        el.addEventListener('dblclick', () => { P[key] = DEF[key]; savePrefs(); applyPrefs(); });
        el.addEventListener('keydown', (e) => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); P[key] = Math.max(min, Math.min(max(), P[key] + (e.key === 'ArrowRight' ? 16 : -16) * dir)); savePrefs(); applyPrefs(); });
    }

    /* ───────────── side panel: files / search ───────────── */
    function sideView(v) {
        if (!P.showSide) { P.showSide = true; savePrefs(); applyPrefs(); }
        $('ca-side-files').hidden = v !== 'files'; $('ca-side-search').hidden = v !== 'search';
        $('ca-rail-files').classList.toggle('on', v === 'files'); $('ca-rail-search').classList.toggle('on', v === 'search');
        if (innerWidth <= 760) { $('ca-main').dataset.view = 'files'; document.querySelectorAll('#ca-mob button').forEach((b) => b.classList.toggle('on', b.dataset.view === 'files')); }
        if (v === 'search') setTimeout(() => { $('ca-find-q').focus(); $('ca-find-q').select(); }, 30);
    }
    function findAll() {
        const q = $('ca-find-q').value, list = $('ca-find-list'), n = $('ca-find-n');
        if (q.length < 2) { list.innerHTML = ''; n.textContent = q ? 'Type at least 2 letters' : ''; return; }
        const low = q.toLowerCase(); let total = 0, html = '';
        Object.keys(S.project.files).sort().forEach((path) => {
            const hits = [];
            S.project.files[path].split('\n').forEach((line, i) => { const at = line.toLowerCase().indexOf(low); if (at >= 0 && hits.length < 50) hits.push([i, line, at]); });
            if (!hits.length) return; total += hits.length;
            html += `<div class="ca-find-file">${esc(path)}</div>` + hits.map(([i, line, at]) => { const from = Math.max(0, at - 24); return `<button class="ca-find-hit" data-p="${esc(path)}" data-l="${i}" data-c="${at}"><i>${i + 1}</i><span>${esc(line.slice(from, at))}<mark>${esc(line.slice(at, at + q.length))}</mark>${esc(line.slice(at + q.length, at + q.length + 80))}</span></button>`; }).join('');
        });
        list.innerHTML = html; n.textContent = total ? `${total} match${total === 1 ? '' : 'es'}` : 'Nothing found';
    }
    function jump(path, line, ch, len) { CA.openFile(path); setTimeout(() => { S.cm.focus(); S.cm.setSelection({ line, ch }, { line, ch: ch + (len || 0) }); S.cm.scrollIntoView({ line, ch }, 120); }, 30); }

    /* ───────────── command palette ───────────── */
    let palItems = [], palIdx = 0;
    const COMMANDS = () => [
        ['Run', 'Ctrl Enter', () => CA.run()], ['Save', 'Ctrl S', () => CA.save(true)], ['New file', '', () => CA.addFile()], ['New project', '', () => $('ca-new-btn').click()],
        ['Open the start page', '', showHome], ['Search in all files', 'Ctrl Shift F', () => sideView('search')], ['Show or hide files', 'Ctrl B', () => toggle('showSide')],
        ['Show or hide preview and console', 'Ctrl J', () => toggle('showOut')], ['Show or hide the agent', 'Ctrl I', () => toggle('showAi')],
        ['Share this project', '', () => CA.share()], ['Download as .zip', '', () => CA.downloadZip()], ['Editor settings', 'Ctrl ,', settings], ['Keyboard shortcuts', '', shortcuts],
        ['Switch to light theme', '', () => { P.theme = 'light'; savePrefs(); applyPrefs(); }], ['Switch to dark theme', '', () => { P.theme = 'dark'; savePrefs(); applyPrefs(); }],
        ['Clear the console', '', () => CA.clearConsole()], ['Start a new agent conversation', '', () => CA.resetChat()], ['Back to Zelpophai AI', '', () => { location.href = '/app'; }],
    ];
    function openPalette() { $('ca-pal').hidden = false; $('ca-pal-q').value = ''; drawPalette(); setTimeout(() => $('ca-pal-q').focus(), 20); }
    function closePalette() { $('ca-pal').hidden = true; }
    function drawPalette() {
        const q = $('ca-pal-q').value.trim().toLowerCase();
        const files = Object.keys(S.project.files).sort().map((p) => ({ kind: 'File', label: p, run: () => CA.openFile(p) }));
        const cmds = COMMANDS().map(([label, key, run]) => ({ kind: 'Command', label, key, run }));
        const score = (s) => { const l = s.toLowerCase(); if (!q) return 1; if (l.includes(q)) return 100 - l.indexOf(q); let i = 0; for (const ch of l) { if (ch === q[i]) i++; } return i === q.length ? 10 : 0; };
        palItems = [...files, ...cmds].map((x) => ({ ...x, s: score(x.label) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 40); palIdx = 0;
        $('ca-pal-list').innerHTML = palItems.length ? palItems.map((x, i) => `<button class="ca-pal-item${i === 0 ? ' on' : ''}" data-i="${i}" role="option"><i>${x.kind}</i><span>${esc(x.label)}</span>${x.key ? `<kbd>${x.key}</kbd>` : ''}</button>`).join('') : '<div class="ca-pal-empty">Nothing matches.</div>';
    }
    function palMove(d) { if (!palItems.length) return; palIdx = (palIdx + d + palItems.length) % palItems.length; $('ca-pal-list').querySelectorAll('.ca-pal-item').forEach((b, i) => { b.classList.toggle('on', i === palIdx); if (i === palIdx) b.scrollIntoView({ block: 'nearest' }); }); }
    function palRun(i) { const it = palItems[i]; if (!it) return; closePalette(); it.run(); }

    /* ───────────── settings + shortcuts ───────────── */
    function settings() {
        const seg = (k, opts) => `<div class="ca-seg" data-k="${k}">${opts.map(([v, l]) => `<button class="${String(P[k]) === String(v) ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
        const sw = (k) => `<button class="ca-switch${P[k] ? ' on' : ''}" data-sw="${k}" role="switch" aria-checked="${!!P[k]}"></button>`;
        const row = (t, d, c) => `<div class="ca-set-row"><div><b>${t}</b><small>${d}</small></div>${c}</div>`;
        CA.modal('Editor settings', `<div class="ca-set">
            ${row('Theme', 'How Coding AGT. looks.', seg('theme', [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Match device']]))}
            ${row('Text size', 'Size of the code in the editor.', seg('fontSize', [[12, 'Small'], [14, 'Normal'], [16, 'Large'], [18, 'Huge']]))}
            ${row('Indent', 'Spaces added when you press Tab.', seg('tabSize', [[2, '2 spaces'], [4, '4 spaces']]))}
            ${row('Wrap long lines', 'Keep long lines on screen instead of scrolling sideways.', sw('wrap'))}
            ${row('Line numbers', 'Show numbers beside each line.', sw('lineNumbers'))}
            ${row('Run when I save', 'For websites: refresh the preview every time your changes are saved.', sw('autoRun'))}
            ${row('Layout', 'Put the panels back to their starting sizes.', '<button class="ca-btn" id="ca-set-reset">Reset layout</button>')}</div>`);
        const box = $('ca-modal-b');
        box.onclick = (e) => {
            const b = e.target.closest('[data-v]'); if (b) { const k = b.parentNode.dataset.k; P[k] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v; b.parentNode.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); savePrefs(); applyPrefs(); return; }
            const s = e.target.closest('[data-sw]'); if (s) { P[s.dataset.sw] = !P[s.dataset.sw]; s.classList.toggle('on', P[s.dataset.sw]); s.setAttribute('aria-checked', P[s.dataset.sw]); savePrefs(); applyPrefs(); return; }
            if (e.target.closest('#ca-set-reset')) { ['side', 'out', 'ai', 'showSide', 'showOut', 'showAi'].forEach((k) => { P[k] = DEF[k]; }); savePrefs(); applyPrefs(); toast('Layout reset'); }
        };
    }
    function shortcuts() {
        const K = [['Run', 'Ctrl Enter'], ['Save', 'Ctrl S'], ['Search files and commands', 'Ctrl K'], ['Search in all files', 'Ctrl Shift F'], ['Show or hide files', 'Ctrl B'], ['Show or hide preview', 'Ctrl J'], ['Show or hide the agent', 'Ctrl I'],
            ['Comment a line', 'Ctrl /'], ['Editor settings', 'Ctrl ,'], ['Close a window', 'Esc']];
        CA.modal('Keyboard shortcuts', `<div class="ca-keys">${K.map(([a, b]) => `<span>${a}</span><span>${b.split(' ').map((x) => `<kbd>${x}</kbd>`).join(' ')}</span>`).join('')}</div><p style="margin:14px 0 0;font-size:12px;color:var(--dim)">On a Mac, use ⌘ instead of Ctrl.</p>`);
    }

    /* ───────────── start page ───────────── */
    const IDEAS = ['A personal portfolio website', 'A to-do list that saves my tasks', 'A snake game', 'A tip calculator', 'A quiz about capital cities', 'A Python script that sorts a list of marks'];
    let projects = [];
    function when(t) { if (!t) return ''; const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : t + 'Z'), s = (Date.now() - d) / 1000; return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : s < 86400 * 14 ? Math.round(s / 86400) + ' days ago' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
    async function showHome() {
        const H = $('ca-home'); H.hidden = false; $('ca-rail-home').classList.add('on'); $('ca-app').classList.add('at-home'); document.title = 'Coding AGT. — write, run and share code with AI';
        const guest = CA.isGuest(), name = S.user && !guest ? (S.user.display_name || S.user.username) : '';
        H.innerHTML = `<div class="ca-home-in"><h1>${name ? `Hi ${esc(name)}, w` : 'W'}hat do you want to <em>build</em>?</h1>
            <p class="ca-home-sub">Describe it in your own words. The agent writes the code, you run it right here, and you can share it with a link.</p>
            <form class="ca-home-ask" id="ca-h-form"><textarea id="ca-h-q" placeholder="e.g. A website for my bakery with a menu and opening hours" aria-label="What do you want to build?"></textarea>
                <div class="ca-home-ask-b"><select id="ca-h-kind" aria-label="Kind of project"><option value="web">Website</option><option value="python">Python</option><option value="sql">SQL</option></select><span class="ca-flex"></span><button class="ca-run" type="submit">Build it</button></div></form>
            <div class="ca-home-ideas" id="ca-h-ideas">${IDEAS.map((x) => `<button type="button">${x}</button>`).join('')}</div>
            <h2><span>Start from a template</span></h2>
            <div class="ca-home-grid" id="ca-h-tpl">${Object.entries(CA.TEMPLATES).map(([k, t]) => `<button class="ca-card" data-t="${k}"><span class="ca-card-ic">${IC[k] || IC.blank}</span><b>${esc(t.title)}</b><span>${esc(t.desc)}</span></button>`).join('')}</div>
            <h2><span>Your projects</span>${guest ? '' : '<input class="ca-field" id="ca-h-find" placeholder="Find a project…" autocomplete="off">'}</h2>
            <div id="ca-h-projects"><div class="ca-home-empty">Loading…</div></div>
            <div class="ca-home-foot"><button id="ca-h-keys">Keyboard shortcuts</button><button id="ca-h-set">Settings</button><a href="/download">Get the desktop app</a><a href="/app">Back to Zelpophai AI</a></div></div>`;
        $('ca-h-ideas').onclick = (e) => { const b = e.target.closest('button'); if (b) { $('ca-h-q').value = b.textContent; $('ca-h-q').focus(); } };
        $('ca-h-q').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('ca-h-form').requestSubmit(); } };
        $('ca-h-form').onsubmit = async (e) => {
            e.preventDefault(); const q = $('ca-h-q').value.trim(); if (!q) { $('ca-h-q').focus(); return; }
            const kind = $('ca-h-kind').value, t = CA.clone(CA.TEMPLATES[kind === 'python' ? 'python' : kind === 'sql' ? 'sql' : 'blank']);
            t.kind = kind; t.name = q.replace(/^(a|an|the)\s+/i, '').slice(0, 48).replace(/^./, (c) => c.toUpperCase());
            if (kind === 'web') t.files = { 'index.html': '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>' + t.name.replace(/</g, '') + '</title>\n</head>\n<body>\n\n</body>\n</html>\n' };
            await startProject(t); CA.askAgent(q);
        };
        $('ca-h-tpl').onclick = async (e) => { const b = e.target.closest('[data-t]'); if (b) await startProject(CA.clone(CA.TEMPLATES[b.dataset.t])); };
        $('ca-h-keys').onclick = shortcuts; $('ca-h-set').onclick = settings;
        if ($('ca-h-find')) $('ca-h-find').oninput = drawProjects;
        if (guest) { $('ca-h-projects').innerHTML = '<div class="ca-home-empty">You\'re using Coding AGT. as a guest, so projects are only kept in this browser. <a href="/" style="color:var(--acc)">Create a free account</a> to save and share them.</div>'; return; }
        try { projects = (await api('/api/code/projects')).projects || []; } catch (err) { projects = []; $('ca-h-projects').innerHTML = `<div class="ca-home-empty">${esc(err.message || 'Couldn\'t load your projects.')}</div>`; return; }
        drawProjects();
    }
    function drawProjects() {
        const box = $('ca-h-projects'); if (!box) return;
        const f = ($('ca-h-find') ? $('ca-h-find').value : '').trim().toLowerCase();
        const list = projects.filter((p) => !f || (p.name || '').toLowerCase().includes(f));
        box.innerHTML = list.length ? `<div class="ca-home-grid">${list.map((p) => `<div class="ca-card" data-id="${p.id}" tabindex="0" role="button"><span class="ca-card-ic">${KIND_ICON[p.kind] || IC.blank}</span><b title="${esc(p.name)}">${esc(p.name)}</b><span>Edited ${when(p.updated_at)}</span><span class="ca-kind">${esc({ web: 'Website', python: 'Python', sql: 'SQL' }[p.kind] || 'Files')}</span>
              <span class="ca-card-x"><button data-a="copy" title="Make a copy" aria-label="Make a copy">${IC.copy}</button><button data-a="del" class="bad" title="Delete" aria-label="Delete">${IC.trash}</button></span></div>`).join('')}</div>`
            : `<div class="ca-home-empty">${projects.length ? 'No project matches that name.' : 'No projects yet. Describe something above, or pick a template.'}</div>`;
        box.onclick = async (e) => {
            const card = e.target.closest('[data-id]'); if (!card) return; const id = card.dataset.id, act = e.target.closest('[data-a]');
            if (act && act.dataset.a === 'del') { if (!(await window.ZPop.confirm('Delete this project?', 'The project and all its files will be removed for good.', { danger: true, okText: 'Delete', icon: 'trash' }))) return; try { await api('/api/code/projects/' + id, { method: 'DELETE' }); projects = projects.filter((p) => String(p.id) !== String(id)); drawProjects(); toast('Project deleted'); } catch (err) { toast(err.message, 'error'); } return; }
            if (act && act.dataset.a === 'copy') { try { const src = await api('/api/code/projects/' + id); const p = await api('/api/code/projects', { method: 'POST', body: JSON.stringify({ name: src.name + ' (copy)', kind: src.kind, files: src.files }) }); toast('Copy made'); projects = (await api('/api/code/projects')).projects || []; drawProjects(); void p; } catch (err) { toast(err.message, 'error'); } return; }
            openProject(id);
        };
        box.onkeydown = (e) => { if (e.key === 'Enter' && e.target.matches('[data-id]')) openProject(e.target.dataset.id); };
    }
    function hideHome() { $('ca-home').hidden = true; $('ca-rail-home').classList.remove('on'); $('ca-app').classList.remove('at-home'); if (S.project) document.title = (S.project.name || 'Project') + ' · Coding AGT.'; setTimeout(() => S.cm && S.cm.refresh(), 0); }
    function setUrl(id) { try { history.replaceState(null, '', id ? '/code?project=' + id : '/code'); } catch (e) {} }
    async function openProject(id) {
        try { if (S.dirty.size) await CA.save(false); CA.loadProject(await api('/api/code/projects/' + id)); CA.resetChat(); setUrl(id); hideHome(); } catch (err) { toast(err.message || 'Couldn\'t open that project', 'error'); }
    }
    async function startProject(t) {
        if (S.dirty.size) await CA.save(false);
        CA.loadProject(t); CA.resetChat(); hideHome();
        if (!CA.isGuest()) { await CA.save(false); if (S.project.id) setUrl(S.project.id); }
        if (!P.showAi && innerWidth > 760) { P.showAi = true; savePrefs(); applyPrefs(); }
    }

    /* ───────────── wire everything ───────────── */
    function wire() {
        applyPrefs();
        S.cm.on('cursorActivity', paintPos);
        $('ca-tog-side').onclick = () => toggle('showSide'); $('ca-tog-out').onclick = () => toggle('showOut'); $('ca-tog-ai').onclick = () => toggle('showAi');
        resizer('ca-rz-side', 'side', 1, 170, () => 460); resizer('ca-rz-out', 'out', -1, 240, () => Math.max(260, innerWidth - 520)); resizer('ca-rz-ai', 'ai', -1, 260, () => 620);
        $('ca-home-btn').onclick = showHome; $('ca-rail-home').onclick = () => ($('ca-home').hidden ? showHome() : hideHome());
        $('ca-rail-files').onclick = () => { hideHome(); if (P.showSide && !$('ca-side-files').hidden && innerWidth > 760) toggle('showSide'); else sideView('files'); };
        $('ca-rail-search').onclick = () => { hideHome(); sideView('search'); };
        $('ca-rail-ai').onclick = () => { hideHome(); toggle('showAi'); if (P.showAi) setTimeout(() => $('ca-input').focus(), 40); };
        $('ca-rail-settings').onclick = settings; $('ca-rail-keys').onclick = shortcuts;
        $('ca-palette-btn').onclick = openPalette;
        $('ca-chat-new').onclick = () => { CA.resetChat(); toast('New conversation'); };
        $('ca-find-q').oninput = findAll;
        $('ca-find-list').onclick = (e) => { const b = e.target.closest('.ca-find-hit'); if (b) jump(b.dataset.p, +b.dataset.l, +b.dataset.c, $('ca-find-q').value.length); };
        $('ca-devices').onclick = (e) => { const b = e.target.closest('[data-w]'); if (!b) return; $('ca-devices').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); const w = $('ca-preview-wrap'); if (b.dataset.w) { w.style.setProperty('--pw', b.dataset.w + 'px'); w.dataset.device = '1'; } else { w.style.removeProperty('--pw'); delete w.dataset.device; } };
        $('ca-pal').onmousedown = (e) => { if (e.target === $('ca-pal')) closePalette(); };
        $('ca-pal-q').oninput = drawPalette;
        $('ca-pal-list').onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) palRun(+b.dataset.i); };
        $('ca-pal-q').onkeydown = (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); palMove(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); palMove(-1); } else if (e.key === 'Enter') { e.preventDefault(); palRun(palIdx); } else if (e.key === 'Escape') { e.preventDefault(); closePalette(); } };
        // The old Projects / New buttons now lead to the start page, where projects and templates live.
        $('ca-projects-btn').onclick = showHome;
        addEventListener('keydown', (e) => {
            const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
            if (e.key === 'Escape') { if (!$('ca-pal').hidden) return closePalette(); if (!$('ca-home').hidden && $('ca-modal').hidden && S.project) return hideHome(); return; }
            if (!mod) return;
            if (k === 'k' || (k === 'p' && !e.shiftKey)) { e.preventDefault(); openPalette(); }
            else if (k === 'f' && e.shiftKey) { e.preventDefault(); hideHome(); sideView('search'); }
            else if (k === 'b') { e.preventDefault(); toggle('showSide'); }
            else if (k === 'j') { e.preventDefault(); toggle('showOut'); }
            else if (k === 'i') { e.preventDefault(); toggle('showAi'); }
            else if (e.key === ',') { e.preventDefault(); settings(); }
        }, true);
        // Opening straight onto a project (a link with ?project=, or a shared one) skips the start page.
        const direct = new URLSearchParams(location.search).get('project') || S.shared;
        if (!direct) showHome(); else paintFile();
        document.dispatchEvent(new CustomEvent('ca:status'));
        if (S.project) document.dispatchEvent(new CustomEvent('ca:kind', { detail: S.project.kind === 'blank' ? 'none' : S.project.kind }));
        $('ca-st-save').textContent = $('ca-save').textContent;
    }
    Promise.resolve(CA.ready).then(() => { if (S.cm) wire(); });
})();
