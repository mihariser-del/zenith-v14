/* ZPop — the one popup used everywhere: banned, maintenance, locked, broadcasts, limits, role changes,
   password notices, offline, and the small "Are you sure?" / "Type a value" dialogs.
   Self-contained (brings its own styles) so it works on every page, even after the page is cleared.

   ZPop.show({ id, tone, icon, badge, title, text | html, quote, quoteLabel, list, countdown, live, meta,
               actions: [{ label, kind: 'primary'|'ghost'|'link', onClick, keep, id }],
               dismissable, replaceBody, z, onClose })  ->  { el, close, setText }
   tone: danger | warn | good | info | owner | staff                                                   */
(function () {
  'use strict';
  if (window.ZPop) return;

  const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    ban: P('<circle cx="12" cy="12" r="9"/><path d="M5.7 5.7l12.6 12.6"/>'),
    wrench: P('<path d="M14.7 6.3a4 4 0 0 0-5.200 5.200L3 18l3 3 6.500-6.500a4 4 0 0 0 5.200-5.200l-2.600 2.600-2.400-.6-.6-2.400z"/>'),
    lock: P('<rect x="4.500" y="10.500" width="15" height="10" rx="2.500"/><path d="M8 10.500V7.500a4 4 0 0 1 8 0v3"/><path d="M12 14.500v2"/>'),
    unlock: P('<rect x="4.500" y="10.500" width="15" height="10" rx="2.500"/><path d="M8 10.500V7.500a4 4 0 0 1 7.600-1.700"/><path d="M12 14.500v2"/>'),
    megaphone: P('<path d="M3 10.500v3a1 1 0 0 0 1 1h2.500l7.500 4.500V5L6.500 9.500H4a1 1 0 0 0-1 1z"/><path d="M17.500 9a4 4 0 0 1 0 6"/><path d="M7 14.500l1 4.500h2.500"/>'),
    clock: P('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    check: P('<circle cx="12" cy="12" r="9"/><path d="M8 12.300l2.800 2.800L16 9.600"/>'),
    alert: P('<path d="M12 3.500l9.500 16.500h-19z"/><path d="M12 10v4.500"/><path d="M12 17.200v.01"/>'),
    trash: P('<path d="M4 7h16"/><path d="M9.500 7V4.500h5V7"/><path d="M6.500 7l.9 12.500h9.200L17.500 7"/><path d="M10 11v5M14 11v5"/>'),
    key: P('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9"/><path d="M17 6l3 3"/><path d="M14 9l2 2"/>'),
    offline: P('<path d="M3 3l18 18"/><path d="M5 12.500a10 10 0 0 1 4-2.600"/><path d="M2 9a15 15 0 0 1 4.200-2.800"/><path d="M12.700 6a15 15 0 0 1 9.300 3"/><path d="M15.500 10.600a10 10 0 0 1 3.500 1.900"/><path d="M8.500 16a5 5 0 0 1 5.300-1"/><path d="M12 19.500v.01"/>'),
    up: P('<circle cx="12" cy="12" r="9"/><path d="M12 16.500V8"/><path d="M8.300 11.500L12 7.800l3.700 3.700"/>'),
    down: P('<circle cx="12" cy="12" r="9"/><path d="M12 7.500V16"/><path d="M8.300 12.500L12 16.200l3.700-3.700"/>'),
    tools: P('<path d="M4 20l7-7"/><path d="M13.500 5.500a3.500 3.500 0 0 0 4.800 4.800L21 13l-2.500 2.500-8-8z"/><path d="M5 4l4 1 1.500 3L8 10.500 5 9z"/>'),
    heart: P('<path d="M12 20s-7.500-4.600-7.500-10.200A4.300 4.300 0 0 1 12 7.300a4.300 4.300 0 0 1 7.500 2.500C19.500 15.400 12 20 12 20z"/>'),
    users: P('<circle cx="9" cy="8.500" r="3.200"/><path d="M3 19.500c.5-3.300 2.900-5 6-5s5.500 1.700 6 5"/><circle cx="17" cy="9.500" r="2.500"/><path d="M17.500 14.600c2 .4 3.200 1.900 3.500 4.400"/>'),
    shield: P('<path d="M12 21.500s8-3.800 8-9.800V5.500l-8-3-8 3v6.200c0 6 8 9.800 8 9.800z"/><path d="M9 12l2.200 2.200L15.200 10"/>'),
    logout: P('<path d="M14 4.500h4a1.500 1.500 0 0 1 1.500 1.500v12a1.500 1.500 0 0 1-1.500 1.500h-4"/><path d="M10 12h-7"/><path d="M6.500 8.500L3 12l3.500 3.500"/>'),
    userx: P('<circle cx="10" cy="8.500" r="3.500"/><path d="M3.500 20c.6-3.600 3.200-5.500 6.500-5.500 1.300 0 2.500.3 3.500.9"/><path d="M16.500 15.500l4 4M20.500 15.500l-4 4"/>'),
    chatoff: P('<path d="M20.500 15a2 2 0 0 1-2 2H8l-4.500 4V6"/><path d="M8 4.500h10.500a2 2 0 0 1 2 2V12"/><path d="M3 3l18 18"/>'),
    bot: P('<rect x="4.500" y="8" width="15" height="11" rx="3"/><path d="M12 8V4.500"/><circle cx="12" cy="3.700" r="1"/><path d="M9.200 13v1.500M14.800 13v1.500"/>'),
    question: P('<circle cx="12" cy="12" r="9"/><path d="M9.500 9.500a2.600 2.600 0 1 1 3.800 2.300c-.8.5-1.300 1-1.300 2"/><path d="M12 17v.01"/>'),
    edit: P('<path d="M4 20h4L19.500 8.500a2.100 2.100 0 0 0-3-3L5 17z"/><path d="M14.500 7.500l3 3"/>'),
    hourglass: P('<path d="M6.500 3.500h11M6.500 20.500h11"/><path d="M7.500 3.500c0 4.500 4.500 5.500 4.500 8.500s-4.500 4-4.500 8.500"/><path d="M16.500 3.500c0 4.500-4.500 5.500-4.500 8.500s4.500 4 4.500 8.500"/>'),
    spark: P('<path d="M12 3.500l1.900 5.100 5.100 1.900-5.100 1.900L12 17.500l-1.900-5.100L5 10.500l5.100-1.900z"/><path d="M18.500 16.500l.7 1.800 1.800.7-1.800.7-.7 1.800-.7-1.800-1.800-.7 1.800-.7z"/>'),
    copy: P('<rect x="8.500" y="8.500" width="11" height="11" rx="2"/><path d="M5.500 15.500h-1a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
  };
  Object.keys(ICONS).forEach((k) => { ICONS[k] = ICONS[k].replace(/(\d)\.(\d)00\b/g, '$1.$2'); });

  const CSS = `
.zpop{--zp-bg:#0f1220;--zp-bg2:#141829;--zp-line:#262d47;--zp-text:#f2f4fb;--zp-dim:#a7afc6;--zp-mute:#737c97;--zp-box:rgba(255,255,255,.04);
  --zp-c:#60a5fa;--zp-c2:#3b82f6;--zp-on:#fff;--zp-soft:rgba(59,130,246,.14);--zp-ring:rgba(59,130,246,.34);
  position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;overflow-y:auto;
  background:rgba(4,6,13,.74);backdrop-filter:blur(10px) saturate(120%);-webkit-backdrop-filter:blur(10px) saturate(120%);
  font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--zp-text);animation:zpopFade .22s ease;-webkit-font-smoothing:antialiased}
.zpop *{box-sizing:border-box}
.zpop.full{background:radial-gradient(60% 50% at 50% 0%,var(--zp-soft),transparent 70%),#070910;backdrop-filter:none;-webkit-backdrop-filter:none}
.zpop.t-danger{--zp-c:#f87171;--zp-c2:#ef4444;--zp-soft:rgba(239,68,68,.14);--zp-ring:rgba(239,68,68,.36)}
.zpop.t-warn{--zp-c:#fbbf24;--zp-c2:#f59e0b;--zp-on:#1c1400;--zp-soft:rgba(245,158,11,.14);--zp-ring:rgba(245,158,11,.36)}
.zpop.t-good{--zp-c:#34d399;--zp-c2:#10b981;--zp-on:#03170f;--zp-soft:rgba(16,185,129,.14);--zp-ring:rgba(16,185,129,.36)}
.zpop.t-info{--zp-c:#60a5fa;--zp-c2:#3b82f6}
.zpop.t-owner{--zp-c:#dfe6f3;--zp-c2:#c3ccdc;--zp-on:#12151c;--zp-soft:rgba(223,230,243,.1);--zp-ring:rgba(223,230,243,.3)}
.zpop.t-staff{--zp-c:#fcd34d;--zp-c2:#f5b82e;--zp-on:#1c1400;--zp-soft:rgba(245,184,46,.13);--zp-ring:rgba(245,184,46,.36)}
.zpop-card{position:relative;width:100%;max-width:440px;margin:auto;padding:30px 28px 24px;text-align:center;overflow:hidden;
  background:linear-gradient(180deg,var(--zp-bg2),var(--zp-bg));border:1px solid var(--zp-line);border-radius:22px;
  box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.02) inset;animation:zpopIn .34s cubic-bezier(.2,.9,.25,1.05)}
.zpop-card::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:linear-gradient(90deg,transparent,var(--zp-c2),transparent)}
.zpop-card::after{content:"";position:absolute;left:50%;top:-120px;width:340px;height:240px;transform:translateX(-50%);background:radial-gradient(closest-side,var(--zp-soft),transparent);pointer-events:none}
.zpop-card>*{position:relative;z-index:1}
.zpop.sm .zpop-card{max-width:400px;padding:26px 24px 20px}
.zpop-x{position:absolute!important;top:12px;right:12px;width:32px;height:32px;border:0;border-radius:10px;background:transparent;color:var(--zp-mute);cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2!important;transition:background .15s,color .15s}
.zpop-x:hover{background:var(--zp-box);color:var(--zp-text)}
.zpop-x svg{width:17px;height:17px}
.zpop-ic{width:64px;height:64px;margin:2px auto 16px;border-radius:20px;display:flex;align-items:center;justify-content:center;color:var(--zp-c);background:var(--zp-soft);border:1px solid var(--zp-ring);box-shadow:0 0 0 7px var(--zp-soft)}
.zpop-ic svg{width:30px;height:30px}
.zpop.sm .zpop-ic{width:52px;height:52px;border-radius:16px;box-shadow:0 0 0 6px var(--zp-soft);margin-bottom:14px}
.zpop.sm .zpop-ic svg{width:25px;height:25px}
.zpop-badge{display:inline-flex;align-items:center;gap:7px;margin:0 0 12px;padding:5px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--zp-c);background:var(--zp-soft);border:1px solid var(--zp-ring)}
.zpop-badge i{width:6px;height:6px;border-radius:50%;background:var(--zp-c);animation:zpopPulse 1.6s ease-in-out infinite}
.zpop-title{margin:0 0 8px;font-size:22px;line-height:1.25;font-weight:750;letter-spacing:-.015em;color:var(--zp-text)}
.zpop.sm .zpop-title{font-size:18.500px}
.zpop-text{margin:0 auto 4px;max-width:36ch;font-size:14.500px;line-height:1.62;color:var(--zp-dim);overflow-wrap:anywhere}
.zpop-text b,.zpop-text strong{color:var(--zp-text);font-weight:650}
.zpop-quote{margin:16px 0 0;padding:13px 15px;text-align:left;border-radius:14px;background:var(--zp-box);border:1px solid var(--zp-line);border-left:3px solid var(--zp-c2);font-size:14.500px;line-height:1.6;color:var(--zp-text);white-space:pre-wrap;overflow-wrap:anywhere;max-height:38vh;overflow-y:auto}
.zpop-quote small{display:block;margin-bottom:5px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--zp-mute)}
.zpop-list{list-style:none;margin:16px 0 0;padding:12px 14px;text-align:left;border-radius:14px;background:var(--zp-box);border:1px solid var(--zp-line);display:grid;gap:8px}
.zpop-list li{display:flex;gap:9px;align-items:flex-start;font-size:13.500px;line-height:1.45;color:var(--zp-dim)}
.zpop-list li::before{content:"";flex:none;width:6px;height:6px;margin-top:7px;border-radius:50%;background:var(--zp-c)}
.zpop-count{margin:16px 0 0;font-size:34px;font-weight:800;letter-spacing:-.01em;font-variant-numeric:tabular-nums;color:var(--zp-c)}
.zpop-count small{display:block;margin-top:2px;font-size:11.500px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--zp-mute)}
.zpop-live{display:flex;align-items:center;justify-content:center;gap:9px;margin:18px 0 0;padding:10px 12px;border-radius:12px;background:var(--zp-box);border:1px solid var(--zp-line);font-size:12.500px;color:var(--zp-dim)}
.zpop-live i{flex:none;width:14px;height:14px;border-radius:50%;border:2px solid var(--zp-ring);border-top-color:var(--zp-c);animation:zpopSpin .9s linear infinite}
.zpop-field{margin:16px 0 0;text-align:left}
.zpop-field label{display:block;margin:0 0 6px;font-size:12.5px;font-weight:650;color:var(--zp-dim)}
.zpop-err{margin:10px 0 0;font-size:13px;color:#f87171;text-align:left}.zpop-err:empty{display:none}
.zpop-field input{width:100%;padding:12px 14px;font:500 15px/1.3 inherit;font-family:inherit;color:var(--zp-text);background:rgba(0,0,0,.28);border:1px solid var(--zp-line);border-radius:12px;outline:none;transition:border-color .15s,box-shadow .15s}
.zpop-field input:focus{border-color:var(--zp-c2);box-shadow:0 0 0 3.500px var(--zp-soft)}
.zpop-code{display:flex;align-items:center;gap:10px;margin:16px 0 0;padding:10px 10px 10px 16px;border-radius:14px;background:rgba(0,0,0,.28);border:1px dashed var(--zp-ring);text-align:left}
.zpop-code span{flex:1;min-width:0;font:600 16px/1.4 ui-monospace,"SF Mono",Menlo,Consolas,monospace;color:var(--zp-text);overflow-wrap:anywhere;user-select:all}
.zpop-acts{display:flex;flex-direction:column;gap:9px;margin:22px 0 0}
.zpop-acts.row{flex-direction:row-reverse}
.zpop-acts.row .zpop-btn{flex:1}
.zpop-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;margin:0;padding:13px 18px;font:650 15px/1.2 inherit;font-family:inherit;letter-spacing:0;text-transform:none;border-radius:13px;border:1px solid transparent;cursor:pointer;transition:filter .15s,transform .12s,background .15s,border-color .15s;-webkit-tap-highlight-color:transparent}
.zpop-btn svg{width:17px;height:17px}
.zpop-btn.primary{background:var(--zp-c2);color:var(--zp-on);box-shadow:0 10px 26px var(--zp-soft)}
.zpop-btn.primary:hover{filter:brightness(1.1);transform:translateY(-1px)}
.zpop-btn.ghost{background:transparent;color:var(--zp-text);border-color:var(--zp-line)}
.zpop-btn.ghost:hover{background:var(--zp-box)}
.zpop-btn.link{width:auto;align-self:center;padding:6px 10px;background:none;color:var(--zp-mute);font-size:13px;font-weight:600}
.zpop-btn.link:hover{color:var(--zp-text)}
.zpop-btn.mini{width:auto;flex:none;padding:8px 12px;font-size:13px;border-radius:10px}
.zpop-btn:active{transform:none}
.zpop-btn:focus-visible,.zpop-x:focus-visible{outline:2px solid var(--zp-ring);outline-offset:2px}
.zpop-btn:disabled{opacity:.6;cursor:progress}
.zpop-meta{margin:18px 0 0;padding-top:14px;border-top:1px solid var(--zp-line);font-size:12px;line-height:1.5;color:var(--zp-mute)}
.zpop-meta b{color:var(--zp-dim);font-weight:600}
.zpop.out{animation:zpopFade .16s ease reverse forwards}
.zpop.out .zpop-card{animation:zpopOut .16s ease forwards}
@keyframes zpopFade{from{opacity:0}to{opacity:1}}
@keyframes zpopIn{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
@keyframes zpopOut{to{opacity:0;transform:scale(.97)}}
@keyframes zpopPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}
@keyframes zpopSpin{to{transform:rotate(360deg)}}
html.light-theme .zpop:not(.full),body.light-theme .zpop:not(.full){--zp-bg:#fff;--zp-bg2:#fff;--zp-line:#e3e7f0;--zp-text:#141826;--zp-dim:#4d5670;--zp-mute:#7d869e;--zp-box:#f5f7fb;background:rgba(20,26,45,.42)}
html.light-theme .zpop:not(.full) .zpop-card,body.light-theme .zpop:not(.full) .zpop-card{box-shadow:0 30px 70px rgba(20,30,60,.25)}
html.light-theme .zpop:not(.full) .zpop-field input,html.light-theme .zpop:not(.full) .zpop-code,body.light-theme .zpop:not(.full) .zpop-field input,body.light-theme .zpop:not(.full) .zpop-code{background:#f5f7fb}
html.light-theme .zpop.t-danger:not(.full),body.light-theme .zpop.t-danger:not(.full){--zp-c:#dc2626;--zp-c2:#dc2626;--zp-soft:rgba(220,38,38,.09);--zp-ring:rgba(220,38,38,.28)}
html.light-theme .zpop.t-warn:not(.full),body.light-theme .zpop.t-warn:not(.full){--zp-c:#b45309;--zp-c2:#f59e0b;--zp-soft:rgba(245,158,11,.13);--zp-ring:rgba(217,119,6,.32)}
html.light-theme .zpop.t-good:not(.full),body.light-theme .zpop.t-good:not(.full){--zp-c:#047857;--zp-c2:#10b981;--zp-soft:rgba(16,185,129,.12);--zp-ring:rgba(5,150,105,.3)}
html.light-theme .zpop.t-info:not(.full),body.light-theme .zpop.t-info:not(.full){--zp-c:#2563eb;--zp-c2:#2563eb;--zp-soft:rgba(37,99,235,.09);--zp-ring:rgba(37,99,235,.28)}
html.light-theme .zpop.t-owner:not(.full),body.light-theme .zpop.t-owner:not(.full){--zp-c:#3b455c;--zp-c2:#2a3245;--zp-on:#fff;--zp-soft:rgba(42,50,69,.08);--zp-ring:rgba(42,50,69,.24)}
html.light-theme .zpop.t-staff:not(.full),body.light-theme .zpop.t-staff:not(.full){--zp-c:#a16207;--zp-c2:#f5b82e;--zp-soft:rgba(245,184,46,.16);--zp-ring:rgba(202,138,4,.34)}
@media (max-width:520px){.zpop{padding:14px;align-items:flex-end}.zpop.full{align-items:center}.zpop-card{padding:26px 20px 20px;border-radius:22px;animation-name:zpopUp}.zpop-title{font-size:20px}.zpop-acts.row{flex-direction:column}.zpop-field input{font-size:16px}}
@keyframes zpopUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.zpop,.zpop-card,.zpop-badge i{animation:none!important}}
`.replace(/(\d)\.500px/g, '$1.5px');

  function ensureCss() {
    if (document.getElementById('zpop-css')) return;
    const s = document.createElement('style'); s.id = 'zpop-css'; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmt(left) {
    const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
    return (h ? h + 'h ' : '') + (h || m ? m + 'm ' : '') + s + 's';
  }

  function show(o) {
    o = o || {};
    ensureCss();
    if (o.id) { const old = document.getElementById(o.id); if (old) { if (old._zpTimer) clearInterval(old._zpTimer); old.remove(); } }
    if (o.replaceBody) { document.body.innerHTML = ''; }
    const prevFocus = document.activeElement;
    const el = document.createElement('div');
    el.className = 'zpop t-' + (o.tone || 'info') + (o.replaceBody || o.full ? ' full' : '') + (o.small ? ' sm' : '');
    if (o.id) el.id = o.id;
    if (o.z) el.style.zIndex = o.z;
    el.setAttribute('role', o.dismissable === false ? 'alertdialog' : 'dialog');
    el.setAttribute('aria-modal', 'true');
    const acts = o.actions || [];
    const dismissable = o.dismissable !== false;
    el.innerHTML = `<div class="zpop-card">
      ${dismissable && o.closeX !== false ? `<button type="button" class="zpop-x" aria-label="Close">${P('<path d="M6 6l12 12M18 6L6 18"/>')}</button>` : ''}
      ${o.icon ? `<div class="zpop-ic">${ICONS[o.icon] || ICONS.alert}</div>` : ''}
      ${o.badge ? `<div class="zpop-badge">${o.live || o.pulse ? '<i></i>' : ''}${esc(o.badge)}</div>` : ''}
      ${o.title ? `<h2 class="zpop-title">${esc(o.title)}</h2>` : ''}
      ${o.html ? `<p class="zpop-text">${o.html}</p>` : (o.text ? `<p class="zpop-text">${esc(o.text)}</p>` : '')}
      ${o.quote != null && o.quote !== '' ? `<div class="zpop-quote">${o.quoteLabel ? `<small>${esc(o.quoteLabel)}</small>` : ''}${esc(o.quote)}</div>` : ''}
      ${o.list && o.list.length ? `<ul class="zpop-list">${o.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${o.code != null ? `<div class="zpop-code"><span>${esc(o.code)}</span><button type="button" class="zpop-btn ghost mini" data-copy>${ICONS.copy} Copy</button></div>` : ''}
      ${o.input ? `<div class="zpop-field"><input type="${o.input.type || 'text'}" aria-label="${esc(o.title || 'Value')}"></div>` : ''}
      ${(o.fields || []).map((f) => `<div class="zpop-field"><label for="${esc(f.id)}">${esc(f.label)}</label><input id="${esc(f.id)}" type="${f.type || 'text'}" autocomplete="${f.autocomplete || 'off'}" autocapitalize="off" spellcheck="false"></div>`).join('')}
      ${o.fields ? '<div class="zpop-err" role="alert"></div>' : ''}
      ${o.countdown ? `<div class="zpop-count"><span>&nbsp;</span>${o.countdown.label ? `<small>${esc(o.countdown.label)}</small>` : ''}</div>` : ''}
      ${o.live ? `<div class="zpop-live"><i></i><span>${esc(o.live)}</span></div>` : ''}
      ${acts.length ? `<div class="zpop-acts${o.row ? ' row' : ''}">${acts.map((a, i) => `<button type="button" class="zpop-btn ${a.kind || (i === 0 ? 'primary' : 'ghost')}" data-i="${i}"${a.id ? ` id="${esc(a.id)}"` : ''}>${a.icon && ICONS[a.icon] ? ICONS[a.icon] : ''}${esc(a.label)}</button>`).join('')}</div>` : ''}
      ${o.metaHtml || o.meta ? `<div class="zpop-meta">${o.metaHtml || esc(o.meta)}</div>` : ''}
    </div>`;
    let closed = false;
    function close(reason) {
      if (closed) return; closed = true;
      if (el._zpTimer) clearInterval(el._zpTimer);
      document.removeEventListener('keydown', onKey, true);
      el.classList.add('out');
      setTimeout(() => el.remove(), 150);
      try { if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus(); } catch (e) {}
      if (typeof o.onClose === 'function') { try { o.onClose(reason); } catch (e) {} }
    }
    function onKey(e) {
      if (!document.contains(el)) { document.removeEventListener('keydown', onKey, true); return; }
      const all = document.querySelectorAll('.zpop'); if (all[all.length - 1] !== el) return;   // only the top popup reacts
      if (e.key === 'Escape' && dismissable) { e.stopPropagation(); close('escape'); }
      else if (e.key === 'Tab') {
        const f = el.querySelectorAll('button, input, a[href]'); if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    const x = el.querySelector('.zpop-x'); if (x) x.addEventListener('click', () => close('x'));
    if (dismissable && o.backdropClose !== false) el.addEventListener('mousedown', (e) => { if (e.target === el) close('backdrop'); });
    el.querySelectorAll('.zpop-acts .zpop-btn').forEach((b) => b.addEventListener('click', async () => {
      const a = acts[+b.dataset.i];
      if (!a.keep) close('action');
      if (typeof a.onClick === 'function') { try { const values = {}; el.querySelectorAll('.zpop-field input[id]').forEach((i) => { values[i.id] = i.value; }); await a.onClick({ el, close, button: b, value: input ? input.value : undefined, values, error: (t) => { const e2 = el.querySelector('.zpop-err'); if (e2) e2.textContent = t || ''; } }); } catch (e) { console.error(e); } }
    }));
    const cp = el.querySelector('[data-copy]');
    if (cp) cp.addEventListener('click', () => {
      const done = (ok) => { cp.lastChild.textContent = ok ? ' Copied' : ' Copy failed'; setTimeout(() => { cp.lastChild.textContent = ' Copy'; }, 1600); };
      try { navigator.clipboard.writeText(String(o.code)).then(() => done(true), () => done(false)); } catch (e) { done(false); }
    });
    const input = o.input ? el.querySelector('.zpop-field input') : null;
    el.querySelectorAll('.zpop-field input[id]').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const pb = el.querySelector('.zpop-btn.primary'); if (pb) pb.click(); } }));
    if (input) {
      input.value = o.input.value || ''; input.placeholder = o.input.placeholder || '';
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const pb = el.querySelector('.zpop-btn.primary'); if (pb) pb.click(); } });
    }
    if (o.countdown) {
      const span = el.querySelector('.zpop-count span');
      const end = Date.now() + o.countdown.seconds * 1000;
      const tick = () => {
        const left = Math.max(0, Math.round((end - Date.now()) / 1000));
        if (left <= 0) { span.textContent = o.countdown.doneText || 'Ready'; clearInterval(el._zpTimer); if (typeof o.countdown.onDone === 'function') o.countdown.onDone(); return; }
        span.textContent = fmt(left);
      };
      tick(); el._zpTimer = setInterval(tick, 1000);
    }
    (document.body || document.documentElement).appendChild(el);
    setTimeout(() => { try { (input || el.querySelector('.zpop-field input') || el.querySelector('.zpop-btn.primary') || el.querySelector('.zpop-btn') || x || el).focus(); if (input) input.select(); } catch (e) {} }, 60);
    return { el, close, input };
  }

  function confirm(title, message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
      show({
        id: 'confirm-modal', small: true, row: true, z: 100050, tone: opts.danger ? 'danger' : 'info', icon: opts.icon || (opts.danger ? 'alert' : 'question'),
        title, text: message, closeX: false,
        actions: [{ label: opts.okText || 'Confirm', kind: 'primary', id: 'confirm-ok', onClick: () => fin(true) }, { label: opts.cancelText || 'Cancel', kind: 'ghost', id: 'confirm-cancel', onClick: () => fin(false) }],
        onClose: (r) => { if (r !== 'action') fin(false); },
      });
    });
  }
  function prompt(title, value, placeholder, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
      show({
        id: 'prompt-modal', small: true, row: true, z: 100050, tone: 'info', icon: 'edit', title, text: opts.text || '', closeX: false,
        input: { value: value || '', placeholder: placeholder || '', type: opts.type },
        actions: [{ label: opts.okText || 'OK', kind: 'primary', id: 'prompt-ok', onClick: (c) => fin(c.value) }, { label: 'Cancel', kind: 'ghost', id: 'prompt-cancel', onClick: () => fin(null) }],
        onClose: (r) => { if (r !== 'action') fin(null); },
      });
    });
  }

  /* The two "everyone is paused" screens, shared by the welcome page and the app.
     They never trap anyone: a signed-in person can log out, and the Owner / helpers can sign in from here. */
  function systemScreen(kind, opts) {
    opts = opts || {};
    const lock = kind === 'locked';
    const post = (url, body) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const actions = [];
    if (opts.signedIn) actions.push({ label: 'Log out', kind: 'ghost', icon: 'logout', id: 'sys-logout', keep: true, onClick: async (c) => { c.button.disabled = true; try { await post('/api/auth/logout'); } catch (e) {} window.location.replace('/'); } });
    else actions.push({ label: 'Owner or helper? Sign in', kind: 'ghost', icon: 'key', id: 'sys-signin', keep: true, onClick: () => staffSignIn(kind) });
    return show({
      id: 'maintenance-screen', replaceBody: true, dismissable: false, z: 999999, tone: lock ? 'danger' : 'warn', icon: lock ? 'lock' : 'wrench',
      badge: lock ? 'All accounts locked' : 'Maintenance', pulse: true,
      title: lock ? 'Zelpophai is locked for now' : 'We\'ll be right back',
      text: lock
        ? 'The Owner has paused all accounts for a moment. Nothing of yours is lost — your chats and files are safe.'
        : 'Zelpophai is getting some work done to make it better. Nothing of yours is lost — your chats and files are safe.',
      live: 'This page opens again by itself the moment we\'re back. No need to refresh.',
      actions,
      metaHtml: 'Started by <b>WANZU-IBRAHIM</b> · The Owner',
    });
  }
  function staffSignIn(kind) {
    const post = (url, body) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    show({
      id: 'sys-signin-box', small: true, z: 1000000, tone: 'owner', icon: 'key', title: 'Sign in',
      text: 'The Owner and chosen helpers can still get in while Zelpophai is paused.',
      fields: [{ id: 'sys-user', label: 'Username', autocomplete: 'username' }, { id: 'sys-pass', label: 'Password', type: 'password', autocomplete: 'current-password' }],
      actions: [{ label: 'Sign in', id: 'sys-go', keep: true, onClick: async (c) => {
        const username = (c.values['sys-user'] || '').trim(), password = c.values['sys-pass'] || '';
        if (!username || !password) return c.error('Enter your username and your password.');
        c.button.disabled = true; c.error('');
        try {
          const r = await post('/api/auth/login', { username, password });
          if (r.ok) { window.location.href = '/app'; return; }
          const d = await r.json().catch(() => ({}));
          c.error(r.status === 503 ? 'Only the Owner and chosen helpers can sign in right now. Please come back when we\'re open again.' : (typeof d.detail === 'string' ? d.detail : 'Couldn\'t sign in. Try again.'));
        } catch (e) { c.error('Couldn\'t reach Zelpophai. Check your connection and try again.'); }
        c.button.disabled = false;
      } }, { label: 'Cancel', kind: 'link' }],
    });
  }

  window.ZPop = { show, confirm, prompt, systemScreen, esc, icons: ICONS };
})();
