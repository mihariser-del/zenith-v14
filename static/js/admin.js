const AdminPanel = {
    users: [],
    currentFilter: 'all',
    searchQuery: '',
    currentRole: 'user', // set by app.js from /me
    open() { $('admin-panel-modal').style.display = 'flex'; this.load(); },
    close() { $('admin-panel-modal').style.display = 'none'; },
    async load() {
        const stats = $('admin-stats');
        stats.innerHTML = '<p style="color:#888; text-align:center; grid-column:1/-1;">Loading...</p>';
        try {
            const dash = await api('/api/auth/admin/dashboard');
            const { users } = await api('/api/auth/admin/users');
            this.users = users;
            const normalCount = users.filter(u=>!u.is_admin && !u.username.startsWith('guest_') && !u.is_deleted).length;
            const _isOwnerStats = this.currentRole === 'owner';
            const _gold = _isOwnerStats ? '#C0C7D1' : '#FFD700';
            const _accent = _isOwnerStats ? '#C0C7D1' : 'var(--accent-solid)';
            stats.innerHTML = `
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:${_gold};">${dash.total_users}</div><div style="font-size:11px; color:#888;">Total Accounts</div></div>
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#00ff88;">${normalCount}</div><div style="font-size:11px; color:#888;">Normal Users</div></div>
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#ff4d4d;">${dash.banned_count || 0}</div><div style="font-size:11px; color:#888;">Banned</div></div>
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#888;">${dash.deleted_count || 0}</div><div style="font-size:11px; color:#888;">Deleted</div></div>
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#00ff88;">${dash.active_users}</div><div style="font-size:11px; color:#888;">Active (24h)</div></div>
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:${_accent};">${dash.total_chats}</div><div style="font-size:11px; color:#888;">Chats</div></div>
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#a78bfa;">${dash.total_messages}</div><div style="font-size:11px; color:#888;">Messages</div></div>
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:${_gold};">${dash.owner_count || 0}</div><div style="font-size:11px; color:#888;">Owners</div></div>
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#fff;">${dash.admin_count || 0}</div><div style="font-size:11px; color:#888;">Admins</div></div>
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#888;">${dash.guest_count}</div><div style="font-size:11px; color:#888;">Guests</div></div>`;
            this.ensureFilterUI();
            this.render();
        } catch (e) { stats.innerHTML = `<p style="color:var(--error); text-align:center; grid-column:1/-1;">${e.message}</p>`; }
    },
    ensureFilterUI() {
        if ($('admin-filter-buttons')) return;
        const searchRow = $('admin-user-search').parentElement;
        const filterDiv = document.createElement('div');
        filterDiv.id = 'admin-filter-buttons';
        filterDiv.style.cssText = 'display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap;';
        const filters = [
            {key:'all', label:'All'},
            {key:'live', label:'Live'},
            {key:'banned', label:'Banned'},
            {key:'deleted', label:'Deleted'}
        ];
        const _isOwnerFilter = this.currentRole === 'owner';
        const _activeCol = _isOwnerFilter ? '#C0C7D1' : '#FFD700';
        const _activeBg = _isOwnerFilter ? 'rgba(221,228,238,0.15)' : 'rgba(255,215,0,0.15)';
        filters.forEach(f => {
            const btn = document.createElement('button');
            btn.textContent = f.label;
            btn.dataset.filter = f.key;
            btn.style.cssText = `padding:6px 12px; border-radius:20px; font-size:11px; cursor:pointer; border:1px solid ${f.key==='all' ? _activeCol : 'var(--border)'}; background:${f.key==='all' ? _activeBg : 'transparent'}; color:${f.key==='all' ? _activeCol : '#888'}; font-weight:600;`;
            btn.addEventListener('click', () => {
                AdminPanel.currentFilter = f.key;
                filterDiv.querySelectorAll('button').forEach(b => {
                    const active = b.dataset.filter === f.key;
                    b.style.borderColor = active ? _activeCol : 'var(--border)';
                    b.style.background = active ? _activeBg : 'transparent';
                    b.style.color = active ? _activeCol : '#888';
                });
                AdminPanel.render();
            });
            filterDiv.appendChild(btn);
        });
        searchRow.parentElement.insertBefore(filterDiv, searchRow.nextSibling);
    },
    render(filter = null) {
        if (filter !== null && typeof filter === 'string') this.searchQuery = filter;
        const list = $('admin-users-list');
        list.innerHTML = '';
        let filtered = this.users;
        if (this.currentFilter === 'all') filtered = filtered.filter(u => !u.is_deleted);
        else if (this.currentFilter === 'banned') filtered = filtered.filter(u => u.is_banned && !u.is_deleted);
        else if (this.currentFilter === 'deleted') filtered = filtered.filter(u => u.is_deleted);
        else if (this.currentFilter === 'live') filtered = filtered.filter(u => !u.is_banned && !u.is_deleted);
        const q = this.searchQuery;
        if (q) filtered = filtered.filter(u => u.username.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()));
        if (filtered.length === 0) { list.innerHTML = '<p style="color:#888; text-align:center; padding:20px;">No users for this filter</p>'; return; }
        const meIsOwner = this.currentRole === 'owner';
        filtered.forEach(u => {
            const targetRole = u.role || (u.is_admin ? 'admin' : 'user');
            const div = document.createElement('div');
            div.style.cssText = 'display:flex; align-items:center; gap:6px; padding:10px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; flex-wrap:wrap;';
            const bannedBadge = u.is_banned && !u.is_deleted ? '<span style="background:var(--error); color:white; font-size:9px; padding:1px 5px; border-radius:4px; margin-left:4px;">BANNED</span>' : '';
            const deletedBadge = u.is_deleted ? '<span style="background:#666; color:white; font-size:9px; padding:1px 5px; border-radius:4px; margin-left:4px;">DELETED</span>' : '';
            const roleBadge = targetRole === 'owner'
                ? '<span style="color:#C0C7D1; font-size:10px; background:rgba(221,228,238,0.12); padding:1px 6px; border-radius:4px; border:1px solid rgba(221,228,238,0.4); white-space:nowrap;">OWNER</span>'
                : (targetRole === 'admin' ? '<span style="color:#FFD700; font-size:10px; background:rgba(255,215,0,0.12); padding:1px 6px; border-radius:4px; border:1px solid rgba(255,215,0,0.3); white-space:nowrap;">ADMIN</span>' : '');
            const _fmtLocal = s => { if (!s || s==='Never'||s==='Online') return s; try { let iso=s.trim(); if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(iso)) iso=iso.replace(' ','T')+'Z'; const d=new Date(iso); if(isNaN(d)) return s; return d.toLocaleString([], {year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'}); } catch {return s;} };
            const joinedDate = u.created_at ? _fmtLocal(u.created_at).split(',')[0] : '';
            const lastSeenRaw = u.last_active && u.last_active !== 'Never' ? u.last_active : 'Online';
            const lastSeen = _fmtLocal(lastSeenRaw);
            // --- Permission: can the current user act on this target? ---
            const canAct = (() => {
                if (u.is_deleted) return false;
                if (targetRole === 'owner') return false;
                if (targetRole === 'admin') return meIsOwner; // only owner manages admins
                return true; // users & guests managed by admin or owner
            })();
            div.innerHTML = `
                <div style="width:28px; height:28px; border-radius:50%; background:var(--accent); display:flex; align-items:center; justify-content:center; color:white; font-weight:700; font-size:12px; flex-shrink:0;">${u.username[0].toUpperCase()}</div>
                <div style="flex:1; overflow:hidden; min-width:120px;">
                    <div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${AdminPanel.escapeHtml(u.username)} ${roleBadge}${bannedBadge}${deletedBadge}</div>
                    <div style="font-size:11px; color:#888;">${AdminPanel.escapeHtml(u.email)}</div>
                    <div style="font-size:10px; color:#666; margin-top:2px;">${u.chat_count} chats &middot; ${u.message_count} msgs &middot; Joined ${joinedDate} &middot; Last seen ${AdminPanel.escapeHtml(lastSeen)}</div>
                </div>
                <div style="display:flex; gap:4px; flex-wrap:wrap;">
                    <button style="padding:4px 8px; background:none; border:1px solid var(--border); color:#888; border-radius:6px; cursor:pointer; font-size:10px;" data-action="chats" data-id="${u.id}">Chats</button>
                    ${canAct && targetRole !== 'admin' ? `<button style="padding:4px 8px; background:none; border:1px solid #ffaa00; color:#ffaa00; border-radius:6px; cursor:pointer; font-size:10px;" data-action="reset" data-id="${u.id}">Reset PW</button>` : ''}
                    ${canAct ? (u.is_banned ? `<button style="padding:4px 8px; background:#00ff88; border:none; color:#000; border-radius:6px; cursor:pointer; font-size:10px; font-weight:600;" data-action="unban" data-id="${u.id}">Unban</button>` : `<button style="padding:4px 8px; background:none; border:1px solid var(--error); color:var(--error); border-radius:6px; cursor:pointer; font-size:10px;" data-action="ban" data-id="${u.id}">Ban</button>`) : ''}
                    ${canAct ? `<button style="padding:4px 8px; background:none; border:1px solid var(--error); color:var(--error); border-radius:6px; cursor:pointer; font-size:10px;" data-action="delete" data-id="${u.id}">Delete</button>` : ''}
                </div>`;
            if (!canAct && !u.is_deleted && targetRole !== 'owner') {
                div.style.opacity = '0.8';
                div.title = 'Protected role — only the Owner can manage admins';
            }
            if (u.is_deleted) div.style.opacity = '0.6';
            if (canAct) {
                div.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
                    const ok = await showConfirm('Delete user?', `Delete ${u.username}? All their data will be lost.`, true);
                    if (!ok) return;
                    await api(`/api/auth/admin/users/${u.id}`, { method: 'DELETE' });
                    showToast('User deleted', 'success');
                    AdminPanel.load();
                });
                const banBtn = div.querySelector('[data-action="ban"]');
                if (banBtn) banBtn.addEventListener('click', async () => {
                    const reason = await showPrompt(`Ban ${u.username}?`, 'Enter a reason for the ban (shown to the user)');
                    if (reason === null) return;
                    if (!reason.trim()) { showToast('A ban reason is required', 'error'); return; }
                    await api(`/api/auth/admin/users/${u.id}/ban`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
                    showToast('User banned', 'success');
                    AdminPanel.load();
                });
                const unbanBtn = div.querySelector('[data-action="unban"]');
                if (unbanBtn) unbanBtn.addEventListener('click', async () => {
                    await api(`/api/auth/admin/users/${u.id}/unban`, { method: 'POST' });
                    showToast('User unbanned', 'success');
                    AdminPanel.load();
                });
                div.querySelector('[data-action="reset"]')?.addEventListener('click', async () => {
                    const newPw = await showPrompt(`Reset password for ${u.username}`, '');
                    if (!newPw || newPw.length < 6) { if (newPw !== null) showToast('Password must be at least 6 chars', 'error'); return; }
                    await api(`/api/auth/admin/users/${u.id}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password: newPw }) });
                    showToast(`Password reset for ${u.username}`, 'success');
                });
            }
            div.querySelector('[data-action="chats"]').addEventListener('click', async () => {
                try {
                    const { chats } = await api(`/api/auth/admin/users/${u.id}/chats`);
                    if (chats.length === 0) { showToast('No chats for this user', ''); return; }
                    AdminPanel.showChats(u.username, chats);
                } catch (e) { showToast(e.message, 'error'); }
            });
            list.appendChild(div);
        });
    },
    showChats(username, chats) {
        const modal = document.createElement('div');
        modal.className = 'modal'; modal.style.display = 'flex';
        modal.style.zIndex = '400';
        modal.style.alignItems = 'flex-start';
        modal.style.overflowY = 'auto';
        modal.style.padding = '20px 10px';
        let html = `<div style="max-width:700px; width:100%; margin:0 auto; background:linear-gradient(145deg,#1a1a0a,#2d2416); border:2px solid #FFD700; border-radius:16px; padding:20px;">`;
        html += `<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;"><h3 style="color:#FFD700; text-shadow:0 0 10px rgba(255,215,0,0.3); margin:0;">Chats for ${AdminPanel.escapeHtml(username)}</h3><span style="color:#FFD700; font-size:12px;">&larr; scroll to read all</span></div>`;
        html += `<div style="max-height:65vh; overflow-y:auto; display:flex; flex-direction:column; gap:14px; padding-right:4px;">`;
        chats.forEach((c, i) => {
            html += `<div style="padding:14px; background:rgba(0,0,0,0.4); border:1px solid rgba(255,215,0,0.15); border-radius:10px; text-align:left;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                    <div style="font-weight:700; font-size:14px; color:#FFD700;">${i+1}. ${AdminPanel.escapeHtml(c.title)}</div>
                    <div style="font-size:11px; color:rgba(255,215,0,0.5);">${c.message_count} msgs &middot; ${c.updated_at.slice(0, 16)}</div>
                </div>`;
            if (!c.messages.length) {
                html += `<div style="margin-top:8px; font-size:12px; color:rgba(255,215,0,0.4);">No messages.</div>`;
            }
            c.messages.forEach(m => {
                const isUser = m.role === 'user';
                const color = isUser ? '#00ff88' : 'rgba(255,215,0,0.8)';
                html += `<div style="margin-top:8px; padding:10px 12px; background:rgba(255,215,0,0.05); border-radius:8px; font-size:13px; line-height:1.6; border-left:3px solid ${color}; white-space:pre-wrap; word-wrap:break-word;"><strong style="color:${color}; text-transform:capitalize;">${m.role}:</strong><br>${AdminPanel.escapeHtml(m.content)}</div>`;
            });
            html += `</div>`;
        });
        html += `</div>`;
        html += `<div style="margin-top:15px; text-align:right;"><button class="btn gold-close" style="border:1px solid rgba(255,215,0,0.4); padding:10px 20px; border-radius:8px; background:transparent; color:#FFD700; cursor:pointer;">Close</button></div>`;
        html += `</div>`;
        modal.innerHTML = html;
        modal.querySelector('.gold-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    },
    filter(q) { this.render(q); },
    escapeHtml(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
};
