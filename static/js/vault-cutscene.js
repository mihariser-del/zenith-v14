// Vault entrance cinematic loader (26.7 "Cosmic Ascension").
//
// VaultCutscene.play({ name, role, hold, onBlack }) → Promise<{ skipped }>
//   Call ONLY after the server has accepted the PIN (pin-verify returned a token). The film is
//   decoration: it grants nothing, and nothing waits on it for permission — the Vault itself still
//   checks the token on every request and the session still expires as before.
//   hold: true keeps the last frame on screen (the caller navigates to /vault?arrive=1).
//   onBlack: called once the old interface has faded to black (hide the lock screen then).
// VaultCutscene.preload() warms the 3D engine and pictures so the film starts instantly.
//
// Why the old cutscene could misfire: its key handler listened for Enter/Space to skip but let
// the same key fall through to the PIN form, so pressing Enter after the 4th digit re-submitted the
// PIN and started a second cutscene (and a second redirect) — and there was no guard against two
// running at once. Here a single shared promise is returned while one is playing, keys are
// swallowed while it runs, and the callers lock their PIN forms after a success.
(function () {
    'use strict';
    var MOD = '/static/js/cosmic/cosmic-ascension.js?v=26.7.0';
    var modP = null, playing = null;
    function load() {
        if (!modP) modP = import(MOD).catch(function (e) { modP = null; throw e; });
        return modP;
    }
    // If the 3D module can't load at all: a calm black hand-over with the welcome, then done.
    function basic(o) {
        return new Promise(function (res) {
            var d = document.createElement('div');
            d.setAttribute('role', 'status');
            d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#04060d;color:#e8ecf8;display:grid;place-items:center;text-align:center;opacity:0;transition:opacity .6s;font-family:Inter,system-ui,sans-serif';
            var name = String(o.name || '').toUpperCase().replace(/[<>&"']/g, '');
            d.innerHTML = '<div><div style="letter-spacing:.7em;font-size:13px;opacity:.8">WELCOME TO THE VAULT</div><div style="margin-top:18px;font-size:clamp(28px,5vw,56px);font-weight:600;letter-spacing:.08em">' + name + '</div><div style="margin-top:14px;letter-spacing:.5em;font-size:11px;opacity:.75">' + String(o.role || '').toUpperCase().replace(/[<>&"']/g, '') + '</div></div>';
            document.body.appendChild(d);
            requestAnimationFrame(function () { d.style.opacity = '1'; });
            setTimeout(function () { try { o.onBlack && o.onBlack(); } catch (e) {} }, 650);
            setTimeout(function () {
                if (o.hold) return res({ skipped: false });
                d.style.opacity = '0'; setTimeout(function () { d.remove(); res({ skipped: false }); }, 650);
            }, 2200);
        });
    }
    window.VaultCutscene = {
        preload: function () { return load().then(function (m) { return m.preload(); }).catch(function () {}); },
        play: function (o) {
            o = o || {};
            if (playing) return playing;
            playing = load().then(function (m) { return m.play(o); })
                .catch(function (e) { console.warn('[vault] cinematic unavailable, using the simple hand-over', e); return basic(o); })
                .then(function (r) { playing = null; return r; }, function (e) { playing = null; throw e; });
            return playing;
        },
    };
})();
