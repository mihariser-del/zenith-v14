const Knowledge = {
    bases: [],

    async load() {
        const { knowledge_bases } = await api('/api/knowledge');
        this.bases = knowledge_bases;
        this.render();
    },

    render() {
        const list = $('kb-list');
        if (!list) return;
        list.innerHTML = '';
        if (this.bases.length === 0) {
            list.innerHTML = '<p style="color:#888; text-align:center; font-size:13px; padding:20px;">No knowledge bases yet. Create one to get started.</p>';
            return;
        }
        this.bases.forEach(kb => {
            const div = document.createElement('div');
            div.style.cssText = 'padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; cursor:pointer; transition:0.2s;';
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <strong style="font-size:14px;">${this.escapeHtml(kb.name)}</strong>
                    <button style="background:none; border:none; color:var(--error); cursor:pointer; font-size:12px;" data-action="delete">Delete</button>
                </div>
                <div style="font-size:12px; color:#888;">${kb.item_count} items</div>
                ${kb.description ? `<div style="font-size:12px; color:#aaa; margin-top:4px;">${this.escapeHtml(kb.description)}</div>` : ''}`;
            div.addEventListener('click', (e) => {
                if (e.target.closest('[data-action="delete"]')) return;
                this.viewItems(kb.id);
            });
            div.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
                e.stopPropagation();
                this.remove(kb.id);
            });
            list.appendChild(div);
        });
    },

    async create() {
        const name = prompt('Knowledge base name:');
        if (!name || !name.trim()) return;
        const desc = prompt('Description (optional):') || '';
        await api('/api/knowledge', { method: 'POST', body: JSON.stringify({ name: name.trim(), description: desc.trim() }) });
        await this.load();
        showToast('Knowledge base created', 'success');
    },

    async remove(id) {
        if (!confirm('Delete this knowledge base and all its items?')) return;
        await api(`/api/knowledge/${id}`, { method: 'DELETE' });
        await this.load();
        showToast('Deleted', 'success');
    },

    async viewItems(kbId) {
        const { items } = await api(`/api/knowledge/${kbId}/items`);
        const modal = $('kb-items-modal');
        const title = $('kb-items-title');
        const list = $('kb-items-list');
        const kb = this.bases.find(b => b.id === kbId);
        title.textContent = kb ? kb.name : 'Knowledge Base';
        modal.dataset.kbId = kbId;
        list.innerHTML = '';
        if (items.length === 0) {
            list.innerHTML = '<p style="color:#888; text-align:center; font-size:13px; padding:20px;">No items yet.</p>';
        } else {
            items.forEach(item => {
                const div = document.createElement('div');
                div.style.cssText = 'padding:10px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; font-size:13px; display:flex; justify-content:space-between; align-items:flex-start; gap:8px;';
                const text = item.content.length > 200 ? item.content.slice(0, 200) + '...' : item.content;
                div.innerHTML = `
                    <div style="flex:1;">
                        <div style="color:var(--text); word-break:break-word;">${this.escapeHtml(text)}</div>
                        <div style="color:#666; font-size:11px; margin-top:4px;">${item.source_type} ${item.source ? '· ' + this.escapeHtml(item.source) : ''}</div>
                    </div>
                    <button style="background:none; border:none; color:var(--error); cursor:pointer; font-size:12px; flex-shrink:0;" data-id="${item.id}">X</button>`;
                div.querySelector('[data-id]').addEventListener('click', () => this.removeItem(kbId, item.id));
                list.appendChild(div);
            });
        }
        modal.style.display = 'flex';
    },

    async addItem(kbId) {
        const input = $('kb-item-input');
        const content = input.value.trim();
        if (!content) return;
        await api(`/api/knowledge/${kbId}/items`, { method: 'POST', body: JSON.stringify({ content }) });
        input.value = '';
        await this.viewItems(kbId);
        this.load();
        showToast('Item added', 'success');
    },

    async addFile(kbId) {
        const input = $('kb-file-input');
        if (!input.files.length) return;
        const file = input.files[0];
        const text = await file.text();
        const chunks = text.match(/.{1,1000}/gs) || [];
        const items = chunks.map(c => ({ content: c, source: file.name, source_type: file.type || 'text' }));
        if (items.length > 0) {
            await api(`/api/knowledge/${kbId}/items/batch`, { method: 'POST', body: JSON.stringify({ items }) });
            await this.viewItems(kbId);
            this.load();
            showToast(`Added ${items.length} chunks from ${file.name}`, 'success');
        }
        input.value = '';
    },

    async removeItem(kbId, itemId) {
        await api(`/api/knowledge/${kbId}/items/${itemId}`, { method: 'DELETE' });
        await this.viewItems(kbId);
        this.load();
    },

    open() {
        this.load();
        $('kb-modal').style.display = 'flex';
    },

    close() {
        $('kb-modal').style.display = 'none';
        $('kb-items-modal').style.display = 'none';
    },

    closeItems() {
        $('kb-items-modal').style.display = 'none';
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
};
