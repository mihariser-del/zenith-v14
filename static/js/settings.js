// Fill the model dropdowns (settings + per-chat header) from the server's
// catalog so names never drift from the backend again.
function populateModelSelects(models) {
    if (!Array.isArray(models) || !models.length) return;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const opts = models.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
    // Models are picked automatically (light or heavy, per message). Only the
    // Owner can still pin one, for testing.
    const ms = document.getElementById('model-select');
    if (ms) {
        const prev = ms.value;
        ms.innerHTML = '<option value="auto">Auto — picks the right model (recommended)</option>' + opts;
        ms.value = prev && (prev === 'auto' || models.some(m => m.id === prev)) ? prev : 'auto';
    }
    const cs = document.getElementById('chat-model-select');
    if (cs) {
        const prev = cs.value;
        cs.innerHTML = '<option value="">Auto model</option>' + opts;
        cs.value = prev || '';
    }
}
window.populateModelSelects = populateModelSelects;

const Settings = {
    defaults: {
        theme: 'auto',
        seasonal: 'auto',
        accent: '#8b5cf6',
        msgSpacing: 'cozy',
        markdown: true,
        speechLang: 'en-GB',
        speechRate: 1,
        textSize: 'normal',
        enterSends: true,
        chatWidth: 'normal',
        sounds: true,
        sendOnVoice: true,
        autoRead: false,
        showTime: false,
        animations: true,
        askBeforeDelete: true,
        startPage: 'new',
        language: '',
    },
    serverSettings: null,

    getLocal() {
        try {
            return { ...this.defaults, ...JSON.parse(localStorage.getItem('zenith_settings') || '{}') };
        } catch {
            return { ...this.defaults };
        }
    },

    saveLocal(settings) {
        localStorage.setItem('zenith_settings', JSON.stringify(settings));
    },

    async loadServer() {
        try {
            const data = await api('/api/settings');
            this.serverSettings = data.settings;
            this.presets = data.presets;
            this.modelList = data.models;
            if (window.populateModelSelects) window.populateModelSelects(data.models);
            return data;
        } catch (e) {
            console.error('Failed to load settings:', e);
            return null;
        }
    },

    /* ───────────── the Settings window ─────────────
       Everything saves by itself as you change it. Sections: General, Chat, Personality & memory,
       Voice, Notifications, Account, About. Settings.open('account') jumps straight to a section. */
    _m: null, _sec: 'general', _srv: null, _saveT: null,

    close() { if (this._m) { this._m.close(); this._m = null; } },

    _saved(text, bad) {
        const el = document.getElementById('zst-saved'); if (!el) return;
        el.textContent = text || 'Saved'; el.className = 'zst-saved on' + (bad ? ' bad' : '');
        clearTimeout(this._savedT); this._savedT = setTimeout(() => { el.className = 'zst-saved'; }, 1600);
    },
    _setLocal(patch) { this.saveLocal({ ...this.getLocal(), ...patch }); this.apply(); this._saved(); },
    _setServer(patch) {
        this._pending = { ...(this._pending || {}), ...patch };
        if (this._srv) Object.assign(this._srv, patch);
        clearTimeout(this._saveT);
        this._saveT = setTimeout(async () => {
            const body = this._pending; this._pending = null;
            try {
                await api('/api/settings', { method: 'PATCH', body: JSON.stringify(body) });
                if ('display_name' in body && typeof window.__applyDisplayName === 'function') window.__applyDisplayName(body.display_name);
                this._saved();
            } catch (e) { this._saved('Couldn\'t save', true); showToast(e.message, 'error'); }
        }, 450);
    },

    async open(section) {
        const { esc, icon, modal } = window.ZUI;
        const u = window.user || {}, guest = (u.username || '').startsWith('guest_'), owner = u.role === 'owner';
        this._sec = typeof section === 'string' ? section : (this._sec || 'general');
        const I = {
            general: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.100 2.100M17 17l2.100 2.100M2 12h3M19 12h3M4.9 19.100L7 17M17 7l2.100-2.100"/>',
            chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
            you: '<path d="M12 3.500l1.900 5.100 5.100 1.900-5.100 1.900L12 17.500l-1.900-5.100L5 10.500l5.100-1.900z"/>',
            voice: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v4"/>',
            alerts: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.300 21a1.900 1.900 0 0 0 3.400 0"/>',
            account: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.6-4 3.800-6 8-6s7.400 2 8 6"/>',
            about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.500v.01"/>',
        };
        Object.keys(I).forEach((k) => { I[k] = I[k].replace(/(\d)\.(\d)00\b/g, '$1.$2'); });
        const SECS = [['general', 'General'], ['chat', 'Chat'], ['you', 'Personality & memory'], ['voice', 'Voice'], ['alerts', 'Notifications'], ['account', 'Account'], ['about', 'About']];
        const sv = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
        const M = this._m = modal({ id: 'zst', title: 'Settings', cls: 'zst' });
        M.onClose = () => { this._m = null; };
        M.el.querySelector('.zu-box').classList.add('zst-box');
        M.head.innerHTML = '<span class="zst-saved" id="zst-saved" role="status">Saved</span>';
        M.body.classList.add('zst-body');
        M.body.innerHTML = `<nav class="zst-nav" aria-label="Settings sections">${SECS.map(([k, l]) => `<button type="button" data-sec="${k}">${sv(I[k])}<span>${l}</span></button>`).join('')}</nav><div class="zst-pane" id="zst-pane"><div class="zu-load">Loading…</div></div>`;
        M.body.querySelector('.zst-nav').onclick = (e) => { const b = e.target.closest('[data-sec]'); if (b) { this._sec = b.dataset.sec; draw(); } };

        const data = await this.loadServer();
        if (this._m !== M) return;
        this._srv = data ? { ...data.settings } : null;
        const self = this;
        const row = (title, about, control, cls) => `<div class="zst-row${cls ? ' ' + cls : ''}"><div class="zst-row-t"><b>${title}</b>${about ? `<span>${about}</span>` : ''}</div><div class="zst-row-c">${control}</div></div>`;
        const seg = (name, opts, val) => `<div class="zst-seg" role="radiogroup" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" role="radio" aria-checked="${String(v) === String(val)}" class="${String(v) === String(val) ? 'on' : ''}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
        const sw = (name, on, label) => `<button type="button" class="zu-switch${on ? ' on' : ''}" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" data-sw="${name}"></button>`;
        const group = (title, inner, about) => `<section class="zst-group"><h4>${title}</h4>${about ? `<p class="zst-about">${about}</p>` : ''}<div class="zst-card">${inner}</div></section>`;
        const nearest = (v, list) => list.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, list[0]);
        const needAccount = () => `<div class="zu-empty">${icon('lock')}<b>Create a free account to use this</b><span>Guest sessions don't keep settings like these.</span><button class="zu-btn pri sm" id="zst-signup">Create account</button></div>`;

        const PAGES = {
            general() {
                const s = self.getLocal(), srv = self._srv || {};
                const ACC = [['#8b5cf6', 'Purple'], ['#ff3db4', 'Pink'], ['#22d3ee', 'Cyan'], ['#0066ff', 'Blue'], ['#22c55e', 'Green'], ['#f97316', 'Orange']];
                return group('Profile', row('Display name', 'The name shown in the app and how Zelpophai greets you. Leave empty to use your username.',
                        `<input class="zu-in" id="zst-name" maxlength="50" placeholder="${esc(u.username || '')}" value="${esc(srv.display_name || '')}"${guest ? ' disabled' : ''}>`, 'stack'))
                    + group('Look', `<div class="zst-themes" data-seg="theme" role="radiogroup">${[['auto', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<button type="button" role="radio" aria-checked="${s.theme === v}" class="zst-theme ${v}${s.theme === v ? ' on' : ''}" data-v="${v}"><i><em></em><em></em><em></em></i><span>${l}</span></button>`).join('')}</div>`
                        + (owner ? '' : row('Colour', 'Used for buttons and your message bubbles.', `<div class="zst-swatches" data-seg="accent" role="radiogroup">${ACC.map(([v, l]) => `<button type="button" role="radio" aria-checked="${(s.accent || '').toLowerCase() === v}" class="${(s.accent || '').toLowerCase() === v ? 'on' : ''}" data-v="${v}" title="${l}" aria-label="${l}" style="--c:${v}"></button>`).join('')}</div>`))
                        + row('Text size', 'How big the words in your chats are.', seg('textSize', [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']], s.textSize || 'normal'))
                        + row('Space between messages', '', seg('msgSpacing', [['compact', 'Tight'], ['cozy', 'Normal'], ['spacious', 'Roomy']], s.msgSpacing))
                        + row('Seasonal look', 'A Halloween theme from 15 October to 2 November.', seg('seasonal', [['auto', 'In season'], ['on', 'Always'], ['off', 'Never']], s.seasonal || 'auto')))
                    + group('When Zelpophai opens', row('Start with', 'What you see when you open Zelpophai.', seg('startPage', [['new', 'A new chat'], ['last', 'My last chat']], s.startPage || 'new'), 'stack')
                        + row('Ask before deleting', 'Check with you before a chat, file or memory is deleted.', sw('askBeforeDelete', s.askBeforeDelete !== false, 'Ask before deleting')));
            },
            chat() {
                const s = self.getLocal(), srv = self._srv || {};
                const LEN = [800, 2048, 4096, 8192], len = nearest(srv.max_tokens || 2048, LEN);
                const TEMP = [0.3, 0.7, 1], temp = nearest(srv.temperature == null ? 0.7 : srv.temperature, TEMP);
                return group('Answers', row('Answer length', 'How long Zelpophai is allowed to make one answer. Files it writes can always be longer.', seg('max_tokens', [[800, 'Short'], [2048, 'Normal'], [4096, 'Long'], [8192, 'Very long']], len), 'stack')
                        + row('Style', 'Careful sticks to the facts. Creative takes more chances with wording and ideas.', seg('temperature', [[0.3, 'Careful'], [0.7, 'Balanced'], [1, 'Creative']], temp), 'stack')
                        + (owner ? row('AI model', 'Only you (the Owner) see this. Auto picks the right model for each message.', `<select class="zu-in" id="model-select"></select>`, 'stack') : ''))
                    + group('Writing and reading', row('Enter sends the message', 'Off: Enter makes a new line and Ctrl + Enter sends.', sw('enterSends', s.enterSends !== false, 'Enter sends the message'))
                        + row('Formatting', 'Show headings, bold text, tables and coloured code. Off shows plain text.', sw('markdown', s.markdown, 'Formatting')))
                    + group('On screen', row('Chat width', 'How wide messages are on a big screen.', seg('chatWidth', [['narrow', 'Narrow'], ['normal', 'Normal'], ['wide', 'Wide'], ['full', 'Full width']]), 'stack')
                        + row('Show the time on each message', 'A small clock under every message.', sw('showTime', !!s.showTime, 'Show the time on each message'))
                        + row('Animations', 'Fades and slides when things appear. Off can feel faster.', sw('animations', s.animations !== false, 'Animations')))
                    + group('Shortcuts', `<div class="zst-keys"><span><kbd>/</kbd> Quick commands</span><span><kbd>Ctrl</kbd><kbd>K</kbd> Search chats</span><span><kbd>Shift</kbd><kbd>Enter</kbd> New line</span><span><kbd>Esc</kbd> Close a window</span></div>`);
            },
            you() {
                if (guest) return needAccount();
                const srv = self._srv || {};
                return group('Personality', '<div id="zst-persona-slot"></div>', 'How Zelpophai talks to you: its tone, humour and how much detail it gives.')
                    + group('Memory', row('Remember things about me', 'Zelpophai keeps useful facts you tell it (your name, what you\'re working on) and uses them in later chats.', sw('memory_enabled', srv.memory_enabled !== false, 'Memory'))
                        + row('Saved memories', 'See, edit, pin or delete what it remembers.', '<button class="zu-btn sm" id="zst-mem">Open memories</button>'));
            },
            voice() {
                const s = self.getLocal();
                const LANGS = [['en-GB', 'English (UK)'], ['en-US', 'English (US)'], ['en-AU', 'English (Australia)'], ['en-IN', 'English (India)'], ['en-NG', 'English (Nigeria)'], ['en-KE', 'English (Kenya)'], ['sw-KE', 'Swahili (Kenya)'], ['sw-TZ', 'Swahili (Tanzania)'], ['fr-FR', 'French'], ['es-ES', 'Spanish'], ['pt-BR', 'Portuguese (Brazil)'], ['de-DE', 'German'], ['it-IT', 'Italian'], ['ar-SA', 'Arabic'], ['hi-IN', 'Hindi'], ['zh-CN', 'Chinese (Mandarin)'], ['ja-JP', 'Japanese'], ['ko-KR', 'Korean'], ['ru-RU', 'Russian'], ['tr-TR', 'Turkish']];
                return group('Talking and listening', row('Language and accent', 'Used when you speak to Zelpophai and when it reads answers aloud.', `<select class="zu-in" id="zst-lang">${LANGS.map(([v, l]) => `<option value="${v}"${s.speechLang === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`, 'stack')
                        + row('Reading speed', '', `<div class="zst-range"><input type="range" id="zst-rate" min="0.5" max="2" step="0.1" value="${s.speechRate || 1}" aria-label="Reading speed"><b id="zst-rate-l">${s.speechRate || 1}×</b></div>`, 'stack')
                        + row('Try it', 'Hear how answers will sound.', '<button class="zu-btn sm" id="zst-test">Play a sample</button>'))
                    + group('When you speak', row('Send as soon as I stop talking', 'Off: your words go in the message box and you press send yourself.', sw('sendOnVoice', s.sendOnVoice !== false, 'Send as soon as I stop talking'))
                        + row('Read answers aloud', 'Every answer is read out, even when you typed the question.', sw('autoRead', !!s.autoRead, 'Read answers aloud')))
                    + ('speechSynthesis' in window ? '' : '<p class="zst-about">This browser can\'t read answers aloud.</p>');
            },
            alerts() {
                const can = 'Notification' in window, p = can ? Notification.permission : 'unsupported';
                const state = p === 'granted' ? ['On', 'good', 'You\'ll get a notification when the team replies to your feedback, sends a message to everyone, or a reminder is due.']
                    : p === 'denied' ? ['Blocked', 'warn', 'Notifications are blocked for Zelpophai in this browser. To allow them, tap the lock icon next to the web address, find Notifications and choose Allow.']
                    : p === 'unsupported' ? ['Not available', '', 'This browser doesn\'t support notifications.']
                    : ['Off', '', 'Get a notification when the team replies to your feedback, sends a message to everyone, or a reminder is due.'];
                return group('On this device', row(`Notifications <span class="zu-tag ${state[1]}">${state[0]}</span>`, state[2], p === 'default' ? '<button class="zu-btn pri sm" id="zst-notif">Turn on</button>' : (p === 'granted' ? '<button class="zu-btn sm" id="zst-notif-test">Send a test</button>' : '')))
                    + group('Sounds', row('Play a sound for new replies', 'A soft chime when an answer arrives while you\'re on another tab.', sw('sounds', self.getLocal().sounds !== false, 'Play a sound for new replies')))
                    + '<p class="zst-about">Notifications only arrive while Zelpophai is open in a tab or installed as an app.</p>';
            },
            account() {
                if (guest) return needAccount();
                const plan = u.is_ultimate ? 'Ultimate' : (u.is_pro ? 'Pro' : 'Free');
                const joined = u.created_at ? new Date(u.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
                return `<div class="zst-me"><span class="zst-av">${esc((u.username || '?')[0].toUpperCase())}</span><div><b>@${esc(u.username)}</b><span>${plan} plan${joined ? ' · joined ' + joined : ''}</span></div><button class="zu-btn sm" id="zst-plan">${plan === 'Free' ? 'See plans' : 'My plan'}</button></div>`
                    + group('Sign-in', '<div id="zst-account-slot"></div>'
                        + row('Password', 'Changing it signs you out on your other devices.', '<button class="zu-btn sm" id="zst-pw">Change password</button>')
                        + row('Sign-in history', 'See when and where your account was used.', '<button class="zu-btn sm" id="zst-hist">View</button>')
                        + row('Other devices', 'Sign out everywhere except here.', '<button class="zu-btn sm" id="zst-outall">Sign out others</button>')
                        + row('This device', '', '<button class="zu-btn sm" id="zst-out">Log out</button>'))
                    + group('Your data', row('Download my data', 'One file with your chats, memories and settings.', '<button class="zu-btn sm" id="zst-export">Download</button>')
                        + row('Delete all my chats', 'Removes every chat for good. Your account and memories stay.', '<button class="zu-btn sm danger" id="zst-delchats">Delete chats</button>')
                        + (owner ? '' : row('Delete my account', 'Removes your chats and memories and closes the account. This can\'t be undone.', '<button class="zu-btn sm danger" id="zst-delacct">Delete account</button>')));
            },
            about() {
                return group('Zelpophai AI', row('Version', `<span id="zst-ver">…</span>`, '<button class="zu-btn sm" id="zst-new">What\'s new</button>')
                        + row('Feedback', 'Report a problem, share an idea or ask the team for something.', '<button class="zu-btn sm" id="zst-fb">Send feedback</button>')
                        + (guest ? '' : row('Invite friends', 'Every 5 friends who join gives you 3 days of Pro.', '<button class="zu-btn sm" id="zst-inv">Invite</button>'))
                        + row('Get the app', 'Zelpophai for Windows and Android.', '<a class="zu-btn sm" href="/download" target="_blank" rel="noopener">Download</a>'))
                    + group('Legal', row('Terms of use', '', '<a class="zu-btn sm" href="/terms" target="_blank" rel="noopener">Read</a>') + row('Privacy policy', '', '<a class="zu-btn sm" href="/privacy" target="_blank" rel="noopener">Read</a>'))
                    + group('This device', row('Reset look and voice settings', 'Puts theme, colour, text size and voice back to how they started. Your account isn\'t touched.', '<button class="zu-btn sm" id="zst-reset">Reset</button>'));
            },
        };

        function draw() {
            M.body.querySelectorAll('.zst-nav [data-sec]').forEach((b) => { const on = b.dataset.sec === self._sec; b.classList.toggle('on', on); if (on) { b.setAttribute('aria-current', 'page'); try { b.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {} } else b.removeAttribute('aria-current'); });
            const pane = M.body.querySelector('#zst-pane');
            pane.innerHTML = `<h3 class="zst-h">${SECS.find((x) => x[0] === self._sec)[1]}</h3>` + (PAGES[self._sec] || PAGES.general)();
            pane.scrollTop = 0;
            wire(pane);
        }

        function wire(pane) {
            const q = (id) => pane.querySelector('#' + id);
            const LOCAL = ['theme', 'accent', 'textSize', 'msgSpacing', 'seasonal', 'chatWidth', 'startPage'];
            pane.querySelectorAll('[data-seg]').forEach((g) => g.addEventListener('click', (e) => {
                const b = e.target.closest('[data-v]'); if (!b) return;
                g.querySelectorAll('[data-v]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
                const k = g.dataset.seg, v = b.dataset.v;
                if (LOCAL.includes(k)) self._setLocal({ [k]: v });
                else if (k === 'max_tokens') self._setServer({ max_tokens: parseInt(v, 10) });
                else if (k === 'temperature') self._setServer({ temperature: parseFloat(v) });
            }));
            pane.querySelectorAll('[data-sw]').forEach((b) => b.addEventListener('click', () => {
                const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
                if (b.dataset.sw === 'memory_enabled') self._setServer({ memory_enabled: on }); else self._setLocal({ [b.dataset.sw]: on });
            }));
            const signup = q('zst-signup'); if (signup) signup.onclick = () => { self.close(); const lb = document.getElementById('logout-btn'); if (lb) lb.click(); };
            if (q('zst-name')) q('zst-name').oninput = () => self._setServer({ display_name: q('zst-name').value.trim() });
            const ms = q('model-select');
            if (ms) { if (window.populateModelSelects) window.populateModelSelects(self.modelList); ms.value = ((self._srv || {}).model || '').startsWith('pin:') ? self._srv.model.slice(4) : 'auto'; ms.onchange = () => self._setServer({ model: ms.value === 'auto' ? 'auto' : 'pin:' + ms.value }); }
            if (q('zst-persona-slot') && window.ZPPersona) window.ZPPersona.mountSettings();
            if (q('zst-account-slot') && window.ZPAccount && window.ZPAccount.mountSettings) window.ZPAccount.mountSettings();
            if (q('zst-mem')) q('zst-mem').onclick = () => { if (typeof Memory !== 'undefined') Memory.open(); };
            if (q('zst-lang')) q('zst-lang').onchange = () => self._setLocal({ speechLang: q('zst-lang').value });
            if (q('zst-rate')) q('zst-rate').oninput = () => { const v = parseFloat(q('zst-rate').value) || 1; q('zst-rate-l').textContent = v + '×'; self._setLocal({ speechRate: v }); };
            if (q('zst-test')) q('zst-test').onclick = () => {
                if (!('speechSynthesis' in window)) return showToast('This browser can\'t read aloud', 'error');
                const s = self.getLocal(); speechSynthesis.cancel();
                const t = new SpeechSynthesisUtterance('Hello! This is how Zelpophai will sound when it reads answers to you.'); t.lang = s.speechLang || 'en-GB'; t.rate = parseFloat(s.speechRate) || 1; speechSynthesis.speak(t);
            };
            if (q('zst-notif')) q('zst-notif').onclick = async () => { try { await Notification.requestPermission(); } catch (e) {} draw(); };
            if (q('zst-notif-test')) q('zst-notif-test').onclick = () => { try { new Notification('Zelpophai AI', { body: 'Notifications are working.', icon: '/static/icons/icon-192.png' }); } catch (e) { showToast('Couldn\'t show a notification here', 'error'); } };
            if (q('zst-plan')) q('zst-plan').onclick = () => { self.close(); if (typeof Billing !== 'undefined' && Billing.showUpgrade) Billing.showUpgrade('Plans'); };
            if (q('zst-hist')) q('zst-hist').onclick = () => { self.close(); if (typeof Security !== 'undefined') Security.open(); };
            if (q('zst-out')) q('zst-out').onclick = () => { self.close(); const lb = document.getElementById('logout-btn'); if (lb) lb.click(); };
            if (q('zst-outall')) q('zst-outall').onclick = async () => {
                if (!(await showConfirm('Sign out your other devices?', 'Phones, tablets and other browsers will need to log in again. You stay signed in here.', false))) return;
                try { await api('/api/auth/logout-all', { method: 'POST' }); showToast('Other devices signed out', 'success'); } catch (e) { showToast(e.message, 'error'); }
            };
            if (q('zst-pw')) q('zst-pw').onclick = () => self._passwordForm();
            if (q('zst-export')) q('zst-export').onclick = async () => {
                const b = q('zst-export'); b.disabled = true; b.textContent = 'Preparing…';
                try {
                    const r = await fetch('/api/auth/my-data', { credentials: 'same-origin' });
                    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Download failed');
                    const blob = await r.blob(), a = document.createElement('a');
                    a.href = URL.createObjectURL(blob); a.download = 'zelpophai-my-data.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
                    showToast('Downloaded', 'success');
                } catch (e) { showToast(e.message, 'error'); }
                b.disabled = false; b.textContent = 'Download';
            };
            if (q('zst-delchats')) q('zst-delchats').onclick = () => self._dangerForm('chats');
            if (q('zst-delacct')) q('zst-delacct').onclick = () => self._dangerForm('account');
            if (q('zst-ver')) fetch('/api/version').then((r) => r.json()).then((d) => { const el = q('zst-ver'); if (el) el.textContent = 'You\'re on version ' + d.version; }).catch(() => {});
            if (q('zst-new')) q('zst-new').onclick = () => { window.open('/whats-new', '_blank', 'noopener'); };
            if (q('zst-fb')) q('zst-fb').onclick = () => { self.close(); if (window.ZPFeedback) window.ZPFeedback.open(); };
            if (q('zst-inv')) q('zst-inv').onclick = () => { self.close(); if (window.ZPInvite) window.ZPInvite.open(); };
            if (q('zst-reset')) q('zst-reset').onclick = async () => {
                if (!(await showConfirm('Reset look and voice settings?', 'Theme, colour, text size, spacing and voice go back to how they started.', false))) return;
                self.saveLocal({ ...self.defaults }); self.apply(); self._saved('Reset'); draw();
            };
        }
        draw();
    },

    _passwordForm() {
        const { modal } = window.ZUI;
        const P = modal({ id: 'zst-pwbox', title: 'Change password', icon: 'lock', sub: 'Your other devices will be signed out.' });
        P.body.innerHTML = `<label class="zu-l" for="zst-pw-old">Current password</label><input class="zu-in" id="zst-pw-old" type="password" autocomplete="current-password">
            <label class="zu-l" for="zst-pw-new">New password <em>(at least 8 characters)</em></label><input class="zu-in" id="zst-pw-new" type="password" autocomplete="new-password">
            <label class="zu-l" for="zst-pw-new2">New password again</label><input class="zu-in" id="zst-pw-new2" type="password" autocomplete="new-password">
            <label class="zst-show"><input type="checkbox" id="zst-pw-show"> Show passwords</label>
            <div class="zst-err" id="zst-pw-err" role="alert"></div>
            <button class="zu-btn pri wide" id="zst-pw-go">Change password</button>
            <p class="zu-fine">Forgot your current password? Log out and use “Forgot password?” on the login page.</p>`;
        const g = (id) => P.body.querySelector('#' + id);
        g('zst-pw-show').onchange = () => ['zst-pw-old', 'zst-pw-new', 'zst-pw-new2'].forEach((i) => { g(i).type = g('zst-pw-show').checked ? 'text' : 'password'; });
        const go = async () => {
            const cur = g('zst-pw-old').value, n1 = g('zst-pw-new').value, n2 = g('zst-pw-new2').value, err = g('zst-pw-err');
            err.textContent = !cur ? 'Enter your current password.' : n1.length < 8 ? 'Your new password needs at least 8 characters.' : n1 !== n2 ? 'The two new passwords don\'t match.' : '';
            if (err.textContent) return;
            g('zst-pw-go').disabled = true;
            try { const r = await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password: cur, new_password: n1 }) }); P.close(); showToast(r.message || 'Password changed', 'success'); }
            catch (e) { err.textContent = e.message; g('zst-pw-go').disabled = false; }
        };
        g('zst-pw-go').onclick = go;
        P.body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') go(); });
        setTimeout(() => g('zst-pw-old').focus(), 60);
    },

    _dangerForm(kind) {
        const { modal, esc } = window.ZUI;
        const acct = kind === 'account', u = window.user || {};
        const P = modal({ id: 'zst-danger', title: acct ? 'Delete my account' : 'Delete all my chats', icon: 'trash', sub: 'This can\'t be undone.' });
        P.body.innerHTML = `<div class="zst-warn">${acct ? 'Your chats and memories are deleted and your account is closed. You won\'t be able to log in again with it.' : 'Every chat you have is deleted for good. Your account, memories and settings stay.'}</div>
            <label class="zu-l" for="zst-d-pw">Your password</label><input class="zu-in" id="zst-d-pw" type="password" autocomplete="current-password">
            ${acct ? `<label class="zu-l" for="zst-d-name">Type your username <em>(${esc(u.username || '')})</em> to confirm</label><input class="zu-in" id="zst-d-name" autocomplete="off" autocapitalize="off" spellcheck="false">` : ''}
            <div class="zst-err" id="zst-d-err" role="alert"></div>
            <div class="zst-acts"><button class="zu-btn" id="zst-d-no">Cancel</button><button class="zu-btn danger solid" id="zst-d-go">${acct ? 'Delete my account' : 'Delete all chats'}</button></div>`;
        const g = (id) => P.body.querySelector('#' + id);
        g('zst-d-no').onclick = () => P.close();
        g('zst-d-go').onclick = async () => {
            const err = g('zst-d-err'), password = g('zst-d-pw').value;
            if (!password) { err.textContent = 'Enter your password.'; return; }
            if (acct && g('zst-d-name').value.trim().toLowerCase() !== String(u.username || '').toLowerCase()) { err.textContent = 'Type your username exactly to confirm.'; return; }
            g('zst-d-go').disabled = true;
            try {
                if (acct) { await api('/api/auth/delete-account', { method: 'POST', body: JSON.stringify({ password, confirm: g('zst-d-name').value.trim() }) }); window.location.replace('/'); }
                else { const r = await api('/api/auth/delete-my-chats', { method: 'POST', body: JSON.stringify({ password }) }); showToast(r.message, 'success'); setTimeout(() => window.location.reload(), 700); }
            } catch (e) { err.textContent = e.message; g('zst-d-go').disabled = false; }
        };
        setTimeout(() => g('zst-d-pw').focus(), 60);
    },

    applyTheme(choice) {
        const useLight = choice === 'light' || (choice !== 'dark' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
        document.body.classList.toggle('light-theme', useLight);
        document.documentElement.classList.toggle('light-theme', useLight);   // the sidebar/app styles key off <html> too
        if (!document.body.classList.contains('admin-owner') && !document.body.classList.contains('admin-gold')) {
            const m = document.querySelector('meta[name="theme-color"]');
            if (m) m.content = useLight ? '#f6f2ff' : '#000000';
        }
    },

    async apply() {
        const s = this.getLocal();
        this.applyTheme(s.theme);
        if (window.Halloween) window.Halloween.apply(s.seasonal);
        let isOwner = false;
        let isAdminUser = false;
        try {
            const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
            if (r.ok) {
                const d = await r.json();
                if (d.user && d.user.is_admin) {
                    isAdminUser = true;
                    isOwner = d.user.role === 'owner' || d.user.username === 'WANZU-IBRAHIM';
                    if (isOwner) {
                        document.body.classList.remove('admin-gold');
                        document.body.classList.add('admin-owner');
                    } else {
                        document.body.classList.add('admin-gold');
                    }
                }
            }
        } catch {}
        // Accent picker drives the whole vibrant look (solids + gradients). The owner's
        // picker is hidden, so they keep the neon defaults instead of a stale value.
        if (!isOwner) {
            const _a = (s.accent || '').trim();
            const _gold = /^#(?:ffd23f|ffd700|ff8c00)$/i.test(_a);
            const safe = (!_gold && /^#[0-9a-fA-F]{6}$/.test(_a)) ? _a : '#a855f7';
            document.documentElement.style.setProperty('--accent-solid', safe);
            document.documentElement.style.setProperty('--accent-hover', safe);
            document.documentElement.style.setProperty('--accent', `linear-gradient(135deg, ${safe}, #8b5cf6)`);
            document.documentElement.style.setProperty('--user-msg', `linear-gradient(135deg, ${safe}, #ff3db4)`);
        }
        // Admin gold: non-owner admins keep the gold-badged look but allow accent to tint the logo
        if (isAdminUser && !isOwner) {
            const accent = (s.accent || '').toLowerCase();
            const isGold = accent === '#ffd700' || accent === '#ff8c00';
            if (!isGold && s.accent) {
                document.documentElement.style.setProperty('--accent-solid', s.accent);
                document.documentElement.style.setProperty('--accent-hover', s.accent);
                document.body.style.setProperty('--accent-solid', s.accent);
                document.querySelectorAll('.z-logo, .welcome-z-logo').forEach(el => {
                    el.style.background = `linear-gradient(135deg, #FFD700, ${s.accent})`;
                    el.style.backgroundImage = '';
                });
            } else {
                document.body.style.removeProperty('--accent-solid');
                document.querySelectorAll('.z-logo, .welcome-z-logo').forEach(el => {
                    el.style.background = '';
                    el.style.backgroundImage = '';
                });
            }
        }
        const R = document.documentElement;
        R.dataset.zstText = s.textSize || 'normal';
        R.dataset.zstWidth = s.chatWidth || 'normal';
        R.classList.toggle('zst-no-anim', s.animations === false);
        R.classList.toggle('zst-times', !!s.showTime);
        const container = $('chat-container');
        if (container) {
            container.style.gap = s.msgSpacing === 'compact' ? '10px' : s.msgSpacing === 'spacious' ? '30px' : '20px';
        }
        if (s.markdown) {
            marked.setOptions({
                highlight: (code, lang) => {
                    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
                    return hljs.highlightAuto(code).value;
                },
                breaks: true,
            });
        }
    },
};

document.addEventListener('DOMContentLoaded', () => {
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (Settings.getLocal().theme === 'auto' && !e.matches) Settings.applyTheme('light');
        });
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
            if (Settings.getLocal().theme === 'auto' && !e.matches) Settings.applyTheme('dark');
        });
    }
});
