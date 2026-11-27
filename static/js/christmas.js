/* =====================================================================
   Zelpophai AI — Christmas seasonal theme controller
   - On from 1 December to 2 January, and only for people allowed to see it.
     For its first year that is the Owner, the admins and anyone tagged as a
     Friend; the Vault (System → Controls) can open it to everyone.
   - Obeys the same "Seasonal look" setting as Halloween (in season / always /
     never), and the Animations setting, and the device's reduced-motion
     preference.
   - Adds the "christmas" class to <html>, strings up fairy lights, paints the
     winter scene, and drops the odd bauble you can catch.
   The pre-paint toggle in app.html's <head> uses a flag this file caches, so
   there is no flash of the normal theme on the way in.
   ===================================================================== */
(function () {
    'use strict';

    var OK_KEY = 'zp_xmas_ok';          // cached "this person may see it"
    var SCORE_KEY = 'zp_xmas_caught';
    var FLAKES = ['❄', '❅', '❆', '•'];
    var snowTimer = null, baubleTimer = null, allowed = null;

    function store(k, v) {
        try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
    }
    function seasonalChoice() {
        try { return JSON.parse(localStorage.getItem('zenith_settings') || '{}').seasonal || 'auto'; } catch (e) { return 'auto'; }
    }
    function inSeason(d) {
        d = d || new Date();
        var m = d.getMonth(), day = d.getDate();        // Nov = 10, Dec = 11, Jan = 0
        return (m === 10 && day >= 25) || m === 11 || (m === 0 && day <= 2);
    }
    function maySee() { return allowed === null ? store(OK_KEY) === '1' : allowed; }
    function shouldBeOn(choice) {
        choice = choice || seasonalChoice();
        if (choice === 'off') return false;
        if (!maySee()) return false;
        return choice === 'on' || (choice === 'auto' && inSeason());
    }
    function quiet() {
        if (document.documentElement.classList.contains('zst-no-anim')) return true;
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    function isOn() { return document.documentElement.classList.contains('christmas'); }
    function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || ''); }
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

    function loadFont() {
        if (document.getElementById('xm-font')) return;
        var l = document.createElement('link');
        l.id = 'xm-font';
        l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&display=swap';
        document.head.appendChild(l);
    }

    /* ───────────────── the scene ───────────────── */
    function buildScene() {
        if (!document.body) return;
        if (!document.getElementById('xm-fx')) {
            var fx = document.createElement('div');
            fx.id = 'xm-fx';
            fx.setAttribute('aria-hidden', 'true');
            fx.innerHTML = '<div class="xm-sky"></div><div class="xm-hills"></div><div class="xm-trees"></div><div class="xm-drift"></div>';
            document.body.appendChild(fx);
        }
        if (!document.getElementById('xm-lights')) {
            var COLOURS = ['#ff5b52', '#ffd166', '#5ec98a', '#6fb7ff', '#f07de0'];
            var lights = document.createElement('div');
            lights.id = 'xm-lights';
            lights.setAttribute('aria-hidden', 'true');
            var html = '<div class="wire"></div>';
            // One bulb every 50px, hanging from the dip in the wire.
            var n = Math.ceil(window.innerWidth / 50) + 2;
            for (var i = 0; i < n; i++) {
                var c = COLOURS[i % COLOURS.length];
                var dip = (i % 2) ? 20 : 8;      // alternate bulbs sit lower, following the wire
                html += '<i style="left:' + (i * 50 + 12) + 'px;top:' + dip + 'px;background:' + c +
                        ';box-shadow:0 0 10px ' + c + ',0 0 18px ' + c + '66;animation-delay:' +
                        (i * 0.18).toFixed(2) + 's,' + (i * 0.3).toFixed(2) + 's"></i>';
            }
            lights.innerHTML = html;
            document.body.appendChild(lights);
        }
        startSnow();
        scheduleBauble();
    }

    function teardownScene() {
        clearInterval(snowTimer); clearTimeout(baubleTimer);
        ['xm-fx', 'xm-lights', 'xm-snow', 'xm-play', 'xm-score'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.parentNode.removeChild(el);
        });
    }

    /* ───────────────── falling snow ───────────────── */
    function snowLayer() {
        var l = document.getElementById('xm-snow');
        if (!l) { l = document.createElement('div'); l.id = 'xm-snow'; l.setAttribute('aria-hidden', 'true'); document.body.appendChild(l); }
        return l;
    }
    function flake() {
        if (document.hidden || !isOn()) return;
        var layer = snowLayer();
        if (layer.childElementCount > 70) return;       // never let it pile up
        var s = document.createElement('span');
        s.textContent = pick(FLAKES);
        var size = 8 + Math.random() * 14;
        s.style.left = (Math.random() * window.innerWidth) + 'px';
        s.style.fontSize = size.toFixed(0) + 'px';
        s.style.opacity = (0.35 + Math.random() * 0.5).toFixed(2);
        s.style.setProperty('--dx', ((Math.random() - 0.5) * 160).toFixed(0) + 'px');
        s.style.setProperty('--rot', (Math.random() * 540 - 270).toFixed(0) + 'deg');
        var secs = 7 + Math.random() * 9;               // small flakes drift slower
        s.style.animationDuration = secs.toFixed(1) + 's';
        layer.appendChild(s);
        setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, secs * 1000 + 400);
    }
    function startSnow() {
        clearInterval(snowTimer);
        if (quiet()) return;
        for (var i = 0; i < 14; i++) setTimeout(flake, i * 220);   // a few already falling
        snowTimer = setInterval(flake, 420);
    }

    /* ───────────── a bauble to catch, now and then ───────────── */
    function playLayer() {
        var l = document.getElementById('xm-play');
        if (!l) { l = document.createElement('div'); l.id = 'xm-play'; document.body.appendChild(l); }
        return l;
    }
    function sparkle(x, y, n) {
        if (quiet()) return;
        var layer = playLayer(), EM = ['✨', '❄', '🎄', '⭐', '🎁'];
        for (var i = 0; i < (n || 12); i++) {
            var c = document.createElement('span');
            c.className = 'xm-spark';
            c.textContent = pick(EM);
            var ang = Math.random() * Math.PI * 2, dist = 45 + Math.random() * 85;
            c.style.left = x + 'px'; c.style.top = y + 'px';
            c.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(0) + 'px');
            c.style.setProperty('--dy', (Math.sin(ang) * dist - 30).toFixed(0) + 'px');
            c.style.setProperty('--rot', (Math.random() * 400 - 200).toFixed(0) + 'deg');
            layer.appendChild(c);
            (function (el) { setTimeout(function () { el.remove(); }, 1200); })(c);
        }
    }
    function caught(btn) {
        var r = btn.getBoundingClientRect();
        sparkle(r.left + r.width / 2, r.top + r.height / 2, 16);
        btn.remove();
        var n = parseInt(store(SCORE_KEY) || '0', 10) + 1;
        store(SCORE_KEY, String(n));
        showScore(n);
        if (n === 1) toast('You caught a bauble! Keep an eye out for more. 🎄', 'success');
        else if (n === 12) toast('Twelve baubles — the tree is looking good. 🎄', 'success');
        else if (n === 25) toast('Twenty-five baubles. Merry Christmas! 🎁', 'success');
    }
    function showScore(n) {
        var el = document.getElementById('xm-score');
        if (!el) {
            el = document.createElement('div');
            el.id = 'xm-score'; el.className = 'xm-score';
            el.setAttribute('role', 'status');
            document.body.appendChild(el);
        }
        el.textContent = '🎄 ' + n + ' bauble' + (n === 1 ? '' : 's') + ' caught';
        clearTimeout(el._t);
        el._t = setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 4000);
    }
    function dropBauble() {
        if (document.hidden || !isOn() || quiet()) return;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'xm-bauble xm-catch';
        b.setAttribute('aria-label', 'Catch the bauble');
        b.addEventListener('click', function (e) { e.stopPropagation(); caught(b); });
        b.style.left = (40 + Math.random() * Math.max(80, window.innerWidth - 120)) + 'px';
        b.style.setProperty('--xm-dx', ((Math.random() - 0.5) * 120).toFixed(0) + 'px');
        playLayer().appendChild(b);
        requestAnimationFrame(function () { b.classList.add('fall'); });
        setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 9600);
    }
    function scheduleBauble() {
        clearTimeout(baubleTimer);
        if (quiet()) return;
        // one every 25–55 seconds: often enough to notice, rare enough to stay a treat
        baubleTimer = setTimeout(function () {
            if (isOn()) { dropBauble(); scheduleBauble(); }
        }, 25000 + Math.random() * 30000);
    }

    /* ───────────── greeting ───────────── */
    var GREETS = [
        'Merry Christmas', 'Happy Christmas', 'Season\'s greetings', 'Happy holidays',
    ];
    function patchWelcome() {
        if (!isOn()) return;
        var sub = document.querySelector('.welcome-message .welcome-sub');
        if (sub && !sub.dataset.xm) {
            sub.dataset.xm = '1';
            sub.textContent = pick(GREETS) + '! What shall we make today?';
        }
    }

    /* ───────────── turning it on and off ───────────── */
    /* Christmas is a dark winter-evening look. Light mode's own colours are far
       more specific than ours and would fight every rule, so while the theme is
       on we step light mode aside and put it back the moment it goes off. */
    function holdLight(on) {
        var R = document.documentElement;
        if (on) {
            if (R.classList.contains('light-theme')) {
                R.dataset.xmLight = '1';
                R.classList.remove('light-theme');
                if (document.body) document.body.classList.remove('light-theme');
            }
        } else if (R.dataset.xmLight === '1') {
            delete R.dataset.xmLight;
            R.classList.add('light-theme');
            if (document.body) document.body.classList.add('light-theme');
        }
    }

    function apply(choice) {
        var on = shouldBeOn(choice);
        document.documentElement.classList.toggle('christmas', on);
        holdLight(on);
        if (on) {
            // Only one seasonal look at a time; Christmas wins while it's on.
            document.documentElement.classList.remove('halloween');
            ['hw-fx', 'hw-play'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el) el.parentNode.removeChild(el);
            });
            loadFont();
            buildScene();
            var m = document.querySelector('meta[name="theme-color"]');
            if (m) m.content = '#07101c';
            patchWelcome();
        } else {
            teardownScene();
            // Hand the season back to Halloween if it is its time of year.
            try { if (window.Halloween) window.Halloween.apply(); } catch (e) {}
        }
    }

    /* Ask the server whether this person may see it, remember the answer so the
       next page load has the theme up before the first paint. */
    async function check() {
        try {
            var r = await fetch('/api/settings/seasonal', { credentials: 'same-origin' });
            if (!r.ok) throw new Error(r.status);
            var d = await r.json();
            allowed = !!(d.themes && d.themes.christmas && d.themes.christmas.allowed);
        } catch (e) {
            allowed = store(OK_KEY) === '1';            // offline: trust what we knew
        }
        store(OK_KEY, allowed ? '1' : '0');
        apply();
    }

    window.Christmas = {
        apply: apply, shouldBeOn: shouldBeOn, inSeason: inSeason, check: check,
        maySee: maySee, sparkle: sparkle, dropBauble: dropBauble,
    };

    function boot() { apply(); check(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    // Keep the lights the right width when the window changes.
    window.addEventListener('resize', function () {
        if (!isOn()) return;
        var l = document.getElementById('xm-lights');
        if (l) { l.remove(); buildScene(); }
    });
})();
