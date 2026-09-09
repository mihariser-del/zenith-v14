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
        if (state.maintenance_mode === 'on') {
            document.body.innerHTML = '';
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.92);backdrop-filter:blur(10px);';
            wrap.innerHTML = `
                <div style="background:linear-gradient(160deg,#1a1510,#2a2015 50%,#1a1005);border:2px solid #F59E0B;border-radius:20px;padding:48px 56px;max-width:520px;width:92%;text-align:center;box-shadow:0 0 80px rgba(245,158,11,.2),0 30px 60px rgba(0,0,0,.6);">
                    <div style="font-size:72px;margin-bottom:16px;">🚧</div>
                    <div style="display:inline-block;padding:4px 14px;border-radius:20px;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.3);font-size:10px;font-weight:700;color:#F59E0B;letter-spacing:2px;margin-bottom:16px;">SYSTEM MAINTENANCE</div>
                    <h2 style="color:#F59E0B;font-size:24px;margin:0 0 12px;font-weight:800;">Maintenance Mode Active</h2>
                    <p style="color:#C0C7D1;font-size:14px;line-height:1.7;margin:0 0 24px;">The platform is temporarily under maintenance. You have been signed out until the work is done. Please check back later.</p>
                    <div style="font-size:11px;color:#666;">Initiated by <strong style="color:#C0C7D1;">WANZU-IBRAHIM</strong> — The Owner</div>
                </div>`;
            document.body.appendChild(wrap);
            _awaitAuthReset('maintenance');
            return;
        }
        if (state.locked === 'on') {
            document.body.innerHTML = '';
            const wrap2 = document.createElement('div');
            wrap2.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.92);backdrop-filter:blur(10px);';
            wrap2.innerHTML = `
                <div style="background:linear-gradient(160deg,#221010,#2a1414 50%,#150a0a);border:2px solid #EF4444;border-radius:20px;padding:48px 56px;max-width:520px;width:92%;text-align:center;box-shadow:0 0 80px rgba(239,68,68,.25),0 30px 60px rgba(0,0,0,.6);">
                    <div style="font-size:72px;margin-bottom:16px;">🔒</div>
                    <div style="display:inline-block;padding:4px 14px;border-radius:20px;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.35);font-size:10px;font-weight:700;color:#EF4444;letter-spacing:2px;margin-bottom:16px;">ALL ACCOUNTS LOCKED</div>
                    <h2 style="color:#EF4444;font-size:24px;margin:0 0 12px;font-weight:800;">Your Account Has Been Locked</h2>
                    <p style="color:#C0C7D1;font-size:14px;line-height:1.7;margin:0 0 24px;">The Owner has locked all accounts. You have been signed out until it is resolved. Please return when the Owner has unlocked the platform.</p>
                    <div style="font-size:11px;color:#666;">Initiated by <strong style="color:#C0C7D1;">WANZU-IBRAHIM</strong> — The Owner</div>
                </div>`;
            document.body.appendChild(wrap2);
            _awaitAuthReset('locked');
            return;
        }
    } catch (e) { /* ignore */ }

    $('landing-page').style.display = 'flex';

    document.querySelectorAll('.pw-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = $(btn.dataset.target);
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.textContent = isPassword ? '\u2715' : '\uD83D\uDC41';
        });
    });

    function resetForgotModal() {
        $('forgot-step1').style.display = 'block';
        $('forgot-step2').style.display = 'none';
        $('forgot-back').style.display = 'none';
        $('forgot-submit').textContent = 'Send Reset Code';
        $('forgot-msg').textContent = '';
        $('forgot-msg').className = 'auth-msg';
    }
    function goForgotStep2() {
        $('forgot-step1').style.display = 'none';
        $('forgot-step2').style.display = 'block';
        $('forgot-back').style.display = 'inline-block';
        $('forgot-submit').textContent = 'Set New Password';
    }
    $('forgot-link').addEventListener('click', () => { $('forgot-modal').style.display = 'flex'; resetForgotModal(); if (urlToken) { $('forgot-token').value = urlToken; goForgotStep2(); } });
    $('forgot-back').addEventListener('click', resetForgotModal);
    $('forgot-cancel').addEventListener('click', () => { $('forgot-modal').style.display = 'none'; });
    $('forgot-modal').addEventListener('click', e => { if (e.target === $('forgot-modal')) $('forgot-modal').style.display = 'none'; });
    $('forgot-submit').addEventListener('click', async () => {
        const step2 = $('forgot-step2').style.display === 'block';
        $('forgot-submit').disabled = true;
        try {
            if (!step2) {
                const username = $('forgot-username').value.trim();
                const email = $('forgot-email').value.trim();
                if (!username || !email) { $('forgot-msg').textContent = 'Fill all fields'; $('forgot-msg').className = 'auth-msg error'; return; }
                // Show sending animation
                $('forgot-step1').style.display = 'none';
                const sendingDiv = document.createElement('div');
                sendingDiv.id = 'forgot-sending';
                sendingDiv.style.cssText = 'text-align:center; padding:30px 0;';
                sendingDiv.innerHTML = `
                    <div style="font-size:36px; margin-bottom:16px; animation:pulse 1.2s ease-in-out infinite;">&#9993;</div>
                    <div style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:8px;">Sending reset code...</div>
                    <div style="font-size:13px; color:var(--text-secondary);">Check your inbox</div>
                    <div style="margin-top:20px; display:flex; justify-content:center; gap:6px;">
                        <div class="dot-loader"></div>
                        <div class="dot-loader"></div>
                        <div class="dot-loader"></div>
                    </div>
                `;
                $('forgot-step1').parentNode.insertBefore(sendingDiv, $('forgot-step2'));
                const style = document.createElement('style');
                style.textContent = `
                    @keyframes pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.15);opacity:.7} }
                    .dot-loader { width:8px; height:8px; border-radius:50%; background:var(--accent-solid,#4CC9F0); animation:dotBounce 1.4s ease-in-out infinite; }
                    .dot-loader:nth-child(2) { animation-delay:0.16s; }
                    .dot-loader:nth-child(3) { animation-delay:0.32s; }
                    @keyframes dotBounce { 0%,80%,100%{transform:scale(0.6);opacity:.4} 40%{transform:scale(1);opacity:1} }
                `;
                document.head.appendChild(style);

                const res = await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ username, email }) });
                // Remove sending animation
                const sending = $('forgot-sending');
                if (sending) sending.remove();
                $('forgot-msg').textContent = res.message + ' Enter the reset code below to continue.'; $('forgot-msg').className = 'auth-msg success';
                goForgotStep2();
            } else {
                const token = $('forgot-token').value.trim();
                const new_password = $('forgot-newpw').value;
                if (!token || !new_password) { $('forgot-msg').textContent = 'Enter the reset code and a new password'; $('forgot-msg').className = 'auth-msg error'; return; }
                const res = await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, new_password }) });
                $('forgot-msg').textContent = res.message; $('forgot-msg').className = 'auth-msg success';
                setTimeout(() => { $('forgot-modal').style.display = 'none'; resetForgotModal(); document.querySelector('.auth-tab[data-tab="login"]').click(); }, 1500);
            }
        } catch (e) { $('forgot-msg').textContent = e.message; $('forgot-msg').className = 'auth-msg error'; }
        finally { $('forgot-submit').disabled = false; }
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

    $('admin-crown').addEventListener('click', () => { $('admin-modal').style.display = 'flex'; });
    $('admin-cancel').addEventListener('click', () => { $('admin-modal').style.display = 'none'; });
    $('admin-modal').addEventListener('click', e => { if (e.target === $('admin-modal')) $('admin-modal').style.display = 'none'; });
    $('admin-submit').addEventListener('click', async () => {
        const username = $('admin-username').value.trim();
        const password = $('admin-password').value;
        const secret = $('admin-secret').value.trim();
        if (!username || !password) { $('admin-msg').textContent = 'Username and password required'; $('admin-msg').className = 'auth-msg error'; return; }
        $('admin-submit').disabled = true;
        try {
            await api('/api/auth/admin/login', { method: 'POST', body: JSON.stringify({ username, password, secret }) });
            window.location.href = '/app';
        } catch (e) { $('admin-msg').textContent = e.message; $('admin-msg').className = 'auth-msg error'; }
        finally { $('admin-submit').disabled = false; }
    });
    $('guest-btn').addEventListener('click', async () => {
        $('guest-btn').disabled = true;
        $('guest-btn').textContent = 'LOADING...';
        try { await api('/api/auth/guest', { method: 'POST' }); window.location.href = '/app'; }
        catch (e) { showToast(e.message, 'error'); $('guest-btn').disabled = false; $('guest-btn').textContent = 'CONTINUE AS GUEST'; }
    });

    $('start-btn').addEventListener('click', () => {
        $('landing-page').style.display = 'none';
        $('login-screen').style.display = 'flex';
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
            $('login-form-container').style.display = isLogin ? 'block' : 'none';
            $('register-form-container').style.display = isLogin ? 'none' : 'block';
        });
    });

    $('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('login-btn');
        btn.disabled = true;
        try {
            await api('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({
                    username: $('login-username').value.trim(),
                    password: $('login-password').value,
                }),
            });
            window.location.href = '/app';
        } catch (err) {
            $('login-msg').textContent = err.message;
            $('login-msg').className = 'auth-msg error';
        } finally {
            btn.disabled = false;
        }
    });

    $('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pw = $('reg-password').value;
        const confirm = $('reg-password-confirm').value;
        if (pw !== confirm) {
            $('register-msg').textContent = 'Passwords do not match';
            $('register-msg').className = 'auth-msg error';
            return;
        }
        const btn = $('register-btn');
        btn.disabled = true;
        try {
            await api('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    username: $('reg-username').value.trim(),
                    email: $('reg-email').value.trim(),
                    password: pw,
                }),
            });
            showToast('Account created! Please login.', 'success');
            document.querySelector('.auth-tab[data-tab="login"]').click();
        } catch (err) {
            $('register-msg').textContent = err.message;
            $('register-msg').className = 'auth-msg error';
        } finally {
            btn.disabled = false;
        }
    });
});
async function handleGoogleCredential(response) {
    try {
        const id_token = response.credential;
        await api('/api/auth/google', { method: 'POST', body: JSON.stringify({ id_token }) });
        window.location.href = '/app';
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
