const Files = {
    files: [],

    async load() {
        const { files } = await api('/api/files');
        this.files = files;
        this.render();
    },

    render() {
        const list = $('files-list');
        if (!list) return;
        list.innerHTML = '';
        if (this.files.length === 0) {
            list.innerHTML = '<p style="color:#888; text-align:center; font-size:13px; padding:20px;">No uploaded files yet. Attach files in chat to upload them.</p>';
            return;
        }
        this.files.forEach(f => {
            const div = document.createElement('div');
            div.style.cssText = 'padding:12px; background:var(--input-bg); border:1px solid var(--border); border-radius:8px; display:flex; align-items:center; gap:10px;';
            const size = f.file_size > 1024 * 1024
                ? (f.file_size / (1024 * 1024)).toFixed(1) + ' MB'
                : (f.file_size / 1024).toFixed(1) + ' KB';
            const isImage = f.mime_type.startsWith('image/');
            const isPdf = f.mime_type === 'application/pdf';
            const icon = isImage ? '&#128247;' : isPdf ? '&#128196;' : '&#128196;';
            div.innerHTML = `
                <span style="font-size:24px;">${icon}</span>
                <div style="flex:1; overflow:hidden;">
                    <div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${Files.escapeHtml(f.filename)}</div>
                    <div style="font-size:11px; color:#888;">${size} &middot; ${f.created_at.split('T')[0]}</div>
                </div>
                <button style="background:none; border:1px solid var(--border); color:var(--accent-solid); cursor:pointer; font-size:12px; padding:4px 10px; border-radius:6px; white-space:nowrap;" data-action="download">Download</button>
                <button style="background:none; border:none; color:var(--error); cursor:pointer; font-size:12px; padding:4px;" data-action="delete">X</button>`;
            div.querySelector('[data-action="download"]').addEventListener('click', () => {
                window.open(`/api/files/${f.id}/download`, '_blank');
            });
            div.querySelector('[data-action="delete"]').addEventListener('click', () => this.remove(f.id));
            list.appendChild(div);
        });
    },

    async remove(id) {
        const ok = await showConfirm('Delete file?', 'This file will be permanently deleted.', true);
        if (!ok) return;
        await api(`/api/files/${id}`, { method: 'DELETE' });
        await this.load();
        showToast('File deleted', 'success');
    },

    open() {
        this.load();
        $('files-modal').style.display = 'flex';
    },

    close() {
        $('files-modal').style.display = 'none';
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
};
