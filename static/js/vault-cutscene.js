// 26.6.9 — the Vault unlock cutscene. Plays after the right PIN: a security HUD runs its
// checks, "ACCESS GRANTED" slams in, the bolts on a round vault door pull back, the door
// splits open into a hyperspace rush of light, and the Vault appears.
// VaultCutscene.play({ name, role }) → Promise that resolves when it's over (about 7 s).
// 26.6.11: a full, spinning door; colourful pixel glitches; a dense hyperspace rush; new glitchy sound.
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
#vcs.fly .inside{transform:scale(2.6);opacity:.3;filter:brightness(1.2) saturate(1.4) blur(6px);transition:transform 1.7s cubic-bezier(.6,0,.4,1),filter 1.2s ease-in,opacity 1s ease-in}
#vcs canvas{position:absolute;inset:0;width:100%;height:100%}
#vcs.open canvas.warp{mix-blend-mode:screen}
#vcs canvas.gl{z-index:5;pointer-events:none}
#vcs.glitch .stage{animation:vcsJit .09s steps(2) infinite}
#vcs.glitch .grant h1{text-shadow:-8px 0 rgba(255,0,120,.9),8px 0 rgba(0,230,255,.9),0 0 30px rgba(74,222,128,.9)}
@keyframes vcsJit{0%{translate:-6px 2px;filter:hue-rotate(40deg)}50%{translate:7px -3px;filter:hue-rotate(-40deg) saturate(2)}100%{translate:0 0}}
#vcs .core{position:absolute;left:50%;top:50%;width:30vmin;height:30vmin;margin:-15vmin 0 0 -15vmin;border-radius:50%;opacity:0;background:radial-gradient(circle,#fff 0%,rgba(220,240,255,.95) 12%,rgba(120,190,255,.55) 32%,rgba(60,120,255,.18) 55%,transparent 70%);mix-blend-mode:screen;z-index:4;pointer-events:none}
#vcs.fly .core{opacity:1;transform:scale(2.2);transition:opacity .5s,transform 1.6s ease-in}
#vcs .flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
#vcs .flash.go{animation:vcsFlash .4s ease-out}
@keyframes vcsFlash{0%{opacity:.3}100%{opacity:0}}
#vcs .flash.end{animation:vcsFlashEnd .55s ease-in forwards}
@keyframes vcsFlashEnd{to{opacity:1}}
#vcs .scanl{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.03) 0 1px,transparent 1px 3px);mix-blend-mode:overlay}
#vcs .vign{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,.8) 100%)}
#vcs .stage{position:absolute;left:50%;top:50%;width:min(66vmin,600px);height:min(66vmin,600px);transform:translate(-50%,-50%) scale(.55);opacity:0;transition:transform 1.6s cubic-bezier(.2,.9,.3,1),opacity .6s}
#vcs.in .stage{transform:translate(-50%,-50%) scale(1);opacity:1}
#vcs.push .stage{transform:translate(-50%,-50%) scale(1.05);transition:transform 2.6s ease-in-out}
#vcs .half{position:absolute;inset:0;transition:transform 1.2s cubic-bezier(.7,0,.2,1),filter 1.2s}
#vcs .half.l{clip-path:inset(-10% 49.7% -10% -10%)} #vcs .half.r{clip-path:inset(-10% -10% -10% 49.7%)}
#vcs.open .half.l{transform:translateX(-70vw) rotateY(25deg)} #vcs.open .half.r{transform:translateX(70vw) rotateY(-25deg)}
#vcs .spin{position:absolute;inset:0;transition:transform 1.25s cubic-bezier(.55,0,.2,1)}
#vcs.turn .spin{transform:rotate(-135deg)}
#vcs .door{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 0 40px rgba(80,200,255,.35)) drop-shadow(0 20px 40px rgba(0,0,0,.8))}
#vcs .sweep{position:absolute;inset:-3%;border-radius:50%;opacity:0;background:conic-gradient(from 0deg,transparent 0 62%,rgba(103,232,249,.0) 64%,rgba(103,232,249,.85) 74%,rgba(255,255,255,.95) 75%,transparent 76%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 14px),#000 calc(100% - 13px));mask:radial-gradient(farthest-side,transparent calc(100% - 14px),#000 calc(100% - 13px));filter:drop-shadow(0 0 10px #22d3ee)}
#vcs.turn .sweep{opacity:1;animation:vcsRot .35s linear 4 reverse}
#vcs.open .sweep,#vcs.open .ringfx,#vcs.open .beam{opacity:0!important;animation:none!important}
@keyframes vcsRot{to{transform:rotate(360deg)}}
#vcs.turn .spin .door{filter:drop-shadow(0 0 50px rgba(80,200,255,.6)) blur(.6px)}
#vcs .glow{position:absolute;left:30%;top:30%;width:40%;height:40%;border-radius:50%;opacity:0;background:radial-gradient(circle,rgba(74,222,128,.55),rgba(34,197,94,.15) 55%,transparent 70%);mix-blend-mode:screen;transition:opacity .4s}
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
    ['door.webp', 'inside.jpg'].forEach(function (f) { var i = new Image(); i.src = IMG + f; });

    // 26.6.11: sound inspired by the clip you sent — bright, glitchy and digital, in E minor at
    // about 156 BPM, no heavy bass: chattering data ticks over a hiss, a long riser, stuttering
    // glitches on ACCESS GRANTED, ratchets as the door spins, a sudden cut to silence, then an
    // impact and a shimmering arpeggio as you rush through hyperspace.
    function sound() {
        try {
            var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return function () {};
            var a = new AC(), m = a.createGain(), comp = a.createDynamicsCompressor();
            m.gain.value = 0.9; m.connect(comp); comp.connect(a.destination);
            var t0 = a.currentTime + 0.03, SR = a.sampleRate;
            var hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 160; hp.connect(m);   // keep it light, no rumble
            var bus = hp;
            // bit-crusher for that digital grit
            var crush = a.createWaveShaper(), cv = new Float32Array(1024);
            for (var i = 0; i < 1024; i++) { var v = i / 512 - 1; cv[i] = Math.round(v * 6) / 6; }
            crush.curve = cv; crush.connect(bus);
            function noiseBuf(sec) { var b = a.createBuffer(1, SR * sec, SR), d = b.getChannelData(0); for (var j = 0; j < d.length; j++) d[j] = Math.random() * 2 - 1; return b; }
            var NB = noiseBuf(2);
            function env(g, at, peak, atk, dec) { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + atk); g.gain.exponentialRampToValueAtTime(0.0001, at + atk + dec); }
            function tone(at, f, dur, type, vol, dest) {
                var o = a.createOscillator(), g = a.createGain(); o.type = type || 'square'; o.frequency.value = f;
                env(g, at, vol || 0.1, 0.004, dur); o.connect(g); g.connect(dest || crush); o.start(at); o.stop(at + dur + 0.05);
            }
            function noise(at, dur, f1, f2, vol, q, shape) {
                var n = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain();
                n.buffer = NB; n.loop = true; bp.type = 'bandpass'; bp.Q.value = q || 1;
                bp.frequency.setValueAtTime(f1, at); bp.frequency.exponentialRampToValueAtTime(f2, at + dur);
                if (shape === 'rise') { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + dur - 0.04); g.gain.linearRampToValueAtTime(0.0001, at + dur); }
                else if (shape === 'flat') { g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + 0.3); g.gain.setValueAtTime(vol, at + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, at + dur); }
                else { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.05, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, at + dur); }
                n.connect(bp); bp.connect(g); g.connect(bus); n.start(at, Math.random()); n.stop(at + dur + 0.05);
            }
            var E = [329.6, 392, 493.9, 587.3, 659.3, 784, 987.8, 1318.5];   // E minor pentatonic-ish, bright octaves
            var S16 = 60 / 156 / 4;
            // hiss bed + data ticks (0 → 3 s)
            noise(t0, 3.0, 6000, 9000, 0.12, 0.4, 'flat');
            for (var k = 0; k * S16 < 2.9; k++) if (Math.random() < 0.75) tone(t0 + k * S16, E[4 + Math.floor(Math.random() * 4)] * (Math.random() < 0.3 ? 2 : 1), 0.04, 'square', 0.05);
            // riser into the reveal
            var r = a.createOscillator(), rg = a.createGain(); r.type = 'sawtooth';
            r.frequency.setValueAtTime(220, t0 + 0.6); r.frequency.exponentialRampToValueAtTime(1760, t0 + 2.95);
            rg.gain.setValueAtTime(0.0001, t0 + 0.6); rg.gain.exponentialRampToValueAtTime(0.16, t0 + 2.8); rg.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.0);
            r.connect(rg); rg.connect(crush); r.start(t0 + 0.6); r.stop(t0 + 3.05);
            noise(t0 + 1.0, 2.0, 400, 7000, 0.4, 1.5, 'rise');
            // ACCESS GRANTED (3.0 s): stutter glitch + bright E minor stab
            for (var st = 0; st < 10; st++) { var at = t0 + 3.0 + st * 0.03; if (st % 3 !== 2) noise(at, 0.025, 2000 + Math.random() * 5000, 3000 + Math.random() * 4000, 0.3, 2); }
            [659.3, 784, 987.8, 1318.5].forEach(function (f) {
                [-7, 7].forEach(function (det) {
                    var o = a.createOscillator(), g = a.createGain(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
                    env(g, t0 + 3.3, 0.05, 0.01, 1.3); o.connect(g); g.connect(bus); o.start(t0 + 3.3); o.stop(t0 + 4.7);
                });
            });
            // the door spinning (3.7 → 4.9 s): ratchet clicks that speed up, with a rising sweep
            var tt = 3.7, gap = 0.11;
            while (tt < 4.85) { noise(t0 + tt, 0.02, 3500, 2500, 0.5, 6); tone(t0 + tt, 180 + (tt - 3.7) * 200, 0.03, 'square', 0.05); tt += gap; gap = Math.max(0.035, gap * 0.9); }
            noise(t0 + 3.7, 1.2, 300, 3000, 0.3, 3, 'rise');
            // a sudden cut to silence (4.9 → 5.0 s), then the impact and the hyperspace rush
            m.gain.setValueAtTime(0.9, t0 + 4.88); m.gain.linearRampToValueAtTime(0.0001, t0 + 4.9); m.gain.setValueAtTime(0.0001, t0 + 4.99); m.gain.linearRampToValueAtTime(1.0, t0 + 5.0);
            noise(t0 + 5.0, 0.6, 1200, 300, 0.5, 0.6);
            tone(t0 + 5.0, 110, 0.35, 'sine', 0.5, bus);
            noise(t0 + 5.05, 1.9, 500, 9000, 0.4, 0.8, 'flat');
            for (var q2 = 0; q2 * S16 < 1.85; q2++) tone(t0 + 5.05 + q2 * S16, E[(q2 * 3) % E.length] * 2, 0.09, 'triangle', 0.06, bus);
            m.gain.setValueAtTime(1.0, t0 + 6.6); m.gain.exponentialRampToValueAtTime(0.0001, t0 + 7.2);
            return function () { try { m.gain.cancelScheduledValues(a.currentTime); m.gain.setTargetAtTime(0, a.currentTime, 0.05); setTimeout(function () { a.close(); }, 400); } catch (e) {} };
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
            var face = '<div class="spin"><img class="door" src="' + IMG + 'door.webp" alt="" draggable="false"></div><div class="glow"></div>';
            el.innerHTML = '<div class="inside"></div><canvas class="warp"></canvas><div class="core"></div><canvas class="gl"></canvas>' +
                '<div class="stage"><div class="ringfx"></div><div class="ringfx b"></div><div class="sweep"></div><div class="half l">' + face + '</div><div class="half r">' + face + '</div><div class="beam"></div><div class="lock">SCANNING · BIOMETRIC LOCK</div></div>' +
                '<div class="grant"><h1>ACCESS GRANTED</h1><p>WELCOME BACK' + (name ? ', ' + name : '') + '</p></div>' +
                '<div class="title">ENTERING THE VAULT</div>' +
                '<div class="hud"></div><div class="hud2"></div><div class="bar-t">DECRYPTING VAULT</div><div class="bar"><i></i></div>' +
                '<div class="scanl"></div><div class="vign"></div><div class="flash go"></div><div class="skip">Click to skip</div>';
            document.body.appendChild(el);
            var done = false, timers = [], raf = 0, stopSound = function () {}, hexT = 0;
            function finish() {
                if (done) return; done = true;
                timers.forEach(clearTimeout); clearInterval(hexT); stopSound(); window.removeEventListener('resize', size); window.removeEventListener('resize', gsize);
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
            var cv = el.querySelector('canvas.warp'), ctx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1), W, H, stars = [], speed = 0.15, warp = 0;
            function size() { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
            size(); window.addEventListener('resize', size);
            var COLS = ['190,240,255', '140,210,255', '90,160,255', '255,255,255', '255,255,255', '170,255,235', '255,235,180', '210,190,255'];
            function star() { return { x: (Math.random() - .5) * 2, y: (Math.random() - .5) * 2, z: Math.random(), c: COLS[Math.floor(Math.random() * COLS.length)], w: 0.5 + Math.random() * 1.6 }; }
            for (var s2 = 0; s2 < 1400; s2++) stars.push(star());
            var gcv = el.querySelector('canvas.gl'), gx = gcv.getContext('2d'), glitchUntil = 0, glitchPow = 1;
            function gsize() { gcv.width = innerWidth; gcv.height = innerHeight; }
            gsize(); window.addEventListener('resize', gsize);
            var GC = ['#6ee7ff', '#3b82f6', '#a855f7', '#f0abfc', '#ffffff', '#a3e635', '#f59e0b', '#22d3ee', '#8b5cf6', '#e0f2fe'];
            function drawGlitch(now) {
                gx.clearRect(0, 0, gcv.width, gcv.height);
                if (now > glitchUntil) { el.classList.remove('glitch'); return; }
                el.classList.add('glitch');
                var Wd = gcv.width, Hd = gcv.height, bands = 1 + Math.floor(Math.random() * 2 * glitchPow);
                for (var bI = 0; bI < bands; bI++) {
                    var cy = Hd * (0.2 + Math.random() * 0.6), spread = Hd * (0.06 + Math.random() * 0.14), n = Math.floor(120 * glitchPow);
                    for (var r = 0; r < n; r++) {
                        var yy = cy + (Math.random() + Math.random() - 1) * spread, w = Math.pow(Math.random(), 2.2) * Wd * 0.35 + 6, h = [3, 4, 6, 9, 14, 22][Math.floor(Math.pow(Math.random(), 1.6) * 6)];
                        gx.globalAlpha = 0.55 + Math.random() * 0.45; gx.fillStyle = GC[Math.floor(Math.random() * GC.length)];
                        gx.fillRect(Math.round((Math.random() * 1.2 - 0.1) * Wd / 4) * 4, Math.round(yy / 2) * 2, Math.round(w), h);
                    }
                    for (var d = 0; d < 60 * glitchPow; d++) { gx.fillStyle = GC[d % GC.length]; gx.fillRect(Math.random() * Wd, cy + (Math.random() - .5) * spread * 4, 2, 2); }
                }
                for (var L = 0; L < 5; L++) { gx.globalAlpha = 0.9; gx.fillStyle = GC[Math.floor(Math.random() * GC.length)]; var lw = Wd * (0.1 + Math.random() * 0.3); gx.fillRect(Math.random() < 0.5 ? 0 : Wd - lw, Math.random() * Hd, lw, 3); }
                gx.globalAlpha = 1;
            }
            function glitch(ms, pow) { glitchUntil = performance.now() + ms; glitchPow = pow || 1; }
            var last = performance.now();
            (function frame(now) {
                raf = requestAnimationFrame(frame);
                var dt = Math.min(.05, (now - last) / 1000); last = now;
                speed += ((warp ? 3.4 * warp : 0.12) - speed) * Math.min(1, dt * 1.6);
                ctx.clearRect(0, 0, W, H);
                ctx.globalCompositeOperation = warp ? 'lighter' : 'source-over';
                var cx = W / 2, cy = H / 2, f = Math.max(W, H) * 0.5, trail = 0.015 + speed * 0.11, limit = warp ? stars.length : 460;
                for (var i = 0; i < limit; i++) {
                    var p = stars[i]; p.z -= speed * dt;
                    if (p.z <= 0.02) { var nw = star(); p.x = nw.x; p.y = nw.y; p.z = 1; continue; }
                    var pz = Math.min(1, p.z + trail);
                    var sx = cx + p.x / p.z * f * 0.5, sy = cy + p.y / p.z * f * 0.5, px = cx + p.x / pz * f * 0.5, py = cy + p.y / pz * f * 0.5;
                    var br = Math.min(1, (1 - p.z) * 1.5);
                    ctx.strokeStyle = 'rgba(' + (warp ? p.c : '150,180,255') + ',' + br + ')';
                    ctx.lineWidth = Math.max(.5, (1 - p.z) * (warp ? 3.2 * p.w : 1.8));
                    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke();
                }
                ctx.globalCompositeOperation = 'source-over';
                drawGlitch(now);
            })(last);

            // the timeline (ms)
            at(60, function () { el.classList.add('in'); el.querySelector('.bar i').style.width = '100%'; glitch(180, .6); });
            at(900, function () { el.classList.add('scan'); });
            at(1250, function () { glitch(90, .4); });
            at(1600, function () { el.classList.add('push'); });
            at(2250, function () { glitch(110, .5); });
            at(2930, function () { glitch(420, 1.4); });
            at(3000, function () { el.classList.remove('scan'); el.classList.add('granted'); el.querySelector('.lock').textContent = 'IDENTITY CONFIRMED'; flash(); });
            at(3700, function () { el.classList.add('turn'); el.querySelector('.lock').textContent = 'RELEASING LOCKS'; });
            at(4850, function () { glitch(160, 1.2); });
            at(5000, function () { el.classList.add('open'); warp = 0.5; flash(); });
            at(5450, function () { el.classList.add('fly'); warp = 1; });
            at(6300, function () { glitch(150, .8); });
            at(6450, function () { flash('end'); });
            at(7000, finish);
        });
    }
    window.VaultCutscene = { play: play };
})();
