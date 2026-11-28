// 26.6.8 — life for the Vault sign-in screen: a drifting starfield whose stars link up into a
// network around your pointer, bursts of light as you type your PIN, and a live clock.
(function () {
    'use strict';
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function clock() {
        var c = document.getElementById('va-clock'), d = document.getElementById('va-date'), g = document.getElementById('va-greet');
        var now = new Date();
        if (c) c.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (d) d.textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        if (g) {
            var h = now.getHours();
            g.dataset.tod = h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Working late';
            if (g.dataset.name) g.textContent = g.dataset.tod + ', ' + g.dataset.name + ' — the Vault is locked.';
        }
    }
    window.VAFX = {
        greet: function (name) { var g = document.getElementById('va-greet'); if (g) { g.dataset.name = name; clock(); } },
        burst: function () {},
    };

    function stars() {
        var cv = document.getElementById('va-stars');
        if (!cv || reduce) return;
        var ctx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
        var W = 0, H = 0, pts = [], sparks = [], mouse = { x: -9999, y: -9999 };
        function size() {
            W = window.innerWidth; H = window.innerHeight;
            cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            var want = Math.min(140, Math.round(W * H / 11000));
            while (pts.length < want) pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * 12, vy: (Math.random() - .5) * 12,
                r: .6 + Math.random() * 1.6, tw: Math.random() * 6.28, hue: [210, 260, 290, 190][Math.floor(Math.random() * 4)] });
            pts.length = want;
        }
        size(); window.addEventListener('resize', size);
        window.addEventListener('pointermove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; });
        document.addEventListener('pointerleave', function () { mouse.x = mouse.y = -9999; });
        VAFX.burst = function (color) {
            var card = document.getElementById('va-dots'), r = card ? card.getBoundingClientRect() : { left: W / 2, top: H / 2, width: 0, height: 0 };
            var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            for (var i = 0; i < 26; i++) {
                var a = Math.random() * 6.28, s = 60 + Math.random() * 220;
                sparks.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, c: color || (Math.random() < .5 ? '96,165,250' : '192,132,252') });
            }
        };
        var last = performance.now();
        (function frame(now) {
            requestAnimationFrame(frame);
            var dt = Math.min(.05, (now - last) / 1000); last = now;
            if (document.hidden || cv.closest('[hidden]')) return;   // the /vault lock screen is hidden while you're in
            ctx.clearRect(0, 0, W, H);
            for (var i = 0; i < pts.length; i++) {
                var p = pts[i];
                var mdx = mouse.x - p.x, mdy = mouse.y - p.y, md = Math.sqrt(mdx * mdx + mdy * mdy);
                if (md < 180 && md > 1) { p.vx += mdx / md * 14 * dt; p.vy += mdy / md * 14 * dt; }
                p.vx *= Math.pow(.6, dt); p.vy *= Math.pow(.6, dt);
                p.vx += (Math.random() - .5) * 6 * dt; p.vy += (Math.random() - .5) * 6 * dt;
                p.x += (p.vx + 4) * dt; p.y += p.vy * dt;
                if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10; if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
                p.tw += dt * 2;
                var al = .35 + .45 * (0.5 + 0.5 * Math.sin(p.tw));
                ctx.fillStyle = 'hsla(' + p.hue + ',90%,80%,' + al + ')';
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
            }
            // link stars near each other and near the pointer
            ctx.lineWidth = .7;
            for (var a = 0; a < pts.length; a++) for (var b = a + 1; b < pts.length; b++) {
                var dx = pts[a].x - pts[b].x, dy = pts[a].y - pts[b].y, d2 = dx * dx + dy * dy;
                if (d2 > 13000) continue;
                var nearM = Math.hypot(mouse.x - pts[a].x, mouse.y - pts[a].y) < 200;
                var o = (1 - d2 / 13000) * (nearM ? .45 : .12);
                ctx.strokeStyle = 'rgba(130,160,255,' + o + ')';
                ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); ctx.stroke();
            }
            for (var s = sparks.length - 1; s >= 0; s--) {
                var k = sparks[s]; k.life -= dt * 1.4; if (k.life <= 0) { sparks.splice(s, 1); continue; }
                k.vx *= Math.pow(.2, dt); k.vy *= Math.pow(.2, dt); k.x += k.vx * dt; k.y += k.vy * dt;
                ctx.fillStyle = 'rgba(' + k.c + ',' + k.life + ')';
                ctx.beginPath(); ctx.arc(k.x, k.y, 1.8 * k.life + .4, 0, 6.283); ctx.fill();
            }
        })(last);
    }

    document.addEventListener('DOMContentLoaded', function () { clock(); setInterval(clock, 1000); stars(); });
})();
