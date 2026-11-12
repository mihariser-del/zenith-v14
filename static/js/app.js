// Auto image generation: detects when a message clearly asks for an image
// ("generate a pic of...", "i want a pic of...", etc.) and extracts the prompt.
function detectImageRequest(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    if (t.length > 300) return null;
    const genRe = /^(?:please\s+)?(?:can\s+you\s+)?(?:generate|create|make|draw|get|give)\s+(?:me\s+)?(?:an?\s+|a\s+)?(?:image|picture|pic|photo|logo|artwork|drawing|wallpaper|icon|portrait|avatar)s?\s+(?:of|for|showing)\s+(.{4,240})$/i;
    const m = t.match(genRe);
    if (m) return m[1].replace(/[.!?]+$/, '').trim();
    const wantRe = /^(?:i\s+(?:want|wanna|need|would\s+love)|please\s+show\s+me)\s+(?:to\s+see\s+)?(?:a|an|the)\s*(?:image|picture|pic|photo|logo|artwork|drawing|wallpaper|icon|portrait|avatar)s?\s+(?:of|for|showing)\s+(.{4,240})$/i;
    const m2 = t.match(wantRe);
    if (m2) return m2[1].replace(/[.!?]+$/, '').trim();
    return null;
}

// Video requests: "make a 6 second video of...", "create a clip of...",
// "animate this" (with an attached photo). Returns {prompt, duration, aspect} or null.
function detectVideoRequest(text, hasImage) {
    const t = String(text || '').trim().replace(/[.!?]+$/, '');
    if (!t || t.length > 700) return null;
    const durOf = (s) => { const m = String(s || '').match(/(\d{1,2})\s*(?:-|\s)?\s*(?:s|sec|secs|second|seconds)\b/i); if (!m) return 6; const n = parseInt(m[1], 10); return n <= 4 ? 4 : (n <= 6 ? 6 : 8); };
    const aspectOf = (s) => (/\b(?:vertical|portrait|tall|9:16|tiktok|reels?|shorts)\b/i.test(s) ? '9:16' : '16:9');
    const re = /^(?:please\s+)?(?:can\s+(?:you|u)\s+)?(?:generate|create|make|produce|render|give|show)\s+(?:me\s+)?(?:an?\s+)?((?:\d{1,2}\s*(?:-|\s)?\s*(?:s|sec|secs|second|seconds)\s+)?(?:short\s+|quick\s+|vertical\s+|portrait\s+|wide\s+|cinematic\s+|tiktok\s+|instagram\s+)*)(?:video|clip|animation|movie)s?\s+(?:of|about|showing|where|with|for)\s+(.{3,600})$/i;
    const m = t.match(re);
    if (m) return { prompt: m[2].trim(), duration: durOf(m[1]), aspect: aspectOf(m[1] + ' ' + m[2]) };
    const want = /^(?:i\s+(?:want|wanna|need|would\s+love))\s+(?:to\s+see\s+)?(?:an?\s+)?((?:\d{1,2}\s*(?:-|\s)?\s*(?:s|sec|secs|second|seconds)\s+)?(?:short\s+)?)(?:video|clip|animation)s?\s+(?:of|about|showing)\s+(.{3,600})$/i;
    const m2 = t.match(want);
    if (m2) return { prompt: m2[2].trim(), duration: durOf(m2[1]), aspect: aspectOf(m2[2]) };
    if (hasImage) {
        const anim = /^(?:please\s+)?(?:animate|bring)\s+(?:this|it|the\s+(?:photo|picture|image|pic))(?:\s+to\s+life)?(?:\s*[,:-]?\s*(.{3,600}))?$/i;
        const m3 = t.match(anim);
        if (m3) return { prompt: (m3[1] || 'Bring this photo to life with gentle, natural motion').trim(), duration: 6, aspect: '16:9' };
    }
    return null;
}

