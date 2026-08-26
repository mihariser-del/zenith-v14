const CodeExec = {
    open() {
        $('code-modal').style.display = 'flex';
        $('code-editor').focus();
    },

    close() {
        $('code-modal').style.display = 'none';
    },

    async run() {
        const code = $('code-editor').value.trim();
        const lang = $('code-lang').value;
        const output = $('code-output');
        const btn = $('run-code-btn');

        if (!code) {
            output.textContent = 'No code to run.';
            return;
        }

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
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run';
        }
    },
};
