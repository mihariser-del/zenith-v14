/* Zelpophai AI — welcome page: live demo + button wiring.
   The real sign-in logic stays in auth.js; these buttons just reuse it. */
(function () {
    'use strict';
    // Every example is real Zelpophai output (see showcase.py): a Word file made
    // by the app, an image and a video made in the app, and today's headlines.
    var DEMOS = [
        { key: 'doc', ask: 'Write a short cover letter for a junior designer job', text: 'Here is a one-page cover letter in a warm, confident tone. It\'s a real Word file made by Zelpophai — open it and see.' },
        { key: 'img', ask: 'Make an image of a lighthouse on a cliff at dusk', text: 'Here you go — made with Zelpophai\'s image tool. Want it brighter, or with stars in the sky?' },
        { key: 'news', ask: 'What are the top news stories today?', text: 'I searched the web. Here are today\'s top stories:' },
        { key: 'vid', ask: 'Make a short video', text: 'Here\'s your clip, made in Zelpophai:', off: true }
    ];
    var current = 0, timer = null, SHOW = null;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function $(id) { return document.getElementById(id); }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    function ago(iso) {
        var m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
        return m < 2 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago';
    }
    function renderNews() {
        var box = $('wl-news'), n = SHOW && SHOW.news;
        if (!n || !n.items || !n.items.length) {
            box.innerHTML = '<p class="wl-news-wait">Fetching today\'s headlines…</p>';
            $('wl-web-t').textContent = 'Searching the web';
            return;
        }
        $('wl-web-t').textContent = 'Searched the web · updated ' + ago(n.at);
        box.innerHTML = '<ol>' + n.items.map(function (it) {
            return '<li><a href="' + esc(it.url) + '" target="_blank" rel="noopener nofollow">' + esc(it.title) + '</a>' +
                (it.summary ? '<span>' + esc(it.summary) + '</span>' : '') + (it.source ? '<small>' + esc(it.source) + '</small>' : '') + '</li>';
        }).join('') + '</ol>';
    }

    function show(i) {
        var d = DEMOS[i];
        if (!d || !$('wl-demo')) return;
        if (d.off) { show((i + 1) % DEMOS.length); return; }
        current = i;
        $('wl-ask').textContent = d.ask;
        $('wl-text').textContent = d.text;
        $('wl-doc').hidden = d.key !== 'doc';
        $('wl-img').hidden = d.key !== 'img';
        $('wl-web').hidden = d.key !== 'news';
        $('wl-news').hidden = d.key !== 'news';
        $('wl-vid').hidden = d.key !== 'vid';
        if (d.key === 'news') renderNews();
        var v = $('wl-vid-el');
        if (d.key === 'vid' && v.src) { try { v.currentTime = 0; var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
        else if (v && !v.paused) v.pause();
        var demo = $('wl-demo');
        demo.classList.remove('swap'); void demo.offsetWidth; demo.classList.add('swap');
        document.querySelectorAll('.wl-chips button').forEach(function (b) {
            var on = Number(b.getAttribute('data-demo')) === i;
            b.classList.toggle('on', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function applyShowcase(data) {
        SHOW = data || {};
        if (SHOW.image && SHOW.image.src) {
            $('wl-img-el').src = SHOW.image.src;
            $('wl-img-cap').textContent = SHOW.image.caption || 'Made in Zelpophai';
            if (SHOW.image.prompt) DEMOS[1].ask = SHOW.image.prompt;
        }
        if (SHOW.video && SHOW.video.src) {
            var v = $('wl-vid-el');
            v.src = SHOW.video.src; v.preload = 'metadata';
            $('wl-vid-cap').textContent = SHOW.video.caption || 'Video · made in Zelpophai';
            DEMOS[3].ask = SHOW.video.prompt || 'Make a short video';
            DEMOS[3].off = false;
        }
        var vb = document.querySelector('.wl-chips button[data-demo="3"]');
        if (vb) vb.hidden = DEMOS[3].off;
        if (DEMOS[current].key === 'news') renderNews();
        if (!SHOW.news) setTimeout(function () {
            fetch('/api/showcase').then(function (r) { return r.json(); }).then(function (d) { if (d && d.news) { SHOW.news = d.news; if (DEMOS[current].key === 'news') renderNews(); } }).catch(function () {});
        }, 9000);
    }

    // "Try this yourself": remember the prompt, then use the normal guest sign-in;
    // the app fills it in (whatsnew.js reads zp_pending_ask).
    function tryIt() {
        try { localStorage.setItem('zp_pending_ask', DEMOS[current].ask); } catch (e) {}
        var g = document.querySelector('[data-guest]');
        if (g) g.click();
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
        if ($('wl-vid-el')) document.querySelector('.wl-chips button[data-demo="3"]').hidden = true;
        if ($('wl-try')) $('wl-try').addEventListener('click', tryIt);
        fetch('/api/showcase').then(function (r) { return r.json(); }).then(applyShowcase).catch(function () { applyShowcase({}); });
        if (!reduce) timer = setInterval(function () { show((current + 1) % DEMOS.length); }, 6500);

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
        // /?login=1 (from the invite page and the apps) opens the login form straight away
        try { var _lq = new URLSearchParams(location.search).get('login'); if (_lq === '1' || _lq === 'register') setTimeout(function () { openLogin(_lq === 'register' ? 'register' : 'login'); }, 300); } catch (e) {}
        document.querySelectorAll('[data-register]').forEach(function (b) { b.addEventListener('click', function () { openLogin('register'); }); });
    });
})();
