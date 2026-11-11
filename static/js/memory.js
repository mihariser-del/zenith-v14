/* Memory: what Zelpophai remembers about you. Categories, pin, search, edit, learn from recent
   chats, tidy up duplicates, export, pause and forget everything. Memory.open() */
const Memory = (function () {
  'use strict';
  const { esc, toast, call, icon, modal, ago, confirmBox } = window.ZUI;
  let M = null, D = null, filter = '', q = '', editing = null;
  const CAT_COLOR = { about: '#60a5fa', preferences: '#f472b6', work: '#34d399', projects: '#a78bfa', people: '#fb923c', goals: '#facc15', other: '#94a3b8' };

  async function load() {
    D = await call('/api/memories');
    draw();
  }
  function visible() {
    let rows = D.memories;
    if (filter === 'pinned') rows = rows.filter((m) => m.pinned);
    else if (filter === 'auto') rows = rows.filter((m) => m.source === 'auto');
    else if (filter) rows = rows.filter((m) => m.category === filter);
    if (q) rows = rows.filter((m) => m.content.toLowerCase().includes(q.toLowerCase()));
    return rows;
  }
  function draw() {
    if (!M || !document.body.contains(M.el)) return;
    const chips = [['', 'All', D.total], ['pinned', 'Pinned', D.pinned], ...Object.entries(D.categories).filter(([k]) => D.counts[k]).map(([k, l]) => [k, l, D.counts[k]]), ...(D.auto ? [['auto', 'Learned by Zelpophai', D.auto]] : [])];
    const rows = visible();
    M.body.innerHTML = `
      <div class="zmm-top"><div class="zmm-switch"><button class="zu-switch${D.enabled ? ' on' : ''}" id="zmm-on" role="switch" aria-checked="${D.enabled}" aria-label="Use memory"></button>
          <div><b>${D.enabled ? 'Memory is on' : 'Memory is paused'}</b><span>${D.enabled ? 'Zelpophai uses these in every chat and learns new things as you talk.' : 'Nothing is used or learned until you turn it back on. Your memories are kept.'}</span></div></div>
        <div class="zmm-meter" title="${D.total} of ${D.limit} memories"><i style="width:${Math.min(100, D.total / D.limit * 100)}%"></i><span>${D.total} / ${D.limit}</span></div></div>
      <div class="zmm-add"><input class="zu-in" id="zmm-new" maxlength="400" placeholder="Teach Zelpophai something, e.g. I'm vegetarian · My dog is called Max">
        <select class="zu-in" id="zmm-cat" aria-label="Category"><option value="">Auto</option>${Object.entries(D.categories).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
        <button class="zu-btn pri" id="zmm-add-btn">${icon('plus')} Remember</button></div>
      <div class="zmm-bar"><div class="zmm-search">${icon('search')}<input id="zmm-q" placeholder="Search memories…" value="${esc(q)}" aria-label="Search memories"></div>
        <div class="zmm-tools"><button class="zu-btn sm" id="zmm-learn" title="Look through your recent chats for things worth remembering">${icon('brain')} Learn from my chats</button>
          <button class="zu-btn sm" id="zmm-tidy" title="Merge duplicates and sort everything into categories">${icon('wand')} Tidy up</button>
          <div class="zmm-more"><button class="zu-btn sm" id="zmm-more-btn" aria-label="More" aria-haspopup="menu">${icon('more')}</button>
            <div class="zmm-menu" id="zmm-menu" hidden role="menu"><button id="zmm-export" role="menuitem">${icon('download')} Download my memories</button><button id="zmm-forget" class="danger" role="menuitem">${icon('trash')} Forget everything</button></div></div></div></div>
      <div class="zu-chips zmm-chips" id="zmm-chips">${chips.map(([k, l, n]) => `<button data-f="${k}" class="${k === filter ? 'on' : ''}">${k && CAT_COLOR[k] ? `<i style="background:${CAT_COLOR[k]}"></i>` : ''}${esc(l)} <span>${n}</span></button>`).join('')}</div>
      <div class="zmm-list" id="zmm-list">${rows.length ? rows.map(item).join('') : empty()}</div>`;
    wire();
  }
  function empty() {
    if (D.total && (q || filter)) return `<div class="zu-empty">${icon('search')}<b>Nothing matches</b><span>Try another word or category.</span></div>`;
    return `<div class="zu-empty">${icon('brain')}<b>No memories yet</b><span>Tell Zelpophai something above, say “remember that…” in a chat, or tap <b>Learn from my chats</b>. Good memories are short facts: your name, what you study, what you like.</span></div>`;
  }
  function item(m) {
    if (editing === m.id) {
      return `<div class="zmm-item edit" data-id="${m.id}"><textarea class="zu-in" rows="2" maxlength="400" id="zmm-edit-t">${esc(m.content)}</textarea>
        <div class="zmm-edit-row"><select class="zu-in" id="zmm-edit-c">${Object.entries(D.categories).map(([k, l]) => `<option value="${k}"${k === m.category ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
          <button class="zu-btn sm" data-a="cancel">Cancel</button><button class="zu-btn sm pri" data-a="save">Save</button></div></div>`;
    }
    return `<div class="zmm-item${m.pinned ? ' pinned' : ''}" data-id="${m.id}"><span class="zmm-dot" style="background:${CAT_COLOR[m.category] || CAT_COLOR.other}"></span>
      <div class="zmm-main"><p>${esc(m.content)}</p><span>${esc(D.categories[m.category] || 'Other')}${m.source === 'auto' ? ' · learned from a chat' : ''} · ${ago(m.updated_at)}${m.uses ? ` · used ${m.uses}×` : ''}</span></div>
      <div class="zmm-act"><button data-a="pin" class="${m.pinned ? 'on' : ''}" title="${m.pinned ? 'Unpin' : 'Pin — always use this'}" aria-label="${m.pinned ? 'Unpin' : 'Pin'}" aria-pressed="${m.pinned}">${icon('pin')}</button>
        <button data-a="edit" title="Edit" aria-label="Edit">${icon('pen')}</button><button data-a="del" title="Delete" aria-label="Delete">${icon('trash')}</button></div></div>`;
  }
  function wire() {
    const $ = (s) => M.body.querySelector(s);
    $('#zmm-on').onclick = async () => { try { await call('/api/settings', { method: 'PATCH', body: { memory_enabled: !D.enabled } }); D.enabled = !D.enabled; toast(D.enabled ? 'Memory is on' : 'Memory paused', 'success'); const sel = document.getElementById('memory-enabled'); if (sel) sel.value = String(D.enabled); draw(); } catch (e) { toast(e.message, 'error'); } };
    const add = async () => {
      const v = $('#zmm-new').value.trim(); if (!v) return $('#zmm-new').focus();
      try { await call('/api/memories', { method: 'POST', body: { content: v, category: $('#zmm-cat').value } }); toast('Remembered', 'success'); await load(); const n = M.body.querySelector('#zmm-new'); if (n) n.focus(); } catch (e) { toast(e.message, 'error'); }
    };
    $('#zmm-add-btn').onclick = add;
    $('#zmm-new').onkeydown = (e) => { if (e.key === 'Enter') add(); };
    let st;
    $('#zmm-q').oninput = (e) => { q = e.target.value; clearTimeout(st); st = setTimeout(() => { const list = $('#zmm-list'); const rows = visible(); list.innerHTML = rows.length ? rows.map(item).join('') : empty(); wireList(); }, 120); };
    $('#zmm-chips').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; filter = b.dataset.f; draw(); };
    $('#zmm-learn').onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true; b.innerHTML = `${icon('brain')} Reading your chats…`;
      try { const r = await call('/api/memories/auto-extract', { method: 'POST' }); const n = (r.memories || []).length, u = (r.updated || []).length;
        toast(r.off ? 'Memory is paused — turn it on first' : n || u ? `Learned ${n} new thing${n === 1 ? '' : 's'}${u ? ` and updated ${u}` : ''}` : (r.message || r.error || 'Nothing new worth remembering'), n || u ? 'success' : ''); if (n) filter = 'auto'; }
      catch (err) { toast(err.message, 'error'); }
      await load();
    };
    $('#zmm-tidy').onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true; b.innerHTML = `${icon('wand')} Tidying…`;
      try { const r = await call('/api/memories/tidy', { method: 'POST' }); toast(r.message || 'Done', 'success'); } catch (err) { toast(err.message, 'error'); }
      await load();
    };
    const menu = $('#zmm-menu');
    $('#zmm-more-btn').onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
    M.body.addEventListener('click', (e) => { if (!e.target.closest('.zmm-more')) menu.hidden = true; });
    $('#zmm-export').onclick = () => { const a = document.createElement('a'); a.href = '/api/memories/export'; a.download = 'zelpophai-memories.txt'; document.body.appendChild(a); a.click(); a.remove(); menu.hidden = true; };
    $('#zmm-forget').onclick = async () => {
      menu.hidden = true;
      if (!D.total) return toast('There is nothing to forget');
      if (!(await confirmBox('Forget everything?', `All ${D.total} memories are deleted for good. Zelpophai won't remember anything about you from earlier chats.`, true))) return;
      try { const r = await call('/api/memories/forget-all', { method: 'POST', body: { confirm: 'FORGET' } }); toast(`Forgot ${r.deleted} memories`, 'success'); filter = ''; q = ''; await load(); } catch (e) { toast(e.message, 'error'); }
    };
    wireList();
  }
  function wireList() {
    M.body.querySelectorAll('.zmm-item').forEach((row) => {
      const id = +row.dataset.id, m = D.memories.find((x) => x.id === id);
      row.querySelectorAll('[data-a]').forEach((b) => b.onclick = async () => {
        const a = b.dataset.a;
        try {
          if (a === 'pin') { await call('/api/memories/' + id, { method: 'PATCH', body: { pinned: !m.pinned } }); await load(); }
          else if (a === 'edit') { editing = id; draw(); const t = M.body.querySelector('#zmm-edit-t'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }
          else if (a === 'cancel') { editing = null; draw(); }
          else if (a === 'save') { await call('/api/memories/' + id, { method: 'PATCH', body: { content: M.body.querySelector('#zmm-edit-t').value, category: M.body.querySelector('#zmm-edit-c').value } }); editing = null; toast('Saved', 'success'); await load(); }
          else if (a === 'del') { if (!(await confirmBox('Delete this memory?', 'Zelpophai will forget it.', true))) return; await call('/api/memories/' + id, { method: 'DELETE' }); toast('Forgotten', 'success'); await load(); }
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }
  async function open() {
    filter = ''; q = ''; editing = null;
    M = modal({ id: 'zmm', title: 'Memory', icon: 'brain', sub: 'What Zelpophai remembers about you, across all your chats.', wide: true, tall: true });
    M.body.innerHTML = '<div class="zu-load">Loading…</div>';
    try { await load(); } catch (e) { M.body.innerHTML = `<div class="zu-empty"><b>Couldn't load your memories</b><span>${esc(e.message)}</span></div>`; }
  }
  function close() { if (M) M.close(); }
  return { open, close, load };
})();
