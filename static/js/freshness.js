// Keeps open pages on the latest website.
//
// Two different things can leave someone on an old copy:
//   1. They keep the page open for days (the Windows app lives in the tray, the
//      Android app keeps the same page). A release lands while they're looking
//      at it.
//   2. They open the app and the *offline backup copy* answers instead of the
//      server — after a network hiccup, say. The page is old from its very
//      first moment, and nothing ever changes while it's open.
//
// Case 2 used to go unnoticed for ever. Now every page carries a stamp of the
// version it was built from (<meta name="zp-build">), so the first check
// catches it.
//
// When an update is found:
//   - a hidden window (tray / background tab) refreshes silently;
//   - a visible window shows a small bar, and refreshes by itself the next time
//     it's hidden, unless you're in the middle of something.
//
// "Update" doesn't just reload: it throws away the offline backup copy first,
// because a plain reload can be answered by that same stale copy.
(function () {
    'use strict';
    if (window.__zpFresh) return;
    window.__zpFresh = true;

    var base = null, pending = false, lastCheck = 0, bar = null, updating = false;

    // The version this page was actually built from, stamped in by the server.
    try {
        var m = document.querySelector('meta[name="zp-build"]');
        if (m && m.content && m.content.indexOf('|') > 0) base = m.content.trim();
    } catch (e) {}

    function busy() {
        if (typeof window.zpBusy === 'function') { try { if (window.zpBusy()) return true; } catch (e) {} }
        if (document.querySelector('.streaming-cursor, .zp-vjob, .working .spin')) return true;
        var a = document.activeElement;
        if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /text|search|email|url/.test(a.type))) && String(a.value || '').trim()) return true;
        var inp = document.getElementById('user-input') || document.getElementById('input');
        if (inp && String(inp.value || '').trim()) return true;
        return false;
    }

    // A plain reload can be answered by the offline backup copy, which is the
    // very thing that's out of date. Clear it first, then reload from the server.
    async function hardReload() {
        if (updating) return;
        updating = true;
        try { sessionStorage.setItem('zp_fresh_reloaded', String(Date.now())); } catch (e) {}
        try {
            if (window.caches && caches.keys) {
                var keys = await caches.keys();
                await Promise.all(keys.map(function (k) { return caches.delete(k); }));
            }
        } catch (e) {}
        try {
            if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
                var regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map(function (r) { return r.update().catch(function () {}); }));
            }
        } catch (e) {}
        // A fresh address stops the browser answering from its own memory too.
        try {
            var u = new URL(location.href);
            u.searchParams.set('v', String(Date.now()));
            location.replace(u.toString());
            return;
        } catch (e) {}
        location.reload();
    }

    function showBar() {
        if (bar) return;
        bar = document.createElement('div');
        bar.id = 'zp-fresh';
        bar.setAttribute('role', 'status');
        bar.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:10px;' +
            'padding:10px 12px 10px 16px;border-radius:14px;background:#111a3d;color:#e8edfb;border:1px solid rgba(96,165,250,.45);box-shadow:0 14px 40px rgba(0,0,0,.45);' +
            'font:600 13.5px Inter,system-ui,-apple-system,"Segoe UI",sans-serif;max-width:calc(100vw - 24px);box-sizing:border-box';
        bar.innerHTML = '<span data-t style="flex:1;min-width:0">✨ A new version of Zelpophai is ready</span>' +
            '<button type="button" data-r style="flex:none;border:0;border-radius:10px;padding:7px 14px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;font:700 13px inherit;cursor:pointer">Update</button>' +
            '<button type="button" data-x aria-label="Not now" title="Not now" style="flex:none;border:0;background:transparent;color:#94a3c7;font-size:16px;cursor:pointer;padding:2px 6px">✕</button>';
        bar.querySelector('[data-r]').onclick = function () {
            bar.querySelector('[data-t]').textContent = 'Updating…';
            bar.querySelector('[data-r]').disabled = true;
            hardReload();
        };
        bar.querySelector('[data-x]').onclick = function () { bar.remove(); bar = null; };
        document.body.appendChild(bar);
        // Narrow phones: let the text wrap onto its own line instead of squashing.
        if (window.innerWidth < 420) {
            bar.style.left = '12px';
            bar.style.right = '12px';
            bar.style.transform = 'none';
            bar.style.flexWrap = 'wrap';
        }
    }

    function onNewVersion() {
        pending = true;
        if (document.hidden && !busy()) { hardReload(); return; }
        showBar();
    }

    async function check(force) {
        var now = Date.now();
        if (!force && now - lastCheck < 60 * 1000) return;
        lastCheck = now;
        try {
            var r = await fetch('/api/version', { cache: 'no-store', credentials: 'same-origin' });
            if (!r.ok) return;
            var d = await r.json();
            var v = d.version + '|' + d.build;
            if (base === null) { base = v; return; }   // no stamp on this page: fall back to watching for a change
            if (v !== base) onNewVersion();
        } catch (e) { /* offline: try again later */ }
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) { if (pending && !busy()) hardReload(); }
        else check(false);
    });
    window.addEventListener('focus', function () { check(false); });
    window.addEventListener('online', function () { check(true); });
    setInterval(function () { check(true); }, 10 * 60 * 1000);
    check(true);
})();
