/* =====================================================================
   Zelpophai AI — Christmas seasonal theme controller
   - On from 1 December to 2 January, and only for people allowed to see it.
     For its first year that is the Owner, the admins and anyone tagged as a
     Friend; the Vault (System → Controls) can open it to everyone.
   - Obeys the same "Seasonal look" setting as Halloween (in season / always /
     never), and the Animations setting, and the device's reduced-motion
     preference.
   - Adds the "christmas" class to <html>, strings up fairy lights, paints the
     winter scene, and drops the odd bauble you can catch.
   The pre-paint toggle in app.html's <head> uses a flag this file caches, so
   there is no flash of the normal theme on the way in.
   ===================================================================== */
(function () {
    'use strict';

    var OK_KEY = 'zp_xmas_ok';          // cached "this person may see it"
    var SCORE_KEY = 'zp_xmas_caught';
    var FLAKES = ['❄', '❅', '❆', '•'];
    var snowTimer = null, baubleTimer = null, allowed = null;

    function store(k, v) {
        try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
    }
    function seasonalChoice() {
        try { return JSON.parse(localStorage.getItem('zenith_settings') || '{}').seasonal || 'auto'; } catch (e) { return 'auto'; }
    }
    function inSeason(d) {
        d = d || new Date();
        var m = d.getMonth(), day = d.getDate();        // Nov = 10, Dec = 11, Jan = 0
        return (m === 10 && day >= 25) || m === 11 || (m === 0 && day <= 2);
    }
    function maySee() { return allowed === null ? store(OK_KEY) === '1' : allowed; }
    function shouldBeOn(choice) {
        choice = choice || seasonalChoice();
        if (choice === 'off') return false;
        if (!maySee()) return false;
        return choice === 'on' || (choice === 'auto' && inSeason());
    }
    function quiet() {
        if (document.documentElement.classList.contains('zst-no-anim')) return true;
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    function isOn() { return document.documentElement.classList.contains('christmas'); }
    function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || ''); }
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

    function loadFont() {
        if (document.getElementById('xm-font')) return;
        var l = document.createElement('link');
        l.id = 'xm-font';
        l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&display=swap';
        document.head.appendChild(l);
    }

    /* ───────────────── the scene ───────────────── */
    function buildScene() {
        if (!document.body) return;
        if (!document.getElementById('xm-fx')) {
            var fx = document.createElement('div');
            fx.id = 'xm-fx';
            fx.setAttribute('aria-hidden', 'true');
            fx.innerHTML = '<div class="xm-sky"></div><div class="xm-hills"></div><div class="xm-trees"></div><div class="xm-drift"></div>';
            document.body.appendChild(fx);
        }
        if (!document.getElementById('xm-lights')) {
            var COLOURS = ['#ff5b52', '#ffd166', '#5ec98a', '#6fb7ff', '#f07de0'];
            var lights = document.createElement('div');
            lights.id = 'xm-lights';
            lights.setAttribute('aria-hidden', 'true');
            var html = '<div class="wire"></div>';
            // One bulb every 50px, hanging from the dip in the wire.
            var n = Math.ceil(window.innerWidth / 50) + 2;
            for (var i = 0; i < n; i++) {
                var c = COLOURS[i % COLOURS.length];
                var dip = (i % 2) ? 20 : 8;      // alternate bulbs sit lower, following the wire
                html += '<i style="left:' + (i * 50 + 12) + 'px;top:' + dip + 'px;background:' + c +
                        ';box-shadow:0 0 10px ' + c + ',0 0 18px ' + c + '66;animation-delay:' +
                        (i * 0.18).toFixed(2) + 's,' + (i * 0.3).toFixed(2) + 's"></i>';
            }
            lights.innerHTML = html;
            document.body.appendChild(lights);
        }
        startSnow();
        scheduleBauble();
    }

    function teardownScene() {
        clearInterval(snowTimer); clearTimeout(baubleTimer);
        ['xm-fx', 'xm-lights', 'xm-snow', 'xm-play', 'xm-score'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.parentNode.removeChild(el);
        });
    }

    /* ───────────────── falling snow ───────────────── */
    function snowLayer() {
        var l = document.getElementById('xm-snow');
        if (!l) { l = document.createElement('div'); l.id = 'xm-snow'; l.setAttribute('aria-hidden', 'true'); document.body.appendChild(l); }
        return l;
    }
    function flake() {
        if (document.hidden || !isOn()) return;
        var layer = snowLayer();
        if (layer.childElementCount > (snowLevel() === 'lots' ? 140 : 70)) return;       // never let it pile up
        var s = document.createElement('span');
        s.textContent = pick(FLAKES);
        var size = 8 + Math.random() * 14;
        s.style.left = (Math.random() * window.innerWidth) + 'px';
        s.style.fontSize = size.toFixed(0) + 'px';
        s.style.opacity = (0.35 + Math.random() * 0.5).toFixed(2);
        s.style.setProperty('--dx', ((Math.random() - 0.5) * 160).toFixed(0) + 'px');
        s.style.setProperty('--rot', (Math.random() * 540 - 270).toFixed(0) + 'deg');
        var secs = 7 + Math.random() * 9;               // small flakes drift slower
        s.style.animationDuration = secs.toFixed(1) + 's';
        layer.appendChild(s);
        setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, secs * 1000 + 400);
    }
    function snowLevel() { return store('zp_xmas_snow') || 'light'; }       // off | light | lots
    function startSnow() {
        clearInterval(snowTimer);
        var lvl = snowLevel();
        if (quiet() || lvl === 'off') { var l = document.getElementById('xm-snow'); if (l) l.innerHTML = ''; return; }
        var every = lvl === 'lots' ? 160 : 420;
        for (var i = 0; i < (lvl === 'lots' ? 30 : 14); i++) setTimeout(flake, i * 200);   // a few already falling
        snowTimer = setInterval(flake, every);
    }

    /* ───────────── a bauble to catch, now and then ───────────── */
    function playLayer() {
        var l = document.getElementById('xm-play');
        if (!l) { l = document.createElement('div'); l.id = 'xm-play'; document.body.appendChild(l); }
        return l;
    }
    function sparkle(x, y, n) {
        if (quiet()) return;
        var layer = playLayer(), EM = ['✨', '❄', '🎄', '⭐', '🎁'];
        for (var i = 0; i < (n || 12); i++) {
            var c = document.createElement('span');
            c.className = 'xm-spark';
            c.textContent = pick(EM);
            var ang = Math.random() * Math.PI * 2, dist = 45 + Math.random() * 85;
            c.style.left = x + 'px'; c.style.top = y + 'px';
            c.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(0) + 'px');
            c.style.setProperty('--dy', (Math.sin(ang) * dist - 30).toFixed(0) + 'px');
            c.style.setProperty('--rot', (Math.random() * 400 - 200).toFixed(0) + 'deg');
            layer.appendChild(c);
            (function (el) { setTimeout(function () { el.remove(); }, 1200); })(c);
        }
    }
    function caught(btn) {
        var r = btn.getBoundingClientRect();
        sparkle(r.left + r.width / 2, r.top + r.height / 2, 16);
        btn.remove();
        var n = parseInt(store(SCORE_KEY) || '0', 10) + 1;
        store(SCORE_KEY, String(n));
        showScore(n);
        if (n === 1) toast('You caught a bauble! Keep an eye out for more. 🎄', 'success');
        else if (n === 12) toast('Twelve baubles — the tree is looking good. 🎄', 'success');
        else if (n === 25) toast('Twenty-five baubles. Merry Christmas! 🎁', 'success');
    }
    function showScore(n) {
        var el = document.getElementById('xm-score');
        if (!el) {
            el = document.createElement('div');
            el.id = 'xm-score'; el.className = 'xm-score';
            el.setAttribute('role', 'status');
            document.body.appendChild(el);
        }
        el.textContent = '🎄 ' + n + ' bauble' + (n === 1 ? '' : 's') + ' caught';
        clearTimeout(el._t);
        el._t = setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 4000);
    }
    function dropBauble() {
        if (document.hidden || !isOn() || quiet()) return;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'xm-bauble xm-catch';
        b.setAttribute('aria-label', 'Catch the bauble');
        b.addEventListener('click', function (e) { e.stopPropagation(); caught(b); });
        b.style.left = (40 + Math.random() * Math.max(80, window.innerWidth - 120)) + 'px';
        b.style.setProperty('--xm-dx', ((Math.random() - 0.5) * 120).toFixed(0) + 'px');
        playLayer().appendChild(b);
        requestAnimationFrame(function () { b.classList.add('fall'); });
        setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 9600);
    }
    function scheduleBauble() {
        clearTimeout(baubleTimer);
        if (quiet()) return;
        // one every 25–55 seconds: often enough to notice, rare enough to stay a treat
        baubleTimer = setTimeout(function () {
            if (isOn()) { dropBauble(); scheduleBauble(); }
        }, 25000 + Math.random() * 30000);
    }

    /* ───────────── greeting ───────────── */
    var GREETS = [
        'Merry Christmas', 'Happy Christmas', 'Season\'s greetings', 'Happy holidays',
    ];
    function patchWelcome() {
        if (!isOn()) return;
        var sub = document.querySelector('.welcome-message .welcome-sub');
        if (sub && !sub.dataset.xm) {
            sub.dataset.xm = '1';
            sub.textContent = pick(GREETS) + '! What shall we make today?';
        }
    }

    /* ───────────── turning it on and off ───────────── */
    /* Christmas is a dark winter-evening look. Light mode's own colours are far
       more specific than ours and would fight every rule, so while the theme is
       on we step light mode aside and put it back the moment it goes off. */
    function holdLight(on) {
        var R = document.documentElement;
        if (on) {
            if (R.classList.contains('light-theme')) {
                R.dataset.xmLight = '1';
                R.classList.remove('light-theme');
                if (document.body) document.body.classList.remove('light-theme');
            }
        } else if (R.dataset.xmLight === '1') {
            delete R.dataset.xmLight;
            R.classList.add('light-theme');
            if (document.body) document.body.classList.add('light-theme');
        }
    }

    function apply(choice) {
        var on = shouldBeOn(choice);
        document.documentElement.classList.toggle('christmas', on);
        holdLight(on);
        if (on) {
            // Only one seasonal look at a time; Christmas wins while it's on.
            document.documentElement.classList.remove('halloween');
            ['hw-fx', 'hw-play'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el) el.parentNode.removeChild(el);
            });
            loadFont();
            buildScene();
            var m = document.querySelector('meta[name="theme-color"]');
            if (m) m.content = '#07101c';
            patchWelcome();
            if (document.body) extrasOn(); else document.addEventListener('DOMContentLoaded', extrasOn);
        } else {
            teardownScene();
            extrasOff();
            // Hand the season back to Halloween if it is its time of year.
            try { if (window.Halloween) window.Halloween.apply(); } catch (e) {}
        }
    }

    /* Ask the server whether this person may see it, remember the answer so the
       next page load has the theme up before the first paint. */
    async function check() {
        try {
            var r = await fetch('/api/settings/seasonal', { credentials: 'same-origin' });
            if (!r.ok) throw new Error(r.status);
            var d = await r.json();
            allowed = !!(d.themes && d.themes.christmas && d.themes.christmas.allowed);
        } catch (e) {
            allowed = store(OK_KEY) === '1';            // offline: trust what we knew
        }
        store(OK_KEY, allowed ? '1' : '0');
        apply();
    }

    /* ───────────── 26.3: countdown, advent calendar, sleigh, ideas, card maker ───────────── */
    function daysTo(m, d) {
        var now = new Date(), t = new Date(now.getFullYear(), m, d);
        if (now > new Date(now.getFullYear(), m, d, 23, 59)) t = new Date(now.getFullYear() + 1, m, d);
        return Math.ceil((t - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    }
    function countdownText() {
        var now = new Date(), m = now.getMonth(), d = now.getDate();
        if (m === 11 && d === 24) return '🎄 Christmas Eve!';
        if (m === 11 && d === 25) return '🎄 Merry Christmas!';
        if (m === 11 && d === 26) return '🎁 Happy Boxing Day';
        if ((m === 11 && d >= 27) || (m === 0 && d <= 1)) { var n = daysTo(0, 1); return n <= 0 || (m === 0 && d === 1) ? '🎆 Happy New Year!' : '🎆 ' + n + ' day' + (n === 1 ? '' : 's') + ' to New Year'; }
        if (m === 0) return '🎆 Happy New Year!';
        var c = daysTo(11, 25);
        return '🎄 ' + c + ' day' + (c === 1 ? '' : 's') + ' to Christmas';
    }
    function buildCountdown() {
        if (document.getElementById('xm-count')) { document.getElementById('xm-count').textContent = countdownText(); return; }
        var b = document.createElement('button');
        b.id = 'xm-count'; b.type = 'button'; b.className = 'xm-count';
        b.title = 'Open the advent calendar';
        b.textContent = countdownText();
        b.addEventListener('click', function () { advent(); });
        document.body.appendChild(b);
    }

    // 24 doors, plus a warm-up door before December. Each has a little fact and something to do.
    var DOORS = [
        ['⭐', 'Warm-up', 'Christmas lights were first put on a tree with electricity in 1882 — 80 red, white and blue bulbs in New York.', 'Make my Christmas to-do list', 'Help me make a Christmas to-do list: ask me who I\'m buying for, what I\'m cooking and where I\'ll be, then turn it into a checklist with dates.'],
        ['🎄', 'Door 1', 'The tradition of a decorated tree comes from Germany in the 1500s.', 'A Christmas card picture', 'Make a beautiful Christmas card picture: a cosy snowy village at night with warm lights in the windows.'],
        ['🍪', 'Door 2', 'Gingerbread houses became popular after the fairy tale Hansel and Gretel was published in 1812.', 'Easy Christmas biscuit recipe', 'Give me an easy Christmas biscuit recipe I can make with simple ingredients, with step-by-step instructions.'],
        ['🎁', 'Door 3', 'The average family spends weeks choosing gifts — but people remember thoughtful gifts far more than expensive ones.', 'Gift ideas', 'Help me find Christmas gift ideas. Ask me who they\'re for and my budget, then give me 8 thoughtful ideas.'],
        ['🦌', 'Door 4', 'Reindeer are the only deer where both males and females grow antlers.', 'Reindeer quiz', 'Give me a fun 5-question multiple-choice quiz about reindeer and Christmas animals, one question at a time.'],
        ['✉️', 'Door 5', 'Children have written letters to Father Christmas for over 150 years.', 'A letter from Santa', 'Write a magical, personal letter from Father Christmas to a child. Ask me their name, age and one thing they did well this year first.'],
        ['🎶', 'Door 6', '"Jingle Bells" was first written for Thanksgiving, not Christmas.', 'Christmas song facts', 'Tell me 5 surprising facts about famous Christmas songs.'],
        ['🕯️', 'Door 7', 'Candles in windows were once a sign that travellers were welcome to shelter.', 'Cosy evening ideas', 'Give me 10 cosy, low-cost Christmas evening ideas for the family.'],
        ['🧦', 'Door 8', 'Stockings come from a legend about gold coins dropped down a chimney landing in socks drying by the fire.', 'Stocking filler ideas', 'Give me 15 cheap, fun stocking filler ideas for kids and adults.'],
        ['📚', 'Door 9', 'In Iceland, people give books on Christmas Eve and spend the night reading — the "Christmas book flood".', 'Make a Christmas story', 'Write a short, heart-warming Christmas story (about 400 words) I can read aloud tonight.'],
        ['🍗', 'Door 10', 'A Christmas dinner for 6 can be done on a budget with a little planning.', 'Plan Christmas dinner', 'Plan a Christmas dinner for 6 people on a budget: menu, shopping list with rough costs, and a cooking timeline for the day.'],
        ['❄️', 'Door 11', 'No two snowflakes are alike — each grows its own shape as it falls.', 'Snowflake craft', 'Explain step by step how to make paper snowflakes with kids, with tips for pretty patterns.'],
        ['🎅', 'Door 12', 'Father Christmas has many names: Santa Claus, Père Noël, Babbo Natale, Sinterklaas…', 'Christmas around the world', 'Tell me how Christmas is celebrated in 6 different countries, with one fun tradition each.'],
        ['😂', 'Door 13', 'Christmas crackers were invented in London in 1847 by a sweet-maker.', 'Christmas jokes', 'Tell me 10 family-friendly Christmas cracker jokes.'],
        ['🎨', 'Door 14', 'The first Christmas card was sent in 1843 in England.', 'Write my card messages', 'Help me write warm Christmas card messages. Ask me who they\'re for (family, friends, colleagues) and write a few for each.'],
        ['🌟', 'Door 15', 'The star on top of the tree represents the Star of Bethlehem.', 'Decorating ideas', 'Give me creative Christmas decorating ideas I can do cheaply at home.'],
        ['🎬', 'Door 16', 'Watching a Christmas film together is one of the most loved family traditions.', 'Film night picks', 'Suggest 10 Christmas films for a family film night, with one line on why each is great.'],
        ['🙏', 'Door 17', 'Christmas celebrates the birth of Jesus, remembered by Christians around the world.', 'The Christmas story', 'Tell the Christmas nativity story simply, in a way suitable for children.'],
        ['🎲', 'Door 18', 'Board games sell more in December than any other month.', 'Party games', 'Give me 8 fun Christmas party games for a mix of ages, with simple rules.'],
        ['🥤', 'Door 19', 'Hot chocolate has been a winter favourite since the 1600s.', 'Festive drinks', 'Give me 5 easy festive drink recipes, including non-alcoholic ones.'],
        ['💌', 'Door 20', 'A handwritten thank-you note can mean more than the gift itself.', 'Thank-you notes', 'Write 5 short, warm thank-you notes for Christmas gifts I can adapt.'],
        ['🧹', 'Door 21', 'Planning ahead makes the big day far less stressful.', 'Christmas Eve plan', 'Make me a calm, step-by-step plan for Christmas Eve and Christmas morning so nothing is forgotten.'],
        ['🎤', 'Door 22', 'Carol singing door to door dates back hundreds of years.', 'A Christmas poem', 'Write a joyful Christmas poem for my family. Ask me a few names and fun memories from this year first.'],
        ['🎆', 'Door 23', 'Many people make New Year resolutions — about a third keep them.', 'New Year goals', 'Help me set 3 realistic New Year goals and a simple plan to keep each one.'],
        ['🎄', 'Door 24', 'Merry Christmas Eve! Tomorrow is the big day.', 'A Christmas message', 'Write a short, heartfelt Christmas message I can send to everyone I love.'],
    ];
    function openedDoors() { try { return JSON.parse(store('zp_advent') || '[]'); } catch (e) { return []; } }
    function canOpen(i) {
        var now = new Date(), m = now.getMonth(), d = now.getDate();
        if (i === 0) return inSeason(now);
        return (m === 11 && d >= i) || (m === 0 && d <= 2);
    }
    function advent() {
        if (!window.ZUI) return;
        var Z = window.ZUI;
        var m = Z.modal({ id: 'xm-advent', title: 'Advent calendar', sub: countdownText().replace(/^\S+\s/, '') + ' — a new door every day', icon: 'gift', wide: true });
        var opened = openedDoors();
        var html = '<div class="xm-doors">';
        DOORS.forEach(function (dr, i) {
            var open = opened.indexOf(i) >= 0, ok = canOpen(i);
            html += '<button type="button" class="xm-door' + (open ? ' open' : '') + (ok ? '' : ' locked') + (i === 0 ? ' warm' : '') + '" data-i="' + i + '">' +
                    '<span class="xm-dn">' + (i === 0 ? '⭐' : i) + '</span>' + (open ? '<span class="xm-de">' + dr[0] + '</span>' : '') + '</button>';
        });
        html += '</div><div class="xm-reveal" hidden></div>' +
            '<div class="xm-snowset"><span>Snow:</span>' + ['off', 'light', 'lots'].map(function (l) { return '<button type="button" data-snow="' + l + '" class="' + (snowLevel() === l ? 'on' : '') + '">' + { off: 'Off', light: 'Light', lots: 'Lots' }[l] + '</button>'; }).join('') +
            '<span class="xm-caught">🎄 ' + (parseInt(store(SCORE_KEY) || '0', 10)) + ' baubles caught</span></div>';
        m.body.innerHTML = html;
        m.body.addEventListener('click', function (e) {
            var sn = e.target.closest('[data-snow]');
            if (sn) { store('zp_xmas_snow', sn.dataset.snow); m.body.querySelectorAll('[data-snow]').forEach(function (b) { b.classList.toggle('on', b === sn); }); startSnow(); return; }
            var b = e.target.closest('.xm-door'); if (!b) return;
            var i = +b.dataset.i, dr = DOORS[i];
            if (!canOpen(i)) { toast(i ? 'Door ' + i + ' opens on ' + i + ' December 🎁' : 'Not yet!', ''); b.classList.add('shake'); setTimeout(function () { b.classList.remove('shake'); }, 500); return; }
            var r = b.getBoundingClientRect(); sparkle(r.left + r.width / 2, r.top + r.height / 2, 14);
            if (opened.indexOf(i) < 0) { opened.push(i); store('zp_advent', JSON.stringify(opened)); b.classList.add('open'); b.insertAdjacentHTML('beforeend', '<span class="xm-de">' + dr[0] + '</span>'); }
            var rv = m.body.querySelector('.xm-reveal'); rv.hidden = false;
            rv.innerHTML = '<div class="xm-rv-e">' + dr[0] + '</div><div><b>' + dr[1] + '</b><p></p><button type="button" class="zu-btn pri sm">' + dr[3] + ' →</button></div>';
            rv.querySelector('p').textContent = dr[2];
            rv.querySelector('button').onclick = function () { m.close(); if (window.ZTools) ZTools.newChatWith(dr[4]); };
            rv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }

    function cardMaker() {
        if (!window.ZUI) return;
        var Z = window.ZUI;
        var m = Z.modal({ id: 'xm-card', title: 'Make a Christmas card', sub: 'A picture and the words to go with it', icon: 'gift' });
        m.body.innerHTML = '<label class="zu-l">Who is it for?</label><input class="zu-in" id="xm-to" placeholder="e.g. Grandma, my team at work, the Okello family">' +
            '<label class="zu-l">From</label><input class="zu-in" id="xm-from" placeholder="Your name(s)">' +
            '<label class="zu-l">Feel</label><select class="zu-in" id="xm-feel"><option>Warm and heartfelt</option><option>Funny</option><option>Faith-filled</option><option>For children</option><option>Professional</option></select>' +
            '<label class="zu-l">Picture idea <em>(optional)</em></label><input class="zu-in" id="xm-pic" placeholder="e.g. a robin on a snowy branch, our dog in a Santa hat">' +
            '<button class="zu-btn pri wide" data-a="go">Make my card</button>';
        m.body.querySelector('[data-a=go]').onclick = function () {
            var to = document.getElementById('xm-to').value.trim() || 'someone special', from = document.getElementById('xm-from').value.trim();
            var feel = document.getElementById('xm-feel').value, pic = document.getElementById('xm-pic').value.trim() || 'a cosy, festive Christmas scene';
            m.close();
            if (window.ZTools) ZTools.newChatWith('Make me a Christmas card for ' + to + (from ? ' from ' + from : '') + '. Feel: ' + feel.toLowerCase() +
                '. First create the card picture: ' + pic + ', beautiful and festive, with space for words, no text in the image. Then write the message for inside the card (4-6 lines), plus one shorter alternative.');
        };
        setTimeout(function () { var i = document.getElementById('xm-to'); if (i) i.focus(); }, 30);
    }

    // Santa's sleigh crosses the sky now and then — tap it for a treat.
    var sleighTimer = null;
    function sleigh() {
        if (document.hidden || !isOn() || quiet()) return;
        var s = document.createElement('button');
        s.type = 'button'; s.className = 'xm-sleigh'; s.setAttribute('aria-label', 'Santa\'s sleigh — tap it');
        // Emoji reindeer face left; the group is mirrored so they lead the way to the right.
        s.innerHTML = '<span class="xm-team"><span>🦌</span><span>🦌</span><span class="xm-s">🛷</span><span class="xm-santa">🎅</span></span>';
        s.style.top = (70 + Math.random() * Math.max(40, window.innerHeight * 0.25)) + 'px';
        s.addEventListener('click', function (e) {
            e.stopPropagation();
            sparkle(e.clientX, e.clientY, 24);
            var n = parseInt(store(SCORE_KEY) || '0', 10) + 3; store(SCORE_KEY, String(n)); showScore(n);
            toast('Ho ho ho! Santa dropped 3 baubles for you 🎅', 'success');
            s.remove();
        });
        playLayer().appendChild(s);
        setTimeout(function () { if (s.parentNode) s.remove(); }, 15000);
    }
    function scheduleSleigh(first) {
        clearTimeout(sleighTimer);
        if (quiet()) return;
        sleighTimer = setTimeout(function () { if (isOn()) { sleigh(); scheduleSleigh(); } }, first ? 40000 : 180000 + Math.random() * 180000);
    }

    // Festive ideas on the new-chat screen.
    var IDEAS = [
        ['🎁', 'Gift ideas', 'Help me find Christmas gift ideas. Ask me who they\'re for and my budget first.'],
        ['💌', 'Card messages', 'Help me write Christmas card messages for family, friends and colleagues.'],
        ['🍗', 'Christmas dinner plan', 'Plan a Christmas dinner for my family on a budget, with a shopping list and cooking timeline.'],
        ['📖', 'A story for tonight', 'Write a short, magical Christmas story I can read to the kids tonight.'],
    ];
    function patchIdeas() {
        if (!isOn()) return;
        var w = document.querySelector('#chat-container .welcome-message');
        if (!w || w.querySelector('.xm-ideas') || w.querySelector('.zw-hero')) return;
        var box = document.createElement('div');
        box.className = 'xm-ideas';
        box.innerHTML = '<span class="xm-ideas-t">🎄 Christmas ideas</span>' + IDEAS.map(function (x, i) { return '<button type="button" data-i="' + i + '">' + x[0] + ' ' + x[1] + '</button>'; }).join('') +
            '<button type="button" data-a="advent">🗓️ Advent calendar</button>';
        box.addEventListener('click', function (e) {
            var b = e.target.closest('button'); if (!b) return;
            if (b.dataset.a === 'advent') return advent();
            var inp = document.getElementById('user-input'); if (!inp) return;
            inp.value = IDEAS[+b.dataset.i][2]; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus();
        });
        w.appendChild(box);
    }
    function watchWelcome() {
        var c = document.getElementById('chat-container');
        if (!c || c._xmw) return;
        c._xmw = true;
        new MutationObserver(function () { if (isOn()) { patchIdeas(); patchWelcome(); } }).observe(c, { childList: true });
        patchIdeas();
    }
    function extrasOn() { buildCountdown(); scheduleSleigh(true); watchWelcome(); }
    function extrasOff() {
        clearTimeout(sleighTimer);
        ['xm-count'].forEach(function (id) { var el = document.getElementById(id); if (el) el.remove(); });
        document.querySelectorAll('.xm-ideas,.xm-sleigh').forEach(function (el) { el.remove(); });
    }

    window.Christmas = {
        apply: apply, shouldBeOn: shouldBeOn, inSeason: inSeason, check: check,
        maySee: maySee, sparkle: sparkle, dropBauble: dropBauble,
        advent: advent, cardMaker: cardMaker, sleigh: sleigh, startSnow: startSnow,
    };

    function boot() { apply(); check(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    // Keep the lights the right width when the window changes.
    window.addEventListener('resize', function () {
        if (!isOn()) return;
        var l = document.getElementById('xm-lights');
        if (l) { l.remove(); buildScene(); }
    });
})();
