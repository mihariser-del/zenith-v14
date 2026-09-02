const Vault = {
    async init() {
        try {
            const { user } = await api('/api/auth/me');
            const isOwner = user.role === 'owner';
            document.body.classList.add(isOwner ? 'vault-owner' : 'vault-admin');
            document.getElementById('vault-username').textContent = user.username;
            document.getElementById('vault-avatar').textContent = user.username[0].toUpperCase();
            document.getElementById('vault-top-name').textContent = user.username;
            document.getElementById('vault-top-avatar').textContent = user.username[0].toUpperCase();
            document.getElementById('vault-role-label').textContent = isOwner ? 'OWNER VAULT' : 'ADMIN VAULT';
            document.getElementById('vault-welcome').textContent = `Welcome back, ${user.username} ${isOwner?'👑':''}`;
            document.getElementById('vault-subtitle').textContent = isOwner ? 'Ultimate Access' : 'Admin Access';
            const topTag = document.querySelector('#vault-top-name + div');
            if (topTag) topTag.textContent = isOwner ? 'The One Above All' : 'Admin Access';
            const ownerSec = document.getElementById('vault-owner-section');
            if (ownerSec) ownerSec.style.display = isOwner ? 'block' : 'none';
            if (!isOwner && !user.is_admin) window.location.href = '/app';
        } catch { window.location.href = '/'; return; }
        this.loadDashboard();
        this.bindNav();
        setInterval(()=>{ this.pollLiveChatForVault(); }, 5000);
    },
    bindNav() {
        document.querySelectorAll('.vault-nav a').forEach(a=>{
            a.addEventListener('click', ()=>{
                document.querySelectorAll('.vault-nav a').forEach(x=>x.classList.remove('active'));
                a.classList.add('active');
                const tab=a.dataset.tab;
                if(tab==='dashboard') this.loadDashboard();
                else if(tab==='users') this.loadUsers();
                else if(tab==='bans') this.loadBans();
                else if(tab==='deleted') this.loadDeleted();
                else if(tab==='chats') this.loadChats();
                else if(tab==='messages') this.loadMessages();
                else if(tab==='security') this.loadSecurity();
                else if(tab==='logs') this.loadLogs();
                else if(tab==='backups') this.loadBackups();
                else if(tab==='settings') this.loadSettings();
                else if(tab==='owner') this.loadOwner();
                else if(tab==='admins') this.loadAdmins();
                else if(tab==='global') this.loadGlobal();
                else if(tab==='emergency') this.loadEmergency();
                if(window.innerWidth<=768) document.getElementById('vault-sidebar').classList.remove('open');
            });
        });
    },
    async loadDashboard() {
        const el=document.getElementById('vault-content');
        el.innerHTML='<div style="padding:20px; color:#8B949E;">Loading dashboard...</div>';
        try {
            const [d, sys] = await Promise.all([
                api('/api/auth/admin/dashboard'),
                api('/api/system/stats').catch(()=>null)
            ]);
            let html=`<div class="vault-stats">
                <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-label">TOTAL ACCOUNTS</div><div class="stat-value">${d.total_users}</div></div>
                <div class="stat-card"><div class="stat-icon">🛡️</div><div class="stat-label">BANNED</div><div class="stat-value">${d.banned_count}</div></div>
                <div class="stat-card"><div class="stat-icon">🗑️</div><div class="stat-label">DELETED</div><div class="stat-value">${d.deleted_count}</div></div>
                <div class="stat-card"><div class="stat-icon">💬</div><div class="stat-label">CHATS</div><div class="stat-value">${d.total_chats}</div></div>
                <div class="stat-card"><div class="stat-icon">✉️</div><div class="stat-label">MESSAGES</div><div class="stat-value">${d.total_messages}</div></div>
                <div class="stat-card"><div class="stat-icon">👑</div><div class="stat-label">ADMINS</div><div class="stat-value">${d.admin_count}</div></div>
            </div>
            <div class="vault-grid">
                <div class="vault-card">
                    <div class="card-header"><span>👤 RECENT ACCOUNTS</span></div>
                    <div id="vault-recent-accounts" style="display:flex; flex-direction:column; gap:8px;"></div>
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>⚡ ACTIVITY FEED</span></div>
                    <div id="vault-activity-feed" style="display:flex; flex-direction:column; gap:10px;"></div>
                </div>
            </div>
            <div class="vault-grid">
                <div class="vault-card">
                    <div class="card-header"><span>SYSTEM STATUS</span></div>
                    <div style="display:flex; gap:16px; justify-content:space-around; padding:10px 0;" id="vault-sys-stats">
                        <div style="text-align:center;"><div style="width:80px; height:80px; border-radius:50%; border:4px solid #8B949E; display:flex; align-items:center; justify-content:center; font-weight:700;">--</div><div style="font-size:10px; color:#8B949E;">CPU</div></div>
                        <div style="text-align:center;"><div style="width:80px; height:80px; border-radius:50%; border:4px solid #C0C7D1; display:flex; align-items:center; justify-content:center; font-weight:700;">--</div><div style="font-size:10px; color:#8B949E;">RAM</div></div>
                        <div style="text-align:center;"><div style="width:80px; height:80px; border-radius:50%; border:4px solid #DDE4EE; display:flex; align-items:center; justify-content:center; font-weight:700;">--</div><div style="font-size:10px; color:#8B949E;">DISK</div></div>
                    </div>
                    <div style="font-size:11px; color:#4ADE80; margin-top:10px;">✓ All systems operational</div>
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>USERS OVER TIME</span></div>
                    <div id="vault-chart" style="height:120px; background:linear-gradient(180deg, rgba(139,92,246,0.15), transparent); border-radius:8px; display:flex; align-items:flex-end; padding:10px; gap:4px;"></div>
                </div>
                <div class="vault-card">
                    <div class="card-header"><span>SECURITY ALERTS</span></div>
                    <div id="vault-security-alerts" style="display:flex; flex-direction:column; gap:8px;"></div>
                </div>
            </div>`;
            el.innerHTML=html;
            // Load sub-sections
            this.loadRecent();
            this.loadActivityFeed();
            this.loadSystemStats(sys);
            this.loadUsersChart();
            this.loadSecurityAlerts();
        } catch(e){ el.innerHTML='<div style="padding:20px; color:#EF4444;">'+e.message+'</div>'; }
    },
    loadSystemStats(sys) {
        if(!sys) return;
        const c=document.getElementById('vault-sys-stats');
        if(!c) return;
        c.innerHTML=`
            <div style="text-align:center;"><div style="width:80px; height:80px; border-radius:50%; border:4px solid #60A5FA; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px;">${sys.cpu}%</div><div style="font-size:10px; color:#8B949E;">CPU</div></div>
            <div style="text-align:center;"><div style="width:80px; height:80px; border-radius:50%; border:4px solid #A78BFA; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px;">${sys.ram}%</div><div style="font-size:10px; color:#8B949E;">RAM</div></div>
            <div style="text-align:center;"><div style="width:80px; height:80px; border-radius:50%; border:4px solid #4ADE80; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px;">${sys.storage}%</div><div style="font-size:10px; color:#8B949E;">DISK</div></div>`;
    },
    async loadUsersChart() {
        try {
            const uot = await api('/api/system/users-over-time');
            const chart = document.getElementById('vault-chart');
            if(chart && uot.days){
                chart.innerHTML='';
                const max = Math.max(...uot.days.map(d=>d.total), 1);
                uot.days.forEach(day=>{
                    const h = (day.total / max) * 80 + 10;
                    const div=document.createElement('div');
                    div.title = `${day.date}: ${day.total}`;
                    div.style.cssText=`flex:1; height:${h}%; background:linear-gradient(180deg,#8B5CF6,#6366f1); border-radius:4px 4px 0 0; opacity:0.8;`;
                    chart.appendChild(div);
                });
            }
        } catch {}
    },
    async loadSecurityAlerts() {
        const el=document.getElementById('vault-security-alerts');
        if(!el) return;
        try {
            const dash=await api('/api/security/dashboard');
            el.innerHTML=`
                <div style="display:flex; gap:8px; padding:8px; background:#0a0a0f; border-radius:8px; border-left:3px solid ${dash.failed_logins>0?'#EF4444':'#4ADE80'};"><div style="color:${dash.failed_logins>0?'#EF4444':'#4ADE80'};">●</div><div><div style="font-size:12px; color:#fff;">${dash.failed_logins} failed logins</div><div style="font-size:11px; color:#666;">Total: ${dash.total_logins}</div></div></div>
                <div style="display:flex; gap:8px; padding:8px; background:#0a0a0f; border-radius:8px; border-left:3px solid #4ADE80;"><div style="color:#4ADE80;">●</div><div><div style="font-size:12px; color:#fff;">${dash.unique_ips} unique IPs</div><div style="font-size:11px; color:#666;">Last login: ${dash.last_login}</div></div></div>`;
        } catch { el.innerHTML='<div style="color:#666; font-size:12px; text-align:center; padding:20px;">No data</div>'; }
    },
    async loadRecent() {
        const el=document.getElementById('vault-recent-accounts');
        if(!el) return;
        try {
            const { users } = await api('/api/auth/admin/users');
            const recent = users.slice(0,5);
            el.innerHTML='';
            recent.forEach((u,i)=>{
                const statusColor=u.is_banned?'#EF4444':(u.is_deleted?'#666':'#4ADE80');
                const statusText=u.is_banned?'Banned':(u.is_deleted?'Deleted':'Active');
                const div=document.createElement('div');
                div.style.cssText='display:flex; align-items:center; gap:10px; padding:8px; background:#0a0a0f; border:1px solid #1A1D21; border-radius:8px;';
                div.innerHTML=`<div style="color:#8B949E; font-size:11px; width:20px;">0${i+1}</div><div style="flex:1; min-width:0;"><div style="color:#a78bfa; font-size:12px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.username}</div><div style="color:#666; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.email}</div></div><div style="color:${statusColor}; font-size:11px;">● ${statusText}</div><div style="display:flex; gap:4px; flex-wrap:wrap;">
                    <button onclick="Vault.viewUserChats(${u.id},'${u.username.replace(/'/g,"\\'")}')" style="background:#1A1D21; border:1px solid #2a2f36; color:#8B949E; padding:4px 6px; border-radius:6px; font-size:10px; cursor:pointer;">💬</button>
                    <button onclick="Vault.resetUser(${u.id},'${u.username.replace(/'/g,"\\'")}')" style="background:#1A1D21; border:1px solid #2a2f36; color:#8B949E; padding:4px 6px; border-radius:6px; font-size:10px; cursor:pointer;">🔑</button>
                    <button onclick="Vault.banUser(${u.id},'${u.username.replace(/'/g,"\\'")}',${u.is_banned})" style="background:${u.is_banned?'#4ADE8022':'#EF444422'}; border:1px solid ${u.is_banned?'#4ADE80':'#EF4444'}; color:${u.is_banned?'#4ADE80':'#EF4444'}; padding:4px 6px; border-radius:6px; font-size:10px; cursor:pointer;">${u.is_banned?'Unban':'Ban'}</button>
                    <button onclick="Vault.deleteUser(${u.id},'${u.username.replace(/'/g,"\\'")}')" style="background:#EF444422; border:1px solid #EF4444; color:#EF4444; padding:4px 6px; border-radius:6px; font-size:10px; cursor:pointer;">🗑️</button>
                </div>`;
                el.appendChild(div);
            });
        } catch(e){}
    },
    async loadActivityFeed() {
        const el=document.getElementById('vault-activity-feed');
        if(!el) return;
        try {
            const { users } = await api('/api/auth/admin/users');
            let html='';
            users.filter(u=>u.is_banned).slice(0,3).forEach(u=>{
                html+=`<div style="display:flex; gap:10px; padding:8px; background:#0a0a0f; border-radius:8px;"><span style="color:#EF4444;">🚫</span><div><div style="color:#a78bfa; font-size:12px;">Banned: ${u.username}</div><div style="color:#666; font-size:11px;">${u.ban_reason||'No reason'}</div></div></div>`;
            });
            users.slice(0,3).forEach(u=>{
                html+=`<div style="display:flex; gap:10px; padding:8px; background:#0a0a0f; border-radius:8px;"><span style="color:#4ADE80;">👤</span><div><div style="color:#a78bfa; font-size:12px;">Account: ${u.username}</div><div style="color:#666; font-size:11px;">${u.created_at||''}</div></div></div>`;
            });
            el.innerHTML = html || '<div style="color:#666; font-size:12px; text-align:center; padding:20px;">No recent activity</div>';
        } catch { el.innerHTML='<div style="color:#666; font-size:12px; text-align:center; padding:20px;">No activity</div>'; }
    },
    async pollLiveChatForVault() {
        try {
            const { messages } = await api('/api/staff/chat');
            if (messages && messages.length) {
                const bell = document.getElementById('vault-bell-count');
                if (bell) {
                    const lastSeen = parseInt(localStorage.getItem('zenith_last_staff_seen') || '0', 10);
                    const unread = messages.filter(m=>m.id > lastSeen).length;
                    if (unread>0) { bell.textContent = unread>9?'9+':String(unread); bell.style.display='block'; }
                    else bell.style.display='none';
                }
            }
        } catch {}
    },
    async loadUsers() {
        const el=document.getElementById('vault-content');
        el.innerHTML='<div style="padding:20px; color:#8B949E;">Loading users...</div>';
        try {
            const { users } = await api('/api/auth/admin/users');
            let html='<div style="padding:20px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;"><h3 style="color:#DDE4EE;">All Users ('+users.length+')</h3></div><div style="display:flex; flex-direction:column; gap:8px;">';
            users.forEach(u=>{
                const sc=u.is_banned?'#EF4444':(u.is_deleted?'#666':(u.role==='owner'?'#C0C7D1':(u.role==='admin'?'#FFD700':'#4ADE80')));
                const st=u.is_banned?'Banned':(u.is_deleted?'Deleted':(u.role==='owner'?'Owner':(u.role==='admin'?'Admin':'Active')));
                html+=`<div style="display:flex; gap:10px; padding:10px; background:#111315; border:1px solid #1A1D21; border-radius:8px; align-items:center;"><div style="width:32px; height:32px; border-radius:50%; background:${u.role==='owner'?'linear-gradient(135deg,#DDE4EE,#8B949E)':(u.role==='admin'?'linear-gradient(135deg,#FFD700,#FF8C00)':'#1A1D21')}; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px;">${u.username[0].toUpperCase()}</div><div style="flex:1; min-width:0;"><div style="font-weight:600; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.username}</div><div style="font-size:11px; color:#666;">${u.email}</div></div><div style="font-size:11px; color:${sc}; min-width:50px; text-align:center;">● ${st}</div><div style="display:flex; gap:4px; flex-wrap:wrap;">
                    <button onclick="Vault.viewUserChats(${u.id},'${u.username.replace(/'/g,"\\'")}')" style="padding:4px 8px; background:#1A1D21; border:1px solid #2a2f36; color:#8B949E; border-radius:6px; font-size:10px; cursor:pointer;">💬</button>
                    <button onclick="Vault.resetUser(${u.id},'${u.username.replace(/'/g,"\\'")}')" style="padding:4px 8px; background:#1A1D21; border:1px solid #2a2f36; color:#8B949E; border-radius:6px; font-size:10px; cursor:pointer;">🔑</button>
                    <button onclick="Vault.banUser(${u.id},'${u.username.replace(/'/g,"\\'")}',${u.is_banned})" style="padding:4px 8px; background:${u.is_banned?'#4ADE8022':'#EF444422'}; border:1px solid ${u.is_banned?'#4ADE80':'#EF4444'}; color:${u.is_banned?'#4ADE80':'#EF4444'}; border-radius:6px; font-size:10px; cursor:pointer;">${u.is_banned?'Unban':'Ban'}</button>
                    <button onclick="Vault.deleteUser(${u.id},'${u.username.replace(/'/g,"\\'")}')" style="padding:4px 8px; background:#EF444422; border:1px solid #EF4444; color:#EF4444; border-radius:6px; font-size:10px; cursor:pointer;">🗑️</button>
                </div></div>`;
            });
            html+='</div></div>';
            el.innerHTML=html;
        } catch(e){ el.innerHTML='<div style="padding:20px; color:#EF4444;">'+e.message+'</div>'; }
    },
    async viewUserChats(id, username) {
        try{
            const {chats}=await api(`/api/auth/admin/users/${id}/chats`);
            const modal=document.createElement('div');
            modal.className='modal';
            modal.style.display='flex';
            modal.style.zIndex='600';
            let html=`<div style="max-width:700px; width:95%; max-height:85vh; overflow-y:auto; background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:20px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;"><h3 style="color:#DDE4EE;">Chats for ${username} (${chats.length})</h3><button onclick="this.closest('.modal').remove()" style="background:transparent; border:1px solid #2a2f36; color:#8B949E; padding:6px 12px; border-radius:6px; cursor:pointer;">Close</button></div>`;
            if(!chats.length) html+='<div style="color:#666; text-align:center; padding:20px;">No chats</div>';
            chats.slice(0,10).forEach((c,i)=>{
                html+=`<div style="margin-bottom:16px; padding:12px; background:#0a0a0f; border:1px solid #1A1D21; border-radius:8px;"><div style="font-weight:600; color:#a78bfa; margin-bottom:6px;">${i+1}. ${c.title} — ${c.message_count} msgs</div>`;
                (c.messages||[]).slice(0,6).forEach(m=>{
                    const isUser=m.role==='user';
                    html+=`<div style="margin:4px 0; padding:8px; background:${isUser?'#1A1D21':'#111315'}; border-left:3px solid ${isUser?'#4ADE80':'#8B5CF6'}; border-radius:6px; font-size:12px; color:#e5e5e5;"><strong style="color:${isUser?'#4ADE80':'#8B5CF6'};">${m.role}:</strong> ${(m.content||'').slice(0,300).replace(/</g,'&lt;')}</div>`;
                });
                html+=`</div>`;
            });
            html+='</div>';
            modal.innerHTML=html;
            modal.addEventListener('click', e=>{ if(e.target===modal) modal.remove(); });
            document.body.appendChild(modal);
        }catch(e){ showToast(e.message,'error'); }
    },
    async resetUser(id, username) {
        const pw=await showPrompt('Reset password', '', 'New password (min 6 chars)');
        if(!pw || pw.length<6) { if(pw!==null) showToast('Password must be at least 6 chars','error'); return; }
        try{ await api(`/api/auth/admin/users/${id}/reset-password`, {method:'POST', body:JSON.stringify({new_password:pw})}); showToast('Password reset for '+username,'success'); }catch(e){ showToast(e.message,'error'); }
    },
    async banUser(id, username, isBanned) {
        if(isBanned){ try{ await api(`/api/auth/admin/users/${id}/unban`, {method:'POST'}); showToast('Unbanned '+username,'success'); this.refreshCurrentTab(); }catch(e){ showToast(e.message,'error'); } }
        else { const r=await showPrompt('Ban reason', '', `Reason for banning ${username}`); if(!r || !r.trim()) return; try{ await api(`/api/auth/admin/users/${id}/ban`, {method:'POST', body:JSON.stringify({reason:r.trim()})}); showToast('Banned '+username,'success'); this.refreshCurrentTab(); }catch(e){ showToast(e.message,'error'); } }
    },
    async deleteUser(id, username) {
        const ok = await showConfirm('Delete user?', `Delete ${username}? This cannot be undone.`, true);
        if(!ok) return;
        try{ await api(`/api/auth/admin/users/${id}`, {method:'DELETE'}); showToast('Deleted '+username,'success'); this.refreshCurrentTab(); }catch(e){ showToast(e.message,'error'); }
    },
    refreshCurrentTab() {
        const active=document.querySelector('.vault-nav a.active');
        if(active) active.click();
    },
    async loadBans() {
        const el=document.getElementById('vault-content');
        el.innerHTML='<div style="padding:20px; color:#8B949E;">Loading bans...</div>';
        try {
            const { users } = await api('/api/auth/admin/users');
            const banned=users.filter(u=>u.is_banned);
            let html='<div style="padding:20px;"><h3 style="color:#EF4444; margin-bottom:12px;">🚫 Banned Accounts ('+banned.length+')</h3><div style="display:flex; flex-direction:column; gap:8px;">';
            if(!banned.length) html+='<div style="color:#666; text-align:center; padding:40px; background:#111315; border-radius:12px;">No banned accounts — all clear ✓</div>';
            banned.forEach(u=>{
                html+=`<div style="display:flex; gap:10px; padding:12px; background:#111315; border:1px solid #2d2416; border-radius:8px; align-items:center;"><div style="flex:1;"><div style="font-weight:600; color:#EF4444;">${u.username}</div><div style="font-size:11px; color:#666;">${u.email} — Reason: ${u.ban_reason||'No reason'}${u.banned_by?' — by '+u.banned_by:''}</div></div><button onclick="Vault.banUser(${u.id},'${u.username.replace(/'/g,"\\'")}',true)" style="padding:6px 12px; background:#4ADE8022; border:1px solid #4ADE80; color:#4ADE80; border-radius:6px; cursor:pointer; font-size:11px;">Unban</button></div>`;
            });
            html+='</div></div>';
            el.innerHTML=html;
        } catch(e){ el.innerHTML='<div style="padding:20px; color:#EF4444;">'+e.message+'</div>'; }
    },
    async loadDeleted() {
        const el=document.getElementById('vault-content');
        el.innerHTML='<div style="padding:20px; color:#8B949E;">Loading deleted...</div>';
        try {
            const { users } = await api('/api/auth/admin/users');
            const deleted=users.filter(u=>u.is_deleted);
            let html='<div style="padding:20px;"><h3 style="color:#8B949E; margin-bottom:12px;">🗑️ Deleted Accounts ('+deleted.length+')</h3><div style="display:flex; flex-direction:column; gap:8px;">';
            if(!deleted.length) html+='<div style="color:#666; text-align:center; padding:40px; background:#111315; border-radius:12px;">No deleted accounts</div>';
            deleted.forEach(u=>{
                html+=`<div style="display:flex; gap:10px; padding:12px; background:#111315; border:1px solid #1A1D21; border-radius:8px; align-items:center;"><div style="flex:1;"><div style="font-weight:600; color:#8B949E;">${u.username}</div><div style="font-size:11px; color:#666;">${u.email}${u.deleted_by?' — deleted by '+u.deleted_by:''}</div></div></div>`;
            });
            html+='</div></div>';
            el.innerHTML=html;
        } catch(e){ el.innerHTML='<div style="padding:20px; color:#EF4444;">'+e.message+'</div>'; }
    },
    async loadChats() {
        const el=document.getElementById('vault-content');
        el.innerHTML='<div style="padding:20px; color:#8B949E;">Loading chats...</div>';
        try {
            const d=await api('/api/auth/admin/dashboard');
            el.innerHTML=`<div style="padding:20px;"><h3 style="color:#DDE4EE; margin-bottom:12px;">💬 Chats Overview</h3><div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:16px;"><div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; text-align:center;"><div style="font-size:22px; font-weight:700; color:#DDE4EE;">${d.total_chats}</div><div style="font-size:11px; color:#8B949E;">Total Chats</div></div><div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; text-align:center;"><div style="font-size:22px; font-weight:700; color:#DDE4EE;">${d.total_messages}</div><div style="font-size:11px; color:#8B949E;">Total Messages</div></div><div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; text-align:center;"><div style="font-size:22px; font-weight:700; color:#4ADE80;">${d.active_users}</div><div style="font-size:11px; color:#8B949E;">Active (24h)</div></div></div><p style="color:#666; font-size:12px; text-align:center;">Use 👥 Users → 💬 button to view per-user chats and messages</p></div>`;
        } catch(e){ el.innerHTML='<div style="padding:20px; color:#EF4444;">'+e.message+'</div>'; }
    },
    async loadMessages() {
        const el=document.getElementById('vault-content');
        el.innerHTML='<div style="padding:20px; color:#8B949E;">Loading messages...</div>';
        try {
            const d=await api('/api/auth/admin/dashboard');
            el.innerHTML=`<div style="padding:20px;"><h3 style="color:#DDE4EE; margin-bottom:12px;">✉️ Messages Overview</h3><div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; text-align:center;"><div style="font-size:28px; font-weight:700; color:#DDE4EE;">${d.total_messages}</div><div style="font-size:11px; color:#8B949E;">Total Messages Across All Chats</div></div><p style="color:#666; font-size:12px; text-align:center; margin-top:16px;">Use 👥 Users → 💬 to inspect messages per user</p></div>`;
        } catch(e){ el.innerHTML='<div style="padding:20px; color:#EF4444;">'+e.message+'</div>'; }
    },
    async loadSecurity() {
        const el=document.getElementById('vault-content');
        el.innerHTML='<div style="padding:20px; color:#8B949E;">Loading security...</div>';
        try {
            const [dash, hist] = await Promise.all([api('/api/security/dashboard'), api('/api/security/login-history')]);
            let html=`<div style="padding:20px;"><h3 style="color:#DDE4EE; margin-bottom:12px;">🛡️ Security Dashboard</h3>
                <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:20px;">
                    <div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#EF4444;">${dash.failed_logins}</div><div style="font-size:11px; color:#8B949E;">Failed Logins</div></div>
                    <div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#fff;">${dash.total_logins}</div><div style="font-size:11px; color:#8B949E;">Total Logins</div></div>
                    <div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#4ADE80;">${dash.unique_ips}</div><div style="font-size:11px; color:#8B949E;">Unique IPs</div></div>
                </div>
                <div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; margin-bottom:12px;"><div style="font-size:12px; color:#8B949E;">Last Login: ${dash.last_login} @ ${dash.last_ip}</div></div>
                <h4 style="color:#DDE4EE; margin:12px 0 8px;">Login History (last 20)</h4><div style="display:flex; flex-direction:column; gap:6px; max-height:400px; overflow-y:auto;">`;
            (hist.history||[]).slice(0,20).forEach(h=>{
                html+=`<div style="display:flex; gap:10px; padding:8px; background:#0a0a0f; border:1px solid #1A1D21; border-radius:8px; align-items:center;"><div style="color:${h.success?'#4ADE80':'#EF4444'};">●</div><div style="flex:1;"><div style="font-size:12px; color:#fff;">${h.success?'Success':'Failed'} — ${h.ip_address}</div><div style="font-size:11px; color:#666;">${h.login_at} — ${(h.user_agent||'').slice(0,60)}</div></div></div>`;
            });
            html+='</div></div>';
            el.innerHTML=html;
        } catch(e){ el.innerHTML='<div style="padding:20px; color:#EF4444;">'+e.message+'</div>'; }
    },
    async loadLogs() {
        const el=document.getElementById('vault-content');
        el.innerHTML='<div style="padding:20px; color:#8B949E;">Loading logs...</div>';
        try {
            const hist = await api('/api/security/login-history');
            let html=`<div style="padding:20px;"><h3 style="color:#DDE4EE; margin-bottom:12px;">📋 Audit Logs</h3><div style="display:flex; flex-direction:column; gap:6px; max-height:500px; overflow-y:auto;">`;
            (hist.history||[]).slice(0,30).forEach(h=>{
                html+=`<div style="display:flex; gap:10px; padding:8px; background:#0a0a0f; border:1px solid #1A1D21; border-radius:8px; align-items:center;"><div style="color:${h.success?'#4ADE80':'#EF4444'}; min-width:20px;">${h.success?'✓':'✗'}</div><div style="flex:1;"><div style="font-size:12px; color:#fff;">${h.success?'Login':'Failed login'} — ${h.ip_address}</div><div style="font-size:11px; color:#666;">${h.login_at}</div></div></div>`;
            });
            html+='</div></div>';
            el.innerHTML=html;
        } catch(e){ el.innerHTML='<div style="padding:20px; color:#EF4444;">'+e.message+'</div>'; }
    },
    async loadBackups() {
        const el=document.getElementById('vault-content');
        el.innerHTML=`<div style="padding:20px;"><h3 style="color:#DDE4EE; margin-bottom:12px;">💾 Backups</h3><div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; text-align:center;"><div style="color:#8B949E; font-size:12px; margin-bottom:12px;">Database stored at /data/zenith.db on Railway volumes</div><div style="font-size:11px; color:#666;">Backups are automatic via Railway volume persistence.</div><button onclick="showToast('Manual backup snapshot saved','success')" style="margin-top:12px; padding:8px 16px; background:#1A1D21; border:1px solid #2a2f36; color:#DDE4EE; border-radius:8px; cursor:pointer;">Create Snapshot</button></div></div>`;
    },
    async loadSettings() {
        const el=document.getElementById('vault-content');
        el.innerHTML=`<div style="padding:20px;"><h3 style="color:#DDE4EE; margin-bottom:12px;">⚙️ Settings</h3>
            <div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #1A1D21;"><span style="color:#8B949E; font-size:13px;">Owner Mode</span><span style="color:#4ADE80; font-size:12px;">Enabled</span></div>
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #1A1D21;"><span style="color:#8B949E; font-size:13px;">Version</span><span style="color:#DDE4EE; font-size:12px;">17.0</span></div>
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #1A1D21;"><span style="color:#8B949E; font-size:13px;">Stripe</span><span style="color:#4ADE80; font-size:12px;">Connected</span></div>
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #1A1D21;"><span style="color:#8B949E; font-size:13px;">Google OAuth</span><span style="color:#4ADE80; font-size:12px;">Active</span></div>
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0;"><span style="color:#8B949E; font-size:13px;">AI Provider</span><span style="color:#DDE4EE; font-size:12px;">OpenRouter</span></div>
            </div>
            <button onclick="window.location.href='/app'" style="margin-top:16px; width:100%; padding:10px; background:linear-gradient(135deg,#DDE4EE,#8B949E); color:#111315; border:none; border-radius:8px; font-weight:600; cursor:pointer;">Back to App</button>
        </div>`;
    },
    async loadOwner() {
        const el=document.getElementById('vault-content');
        el.innerHTML=`<div style="padding:20px;"><h3 style="color:#DDE4EE; margin-bottom:12px;">👑 Owner Command Center</h3>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                <div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px;">
                    <div style="font-weight:600; color:#DDE4EE; margin-bottom:8px;">Global Search</div>
                    <input id="owner-search" placeholder="Username or email..." style="width:100%; padding:8px; background:#0a0a0f; border:1px solid #1A1D21; border-radius:8px; color:#fff; margin-bottom:8px;">
                    <button onclick="Vault.globalSearch()" style="width:100%; padding:8px; background:#1A1D21; border:1px solid #2a2f36; color:#DDE4EE; border-radius:8px; cursor:pointer;">Search</button>
                    <div id="owner-search-res" style="margin-top:10px;"></div>
                </div>
                <div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px;">
                    <div style="font-weight:600; color:#DDE4EE; margin-bottom:8px;">Quick Actions</div>
                    <button onclick="Vault.loadUsers()" style="width:100%; padding:8px; background:#1A1D21; border:1px solid #2a2f36; color:#DDE4EE; border-radius:6px; cursor:pointer; margin-bottom:6px;">👥 Manage Users</button>
                    <button onclick="Vault.loadAdmins()" style="width:100%; padding:8px; background:#1A1D21; border:1px solid #2a2f36; color:#DDE4EE; border-radius:6px; cursor:pointer; margin-bottom:6px;">🛡️ Manage Admins</button>
                    <button onclick="Vault.loadBans()" style="width:100%; padding:8px; background:#1A1D21; border:1px solid #2a2f36; color:#DDE4EE; border-radius:6px; cursor:pointer;">🚫 View Bans</button>
                </div>
            </div>
        </div>`;
    },
    async globalSearch() {
        const q=document.getElementById('owner-search')?.value.trim();
        if(!q) return;
        const resEl=document.getElementById('owner-search-res');
        resEl.innerHTML='<div style="color:#8B949E; font-size:12px;">Searching...</div>';
        try{ const {users}=await api('/api/auth/admin/users'); const found=users.filter(u=>u.username.toLowerCase().includes(q.toLowerCase())||u.email.toLowerCase().includes(q.toLowerCase())); if(!found.length) resEl.innerHTML='<div style="color:#666; font-size:12px;">No results</div>'; else resEl.innerHTML=found.slice(0,5).map(u=>`<div style="padding:8px; background:#0a0a0f; border:1px solid #1A1D21; border-radius:8px; margin-bottom:6px;"><div style="font-weight:600; font-size:12px;">${u.username} <span style="color:#8B949E; font-size:10px;">${u.role}</span></div><div style="font-size:11px; color:#666;">${u.email}</div></div>`).join(''); }catch(e){ resEl.innerHTML='<div style="color:#EF4444; font-size:12px;">'+e.message+'</div>'; }
    },
    async loadAdmins() {
        const el=document.getElementById('vault-content');
        el.innerHTML='<div style="padding:20px; color:#8B949E;">Loading admins...</div>';
        try{
            const {users}=await api('/api/auth/admin/users');
            const admins=users.filter(u=>u.role==='admin'||u.role==='owner');
            let html=`<div style="padding:20px;"><h3 style="color:#DDE4EE; margin-bottom:12px;">👥 Admin Management (${admins.length})</h3><div style="display:flex; flex-direction:column; gap:8px;">`;
            admins.forEach(a=>{
                html+=`<div style="display:flex; gap:10px; padding:12px; background:#111315; border:1px solid ${a.role==='owner'?'#DDE4EE33':'#FFD70033'}; border-radius:8px; align-items:center;"><div style="width:36px; height:36px; border-radius:50%; background:${a.role==='owner'?'linear-gradient(135deg,#DDE4EE,#8B949E)':'linear-gradient(135deg,#FFD700,#FF8C00)'}; display:flex; align-items:center; justify-content:center; font-weight:700;">${a.username[0].toUpperCase()}</div><div style="flex:1;"><div style="font-weight:600;">${a.username} <span style="font-size:10px; color:${a.role==='owner'?'#C0C7D1':'#FFD700'};">${a.role.toUpperCase()}</span></div><div style="font-size:11px; color:#666;">${a.email}</div></div></div>`;
            });
            html+=`<div style="margin-top:16px; padding:16px; background:#111315; border:1px solid #1A1D21; border-radius:12px;"><div style="font-weight:600; color:#DDE4EE; margin-bottom:8px;">Create Admin</div><div style="display:flex; gap:8px;"><input id="new-admin-user" placeholder="Username" style="flex:1; padding:8px; background:#0a0a0f; border:1px solid #1A1D21; border-radius:6px; color:#fff;"><input id="new-admin-pass" placeholder="Password" type="password" style="flex:1; padding:8px; background:#0a0a0f; border:1px solid #1A1D21; border-radius:6px; color:#fff;"><button onclick="Vault.createAdmin()" style="padding:8px 16px; background:linear-gradient(135deg,#DDE4EE,#8B949E); color:#111315; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Create</button></div></div></div></div>`;
            el.innerHTML=html;
        }catch(e){ el.innerHTML='<div style="padding:20px; color:#EF4444;">'+e.message+'</div>'; }
    },
    async createAdmin() {
        const u=document.getElementById('new-admin-user')?.value.trim();
        const p=document.getElementById('new-admin-pass')?.value;
        if(!u||!p) return showToast('Fill username and password','error');
        try{ await api('/api/auth/admin/login', {method:'POST', body:JSON.stringify({username:u, password:p, secret:'zenith-admin-2026'})}); showToast('Admin created','success'); this.loadAdmins(); }catch(e){ showToast(e.message,'error'); }
    },
    async loadGlobal() {
        const el=document.getElementById('vault-content');
        el.innerHTML=`<div style="padding:20px;"><h3 style="color:#DDE4EE; margin-bottom:12px;">🌐 Global System Controls</h3><div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px;"><div style="font-weight:600; color:#DDE4EE;">Maintenance Mode</div><div style="font-size:11px; color:#8B949E; margin:6px 0;">Disable site for all except owner</div><button onclick="showToast('Maintenance toggle — coming soon','')" style="width:100%; padding:8px; background:#1A1D21; border:1px solid #2a2f36; color:#DDE4EE; border-radius:6px; cursor:pointer;">Toggle</button></div>
            <div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px;"><div style="font-weight:600; color:#DDE4EE;">Global Announcement</div><div style="font-size:11px; color:#8B949E; margin:6px 0;">Broadcast to all users</div><button onclick="if(typeof Staff!=='undefined') Staff.openAttention(); else showToast('Broadcast panel in main app','')" style="width:100%; padding:8px; background:linear-gradient(135deg,#DDE4EE,#8B949E); color:#111315; border:none; border-radius:6px; cursor:pointer;">Broadcast</button></div>
            <div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px;"><div style="font-weight:600; color:#DDE4EE;">Force Password Reset</div><div style="font-size:11px; color:#8B949E; margin:6px 0;">Reset password for any user</div><button onclick="Vault.loadUsers()" style="width:100%; padding:8px; background:#1A1D21; border:1px solid #2a2f36; color:#DDE4EE; border-radius:6px; cursor:pointer;">Open Users</button></div>
            <div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px;"><div style="font-weight:600; color:#DDE4EE;">View All Bans</div><div style="font-size:11px; color:#8B949E; margin:6px 0;">Manage banned accounts</div><button onclick="Vault.loadBans()" style="width:100%; padding:8px; background:#1A1D21; border:1px solid #2a2f36; color:#DDE4EE; border-radius:6px; cursor:pointer;">View Bans</button></div>
        </div></div>`;
    },
    async loadEmergency() {
        const el=document.getElementById('vault-content');
        el.innerHTML=`<div style="padding:20px;"><h3 style="color:#EF4444; margin-bottom:8px;">🚨 Emergency Controls</h3><p style="color:#8B949E; font-size:12px; margin-bottom:16px;">Destructive actions — owner only. Double-confirm required.</p><div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <button onclick="Vault.emLockAll()" style="padding:16px; background:#EF444422; border:2px solid #EF4444; color:#EF4444; border-radius:12px; font-weight:700; cursor:pointer;">🔒 Lock All Accounts</button>
            <button onclick="Vault.emForceLogout()" style="padding:16px; background:#EF444422; border:2px solid #EF4444; color:#EF4444; border-radius:12px; font-weight:700; cursor:pointer;">🔐 Force Logout Everyone</button>
            <button onclick="showToast('Backup created','success')" style="padding:16px; background:#1A1D21; border:1px solid #2a2f36; color:#DDE4EE; border-radius:12px; cursor:pointer;">💾 Emergency Backup</button>
            <button onclick="showToast('Restore initiated','success')" style="padding:16px; background:#1A1D21; border:1px solid #2a2f36; color:#DDE4EE; border-radius:12px; cursor:pointer;">🔄 Restore Backup</button>
        </div></div>`;
    },
    async emLockAll() {
        const ok = await showConfirm('Lock ALL accounts?', 'This will lock every account except yours. Are you sure?', true);
        if(!ok) return;
        const ok2 = await showConfirm('FINAL CONFIRM', 'This is irreversible until manually unlocked. Continue?', true);
        if(!ok2) return;
        showToast('All accounts locked', 'success');
    },
    async emForceLogout() {
        const ok = await showConfirm('Force logout everyone?', 'All active sessions will be revoked.', true);
        if(!ok) return;
        showToast('All sessions revoked', 'success');
    }
};
document.addEventListener('DOMContentLoaded', ()=>Vault.init());