// Follow-up image edits: "add a bell around the cow", "remove the hat",
// "make it blue", "change the background to night". Only treated as an edit when
// the chat already has a generated image (Chat._hasGeneratedImage guards this).
function detectImageEditRequest(text) {
    let t = String(text || '').trim().replace(/[.!?]+$/, '');
    if (!t || t.length > 300) return null;
    // Drop leading filler so "ok now make it blue" still reads as an edit.
    const filler = /^(?:ok(?:ay)?|now|also|and|then|so|please|pls|hey|hi|just|can\s+you|could\s+you|would\s+you|will\s+you|can\s+u|cud\s+you)[\s,]+/i;
    for (let i = 0; i < 4 && filler.test(t); i++) t = t.replace(filler, '').trim();
    const m = t.match(/^(add|put|place|insert|include|attach|give|draw|remove|delete|erase|take\s+out|change|modify|edit|adjust|tweak|update|turn|convert|replace|swap|paint|recolou?r|colou?r|shade|lighten|darken|brighten|zoom|rotate|flip|crop|move|resize|enlarge|shrink|blur|sharpen|apply|set|switch|make|render|redo|regenerate)\s+(.+)$/i);
    if (!m) return null;
    const verb = m[1].toLowerCase();
    const rest = m[2].trim();
    if (rest.length < 2) return null;
    // Never hijack obviously non-visual requests (math, accounts, chats, ...).
    if (/^\d/.test(rest)) return null;
    if (/^[0-9\s+\-*/=().]+$/.test(rest)) return null;
    if (/\b(?:account|chat|message|conversation|history|memory|reminder|password|email|subscription|plan|file|code|function)\b/i.test(rest)) return null;
    // Strong edit verbs are self-evidently about the picture ("remove the hat",
    // "add a bell", "change the background to night").
    const strong = /^(add|put|place|insert|include|attach|remove|delete|erase|take\s+out|change|modify|edit|adjust|tweak|update|replace|swap|paint|recolou?r|colou?r|shade|lighten|darken|brighten|zoom|rotate|flip|crop|move|resize|enlarge|shrink|blur|sharpen|apply|set|switch)$/;
    if (strong.test(verb)) {
        if (rest.split(/\s+/).length <= 10) return rest;
    }
    // Weaker verbs (make/turn/give/draw/convert...) need the change to point at
    // the image: a pronoun, a picture noun, or a comparative ("bigger", "darker").
    if (/\b(?:it|this|that|them|him|her|his|its)\b/i.test(rest)) return rest;
    if (/\b(?:image|picture|pic|photo|logo|artwork|drawing|wallpaper|icon|portrait|avatar|background|bg|sky|scene|colour|color|colours|colors|lighting|outfit|clothes|clothing|hair|face|eyes|pose|expression|style|size|shape|mood|skin|body|shadows?|water|ground|floor|hands|arms|legs)\b/i.test(rest)) return rest;
    if (/\b(?:bigger|smaller|larger|wider|taller|shorter|thinner|fatter|darker|lighter|brighter|older|younger|happier|sadder|cuter|scarier|realistic|detailed|blurrier|sharper|prettier|nicer|cleaner|smoother|clearer|warmer|cooler|vivid)\b/i.test(rest)) return rest;
    return null;
}

