const Staff = {
    init() {
        $('close-staff-chat').addEventListener('click', () => $('staff-chat-modal').style.display = 'none');
        $('staff-chat-modal').addEventListener('click', e => { if (e.target === $('staff-chat-modal')) $('staff-chat-modal').style.display = 'none'; });
        $('close-attention').addEventListener('click', () => $('attention-modal').style.display = 'none');
        $('attention-modal').addEventListener('click', e => { if (e.target === $('attention-modal')) $('attention-modal').style.display = 'none'; });
        $('staff-chat-send').addEventListener('click', () => Staff.sendChat());
        $('staff-chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') Staff.sendChat(); });
    },
    openChat() {
        $('staff-chat-modal').style.display = 'flex';
        Staff.reloadChat();
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
                const color = isOwner ? '#7fd8f7' : '#FFD700';
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
        const stats = $('attention-stats');
        const bans = $('attention-bans');
        const feeds = $('attention-feedback');
        stats.innerHTML = '<p style="color:#888; grid-column:1/-1; text-align:center;">Loading...</p>';
        try {
            const d = await api('/api/staff/attention');
            stats.innerHTML = `
                <div style="padding:10px; background:rgba(0,0,0,0.4); border:1px solid rgba(255,170,0,0.2); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#ffaa00;">${d.unanswered_feedback}</div><div style="font-size:10px; color:#888;">Unanswered Feedback</div></div>
                <div style="padding:10px; background:rgba(0,0,0,0.4); border:1px solid rgba(255,170,0,0.2); border-radius:8px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#ff4d4d;">${d.banned_users.length}</div><div style="font-size:10px; color:#888;">Recent Bans</div></div>`;
            bans.innerHTML = '';
            if (!d.banned_users.length) bans.innerHTML = '<p style="color:#888; font-size:12px; text-align:center;">No recent bans.</p>';
            d.banned_users.forEach(b => {
                const byLabel = b.by === 'owner' ? 'The Owner' : 'an Admin';
                const div = document.createElement('div');
                div.style.cssText = 'font-size:12px; padding:6px 8px; background:rgba(255,77,77,0.08); border:1px solid rgba(255,77,77,0.2); border-radius:6px; color:#ccc;';
                div.innerHTML = `<strong style="color:#ff4d4d;">${Staff.esc(b.username)}</strong> — <span style="color:#888;">banned by ${byLabel}</span><div style="font-size:11px; color:#aaa; margin-top:2px;">"${Staff.esc(b.reason)}"</div>`;
                bans.appendChild(div);
            });
            feeds.innerHTML = '';
            if (!d.pending_feedback.length) feeds.innerHTML = '<p style="color:#888; font-size:12px; text-align:center;">No pending feedback.</p>';
            d.pending_feedback.forEach(f => {
                const div = document.createElement('div');
                div.style.cssText = 'font-size:12px; padding:6px 8px; background:rgba(255,170,0,0.06); border:1px solid rgba(255,170,0,0.15); border-radius:6px; color:#ccc; display:flex; justify-content:space-between; gap:8px;';
                div.innerHTML = `<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><strong style="color:#ffaa00;">${Staff.esc(f.username)}</strong>: ${Staff.esc(f.content)}</span><span style="color:#666; flex-shrink:0;">${f.created_at}</span>`;
                feeds.appendChild(div);
            });
        } catch (e) { stats.innerHTML = '<p style="color:var(--error); grid-column:1/-1; text-align:center;">' + Staff.esc(e.message) + '</p>'; }
    },
    esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
};
