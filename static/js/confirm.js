/* "Are you sure?" and "Type a value" dialogs. Same calls as before; they now use the shared popup (zpop.js). */
function showConfirm(title, message, danger = false) {
    const t = String(title || '');
    const okText = /delete|clear|remove|wipe/i.test(t) ? 'Delete' : (/log ?out|end guest/i.test(t) ? 'Log out' : (/lock/i.test(t) ? 'Lock' : 'Confirm'));
    // Settings → General → "Ask before deleting". Account deletion and other
    // one-way actions still ask, because those have their own typed confirmation.
    try {
        if (okText === 'Delete' && typeof Settings !== 'undefined' && Settings.getLocal().askBeforeDelete === false) return Promise.resolve(true);
    } catch (e) {}
    return window.ZPop.confirm(t, message, { danger: !!danger, okText, icon: okText === 'Delete' ? 'trash' : (okText === 'Log out' ? 'logout' : undefined) });
}

function showPrompt(title, defaultValue = '', placeholder = '') {
    return window.ZPop.prompt(title, defaultValue, placeholder);
}
