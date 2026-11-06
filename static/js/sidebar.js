/* Zelpophai AI — sidebar helpers.
   The row of icons under the chats has no words, so each icon gets a small
   tooltip (and an accessible name). Badges that say "0" are hidden; real
   counts show as a dot on the icon. */
(function () {
    'use strict';
    function $(id) { return document.getElementById(id); }

    function label(btn) {
        var t = btn.getAttribute('title') || (btn.textContent || '').trim();
        if (!t) return;
        if (btn.id === 'admin-panel-btn') t = (btn.textContent || '').trim() || t;
        btn.setAttribute('data-tip', t);
        if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', t);
    }

    function syncBadges() {
        ['feedback-badge', 'request-badge', 'live-chat-badge'].forEach(function (id) {
            var b = $(id);
            if (b && b.style.display !== 'none' && (b.textContent || '').trim() === '0') b.style.display = 'none';
        });
    }

    function init() {
        var row = $('sb-icons');
        if (!row) return;
        var all = function () { Array.prototype.forEach.call(row.querySelectorAll('button'), label); };
        all();
        // Staff buttons (Owner Vault, new-password notice) are added later by app.js.
        if (window.MutationObserver) {
            new MutationObserver(all).observe(row, { childList: true });
            var mo = new MutationObserver(syncBadges);
            ['feedback-badge', 'request-badge', 'live-chat-badge'].forEach(function (id) {
                var b = $(id); if (b) mo.observe(b, { attributes: true, attributeFilter: ['style'], childList: true, characterData: true, subtree: true });
            });
        }
        syncBadges();
    }

    // Inside the Zelpophai apps: hide "Get the app", and on Android offer updates.
    function appExtras() {
        const m = /Zelpophai(Desktop|Android)\/([\d.]+)/.exec(navigator.userAgent);
        if (!m) return;
        const btn = $('get-app-btn'); if (btn) btn.style.display = 'none';
        if (m[1] !== 'Android') return;
        const mine = m[2];
        const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
        fetch('/api/app/latest', { cache: 'no-store' }).then(r => r.json()).then(r => {
            const a = r && r.android;
            if (!a || !a.version || !newer(a.version, mine)) return;
            try { if (sessionStorage.getItem('zp_upd_later') === a.version) return; } catch (e) {}
            const ov = document.createElement('div');
            ov.className = 'zp-tagpop';
            ov.innerHTML = `<div class="zp-tagpop-card"><div class="zp-tagpop-ic">⬆️</div><div class="zp-tagpop-tag" style="color:#93c5fd;background:rgba(59,130,246,.16)">UPDATE</div>
                <h3>Zelpophai AI ${a.version} is ready</h3><p></p>
                <div style="display:flex;gap:8px;justify-content:center"><button type="button" data-later style="background:rgba(255,255,255,.08)">Later</button><button type="button" data-go>Install update</button></div></div>`;
            ov.querySelector('p').textContent = (a.notes || 'A new version of the app is available.') + ' You\'re on ' + mine + '.';
            ov.querySelector('[data-later]').onclick = () => { try { sessionStorage.setItem('zp_upd_later', a.version); } catch (e) {} ov.remove(); };
            ov.querySelector('[data-go]').onclick = () => { location.href = a.url; ov.remove(); };
            document.body.appendChild(ov);
        }).catch(() => {});
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { init(); appExtras(); });
    else { init(); appExtras(); }
})();
