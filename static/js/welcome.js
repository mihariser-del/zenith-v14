/* Zelpophai AI — welcome page: live demo + button wiring.
   The real sign-in logic stays in auth.js; these buttons just reuse it. */
(function () {
    'use strict';
    var DEMOS = [
        { ask: 'Write a short cover letter for a junior designer job', text: 'Here is a one-page cover letter in a warm, confident tone. I kept it under 250 words and highlighted your portfolio.', doc: true },
        { ask: 'Make an image of a lighthouse on a cliff at dusk', text: 'Here you go. Want it brighter, or with stars in the sky?', img: true },
        { ask: 'What happened in AI this week?', text: 'I checked recent sources. Here are the three biggest stories, each with a short summary and a link.', web: true },
        { ask: 'Make a 6-second video of a neon city street after rain', text: 'On it! Your clip will be ready in about a minute. I added rain sounds and a slow camera push.', vid: true }
    ];
    var current = 0, timer = null;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function $(id) { return document.getElementById(id); }

    function show(i) {
        var d = DEMOS[i];
        if (!d || !$('wl-demo')) return;
        current = i;
        $('wl-ask').textContent = d.ask;
        $('wl-text').textContent = d.text;
        $('wl-doc').hidden = !d.doc;
        $('wl-img').hidden = !d.img;
        $('wl-web').hidden = !d.web;
        $('wl-vid').hidden = !d.vid;
        var demo = $('wl-demo');
        demo.classList.remove('swap'); void demo.offsetWidth; demo.classList.add('swap');
        document.querySelectorAll('.wl-chips button').forEach(function (b) {
            var on = Number(b.getAttribute('data-demo')) === i;
            b.classList.toggle('on', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    function openLogin(tab) {
        var start = $('start-btn');
        if (start) start.click();
        if (tab) {
            var t = document.querySelector('.auth-tab[data-tab="' + tab + '"]');
            if (t) t.click();
        }
        var first = $(tab === 'register' ? 'reg-username' : 'login-username');
        if (first) setTimeout(function () { first.focus(); }, 60);
    }

    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('.wl-chips button').forEach(function (b) {
            b.addEventListener('click', function () { stop(); show(Number(b.getAttribute('data-demo'))); });
        });
        if (!reduce) timer = setInterval(function () { show((current + 1) % DEMOS.length); }, 4800);

        // "Try it free" everywhere = the existing guest sign-in
        document.querySelectorAll('[data-guest]').forEach(function (b) {
            b.addEventListener('click', function () {
                var g = $('guest-btn');
                if (!g) return;
                b.disabled = true;
                b.setAttribute('aria-busy', 'true');
                g.click();
                setTimeout(function () { b.disabled = false; b.removeAttribute('aria-busy'); }, 4000);
            });
        });
        document.querySelectorAll('[data-login]').forEach(function (b) { b.addEventListener('click', function () { openLogin('login'); }); });
        document.querySelectorAll('[data-register]').forEach(function (b) { b.addEventListener('click', function () { openLogin('register'); }); });
    });
})();
