/* Knowledge, Files and Reminders — three windows built on the shared kit (zui.js).
   They replace the old pop-ups: Knowledge.open(), Files.open() and Reminders.open() keep working. */
(function () {
  'use strict';
  const { esc, toast, call, icon, modal } = window.ZUI;
  // The server sends some times without a time zone; they are UTC.
  const utc = (t) => (typeof t === 'string' && !/([zZ]|[+-]\d\d:?\d\d)$/.test(t)) ? t + 'Z' : t;
  const ago = (t) => window.ZUI.ago(utc(t));
  const sv = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    book: sv('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>'),
    file: sv('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
    up: sv('<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>'),
    bell: sv('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
    eye: sv('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    back: sv('<path d="M15 6l-6 6 6 6"/>'),
    repeat: sv('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>'),
  };
  const size = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
  const guest = () => ((window.user || {}).username || '').startsWith('guest_');
  const confirmDel = (t, m) => window.showConfirm(t, m, true);

  /* ═══════════════════════════ Knowledge ═══════════════════════════ */
  const K = { m: null, list: [], cur: null, items: [], q: '' };
  async function kOpen() {
    K.m = modal({ id: 'zkb', title: 'Knowledge', icon: 'book', sub: 'Notes and documents Zelpophai can look things up in when it answers you.', tall: true, wide: true });
    K.cur = null; K.q = '';
    await kHome();
  }
  async function kHome() {
    const M = K.m; if (!M) return;
    M.body.innerHTML = '<div class="zu-load">Loading…</div>';
    try { K.list = (await call('/api/knowledge')).knowledge_bases; } catch (e) { M.body.innerHTML = `<div class="zu-empty"><b>Couldn't load Knowledge</b><span>${esc(e.message)}</span></div>`; return; }
    const total = K.list.reduce((a, b) => a + b.item_count, 0);
    M.body.innerHTML = `<div class="zlb-bar"><div class="zlb-search">${icon('search')}<input class="zu-in" id="zkb-q" placeholder="Search everything you've saved…" autocomplete="off"></div><button class="zu-btn pri" id="zkb-new">${icon('plus')} New collection</button></div>
      <div id="zkb-results"></div>
      <div id="zkb-home">${K.list.length ? `<p class="zlb-count">${K.list.length} collection${K.list.length === 1 ? '' : 's'} · ${total} item${total === 1 ? '' : 's'}</p><div class="zlb-grid">${K.list.map((b) => `<button type="button" class="zlb-card" data-kb="${b.id}"><span class="zlb-card-ic">${IC.book}</span><b>${esc(b.name)}</b><span>${esc(b.description || 'No description')}</span><i>${b.item_count} item${b.item_count === 1 ? '' : 's'} · made ${ago(b.created_at)}</i></button>`).join('')}</div>`
        : `<div class="zu-empty">${icon('book')}<b>Teach Zelpophai what you know</b><span>Make a collection (for example “School notes” or “My business”), add text or files to it, and Zelpophai will use it when you ask about those things.</span><button class="zu-btn pri sm" id="zkb-first">Make my first collection</button></div>`}</div>`;
    const q = M.body.querySelector('#zkb-q'); let t;
    q.oninput = () => { clearTimeout(t); t = setTimeout(() => kSearch(q.value.trim()), 280); };
    M.body.querySelector('#zkb-new').onclick = () => kEdit();
    const f = M.body.querySelector('#zkb-first'); if (f) f.onclick = () => kEdit();
    M.body.querySelectorAll('[data-kb]').forEach((b) => b.onclick = () => kShow(+b.dataset.kb));
  }
  async function kSearch(term) {
    const M = K.m, res = M.body.querySelector('#zkb-results'), home = M.body.querySelector('#zkb-home'); if (!res) return;
    if (term.length < 2) { res.innerHTML = ''; home.hidden = false; return; }
    home.hidden = true; res.innerHTML = '<div class="zu-load">Searching…</div>';
    try {
      const r = await call('/api/knowledge/search', { method: 'POST', body: { query: term, kb_ids: [] } });
      const hits = r.results || r.items || [];
      res.innerHTML = hits.length ? `<p class="zlb-count">${hits.length} match${hits.length === 1 ? '' : 'es'}</p><div class="zlb-items">${hits.slice(0, 40).map((h) => `<div class="zlb-item"><div class="zlb-item-t">${mark(esc((h.content || '').slice(0, 320)), term)}${(h.content || '').length > 320 ? '…' : ''}</div><div class="zlb-item-m">${esc(h.kb_name || h.source || '')}</div></div>`).join('')}</div>`
        : `<div class="zu-empty">${icon('search')}<b>Nothing found</b><span>No saved item mentions “${esc(term)}”.</span></div>`;
    } catch (e) { res.innerHTML = `<div class="zu-empty"><b>Search didn't work</b><span>${esc(e.message)}</span></div>`; }
  }
  const mark = (html, term) => { try { return html.replace(new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); } catch (e) { return html; } };
  function kEdit(kb) {
    const P = modal({ id: 'zkb-edit', title: kb ? 'Rename collection' : 'New collection', icon: 'book' });
    P.body.innerHTML = `<label class="zu-l" for="zkb-n">Name</label><input class="zu-in" id="zkb-n" maxlength="100" placeholder="e.g. School notes" value="${esc(kb ? kb.name : '')}">
      <label class="zu-l" for="zkb-d">What's in it? <em>(optional)</em></label><textarea class="zu-in" id="zkb-d" rows="3" maxlength="500" placeholder="A short description helps you find it later.">${esc(kb ? kb.description || '' : '')}</textarea>
      <div class="zst-err" id="zkb-e" role="alert"></div><button class="zu-btn pri wide" id="zkb-s">${kb ? 'Save' : 'Create collection'}</button>`;
    const g = (i) => P.body.querySelector('#' + i);
    const go = async () => {
      const name = g('zkb-n').value.trim(), description = g('zkb-d').value.trim();
      if (!name) { g('zkb-e').textContent = 'Give it a name.'; return; }
      g('zkb-s').disabled = true;
      try {
        if (kb) { await call('/api/knowledge/' + kb.id, { method: 'PATCH', body: { name, description } }); P.close(); toast('Saved', 'success'); await kShow(kb.id); }
        else { const r = await call('/api/knowledge', { method: 'POST', body: { name, description } }); P.close(); toast('Collection created', 'success'); await kShow(r.knowledge_base.id); }
      } catch (e) { g('zkb-e').textContent = e.message; g('zkb-s').disabled = false; }
    };
    g('zkb-s').onclick = go; g('zkb-n').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    setTimeout(() => g('zkb-n').focus(), 60);
  }
  async function kShow(id) {
    const M = K.m; if (!M) return;
    M.body.innerHTML = '<div class="zu-load">Loading…</div>';
    try { K.list = (await call('/api/knowledge')).knowledge_bases; K.items = (await call(`/api/knowledge/${id}/items`)).items; } catch (e) { toast(e.message, 'error'); return kHome(); }
    const kb = K.cur = K.list.find((b) => b.id === id); if (!kb) return kHome();
    const words = K.items.reduce((a, i) => a + (i.content || '').split(/\s+/).filter(Boolean).length, 0);
    M.body.innerHTML = `<div class="zlb-crumb"><button class="zu-btn sm" id="zkb-back">${IC.back} All collections</button><div class="zlb-crumb-t"><b>${esc(kb.name)}</b><span>${esc(kb.description || '')}</span></div>
        <button class="zu-btn sm" id="zkb-ren">${icon('pen')} Rename</button><button class="zu-btn sm danger" id="zkb-del">${icon('trash')} Delete</button></div>
      <div class="zlb-add"><textarea class="zu-in" id="zkb-text" rows="3" placeholder="Type or paste something for Zelpophai to remember — a fact, your notes, a price list…"></textarea>
        <div class="zlb-add-b"><input type="file" id="zkb-file" accept=".txt,.md,.json,.csv,text/*" multiple hidden><button class="zu-btn sm" id="zkb-up">${IC.up} Add text files</button><span class="zlb-hint">.txt, .md, .csv or .json</span><button class="zu-btn pri sm" id="zkb-add">Add</button></div></div>
      <p class="zlb-count">${K.items.length} item${K.items.length === 1 ? '' : 's'} · about ${words.toLocaleString()} words</p>
      <div class="zlb-items" id="zkb-items">${K.items.length ? K.items.map((i) => `<div class="zlb-item" data-id="${i.id}"><div class="zlb-item-t${(i.content || '').length > 300 ? ' clip' : ''}">${esc(i.content)}</div>
          <div class="zlb-item-m"><span>${i.source_type === 'file' ? 'From ' + esc(i.source || 'a file') : 'Typed in'} · ${ago(i.created_at)}</span><span class="zlb-item-a">${(i.content || '').length > 300 ? '<button data-a="more">Show all</button>' : ''}<button data-a="edit">Edit</button><button data-a="del" class="bad">Delete</button></span></div></div>`).join('')
        : `<div class="zu-empty">${icon('book')}<b>Nothing in here yet</b><span>Add some text above, or upload a text file.</span></div>`}</div>`;
    const g = (i) => M.body.querySelector('#' + i);
    g('zkb-back').onclick = kHome;
    g('zkb-ren').onclick = () => kEdit(kb);
    g('zkb-del').onclick = async () => { if (!(await confirmDel('Delete this collection?', `“${kb.name}” and its ${K.items.length} item${K.items.length === 1 ? '' : 's'} will be removed for good.`))) return; try { await call('/api/knowledge/' + id, { method: 'DELETE' }); toast('Collection deleted', 'success'); kHome(); } catch (e) { toast(e.message, 'error'); } };
    g('zkb-add').onclick = async () => { const content = g('zkb-text').value.trim(); if (!content) return toast('Type something first', 'error'); g('zkb-add').disabled = true; try { await call(`/api/knowledge/${id}/items`, { method: 'POST', body: { content, source: '', source_type: 'text' } }); toast('Added', 'success'); kShow(id); } catch (e) { toast(e.message, 'error'); g('zkb-add').disabled = false; } };
    g('zkb-up').onclick = () => g('zkb-file').click();
    g('zkb-file').onchange = async () => {
      const files = [...g('zkb-file').files]; if (!files.length) return;
      const items = [];
      for (const f of files) { if (f.size > 2 * 1048576) { toast(`${f.name} is too big (2 MB at most)`, 'error'); continue; } const text = (await f.text()).trim(); if (text) items.push({ content: text.slice(0, 200000), source: f.name, source_type: 'file' }); }
      if (!items.length) return;
      try { const r = await call(`/api/knowledge/${id}/items/batch`, { method: 'POST', body: { items } }); toast(`Added ${r.count} file${r.count === 1 ? '' : 's'}`, 'success'); kShow(id); } catch (e) { toast(e.message, 'error'); }
    };
    g('zkb-items').onclick = async (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const row = b.closest('[data-id]'), it = K.items.find((x) => x.id === +row.dataset.id);
      if (b.dataset.a === 'more') { const t = row.querySelector('.zlb-item-t'); const open = t.classList.toggle('clip'); b.textContent = open ? 'Show all' : 'Show less'; }
      else if (b.dataset.a === 'del') { if (!(await confirmDel('Delete this item?', 'Zelpophai will no longer be able to look this up.'))) return; try { await call(`/api/knowledge/${id}/items/${it.id}`, { method: 'DELETE' }); kShow(id); } catch (err) { toast(err.message, 'error'); } }
      else if (b.dataset.a === 'edit') {
        const P = modal({ id: 'zkb-item', title: 'Edit item', icon: 'pen', wide: true });
        P.body.innerHTML = `<textarea class="zu-in" id="zkb-it" rows="12">${esc(it.content)}</textarea><button class="zu-btn pri wide" id="zkb-is">Save</button>`;
        P.body.querySelector('#zkb-is').onclick = async () => { const content = P.body.querySelector('#zkb-it').value.trim(); if (!content) return toast('It can\'t be empty', 'error'); try { await call(`/api/knowledge/${id}/items/${it.id}`, { method: 'PATCH', body: { content } }); P.close(); toast('Saved', 'success'); kShow(id); } catch (err) { toast(err.message, 'error'); } };
      }
    };
  }

  /* ═══════════════════════════ Files ═══════════════════════════ */
  const F = { m: null, files: [], type: 'all', q: '', sort: 'new', sel: new Set() };
  const kindOf = (f) => (f.mime_type || '').startsWith('image/') ? 'image' : /pdf|word|officedocument|text|csv|json|markdown|presentation|sheet|excel/.test(f.mime_type || '') || /\.(pdf|docx?|pptx?|xlsx?|txt|md|csv|json)$/i.test(f.filename) ? 'doc' : /^(audio|video)\//.test(f.mime_type || '') ? 'media' : 'other';
  const extOf = (n) => ((/\.([a-z0-9]+)$/i.exec(n || '') || [, 'file'])[1]).toLowerCase().slice(0, 4);
  const EXT_C = { pdf: '#dc2626', doc: '#2563eb', docx: '#2563eb', ppt: '#ea580c', pptx: '#ea580c', xls: '#16a34a', xlsx: '#16a34a', csv: '#16a34a', txt: '#64748b', md: '#64748b', json: '#7c3aed', mp3: '#db2777', mp4: '#db2777', zip: '#ca8a04' };
  async function fOpen() {
    F.m = modal({ id: 'zfl', title: 'Files', icon: 'download', sub: 'Everything you have attached in your chats.', tall: true, wide: true });
    F.sel = new Set(); F.q = ''; F.type = 'all';
    F.m.body.innerHTML = '<div class="zu-load">Loading…</div>';
    await fLoad();
  }
  async function fLoad() {
    try { F.files = (await call('/api/files')).files; } catch (e) { F.m.body.innerHTML = `<div class="zu-empty"><b>Couldn't load your files</b><span>${esc(e.message)}</span></div>`; return; }
    fDraw();
  }
  function fDraw() {
    const M = F.m; if (!M) return;
    const total = F.files.reduce((a, f) => a + f.file_size, 0);
    const counts = { all: F.files.length, image: 0, doc: 0, media: 0, other: 0 }; F.files.forEach((f) => { counts[kindOf(f)]++; });
    let list = F.files.filter((f) => (F.type === 'all' || kindOf(f) === F.type) && (!F.q || f.filename.toLowerCase().includes(F.q)));
    list = list.sort(F.sort === 'big' ? (a, b) => b.file_size - a.file_size : F.sort === 'name' ? (a, b) => a.filename.localeCompare(b.filename) : (a, b) => new Date(utc(b.created_at)) - new Date(utc(a.created_at)));
    [...F.sel].forEach((id) => { if (!F.files.some((f) => f.id === id)) F.sel.delete(id); });
    M.body.innerHTML = `<div class="zlb-bar"><div class="zlb-search">${icon('search')}<input class="zu-in" id="zfl-q" placeholder="Search by file name…" value="${esc(F.q)}" autocomplete="off"></div>
        <select class="zu-in zlb-sel" id="zfl-sort" aria-label="Sort"><option value="new">Newest first</option><option value="big">Biggest first</option><option value="name">Name A–Z</option></select>
        <input type="file" id="zfl-file" multiple hidden><button class="zu-btn pri" id="zfl-up">${IC.up} Upload</button></div>
      <div class="zlb-chips" id="zfl-types">${[['all', 'All'], ['image', 'Pictures'], ['doc', 'Documents'], ['media', 'Audio & video'], ['other', 'Other']].filter(([k]) => k === 'all' || counts[k]).map(([k, l]) => `<button class="${F.type === k ? 'on' : ''}" data-t="${k}">${l} <i>${counts[k]}</i></button>`).join('')}
        <span class="zlb-count" style="margin:0 0 0 auto">${F.files.length} file${F.files.length === 1 ? '' : 's'} · ${size(total)}</span></div>
      ${F.sel.size ? `<div class="zlb-selbar"><b>${F.sel.size} chosen</b><button class="zu-btn sm" id="zfl-none">Clear</button><button class="zu-btn sm danger" id="zfl-delsel">${icon('trash')} Delete chosen</button></div>` : ''}
      <div class="zlb-files" id="zfl-list">${list.length ? list.map((f) => { const k = kindOf(f), ext = extOf(f.filename);
          return `<div class="zlb-file${F.sel.has(f.id) ? ' sel' : ''}" data-id="${f.id}"><label class="zlb-check" title="Choose"><input type="checkbox" ${F.sel.has(f.id) ? 'checked' : ''} aria-label="Choose ${esc(f.filename)}"></label>
            ${k === 'image' ? `<span class="zlb-thumb"><img src="/api/files/${f.id}/download" alt="" loading="lazy"></span>` : `<span class="zlb-thumb ext" style="--c:${EXT_C[ext] || '#475569'}">${esc(ext.toUpperCase())}</span>`}
            <div class="zlb-file-t"><b title="${esc(f.filename)}">${esc(f.filename)}</b><span>${size(f.file_size)} · ${ago(f.created_at)}</span></div>
            <span class="zlb-file-a"><button data-a="view" title="Look inside" aria-label="Look inside">${IC.eye}</button><button data-a="dl" title="Download" aria-label="Download">${icon('download')}</button><button data-a="del" class="bad" title="Delete" aria-label="Delete">${icon('trash')}</button></span></div>`; }).join('')
        : `<div class="zu-empty">${icon('download')}<b>${F.files.length ? 'No files match' : 'No files yet'}</b><span>${F.files.length ? 'Try another search or type.' : 'Files you attach in a chat show up here. You can also upload one now.'}</span></div>`}</div>`;
    const g = (i) => M.body.querySelector('#' + i);
    g('zfl-sort').value = F.sort;
    g('zfl-q').oninput = () => { F.q = g('zfl-q').value.trim().toLowerCase(); fDraw(); const q = F.m.body.querySelector('#zfl-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); };
    g('zfl-sort').onchange = () => { F.sort = g('zfl-sort').value; fDraw(); };
    g('zfl-types').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { F.type = b.dataset.t; fDraw(); } };
    g('zfl-up').onclick = () => g('zfl-file').click();
    g('zfl-file').onchange = async () => {
      const files = [...g('zfl-file').files]; if (!files.length) return; let ok = 0;
      g('zfl-up').disabled = true; g('zfl-up').textContent = 'Uploading…';
      for (const f of files) { const fd = new FormData(); fd.append('file', f); try { const r = await fetch('/api/files/upload', { method: 'POST', body: fd, credentials: 'same-origin' }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Upload failed'); ok++; } catch (e) { toast(`${f.name}: ${e.message}`, 'error'); } }
      if (ok) toast(`Uploaded ${ok} file${ok === 1 ? '' : 's'}`, 'success'); fLoad();
    };
    if (g('zfl-none')) g('zfl-none').onclick = () => { F.sel.clear(); fDraw(); };
    if (g('zfl-delsel')) g('zfl-delsel').onclick = async () => { const n = F.sel.size; if (!(await confirmDel(`Delete ${n} file${n === 1 ? '' : 's'}?`, 'They will be removed for good.'))) return; try { await call('/api/files/delete-many', { method: 'POST', body: { ids: [...F.sel] } }); F.sel.clear(); toast('Deleted', 'success'); fLoad(); } catch (e) { toast(e.message, 'error'); } };
    g('zfl-list').onclick = async (e) => {
      const row = e.target.closest('[data-id]'); if (!row) return; const id = +row.dataset.id, f = F.files.find((x) => x.id === id);
      if (e.target.closest('.zlb-check')) { if (e.target.tagName !== 'INPUT') return; if (e.target.checked) F.sel.add(id); else F.sel.delete(id); return fDraw(); }
      const b = e.target.closest('[data-a]'); const act = b ? b.dataset.a : (e.target.closest('.zlb-thumb, .zlb-file-t') ? 'view' : '');
      if (act === 'dl') window.open(`/api/files/${id}/download`, '_blank');
      else if (act === 'del') { if (!(await confirmDel('Delete this file?', `“${f.filename}” will be removed for good.`))) return; try { await call('/api/files/' + id, { method: 'DELETE' }); toast('File deleted', 'success'); fLoad(); } catch (err) { toast(err.message, 'error'); } }
      else if (act === 'view') fView(f);
    };
  }
  async function fView(f) {
    const P = modal({ id: 'zfl-view', title: f.filename, icon: 'download', sub: `${size(f.file_size)} · added ${ago(f.created_at)}`, wide: true, tall: true });
    P.head.innerHTML = `<a class="zu-btn sm" href="/api/files/${f.id}/download" target="_blank" rel="noopener">${icon('download')} Download</a>`;
    if (kindOf(f) === 'image') { P.body.innerHTML = `<div class="zlb-view-img"><img src="/api/files/${f.id}/download" alt="${esc(f.filename)}"></div>`; return; }
    P.body.innerHTML = '<div class="zu-load">Opening…</div>';
    try {
      const r = await call(`/api/files/${f.id}/read`);
      const text = r.content || '';
      P.body.innerHTML = text.trim() ? `<pre class="zlb-view-text">${esc(text.slice(0, 200000))}</pre>${text.length > 200000 ? '<p class="zu-fine">Showing the first part only. Download the file to see everything.</p>' : ''}` : `<div class="zu-empty"><b>Nothing to show</b><span>This file has no text Zelpophai can display. Download it to open it.</span></div>`;
    } catch (e) { P.body.innerHTML = `<div class="zu-empty"><b>Can't show this file here</b><span>${esc(e.message)} Download it to open it.</span></div>`; }
  }

  /* ═══════════════════════════ Reminders ═══════════════════════════ */
  const R = { m: null, list: [] };
  const REP = [[0, 'Once'], [1, 'Every day'], [7, 'Every week'], [30, 'Every month']];
  const pad = (n) => String(n).padStart(2, '0');
  const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dayLabel = (d) => { const t = new Date(); const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()), b = new Date(t.getFullYear(), t.getMonth(), t.getDate()); const n = Math.round((a - b) / 864e5);
    return n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 7 ? d.toLocaleDateString(undefined, { weekday: 'long' }) : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); };
  const until = (d) => { const s = Math.max(0, (d - Date.now()) / 1000); return s < 60 ? 'in under a minute' : s < 3600 ? `in ${Math.round(s / 60)} min` : s < 86400 ? `in ${Math.round(s / 3600)} h` : `in ${Math.round(s / 86400)} day${Math.round(s / 86400) === 1 ? '' : 's'}`; };
  async function rOpen() {
    R.m = modal({ id: 'zrm', title: 'Reminders', icon: 'clock', sub: 'Zelpophai will nudge you at the right time.', tall: true });
    R.m.body.innerHTML = '<div class="zu-load">Loading…</div>';
    await rLoad();
  }
  async function rLoad() {
    try { R.list = (await call('/api/reminders')).reminders.sort((a, b) => new Date(a.next_run_at) - new Date(b.next_run_at)); } catch (e) { R.m.body.innerHTML = `<div class="zu-empty"><b>Couldn't load reminders</b><span>${esc(e.message)}</span></div>`; return; }
    rDraw();
  }
  function quick() {
    const n = new Date(), mk = (d) => toLocalInput(d);
    const h1 = new Date(n.getTime() + 3600e3); const tonight = new Date(n); tonight.setHours(20, 0, 0, 0); if (tonight <= n) tonight.setDate(tonight.getDate() + 1);
    const tmr = new Date(n); tmr.setDate(n.getDate() + 1); tmr.setHours(9, 0, 0, 0); const wk = new Date(n); wk.setDate(n.getDate() + 7); wk.setHours(9, 0, 0, 0);
    return [['In 1 hour', mk(h1)], [tonight.getDate() === n.getDate() ? 'Tonight 8pm' : 'Tomorrow 8pm', mk(tonight)], ['Tomorrow 9am', mk(tmr)], ['Next week', mk(wk)]];
  }
  function rDraw() {
    const M = R.m; if (!M) return;
    const np = 'Notification' in window ? Notification.permission : 'unsupported';
    const groups = {}; R.list.forEach((r) => { const d = new Date(r.next_run_at); (groups[dayLabel(d)] = groups[dayLabel(d)] || []).push(r); });
    const def = new Date(Date.now() + 3600e3); def.setMinutes(0, 0, 0);
    M.body.innerHTML = `<div class="zlb-add"><input class="zu-in" id="zrm-text" maxlength="500" placeholder="Remind me to…" autocomplete="off">
        <div class="zlb-chips" id="zrm-quick">${quick().map(([l, v]) => `<button data-v="${v}">${l}</button>`).join('')}</div>
        <div class="zrm-when"><div><label class="zu-l" for="zrm-at">When</label><input class="zu-in" type="datetime-local" id="zrm-at" value="${toLocalInput(def)}" min="${toLocalInput(new Date())}"></div>
          <div><label class="zu-l" for="zrm-rep">Repeat</label><select class="zu-in" id="zrm-rep">${REP.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
          <button class="zu-btn pri" id="zrm-add">${icon('plus')} Add reminder</button></div></div>
      ${np === 'default' ? `<div class="zlb-note">${IC.bell}<span>Turn on notifications to be reminded even when you're on another tab.</span><button class="zu-btn sm pri" id="zrm-notif">Turn on</button></div>` : np === 'denied' ? `<div class="zlb-note">${IC.bell}<span>Notifications are blocked in this browser, so reminders only pop up while Zelpophai is open.</span></div>` : ''}
      <div id="zrm-list">${R.list.length ? Object.entries(groups).map(([day, rows]) => `<h4 class="zlb-day">${day}</h4>${rows.map((r) => { const d = new Date(r.next_run_at);
          return `<div class="zrm-row" data-id="${r.id}"><span class="zrm-time"><b>${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b><i>${until(d)}</i></span>
            <div class="zrm-t"><b>${esc(r.text)}</b>${r.repeat_days ? `<span>${IC.repeat}${(REP.find((x) => x[0] === r.repeat_days) || [0, 'Every ' + r.repeat_days + ' days'])[1]}</span>` : ''}</div>
            <span class="zlb-file-a"><button data-a="snooze" title="Later" aria-label="Move later">${icon('clock')}</button><button data-a="edit" title="Edit" aria-label="Edit">${icon('pen')}</button><button data-a="del" class="bad" title="Delete" aria-label="Delete">${icon('trash')}</button></span></div>`; }).join('')}`).join('')
        : `<div class="zu-empty">${icon('clock')}<b>No reminders yet</b><span>Add one above, or just tell Zelpophai in a chat: “remind me to call mum at 6pm”.</span></div>`}</div>`;
    const g = (i) => M.body.querySelector('#' + i);
    g('zrm-quick').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; g('zrm-at').value = b.dataset.v; g('zrm-quick').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
    const add = async () => {
      const text = g('zrm-text').value.trim(), at = g('zrm-at').value;
      if (!text) { g('zrm-text').focus(); return toast('Write what to remind you about', 'error'); }
      if (!at || new Date(at) <= new Date()) return toast('Pick a time in the future', 'error');
      g('zrm-add').disabled = true;
      try { await call('/api/reminders', { method: 'POST', body: { text, run_at: new Date(at).toISOString(), repeat_days: +g('zrm-rep').value } }); toast('Reminder set', 'success'); rLoad(); } catch (e) { toast(e.message, 'error'); g('zrm-add').disabled = false; }
    };
    g('zrm-add').onclick = add; g('zrm-text').onkeydown = (e) => { if (e.key === 'Enter') add(); };
    if (g('zrm-notif')) g('zrm-notif').onclick = async () => { try { await Notification.requestPermission(); } catch (e) {} rDraw(); };
    g('zrm-list').onclick = async (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return; const row = b.closest('[data-id]'), r = R.list.find((x) => x.id === +row.dataset.id);
      if (b.dataset.a === 'del') { try { await call(`/api/reminders/${r.id}/delete`, { method: 'POST' }); toast('Reminder deleted', 'success'); rLoad(); } catch (err) { toast(err.message, 'error'); } }
      else if (b.dataset.a === 'snooze') rSnooze(r, b);
      else rEdit(r);
    };
  }
  function rSnooze(r, anchor) {
    document.querySelectorAll('.zrm-pop').forEach((x) => x.remove());
    const pop = document.createElement('div'); pop.className = 'zrm-pop';
    const base = Math.max(Date.now(), new Date(r.next_run_at).getTime());
    const tm = new Date(); tm.setDate(tm.getDate() + 1); tm.setHours(9, 0, 0, 0);
    pop.innerHTML = [['10 minutes later', base + 600e3], ['1 hour later', base + 3600e3], ['Tomorrow 9am', tm.getTime()]].map(([l, t]) => `<button data-t="${t}">${l}</button>`).join('');
    const rc = anchor.getBoundingClientRect(); pop.style.top = (rc.bottom + 6) + 'px'; pop.style.left = Math.max(8, rc.right - 180) + 'px';
    document.body.appendChild(pop);
    const off = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', off, true); } };
    setTimeout(() => document.addEventListener('mousedown', off, true), 0);
    pop.onclick = async (e) => { const b = e.target.closest('[data-t]'); if (!b) return; pop.remove(); document.removeEventListener('mousedown', off, true); try { await call('/api/reminders/' + r.id, { method: 'PATCH', body: { run_at: new Date(+b.dataset.t).toISOString() } }); toast('Moved', 'success'); rLoad(); } catch (err) { toast(err.message, 'error'); } };
  }
  function rEdit(r) {
    const P = modal({ id: 'zrm-edit', title: 'Edit reminder', icon: 'pen' });
    P.body.innerHTML = `<label class="zu-l" for="zre-t">Remind me to</label><input class="zu-in" id="zre-t" maxlength="500" value="${esc(r.text)}">
      <label class="zu-l" for="zre-at">When</label><input class="zu-in" type="datetime-local" id="zre-at" value="${toLocalInput(new Date(r.next_run_at))}">
      <label class="zu-l" for="zre-rep">Repeat</label><select class="zu-in" id="zre-rep">${REP.map(([v, l]) => `<option value="${v}"${v === r.repeat_days ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <div class="zst-err" id="zre-e" role="alert"></div><button class="zu-btn pri wide" id="zre-s">Save</button>`;
    const g = (i) => P.body.querySelector('#' + i);
    g('zre-s').onclick = async () => {
      const text = g('zre-t').value.trim(), at = g('zre-at').value;
      if (!text) { g('zre-e').textContent = 'Write what to remind you about.'; return; }
      if (!at || new Date(at) <= new Date()) { g('zre-e').textContent = 'Pick a time in the future.'; return; }
      try { await call('/api/reminders/' + r.id, { method: 'PATCH', body: { text, run_at: new Date(at).toISOString(), repeat_days: +g('zre-rep').value } }); P.close(); toast('Saved', 'success'); rLoad(); } catch (e) { g('zre-e').textContent = e.message; }
    };
  }

  /* hook the new windows up under the old names */
  const need = () => { if (guest()) { toast('Create a free account to use this', 'error'); return false; } return true; };
  if (typeof Knowledge !== 'undefined') { Knowledge.open = () => { if (need()) kOpen(); }; Knowledge.close = () => { if (K.m) K.m.close(); }; }
  if (typeof Files !== 'undefined') { Files.open = () => { if (need()) fOpen(); }; Files.close = () => { if (F.m) F.m.close(); }; }
  window.Reminders = { open: () => { if (need()) rOpen(); }, refresh: () => { if (R.m && document.getElementById('zrm')) rLoad(); } };
  window.ZPLibrary = { knowledge: kOpen, files: fOpen, reminders: rOpen };
})();
