const CA = {
    async run() {
        const editor = $('ca-editor');
        const lang = $('ca-lang').value;
        const output = $('ca-output');
        const btn = $('ca-run');
        const preview = $('ca-preview');
        const frame = $('ca-preview-frame');

        const code = (editor && editor.value) ? editor.value : '';
        if (!code.trim()) {
            if (output) output.textContent = 'No code to run.';
            return;
        }

        if (lang === 'html') {
            if (preview && frame) { preview.style.display = 'block'; frame.srcdoc = code; }
            if (output) { output.textContent = 'HTML rendered in preview above'; output.style.color = '#00ff88'; }
            return;
        }
        if (lang === 'markdown') {
            if (preview && frame) {
                preview.style.display = 'block';
                frame.srcdoc = `<!DOCTYPE html><html><head><style>body{font-family:system-ui;padding:20px;max-width:760px;margin:auto;line-height:1.7;color:#1a1a1a;background:#fff}pre{background:#f5f5f5;padding:12px;border-radius:8px;overflow:auto}code{font-family:Consolas,monospace}table{border-collapse:collapse}th,td{border:1px solid #e5e7eb;padding:8px}</style><script src='https://cdn.jsdelivr.net/npm/marked/marked.min.js'><\/script></head><body><div id='c'></div><script>document.getElementById('c').innerHTML=marked.parse(${JSON.stringify(code)})<\/script></body></html>`;
            }
            if (output) { output.textContent = 'Markdown rendered in preview above'; output.style.color = '#00ff88'; }
            return;
        }
        if (preview) preview.style.display = 'none';

        if (btn) { btn.disabled = true; btn.textContent = 'Running...'; }
        if (output) { output.textContent = 'Executing...'; output.style.color = '#888'; }

        try {
            const res = await fetch('/api/code/execute', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, language: lang }),
            });
            const data = await res.json();

            if (data.fallback === 'browser' && (lang === 'javascript' || lang === 'js')) {
                if (output) output.textContent = 'Trying browser execution...\n';
                let logs = [];
                const origLog = console.log;
                try {
                    console.log = (...a) => logs.push(a.join(' '));
                    const result = new Function(code)();
                    let text = logs.join('\n');
                    if (result !== undefined) text += (text ? '\n' : '') + String(result);
                    if (output) { output.textContent = text || '(no output)'; output.style.color = '#00ff88'; }
                } catch (e) {
                    if (output) { output.textContent = 'Browser error: ' + e.message; output.style.color = 'var(--error)'; }
                } finally { console.log = origLog; }
                return;
            }

            let text = '';
            if (data.stdout) text += data.stdout;
            if (data.stderr) text += (text ? '\n--- ERRORS ---\n' : '') + data.stderr;
            if (data.returncode !== 0 && !data.stderr) text += `\nExit code: ${data.returncode}`;
            if (output) { output.textContent = text || '(no output)'; output.style.color = data.returncode === 0 ? '#00ff88' : 'var(--error)'; }
        } catch (e) {
            if (output) { output.textContent = 'Request failed: ' + e.message; output.style.color = 'var(--error)'; }
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run (Ctrl+Enter)'; }
        }
    },

    download() {
        const editor = $('ca-editor');
        const lang = $('ca-lang').value;
        const code = editor ? editor.value : '';
        if (!code) return;
        const ext = { javascript: 'js', python: 'py', html: 'html', markdown: 'md', json: 'json', sql: 'sql' }[lang] || 'txt';
        const blob = new Blob([code], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `code.${ext}`;
        a.click();
        URL.revokeObjectURL(a.href);
    },
};

document.addEventListener('DOMContentLoaded', () => {
    const editor = $('ca-editor');
    const output = $('ca-output');
    const themeSel = $('ca-theme');
    const fontSel = $('ca-fontsize');
    const runBtn = $('ca-run');
    const clearBtn = $('ca-clear');
    const copyBtn = $('ca-copy');
    const dlBtn = $('ca-download');

    if (themeSel) themeSel.addEventListener('change', () => {
        if (themeSel.value === 'light') {
            editor.style.background = '#ffffff'; editor.style.color = '#1a1a1a';
            output.style.background = '#f5f5f5'; output.style.color = '#1a1a1a';
        } else {
            editor.style.background = '#1e1e1e'; editor.style.color = '#d4d4d4';
            output.style.background = '#0d0d0d'; output.style.color = '#00ff88';
        }
    });
    if (fontSel) fontSel.addEventListener('change', () => { if (editor) editor.style.fontSize = fontSel.value + 'px'; if (output) output.style.fontSize = fontSel.value + 'px'; });
    if (clearBtn) clearBtn.addEventListener('click', () => { if (editor) editor.value = ''; if (output) { output.textContent = 'Output will appear here. Click Run to execute...'; output.style.color = '#00ff88'; } const pv = $('ca-preview'); if (pv) pv.style.display = 'none'; });
    if (copyBtn) copyBtn.addEventListener('click', async () => { try { await navigator.clipboard.writeText(editor ? editor.value : ''); if (typeof showToast === 'function') showToast('Copied!', 'success'); } catch(e){} });
    if (dlBtn) dlBtn.addEventListener('click', () => CA.download());
    if (runBtn) runBtn.addEventListener('click', () => CA.run());

    if (editor) {
        editor.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); CA.run(); }
        });
    }

    const map = { python: 'python', javascript: 'javascript', html: 'xml', json: 'json', markdown: 'markdown', sql: 'sql' };
    const updateHl = () => {
        const lang = $('ca-lang')?.value || 'javascript';
        const hlLang = map[lang] || 'plaintext';
        if (!editor) return;
        // simple: don't create overlay (keep minimal). hljs not critical.
    };
    $('ca-lang')?.addEventListener('change', updateHl);
});
