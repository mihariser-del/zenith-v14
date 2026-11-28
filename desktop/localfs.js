// Coding AGT. working in a folder on this PC (desktop app 1.6.0).
//
// The page can only touch folders the person picked in a Windows folder dialog
// (each gets an id). Every path is resolved inside that folder — "..", absolute
// paths and links that lead outside are refused. Deleting moves files to the
// Recycle Bin. Commands run in the folder with a time limit, and main.js asks
// before the first command in each folder (and before anything that looks
// destructive, every time).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const IS_WIN = process.platform === 'win32';
const roots = new Map();              // id -> { real, name }
const IGNORE = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv', 'env', '.next', '.idea', '.vs', '.mypy_cache', '.pytest_cache', '.gradle', 'target', '.dart_tool', '.cache']);
const MAX_READ = 2 * 1024 * 1024;
const MAX_OUTPUT = 300000;
let current = null;                   // the running command

function addRoot(dir) {
    const real = fs.realpathSync(dir);
    if (!fs.statSync(real).isDirectory()) throw new Error('That is not a folder');
    // A drive or the Windows / Program Files folders are too much to hand over.
    const parsed = path.parse(real);
    if (real === parsed.root) throw new Error('Pick a project folder, not a whole drive');
    if (IS_WIN && /^[a-z]:\\(windows|program files( \(x86\))?|programdata)(\\|$)/i.test(real)) throw new Error('System folders can\'t be used');
    for (const [id, r] of roots) if (r.real === real) return { id, path: real, name: path.basename(real) };
    const id = 'f' + Math.random().toString(36).slice(2, 10);
    roots.set(id, { real, name: path.basename(real) });
    return { id, path: real, name: path.basename(real) };
}
function root(id) {
    const r = roots.get(id);
    if (!r) throw new Error('That folder isn\'t connected any more — choose it again');
    return r;
}
function inside(real, p) { return p === real || p.startsWith(real + path.sep); }
// Resolve a relative path inside the folder, refusing anything that escapes it.
function resolve(id, rel, forWrite) {
    const r = root(id);
    rel = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (/^[a-z]:/i.test(rel) || rel.split('/').includes('..')) throw new Error('Paths must stay inside the folder');
    const abs = path.resolve(r.real, rel);
    if (!inside(r.real, abs)) throw new Error('Paths must stay inside the folder');
    // follow links: the real place must still be inside
    let probe = abs;
    while (!fs.existsSync(probe) && probe !== r.real) probe = path.dirname(probe);
    const realProbe = fs.realpathSync(probe);
    if (!inside(r.real, realProbe)) throw new Error('That path leads outside the folder');
    if (forWrite && fs.existsSync(abs) && fs.statSync(abs).isDirectory()) throw new Error('That is a folder, not a file');
    return abs;
}
function relOf(id, abs) { return path.relative(root(id).real, abs).split(path.sep).join('/'); }

function list(id, sub, opts) {
    opts = opts || {};
    const max = Math.min(opts.max || 1500, 5000), depth = Math.min(opts.depth || 8, 12);
    const start = resolve(id, sub || '');
    const out = [];
    let truncated = false;
    (function walk(dir, d) {
        if (out.length >= max) { truncated = true; return; }
        let names = [];
        try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
        names.sort((a, b) => a.name.localeCompare(b.name));
        for (const n of names) {
            if (out.length >= max) { truncated = true; return; }
            const p = path.join(dir, n.name);
            if (n.isSymbolicLink()) continue;
            if (n.isDirectory()) {
                if (IGNORE.has(n.name)) { out.push({ path: relOf(id, p) + '/', dir: true, skipped: true }); continue; }
                if (d < depth) walk(p, d + 1); else out.push({ path: relOf(id, p) + '/', dir: true, deeper: true });
            } else if (n.isFile()) {
                let size = 0, mtime = 0;
                try { const st = fs.statSync(p); size = st.size; mtime = st.mtimeMs; } catch (e) {}
                out.push({ path: relOf(id, p), size, mtime });
            }
        }
    })(start, 0);
    return { files: out, truncated };
}

