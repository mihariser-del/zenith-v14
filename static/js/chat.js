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

    initScrollButton() {
        const container = document.getElementById('chat-container');
        if (!container) return;
        let btn = document.getElementById('scroll-down-btn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'scroll-down-btn';
            btn.setAttribute('aria-label', 'Scroll to bottom');
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
            const main = document.getElementById('main');
            (main || container.parentElement).appendChild(btn);
        }
        const toggle = () => {
            if (container.scrollTop + container.clientHeight < container.scrollHeight - 100) {
                btn.style.display = 'flex';
            } else {
                btn.style.display = 'none';
            }
        };
        container.addEventListener('scroll', toggle);
        btn.addEventListener('click', () => { container.scrollTop = container.scrollHeight; });
        toggle();
    },

    async init() {
        this.initScrollButton();
        const { chats } = await api('/api/chats');
        this.chats = {};
        chats.forEach(c => this.chats[c.id] = c);

        // ChatGPT-style deep link: /app/c/<link_id> or ?chat=<link_id>
        const pathMatch = window.location.pathname.match(/\/app\/c\/([0-9a-f]+)/i);
        const queryMatch = new URLSearchParams(window.location.search).get('chat');
        const targetLink = (pathMatch ? pathMatch[1] : null) || (queryMatch && queryMatch.toLowerCase()) || null;

        if (targetLink) {
            let found = Object.values(this.chats).find(c => (c.link_id || '').toLowerCase() === targetLink);
            if (!found) {
                // Linked chat not in the already-loaded list — fetch it directly
                try {
                    const { chat } = await api(`/api/chats/by-link/${encodeURIComponent(targetLink)}`);
                    this.chats[chat.id] = chat;
                    found = chat;
                } catch (e) {}
            }
            if (found) {
                this.activeId = found.id;
                this.renderList();
                this.renderMessages();
                return;
            }
        }

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
            this.syncUrl();
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
        const all = Object.values(this.chats).sort((a, b) => {
            if ((a.pinned ? 1 : 0) !== (b.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
            return new Date(b.updated_at) - new Date(a.updated_at);
        });
        const pinned = all.filter(c => c.pinned);
        const folders = {};
        const unfiled = [];
        all.filter(c => !c.pinned).forEach(c => {
            const f = (c.folder || '').trim();
            if (f) (folders[f] = folders[f] || []).push(c);
            else unfiled.push(c);
        });
        const renderGroup = (groupEl, items) => {
            items.forEach(chat => {
                const div = document.createElement('div');
                div.className = `chat-item ${chat.id === this.activeId ? 'active' : ''}`;
                div.title = chat.title;
                div.innerHTML = `
                <span class="title">${this.escapeHtml(chat.title)}</span>
                <div class="actions">
                    <button data-action="pin" data-id="${chat.id}" title="${chat.pinned ? 'Unpin' : 'Pin chat'}">${chat.pinned ? '📌' : '📍'}</button>
                    <button data-action="share" data-id="${chat.id}" title="Share or export this chat">🔗</button>
                    <button data-action="folder" data-id="${chat.id}" title="Move to folder">🗂️</button>
                    <button data-action="rename" data-id="${chat.id}" title="Rename">✏️</button>
                    <button data-action="delete" data-id="${chat.id}" title="Delete">🗑️</button>
                </div>`;
                div.addEventListener('click', (e) => {
                    if (e.target.closest('[data-action]')) return;
                    this.switchTo(chat.id);
                });
                div.querySelector('[data-action="pin"]').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        const { chat: c } = await api(`/api/chats/${chat.id}/prefs`, {
                            method: 'PATCH',
                            body: JSON.stringify({ pinned: !chat.pinned }),
                        });
                        this.chats[chat.id] = c;
                        this.renderList();
                        showToast(c.pinned ? 'Chat pinned' : 'Chat unpinned', 'success');
                    } catch (err) { showToast(err.message || 'Failed', 'error'); }
                });
                div.querySelector('[data-action="folder"]').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const name = await showPrompt('Move to folder', chat.folder || '', 'Folder name (leave empty to remove)');
                    if (name === null) return;
                    try {
                        const { chat: c } = await api(`/api/chats/${chat.id}/prefs`, {
                            method: 'PATCH',
                            body: JSON.stringify({ folder: name.trim() }),
                        });
                        this.chats[chat.id] = c;
                        this.renderList();
                    } catch (err) { showToast(err.message || 'Failed', 'error'); }
                });
                div.querySelector('[data-action="share"]').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    this.showShareExport(chat);
                });
                div.querySelector('[data-action="rename"]').addEventListener('click', async () => {
                    const newTitle = await showPrompt('Rename chat', chat.title);
                    if (newTitle && newTitle.trim()) this.rename(chat.id, newTitle.trim());
                });
                div.querySelector('[data-action="delete"]').addEventListener('click', async () => {
                    const ok = await showConfirm('Delete chat?', 'This will permanently delete this conversation.', true);
                    if (ok) this.remove(chat.id);
                });
                groupEl.appendChild(div);
            });
        };
        if (pinned.length) {
            const sec = document.createElement('div');
            sec.className = 'chat-group';
            sec.innerHTML = `<div class="chat-group-tag">📌 Pinned</div>`;
            const inner = document.createElement('div');
            renderGroup(inner, pinned);
            sec.appendChild(inner);
            list.appendChild(sec);
        }
        Object.keys(folders).sort().forEach(f => {
            const sec = document.createElement('div');
            sec.className = 'chat-group';
            sec.innerHTML = `<div class="chat-group-tag">🗂️ ${this.escapeHtml(f)}</div>`;
            const inner = document.createElement('div');
            renderGroup(inner, folders[f]);
            sec.appendChild(inner);
            list.appendChild(sec);
        });
        if (unfiled.length || (!pinned.length && !Object.keys(folders).length)) {
            renderGroup(list, unfiled);
        }
    },

    async switchTo(id) {
        this.activeId = id;
        this.renderList();
        this.renderHeader();
        this._wireHeader();
        this.renderMessages();
        this.syncUrl();
    },

    syncUrl() {
        // Keep the address bar in sync: https://<host>/app/c/<link_id>
        const chat = this.activeId ? this.chats[this.activeId] : null;
        const linkId = chat && chat.link_id ? chat.link_id : '';
        try {
            if (linkId) {
                const url = window.location.origin + '/app/c/' + linkId;
                window.history.replaceState({ chatId: this.activeId }, document.title, url);
            } else {
                window.history.replaceState({}, document.title, window.location.origin + '/app');
            }
        } catch (e) {}
    },

    renderHeader() {
        const header = $('chat-header');
        if (!header) return;
        const chat = this.activeId ? this.chats[this.activeId] : null;
        if (!chat) {
            header.style.display = 'none';
            return;
        }
        header.style.display = 'flex';
        $('chat-header-title').textContent = chat.title || 'Chat';
        const modelSel = $('chat-model-select');
        if (modelSel && modelSel.value !== (chat.model || '')) {
            modelSel.value = chat.model || '';
        }
        const pinBtn = $('chat-pin-btn');
        if (pinBtn) {
            pinBtn.textContent = chat.pinned ? '📌' : '📍';
            pinBtn.style.background = chat.pinned ? 'rgba(76,201,240,.18)' : 'transparent';
        }
        const shareBtn = $('chat-share-btn');
        if (shareBtn) shareBtn.textContent = chat.share_id ? '🔗 Shared' : 'Share';
    },

    _wireHeader() {
        if (this._headerWired) return;
        this._headerWired = true;
        const createTarget = () => this.activeId;
        $('chat-pin-btn').addEventListener('click', async () => {
            const id = createTarget();
            if (!id) return;
            const chat = this.chats[id];
            if (!chat) return;
            try {
                const { chat: c } = await api(`/api/chats/${id}/prefs`, {
                    method: 'PATCH',
                    body: JSON.stringify({ pinned: !chat.pinned }),
                });
                this.chats[id] = c;
                this.renderList();
                this.renderHeader();
            } catch (err) { showToast(err.message || 'Failed', 'error'); }
        });
        $('chat-share-btn').addEventListener('click', () => {
            const id = createTarget();
            if (!id) return;
            this.showShareExport(this.chats[id]);
        });
        $('chat-model-select').addEventListener('change', async (e) => {
            const id = createTarget();
            if (!id) return;
            const val = e.target.value;
            try {
                const { chat: c } = await api(`/api/chats/${id}/prefs`, {
                    method: 'PATCH',
                    body: JSON.stringify({ model: val }),
                });
                this.chats[id] = c;
            } catch (err) { showToast(err.message || 'Failed', 'error'); }
        });
    },

    // Beautiful Share & Export modal (per-chat)
    showShareExport(chat) {
        const overlay = $('share-export-modal');
        if (!overlay) {
            showToast('Share & export unavailable', 'error');
            return;
        }
        const close = () => { overlay.style.display = 'none'; document.body.style.overflow = ''; };
        const titleEl = overlay.querySelector('.sx-title');
        const tabs = overlay.querySelectorAll('.sx-tab');
        const panels = { share: overlay.querySelector('#sx-share-panel'), export: overlay.querySelector('#sx-export-panel') };
        titleEl.textContent = chat.title || 'Chat';
        const setTab = (name) => {
            tabs.forEach(t => { t.classList.toggle('active', t.dataset.tab === name); });
            panels.share.style.display = name === 'share' ? 'block' : 'none';
            panels.export.style.display = name === 'export' ? 'block' : 'none';
            if (name === 'share') this._refreshSharePanel(chat);
        };
        tabs.forEach(t => t.onclick = () => setTab(t.dataset.tab));
        overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
        overlay.querySelector('#sx-export-txt').onclick = () => this.exportChat(chat, 'txt');
        overlay.querySelector('#sx-export-md').onclick = () => this.exportChat(chat, 'md');
        overlay.querySelector('#sx-export-pdf').onclick = () => this.exportChatPDF(chat);
        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        setTab('share');
    },

    _refreshSharePanel(chat) {
        const overlay = $('share-export-modal');
        const linkBox = overlay.querySelector('#sx-link');
        const statusEl = overlay.querySelector('#sx-share-status');
        const unshareBtn = overlay.querySelector('#sx-unshare');
        const shareBtn = overlay.querySelector('#sx-create-share');
        const socials = overlay.querySelector('#sx-socials');
        const previewBtn = overlay.querySelector('#sx-preview');
        if (chat.share_id && chat.share_id !== '') {
            const url = window.location.origin + '/s/' + chat.share_id;
            linkBox.value = url;
            statusEl.textContent = '🌍 Live publicly — anyone with the link can view.';
            statusEl.style.color = '#4CC9F0';
            shareBtn.style.display = 'none';
            unshareBtn.style.display = 'inline-flex';
            socials.style.display = 'flex';
            previewBtn.style.display = 'inline-flex';
            previewBtn.onclick = () => window.open(url, '_blank');
            socials.querySelector('[data-soc="twitter"]').onclick = () => {
                window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent('Check out this chat on Zenith: ' + url)}`, '_blank', 'noopener,width=600,height=450');
            };
            socials.querySelector('[data-soc="whatsapp"]').onclick = () => {
                window.open(`https://wa.me/?text=${encodeURIComponent('Check out this chat on Zenith: ' + url)}`, '_blank', 'noopener');
            };
            socials.querySelector('[data-soc="telegram"]').onclick = () => {
                window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Check out this chat on Zenith')}`, '_blank', 'noopener');
            };
            socials.querySelector('[data-soc="facebook"]').onclick = () => {
                window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'noopener');
            };
        } else {
            linkBox.value = '';
            linkBox.placeholder = 'Click "Create share link" to go live…';
            statusEl.textContent = 'Share a read-only, beautifully presented copy of this chat.';
            statusEl.style.color = 'var(--muted)';
            shareBtn.style.display = 'inline-flex';
            unshareBtn.style.display = 'none';
            socials.style.display = 'none';
            previewBtn.style.display = 'none';
        }
        const copyBtn = overlay.querySelector('#sx-copy');
        copyBtn.onclick = () => {
            if (!linkBox.value) { showToast('Create a share link first', 'error'); return; }
            navigator.clipboard.writeText(linkBox.value).then(() => showToast('Link copied!', 'success')).catch(() => showToast('Copy failed', 'error'));
        };
        shareBtn.onclick = async () => {
            try {
                const { link, share_id } = await api(`/api/chats/${chat.id}/share`, { method: 'POST' });
                this.chats[chat.id].share_id = share_id;
                linkBox.value = link;
                this._refreshSharePanel(this.chats[chat.id]);
                this.renderHeader();
                showToast('Chat is now live!', 'success');
            } catch (err) { showToast(err.message || 'Failed', 'error'); }
        };
        unshareBtn.onclick = async () => {
            try {
                await api(`/api/chats/${chat.id}/unshare`, { method: 'POST' });
                this.chats[chat.id].share_id = null;
                this._refreshSharePanel(this.chats[chat.id]);
                this.renderHeader();
                showToast('Share link removed', 'success');
            } catch (err) { showToast(err.message || 'Failed', 'error'); }
        };
    },

    async exportChat(chat, format) {
        try {
            const res = await fetch(`/api/chats/${chat.id}/export?format=${format}`, { credentials: 'same-origin' });
            if (!res.ok) {
                let detail = '';
                try { const j = await res.json(); detail = (j && j.detail) || ''; } catch (e) {}
                showToast('Export failed: ' + detail, 'error');
                return;
            }
            const blob = await res.blob();
            const a = document.createElement('a');
            const safe = (chat.title || 'chat').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
            a.href = URL.createObjectURL(blob);
            a.download = `${safe}.${format}`;
            a.click();
            URL.revokeObjectURL(a.href);
            showToast('Exported as ' + format.toUpperCase(), 'success');
        } catch (e) { showToast('Export failed: ' + e.message, 'error'); }
    },

    exportChatPDF(chat) {
        const overlay = $('pdf-export-modal');
        if (!overlay) { showToast('PDF export unavailable', 'error'); return; }
        (async () => {
            try {
                const { messages } = await api(`/api/chats/${chat.id}/messages`);
                const review = overlay.querySelector('#pdf-preview');
                review.innerHTML = `<div class="pdf-doc">
                    <div class="pdf-brand"><span class="pdf-logo">Z</span> Zenith · ${this.escapeHtml(chat.title || 'Chat')}</div>
                    ${messages.map((m, i) => {
                        const isUser = m.role === 'user';
                        return `<div class="pdf-msg ${isUser ? 'is-user' : ''}">
                            <div class="pdf-msg-role">${isUser ? 'You' : 'Zenith'}</div>
                            <div class="pdf-msg-body">${this.escapeHtml(m.content).replace(/\n/g, '<br>')}</div>
                        </div>`;
                    }).join('')}
                </div>`;
                document.body.style.overflow = 'hidden';
                overlay.style.display = 'flex';
                overlay.querySelector('#pdf-close').onclick = () => { overlay.style.display = 'none'; document.body.style.overflow = ''; };
                overlay.querySelector('#pdf-print').onclick = () => {
                    const printWin = window.open('', '_blank', 'width=900,height=1000');
                    if (!printWin) { showToast('Popup blocked — allow popups to print', 'error'); return; }
                    const html = `<html><head><title>${(chat.title || 'Zenith Chat')} — Export</title>
                        <style>
                            body{font-family:Georgia,'Times New Roman',serif;max-width:800px;margin:40px auto;padding:0 24px;color:#1a1a1a;line-height:1.7;}
                            .b{display:flex;align-items:center;gap:12px;border-bottom:2px solid #4CC9F0;padding-bottom:12px;margin-bottom:28px;}
                            .l{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#4CC9F0,#6A5CFF);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;}
                            h1{font-size:26px;margin:0;}
                            .m{margin:18px 0;padding:14px 18px;border-radius:12px;background:#f4f6f8;}
                            .m.u{background:#eef7fd;border-left:3px solid #4CC9F0;}
                            .r{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;margin-bottom:6px;}
                            .c{white-space:pre-wrap;}
                        </style></head><body>
                        <div class="b"><div class="l">Z</div><h1>${this.escapeHtml(chat.title || 'Zenith Chat')}</h1></div>
                        ${messages.map(m => `<div class="m ${m.role === 'user' ? 'u' : ''}"><div class="r">${m.role === 'user' ? 'You' : 'Zenith'}</div><div class="c">${this.escapeHtml(m.content)}</div></div>`).join('')}
                        <div style="margin-top:30px;font-size:11px;color:#9ca3af;text-align:center;">Exported from Zenith — ${new Date().toLocaleString()}</div>
                        </body></html>`;
                    printWin.document.write(html);
                    printWin.document.close();
                    printWin.focus();
                    setTimeout(() => printWin.print(), 400);
                };
            } catch (e) { showToast('Failed to load chat: ' + e.message, 'error'); }
        })();
    },

    renderWelcome() {
        if (Object.keys(this.chats).length > 0 && this.activeId) {
            // Not a brand-new user — keep the classic welcome
            return `
            <div class="welcome-message">
                <div class="welcome-z-logo">Z</div>
                <h2>Hello! I'm <span>Zenith.</span></h2>
                <p class="welcome-sub">How can I help you today?</p>
            </div>`;
        }
        return `
        <div class="welcome-message">
            <div class="welcome-z-logo">Z</div>
            <h2>Hello! I'm <span>Zenith.</span></h2>
            <p class="welcome-sub">Pick a starting point or ask anything below.</p>
            <div class="template-grid" id="template-grid">
                <button class="template-card" data-tpl="1">
                    <div class="tpl-ic">✍️</div>
                    <div class="tpl-t">Write a poem<small>Rhyming verse on any topic</small></div>
                </button>
                <button class="template-card" data-tpl="2">
                    <div class="tpl-ic">🐞</div>
                    <div class="tpl-t">Debug my code<small>Paste code, find the bug</small></div>
                </button>
                <button class="template-card" data-tpl="3">
                    <div class="tpl-ic">🌍</div>
                    <div class="tpl-t">Translate<small>Any language, naturally</small></div>
                </button>
                <button class="template-card" data-tpl="4">
                    <div class="tpl-ic">💡</div>
                    <div class="tpl-t">Brainstorm<small>Ideas for my project</small></div>
                </button>
                <button class="template-card" data-tpl="5">
                    <div class="tpl-ic">📚</div>
                    <div class="tpl-t">Summarize<small>TL;DR of anything</small></div>
                </button>
                <button class="template-card" data-tpl="6">
                    <div class="tpl-ic">📧</div>
                    <div class="tpl-t">Write an email<small>Professional or casual</small></div>
                </button>
            </div>
        </div>`;
    },

    initTemplates() {
        const grid = document.getElementById('template-grid');
        if (!grid) return;
        const prompts = {
            1: "Write a poem about ",
            2: "Help me debug this code:\n```\n<PASTE CODE HERE>\n```",
            3: "Translate the following text into English:\n\n<PASTE TEXT HERE>",
            4: "Give me a list of creative ideas for my project. Project: ",
            5: "Summarize the key points of this:\n\n<PASTE TEXT HERE>",
            6: "Draft a professional email about ",
        };
        grid.querySelectorAll('[data-tpl]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const tpl = prompts[btn.dataset.tpl] || '';
                const input = document.getElementById('user-input');
                if (input) {
                    input.focus();
                    // Prefill the prompt so the user can complete it or just press Send
                    const last = tpl.split('\n').pop().replace('<PASTE TEXT HERE>', '').replace('<PASTE CODE HERE>', '');
                    if (last) input.value = last;
                }
            });
        });
    },

    async renderMessages() {
        const container = $('chat-container');
        if (!this.activeId) {
            container.innerHTML = this.renderWelcome();
            this.initTemplates();
            this.renderHeader();
            return;
        }

        const { messages } = await api(`/api/chats/${this.activeId}/messages`);
        container.innerHTML = '';
        this.renderHeader();
        this._wireHeader();

        if (messages.length === 0) {
            container.innerHTML = this.renderWelcome();
            this.initTemplates();
            return;
        }

        messages.forEach(msg => {
            let reactions = null;
            try { reactions = JSON.parse(msg.reactions || '{}'); } catch (e) {}
            this.appendMessage(msg.role, msg.content, false, [], [], msg.id, reactions);
        });
        container.scrollTop = container.scrollHeight;
    },

    appendMessage(role, content, streaming = false, images = [], files = [], messageId = null, reactions = null) {
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
            Chat.enhanceCodeBlocks(bubble);
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
            // Parse historical [File: name] markers when no files array (reload)
            let contentForDisplay = content;
            let fileNamesFromContent = [];
            if ((!files || files.length === 0) && content && content.includes('[File:')) {
                const matches = [...content.matchAll(/\[File:\s*([^\]]+)\]/g)];
                fileNamesFromContent = matches.map(m => m[1].trim());
                const idx = content.indexOf('[File:');
                if (idx > 0) contentForDisplay = content.slice(0, idx).trim();
                else if (fileNamesFromContent.length) contentForDisplay = '';
            }
            const allFiles = (files && files.length > 0) ? files : fileNamesFromContent.map(name => ({ name }));
            if (allFiles.length > 0) {
                allFiles.forEach(f => {
                    const pill = document.createElement('div');
                    const lower = f.name.toLowerCase();
                    let icon = '\uD83D\uDCC4';
                    if (lower.endsWith('.pdf')) icon = '\uD83D\uDCD5';
                    else if (lower.endsWith('.docx') || lower.endsWith('.doc')) icon = '\uD83D\uDCC3';
                    else if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) icon = '\uD83D\uDCCA';
                    else if (lower.endsWith('.zip') || lower.endsWith('.rar') || lower.endsWith('.7z')) icon = '\uD83D\uDCE6';
                    else if (lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.avi')) icon = '\uD83C\uDFAC';
                    else if (lower.endsWith('.mp3') || lower.endsWith('.wav') || lower.endsWith('.ogg')) icon = '\uD83C\uDFB5';
                    else if (lower.endsWith('.html') || lower.endsWith('.htm')) icon = '\uD83C\uDF10';
                    else if (lower.endsWith('.json')) icon = '{ }';
                    else if (lower.endsWith('.js') || lower.endsWith('.py') || lower.endsWith('.ts')) icon = '\uD83D\uDCBB';
                    pill.style.cssText = 'display:flex; align-items:center; gap:10px; background:#2a2a2a; border:1px solid var(--border); border-radius:12px; padding:8px 12px; min-width:180px; max-width:260px; margin-bottom:8px;';
                    pill.innerHTML = `<div style="width:36px; height:36px; border-radius:8px; background:var(--hover-bg); display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0;">${icon}</div><div style="flex:1; min-width:0;"><div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text);">${this.escapeHtml(f.name)}</div><div style="font-size:11px; color:#888;">File</div></div>`;
                    bubble.appendChild(pill);
                });
            }
            if (contentForDisplay && contentForDisplay !== '(image)' && contentForDisplay.trim() !== '') {
                const textNode = document.createElement('div');
                if (contentForDisplay.includes('```') || contentForDisplay.includes('<') && contentForDisplay.includes('>')) {
                    textNode.innerHTML = DOMPurify.sanitize(marked.parse(contentForDisplay));
                    textNode.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
                    Chat.enhanceCodeBlocks(textNode);
                } else {
                    textNode.textContent = contentForDisplay;
                }
                bubble.appendChild(textNode);
            } else if (allFiles.length === 0 && (!images || images.length === 0)) {
                bubble.textContent = contentForDisplay;
            } else if (allFiles.length === 0 && bubble.childNodes.length === 0) {
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
                <button data-action="share-twitter"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/></svg> Share</button>
                <button data-action="share-whatsapp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg> Share</button>
                <button data-action="download-md"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> .md</button>
                <button data-action="download-html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> .html</button>`;
            actions.querySelector('[data-action="copy"]').addEventListener('click', () => {
                navigator.clipboard.writeText(content);
                showToast('Copied!', 'success');
            });
            actions.querySelector('[data-action="speak"]').addEventListener('click', () => {
                Voice.speak(content);
            });
            actions.querySelector('[data-action="share-twitter"]').addEventListener('click', () => {
                const truncated = content.length > 200 ? content.slice(0, 200) + '...' : content;
                window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent('Zenith AI response:\n\n' + truncated + '\n\nTry Zenith AI: ' + window.location.origin)}`, '_blank');
            });
            actions.querySelector('[data-action="share-whatsapp"]').addEventListener('click', () => {
                const truncated = content.length > 200 ? content.slice(0, 200) + '...' : content;
                window.open(`https://wa.me/?text=${encodeURIComponent('Zenith AI response:\n\n' + truncated + '\n\nTry Zenith AI: ' + window.location.origin)}`, '_blank');
            });
            actions.querySelector('[data-action="download-md"]').addEventListener('click', () => {
                Chat.downloadAs(content, 'response', 'md');
            });
            actions.querySelector('[data-action="download-html"]').addEventListener('click', () => {
                Chat.downloadAs(content, 'response', 'html');
            });
            wrapper.appendChild(actions);
        }

        if (role === 'user' && !streaming) {
            const actions = document.createElement('div');
            actions.className = 'msg-actions';
            actions.innerHTML = `
                <button data-action="edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit</button>
                <button data-action="copy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</button>
                <button data-action="speak"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Speak</button>`;
            actions.querySelector('[data-action="copy"]').addEventListener('click', () => {
                navigator.clipboard.writeText(content);
                showToast('Copied!', 'success');
            });
            actions.querySelector('[data-action="speak"]').addEventListener('click', () => {
                Voice.speak(content);
            });
            actions.querySelector('[data-action="edit"]').addEventListener('click', () => {
                Chat.editMessage(messageId, content, wrapper);
            });
            wrapper.appendChild(actions);
        }

        // Reactions row (only when we know the message id and it's not streaming)
        if (messageId && !streaming) {
            const rrow = this._buildReactions(messageId, reactions);
            if (rrow) wrapper.appendChild(rrow);
        }

        container.appendChild(wrapper);
        container.scrollTop = container.scrollHeight;
        return bubble;
    },

    _EMOJI_OPTS: ['👍', '❤️', '🔥', '👏', '🌟'],

    _buildReactions(messageId, reactions) {
        const self = this;
        const row = document.createElement('div');
        row.className = 'msg-reactions';
        const store = reactions && typeof reactions === 'object' ? reactions : {};
        const sorted = Object.entries(store).sort((a, b) => b[1].length - a[1].length);
        const preview = document.createElement('div');
        preview.className = 'msg-reaction-chips';
        sorted.forEach(([emoji, users]) => {
            const chip = document.createElement('button');
            chip.className = 'reaction-chip';
            chip.type = 'button';
            chip.textContent = emoji + ' ' + users.length;
            chip.title = (Array.isArray(users) ? users : []).join(', ');
            chip.addEventListener('click', () => self._toggleReaction(messageId, emoji, chip));
            preview.appendChild(chip);
        });
        const addBtn = document.createElement('div');
        addBtn.className = 'reaction-add';
        addBtn.title = 'React';
        addBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.828 14.828a4 4 0 0 1-5.656 0M9 10h.01M15 10h.01M17.349 17.349a8 8 0 1 0-2.698 2.698"/><circle cx="12" cy="12" r="10"/></svg>';
        const picker = document.createElement('div');
        picker.className = 'reaction-picker';
        const pick = (emoji) => () => {
            picker.style.display = 'none';
            addBtn.style.display = '';
            self._toggleReaction(messageId, emoji, addBtn.closest('.msg-reactions'));
        };
        Object.keys(store).forEach(emoji => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = emoji;
            b.addEventListener('click', pick(emoji));
            picker.appendChild(b);
        });
        this._EMOJI_OPTS.forEach(emoji => {
            if (store[emoji]) return;
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = emoji;
            b.addEventListener('click', pick(emoji));
            picker.appendChild(b);
        });
        addBtn.appendChild(picker);
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const vis = picker.style.display === 'flex';
            picker.style.display = vis ? 'none' : 'flex';
            addBtn.style.display = vis ? '' : 'none';
        });
        row.appendChild(preview);
        row.appendChild(addBtn);
        return row;
    },

    async _toggleReaction(messageId, emoji, rowEl) {
        try {
            const { reactions } = await api(`/api/chats/${this.activeId}/messages/${messageId}/react`, {
                method: 'POST',
                body: JSON.stringify({ emoji }),
            });
            const row = rowEl || (document.querySelector('.msg-reactions'));
            if (row && row.parentElement) {
                const fresh = this._buildReactions(messageId, reactions);
                row.parentElement.replaceChild(fresh, row);
            }
        } catch (e) {
            showToast('Failed to react: ' + (e.message || 'Error'), 'error');
        }
    },

    async editMessage(messageId, oldContent, wrapper) {
        if (this.isStreaming) { showToast('Please wait for current response', 'error'); return; }
        if (!messageId) {
            // fallback: fetch id by content from server messages
            try {
                const { messages } = await api(`/api/chats/${this.activeId}/messages`);
                const found = [...messages].reverse().find(m => m.role === 'user' && m.content === oldContent);
                if (found) messageId = found.id;
            } catch (e) {}
            if (!messageId) { showToast('Cannot edit: message not yet saved, please reload', 'error'); return; }
        }
        const newContent = await showPrompt('Edit message', oldContent);
        if (newContent === null || !newContent.trim() || newContent.trim() === oldContent) return;
        const trimmed = newContent.trim();
        // remove following assistant messages from DOM
        let next = wrapper.nextElementSibling;
        while (next) {
            const cur = next;
            next = next.nextElementSibling;
            if (cur.classList.contains('assistant')) cur.remove();
        }
        const regenBtn = $('regen-btn');
        if (regenBtn) regenBtn.style.display = 'none';
        // optimistic update user bubble text
        const bubble = wrapper.querySelector('.msg-bubble');
        if (bubble) {
            const textDiv = bubble.querySelector('div');
            if (textDiv && bubble.childElementCount === 1) textDiv.textContent = trimmed;
            else if (!bubble.querySelector('.file-chip') && !bubble.querySelector('img')) bubble.textContent = trimmed;
        }
        this.isStreaming = true;
        const sendBtn = $('send-btn');
        const stopBtn = $('stop-btn');
        if (sendBtn) sendBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'flex';
        this.abortController = new AbortController();
        const assistantBubble = this.appendMessage('assistant', '', true);
        let fullResponse = '';
        try {
            const res = await fetch(`/api/chats/${this.activeId}/messages/${messageId}`, {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: trimmed }),
                signal: this.abortController.signal
            });
            if (!res.ok) {
                const txt = await res.text();
                let msg = txt;
                try { msg = JSON.parse(txt).detail || txt; } catch {}
                throw new Error(msg.slice(0, 300));
            }
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
                            this.updateStreamingBubble(assistantBubble, fullResponse);
                        }
                        if (parsed.error) {
                            showToast(parsed.error, 'error');
                            assistantBubble.textContent = 'Error: ' + parsed.error;
                            assistantBubble.classList.remove('streaming-cursor');
                        }
                    } catch (e) {}
                }
            }
            assistantBubble.classList.remove('streaming-cursor');
            if (fullResponse) {
                this.updateStreamingBubble(assistantBubble, fullResponse);
                const actions = document.createElement('div');
                actions.className = 'msg-actions';
                actions.innerHTML = `<button data-action="copy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</button><button data-action="speak"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Speak</button><button data-action="download-md"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> .md</button>`;
                actions.querySelector('[data-action="copy"]').addEventListener('click', () => {
                    navigator.clipboard.writeText(fullResponse.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 [$2]'));
                    showToast('Copied!', 'success');
                });
                actions.querySelector('[data-action="speak"]').addEventListener('click', () => { Voice.speak(fullResponse); });
                actions.querySelector('[data-action="download-md"]').addEventListener('click', () => { Chat.downloadAs(fullResponse, 'response', 'md'); });
                assistantBubble.parentElement.appendChild(actions);
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                assistantBubble.querySelector('.thinking-text')?.remove();
                if (!fullResponse) assistantBubble.textContent = 'Stopped.';
                assistantBubble.classList.remove('streaming-cursor');
            } else {
                showToast('Error: ' + err.message, 'error');
                assistantBubble.textContent = 'Error: ' + err.message;
                assistantBubble.classList.remove('streaming-cursor');
            }
        } finally {
            this.isStreaming = false;
            this.abortController = null;
            if (sendBtn) sendBtn.style.display = 'flex';
            if (stopBtn) stopBtn.style.display = 'none';
            const input = $('user-input');
            if (input) input.focus();
            this.showRegenerate();
        }
    },

    async downloadAs(content, filename, format) {
        try {
            const res = await fetch('/api/generate/document', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, filename, format }),
            });
            if (!res.ok) {
                let detail = '';
                try { const j = await res.json(); detail = (j && j.detail) || ''; } catch (e) {}
                if (detail) {
                    showToast('Download failed: ' + detail, 'error');
                    if (typeof showLimitPopup === 'function' && (/wait\s+\d+m\s*\d+s|cooldown|pause|guest|limit/i.test(detail))) showLimitPopup(detail);
                } else {
                    showToast('Download failed (' + res.status + ')', 'error');
                }
                return;
            }
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

    // Generate an image now (used by the auto image-gen hook + image button),
    // persisting it as an assistant message so it survives reload.
    async generateImageNow(prompt) {
        if (!prompt || !prompt.trim()) return false;
        if (!this.activeId) await this.create();
        try {
            const { url } = await api('/api/image/generate', {
                method: 'POST',
                body: JSON.stringify({ prompt: prompt.trim(), width: 1024, height: 1024, chat_id: this.activeId }),
            });
            this.appendMessage('assistant', `**Prompt:** ${prompt}\n\n![Generated image](${url})`);
            showToast('Image generated!', 'success');
            return true;
        } catch (e) {
            const msg = String(e.message || '');
            if (typeof showLimitPopup === 'function' && /wait\s+\d+m\s*\d+s|cooldown|pause|guest/i.test(msg)) showLimitPopup(msg);
            else showToast('Image generation failed: ' + msg, 'error');
            return false;
        }
    },

    // Follow-up edit of the last generated image ("add a bell around the cow").
    // The server merges the change into the previous prompt and reuses its seed
    // for a similar composition, persisting the result as an assistant message.
    async editGeneratedImage(change) {
        if (!change || !change.trim()) return false;
        if (!this.activeId) await this.create();
        try {
            const { url, prompt, change: applied } = await api('/api/image/edit', {
                method: 'POST',
                body: JSON.stringify({ chat_id: this.activeId, change: change.trim(), width: 1024, height: 1024 }),
            });
            this.appendMessage('assistant', `**Prompt:** ${prompt}\n\n**Changed:** ${applied}\n\n![Generated image](${url})`);
            showToast('Image updated!', 'success');
            return true;
        } catch (e) {
            const msg = String(e.message || '');
            if (typeof showLimitPopup === 'function' && /wait\s+\d+m\s*\d+s|cooldown|pause|guest/i.test(msg)) showLimitPopup(msg);
            else showToast('Could not update image: ' + msg, 'error');
            return false;
        }
    },

    // True when this chat already contains a generated image (follow-ups need one).
    // The markdown "![Generated image]" is rendered into an <img alt="Generated image">
    // element, so we must check the DOM, not the raw text content.
    _hasGeneratedImage() {
        const container = $('chat-container');
        if (!container) return false;
        if (/!\[Generated image\]\(/.test(container.textContent || '')) return true;
        return !!container.querySelector('img[alt="Generated image"]');
    },

    updateStreamingBubble(bubble, text) {
        const thinking = bubble.querySelector('.thinking-text');
        if (thinking) thinking.remove();
        bubble.innerHTML = DOMPurify.sanitize(marked.parse(text));
        bubble.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        Chat.enhanceCodeBlocks(bubble);
        const container = $('chat-container');
        container.scrollTop = container.scrollHeight;
    },
    enhanceCodeBlocks(bubble) {
        bubble.querySelectorAll('pre').forEach(pre => {
            if (pre.querySelector('.code-header')) return;
            const code = pre.querySelector('code');
            const lang = code ? (code.className.match(/language-(\w+)/) || [,''])[1] : '';
            const header = document.createElement('div');
            header.className = 'code-header';
            header.innerHTML = `<span>${lang || 'code'}</span><button class="code-copy-btn" title="Copy code"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</button>`;
            header.querySelector('button').addEventListener('click', () => {
                navigator.clipboard.writeText(code ? code.textContent : pre.textContent);
                const btn = header.querySelector('button');
                btn.textContent = 'Copied!';
                setTimeout(() => btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy', 1500);
            });
            pre.style.position = 'relative';
            pre.insertBefore(header, pre.firstChild);
        });
    },

    async send() {
        const input = $('user-input');
        const text = input.value.trim();
        if ((!text && this.attachments.length === 0) || this.isStreaming) return;
        if (this._limitBlocked) return; // messaging auto-disabled while a limit cooldown banner is live
        if (window.__msgBlocked === true) return; // global messaging off → send button does nothing
        if (!this.activeId) await this.create();

        const think = $('think-btn').classList.contains('active');
        const webSearch = $('web-btn').classList.contains('active');
        const research = $('research-btn').classList.contains('active');
        const factcheck = $('factcheck-btn').classList.contains('active');
        let fullContent = text;
        const images = [];
        this.attachments.forEach(att => {
            if (att.type === 'text') fullContent += `\n\n[File: ${att.name}]\n${att.data}`;
            else if (att.type === 'file') fullContent += `\n\n[File: ${att.name}]\n${att.data}`;
            else if (att.type === 'image') images.push(att.data);
        });

        const uploadedFiles = [];
        for (const att of this.attachments) {
            const uploaded = await this.uploadToServer(att);
            if (uploaded) uploadedFiles.push(uploaded);
        }
        const sendImages = this.attachments.filter(a => a.type === 'image').map(a => a.data);
        const imageUrls = uploadedFiles.filter(f => f.is_image).map(f => `/uploads/${f.stored_name}`);
        const regenBtn = $('regen-btn');
        if (regenBtn) regenBtn.style.display = 'none';
        let displayText = text;
        const displayFiles = this.attachments.filter(a => a.type !== 'image');
        const displayImages = imageUrls.length > 0 ? imageUrls : sendImages;
        this.appendMessage('user', displayText || (displayFiles.length ? '' : '(image)'), false, displayImages, displayFiles);
        input.value = '';
        input.style.height = 'auto';

        this.attachments = [];
        this.renderAtts();

        // Auto image generation + follow-up edits: "generate a pic of..." creates
        // an image; "add a bell around the cow" / "make it bigger" applies a
        // follow-up edit to the last generated image in this chat.
        if (text && typeof window.detectImageRequest === 'function') {
            const imgPrompt = window.detectImageRequest(text);
            if (imgPrompt) {
                await this.generateImageNow(imgPrompt);
            } else if (typeof window.detectImageEditRequest === 'function') {
                const change = window.detectImageEditRequest(text);
                if (change && this._hasGeneratedImage()) await this.editGeneratedImage(change);
            }
        }

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

            if (!res.ok) {
                // Server rejected the message (limit reached / guest pause / disabled). Surface it.
                let detail = '';
                try { const j = await res.json(); detail = (j && (j.detail || j.message)) || ''; } catch (e) {}
                this._handleSendError(detail || ('Failed (' + res.status + ')'));
                bubble.classList.remove('streaming-cursor');
                if (!bubble.textContent) bubble.remove();
                return;
            }

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
                // Voice-to-voice auto speak if enabled
                if (Voice.voiceToVoice) {
                    Voice.speak(fullResponse, true);
                }
                // Notify if app was minimized/background when response done (WhatsApp-style)
                if (document.hidden || !document.hasFocus()) {
                    try { const a=new Audio('/static/sounds/notify.mp3'); a.volume=0.6; a.play().catch(()=>{}); } catch {}
                    if (typeof devicePush === 'function') devicePush('Zenith — reply ready', fullResponse.slice(0,120), 'ai-reply');
                    if (typeof showDiscordToast === 'function') showDiscordToast('Zenith', 'New reply', fullResponse.slice(0,80), 'Z');
                    // Also try native notification directly
                    try {
                        if ('Notification' in window && Notification.permission === 'granted') {
                            const n = new Notification('Zenith — reply ready', { body: fullResponse.slice(0,120), icon: '/static/icons/icon-192.png', tag: 'ai-reply', requireInteraction: true });
                            n.onclick = () => { window.focus(); n.close(); };
                        }
                    } catch {}
                }
                // Long-reply nudge while the app is open (attraction feature)
                if (fullResponse.length > 2400) {
                    showToast('✅ Done — a long reply is ready for you', 'success');
                }
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
            } else if (!navigator.onLine || err.message === 'Failed to fetch') {
                // Network lost mid-chat — offer retry or offline mode
                bubble.textContent = '';
                bubble.classList.remove('streaming-cursor');
                if (typeof showOfflineScreen === 'function') showOfflineScreen();
                else { bubble.textContent = 'Error: ' + err.message; }
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

    _handleSendError(detail) {
        const d = String(detail || '');
        const lower = d.toLowerCase();
        // Cooldown countdown: guests pause for 30 min after the message limit; free tiers reset daily.
        let secs = 0;
        const m = d.match(/wait\s+(\d+)m\s*(\d+)s/);
        if (m) secs = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
        else if (lower.includes('30 minute pause')) secs = 1800;
        else if (lower.includes('15 minute pause')) secs = 900;
        const isGuest = lower.includes('guest');
        const isPause = lower.includes('pause') || secs > 0;
        const isLimit = lower.includes('limit') || lower.includes('reached');
        if (secs > 0) {
            // Countdown timers always surface a popup (with a live countdown), plus the
            // in-composer banner whose tick auto-unblocks messaging when time elapses.
            this._limitBlocked = true;
            this._limitUntil = Date.now() + secs * 1000;
            if (typeof showLimitPopup === 'function') showLimitPopup(d);
            this._showLimitBanner(secs, isGuest);
        } else if (isLimit || isGuest) {
            // Limits without a timer: banner first, popup when the user persists.
            if (this._limitPopupShown) {
                if (typeof showLimitPopup === 'function') showLimitPopup(d);
            } else {
                this._limitBlocked = true;
                this._limitUntil = 0;
                this._limitPopupShown = true;
                this._showLimitBanner(0, isGuest, d);
            }
        } else {
            this._clearLimitBanner();
            if (typeof showToast === 'function') showToast('Could not send: ' + d, 'error');
        }
    },

    _showLimitBanner(secs, isGuest, rawDetail) {
        this._clearLimitBanner(false);
        const composerBox = document.querySelector('.composer-box');
        const banner = document.createElement('div');
        banner.id = 'limit-banner';
        banner.style.cssText = 'width:100%;padding:8px 12px;background:rgba(239,68,68,.10);border:1px solid rgba(239,68,68,.35);border-radius:8px;color:#F87171;font-size:12px;display:flex;justify-content:space-between;align-items:center;gap:8px;box-sizing:border-box;';
        banner.innerHTML = '<span id="limit-banner-text"></span>';
        if (composerBox) composerBox.insertBefore(banner, composerBox.firstChild);
        else document.body.appendChild(banner);
        const textEl = banner.querySelector('#limit-banner-text');
        const endTs = this._limitUntil;
        const tick = () => {
            if (secs > 0 && endTs) {
                const left = Math.max(0, Math.round((endTs - Date.now()) / 1000));
                if (left <= 0) { this._clearLimitBanner(); return; }
                const mm = Math.floor(left / 60), ss = left % 60;
                const human = (mm > 0 ? mm + 'm ' : '') + ss + 's';
                textEl.innerHTML = isGuest
                    ? '<strong>Guest limit reached.</strong> Messaging paused — continue in <strong>' + human + '</strong>. <a href="/" style="color:#F87171;font-weight:700;">Log in</a> for unlimited chat.'
                    : '<strong>Limit reached.</strong> Messaging paused — continue in <strong>' + human + '</strong>.';
            } else {
                textEl.innerHTML = isGuest
                    ? '<strong>Guest limit reached.</strong> Messaging disabled for today — <a href="/" style="color:#F87171;font-weight:700;">log in</a> to keep chatting.'
                    : '<strong>Free limit reached for today.</strong> Messaging disabled — resets at midnight (UTC). Upgrade to Pro for more.';
            }
        };
        tick();
        this._limitTimer = setInterval(tick, 1000);
    },

    _clearLimitBanner(unblock = true) {
        if (this._limitTimer) { clearInterval(this._limitTimer); this._limitTimer = null; }
        const b = document.getElementById('limit-banner');
        if (b) b.remove();
        this._limitPopupShown = false;
        if (unblock !== false) { this._limitBlocked = false; this._limitUntil = 0; }
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

            if (!res.ok) {
                let detail = '';
                try { const j = await res.json(); detail = (j && (j.detail || j.message)) || ''; } catch (e) {}
                this._handleSendError(detail || ('Failed (' + res.status + ')'));
                if (bubble && bubble.parentElement) bubble.remove();
                return;
            }

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
            const lower = file.name.toLowerCase();
            const isImage = file.type.startsWith('image/');
            const textExts = ['.txt','.md','.json','.csv','.js','.py','.html','.css','.xml','.yaml','.yml','.ts','.jsx','.tsx','.c','.cpp','.java','.go','.rs','.php','.rb','.sh','.sql','.log','.ini','.conf','.toml'];
            const isText = !isImage && (file.type.startsWith('text/') || file.type === 'application/json' || file.type === 'application/javascript' || file.type === 'application/xml' || textExts.some(ext => lower.endsWith(ext)));
            if (isImage) {
                reader.onload = e => {
                    this.attachments.push({ name: file.name, type: 'image', data: e.target.result, file });
                    this.renderAtts();
                };
                reader.readAsDataURL(file);
            } else if (isText) {
                reader.onload = e => {
                    this.attachments.push({ name: file.name, type: 'text', data: e.target.result, file });
                    this.renderAtts();
                };
                reader.readAsText(file);
            } else {
                const sizeKB = (file.size / 1024).toFixed(1);
                this.attachments.push({ name: file.name, type: 'file', data: `File: ${file.name} (${sizeKB} KB)`, file });
                this.renderAtts();
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
                const isHtml = att.name.toLowerCase().endsWith('.html');
                const icon = isHtml ? '\uD83C\uDF10' : '\uD83D\uDCC4';
                div.innerHTML = `<div class="file-chip" style="display:flex; align-items:center; gap:10px; background:var(--input-bg); border:1px solid var(--border); border-radius:12px; padding:8px 12px; min-width:180px; max-width:260px;"><div style="width:36px; height:36px; border-radius:8px; background:var(--hover-bg); display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0;">${icon}</div><div style="flex:1; min-width:0;"><div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${this.escapeHtml(att.name)}</div><div style="font-size:11px; color:#888;">File</div></div><button class="remove-att" data-i="${i}" style="position:static; background:transparent; color:#888; border:none; font-size:16px; cursor:pointer; flex-shrink:0;">\u2715</button></div>`;
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
