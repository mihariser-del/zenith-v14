const Security = {
    async open() {
        $('security-modal').style.display = 'flex';
        await this.loadDashboard();
        await this.loadHistory();
    },

    close() {
        $('security-modal').style.display = 'none';
    },

    async loadDashboard() {
        const stats = $('security-stats');
        // ensure stats grid is scrollable and responsive
        stats.style.display = 'grid';
        stats.style.gridTemplateColumns = '1fr 1fr';
        stats.style.gap = '10px';
        stats.style.marginBottom = '20px';
        stats.style.maxHeight = '40vh';
        stats.style.overflow = 'auto';
        stats.style.paddingRight = '4px';
        try {
            const data = await api('/api/security/dashboard');
            stats.innerHTML = `
                <div style="padding:14px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center; min-width:0; overflow:hidden; word-break:break-word;">
                    <div style="font-size:24px; font-weight:700; color:var(--accent-solid); word-break:break-word;">${data.total_logins}</div>
                    <div style="font-size:12px; color:#888; margin-top:4px;">Total Logins</div>
                </div>
                <div style="padding:14px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center; min-width:0; overflow:hidden; word-break:break-word;">
                    <div style="font-size:24px; font-weight:700; color:${data.failed_logins > 0 ? 'var(--error)' : '#00ff88'};">${data.failed_logins}</div>
                    <div style="font-size:12px; color:#888; margin-top:4px;">Failed Logins</div>
                </div>
                <div style="padding:14px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center; min-width:0; overflow:hidden; word-break:break-word;">
                    <div style="font-size:24px; font-weight:700; color:var(--text);">${data.unique_ips}</div>
                    <div style="font-size:12px; color:#888; margin-top:4px;">Unique IPs</div>
                </div>
                <div style="padding:14px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center; min-width:0; overflow:hidden; word-break:break-word;">
                    <div style="font-size:13px; font-weight:600; color:var(--text); word-break:break-word; overflow-wrap:anywhere;">${data.last_login}</div>
                    <div style="font-size:12px; color:#888; margin-top:4px;">Last Login</div>
                </div>`;
        } catch (e) {
            stats.innerHTML = '<p style="color:#888; text-align:center;">Failed to load stats</p>';
        }
    },

    async loadHistory() {
        const list = $('security-history');
        list.style.maxHeight = '50vh';
        list.style.overflowY = 'auto';
        list.style.overflowX = 'hidden';
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '6px';
        list.style.paddingRight = '4px';
        try {
            const { history } = await api('/api/security/login-history');
            list.innerHTML = '';
            if (history.length === 0) {
                list.innerHTML = '<p style="color:#888; text-align:center; font-size:13px; padding:20px;">No login history yet.</p>';
                return;
            }
            history.forEach(entry => {
                const div = document.createElement('div');
                div.style.cssText = `padding:10px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; border-left:3px solid ${entry.success ? '#00ff88' : 'var(--error)'}; max-width:100%; min-width:0; overflow:hidden; word-break:break-word; overflow-wrap:anywhere; box-sizing:border-box;`;
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; min-width:0;">
                        <span style="font-size:12px; font-weight:600; color:${entry.success ? '#00ff88' : 'var(--error)'}; flex-shrink:0;">${entry.success ? 'SUCCESS' : 'FAILED'}</span>
                        <span style="font-size:11px; color:#666; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;">${entry.login_at}</span>
                    </div>
                    <div style="font-size:12px; color:#aaa; margin-top:4px; word-break:break-all; overflow-wrap:anywhere; min-width:0;">IP: ${entry.ip_address || 'Unknown'}</div>
                    <div style="font-size:11px; color:#666; margin-top:2px; word-break:break-all; overflow-wrap:anywhere; white-space:normal; min-width:0; max-width:100%;">${entry.user_agent}</div>`;
                list.appendChild(div);
            });
        } catch (e) {
            list.innerHTML = '<p style="color:#888; text-align:center;">Failed to load history</p>';
        }
    },
};
