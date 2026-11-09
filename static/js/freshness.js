// Keeps open pages on the latest website. The Windows and Android apps keep the
// same page open for days (the Windows app lives in the tray), so without this
// they'd keep showing an old design until restarted. When the site is updated:
// - a hidden window (tray / background tab) refreshes silently;
// - a visible window shows a small "Refresh" bar, and refreshes by itself the
//   next time it's hidden, unless you're in the middle of something.
(function () {
    'use strict';
    if (window.__zpFresh) return;
    window.__zpFresh = true;
    let base = null, pending = false, lastCheck = 0, bar = null;

    function busy() {
        if (typeof window.zpBusy === 'function') { try { if (window.zpBusy()) return true; } catch (e) {} }
        if (document.querySelector('.streaming-cursor, .zp-vjob, .working .spin')) return true;
        const a = document.activeElement;
        if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /text|search|email|url/.test(a.type))) && String(a.value || '').trim()) return true;
        const inp = document.getElementById('user-input') || document.getElementById('input');
        if (inp && String(inp.value || '').trim()) return true;
        return false;
    }

    function reload() {
        try { sessionStorage.setItem('zp_fresh_reloaded', String(Date.now())); } catch (e) {}
        location.reload();
    }

    function showBar() {
        if (bar) return;
        bar = document.createElement('div');
        bar.setAttribute('role', 'status');
        bar.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:12px;' +
            'padding:10px 12px 10px 16px;border-radius:14px;background:#111a3d;color:#e8edfb;border:1px solid rgba(96,165,250,.45);box-shadow:0 14px 40px rgba(0,0,0,.45);' +
            'font:600 13.5px Inter,system-ui,-apple-system,"Segoe UI",sans-serif;max-width:calc(100vw - 32px)';
        bar.innerHTML = '<span>✨ Zelpophai was updated</span>' +
            '<button type="button" data-r style="border:0;border-radius:10px;padding:7px 14px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;font:700 13px inherit;cursor:pointer">Refresh</button>' +
            '<button type="button" data-x aria-label="Later" style="border:0;background:transparent;color:#94a3c7;font-size:16px;cursor:pointer;padding:2px 6px">✕</button>';
        bar.querySelector('[data-r]').onclick = reload;
        bar.querySelector('[data-x]').onclick = () => { bar.remove(); bar = null; };
        document.body.appendChild(bar);
    }

    function onNewVersion() {
        pending = true;
        if (document.hidden && !busy()) { reload(); return; }
        showBar();
    }

    async function check(force) {
        const now = Date.now();
        if (!force && now - lastCheck < 60 * 1000) return;
        lastCheck = now;
        try {
            const r = await fetch('/api/version', { cache: 'no-store', credentials: 'same-origin' });
            if (!r.ok) return;
            const d = await r.json();
            const v = d.version + '|' + d.build;
            if (base === null) { base = v; return; }
            if (v !== base) onNewVersion();
        } catch (e) { /* offline: try again later */ }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { if (pending && !busy()) reload(); }
        else check(false);
    });
    window.addEventListener('focus', () => check(false));
    window.addEventListener('online', () => check(true));
    setInterval(() => check(true), 10 * 60 * 1000);
    check(true);
})();
