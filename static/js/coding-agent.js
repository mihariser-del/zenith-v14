/* Zelpophai Coding AGT. — project workspace + AI coding agent.
   Everything runs in the browser: websites in a sandboxed frame, Python in
   Pyodide (WebAssembly, in a Web Worker), SQL in sql.js. Projects save to the
   user's account. The AI agent proposes whole-file changes that the user
   reviews (with a diff) and applies. */
(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, k) => (typeof showToast === 'function' ? showToast(m, k || 'success') : console.log(m));
    const isDesktop = !!(window.zelpophaiDesktop || /ZelpophaiDesktop|ZelpophaiAndroid/i.test(navigator.userAgent));

    const EXT_COLOR = { html: '#e34c26', css: '#2563eb', js: '#d4a017', mjs: '#d4a017', ts: '#3178c6', py: '#3776ab', json: '#64748b', md: '#475569', sql: '#0ea5e9', csv: '#16a34a', txt: '#64748b', java: '#b07219', c: '#555', cpp: '#f34b7d', go: '#00add8', rs: '#dea584', svg: '#ff9900' };
    const MODE = { html: 'htmlmixed', htm: 'htmlmixed', css: 'css', js: 'javascript', mjs: 'javascript', json: { name: 'javascript', json: true }, ts: { name: 'javascript', typescript: true }, py: 'python', sql: 'text/x-sql', md: 'markdown', java: 'text/x-java', c: 'text/x-csrc', cpp: 'text/x-c++src', cs: 'text/x-csharp', go: 'text/x-go', svg: 'xml', xml: 'xml' };
    const ext = p => ((/\.([a-z0-9]+)$/i.exec(p || '') || [])[1] || 'txt').toLowerCase();

    const TEMPLATES = {
        web: { name: 'My website', kind: 'web', emoji: '🌐', title: 'Website', desc: 'HTML, CSS and JavaScript with live preview', files: {
            'index.html': '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>My website</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <main class="card">\n    <h1>Hello, world 👋</h1>\n    <p>Edit <code>index.html</code>, <code>style.css</code> and <code>script.js</code>, then press <b>Run</b>.</p>\n    <button id="btn">Click me</button>\n    <p id="out"></p>\n  </main>\n  <script src="script.js"></script>\n</body>\n</html>\n',
            'style.css': 'body {\n  margin: 0;\n  min-height: 100vh;\n  display: grid;\n  place-items: center;\n  font-family: system-ui, sans-serif;\n  background: linear-gradient(135deg, #2563eb, #7c3aed);\n}\n\n.card {\n  background: #fff;\n  padding: 32px 40px;\n  border-radius: 18px;\n  box-shadow: 0 20px 60px rgba(0, 0, 0, .25);\n  text-align: center;\n}\n\nbutton {\n  padding: 10px 20px;\n  border: none;\n  border-radius: 10px;\n  background: #2563eb;\n  color: #fff;\n  font-weight: 700;\n  cursor: pointer;\n}\n',
            'script.js': "let clicks = 0;\n\ndocument.getElementById('btn').addEventListener('click', () => {\n  clicks++;\n  document.getElementById('out').textContent = `You clicked ${clicks} time${clicks === 1 ? '' : 's'}!`;\n  console.log('clicks:', clicks);\n});\n" } },
        python: { name: 'Python script', kind: 'python', emoji: '🐍', title: 'Python', desc: 'Runs in your browser (Pyodide)', files: {
            'main.py': 'from helpers import greet\n\nnames = ["Ada", "Linus", "Grace"]\nfor n in names:\n    print(greet(n))\n\nsquares = [x * x for x in range(1, 11)]\nprint("Squares:", squares)\nprint("Total:", sum(squares))\n',
            'helpers.py': 'def greet(name: str) -> str:\n    """Return a friendly greeting."""\n    return f"Hello, {name}!"\n' } },
        data: { name: 'Data analysis', kind: 'python', emoji: '📊', title: 'Data analysis', desc: 'pandas + matplotlib chart', files: {
            'main.py': 'import pandas as pd\nimport matplotlib.pyplot as plt\n\ndf = pd.read_csv("sales.csv")\nprint(df)\nprint()\nprint("Total sales:", df["sales"].sum())\nprint("Best month:", df.loc[df["sales"].idxmax(), "month"])\n\ndf.plot(x="month", y="sales", kind="bar", color="#2563eb", legend=False)\nplt.title("Monthly sales")\nplt.tight_layout()\nplt.show()\n',
            'sales.csv': 'month,sales\nJan,120\nFeb,135\nMar,160\nApr,150\nMay,190\nJun,220\n' } },
        game: { name: 'Canvas game', kind: 'web', emoji: '🎮', title: 'Game', desc: 'A tiny canvas game to build on', files: {
            'index.html': '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Catch the star</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <canvas id="game" width="480" height="360"></canvas>\n  <p>Move with ← → arrows. Score: <b id="score">0</b></p>\n  <script src="game.js"></script>\n</body>\n</html>\n',
            'style.css': 'body { margin: 0; min-height: 100vh; display: grid; place-content: center; text-align: center; background: #0b1230; color: #e6ebfa; font-family: system-ui, sans-serif; }\ncanvas { background: #111a44; border-radius: 14px; box-shadow: 0 10px 40px rgba(0,0,0,.4); }\n',
            'game.js': "const c = document.getElementById('game');\nconst g = c.getContext('2d');\nconst player = { x: 220, w: 50 };\nlet star = { x: Math.random() * 460, y: 0 };\nlet score = 0;\nconst keys = {};\naddEventListener('keydown', e => keys[e.key] = true);\naddEventListener('keyup', e => keys[e.key] = false);\n\nfunction loop() {\n  if (keys.ArrowLeft) player.x -= 6;\n  if (keys.ArrowRight) player.x += 6;\n  player.x = Math.max(0, Math.min(c.width - player.w, player.x));\n  star.y += 3 + score * 0.2;\n  if (star.y > 330 && star.x > player.x - 10 && star.x < player.x + player.w + 10) {\n    score++; document.getElementById('score').textContent = score;\n    star = { x: Math.random() * 460, y: 0 };\n  } else if (star.y > c.height) {\n    star = { x: Math.random() * 460, y: 0 };\n  }\n  g.clearRect(0, 0, c.width, c.height);\n  g.fillStyle = '#facc15'; g.font = '24px serif'; g.fillText('⭐', star.x, star.y);\n  g.fillStyle = '#60a5fa'; g.fillRect(player.x, 340, player.w, 10);\n  requestAnimationFrame(loop);\n}\nloop();\n" } },
        sql: { name: 'SQL playground', kind: 'sql', emoji: '🗄️', title: 'SQL', desc: 'SQLite in your browser', files: {
            'main.sql': "CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT, grade INTEGER);\nINSERT INTO students (name, grade) VALUES ('Amara', 88), ('Tobi', 92), ('Zainab', 79), ('Kofi', 95);\n\nSELECT name, grade FROM students ORDER BY grade DESC;\n\nSELECT AVG(grade) AS average FROM students;\n" } },
        blank: { name: 'Blank project', kind: 'blank', emoji: '📄', title: 'Blank', desc: 'Start from nothing', files: { 'README.md': '# My project\n\nAsk the AI agent to build something!\n' } },
    };

    const S = {
        project: null,          // {id, name, kind, files}
        open: [],               // open tab paths
        active: null,
        dirty: new Set(),       // unsaved files (since last save)
        cm: null,
        docs: {},               // path -> CodeMirror.Doc
        history: [],            // agent chat history (role/content)
        console: [],            // [{type,text}]
        status: null,           // agent status
        user: null,
        shared: null,           // share id when viewing a shared project
        running: false,
        worker: null,
        saveTimer: null,
        lastError: '',
    };

    /* ───────────────────────────────── boot ── */
    async function boot() {
        const m = /^\/code\/([0-9a-f]{6,64})/i.exec(location.pathname);
        S.shared = m ? m[1] : null;
        try { S.user = (await api('/api/auth/me')).user; } catch (e) { S.user = null; }
        if (!S.user && !S.shared) { location.href = '/'; return; }

        setupEditor();
        wire();
        if (S.user) refreshStatus();

        if (S.shared) {
            try {
                const p = await api('/api/code/shared/' + S.shared);
                loadProject({ ...p, id: null }, true);
                $('ca-shared').hidden = false;
                S.cm.setOption('readOnly', true);
                $('ca-name').readOnly = true;
            } catch (e) { toast(e.message || 'Shared project not found', 'error'); loadProject(clone(TEMPLATES.web)); }
            return;
        }
        // last opened project, else the newest, else a fresh website
        let pid = null;
        try { pid = localStorage.getItem('ca_last_project'); } catch (e) {}
        const q = new URLSearchParams(location.search);
        if (q.get('project')) pid = q.get('project');
        if (isGuest()) {
            let draft = null;
            try { draft = JSON.parse(localStorage.getItem('ca_guest_draft') || 'null'); } catch (e) {}
            loadProject(draft || clone(TEMPLATES.web));
            return;
        }
        try {
            if (!pid) {
                const { projects } = await api('/api/code/projects');
                if (projects.length) pid = projects[0].id;
            }
            if (pid) { loadProject(await api('/api/code/projects/' + pid)); return; }
        } catch (e) { /* fall through */ }
        loadProject(clone(TEMPLATES.web));
    }

    const isGuest = () => !S.user || String(S.user.username || '').startsWith('guest_');
    const clone = t => ({ id: null, name: t.name, kind: t.kind, files: JSON.parse(JSON.stringify(t.files)) });

    async function refreshStatus() {
        try {
            S.status = await api('/api/code/agent/status');
            showLeft();
            const showBanner = S.status.free && !isDesktop;
            let hidden = false;
            try { hidden = sessionStorage.getItem('ca_banner_x') === '1'; } catch (e) {}
            $('ca-banner').hidden = !showBanner || hidden;
            if (S.status.guest) {
                $('ca-banner-text').textContent = `Guests get ${S.status.limit} AI coding requests a day and projects aren't saved. Code only runs inside your browser (websites, Python, SQL).`;
                $('ca-banner-upgrade').textContent = 'Log in';
                $('ca-banner-upgrade').href = '/';
            } else {
                $('ca-banner-text').textContent = `Free accounts get ${S.status.limit} AI coding requests a day, and code only runs inside your browser (websites, Python, SQL).`;
            }
        } catch (e) {}
    }
    function showLeft() {
        if (!S.status) return;
        $('ca-left').textContent = `${S.status.left} of ${S.status.limit} left today`;
    }

    /* ─────────────────────────────── editor ── */
    function setupEditor() {
        S.cm = CodeMirror($('ca-cm'), {
            lineNumbers: true, tabSize: 2, indentUnit: 2, indentWithTabs: false,
            autoCloseBrackets: true, matchBrackets: true, styleActiveLine: true, lineWrapping: false,
            extraKeys: {
                'Ctrl-S': () => save(true), 'Cmd-S': () => save(true),
                'Ctrl-Enter': () => run(), 'Cmd-Enter': () => run(),
                'Ctrl-/': 'toggleComment', 'Cmd-/': 'toggleComment',
                Tab: cm => cm.somethingSelected() ? cm.indentSelection('add') : cm.replaceSelection(' '.repeat(cm.getOption('indentUnit'))),
            },
        });
    }

    function docFor(path) {
        if (!S.docs[path]) {
            const mode = MODE[ext(path)] || 'text/plain';
            const d = CodeMirror.Doc(S.project.files[path] || '', mode);
            d.on('change', () => {
                if (S.shared) return;
                S.project.files[path] = d.getValue();
                S.dirty.add(path);
                renderTree(); renderTabs();
                scheduleSave();
            });
            S.docs[path] = d;
        }
        return S.docs[path];
    }

    function loadProject(p, readOnly) {
        S.project = { id: p.id || null, name: p.name || 'Untitled project', kind: p.kind || 'web', files: p.files || {} };
        S.docs = {}; S.dirty = new Set(); S.open = [];
        $('ca-name').value = S.project.name;
        const paths = Object.keys(S.project.files);
        const first = ['index.html', 'main.py', 'main.sql', 'README.md'].find(f => paths.includes(f)) || paths[0];
        if (first) openFile(first);
        else { S.active = null; S.cm.swapDoc(CodeMirror.Doc('')); }
        renderTree(); renderTabs(); runtimeNote();
        setSave(S.project.id ? 'Saved' : (isGuest() ? 'Not saved (guest)' : ''));
        if (S.project.id) try { localStorage.setItem('ca_last_project', String(S.project.id)); } catch (e) {}
        if (!readOnly) $('ca-preview-empty').hidden = false;
        if (S.project.kind === 'python' || S.project.kind === 'sql') showOut('console');
    }

    function openFile(path) {
        if (!(path in S.project.files)) return;
        if (!S.open.includes(path)) S.open.push(path);
        S.active = path;
        S.cm.swapDoc(docFor(path));
        renderTree(); renderTabs();
        setTimeout(() => S.cm.refresh(), 0);
        mobileView('code');
    }

    function closeTab(path) {
        S.open = S.open.filter(p => p !== path);
        if (S.active === path) {
            const next = S.open[S.open.length - 1];
            if (next) openFile(next); else { S.active = null; S.cm.swapDoc(CodeMirror.Doc('')); renderTree(); renderTabs(); }
        } else renderTabs();
    }

    function renderTree() {
        const ul = $('ca-tree');
        const paths = Object.keys(S.project.files).sort((a, b) => a.localeCompare(b));
        ul.innerHTML = paths.map(p => {
            const e = ext(p);
            return `<li class="${p === S.active ? 'on' : ''} ${S.dirty.has(p) ? 'dirty' : ''}" data-p="${esc(p)}" role="option" aria-selected="${p === S.active}">
                <span class="ext" style="background:${EXT_COLOR[e] || '#475569'}">${esc(e.slice(0, 4).toUpperCase())}</span>
                <span class="nm">${esc(p)}</span><span class="dot"></span>
                ${S.shared ? '' : `<span class="act"><button data-a="ren" title="Rename" aria-label="Rename ${esc(p)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button><button data-a="del" title="Delete" aria-label="Delete ${esc(p)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button></span>`}
            </li>`;
        }).join('') || '<li style="color:#5d688c;cursor:default">No files yet</li>';
    }

    function renderTabs() {
        $('ca-tabs').innerHTML = S.open.map(p => `<button class="ca-tab ${p === S.active ? 'on' : ''} ${S.dirty.has(p) ? 'dirty' : ''}" data-p="${esc(p)}" role="tab" aria-selected="${p === S.active}">${esc(p.split('/').pop())}<span class="x" data-x="1" aria-label="Close"></span></button>`).join('');
    }

    function runtimeNote() {
        const k = runKind();
        $('ca-runtime-note').innerHTML = {
            web: '🌐 <b>Website</b> — runs in the Preview panel.',
            python: '🐍 <b>Python</b> — runs in your browser. Charts and output show in the Console.',
            sql: '🗄️ <b>SQL</b> — runs on SQLite in your browser.',
            none: (window.zelpophaiDesktop ? '💻 Runs on <b>this computer</b> (Python, Node, Java, C/C++, Go, Ruby, PHP — if installed).' : '📦 This file type can be written here and downloaded. Run it in the Zelpophai Windows app or on your computer.'),
        }[k];
        $('ca-run-label').textContent = k === 'python' ? 'Run Python' : k === 'sql' ? 'Run SQL' : 'Run';
    }

    /* ─────────────────────────── save / load ── */
    function setSave(t) { $('ca-save').textContent = t || ''; }
    function scheduleSave() {
        clearTimeout(S.saveTimer);
        setSave('Unsaved changes');
        S.saveTimer = setTimeout(() => save(false), 1500);
    }
    async function save(manual) {
        clearTimeout(S.saveTimer);
        if (S.shared) return;
        S.project.name = $('ca-name').value.trim() || 'Untitled project';
        if (isGuest()) {
            try { localStorage.setItem('ca_guest_draft', JSON.stringify(S.project)); } catch (e) {}
            S.dirty.clear(); renderTree(); renderTabs();
            setSave('Saved on this device');
            if (manual) toast('Saved in this browser — log in to keep projects in your account');
            return;
        }
        setSave('Saving…');
        try {
            const body = JSON.stringify({ name: S.project.name, kind: S.project.kind, files: S.project.files });
            if (S.project.id) await api('/api/code/projects/' + S.project.id, { method: 'PUT', body });
            else {
                const p = await api('/api/code/projects', { method: 'POST', body });
                S.project.id = p.id;
                try { localStorage.setItem('ca_last_project', String(p.id)); } catch (e) {}
            }
            S.dirty.clear(); renderTree(); renderTabs();
            setSave('Saved');
            if (manual) toast('Saved');
        } catch (e) { setSave('Not saved'); if (manual) toast(e.message || 'Save failed', 'error'); }
    }

    /* ─────────────────────────────── files ── */
    function validName(n) { return /^[\w\-. ()]+(\/[\w\-. ()]+)*$/.test(n) && !n.includes('..') && n.length <= 120; }
    function addFile() {
        modal('New file', `<label>File name<input class="ca-field" id="ca-nf" placeholder="e.g. about.html, utils.py, data/notes.txt" autocomplete="off"></label><div class="ca-row"><button class="ca-btn" data-close>Cancel</button><button class="ca-btn primary" id="ca-nf-ok">Create</button></div>`);
        const inp = $('ca-nf'); inp.focus();
        const ok = () => {
            const n = inp.value.trim().replace(/^\/+/, '');
            if (!validName(n)) { toast('Use letters, numbers, dots, dashes and / for folders', 'error'); return; }
            if (n in S.project.files) { toast('That file already exists', 'error'); return; }
            S.project.files[n] = '';
            closeModal(); openFile(n); S.dirty.add(n); scheduleSave(); runtimeNote();
        };
        $('ca-nf-ok').onclick = ok;
        inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
    }
    function renameFile(p) {
        modal('Rename file', `<input class="ca-field" id="ca-rn" value="${esc(p)}"><div class="ca-row"><button class="ca-btn" data-close>Cancel</button><button class="ca-btn primary" id="ca-rn-ok">Rename</button></div>`);
        const inp = $('ca-rn'); inp.focus(); inp.select();
        const ok = () => {
            const n = inp.value.trim();
            if (n === p) { closeModal(); return; }
            if (!validName(n) || n in S.project.files) { toast('Pick another name', 'error'); return; }
            S.project.files[n] = S.project.files[p]; delete S.project.files[p];
            delete S.docs[p];
            S.open = S.open.map(x => x === p ? n : x);
            if (S.active === p) S.active = n;
            closeModal(); if (S.active === n) S.cm.swapDoc(docFor(n));
            renderTree(); renderTabs(); scheduleSave(); runtimeNote();
        };
        $('ca-rn-ok').onclick = ok;
        inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
    }
    function deleteFile(p) {
        modal('Delete file?', `<p>Delete <b>${esc(p)}</b>? This can't be undone.</p><div class="ca-row"><button class="ca-btn" data-close>Cancel</button><button class="ca-btn primary" id="ca-del-ok" style="background:linear-gradient(135deg,#dc2626,#ef4444)">Delete</button></div>`);
        $('ca-del-ok').onclick = () => {
            delete S.project.files[p]; delete S.docs[p];
            closeModal(); closeTab(p); renderTree(); scheduleSave(); runtimeNote();
        };
    }

    /* ─────────────────────────────── modal ── */
    function modal(title, html) {
        $('ca-modal-t').textContent = title;
        $('ca-modal-b').innerHTML = html;
        $('ca-modal').hidden = false;
    }
    function closeModal() { $('ca-modal').hidden = true; $('ca-modal-b').innerHTML = ''; }

    async function showProjects() {
        if (isGuest()) { toast('Log in to save and open projects', 'error'); return; }
        modal('Your projects', '<div class="ca-typing">Loading…</div>');
        try {
            const { projects } = await api('/api/code/projects');
            $('ca-modal-b').innerHTML = projects.length ? projects.map(p => `<div class="ca-proj" data-id="${p.id}"><span class="n">${esc(p.name)}</span><span class="d">${p.updated_at ? new Date(p.updated_at + (/[zZ]|[+-]\d\d:?\d\d$/.test(p.updated_at) ? '' : 'Z')).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span><button class="ca-icon" data-del="${p.id}" title="Delete project" aria-label="Delete ${esc(p.name)}">🗑</button></div>`).join('') : '<p>No saved projects yet.</p>';
            $('ca-modal-b').onclick = async e => {
                const del = e.target.closest('[data-del]');
                if (del) {
                    e.stopPropagation();
                    if (!confirm('Delete this project for good?')) return;
                    try { await api('/api/code/projects/' + del.dataset.del, { method: 'DELETE' }); del.closest('.ca-proj').remove(); toast('Project deleted'); } catch (err) { toast(err.message, 'error'); }
                    return;
                }
                const row = e.target.closest('.ca-proj');
                if (!row) return;
                if (S.dirty.size) await save(false);
                try { loadProject(await api('/api/code/projects/' + row.dataset.id)); closeModal(); } catch (err) { toast(err.message, 'error'); }
            };
        } catch (e) { $('ca-modal-b').innerHTML = `<p>${esc(e.message)}</p>`; }
    }

    function showNew() {
        modal('New project', '<div class="ca-tpl">' + Object.entries(TEMPLATES).map(([k, t]) => `<button data-t="${k}"><span class="em">${t.emoji}</span><b>${t.title}</b><span>${t.desc}</span></button>`).join('') + '</div>');
        $('ca-modal-b').onclick = async e => {
            const b = e.target.closest('[data-t]'); if (!b) return;
            if (S.dirty.size) await save(false);
            loadProject(clone(TEMPLATES[b.dataset.t]));
            S.history = []; $('ca-chat').querySelectorAll('.ca-msg').forEach(n => n.remove()); $('ca-hello').hidden = false;
            closeModal();
            if (!isGuest()) save(false);
        };
    }

    async function share() {
        if (isGuest()) { toast('Log in to share projects', 'error'); return; }
        if (!S.project.id || S.dirty.size) await save(false);
        if (!S.project.id) return;
        try {
            const r = await api(`/api/code/projects/${S.project.id}/share`, { method: 'POST', body: '{}' });
            const url = location.origin + r.url;
            modal('Share project', `<p>Anyone with this link can view (not edit) your project and make their own copy:</p><input class="ca-field" id="ca-sh" value="${esc(url)}" readonly><div class="ca-row"><button class="ca-btn" id="ca-sh-off">Stop sharing</button><button class="ca-btn primary" id="ca-sh-copy">Copy link</button></div>`);
            $('ca-sh').select();
            $('ca-sh-copy').onclick = () => { navigator.clipboard.writeText(url).then(() => toast('Link copied')); };
            $('ca-sh-off').onclick = async () => { await api(`/api/code/projects/${S.project.id}/share`, { method: 'POST', body: JSON.stringify({ off: true }) }); closeModal(); toast('Sharing turned off'); };
        } catch (e) { toast(e.message, 'error'); }
    }

    async function downloadZip() {
        try {
            if (!window.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
            const zip = new JSZip();
            Object.entries(S.project.files).forEach(([p, c]) => zip.file(p, c));
            const blob = await zip.generateAsync({ type: 'blob' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = (S.project.name || 'project').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.zip';
            a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        } catch (e) { toast('Could not make the zip', 'error'); }
    }

    function loadScript(src) {
        return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    }

    /* ─────────────────────────────── console ── */
    function showOut(which) {
        document.querySelectorAll('.ca-out-tabs [data-out]').forEach(b => b.classList.toggle('on', b.dataset.out === which));
        $('ca-preview-wrap').hidden = which !== 'preview';
        $('ca-console').hidden = which !== 'console';
    }
    function log(type, text, html) {
        S.console.push({ type, text: String(text) });
        if (S.console.length > 800) S.console.shift();
        const div = document.createElement('div');
        div.className = 'ca-line ' + type;
        if (html) div.innerHTML = html; else div.textContent = text;
        const box = $('ca-console');
        box.appendChild(div);
        while (box.childNodes.length > 800) box.removeChild(box.firstChild);
        box.scrollTop = box.scrollHeight;
        if (type === 'err') {
            S.lastError = String(text);
            const n = S.console.filter(l => l.type === 'err').length;
            $('ca-console-count').textContent = n;
            $('ca-fix').hidden = false;
        }
    }
    function clearConsole() {
        S.console = []; $('ca-console').innerHTML = ''; $('ca-console-count').textContent = ''; $('ca-fix').hidden = true; S.lastError = '';
    }
    function consoleText() { return S.console.slice(-80).map(l => (l.type === 'err' ? 'ERROR: ' : '') + l.text).join('\n'); }

    /* ───────────────────────────────── run ── */
    function runKind() {
        const f = S.project.files, a = S.active || '';
        const e = ext(a);
        if (e === 'py') return 'python';
        if (e === 'sql') return 'sql';
        if (['html', 'htm', 'css', 'js'].includes(e)) return 'web';
        if (Object.keys(f).some(p => /\.html?$/i.test(p))) return 'web';
        if ('main.py' in f || Object.keys(f).some(p => p.endsWith('.py'))) return 'python';
        if (Object.keys(f).some(p => p.endsWith('.sql'))) return 'sql';
        return 'none';
    }

    async function run() {
        if (S.running) { stop(); return; }
        clearConsole();
        const k = runKind();
        if (k === 'web') return runWeb();
        if (k === 'python') return runPython();
        if (k === 'sql') return runSql();
        if (window.zelpophaiDesktop && window.zelpophaiDesktop.run) return runLocal();
        showOut('console');
        log('info', 'This kind of file can\'t run in the browser. Get the Zelpophai app for Windows to run it on your own computer, or download the project (.zip).');
    }

    // Desktop app: run the project on the user's own computer (asks first).
    let offOutput = null;
    async function runLocal() {
        const d = window.zelpophaiDesktop;
        const entry = S.active || Object.keys(S.project.files)[0];
        if (!entry) return;
        showOut('console'); mobileView('output');
        setRunning(true);
        if (offOutput) offOutput();
        offOutput = d.onOutput(c => log(c.type === 'err' ? 'err' : c.type === 'info' ? 'info' : '', c.text.replace(/\n$/, '')));
        log('info', `💻 Running ${entry} on this computer…`);
        try {
            const r = await d.run({ lang: ext(entry), entry, files: S.project.files });
            if (r && r.cancelled) log('warn', 'Cancelled.');
            else if (r && r.error) log('err', r.error);
            else log(r && r.ok ? 'ok' : 'warn', r && r.ok ? '■ Finished' : `■ Exited with code ${r && r.code}`);
        } catch (e) { log('err', e.message || String(e)); }
        setRunning(false);
    }

    function buildPage(entry) {
        const files = S.project.files;
        const htmlPath = entry && /\.html?$/i.test(entry) ? entry : (files['index.html'] != null ? 'index.html' : Object.keys(files).find(p => /\.html?$/i.test(p)));
        let html = htmlPath ? files[htmlPath] : '<!DOCTYPE html><html><body></body></html>';
        const base = htmlPath && htmlPath.includes('/') ? htmlPath.replace(/[^/]+$/, '') : '';
        const resolve = href => {
            const clean = href.replace(/^\.\//, '').split(/[?#]/)[0];
            if (files[base + clean] != null) return base + clean;
            if (files[clean] != null) return clean;
            return null;
        };
        html = html.replace(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi, (m, href) => {
            if (!/stylesheet/i.test(m)) return m;
            const p = resolve(href); return p ? `<style data-file="${esc(p)}">\n${files[p]}\n</style>` : m;
        });
        html = html.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi, (m, a, src, b) => {
            const p = resolve(src); if (!p) return m;
            const type = /type=["']module["']/i.test(a + b) ? ' type="module"' : '';
            return `<script${type} data-file="${esc(p)}">\n${files[p].replace(/<\/script/gi, '<\\/script')}\n<\/script>`;
        });
        if (!htmlPath && files['script.js'] != null) html = html.replace('</body>', `<script>${files['script.js']}<\/script></body>`);
        const hook = `<script>(function(){var t='${RUN_TOKEN}';function s(k,a){try{parent.postMessage({__ca:t,k:k,a:[].slice.call(a).map(function(x){try{return typeof x==='string'?x:(x instanceof Error?x.stack||x.message:JSON.stringify(x,null,1))}catch(e){return String(x)}})},'*')}catch(e){}}['log','info','warn','error'].forEach(function(k){var o=console[k];console[k]=function(){s(k,arguments);o.apply(console,arguments)}});addEventListener('error',function(e){s('error',[e.message+(e.lineno?' (line '+e.lineno+')':'')])});addEventListener('unhandledrejection',function(e){s('error',['Unhandled promise: '+(e.reason&&e.reason.message||e.reason)])});})();<\/script>`;
        html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + hook) : hook + html;
        return html;
    }
    const RUN_TOKEN = Math.random().toString(36).slice(2);
    addEventListener('message', e => {
        const d = e.data;
        if (!d || d.__ca !== RUN_TOKEN) return;
        const type = d.k === 'error' ? 'err' : d.k === 'warn' ? 'warn' : d.k === 'info' ? 'info' : '';
        log(type, (d.a || []).join(' '));
    });

    function runWeb() {
        const html = buildPage(S.active);
        $('ca-preview-empty').hidden = true;
        $('ca-preview').srcdoc = html;
        showOut('preview');
        mobileView('output');
        log('ok', '▶ Page reloaded ' + new Date().toLocaleTimeString());
    }

    function setRunning(on) {
        S.running = on;
        const b = $('ca-run-btn');
        b.classList.toggle('stop', on);
        $('ca-run-label').textContent = on ? 'Stop' : (runKind() === 'python' ? 'Run Python' : runKind() === 'sql' ? 'Run SQL' : 'Run');
    }
    function stop() {
        if (window.zelpophaiDesktop && window.zelpophaiDesktop.stop) window.zelpophaiDesktop.stop();
        if (S.worker) { S.worker.terminate(); S.worker = null; S.pyReady = null; log('warn', '■ Stopped.'); }
        setRunning(false);
    }

    const PY_WORKER = `
let py = null;
async function init() {
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');
  py = await loadPyodide({ stdout: s => postMessage({ t: 'out', s }), stderr: s => postMessage({ t: 'warn', s }) });
  postMessage({ t: 'ready' });
}
const ready = init().catch(e => postMessage({ t: 'fatal', s: String(e) }));
onmessage = async (ev) => {
  await ready;
  const { files, entry } = ev.data;
  try {
    for (const [p, c] of Object.entries(files)) {
      const dir = p.includes('/') ? p.replace(/\\/[^/]+$/, '') : '';
      if (dir) py.FS.mkdirTree('/home/pyodide/' + dir);
      py.FS.writeFile('/home/pyodide/' + p, c);
    }
    py.runPython("import os, sys; os.chdir('/home/pyodide'); sys.path.insert(0, '/home/pyodide')\\nfor m in list(sys.modules):\\n    f = getattr(sys.modules[m], '__file__', '') or ''\\n    if f.startswith('/home/pyodide/'): del sys.modules[m]");
    const code = files[entry] || '';
    postMessage({ t: 'info', s: 'Loading packages…' });
    await py.loadPackagesFromImports(Object.values(files).filter((_, i) => Object.keys(files)[i].endsWith('.py')).join('\\n'), { messageCallback: () => {} });
    py.runPython("import warnings; warnings.filterwarnings('ignore', category=DeprecationWarning); warnings.filterwarnings('ignore', category=FutureWarning)");
    if (/matplotlib/.test(code)) py.runPython("import matplotlib; matplotlib.use('AGG'); import matplotlib.pyplot as _plt; _plt.show = lambda *a, **k: None");
    await py.runPythonAsync(code, { filename: entry });
    if (/matplotlib/.test(code)) {
      const imgs = py.runPython("import io, base64\\nimport matplotlib.pyplot as plt\\n_o = []\\nfor _n in plt.get_fignums():\\n    _b = io.BytesIO(); plt.figure(_n).savefig(_b, format='png', dpi=110, bbox_inches='tight'); _o.append(base64.b64encode(_b.getvalue()).decode())\\nplt.close('all')\\n_o").toJs();
      for (const b of imgs) postMessage({ t: 'img', s: b });
    }
    postMessage({ t: 'done' });
  } catch (e) {
    postMessage({ t: 'err', s: String(e.message || e).replace(/^PythonError: /, '') });
    postMessage({ t: 'done', failed: true });
  }
};`;

    function runPython() {
        const entry = ext(S.active || '') === 'py' ? S.active : ('main.py' in S.project.files ? 'main.py' : Object.keys(S.project.files).find(p => p.endsWith('.py')));
        if (!entry) { log('err', 'No Python file to run.'); return; }
        showOut('console'); mobileView('output');
        setRunning(true);
        const t0 = performance.now();
        if (!S.worker) {
            log('info', '🐍 Starting Python (first run downloads ~10 MB, then it\'s instant)…');
            S.worker = new Worker(URL.createObjectURL(new Blob([PY_WORKER], { type: 'text/javascript' })));
            S.worker.onmessage = e => {
                const m = e.data;
                if (m.t === 'out') log('', m.s);
                else if (m.t === 'err') log('err', m.s);
                else if (m.t === 'warn') log('warn', m.s);
                else if (m.t === 'info') log('info', m.s);
                else if (m.t === 'img') log('', '', `<img alt="Chart from your code" src="data:image/png;base64,${m.s}">`);
                else if (m.t === 'fatal') { log('err', 'Python could not start: ' + m.s); stop(); }
                else if (m.t === 'done') { log(m.failed ? 'warn' : 'ok', `■ Finished in ${((performance.now() - S.runStart) / 1000).toFixed(2)}s`); setRunning(false); }
            };
        } else log('info', `▶ Running ${entry}`);
        S.runStart = t0;
        S.worker.postMessage({ files: S.project.files, entry });
    }

    let SQL = null;
    async function runSql() {
        const entry = ext(S.active || '') === 'sql' ? S.active : Object.keys(S.project.files).find(p => p.endsWith('.sql'));
        showOut('console'); mobileView('output');
        try {
            if (!SQL) {
                log('info', '🗄️ Starting SQLite…');
                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js');
                SQL = await initSqlJs({ locateFile: f => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/' + f });
            }
            const db = new SQL.Database();
            const res = db.exec(S.project.files[entry] || '');
            if (!res.length) log('ok', 'Done — no rows returned.');
            res.forEach(r => {
                const head = r.columns.map(c => `<th>${esc(c)}</th>`).join('');
                const rows = r.values.slice(0, 500).map(v => '<tr>' + v.map(x => `<td>${esc(x == null ? 'NULL' : x)}</td>`).join('') + '</tr>').join('');
                log('', r.columns.join(' | '), `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`);
            });
            db.close();
            log('ok', '■ Finished');
        } catch (e) { log('err', e.message || String(e)); }
    }

    /* ─────────────────────────────── AI agent ── */
    const FILE_RE = /<zfile\b([^>]*)>([\s\S]*?)(<\/zfile>|$)/gi;
    function attrs(s) { const o = {}; let m; const re = /(\w+)\s*=\s*"([^"]*)"/g; while ((m = re.exec(s || ''))) o[m[1].toLowerCase()] = m[2]; return o; }

    function lineDiff(a, b) {
        const A = a.split('\n'), B = b.split('\n');
        if (A.length * B.length > 4_000_000) return null;
        const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
        for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
        const out = []; let i = 0, j = 0;
        while (i < n && j < m) {
            if (A[i] === B[j]) { out.push(['c', A[i]]); i++; j++; }
            else if (L[i + 1][j] >= L[i][j + 1]) out.push(['d', A[i++]]);
            else out.push(['a', B[j++]]);
        }
        while (i < n) out.push(['d', A[i++]]);
        while (j < m) out.push(['a', B[j++]]);
        return out;
    }
    function diffStats(oldS, newS) {
        const d = lineDiff(oldS, newS);
        if (!d) return { add: newS.split('\n').length, del: oldS.split('\n').length };
        return { add: d.filter(x => x[0] === 'a').length, del: d.filter(x => x[0] === 'd').length, d };
    }

    function changeCard(ch, streaming) {
        const div = document.createElement('div');
        div.className = 'ca-change' + (streaming ? ' writing' : '');
        const e = ext(ch.path);
        const isNew = !(ch.path in S.project.files);
        let stats = '';
        if (!streaming) {
            if (ch.del) stats = 'delete file';
            else if (isNew) stats = `new file · <span class="add">+${ch.content.split('\n').length}</span>`;
            else { const st = diffStats(S.project.files[ch.path], ch.content); stats = `<span class="add">+${st.add}</span> <span class="del">−${st.del}</span>`; }
        } else stats = isNew ? 'new file' : 'editing';
        div.innerHTML = `<span class="ext" style="background:${EXT_COLOR[e] || '#475569'}">${esc(e.slice(0, 4).toUpperCase())}</span>
            <div class="info"><div class="p">${esc(ch.path)}</div><div class="s">${stats}</div></div>
            ${streaming || S.shared ? '' : `<button data-a="view">View</button><button data-a="apply" class="apply">Apply</button>`}`;
        if (!streaming) {
            div.querySelector('[data-a="view"]').onclick = () => viewChange(ch);
            div.querySelector('[data-a="apply"]').onclick = () => applyChange(ch, div);
        }
        return div;
    }

    function viewChange(ch) {
        if (ch.del) { modal('Delete ' + ch.path, `<p>The agent wants to delete <b>${esc(ch.path)}</b>.</p>`); return; }
        const old = S.project.files[ch.path];
        let body;
        if (old == null) body = ch.content.split('\n').map(l => `<div class="a">+ ${esc(l)}</div>`).join('');
        else {
            const st = diffStats(old, ch.content);
            if (!st.d) body = ch.content.split('\n').map(l => `<div>${esc(l)}</div>`).join('');
            else {
                // show changes with 3 lines of context
                const keep = st.d.map((x, i) => x[0] !== 'c' || st.d.slice(Math.max(0, i - 3), i + 4).some(y => y[0] !== 'c'));
                body = ''; let gap = false;
                st.d.forEach((x, i) => {
                    if (!keep[i]) { if (!gap) { body += '<div class="gap">⋯</div>'; gap = true; } return; }
                    gap = false;
                    body += `<div class="${x[0]}">${x[0] === 'a' ? '+ ' : x[0] === 'd' ? '− ' : '  '}${esc(x[1])}</div>`;
                });
            }
        }
        modal((old == null ? 'New: ' : 'Changes: ') + ch.path, `<div class="ca-diff">${body}</div><div class="ca-row" style="margin-top:12px"><button class="ca-btn" data-close>Close</button><button class="ca-btn primary" id="ca-view-apply">Apply this change</button></div>`);
        $('ca-view-apply').onclick = () => { closeModal(); const card = ch._card; applyChange(ch, card); };
    }

    function applyChange(ch, card) {
        if (S.shared || (card && card.classList.contains('done'))) return;
        if (ch.del) {
            delete S.project.files[ch.path]; delete S.docs[ch.path]; closeTab(ch.path);
        } else {
            const existed = ch.path in S.project.files;
            S.project.files[ch.path] = ch.content;
            if (S.docs[ch.path]) {
                const d = S.docs[ch.path];
                if (d.getValue() !== ch.content) d.setValue(ch.content); // keeps undo history (Ctrl+Z)
            }
            if (!existed || S.active == null) openFile(ch.path);
        }
        S.dirty.add(ch.path);
        if (card) card.classList.add('done');
        renderTree(); renderTabs(); runtimeNote(); scheduleSave();
    }

    function parseReply(text, streaming) {
        const changes = [];
        let html = String(text || '').replace(/```[\w-]*\s*\n(\s*<zfile\b[\s\S]*?<\/zfile>)\s*\n```/gi, '$1');
        html = html.replace(FILE_RE, (_, a, body, close) => {
            const at = attrs(a);
            const path = (at.name || at.path || '').trim().replace(/^\/+/, '');
            if (!path) return '';
            let content = body.replace(/^\n/, '').replace(/\n$/, '');
            const fence = /^```[\w-]*\n([\s\S]*)\n```$/.exec(content.trim());
            if (fence) content = fence[1];
            changes.push({ path, content: content + (content.endsWith('\n') ? '' : '\n'), del: /^(true|1|yes)$/i.test(at.delete || ''), closed: !!close });
            return `\n\n<div class="ca-slot" data-i="${changes.length - 1}"></div>\n\n`;
        });
        return { html, changes };
    }

    function renderAi(el, text, streaming) {
        const { html, changes } = parseReply(text, streaming);
        if (window.ZRender) ZRender.render(el, html, { streaming, inner: true });
        else el.textContent = text;
        el.querySelectorAll('.ca-slot').forEach(slot => {
            const ch = changes[+slot.dataset.i];
            const card = changeCard(ch, streaming && !ch.closed);
            ch._card = card;
            slot.replaceWith(card);
        });
        const ready = changes.filter(c => c.closed && !S.shared);
        if (!streaming && ready.length > 1) {
            const all = document.createElement('button');
            all.className = 'ca-btn primary ca-apply-all';
            all.textContent = `Apply all ${ready.length} changes`;
            all.onclick = () => { ready.forEach(c => applyChange(c, c._card)); all.remove(); toast('Changes applied'); };
            el.appendChild(all);
        }
        return changes;
    }

    let agentBusy = false;
    async function askAgent(text, extra) {
        text = (text || '').trim();
        if (!text || agentBusy || S.shared) return;
        agentBusy = true; $('ca-send').disabled = true;
        $('ca-hello').hidden = true;
        const chat = $('ca-chat');
        const u = document.createElement('div'); u.className = 'ca-msg user'; u.textContent = text; chat.appendChild(u);
        const a = document.createElement('div'); a.className = 'ca-msg ai'; a.innerHTML = '<span class="ca-typing">Thinking…</span>'; chat.appendChild(a);
        chat.scrollTop = chat.scrollHeight;
        mobileView('ai');
        let full = '', last = 0;
        const sel = S.cm.getSelection();
        try {
            const res = await fetch('/api/code/agent', {
                method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, files: S.project.files, active: S.active || '', history: S.history.slice(-8), console: (extra && extra.console) || '', selection: sel.length < 6000 ? sel : '' }),
            });
            if (!res.ok) {
                let d = ''; try { d = (await res.json()).detail; } catch (e) {}
                throw new Error(d || 'Request failed (' + res.status + ')');
            }
            const reader = res.body.getReader(), dec = new TextDecoder();
            let buf = '';
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const lines = buf.split('\n'); buf = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;
                    let o; try { o = JSON.parse(data); } catch (e) { continue; }
                    if (o.left != null && S.status) { S.status.left = o.left; showLeft(); }
                    if (o.error) throw new Error(o.error);
                    if (o.token) {
                        full += o.token;
                        if (performance.now() - last > 80) { last = performance.now(); renderAi(a, full, true); chat.scrollTop = chat.scrollHeight; }
                    }
                }
            }
            renderAi(a, full, false);
            S.history.push({ role: 'user', content: text }, { role: 'assistant', content: full.slice(0, 12000) });
        } catch (e) {
            a.className = 'ca-msg err';
            a.textContent = e.message || 'Something went wrong';
            if (/today|limit|reset/i.test(e.message || '')) refreshStatus();
        } finally {
            agentBusy = false; $('ca-send').disabled = false;
            chat.scrollTop = chat.scrollHeight;
        }
    }

    /* ─────────────────────────────── layout ── */
    function mobileView(v) {
        if (innerWidth > 760) return;
        $('ca-main').dataset.view = v;
        document.querySelectorAll('#ca-mob button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
        if (v === 'code') setTimeout(() => S.cm.refresh(), 0);
    }

    function wire() {
        $('ca-tree').onclick = e => {
            const li = e.target.closest('li[data-p]'); if (!li) return;
            const p = li.dataset.p, act = e.target.closest('[data-a]');
            if (act && act.dataset.a === 'ren') renameFile(p);
            else if (act && act.dataset.a === 'del') deleteFile(p);
            else openFile(p);
        };
        $('ca-tabs').onclick = e => {
            const t = e.target.closest('.ca-tab'); if (!t) return;
            if (e.target.closest('[data-x]')) closeTab(t.dataset.p); else openFile(t.dataset.p);
        };
        $('ca-tabs').onauxclick = e => { const t = e.target.closest('.ca-tab'); if (t && e.button === 1) closeTab(t.dataset.p); };
        $('ca-add-file').onclick = () => { if (!S.shared) addFile(); };
        $('ca-run-btn').onclick = run;
        $('ca-new-btn').onclick = showNew;
        $('ca-projects-btn').onclick = showProjects;
        $('ca-share-btn').onclick = share;
        $('ca-zip-btn').onclick = downloadZip;
        $('ca-name').onchange = () => scheduleSave();
        $('ca-clear').onclick = clearConsole;
        $('ca-pop').onclick = () => {
            const w = window.open('', '_blank');
            if (w) { w.document.open(); w.document.write(buildPage(S.active)); w.document.close(); }
        };
        document.querySelectorAll('.ca-out-tabs [data-out]').forEach(b => b.onclick = () => showOut(b.dataset.out));
        $('ca-modal').onclick = e => { if (e.target === $('ca-modal') || e.target.closest('[data-close]')) closeModal(); };
        addEventListener('keydown', e => {
            if (e.key === 'Escape' && !$('ca-modal').hidden) closeModal();
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(true); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.target.closest('.CodeMirror')) { e.preventDefault(); run(); }
        });
        $('ca-banner-x').onclick = () => { $('ca-banner').hidden = true; try { sessionStorage.setItem('ca_banner_x', '1'); } catch (e) {} };
        const input = $('ca-input');
        $('ca-ask').onsubmit = e => { e.preventDefault(); const t = input.value; input.value = ''; input.style.height = ''; askAgent(t); };
        input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('ca-ask').requestSubmit(); } };
        input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight) + 'px'; };
        document.querySelector('.ca-sugg').onclick = e => { const b = e.target.closest('button'); if (b) askAgent(b.textContent); };
        $('ca-fix-btn').onclick = () => askAgent('My code has an error. Please find the cause and fix it.', { console: consoleText() });
        document.querySelectorAll('#ca-mob button').forEach(b => b.onclick = () => mobileView(b.dataset.view));
        $('ca-copy-shared').onclick = async () => {
            if (isGuest()) { location.href = '/'; return; }
            try {
                const p = await api('/api/code/projects', { method: 'POST', body: JSON.stringify({ name: S.project.name + ' (copy)', kind: S.project.kind, files: S.project.files }) });
                location.href = '/app/coding-agent?project=' + p.id;
            } catch (e) { toast(e.message, 'error'); }
        };
        addEventListener('beforeunload', e => { if (S.dirty.size && !S.shared) { save(false); } });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
