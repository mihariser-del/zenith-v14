// Standalone Vault access page. Keyboard-only PIN entry (no on-screen keypad):
// type digits, Backspace to delete, Enter to submit. On success the 15-minute
// vault token is stored for this tab and the user is sent to /vault.
const VA = {
    _pin: [],
    _first: '',
    _mode: 'enter',
    _busy: false,
    _user: null,

    async init() {
        const cap = $('va-capture');
        document.addEventListener('keydown', (e) => this._onKey(e));
        document.addEventListener('click', () => this._refocus());
        if (cap) {
            cap.addEventListener('input', () => { cap.value = ''; });
        }
        const pw = $('va-pw');
        if (pw) pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this._submitPassword(); } });

        let me;
        try { me = (await api('/api/auth/me')).user; } catch (e) { window.location.href = '/'; return; }
        this._user = me;
        const isOwner = me.role === 'owner';
        if (!isOwner && !me.is_admin) { window.location.href = '/app'; return; }

        $('va-avatar').textContent = ((me.username || 'Z')[0] || 'Z').toUpperCase();
        $('va-name').textContent = me.username;
        const roleEl = $('va-role');
        roleEl.textContent = isOwner ? 'OWNER' : 'ADMIN';
        roleEl.classList.remove('role-owner', 'role-admin');
        roleEl.classList.add(isOwner ? 'role-owner' : 'role-admin');

        // A still-valid token on this tab means there's nothing to do here.
        let tok = '';
        try { tok = sessionStorage.getItem('zenith_vault_token') || ''; } catch (e) {}
        if (tok) {
            try { await api('/api/auth/admin/pin-unlock', { method: 'POST' }); window.location.href = '/vault'; return; }
            catch (e) { try { sessionStorage.removeItem('zenith_vault_token'); } catch (e2) {} }
        }

        let enabled = false;
        try { enabled = !!(await api('/api/auth/admin/pin-state')).enabled; } catch (e) {}
        this._setMode(enabled ? 'enter' : 'setup');
        this._refocus();
        setTimeout(() => this._refocus(), 250);
    },

    _refocus() {
        if (this._mode === 'setup-confirm') return;
        const cap = $('va-capture');
        if (cap) { try { cap.focus({ preventScroll: true }); } catch (e) { cap.focus(); } }
    },

    _setMode(mode) {
        this._mode = mode;
        this._pin = [];
        this._first = '';
        $('va-err').textContent = '';
        $('va-pin-block').style.display = 'block';
        $('va-pw-block').style.display = 'none';
        $('va-sub').textContent = mode === 'enter'
            ? 'Enter your PIN to continue'
            : 'First time here — create a 4-digit PIN';
        this._render();
    },

    _render() {
        const wrap = $('va-dots');
        if (!wrap) return;
        wrap.innerHTML = '<div class="vault-pin-dot"></div>'.repeat(4);
        this._pin.forEach((_, i) => { if (wrap.children[i]) wrap.children[i].classList.add('filled'); });
    },

    _onKey(e) {
        if (this._mode === 'setup-confirm') return; // the password field owns the keys
        if (/^[0-9]$/.test(e.key)) { e.preventDefault(); this._push(e.key); }
        else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); this._del(); }
        else if (e.key === 'Enter') { e.preventDefault(); this._submit(); }
    },

    _push(k) {
        if (this._busy || this._pin.length >= 4) return;
        $('va-err').textContent = '';
        this._pin.push(k);
        this._render();
        if (this._pin.length === 4) setTimeout(() => this._submit(), 130);
    },

    _del() {
        if (this._busy) return;
        this._pin.pop();
        this._render();
    },

    async _submit() {
        if (this._busy || this._pin.length < 4) return;
        const pin = this._pin.join('');

        if (this._mode === 'enter') {
            this._busy = true;
            try {
                const r = await api('/api/auth/admin/pin-verify', { method: 'POST', body: JSON.stringify({ pin }) });
                this._setToken(r.token);
                window.location.href = '/vault';
            } catch (e) {
                $('va-err').textContent = e.message || 'Wrong PIN — try again';
                this._pin = [];
                this._render();
            } finally {
                this._busy = false;
            }
            return;
        }

        if (this._mode === 'setup') {
            if (!this._first) {
                this._first = pin;
                this._pin = [];
                this._render();
                $('va-sub').textContent = 'Confirm your 4-digit PIN';
                return;
            }
            if (pin === this._first) {
                this._mode = 'setup-confirm';
                $('va-pin-block').style.display = 'none';
                $('va-pw-block').style.display = 'block';
                setTimeout(() => { const p = $('va-pw'); if (p) p.focus(); }, 50);
            } else {
                $('va-err').textContent = 'PINs did not match — start over';
                this._first = '';
                this._pin = [];
                this._render();
                $('va-sub').textContent = 'Create your 4-digit PIN';
            }
        }
    },

    async _submitPassword() {
        const pwEl = $('va-pw');
        const pw = pwEl ? pwEl.value : '';
        if (!pw) { $('va-err').textContent = 'Enter your account password'; return; }
        this._busy = true;
        try {
            const r = await api('/api/auth/admin/pin-set', { method: 'POST', body: JSON.stringify({ pin: this._first, password: pw }) });
            this._setToken(r.token);
            window.location.href = '/vault';
        } catch (e) {
            $('va-err').textContent = e.message || 'Could not enable PIN';
            this._busy = false;
        }
    },

    _setToken(tok) {
        try {
            if (tok) sessionStorage.setItem('zenith_vault_token', tok);
            else sessionStorage.removeItem('zenith_vault_token');
        } catch (e) {}
    },
};

document.addEventListener('DOMContentLoaded', () => VA.init());
