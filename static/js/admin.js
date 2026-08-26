const AdminPanel = {
    users: [],
    open() { $('admin-panel-modal').style.display = 'flex'; this.load(); },
    close() { $('admin-panel-modal').style.display = 'none'; },
    async load() {
        const stats = $('admin-stats');
        stats.innerHTML = '<p style="color:#888; text-align:center; grid-column:1/-1;">Loading...</p>';
        try {
            const dash = await api('/api/auth/admin/dashboard');
            const { users } = await api('/api/auth/admin/users');
            this.users = users;
            stats.innerHTML = `
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#FFD700;">${dash.total_users}</div><div style="font-size:11px; color:#888;">Total Accounts</div></div>
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#00ff88;">${dash.active_users}</div><div style="font-size:11px; color:#888;">Active (24h)</div></div>
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:var(--accent-solid);">${dash.total_chats}</div><div style="font-size:11px; color:#888;">Chats</div></div>
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#a78bfa;">${dash.total_messages}</div><div style="font-size:11px; color:#888;">Messages</div></div>
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#FFD700;">${users.filter(u=>u.is_admin).length}</div><div style="font-size:11px; color:#888;">Admins</div></div>
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#888;">${dash.guest_count}</div><div style="font-size:11px; color:#888;">Guests</div></div>`;
            this.render();
        } catch (e) { stats.innerHTML = `<p style="color:var(--error); text-align:center; grid-column:1/-1;">${e.message}</p>`; }
    },
    render(filter = '') {
        const list = $('admin-users-list');
        list.innerHTML = '';
        let filtered = this.users;
        if (filter) filtered = filtered.filter(u => u.username.toLowerCase().includes(filter.toLowerCase()) || u.email.toLowerCase().includes(filter.toLowerCase()));
        if (filtered.length === 0) { list.innerHTML = '<p style="color:#888; text-align:center; padding:20px;">No users</p>'; return; }
        filtered.forEach(u => {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex; align-items:center; gap:6px; padding:10px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; flex-wrap:wrap;';
            const bannedBadge = u.is_banned ? '<span style="background:var(--error); color:white; font-size:9px; padding:1px 5px; border-radius:4px; margin-left:4px;">BANNED</span>' : '';
            div.innerHTML = `
                <div style="width:28px; height:28px; border-radius:50%; background:var(--accent); display:flex; align-items:center; justify-content:center; color:white; font-weight:700; font-size:12px; flex-shrink:0;">${u.username[0].toUpperCase()}</div>
                <div style="flex:1; overflow:hidden; min-width:120px;">
                    <div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${AdminPanel.escapeHtml(u.username)} ${u.is_admin?'<span style=\'color:#FFD700; font-size:10px;\'>ADMIN</span>':''}${bannedBadge}</div>
                    <div style="font-size:11px; color:#888;">${AdminPanel.escapeHtml(u.email)}</div>
                    <div style="font-size:10px; color:#666; margin-top:2px;">${u.chat_count} chats &middot; ${u.message_count} msgs &middot; Joined ${u.created_at} &middot; Last: ${u.last_active}</div>
                </div>
                <div style="display:flex; gap:4px; flex-wrap:wrap;">
                    <button style="padding:4px 8px; background:none; border:1px solid var(--border); color:#888; border-radius:6px; cursor:pointer; font-size:10px;" data-action="chats" data-id="${u.id}">Chats</button>
                    <button style="padding:4px 8px; background:none; border:1px solid #ffaa00; color:#ffaa00; border-radius:6px; cursor:pointer; font-size:10px;" data-action="reset" data-id="${u.id}">Reset PW</button>
                    ${u.is_banned ? `<button style="padding:4px 8px; background:#00ff88; border:none; color:#000; border-radius:6px; cursor:pointer; font-size:10px; font-weight:600;" data-action="unban" data-id="${u.id}">Unban</button>` : `<button style="padding:4px 8px; background:none; border:1px solid var(--error); color:var(--error); border-radius:6px; cursor:pointer; font-size:10px;" data-action="ban" data-id="${u.id}">Ban</button>`}
                    <button style="padding:4px 8px; background:none; border:1px solid var(--error); color:var(--error); border-radius:6px; cursor:pointer; font-size:10px;" data-action="delete" data-id="${u.id}">Delete</button>
                </div>`;
            div.querySelector('[data-action="delete"]').addEventListener('click', async () => {
                const ok = await showConfirm('Delete user?', `Delete ${u.username}? All their data will be lost.`, true);
                if (!ok) return;
                await api(`/api/auth/admin/users/${u.id}`, { method: 'DELETE' });
                showToast('User deleted', 'success');
                AdminPanel.load();
            });
            const banBtn = div.querySelector('[data-action="ban"]');
            if (banBtn) banBtn.addEventListener('click', async () => {
                const ok = await showConfirm('Ban user?', `Ban ${u.username}? They will not be able to login.`, true);
                if (!ok) return;
                await api(`/api/auth/admin/users/${u.id}/ban`, { method: 'POST' });
                showToast('User banned', 'success');
                AdminPanel.load();
            });
            const unbanBtn = div.querySelector('[data-action="unban"]');
            if (unbanBtn) unbanBtn.addEventListener('click', async () => {
                await api(`/api/auth/admin/users/${u.id}/unban`, { method: 'POST' });
                showToast('User unbanned', 'success');
                AdminPanel.load();
            });
            div.querySelector('[data-action="reset"]').addEventListener('click', async () => {
                const newPw = await showPrompt(`Reset password for ${u.username}`, '');
                if (!newPw || newPw.length < 6) { if (newPw !== null) showToast('Password must be at least 6 chars', 'error'); return; }
                await api(`/api/auth/admin/users/${u.id}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password: newPw }) });
                showToast(`Password reset for ${u.username}`, 'success');
            });
            div.querySelector('[data-action="chats"]').addEventListener('click', async () => {
                try {
                    const { chats } = await api(`/api/auth/admin/users/${u.id}/chats`);
                    if (chats.length === 0) { showToast('No chats for this user', ''); return; }
                    let msg = `Recent chats for ${u.username}:\n\n`;
                    chats.slice(0, 5).forEach(c => { msg += `- ${c.title} (${c.message_count} msgs, ${c.updated_at.slice(0, 16)})\n`; if (c.messages.length) msg += `  Last: ${c.messages[c.messages.length-1].content.slice(0, 80)}\n`; });
                    alert(msg);
                } catch (e) { showToast(e.message, 'error'); }
            });
            list.appendChild(div);
        });
    },
    filter(q) { this.render(q); },
    escapeHtml(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
};
