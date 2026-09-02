function showConfirm(title, message, danger = false) {
    return new Promise(resolve => {
        let modal = document.getElementById('confirm-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'confirm-modal';
            modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1600;align-items:center;justify-content:center;';
            modal.innerHTML = `<div style="background:#111315;border:1px solid #1A1D21;border-radius:16px;padding:24px;max-width:400px;width:90%;text-align:center;"><div id="confirm-title" style="font-size:16px;font-weight:700;color:#DDE4EE;margin-bottom:8px;"></div><div id="confirm-message" style="font-size:13px;color:#8B949E;margin-bottom:20px;"></div><div style="display:flex;gap:10px;justify-content:center;"><button id="confirm-cancel" style="padding:8px 20px;background:#1A1D21;border:1px solid #2a2f36;color:#8B949E;border-radius:8px;cursor:pointer;font-size:13px;">Cancel</button><button id="confirm-ok" style="padding:8px 20px;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;">Confirm</button></div></div>`;
            document.body.appendChild(modal);
        }
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');
        titleEl.textContent = title;
        msgEl.textContent = message;
        okBtn.textContent = title.includes('Delete') || title.includes('Clear') || title.includes('LOCK') ? 'Delete' : 'Confirm';
        okBtn.style.background = danger ? '#EF4444' : '#DDE4EE';
        okBtn.style.color = danger ? '#fff' : '#111315';
        modal.style.display = 'flex';
        function cleanup(result) { modal.style.display = 'none'; resolve(result); }
        function onOk() { cleanup(true); }
        function onCancel() { cleanup(false); }
        function onOverlay(e) { if (e.target === modal) cleanup(false); }
        okBtn.onclick = onOk;
        cancelBtn.onclick = onCancel;
        modal.onclick = onOverlay;
    });
}

function showPrompt(title, defaultValue = '', placeholder = '') {
    return new Promise(resolve => {
        let modal = document.getElementById('prompt-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'prompt-modal';
            modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1600;align-items:center;justify-content:center;';
            modal.innerHTML = `<div style="background:#111315;border:1px solid #1A1D21;border-radius:16px;padding:24px;max-width:400px;width:90%;text-align:center;"><div id="prompt-title" style="font-size:16px;font-weight:700;color:#DDE4EE;margin-bottom:12px;"></div><input id="prompt-input" style="width:100%;padding:10px;background:#0a0a0f;border:1px solid #1A1D21;border-radius:8px;color:#fff;font-size:13px;margin-bottom:16px;outline:none;" placeholder=""><div style="display:flex;gap:10px;justify-content:center;"><button id="prompt-cancel" style="padding:8px 20px;background:#1A1D21;border:1px solid #2a2f36;color:#8B949E;border-radius:8px;cursor:pointer;font-size:13px;">Cancel</button><button id="prompt-ok" style="padding:8px 20px;background:#DDE4EE;color:#111315;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;">OK</button></div></div>`;
            document.body.appendChild(modal);
        }
        const titleEl = document.getElementById('prompt-title');
        const input = document.getElementById('prompt-input');
        const okBtn = document.getElementById('prompt-ok');
        const cancelBtn = document.getElementById('prompt-cancel');
        titleEl.textContent = title;
        input.value = defaultValue || '';
        input.placeholder = placeholder || '';
        modal.style.display = 'flex';
        setTimeout(() => { input.focus(); input.select(); }, 50);
        function cleanup(result) { modal.style.display = 'none'; resolve(result); }
        function onOk() { cleanup(input.value); }
        function onCancel() { cleanup(null); }
        function onOverlay(e) { if (e.target === modal) cleanup(null); }
        function onKey(e) { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancel(); }
        okBtn.onclick = onOk;
        cancelBtn.onclick = onCancel;
        modal.onclick = onOverlay;
        input.onkeydown = onKey;
    });
}

function showToast(msg, type = '') {
    const existing = document.getElementById('toast');
    // Main app has a #toast element styled in its own CSS — reuse it if present.
    if (existing) {
        existing.textContent = msg;
        existing.className = 'toast show ' + type;
        clearTimeout(existing._timer);
        existing._timer = setTimeout(() => existing.classList.remove('show'), 3000);
        return;
    }
    // Vault has no #toast element — build a self-contained container.
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const bg = type === 'error' ? '#EF4444' : (type === 'success' ? '#4ADE80' : '#60A5FA');
    toast.style.cssText = `padding:12px 20px;background:#111315;border:1px solid ${bg};border-radius:10px;color:#fff;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.5);animation:fadeIn .2s;max-width:350px;`;
    toast.innerHTML = `<span style="color:${bg};margin-right:6px;">●</span>${msg}`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}
