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
        try {
            const data = await api('/api/security/dashboard');
            stats.innerHTML = `
                <div style="padding:14px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;">
                    <div style="font-size:24px; font-weight:700; color:var(--accent-solid);">${data.total_logins}</div>
                    <div style="font-size:12px; color:#888; margin-top:4px;">Total Logins</div>
                </div>
                <div style="padding:14px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;">
                    <div style="font-size:24px; font-weight:700; color:${data.failed_logins > 0 ? 'var(--error)' : '#00ff88'};">${data.failed_logins}</div>
                    <div style="font-size:12px; color:#888; margin-top:4px;">Failed Logins</div>
                </div>
                <div style="padding:14px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;">
                    <div style="font-size:24px; font-weight:700; color:var(--text);">${data.unique_ips}</div>
                    <div style="font-size:12px; color:#888; margin-top:4px;">Unique IPs</div>
                </div>
                <div style="padding:14px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; text-align:center;">
                    <div style="font-size:13px; font-weight:600; color:var(--text);">${data.last_login}</div>
                    <div style="font-size:12px; color:#888; margin-top:4px;">Last Login</div>
                </div>`;
        } catch (e) {
            stats.innerHTML = '<p style="color:#888; text-align:center;">Failed to load stats</p>';
        }
    },

    async loadHistory() {
        const list = $('security-history');
        try {
            const { history } = await api('/api/security/login-history');
            list.innerHTML = '';
            if (history.length === 0) {
                list.innerHTML = '<p style="color:#888; text-align:center; font-size:13px; padding:20px;">No login history yet.</p>';
                return;
            }
            history.forEach(entry => {
                const div = document.createElement('div');
                div.style.cssText = `padding:10px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; border-left:3px solid ${entry.success ? '#00ff88' : 'var(--error)'};`;
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:12px; font-weight:600; color:${entry.success ? '#00ff88' : 'var(--error)'};">${entry.success ? 'SUCCESS' : 'FAILED'}</span>
                        <span style="font-size:11px; color:#666;">${entry.login_at}</span>
                    </div>
                    <div style="font-size:12px; color:#aaa; margin-top:4px;">IP: ${entry.ip_address || 'Unknown'}</div>
                    <div style="font-size:11px; color:#666; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${entry.user_agent}</div>`;
                list.appendChild(div);
            });
        } catch (e) {
            list.innerHTML = '<p style="color:#888; text-align:center;">Failed to load history</p>';
        }
    },
};
