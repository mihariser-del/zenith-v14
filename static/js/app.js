document.addEventListener('DOMContentLoaded', async () => {
    let user;
    try {
        ({ user } = await api('/api/auth/me'));
    } catch {
        window.location.href = '/';
        return;
    }

    $('user-name-display').textContent = user.username;
    $('user-avatar').textContent = user.username[0].toUpperCase();
    const isGuest = user.username.startsWith('guest_');
    const isAdmin = user.is_admin;
    if (isAdmin) {
        document.body.classList.add('admin-gold');
        const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = '#FFD700';
    }
    if (isGuest) {
        showToast('Guest mode — some features limited', '');
        ['memory-btn','kb-btn','files-btn','security-btn','code-btn'].forEach(id => { const el=$(id); if(el) { el.style.opacity='0.5'; el.title='Not available for guests'; } });
    }
    function requireLogin() { if (isGuest) { showToast('Access restricted please login to use', 'error'); return false; } return true; }
    if (isAdmin) {
        $('user-name-display').innerHTML = user.username + ' <span style="color:#FFD700; font-size:10px; background:rgba(255,215,0,0.15); padding:1px 6px; border-radius:4px; border:1px solid rgba(255,215,0,0.4);">ADMIN</span>';
        let adminBtn = document.createElement('button');
        adminBtn.className = 'btn info'; adminBtn.id = 'admin-panel-btn';
        adminBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2" style="width:18px;height:18px;"><path d="M12 2l3 5h5l-4 4 1 5-5-3-5 3 1-5-4-4h5z"/></svg> Admin Vault';
        adminBtn.style.cssText = 'color:#FFD700; border:1px solid rgba(255,215,0,0.3); background:linear-gradient(135deg, rgba(255,215,0,0.05), rgba(255,140,0,0.05));';
        adminBtn.addEventListener('mouseenter', () => { adminBtn.style.background = 'rgba(255,215,0,0.1)'; adminBtn.style.borderColor = '#FFD700'; });
        adminBtn.addEventListener('mouseleave', () => { adminBtn.style.background = 'linear-gradient(135deg, rgba(255,215,0,0.05), rgba(255,140,0,0.05))'; adminBtn.style.borderColor = 'rgba(255,215,0,0.3)'; });
        document.querySelector('.bottom-bar').insertBefore(adminBtn, $('settings-btn'));
        adminBtn.addEventListener('click', () => { AdminPanel.open(); closeSidebar(); });
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
                popup.innerHTML = `<div style="font-size:13px; font-weight:600; margin-bottom:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${user.username}</div><button class="btn danger" id="popup-logout" style="padding:6px 12px; font-size:12px; width:100%; justify-content:center;">Logout</button>`;
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
            if (r.changed) showPasswordChangedScreen();
        } catch (e) {}
    }
    // initial check after 2s, then via interval
    setTimeout(checkPasswordChanged, 2000);
    setInterval(async () => {
        try {
            const r = await api('/api/auth/me');
            if (r.user && r.user.is_banned) throw new Error('__BANNED__' + (r.user.ban_reason || 'No reason provided'));
            if (r.user && r.user.is_deleted) throw new Error('__DELETED__');
        } catch (e) {
            if (e.message && (e.message.includes('__DELETED__') || e.message.includes('Account deleted'))) {
                showDeletedScreen();
                return;
            }
            if (e.message && (e.message.includes('__BANNED__') || e.message.includes('is_banned') || e.message.includes('Account banned'))) {
                let reason = 'No reason provided';
                if (e.message.includes('__BANNED__')) reason = e.message.split('__BANNED__')[1];
                else if (e.message.includes('Reason:')) reason = e.message.split('Reason:')[1].trim();
                else if (e.message.includes('is_banned')) reason = 'Unspecified';
                else if (e.message.includes('Account banned')) {
                    const m = e.message.match(/Reason:\s*(.*)/);
                    if (m) reason = m[1].trim();
                }
                showBannedScreen(reason);
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
    (async () => {
        try {
            const data = await api('/api/changelog');
            const seen = localStorage.getItem('zenith_version');
            if (seen !== data.version) {
                $('changelog-title').textContent = `What's New — v${data.version}`;
                $('changelog-version').textContent = `Version ${data.version}`;
                $('changelog-list').innerHTML = data.changes.map(c => `<li>${c}</li>`).join('');
                $('changelog-modal').style.display = 'flex';
                $('close-changelog').onclick = () => { localStorage.setItem('zenith_version', data.version); $('changelog-modal').style.display = 'none'; };
                $('changelog-modal').addEventListener('click', e => { if (e.target === $('changelog-modal')) { localStorage.setItem('zenith_version', data.version); $('changelog-modal').style.display = 'none'; } });
            }
        } catch (e) {}
    })();

    // --- Feedback system ---
    const feedbackBadge = $('feedback-badge');
    let lastFeedbackCount = 0;
    async function refreshFeedbackBadge() {
        if (!isAdmin) return;
        try {
            const { feedbacks } = await api('/api/feedback/admin');
            const unanswered = feedbacks.filter(f => !f.response).length;
            if (unanswered > 0) {
                feedbackBadge.textContent = unanswered;
                feedbackBadge.style.display = 'block';
                if (unanswered > lastFeedbackCount && lastFeedbackCount !== 0) showToast(`New feedback: ${unanswered} unanswered`, '');
            } else feedbackBadge.style.display = 'none';
            lastFeedbackCount = unanswered;
        } catch (e) {}
    }
    async function refreshUserBadge() {
        if (isAdmin || isGuest) return;
        try {
            const { feedbacks } = await api('/api/feedback');
            const replied = feedbacks.filter(f => f.response).length;
            const seen = parseInt(localStorage.getItem('zenith_feedback_seen') || '0', 10);
            const unseen = replied - seen;
            if (unseen > 0) { feedbackBadge.textContent = unseen; feedbackBadge.style.display = 'block'; }
            else feedbackBadge.style.display = 'none';
        } catch (e) {}
    }
    if (isAdmin) { refreshFeedbackBadge(); setInterval(refreshFeedbackBadge, 10000); }
    else if (!isGuest) { refreshUserBadge(); setInterval(refreshUserBadge, 10000); }

    function renderFeedbackThread(listEl, feedbacks, isAdminView) {
        listEl.innerHTML = '';
        if (feedbacks.length === 0) { listEl.innerHTML = '<p style="color:#888; text-align:center; padding:20px; font-size:13px;">No feedback yet.</p>'; return; }
        feedbacks.forEach(f => {
            const div = document.createElement('div');
            div.style.cssText = 'padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:10px;';
            const safe = s => { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; };
            let html = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><span style="font-weight:600; font-size:13px; color:var(--text);">${safe(f.username)}</span><span style="font-size:11px; color:#888;">${f.created_at}</span></div>`;
            html += `<div style="font-size:13px; line-height:1.5; color:var(--text); white-space:pre-wrap; word-wrap:break-word; padding:8px; background:var(--bg); border-radius:8px; border-left:3px solid var(--accent-solid);">${safe(f.content)}</div>`;
            if (f.response) {
                html += `<div style="margin-top:8px; padding:8px; background:rgba(0,255,136,0.08); border:1px solid rgba(0,255,136,0.2); border-radius:8px; border-left:3px solid #00ff88;"><div style="font-size:11px; color:#00ff88; font-weight:600; margin-bottom:4px;">Admin reply ${f.responded_at ? '· '+f.responded_at : ''}</div><div style="font-size:13px; white-space:pre-wrap; word-wrap:break-word;">${safe(f.response)}</div></div>`;
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

function showBannedScreen(reason) {
    if (document.getElementById('banned-screen')) return;
    const div = document.createElement('div');
    div.id = 'banned-screen';
    div.style.cssText = 'position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(0,0,0,0.92); backdrop-filter:blur(8px);';
    div.innerHTML = `
        <div style="width:100%; max-width:480px; text-align:center; background:linear-gradient(145deg,#1a0000,#3d0d0d); border:2px solid #ff4d4d; border-radius:18px; padding:40px 24px; box-shadow:0 20px 60px rgba(255,77,77,0.25); animation:faceIn 0.4s ease;">
            <div style="width:72px; height:72px; margin:0 auto 16px; background:rgba(255,77,77,0.15); border:2px solid #ff4d4d; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#ff4d4d; font-size:40px;">&#9888;</div>
            <h2 style="color:#ff4d4d; font-size:24px; margin-bottom:8px; letter-spacing:1px;">ACCOUNT BANNED</h2>
            <p style="color:rgba(255,255,255,0.85); font-size:14px; line-height:1.6; margin-bottom:20px;">Your account has been suspended by an administrator.</p>
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
function showDeletedScreen() {
    if (document.getElementById('banned-screen')) return;
    const div = document.createElement('div');
    div.id = 'banned-screen';
    div.style.cssText = 'position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(0,0,0,0.92); backdrop-filter:blur(8px);';
    div.innerHTML = `
        <div style="width:100%; max-width:480px; text-align:center; background:linear-gradient(145deg,#1a1a1a,#2d2d2d); border:2px solid #888; border-radius:18px; padding:40px 24px; box-shadow:0 20px 60px rgba(136,136,136,0.25), 0 0 40px rgba(136,136,136,0.15);">
            <div style="width:72px; height:72px; margin:0 auto 16px; background:rgba(136,136,136,0.15); border:2px solid #888; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#888; font-size:40px;">&#128465;</div>
            <h2 style="color:#888; font-size:24px; margin-bottom:8px; letter-spacing:1px;">ACCOUNT DELETED</h2>
            <p style="color:rgba(255,255,255,0.7); font-size:14px; line-height:1.6; margin-bottom:20px;">Your account has been deleted by an administrator. You can no longer access Zenith.</p>
            <button id="deleted-ok" style="width:100%; padding:14px; background:#333; color:#fff; border:1px solid #555; border-radius:10px; font-weight:700; letter-spacing:1px; cursor:pointer; font-size:15px;">OK — LOG OUT</button>
        </div>`;
    div.querySelector('#deleted-ok').addEventListener('click', async () => {
        try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
        window.location.replace('/');
    });
    document.body.appendChild(div);
}
function showPasswordChangedScreen() {
    if (document.getElementById('pwd-changed-screen') || document.getElementById('banned-screen')) return;
    const div = document.createElement('div');
    div.id = 'pwd-changed-screen';
    div.style.cssText = 'position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(0,0,0,0.92); backdrop-filter:blur(8px);';
    div.innerHTML = `
        <div style="width:100%; max-width:480px; text-align:center; background:linear-gradient(145deg,#2d1a00,#4a2c00); border:2px solid #ff8c00; border-radius:18px; padding:40px 24px; box-shadow:0 20px 60px rgba(255,140,0,0.25); animation:faceIn 0.4s ease;">
            <div style="width:72px; height:72px; margin:0 auto 16px; background:rgba(255,140,0,0.15); border:2px solid #ff8c00; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#ff8c00; font-size:40px;">&#9888;</div>
            <h2 style="color:#ff8c00; font-size:22px; margin-bottom:8px; letter-spacing:1px;">PASSWORD CHANGED</h2>
            <p style="color:rgba(255,255,255,0.85); font-size:14px; line-height:1.6; margin-bottom:20px;">Your password was changed by an admin, do you want to view it now?</p>
            <div style="display:flex; gap:10px;">
                <button id="pwd-yes" style="flex:1; padding:14px; background:linear-gradient(135deg,#ff8c00,#ff6a00); color:#fff; border:none; border-radius:10px; font-weight:700; cursor:pointer; font-size:14px;">Yes, view it</button>
                <button id="pwd-no" style="flex:1; padding:14px; background:transparent; color:#ff8c00; border:1px solid #ff8c00; border-radius:10px; font-weight:700; cursor:pointer; font-size:14px;">No</button>
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
