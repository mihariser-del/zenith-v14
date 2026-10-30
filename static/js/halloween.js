/* =====================================================================
   Zelpophai AI — Halloween seasonal theme controller
   - Decides whether the theme is on: Settings → Appearance → "Seasonal theme"
     (auto = Oct 15 – Nov 2 on the visitor's own clock, or always on / off).
   - Adds the "halloween" class to <html>, loads the Playfair Display / Cinzel Decorative headline fonts,
     injects the ambient layer (cobwebs, dangling spider, fog, the odd bat),
     and swaps the welcome greeting text.
   The early class toggle also lives inline in app.html's <head> so there is
   no flash of the normal theme while the page loads.
   ===================================================================== */
(function () {
    'use strict';

    function seasonalChoice() {
        try {
            return JSON.parse(localStorage.getItem('zenith_settings') || '{}').seasonal || 'auto';
        } catch (e) { return 'auto'; }
    }
    function inSeason(d) {
        d = d || new Date();
        var m = d.getMonth(), day = d.getDate();       // Oct = 9, Nov = 10
        return (m === 9 && day >= 15) || (m === 10 && day <= 2);
    }
    function shouldBeOn(choice) {
        choice = choice || seasonalChoice();
        return choice === 'on' || (choice === 'auto' && inSeason());
    }

    var batTimer = null;

    function loadFont() {
        if (document.getElementById('hw-font')) return;
        var l = document.createElement('link');
        l.id = 'hw-font';
        l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Cinzel+Decorative:wght@700;900&display=swap';
        document.head.appendChild(l);
    }

    function buildFx() {
        if (document.getElementById('hw-fx') || !document.body) return;
        var fx = document.createElement('div');
        fx.id = 'hw-fx';
        fx.setAttribute('aria-hidden', 'true');
        fx.innerHTML = '<div class="hw-art hw-sky"></div><div class="hw-art hw-left"></div><div class="hw-art hw-right"></div>' +
                       '<div class="hw-web r"></div><div class="hw-web l"></div>' +
                       '<div class="hw-spider"></div><div class="hw-fog"></div>';
        document.body.appendChild(fx);
        scheduleBat();
    }

    function launchBat() {
        var fx = document.getElementById('hw-fx');
        if (!fx || document.hidden) return;
        var b = document.createElement('div');
        b.className = 'hw-bat';
        var w = window.innerWidth, h = window.innerHeight;
        var fromLeft = Math.random() < 0.5;
        var startY = h * (0.08 + Math.random() * 0.35);
        b.style.top = startY + 'px';
        b.style.left = (fromLeft ? -40 : w + 10) + 'px';
        var dx = (w + 80) * (fromLeft ? 1 : -1);
        b.style.setProperty('--hw-dx', dx + 'px');
        b.style.setProperty('--hw-dx-half', (dx / 2) + 'px');
        b.style.setProperty('--hw-dy', ((Math.random() - 0.5) * h * 0.25) + 'px');
        fx.appendChild(b);
        requestAnimationFrame(function () { b.classList.add('fly'); });
        setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 9500);
    }

    function scheduleBat() {
        clearTimeout(batTimer);
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        /* rare on purpose: one bat every 25–55 seconds */
        batTimer = setTimeout(function () {
            if (document.documentElement.classList.contains('halloween')) { launchBat(); scheduleBat(); }
        }, 25000 + Math.random() * 30000);
    }

    function teardownFx() {
        clearTimeout(batTimer);
        var fx = document.getElementById('hw-fx');
        if (fx) fx.parentNode.removeChild(fx);
    }

    /* welcome screen copy */
    function patchWelcome(root) {
        var on = document.documentElement.classList.contains('halloween');
        var wms = (root || document).querySelectorAll('.welcome-message');
        for (var i = 0; i < wms.length; i++) {
            var wm = wms[i], h2 = wm.querySelector('h2'), sub = wm.querySelector('.welcome-sub');
            if (!h2) continue;
            if (on && !wm.dataset.hw) {
                wm.dataset.hw = '1';
                wm.dataset.hwH2 = h2.innerHTML;
                if (sub) wm.dataset.hwSub = sub.textContent;
                h2.innerHTML = 'Happy Haunting! I’m <span>Zelpophai AI.</span>';
                if (sub && /help you today/i.test(sub.textContent)) sub.textContent = 'What spooky task can I help with tonight?';
            } else if (!on && wm.dataset.hw) {
                h2.innerHTML = wm.dataset.hwH2;
                if (sub && wm.dataset.hwSub) sub.textContent = wm.dataset.hwSub;
                delete wm.dataset.hw;
            }
        }
    }

    /* sidebar brand: colour the "AI" in "Zelpophai AI" */
    function patchBrand(on) {
        var h = document.querySelector('.brand h2');
        if (!h) return;
        if (on && !h.querySelector('.hw-ai') && /\sAI$/.test(h.textContent)) {
            h.dataset.hwText = h.textContent;
            h.innerHTML = h.textContent.replace(/\sAI$/, '') + ' <span class="hw-ai">AI</span>';
        } else if (!on && h.dataset.hwText) {
            h.textContent = h.dataset.hwText;
            delete h.dataset.hwText;
        }
    }

    /* landing page: add a small seasonal line under the tagline */
    function patchLanding(on) {
        var sub = document.querySelector('.landing-subtitle');
        if (!sub) return;
        var tag = sub.querySelector('.hw-tag');
        if (on && !tag) {
            tag = document.createElement('span');
            tag.className = 'hw-tag';
            tag.textContent = 'Happy Halloween';
            sub.appendChild(tag);
        } else if (!on && tag) {
            tag.parentNode.removeChild(tag);
        }
    }

    var observer = null;
    function watchWelcome() {
        if (observer || !window.MutationObserver) return;
        var target = document.getElementById('chat-container') || document.body;
        if (!target) return;
        observer = new MutationObserver(function () { patchWelcome(target); });
        observer.observe(target, { childList: true, subtree: true });
        patchWelcome(target);
    }

    function apply(choice) {
        var on = shouldBeOn(choice);
        document.documentElement.classList.toggle('halloween', on);
        if (on) {
            loadFont();
            buildFx();
            var m = document.querySelector('meta[name="theme-color"]');
            if (m) m.content = '#0c0910';
        } else {
            teardownFx();
        }
        patchWelcome();
        patchLanding(on);
        patchBrand(on);
        watchWelcome();
    }

    window.Halloween = { apply: apply, shouldBeOn: shouldBeOn, inSeason: inSeason };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { apply(); });
    else apply();
})();
