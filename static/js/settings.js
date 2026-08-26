const Settings = {
    defaults: {
        model: 'openai/gpt-4o-mini',
        maxTokens: 2048,
        temperature: 0.7,
        theme: 'dark',
        accent: '#0066ff',
        msgSpacing: 'cozy',
        markdown: true,
        speechLang: 'en-US',
    },

    get() {
        try {
            return { ...this.defaults, ...JSON.parse(localStorage.getItem('zenith_settings') || '{}') };
        } catch {
            return { ...this.defaults };
        }
    },

    save(settings) {
        localStorage.setItem('zenith_settings', JSON.stringify(settings));
    },

    open() {
        const s = this.get();
        $('model-select').value = s.model;
        $('max-tokens').value = s.maxTokens;
        $('temperature').value = s.temperature;
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

    apply() {
        const s = this.get();
        document.body.classList.toggle('light-theme', s.theme === 'light');
        document.documentElement.style.setProperty('--accent-solid', s.accent);
        document.documentElement.style.setProperty('--accent-hover', s.accent);
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

    saveFromForm() {
        const s = {
            model: $('model-select').value,
            maxTokens: parseInt($('max-tokens').value),
            temperature: parseFloat($('temperature').value),
            theme: $('theme-select').value,
            accent: $('accent-select').value,
            msgSpacing: $('msg-spacing').value,
            markdown: $('markdown-toggle').value === 'true',
            speechLang: $('speech-lang').value,
        };
        this.save(s);
        this.apply();
        this.close();
        showToast('Settings saved!', 'success');
    },
};
