/* 26.5.3: "Continue with Google" inside the Windows and Android apps.
   Google won't sign in inside apps, and its pop-up opens in the normal browser
   where the result can't reach the app. So: the app gets a one-time code, opens
   a Zelpophai page in your browser, you continue with Google there, and the app
   (which keeps checking) signs you in. Both show the same 4-letter code. */
(function () {
    'use strict';
    var ua = navigator.userAgent || '';
    var desktop = /ZelpophaiDesktop/.test(ua) || !!window.zelpophaiDesktop;
    var android = /ZelpophaiAndroid/.test(ua) || !!window.ZPApp;
    if (!desktop && !android) return;
    window.ZP_GOOGLE_APP = true;
    var G = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
    var css = document.createElement('style');
    css.textContent = '.zpg-app-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-width:260px;height:44px;padding:0 22px;border-radius:999px;border:1px solid #dadce0;background:#fff;color:#1f1f1f;font:600 15px/1 Inter,system-ui,sans-serif;cursor:pointer}' +
        '.zpg-app-btn:hover{background:#f6f8fc}.zpg-app-ov{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:grid;place-items:center;padding:20px}' +
        '.zpg-app-box{width:min(420px,100%);background:#151826;color:#e8eaf2;border:1px solid #2a3047;border-radius:20px;padding:26px;text-align:center;font:15px/1.5 Inter,system-ui,sans-serif}' +
        '.zpg-app-box h3{margin:0 0 8px;font-size:19px}.zpg-app-box p{margin:6px 0;color:#a9afc6}.zpg-app-code{display:inline-block;margin:12px 0;padding:10px 18px;border-radius:12px;border:1px dashed #3b4263;background:#0b0d14;font:700 26px/1 ui-monospace,Consolas,monospace;letter-spacing:.25em;color:#fff}' +
        '.zpg-app-row{display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap}.zpg-app-row button{padding:9px 16px;border-radius:10px;border:1px solid #2f3550;background:#1d2133;color:#e8eaf2;font:600 14px Inter,system-ui,sans-serif;cursor:pointer}' +
        '.zpg-app-row button.pri{background:#4f46e5;border-color:#4f46e5}.zpg-app-spin{display:inline-block;width:14px;height:14px;border:2px solid #4f46e5;border-right-color:transparent;border-radius:50%;animation:zpgs 1s linear infinite;vertical-align:-2px;margin-right:6px}@keyframes zpgs{to{transform:rotate(360deg)}}';
    document.head.appendChild(css);

    function openBrowser(url) {
        if (android) {
            if (window.ZPApp && typeof window.ZPApp.openBrowser === 'function') { window.ZPApp.openBrowser(url); return true; }
            return false;
        }
        window.open(url, '_blank');     // http:// — the Windows app sends it to your browser
        return true;
    }
    var busy = null;
    function start() {
        if (busy) return;
        fetch('/api/auth/google/app/start', { method: 'POST', credentials: 'same-origin' })
            .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.detail || 'Try again'); return d; }); })
            .then(function (d) {
                var ov = document.createElement('div'); ov.className = 'zpg-app-ov';
                ov.innerHTML = '<div class="zpg-app-box" role="dialog" aria-modal="true"><h3>Finish in your browser</h3>' +
                    '<p>We opened a page in your web browser. Check it shows this code, then continue with Google there:</p>' +
                    '<div class="zpg-app-code"></div><p class="zpg-app-st"><span class="zpg-app-spin"></span>Waiting for you to sign in…</p>' +
                    '<div class="zpg-app-row"><button class="pri" data-a="again">Open the page again</button><button data-a="x">Cancel</button></div></div>';
                ov.querySelector('.zpg-app-code').textContent = d.short;
                document.body.appendChild(ov);
                var stop = false, st = ov.querySelector('.zpg-app-st');
                var close = function () { stop = true; busy = null; ov.remove(); };
                busy = close;
                ov.querySelector('[data-a=x]').onclick = close;
                ov.querySelector('[data-a=again]').onclick = function () { openBrowser(d.url); };
                if (!openBrowser(d.url)) {
                    st.innerHTML = 'Please update the Zelpophai app to sign in with Google (Settings → About → Check for updates). You can still log in with your username and password.';
                    ov.querySelector('[data-a=again]').remove();
                    return;
                }
                var t0 = Date.now();
                (function poll() {
                    if (stop) return;
                    fetch('/api/auth/google/app/poll?c=' + encodeURIComponent(d.code), { credentials: 'same-origin' })
                        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
                        .then(function (x) {
                            if (stop) return;
                            if (x.ok && x.j.ok) { st.textContent = 'Signed in! Opening Zelpophai…'; stop = true; try { if (window.Halloween) Halloween.markLogin('login'); } catch (e) {} location.href = '/app'; return; }
                            if (!x.ok) { st.textContent = x.j.detail || 'The sign-in timed out. Try again.'; busy = null; return; }
                            if (Date.now() - t0 > 600000) { st.textContent = 'The sign-in timed out. Press Cancel and try again.'; return; }
                            setTimeout(poll, 2000);
                        })
                        .catch(function () { if (!stop) setTimeout(poll, 4000); });
                })();
            })
            .catch(function (e) { if (typeof showToast === 'function') showToast('Google sign-in: ' + e.message, 'error'); });
    }
    function mount() {
        document.querySelectorAll('.zp-google').forEach(function (box) {
            if (box.querySelector('.zpg-app-btn')) return;
            box.classList.remove('g_id_signin');
            box.innerHTML = '';
            var b = document.createElement('button'); b.type = 'button'; b.className = 'zpg-app-btn';
            b.innerHTML = G + '<span>Continue with Google</span>';
            b.onclick = start;
            box.appendChild(b);
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
    window.ZPGoogleApp = { start: start, mount: mount };
})();
