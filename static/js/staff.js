/* Staff tools: the team chat ("Live Chat") and the broadcasts list.
   Team chat: bubbles grouped by person, day dividers, who's online, replies, reactions,
   edit/delete your own messages, typing dots. Polls every 3 seconds while open. */
const Staff = {
    _m: null, _d: null, _timer: null, _reply: null, _edit: null, _sig: '', _typingAt: 0,
    init() {
        const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
        on('close-attention', 'click', () => $('attention-modal').style.display = 'none');
        on('attention-modal', 'click', e => { if (e.target === $('attention-modal')) $('attention-modal').style.display = 'none'; });
        on('attention-send', 'click', () => Staff.sendBroadcast());
        on('attention-input', 'keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) Staff.sendBroadcast(); });
    },
    openAttention() {
        $('attention-modal').style.display = 'flex';
        Staff.loadAttention();
    },

    // ───────────────────────── team chat ─────────────────────────
    openChat() {
        const Z = window.ZUI;
        Staff._reply = null; Staff._edit = null; Staff._sig = '';
        const m = Staff._m = Z.modal({ id: 'zsc', title: 'Team chat', icon: 'users', sub: 'Only the Owner and admins can see this.', wide: true, tall: true, cls: 'zsc-modal' });
        m.body.innerHTML = `<div class="zsc"><aside class="zsc-side"><h5>Team</h5><div id="zsc-staff"></div></aside>
            <section class="zsc-main"><div class="zsc-list" id="zsc-list"><div class="zu-load">Loading…</div></div>
              <div class="zsc-typing" id="zsc-typing"></div>
              <div class="zsc-ctx" id="zsc-ctx" hidden></div>
              <div class="zsc-compose"><textarea class="zu-in" id="zsc-in" rows="1" maxlength="2000" placeholder="Message the team…" aria-label="Message the team"></textarea>
                <button class="zu-btn pri" id="zsc-send" aria-label="Send">${Z.icon('send')}</button></div></section></div>`;
        const inp = m.body.querySelector('#zsc-in');
        const grow = () => { inp.style.height = 'auto'; inp.style.height = Math.min(140, inp.scrollHeight) + 'px'; };
        inp.addEventListener('input', () => { grow(); const now = Date.now(); if (now - Staff._typingAt > 2500 && inp.value.trim()) { Staff._typingAt = now; Z.call('/api/staff/chat/typing', { method: 'POST' }).catch(() => {}); } });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); Staff.sendChat(); } if (e.key === 'Escape' && (Staff._reply || Staff._edit)) { e.stopPropagation(); Staff._setCtx(null); } });
        m.body.querySelector('#zsc-send').onclick = () => Staff.sendChat();
        m.onClose = () => { clearInterval(Staff._timer); Staff._timer = null; };
        Staff.reloadChat(true);
        clearInterval(Staff._timer);
        Staff._timer = setInterval(() => { if (!document.hidden) Staff.reloadChat(); }, 3000);
        setTimeout(() => inp.focus(), 80);
    },
    _setCtx(kind, msg) {
        const Z = window.ZUI, box = Staff._m && Staff._m.body.querySelector('#zsc-ctx'), inp = Staff._m && Staff._m.body.querySelector('#zsc-in');
        if (!box) return;
        Staff._reply = kind === 'reply' ? msg : null; Staff._edit = kind === 'edit' ? msg : null;
        if (!kind) { box.hidden = true; box.innerHTML = ''; if (inp && inp.dataset.wasEdit) { inp.value = ''; delete inp.dataset.wasEdit; } return; }
        box.hidden = false;
        box.innerHTML = `${Z.icon(kind === 'reply' ? 'reply' : 'pen')}<div><b>${kind === 'reply' ? 'Replying to ' + Z.esc(msg.username) : 'Editing your message'}</b><span>${Z.esc(msg.content.slice(0, 140))}</span></div><button class="zu-x sm" aria-label="Cancel">${Z.icon('x')}</button>`;
        box.querySelector('.zu-x').onclick = () => Staff._setCtx(null);
        if (kind === 'edit') { inp.value = msg.content; inp.dataset.wasEdit = '1'; }
        inp.focus();
    },
    async reloadChat(first) {
        const Z = window.ZUI, m = Staff._m;
        if (!m || !document.body.contains(m.el)) { clearInterval(Staff._timer); return; }
        const list = m.body.querySelector('#zsc-list');
        let d;
        try { d = await Z.call('/api/staff/chat'); } catch (e) { if (first) list.innerHTML = `<div class="zu-empty"><b>Couldn't load the chat</b><span>${Z.esc(e.message)}</span></div>`; return; }
        Staff._d = d;
        const online = d.staff.filter(s => s.online).length;
        m.body.querySelector('#zsc-staff').innerHTML = d.staff.map(s => `<div class="zsc-person"><span class="zsc-av ${s.role}">${Z.esc(s.username[0].toUpperCase())}<i class="${s.online ? 'on' : ''}"></i></span><div><b>${Z.esc(s.username)}</b><span>${s.role === 'owner' ? 'Owner' : 'Admin'} · ${s.online ? 'online' : 'away'}</span></div></div>`).join('');
        const sub = m.el.querySelector('.zu-head-t p'); if (sub) sub.textContent = `${d.staff.length} on the team · ${online} online now`;
        m.body.querySelector('#zsc-typing').innerHTML = d.typing.length ? `<span class="zps-dots"><i></i><i></i><i></i></span> ${Z.esc(d.typing.join(', '))} ${d.typing.length > 1 ? 'are' : 'is'} typing…` : '';
        if (m.head && !m.head.querySelector('#zsc-clear') && d.me.role === 'owner') {
            m.head.innerHTML = '<button class="zu-btn sm danger" id="zsc-clear">Clear chat</button>';
            m.head.querySelector('#zsc-clear').onclick = () => Staff.clearChat();
        }
        const sig = JSON.stringify(d.messages.map(x => [x.id, x.content, x.edited, x.reactions]));
        if (sig === Staff._sig) return;
        const nearBottom = first || list.scrollHeight - list.scrollTop - list.clientHeight < 120 || !Staff._sig;
        Staff._sig = sig;
        if (!d.messages.length) { list.innerHTML = `<div class="zu-empty">${Z.icon('users')}<b>No messages yet</b><span>Say hello to the team — this is the place to plan, hand things over and ask for help.</span></div>`; return; }
        const day = iso => { const dt = new Date(iso), t = new Date(), y = new Date(Date.now() - 864e5); return dt.toDateString() === t.toDateString() ? 'Today' : dt.toDateString() === y.toDateString() ? 'Yesterday' : dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }); };
        const time = iso => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        const linkify = t => Z.esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/(^|\s)@([A-Za-z0-9_.\-]{2,30})/g, '$1<span class="zsc-at">@$2</span>');
        let html = '', lastDay = '', last = null;
        d.messages.forEach(x => {
            const dd = day(x.t);
            if (dd !== lastDay) { html += `<div class="zsc-day"><span>${dd}</span></div>`; lastDay = dd; last = null; }
            const grouped = last && last.user_id === x.user_id && (new Date(x.t) - new Date(last.t)) < 5 * 60000 && !x.reply;
            const reacts = Object.entries(x.reactions || {}).map(([e, who]) => `<button class="zsc-react${who.includes(d.staff.find(s => s.id === d.me.id)?.username) ? ' mine' : ''}" data-react="${e}" title="${Z.esc(who.join(', '))}">${e}<b>${who.length}</b></button>`).join('');
            html += `<div class="zsc-msg${x.mine ? ' mine' : ''}${grouped ? ' grouped' : ''}" data-id="${x.id}">
                ${grouped || x.mine ? '<span class="zsc-av ghost"></span>' : `<span class="zsc-av ${x.role}">${Z.esc(x.username[0].toUpperCase())}</span>`}
                <div class="zsc-col">${grouped ? '' : `<div class="zsc-who"><b class="${x.role}">${x.mine ? 'You' : Z.esc(x.username)}</b>${x.role === 'owner' ? '<i>Owner</i>' : ''}<span>${time(x.t)}</span></div>`}
                  ${x.reply ? `<div class="zsc-quote"><b>${Z.esc(x.reply.username)}</b>${Z.esc(x.reply.text)}</div>` : ''}
                  <div class="zsc-bub">${linkify(x.content)}${x.edited ? '<em>edited</em>' : ''}</div>
                  ${reacts ? `<div class="zsc-reacts">${reacts}</div>` : ''}</div>
                <div class="zsc-tools"><button data-a="react" title="React" aria-label="React">${Z.icon('smile')}</button><button data-a="reply" title="Reply" aria-label="Reply">${Z.icon('reply')}</button>${x.mine ? `<button data-a="edit" title="Edit" aria-label="Edit">${Z.icon('pen')}</button>` : ''}${x.mine || d.me.role === 'owner' ? `<button data-a="del" title="Delete" aria-label="Delete">${Z.icon('trash')}</button>` : ''}</div></div>`;
            last = x;
        });
        list.innerHTML = html;
        if (nearBottom) list.scrollTop = list.scrollHeight;
        list.querySelectorAll('.zsc-msg').forEach(row => {
            const msg = d.messages.find(x => x.id === +row.dataset.id);
            const react = async e => { try { await Z.call(`/api/staff/chat/${msg.id}/react`, { method: 'POST', body: { emoji: e } }); Staff._sig = ''; Staff.reloadChat(); } catch (err) { Z.toast(err.message, 'error'); } };
            row.querySelectorAll('[data-react]').forEach(b => b.onclick = () => react(b.dataset.react));
            row.querySelectorAll('[data-a]').forEach(b => b.onclick = async ev => {
                const a = b.dataset.a;
                if (a === 'reply') Staff._setCtx('reply', msg);
                else if (a === 'edit') Staff._setCtx('edit', msg);
                else if (a === 'del') { if (!(await Z.confirmBox('Delete this message?', 'It is removed for everyone on the team.', true))) return; try { await Z.call('/api/staff/chat/' + msg.id, { method: 'DELETE' }); Staff._sig = ''; Staff.reloadChat(); } catch (err) { Z.toast(err.message, 'error'); } }
                else if (a === 'react') {
                    ev.stopPropagation();
                    document.querySelectorAll('.zsc-pick').forEach(p => p.remove());
                    const p = document.createElement('div'); p.className = 'zsc-pick';
                    p.innerHTML = d.reactions.map(e => `<button data-e="${e}">${e}</button>`).join('');
                    row.querySelector('.zsc-tools').appendChild(p);
                    p.onclick = e2 => { const eb = e2.target.closest('[data-e]'); if (eb) { p.remove(); react(eb.dataset.e); } };
                    setTimeout(() => document.addEventListener('click', () => p.remove(), { once: true }), 0);
                }
            });
        });
    },
    async sendChat() {
        const Z = window.ZUI, inp = Staff._m && Staff._m.body.querySelector('#zsc-in');
        if (!inp) return;
        const txt = inp.value.trim();
        if (!txt) return;
        try {
            if (Staff._edit) await Z.call('/api/staff/chat/' + Staff._edit.id, { method: 'PATCH', body: { content: txt } });
            else await Z.call('/api/staff/chat', { method: 'POST', body: { content: txt, reply_to: Staff._reply ? Staff._reply.id : null } });
            delete inp.dataset.wasEdit; inp.value = ''; inp.style.height = 'auto';
            Staff._setCtx(null); Staff._sig = '';
            await Staff.reloadChat(true);
        } catch (e) { Z.toast(e.message, 'error'); }
    },
    async clearChat() {
        const ok = await showConfirm('Clear the team chat?', 'Every message is deleted for the whole team. Only the Owner can do this.', true);
        if (!ok) return;
        try { await api('/api/staff/chat', { method: 'DELETE' }); showToast('Team chat cleared', 'success'); Staff._sig = ''; await Staff.reloadChat(true); } catch (e) { showToast(e.message, 'error'); }
    },
    async loadAttention() {
        const list = $('attention-list');
        const form = $('attention-broadcast-form');
        // Show broadcast form only to staff (owner/admin)
        try {
            const me = await api('/api/auth/me');
            const isStaff = me.user && (me.user.is_admin || me.user.role === 'owner');
            if (form) form.style.display = isStaff ? 'flex' : 'none';
        } catch { if (form) form.style.display = 'none'; }
        if (!list) return;
        list.innerHTML = '<p style="color:#888; text-align:center; padding:20px; font-size:13px;">Loading broadcasts...</p>';
        try {
            const d = await api('/api/announcements/feed');
            const anns = d.announcements || [];
            list.innerHTML = '';
            if (!anns.length) { list.innerHTML = '<p style="color:#888; text-align:center; padding:20px; font-size:13px;">No broadcasts yet.</p>'; return; }
            anns.slice().reverse().forEach(a => {
                const isOwner = a.role === 'owner';
                const color = isOwner ? '#C0C7D1' : '#8B949E';
                const tag = isOwner ? 'OWNER' : 'STAFF';
                const div = document.createElement('div');
                div.style.cssText = 'padding:10px; background:rgba(0,0,0,0.25); border:1px solid var(--border); border-radius:8px; border-left:3px solid ' + color + ';';
                // Format time locally
                let when = a.created_at;
                try { const dt = new Date(a.created_at.replace(' ', 'T') + 'Z'); when = dt.toLocaleString(); } catch {}
                div.innerHTML = `<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;"><span style="font-size:12px; font-weight:700; color:${color};">${Staff.esc(a.username)}</span><span style="font-size:9px; padding:1px 5px; border-radius:4px; background:${color}22; color:${color}; font-weight:600;">${tag}</span><span style="font-size:10px; color:#666; margin-left:auto;">${Staff.esc(when)}</span></div><div style="font-size:13px; color:#e5e5e5; white-space:pre-wrap; word-wrap:break-word;">${Staff.esc(a.content)}</div>`;
                list.appendChild(div);
            });
            list.scrollTop = list.scrollHeight;
        } catch (e) { list.innerHTML = '<p style="color:var(--error); text-align:center; padding:20px;">' + Staff.esc(e.message) + '</p>'; }
    },
    async sendBroadcast() {
        const inp = $('attention-input');
        const txt = inp.value.trim();
        if (!txt) { showToast('Write a broadcast', 'error'); return; }
        try {
            await api('/api/announcements', { method: 'POST', body: JSON.stringify({ content: txt }) });
            inp.value = '';
            showToast('Broadcast sent to all users', 'success');
            await Staff.loadAttention();
        } catch (e) { showToast(e.message, 'error'); }
    },
    esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
};
