const $ = id => document.getElementById(id);

let toastTimer;
function showToast(msg, type = '') {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'toast show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
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
