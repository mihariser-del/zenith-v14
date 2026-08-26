const AdminPanel = {
    users: [],
    open() { $('admin-panel-modal').style.display = 'flex'; this.load(); },
    close() { $('admin-panel-modal').style.display = 'none'; },
    async load() {
        const stats = $('admin-stats');
        stats.innerHTML = '<p style="color:#888; text-align:center; grid-column:1/-1;">Loading...</p>';
        try {
            const { users } = await api('/api/auth/admin/users');
            this.users = users;
            stats.innerHTML = `
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#FFD700;">${users.length}</div><div style="font-size:11px; color:#888;">Users</div></div>
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#00ff88;">${users.filter(u=>u.is_admin).length}</div><div style="font-size:11px; color:#888;">Admins</div></div>
                <div style="padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:var(--accent-solid);">${users.filter(u=>!u.username.startsWith('guest_')).length}</div><div style="font-size:11px; color:#888;">Real</div></div>`;
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
            div.style.cssText = 'display:flex; align-items:center; gap:8px; padding:10px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px;';
            div.innerHTML = `
                <div style="width:28px; height:28px; border-radius:50%; background:var(--accent); display:flex; align-items:center; justify-content:center; color:white; font-weight:700; font-size:12px;">${u.username[0].toUpperCase()}</div>
                <div style="flex:1; overflow:hidden;"><div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${AdminPanel.escapeHtml(u.username)} ${u.is_admin?'<span style=\'color:#FFD700; font-size:10px;\'>ADMIN</span>':''}</div><div style="font-size:11px; color:#888;">${AdminPanel.escapeHtml(u.email)}</div></div>
                <button style="padding:4px 10px; background:none; border:1px solid var(--error); color:var(--error); border-radius:6px; cursor:pointer; font-size:11px;" data-id="${u.id}">Delete</button>`;
            div.querySelector('[data-id]').addEventListener('click', async () => {
                const ok = await showConfirm('Delete user?', `Delete ${u.username}? All their data will be lost.`, true);
                if (!ok) return;
                await api(`/api/auth/admin/users/${u.id}`, { method: 'DELETE' });
                showToast('User deleted', 'success');
                AdminPanel.load();
            });
            list.appendChild(div);
        });
    },
    filter(q) { this.render(q); },
    escapeHtml(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
};
