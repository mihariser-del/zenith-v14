const Settings = {
    defaults: {
        theme: 'dark',
        accent: '#0066ff',
        msgSpacing: 'cozy',
        markdown: true,
        speechLang: 'en-US',
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
        }
        $('theme-select').value = s.theme;
        $('accent-select').value = s.accent;
        $('msg-spacing').value = s.msgSpacing;
        $('markdown-toggle').value = String(s.markdown);
        $('speech-lang').value = s.speechLang;
        $('settings-modal').style.display = 'flex';
    },

    close() {
        $('settings-modal').style.display = 'none';
    },

    async apply() {
        const s = this.getLocal();
        document.body.classList.toggle('light-theme', s.theme === 'light');
        document.documentElement.style.setProperty('--accent-solid', s.accent);
        document.documentElement.style.setProperty('--accent-hover', s.accent);
        // Admin gold: keep gold default but allow accent to override logo color
        try {
            const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
            if (r.ok) {
                const d = await r.json();
                if (d.user && d.user.is_admin) {
                    document.body.classList.add('admin-gold');
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
            }
        } catch {}
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
        };
        this.saveLocal(localSettings);

        await api('/api/settings', {
            method: 'PATCH',
            body: JSON.stringify({
                model: $('model-select').value,
                max_tokens: parseInt($('max-tokens').value),
                temperature: parseFloat($('temperature').value),
                system_prompt: $('system-prompt').value,
                personality: $('personality-select').value,
                memory_enabled: $('memory-enabled').value === 'true',
            }),
        });

        this.apply();
        this.close();
        showToast('Settings saved!', 'success');
    },
};
