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
    if (isAdmin) document.body.classList.add('admin-gold');
    if (isGuest) {
        showToast('Guest mode — some features limited', '');
        ['memory-btn','kb-btn','files-btn','security-btn'].forEach(id => { const el=$(id); if(el) el.style.opacity='0.5'; el.title='Not available for guests'; });
    }
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
    setInterval(async () => {
        try {
            const r = await api('/api/auth/me');
            if (r.user && r.user.is_banned) throw new Error('__BANNED__' + (r.user.ban_reason || 'No reason provided'));
        } catch (e) {
            if (e.message && (e.message.includes('__BANNED__') || e.message.includes('is_banned'))) {
                const reason = e.message.includes('__BANNED__') ? e.message.split('__BANNED__')[1] : (e.message.includes('is_banned') ? 'Unspecified' : '');
                showBannedScreen(reason);
                return;
            }
            if (e.message.includes('Not authenticated') || e.message.includes('User not found')) {
                showToast('Account no longer exists. Logging out...', 'error');
                setTimeout(() => window.location.href = '/', 2000);
            }
        }
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
    $('settings-btn').addEventListener('click', () => { Settings.open(); closeSidebar(); });
    $('close-settings').addEventListener('click', () => Settings.close());
    $('save-settings').addEventListener('click', () => Settings.saveFromForm());
    $('info-btn').addEventListener('click', () => { $('about-modal').style.display = 'flex'; closeSidebar(); });
    $('close-about').addEventListener('click', () => $('about-modal').style.display = 'none');
    $('mic-btn').addEventListener('click', () => Voice.toggle());

    $('memory-btn').addEventListener('click', () => { Memory.open(); closeSidebar(); });
    $('close-memory').addEventListener('click', () => Memory.close());
    $('memory-add-btn').addEventListener('click', () => Memory.add());
    $('memory-extract-btn').addEventListener('click', () => Memory.autoExtract());
    $('memory-search').addEventListener('input', (e) => Memory.search(e.target.value));
    $('memory-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') Memory.add(); });

    $('kb-btn').addEventListener('click', () => { Knowledge.open(); closeSidebar(); });
    $('close-kb').addEventListener('click', () => Knowledge.close());
    $('kb-create-btn').addEventListener('click', () => Knowledge.create());
    $('close-kb-items').addEventListener('click', () => Knowledge.closeItems());
    $('kb-item-add-btn').addEventListener('click', () => Knowledge.addItem($('kb-items-modal').dataset.kbId));
    $('kb-item-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') Knowledge.addItem($('kb-items-modal').dataset.kbId); });
    $('kb-file-btn').addEventListener('click', () => $('kb-file-input').click());
    $('kb-file-input').addEventListener('change', () => { if ($('kb-file-input').files.length) Knowledge.addFile($('kb-items-modal').dataset.kbId); });

    $('files-btn').addEventListener('click', () => { Files.open(); closeSidebar(); });
    $('close-files').addEventListener('click', () => Files.close());

    $('security-btn').addEventListener('click', () => { Security.open(); closeSidebar(); });
    $('close-security').addEventListener('click', () => Security.close());

    $('code-btn').addEventListener('click', () => { CodeExec.open(); closeSidebar(); });
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
