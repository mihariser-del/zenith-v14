/* Zelpophai on Android: turns the phone app's native bridge (window.ZPAndroid,
   added by the app's assistant screen) into the same window.zelpophaiMini API
   the Windows app gives Mini, plus voice (listen / speak) and quick phone
   actions (alarms, timers, calls…).

   The bridge is one call: ZPAndroid.call(method, argsJson, callbackId). The app
   answers with window.__zpaDone(callbackId, ok, json) and sends events
   (speech heard, panel shown, stop) with window.__zpaEvent(name, json).
   Only the Zelpophai site is ever loaded in that screen — the app checks. */
(function () {
    'use strict';
    var N = window.ZPAndroid;
    if (!N || window.zelpophaiMini) return;
    var seq = 0, waits = {}, handlers = {};
    function parse(d) { try { return JSON.parse(d); } catch (e) { return d; } }
    window.__zpaDone = function (id, ok, data) {
        var w = waits[id]; if (!w) return; delete waits[id];
        var v = parse(data);
        if (ok) w.res(v); else w.rej(new Error(typeof v === 'string' ? v : (v && v.error) || 'That didn’t work'));
    };
    window.__zpaEvent = function (name, data) {
        var v = parse(data);
        (handlers[name] || []).forEach(function (fn) { try { fn(v); } catch (e) {} });
    };
    function call(m, args) {
        return new Promise(function (res, rej) {
            var id = 'c' + (++seq);
            waits[id] = { res: res, rej: rej };
            try { N.call(m, JSON.stringify(args == null ? null : args), id); }
            catch (e) { delete waits[id]; rej(e); }
        });
    }
    function on(n, fn) { (handlers[n] = handlers[n] || []).push(fn); return function () { handlers[n] = (handlers[n] || []).filter(function (f) { return f !== fn; }); }; }
    window.zelpophaiMini = {
        platform: 'android',
        lastCapture: function () { return call('lastCapture'); },      // the screenshot taken when you opened Zelpophai
        capture: function () { return call('capture'); },              // a fresh one (needs the Accessibility setting)
        screenText: function () { return call('screenText'); },        // the words on screen, as the phone reads them
        selectArea: function () { return Promise.resolve(null); },
        clipboard: function () { return call('clipboard'); },
        apps: function () { return call('apps'); },
        copy: function (t) { return call('copy', { text: String(t || '') }); },
        controlStart: function (t) { return call('controlStart', { task: String(t || '') }); },
        act: function (a) { return call('act', a); },
        controlEnd: function () { return call('controlEnd'); },
        showPanel: function () { return call('showPanel'); },
        hide: function () { return call('hide'); },
        openInApp: function (p) { return call('openInApp', { path: String(p || '/app') }); },
        setPinned: function () { return Promise.resolve(false); },
        onShown: function (fn) { return on('shown', fn); },
        onStop: function (fn) { return on('stop', fn); },
        // phone-only
        quick: function (acts) { return call('quick', { actions: acts || [] }); },
        listen: function () { return call('listen'); },
        stopListening: function () { return call('stopListening'); },
        onSpeech: function (fn) { return on('speech', fn); },
        speak: function (t) { return call('speak', { text: String(t || '').slice(0, 3000) }); },
        stopSpeaking: function () { return call('stopSpeaking'); },
        onSpoken: function (fn) { return on('spoken', fn); },
        info: function () { return call('info'); },
    };
})();
