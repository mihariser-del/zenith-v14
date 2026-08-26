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

    $('new-chat-btn').addEventListener('click', () => Chat.create());
    $('send-btn').addEventListener('click', () => Chat.send());
    $('settings-btn').addEventListener('click', () => Settings.open());
    $('close-settings').addEventListener('click', () => Settings.close());
    $('save-settings').addEventListener('click', () => Settings.saveFromForm());
    $('info-btn').addEventListener('click', () => $('about-modal').style.display = 'flex');
    $('close-about').addEventListener('click', () => $('about-modal').style.display = 'none');
    $('mic-btn').addEventListener('click', () => Voice.toggle());

    $('think-btn').addEventListener('click', () => {
        $('think-btn').classList.toggle('active');
    });

    $('clear-all-btn').addEventListener('click', () => {
        if (confirm('Delete ALL chats?')) Chat.clearAll();
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
});
