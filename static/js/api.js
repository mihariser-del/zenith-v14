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

    const wrap = document.createElement('div');
    wrap.id = 'limit-popup';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.9);backdrop-filter:blur(10px);animation:fadeIn .25s;';
    const countArea = secs
        ? `<div id="limit-popup-count" style="color:#F87171;font-size:34px;font-weight:800;letter-spacing:1px;margin-bottom:18px;">&nbsp;</div>`
        : '';
    const btnArea = isGuest
        ? `<button id="limit-popup-login" style="width:100%;padding:13px;background:linear-gradient(135deg,#22d3ee,#8b5cf6 55%,#ff3db4);background-size:180% 180%;animation:limitDrift 6s ease infinite;color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;font-size:15px;box-shadow:0 8px 26px rgba(255,61,180,.4);">Login / Register</button>`
        : `<button id="limit-popup-upgrade" style="width:100%;padding:13px;background:linear-gradient(135deg,#FFD700,#FF8C00);color:#000;border:none;border-radius:10px;font-weight:800;cursor:pointer;font-size:15px;">Upgrade for more</button>`;
    wrap.innerHTML = `
        <style>@keyframes limitDrift{0%,100%{background-position:0% 50%;}50%{background-position:100% 50%;}}</style>
        <div style="background:linear-gradient(160deg,#221418,#2a1518 50%,#1a0f12);border:2px solid #F87171;border-radius:20px;padding:40px 44px;max-width:460px;width:92%;text-align:center;box-shadow:0 0 80px rgba(248,113,113,.22),0 24px 60px rgba(0,0,0,.6);">
            <div style="font-size:60px;margin-bottom:12px;">⏳</div>
            <div style="display:inline-block;padding:4px 14px;border-radius:20px;background:rgba(248,113,113,.14);border:1px solid rgba(248,113,113,.4);font-size:10px;font-weight:700;letter-spacing:2px;color:#F87171;margin-bottom:14px;">LIMIT REACHED</div>
            <h2 style="color:#fff;font-size:22px;margin:0 0 10px;">${isGuest ? 'Guest mode limit' : 'Daily limit reached'}</h2>
            <p id="limit-popup-detail" style="color:#C0C7D1;font-size:14px;line-height:1.6;margin:0 0 14px;"></p>
            ${countArea}
            ${btnArea}
            <button id="limit-popup-close" style="margin-top:12px;background:transparent;border:none;color:#8B949E;cursor:pointer;font-size:12px;">I'll wait</button>
        </div>`;
    document.body.appendChild(wrap);
    const detailEl = wrap.querySelector('#limit-popup-detail');
    detailEl.textContent = d;
    if (secs) {
        const countEl = wrap.querySelector('#limit-popup-count');
        const endTs = Date.now() + secs * 1000;
        const tick = () => {
            const left = Math.max(0, Math.round((endTs - Date.now()) / 1000));
            if (left <= 0) { countEl.textContent = 'Resetting...'; clearInterval(wrap._t); return; }
            const mm = Math.floor(left / 60), ss = left % 60;
            countEl.textContent = (mm > 0 ? mm + 'm ' : '') + ss + 's';
        };
        tick();
        wrap._t = setInterval(tick, 1000);
    }
    const close = () => { if (wrap._t) clearInterval(wrap._t); wrap.remove(); window.__limitPopupOpen = false; window.__modalOpen = false; };
    wrap.querySelector('#limit-popup-close').addEventListener('click', close);
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    const loginBtn = wrap.querySelector('#limit-popup-login');
    if (loginBtn) loginBtn.addEventListener('click', async () => {
        // Guest clicking "Login / Register" — warn like the logout flow, then log
        // the guest out so they land on the register screen (plain /app navigation
        // would bounce them straight back in because the guest cookie is still valid).
        close();
        let ok = true;
        if (typeof showConfirm === 'function') {
            try {
                ok = await showConfirm('End guest session?', 'Using log out will permanently delete this guest account and all its messages. They cannot be recovered. Continue?', false);
            } catch (e) { ok = true; }
            if (!ok) return;
        }
        try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
        window.location.replace('/');
    });
    const upgradeBtn = wrap.querySelector('#limit-popup-upgrade');
    if (upgradeBtn) upgradeBtn.addEventListener('click', async () => {
        // Logged-in user clicking "Upgrade for more" — open the billing/pricing
        // dialog directly (falling back to the register page if the billing module
        // is unavailable) so the click never dead-ends.
        close();
        try {
            if (window.Billing && typeof window.Billing.showUpgrade === 'function') {
                await window.Billing.showUpgrade('Unlock more on Zelpophai AI');
            } else {
                window.location.href = '/';
            }
        } catch (e) { window.location.href = '/'; }
    });
    return wrap;
}

