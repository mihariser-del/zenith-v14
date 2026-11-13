/* Zelpophai Vault (2026).
   One page app: hash routes (#/overview, #/users/12 …), data from /api/vault/*,
   charts with Chart.js, Ctrl+K command palette, alerts, light/dark, PIN lock. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  const S = { me: null, owner: false, can: {}, access: null, range: store.get('zv_range', '30d'), charts: [], timers: [], route: '', alertsSeen: new Set() };

  /* ───────────────────────────── api + lock ───────────────────────────── */
  function token() { try { return sessionStorage.getItem('zenith_vault_token') || ''; } catch (e) { return ''; } }
  function setToken(t) { try { t ? sessionStorage.setItem('zenith_vault_token', t) : sessionStorage.removeItem('zenith_vault_token'); } catch (e) {} }
  let unlockWait = null;
  async function api(path, opts = {}) {
    const o = { method: 'GET', credentials: 'same-origin', ...opts, headers: { 'Content-Type': 'application/json', 'X-Vault-Token': token(), ...(opts.headers || {}) } };
    if (o.body && typeof o.body !== 'string' && !(o.body instanceof Blob) && !(o.body instanceof File)) o.body = JSON.stringify(o.body);
    const r = await fetch(path, o);
    if (r.status === 401) { location.href = '/?login=1'; throw new Error('Please log in'); }
    if (r.status === 403) {
      const d = await r.clone().json().catch(() => ({}));
      if (/vault|pin/i.test(d.detail || '')) { await lock(); return api(path, opts); }
      throw new Error(d.detail || 'Not allowed');
    }
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || ('Error ' + r.status)); }
    const ct = r.headers.get('content-type') || '';
    return ct.includes('json') ? r.json() : r;
  }
  function lock() {
    if (unlockWait) return unlockWait;
    setToken('');
    $('lockscreen').hidden = false; $('pin').value = ''; $('pin-err').textContent = '';
    setTimeout(() => $('pin').focus(), 50);
    unlockWait = new Promise((resolve) => {
      const go = async () => {
        const pin = $('pin').value.trim();
        if (!/^\d{4,6}$/.test(pin)) { $('pin-err').textContent = 'Enter your 4–6 digit PIN'; return; }
        $('pin-go').disabled = true;
        try {
          const r = await fetch('/api/auth/admin/pin-verify', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.detail || 'Wrong PIN');
          setToken(d.token); $('lockscreen').hidden = true; unlockWait = null; resolve();
        } catch (e) { $('pin-err').textContent = e.message; $('pin').select(); }
        finally { $('pin-go').disabled = false; }
      };
      $('pin-go').onclick = go;
      $('pin').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    });
    return unlockWait;
  }

  /* ───────────────────────────── ui helpers ───────────────────────────── */
  let toastT;
  function toast(msg, bad) { const t = $('toast'); t.textContent = msg; t.className = 'toast on' + (bad ? ' bad' : ''); clearTimeout(toastT); toastT = setTimeout(() => t.className = 'toast', 2600); }
  const fmt = {
    n: (v) => (v == null ? '—' : Number(v).toLocaleString()),
    usd: (v, d = 2) => (v == null ? '—' : '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })),
    cost: (v) => (v == null ? '—' : !Number(v) ? '$0.00' : v >= 1 ? fmt.usd(v, 2) : '$' + Number(v).toFixed(v >= 0.01 ? 3 : 4)),
    pct: (v) => (v == null ? '—' : v + '%'),
    size: (b) => b == null ? '—' : b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB',
    ago(iso) {
      if (!iso) return 'never';
      const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
      if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
      return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    },
    date: (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
    dt: (iso) => iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—',
  };
  function delta(d, inverse) {
    if (!d || d.pct == null) return '<span class="delta flat">—</span>';
    const up = d.pct > 0, flat = d.pct === 0;
    const good = inverse ? !up : up;
    return `<span class="delta ${flat ? 'flat' : good ? 'up' : 'down'}">${up ? '▲' : flat ? '' : '▼'} ${Math.abs(d.pct)}%</span>`;
  }
  const COLORS = ['#6d7cff', '#22d3ee', '#a78bfa', '#34d399', '#f472b6', '#fbbf24', '#fb923c', '#60a5fa'];
  function cvar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function hue(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
  function avatar(u, lg) {
    const n = (u.display_name || u.username || '?');
    return `<span class="av${lg ? ' lg' : ''}" style="background:hsl(${hue(u.username)} 62% 52%)">${esc(n[0].toUpperCase())}${u.online ? '<i class="dot"></i>' : ''}</span>`;
  }
  function planTag(u) {
    const tags = [];
    if (u.role === 'owner') tags.push('<span class="tag owner">Owner</span>');
    else if (u.role === 'admin') tags.push(`<span class="tag admin">${(u.tags || []).includes('trusted') ? 'Trusted admin' : 'Admin'}</span>`);
    const p = u.plan;
    if (p === 'ultimate') tags.push('<span class="tag ultimate">Ultimate</span>');
    else if (p === 'pro') tags.push('<span class="tag pro">Pro</span>');
    if ((u.tags || []).includes('friend')) tags.push('<span class="tag friend">Friend</span>');
    if (p === 'guest' || u.guest) tags.push('<span class="tag guest">Guest</span>');
    if (u.banned) tags.push('<span class="tag banned">Banned</span>');
    if (u.deleted) tags.push('<span class="tag bad">Deleted</span>');
    if (!tags.length) tags.push('<span class="tag">Free</span>');
    return tags.join(' ');
  }
  function person(u, sub) {
    return `<div class="person">${avatar(u)}<div style="min-width:0"><b>${esc(u.display_name || u.username)}</b><small>${sub != null ? sub : '@' + esc(u.username)}</small></div></div>`;
  }
  function empty(title, text) { return `<div class="empty"><b>${esc(title)}</b>${esc(text || '')}</div>`; }
  function card(title, body, right = '', sub = '') {
    return `<div class="card fade"><div class="card-h"><h3>${title}</h3>${sub ? `<span class="sub">${sub}</span>` : ''}<div class="right">${right}</div></div>${body}</div>`;
  }
  function kpi(label, value, d, color, sparkId, opts = {}) {
    return `<div class="card kpi fade"><div class="lab"><i style="background:${color}"></i>${esc(label)}</div><div class="val">${value}</div>
      <div class="foot">${d === undefined ? (opts.note || '') : delta(d, opts.inverse) + ` <span>vs previous ${S.range}</span>`}</div>${sparkId ? `<div class="spark"><canvas id="${sparkId}"></canvas></div>` : ''}</div>`;
  }
  function modal(html, onMount) {
    $('modal-box').innerHTML = html; $('modal').hidden = false;
    const close = () => { $('modal').hidden = true; };
    $('modal').onclick = (e) => { if (e.target === $('modal') || e.target.closest('[data-close]')) close(); };
    if (onMount) onMount(close);
    const f = $('modal-box').querySelector('input,select,textarea,button.pri'); if (f) setTimeout(() => f.focus(), 30);
    return close;
  }
  function confirmBox(title, text, okLabel = 'Confirm', danger) {
    return new Promise((res) => {
      modal(`<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn ${danger ? 'danger solid' : 'pri'}" id="ok">${esc(okLabel)}</button></div>`,
        (close) => { $('ok').onclick = () => { close(); res(true); }; $('modal').addEventListener('click', (e) => { if (e.target === $('modal') || e.target.closest('[data-close]')) res(false); }, { once: true }); });
    });
  }

  /* ─────────────────────────────── charts ─────────────────────────────── */
  function labelOf(iso, step) {
    const d = new Date(iso);
    return step === 'hour' ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  function grad(ctx, color, a1 = .28, a2 = 0) {
    const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.clientHeight || 280);
    g.addColorStop(0, color + Math.round(a1 * 255).toString(16).padStart(2, '0'));
    g.addColorStop(1, color + Math.round(a2 * 255).toString(16).padStart(2, '0'));
    return g;
  }
  function baseOpts(extra = {}) {
    const ink = cvar('--dim'), line = cvar('--line');
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: !!extra.legend, position: 'bottom', labels: { color: cvar('--ink2'), usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 14, font: { family: 'Inter', size: 12 } } },
        tooltip: { backgroundColor: cvar('--card2') || '#171d33', titleColor: cvar('--ink'), bodyColor: cvar('--ink2'), borderColor: cvar('--line2'), borderWidth: 1, padding: 10, cornerRadius: 10, boxPadding: 4, usePointStyle: true,
          titleFont: { family: 'Inter', weight: '600' }, bodyFont: { family: 'Inter' },
          callbacks: extra.money ? { label: (c) => ` ${c.dataset.label}: ${fmt.cost(extra.horizontal ? c.parsed.x : c.parsed.y)}` } : {} },
      },
      scales: extra.noScales ? {} : (() => {
        const tick = { color: ink, font: { family: 'Inter', size: 11 } };
        const money = (v) => v === 0 ? '$0' : '$' + (Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(2));
        const cat = { stacked: !!extra.stacked, grid: { display: false }, border: { display: false }, ticks: { ...tick, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } };
        const val = { stacked: !!extra.stacked, beginAtZero: true, grid: { color: line, drawTicks: false }, border: { display: false },
          ticks: { ...tick, padding: 8, precision: extra.money ? undefined : 0, maxTicksLimit: 5, callback: extra.money ? money : undefined } };
        return extra.horizontal ? { x: val, y: { ...cat, ticks: { ...cat.ticks, autoSkip: false } } } : { x: cat, y: val };
      })(),
    };
  }
  function chartFail(id, msg) {
    const el = $(id); if (!el || !el.parentNode) return;
    console.error('[vault] chart ' + id + ':', msg);
    const small = el.parentNode.classList.contains('spark');
    el.parentNode.innerHTML = small ? '' : `<div class="chart-fail">${esc(window.Chart ? "This chart couldn't be drawn" : "Charts couldn't load")}<small>${esc(String(msg).slice(0, 160))}</small></div>`;
  }
  function mk(id, cfg) {
    const el = $(id); if (!el) return null;
    if (!window.Chart) { chartFail(id, 'The chart library did not load. Refresh the page.'); return null; }
    const ch = new Chart(el.getContext('2d'), cfg); S.charts.push(ch); return ch;
  }
  // Each chart is drawn on its own: one failing never blanks the others.
  const safe = (fn) => (id, ...a) => { try { return fn(id, ...a); } catch (e) { chartFail(id, e && e.message || e); return null; } };
  const lineChart = safe(function lineChart(id, labels, step, sets, extra = {}) {
    const el = $(id); if (!el) return;
    const ctx = el.getContext('2d');
    return mk(id, {
      type: 'line',
      data: { labels: labels.map((l) => labelOf(l, step)), datasets: sets.map((s, i) => {
        const c = s.color || COLORS[i % COLORS.length];
        return { label: s.label, data: s.data, borderColor: c, backgroundColor: s.fill === false ? 'transparent' : grad(ctx, c, extra.stacked ? .35 : (i ? .12 : .3), extra.stacked ? .08 : 0), fill: s.fill === false ? false : (extra.stacked ? (i ? '-1' : 'origin') : true), tension: .35, cubicInterpolationMode: 'monotone', borderWidth: 2.2,
          pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2, pointHoverBackgroundColor: cvar('--card'), borderDash: s.dash || [] };
      }) },
      options: baseOpts(extra),
    });
  });
  const barChart = safe(function barChart(id, labels, step, sets, extra = {}) {
    return mk(id, {
      type: 'bar',
      data: { labels: step ? labels.map((l) => labelOf(l, step)) : labels, datasets: sets.map((s, i) => ({ label: s.label, data: s.data, backgroundColor: s.color || COLORS[i % COLORS.length], borderRadius: 6, borderSkipped: false, maxBarThickness: 28 })) },
      options: { ...baseOpts(extra), indexAxis: extra.horizontal ? 'y' : 'x' },
    });
  });
  const donut = safe(function donut(id, labels, data, colors, extra = {}) {
    return mk(id, {
      type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: colors || COLORS, borderColor: cvar('--card'), borderWidth: 3, hoverOffset: 6 }] },
      options: { ...baseOpts({ noScales: true, legend: extra.legend !== false }), cutout: extra.cutout || '72%', plugins: { ...baseOpts({ noScales: true, legend: extra.legend !== false }).plugins } },
    });
  });
  const spark = safe(function spark(id, data, color) {
    const el = $(id); if (!el) return;
    const ctx = el.getContext('2d');
    mk(id, { type: 'line', data: { labels: data.map((_, i) => i), datasets: [{ data, borderColor: color, borderWidth: 1.8, fill: true, backgroundColor: grad(ctx, color, .22), tension: .35, cubicInterpolationMode: 'monotone', pointRadius: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false, beginAtZero: true } } } });
  });
  function clearPage() {
    S.charts.forEach((c) => { try { c.destroy(); } catch (e) {} }); S.charts = [];
    S.timers.forEach(clearInterval); S.timers = [];
  }

  /* ─────────────────────────────── routing ─────────────────────────────── */
  const IC = {
    overview: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z"/>',
    growth: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    ai: '<path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/><circle cx="12" cy="12" r="4"/>',
    live: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    people: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
    safety: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    releases: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 7v7M9 11l3 3 3-3"/>',
    backups: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/>',
    controls: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    chats: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    feedback: '<path d="M21 11.500a8.400 8.400 0 0 1-12.300 7.400L3 21l2.100-5.700A8.400 8.400 0 1 1 21 11.500z"/><path d="M12 7.500l1.200 2.500 2.800.400-2 1.900.500 2.700-2.500-1.300-2.500 1.300.500-2.700-2-1.900 2.800-.400z"/>',
    security: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4M12 16h.01"/>',
    staff: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 12 0v1"/><path d="M19 8l1.5 1.5L23 7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    logs: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  };
  const PAGES = [
    { id: 'overview', perm: 'view_stats', label: 'Overview', grp: 'Insights', range: true },
    { id: 'growth', perm: 'view_stats', label: 'Growth & revenue', grp: 'Insights', range: true },
    { id: 'ai', label: 'AI cost & usage', grp: 'Insights', range: true, owner: true },
    { id: 'live', perm: 'view_stats', label: 'Live monitor', grp: 'Insights' },
    { id: 'users', perm: 'view_users', label: 'Users', grp: 'People' },
    { id: 'chats', perm: 'manage_chats', label: 'Conversations', grp: 'People' },
    { id: 'people', perm: 'view_stats', label: 'Friends & customers', grp: 'People' },
    { id: 'feedback', perm: 'feedback_view', label: 'Feedback', grp: 'People', badge: 'feedback', range: true },
    { id: 'safety', perm: 'safety_view', label: 'Content safety', grp: 'People', badge: 'safety' },
    { id: 'controls', perm: 'broadcast|global_controls', label: 'Controls & broadcast', grp: 'System' },
    { id: 'security', label: 'Security & emergency', grp: 'System', owner: true },
    { id: 'staff', label: 'Staff & permissions', grp: 'System', owner: true },
    { id: 'releases', perm: 'manage_releases', label: 'App releases', grp: 'System' },
    { id: 'backups', label: 'Backups & data', grp: 'System', owner: true },
    { id: 'logs', perm: 'view_logs', label: 'Activity log', grp: 'System' },
    { id: 'settings', label: 'Settings & exports', grp: 'System' },
  ];
  const allowed = (p) => !(p.owner && !S.owner) && (S.owner || !p.perm || p.perm.split('|').some((k) => S.can[k] !== false));
  async function loadAccess() {
    try { S.access = await api('/api/auth/admin/my-permissions'); S.can = S.access.can || {}; } catch (e) { S.access = null; S.can = {}; }
  }
  function renderNav() {
    let html = '', grp = '';
    for (const p of PAGES) {
      if (!allowed(p)) continue;
      if (p.grp !== grp) { grp = p.grp; html += `<div class="grp">${grp}</div>`; }
      html += `<a href="#/${p.id}" data-p="${p.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[p.id]}</svg>${p.label}${p.badge ? `<span class="badge" id="badge-${p.badge}" hidden></span>` : ''}</a>`;
    }
    $('nav').innerHTML = html;
  }
  async function route() {
    const h = location.hash.replace(/^#\/?/, '') || 'overview';
    const [page, arg] = h.split('/');
    const def = PAGES.find((p) => p.id === page) || PAGES[0];
    if (!allowed(def)) { const first = PAGES.find(allowed); if (first && first.id !== def.id) { location.hash = '#/' + first.id; return; } }
    clearPage();
    S.route = page;
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.p === def.id));
    $('page-title').textContent = page === 'users' && arg ? 'User profile' : (page === 'staff' && arg ? 'Edit permissions' : def.label);
    $('crumb').textContent = page === 'users' && arg ? 'Users' : (def.grp || 'Vault');
    $('ranges').classList.toggle('off', !def.range || (page === 'feedback' && arg !== 'answers'));
    $('side').classList.remove('open'); $('scrim').classList.remove('on');
    $('view').innerHTML = `<div class="grid g4">${'<div class="card skeleton" style="height:120px"></div>'.repeat(4)}</div><div class="card skeleton mt" style="height:320px"></div>`;
    window.scrollTo(0, 0);
    try {
      if (page === 'users' && arg) await pageUser(+arg);
      else if (page === 'feedback') await pageFeedback(arg);
      else if (page === 'staff' && arg) await pagePermissions(+arg);
      else await ({ overview: pageOverview, growth: pageGrowth, ai: pageAI, live: pageLive, users: pageUsers, people: pagePeople,
        safety: pageSafety, controls: pageControls, releases: pageReleases, backups: pageBackups, logs: pageLogs,
        chats: pageChats, security: pageSecurity, staff: pageStaff, settings: pageSettings }[def.id])();
    } catch (e) {
      $('view').innerHTML = card('Something went wrong', empty('Couldn\'t load this page', e.message) + '<div style="text-align:center"><button class="btn" onclick="location.reload()">Try again</button></div>');
    }
  }

  /* ─────────────────────────────── overview ─────────────────────────────── */
  async function pageOverview() {
    const d = await api('/api/vault/overview?range=' + S.range);
    const k = d.kpis;
    $('online-pill').querySelector('b').textContent = k.online;
    const ownerKpis = S.owner ? [
      kpi('Revenue', fmt.usd(k.revenue.v), k.revenue, '#34d399', 'sp-rev'),
      kpi('AI spend', fmt.cost(k.ai_cost.v), k.ai_cost, '#fbbf24', 'sp-ai', { inverse: true }),
    ] : [kpi('Online now', fmt.n(k.online), undefined, '#34d399', null, { note: 'right now' }), kpi('Accounts', fmt.n(k.users_total), undefined, '#a78bfa', null, { note: fmt.n(k.guests_total) + ' guests' })];
    $('view').innerHTML = `
      <div class="grid g4">
        ${kpi('Active users', fmt.n(k.active_users.v), k.active_users, '#6d7cff', 'sp-act')}
        ${kpi('Messages', fmt.n(k.messages.v), k.messages, '#22d3ee', 'sp-msg')}
        ${kpi('New accounts', fmt.n(k.new_users.v), k.new_users, '#a78bfa', 'sp-sig')}
        ${ownerKpis.length === 2 && S.owner ? ownerKpis[0] : kpi('New chats', fmt.n(k.chats.v), k.chats, '#f472b6')}
      </div>
      <div class="grid g21 mt">
        ${card('Activity', '<div class="chart"><canvas id="ch-main"></canvas></div>', `<div class="seg" id="main-seg"><button data-s="active" class="on">Active users</button><button data-s="messages">Messages</button><button data-s="signups">Sign-ups</button></div>`)}
        ${card('Plans', '<div class="chart"><canvas id="ch-plans"></canvas></div>', '', fmt.n(k.users_total) + ' accounts')}
      </div>
      ${S.owner ? `<div class="grid g4 mt">
        ${ownerKpis[1]}
        ${kpi('Monthly recurring', fmt.usd(k.mrr), undefined, '#34d399', null, { note: fmt.n(k.paying) + ' paying customers' })}
        ${kpi('Accounts', fmt.n(k.users_total), undefined, '#a78bfa', null, { note: fmt.n(k.guests_total) + ' guests · ' + fmt.n(k.online) + ' online' })}
        ${kpi('Needs attention', fmt.n(d.alerts + d.safety_open), undefined, '#f87171', null, { note: `${d.alerts} alerts · ${d.safety_open} safety` })}
      </div>` : ''}
      <div class="grid g2 mt">
        ${card('Most used features', '<div id="feat-bars"></div>', '', 'this period')}
        ${card('Latest activity', '<div class="list" id="ov-feed"></div>', '<a href="#/live" class="small">Live monitor →</a>')}
      </div>`;
    spark('sp-act', d.series.active, '#6d7cff'); spark('sp-msg', d.series.messages, '#22d3ee'); spark('sp-sig', d.series.signups, '#a78bfa');
    if (S.owner) { spark('sp-rev', d.series.revenue || [], '#34d399'); spark('sp-ai', d.series.ai_cost || [], '#fbbf24'); }
    let main;
    const draw = (key) => {
      if (main) { main.destroy(); S.charts = S.charts.filter((c) => c !== main); }
      const color = { active: '#6d7cff', messages: '#22d3ee', signups: '#a78bfa' }[key];
      const name = { active: 'Active users', messages: 'Messages', signups: 'New accounts' }[key];
      main = lineChart('ch-main', d.labels, d.step, [{ label: name, data: d.series[key], color }]);
    };
    draw('active');
    $('main-seg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $('main-seg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); draw(b.dataset.s); };
    const order = ['free', 'pro', 'ultimate', 'friend', 'guest'];
    const names = { free: 'Free', pro: 'Pro', ultimate: 'Ultimate', friend: 'Friends', guest: 'Guests' };
    const pl = order.filter((p) => d.plans[p]);
    donut('ch-plans', pl.map((p) => names[p]), pl.map((p) => d.plans[p]), ['#94a3b8', '#3b82f6', '#a855f7', '#14b8a6', '#475569']);
    const fm = Math.max(1, ...d.features.map((f) => f.count));
    const FN = { message: 'Messages', image_gen: 'Images', video_gen: 'Videos', file_upload: 'File uploads', file_edit: 'File edits', document_gen: 'Documents', code_agent: 'Coding AGT.', mini_agent: 'Zelpophai Mini', file_tool: 'File tools', share_continue: 'Continue shared chat' };
    $('feat-bars').innerHTML = d.features.length ? d.features.map((f) => `<div class="bar-row"><span>${esc(FN[f.feature] || f.feature)}</span><div class="track"><div class="fill" style="width:${(f.count / fm * 100).toFixed(1)}%"></div></div><span class="num">${fmt.n(f.count)}</span></div>`).join('') : empty('No usage yet', 'Usage shows up as people use Zelpophai.');
    try {
      const lv = await api('/api/vault/live');
      $('ov-feed').innerHTML = feedHtml(lv.feed.slice(0, 7));
    } catch (e) { $('ov-feed').innerHTML = empty('No activity'); }
    S.timers.push(setInterval(refreshTop, 30000));
  }
  const EV = { signup: ['🎉', 'var(--good)'], guest: ['👤', 'var(--dim)'], message: ['💬', 'var(--info)'], login: ['🔑', 'var(--ink2)'], login_failed: ['⚠️', 'var(--warn)'], payment: ['💳', 'var(--good)'], flag: ['🛡️', 'var(--bad)'] };
  function feedHtml(feed) {
    if (!feed.length) return empty('Quiet for now', 'Nothing in the last 24 hours.');
    return feed.map((e) => `<div class="li"><span class="ev-ic">${(EV[e.type] || ['•'])[0]}</span><div class="grow small">${e.user_id ? `<a href="#/users/${e.user_id}" style="color:inherit">${esc(e.text)}</a>` : esc(e.text)}</div><span class="t">${fmt.ago(e.t)}</span></div>`).join('');
  }

  /* ─────────────────────────────── growth ─────────────────────────────── */
  async function pageGrowth() {
    const d = await api('/api/vault/growth?range=' + S.range);
    const a = d.active, r = d.revenue;
    $('view').innerHTML = `
      <div class="grid g4">
        ${kpi('Daily active', fmt.n(a.dau), undefined, '#6d7cff', null, { note: 'sent a message today' })}
        ${kpi('Weekly active', fmt.n(a.wau), undefined, '#22d3ee', null, { note: 'last 7 days' })}
        ${kpi('Monthly active', fmt.n(a.mau), undefined, '#a78bfa', null, { note: 'last 30 days' })}
        ${kpi('Stickiness', a.stickiness + '%', undefined, '#34d399', null, { note: 'daily ÷ monthly active' })}
      </div>
      <div class="grid g21 mt">
        ${card('New people', '<div class="chart"><canvas id="ch-sign"></canvas></div>', '', 'accounts vs guests')}
        ${card('Invites', `<div class="kv" style="margin-bottom:14px"><dt>Invite links made</dt><dd>${fmt.n(d.invites.links)}</dd><dt>Links used</dt><dd>${fmt.n(d.invites.used)}</dd><dt>Friends who joined</dt><dd>${fmt.n(d.invites.joined)}</dd><dt>Rewards given</dt><dd>${fmt.n(d.invites.rewarded)}</dd></div>
          <div class="muted small" style="margin-bottom:6px">Top inviters (all time)</div>${d.invites.top.length ? d.invites.top.map((t) => `<div class="li"><div class="grow">@${esc(t.username)}</div><b>${t.count}</b></div>`).join('') : '<div class="muted small">No invites yet</div>'}`)}
      </div>
      ${card('Retention', retentionHtml(d.cohorts), '', 'share of each week\'s new accounts who came back').replace('class="card fade"', 'class="card fade mt"')}
      ${r ? `
      <div class="grid g4 mt">
        ${kpi('Revenue', fmt.usd(r.total), undefined, '#34d399', null, { note: 'paid through Stripe this period' })}
        ${kpi('Monthly recurring', fmt.usd(r.mrr), undefined, '#22d3ee', null, { note: 'from active subscriptions' })}
        ${kpi('Paying customers', fmt.n(r.paying), undefined, '#a78bfa', null, { note: r.conversion + '% of accounts' })}
        ${kpi('Upgrades', fmt.n(r.upgrades.reduce((x, y) => x + y, 0)), undefined, '#fbbf24', null, { note: 'incl. gifts this period' })}
      </div>
      <div class="grid g21 mt">
        ${card('Revenue', '<div class="chart"><canvas id="ch-rev"></canvas></div>', '', 'USD')}
        ${card('Customers by plan', '<div class="chart sm"><canvas id="ch-byplan"></canvas></div>')}
      </div>
      ${card('Recent payments', paymentsTable(r.recent)).replace('class="card fade"', 'class="card fade mt"')}` : ''}`;
    barChart('ch-sign', d.labels, d.step, [{ label: 'New accounts', data: d.series.signups, color: '#6d7cff' }, { label: 'Guests', data: d.series.guests, color: '#334155' }], { stacked: true, legend: true });
    if (r) {
      lineChart('ch-rev', d.labels, d.step, [{ label: 'Revenue', data: r.series, color: '#34d399' }], { money: true });
      const bp = Object.entries(r.by_plan);
      if (bp.length) donut('ch-byplan', bp.map(([k]) => k.replace(/_/g, ' ')), bp.map(([, v]) => v));
      else $('ch-byplan').parentElement.innerHTML = empty('No paying customers yet', 'They\'ll appear here after the first purchase.');
    }
  }
  function retentionHtml(rows) {
    if (!rows.some((r) => r.size)) return empty('Not enough data yet', 'Retention appears once people have been signing up for a few weeks.');
    const maxW = Math.max(...rows.map((r) => r.weeks.length));
    const cell = (v) => v == null ? '<td></td>' : `<td style="background:color-mix(in srgb, var(--c1) ${Math.min(100, v * 1.4 + 6)}%, transparent);color:${v > 45 ? '#fff' : 'var(--ink)'}">${v}%</td>`;
    return `<div class="tbl-wrap"><table class="heat"><thead><tr><th style="text-align:left">Week joined</th><th>People</th>${Array.from({ length: maxW }, (_, i) => `<th>Week ${i + 1}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="lbl">${fmt.date(r.week)}</td><td>${r.size}</td>${Array.from({ length: maxW }, (_, i) => r.size ? cell(r.weeks[i]) : '<td></td>').join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function paymentsTable(rows) {
    if (!rows || !rows.length) return empty('No payments yet', 'Stripe payments and gifted plans show up here.');
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Customer</th><th>Plan</th><th class="num">Amount</th><th class="hide-m">Source</th><th>When</th></tr></thead><tbody>
      ${rows.map((p) => `<tr><td>@${esc(p.username)}</td><td>${esc((p.plan || '').replace(/_/g, ' '))}</td><td class="num">${p.amount ? fmt.usd(p.amount) + ' ' + esc((p.currency || '').toUpperCase()) : '—'}</td><td class="hide-m"><span class="tag ${p.source === 'stripe' ? 'good' : p.source === 'gift' ? 'friend' : ''}">${esc(p.source)}</span></td><td class="muted">${fmt.ago(p.t || p.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  /* ─────────────────────────────── AI cost ─────────────────────────────── */
  async function pageAI() {
    const d = await api('/api/vault/ai?range=' + S.range);
    const cr = d.credits;
    const FN = { chat: 'Chat answers', search: 'Web search', router: 'Auto-routing', title: 'Chat titles', mini: 'Zelpophai Mini', code: 'Coding AGT.', video: 'Videos', image: 'Images', news: 'Welcome news', voice: 'Voice' };
    $('view').innerHTML = `
      <div class="grid g4">
        ${kpi('AI spend', fmt.cost(d.total.v), d.total, '#fbbf24', null, { inverse: true })}
        ${kpi('AI calls', fmt.n(d.calls.v), d.calls, '#6d7cff')}
        ${kpi('Per day (average)', fmt.cost(d.per_day), undefined, '#22d3ee', null, { note: '≈ ' + fmt.usd(d.month_projection) + ' a month at this pace' })}
        ${kpi('Failed calls', fmt.n(d.failures), undefined, '#f87171', null, { note: fmt.n(d.tokens.in + d.tokens.out) + ' tokens used' })}
      </div>
      <div class="grid g12 mt">
        ${card('OpenRouter credit', cr ? `<div class="gauge"><div class="ring"><canvas id="ch-credit"></canvas><div class="c"><div><b>${fmt.usd(cr.left)}</b><small>left</small></div></div></div>
            <div class="kv" style="grid-template-columns:110px 1fr"><dt>Bought</dt><dd>${fmt.usd(cr.total)}</dd><dt>Used</dt><dd>${fmt.usd(cr.used)}</dd><dt>Lasts about</dt><dd>${d.days_left != null ? (d.days_left > 365 ? 'over a year' : d.days_left + ' days') : '—'}</dd></div></div>
            <a class="btn sm mt" href="https://openrouter.ai/settings/credits" target="_blank" rel="noopener">Top up credit ↗</a>` : empty('Credit unknown', 'Couldn\'t read your OpenRouter balance.'))}
        ${card('Spend over time', '<div class="chart"><canvas id="ch-ai"></canvas></div>', '', 'by feature')}
      </div>
      <div class="grid g2 mt">
        ${card('By feature', d.by_feature.length ? '<div class="chart sm"><canvas id="ch-feat"></canvas></div>' : empty('No AI calls yet'))}
        ${card('Biggest users', d.top_users.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>User</th><th class="num">Calls</th><th class="num">Spend</th></tr></thead><tbody>${d.top_users.map((u) => `<tr class="click" data-u="${u.id}"><td>@${esc(u.username)}</td><td class="num">${fmt.n(u.calls)}</td><td class="num">${fmt.cost(u.cost)}</td></tr>`).join('')}</tbody></table></div>` : empty('No data yet'))}
      </div>
      ${card('Models', d.by_model.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Model</th><th class="num">Calls</th><th class="num hide-m">Tokens in</th><th class="num hide-m">Tokens out</th><th class="num">Spend</th></tr></thead><tbody>${d.by_model.map((m) => `<tr><td><code>${esc(m.model)}</code></td><td class="num">${fmt.n(m.calls)}</td><td class="num hide-m">${fmt.n(m.in)}</td><td class="num hide-m">${fmt.n(m.out)}</td><td class="num">${fmt.cost(m.cost)}</td></tr>`).join('')}</tbody></table></div>` : empty('No AI calls yet'), '', 'costs are estimates from OpenRouter prices').replace('class="card fade"', 'class="card fade mt"')}`;
    if (cr) donut('ch-credit', ['Left', 'Used'], [Math.max(0, cr.left), cr.used], [cr.left < 5 ? '#f87171' : '#34d399', cvar('--card2') || '#1e2540'], { legend: false, cutout: '78%' });
    const keys = Object.keys(d.stack);
    lineChart('ch-ai', d.labels, d.step, keys.map((k, i) => ({ label: FN[k] || k, data: d.stack[k], color: COLORS[i] })), { money: true, legend: true, stacked: true });
    if (d.by_feature.length) barChart('ch-feat', d.by_feature.map((f) => FN[f.feature] || f.feature), null, [{ label: 'Spend', data: d.by_feature.map((f) => f.cost), color: '#fbbf24' }], { horizontal: true, money: true });
    $('view').onclick = (e) => { const tr = e.target.closest('tr[data-u]'); if (tr) location.hash = '#/users/' + tr.dataset.u; };
  }

  /* ─────────────────────────────── live ─────────────────────────────── */
  async function pageLive() {
    $('view').innerHTML = `
      <div class="grid g4" id="live-kpis"></div>
      <div class="grid g21 mt">
        ${card('Live activity', '<div class="list" id="live-feed"></div>', '<span class="tag good" id="live-tick">● Live</span>', 'updates every 5 seconds')}
        ${card('Online now', '<div class="list" id="live-online"></div>')}
      </div>
      <div class="grid g12 mt">
        ${card('Alerts', '<div id="live-alerts"></div>', `<button class="btn sm" id="notif-btn">🔔 Desktop alerts</button><button class="btn sm" id="run-checks">Check now</button>`)}
        ${card('Errors (last 24h)', '<div class="chart xs"><canvas id="ch-err"></canvas></div><div class="list mt" id="live-errors"></div>')}
      </div>`;
    let errChart = null;
    const load = async () => {
      const d = await api('/api/vault/live');
      $('online-pill').querySelector('b').textContent = d.online.length;
      $('live-kpis').innerHTML = kpi('Online now', fmt.n(d.online.length), undefined, '#34d399', null, { note: 'active in the last 5 min' }) +
        kpi('Messages (last hour)', fmt.n(d.messages_last_hour), undefined, '#22d3ee', null, { note: 'sent by users' }) +
        kpi('Errors (last hour)', fmt.n(d.errors_last_hour), undefined, d.errors_last_hour ? '#f87171' : '#94a3b8', null, { note: d.errors_last_hour ? 'see the list below' : 'all good' }) +
        kpi('On the apps', fmt.n(d.online.filter((u) => u.platform !== 'web').length), undefined, '#a78bfa', null, { note: 'Windows / Android right now' });
      $('live-feed').innerHTML = feedHtml(d.feed.slice(0, 25));
      $('live-online').innerHTML = d.online.length ? d.online.map((u) => `<a class="li" href="#/users/${u.id}" style="color:inherit">${person(u, (u.platform === 'web' ? 'Website' : u.platform === 'windows' ? 'Windows app ' + esc(u.version) : 'Android app ' + esc(u.version)))}<span class="grow"></span>${planTag(u)}</a>`).join('') : empty('Nobody online', 'People appear here while they use Zelpophai.');
      $('live-errors').innerHTML = d.errors.length ? d.errors.slice(0, 10).map((e) => `<div class="li"><span class="tag ${e.kind === 'ai' ? 'warn' : 'bad'}">${esc(e.kind)}</span><div class="grow small"><div>${esc(e.message)}</div><div class="muted">${esc(e.path)}</div></div><span class="t">${fmt.ago(e.t)}</span></div>`).join('') : empty('No errors', 'Everything is running smoothly.');
      if (!errChart) errChart = barChart('ch-err', d.error_labels, 'hour', [{ label: 'Errors', data: d.error_series, color: '#f87171' }]);
      else { errChart.data.datasets[0].data = d.error_series; errChart.update('none'); }
      const t = $('live-tick'); if (t) { t.style.opacity = .4; setTimeout(() => t.style.opacity = 1, 250); }
    };
    await load();
    await renderAlertsInto($('live-alerts'), true);
    S.timers.push(setInterval(() => load().catch(() => {}), 5000));
    $('run-checks').onclick = async () => { await api('/api/vault/alerts/check', { method: 'POST' }); await renderAlertsInto($('live-alerts'), true); refreshAlerts(); toast('Checked'); };
    $('notif-btn').onclick = async () => {
      if (!('Notification' in window)) return toast('This browser can\'t show notifications', true);
      const p = await Notification.requestPermission();
      toast(p === 'granted' ? 'You\'ll get a notification for new alerts while the Vault is open' : 'Notifications are blocked');
    };
  }

  /* ─────────────────────────────── users ─────────────────────────────── */
  const UF = { all: 'Everyone', registered: 'Accounts', online: 'Online', new: 'New (7d)', pro: 'Pro & Ultimate', paying: 'Paying', friends: 'Friends', staff: 'Staff', guests: 'Guests', banned: 'Banned', deleted: 'Deleted' };
  async function pageUsers() {
    const st = { q: '', filter: 'registered', sort: 'new', page: 1 };
    const sel = new Set();
    const syncSel = () => { $('u-bulk').hidden = !sel.size; $('u-bulk').textContent = `Delete ${sel.size} selected`; };
    $('view').innerHTML = `<div class="card fade">
      <div class="toolbar"><input class="input" id="u-q" placeholder="Search name or email…" autocomplete="off">
        <select class="select" id="u-sort" style="width:auto"><option value="new">Newest first</option><option value="active">Recently active</option><option value="old">Oldest first</option><option value="name">Name A–Z</option></select>
        <button class="btn sm danger" id="u-bulk" hidden>Delete selected</button>
        <span class="muted small" id="u-total" style="margin-left:auto"></span></div>
      <div class="chips" id="u-filters" style="margin-bottom:12px">${Object.entries(UF).map(([k, v]) => `<button class="chip${k === st.filter ? ' on' : ''}" data-f="${k}">${v}</button>`).join('')}</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="ck"><input type="checkbox" id="u-all" aria-label="Select all"></th><th>User</th><th>Plan</th><th class="num hide-m">Messages (30d)</th><th class="hide-m">Joined</th><th>Last seen</th></tr></thead><tbody id="u-rows"></tbody></table></div>
      <div class="pager"><span id="u-range"></span><span><button class="btn sm" id="u-prev">‹ Prev</button> <button class="btn sm" id="u-next">Next ›</button></span></div></div>`;
    const load = async () => {
      const d = await api(`/api/vault/users?q=${encodeURIComponent(st.q)}&filter=${st.filter}&sort=${st.sort}&page=${st.page}&per=25`);
      $('u-total').textContent = fmt.n(d.total) + ' people';
      $('u-rows').innerHTML = d.users.length ? d.users.map((u) => `<tr class="click" data-u="${u.id}"><td class="ck">${u.role === 'owner' || u.deleted ? '' : `<input type="checkbox" data-sel="${u.id}"${sel.has(u.id) ? ' checked' : ''}>`}</td><td>${person(u, u.email ? esc(u.email) : '@' + esc(u.username))}</td><td>${planTag(u)}</td><td class="num hide-m">${fmt.n(u.messages_30d)}</td><td class="muted hide-m">${fmt.date(u.created_at)}</td><td class="muted">${u.online ? '<span class="tag good">Online</span>' : fmt.ago(u.last_seen)}</td></tr>`).join('') : `<tr><td colspan="6">${empty('No one matches', 'Try another search or filter.')}</td></tr>`;
      const a = (st.page - 1) * 25 + 1, b = Math.min(d.total, st.page * 25);
      $('u-range').textContent = d.total ? `${a}–${b} of ${fmt.n(d.total)}` : '';
      $('u-prev').disabled = st.page <= 1; $('u-next').disabled = b >= d.total;
    };
    let qt;
    $('u-q').oninput = () => { clearTimeout(qt); qt = setTimeout(() => { st.q = $('u-q').value.trim(); st.page = 1; load(); }, 250); };
    $('u-sort').onchange = () => { st.sort = $('u-sort').value; st.page = 1; load(); };
    $('u-filters').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; st.filter = b.dataset.f; st.page = 1; $('u-filters').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); load(); };
    $('u-prev').onclick = () => { st.page--; load(); }; $('u-next').onclick = () => { st.page++; load(); };
    $('u-rows').onclick = (e) => {
      const cb = e.target.closest('input[data-sel]');
      if (cb) { cb.checked ? sel.add(+cb.dataset.sel) : sel.delete(+cb.dataset.sel); syncSel(); return; }
      if (e.target.closest('td.ck')) return;
      const tr = e.target.closest('tr[data-u]'); if (tr) location.hash = '#/users/' + tr.dataset.u;
    };
    $('u-all').onchange = () => { $('u-rows').querySelectorAll('input[data-sel]').forEach((c) => { c.checked = $('u-all').checked; c.checked ? sel.add(+c.dataset.sel) : sel.delete(+c.dataset.sel); }); syncSel(); };
    $('u-bulk').onclick = async () => {
      if (!(await confirmBox(`Delete ${sel.size} account${sel.size > 1 ? 's' : ''}?`, 'They are removed and can no longer log in. Owner and staff accounts are skipped.', 'Delete', true))) return;
      try { const r = await api('/api/auth/admin/users/bulk-delete', { method: 'POST', body: { user_ids: [...sel] } }); toast(`Deleted ${r.deleted ?? sel.size}`); sel.clear(); syncSel(); $('u-all').checked = false; load(); } catch (e) { toast(e.message, true); }
    };
    await load();
    $('u-q').focus();
  }

  async function pageUser(id) {
    const d = await api('/api/vault/users/' + id);
    const u = d.user, s = d.stats;
    const isMe = S.me && S.me.id === u.id;
    const canRole = S.owner && u.role !== 'owner' && !u.guest;
    const actions = [
      `<a class="btn" href="#/users">‹ All users</a>`,
      !u.guest && u.role !== 'owner' ? (u.banned ? `<button class="btn" data-act="unban">Unban</button>` : `<button class="btn danger" data-act="ban">Ban</button>`) : '',
      !u.guest && u.role !== 'owner' ? `<button class="btn" data-act="reset">Reset password</button>` : '',
      S.owner && !u.guest ? `<button class="btn" data-act="friend">${u.tags.includes('friend') ? 'Remove Friend' : 'Make Friend'}</button>` : '',
      S.owner && !u.guest && u.role !== 'owner' ? `<button class="btn pri" data-act="plan">Gift / change plan</button>` : '',
      canRole ? `<button class="btn" data-act="role">${u.role === 'admin' ? 'Remove admin' : 'Make admin'}</button>` : '',
      canRole && u.role === 'admin' ? `<button class="btn" data-act="perms">Permissions</button>` : '',
      canRole && u.role === 'admin' ? `<button class="btn" data-act="trusted">${u.tags.includes('trusted') ? 'Untrust' : 'Make trusted'}</button>` : '',
      !u.guest ? `<button class="btn" data-act="export">Export data</button>` : '',
      !isMe && u.role !== 'owner' && !u.deleted ? `<button class="btn danger" data-act="delete">Delete</button>` : '',
    ].filter(Boolean).join('');
    const USAGE = { message: 'Messages', image_gen: 'Images', video_gen: 'Videos', file_upload: 'Uploads', file_edit: 'File edits', document_gen: 'Documents', code_agent: 'Coding AGT.', mini_agent: 'Mini', file_tool: 'File tools' };
    $('view').innerHTML = `
      <div class="card fade"><div class="u-head">${avatar(u, true)}<div><h2>${esc(u.display_name || u.username)}</h2>
        <div class="meta"><span>@${esc(u.username)}</span>${u.email ? `<span>${esc(u.email)}</span>` : ''}<span>Joined ${fmt.date(u.created_at)}</span><span>${u.online ? '<b style="color:var(--good)">● Online now</b>' : 'Last seen ' + fmt.ago(u.last_seen)}</span></div>
        <div class="u-plan">${planTag(u)}${planPill(u.plan_info)}</div></div><div class="u-actions">${actions}</div></div>
        ${u.banned ? `<div class="flag critical" style="margin:14px 0 0"><b>Banned</b> by ${esc(u.banned_by || 'staff')}<div class="ex">${esc(u.ban_reason || 'No reason given')}</div></div>` : ''}</div>
      <div class="grid g4 mt">
        ${kpi('Messages (30d)', fmt.n(s.messages_30d), undefined, '#22d3ee', null, { note: fmt.n(s.messages_total) + ' all time' })}
        ${kpi('Active days (30d)', fmt.n(s.active_days_30d), undefined, '#6d7cff', null, { note: 'days with a message' })}
        ${kpi('Chats', fmt.n(s.chats), undefined, '#a78bfa', null, { note: fmt.n(s.files) + ' files uploaded' })}
        ${d.ai ? kpi('AI spend (30d)', fmt.cost(d.ai.cost_30d), undefined, '#fbbf24', null, { note: fmt.n(d.ai.calls_30d) + ' AI calls' }) : kpi('Invited', fmt.n(s.invited), undefined, '#34d399', null, { note: 'friends who joined' })}
      </div>
      <div class="grid g21 mt">
        ${card('Activity', '<div class="chart sm"><canvas id="ch-uact"></canvas></div>', '', 'messages per day, last 30 days')}
        ${card('Details', `<dl class="kv">
          <dt>Plan</dt><dd>${esc(planName(u.plan_info))}${u.plan_info.end ? `<div class="muted small">${u.plan_info.kind === 'renews' ? 'renews' : 'ends'} ${fmt.dt(u.plan_info.end)}</div>` : ''}</dd>
          <dt>Role</dt><dd>${esc(u.role)}${u.is_chosen ? ' · chosen helper' : ''}</dd>
          <dt>Apps</dt><dd>${d.apps.length ? d.apps.map((a) => `${a.platform === 'web' ? 'Website' : a.platform === 'windows' ? 'Windows' : 'Android'} ${esc(a.version)} <span class="muted small">${fmt.ago(a.last_seen)}</span>`).join('<br>') : '—'}</dd>
          <dt>Invited by</dt><dd>${d.invited_by ? '@' + esc(d.invited_by) : '—'}</dd>
          <dt>Uses most</dt><dd>${d.usage.length ? d.usage.slice(0, 4).map((x) => `${esc(USAGE[x.action] || x.action)} (${x.count})`).join(', ') : '—'}</dd></dl>`)}
      </div>
      <div class="grid g2 mt">
        ${card('Notes', `<div id="notes">${d.notes.map((n) => `<div class="note">${esc(n.text)}<small><span>${esc(n.author)} · ${fmt.ago(n.t)}</span><a href="#" data-del="${n.id}">Delete</a></small></div>`).join('') || '<div class="muted small" style="margin-bottom:10px">Private notes about this person, only staff see them.</div>'}</div>
          <textarea class="input" id="note-in" rows="2" placeholder="Add a note…"></textarea><div style="text-align:right;margin-top:8px"><button class="btn sm pri" id="note-add">Add note</button></div>`)}
        ${card('Recent chats', d.chats.length ? `<div class="list">${d.chats.map((c) => `<div class="li click" data-chat="${c.id}"><span class="ev-ic">💬</span><div class="grow small"><b>${esc(c.title)}</b>${c.folder ? ` <span class="tag">${esc(c.folder)}</span>` : ''}${c.shared ? ' <span class="tag warn">Shared</span>' : ''}</div><span class="t">${fmt.ago(c.updated_at)}</span></div>`).join('')}</div>` : empty('No chats yet'), '', 'tap one to read it')}
      </div>
      <div class="grid g2 mt">
        ${card('Logins', d.logins.length ? `<div class="list">${d.logins.map((l) => `<div class="li"><span class="ev-ic">${l.ok ? '🔑' : '⚠️'}</span><div class="grow small"><div>${l.ok ? 'Logged in' : '<b style="color:var(--bad)">Failed login</b>'}${l.ip ? ` · <span class="muted">${esc(l.ip)}</span>` : ''}</div><div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.ua)}</div></div><span class="t">${fmt.ago(l.t)}</span></div>`).join('')}</div>` : empty('No logins recorded'))}
        ${card('Payments & safety', `${d.payments ? (d.payments.length ? paymentsTable(d.payments.map((p) => ({ ...p, username: u.username }))) : '<div class="muted small">No payments.</div>') : ''}
          <div class="muted small" style="margin:14px 0 6px">Safety flags</div>${d.flags.length ? d.flags.map((f) => `<div class="li"><span class="tag ${f.status === 'open' ? 'bad' : ''}">${esc(f.category.replace(/_/g, ' '))}</span><div class="grow small muted">${esc(f.excerpt)}</div><span class="t">${fmt.ago(f.t)}</span></div>`).join('') : '<div class="muted small">None.</div>'}
          ${d.invites.length ? `<div class="muted small" style="margin:14px 0 6px">People they invited</div>${d.invites.map((i) => `<div class="li"><div class="grow small">@${esc(i.username)}</div>${i.rewarded ? '<span class="tag good">rewarded</span>' : ''}<span class="t">${fmt.ago(i.t)}</span></div>`).join('')}` : ''}`)}
      </div>
      ${d.audit.length ? card('Staff actions', `<div class="list">${d.audit.map((a) => `<div class="li"><span class="tag">${esc(a.action)}</span><div class="grow small">${esc(a.detail)} <span class="muted">— ${esc(a.actor)}</span></div><span class="t">${fmt.ago(a.t)}</span></div>`).join('')}</div>`).replace('class="card fade"', 'class="card fade mt"') : ''}`;
    barChart('ch-uact', d.activity.labels, 'day', [{ label: 'Messages', data: d.activity.messages, color: '#22d3ee' }]);
    $('note-add').onclick = async () => {
      const t = $('note-in').value.trim(); if (!t) return;
      await api(`/api/vault/users/${id}/notes`, { method: 'POST', body: { text: t } }); toast('Note added'); pageUser(id);
    };
    $('notes').onclick = async (e) => { const a = e.target.closest('[data-del]'); if (!a) return; e.preventDefault(); await api(`/api/vault/users/${id}/notes/${a.dataset.del}`, { method: 'DELETE' }); pageUser(id); };
    $('view').querySelector('.u-actions').onclick = (e) => { const b = e.target.closest('[data-act]'); if (b) userAction(b.dataset.act, u); };
    $('view').querySelectorAll('[data-chat]').forEach((el) => el.onclick = () => viewChat(+el.dataset.chat));
    const pill = $('plan-pill');
    if (pill) {
      pill.onclick = () => planModal(u);
      const tick = () => { const t = pill.querySelector('[data-left]'); if (t) t.textContent = shortLeft(t.dataset.left); };
      S.timers.push(setInterval(tick, 1000));
    }
  }

  async function userAction(act, u) {
    const reload = () => pageUser(u.id);
    try {
      if (act === 'ban') {
        modal(`<h3>Ban @${esc(u.username)}?</h3><p>They'll be signed out and can't use Zelpophai until unbanned.</p><label>Reason (they'll see it)</label><input class="input" id="m-reason" placeholder="e.g. Spamming other users">
          <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn danger solid" id="m-ok">Ban</button></div>`, (close) => {
          $('m-ok').onclick = async () => { const r = $('m-reason').value.trim(); if (!r) return toast('Add a reason', true);
            try { await api(`/api/auth/admin/users/${u.id}/ban`, { method: 'POST', body: { reason: r } }); close(); toast('Banned'); reload(); } catch (e) { toast(e.message, true); } };
        });
      } else if (act === 'unban') {
        await api(`/api/auth/admin/users/${u.id}/unban`, { method: 'POST' }); toast('Unbanned'); reload();
      } else if (act === 'reset') {
        modal(`<h3>Reset password for @${esc(u.username)}</h3><p>They'll be asked to use this new password next time.</p><label>New password</label><input class="input" id="m-pw" value="${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}">
          <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn pri" id="m-ok">Reset</button></div>`, (close) => {
          $('m-ok').onclick = async () => { try { await api(`/api/auth/admin/users/${u.id}/reset-password`, { method: 'POST', body: { new_password: $('m-pw').value } }); close(); toast('Password reset'); } catch (e) { toast(e.message, true); } };
        });
      } else if (act === 'friend' || act === 'trusted') {
        const on = !u.tags.includes(act);
        await api(`/api/auth/admin/users/${u.id}/tags`, { method: 'POST', body: { tag: act, on } }); toast(on ? 'Tag added' : 'Tag removed'); reload();
      } else if (act === 'role') {
        const to = u.role === 'admin' ? 'user' : 'admin';
        if (!(await confirmBox(to === 'admin' ? 'Make admin?' : 'Remove admin?', to === 'admin' ? `@${u.username} will be able to open the Vault and manage users.` : `@${u.username} will lose staff access.`, 'Yes'))) return;
        await api(`/api/auth/admin/users/${u.id}/role`, { method: 'POST', body: { role: to } }); toast('Role changed'); reload();
      } else if (act === 'plan') {
        modal(`<h3>Gift or change plan</h3><p>For @${esc(u.username)} — no payment is taken.</p>
          <label>Plan</label><select class="select" id="m-plan"><option value="pro">Pro</option><option value="ultimate">Ultimate</option><option value="none">No plan (Free)</option></select>
          <label>How long</label><select class="select" id="m-days"><option value="7">7 days</option><option value="30" selected>30 days</option><option value="90">90 days</option><option value="365">1 year</option><option value="0">No end date</option></select>
          <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn pri" id="m-ok">Save</button></div>`, (close) => {
          $('m-plan').onchange = () => { $('m-days').disabled = $('m-plan').value === 'none'; };
          $('m-ok').onclick = async () => { try { const r = await api(`/api/vault/users/${u.id}/plan`, { method: 'POST', body: { plan: $('m-plan').value, days: +$('m-days').value } }); close(); toast('Done — ' + r.detail); reload(); } catch (e) { toast(e.message, true); } };
        });
      } else if (act === 'export') {
        toast('Preparing export…'); if (await dl(`/api/auth/admin/analytics/export/user/${u.id}`)) toast('Export downloaded');
      } else if (act === 'perms') {
        location.hash = '#/staff/' + u.id;
      } else if (act === 'delete') {
        if (!(await confirmBox(`Delete @${u.username}?`, 'Their account is removed and they can no longer log in.', 'Delete', true))) return;
        await api(`/api/auth/admin/users/${u.id}`, { method: 'DELETE' }); toast('Deleted'); location.hash = '#/users';
      }
    } catch (e) { toast(e.message, true); }
  }

  /* ─────────────────────────────── people ─────────────────────────────── */
  async function pagePeople() {
    const d = await api('/api/vault/people');
    const tabs = [['friends', 'Friends', 'People you added as Friends — Ultimate-level perks.'], ...(S.owner ? [['paying', 'Paying customers', 'Active Stripe plans.'], ['gifted', 'Gifted plans', 'Plans you gave from the Vault.']] : []),
      ['trial', 'On a trial', 'Free Pro time (trials and invite rewards).'], ['staff', 'Staff', 'Owner and admins.'], ['chosen', 'Chosen helpers', 'Helpers during shutdowns.'], ['banned', 'Banned', 'Accounts that are banned.']];
    let cur = 'friends';
    $('view').innerHTML = `<div class="grid g4" style="margin-bottom:16px">${kpi('Friends', fmt.n(d.friends.length), undefined, '#14b8a6')}${S.owner ? kpi('Paying', fmt.n(d.paying.length), undefined, '#34d399') + kpi('Gifted', fmt.n(d.gifted.length), undefined, '#a78bfa') : ''}${kpi('Staff', fmt.n(d.staff.length), undefined, '#f472b6')}${S.owner ? '' : kpi('Banned', fmt.n(d.banned.length), undefined, '#f87171') + kpi('On a trial', fmt.n(d.trial.length), undefined, '#3b82f6')}</div>
      <div class="card fade"><div class="chips" id="p-tabs" style="margin-bottom:6px">${tabs.map(([k, l]) => `<button class="chip${k === cur ? ' on' : ''}" data-t="${k}">${l} <span class="muted">${d[k].length}</span></button>`).join('')}</div><p class="muted small" id="p-desc"></p><div id="p-list"></div></div>`;
    const draw = () => {
      const t = tabs.find((x) => x[0] === cur);
      $('p-desc').textContent = t[2];
      const rows = d[cur];
      $('p-list').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Plan</th>${S.owner && (cur === 'paying' || cur === 'gifted') ? '<th class="num">Last paid</th><th class="hide-m">Since</th>' : '<th class="hide-m">Joined</th>'}<th>Last seen</th></tr></thead><tbody>
        ${rows.map((u) => `<tr class="click" data-u="${u.id}"><td>${person(u)}</td><td>${planTag(u)}${u.pro_plan ? ` <span class="muted small">${esc(u.pro_plan.replace(/_/g, ' '))}</span>` : ''}</td>${S.owner && (cur === 'paying' || cur === 'gifted') ? `<td class="num">${u.paid ? fmt.usd(u.paid) : '—'}</td><td class="hide-m muted">${fmt.date(u.since)}</td>` : `<td class="hide-m muted">${fmt.date(u.created_at)}</td>`}<td class="muted">${u.online ? '<span class="tag good">Online</span>' : fmt.ago(u.last_seen)}</td></tr>`).join('')}</tbody></table></div>` : empty('Nobody here yet');
    };
    draw();
    $('p-tabs').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; cur = b.dataset.t; $('p-tabs').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); draw(); };
    $('p-list').onclick = (e) => { const tr = e.target.closest('tr[data-u]'); if (tr) location.hash = '#/users/' + tr.dataset.u; };
  }

  /* ─────────────────────────────── safety ─────────────────────────────── */
  const CAT = { self_harm: ['Self-harm', 'critical'], violence: ['Violence', 'critical'], sexual_minors: ['Child safety', 'critical'], hate: ['Hate', 'warn'], report: ['Reported share', 'warn'], spam: ['Spam', 'warn'] };
  async function pageSafety() {
    let status = 'open';
    $('view').innerHTML = `<div class="card fade"><div class="toolbar"><div class="chips" id="s-tabs"><button class="chip on" data-s="open">Needs review</button><button class="chip" data-s="actioned">Actioned</button><button class="chip" data-s="dismissed">Dismissed</button><button class="chip" data-s="all">All</button></div></div>
      <p class="muted small" style="margin-top:-4px">Messages that match safety filters and shared chats people reported. Nothing is blocked automatically — you decide. For self-harm, consider reaching out kindly rather than banning.</p><div id="s-list"></div></div>`;
    const load = async () => {
      const d = await api('/api/vault/safety?status=' + status);
      setBadge('safety', d.counts.open || 0);
      $('s-list').innerHTML = d.flags.length ? d.flags.map((f) => {
        const [name, lvl] = CAT[f.category] || [f.category, 'warn'];
        return `<div class="flag ${lvl}" data-id="${f.id}"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="tag ${lvl === 'critical' ? 'bad' : 'warn'}">${esc(name)}</span>
          ${f.username ? `<a href="#/users/${f.user_id}">@${esc(f.username)}</a>` : ''}<span class="muted small">${f.kind === 'share_report' ? 'shared chat reported' : 'in a chat'} · ${fmt.ago(f.t)}</span>${f.status !== 'open' ? `<span class="tag">${esc(f.status)}${f.handled_by ? ' by ' + esc(f.handled_by) : ''}</span>` : ''}</div>
          <div class="ex">${esc(f.excerpt || '(no text)')}</div><div class="muted small" style="margin-bottom:10px">${esc(f.reason)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${f.status === 'open' ? `<button class="btn sm" data-a="dismiss">Looks fine</button>${f.message_id ? '<button class="btn sm" data-a="delete_message">Delete message</button>' : ''}${f.share_id ? '<button class="btn sm" data-a="unshare">Stop sharing</button>' : ''}${f.user_id ? '<button class="btn sm danger" data-a="ban">Ban user</button>' : ''}` : '<button class="btn sm" data-a="reopen">Reopen</button>'}</div></div>`;
      }).join('') : empty(status === 'open' ? 'All clear' : 'Nothing here', status === 'open' ? 'No content waiting for review.' : '');
    };
    $('s-tabs').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; status = b.dataset.s; $('s-tabs').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); load(); };
    $('s-list').onclick = async (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const id = b.closest('[data-id]').dataset.id, a = b.dataset.a;
      if (a === 'ban' && !(await confirmBox('Ban this user?', 'They\'ll be signed out and blocked.', 'Ban', true))) return;
      try { await api('/api/vault/safety/' + id, { method: 'POST', body: { action: a } }); toast('Done'); load(); } catch (err) { toast(err.message, true); }
    };
    await load();
  }

  /* ─────────────────────────────── controls ─────────────────────────────── */
  async function pageControls() {
    const st = await api('/api/admin/system/state');
    const C = [
      ['maintenance', 'maintenance_mode', 'Maintenance mode', 'Only staff can use Zelpophai while you fix things.', true],
      ['registrations', 'registrations', 'New sign-ups', 'Let new people create accounts.', false],
      ['messaging', 'messaging', 'Messaging', 'Let users send messages.', false],
      ['ai', 'ai_enabled', 'AI answers', 'Turn the AI off for everyone except staff.', false],
    ];
    $('view').innerHTML = `<div class="grid g2">
      ${card('Global controls', C.map(([ep, key, t, sub, danger]) => `<div class="ctrl"><div class="grow"><b>${t}</b><span class="muted small">${sub}</span></div><button class="switch${danger ? ' danger' : ''}${st[key] === 'on' ? ' on' : ''}" data-ep="${ep}" data-key="${key}" aria-label="${t}"></button></div>`).join('') +
        `<div class="ctrl"><div class="grow"><b>Sign everyone out</b><span class="muted small">Ends every session (staff too). Use after a security problem.</span></div><button class="btn sm danger" id="force-out">Sign out all</button></div>
         <p class="muted small" style="margin-top:12px">Locking every account, the emergency backup and the owner password reset are in <a href="#/security">Security &amp; emergency</a>.</p>`)}
      ${card('Broadcast', `<p class="muted small" style="margin-top:-6px">A message that pops up for people in Zelpophai.</p>
        <label class="muted small">Who sees it</label><select class="select" id="b-aud" style="margin:6px 0 10px"><option value="all">Everyone</option><option value="users">Users only</option><option value="admins">Staff only</option></select>
        <textarea class="input" id="b-text" rows="5" maxlength="2000" placeholder="e.g. New: Zelpophai Mini is here — press Ctrl+Shift+Z in the Windows app!"></textarea>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px"><span class="muted small" id="b-count">0 / 2000</span><button class="btn pri" id="b-send">Send broadcast</button></div>`)}
    </div>`;
    $('view').querySelectorAll('.switch').forEach((sw) => sw.onclick = async () => {
      const on = !sw.classList.contains('on');
      if (sw.dataset.ep === 'maintenance' && on && !(await confirmBox('Turn on maintenance?', 'Everyone except staff will see the maintenance screen.', 'Turn on', true))) return;
      try { await api('/api/admin/system/' + sw.dataset.ep, { method: 'POST', body: { value: on ? 'on' : 'off' } }); sw.classList.toggle('on', on); toast('Saved'); } catch (e) { toast(e.message, true); }
    });
    $('force-out').onclick = async () => { if (!(await confirmBox('Sign everyone out?', 'All sessions end, including yours.', 'Sign out all', true))) return; try { await api('/api/admin/system/force-logout', { method: 'POST' }); toast('Everyone signed out'); } catch (e) { toast(e.message, true); } };
    $('b-text').oninput = () => { $('b-count').textContent = $('b-text').value.length + ' / 2000'; };
    $('b-send').onclick = async () => {
      const t = $('b-text').value.trim(); if (!t) return toast('Write a message', true);
      try { await api('/api/announcements', { method: 'POST', body: { content: t, audience: $('b-aud').value } }); $('b-text').value = ''; toast('Broadcast sent'); } catch (e) { toast(e.message, true); }
    };
  }

  /* ─────────────────────────────── releases ─────────────────────────────── */
  async function pageReleases() {
    const d = await api('/api/vault/releases');
    const w = d.latest.windows, a = d.latest.android;
    const plat = (k) => d.usage[k] || {};
    $('view').innerHTML = `<div class="grid g3">
      ${kpi('Windows app', w ? 'v' + esc(w.version) : '—', undefined, '#3b82f6', null, { note: w ? fmt.size(w.size) + ' · ' + fmt.date(w.released) : 'not uploaded' })}
      ${kpi('Android app', a ? 'v' + esc(a.version) : '—', undefined, '#34d399', null, { note: a ? fmt.size(a.size) : 'not uploaded' })}
      ${kpi('App users (30d)', fmt.n((d.users.windows || 0) + (d.users.android || 0)), undefined, '#a78bfa', null, { note: `${fmt.n(d.users.web || 0)} on the website` })}
    </div>
    <div class="grid g2 mt">
      ${card('Versions in use', (Object.keys(plat('windows')).length || Object.keys(plat('android')).length) ? '<div class="chart sm"><canvas id="ch-ver"></canvas></div>' : empty('No app users yet', 'Versions appear once people open the apps.'), '', 'last 30 days')}
      ${S.owner ? card('Upload a new build', `<p class="muted small" style="margin-top:-6px">Windows: drop <b>Zelpophai-Setup.exe</b>, <b>Zelpophai-Setup.exe.blockmap</b> and <b>latest.yml</b> from the build's <code>dist</code> folder. Android: <b>Zelpophai.apk</b> and <b>android.json</b>. Apps update themselves once <code>latest.yml</code> / <code>android.json</code> arrive — they're always uploaded last.</p>
        <div class="drop" id="drop">Drop files here or <b>click to choose</b><input type="file" id="files" multiple hidden></div><div id="up-list" class="list mt"></div>`) : card('Upload a new build', empty('Owner only'))}
    </div>`;
    const vers = [...new Set([...Object.keys(plat('windows')), ...Object.keys(plat('android'))])].sort();
    if (vers.length) barChart('ch-ver', vers, null, [{ label: 'Windows', data: vers.map((v) => plat('windows')[v] || 0), color: '#3b82f6' }, { label: 'Android', data: vers.map((v) => plat('android')[v] || 0), color: '#34d399' }], { legend: true, stacked: true });
    if (!S.owner) return;
    const drop = $('drop');
    drop.onclick = () => $('files').click();
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); upload([...e.dataTransfer.files]); };
    $('files').onchange = () => upload([...$('files').files]);
  }
  async function upload(files) {
    const MAP = { 'Zelpophai-Setup.exe': 'win', 'Zelpophai-Setup.exe.blockmap': 'win', 'latest.yml': 'win', 'Zelpophai.apk': 'android', 'android.json': 'android' };
    const order = ['Zelpophai-Setup.exe', 'Zelpophai-Setup.exe.blockmap', 'Zelpophai.apk', 'latest.yml', 'android.json'];
    const bad = files.filter((f) => !MAP[f.name]);
    if (bad.length) toast('Skipped: ' + bad.map((f) => f.name).join(', '), true);
    const list = files.filter((f) => MAP[f.name]).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    for (const f of list) {
      const row = document.createElement('div'); row.className = 'li';
      row.innerHTML = `<div class="grow small"><b>${esc(f.name)}</b> <span class="muted">${fmt.size(f.size)}</span><div class="prog"><i></i></div></div><span class="t">uploading…</span>`;
      $('up-list').appendChild(row);
      try {
        await new Promise((res, rej) => {
          const x = new XMLHttpRequest();
          x.open('POST', `/api/vault/releases/upload?platform=${MAP[f.name]}&name=${encodeURIComponent(f.name)}`);
          x.setRequestHeader('X-Vault-Token', token());
          x.upload.onprogress = (e) => { if (e.lengthComputable) row.querySelector('.prog i').style.width = (e.loaded / e.total * 100) + '%'; };
          x.onload = () => x.status < 300 ? res() : rej(new Error((JSON.parse(x.responseText || '{}').detail) || 'Upload failed'));
          x.onerror = () => rej(new Error('Network error'));
          x.send(f);
        });
        row.querySelector('.t').textContent = '✓ done';
      } catch (e) { row.querySelector('.t').textContent = '✗ ' + e.message; return; }
    }
    if (list.length) { toast('Upload complete'); setTimeout(() => route(), 800); }
  }

  /* ─────────────────────────────── backups ─────────────────────────────── */
  async function pageBackups() {
    const d = await api('/api/vault/backups');
    const last = d.backups[0];
    $('view').innerHTML = `<div class="grid g3">
      ${kpi('Database size', fmt.size(d.db_size), undefined, '#6d7cff')}
      ${kpi('Last backup', last ? fmt.ago(last.created) : 'none yet', undefined, last ? '#34d399' : '#f87171', null, { note: last ? fmt.dt(last.created) : 'make one now' })}
      ${kpi('Automatic backups', 'Daily', undefined, '#22d3ee', null, { note: 'the newest ' + d.keep + ' are kept' })}
    </div>
    ${card('Backups', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Backup</th><th class="num hide-m">Size</th><th class="hide-m">Made</th><th></th></tr></thead><tbody>
      ${d.backups.length ? d.backups.map((b) => `<tr><td><b class="bk-name">${esc(b.name)}</b> ${b.auto ? '<span class="tag">auto</span>' : '<span class="tag friend">manual</span>'}<div class="muted small show-m">${fmt.size(b.size)} · ${fmt.dt(b.created)}</div></td><td class="num hide-m">${fmt.size(b.size)}</td><td class="muted hide-m">${fmt.dt(b.created)}</td>
        <td class="bk-act"><button class="btn sm" data-dl="${esc(b.name)}">Download</button> <button class="btn sm danger" data-rs="${esc(b.name)}">Restore</button></td></tr>`).join('') : `<tr><td colspan="4">${empty('No backups yet', 'Make the first one now — after that one is made every day.')}</td></tr>`}</tbody></table></div>`,
      '<button class="btn pri" id="bk-now">Back up now</button>', 'saved on the server volume').replace('class="card fade"', 'class="card fade mt"')}
    <p class="muted small mt">Tip: download a backup now and then and keep it somewhere else (your PC or cloud storage), so you're safe even if the server's disk fails.</p>`;
    $('bk-now').onclick = async () => { $('bk-now').disabled = true; try { const r = await api('/api/vault/backups', { method: 'POST' }); toast('Backup made: ' + fmt.size(r.size)); route(); } catch (e) { toast(e.message, true); $('bk-now').disabled = false; } };
    $('view').querySelectorAll('[data-dl]').forEach((b) => b.onclick = async () => {
      try { const r = await api('/api/vault/backups/' + encodeURIComponent(b.dataset.dl)); const blob = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = b.dataset.dl; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); } catch (e) { toast(e.message, true); }
    });
    $('view').querySelectorAll('[data-rs]').forEach((b) => b.onclick = () => {
      modal(`<h3>Restore this backup?</h3><p>Everything goes back to how it was at <b>${esc(b.dataset.rs)}</b>. Anything newer (messages, sign-ups…) is lost. A copy of the current database is saved first, and Zelpophai restarts (about a minute).</p>
        <label>Type RESTORE</label><input class="input" id="m-c" autocomplete="off"><label>Your Vault PIN</label><input class="input" id="m-p" type="password" inputmode="numeric" maxlength="6">
        <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn danger solid" id="m-ok">Restore and restart</button></div>`, (close) => {
        $('m-ok').onclick = async () => { try { const r = await api('/api/vault/backups/' + encodeURIComponent(b.dataset.rs) + '/restore', { method: 'POST', body: { confirm: $('m-c').value, pin: $('m-p').value } }); close(); toast(r.message); } catch (e) { toast(e.message, true); } };
      });
    });
  }

  /* ─────────────────────────────── logs ─────────────────────────────── */
  async function pageLogs() {
    let action = '';
    $('view').innerHTML = `<div class="card fade"><div class="toolbar"><select class="select" id="l-act" style="width:auto"><option value="">All actions</option>${['ban', 'unban', 'reset_password', 'delete', 'role_change', 'tag', 'plan_change', 'broadcast', 'maintenance', 'backup', 'restore', 'login'].map((a) => `<option>${a}</option>`).join('')}</select><span class="muted small" id="l-total" style="margin-left:auto"></span></div><div class="list" id="l-list"></div></div>`;
    const load = async () => {
      const d = await api('/api/auth/admin/audit?limit=150' + (action ? '&action=' + encodeURIComponent(action) : ''));
      $('l-total').textContent = fmt.n(d.total) + ' entries';
      $('l-list').innerHTML = d.logs.length ? d.logs.map((l) => `<div class="li"><span class="tag ${/ban|delete|restore/.test(l.action) ? 'bad' : /maint|role|plan/.test(l.action) ? 'warn' : ''}">${esc(l.action)}</span><div class="grow small"><b>${esc(l.actor_username)}</b> <span class="muted">(${esc(l.actor_role)})</span>${l.target_username ? ` → ${l.target_id ? `<a href="#/users/${l.target_id}">@${esc(l.target_username)}</a>` : '@' + esc(l.target_username)}` : ''}<div class="muted">${esc(l.detail)}</div></div><span class="t" title="${esc(l.created_at)} UTC">${fmt.ago(String(l.created_at).replace(' ', 'T') + (/[Z+]/.test(l.created_at) ? '' : 'Z'))}</span></div>`).join('') : empty('Nothing logged yet');
    };
    $('l-act').onchange = () => { action = $('l-act').value; load(); };
    await load();
  }

  /* ─────────────────────────────── alerts ─────────────────────────────── */
  function alertHtml(a) {
    return `<div class="alert ${esc(a.level)}"><span class="lv"></span><div style="flex:1"><b>${esc(a.title)}</b><p>${esc(a.detail)}</p><span class="muted small">${fmt.ago(a.t)}</span></div>${a.acknowledged ? '' : `<button class="btn sm" data-ack="${a.id}">OK</button>`}</div>`;
  }
  async function renderAlertsInto(el, all) {
    const d = await api('/api/vault/alerts' + (all ? '?all=1' : ''));
    el.innerHTML = d.alerts.length ? d.alerts.slice(0, 20).map(alertHtml).join('') : empty('No alerts', 'You\'ll see low credit, error spikes and safety items here.');
    el.onclick = async (e) => { const b = e.target.closest('[data-ack]'); if (!b) return; await api(`/api/vault/alerts/${b.dataset.ack}/ack`, { method: 'POST' }); renderAlertsInto(el, all); refreshAlerts(); };
  }
  async function refreshAlerts() {
    try {
      const d = await api('/api/vault/alerts');
      const n = d.alerts.length;
      $('bell-n').hidden = !n; $('bell-n').textContent = n;
      for (const a of d.alerts) {
        if (S.alertsSeen.has(a.id)) continue;
        S.alertsSeen.add(a.id);
        if (S.alertsBooted && 'Notification' in window && Notification.permission === 'granted') {
          try { new Notification('Zelpophai Vault: ' + a.title, { body: a.detail, icon: '/static/icons/favicon-32-v2.png', tag: 'zv-' + a.id }); } catch (e) {}
        }
      }
      S.alertsBooted = true;
    } catch (e) {}
  }
  function setBadge(k, n) { const b = $('badge-' + k); if (b) { b.hidden = !n; b.textContent = n; } }
  async function refreshTop() {
    try {
      const d = await api('/api/vault/live');
      $('online-pill').querySelector('b').textContent = d.online.length;
    } catch (e) {}
    try { const s = await api('/api/vault/safety?status=open'); setBadge('safety', s.counts.open || 0); } catch (e) {}
    try { const f = await api('/api/feedback/unread'); setBadge('feedback', f.staff_open || 0); } catch (e) {}
    refreshAlerts();
  }

  /* ─────────────────────────────── plans & timers ─────────────────────────────── */
  const PLAN_NAMES = { pro_monthly: 'Pro · monthly', pro_annual: 'Pro · yearly', pro_lifetime: 'Pro · lifetime', ultimate_monthly: 'Ultimate · monthly',
    ultimate_annual: 'Ultimate · yearly', ultimate_lifetime: 'Ultimate · lifetime', pro_trial: 'Pro trial', gift_pro: 'Pro (gift)', gift_ultimate: 'Ultimate (gift)', gift_ultimate_until: 'Ultimate (gift)' };
  function planName(pi) {
    if (!pi) return 'Free';
    if (PLAN_NAMES[pi.pro_plan]) return PLAN_NAMES[pi.pro_plan];
    if (pi.kind === 'trial') return 'Pro trial';
    return { friend: 'Friend (Ultimate perks)', guest: 'Guest', free: 'Free', pro: 'Pro', ultimate: 'Ultimate' }[pi.plan] || pi.plan;
  }
  function parts(ms) { ms = Math.max(0, ms); const s = Math.floor(ms / 1000); return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 }; }
  const p2 = (n) => String(n).padStart(2, '0');
  function shortLeft(iso) {
    const ms = new Date(iso) - Date.now(); if (ms <= 0) return 'ended';
    const t = parts(ms);
    return t.d ? `${t.d}d ${p2(t.h)}h ${p2(t.m)}m ${p2(t.s)}s` : `${p2(t.h)}:${p2(t.m)}:${p2(t.s)}`;
  }
  function planPill(pi) {
    if (!pi) return '';
    const paidish = ['renews', 'ends', 'trial', 'gift', 'forever'].includes(pi.kind);
    const txt = pi.end ? `${pi.kind === 'renews' ? 'renews in' : 'ends in'} <b data-left="${esc(pi.end)}">${shortLeft(pi.end)}</b>`
      : pi.kind === 'forever' ? 'no end date' : pi.kind === 'friend' ? 'Friend perks' : pi.kind === 'renews' ? 'renewal date unknown' : 'Free plan';
    return `<button class="plan-pill ${paidish ? 'paid ' + pi.kind : 'free'}" id="plan-pill" title="See plan details"><span class="dot"></span><span>${esc(planName(pi))}</span><span class="sep">·</span><span>${txt}</span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg></button>`;
  }
  function planModal(u) {
    const pi = u.plan_info || {};
    const head = { renews: 'Renews automatically in', ends: 'Ends in', trial: 'Trial ends in', gift: 'Gift ends in' }[pi.kind];
    const SRC = { stripe: 'Date from Stripe (live).', estimate: 'Estimated from their last payment — Stripe will confirm the exact date.', set: 'Set from the Vault or a trial.', gift: 'Gifted from the Vault with no end date.', plan: 'Lifetime plan — paid once.', unknown: 'No payment found yet, so the renewal date is unknown.' };
    let body;
    if (pi.end) {
      body = `<p class="muted small" style="margin:0 0 10px">${head}</p>
        <div class="count" id="cd">${['Days', 'Hours', 'Minutes', 'Seconds'].map((l) => `<div><b data-u="${l[0]}">00</b><span>${l}</span></div>`).join('')}</div>
        <div class="count-bar"><i id="cd-bar"></i></div>
        <dl class="kv" style="margin-top:14px"><dt>${pi.kind === 'renews' ? 'Renews on' : 'Ends on'}</dt><dd>${fmt.dt(pi.end)}</dd>
          ${pi.start ? `<dt>Last paid</dt><dd>${fmt.dt(pi.start)}</dd>` : ''}
          ${pi.price != null ? `<dt>Price</dt><dd>${fmt.usd(pi.price)}${pi.interval === 'month' ? ' / month' : pi.interval === 'year' ? ' / year' : ''}</dd>` : ''}
          <dt>What happens</dt><dd>${pi.kind === 'renews' ? 'Their card is charged again and the plan keeps going.' : pi.kind === 'ends' ? 'They cancelled — the plan stops and they go back to Free.' : 'They go back to Free unless they upgrade.'}</dd></dl>`;
    } else {
      body = `<div class="empty" style="padding:18px 0"><b>${pi.kind === 'forever' ? 'This plan has no end date' : pi.kind === 'friend' ? 'Friends keep their perks until you remove the tag' : pi.kind === 'renews' ? "Renewal date isn't known yet" : 'Free plan — nothing to count down'}</b>${pi.start ? 'Last paid ' + fmt.dt(pi.start) : ''}</div>`;
    }
    const close = modal(`<h3>${esc(planName(pi))} <span class="muted" style="font-weight:500">· @${esc(u.username)}</span></h3>${body}
      ${pi.source ? `<p class="muted small" style="margin-top:12px">${esc(SRC[pi.source] || '')}</p>` : ''}
      <div class="modal-actions">${S.owner && u.role !== 'owner' && !u.guest ? '<button class="btn" id="pm-change">Change plan</button>' : ''}<button class="btn pri" data-close>Close</button></div>`, (cl) => {
      if ($('pm-change')) $('pm-change').onclick = () => { cl(); userAction('plan', u); };
    });
    if (!pi.end) return;
    const end = new Date(pi.end).getTime();
    const start = pi.start ? new Date(pi.start).getTime() : end - (pi.interval === 'year' ? 365 : 30) * 864e5;
    const tick = () => {
      const box = $('cd'); if (!box || $('modal').hidden) { clearInterval(iv); return; }
      const t = parts(end - Date.now());
      box.querySelector('[data-u="D"]').textContent = t.d; box.querySelector('[data-u="H"]').textContent = p2(t.h);
      box.querySelector('[data-u="M"]').textContent = p2(t.m); box.querySelector('[data-u="S"]').textContent = p2(t.s);
      const pct = Math.min(100, Math.max(0, (Date.now() - start) / Math.max(1, end - start) * 100));
      $('cd-bar').style.width = pct.toFixed(2) + '%';
    };
    const iv = setInterval(tick, 1000); tick();
  }

  /* ─────────────────────────────── chat viewer ─────────────────────────────── */
  // Turns a stored message into what the person actually saw: formatted text, code blocks, tables,
  // pictures, videos and file cards. Everything is escaped first; only http(s) and same-site links are kept.
  const CV = (() => {
    const okUrl = (u) => /^(https?:\/\/|\/(?!\/))/i.test(u) ? u.replace(/"/g, '%22') : '';
    function inline(t) {
      const keep = []; const hold = (h) => { keep.push(h); return '\u0001' + (keep.length - 1) + '\u0001'; };
      t = t.replace(/`([^`\n]+)`/g, (_, c) => hold('<code>' + c + '</code>'));
      t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (_, alt, u) => { u = okUrl(u.replace(/&amp;/g, '&')); return u ? hold(`<a class="cv-img" href="${esc(u)}" target="_blank" rel="noopener noreferrer"><img src="${esc(u)}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer"></a>`) : alt; });
      t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, u) => {
        u = okUrl(u.replace(/&amp;/g, '&')); if (!u) return txt;
        if (/^\/api\/video\/serve\/[\w.-]+\.mp4$/.test(u)) return hold(`<video class="cv-video" src="${esc(u)}" controls preload="metadata"></video>`);
        return hold(`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">`) + txt + hold('</a>');
      });
      t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,!?])/g, (_, pre, u) => pre + hold(`<a href="${u.replace(/"/g, '%22')}" target="_blank" rel="noopener noreferrer">${u}</a>`));
      t = t.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/__([^_\n]+)__/g, '<b>$1</b>')
        .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>').replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
      return t.replace(/\u0001(\d+)\u0001/g, (_, i) => keep[+i]);
    }
    function blocks(src) {
      const L = src.split('\n'); const out = []; let i = 0, para = [];
      const flush = () => { if (para.length) { out.push('<p>' + inline(para.join('\n')).replace(/\n/g, '<br>') + '</p>'); para = []; } };
      const cells = (r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      while (i < L.length) {
        const l = L[i]; let m;
        if (/^\u0002\d+\u0002$/.test(l.trim())) { flush(); out.push(l.trim()); i++; }
        else if (!l.trim()) { flush(); i++; }
        else if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { flush(); const h = Math.min(6, m[1].length + 2); out.push(`<h${h}>${inline(m[2])}</h${h}>`); i++; }
        else if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(l)) { flush(); out.push('<hr>'); i++; }
        else if (/^\s*&gt;\s?/.test(l)) { flush(); const q = []; while (i < L.length && /^\s*&gt;\s?/.test(L[i])) q.push(L[i++].replace(/^\s*&gt;\s?/, '')); out.push('<blockquote>' + blocks(q.join('\n')) + '</blockquote>'); }
        else if (/\|/.test(l) && i + 1 < L.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(L[i + 1])) {
          flush(); const head = cells(l); i += 2; const rows = [];
          while (i < L.length && /\|/.test(L[i]) && L[i].trim()) rows.push(cells(L[i++]));
          out.push('<div class="cv-tbl"><table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' + rows.map((r) => '<tr>' + head.map((_, k) => `<td>${inline(r[k] || '')}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
        }
        else if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
          flush(); const ord = /^\s*\d+[.)]\s+/.test(l); const items = [];
          while (i < L.length && (/^\s*([-*+]|\d+[.)])\s+/.test(L[i]) || (/^\s{2,}\S/.test(L[i]) && items.length))) {
            if (/^\s*([-*+]|\d+[.)])\s+/.test(L[i])) { const ind = /^\s*/.exec(L[i])[0].length; items.push({ ind, t: L[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '') }); }
            else items[items.length - 1].t += '\n' + L[i].trim();
            i++;
          }
          const base = Math.min(...items.map((x) => x.ind));
          out.push(`<${ord ? 'ol' : 'ul'}>` + items.map((x) => `<li${x.ind > base ? ` style="margin-left:${Math.min(3, Math.round((x.ind - base) / 2)) * 16}px"` : ''}>${inline(x.t.replace(/^\[( |x)\]\s*/i, (_, c) => (c === ' ' ? '☐ ' : '☑ '))).replace(/\n/g, '<br>')}</li>`).join('') + `</${ord ? 'ol' : 'ul'}>`);
        }
        else { para.push(l); i++; }
      }
      flush(); return out.join('');
    }
    const EXT_COL = { docx: '#2563eb', pdf: '#dc2626', pptx: '#ea580c', xlsx: '#16a34a', csv: '#16a34a', html: '#7c3aed' };
    function fileCard(name, size, body, made) {
      const ext = (/\.([a-z0-9]+)$/i.exec(name || '') || [, 'file'])[1].toLowerCase();
      return `<details class="cv-file"><summary><span class="cv-ext" style="background:${EXT_COL[ext] || '#475569'}">${esc(ext.slice(0, 4).toUpperCase())}</span><span class="grow"><b>${esc(name || 'File')}</b><small>${made ? 'File made by Zelpophai' : 'File the person attached'}${size ? ' · ' + fmt.size(+size) : ''}</small></span><em>Show contents</em></summary><pre>${esc((body || '').slice(0, 20000))}${(body || '').length > 20000 ? '\n…' : ''}</pre></details>`;
    }
    function render(text, role) {
      const slots = []; const slot = (h) => { slots.push(h); return '\n\u0002' + (slots.length - 1) + '\u0002\n'; };
      let t = String(text || '').replace(/\r\n?/g, '\n');
      t = t.replace(/```[\w-]*\s*\n(\s*<zfile\b[\s\S]*?<\/zfile>)\s*\n```/gi, '$1');
      t = t.replace(/<zfile\b([^>]*)>([\s\S]*?)(<\/zfile>|$)/gi, (_, a, body) => slot(fileCard((/name="([^"]*)"/.exec(a) || [])[1], (/size="(\d+)"/.exec(a) || [])[1], body.replace(/^\n+|\n+$/g, ''), true)));
      t = t.replace(/<(zimage|zvideo|zremind)\b[^>]*?(?:\/>|>[\s\S]*?(?:<\/\1>|$))/gi, (_, k) => slot(`<div class="cv-tool">${{ zimage: 'Asked to make an image', zvideo: 'Asked to make a video', zremind: 'Set a reminder' }[k.toLowerCase()]}</div>`));
      if (role === 'user') t = t.replace(/\[File(?: content)?: ([^\]\n]+)\]\n?([\s\S]*?)(?=\n\n\[File(?: content)?: |$)/g, (_, n, body) => slot(fileCard(n, '', body.trim(), false)));
      t = t.replace(/```([\w+#-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g, (_, lang, code) => slot(`<div class="cv-code"><div><span>${esc(lang || 'code')}</span><button type="button" data-copy-code>Copy</button></div><pre><code>${esc(code.replace(/\n$/, ''))}</code></pre></div>`));
      const html = blocks(esc(t)).replace(/\u0002(\d+)\u0002/g, (_, i) => slots[+i]);
      return html || '<p class="muted">(empty message)</p>';
    }
    return { render };
  })();

  let cvState = null;
  function closeChatViewer() {
    if (!cvState) return;
    clearInterval(cvState.timer); document.removeEventListener('keydown', cvState.onKey, true);
    cvState.el.remove(); document.documentElement.style.overflow = ''; cvState = null;
  }
  async function viewChat(id) {
    closeChatViewer();
    const el = document.createElement('div'); el.className = 'cv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<aside class="cv-side"><div class="cv-side-h"><b>Their chats</b><button class="ib cv-side-x" aria-label="Hide list">✕</button></div><input class="input" id="cv-find-chat" placeholder="Find a chat…"><div class="cv-chats" id="cv-chats"></div></aside>
      <section class="cv-main"><header class="cv-head"><button class="ib cv-menu" aria-label="Their chats">☰</button><div class="cv-ttl" id="cv-ttl"><b>Loading chat…</b></div>
        <div class="cv-tools"><span class="cv-live" id="cv-live" title="New messages appear here by themselves"><i></i>Live</span><input class="input" id="cv-q" placeholder="Search in this chat"><span class="muted small" id="cv-hits"></span>
        <button class="btn sm" id="cv-dl">Download</button><button class="ib" id="cv-close" aria-label="Close">✕</button></div></header>
        <div class="cv-info" id="cv-info"></div><div class="cv-body" id="cv-body"><div class="empty">Loading chat…</div></div>
        <footer class="cv-foot">You're reading this chat as staff. The person can't see that you opened it, and you can't reply here.</footer></section>`;
    document.body.appendChild(el); document.documentElement.style.overflow = 'hidden';
    const q = (sel) => el.querySelector(sel);
    const st = cvState = { el, id, data: null, sig: '', timer: null, onKey: (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeChatViewer(); } } };
    document.addEventListener('keydown', st.onKey, true);
    q('#cv-close').onclick = closeChatViewer;
    q('.cv-menu').onclick = () => el.classList.toggle('side-open'); q('.cv-side-x').onclick = () => el.classList.remove('side-open');
    const day = (d) => { const t = new Date(); const y = new Date(t - 864e5); return d.toDateString() === t.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' }); };
    const clock = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const WHY = { wrong: 'Wrong or made up', unhelpful: 'Didn\'t help', ignored: 'Didn\'t do what they asked', slow: 'Too slow', long: 'Too long', refused: 'Refused to answer', unsafe: 'Unsafe', other: 'Other' };

    function drawChats() {
      const d = st.data, f = q('#cv-find-chat').value.trim().toLowerCase();
      const list = d.other_chats.filter((c) => !f || c.title.toLowerCase().includes(f));
      q('#cv-chats').innerHTML = list.map((c) => `<button class="cv-chat${c.id === st.id ? ' on' : ''}" data-id="${c.id}"><b>${esc(c.title)}</b><span>${c.messages} message${c.messages === 1 ? '' : 's'} · ${fmt.ago(c.updated_at)}</span></button>`).join('') || '<div class="muted small" style="padding:10px">No chats match.</div>';
    }
    function drawMessages(keepScroll) {
      const d = st.data, body = q('#cv-body'), u = d.chat.username, term = q('#cv-q').value.trim().toLowerCase();
      const nearEnd = body.scrollHeight - body.scrollTop - body.clientHeight < 140, top = body.scrollTop;
      let last = '', hits = 0;
      const shown = d.messages.filter((m) => m.role !== 'system');
      body.innerHTML = shown.map((m) => {
        const dt = m.at ? new Date(m.at) : null, me = m.role === 'user';
        const sep = dt && day(dt) !== last ? `<div class="cv-day"><span>${esc(last = day(dt))}</span></div>` : '';
        const hit = term && (m.content || '').toLowerCase().includes(term); if (hit) hits++;
        if (term && !hit) return '';
        const r = m.rating;
        return `${sep}<div class="cv-msg ${me ? 'me' : 'ai'}${hit ? ' hit' : ''}" data-mid="${m.id}">
          <div class="cv-av">${me ? esc((u[0] || '?').toUpperCase()) : 'Z'}</div>
          <div class="cv-col"><div class="cv-who"><b>${me ? '@' + esc(u) : 'Zelpophai'}</b>${dt ? `<time title="${esc(dt.toLocaleString())}">${clock(dt)}</time>` : ''}</div>
            <div class="cv-bub">${CV.render(m.content, m.role)}</div>
            ${r ? `<div class="cv-rate ${r.value > 0 ? 'up' : 'down'}">${r.value > 0 ? '👍 They liked this answer' : '👎 They marked this answer as bad'}${r.reason ? ' · ' + esc(WHY[r.reason] || r.reason) : ''}${r.comment ? ` — “${esc(r.comment)}”` : ''}</div>` : ''}
            <div class="cv-act"><button type="button" data-copy-msg="${m.id}">Copy</button></div></div></div>`;
      }).join('') || `<div class="empty">${term ? 'Nothing in this chat matches your search.' : 'This chat has no messages yet.'}</div>`;
      q('#cv-hits').textContent = term ? hits + ' found' : '';
      if (term) body.querySelectorAll('.cv-bub').forEach((b) => markTerm(b, term));
      body.querySelectorAll('img').forEach((im) => { im.onerror = () => { const a = im.closest('.cv-img'); if (a) { a.classList.add('gone'); a.textContent = 'Picture no longer available'; } }; });
      body.scrollTop = keepScroll && !nearEnd ? top : body.scrollHeight;
    }
    function markTerm(root, term) {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
      nodes.forEach((n) => { const i = n.nodeValue.toLowerCase().indexOf(term); if (i < 0 || n.parentElement.closest('summary')) return; const r = n.splitText(i); r.splitText(term.length); const mk = document.createElement('mark'); mk.textContent = r.nodeValue; r.replaceWith(mk); });
    }
    function drawHead() {
      const c = st.data.chat, n = st.data.messages.filter((m) => m.role !== 'system');
      q('#cv-ttl').innerHTML = `<b>${esc(c.title || 'Untitled chat')}</b><span><a href="#/users/${c.user_id}" id="cv-user">@${esc(c.username)}</a>${c.online ? ' <i class="cv-on">online now</i>' : ''}</span>`;
      q('#cv-user').onclick = closeChatViewer;
      const chip = (t, cls = '') => `<span class="tag ${cls}">${esc(t)}</span>`;
      q('#cv-info').innerHTML = [chip(n.length + ' message' + (n.length === 1 ? '' : 's')), c.plan ? chip(c.plan + ' plan') : '', c.guest ? chip('Guest') : '', c.banned ? chip('Banned', 'bad') : '',
        c.model ? chip('Model: ' + c.model) : '', c.shared ? chip('Shared publicly', 'warn') : '', c.pinned ? chip('Pinned') : '', c.folder ? chip('Folder: ' + c.folder) : '',
        c.created_at ? chip('Started ' + new Date(c.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })) : '', c.updated_at ? chip('Last message ' + fmt.ago(c.updated_at)) : ''].join('');
    }
    async function load(cid, live) {
      try {
        const d = await api('/api/auth/admin/analytics/chat/' + cid + '/messages' + (live ? '?live=1' : ''));
        if (cvState !== st || st.id !== cid) return;
        const lastM = d.messages[d.messages.length - 1];
        const sig = d.messages.length + ':' + (lastM ? lastM.id + ':' + (lastM.content || '').length : '') + ':' + d.messages.filter((m) => m.rating).length;
        const changed = sig !== st.sig; st.data = d; st.sig = sig;
        drawHead(); if (!live || changed) { drawMessages(live); }
        if (!live || changed) drawChats();
        q('#cv-live').classList.remove('off');
        if (live && changed) { q('#cv-live').classList.add('new'); setTimeout(() => q('#cv-live') && q('#cv-live').classList.remove('new'), 1500); }
      } catch (e) {
        if (cvState !== st) return;
        if (!live) q('#cv-body').innerHTML = `<div class="empty"><b>Couldn't open this chat</b><br>${esc(e.message)}</div>`;
        else q('#cv-live').classList.add('off');
      }
    }
    q('#cv-chats').onclick = (e) => { const b = e.target.closest('[data-id]'); if (!b) return; st.id = +b.dataset.id; st.sig = ''; q('#cv-q').value = ''; el.classList.remove('side-open'); q('#cv-body').innerHTML = '<div class="empty">Loading chat…</div>'; load(st.id); };
    q('#cv-find-chat').oninput = () => st.data && drawChats();
    q('#cv-q').oninput = () => st.data && drawMessages(false);
    q('#cv-body').onclick = (e) => {
      const copy = (txt, b) => navigator.clipboard.writeText(txt).then(() => { const o = b.textContent; b.textContent = 'Copied'; setTimeout(() => { b.textContent = o; }, 1200); }, () => toast('Copy failed', true));
      const cc = e.target.closest('[data-copy-code]'); if (cc) return copy(cc.closest('.cv-code').querySelector('code').textContent, cc);
      const cm = e.target.closest('[data-copy-msg]'); if (cm) { const m = st.data.messages.find((x) => x.id === +cm.dataset.copyMsg); if (m) copy(m.content, cm); }
    };
    q('#cv-dl').onclick = () => {
      const d = st.data; if (!d) return;
      const txt = `${d.chat.title || 'Untitled chat'}\n@${d.chat.username} · chat #${d.chat.id}\n${'='.repeat(50)}\n\n` + d.messages.filter((m) => m.role !== 'system').map((m) => `[${m.at ? new Date(m.at).toLocaleString() : ''}] ${m.role === 'user' ? '@' + d.chat.username : 'Zelpophai'}:\n${m.content}\n`).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = `zelpophai_chat_${d.chat.id}_${d.chat.username}.txt`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    await load(id);
    st.timer = setInterval(() => { if (!document.hidden && cvState === st) load(st.id, true); }, 4000);
  }
  window.addEventListener('hashchange', closeChatViewer);
  // Downloads go through api() so the Vault token is sent (plain links would be refused).
  async function dl(url) {
    try {
      const r = await api(url);
      const blob = await r.blob();
      const name = (r.headers.get('Content-Disposition') || '').match(/filename="?([^";]+)"?/)?.[1] || url.split('/').pop();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name.replace(/^zenith_/, 'zelpophai_');
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      return true;
    } catch (e) { toast(e.message || 'Download failed', true); return false; }
  }

  async function pageChats() {
    let mode = 'chats', off = 0;
    $('view').innerHTML = `<div class="card fade"><div class="toolbar"><div class="chips" id="c-tabs"><button class="chip on" data-m="chats">Latest chats</button><button class="chip" data-m="messages">Latest messages</button></div><span class="muted small" id="c-total" style="margin-left:auto"></span></div>
      <p class="muted small" style="margin-top:-4px">Read conversations when you need to — e.g. to check a report. ${S.owner ? '' : 'Staff chats are hidden for admins.'}</p><div id="c-list"></div>
      <div class="pager"><span id="c-range"></span><span><button class="btn sm" id="c-prev">‹ Newer</button> <button class="btn sm" id="c-next">Older ›</button></span></div></div>`;
    const per = 40;
    const load = async () => {
      const d = await api(`/api/auth/admin/analytics/all-${mode}?limit=${per}&offset=${off}`);
      $('c-total').textContent = fmt.n(d.total) + (mode === 'chats' ? ' chats' : ' messages');
      if (mode === 'chats') {
        $('c-list').innerHTML = d.chats.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Chat</th><th>Person</th><th class="num">Messages</th><th class="hide-m">Last update</th></tr></thead><tbody>
          ${d.chats.map((c) => `<tr class="click" data-chat="${c.id}"><td><b>${esc(c.title || 'Untitled')}</b></td><td><a href="#/users/${c.user_id}" data-stop>@${esc(c.username)}</a></td><td class="num">${fmt.n(c.message_count)}</td><td class="hide-m muted">${esc(c.updated_at)}</td></tr>`).join('')}</tbody></table></div>` : empty('No chats yet');
      } else {
        $('c-list').innerHTML = d.messages.length ? `<div class="list">${d.messages.map((m) => `<div class="li click" data-chat="${m.chat_id}"><span class="tag ${m.role === 'user' ? 'pro' : ''}">${m.role === 'user' ? 'User' : 'AI'}</span><div class="grow small"><b>${esc(m.chat_title || 'Untitled')}</b><div class="muted" style="overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(m.content)}</div></div><span class="t">${esc(m.created_at)}</span></div>`).join('')}</div>` : empty('No messages yet');
      }
      $('c-range').textContent = d.total ? `${off + 1}–${Math.min(d.total, off + per)} of ${fmt.n(d.total)}` : '';
      $('c-prev').disabled = off <= 0; $('c-next').disabled = off + per >= d.total;
    };
    $('c-tabs').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; mode = b.dataset.m; off = 0; $('c-tabs').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); load(); };
    $('c-list').onclick = (e) => { if (e.target.closest('[data-stop]')) return; const r = e.target.closest('[data-chat]'); if (r) viewChat(+r.dataset.chat); };
    $('c-prev').onclick = () => { off = Math.max(0, off - per); load(); }; $('c-next').onclick = () => { off += per; load(); };
    await load();
  }

  /* ─────────────────────────────── security & emergency ─────────────────────────────── */
  function upFor(s) { const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60; return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; }
  function meter(label, pct, note) { const c = pct > 85 ? 'var(--bad)' : pct > 65 ? 'var(--warn)' : 'var(--good)'; return `<div class="bar-row"><span>${label}</span><div class="track"><div class="fill" style="width:${Math.min(100, pct)}%;background:${c}"></div></div><span class="num">${Math.round(pct)}%</span></div>${note ? `<div class="muted small" style="margin:-2px 0 8px">${note}</div>` : ''}`; }
  async function pageSecurity() {
    const d = await api('/api/vault/security');
    const sv = d.server;
    $('view').innerHTML = `<div class="grid g4">
        ${kpi('Sign-ins (24h)', fmt.n(d.logins_24h), undefined, '#34d399', null, { note: fmt.n(d.unique_ips_24h) + ' different places' })}
        ${kpi('Failed sign-ins (24h)', fmt.n(d.failed_24h), undefined, d.failed_24h > 20 ? '#f87171' : '#fbbf24', null, { note: d.failed_24h > 20 ? 'higher than usual — check below' : 'wrong passwords' })}
        ${kpi('Accounts', d.locked === 'on' ? 'Locked' : 'Open', undefined, d.locked === 'on' ? '#f87171' : '#34d399', null, { note: d.locked === 'on' ? 'everyone except you and helpers is locked out' : 'people can sign in normally' })}
        ${kpi('Server', sv ? upFor(sv.uptime_s) : '—', undefined, '#6d7cff', null, { note: sv ? 'running since the last deploy' : 'stats unavailable' })}
      </div>
      <div class="grid g21 mt">
        ${card('Sign-ins', '<div class="chart"><canvas id="ch-sec"></canvas></div>', '', 'last 7 days')}
        ${card('Server health', sv ? meter('CPU', sv.cpu) + meter('Memory', sv.ram, `${sv.ram_used_gb} of ${sv.ram_total_gb} GB · Zelpophai uses ${sv.app_ram_mb} MB`) + meter('Disk', sv.disk, `${sv.disk_free_gb} GB free`) : empty('No server stats'))}
      </div>
      <div class="card fade mt emergency"><div class="card-h"><h3>Emergency controls</h3><span class="sub">for when something goes badly wrong</span></div>
        <div class="em-grid">
          <div class="em"><b>${d.locked === 'on' ? 'Unlock every account' : 'Lock every account'}</b><span class="muted small">${d.locked === 'on' ? 'Let everyone sign in again.' : 'Instantly locks everyone out except you and your chosen helpers.'}</span><button class="btn ${d.locked === 'on' ? 'pri' : 'danger solid'}" id="em-lock">${d.locked === 'on' ? 'Unlock all' : 'Lock all'}</button></div>
          <div class="em"><b>Maintenance mode</b><span class="muted small">${d.maintenance === 'on' ? 'On — only staff can use Zelpophai.' : 'Show a maintenance screen to everyone but staff.'}</span><button class="btn ${d.maintenance === 'on' ? 'pri' : 'danger'}" id="em-maint">${d.maintenance === 'on' ? 'Turn off' : 'Turn on'}</button></div>
          <div class="em"><b>Emergency backup</b><span class="muted small">Download a copy of the whole database right now.</span><button class="btn" id="em-backup">Download backup</button></div>
          <div class="em"><b>My password leaked</b><span class="muted small">Gives you a new random password and signs out every other session.</span><button class="btn danger" id="em-pw">New password</button></div>
          <div class="em"><b>Sign everyone out</b><span class="muted small">Ends every session, including yours.</span><button class="btn danger" id="em-out">Sign out all</button></div>
        </div></div>
      <div class="grid g21 mt">
        ${card('Recent sign-ins', `<div class="list">${d.recent.map((l) => `<div class="li"><span class="ev-ic">${l.ok ? '🔑' : '⚠️'}</span><div class="grow small"><div><a href="#/users/${l.user_id}">@${esc(l.username)}</a> ${l.ok ? 'signed in' : '<b style="color:var(--bad)">wrong password</b>'}${l.ip ? ` · <span class="muted">${esc(l.ip)}</span>` : ''}</div><div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.ua)}</div></div><span class="t">${fmt.ago(l.t)}</span></div>`).join('') || empty('No sign-ins yet')}</div>`)}
        ${card('Most failed (24h)', `<div class="muted small" style="margin-bottom:6px">Accounts</div>${d.top_failed_users.map((x) => `<div class="li"><div class="grow small">@${esc(x.username)}</div><b>${x.count}</b></div>`).join('') || '<div class="muted small">None — all good.</div>'}
          <div class="muted small" style="margin:14px 0 6px">Places (IP)</div>${d.top_failed_ips.map((x) => `<div class="li"><div class="grow small"><code>${esc(x.ip)}</code></div><b>${x.count}</b></div>`).join('') || '<div class="muted small">None.</div>'}`)}
      </div>`;
    barChart('ch-sec', d.labels, 'day', [{ label: 'Signed in', data: d.ok_series, color: '#34d399' }, { label: 'Wrong password', data: d.failed_series, color: '#f87171' }], { stacked: true, legend: true });
    $('em-lock').onclick = async () => {
      const lockIt = d.locked !== 'on';
      if (lockIt && !(await confirmBox('Lock every account?', 'Everyone except you and your chosen helpers is signed out and can\'t sign in until you unlock.', 'Lock all', true))) return;
      try { const r = await api('/api/admin/system/' + (lockIt ? 'lock-all' : 'unlock-all'), { method: 'POST' }); toast(lockIt ? `Locked ${r.locked} accounts` : `Unlocked ${r.unlocked} accounts`); route(); } catch (e) { toast(e.message, true); }
    };
    $('em-maint').onclick = async () => {
      const on = d.maintenance !== 'on';
      if (on && !(await confirmBox('Turn on maintenance?', 'Everyone except staff sees the maintenance screen.', 'Turn on', true))) return;
      try { await api('/api/admin/system/maintenance', { method: 'POST', body: { value: on ? 'on' : 'off' } }); toast(on ? 'Maintenance on' : 'Maintenance off'); route(); } catch (e) { toast(e.message, true); }
    };
    $('em-backup').onclick = async () => {
      $('em-backup').disabled = true;
      try {
        const r = await api('/api/admin/system/backup', { method: 'POST' });
        const blob = await r.blob();
        const name = (r.headers.get('Content-Disposition') || '').match(/filename="?([^"]+)"?/)?.[1] || `zelpophai-emergency-${Date.now()}.db`;
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        toast('Backup downloaded');
      } catch (e) { toast(e.message, true); }
      $('em-backup').disabled = false;
    };
    $('em-pw').onclick = async () => {
      if (!(await confirmBox('Get a new owner password?', 'Your password changes to a new random one and every other session is signed out. Make sure nobody can see your screen — the new password is shown once.', 'Change it', true))) return;
      try {
        const r = await api('/api/auth/emergency-password', { method: 'POST' });
        modal(`<h3>Your new password</h3><p>Save it somewhere safe — it's shown only this once.</p><div class="secret"><code id="np">${esc(r.new_password)}</code></div>
          <div class="modal-actions"><button class="btn" id="np-copy">Copy</button><button class="btn pri" data-close>I saved it</button></div>`, () => {
          $('np-copy').onclick = () => navigator.clipboard.writeText(r.new_password).then(() => toast('Copied')).catch(() => toast('Copy failed', true));
        });
      } catch (e) { toast(e.message, true); }
    };
    $('em-out').onclick = async () => { if (!(await confirmBox('Sign everyone out?', 'All sessions end, including yours.', 'Sign out all', true))) return; try { await api('/api/admin/system/force-logout', { method: 'POST' }); toast('Everyone signed out'); } catch (e) { toast(e.message, true); } };
  }

  /* ─────────────────────────────── staff & permissions ─────────────────────────────── */
  /* The detailed permissions editor: #/staff/<id> */
  let permCatalog = null;
  async function pagePermissions(uid) {
    if (!S.owner) { location.hash = '#/overview'; return; }
    if (!permCatalog) permCatalog = await api('/api/auth/admin/permissions/catalog');
    const [info, staffList] = await Promise.all([api(`/api/auth/admin/users/${uid}/permissions`), api('/api/vault/staff')]);
    const u = staffList.staff.find((x) => x.id === uid);
    if (!u || u.role !== 'admin') { $('view').innerHTML = card('Not an admin', empty('This person isn\'t an admin', 'Permissions can only be set for admins.') + '<div style="text-align:center"><a class="btn" href="#/staff">Back to staff</a></div>'); return; }
    const C = permCatalog, all = C.groups.flatMap((g) => g.items);
    const orig = JSON.stringify({ p: info.permissions, l: info.limits, u: info.until, n: info.note });
    const st = { p: { ...info.permissions }, l: { ...info.limits }, u: info.until, n: info.note || '' };
    const others = staffList.staff.filter((x) => x.role === 'admin' && x.id !== uid);
    const LIM = { bans: ['Bans', 'How many people they can ban in one day.'], resets: ['Password resets', 'How many passwords they can reset in one day.'],
      deletes: ['Deleted accounts', 'How many accounts they can delete in one day.'], broadcasts: ['Broadcasts', 'How many broadcasts they can send in one day.'] };
    const dateVal = (iso) => iso ? new Date(iso).toISOString().slice(0, 10) : '';
    $('view').innerHTML = `<div class="pe fade">
      <div class="pe-top"><a class="btn sm" href="#/staff">← Staff</a><div class="grow">${person(u, 'Admin' + (info.trusted ? ' · Trusted' : ''))}</div><span class="tag" id="pe-count"></span></div>
      ${info.trusted ? `<div class="pe-note warn"><b>This is a Trusted admin.</b> Trusted admins can do everything on this page with no limits, whatever the switches say. Remove “Trusted” on the Staff page if you want the switches below to apply.</div>` : ''}
      ${card('Quick setups', `<p class="muted small" style="margin-top:-6px">Pick a starting point, then fine-tune below. Nothing is saved until you press Save.</p>
        <div class="pe-presets" id="pe-presets">${C.presets.map((p) => `<button class="pe-preset" data-preset="${p.id}"><b>${esc(p.label)}</b><span>${esc(p.about)}</span></button>`).join('')}</div>
        <div class="pe-row"><button class="btn sm" id="pe-allon">Switch everything on</button><button class="btn sm" id="pe-alloff">Switch everything off</button><button class="btn sm" id="pe-default">Back to the usual setup</button>
          ${others.length ? `<select class="select" id="pe-copy" style="width:auto"><option value="">Copy from another admin…</option>${others.map((o) => `<option value="${o.id}">@${esc(o.username)}</option>`).join('')}</select>` : ''}</div>`)}
      <div class="pe-groups">${C.groups.map((g, gi) => card(g.name, `<p class="muted small" style="margin-top:-6px">${esc(g.about)}</p>
        ${g.items.map((it) => `<div class="ctrl pe-item"><div class="grow"><b>${esc(it.label)}${it.sensitive ? ' <span class="tag warn">Sensitive</span>' : ''}</b><span class="muted small">${esc(it.about)}</span></div><button class="switch" data-perm="${it.key}" role="switch" aria-label="${esc(it.label)}"></button></div>`).join('')}`,
        `<button class="btn sm" data-grp="${gi}">All on</button>`)).join('')}</div>
      <div class="grid g2 mt">
        ${card('Daily limits', `<p class="muted small" style="margin-top:-6px">A safety net in case an account is misused. Leave a box empty for no limit. Limits reset at midnight (UTC).</p>
          ${C.limits.map((l) => `<div class="ctrl pe-lim" data-needs="${l.needs}"><div class="grow"><b>${LIM[l.key][0]} per day</b><span class="muted small">${LIM[l.key][1]} Used today: <b>${(info.used || {})[l.key] || 0}</b></span></div><input class="input" type="number" min="0" max="100000" inputmode="numeric" placeholder="No limit" data-lim="${l.key}" style="width:110px"></div>`).join('')}`)}
        ${card('How long they stay an admin', `<p class="muted small" style="margin-top:-6px">Set an end date and they go back to a normal account by themselves on that day. Leave empty to keep them as admin until you remove them.</p>
          <div class="pe-row"><input class="input" type="date" id="pe-until" style="width:180px" min="${new Date(Date.now() + 864e5).toISOString().slice(0, 10)}">
            <button class="btn sm" data-days="7">1 week</button><button class="btn sm" data-days="30">1 month</button><button class="btn sm" data-days="90">3 months</button><button class="btn sm" data-days="0">No end date</button></div>
          <div class="muted small" id="pe-until-say" style="margin-top:8px"></div>
          <label class="muted small" style="display:block;margin-top:16px">Private note (only you see this)</label>
          <textarea class="input" id="pe-note" rows="3" maxlength="500" placeholder="e.g. Helps with support on weekends"></textarea>`)}
      </div>
      <div class="pe-save" id="pe-save-bar"><span id="pe-state">No changes</span><button class="btn" id="pe-undo">Undo changes</button><button class="btn pri" id="pe-save">Save permissions</button></div>
    </div>`;
    const V = $('view');
    function paint() {
      V.querySelectorAll('[data-perm]').forEach((b) => { const on = !!st.p[b.dataset.perm]; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
      const on = all.filter((i) => st.p[i.key]).length;
      $('pe-count').textContent = `${on} of ${all.length} switched on`;
      C.groups.forEach((g, gi) => { const allOn = g.items.every((i) => st.p[i.key]); const b = V.querySelector(`[data-grp="${gi}"]`); b.textContent = allOn ? 'All off' : 'All on'; });
      V.querySelectorAll('[data-preset]').forEach((b) => { const p = C.presets.find((x) => x.id === b.dataset.preset); b.classList.toggle('on', all.every((i) => !!st.p[i.key] === !!p.permissions[i.key])); });
      V.querySelectorAll('.pe-lim').forEach((r) => { const off = !st.p[r.dataset.needs]; r.classList.toggle('off', off); r.querySelector('input').disabled = off; });
      V.querySelectorAll('[data-lim]').forEach((i) => { if (document.activeElement !== i) i.value = st.l[i.dataset.lim] ? st.l[i.dataset.lim] : ''; });
      if (document.activeElement !== $('pe-until')) $('pe-until').value = dateVal(st.u);
      $('pe-until-say').textContent = st.u ? `They stop being an admin on ${new Date(st.u).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.` : 'No end date — they stay an admin until you remove them.';
      if (document.activeElement !== $('pe-note')) $('pe-note').value = st.n;
      const dirty = JSON.stringify({ p: st.p, l: st.l, u: st.u, n: st.n }) !== orig;
      $('pe-state').textContent = dirty ? 'You have changes that aren\'t saved yet' : 'No changes';
      $('pe-save-bar').classList.toggle('dirty', dirty); $('pe-save').disabled = !dirty; $('pe-undo').disabled = !dirty;
    }
    const setAll = (v) => { all.forEach((i) => { st.p[i.key] = v; }); paint(); };
    V.onclick = async (e) => {
      const sw = e.target.closest('[data-perm]'); if (sw) { st.p[sw.dataset.perm] = !st.p[sw.dataset.perm]; return paint(); }
      const row = e.target.closest('.pe-item'); if (row && !e.target.closest('button,a')) { const k = row.querySelector('[data-perm]').dataset.perm; st.p[k] = !st.p[k]; return paint(); }
      const g = e.target.closest('[data-grp]'); if (g) { const items = C.groups[+g.dataset.grp].items; const v = !items.every((i) => st.p[i.key]); items.forEach((i) => { st.p[i.key] = v; }); return paint(); }
      const pr = e.target.closest('[data-preset]'); if (pr) { st.p = { ...C.presets.find((x) => x.id === pr.dataset.preset).permissions }; return paint(); }
      const dy = e.target.closest('[data-days]'); if (dy) { const n = +dy.dataset.days; st.u = n ? new Date(Date.now() + n * 864e5).toISOString() : null; return paint(); }
    };
    $('pe-allon').onclick = () => setAll(true); $('pe-alloff').onclick = () => setAll(false);
    $('pe-default').onclick = () => { all.forEach((i) => { st.p[i.key] = i.default; }); paint(); };
    if ($('pe-copy')) $('pe-copy').onchange = async (e) => {
      const id = +e.target.value; if (!id) return;
      try { const o = await api(`/api/auth/admin/users/${id}/permissions`); st.p = { ...o.permissions }; st.l = { ...o.limits }; toast('Copied — press Save to keep it'); paint(); } catch (err) { toast(err.message, true); }
      e.target.value = '';
    };
    V.querySelectorAll('[data-lim]').forEach((i) => i.oninput = () => { st.l[i.dataset.lim] = Math.max(0, Math.min(100000, parseInt(i.value, 10) || 0)); paint(); });
    $('pe-until').onchange = () => { const v = $('pe-until').value; st.u = v ? new Date(v + 'T23:59:00').toISOString() : null; paint(); };
    $('pe-note').oninput = () => { st.n = $('pe-note').value; paint(); };
    $('pe-undo').onclick = () => { const o = JSON.parse(orig); st.p = o.p; st.l = o.l; st.u = o.u; st.n = o.n; paint(); };
    $('pe-save').onclick = async () => {
      const risky = all.filter((i) => i.sensitive && st.p[i.key] && !info.permissions[i.key]).map((i) => i.label);
      if (risky.length && !(await confirmBox('Switch on sensitive abilities?', `You're giving @${u.username}: ${risky.join(', ')}.`, 'Yes, save'))) return;
      $('pe-save').disabled = true;
      try { await api(`/api/auth/admin/users/${uid}/permissions`, { method: 'POST', body: { permissions: st.p, limits: st.l, until: st.u, note: st.n } }); toast('Permissions saved'); route(); }
      catch (e) { toast(e.message, true); $('pe-save').disabled = false; }
    };
    paint();
  }
  function permSummary(u) {
    const p = u.perm || {};
    const bits = [`${p.on} of ${p.total} on`];
    const lim = Object.entries(p.limits || {}).filter(([, v]) => v).length; if (lim) bits.push(lim + ' daily limit' + (lim === 1 ? '' : 's'));
    if (p.until) bits.push('until ' + new Date(p.until).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
    return bits.join(' · ');
  }
  async function pageStaff() {
    const d = await api('/api/vault/staff');
    $('view').innerHTML = `<div class="grid g21">
      ${card('Staff', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Role</th><th class="hide-m">Allowed</th><th></th></tr></thead><tbody>
        ${d.staff.map((u) => `<tr data-u="${u.id}"><td><a href="#/users/${u.id}" style="color:inherit">${person(u)}</a></td><td>${planTag({ ...u, plan: '' })}</td><td class="hide-m muted small">${u.role === 'owner' ? 'Everything' : (u.tags.includes('trusted') ? 'Everything (trusted)' : esc(permSummary(u)))}</td>
          <td class="bk-act">${u.role === 'admin' ? `<button class="btn sm pri" data-a="perms">Edit permissions</button> <button class="btn sm" data-a="trusted">${u.tags.includes('trusted') ? 'Untrust' : 'Trust'}</button> <button class="btn sm danger" data-a="demote">Remove</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`,
        '<button class="btn pri sm" id="st-add">Add an admin</button>')}
      ${card('Chosen helpers', `<p class="muted small" style="margin-top:-6px">Helpers stay online and keep access during maintenance or when every account is locked, so they can help you.</p>
        <div class="list" id="ch-list">${d.chosen.map((u) => `<div class="li" data-id="${u.id}">${person(u)}<button class="btn sm danger" style="margin-left:auto" data-rm="${u.id}">Remove</button></div>`).join('') || '<div class="muted small">No helpers chosen.</div>'}</div>
        <div style="margin-top:12px;display:flex;gap:8px"><button class="btn sm" id="ch-add">Add helper</button>${d.chosen.length ? '<button class="btn sm danger" id="ch-clear">Clear all</button>' : ''}</div>`)}
    </div>`;
    const ids = d.chosen.map((u) => u.id);
    const saveChosen = async (list) => { try { await api('/api/admin/system/set-chosen', { method: 'POST', body: { user_ids: list } }); toast('Helpers saved'); route(); } catch (e) { toast(e.message, true); } };
    $('ch-add').onclick = () => pickUser('Add a chosen helper', 'They keep access during shutdowns.', (id) => { if (!ids.includes(id)) saveChosen([...ids, id]); });
    $('ch-list').onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) saveChosen(ids.filter((x) => x !== +b.dataset.rm)); };
    if ($('ch-clear')) $('ch-clear').onclick = async () => { if (await confirmBox('Remove all helpers?', 'Nobody keeps special access during shutdowns.', 'Remove all', true)) saveChosen([]); };
    $('st-add').onclick = () => pickUser('Add an admin', 'They\'ll be able to open the Vault with their own PIN.', async (id, name) => {
      if (!(await confirmBox(`Make ${name} an admin?`, 'They can open the Vault and manage users (you can limit what they do with Permissions).', 'Make admin'))) return;
      try { await api(`/api/auth/admin/users/${id}/role`, { method: 'POST', body: { role: 'admin' } }); toast('Admin added'); route(); } catch (e) { toast(e.message, true); }
    });
    $('view').querySelector('tbody').onclick = async (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const u = d.staff.find((x) => x.id === +b.closest('tr').dataset.u);
      try {
        if (b.dataset.a === 'perms') location.hash = '#/staff/' + u.id;
        else if (b.dataset.a === 'trusted') { await api(`/api/auth/admin/users/${u.id}/tags`, { method: 'POST', body: { tag: 'trusted', on: !u.tags.includes('trusted') } }); toast('Saved'); route(); }
        else if (b.dataset.a === 'demote') { if (!(await confirmBox(`Remove @${u.username} as admin?`, 'They become a normal user and lose Vault access.', 'Remove', true))) return; await api(`/api/auth/admin/users/${u.id}/role`, { method: 'POST', body: { role: 'user' } }); toast('Removed'); route(); }
      } catch (err) { toast(err.message, true); }
    };
  }

  /* ─────────────────────────────── settings & exports ─────────────────────────────── */
  let setTab = 'vault';
  async function pageSettings() {
    const canExport = S.owner || S.can.export_data !== false;
    const TABS = [['vault', 'My Vault', 'Your PIN, how the Vault looks and when it locks.'], ['site', 'Site setup', 'Email, paid plans and Google sign-in for Zelpophai.'],
      ['data', 'Data & exports', 'Download information as files.'], ['about', 'About', 'Version and useful links.']];
    if (!TABS.some((t) => t[0] === setTab)) setTab = 'vault';
    const row = (title, about, control) => `<div class="ctrl"><div class="grow"><b>${title}</b>${about ? `<span class="muted small">${about}</span>` : ''}</div>${control || ''}</div>`;
    const seg = (id, opts, val) => `<div class="vs-seg" id="${id}">${opts.map(([v, l]) => `<button type="button" class="${String(v) === String(val) ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
    $('view').innerHTML = `<div class="vs fade"><nav class="vs-nav" id="vs-nav">${TABS.map(([k, l, d]) => `<button type="button" data-t="${k}" class="${k === setTab ? 'on' : ''}"><b>${l}</b><span>${d}</span></button>`).join('')}</nav><div class="vs-pane" id="vs-pane"></div></div>`;
    $('vs-nav').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; setTab = b.dataset.t; $('vs-nav').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); draw(); };
    const pane = $('vs-pane');

    const TAB = {
      async vault() {
        const theme = store.get('zv_theme', '') || 'dark', lockMin = +store.get('zv_lock_min', 15) || 15;
        const notif = 'Notification' in window ? Notification.permission : 'unsupported';
        let access = '';
        if (!S.owner && S.access) {
          await loadAccess(); const A = S.access, L = A.labels || {};
          const yes = Object.keys(L).filter((k) => A.can[k]), no = Object.keys(L).filter((k) => !A.can[k]);
          const lim = Object.entries(A.limits || {}).filter(([, v]) => v), LN = { bans: 'bans', resets: 'password resets', deletes: 'deleted accounts', broadcasts: 'broadcasts' };
          access = card('What I\'m allowed to do', `<p class="muted small" style="margin-top:-6px">${A.trusted ? 'You\'re a Trusted admin, so you can do everything below.' : 'Set by the Owner. Ask them if you need something switched on.'}${A.until ? ` Your admin role ends on <b>${new Date(A.until).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</b>.` : ''}</p>
            <div class="chips">${yes.map((k) => `<span class="tag good">✓ ${esc(L[k])}</span>`).join('')}${no.map((k) => `<span class="tag">✕ ${esc(L[k])}</span>`).join('')}</div>
            ${lim.length ? `<div class="muted small" style="margin-top:12px">Today: ${lim.map(([k, v]) => `<b>${(A.used || {})[k] || 0} of ${v}</b> ${LN[k]}`).join(' · ')}</div>` : ''}`);
        }
        pane.innerHTML = card('Look and behaviour', row('Theme', 'How the Vault looks on this device.', seg('se-theme', [['light', 'Light'], ['dark', 'Dark']], theme))
            + row('Lock when I\'m away', 'The Vault asks for your PIN again after this long without activity, and whenever you close the tab.', seg('se-lockmin', [[2, '2 min'], [5, '5 min'], [15, '15 min']], lockMin))
            + row('Starting time range', 'The range charts open with.', seg('se-range', [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days']], S.range))
            + row(`Desktop alerts <span class="tag ${notif === 'granted' ? 'good' : notif === 'denied' ? 'warn' : ''}">${notif === 'granted' ? 'On' : notif === 'denied' ? 'Blocked' : notif === 'unsupported' ? 'Not available' : 'Off'}</span>`,
              notif === 'denied' ? 'Blocked in this browser. Tap the lock icon next to the web address, find Notifications and choose Allow.' : 'Get a notification for new alerts while the Vault is open.',
              notif === 'default' ? '<button class="btn sm pri" id="se-notif">Turn on</button>' : (notif === 'granted' ? '<button class="btn sm" id="se-notif-test">Send a test</button>' : ''))
            + row('Lock now', 'Hide everything until your PIN is typed again.', '<button class="btn sm" id="se-lock">Lock the Vault</button>'))
          + `<div class="mt">${card('Change my Vault PIN', `<p class="muted small" style="margin-top:-6px">4 to 6 digits. You need your current PIN and your account password.</p>
            <div class="vs-form"><div><label class="muted small" for="pc-old">Current PIN</label><input class="input" id="pc-old" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>
            <div><label class="muted small" for="pc-new">New PIN</label><input class="input" id="pc-new" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>
            <div><label class="muted small" for="pc-pw">Account password</label><input class="input" id="pc-pw" type="password" autocomplete="current-password"></div></div>
            <div class="vs-foot"><span class="muted small" id="pc-msg" role="alert"></span><button class="btn pri" id="pc-go">Change PIN</button></div>`)}</div>`
          + (access ? `<div class="mt">${access}</div>` : '');
        $('se-theme').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b || b.dataset.v === document.documentElement.dataset.theme) return; document.documentElement.dataset.theme = b.dataset.v; store.set('zv_theme', b.dataset.v); route(); };
        $('se-lockmin').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; store.set('zv_lock_min', +b.dataset.v); $('se-lockmin').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); toast('Saved'); };
        $('se-range').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; S.range = b.dataset.v; store.set('zv_range', S.range); $('se-range').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); document.querySelectorAll('#ranges button').forEach((x) => x.classList.toggle('on', x.dataset.r === S.range)); toast('Saved'); };
        if ($('se-notif')) $('se-notif').onclick = async () => { try { await Notification.requestPermission(); } catch (e) {} draw(); };
        if ($('se-notif-test')) $('se-notif-test').onclick = () => { try { new Notification('Zelpophai Vault', { body: 'Desktop alerts are working.' }); } catch (e) { toast('Couldn\'t show a notification here', true); } };
        $('se-lock').onclick = () => lock();
        $('pc-go').onclick = async () => {
          const old_pin = $('pc-old').value.trim(), new_pin = $('pc-new').value.trim(), password = $('pc-pw').value, msg = $('pc-msg');
          msg.textContent = !old_pin ? 'Type your current PIN.' : !/^\d{4,6}$/.test(new_pin) ? 'The new PIN must be 4 to 6 digits.' : !password ? 'Type your account password.' : '';
          if (msg.textContent) return;
          $('pc-go').disabled = true;
          try { await api('/api/auth/admin/pin-change', { method: 'POST', body: { old_pin, new_pin, password } }); toast('PIN changed'); ['pc-old', 'pc-new', 'pc-pw'].forEach((i) => { $(i).value = ''; }); } catch (e) { msg.textContent = e.message; }
          $('pc-go').disabled = false;
        };
      },
      async site() {
        pane.innerHTML = '<div class="card skeleton" style="height:220px"></div>';
        let em; try { em = await api('/api/vault/email'); } catch (e) { pane.innerHTML = card('Site setup', empty('Couldn\'t load this', e.message)); return; }
        if (setTab !== 'site') return;
        const status = (ok, on, off) => `<span class="tag ${ok ? 'good' : 'warn'}">${ok ? on : off}</span>`;
        pane.innerHTML = `<div class="vs-status">
            <div><span class="muted small">Email sending</span><b>${em.configured ? 'Working' : 'Not set up'}</b>${status(em.configured, 'On', 'Off')}</div>
            <div><span class="muted small">Paid plans</span><b>${em.billing_live ? 'On sale' : 'Coming soon'}</b>${status(em.billing_live, 'Live', 'Soon')}</div>
            <div><span class="muted small">Google sign-in</span><b>${em.google_signin ? 'Shown' : 'Hidden'}</b>${status(em.google_signin, 'On', 'Off')}</div></div>
          <div class="mt">${card('Email', `<p class="muted small" style="margin-top:-6px">${em.configured ? `Working through ${esc(em.provider)}${em.sender ? ' · from ' + esc(em.sender) : ''}. New emails are confirmed with a 6-digit code.` : 'Not set up. Emails are still checked (real provider, not a throw-away address) but no code is sent, and “Forgot password” emails can\'t arrive.'}</p>
            <div class="vs-nums"><div><b>${fmt.n(em.verified)}</b><span>confirmed by code</span></div><div><b>${fmt.n(em.checked)}</b><span>checked</span></div><div><b>${fmt.n(em.missing)}</b><span>still need one</span></div></div>
            ${em.missing ? `<p class="muted small" style="margin:12px 0 6px">People without an email have ${em.grace_days} days from their first reminder:</p><div class="chips">${em.missing_users.map((u) => `<a class="chip" href="#/users/${u.id}">@${esc(u.username)}</a>`).join('')}</div>` : ''}
            ${S.owner ? (em.configured ? `<div style="display:flex;gap:8px;margin-top:14px"><input class="input" id="em-to" placeholder="Send a test email to…" type="email" aria-label="Test email address"><button class="btn" id="em-test">Send test</button></div>`
              : `<details class="vs-how"><summary>How to switch it on (about 10 minutes, free)</summary><ol><li>Make a free account at <b>brevo.com</b> (300 emails a day free).</li><li>In Brevo, open <b>Senders</b> and confirm the email address your messages should come from.</li><li>Open <b>SMTP &amp; API → API keys</b> and create a key.</li><li>In Railway, open your Zelpophai service → <b>Variables</b> and add <code>BREVO_API_KEY</code> (the key) and <code>SMTP_FROM</code> (the address you confirmed).</li><li>Railway restarts by itself. Come back here and send a test email.</li></ol></details>`) : ''}`)}</div>
          <div class="mt">${card('Paid plans', `<p class="muted small" style="margin-top:-6px">${em.billing_live ? 'People can buy Pro and Ultimate through Stripe.' : 'Nobody can buy or switch on a plan by themselves. The Upgrade screen shows the plans with “Coming soon”. You can still gift plans from a person\'s profile, and invite rewards still work.'}</p>
            <div class="vs-nums"><div><b>${fmt.n(em.plan_interest)}</b><span>${em.plan_interest === 1 ? 'person asked' : 'people asked'} to be told</span></div></div>
            ${em.plan_interest_users.length ? `<div class="list" style="margin-top:10px">${em.plan_interest_users.map((w) => `<div class="li"><div class="grow small"><a href="#/users/${w.id}">@${esc(w.username)}</a>${w.plan ? ` <span class="tag ${w.plan === 'ultimate' ? 'ultimate' : 'pro'}">${w.plan === 'ultimate' ? 'Ultimate' : 'Pro'}</span>` : ''}</div><span class="t">${fmt.ago(w.t)}</span></div>`).join('')}</div>` : '<p class="muted small" style="margin-top:10px">When someone taps “Tell me” on the Upgrade screen they appear here.</p>'}
            ${S.owner && !em.billing_live ? '<details class="vs-how"><summary>How to open sales later</summary><ol><li>Finish setting up your Stripe account so it can take real payments.</li><li>In Railway → Variables, put in your live Stripe keys and prices.</li><li>Add <code>BILLING_LIVE=1</code>. Railway restarts and the Upgrade screen starts selling.</li></ol></details>' : ''}`)}</div>
          ${S.owner ? `<div class="mt">${card('Sign in with Google', row('Show the Google button', em.google_signin ? 'The button is shown on the login, welcome and invite pages.' : 'Hidden. Google currently refuses the button on this site (“origin not allowed”), so keep it hidden until you finish the steps below.', `<button class="switch${em.google_signin ? ' on' : ''}" id="g-toggle" role="switch" aria-checked="${!!em.google_signin}" aria-label="Show the Google sign-in button"></button>`)
            + `<details class="vs-how"${em.google_signin ? '' : ' open'}><summary>How to make it work (about 5 minutes, in your Google account)</summary>
              <ol><li>Open <b>console.cloud.google.com</b> and sign in with the Google account that created Zelpophai's sign-in.</li><li>Choose the Zelpophai project, then <b>APIs &amp; Services → Credentials</b>.</li><li>Under <b>OAuth 2.0 Client IDs</b>, open the one whose ID starts with <code>1035003334215-veih…</code></li><li>Under <b>Authorised JavaScript origins</b> click <b>Add URI</b> and paste exactly: <code>${esc(em.site_origin)}</code> <button class="btn sm" id="g-copy">Copy</button><br>(no slash at the end, and it must start with https)</li><li>Press <b>Save</b>. Google can take from 5 minutes up to a few hours to apply it.</li><li>Come back, switch the button on above, and try signing in from a private window.</li></ol>
              <p class="small muted">If you can't find that project, the sign-in was made under a different Google account.</p></details>`)}</div>` : ''}`;
        if ($('g-toggle')) $('g-toggle').onclick = async () => { try { await api('/api/vault/google-signin', { method: 'POST', body: { on: !em.google_signin } }); toast(em.google_signin ? 'Google button hidden' : 'Google button shown'); draw(); } catch (e) { toast(e.message, true); } };
        if ($('g-copy')) $('g-copy').onclick = () => navigator.clipboard.writeText(em.site_origin).then(() => toast('Copied')).catch(() => toast('Copy failed', true));
        if ($('em-test')) $('em-test').onclick = async () => { const to = $('em-to').value.trim(); if (!to) return toast('Type an email address', true); $('em-test').disabled = true; try { await api('/api/vault/email/test', { method: 'POST', body: { to } }); toast('Test email sent — check the inbox'); } catch (e) { toast(e.message, true); } $('em-test').disabled = false; };
      },
      async data() {
        pane.innerHTML = card('Export data', canExport ? `<p class="muted small" style="margin-top:-6px">Download everything as files you can open on your computer. These contain private information, so keep them safe.</p>`
            + row('All users', 'A spreadsheet (CSV) with every account.', '<button class="btn sm" data-dl="users">Download</button>')
            + row('All chats', 'A text file listing every chat.', '<button class="btn sm" data-dl="chats">Download</button>')
            + row('All messages', 'A text file with every message.', '<button class="btn sm" data-dl="messages">Download</button>')
            + row('One person\'s data', 'Open them in Users, then choose Export data.', '<a class="btn sm" href="#/users">Go to Users</a>')
            : empty('Downloads are switched off for you', 'Ask the Owner to switch on “Download data” in your permissions.'))
          + (S.owner ? `<div class="mt">${card('Backups', row('Database backups', 'Make a backup, download one, or restore.', '<a class="btn sm" href="#/backups">Open Backups</a>') + row('Activity log', 'Who did what in the Vault.', '<a class="btn sm" href="#/logs">Open log</a>'))}</div>` : '');
        pane.querySelectorAll('[data-dl]').forEach((b) => b.onclick = async () => { b.disabled = true; const o = b.textContent; b.textContent = 'Preparing…'; if (await dl('/api/auth/admin/analytics/export/' + b.dataset.dl)) toast('Downloaded'); b.disabled = false; b.textContent = o; });
      },
      async about() {
        let v = {}; try { v = await (await fetch('/api/version')).json(); } catch (e) {}
        if (setTab !== 'about') return;
        pane.innerHTML = card('Zelpophai', row('Version', `You're running version <b>${esc(v.version || '?')}</b>.`, '<a class="btn sm" href="/whats-new" target="_blank" rel="noopener">What\'s new</a>')
            + row('Site address', esc(location.origin), '<a class="btn sm" href="/" target="_blank" rel="noopener">Open site</a>')
            + row('Signed in as', `@${esc(S.me.username)} · ${S.owner ? 'Owner' : ((S.me.tags || '').includes('trusted') ? 'Trusted admin' : 'Admin')}`, '<a class="btn sm" href="/app">Back to Zelpophai</a>'))
          + `<div class="mt">${card('Shortcuts', `<div class="vs-keys"><span><kbd>Ctrl</kbd><kbd>K</kbd> Search or jump to a page</span><span><kbd>Esc</kbd> Close a window</span></div>`)}</div>`;
      },
    };
    async function draw() { try { await TAB[setTab](); } catch (e) { pane.innerHTML = card('Something went wrong', empty('Couldn\'t load this', e.message)); } }
    await draw();
  }

  /* ─────────────────────────────── feedback ─────────────────────────────── */
  const FB_KIND = { bug: ['Bug', 'bad'], idea: ['Idea', 'warn'], praise: ['Praise', 'ultimate'], problem: ['Problem', 'warn'], request: ['Personal request', 'pro'], pulse: ['Quick rating', ''], other: ['Feedback', ''] };
  const FB_STATUS = { new: ['New', 'bad'], seen: ['Seen', ''], in_progress: ['In progress', 'pro'], planned: ['Planned', 'ultimate'], done: ['Done', 'good'], declined: ['Not planned', ''] };
  const fbKind = (k) => `<span class="tag ${(FB_KIND[k] || FB_KIND.other)[1]}">${(FB_KIND[k] || FB_KIND.other)[0]}</span>`;
  const fbStatus = (st) => `<span class="tag ${(FB_STATUS[st] || ['', ''])[1]}">${(FB_STATUS[st] || [st])[0]}</span>`;
  const starsHtml = (n) => n ? `<span class="stars" title="${n} out of 5">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>` : '';
  const FB_TABS = [['', 'Inbox'], ['ideas', 'Ideas board'], ['answers', 'Answer ratings'], ['summary', 'AI summary']];
  const fbTabs = (cur, counts) => `<div class="chips fb-tabs">${FB_TABS.map(([k, l]) => `<a class="chip${k === cur ? ' on' : ''}" href="#/feedback${k ? '/' + k : ''}">${l}${k === '' && counts && counts.unread ? ` <span class="dotn">${counts.unread}</span>` : ''}${k === 'ideas' && counts && counts.review ? ` <span class="dotn">${counts.review}</span>` : ''}</a>`).join('')}</div>`;

  async function pageFeedback(arg) {
    if (arg && /^\d+$/.test(arg)) { $('page-title').textContent = 'Feedback'; $('crumb').textContent = 'Feedback'; return fbThread(+arg); }
    if (arg === 'ideas') return fbIdeas();
    if (arg === 'answers') return fbAnswers();
    if (arg === 'summary') return fbSummary();
    const st = { status: 'open', kind: '', q: '', page: 1 };
    const first = await api('/api/vault/feedback?status=open');
    const k = first.kpis;
    $('view').innerHTML = `<div class="grid g4">
        ${kpi('Waiting for you', fmt.n(k.unread), undefined, k.unread ? '#f87171' : '#34d399', null, { note: fmt.n(k.open) + ' open in total' })}
        ${kpi('Star rating (30d)', k.avg_rating != null ? k.avg_rating.toFixed(1) + ' / 5' : '—', undefined, '#fbbf24', null, { note: k.ratings ? `from ${fmt.n(k.ratings)} rating${k.ratings > 1 ? 's' : ''}` : 'no ratings yet' })}
        ${kpi('Good answers (30d)', k.satisfaction != null ? k.satisfaction + '%' : '—', undefined, '#34d399', null, { note: `${fmt.n(k.answers_up)} 👍 · ${fmt.n(k.answers_down)} 👎` })}
        ${kpi('Your reply time', k.first_reply_hours != null ? (k.first_reply_hours < 1 ? Math.max(1, Math.round(k.first_reply_hours * 60)) + ' min' : k.first_reply_hours + ' h') : '—', undefined, '#6d7cff', null, { note: 'typical time to first reply' })}
      </div>
      <div class="card fade mt">${fbTabs('', first.counts)}
        <div class="toolbar" style="margin-top:12px"><input class="input" id="fb-q" placeholder="Search feedback or a name…" autocomplete="off">
          <select class="select" id="fb-kind" style="width:auto"><option value="">All types</option>${Object.entries(first.kinds).map(([kk, l]) => `<option value="${kk}">${esc(l)}</option>`).join('')}</select>
          <span class="muted small" id="fb-total" style="margin-left:auto"></span></div>
        <div class="chips" id="fb-status" style="margin-bottom:12px"></div>
        <div id="fb-list"></div>
        <div class="pager"><span id="fb-range"></span><span><button class="btn sm" id="fb-prev">‹ Prev</button> <button class="btn sm" id="fb-next">Next ›</button></span></div></div>`;
    const draw = (d) => {
      const SC = [['open', 'Open'], ['unread', 'Needs reply'], ['in_progress', 'In progress'], ['planned', 'Planned'], ['done', 'Done'], ['declined', 'Not planned'], ['all', 'Everything']];
      $('fb-status').innerHTML = SC.map(([kk, l]) => `<button class="chip${kk === st.status ? ' on' : ''}" data-s="${kk}">${l} <span class="muted">${d.counts[kk] || 0}</span></button>`).join('');
      $('fb-total').textContent = fmt.n(d.total) + (d.total === 1 ? ' item' : ' items');
      $('fb-list').innerHTML = d.tickets.length ? `<div class="list">${d.tickets.map((t) => `<a class="li click fb-row${t.unread ? ' unread' : ''}" href="#/feedback/${t.id}">
          <span class="fb-dot"></span><div class="grow"><div class="fb-row-top">${fbKind(t.kind)}<b>${esc(t.title || t.content.slice(0, 90) || 'Rating only')}</b>${starsHtml(t.rating)}</div>
          <div class="muted small fb-ex">${t.title && t.content ? esc(t.content.slice(0, 160)) + ' · ' : ''}@${esc(t.guest ? 'guest' : t.username)}${t.context ? ' · ' + esc(t.context) : ''}${t.has_screenshot ? ' · 📎 screenshot' : ''}${t.public ? ` · on the board · ${t.votes} vote${t.votes === 1 ? '' : 's'}` : ''}</div></div>
          ${fbStatus(t.status)}<span class="t">${fmt.ago(t.updated_at)}</span></a>`).join('')}</div>` : empty(st.status === 'open' ? 'Inbox zero 🎉' : 'Nothing here', st.status === 'open' ? 'Nothing is waiting. New feedback shows up here.' : 'Try another filter.');
      const a = (st.page - 1) * d.per + 1, b = Math.min(d.total, st.page * d.per);
      $('fb-range').textContent = d.total ? `${a}–${b} of ${fmt.n(d.total)}` : '';
      $('fb-prev').disabled = st.page <= 1; $('fb-next').disabled = b >= d.total;
      setBadge('feedback', d.kpis.unread);
    };
    const load = async () => draw(await api(`/api/vault/feedback?status=${st.status}&kind=${st.kind}&q=${encodeURIComponent(st.q)}&page=${st.page}`));
    draw(first);
    let qt;
    $('fb-q').oninput = () => { clearTimeout(qt); qt = setTimeout(() => { st.q = $('fb-q').value.trim(); st.page = 1; load(); }, 250); };
    $('fb-kind').onchange = () => { st.kind = $('fb-kind').value; st.page = 1; load(); };
    $('fb-status').onclick = (e) => { const b = e.target.closest('[data-s]'); if (!b) return; st.status = b.dataset.s; st.page = 1; load(); };
    $('fb-prev').onclick = () => { st.page--; load(); }; $('fb-next').onclick = () => { st.page++; load(); };
    S.timers.push(setInterval(() => { if (!document.hidden && !$('fb-q').value) load(); }, 30000));
  }

  async function fbThread(id) {
    const d = await api('/api/vault/feedback/' + id);
    const t = d.ticket;
    const QUICK = ['Thanks for telling us — we\'re looking into it.', 'Fixed! Please refresh and try again.', 'Great idea — it\'s on our list.', 'Could you tell us a bit more? What did you do just before it happened?', 'Thank you, that means a lot!'];
    $('view').innerHTML = `<div class="grid g21">
      <div class="card fade">
        <div class="fb-head"><a class="btn sm" href="#/feedback">‹ Inbox</a><div class="grow"></div>${fbKind(t.kind)}${fbStatus(t.status)}</div>
        <h2 class="fb-title">${esc(t.title || (t.content.length > 70 ? t.content.slice(0, 68) + '…' : t.content) || (FB_KIND[t.kind] || FB_KIND.other)[0])}</h2>
        <div class="muted small">from <a href="#/users/${t.user_id}">@${esc(t.username)}</a>${t.guest ? ' (guest)' : ''} · ${fmt.dt(t.created_at)}${t.context ? ' · ' + esc(t.context) : ''}${t.source === 'legacy' ? ' · from the old inbox' : t.source === 'pulse' ? ' · answered "How is Zelpophai so far?"' : ''}</div>
        <div class="chat-view fb-msgs" id="fb-msgs">
          <div class="msg"><div class="who">@${esc(t.username)} <span>${fmt.ago(t.created_at)}</span></div><div class="txt">${t.content ? esc(t.content) : '<em class="muted">(no text)</em>'}</div>${starsHtml(t.rating)}
            ${t.has_screenshot ? `<a href="/api/feedback/shot/${t.id}" target="_blank" rel="noopener"><img class="fb-shot" src="/api/feedback/shot/${t.id}" alt="Screenshot from the user" loading="lazy"></a>` : ''}</div>
          ${d.messages.map((m) => m.system ? `<div class="fb-sys"><span>${esc(m.content)} — ${esc(m.author)}</span></div>` : `<div class="msg ${m.staff ? 'me' : ''}"><div class="who">${m.staff ? esc(m.author || m.label) + (m.role === 'owner' ? ' (Owner)' : ' (Admin)') : '@' + esc(m.author)} <span>${fmt.ago(m.t)}</span></div><div class="txt">${esc(m.content)}</div></div>`).join('')}
        </div>
        <div class="fb-reply"><div class="chips" id="fb-quick">${QUICK.map((q, i) => `<button class="chip" data-q="${i}">${esc(q.length > 34 ? q.slice(0, 32) + '…' : q)}</button>`).join('')}</div>
          <textarea class="input" id="fb-text" rows="3" maxlength="4000" placeholder="Write a reply — they get a notification in the app…"></textarea>
          <div class="fb-reply-row"><label class="muted small">Then mark as <select class="select" id="fb-after" style="width:auto;display:inline-block;margin-left:6px"><option value="">(leave as is)</option>${Object.entries(d.statuses).filter(([kk]) => kk !== 'new').map(([kk, l]) => `<option value="${kk}">${esc(l)}</option>`).join('')}</select></label>
            <button class="btn pri" id="fb-send">Send reply</button></div></div>
      </div>
      <div>
        ${card('Status', `<div class="fb-statuses" id="fb-st">${Object.entries(d.statuses).filter(([kk]) => kk !== 'new').map(([kk, l]) => `<button class="chip${t.status === kk ? ' on' : ''}" data-s="${kk}">${esc(l)}</button>`).join('')}</div>
          <p class="muted small" style="margin:10px 0 0">Changing it tells the person (except "Seen").</p>`)}
        ${card('Details', `<dl class="kv"><dt>Type</dt><dd><select class="select" id="fb-kind-set" style="width:auto">${Object.entries(d.kinds).filter(([kk]) => kk !== 'pulse' || t.kind === 'pulse').map(([kk, l]) => `<option value="${kk}"${kk === t.kind ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></dd>
          <dt>Person</dt><dd><a href="#/users/${t.user_id}">@${esc(t.username)}</a>${d.author.other_tickets ? ` <span class="muted small">· ${d.author.other_tickets} other</span>` : ''}</dd>
          <dt>Rating</dt><dd>${t.rating ? starsHtml(t.rating) : '—'}</dd>
          <dt>First reply</dt><dd>${t.first_reply_at ? fmt.dt(t.first_reply_at) : 'not yet'}</dd></dl>`).replace('class="card fade"', 'class="card fade mt"')}
        ${t.kind === 'idea' ? card('Ideas board', `<div class="ctrl" style="padding-top:0"><div class="grow"><b>Show on the board</b><span class="muted small">${t.wants_public ? (t.public ? `Public · ${t.votes} vote${t.votes === 1 ? '' : 's'}${t.anonymous ? ' · name hidden' : ''}` : 'Hidden from other people.') : 'The author chose to keep it private.'}</span></div><button class="switch${t.public ? ' on' : ''}" id="fb-pub" ${t.wants_public ? '' : 'disabled'} aria-label="Show on the ideas board"></button></div>
          <label class="muted small" style="display:block;margin:10px 0 6px">Title on the board</label><input class="input" id="fb-title-in" maxlength="140" value="${esc(t.title)}">
          <label class="muted small" style="display:block;margin:10px 0 6px">Official answer (everyone sees it)</label><textarea class="input" id="fb-official" rows="3" maxlength="1500" placeholder="e.g. Coming in December!">${esc(t.public_reply)}</textarea>
          <div style="text-align:right;margin-top:8px"><button class="btn sm" id="fb-save-board">Save</button></div>`).replace('class="card fade"', 'class="card fade mt"') : ''}
        <button class="btn danger wide mt" id="fb-del">Delete this feedback</button>
      </div></div>`;
    const box = $('fb-msgs'); box.scrollTop = box.scrollHeight;
    const upd = async (body, msg) => { try { await api(`/api/vault/feedback/${id}/update`, { method: 'POST', body }); toast(msg || 'Saved'); fbThread(id); } catch (e) { toast(e.message, true); } };
    $('fb-quick').onclick = (e) => { const b = e.target.closest('[data-q]'); if (b) { $('fb-text').value = QUICK[+b.dataset.q]; $('fb-text').focus(); } };
    const send = async () => {
      const v = $('fb-text').value.trim(); if (!v) return toast('Write a reply first', true);
      $('fb-send').disabled = true;
      try { await api(`/api/vault/feedback/${id}/reply`, { method: 'POST', body: { content: v, status: $('fb-after').value } }); toast('Reply sent'); fbThread(id); } catch (e) { toast(e.message, true); $('fb-send').disabled = false; }
    };
    $('fb-send').onclick = send;
    $('fb-text').onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); };
    $('fb-st').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b && b.dataset.s !== t.status) upd({ status: b.dataset.s }, 'Status changed'); };
    $('fb-kind-set').onchange = () => upd({ kind: $('fb-kind-set').value }, 'Type changed');
    if ($('fb-pub')) $('fb-pub').onclick = () => upd({ public: !t.public }, t.public ? 'Hidden from the board' : 'Now on the ideas board');
    if ($('fb-save-board')) $('fb-save-board').onclick = () => upd({ title: $('fb-title-in').value, public_reply: $('fb-official').value });
    $('fb-del').onclick = async () => { if (!(await confirmBox('Delete this feedback?', 'It is removed for you and for the person who sent it, with all replies.', 'Delete', true))) return; try { await api('/api/vault/feedback/' + id, { method: 'DELETE' }); toast('Deleted'); location.hash = '#/feedback'; } catch (e) { toast(e.message, true); } };
  }

  async function fbIdeas() {
    let mode = 'all';
    const load = async () => {
      const d = await api(`/api/vault/feedback?kind=idea&status=${mode === 'review' ? 'review' : 'all'}&sort=votes&per=100`);
      $('view').innerHTML = `<div class="card fade">${fbTabs('ideas', d.counts)}
        <div class="ctrl"><div class="grow"><b>Check ideas before they go public</b><span class="muted small">Off: ideas appear on the board straight away (anything the safety filter catches still waits). On: nothing appears until you approve it.</span></div><button class="switch${d.ideas_review ? ' on' : ''}" id="fb-review" aria-label="Review ideas first"></button></div>
        <div class="chips" id="fb-im" style="margin:12px 0"><button class="chip${mode === 'all' ? ' on' : ''}" data-m="all">All ideas <span class="muted">${d.counts.all || 0}</span></button><button class="chip${mode === 'review' ? ' on' : ''}" data-m="review">Waiting for approval <span class="muted">${d.counts.review || 0}</span></button></div>
        ${d.tickets.length ? `<div class="list">${d.tickets.map((t) => `<div class="li fb-idea" data-id="${t.id}"><div class="fb-votes"><b>${t.votes}</b><span>vote${t.votes === 1 ? '' : 's'}</span></div>
          <div class="grow"><a href="#/feedback/${t.id}" style="color:inherit"><b>${esc(t.title || t.content.slice(0, 80))}</b></a> ${fbStatus(t.status)}${t.public ? '<span class="tag good">Public</span>' : t.wants_public ? '<span class="tag warn">Hidden</span>' : '<span class="tag">Private</span>'}
            <div class="muted small fb-ex">${esc(t.content.slice(0, 200))} · @${esc(t.username)} · ${fmt.ago(t.created_at)}</div>${t.public_reply ? `<div class="small" style="margin-top:4px">↳ ${esc(t.public_reply)}</div>` : ''}</div>
          <div class="bk-act">${t.wants_public ? `<button class="btn sm" data-a="pub">${t.public ? 'Hide' : 'Publish'}</button> ` : ''}<select class="select fb-set" data-a="status" style="width:auto;display:inline-block">${Object.entries(d.statuses).map(([kk, l]) => `<option value="${kk}"${kk === t.status ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>`).join('')}</div>`
          : empty(mode === 'review' ? 'Nothing waiting for approval' : 'No ideas yet', 'Ideas people share from the app appear here.')}</div>`;
      $('fb-review').onclick = async () => { try { await api('/api/vault/feedback/settings', { method: 'POST', body: { ideas_review: !d.ideas_review } }); toast('Saved'); load(); } catch (e) { toast(e.message, true); } };
      $('fb-im').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) { mode = b.dataset.m; load(); } };
      $('view').querySelectorAll('.fb-idea').forEach((row) => {
        const t = d.tickets.find((x) => x.id === +row.dataset.id);
        const pb = row.querySelector('[data-a="pub"]');
        if (pb) pb.onclick = async () => { try { await api(`/api/vault/feedback/${t.id}/update`, { method: 'POST', body: { public: !t.public } }); toast(t.public ? 'Hidden' : 'Published'); load(); } catch (e) { toast(e.message, true); } };
        row.querySelector('[data-a="status"]').onchange = async (e) => { try { await api(`/api/vault/feedback/${t.id}/update`, { method: 'POST', body: { status: e.target.value } }); toast('Status changed'); load(); } catch (err) { toast(err.message, true); } };
      });
    };
    await load();
  }

  async function fbAnswers() {
    const d = await api('/api/vault/feedback/insights?range=' + S.range);
    const total = d.up_total + d.down_total;
    $('view').innerHTML = `<div class="grid g4">
        ${kpi('Good answers', d.satisfaction != null ? d.satisfaction + '%' : '—', undefined, '#34d399', null, { note: total ? `of ${fmt.n(total)} rated answers` : 'nobody has rated an answer yet' })}
        ${kpi('Thumbs up', fmt.n(d.up_total), undefined, '#34d399', null, { note: 'this period' })}
        ${kpi('Thumbs down', fmt.n(d.down_total), undefined, '#f87171', null, { note: 'this period' })}
        ${kpi('Top complaint', d.reasons.length ? esc(d.reasons[0].label) : '—', undefined, '#fbbf24', null, { note: d.reasons.length ? d.reasons[0].count + ' times' : 'no thumbs down' })}
      </div>
      <div class="card fade mt">${fbTabs('answers')}</div>
      <div class="grid g21 mt">
        ${card('Answer ratings over time', '<div class="chart"><canvas id="ch-fb-ans"></canvas></div>', '', 'thumbs under AI answers')}
        ${card('Why thumbs down', d.reasons.length ? d.reasons.map((r) => `<div class="bar-row"><span>${esc(r.label)}</span><div class="track"><div class="fill" style="width:${Math.round(r.count / d.reasons[0].count * 100)}%;background:#f87171"></div></div><span class="num">${r.count}</span></div>`).join('') : empty('No thumbs down', 'Reasons people give appear here.'))}
      </div>
      <div class="grid g21 mt">
        ${card('Feedback and star ratings', '<div class="chart"><canvas id="ch-fb-stars"></canvas></div>', '', 'feedback sent per day, with the average star rating')}
        ${card('Stars given', d.star_dist.some(Boolean) ? [5, 4, 3, 2, 1].map((n) => `<div class="bar-row" style="grid-template-columns:82px 1fr 40px"><span class="stars">${'★'.repeat(n)}</span><div class="track"><div class="fill" style="width:${Math.round(d.star_dist[n - 1] / Math.max(...d.star_dist) * 100)}%;background:#fbbf24"></div></div><span class="num">${d.star_dist[n - 1]}</span></div>`).join('') : empty('No star ratings yet'))}
      </div>
      ${card('Latest thumbs down', d.recent_down.length ? d.recent_down.map((r) => `<div class="flag warn"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="tag bad">${esc(r.reason_label)}</span><a href="#/users/${r.user_id}">@${esc(r.username)}</a><span class="muted small">in “${esc(r.chat_title || 'a chat')}” · ${fmt.ago(r.t)}</span></div>
          ${r.comment ? `<div class="ex">“${esc(r.comment)}”</div>` : ''}
          ${r.question || r.answer ? `<div class="fb-qa"><div><span class="muted small">They asked</span>${esc(r.question || '—')}</div><div><span class="muted small">Zelpophai answered</span>${esc(r.answer)}${r.answer.length >= 500 ? '…' : ''}</div></div>` : '<div class="muted small">Staff chat — hidden.</div>'}
          <button class="btn sm" data-chat="${r.chat_id}">Open the chat</button></div>`).join('') : empty('No thumbs down in this period', 'When someone marks an answer as bad you can read it here.'), '', 'the question, the answer, and what they said').replace('class="card fade"', 'class="card fade mt"')}`;
    lineChart('ch-fb-ans', d.labels, 'day', [{ label: 'Thumbs up', data: d.up, color: '#34d399' }, { label: 'Thumbs down', data: d.down, color: '#f87171' }], { legend: true });
    barChart('ch-fb-stars', d.labels, 'day', [{ label: 'Feedback sent', data: d.sent, color: '#6d7cff' }]);
    $('view').querySelectorAll('[data-chat]').forEach((b) => b.onclick = () => viewChat(+b.dataset.chat));
  }

  async function fbSummary() {
    const d = await api('/api/vault/feedback/summary');
    const MOOD = { good: ['😊', 'good'], bad: ['😟', 'bad'], mixed: ['😐', 'warn'] };
    const s = d.summary;
    const listCard = (title, items, icon) => items && items.length ? card(title, `<ul class="fb-ul">${items.map((x) => `<li><span>${icon}</span>${esc(x)}</li>`).join('')}</ul>`) : '';
    $('view').innerHTML = `<div class="card fade">${fbTabs('summary')}
        <div class="fb-sum-head"><div class="grow">${s ? `<h2 class="fb-title" style="margin-top:14px">${esc(s.headline)}</h2><div class="muted small">From ${fmt.n(s.items)} pieces of feedback and ${fmt.n(s.up + s.down)} answer ratings in the last ${s.days} days · written ${fmt.ago(s.made_at)} by AI</div>`
          : '<h2 class="fb-title" style="margin-top:14px">What are people saying?</h2><div class="muted small">Let the AI read the recent feedback and answer ratings and sum them up for you.</div>'}</div>
          <div class="fb-sum-act"><select class="select" id="fs-days" style="width:auto"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select><button class="btn pri" id="fs-go">${s ? 'Write a new one' : 'Write summary'}</button></div></div></div>
      ${s ? `${s.themes.length ? `<div class="grid g3 mt">${s.themes.map((th) => `<div class="card fade"><div class="fb-theme"><span class="fb-mood">${(MOOD[th.mood] || MOOD.mixed)[0]}</span><b>${esc(th.title)}</b>${th.count ? `<span class="tag ${(MOOD[th.mood] || MOOD.mixed)[1]}">${th.count}×</span>` : ''}</div><p class="muted" style="margin:8px 0 0;font-size:13.5px;line-height:1.5">${esc(th.detail)}</p></div>`).join('')}</div>` : ''}
        <div class="grid g2 mt">${listCard('Fix first', s.problems, '🔧')}${listCard('Most wanted', s.ideas, '💡')}${listCard('What people like', s.praise, '💜')}${listCard('Suggested next steps', s.next_steps, '➡️')}</div>
        <p class="muted small mt">The summary is written by AI from the feedback text, so check the Inbox before acting on something important.</p>` : ''}`;
    if (s) $('fs-days').value = String(s.days);
    $('fs-go').onclick = async () => {
      const b = $('fs-go'); b.disabled = true; b.textContent = 'Reading feedback…';
      try { await api('/api/vault/feedback/summary?days=' + $('fs-days').value, { method: 'POST' }); toast('Summary ready'); fbSummary(); } catch (e) { toast(e.message, true); b.disabled = false; b.textContent = s ? 'Write a new one' : 'Write summary'; }
    };
  }

  /* ─────────────────────────────── command palette ─────────────────────────────── */
  const ACTIONS = [
    { t: 'Turn maintenance on', ic: '🛠️', run: async () => { if (await confirmBox('Turn on maintenance?', 'Everyone except staff sees the maintenance screen.', 'Turn on', true)) { await api('/api/admin/system/maintenance', { method: 'POST', body: { value: 'on' } }); toast('Maintenance on'); } } },
    { t: 'Turn maintenance off', ic: '✅', run: async () => { await api('/api/admin/system/maintenance', { method: 'POST', body: { value: 'off' } }); toast('Maintenance off'); } },
    { t: 'Send a broadcast', ic: '📣', run: () => { location.hash = '#/controls'; setTimeout(() => $('b-text') && $('b-text').focus(), 400); } },
    { t: 'Back up the database now', ic: '💾', owner: true, run: async () => { const r = await api('/api/vault/backups', { method: 'POST' }); toast('Backup made: ' + fmt.size(r.size)); } },
    { t: 'Check alerts now', ic: '🔔', run: async () => { await api('/api/vault/alerts/check', { method: 'POST' }); refreshAlerts(); toast('Checked'); } },
    { t: 'Switch light / dark', ic: '🌓', run: () => toggleTheme() },
    { t: 'Lock the Vault', ic: '🔒', run: () => lock() },
    { t: 'Lock every account (emergency)', ic: '🚨', owner: true, run: () => { location.hash = '#/security'; } },
    { t: 'Change my Vault PIN', ic: '🔑', run: () => { location.hash = '#/settings'; } },
    { t: 'Export all users (CSV)', ic: '⬇️', run: () => dl('/api/auth/admin/analytics/export/users') },
  ];
  let kSel = 0, kItems = [];
  function openK() {
    $('cmdk').hidden = false; $('cmdk-in').value = ''; drawK(''); setTimeout(() => $('cmdk-in').focus(), 20);
  }
  function closeK() { $('cmdk').hidden = true; }
  let kTimer;
  async function drawK(q) {
    const ql = q.toLowerCase();
    const pages = PAGES.filter((p) => (!p.owner || S.owner) && p.label.toLowerCase().includes(ql)).map((p) => ({ sec: 'Pages', t: p.label, ic: '📄', go: '#/' + p.id }));
    const acts = ACTIONS.filter((a) => (!a.owner || S.owner) && a.t.toLowerCase().includes(ql)).map((a) => ({ sec: 'Actions', t: a.t, ic: a.ic, run: a.run }));
    kItems = [...pages, ...acts];
    render();
    clearTimeout(kTimer);
    if (q.length >= 2) kTimer = setTimeout(async () => {
      try {
        const d = await api('/api/vault/search?q=' + encodeURIComponent(q));
        const users = d.users.map((u) => ({ sec: 'People', t: (u.display_name || u.username) + ' (@' + u.username + ')', ic: '👤', go: '#/users/' + u.id, sub: u.plan }));
        kItems = [...users, ...pages, ...acts]; kSel = 0; render();
      } catch (e) {}
    }, 160);
    function render() {
      kSel = Math.min(kSel, Math.max(0, kItems.length - 1));
      let sec = '';
      $('cmdk-list').innerHTML = kItems.length ? kItems.map((it, i) => { const h = it.sec !== sec ? `<div class="sec">${esc(it.sec)}</div>` : ''; sec = it.sec; return h + `<div class="it${i === kSel ? ' on' : ''}" data-i="${i}"><span class="ico">${it.ic}</span>${esc(it.t)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>`; }).join('') : '<div class="empty">No results</div>';
    }
  }
  function pickK(i) { const it = kItems[i]; if (!it) return; closeK(); if (it.go) location.hash = it.go; else if (it.run) Promise.resolve(it.run()).catch((e) => toast(e.message, true)); }

  /* ─────────────────────────────── boot ─────────────────────────────── */
  function toggleTheme() {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t; store.set('zv_theme', t);
    route();
  }
  async function boot() {
    if (!window.Chart) console.warn('Chart.js did not load');
    try {
      const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!r.ok) { location.href = '/?login=1'; return; }
      S.me = (await r.json()).user;
    } catch (e) { location.href = '/?login=1'; return; }
    if (!['owner', 'admin'].includes(S.me.role) && !S.me.is_admin) { location.href = '/app'; return; }
    S.owner = S.me.role === 'owner';
    $('who-role').textContent = S.owner ? 'Owner' : ((S.me.tags || '').includes('trusted') ? 'Trusted admin' : 'Admin');
    if (!token()) await lock();
    else {
      const ok = await fetch('/api/auth/admin/pin-unlock', { method: 'POST', credentials: 'same-origin', headers: { 'X-Vault-Token': token() } }).then((r) => r.ok).catch(() => false);
      if (!ok) await lock();
    }
    await loadAccess();
    renderNav();
    document.querySelectorAll('#ranges button').forEach((b) => b.classList.toggle('on', b.dataset.r === S.range));
    $('ranges').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.range = b.dataset.r; store.set('zv_range', S.range); document.querySelectorAll('#ranges button').forEach((x) => x.classList.toggle('on', x === b)); route(); };
    $('theme').onclick = toggleTheme;
    $('lock').onclick = async () => { await lock(); route(); };
    $('menu').onclick = () => { $('side').classList.add('open'); $('scrim').classList.add('on'); };
    $('side-close').onclick = $('scrim').onclick = () => { $('side').classList.remove('open'); $('scrim').classList.remove('on'); };
    $('bell').onclick = async () => { const p = $('alerts-panel'); p.hidden = !p.hidden; if (!p.hidden) renderAlertsInto($('alerts-list'), false); };
    $('alerts-panel').querySelector('[data-close]').onclick = () => { $('alerts-panel').hidden = true; };
    $('ack-all').onclick = async () => { await api('/api/vault/alerts/ack-all', { method: 'POST' }); renderAlertsInto($('alerts-list'), false); refreshAlerts(); };
    $('open-k').onclick = openK;
    $('cmdk').onclick = (e) => { if (e.target === $('cmdk')) closeK(); const it = e.target.closest('.it'); if (it) pickK(+it.dataset.i); };
    $('cmdk-in').oninput = () => { kSel = 0; drawK($('cmdk-in').value.trim()); };
    $('cmdk-in').onkeydown = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); kSel = Math.min(kItems.length - 1, kSel + 1); $('cmdk-list').querySelectorAll('.it').forEach((x, i) => x.classList.toggle('on', i === kSel)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); kSel = Math.max(0, kSel - 1); $('cmdk-list').querySelectorAll('.it').forEach((x, i) => x.classList.toggle('on', i === kSel)); }
      else if (e.key === 'Enter') { e.preventDefault(); pickK(kSel); }
    };
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('cmdk').hidden ? openK() : closeK(); }
      else if (e.key === 'Escape') { if (!$('cmdk').hidden) closeK(); else if (!$('modal').hidden) $('modal').hidden = true; else if (!$('alerts-panel').hidden) $('alerts-panel').hidden = true; }
      else if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openK(); }
    });
    window.addEventListener('hashchange', route);
    // keep the unlock alive while you're here; lock after 15 minutes away
    let lastAct = Date.now();
    ['click', 'keydown', 'mousemove', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true }));
    setInterval(async () => {
      if (!$('lockscreen').hidden) return;
      if (Date.now() - lastAct > (+store.get('zv_lock_min', 15) || 15) * 60 * 1000) { await lock(); route(); }
    }, 30000);
    setInterval(refreshTop, 60000);
    await route();
    refreshTop();
  }
  boot();
})();
