/* Zelpophai Vault — "Cosmic Ascension" (26.7)
 *
 * The cinematic that plays after a successful, server-verified Vault PIN. It is purely
 * visual: it never grants anything. Callers start it only after /api/auth/admin/pin-verify
 * has returned a token, and the dashboard keeps using that token (and its normal expiry).
 *
 * Shots (seconds, also used by the soundtrack so picture and sound stay in sync):
 *   0.0  the page fades to black                 7.4  drop out of hyperspace near the station
 *   0.8  an enormous starfield and galaxies       9.6  approach the lit entrance (Zelpophai emblem)
 *   3.0  the camera starts to accelerate         10.5  the entrance opens
 *   5.0  hyperspace                              11.2  fly through the docking tunnel
 *  12.4  the command centre over the planet      13.0  WELCOME TO THE VAULT, then name and role
 *  15.4  hand-over to the dashboard (16.2 done)
 *
 * Three.js + WebGL with bloom, adaptive quality, reduced-motion and no-WebGL fallbacks,
 * mute/volume/fullscreen/skip controls, and full clean-up afterwards.
 */
import * as THREE from '../../vendor/three-0.160/three.module.min.js';
import { EffectComposer } from '../../vendor/three-0.160/EffectComposer.js';
import { RenderPass } from '../../vendor/three-0.160/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/three-0.160/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/three-0.160/OutputPass.js';
import { Score } from './cosmic-audio.js';

const ART = '/static/img/cosmic/';
export const T = { fade: 0.8, reveal: 0.8, accel: 3.0, hyper: 5.0, hyperPeak: 6.3, emerge: 7.4, approach: 9.6, open: 10.5, enter: 11.2, command: 12.4, welcome: 13.0, name: 13.6, handover: 15.4, end: 16.2 };
export const ASSETS = ['nebula.jpg', 'galaxy.webp', 'planet.webp', 'station.webp', 'command.jpg', 'emblem.png'];
export const TRACK = '/static/audio/cosmic-ascension.mp3?v=1';   // the owner's soundtrack (rights confirmed by the owner)

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const easeIn = (k) => clamp(k, 0, 1) ** 2.2;
const span = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ───────────────────────────── assets ───────────────────────────── */
const imgCache = new Map();
let trackP = null;
export function preload() {
    if (!trackP) trackP = fetch(TRACK, { cache: 'force-cache' }).then((r) => r.ok && r.arrayBuffer()).catch(() => null);   // warm the browser cache
    return Promise.all(ASSETS.map((f) => {
        if (imgCache.has(f)) return imgCache.get(f);
        const p = new Promise((res) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => res(null); i.src = ART + f; });
        imgCache.set(f, p); return p;
    }));
}

/* ───────────────────────────── quality ───────────────────────────── */
function pickQuality() {
    let gpu = '';
    try {
        const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
        if (!gl) return null;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
        const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    } catch (e) { return null; }
    if (window.__zvCineTier !== undefined) { const t = +window.__zvCineTier; return t >= 2 ? { tier: 2, dpr: 1, stars: 7000, bloom: true, bloomScale: 1, gpu } : t === 1 ? { tier: 1, dpr: 1, stars: 4200, bloom: true, bloomScale: 0.5, gpu } : { tier: 0, dpr: 0.75, stars: 2200, bloom: false, gpu }; }   // for testing
    const integrated = /intel|uhd|iris|mali|adreno|powervr|apple gpu|swiftshader|llvmpipe|software|microsoft basic/i.test(gpu);
    const small = Math.min(screen.width, screen.height) < 700 || (navigator.hardwareConcurrency || 4) <= 4;
    if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) return { tier: 0, dpr: 0.75, stars: 2200, bloom: false, gpu };
    if (integrated || small) return { tier: 1, dpr: Math.min(1, devicePixelRatio || 1), stars: 4200, bloom: true, bloomScale: 0.5, gpu };
    return { tier: 2, dpr: Math.min(1.75, devicePixelRatio || 1), stars: 7000, bloom: true, bloomScale: 1, gpu };
}