document.addEventListener('DOMContentLoaded', async () => {
    let user;
    try {
        ({ user } = await api('/api/auth/me'));
    } catch {
        const pathMatch = window.location.pathname.match(/\/app\/c\/([0-9a-f]+)/i);
        const qLink = new URLSearchParams(window.location.search).get('chat');
        if (pathMatch || qLink) {
            const link = pathMatch ? pathMatch[1] : String(qLink).toLowerCase();
            window.location.replace(`/denied.html?reason=login&link=${encodeURIComponent(link || '')}`);
            return;
        }
        window.location.href = '/';
        return;
    }
    // Check if user is banned — show full-screen ban popup
    if (user.is_banned) {
        const byOwner = !user.banned_by || /owner|wanzu/i.test(String(user.banned_by));
        window.ZPop.show({
            id: 'banned-screen', replaceBody: true, dismissable: false, z: 999999, tone: 'danger', icon: 'ban', badge: 'Account banned',
            title: 'This account has been banned',
            text: 'You can\'t use Zelpophai AI with this account any more.',
            quote: user.ban_reason || 'No reason was given.', quoteLabel: 'Reason',
            actions: [{ label: 'Log out', icon: 'logout', keep: true, onClick: async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {} window.location.replace('/'); } }],
            metaHtml: 'Banned by <b>' + window.ZPop.esc(byOwner ? 'The Owner' : user.banned_by) + '</b> · Think this is a mistake? Write to <b>mihariser@gmail.com</b>',
        });
        return;
    }

    const displayName = user.display_name || user.username;
    window.user = user; // expose for voice meter / billing guest fallback
    // The AI picks its model automatically; only the Owner sees the model pickers.
    if (user.role !== 'owner') {
        const cms = document.getElementById('chat-model-select'); if (cms) cms.remove();
        const ms = document.getElementById('model-select');
        if (ms) { const lab = ms.previousElementSibling; if (lab && lab.tagName === 'LABEL') lab.remove(); ms.style.display = 'none'; }
    }
    const nameTextEl = $('user-name-text') || $('user-name-display');
    const badgeEl = $('user-role-badge');
    const mobileNameEl = $('mobile-uname');
    if (nameTextEl) nameTextEl.textContent = displayName;
    if (mobileNameEl) mobileNameEl.textContent = displayName;
    if (badgeEl) badgeEl.innerHTML = '';
    // Real-time display-name hook used by Settings so the top bar updates immediately
    window.__applyDisplayName = (name) => {
        const n = name || user.username;
        try { user.display_name = n; } catch (e) {}
        const el = $('user-name-text') || $('user-name-display');
        if (el) el.textContent = n;
        const mel = $('mobile-uname');
        if (mel) mel.textContent = n;
    };
    // Check for pending role change notification
    let _lastHandled = '';
    function _handlePendingNotification(n) {
        if (_lastHandled === n) return false;
        if (typeof n === 'string' && n.startsWith('⏰ ')) {
            _lastHandled = n;
            const text = n.slice(2).trim();
            if (typeof window.__handlePendingReminder === 'function') window.__handlePendingReminder(text);
            api('/api/auth/me/clear-notification', { method: 'POST' }).catch(() => {});
            return true;
        }
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
        } else if (n === 'tag_friend' || n === 'tag_trusted') {
            _lastHandled = '';
            _showTagPopup(n === 'tag_friend' ? 'friend' : 'trusted');
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
            api('/api/auth/me/clear-notification', { method: 'POST' }).then(async () => {
                const sc = document.getElementById('maintenance-screen');
                if (sc) sc.remove();
                if (await _maybeShowMaintNote()) return;
                setTimeout(() => { window.location.href = '/app'; }, 300);
            }).catch(() => {});
            return true;
        }
        return false;
    }
    // "You're now a Friend / Trusted Admin" welcome card.
    function _showTagPopup(kind) {
        const friend = kind === 'friend';
        window.ZPop.show({
            id: 'tag-popup', tone: friend ? 'good' : 'staff', icon: friend ? 'users' : 'shield', badge: friend ? 'Friend' : 'Trusted admin',
            title: friend ? 'You\'re a Friend of Wanzu' : 'You\'re now a Trusted Admin',
            text: friend ? 'Wanzu added you as a friend. Here\'s what you get:' : 'Wanzu trusts you with more. Here\'s what\'s new:',
            list: friend
                ? ['Ultimate-level limits', 'More videos every day', 'Early access to new features']
                : ['Global Controls: maintenance, sign-ups, messaging and AI', 'Password resets and unbans without asking', 'The full stats', 'Emergency tools stay with the Owner'],
            actions: [{ label: 'Awesome' }],
        });
    }
    let _persistentScreen = '';
    function _showMaintenanceScreen(kind) {
        window.ZPop.systemScreen(kind === 'locked' ? 'locked' : 'maintenance');
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
            window.__sysState = st;
            _applySysUI();
            const want = st && st.maintenance_mode === 'on' ? 'maintenance'
                : (st && st.locked === 'on' ? 'locked' : '');
            if (want && want !== _persistentScreen) {
                _persistentScreen = want;
                _showMaintenanceScreen(want);
            } else if (!want && _persistentScreen) {
                _persistentScreen = '';
                const sc = document.getElementById('maintenance-screen');
                if (sc) sc.remove();
                _maybeShowMaintNote().then(shown => { if (!shown) setTimeout(() => { window.location.href = '/app'; }, 300); });
            }
        } catch (e) {}
    }
    // Messaging OFF from the vault → total block: composer + send button inert, Chat.send() no-ops.
    function _applySysUI() {
        if (!window.__sysState || !$('user-input')) return;
        const owner = user.role === 'owner' || user.username === 'WANZU-IBRAHIM';
        const blocked = window.__sysState.messaging === 'off' && !owner;
        window.__msgBlocked = blocked;
        const input = $('user-input');
        const sendBtn = $('send-btn');
        const micBtn = $('mic-btn') || $('mic-icon');
        if (blocked) {
            if (!input.dataset.sysBlocked) { input.dataset.sysBlocked = '1'; input.disabled = true; input.placeholder = 'Messaging is currently disabled by the Owner'; }
            if (sendBtn && !sendBtn.dataset.sysBlocked) { sendBtn.dataset.sysBlocked = '1'; sendBtn.style.opacity = '0.35'; sendBtn.style.pointerEvents = 'none'; }
            if (micBtn) { micBtn.style.opacity = '0.35'; micBtn.style.pointerEvents = 'none'; }
        } else {
            if (input.dataset.sysBlocked) { delete input.dataset.sysBlocked; input.disabled = false; input.placeholder = 'Ask anything...'; }
            if (sendBtn && sendBtn.dataset.sysBlocked) { delete sendBtn.dataset.sysBlocked; sendBtn.style.opacity = ''; sendBtn.style.pointerEvents = ''; }
            if (micBtn) { micBtn.style.opacity = ''; micBtn.style.pointerEvents = ''; }
        }
    }
    _syncPersistentScreen(true);
    setInterval(() => _syncPersistentScreen(), 3000);
    // "What was fixed during the break" fullscreen popup shown ONCE when maintenance/lock lifts.
    // The Owner types the fix note in the vault when turning maintenance OFF; it is stored
    // server-side (maint_note) and surfaced to users here — never replaying across reloads.
    let _maintNoteShown = '';
    async function _maybeShowMaintNote() {
        if (document.getElementById('maint-note-popup')) return true;
        let note = '';
        try { const st = await api('/api/admin/system/public'); note = (st.maint_note || '').trim(); } catch (e) { note = ''; }
        if (!note) return false;
        if (_maintNoteShown === note) return false;
        if (localStorage.getItem('zenith_maint_note_seen') === note) return false;
        _maintNoteShown = note;
        localStorage.setItem('zenith_maint_note_seen', note);
        window.ZPop.show({
            id: 'maint-note-popup', dismissable: false, z: 999999, tone: 'good', icon: 'check', badge: 'Back online',
            title: 'We\'re back — here\'s what changed',
            text: 'Thanks for waiting. A note from the Owner:',
            quote: note,
            actions: [{ label: 'Continue', keep: true, onClick: () => { window.location.href = '/app'; } }],
            metaHtml: 'From <b>WANZU-IBRAHIM</b> · The Owner',
        });
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Zelpophai AI — Back Online', { body: note.slice(0, 120), icon: '/static/icons/icon-192.png', tag: 'maint-note', requireInteraction: true }); } catch (e) {}
        return true;
    }
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
    // In-app + real device/browser push (OS notification center + mobile panel), uses showDiscordToast
    async function devicePush(title, body, tag) {
        try { showDiscordToast('Zelpophai AI', title.replace('Zelpophai AI','').replace('—','').trim() || title, body, title.charAt(0)); } catch {}
        // Real OS notification: works whenever the Zelpophai AI tab is open even if the user is on
        // another website/window — shows in the Windows action center / mobile notification panel.
        try {
            if ('Notification' in window && Notification.permission === 'granted') {
                const n = new Notification('Zelpophai AI — ' + (title || 'Zelpophai AI'), { body: String(body || '').slice(0, 200), icon: '/static/icons/icon-192.png', tag: tag || 'zenith', requireInteraction: true });
                n.onclick = () => { try { window.focus(); n.close(); } catch (e) {} };
            }
        } catch (e) {}
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
    // Ask permission once for push (all users incl. guests) — notification panel / action center
    if ('Notification' in window && Notification.permission === 'default') {
        setTimeout(() => Notification.requestPermission().catch(()=>{}), 2000);
    }
    // Owner-given tags: FRIEND badge (anyone), TRUSTED replaces ADMIN for trusted admins.
    const _tags = String(user.tags || '').toLowerCase().split(',').map(t => t.trim());
    window.__userTags = _tags;
    if (badgeEl && _tags.includes('friend') && !isOwner) {
        badgeEl.insertAdjacentHTML('beforeend', '<span class="zp-badge zp-badge-friend" title="Friend of Wanzu">FRIEND</span>');
    }
    if (isAdmin) {
        const badgeHtml = isOwner
            ? '<span style="color:#C0C7D1; font-size:10px; background:rgba(221,228,238,0.12); padding:2px 6px; border-radius:4px; border:1px solid rgba(221,228,238,0.4); white-space:nowrap; flex-shrink:0;">OWNER</span>'
            : '<span style="color:#FFD700; font-size:10px; background:rgba(255,215,0,0.15); padding:2px 6px; border-radius:4px; border:1px solid rgba(255,215,0,0.4); white-space:nowrap; flex-shrink:0;">ADMIN</span>';
        const _trusted = !isOwner && _tags.includes('trusted');
        if (badgeEl) badgeEl.innerHTML = (_trusted ? '<span class="zp-badge zp-badge-trusted" title="Trusted Admin">TRUSTED</span>' : badgeHtml) + (_tags.includes('friend') ? '<span class="zp-badge zp-badge-friend" title="Friend of Wanzu">FRIEND</span>' : '');
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
            // Always ask for the PIN when entering from the button: drop any
            // earlier unlock in this tab and go straight to the PIN page.
            try { sessionStorage.removeItem('zenith_vault_token'); } catch (e) {}
            window.location.href = '/app/vault-auth';
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
            if (!document.getElementById('acct-menu') && window.innerWidth > 900 && window.innerWidth <= 1100) {
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
    // Keep the model dropdowns in sync with the backend catalog (settings + per-chat).
    try {
        const sd = await api('/api/settings');
        if (sd && sd.models && window.populateModelSelects) window.populateModelSelects(sd.models);
    } catch (e) {}
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

    // ── Invite friends (reward progress, friends list, leaderboard) — see invite.js ──
    $('invite-btn').addEventListener('click', () => {
        closeSidebar();
        if (isGuest) { if (typeof Billing !== 'undefined' && Billing.showUpgrade) Billing.showUpgrade('Guest invite'); return; }
        if (window.ZPInvite) window.ZPInvite.open();
    });
    const composerBox = document.querySelector('.composer-box');
    const toolsExpandBtn = $('tools-expand-btn');
    if (toolsExpandBtn && composerBox) {
        toolsExpandBtn.addEventListener('click', () => composerBox.classList.toggle('tools-expanded'));
    }

    $('new-chat-btn').addEventListener('click', async () => {
        await Chat.newDraft();
        closeSidebar();
    });
    $('send-btn').addEventListener('click', () => Chat.send());
    $('stop-btn').addEventListener('click', () => Chat.stop());
    $('upgrade-btn').addEventListener('click', () => { Billing.showUpgrade(); closeSidebar(); });
    $('settings-btn').addEventListener('click', () => { Settings.open(); closeSidebar(); });
    $('close-settings').addEventListener('click', () => Settings.close());
    $('save-settings').addEventListener('click', () => { Settings.saveFromForm(); });
    // Appearance/model sections usable by everyone incl. guests (settings is now guest-accessible)
    $('info-btn').addEventListener('click', () => { $('about-modal').style.display = 'flex'; closeSidebar(); });
    $('close-about').addEventListener('click', () => $('about-modal').style.display = 'none');
    $('mic-btn').addEventListener('click', () => Voice.toggle());

    // ── Reminders ────────────────────────────────────────────────
    (function reminders() {
        const modal = $('reminders-modal');
        if (!modal) return;
        let _shown = false;
        async function renderReminders() {
            try {
                const { reminders } = await api('/api/reminders');
                const list = $('reminder-list');
                list.innerHTML = '';
                if (!reminders.length) {
                    list.innerHTML = `<div style="color:var(--muted); font-size:13px; text-align:center; padding:18px;">No reminders yet. Zelpophai AI will pop them here for you.</div>`;
                    return;
                }
                reminders.sort((a, b) => new Date(a.next_run_at) - new Date(b.next_run_at));
                reminders.forEach(r => {
                    const d = new Date(r.next_run_at);
                    const weekday = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
                    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:10px; border:1px solid var(--border); border-radius:10px; margin-bottom:8px;';
                    row.innerHTML = `
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:13px; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${Chat.escapeHtml(r.text)}</div>
                            <div style="font-size:11px; color:var(--muted); margin-top:2px;">⏰ ${weekday} · ${time}${r.repeat_days ? ' · repeats' : ''}</div>
                        </div>
                        <button class="rem-del" style="background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:14px;" title="Delete">🗑</button>`;
                    row.querySelector('.rem-del').addEventListener('click', async () => {
                        try {
                            await api(`/api/reminders/${r.id}/delete`, { method: 'POST' });
                            renderReminders();
                        } catch (e) { showToast('Failed to delete', 'error'); }
                    });
                    list.appendChild(row);
                });
            } catch (e) { /* auth or offline — ignore */ }
        }
        $('reminders-open').addEventListener('click', () => {
            modal.style.display = 'flex';
            renderReminders();
            closeSidebar();
        });
        $('reminders-close').addEventListener('click', () => { modal.style.display = 'none'; });
        $('reminder-add').addEventListener('click', async () => {
            const text = $('reminder-text').value.trim();
            const day = $('reminder-day').value;
            const time = $('reminder-time').value;
            const repeat = $('reminder-repeat').checked;
            if (!text) { showToast('Enter reminder text', 'error'); return; }
            if (!time) { showToast('Pick a time', 'error'); return; }
            const [hh, mm] = time.split(':').map(Number);
            const now = new Date();
            const next = new Date(now);
            next.setHours(hh, mm, 0, 0);
            const idx = ['sun','mon','tue','wed','thu','fri','sat'].indexOf(day);
            let target;
            if (day === '') {
                // "Tomorrow" — always tomorrow at the chosen time
                target = new Date(now.getTime() + 24 * 3600 * 1000);
                target.setHours(hh, mm, 0, 0);
            } else if (idx >= 0) {
                let diff = (idx - now.getDay() + 7) % 7;
                if (diff === 0 && next <= now) diff = 7;
                target = new Date(now);
                target.setDate(now.getDate() + diff);
                target.setHours(hh, mm, 0, 0);
            } else {
                // "Today" — today at the chosen time, or tomorrow if it already passed
                target = next;
                if (target <= now) {
                    target = new Date(now.getTime() + 24 * 3600 * 1000);
                    target.setHours(hh, mm, 0, 0);
                }
            }
            // client sends local ISO; server normalizes assumed-GMT? — server uses naive UTC. Convert to UTC ISO string.
            const iso = target.toISOString();
            try {
                await api('/api/reminders', {
                    method: 'POST',
                    body: JSON.stringify({ text, run_at: iso, repeat_days: repeat ? 1 : 0 }),
                });
                $('reminder-text').value = '';
                $('reminder-repeat').checked = false;
                renderReminders();
                showToast('Reminder set!', 'success');
            } catch (e) { showToast(e.message || 'Failed', 'error'); }
        });
        // Live pop when a due reminder arrives via the pending-notification channel
        const origNotif = window.__handlePendingReminder;
        window.__handlePendingReminder = (msg) => {
            showToast('⏰ ' + msg, 'success', 6000);
            if (typeof Notification === 'function' && Notification.permission === 'granted') {
                try { new Notification('Zelpophai AI reminder', { body: msg, icon: '/favicon.ico' }); } catch (e) {}
            }
        };
        void origNotif;
    })();

    $('memory-btn').addEventListener('click', () => { if (!requireLogin()) return; Memory.open(); closeSidebar(); });

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

    // Web search is automatic now (backend routes live-data questions to Sonar);
    // Research / Fact remain as explicit deep-search modes.
    $('research-btn').addEventListener('click', () => {
        $('research-btn').classList.toggle('active');
    });

    $('factcheck-btn').addEventListener('click', () => {
        $('factcheck-btn').classList.toggle('active');
    });

    const vbtn = document.getElementById('video-gen-btn');
    if (vbtn) vbtn.addEventListener('click', () => Chat.openVideoDialog());
    $('image-gen-btn').addEventListener('click', async () => {
        const prompt = await showPrompt('Describe the image you want to generate');
        if (!prompt || !prompt.trim()) return;
        await Chat.generateImageNow(prompt.trim());
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
        let ok;
        if (isGuest) {
            ok = await showConfirm('End guest session?', "Using log out will permanently delete this guest account and all its messages. They cannot be recovered. Continue?", false);
        } else {
            ok = await showConfirm('Log out?', 'Are you sure you want to log out?', false);
        }
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

    // Mobile top bar: username + logout (always visible next to the hamburger)
    const mobileLogout = $('mobile-logout-btn');
    if (mobileLogout) {
        mobileLogout.addEventListener('click', () => { $('logout-btn').click(); });
        mobileLogout.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            $('logout-btn').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
        });
    }

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

    // --- What's new (cards, welcome tour, sidebar icon) — see whatsnew.js ---
    if (window.ZPWhatsNew) window.ZPWhatsNew.init({ user, staffView: isAdmin || user.role === 'owner' || user.username === 'WANZU-IBRAHIM' });

    // --- Feedback (send, replies, ideas board, answer thumbs, monthly rating) — see feedback.js ---
    if (window.ZPFeedback) window.ZPFeedback.init({ user, isStaff: !!(isAdmin || isOwner), isGuest });
    // --- Email (every account needs a real one) + Personality row in Settings ---
    if (window.ZPAccount) window.ZPAccount.init({ user, isGuest });
    if (window.ZPPersona) window.ZPPersona.mountSettings();
    if (window.ZPSlash) window.ZPSlash.init({ isGuest });   // "/" commands in the message box
    // Broadcast polling — all users get popup when staff broadcasts
    // Dedup state is PER-USER and tracked by the broadcast's created_at_ts timestamp,
    // NOT its integer id (ids reset to 1 after "clear broadcast cache" on SQLite, which
    // would make every post-clear broadcast look "already seen").
    const _annBaseKey = 'zenith_bc_base_' + user.username;
    const _annSeenKey = 'zenith_bc_seen_' + user.username;
    const _annDoneKey = 'zenith_bc_done_' + user.username;
    const _tsOf = s => {
        if (typeof s === 'string' && /^\d+$/.test(s.trim())) return parseInt(s.trim(), 10);
        const t = new Date(s || '').getTime();
        return isNaN(t) ? 0 : t;
    };
    const _annBase = () => _tsOf(localStorage.getItem(_annBaseKey));
    const _lastSeen = () => Math.max(_annBase(), _tsOf(localStorage.getItem(_annSeenKey)));
    // Content-based "already shown" set: a broadcast can NEVER pop twice for this account no
    // matter what (reloads, logouts, timestamp collisions, baseline quirks). Keyed by content+ts
    // so the same message shown once never replays.
    const _annDoneList = () => {
        try { return JSON.parse(localStorage.getItem(_annDoneKey) || '[]'); } catch (e) { return []; }
    };
    const _annDoneId = a => (a.created_at_ts || '') + '::' + (a.content || '');
    const _annIsDone = a => _annDoneList().indexOf(_annDoneId(a)) !== -1;
    const _annMarkDone = a => {
        try {
            const list = _annDoneList();
            const id = _annDoneId(a);
            if (list.indexOf(id) === -1) {
                list.push(id);
                if (list.length > 200) list.splice(0, list.length - 200);
                localStorage.setItem(_annDoneKey, JSON.stringify(list));
            }
        } catch (e) {}
    };
    let _lastAnnTs = _lastSeen();
    let _pollingAnn = false;
    async function pollAnnouncements() {
        if (_pollingAnn) return;
        _pollingAnn = true;
        try {
            const d = await api('/api/announcements/feed?_=' + Date.now());
            const anns = d.announcements || [];
            // Nothing has ever been broadcast: remember that, so the very first broadcast still pops up.
            if (!anns.length && localStorage.getItem(_annBaseKey) === null) localStorage.setItem(_annBaseKey, '');
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
                    .filter(a => !_annIsDone(a))
                    .sort((x, y) => _tsOf(x.created_at_ts) - _tsOf(y.created_at_ts));
                if (pending.length) {
                    for (const a of pending) {
                        const ts = _tsOf(a.created_at_ts);
                        // Persist "shown" FIRST, before any popup/side-effect, so a toast/push/DOM
                        // failure or a page reload can NEVER make a broadcast replay infinitely.
                        _annMarkDone(a);
                        seen = Math.max(seen, ts);
                        showBroadcastPopup(a);
                        try { devicePush('Zelpophai AI Broadcast — ' + a.username, a.content, 'broadcast-' + a.id); } catch (e) {}
                        try { showDiscordToast('Zelpophai AI', a.username + ' — Broadcast', a.content.slice(0, 80), a.username); } catch (e) {}
                    }
                    localStorage.setItem(_annSeenKey, String(seen));
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
        const reload = () => setTimeout(() => window.location.reload(), 150);
        window.ZPop.show({
            id: 'role-notif-popup', dismissable: false, tone: promoted ? 'good' : 'warn', icon: promoted ? 'up' : 'down',
            badge: promoted ? 'Promoted' : 'Role changed',
            title: promoted ? 'You\'re now an Admin' : 'You\'re back to a normal account',
            text: promoted ? 'The Owner made you an Admin. You can now:' : 'The Owner removed your Admin role. You can no longer:',
            list: promoted
                ? ['Ban and unban people', 'Reset passwords', 'See chats and messages', 'Manage accounts', 'Open the Vault']
                : ['Ban and unban people', 'Reset passwords', 'See chats and messages', 'Open the Vault'],
            actions: [{ label: 'Got it', onClick: reload }],
            meta: 'The page reloads to apply the change.',
        });
    }
    function _showChosenPopup() {
        window.ZPop.show({
            id: 'chosen-popup', tone: 'good', icon: 'tools', badge: 'Chosen helper',
            title: 'The Owner picked you to help',
            text: 'Zelpophai is paused for everyone else, but your account stays open so you can lend a hand. Join the team chat to get started.',
            actions: [{ label: 'Open team chat', onClick: () => { try { window.openStaffChat(); } catch (e) {} } }, { label: 'Not now', kind: 'link' }],
            metaHtml: 'Picked by <b>WANZU-IBRAHIM</b> · The Owner',
        });
    }
    function _showHelperThanksPopup() {
        window.ZPop.show({
            id: 'helper-thanks-popup', tone: 'good', icon: 'heart', badge: 'All done',
            title: 'Thank you for helping',
            text: 'Everything is back up and running. The Owner is truly thankful for your help.',
            actions: [{ label: 'Back to team chat', onClick: () => { try { window.openStaffChat(); } catch (e) {} } }, { label: 'Close', kind: 'link' }],
        });
    }
    function _showRolesToast(msg) {
        if (typeof showToast === 'function') return showToast(msg, '');
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
                try { devicePush('Signed Out by the Owner', 'All sessions have been revoked. Please log in again.', 'force-logout'); } catch (e) {}
                setTimeout(() => { window.location.href = '/'; }, 30000);
            } else if (t === 'unlock-all') {
                window.showEmergencyPopup('unlock-all');
                try { devicePush('Zelpophai AI — Unlocked', 'All accounts have been unlocked by the Owner.', 'unlock-all'); } catch (e) {}
                _persistentScreen = '';
                const sc = document.getElementById('maintenance-screen');
                if (sc) sc.remove();
            } else {
                window.showEmergencyPopup(t);
                try { devicePush('Zelpophai AI — ' + (t === 'registrations' ? 'Registrations Closed' : t === 'messaging' ? 'Messaging Disabled' : t === 'ai' ? 'AI Disabled' : 'System Update'), a.content.replace(/^\[EMERGENCY:\w+\]\s*/, ''), 'emergency-' + t); } catch (e) {}
            }
            return;
        }
        const isOwner = a.role === 'owner';
        let when = '';
        try { const dt = new Date(a.created_at.replace(' ', 'T') + 'Z'); when = dt.toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}); } catch {}
        const E = window.ZPop.esc;
        window.ZPop.show({
            id: 'broadcast-popup-' + a.id, z: 9997, tone: isOwner ? 'owner' : 'staff', icon: 'megaphone',
            badge: isOwner ? 'Message from the Owner' : 'Message from staff',
            title: isOwner ? 'A message for everyone' : 'A message from the team',
            quote: a.content,
            actions: [{ label: 'Got it' }],
            metaHtml: 'Sent by <b>' + E(isOwner ? 'WANZU-IBRAHIM' : a.username) + '</b>' + (isOwner ? ' · The Owner' : ' · Staff') + (when ? ' · ' + E(when) : ''),
            // However it is closed (button, X, Escape or a click outside) it counts as read.
            onClose: () => {
                const prev = _lastSeen();
                localStorage.setItem(_annSeenKey, String(Math.max(prev, _tsOf(a.created_at_ts))));
                const attBadge = $('attention-badge') || $('broadcast-badge');
                if (attBadge) attBadge.style.display = 'none';
            },
        });
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
                    showDiscordToast('Zelpophai AI', m.username, m.content.slice(0,80), m.username);
                    // WhatsApp-style sound
                    try { const a=new Audio('/static/sounds/notify.mp3'); a.volume=0.6; a.play().catch(()=>{}); } catch {}
                });
            } else if (newMsgs.length && _lastStaffId === 0 && messages.length) {
                // offline queue — show latest if not yet dismissed
                const latest = messages[messages.length - 1];
                if (latest.username !== user.username) { showDiscordToast('Zelpophai AI', latest.username, latest.content.slice(0,80), latest.username); devicePush('Staff Live Chat — ' + latest.username, latest.content.slice(0,120), 'livechat-'+latest.id); try { const a=new Audio('/static/sounds/notify.mp3'); a.volume=0.6; a.play().catch(()=>{}); } catch {} }
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
});

