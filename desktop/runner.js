// Runs a Coding AGT. project on the user's own computer (desktop app only).
// Files go into a fresh temporary folder; one program runs at a time, with a
// time limit, and its output streams back to the page.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const IS_WIN = process.platform === 'win32';
const TIME_LIMIT_MS = 120000;
const MAX_OUTPUT = 400000;
let current = null;

function has(cmd, args) {
    try {
        const r = spawnSync(cmd, args || ['--version'], { timeout: 5000, windowsHide: true, shell: false });
        return r.status === 0 || (r.stdout && r.stdout.length) || (r.stderr && r.stderr.length && r.error == null);
    } catch (e) { return false; }
}

let cache = null;
function languages() {
    if (cache) return cache;
    const py = has('py', ['-3', '--version']) ? ['py', '-3'] : has('python', ['--version']) ? ['python'] : has('python3', ['--version']) ? ['python3'] : null;
    cache = {
        python: py, node: has('node', ['--version']) ? ['node'] : null,
        java: has('javac', ['-version']) && has('java', ['-version']), gcc: has('gcc', ['--version']), gpp: has('g++', ['--version']),
        go: has('go', ['version']), ruby: has('ruby', ['--version']), php: has('php', ['--version']),
    };
    return cache;
}

function safeWrite(dir, files) {
    for (const [p, content] of Object.entries(files)) {
        const target = path.resolve(dir, p);
        if (!target.startsWith(path.resolve(dir) + path.sep)) throw new Error('Bad file name: ' + p);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, String(content));
    }
}

function plan(lang, entry, files, langs) {
    const ext = (entry.split('.').pop() || '').toLowerCase();
    const exe = IS_WIN ? 'program.exe' : './program';
    const of = e => Object.keys(files).filter(f => f.toLowerCase().endsWith(e));
    switch (ext) {
        case 'py': if (!langs.python) return { missing: 'Python (python.org)' }; return { steps: [[...langs.python, '-u', entry]] };
        case 'js': case 'mjs': if (!langs.node) return { missing: 'Node.js (nodejs.org)' }; return { steps: [[...langs.node, entry]] };
        case 'java': {
            if (!langs.java) return { missing: 'Java JDK (adoptium.net)' };
            const cls = path.basename(entry, '.java');
            return { steps: [['javac', ...of('.java')], ['java', '-cp', '.', cls]] };
        }
        case 'c': if (!langs.gcc) return { missing: 'a C compiler (gcc, e.g. from MSYS2)' }; return { steps: [['gcc', ...of('.c'), '-o', 'program'], [exe]] };
        case 'cpp': case 'cc': if (!langs.gpp) return { missing: 'a C++ compiler (g++, e.g. from MSYS2)' }; return { steps: [['g++', ...of('.cpp'), '-o', 'program'], [exe]] };
        case 'go': if (!langs.go) return { missing: 'Go (go.dev)' }; return { steps: [['go', 'run', entry]] };
        case 'rb': if (!langs.ruby) return { missing: 'Ruby (ruby-lang.org)' }; return { steps: [['ruby', entry]] };
        case 'php': if (!langs.php) return { missing: 'PHP (php.net)' }; return { steps: [['php', entry]] };
        default: return { unsupported: true };
    }
}

function stop() {
    if (current) { try { current.kill(); } catch (e) {} current = null; return true; }
    return false;
}

async function run(req, emit) {
    stop();
    const langs = languages();
    const files = req.files || {};
    const p = plan(req.lang, req.entry, files, langs);
    if (p.unsupported) return { ok: false, error: `Running .${req.entry.split('.').pop()} files on your computer isn't supported yet.` };
    if (p.missing) return { ok: false, error: `To run this, install ${p.missing} on this computer, then try again.` };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zelpophai-run-'));
    safeWrite(dir, files);
    let total = 0;
    const send = (type, text) => {
        if (total > MAX_OUTPUT) return;
        total += text.length;
        emit({ type, text: total > MAX_OUTPUT ? text + '\n… output cut off' : text });
    };
    for (const step of p.steps) {
        send('info', '$ ' + step.join(' '));
        const code = await new Promise((resolve) => {
            const child = spawn(step[0], step.slice(1), { cwd: dir, windowsHide: true, shell: false, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
            current = child;
            const timer = setTimeout(() => { send('err', `Stopped after ${TIME_LIMIT_MS / 1000}s (time limit).`); try { child.kill(); } catch (e) {} }, TIME_LIMIT_MS);
            child.stdout.on('data', d => send('out', d.toString('utf8')));
            child.stderr.on('data', d => send('err', d.toString('utf8')));
            child.on('error', err => { send('err', String(err.message || err)); });
            child.on('close', (c) => { clearTimeout(timer); if (current === child) current = null; resolve(c); });
        });
        if (code !== 0) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} return { ok: false, code }; }
    }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
    return { ok: true, code: 0 };
}

module.exports = { run, stop, languages };
