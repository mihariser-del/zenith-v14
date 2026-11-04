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
        var layer = playLayer();
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'hw-bat hw-catch';
        b.setAttribute('aria-label', 'Catch the bat');
        b.addEventListener('click', function (e) { e.stopPropagation(); catchBat(b); });
        var w = window.innerWidth, h = window.innerHeight;
        var fromLeft = Math.random() < 0.5;
        var startY = h * (0.08 + Math.random() * 0.35);
        b.style.top = startY + 'px';
        b.style.left = (fromLeft ? -40 : w + 10) + 'px';
        var dx = (w + 80) * (fromLeft ? 1 : -1);
        b.style.setProperty('--hw-dx', dx + 'px');
        b.style.setProperty('--hw-dx-half', (dx / 2) + 'px');
        b.style.setProperty('--hw-dy', ((Math.random() - 0.5) * h * 0.25) + 'px');
        layer.appendChild(b);
        requestAnimationFrame(function () { b.classList.add('fly'); });
        maybeBatHint();
        setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 9500);
    }

    function scheduleBat() {
        clearTimeout(batTimer);
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        /* one bat every 18–40 seconds: rare enough to stay a surprise */
        batTimer = setTimeout(function () {
            if (document.documentElement.classList.contains('halloween')) { launchBat(); scheduleBat(); }
        }, 18000 + Math.random() * 22000);
    }

    function teardownFx() {
        clearTimeout(batTimer);
        var fx = document.getElementById('hw-fx');
        if (fx) fx.parentNode.removeChild(fx);
        var pl = document.getElementById('hw-play');
        if (pl) pl.parentNode.removeChild(pl);
    }

    /* ======================= fun & games ======================= */
    var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    function isOn() { return document.documentElement.classList.contains('halloween'); }
    function toast(msg, type) { if (typeof window.showToast === 'function') window.showToast(msg, type || ''); }
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
    function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

    /* top layer for things you can touch (bats) and for candy; it never blocks
       clicks itself, only the bats inside it are clickable */
    function playLayer() {
        var l = document.getElementById('hw-play');
        if (!l) {
            l = document.createElement('div');
            l.id = 'hw-play';
            document.body.appendChild(l);
        }
        return l;
    }

    var CANDY = ['🍬', '🍭', '🍫', '🎃', '🍬', '🍭'];
    function candyBurst(x, y, n) {
        if (REDUCED) return;
        var layer = playLayer();
        for (var i = 0; i < (n || 14); i++) {
            var c = document.createElement('span');
            c.className = 'hw-candy burst';
            c.textContent = pick(CANDY);
            var ang = Math.random() * Math.PI * 2, dist = 50 + Math.random() * 90;
            c.style.left = x + 'px';
            c.style.top = y + 'px';
            c.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
            c.style.setProperty('--dy', (Math.sin(ang) * dist - 40) + 'px');
            c.style.setProperty('--rot', (Math.random() * 540 - 270) + 'deg');
            layer.appendChild(c);
            (function (el) { setTimeout(function () { el.remove(); }, 1200); })(c);
        }
    }
    function candyRain(n) {
        if (REDUCED) return;
        var layer = playLayer(), w = window.innerWidth;
        for (var i = 0; i < (n || 34); i++) {
            var c = document.createElement('span');
            c.className = 'hw-candy rain';
            c.textContent = pick(CANDY);
            c.style.left = (Math.random() * w) + 'px';
            c.style.animationDelay = (Math.random() * 1.2) + 's';
            c.style.animationDuration = (2.2 + Math.random() * 1.6) + 's';
            c.style.fontSize = (18 + Math.random() * 16) + 'px';
            layer.appendChild(c);
            (function (el) { setTimeout(function () { el.remove(); }, 5200); })(c);
        }
    }
    function batSwarm(n) {
        if (REDUCED) return;
        var layer = playLayer(), w = window.innerWidth, h = window.innerHeight;
        for (var i = 0; i < (n || 14); i++) {
            var b = document.createElement('span');
            b.className = 'hw-bat swarm';
            b.style.top = (h * (0.1 + Math.random() * 0.7)) + 'px';
            b.style.left = (w + 20 + Math.random() * 200) + 'px';
            b.style.setProperty('--hw-dx', -(w + 420) + 'px');
            b.style.setProperty('--hw-dx-half', -((w + 420) / 2) + 'px');
            b.style.setProperty('--hw-dy', ((Math.random() - 0.5) * 160) + 'px');
            b.style.animationDelay = (Math.random() * 0.8) + 's, 0s';
            layer.appendChild(b);
            (function (el) { requestAnimationFrame(function () { el.classList.add('fly'); }); setTimeout(function () { el.remove(); }, 4400); })(b);
        }
    }

    /* catch-the-bat */
    function catchBat(b) {
        var r = b.getBoundingClientRect();
        b.classList.add('caught');
        candyBurst(r.left + r.width / 2, r.top + r.height / 2, 10);
        setTimeout(function () { b.remove(); }, 260);
        var n = (parseInt(store('zp_hw_bats') || '0', 10) || 0) + 1;
        store('zp_hw_bats', String(n));
        var special = {
            1: 'You caught your first bat! Keep watching the skies…',
            5: 'Five bats! You’re officially a Bat Wrangler.',
            10: 'Ten bats caught. The vampires are filing a complaint.',
            13: 'Thirteen bats — the spookiest number. Legendary!'
        };
        toast('🦇 ' + (special[n] || ('Bat caught! That’s ' + n + ' so far.')), 'success');
    }
    function maybeBatHint() {
        if (store('zp_hw_bathint')) return;
        store('zp_hw_bathint', '1');
        setTimeout(function () { toast('Psst… a bat just flew by. Tap one to catch it! 🦇'); }, 600);
    }

    /* poke the pumpkin logo */
    var CACKLES = ['Muahaha! 🎃', 'Hehehe… that tickles!', 'Boo! Did I scare you?', 'Careful, I bite… candy.', 'Trick or treat? Definitely treat.', 'Happy Halloween! 🕸️'];
    function wireLogos() {
        var els = document.querySelectorAll('.z-logo, .welcome-z-logo');
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (el.dataset.hwPoke) continue;
            el.dataset.hwPoke = '1';
            el.addEventListener('click', function (e) {
                if (!isOn()) return;
                var t = e.currentTarget, r = t.getBoundingClientRect();
                t.classList.remove('hw-wobble'); void t.offsetWidth; t.classList.add('hw-wobble');
                candyBurst(r.left + r.width / 2, r.top + r.height / 2, 12);
                toast(pick(CACKLES));
            });
        }
    }

    /* ---------- the "Happy Halloween" greeting from the AI ---------- */
    var TREATS = [
        'Why don’t skeletons fight each other? They don’t have the guts.',
        'What do you call a witch at the beach? A sand-witch.',
        'Jack-o’-lanterns were first carved from turnips in Ireland, not pumpkins.',
        'Why did the ghost go to the party? For the boos.',
        'Owls have been tied to Halloween for centuries — hoo knew?',
        'What’s a vampire’s favourite fruit? A neck-tarine.',
        'The heaviest pumpkin ever grown weighed over 1,200 kg. That’s a lot of pie.'
    ];
    var TRICKS = [
        'Muahaha! The bats have been released!',
        'Trick! Your screen is now 13% more haunted.',
        'Boo! A swarm of bats says hello.',
        'Trick! I swapped your candy for broccoli. Kidding… mostly.'
    ];
    var POKES = ['Boo!', 'Hehehe…', 'Hey, that tickles!', 'Stop poking me!', 'Fine, have some candy! 🍬'];

    function typeText(el, text, done) {
        if (REDUCED) { el.textContent = text; if (done) done(); return; }
        el.textContent = '';
        var i = 0;
        (function step() {
            el.textContent = text.slice(0, i);
            i += 2;
            if (i <= text.length + 1) setTimeout(step, 16);
            else { el.textContent = text; if (done) done(); }
        })();
    }

    function greet(kind, name) {
        if (!isOn() || document.getElementById('hw-greet')) return;
        loadFont();
        name = (name || '').trim();
        var who = name && name !== 'User' ? name : (kind === 'new' ? 'friend' : 'there');
        var msg = kind === 'new'
            ? 'Welcome to the coven, ' + who + '! 🕸️ Your account is ready. Happy Halloween from Zelpophai AI — log in and let’s brew something spooky together.'
            : 'Happy Halloween, ' + who + '! 🎃 I’ve lit the jack-o’-lanterns and chased the bats out of your chats. Ask me anything tonight — spells, stories or homework. I don’t bite. Much.';
        var ov = document.createElement('div');
        ov.id = 'hw-greet';
        ov.className = 'hwg-overlay';
        ov.setAttribute('role', 'dialog');
        ov.setAttribute('aria-modal', 'true');
        ov.setAttribute('aria-label', 'Happy Halloween');
        ov.innerHTML =
            '<div class="hwg-card">' +
              '<button class="hwg-x" type="button" aria-label="Close">×</button>' +
              '<div class="hwg-title">Happy Halloween!</div>' +
              '<button class="hwg-pumpkin" type="button" aria-label="Poke the pumpkin"><span class="hwg-say"></span></button>' +
              '<div class="hwg-ai"><div class="hwg-av"></div><div class="hwg-bubble"><b>Zelpophai AI</b><p class="hwg-text"><span class="hwg-dots"><i></i><i></i><i></i></span></p></div></div>' +
              '<div class="hwg-result" aria-live="polite"></div>' +
              '<div class="hwg-actions">' +
                '<button class="hwg-tot" type="button">🎃 Trick or Treat?</button>' +
                '<button class="hwg-go" type="button">' + (kind === 'new' ? 'Log in' : 'Enter if you dare') + '</button>' +
              '</div>' +
              '<div class="hwg-tip">Tip: poke the pumpkin, and keep an eye out for bats — you can catch them.</div>' +
            '</div>';
        document.body.appendChild(ov);
        requestAnimationFrame(function () { requestAnimationFrame(function () { ov.classList.add('in'); }); });

        var card = ov.querySelector('.hwg-card'), text = ov.querySelector('.hwg-text'), res = ov.querySelector('.hwg-result');
        var pump = ov.querySelector('.hwg-pumpkin'), say = ov.querySelector('.hwg-say');
        setTimeout(function () { typeText(text, msg); }, REDUCED ? 0 : 900);

        var pokes = 0;
        pump.addEventListener('click', function () {
            pokes++;
            pump.classList.remove('hw-wobble'); void pump.offsetWidth; pump.classList.add('hw-wobble');
            pump.style.setProperty('--glow', String(Math.min(1, 0.35 + pokes * 0.16)));
            say.textContent = POKES[Math.min(pokes - 1, POKES.length - 1)];
            say.classList.remove('show'); void say.offsetWidth; say.classList.add('show');
            if (pokes === POKES.length) {
                var r = pump.getBoundingClientRect();
                candyBurst(r.left + r.width / 2, r.top + r.height / 3, 22);
                pokes = 0;
            }
        });

        var plays = 0;
        ov.querySelector('.hwg-tot').addEventListener('click', function () {
            plays++;
            var treat = plays === 1 ? true : Math.random() < 0.55;
            res.className = 'hwg-result show ' + (treat ? 'treat' : 'trick');
            res.innerHTML = treat ? '<b>TREAT! 🍬</b><span></span>' : '<b>TRICK! 🦇</b><span></span>';
            res.querySelector('span').textContent = pick(treat ? TREATS : TRICKS);
            if (treat) candyRain(36);
            else {
                batSwarm(16);
                card.classList.remove('hw-shake'); void card.offsetWidth; card.classList.add('hw-shake');
            }
            this.textContent = '🎃 Again!';
        });

        function close() {
            ov.classList.remove('in');
            ov.classList.add('out');
            document.removeEventListener('keydown', onKey);
            setTimeout(function () { ov.remove(); }, 320);
            if (kind === 'new') {
                var u = document.getElementById('login-username');
                if (u) { if (name) u.value = name; var pw = document.getElementById('login-password'); (name && pw ? pw : u).focus(); }
            }
        }
        function onKey(e) { if (e.key === 'Escape') close(); }
        document.addEventListener('keydown', onKey);
        ov.querySelector('.hwg-x').addEventListener('click', close);
        ov.querySelector('.hwg-go').addEventListener('click', close);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        setTimeout(function () { var b = ov.querySelector('.hwg-go'); if (b) b.focus(); }, 60);
    }

    /* auth.js calls this right before it sends you into the app */
    function markLogin(kind) { try { sessionStorage.setItem('zp_hw_greet', kind || 'login'); } catch (e) {} }

    /* in the app: greet once, after the page has settled and your name is known */
    function greetAfterLogin() {
        var kind = null;
        try { kind = sessionStorage.getItem('zp_hw_greet'); sessionStorage.removeItem('zp_hw_greet'); } catch (e) {}
        if (!kind || !isOn() || !document.getElementById('chat-container')) return;
        var tries = 0;
        (function wait() {
            var el = document.getElementById('user-name-text');
            var nm = el ? el.textContent.trim() : '';
            if ((nm && nm !== 'User') || tries++ > 20) greet(kind, nm);
            else setTimeout(wait, 150);
        })();
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
        observer = new MutationObserver(function () { patchWelcome(target); if (isOn()) wireLogos(); });
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
        patchBrand(true);   /* the coloured "AI" is part of the brand look all year */
        watchWelcome();
        if (on) wireLogos();
    }

    window.Halloween = {
        apply: apply, shouldBeOn: shouldBeOn, inSeason: inSeason,
        greet: greet, markLogin: markLogin, candyRain: candyRain, batSwarm: batSwarm, launchBat: launchBat
    };

    function boot() { apply(); greetAfterLogin(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
