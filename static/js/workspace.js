/* Projects, custom assistants, Canvas and Study mode (26.2).
   Server side: workspace.py and study.py. Windows use the shared ZUI kit (zui.js). */
(function () {
    'use strict';
    const Z = window.ZUI;
    const $ = (id) => document.getElementById(id);
    const esc = (s) => Z.esc(s);
    const toast = (m, t) => Z.toast(m, t);
    const call = (p, o) => Z.call(p, o);
    const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } };
    const C = () => (typeof Chat !== 'undefined' ? Chat : null);
    const EMOJIS = ['📁', '📚', '💼', '🚀', '🏠', '✈️', '🎓', '💡', '🧪', '🎨', '💰', '🏋️', '🍳', '📝', '🌍', '⚽'];

    // Read a file's text with the same reader the chat uses (PDF, Word, Excel, PowerPoint, text…).
    async function readFile(file) {
        if (file.size > 20 * 1024 * 1024) throw new Error('That file is too big (20 MB max)');
        const fd = new FormData(); fd.append('file', file);
        const up = await fetch('/api/files/upload', { method: 'POST', credentials: 'same-origin', body: fd });
        const u = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error(u.detail || 'Upload failed');
        const r = await fetch(`/api/files/${u.file.id}/read`, { credentials: 'same-origin' });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.detail || 'Couldn\'t read that file');
        if (d.type === 'image' || !d.content) throw new Error('Only files with text in them can be added (not pictures)');
        return d.content;
    }
    function pickFile(accept) {
        return new Promise((res) => {
            const i = document.createElement('input'); i.type = 'file'; i.accept = accept || '';
            i.onchange = () => res(i.files[0] || null); i.click();
        });
    }
    async function newChat(body) {
        const d = await call('/api/chats', { method: 'POST', body });
        const ch = C(); if (!ch) return;
        ch.chats[d.chat.id] = d.chat;
        ch.switchTo(d.chat.id);
        if (typeof closeSidebar === 'function') { try { if (window.innerWidth < 900) closeSidebar(); } catch (e) {} }
    }
    function itemsBlock(items, base, reload) {
        const wrap = document.createElement('div');
        wrap.className = 'zw-items';
        wrap.innerHTML = (items.length ? items.map(it => `<div class="zw-item"><span class="zw-fi">📄</span><span class="zw-fn">${esc(it.name)}<small>${it.chars < 1000 ? it.chars + ' characters' : (it.chars / 1000).toFixed(it.chars < 10000 ? 1 : 0) + 'k characters'}</small></span><button class="zu-btn sm ghost" data-del="${it.id}">Remove</button></div>`).join('')
            : '<p class="zw-empty">Nothing added yet.</p>') +
            `<div class="zw-row"><button class="zu-btn sm" data-a="file">${Z.icon('plus')} Add a file</button><button class="zu-btn sm" data-a="note">${Z.icon('pen')} Add a note</button></div>`;
        wrap.addEventListener('click', async (e) => {
            const b = e.target.closest('button'); if (!b) return;
            try {
                if (b.dataset.del) { await call(`${base}/items/${b.dataset.del}`, { method: 'DELETE' }); return reload(); }
                if (b.dataset.a === 'file') {
                    const f = await pickFile('.pdf,.docx,.txt,.md,.csv,.xlsx,.pptx,.json,.html,.py,.js'); if (!f) return;
                    b.disabled = true; b.textContent = 'Reading…';
                    const text = await readFile(f);
                    const r = await call(`${base}/items`, { method: 'POST', body: { name: f.name, content: text } });
                    if (r.cut) toast('That file was very long, so only the first part was kept', 'info');
                    return reload();
                }
                if (b.dataset.a === 'note') {
                    const box = document.createElement('div'); box.className = 'zw-note';
                    box.innerHTML = '<input class="zu-in" placeholder="Title" maxlength="200"><textarea class="zu-in" rows="5" placeholder="Paste or type anything Zelpophai should know"></textarea><div class="zw-row"><button class="zu-btn sm pri">Save note</button><button class="zu-btn sm ghost">Cancel</button></div>';
                    wrap.appendChild(box);
                    const [sv, cn] = box.querySelectorAll('button');
                    cn.onclick = () => box.remove();
                    sv.onclick = async () => {
                        const t = box.querySelector('textarea').value.trim(); if (!t) return;
                        try { await call(`${base}/items`, { method: 'POST', body: { name: box.querySelector('input').value || 'Note', content: t } }); reload(); }
                        catch (err) { toast(err.message, 'error'); }
                    };
                    box.querySelector('textarea').focus();
                }
            } catch (err) { toast(err.message, 'error'); b.disabled = false; }
        });
        return wrap;
    }

    /* ═══════════════════════════ PROJECTS ═══════════════════════════ */
    const Projects = {
        list: [],
        async load() { try { this.list = (await call('/api/projects')).projects || []; } catch (e) { this.list = []; } return this.list; },
        byId(id) { return this.list.find(p => p.id === id) || null; },
        async open(pid) {
            const m = Z.modal({ id: 'zw-proj', title: 'Projects', sub: 'Chats, files and instructions for one big job, kept together', icon: 'briefcase', wide: true, tall: true });
            const listView = async () => {
                await this.load();
                m.body.innerHTML = `<button class="zu-btn pri" data-a="new">${Z.icon('plus')} New project</button>
                  <div class="zw-grid">${this.list.map(p => `<button class="zw-pcard" data-p="${p.id}" style="--c:${esc(p.color)}"><span class="zw-pe">${esc(p.emoji)}</span><b>${esc(p.name)}</b><small>${p.chats} chat${p.chats === 1 ? '' : 's'} · ${Z.ago(p.updated_at)}</small></button>`).join('')}</div>` +
                  (this.list.length ? '' : '<p class="zw-empty big">A project keeps everything for one job together — a business, a course, a trip, a book. Add files and standing instructions once, and every chat in it knows them, and what was said in the project\'s other chats.</p>');
                m.body.querySelector('[data-a=new]').onclick = () => edit(null);
                m.body.querySelectorAll('[data-p]').forEach(b => b.onclick = () => detail(+b.dataset.p));
            };
            const edit = (p) => {
                m.body.innerHTML = `<button class="zu-link" data-a="back">← Back</button>
                  <label class="zu-l">Name</label><input class="zu-in" id="zw-pn" maxlength="80" value="${esc(p ? p.name : '')}" placeholder="e.g. My bakery, Final-year project, Trip to Japan">
                  <label class="zu-l">Icon</label><div class="zw-emojis">${EMOJIS.map(e => `<button type="button" data-e="${e}" class="${(p ? p.emoji : '📁') === e ? 'on' : ''}">${e}</button>`).join('')}</div>
                  <label class="zu-l">Instructions <em>— what Zelpophai should always keep in mind in this project (optional)</em></label>
                  <textarea class="zu-in" id="zw-pi" rows="6" maxlength="8000" placeholder="e.g. The bakery is in Kampala, sells to offices, prices in UGX. Keep answers practical and short.">${esc(p ? p.instructions : '')}</textarea>
                  <button class="zu-btn pri wide" data-a="save">${p ? 'Save' : 'Create project'}</button>`;
                let emoji = p ? p.emoji : '📁';
                m.body.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { emoji = b.dataset.e; m.body.querySelectorAll('[data-e]').forEach(x => x.classList.toggle('on', x === b)); });
                m.body.querySelector('[data-a=back]').onclick = () => (p ? detail(p.id) : listView());
                m.body.querySelector('[data-a=save]').onclick = async () => {
                    const body = { name: $('zw-pn').value, emoji, instructions: $('zw-pi').value };
                    try {
                        const r = p ? await call(`/api/projects/${p.id}`, { method: 'PATCH', body }) : await call('/api/projects', { method: 'POST', body });
                        toast(p ? 'Saved' : 'Project created', 'success');
                        await this.load(); refreshSidebar();
                        detail(r.project.id);
                    } catch (e) { toast(e.message, 'error'); }
                };
                setTimeout(() => $('zw-pn').focus(), 30);
            };
            const detail = async (id) => {
                let d;
                try { d = await call(`/api/projects/${id}`); } catch (e) { toast(e.message, 'error'); return listView(); }
                const p = d.project;
                m.body.innerHTML = `<button class="zu-link" data-a="back">← All projects</button>
                  <div class="zw-ph"><span class="zw-pe big">${esc(p.emoji)}</span><div><h4>${esc(p.name)}</h4><small>${d.chat_list.length} chats</small></div>
                    <button class="zu-btn sm" data-a="edit">${Z.icon('pen')} Edit</button></div>
                  <button class="zu-btn pri wide" data-a="chat">${Z.icon('plus')} New chat in this project</button>
                  <label class="zu-l">Instructions</label><div class="zw-instr">${p.instructions ? esc(p.instructions) : '<span class="zw-empty">None yet — press Edit to add some.</span>'}</div>
                  <label class="zu-l">Files and notes <em>— Zelpophai reads the parts that matter for each question</em></label><div id="zw-pitems"></div>
                  <label class="zu-l">Chats</label>
                  <div class="zw-chats">${d.chat_list.map(c => `<button class="zw-chat" data-c="${c.id}"><span>💬</span>${esc(c.title)}<small>${Z.ago(c.updated_at)}</small></button>`).join('') || '<p class="zw-empty">No chats yet. Start one above, or move an existing chat here with its 📁 button in the sidebar.</p>'}</div>
                  <button class="zu-btn danger sm" data-a="del" style="margin-top:18px">${Z.icon('trash')} Delete project</button>`;
                $('zw-pitems').appendChild(itemsBlock(d.items, `/api/projects/${id}`, () => detail(id)));
                m.body.querySelector('[data-a=back]').onclick = listView;
                m.body.querySelector('[data-a=edit]').onclick = () => edit(p);
                m.body.querySelector('[data-a=chat]').onclick = async () => { try { m.close(); await newChat({ project_id: id }); } catch (e) { toast(e.message, 'error'); } };
                m.body.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { m.close(); const ch = C(); if (ch && ch.chats[+b.dataset.c]) ch.switchTo(+b.dataset.c); });
                m.body.querySelector('[data-a=del]').onclick = async () => {
                    if (!(await Z.confirmBox('Delete this project?', 'Its files, notes and instructions are deleted. Its chats are kept and move back to your normal chat list.', true))) return;
                    try {
                        await call(`/api/projects/${id}?chats=keep`, { method: 'DELETE' });
                        const ch = C(); if (ch) Object.values(ch.chats).forEach(c => { if (c.project_id === id) c.project_id = null; });
                        await this.load(); refreshSidebar(); listView();
                    } catch (e) { toast(e.message, 'error'); }
                };
            };
            if (pid) detail(pid); else listView();
        },
        async moveChat(chat) {
            await this.load();
            const m = Z.modal({ id: 'zw-move', title: 'Move to a project', sub: chat.title, icon: 'briefcase' });
            m.body.innerHTML = `<div class="zw-chats">${this.list.map(p => `<button class="zw-chat ${chat.project_id === p.id ? 'on' : ''}" data-p="${p.id}"><span>${esc(p.emoji)}</span>${esc(p.name)}</button>`).join('')}
                <button class="zw-chat ${!chat.project_id ? 'on' : ''}" data-p="0"><span>💬</span>Not in a project</button></div>
                <button class="zu-btn sm" data-a="new" style="margin-top:12px">${Z.icon('plus')} New project</button>`;
            m.body.querySelector('[data-a=new]').onclick = () => { m.close(); this.open(); };
            m.body.querySelectorAll('[data-p]').forEach(b => b.onclick = async () => {
                try {
                    const pidv = +b.dataset.p || null;
                    await call(`/api/chats/${chat.id}/project`, { method: 'POST', body: { project_id: pidv } });
                    chat.project_id = pidv; m.close(); refreshSidebar();
                    const ch = C(); if (ch && ch.activeId === chat.id) ch.renderHeader();
                    toast(pidv ? 'Moved to ' + this.byId(pidv).name : 'Moved out of the project', 'success');
                } catch (e) { toast(e.message, 'error'); }
            });
        },
    };

    /* ═══════════════════════════ ASSISTANTS ═══════════════════════════ */
    const Assistants = {
        cache: {},
        async get(id) {
            if (this.cache[id]) return this.cache[id];
            try { const d = await call(`/api/assistants/${id}`); this.cache[id] = d.assistant; return d.assistant; } catch (e) { return null; }
        },
        async open() {
            const m = Z.modal({ id: 'zw-asst', title: 'Assistants', sub: 'Your own Zelpophai helpers — with their own instructions and knowledge', icon: 'spark', wide: true, tall: true });
            const card = (a, kind) => `<div class="zw-acard" style="--c:${esc(a.color)}"><div class="zw-atop"><span class="zw-ae">${esc(a.emoji)}</span><div><b>${esc(a.name)}</b>${a.creator ? `<small>by ${esc(a.creator)}</small>` : a.shared ? '<small>Shared</small>' : ''}</div></div>
                <p>${esc(a.description || '')}</p><div class="zw-row">` +
                (kind === 'ex' ? `<button class="zu-btn sm pri" data-ex="${a.key}">Use this</button>`
                    : `<button class="zu-btn sm pri" data-chat="${a.id}">Chat</button>` +
                      (kind === 'mine' ? `<button class="zu-btn sm" data-edit="${a.id}">Edit</button><button class="zu-btn sm" data-share="${a.id}">Share</button>` : `<button class="zu-btn sm ghost" data-unsave="${a.id}">Remove</button>`)) +
                '</div></div>';
            const listView = async () => {
                let d; try { d = await call('/api/assistants'); } catch (e) { toast(e.message, 'error'); return; }
                m.body.innerHTML = `<button class="zu-btn pri" data-a="new">${Z.icon('plus')} Create an assistant</button>` +
                    (d.mine.length ? `<label class="zu-l">Yours</label><div class="zw-grid">${d.mine.map(a => card(a, 'mine')).join('')}</div>` : '') +
                    (d.saved.length ? `<label class="zu-l">Added from others</label><div class="zw-grid">${d.saved.map(a => card(a, 'saved')).join('')}</div>` : '') +
                    `<label class="zu-l">Start from an example</label><div class="zw-grid">${d.examples.map(a => card(a, 'ex')).join('')}</div>`;
                d.mine.concat(d.saved).forEach(a => { this.cache[a.id] = a; });
                m.body.querySelector('[data-a=new]').onclick = () => edit(null);
                m.body.querySelectorAll('[data-chat]').forEach(b => b.onclick = async () => { try { m.close(); await newChat({ assistant_id: +b.dataset.chat }); } catch (e) { toast(e.message, 'error'); } });
                m.body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => edit(+b.dataset.edit));
                m.body.querySelectorAll('[data-share]').forEach(b => b.onclick = () => share(+b.dataset.share));
                m.body.querySelectorAll('[data-unsave]').forEach(b => b.onclick = async () => { await call(`/api/assistants/saved/${b.dataset.unsave}`, { method: 'DELETE' }); listView(); });
                m.body.querySelectorAll('[data-ex]').forEach(b => b.onclick = async () => {
                    try { const r = await call(`/api/assistants/from-example/${b.dataset.ex}`, { method: 'POST' }); toast('Added to your assistants — change anything you like', 'success'); edit(r.assistant.id); }
                    catch (e) { toast(e.message, 'error'); }
                });
            };
            const share = async (id) => {
                try {
                    const r = await call(`/api/assistants/${id}/share`, { method: 'POST' });
                    m.body.innerHTML = `<button class="zu-link" data-a="back">← Back</button><h4 class="zw-h">Share your assistant</h4>
                      <p class="zw-p">Anyone with a Zelpophai account who opens this link can add it and chat with it. They can't see or change its instructions or files, and their chats stay private to them.</p>
                      <div class="zw-row"><input class="zu-in" readonly value="${esc(r.url)}"><button class="zu-btn pri" data-a="copy">Copy</button></div>
                      <button class="zu-link" data-a="stop" style="margin-top:12px;color:var(--bad)">Stop sharing</button>`;
                    m.body.querySelector('[data-a=back]').onclick = listView;
                    m.body.querySelector('[data-a=copy]').onclick = async (e) => { try { await navigator.clipboard.writeText(r.url); } catch (x) {} e.target.textContent = 'Copied ✓'; };
                    m.body.querySelector('[data-a=stop]').onclick = async () => { await call(`/api/assistants/${id}/share`, { method: 'DELETE' }); toast('The link no longer works', 'success'); listView(); };
                } catch (e) { toast(e.message, 'error'); }
            };
            const edit = async (id) => {
                let a = { name: '', emoji: '🤖', description: '', instructions: '', starters: [] }, items = [];
                if (id) { try { const d = await call(`/api/assistants/${id}`); a = d.assistant; items = d.items; this.cache[id] = a; } catch (e) { toast(e.message, 'error'); return listView(); } }
                const st = (a.starters || []).concat(['', '', '', '']).slice(0, 4);
                m.body.innerHTML = `<button class="zu-link" data-a="back">← Back</button>
                  ${id ? '' : `<div class="zw-draft"><label class="zu-l">Describe it in a sentence <em>— Zelpophai fills in the rest</em></label>
                    <div class="zw-row"><input class="zu-in" id="zw-idea" placeholder="e.g. A friendly chemistry tutor for secondary school students"><button class="zu-btn" data-a="draft">${Z.icon('wand')} Fill in</button></div></div>`}
                  <div class="zw-two"><div><label class="zu-l">Name</label><input class="zu-in" id="zw-an" maxlength="60" value="${esc(a.name)}"></div>
                    <div style="max-width:110px"><label class="zu-l">Emoji</label><input class="zu-in" id="zw-ae" maxlength="8" value="${esc(a.emoji)}"></div></div>
                  <label class="zu-l">Short description <em>(shown on its card)</em></label><input class="zu-in" id="zw-ad" maxlength="300" value="${esc(a.description)}">
                  <label class="zu-l">Instructions <em>— its job, how it talks, what it asks first, what it always or never does</em></label>
                  <textarea class="zu-in" id="zw-ai" rows="8" maxlength="8000">${esc(a.instructions || '')}</textarea>
                  <label class="zu-l">Conversation starters <em>(buttons on a new chat)</em></label>
                  ${st.map((x, i) => `<input class="zu-in zw-st" data-i="${i}" maxlength="160" value="${esc(x)}" placeholder="Starter ${i + 1}" style="margin-bottom:6px">`).join('')}
                  ${id ? '<label class="zu-l">Knowledge <em>— files and notes it can use when answering</em></label><div id="zw-aitems"></div>' : '<p class="zw-fine">After you create it you can add files and notes it knows about.</p>'}
                  <button class="zu-btn pri wide" data-a="save">${id ? 'Save' : 'Create assistant'}</button>
                  ${id ? `<button class="zu-btn danger sm" data-a="del" style="margin-top:14px">${Z.icon('trash')} Delete assistant</button>` : ''}`;
                if (id) $('zw-aitems').appendChild(itemsBlock(items, `/api/assistants/${id}`, () => edit(id)));
                m.body.querySelector('[data-a=back]').onclick = listView;
                const dr = m.body.querySelector('[data-a=draft]');
                if (dr) dr.onclick = async () => {
                    const idea = $('zw-idea').value.trim(); if (!idea) return;
                    dr.disabled = true; dr.textContent = 'Thinking…';
                    try {
                        const r = await call('/api/assistants/draft', { method: 'POST', body: { idea } });
                        $('zw-an').value = r.name; $('zw-ae').value = r.emoji; $('zw-ad').value = r.description; $('zw-ai').value = r.instructions;
                        m.body.querySelectorAll('.zw-st').forEach((el, i) => { el.value = (r.starters || [])[i] || ''; });
                    } catch (e) { toast(e.message, 'error'); }
                    dr.disabled = false; dr.innerHTML = Z.icon('wand') + ' Fill in';
                };
                m.body.querySelector('[data-a=save]').onclick = async () => {
                    const body = { name: $('zw-an').value, emoji: $('zw-ae').value, description: $('zw-ad').value, instructions: $('zw-ai').value,
                                   starters: [...m.body.querySelectorAll('.zw-st')].map(x => x.value).filter(Boolean) };
                    try {
                        const r = id ? await call(`/api/assistants/${id}`, { method: 'PATCH', body }) : await call('/api/assistants', { method: 'POST', body });
                        this.cache[r.assistant.id] = r.assistant;
                        toast(id ? 'Saved' : 'Assistant created', 'success');
                        if (!id) edit(r.assistant.id); else listView();
                    } catch (e) { toast(e.message, 'error'); }
                };
                const del = m.body.querySelector('[data-a=del]');
                if (del) del.onclick = async () => {
                    if (!(await Z.confirmBox('Delete this assistant?', 'Its instructions and files are deleted, and anyone you shared it with loses it. Chats you had with it stay.', true))) return;
                    await call(`/api/assistants/${id}`, { method: 'DELETE' }); delete this.cache[id]; listView();
                };
            };
            listView();
        },
        // A shared assistant link (/app/a/<code>), or one saved while logging in.
        async handleLink() {
            let code = null;
            const m1 = location.pathname.match(/^\/app\/a\/([A-Za-z0-9]{6,32})/);
            if (m1) code = m1[1]; else { try { code = localStorage.getItem('zp_asst'); } catch (e) {} }
            if (!code) return;
            try { localStorage.removeItem('zp_asst'); } catch (e) {}
            try { history.replaceState({}, '', '/app'); } catch (e) {}
            let d;
            try { d = await call(`/api/assistants/shared/${code}`); } catch (e) { toast(e.message, 'error'); return; }
            const a = d.assistant;
            const m = Z.modal({ id: 'zw-shared', title: a.name, sub: a.creator ? 'An assistant made by ' + a.creator : 'A Zelpophai assistant', icon: 'spark' });
            m.body.innerHTML = `<div class="zw-hero" style="--c:${esc(a.color)}"><span class="zw-ae big">${esc(a.emoji)}</span><p>${esc(a.description || '')}</p></div>
                ${(a.starters || []).length ? `<label class="zu-l">Try asking</label><ul class="zw-sts">${a.starters.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
                <button class="zu-btn pri wide" data-a="go">${d.saved ? 'Chat with it' : 'Add and start chatting'}</button>
                <p class="zw-fine">Your chats with it are private to you.</p>`;
            m.body.querySelector('[data-a=go]').onclick = async () => {
                try { const r = await call(`/api/assistants/shared/${code}/save`, { method: 'POST' }); m.close(); await newChat({ assistant_id: r.id }); }
                catch (e) { toast(e.message, 'error'); }
            };
        },
    };

    /* ── chat decorations: sidebar groups, header chip, assistant welcome ── */
    function refreshSidebar() { const ch = C(); if (ch) ch.renderList(); }
    async function decorateHeader(chat) {
        let chip = $('zw-chip');
        const t = $('chat-header-title');
        if (!t) return;
        if (!chip) { chip = document.createElement('button'); chip.id = 'zw-chip'; chip.className = 'zw-chip'; t.parentNode.insertBefore(chip, t.nextSibling); }
        chip.hidden = true; chip.onclick = null;
        if (!chat) return;
        if (chat.assistant_id) {
            const a = await Assistants.get(chat.assistant_id);
            if (a) { chip.hidden = false; chip.textContent = a.emoji + ' ' + a.name; chip.title = a.description || a.name; chip.onclick = () => Assistants.open(); }
        } else if (chat.project_id) {
            if (!Projects.list.length) await Projects.load();
            const p = Projects.byId(chat.project_id);
            if (p) { chip.hidden = false; chip.textContent = p.emoji + ' ' + p.name; chip.title = 'Open this project'; chip.onclick = () => Projects.open(p.id); }
        }
    }
    async function decorateWelcome(chat) {
        if (!chat || !chat.assistant_id) return;
        const a = await Assistants.get(chat.assistant_id);
        const box = document.querySelector('#chat-container .welcome-message');
        if (!a || !box) return;
        box.innerHTML = `<div class="zw-hero" style="--c:${esc(a.color)}"><span class="zw-ae big">${esc(a.emoji)}</span><h2>${esc(a.name)}</h2><p>${esc(a.description || '')}</p>
            ${a.creator ? `<small>by ${esc(a.creator)}</small>` : ''}</div>
            <div class="zw-starters">${(a.starters || []).map(x => `<button type="button">${esc(x)}</button>`).join('')}</div>`;
        box.querySelectorAll('.zw-starters button').forEach(b => b.onclick = () => {
            const i = $('user-input'); i.value = b.textContent; i.dispatchEvent(new Event('input', { bubbles: true })); i.focus();
            const send = $('send-btn'); if (send) send.click(); else i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        });
    }

    /* ═══════════════════════════ CANVAS ═══════════════════════════ */
    const ZCanvas = {
        cur: null,
        card(c, writing, pub) {
            const el = document.createElement('div');
            el.className = 'zcv-card' + (writing ? ' writing' : '');
            const words = (c.text.match(/\S+/g) || []).length;
            const code = c.attrs.kind === 'code';
            el.innerHTML = `<div class="zcv-top"><span class="zcv-ic">${code ? '&lt;/&gt;' : '✎'}</span><div class="zcv-tt"><b></b><span></span></div>` +
                (writing ? '<span class="zf-spin"></span>' : (pub ? '' : '<button type="button" class="zcv-open">Open in Canvas</button>')) + '</div>' +
                `<div class="zcv-peek"></div>`;
            el.querySelector('b').textContent = c.attrs.title || (code ? 'Code' : 'Draft');
            el.querySelector('.zcv-tt span').textContent = writing ? 'Writing… ' + words + ' words so far' : (code ? (c.attrs.lang || 'code') + ' · ' + (c.text.split('\n').length) + ' lines' : words + ' words') + (c.attrs.id ? ' · updated' : '');
            const peek = code ? c.text : c.text.replace(/^#{1,6}\s+/gm, '').replace(/\*\*|__|`/g, '');
            el.querySelector('.zcv-peek').textContent = peek.slice(0, 420) + (peek.length > 420 ? '…' : '');
            el.dataset.slot = c.slot;
            if (c.attrs.id) el.dataset.cid = c.attrs.id;
            const open = el.querySelector('.zcv-open');
            if (open) open.onclick = () => this.fromCard(el, c);
            if (!writing && !pub) el.querySelector('.zcv-peek').onclick = () => this.fromCard(el, c);
            return el;
        },
        async fromCard(el, c) {
            try {
                if (c.attrs.id) return this.openId(+c.attrs.id);
                const w = el.closest('.msg-wrapper'); const mid = w && w.dataset.mid ? +w.dataset.mid : null;
                const ch = C();
                let cv;
                if (mid) { try { cv = (await call(`/api/canvas/by-message/${mid}?slot=${c.slot}`)).canvas; } catch (e) { cv = null; } }
                if (!cv) cv = (await call('/api/canvas', { method: 'POST', body: { chat_id: ch && ch.activeId, message_id: mid, slot: c.slot, title: c.attrs.title || '', kind: c.attrs.kind || 'doc', lang: c.attrs.lang || '', content: c.text } })).canvas;
                this.show(cv);
            } catch (e) { toast(e.message, 'error'); }
        },
        async openId(id) { try { this.show((await call(`/api/canvas/${id}`)).canvas); } catch (e) { toast(e.message, 'error'); } },
        // After a reply streams in: save new canvases, apply the AI's edits, open the panel.
        async afterReply(bubble, text) {
            const re = /<zcanvas\b([^>]*)>([\s\S]*?)<\/zcanvas>/gi; let m, i = 0, last = null;
            const w = bubble && bubble.closest('.msg-wrapper'); const mid = w && w.dataset.mid ? +w.dataset.mid : null;
            const ch = C();
            while ((m = re.exec(text || ''))) {
                const a = {}; m[1].replace(/(\w+)\s*=\s*"([^"]*)"/g, (_, k, v) => { a[k.toLowerCase()] = v; });
                const body = m[2].replace(/^\n+|\s+$/g, '');
                try {
                    if (a.id) last = (await call(`/api/canvas/${a.id}`, { method: 'PATCH', body: { content: body, note: 'Zelpophai’s edit', title: a.title || null } })).canvas;
                    else last = (await call('/api/canvas', { method: 'POST', body: { chat_id: ch && ch.activeId, message_id: mid, slot: i, title: a.title || '', kind: a.kind || 'doc', lang: a.lang || '', content: body } })).canvas;
                } catch (e) { /* the card still opens it later */ }
                i++;
            }
            if (last && window.innerWidth >= 700) this.show(last);
        },
        show(cv) {
            this.cur = cv;
            let p = $('zcv-panel');
            if (!p) {
                p = document.createElement('aside'); p.id = 'zcv-panel'; p.className = 'zcv-panel';
                p.innerHTML = `<div class="zcv-head"><input class="zcv-title" maxlength="150" aria-label="Title"><div class="zcv-hr">
                    <div class="zcv-seg"><button data-v="read" class="on">Read</button><button data-v="edit">Edit</button></div>
                    <button class="zcv-b" data-a="versions" title="Earlier versions">🕘 <span>0</span></button>
                    <button class="zcv-b" data-a="copy" title="Copy">Copy</button>
                    <div class="zcv-menu"><button class="zcv-b" data-a="export">Download ▾</button><div class="zcv-dd" hidden></div></div>
                    <button class="zcv-x" data-a="close" aria-label="Close">✕</button></div></div>
                  <div class="zcv-quick"></div>
                  <div class="zcv-body"><div class="zcv-read"></div><textarea class="zcv-edit" spellcheck="true" hidden></textarea></div>
                  <div class="zcv-sel" hidden><span class="zcv-sel-t">Change the selected part:</span>
                    <div class="zcv-chips"></div>
                    <div class="zcv-ask"><input placeholder="…or say how, e.g. make it funnier" maxlength="1000"><button class="zcv-go">Change</button></div></div>
                  <div class="zcv-status"></div>`;
                document.body.appendChild(p);
                this.wire(p);
            }
            p.querySelector('.zcv-title').value = cv.title || '';
            p.querySelector('[data-a=versions] span').textContent = cv.version_count || 1;
            p.classList.toggle('code', cv.kind === 'code');
            const quick = cv.kind === 'code' ? ['Add comments', 'Find and fix bugs', 'Make it simpler', 'Make it faster']
                : ['Polish it', 'Shorter', 'Longer', 'Simpler words', 'More formal', 'More friendly'];
            p.querySelector('.zcv-quick').innerHTML = '<span>Whole thing:</span>' + quick.map(q => `<button data-q="${esc(q)}">${esc(q)}</button>`).join('');
            const chips = cv.kind === 'code' ? ['Explain in comments', 'Fix', 'Simplify'] : ['Shorter', 'Longer', 'Clearer', 'Fix grammar', 'Funnier'];
            p.querySelector('.zcv-chips').innerHTML = chips.map(q => `<button data-c="${esc(q)}">${esc(q)}</button>`).join('');
            this.setText(cv.content || '');
            this.view(cv.kind === 'code' ? 'edit' : 'read');
            document.body.classList.add('zcv-on');
            requestAnimationFrame(() => p.classList.add('on'));
        },
        setText(t) {
            const p = $('zcv-panel'); if (!p) return;
            p.querySelector('.zcv-edit').value = t;
            const r = p.querySelector('.zcv-read');
            if (this.cur && this.cur.kind === 'code') { r.innerHTML = ''; const pre = document.createElement('pre'); const code = document.createElement('code'); code.textContent = t; pre.appendChild(code); r.appendChild(pre); }
            else if (window.ZRender) ZRender.render(r, t, { inner: true }); else r.textContent = t;
        },
        view(v) {
            const p = $('zcv-panel'); if (!p) return;
            p.querySelectorAll('.zcv-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
            p.querySelector('.zcv-read').hidden = v !== 'read';
            p.querySelector('.zcv-edit').hidden = v !== 'edit';
            if (v === 'read') this.setText(p.querySelector('.zcv-edit').value);
            p.querySelector('.zcv-sel').hidden = true;
        },
        status(t) { const s = document.querySelector('#zcv-panel .zcv-status'); if (s) { s.textContent = t || ''; } },
        async save(note) {
            const p = $('zcv-panel'); if (!p || !this.cur) return;
            const content = p.querySelector('.zcv-edit').value;
            try {
                const r = await call(`/api/canvas/${this.cur.id}`, { method: 'PATCH', body: { content, title: p.querySelector('.zcv-title').value, note: note || 'Your edit' } });
                this.cur = r.canvas; p.querySelector('[data-a=versions] span').textContent = r.canvas.version_count;
                this.status('Saved');
            } catch (e) { this.status('Couldn’t save: ' + e.message); }
        },
        selection() {
            const p = $('zcv-panel'); const ta = p.querySelector('.zcv-edit');
            if (!ta.hidden) return ta.selectionEnd > ta.selectionStart ? { start: ta.selectionStart, end: ta.selectionEnd } : null;
            // In Read view, find the selected words in the text.
            const sel = String(window.getSelection() || '').trim();
            if (!sel || sel.length < 3) return null;
            const src = ta.value; let i = src.indexOf(sel);
            if (i < 0) { const first = sel.split(/\s+/).slice(0, 4).join(' '); const last = sel.split(/\s+/).slice(-3).join(' '); const a = src.indexOf(first); const b = a >= 0 ? src.indexOf(last, a) : -1; if (a >= 0 && b >= 0) return { start: a, end: b + last.length }; return null; }
            return { start: i, end: i + sel.length };
        },
        async change(instruction, range) {
            const p = $('zcv-panel'); const ta = p.querySelector('.zcv-edit');
            if (!range) range = { start: 0, end: -1 };
            this.status('Zelpophai is changing it…'); p.classList.add('busy');
            try {
                await this.save('Your edit');
                const r = await call(`/api/canvas/${this.cur.id}/edit`, { method: 'POST', body: { instruction, start: range.start, end: range.end } });
                const v = ta.value;
                ta.value = v.slice(0, r.start) + r.replacement + v.slice(r.end);
                this.setText(ta.value);
                if (!ta.hidden) { ta.focus(); ta.setSelectionRange(r.start, r.start + r.replacement.length); }
                await this.save('Changed: ' + instruction);
                this.status('Done — use 🕘 to go back if you preferred it before');
            } catch (e) { this.status(e.message); }
            p.classList.remove('busy');
            p.querySelector('.zcv-sel').hidden = true;
        },
        wire(p) {
            let saveT = null;
            const ta = p.querySelector('.zcv-edit');
            ta.addEventListener('input', () => { this.status('Editing…'); clearTimeout(saveT); saveT = setTimeout(() => this.save('Your edit'), 1200); });
            p.querySelector('.zcv-title').addEventListener('change', () => this.save('Renamed'));
            const showSel = () => {
                const r = this.selection();
                // Typing the instruction moves the focus away from the text — keep the bar and the remembered selection.
                if (!r && document.activeElement && document.activeElement.closest && document.activeElement.closest('.zcv-sel')) return;
                p.querySelector('.zcv-sel').hidden = !r;
                if (r) p._sel = r;
            };
            ta.addEventListener('mouseup', showSel); ta.addEventListener('keyup', (e) => { if (e.shiftKey || e.key === 'Shift') showSel(); });
            p.querySelector('.zcv-read').addEventListener('mouseup', () => setTimeout(showSel, 10));
            // Phones select text by touch, which doesn't fire mouseup.
            document.addEventListener('selectionchange', () => { if (p.classList.contains('on')) { clearTimeout(p._st); p._st = setTimeout(showSel, 300); } });
            p.addEventListener('click', async (e) => {
                const b = e.target.closest('button'); if (!b) return;
                if (b.dataset.v) return this.view(b.dataset.v);
                if (b.dataset.q) return this.change(b.dataset.q, null);
                if (b.dataset.c) return this.change(b.dataset.c, p._sel);
                if (b.classList.contains('zcv-go')) { const i = p.querySelector('.zcv-ask input'); if (i.value.trim()) { const v = i.value.trim(); i.value = ''; this.change(v, p._sel); } return; }
                const a = b.dataset.a;
                if (a === 'close') { p.classList.remove('on'); document.body.classList.remove('zcv-on'); clearTimeout(saveT); this.save('Your edit'); return; }
                if (a === 'copy') { try { await navigator.clipboard.writeText(ta.value); this.status('Copied'); } catch (x) { ta.select(); document.execCommand('copy'); } return; }
                if (a === 'export') {
                    const dd = p.querySelector('.zcv-dd');
                    const opts = this.cur.kind === 'code' ? [['code', 'Code file'], ['txt', 'Text']] : [['docx', 'Word'], ['pdf', 'PDF'], ['md', 'Markdown'], ['txt', 'Plain text']];
                    dd.innerHTML = opts.map(o => `<a href="/api/canvas/${this.cur.id}/export?fmt=${o[0]}" download>${o[1]}</a>`).join('');
                    dd.hidden = !dd.hidden;
                    dd.onclick = async (ev) => { ev.preventDefault(); const aEl = ev.target.closest('a'); if (!aEl) return; dd.hidden = true; await this.save('Your edit'); location.href = aEl.getAttribute('href'); };
                    return;
                }
                if (a === 'versions') return this.versions();
            });
            p.querySelector('.zcv-ask input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); p.querySelector('.zcv-go').click(); } });
        },
        async versions() {
            let d; try { d = (await call(`/api/canvas/${this.cur.id}`)).canvas; } catch (e) { return toast(e.message, 'error'); }
            const m = Z.modal({ id: 'zcv-vers', title: 'Earlier versions', sub: d.title, icon: 'clock' });
            m.body.innerHTML = `<div class="zw-chats">${d.versions.slice().reverse().map(v => `<button class="zw-chat" data-i="${v.i}"><span>🕘</span>${esc(v.note || 'Version')}<small>${Z.ago(v.t)} · ${v.chars.toLocaleString()} characters</small></button>`).join('')}</div><div class="zcv-vprev"></div>`;
            m.body.querySelectorAll('[data-i]').forEach(b => b.onclick = async () => {
                const v = await call(`/api/canvas/${this.cur.id}/version/${b.dataset.i}`);
                const box = m.body.querySelector('.zcv-vprev');
                box.innerHTML = '<div class="zw-row"><button class="zu-btn sm pri">Restore this version</button></div><pre></pre>';
                box.querySelector('pre').textContent = v.content.slice(0, 6000);
                box.querySelector('button').onclick = async () => {
                    const r = await call(`/api/canvas/${this.cur.id}`, { method: 'PATCH', body: { restore: +b.dataset.i } });
                    m.close(); this.show(r.canvas); this.status('Restored');
                };
            });
        },
    };

    /* ═══════════════════════════ STUDY ═══════════════════════════ */
    const ZStudy = {
        card(d, writing, pub) {
            const el = document.createElement('div');
            el.className = 'zdk-card' + (writing ? ' writing' : '');
            el.innerHTML = `<div class="zdk-top"><span class="zdk-ic">🗂️</span><div><b></b><span></span></div>${writing ? '<span class="zf-spin"></span>' : ''}</div><div class="zdk-peek"></div>` +
                (writing || pub ? '' : '<div class="zdk-acts"><button class="pri" data-a="save">Save to Study</button><button data-a="try">Try them here</button></div>');
            el.querySelector('b').textContent = d.attrs.title || 'Flashcards';
            el.querySelector('.zdk-top span').textContent = d.cards.length + ' card' + (d.cards.length === 1 ? '' : 's');
            el.querySelector('.zdk-peek').innerHTML = d.cards.slice(0, 3).map(c => `<div class="zdk-c"><b>${esc(c.front)}</b><span>${esc(c.back)}</span></div>`).join('') + (d.cards.length > 3 ? `<small>+ ${d.cards.length - 3} more</small>` : '');
            el.addEventListener('click', async (e) => {
                const b = e.target.closest('[data-a]'); if (!b) return;
                if (b.dataset.a === 'try') return this.run({ id: null, title: d.attrs.title || 'Flashcards', cards: d.cards.map((c, i) => ({ id: -1 - i, front: c.front, back: c.back })) });
                if (b.dataset.a === 'save') {
                    if (b.dataset.deck) return this.review(+b.dataset.deck);
                    b.disabled = true;
                    try {
                        const r = await call('/api/study/decks', { method: 'POST', body: { title: d.attrs.title || 'Flashcards', cards: d.cards, source: 'From a chat' } });
                        b.disabled = false; b.textContent = 'Study now'; b.dataset.deck = r.id;
                        toast('Saved to Study — ' + r.cards + ' cards', 'success');
                    } catch (err) { b.disabled = false; toast(err.message, 'error'); }
                }
            });
            return el;
        },
        async open() {
            const m = Z.modal({ id: 'zw-study', title: 'Study', sub: 'Flashcards and quizzes that bring back what you find hard', icon: 'cap', wide: true, tall: true });
            this.m = m;
            this.home();
        },
        async home() {
            const m = this.m; if (!m) return;
            let d; try { d = await call('/api/study?tz=' + encodeURIComponent(tz())); } catch (e) { toast(e.message, 'error'); return; }
            const due = d.decks.reduce((n, x) => n + x.due, 0);
            m.body.innerHTML = `<div class="zs-stats"><div><b>🔥 ${d.streak}</b><span>day streak</span></div><div><b>${d.today}</b><span>reviewed today</span></div><div><b>${due}</b><span>cards due now</span></div></div>
              <div class="zs-new"><div class="zs-tabs"><button class="on" data-t="topic">From a topic</button><button data-t="notes">From notes or a file</button><button data-t="blank">Write my own</button></div>
                <div class="zs-pane" data-p="topic"><div class="zw-row"><input class="zu-in" id="zs-topic" placeholder="e.g. The causes of World War 1, Python lists, French verbs (être)"><select class="zu-in" id="zs-n" style="max-width:110px"><option>10</option><option selected>15</option><option>25</option><option>40</option></select><button class="zu-btn pri" data-a="make">Make cards</button></div></div>
                <div class="zs-pane" data-p="notes" hidden><textarea class="zu-in" id="zs-notes" rows="5" placeholder="Paste your notes here…"></textarea><div class="zw-row"><button class="zu-btn sm" data-a="file">${Z.icon('plus')} Use a file</button><span style="flex:1"></span><button class="zu-btn pri" data-a="make2">Make cards</button></div></div>
                <div class="zs-pane" data-p="blank" hidden><div class="zw-row"><input class="zu-in" id="zs-title" placeholder="Deck name"><button class="zu-btn pri" data-a="blank">Create deck</button></div></div></div>
              <div class="zs-decks">${d.decks.map(x => `<div class="zs-deck"><div class="zs-dt"><b>${esc(x.title)}</b><small>${x.total} cards · ${x.learned} learned${x.source ? ' · ' + esc(x.source) : ''}</small>
                  <div class="zs-bar"><i style="width:${x.total ? Math.round(x.learned / x.total * 100) : 0}%"></i></div></div>
                  <div class="zs-da"><button class="zu-btn sm ${x.due ? 'pri' : ''}" data-r="${x.id}">${x.due ? 'Review ' + x.due : 'Practise'}</button><button class="zu-btn sm" data-q="${x.id}">Quiz</button><button class="zu-btn sm ghost" data-c="${x.id}">Cards</button></div></div>`).join('') ||
                '<p class="zw-empty big">No decks yet. Make one above, or ask Zelpophai in any chat: “make me flashcards on photosynthesis”.</p>'}</div>`;
            m.body.querySelectorAll('.zs-tabs button').forEach(b => b.onclick = () => {
                m.body.querySelectorAll('.zs-tabs button').forEach(x => x.classList.toggle('on', x === b));
                m.body.querySelectorAll('.zs-pane').forEach(x => { x.hidden = x.dataset.p !== b.dataset.t; });
            });
            const make = async (btn, body) => {
                btn.disabled = true; const old = btn.textContent; btn.textContent = 'Making cards…';
                try { const r = await call('/api/study/decks', { method: 'POST', body }); toast(r.cards + ' cards made', 'success'); this.home(); }
                catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = old; }
            };
            m.body.querySelector('[data-a=make]').onclick = (e) => { const t = $('zs-topic').value.trim(); if (t) make(e.target, { topic: t, count: +$('zs-n').value }); };
            m.body.querySelector('[data-a=make2]').onclick = (e) => { const t = $('zs-notes').value.trim(); if (t) make(e.target, { text: t, count: 20, source: 'From my notes' }); };
            m.body.querySelector('[data-a=file]').onclick = async (e) => {
                const f = await pickFile('.pdf,.docx,.txt,.md,.pptx'); if (!f) return;
                e.target.textContent = 'Reading…';
                try { $('zs-notes').value = (await readFile(f)).slice(0, 24000); e.target.textContent = f.name; } catch (x) { toast(x.message, 'error'); e.target.textContent = 'Use a file'; }
            };
            m.body.querySelector('[data-a=blank]').onclick = async () => {
                const t = $('zs-title').value.trim() || 'My deck';
                try { const r = await call('/api/study/decks', { method: 'POST', body: { title: t, cards: [{ front: 'Your first question', back: 'Its answer' }] } }); this.cards(r.id); }
                catch (e) { toast(e.message, 'error'); }
            };
            m.body.querySelectorAll('[data-r]').forEach(b => b.onclick = () => this.review(+b.dataset.r));
            m.body.querySelectorAll('[data-q]').forEach(b => b.onclick = () => this.quiz(+b.dataset.q));
            m.body.querySelectorAll('[data-c]').forEach(b => b.onclick = () => this.cards(+b.dataset.c));
        },
        async review(id) {
            if (!this.m || !document.body.contains(this.m.el)) await this.open();
            let d; try { d = await call(`/api/study/decks/${id}/review?limit=30`); } catch (e) { return toast(e.message, 'error'); }
            let practice = false;
            if (!d.cards.length) { d = await call(`/api/study/decks/${id}/review?limit=30&all=1`); practice = true; }
            const deck = (await call(`/api/study/decks/${id}`)).deck;
            this.run({ id, title: deck.title, cards: d.cards, practice });
        },
        run(s) {
            if (!this.m || !document.body.contains(this.m.el)) { this.m = Z.modal({ id: 'zw-study', title: 'Study', sub: s.title, icon: 'cap', wide: true, tall: true }); }
            const m = this.m; let i = 0, again = 0;
            const queue = s.cards.slice();
            const keys = (e) => {
                if (!document.body.contains(m.el)) { document.removeEventListener('keydown', keys); return; }
                if (e.target.closest && e.target.closest('input,textarea')) return;
                const flip = m.body.querySelector('[data-a=flip]');
                if ((e.key === ' ' || e.key === 'Enter') && flip) { e.preventDefault(); flip.click(); }
                const g = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' }[e.key];
                const gb = g && m.body.querySelector(`[data-g=${g}]`); if (gb) gb.click();
            };
            document.addEventListener('keydown', keys);
            const show = () => {
                if (i >= queue.length) {
                    document.removeEventListener('keydown', keys);
                    m.body.innerHTML = `<div class="zs-done"><div class="zs-big">🎉</div><h3>All done!</h3><p>${queue.length} card${queue.length === 1 ? '' : 's'} reviewed${again ? ` — ${again} came back for another go` : ''}.</p>
                      ${s.id ? '<p class="zw-fine">The cards you found hard will come back sooner; the easy ones later.</p>' : '<p class="zw-fine">Save the deck from the chat to keep reviewing it over the coming days.</p>'}
                      <button class="zu-btn pri" data-a="home">Back to Study</button></div>`;
                    m.body.querySelector('[data-a=home]').onclick = () => this.home();
                    return;
                }
                const c = queue[i];
                m.body.innerHTML = `<div class="zs-run"><div class="zs-prog"><span>${s.title ? esc(s.title) : ''}${s.practice ? ' · practice run (nothing is due yet)' : ''}</span><span>${i + 1} / ${queue.length}</span></div>
                  <div class="zs-fc"><div class="zs-q"></div><div class="zs-a" hidden></div></div>
                  <div class="zs-btns"><button class="zu-btn pri wide" data-a="flip">Show answer <small>(space)</small></button></div></div>`;
                m.body.querySelector('.zs-q').textContent = c.front;
                m.body.querySelector('.zs-a').textContent = c.back;
                m.body.querySelector('[data-a=flip]').onclick = () => {
                    m.body.querySelector('.zs-a').hidden = false;
                    m.body.querySelector('.zs-fc').classList.add('flipped');
                    m.body.querySelector('.zs-btns').innerHTML = ['again:Again:1 min', 'hard:Hard:', 'good:Good:', 'easy:Easy:'].map((x, k) => { const [g, l, h] = x.split(':'); return `<button class="zs-g ${g}" data-g="${g}">${l}<small>${h || ''} (${k + 1})</small></button>`; }).join('');
                    m.body.querySelectorAll('[data-g]').forEach(b => b.onclick = async () => {
                        const g = b.dataset.g;
                        if (g === 'again') { again++; queue.push(c); }
                        if (s.id && c.id > 0) { try { await call(`/api/study/cards/${c.id}/grade`, { method: 'POST', body: { grade: g, tz: tz() } }); } catch (e) {} }
                        i++; show();
                    });
                };
            };
            show();
        },
        async quiz(id) {
            if (!this.m || !document.body.contains(this.m.el)) await this.open();
            const m = this.m;
            let d; try { d = await call(`/api/study/decks/${id}/quiz?n=10`); } catch (e) { return toast(e.message, 'error'); }
            const results = []; let i = 0;
            const show = async () => {
                if (i >= d.questions.length) {
                    const r = await call(`/api/study/decks/${id}/quiz`, { method: 'POST', body: { results, tz: tz() } }).catch(() => ({ right: results.filter(x => x.right).length, total: results.length }));
                    const pct = Math.round(r.right / Math.max(1, r.total) * 100);
                    m.body.innerHTML = `<div class="zs-done"><div class="zs-big">${pct >= 80 ? '🏆' : pct >= 50 ? '👍' : '💪'}</div><h3>${r.right} out of ${r.total}</h3><p>${pct >= 80 ? 'Excellent!' : pct >= 50 ? 'Good going — the ones you missed will come up again in your reviews.' : 'Keep at it — the ones you missed will come up again in your reviews.'}</p>
                      <div class="zw-row" style="justify-content:center"><button class="zu-btn" data-a="again">Another quiz</button><button class="zu-btn pri" data-a="home">Back to Study</button></div></div>`;
                    m.body.querySelector('[data-a=home]').onclick = () => this.home();
                    m.body.querySelector('[data-a=again]').onclick = () => this.quiz(id);
                    return;
                }
                const q = d.questions[i];
                m.body.innerHTML = `<div class="zs-run"><div class="zs-prog"><span>Quiz</span><span>${i + 1} / ${d.questions.length}</span></div>
                  <div class="zs-fc"><div class="zs-q"></div></div><div class="zs-opts">${q.options.map((o, k) => `<button data-k="${k}"><b>${'ABCD'[k]}</b><span></span></button>`).join('')}</div></div>`;
                m.body.querySelector('.zs-q').textContent = q.question;
                m.body.querySelectorAll('.zs-opts button').forEach((b, k) => { b.querySelector('span').textContent = q.options[k]; });
                m.body.querySelectorAll('.zs-opts button').forEach(b => b.onclick = () => {
                    const k = +b.dataset.k, right = k === q.answer;
                    results.push({ card_id: q.card_id, right });
                    m.body.querySelectorAll('.zs-opts button').forEach((x, j) => { x.disabled = true; if (j === q.answer) x.classList.add('right'); else if (j === k) x.classList.add('wrong'); });
                    setTimeout(() => { i++; show(); }, right ? 700 : 1600);
                });
            };
            show();
        },
        async cards(id) {
            if (!this.m || !document.body.contains(this.m.el)) await this.open();
            const m = this.m;
            let d; try { d = await call(`/api/study/decks/${id}`); } catch (e) { return toast(e.message, 'error'); }
            m.body.innerHTML = `<button class="zu-link" data-a="back">← Back</button>
              <div class="zw-row"><input class="zu-in" id="zs-dt" value="${esc(d.deck.title)}" maxlength="120"><button class="zu-btn sm" data-a="rename">Rename</button></div>
              <div class="zs-add"><input class="zu-in" id="zs-f" placeholder="Question"><input class="zu-in" id="zs-b" placeholder="Answer"><button class="zu-btn pri" data-a="add">Add card</button></div>
              <div class="zs-list">${d.cards.map(c => `<div class="zs-row" data-id="${c.id}"><textarea class="zu-in" rows="2" data-f>${esc(c.front)}</textarea><textarea class="zu-in" rows="2" data-b>${esc(c.back)}</textarea><button class="zu-btn sm ghost" data-del="${c.id}" title="Delete">${Z.icon('trash')}</button></div>`).join('')}</div>
              <button class="zu-btn danger sm" data-a="deldeck" style="margin-top:16px">${Z.icon('trash')} Delete deck</button>`;
            m.body.querySelector('[data-a=back]').onclick = () => this.home();
            m.body.querySelector('[data-a=rename]').onclick = async () => { await call(`/api/study/decks/${id}`, { method: 'PATCH', body: { title: $('zs-dt').value } }); toast('Renamed', 'success'); };
            m.body.querySelector('[data-a=add]').onclick = async () => {
                const f = $('zs-f').value.trim(), b = $('zs-b').value.trim(); if (!f || !b) return;
                try { await call(`/api/study/decks/${id}/cards`, { method: 'POST', body: { front: f, back: b } }); this.cards(id); } catch (e) { toast(e.message, 'error'); }
            };
            m.body.querySelectorAll('.zs-row textarea').forEach(t => t.addEventListener('change', async () => {
                const row = t.closest('.zs-row');
                try { await call(`/api/study/cards/${row.dataset.id}`, { method: 'PATCH', body: { front: row.querySelector('[data-f]').value, back: row.querySelector('[data-b]').value } }); } catch (e) { toast(e.message, 'error'); }
            }));
            m.body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { await call(`/api/study/cards/${b.dataset.del}`, { method: 'DELETE' }); b.closest('.zs-row').remove(); });
            m.body.querySelector('[data-a=deldeck]').onclick = async () => {
                if (!(await Z.confirmBox('Delete this deck?', 'All its cards and progress are deleted.', true))) return;
                await call(`/api/study/decks/${id}`, { method: 'DELETE' }); this.home();
            };
        },
    };

    window.Workspace = { Projects, Assistants, decorateHeader, decorateWelcome, refreshSidebar };
    window.ZCanvas = ZCanvas;
    window.ZStudy = ZStudy;

    function boot() {
        const nav = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', () => { fn(); if (typeof closeSidebar === 'function' && window.innerWidth < 900) { try { closeSidebar(); } catch (e) {} } }); };
        nav('projects-btn', () => Projects.open());
        nav('assistants-btn', () => Assistants.open());
        nav('study-btn', () => ZStudy.open());
        Projects.load().then(refreshSidebar);
        setTimeout(() => Assistants.handleLink(), 1500);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
