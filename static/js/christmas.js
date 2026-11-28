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
        l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,800&family=Dancing+Script:wght@700&display=swap';
        document.head.appendChild(l);
    }

    /* 26.6.1: real pictures instead of drawn shapes and emojis (/static/img/xmas/) */
    var IMG = '/static/img/xmas/';
    function ic(name, alt) { return '<img class="xm-ic" src="' + IMG + name + '.webp" alt="' + (alt || '') + '" decoding="async">'; }

    /* ───────────────── the scene ───────────────── */
    function buildScene() {
        if (!document.body) return;
        if (!document.getElementById('xm-fx')) {
            var fx = document.createElement('div');
            fx.id = 'xm-fx';
            fx.setAttribute('aria-hidden', 'true');
            fx.innerHTML = '<div class="xm-photo"></div><div class="xm-shade"></div>';
            document.body.appendChild(fx);
        }
        if (!document.getElementById('xm-lights')) {
            var lights = document.createElement('div');
            lights.id = 'xm-lights';
            lights.setAttribute('aria-hidden', 'true');
            var html = '<div class="xm-garland"></div><img class="xm-hang h1" src="' + IMG + 'bauble.webp" alt=""><img class="xm-hang h2" src="' + IMG + 'bauble.webp" alt="">';
            lights.innerHTML = html;
            document.body.appendChild(lights);
        }
        startSnow();
        scheduleBauble();
    }

    function teardownScene() {
        clearInterval(snowTimer); clearTimeout(baubleTimer);
        stopSnow();
        ['xm-fx', 'xm-lights', 'xm-snow', 'xm-snowcv', 'xm-play', 'xm-score'].forEach(function (id) {
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
        if (layer.childElementCount > (snowLevel() === 'lots' ? 140 : 70)) return;       // never let it pile up
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
    function snowLevel() { return store('zp_xmas_snow') || 'light'; }       // off | light | lots

    /* ───────────── real snow ─────────────
       Drawn on one canvas: soft round flakes at different depths (near ones are
       bigger, faster and a little blurred), drifting on a wind that changes and
       gusts now and then, swaying as they fall, pushed aside by your mouse or
       finger — and settling: snow builds up along the bottom of the screen and on
       top of the typing box and the New Chat button, then slowly melts. */
    var SN = null, SN_knock = function () {};
    function sprite(r, blur) {
        var s = Math.ceil(r * 2 + blur * 4 + 2), c = document.createElement('canvas');
        c.width = c.height = s;
        var g = c.getContext('2d'), m = s / 2;
        var gr = g.createRadialGradient(m, m, 0, m, m, r + blur * 2);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(blur ? 0.35 : 0.55, 'rgba(255,255,255,.92)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(m, m, r + blur * 2, 0, Math.PI * 2); g.fill();
        return c;
    }
    /* 26.6.7: realistic snow — real ice-crystal snowflakes among the soft specks, lying snow
       with a real glittering snow texture, cool shadows and sparkles that catch the light. */
    var CRYSTALS = [], SNOWTEX = null, SPARK = null;
    function loadSnowArt(done) {
        if (SNOWTEX) return done && done();
        var want = 0, got = 0, fin = function () { if (++got === want && done) done(); };
        var names = ['crystal1', 'crystal2', 'crystal3'];
        want = names.length + 1;
        names.forEach(function (n) {
            var im = new Image(); im.decoding = 'async';
            im.onload = function () {
                // three pre-drawn sizes; the biggest (closest to you) slightly out of focus, like a camera
                var vs = [14, 22, 34].map(function (px, k) {
                    var c = document.createElement('canvas'), pad = 4; c.width = c.height = px + pad * 2;
                    var g = c.getContext('2d');
                    if (k === 2 && 'filter' in g) g.filter = 'blur(0.8px)';
                    var r = Math.min(px / im.width, px / im.height);
                    g.drawImage(im, pad + (px - im.width * r) / 2, pad + (px - im.height * r) / 2, im.width * r, im.height * r);
                    return c;
                });
                CRYSTALS.push(vs); fin();
            };
            im.onerror = fin; im.src = IMG + n + '.webp';
        });
        var t = new Image();
        t.onload = function () {
            var c = document.createElement('canvas'); c.width = c.height = 160;
            c.getContext('2d').drawImage(t, 0, 0, 160, 160); SNOWTEX = c; fin();
        };
        t.onerror = fin; t.src = IMG + 'snowtex.jpg';
        // a tiny four-pointed glint
        var sp = document.createElement('canvas'); sp.width = sp.height = 16;
        var g = sp.getContext('2d'), gr = g.createRadialGradient(8, 8, 0, 8, 8, 8);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(235,245,255,.7)'); gr.addColorStop(1, 'rgba(200,225,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 16, 16);
        g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(7.5, 0, 1, 16); g.fillRect(0, 7.5, 16, 1);
        SPARK = sp;
    }
    function startSnow() {
        stopSnow();
        var old = document.getElementById('xm-snow'); if (old) old.remove();
        var lvl = snowLevel();
        if (quiet() || lvl === 'off' || !document.body) return;
        loadSnowArt();
        var cv = document.createElement('canvas');
        cv.id = 'xm-snowcv'; cv.setAttribute('aria-hidden', 'true');
        document.body.appendChild(cv);
        var ctx = cv.getContext('2d');
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var W = 0, H = 0, COL = 4, GMAX = 9;
        var sprites = [];
        for (var i = 0; i < 12; i++) sprites.push(sprite(0.8 + i * 0.42, i > 8 ? (i - 8) * 0.9 : 0));
        var flakes = [], ground = [], surfaces = [], chunks = [], mouse = { x: -999, y: -999, t: 0, vx: 0, vy: 0 };
        var wind = 0, windTo = 0, gust = 0, t = 0, last = performance.now(), raf = 0, surfT = 0;
        function size() {
            W = window.innerWidth; H = window.innerHeight;
            cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
            cv.style.width = W + 'px'; cv.style.height = H + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            var n = Math.ceil(W / COL) + 1;
            if (ground.length !== n) ground = new Array(n).fill(0);
        }
        function count() {
            var base = (W * H) / (lvl === 'lots' ? 3800 : 9500);
            return Math.min(lvl === 'lots' ? 520 : 220, Math.round(base * (W < 700 ? 0.6 : 1)));
        }
        function make(top) {
            var d = Math.random();                 // depth: 0 far … 1 near
            d = d * d;                              // most flakes far away
            var si = Math.min(11, Math.floor(d * 12));
            var f = { x: Math.random() * (W + 200) - 100, y: top ? -10 - Math.random() * 40 : Math.random() * H,
                     d: d, sp: sprites[si], r: 0.8 + si * 0.42, vy: 18 + d * 70 + Math.random() * 14,
                     ph: Math.random() * 6.28, sw: 8 + Math.random() * 22, a: 0.35 + d * 0.6, vx: 0 };
            // nearer flakes are often real six-armed crystals that turn and tumble as they fall
            if (CRYSTALS.length && d > 0.35 && Math.random() < 0.4) {
                f.cr = CRYSTALS[Math.floor(Math.random() * CRYSTALS.length)][d > 0.85 ? 2 : d > 0.55 ? 1 : 0];
                f.sz = 6 + d * 15 + Math.random() * 3;
                f.rot = Math.random() * 6.28; f.vr = (Math.random() - 0.5) * 1.6; f.tb = Math.random() * 6.28;
                f.vy *= 0.8; f.a = Math.min(1, f.a + 0.15);
            }
            return f;
        }
        // 26.6.3: snow that already lies on things — lumpy and uneven, with icicles.
        var LEDGES = { '.composer-box': 22, '#new-chat-btn': 15, '.zp-greetcard': 16, '.sidebar .chat-list': 13, '.sidebar .bottom-bar': 9, '.xm-count': 7 };
        function profile(n, maxH) {
            var a = new Array(n).fill(maxH * 0.32);
            var lumps = Math.max(3, Math.round(n / 9));
            for (var k = 0; k < lumps; k++) {
                var c = Math.random() * n, w = 3 + Math.random() * 12, amp = maxH * (0.25 + Math.random() * 0.75);
                for (var i = 0; i < n; i++) { var z = (i - c) / w; a[i] += amp * Math.exp(-z * z); }
            }
            for (var j = 0; j < n; j++) a[j] = Math.max(maxH * 0.18, Math.min(maxH, a[j] * 0.62 + Math.random() * 1.2));
            return a;
        }
        function icicles(n) {
            var out = [];
            for (var i = 3; i < n - 3; i += 2 + Math.floor(Math.random() * 7)) {
                if (Math.random() < 0.55) out.push({ i: i, len: 3 + Math.pow(Math.random(), 1.8) * 16, cur: 0, w: 1.6 + Math.random() * 2.2 });
            }
            out.forEach(function (c) { c.cur = c.len; });
            return out;
        }
        function findSurfaces() {
            surfaces = [];
            Object.keys(LEDGES).forEach(function (sel) {
                var el = document.querySelector(sel);
                if (!el || !el.offsetParent) return;
                var r = el.getBoundingClientRect();
                if (r.width < 40 || r.top < 30 || r.top > H - 10) return;
                // 26.6.8: keep the snow off the rounded corners, so it never hangs off them
                var rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, ins = Math.max(6, Math.min(rad * 0.75, r.width / 6));
                var prev = SN && SN.surf && SN.surf[sel];
                var n = Math.ceil((r.width - ins * 2) / COL) + 1;
                var same = prev && prev.h.length === n;
                var tgt = same ? prev.tgt : profile(n, LEDGES[sel]);
                var s = { sel: sel, el: el, ins: ins, left: r.left + ins, right: r.right - ins, top: r.top, h: same ? prev.h : tgt.slice(), tgt: tgt,
                          ice: same ? prev.ice : icicles(n), max: LEDGES[sel] };
                surfaces.push(s);
                SN.surf[sel] = s;
            });
        }
        // knock snow off a ledge: it breaks into clumps that tumble down
        function knock(S, x, y, radius, strength, vx) {
            var c = Math.round((x - S.left) / COL), R = Math.ceil(radius / COL), lost = 0;
            for (var k = -R; k <= R; k++) {
                var j = c + k; if (j < 0 || j >= S.h.length) continue;
                var f = strength * (1 - Math.abs(k) / (R + 1)) * (0.6 + Math.random() * 0.4);
                var take = S.h[j] * Math.min(0.95, f);
                S.h[j] -= take; lost += take;
            }
            S.ice.forEach(function (ic) { if (Math.abs(ic.i - c) <= R && ic.cur > 1 && Math.random() < strength + 0.2) { chunks.push({ x: S.left + ic.i * COL, y: S.top + 2, vx: vx * 0.2 + (Math.random() - 0.5) * 30, vy: 20, r: ic.w, ice: ic.cur, a: 1 }); ic.cur = 0; } });
            var n = Math.min(26, Math.round(lost / 2.2));
            for (var q = 0; q < n; q++) {
                chunks.push({ x: x + (Math.random() - 0.5) * radius * 1.6, y: S.top - Math.random() * S.max, vx: vx * 0.35 + (Math.random() - 0.5) * 90,
                              vy: -40 - Math.random() * 140, r: 1.2 + Math.random() * 2.8, a: 1 });
            }
            if (chunks.length > 400) chunks.splice(0, chunks.length - 400);
        }
        // 26.6.8: the snow along the bottom of the screen can be swiped or tapped away too
        function knockGround(x, radius, strength, vx) {
            var c = Math.round(x / COL), R = Math.ceil(radius / COL), lost = 0;
            for (var k = -R; k <= R; k++) {
                var j = c + k; if (j < 0 || j >= ground.length) continue;
                var take = ground[j] * Math.min(1, strength * (1 - Math.abs(k) / (R + 1)) * 1.3);
                ground[j] -= take; lost += take;
            }
            var n = Math.min(24, Math.round(lost / 1.5));
            for (var q = 0; q < n; q++) chunks.push({ x: x + (Math.random() - 0.5) * radius * 1.4, y: H - Math.random() * 6, vx: vx * 0.4 + (Math.random() - 0.5) * 160,
                                                     vy: -120 - Math.random() * 220, r: 1 + Math.random() * 2.4, a: 1, gone: true });
            if (chunks.length > 400) chunks.splice(0, chunks.length - 400);
        }
        function onGround(x, y) { var g = ground[Math.round(x / COL)] || 0; return g > 0.8 && y > H - g - 26; }
        function ledgeAt(x, y) {
            for (var i = 0; i < surfaces.length; i++) {
                var S = surfaces[i];
                if (S.hidden || x < S.left - 4 || x > S.right + 4) continue;
                var c = Math.max(0, Math.min(S.h.length - 1, Math.round((x - S.left) / COL)));
                if (y > S.top - (S.h[c] || 0) - 16 && y < S.top + 14) return S;
            }
            return null;
        }
        SN_knock = function (sel, amount) {
            var S = SN && SN.surf && SN.surf[sel]; if (!S) return;
            var spots = Math.max(1, Math.round(amount * 6));
            for (var i = 0; i < spots; i++) knock(S, S.left + Math.random() * (S.right - S.left), S.top, 10 + amount * 30, 0.25 + amount * 0.6, (Math.random() - 0.5) * 200);
        };
        function land(arr, x0, x, amount, max) {
            var i = Math.round((x - x0) / COL);
            if (i < 0 || i >= arr.length) return;
            for (var k = -2; k <= 2; k++) {
                var j = i + k; if (j < 0 || j >= arr.length) continue;
                arr[j] = Math.min(max, arr[j] + amount * (k === 0 ? 1 : k === 1 || k === -1 ? 0.55 : 0.2));
            }
        }
        function settle(arr, max, melt, dt) {
            // snow slides off steep bits (so piles look soft) and melts a little
            for (var i = 1; i < arr.length; i++) {
                var diff = arr[i] - arr[i - 1];
                if (Math.abs(diff) > 0.7) { var m = diff * 0.3; arr[i] -= m; arr[i - 1] += m; }
            }
            if (melt) for (var j = 0; j < arr.length; j++) arr[j] = Math.max(0, arr[j] - melt * dt);
        }
        function drawPile(arr, x0, baseY, ends) {
            var any = false;
            for (var i = 0; i < arr.length; i++) if (arr[i] > 0.3) { any = true; break; }
            if (!any) return;
            ctx.beginPath();
            ctx.moveTo(x0, baseY);
            var px = x0, py = baseY;
            for (var k = 0; k < arr.length; k++) {
                var h = arr[k];
                if (ends) { var e = Math.min(k, arr.length - 1 - k), E = Math.min(9, arr.length / 4); if (e < E) { var u = e / E; h *= u * u * (3 - 2 * u); } }   // ease the ends down to nothing
                var nx = x0 + k * COL, ny = baseY - h;
                ctx.quadraticCurveTo(px, py, (px + nx) / 2, (py + ny) / 2);     // soft, rounded drifts
                px = nx; py = ny;
            }
            ctx.lineTo(px, py);
            ctx.lineTo(x0 + (arr.length - 1) * COL, baseY);
            ctx.closePath();
            var top = 0; for (var q = 0; q < arr.length; q++) if (arr[q] > top) top = arr[q];
            var g = ctx.createLinearGradient(0, baseY - top, 0, baseY);
            g.addColorStop(0, 'rgba(255,255,255,.98)'); g.addColorStop(0.55, 'rgba(236,243,255,.96)'); g.addColorStop(1, 'rgba(196,214,245,.95)');
            ctx.fillStyle = g;
            ctx.shadowColor = 'rgba(150,185,255,.5)'; ctx.shadowBlur = 7;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.save();
            ctx.clip();
            if (SNOWTEX) {
                // real powder-snow grain on top
                if (!drawPile.pat) drawPile.pat = ctx.createPattern(SNOWTEX, 'repeat');
                ctx.globalAlpha = 0.85; ctx.globalCompositeOperation = 'multiply';
                ctx.fillStyle = drawPile.pat; ctx.fillRect(x0, baseY - top - 2, arr.length * COL, top + 4);
                ctx.globalCompositeOperation = 'source-over';
            }
            // cool blue shade low down, bright where the light hits the top
            var sh = ctx.createLinearGradient(0, baseY - top, 0, baseY);
            sh.addColorStop(0, 'rgba(255,255,255,.35)'); sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(120,160,225,.32)');
            ctx.globalAlpha = 1; ctx.fillStyle = sh; ctx.fillRect(x0, baseY - top - 2, arr.length * COL, top + 4);
            ctx.restore();
            if (ends) { ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.8; ctx.stroke(); }
            // glints: tiny crystals on the surface flash as the light catches them
            if (SPARK && arr.length > 4) {
                var gl = arr.glints;
                if (!gl || gl.n !== arr.length) {
                    gl = arr.glints = []; gl.n = arr.length;
                    for (var z = 0; z < arr.length / 3; z++) gl.push({ i: Math.floor(Math.random() * arr.length), o: Math.random(), ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.8, s: 3 + Math.random() * 5 });
                }
                var tt = performance.now() / 1000;
                for (var y = 0; y < gl.length; y++) {
                    var G = gl[y], hh = arr[G.i]; if (hh < 2) continue;
                    var k2 = Math.sin(tt * G.sp + G.ph); if (k2 < 0.6) continue;
                    ctx.globalAlpha = Math.pow((k2 - 0.6) / 0.4, 2);
                    var gx = x0 + G.i * COL, gy = baseY - hh * (0.25 + G.o * 0.7);
                    ctx.drawImage(SPARK, gx - G.s / 2, gy - G.s / 2, G.s, G.s);
                }
                ctx.globalAlpha = 1;
            }
        }
        function drawIcicles(S) {
            for (var i = 0; i < S.ice.length; i++) {
                var ic = S.ice[i]; if (ic.cur < 0.8 || (S.h[ic.i] || 0) < 1.5) continue;
                var x = S.left + ic.i * COL, y = S.top - 1, L = ic.cur;
                var g = ctx.createLinearGradient(0, y, 0, y + L);
                g.addColorStop(0, 'rgba(235,246,255,.95)'); g.addColorStop(1, 'rgba(190,225,255,.35)');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.moveTo(x - ic.w, y); ctx.quadraticCurveTo(x - ic.w * 0.3, y + L * 0.6, x, y + L); ctx.quadraticCurveTo(x + ic.w * 0.3, y + L * 0.6, x + ic.w, y); ctx.closePath(); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(x - ic.w * 0.35, y + 1, 0.8, L * 0.5);
            }
        }
        function frame(now) {
            raf = requestAnimationFrame(frame);
            var dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
            if (document.hidden) return;
            // wind: drifts slowly, with an occasional gust
            if (Math.random() < dt / 6) windTo = (Math.random() - 0.5) * 50;
            if (Math.random() < dt / 25) gust = (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 80);
            gust *= Math.pow(0.35, dt);
            wind += (windTo - wind) * Math.min(1, dt * 0.6);
            surfT -= dt; if (surfT <= 0) { surfT = 1.5; findSurfaces(); }
            // 26.6.4: follow each item every frame (scrolling, cards growing), and hide snow
            // on things that are scrolled out of sight or tucked under the header.
            var cc = document.getElementById('chat-container'), ccr = cc ? cc.getBoundingClientRect() : null;
            for (var sI = 0; sI < surfaces.length; sI++) {
                var Sf = surfaces[sI];
                if (!Sf.el || !Sf.el.isConnected) { Sf.hidden = true; continue; }
                var rr = Sf.el.getBoundingClientRect();
                var ins2 = Sf.ins || 6;
                if (Math.abs((rr.right - rr.left - ins2 * 2) - (Sf.right - Sf.left)) > 3) { surfT = 0; }
                Sf.left = rr.left + ins2; Sf.right = rr.right - ins2; Sf.top = rr.top;
                var inChat = ccr && cc.contains(Sf.el);
                Sf.hidden = rr.width < 40 || rr.top < 50 || rr.top > H - 10 || (inChat && (rr.top < ccr.top + 4 || rr.top > ccr.bottom - 4));
            }
            ctx.clearRect(0, 0, W, H);
            var want = count();
            while (flakes.length < want) flakes.push(make(flakes.length > want * 0.4));
            if (flakes.length > want) flakes.length = want;
            var mouseOn = now - mouse.t < 1500;
            for (var i = 0; i < flakes.length; i++) {
                var f = flakes[i];
                f.ph += dt * (0.8 + f.d);
                var w = (wind + gust) * (0.35 + f.d * 0.9);
                f.vx += (w - f.vx) * Math.min(1, dt * 2);
                if (mouseOn) {
                    var dx = f.x - mouse.x, dy = f.y - mouse.y, dd = dx * dx + dy * dy;
                    if (dd < 6400) { var push = (1 - Math.sqrt(dd) / 80) * 260 * dt; var l = Math.sqrt(dd) || 1; f.x += dx / l * push; f.y += dy / l * push * 0.6; }
                }
                f.x += (f.vx + Math.sin(f.ph) * f.sw * 0.6) * dt;
                f.y += f.vy * dt;
                // settle on a surface (typing box, New Chat button)?
                var landed = false;
                if (f.d > 0.15) for (var s = 0; s < surfaces.length; s++) {
                    var S = surfaces[s];
                    if (!S.hidden && f.x > S.left && f.x < S.right) {
                        var idx = Math.round((f.x - S.left) / COL), top = S.top - (S.h[idx] || 0);
                        if (f.y >= top && f.y - f.vy * dt < top + 2) { land(S.h, S.left, f.x, 0.9 + f.r * 0.3, S.max); landed = true; break; }
                    }
                }
                if (!landed) {
                    var gi = Math.round(f.x / COL), gh = ground[gi] || 0;
                    if (f.y >= H - gh) { if (f.d > 0.1) land(ground, 0, f.x, 0.5 + f.r * 0.18, GMAX); landed = true; }
                }
                if (landed || f.x < -120 || f.x > W + 120) { flakes[i] = make(true); continue; }
                if (f.cr) {
                    f.rot += f.vr * dt; f.tb += dt * (0.7 + f.d);
                    var tilt = Math.cos(f.tb), sc = f.sz / (f.cr.width - 8);
                    // catches the light as it turns
                    ctx.globalAlpha = f.a * (0.72 + 0.28 * Math.abs(Math.sin(f.rot * 3 + f.tb)));
                    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.scale(sc, sc * (0.45 + 0.55 * Math.abs(tilt)));
                    ctx.drawImage(f.cr, -f.cr.width / 2, -f.cr.height / 2);
                    ctx.restore();
                    continue;
                }
                ctx.globalAlpha = f.a;
                ctx.drawImage(f.sp, f.x - f.sp.width / 2, f.y - f.sp.height / 2);
            }
            ctx.globalAlpha = 1;
            settle(ground, GMAX, 0.22, dt);    // 26.6.8: the snow along the bottom melts away steadily
            drawPile(ground, 0, H, false);
            for (var q = 0; q < surfaces.length; q++) {
                var SS = surfaces[q];
                // snow slowly builds back up to its natural, uneven shape; icicles regrow
                for (var u = 0; u < SS.h.length; u++) { if (SS.h[u] < SS.tgt[u]) SS.h[u] += (SS.tgt[u] - SS.h[u]) * Math.min(1, dt * 0.05) + dt * 0.08; if (SS.h[u] > SS.tgt[u] + 2) SS.h[u] -= dt * 0.5; }
                SS.ice.forEach(function (ic) { if (ic.cur < ic.len && (SS.h[ic.i] || 0) > SS.max * 0.3) ic.cur = Math.min(ic.len, ic.cur + dt * 0.25); });
                if (SS.hidden) continue;
                drawIcicles(SS);
                drawPile(SS.h, SS.left, SS.top, true);
            }
            // clumps and icicles that were knocked off
            for (var cI = chunks.length - 1; cI >= 0; cI--) {
                var C = chunks[cI];
                C.vy += 900 * dt; C.vx *= Math.pow(0.4, dt); C.x += C.vx * dt; C.y += C.vy * dt;
                var gI = Math.round(C.x / COL);
                if (C.gone ? C.y > H + 10 : C.y >= H - (ground[gI] || 0)) { if (!C.gone) land(ground, 0, C.x, C.ice ? 0.2 : 0.3 + C.r * 0.2, GMAX); chunks.splice(cI, 1); continue; }
                if (C.gone) C.a = Math.max(0, C.a - dt * 0.9);
                if (C.x < -20 || C.x > W + 20) { chunks.splice(cI, 1); continue; }
                ctx.globalAlpha = C.a;
                if (C.ice) { ctx.fillStyle = 'rgba(210,235,255,.85)'; ctx.fillRect(C.x - C.r / 2, C.y, C.r, C.ice); }
                else { ctx.beginPath(); ctx.fillStyle = '#f7fbff'; ctx.shadowColor = 'rgba(170,200,255,.6)'; ctx.shadowBlur = 4; ctx.arc(C.x, C.y, C.r, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0; }
            }
            ctx.globalAlpha = 1;
        }
        function onMove(e) {
            var p = e.touches ? e.touches[0] : e; if (!p) return;
            var nowT = performance.now(), dtm = Math.max(8, nowT - mouse.t);
            var vx = (p.clientX - mouse.x) / dtm * 1000, vy = (p.clientY - mouse.y) / dtm * 1000;
            if (nowT - mouse.t > 200) { vx = 0; vy = 0; }
            mouse.vx = vx; mouse.vy = vy; mouse.x = p.clientX; mouse.y = p.clientY; mouse.t = nowT;
            var sp = Math.sqrt(vx * vx + vy * vy);
            if (sp > 420) { var S = ledgeAt(p.clientX, p.clientY); if (S) knock(S, p.clientX, p.clientY, 12 + Math.min(30, sp / 60), Math.min(0.9, sp / 2600), vx);
                else if (onGround(p.clientX, p.clientY)) knockGround(p.clientX, 20 + Math.min(40, sp / 50), Math.min(1, sp / 1800), vx); }
        }
        function onDown(e) {
            var S = ledgeAt(e.clientX, e.clientY);
            if (S) knock(S, e.clientX, e.clientY, 26, 0.85, (Math.random() - 0.5) * 160);
            else if (onGround(e.clientX, e.clientY)) knockGround(e.clientX, 40, 1, (Math.random() - 0.5) * 160);
        }
        function onResize() { size(); findSurfaces(); }
        SN = { cv: cv, surf: {}, stop: function () {
            cancelAnimationFrame(raf);
            window.removeEventListener('mousemove', onMove); window.removeEventListener('touchmove', onMove); window.removeEventListener('pointerdown', onDown);
            window.removeEventListener('resize', onResize);
            if (cv.parentNode) cv.remove();
        } };
        size(); findSurfaces();
        for (var n = count(), k2 = 0; k2 < n; k2++) flakes.push(make(false));
        window.addEventListener('mousemove', onMove, { passive: true });
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('pointerdown', onDown, { passive: true });
        window.addEventListener('resize', onResize);
        raf = requestAnimationFrame(frame);
    }
    function stopSnow() { clearInterval(snowTimer); if (SN) { SN.stop(); SN = null; } }

    /* ───────────── a bauble to catch, now and then ───────────── */
    function playLayer() {
        var l = document.getElementById('xm-play');
        if (!l) { l = document.createElement('div'); l.id = 'xm-play'; document.body.appendChild(l); }
        return l;
    }
    function sparkle(x, y, n) {
        if (quiet()) return;
        var layer = playLayer(), EM = ['bauble', 'gift', 'holly', 'tree', 'bauble'];
        for (var i = 0; i < (n || 12); i++) {
            var c = document.createElement('img');
            c.className = 'xm-spark'; c.alt = '';
            c.src = IMG + pick(EM) + '.webp';
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
        el.innerHTML = ic('bauble') + n + ' bauble' + (n === 1 ? '' : 's') + ' caught';
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
        patchHero();
    }
    /* 26.6.5: the new-chat screen as a Christmas card — glowing Z, "Merry Christmas, NAME!",
       a garland with a bow and bells, then the ideas. (The normal heading hides while it's up.) */
    function heroName() {
        var u = window.user || {};
        if (!u.username || /^guest_/.test(u.username)) return '';
        return String(u.display_name || u.username).trim().slice(0, 28);
    }
    function patchHero() {
        if (!isOn()) return;
        var w = document.querySelector('#chat-container .welcome-message');
        if (!w || w.querySelector('.zw-hero')) return;
        var name = heroName(), h = w.querySelector('.xm-hero');
        if (h && h.dataset.name === name) return;
        if (!h) {
            h = document.createElement('div');
            h.className = 'xm-hero';
            var logo = w.querySelector('.welcome-z-logo');
            w.insertBefore(h, logo ? logo.nextSibling : w.firstChild);
        }
        h.dataset.name = name;
        var flake = '<img class="xm-flake" src="' + IMG + 'flake.webp" alt="" decoding="async">';
        var esc = function (t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; };
        h.innerHTML =
            '<div class="xm-brand">Zelpophai <span>AI</span></div>' +
            '<div class="xm-rule" aria-hidden="true"><i></i>' + flake + '<i></i></div>' +
            '<h2 class="xm-merry">' + flake.replace('xm-flake', 'xm-flake xm-side') +
                '<span class="xm-script">Merry Christmas' + (name ? ',' : '!') + '</span>' +
                (name ? '<span class="xm-name">' + esc(name) + '!</span>' : '') +
                flake.replace('xm-flake', 'xm-flake xm-side') + '</h2>' +
            '<img class="xm-swag" src="' + IMG + 'swag.webp" alt="" decoding="async">';
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
            if (document.body) extrasOn(); else document.addEventListener('DOMContentLoaded', extrasOn);
        } else {
            teardownScene();
            extrasOff();
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

    /* ───────────── 26.3: countdown, advent calendar, sleigh, ideas, card maker ───────────── */
    function daysTo(m, d) {
        var now = new Date(), t = new Date(now.getFullYear(), m, d);
        if (now > new Date(now.getFullYear(), m, d, 23, 59)) t = new Date(now.getFullYear() + 1, m, d);
        return Math.ceil((t - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    }
    function countdownText() {
        var now = new Date(), m = now.getMonth(), d = now.getDate();
        if (m === 11 && d === 24) return '🎄 Christmas Eve!';
        if (m === 11 && d === 25) return '🎄 Merry Christmas!';
        if (m === 11 && d === 26) return '🎁 Happy Boxing Day';
        if ((m === 11 && d >= 27) || (m === 0 && d <= 1)) { var n = daysTo(0, 1); return n <= 0 || (m === 0 && d === 1) ? '🎆 Happy New Year!' : '🎆 ' + n + ' day' + (n === 1 ? '' : 's') + ' to New Year'; }
        if (m === 0) return '🎆 Happy New Year!';
        var c = daysTo(11, 25);
        return '🎄 ' + c + ' day' + (c === 1 ? '' : 's') + ' to Christmas';
    }
    // the countdown pill: a real picture (tree / present / bauble) instead of the emoji
    function countdownHtml() {
        var t = countdownText(), e = t.split(' ')[0], rest = t.slice(e.length + 1);
        var pic = e === '🎁' ? 'gift' : e === '🎆' ? 'bauble' : 'tree';
        return ic(pic) + '<span>' + rest + '</span><span class="xm-chev">›</span>';
    }
    function buildCountdown() {
        if (document.getElementById('xm-count')) { document.getElementById('xm-count').innerHTML = countdownHtml(); return; }
        var b = document.createElement('button');
        b.id = 'xm-count'; b.type = 'button'; b.className = 'xm-count';
        b.title = 'Open the advent calendar';
        b.innerHTML = countdownHtml();
        b.addEventListener('click', function () { advent(); });
        document.body.appendChild(b);
        placeCount();
        var m = document.querySelector('.main');
        if (m && window.ResizeObserver && !m._xmro) { m._xmro = new ResizeObserver(placeCount); m._xmro.observe(m); }
    }
    // 26.6.6: centre the countdown over the chat area (the sidebar takes up the left part of the window)
    function placeCount() {
        var b = document.getElementById('xm-count'), m = document.querySelector('.main');
        if (!b) return;
        if (!m || window.innerWidth <= 700) { b.style.left = ''; return; }
        var r = m.getBoundingClientRect();
        b.style.left = Math.round(r.left + r.width / 2) + 'px';
    }
    window.addEventListener('resize', function () { placeCount(); });

    // 24 doors, plus a warm-up door before December. Each has a little fact and something to do.
    var DOORS = [
        ['⭐', 'Warm-up', 'Christmas lights were first put on a tree with electricity in 1882 — 80 red, white and blue bulbs in New York.', 'Make my Christmas to-do list', 'Help me make a Christmas to-do list: ask me who I\'m buying for, what I\'m cooking and where I\'ll be, then turn it into a checklist with dates.'],
        ['🎄', 'Door 1', 'The tradition of a decorated tree comes from Germany in the 1500s.', 'A Christmas card picture', 'Make a beautiful Christmas card picture: a cosy snowy village at night with warm lights in the windows.'],
        ['🍪', 'Door 2', 'Gingerbread houses became popular after the fairy tale Hansel and Gretel was published in 1812.', 'Easy Christmas biscuit recipe', 'Give me an easy Christmas biscuit recipe I can make with simple ingredients, with step-by-step instructions.'],
        ['🎁', 'Door 3', 'The average family spends weeks choosing gifts — but people remember thoughtful gifts far more than expensive ones.', 'Gift ideas', 'Help me find Christmas gift ideas. Ask me who they\'re for and my budget, then give me 8 thoughtful ideas.'],
        ['🦌', 'Door 4', 'Reindeer are the only deer where both males and females grow antlers.', 'Reindeer quiz', 'Give me a fun 5-question multiple-choice quiz about reindeer and Christmas animals, one question at a time.'],
        ['✉️', 'Door 5', 'Children have written letters to Father Christmas for over 150 years.', 'A letter from Santa', 'Write a magical, personal letter from Father Christmas to a child. Ask me their name, age and one thing they did well this year first.'],
        ['🎶', 'Door 6', '"Jingle Bells" was first written for Thanksgiving, not Christmas.', 'Christmas song facts', 'Tell me 5 surprising facts about famous Christmas songs.'],
        ['🕯️', 'Door 7', 'Candles in windows were once a sign that travellers were welcome to shelter.', 'Cosy evening ideas', 'Give me 10 cosy, low-cost Christmas evening ideas for the family.'],
        ['🧦', 'Door 8', 'Stockings come from a legend about gold coins dropped down a chimney landing in socks drying by the fire.', 'Stocking filler ideas', 'Give me 15 cheap, fun stocking filler ideas for kids and adults.'],
        ['📚', 'Door 9', 'In Iceland, people give books on Christmas Eve and spend the night reading — the "Christmas book flood".', 'Make a Christmas story', 'Write a short, heart-warming Christmas story (about 400 words) I can read aloud tonight.'],
        ['🍗', 'Door 10', 'A Christmas dinner for 6 can be done on a budget with a little planning.', 'Plan Christmas dinner', 'Plan a Christmas dinner for 6 people on a budget: menu, shopping list with rough costs, and a cooking timeline for the day.'],
        ['❄️', 'Door 11', 'No two snowflakes are alike — each grows its own shape as it falls.', 'Snowflake craft', 'Explain step by step how to make paper snowflakes with kids, with tips for pretty patterns.'],
        ['🎅', 'Door 12', 'Father Christmas has many names: Santa Claus, Père Noël, Babbo Natale, Sinterklaas…', 'Christmas around the world', 'Tell me how Christmas is celebrated in 6 different countries, with one fun tradition each.'],
        ['😂', 'Door 13', 'Christmas crackers were invented in London in 1847 by a sweet-maker.', 'Christmas jokes', 'Tell me 10 family-friendly Christmas cracker jokes.'],
        ['🎨', 'Door 14', 'The first Christmas card was sent in 1843 in England.', 'Write my card messages', 'Help me write warm Christmas card messages. Ask me who they\'re for (family, friends, colleagues) and write a few for each.'],
        ['🌟', 'Door 15', 'The star on top of the tree represents the Star of Bethlehem.', 'Decorating ideas', 'Give me creative Christmas decorating ideas I can do cheaply at home.'],
        ['🎬', 'Door 16', 'Watching a Christmas film together is one of the most loved family traditions.', 'Film night picks', 'Suggest 10 Christmas films for a family film night, with one line on why each is great.'],
        ['🙏', 'Door 17', 'Christmas celebrates the birth of Jesus, remembered by Christians around the world.', 'The Christmas story', 'Tell the Christmas nativity story simply, in a way suitable for children.'],
        ['🎲', 'Door 18', 'Board games sell more in December than any other month.', 'Party games', 'Give me 8 fun Christmas party games for a mix of ages, with simple rules.'],
        ['🥤', 'Door 19', 'Hot chocolate has been a winter favourite since the 1600s.', 'Festive drinks', 'Give me 5 easy festive drink recipes, including non-alcoholic ones.'],
        ['💌', 'Door 20', 'A handwritten thank-you note can mean more than the gift itself.', 'Thank-you notes', 'Write 5 short, warm thank-you notes for Christmas gifts I can adapt.'],
        ['🧹', 'Door 21', 'Planning ahead makes the big day far less stressful.', 'Christmas Eve plan', 'Make me a calm, step-by-step plan for Christmas Eve and Christmas morning so nothing is forgotten.'],
        ['🎤', 'Door 22', 'Carol singing door to door dates back hundreds of years.', 'A Christmas poem', 'Write a joyful Christmas poem for my family. Ask me a few names and fun memories from this year first.'],
        ['🎆', 'Door 23', 'Many people make New Year resolutions — about a third keep them.', 'New Year goals', 'Help me set 3 realistic New Year goals and a simple plan to keep each one.'],
        ['🎄', 'Door 24', 'Merry Christmas Eve! Tomorrow is the big day.', 'A Christmas message', 'Write a short, heartfelt Christmas message I can send to everyone I love.'],
    ];
    function openedDoors() { try { return JSON.parse(store('zp_advent') || '[]'); } catch (e) { return []; } }
    function canOpen(i) {
        var now = new Date(), m = now.getMonth(), d = now.getDate();
        if (i === 0) return inSeason(now);
        return (m === 11 && d >= i) || (m === 0 && d <= 2);
    }
    function advent() {
        if (!window.ZUI) return;
        var Z = window.ZUI;
        var m = Z.modal({ id: 'xm-advent', title: 'Advent calendar', sub: countdownText().replace(/^\S+\s/, '') + ' — a new door every day', icon: 'gift', wide: true });
        var opened = openedDoors();
        var html = '<div class="xm-doors">';
        DOORS.forEach(function (dr, i) {
            var open = opened.indexOf(i) >= 0, ok = canOpen(i);
            html += '<button type="button" class="xm-door' + (open ? ' open' : '') + (ok ? '' : ' locked') + (i === 0 ? ' warm' : '') + '" data-i="' + i + '">' +
                    '<span class="xm-dn">' + (i === 0 ? '⭐' : i) + '</span>' + (open ? '<span class="xm-de">' + dr[0] + '</span>' : '') + '</button>';
        });
        html += '</div><div class="xm-reveal" hidden></div>' +
            '<div class="xm-snowset"><span>Snow:</span>' + ['off', 'light', 'lots'].map(function (l) { return '<button type="button" data-snow="' + l + '" class="' + (snowLevel() === l ? 'on' : '') + '">' + { off: 'Off', light: 'Light', lots: 'Lots' }[l] + '</button>'; }).join('') +
            '<span class="xm-caught">' + ic('bauble') + (parseInt(store(SCORE_KEY) || '0', 10)) + ' baubles caught</span></div>';
        m.body.innerHTML = html;
        m.body.addEventListener('click', function (e) {
            var sn = e.target.closest('[data-snow]');
            if (sn) { store('zp_xmas_snow', sn.dataset.snow); m.body.querySelectorAll('[data-snow]').forEach(function (b) { b.classList.toggle('on', b === sn); }); startSnow(); return; }
            var b = e.target.closest('.xm-door'); if (!b) return;
            var i = +b.dataset.i, dr = DOORS[i];
            if (!canOpen(i)) { toast(i ? 'Door ' + i + ' opens on ' + i + ' December 🎁' : 'Not yet!', ''); b.classList.add('shake'); setTimeout(function () { b.classList.remove('shake'); }, 500); return; }
            var r = b.getBoundingClientRect(); sparkle(r.left + r.width / 2, r.top + r.height / 2, 14);
            if (opened.indexOf(i) < 0) { opened.push(i); store('zp_advent', JSON.stringify(opened)); b.classList.add('open'); b.insertAdjacentHTML('beforeend', '<span class="xm-de">' + dr[0] + '</span>'); }
            var rv = m.body.querySelector('.xm-reveal'); rv.hidden = false;
            rv.innerHTML = '<div class="xm-rv-e">' + dr[0] + '</div><div><b>' + dr[1] + '</b><p></p><button type="button" class="zu-btn pri sm">' + dr[3] + ' →</button></div>';
            rv.querySelector('p').textContent = dr[2];
            rv.querySelector('button').onclick = function () { m.close(); if (window.ZTools) ZTools.newChatWith(dr[4]); };
            rv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }

    function cardMaker() {
        if (!window.ZUI) return;
        var Z = window.ZUI;
        var m = Z.modal({ id: 'xm-card', title: 'Make a Christmas card', sub: 'A picture and the words to go with it', icon: 'gift' });
        m.body.innerHTML = '<label class="zu-l">Who is it for?</label><input class="zu-in" id="xm-to" placeholder="e.g. Grandma, my team at work, the Okello family">' +
            '<label class="zu-l">From</label><input class="zu-in" id="xm-from" placeholder="Your name(s)">' +
            '<label class="zu-l">Feel</label><select class="zu-in" id="xm-feel"><option>Warm and heartfelt</option><option>Funny</option><option>Faith-filled</option><option>For children</option><option>Professional</option></select>' +
            '<label class="zu-l">Picture idea <em>(optional)</em></label><input class="zu-in" id="xm-pic" placeholder="e.g. a robin on a snowy branch, our dog in a Santa hat">' +
            '<button class="zu-btn pri wide" data-a="go">Make my card</button>';
        m.body.querySelector('[data-a=go]').onclick = function () {
            var to = document.getElementById('xm-to').value.trim() || 'someone special', from = document.getElementById('xm-from').value.trim();
            var feel = document.getElementById('xm-feel').value, pic = document.getElementById('xm-pic').value.trim() || 'a cosy, festive Christmas scene';
            m.close();
            if (window.ZTools) ZTools.newChatWith('Make me a Christmas card for ' + to + (from ? ' from ' + from : '') + '. Feel: ' + feel.toLowerCase() +
                '. First create the card picture: ' + pic + ', beautiful and festive, with space for words, no text in the image. Then write the message for inside the card (4-6 lines), plus one shorter alternative.');
        };
        setTimeout(function () { var i = document.getElementById('xm-to'); if (i) i.focus(); }, 30);
    }

    // Santa's sleigh crosses the sky now and then — tap it for a treat.
    var sleighTimer = null;
    function sleigh() {
        if (document.hidden || !isOn() || quiet()) return;
        var s = document.createElement('button');
        s.type = 'button'; s.className = 'xm-sleigh'; s.setAttribute('aria-label', 'Santa\'s sleigh — tap it');
        // Emoji reindeer face left; the group is mirrored so they lead the way to the right.
        s.innerHTML = '<img src="' + IMG + 'sleigh.webp" alt="Santa\'s sleigh">';
        s.style.top = (70 + Math.random() * Math.max(40, window.innerHeight * 0.25)) + 'px';
        s.addEventListener('click', function (e) {
            e.stopPropagation();
            sparkle(e.clientX, e.clientY, 24);
            var n = parseInt(store(SCORE_KEY) || '0', 10) + 3; store(SCORE_KEY, String(n)); showScore(n);
            toast('Ho ho ho! Santa dropped 3 baubles for you 🎅', 'success');
            s.remove();
        });
        playLayer().appendChild(s);
        setTimeout(function () { if (s.parentNode) s.remove(); }, 15000);
    }
    function scheduleSleigh(first) {
        clearTimeout(sleighTimer);
        if (quiet()) return;
        sleighTimer = setTimeout(function () { if (isOn()) { sleigh(); scheduleSleigh(); } }, first ? 40000 : 180000 + Math.random() * 180000);
    }

    // Festive ideas on the new-chat screen.
    var IDEAS = [
        ['gift', 'Gift ideas', 'Help me find Christmas gift ideas. Ask me who they\'re for and my budget first.'],
        ['card', 'Card messages', 'Help me write Christmas card messages for family, friends and colleagues.'],
        ['dinner', 'Christmas dinner plan', 'Plan a Christmas dinner for my family on a budget, with a shopping list and cooking timeline.'],
        ['book', 'A story for tonight', 'Write a short, magical Christmas story I can read to the kids tonight.'],
    ];
    function patchIdeas() {
        if (!isOn()) return;
        var w = document.querySelector('#chat-container .welcome-message');
        if (!w || w.querySelector('.xm-ideas') || w.querySelector('.zw-hero')) return;
        var box = document.createElement('div');
        box.className = 'xm-ideas';
        box.innerHTML = '<span class="xm-ideas-t"><i></i>' + ic('gift') + 'Christmas Ideas' + ic('gift') + '<i></i></span>' + IDEAS.map(function (x, i) { return '<button type="button" data-i="' + i + '">' + ic(x[0]) + x[1] + '</button>'; }).join('') +
            '<button type="button" data-a="advent">' + ic('tree') + 'Advent calendar</button>';
        box.addEventListener('click', function (e) {
            var b = e.target.closest('button'); if (!b) return;
            if (b.dataset.a === 'advent') return advent();
            var inp = document.getElementById('user-input'); if (!inp) return;
            inp.value = IDEAS[+b.dataset.i][2]; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus();
        });
        var gc = w.querySelector('.zp-greetcard');
        w.insertBefore(box, gc || null);   // the ideas sit right under the garland, the welcome-back card after
    }
    /* 26.6.6: the Christmas welcome always fits on one screen — no scrolling just to see it. If it's
       taller than the space above the typing box, it's zoomed down to fit. */
    function fitWelcome() {
        var c = document.getElementById('chat-container');
        var w = c && c.querySelector('.welcome-message');
        if (!w) return;
        if (!isOn() || !w.querySelector('.xm-hero')) { w.style.zoom = ''; return; }
        w.style.zoom = '';
        var cs = getComputedStyle(c);
        var room = c.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0) - 6;
        var need = w.offsetHeight;
        if (need > room && room > 120) w.style.zoom = String(Math.max(0.5, Math.floor(room / need * 100) / 100));
    }
    var fitT = null;
    function fitSoon() { clearTimeout(fitT); fitT = setTimeout(fitWelcome, 60); }
    window.addEventListener('resize', fitSoon);
    function watchWelcome() {
        var c = document.getElementById('chat-container');
        if (!c || c._xmw) return;
        c._xmw = true;
        var dim = function () { var fx = document.getElementById('xm-fx'); if (fx) fx.classList.toggle('dim', !c.querySelector('.welcome-message')); };
        new MutationObserver(function () { if (isOn()) { patchIdeas(); patchWelcome(); dim(); fitSoon(); } }).observe(c, { childList: true });
        dim();
        patchIdeas();
        setTimeout(function () { if (isOn()) { patchHero(); fitWelcome(); } }, 1500);   // the name arrives a moment after the page
        fitSoon();
        // pictures and fonts change the height once they arrive
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitSoon);
        c.addEventListener('load', fitSoon, true);
    }
    // typing shakes a little snow off the typing box; sending knocks a big puff off
    var shakeWired = false, keyN = 0;
    function wireShake() {
        if (shakeWired) return; shakeWired = true;
        document.addEventListener('keydown', function (e) {
            if (!isOn() || !e.target || e.target.id !== 'user-input') return;
            if (e.key === 'Enter' && !e.shiftKey && e.target.value.trim()) { SN_knock('.composer-box', 0.75); return; }
            if (++keyN % 5 === 0) SN_knock('.composer-box', 0.06);
        }, true);
        document.addEventListener('click', function (e) {
            if (!isOn()) return;
            if (e.target.closest && e.target.closest('#send-btn')) SN_knock('.composer-box', 0.75);
            else if (e.target.closest && e.target.closest('#new-chat-btn')) SN_knock('#new-chat-btn', 0.8);
        }, true);
    }
    function extrasOn() { buildCountdown(); scheduleSleigh(true); watchWelcome(); wireShake(); }
    function extrasOff() {
        clearTimeout(sleighTimer);
        ['xm-count'].forEach(function (id) { var el = document.getElementById(id); if (el) el.remove(); });
        document.querySelectorAll('.xm-ideas,.xm-sleigh,.xm-hero').forEach(function (el) { el.remove(); });
        document.querySelectorAll('.welcome-message').forEach(function (el) { el.style.zoom = ''; });
    }

    window.Christmas = {
        apply: apply, shouldBeOn: shouldBeOn, inSeason: inSeason, check: check,
        maySee: maySee, sparkle: sparkle, dropBauble: dropBauble,
        advent: advent, cardMaker: cardMaker, sleigh: sleigh, startSnow: startSnow,
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