function isBinary(buf) {
    const n = Math.min(buf.length, 8000);
    for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
    return false;
}
function read(id, rel) {
    const abs = resolve(id, rel);
    const st = fs.statSync(abs);
    if (st.isDirectory()) throw new Error(rel + ' is a folder');
    if (st.size > MAX_READ) return { tooBig: true, size: st.size };
    const buf = fs.readFileSync(abs);
    if (isBinary(buf)) return { binary: true, size: st.size };
    return { text: buf.toString('utf8'), size: st.size, mtime: st.mtimeMs };
}
function write(id, rel, content) {
    const abs = resolve(id, rel, true);
    const existed = fs.existsSync(abs);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = abs + '.zp-tmp-' + process.pid;
    fs.writeFileSync(tmp, String(content), 'utf8');
    fs.renameSync(tmp, abs);
    return { ok: true, created: !existed };
}
async function remove(id, rel, trash) {
    const abs = resolve(id, rel);
    if (abs === root(id).real) throw new Error('Can\'t delete the whole folder');
    if (!fs.existsSync(abs)) throw new Error(rel + ' doesn\'t exist');
    await trash(abs);              // Recycle Bin, so it can be restored
    return { ok: true };
}

// Commands that need a clear "yes" every time, however trusted the folder is.
const DANGER = /\b(format\s+[a-z]:|diskpart|bcdedit|reg\s+(delete|add)|shutdown|cipher\s+\/w|vssadmin|takeown|icacls|net\s+user|schtasks|Remove-Item\b[^|]*-Recurse|rd\s+\/s|rmdir\s+\/s|del\s+\/[sq]|erase\s+\/s|rm\s+-r|Set-ExecutionPolicy|Invoke-WebRequest[^|]*\|\s*iex|iwr[^|]*\|\s*iex|curl[^|]*\|\s*(sh|bash))/i;
function dangerous(cmd) { return DANGER.test(String(cmd || '')); }

function exec(id, command, opts, onOutput) {
    opts = opts || {};
    if (current) throw new Error('Another command is still running — stop it first');
    const cwd = resolve(id, opts.cwd || '');
    const limit = Math.max(5, Math.min(+opts.timeout || 300, 1800)) * 1000;
    return new Promise((done) => {
        let out = 0, cut = false, finished = false;
        const t0 = Date.now();
        const child = spawn(String(command), {
            cwd, shell: true, windowsHide: true, detached: !IS_WIN,
            env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8', FORCE_COLOR: '0', NO_COLOR: '1', PYTHON_COLORS: '0', NPM_CONFIG_COLOR: 'false' },
        });
        current = child;
        try { child.stdin.end(); } catch (e) {}
        const send = (type) => (data) => {
            if (cut) return;
            const text = data.toString();
            out += text.length;
            if (out > MAX_OUTPUT) { cut = true; onOutput({ type: 'info', text: '\n… (output cut — too long)\n' }); return; }
            onOutput({ type, text });
        };
        child.stdout.on('data', send('out'));
        child.stderr.on('data', send('err'));
        const timer = setTimeout(() => {
            if (finished) return;
            onOutput({ type: 'info', text: `\nStopped after ${Math.round(limit / 1000)} seconds.\n` });
            kill(child);
            setTimeout(() => end(null, 'Stopped: took longer than the time limit'), 1500);   // don't wait for stuck pipes
        }, limit);
        const end = (code, err) => {
            if (finished) return; finished = true;
            clearTimeout(timer); if (current === child) current = null;
            done({ ok: code === 0 && !err, code, error: err ? String(err.message || err) : undefined, seconds: Math.round((Date.now() - t0) / 100) / 10 });
        };
        child._end = end;
        child.on('error', (e) => end(-1, e));
        child.on('close', (code) => end(code));
    });
}
function kill(child) {
    if (!child) return;
    try {
        if (IS_WIN) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
        else { try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { child.kill('SIGKILL'); } }
    } catch (e) {}
}
function stop() {
    if (!current) return false;
    const c = current; kill(c);
    setTimeout(() => { if (c._end) c._end(null, 'Stopped'); }, 1500);
    current = null; return true;
}

// What to type to run one file, by its type.
function commandFor(rel) {
    const q = '"' + rel.replace(/\//g, IS_WIN ? '\\' : '/') + '"';
    const ext = (rel.split('.').pop() || '').toLowerCase();
    const py = IS_WIN ? 'python' : 'python3';
    return {
        bat: IS_WIN ? `call ${q}` : null, cmd: IS_WIN ? `call ${q}` : null,
        ps1: `powershell -NoProfile -ExecutionPolicy Bypass -File ${q}`,
        py: `${py} -u ${q}`, pyw: `${py} -u ${q}`, js: `node ${q}`, mjs: `node ${q}`, cjs: `node ${q}`, ts: `npx --yes tsx ${q}`,
        sh: IS_WIN ? `bash ${q}` : `sh ${q}`, rb: `ruby ${q}`, php: `php ${q}`, go: `go run ${q}`, java: `java ${q}`,
        exe: IS_WIN ? q : null,
    }[ext] || null;
}

module.exports = { addRoot, root, resolve, list, read, write, remove, exec, stop, dangerous, commandFor, roots };
