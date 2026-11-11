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
        ['feedback-badge', 'live-chat-badge'].forEach(function (id) {
            var b = $(id);
            if (b && b.style.display !== 'none' && (b.textContent || '').trim() === '0') b.style.display = 'none';
        });
        moreDot();
    }

    // Less-used actions live in a "More" menu so the row stays calm:
    // Upgrade, (Vault), Settings, Invite, What's new, Get the app, More.
    var MORE_IDS = ['feedback-btn', 'security-btn', 'info-btn', 'clear-all-btn'];
    function buildMore(row) {
        if ($('sb-more-btn')) return;
        var more = document.createElement('button');
        more.type = 'button';
        more.className = 'btn info';
        more.id = 'sb-more-btn';
        more.title = 'More';
        more.setAttribute('aria-haspopup', 'menu');
        more.setAttribute('aria-expanded', 'false');
        more.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>More<span class="sb-more-dot" id="sb-more-dot"></span>';
        var menu = document.createElement('div');
        menu.id = 'sb-more-menu';
        menu.className = 'sb-more-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;
        MORE_IDS.forEach(function (id) {
            var b = $(id); if (!b) return;
            if (id === 'clear-all-btn') { var hr = document.createElement('div'); hr.className = 'sb-more-sep'; menu.appendChild(hr); }
            b.setAttribute('role', 'menuitem');
            menu.appendChild(b);
        });
        var toggle = $('tools-toggle');
        row.insertBefore(more, toggle || null);
        document.body.appendChild(menu);
        var place = function () {
            var r = more.getBoundingClientRect(), rr = row.getBoundingClientRect();
            menu.style.left = Math.max(8, Math.min(rr.left + 6, window.innerWidth - menu.offsetWidth - 8)) + 'px';
            menu.style.width = Math.max(220, Math.min(rr.width - 12, 280)) + 'px';
            menu.style.bottom = (window.innerHeight - r.top + 8) + 'px';
        };
        var close = function () { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); };
        more.addEventListener('click', function (e) {
            e.stopPropagation();
            if (!menu.hidden) { close(); return; }
            menu.hidden = false; more.setAttribute('aria-expanded', 'true'); place();
            var first = menu.querySelector('button'); if (first) first.focus();
        });
        menu.addEventListener('click', function (e) { if (e.target.closest('button')) setTimeout(close, 0); });
        document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target) && e.target !== more) close(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { close(); more.focus(); } });
        window.addEventListener('resize', close);
    }
    function moreDot() {
        var dot = $('sb-more-dot'); if (!dot) return;
        var on = ['feedback-badge'].some(function (id) {
            var b = $(id); return b && b.style.display !== 'none' && (b.textContent || '').trim() !== '0';
        });
        dot.style.display = on ? 'block' : 'none';
    }

    function init() {
        var row = $('sb-icons');
        if (!row) return;
        buildMore(row);
        var all = function () { Array.prototype.forEach.call(row.querySelectorAll('button'), label); };
        all();
        // Staff buttons (Owner Vault, new-password notice) are added later by app.js.
        if (window.MutationObserver) {
            new MutationObserver(all).observe(row, { childList: true });
            var mo = new MutationObserver(syncBadges);
            ['feedback-badge', 'live-chat-badge'].forEach(function (id) {
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
