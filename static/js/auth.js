document.addEventListener('DOMContentLoaded', async () => {
    const _hasResetToken = new URLSearchParams(window.location.search).get('reset_token');
    try {
        const { user } = await api('/api/auth/me');
        if (user && !_hasResetToken) { window.location.href = '/app'; return; }
        if (user && _hasResetToken) {
            // Logged in but opening a reset link — sign out so reset applies cleanly
            try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
        }
    } catch (e) { /* not logged in */ }

    // Check maintenance/locked status
    function _awaitAuthReset(kind) {
        setInterval(async () => {
            try {
                const st = await api('/api/admin/system/public');
                const stillOn = kind === 'maintenance' ? st.maintenance_mode === 'on' : st.locked === 'on';
                if (!stillOn) window.location.reload();
            } catch (e) {}
        }, 2000);
    }
    try {
        const state = await api('/api/admin/system/public');
        if (state.maintenance_mode === 'on') { window.ZPop.systemScreen('maintenance'); _awaitAuthReset('maintenance'); return; }
        if (state.locked === 'on') { window.ZPop.systemScreen('locked'); _awaitAuthReset('locked'); return; }
    } catch (e) { /* ignore */ }

    $('landing-page').style.display = 'flex';

    document.querySelectorAll('.pw-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = $(btn.dataset.target);
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.classList.toggle('on', isPassword);
            const lbl = isPassword ? 'Hide password' : 'Show password';
            btn.title = lbl; btn.setAttribute('aria-label', lbl);
            btn.innerHTML = isPassword
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.2A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4M6.5 6.6A17.3 17.3 0 0 0 2 12s3.6 7 10 7a10.3 10.3 0 0 0 4.3-.9M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
        });
    });

    const busy = (btn, on) => { if (!btn) return; btn.disabled = on; btn.classList.toggle('busy', on); };
    const say = (id, text, kind) => { const el = $(id); if (!el) return; el.textContent = text || ''; el.className = 'auth-msg' + (kind ? ' ' + kind : ''); };
    // Links that act as buttons work from the keyboard too.
    document.querySelectorAll('#login-screen [role="button"], #login-screen [role="tab"]').forEach((el) => {
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        ['forgot-modal', 'admin-modal'].forEach((id) => { if ($(id) && $(id).style.display === 'flex') $(id).style.display = 'none'; });
    });
    [['forgot-modal', 'forgot-submit'], ['admin-modal', 'admin-submit']].forEach(([m, b]) => {
        $(m).addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); $(b).click(); } });
    });
    // The page changes its words to match the tab: Log in / Create account.
    function setMode(mode) {
        const reg = mode === 'register';
        $('login-screen').dataset.mode = mode;
        $('za-title').textContent = reg ? 'Create your account' : 'Log in';
        $('za-sub').textContent = reg ? 'It takes less than a minute, and it\'s free.' : 'Welcome back. Enter your details to continue.';
        $('za-aside-title').textContent = reg ? 'Start creating in a minute.' : 'Good to see you again.';
        $('za-aside-sub').textContent = reg ? 'Make an account to keep your chats, files and memories safe on any device.' : 'Your chats, files and memories are waiting right where you left them.';
        say('login-msg', ''); say('register-msg', '');
    }

    function resetForgotModal() {
        $('forgot-step1').style.display = 'block';
        $('forgot-step2').style.display = 'none';
        $('forgot-back').style.display = 'none';
        $('forgot-submit').textContent = 'Send reset code';
        $('forgot-msg').textContent = '';
        $('forgot-msg').className = 'auth-msg';
    }
    function goForgotStep2() {
        $('forgot-step1').style.display = 'none';
        $('forgot-step2').style.display = 'block';
        $('forgot-back').style.display = 'inline-block';
        $('forgot-submit').textContent = 'Set new password';
    }
    $('forgot-link').addEventListener('click', () => { $('forgot-modal').style.display = 'flex'; resetForgotModal(); if (urlToken) { $('forgot-token').value = urlToken; goForgotStep2(); } });
    $('forgot-back').addEventListener('click', resetForgotModal);
    $('forgot-cancel').addEventListener('click', () => { $('forgot-modal').style.display = 'none'; });
    $('forgot-modal').addEventListener('click', e => { if (e.target === $('forgot-modal')) $('forgot-modal').style.display = 'none'; });
    $('forgot-submit').addEventListener('click', async () => {
        const step2 = $('forgot-step2').style.display === 'block';
        busy($('forgot-submit'), true);
        try {
            if (!step2) {
                const username = $('forgot-username').value.trim();
                const email = $('forgot-email').value.trim();
                if (!username || !email) { $('forgot-msg').textContent = 'Enter your username and your email.'; $('forgot-msg').className = 'auth-msg error'; return; }
                // Show sending animation
                $('forgot-step1').style.display = 'none';
                say('forgot-msg', '');
                const sendingDiv = document.createElement('div');
                sendingDiv.id = 'forgot-sending';
                sendingDiv.innerHTML = '<div class="za-btn busy" style="background:none!important;box-shadow:none!important;height:34px;pointer-events:none"></div><p style="margin:10px 0 0">Sending your reset code…</p>';
                $('forgot-step1').parentNode.insertBefore(sendingDiv, $('forgot-step2'));

                let res;
                try { res = await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ username, email }) }); }
                catch (err) { const sd = $('forgot-sending'); if (sd) sd.remove(); $('forgot-step1').style.display = 'block'; throw err; }
                // Remove sending animation
                const sending = $('forgot-sending');
                if (sending) sending.remove();
                $('forgot-msg').textContent = res.message + ' Enter the reset code below to continue.'; $('forgot-msg').className = 'auth-msg success';
                goForgotStep2();
            } else {
                const token = $('forgot-token').value.trim().toUpperCase();
                const new_password = $('forgot-newpw').value;
                if (!token || !new_password) { $('forgot-msg').textContent = 'Enter the reset code and a new password'; $('forgot-msg').className = 'auth-msg error'; return; }
                if (new_password.length < 8) { say('forgot-msg', 'Your new password needs at least 8 characters.', 'error'); return; }
                const res = await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, new_password }) });
                $('forgot-msg').textContent = res.message; $('forgot-msg').className = 'auth-msg success';
                setTimeout(() => { $('forgot-modal').style.display = 'none'; resetForgotModal(); document.querySelector('.auth-tab[data-tab="login"]').click(); }, 1500);
            }
        } catch (e) { $('forgot-msg').textContent = e.message; $('forgot-msg').className = 'auth-msg error'; }
        finally { busy($('forgot-submit'), false); }
    });

    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('reset_token');

    if (urlToken) {
        setTimeout(() => {
            $('forgot-modal').style.display = 'flex';
            resetForgotModal();
            $('forgot-token').value = urlToken;
            goForgotStep2();
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 300);
    }

    $('admin-crown').addEventListener('click', () => { $('admin-modal').style.display = 'flex'; say('admin-msg', ''); setTimeout(() => $('admin-username').focus(), 50); });
    $('admin-cancel').addEventListener('click', () => { $('admin-modal').style.display = 'none'; });
    $('admin-modal').addEventListener('click', e => { if (e.target === $('admin-modal')) $('admin-modal').style.display = 'none'; });
    $('admin-submit').addEventListener('click', async () => {
        const username = $('admin-username').value.trim();
        const password = $('admin-password').value;
        if (!username || !password) { $('admin-msg').textContent = 'Username and password required'; $('admin-msg').className = 'auth-msg error'; return; }
        busy($('admin-submit'), true);
        try {
            await api('/api/auth/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) });
            if (window.Halloween) Halloween.markLogin('login'); window.location.href = '/app';
        } catch (e) { $('admin-msg').textContent = e.message; $('admin-msg').className = 'auth-msg error'; }
        finally { busy($('admin-submit'), false); }
    });
    $('guest-btn').addEventListener('click', async () => {
        busy($('guest-btn'), true);
        try { await api('/api/auth/guest', { method: 'POST' }); if (window.Halloween) Halloween.markLogin('login'); window.location.href = '/app'; }
        catch (e) { showToast(e.message, 'error'); busy($('guest-btn'), false); }
    });

    $('start-btn').addEventListener('click', () => {
        $('landing-page').style.display = 'none';
        $('login-screen').style.display = 'flex';
        setTimeout(() => { try { ($('login-form-container').style.display === 'none' ? $('reg-username') : $('login-username')).focus(); } catch (e) {} }, 60);
    });

    $('back-link').addEventListener('click', () => {
        $('login-screen').style.display = 'none';
        $('landing-page').style.display = 'flex';
    });

    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const isLogin = tab.dataset.tab === 'login';
            setMode(isLogin ? 'login' : 'register');
            $('login-form-container').style.display = isLogin ? 'block' : 'none';
            $('register-form-container').style.display = isLogin ? 'none' : 'block';
        });
    });

    $('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('login-btn');
        if (!$('login-username').value.trim() || !$('login-password').value) { say('login-msg', 'Enter your username and your password.', 'error'); return; }
        say('login-msg', '');
        busy(btn, true);
        try {
            await api('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({
                    username: $('login-username').value.trim(),
                    password: $('login-password').value,
                }),
            });
            if (window.Halloween) Halloween.markLogin('login'); window.location.href = '/app';
        } catch (err) {
            say('login-msg', err.message, 'error');
            busy(btn, false);
        }
    });

    // Password strength hint while choosing a password.
    $('reg-password').addEventListener('input', () => {
        const v = $('reg-password').value, m = $('reg-meter');
        m.classList.toggle('show', v.length > 0);
        let sc = 0;
        if (v.length >= 8) sc++;
        if (v.length >= 12) sc++;
        if (/[a-z]/.test(v) && /[A-Z]/.test(v)) sc++;
        if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) sc++; else if (/\d/.test(v) || /[^A-Za-z0-9]/.test(v)) sc += 0.5;
        sc = v.length < 8 ? 1 : Math.max(2, Math.min(4, Math.round(sc)));
        m.dataset.s = sc;
        $('reg-meter-text').textContent = v.length < 8 ? (8 - v.length) + ' more to go' : ['', '', 'Okay', 'Good', 'Strong'][sc];
    });

    // "Skip and add my email later": the email box is switched off and not required.
    if ($('reg-skip-email')) $('reg-skip-email').addEventListener('change', () => {
        const on = $('reg-skip-email').checked, em = $('reg-email');
        em.disabled = on; em.required = !on; em.style.opacity = on ? '0.45' : '';
        if (on) em.value = '';
        em.placeholder = on ? 'You\'ll add it later' : 'Your real email address';
    });
    $('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pw = $('reg-password').value;
        const confirm = $('reg-password-confirm').value;
        const uname = $('reg-username').value.trim();
        const skipNow = !!($('reg-skip-email') && $('reg-skip-email').checked);
        if (!/^[A-Za-z0-9_.-]{3,30}$/.test(uname)) { say('register-msg', 'Pick a username of 3–30 letters, numbers, dots, dashes or underscores (no spaces).', 'error'); $('reg-username').focus(); return; }
        if (!skipNow && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test($('reg-email').value.trim())) { say('register-msg', 'Enter your real email address — or tick the box below it to add one later.', 'error'); $('reg-email').focus(); return; }
        if (pw.length < 8) { say('register-msg', 'Your password needs at least 8 characters.', 'error'); $('reg-password').focus(); return; }
        if (pw !== confirm) { say('register-msg', 'The two passwords don\'t match. Type them again.', 'error'); $('reg-password-confirm').focus(); return; }
        say('register-msg', '');
        const skip = !!($('reg-skip-email') && $('reg-skip-email').checked);
        const btn = $('register-btn');
        busy(btn, true);
        try {
            const res = await api('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    username: uname,
                    email: skip ? '' : $('reg-email').value.trim(),
                    skip_email: skip,
                    password: pw,
                    device_id: getDeviceId(),
                }),
            });
            // The server signs a new account in straight away, so go right in.
            let signedIn = !!(res && res.user);
            if (!signedIn) { try { signedIn = !!(await api('/api/auth/me')).user; } catch (e2) {} }
            if (signedIn) {
                say('register-msg', 'Account created — taking you in…', 'success');
                if (window.Halloween) { try { Halloween.markLogin('new'); } catch (e3) {} }
                window.location.href = '/app';
                return;
            }
            document.querySelector('.auth-tab[data-tab="login"]').click();
            $('login-username').value = uname;
            say('login-msg', 'Account created. Log in to start.', 'success');
            busy(btn, false);
        } catch (err) {
            say('register-msg', err.message, 'error');
            busy(btn, false);
        }
    });
});
function getDeviceId() {
    try {
        let id = localStorage.getItem('zenith_device_id');
        if (!id) {
            id = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
            localStorage.setItem('zenith_device_id', id);
        }
        return id;
    } catch (e) { return ''; }
}

async function handleGoogleCredential(response) {
    try {
        const id_token = response.credential;
        await api('/api/auth/google', { method: 'POST', body: JSON.stringify({ id_token }) });
        if (window.Halloween) Halloween.markLogin('login'); window.location.href = '/app';
    } catch (e) {
        if (typeof showToast === 'function') showToast('Google login failed: ' + e.message, 'error');
        else {
            const msg = document.createElement('div');
            msg.textContent = 'Google login failed: ' + e.message;
            msg.style.cssText = 'position:fixed; top:20px; right:20px; background:#1e1f22; color:#fff; padding:12px 16px; border-radius:8px; border:1px solid #2a2f36; z-index:9999;';
            document.body.appendChild(msg);
            setTimeout(()=>msg.remove(), 4000);
        }
    }
}
