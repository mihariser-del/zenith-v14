const Chat = {
    chats: {},
    activeId: null,
    isStreaming: false,
    attachments: [],
    abortController: null,

    stop() {
        if (this.abortController) { this.abortController.abort(); this.abortController = null; }
        this.isStreaming = false;
        const btn = $('send-btn');
        if (btn) { btn.style.display = 'flex'; btn.disabled = false; }
        const stopBtn = $('stop-btn');
        if (stopBtn) stopBtn.style.display = 'none';
        const bubble = document.querySelector('.msg-bubble.streaming-cursor');
        if (bubble) bubble.classList.remove('streaming-cursor');
        const thinking = document.querySelector('.thinking-text');
        if (thinking) thinking.textContent = 'Stopped.';
    },

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
        try {
            const { chat } = await api('/api/chats', { method: 'POST' });
            this.chats[chat.id] = chat;
            this.activeId = chat.id;
            this.renderList();
            await this.renderMessages();
        } catch (e) {
            showToast('Failed to create chat: ' + (e.message || 'Unknown error'), 'error');
        }
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
        const ids = Object.keys(this.chats);
        for (const id of ids) {
            try { await api(`/api/chats/${id}`, { method: 'DELETE' }); } catch (e) {}
        }
        this.chats = {};
        this.activeId = null;
        this.renderList();
        await this.create();
        showToast('All chats cleared', 'success');
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
            div.querySelector('[data-action="rename"]').addEventListener('click', async () => {
                const newTitle = await showPrompt('Rename chat', chat.title);
                if (newTitle && newTitle.trim()) this.rename(chat.id, newTitle.trim());
            });
            div.querySelector('[data-action="delete"]').addEventListener('click', async () => {
                const ok = await showConfirm('Delete chat?', 'This will permanently delete this conversation.', true);
                if (ok) this.remove(chat.id);
            });
            list.appendChild(div);
        });
    },

    async switchTo(id) {
        this.activeId = id;
        this.renderList();
        this.renderMessages();
    },

    renderWelcome() {
        return `
        <div class="welcome-message">
            <div class="welcome-z-logo">Z</div>
            <h2>Hello! I'm <span>Zenith.</span></h2>
            <p class="welcome-sub">How can I help you today?</p>
        </div>`;
    },

    async renderMessages() {
        const container = $('chat-container');
        if (!this.activeId) {
            container.innerHTML = this.renderWelcome();
            return;
        }

        const { messages } = await api(`/api/chats/${this.activeId}/messages`);
        container.innerHTML = '';

        if (messages.length === 0) {
            container.innerHTML = this.renderWelcome();
            return;
        }

        messages.forEach(msg => this.appendMessage(msg.role, msg.content));
        container.scrollTop = container.scrollHeight;
    },

    appendMessage(role, content, streaming = false, images = []) {
        const container = $('chat-container');
        const wrapper = document.createElement('div');
        wrapper.className = `msg-wrapper ${role}`;

        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble' + (streaming ? ' streaming-cursor' : '');

        if (streaming) {
            bubble.innerHTML = '<span class="thinking-text">Thinking...</span>';
        } else if (role === 'assistant') {
            bubble.innerHTML = DOMPurify.sanitize(marked.parse(content));
            bubble.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        } else {
            if (images && images.length > 0) {
                images.forEach(src => {
                    const img = document.createElement('img');
                    img.src = src;
                    img.className = 'msg-image';
                    img.alt = 'Attached image';
                    wrapper.appendChild(img);
                });
            }
            if (content && content !== '(image)') {
                bubble.textContent = content;
            } else if (!images || images.length === 0) {
                bubble.textContent = content;
            } else {
                bubble.style.display = 'none';
            }
        }

        wrapper.appendChild(bubble);

        if (role === 'assistant' && !streaming) {
            const actions = document.createElement('div');
            actions.className = 'msg-actions';
            actions.innerHTML = `
                <button data-action="copy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</button>
                <button data-action="speak"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Speak</button>
                <button data-action="download-md"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> .md</button>
                <button data-action="download-html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> .html</button>`;
            actions.querySelector('[data-action="copy"]').addEventListener('click', () => {
                navigator.clipboard.writeText(content);
                showToast('Copied!', 'success');
            });
            actions.querySelector('[data-action="speak"]').addEventListener('click', () => {
                Voice.speak(content);
            });
            actions.querySelector('[data-action="download-md"]').addEventListener('click', () => {
                Chat.downloadAs(content, 'response', 'md');
            });
            actions.querySelector('[data-action="download-html"]').addEventListener('click', () => {
                Chat.downloadAs(content, 'response', 'html');
            });
            wrapper.appendChild(actions);
        }

        container.appendChild(wrapper);
        container.scrollTop = container.scrollHeight;
        return bubble;
    },

    async downloadAs(content, filename, format) {
        try {
            const res = await fetch('/api/generate/document', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, filename, format }),
            });
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${filename}.${format}`;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (e) {
            showToast('Download failed: ' + e.message, 'error');
        }
    },

    updateStreamingBubble(bubble, text) {
        const thinking = bubble.querySelector('.thinking-text');
        if (thinking) thinking.remove();
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
        const research = $('research-btn').classList.contains('active');
        const factcheck = $('factcheck-btn').classList.contains('active');
        let fullContent = text;
        const images = [];
        this.attachments.forEach(att => {
            if (att.type === 'text') fullContent += `\n\n[File: ${att.name}]\n${att.data}`;
            else if (att.type === 'image') images.push(att.data);
        });

        const sendImages = this.attachments.filter(a => a.type === 'image').map(a => a.data);
        const regenBtn = $('regen-btn');
        if (regenBtn) regenBtn.style.display = 'none';
        this.appendMessage('user', text || '(image)', false, sendImages);
        input.value = '';
        input.style.height = 'auto';

        const uploadedFiles = [];
        for (const att of this.attachments) {
            const uploaded = await this.uploadToServer(att);
            if (uploaded) uploadedFiles.push(uploaded);
        }

        this.attachments = [];
        this.renderAtts();

        this.isStreaming = true;
        $('send-btn').style.display = 'none';
        $('stop-btn').style.display = 'flex';
        this.abortController = new AbortController();

        const bubble = this.appendMessage('assistant', '', true);
        let fullResponse = '';

        try {
            const res = await fetch(`/api/chats/${this.activeId}/messages`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: fullContent, images, think, web_search: webSearch, research, factcheck }),
                signal: this.abortController.signal,
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
                        if (parsed.citations) {
                            try {
                                let linked = fullResponse;
                                let idx = 0;
                                linked = linked.replace(/\[(\d+(?:,\s*\d+)*)\]/g, (mm, nums) => {
                                    return nums.split(',').map(n => {
                                        n = n.trim();
                                        const ci = parseInt(n, 10) - 1;
                                        const u = parsed.citations[ci];
                                        if (u && typeof u === 'string' && u.startsWith('http')) {
                                            const label = /^(?:https?:\/\/)?(?:www\.)?([^/]+)/.exec(u);
                                            return `[${label ? label[1] : n}](${u})`;
                                        }
                                        return `[${n}]`;
                                    }).join(' ');
                                });
                                fullResponse = linked;
                                this.updateStreamingBubble(bubble, fullResponse);
                            } catch (e) {
                                fullResponse = fullResponse.replace(/\s*\[\d+(?:,\s*\d+)*\]\s*/g, ' ').trim();
                                this.updateStreamingBubble(bubble, fullResponse);
                            }
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
                actions.innerHTML = `<button data-action="copy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</button><button data-action="speak"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Speak</button><button data-action="download-md"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> .md</button>`;
                actions.querySelector('[data-action="copy"]').addEventListener('click', () => {
                    navigator.clipboard.writeText(fullResponse.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 [$2]'));
                    showToast('Copied!', 'success');
                });
                actions.querySelector('[data-action="speak"]').addEventListener('click', () => {
                    Voice.speak(fullResponse);
                });
                actions.querySelector('[data-action="download-md"]').addEventListener('click', () => {
                    Chat.downloadAs(fullResponse, 'response', 'md');
                });
                bubble.parentElement.appendChild(actions);
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                bubble.querySelector('.thinking-text')?.remove();
                if (!fullResponse) bubble.textContent = 'Stopped.';
                bubble.classList.remove('streaming-cursor');
            } else {
                showToast('Error: ' + err.message, 'error');
                bubble.textContent = 'Error: ' + err.message;
                bubble.classList.remove('streaming-cursor');
            }
        } finally {
            this.isStreaming = false;
            this.abortController = null;
            $('send-btn').style.display = 'flex';
            $('stop-btn').style.display = 'none';
            input.focus();
            this.showRegenerate();
        }
    },

    showRegenerate() {
        const container = $('chat-container');
        let btn = $('regen-btn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'regen-btn';
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Regenerate';
            btn.style.cssText = 'display:flex; align-items:center; gap:6px; margin:8px auto; padding:6px 14px; background:var(--input-bg); border:1px solid var(--border); border-radius:20px; color:#888; cursor:pointer; font-size:12px;';
            btn.addEventListener('click', () => this.regenerate());
            container.appendChild(btn);
        }
        btn.style.display = 'flex';
    },

    async regenerate() {
        if (this.isStreaming || !this.activeId) return;
        const { messages } = await api(`/api/chats/${this.activeId}/messages`);
        if (messages.length < 2) return;

        const lastUserMsg = messages.filter(m => m.role === 'user').pop();
        if (!lastUserMsg) return;

        const container = $('chat-container');
        const lastAssistant = container.querySelector('.msg-wrapper.assistant:last-of-type');
        if (lastAssistant) lastAssistant.remove();
        const existingRegen = $('regen-btn');
        if (existingRegen) existingRegen.style.display = 'none';

        this.isStreaming = true;
        $('send-btn').style.display = 'none';
        $('stop-btn').style.display = 'flex';
        this.abortController = new AbortController();

        const bubble = this.appendMessage('assistant', '', true);
        let fullResponse = '';

        try {
            const res = await fetch(`/api/chats/${this.activeId}/messages`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: lastUserMsg.content, think: $('think-btn').classList.contains('active'), web_search: $('web-btn').classList.contains('active'), research: $('research-btn').classList.contains('active'), factcheck: $('factcheck-btn').classList.contains('active') }),
                signal: this.abortController.signal,
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
            if (fullResponse) this.showRegenerate();
        } catch (err) {
            if (err.name !== 'AbortError') showToast('Error: ' + err.message, 'error');
            else bubble.textContent = 'Stopped.';
        } finally {
            this.isStreaming = false;
            this.abortController = null;
            $('send-btn').style.display = 'flex';
            $('stop-btn').style.display = 'none';
        }
    },

    async handleFiles(files) {
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            if (file.type.startsWith('image/')) {
                reader.onload = e => {
                    this.attachments.push({ name: file.name, type: 'image', data: e.target.result, file });
                    this.renderAtts();
                };
                reader.readAsDataURL(file);
            } else {
                reader.onload = e => {
                    this.attachments.push({ name: file.name, type: 'text', data: e.target.result, file });
                    this.renderAtts();
                };
                reader.readAsText(file);
            }
        });
    },

    async uploadToServer(att) {
        if (!att.file) return null;
        const form = new FormData();
        form.append('file', att.file);
        if (this.activeId) form.append('chat_id', this.activeId);
        try {
            const res = await fetch('/api/files/upload', { method: 'POST', credentials: 'same-origin', body: form });
            const data = await res.json();
            return data.file || null;
        } catch { return null; }
    },

    renderAtts() {
        const bar = $('att-bar');
        bar.innerHTML = '';
        if (this.attachments.length === 0) { bar.classList.remove('has-items'); return; }
        bar.classList.add('has-items');
        this.attachments.forEach((att, i) => {
            const div = document.createElement('div');
            div.className = 'att-preview';
            if (att.type === 'image') {
                div.innerHTML = `<img src="${att.data}" alt="${att.name}"><button class="remove-att" data-i="${i}">\u2715</button>`;
            } else {
                div.innerHTML = `<div class="file-chip">\uD83D\uDCC4 ${this.escapeHtml(att.name)}<button class="remove-att" data-i="${i}" style="position:static; background:transparent; color:#888; font-size:14px; width:auto; height:auto; margin-left:6px;">\u2715</button></div>`;
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
