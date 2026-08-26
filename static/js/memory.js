const Memory = {
    memories: [],

    async load() {
        const { memories } = await api('/api/memories');
        this.memories = memories;
        this.render();
    },

    render() {
        const list = $('memory-list');
        if (!list) return;
        list.innerHTML = '';
        if (this.memories.length === 0) {
            list.innerHTML = '<p style="color:#888; text-align:center; font-size:13px; padding:20px;">No memories yet. Add one manually or click Auto-Extract.</p>';
            return;
        }
        this.memories.forEach(m => {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex; align-items:center; gap:8px; padding:10px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px;';
            div.innerHTML = `
                <span style="flex:1; font-size:13px; color:var(--text); word-break:break-word;">${this.escapeHtml(m.content)}</span>
                <span style="font-size:11px; color:#666; white-space:nowrap;">${m.category}</span>
                <button style="background:none; border:none; color:#888; cursor:pointer; font-size:12px; padding:2px 6px;" data-id="${m.id}" data-action="edit">Edit</button>
                <button style="background:none; border:none; color:var(--error); cursor:pointer; font-size:12px; padding:2px 6px;" data-id="${m.id}" data-action="delete">X</button>`;
            div.querySelector('[data-action="edit"]').addEventListener('click', () => this.edit(m));
            div.querySelector('[data-action="delete"]').addEventListener('click', () => this.remove(m.id));
            list.appendChild(div);
        });
    },

    async add() {
        const input = $('memory-new');
        const content = input.value.trim();
        if (!content) return;
        await api('/api/memories', { method: 'POST', body: JSON.stringify({ content }) });
        input.value = '';
        await this.load();
        showToast('Memory saved', 'success');
    },

    async edit(memory) {
        const newContent = prompt('Edit memory:', memory.content);
        if (newContent && newContent.trim() !== memory.content) {
            await api(`/api/memories/${memory.id}`, { method: 'PATCH', body: JSON.stringify({ content: newContent.trim() }) });
            await this.load();
            showToast('Memory updated', 'success');
        }
    },

    async remove(id) {
        if (!confirm('Delete this memory?')) return;
        await api(`/api/memories/${id}`, { method: 'DELETE' });
        await this.load();
        showToast('Memory deleted', 'success');
    },

    async search(query) {
        if (!query.trim()) { this.render(); return; }
        const { memories } = await api('/api/memories/search', { method: 'POST', body: JSON.stringify({ query }) });
        this.memories = memories;
        this.render();
    },

    async autoExtract() {
        const btn = $('memory-extract-btn');
        btn.textContent = 'Extracting...';
        btn.disabled = true;
        try {
            const result = await api('/api/memories/auto-extract', { method: 'POST' });
            if (result.count > 0) {
                showToast(`Extracted ${result.count} new memories`, 'success');
            } else if (result.error) {
                showToast(result.error, 'error');
            } else {
                showToast('No new memories found', '');
            }
            await this.load();
        } catch (e) {
            showToast('Extraction failed: ' + e.message, 'error');
        } finally {
            btn.textContent = 'Auto-Extract';
            btn.disabled = false;
        }
    },

    open() {
        this.load();
        $('memory-modal').style.display = 'flex';
    },

    close() {
        $('memory-modal').style.display = 'none';
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
};
