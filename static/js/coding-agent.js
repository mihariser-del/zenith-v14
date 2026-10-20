// Coding AGT. — a small in-browser code playground.
// JavaScript runs in the browser (console captured); HTML/Markdown render into a
// sandboxed iframe; Python/SQL fall back to the server executor.
const CA = (() => {
    const LANG_META = {
        javascript: { hl: 'javascript', ext: 'js', file: 'index.js', badge: 'JS' },
        python: { hl: 'python', ext: 'py', file: 'main.py', badge: 'PY' },
        html: { hl: 'xml', ext: 'html', file: 'index.html', badge: 'HTML' },
        markdown: { hl: 'markdown', ext: 'md', file: 'README.md', badge: 'MD' },
        json: { hl: 'json', ext: 'json', file: 'data.json', badge: 'JSON' },
        sql: { hl: 'sql', ext: 'sql', file: 'query.sql', badge: 'SQL' },
    };

    const DEFAULT_CODE = [
        '// Welcome to Zelophai AI - Coding AGT.',
        '// Write, run, and preview code instantly.',
        '',
        'function greet(name) {',
        '  return `Hello, ${name}! \uD83D\uDC4B`;',
        '}',
        '',
        'console.log(greet("Zelpophai"));',
        '',
        '// You can test HTML, CSS, and JavaScript here',
    ].join('\n');

    const el = {};
    let autorunTimer = null;

    function lang() { return el.lang ? el.lang.value : 'javascript'; }

    function escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function highlight() {
        if (!el.editor || !el.highlight) return;
        const code = el.editor.value;
        const meta = LANG_META[lang()] || LANG_META.javascript;
        let html;
        try {
            html = window.hljs
                ? hljs.highlight(code, { language: meta.hl, ignoreIllegals: true }).value
                : escapeHtml(code);
        } catch (e) {
            html = escapeHtml(code);
        }
        // Trailing newline keeps the overlay height in sync with the textarea.
        el.highlight.className = 'language-' + meta.hl;
        el.highlight.innerHTML = html + '\n';
        renderGutter();
        syncScroll();
    }

    function renderGutter() {
        if (!el.gutter || !el.editor) return;
        const lines = el.editor.value.split('\n').length;
        let out = '';
        for (let i = 1; i <= lines; i++) out += i + '\n';
        el.gutter.textContent = out;
    }

    function syncScroll() {
        if (!el.editor) return;
        if (el.highlight) {
            el.highlight.parentElement.scrollTop = el.editor.scrollTop;
            el.highlight.parentElement.scrollLeft = el.editor.scrollLeft;
        }
        if (el.gutter) el.gutter.scrollTop = el.editor.scrollTop;
    }

    function setOutput(text, cls) {
        if (!el.output) return;
        el.output.className = 'cag-out-body' + (cls ? ' ' + cls : '');
        el.output.textContent = text;
    }

    function fmtArg(a) {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch (e) { return String(a); }
    }

    function runJs(code) {
        const lines = [];
        const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
        const push = (prefix) => (...args) => lines.push(prefix + args.map(fmtArg).join(' '));
        try {
            console.log = push('> '); console.info = push('> '); console.warn = push('> ');
            console.error = push('! ');
            const result = new Function(code)();
            if (result !== undefined) lines.push('> ' + fmtArg(result));
        } catch (e) {
            lines.push('! ' + (e && e.message ? e.message : String(e)));
        } finally {
            Object.assign(console, orig);
        }
        const text = lines.join('\n');
        const hasErr = lines.some(l => l.startsWith('! '));
        setOutput(text || '> (no output)', hasErr ? 'err' : '');
    }

    function runHtml(code, markdown) {
        if (!el.output) return;
        const html = markdown
            ? `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:20px;max-width:760px;margin:auto;line-height:1.7;color:#1a1a1a;background:#fff}pre{background:#f5f5f5;padding:12px;border-radius:8px;overflow:auto}code{font-family:Consolas,monospace}table{border-collapse:collapse}th,td{border:1px solid #e5e7eb;padding:8px}</style><scr` + `ipt src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></scr` + `ipt></head><body><div id="c"></div><scr` + `ipt>document.getElementById("c").innerHTML=marked.parse(${JSON.stringify(code)});</scr` + `ipt></body></html>`
            : code;
        el.output.className = 'cag-out-body';
        el.output.textContent = '';
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-scripts allow-modals allow-popups');
        frame.srcdoc = html;
        el.output.appendChild(frame);
    }

    async function runServer(code) {
        setOutput('> Executing on the server...', 'muted');
        try {
            const res = await fetch('/api/code/execute', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, language: lang() }),
            });
            const data = await res.json();
            let text = '';
            if (data.stdout) text += data.stdout;
            if (data.stderr) text += (text ? '\n' : '') + '! ' + data.stderr;
            if (data.returncode !== 0 && !data.stderr) text += '\n! Exit code: ' + data.returncode;
            setOutput(text || '> (no output)', data.returncode === 0 ? '' : 'err');
        } catch (e) {
            setOutput('! ' + e.message, 'err');
        }
    }

    async function run() {
        const code = el.editor ? el.editor.value : '';
        if (!code.trim()) { setOutput('> Nothing to run.', 'muted'); return; }
        const l = lang();
        if (l === 'javascript') return runJs(code);
        if (l === 'html') return runHtml(code, false);
        if (l === 'markdown') return runHtml(code, true);
        if (l === 'json') {
            try { setOutput('> ' + JSON.stringify(JSON.parse(code), null, 2)); }
            catch (e) { setOutput('! Invalid JSON: ' + e.message, 'err'); }
            return;
        }
        return runServer(code);
    }

    function setLang(meta) {
        if (el.tabName) el.tabName.textContent = meta.file;
        if (el.tabBadge) el.tabBadge.textContent = meta.badge;
        if (el.langBadge) el.langBadge.textContent = meta.badge;
        highlight();
    }

    function download() {
        const code = el.editor ? el.editor.value : '';
        if (!code) return;
        const meta = LANG_META[lang()] || LANG_META.javascript;
        const blob = new Blob([code], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = meta.file;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    async function copy() {
        try { await navigator.clipboard.writeText(el.editor ? el.editor.value : ''); showToast('Copied!', 'success'); }
        catch (e) { showToast('Copy failed', 'error'); }
    }

    function clear() {
        if (el.editor) el.editor.value = '';
        setOutput('> Output will appear here. Click Run to execute…', 'muted');
        highlight();
    }

    function applyFont(px) {
        [el.editor, el.highlight, el.gutter].forEach(n => {
            if (!n) return;
            n.style.fontSize = px + 'px';
            if (n === el.highlight) n.parentElement.style.fontSize = px + 'px';
        });
    }

    function init() {
        el.editor = $('ca-editor');
        el.highlight = $('ca-highlight');
        el.gutter = $('ca-gutter');
        el.output = $('ca-output');
        el.lang = $('ca-lang');
        el.theme = $('ca-theme');
        el.font = $('ca-fontsize');
        el.run = $('ca-run');
        el.tabName = $('ca-tab-name');
        el.tabBadge = $('ca-tab-badge');
        el.langBadge = $('ca-lang-badge');
        el.code = $('ca-code');
        el.autorun = $('ca-autorun');
        if (!el.editor) return;

        if (!el.editor.value) el.editor.value = DEFAULT_CODE;
        highlight();

        el.editor.addEventListener('input', () => {
            highlight();
            if (el.autorun && el.autorun.classList.contains('on')) {
                clearTimeout(autorunTimer);
                autorunTimer = setTimeout(run, 600);
            }
        });
        el.editor.addEventListener('scroll', syncScroll);
        el.editor.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const s = el.editor.selectionStart, en = el.editor.selectionEnd;
                el.editor.value = el.editor.value.slice(0, s) + '  ' + el.editor.value.slice(en);
                el.editor.selectionStart = el.editor.selectionEnd = s + 2;
                highlight();
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault(); run();
            }
        });

        if (el.run) el.run.addEventListener('click', run);
        const copyBtn = $('ca-copy'), dlBtn = $('ca-download'), clearBtn = $('ca-clear');
        if (copyBtn) copyBtn.addEventListener('click', copy);
        if (dlBtn) dlBtn.addEventListener('click', download);
        if (clearBtn) clearBtn.addEventListener('click', clear);
        const newTab = $('ca-new-tab');
        if (newTab) newTab.addEventListener('click', () => { el.editor.value = ''; setOutput('> New file ready.', 'muted'); highlight(); el.editor.focus(); });

        if (el.lang) el.lang.addEventListener('change', () => setLang(LANG_META[lang()] || LANG_META.javascript));
        if (el.theme) el.theme.addEventListener('change', () => {
            if (el.code) el.code.classList.toggle('light', el.theme.value === 'light');
        });
        if (el.font) el.font.addEventListener('change', () => applyFont(el.font.value));
        if (el.autorun) el.autorun.addEventListener('click', () => {
            el.autorun.classList.toggle('on');
            const on = el.autorun.classList.contains('on');
            const label = el.autorun.parentElement;
            if (label) label.childNodes[0].textContent = 'Auto-run: ' + (on ? 'on' : 'off') + ' ';
            if (on) run();
        });
    }

    document.addEventListener('DOMContentLoaded', init);

    return { run, download, copy, clear, highlight };
})();