/* ───────────────────────────── overlay (DOM) ───────────────────────────── */
const CSS = `
#ca{position:fixed;inset:0;z-index:2147483000;background:#000;color:#e8ecf8;font-family:Inter,-apple-system,'Segoe UI',sans-serif;opacity:0;transition:opacity .8s ease;user-select:none;-webkit-user-select:none;overflow:hidden}
#ca.on{opacity:1} #ca.bye{opacity:0;transition:opacity .8s ease}
#ca canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
#ca .bars:before,#ca .bars:after{content:'';position:absolute;left:0;right:0;height:9vh;background:#000;z-index:3;transition:transform 1.4s cubic-bezier(.6,0,.2,1)}
#ca .bars:before{top:0} #ca .bars:after{bottom:0}
#ca.wide .bars:before{transform:translateY(-100%)} #ca.wide .bars:after{transform:translateY(100%)}
#ca .flash{position:absolute;inset:0;background:#eef4ff;opacity:0;z-index:4;pointer-events:none;transition:opacity .35s ease}
#ca .title{position:absolute;left:0;right:0;bottom:calc(9vh + 26px);text-align:center;z-index:5;font:500 11px/1 Inter,sans-serif;letter-spacing:.6em;color:rgba(200,210,240,.0);transition:color 1.2s ease;text-indent:.6em}
#ca .title.on{color:rgba(200,210,240,.55)}
#ca .wel{position:absolute;left:50%;top:21%;transform:translateX(-50%);text-align:center;z-index:5;width:min(92vw,900px);pointer-events:none}
#ca .wel .k{font:300 clamp(13px,1.5vw,18px)/1 Inter,sans-serif;letter-spacing:.7em;text-indent:.7em;color:#cfd8f4;opacity:0;filter:blur(8px);transform:translateY(10px);transition:all 1.4s cubic-bezier(.2,.7,.2,1)}
#ca .wel .rule{width:0;height:1px;margin:22px auto;background:linear-gradient(90deg,transparent,rgba(190,205,255,.85),transparent);transition:width 1.6s cubic-bezier(.2,.7,.2,1) .2s}
#ca .wel .n{font:600 clamp(30px,5.4vw,68px)/1.05 Inter,sans-serif;letter-spacing:.08em;color:#fff;opacity:0;filter:blur(10px);transform:scale(1.04);transition:all 1.5s cubic-bezier(.2,.7,.2,1);text-shadow:0 0 30px rgba(140,160,255,.35);word-break:break-word}
#ca .wel .r{display:inline-block;margin-top:18px;font:600 11px/1 Inter,sans-serif;letter-spacing:.5em;text-indent:.5em;color:#d7dcf0;padding:9px 16px;border:1px solid rgba(200,210,255,.35);border-radius:2px;background:rgba(10,14,30,.35);opacity:0;transition:opacity 1.2s ease .5s;backdrop-filter:blur(6px)}
#ca .wel.k1 .k{opacity:1;filter:none;transform:none} #ca .wel.k1 .rule{width:min(420px,60vw)}
#ca .wel.k2 .n{opacity:1;filter:none;transform:none} #ca .wel.k2 .r{opacity:1}
#ca .ctl{position:absolute;right:18px;bottom:calc(9vh + 14px);z-index:6;display:flex;align-items:center;gap:8px;opacity:.55;transition:opacity .3s}
#ca .ctl:hover,#ca .ctl:focus-within{opacity:1}
#ca .ctl button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:17px;font:600 11px/1 Inter,sans-serif;letter-spacing:.12em;color:#e8ecf8;background:rgba(14,18,34,.55);border:1px solid rgba(190,200,240,.22);backdrop-filter:blur(8px)}
#ca .ctl button:focus-visible{outline:2px solid #9fb3ff;outline-offset:2px}
#ca .ctl button svg{width:15px;height:15px}
#ca .ctl input[type=range]{width:86px;accent-color:#b9c4ff}
#ca .ctl .hint{font:500 11px/1 Inter,sans-serif;color:#c6cdea;letter-spacing:.06em;margin-right:4px;opacity:0;transition:opacity .4s}
#ca .ctl .hint.on{opacity:1}
#ca .fb{position:absolute;inset:-4%;background-position:center;background-size:cover;opacity:0;transition:opacity 1.2s ease,transform 6s ease-out}
@media (max-width:600px){#ca .ctl input[type=range]{display:none}#ca .bars:before,#ca .bars:after{height:6vh}}
@media (prefers-reduced-motion:reduce){#ca .wel *{transition-duration:.01s!important}}
`;
const ICON = {
    snd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>',
    full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    skip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 4 10 8-10 8z"/><path d="M19 5v14"/></svg>',
};
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

function buildOverlay(name, role) {
    if (!document.getElementById('ca-css')) { const s = document.createElement('style'); s.id = 'ca-css'; s.textContent = CSS; document.head.appendChild(s); }
    const el = document.createElement('div');
    el.id = 'ca'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Entering the Vault');
    el.innerHTML = `
      <div class="bars" aria-hidden="true"></div><div class="flash" aria-hidden="true"></div>
      <div class="title" aria-hidden="true">ZELPOPHAI VAULT · COSMIC ASCENSION</div>
      <div class="wel" aria-live="polite"><div class="k">WELCOME TO THE VAULT</div><div class="rule"></div><div class="n">${esc(name)}</div><div class="r">${esc(role)}</div></div>
      <div class="ctl">
        <span class="hint" data-hint>Sound is off — tap the speaker</span>
        <button type="button" data-mute aria-label="Mute">${ICON.snd}</button>
        <input type="range" min="0" max="100" step="1" data-vol aria-label="Volume">
        <button type="button" data-full aria-label="Full screen">${ICON.full}</button>
        <button type="button" data-skip aria-label="Skip the intro">${ICON.skip}<span>SKIP</span></button>
      </div>`;
    document.body.appendChild(el);
    return el;
}

