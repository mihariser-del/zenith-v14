const fileIcon = (name) => {
    const e = (name || '').split('.').pop().toLowerCase();
    const M = {
        // Images
        png:'\uD83D\uDDBC\uFE0F', jpg:'\uD83D\uDDBC\uFE0F', jpeg:'\uD83D\uDDBC\uFE0F', gif:'\uD83C\uDFA8', bmp:'\uD83D\uDDBC\uFE0F', svg:'\uD83C\uDFA8', webp:'\uD83D\uDDBC\uFE0F', tiff:'\uD83D\uDDBC\uFE0F', tif:'\uD83D\uDDBC\uFE0F', ico:'\uD83D\uDDBC\uFE0F',heic:'\uD83D\uDDBC\uFE0F',
        // Video
        mp4:'\uD83C\uDFAC', mov:'\uD83C\uDFAC', avi:'\uD83C\uDFAC', mkv:'\uD83C\uDFAC', webm:'\uD83C\uDFAC', wmv:'\uD83C\uDFAC', flv:'\uD83C\uDFAC', m4v:'\uD83C\uDFAC', mpg:'\uD83C\uDFAC', mpeg:'\uD83C\uDFAC', '3gp':'\uD83C\uDFAC',ts:'\uD83C\uDFAC',
        // Audio
        mp3:'\uD83C\uDFB5', wav:'\uD83C\uDFB5', ogg:'\uD83C\uDFB5', flac:'\uD83C\uDFB5', aac:'\uD83C\uDFB5', wma:'\uD83C\uDFB5', m4a:'\uD83C\uDFB5', opus:'\uD83C\uDFB5',mid:'\uD83C\uDFB5',midi:'\uD83C\uDFB5',
        // Docs
        pdf:'\uD83D\uDCD5', doc:'\uD83D\uDCC3', docx:'\uD83D\uDCC3', rtf:'\uD83D\uDCC3', odt:'\uD83D\uDCC3', pages:'\uD83D\uDCC3',
        // Sheets
        xls:'\uD83D\uDCCA', xlsx:'\uD83D\uDCCA', csv:'\uD83D\uDCCA', ods:'\uD83D\uDCCA', numbers:'\uD83D\uDCCA',tsv:'\uD83D\uDCCA',
        // Slides
        ppt:'\uD83D\uDCCA', pptx:'\uD83D\uDCCA', odp:'\uD83D\uDCCA', key:'\uD83D\uDCCA',
        // Archives
        zip:'\uD83D\uDCE6', rar:'\uD83D\uDCE6', '7z':'\uD83D\uDCE6', tar:'\uD83D\uDCE6', gz:'\uD83D\uDCE6', bz2:'\uD83D\uDCE6',xz:'\uD83D\uDCE6',
        // Code
        js:'\uD83D\uDCBB', jsx:'\uD83D\uDCBB', ts:'\uD83D\uDCBB', tsx:'\uD83D\uDCBB', py:'\uD83D\uDCBB', pyw:'\uD83D\uDCBB', rb:'\uD83D\uDCBB', go:'\uD83D\uDCBB', rs:'\uD83D\uDCBB', java:'\uD83D\uDCBB', c:'\uD83D\uDCBB', cpp:'\uD83D\uDCBB', h:'\uD83D\uDCBB', hpp:'\uD83D\uDCBB', cs:'\uD83D\uDCBB', swift:'\uD83D\uDCBB', kt:'\uD83D\uDCBB', php:'\uD83D\uDCBB', lua:'\uD83D\uDCBB', r:'\uD83D\uDCBB', scala:'\uD83D\uDCBB', dart:'\uD83D\uDCBB', el:'\uD83D\uDCBB', ex:'\uD83D\uDCBB', exs:'\uD83D\uDCBB',clj:'\uD83D\uDCBB',
        // Web
        html:'\uD83C\uDF10', htm:'\uD83C\uDF10', css:'\uD83C\uDF10', scss:'\uD83C\uDF10', less:'\uD83C\uDF10', xml:'\uD83C\uDF10', rss:'\uD83C\uDF10',md:'\uD83C\uDF10',markdown:'\uD83C\uDF10',
        // Config / data
        json:'\u2328\uFE0F', yaml:'\u2328\uFE0F', yml:'\u2328\uFE0F', toml:'\u2328\uFE0F', ini:'\u2328\uFE0F', cfg:'\u2328\uFE0F', conf:'\u2328\uFE0F', env:'\u2328\uFE0F',sql:'\u2328\uFE0F',
        // Executables / installers
        exe:'\u2699\uFE0F', msi:'\u2699\uFE0F', bat:'\u2699\uFE0F', cmd:'\u2699\uFE0F', ps1:'\u2699\uFE0F', sh:'\u2699\uFE0F', bash:'\u2699\uFE0F', zsh:'\u2699\uFE0F', app:'\u2699\uFE0F', dmg:'\u2699\uFE0F',deb:'\u2699\uFE0F',rpm:'\u2699\uFE0F',apk:'\u2699\uFE0F',snap:'\u2699\uFE0F',
        // Disk images / containers
        iso:'\uD83D\uDCC1', img:'\uD83D\uDCC1', vmdk:'\uD83D\uDCC1',vdi:'\uD83D\uDCC1',vhd:'\uD83D\uDCC1',
        // Fonts
        ttf:'\uD83D\uDD24', otf:'\uD83D\uDD24', woff:'\uD83D\uDD24', woff2:'\uD83D\uDD24',eot:'\uD83D\uDD24',
        // Books / docs
        epub:'\uD83D\uDCDA', mobi:'\uD83D\uDCDA', azw:'\uD83D\uDCDA', fb2:'\uD83D\uDCDA',djvu:'\uD83D\uDCDA',tex:'\uD83D\uDCDA',latex:'\uD83D\uDCDA',
        // CAD / 3D
        dwg:'\uD83D\uDCD0', dxf:'\uD83D\uDCD0', stl:'\uD83D\uDCD0', obj:'\uD83D\uDCD0', fbx:'\uD83D\uDCD0',blend:'\uD83D\uDCD0',
        // Design
        psd:'\uD83C\uDFA8', ai:'\uD83C\uDFA8', sketch:'\uD83C\uDFA8', fig:'\uD83C\uDFA8', xd:'\uD83C\uDFA8',indd:'\uD83C\uDFA8',afdesign:'\uD83C\uDFA8',afphoto:'\uD83C\uDFA8',
        // Crypto / certs
        pem:'\uD83D\uDD11', crt:'\uD83D\uDD11', cer:'\uD83D\uDD11', der:'\uD83D\uDD11', p12:'\uD83D\uDD11', pfx:'\uD83D\uDD11', jks:'\uD83D\uDD11',
        // Misc
        log:'\uD83D\uDCDD', txt:'\uD83D\uDCDD', text:'\uD83D\uDCDD', dat:'\uD83D\uDCC2',bak:'\uD83D\uDCC2',tmp:'\uD83D\uDCC2',swp:'\uD83D\uDCC2',cache:'\uD83D\uDCC2',torrent:'\uD83D\uDCB0',
    };
    return M[e] || '\uD83D\uDCC4';
};

