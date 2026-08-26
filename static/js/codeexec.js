const CodeExec = {
    open() {
        $('code-modal').style.display = 'flex';
        $('code-editor').focus();
    },

    close() {
        $('code-modal').style.display = 'none';
        $('code-preview').style.display = 'none';
    },

    async run() {
        const code = $('code-editor').value.trim();
        const lang = $('code-lang').value;
        const output = $('code-output');
        const btn = $('run-code-btn');
        const preview = $('code-preview');
        const frame = $('code-preview-frame');

        if (!code) {
            output.textContent = 'No code to run.';
            return;
        }

        if (lang === 'html') {
            preview.style.display = 'block';
            frame.srcdoc = code;
            output.textContent = 'HTML rendered in preview above';
            output.style.color = '#00ff88';
            return;
        }
        if (lang === 'markdown') {
            preview.style.display = 'block';
            frame.srcdoc = `<!DOCTYPE html><html><head><style>body{font-family:system-ui;padding:20px;max-width:700px;margin:auto;line-height:1.6;}</style><script src='https://cdn.jsdelivr.net/npm/marked/marked.min.js'><\/script></head><body><div id='c'></div><script>document.getElementById('c').innerHTML=marked.parse(${JSON.stringify(code)})<\/script></body></html>`;
            output.textContent = 'Markdown rendered in preview above';
            output.style.color = '#00ff88';
            return;
        }
        preview.style.display = 'none';

        btn.disabled = true;
        btn.textContent = 'Running...';
        output.textContent = 'Executing...';
        output.style.color = '#888';

        try {
            const res = await fetch('/api/code/execute', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, language: lang }),
            });
            const data = await res.json();

            if (data.fallback === 'browser' && lang === 'javascript') {
                output.textContent = 'Trying browser execution...\n';
                try {
                    let logs = [];
                    const origLog = console.log;
                    console.log = (...a) => logs.push(a.join(' '));
                    const result = new Function(code)();
                    console.log = origLog;
                    let text = logs.join('\n');
                    if (result !== undefined) text += (text ? '\n' : '') + String(result);
                    output.textContent = text || '(no output)';
                    output.style.color = '#00ff88';
                } catch (e) {
                    output.textContent = 'Browser error: ' + e.message;
                    output.style.color = 'var(--error)';
                }
                return;
            }

            let text = '';
            if (data.stdout) text += data.stdout;
            if (data.stderr) text += (text ? '\n--- ERRORS ---\n' : '') + data.stderr;
            if (data.returncode !== 0 && !data.stderr) text += `\nExit code: ${data.returncode}`;

            output.textContent = text || '(no output)';
            output.style.color = data.returncode === 0 ? '#00ff88' : 'var(--error)';
        } catch (e) {
            output.textContent = 'Request failed: ' + e.message;
            output.style.color = 'var(--error)';
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run (Ctrl+Enter)';
        }
    },
};
document.addEventListener('DOMContentLoaded', () => {
    const themeSel = document.getElementById('code-theme');
    const fontSel = document.getElementById('code-fontsize');
    const editor = document.getElementById('code-editor');
    const output = document.getElementById('code-output');
    if (themeSel) themeSel.addEventListener('change', () => {
        if (themeSel.value === 'light') { editor.style.background = '#ffffff'; editor.style.color = '#1a1a1a'; output.style.background = '#f5f5f5'; output.style.color = '#1a1a1a'; }
        else { editor.style.background = '#1e1e1e'; editor.style.color = '#d4d4d4'; output.style.background = '#0d0d0d'; output.style.color = '#00ff88'; }
    });
    if (fontSel) fontSel.addEventListener('change', () => { editor.style.fontSize = fontSel.value + 'px'; output.style.fontSize = fontSel.value + 'px'; });
    const clearBtn = document.getElementById('code-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', () => { editor.value = ''; output.textContent = 'Click Run to execute...'; output.style.color = '#00ff88'; document.getElementById('code-preview').style.display = 'none'; });
    const copyBtn = document.getElementById('code-copy-btn');
    if (copyBtn) copyBtn.addEventListener('click', () => { navigator.clipboard.writeText(editor.value); showToast('Copied!', 'success'); });
    const previewClose = document.getElementById('code-preview-close');
    if (previewClose) previewClose.addEventListener('click', () => { document.getElementById('code-preview').style.display = 'none'; });
});
