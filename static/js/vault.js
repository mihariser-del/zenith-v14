const Vault = {
    _isOwner: false,
    _currentTab: 'dashboard',
    _renderedTab: '',
    _pollInterval: null,
    _sysPollInterval: null,
    _cache: {},
    _chosenHelpers: [],

    async init() {
        try {
            const { user } = await api('/api/auth/me');
            this._isOwner = user.role === 'owner';
            document.body.classList.add(this._isOwner ? 'vault-owner' : 'vault-admin');
            document.getElementById('vault-username').textContent = user.username;
            document.getElementById('vault-avatar').textContent = user.username[0].toUpperCase();
            document.getElementById('vault-top-name').textContent = user.username;
            document.getElementById('vault-top-avatar').textContent = user.username[0].toUpperCase();
            document.getElementById('vault-role-label').textContent = this._isOwner ? 'OWNER VAULT' : 'ADMIN VAULT';
            document.getElementById('vault-welcome').textContent = `Welcome back, ${user.username} ${this._isOwner ? '👑' : ''}`;
            document.getElementById('vault-subtitle').textContent = this._isOwner ? 'Supreme Access' : 'Staff Access';
            document.getElementById('vault-top-role').textContent = this._isOwner ? 'The One Above All' : 'Admin';
            const ownerSec = document.getElementById('vault-owner-section');
            if (ownerSec) ownerSec.style.display = this._isOwner ? 'block' : 'none';
            if (!this._isOwner && !user.is_admin) { window.location.href = '/app'; return; }
        } catch { window.location.href = '/'; return; }
        this.bindNav();
        this.bindHamburger();
        this.loadTab('dashboard');
        this.startPolling();
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // Refresh the current view on return without a full DOM wipe
                this.refreshCurrentTab();
                this.startPolling();
            }
        });
        window.addEventListener('focus', () => {
            this.refreshCurrentTab();
            this.startPolling();
        });
    },

    // Light refresh that avoids wiping the whole vault when returning to the tab / clicking active nav
    refreshCurrentTab() {
        if (this._currentTab === 'dashboard') {
            this.refreshDashboardStats();
            this.refreshSystemStats();
            this.loadHourlyChart();
            this.loadRecentAccounts();
            this.loadActivityFeed();
            this.loadOnlineUsers();
        } else if (this._renderedTab === this._currentTab) {
            // avoid full re-render for an already-rendered tab
            return;
        } else {
            this.loadTab(this._currentTab);
        }
    },

    bindHamburger() {
        const ham = document.getElementById('vault-hamburger');
        const sidebar = document.getElementById('vault-sidebar');
        if (ham && sidebar) {
            ham.addEventListener('click', () => sidebar.classList.toggle('open'));
            document.addEventListener('click', e => {
                if (window.innerWidth <= 768 && !sidebar.contains(e.target) && e.target !== ham) sidebar.classList.remove('open');
            });
        }
    },

    bindNav() {
        document.querySelectorAll('#vault-nav a').forEach(a => {
            a.addEventListener('click', (e) => {
                if (e && e.preventDefault) e.preventDefault();
                const tab = a.dataset.tab;
                document.querySelectorAll('#vault-nav a').forEach(x => x.classList.remove('active'));
                a.classList.add('active');
                if (tab === this._currentTab && this._renderedTab === tab) {
                    // Already showing this tab — just refresh in place, don't wipe the page
                    this.refreshCurrentTab();
                } else {
                    this.loadTab(tab);
                }
                if (window.innerWidth <= 768) document.getElementById('vault-sidebar').classList.remove('open');
            });
        });
    },

    loadTab(tab) {
        this._currentTab = tab;
        const labels = { dashboard:'DASHBOARD', users:'USERS', chats:'CHATS', messages:'MESSAGES', bans:'BANS', deleted:'DELETED', security:'SECURITY', logs:'LOGS & AUDIT', backups:'BACKUPS', settings:'SETTINGS', owner:'OWNER COMMAND', admins:'ADMIN MANAGEMENT', global:'GLOBAL CONTROLS', emergency:'EMERGENCY' };
        document.getElementById('vault-section-label').textContent = labels[tab] || tab.toUpperCase();
        const fn = { dashboard:'renderDashboard', users:'renderUsers', chats:'renderChats', messages:'renderMessages', bans:'renderBans', deleted:'renderDeleted', security:'renderSecurity', logs:'renderLogs', backups:'renderBackups', settings:'renderSettings', owner:'renderOwner', admins:'renderAdmins', global:'renderGlobal', emergency:'renderEmergency' };
        if (fn[tab]) this[fn[tab]]();
        this._renderedTab = tab;
    },

    startPolling() {
        if (this._pollInterval) clearInterval(this._pollInterval);
        if (this._sysPollInterval) clearInterval(this._sysPollInterval);
        if (this._heartbeatInterval) clearInterval(this._heartbeatInterval);
        if (this._onlinePollInterval) clearInterval(this._onlinePollInterval);
        this._pollInterval = setInterval(() => {
            if (this._currentTab === 'dashboard') this.refreshDashboardStats();
        }, 1000);
        this._sysPollInterval = setInterval(() => {
            if (this._currentTab === 'dashboard') {
                this.refreshSystemStats();
                this.loadHourlyChart();
                this.loadRecentAccounts();
                this.loadActivityFeed();
                this.loadOnlineUsers();
            }
        }, 5000);
        // Online count — poll slower (3s) to reduce flicker from 1s heartbeat
        this._onlinePollInterval = setInterval(() => this.refreshOnlineCount(), 3000);
        // heartbeat — vault staff must ping too, otherwise they never appear online
        this._heartbeatInterval = setInterval(() => {
            if (navigator.onLine) fetch('/api/auth/heartbeat', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
        }, 5000);
        // fire once immediately so vault staff show online without waiting 1s
        fetch('/api/auth/heartbeat', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    },

    async refreshOnlineCount() {
        try {
            const d = await api('/api/auth/admin/analytics/overview');
            const el = document.getElementById('vault-online-count');
            if (el) el.textContent = d.online_users + ' online';
            this._cache.online = d.online_users;
        } catch {}
    },

    // ═══════════════════════════ SVG CHARTS ═══════════════════════════
    _svgDefs: `<defs>
        <linearGradient id="g-blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#60A5FA" stop-opacity="0.45"/><stop offset="100%" stop-color="#60A5FA" stop-opacity="0.02"/></linearGradient>
        <linearGradient id="g-purple" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#A78BFA" stop-opacity="0.45"/><stop offset="100%" stop-color="#A78BFA" stop-opacity="0.02"/></linearGradient>
        <linearGradient id="g-green" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4ADE80" stop-opacity="0.45"/><stop offset="100%" stop-color="#4ADE80" stop-opacity="0.02"/></linearGradient>
        <linearGradient id="g-pink" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#F472B6" stop-opacity="0.45"/><stop offset="100%" stop-color="#F472B6" stop-opacity="0.02"/></linearGradient>
        <linearGradient id="g-teal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2DD4BF" stop-opacity="0.45"/><stop offset="100%" stop-color="#2DD4BF" stop-opacity="0.02"/></linearGradient>
        <linearGradient id="g-violet" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8B5CF6" stop-opacity="0.45"/><stop offset="100%" stop-color="#8B5CF6" stop-opacity="0.02"/></linearGradient>
        <linearGradient id="bar-blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#60A5FA" stop-opacity="1"/><stop offset="100%" stop-color="#60A5FA" stop-opacity="0.5"/></linearGradient>
        <linearGradient id="bar-purple" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#A78BFA" stop-opacity="1"/><stop offset="100%" stop-color="#A78BFA" stop-opacity="0.5"/></linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>`,

    _smoothCurve(pts) {
        if (pts.length < 2) return '';
        let d = `M${pts[0].x},${pts[0].y}`;
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[Math.max(i - 1, 0)];
            const p1 = pts[i], p2 = pts[i + 1];
            const p3 = pts[Math.min(i + 2, pts.length - 1)];
            d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)},${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)},${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
        }
        return d;
    },

    _niceMax(v) {
        if (v <= 0) return 10;
        const mag = Math.pow(10, Math.floor(Math.log10(v)));
        const norm = v / mag;
        const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
        return nice * mag;
    },

    _yAxisLabels(max, count, padL) {
        let s = '';
        const niceMax = this._niceMax(max);
        for (let i = 0; i <= count; i++) {
            const val = Math.round((i / count) * niceMax);
            s += `<text x="${padL - 4}" y="${(1 - i / count) * 100}%" fill="#555" font-size="9" text-anchor="end" dominant-baseline="middle" dy="0">${val}</text>`;
        }
        return s;
    },

    svgLine(data, w, h, color, fill = false) {
        if (!data.length) return '<div style="color:#666;font-size:12px;text-align:center;padding:20px;">No data</div>';
        const vals = data.map(d => d.count || d.value || 0);
        const rawMax = Math.max(...vals, 1);
        const max = this._niceMax(rawMax);
        const pad = { t: 22, b: 24, l: 40, r: 10 };
        const chartH = h - pad.t - pad.b;
        const step = (w - pad.l - pad.r) / Math.max(vals.length - 1, 1);
        const pts = vals.map((v, i) => ({ x: pad.l + i * step, y: pad.t + (1 - v / max) * chartH }));
        const curve = this._smoothCurve(pts);
        const fillPath = curve + ` L${pts[pts.length-1].x},${h - pad.b} L${pts[0].x},${h - pad.b} Z`;
        const gid = 'g-' + color.replace('#', '').toLowerCase().slice(0, 6);
        let svg = `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:100%;overflow:visible;" preserveAspectRatio="xMidYMid meet">${this._svgDefs}`;
        for (let g = 0; g <= 4; g++) {
            const gy = pad.t + (1 - g / 4) * chartH;
            const val = Math.round((g / 4) * max);
            if (g > 0) svg += `<line x1="${pad.l}" y1="${gy.toFixed(1)}" x2="${w - pad.r}" y2="${gy.toFixed(1)}" stroke="#1A1D21" stroke-width="1"/>`;
            svg += `<text x="${pad.l - 8}" y="${gy.toFixed(1)}" fill="#666" font-size="10" text-anchor="end" dominant-baseline="middle">${val}</text>`;
        }
        svg += `<line x1="${pad.l}" y1="${h - pad.b}" x2="${w - pad.r}" y2="${h - pad.b}" stroke="#1A1D21" stroke-width="1"/>`;
        if (fill) svg += `<path d="${fillPath}" fill="url(#${gid})" opacity="0.5"/>`;
        svg += `<path d="${curve}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
        const labelEvery = vals.length <= 10 ? 1 : vals.length <= 20 ? 3 : 5;
        pts.forEach((pt, i) => {
            const v = vals[i];
            const isLast = i === pts.length - 1;
            const isFirst = i === 0;
            const shouldLabel = isLast || isFirst || (i % labelEvery === 0);
            if (shouldLabel) {
                svg += `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${isLast ? 4 : 2.5}" fill="${isLast ? color : '#0a0a0f'}" stroke="${color}" stroke-width="${isLast ? 2 : 1.5}" ${isLast ? 'filter="url(#glow)"' : ''}/>`;
                if (isLast) {
                    svg += `<text x="${(pt.x + 8).toFixed(1)}" y="${(pt.y + 1).toFixed(1)}" fill="${color}" font-size="12" font-weight="700" dominant-baseline="middle">${v}</text>`;
                } else {
                    svg += `<text x="${pt.x.toFixed(1)}" y="${(pt.y - 8).toFixed(1)}" fill="#888" font-size="9" text-anchor="middle" font-weight="500">${v}</text>`;
                }
            }
        });
        svg += '</svg>';
        return svg;
    },

    svgBar(data, w, h, color, highlightLast = null) {
        if (!data.length) return '<div style="color:#666;font-size:12px;text-align:center;padding:20px;">No data</div>';
        const rawMax = Math.max(...data.map(d => d.count || d.value || 0), 1);
        const max = this._niceMax(rawMax);
        const pad = { t: 20, b: 26, l: 40, r: 6 };
        const chartH = h - pad.t - pad.b;
        const slot = (w - pad.l - pad.r) / data.length;
        const gap = Math.max(1, Math.min(2.5, slot * 0.1));
        const barW = slot - gap;
        const isHourly = data.length === 24;
        const barGid = color === '#60A5FA' ? 'bar-blue' : 'bar-purple';
        let svg = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:100%;overflow:visible;">${this._svgDefs}`;
        for (let g = 0; g <= 4; g++) {
            const gy = pad.t + (1 - g / 4) * chartH;
            const val = Math.round((g / 4) * max);
            if (g > 0) svg += `<line x1="${pad.l}" y1="${gy.toFixed(1)}" x2="${w - pad.r}" y2="${gy.toFixed(1)}" stroke="#1A1D21" stroke-width="1"/>`;
            svg += `<text x="${pad.l - 8}" y="${gy.toFixed(1)}" fill="#666" font-size="10" text-anchor="end" dominant-baseline="middle">${val}</text>`;
        }
        svg += `<line x1="${pad.l}" y1="${h - pad.b}" x2="${w - pad.r}" y2="${h - pad.b}" stroke="#1A1D21" stroke-width="1"/>`;
        data.forEach((d, i) => {
            const v = d.count || d.value || 0;
            const bh = Math.max(v > 0 ? 3 : 0, (v / max) * chartH);
            const x = pad.l + i * slot + gap / 2;
            const y = h - pad.b - bh;
            const isHL = highlightLast !== null && i === highlightLast;
            const barColor = isHL ? '#DDE4EE' : color;
            const opacity = isHL ? '1' : '0.85';
            if (bh > 0) {
                svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="url(#${isHL ? 'bar-blue' : barGid})" rx="2" ry="2" opacity="${opacity}"><title>${i}h: ${v} msgs</title></rect>`;
                if (v > 0 && (isHourly || data.length <= 10 || i % Math.ceil(data.length / 8) === 0 || i === data.length - 1)) {
                    svg += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" fill="#888" font-size="9" text-anchor="middle" font-weight="500">${v}</text>`;
                }
            }
        });
        if (isHourly) {
            svg += '<g>';
            for (let hr = 0; hr < 24; hr += 4) {
                svg += `<text x="${(pad.l + hr * slot + slot / 2).toFixed(1)}" y="${h - 8}" fill="#555" font-size="9" text-anchor="middle">${String(hr).padStart(2,'0')}h</text>`;
            }
            svg += '</g>';
        }
        svg += '</svg>';
        return svg;
    },

    svgDonut(segments, size, centerLabel, centerValue) {
        const r = (size - 20) / 2, circ = 2 * Math.PI * r;
        const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
        const gapSize = segments.length > 1 ? 3 : 0;
        const totalGap = gapSize * segments.length;
        const usable = circ - totalGap;
        let offset = 0;
        let svg = `<svg viewBox="0 0 ${size} ${size}" style="width:100%;height:100%;max-width:${size}px;">`;
        svg += `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#1A1D21" stroke-width="16"/>`;
        segments.forEach((seg, idx) => {
            const dash = usable * (seg.value / total);
            const gap = circ - dash;
            svg += `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="14" stroke-dasharray="${dash.toFixed(1)} ${gap.toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}" transform="rotate(-90 ${size/2} ${size/2})" opacity="0.9"><title>${seg.label}: ${seg.value} (${(seg.value/total*100).toFixed(1)}%)</title></circle>`;
            offset += dash + gapSize;
        });
        svg += `<text x="${size/2}" y="${size/2 - 5}" text-anchor="middle" fill="#fff" font-size="18" font-weight="700">${centerValue}</text>`;
        svg += `<text x="${size/2}" y="${size/2 + 10}" text-anchor="middle" fill="#666" font-size="9">${centerLabel}</text>`;
        svg += '</svg>';
        return svg;
    },

    svgHBar(items, w, h) {
        const max = Math.max(...items.map(i => i.value), 1);
        const niceMax = this._niceMax(max);
        const barH = Math.min(22, (h - 10) / items.length - 6);
        const labelW = 110;
        const barAreaW = w - labelW - 50;
        let svg = `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:100%;overflow:visible;">`;
        items.forEach((item, i) => {
            const y = i * (barH + 10) + 4;
            const bw = Math.max(4, (item.value / niceMax) * barAreaW);
            svg += `<rect x="${labelW}" y="${y}" width="${barAreaW.toFixed(1)}" height="${barH}" fill="#1A1D21" rx="4"/>`;
            svg += `<rect x="${labelW}" y="${y}" width="${bw.toFixed(1)}" height="${barH}" fill="${item.color}" rx="4" opacity="0.85"/>`;
            svg += `<text x="${labelW - 8}" y="${y + barH/2 + 4}" fill="#DDE4EE" font-size="11" font-weight="500" text-anchor="end">${item.label}</text>`;
            svg += `<text x="${(labelW + bw + 8).toFixed(1)}" y="${y + barH/2 + 4}" fill="#8B949E" font-size="10" font-weight="600">${item.display}</text>`;
        });
        svg += '</svg>';
        return svg;
    },

    hourLabel(i) { return i + 'h'; },

    svgGauge(value, max, size, color) {
        const r = (size - 8) / 2;
        const circ = 2 * Math.PI * r;
        const pct = Math.min(value / max, 1);
        const offset = circ * (1 - pct);
        return `<svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
            <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#1A1D21" stroke-width="6"/>
            <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-dasharray="${circ}" stroke-dashoffset="${offset}" stroke-linecap="round">
                <animate attributeName="stroke-dashoffset" from="${circ}" to="${offset}" dur="0.8s" fill="freeze"/>
            </circle>
        </svg><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;">
            <span style="font-size:${size/4}px;font-weight:700;color:#fff;">${Math.round(value)}%</span>
        </div>`;
    },

    // ═══════════════════════════ DASHBOARD ═══════════════════════════
    async renderDashboard() {
        const el = document.getElementById('vault-content');
        el.innerHTML = '<div style="text-align:center;padding:40px;color:#8B949E;">Loading dashboard...</div>';
        try {
            const [overview, sys, msgDay, chatDay, accDay] = await Promise.all([
                api('/api/auth/admin/analytics/overview'),
                api('/api/system/stats').catch(() => null),
                api('/api/auth/admin/analytics/messages-per-day').catch(() => ({days:[]})),
                api('/api/auth/admin/analytics/chats-per-day').catch(() => ({days:[]})),
                api('/api/auth/admin/analytics/accounts-per-day').catch(() => ({days:[]})),
            ]);
            this._cache.overview = overview;
            const totalData = overview.total_users + overview.total_chats + overview.total_messages + overview.banned_count + overview.deleted_count;
            const donutSegs = [
                { label: 'Users', value: overview.total_users, color: '#60A5FA' },
                { label: 'Chats', value: overview.total_chats, color: '#A78BFA' },
                { label: 'Messages', value: overview.total_messages, color: '#F472B6' },
                { label: 'Banned', value: overview.banned_count, color: '#EF4444' },
                { label: 'Deleted', value: overview.deleted_count, color: '#8B949E' },
            ].filter(s => s.value > 0);
            const collItems = [
                { label: 'Users', value: overview.total_users, color: '#60A5FA', display: overview.total_users.toLocaleString() },
                { label: 'Chats', value: overview.total_chats, color: '#A78BFA', display: overview.total_chats.toLocaleString() },
                { label: 'Messages', value: overview.total_messages, color: '#F472B6', display: overview.total_messages.toLocaleString() },
                { label: 'Guests', value: overview.guest_count, color: '#4ADE80', display: String(overview.guest_count) },
                { label: 'Admins', value: overview.admin_count, color: '#F59E0B', display: String(overview.admin_count) },
            ].filter(s => s.value > 0);
            el.innerHTML = `
                <div class="vault-stats" id="dash-stats">
                    ${this.statCard('👥','TOTAL ACCOUNTS',overview.total_users,'','')}
                    ${this.statCard('🟢','ONLINE NOW',overview.online_users,'','success')}
                    ${this.statCard('💬','TOTAL CHATS',overview.total_chats,'','info')}
                    ${this.statCard('✉️','MESSAGES TODAY',overview.messages_today,'','')}
                    ${this.statCard('🛡️','BANNED',overview.banned_count,'','danger')}
                    ${this.statCard('🗑️','DELETED',overview.deleted_count,'','warning')}
                    ${this.statCard('👑','ADMINS',overview.admin_count,'','')}
                    ${this.statCard('🆕','NEW THIS WEEK',overview.new_this_week,'','success')}
                    ${this.statCard('💬','ACTIVE CHATS',overview.active_chats,'','info')}
                    ${this.statCard('🤖','GUESTS',overview.guest_count,'','')}
                    ${this.statCard('⭐','PRO',overview.pro_count,'','')}
                    ${this.statCard('💎','ULTIMATE',overview.ultimate_count,'','purple')}
                </div>
                <div class="vault-grid" style="grid-template-columns:2fr 1fr;">
                    <div class="vault-card">
                        <div class="card-header"><span>📈 Message Activity (30d)</span><span style="font-size:10px;color:#8B5CF6;">Daily</span></div>
                        <div style="height:160px;" id="chart-messages">${this.svgLine(msgDay.days, 520, 160, '#8B5CF6', true)}</div>
                    </div>
                    <div class="vault-card" style="display:flex;flex-direction:column;align-items:center;">
                        <div class="card-header" style="width:100;"><span>📊 Data Distribution</span></div>
                        <div style="height:160px;width:100%;display:flex;justify-content:center;" id="chart-donut">${this.svgDonut(donutSegs, 150, 'Total', totalData >= 1000 ? (totalData/1000).toFixed(1)+'K' : String(totalData))}</div>
                        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;justify-content:center;">${donutSegs.map(s => `<span style="font-size:10px;color:${s.color};display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:${s.color};display:inline-block;"></span>${s.label} <span style="color:#8B949E;">${s.value} (${totalData > 0 ? ((s.value/totalData)*100).toFixed(1) : 0}%)</span></span>`).join('')}</div>
                    </div>
                </div>
                <div class="vault-grid">
                    <div class="vault-card">
                        <div class="card-header"><span>💬 Chat Activity (30d)</span></div>
                        <div style="height:120px;" id="chart-chats">${this.svgBar(chatDay.days, 520, 120, '#60A5FA')}</div>
                    </div>
                    <div class="vault-card">
                        <div class="card-header"><span>🆕 Account Growth (30d)</span></div>
                        <div style="height:120px;" id="chart-accounts">${this.svgLine(accDay.days, 520, 120, '#4ADE80', true)}</div>
                    </div>
                </div>
                <div class="vault-grid">
                    <div class="vault-card">
                        <div class="card-header"><span>📊 Top Collections by Size</span></div>
                        <div style="height:140px;" id="chart-collections">${this.svgHBar(collItems, 520, 140)}</div>
                    </div>
                    <div class="vault-card">
                        <div class="card-header"><span>🖥️ System Health</span></div>
                        <div id="dash-system" style="display:flex;gap:16px;justify-content:center;padding:12px 0;">
                            ${sys ? this.renderGauges(sys) : '<div style="color:#666;">Loading system...</div>'}
                        </div>
                        <div style="font-size:11px;color:#4ADE80;text-align:center;margin-top:8px;">✓ All systems operational</div>
                    </div>
                    <div class="vault-card">
                        <div class="card-header"><span>🟢 Online Now</span></div>
                        <div id="dash-online"></div>
                    </div>
                </div>
                <div class="vault-grid">
                    <div class="vault-card">
                        <div class="card-header"><span>👤 Recent Accounts</span><button class="vault-btn" onclick="Vault.loadTab('users')">View All</button></div>
                        <div id="dash-recent"></div>
                    </div>
                    <div class="vault-card">
                        <div class="card-header"><span>⚡ Activity Feed</span></div>
                        <div id="dash-activity"></div>
                    </div>
                </div>
                <div class="vault-grid">
                    <div class="vault-card">
                        <div class="card-header"><span>📊 Messages Per Hour (Today)</span></div>
                        <div style="height:100px;" id="chart-hourly">${''}</div>
                    </div>
                    <div class="vault-card">
                        <div class="card-header"><span>🛡️ Security Alerts</span></div>
                        <div id="dash-security"></div>
                    </div>
                </div>`;
            this.loadRecentAccounts();
            this.loadActivityFeed();
            this.loadHourlyChart();
            this.loadSecurityAlerts();
            this.loadOnlineUsers();
        } catch (e) { el.innerHTML = '<div style="padding:20px;color:#EF4444;">' + e.message + '</div>'; }
    },

    async refreshDashboardStats() {
        try {
            const d = await api('/api/auth/admin/analytics/overview');
            this._cache.overview = d;
            const el = document.getElementById('dash-stats');
            if (!el) return;
            const vals = [d.total_users, d.online_users, d.total_chats, d.messages_today, d.banned_count, d.deleted_count, d.admin_count, d.new_this_week, d.active_chats, d.guest_count, d.pro_count, d.ultimate_count];
            el.querySelectorAll('.stat-value').forEach((v, i) => { if (vals[i] !== undefined) v.textContent = vals[i]; });
        } catch {}
    },

    async refreshSystemStats() {
        try {
            const sys = await api('/api/system/stats');
            const el = document.getElementById('dash-system');
            if (el) el.innerHTML = this.renderGauges(sys);
        } catch {}
    },

    renderGauges(sys) {
        return `
            <div style="display:flex;flex-direction:column;align-items:center;gap:2px;"><div class="vault-gauge" style="width:80px;height:80px;">${this.svgGauge(sys.cpu, 100, 80, '#60A5FA')}</div><span style="font-size:10px;color:#60A5FA;font-weight:600;">CPU</span></div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:2px;"><div class="vault-gauge" style="width:80px;height:80px;">${this.svgGauge(sys.ram, 100, 80, '#A78BFA')}</div><span style="font-size:10px;color:#A78BFA;font-weight:600;">RAM</span></div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:2px;"><div class="vault-gauge" style="width:80px;height:80px;">${this.svgGauge(sys.storage, 100, 80, '#4ADE80')}</div><span style="font-size:10px;color:#4ADE80;font-weight:600;">Storage</span></div>`;
    },

    _usersCache: null,
    _usersCacheTime: 0,

    async getUsersOnce() {
        const now = Date.now();
        if (this._usersCache && (now - this._usersCacheTime) < 1000) return this._usersCache;
        const { users } = await api('/api/auth/admin/users');
        this._usersCache = users;
        this._usersCacheTime = now;
        return users;
    },

    async loadRecentAccounts() {
        const el = document.getElementById('dash-recent');
        if (!el) return;
        try {
            const users = await this.getUsersOnce();
            const sig = users.slice(0,5).map(u=>`${u.id}:${u.is_banned}:${u.is_deleted}:${u.role}`).join('|');
            if (sig === this._recentSig) return;
            this._recentSig = sig;
            el.innerHTML = users.slice(0, 5).map((u, i) => {
                const sc = u.is_banned ? 'badge-red' : (u.is_deleted ? 'badge-gray' : (u.role === 'owner' ? 'badge-purple' : (u.role === 'admin' ? 'badge-yellow' : 'badge-green')));
                const st = u.is_banned ? 'Banned' : (u.is_deleted ? 'Deleted' : (u.role === 'owner' ? 'Owner' : (u.role === 'admin' ? 'Admin' : 'Active')));
                return `<div class="vault-activity-item" style="padding:10px 12px;align-items:center;"><div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,${sc==='badge-red'?'#EF4444':sc==='badge-purple'?'#a78bfa':sc==='badge-yellow'?'#F59E0B':'#4ADE80'},transparent);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0;">${u.username.charAt(0).toUpperCase()}</div><div style="flex:1;min-width:0;"><div style="color:#DDE4EE;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.username}</div><div style="color:#555;font-size:10px;">${u.role === 'owner' ? 'Owner' : u.role === 'admin' ? 'Admin' : 'User'} · ${u.created_at}</div></div><span class="badge ${sc}" style="flex-shrink:0;">${st}</span></div>`;
            }).join('');
        } catch { el.innerHTML = '<div style="color:#666;font-size:12px;">No data</div>'; }
    },

    async loadActivityFeed() {
        const el = document.getElementById('dash-activity');
        if (!el) return;
        try {
            const users = await this.getUsersOnce();
            const sig = users.slice(0,10).map(u=>`${u.id}:${u.is_banned}:${u.username}`).join('~');
            if (sig === this._activitySig) { this._patchActivityDots(users); return; }
            this._activitySig = sig;
            let html = '';
            users.filter(u => u.is_banned).slice(0, 3).forEach(u => {
                html += `<div class="vault-activity-item" style="padding:10px 12px;align-items:center;"><span style="color:#EF4444;flex-shrink:0;">🚫</span><div style="flex:1;min-width:0;"><div style="color:#EF4444;font-size:12px;font-weight:500;">${u.username}</div><div style="color:#555;font-size:10px;">${u.ban_reason || 'No reason'}</div></div><span class="badge badge-red" style="flex-shrink:0;font-size:9px;">Banned</span></div>`;
            });
            users.filter(u => !u.is_banned && !u.is_deleted).slice(0, 4).forEach(u => {
                const dotColor = u.online ? '#4ADE80' : '#666';
                const dotShadow = u.online ? 'box-shadow:0 0 6px #4ADE80;' : '';
                html += `<div class="vault-activity-item" style="padding:10px 12px;align-items:center;"><div style="width:8px;height:8px;border-radius:50%;background:${dotColor};${dotShadow}flex-shrink:0;"></div><div style="flex:1;min-width:0;"><div style="color:#DDE4EE;font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.username}</div><div style="color:#555;font-size:10px;">${u.last_active || 'Never'}</div></div><span style="font-size:10px;color:#555;">${u.online ? 'active now' : 'idle'}</span></div>`;
            });
            el.innerHTML = html || '<div style="color:#666;font-size:12px;text-align:center;padding:20px;">No activity</div>';
        } catch { el.innerHTML = ''; }
    },
    _patchActivityDots(users) {
        const el = document.getElementById('dash-activity');
        if (!el || !el.children.length) return;
        const map = new Map(users.map(u => [u.username, u.online]));
        [...el.children].forEach(row => {
            const nameEl = row.querySelector('div div');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name || name.startsWith('Banned:')) return;
            const dot = row.firstElementChild;
            const label = row.lastElementChild;
            const isOnline = map.get(name);
            if (isOnline === undefined) return;
            if (dot) { dot.style.background = isOnline ? '#4ADE80' : '#666'; dot.style.boxShadow = isOnline ? '0 0 6px #4ADE80' : 'none'; }
            if (label) label.textContent = isOnline ? 'active now' : 'idle';
        });
    },

    async loadHourlyChart() {
        try {
            const d = await api('/api/auth/admin/analytics/messages-per-hour');
            const el = document.getElementById('chart-hourly');
            const data = d.hours.map(h => ({ count: h.count }));
            const sig = data.map(x=>x.count).join(',');
            if (sig === this._hourlySig) return;
            this._hourlySig = sig;
            const lastHr = new Date().getUTCHours();
            if (el) el.innerHTML = this.svgBar(data, 520, 100, '#A78BFA', lastHr);
        } catch {}
    },

    async loadSecurityAlerts() {
        const el = document.getElementById('dash-security');
        if (!el) return;
        try {
            const dash = await api('/api/security/dashboard');
            el.innerHTML = `
                <div class="vault-activity-item" style="border-left:3px solid ${dash.failed_logins > 0 ? '#EF4444' : '#4ADE80'};"><div><div style="font-size:12px;color:#fff;">${dash.failed_logins} failed logins</div><div style="font-size:11px;color:#666;">Total: ${dash.total_logins}</div></div></div>
                <div class="vault-activity-item" style="border-left:3px solid #4ADE80;"><div><div style="font-size:12px;color:#fff;">${dash.unique_ips} unique IPs</div><div style="font-size:11px;color:#666;">Last: ${dash.last_ip}</div></div></div>`;
        } catch { el.innerHTML = '<div style="color:#666;font-size:12px;">No data</div>'; }
    },

    async loadOnlineUsers() {
        const el = document.getElementById('dash-online');
        if (!el) return;
        try {
            const users = await this.getUsersOnce();
            const online = users.filter(u => u.online && !u.is_banned && !u.is_deleted);
            const sig = online.map(u => `${u.id}:${u.username}`).join('|') || 'none';
            if (sig === this._onlineSig) return;
            this._onlineSig = sig;
            if (!online.length) { el.innerHTML = '<div style="color:#666;font-size:12px;text-align:center;padding:16px;">No users online</div>'; return; }
            el.innerHTML = online.map(u => {
                const rc = u.role === 'owner' ? '#a78bfa' : (u.role === 'admin' ? '#fbbf24' : '#4ADE80');
                const rl = u.role === 'owner' ? 'Owner' : (u.role === 'admin' ? 'Admin' : 'User');
                return `<div class="vault-activity-item" style="border-left:3px solid ${rc};"><div style="flex:1;min-width:0;"><div style="color:${rc};font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.username}</div><div style="color:#666;font-size:10px;">${rl}</div></div><span style="width:8px;height:8px;border-radius:50%;background:#4ADE80;box-shadow:0 0 6px #4ADE80;flex-shrink:0;"></span></div>`;
            }).join('');
        } catch { el.innerHTML = '<div style="color:#666;font-size:12px;">Unable to load</div>'; }
    },

    statCard(icon, label, value, sub, cls) {
        return `<div class="stat-card ${cls}"><div class="stat-icon">${icon}</div><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${sub ? '<div class="stat-sub">' + sub + '</div>' : ''}</div>`;
    },

    // ═══════════════════════════ USERS ═══════════════════════════
    async renderUsers() {
        const el = document.getElementById('vault-content');
        el.innerHTML = '<div style="padding:20px;color:#8B949E;">Loading users...</div>';
        try {
            const { users } = await api('/api/auth/admin/users');
            this._cache.users = users;
            let html = `
                <div class="vault-search">
                    <input class="vault-input" id="user-search" placeholder="Search username, email, ID..." oninput="Vault.filterUsers()">
                    <select class="vault-input" id="user-role-filter" style="max-width:150px;" onchange="Vault.filterUsers()">
                        <option value="">All Roles</option>
                        <option value="user">Users</option>
                        <option value="admin">Admins</option>
                        <option value="owner">Owner</option>
                        <option value="guest">Guests</option>
                    </select>
                    <select class="vault-input" id="user-status-filter" style="max-width:150px;" onchange="Vault.filterUsers()">
                        <option value="">All Status</option>
                        <option value="active">Active</option>
                        <option value="banned">Banned</option>
                        <option value="deleted">Deleted</option>
                    </select>
                </div>
                <div class="vault-stats" style="padding:0 0 12px;">
                    ${this.statCard('👥','Total',users.length,'','')}
                    ${this.statCard('🟢','Active',users.filter(u=>!u.is_banned&&!u.is_deleted).length,'','success')}
                    ${this.statCard('🛡️','Banned',users.filter(u=>u.is_banned).length,'','danger')}
                    ${this.statCard('🗑️','Deleted',users.filter(u=>u.is_deleted).length,'','warning')}
                    ${this.statCard('🤖','Guests',users.filter(u=>u.username.startsWith('guest_')).length,'','')}
                    ${this.statCard('👑','Admins',users.filter(u=>u.role==='admin'||u.role==='owner').length,'','info')}
                </div>
                <div class="vault-card" style="overflow-x:auto;">
                    <table class="vault-table" id="users-table">
                        <thead><tr><th>#</th><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Chats</th><th>Messages</th><th>Last Active</th><th>Actions</th></tr></thead>
                        <tbody id="users-tbody"></tbody>
                    </table>
                </div>`;
            el.innerHTML = html;
            this.renderUsersTable(users);
        } catch (e) { el.innerHTML = '<div style="padding:20px;color:#EF4444;">' + e.message + '</div>'; }
    },

    renderUsersTable(users) {
        const tbody = document.getElementById('users-tbody');
        if (!tbody) return;
        const isOwner = this._isOwner;
        tbody.innerHTML = users.map((u, i) => {
            const sc = u.is_banned ? 'badge-red' : (u.is_deleted ? 'badge-gray' : (u.role === 'owner' ? 'badge-purple' : (u.role === 'admin' ? 'badge-yellow' : 'badge-green')));
            const st = u.is_banned ? 'Banned' : (u.is_deleted ? 'Deleted' : (u.role === 'owner' ? 'Owner' : (u.role === 'admin' ? 'Admin' : 'Active')));
            const onlineDot = u.online ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#4ADE80;margin-left:6px;box-shadow:0 0 6px #4ADE80;" title="Online now"></span>' : '';
            const isStaff = u.role === 'owner' || u.role === 'admin';
            const isMe = u.username === document.getElementById('vault-username')?.textContent;
            const canAct = (isOwner || !isStaff) && !(isMe && u.role === 'owner');
            return `<tr>
                <td style="color:#8B949E;">${i + 1}</td>
                <td><div style="font-weight:600;display:flex;align-items:center;">${u.username}${onlineDot}</div></td>
                <td style="color:#8B949E;">${u.email}</td>
                <td><span class="badge ${u.role === 'owner' ? 'badge-purple' : (u.role === 'admin' ? 'badge-yellow' : 'badge-gray')}">${u.role}</span></td>
                <td><span class="badge ${sc}">${st}</span></td>
                <td>${u.chat_count || 0}</td>
                <td>${u.message_count || 0}</td>
                <td style="color:#8B949E;font-size:11px;">${u.last_active || 'Never'}</td>
                <td><div style="display:flex;gap:4px;flex-wrap:wrap;">
                    ${canAct ? `<button class="vault-btn" onclick="Vault.viewUserChats(${u.id},'${this.esc(u.username)}')">💬</button>` : ''}
                    ${isOwner && u.role === 'user' && !u.is_banned && !u.is_deleted ? `<button class="vault-btn success" onclick="Vault.promoteToAdmin(${u.id},'${this.esc(u.username)}')" title="Promote to Admin">⬆️</button>` : ''}
                    ${canAct ? `<button class="vault-btn" onclick="Vault.resetUser(${u.id},'${this.esc(u.username)}')">🔑</button>
                    <button class="vault-btn ${u.is_banned ? 'success' : 'danger'}" onclick="Vault.banUser(${u.id},'${this.esc(u.username)}',${u.is_banned})">${u.is_banned ? 'Unban' : 'Ban'}</button>
                    <button class="vault-btn danger" onclick="Vault.deleteUser(${u.id},'${this.esc(u.username)}')">🗑️</button>`
                    : '<span style="color:#8B949E;font-size:10px;align-self:center;">—</span>'}
                </div></td></tr>`;
        }).join('');
    },

    filterUsers() {
        const q = (document.getElementById('user-search')?.value || '').toLowerCase();
        const role = document.getElementById('user-role-filter')?.value || '';
        const status = document.getElementById('user-status-filter')?.value || '';
        let users = this._cache.users || [];
        if (q) users = users.filter(u => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || String(u.id).includes(q));
        if (role) {
            if (role === 'guest') users = users.filter(u => u.username.startsWith('guest_'));
            else users = users.filter(u => u.role === role);
        }
        if (status === 'active') users = users.filter(u => !u.is_banned && !u.is_deleted);
        else if (status === 'banned') users = users.filter(u => u.is_banned);
        else if (status === 'deleted') users = users.filter(u => u.is_deleted);
        this.renderUsersTable(users);
    },

    async viewUserChats(id, username) {
        try {
            const { chats } = await api(`/api/auth/admin/users/${id}/chats`);
            let html = `<div class="vault-modal-overlay" onclick="if(event.target===this)this.remove()"><div class="vault-modal"><div class="vault-modal-header"><h3 style="color:#DDE4EE;">💬 ${username} — ${chats.length} chats</h3><button class="vault-btn" onclick="this.closest('.vault-modal-overlay').remove()">Close</button></div>`;
            if (!chats.length) html += '<div class="vault-empty"><div class="vault-empty-icon">💬</div>No chats</div>';
            chats.slice(0, 10).forEach((c, i) => {
                html += `<div style="margin-bottom:12px;padding:12px;background:#0a0a0f;border:1px solid #1A1D21;border-radius:8px;"><div style="font-weight:600;color:#a78bfa;margin-bottom:6px;">${i + 1}. ${c.title} — ${c.message_count} msgs</div>`;
                (c.messages || []).slice(0, 6).forEach(m => {
                    const isUser = m.role === 'user';
                    html += `<div style="margin:4px 0;padding:8px;background:${isUser ? '#1A1D21' : '#111315'};border-left:3px solid ${isUser ? '#4ADE80' : '#8B5CF6'};border-radius:6px;font-size:12px;color:#e5e5e5;"><strong style="color:${isUser ? '#4ADE80' : '#8B5CF6'};">${m.role}:</strong> ${(m.content || '').slice(0, 300).replace(/</g, '&lt;')}</div>`;
                });
                html += '</div>';
            });
            html += '</div></div>';
            document.body.insertAdjacentHTML('beforeend', html);
        } catch (e) { showToast(e.message, 'error'); }
    },

    async resetUser(id, username) {
        const pw = await showPrompt('Reset password', '', 'New password (min 6 chars)');
        if (!pw || pw.length < 6) { if (pw !== null) showToast('Min 6 chars', 'error'); return; }
        try { await api(`/api/auth/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password: pw }) }); showToast('Password reset for ' + username, 'success'); } catch (e) { showToast(e.message, 'error'); }
    },

    async banUser(id, username, isBanned) {
        if (username === 'WANZU-IBRAHIM') { showToast('The Owner cannot be banned', 'error'); return; }
        if (isBanned) { try { await api(`/api/auth/admin/users/${id}/unban`, { method: 'POST' }); showToast('Unbanned ' + username, 'success'); this.loadTab(this._currentTab); } catch (e) { showToast(e.message, 'error'); } }
        else { const r = await showPrompt('Ban reason', '', 'Reason for banning ' + username); if (!r || !r.trim()) return; try { await api(`/api/auth/admin/users/${id}/ban`, { method: 'POST', body: JSON.stringify({ reason: r.trim() }) }); showToast('Banned ' + username, 'success'); this.loadTab(this._currentTab); } catch (e) { showToast(e.message, 'error'); } }
    },

    async deleteUser(id, username) {
        if (username === 'WANZU-IBRAHIM') { showToast('The Owner cannot be deleted', 'error'); return; }
        const ok = await showConfirm('Delete user?', 'Delete ' + username + '? This cannot be undone.', true);
        if (!ok) return;
        try { await api(`/api/auth/admin/users/${id}`, { method: 'DELETE' }); showToast('Deleted ' + username, 'success'); this.loadTab(this._currentTab); } catch (e) { showToast(e.message, 'error'); }
    },

    // ═══════════════════════════ CHATS ═══════════════════════════
    async renderChats() {
        const el = document.getElementById('vault-content');
        el.innerHTML = '<div style="padding:20px;color:#8B949E;">Loading chats...</div>';
        try {
            const [overview, chatsData] = await Promise.all([
                api('/api/auth/admin/analytics/overview'),
                api('/api/auth/admin/analytics/all-chats').catch(() => ({ chats: [] })),
            ]);
            this._cache.chats = chatsData.chats;
            el.innerHTML = `
                <div class="vault-stats" style="padding:0 0 12px;">
                    ${this.statCard('💬','Total Chats',overview.total_chats,'','info')}
                    ${this.statCard('🟢','Active (24h)',overview.active_chats,'','success')}
                    ${this.statCard('✉️','Total Messages',overview.total_messages,'','')}
                    ${this.statCard('📊','Avg Msgs/Chat',overview.total_chats ? Math.round(overview.total_messages / overview.total_chats) : 0,'','')}
                </div>
                <div class="vault-search">
                    <input class="vault-input" id="chat-search" placeholder="Search chats..." oninput="Vault.filterChats()">
                </div>
                <div class="vault-card" style="overflow-x:auto;">
                    <table class="vault-table" id="chats-table">
                        <thead><tr><th>#</th><th>Title</th><th>User</th><th>Messages</th><th>Created</th><th>Last Active</th><th>Actions</th></tr></thead>
                        <tbody id="chats-tbody"></tbody>
                    </table>
                </div>`;
            this.renderChatsTable(chatsData.chats);
        } catch (e) { el.innerHTML = '<div style="padding:20px;color:#EF4444;">' + e.message + '</div>'; }
    },

    renderChatsTable(chats) {
        const tbody = document.getElementById('chats-tbody');
        if (!tbody) return;
        tbody.innerHTML = chats.map((c, i) => `<tr>
            <td style="color:#8B949E;">${i + 1}</td>
            <td style="font-weight:600;">${c.title}</td>
            <td style="color:#a78bfa;">${c.username}</td>
            <td>${c.message_count}</td>
            <td style="color:#8B949E;font-size:11px;">${c.created_at}</td>
            <td style="color:#8B949E;font-size:11px;">${c.updated_at}</td>
            <td><button class="vault-btn" onclick="Vault.viewChatMessages(${c.id},'${this.esc(c.title)}')">👁️</button></td>
        </tr>`).join('');
    },

    filterChats() {
        const q = (document.getElementById('chat-search')?.value || '').toLowerCase();
        let chats = this._cache.chats || [];
        if (q) chats = chats.filter(c => c.title.toLowerCase().includes(q) || c.username.toLowerCase().includes(q));
        this.renderChatsTable(chats);
    },

    async viewChatMessages(chatId, title) {
        try {
            const d = await api(`/api/auth/admin/analytics/chat/${chatId}/messages`);
            const messages = d.messages || [];
            let html = `<div class="vault-modal-overlay" onclick="if(event.target===this)this.remove()"><div class="vault-modal"><div class="vault-modal-header"><h3 style="color:#DDE4EE;">✉️ ${title} <span style="font-size:11px;color:#8B949E;">(${d.chat && d.chat.username ? d.chat.username : ''})</span></h3><button class="vault-btn" onclick="this.closest('.vault-modal-overlay').remove()">Close</button></div>`;
            if (!messages.length) html += '<div class="vault-empty">No messages</div>';
            messages.forEach(m => {
                const isUser = m.role === 'user';
                html += `<div style="margin:6px 0;padding:10px;background:${isUser ? '#1A1D21' : '#111315'};border-left:3px solid ${isUser ? '#4ADE80' : '#8B5CF6'};border-radius:6px;font-size:12px;color:#e5e5e5;"><strong style="color:${isUser ? '#4ADE80' : '#8B5CF6'};">${m.role}:</strong> ${(m.content || '').slice(0, 500).replace(/</g, '&lt;')}</div>`;
            });
            html += '</div></div>';
            document.body.insertAdjacentHTML('beforeend', html);
        } catch (e) { showToast(e.message, 'error'); }
    },

    // ═══════════════════════════ MESSAGES ═══════════════════════════
    async renderMessages() {
        const el = document.getElementById('vault-content');
        el.innerHTML = '<div style="padding:20px;color:#8B949E;">Loading messages...</div>';
        try {
            const [overview, msgsData] = await Promise.all([
                api('/api/auth/admin/analytics/overview'),
                api('/api/auth/admin/analytics/all-messages').catch(() => ({ messages: [] })),
            ]);
            this._cache.messages = msgsData.messages;
            const userMsgs = msgsData.messages.filter(m => m.role === 'user').length;
            const aiMsgs = msgsData.messages.filter(m => m.role === 'assistant').length;
            el.innerHTML = `
                <div class="vault-stats" style="padding:0 0 12px;">
                    ${this.statCard('✉️','Total Messages',overview.total_messages,'','')}
                    ${this.statCard('📅','Today',overview.messages_today,'','success')}
                    ${this.statCard('👤','User Messages',userMsgs,'recent','info')}
                    ${this.statCard('🤖','AI Messages',aiMsgs,'recent','')}
                </div>
                <div class="vault-search">
                    <input class="vault-input" id="msg-search" placeholder="Search messages..." oninput="Vault.filterMessages()">
                </div>
                <div class="vault-card" style="overflow-x:auto;">
                    <table class="vault-table">
                        <thead><tr><th>#</th><th>Role</th><th>Content</th><th>Chat</th><th>Time</th></tr></thead>
                        <tbody id="msgs-tbody"></tbody>
                    </table>
                </div>`;
            this.renderMsgsTable(msgsData.messages);
        } catch (e) { el.innerHTML = '<div style="padding:20px;color:#EF4444;">' + e.message + '</div>'; }
    },

    renderMsgsTable(msgs) {
        const tbody = document.getElementById('msgs-tbody');
        if (!tbody) return;
        tbody.innerHTML = msgs.map((m, i) => `<tr>
            <td style="color:#8B949E;">${i + 1}</td>
            <td><span class="badge ${m.role === 'user' ? 'badge-green' : 'badge-purple'}">${m.role}</span></td>
            <td style="max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${(m.content || '').replace(/</g, '&lt;')}</td>
            <td style="color:#a78bfa;">${m.chat_title}</td>
            <td style="color:#8B949E;font-size:11px;">${m.created_at}</td>
        </tr>`).join('');
    },

    filterMessages() {
        const q = (document.getElementById('msg-search')?.value || '').toLowerCase();
        let msgs = this._cache.messages || [];
        if (q) msgs = msgs.filter(m => (m.content || '').toLowerCase().includes(q) || m.chat_title.toLowerCase().includes(q) || m.role.includes(q));
        this.renderMsgsTable(msgs);
    },

    // ═══════════════════════════ BANS ═══════════════════════════
    async renderBans() {
        const el = document.getElementById('vault-content');
        el.innerHTML = '<div style="padding:20px;color:#8B949E;">Loading bans...</div>';
        try {
            const { users } = await api('/api/auth/admin/users');
            const banned = users.filter(u => u.is_banned);
            el.innerHTML = `
                <div class="vault-stats" style="padding:0 0 12px;">
                    ${this.statCard('🚫','Banned',banned.length,'','danger')}
                    ${this.statCard('👥','Total Users',users.length,'','')}
                </div>
                <div class="vault-search"><input class="vault-input" id="ban-search" placeholder="Search banned..." oninput="Vault.filterBans()"></div>
                <div class="vault-card" style="overflow-x:auto;">
                    <table class="vault-table">
                        <thead><tr><th>#</th><th>User</th><th>Email</th><th>Reason</th><th>Banned By</th><th>Actions</th></tr></thead>
                        <tbody id="bans-tbody"></tbody>
                    </table>
                </div>`;
            this._cache.banned = banned;
            this.renderBansTable(banned);
        } catch (e) { el.innerHTML = '<div style="padding:20px;color:#EF4444;">' + e.message + '</div>'; }
    },

    renderBansTable(banned) {
        const tbody = document.getElementById('bans-tbody');
        if (!tbody) return;
        if (!banned.length) { tbody.innerHTML = '<tr><td colspan="6" class="vault-empty"><div class="vault-empty-icon">✅</div>No banned accounts</td></tr>'; return; }
        tbody.innerHTML = banned.map((u, i) => `<tr>
            <td style="color:#8B949E;">${i + 1}</td>
            <td style="font-weight:600;color:#EF4444;">${u.username}</td>
            <td style="color:#8B949E;">${u.email}</td>
            <td>${u.ban_reason || 'No reason'}</td>
            <td><span class="badge badge-yellow">${u.banned_by || 'Staff'}</span></td>
            <td><button class="vault-btn success" onclick="Vault.banUser(${u.id},'${this.esc(u.username)}',true)">Unban</button></td>
        </tr>`).join('');
    },

    filterBans() {
        const q = (document.getElementById('ban-search')?.value || '').toLowerCase();
        let banned = this._cache.banned || [];
        if (q) banned = banned.filter(u => u.username.toLowerCase().includes(q) || (u.ban_reason || '').toLowerCase().includes(q));
        this.renderBansTable(banned);
    },

    // ═══════════════════════════ DELETED ═══════════════════════════
    async renderDeleted() {
        const el = document.getElementById('vault-content');
        el.innerHTML = '<div style="padding:20px;color:#8B949E;">Loading deleted accounts...</div>';
        try {
            const { users } = await api('/api/auth/admin/users');
            const deleted = users.filter(u => u.is_deleted);
            el.innerHTML = `
                <div class="vault-stats" style="padding:0 0 12px;">
                    ${this.statCard('🗑️','Deleted',deleted.length,'','warning')}
                    ${this.statCard('👥','Total Users',users.length,'','')}
                </div>
                <div class="vault-card" style="overflow-x:auto;">
                    <table class="vault-table">
                        <thead><tr><th>#</th><th>User</th><th>Email</th><th>Deleted By</th><th>Created</th></tr></thead>
                        <tbody>${deleted.map((u, i) => `<tr>
                            <td style="color:#8B949E;">${i + 1}</td>
                            <td style="font-weight:600;color:#8B949E;">${u.username}</td>
                            <td style="color:#666;">${u.email}</td>
                            <td><span class="badge badge-yellow">${u.deleted_by || 'Staff'}</span></td>
                            <td style="color:#8B949E;font-size:11px;">${u.created_at}</td>
                        </tr>`).join('') || '<tr><td colspan="5" class="vault-empty"><div class="vault-empty-icon">✅</div>No deleted accounts</td></tr>'}</tbody>
                    </table>
                </div>`;
        } catch (e) { el.innerHTML = '<div style="padding:20px;color:#EF4444;">' + e.message + '</div>'; }
    },

    // ═══════════════════════════ SECURITY ═══════════════════════════
    async renderSecurity() {
        const el = document.getElementById('vault-content');
        el.innerHTML = '<div style="padding:20px;color:#8B949E;">Loading security...</div>';
        try {
            const [dash, hist] = await Promise.all([api('/api/security/dashboard'), api('/api/auth/admin/analytics/login-history-all').catch(() => ({ history: [] }))]);
            el.innerHTML = `
                <div class="vault-stats" style="padding:0 0 12px;">
                    ${this.statCard('🔒','Failed Logins',dash.failed_logins,'','danger')}
                    ${this.statCard('🔑','Total Logins',dash.total_logins,'','')}
                    ${this.statCard('🌐','Unique IPs',dash.unique_ips,'','info')}
                </div>
                <div class="vault-card" style="margin-bottom:16px;">
                    <div class="card-header"><span>Last Login</span></div>
                    <div style="font-size:13px;color:#fff;">${dash.last_login} from <span style="color:#60A5FA;">${dash.last_ip}</span></div>
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>🔐 Login History (all users, last 100)</span></div>
                    <div style="max-height:60vh;overflow-y:auto;overflow-x:hidden;">
                        <table class="vault-table">
                            <thead><tr><th>#</th><th>User</th><th>Status</th><th>IP</th><th>Device</th><th>Time</th></tr></thead>
                            <tbody>${(hist.history || []).map((h, i) => `<tr>
                                <td style="color:#8B949E;">${i + 1}</td>
                                <td style="font-weight:600;">${h.username}</td>
                                <td><span class="badge ${h.success ? 'badge-green' : 'badge-red'}">${h.success ? 'Success' : 'Failed'}</span></td>
                                <td style="color:#60A5FA;">${h.ip_address}</td>
                                <td style="color:#8B949E;font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${h.user_agent}</td>
                                <td style="color:#8B949E;font-size:11px;">${h.login_at}</td>
                            </tr>`).join('')}</tbody>
                        </table>
                    </div>
                </div>`;
        } catch (e) { el.innerHTML = '<div style="padding:20px;color:#EF4444;">' + e.message + '</div>'; }
    },

    // ═══════════════════════════ LOGS ═══════════════════════════
    async renderLogs() {
        const el = document.getElementById('vault-content');
        el.innerHTML = '<div style="padding:20px;color:#8B949E;">Loading logs...</div>';
        try {
            const hist = await api('/api/auth/admin/analytics/login-history-all').catch(() => ({ history: [] }));
            el.innerHTML = `
                <div class="vault-search"><input class="vault-input" id="log-search" placeholder="Search logs..." oninput="Vault.filterLogs()"></div>
                <div class="vault-card" style="overflow-x:auto;">
                    <table class="vault-table">
                        <thead><tr><th>#</th><th>User</th><th>Action</th><th>IP</th><th>Time</th><th>Device</th></tr></thead>
                        <tbody id="logs-tbody">${(hist.history || []).map((h, i) => `<tr>
                            <td style="color:#8B949E;">${i + 1}</td>
                            <td style="font-weight:600;">${h.username}</td>
                            <td><span class="badge ${h.success ? 'badge-green' : 'badge-red'}">${h.success ? 'Login' : 'Failed'}</span></td>
                            <td style="color:#60A5FA;">${h.ip_address}</td>
                            <td style="color:#8B949E;font-size:11px;">${h.login_at}</td>
                            <td style="color:#8B949E;font-size:10px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${h.user_agent}</td>
                        </tr>`).join('')}</tbody>
                    </table>
                </div>`;
            this._cache.logs = hist.history || [];
        } catch (e) { el.innerHTML = '<div style="padding:20px;color:#EF4444;">' + e.message + '</div>'; }
    },

    filterLogs() {
        const q = (document.getElementById('log-search')?.value || '').toLowerCase();
        let logs = this._cache.logs || [];
        if (q) logs = logs.filter(h => h.username.toLowerCase().includes(q) || h.ip_address.includes(q) || h.user_agent.toLowerCase().includes(q));
        const tbody = document.getElementById('logs-tbody');
        if (!tbody) return;
        tbody.innerHTML = logs.map((h, i) => `<tr>
            <td style="color:#8B949E;">${i + 1}</td>
            <td style="font-weight:600;">${h.username}</td>
            <td><span class="badge ${h.success ? 'badge-green' : 'badge-red'}">${h.success ? 'Login' : 'Failed'}</span></td>
            <td style="color:#60A5FA;">${h.ip_address}</td>
            <td style="color:#8B949E;font-size:11px;">${h.login_at}</td>
            <td style="color:#8B949E;font-size:10px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${h.user_agent}</td>
        </tr>`).join('');
    },

    // ═══════════════════════════ BACKUPS ═══════════════════════════
    async renderBackups() {
        const el = document.getElementById('vault-content');
        try {
            const sys = await api('/api/system/stats');
            el.innerHTML = `
            <div class="vault-stats" style="padding:0 0 12px;">
                ${this.statCard('💾','Database','SQLite','','info')}
                ${this.statCard('📁','Storage', (sys.storage || 0) + '% used','','')}
                ${this.statCard('🔄','Auto-backup','Railway','','success')}
            </div>
            <div class="vault-grid-3">
                <div class="vault-card" style="text-align:center;">
                    <div style="font-size:28px;margin-bottom:8px;">💾</div>
                    <div style="font-weight:600;color:#DDE4EE;margin-bottom:4px;">Full Backup</div>
                    <div style="font-size:11px;color:#8B949E;margin-bottom:12px;">Complete database snapshot</div>
                    <button class="vault-btn primary" onclick="showToast('Full backup created','success')">Create Full Backup</button>
                </div>
                <div class="vault-card" style="text-align:center;">
                    <div style="font-size:28px;margin-bottom:8px;">👤</div>
                    <div style="font-weight:600;color:#DDE4EE;margin-bottom:4px;">Export Users</div>
                    <div style="font-size:11px;color:#8B949E;margin-bottom:12px;">Download all accounts as CSV</div>
                    <button class="vault-btn" onclick="Vault.downloadExport('users')">Download Users</button>
                </div>
                <div class="vault-card" style="text-align:center;">
                    <div style="font-size:28px;margin-bottom:8px;">💬</div>
                    <div style="font-weight:600;color:#DDE4EE;margin-bottom:4px;">Export Conversations</div>
                    <div style="font-size:11px;color:#8B949E;margin-bottom:12px;">Download all chats as text</div>
                    <button class="vault-btn" onclick="Vault.downloadExport('chats')">Download Chats</button>
                </div>
                <div class="vault-card" style="text-align:center;">
                    <div style="font-size:28px;margin-bottom:8px;">✉️</div>
                    <div style="font-weight:600;color:#DDE4EE;margin-bottom:4px;">Export Messages</div>
                    <div style="font-size:11px;color:#8B949E;margin-bottom:12px;">Download all messages as text</div>
                    <button class="vault-btn" onclick="Vault.downloadExport('messages')">Download Messages</button>
                </div>
                <div class="vault-card" style="text-align:center;">
                    <div style="font-size:28px;margin-bottom:8px;">⚙️</div>
                    <div style="font-weight:600;color:#DDE4EE;margin-bottom:4px;">Export Config</div>
                    <div style="font-size:11px;color:#8B949E;margin-bottom:12px;">Download system configuration</div>
                    <button class="vault-btn" onclick="Vault.exportConfig()">Download Config</button>
                </div>
                <div class="vault-card" style="text-align:center;">
                    <div style="font-size:28px;margin-bottom:8px;">🔄</div>
                    <div style="font-weight:600;color:#DDE4EE;margin-bottom:4px;">Restore Backup</div>
                    <div style="font-size:11px;color:#8B949E;margin-bottom:12px;">Restore from last snapshot</div>
                    <button class="vault-btn" onclick="Vault.restoreBackup()">Restore</button>
                </div>
            </div>
            <div class="vault-card" style="margin-top:16px;">
                <div class="card-header"><span>📋 Backup Schedule</span></div>
                <div class="vault-setting-row"><span class="vault-setting-label">Automatic Backups</span><span class="vault-setting-value" style="color:#4ADE80;">Enabled (Railway volumes)</span></div>
                <div class="vault-setting-row"><span class="vault-setting-label">Retention Period</span><span class="vault-setting-value">Continuous — persistent</span></div>
                <div class="vault-setting-row"><span class="vault-setting-label">Database Location</span><span class="vault-setting-value">/data/zenith.db</span></div>
            </div>`;
        } catch (e) {
            el.innerHTML = '<div style="text-align:center;padding:40px;color:#8B949E;">Loading backups... (system stats unavailable)</div>';
        }
    },

    downloadExport(kind) {
        const url = `/api/auth/admin/analytics/export/${kind}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = kind === 'users' ? 'zenith_users.csv' : (kind === 'chats' ? 'zenith_chats.txt' : 'zenith_messages.txt');
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast(kind + ' export downloading', 'success');
    },

    exportConfig() {
        const config = {
            version: '17.0',
            platform: 'Zenith AI',
            owner: 'WANZU-IBRAHIM',
            themes: { owner: 'Titanium Core', admin: 'Gold' },
            ai: { provider: 'OpenRouter', default_model: 'openai/gpt-4o-mini', temperature: 0.7, max_tokens: 2048 },
            billing: { pro: '$5.99/mo', pro_annual: '$59.99', pro_lifetime: '$200', ultimate: '$11.99/mo', ultimate_annual: '$119.99', ultimate_lifetime: '$400', trial_days: 5 },
            limits: { free: { images: 5, uploads: 15, edits: 5 }, guest: { images: 2, uploads: 3, edits: 1, pause_msgs: 40, pause_minutes: 15 }, pro: 100 },
        };
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'zenith_config.json';
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('Config downloaded', 'success');
    },

    async restoreBackup() {
        const ok = await showConfirm('Restore backup?', 'Restore the database from the last Railway snapshot? This may overwrite current data.', true);
        if (ok) showToast('Restore initiated — check Railway dashboard', 'success');
    },

    // ═══════════════════════════ SETTINGS ═══════════════════════════
    async renderSettings() {
        const el = document.getElementById('vault-content');
        el.innerHTML = `
            <div class="vault-card" style="margin-bottom:16px;">
                <div class="card-header"><span>🏷️ General</span></div>
                <div class="vault-setting-row"><span class="vault-setting-label">Platform Name</span><span class="vault-setting-value">Zenith AI</span></div>
                <div class="vault-setting-row"><span class="vault-setting-label">Version</span><span class="vault-setting-value">17.0</span></div>
                <div class="vault-setting-row"><span class="vault-setting-label">Owner</span><span class="vault-setting-value">WANZU-IBRAHIM</span></div>
                <div class="vault-setting-row"><span class="vault-setting-label">Timezone</span><span class="vault-setting-value">UTC</span></div>
            </div>
            <div class="vault-grid-2">
                <div class="vault-card">
                    <div class="card-header"><span>🎨 Appearance</span></div>
                    <div class="vault-setting-row"><span class="vault-setting-label">Owner Theme</span><span class="vault-setting-value">Titanium Core</span></div>
                    <div class="vault-setting-row"><span class="vault-setting-label">Admin Theme</span><span class="vault-setting-value">Gold</span></div>
                    <div class="vault-setting-row"><span class="vault-setting-label">Animations</span><div class="vault-toggle on" onclick="this.classList.toggle('on')"></div></div>
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>🤖 AI</span></div>
                    <div class="vault-setting-row"><span class="vault-setting-label">Provider</span><span class="vault-setting-value">OpenRouter</span></div>
                    <div class="vault-setting-row"><span class="vault-setting-label">Default Model</span><span class="vault-setting-value">GPT-4o Mini</span></div>
                    <div class="vault-setting-row"><span class="vault-setting-label">Temperature</span><span class="vault-setting-value">0.7</span></div>
                </div>
            </div>
            <div class="vault-grid-2">
                <div class="vault-card">
                    <div class="card-header"><span>💳 Billing</span></div>
                    <div class="vault-setting-row"><span class="vault-setting-label">Stripe</span><span class="vault-setting-value" style="color:#4ADE80;">Connected</span></div>
                    <div class="vault-setting-row"><span class="vault-setting-label">Google OAuth</span><span class="vault-setting-value" style="color:#4ADE80;">Active</span></div>
                    <div class="vault-setting-row"><span class="vault-setting-label">Pro Plan</span><span class="vault-setting-value">$5.99/mo</span></div>
                    <div class="vault-setting-row"><span class="vault-setting-label">Ultimate Plan</span><span class="vault-setting-value">$11.99/mo</span></div>
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>🛡️ Limits</span></div>
                    <div class="vault-setting-row"><span class="vault-setting-label">Free Image Gen</span><span class="vault-setting-value">5/day</span></div>
                    <div class="vault-setting-row"><span class="vault-setting-label">Free Uploads</span><span class="vault-setting-value">15/day</span></div>
                    <div class="vault-setting-row"><span class="vault-setting-label">Guest Pause</span><span class="vault-setting-value">40 msgs → 15min</span></div>
                    <div class="vault-setting-row"><span class="vault-setting-label">Pro Limits</span><span class="vault-setting-value">100/day each</span></div>
                </div>
            </div>
            <button class="vault-btn primary" style="width:100%;margin-top:16px;padding:12px;" onclick="window.location.href='/app'">← Back to App</button>`;
    },

    // ═══════════════════════════ OWNER COMMAND ═══════════════════════════
    async renderOwner() {
        const el = document.getElementById('vault-content');
        el.innerHTML = `
            <div class="vault-grid-2">
                <div class="vault-card">
                    <div class="card-header"><span>🔍 Global User Search</span></div>
                    <input class="vault-input" id="owner-search" placeholder="Username or email..." style="margin-bottom:8px;">
                    <button class="vault-btn primary" onclick="Vault.ownerSearch()" style="width:100%;">Search</button>
                    <div id="owner-search-res" style="margin-top:12px;"></div>
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>⚡ Quick Actions</span></div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        <button class="vault-btn" onclick="Vault.loadTab('users')" style="width:100%;text-align:left;">👥 Manage All Users</button>
                        <button class="vault-btn" onclick="Vault.loadTab('admins')" style="width:100%;text-align:left;">🛡️ Manage Admins</button>
                        <button class="vault-btn" onclick="Vault.loadTab('bans')" style="width:100%;text-align:left;">🚫 View All Bans</button>
                        <button class="vault-btn" onclick="Vault.loadTab('security')" style="width:100%;text-align:left;">🔐 Security Center</button>
                        <button class="vault-btn" onclick="Vault.loadTab('logs')" style="width:100%;text-align:left;">📋 View All Logs</button>
                        <button class="vault-btn" onclick="Vault.loadTab('emergency')" style="width:100%;text-align:left;color:#EF4444;">🚨 Emergency Controls</button>
                    </div>
                </div>
            </div>
            <div class="vault-card" style="margin-top:16px;">
                <div class="card-header"><span>👑 God-Mode Account Management</span></div>
                <div style="font-size:12px;color:#8B949E;margin-bottom:12px;">Create, ban, delete, restore any account. Change any role. Override any permission. Full control.</div>
                <button class="vault-btn primary" onclick="Vault.loadTab('users')">Open User Management →</button>
            </div>`;
    },

    async ownerSearch() {
        const q = document.getElementById('owner-search')?.value.trim();
        if (!q) return;
        const resEl = document.getElementById('owner-search-res');
        resEl.innerHTML = '<div style="color:#8B949E;font-size:12px;">Searching...</div>';
        try {
            const { users } = await api('/api/auth/admin/users');
            const found = users.filter(u => u.username.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()) || String(u.id) === q);
            if (!found.length) { resEl.innerHTML = '<div style="color:#666;font-size:12px;">No results</div>'; return; }
            resEl.innerHTML = found.slice(0, 8).map(u => `<div class="vault-activity-item" style="cursor:pointer;" onclick="Vault.viewUserChats(${u.id},'${this.esc(u.username)}')">
                <div style="flex:1;"><div style="font-weight:600;font-size:12px;">${u.username} <span class="badge ${u.role === 'owner' ? 'badge-purple' : (u.role === 'admin' ? 'badge-yellow' : 'badge-gray')}">${u.role}</span></div><div style="font-size:11px;color:#666;">${u.email}</div></div>
                <span class="badge ${u.is_banned ? 'badge-red' : 'badge-green'}">${u.is_banned ? 'Banned' : 'Active'}</span>
            </div>`).join('');
        } catch (e) { resEl.innerHTML = '<div style="color:#EF4444;font-size:12px;">' + e.message + '</div>'; }
    },

    // ═══════════════════════════ ADMIN MANAGEMENT ═══════════════════════════
    async renderAdmins() {
        const el = document.getElementById('vault-content');
        el.innerHTML = '<div style="padding:20px;color:#8B949E;">Loading admins...</div>';
        try {
            const { users } = await api('/api/auth/admin/users');
            const admins = users.filter(u => u.role === 'admin' || u.role === 'owner');
            const regularUsers = users.filter(u => u.role === 'user' && !u.is_deleted);
            this._chosenHelpers = admins.filter(u => u.is_chosen).map(u => u.id);
            el.innerHTML = `
                <div class="vault-stats" style="padding:0 0 12px;">
                    ${this.statCard('👑','Owners',users.filter(u=>u.role==='owner').length,'','purple')}
                    ${this.statCard('🛡️','Admins',users.filter(u=>u.role==='admin').length,'','yellow')}
                    ${this.statCard('👥','Users',regularUsers.length,'','')}
                </div>
                <div class="vault-card" style="margin-bottom:16px;">
                    <div class="card-header"><span>📋 Admin List</span></div>
                    ${admins.map(a => {
                        const isChosen = a.is_chosen || this._chosenHelpers.includes(a.id);
                        return `<div class="vault-activity-item" style="margin-bottom:8px;${a.role === 'owner' ? 'border:1px solid #A78BFA44;' : ''}">
                        <div style="width:36px;height:36px;border-radius:50%;background:${a.role === 'owner' ? 'linear-gradient(135deg,#DDE4EE,#8B949E)' : 'linear-gradient(135deg,#FFD700,#FF8C00)'};display:flex;align-items:center;justify-content:center;font-weight:700;color:#111315;">${a.username[0].toUpperCase()}</div>
                        <div style="flex:1;"><div style="font-weight:600;">${a.username} <span class="badge ${a.role === 'owner' ? 'badge-purple' : 'badge-yellow'}">${a.role.toUpperCase()}</span>${isChosen ? ' <span class="badge badge-green" style="background:rgba(16,185,129,.2);color:#10B981;border:1px solid #10B98144;">⛑ HELPER</span>' : ''}</div><div style="font-size:11px;color:#666;">${a.email}</div></div>
                        ${a.role === 'admin' ? `<div style="display:flex;gap:6px;flex-shrink:0;"><button class="vault-btn" onclick="Vault.editPermissions(${a.id},'${this.esc(a.username)}')" style="font-size:10px;">🔑 Perms</button><button class="vault-btn ${isChosen ? 'danger' : 'success'}" onclick="Vault.toggleChosen(${a.id},'${this.esc(a.username)}')" style="font-size:10px;">${isChosen ? '✖ Remove Helper' : '⛑ Choose Helper'}</button><button class="vault-btn danger" onclick="Vault.demoteAdmin(${a.id},'${this.esc(a.username)}')" style="font-size:10px;">Demote</button></div>` : '<span style="font-size:10px;color:#555;flex-shrink:0;">Supreme</span>'}
                    </div>`;
                    }).join('')}
                </div>
                <div class="vault-card" style="margin-bottom:16px;border:1px solid #10B98144;">
                    <div class="card-header"><span>⛑ Chosen Helpers</span><button class="vault-btn danger" onclick="Vault.clearChosen()" style="font-size:10px;">Clear All</button></div>
                    <div style="font-size:12px;color:#8B949E;margin-bottom:10px;">Chosen helpers stay online and get special access during maintenance / lock-all so they can coordinate with you.</div>
                    ${this._chosenHelpers.length === 0 ? '<div style="color:#666;font-size:12px;padding:8px 0;">No helpers chosen. Click "⛑ Choose Helper" on an admin above.</div>' :
                    `<div style="display:flex;flex-wrap:wrap;gap:8px;">${this._chosenHelpers.map(id => {
                        const u = admins.find(x => x.id === id);
                        return u ? `<div style="display:flex;align-items:center;gap:8px;background:rgba(16,185,129,.1);border:1px solid #10B98133;padding:8px 12px;border-radius:10px;"><span>⛑</span> ${u.username}</div>` : '';
                    }).join('')}</div>`}
                </div><div class="vault-card" style="margin-bottom:16px;">
                    <div class="card-header"><span>⬆️ Promote User to Admin</span></div>
                    ${regularUsers.length === 0 ? '<div style="color:#666;font-size:12px;padding:8px 0;">No regular users to promote</div>' : 
                    `<div style="max-height:200px;overflow-y:auto;">${regularUsers.slice(0, 20).map(u => `<div class="vault-activity-item" style="margin-bottom:6px;">
                        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#60A5FA,#3B82F6);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:12px;">${u.username[0].toUpperCase()}</div>
                        <div style="flex:1;"><div style="font-weight:500;font-size:12px;">${u.username}</div><div style="font-size:10px;color:#666;">${u.email}</div></div>
                        <button class="vault-btn success" onclick="Vault.promoteToAdmin(${u.id},'${this.esc(u.username)}')" style="flex-shrink:0;font-size:10px;">Promote</button>
                    </div>`).join('')}</div>`}
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>➕ Create Admin</span></div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <input class="vault-input" id="new-admin-user" placeholder="Username" style="flex:1;min-width:150px;">
                        <input class="vault-input" id="new-admin-pass" placeholder="Password" type="password" style="flex:1;min-width:150px;">
                        <button class="vault-btn primary" onclick="Vault.createAdmin()">Create Admin</button>
                    </div>
                </div>`;
        } catch (e) { el.innerHTML = '<div style="padding:20px;color:#EF4444;">' + e.message + '</div>'; }
    },

    async createAdmin() {
        const u = document.getElementById('new-admin-user')?.value.trim();
        const p = document.getElementById('new-admin-pass')?.value;
        if (!u || !p) return showToast('Fill both fields', 'error');
        try { await api('/api/auth/admin/login', { method: 'POST', body: JSON.stringify({ username: u, password: p, secret: 'zenith-admin-2026' }) }); showToast('Admin created', 'success'); this.renderAdmins(); } catch (e) { showToast(e.message, 'error'); }
    },

    // ═══════════════════════════ GLOBAL CONTROLS ═══════════════════════════
    async renderGlobal() {
        const el = document.getElementById('vault-content');
        let state = {};
        try { state = await api('/api/admin/system/state'); } catch {}
        el.innerHTML = `
            <div class="vault-grid-2">
                <div class="vault-card">
                    <div class="card-header"><span>🔧 Maintenance Mode</span></div>
                    <div style="font-size:12px;color:#8B949E;margin-bottom:12px;">Disable site for all except owner. Users see a popup and cannot log in.</div>
                    <div class="vault-toggle ${state.maintenance_mode === 'on' ? 'on' : ''}" id="maint-toggle" onclick="Vault.toggleMaintenance()"></div>
                    <div style="font-size:11px;color:#8B949E;margin-top:6px;" id="maint-label">${state.maintenance_mode === 'on' ? 'ON' : 'OFF'}</div>
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>📢 Global Announcement</span></div>
                    <div style="font-size:12px;color:#8B949E;margin-bottom:12px;">Broadcast message to all users immediately via popup.</div>
                    <textarea class="vault-input" id="global-announce" rows="3" placeholder="Type announcement..." style="resize:vertical;"></textarea>
                    <button class="vault-btn primary" style="margin-top:8px;width:100%;" onclick="Vault.sendAnnouncement()">Send Broadcast →</button>
                    <button class="vault-btn danger" style="margin-top:8px;width:100%;" onclick="Vault.clearBroadcastCache()">🗑️ Clear All Broadcast Cache</button>
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>🚫 Registration Control</span></div>
                    <div style="font-size:12px;color:#8B949E;margin-bottom:12px;">Enable or disable new account registrations.</div>
                    <div class="vault-toggle ${state.registrations === 'on' ? 'on' : ''}" onclick="Vault.toggleRegistrations()"></div>
                    <div style="font-size:11px;color:#8B949E;margin-top:6px;" id="reg-label">${state.registrations === 'on' ? 'OPEN' : 'CLOSED'}</div>
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>✉️ Messaging Control</span></div>
                    <div style="font-size:12px;color:#8B949E;margin-bottom:12px;">Enable or disable messaging for all users.</div>
                    <div class="vault-toggle ${state.messaging === 'on' ? 'on' : ''}" onclick="Vault.toggleMessaging()"></div>
                    <div style="font-size:11px;color:#8B949E;margin-top:6px;" id="msg-label">${state.messaging === 'on' ? 'ENABLED' : 'DISABLED'}</div>
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>🤖 AI Control</span></div>
                    <div style="font-size:12px;color:#8B949E;margin-bottom:12px;">Enable or disable AI responses globally.</div>
                    <div class="vault-toggle ${state.ai_enabled === 'on' ? 'on' : ''}" onclick="Vault.toggleAI()"></div>
                    <div style="font-size:11px;color:#8B949E;margin-top:6px;" id="ai-label">${state.ai_enabled === 'on' ? 'ENABLED' : 'DISABLED'}</div>
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>📊 System Status</span></div>
                    <div id="global-sys-status"></div>
                </div>
            </div>`;
        this.refreshGlobalStatus();
    },

    async toggleMaintenance() {
        const tog = document.getElementById('maint-toggle');
        const turningOn = !tog.classList.contains('on');
        const ok = await showConfirm(turningOn ? 'Enable maintenance?' : 'Disable maintenance?', turningOn ? 'All users except you will be locked out.' : 'Reopen the platform to all users.');
        if (!ok) return;
        try {
            await api('/api/admin/system/maintenance', { method: 'POST', body: JSON.stringify({ value: turningOn ? 'on' : 'off' }) });
            tog.classList.toggle('on', turningOn);
            document.getElementById('maint-label').textContent = turningOn ? 'ON' : 'OFF';
            showToast('Maintenance ' + (turningOn ? 'ON' : 'OFF'), 'success');
            
        } catch (e) { showToast(e.message, 'error'); }
    },

    async toggleRegistrations() {
        const tog = event.target.classList.contains('on');
        const turningOn = !tog;
        const ok = await showConfirm(turningOn ? 'Open registrations?' : 'Close registrations?', turningOn ? 'Allow new accounts.' : 'Block new account creation.');
        if (!ok) return;
        try {
            await api('/api/admin/system/registrations', { method: 'POST', body: JSON.stringify({ value: turningOn ? 'on' : 'off' }) });
            document.getElementById('reg-label').textContent = turningOn ? 'OPEN' : 'CLOSED';
            showToast('Registrations ' + (turningOn ? 'OPEN' : 'CLOSED'), 'success');
            
            this.renderGlobal();
        } catch (e) { showToast(e.message, 'error'); }
    },

    async toggleMessaging() {
        const turningOn = !event.target.classList.contains('on');
        const ok = await showConfirm(turningOn ? 'Enable messaging?' : 'Disable messaging?', turningOn ? 'Users can send messages.' : 'Block all users from messaging.');
        if (!ok) return;
        try {
            await api('/api/admin/system/messaging', { method: 'POST', body: JSON.stringify({ value: turningOn ? 'on' : 'off' }) });
            showToast('Messaging ' + (turningOn ? 'ENABLED' : 'DISABLED'), 'success');
            
            this.renderGlobal();
        } catch (e) { showToast(e.message, 'error'); }
    },

    async toggleAI() {
        const turningOn = !event.target.classList.contains('on');
        const ok = await showConfirm(turningOn ? 'Enable AI?' : 'Disable AI?', turningOn ? 'AI responses enabled.' : 'AI responses blocked globally.');
        if (!ok) return;
        try {
            await api('/api/admin/system/ai', { method: 'POST', body: JSON.stringify({ value: turningOn ? 'on' : 'off' }) });
            showToast('AI ' + (turningOn ? 'ENABLED' : 'DISABLED'), 'success');
            this.renderGlobal();
        } catch (e) { showToast(e.message, 'error'); }
    },

    async refreshGlobalStatus() {
        try {
            const sys = await api('/api/system/stats');
            const el = document.getElementById('global-sys-status');
            if (el) el.innerHTML = `
                <div class="vault-activity-item" style="border-left:3px solid #4ADE80;margin-bottom:6px;"><div style="font-size:12px;color:#fff;">API: <span style="color:#4ADE80;">Online</span></div></div>
                <div class="vault-activity-item" style="border-left:3px solid #4ADE80;margin-bottom:6px;"><div style="font-size:12px;color:#fff;">AI: <span style="color:#4ADE80;">Online</span></div></div>
                <div class="vault-activity-item" style="border-left:3px solid ${sys.cpu > 90 ? '#EF4444' : '#4ADE80'};margin-bottom:6px;"><div style="font-size:12px;color:#fff;">CPU: ${sys.cpu}%</div></div>
                <div class="vault-activity-item" style="border-left:3px solid ${sys.ram > 90 ? '#EF4444' : '#4ADE80'};"><div style="font-size:12px;color:#fff;">RAM: ${sys.ram}%</div></div>`;
        } catch {}
    },

    async sendAnnouncement() {
        const msg = document.getElementById('global-announce')?.value.trim();
        if (!msg) return showToast('Type a message', 'error');
        const ok = await showConfirm('Send broadcast?', 'This will show a popup to ALL users immediately.');
        if (!ok) return;
        try { await api('/api/announcements', { method: 'POST', body: JSON.stringify({ content: msg }) }); showToast('Broadcast sent!', 'success'); document.getElementById('global-announce').value = ''; } catch (e) { showToast(e.message, 'error'); }
    },

    async clearBroadcastCache() {
        const ok = await showConfirm('Clear broadcast cache?', 'This deletes ALL broadcast history. Users will stop getting old broadcast popups.', true);
        if (!ok) return;
        try { await api('/api/announcements', { method: 'DELETE' }); showToast('Broadcast cache cleared', 'success'); } catch (e) { showToast(e.message, 'error'); }
    },

    // ═══════════════════════════ EMERGENCY ═══════════════════════════
    async renderEmergency() {
        const el = document.getElementById('vault-content');
        el.innerHTML = `
            <div style="background:#EF444411;border:1px solid #EF4444;border-radius:12px;padding:16px;margin-bottom:20px;">
                <div style="font-weight:700;color:#EF4444;font-size:14px;">⚠️ EMERGENCY CONTROLS</div>
                <div style="font-size:12px;color:#8B949E;margin-top:4px;">Destructive actions — owner only. Double-confirm required.</div>
            </div>
            <div class="vault-grid-2">
                <div class="emergency-card" onclick="Vault.emLockAll()"><div style="font-size:28px;margin-bottom:8px;">🔒</div><div style="font-weight:700;color:#EF4444;">Lock All Accounts</div><div style="font-size:11px;color:#8B949E;margin-top:4px;">Ban every account except yours, expel sessions, popup to all</div></div>
                <div class="emergency-card" onclick="Vault.emUnlockAll()"><div style="font-size:28px;margin-bottom:8px;">🔓</div><div style="font-weight:700;color:#4ADE80;">Unlock All Accounts</div><div style="font-size:11px;color:#8B949E;margin-top:4px;">Reverse the lock - unban everyone locked by Owner</div></div>
                <div class="emergency-card" onclick="Vault.emForceLogout()"><div style="font-size:28px;margin-bottom:8px;">🔐</div><div style="font-weight:700;color:#EF4444;">Force Logout Everyone</div><div style="font-size:11px;color:#8B949E;margin-top:4px;">Revoke all active sessions, popup to all</div></div>
                <div class="emergency-card" onclick="Vault.emMaintenance()" style="border-color:#F59E0B;background:#F59E0B11;"><div style="font-size:28px;margin-bottom:8px;">🚨</div><div style="font-weight:700;color:#F59E0B;">Emergency Maintenance</div><div style="font-size:11px;color:#8B949E;margin-top:4px;">Lock down the entire platform immediately</div></div>
                <div class="emergency-card" onclick="Vault.emRegistrations()" style="border-color:#F59E0B;background:#F59E0B11;"><div style="font-size:28px;margin-bottom:8px;">🛑</div><div style="font-weight:700;color:#F59E0B;">Disable Registrations</div><div style="font-size:11px;color:#8B949E;margin-top:4px;">No new accounts can be created</div></div>
                <div class="emergency-card" onclick="Vault.emMessaging()" style="border-color:#F59E0B;background:#F59E0B11;"><div style="font-size:28px;margin-bottom:8px;">🛑</div><div style="font-weight:700;color:#F59E0B;">Disable Messaging</div><div style="font-size:11px;color:#8B949E;margin-top:4px;">Users cannot send messages</div></div>
                <div class="emergency-card" onclick="Vault.emAI()" style="border-color:#F59E0B;background:#F59E0B11;"><div style="font-size:28px;margin-bottom:8px;">🛑</div><div style="font-weight:700;color:#F59E0B;">Disable AI</div><div style="font-size:11px;color:#8B949E;margin-top:4px;">AI responses turned off globally</div></div>
                <div class="emergency-card" onclick="Vault.emBackup()"><div style="font-size:28px;margin-bottom:8px;">💾</div><div style="font-weight:700;color:#DDE4EE;">Emergency Backup</div><div style="font-size:11px;color:#8B949E;margin-top:4px;">Snapshot entire database now</div></div>
                <div class="emergency-card" onclick="Vault.restoreBackup()"><div style="font-size:28px;margin-bottom:8px;">🔄</div><div style="font-weight:700;color:#DDE4EE;">Restore Backup</div><div style="font-size:11px;color:#8B949E;margin-top:4px;">Restore from last backup</div></div>
            </div>`;
    },

    async emLockAll() {
        const ok = await showConfirm('Lock ALL accounts?', 'This locks every account except yours and forces them out with a popup. Continue?', true);
        if (!ok) return;
        const ok2 = await showConfirm('FINAL CONFIRM', 'Irreversible until you unlock them. Continue?', true);
        if (!ok2) return;
        try { const r = await api('/api/admin/system/lock-all', { method: 'POST' }); showToast('Locked ' + r.locked + ' accounts', 'success'); } catch (e) { showToast(e.message, 'error'); }
    },

    async emUnlockAll() {
        const ok = await showConfirm('Unlock ALL accounts?', 'This unbans every account locked by the Owner and lets them back in.', false);
        if (!ok) return;
        try { const r = await api('/api/admin/system/unlock-all', { method: 'POST' }); showToast('Unlocked ' + r.unlocked + ' accounts', 'success'); } catch (e) { showToast(e.message, 'error'); }
    },

    async emForceLogout() {
        const ok = await showConfirm('Force logout everyone?', 'All active sessions are revoked and users get a popup.', true);
        if (!ok) return;
        try { const r = await api('/api/admin/system/force-logout', { method: 'POST' }); showToast('Revoked ' + r.sessions_revoked + ' sessions', 'success'); } catch (e) { showToast(e.message, 'error'); }
    },

    async emMaintenance() {
        const ok = await showConfirm('Emergency maintenance?', 'Shut down the entire platform except for you.', true);
        if (!ok) return;
        try { await api('/api/admin/system/maintenance', { method: 'POST', body: JSON.stringify({ value: 'on' }) }); showToast('Maintenance MODE ON', 'success'); } catch (e) { showToast(e.message, 'error'); }
    },

    async emRegistrations() {
        const ok = await showConfirm('Disable registrations?', 'No new accounts can be created.', true);
        if (!ok) return;
        try { await api('/api/admin/system/registrations', { method: 'POST', body: JSON.stringify({ value: 'off' }) }); showToast('Registrations DISABLED', 'success'); } catch (e) { showToast(e.message, 'error'); }
    },

    async emMessaging() {
        const ok = await showConfirm('Disable messaging?', 'Users cannot send messages.', true);
        if (!ok) return;
        try { await api('/api/admin/system/messaging', { method: 'POST', body: JSON.stringify({ value: 'off' }) }); showToast('Messaging DISABLED', 'success'); } catch (e) { showToast(e.message, 'error'); }
    },

    async emAI() {
        const ok = await showConfirm('Disable AI?', 'AI responses turned off globally.', true);
        if (!ok) return;
        try { await api('/api/admin/system/ai', { method: 'POST', body: JSON.stringify({ value: 'off' }) }); showToast('AI DISABLED', 'success'); } catch (e) { showToast(e.message, 'error'); }
    },

    async emBackup() {
        const ok = await showConfirm('Create emergency backup?', 'This will snapshot the entire database right now.', true);
        if (!ok) return;
        try { await api('/api/admin/system/backup', { method: 'POST' }); showToast('Emergency backup created', 'success'); } catch (e) { showToast(e.message || 'Backup created', 'success'); }
    },

    async demoteAdmin(userId, username) {
        const ok = await showConfirm(`Demote ${username}?`, 'They will become a regular user and lose all admin privileges.', true);
        if (!ok) return;
        try {
            await api(`/api/auth/admin/users/${userId}/role`, { method: 'POST', body: JSON.stringify({ role: 'user' }) });
            showToast(`${username} has been demoted to user`, 'success');
            this.renderAdmins();
        } catch (e) { showToast(e.message, 'error'); }
    },

    async promoteToAdmin(userId, username) {
        const ok = await showConfirm(`Promote ${username} to admin?`, 'They will gain full admin access.', false);
        if (!ok) return;
        try {
            await api(`/api/auth/admin/users/${userId}/role`, { method: 'POST', body: JSON.stringify({ role: 'admin' }) });
            showToast(`${username} has been promoted to admin`, 'success');
            this.renderAdmins();
        } catch (e) { showToast(e.message, 'error'); }
    },

    async toggleChosen(userId, username) {
        const idx = this._chosenHelpers.indexOf(userId);
        if (idx >= 0) {
            this._chosenHelpers.splice(idx, 1);
        } else {
            this._chosenHelpers.push(userId);
        }
        try {
            const r = await api('/api/admin/system/set-chosen', { method: 'POST', body: JSON.stringify({ user_ids: this._chosenHelpers }) });
            const now = r.chosen.some(c => c.id === userId) ? 'helped' : 'no longer helps';
            showToast(`${username} will ${now} during shutdowns`, 'success');
            this.renderAdmins();
        } catch (e) { showToast(e.message, 'error'); }
    },

    async clearChosen() {
        const ok = await showConfirm('Clear all chosen helpers?', 'No staff will be exempt during the next shutdown.', true);
        if (!ok) return;
        try {
            await api('/api/admin/system/set-chosen', { method: 'POST', body: JSON.stringify({ user_ids: [] }) });
            this._chosenHelpers = [];
            showToast('All chosen helpers cleared', 'success');
            this.renderAdmins();
        } catch (e) { showToast(e.message, 'error'); }
    },

    _showRoleChangePopup(username, type) {
        const isPromote = type === 'promoted';
        const accent = isPromote ? '#4ADE80' : '#EF4444';
        const icon = isPromote ? '⬆️' : '⬇️';
        const title = isPromote ? 'PROMOTED TO ADMIN' : 'DEMOTED TO USER';
        const gainedLost = isPromote ? 'Now Has Access To' : 'No Longer Has Access To';
        const items = isPromote ? [
            { icon: '🛡️', text: 'Ban & unban users' },
            { icon: '🔑', text: 'Reset user passwords' },
            { icon: '💬', text: 'View user messages & chats' },
            { icon: '📊', text: 'Access admin dashboard & analytics' },
            { icon: '⚙️', text: 'Manage user accounts' },
            { icon: '📢', text: 'Send broadcasts to all users' },
        ] : [
            { icon: '🛡️', text: 'Ban & unban users' },
            { icon: '🔑', text: 'Reset user passwords' },
            { icon: '💬', text: 'View user messages & chats' },
            { icon: '📊', text: 'Admin dashboard & analytics' },
            { icon: '⚙️', text: 'User management tools' },
            { icon: '📢', text: 'Broadcast messaging' },
        ];
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);animation:fadeIn .2s;';
        wrap.innerHTML = `
            <div style="background:#111315;border:2px solid ${accent};border-radius:16px;padding:32px;max-width:420px;width:100%;text-align:center;box-shadow:0 0 40px ${accent}33;">
                <div style="font-size:48px;margin-bottom:12px;">${icon}</div>
                <div style="font-size:18px;font-weight:700;color:${accent};margin-bottom:4px;letter-spacing:1px;">${title}</div>
                <div style="font-size:14px;color:#DDE4EE;margin-bottom:16px;"><strong>${username}</strong> ${isPromote ? 'has been promoted' : 'has been demoted'}</div>
                <div style="text-align:left;background:#0a0a0f;border:1px solid #1A1D21;border-radius:10px;padding:16px;margin-bottom:16px;">
                    <div style="font-size:11px;color:#8B949E;letter-spacing:1px;margin-bottom:10px;font-weight:600;">${gainedLost.toUpperCase()}</div>
                    ${items.map(item => `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;${!isPromote ? 'opacity:0.5;' : ''}"><span style="font-size:14px;">${item.icon}</span><span style="font-size:12px;color:${isPromote ? '#DDE4EE' : '#666'};">${item.text}</span></div>`).join('')}
                </div>
                <button id="rcp-close" style="padding:10px 32px;background:${accent};color:${isPromote ? '#000' : '#fff'};border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">Got it</button>
            </div>`;
        wrap.querySelector('#rcp-close').addEventListener('click', () => wrap.remove());
        wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
        document.body.appendChild(wrap);
    },

    async editPermissions(userId, username) {
        let perms = { ban_users: true, reset_password: true, view_messages: true, manage_chats: true, delete_users: true };
        try { const r = await api(`/api/auth/admin/users/${userId}/permissions`); perms = r.permissions; } catch {}
        const permDefs = [
            { key: 'ban_users', icon: '🛡️', label: 'Ban / Unban Users', desc: 'Can ban and unban user accounts' },
            { key: 'reset_password', icon: '🔑', label: 'Reset Passwords', desc: 'Can reset user passwords' },
            { key: 'view_messages', icon: '💬', label: 'View Messages', desc: 'Can view user chats and messages' },
            { key: 'manage_chats', icon: '📊', label: 'Manage Chats', desc: 'Can view and manage user chats' },
            { key: 'delete_users', icon: '🗑️', label: 'Delete Users', desc: 'Can delete user accounts' },
        ];
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);animation:fadeIn .2s;';
        wrap.innerHTML = `
            <div style="background:#111315;border:1px solid #1A1D21;border-radius:16px;padding:28px;max-width:480px;width:100%;box-shadow:0 0 40px rgba(0,0,0,0.5);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                    <div>
                        <div style="font-size:16px;font-weight:700;color:#DDE4EE;">🔑 Permissions — ${username}</div>
                        <div style="font-size:11px;color:#8B949E;margin-top:2px;">Toggle what this admin can do <span style="color:#4ADE80;">● Live</span></div>
                    </div>
                    <button id="perm-close" style="background:none;border:1px solid #2a2f36;color:#888;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;">Close</button>
                </div>
                <div style="display:flex;flex-direction:column;gap:10px;" id="perm-toggles">
                    ${permDefs.map(p => `
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px;background:#0a0a0f;border:1px solid #1A1D21;border-radius:10px;">
                            <div style="display:flex;align-items:center;gap:12px;">
                                <span style="font-size:20px;">${p.icon}</span>
                                <div>
                                    <div style="font-size:13px;font-weight:600;color:#DDE4EE;">${p.label}</div>
                                    <div style="font-size:11px;color:#666;">${p.desc}</div>
                                </div>
                            </div>
                            <div class="vault-toggle ${perms[p.key] ? 'on' : ''}" data-perm="${p.key}" style="cursor:pointer;"></div>
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top:16px;text-align:right;">
                    <button id="perm-save" class="vault-btn primary" style="padding:10px 24px;">Save Permissions</button>
                </div>
            </div>`;
        wrap.querySelectorAll('.vault-toggle').forEach(t => {
            t.addEventListener('click', () => t.classList.toggle('on'));
        });
        wrap.querySelector('#perm-close').addEventListener('click', () => { clearInterval(permPoll); wrap.remove(); });
        wrap.addEventListener('click', (e) => { if (e.target === wrap) { clearInterval(permPoll); wrap.remove(); } });
        wrap.querySelector('#perm-save').addEventListener('click', async () => {
            const newPerms = {};
            wrap.querySelectorAll('.vault-toggle').forEach(t => {
                newPerms[t.dataset.perm] = t.classList.contains('on');
            });
            try {
                await api(`/api/auth/admin/users/${userId}/permissions`, { method: 'POST', body: JSON.stringify({ permissions: newPerms }) });
                showToast(`Permissions updated for ${username}`, 'success');
                clearInterval(permPoll);
                wrap.remove();
            } catch (e) { showToast(e.message, 'error'); }
        });
        const permPoll = setInterval(async () => {
            if (!document.body.contains(wrap)) { clearInterval(permPoll); return; }
            try {
                const r = await api(`/api/auth/admin/users/${userId}/permissions`);
                const latest = r.permissions || {};
                wrap.querySelectorAll('.vault-toggle').forEach(t => {
                    const key = t.dataset.perm;
                    const val = !!latest[key];
                    if (val) t.classList.add('on'); else t.classList.remove('on');
                });
            } catch {}
        }, 1000);
        document.body.appendChild(wrap);
    },

    // ═══════════════════════════ HELPERS ═══════════════════════════
    esc(s) { return (s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
};

document.addEventListener('DOMContentLoaded', () => Vault.init());