function showEmergencyPopup(type) {
    const id = 'emergency-popup-' + (type || 'alert') + '-' + Date.now();
    if (document.getElementById(id)) return;
    const configs = {
        'maintenance': { icon: '🚧', title: 'MAINTENANCE MODE', color: '#F59E0B', desc: 'The platform is now in maintenance mode. You have been signed out until maintenance is complete.' },
        'lock-all': { icon: '🔒', title: 'ALL ACCOUNTS LOCKED', color: '#EF4444', desc: 'All accounts have been locked. You have been signed out until the Owner unlocks them.' },
        'unlock-all': { icon: '🔓', title: 'ALL ACCOUNTS UNLOCKED', color: '#4ADE80', desc: 'All accounts have been unlocked by the Owner. You can log in again.' },
        'force-logout': { icon: '🔐', title: 'FORCE LOGOUT', color: '#EF4444', desc: 'All active sessions have been revoked. Please log in again.' },
        'registrations': { icon: '🛑', title: 'REGISTRATIONS CLOSED', color: '#F59E0B', desc: 'New account registrations are now disabled.' },
        'messaging': { icon: '🚫', title: 'MESSAGING DISABLED', color: '#F59E0B', desc: 'Messaging has been disabled. Users cannot send messages.' },
        'ai': { icon: '🤖', title: 'AI DISABLED', color: '#F59E0B', desc: 'AI responses have been disabled globally.' },
        'maintenance-off': { icon: '✅', title: 'MAINTENANCE OFF', color: '#4ADE80', desc: 'Maintenance mode is now off. The platform is fully available.' },
        'registrations-on': { icon: '✅', title: 'REGISTRATIONS OPEN', color: '#4ADE80', desc: 'New account registrations are now open.' },
        'messaging-on': { icon: '✅', title: 'MESSAGING ENABLED', color: '#4ADE80', desc: 'Messaging has been enabled.' },
        'ai-on': { icon: '✅', title: 'AI ENABLED', color: '#4ADE80', desc: 'AI responses have been enabled.' },
    };
    const cfg = configs[type] || { icon: '⚠️', title: 'SYSTEM ALERT', color: '#EF4444', desc: 'A system action was performed.' };
    const wrap = document.createElement('div');
    wrap.id = id;
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.92);backdrop-filter:blur(10px);animation:fadeIn .3s;';
    wrap.innerHTML = `
        <div style="background:linear-gradient(160deg,#1a1015,#2a1520 50%,#1a0a0a);border:2px solid ${cfg.color};border-radius:20px;padding:48px 56px;max-width:520px;width:92%;text-align:center;box-shadow:0 0 80px ${cfg.color}33, 0 0 160px ${cfg.color}11, 0 30px 60px rgba(0,0,0,.6);position:relative;overflow:hidden;">
            <div style="position:absolute;top:-40px;right:-40px;width:120px;height:120px;border-radius:50%;background:${cfg.color}08;filter:blur(30px);"></div>
            <div style="position:absolute;bottom:-30px;left:-30px;width:100px;height:100px;border-radius:50%;background:${cfg.color}06;filter:blur(25px);"></div>
            <div style="font-size:72px;margin-bottom:16px;filter:drop-shadow(0 0 20px ${cfg.color}66);">${cfg.icon}</div>
            <div style="display:inline-block;padding:4px 14px;border-radius:20px;background:${cfg.color}22;border:1px solid ${cfg.color}44;font-size:10px;font-weight:700;color:${cfg.color};letter-spacing:2px;margin-bottom:16px;">EMERGENCY ACTION</div>
            <h2 style="color:${cfg.color};font-size:26px;margin:0 0 12px;font-weight:800;letter-spacing:1px;text-shadow:0 0 20px ${cfg.color}44;">${cfg.title}</h2>
            <p style="color:#C0C7D1;font-size:15px;line-height:1.7;margin:0 0 24px;">${cfg.desc}</p>
            <div style="font-size:11px;color:#666;margin-bottom:20px;">Initiated by <strong style="color:#C0C7D1;">WANZU-IBRAHIM</strong> — The Owner</div>
            <button onclick="this.closest('[id^=emergency-popup-]').remove()" style="background:${cfg.color};color:#fff;border:none;padding:14px 36px;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px ${cfg.color}44;transition:transform .15s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">Understood</button>
        </div>`;
    document.body.appendChild(wrap);
    return wrap;
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
