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
    // Auto-close brackets/quotes and auto-indent
    if (editor) {
        const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
        editor.addEventListener('keydown', (e) => {
            const start = editor.selectionStart, end = editor.selectionEnd, val = editor.value;
            if (pairs[e.key] && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                const close = pairs[e.key];
                const selected = val.slice(start, end);
                editor.value = val.slice(0, start) + e.key + selected + close + val.slice(end);
                editor.selectionStart = editor.selectionEnd = start + 1;
                if (selected) editor.selectionEnd = start + 1 + selected.length;
            } else if (e.key === 'Backspace' && val[start - 1] && pairs[val[start - 1]] === val[start]) {
                // delete pair together
                if (val[start - 1] + val[start] === val.slice(start - 1, start + 1)) {
                    // let default happen, will leave one; we handle by removing extra
                }
            } else if (e.key === 'Enter') {
                const lineStart = val.lastIndexOf('\n', start - 1) + 1;
                const indent = (val.slice(lineStart, start).match(/^\s*/) || [''])[0];
                const before = val[start - 1] || '';
                const after = val[start] || '';
                if ((before === '{' && after === '}') || (before === '[' && after === ']') || (before === '(' && after === ')')) {
                    e.preventDefault();
                    editor.value = val.slice(0, start) + '\n' + indent + '    \n' + indent + val.slice(start);
                    editor.selectionStart = editor.selectionEnd = start + indent.length + 5;
                } else {
                    // keep indent
                    setTimeout(() => {
                        if (editor.selectionStart === start + 1 + indent.length) return;
                    }, 0);
                }
            }
        });
        editor.addEventListener('input', () => {
            // simple color code helper: highlight hex colors with underline
            // auto-correct common typos like 'funtion' -> 'function'
            const corrections = { 'funtion': 'function', 'retrun': 'return', 'consol': 'console', 'docment': 'document' };
            for (const [wrong, right] of Object.entries(corrections)) {
                if (editor.value.includes(wrong)) {
                    const pos = editor.selectionStart;
                    editor.value = editor.value.replace(new RegExp('\\b' + wrong + '\\b', 'g'), right);
                    editor.selectionStart = editor.selectionEnd = pos;
                    showToast(`Auto-corrected ${wrong} → ${right}`, '');
                    break;
                }
            }
        });
    }
    // Live syntax highlight preview (colored code) + editor overlay
    const highlightWrap = document.createElement('div');
    highlightWrap.id = 'code-highlight-wrap';
    highlightWrap.style.cssText = 'margin-top:8px; border:1px solid var(--border); border-radius:8px; background:#1e1e1e; padding:0; overflow:hidden;';
    highlightWrap.innerHTML = '<div style="padding:6px 12px; background:var(--input-bg); font-size:11px; color:#888; border-bottom:1px solid var(--border); display:flex; justify-content:space-between;"><span>Live Preview (colored)</span><span style="font-size:10px; color:#666;">Auto-correct on</span></div><pre style="margin:0; padding:12px; overflow:auto; max-height:200px; background:#1e1e1e;"><code id="code-highlight" style="font-family:Fira Code, Consolas, monospace; font-size:13px; white-space:pre-wrap; word-break:break-word;"></code></pre>';
    editor.parentElement.insertBefore(highlightWrap, editor.nextSibling);
    const highlightEl = document.getElementById('code-highlight');
    const updateHighlight = () => {
        const lang = document.getElementById('code-lang')?.value || 'plaintext';
        const map = { python: 'python', javascript: 'javascript', html: 'xml', json: 'json', markdown: 'markdown', sql: 'sql', shell: 'bash' };
        const hlLang = map[lang] || 'plaintext';
        highlightEl.textContent = editor.value || '// start typing — your code will appear colored here';
        highlightEl.className = `language-${hlLang}`;
        if (window.hljs) hljs.highlightElement(highlightEl);
    };
    editor.addEventListener('input', updateHighlight);
    document.getElementById('code-lang')?.addEventListener('change', updateHighlight);
    updateHighlight();
    // Enhanced auto-correct with more words and visual feedback
    const corrections = { 'funtion': 'function', 'retrun': 'return', 'consol': 'console', 'docment': 'document', 'lenght': 'length', 'widht': 'width', 'heigth': 'height', 'backgroud': 'background', 'calss': 'class', 'improt': 'import', 'exprot': 'export', 'awiat': 'await', 'asyc': 'async', 'yeild': 'yield', 'addeventlistener': 'addEventListener' };
    let lastCorrected = '';
    editor.addEventListener('input', () => {
        for (const [wrong, right] of Object.entries(corrections)) {
            const re = new RegExp('\\b' + wrong + '\\b', 'i');
            if (re.test(editor.value) && lastCorrected !== wrong) {
                const pos = editor.selectionStart;
                editor.value = editor.value.replace(re, right);
                editor.selectionStart = editor.selectionEnd = pos + (right.length - wrong.length);
                updateHighlight();
                showToast(`Auto-corrected ${wrong} → ${right}`, 'success');
                lastCorrected = wrong;
                setTimeout(() => lastCorrected = '', 2000);
                break;
            }
        }
    });
    // Drag to resize preview/output
    const preview = document.getElementById('code-preview');
    const frame = document.getElementById('code-preview-frame');
    const previewDrag = document.getElementById('preview-drag');
    if (previewDrag && preview && frame) {
        let dragging = false, startY, startH;
        previewDrag.addEventListener('mousedown', (e) => { dragging = true; startY = e.clientY; startH = frame.offsetHeight; document.body.style.cursor = 'ns-resize'; });
        window.addEventListener('mousemove', (e) => { if (!dragging) return; const dh = e.clientY - startY; frame.style.height = Math.max(120, startH + dh) + 'px'; });
        window.addEventListener('mouseup', () => { dragging = false; document.body.style.cursor = ''; });
    }
});
