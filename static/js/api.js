const $ = id => document.getElementById(id);

let toastTimer;
function showToast(msg, type = '') {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'toast show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

async function api(path, opts = {}) {
    const res = await fetch(path, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
        ...opts,
    });
    if (res.status === 401) throw new Error('Not authenticated');
    let data;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { throw new Error(text.slice(0, 300) || 'Request failed'); }
    if (!res.ok) throw new Error(data.detail || 'Request failed');
    return data;
}
