/* Zelpophai AI — message renderer.
   Markdown → safe HTML, then upgrades: code blocks (language, copy, wrap,
   download, fold long code), tables (scroll, copy, CSV), callouts
   (> [!TIP]), task lists, math (KaTeX, loaded only when needed), source
   chips for web links, generated-file cards with Preview, and smooth,
   throttled streaming that doesn't re-highlight everything on each token. */
(function () {
    'use strict';

    var FILE_RE = /<zfile\b([^>]*)>([\s\S]*?)(<\/zfile>|$)/gi;
    var EXT = { javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', python: 'py', py: 'py', html: 'html', css: 'css', json: 'json',
        bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh', sql: 'sql', java: 'java', c: 'c', cpp: 'cpp', 'c++': 'cpp', csharp: 'cs', cs: 'cs',
        go: 'go', rust: 'rs', rs: 'rs', php: 'php', ruby: 'rb', rb: 'rb', yaml: 'yml', yml: 'yml', xml: 'xml', kotlin: 'kt', swift: 'swift',
        dart: 'dart', lua: 'lua', r: 'r', jsx: 'jsx', tsx: 'tsx', markdown: 'md', md: 'md', toml: 'toml', ini: 'ini', dockerfile: 'Dockerfile' };
    var LANG_NAME = { js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript', py: 'Python', python: 'Python',
        html: 'HTML', css: 'CSS', json: 'JSON', bash: 'Bash', sh: 'Shell', shell: 'Shell', sql: 'SQL', java: 'Java', c: 'C', cpp: 'C++',
        cs: 'C#', csharp: 'C#', go: 'Go', rust: 'Rust', php: 'PHP', ruby: 'Ruby', yaml: 'YAML', yml: 'YAML', xml: 'XML', kotlin: 'Kotlin',
        swift: 'Swift', dart: 'Dart', jsx: 'JSX', tsx: 'TSX', md: 'Markdown', markdown: 'Markdown', plaintext: 'Text', text: 'Text' };
    var FMT_LABEL = { docx: 'Word document', pdf: 'PDF', pptx: 'PowerPoint', xlsx: 'Excel sheet', csv: 'CSV', html: 'Web page', md: 'Markdown', txt: 'Text file' };
    var FMT_COLOR = { docx: '#2563eb', pdf: '#dc2626', pptx: '#ea580c', xlsx: '#16a34a', csv: '#16a34a', html: '#7c3aed', md: '#475569', txt: '#475569' };

    var I = {
        expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
        copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
        wrap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M3 12h15a3 3 0 1 1 0 6h-4"/><polyline points="16 16 14 18 16 20"/><path d="M3 18h7"/></svg>',
        dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
        eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
        text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
        link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
        globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>',
        table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></svg>',
        x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'
    };

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function unesc(s) { var t = document.createElement('textarea'); t.innerHTML = s; return t.value; }
    function attrs(s) { var o = {}, m, re = /(\w+)\s*=\s*"([^"]*)"/g; while ((m = re.exec(s || ''))) o[m[1].toLowerCase()] = unesc(m[2]); return o; }
    function kb(n) { if (!n && n !== 0) return ''; n = Number(n); return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
    function extOf(name) { var m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : 'md'; }
    function toast(msg, kind) { if (typeof showToast === 'function') showToast(msg, kind || 'success'); }
    function copyText(text, btn) {
        var done = function () {
            if (!btn) { toast('Copied'); return; }
            var old = btn.innerHTML; btn.innerHTML = I.check + '<span>Copied</span>'; btn.classList.add('ok');
            setTimeout(function () { btn.innerHTML = old; btn.classList.remove('ok'); }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast('Copy failed', 'error'); });
        else { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} ta.remove(); }
    }
    function saveBlob(text, name, type) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
        a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }

    /* ── math ─────────────────────────────────────────────────────────── */
    var katexState = 0; // 0 not loaded, 1 loading, 2 ready
    var katexWaiters = [];
    function loadKatex(cb) {
        if (window.katex) { katexState = 2; cb(); return; }
        katexWaiters.push(cb);
        if (katexState === 1) return;
        katexState = 1;
        var css = document.createElement('link');
        css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css';
        document.head.appendChild(css);
        var s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js';
        s.onload = function () { katexState = 2; var w = katexWaiters; katexWaiters = []; w.forEach(function (f) { try { f(); } catch (e) {} }); };
        s.onerror = function () { katexState = 0; katexWaiters = []; };
        document.head.appendChild(s);
    }
    function mathSpan(tex, display) {
        return '<span class="zr-math' + (display ? ' zr-math-d' : '') + '" data-tex="' + esc(tex) + '">' + esc(display ? tex : tex) + '</span>';
    }
    // Replace math outside of code with placeholder spans.
    function protectMath(md) {
        if (!/\$|\\\(|\\\[/.test(md)) return md;
        var parts = md.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g);
        for (var i = 0; i < parts.length; i += 2) {
            var p = parts[i];
            if (!p) continue;
            p = p.replace(/\$\$([\s\S]+?)\$\$/g, function (_, t) { return '\n\n' + mathSpan(t.trim(), true) + '\n\n'; });
            p = p.replace(/\\\[([\s\S]+?)\\\]/g, function (_, t) { return '\n\n' + mathSpan(t.trim(), true) + '\n\n'; });
            p = p.replace(/\\\((.+?)\\\)/g, function (_, t) { return mathSpan(t.trim(), false); });
            // $x^2$ — but not prices like "$5 and $10"
            p = p.replace(/(^|[^\\$\w])\$(?!\s)([^$\n]{1,200}?)\$(?![\w$])/g, function (m, pre, t) {
                if (/\s$/.test(t)) return m;
                if (/^\d/.test(t) && !/[\\^_{}=]/.test(t)) return m;
                if (!/[\\^_{}=+\-*/a-zA-Z]/.test(t)) return m;
                return pre + mathSpan(t, false);
            });
            parts[i] = p;
        }
        return parts.join('');
    }
    function renderMath(root) {
        var spans = root.querySelectorAll('.zr-math:not([data-done])');
        if (!spans.length) return;
        loadKatex(function () {
            spans.forEach(function (el) {
                if (!el.isConnected || el.dataset.done) return;
                try {
                    el.innerHTML = window.katex.renderToString(el.getAttribute('data-tex'), { displayMode: el.classList.contains('zr-math-d'), throwOnError: false, strict: 'ignore', trust: false });
                    el.dataset.done = '1';
                } catch (e) {}
            });
        });
    }

    /* ── markdown ─────────────────────────────────────────────────────── */
    function parseFiles(text) {
        var files = [];
        var out = String(text || '').replace(/```[\w-]*\s*\n(\s*<zfile\b[\s\S]*?<\/zfile>)\s*\n```/gi, '$1');
        out = out.replace(FILE_RE, function (_, a, body, close) {
            files.push({ attrs: attrs(a), body: body.replace(/^\n+|\n+$/g, ''), closed: !!close });
            return '\n\n<div class="zf-slot" data-i="' + (files.length - 1) + '"></div>\n\n';
        });
        // A photo from the web that belongs to the section right after it.
        var shots = [];
        out = out.replace(/<zimg\b([^>]*)>/gi, function (_, a) {
            shots.push(attrs(a));
            return '\n\n<div class="zs-slot" data-i="' + (shots.length - 1) + '"></div>\n\n';
        });
        // Code the AI wrote to work something out, and (once run) its result.
        var runs = [];
        out = out.replace(/<zrun\b([^>]*)>([\s\S]*?)(<\/zrun>|$)(\s*<zout\b([^>]*)>([\s\S]*?)<\/zout>)?/gi,
            function (_, a, code, close, _o, oa, obody) {
                runs.push({ attrs: attrs(a), code: code.replace(/^\s*```[a-z]*\s*\n?|\n?```\s*$/gi, '').replace(/^\n+|\s+$/g, ''),
                            closed: !!close, out: obody === undefined ? null : { attrs: attrs(oa || ''), text: obody } });
                return '\n\n<div class="zr-slot" data-i="' + (runs.length - 1) + '"></div>\n\n';
            });
        // Live pages: a working page the AI built. Kept whole so it can be opened.
        var pages = [];
        out = out.replace(/<zpage\b([^>]*)>([\s\S]*?)(<\/zpage>|$)/gi, function (_, a, body, close) {
            pages.push({ attrs: attrs(a), html: body.replace(/^\s*```[a-z]*\s*\n?|\n?```\s*$/gi, ''), closed: !!close });
            return '\n\n<div class="zpg-slot" data-i="' + (pages.length - 1) + '"></div>\n\n';
        });
        // Questions with buttons.
        var asks = [];
        out = out.replace(/<zask\b([^>]*)>([\s\S]*?)(<\/zask>|$)/gi, function (_, a, body, close) {
            var opts = body.split('\n').map(function (l) { return l.replace(/^\s*[-*\d.)]+\s*/, '').trim(); }).filter(Boolean).slice(0, 6);
            asks.push({ attrs: attrs(a), opts: opts, closed: !!close });
            return '\n\n<div class="zq-slot" data-i="' + (asks.length - 1) + '"></div>\n\n';
        });
        // Checklists: how many items are done so far, from the <zdone n="…"/> markers.
        var done = {};
        out = out.replace(/<zdone\b[^>]*?n\s*=\s*"(\d+)"[^>]*?\/?>(?:<\/zdone>)?/gi, function (_, n) { done[Number(n)] = true; return ''; });
        var todos = [];
        out = out.replace(/<ztodo\b([^>]*)>([\s\S]*?)(<\/ztodo>|$)/gi, function (_, a, body, close) {
            var items = [];
            body.split('\n').forEach(function (l) {
                var m = /^\s*[-*]\s*\[([ xX])\]\s*(.+)$/.exec(l) || /^\s*[-*\d.)]+\s+(.+)$/.exec(l);
                if (!m) return;
                if (m.length === 3) items.push({ text: m[2].trim(), done: m[1] !== ' ' });
                else items.push({ text: m[1].trim(), done: false });
            });
            todos.push({ attrs: attrs(a), items: items, closed: !!close });
            return '\n\n<div class="zd-slot" data-i="' + (todos.length - 1) + '"></div>\n\n';
        });
        // Tool requests the AI writes (image / video / reminder) show as a small
        // "working on it" card until the server swaps in the real result.
        out = out.replace(/<(zimage|zvideo|zremind|zjob)\b([^>]*?)(?:\/>|>([\s\S]*?)(?:<\/\1>|$))/gi, function (_, kind) {
            return '\n\n<div class="zt-slot" data-kind="' + kind.toLowerCase() + '"></div>\n\n';
        });
        return { md: out, files: files, shots: shots, pages: pages, asks: asks, todos: todos, done: done, runs: runs };
    }

    // A photo on the left and the section it belongs to on the right, like a search result.
    function buildShots(el, shots) {
        var slots = [].slice.call(el.querySelectorAll('.zs-slot'));
        if (!slots.length) return;
        // first turn every marker into an empty row, so the next pass knows where each section ends
        var rows = slots.map(function (slot) {
            var im = shots[Number(slot.getAttribute('data-i'))];
            if (!im || !im.src) { slot.remove(); return null; }
            var row = document.createElement('div');
            row.className = 'zs-row';
            var pic = document.createElement(im.href ? 'a' : 'span');
            pic.className = 'zs-pic';
            if (im.href) { pic.href = im.href; pic.target = '_blank'; pic.rel = 'noopener noreferrer'; pic.title = (im.alt || '') + (im.credit ? ' — ' + im.credit : ''); }
            var img = document.createElement('img');
            img.src = im.src; img.alt = im.alt || ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
            img.onerror = function () { row.classList.add('no-pic'); };
            pic.appendChild(img);
            if (im.credit) { var c = document.createElement('small'); c.textContent = im.credit; pic.appendChild(c); }
            var body = document.createElement('div');
            body.className = 'zs-body';
            row.appendChild(pic); row.appendChild(body);
            slot.replaceWith(row);
            return row;
        }).filter(Boolean);
        // then move each section (heading + its text) in beside its picture
        rows.forEach(function (row) {
            var body = row.querySelector('.zs-body');
            var start = row.nextElementSibling;
            var lead = start && /^H[1-6]$/.test(start.tagName) ? start.tagName : '';
            var n = start, moved = 0;
            while (n && moved < 14) {
                var next = n.nextElementSibling;
                if (moved && (n.classList.contains('zs-row') || n.tagName === 'HR' || (lead && /^H[1-6]$/.test(n.tagName) && n.tagName <= lead))) break;
                body.appendChild(n); moved++;
                n = next;
            }
            if (!moved) row.classList.add('alone');
        });
    }

    function toHtml(md) {
        // Settings → Chat → Formatting: off shows the plain text exactly as written.
        var plain = false;
        try { plain = typeof Settings !== 'undefined' && Settings.getLocal().markdown === false; } catch (e) {}
        var html = (window.marked && !plain) ? window.marked.parse(md, { gfm: true, breaks: false }) : esc(md).replace(/\n/g, '<br>');
        return window.DOMPurify
            ? window.DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'data-tex', 'data-i'], FORBID_TAGS: ['style', 'form'], FORBID_ATTR: ['style'] })
            : html;
    }

    /* ── upgrades ─────────────────────────────────────────────────────── */
    function upgradeCode(root, streaming) {
        var pres = root.querySelectorAll('pre');
        pres.forEach(function (pre, idx) {
            if (pre.closest('.zr-code') || pre.closest('.zf-card') || pre.closest('.zrn-card')) return;
            var code = pre.querySelector('code') || pre;
            var m = /language-([\w+#-]+)/.exec(code.className || '');
            var lang = m ? m[1].toLowerCase() : '';
            var isLast = idx === pres.length - 1;
            var open = streaming && isLast && root.dataset.openFence === '1';
            if (!open && window.hljs && !code.dataset.highlighted) {
                try { window.hljs.highlightElement(code); } catch (e) {}
            }
            var text = code.textContent || '';
            var lines = text.replace(/\n$/, '').split('\n').length;
            var box = document.createElement('div');
            box.className = 'zr-code';
            var head = document.createElement('div');
            head.className = 'zr-code-head';
            head.innerHTML = '<span class="zr-lang">' + esc(LANG_NAME[lang] || lang || 'Code') + '</span>' +
                '<span class="zr-code-meta">' + lines + (lines === 1 ? ' line' : ' lines') + '</span>' +
                '<span class="zr-code-btns">' +
                '<button type="button" data-a="wrap" title="Wrap long lines" aria-label="Wrap long lines">' + I.wrap + '</button>' +
                '<button type="button" data-a="dl" title="Download" aria-label="Download code">' + I.dl + '</button>' +
                '<button type="button" data-a="copy" class="zr-copy" aria-label="Copy code">' + I.copy + '<span>Copy</span></button></span>';
            pre.parentNode.insertBefore(box, pre);
            box.appendChild(head);
            box.appendChild(pre);
            head.addEventListener('click', function (e) {
                var b = e.target.closest('button'); if (!b) return;
                var a = b.getAttribute('data-a');
                var t = (pre.querySelector('code') || pre).textContent;
                if (a === 'copy') copyText(t, b);
                else if (a === 'wrap') { box.classList.toggle('wrap'); b.classList.toggle('on'); }
                else if (a === 'dl') { var ext = EXT[lang] || 'txt'; saveBlob(t, (ext === 'Dockerfile' ? 'Dockerfile' : 'code.' + ext)); }
            });
            if (!streaming && lines > 28) {
                box.classList.add('folded');
                var more = document.createElement('button');
                more.type = 'button';
                more.className = 'zr-more';
                more.textContent = 'Show all ' + lines + ' lines';
                more.addEventListener('click', function () {
                    var f = box.classList.toggle('folded');
                    more.textContent = f ? 'Show all ' + lines + ' lines' : 'Show less';
                });
                box.appendChild(more);
            }
        });
    }

    function upgradeTables(root, streaming) {
        root.querySelectorAll('table').forEach(function (t) {
            if (t.closest('.zr-table') || t.closest('.zf-card')) return;
            var wrap = document.createElement('div');
            wrap.className = 'zr-table';
            var scroller = document.createElement('div');
            scroller.className = 'zr-table-scroll';
            t.parentNode.insertBefore(wrap, t);
            scroller.appendChild(t);
            wrap.appendChild(scroller);
            if (streaming) return;
            var rows = t.querySelectorAll('tbody tr').length;
            var bar = document.createElement('div');
            bar.className = 'zr-table-bar';
            bar.innerHTML = '<span>' + I.table + rows + (rows === 1 ? ' row' : ' rows') + '</span>' +
                '<button type="button" data-a="copy" aria-label="Copy table">' + I.copy + '<span>Copy</span></button>' +
                '<button type="button" data-a="csv" aria-label="Download as CSV">' + I.dl + '<span>CSV</span></button>';
            wrap.appendChild(bar);
            var grid = function () {
                return Array.prototype.map.call(t.rows, function (r) {
                    return Array.prototype.map.call(r.cells, function (c) { return c.textContent.trim(); });
                });
            };
            bar.addEventListener('click', function (e) {
                var b = e.target.closest('button'); if (!b) return;
                var g = grid();
                if (b.getAttribute('data-a') === 'copy') copyText(g.map(function (r) { return r.join('\t'); }).join('\n'), b);
                else saveBlob('﻿' + g.map(function (r) { return r.map(function (c) { return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\n'), 'table.csv', 'text/csv');
            });
        });
    }

    var CALLOUT = { NOTE: ['note', 'Note'], TIP: ['tip', 'Tip'], IMPORTANT: ['important', 'Important'], WARNING: ['warning', 'Warning'], CAUTION: ['caution', 'Caution'] };
    function upgradeQuotes(root) {
        root.querySelectorAll('blockquote').forEach(function (bq) {
            if (bq.dataset.z) return;
            bq.dataset.z = '1';
            var p = bq.querySelector('p');
            if (!p) return;
            var m = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i.exec(p.innerHTML);
            var m2 = !m && /^\s*<strong>(Note|Tip|Important|Warning|Caution)\s*:?\s*<\/strong>\s*:?\s*/i.exec(p.innerHTML);
            if (!m && !m2) return;
            var key = (m ? m[1] : m2[1]).toUpperCase();
            p.innerHTML = p.innerHTML.slice((m || m2)[0].length).replace(/^<br>\s*/, '');
            bq.classList.add('zr-callout', 'zr-' + CALLOUT[key][0]);
            var title = document.createElement('div');
            title.className = 'zr-callout-t';
            title.textContent = CALLOUT[key][1];
            bq.insertBefore(title, bq.firstChild);
        });
    }

    function upgradeLinks(root) {
        root.querySelectorAll('a[href]').forEach(function (a) {
            if (a.dataset.z) return;
            a.dataset.z = '1';
            var href = a.getAttribute('href') || '';
            if (/^https?:\/\//i.test(href)) {
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                var host = '';
                try { host = new URL(href).hostname.replace(/^www\./, ''); } catch (e) {}
                var label = (a.textContent || '').trim().replace(/^www\./, '');
                // Web-search citations arrive as [domain](url): show them as chips.
                if (host && (label === host || label === host.split('.').slice(-2).join('.') || /^\[?\d+\]?$/.test(label))) {
                    a.classList.add('zr-src');
                    a.title = href;
                    a.innerHTML = I.globe + '<span>' + esc(host) + '</span>';
                }
            }
        });
    }

    function upgradeTasks(root) {
        root.querySelectorAll('li > input[type="checkbox"]').forEach(function (cb) {
            var li = cb.parentElement;
            if (li.dataset.z) return;
            li.dataset.z = '1';
            li.classList.add('zr-task');
            if (cb.checked) li.classList.add('done');
            var mark = document.createElement('span');
            mark.className = 'zr-box';
            mark.setAttribute('aria-hidden', 'true');
            cb.replaceWith(mark);
            var ul = li.parentElement; if (ul) ul.classList.add('zr-tasks');
        });
    }

    function upgradeImages(root) {
        root.querySelectorAll('img').forEach(function (img) {
            if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
            img.setAttribute('decoding', 'async');
            img.addEventListener('error', function () { var a = img.closest('a'); (a && a.parentNode && a.parentNode.classList.contains('zr-gallery') ? a : img).remove(); }, { once: true });
        });
        // Photos from the web come as a row of linked images: show them as a gallery.
        root.querySelectorAll('p').forEach(function (p) {
            var kids = Array.prototype.filter.call(p.childNodes, function (n) { return !(n.nodeType === 3 && !n.textContent.trim()); });
            if (kids.length < 1 || !kids.every(function (n) { return n.nodeName === 'A' && n.children.length === 1 && n.firstElementChild.nodeName === 'IMG'; })) return;
            p.classList.add('zr-gallery');
            kids.forEach(function (a) {
                a.target = '_blank'; a.rel = 'noopener noreferrer';
                var img = a.firstElementChild;
                a.title = (img.getAttribute('alt') || '') + ' — open source page';
                a.classList.remove('zr-src');
            });
        });
    }

    /* ── generated file cards ─────────────────────────────────────────── */
    function fileIcon(fmt) {
        var c = FMT_COLOR[fmt] || '#475569';
        var label = (fmt || 'file').toUpperCase().slice(0, 4);
        return '<span class="zf-ic" style="--fc:' + c + '" aria-hidden="true"><svg viewBox="0 0 40 48"><path d="M6 2h20l10 10v32a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="currentColor" opacity=".14"/><path d="M6 2h20l10 10v32a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M26 2v8a2 2 0 0 0 2 2h8" fill="none" stroke="currentColor" stroke-width="2"/></svg><b>' + esc(label) + '</b></span>';
    }
    function words(s) { var m = String(s || '').match(/[\wÀ-ɏЀ-ӿ؀-ۿ]+/g); return m ? m.length : 0; }
    function statLine(fmt, a, body) {
        var parts = [FMT_LABEL[fmt] || (fmt.toUpperCase() + ' file')];
        if (a.size) parts.push(kb(a.size));
        if (fmt === 'pptx') { var n = (body.match(/^##\s/mg) || []).length + 1; parts.push(n + ' slides'); }
        else if (fmt === 'xlsx' || fmt === 'csv') { var r = (body.match(/^\|/mg) || []).length; var t = (body.match(/^\|?\s*:?-{2,}/mg) || []).length; if (r) parts.push(Math.max(0, r - 2 * Math.max(1, t)) + ' rows'); }
        else if (fmt === 'docx' || fmt === 'pdf') { var w = words(body); parts.push(w.toLocaleString() + ' words'); }
        else { var l = body.split('\n').length; parts.push(l + ' lines'); }
        return parts.join(' · ');
    }

    var PUBLIC = false; // shared pages: no owner-only download/preview links
    function buildFileCard(f, streaming) {
        var a = f.attrs || {};
        var name = a.name || 'document.md';
        var fmt = extOf(name);
        var card = document.createElement('div');
        card.className = 'zf-card';
        card.dataset.name = name;
        if (a.id) card.dataset.id = a.id;
        if (!a.id && streaming) {
            var w = words(f.body);
            card.classList.add('writing');
            card.innerHTML = fileIcon(fmt) +
                '<div class="zf-body"><div class="zf-name"></div><div class="zf-sub"><span class="zf-pulse"></span>Writing… ' + w.toLocaleString() + ' words</div>' +
                '<div class="zf-bar"><i></i></div></div>';
            card.querySelector('.zf-name').textContent = name;
            return card;
        }
        if (!a.id && !PUBLIC) {
            card.classList.add('pending');
            card.innerHTML = fileIcon(fmt) + '<div class="zf-body"><div class="zf-name"></div><div class="zf-sub"><span class="zf-spin"></span>Building your ' + esc(FMT_LABEL[fmt] || fmt.toUpperCase()) + '…</div></div>';
            card.querySelector('.zf-name').textContent = name;
            card._body = f.body;
            return card;
        }
        var url = '/api/files/' + encodeURIComponent(a.id) + '/download';
        var prev = '/api/generate/preview/' + encodeURIComponent(a.id);
        card.innerHTML = fileIcon(fmt) +
            '<div class="zf-body"><div class="zf-name"></div><div class="zf-sub"></div></div>' +
            '<div class="zf-actions">' + (PUBLIC
                ? '<button type="button" class="zf-btn primary" data-a="text" aria-expanded="false">' + I.text + '<span>Show content</span></button>'
                : '<button type="button" class="zf-btn" data-a="preview">' + I.eye + '<span>Preview</span></button>' +
                  '<a class="zf-btn primary" data-a="dl" href="' + url + '" download>' + I.dl + '<span>Download</span></a>' +
                  '<button type="button" class="zf-btn icon" data-a="text" title="Show the content" aria-label="Show the content" aria-expanded="false">' + I.text + '</button>') +
            '</div><div class="zf-content" hidden></div>';
        card.querySelector('.zf-name').textContent = name;
        card.querySelector('.zf-sub').textContent = statLine(fmt, a, f.body || '');
        if (!PUBLIC && (f.truncated || f.closed === false)) {
            var warn = document.createElement('div');
            warn.className = 'zf-warn';
            warn.textContent = 'This file may be cut short. Ask me to "continue the file" to finish it.';
            card.querySelector('.zf-body').appendChild(warn);
        }
        card.addEventListener('click', function (e) {
            var b = e.target.closest('[data-a]'); if (!b) return;
            var act = b.getAttribute('data-a');
            if (act === 'preview') { e.preventDefault(); openPreview(name, prev, url); }
            else if (act === 'text') {
                var box = card.querySelector('.zf-content');
                var show = box.hidden;
                if (show && !box.dataset.filled) {
                    box.dataset.filled = '1';
                    var src = f.body || '';
                    if (/^(py|js|ts|jsx|tsx|json|css|sql|java|c|cpp|cs|go|rs|php|rb|sh|yml|yaml|xml|kt|swift|dart|lua|r|toml|ini)$/.test(fmt)) src = '```' + fmt + '\n' + src + '\n```';
                    else if (fmt === 'html' && /<html|<!doctype/i.test(src)) src = '```html\n' + src + '\n```';
                    ZRender.render(box, src, { inner: true });
                    var cp = document.createElement('button');
                    cp.type = 'button'; cp.className = 'zf-copy'; cp.innerHTML = I.copy + '<span>Copy text</span>';
                    cp.addEventListener('click', function () { copyText(f.body || '', cp); });
                    box.insertBefore(cp, box.firstChild);
                }
                box.hidden = !show;
                b.setAttribute('aria-expanded', show ? 'true' : 'false');
                b.classList.toggle('on', show);
            }
        });
        return card;
    }

    function openPreview(name, src, dl) {
        var old = document.getElementById('zf-preview');
        if (old) old.remove();
        var ov = document.createElement('div');
        ov.id = 'zf-preview';
        ov.className = 'zf-preview';
        ov.innerHTML = '<div class="zf-pv-card" role="dialog" aria-modal="true" aria-label="File preview">' +
            '<div class="zf-pv-head">' + fileIcon(extOf(name)) + '<div class="zf-pv-name"></div>' +
            '<a class="zf-btn primary" href="' + dl + '" download>' + I.dl + '<span>Download</span></a>' +
            '<button type="button" class="zf-btn icon zf-pv-x" aria-label="Close preview">' + I.x + '</button></div>' +
            '<div class="zf-pv-frame"><div class="zf-pv-load"><span class="zf-spin"></span> Loading preview…</div>' +
            '<iframe title="Preview" sandbox="allow-scripts allow-popups" referrerpolicy="no-referrer"></iframe></div>' +
            '<p class="zf-pv-note">Preview is a close approximation — download to see the exact file.</p></div>';
        ov.querySelector('.zf-pv-name').textContent = name;
        document.body.appendChild(ov);
        var frame = ov.querySelector('iframe');
        frame.addEventListener('load', function () { var l = ov.querySelector('.zf-pv-load'); if (l) l.remove(); });
        frame.src = src;
        var close = function () { ov.remove(); document.removeEventListener('keydown', onKey); };
        var onKey = function (e) { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        ov.querySelector('.zf-pv-x').addEventListener('click', close);
        ov.querySelector('.zf-pv-x').focus();
    }


    // Chat is declared with `const` at the top of chat.js, so it is NOT a property
    // of window; it has to be looked up by name.
    function chatApi() { try { return typeof Chat !== 'undefined' ? Chat : null; } catch (e) { return null; } }

    /* ── live pages ───────────────────────────────────────────────────── */
    // A page is untrusted HTML the AI wrote. It only ever runs inside an iframe
    // sandbox WITHOUT allow-same-origin, so it gets a throw-away origin: it can't
    // read the sign-in cookie, call our API as you, or reach into this page.
    var PAGE_SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads';
    function pageDoc(html) {
        var h = String(html || '');
        if (!/<html[\s>]/i.test(h)) h = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + h + '</body></html>';
        return h;
    }
    function pageFrame(html, title) {
        var f = document.createElement('iframe');
        f.className = 'zpg-frame';
        f.setAttribute('sandbox', PAGE_SANDBOX);
        f.setAttribute('referrerpolicy', 'no-referrer');
        f.setAttribute('loading', 'lazy');
        f.title = title || 'Live page';
        f.srcdoc = pageDoc(html);
        return f;
    }
    function downloadPage(p) {
        var name = String((p.attrs.title || 'page')).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'page';
        var url = URL.createObjectURL(new Blob([pageDoc(p.html)], { type: 'text/html' }));
        var a = document.createElement('a'); a.href = url; a.download = name + '.html';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }
    function sharePage(p, btn) {
        if (PUBLIC) return;
        var C = chatApi(), chatId = (C && C.activeId) || null;
        if (btn) { btn.disabled = true; btn.querySelector('span').textContent = 'Sharing…'; }
        fetch('/api/pages', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: p.attrs.title || 'Page', html: pageDoc(p.html), chat_id: chatId }) })
            .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.detail || 'Couldn\'t share it'); return d; }); })
            .then(function (d) {
                var link = location.origin + d.url;
                copyText(link);
                toast('Link copied — anyone with it can use this page');
                if (btn) { btn.querySelector('span').textContent = 'Link copied'; setTimeout(function () { btn.disabled = false; btn.querySelector('span').textContent = 'Share link'; }, 2200); }
            })
            .catch(function (e) { toast(e.message, 'error'); if (btn) { btn.disabled = false; btn.querySelector('span').textContent = 'Share link'; } });
    }
    function openPagePanel(p) {
        var old = document.getElementById('zpg-panel'); if (old) old.remove();
        var w = document.createElement('div');
        w.id = 'zpg-panel'; w.className = 'zpg-panel';
        w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', p.attrs.title || 'Live page');
        w.innerHTML = '<div class="zpg-ph"><b></b><div class="zpg-ph-r">'
            + (PUBLIC ? '' : '<button type="button" class="zpg-b" data-a="share">' + I.link + '<span>Share link</span></button>')
            + '<button type="button" class="zpg-b" data-a="dl">' + I.dl + '<span>Download</span></button>'
            + '<button type="button" class="zpg-b" data-a="reload" title="Start it again">↻<span>Restart</span></button>'
            + '<button type="button" class="zpg-x" data-a="close" aria-label="Close">✕</button></div></div><div class="zpg-pb"></div>';
        w.querySelector('b').textContent = p.attrs.title || 'Live page';
        var body = w.querySelector('.zpg-pb');
        body.appendChild(pageFrame(p.html, p.attrs.title));
        w.addEventListener('click', function (e) {
            var b = e.target.closest('[data-a]'); if (!b) return;
            var a = b.getAttribute('data-a');
            if (a === 'close') close();
            else if (a === 'dl') downloadPage(p);
            else if (a === 'share') sharePage(p, b);
            else if (a === 'reload') { body.innerHTML = ''; body.appendChild(pageFrame(p.html, p.attrs.title)); }
        });
        function close() { w.classList.remove('on'); document.removeEventListener('keydown', key); setTimeout(function () { w.remove(); }, 220); }
        function key(e) { if (e.key === 'Escape') close(); }
        document.addEventListener('keydown', key);
        document.body.appendChild(w);
        requestAnimationFrame(function () { w.classList.add('on'); });
    }
    function buildPageCard(p, writing) {
        var card = document.createElement('div');
        card.className = 'zpg-card' + (writing ? ' writing' : '');
        var lines = (p.html.match(/\n/g) || []).length + 1;
        var title = p.attrs.title || 'Live page';
        card.innerHTML = '<div class="zpg-top"><span class="zpg-ic" aria-hidden="true">▦</span><div class="zpg-tt"><b></b><span class="zpg-sub"></span></div>'
            + (writing ? '<span class="zf-spin" aria-hidden="true"></span>' : '<div class="zpg-acts">'
                + '<button type="button" class="zpg-b pri" data-a="open">' + I.expand + '<span>Open</span></button>'
                + (PUBLIC ? '' : '<button type="button" class="zpg-b" data-a="share">' + I.link + '<span>Share link</span></button>')
                + '<button type="button" class="zpg-b" data-a="dl" title="Download as a web page">' + I.dl + '</button></div>')
            + '</div>';
        card.querySelector('b').textContent = title;
        card.querySelector('.zpg-sub').textContent = writing ? 'Building it… ' + lines + ' lines so far' : 'Live page · tap to try it';
        if (!writing) {
            var view = document.createElement('div');
            view.className = 'zpg-view';
            view.appendChild(pageFrame(p.html, title));
            card.appendChild(view);
            card.addEventListener('click', function (e) {
                var b = e.target.closest('[data-a]'); if (!b) return;
                var a = b.getAttribute('data-a');
                if (a === 'open') openPagePanel(p);
                else if (a === 'dl') downloadPage(p);
                else if (a === 'share') sharePage(p, b);
            });
        }
        return card;
    }

    /* ── questions with buttons ───────────────────────────────────────── */
    function buildAsk(q, idx, streaming) {
        var card = document.createElement('div');
        card.className = 'zq-card' + (q.attrs.multi === 'true' ? ' multi' : '');
        card.setAttribute('data-q', idx);
        var h = document.createElement('p'); h.className = 'zq-q'; h.textContent = q.attrs.q || 'Which would you like?';
        card.appendChild(h);
        var row = document.createElement('div'); row.className = 'zq-opts';
        row.setAttribute('role', q.attrs.multi === 'true' ? 'group' : 'radiogroup');
        row.setAttribute('aria-label', q.attrs.q || 'Options');
        q.opts.forEach(function (o) {
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'zq-opt'; b.textContent = o;
            b.setAttribute('aria-pressed', 'false');
            if (streaming && !q.closed) b.disabled = true;
            row.appendChild(b);
        });
        card.appendChild(row);
        return card;
    }
    // Wire every question in one answer together: a single question with a
    // single choice sends straight away; otherwise pick, then press Send.
    function wireAsks(el) {
        var cards = [].slice.call(el.querySelectorAll('.zq-card'));
        if (!cards.length || PUBLIC) return;
        var instant = cards.length === 1 && !cards[0].classList.contains('multi');
        var foot = null;
        if (!instant) {
            foot = document.createElement('div'); foot.className = 'zq-foot';
            foot.innerHTML = '<button type="button" class="zq-send" disabled>Send answers</button><span>or type your own below</span>';
            cards[cards.length - 1].after(foot);
        } else {
            var hint = document.createElement('span'); hint.className = 'zq-hint'; hint.textContent = 'or type your own answer below';
            cards[0].appendChild(hint);
        }
        function answer() {
            return cards.map(function (c) {
                var picked = [].slice.call(c.querySelectorAll('.zq-opt.on')).map(function (b) { return b.textContent; });
                if (!picked.length) return null;
                var q = c.querySelector('.zq-q').textContent;
                return cards.length === 1 ? picked.join(', ') : q + ' ' + picked.join(', ');
            });
        }
        function refresh() {
            if (!foot) return;
            foot.querySelector('.zq-send').disabled = answer().some(function (a) { return a === null; });
        }
        function send() {
            var a = answer(); if (a.some(function (x) { return x === null; })) return;
            var text = a.join('\n');
            cards.forEach(function (c) { c.classList.add('answered'); c.querySelectorAll('.zq-opt').forEach(function (b) { b.disabled = true; }); });
            if (foot) foot.remove();
            var inp = document.getElementById('user-input');
            var C = chatApi();
            if (inp && C && typeof C.send === 'function') {
                inp.value = text; inp.dispatchEvent(new Event('input', { bubbles: true }));
                C.send();
            }
        }
        cards.forEach(function (c) {
            var multi = c.classList.contains('multi');
            c.addEventListener('click', function (e) {
                var b = e.target.closest('.zq-opt'); if (!b || b.disabled || c.classList.contains('answered')) return;
                if (multi) { b.classList.toggle('on'); }
                else { c.querySelectorAll('.zq-opt').forEach(function (x) { x.classList.toggle('on', x === b); }); }
                c.querySelectorAll('.zq-opt').forEach(function (x) { x.setAttribute('aria-pressed', x.classList.contains('on') ? 'true' : 'false'); });
                if (instant) send(); else refresh();
            });
        });
        if (foot) foot.querySelector('.zq-send').addEventListener('click', send);
    }

    /* ── checklists ───────────────────────────────────────────────────── */
    function buildTodo(t, idx, done, streaming) {
        var items = t.items.map(function (it, i) { return { text: it.text, done: it.done || !!done[i + 1] }; });
        var n = items.filter(function (x) { return x.done; }).length;
        var card = document.createElement('div');
        card.className = 'zd-card' + (n === items.length && items.length ? ' all' : '');
        card.setAttribute('data-t', idx);
        var head = document.createElement('div'); head.className = 'zd-head';
        head.innerHTML = '<div class="zd-ht"><b></b><span class="zd-count"></span></div><div class="zd-bar" aria-hidden="true"><i></i></div>';
        head.querySelector('b').textContent = t.attrs.title || 'The plan';
        card.appendChild(head);
        var list = document.createElement('ol'); list.className = 'zd-list';
        var nowSet = false;
        items.forEach(function (it, i) {
            var li = document.createElement('li');
            var now = streaming && !it.done && !nowSet && t.closed;
            if (now) nowSet = true;
            li.className = it.done ? 'done' : (now ? 'now' : '');
            li.innerHTML = '<button type="button" class="zd-box" aria-pressed="' + it.done + '"><span aria-hidden="true">✓</span></button><span class="zd-tx"></span>';
            li.querySelector('.zd-tx').textContent = it.text;
            li.querySelector('.zd-box').setAttribute('aria-label', (it.done ? 'Untick: ' : 'Tick off: ') + it.text);
            li.querySelector('.zd-box').setAttribute('data-i', i);
            list.appendChild(li);
        });
        card.appendChild(list);
        function sync() {
            var lis = list.querySelectorAll('li'), k = 0;
            lis.forEach(function (li) { if (li.classList.contains('done')) k++; });
            card.querySelector('.zd-count').textContent = k + ' of ' + lis.length + ' done';
            card.querySelector('.zd-bar i').style.width = (lis.length ? Math.round(k / lis.length * 100) : 0) + '%';
            card.classList.toggle('all', k === lis.length && lis.length > 0);
        }
        sync();
        if (!PUBLIC) list.addEventListener('click', function (e) {
            var b = e.target.closest('.zd-box'); if (!b) return;
            var li = b.closest('li'), on = !li.classList.contains('done');
            li.classList.toggle('done', on); li.classList.remove('now');
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            sync();
            var wrap = card.closest('.msg-wrapper'), mid = wrap && wrap.dataset.mid, C = chatApi(), cid = C && C.activeId;
            if (!mid || !cid) return;           // not saved yet — the tick still shows
            fetch('/api/chats/' + cid + '/messages/' + mid + '/todo', { method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ i: Number(b.getAttribute('data-i')), done: on }) })
                .catch(function () {});
        });
        return card;
    }


    /* ── code that works an answer out ────────────────────────────────── */
    function buildRun(r, idx, streaming) {
        var card = document.createElement('div');
        var state = r.out ? (r.out.attrs.ok === 'false' ? 'fail' : 'done') : (streaming && !r.closed ? 'writing' : 'waiting');
        card.className = 'zrn-card ' + state;
        card.setAttribute('data-r', idx);
        var title = r.attrs.title || 'Working it out with code';
        var sub = { writing: 'Writing the code…', waiting: 'Running it on your device…', done: 'Worked out with real code, not a guess', fail: 'The code hit a problem' }[state];
        card.innerHTML = '<div class="zrn-top"><span class="zrn-ic" aria-hidden="true">{ }</span><div class="zrn-tt"><b></b><span class="zrn-sub"></span></div>'
            + (state === 'writing' || state === 'waiting' ? '<span class="zf-spin" aria-hidden="true"></span>' : '')
            + '<button type="button" class="zrn-tog" aria-expanded="false">Show the code</button></div>'
            + '<pre class="zrn-code" hidden><code></code></pre><div class="zrn-out"></div>';
        card.querySelector('b').textContent = title;
        card.querySelector('.zrn-sub').textContent = sub;
        card.querySelector('code').textContent = r.code;
        // The server stores the output HTML-escaped so nothing printed can become a tag; undo that for display.
        if (r.out) fillRunOutput(card, unesc(r.out.text), (r.out.attrs.imgs || '').split('|').filter(Boolean), r.out.attrs.ok === 'false');
        card.querySelector('.zrn-tog').addEventListener('click', function () {
            var pre = card.querySelector('.zrn-code'), open = pre.hidden;
            pre.hidden = !open;
            this.setAttribute('aria-expanded', String(open));
            this.textContent = open ? 'Hide the code' : 'Show the code';
            if (open && window.hljs) { try { window.hljs.highlightElement(pre.querySelector('code')); } catch (e) {} }
        });
        return card;
    }
    function fillRunOutput(card, text, imgs, failed) {
        var box = card.querySelector('.zrn-out');
        box.innerHTML = '';
        var t = String(text || '').replace(/^\n+|\s+$/g, '');
        if (t) {
            var pre = document.createElement('pre');
            pre.className = 'zrn-result' + (failed ? ' bad' : '');
            pre.textContent = t.length > 4000 ? t.slice(0, 4000) + '\n…' : t;
            box.appendChild(pre);
        }
        (imgs || []).forEach(function (src) {
            if (!/^(\/api\/image\/serve\/|data:image\/png;base64,)/.test(src)) return;   // only our own charts
            var im = document.createElement('img');
            im.className = 'zrn-img'; im.alt = 'Chart'; im.loading = 'lazy'; im.src = src;
            box.appendChild(im);
        });
    }

    /* ── main entry ───────────────────────────────────────────────────── */
    var ZRender = {
        icons: I,
        esc: esc,
        copyText: copyText,
        openPreview: openPreview,

        /* Render `text` into `el`. opts.streaming = still arriving. */
        render: function (el, text, opts) {
            opts = opts || {};
            if (!opts.inner) PUBLIC = !!opts.publicView;
            var streaming = !!opts.streaming;
            var parsed = parseFiles(text);
            var md = parsed.md;
            // Close an unfinished code fence so the half-written block renders as code, not prose.
            var fences = (md.match(/^\s*```/mg) || []).length;
            el.dataset.openFence = fences % 2 ? '1' : '0';
            if (streaming && fences % 2) md += '\n```';
            md = protectMath(md);
            el.innerHTML = toHtml(md);
            el.querySelectorAll('.zt-slot').forEach(function (slot) {
                var k = slot.getAttribute('data-kind');
                var label = { zimage: 'Creating your image', zvideo: 'Starting your video', zremind: 'Setting your reminder', zjob: 'Setting up your scheduled job' }[k] || 'Working on it';
                var icon = { zimage: '🎨', zvideo: '🎬', zremind: '⏰', zjob: '🗓️' }[k] || '✨';
                var card = document.createElement('div');
                card.className = 'zt-card';
                card.innerHTML = '<span class="zt-ic" aria-hidden="true">' + icon + '</span><span class="zt-t">' + label + '\u2026</span><span class="zf-spin" aria-hidden="true"></span>';
                slot.replaceWith(card);
            });
            el.querySelectorAll('.zf-slot').forEach(function (slot) {
                var f = parsed.files[Number(slot.getAttribute('data-i'))];
                if (f) slot.replaceWith(buildFileCard(f, streaming && !f.closed));
                else slot.remove();
            });
            el.querySelectorAll('.zr-slot').forEach(function (slot) {
                var i = Number(slot.getAttribute('data-i')), r = parsed.runs[i];
                if (r && r.code) slot.replaceWith(buildRun(r, i, streaming));
                else slot.remove();
            });
            el.querySelectorAll('.zpg-slot').forEach(function (slot) {
                var pg = parsed.pages[Number(slot.getAttribute('data-i'))];
                if (pg) slot.replaceWith(buildPageCard(pg, streaming && !pg.closed));
                else slot.remove();
            });
            el.querySelectorAll('.zq-slot').forEach(function (slot) {
                var i = Number(slot.getAttribute('data-i')), q = parsed.asks[i];
                if (q && q.opts.length) slot.replaceWith(buildAsk(q, i, streaming));
                else slot.remove();
            });
            if (!streaming) wireAsks(el);
            el.querySelectorAll('.zd-slot').forEach(function (slot) {
                var i = Number(slot.getAttribute('data-i')), t = parsed.todos[i];
                if (t && t.items.length) slot.replaceWith(buildTodo(t, i, parsed.done || {}, streaming));
                else slot.remove();
            });
            buildShots(el, parsed.shots || []);
            upgradeCode(el, streaming);
            upgradeTables(el, streaming);
            upgradeQuotes(el);
            upgradeTasks(el);
            upgradeLinks(el);
            upgradeImages(el);
            renderMath(el);
            if (!opts.inner) el.classList.add('zr');
            return parsed.files;
        },

        fileCard: buildFileCard,
        fillRunOutput: fillRunOutput,
        hasFiles: function (text) { return /<zfile\b/i.test(text || ''); },

        /* Plain text for copy / speak: drop file bodies, tags and markdown noise. */
        plain: function (text) {
            return String(text || '').replace(/<zimg\b[^>]*>/gi, '')
                .replace(/<zpage\b([^>]*)>[\s\S]*?(?:<\/zpage>|$)/gi, function (_, a) { return '[Live page: ' + (attrs(a).title || 'page') + ']'; })
                .replace(/<zask\b([^>]*)>([\s\S]*?)(?:<\/zask>|$)/gi, function (_, a, b) { return (attrs(a).q || '') + '\n' + b.trim(); })
                .replace(/<ztodo\b([^>]*)>([\s\S]*?)(?:<\/ztodo>|$)/gi, function (_, a, b) { return (attrs(a).title || '') + '\n' + b.trim(); })
                .replace(/<zdone\b[^>]*\/?>(?:<\/zdone>)?/gi, '')
                .replace(/<zrun\b[^>]*>[\s\S]*?(?:<\/zrun>|$)/gi, '')
                .replace(/<zout\b[^>]*>([\s\S]*?)<\/zout>/gi, function (_, b) { return b.trim(); })
                .replace(FILE_RE, function (_, a) { var n = attrs(a).name || 'file'; return '[File: ' + n + ']'; })
                .replace(/<(zimage|zvideo|zremind|zjob)\b[\s\S]*?(?:<\/\1>|\/>|$)/gi, '')
                .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 ($2)');
        }
    };
    window.ZRender = ZRender;
})();
