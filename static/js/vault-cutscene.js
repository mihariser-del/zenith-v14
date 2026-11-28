// 26.6.9 — the Vault unlock cutscene. Plays after the right PIN: a security HUD runs its
// checks, "ACCESS GRANTED" slams in, the bolts on a round vault door pull back, the door
// splits open into a hyperspace rush of light, and the Vault appears.
// VaultCutscene.play({ name, role }) → Promise that resolves when it's over (about 3.4 s).
// Click, Enter, Space or Esc skips it. People who prefer reduced motion get a short fade.
(function () {
    'use strict';
    var CSS = `
#vcs{position:fixed;inset:0;z-index:2147483000;background:#03050c;overflow:hidden;font-family:Inter,-apple-system,'Segoe UI',sans-serif;color:#cfe3ff;cursor:pointer;animation:vcsIn .25s ease-out both}
@keyframes vcsIn{from{opacity:0}}
#vcs canvas{position:absolute;inset:0;width:100%;height:100%}
#vcs .flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
#vcs .flash.go{animation:vcsFlash .35s ease-out}
@keyframes vcsFlash{0%{opacity:.55}100%{opacity:0}}
#vcs .scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px);mix-blend-mode:overlay}
#vcs .vign{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,.75) 100%)}
#vcs .stage{position:absolute;left:50%;top:50%;width:min(62vmin,520px);height:min(62vmin,520px);transform:translate(-50%,-50%) scale(.6);opacity:0;animation:vcsDoorIn .7s cubic-bezier(.2,1.2,.3,1) .05s forwards}
@keyframes vcsDoorIn{to{transform:translate(-50%,-50%) scale(1);opacity:1}}
#vcs .half{position:absolute;inset:0;transition:transform .9s cubic-bezier(.7,0,.2,1)}
#vcs .half.l{clip-path:inset(0 50% 0 0)} #vcs .half.r{clip-path:inset(0 0 0 50%)}
#vcs.open .half.l{transform:translateX(-62vw) rotate(-8deg)} #vcs.open .half.r{transform:translateX(62vw) rotate(8deg)}
#vcs .door{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 50% 40%,#1b2a4a,#0a1226 60%,#050912);box-shadow:0 0 0 2px rgba(120,170,255,.35),0 0 60px rgba(80,140,255,.35),inset 0 0 60px rgba(0,0,0,.8)}
#vcs .ticks{position:absolute;inset:4%;border-radius:50%;background:repeating-conic-gradient(rgba(140,190,255,.55) 0 1deg,transparent 1deg 6deg);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 10px),#000 calc(100% - 9px));mask:radial-gradient(farthest-side,transparent calc(100% - 10px),#000 calc(100% - 9px));animation:vcsRot 9s linear infinite}
#vcs .ring{position:absolute;border-radius:50%;border:2px solid rgba(110,170,255,.5)}
#vcs .ring.a{inset:14%;border-style:dashed;border-color:rgba(167,139,250,.65);animation:vcsRot 5s linear infinite reverse}
#vcs .ring.b{inset:22%;border-width:6px;border-color:transparent;border-top-color:#60a5fa;border-bottom-color:#a855f7;filter:drop-shadow(0 0 8px #60a5fa);animation:vcsRot 2.2s linear infinite}
#vcs .ring.c{inset:30%;border-color:rgba(96,165,250,.3);box-shadow:inset 0 0 30px rgba(96,165,250,.25)}
#vcs.spin .ring.b{animation-duration:.45s} #vcs.spin .ring.a{animation-duration:1.2s} #vcs.spin .ticks{animation-duration:1.6s}
@keyframes vcsRot{to{transform:rotate(360deg)}}
#vcs .bolt{position:absolute;left:50%;top:50%;width:9%;height:4.2%;margin:-2.1% 0 0 -4.5%;border-radius:4px;background:linear-gradient(180deg,#cfd8ea,#6b7a99);box-shadow:0 0 10px rgba(150,190,255,.5)}
#vcs .bolt i{display:block;width:100%;height:100%;border-radius:4px;transition:transform .45s cubic-bezier(.6,0,.2,1)}
#vcs .hub{position:absolute;inset:36%;border-radius:50%;background:radial-gradient(circle at 50% 35%,#2b3f70,#0b1430);box-shadow:0 0 0 3px rgba(150,190,255,.4),0 0 40px rgba(96,165,250,.6),inset 0 0 20px rgba(0,0,0,.7);display:grid;place-items:center}
#vcs .hub b{font:900 clamp(28px,7vmin,58px)/1 Inter,sans-serif;background:linear-gradient(135deg,#93c5fd,#c084fc);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 12px rgba(147,197,253,.8))}
#vcs.granted .hub{box-shadow:0 0 0 3px #4ade80,0 0 60px #22c55e,inset 0 0 20px rgba(0,0,0,.6)}
#vcs .core{position:absolute;left:50%;top:50%;width:60px;height:90vh;transform:translate(-50%,-50%) scaleX(0);border-radius:50%;background:radial-gradient(ellipse at center,#ffffff 0%,rgba(224,242,255,.95) 18%,rgba(147,197,253,.55) 42%,rgba(99,102,241,.18) 62%,transparent 72%);opacity:0;mix-blend-mode:screen}
#vcs.open .core{animation:vcsCore 1.1s cubic-bezier(.5,0,.2,1) forwards}
@keyframes vcsCore{0%{opacity:.9;transform:translate(-50%,-50%) scaleX(.2)}55%{opacity:1;transform:translate(-50%,-50%) scaleX(9) scaleY(1.1)}100%{opacity:0;transform:translate(-50%,-50%) scaleX(40) scaleY(1.6)}}
#vcs .hud{position:absolute;left:4vw;top:6vh;font:600 12px/1.9 'JetBrains Mono',Consolas,monospace;color:#8fb6ff;letter-spacing:.5px;text-shadow:0 0 8px rgba(96,165,250,.6);white-space:pre}
#vcs .hud .ok{color:#4ade80}
#vcs .hud2{position:absolute;right:4vw;bottom:7vh;text-align:right;font:600 11px/1.8 'JetBrains Mono',Consolas,monospace;color:#7c93c9;white-space:pre}
#vcs .bar{position:absolute;left:50%;bottom:12vh;width:min(420px,70vw);transform:translateX(-50%);height:4px;border-radius:4px;background:rgba(96,165,250,.15);overflow:hidden}
#vcs .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#60a5fa,#a855f7,#4ade80);box-shadow:0 0 12px #60a5fa;transition:width 1.1s cubic-bezier(.4,0,.2,1)}
#vcs .bar-t{position:absolute;left:50%;bottom:calc(12vh + 12px);transform:translateX(-50%);font:700 10px/1 'JetBrains Mono',Consolas,monospace;letter-spacing:3px;color:#7c93c9}
#vcs .grant{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(2.4);opacity:0;text-align:center;pointer-events:none;white-space:nowrap}
#vcs .grant h1{margin:0;font:900 clamp(30px,7.5vw,92px)/1 Inter,sans-serif;letter-spacing:.12em;color:#eaffef;text-shadow:-3px 0 rgba(255,0,80,.75),3px 0 rgba(0,220,255,.75),0 0 30px rgba(74,222,128,.9)}
#vcs .grant p{margin:14px 0 0;font:700 clamp(11px,1.4vw,15px)/1 'JetBrains Mono',Consolas,monospace;letter-spacing:.45em;color:#86efac}
#vcs.granted .grant{animation:vcsSlam .5s cubic-bezier(.2,1.4,.3,1) forwards,vcsGlitch .9s steps(2) .5s 2}
#vcs.open .grant{transition:opacity .4s;opacity:0!important;animation:none}
@keyframes vcsSlam{to{transform:translate(-50%,-50%) scale(1);opacity:1}}
@keyframes vcsGlitch{0%{transform:translate(-50%,-50%) skewX(0)}20%{transform:translate(calc(-50% + 6px),-50%) skewX(-8deg);clip-path:inset(10% 0 55% 0)}40%{transform:translate(calc(-50% - 5px),-50%);clip-path:inset(60% 0 5% 0)}60%{transform:translate(-50%,-50%);clip-path:none}100%{transform:translate(-50%,-50%);opacity:1}}
#vcs .skip{position:absolute;right:16px;top:14px;font:600 11px/1 Inter,sans-serif;color:#5d6b8f;letter-spacing:.5px}
#vcs.out{animation:vcsOut .45s ease-in forwards}
@keyframes vcsOut{to{opacity:0}}
@media (max-width:600px){#vcs .hud{font-size:10px;top:5vh}#vcs .hud2{display:none}}
`;
    function sound() {
        // a soft rising hum, two servo clunks and a bright chime — quiet, and only if the browser allows it
        try {
            var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return function () {};
            var a = new AC(), m = a.createGain(); m.gain.value = 0.16; m.connect(a.destination);
            var t0 = a.currentTime;
            var hum = a.createOscillator(), hg = a.createGain(); hum.type = 'sawtooth'; hum.frequency.setValueAtTime(55, t0); hum.frequency.exponentialRampToValueAtTime(220, t0 + 2.2);
            var lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t0); lp.frequency.exponentialRampToValueAtTime(2400, t0 + 2.4);
            hg.gain.setValueAtTime(0.0001, t0); hg.gain.exponentialRampToValueAtTime(0.5, t0 + 0.4); hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.0);
            hum.connect(lp); lp.connect(hg); hg.connect(m); hum.start(t0); hum.stop(t0 + 3.1);
            function clunk(at) {
                var o = a.createOscillator(), g = a.createGain(); o.type = 'square'; o.frequency.setValueAtTime(140, t0 + at); o.frequency.exponentialRampToValueAtTime(40, t0 + at + 0.12);
                g.gain.setValueAtTime(0.6, t0 + at); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.16); o.connect(g); g.connect(m); o.start(t0 + at); o.stop(t0 + at + 0.2);
            }
            clunk(1.25); clunk(1.45); clunk(1.95);
            [880, 1318.5, 1760].forEach(function (f, i) {
                var o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = f;
                var at = t0 + 1.15 + i * 0.07; g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.35, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 1.2);
                o.connect(g); g.connect(m); o.start(at); o.stop(at + 1.3);
            });
            // the whoosh as the door opens: filtered noise
            var len = a.sampleRate * 1.4, buf = a.createBuffer(1, len, a.sampleRate), ch = buf.getChannelData(0);
            for (var i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
            var n = a.createBufferSource(), bp = a.createBiquadFilter(), ng = a.createGain(); n.buffer = buf; bp.type = 'bandpass'; bp.Q.value = 0.8;
            bp.frequency.setValueAtTime(300, t0 + 2.0); bp.frequency.exponentialRampToValueAtTime(3500, t0 + 3.0);
            ng.gain.setValueAtTime(0.0001, t0 + 2.0); ng.gain.exponentialRampToValueAtTime(0.7, t0 + 2.2); ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.3);
            n.connect(bp); bp.connect(ng); ng.connect(m); n.start(t0 + 2.0);
            return function () { try { m.gain.setTargetAtTime(0, a.currentTime, 0.05); setTimeout(function () { a.close(); }, 400); } catch (e) {} };
        } catch (e) { return function () {}; }
    }

    function play(opts) {
        opts = opts || {};
        var name = String(opts.name || '').toUpperCase().slice(0, 32), role = String(opts.role || 'OWNER').toUpperCase();
        return new Promise(function (resolve) {
            if (!document.getElementById('vcs-css')) { var st = document.createElement('style'); st.id = 'vcs-css'; st.textContent = CSS; document.head.appendChild(st); }
            var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            var el = document.createElement('div'); el.id = 'vcs'; el.setAttribute('role', 'status'); el.setAttribute('aria-label', 'Access granted, opening the Vault');
            var bolts = ''; for (var b = 0; b < 8; b++) bolts += '<div class="bolt" style="transform:rotate(' + (b * 45) + 'deg) translateX(min(19vmin,160px))"><i></i></div>';
            var face = '<div class="door"></div><div class="ticks"></div><div class="ring a"></div><div class="ring b"></div><div class="ring c"></div>' + bolts + '<div class="hub"><b>Z</b></div>';
            el.innerHTML = '<canvas></canvas><div class="core"></div><div class="stage"><div class="half l">' + face + '</div><div class="half r">' + face + '</div></div>' +
                '<div class="grant"><h1>ACCESS GRANTED</h1><p>WELCOME BACK' + (name ? ', ' + name.replace(/[<>&"]/g, '') : '') + '</p></div>' +
                '<div class="hud"></div><div class="hud2"></div><div class="bar-t">DECRYPTING VAULT</div><div class="bar"><i></i></div>' +
                '<div class="scan"></div><div class="vign"></div><div class="flash go"></div><div class="skip">Click to skip</div>';
            document.body.appendChild(el);
            var done = false, timers = [], raf = 0, stopSound = function () {};
            function finish() {
                if (done) return; done = true;
                timers.forEach(clearTimeout); stopSound();
                el.classList.add('out');
                document.removeEventListener('keydown', onKey, true);
                setTimeout(function () { cancelAnimationFrame(raf); el.remove(); resolve(); }, 430);
            }
            function onKey(e) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); } }
            el.addEventListener('click', finish);
            document.addEventListener('keydown', onKey, true);
            if (reduce) { el.classList.add('granted'); timers.push(setTimeout(finish, 900)); return; }
            stopSound = sound();
            function at(ms, fn) { timers.push(setTimeout(fn, ms)); }

            // HUD: security checks typing out
            var hud = el.querySelector('.hud'), lines = [
                ['> VAULT SECURITY v26.6', ''], ['> PIN hash ................ ', 'MATCH'], ['> Session key ............. ', 'ISSUED'],
                ['> Decrypting modules ...... ', 'OK'], ['> Clearance ............... ', role], ['> Bolts ................... ', 'RELEASED']];
            var li = 0;
            function nextLine() {
                if (li >= lines.length || done) return;
                var L = lines[li++], row = document.createElement('div'); hud.appendChild(row);
                var txt = L[0], k = 0;
                (function type() { if (done) return; row.textContent = txt.slice(0, ++k); if (k < txt.length) at(9, type); else { if (L[1]) { var s = document.createElement('span'); s.className = 'ok'; s.textContent = L[1]; row.appendChild(s); } at(70, nextLine); } })();
            }
            nextLine();
            var hud2 = el.querySelector('.hud2'), hex = function () { return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0').toUpperCase(); };
            var hexT = setInterval(function () { if (done) return clearInterval(hexT); hud2.textContent = [hex() + ' ' + hex(), hex() + ' ' + hex(), 'NODE ZP-01 · AES-256', new Date().toISOString().slice(11, 23) + ' UTC'].join('\n'); }, 90);
            at(60, function () { el.querySelector('.bar i').style.width = '100%'; });

            // the starfield that turns into a hyperspace rush when the door opens
            var cv = el.querySelector('canvas'), ctx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1), W, H, stars = [], speed = 0.25, warp = false;
            function size() { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
            size();
            for (var s = 0; s < 420; s++) stars.push({ x: (Math.random() - .5) * 2, y: (Math.random() - .5) * 2, z: Math.random(), pz: 0 });
            var last = performance.now();
            (function frame(now) {
                raf = requestAnimationFrame(frame);
                var dt = Math.min(.05, (now - last) / 1000); last = now;
                speed += ((warp ? 3.2 : 0.18) - speed) * Math.min(1, dt * (warp ? 1.6 : 3));
                ctx.fillStyle = warp ? 'rgba(3,5,12,.35)' : 'rgba(3,5,12,.9)'; ctx.fillRect(0, 0, W, H);
                var cx = W / 2, cy = H / 2, f = Math.max(W, H) * 0.5;
                for (var i = 0; i < stars.length; i++) {
                    var p = stars[i]; p.pz = p.z; p.z -= speed * dt;
                    if (p.z <= 0.02) { p.x = (Math.random() - .5) * 2; p.y = (Math.random() - .5) * 2; p.z = 1; p.pz = 1; continue; }
                    var sx = cx + p.x / p.z * f * 0.5, sy = cy + p.y / p.z * f * 0.5, px = cx + p.x / p.pz * f * 0.5, py = cy + p.y / p.pz * f * 0.5;
                    var br = Math.min(1, (1 - p.z) * 1.4);
                    ctx.strokeStyle = 'rgba(' + (warp ? '200,225,255,' : '150,180,255,') + br + ')';
                    ctx.lineWidth = Math.max(.6, (1 - p.z) * (warp ? 3 : 2));
                    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke();
                }
            })(last);
            window.addEventListener('resize', size, { once: true });

            // the timeline
            at(1150, function () { el.classList.add('granted', 'spin'); var fl = el.querySelector('.flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); });
            at(1300, function () { el.querySelectorAll('.bolt i').forEach(function (b, i) { setTimeout(function () { b.style.transform = 'translateX(-55%)'; }, (i % 8) * 40); }); });
            at(2050, function () { el.classList.add('open'); warp = true; });
            at(2900, function () { var fl = el.querySelector('.flash'); fl.style.background = '#e8f2ff'; fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); });
            at(3150, finish);
        });
    }
    window.VaultCutscene = { play: play };
})();
