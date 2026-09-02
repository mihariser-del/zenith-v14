const Vault = {
    _isOwner: false,
    _currentTab: 'dashboard',
    _pollInterval: null,
    _sysPollInterval: null,
    _cache: {},

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
            a.addEventListener('click', () => {
                document.querySelectorAll('#vault-nav a').forEach(x => x.classList.remove('active'));
                a.classList.add('active');
                this.loadTab(a.dataset.tab);
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
    },

    startPolling() {
        if (this._pollInterval) clearInterval(this._pollInterval);
        if (this._sysPollInterval) clearInterval(this._sysPollInterval);
        this._pollInterval = setInterval(() => {
            if (this._currentTab === 'dashboard') this.refreshDashboardStats();
        }, 100);
        this._sysPollInterval = setInterval(() => {
            if (this._currentTab === 'dashboard') this.refreshSystemStats();
            this.refreshOnlineCount();
        }, 1000);
    },

    async refreshOnlineCount() {
        try {
            const d = await api('/api/auth/admin/analytics/overview');
            document.getElementById('vault-online-count').textContent = d.online_users + ' online';
            document.getElementById('vault-cache', d);
        } catch {}
    },

    // ═══════════════════════════ SVG CHARTS ═══════════════════════════
    svgLine(data, w, h, color, fill = false) {
        if (!data.length) return '';
        const max = Math.max(...data.map(d => d.count || d.value || 0), 1);
        const pad = 4;
        const step = (w - pad * 2) / Math.max(data.length - 1, 1);
        let path = '';
        let fillPath = `M${pad},${h - pad}`;
        data.forEach((d, i) => {
            const v = d.count || d.value || 0;
            const x = pad + i * step;
            const y = h - pad - (v / max) * (h - pad * 2);
            path += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
            fillPath += 'L' + x.toFixed(1) + ',' + y.toFixed(1);
        });
        fillPath += `L${pad + (data.length - 1) * step},${h - pad}Z`;
        let svg = `<svg viewBox="0 0 ${w} ${h}" class="vault-chart-svg" preserveAspectRatio="none">`;
        if (fill) svg += `<path d="${fillPath}" fill="${color}" opacity="0.15"/>`;
        svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
        const last = data[data.length - 1];
        const lv = last.count || last.value || 0;
        const lx = pad + (data.length - 1) * step;
        const ly = h - pad - (lv / max) * (h - pad * 2);
        svg += `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3" fill="${color}"/>`;
        svg += `<text x="${lx.toFixed(1)}" y="${ly - 6}" fill="${color}" font-size="10" text-anchor="middle" font-weight="600">${lv}</text>`;
        svg += '</svg>';
        return svg;
    },

    svgBar(data, w, h, color) {
        if (!data.length) return '';
        const max = Math.max(...data.map(d => d.count || d.value || 0), 1);
        const pad = 4;
        const barW = Math.max((w - pad * 2) / data.length - 2, 3);
        let svg = `<svg viewBox="0 0 ${w} ${h}" class="vault-chart-svg" preserveAspectRatio="none">`;
        data.forEach((d, i) => {
            const v = d.count || d.value || 0;
            const bh = (v / max) * (h - pad * 2);
            const x = pad + i * ((w - pad * 2) / data.length) + 1;
            const y = h - pad - bh;
            svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${color}" rx="2" opacity="0.8"/>`;
        });
        svg += '</svg>';
        return svg;
    },

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
                <div class="vault-grid">
                    <div class="vault-card">
                        <div class="card-header"><span>📈 Message Activity (30d)</span></div>
                        <div style="height:140px;" id="chart-messages">${this.svgLine(msgDay.days, 500, 140, '#8B5CF6', true)}</div>
                    </div>
                    <div class="vault-card">
                        <div class="card-header"><span>💬 Chat Activity (30d)</span></div>
                        <div style="height:140px;" id="chart-chats">${this.svgBar(chatDay.days, 500, 140, '#60A5FA')}</div>
                    </div>
                </div>
                <div class="vault-grid">
                    <div class="vault-card">
                        <div class="card-header"><span>🆕 Account Growth (30d)</span></div>
                        <div style="height:120px;" id="chart-accounts">${this.svgLine(accDay.days, 500, 120, '#4ADE80', true)}</div>
                    </div>
                    <div class="vault-card">
                        <div class="card-header"><span>🖥️ System Health</span></div>
                        <div id="dash-system" style="display:flex;gap:16px;justify-content:center;padding:12px 0;">
                            ${sys ? this.renderGauges(sys) : '<div style="color:#666;">Loading system...</div>'}
                        </div>
                        <div style="font-size:11px;color:#4ADE80;text-align:center;margin-top:8px;">✓ All systems operational</div>
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
            <div class="vault-gauge" style="width:80px;height:80px;">${this.svgGauge(sys.cpu, 100, 80, '#60A5FA')}</div>
            <div class="vault-gauge" style="width:80px;height:80px;">${this.svgGauge(sys.ram, 100, 80, '#A78BFA')}</div>
            <div class="vault-gauge" style="width:80px;height:80px;">${this.svgGauge(sys.storage, 100, 80, '#4ADE80')}</div>`;
    },

    async loadRecentAccounts() {
        const el = document.getElementById('dash-recent');
        if (!el) return;
        try {
            const { users } = await api('/api/auth/admin/users');
            el.innerHTML = users.slice(0, 5).map((u, i) => {
                const sc = u.is_banned ? 'badge-red' : (u.is_deleted ? 'badge-gray' : (u.role === 'owner' ? 'badge-purple' : (u.role === 'admin' ? 'badge-yellow' : 'badge-green')));
                const st = u.is_banned ? 'Banned' : (u.is_deleted ? 'Deleted' : (u.role === 'owner' ? 'Owner' : (u.role === 'admin' ? 'Admin' : 'Active')));
                return `<div class="vault-activity-item"><div style="color:#8B949E;font-size:11px;width:20px;">${i + 1}</div><div style="flex:1;min-width:0;"><div style="color:#a78bfa;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.username}</div><div style="color:#666;font-size:11px;">${u.created_at}</div></div><span class="badge ${sc}">${st}</span></div>`;
            }).join('');
        } catch { el.innerHTML = '<div style="color:#666;font-size:12px;">No data</div>'; }
    },

    async loadActivityFeed() {
        const el = document.getElementById('dash-activity');
        if (!el) return;
        try {
            const { users } = await api('/api/auth/admin/users');
            let html = '';
            users.filter(u => u.is_banned).slice(0, 3).forEach(u => {
                html += `<div class="vault-activity-item"><span style="color:#EF4444;">🚫</span><div><div style="color:#a78bfa;font-size:12px;">Banned: ${u.username}</div><div style="color:#666;font-size:11px;">${u.ban_reason || 'No reason'}</div></div></div>`;
            });
            users.slice(0, 4).forEach(u => {
                html += `<div class="vault-activity-item"><span style="color:#4ADE80;">👤</span><div><div style="color:#a78bfa;font-size:12px;">${u.username}</div><div style="color:#666;font-size:11px;">${u.created_at} — ${u.last_active || 'Never'}</div></div></div>`;
            });
            el.innerHTML = html || '<div style="color:#666;font-size:12px;text-align:center;padding:20px;">No activity</div>';
        } catch { el.innerHTML = ''; }
    },

    async loadHourlyChart() {
        try {
            const d = await api('/api/auth/admin/analytics/messages-per-hour');
            const el = document.getElementById('chart-hourly');
            if (el) el.innerHTML = this.svgBar(d.hours.map(h => ({ count: h.count })), 500, 100, '#A78BFA');
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
        tbody.innerHTML = users.map((u, i) => {
            const sc = u.is_banned ? 'badge-red' : (u.is_deleted ? 'badge-gray' : (u.role === 'owner' ? 'badge-purple' : (u.role === 'admin' ? 'badge-yellow' : 'badge-green')));
            const st = u.is_banned ? 'Banned' : (u.is_deleted ? 'Deleted' : (u.role === 'owner' ? 'Owner' : (u.role === 'admin' ? 'Admin' : 'Active')));
            return `<tr>
                <td style="color:#8B949E;">${i + 1}</td>
                <td><div style="font-weight:600;">${u.username}</div></td>
                <td style="color:#8B949E;">${u.email}</td>
                <td><span class="badge ${u.role === 'owner' ? 'badge-purple' : (u.role === 'admin' ? 'badge-yellow' : 'badge-gray')}">${u.role}</span></td>
                <td><span class="badge ${sc}">${st}</span></td>
                <td>${u.chat_count || 0}</td>
                <td>${u.message_count || 0}</td>
                <td style="color:#8B949E;font-size:11px;">${u.last_active || 'Never'}</td>
                <td><div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <button class="vault-btn" onclick="Vault.viewUserChats(${u.id},'${this.esc(u.username)}')">💬</button>
                    <button class="vault-btn" onclick="Vault.resetUser(${u.id},'${this.esc(u.username)}')">🔑</button>
                    <button class="vault-btn ${u.is_banned ? 'success' : 'danger'}" onclick="Vault.banUser(${u.id},'${this.esc(u.username)}',${u.is_banned})">${u.is_banned ? 'Unban' : 'Ban'}</button>
                    <button class="vault-btn danger" onclick="Vault.deleteUser(${u.id},'${this.esc(u.username)}')">🗑️</button>
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
        if (isBanned) { try { await api(`/api/auth/admin/users/${id}/unban`, { method: 'POST' }); showToast('Unbanned ' + username, 'success'); this.loadTab(this._currentTab); } catch (e) { showToast(e.message, 'error'); } }
        else { const r = await showPrompt('Ban reason', '', 'Reason for banning ' + username); if (!r || !r.trim()) return; try { await api(`/api/auth/admin/users/${id}/ban`, { method: 'POST', body: JSON.stringify({ reason: r.trim() }) }); showToast('Banned ' + username, 'success'); this.loadTab(this._currentTab); } catch (e) { showToast(e.message, 'error'); } }
    },

    async deleteUser(id, username) {
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
            const { messages } = await api(`/api/chats/${chatId}/messages`);
            let html = `<div class="vault-modal-overlay" onclick="if(event.target===this)this.remove()"><div class="vault-modal"><div class="vault-modal-header"><h3 style="color:#DDE4EE;">✉️ ${title}</h3><button class="vault-btn" onclick="this.closest('.vault-modal-overlay').remove()">Close</button></div>`;
            (messages || []).forEach(m => {
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
            <td><span class="badge badge-yellow">${u.banned_by || '?'}</span></td>
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
                            <td><span class="badge badge-yellow">${u.deleted_by || '?'}</span></td>
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
                    <div style="overflow-x:auto;">
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
        el.innerHTML = `
            <div class="vault-stats" style="padding:0 0 12px;">
                ${this.statCard('💾','Database','SQLite','','info')}
                ${this.statCard('📁','Storage','/data/zenith.db','','')}
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
                    <div style="font-weight:600;color:#DDE4EE;margin-bottom:4px;">User Data</div>
                    <div style="font-size:11px;color:#8B949E;margin-bottom:12px;">Export all user data</div>
                    <button class="vault-btn" onclick="showToast('User export started','success')">Export Users</button>
                </div>
                <div class="vault-card" style="text-align:center;">
                    <div style="font-size:28px;margin-bottom:8px;">💬</div>
                    <div style="font-weight:600;color:#DDE4EE;margin-bottom:4px;">Chat Data</div>
                    <div style="font-size:11px;color:#8B949E;margin-bottom:12px;">Export all conversations</div>
                    <button class="vault-btn" onclick="showToast('Chat export started','success')">Export Chats</button>
                </div>
            </div>
            <div class="vault-card" style="margin-top:16px;">
                <div class="card-header"><span>📋 Backup Schedule</span></div>
                <div class="vault-setting-row"><span class="vault-setting-label">Automatic Backups</span><span class="vault-setting-value" style="color:#4ADE80;">Enabled (Railway)</span></div>
                <div class="vault-setting-row"><span class="vault-setting-label">Retention Period</span><span class="vault-setting-value">30 days</span></div>
                <div class="vault-setting-row"><span class="vault-setting-label">Last Backup</span><span class="vault-setting-value">Continuous (volume)</span></div>
            </div>`;
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
            el.innerHTML = `
                <div class="vault-stats" style="padding:0 0 12px;">
                    ${this.statCard('👑','Owners',users.filter(u=>u.role==='owner').length,'','purple')}
                    ${this.statCard('🛡️','Admins',users.filter(u=>u.role==='admin').length,'','yellow')}
                </div>
                <div class="vault-card" style="margin-bottom:16px;">
                    <div class="card-header"><span>📋 Admin List</span></div>
                    ${admins.map(a => `<div class="vault-activity-item" style="margin-bottom:8px;">
                        <div style="width:36px;height:36px;border-radius:50%;background:${a.role === 'owner' ? 'linear-gradient(135deg,#DDE4EE,#8B949E)' : 'linear-gradient(135deg,#FFD700,#FF8C00)'};display:flex;align-items:center;justify-content:center;font-weight:700;color:#111315;">${a.username[0].toUpperCase()}</div>
                        <div style="flex:1;"><div style="font-weight:600;">${a.username} <span class="badge ${a.role === 'owner' ? 'badge-purple' : 'badge-yellow'}">${a.role.toUpperCase()}</span></div><div style="font-size:11px;color:#666;">${a.email}</div></div>
                    </div>`).join('')}
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
        el.innerHTML = `
            <div class="vault-grid-2">
                <div class="vault-card">
                    <div class="card-header"><span>🔧 Maintenance Mode</span></div>
                    <div style="font-size:12px;color:#8B949E;margin-bottom:12px;">Disable site for all except owner. Users see maintenance page.</div>
                    <div class="vault-toggle" id="maint-toggle" onclick="this.classList.toggle('on');showToast(this.classList.contains('on')?'Maintenance ON':'Maintenance OFF','')"></div>
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>📢 Global Announcement</span></div>
                    <div style="font-size:12px;color:#8B949E;margin-bottom:12px;">Broadcast message to all users in real-time.</div>
                    <textarea class="vault-input" id="global-announce" rows="3" placeholder="Type announcement..." style="resize:vertical;"></textarea>
                    <button class="vault-btn primary" style="margin-top:8px;width:100%;" onclick="Vault.sendAnnouncement()">Send Broadcast</button>
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>🚫 Registration Control</span></div>
                    <div style="font-size:12px;color:#8B949E;margin-bottom:12px;">Enable or disable new account registrations.</div>
                    <div class="vault-toggle on" onclick="this.classList.toggle('on');showToast(this.classList.contains('on')?'Registrations enabled':'Registrations disabled','')"></div>
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>✉️ Messaging Control</span></div>
                    <div style="font-size:12px;color:#8B949E;margin-bottom:12px;">Enable or disable AI messaging for all users.</div>
                    <div class="vault-toggle on" onclick="this.classList.toggle('on');showToast(this.classList.contains('on')?'Messaging enabled':'Messaging disabled','')"></div>
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>🤖 AI Control</span></div>
                    <div style="font-size:12px;color:#8B949E;margin-bottom:12px;">Enable or disable AI responses globally.</div>
                    <div class="vault-toggle on" onclick="this.classList.toggle('on');showToast(this.classList.contains('on')?'AI enabled':'AI disabled','')"></div>
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>📊 System Status</span></div>
                    <div style="font-size:12px;color:#8B949E;margin-bottom:12px;">Monitor all system services.</div>
                    <div id="global-sys-status"></div>
                </div>
            </div>`;
        this.refreshGlobalStatus();
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
        try { await api('/api/announcements', { method: 'POST', body: JSON.stringify({ content: msg }) }); showToast('Broadcast sent!', 'success'); document.getElementById('global-announce').value = ''; } catch (e) { showToast(e.message, 'error'); }
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
                <div class="emergency-card" onclick="Vault.emLockAll()"><div style="font-size:28px;margin-bottom:8px;">🔒</div><div style="font-weight:700;color:#EF4444;">Lock All Accounts</div><div style="font-size:11px;color:#8B949E;margin-top:4px;">Lock every account except yours</div></div>
                <div class="emergency-card" onclick="Vault.emForceLogout()"><div style="font-size:28px;margin-bottom:8px;">🔐</div><div style="font-weight:700;color:#EF4444;">Force Logout Everyone</div><div style="font-size:11px;color:#8B949E;margin-top:4px;">Revoke all active sessions</div></div>
                <div class="emergency-card" onclick="showToast('Emergency maintenance ON','')" style="border-color:#F59E0B;background:#F59E0B11;"><div style="font-size:28px;margin-bottom:8px;">🚨</div><div style="font-weight:700;color:#F59E0B;">Emergency Maintenance</div><div style="font-size:11px;color:#8B949E;margin-top:4px;">Shit down the entire platform</div></div>
                <div class="emergency-card" onclick="showToast('Registrations disabled','')" style="border-color:#F59E0B;background:#F59E0B11;"><div style="font-size:28px;margin-bottom:8px;">🛑</div><div style="font-weight:700;color:#F59E0B;">Disable Registrations</div><div style="font-size:11px;color:#8B949E;margin-top:4px;">No new accounts can be created</div></div>
                <div class="emergency-card" onclick="showToast('Messaging disabled','')" style="border-color:#F59E0B;background:#F59E0B11;"><div style="font-size:28px;margin-bottom:8px;">🛑</div><div style="font-weight:700;color:#F59E0B;">Disable Messaging</div><div style="font-size:11px;color:#8B949E;margin-top:4px;">Users cannot send messages</div></div>
                <div class="emergency-card" onclick="showToast('AI disabled globally','')" style="border-color:#F59E0B;background:#F59E0B11;"><div style="font-size:28px;margin-bottom:8px;">🛑</div><div style="font-weight:700;color:#F59E0B;">Disable AI</div><div style="font-size:11px;color:#8B949E;margin-top:4px;">AI responses turned off globally</div></div>
                <div class="emergency-card" onclick="showToast('Emergency backup created','')"><div style="font-size:28px;margin-bottom:8px;">💾</div><div style="font-weight:700;color:#DDE4EE;">Emergency Backup</div><div style="font-size:11px;color:#8B949E;margin-top:4px;">Snapshot entire database now</div></div>
                <div class="emergency-card" onclick="showToast('Restore initiated','')"><div style="font-size:28px;margin-bottom:8px;">🔄</div><div style="font-weight:700;color:#DDE4EE;">Restore Backup</div><div style="font-size:11px;color:#8B949E;margin-top:4px;">Restore from last backup</div></div>
            </div>`;
    },

    async emLockAll() {
        const ok = await showConfirm('Lock ALL accounts?', 'This locks every account except yours. Continue?', true);
        if (!ok) return;
        const ok2 = await showConfirm('FINAL CONFIRM', 'Irreversible until manually unlocked. Continue?', true);
        if (!ok2) return;
        showToast('All accounts locked', 'success');
    },

    async emForceLogout() {
        const ok = await showConfirm('Force logout everyone?', 'All active sessions will be revoked.', true);
        if (!ok) return;
        showToast('All sessions revoked', 'success');
    },

    // ═══════════════════════════ HELPERS ═══════════════════════════
    esc(s) { return (s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
};

document.addEventListener('DOMContentLoaded', () => Vault.init());
