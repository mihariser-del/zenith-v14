/* Tools (26.3): Your day, Reply writer, Budget & spending (with receipt
   photos), Translate, Homework helper, "explain it simpler / deeper" on every
   answer, and polls + games in shared chats. Server side: tools.py. */
(function () {
    'use strict';
    const Z = window.ZUI;
    const $ = (id) => document.getElementById(id);
    const esc = (s) => Z.esc(s);
    const toast = (m, t) => Z.toast(m, t);
    const call = (p, o) => Z.call(p, o);
    const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } };
    const C = () => (typeof Chat !== 'undefined' ? Chat : null);
    const myLang = (() => { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of((navigator.language || 'en').split('-')[0]) || 'English'; } catch (e) { return 'English'; } })();
    const money = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });

    // Put text in the box and send it, as if the person typed it.
    function sendText(t) {
        const i = $('user-input'); if (!i) return;
        i.value = t; i.dispatchEvent(new Event('input', { bubbles: true }));
        const b = $('send-btn'); if (b) b.click();
    }
    async function newChatWith(text, body) {
        const ch = C(); if (!ch) return;
        try {
            const d = await call('/api/chats', { method: 'POST', body: body || {} });
            ch.chats[d.chat.id] = d.chat; await ch.switchTo(d.chat.id);
            if (text) setTimeout(() => sendText(text), 400);
        } catch (e) { toast(e.message, 'error'); }
    }
    async function getData(key) { try { return (await call('/api/tools/data/' + key)).value; } catch (e) { return null; } }
    async function putData(key, value) { return call('/api/tools/data/' + key, { method: 'PUT', body: { value } }); }
    function md(el, text) { if (window.ZRender) ZRender.render(el, text, { inner: true }); else el.textContent = text; }
    function loadChart() {
        if (window.Chart) return Promise.resolve(window.Chart);
        return new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/static/vendor/chart-4.4.1.umd.min.js'; s.onload = () => res(window.Chart); s.onerror = rej; document.head.appendChild(s); });
    }
    const PAL = ['#6366f1', '#ec4899', '#22c55e', '#f59e0b', '#06b6d4', '#a855f7', '#ef4444', '#84cc16', '#14b8a6', '#f97316', '#3b82f6', '#eab308', '#64748b'];

    /* ═════════════ the Tools window ═════════════ */
    const TOOLS = [
        ['day', '☀️', 'Your day', 'Weather, news and everything on your list, in one short briefing.', 'Everyday'],
        ['reply', '💬', 'Reply writer', 'Paste a message you got and pick from three ready-to-send replies.', 'Everyday'],
        ['money', '💰', 'Budget & spending', 'Plan a monthly budget and track what you spend — snap receipts to add them.', 'Everyday'],
        ['translate', '🌍', 'Translate', 'Translate any text, keeping its formatting.', 'Everyday'],
        ['homework', '📒', 'Homework helper', 'Hints first, then the next step — so you learn it, not just copy it.', 'Learn'],
        ['study', '🎓', 'Study', 'Flashcards and quizzes that bring back what you find hard.', 'Learn'],
    ];
    const SECTIONS = ['Christmas', 'Everyday', 'Learn', 'Create', 'Work', 'Fun'];
    const Tools = {
        extra: [],            // [id, emoji, name, description, section, open()] added by the 26.4 tools below
        open() {
            const m = Z.modal({ id: 'zt-tools', title: 'Tools', sub: 'Handy helpers for everyday things', icon: 'bolt', wide: true, tall: true });
            let list = TOOLS.concat(this.extra);
            if (window.Christmas && Christmas.inSeason && Christmas.inSeason() && document.documentElement.classList.contains('christmas')) {
                list = [['advent', '🎁', 'Advent calendar', 'A little surprise behind a new door every day until Christmas.', 'Christmas'], ['card', '💌', 'Christmas card', 'Make a picture card and the words to go with it.', 'Christmas']].concat(list);
            }
            m.body.innerHTML = SECTIONS.map(sec => {
                const items = list.filter(t => (t[4] || 'Everyday') === sec);
                return items.length ? `<label class="zu-l">${sec}</label><div class="zt-grid">${items.map(t => `<button class="zt-card" data-t="${t[0]}"><span class="zt-e">${t[1]}</span><b>${esc(t[2])}</b><small>${esc(t[3])}</small></button>`).join('')}</div>` : '';
            }).join('');
            m.body.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { m.close(); this.run(b.dataset.t); });
        },
        run(t) {
            const x = this.extra.find(e => e[0] === t); if (x) return x[5]();
            if (t === 'day') return Day.open();
            if (t === 'reply') return Reply.open();
            if (t === 'money') return Money.open();
            if (t === 'translate') return Translate.open();
            if (t === 'study' && window.ZStudy) return ZStudy.open();
            if (t === 'homework') return homework();
            if (t === 'advent' && window.Christmas && Christmas.advent) return Christmas.advent();
            if (t === 'card' && window.Christmas && Christmas.cardMaker) return Christmas.cardMaker();
        },
    };
    async function homework() {
        try {
            const d = await call('/api/assistants');
            let a = d.mine.concat(d.saved).find(x => x.name === 'Homework Helper');
            if (!a) a = (await call('/api/assistants/from-example/homework', { method: 'POST' })).assistant;
            await newChatWith('', { assistant_id: a.id });
        } catch (e) { toast(e.message, 'error'); }
    }

    /* ═════════════ Your day ═════════════ */
    const Day = {
        async open(fresh) {
            const m = Z.modal({ id: 'zt-day', title: 'Your day', sub: new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }), icon: 'clock' });
            const prefs = (await getData('prefs')) || {};
            if (!prefs.city && !prefs.noCity) {
                m.body.innerHTML = `<label class="zu-l">Which town or city are you in? <em>— for the weather and local news</em></label>
                  <div class="zw-row"><input class="zu-in" id="zt-city" placeholder="e.g. Kampala"><button class="zu-btn pri" data-a="ok">Continue</button></div>
                  <button class="zu-link" data-a="skip" style="margin-top:10px">Skip — just show my own things</button>`;
                const go = async (city) => { prefs.city = city; prefs.noCity = !city; try { await putData('prefs', prefs); } catch (e) {} this.open(); };
                m.body.querySelector('[data-a=ok]').onclick = () => go($('zt-city').value.trim());
                m.body.querySelector('[data-a=skip]').onclick = () => go('');
                setTimeout(() => $('zt-city').focus(), 30);
                return;
            }
            m.body.innerHTML = '<div class="zt-loading"><span class="zf-spin"></span> Putting your day together…</div>';
            try {
                const d = await call(`/api/tools/briefing?tz=${encodeURIComponent(tz())}&city=${encodeURIComponent(prefs.city || '')}${fresh ? '&fresh=1' : ''}`);
                m.body.innerHTML = `<div class="zt-brief"></div><div class="zw-row" style="margin-top:14px">
                    <button class="zu-btn sm" data-a="fresh">↻ Refresh</button><button class="zu-btn sm" data-a="city">📍 ${esc(prefs.city || 'Set my town')}</button>
                    <span style="flex:1"></span><button class="zu-btn sm pri" data-a="daily">Send me this every morning</button></div>`;
                md(m.body.querySelector('.zt-brief'), d.text);
                m.body.querySelector('[data-a=fresh]').onclick = () => this.open(true);
                m.body.querySelector('[data-a=city]').onclick = async () => { delete prefs.city; delete prefs.noCity; await putData('prefs', prefs); this.open(); };
                m.body.querySelector('[data-a=daily]').onclick = async (e) => {
                    try {
                        await call('/api/jobs', { method: 'POST', body: { title: 'Your day', every: 'daily', at: '07:00', tz: tz(),
                            prompt: `Give me my morning briefing for today: a warm greeting, the weather in ${prefs.city || 'my area'}, the 3-4 most important news headlines there (search the web), and a short encouraging tip. Keep it under 200 words.` } });
                        e.target.textContent = 'Done — every day at 7:00 ✓'; e.target.disabled = true;
                        toast('Your briefing will arrive every morning at 7:00 — change it under Reminders → Scheduled jobs', 'success');
                    } catch (err) { toast(err.message, 'error'); }
                };
            } catch (e) { m.body.innerHTML = `<p class="zw-empty">${esc(e.message)}</p>`; }
        },
    };

    /* ═════════════ Reply writer ═════════════ */
    const Reply = {
        open() {
            const m = Z.modal({ id: 'zt-reply', title: 'Reply writer', sub: 'Paste a message — get three replies ready to send', icon: 'reply', wide: true });
            m.body.innerHTML = `<label class="zu-l">The message you got</label><textarea class="zu-in" id="zt-msg" rows="6" placeholder="Paste the email, WhatsApp or text message here"></textarea>
              <div class="zw-two"><div><label class="zu-l">Who's it from? <em>(optional)</em></label><input class="zu-in" id="zt-ctx" placeholder="e.g. my landlord, a customer, my boss"></div>
              <div><label class="zu-l">What do you want to say? <em>(optional)</em></label><input class="zu-in" id="zt-want" placeholder="e.g. say yes but ask for Friday instead"></div></div>
              <button class="zu-btn pri wide" data-a="go">Write replies</button><div class="zt-replies"></div>`;
            m.body.querySelector('[data-a=go]').onclick = async (e) => {
                const msg = $('zt-msg').value.trim(); if (!msg) return toast('Paste the message first', 'error');
                const b = e.target; b.disabled = true; b.textContent = 'Writing…';
                try {
                    const d = await call('/api/tools/replies', { method: 'POST', body: { message: msg, context: $('zt-ctx').value, want: $('zt-want').value } });
                    const box = m.body.querySelector('.zt-replies');
                    box.innerHTML = d.replies.map((r, i) => `<div class="zt-reply"><div class="zt-rh"><b>${esc(r.label)}</b><button class="zu-btn sm" data-c="${i}">Copy</button></div><p></p></div>`).join('');
                    box.querySelectorAll('.zt-reply p').forEach((p, i) => { p.textContent = d.replies[i].text; });
                    box.querySelectorAll('[data-c]').forEach(x => x.onclick = async () => { try { await navigator.clipboard.writeText(d.replies[+x.dataset.c].text); } catch (er) {} x.textContent = 'Copied ✓'; });
                } catch (err) { toast(err.message, 'error'); }
                b.disabled = false; b.textContent = 'Write replies';
            };
            setTimeout(() => $('zt-msg').focus(), 30);
        },
    };

    /* ═════════════ Translate ═════════════ */
    const LANGS = ['English', 'French', 'Spanish', 'Swahili', 'Luganda', 'Arabic', 'Portuguese', 'German', 'Chinese', 'Hindi', 'Yoruba', 'Hausa', 'Igbo', 'Amharic', 'Zulu', 'Kinyarwanda', 'Somali', 'Italian', 'Russian', 'Japanese', 'Korean', 'Turkish', 'Dutch'];
    const Translate = {
        open(text) {
            const m = Z.modal({ id: 'zt-tr', title: 'Translate', sub: 'Keeps headings, lists and formatting', icon: 'spark', wide: true });
            m.body.innerHTML = `<textarea class="zu-in" id="zt-src" rows="6" placeholder="Paste text in any language"></textarea>
              <div class="zw-row"><label>Into</label><select class="zu-in" id="zt-to" style="max-width:220px">${LANGS.map(l => `<option ${l === myLang ? 'selected' : ''}>${l}</option>`).join('')}</select>
              <button class="zu-btn pri" data-a="go">Translate</button></div><div class="zt-out"></div>`;
            if (text) $('zt-src').value = text;
            m.body.querySelector('[data-a=go]').onclick = async (e) => {
                const t = $('zt-src').value.trim(); if (!t) return;
                e.target.disabled = true; e.target.textContent = 'Translating…';
                try {
                    const d = await call('/api/tools/translate', { method: 'POST', body: { text: t, to: $('zt-to').value } });
                    const o = m.body.querySelector('.zt-out'); o.innerHTML = '<div class="zt-brief"></div><button class="zu-btn sm" data-a="copy">Copy</button>';
                    md(o.querySelector('.zt-brief'), d.text);
                    o.querySelector('[data-a=copy]').onclick = async (ev) => { try { await navigator.clipboard.writeText(d.text); } catch (x) {} ev.target.textContent = 'Copied ✓'; };
                } catch (err) { toast(err.message, 'error'); }
                e.target.disabled = false; e.target.textContent = 'Translate';
            };
        },
    };

    /* ═════════════ Budget & spending ═════════════ */
    const DEFAULT_COSTS = [['Rent & housing', 0], ['Food & groceries', 0], ['Transport', 0], ['Bills & utilities', 0], ['Phone & internet', 0], ['Family & gifts', 0], ['Other', 0]];
    const CATS = ['Food & groceries', 'Eating out', 'Transport', 'Bills & utilities', 'Rent & housing', 'Shopping', 'Health', 'Education', 'Entertainment', 'Phone & internet', 'Family & gifts', 'Business', 'Other'];
    const Money = {
        tab: 'budget', charts: [],
        async open(tab) {
            const m = Z.modal({ id: 'zt-money', title: 'Budget & spending', sub: 'Plan your month and see where the money goes', icon: 'trophy', wide: true, tall: true });
            this.m = m; this.tab = tab || this.tab;
            this.budget = (await getData('budget')) || { currency: '', income: 0, costs: DEFAULT_COSTS.map(([n, a]) => ({ name: n, amount: a })), goal: 0, goalName: '' };
            this.spending = (await getData('spending')) || { entries: [] };
            this.draw();
        },
        killCharts() { this.charts.forEach(c => { try { c.destroy(); } catch (e) {} }); this.charts = []; },
        draw() {
            this.killCharts();
            const m = this.m;
            m.body.innerHTML = `<div class="zs-tabs"><button data-tab="budget" class="${this.tab === 'budget' ? 'on' : ''}">Monthly budget</button><button data-tab="spend" class="${this.tab === 'spend' ? 'on' : ''}">Spending</button></div><div class="zt-pane"></div>`;
            m.body.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { this.tab = b.dataset.tab; this.draw(); });
            if (this.tab === 'budget') this.drawBudget(m.body.querySelector('.zt-pane')); else this.drawSpend(m.body.querySelector('.zt-pane'));
        },
        totals() {
            const b = this.budget;
            const costs = b.costs.reduce((n, c) => n + (+c.amount || 0), 0);
            const left = (+b.income || 0) - costs;
            const months = b.goal > 0 && left > 0 ? Math.ceil(b.goal / left) : null;
            return { costs, left, months };
        },
        drawBudget(el) {
            const b = this.budget, cur = b.currency || '';
            const t = this.totals();
            el.innerHTML = `<div class="zw-two"><div><label class="zu-l">Money coming in each month</label><input class="zu-in" type="number" min="0" id="zt-inc" value="${+b.income || ''}" placeholder="e.g. 1500000"></div>
                <div style="max-width:140px"><label class="zu-l">Currency</label><input class="zu-in" id="zt-cur" value="${esc(cur)}" placeholder="UGX" maxlength="5"></div></div>
              <label class="zu-l">Monthly costs</label><div class="zt-costs">${b.costs.map((c, i) => `<div class="zt-cost"><input class="zu-in" data-n="${i}" value="${esc(c.name)}"><input class="zu-in" type="number" min="0" data-a="${i}" value="${+c.amount || ''}" placeholder="0"><button class="zu-btn sm ghost" data-x="${i}" title="Remove">✕</button></div>`).join('')}</div>
              <button class="zu-btn sm" data-a="add">+ Add a cost</button>
              <div class="zw-two" style="margin-top:6px"><div><label class="zu-l">Saving for <em>(optional)</em></label><input class="zu-in" id="zt-gn" value="${esc(b.goalName || '')}" placeholder="e.g. a laptop"></div>
                <div><label class="zu-l">How much</label><input class="zu-in" type="number" min="0" id="zt-g" value="${+b.goal || ''}"></div></div>
              <div class="zt-sum"><div><span>Costs</span><b>${cur} ${money(t.costs)}</b></div><div class="${t.left < 0 ? 'bad' : 'good'}"><span>${t.left < 0 ? 'Short by' : 'Left over'}</span><b>${cur} ${money(Math.abs(t.left))}</b></div>
                ${b.goal > 0 ? `<div><span>${esc(b.goalName || 'Goal')}</span><b>${t.months ? t.months + ' month' + (t.months === 1 ? '' : 's') : 'not yet'}</b></div>` : ''}</div>
              <div class="zt-chart"><canvas></canvas></div>
              <div class="zw-row"><button class="zu-btn pri" data-a="save">Save budget</button><button class="zu-btn" data-a="advice">Ask Zelpophai for advice</button></div>`;
            const read = () => {
                b.income = +$('zt-inc').value || 0; b.currency = $('zt-cur').value.trim(); b.goal = +$('zt-g').value || 0; b.goalName = $('zt-gn').value.trim();
                el.querySelectorAll('[data-n]').forEach(x => { b.costs[+x.dataset.n].name = x.value; });
                el.querySelectorAll('[data-a]').forEach(x => { if (/^\d+$/.test(x.dataset.a)) b.costs[+x.dataset.a].amount = +x.value || 0; });
                b.total_costs = this.totals().costs;
            };
            // Typing updates the totals and chart without rebuilding the form (so you keep your place).
            const refresh = () => {
                read();
                const tt = this.totals(), c2 = b.currency || '';
                el.querySelector('.zt-sum').innerHTML = `<div><span>Costs</span><b>${c2} ${money(tt.costs)}</b></div><div class="${tt.left < 0 ? 'bad' : 'good'}"><span>${tt.left < 0 ? 'Short by' : 'Left over'}</span><b>${c2} ${money(Math.abs(tt.left))}</b></div>` +
                    (b.goal > 0 ? `<div><span>${esc(b.goalName || 'Goal')}</span><b>${tt.months ? tt.months + ' month' + (tt.months === 1 ? '' : 's') : 'not yet'}</b></div>` : '');
                const ch = this.charts[0], dd = b.costs.filter(c => c.amount > 0);
                if (ch) { ch.data.labels = dd.map(c => c.name); ch.data.datasets[0].data = dd.map(c => c.amount); ch.data.datasets[0].backgroundColor = dd.map((_, i) => PAL[i % PAL.length]); ch.update(); }
                else if (dd.length) loadChart().then(Ch => { if (!this.charts.length) this.charts.push(new Ch(el.querySelector('canvas'), { type: 'doughnut', data: { labels: dd.map(c => c.name), datasets: [{ data: dd.map(c => c.amount), backgroundColor: dd.map((_, i) => PAL[i % PAL.length]), borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: getComputedStyle(document.body).color, boxWidth: 12 } } } } })); });
            };
            el.addEventListener('input', refresh);
            el.querySelector('[data-a=add]').onclick = () => { read(); b.costs.push({ name: 'New cost', amount: 0 }); this.drawBudget(el); };
            el.querySelectorAll('[data-x]').forEach(x => x.onclick = () => { read(); b.costs.splice(+x.dataset.x, 1); this.drawBudget(el); });
            el.querySelector('[data-a=save]').onclick = async () => { read(); try { await putData('budget', b); toast('Budget saved', 'success'); } catch (e) { toast(e.message, 'error'); } };
            el.querySelector('[data-a=advice]').onclick = async () => {
                read(); try { await putData('budget', b); } catch (e) {}
                const lines = b.costs.filter(c => c.amount > 0).map(c => `- ${c.name}: ${cur} ${money(c.amount)}`).join('\n');
                this.m.close();
                newChatWith(`Here is my monthly budget. Income: ${cur} ${money(b.income)}.\nCosts:\n${lines}\n${b.goal ? `I'm saving ${cur} ${money(b.goal)} for ${b.goalName || 'a goal'}.\n` : ''}Work out exactly where I stand, show it as a chart, and give me 3-5 practical ways to save more or reach my goal sooner.`);
            };
            const data = b.costs.filter(c => c.amount > 0);
            if (data.length) loadChart().then(Ch => {
                if (this.charts.length) return;
                this.charts.push(new Ch(el.querySelector('canvas'), { type: 'doughnut', data: { labels: data.map(c => c.name), datasets: [{ data: data.map(c => c.amount), backgroundColor: data.map((_, i) => PAL[i % PAL.length]), borderWidth: 0 }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: getComputedStyle(document.body).color, boxWidth: 12 } } } } }));
            }).catch(() => {});
        },
        drawSpend(el) {
            const now = new Date(), cur = this.budget.currency || '';
            const ym = this.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            this.month = ym;
            const entries = (this.spending.entries || []).filter(e => String(e.date || '').startsWith(ym)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
            const byCat = {}; entries.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + (+e.amount || 0); });
            const total = entries.reduce((n, e) => n + (+e.amount || 0), 0);
            const planned = this.totals().costs;
            const months = [...new Set((this.spending.entries || []).map(e => String(e.date || '').slice(0, 7)).concat([ym]))].sort().reverse();
            el.innerHTML = `<div class="zw-row"><select class="zu-in" id="zt-month" style="max-width:180px">${months.map(x => `<option ${x === ym ? 'selected' : ''}>${x}</option>`).join('')}</select>
                <span style="flex:1"></span><button class="zu-btn pri" data-a="photo">📷 Add a receipt photo</button><button class="zu-btn" data-a="manual">+ Add by hand</button></div>
              <div class="zt-manual" hidden><div class="zt-cost"><input class="zu-in" id="zt-mm" placeholder="What / where"><input class="zu-in" type="number" id="zt-ma" placeholder="Amount"><select class="zu-in" id="zt-mc">${CATS.map(c => `<option>${c}</option>`).join('')}</select><input class="zu-in" type="date" id="zt-md" value="${new Date().toISOString().slice(0, 10)}"><button class="zu-btn sm pri" data-a="madd">Add</button></div></div>
              <div class="zt-sum"><div><span>Spent this month</span><b>${cur} ${money(total)}</b></div>${planned ? `<div class="${total > planned ? 'bad' : 'good'}"><span>Budget</span><b>${cur} ${money(planned)}</b></div><div><span>${total > planned ? 'Over by' : 'Still to spend'}</span><b>${cur} ${money(Math.abs(planned - total))}</b></div>` : ''}</div>
              <div class="zt-chart"><canvas></canvas></div>
              <div class="zt-list">${entries.map(e => `<div class="zt-entry"><span class="zt-cat">${esc(e.category)}</span><span class="zt-m">${esc(e.merchant)}<small>${esc(e.date)}${e.from === 'receipt' ? ' · 📷' : ''}</small></span><b>${esc(e.currency || cur)} ${money(e.amount)}</b><button class="zu-btn sm ghost" data-del="${e.id}">✕</button></div>`).join('') || '<p class="zw-empty big">Nothing yet this month. Snap a receipt or add a cost by hand.</p>'}</div>`;
            $('zt-month').onchange = (e) => { this.month = e.target.value; this.drawSpend(el); };
            el.querySelector('[data-a=manual]').onclick = () => { el.querySelector('.zt-manual').hidden = false; $('zt-mm').focus(); };
            el.querySelector('[data-a=madd]').onclick = async () => {
                const amt = +$('zt-ma').value; if (!amt) return;
                this.spending.entries.push({ id: Date.now(), date: $('zt-md').value, merchant: $('zt-mm').value || 'Spending', amount: amt, currency: cur, category: $('zt-mc').value, from: 'hand' });
                try { await putData('spending', this.spending); this.drawSpend(el); } catch (e) { toast(e.message, 'error'); }
            };
            el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
                this.spending.entries = this.spending.entries.filter(e => String(e.id) !== b.dataset.del);
                await putData('spending', this.spending); this.drawSpend(el);
            });
            el.querySelector('[data-a=photo]').onclick = () => {
                const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.capture = 'environment';
                i.onchange = async () => {
                    const f = i.files[0]; if (!f) return;
                    const btn = el.querySelector('[data-a=photo]'); btn.disabled = true; btn.textContent = 'Reading the receipt…';
                    try {
                        const img = await shrink(f, 1600);
                        const d = await call('/api/tools/receipt', { method: 'POST', body: { image: img } });
                        this.spending.entries.push(d.entry);
                        toast(`Added ${d.entry.merchant}: ${d.entry.currency} ${money(d.entry.amount)} (${d.entry.category})`, 'success');
                        this.month = String(d.entry.date).slice(0, 7);
                        this.drawSpend(el);
                    } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = '📷 Add a receipt photo'; }
                };
                i.click();
            };
            const cats = Object.keys(byCat);
            if (cats.length) loadChart().then(Ch => {
                const ink = getComputedStyle(document.body).color;
                this.charts.push(new Ch(el.querySelector('canvas'), { type: 'bar', data: { labels: cats, datasets: [{ label: 'Spent', data: cats.map(c => byCat[c]), backgroundColor: cats.map((_, i) => PAL[i % PAL.length]) }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: ink } }, y: { ticks: { color: ink } } } } }));
            }).catch(() => {});
        },
    };
    function shrink(file, max) {
        return new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.85)); }; im.onerror = () => rej(new Error('That picture couldn’t be opened')); im.src = fr.result; };
            fr.onerror = () => rej(new Error('That picture couldn’t be read')); fr.readAsDataURL(file);
        });
    }

    /* ═════════════ on every answer: simpler / deeper, translate ═════════════ */
    function decorateActions(actions, content, wrapper) {
        const more = actions.querySelector('.zr-menu-wrap');
        const lv = document.createElement('div'); lv.className = 'zr-menu-wrap';
        lv.innerHTML = '<button type="button" data-action="level" title="Explain it simpler or in more depth" aria-haspopup="menu">🎚<span>Level</span></button>' +
            '<div class="zr-menu" role="menu" hidden>' + [['child', 'Like I’m 8'], ['teen', 'Simpler'], ['adult', 'Everyday adult'], ['expert', 'In depth, like an expert']]
                .map(l => `<button type="button" role="menuitem" data-lv="${l[0]}">${l[1]}</button>`).join('') + '</div>';
        const tr = document.createElement('button'); tr.type = 'button'; tr.dataset.action = 'translate'; tr.title = 'Translate this answer';
        tr.innerHTML = '🌍<span>Translate</span>';
        actions.insertBefore(lv, more); actions.insertBefore(tr, more);
        const sm = more && more.querySelector('.zr-menu');
        if (sm) {
            const au = document.createElement('button'); au.type = 'button'; au.setAttribute('role', 'menuitem'); au.textContent = 'Audio (.mp3) — read aloud';
            au.addEventListener('click', async (e) => {
                e.stopPropagation(); sm.hidden = true;
                toast('Recording it as audio… (a few seconds)', 'info');
                try {
                    const r = await fetch('/api/tools/speech', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: content }) });
                    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || 'Couldn\u2019t make the audio'); }
                    const blob = await r.blob(); const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob); a.download = 'zelpophai-answer.' + (/wav/.test(blob.type) ? 'wav' : 'mp3');
                    document.body.appendChild(a); a.click(); a.remove();
                } catch (err) { toast(err.message, 'error'); }
            });
            sm.appendChild(au);
        }
        const menu = lv.querySelector('.zr-menu');
        lv.querySelector('[data-action=level]').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
        document.addEventListener('click', () => { menu.hidden = true; });
        menu.addEventListener('click', (e) => {
            const b = e.target.closest('[data-lv]'); if (!b) return;
            menu.hidden = true;
            const say = { child: 'Explain your last answer again as if I were 8 years old — very simple words, a fun example, short.',
                          teen: 'Explain your last answer again more simply, in plain everyday words, with one example.',
                          adult: 'Explain your last answer again for an ordinary adult — clear and practical, no jargon.',
                          expert: 'Go deeper on your last answer, for an expert: precise terms, the details and edge cases, and why.' }[b.dataset.lv];
            sendText(say);
        });
        tr.addEventListener('click', async () => {
            const old = wrapper && wrapper.querySelector('.zt-trans'); if (old) { old.remove(); return; }
            const lang = (() => { try { return localStorage.getItem('zp_tr_lang') || (myLang === 'English' ? 'French' : myLang); } catch (e) { return myLang; } })();
            const box = document.createElement('div'); box.className = 'zt-trans';
            box.innerHTML = `<div class="zt-th"><span>🌍 Translation into</span><select>${LANGS.map(l => `<option ${l === lang ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="zt-tb"><span class="zf-spin"></span></div>`;
            actions.parentNode.insertBefore(box, actions);
            const go = async (to) => {
                box.querySelector('.zt-tb').innerHTML = '<span class="zf-spin"></span>';
                try { const d = await call('/api/tools/translate', { method: 'POST', body: { text: content, to } }); md(box.querySelector('.zt-tb'), d.text); }
                catch (e) { box.querySelector('.zt-tb').textContent = e.message; }
            };
            box.querySelector('select').onchange = (e) => { try { localStorage.setItem('zp_tr_lang', e.target.value); } catch (x) {} go(e.target.value); };
            go(lang);
        });
    }

    /* ═════════════ shared chats: polls and games ═════════════ */
    function pollCard(id) {
        const el = document.createElement('div'); el.className = 'zpl-card'; el.innerHTML = '<span class="zf-spin"></span>';
        let timer = null;
        const draw = (p) => {
            const voted = p.mine !== null && p.mine !== undefined;
            el.innerHTML = `<div class="zpl-q">📊 ${esc(p.question)}</div>` + p.options.map((o, i) => {
                const pct = p.total ? Math.round(p.counts[i] / p.total * 100) : 0;
                return `<button class="zpl-o ${p.mine === i ? 'mine' : ''}" data-i="${i}" ${p.closed ? 'disabled' : ''} title="${esc(p.who[i].join(', '))}">
                    <i style="width:${voted || p.closed ? pct : 0}%"></i><span>${esc(o)}</span>${voted || p.closed ? `<b>${p.counts[i]}</b>` : ''}</button>`;
            }).join('') + `<div class="zpl-f">${p.total} vote${p.total === 1 ? '' : 's'}${p.closed ? ' · closed' : voted ? ' · tap another to change' : ' · tap to vote'}${p.owner && !p.closed ? ' · <a href="#" data-close>Close poll</a>' : ''}</div>`;
            el.querySelectorAll('[data-i]').forEach(b => b.onclick = async () => { try { draw(await call(`/api/polls/${id}/vote`, { method: 'POST', body: { option: +b.dataset.i } })); } catch (e) { toast(e.message, 'error'); } });
            const cl = el.querySelector('[data-close]'); if (cl) cl.onclick = async (e) => { e.preventDefault(); draw(await call(`/api/polls/${id}/close`, { method: 'POST' })); };
        };
        const load = async () => {
            if (!document.body.contains(el)) { if (el._seen) { clearInterval(timer); return; } }
            else el._seen = true;
            try { draw(await call(`/api/polls/${id}`)); } catch (e) { el.textContent = '📊 Poll'; clearInterval(timer); }
        };
        setTimeout(load, 0); timer = setInterval(load, 6000);
        return el;
    }
    const GAMES = [
        ['trivia', '🧠', 'Trivia quiz', 'Let’s play a trivia quiz! You are the quiz host. Ask one multiple-choice question at a time on a mix of topics, wait for answers from all of us (we each answer with our name showing), then reveal the right answer and keep a running scoreboard by name. 10 questions, then announce the winner.'],
        ['wyr', '🤔', 'Would you rather', 'Let’s play Would You Rather! Give us one fun, family-friendly “would you rather” question at a time. After we’ve all answered, react to our choices with something funny, then ask the next one.'],
        ['words', '🔤', 'Word chain', 'Let’s play a word chain game! You go first with a word; each next word must start with the last letter of the previous one, no repeats. Keep track of whose turn it is by name, call out mistakes, and keep score.'],
        ['twenty', '❓', '20 questions', 'Let’s play 20 questions! Think of something (an animal, object or famous place) and don’t tell us. We take turns asking yes/no questions; answer honestly, count the questions, and tell us who guesses it.'],
        ['story', '📖', 'Story together', 'Let’s write a story together! Start an exciting story in 3-4 sentences, then stop at a cliffhanger and ask the next person (by name) to add what happens. Take turns and weave everyone’s ideas in.'],
    ];
    function groupTools(chat) {
        const row = document.querySelector('.composer-tools .ct-scroll');
        if (!row) return;
        row.querySelectorAll('.zt-gt').forEach(e => e.remove());
        if (!chat || !chat.is_group) return;
        const mk = (id, label, icon, fn) => { const b = document.createElement('button'); b.className = 'composer-icon zt-gt'; b.type = 'button'; b.innerHTML = `<span style="font-size:15px">${icon}</span><span>${label}</span>`; b.onclick = fn; row.appendChild(b); };
        mk('poll', 'Poll', '📊', () => {
            const m = Z.modal({ id: 'zt-poll', title: 'Ask everyone', sub: 'A quick vote in this chat', icon: 'users' });
            m.body.innerHTML = `<label class="zu-l">Question</label><input class="zu-in" id="zt-pq" maxlength="300" placeholder="e.g. Where shall we eat on Saturday?">
              <label class="zu-l">Choices</label>${[0, 1, 2, 3].map(i => `<input class="zu-in zt-po" maxlength="120" placeholder="Choice ${i + 1}${i > 1 ? ' (optional)' : ''}" style="margin-bottom:6px">`).join('')}
              <button class="zu-btn pri wide" data-a="go">Post poll</button>`;
            m.body.querySelector('[data-a=go]').onclick = async () => {
                const q = $('zt-pq').value.trim(); const opts = [...m.body.querySelectorAll('.zt-po')].map(x => x.value.trim()).filter(Boolean);
                if (!q || opts.length < 2) return toast('Add a question and at least two choices', 'error');
                try { await call(`/api/chats/${chat.id}/polls`, { method: 'POST', body: { question: q, options: opts } }); m.close(); const ch = C(); if (ch) ch.renderMessages(); }
                catch (e) { toast(e.message, 'error'); }
            };
            setTimeout(() => $('zt-pq').focus(), 30);
        });
        mk('game', 'Game', '🎲', () => {
            const m = Z.modal({ id: 'zt-game', title: 'Play a game together', sub: 'Zelpophai hosts and keeps score', icon: 'trophy' });
            m.body.innerHTML = `<div class="zt-grid">${GAMES.map(g => `<button class="zt-card" data-g="${g[0]}"><span class="zt-e">${g[1]}</span><b>${esc(g[2])}</b></button>`).join('')}</div>`;
            m.body.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { m.close(); sendText(GAMES.find(g => g[0] === b.dataset.g)[3]); });
        });
    }

    window.ZTools = { Tools, Day, Reply, Money, Translate, decorateActions, pollCard, groupTools, sendText, newChatWith };
    function boot() {
        // Offline drafts: send them when the connection comes back (and on load, in case it already has).
        window.addEventListener('online', () => { const ch = C(); if (ch && ch._flushOutbox) ch._flushOutbox(); });
        setTimeout(() => { const ch = C(); if (ch && ch._flushOutbox && navigator.onLine) ch._flushOutbox(); }, 6000);
        const b = $('tools-btn');
        if (b) b.addEventListener('click', () => { Tools.open(); if (typeof closeSidebar === 'function' && window.innerWidth < 900) { try { closeSidebar(); } catch (e) {} } });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
