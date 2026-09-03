document.addEventListener('DOMContentLoaded', async () => {
    let user;
    try {
        ({ user } = await api('/api/auth/me'));
    } catch {
        window.location.href = '/';
        return;
    }
    // Check if user is banned — show full-screen ban popup
    if (user.is_banned) {
        document.body.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.92);backdrop-filter:blur(10px);';
        wrap.innerHTML = `
            <div style="background:linear-gradient(160deg,#1a0a0a,#2a1015 50%,#1a0505);border:2px solid #EF4444;border-radius:20px;padding:48px 56px;max-width:520px;width:92%;text-align:center;box-shadow:0 0 80px rgba(239,68,68,.2),0 30px 60px rgba(0,0,0,.6);">
                <div style="font-size:72px;margin-bottom:16px;">🚫</div>
                <div style="display:inline-block;padding:4px 14px;border-radius:20px;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);font-size:10px;font-weight:700;color:#EF4444;letter-spacing:2px;margin-bottom:16px;">ACCOUNT BANNED</div>
                <h2 style="color:#EF4444;font-size:24px;margin:0 0 12px;font-weight:800;">You Have Been Banned</h2>
                <p style="color:#C0C7D1;font-size:14px;line-height:1.7;margin:0 0 12px;">${user.ban_reason || 'Your account has been banned by the Owner.'}</p>
                <div style="font-size:11px;color:#666;">Banned by: <strong style="color:#EF4444;">${user.banned_by || 'Owner'}</strong></div>
            </div>`;
        document.body.appendChild(wrap);
        return;
    }

    const displayName = user.display_name || user.username;
    const nameTextEl = $('user-name-text') || $('user-name-display');
    const badgeEl = $('user-role-badge');
    if (nameTextEl) nameTextEl.textContent = displayName;
    if (badgeEl) badgeEl.innerHTML = '';
    // Check for pending role change notification
    let _lastHandled = '';
    function _handlePendingNotification(n) {
        if (_lastHandled === n) return false;
        if (n === 'promoted') {
            _lastHandled = ''; _showRoleNotificationPopup(true);
            api('/api/auth/me/clear-notification', { method: 'POST' }).catch(() => {});
            return true;
        } else if (n === 'demoted') {
            _lastHandled = ''; _showRoleNotificationPopup(false);
            api('/api/auth/me/clear-notification', { method: 'POST' }).catch(() => {});
            return true;
        } else if (n === 'locked' || n === 'maintenance') {
            _lastHandled = n;
            _persistentScreen = n;
            _showMaintenanceScreen(n);
            api('/api/auth/me/clear-notification', { method: 'POST' }).catch(() => {});
            return false;
        } else if (n === 'force_logout') {
            _lastHandled = '';
            window.showEmergencyPopup('force-logout');
            api('/api/auth/me/clear-notification', { method: 'POST' }).then(() => {
                setTimeout(() => { window.location.href = '/'; }, 30000);
            }).catch(() => {});
            return true;
        } else if (n === 'chosen') {
            _lastHandled = '';
            _showChosenPopup();
            api('/api/auth/me/clear-notification', { method: 'POST' }).catch(() => {});
            return true;
        } else if (n === 'helper_thanks') {
            _lastHandled = '';
            _showHelperThanksPopup();
            api('/api/auth/me/clear-notification', { method: 'POST' }).catch(() => {});
            return true;
        } else if (n === 'unchosen') {
            _lastHandled = '';
            _showRolesToast('You are no longer a chosen helper.');
            api('/api/auth/me/clear-notification', { method: 'POST' }).catch(() => {});
            return true;
        } else if (n === 'unlocked' || n === 'maintenance_off') {
            _lastHandled = n;
            _persistentScreen = '';
            api('/api/auth/me/clear-notification', { method: 'POST' }).then(() => {
                const sc = document.getElementById('maintenance-screen');
                if (sc) sc.remove();
                setTimeout(() => { window.location.href = '/app'; }, 300);
            }).catch(() => {});
            return true;
        }
        return false;
    }
    let _persistentScreen = '';
    function _showMaintenanceScreen(kind) {
        const isLock = kind === 'locked';
        const icon = isLock ? '🔒' : '🚧';
        const accent = isLock ? '#EF4444' : '#F59E0B';
        const border = isLock ? '#EF4444' : '#F59E0B';
        const label = isLock ? 'ALL ACCOUNTS LOCKED' : 'SYSTEM MAINTENANCE';
        const title = isLock ? 'Your Account Has Been Locked' : 'Maintenance Mode Active';
        const msg = isLock
            ? 'The Owner has locked all accounts. You have been signed out until the Owner unlocks the platform. This screen will clear automatically once access is restored.'
            : 'The platform is temporarily under maintenance. The Owner is working on it right now. This screen will clear automatically once maintenance is complete.';
        document.body.innerHTML = '';
        document.body.appendChild((() => {
            const wrap = document.createElement('div');
            wrap.id = 'maintenance-screen';
            wrap.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.94);backdrop-filter:blur(10px);';
            wrap.innerHTML = `
                <div style="background:linear-gradient(160deg,#1a1510,#2a2015 50%,#1a1005);border:2px solid ${border};border-radius:20px;padding:48px 56px;max-width:520px;width:92%;text-align:center;box-shadow:0 0 80px ${accent}22,0 30px 60px rgba(0,0,0,.6);">
                    <div style="font-size:72px;margin-bottom:16px;">${icon}</div>
                    <div style="display:inline-block;padding:4px 14px;border-radius:20px;background:${accent}18;border:1px solid ${accent}38;font-size:10px;font-weight:700;color:${accent};letter-spacing:2px;margin-bottom:16px;">${label}</div>
                    <h2 style="color:${accent};font-size:24px;margin:0 0 12px;font-weight:800;letter-spacing:1px;">${title}</h2>
                    <p style="color:#C0C7D1;font-size:14px;line-height:1.7;margin:0 0 20px;">${msg}</p>
                    <div style="font-size:11px;color:#666;">Initiated by <strong style="color:#C0C7D1;">WANZU-IBRAHIM</strong> — The Owner</div>
                </div>`;
            return wrap;
        })());
    }
    function checkNotif() {
        api('/api/auth/me').then(r => {
            const n = r.user?.pending_notification;
            if (n) _handlePendingNotification(n);
        }).catch(() => {});
    }
    if (user.pending_notification) {
        _handlePendingNotification(user.pending_notification);
    }
    setInterval(checkNotif, 1000);
    // Persistent maintenance/locked screen driven by LIVE system state (not replayed broadcasts).
    // Checks on load (so a reload mid-emergency re-applies the screen, and once the Owner turns
    // the mode off it lifts automatically and never gets stuck repeopulated).
    async function _syncPersistentScreen(force) {
        try {
            const st = await api('/api/admin/system/public');
            const want = st && st.maintenance_mode === 'on' ? 'maintenance'
                : (st && st.locked === 'on' ? 'locked' : '');
            if (want && want !== _persistentScreen) {
                _persistentScreen = want;
                _showMaintenanceScreen(want);
            } else if (!want && _persistentScreen) {
                _persistentScreen = '';
                const sc = document.getElementById('maintenance-screen');
                if (sc) sc.remove();
                setTimeout(() => { window.location.href = '/app'; }, 300);
            }
        } catch (e) {}
    }
    _syncPersistentScreen(true);
    setInterval(() => _syncPersistentScreen(), 3000);
    // legacy fallback if old structure
    if (!$('user-name-text') && $('user-name-display')) $('user-name-display').textContent = displayName;
    $('user-avatar').textContent = user.username[0].toUpperCase();
    const isGuest = user.username.startsWith('guest_');
    const isAdmin = user.is_admin;
    const isOwner = user.role === 'owner' || user.username === 'WANZU-IBRAHIM';
    AdminPanel.currentRole = isOwner ? 'owner' : (isAdmin ? 'admin' : 'user');
    if (isOwner) {
        document.body.classList.add('admin-owner');
        document.body.classList.remove('admin-gold');
        const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = '#111315';
    } else if (isAdmin) {
        document.body.classList.add('admin-gold');
        const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = '#FFD700';
    }
    if (isGuest) {
        showToast('Guest mode — some features limited', '');
        ['memory-btn','kb-btn','files-btn','security-btn','code-btn'].forEach(id => { const el=$(id); if(el) { el.style.opacity='0.5'; el.title='Not available for guests'; } });
    }
    function requireLogin() { if (isGuest) { showToast('Access restricted please login to use', 'error'); return false; } return true; }
    // In-app notifications only (no website/browser push) — uses showDiscordToast
    async function devicePush(title, body, tag) {
        // Keep in-app only: Discord toast handles it, no browser Notification
        try { showDiscordToast('Zenith', title.replace('Zenith','').replace('—','').trim() || title, body, title.charAt(0)); } catch {}
    }
    // Discord-style in-app toast (mimics native OS notification: icon + avatar + name + message)
    function showDiscordToast(appName, title, body, avatarText) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:9998; display:flex; gap:12px; align-items:flex-start; width:360px; max-width:92vw; background:#1e1f22; border:1px solid #2b2d31; border-radius:12px; padding:12px; box-shadow:0 8px 24px rgba(0,0,0,0.5); animation:slideIn 0.3s ease; color:#f2f3f5;';
        const avBg = '#5865f2';
        wrap.innerHTML = `
            <img src="/static/icons/icon-192.png" style="width:20px; height:20px; border-radius:4px; flex-shrink:0; margin-top:2px;" onerror="this.style.display='none'">
            <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="font-size:12px; font-weight:700; color:#fff;">${appName}</span>
                    <span style="font-size:11px; color:#949ba4;">now</span>
                    <button style="margin-left:auto; background:none; border:none; color:#949ba4; cursor:pointer; font-size:14px; line-height:1;">×</button>
                </div>
                <div style="display:flex; gap:10px; align-items:flex-start;">
                    <div style="width:40px; height:40px; border-radius:50%; background:${avBg}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px; flex-shrink:0;">${(avatarText||title||'?').charAt(0).toUpperCase()}</div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:14px; font-weight:600; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${title}</div>
                        <div style="font-size:13px; color:#dbdee1; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; word-break:break-word;">${body}</div>
                    </div>
                </div>
            </div>`;
        wrap.querySelector('button').addEventListener('click', () => wrap.remove());
        document.body.appendChild(wrap);
        setTimeout(() => { wrap.style.transition='opacity 0.3s, transform 0.3s'; wrap.style.opacity='0'; wrap.style.transform='translateX(20px)'; setTimeout(()=>wrap.remove(),300); }, 4500);
        const style = document.createElement('style');
        style.textContent = '@keyframes slideIn{from{opacity:0; transform:translateX(20px)} to{opacity:1; transform:translateX(0)}}';
        if (!document.getElementById('discord-toast-style')) { style.id='discord-toast-style'; document.head.appendChild(style); }
    }
    // Ask permission once for push (all notifications wait offline until dismissed, then show)
    if (!isGuest && 'Notification' in window && Notification.permission === 'default') {
        setTimeout(() => Notification.requestPermission().catch(()=>{}), 2000);
    }
    if (isAdmin) {
        const badgeHtml = isOwner
            ? '<span style="color:#C0C7D1; font-size:10px; background:rgba(221,228,238,0.12); padding:2px 6px; border-radius:4px; border:1px solid rgba(221,228,238,0.4); white-space:nowrap; flex-shrink:0;">OWNER</span>'
            : '<span style="color:#FFD700; font-size:10px; background:rgba(255,215,0,0.15); padding:2px 6px; border-radius:4px; border:1px solid rgba(255,215,0,0.4); white-space:nowrap; flex-shrink:0;">ADMIN</span>';
        if (badgeEl) badgeEl.innerHTML = badgeHtml;
        else if ($('user-name-display')) $('user-name-display').innerHTML = displayName + ' ' + badgeHtml;
        if (nameTextEl && badgeEl) nameTextEl.textContent = displayName;
        const goldBorder = isOwner ? 'rgba(221,228,238,0.35)' : 'rgba(255,215,0,0.4)';
        const goldColor = isOwner ? '#C0C7D1' : '#FFD700';
        const adminAccentA = isOwner ? 'rgba(221,228,238,0.06)' : 'rgba(255,215,0,0.08)';
        const adminAccentB = isOwner ? 'rgba(139,148,158,0.06)' : 'rgba(255,140,0,0.08)';
        let adminBtn = document.createElement('button');
        adminBtn.className = 'btn info'; adminBtn.id = 'admin-panel-btn';
        adminBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="' + goldColor + '" stroke-width="2" style="width:18px;height:18px;"><path d="M12 2l3 5h5l-4 4 1 5-5-3-5 3 1-5-4-4h5z"/></svg> ' + (isOwner ? 'Owner Vault' : 'Admin Vault');
        adminBtn.style.cssText = 'color:' + goldColor + '; border:1px solid ' + goldBorder + '; background:linear-gradient(135deg, ' + adminAccentA + ', ' + adminAccentB + ');';
        adminBtn.addEventListener('mouseenter', () => { adminBtn.style.background = isOwner ? 'rgba(221,228,238,0.1)' : 'rgba(255,215,0,0.1)'; adminBtn.style.borderColor = goldColor; });
        adminBtn.addEventListener('mouseleave', () => { adminBtn.style.background = 'linear-gradient(135deg, ' + adminAccentA + ', ' + adminAccentB + ')'; adminBtn.style.borderColor = goldBorder; });
        document.querySelector('.bottom-bar').insertBefore(adminBtn, $('settings-btn'));
        adminBtn.addEventListener('click', () => {
            window.location.href = '/vault';
        });
        if (isOwner) {
            // Owner Vault titanium styling (override inline gold)
            const pc = $('admin-panel-content');
            if (pc) { pc.style.background = 'linear-gradient(160deg, #1A1D21, #22262B 70%, #191c20)'; pc.style.border = '1px solid rgba(221,228,238,0.18)'; pc.style.boxShadow = '0 10px 40px rgba(0,0,0,0.5), 0 0 14px rgba(221,228,238,0.12)'; }
            const pt = $('admin-panel-title');
            if (pt) { pt.textContent = '\u2654 OWNER VAULT'; pt.style.color = '#DDE4EE'; pt.style.textShadow = 'none'; }
            // Hide Accent Color for owner — only theme + message spacing remain
            const _origOpen = Settings.open.bind(Settings);
            Settings.open = async function() {
                const r = await _origOpen();
                try {
                    const accentSel = $('accent-select');
                    if (accentSel) {
                        const label = accentSel.previousElementSibling; // label Accent Color
                        if (label && label.tagName === 'LABEL' && label.textContent.includes('Accent')) label.style.display = 'none';
                        accentSel.style.display = 'none';
                        // also hide the next label? No, message spacing follows
                    }
                } catch {}
                return r;
            };
            // Ensure all owner colors are titanium — override any lingering gold inline on feedback admin modal too
            const fam = document.querySelector('#feedback-admin-modal .modal-content');
            if (fam) { fam.style.background = 'linear-gradient(160deg, #1A1D21, #22262B 70%, #191c20)'; fam.style.border = '1px solid rgba(221,228,238,0.18)'; }
        }
        // Staff-only: Live Chat + Attention buttons
        const toolsBox = $('sidebar-tools');
        if (toolsBox) {
            if (!$('staff-chat-btn')) {
                const chatBtn = document.createElement('button');
                chatBtn.className = 'btn info'; chatBtn.id = 'staff-chat-btn';
                chatBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Live Chat';
                const chatCol = isOwner ? '#C0C7D1' : '#C0C7D1';
                chatBtn.style.cssText = `color:${chatCol}; border:1px solid rgba(221,228,238,0.25); background:rgba(221,228,238,0.06);`;
                chatBtn.addEventListener('click', () => { Staff.openChat(); closeSidebar(); });
                toolsBox.insertBefore(chatBtn, $('code-btn'));
            }
            if (!$('attention-btn')) {
                const attBtn = document.createElement('button');
                attBtn.className = 'btn info'; attBtn.id = 'attention-btn';
                attBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> Broadcast';
                attBtn.style.cssText = 'color:#C0C7D1; border:1px solid rgba(221,228,238,0.25); background:rgba(221,228,238,0.06);';
                attBtn.addEventListener('click', () => { Staff.openAttention(); closeSidebar(); });
                toolsBox.appendChild(attBtn);
            }
        }
    }
    // Avatar click shows logout when in collapsed rail (901-1100px)
    const avatarEl = $('user-avatar');
    if (avatarEl) {
        avatarEl.addEventListener('click', () => {
            if (window.innerWidth > 900 && window.innerWidth <= 1100) {
                let popup = $('avatar-popup');
                if (popup) { popup.remove(); return; }
                popup = document.createElement('div');
                popup.id = 'avatar-popup';
                popup.style.cssText = 'position:fixed; bottom:20px; left:70px; background:var(--sidebar); border:1px solid var(--border); border-radius:10px; padding:12px; z-index:200; box-shadow:0 10px 30px rgba(0,0,0,0.3); min-width:140px;';
                const _safe = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
                popup.innerHTML = `<div style="font-size:13px; font-weight:600; margin-bottom:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${_safe(user.username)}</div><button class="btn danger" id="popup-logout" style="padding:6px 12px; font-size:12px; width:100%; justify-content:center;">Logout</button>`;
                popup.querySelector('#popup-logout').addEventListener('click', () => { popup.remove(); $('logout-btn').click(); });
                document.body.appendChild(popup);
                const close = (e) => { if (!popup.contains(e.target) && e.target !== avatarEl) { popup.remove(); document.removeEventListener('click', close); } };
                setTimeout(() => document.addEventListener('click', close), 100);
            }
        });
    }
    // poll banned/deleted + password-changed (orange screen)
    async function checkPasswordChanged() {
        if (isGuest) return;
        if (document.getElementById('pwd-changed-screen') || document.getElementById('pending-pwd-btn')) return;
        try {
            const r = await api('/api/auth/password-changed');
            if (r.changed) { showPasswordChangedScreen(r.changed_by || ''); devicePush('Password Changed', r.changed_by === 'owner' ? 'By The Owner — check your new password' : 'By an administrator — check your new password', 'pwd-changed'); }
        } catch (e) {}
    }
    // initial check after 2s, then via interval
    setTimeout(checkPasswordChanged, 2000);
    setInterval(async () => {
        try {
            const r = await api('/api/auth/me');
            if (r.user && r.user.is_banned) throw new Error('__BANNED__' + (r.user.ban_reason || 'No reason provided') + '__BY__' + (r.user.banned_by || ''));
            if (r.user && r.user.is_deleted) throw new Error('__DELETED__BY__' + (r.user.deleted_by || ''));
        } catch (e) {
            if (e.message && (e.message.includes('__DELETED__') || e.message.includes('Account deleted'))) {
                let deletedBy = '';
                if (e.message.includes('__DELETED__BY__')) deletedBy = e.message.split('__DELETED__BY__')[1].trim().toLowerCase();
                else {
                    const m = e.message.match(/Deleted by:\s*(\w+)/i);
                    if (m) deletedBy = m[1].trim().toLowerCase();
                }
                showDeletedScreen(deletedBy);
                devicePush('Account Deleted', deletedBy === 'owner' ? 'By The Owner — you have been removed' : 'By an administrator — you have been removed', 'deleted');
                return;
            }
            if (e.message && (e.message.includes('__BANNED__') || e.message.includes('is_banned') || e.message.includes('Account banned'))) {
                let reason = 'No reason provided';
                let bannedBy = '';
                if (e.message.includes('__BANNED__')) {
                    const parts = e.message.split('__BY__');
                    reason = parts[0].split('__BANNED__')[1] || 'No reason provided';
                    bannedBy = parts.length > 1 ? parts[1] : '';
                } else if (e.message.includes('Banned by:')) {
                    const rm = e.message.match(/Reason:\s*(.*?)\s*Banned by:\s*(\w+)/i);
                    if (rm) { reason = rm[1].trim(); bannedBy = rm[2].trim().toLowerCase(); }
                    else {
                        const m = e.message.match(/Banned by:\s*(\w+)/i);
                        if (m) bannedBy = m[1].trim().toLowerCase();
                        const mr = e.message.match(/Reason:\s*(.*)/);
                        if (mr) {
                            let r = mr[1].trim();
                            // strip trailing Banned by part if present
                            r = r.replace(/\s*Banned by:\s*\w+$/i, '').trim();
                            reason = r || 'No reason provided';
                        }
                    }
                } else if (e.message.includes('Reason:')) reason = e.message.split('Reason:')[1].trim();
                else if (e.message.includes('is_banned')) reason = 'Unspecified';
                else if (e.message.includes('Account banned')) {
                    const m = e.message.match(/Reason:\s*(.*)/);
                    if (m) reason = m[1].trim();
                }
                showBannedScreen(reason, bannedBy);
                devicePush(bannedBy === 'owner' ? 'Banned by The Owner' : 'Account Banned', reason, 'banned');
                return;
            }
            if (e.message.includes('Not authenticated') || e.message.includes('User not found') || e.message.includes('Session expired')) {
                showToast('Session expired. Logging out...', 'error');
                setTimeout(() => window.location.href = '/', 2000);
            }
        }
        checkPasswordChanged();
    }, 10000);

    Settings.apply();
    Voice.init();
    await Chat.init();
    if (isAdmin) {
        Staff.init();
        const sb = $('staff-chat-btn'); if (sb) sb.addEventListener('click', () => { Staff.openChat(); closeSidebar(); });
        const ab = $('attention-btn'); if (ab) ab.addEventListener('click', () => { Staff.openAttention(); closeSidebar(); });
    } else {
        const sb = $('staff-chat-btn'); if (sb) sb.style.display = 'none';
        const ab = $('attention-btn'); if (ab) ab.style.display = 'none';
    }

    function closeSidebar() {
        $('sidebar').classList.remove('open');
        $('sidebar-overlay').classList.remove('active');
        $('hamburger-btn').classList.remove('hidden');
    }

    function openSidebar() {
        $('sidebar').classList.add('open');
        $('sidebar-overlay').classList.add('active');
        $('hamburger-btn').classList.add('hidden');
    }

    $('hamburger-btn').addEventListener('click', openSidebar);
    $('sidebar-overlay').addEventListener('click', closeSidebar);

    $('tools-toggle').addEventListener('click', () => {
        $('sidebar-tools').classList.toggle('open');
        $('tools-toggle').classList.toggle('open');
    });
    const composerBox = document.querySelector('.composer-box');
    const toolsExpandBtn = $('tools-expand-btn');
    if (toolsExpandBtn && composerBox) {
        toolsExpandBtn.addEventListener('click', () => composerBox.classList.toggle('tools-expanded'));
    }

    $('new-chat-btn').addEventListener('click', async () => {
        await Chat.create();
        closeSidebar();
    });
    $('send-btn').addEventListener('click', () => Chat.send());
    $('stop-btn').addEventListener('click', () => Chat.stop());
    $('upgrade-btn').addEventListener('click', () => { Billing.showUpgrade(); closeSidebar(); });
    $('settings-btn').addEventListener('click', () => { if (!requireLogin()) return; Settings.open(); closeSidebar(); });
    $('close-settings').addEventListener('click', () => Settings.close());
    $('save-settings').addEventListener('click', () => { if (!requireLogin()) return; Settings.saveFromForm(); });
    // Guest guard for Settings appearance/model sections
    document.querySelectorAll('#settings-modal details summary').forEach(s => {
        if (s.textContent.includes('Model') || s.textContent.includes('Appearance')) {
            s.addEventListener('click', (e) => { if (!requireLogin()) { e.preventDefault(); e.stopImmediatePropagation(); const d = s.closest('details'); if (d) d.open = false; } });
        }
    });
    $('info-btn').addEventListener('click', () => { $('about-modal').style.display = 'flex'; closeSidebar(); });
    $('close-about').addEventListener('click', () => $('about-modal').style.display = 'none');
    $('mic-btn').addEventListener('click', () => Voice.toggle());

    $('memory-btn').addEventListener('click', () => { if (!requireLogin()) return; Memory.open(); closeSidebar(); });
    $('close-memory').addEventListener('click', () => Memory.close());
    $('memory-add-btn').addEventListener('click', () => Memory.add());
    $('memory-extract-btn').addEventListener('click', () => Memory.autoExtract());
    $('memory-search').addEventListener('input', (e) => Memory.search(e.target.value));
    $('memory-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') Memory.add(); });

    $('kb-btn').addEventListener('click', () => { if (!requireLogin()) return; Knowledge.open(); closeSidebar(); });
    $('close-kb').addEventListener('click', () => Knowledge.close());
    $('kb-create-btn').addEventListener('click', () => Knowledge.create());
    $('close-kb-items').addEventListener('click', () => Knowledge.closeItems());
    $('kb-item-add-btn').addEventListener('click', () => Knowledge.addItem($('kb-items-modal').dataset.kbId));
    $('kb-item-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') Knowledge.addItem($('kb-items-modal').dataset.kbId); });
    $('kb-file-btn').addEventListener('click', () => $('kb-file-input').click());
    $('kb-file-input').addEventListener('change', () => { if ($('kb-file-input').files.length) Knowledge.addFile($('kb-items-modal').dataset.kbId); });

    $('files-btn').addEventListener('click', () => { if (!requireLogin()) return; Files.open(); closeSidebar(); });
    $('close-files').addEventListener('click', () => Files.close());

    $('security-btn').addEventListener('click', () => { if (!requireLogin()) return; Security.open(); closeSidebar(); });
    $('close-security').addEventListener('click', () => Security.close());

    $('code-btn').addEventListener('click', () => { if (!requireLogin()) return; CodeExec.open(); closeSidebar(); });
    $('close-code').addEventListener('click', () => CodeExec.close());
    $('run-code-btn').addEventListener('click', () => CodeExec.run());
    $('code-modal').addEventListener('click', e => { if (e.target === $('code-modal')) CodeExec.close(); });
    $('code-editor').addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = e.target.selectionStart;
            e.target.value = e.target.value.substring(0, start) + '    ' + e.target.value.substring(e.target.selectionEnd);
            e.target.selectionStart = e.target.selectionEnd = start + 4;
        }
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            CodeExec.run();
        }
    });

    $('think-btn').addEventListener('click', () => {
        $('think-btn').classList.toggle('active');
    });

    $('web-btn').addEventListener('click', () => {
        $('web-btn').classList.toggle('active');
    });

    $('research-btn').addEventListener('click', () => {
        $('research-btn').classList.toggle('active');
        if ($('research-btn').classList.contains('active')) {
            $('web-btn').classList.add('active');
        }
    });

    $('factcheck-btn').addEventListener('click', () => {
        $('factcheck-btn').classList.toggle('active');
        if ($('factcheck-btn').classList.contains('active')) {
            $('web-btn').classList.add('active');
        }
    });

    $('image-gen-btn').addEventListener('click', async () => {
        const prompt = await showPrompt('Describe the image you want to generate');
        if (!prompt || !prompt.trim()) return;
        showToast('Generating image...', '');
        try {
            const { url } = await api('/api/image/generate', { method: 'POST', body: JSON.stringify({ prompt: prompt.trim(), width: 1024, height: 1024 }) });
            Chat.appendMessage('assistant', `**Prompt:** ${prompt}`);
            const container = $('chat-container');
            const lastWrapper = container.querySelector('.msg-wrapper.assistant:last-of-type');
            if (lastWrapper) {
                const img = document.createElement('img');
                img.src = url; img.alt = prompt; img.className = 'msg-image'; img.style.maxWidth = '360px';
                img.onload = () => { container.scrollTop = container.scrollHeight; };
                img.onerror = () => { showToast('Image failed to load, try again', 'error'); img.remove(); };
                lastWrapper.querySelector('.msg-bubble').before(img);
            }
            showToast('Image generated!', 'success');
        } catch (e) { showToast('Image gen failed: ' + e.message, 'error'); }
    });
    $('search-toggle-btn').addEventListener('click', () => {
        const panel = $('search-results');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        if (panel.style.display === 'block') $('universal-search').focus();
    });
    $('close-search').addEventListener('click', () => {
        $('search-results').style.display = 'none';
    });

    let searchTimer;
    $('universal-search').addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        const q = e.target.value.trim();
        if (!q) { $('search-result-list').innerHTML = ''; return; }
        searchTimer = setTimeout(async () => {
            const { results, total } = await api('/api/search', { method: 'POST', body: JSON.stringify({ query: q }) });
            const list = $('search-result-list');
            if (results.length === 0) {
                list.innerHTML = '<p style="color:#888; text-align:center; padding:40px;">No results found.</p>';
                return;
            }
            list.innerHTML = `<p style="color:#888; font-size:13px; margin-bottom:10px;">${total} results</p>`;
            results.forEach(r => {
                const typeColors = { chat: '#0066ff', message: '#00ff88', memory: '#ffaa00', knowledge: '#ff44cc' };
                const div = document.createElement('div');
                div.style.cssText = 'padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; margin-bottom:8px; cursor:pointer;';
                div.innerHTML = `
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                        <span style="font-size:11px; padding:2px 8px; border-radius:4px; background:${typeColors[r.type] || '#666'}22; color:${typeColors[r.type] || '#666'}; font-weight:600;">${r.type}</span>
                        <strong style="font-size:13px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${r.title}</strong>
                    </div>
                    <div style="font-size:12px; color:#888;">${r.snippet}</div>`;
                if (r.type === 'chat') {
                    div.addEventListener('click', async () => {
                        await Chat.switchTo(r.id);
                        $('search-results').style.display = 'none';
                    });
                }
                list.appendChild(div);
            });
        }, 300);
    });

    $('clear-all-btn').addEventListener('click', async () => {
        const ok = await showConfirm('Clear all history?', 'All conversations will be permanently deleted. This cannot be undone.', true);
        if (ok) { await Chat.clearAll(); closeSidebar(); }
    });

    $('attach-btn').addEventListener('click', () => $('file-input').click());
    $('file-input').addEventListener('change', e => {
        if (e.target.files.length) Chat.handleFiles(e.target.files);
        e.target.value = '';
    });

    $('logout-btn').addEventListener('click', async () => {
        const ok = await showConfirm('Log out?', 'Are you sure you want to log out?', false);
        if (!ok) return;
        await api('/api/auth/logout', { method: 'POST' });
        window.location.href = '/';
    });
    // right-click on logout => logout all other devices
    $('logout-btn').addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (isGuest) { showToast('Guests cannot use this', 'error'); return; }
        let popup = document.getElementById('logout-all-popup');
        if (popup) { popup.remove(); return; }
        popup = document.createElement('div');
        popup.id = 'logout-all-popup';
        popup.style.cssText = 'position:fixed; background:var(--sidebar); border:1px solid var(--border); border-radius:8px; padding:6px; z-index:300; box-shadow:0 10px 30px rgba(0,0,0,0.3); min-width:200px;';
        const rect = e.target.getBoundingClientRect();
        popup.style.left = Math.min(rect.left, window.innerWidth - 210) + 'px';
        popup.style.top = (rect.top - 50) + 'px';
        popup.innerHTML = `<button id="logout-all-btn" style="width:100%; padding:8px 12px; background:none; border:none; color:var(--text); cursor:pointer; font-size:13px; text-align:left; border-radius:6px;">Logout of all other devices</button>`;
        popup.querySelector('#logout-all-btn').addEventListener('mouseenter', function(){ this.style.background='var(--hover-bg)'; });
        popup.querySelector('#logout-all-btn').addEventListener('mouseleave', function(){ this.style.background='none'; });
        popup.querySelector('#logout-all-btn').addEventListener('click', async () => {
            popup.remove();
            if (isGuest) { showToast('Guests cannot use this', 'error'); return; }
            try {
                await api('/api/auth/logout-all', { method: 'POST' });
                showToast('Logged out of all other devices', 'success');
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
        document.body.appendChild(popup);
        const close = (ev) => { if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener('click', close); } };
        setTimeout(() => document.addEventListener('click', close), 100);
    });

    const input = $('user-input');
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 150) + 'px';
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            Chat.send();
        }
    });

    $('settings-modal').addEventListener('click', e => {
        if (e.target === $('settings-modal')) Settings.close();
    });
    $('about-modal').addEventListener('click', e => {
        if (e.target === $('about-modal')) $('about-modal').style.display = 'none';
    });
    $('memory-modal').addEventListener('click', e => {
        if (e.target === $('memory-modal')) Memory.close();
    });
    $('kb-modal').addEventListener('click', e => {
        if (e.target === $('kb-modal')) Knowledge.close();
    });
    $('kb-items-modal').addEventListener('click', e => {
        if (e.target === $('kb-items-modal')) Knowledge.closeItems();
    });
    $('files-modal').addEventListener('click', e => {
        if (e.target === $('files-modal')) Files.close();
    });
    $('security-modal').addEventListener('click', e => {
        if (e.target === $('security-modal')) Security.close();
    });
    $('admin-panel-modal').addEventListener('click', e => { if (e.target === $('admin-panel-modal')) AdminPanel.close(); });
    $('close-admin-panel').addEventListener('click', () => AdminPanel.close());
    $('admin-refresh').addEventListener('click', () => AdminPanel.load());
    $('admin-user-search').addEventListener('input', (e) => AdminPanel.filter(e.target.value));

    // --- Changelog popup ---
    // "Seen version" is tracked PER-USER so a new account on a device that already saw the
    // latest version still receives the changelog (it isn't suppressed by the previous account).
    const _chgKey = 'zenith_version_' + user.username;
    (async () => {
        try {
            const data = await api('/api/changelog');
            const seen = localStorage.getItem(_chgKey);
            if (seen !== data.version) {
                $('changelog-title').textContent = `What's New — v${data.version}`;
                $('changelog-version').textContent = `Version ${data.version}`;
                $('changelog-list').innerHTML = data.changes.map(c => `<li>${c}</li>`).join('');
                $('changelog-modal').style.display = 'flex';
                $('close-changelog').onclick = () => { localStorage.setItem(_chgKey, data.version); $('changelog-modal').style.display = 'none'; };
                $('changelog-modal').addEventListener('click', e => { if (e.target === $('changelog-modal')) { localStorage.setItem(_chgKey, data.version); $('changelog-modal').style.display = 'none'; } });
            }
        } catch (e) {}
    })();

    // --- Feedback system ---
    const feedbackBadge = $('feedback-badge');
    let lastFeedbackCount = parseInt(localStorage.getItem('zenith_last_feedback_unanswered') || '0', 10);
    async function refreshFeedbackBadge() {
        if (!isAdmin) return;
        try {
            const { feedbacks } = await api('/api/feedback/admin');
            const unanswered = feedbacks.filter(f => !f.response).length;
            if (unanswered > 0) {
                feedbackBadge.textContent = unanswered;
                feedbackBadge.style.display = 'block';
                if (unanswered > lastFeedbackCount) { showToast(`New feedback: ${unanswered} unanswered`, ''); devicePush('Zenith Feedback', `${unanswered} new feedback awaiting reply`, 'feedback-admin'); showDiscordToast('Zenith', 'New Feedback', `${unanswered} awaiting reply`, 'F'); }
            } else feedbackBadge.style.display = 'none';
            lastFeedbackCount = unanswered;
            localStorage.setItem('zenith_last_feedback_unanswered', String(unanswered));
        } catch (e) {}
    }
    async function refreshUserBadge() {
        if (isAdmin || isGuest) return;
        try {
            const { feedbacks } = await api('/api/feedback');
            const replied = feedbacks.filter(f => f.response).length;
            const seen = parseInt(localStorage.getItem('zenith_feedback_seen') || '0', 10);
            const unseen = replied - seen;
            if (unseen > 0) {
                feedbackBadge.textContent = unseen; feedbackBadge.style.display = 'block';
                if (unseen > 0 && replied > seen) {
                    // show popup for latest reply (wait offline until dismissed)
                    const latest = feedbacks.filter(f=>f.response).slice(-1)[0];
                    if (latest && !document.getElementById('feedback-reply-popup')) {
                        const fbPopup = document.createElement('div');
                        fbPopup.id = 'feedback-reply-popup';
                        fbPopup.style.cssText = 'position:fixed; inset:0; z-index:9996; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(0,0,0,0.78); backdrop-filter:blur(6px);';
                        const safe = s=>{const d=document.createElement('div'); d.textContent=s; return d.innerHTML;};
                        const byOwner = latest.response_by === 'owner';
                        const col = byOwner ? '#C0C7D1' : '#FFD700';
                        const who = byOwner ? 'The Owner' : 'Admin';
                        fbPopup.innerHTML = `<div style="width:100%; max-width:520px; background:linear-gradient(160deg,#1A1D21,#22262B); border:1px solid ${col}44; border-radius:16px; padding:24px; box-shadow:0 20px 60px rgba(0,0,0,0.5);"><div style="display:flex; align-items:center; gap:6px; margin-bottom:10px;"><span style="font-weight:700; color:${col};">Feedback Reply</span><span style="font-size:10px; background:${col}22; color:${col}; padding:2px 6px; border-radius:4px;">${who}</span></div><div style="font-size:13px; padding:10px; background:rgba(0,0,0,0.25); border-radius:8px; border-left:3px solid ${col}; white-space:pre-wrap;">${safe(latest.response)}</div><button id="fb-reply-dismiss" style="margin-top:14px; width:100%; padding:12px; background:${byOwner?'linear-gradient(135deg,#8B949E,#5d666f)':'#FFD700'}; color:${byOwner?'#f4f6f8':'#000'}; border:none; border-radius:10px; font-weight:700; cursor:pointer;">DISMISS</button></div>`;
                        fbPopup.querySelector('#fb-reply-dismiss').addEventListener('click', ()=>{ fbPopup.remove(); localStorage.setItem('zenith_feedback_seen', String(replied)); feedbackBadge.style.display='none'; });
                        document.body.appendChild(fbPopup);
                        devicePush('Zenith Feedback Reply — ' + who, latest.response, 'feedback-reply');
                        showDiscordToast('Zenith', who, latest.response.slice(0,80), who.charAt(0));
                    }
                }
            }
            else feedbackBadge.style.display = 'none';
        } catch (e) {}
    }
    if (isAdmin) { refreshFeedbackBadge(); setInterval(refreshFeedbackBadge, 10000); }
    else if (!isGuest) { refreshUserBadge(); setInterval(refreshUserBadge, 10000); }
    // Broadcast polling — all users get popup when staff broadcasts
    // Dedup state is PER-USER and tracked by the broadcast's created_at_ts timestamp,
    // NOT its integer id (ids reset to 1 after "clear broadcast cache" on SQLite, which
    // would make every post-clear broadcast look "already seen").
    const _annBaseKey = 'zenith_bc_base_' + user.username;
    const _annSeenKey = 'zenith_bc_seen_' + user.username;
    const _tsOf = s => { const t = new Date(s || '').getTime(); return isNaN(t) ? 0 : t; };
    const _annBase = () => _tsOf(localStorage.getItem(_annBaseKey));
    const _lastSeen = () => Math.max(_annBase(), _tsOf(localStorage.getItem(_annSeenKey)));
    let _lastAnnTs = _lastSeen();
    let _pollingAnn = false;
    async function pollAnnouncements() {
        if (_pollingAnn) return;
        _pollingAnn = true;
        try {
            const d = await api('/api/announcements/feed?_=' + Date.now());
            const anns = d.announcements || [];
            if (anns.length) {
                const maxAnn = anns.reduce((m, a) => _tsOf(a.created_at_ts) > _tsOf(m) ? a : m, anns[0]);
                // First-ever poll for this account: baseline to the latest broadcast so old
                // ones don't replay. Only broadcasts created after this point pop.
                if (localStorage.getItem(_annBaseKey) === null) {
                    localStorage.setItem(_annBaseKey, maxAnn.created_at_ts || '');
                    _lastAnnTs = _tsOf(maxAnn.created_at_ts);
                    _pollingAnn = false;
                    return;
                }
                let seen = _lastSeen();
                const pending = anns
                    .filter(a => _tsOf(a.created_at_ts) > seen && _tsOf(a.created_at_ts) > _lastAnnTs)
                    .filter(a => a.username !== user.username && a.user_id !== user.id)
                    .sort((x, y) => _tsOf(x.created_at_ts) - _tsOf(y.created_at_ts));
                if (pending.length) {
                    for (const a of pending) {
                        showBroadcastPopup(a);
                        devicePush('Zenith Broadcast — ' + a.username, a.content, 'broadcast-' + a.id);
                        showDiscordToast('Zenith', a.username + ' — Broadcast', a.content.slice(0, 80), a.username);
                    }
                    // Mark ALL broadcasts (including emergency) as seen so none reappear on
                    // reload/logout. Persistent maintenance/locked screens are re-applied by the
                    // live-system-state sync (_syncPersistentScreen), not by replaying broadcasts.
                    const seenItems = pending;
                    if (seenItems.length) {
                        const maxShown = seenItems.reduce((m, a) => _tsOf(a.created_at_ts) > _tsOf(m) ? a : m, seenItems[0]);
                        localStorage.setItem(_annSeenKey, String(Math.max(seen, _tsOf(maxShown.created_at_ts))));
                    }
                }
                // For UI badge (staff)
                if (isAdmin) {
                    const attBadge = $('attention-badge');
                    if (attBadge) {
                        const unread = anns.filter(a => _tsOf(a.created_at_ts) > _lastSeen()).length;
                        if (unread > 0) { attBadge.textContent = unread; attBadge.style.display = 'block'; }
                        else attBadge.style.display = 'none';
                    }
                }
                const mt = _tsOf(maxAnn.created_at_ts);
                if (mt > _lastAnnTs) _lastAnnTs = mt;
            }
        } catch (e) {}
        _pollingAnn = false;
    }
    function _showRoleNotificationPopup(promoted) {
        const existing = document.getElementById('role-notif-popup');
        if (existing) existing.remove();
        const wrap = document.createElement('div');
        wrap.id = 'role-notif-popup';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.85);backdrop-filter:blur(6px);animation:fadeIn .25s;';
        const icons = promoted ? ['<div style="font-size:64px;margin-bottom:12px;">⬆️</div>'] : ['<div style="font-size:64px;margin-bottom:12px;">⬇️</div>'];
        const title = promoted ? 'Promoted to Admin' : 'Role Changed to User';
        const color = promoted ? '#10B981' : '#F59E0B';
        const desc = promoted
            ? 'You have been promoted to <strong style="color:#10B981">Admin</strong> by the Owner.<br><br>You now have access to:<br>• Ban / Unban users<br>• Reset passwords<br>• View chats and messages<br>• Manage user accounts<br>• Access the admin vault'
            : 'You have been demoted to <strong style="color:#9CA3AF">User</strong> by the Owner.<br><br>You have lost admin access. You can no longer:<br>• Ban / Unban users<br>• Reset passwords<br>• View chats and messages<br>• Access the admin vault';
        wrap.innerHTML = `
            <div style="background:#1a1d23;border:1px solid #333;border-radius:16px;padding:40px 48px;max-width:440px;width:90%;text-align:center;box-shadow:0 0 60px rgba(0,0,0,.6);position:relative;">
                ${icons[0]}
                <h2 style="color:${color};font-size:22px;margin:0 0 12px;font-weight:700;">${title}</h2>
                <p style="color:#C0C7D1;font-size:14px;line-height:1.7;margin:0 0 24px;">${desc}</p>
                <button onclick="var p=this.closest('#role-notif-popup');if(p)p.remove();setTimeout(function(){window.location.reload();},150)" style="background:${color};color:#fff;border:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;">Got it</button>
            </div>`;
        document.body.appendChild(wrap);
    }
    function _showChosenPopup() {
        const existing = document.getElementById('chosen-popup');
        if (existing) existing.remove();
        const wrap = document.createElement('div');
        wrap.id = 'chosen-popup';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.88);backdrop-filter:blur(7px);animation:fadeIn .3s;';
        wrap.innerHTML = `
            <div style="background:linear-gradient(160deg,#0f1a14,#1a2a20 50%,#0d1f16);border:2px solid #10B981;border-radius:20px;padding:44px 52px;max-width:500px;width:92%;text-align:center;box-shadow:0 0 80px rgba(16,185,129,.25),0 30px 60px rgba(0,0,0,.6);position:relative;overflow:hidden;">
                <div style="position:absolute;top:-40px;right:-40px;width:140px;height:140px;border-radius:50%;background:rgba(16,185,129,.08);filter:blur(25px);"></div>
                <div style="font-size:74px;margin-bottom:14px;filter:drop-shadow(0 0 18px rgba(16,185,129,.5));">🛠️</div>
                <div style="display:inline-block;padding:4px 14px;border-radius:20px;background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.35);font-size:10px;font-weight:700;color:#10B981;letter-spacing:2px;margin-bottom:16px;">CHOSEN HELPER</div>
                <h2 style="color:#10B981;font-size:24px;margin:0 0 14px;font-weight:800;letter-spacing:.5px;">You Have Been Selected</h2>
                <p style="color:#DDE4EE;font-size:15px;line-height:1.75;margin:0 0 8px;">You have been chosen by the owner to help him with an existing problem. <strong style="color:#10B981;">Participate in the live chat now!</strong></p>
                <p style="color:#8B949E;font-size:12px;line-height:1.6;margin:0 0 24px;">Your account is exempt from the current shutdown so you can assist. Join the staff live chat to coordinate with the Owner.</p>
                <button onclick="(function(){var p=document.getElementById('chosen-popup');if(p)p.remove();window.openStaffChat();})()" style="background:#10B981;color:#04120b;border:none;padding:14px 40px;border-radius:10px;font-size:16px;font-weight:800;cursor:pointer;box-shadow:0 4px 24px rgba(16,185,129,.4);transition:transform .15s;" onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform='scale(1)'">Open Live Chat ▶</button>
            </div>`;
        document.body.appendChild(wrap);
    }
    function _showHelperThanksPopup() {
        const existing = document.getElementById('helper-thanks-popup');
        if (existing) existing.remove();
        const wrap = document.createElement('div');
        wrap.id = 'helper-thanks-popup';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.88);backdrop-filter:blur(7px);animation:fadeIn .3s;';
        wrap.innerHTML = `
            <div style="background:linear-gradient(160deg,#101b14,#1b2e22 50%,#0c1a12);border:2px solid #4ADE80;border-radius:20px;padding:44px 52px;max-width:500px;width:92%;text-align:center;box-shadow:0 0 80px rgba(74,222,128,.25),0 30px 60px rgba(0,0,0,.6);position:relative;overflow:hidden;">
                <div style="position:absolute;top:-40px;right:-40px;width:140px;height:140px;border-radius:50%;background:rgba(74,222,128,.08);filter:blur(25px);"></div>
                <div style="font-size:74px;margin-bottom:14px;filter:drop-shadow(0 0 18px rgba(74,222,128,.5));">🙏</div>
                <div style="display:inline-block;padding:4px 14px;border-radius:20px;background:rgba(74,222,128,.15);border:1px solid rgba(74,222,128,.35);font-size:10px;font-weight:700;color:#4ADE80;letter-spacing:2px;margin-bottom:16px;">MAINTENANCE COMPLETE</div>
                <h2 style="color:#4ADE80;font-size:24px;margin:0 0 14px;font-weight:800;letter-spacing:.5px;">Thank You For Your Help</h2>
                <p style="color:#DDE4EE;font-size:15px;line-height:1.75;margin:0 0 8px;">The Owner is <strong style="color:#4ADE80;">truly thankful</strong> for your assistance during the maintenance.</p>
                <p style="color:#8B949E;font-size:12px;line-height:1.6;margin:0 0 24px;">Everything is back up and running. You can return to the staff live chat to wrap up with the Owner.</p>
                <div style="display:flex;gap:12px;justify-content:center;">
                    <button onclick="(function(){var p=document.getElementById('helper-thanks-popup');if(p)p.remove();})()" style="background:transparent;color:#C0C7D1;border:1px solid #333;padding:12px 24px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;">Dismiss</button>
                    <button onclick="(function(){var p=document.getElementById('helper-thanks-popup');if(p)p.remove();window.openStaffChat();})()" style="background:#4ADE80;color:#04120b;border:none;padding:12px 32px;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 4px 24px rgba(74,222,128,.4);transition:transform .15s;" onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform='scale(1)'">Return to Chat ▶</button>
                </div>
            </div>`;
        document.body.appendChild(wrap);
    }
    function _showRolesToast(msg) {
        const t = document.createElement('div');
        t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:100000;background:#1a1d23;border:1px solid #333;color:#C0C7D1;padding:12px 24px;border-radius:10px;font-size:14px;box-shadow:0 6px 30px rgba(0,0,0,.5);';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 4000);
    }
    function showBroadcastPopup(a) {
        if (document.getElementById('broadcast-popup-' + a.id)) return;
        // Check for emergency markers
        const emMatch = (a.content || '').match(/^\[EMERGENCY:(\w+)\]\s*/);
        if (emMatch) {
            const t = emMatch[1];
            if (t === 'maintenance' || t === 'lock-all') {
                // Persistent full-screen until the owner turns it off — works mid-session too
                _persistentScreen = t === 'maintenance' ? 'maintenance' : 'locked';
                _showMaintenanceScreen(_persistentScreen);
            } else if (t === 'force-logout') {
                window.showEmergencyPopup('force-logout');
                setTimeout(() => { window.location.href = '/'; }, 30000);
            } else if (t === 'unlock-all') {
                window.showEmergencyPopup('unlock-all');
                _persistentScreen = '';
                const sc = document.getElementById('maintenance-screen');
                if (sc) sc.remove();
            } else {
                window.showEmergencyPopup(t);
            }
            return;
        }
        const isOwner = a.role === 'owner';
        const safe = s => { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; };
        // Same visual language as BANNED BY THE OWNER screen — exclamation, who broadcasted, message box
        const accent = isOwner ? '#C0C7D1' : '#FFD700';
        const border = isOwner ? '#C0C7D1' : '#FFD700';
        const bg = isOwner ? 'linear-gradient(160deg,#1A1D21,#22262B 70%,#191c20)' : 'linear-gradient(145deg,#1a1a0a,#2d2416)';
        const glow = isOwner ? '0 0 60px rgba(221,228,238,0.22), 0 20px 60px rgba(0,0,0,0.5)' : '0 0 40px rgba(255,215,0,0.25), 0 20px 60px rgba(0,0,0,0.5)';
        const title = isOwner ? 'BROADCAST FROM THE OWNER' : 'BROADCAST FROM STAFF';
        const byLine = isOwner
            ? `A broadcast from <strong style="color:#C0C7D1;">The Owner</strong> — WANZU-IBRAHIM`
            : `A broadcast from <strong style="color:#FFD700;">${safe(a.username)}</strong> — staff`;
        const wrap = document.createElement('div');
        wrap.id = 'broadcast-popup-' + a.id;
        wrap.style.cssText = 'position:fixed; inset:0; z-index:9997; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(0,0,0,0.88); backdrop-filter:blur(8px);';
        let when = '';
        try { const dt = new Date(a.created_at.replace(' ', 'T') + 'Z'); when = dt.toLocaleString([], {month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit'}); } catch {}
        wrap.innerHTML = `
            <div style="width:100%; max-width:480px; text-align:center; background:${bg}; border:2px solid ${border}; border-radius:18px; padding:36px 24px; box-shadow:${glow}; animation:faceIn 0.35s ease;">
                <div style="width:64px; height:64px; margin:0 auto 14px; background:${accent}18; border:2px solid ${border}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:${accent}; font-size:32px; line-height:1;">&#9888;</div>
                <h2 style="color:${accent}; font-size:18px; margin-bottom:6px; letter-spacing:2px; font-weight:800;">${title}</h2>
                <p style="color:rgba(255,255,255,0.75); font-size:12px; line-height:1.6; margin-bottom:14px;">${byLine}${when ? ` · <span style="color:#888;">${safe(when)}</span>` : ''}</p>
                <div style="background:rgba(0,0,0,0.35); border:1px solid ${accent}33; border-radius:12px; padding:14px 16px; margin-bottom:18px; font-size:14px; color:#e5e5e5; line-height:1.6; white-space:pre-wrap; word-wrap:break-word; text-align:left; border-left:3px solid ${accent};">${safe(a.content)}</div>
                <button id="bc-close-${a.id}" style="width:100%; padding:13px; background:${isOwner ? 'linear-gradient(135deg,#8B949E,#5d666f)' : 'linear-gradient(135deg,#FFD700,#FF8C00)'}; color:${isOwner ? '#f4f6f8' : '#000'}; border:none; border-radius:10px; font-weight:800; cursor:pointer; letter-spacing:1px; font-size:14px;">DISMISS</button>
            </div>`;
        wrap.querySelector('#bc-close-' + a.id).addEventListener('click', () => {
            wrap.remove();
            const prev = _lastSeen();
            localStorage.setItem(_annSeenKey, String(Math.max(prev, _tsOf(a.created_at_ts))));
            const attBadge = $('attention-badge') || $('broadcast-badge');
            if (attBadge) attBadge.style.display = 'none';
        });
        wrap.addEventListener('click', e => { if (e.target === wrap) { wrap.remove(); const prev = _lastSeen(); localStorage.setItem(_annSeenKey, String(Math.max(prev, _tsOf(a.created_at_ts)))); } });
        document.body.appendChild(wrap);
    }
    // Poll for broadcasts every 1s for all users — fast delivery of staff popups
    pollAnnouncements(); setInterval(pollAnnouncements, 1000);
    // Presence heartbeat — keeps last_seen fresh so staff can see live online users (fires every 5s for stable presence)
    setInterval(() => {
        if (navigator.onLine) fetch('/api/auth/heartbeat', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    }, 5000);
    // Keep refreshAttention for staff fallback (old) but now poll handles it
    async function refreshAttentionBadge() {
        await pollAnnouncements();
    }
    if (isAdmin) { refreshAttentionBadge(); setInterval(refreshAttentionBadge, 10000); }
    // Live Chat polling for staff — wait offline until dismissed, device push to all devices + badge
    let _lastStaffId = parseInt(localStorage.getItem('zenith_last_staff_id') || '0', 10);
    async function pollLiveChat() {
        if (!isAdmin) return;
        try {
            const { messages } = await api('/api/staff/chat');
            if (!messages || !messages.length) { const b=$('live-chat-badge'); if(b) b.style.display='none'; return; }
            const maxId = Math.max(...messages.map(m=>m.id));
            const newMsgs = messages.filter(m=>m.id > _lastStaffId);
            // Update badge count (unseen since last open)
            const lastSeenStaff = parseInt(localStorage.getItem('zenith_last_staff_seen') || String(_lastStaffId), 10);
            const unreadStaff = messages.filter(m=>m.id > lastSeenStaff && m.username !== user.username).length;
            const badge = $('live-chat-badge');
            if (badge) {
                if (unreadStaff > 0) { badge.textContent = unreadStaff > 9 ? '9+' : String(unreadStaff); badge.style.display = 'block'; }
                else badge.style.display = 'none';
            }
            if (newMsgs.length && _lastStaffId !== 0) {
                newMsgs.forEach(m=>{
                    if (m.username === user.username) return; // don't notify self
                    devicePush('Staff Live Chat — ' + m.username, m.content.slice(0,120), 'livechat-'+m.id);
                    showDiscordToast('Zenith', m.username, m.content.slice(0,80), m.username);
                    // WhatsApp-style sound
                    try { const a=new Audio('/static/sounds/notify.mp3'); a.volume=0.6; a.play().catch(()=>{}); } catch {}
                });
            } else if (newMsgs.length && _lastStaffId === 0 && messages.length) {
                // offline queue — show latest if not yet dismissed
                const latest = messages[messages.length - 1];
                if (latest.username !== user.username) { showDiscordToast('Zenith', latest.username, latest.content.slice(0,80), latest.username); devicePush('Staff Live Chat — ' + latest.username, latest.content.slice(0,120), 'livechat-'+latest.id); try { const a=new Audio('/static/sounds/notify.mp3'); a.volume=0.6; a.play().catch(()=>{}); } catch {} }
            }
            if (maxId > _lastStaffId) { _lastStaffId = maxId; localStorage.setItem('zenith_last_staff_id', String(maxId)); }
        } catch {}
    }
    if (isAdmin) { pollLiveChat(); setInterval(pollLiveChat, 5000); }
    // Mark staff chat as seen when opening
    const _origOpenChat = Staff.openChat.bind(Staff);
    Staff.openChat = function() {
        localStorage.setItem('zenith_last_staff_seen', String(_lastStaffId));
        const b=$('live-chat-badge'); if(b) b.style.display='none';
        return _origOpenChat();
    };
    // Global helper so popup buttons can reliably open the staff live chat
    window.openStaffChat = function() {
        try {
            if (window.Staff && typeof Staff.openChat === 'function') { Staff.openChat(); return true; }
        } catch (e) {}
        const m = document.getElementById('staff-chat-modal');
        if (m) m.style.display = 'flex';
        return !!m;
    };

    function fmtTimeLocal(s) { if (!s || s === 'Never' || s === 'Online') return s; try { // server stores UTC as "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS"
                let iso = s.trim();
                if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(iso)) iso = iso.replace(' ', 'T') + 'Z';
                else if (/^\d{4}-\d{2}-\d{2}T/.test(iso) && !iso.endsWith('Z') && !iso.includes('+')) iso = iso + 'Z';
                const d = new Date(iso);
                if (isNaN(d)) return s;
                return d.toLocaleString([], { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' });
            } catch { return s; } }
    function renderFeedbackThread(listEl, feedbacks, isAdminView) {
        listEl.innerHTML = '';
        if (feedbacks.length === 0) { listEl.innerHTML = '<p style="color:#888; text-align:center; padding:20px; font-size:13px;">No feedback yet.</p>'; return; }
        feedbacks.forEach(f => {
            const div = document.createElement('div');
            div.style.cssText = 'padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:10px;';
            const safe = s => { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; };
            let html = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><span style="font-weight:600; font-size:13px; color:var(--text);">${safe(f.username)}</span><span style="display:flex; align-items:center; gap:8px; font-size:11px; color:#888;">${safe(fmtTimeLocal(f.created_at))}${isAdminView ? `<button data-fbdel="${f.id}" title="Delete feedback" style="background:none; border:none; cursor:pointer; color:var(--error); font-size:14px; padding:0;">&#128465;</button>` : ''}</span></div>`;
            html += `<div style="font-size:13px; line-height:1.5; color:var(--text); white-space:pre-wrap; word-wrap:break-word; padding:8px; background:var(--bg); border-radius:8px; border-left:3px solid var(--accent-solid);">${safe(f.content)}</div>`;
            if (f.response) {
                const replyBy = f.response_by === 'owner'
                    ? '<span style="color:#C0C7D1;">The Owner</span> replied'
                    : 'Admin reply';
                html += `<div style="margin-top:8px; padding:8px; background:rgba(0,255,136,0.08); border:1px solid rgba(0,255,136,0.2); border-radius:8px; border-left:3px solid #00ff88;"><div style="font-size:11px; color:#00ff88; font-weight:600; margin-bottom:4px;">${replyBy} ${f.responded_at ? '· '+fmtTimeLocal(f.responded_at) : ''}</div><div style="font-size:13px; white-space:pre-wrap; word-wrap:break-word;">${safe(f.response)}</div></div>`;
            } else if (isAdminView) {
                html += `<div style="margin-top:8px; display:flex; gap:6px;"><input type="text" placeholder="Write a reply..." data-reply="${f.id}" style="flex:1; padding:8px; background:var(--bg); color:var(--text); border:1px solid var(--border); border-radius:6px; font-size:13px; outline:none;"><button data-send="${f.id}" style="padding:8px 12px; background:#FFD700; color:#000; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">Reply</button></div>`;
            } else {
                html += `<div style="margin-top:6px; font-size:11px; color:#888; font-style:italic;">Awaiting admin reply...</div>`;
            }
            div.innerHTML = html;
            listEl.appendChild(div);
        });
        if (isAdminView) {
            listEl.querySelectorAll('[data-send]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.getAttribute('data-send');
                    const inp = listEl.querySelector(`[data-reply=\"${id}\"]`);
                    const txt = inp.value.trim();
                    if (!txt) { showToast('Reply cannot be empty','error'); return; }
                    try { await api(`/api/feedback/${id}/respond`, {method:'POST', body:JSON.stringify({response:txt})}); showToast('Reply sent','success'); openAdminFeedback(); refreshFeedbackBadge(); } catch(e){ showToast(e.message,'error'); }
                });
            });
            listEl.querySelectorAll('[data-fbdel]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.getAttribute('data-fbdel');
                    const ok = await showConfirm('Delete feedback?', 'This feedback and its reply will be removed permanently.', true);
                    if (!ok) return;
                    try { await api(`/api/feedback/${id}`, { method: 'DELETE' }); showToast('Feedback deleted','success'); openAdminFeedback(); refreshFeedbackBadge(); } catch(e){ showToast(e.message,'error'); }
                });
            });
        }
    }
    async function openUserFeedback() {
        if (isGuest) { showToast('Feedback limited please login to use','error'); return; }
        $('feedback-modal').style.display='flex';
        const list = $('feedback-list');
        list.innerHTML = '<p style="color:#888; text-align:center; padding:20px;">Loading...</p>';
        try {
            const {feedbacks}=await api('/api/feedback');
            renderFeedbackThread(list, feedbacks, false);
            const replied = feedbacks.filter(f => f.response).length;
            localStorage.setItem('zenith_feedback_seen', String(replied));
            feedbackBadge.style.display = 'none';
        } catch(e){ list.innerHTML=`<p style="color:var(--error); text-align:center;">${e.message}</p>`; }
    }
    async function openAdminFeedback() {
        $('feedback-admin-modal').style.display='flex';
        const list = $('feedback-admin-list');
        list.innerHTML = '<p style="color:#FFD700; text-align:center; padding:20px;">Loading...</p>';
        try { const {feedbacks}=await api('/api/feedback/admin'); renderFeedbackThread(list, feedbacks, true); } catch(e){ list.innerHTML=`<p style="color:var(--error); text-align:center;">${e.message}</p>`; }
    }
    $('feedback-btn').addEventListener('click', () => {
        if (isGuest) { showToast('Feedback limited please login to use','error'); return; }
        if (isAdmin) { openAdminFeedback(); } else { openUserFeedback(); }
        closeSidebar();
    });
    $('close-feedback').addEventListener('click', () => $('feedback-modal').style.display='none');
    $('feedback-modal').addEventListener('click', e => { if (e.target === $('feedback-modal')) $('feedback-modal').style.display='none'; });
    $('close-feedback-admin').addEventListener('click', () => $('feedback-admin-modal').style.display='none');
    $('feedback-admin-modal').addEventListener('click', e => { if (e.target === $('feedback-admin-modal')) $('feedback-admin-modal').style.display='none'; });
    $('feedback-submit').addEventListener('click', async () => {
        if (isGuest) { showToast('Feedback limited please login to use','error'); return; }
        const inp = $('feedback-input');
        const txt = inp.value.trim();
        if (!txt) { showToast('Please write feedback','error'); return; }
        try { await api('/api/feedback', {method:'POST', body:JSON.stringify({content:txt})}); inp.value=''; showToast('Feedback sent','success'); openUserFeedback(); refreshUserBadge(); } catch(e){ showToast(e.message,'error'); }
    });
});

