// What's new: short update cards with "Try it" buttons, a welcome tour for new
// users, a sidebar icon with a dot, and a popup queue so these never open on top
// of another popup (tag card, greeting, limits, maintenance…).
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    };

    /* ───────────── popup queue ───────────── */
    const BUSY_IDS = ['banned-screen', 'chosen-popup', 'feedback-reply-popup', 'helper-thanks-popup', 'hw-greet', 'limit-popup',
        'logout-all-popup', 'maint-note-popup', 'maintenance-screen', 'offline-screen', 'pwd-changed-screen', 'pwd-modal',
        'request-reply-popup', 'role-notif-popup'];
    function visible(el) {
        if (!el || !el.isConnected) return false;
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
    }
    function busy() {
        for (const id of BUSY_IDS) if (visible($(id))) return true;
        const sel = '.zpop, .zp-tagpop, .zp-inv, .zp-wn, .zp-tour, [id^="broadcast-popup-"], .modal, [role="dialog"][aria-modal="true"]';
        for (const el of document.querySelectorAll(sel)) {
            if (visible(el)) return true;
        }
        return false;
    }
    // Run fn once the screen has been free of popups for ~1.2s.
    function whenFree(fn, startDelay) {
        let calm = 0;
        const tick = () => {
            if (document.hidden || busy()) calm = 0; else calm += 400;
            if (calm >= 1200) fn(); else setTimeout(tick, 400);
        };
        setTimeout(tick, startDelay == null ? 1800 : startDelay);
    }

    /* ───────────── entries ───────────── */
    const VER_RE = /^(\d+\.\d+(?:\.\d+)?)\s+/;
    // Keyword → "Try it" action. First match wins.
    const TRY = [
        [/Coding AGT/i, { label: 'Open Coding AGT.', go: '/code' }],
        [/\bapp is here|Windows and Android|\/download\b/i, { label: 'Get the app', go: '/download' }],
        [/invit/i, { label: 'Invite friends', click: 'invite-btn' }],
        [/remind/i, { label: 'Try it', ask: 'Remind me tomorrow at 9am to ' }],
        [/\bvideo/i, { label: 'Make a video', ask: 'Make a short video of ' }],
        [/\b(picture|image|logo|poster)/i, { label: 'Make a picture', ask: 'Make a picture of ' }],
        [/\bmemory\b/i, { label: 'Open Memory', click: 'memory-btn' }],
        [/\bknowledge\b/i, { label: 'Open Knowledge', click: 'kb-btn' }],
        [/\b(Word|PDF|PowerPoint|Excel|slides)\b/, { label: 'Make a file', ask: 'Make me a one-page PDF about ' }],
        [/\bresearch\b/i, { label: 'Try it', ask: 'Research ' }],
    ];
    function parse(raw) {
        let text = String(raw || '').trim();
        let ver = '';
        const m = text.match(VER_RE);
        if (m) { ver = m[1]; text = text.slice(m[0].length); }
        let title = '', desc = '';
        const cut = (re, max) => { const i = text.search(re); return i > 8 && i <= max ? i : -1; };
        let i;
        if ((i = cut(/:\s/, 80)) > 0) { title = text.slice(0, i); desc = text.slice(i + 1).trim(); }
        else if ((i = cut(/\s[—–-]\s/, 90)) > 0) { title = text.slice(0, i); desc = text.slice(i + 3).trim(); }
        else if ((i = cut(/[.!]\s/, 90)) > 0) { title = text.slice(0, i); desc = text.slice(i + 1).trim(); }
        else if (text.length <= 80) { title = text; }
        else { title = text.split(/\s+/).slice(0, 7).join(' ') + '…'; desc = text; }
        desc = desc.charAt(0).toUpperCase() + desc.slice(1);
        let act = null;
        for (const [re, a] of TRY) if (re.test(text)) { act = a; break; }
        return { ver, title, desc, act };
    }
    function runAction(act, close) {
        if (!act) return;
        if (close) close();
        if (act.go) { location.href = act.go; return; }
        if (act.click) { const b = $(act.click); if (b) b.click(); return; }
        if (act.ask) {
            const inp = $('user-input');
            if (!inp) { location.href = '/app?ask=' + encodeURIComponent(act.ask); return; }
            if (window.innerWidth <= 768) document.body.classList.remove('sidebar-open');
            inp.value = act.ask; inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.focus(); try { inp.setSelectionRange(act.ask.length, act.ask.length); } catch (e) {}
        }
    }

    /* ───────────── popup ───────────── */
    const MAX_CARDS = 5;
    function showPopup(entries, opts) {
        opts = opts || {};
        document.querySelectorAll('.zp-wn').forEach(e => e.remove());
        const items = entries.map(parse);
        const shown = items.slice(0, MAX_CARDS);
        const more = items.length - shown.length;
        const ver = opts.version || (items.find(x => x.ver) || {}).ver || '';
        const wrap = document.createElement('div');
        wrap.className = 'zp-wn';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-label', "What's new");
        wrap.innerHTML = `<div class="zp-wn-card">
            <button class="zp-wn-x" type="button" aria-label="Close">✕</button>
            <div class="zp-wn-head"><span class="zp-wn-spark">✨</span><div><h3>What's new</h3>${ver ? `<small>Zelpophai AI ${esc(ver)}</small>` : ''}</div></div>
            <div class="zp-wn-list">${shown.map((it, n) => `
                <div class="zp-wn-item">
                    <div class="zp-wn-txt"><b>${esc(it.title)}</b>${it.desc ? `<span>${esc(it.desc)}</span>` : ''}</div>
                    ${it.act ? `<button type="button" class="zp-wn-try" data-n="${n}">${esc(it.act.label)}</button>` : ''}
                </div>`).join('')}</div>
            ${opts.staffExtra ? `<div class="zp-wn-note">Plus ${opts.staffExtra} technical note${opts.staffExtra > 1 ? 's' : ''} for staff — Vault → Changelog.</div>` : ''}
            <div class="zp-wn-foot">
                <a href="/whats-new" class="zp-wn-all">${more > 0 ? `See all (${more} more)` : 'All updates'}</a>
                <button type="button" class="zp-wn-ok">Got it</button>
            </div></div>`;
        let closed = false;
        const close = () => {
            if (closed) return; closed = true;
            wrap.classList.add('out');
            setTimeout(() => wrap.remove(), 180);
            document.removeEventListener('keydown', onKey);
            if (opts.onClose) opts.onClose();
        };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        wrap.querySelector('.zp-wn-x').onclick = close;
        wrap.querySelector('.zp-wn-ok').onclick = close;
        wrap.querySelector('.zp-wn-all').addEventListener('click', () => { if (opts.onClose && !closed) { closed = true; opts.onClose(); } });
        wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
        wrap.querySelectorAll('.zp-wn-try').forEach(b => b.onclick = () => runAction(shown[+b.dataset.n].act, close));
        document.body.appendChild(wrap);
        setTimeout(() => { const ok = wrap.querySelector('.zp-wn-ok'); if (ok) ok.focus(); }, 50);
        return close;
    }

    /* ───────────── welcome tour ───────────── */
    const TOUR = [
        { icon: '👋', title: 'Welcome to Zelpophai AI', text: 'Ask anything in the box at the bottom — in your own words, any language. Answers search the web when they need to.', target: 'user-input' },
        { icon: '🎨', title: 'Just ask for things', text: 'Say "make a picture of…", "make a video of…", "make me a PDF about…" or "remind me Friday at 9…" and it happens right in the chat.', target: 'user-input' },
        { icon: '🧰', title: 'Your tools', text: 'Files, Memory, Knowledge, Reminders and Coding AGT. live at the top of the sidebar. Your chats are saved underneath.', target: 'sidebar-tools' },
        { icon: '📲', title: 'Take it with you', text: 'Get the Windows or Android app from the phone icon in the sidebar, and invite 5 friends to unlock free Pro.', target: 'get-app-btn' },
    ];
    function showTour(onDone) {
        document.querySelectorAll('.zp-tour').forEach(e => e.remove());
        const wrap = document.createElement('div');
        wrap.className = 'zp-tour';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-label', 'Welcome tour');
        wrap.innerHTML = `<div class="zp-tour-ring"></div><div class="zp-tour-card">
            <div class="zp-tour-ic"></div><h3></h3><p></p>
            <div class="zp-tour-dots">${TOUR.map(() => '<i></i>').join('')}</div>
            <div class="zp-tour-btns"><button type="button" class="zp-tour-skip">Skip</button><button type="button" class="zp-tour-next">Next</button></div></div>`;
        document.body.appendChild(wrap);
        const ring = wrap.querySelector('.zp-tour-ring');
        let step = 0;
        const finish = () => { wrap.remove(); window.removeEventListener('resize', place); if (onDone) onDone(); };
        function place() {
            const t = $(TOUR[step].target);
            const r = t && visible(t) ? t.getBoundingClientRect() : null;
            if (!r || r.width < 4 || r.right < 0 || r.left > innerWidth) { ring.style.display = 'none'; return; }
            ring.style.display = 'block';
            ring.style.left = (r.left - 6) + 'px'; ring.style.top = (r.top - 6) + 'px';
            ring.style.width = (r.width + 12) + 'px'; ring.style.height = (r.height + 12) + 'px';
        }
        function render() {
            const s = TOUR[step];
            wrap.querySelector('.zp-tour-ic').textContent = s.icon;
            wrap.querySelector('h3').textContent = s.title;
            wrap.querySelector('p').textContent = s.text;
            wrap.querySelectorAll('.zp-tour-dots i').forEach((d, i) => d.classList.toggle('on', i === step));
            wrap.querySelector('.zp-tour-next').textContent = step === TOUR.length - 1 ? "Let's go" : 'Next';
            place();
        }
        wrap.querySelector('.zp-tour-skip').onclick = finish;
        wrap.querySelector('.zp-tour-next').onclick = () => { if (step < TOUR.length - 1) { step++; render(); } else finish(); };
        window.addEventListener('resize', place);
        render();
        setTimeout(() => wrap.querySelector('.zp-tour-next').focus(), 50);
    }

    /* ───────────── sidebar icon ───────────── */
    function setupIcon(user, version, openFn) {
        const btn = $('whatsnew-btn');
        if (!btn) return;
        const key = 'zp_wn_opened_' + (user && user.id);
        const dot = $('whatsnew-dot');
        const refresh = () => { if (dot) dot.style.display = store.get(key) === version ? 'none' : 'block'; };
        refresh();
        btn.addEventListener('click', () => { store.set(key, version); refresh(); openFn(); });
        return () => { store.set(key, version); refresh(); };
    }

    /* ───────────── deep links: /app?ask=… /app?do=invite ───────────── */
    function deepLinks() {
        // "Continue this chat" from a shared page, after logging in / signing up.
        const pending = store.get('zp_continue_share');
        if (pending) {
            try { localStorage.removeItem('zp_continue_share'); } catch (e) {}
            api('/api/s/' + encodeURIComponent(pending) + '/continue', { method: 'POST' })
                .then(d => { if (d && d.link_id) location.href = '/app/c/' + encodeURIComponent(d.link_id); })
                .catch(() => {});
        }
        // "Try this yourself" on the welcome page: fill in that example prompt.
        const pendingAsk = store.get('zp_pending_ask');
        if (pendingAsk) {
            try { localStorage.removeItem('zp_pending_ask'); } catch (e) {}
            setTimeout(() => runAction({ ask: String(pendingAsk).slice(0, 300) }), 900);
        }
        const q = new URLSearchParams(location.search);
        const ask = q.get('ask'), doIt = q.get('do');
        if (!ask && !doIt) return;
        setTimeout(() => {
            if (ask) runAction({ ask: ask.slice(0, 300) });
            if (doIt === 'invite') runAction({ click: 'invite-btn' });
            if (doIt === 'tour') showTour();
        }, 900);
        q.delete('ask'); q.delete('do');
        history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
    }

    /* ───────────── init (called from app.js) ───────────── */
    async function init(opts) {
        const user = opts.user || {};
        const staffView = !!opts.staffView;
        deepLinks();
        let data;
        try { data = await api('/api/changelog'); } catch (e) { return; }
        const version = data.version || '';
        const userList = data.user_changes || data.changes || [];
        let list = staffView ? (data.staff_changes || userList) : userList;
        const chgKey = 'zenith_chgcnt_' + user.username;
        if (!data.authed) {
            const seen = parseInt(store.get(chgKey) || '0', 10);
            list = list.length > seen ? list.slice(0, list.length - seen) : [];
        }
        const markSeen = () => {
            if (data.authed) api('/api/changelog/seen', { method: 'POST', body: JSON.stringify({ list: staffView ? 'staff' : 'user' }) }).catch(() => {});
            else store.set(chgKey, String((staffView ? (data.staff_changes || userList) : userList).length));
        };
        // Cards show user-facing entries only; staff extras are counted.
        const cards = list.filter(e => userList.indexOf(e) !== -1);
        const staffExtra = list.length - cards.length;

        const latest = async () => {
            try {
                const all = await api('/api/changelog/all');
                const rel = (all.releases || [])[0];
                if (rel) showPopup(rel.items, { version: rel.version || version });
            } catch (e) { location.href = '/whats-new'; }
        };
        const iconSeen = setupIcon(user, version, latest);

        const tourKey = 'zp_tour_done_' + (user.id || user.username);
        const created = user.created_at ? Date.parse(user.created_at + (/[zZ]|[+-]\d\d:?\d\d$/.test(user.created_at) ? '' : 'Z')) : 0;
        const isGuest = String(user.username || '').startsWith('guest_');
        const isNew = !store.get(tourKey) && (isGuest || (created && Date.now() - created < 2 * 864e5));
        if (isNew) {
            whenFree(() => showTour(() => { store.set(tourKey, '1'); markSeen(); if (iconSeen) iconSeen(); }));
            return;
        }
        if (!list.length) return;
        if (!cards.length) { markSeen(); return; }
        whenFree(() => showPopup(cards, { version, staffExtra, onClose: () => { markSeen(); if (iconSeen) iconSeen(); } }));
    }

    window.ZPWhatsNew = { init, showPopup, showTour, parse, whenFree, busy };
})();
