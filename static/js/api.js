const $ = id => document.getElementById(id);

// Canonical showToast — loaded on every page via api.js (single source of truth).
// Reuses an existing #toast element (app) or builds its own container (vault).
/* =====================================================================
   Notifications ("toasts")
   A notification drops in from the top like a phone alert, stays for a few
   seconds (hover pauses it), then folds itself into a small circle that
   parks in the top-right corner. Tap a circle to read it again; circles fade
   away on their own after a while. Same showToast(msg, type) API as before,
   so all ~200 existing calls get the new behaviour for free.
   type: '' (info) | 'success' | 'error' | 'warn'
   ===================================================================== */
const ZPN = {
    styled: false,
    SHOW_MS: 3800,
    ERROR_SHOW_MS: 6000,
    DOCK_MS: 9000,
    MAX_DOCK: 5,
    icons: {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 7v6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>',
        warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 7v6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 11v6"/><circle cx="12" cy="7.5" r=".6" fill="currentColor"/></svg>',
    },
    style() {
        if (this.styled) return;
        this.styled = true;
        const css = `
#zpn-stage{position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:10050;display:flex;flex-direction:column;align-items:center;gap:8px;padding-top:14px;pointer-events:none;width:min(440px,calc(100vw - 24px))}
#zpn-dock{position:fixed;top:14px;right:14px;z-index:10049;display:flex;flex-direction:column;align-items:flex-end;gap:10px;pointer-events:none}
.zpn{--c:#60A5FA;pointer-events:auto;position:relative;display:flex;align-items:center;gap:11px;box-sizing:border-box;width:100%;max-width:440px;min-height:48px;padding:11px 14px 11px 12px;border-radius:16px;background:rgba(17,19,24,.94);color:#f2f4f8;border:1px solid color-mix(in srgb,var(--c) 55%,transparent);box-shadow:0 14px 40px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.03),0 0 24px color-mix(in srgb,var(--c) 22%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);font:500 13.5px/1.4 Inter,system-ui,-apple-system,sans-serif;cursor:default;overflow:hidden;transform:translateY(-140%);opacity:0;transition:transform .5s cubic-bezier(.2,1.25,.35,1),opacity .3s ease,width .42s cubic-bezier(.4,0,.2,1),max-width .42s cubic-bezier(.4,0,.2,1),min-height .42s ease,height .42s ease,padding .42s ease,border-radius .42s ease,box-shadow .3s ease}
.zpn.in{transform:none;opacity:1}
.zpn .zpn-ic{flex:0 0 26px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--c) 20%,transparent);color:var(--c)}
.zpn .zpn-ic svg{width:16px;height:16px}
.zpn .zpn-msg{flex:1;min-width:0;word-wrap:break-word;transition:opacity .2s ease}
.zpn .zpn-x{flex:0 0 auto;background:none;border:none;color:rgba(255,255,255,.45);font-size:18px;line-height:1;cursor:pointer;padding:2px 4px;border-radius:6px;transition:opacity .2s}
.zpn .zpn-x:hover{color:#fff;background:rgba(255,255,255,.08)}
.zpn .zpn-bar{position:absolute;left:0;bottom:0;height:2px;width:100%;background:var(--c);opacity:.7;transform-origin:left;animation:zpnbar linear forwards}
.zpn:hover .zpn-bar{animation-play-state:paused}
@keyframes zpnbar{from{transform:scaleX(1)}to{transform:scaleX(0)}}
.zpn.folding .zpn-msg,.zpn.folding .zpn-x,.zpn.folding .zpn-bar{opacity:0}
.zpn.folding{width:48px;max-width:48px;min-height:48px;height:48px;padding:11px;border-radius:50%;gap:0}
.zpn.dot{overflow:visible;transform:none;opacity:1;width:46px;max-width:46px;min-height:46px;height:46px;padding:10px;border-radius:50%;gap:0;cursor:pointer;transition:transform .45s cubic-bezier(.2,1.2,.35,1),opacity .3s ease,box-shadow .2s ease}
.zpn.dot .zpn-msg,.zpn.dot .zpn-x,.zpn.dot .zpn-bar{display:none}
.zpn.dot:hover{box-shadow:0 10px 30px rgba(0,0,0,.45),0 0 26px color-mix(in srgb,var(--c) 45%,transparent)}
.zpn.dot::after{content:"";position:absolute;inset:3px;border-radius:50%;border:2px solid var(--c);opacity:.55;animation:zpnring var(--life,9s) linear forwards}
@keyframes zpnring{from{clip-path:inset(0 0 0 0)}to{clip-path:inset(0 0 100% 0);opacity:.15}}
.zpn.dot.pop{animation:zpnpop .35s cubic-bezier(.2,1.4,.4,1)}
@keyframes zpnpop{0%{transform:scale(.4)}100%{transform:scale(1)}}
.zpn.out{opacity:0!important;transform:scale(.6)!important}
.zpn-peek{position:absolute;top:0;right:56px;width:max-content;max-width:min(320px,70vw);padding:10px 13px;border-radius:12px;background:rgba(17,19,24,.96);color:#f2f4f8;border:1px solid color-mix(in srgb,var(--c) 50%,transparent);box-shadow:0 12px 30px rgba(0,0,0,.45);font:500 13px/1.4 Inter,system-ui,sans-serif;pointer-events:auto;animation:zpnpeek .25s ease}
@keyframes zpnpeek{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:none}}
.zpn.success{--c:#4ADE80}.zpn.error{--c:#F87171}.zpn.warn{--c:#FBBF24}
@media (max-width:600px){#zpn-stage{padding-top:10px}#zpn-dock{top:64px;right:10px}}
@media (prefers-reduced-motion:reduce){.zpn,.zpn.dot{transition:opacity .2s ease!important}.zpn .zpn-bar,.zpn.dot::after{animation:none}}
html.halloween .zpn{background:linear-gradient(180deg,rgba(24,14,24,.95),rgba(14,9,17,.96));color:#f7ede4}
html.halloween .zpn:not(.success):not(.error):not(.warn){--c:#ff8a2a}
html.halloween .zpn:not(.success):not(.error):not(.warn) .zpn-ic{background:url("/static/img/halloween/pumpkin.svg") no-repeat center/contain;color:transparent}
html.halloween .zpn:not(.success):not(.error):not(.warn) .zpn-ic svg{display:none}
html.halloween .zpn-peek{background:rgba(20,12,22,.97);color:#f7ede4}
`;
        const st = document.createElement('style');
        st.id = 'zpn-style';
        st.textContent = css;
        document.head.appendChild(st);
    },
    holder(id) {
        let el = document.getElementById(id);
        if (!el) { el = document.createElement('div'); el.id = id; document.body.appendChild(el); }
        return el;
    },
    show(msg, type) {
        if (!document.body) { document.addEventListener('DOMContentLoaded', () => this.show(msg, type)); return; }
        this.style();
        type = ['success', 'error', 'warn'].includes(type) ? type : '';
        const stage = this.holder('zpn-stage');
        // the same message twice in a row just restarts the timer
        const last = stage.lastElementChild;
        if (last && last._msg === String(msg) && !last.classList.contains('folding')) { last._restart(); return last; }
        while (stage.children.length >= 3) this.toDock(stage.firstElementChild);
        const n = document.createElement('div');
        n.className = 'zpn ' + type;
        n.setAttribute('role', type === 'error' ? 'alert' : 'status');
        n._msg = String(msg);
        n._type = type;
        n.innerHTML = `<span class="zpn-ic">${this.icons[type || 'info']}</span><span class="zpn-msg"></span><button class="zpn-x" aria-label="Dismiss">×</button><span class="zpn-bar"></span>`;
        n.querySelector('.zpn-msg').textContent = String(msg);
        const showMs = type === 'error' ? this.ERROR_SHOW_MS : this.SHOW_MS;
        let timer = null, left = showMs, started = 0;
        const bar = n.querySelector('.zpn-bar');
        const arm = () => { started = Date.now(); clearTimeout(timer); timer = setTimeout(() => this.toDock(n), left); };
        n._restart = () => { left = showMs; bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; bar.style.animationDuration = showMs + 'ms'; arm(); };
        bar.style.animationDuration = showMs + 'ms';
        n.addEventListener('mouseenter', () => { if (n.classList.contains('dot')) return; clearTimeout(timer); left -= Date.now() - started; });
        n.addEventListener('mouseleave', () => { if (n.classList.contains('dot')) return; arm(); });
        n.querySelector('.zpn-x').addEventListener('click', (e) => { e.stopPropagation(); clearTimeout(timer); this.remove(n); });
        n._clear = () => clearTimeout(timer);
        stage.appendChild(n);
        requestAnimationFrame(() => requestAnimationFrame(() => n.classList.add('in')));
        arm();
        return n;
    },
    /* fold the card into a circle where it is, then glide it into the corner dock */
    toDock(n) {
        if (!n || n._docking) return;
        n._docking = true;
        if (n._clear) n._clear();
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        n.classList.add('folding');
        setTimeout(() => {
            const from = n.getBoundingClientRect();
            const dock = this.holder('zpn-dock');
            while (dock.children.length >= this.MAX_DOCK) this.remove(dock.lastElementChild, true);
            n.classList.remove('folding', 'in');
            n.classList.add('dot');
            n.style.setProperty('--life', this.DOCK_MS + 'ms');
            n.title = n._msg;
            dock.insertBefore(n, dock.firstChild);
            const to = n.getBoundingClientRect();
            if (!reduce) {
                n.style.transition = 'none';
                n.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px)`;
                void n.offsetWidth;
                n.style.transition = '';
                n.style.transform = '';
            }
            n.style.opacity = '1';
            n.onclick = () => this.peek(n);
            n._life = setTimeout(() => this.remove(n), this.DOCK_MS);
        }, reduce ? 0 : 430);
    },
    /* tap a circle to read the message again */
    peek(n) {
        const old = n.querySelector('.zpn-peek');
        if (old) { old.remove(); return; }
        document.querySelectorAll('#zpn-dock .zpn-peek').forEach(p => p.remove());
        const p = document.createElement('div');
        p.className = 'zpn-peek';
        p.textContent = n._msg;
        n.appendChild(p);
        clearTimeout(n._life);
        n._life = setTimeout(() => this.remove(n), 5000);
    },
    remove(n, instant) {
        if (!n || !n.parentNode) return;
        if (n._clear) n._clear();
        clearTimeout(n._life);
        if (instant) { n.remove(); return; }
        n.classList.add('out');
        setTimeout(() => n.remove(), 320);
    },
};

function showToast(msg, type = '') {
    // the old fixed #toast box is retired; keep it hidden if a page still has it
    const legacy = document.getElementById('toast');
    if (legacy) legacy.style.display = 'none';
    return ZPN.show(msg, type);
}
window.showToast = showToast;
window.ZPN = ZPN;

function showLimitPopup(detail) {
    const d = String(detail || '');
    if (window.__limitPopupOpen) return;
    window.__limitPopupOpen = true;
    window.__modalOpen = true;

    // Parse any countdown in the message ("wait 5m 30s" / "30 minute pause")
    let secs = 0;
    let m = d.match(/wait\s+(\d+)m\s*(\d+)s/i);
    if (m) secs = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    else {
        m = d.match(/(\d+)\s*minute\s*pause/);
        if (m) secs = parseInt(m[1], 10) * 60;
    }
    const isGuest = /guest/i.test(d);
    const main = isGuest
        ? { label: 'Create a free account', id: 'limit-popup-login', onClick: async () => {
            // A guest's cookie is still valid, so they are logged out first (after a warning)
            // and land on the sign-up page instead of bouncing straight back in.
            let ok = true;
            if (typeof showConfirm === 'function') {
                try { ok = await showConfirm('End guest session?', 'Logging out deletes this guest account and its messages for good. Continue?', false); } catch (e) { ok = true; }
                if (!ok) return;
            }
            try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
            window.location.replace('/');
        } }
        : { label: 'See plans', id: 'limit-popup-upgrade', onClick: async () => {
            try {
                if (typeof Billing !== 'undefined' && typeof Billing.showUpgrade === 'function') await Billing.showUpgrade('Unlock more on Zelpophai AI');
                else if (window.Billing && typeof window.Billing.showUpgrade === 'function') await window.Billing.showUpgrade('Unlock more on Zelpophai AI');
                else window.location.href = '/';
            } catch (e) { window.location.href = '/'; }
        } };
    const pop = window.ZPop.show({
        id: 'limit-popup', tone: 'warn', icon: 'hourglass', badge: 'Limit reached', z: 999999,
        title: isGuest ? 'You\'ve reached the guest limit' : 'You\'ve reached today\'s limit',
        text: d,
        countdown: secs ? { seconds: secs, label: 'until you can send again', doneText: 'You\'re good to go' } : null,
        actions: [main, { label: secs ? 'I\'ll wait' : 'Close', kind: 'link', id: 'limit-popup-close' }],
        onClose: () => { window.__limitPopupOpen = false; window.__modalOpen = false; },
    });
    return pop.el;
}

function showEmergencyPopup(type) {
    const C = {
        'maintenance': ['wrench', 'warn', 'Maintenance has started', 'Zelpophai is paused for some work. Everyone is signed out until it\'s done.'],
        'lock-all': ['lock', 'danger', 'All accounts are locked', 'Everyone is signed out until the Owner unlocks Zelpophai.'],
        'unlock-all': ['unlock', 'good', 'Accounts are unlocked', 'The Owner has unlocked Zelpophai. You can carry on as normal.'],
        'force-logout': ['logout', 'danger', 'You\'ve been signed out', 'The Owner signed everyone out on every device. Log in again to continue.'],
        'registrations': ['userx', 'warn', 'Sign-ups are closed', 'New accounts can\'t be created for now. Nothing changes for you.'],
        'messaging': ['chatoff', 'warn', 'Messaging is paused', 'Sending messages is switched off for now. It will be back soon.'],
        'ai': ['bot', 'warn', 'AI replies are paused', 'The AI won\'t answer for now. It will be back soon.'],
        'maintenance-off': ['check', 'good', 'Maintenance is finished', 'Zelpophai is fully back. Thanks for waiting.'],
        'registrations-on': ['check', 'good', 'Sign-ups are open', 'New accounts can be created again.'],
        'messaging-on': ['check', 'good', 'Messaging is back', 'You can send messages again.'],
        'ai-on': ['check', 'good', 'AI replies are back', 'The AI is answering again.'],
    };
    const c = C[type] || ['alert', 'danger', 'System notice', 'The Owner changed something on Zelpophai.'];
    const pop = window.ZPop.show({
        id: 'emergency-popup-' + (type || 'alert'), tone: c[1], icon: c[0], badge: 'From the Owner', z: 99999,
        title: c[2], text: c[3],
        actions: [{ label: type === 'force-logout' ? 'Log in again' : 'Got it', onClick: () => { if (type === 'force-logout') window.location.href = '/'; } }],
        metaHtml: 'Sent by <b>WANZU-IBRAHIM</b> · The Owner',
    });
    return pop.el;
}

async function api(path, opts = {}) {
    // Vault unlock token (issued after a correct PIN) is kept per-tab and sent on
    // every request so vault-only admin endpoints can verify the unlock.
    let vaultToken = '';
    try { vaultToken = sessionStorage.getItem('zenith_vault_token') || ''; } catch (e) {}
    const res = await fetch(path, {
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            ...(vaultToken ? { 'X-Vault-Token': vaultToken } : {}),
            ...(opts.headers || {}),
        },
        ...opts,
    });
    let data;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { if (res.status === 401) throw new Error('Not authenticated'); throw new Error(text.slice(0, 300) || 'Request failed'); }
    if (!res.ok) throw new Error(data.detail || (res.status === 401 ? 'Not authenticated' : 'Request failed'));
    return data;
}