function showBannedScreen(reason, bannedBy) {
    if (document.getElementById('banned-screen')) return;
    const div = document.createElement('div');
    div.id = 'banned-screen';
    div.style.cssText = 'position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(0,0,0,0.92); backdrop-filter:blur(8px);';
    const isOwnerBan = bannedBy === 'owner';
    const banTitle = isOwnerBan ? 'BANNED BY THE OWNER' : 'ACCOUNT BANNED';
    const banIntensity = isOwnerBan ? '0 0 60px rgba(255,77,77,0.45)' : '0 20px 60px rgba(255,77,77,0.25)';
    const banLine = isOwnerBan
        ? 'By the decree of <strong style="color:#C0C7D1;">The Owner</strong> — WANZU-IBRAHIM. Your access to Zenith has been revoked, effective immediately.'
        : 'Your account has been suspended by an administrator.';
    div.innerHTML = `
        <div style="width:100%; max-width:480px; text-align:center; background:linear-gradient(145deg,#1a0000,#3d0d0d); border:2px solid #ff4d4d; border-radius:18px; padding:40px 24px; box-shadow:${banIntensity}; animation:faceIn 0.4s ease;">
            <div style="width:72px; height:72px; margin:0 auto 16px; background:rgba(255,77,77,0.15); border:2px solid #ff4d4d; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#ff4d4d; font-size:40px;">&#9888;</div>
            <h2 style="color:#ff4d4d; font-size:24px; margin-bottom:8px; letter-spacing:1px;">${banTitle}</h2>
            <p style="color:rgba(255,255,255,0.85); font-size:14px; line-height:1.6; margin-bottom:16px;">${banLine}</p>
            <div style="background:rgba(255,77,77,0.1); border:1px solid rgba(255,77,77,0.3); border-radius:10px; padding:14px; margin-bottom:20px; font-size:15px; color:#fff; line-height:1.5; word-wrap:break-word; white-space:pre-wrap;">"${reason || 'No reason provided'}"</div>
            <button id="banned-ok" style="width:100%; padding:14px; background:linear-gradient(135deg,#ff4d4d,#cc0000); color:#fff; border:none; border-radius:10px; font-weight:700; letter-spacing:1px; cursor:pointer; font-size:15px;">I UNDERSTAND &mdash; LOG OUT</button>
        </div>`;
    div.querySelector('#banned-ok').addEventListener('click', async () => {
        try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
        window.location.replace('/');
    });
    document.body.appendChild(div);
    const style = document.createElement('style');
    style.textContent = '@keyframes faceIn { from{opacity:0; transform:scale(0.95);} to{opacity:1; transform:scale(1);} }';
    document.head.appendChild(style);
}
function showOfflineScreen() {
    if (document.getElementById('offline-screen')) return;
    const div = document.createElement('div');
    div.id = 'offline-screen';
    div.style.cssText = 'position:fixed; inset:0; z-index:9998; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(0,0,0,0.85); backdrop-filter:blur(6px);';
    div.innerHTML = `
        <div style="width:100%; max-width:420px; text-align:center; background:linear-gradient(145deg,#0a1a2a,#1a2a3a); border:2px solid #00aaff; border-radius:18px; padding:32px 24px; box-shadow:0 20px 60px rgba(0,170,255,0.3);">
            <div style="width:64px; height:64px; margin:0 auto 14px; background:rgba(0,170,255,0.15); border:2px solid #00aaff; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#00aaff; font-size:32px;">&#128246;</div>
            <h2 style="color:#00aaff; font-size:20px; margin-bottom:8px;">YOU ARE OFFLINE</h2>
            <p style="color:rgba(255,255,255,0.75); font-size:13px; line-height:1.6; margin-bottom:16px;">Check your connection. Chat will resume when back online.</p>
            <div style="display:flex; gap:10px; justify-content:center;">
                <button id="offline-retry" style="padding:10px 18px; background:#00aaff; color:#fff; border:none; border-radius:8px; font-weight:700; cursor:pointer;">Retry</button>
                <button id="offline-mode-btn" style="padding:10px 18px; background:rgba(0,170,255,0.15); color:#00aaff; border:1px solid #00aaff; border-radius:8px; font-weight:700; cursor:pointer;">Offline Mode</button>
            </div>
            <p style="color:rgba(255,255,255,0.45); font-size:11px; margin-top:12px;">Offline Mode lets me answer basic questions from my local directory.</p>
            <p style="color:#FFD700; font-size:11px; margin-top:8px; line-height:1.5; border:1px solid rgba(255,215,0,0.4); background:rgba(255,215,0,0.08); border-radius:8px; padding:8px 10px;">⚠ Offline Mode is still under development. Only my pre-loaded answer directory works here, so many styles of questioning (open-ended, complex, or follow-up questions) won't be recognized. For full answers, reconnect and use the live chat.</p>
        </div>`;
    div.querySelector('#offline-retry').addEventListener('click', () => { if (navigator.onLine) div.remove(); else showToast('Still offline', 'error'); });
    div.querySelector('#offline-mode-btn').addEventListener('click', () => {
        div.remove();
        openOfflineChat();
    });
    document.body.appendChild(div);
}
function openOfflineChat() {
    if (document.getElementById('offline-chat')) return;
    const wrap = document.createElement('div');
    wrap.id = 'offline-chat';
    wrap.style.cssText = 'position:fixed; inset:0; z-index:9998; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(0,0,0,0.9); backdrop-filter:blur(8px);';
    wrap.innerHTML = `
        <div style="width:100%; max-width:520px; height:80vh; display:flex; flex-direction:column; background:linear-gradient(160deg,#0a1a2a,#152536); border:2px solid #00aaff; border-radius:18px; overflow:hidden; box-shadow:0 20px 60px rgba(0,170,255,0.35);">
            <div style="padding:14px 18px; border-bottom:1px solid rgba(0,170,255,0.3); display:flex; align-items:center; justify-content:space-between; background:rgba(0,0,0,0.2);">
                <div>
                    <div style="color:#00aaff; font-weight:800; font-size:15px; letter-spacing:1px;">OFFLINE MODE</div>
                    <div style="color:rgba(255,255,255,0.5); font-size:11px;">Basic answers · no internet · under development</div>
                </div>
                <button id="offline-chat-close" style="background:none;border:none;color:#00aaff;font-size:22px;cursor:pointer;line-height:1;">&times;</button>
            </div>
            <div id="offline-chat-body" style="flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px;"></div>
            <div style="padding:12px; border-top:1px solid rgba(0,170,255,0.3); display:flex; gap:8px;">
                <input id="offline-chat-input" placeholder="Ask me something basic..." style="flex:1; padding:10px 12px; background:rgba(0,0,0,0.3); border:1px solid rgba(0,170,255,0.4); border-radius:8px; color:#fff; outline:none; font-size:13px;">
                <button id="offline-chat-send" style="padding:10px 16px; background:#00aaff; color:#fff; border:none; border-radius:8px; font-weight:700; cursor:pointer;">Send</button>
            </div>
        </div>`;
    const body = wrap.querySelector('#offline-chat-body');
    const input = wrap.querySelector('#offline-chat-input');
    function addMsg(role, text) {
        const m = document.createElement('div');
        m.style.cssText = 'padding:10px 14px; border-radius:12px; font-size:13px; line-height:1.5; max-width:85%; white-space:pre-wrap; word-wrap:break-word;' +
            (role === 'user'
                ? 'align-self:flex-end; background:rgba(0,170,255,0.25); color:#fff; border:1px solid rgba(0,170,255,0.5);'
                : 'align-self:flex-start; background:rgba(0,0,0,0.35); color:#e5e5e5; border:1px solid rgba(0,170,255,0.3);');
        m.textContent = text;
        body.appendChild(m);
        body.scrollTop = body.scrollHeight;
    }
    addMsg('assistant', "You're offline. I can only answer a small set of pre-loaded, basic questions right now (offline mode is still under development) — open-ended or complex questions like history, current events or follow-ups may not be recognized.\n\nTry simple things like 'what can you do', 'who are you', or 'capital of Nigeria'.\n\nFor full answers, reconnect and use the live chat.");
    function send() {
        const q = input.value.trim();
        if (!q) return;
        addMsg('user', q);
        input.value = '';
        // Try math engine first
        let answer = null;
        if (window.ZenithDirectory && window.ZenithDirectory.solveMath) {
            answer = window.ZenithDirectory.solveMath(q);
        }
        // Fall back to keyword directory
        if (!answer && window.ZenithDirectory) {
            answer = window.ZenithDirectory.match(q);
        }
        setTimeout(() => {
            if (answer) {
                addMsg('assistant', answer);
                return;
            }
            // No offline hit. Give an honest "not recognized" reply instead of a generic
            // greeting, so complex questions (history, current events, follow-ups) aren't
            // misleadingly answered. Offline mode only knows a small set of basics.
            addMsg('assistant', "I don't have that in my offline directory yet — offline mode is still under development and only knows a small set of basic answers.\n\nReconnect and use the live chat for anything else. For example I can answer: 'what can you do', 'who are you', 'capital of Nigeria', 'what is pi', or simple math like '12 * 8'.");
        }, 300);
    }
    wrap.querySelector('#offline-chat-send').addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    // Closing offline mode: if online, return to the live chat; otherwise show the offline screen.
    wrap.querySelector('#offline-chat-close').addEventListener('click', () => {
        if (navigator.onLine) {
            goBackOnline();
        } else {
            wrap.remove();
            showOfflineScreen();
        }
    });
    document.body.appendChild(wrap);
    input.focus();
}
// Leave offline mode entirely and reveal the live chat underneath.
function goBackOnline() {
    const oc = document.getElementById('offline-chat');
    if (oc) oc.remove();
    const os = document.getElementById('offline-screen');
    if (os) os.remove();
    const p = document.getElementById('back-online-popup');
    if (p) p.remove();
}
function promptBackOnline() {
    if (document.getElementById('back-online-popup')) return;
    const p = document.createElement('div');
    p.id = 'back-online-popup';
    p.style.cssText = 'position:fixed; inset:0; z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(0,0,0,0.88); backdrop-filter:blur(8px); animation:fadeIn .3s;';
    p.innerHTML = `
        <div style="width:100%; max-width:440px; text-align:center; background:linear-gradient(145deg,#0a2a1a,#0f3a24); border:2px solid #4ADE80; border-radius:18px; padding:38px 26px; box-shadow:0 20px 60px rgba(74,222,128,0.25);">
            <div style="width:64px; height:64px; margin:0 auto 14px; background:rgba(74,222,128,0.15); border:2px solid #4ADE80; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#4ADE80; font-size:30px;">&#9989;</div>
            <h2 style="color:#4ADE80; font-size:20px; margin-bottom:8px; letter-spacing:1px;">YOU'RE BACK ONLINE</h2>
            <p style="color:rgba(255,255,255,0.75); font-size:13px; line-height:1.6; margin-bottom:20px;">Your connection is restored. The full AI chat (with web search and a complete answer directory) is available again.</p>
            <div style="display:flex; gap:10px; justify-content:center;">
                <button id="back-online-go" style="padding:12px 22px; background:#4ADE80; color:#063; border:none; border-radius:10px; font-weight:800; cursor:pointer; font-size:14px;">&#128640; Back to Live Chat</button>
                <button id="back-online-stay" style="padding:12px 20px; background:transparent; color:#4ADE80; border:1px solid #4ADE80; border-radius:10px; font-weight:700; cursor:pointer; font-size:14px;">Continue Offline</button>
            </div>
        </div>`;
    p.querySelector('#back-online-go').addEventListener('click', () => {
        p.remove();
        goBackOnline();
    });
    // "Continue offline" — just dismiss the popup; the offline chat stays open.
    p.querySelector('#back-online-stay').addEventListener('click', () => p.remove());
    document.body.appendChild(p);
}
window.addEventListener('offline', showOfflineScreen);
window.addEventListener('online', () => {
    const el = document.getElementById('offline-screen');
    if (el) el.remove();
    if (!document.getElementById('offline-chat')) showToast('Back online', 'success');
    else promptBackOnline();
});
function showDeletedScreen(deletedBy) {
    if (document.getElementById('banned-screen')) return;
    const div = document.createElement('div');
    div.id = 'banned-screen';
    div.style.cssText = 'position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(0,0,0,0.92); backdrop-filter:blur(8px);';
    const isOwner = deletedBy === 'owner';
    const title = isOwner ? 'DELETED BY THE OWNER' : 'ACCOUNT DELETED';
    const bg = isOwner ? 'linear-gradient(160deg,#1A1D21,#22262B 70%,#191c20)' : 'linear-gradient(145deg,#1a1a1a,#2d2d2d)';
    const border = isOwner ? '#C0C7D1' : '#888';
    const accent = isOwner ? '#C0C7D1' : '#888';
    const glow = isOwner ? '0 20px 60px rgba(221,228,238,0.18)' : '0 20px 60px rgba(136,136,136,0.25)';
    const line = isOwner
        ? 'By the decree of <strong style="color:#C0C7D1;">The Owner</strong> — WANZU-IBRAHIM. Your account has been permanently deleted.'
        : 'Your account has been deleted by an administrator. You can no longer access Zenith.';
    div.innerHTML = `
        <div style="width:100%; max-width:480px; text-align:center; background:${bg}; border:2px solid ${border}; border-radius:18px; padding:40px 24px; box-shadow:${glow};">
            <div style="width:72px; height:72px; margin:0 auto 16px; background:${accent}22; border:2px solid ${accent}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:${accent}; font-size:40px;">&#128465;</div>
            <h2 style="color:${accent}; font-size:24px; margin-bottom:8px; letter-spacing:1px;">${title}</h2>
            <p style="color:rgba(255,255,255,0.7); font-size:14px; line-height:1.6; margin-bottom:20px;">${line}</p>
            <button id="deleted-ok" style="width:100%; padding:14px; background:${isOwner ? 'linear-gradient(135deg,#8B949E,#5d666f)' : '#333'}; color:#fff; border:1px solid ${accent}; border-radius:10px; font-weight:700; letter-spacing:1px; cursor:pointer; font-size:15px;">OK — LOG OUT</button>
        </div>`;
    div.querySelector('#deleted-ok').addEventListener('click', async () => {
        try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
        window.location.replace('/');
    });
    document.body.appendChild(div);
}
function showPasswordChangedScreen(changedBy) {
    if (document.getElementById('pwd-changed-screen') || document.getElementById('banned-screen')) return;
    const div = document.createElement('div');
    div.id = 'pwd-changed-screen';
    div.style.cssText = 'position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(0,0,0,0.92); backdrop-filter:blur(8px);';
    const isOwner = changedBy === 'owner';
    const border = isOwner ? '#C0C7D1' : '#ff8c00';
    const bg = isOwner ? 'linear-gradient(160deg,#1A1D21,#22262B 70%,#191c20)' : 'linear-gradient(145deg,#2d1a00,#4a2c00)';
    const accent = isOwner ? '#C0C7D1' : '#ff8c00';
    const glow = isOwner ? '0 20px 60px rgba(221,228,238,0.18)' : '0 20px 60px rgba(255,140,0,0.25)';
    const line = isOwner
        ? 'Your password was changed by <strong style="color:#C0C7D1;">The Owner</strong> — WANZU-IBRAHIM. Do you want to view it now?'
        : 'Your password was changed by an administrator. Do you want to view it now?';
    div.innerHTML = `
        <div style="width:100%; max-width:480px; text-align:center; background:${bg}; border:2px solid ${border}; border-radius:18px; padding:40px 24px; box-shadow:${glow}; animation:faceIn 0.4s ease;">
            <div style="width:72px; height:72px; margin:0 auto 16px; background:${accent}22; border:2px solid ${border}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:${accent}; font-size:40px;">&#9888;</div>
            <h2 style="color:${accent}; font-size:22px; margin-bottom:8px; letter-spacing:1px;">PASSWORD CHANGED</h2>
            <p style="color:rgba(255,255,255,0.85); font-size:14px; line-height:1.6; margin-bottom:20px;">${line}</p>
            <div style="display:flex; gap:10px;">
                <button id="pwd-yes" style="flex:1; padding:14px; background:${isOwner ? 'linear-gradient(135deg,#8B949E,#5d666f)' : 'linear-gradient(135deg,#ff8c00,#ff6a00)'}; color:#fff; border:none; border-radius:10px; font-weight:700; cursor:pointer; font-size:14px;">Yes, view it</button>
                <button id="pwd-no" style="flex:1; padding:14px; background:transparent; color:${accent}; border:1px solid ${accent}; border-radius:10px; font-weight:700; cursor:pointer; font-size:14px;">No</button>
            </div>
        </div>`;
    document.body.appendChild(div);
    div.querySelector('#pwd-yes').addEventListener('click', async () => {
        div.remove();
        try {
            const { password } = await api('/api/auth/password-changed/view');
            showPasswordModal(password);
        } catch (e) { showToast(e.message, 'error'); }
    });
    div.querySelector('#pwd-no').addEventListener('click', () => {
        div.remove();
        createPendingPwdButton();
    });
}
function showPasswordModal(password) {
    const overlay = document.createElement('div');
    overlay.id = 'pwd-modal';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(0,0,0,0.75); backdrop-filter:blur(4px);';
    const safe = (s) => { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; };
    overlay.innerHTML = `
        <div style="width:100%; max-width:420px; background:var(--sidebar); border:1px solid var(--border); border-radius:16px; padding:24px; text-align:center;">
            <h3 style="color:#ff8c00; margin-bottom:12px;">Your new password</h3>
            <div style="background:var(--input-bg); border:1px solid var(--border); border-radius:10px; padding:14px; margin-bottom:16px; font-family:monospace; font-size:16px; word-break:break-all; display:flex; align-items:center; gap:8px; justify-content:center;">
                <span id="pwd-value">${safe(password)}</span>
                <button id="pwd-copy" title="Copy" style="padding:4px 8px; font-size:11px; border:1px solid var(--border); border-radius:6px; background:transparent; color:var(--text); cursor:pointer;">Copy</button>
            </div>
            <p style="font-size:12px; color:#888; margin-bottom:16px;">Keep it safe. This will not be shown again.</p>
            <button id="pwd-close" style="width:100%; padding:12px; background:linear-gradient(135deg,#ff8c00,#ff6a00); color:#fff; border:none; border-radius:10px; font-weight:600; cursor:pointer;">Got it</button>
        </div>`;
    document.body.appendChild(overlay);
    const dismiss = async () => {
        try { await api('/api/auth/password-changed/dismiss', { method: 'POST' }); } catch (e) {}
        overlay.remove();
        const btn = document.getElementById('pending-pwd-btn');
        if (btn) btn.remove();
    };
    overlay.querySelector('#pwd-copy').addEventListener('click', () => { navigator.clipboard.writeText(password).then(()=>showToast('Copied','success')).catch(()=>showToast('Copy failed','error')); });
    overlay.querySelector('#pwd-close').addEventListener('click', dismiss);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
}
function createPendingPwdButton() {
    if (document.getElementById('pending-pwd-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'pending-pwd-btn';
    btn.className = 'btn info';
    btn.title = 'View new password';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#ff8c00" stroke-width="2" style="width:18px;height:18px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> New Password';
    btn.style.cssText = 'color:#ff8c00; border:1px solid rgba(255,140,0,0.3); background:rgba(255,140,0,0.08);';
    btn.addEventListener('click', async () => {
        try {
            const { password } = await api('/api/auth/password-changed/view');
            showPasswordModal(password);
        } catch (e) { showToast(e.message,'error'); const b=document.getElementById('pending-pwd-btn'); if(b) b.remove(); }
    });
    const settingsBtn = document.getElementById('settings-btn');
    const container = document.querySelector('.bottom-bar');
    if (settingsBtn && container) container.insertBefore(btn, settingsBtn);
    else if (container) container.appendChild(btn);
}