const Chat = {
    chats: {},
    activeId: null,
    isStreaming: false,
    attachments: [],
    abortController: null,
    _sending: false,
    _reading: 0,

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
            const away = container.scrollTop + container.clientHeight < container.scrollHeight - 100;
            btn.style.display = away ? 'flex' : 'none';
            // Follow new text only while the reader is at (or near) the bottom.
            Chat._stickBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 140;
        };
        container.addEventListener('scroll', toggle);
        btn.addEventListener('click', () => { Chat._stickBottom = true; container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' }); });
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
                } catch (e) {
                    // Explain WHY the link can't be opened instead of silently
                    // dropping the visitor onto their most recent chat.
                    const msg = (e && e.message) || '';
                    const clear = [['You do not have access to this chat', 'notowner'], ['does not exist', 'notfound']].find(([s]) => msg.includes(s));
                    const reason = clear ? clear[1] : 'notfound';
                    if (window.location.pathname.match(/\/app\/c\//i)) {
                        window.location.replace(`/denied.html?reason=${reason}&link=${encodeURIComponent(targetLink)}`);
                        return;
                    }
                }
            }
            if (found) {
                this.activeId = found.id;
                this.renderList();
                this.renderMessages();
                return;
            }
        }

        // Always open on a fresh, unregistered chat. The chat row is created in
        // the database only when the user sends their first message.
        this.activeId = null;
        this.renderList();
        await this.renderMessages();
    },

    async newDraft() {
        this.activeId = null;
        this.attachments = [];
        this.renderAtts();
        this.renderList();
        await this.renderMessages();
        this.syncUrl();
        const input = $('user-input');
        if (input) input.focus();
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
            await this.newDraft();
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
        await this.newDraft();
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
            if (window.user && window.user.username && window.user.username.startsWith('guest_')) {
                if (typeof Billing !== 'undefined' && Billing.showUpgrade) Billing.showUpgrade('Guest share');
                return;
            }
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
        const statusText = overlay.querySelector('#sx-status-text');
        const statusDot = overlay.querySelector('#sx-status-dot');
        const statusWrap = overlay.querySelector('#sx-share-status');
        const createBlock = overlay.querySelector('#sx-create-block');
        const manageBlock = overlay.querySelector('#sx-manage-block');
        const socials = overlay.querySelector('#sx-socials');
        const previewBtn = overlay.querySelector('#sx-preview');
        if (chat.share_id && chat.share_id !== '') {
            const url = window.location.origin + '/s/' + chat.share_id;
            linkBox.value = url;
            statusDot.style.background = '#4ADE80';
            statusDot.style.boxShadow = '0 0 8px #4ADE80';
            statusWrap.style.color = '#4ADE80';
            statusText.textContent = 'Public — anyone with this link can view your chat.';
            createBlock.style.display = 'none';
            manageBlock.style.display = 'block';
            socials.style.display = 'flex';
            previewBtn.onclick = () => window.open(url, '_blank');
            // privacy + snapshot state
            const anonBox = overlay.querySelector('#sx-anon');
            const snapText = overlay.querySelector('#sx-snap-text');
            const updBtn = overlay.querySelector('#sx-update');
            const applyState = (st) => {
                if (!st) return;
                if (anonBox) anonBox.checked = !!st.anonymous;
                if (snapText) {
                    const when = st.shared_at ? new Date(st.shared_at + (/[zZ]|[+-]\d\d:?\d\d$/.test(st.shared_at) ? '' : 'Z')).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
                    snapText.textContent = st.newer
                        ? `${st.newer} newer message${st.newer === 1 ? ' is' : 's are'} not on the public page yet.`
                        : `Public page shows the chat as of ${when || 'when you shared it'}.`;
                }
                if (updBtn) updBtn.style.display = st.newer ? 'inline-flex' : 'none';
            };
            api(`/api/chats/${chat.id}/share`, { method: 'POST', body: JSON.stringify({}) }).then(applyState).catch(() => {});
            if (anonBox) anonBox.onchange = async () => {
                try { applyState(await api(`/api/chats/${chat.id}/share`, { method: 'POST', body: JSON.stringify({ anonymous: anonBox.checked }) })); showToast(anonBox.checked ? 'Your name is hidden on the shared page' : 'Your name shows on the shared page', 'success'); }
                catch (e) { showToast(e.message || 'Failed', 'error'); }
            };
            if (updBtn) updBtn.onclick = async () => {
                try { applyState(await api(`/api/chats/${chat.id}/share`, { method: 'POST', body: JSON.stringify({ update: true }) })); showToast('Shared page updated with your latest messages', 'success'); }
                catch (e) { showToast(e.message || 'Failed', 'error'); }
            };
            socials.querySelector('[data-soc="twitter"]').onclick = () => {
                window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent('Check out this chat on Zelpophai AI: ' + url)}`, '_blank', 'noopener,width=600,height=450');
            };
            socials.querySelector('[data-soc="whatsapp"]').onclick = () => {
                window.open(`https://wa.me/?text=${encodeURIComponent('Check out this chat on Zelpophai AI: ' + url)}`, '_blank', 'noopener');
            };
            socials.querySelector('[data-soc="telegram"]').onclick = () => {
                window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Check out this chat on Zelpophai AI')}`, '_blank', 'noopener');
            };
            socials.querySelector('[data-soc="facebook"]').onclick = () => {
                window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'noopener');
            };
        } else {
            linkBox.value = '';
            linkBox.placeholder = 'Click “Create share link” to go live…';
            statusDot.style.background = 'var(--muted)';
            statusDot.style.boxShadow = 'none';
            statusWrap.style.color = 'var(--muted)';
            statusText.textContent = 'Share a read-only, beautifully presented copy of this chat.';
            createBlock.style.display = 'block';
            manageBlock.style.display = 'none';
            socials.style.display = 'none';
        }
        const copyBtn = overlay.querySelector('#sx-copy');
        copyBtn.onclick = () => {
            if (!linkBox.value) { showToast('Create a share link first', 'error'); return; }
            navigator.clipboard.writeText(linkBox.value).then(() => showToast('Link copied!', 'success')).catch(() => showToast('Copy failed', 'error'));
        };
        const shareBtn = overlay.querySelector('#sx-create-share');
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
        const unshareBtn = overlay.querySelector('#sx-unshare');
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
                    <div class="pdf-brand"><span class="pdf-logo">Z</span> Zelpophai AI ·${this.escapeHtml(chat.title || 'Chat')}</div>
                    ${messages.map((m, i) => {
                        const isUser = m.role === 'user';
                        return `<div class="pdf-msg ${isUser ? 'is-user' : ''}">
                            <div class="pdf-msg-role">${isUser ? 'You' : 'Zelpophai AI'}</div>
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
                    const html = `<html><head><title>${(chat.title || 'Zelpophai AI Chat')} — Export</title>
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
                        <div class="b"><div class="l">Z</div><h1>${this.escapeHtml(chat.title || 'Zelpophai AI Chat')}</h1></div>
                        ${messages.map(m => `<div class="m ${m.role === 'user' ? 'u' : ''}"><div class="r">${m.role === 'user' ? 'You' : 'Zelpophai AI'}</div><div class="c">${this.escapeHtml(m.content)}</div></div>`).join('')}
                        <div style="margin-top:30px;font-size:11px;color:#9ca3af;text-align:center;">Exported from Zelpophai AI — ${new Date().toLocaleString()}</div>
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
        if (Object.keys(this.chats).length > 0) {
            // Not a brand-new user — keep the classic welcome
            return `
            <div class="welcome-message">
                <div class="welcome-z-logo">Z</div>
                <h2>Hello! I'm <span>Zelpophai AI.</span></h2>
                <p class="welcome-sub">How can I help you today?</p>
            </div>`;
        }
        return `
        <div class="welcome-message">
            <div class="welcome-z-logo">Z</div>
            <h2>Hello! I'm <span>Zelpophai AI.</span></h2>
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
            let viewer = null;
            try { viewer = JSON.parse(msg.viewer_reactions || '{}'); } catch (e2) {}
            this.appendMessage(msg.role, msg.content, false, [], [], msg.id, reactions, viewer);
        });
        container.scrollTop = container.scrollHeight;
        this.resumeVideos(this.activeId);
    },

    appendMessage(role, content, streaming = false, images = [], files = [], messageId = null, reactions = null, viewerReactions = null) {
        const container = $('chat-container');
        const welcome = container.querySelector('.welcome-message');
        if (welcome) welcome.remove();
        const wrapper = document.createElement('div');
        wrapper.className = `msg-wrapper ${role}`;

        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble' + (streaming ? ' streaming-cursor' : '');

        if (streaming) {
            bubble.innerHTML = '<span class="thinking-text">Thinking...</span>';
        } else if (role === 'assistant') {
            ZRender.render(bubble, content);
            Chat.enhanceVideos(bubble);
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
                    const icon = fileIcon(lower);
                    pill.className = 'file-pill msgb';
                    pill.innerHTML = `<div class="fp-ic">${icon}</div><div class="fp-info"><div class="fp-name">${this.escapeHtml(f.name)}</div><div class="fp-sub">File</div></div>`;
                    bubble.appendChild(pill);
                });
            }
            if (contentForDisplay && contentForDisplay !== '(image)' && contentForDisplay.trim() !== '') {
                const textNode = document.createElement('div');
                if (contentForDisplay.includes('```') || contentForDisplay.includes('<') && contentForDisplay.includes('>')) {
                    ZRender.render(textNode, contentForDisplay, { inner: true });
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
        this._wireImages(wrapper);

        if (role === 'assistant' && !streaming) {
            wrapper.appendChild(this._buildMsgActions('assistant', content, messageId, wrapper));
        }

        if (role === 'user' && !streaming) {
            wrapper.appendChild(this._buildMsgActions('user', content, messageId, wrapper));
        }

        // Viewer reactions row (read-only): emojis left by people viewing your shared link.
        if (messageId && !streaming) {
            const rrow = this._buildViewerReactions(viewerReactions);
            if (rrow) wrapper.appendChild(rrow);
        }

        container.appendChild(wrapper);
        if (role === 'user' || streaming) this._stickBottom = true;
        if (this._stickBottom !== false) container.scrollTop = container.scrollHeight;
        return bubble;
    },

    _buildMsgActions(role, content, messageId, wrapper) {
        const actions = document.createElement('div');
        actions.className = 'msg-actions';
        if (role === 'assistant') {
            const I = ZRender.icons;
            const ico = {
                speak: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
                share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
                more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>'
            };
            actions.classList.add('zr-actions');
            actions.innerHTML =
                '<button type="button" data-action="copy" title="Copy" aria-label="Copy reply">' + I.copy + '<span>Copy</span></button>' +
                '<button type="button" data-action="speak" title="Read aloud" aria-label="Read aloud">' + ico.speak + '</button>' +
                '<button type="button" data-action="share" title="Share" aria-label="Share reply">' + ico.share + '</button>' +
                '<div class="zr-menu-wrap"><button type="button" data-action="more" title="Save as\u2026" aria-label="More options" aria-haspopup="menu" aria-expanded="false">' + I.dl + '<span>Save as</span></button>' +
                '<div class="zr-menu" role="menu" hidden>' +
                    '<button type="button" role="menuitem" data-fmt="docx">Word (.docx)</button>' +
                    '<button type="button" role="menuitem" data-fmt="pdf">PDF</button>' +
                    '<button type="button" role="menuitem" data-fmt="md">Markdown (.md)</button>' +
                    '<button type="button" role="menuitem" data-fmt="html">Web page (.html)</button>' +
                    '<button type="button" role="menuitem" data-fmt="txt">Plain text (.txt)</button>' +
                '</div></div>';
            const plainText = () => ZRender.plain(content);
            const baseName = () => {
                const h = /^#\s+(.+)$/m.exec(content.replace(/<zfile[\s\S]*?(<\/zfile>|$)/gi, ''));
                const t = (h ? h[1] : (Chat.chats[Chat.activeId] && Chat.chats[Chat.activeId].title) || 'response');
                return t.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 50) || 'response';
            };
            actions.querySelector('[data-action="copy"]').addEventListener('click', e => ZRender.copyText(plainText(), e.currentTarget));
            actions.querySelector('[data-action="speak"]').addEventListener('click', () => Voice.speak(plainText().replace(/```[\s\S]*?```/g, ' (code) ')));
            actions.querySelector('[data-action="share"]').addEventListener('click', async () => {
                const txt = plainText();
                const short = txt.length > 280 ? txt.slice(0, 280) + '\u2026' : txt;
                if (navigator.share) {
                    try { await navigator.share({ title: 'Zelpophai AI', text: short + '\n\nTry Zelpophai AI: ' + location.origin }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
                }
                Chat._shareMenu(actions.querySelector('[data-action="share"]'), short);
            });
            const moreBtn = actions.querySelector('[data-action="more"]');
            const menu = actions.querySelector('.zr-menu');
            const closeMenu = () => { menu.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', outside, true); };
            const outside = e => { if (!menu.contains(e.target) && e.target !== moreBtn && !moreBtn.contains(e.target)) closeMenu(); };
            moreBtn.addEventListener('click', () => {
                const open = menu.hidden;
                document.querySelectorAll('.zr-menu').forEach(m => { m.hidden = true; });
                menu.hidden = !open;
                moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
                if (open) setTimeout(() => document.addEventListener('click', outside, true), 0);
            });
            menu.addEventListener('click', e => {
                const b = e.target.closest('[data-fmt]'); if (!b) return;
                closeMenu();
                const src = content.replace(/<zfile\b[^>]*>\n?([\s\S]*?)(<\/zfile>|$)/gi, '$1');
                Chat.downloadAs(src, baseName(), b.getAttribute('data-fmt'));
            });
        } else {
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
                if (!messageId) {
                    Chat.renderMessages();
                    return;
                }
                Chat.editMessage(messageId, content, wrapper);
            });
        }
        return actions;
    },

    _shareMenu(anchor, text) {
        const old = document.getElementById('zr-share-pop');
        if (old) { old.remove(); return; }
        const pop = document.createElement('div');
        pop.id = 'zr-share-pop';
        pop.className = 'zr-menu zr-share-pop';
        pop.setAttribute('role', 'menu');
        const msg = encodeURIComponent('Zelpophai AI:\n\n' + text + '\n\nTry Zelpophai AI: ' + location.origin);
        pop.innerHTML = '<a role="menuitem" target="_blank" rel="noopener" href="https://wa.me/?text=' + msg + '">WhatsApp</a>' +
            '<a role="menuitem" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=' + msg + '">X (Twitter)</a>' +
            '<button type="button" role="menuitem" data-copy="1">Copy text</button>';
        anchor.parentElement.appendChild(pop);
        pop.querySelector('[data-copy]').addEventListener('click', () => { ZRender.copyText(text); pop.remove(); });
        pop.addEventListener('click', e => { if (e.target.closest('a')) setTimeout(() => pop.remove(), 50); });
        setTimeout(() => document.addEventListener('click', function off(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', off, true); } }, true), 0);
    },

    async _postStreamSync(userWrapper, textToMatch) {
        try {
            const { messages } = await api(`/api/chats/${this.activeId}/messages`);
            if (!messages.length) return;
            const aiMsg = [...messages].reverse().find(m => m.role === 'assistant');
            const userMsg = [...messages].reverse().find(m => m.role === 'user');
            const assist = document.querySelector('.msg-wrapper.assistant:last-of-type');
            if (assist && aiMsg) {
                const old = assist.querySelector('.msg-actions');
                if (old) old.remove();
                const built = this._buildMsgActions('assistant', textToMatch, aiMsg.id, assist);
                assist.appendChild(built);
                let v = null;
                try { v = JSON.parse(aiMsg.viewer_reactions || '{}'); } catch (e) {}
                const rrow = this._buildViewerReactions(v);
                if (rrow) assist.appendChild(rrow);
            }
            if (userWrapper && userMsg) {
                const oldU = userWrapper.querySelector('.msg-actions');
                if (oldU) oldU.remove();
                userWrapper.appendChild(this._buildMsgActions('user', userMsg.content, userMsg.id, userWrapper));
                let v = null;
                try { v = JSON.parse(userMsg.viewer_reactions || '{}'); } catch (e2) {}
                const rrowU = this._buildViewerReactions(v);
                if (rrowU) userWrapper.appendChild(rrowU);
            }
        } catch (e) {}
    },

    _buildViewerReactions(viewer) {
        if (!viewer) return null;
        const entries = Object.entries(viewer).filter(([, n]) => Number(n) > 0);
        if (!entries.length) return null;
        const row = document.createElement('div');
        row.className = 'msg-reactions viewer';
        const badge = document.createElement('span');
        badge.className = 'viewer-badge';
        badge.title = 'Reactions from people viewing your shared link';
        badge.textContent = '👥';
        row.appendChild(badge);
        entries.sort((a, b) => b[1] - a[1]).forEach(([emoji, n]) => {
            const chip = document.createElement('span');
            chip.className = 'reaction-chip static';
            chip.textContent = emoji + ' ' + n;
            row.appendChild(chip);
        });
        return row;
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
            else if (!bubble.querySelector('.file-pill') && !bubble.querySelector('img')) bubble.textContent = trimmed;
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
                body: JSON.stringify({ content: trimmed, tz: Chat._tz() }),
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
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.token) {
                            fullResponse += parsed.token;
                            this.updateStreamingBubble(assistantBubble, fullResponse);
                        }
                        if (parsed.files || parsed.content || parsed.file_error || parsed.title) {
                            const st = { text: fullResponse };
                            this._handleStreamMeta(parsed, assistantBubble, st);
                            fullResponse = st.text;
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
                this.finalizeBubble(assistantBubble, fullResponse);
                const aw = assistantBubble.parentElement;
                const oldA = aw.querySelector('.msg-actions');
                if (oldA) oldA.remove();
                aw.appendChild(this._buildMsgActions('assistant', fullResponse, null, aw));
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
            this._stopSketch();
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

    // Make every rendered image clickable (zoom lightbox) and tag generated
    // ones so they get the capped size instead of overflowing the bubble.
    _wireImages(scope) {
        if (!scope) return;
        scope.querySelectorAll('img').forEach(img => {
            if (img.dataset.imgWired) return;
            img.dataset.imgWired = '1';
            if (img.alt === 'Generated image') img.classList.add('gen-image');
            img.addEventListener('click', () => this._openImageLightbox(img.currentSrc || img.src));
        });
    },

    _openImageLightbox(src) {
        if (!src) return;
        let lb = $('img-lightbox');
        if (!lb) {
            lb = document.createElement('div');
            lb.id = 'img-lightbox';
            lb.className = 'img-lightbox';
            lb.innerHTML =
                '<img alt="Generated image">' +
                '<div class="img-lightbox-actions">' +
                    '<button class="il-dl" data-act="download"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download</button>' +
                    '<a class="il-open" data-act="open" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> Open</a>' +
                    '<button class="il-close" data-act="close">\u2715 Close</button>' +
                '</div>';
            document.body.appendChild(lb);
            lb.addEventListener('click', (e) => { if (e.target === lb) lb.classList.remove('open'); });
            lb.querySelector('[data-act="close"]').addEventListener('click', () => lb.classList.remove('open'));
            lb.querySelector('[data-act="open"]').addEventListener('click', (e) => { e.preventDefault(); window.open(lb.querySelector('img').src, '_blank', 'noopener'); });
            lb.querySelector('[data-act="download"]').addEventListener('click', () => Chat._downloadImage(lb.querySelector('img').src));
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape') lb.classList.remove('open'); });
        }
        lb.querySelector('img').src = src;
        lb.querySelector('[data-act="open"]').href = src;
        lb.classList.add('open');
    },

    _downloadImage(src) {
        const name = 'zelpophai-image-' + Date.now() + '.png';
        fetch(src, { credentials: 'same-origin' })
            .then(r => { if (!r.ok) throw new Error('x'); return r.blob(); })
            .then(blob => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = name;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(a.href);
                showToast('Image downloaded', 'success');
            })
            .catch(() => {
                // Cross-origin (e.g. Pollinations) — fall back to a direct download link.
                const a = document.createElement('a');
                a.href = src; a.download = name; a.target = '_blank'; a.rel = 'noopener';
                document.body.appendChild(a);
                a.click();
                a.remove();
            });
    },

    // Generate an image now (used by the auto image-gen hook + image button),
    // persisting it as an assistant message so it survives reload.
    async generateImageNow(prompt) {
        if (!prompt || !prompt.trim()) return false;
        if (!this.activeId) await this.create();
        const ph = this.appendMessage('assistant', '', true);
        this._showSketching(ph, 'Painting it out');
        try {
            const { url } = await api('/api/image/generate', {
                method: 'POST',
                body: JSON.stringify({ prompt: prompt.trim(), width: 1024, height: 1024, chat_id: this.activeId }),
            });
            this._stopSketch();
            if (ph && ph.parentElement) ph.remove();
            this.appendMessage('assistant', `**Prompt:** ${prompt}\n\n![Generated image](${url})`);
            showToast('Image generated!', 'success');
            return true;
        } catch (e) {
            const msg = String(e.message || '');
            if (typeof showLimitPopup === 'function' && /wait\s+\d+m\s*\d+s|cooldown|pause|guest/i.test(msg)) showLimitPopup(msg);
            else showToast('Image generation failed: ' + msg, 'error');
            return false;
        } finally {
            this._stopSketch();
            if (ph && ph.parentElement) ph.remove();
        }
    },

    // Follow-up edit of the last generated image ("add a bell around the cow").
    // The server merges the change into the previous prompt and reuses its seed
    // for a similar composition, persisting the result as an assistant message.
    async editGeneratedImage(change) {
        if (!change || !change.trim()) return false;
        if (!this.activeId) await this.create();
        const ph = this.appendMessage('assistant', '', true);
        this._showSketching(ph, 'Refining it');
        try {
            const { url, prompt, change: applied } = await api('/api/image/edit', {
                method: 'POST',
                body: JSON.stringify({ chat_id: this.activeId, change: change.trim(), width: 1024, height: 1024 }),
            });
            this._stopSketch();
            if (ph && ph.parentElement) ph.remove();
            this.appendMessage('assistant', `**Prompt:** ${prompt}\n\n**Changed:** ${applied}\n\n![Generated image](${url})`);
            showToast('Image updated!', 'success');
            return true;
        } catch (e) {
            const msg = String(e.message || '');
            if (typeof showLimitPopup === 'function' && /wait\s+\d+m\s*\d+s|cooldown|pause|guest/i.test(msg)) showLimitPopup(msg);
            else showToast('Could not update image: ' + msg, 'error');
            return false;
        } finally {
            this._stopSketch();
            if (ph && ph.parentElement) ph.remove();
        }
    },

    /* ====================== AI video ======================
       generateVideoNow() submits a job to /api/video/generate, shows a live
       "rendering" card and polls /api/video/status until the clip is saved.
       The server keeps watching even if the tab closes, and resumeVideos()
       picks the card back up when the chat is opened again. */
    _videoTimers: {},

    // Turn the "[▶ Generated video](/api/video/serve/...)" link the server saves into a real player.
    enhanceVideos(root) {
        if (!root) return;
        root.querySelectorAll('a[href^="/api/video/serve/"]').forEach(a => {
            const src = a.getAttribute('href');
            if (!/^\/api\/video\/serve\/vid_[0-9a-f]{16}\.mp4$/.test(src)) return;
            const meta = (a.textContent || '').replace(/^[\u25B6\s]+/, '').replace(/^Generated video\s*/i, '').replace(/[()]/g, '').trim();
            const fig = document.createElement('figure');
            fig.className = 'zp-video';
            const v = document.createElement('video');
            v.src = src;
            v.controls = true;
            v.playsInline = true;
            v.preload = 'metadata';
            v.setAttribute('aria-label', 'Generated video');
            const cap = document.createElement('figcaption');
            const info = document.createElement('span');
            info.textContent = meta ? 'Video \u00b7 ' + meta : 'Video';
            const dl = document.createElement('a');
            dl.href = src;
            dl.setAttribute('download', src.split('/').pop());
            dl.textContent = 'Download .mp4';
            cap.appendChild(info);
            cap.appendChild(dl);
            fig.appendChild(v);
            fig.appendChild(cap);
            const host = a.closest('p') && a.closest('p').textContent.trim() === a.textContent.trim() ? a.closest('p') : a;
            host.replaceWith(fig);
        });
    },

    _videoCard(bubble, prompt, duration, aspect) {
        bubble.classList.remove('streaming-cursor');
        bubble.innerHTML =
            '<div class="zp-vjob">' +
              '<div class="zp-vjob-top"><span class="zp-vjob-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="14" height="14" rx="3"/><path d="M16 10l6-3v10l-6-3z"/></svg></span>' +
                '<span class="zp-vjob-title">Rendering your video</span><span class="zp-vjob-time">0:00</span></div>' +
              '<div class="zp-vjob-prompt"></div>' +
              '<div class="zp-vjob-stage ' + (aspect === '9:16' ? 'tall' : '') + '"><div class="zp-vjob-shimmer"></div></div>' +
              '<div class="zp-vjob-bar"><i></i></div>' +
              '<div class="zp-vjob-note">' + duration + 's \u00b7 ' + aspect + ' \u00b7 with sound \u2014 usually ready in 1\u20133 minutes. You can keep chatting.</div>' +
            '</div>';
        bubble.querySelector('.zp-vjob-prompt').textContent = prompt;
        return bubble;
    },

    _tickVideoCard(bubble, elapsed, status) {
        const t = bubble.querySelector('.zp-vjob-time');
        if (t) t.textContent = Math.floor(elapsed / 60) + ':' + String(elapsed % 60).padStart(2, '0');
        const bar = bubble.querySelector('.zp-vjob-bar i');
        if (bar) bar.style.width = Math.min(94, Math.round(94 * (1 - Math.exp(-elapsed / 70)))) + '%';
        const title = bubble.querySelector('.zp-vjob-title');
        if (title && status === 'in_progress') title.textContent = 'Rendering your video';
    },

    async generateVideoNow(prompt, opts = {}) {
        if (!prompt || !prompt.trim()) return false;
        if (!this.activeId) await this.create();
        const chatId = this.activeId;
        const duration = [4, 6, 8].includes(opts.duration) ? opts.duration : 6;
        const aspect = opts.aspect === '9:16' ? '9:16' : '16:9';
        const bubble = this.appendMessage('assistant', '', true);
        this._videoCard(bubble, prompt.trim(), duration, aspect);
        try {
            const res = await api('/api/video/generate', {
                method: 'POST',
                body: JSON.stringify({ prompt: prompt.trim(), chat_id: chatId, duration, aspect, image: opts.image || null, user_text: opts.userText || null }),
            });
            if (typeof res.remaining === 'number') showToast('Video started \u2014 ' + res.remaining + ' left today', 'success');
            if (res.chat_title && this.chats[chatId] && this.chats[chatId].title !== res.chat_title) {
                this.chats[chatId].title = res.chat_title;
                this.renderList();
                this.renderHeader();
            }
            this._pollVideo(res.id, bubble, chatId);
            return true;
        } catch (e) {
            const msg = String(e.message || 'Could not start the video');
            if (bubble && bubble.parentElement) bubble.parentElement.remove();
            if (/pro feature|upgrade/i.test(msg) && typeof Billing !== 'undefined' && typeof Billing.showUpgrade === 'function') Billing.showUpgrade(msg);
            else showToast(msg, 'error');
            return false;
        }
    },

    _pollVideo(jobId, bubble, chatId) {
        clearInterval(this._videoTimers[jobId]);
        const t0 = Date.now();
        let localElapsed = 0;
        const tick = setInterval(() => {
            localElapsed = Math.round((Date.now() - t0) / 1000) + (bubble._baseElapsed || 0);
            if (!bubble.isConnected) return;
            this._tickVideoCard(bubble, localElapsed, bubble._status);
        }, 1000);
        const poll = async () => {
            try {
                const st = await api('/api/video/status/' + jobId);
                bubble._status = st.status;
                if (!bubble._baseElapsed && st.elapsed) bubble._baseElapsed = Math.max(0, st.elapsed - Math.round((Date.now() - t0) / 1000));
                if (st.status === 'completed') {
                    clearInterval(this._videoTimers[jobId]); clearInterval(tick);
                    delete this._videoTimers[jobId];
                    if (this.activeId === chatId && bubble.isConnected) {
                        const md = `**Video:** ${st.prompt}\n\n[\u25B6 Generated video (${st.duration}s, ${st.aspect})](${st.url})`;
                        bubble.classList.remove('streaming-cursor');
                        bubble.innerHTML = DOMPurify.sanitize(marked.parse(md));
                        this.enhanceVideos(bubble);
                    }
                    showToast('Your video is ready!', 'success');
                } else if (st.status === 'failed') {
                    clearInterval(this._videoTimers[jobId]); clearInterval(tick);
                    delete this._videoTimers[jobId];
                    if (bubble.isConnected) {
                        bubble.innerHTML = '';
                        const p = document.createElement('p');
                        p.className = 'zp-vjob-fail';
                        p.textContent = 'The video couldn\u2019t be made: ' + (st.error || 'unknown error') + ' It didn\u2019t count toward your daily videos.';
                        bubble.appendChild(p);
                    }
                    showToast('Video failed \u2014 it didn\u2019t use up your allowance', 'error');
                }
            } catch (e) { /* network blip: try again next round */ }
        };
        this._videoTimers[jobId] = setInterval(poll, 5000);
        setTimeout(poll, 1500);
    },

    async resumeVideos(chatId) {
        if (!chatId) return;
        try {
            const { jobs } = await api('/api/video/pending?chat_id=' + chatId);
            (jobs || []).forEach(j => {
                if (this._videoTimers[j.id] || this.activeId !== chatId) return;
                const bubble = this.appendMessage('assistant', '', true);
                this._videoCard(bubble, j.prompt, j.duration, j.aspect);
                this._pollVideo(j.id, bubble, chatId);
            });
        } catch (e) {}
    },

    // Composer "Video" button: a small dialog for the prompt, length and shape.
    async openVideoDialog() {
        let cfg = null;
        try { cfg = await api('/api/video/config'); } catch (e) {}
        if (cfg && !cfg.allowed) {
            const msg = cfg.enabled ? 'Video generation is a Pro feature. Upgrade to make videos.' : 'Video generation is switched off right now.';
            if (cfg.enabled && typeof Billing !== 'undefined' && typeof Billing.showUpgrade === 'function') Billing.showUpgrade(msg); else showToast(msg, 'error');
            return;
        }
        if (document.getElementById('zp-vdlg')) return;
        const imgAtt = this.attachments.find(a => a.type === 'image');
        const ov = document.createElement('div');
        ov.id = 'zp-vdlg';
        ov.className = 'zp-vdlg';
        ov.innerHTML =
            '<div class="zp-vdlg-card" role="dialog" aria-modal="true" aria-labelledby="zp-vdlg-t">' +
              '<button type="button" class="zp-vdlg-x" aria-label="Close">\u00d7</button>' +
              '<h3 id="zp-vdlg-t">Make a video</h3>' +
              '<p class="zp-vdlg-sub"></p>' +
              '<label for="zp-vdlg-p">Describe the scene</label>' +
              '<textarea id="zp-vdlg-p" rows="3" maxlength="800" placeholder="A neon city street after rain, slow camera push, reflections on the road"></textarea>' +
              '<div class="zp-vdlg-row"><span>Length</span><div class="zp-seg" data-k="duration"><button type="button" data-v="4">4s</button><button type="button" data-v="6" class="on">6s</button><button type="button" data-v="8">8s</button></div></div>' +
              '<div class="zp-vdlg-row"><span>Shape</span><div class="zp-seg" data-k="aspect"><button type="button" data-v="16:9" class="on">Wide 16:9</button><button type="button" data-v="9:16">Tall 9:16</button></div></div>' +
              (imgAtt ? '<p class="zp-vdlg-img">Your attached photo will be the first frame.</p>' : '') +
              '<div class="zp-vdlg-actions"><button type="button" class="zp-vdlg-cancel">Cancel</button><button type="button" class="zp-vdlg-go">Create video</button></div>' +
            '</div>';
        document.body.appendChild(ov);
        const sub = ov.querySelector('.zp-vdlg-sub');
        sub.textContent = cfg ? (cfg.remaining + ' of ' + cfg.daily_limit + ' videos left today') : 'Short clips with sound';
        const sel = { duration: 6, aspect: '16:9' };
        ov.querySelectorAll('.zp-seg').forEach(seg => seg.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
            sel[seg.dataset.k] = seg.dataset.k === 'duration' ? parseInt(b.dataset.v, 10) : b.dataset.v;
        }));
        const ta = ov.querySelector('textarea');
        const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = e => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        ov.addEventListener('click', e => { if (e.target === ov) close(); });
        ov.querySelector('.zp-vdlg-x').onclick = close;
        ov.querySelector('.zp-vdlg-cancel').onclick = close;
        ov.querySelector('.zp-vdlg-go').onclick = async () => {
            const prompt = ta.value.trim();
            if (prompt.length < 3) { ta.focus(); return; }
            close();
            const image = imgAtt ? imgAtt.data : null;
            if (imgAtt) { this.attachments = this.attachments.filter(a => a !== imgAtt); this.renderAtts(); }
            const said = 'Make a ' + sel.duration + '-second video: ' + prompt;
            this.appendMessage('user', said, false, image ? [image] : []);
            await this.generateVideoNow(prompt, { duration: sel.duration, aspect: sel.aspect, image, userText: said });
        };
        setTimeout(() => ta.focus(), 30);
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

    // Tokens arrive many times a second; re-rendering Markdown on every one made
    // long answers stutter. Render at most once per animation frame (~every 60ms),
    // and only highlight code once each block is finished.
    updateStreamingBubble(bubble, text) {
        this._stopSketch();
        bubble._pendingText = text;
        if (bubble._raf) return;
        const now = performance.now();
        const wait = Math.max(0, 60 - (now - (bubble._lastPaint || 0)));
        bubble._raf = setTimeout(() => requestAnimationFrame(() => {
            bubble._raf = null;
            bubble._lastPaint = performance.now();
            if (!bubble.isConnected || bubble._final) return;
            const thinking = bubble.querySelector('.thinking-text');
            if (thinking) thinking.remove();
            ZRender.render(bubble, bubble._pendingText, { streaming: true });
            Chat._wireImages(bubble);
            Chat._autoScroll();
        }), wait);
    },

    // Final, full-quality render once the reply is complete.
    finalizeBubble(bubble, text) {
        if (!bubble) return;
        if (bubble._raf) { clearTimeout(bubble._raf); bubble._raf = null; }
        bubble._final = true;
        bubble.classList.remove('streaming-cursor');
        const thinking = bubble.querySelector('.thinking-text');
        if (thinking) thinking.remove();
        ZRender.render(bubble, text);
        Chat.enhanceVideos(bubble);
        Chat._wireImages(bubble);
        Chat._autoScroll();
    },

    // Keep following the reply only while the reader is at the bottom; if they
    // scrolled up to read, leave them there (the ↓ button takes them back).
    _autoScroll(force) {
        const c = $('chat-container');
        if (!c) return;
        if (force || this._stickBottom !== false) c.scrollTop = c.scrollHeight;
    },

    // The user's time zone, so "remind me at 9" means 9 o'clock where they are.
    _tz() {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
    },

    // Extra server events that ride along the reply stream.
    _handleStreamMeta(parsed, bubble, state) {
        (parsed.video_jobs || []).forEach(job => {
            if (!job || !job.id || this._videoTimers[job.id]) return;
            const vb = this.appendMessage('assistant', '', true);
            this._videoCard(vb, job.prompt || '', job.duration || 6, job.aspect || '16:9');
            this._pollVideo(job.id, vb, this.activeId);
        });
        if (parsed.files || parsed.content) {
            if (parsed.content) state.text = parsed.content;
            this.finalizeBubble(bubble, state.text);
            (parsed.files || []).forEach(f => {
                if (f.error) showToast(f.name + ': ' + f.error, 'error');
                else if (f.truncated) showToast(f.name + ' may be cut short \u2014 ask me to continue it', 'error');
            });
            const ok = (parsed.files || []).filter(f => !f.error);
            if (ok.length) showToast(ok.length === 1 ? (ok[0].name + ' is ready') : (ok.length + ' files are ready'), 'success');
            const wrap = bubble.parentElement;
            if (wrap) {
                const old = wrap.querySelector('.msg-actions');
                if (old) old.replaceWith(this._buildMsgActions('assistant', state.text, parsed.message_id || null, wrap));
            }
            if (typeof Files !== 'undefined' && Files && typeof Files.load === 'function') { try { Files.load(); } catch (e) {} }
        }
        if (parsed.file_error) {
            bubble.querySelectorAll('.zf-card.pending, .zf-card.writing').forEach(card => {
                card.classList.remove('pending', 'writing');
                card.classList.add('failed');
                const sub = card.querySelector('.zf-sub');
                if (sub) sub.textContent = parsed.file_error;
            });
            if (typeof showLimitPopup === 'function' && /limit|cooldown|wait|guest|pause/i.test(parsed.file_error)) showLimitPopup(parsed.file_error);
        }
        if (parsed.title && parsed.chat_id && this.chats[parsed.chat_id]) {
            this.chats[parsed.chat_id].title = parsed.title;
            this.renderList();
            if (this.activeId === parsed.chat_id) this.renderHeader();
        }
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
        if (this._sending) return; // already uploading attachments — no re-entry
        if (this._reading > 0) return; // big files still being read into the composer
        if (this.attachments.some(a => a.uploading)) return; // wait until every file is fully loaded
        if (this._limitBlocked) return; // messaging auto-disabled while a limit cooldown banner is live
        if (window.__msgBlocked === true) return; // global messaging off → send button does nothing
        if (!this.activeId) await this.create();

        const think = $('think-btn').classList.contains('active');
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
        const sendSlot = $('send-btn');
        if (this.attachments.length) {
            // Block sending while files load; show a spinner on the send button and
            // on each attachment chip. If any file fails to fully load, abort the send.
            this._sending = true;
            const spin = document.createElement('span');
            spin.className = 'snd-spin';
            if (sendSlot) { sendSlot.disabled = true; sendSlot.prepend(spin); }
            try {
                for (const att of this.attachments) {
                    att.uploading = true;
                    this.renderAtts();
                    try {
                        const uploaded = await this.uploadToServer(att);
                        if (!uploaded || !uploaded.id) throw new Error(`"${att.name}" could not be uploaded — message not sent`);
                        uploadedFiles.push(uploaded);
                        // Binary attachments (pdf/docx/xlsx/pptx/audio/video/code) aren't readable
                        // client-side — pull the server-extracted content so the AI can actually
                        // read, edit and replicate the file.
                        if (att.type === 'file' && uploaded.id) {
                            const rr = await fetch(`/api/files/${uploaded.id}/read`, { credentials: 'same-origin' });
                            if (!rr.ok) throw new Error(`"${att.name}" could not be read`);
                            const jj = await rr.json();
                            if (jj.type !== 'image' && jj.content) {
                                fullContent += `\n\n[File content: ${att.name}]\n${jj.content.slice(0, 12000)}`;
                            }
                            if (jj.frames && jj.frames.length) {
                                jj.frames.slice(0, 4).forEach(fr => images.push(fr));
                            }
                        }
                    } finally {
                        att.uploading = false;
                        this.renderAtts();
                    }
                }
            } catch (err) {
                this.attachments.forEach(a => { a.uploading = false; });
                this.renderAtts();
                showToast('Could not send: ' + err.message, 'error');
                if (typeof showLimitPopup === 'function' && /wait\s+\d+m\s*\d+s|cooldown|pause|guest|limit/i.test(err.message)) showLimitPopup(err.message);
                return;
            } finally {
                this._sending = false;
                if (sendSlot) { sendSlot.disabled = false; spin.remove(); }
            }
        }
        const sendImages = this.attachments.filter(a => a.type === 'image').map(a => a.data);
        const imageUrls = uploadedFiles.filter(f => f.is_image).map(f => `/uploads/${f.stored_name}`);
        const regenBtn = $('regen-btn');
        if (regenBtn) regenBtn.style.display = 'none';
        let displayText = text;
        const displayFiles = this.attachments.filter(a => a.type !== 'image');
        const displayImages = imageUrls.length > 0 ? imageUrls : sendImages;
        const userBubble = this.appendMessage('user', displayText || (displayFiles.length ? '' : '(image)'), false, displayImages, displayFiles);
        const userWrapper = userBubble ? userBubble.parentElement : null;
        input.value = '';
        input.style.height = 'auto';

        this.attachments = [];
        this.renderAtts();

        // Auto image generation + follow-up edits: "generate a pic of..." creates
        // an image; "add a bell around the cow" / "make it blue" applies a
        // follow-up edit to the last generated image in this chat.
        if (text) {
            const vid = typeof window.detectVideoRequest === 'function' ? window.detectVideoRequest(text, sendImages.length > 0) : null;
            if (vid) {
                await this.generateVideoNow(vid.prompt, { duration: vid.duration, aspect: vid.aspect, image: sendImages[0] || null, userText: text });
                input.focus();
                return; // the video is the response
            }
            const imgPrompt = typeof window.detectImageRequest === 'function' ? window.detectImageRequest(text) : null;
            if (imgPrompt) {
                await this.generateImageNow(imgPrompt);
                input.focus();
                return; // the image is the response — don't also stream a text reply
            }
            const change = typeof window.detectImageEditRequest === 'function' ? window.detectImageEditRequest(text) : null;
            if (change && this._hasGeneratedImage()) {
                await this.editGeneratedImage(change);
                input.focus();
                return;
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
                body: JSON.stringify({ content: fullContent, images, think, research, factcheck, tz: Chat._tz() }),
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
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.token) {
                            fullResponse += parsed.token;
                            this.updateStreamingBubble(bubble, fullResponse);
                        }
                        if (parsed.files || parsed.content || parsed.file_error || parsed.title) {
                            const st = { text: fullResponse };
                            this._handleStreamMeta(parsed, bubble, st);
                            fullResponse = st.text;
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
                            this._showReplyError(bubble, parsed.error, fullResponse);
                        }
                    } catch (e) {}
                }
            }

            bubble.classList.remove('streaming-cursor');
            if (fullResponse) {
                this.finalizeBubble(bubble, fullResponse);
                // Voice-to-voice auto speak if enabled
                if (Voice.voiceToVoice) {
                    Voice.speak(fullResponse, true);
                }
                // Notify if app was minimized/background when response done (WhatsApp-style)
                if (document.hidden || !document.hasFocus()) {
                    try { const a=new Audio('/static/sounds/notify.mp3'); a.volume=0.6; a.play().catch(()=>{}); } catch {}
                    if (typeof devicePush === 'function') devicePush('Zelpophai — reply ready', fullResponse.slice(0,120), 'ai-reply');
                    if (typeof showDiscordToast === 'function') showDiscordToast('Zelpophai AI', 'New reply', fullResponse.slice(0,80), 'Z');
                    // Also try native notification directly
                    try {
                        if ('Notification' in window && Notification.permission === 'granted') {
                            const n = new Notification('Zelpophai — reply ready', { body: fullResponse.slice(0,120), icon: '/static/icons/icon-192.png', tag: 'ai-reply', requireInteraction: true });
                            n.onclick = () => { window.focus(); n.close(); };
                        }
                    } catch {}
                }
                // Long-reply nudge while the app is open (attraction feature)
                if (fullResponse.length > 2400) {
                    showToast('✅ Done — a long reply is ready for you', 'success');
                }
                // Add action buttons (full set, same as after a reload — no refresh needed)
                const aiWrapper = bubble.parentElement;
                const old = aiWrapper.querySelector('.msg-actions');
                if (old) old.remove();
                aiWrapper.appendChild(this._buildMsgActions('assistant', fullResponse, null, aiWrapper));
                this._postStreamSync(userWrapper, fullResponse);
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                bubble.querySelector('.thinking-text')?.remove();
                if (!fullResponse) bubble.textContent = 'Stopped.';
                bubble.classList.remove('streaming-cursor');
            } else if (!navigator.onLine || err.message === 'Failed to fetch') {
                // Network lost mid-chat — show the offline notice
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
            this._stopSketch();
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

    _isBusyError(detail) {
        const d = String(detail || '');
        return /busy|too many requests/i.test(d);
    },

    _looksLikeGenerationRequest(text) {
        if (!text) return false;
        const t = String(text).toLowerCase();
        const saysGenerate = /\b(generate|create|make|write|produce|build|draft|compile|compose)\b/.test(t);
        const wantsFile = /\b(doc|docs|document|docx|ppt|pptx|slides|spreadsheet|sheet|xlsx|xl|csv|pdf|file|report|resume|cover[ -]?letter|essay|notes|invoice)\b/.test(t);
        return saysGenerate && wantsFile;
    },

    // A failed reply shows a clear error with a Retry button instead of a dead bubble.
    _showReplyError(bubble, msg, partial) {
        bubble.classList.remove('streaming-cursor');
        bubble._final = true;
        if (bubble._raf) { clearTimeout(bubble._raf); bubble._raf = null; }
        if (partial) ZRender.render(bubble, partial); else bubble.innerHTML = '';
        const box = document.createElement('div');
        box.className = 'zr-error';
        box.setAttribute('role', 'alert');
        const busy = this._isBusyError(msg);
        box.innerHTML = '<div class="zr-error-t"></div><div class="zr-error-d"></div>';
        box.querySelector('.zr-error-t').textContent = busy ? 'Zelpophai AI is busy right now' : 'Something went wrong';
        box.querySelector('.zr-error-d').textContent = busy ? 'Too many people are asking at once. Wait a few seconds and try again.' : String(msg || '').slice(0, 300);
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'zf-btn primary';
        retry.textContent = 'Try again';
        retry.addEventListener('click', () => {
            if (this.isStreaming) return;
            this.regenerate(); // removes this failed reply and asks again
        });
        box.appendChild(retry);
        bubble.appendChild(box);
    },

    // While a file is being generated, replace the assistant bubble with the
    // "sketching" wait animation: a calming dot-matrix grid, a rotating status
    // line and a percentage pill that eases toward ~95% until the file is ready.
    _showSketching(bubble, titleText) {
        if (!bubble) return;
        this._stopSketch();
        const cols = 22, rows = 13;
        const titles = ['Sketching it out', 'Laying out the page', 'Drafting the content', 'Polishing the details', 'Finishing touches'];
        let dots = '';
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const delay = (((x * 0.5 + y * 0.9) % 6) / 6 * 1.5).toFixed(2);
                dots += `<i class="sk-d" style="animation-delay:${delay}s"></i>`;
            }
        }
        bubble.classList.remove('streaming-cursor');
        bubble.innerHTML =
            `<div class="sk"><div class="sk-title">${this.escapeHtml(titleText || titles[0])}</div>` +
            `<div class="sk-grid" style="grid-template-columns:repeat(${cols},1fr)">${dots}</div>` +
            `<div class="sk-pct">0%</div></div>`;
        const pctEl = bubble.querySelector('.sk-pct');
        const titleEl = bubble.querySelector('.sk-title');
        const t0 = Date.now();
        let ti = 0;
        this._sketchTimer = setInterval(() => {
            const s = (Date.now() - t0) / 1000;
            const pct = Math.min(95, Math.round(95 * (1 - Math.exp(-s / 7))));
            if (pctEl) pctEl.textContent = pct + '%';
            if (!titleText && titleEl) {
                const want = Math.min(titles.length - 1, Math.floor(s / 2.6));
                if (want !== ti) { ti = want; titleEl.textContent = titles[ti]; }
            }
        }, 240);
    },

    _stopSketch() {
        if (this._sketchTimer) { clearInterval(this._sketchTimer); this._sketchTimer = null; }
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
                body: JSON.stringify({ content: lastUserMsg.content, think: $('think-btn').classList.contains('active'), research: $('research-btn').classList.contains('active'), factcheck: $('factcheck-btn').classList.contains('active'), tz: Chat._tz() }),
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
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.token) {
                            fullResponse += parsed.token;
                            this.updateStreamingBubble(bubble, fullResponse);
                        }
                        if (parsed.files || parsed.content || parsed.file_error || parsed.title) {
                            const st = { text: fullResponse };
                            this._handleStreamMeta(parsed, bubble, st);
                            fullResponse = st.text;
                        }
                        if (parsed.error) {
                            showToast(parsed.error, 'error');
                            this._showReplyError(bubble, parsed.error, fullResponse);
                        }
                    } catch (e) {}
                }
            }

            bubble.classList.remove('streaming-cursor');
            if (fullResponse) {
                this.finalizeBubble(bubble, fullResponse);
                this.showRegenerate();
            }
        } catch (err) {
            if (err.name !== 'AbortError') showToast('Error: ' + err.message, 'error');
            else bubble.textContent = 'Stopped.';
        } finally {
            this._stopSketch();
            this.isStreaming = false;
            this.abortController = null;
            $('send-btn').style.display = 'flex';
            $('stop-btn').style.display = 'none';
        }
    },

    async handleFiles(files) {
        Array.from(files).forEach(file => {
            this._reading++;
            const done = () => { this._reading = Math.max(0, this._reading - 1); };
            const reader = new FileReader();
            const lower = file.name.toLowerCase();
            const isImage = file.type.startsWith('image/');
            const textExts = ['.txt','.md','.json','.csv','.js','.py','.html','.css','.xml','.yaml','.yml','.ts','.jsx','.tsx','.c','.cpp','.java','.go','.rs','.php','.rb','.sh','.sql','.log','.ini','.conf','.toml'];
            const isText = !isImage && (file.type.startsWith('text/') || file.type === 'application/json' || file.type === 'application/javascript' || file.type === 'application/xml' || textExts.some(ext => lower.endsWith(ext)));
            if (isImage) {
                reader.onload = e => {
                    done();
                    this.attachments.push({ name: file.name, type: 'image', data: e.target.result, file });
                    this.renderAtts();
                };
                reader.onerror = () => { done(); showToast('Could not read ' + file.name, 'error'); };
                reader.readAsDataURL(file);
            } else if (isText) {
                reader.onload = e => {
                    done();
                    this.attachments.push({ name: file.name, type: 'text', data: e.target.result, file });
                    this.renderAtts();
                };
                reader.onerror = () => { done(); showToast('Could not read ' + file.name, 'error'); };
                reader.readAsText(file);
            } else {
                done();
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
        const res = await fetch('/api/files/upload', { method: 'POST', credentials: 'same-origin', body: form });
        let data = null;
        try { data = await res.json(); } catch (e) { data = null; }
        if (!res.ok) {
            const detail = (data && data.detail) || ('upload failed (' + res.status + ')');
            throw new Error(detail);
        }
        return data && data.file ? data.file : null;
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
                div.innerHTML = `<img src="${att.data}" alt="${att.name}">${att.uploading ? '<div class="att-spin-overlay"><span class="att-spin"></span></div>' : `<button class="remove-att" data-i="${i}">\u2715</button>`}`;
            } else {
                const icon = fileIcon(att.name);
                if (att.uploading) {
                    div.innerHTML = `<div class="file-pill uploading"><div class="fp-ic">${icon}</div><div class="fp-info"><div class="fp-name">${this.escapeHtml(att.name)}</div><div class="fp-sub"><span class="att-spin chip"></span> Loading…</div></div></div>`;
                } else {
                    div.innerHTML = `<div class="file-pill"><div class="fp-ic">${icon}</div><div class="fp-info"><div class="fp-name">${this.escapeHtml(att.name)}</div><div class="fp-sub">File</div></div><button class="fp-x" data-i="${i}" title="Remove">\u2715</button></div>`;
                }
            }
            const rmBtn = div.querySelector('.remove-att') || div.querySelector('.fp-x');
            if (rmBtn) rmBtn.addEventListener('click', () => {
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
            const role = m.classList.contains('user') ? '**You**' : '**Zelpophai AI**';
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
