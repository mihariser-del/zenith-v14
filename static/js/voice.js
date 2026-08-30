const Voice = {
    recognition: null,
    isListening: false,
    voiceToVoice: false,

    voiceModeActive: false,
    voiceModeRecognition: null,

    init() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            $('mic-btn').style.display = 'none';
            return;
        }
        this.recognition = new SR();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = Settings.getLocal().speechLang || 'en-GB';
        this.recognition.onresult = (e) => {
            const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
            $('user-input').value = transcript;
            $('user-input').dispatchEvent(new Event('input'));
            if (this.voiceModeActive) {
                const t = $('voice-transcript');
                if (t) t.textContent = transcript;
            }
        };
        this.recognition.onend = () => {
            const wasListening = this.isListening;
            this.isListening = false;
            $('mic-btn').classList.remove('active');
            if (this.voiceModeActive) {
                const orb = $('voice-orb');
                if (orb) orb.classList.remove('listening');
                if (wasListening) {
                    const txt = $('user-input').value.trim() || ($('voice-transcript') ? $('voice-transcript').textContent.trim() : '');
                    if (txt) {
                        $('user-input').value = txt;
                        this.voiceToVoice = true;
                        setTimeout(() => this.sendVoiceMode(txt), 300);
                    } else {
                        setTimeout(() => this.startVoiceModeListening(), 500);
                    }
                }
                return;
            }
            if (wasListening && $('user-input').value.trim()) {
                this.voiceToVoice = true;
                setTimeout(() => Chat.send(), 300);
            }
        };
        this.recognition.onerror = (e) => {
            if (e.error !== 'no-speech') {
                showToast('Voice error: ' + e.error, 'error');
            }
            this.isListening = false;
            $('mic-btn').classList.remove('active');
            if (this.voiceModeActive) {
                const orb = $('voice-orb');
                if (orb) orb.classList.remove('listening');
                setTimeout(() => this.startVoiceModeListening(), 1000);
            }
        };
        // Load voices for en-GB default
        if (window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = () => {
                const voices = window.speechSynthesis.getVoices();
                const enGB = voices.find(v => v.lang === 'en-GB') || voices.find(v => v.lang.startsWith('en-GB'));
                if (enGB) console.log('Voice ready:', enGB.name);
            };
        }
        // Right-click mic → voice mode (center bubble like ChatGPT)
        const micBtn = $('mic-btn');
        if (micBtn) {
            micBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.openVoiceMode();
            });
            // Also long-press for mobile
            let pressTimer = null;
            micBtn.addEventListener('touchstart', (e) => {
                pressTimer = setTimeout(() => this.openVoiceMode(), 600);
            });
            micBtn.addEventListener('touchend', () => { if (pressTimer) clearTimeout(pressTimer); });
        }
        // Voice mode modal controls
        const vmClose = $('voice-mode-close');
        if (vmClose) vmClose.addEventListener('click', () => this.closeVoiceMode());
        const vmMic = $('voice-mode-mic');
        if (vmMic) vmMic.addEventListener('click', () => {
            if (this.isListening) {
                this.recognition.stop();
            } else {
                this.startVoiceModeListening();
            }
        });
        const vmModal = $('voice-mode-modal');
        if (vmModal) vmModal.addEventListener('click', (e) => { if (e.target === vmModal) this.closeVoiceMode(); });
    },

    openVoiceMode() {
        const modal = $('voice-mode-modal');
        if (!modal) return;
        this.voiceModeActive = true;
        modal.style.display = 'flex';
        const status = $('voice-status');
        if (status) status.textContent = 'Listening... speak naturally';
        const transcript = $('voice-transcript');
        if (transcript) transcript.textContent = '';
        setTimeout(() => this.startVoiceModeListening(), 300);
        showToast('Voice mode — right-click mic to start, speak, AI will reply by voice', '');
    },
    closeVoiceMode() {
        const modal = $('voice-mode-modal');
        if (modal) modal.style.display = 'none';
        this.voiceModeActive = false;
        this.isListening = false;
        try { this.recognition.stop(); } catch {}
        $('mic-btn').classList.remove('active');
        const orb = $('voice-orb');
        if (orb) { orb.classList.remove('listening'); orb.classList.remove('speaking'); }
        window.speechSynthesis.cancel();
    },
    startVoiceModeListening() {
        if (!this.voiceModeActive) return;
        if (this.isListening) return;
        try {
            this.recognition.lang = Settings.getLocal().speechLang || 'en-GB';
            this.recognition.start();
            this.isListening = true;
            $('mic-btn').classList.add('active');
            const orb = $('voice-orb');
            if (orb) { orb.classList.add('listening'); orb.classList.remove('speaking'); }
            const status = $('voice-status');
            if (status) status.textContent = 'Listening...';
        } catch (e) { showToast('Mic busy, try again', 'error'); }
    },
    async sendVoiceMode(text) {
        const status = $('voice-status');
        const orb = $('voice-orb');
        if (status) status.textContent = 'Thinking...';
        if (orb) { orb.classList.remove('listening'); }
        // Ensure chat exists
        if (!Chat.activeId) await Chat.create();
        $('user-input').value = text;
        // Use Chat.send but capture response for voice
        const beforeCount = document.querySelectorAll('.msg-wrapper.assistant').length;
        await Chat.send();
        // Wait for AI to finish, then speak
        const checkDone = setInterval(() => {
            if (!Chat.isStreaming) {
                clearInterval(checkDone);
                const msgs = document.querySelectorAll('.msg-wrapper.assistant');
                if (msgs.length > beforeCount) {
                    const last = msgs[msgs.length - 1];
                    const txt = last.querySelector('.msg-bubble') ? last.querySelector('.msg-bubble').textContent : '';
                    if (txt) {
                        if (status) status.textContent = 'Speaking...';
                        if (orb) orb.classList.add('speaking');
                        this.speak(txt, true);
                        // When speaking ends, go back to listening
                        const utterCheck = setInterval(() => {
                            if (!window.speechSynthesis.speaking) {
                                clearInterval(utterCheck);
                                if (this.voiceModeActive) {
                                    if (orb) orb.classList.remove('speaking');
                                    if (status) status.textContent = 'Listening...';
                                    setTimeout(() => this.startVoiceModeListening(), 600);
                                }
                            }
                        }, 300);
                    } else {
                        if (this.voiceModeActive) setTimeout(() => this.startVoiceModeListening(), 600);
                    }
                } else {
                    if (this.voiceModeActive) setTimeout(() => this.startVoiceModeListening(), 600);
                }
            }
        }, 500);
        // Fallback if no response after 30s
        setTimeout(() => clearInterval(checkDone), 30000);
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
            this.recognition.lang = Settings.getLocal().speechLang || 'en-GB';
            this.recognition.start();
            this.isListening = true;
            $('mic-btn').classList.add('active');
            showToast('Listening (English UK)...', '');
        }
    },

    speak(text, isAuto = false) {
        if (!window.speechSynthesis) return;
        if (!isAuto && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            showToast('Stopped speaking', '');
            return;
        }
        const clean = text.replace(/```[\s\S]*?```/g, 'code block omitted')
            .replace(/`[^`]+`/g, match => match.slice(1, -1))
            .replace(/[#*_~\[\]]/g, '');
        if (!clean.trim()) return;
        const utterance = new SpeechSynthesisUtterance(clean);
        const accent = Settings.getLocal().speechLang || 'en-GB';
        utterance.lang = accent;
        utterance.rate = 1;
        utterance.pitch = 1;
        const voices = window.speechSynthesis.getVoices();
        if (voices.length) {
            let matched = voices.find(v => v.lang === 'en-GB') || voices.find(v => v.lang === accent) || voices.find(v => v.lang.startsWith('en-GB')) || voices.find(v => v.lang.startsWith(accent)) || voices.find(v => v.lang.startsWith(accent.split('-')[0]));
            if (matched) {
                utterance.voice = matched;
                utterance.lang = matched.lang;
            }
        }
        utterance.onend = () => {
            const btns = document.querySelectorAll('[data-action="speak"]');
            btns.forEach(b => b.classList.remove('active'));
            if (isAuto) this.voiceToVoice = false;
        };
        utterance.onerror = () => { if (isAuto) this.voiceToVoice = false; };
        window.speechSynthesis.speak(utterance);
        if (isAuto) {
            // Auto voice-to-voice: after AI speaks, go back to listening
            utterance.onend = () => {
                const btns = document.querySelectorAll('[data-action="speak"]');
                btns.forEach(b => b.classList.remove('active'));
                this.voiceToVoice = false;
                showToast('Voice reply done — tap mic for next', '');
            };
        }
    },

    stop() {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    },
};
