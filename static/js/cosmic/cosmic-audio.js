/* Cosmic Ascension — the soundtrack (26.7).
 *
 * An original score made in the browser with Web Audio, written to the brief taken from the
 * reference clip: bright and airy, E minor, around 156 BPM, no heavy bass, rising sweeps and a
 * clean cut before the big moment. Every cue is placed on the film's timeline (T) so the
 * camera, the hyperspace jump, the station reveal and the hand-over land on the music.
 *
 * Quiet by default, with spatial "space wind" and a long reverb for depth. Muting and the
 * volume slider act on one master gain; the end fades out smoothly.
 * If a licensed track URL is supplied (opts.track), it is played instead of the music layer,
 * with the ambience kept underneath.
 */
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI → Hz
const E = { E2: 40, B2: 47, C3: 48, D3: 50, E3: 52, G3: 55, A3: 57, B3: 59, C4: 60, D4: 62, E4: 64, Fs4: 66, G4: 67, A4: 69, B4: 71, D5: 74, E5: 76, Fs5: 78, G5: 79, A5: 81, B5: 83, D6: 86, E6: 88 };

export class Score {
    constructor(o) {
        this.volume = Math.min(1, Math.max(0, o.volume ?? 0.6));
        this.muted = !!o.muted; this.T = o.timeline; this.reduced = !!o.reduced; this.track = o.track;
        this.ctx = null; this.master = null; this.closed = false;
    }
    _level() { return this.muted ? 0.0001 : Math.max(0.0001, this.volume * this.volume * 6); }
    setVolume(v) { this.volume = Math.min(1, Math.max(0, v)); this._apply(); }
    setMuted(m) { this.muted = !!m; this._apply(); }
    _apply() { if (!this.ctx || !this.user) return; const t = this.ctx.currentTime; this.user.gain.cancelScheduledValues(t); this.user.gain.setTargetAtTime(this._level(), t, 0.08); }
    resume() { try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) {} }
    fadeOut(sec) {
        if (!this.ctx || !this.master) return;
        const t = this.ctx.currentTime; this.master.gain.cancelScheduledValues(t);
        this.master.gain.setValueAtTime(this.master.gain.value, t); this.master.gain.linearRampToValueAtTime(0.0001, t + (sec || 0.8));
    }
    close() { if (this.closed) return; this.closed = true; const c = this.ctx; setTimeout(() => { try { c && c.close(); } catch (e) {} }, 300); }

    // Returns true when sound is actually running (false if the browser is holding it until a tap).
    async start(delay) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        let a;
        try { a = this.ctx = new AC({ latencyHint: 'playback' }); } catch (e) { return false; }
        try { if (a.state === 'suspended') await Promise.race([a.resume(), new Promise((r) => setTimeout(r, 300))]); } catch (e) {}
        const out = a.createDynamicsCompressor(); out.threshold.value = -10; out.knee.value = 4; out.ratio.value = 12; out.attack.value = 0.004; out.release.value = 0.2; out.connect(a.destination);   // gentle limiter
        this.user = a.createGain(); this.user.gain.value = this._level(); this.user.connect(out);
        this.master = a.createGain(); this.master.gain.value = 1; this.master.connect(this.user);
        const dry = a.createGain(); dry.gain.value = 0.8; dry.connect(this.master);
        const verb = a.createConvolver(); verb.buffer = this._impulse(a, 4.2); const wet = a.createGain(); wet.gain.value = 0.55; verb.connect(wet); wet.connect(this.master);
        const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38; hp.connect(dry); hp.connect(verb);   // keep the very low end clean
        this.bus = hp; this.verb = verb;
        const t0 = a.currentTime + (delay || 0);
        try {
            this._ambience(a, t0);
            if (this.reduced) { this._chord(a, t0 + 0.3, 3.0, [E.E3, E.B3, E.G4, E.B4, E.Fs5], 0.05); }
            else if (this.track) { await this._trackLayer(a, t0).catch(() => this._music(a, t0)); }
            else this._music(a, t0);
        } catch (e) { console.warn('[cosmic] sound', e); }
        return a.state === 'running';
    }

    _impulse(a, sec) {
        const len = Math.floor(a.sampleRate * sec), b = a.createBuffer(2, len, a.sampleRate);
        for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
        return b;
    }
    _noise(a, sec) {
        if (this._nb) return this._nb;
        const b = a.createBuffer(1, a.sampleRate * sec, a.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return (this._nb = b);
    }
    _env(g, t, a, peak, hold, rel) {
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a);
        g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
    }
    // filtered noise with a moving band, optionally panned in space
    _sweep(a, t, dur, f1, f2, peak, q, shape, pan) {
        const n = a.createBufferSource(); n.buffer = this._noise(a, 4); n.loop = true;
        const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q || 0.8;
        bp.frequency.setValueAtTime(f1, t); bp.frequency.exponentialRampToValueAtTime(f2, t + dur);
        const g = a.createGain();
        if (shape === 'rise') { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.95); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
        else if (shape === 'swell') { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
        else { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
        let node = g;
        if (pan !== undefined && a.createStereoPanner) { const p = a.createStereoPanner(); p.pan.setValueAtTime(pan[0], t); p.pan.linearRampToValueAtTime(pan[1], t + dur); g.connect(p); node = p; }
        n.connect(bp); bp.connect(g); node.connect(this.bus);
        n.start(t, Math.random() * 3); n.stop(t + dur + 0.05);
    }
    _tone(a, t, f, dur, type, peak, atk, dest) {
        const o = a.createOscillator(), g = a.createGain(); o.type = type || 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + (atk || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + (atk || 0.005) + dur);
        o.connect(g); g.connect(dest || this.bus); o.start(t); o.stop(t + dur + (atk || 0) + 0.05);
    }
    _bell(a, t, midi, peak) {          // glassy bell: a few inharmonic partials
        [[1, 1], [2.01, 0.45], [3.98, 0.22], [5.43, 0.1]].forEach(([r, k]) => this._tone(a, t, NOTE(midi) * r, 2.6 / r, 'sine', peak * k, 0.004));
    }
    // a soft pad chord: two detuned saws per note through a lowpass that opens slowly
    _chord(a, t, dur, notes, peak, cutFrom, cutTo) {
        const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
        lp.frequency.setValueAtTime(cutFrom || 500, t); lp.frequency.exponentialRampToValueAtTime(cutTo || 2400, t + dur);
        const g = a.createGain(); this._env(g, t, Math.min(1.6, dur * 0.35), peak, Math.max(0, dur - Math.min(1.6, dur * 0.35) - 1.2), 1.2);
        lp.connect(g); g.connect(this.bus);
        notes.forEach((n) => [-8, 8].forEach((det) => {
            const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det;
            const v = a.createGain(); v.gain.value = 1 / (notes.length * 2); o.connect(v); v.connect(lp); o.start(t); o.stop(t + dur + 0.1);
        }));
    }
    _ambience(a, t0) {   // a slow "space wind" that drifts around you
        const n = a.createBufferSource(); n.buffer = this._noise(a, 4); n.loop = true;
        const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.5;
        const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 500; lfo.connect(lg); lg.connect(bp.frequency);
        const g = a.createGain(); const T = this.T;
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.025, t0 + 2.5);
        g.gain.setValueAtTime(0.025, t0 + T.handover); g.gain.exponentialRampToValueAtTime(0.0001, t0 + T.end + 0.4);
        let node = g;
        if (a.createStereoPanner) { const p = a.createStereoPanner(), pl = a.createOscillator(), pg = a.createGain(); pl.frequency.value = 0.11; pg.gain.value = 0.7; pl.connect(pg); pg.connect(p.pan); g.connect(p); node = p; pl.start(t0); pl.stop(t0 + T.end + 0.5); }
        n.connect(bp); bp.connect(g); node.connect(this.bus);
        n.start(t0); lfo.start(t0); n.stop(t0 + T.end + 0.5); lfo.stop(t0 + T.end + 0.5);
    }
    _music(a, t0) {
        const T = this.T, beat = 60 / 156, s16 = beat / 4;
        // 1–2: the starfield — Em(add9) pad and sparse, far-away bells
        this._chord(a, t0 + T.reveal - 0.3, T.emerge - T.reveal + 0.6, [E.E3, E.B3, E.E4, E.G4, E.B4, E.Fs5], 0.11, 350, 1800);
        [[1.2, E.B5], [2.0, E.E6], [2.7, E.G5], [3.5, E.Fs5], [4.1, E.B5]].forEach(([at, n]) => this._bell(a, t0 + at, n, 0.035));
        // 3: the camera accelerates — riser and an arpeggio that fades in
        this._sweep(a, t0 + T.accel, T.hyper - T.accel, 400, 6000, 0.09, 0.9, 'rise', [-0.4, 0.4]);
        const rz = a.createOscillator(), rg = a.createGain(), rlp = a.createBiquadFilter();
        rz.type = 'sawtooth'; rz.frequency.setValueAtTime(NOTE(E.E3), t0 + T.accel); rz.frequency.exponentialRampToValueAtTime(NOTE(E.E5), t0 + T.hyper);
        rlp.type = 'lowpass'; rlp.frequency.setValueAtTime(600, t0 + T.accel); rlp.frequency.exponentialRampToValueAtTime(5000, t0 + T.hyper);
        rg.gain.setValueAtTime(0.0001, t0 + T.accel); rg.gain.exponentialRampToValueAtTime(0.035, t0 + T.hyper - 0.05); rg.gain.linearRampToValueAtTime(0.0001, t0 + T.hyper + 0.05);
        rz.connect(rlp); rlp.connect(rg); rg.connect(this.bus); rz.start(t0 + T.accel); rz.stop(t0 + T.hyper + 0.1);
        const arp = [E.E4, E.G4, E.B4, E.E5, E.Fs5, E.E5, E.B4, E.G4];
        for (let k = 0, at = T.accel + 0.6; at < T.emerge - 0.12; k++, at += s16) {
            const lvl = at < T.hyper ? 0.012 + 0.028 * ((at - T.accel) / (T.hyper - T.accel)) : 0.045;
            this._tone(a, t0 + at, NOTE(arp[k % arp.length] + (at > T.hyper && k % 16 >= 8 ? 12 : 0)), 0.12, 'triangle', lvl, 0.004);
        }
        // 4: hyperspace — a rushing roar and a soft pulse on the beat
        this._sweep(a, t0 + T.hyper, T.emerge - T.hyper, 250, 3200, 0.16, 0.6, 'swell', [0.5, -0.5]);
        this._sweep(a, t0 + T.hyper, T.emerge - T.hyper, 3000, 9000, 0.05, 1.2, 'swell');
        for (let at = T.hyper; at < T.emerge - 0.1; at += beat) this._tone(a, t0 + at, 82.4, 0.22, 'sine', 0.09, 0.01);
        // a clean cut, then 5: dropping out near the station — a soft, wide impact
        const cut = this.master.gain; cut.setValueAtTime(1, t0 + T.emerge - 0.14); cut.linearRampToValueAtTime(0.0001, t0 + T.emerge - 0.1); cut.setValueAtTime(0.0001, t0 + T.emerge - 0.01); cut.linearRampToValueAtTime(1, t0 + T.emerge);
        this._sweep(a, t0 + T.emerge, 1.8, 1800, 200, 0.22, 0.5);
        this._tone(a, t0 + T.emerge, 55, 1.2, 'sine', 0.12, 0.01);
        this._chord(a, t0 + T.emerge, T.enter - T.emerge + 0.4, [E.C3, E.G3, E.B3, E.E4, E.G4, E.D5], 0.1, 400, 2600);
        [[0.4, E.E5], [1.3, E.G5], [2.2, E.B5]].forEach(([at, n]) => this._bell(a, t0 + T.emerge + at, n, 0.04));
        // 6–7: approach and the entrance opening — a low swell, a soft hiss and servo
        this._sweep(a, t0 + T.approach, T.enter - T.approach, 120, 900, 0.07, 0.7, 'rise');
        this._sweep(a, t0 + T.open, 0.9, 6000, 2500, 0.05, 1.5);
        const sv = a.createOscillator(), sg = a.createGain(); sv.type = 'triangle';
        sv.frequency.setValueAtTime(110, t0 + T.open); sv.frequency.exponentialRampToValueAtTime(220, t0 + T.open + 0.7);
        sg.gain.setValueAtTime(0.0001, t0 + T.open); sg.gain.exponentialRampToValueAtTime(0.03, t0 + T.open + 0.1); sg.gain.exponentialRampToValueAtTime(0.0001, t0 + T.open + 0.8);
        sv.connect(sg); sg.connect(this.bus); sv.start(t0 + T.open); sv.stop(t0 + T.open + 0.9);
        // through the tunnel: rings of light whooshing past
        this._chord(a, t0 + T.enter, T.command - T.enter + 0.3, [E.D3, E.A3, E.D4, E.Fs4, E.A4, E.E5], 0.08, 900, 4000);
        for (let k = 0, at = T.enter; at < T.command - 0.05; k++, at += 0.085) this._sweep(a, t0 + at, 0.11, 3500, 1200, 0.03 + 0.03 * (k / 14), 2, undefined, [k % 2 ? -0.6 : 0.6, 0]);
        // 8–9: the command centre — the music resolves, and a short motif greets you
        this._chord(a, t0 + T.command, T.end - T.command + 0.6, [E.G3, E.D4, E.G4, E.B4, E.D5, E.A5], 0.11, 700, 3000);
        this._sweep(a, t0 + T.command - 0.2, 1.4, 4000, 800, 0.05, 0.7);
        [[T.welcome, E.B4], [T.welcome + 0.19, E.E5], [T.welcome + 0.38, E.G5], [T.name, E.Fs5], [T.name + 0.3, E.B5], [T.name + 0.9, E.E6]].forEach(([at, n]) => this._bell(a, t0 + at, n, 0.05));
        // hand-over: everything settles and fades into the dashboard
        this.master.gain.setValueAtTime(1, t0 + T.handover); this.master.gain.linearRampToValueAtTime(0.0001, t0 + T.end + 0.3);
    }
    async _trackLayer(a, t0) {
        const r = await fetch(this.track); if (!r.ok) throw new Error('no track');
        const buf = await a.decodeAudioData(await r.arrayBuffer());
        const src = a.createBufferSource(); src.buffer = buf; const g = a.createGain(); g.gain.value = 0.8;
        src.connect(g); g.connect(this.master); src.start(Math.max(a.currentTime, t0));
        this.master.gain.setValueAtTime(1, t0 + this.T.handover); this.master.gain.linearRampToValueAtTime(0.0001, t0 + this.T.end + 0.3);
    }
}
