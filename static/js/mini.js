// Zelpophai Mini panel. Runs inside the Windows app (window.zelpophaiMini);
// in a normal browser it only explains how to get it.
(function () {
    'use strict';
    const M = window.zelpophaiMini || null;
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
    const IC = {
        copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
        paste: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg>',
        open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
        send: $('send').innerHTML,
        stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    };

    let mode = 'ask';
    let shot = null;          // {image, width, height, area}
    let clipText = '';
    let useClip = false;
    let history = [];         // ask mode conversation
    let busy = false;
    let abortCtl = null;
    let lastLink = '';
    let run = null;           // Do mode: { stopped, notes, ... }
    let lastShown = 0;
    const ANDROID = !!(M && M.platform === 'android');
    const KEEP_MS = 30 * 60 * 1000;   // a conversation carries on if Mini is reopened within 30 minutes
    window.zpBusy = () => busy || !!run || !!rec;

    let toastT;
    function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2000); }

    function block(icon, title, text, buttons) {
        $('bIcon').textContent = icon; $('bTitle').textContent = title; $('bText').textContent = text;
        $('bBtns').innerHTML = '';
        (buttons || []).forEach(b => { const el = document.createElement(b.href ? 'a' : 'button'); el.className = 'btn' + (b.pri ? ' pri' : ''); el.textContent = b.label; if (b.href) { el.href = b.href; el.target = '_blank'; } else el.onclick = b.onclick; $('bBtns').appendChild(el); });
        $('blocker').hidden = false;
    }

    /* ─────────── screenshot + clipboard context ─────────── */
    function setShot(s) {
        shot = s && s.image ? s : null;
        $('shotBox').hidden = !shot || mode === 'do';
        $('addShot').hidden = !!shot || mode === 'do';
        if (shot) {
            $('shotImg').src = shot.image;
            $('shotLabel').textContent = shot.area ? 'Selected area' : 'Your screen';
            $('shotSub').textContent = shot.area ? 'Mini will only look at this part' : 'Mini can see this · ' + shot.width + '×' + shot.height;
        }
    }
    async function refreshClip() {
        if (!M) return;
        try { clipText = (await M.clipboard()) || ''; } catch (e) { clipText = ''; }
        const has = clipText.trim().length > 0;
        $('clip').hidden = !has;
        if (!has) { useClip = false; }
        $('clip').setAttribute('aria-pressed', useClip ? 'true' : 'false');
        const one = clipText.trim().replace(/\s+/g, ' ');
        $('clipText').textContent = has ? (useClip ? 'Using clipboard: ' : 'Clipboard: ') + '“' + one.slice(0, 40) + (one.length > 40 ? '…' : '') + '”' : '';
    }
    $('clip').onclick = () => { useClip = !useClip; refreshClip(); };
    $('retake').onclick = async () => { try { const s = await M.capture(); setShot(s); toast('New screenshot taken'); } catch (e) { toast(e.message || 'Couldn\'t take a screenshot'); } };
    $('addShot').onclick = $('retake').onclick;
    $('dropShot').onclick = () => setShot(null);
    $('area').onclick = async () => {
        try { const s = await M.selectArea(); if (s) { s.area = true; setShot(s); $('input').focus(); } } catch (e) { toast(e.message || 'Couldn\'t select an area'); }
    };

    /* ─────────── modes ─────────── */
    function setMode(m) {
        if (run) return;
        mode = m;
        document.querySelectorAll('.modes button').forEach(b => { const on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
        $('askView').hidden = m !== 'ask'; $('doView').hidden = m !== 'do';
        $('area').hidden = m === 'do' || ANDROID;
        $('input').placeholder = ANDROID ? 'Ask, or tell Zelpophai to do something…' : m === 'ask' ? 'Ask about your screen…' : 'What should Mini do? e.g. "Open Notepad and write a shopping list"';
        $('quickrow').classList.toggle('on', m === 'ask' && history.length > 0);
        $('shotBox').hidden = m === 'do' || !shot;
        $('addShot').hidden = m === 'do' || !!shot;
        store.set('zp_mini_mode', m);
        $('input').focus();
    }
    document.querySelectorAll('.modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode));

    /* ─────────── quick actions ─────────── */
    const langName = (() => { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of((navigator.language || 'en').split('-')[0]); } catch (e) { return 'English'; } })();
    const QUICK = [
        ['💡', 'Explain', 'Explain what is on my screen in simple words, and point out anything important.'],
        ['📝', 'Summarise', 'Summarise the main content on my screen in a few short bullet points.'],
        ['🌍', 'Translate', `Translate the main text on my screen into ${langName === 'English' ? 'English (if it is already English, into French)' : langName}.`],
        ['✨', 'Fix / rewrite', 'Fix the spelling and grammar of the text I am writing on screen and make it clearer. Give only the improved text.'],
        ['💬', 'Reply', 'Write a good reply to the message or email on my screen. Friendly and short. Give only the reply.'],
        ['🔤', 'Extract text', 'Extract all the text from the screenshot exactly, keeping the line breaks.'],
    ];
    function renderQuick() {
        $('quick').innerHTML = QUICK.map((q, i) => `<button type="button" class="qa" data-i="${i}"><i>${q[0]}</i>${esc(q[1])}</button>`).join('');
        $('quickrow').innerHTML = QUICK.map((q, i) => `<button type="button" class="chip" data-i="${i}">${q[0]} ${esc(q[1])}</button>`).join('');
        document.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const q = QUICK[+b.dataset.i]; ask(q[2], q[1]); });
 const EX = ['Open Roblox', 'Connect my VPN', 'Open Notepad and type a to-do list for today', 'Search YouTube for lo-fi music and play the first video', 'Turn on dark mode in Windows settings', 'Copy the email address on this page into a new email'];
        $('examples').innerHTML = EX.map(e => `<button type="button" class="ex">${esc(e)}</button>`).join('');
        document.querySelectorAll('.ex').forEach(b => b.onclick = () => { $('input').value = b.textContent; grow(); $('input').focus(); });
    }

    /* ─────────── ask mode ─────────── */
    function scrollDown() { const b = $('body'); b.scrollTop = b.scrollHeight; }
    function pasteText(answer) {
        const blocks = [...String(answer).matchAll(/```[\w-]*\n([\s\S]*?)```/g)];
        if (blocks.length === 1) return blocks[0][1].replace(/\n$/, '');
        return window.ZRender ? ZRender.plain(answer).replace(/^#+\s*/gm, '').replace(/\*\*(.*?)\*\*/g, '$1') : answer;
    }

    async function ask(question, label) {
        if (busy) return;
        if (!question.trim() && !shot) { toast('Type a question or use your screen'); return; }
        busy = true; setSending(true);
        $('askEmpty').hidden = true; $('quickrow').classList.add('on');
        const u = document.createElement('div'); u.className = 'u';
        u.textContent = label || question;
        const extras = [shot ? (shot.area ? '📐 selected area' : '🖥️ screen') : '', useClip ? '📋 clipboard' : ''].filter(Boolean).join(' · ');
        if (extras) { const s = document.createElement('small'); s.textContent = extras; u.appendChild(s); }
        const a = document.createElement('div'); a.className = 'a';
        const content = document.createElement('div'); content.className = 'msg-bubble';
        content.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
        a.appendChild(content);
        $('thread').append(u, a); scrollDown();
        let text = '';
        abortCtl = new AbortController();
        try {
            const r = await fetch('/api/mini/ask', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', signal: abortCtl.signal,
                body: JSON.stringify({ question, screenshot: shot ? shot.image : '', area: !!(shot && shot.area), clipboard: useClip ? clipText : '', history: history.slice(-12) }),
            });
            if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || 'Something went wrong (' + r.status + ')'); }
            const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; let last = 0;
            while (true) {
                const { value, done } = await reader.read(); if (done) break;
                buf += dec.decode(value, { stream: true });
                let i;
                while ((i = buf.indexOf('\n\n')) !== -1) {
                    const ev = buf.slice(0, i); buf = buf.slice(i + 2);
                    if (!ev.startsWith('data: ')) continue;
                    const data = ev.slice(6);
                    if (data === '[DONE]') continue;
                    let o; try { o = JSON.parse(data); } catch (e) { continue; }
                    if (o.error) throw new Error(o.error);
                    if ('left' in o) setLeft(o.left);
                    if (o.status === 'calculating' && !text) content.innerHTML = '<span class="calc-note"><span class="spin"></span>Calculating it exactly…</span>';
                    if (o.token) {
                        text += o.token;
                        const now = Date.now();
                        if (now - last > 60) { last = now; render(content, text, true); scrollDown(); }
                    }
                }
            }
            if (!text.trim()) throw new Error('No answer came back. Please try again.');
            render(content, text, false);
            history.push({ role: 'user', content: label ? label + ': ' + question : question }, { role: 'assistant', content: text });
            addAnswerActions(a, text);
            save(label || question, text, 'ask');
        } catch (e) {
            if (e.name === 'AbortError') { if (!text) content.innerHTML = '<span class="err">Stopped.</span>'; else render(content, text, false); }
            else content.innerHTML = '<p class="err">' + esc(e.message || 'Something went wrong') + '</p>';
        } finally {
            busy = false; abortCtl = null; setSending(false); scrollDown();
            // after an answer, the next question is about the same screen unless they retake
        }
    }
    function render(el, text, streaming) {
        if (window.ZRender) { try { ZRender.render(el, text, { streaming }); return; } catch (e) {} }
        el.textContent = text;
    }
    function addAnswerActions(a, text) {
        const row = document.createElement('div'); row.className = 'acts';
        row.innerHTML = `<button type="button" data-a="copy">${IC.copy}<span>Copy</span></button>` +
            (M && M.platform === 'windows' ? `<button type="button" data-a="paste" title="Paste into the app you were using">${IC.paste}<span>Paste into app</span></button>` : '') +
            `<button type="button" data-a="open" title="See it in your Mini history">${IC.open}<span>Open in Zelpophai</span></button>`;
        row.onclick = async (e) => {
            const b = e.target.closest('button'); if (!b) return;
            const act = b.dataset.a;
            if (act === 'copy') { await M.copy(pasteText(text)); b.classList.add('ok'); b.innerHTML = IC.check + '<span>Copied</span>'; setTimeout(() => { b.classList.remove('ok'); b.innerHTML = IC.copy + '<span>Copy</span>'; }, 1400); }
            if (act === 'paste') { try { await M.pasteToApp(pasteText(text)); } catch (err) { toast(err.message || 'Couldn\'t paste'); } }
            if (act === 'open') M.openInApp(lastLink ? '/app/c/' + lastLink : '/app');
        };
        a.appendChild(row);
    }
    async function save(question, answer, kind) {
        try {
            const r = await fetch('/api/mini/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ question: String(question).slice(0, 6000), answer: String(answer).slice(0, 20000), kind }) });
            const d = await r.json(); if (d && d.link_id) lastLink = d.link_id;
        } catch (e) {}
    }

    /* ─────────── do mode ─────────── */
    const ACT_LABEL = (a) => {
        switch (a.type) {
            case 'click': return (a.double ? 'Double-click' : a.button === 'right' ? 'Right-click' : 'Click') + (a.why ? ' — ' + a.why : '');
            case 'move': return 'Move the mouse' + (a.why ? ' — ' + a.why : '');
            case 'drag': return 'Drag' + (a.why ? ' — ' + a.why : '');
            case 'type': return 'Type “' + (a.text.length > 60 ? a.text.slice(0, 60) + '…' : a.text) + '”';
            case 'key': return 'Press ' + a.keys.split('+').map(k => k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1)).join(' + ') + (a.why ? ' — ' + a.why : '');
            case 'scroll': return 'Scroll ' + (a.direction || (a.amount < 0 ? 'down' : 'up')) + (a.why ? ' — ' + a.why : '');
            case 'wait': return 'Wait a moment' + (a.why ? ' — ' + a.why : '');
            case 'open': return 'Open ' + a.url;
            case 'launch': return 'Open the app “' + a.app + '”' + (a.why ? ' — ' + a.why : '');
            case 'tap': return 'Tap' + (a.why ? ' — ' + a.why : '');
            case 'long_press': return 'Press and hold' + (a.why ? ' — ' + a.why : '');
            case 'back': return 'Go back';
            case 'home': return 'Go to the home screen';
            case 'recents': return 'Show recent apps';
            case 'notifications': return 'Open notifications';
            default: return a.type;
        }
    };
    function logEl(html, cls) { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; $('log').appendChild(d); scrollDown(); return d; }
    function working(text) {
        const w = logEl(`<span class="spin"></span><span class="t">${esc(text)}</span><button type="button" class="btn warn stop">Stop</button>`, 'working');
        w.querySelector('.stop').onclick = () => stopRun('You stopped Mini.');
        return { set: (t) => { w.querySelector('.t').textContent = t; }, done: () => w.remove() };
    }
    function waitChoice(container, risky, a) {
        return new Promise((resolve) => {
            const c = document.createElement('div'); c.className = 'confirm' + (risky ? ' risky' : '');
            c.innerHTML = `<p>${risky ? '⚠️ <b>Check this one:</b> ' : 'Next: '}${esc(ACT_LABEL(a))}</p><div class="row">` +
                `<button type="button" class="btn pri" data-c="yes">Allow</button>` +
                (risky ? '' : `<button type="button" class="btn" data-c="all">Allow all for this task</button>`) +
                `<button type="button" class="btn" data-c="skip">Skip</button><button type="button" class="btn warn" data-c="stop">Stop</button></div>`;
            container.appendChild(c); scrollDown();
            M.showPanel();
            const btn = c.querySelector('[data-c="yes"]'); setTimeout(() => btn.focus(), 30);
            c.onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; c.remove(); resolve(b.dataset.c); };
            run.cancelChoice = () => { c.remove(); resolve('stop'); };
        });
    }
    function waitAnswer(container, question) {
        return new Promise((resolve) => {
            const box = document.createElement('div'); box.className = 'q';
            box.innerHTML = '<input type="text" placeholder="Your answer…" aria-label="Your answer"><button type="button" class="btn pri">Reply</button>';
            container.appendChild(box); M.showPanel();
            const inp = box.querySelector('input'); setTimeout(() => inp.focus(), 30);
            const go = () => { const v = inp.value.trim(); if (!v) return; box.remove(); resolve(v); };
            box.querySelector('button').onclick = go;
            inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
            run.cancelChoice = () => { box.remove(); resolve(null); };
        });
    }
    function stopRun(msg) {
        if (!run || run.stopped) return;
        run.stopped = msg || 'Stopped.';
        if (run.cancelChoice) run.cancelChoice();
        if (abortCtl) abortCtl.abort();
    }
    if (M) M.onStop(() => stopRun('Stopped with Esc.'));

    /* The screenshot the AI sees in Do mode gets a faint coordinate grid (so it
       can read positions) and a red ring where its last click landed (so it can
       tell a miss). The clean copy is kept for zooming in on click targets. */
    function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; }); }
    async function annotate(s, mark) {
        try {
            const im = await loadImg(s.image);
            const c = document.createElement('canvas'); c.width = s.width; c.height = s.height;
            const g = c.getContext('2d'); g.drawImage(im, 0, 0, s.width, s.height);
            if (!ANDROID) {
                g.lineWidth = 1; g.font = 'bold 10px system-ui, sans-serif'; g.textBaseline = 'top';
                for (let x = 100; x < s.width; x += 100) {
                    g.strokeStyle = 'rgba(255,0,170,0.22)'; g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, s.height); g.stroke();
                    g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(x + 2, 1, 24, 12); g.fillStyle = '#ff9be0'; g.fillText(String(x), x + 3, 2);
                }
                for (let y = 100; y < s.height; y += 100) {
                    g.strokeStyle = 'rgba(255,0,170,0.22)'; g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(s.width, y + 0.5); g.stroke();
                    g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(1, y + 2, 24, 12); g.fillStyle = '#ff9be0'; g.fillText(String(y), 2, y + 3);
                }
            }
            if (mark) {
                g.strokeStyle = '#ff2a2a'; g.lineWidth = 3; g.beginPath(); g.arc(mark.x, mark.y, 14, 0, Math.PI * 2); g.stroke();
                g.fillStyle = '#ff2a2a'; g.font = 'bold 13px system-ui, sans-serif'; g.fillText(String(mark.n), mark.x + 16, mark.y - 22);
            }
            return { image: c.toDataURL('image/jpeg', 0.8), width: s.width, height: s.height, clean: s.image, elements: s.elements };
        } catch (e) { return Object.assign({ clean: s.image }, s); }
    }
    // Zoom in on where a click is about to land and let a fast model place it exactly.
    async function refineClick(a, s) {
        if (!a.why || a.type !== 'click') return a;
        try {
            let crop;
            if (M.crop) crop = await M.crop({ x: a.x, y: a.y, w: 320, h: 220 });       // full-resolution close-up (app 1.5+)
            if (!crop) {
                const im = await loadImg(s.clean || s.image);
                const w = 240, h = 160, k = 2;
                const ox = Math.max(0, Math.min(s.width - w, a.x - w / 2)), oy = Math.max(0, Math.min(s.height - h, a.y - h / 2));
                const c = document.createElement('canvas'); c.width = w * k; c.height = h * k;
                const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
                g.drawImage(im, ox, oy, w, h, 0, 0, w * k, h * k);
                crop = { image: c.toDataURL('image/jpeg', 0.9), width: w * k, height: h * k, ox, oy, scale: k };
            }
            const r = await fetch('/api/mini/refine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
                body: JSON.stringify({ image: crop.image, why: a.why, width: crop.width, height: crop.height }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.found) return a;
            const nx = crop.ox + d.x / crop.scale, ny = crop.oy + d.y / crop.scale;
            if (Math.hypot(nx - a.x, ny - a.y) > 140) return a;      // too far off to be the same thing — keep the original
            return Object.assign({}, a, { x: Math.round(nx), y: Math.round(ny), refined: true });
        } catch (e) { return a; }
    }
    function showPlan() {
        if (!run || !run.plan.length) return;
        if (!run.planEl) { run.planEl = document.createElement('div'); run.planEl.className = 'plan'; run.taskEl.after(run.planEl); }
        const n = Math.min(run.planDone, run.plan.length);
        run.planEl.innerHTML = '<div class="pt"><b>Plan</b><span>' + n + ' of ' + run.plan.length + ' done</span></div><ol>' +
            run.plan.map((p, i) => `<li class="${i < n ? 'ok' : i === n ? 'now' : ''}">${esc(p)}</li>`).join('') + '</ol>';
    }

    async function doTask(task) {
        if (run || busy) return;
        if (!task.trim()) { toast('Tell Mini what to do'); return; }
        $('doEmpty').hidden = true;
        const taskEl = logEl('🤖 ' + esc(task), 'task');
        let ok = false;
        try { ok = await M.controlStart(task); } catch (e) { logEl('<div class="say">' + esc(e.message || 'Mini can\'t control this device.') + '</div>', 'step bad'); return; }
        if (!ok) { logEl('<div class="say">' + (ANDROID ? 'Mini needs its Accessibility setting switched on to tap and type for you. Turn on <b>Zelpophai</b> there, then try again.' : 'Okay — Mini won\'t touch your PC.') + '</div>', 'step stopped'); return; }
        run = { stopped: null, notes: [], allowAll: !$('askEach').checked, answer: '', plan: [], planDone: 0, taskId: '', taskEl, mark: null };
        busy = true; setSending(true);
        const clip = useClip ? clipText : '';
        let apps = [];
        try { apps = M.apps ? (await M.apps()) || [] : []; } catch (e) { apps = []; }
        let stepNo = 0, summary = '', clicks = 0;
        try {
            while (!run.stopped) {
                stepNo++;
                const w = working('Looking at the screen…');
                let s;
                try { s = await M.capture(); } catch (e) { w.done(); throw new Error(e.message || 'Couldn\'t take a screenshot'); }
                if (!s || !s.image) { w.done(); throw new Error('Couldn\'t see the screen. ' + (ANDROID ? 'Check Mini\'s Accessibility setting is on.' : '')); }
                s = await annotate(s, run.mark);
                M.showPanel();
                if (run.stopped) { w.done(); break; }
                w.set('Thinking about step ' + stepNo + '…');
                abortCtl = new AbortController();
                let res;
                try {
                    const r = await fetch('/api/mini/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', signal: abortCtl.signal,
                        body: JSON.stringify({ task, screenshot: s.image, width: s.width, height: s.height, notes: run.notes.slice(-12), answer: run.answer, clipboard: clip,
                                               step: stepNo, apps, platform: ANDROID ? 'android' : 'windows', elements: s.elements || [], plan: run.plan, task_id: run.taskId }) });
                    res = await r.json().catch(() => ({}));
                    if (!r.ok) throw new Error(res.detail || 'Something went wrong (' + r.status + ')');
                } finally { w.done(); abortCtl = null; }
                run.answer = '';
                if (res.task_id) run.taskId = res.task_id;
                if ('left' in res) setLeft(res.left);
                if (res.plan && res.plan.length) run.plan = res.plan;
                if (typeof res.plan_done === 'number') run.planDone = Math.max(run.planDone, res.plan_done);
                showPlan();
                const card = logEl(`<div class="n">Step ${stepNo}</div>` + (res.check && stepNo > 1 ? `<div class="chk">${esc(res.check)}</div>` : '') + `<div class="say">${esc(res.say || '')}</div>`, 'step');
                if (res.question) {
                    const q = document.createElement('div'); q.className = 'say'; q.style.marginTop = '6px'; q.innerHTML = '❓ ' + esc(res.question); card.appendChild(q);
                    if (ANDROID && M.speak) M.speak(res.question);
                    const ans = await waitAnswer(card, res.question);
                    if (ans == null) break;
                    run.answer = ans;
                    run.notes.push({ say: res.say || '', actions: [], result: 'asked: ' + res.question + ' — user answered: ' + ans });
                    continue;
                }
                if (res.done || !(res.actions || []).length) {
                    card.classList.add('final');
                    card.querySelector('.n').textContent = res.done ? 'Done ✓' : 'Finished';
                    summary = res.say || 'Done.';
                    if (res.done && run.plan.length) { run.planDone = run.plan.length; showPlan(); }
                    if (ANDROID && M.speak && summary) M.speak(summary);
                    break;
                }
                const ul = document.createElement('ul'); card.appendChild(ul);
                const results = [];
                for (let a of res.actions) {
                    if (run.stopped) break;
                    const li = document.createElement('li'); if (a.risky) li.classList.add('risky');
                    li.innerHTML = `<b>${esc(ACT_LABEL(a))}</b><span class="st">…</span>`; ul.appendChild(li); scrollDown();
                    let choice = 'yes';
                    if (a.risky || !run.allowAll) choice = await waitChoice(card, a.risky, a);
                    if (choice === 'all') { run.allowAll = true; choice = 'yes'; }
                    if (choice === 'stop') { stopRun('You stopped Mini.'); li.classList.add('skip'); li.querySelector('.st').textContent = 'stopped'; break; }
                    if (choice === 'skip') { li.classList.add('skip'); li.querySelector('.st').textContent = 'skipped'; results.push(ACT_LABEL(a) + ': skipped by the user'); continue; }
                    try {
                        if (!ANDROID && a.type === 'click') { li.querySelector('.st').textContent = 'aiming…'; a = await refineClick(a, s); }
                        await M.act(a);
                        if (a.type === 'click' || a.type === 'tap') { clicks++; run.mark = (a.x != null) ? { x: a.x, y: a.y, n: clicks } : null; }
                        li.classList.add('done'); li.querySelector('.st').textContent = a.refined ? 'done · aimed' : 'done';
                        results.push(ACT_LABEL(a) + ': done' + (a.x != null ? ` at (${a.x},${a.y})` : ''));
                    } catch (e) {
                        const msg = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
                        li.classList.add('fail'); li.querySelector('.st').textContent = 'failed';
                        results.push(ACT_LABEL(a) + ': failed (' + msg + ')');
                        if (/Stopped/.test(msg)) break;
                    }
                }
                run.notes.push({ say: res.say || '', actions: res.actions, result: results.join('; ') || 'nothing done' });
            }
        } catch (e) {
            if (e.name !== 'AbortError') logEl('<div class="say">' + esc(e.message || 'Something went wrong') + '</div>', 'step bad');
        } finally {
            const stopped = run && run.stopped;
            try { await M.controlEnd(); } catch (e) {}
            M.showPanel();
            if (stopped) { logEl('<div class="say">⏹ ' + esc(stopped) + '</div>', 'step stopped'); summary = summary || 'Stopped: ' + stopped; }
            const steps = run ? run.notes.map((n, i) => `${i + 1}. ${n.say}${n.result ? ' (' + n.result + ')' : ''}`).join('\n') : '';
            if (summary || steps) save(task, (summary || 'Finished') + (steps ? '\n\nSteps:\n' + steps : ''), 'do');
            run = null; busy = false; setSending(false);
        }
    }

    /* ─────────── Android: the voice assistant ─────────── */
    // Hold the home / power button (or tap the bubble) → Zelpophai listens, works
    // out whether you want an answer, a quick phone action or a task on screen,
    // and answers out loud.
    let heardByVoice = false, screenTxt = '', speaking = false, listening = false;
    function plainSpeech(t) {
        return String(t || '').replace(/<zrun\b[\s\S]*?<\/zrun>\s*(<zout\b[\s\S]*?<\/zout>)?/gi, '')
            .replace(/```[\s\S]*?```/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_`>|]/g, '')
            .replace(/\s+/g, ' ').trim().slice(0, 1500);
    }
    function setOrb(state) {
        const w = $('orbWrap'); if (!w) return;
        w.dataset.state = state;
        $('heard').textContent = { listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking — tap to stop', idle: 'Tap to talk' }[state] || '';
    }
    async function startListening() {
        if (!ANDROID || listening || busy) return;
        if (speaking) { try { await M.stopSpeaking(); } catch (e) {} speaking = false; }
        try { listening = true; setOrb('listening'); await M.listen(); }
        catch (e) { listening = false; setOrb('idle'); toast(e.message || 'The microphone isn\'t available'); }
    }
    if (ANDROID) {
        M.onSpeech((ev) => {
            if (!ev) return;
            if (ev.partial) { $('heard').textContent = ev.partial; $('input').value = ev.partial; grow(); }
            if (ev.final != null) {
                listening = false; setOrb('idle');
                const t = String(ev.final || '').trim();
                if (!t) { setOrb('idle'); $('heard').textContent = 'I didn\'t catch that — tap to try again'; return; }
                $('input').value = ''; grow(); heardByVoice = true; assist(t);
            }
            if (ev.error) { listening = false; setOrb('idle'); $('heard').textContent = ev.error; }
        });
        M.onSpoken(() => { speaking = false; setOrb('idle'); });
        $('orb').onclick = () => {
            if (speaking) { M.stopSpeaking(); speaking = false; setOrb('idle'); return; }
            if (listening) { M.stopListening(); return; }
            startListening();
        };
    }
    function say(text) {
        if (!ANDROID || !heardByVoice || !text) return;
        speaking = true; setOrb('speaking');
        M.speak(plainSpeech(text)).catch(() => { speaking = false; setOrb('idle'); });
    }

    async function assist(text) {
        if (busy || run) return;
        busy = true; setSending(true); setOrb('thinking');
        $('askEmpty').hidden = true;
        const u = document.createElement('div'); u.className = 'u'; u.textContent = text;
        if (shot) { const sm = document.createElement('small'); sm.textContent = '📱 screen'; u.appendChild(sm); }
        const a = document.createElement('div'); a.className = 'a';
        const content = document.createElement('div'); content.className = 'msg-bubble';
        content.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
        a.appendChild(content); $('thread').append(u, a); scrollDown();
        let apps = [];
        try { apps = (await M.apps()) || []; } catch (e) {}
        let out = '', route = null, voice = heardByVoice;
        abortCtl = new AbortController();
        try {
            const r = await fetch('/api/mini/assist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', signal: abortCtl.signal,
                body: JSON.stringify({ text, screenshot: shot ? shot.image : '', screen_text: screenTxt, clipboard: useClip ? clipText : '', history: history.slice(-12), apps, voice }) });
            if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || 'Something went wrong (' + r.status + ')'); }
            const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '', last = 0;
            while (true) {
                const { value, done } = await reader.read(); if (done) break;
                buf += dec.decode(value, { stream: true });
                let i;
                while ((i = buf.indexOf('\n\n')) !== -1) {
                    const ev = buf.slice(0, i); buf = buf.slice(i + 2);
                    if (!ev.startsWith('data: ')) continue;
                    const data = ev.slice(6); if (data === '[DONE]') continue;
                    let o; try { o = JSON.parse(data); } catch (e) { continue; }
                    if (o.error) throw new Error(o.error);
                    if ('left' in o) setLeft(o.left);
                    if (o.route) route = o.route;
                    if (o.status === 'calculating' && !out) content.innerHTML = '<span class="calc-note"><span class="spin"></span>Calculating it exactly…</span>';
                    if (o.token) { out += o.token; const now = Date.now(); if (now - last > 60) { last = now; render(content, out, true); scrollDown(); } }
                }
            }
            if (route && route.kind === 'task') {
                a.remove(); u.remove(); busy = false; abortCtl = null; setSending(false);
                setMode('do'); $('input').value = ''; await doTask(text); setMode('ask');
                return;
            }
            if (route && route.kind === 'quick') {
                content.textContent = route.say || 'Okay.';
                try { await M.quick(route.actions || []); }
                catch (e) { content.textContent = e.message || 'I couldn\'t do that on this phone.'; }
                out = content.textContent;
            } else {
                if (!out.trim()) throw new Error('No answer came back. Please try again.');
                render(content, out, false);
                addAnswerActions(a, out);
            }
            history.push({ role: 'user', content: text }, { role: 'assistant', content: out });
            save(text, out, 'ask');
            say(out);
        } catch (e) {
            if (e.name === 'AbortError') { if (!out) content.innerHTML = '<span class="err">Stopped.</span>'; else render(content, out, false); }
            else { content.innerHTML = '<p class="err">' + esc(e.message || 'Something went wrong') + '</p>'; say(e.message); }
        } finally {
            busy = false; abortCtl = null; setSending(false); scrollDown(); heardByVoice = false;
            if (!speaking) setOrb('idle');
        }
    }

    /* ─────────── voice ─────────── */
    let rec = null;
    $('mic').onclick = async () => {
        if (ANDROID) { $('orb').click(); return; }
        if (rec) { rec.stop(); return; }
        let stream;
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch (e) { toast('Microphone blocked — check Windows Settings → Privacy → Microphone'); return; }
        const chunks = [];
        const mr = new MediaRecorder(stream);
        rec = mr;
        $('mic').classList.add('rec'); $('mic').title = 'Listening… click to stop';
        const limit = setTimeout(() => { if (mr.state === 'recording') mr.stop(); }, 55000);
        mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        mr.onstop = async () => {
            clearTimeout(limit); stream.getTracks().forEach(t => t.stop()); rec = null;
            $('mic').classList.remove('rec'); $('mic').classList.add('busy'); $('mic').title = 'Speak (click to start / stop)';
            try {
                const wav = await toWav(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }));
                const r = await fetch('/api/mini/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ audio: wav }) });
                const d = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(d.detail || 'Couldn\'t understand that');
                const t = (d.text || '').trim();
                if (!t) { toast('I didn\'t catch that — try again'); return; }
                $('input').value = ($('input').value ? $('input').value + ' ' : '') + t; grow();
                submit();
            } catch (e) { toast(e.message || 'Voice failed'); }
            finally { $('mic').classList.remove('busy'); }
        };
        mr.start();
    };
    async function toWav(blob) {
        const buf = await blob.arrayBuffer();
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const audio = await ctx.decodeAudioData(buf); ctx.close();
        const rate = 16000, len = Math.ceil(audio.duration * rate);
        const off = new OfflineAudioContext(1, Math.max(1, len), rate);
        const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start();
        const data = (await off.startRendering()).getChannelData(0);
        const out = new DataView(new ArrayBuffer(44 + data.length * 2));
        const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
        w(0, 'RIFF'); out.setUint32(4, 36 + data.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
        out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, rate, true);
        out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, data.length * 2, true);
        for (let i = 0; i < data.length; i++) { const v = Math.max(-1, Math.min(1, data[i])); out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
        const bytes = new Uint8Array(out.buffer); let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return 'data:audio/wav;base64,' + btoa(bin);
    }

    /* ─────────── input ─────────── */
    function grow() { const i = $('input'); i.style.height = 'auto'; i.style.height = Math.min(140, i.scrollHeight) + 'px'; }
    function setSending(on) {
        const s = $('send');
        s.classList.toggle('stop', on); s.innerHTML = on ? IC.stop : IC.send; s.title = on ? 'Stop' : 'Send (Enter)';
        $('hint').textContent = on ? (run ? (ANDROID ? 'Tap “Stop” to stop' : 'Esc stops Mini') : 'Working…') : (ANDROID ? 'Tap the circle to talk' : 'Enter to send · Esc to close');
    }
    function setLeft(n) { $('left').textContent = n == null ? 'Unlimited' : n + ' left today'; }
    function submit() {
        if (busy) { if (run) stopRun('You stopped Mini.'); else if (abortCtl) abortCtl.abort(); return; }
        const t = $('input').value.trim();
        $('input').value = ''; grow();
        if (ANDROID && mode === 'ask') { if (t) { heardByVoice = false; assist(t); } return; }
        if (mode === 'ask') ask(t); else doTask(t);
    }
    $('send').onclick = submit;
    $('input').addEventListener('input', grow);
    $('input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (run) { stopRun('Stopped with Esc.'); return; }
        if (rec) { rec.stop(); return; }
        if (M) M.hide();
    });
    $('close').onclick = () => { if (run) stopRun('You stopped Mini.'); M && M.hide(); };
    $('openApp').onclick = () => M && M.openInApp(lastLink ? '/app/c/' + lastLink : '/app');
    $('pin').onclick = () => { const on = $('pin').getAttribute('aria-pressed') !== 'true'; $('pin').setAttribute('aria-pressed', on ? 'true' : 'false'); store.set('zp_mini_pin', on ? '1' : ''); M && M.setPinned(on); };

    function newChat(quiet) {
        if (run || busy) return;
        history = []; $('thread').innerHTML = ''; $('askEmpty').hidden = false; $('log').innerHTML = ''; $('doEmpty').hidden = false;
        $('quickrow').classList.remove('on'); lastLink = '';
        if (!quiet) { toast('New conversation'); $('input').focus(); }
    }
    if ($('newChat')) $('newChat').onclick = () => newChat(false);

    /* ─────────── paste or drop a picture ─────────── */
    // A picture pasted (Ctrl+V) or dropped into Mini becomes what it looks at.
    function shrink(dataUrl, max) {
        return new Promise((res) => {
            const im = new Image();
            im.onload = () => {
                const k = Math.min(1, max / Math.max(im.width, im.height));
                const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
                c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
                res({ image: c.toDataURL('image/jpeg', 0.85), width: c.width, height: c.height });
            };
            im.onerror = () => res(null);
            im.src = dataUrl;
        });
    }
    function takePicture(file) {
        if (!file || !/^image\//.test(file.type)) return false;
        if (mode === 'do') setMode('ask');
        const fr = new FileReader();
        fr.onload = async () => { const s = await shrink(fr.result, 1600); if (s) { s.area = true; s.pasted = true; setShot(s); $('shotLabel').textContent = 'Your picture'; $('shotSub').textContent = 'Mini will look at this picture'; toast('Picture added'); } };
        fr.readAsDataURL(file);
        return true;
    }
    $('input').addEventListener('paste', (e) => {
        const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
        const f = items.filter(i => i.kind === 'file').map(i => i.getAsFile()).find(x => x && /^image\//.test(x.type));
        if (f && takePicture(f)) e.preventDefault();
    });
    document.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); document.body.classList.add('dropping'); } });
    document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
    document.addEventListener('drop', (e) => {
        document.body.classList.remove('dropping');
        const f = e.dataTransfer && [...e.dataTransfer.files].find(x => /^image\//.test(x.type));
        if (f) { e.preventDefault(); takePicture(f); }
    });

    /* ─────────── start ─────────── */
    // Mini shares the app's sign-in (same cookies), so it re-checks every time it
    // opens: log in or out in the app and Mini follows straight away.
    let authUser = null;
    async function checkAuth() {
        let d = null, status = 0;
        try {
            const r = await fetch('/api/mini/status', { credentials: 'same-origin', cache: 'no-store' });
            status = r.status;
            if (r.ok) d = await r.json();
        } catch (e) { status = -1; }
        if (d && !d.guest) {
            if (authUser && authUser !== d.name) { history = []; $('thread').innerHTML = ''; $('askEmpty').hidden = false; $('log').innerHTML = ''; $('doEmpty').hidden = false; lastLink = ''; }
            authUser = d.name;
            $('blocker').hidden = true;
            setLeft(d.left);
            return true;
        }
        authUser = null;
        if (status === -1) {
            block('📡', 'You\'re offline', 'Check your internet connection, then press Ctrl + Shift + Z again.', [{ label: 'Try again', pri: true, onclick: () => checkAuth() }]);
        } else {
            block('🔐', d && d.guest ? 'Create a free account to use Mini' : 'Log in to use Mini',
                d && d.guest ? 'Mini needs a Zelpophai account. Sign up or log in in the app — Mini will be ready right away.'
                             : 'Log in to Zelpophai in the app — Mini will be ready right away.',
                [{ label: 'Open Zelpophai', pri: true, onclick: () => M.openInApp('/') }, { label: 'I\'ve logged in', onclick: () => checkAuth() }]);
        }
        return false;
    }
    // Also re-check when the panel gets focus (e.g. after logging in while it was pinned).
    window.addEventListener('focus', () => { if (!run && !$('blocker').hidden) checkAuth(); });

    async function onShown(info) {
        if (run) return;
        if (!(await checkAuth())) return;
        // A fresh session after a few minutes away; otherwise keep the conversation.
        if (Date.now() - lastShown > KEEP_MS && !busy) newChat(true);
        lastShown = Date.now();
        if (info && info.error) toast(info.error);
        if (mode === 'ask') {
            try { const s = await M.lastCapture(); setShot(s); } catch (e) { setShot(null); }
        }
        if (ANDROID) {
            try { screenTxt = String((await M.screenText()) || ''); } catch (e) { screenTxt = ''; }
            if (info && info.voice !== false) startListening(); else setOrb('idle');
            return;
        }
        refreshClip();
        $('input').focus();
    }

    async function init() {
        renderQuick();
        if (!M) {
            block('🖥️', 'Zelpophai Mini lives in the Windows app', 'Press Ctrl + Shift + Z anywhere on your PC to ask about your screen or let Mini do tasks for you.',
                [{ label: 'Get the Windows app', href: '/download', pri: true }]);
            return;
        }
        if (ANDROID) {
            document.body.classList.add('android');
            $('orbWrap').hidden = false; setOrb('idle');
            $('area').hidden = true; $('pin').hidden = true; $('retake').hidden = true;
            document.querySelector('.brand b').textContent = 'Zelpophai';
            document.title = 'Zelpophai';
            $('input').placeholder = 'Ask, or tell Zelpophai to do something…';
            document.querySelector('.hello').textContent = 'Hi! Ask me anything, or tell me what to do.';
            $('hint').textContent = 'Tap the circle to talk';
        }
        await checkAuth();
        if (store.get('zp_mini_pin', '')) { $('pin').setAttribute('aria-pressed', 'true'); M.setPinned(true); }
        $('askEach').checked = store.get('zp_mini_askeach', '1') === '1';
        $('askEach').onchange = () => store.set('zp_mini_askeach', $('askEach').checked ? '1' : '0');
        setMode(!ANDROID && store.get('zp_mini_mode', 'ask') === 'do' ? 'do' : 'ask');
        M.onShown(onShown);
        if (!$('blocker').hidden) return;
        onShown({});
    }
    init();
})();
