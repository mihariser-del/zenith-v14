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
            this.recognition.lang = Settings.get().speechLang || 'en-US';
            this.recognition.start();
            this.isListening = true;
            $('mic-btn').classList.add('active');
        }
    },

    speak(text) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const clean = text.replace(/```[\s\S]*?```/g, 'code block omitted')
            .replace(/`[^`]+`/g, match => match.slice(1, -1))
            .replace(/[#*_~\[\]]/g, '');
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.lang = Settings.get().speechLang || 'en-US';
        utterance.rate = 1;
        window.speechSynthesis.speak(utterance);
    },
};
