const Settings = {
    defaults: {
        theme: 'dark',
        accent: '#8b5cf6',
        msgSpacing: 'cozy',
        markdown: true,
        speechLang: 'en-GB',
        speechRate: 1,
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
            return data;
        } catch (e) {
            console.error('Failed to load settings:', e);
            return null;
        }
    },

    async open() {
        const s = this.getLocal();
        const serverData = await this.loadServer();
        if (serverData) {
            const srv = serverData.settings;
            $('model-select').value = srv.model;
            $('max-tokens').value = srv.max_tokens;
            $('temperature').value = srv.temperature;
            $('system-prompt').value = srv.system_prompt;
            $('personality-select').value = srv.personality;
            $('memory-enabled').value = String(srv.memory_enabled);
            $('display-name').value = srv.display_name || '';
        }
        this.loadPersonality();
        $('theme-select').value = s.theme;
        $('accent-select').value = s.accent;
        $('msg-spacing').value = s.msgSpacing;
        $('markdown-toggle').value = String(s.markdown);
        $('speech-lang').value = s.speechLang;
        const rateEl = $('speech-rate');
        if (rateEl) {
            rateEl.value = s.speechRate || 1;
            const lbl = $('speech-rate-label');
            if (lbl) lbl.textContent = (s.speechRate || 1) + '×';
            rateEl.oninput = () => {
                const s2 = { ...this.getLocal(), speechRate: parseFloat(rateEl.value) };
                this.saveLocal(s2);
                if (lbl) lbl.textContent = s2.speechRate + '×';
            };
        }
        $('settings-modal').style.display = 'flex';
    },

    close() {
        $('settings-modal').style.display = 'none';
    },

    async apply() {
        const s = this.getLocal();
        document.body.classList.toggle('light-theme', s.theme === 'light');
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

    async saveFromForm() {
        const localSettings = {
            theme: $('theme-select').value,
            accent: $('accent-select').value,
            msgSpacing: $('msg-spacing').value,
            markdown: $('markdown-toggle').value === 'true',
            speechLang: $('speech-lang').value,
            speechRate: parseFloat($('speech-rate') ? $('speech-rate').value : 1) || 1,
        };
        this.saveLocal(localSettings);

        const name = $('display-name').value.trim();
        await api('/api/settings', {
            method: 'PATCH',
            body: JSON.stringify({
                model: $('model-select').value,
                max_tokens: parseInt($('max-tokens').value),
                temperature: parseFloat($('temperature').value),
                system_prompt: $('system-prompt').value,
                personality: $('personality-select').value,
                memory_enabled: $('memory-enabled').value === 'true',
                display_name: name,
            }),
        });
        if (typeof window.__applyDisplayName === 'function') window.__applyDisplayName(name);

        this.apply();
        this.close();
        showToast('Settings saved!', 'success');
    },

    async loadPersonality() {
        try {
            const r = await api('/api/personality/profile');
            if ($('mirror-toggle')) $('mirror-toggle').value = String(!!r.enabled);
            this.renderMirror(r);
        } catch (e) {
            const el = $('mirror-profile');
            if (el) el.innerHTML = '<div style="font-size:12px;color:#888;">Mirror unavailable: ' + (e.message || 'error') + '</div>';
        }
    },

    renderMirror(r) {
        const el = $('mirror-profile');
        if (!el) return;
        if (!r.enabled) { el.innerHTML = '<div style="font-size:12px;color:#888;">Mirror mode is off. Turn it on and Zelpophai AI will match how you talk.</div>'; return; }
        if (r.profile) {
            const p = r.profile;
            const chips = [['Tone', p.tone], ['Formality', p.formality], ['Energy', p.energy], ['Humor', p.humor], ['Emoji', p.emoji_use], ['Detail', p.detail_level]]
                .filter(x => x[1])
                .map(([k, v]) => `<span style="display:inline-block;background:var(--hover-bg);border:1px solid var(--border);border-radius:6px;padding:2px 8px;font-size:11px;margin:2px;color:var(--text);">${k}: <b>${v}</b></span>`)
                .join('');
            const when = r.updated_at ? `<div style="font-size:11px;color:#888;margin-top:4px;">Analyzed ${new Date(r.updated_at).toLocaleString()}</div>` : '';
            el.innerHTML = `<div style="margin-bottom:6px;">Zelpophai AI mirrors how <b>you</b> talk:</div>${chips}${when}`;
        } else {
            const need = Math.max(0, 5 - (r.message_count || 0));
            el.innerHTML = '<div style="font-size:12px;color:#888;">Not analyzed yet — it needs at least 5 of your messages' + (need > 0 ? ` (${need} more to go)` : '') + '. Chat a bit, then hit "Analyze now".</div>';
        }
    },
};

document.addEventListener('DOMContentLoaded', () => {
    const toggle = $('mirror-toggle');
    if (!toggle) return;
    toggle.addEventListener('change', async () => {
        try {
            await api('/api/personality/settings', { method: 'POST', body: JSON.stringify({ enabled: toggle.value === 'true' }) });
            showToast('Mirror mode ' + (toggle.value === 'true' ? 'on' : 'off'), 'success');
            Settings.loadPersonality();
        } catch (e) { showToast(e.message, 'error'); }
    });
    const refreshBtn = $('mirror-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            try {
                const r = await api('/api/personality/refresh', { method: 'POST' });
                showToast(r.ok ? 'Profile analyzed' : 'Not enough messages yet', r.ok ? 'success' : 'error');
                Settings.loadPersonality();
            } catch (e) { showToast('Analyze failed: ' + e.message, 'error'); }
        });
    }
    const resetBtn = $('mirror-reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            const ok = await showConfirm('Reset mirror profile?', 'Zelpophai AI will forget its analysis of how you talk and re-learn from your future chats.', false);
            if (!ok) return;
            try {
                await api('/api/personality/reset', { method: 'POST' });
                showToast('Mirror profile cleared', 'success');
                Settings.loadPersonality();
            } catch (e) { showToast(e.message, 'error'); }
        });
    }
});
