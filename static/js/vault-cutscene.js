// 26.6.9 — the Vault unlock cutscene. Plays after the right PIN: a security HUD runs its
// checks, "ACCESS GRANTED" slams in, the bolts on a round vault door pull back, the door
// splits open into a hyperspace rush of light, and the Vault appears.
// VaultCutscene.play({ name, role }) → Promise that resolves when it's over (about 7 s).
// 26.6.10: real pictures — a steel vault door with a turning locking wheel, and the glowing vault corridor behind it.
// Click, Enter, Space or Esc skips it. People who prefer reduced motion get a short fade.
(function () {
    'use strict';
    var IMG = '/static/img/vault/';
    var CSS = `
#vcs{position:fixed;inset:0;z-index:2147483000;background:#02040a;overflow:hidden;font-family:Inter,-apple-system,'Segoe UI',sans-serif;color:#cfe3ff;cursor:pointer;animation:vcsIn .3s ease-out both}
@keyframes vcsIn{from{opacity:0}}
#vcs .inside{position:absolute;inset:-4%;background:url(${IMG}inside.jpg) center/cover no-repeat;opacity:0;transform:scale(1.25);filter:brightness(.5) saturate(1.2)}
#vcs.open .inside{opacity:1;transform:scale(1);filter:brightness(1.05) saturate(1.25);transition:opacity .5s ease-out,transform 1.1s cubic-bezier(.3,0,.2,1),filter 1s}
#vcs.fly .inside{transform:scale(2.6);filter:brightness(1.6) saturate(1.3) blur(3px);transition:transform 1.7s cubic-bezier(.6,0,.4,1),filter 1.7s ease-in}
#vcs canvas{position:absolute;inset:0;width:100%;height:100%}
#vcs.open canvas{mix-blend-mode:screen}
#vcs .flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
#vcs .flash.go{animation:vcsFlash .4s ease-out}
@keyframes vcsFlash{0%{opacity:.55}100%{opacity:0}}
#vcs .flash.end{animation:vcsFlashEnd .55s ease-in forwards}
@keyframes vcsFlashEnd{to{opacity:1}}
#vcs .scanl{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.03) 0 1px,transparent 1px 3px);mix-blend-mode:overlay}
#vcs .vign{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,.8) 100%)}
#vcs .stage{position:absolute;left:50%;top:50%;width:min(76vmin,640px);height:min(76vmin,640px);transform:translate(-50%,-50%) scale(.55);opacity:0;transition:transform 1.6s cubic-bezier(.2,.9,.3,1),opacity .6s}
#vcs.in .stage{transform:translate(-50%,-50%) scale(1);opacity:1}
#vcs.push .stage{transform:translate(-50%,-50%) scale(1.08);transition:transform 2.6s ease-in-out}
#vcs .half{position:absolute;inset:0;transition:transform 1.2s cubic-bezier(.7,0,.2,1),filter 1.2s}
#vcs .half.l{clip-path:inset(-5% 50% -5% -5%)} #vcs .half.r{clip-path:inset(-5% -5% -5% 50%)}
#vcs.open .half.l{transform:translateX(-70vw) rotateY(25deg)} #vcs.open .half.r{transform:translateX(70vw) rotateY(-25deg)}
#vcs .door{position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(0 0 40px rgba(80,200,255,.35)) drop-shadow(0 20px 40px rgba(0,0,0,.8))}
#vcs .wheel{position:absolute;left:31.25%;top:37%;width:37.5%;height:37.5%;transition:transform 1.3s cubic-bezier(.5,0,.25,1)}
#vcs.turn .wheel{transform:rotate(300deg)}
#vcs .glow{position:absolute;left:31.25%;top:37%;width:37.5%;height:37.5%;border-radius:50%;opacity:0;background:radial-gradient(circle,rgba(74,222,128,.55),rgba(34,197,94,.15) 55%,transparent 70%);mix-blend-mode:screen;transition:opacity .4s}
#vcs.granted .glow{opacity:1;animation:vcsPulse 1s ease-in-out infinite}
@keyframes vcsPulse{50%{transform:scale(1.12);opacity:.7}}
#vcs .beam{position:absolute;left:-6%;right:-6%;height:3px;top:0;opacity:0;background:linear-gradient(90deg,transparent,#67e8f9 20%,#fff 50%,#67e8f9 80%,transparent);box-shadow:0 0 18px #22d3ee,0 0 40px #06b6d4}
#vcs.scan .beam{animation:vcsBeam 1.5s ease-in-out 2 alternate}
@keyframes vcsBeam{0%{top:4%;opacity:1}100%{top:96%;opacity:1}}
#vcs .ringfx{position:absolute;inset:-6%;border-radius:50%;border:2px solid rgba(103,232,249,.5);opacity:0}
#vcs.scan .ringfx{animation:vcsRingFx 1.4s ease-out infinite}
#vcs.scan .ringfx.b{animation-delay:.7s}
@keyframes vcsRingFx{0%{transform:scale(.6);opacity:.9}100%{transform:scale(1.25);opacity:0}}
#vcs .lock{position:absolute;left:50%;top:-9%;transform:translateX(-50%);font:700 11px/1 'JetBrains Mono',Consolas,monospace;letter-spacing:4px;color:#67e8f9;text-shadow:0 0 10px #22d3ee;white-space:nowrap}
#vcs.granted .lock{color:#4ade80;text-shadow:0 0 10px #22c55e}
#vcs.open .lock,#vcs.open .hud,#vcs.open .hud2,#vcs.open .bar,#vcs.open .bar-t{opacity:0;transition:opacity .4s}
#vcs .hud{position:absolute;left:4vw;top:6vh;font:600 12px/1.9 'JetBrains Mono',Consolas,monospace;color:#8fb6ff;letter-spacing:.5px;text-shadow:0 0 8px rgba(96,165,250,.6);white-space:pre}
#vcs .hud .ok{color:#4ade80}
#vcs .hud2{position:absolute;right:4vw;bottom:7vh;text-align:right;font:600 11px/1.8 'JetBrains Mono',Consolas,monospace;color:#7c93c9;white-space:pre}
#vcs .bar{position:absolute;left:50%;bottom:8vh;width:min(420px,70vw);transform:translateX(-50%);height:4px;border-radius:4px;background:rgba(96,165,250,.15);overflow:hidden}
#vcs .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#60a5fa,#a855f7,#4ade80);box-shadow:0 0 12px #60a5fa;transition:width 2.9s cubic-bezier(.4,0,.2,1)}
#vcs .bar-t{position:absolute;left:50%;bottom:calc(8vh + 12px);transform:translateX(-50%);font:700 10px/1 'JetBrains Mono',Consolas,monospace;letter-spacing:3px;color:#7c93c9}
#vcs .grant{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(2.4);opacity:0;text-align:center;pointer-events:none;white-space:nowrap;z-index:3}
#vcs .grant h1{margin:0;font:900 clamp(30px,7.5vw,96px)/1 Inter,sans-serif;letter-spacing:.12em;color:#eaffef;text-shadow:-3px 0 rgba(255,0,80,.75),3px 0 rgba(0,220,255,.75),0 0 30px rgba(74,222,128,.9),0 4px 30px rgba(0,0,0,.9)}
#vcs .grant p{margin:14px 0 0;font:700 clamp(11px,1.4vw,15px)/1 'JetBrains Mono',Consolas,monospace;letter-spacing:.45em;color:#86efac;text-shadow:0 2px 10px rgba(0,0,0,.9)}
#vcs.granted .grant{animation:vcsSlam .5s cubic-bezier(.2,1.4,.3,1) forwards,vcsGlitch .9s steps(2) .5s 2}
#vcs.open .grant{transition:opacity .5s;opacity:0!important;animation:none}
@keyframes vcsSlam{to{transform:translate(-50%,-50%) scale(1);opacity:1}}
@keyframes vcsGlitch{0%{transform:translate(-50%,-50%) skewX(0)}20%{transform:translate(calc(-50% + 6px),-50%) skewX(-8deg);clip-path:inset(10% 0 55% 0)}40%{transform:translate(calc(-50% - 5px),-50%);clip-path:inset(60% 0 5% 0)}60%{transform:translate(-50%,-50%);clip-path:none}100%{transform:translate(-50%,-50%);opacity:1}}
#vcs .title{position:absolute;left:50%;bottom:16vh;transform:translateX(-50%);opacity:0;text-align:center;white-space:nowrap;font:800 clamp(14px,2vw,22px)/1 Inter,sans-serif;letter-spacing:.6em;color:#fff;text-shadow:0 0 20px #60a5fa,0 2px 12px rgba(0,0,0,.9)}
#vcs.fly .title{opacity:1;transition:opacity .6s .2s;letter-spacing:.9em}
#vcs .skip{position:absolute;right:16px;top:14px;font:600 11px/1 Inter,sans-serif;color:#5d6b8f;letter-spacing:.5px;z-index:4}
#vcs.out{animation:vcsOut .5s ease-in forwards}
@keyframes vcsOut{to{opacity:0}}
@media (max-width:600px){#vcs .hud{font-size:10px;top:5vh}#vcs .hud2{display:none}}
`;
    // preload the pictures as soon as this file loads, so the cutscene never waits for them
    ['door.webp', 'wheel.webp', 'inside.jpg'].forEach(function (f) { var i = new Image(); i.src = IMG + f; });

    function sound() {
        // quiet and only if the browser allows it: a rising hum while scanning, a bright chime for
        // ACCESS GRANTED, heavy clunks as the wheel turns, a deep boom and a whoosh as the door opens
        try {
            var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return function () {};
            var a = new AC(), m = a.createGain(); m.gain.value = 0.16; m.connect(a.destination);
            var t0 = a.currentTime;
            var hum = a.createOscillator(), hg = a.createGain(), lp = a.createBiquadFilter();
            hum.type = 'sawtooth'; hum.frequency.setValueAtTime(45, t0); hum.frequency.exponentialRampToValueAtTime(110, t0 + 3); hum.frequency.exponentialRampToValueAtTime(260, t0 + 6.5);
            lp.type = 'lowpass'; lp.frequency.setValueAtTime(250, t0); lp.frequency.exponentialRampToValueAtTime(2600, t0 + 6.5);
            hg.gain.setValueAtTime(0.0001, t0); hg.gain.exponentialRampToValueAtTime(0.45, t0 + 0.8); hg.gain.setValueAtTime(0.45, t0 + 5.5); hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 7);
            hum.connect(lp); lp.connect(hg); hg.connect(m); hum.start(t0); hum.stop(t0 + 7.1);
            function beep(at, f) { var o = a.createOscillator(), g = a.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(0.12, t0 + at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.08); o.connect(g); g.connect(m); o.start(t0 + at); o.stop(t0 + at + 0.1); }
            for (var b = 0; b < 8; b++) beep(0.3 + b * 0.32, 1200 + (b % 3) * 300);
            function clunk(at, f) {
                var o = a.createOscillator(), g = a.createGain(); o.type = 'square'; o.frequency.setValueAtTime(f || 140, t0 + at); o.frequency.exponentialRampToValueAtTime(35, t0 + at + 0.18);
                g.gain.setValueAtTime(0.7, t0 + at); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.25); o.connect(g); g.connect(m); o.start(t0 + at); o.stop(t0 + at + 0.3);
            }
            [880, 1318.5, 1760].forEach(function (f, i) {
                var o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = f;
                var at = t0 + 3.0 + i * 0.08; g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.35, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
                o.connect(g); g.connect(m); o.start(at); o.stop(at + 1.5);
            });
            clunk(3.75); clunk(4.2); clunk(4.65); clunk(5.0, 90);
            var len = a.sampleRate * 2.2, buf = a.createBuffer(1, len, a.sampleRate), ch = buf.getChannelData(0);
            for (var i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 0.6);
            var n = a.createBufferSource(), bp = a.createBiquadFilter(), ng = a.createGain(); n.buffer = buf; bp.type = 'bandpass'; bp.Q.value = 0.7;
            bp.frequency.setValueAtTime(200, t0 + 5.0); bp.frequency.exponentialRampToValueAtTime(4000, t0 + 6.8);
            ng.gain.setValueAtTime(0.0001, t0 + 5.0); ng.gain.exponentialRampToValueAtTime(0.8, t0 + 5.4); ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 7.1);
            n.connect(bp); bp.connect(ng); ng.connect(m); n.start(t0 + 5.0);
            return function () { try { m.gain.setTargetAtTime(0, a.currentTime, 0.05); setTimeout(function () { a.close(); }, 400); } catch (e) {} };
        } catch (e) { return function () {}; }
    }

    // About 7 seconds: the door is scanned, ACCESS GRANTED, the wheel turns, the door splits open
    // and you fly down the glowing corridor into the Vault.
    function play(opts) {
        opts = opts || {};
        var name = String(opts.name || '').toUpperCase().slice(0, 32).replace(/[<>&"]/g, ''), role = String(opts.role || 'OWNER').toUpperCase().replace(/[<>&"]/g, '');
        return new Promise(function (resolve) {
            if (!document.getElementById('vcs-css')) { var st = document.createElement('style'); st.id = 'vcs-css'; st.textContent = CSS; document.head.appendChild(st); }
            var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            var el = document.createElement('div'); el.id = 'vcs'; el.setAttribute('role', 'status'); el.setAttribute('aria-label', 'Access granted, opening the Vault');
            var face = '<img class="door" src="' + IMG + 'door.webp" alt="" draggable="false"><img class="wheel" src="' + IMG + 'wheel.webp" alt="" draggable="false"><div class="glow"></div>';
            el.innerHTML = '<div class="inside"></div><canvas></canvas>' +
                '<div class="stage"><div class="ringfx"></div><div class="ringfx b"></div><div class="half l">' + face + '</div><div class="half r">' + face + '</div><div class="beam"></div><div class="lock">SCANNING · BIOMETRIC LOCK</div></div>' +
                '<div class="grant"><h1>ACCESS GRANTED</h1><p>WELCOME BACK' + (name ? ', ' + name : '') + '</p></div>' +
                '<div class="title">ENTERING THE VAULT</div>' +
                '<div class="hud"></div><div class="hud2"></div><div class="bar-t">DECRYPTING VAULT</div><div class="bar"><i></i></div>' +
                '<div class="scanl"></div><div class="vign"></div><div class="flash go"></div><div class="skip">Click to skip</div>';
            document.body.appendChild(el);
            var done = false, timers = [], raf = 0, stopSound = function () {}, hexT = 0;
            function finish() {
                if (done) return; done = true;
                timers.forEach(clearTimeout); clearInterval(hexT); stopSound();
                el.classList.add('out');
                document.removeEventListener('keydown', onKey, true);
                setTimeout(function () { cancelAnimationFrame(raf); el.remove(); resolve(); }, 480);
            }
            function onKey(e) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); } }
            el.addEventListener('click', finish);
            document.addEventListener('keydown', onKey, true);
            if (reduce) { el.classList.add('in', 'granted'); timers.push(setTimeout(finish, 1200)); return; }
            stopSound = sound();
            function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
            function flash(cls) { var fl = el.querySelector('.flash'); fl.className = 'flash'; void fl.offsetWidth; fl.classList.add(cls || 'go'); }

            // the security console types out its checks
            var hud = el.querySelector('.hud'), lines = [
                ['> VAULT SECURITY v26.6', ''], ['> Handshake ............... ', 'SECURE'], ['> PIN hash ................ ', 'MATCH'],
                ['> Biometric scan .......... ', 'VERIFIED'], ['> Session key ............. ', 'ISSUED'], ['> Decrypting modules ...... ', 'OK'],
                ['> Clearance ............... ', role], ['> Locking wheel ........... ', 'UNLOCKED'], ['> Door .................... ', 'OPEN']];
            var li = 0;
            function nextLine() {
                if (li >= lines.length || done) return;
                var L = lines[li++], row = document.createElement('div'); hud.appendChild(row);
                var txt = L[0], k = 0;
                (function type() { if (done) return; row.textContent = txt.slice(0, ++k); if (k < txt.length) at(12, type); else { if (L[1]) { var sp = document.createElement('span'); sp.className = 'ok'; sp.textContent = L[1]; row.appendChild(sp); } at(li < 7 ? 160 : 420, nextLine); } })();
            }
            nextLine();
            var hud2 = el.querySelector('.hud2'), hex = function () { return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0').toUpperCase(); };
            hexT = setInterval(function () { hud2.textContent = [hex() + ' ' + hex(), hex() + ' ' + hex(), hex() + ' ' + hex(), 'NODE ZP-01 · AES-256 · TLS 1.3', new Date().toISOString().slice(11, 23) + ' UTC'].join('\n'); }, 80);

            // stars, which stretch into a hyperspace rush once the door opens
            var cv = el.querySelector('canvas'), ctx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1), W, H, stars = [], speed = 0.15, warp = 0;
            function size() { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
            size(); window.addEventListener('resize', size);
            for (var s2 = 0; s2 < 460; s2++) stars.push({ x: (Math.random() - .5) * 2, y: (Math.random() - .5) * 2, z: Math.random() });
            var last = performance.now();
            (function frame(now) {
                raf = requestAnimationFrame(frame);
                var dt = Math.min(.05, (now - last) / 1000); last = now;
                speed += ((warp ? 2.6 * warp : 0.12) - speed) * Math.min(1, dt * 1.5);
                ctx.clearRect(0, 0, W, H);
                var cx = W / 2, cy = H / 2, f = Math.max(W, H) * 0.5, trail = 0.02 + speed * 0.09;
                for (var i = 0; i < stars.length; i++) {
                    var p = stars[i]; p.z -= speed * dt;
                    if (p.z <= 0.02) { p.x = (Math.random() - .5) * 2; p.y = (Math.random() - .5) * 2; p.z = 1; continue; }
                    var pz = Math.min(1, p.z + trail);
                    var sx = cx + p.x / p.z * f * 0.5, sy = cy + p.y / p.z * f * 0.5, px = cx + p.x / pz * f * 0.5, py = cy + p.y / pz * f * 0.5;
                    var br = Math.min(1, (1 - p.z) * 1.4);
                    ctx.strokeStyle = 'rgba(' + (warp ? '210,230,255,' : '150,180,255,') + br + ')';
                    ctx.lineWidth = Math.max(.6, (1 - p.z) * (warp ? 3 : 1.8));
                    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke();
                }
            })(last);

            // the timeline (ms)
            at(60, function () { el.classList.add('in'); el.querySelector('.bar i').style.width = '100%'; });
            at(900, function () { el.classList.add('scan'); });
            at(1600, function () { el.classList.add('push'); });
            at(3000, function () { el.classList.remove('scan'); el.classList.add('granted'); el.querySelector('.lock').textContent = 'IDENTITY CONFIRMED'; flash(); });
            at(3700, function () { el.classList.add('turn'); el.querySelector('.lock').textContent = 'RELEASING LOCKS'; });
            at(5000, function () { el.classList.add('open'); warp = 0.4; flash(); });
            at(5500, function () { el.classList.add('fly'); warp = 1; });
            at(6450, function () { flash('end'); });
            at(7000, finish);
        });
    }
    window.VaultCutscene = { play: play };
})();
