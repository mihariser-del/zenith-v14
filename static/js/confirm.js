function showConfirm(title, message, danger = false) {
    return new Promise(resolve => {
        const modal = $('confirm-modal');
        $('confirm-title').textContent = title;
        $('confirm-message').textContent = message;
        const okBtn = $('confirm-ok');
        okBtn.textContent = title.includes('Delete') || title.includes('Clear') ? 'Delete' : 'Confirm';
        okBtn.style.background = danger ? 'var(--error)' : 'var(--accent-solid)';
        modal.style.display = 'flex';

        function cleanup(result) {
            modal.style.display = 'none';
            okBtn.removeEventListener('click', onOk);
            $('confirm-cancel').removeEventListener('click', onCancel);
            modal.removeEventListener('click', onOverlay);
            resolve(result);
        }
        function onOk() { cleanup(true); }
        function onCancel() { cleanup(false); }
        function onOverlay(e) { if (e.target === modal) cleanup(false); }

        okBtn.addEventListener('click', onOk);
        $('confirm-cancel').addEventListener('click', onCancel);
        modal.addEventListener('click', onOverlay);
    });
}

function showPrompt(title, defaultValue = '') {
    return new Promise(resolve => {
        const modal = $('prompt-modal');
        $('prompt-title').textContent = title;
        const input = $('prompt-input');
        input.value = defaultValue;
        modal.style.display = 'flex';
        setTimeout(() => { input.focus(); input.select(); }, 50);

        function cleanup(result) {
            modal.style.display = 'none';
            $('prompt-ok').removeEventListener('click', onOk);
            $('prompt-cancel').removeEventListener('click', onCancel);
            modal.removeEventListener('click', onOverlay);
            input.removeEventListener('keydown', onKey);
            resolve(result);
        }
        function onOk() { cleanup(input.value); }
        function onCancel() { cleanup(null); }
        function onOverlay(e) { if (e.target === modal) cleanup(null); }
        function onKey(e) {
            if (e.key === 'Enter') onOk();
            if (e.key === 'Escape') onCancel();
        }

        $('prompt-ok').addEventListener('click', onOk);
        $('prompt-cancel').addEventListener('click', onCancel);
        modal.addEventListener('click', onOverlay);
        input.addEventListener('keydown', onKey);
    });
}
