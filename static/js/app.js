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

    Settings.apply();
    Voice.init();
    await Chat.init();

    function closeSidebar() {
        $('sidebar').classList.remove('open');
        $('sidebar-overlay').classList.remove('active');
    }

    function openSidebar() {
        $('sidebar').classList.add('open');
        $('sidebar-overlay').classList.add('active');
    }

    $('hamburger-btn').addEventListener('click', openSidebar);
    $('sidebar-overlay').addEventListener('click', closeSidebar);

    $('new-chat-btn').addEventListener('click', async () => {
        await Chat.create();
        closeSidebar();
    });
    $('send-btn').addEventListener('click', () => Chat.send());
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

    $('think-btn').addEventListener('click', () => {
        $('think-btn').classList.toggle('active');
    });

    $('web-btn').addEventListener('click', () => {
        $('web-btn').classList.toggle('active');
    });

    $('clear-all-btn').addEventListener('click', () => {
        if (confirm('Delete ALL chats?')) { Chat.clearAll(); closeSidebar(); }
    });

    $('attach-btn').addEventListener('click', () => $('file-input').click());
    $('file-input').addEventListener('change', e => {
        if (e.target.files.length) Chat.handleFiles(e.target.files);
        e.target.value = '';
    });

    $('logout-btn').addEventListener('click', async () => {
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
});
