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
        $('area').hidden = m === 'do';
        $('input').placeholder = m === 'ask' ? 'Ask about your screen…' : 'What should Mini do? e.g. "Open Notepad and write a shopping list"';
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
                body: JSON.stringify({ question, screenshot: shot ? shot.image : '', area: !!(shot && shot.area), clipboard: useClip ? clipText : '', history: history.slice(-6) }),
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
            case 'scroll': return 'Scroll ' + (a.amount < 0 ? 'down' : 'up') + (a.why ? ' — ' + a.why : '');
            case 'wait': return 'Wait a moment' + (a.why ? ' — ' + a.why : '');
            case 'open': return 'Open ' + a.url;
            case 'launch': return 'Open the app “' + a.app + '”' + (a.why ? ' — ' + a.why : '');
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

    async function doTask(task) {
        if (run || busy) return;
        if (!task.trim()) { toast('Tell Mini what to do'); return; }
        $('doEmpty').hidden = true;
        logEl('🤖 ' + esc(task), 'task');
        let ok = false;
        try { ok = await M.controlStart(task); } catch (e) { logEl('<div class="say">' + esc(e.message || 'Mini can\'t control this PC.') + '</div>', 'step bad'); return; }
        if (!ok) { logEl('<div class="say">Okay — Mini won\'t touch your PC.</div>', 'step stopped'); return; }
        run = { stopped: null, notes: [], allowAll: !$('askEach').checked, answer: '' };
        busy = true; setSending(true);
        const clip = useClip ? clipText : '';
        let apps = [];
        try { apps = M.apps ? (await M.apps()) || [] : []; } catch (e) { apps = []; }
        let stepNo = 0, summary = '';
        try {
            while (!run.stopped) {
                stepNo++;
                const w = working('Looking at your screen…');
                let s;
                try { s = await M.capture(); } catch (e) { w.done(); throw new Error(e.message || 'Couldn\'t take a screenshot'); }
                M.showPanel();
                if (run.stopped) { w.done(); break; }
                w.set('Thinking about step ' + stepNo + '…');
                abortCtl = new AbortController();
                let res;
                try {
                    const r = await fetch('/api/mini/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', signal: abortCtl.signal,
                        body: JSON.stringify({ task, screenshot: s.image, width: s.width, height: s.height, notes: run.notes.slice(-12), answer: run.answer, clipboard: clip, step: stepNo, apps }) });
                    res = await r.json().catch(() => ({}));
                    if (!r.ok) throw new Error(res.detail || 'Something went wrong (' + r.status + ')');
                } finally { w.done(); abortCtl = null; }
                run.answer = '';
                if ('left' in res) setLeft(res.left);
                const card = logEl(`<div class="n">Step ${stepNo}</div><div class="say">${esc(res.say || '')}</div>`, 'step');
                if (res.question) {
                    const q = document.createElement('div'); q.className = 'say'; q.style.marginTop = '6px'; q.innerHTML = '❓ ' + esc(res.question); card.appendChild(q);
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
                    break;
                }
                const ul = document.createElement('ul'); card.appendChild(ul);
                const results = [];
                for (const a of res.actions) {
                    if (run.stopped) break;
                    const li = document.createElement('li'); if (a.risky) li.classList.add('risky');
                    li.innerHTML = `<b>${esc(ACT_LABEL(a))}</b><span class="st">…</span>`; ul.appendChild(li); scrollDown();
                    let choice = 'yes';
                    if (a.risky || !run.allowAll) choice = await waitChoice(card, a.risky, a);
                    if (choice === 'all') { run.allowAll = true; choice = 'yes'; }
                    if (choice === 'stop') { stopRun('You stopped Mini.'); li.classList.add('skip'); li.querySelector('.st').textContent = 'stopped'; break; }
                    if (choice === 'skip') { li.classList.add('skip'); li.querySelector('.st').textContent = 'skipped'; results.push(ACT_LABEL(a) + ': skipped by the user'); continue; }
                    try {
                        await M.act(a);
                        li.classList.add('done'); li.querySelector('.st').textContent = 'done';
                        results.push(ACT_LABEL(a) + ': done');
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

    /* ─────────── voice ─────────── */
    let rec = null;
    $('mic').onclick = async () => {
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
        $('hint').textContent = on ? (run ? 'Esc stops Mini' : 'Working…') : 'Enter to send · Esc to close';
    }
    function setLeft(n) { $('left').textContent = n == null ? 'Unlimited' : n + ' left today'; }
    function submit() {
        if (busy) { if (run) stopRun('You stopped Mini.'); else if (abortCtl) abortCtl.abort(); return; }
        const t = $('input').value.trim();
        $('input').value = ''; grow();
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

    /* ─────────── start ─────────── */
    async function onShown(info) {
        if (run) return;
        // A fresh session after a few minutes away; otherwise keep the conversation.
        if (Date.now() - lastShown > 5 * 60 * 1000 && !busy) { history = []; $('thread').innerHTML = ''; $('askEmpty').hidden = false; $('log').innerHTML = ''; $('doEmpty').hidden = false; $('quickrow').classList.remove('on'); }
        lastShown = Date.now();
        if (info && info.error) toast(info.error);
        if (mode === 'ask') {
            try { const s = await M.lastCapture(); setShot(s); } catch (e) { setShot(null); }
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
        try {
            const r = await fetch('/api/mini/status', { credentials: 'same-origin' });
            if (r.status === 401) throw Object.assign(new Error('login'), { login: true });
            const d = await r.json();
            if (d.guest) throw Object.assign(new Error('login'), { login: true });
            setLeft(d.left);
        } catch (e) {
            if (e.login) block('🔐', 'Log in to use Mini', 'Log in to Zelpophai in the app (not as a guest), then press Ctrl + Shift + Z again.',
                [{ label: 'Open Zelpophai', pri: true, onclick: () => M.openInApp('/') }]);
        }
        if (store.get('zp_mini_pin', '')) { $('pin').setAttribute('aria-pressed', 'true'); M.setPinned(true); }
        $('askEach').checked = store.get('zp_mini_askeach', '1') === '1';
        $('askEach').onchange = () => store.set('zp_mini_askeach', $('askEach').checked ? '1' : '0');
        setMode(store.get('zp_mini_mode', 'ask') === 'do' ? 'do' : 'ask');
        M.onShown(onShown);
        onShown({});
    }
    init();
})();
