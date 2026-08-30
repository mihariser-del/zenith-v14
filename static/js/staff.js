const Staff = {
    init() {
        $('close-staff-chat').addEventListener('click', () => $('staff-chat-modal').style.display = 'none');
        $('staff-chat-modal').addEventListener('click', e => { if (e.target === $('staff-chat-modal')) $('staff-chat-modal').style.display = 'none'; });
        $('close-attention').addEventListener('click', () => $('attention-modal').style.display = 'none');
        $('attention-modal').addEventListener('click', e => { if (e.target === $('attention-modal')) $('attention-modal').style.display = 'none'; });
        $('staff-chat-send').addEventListener('click', () => Staff.sendChat());
        $('staff-chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') Staff.sendChat(); });
        const attSend = $('attention-send');
        if (attSend) attSend.addEventListener('click', () => Staff.sendBroadcast());
        const attInput = $('attention-input');
        if (attInput) attInput.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) Staff.sendBroadcast(); });
        const clearBtn = $('clear-staff-chat');
        if (clearBtn) clearBtn.addEventListener('click', () => Staff.clearChat());
    },
    openChat() {
        $('staff-chat-modal').style.display = 'flex';
        // Show clear button only for Owner
        const clearBtn = $('clear-staff-chat');
        if (clearBtn) {
            api('/api/auth/me').then(r => {
                if (r.user && r.user.role === 'owner') clearBtn.style.display = 'block';
                else clearBtn.style.display = 'none';
            }).catch(()=>{ if(clearBtn) clearBtn.style.display='none'; });
        }
        Staff.reloadChat();
    },
    async clearChat() {
        const ok = await showConfirm('Clear live chat?', 'Delete all staff live chat messages? Only the Owner can do this.', true);
        if (!ok) return;
        try { await api('/api/staff/chat', { method: 'DELETE' }); showToast('Live chat cleared', 'success'); await Staff.reloadChat(); } catch(e){ showToast(e.message,'error'); }
    },
    openAttention() {
        $('attention-modal').style.display = 'flex';
        Staff.loadAttention();
    },
    async reloadChat() {
        const list = $('staff-chat-list');
        try {
            const { messages } = await api('/api/staff/chat');
            list.innerHTML = '';
            if (!messages.length) { list.innerHTML = '<p style="color:#888; text-align:center; padding:20px; font-size:13px;">No messages yet. Start the conversation.</p>'; return; }
            messages.forEach(m => {
                const isOwner = m.role === 'owner';
                const color = isOwner ? '#C0C7D1' : '#FFD700';
                const tag = isOwner ? 'OWNER' : 'ADMIN';
                const div = document.createElement('div');
                div.style.cssText = 'padding:8px 10px; background:rgba(0,0,0,0.4); border-radius:8px; border-left:3px solid ' + color + ';';
                div.innerHTML = `<div style="display:flex; align-items:center; gap:6px; margin-bottom:3px;"><span style="font-size:11px; font-weight:700; color:${color};">${Staff.esc(m.username)}</span><span style="font-size:9px; padding:1px 5px; border-radius:4px; background:${color}22; color:${color}; font-weight:600;">${tag}</span><span style="font-size:10px; color:#666; margin-left:auto;">${m.created_at}</span></div><div style="font-size:13px; color:#e5e5e5; white-space:pre-wrap; word-wrap:break-word;">${Staff.esc(m.content)}</div>`;
                list.appendChild(div);
            });
            list.scrollTop = list.scrollHeight;
        } catch (e) { list.innerHTML = '<p style="color:var(--error); text-align:center; padding:20px;">' + Staff.esc(e.message) + '</p>'; }
    },
    async sendChat() {
        const inp = $('staff-chat-input');
        const txt = inp.value.trim();
        if (!txt) return;
        try {
            await api('/api/staff/chat', { method: 'POST', body: JSON.stringify({ content: txt }) });
            inp.value = '';
            await Staff.reloadChat();
        } catch (e) { showToast(e.message, 'error'); }
    },
    async loadAttention() {
        const list = $('attention-list');
        const form = $('attention-broadcast-form');
        // Show broadcast form only to staff (owner/admin)
        try {
            const me = await api('/api/auth/me');
            const isStaff = me.user && (me.user.is_admin || me.user.role === 'owner');
            if (form) form.style.display = isStaff ? 'flex' : 'none';
        } catch { if (form) form.style.display = 'none'; }
        list.innerHTML = '<p style="color:#888; text-align:center; padding:20px; font-size:13px;">Loading broadcasts...</p>';
        try {
            const d = await api('/api/announcements/feed');
            const anns = d.announcements || [];
            list.innerHTML = '';
            if (!anns.length) { list.innerHTML = '<p style="color:#888; text-align:center; padding:20px; font-size:13px;">No broadcasts yet.</p>'; return; }
            anns.slice().reverse().forEach(a => {
                const isOwner = a.role === 'owner';
                const color = isOwner ? '#C0C7D1' : '#8B949E';
                const tag = isOwner ? 'OWNER' : 'STAFF';
                const div = document.createElement('div');
                div.style.cssText = 'padding:10px; background:rgba(0,0,0,0.25); border:1px solid var(--border); border-radius:8px; border-left:3px solid ' + color + ';';
                // Format time locally
                let when = a.created_at;
                try { const dt = new Date(a.created_at.replace(' ', 'T') + 'Z'); when = dt.toLocaleString(); } catch {}
                div.innerHTML = `<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;"><span style="font-size:12px; font-weight:700; color:${color};">${Staff.esc(a.username)}</span><span style="font-size:9px; padding:1px 5px; border-radius:4px; background:${color}22; color:${color}; font-weight:600;">${tag}</span><span style="font-size:10px; color:#666; margin-left:auto;">${Staff.esc(when)}</span></div><div style="font-size:13px; color:#e5e5e5; white-space:pre-wrap; word-wrap:break-word;">${Staff.esc(a.content)}</div>`;
                list.appendChild(div);
            });
            list.scrollTop = list.scrollHeight;
        } catch (e) { list.innerHTML = '<p style="color:var(--error); text-align:center; padding:20px;">' + Staff.esc(e.message) + '</p>'; }
    },
    async sendBroadcast() {
        const inp = $('attention-input');
        const txt = inp.value.trim();
        if (!txt) { showToast('Write a broadcast', 'error'); return; }
        try {
            await api('/api/announcements', { method: 'POST', body: JSON.stringify({ content: txt }) });
            inp.value = '';
            showToast('Broadcast sent to all users', 'success');
            await Staff.loadAttention();
        } catch (e) { showToast(e.message, 'error'); }
    },
    esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
};