/* ───────────────────────────── textures made in code ───────────────────────────── */
function glowTexture(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// The station's entrance door: a brushed-metal iris plate carrying the Zelpophai emblem.
function doorTexture(emblem) {
    const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), m = S / 2;
    g.save(); g.beginPath(); g.arc(m, m, m - 4, 0, Math.PI * 2); g.clip();
    const base = g.createRadialGradient(m * 0.8, m * 0.7, 40, m, m, m);
    base.addColorStop(0, '#8b93a8'); base.addColorStop(0.45, '#3c4256'); base.addColorStop(1, '#141826');
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {   // brushed metal
        const r = Math.random() * m, a = Math.random() * Math.PI * 2;
        g.strokeStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.lineWidth = 1;
        g.beginPath(); g.arc(m, m, r, a, a + Math.random() * 0.8); g.stroke();
    }
    [[0.96, 'rgba(180,195,255,.55)', 6], [0.82, 'rgba(120,140,255,.35)', 3], [0.42, 'rgba(170,140,255,.55)', 4]].forEach(([r, col, w]) => {
        g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(m, m, m * r, 0, Math.PI * 2); g.stroke();
    });
    for (let i = 0; i < 12; i++) {   // bolts
        const a = i / 12 * Math.PI * 2, x = m + Math.cos(a) * m * 0.89, y = m + Math.sin(a) * m * 0.89;
        const bg = g.createRadialGradient(x - 4, y - 4, 1, x, y, 16); bg.addColorStop(0, '#dfe5f5'); bg.addColorStop(1, '#2a3042');
        g.fillStyle = bg; g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 5; g.beginPath(); g.moveTo(m, 0); g.lineTo(m, S); g.stroke();   // the seam where it splits
    if (emblem) {
        const e = m * 0.62;
        g.shadowColor = 'rgba(150,170,255,.9)'; g.shadowBlur = 50;
        g.drawImage(emblem, m - e / 2, m - e / 2, e, e);
        g.shadowBlur = 0;
    }
    g.restore();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

/* ───────────────────────────── the WebGL film ───────────────────────────── */
function createFilm(canvas, Q, imgs) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.tier >= 2, powerPreference: 'high-performance', alpha: false });
    renderer.setPixelRatio(Q.dpr); renderer.setSize(innerWidth, innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
    const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.5, 9000);
    const disposables = [];
    const tex = (img) => { if (!img) return null; const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; t.anisotropy = 4; disposables.push(t); return t; };
    const [iNeb, iGal, iPlan, iStat, iCmd, iEmb] = imgs;
    const vh = (z) => 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * z;   // visible height at distance z

    // deep-space backdrop that rides with the camera, with a slow drift
    const back = new THREE.Group(); camera.add(back); scene.add(camera);
    let neb = null;
    if (iNeb) {
        const h = vh(6000) * 1.25, w = h * (iNeb.width / iNeb.height);
        const m = new THREE.MeshBasicMaterial({ map: tex(iNeb), transparent: true, opacity: 0, depthWrite: false, toneMapped: true });
        neb = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(w, h * camera.aspect * 1.25), h), m); neb.position.z = -6000; back.add(neb);
        disposables.push(neb.geometry, m);
    }
    // distant galaxies
    const galaxies = [];
    if (iGal) {
        const gt = tex(iGal);
        [[-1400, 620, -5200, 520, 0.4], [1700, -520, -5600, 360, -0.6], [600, 900, -5800, 240, 1.2]].forEach(([x, y, z, s, r]) => {
            const m = new THREE.SpriteMaterial({ map: gt, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, rotation: r });
            const sp = new THREE.Sprite(m); sp.position.set(x, y, z); sp.scale.set(s * 1.8, s, 1); scene.add(sp); galaxies.push(sp); disposables.push(m);
        });
    }

    // stars: soft points that stretch into hyperspace streaks
    const N = Q.stars, P = new Float32Array(N * 3), C = new Float32Array(N * 3), SZ = new Float32Array(N), L = new Float32Array(N * 6), LC = new Float32Array(N * 6), TINT = new Float32Array(N * 3);
    const FAR = 2600;
    function spawn(i, anyDepth) {
        const z = anyDepth ? -(20 + Math.random() * FAR) : -(FAR * (0.85 + Math.random() * 0.15));
        const spread = Math.tan(THREE.MathUtils.degToRad(40)) * -z;
        P[i * 3] = (Math.random() * 2 - 1) * spread * Math.max(1.2, camera.aspect); P[i * 3 + 1] = (Math.random() * 2 - 1) * spread; P[i * 3 + 2] = z;
    }
    for (let i = 0; i < N; i++) {
        spawn(i, true);
        const k = Math.random(), b = 0.55 + Math.random() * 0.45;
        const col = k < 0.62 ? [1, 1, 1] : k < 0.86 ? [0.78, 0.86, 1] : k < 0.96 ? [1, 0.92, 0.8] : [0.85, 0.75, 1];
        C[i * 3] = col[0] * b; C[i * 3 + 1] = col[1] * b; C[i * 3 + 2] = col[2] * b;
        const tk = Math.random(); const tint = tk < 0.45 ? [0.55, 0.75, 1] : tk < 0.75 ? [0.75, 0.6, 1] : tk < 0.93 ? [1, 1, 1] : [0.6, 1, 0.95];
        TINT[i * 3] = tint[0]; TINT[i * 3 + 1] = tint[1]; TINT[i * 3 + 2] = tint[2];
        SZ[i] = Math.random() < 0.97 ? 0.6 + Math.random() * 1.2 : 2 + Math.random() * 2.5;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(P, 3)); pg.setAttribute('aColor', new THREE.BufferAttribute(C, 3)); pg.setAttribute('aSize', new THREE.BufferAttribute(SZ, 1));
    const pm = new THREE.ShaderMaterial({
        uniforms: { uPix: { value: renderer.getPixelRatio() }, uOpacity: { value: 0 }, uTime: { value: 0 } },
        vertexShader: `attribute float aSize; attribute vec3 aColor; uniform float uPix; uniform float uTime; varying vec3 vC; varying float vA;
          void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; float d = -mv.z;
            gl_PointSize = clamp(aSize * uPix * 520.0 / d, 0.8 * uPix, 7.0 * uPix);
            float tw = 0.82 + 0.18 * sin(uTime * (1.3 + fract(aSize * 7.1) * 2.0) + position.x * 0.07);
            vC = aColor * tw; vA = smoothstep(${FAR.toFixed(1)}, ${(FAR * 0.7).toFixed(1)}, d); }`,
        fragmentShader: `uniform float uOpacity; varying vec3 vC; varying float vA;
          void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c); float a = smoothstep(0.5, 0.0, r); a *= a; gl_FragColor = vec4(vC * 1.25, a * vA * uOpacity); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(pg, pm); points.frustumCulled = false; scene.add(points);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(L, 3)); lg.setAttribute('color', new THREE.BufferAttribute(LC, 3));
    const lm = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const lines = new THREE.LineSegments(lg, lm); lines.frustumCulled = false; scene.add(lines);
    disposables.push(pg, pm, lg, lm);

    // the bright heart of hyperspace
    const coreTex = glowTexture([[0, 'rgba(255,255,255,1)'], [0.08, 'rgba(225,238,255,.95)'], [0.25, 'rgba(140,175,255,.45)'], [0.55, 'rgba(110,90,255,.12)'], [1, 'rgba(0,0,0,0)']]);
    disposables.push(coreTex);
    const coreM = new THREE.SpriteMaterial({ map: coreTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Sprite(coreM); core.position.set(0, 0, -1500); core.scale.set(900, 900, 1); scene.add(core); disposables.push(coreM);

    // the planet and the station
    const world = new THREE.Group(); scene.add(world); world.visible = false;
    let planet = null;
    if (iPlan) {
        const m = new THREE.MeshBasicMaterial({ map: tex(iPlan), transparent: true, depthWrite: false });
        const s = 2600; planet = new THREE.Mesh(new THREE.PlaneGeometry(s * iPlan.width / iPlan.height, s), m);
        planet.position.set(-2300, -900, -5200); world.add(planet); disposables.push(planet.geometry, m);
    }
    const station = new THREE.Group(); world.add(station);
    let stW = 1200;
    if (iStat) {
        const m = new THREE.MeshBasicMaterial({ map: tex(iStat), transparent: true, depthWrite: false, color: 0xc9ccd4 });   // a touch darker so the bloom only catches the lights
        const s = 1200; stW = s * iStat.width / iStat.height;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(stW, s), m); station.add(mesh); disposables.push(mesh.geometry, m);
    }
    const lightTex = glowTexture([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(220,232,255,.95)'], [0.45, 'rgba(130,160,255,.4)'], [1, 'rgba(0,0,0,0)']]);
    disposables.push(lightTex);
    const lightM = new THREE.SpriteMaterial({ map: lightTex, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    const HUB_Y = -9;   // the docking entrance sits just below the middle of the station picture
    const light = new THREE.Sprite(lightM); light.scale.set(520, 520, 1); light.position.set(0, HUB_Y, 1); station.add(light); disposables.push(lightM);
    // the door: two halves of one plate so it can open
    const DOOR = 150, doorT = doorTexture(iEmb); disposables.push(doorT);
    const halves = [0, 1].map((side) => {
        const g = new THREE.PlaneGeometry(DOOR / 2, DOOR);
        const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + side * 0.5);
        const m = new THREE.MeshBasicMaterial({ map: doorT, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(g, m); mesh.position.set((side ? 1 : -1) * DOOR / 4, HUB_Y, 2); station.add(mesh); disposables.push(g, m); return mesh;
    });
    const emM = new THREE.SpriteMaterial({ map: lightTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x9fb0ff });
    const emGlow = new THREE.Sprite(emM); emGlow.scale.set(240, 240, 1); emGlow.position.set(0, HUB_Y, 3); station.add(emGlow); disposables.push(emM);

    // docking tunnel: heavy metal ribs lit by a lamp that travels with us, with light strips between
    const tunnel = new THREE.Group(); scene.add(tunnel); tunnel.visible = false;
    const amb = new THREE.AmbientLight(0x3a4060, 0.35), lamp = new THREE.PointLight(0xc4ceff, 5000, 0, 2), lamp2 = new THREE.PointLight(0x9a7cff, 12000, 0, 2);
    lamp.position.set(0, 0, -30); lamp2.position.set(0, 0, -420); scene.add(amb); scene.add(lamp); scene.add(lamp2);
    const RINGS = 30, ringGap = 80;
    const ribG = new THREE.TorusGeometry(62, 5, 14, 72), stripG = new THREE.TorusGeometry(55, 0.7, 6, 96);
    disposables.push(ribG, stripG);
    for (let i = 0; i < RINGS; i++) {
        const m = new THREE.MeshStandardMaterial({ color: 0x5a6280, metalness: 0.8, roughness: 0.4, transparent: true, opacity: 1 });
        const r = new THREE.Mesh(ribG, m); r.position.z = -i * ringGap - 60; r.userData.base = r.position.z; tunnel.add(r); disposables.push(m);
        if (i % 2 === 0) {
            const sm = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i % 4 === 0 ? 0.7 : 0.6, 0.85, 0.7), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
            const st = new THREE.Mesh(stripG, sm); st.position.z = r.position.z - ringGap / 2; st.userData.base = st.position.z; tunnel.add(st); disposables.push(sm);
        }
    }
    const endM = new THREE.SpriteMaterial({ map: lightTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const endGlow = new THREE.Sprite(endM); endGlow.position.z = -RINGS * ringGap; endGlow.scale.set(900, 900, 1); tunnel.add(endGlow); disposables.push(endM);

    // command centre
    let cmd = null;
    if (iCmd) {
        const m = new THREE.MeshBasicMaterial({ map: tex(iCmd), transparent: true, opacity: 0, depthWrite: false });
        cmd = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); cmd.position.z = -60; camera.add(cmd); disposables.push(cmd.geometry, m);
    }
    function fitCmd(scale) {
        if (!cmd || !iCmd) return;
        const h = vh(60), w = h * camera.aspect, ia = iCmd.width / iCmd.height;
        const W = Math.max(w, h * ia), H = W / ia;
        cmd.scale.set(W * scale, H * scale, 1);
    }

    // post-processing: bloom for the light sources
    let composer = null, bloom = null;
    if (Q.bloom) {
        composer = new EffectComposer(renderer);
        composer.setPixelRatio(Q.dpr * (Q.bloomScale || 1));
        composer.setSize(innerWidth, innerHeight);
        composer.addPass(new RenderPass(scene, camera));
        bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.5, 0.6);
        composer.addPass(bloom);
        composer.addPass(new OutputPass());
    }

    function resize() {
        camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight, false);
        if (composer) composer.setSize(innerWidth, innerHeight);
    }

    // speed of travel (world units per second) through the film
    function speedAt(t) {
        if (t < T.accel) return 22;
        if (t < T.hyper) return lerp(22, 700, easeIn(span(t, T.accel, T.hyper)));
        if (t < T.hyperPeak) return lerp(700, 5200, ease(span(t, T.hyper, T.hyperPeak)));
        if (t < T.emerge) return lerp(5200, 3800, span(t, T.hyperPeak, T.emerge));
        return lerp(320, 30, ease(span(t, T.emerge, T.emerge + 1.2)));
    }

    let last = 0, shake = 0;
    function frame(t, dt) {
        const v = speedAt(t);
        const hyperK = t < T.hyper ? span(t, T.accel + 1.2, T.hyper) * 0.35 : t < T.emerge ? 1 : Math.max(0, 1 - (t - T.emerge) / 0.35);
        // backdrop
        const reveal = ease(span(t, T.reveal, T.reveal + 2.0));
        if (neb) { neb.material.opacity = reveal * (1 - hyperK * 0.75) * (t > T.enter + 0.2 ? 0 : 1); neb.rotation.z = t * 0.004; neb.position.x = Math.sin(t * 0.07) * 60; }
        galaxies.forEach((g, i) => { g.material.opacity = reveal * 0.55 * (1 - hyperK) * (t > T.enter ? 0 : 1); g.position.z += v * dt * 0.02; if (g.position.z > -800) g.position.z = -5800; g.material.rotation += dt * 0.01 * (i % 2 ? -1 : 1); });
        // stars and streaks
        const inSpace = t < T.enter + 0.2;
        points.visible = lines.visible = inSpace;
        if (inSpace) {
            const len = clamp(v * 0.055, 0, 1400), lineK = clamp((v - 140) / 1200, 0, 1);
            for (let i = 0; i < N; i++) {
                let z = P[i * 3 + 2] + v * dt;
                if (z > -6) { spawn(i, false); z = P[i * 3 + 2]; }
                P[i * 3 + 2] = z;
                const x = P[i * 3], y = P[i * 3 + 1], j = i * 6;
                L[j] = x; L[j + 1] = y; L[j + 2] = z; L[j + 3] = x; L[j + 4] = y; L[j + 5] = z - len;
                const fade = clamp((FAR + z) / 500, 0, 1) * (0.8 + 0.6 * lineK);
                const r = lerp(C[i * 3], TINT[i * 3], lineK), g = lerp(C[i * 3 + 1], TINT[i * 3 + 1], lineK), b = lerp(C[i * 3 + 2], TINT[i * 3 + 2], lineK);
                LC[j] = r * fade; LC[j + 1] = g * fade; LC[j + 2] = b * fade; LC[j + 3] = 0; LC[j + 4] = 0; LC[j + 5] = 0;
            }
            pg.attributes.position.needsUpdate = true; lg.attributes.position.needsUpdate = true; lg.attributes.color.needsUpdate = true;
            pm.uniforms.uOpacity.value = reveal * (1 - lineK * 0.85) * (t > T.enter ? Math.max(0, 1 - (t - T.enter) * 4) : 1);
            pm.uniforms.uTime.value = t;
            lm.opacity = lineK * 0.85 * (t > T.enter ? 0 : 1);
        }
        coreM.opacity = hyperK * (0.42 + 0.06 * Math.sin(t * 9)) * (t < T.emerge ? 1 : 0);
        core.scale.setScalar(700 + hyperK * 900 + Math.sin(t * 13) * 40);

        // the station sequence
        world.visible = t > T.emerge - 0.05 && t < T.enter + 0.6;
        if (world.visible) {
            const k = span(t, T.emerge, T.enter);                       // 0 → 1 across the approach
            const zz = lerp(-4600, -70, Math.pow(ease(k), 1.35));
            station.position.set(lerp(260, 0, ease(k)), lerp(60, 0, ease(k)), zz);
            station.rotation.z = lerp(-0.12, 0, ease(k));
            if (planet) { planet.position.z = lerp(-5600, -3900, k); planet.position.x = lerp(-2100, -2700, k); planet.visible = t < T.enter; }
            light.material.opacity = 0.22 + 0.5 * span(t, T.approach, T.enter);
            emM.opacity = 0.12 + 0.35 * span(t, T.approach, T.open) * (0.75 + 0.25 * Math.sin(t * 6));
            const open = ease(span(t, T.open, T.enter - 0.15));
            halves[0].position.x = -DOOR / 4 - open * DOOR * 0.62; halves[1].position.x = DOOR / 4 + open * DOOR * 0.62;
            light.scale.setScalar(380 + open * 160); light.material.opacity = Math.min(0.5, light.material.opacity);
            // after the door opens, everything but the light falls away as we pass through
            if (t > T.enter) station.position.z = lerp(-70, 120, span(t, T.enter, T.enter + 0.5));
        }
        // tunnel
        tunnel.visible = t > T.enter - 0.1 && t < T.command + 0.1; amb.visible = lamp.visible = lamp2.visible = tunnel.visible;
        if (tunnel.visible) {
            const tk = span(t, T.enter, T.command), travel = tk * RINGS * ringGap * 0.9;
            tunnel.children.forEach((r) => { if (r.userData.base !== undefined) { r.position.z = r.userData.base + travel; r.visible = r.position.z < 30; r.material.opacity = clamp(1 + r.position.z / 1900, 0, 1) * clamp(-r.position.z / 50, 0, 1); } });
            endGlow.position.z = -RINGS * ringGap + travel * 0.6; endM.opacity = 0.3 + 0.7 * tk;
            tunnel.rotation.z = t * 0.25;
        }
        // command centre
        if (cmd) {
            const ck = span(t, T.command - 0.05, T.command + 0.9);
            cmd.material.opacity = ease(ck);
            fitCmd(lerp(1.12, 1.0, ease(span(t, T.command, T.end))));
            cmd.position.y = lerp(-1.4, 0.6, ease(span(t, T.command, T.end)));
        }
        // camera: slow cinematic drift, a little roll and shake in hyperspace
        shake = hyperK * (t < T.emerge ? 1 : 0);
        camera.rotation.z = Math.sin(t * 0.35) * 0.02 + shake * Math.sin(t * 31) * 0.004;
        camera.rotation.x = Math.sin(t * 0.21) * 0.012 + shake * Math.sin(t * 27) * 0.003;
        camera.rotation.y = Math.sin(t * 0.17) * 0.015;
        camera.fov = 58 + hyperK * 14 + (t > T.enter && t < T.command ? 10 * Math.sin(span(t, T.enter, T.command) * Math.PI) : 0);
        camera.updateProjectionMatrix();
        renderer.toneMappingExposure = 1.0 + (t > T.command ? 0.05 : 0);
        if (bloom) {
            bloom.strength = t < T.accel ? 0.7 : t < T.emerge ? lerp(0.75, 1.2, hyperK) : t < T.enter ? 0.7 + 0.6 * span(t, T.open, T.enter) : t < T.command ? 1.3 : 0.45;
            bloom.radius = t < T.command ? 0.6 : 0.45;
            composer.render(dt);
        } else renderer.render(scene, camera);
        last = t;
    }

    function dispose() {
        try { composer && composer.dispose && composer.dispose(); } catch (e) {}
        disposables.forEach((d) => { try { d.dispose(); } catch (e) {} });
        try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) {}
    }
    return { frame, resize, dispose, renderer };
}

/* ───────────────────────────── the player ───────────────────────────── */
let active = null;
export function play(opts = {}) {
    if (active) return active;          // never two at once
    active = run(opts).finally(() => { active = null; });
    return active;
}

async function run(opts) {
    const name = String(opts.name || '').slice(0, 40) || 'Operator';
    const role = String(opts.role || 'OWNER').toUpperCase();
    const hold = !!opts.hold;           // keep the final frame (the page navigates away itself)
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = buildOverlay(name.toUpperCase(), role);
    const $ = (s) => el.querySelector(s);
    const wel = $('.wel'), flash = $('.flash'), title = $('.title');
    const prevFocus = document.activeElement;
    try { prevFocus && prevFocus.blur && prevFocus.blur(); } catch (e) {}

    // sound
    const score = new Score({ volume: +(store('zv_cine_vol') ?? 60) / 100, muted: store('zv_cine_mute') === '1', timeline: T, reduced: reduce, track: opts.track || window.ZV_CINE_TRACK || TRACK });
    const muteB = $('[data-mute]'), vol = $('[data-vol]'), hint = $('[data-hint]');
    vol.value = Math.round(score.volume * 100);
    const paintMute = () => { muteB.innerHTML = score.muted ? ICON.mute : ICON.snd; muteB.setAttribute('aria-label', score.muted ? 'Unmute' : 'Mute'); };
    paintMute();
    muteB.onclick = (e) => { e.stopPropagation(); score.resume(); score.setMuted(!score.muted); store('zv_cine_mute', score.muted ? '1' : '0'); paintMute(); hint.classList.remove('on'); };
    vol.oninput = (e) => { e.stopPropagation(); score.resume(); score.setVolume(vol.value / 100); store('zv_cine_vol', vol.value); if (score.muted && vol.value > 0) { score.setMuted(false); store('zv_cine_mute', '0'); paintMute(); } };
    el.addEventListener('pointerdown', () => { score.resume(); hint.classList.remove('on'); });   // browsers may hold audio until a tap

    let entered = false;
    $('[data-full]').onclick = async (e) => {
        e.stopPropagation();
        try { if (document.fullscreenElement) await document.exitFullscreen(); else { await el.requestFullscreen({ navigationUI: 'hide' }); entered = true; } } catch (err) {}
    };

    let skipped = false, done = false, raf = 0, film = null, resolveEnd;
    const cleanup = [];
    const ended = new Promise((r) => { resolveEnd = r; });
    const skip = () => { if (done) return; skipped = true; finish(); };
    $('[data-skip]').onclick = (e) => { e.stopPropagation(); skip(); };
    // keys: Esc or S skips; nothing else is passed through to the page underneath
    const onKey = (e) => { e.stopPropagation(); if (e.key === 'Escape' || e.key === 's' || e.key === 'S') { e.preventDefault(); skip(); } else if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); };
    document.addEventListener('keydown', onKey, true);

    requestAnimationFrame(() => el.classList.add('on'));     // the interface fades into darkness
    try { opts.onStart && opts.onStart(); } catch (e) {}

    const Q = reduce ? null : pickQuality();
    const imgsP = preload();
    const start = performance.now() + T.fade * 1000;           // the film clock starts once we're black
    const clock = () => (performance.now() - start) / 1000;
    setTimeout(() => { try { opts.onBlack && opts.onBlack(); } catch (e) {} }, T.fade * 1000);

    // audio starts with the film clock
    const audioOK = await score.start(T.fade).catch(() => false);
    if (!audioOK && !score.muted) setTimeout(() => { if (!done) hint.classList.add('on'); }, 1200);

    const cues = [];
    const cue = (at, fn) => cues.push(setTimeout(() => { if (!done) fn(); }, Math.max(0, start - performance.now() + at * 1000)));
    cue(T.reveal + 0.4, () => title.classList.add('on'));
    cue(T.accel, () => title.classList.remove('on'));
    cue(T.command - 0.25, () => { flash.style.opacity = '0.9'; });
    cue(T.command + 0.05, () => { flash.style.opacity = '0'; el.classList.add('wide'); });
    cue(T.welcome, () => wel.classList.add('k1'));
    cue(T.name, () => wel.classList.add('k2'));
    cue(T.handover, () => finish());

    let fallback = !Q;
    if (Q) {
        try {
            const imgs = await Promise.race([imgsP, new Promise((r) => setTimeout(() => r(null), 6000))]) || await imgsP;
            const cv = document.createElement('canvas'); el.insertBefore(cv, el.firstChild);
            film = createFilm(cv, Q, imgs);
            const onResize = () => film && film.resize();
            addEventListener('resize', onResize); cleanup.push(() => removeEventListener('resize', onResize));
            // adaptive quality: if the first second is slow, drop the resolution
            let frames = 0, slow = 0, prev = performance.now();
            const loop = () => {
                if (done && !hold) return;
                raf = requestAnimationFrame(loop);
                const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now;
                if (++frames < 90 && frames > 10 && dt > 0.034) slow++;
                if (frames === 90 && slow > 40 && film.renderer.getPixelRatio() > 0.7) { film.renderer.setPixelRatio(Math.max(0.6, film.renderer.getPixelRatio() * 0.7)); film.resize(); }
                film.frame(Math.max(0, clock()), dt); window.__zvCineT = clock();
            };
            raf = requestAnimationFrame(loop);
        } catch (e) {
            console.warn('[cosmic] WebGL film failed, using the still version', e);
            fallback = true;
        }
    }
    if (fallback) stills(el, reduce, imgsP, start);

    function finish() {
        if (done) return; done = true;
        cues.forEach(clearTimeout);
        document.removeEventListener('keydown', onKey, true);
        score.fadeOut(skipped ? 0.35 : 0.9);
        if (hold) { resolveEnd({ skipped }); return; }          // caller navigates; the last frame stays up
        el.classList.add('bye');
        setTimeout(() => {
            cancelAnimationFrame(raf);
            cleanup.forEach((f) => { try { f(); } catch (e) {} });
            try { film && film.dispose(); } catch (e) {}
            score.close();
            try { if (entered && document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
            el.remove();
            resolveEnd({ skipped });
        }, 850);
    }
    if (reduce) cue(3.2, () => finish());
    return ended;
}

// No WebGL (or it failed), or reduced motion: the same story told with the still frames.
function stills(el, reduce, imgsP, start) {
    const at = (s) => Math.max(0, start - performance.now() + s * 1000);
    const layer = (f, z) => { const d = document.createElement('div'); d.className = 'fb'; d.style.backgroundImage = `url(${ART}${f})`; d.style.zIndex = z; el.insertBefore(d, el.firstChild); return d; };
    if (reduce) {
        const c = layer('command.jpg', 1); c.style.transition = 'opacity .6s'; requestAnimationFrame(() => { c.style.opacity = '1'; });
        el.querySelector('.wel').classList.add('k1', 'k2'); el.classList.add('wide');
        return;
    }
    const n = layer('nebula.jpg', 0), s = layer('station.webp', 1), c = layer('command.jpg', 2);
    s.style.backgroundSize = 'contain'; s.style.backgroundRepeat = 'no-repeat';
    setTimeout(() => { n.style.opacity = '1'; n.style.transform = 'scale(1.15)'; }, at(T.reveal));
    setTimeout(() => { n.style.transition = 'opacity .8s ease,transform 2.4s ease-in'; n.style.transform = 'scale(2.2)'; n.style.opacity = '0'; }, at(T.hyper));
    setTimeout(() => { s.style.transform = 'scale(.7)'; s.style.opacity = '1'; s.style.transition = 'opacity 1s ease,transform 4s ease-in'; requestAnimationFrame(() => { s.style.transform = 'scale(2.6)'; }); }, at(T.emerge));
    setTimeout(() => { s.style.opacity = '0'; c.style.opacity = '1'; c.style.transform = 'scale(1.04)'; }, at(T.command));
}
