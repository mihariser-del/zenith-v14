/* Zelpophai AI — tidy sidebar: everything except New Chat, your chats and
   Upgrade lives in one account menu that opens from your name at the bottom. */
(function () {
    'use strict';
    function $(id) { return document.getElementById(id); }

    function init() {
        var toggle = $('acct-toggle');
        var menu = $('acct-menu');
        if (!toggle || !menu) return;

        function isOpen() { return menu.classList.contains('open'); }
        function open() {
            menu.classList.add('open');
            toggle.setAttribute('aria-expanded', 'true');
            document.addEventListener('mousedown', outside, true);
            document.addEventListener('touchstart', outside, true);
            document.addEventListener('keydown', onKey);
            var first = menu.querySelector('button:not([style*="display: none"])');
            if (first && !('ontouchstart' in window)) first.focus({ preventScroll: true });
        }
        function close(focusBack) {
            menu.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
            document.removeEventListener('mousedown', outside, true);
            document.removeEventListener('touchstart', outside, true);
            document.removeEventListener('keydown', onKey);
            if (focusBack) toggle.focus({ preventScroll: true });
        }
        function outside(e) { if (!menu.contains(e.target) && !toggle.contains(e.target)) close(false); }
        function onKey(e) {
            if (e.key === 'Escape') { close(true); return; }
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            var items = Array.prototype.filter.call(menu.querySelectorAll('button'), function (b) { return b.offsetParent !== null; });
            var i = items.indexOf(document.activeElement);
            e.preventDefault();
            var n = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
            if (items[n]) items[n].focus();
        }

        toggle.addEventListener('click', function () { isOpen() ? close(false) : open(); });
        toggle.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isOpen() ? close(true) : open(); }
        });
        // Picking anything in the menu closes it (the item's own action still runs).
        menu.addEventListener('click', function (e) {
            if (e.target.closest('button')) setTimeout(function () { close(false); }, 0);
        });

        // Red dot on your name when something inside the menu needs attention
        // (feedback replies, personal-request replies, staff live chat).
        var badges = ['feedback-badge', 'request-badge', 'live-chat-badge'].map($).filter(Boolean);
        function syncDot() {
            var n = 0;
            badges.forEach(function (b) {
                // a badge that says "0" isn't news — hide it
                if (b.style.display !== 'none' && (b.textContent || '').trim() === '0') b.style.display = 'none';
                var btn = b.closest('button');
                if (b.style.display !== 'none' && (!btn || btn.style.display !== 'none')) n += parseInt(b.textContent, 10) || 1;
            });
            toggle.classList.toggle('has-alert', n > 0);
            toggle.setAttribute('data-alerts', n > 9 ? '9+' : String(n));
        }
        if (window.MutationObserver) {
            var mo = new MutationObserver(syncDot);
            badges.forEach(function (b) { mo.observe(b, { attributes: true, attributeFilter: ['style'], childList: true, characterData: true, subtree: true }); });
        }
        syncDot();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
