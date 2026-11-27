/* Runs Python that Zelpophai wrote, on the person's own device.

   Why here and not on the server: code the AI writes is untrusted (a cleverly
   worded message or web page could steer it), and server-side execution once let
   people read the database. So it runs in the browser — and not even in this
   page, but in a background worker inside an <iframe sandbox="allow-scripts">.
   Without allow-same-origin that frame gets a throw-away origin, so the code can't
   read the sign-in cookie, can't call the Zelpophai API as the person, and can't
   reach into the page. A run that takes too long is stopped by throwing the whole
   frame away.

   Python is Pyodide from jsDelivr (the same build Coding AGT. uses). numpy,
   pandas, matplotlib and friends load automatically from what the code imports.

   window.ZRunner.run(code, files) → Promise<{ ok, stdout, error, images: [dataURL] }>
*/
(function () {
    'use strict';
    var PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
    var FIRST_RUN_MS = 90000;   // the first run downloads Python (~10 MB) — give it time
    var RUN_MS = 30000;
    var MAX_OUT = 20000;

    // The worker: load Python once, then run whatever arrives. Figures from
    // matplotlib are captured as PNGs after each run.
    var WORKER = [
        "importScripts('" + PYODIDE + "');",
        "let py = null;",
        "const PRE = `import sys, io\\ntry:\\n    import matplotlib\\n    matplotlib.use('Agg')\\nexcept Exception:\\n    pass\\n`;",
        "const POST = `\\n_z_imgs = []\\ntry:\\n    import matplotlib.pyplot as _z_plt, base64 as _z_b64\\n    for _z_n in _z_plt.get_fignums():\\n        _z_buf = io.BytesIO()\\n        _z_plt.figure(_z_n).savefig(_z_buf, format='png', dpi=110, bbox_inches='tight')\\n        _z_imgs.append('data:image/png;base64,' + _z_b64.b64encode(_z_buf.getvalue()).decode())\\n    _z_plt.close('all')\\nexcept Exception:\\n    pass\\n_z_imgs`;",
        "onmessage = async (e) => {",
        "  const { id, code, files } = e.data;",
        "  let out = '';",
        "  try {",
        "    if (!py) { py = await loadPyodide(); }",
        "    py.setStdout({ batched: (s) => { out += s + '\\n'; } });",
        "    py.setStderr({ batched: (s) => { out += s + '\\n'; } });",
        "    for (const f of (files || [])) { try { py.FS.writeFile('/home/pyodide/' + f.name, new Uint8Array(f.bytes)); } catch (x) {} }",
        "    await py.loadPackagesFromImports(code);",
        "    if (/matplotlib|pyplot/.test(code)) await py.loadPackage('matplotlib');",
        "    await py.runPythonAsync(PRE);",
        "    let err = '';",
        "    try { await py.runPythonAsync(code); } catch (x) { err = String(x && x.message || x); }",
        "    let imgs = [];",
        "    try { const r = await py.runPythonAsync(POST); imgs = r.toJs ? r.toJs() : []; } catch (x) {}",
        "    postMessage({ id, ok: !err, stdout: out, error: err, images: Array.from(imgs || []) });",
        "  } catch (x) {",
        "    postMessage({ id, ok: false, stdout: out, error: 'Python could not start: ' + String(x && x.message || x), images: [] });",
        "  }",
        "};"
    ].join('\n');

    // The frame's own tiny script: start the worker, pass messages both ways.
    var FRAME = '<!doctype html><meta charset="utf-8"><script>' +
        'var w=new Worker(URL.createObjectURL(new Blob([' + JSON.stringify(WORKER) + '],{type:"text/javascript"})));' +
        'w.onmessage=function(e){parent.postMessage({zr:1,msg:e.data},"*")};' +
        'w.onerror=function(e){parent.postMessage({zr:1,msg:{id:-1,ok:false,error:"The runner stopped: "+(e.message||"unknown"),stdout:"",images:[]}},"*")};' +
        'addEventListener("message",function(e){if(e.source===parent)w.postMessage(e.data)});' +
        'parent.postMessage({zr:1,ready:1},"*");' +
        '<\/script>';

    var frame = null, ready = null, warm = false, nextId = 1, waiting = {};

    function boot() {
        if (frame && document.body.contains(frame)) return ready;
        frame = document.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-scripts');        // NOT allow-same-origin — that's the point
        frame.setAttribute('aria-hidden', 'true');
        frame.tabIndex = -1;
        frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;top:-10px;border:0;opacity:0;pointer-events:none';
        ready = new Promise(function (res) { frame._ready = res; });
        frame.srcdoc = FRAME;
        document.body.appendChild(frame);
        return ready;
    }

    window.addEventListener('message', function (e) {
        if (!frame || e.source !== frame.contentWindow || !e.data || !e.data.zr) return;   // only our own frame
        if (e.data.ready) { if (frame._ready) frame._ready(); return; }
        var m = e.data.msg || {};
        if (m.id === -1) { Object.keys(waiting).forEach(function (k) { waiting[k](m); }); waiting = {}; return; }
        var done = waiting[m.id];
        if (done) { delete waiting[m.id]; done(m); }
    });

    function reset() {
        if (frame) frame.remove();
        frame = null; ready = null; warm = false;
    }

    function run(code, files) {
        return boot().then(function () {
            return new Promise(function (resolve) {
                var id = nextId++;
                var limit = warm ? RUN_MS : FIRST_RUN_MS;
                var wasWarm = warm;
                var timer = setTimeout(function () {
                    delete waiting[id];
                    reset();                                  // stop it for good: throw the frame away
                    resolve({ ok: false, stdout: '', images: [],
                        error: wasWarm ? 'It took longer than ' + (RUN_MS / 1000) + ' seconds, so I stopped it.'
                                       : 'Python took too long to start. Check your connection and try again.' });
                }, limit);
                waiting[id] = function (m) {
                    clearTimeout(timer);
                    warm = true;
                    var out = String(m.stdout || '');
                    if (out.length > MAX_OUT) out = out.slice(0, MAX_OUT) + '\n… (cut short)';
                    resolve({ ok: !!m.ok, stdout: out, error: String(m.error || '').slice(0, 3000),
                              images: (m.images || []).filter(function (s) { return /^data:image\/png;base64,/.test(s); }).slice(0, 6) });
                };
                // Transfer file bytes in rather than letting the code fetch them.
                var payload = (files || []).map(function (f) { return { name: f.name, bytes: f.bytes }; });
                frame.contentWindow.postMessage({ id: id, code: code, files: payload }, '*');
            });
        });
    }

    window.ZRunner = { run: run, reset: reset, isWarm: function () { return warm; } };
})();
