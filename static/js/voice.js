const Voice = {
    recognition: null,
    isListening: false,

    init() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            $('mic-btn').style.display = 'none';
            return;
        }
        this.recognition = new SR();
        this.recognition.interimResults = true;
        this.recognition.onresult = (e) => {
            $('user-input').value = Array.from(e.results)
                .map(r => r[0].transcript)
                .join('');
            $('user-input').dispatchEvent(new Event('input'));
        };
        this.recognition.onend = () => {
            const wasListening = this.isListening;
            this.isListening = false;
            $('mic-btn').classList.remove('active');
            if (wasListening && $('user-input').value.trim()) {
                setTimeout(() => Chat.send(), 300);
            }
        };
        this.recognition.onerror = (e) => {
            if (e.error !== 'no-speech') {
                showToast('Voice error: ' + e.error, 'error');
            }
            this.isListening = false;
            $('mic-btn').classList.remove('active');
        };
    },

    toggle() {
        if (!this.recognition) {
            showToast('Voice not supported in this browser', 'error');
            return;
        }
        if (this.isListening) {
            this.recognition.stop();
            this.isListening = false;
            $('mic-btn').classList.remove('active');
        } else {
            this.recognition.lang = Settings.getLocal().speechLang || 'en-US';
            this.recognition.start();
            this.isListening = true;
            $('mic-btn').classList.add('active');
            showToast('Listening...', '');
        }
    },

    speak(text) {
        if (!window.speechSynthesis) return;
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            showToast('Stopped speaking', '');
            return;
        }
        const clean = text.replace(/```[\s\S]*?```/g, 'code block omitted')
            .replace(/`[^`]+`/g, match => match.slice(1, -1))
            .replace(/[#*_~\[\]]/g, '');
        const utterance = new SpeechSynthesisUtterance(clean);
        const accent = Settings.getLocal().speechLang || 'en-US';
        utterance.lang = accent;
        utterance.rate = 1;
        const voices = window.speechSynthesis.getVoices();
        if (voices.length) {
            const matched = voices.find(v => v.lang === accent) || voices.find(v => v.lang.startsWith(accent)) || voices.find(v => v.lang.startsWith(accent.split('-')[0]));
            if (matched) {
                utterance.voice = matched;
                utterance.lang = matched.lang;
            }
        }
        utterance.onend = () => {
            const btns = document.querySelectorAll('[data-action="speak"]');
            btns.forEach(b => b.classList.remove('active'));
        };
        window.speechSynthesis.speak(utterance);
    },

    stop() {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    },
};
