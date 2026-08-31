const Vault = {
    async init() {
        try {
            const { user } = await api('/api/auth/me');
            const isOwner = user.role === 'owner';
            document.getElementById('vault-username').textContent = user.username;
            document.getElementById('vault-avatar').textContent = user.username[0].toUpperCase();
            document.getElementById('vault-top-name').textContent = user.username;
            document.getElementById('vault-top-avatar').textContent = user.username[0].toUpperCase();
            document.getElementById('vault-role-label').textContent = isOwner ? 'OWNER VAULT' : 'ADMIN VAULT';
            document.getElementById('vault-welcome').textContent = `Welcome back, ${user.username} ${isOwner?'👑':''}`;
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
                else if(tab==='dashboard') location.reload();
                else if(tab==='bans') this.loadBans();
                else if(tab==='deleted') this.loadDeleted();
                else if(tab==='chats') this.loadChats();
                else if(tab==='messages') this.loadMessages();
                else if(tab==='security') this.loadSecurity();
                else showToast('Coming soon: '+tab, '');
                if(window.innerWidth<=768) sidebar.classList.remove('open');
            });
        });
        // Refresh stats every 30s for live
        setInterval(()=>this.loadStats(), 30000);
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
            const chart = document.getElementById('vault-chart');
            if(chart){
                chart.innerHTML='';
                for(let i=0;i<20;i++){
                    const h=20+Math.random()*80;
                    const div=document.createElement('div');
                    div.style.cssText=`flex:1; height:${h}%; background:linear-gradient(180deg,#8B5CF6,#6366f1); border-radius:4px 4px 0 0; opacity:0.8;`;
                    chart.appendChild(div);
                }
            }
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
                try{ const {chats}=await api(`/api/auth/admin/users/${id}/chats`); if(!chats.length) showToast('No chats',''); else { let msg=`Chats: ${chats.length}\n`; chats.slice(0,2).forEach(c=>msg+=`• ${c.title} (${c.message_count} msgs)\n`); showToast(msg,''); } }catch(e){ showToast(e.message,'error'); }
            }));
            el.querySelectorAll('[data-vault="reset"]').forEach(b=>b.addEventListener('click', async()=>{
                const id=b.dataset.id;
                const pw=prompt('New password (min 6 chars):');
                if(!pw || pw.length<6) return;
                try{ await api(`/api/auth/admin/users/${id}/reset-password`, {method:'POST', body:JSON.stringify({new_password:pw})}); showToast('Password reset','success'); }catch(e){ showToast(e.message,'error'); }
            }));
            el.querySelectorAll('[data-vault="ban"]').forEach(b=>b.addEventListener('click', async()=>{
                const id=b.dataset.id;
                const isBanned=b.textContent==='Unban';
                if(isBanned){ try{ await api(`/api/auth/admin/users/${id}/unban`, {method:'POST'}); showToast('Unbanned','success'); Vault.loadRecent(); Vault.loadStats(); }catch(e){ showToast(e.message,'error'); } }
                else { const reason=prompt('Ban reason:'); if(!reason) return; try{ await api(`/api/auth/admin/users/${id}/ban`, {method:'POST', body:JSON.stringify({reason})}); showToast('Banned','success'); Vault.loadRecent(); Vault.loadStats(); }catch(e){ showToast(e.message,'error'); } }
            }));
            el.querySelectorAll('[data-vault="delete"]').forEach(b=>b.addEventListener('click', async()=>{
                const id=b.dataset.id;
                if(!confirm('Delete this user? This cannot be undone.')) return;
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
    async loadSecurity() {
        const el=document.getElementById('vault-security-alerts');
        if(!el) return;
        el.innerHTML=`
            <div style="display:flex; gap:8px; padding:8px; background:#0a0a0f; border-radius:8px; border-left:3px solid #EF4444;"><div style="color:#EF4444;">●</div><div><div style="font-size:12px; color:#fff;">5 failed login attempts</div><div style="font-size:11px; color:#666;">IP: 202.58.67.23 — Just now</div></div></div>
            <div style="display:flex; gap:8px; padding:8px; background:#0a0a0f; border-radius:8px; border-left:3px solid #FACC15;"><div style="color:#FACC15;">●</div><div><div style="font-size:12px; color:#fff;">Unusual login detected</div><div style="font-size:11px; color:#666;">Location: Unknown — 10 min ago</div></div></div>
        `;
    },
    async loadUsers() {
        const el=document.getElementById('vault-content');
        el.innerHTML='<div style="padding:20px; color:#8B949E;">Loading users...</div>';
        try {
            const { users } = await api('/api/auth/admin/users');
            let html='<div style="padding:20px;"><h3 style="color:#DDE4EE; margin-bottom:12px;">Users ('+users.length+')</h3><div style="display:flex; flex-direction:column; gap:8px;">';
            users.forEach(u=>{
                html+=`<div style="display:flex; gap:10px; padding:10px; background:#111315; border:1px solid #1A1D21; border-radius:8px; align-items:center;"><div style="width:32px; height:32px; border-radius:50%; background:#1A1D21; display:flex; align-items:center; justify-content:center; font-weight:700;">${u.username[0].toUpperCase()}</div><div style="flex:1;"><div style="font-weight:600; font-size:13px;">${u.username}</div><div style="font-size:11px; color:#666;">${u.email}</div></div><div style="font-size:11px; color:${u.is_banned?'#EF4444':'#4ADE80'};">${u.is_banned?'Banned':'Active'}</div></div>`;
            });
            html+='</div></div>';
            el.innerHTML=html;
        } catch(e){ el.innerHTML='<div style="padding:20px; color:#EF4444;">'+e.message+'</div>'; }
    }
};
document.addEventListener('DOMContentLoaded', ()=>Vault.init());
