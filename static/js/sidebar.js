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

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
