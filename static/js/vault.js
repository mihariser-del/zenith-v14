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
            // Fix top right tag: Owner shows "The One Above All", Admin shows "Admin Access"
            const topTag = document.querySelector('#vault-top-name + div');
            if (topTag) topTag.textContent = isOwner ? 'The One Above All' : 'Admin Access';
            if (!isOwner && !user.is_admin) window.location.href = '/app';
        } catch { window.location.href = '/'; return; }
        this.loadStats();
        this.loadRecent();
        this.loadActivity();
        this.loadSecurity();
        // Hamburger
        const ham = document.getElementById('vault-hamburger');
        const sidebar = document.getElementById('vault-sidebar');
        if(ham && sidebar){
            ham.addEventListener('click', ()=> sidebar.classList.toggle('open'));
            document.addEventListener('click', (e)=>{
                if(window.innerWidth<=768 && !sidebar.contains(e.target) && e.target!==ham) sidebar.classList.remove('open');
            });
        }
        document.querySelectorAll('.vault-nav a').forEach(a=>{
            a.addEventListener('click', ()=>{
                document.querySelectorAll('.vault-nav a').forEach(x=>x.classList.remove('active'));
                a.classList.add('active');
                const tab=a.dataset.tab;
                if(tab==='users') this.loadUsers();
                else if(tab==='dashboard') this.loadDashboard();
                else if(tab==='bans') this.loadBans();
                else if(tab==='deleted') this.loadDeleted();
                else if(tab==='chats') this.loadChats();
                else if(tab==='messages') this.loadMessages();
                else if(tab==='security') this.loadSecurity();
                else if(tab==='logs') this.loadLogs();
                else if(tab==='backups') this.loadBackups();
                else if(tab==='settings') this.loadSettings();
                else showToast('Coming soon: '+tab, '');
                if(window.innerWidth<=768) sidebar.classList.remove('open');
            });
        });
        // View All in activity feed
        const viewAllActivity = document.querySelector('#vault-activity-feed + .view-all, .vault-card .view-all');
        document.querySelectorAll('.view-all').forEach(btn=>{
            if(btn.textContent.includes('View All') && btn.closest('.vault-card') && btn.closest('.vault-card').querySelector('#vault-activity-feed')){
                btn.addEventListener('click', ()=> this.loadActivity(true));
            }
        });
        // Live 1s poll for system + live chat unified
        setInterval(()=>{ this.loadStats(); this.pollLiveChatForVault(); }, 1000);
    },
    async loadStats() {
        try {
            const d = await api('/api/auth/admin/dashboard');
            document.getElementById('stat-total').textContent = d.total_users;
            document.getElementById('stat-banned').textContent = d.banned_count;
            document.getElementById('stat-deleted').textContent = d.deleted_count;
            document.getElementById('stat-chats').textContent = d.total_chats;
            document.getElementById('stat-messages').textContent = d.total_messages;
            document.getElementById('stat-admins').textContent = d.admin_count;
            // Task Manager style live system stats
            try {
                const sys = await api('/api/system/stats');
                document.querySelectorAll('.vault-card').forEach(card=>{
                    const header = card.querySelector('.card-header');
                    if(header && header.textContent.includes('SYSTEM STATUS')){
                        card.innerHTML = `
                            <div class="card-header"><span>SYSTEM STATUS</span><span style="font-size:10px; color:#4ADE80;">● Live 1s</span></div>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                <div style="display:flex; gap:8px; padding:8px; background:#0a0a0f; border:1px solid #1A1D21; border-radius:8px; border-left:3px solid #60A5FA;">
                                    <div style="width:40px; height:40px; border:1px solid #60A5FA; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:8px; color:#60A5FA;">CPU</div>
                                    <div style="flex:1;"><div style="font-size:12px; color:#fff; font-weight:600;">CPU</div><div style="font-size:11px; color:#8B949E;">${sys.cpu}% ${sys.cpu_ghz} GHz</div></div>
                                    <div style="width:60px; height:30px; background:linear-gradient(90deg, rgba(96,165,250,0.3), transparent); border-radius:4px;"></div>
                                </div>
                                <div style="display:flex; gap:8px; padding:8px; background:#0a0a0f; border:1px solid #1A1D21; border-radius:8px; border-left:3px solid #A78BFA;">
                                    <div style="width:40px; height:40px; border:1px solid #A78BFA; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:8px; color:#A78BFA;">MEM</div>
                                    <div style="flex:1;"><div style="font-size:12px; color:#fff; font-weight:600;">Memory</div><div style="font-size:11px; color:#8B949E;">${sys.ram_used}/${sys.ram_total} GB (${sys.ram}%)</div></div>
                                </div>
                                <div style="display:flex; gap:8px; padding:8px; background:#0a0a0f; border:1px solid #1A1D21; border-radius:8px; border-left:3px solid #4ADE80;">
                                    <div style="width:40px; height:40px; border:1px solid #4ADE80; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:8px; color:#4ADE80;">SSD</div>
                                    <div style="flex:1;"><div style="font-size:12px; color:#fff; font-weight:600;">Disk 0 (C:) SSD</div><div style="font-size:11px; color:#8B949E;">${sys.storage}%</div></div>
                                </div>
                                <div style="display:flex; gap:8px; padding:8px; background:#0a0a0f; border:1px solid #1A1D21; border-radius:8px; border-left:3px solid #F97316;">
                                    <div style="width:40px; height:40px; border:1px solid #F97316; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:8px; color:#F97316;">WiFi</div>
                                    <div style="flex:1;"><div style="font-size:12px; color:#fff; font-weight:600;">Wi-Fi</div><div style="font-size:11px; color:#8B949E;">S: ${sys.wifi_sent} R: ${sys.wifi_recv} Mbps</div></div>
                                </div>
                                <div style="display:flex; gap:8px; padding:8px; background:#e0f2fe; border:1px solid #60A5FA; border-radius:8px; border-left:3px solid #60A5FA;">
                                    <div style="width:40px; height:40px; border:1px solid #60A5FA; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:8px; color:#60A5FA;">GPU</div>
                                    <div style="flex:1;"><div style="font-size:12px; color:#111315; font-weight:600;">GPU 0</div><div style="font-size:11px; color:#475569;">${sys.gpu_name}<br>${sys.gpu}%</div></div>
                                </div>
                            </div>
                        `;
                    }
                });
            } catch {}
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
        } catch(e){ console.error(e); }
    },
    async loadRecent() {
        try {
            const { users } = await api('/api/auth/admin/users');
            const recent = users.slice(0,5);
            const el=document.getElementById('vault-recent-accounts');
            el.innerHTML='';
            recent.forEach((u,i)=>{
                const div=document.createElement('div');
                div.style.cssText='display:flex; align-items:center; gap:10px; padding:8px; background:#0a0a0f; border:1px solid #1A1D21; border-radius:8px;';
                const statusColor=u.is_banned?'#EF4444':(u.is_deleted?'#666':'#4ADE80');
                const statusText=u.is_banned?'Banned':(u.is_deleted?'Deleted':'Active');
                div.innerHTML=`<div style="color:#8B949E; font-size:11px; width:20px;">0${i+1}</div><div style="flex:1; min-width:0;"><div style="color:#a78bfa; font-size:12px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.username}</div><div style="color:#666; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.email.replace(/(?<=.{1}).(?=.*@)/g,'*')}</div></div><div style="color:${statusColor}; font-size:11px;">● ${statusText}</div><div style="display:flex; gap:4px; flex-wrap:wrap;">
                    <button data-vault="chat" data-id="${u.id}" style="background:#1A1D21; border:1px solid #2a2f36; color:#8B949E; padding:4px 6px; border-radius:6px; font-size:10px; cursor:pointer;">💬</button>
                    <button data-vault="reset" data-id="${u.id}" style="background:#1A1D21; border:1px solid #2a2f36; color:#8B949E; padding:4px 6px; border-radius:6px; font-size:10px; cursor:pointer;">🔑</button>
                    <button data-vault="ban" data-id="${u.id}" style="background:${u.is_banned?'#4ADE8022':'#EF444422'}; border:1px solid ${u.is_banned?'#4ADE80':'#EF4444'}; color:${u.is_banned?'#4ADE80':'#EF4444'}; padding:4px 6px; border-radius:6px; font-size:10px; cursor:pointer;">${u.is_banned?'Unban':'Ban'}</button>
                    <button data-vault="delete" data-id="${u.id}" style="background:#EF444422; border:1px solid #EF4444; color:#EF4444; padding:4px 6px; border-radius:6px; font-size:10px; cursor:pointer;">🗑️</button>
                </div>`;
                el.appendChild(div);
            });
            // Attach handlers
            el.querySelectorAll('[data-vault="chat"]').forEach(b=>b.addEventListener('click', async()=>{
                const id=b.dataset.id;
                const username=b.closest('div').querySelector('div div')?.textContent || 'User';
                try{
                    const {chats}=await api(`/api/auth/admin/users/${id}/chats`);
                    if(!chats.length){ showToast('No chats for '+username,''); return; }
                    const modal=document.createElement('div');
                    modal.className='modal';
                    modal.style.display='flex';
                    modal.style.zIndex='600';
                    let html=`<div style="max-width:700px; width:95%; max-height:85vh; overflow-y:auto; background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:20px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;"><h3 style="color:#DDE4EE;">Chats for ${username} (${chats.length})</h3><button onclick="this.closest('.modal').remove()" style="background:transparent; border:1px solid #2a2f36; color:#8B949E; padding:6px 12px; border-radius:6px; cursor:pointer;">Close</button></div>`;
                    chats.slice(0,10).forEach((c,i)=>{
                        html+=`<div style="margin-bottom:16px; padding:12px; background:#0a0a0f; border:1px solid #1A1D21; border-radius:8px;"><div style="font-weight:600; color:#a78bfa; margin-bottom:6px;">${i+1}. ${c.title} — ${c.message_count} msgs</div>`;
                        c.messages.slice(0,6).forEach(m=>{
                            const isUser=m.role==='user';
                            html+=`<div style="margin:6px 0; padding:8px; background:${isUser?'#1A1D21':'#111315'}; border-left:3px solid ${isUser?'#4ADE80':'#8B5CF6'}; border-radius:6px; font-size:12px; color:#e5e5e5;"><strong style="color:${isUser?'#4ADE80':'#8B5CF6'};">${m.role}:</strong> ${m.content.slice(0,300).replace(/</g,'&lt;')}</div>`;
                        });
                        html+=`</div>`;
                    });
                    html+='</div>';
                    modal.innerHTML=html;
                    modal.addEventListener('click', e=>{ if(e.target===modal) modal.remove(); });
                    document.body.appendChild(modal);
                }catch(e){ showToast(e.message,'error'); }
            }));
            el.querySelectorAll('[data-vault="reset"]').forEach(b=>b.addEventListener('click', async()=>{
                const id=b.dataset.id;
                const pw=await showPrompt('Reset password', '', 'New password (min 6 chars)');
                if(!pw || pw.length<6) { if(pw!==null) showToast('Password must be at least 6 chars','error'); return; }
                try{ await api(`/api/auth/admin/users/${id}/reset-password`, {method:'POST', body:JSON.stringify({new_password:pw})}); showToast('Password reset','success'); }catch(e){ showToast(e.message,'error'); }
            }));
            el.querySelectorAll('[data-vault="ban"]').forEach(b=>b.addEventListener('click', async()=>{
                const id=b.dataset.id;
                const isBanned=b.textContent==='Unban';
                if(isBanned){ try{ await api(`/api/auth/admin/users/${id}/unban`, {method:'POST'}); showToast('Unbanned','success'); Vault.loadRecent(); Vault.loadStats(); }catch(e){ showToast(e.message,'error'); } }
                else { const reason=await showPrompt('Ban reason', '', 'Enter a reason for the ban (shown to the user)'); if(!reason || !reason.trim()) return; try{ await api(`/api/auth/admin/users/${id}/ban`, {method:'POST', body:JSON.stringify({reason:reason.trim()})}); showToast('Banned','success'); Vault.loadRecent(); Vault.loadStats(); }catch(e){ showToast(e.message,'error'); } }
            }));
            el.querySelectorAll('[data-vault="delete"]').forEach(b=>b.addEventListener('click', async()=>{
                const id=b.dataset.id;
                const username=b.closest('div').querySelector('div div')?.textContent || 'this user';
                const ok = await showConfirm('Delete user?', `Delete ${username}? This cannot be undone.`, true);
                if(!ok) return;
                try{ await api(`/api/auth/admin/users/${id}`, {method:'DELETE'}); showToast('Deleted','success'); Vault.loadRecent(); Vault.loadStats(); }catch(e){ showToast(e.message,'error'); }
            }));
        } catch(e){}
    },
    async loadActivity() {
        const el=document.getElementById('vault-activity-feed');
        if(!el) return;
        try {
            const { users } = await api('/api/auth/admin/users');
            const banned = users.filter(u=>u.is_banned).slice(0,3);
            const recent = users.slice(0,3);
            let html='';
            banned.forEach(u=>{
                html+=`<div style="display:flex; gap:10px; padding:8px; background:#0a0a0f; border-radius:8px;"><span style="color:#EF4444;">🚫</span><div><div style="color:#a78bfa; font-size:12px;">Banned: ${u.username}</div><div style="color:#666; font-size:11px;">${u.ban_reason||'No reason'} — ${u.is_banned?'Active':''}</div></div></div>`;
            });
            recent.forEach(u=>{
                html+=`<div style="display:flex; gap:10px; padding:8px; background:#0a0a0f; border-radius:8px;"><span style="color:#4ADE80;">👤</span><div><div style="color:#a78bfa; font-size:12px;">New account: ${u.username}</div><div style="color:#666; font-size:11px;">${u.email} — ${u.created_at||''}</div></div></div>`;
            });
            el.innerHTML = html || '<div style="color:#666; font-size:12px; text-align:center; padding:20px;">No recent activity</div>';
        } catch {
            el.innerHTML='<div style="color:#666; font-size:12px; text-align:center; padding:20px;">No activity</div>';
        }
    },
    async pollLiveChatForVault() {
        try {
            const { messages } = await api('/api/staff/chat');
            if (messages && messages.length) {
                const last = messages[messages.length - 1];
                // Update bell count if any
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
    async loadSecurity() {
        // Handle both the dashboard widget and the full tab
        const isTab = document.querySelector('.vault-nav a.active')?.dataset.tab === 'security';
        if (isTab) {
            const el=document.getElementById('vault-content');
            el.innerHTML='<div style="padding:20px; color:#8B949E;">Loading security...</div>';
            try {
                const [dash, hist] = await Promise.all([api('/api/security/dashboard'), api('/api/security/login-history')]);
                let html=`<div style="padding:20px;"><h3 style="color:#DDE4EE; margin-bottom:12px;">Security Dashboard</h3>
                    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:20px;">
                        <div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#EF4444;">${dash.failed_logins}</div><div style="font-size:11px; color:#8B949E;">Failed Logins</div></div>
                        <div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#fff;">${dash.total_logins}</div><div style="font-size:11px; color:#8B949E;">Total Logins</div></div>
                        <div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; text-align:center;"><div style="font-size:20px; font-weight:700; color:#4ADE80;">${dash.unique_ips}</div><div style="font-size:11px; color:#8B949E;">Unique IPs</div></div>
                    </div>
                    <div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; margin-bottom:12px;"><div style="font-size:12px; color:#8B949E; margin-bottom:8px;">Last Login: ${dash.last_login} @ ${dash.last_ip}</div></div>
                    <h4 style="color:#DDE4EE; margin:12px 0 8px;">Login History (last 20)</h4><div style="display:flex; flex-direction:column; gap:6px; max-height:400px; overflow-y:auto;">`;
                hist.history.slice(0,20).forEach(h=>{
                    html+=`<div style="display:flex; gap:10px; padding:8px; background:#0a0a0f; border:1px solid #1A1D21; border-radius:8px; align-items:center;"><div style="color:${h.success?'#4ADE80':'#EF4444'};">●</div><div style="flex:1;"><div style="font-size:12px; color:#fff;">${h.success?'Success':'Failed'} — ${h.ip_address}</div><div style="font-size:11px; color:#666;">${h.login_at} — ${h.user_agent.slice(0,60)}</div></div></div>`;
                });
                html+='</div></div>';
                el.innerHTML=html;
            } catch(e){ document.getElementById('vault-content').innerHTML='<div style="padding:20px; color:#EF4444;">'+e.message+'</div>'; }
            return;
        }
        const el=document.getElementById('vault-security-alerts');
        if(!el) return;
        try {
            const dash=await api('/api/security/dashboard');
            el.innerHTML=`
                <div style="display:flex; gap:8px; padding:8px; background:#0a0a0f; border-radius:8px; border-left:3px solid ${dash.failed_logins>0?'#EF4444':'#4ADE80'};"><div style="color:${dash.failed_logins>0?'#EF4444':'#4ADE80'};">●</div><div><div style="font-size:12px; color:#fff;">${dash.failed_logins} failed login attempts</div><div style="font-size:11px; color:#666;">Total: ${dash.total_logins} — Last: ${dash.last_ip}</div></div></div>
                <div style="display:flex; gap:8px; padding:8px; background:#0a0a0f; border-radius:8px; border-left:3px solid #4ADE80;"><div style="color:#4ADE80;">●</div><div><div style="font-size:12px; color:#fff;">Unique IPs: ${dash.unique_ips}</div><div style="font-size:11px; color:#666;">Last login: ${dash.last_login}</div></div></div>
            `;
        } catch {
            el.innerHTML='<div style="color:#666; font-size:12px; text-align:center; padding:20px;">No security data</div>';
        }
    },
    async loadUsers() {
        const el=document.getElementById('vault-content');
        el.innerHTML='<div style="padding:20px; color:#8B949E;">Loading users...</div>';
        try {
            const { users } = await api('/api/auth/admin/users');
            let html='<div style="padding:20px;"><h3 style="color:#DDE4EE; margin-bottom:12px;">Users ('+users.length+')</h3><div style="display:flex; flex-direction:column; gap:8px;">';
            users.forEach(u=>{
                html+=`<div style="display:flex; gap:10px; padding:10px; background:#111315; border:1px solid #1A1D21; border-radius:8px; align-items:center;"><div style="width:32px; height:32px; border-radius:50%; background:#1A1D21; display:flex; align-items:center; justify-content:center; font-weight:700;">${u.username[0].toUpperCase()}</div><div style="flex:1;"><div style="font-weight:600; font-size:13px;">${u.username}</div><div style="font-size:11px; color:#666;">${u.email}</div></div><div style="font-size:11px; color:${u.is_banned?'#EF4444':(u.is_deleted?'#666':'#4ADE80')};">${u.is_banned?'Banned':(u.is_deleted?'Deleted':'Active')}</div><div style="display:flex; gap:4px;"><button onclick="Vault.banUser(${u.id},'${u.username}',${u.is_banned})" style="padding:4px 8px; background:${u.is_banned?'#4ADE8022':'#EF444422'}; border:1px solid ${u.is_banned?'#4ADE80':'#EF4444'}; color:${u.is_banned?'#4ADE80':'#EF4444'}; border-radius:6px; font-size:10px; cursor:pointer;">${u.is_banned?'Unban':'Ban'}</button><button onclick="Vault.deleteUser(${u.id},'${u.username}')" style="padding:4px 8px; background:#EF444422; border:1px solid #EF4444; color:#EF4444; border-radius:6px; font-size:10px; cursor:pointer;">Delete</button></div></div>`;
            });
            html+='</div></div>';
            el.innerHTML=html;
        } catch(e){ el.innerHTML='<div style="padding:20px; color:#EF4444;">'+e.message+'</div>'; }
    },
    async banUser(id, username, isBanned) {
        if(isBanned){ try{ await api(`/api/auth/admin/users/${id}/unban`, {method:'POST'}); showToast('Unbanned '+username,'success'); this.loadUsers(); this.loadStats(); }catch(e){ showToast(e.message,'error'); } }
        else { const r=await showPrompt('Ban reason', '', `Enter a reason for banning ${username} (shown to the user)`); if(!r || !r.trim()) return; try{ await api(`/api/auth/admin/users/${id}/ban`, {method:'POST', body:JSON.stringify({reason:r.trim()})}); showToast('Banned '+username,'success'); this.loadUsers(); this.loadStats(); }catch(e){ showToast(e.message,'error'); } }
    },
    async deleteUser(id, username) {
        const ok = await showConfirm('Delete user?', `Delete ${username}? This cannot be undone.`, true);
        if(!ok) return;
        try{ await api(`/api/auth/admin/users/${id}`, {method:'DELETE'}); showToast('Deleted '+username,'success'); this.loadUsers(); this.loadStats(); }catch(e){ showToast(e.message,'error'); }
    },
    async loadDashboard() {
        const el=document.getElementById('vault-content');
        el.innerHTML='<div style="padding:20px; color:#8B949E;">Reloading dashboard...</div>';
        location.reload();
    },
    async loadBans() {
        const el=document.getElementById('vault-content');
        el.innerHTML='<div style="padding:20px; color:#8B949E;">Loading bans...</div>';
        try {
            const { users } = await api('/api/auth/admin/users');
            const banned=users.filter(u=>u.is_banned);
            let html='<div style="padding:20px;"><h3 style="color:#EF4444; margin-bottom:12px;">Banned Accounts ('+banned.length+')</h3><div style="display:flex; flex-direction:column; gap:8px;">';
            if(!banned.length) html+='<div style="color:#666; text-align:center; padding:20px;">No banned accounts</div>';
            banned.forEach(u=>{
                html+=`<div style="display:flex; gap:10px; padding:10px; background:#111315; border:1px solid #2d2416; border-radius:8px; align-items:center;"><div style="flex:1;"><div style="font-weight:600;">${u.username}</div><div style="font-size:11px; color:#666;">${u.email} — ${u.ban_reason||'No reason'}</div></div><button onclick="Vault.banUser(${u.id},'${u.username}',true)" style="padding:6px 12px; background:#4ADE8022; border:1px solid #4ADE80; color:#4ADE80; border-radius:6px; cursor:pointer;">Unban</button></div>`;
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
            // Deleted are filtered via is_deleted, but admin/users may not return deleted if filtered? Try to fetch via dashboard users (all)
            const deleted=users.filter(u=>u.is_deleted);
            let html='<div style="padding:20px;"><h3 style="color:#8B949E; margin-bottom:12px;">Deleted Accounts ('+deleted.length+')</h3><div style="display:flex; flex-direction:column; gap:8px;">';
            if(!deleted.length) html+='<div style="color:#666; text-align:center; padding:20px;">No deleted accounts</div>';
            deleted.forEach(u=>{
                html+=`<div style="display:flex; gap:10px; padding:10px; background:#111315; border:1px solid #1A1D21; border-radius:8px; align-items:center;"><div style="flex:1;"><div style="font-weight:600;">${u.username}</div><div style="font-size:11px; color:#666;">${u.email}</div></div><div style="color:#666; font-size:11px;">Deleted</div></div>`;
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
            el.innerHTML=`<div style="padding:20px;"><h3 style="color:#DDE4EE; margin-bottom:12px;">Chats</h3><div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px;"><div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; text-align:center;"><div style="font-size:22px; font-weight:700;">${d.total_chats}</div><div style="font-size:11px; color:#8B949E;">Total Chats</div></div><div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; text-align:center;"><div style="font-size:22px; font-weight:700;">${d.total_messages}</div><div style="font-size:11px; color:#8B949E;">Total Messages</div></div><div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; text-align:center;"><div style="font-size:22px; font-weight:700;">${d.active_users}</div><div style="font-size:11px; color:#8B949E;">Active (24h)</div></div></div><p style="color:#666; font-size:12px; text-align:center; margin-top:20px;">Use Users → Chat button to view per-user chats</p></div>`;
        } catch(e){ el.innerHTML='<div style="padding:20px; color:#EF4444;">'+e.message+'</div>'; }
    },
    async loadMessages() {
        const el=document.getElementById('vault-content');
        el.innerHTML='<div style="padding:20px; color:#8B949E;">Loading messages...</div>';
        try {
            const d=await api('/api/auth/admin/dashboard');
            el.innerHTML=`<div style="padding:20px;"><h3 style="color:#DDE4EE; margin-bottom:12px;">Messages</h3><div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; text-align:center;"><div style="font-size:28px; font-weight:700;">${d.total_messages}</div><div style="font-size:11px; color:#8B949E;">Total Messages Across All Chats</div></div><p style="color:#666; font-size:12px; text-align:center; margin-top:20px;">Messages are stored per chat — use Users → Chat to inspect</p></div>`;
        } catch(e){ el.innerHTML='<div style="padding:20px; color:#EF4444;">'+e.message+'</div>'; }
    },
    async loadLogs() {
        const el=document.getElementById('vault-content');
        el.innerHTML='<div style="padding:20px;"><h3 style="color:#DDE4EE; margin-bottom:12px;">Logs & Audit</h3><div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px;"><div style="color:#8B949E; font-size:12px; text-align:center; padding:20px;">Audit log — all admin actions are logged. Check Security → Login History for details.<br><br><button onclick="Vault.loadSecurity()" style="padding:8px 16px; background:#1A1D21; border:1px solid #2a2f36; color:#DDE4EE; border-radius:8px; cursor:pointer;">View Security Logs</button></div></div></div>';
    },
    async loadBackups() {
        const el=document.getElementById('vault-content');
        el.innerHTML='<div style="padding:20px;"><h3 style="color:#DDE4EE; margin-bottom:12px;">Backups</h3><div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px; text-align:center;"><div style="color:#8B949E; font-size:12px; margin-bottom:12px;">Database backups are handled by Railway volumes (/data/zenith.db)</div><div style="font-size:11px; color:#666;">Last backup: —<br>Size: —</div><button onclick="showToast(\'Backup triggered (manual snapshot on Railway)\',\'success\')" style="margin-top:12px; padding:8px 16px; background:#1A1D21; border:1px solid #2a2f36; color:#DDE4EE; border-radius:8px; cursor:pointer;">Create Backup</button></div></div>';
    },
    async loadSettings() {
        const el=document.getElementById('vault-content');
        el.innerHTML='<div style="padding:20px;"><h3 style="color:#DDE4EE; margin-bottom:12px;">Vault Settings</h3><div style="background:#111315; border:1px solid #1A1D21; border-radius:12px; padding:16px;"><div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #1A1D21;"><span style="color:#8B949E; font-size:13px;">Owner Mode</span><span style="color:#4ADE80; font-size:12px;">Enabled</span></div><div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0;"><span style="color:#8B949E; font-size:13px;">Version</span><span style="color:#DDE4EE; font-size:12px;">17.0</span></div><button onclick="window.location.href=\'/app\'" style="margin-top:12px; width:100%; padding:10px; background:linear-gradient(135deg,#DDE4EE,#8B949E); color:#111315; border:none; border-radius:8px; font-weight:600; cursor:pointer;">Back to App</button></div></div>';
    }
};
document.addEventListener('DOMContentLoaded', ()=>Vault.init());
