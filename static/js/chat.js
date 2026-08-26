const Chat = {
    chats: {},
    activeId: null,
    isStreaming: false,
    attachments: [],

    async init() {
        const { chats } = await api('/api/chats');
        this.chats = {};
        chats.forEach(c => this.chats[c.id] = c);

        if (chats.length === 0) {
            await this.create();
        } else {
            this.activeId = chats[0].id;
            this.renderList();
            this.renderMessages();
        }
    },

    async create() {
        const { chat } = await api('/api/chats', { method: 'POST' });
        this.chats[chat.id] = chat;
        this.activeId = chat.id;
        this.renderList();
        this.renderMessages();
    },

    async rename(id, title) {
        const { chat } = await api(`/api/chats/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ title }),
        });
        this.chats[id] = chat;
        this.renderList();
    },

    async remove(id) {
        await api(`/api/chats/${id}`, { method: 'DELETE' });
        delete this.chats[id];
        if (this.activeId === id) {
            await this.create();
        } else {
            this.renderList();
        }
    },

    async clearAll() {
        for (const id of Object.keys(this.chats)) {
            await api(`/api/chats/${id}`, { method: 'DELETE' });
        }
        this.chats = {};
        await this.create();
    },

    renderList() {
        const list = $('chat-list');
        list.innerHTML = '';
        const sorted = Object.values(this.chats).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        sorted.forEach(chat => {
            const div = document.createElement('div');
            div.className = `chat-item ${chat.id === this.activeId ? 'active' : ''}`;
            div.innerHTML = `
                <span class="title">${this.escapeHtml(chat.title)}</span>
                <div class="actions">
                    <button data-action="rename" data-id="${chat.id}">Edit</button>
                    <button data-action="delete" data-id="${chat.id}">Del</button>
                </div>`;
            div.addEventListener('click', (e) => {
                if (e.target.closest('[data-action]')) return;
                this.switchTo(chat.id);
            });
            div.querySelector('[data-action="rename"]').addEventListener('click', () => {
                const newTitle = prompt('Rename chat:', chat.title);
                if (newTitle && newTitle.trim()) this.rename(chat.id, newTitle.trim());
            });
            div.querySelector('[data-action="delete"]').addEventListener('click', () => {
                if (confirm('Delete this chat permanently?')) this.remove(chat.id);
            });
            list.appendChild(div);
        });
    },

    async switchTo(id) {
        this.activeId = id;
        this.renderList();
        this.renderMessages();
    },

    async renderMessages() {
        const container = $('chat-container');
        if (!this.activeId) {
            container.innerHTML = `<div class="welcome-message"><div class="big-icon">&#x1F680;</div><h2>Welcome to Zenith</h2><p>Your AI assistant.</p><p>Click "Think" for deeper reasoning mode.</p></div>`;
            return;
        }

        const { messages } = await api(`/api/chats/${this.activeId}/messages`);
        container.innerHTML = '';

        if (messages.length === 0) {
            container.innerHTML = `<div class="welcome-message"><div class="big-icon">&#x1F680;</div><h2>Welcome to Zenith</h2><p>Your AI assistant.</p><p>Click "Think" for deeper reasoning mode.</p></div>`;
            return;
        }

        messages.forEach(msg => this.appendMessage(msg.role, msg.content));
        container.scrollTop = container.scrollHeight;
    },

    appendMessage(role, content, streaming = false) {
        const container = $('chat-container');
        const wrapper = document.createElement('div');
        wrapper.className = `msg-wrapper ${role}`;

        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble' + (streaming ? ' streaming-cursor' : '');

        if (role === 'assistant') {
            bubble.innerHTML = DOMPurify.sanitize(marked.parse(content));
            bubble.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        } else {
            bubble.textContent = content;
        }

        wrapper.appendChild(bubble);

        if (role === 'assistant' && !streaming) {
            const actions = document.createElement('div');
            actions.className = 'msg-actions';
            actions.innerHTML = `
                <button data-action="copy">Copy</button>
                <button data-action="speak">Speak</button>`;
            actions.querySelector('[data-action="copy"]').addEventListener('click', () => {
                navigator.clipboard.writeText(content);
                showToast('Copied!', 'success');
            });
            actions.querySelector('[data-action="speak"]').addEventListener('click', () => {
                Voice.speak(content);
            });
            wrapper.appendChild(actions);
        }

        container.appendChild(wrapper);
        container.scrollTop = container.scrollHeight;
        return bubble;
    },

    updateStreamingBubble(bubble, text) {
        bubble.innerHTML = DOMPurify.sanitize(marked.parse(text));
        bubble.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        const container = $('chat-container');
        container.scrollTop = container.scrollHeight;
    },

    async send() {
        const input = $('user-input');
        const text = input.value.trim();
        if ((!text && this.attachments.length === 0) || this.isStreaming) return;
        if (!this.activeId) await this.create();

        const think = $('think-btn').classList.contains('active');
        const webSearch = $('web-btn').classList.contains('active');
        let fullContent = text;
        const images = [];
        this.attachments.forEach(att => {
            if (att.type === 'text') fullContent += `\n\n[File: ${att.name}]\n${att.data}`;
            else if (att.type === 'image') images.push(att.data);
        });

        this.appendMessage('user', text || '(image)');
        input.value = '';
        input.style.height = 'auto';
        this.attachments = [];
        this.renderAtts();

        this.isStreaming = true;
        $('send-btn').disabled = true;

        const bubble = this.appendMessage('assistant', '', true);
        let fullResponse = '';

        try {
            const res = await fetch(`/api/chats/${this.activeId}/messages`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: fullContent, images, think, web_search: webSearch }),
            });

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.token) {
                            fullResponse += parsed.token;
                            this.updateStreamingBubble(bubble, fullResponse);
                        }
                        if (parsed.error) {
                            showToast(parsed.error, 'error');
                            bubble.textContent = 'Error: ' + parsed.error;
                            bubble.classList.remove('streaming-cursor');
                        }
                    } catch (e) {}
                }
            }

            bubble.classList.remove('streaming-cursor');
            if (fullResponse) {
                this.updateStreamingBubble(bubble, fullResponse);
                // Add action buttons
                const actions = document.createElement('div');
                actions.className = 'msg-actions';
                actions.innerHTML = `<button data-action="copy">Copy</button><button data-action="speak">Speak</button>`;
                actions.querySelector('[data-action="copy"]').addEventListener('click', () => {
                    navigator.clipboard.writeText(fullResponse);
                    showToast('Copied!', 'success');
                });
                actions.querySelector('[data-action="speak"]').addEventListener('click', () => {
                    Voice.speak(fullResponse);
                });
                bubble.parentElement.appendChild(actions);
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
            bubble.textContent = 'Error: ' + err.message;
            bubble.classList.remove('streaming-cursor');
        } finally {
            this.isStreaming = false;
            $('send-btn').disabled = false;
            input.focus();
        }
    },

    async regenerate() {
        if (this.isStreaming || !this.activeId) return;
        const { messages } = await api(`/api/chats/${this.activeId}/messages`);
        if (messages.length < 2) return;

        const lastUserMsg = messages.filter(m => m.role === 'user').pop();
        if (!lastUserMsg) return;

        // Remove last assistant message from display
        const container = $('chat-container');
        const lastAssistant = container.querySelector('.msg-wrapper.assistant:last-of-type');
        if (lastAssistant) lastAssistant.remove();

        this.isStreaming = true;
        $('send-btn').disabled = true;

        const bubble = this.appendMessage('assistant', '', true);
        let fullResponse = '';

        try {
            const res = await fetch(`/api/chats/${this.activeId}/messages`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: lastUserMsg.content, think: $('think-btn').classList.contains('active'), web_search: $('web-btn').classList.contains('active') }),
            });

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.token) {
                            fullResponse += parsed.token;
                            this.updateStreamingBubble(bubble, fullResponse);
                        }
                        if (parsed.error) {
                            showToast(parsed.error, 'error');
                        }
                    } catch (e) {}
                }
            }

            bubble.classList.remove('streaming-cursor');
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            this.isStreaming = false;
            $('send-btn').disabled = false;
        }
    },

    handleFiles(files) {
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            if (file.type.startsWith('image/')) {
                reader.onload = e => {
                    this.attachments.push({ name: file.name, type: 'image', data: e.target.result });
                    this.renderAtts();
                };
                reader.readAsDataURL(file);
            } else {
                reader.onload = e => {
                    this.attachments.push({ name: file.name, type: 'text', data: e.target.result });
                    this.renderAtts();
                };
                reader.readAsText(file);
            }
        });
    },

    renderAtts() {
        const bar = $('att-bar');
        if (this.attachments.length === 0) { bar.style.display = 'none'; return; }
        bar.style.display = 'flex';
        bar.innerHTML = '';
        this.attachments.forEach((att, i) => {
            const div = document.createElement('div');
            div.className = 'att-preview';
            if (att.type === 'image') {
                div.innerHTML = `<img src="${att.data}"><button class="remove-att" data-i="${i}">X</button>`;
            } else {
                div.innerHTML = `<div class="file-chip">${att.name}<button class="remove-att" data-i="${i}">X</button></div>`;
            }
            div.querySelector('.remove-att').addEventListener('click', () => {
                this.attachments.splice(i, 1);
                this.renderAtts();
            });
            bar.appendChild(div);
        });
    },

    exportChat() {
        if (!this.activeId) return;
        const chat = this.chats[this.activeId];
        const container = $('chat-container');
        const msgs = container.querySelectorAll('.msg-wrapper');
        let md = `# ${chat.title}\n\n`;
        msgs.forEach(m => {
            const role = m.classList.contains('user') ? '**You**' : '**Zenith**';
            const text = m.querySelector('.msg-bubble').textContent;
            md += `${role}:\n${text}\n\n`;
        });
        const blob = new Blob([md], { type: 'text/markdown' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${chat.title.replace(/[^a-z0-9]/gi, '_')}.md`;
        a.click();
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
};