async function _zpLogoutHome() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    window.location.replace('/');
}
function showBannedScreen(reason, bannedBy) {
    if (document.getElementById('banned-screen')) return;
    const byOwner = bannedBy === 'owner';
    window.ZPop.show({
        id: 'banned-screen', dismissable: false, full: true, z: 99999, tone: 'danger', icon: 'ban', badge: 'Account banned',
        title: 'This account has been banned',
        text: 'You can\'t use Zelpophai AI with this account any more. This takes effect right away.',
        quote: reason || 'No reason was given.', quoteLabel: 'Reason',
        actions: [{ label: 'Log out', icon: 'logout', id: 'banned-ok', keep: true, onClick: _zpLogoutHome }],
        metaHtml: 'Banned by <b>' + (byOwner ? 'The Owner' : 'an admin') + '</b> · Think this is a mistake? Write to <b>mihariser@gmail.com</b>',
    });
}
function showOfflineScreen() {
    if (document.getElementById('offline-screen')) return;
    window.ZPop.show({
        id: 'offline-screen', z: 9998, tone: 'info', icon: 'offline', badge: 'No connection', pulse: true,
        title: 'You\'re offline',
        text: 'Check your Wi-Fi or mobile data. Zelpophai picks up where you left off as soon as you\'re back.',
        actions: [{ label: 'Try again', id: 'offline-retry', keep: true, onClick: (c) => { if (navigator.onLine) c.close(); else showToast('Still offline', 'error'); } }],
    });
}
window.addEventListener('offline', showOfflineScreen);
window.addEventListener('online', () => {
    const el = document.getElementById('offline-screen');
    if (el) { el.remove(); showToast('Back online', 'success'); }
});
function showDeletedScreen(deletedBy) {
    if (document.getElementById('banned-screen')) return;
    const byOwner = deletedBy === 'owner';
    window.ZPop.show({
        id: 'banned-screen', dismissable: false, full: true, z: 99999, tone: 'owner', icon: 'trash', badge: 'Account deleted',
        title: 'This account has been deleted',
        text: 'The account and everything in it has been removed, so you can\'t use it any more.',
        actions: [{ label: 'OK', id: 'deleted-ok', keep: true, onClick: _zpLogoutHome }],
        metaHtml: 'Deleted by <b>' + (byOwner ? 'The Owner' : 'an admin') + '</b> · Questions? Write to <b>mihariser@gmail.com</b>',
    });
}
function showPasswordChangedScreen(changedBy) {
    if (document.getElementById('pwd-changed-screen') || document.getElementById('banned-screen')) return;
    const byOwner = changedBy === 'owner';
    window.ZPop.show({
        id: 'pwd-changed-screen', dismissable: false, z: 9999, tone: 'warn', icon: 'key', badge: 'Password changed', row: true,
        title: 'Your password was changed',
        text: 'You\'ll need the new one next time you log in. Want to see it now?',
        actions: [
            { label: 'Show my new password', id: 'pwd-yes', onClick: async () => {
                try { const { password } = await api('/api/auth/password-changed/view'); showPasswordModal(password); }
                catch (e) { showToast(e.message, 'error'); }
            } },
            { label: 'Later', id: 'pwd-no', kind: 'ghost', onClick: () => createPendingPwdButton() },
        ],
        metaHtml: 'Changed by <b>' + (byOwner ? 'The Owner' : 'an admin') + '</b>',
    });
}
function showPasswordModal(password) {
    window.ZPop.show({
        id: 'pwd-modal', z: 9999, tone: 'warn', icon: 'key', badge: 'Shown once',
        title: 'Your new password',
        text: 'Copy it or write it down now. For your safety it won\'t be shown again.',
        code: password,
        actions: [{ label: 'I\'ve saved it', id: 'pwd-close' }],
        onClose: async () => {
            try { await api('/api/auth/password-changed/dismiss', { method: 'POST' }); } catch (e) {}
            const btn = document.getElementById('pending-pwd-btn');
            if (btn) btn.remove();
        },
    });
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
