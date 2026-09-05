const $ = id => document.getElementById(id);

// Canonical showToast — loaded on every page via api.js (single source of truth).
// Reuses an existing #toast element (app) or builds its own container (vault).
function showToast(msg, type = '') {
    const existing = document.getElementById('toast');
    if (existing) {
        existing.textContent = msg;
        existing.className = 'toast show ' + type;
        clearTimeout(existing._timer);
        existing._timer = setTimeout(() => existing.classList.remove('show'), 3000);
        return;
    }
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const bg = type === 'error' ? '#EF4444' : (type === 'success' ? '#4ADE80' : '#60A5FA');
    toast.style.cssText = `padding:12px 20px;background:#111315;border:1px solid ${bg};border-radius:10px;color:#fff;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.5);animation:fadeIn .2s;max-width:350px;`;
    toast.innerHTML = `<span style="color:${bg};margin-right:6px;">●</span>${msg}`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.transition = 'opacity .3s'; toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

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
        ? `<button id="limit-popup-login" style="width:100%;padding:13px;background:linear-gradient(135deg,#DDE4EE,#8B949E);color:#111315;border:none;border-radius:10px;font-weight:800;cursor:pointer;font-size:15px;">Login / Register</button>`
        : `<button id="limit-popup-upgrade" style="width:100%;padding:13px;background:linear-gradient(135deg,#FFD700,#FF8C00);color:#000;border:none;border-radius:10px;font-weight:800;cursor:pointer;font-size:15px;">Upgrade for more</button>`;
    wrap.innerHTML = `
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
        if (wrap._t) clearInterval(wrap._t);
        wrap.remove();
        window.__limitPopupOpen = false;
        window.__modalOpen = false;
        if (typeof showConfirm === 'function') {
            const ok = await showConfirm('End guest session?', 'Using log out will permanently delete this guest account and all its messages. They cannot be recovered. Continue?', false);
            if (!ok) return;
        }
        try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
        window.location.href = '/';
    });
    const upgradeBtn = wrap.querySelector('#limit-popup-upgrade');
    if (upgradeBtn) upgradeBtn.addEventListener('click', () => {
        close();
        if (window.Billing && typeof window.Billing.showUpgrade === 'function') window.Billing.showUpgrade('Unlock more on Zenith');
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
    const res = await fetch(path, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
        ...opts,
    });
    let data;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { if (res.status === 401) throw new Error('Not authenticated'); throw new Error(text.slice(0, 300) || 'Request failed'); }
    if (!res.ok) throw new Error(data.detail || (res.status === 401 ? 'Not authenticated' : 'Request failed'));
    return data;
}
