document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { user } = await api('/api/auth/me');
        if (user) { window.location.href = '/app'; return; }
    } catch (e) { /* not logged in */ }

    $('landing-page').style.display = 'flex';

    document.querySelectorAll('.pw-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = $(btn.dataset.target);
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.textContent = isPassword ? '\u2715' : '\uD83D\uDC41';
        });
    });

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
