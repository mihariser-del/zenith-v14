/* Tools, part two (26.4): recipes from your fridge, exam revision planner,
   language lessons, story mode, logo & poster maker, CV and job matcher,
   spreadsheet helper, characters, music, invoices & quotes, meeting notes and
   rewards. Most of these are a short form that sets Zelpophai up with a
   carefully written request; invoices, meeting notes, music and rewards have
   their own server parts in tools.py. */
(function () {
    'use strict';
    const T = window.ZTools, Z = window.ZUI;
    if (!T || !Z) return;
    const $ = (id) => document.getElementById(id);
    const esc = (s) => Z.esc(s);
    const toast = (m, t) => Z.toast(m, t);
    const call = (p, o) => Z.call(p, o);
    const C = () => (typeof Chat !== 'undefined' ? Chat : null);
    const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } };
    const val = (id) => (($(id) || {}).value || '').trim();
    const opts = (a, sel) => a.map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');

    function form(id, title, sub, icon, html, go, btn) {
        const m = Z.modal({ id, title, sub, icon, wide: true });
        m.body.innerHTML = html + `<button class="zu-btn pri wide" data-a="go">${btn || 'Start'}</button>`;
        m.body.querySelector('[data-a=go]').onclick = async (e) => {
            const b = e.currentTarget; b.disabled = true;
            try { const r = await go(m, b); if (r !== false) m.close(); }
            catch (err) { toast(err.message || 'Something went wrong', 'error'); }
            b.disabled = false;
        };
        const first = m.body.querySelector('input,textarea'); if (first) setTimeout(() => first.focus(), 40);
        return m;
    }
    // Start a new chat, attach files, then send the request.
    async function chatWithFiles(files, text, body) {
        const ch = C(); if (!ch) return;
        await T.newChatWith('', body);
        await new Promise(r => setTimeout(r, 350));
        if (files && files.length) {
            ch.handleFiles(files);
            for (let i = 0; i < 100 && ch._reading > 0; i++) await new Promise(r => setTimeout(r, 100));
        }
        T.sendText(text);
    }
    const fileInput = (id, accept, label) => `<label class="zu-l">${label}</label><input type="file" class="zu-in" id="${id}" accept="${accept}">`;
    const filesOf = (id) => ($(id) && $(id).files) ? [...$(id).files] : [];

    /* ── Everyday ── */
    function recipes() {
        form('zt-rec', 'Recipe from your fridge', 'Tell me what you have — or snap a photo of it', 'spark',
            fileInput('zt-rph', 'image/*', 'Photo of your fridge or cupboard <em>(optional)</em>') +
            `<label class="zu-l">What you have <em>(optional if you added a photo)</em></label><textarea class="zu-in" id="zt-rhave" rows="3" placeholder="e.g. rice, eggs, tomatoes, onions, half a cabbage, chicken"></textarea>
             <div class="zw-two"><div><label class="zu-l">For how many?</label><input class="zu-in" id="zt-rn" type="number" min="1" value="2"></div>
             <div><label class="zu-l">Time</label><select class="zu-in" id="zt-rt">${opts(['Under 20 minutes', 'About 30 minutes', 'An hour is fine'])}</select></div>
             <div><label class="zu-l">Diet</label><select class="zu-in" id="zt-rd">${opts(['Anything', 'Vegetarian', 'Vegan', 'Halal', 'No pork', 'Gluten-free', 'Low sugar'])}</select></div></div>`,
            async () => {
                const ph = filesOf('zt-rph'), have = val('zt-rhave');
                if (!ph.length && !have) throw new Error('Add a photo or list what you have');
                await chatWithFiles(ph, `Suggest 3 recipes I can make ${ph.length ? 'with what you can see in my photo' : ''}${have ? (ph.length ? ' plus: ' : 'with: ') + have : ''}. ` +
                    `For ${val('zt-rn') || 2} people, ${val('zt-rt').toLowerCase()}, diet: ${val('zt-rd')}. For each: name, why it works, ingredients (mark anything I'd need to buy), and short numbered steps. ` +
                    'Then ask which one I want and give me a shopping list for anything missing.');
            }, 'Find recipes');
    }

    /* ── Learn ── */
    function exams() {
        const m = form('zt-exam', 'Exam revision planner', 'A day-by-day plan up to your exams — plus flashcards for each subject', 'cap',
            `<label class="zu-l">Your exams <em>— one per line: subject, date</em></label>
             <textarea class="zu-in" id="zt-ex" rows="5" placeholder="Maths, 12 December\nBiology, 15 December\nHistory, 18 December"></textarea>
             <div class="zw-two"><div><label class="zu-l">Hours a day you can revise</label><input class="zu-in" id="zt-eh" type="number" min="0.5" step="0.5" value="2"></div>
             <div><label class="zu-l">Level</label><select class="zu-in" id="zt-el">${opts(['Primary', 'Secondary (O-level / GCSE)', 'A-level / high school', 'University', 'Professional exam'], 'Secondary (O-level / GCSE)')}</select></div></div>
             <label class="zu-l">Weak spots <em>(optional)</em></label><input class="zu-in" id="zt-ew" placeholder="e.g. algebra, cell biology">
             <label class="zw-check"><input type="checkbox" id="zt-ed" checked> Also make a flashcard deck for each subject in Study</label>`,
            async (mm, b) => {
                const ex = val('zt-ex'); if (!ex) throw new Error('List your exams first');
                const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                if ($('zt-ed').checked) {
                    b.textContent = 'Making flashcards…';
                    const subs = ex.split('\n').map(l => l.split(',')[0].trim()).filter(Boolean).slice(0, 8);
                    for (const s of subs) { try { await call('/api/study/decks', { method: 'POST', body: { topic: `${s} — key facts for ${val('zt-el')} exams${val('zt-ew') ? ' (focus on ' + val('zt-ew') + ')' : ''}`, count: 20, title: s + ' revision', source: 'Exam planner' } }); } catch (e) { toast(s + ': ' + e.message, 'error'); break; } }
                }
                await T.newChatWith(`Today is ${today}. Make me an exam revision timetable. My exams:\n${ex}\nI can revise ${val('zt-eh') || 2} hours a day. Level: ${val('zt-el')}.${val('zt-ew') ? ' My weak spots: ' + val('zt-ew') + '.' : ''}\n` +
                    'Put the timetable in a canvas: day by day until the last exam, short focused sessions with breaks, more time for nearer exams and weak spots, a rest day each week, and past-paper practice in the final days. ' +
                    `Then give me 5 revision tips.${$('zt-ed').checked ? ' (Flashcard decks for each subject are already in my Study — remind me to review them daily.)' : ''}`);
            }, 'Make my plan');
        return m;
    }
    async function lessons() {
        const prefs = (await call('/api/tools/data/prefs').catch(() => ({}))).value || {};
        const L = prefs.lesson || {};
        form('zt-lang', 'Language lessons', L.count ? `Lesson ${L.count + 1} of ${L.lang} · 🔥 ${L.streak || 1}-day streak` : 'A short lesson every day, with speaking practice', 'spark',
            `<div class="zw-two"><div><label class="zu-l">Language</label><select class="zu-in" id="zt-ll">${opts(['French', 'Spanish', 'English', 'Swahili', 'Luganda', 'Arabic', 'German', 'Portuguese', 'Chinese (Mandarin)', 'Italian', 'Japanese', 'Korean', 'Yoruba', 'Kinyarwanda'], L.lang || 'French')}</select></div>
             <div><label class="zu-l">Level</label><select class="zu-in" id="zt-lv">${opts(['Complete beginner', 'Beginner', 'Intermediate', 'Advanced'], L.level || 'Beginner')}</select></div></div>
             <label class="zu-l">Today I want to practise <em>(optional)</em></label><input class="zu-in" id="zt-lt" placeholder="e.g. ordering food, talking about my family, past tense">
             <p class="zw-fine">Tip: tap 🎤 Talk in the chat to practise speaking out loud — Zelpophai answers aloud too.</p>`,
            async () => {
                const today = new Date().toISOString().slice(0, 10), yest = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
                const same = L.lang === val('zt-ll');
                const n = (same ? (L.count || 0) : 0) + 1;
                const streak = same && L.last === today ? (L.streak || 1) : same && L.last === yest ? (L.streak || 1) + 1 : 1;
                prefs.lesson = { lang: val('zt-ll'), level: val('zt-lv'), count: n, last: today, streak };
                try { await call('/api/tools/data/prefs', { method: 'PUT', body: { value: prefs } }); } catch (e) {}
                await T.newChatWith(`Give me lesson ${n} in ${val('zt-ll')} (${val('zt-lv').toLowerCase()}).${val('zt-lt') ? ' Topic: ' + val('zt-lt') + '.' : ''} ` +
                    'Structure: 1) 6-8 new words/phrases in a table with pronunciation and meaning, 2) one short grammar point with 3 examples, 3) a tiny dialogue, ' +
                    '4) then practise with me — ask me one question at a time in the language, correct my answers gently (show the correct version), and finish with a 5-question quiz and my score. ' +
                    'Keep it fun, about 10 minutes.');
                if (streak > 1) toast(`🔥 ${streak}-day language streak!`, 'success');
            }, 'Start today’s lesson');
    }

    /* ── Create ── */
    function story() {
        form('zt-story', 'Story mode', 'Write a story together, chapter by chapter, with a picture for each', 'book',
            `<label class="zu-l">What's it about?</label><textarea class="zu-in" id="zt-si" rows="3" placeholder="e.g. a girl in Jinja who finds a talking fish that grants one wish a day"></textarea>
             <div class="zw-two"><div><label class="zu-l">For</label><select class="zu-in" id="zt-sa">${opts(['Young children (3-6)', 'Children (7-11)', 'Teens', 'Adults'], 'Children (7-11)')}</select></div>
             <div><label class="zu-l">Kind of story</label><select class="zu-in" id="zt-sg">${opts(['Adventure', 'Funny', 'Fairy tale', 'Mystery', 'Bedtime (calm)', 'Science fiction', 'Christmas'])}</select></div>
             <div><label class="zu-l">Chapters</label><select class="zu-in" id="zt-sc">${opts(['3', '5', '8'], '5')}</select></div></div>
             <label class="zw-check"><input type="checkbox" id="zt-sp" checked> A picture for each chapter</label>`,
            async () => {
                const idea = val('zt-si'); if (!idea) throw new Error('Tell me what the story is about');
                await T.newChatWith(`Let's write a ${val('zt-sg').toLowerCase()} story together for ${val('zt-sa').toLowerCase()}, in ${val('zt-sc')} chapters. Idea: ${idea}\n` +
                    `Write ONE chapter at a time (300-450 words), with a chapter title${$('zt-sp').checked ? ', and a picture for the chapter (one image, same art style and same-looking characters every time)' : ''}. ` +
                    'At the end of each chapter, stop and give me 3 choices for what happens next as buttons (plus I can type my own idea). After the last chapter, put the whole story together in a canvas with a title, so I can download it as a book.');
            }, 'Start the story');
    }
    function logo() {
        form('zt-logo', 'Logo & poster maker', 'Logos, posters, flyers, invitations and social posts', 'palette',
            `<div class="zw-two"><div><label class="zu-l">What are you making?</label><select class="zu-in" id="zt-lk">${opts(['Logo', 'Poster', 'Flyer', 'Social media post', 'Invitation', 'Business card', 'Banner'])}</select></div>
             <div><label class="zu-l">Style</label><select class="zu-in" id="zt-ls">${opts(['Modern and clean', 'Bold and colourful', 'Elegant', 'Playful', 'Vintage', 'African print inspired', 'Minimal'])}</select></div></div>
             <label class="zu-l">Name / main words <em>(short — the picture shows these)</em></label><input class="zu-in" id="zt-lt" placeholder="e.g. Mama's Bakery" maxlength="80">
             <label class="zu-l">What it's for, and anything else to show</label><textarea class="zu-in" id="zt-ld" rows="3" placeholder="e.g. a bakery in Kampala, warm and friendly, a loaf and a croissant, opening 1 December"></textarea>
             <label class="zu-l">Colours <em>(optional)</em></label><input class="zu-in" id="zt-lc" placeholder="e.g. orange and brown">
             <p class="zw-fine">Pictures made by AI sometimes misspell words. If the text isn't perfect, ask for a version with no text and add the words yourself, or just say “fix the spelling”.</p>`,
            async () => {
                const k = val('zt-lk'), shape = /Logo|Business card/.test(k) ? 'square' : /Banner|Social/.test(k) ? 'wide' : 'tall';
                if (!val('zt-lt') && !val('zt-ld')) throw new Error('Add the name or say what it’s for');
                await T.newChatWith(`Design a ${k.toLowerCase()} for me. Style: ${val('zt-ls').toLowerCase()}.${val('zt-lt') ? ' The words to show: "' + val('zt-lt') + '".' : ''} ${val('zt-ld')}${val('zt-lc') ? ' Colours: ' + val('zt-lc') + '.' : ''} ` +
                    `Make the picture (${shape} shape), professional, with the words spelt exactly right. Then give me 2 ideas for variations I could ask for.`);
            }, 'Design it');
    }
    function characters() {
        const CH = [
            ['🏴‍☠️', 'A pirate captain', 'a jolly, adventurous pirate captain from the 1700s'], ['🕵️', 'A detective', 'a sharp, witty detective solving a mystery with me'],
            ['🐉', 'A friendly dragon', 'a wise, friendly old dragon'], ['🛸', 'An alien visitor', 'a curious alien visiting Earth for the first time'],
            ['🏰', 'A medieval knight', 'a brave medieval knight'], ['🧪', 'Albert Einstein', 'Albert Einstein, the physicist (historical role-play)'],
            ['👑', 'Queen Nzinga', 'Queen Nzinga of Ndongo and Matamba (historical role-play)'], ['🔭', 'Galileo', 'Galileo Galilei (historical role-play)'],
            ['🏺', 'Cleopatra', 'Cleopatra, queen of Egypt (historical role-play)'], ['⚽', 'A football coach', 'an energetic football coach'],
        ];
        const m = Z.modal({ id: 'zt-char', title: 'Characters', sub: 'Chat with a character for fun or to learn — it’s role-play, not the real person', icon: 'smile', wide: true });
        m.body.innerHTML = `<div class="zt-grid">${CH.map((c, i) => `<button class="zt-card" data-i="${i}"><span class="zt-e">${c[0]}</span><b>${esc(c[1])}</b></button>`).join('')}</div>
            <label class="zu-l">Or describe your own</label><div class="zw-row"><input class="zu-in" id="zt-cc" placeholder="e.g. a grumpy cat who runs a café"><button class="zu-btn pri" data-a="own">Start</button></div>`;
        const go = (who) => {
            m.close();
            T.newChatWith(`Let's do a role-play. You are ${who}. Stay in character: speak the way they would, with their knowledge and personality, and keep replies lively and fairly short. ` +
                'For a real historical person, stay true to the facts of their life and times, and say "I don\'t know" about things after their time. ' +
                'Start by introducing yourself in character and asking me a question. If I ask something serious (health, safety, real advice), step out of character to help properly.');
        };
        m.body.querySelectorAll('[data-i]').forEach(b => b.onclick = () => go(CH[+b.dataset.i][2]));
        m.body.querySelector('[data-a=own]').onclick = () => { const v = val('zt-cc'); if (v) go(v); };
    }
    function music() {
        const m = form('zt-music', 'Make music', 'Background tracks, jingles and songs from a description', 'spark',
            `<label class="zu-l">Describe the music</label><textarea class="zu-in" id="zt-mp" rows="3" placeholder="e.g. calm afrobeat background music for a cooking video, with guitar and soft drums"></textarea>
             <div class="zw-two"><div><label class="zu-l">Style <em>(optional)</em></label><input class="zu-in" id="zt-ms" placeholder="e.g. afrobeat, lo-fi, gospel, jazz"></div>
             <div><label class="zu-l">Mood <em>(optional)</em></label><input class="zu-in" id="zt-mm" placeholder="e.g. happy, relaxing, epic"></div>
             <div><label class="zu-l">Length</label><select class="zu-in" id="zt-ml"><option value="clip">30-second clip</option><option value="song">Full song</option></select></div></div>
             <label class="zw-check"><input type="checkbox" id="zt-mi" checked> Instrumental (no singing)</label>
             <textarea class="zu-in" id="zt-my" rows="4" placeholder="Lyrics, if you want singing" hidden></textarea>
             <div class="zt-player"></div>`,
            async (mm, b) => {
                const p = val('zt-mp'); if (!p) throw new Error('Describe the music you want');
                b.textContent = 'Composing… (this can take a minute)';
                const d = await call('/api/tools/music', { method: 'POST', body: { prompt: p, style: val('zt-ms'), mood: val('zt-mm'), length: val('zt-ml'), instrumental: $('zt-mi').checked, lyrics: val('zt-my') } });
                const box = mm.body.querySelector('.zt-player');
                box.innerHTML = `<audio controls src="${esc(d.url)}" style="width:100%;margin-top:12px"></audio><div class="zw-row"><a class="zu-btn sm" href="${esc(d.url)}" download>Download</a>${d.left != null ? `<span class="zw-fine">${d.left} left today</span>` : ''}</div>`;
                box.querySelector('audio').play().catch(() => {});
                b.textContent = 'Make another';
                return false;          // keep the window open to listen
            }, 'Make music');
        m.body.querySelector('#zt-mi').onchange = (e) => { $('zt-my').hidden = e.target.checked; };
    }

    /* ── Work ── */
    function cv() {
        form('zt-cv', 'CV & job matcher', 'See how well you match a job — then get a CV and cover letter tailored to it', 'briefcase',
            `<label class="zu-l">The job advert</label><textarea class="zu-in" id="zt-job" rows="6" placeholder="Paste the job description (or a link to it)"></textarea>` +
            fileInput('zt-cvf', '.pdf,.docx,.txt,.md', 'Your CV (PDF or Word)') +
            `<label class="zu-l">…or paste your CV</label><textarea class="zu-in" id="zt-cvt" rows="4"></textarea>`,
            async () => {
                const job = val('zt-job'), f = filesOf('zt-cvf'), cvt = val('zt-cvt');
                if (!job) throw new Error('Paste the job advert');
                if (!f.length && !cvt) throw new Error('Add your CV');
                await chatWithFiles(f, `Here is a job advert:\n\n${job}\n\n${cvt ? 'My CV:\n' + cvt + '\n\n' : 'My CV is attached.\n\n'}` +
                    '1) Score how well I match (0-100%) with a short table: what matches, what\'s missing, keywords to add. ' +
                    '2) Put a tailored version of my CV in a canvas — keep everything true (never invent jobs, degrees or skills), reorder and reword to fit this job. ' +
                    '3) Put a matching cover letter (under 350 words) in a second canvas. 4) Give me 3 likely interview questions for this job.');
            }, 'Match me');
    }
    function sheet() {
        form('zt-sheet', 'Spreadsheet helper', 'Ask questions about an Excel or CSV file in plain words — get answers and charts', 'spark',
            fileInput('zt-shf', '.xlsx,.xls,.csv,.tsv', 'Your spreadsheet') +
            `<label class="zu-l">What do you want to know?</label><textarea class="zu-in" id="zt-shq" rows="3" placeholder="e.g. Which month sold the most? Show sales by product as a chart. Find duplicates."></textarea>`,
            async () => {
                const f = filesOf('zt-shf'); if (!f.length) throw new Error('Choose a spreadsheet');
                await chatWithFiles(f, (val('zt-shq') || 'Give me a quick summary of this spreadsheet: what it contains, totals and averages that matter, anything unusual, and one useful chart.') +
                    ' Work it out with real code on the attached file so the numbers are exact, and show a chart if it helps.');
            }, 'Analyse it');
    }
    function invoice() {
        const m = Z.modal({ id: 'zt-inv', title: 'Invoices & quotes', sub: 'A tidy PDF with the sums done for you', icon: 'pen', wide: true, tall: true });
        let saved = {};
        call('/api/tools/data/prefs').then(d => { saved = (d.value || {}); const b = saved.business || {}; if (b.name) { $('zt-ib').value = b.name; $('zt-ibd').value = b.details || ''; $('zt-icur').value = b.currency || ''; } }).catch(() => {});
        const row = (d = '', q = 1, p = '') => `<div class="zt-cost zt-line"><input class="zu-in" placeholder="Item or service" value="${esc(d)}"><input class="zu-in" type="number" min="0" step="any" value="${q}" title="Quantity"><input class="zu-in" type="number" min="0" step="any" placeholder="Price" value="${p}"><button class="zu-btn sm ghost" data-x>✕</button></div>`;
        m.body.innerHTML = `<div class="zs-tabs">${['invoice', 'quote', 'receipt'].map((k, i) => `<button data-k="${k}" class="${i ? '' : 'on'}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
            <div class="zw-two"><div><label class="zu-l">Your business</label><input class="zu-in" id="zt-ib" placeholder="Business name"><textarea class="zu-in" id="zt-ibd" rows="3" placeholder="Address, phone, email, TIN…" style="margin-top:6px"></textarea></div>
            <div><label class="zu-l">Customer</label><input class="zu-in" id="zt-ic" placeholder="Customer name"><textarea class="zu-in" id="zt-icd" rows="3" placeholder="Their address or contact (optional)" style="margin-top:6px"></textarea></div></div>
            <div class="zw-two"><div><label class="zu-l">Number <em>(blank = next one)</em></label><input class="zu-in" id="zt-in"></div><div><label class="zu-l">Date</label><input class="zu-in" type="date" id="zt-id" value="${new Date().toISOString().slice(0, 10)}"></div>
            <div><label class="zu-l">Due / valid until</label><input class="zu-in" type="date" id="zt-idue"></div><div style="max-width:110px"><label class="zu-l">Currency</label><input class="zu-in" id="zt-icur" placeholder="UGX" maxlength="5"></div></div>
            <label class="zu-l">Items</label><div id="zt-lines">${row()}</div><button class="zu-btn sm" data-a="add">+ Add a line</button>
            <div class="zw-two"><div><label class="zu-l">Tax %</label><input class="zu-in" type="number" min="0" step="any" id="zt-itax" value="0"></div><div><label class="zu-l">Discount</label><input class="zu-in" type="number" min="0" step="any" id="zt-idisc" value="0"></div></div>
            <label class="zu-l">Notes <em>(payment details, terms…)</em></label><textarea class="zu-in" id="zt-inotes" rows="2" placeholder="e.g. Pay by mobile money to 07xx xxx xxx within 14 days"></textarea>
            <div class="zt-sum" id="zt-itot"></div>
            <div class="zw-row"><button class="zu-btn pri" data-a="pdf">Download PDF</button><button class="zu-btn" data-a="docx">Download Word</button></div>`;
        let kind = 'invoice';
        const lines = () => [...m.body.querySelectorAll('.zt-line')].map(r => { const i = r.querySelectorAll('input'); return { desc: i[0].value, qty: +i[1].value || 0, price: +i[2].value || 0 }; }).filter(l => l.desc.trim());
        const total = () => {
            const sub = lines().reduce((n, l) => n + Math.round(l.qty * l.price * 100) / 100, 0), disc = +val('zt-idisc') || 0, tax = (sub - disc) * (+val('zt-itax') || 0) / 100;
            const c = val('zt-icur'), f = (x) => (Math.round(x * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            $('zt-itot').innerHTML = `<div><span>Subtotal</span><b>${esc(c)} ${f(sub)}</b></div>${tax ? `<div><span>Tax</span><b>${esc(c)} ${f(tax)}</b></div>` : ''}<div class="good"><span>Total</span><b>${esc(c)} ${f(sub - disc + tax)}</b></div>`;
        };
        m.body.addEventListener('input', total); total();
        m.body.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { kind = b.dataset.k; m.body.querySelectorAll('[data-k]').forEach(x => x.classList.toggle('on', x === b)); });
        m.body.querySelector('[data-a=add]').onclick = () => { $('zt-lines').insertAdjacentHTML('beforeend', row()); };
        m.body.addEventListener('click', (e) => { const x = e.target.closest('[data-x]'); if (x && m.body.querySelectorAll('.zt-line').length > 1) { x.closest('.zt-line').remove(); total(); } });
        const make = async (fmt, b) => {
            if (!lines().length) return toast('Add at least one item', 'error');
            b.disabled = true;
            try {
                saved.business = { name: val('zt-ib'), details: val('zt-ibd'), currency: val('zt-icur') };
                const r = await fetch('/api/tools/invoice', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                    kind, business: val('zt-ib'), business_details: val('zt-ibd'), client: val('zt-ic'), client_details: val('zt-icd'), number: val('zt-in'),
                    date: val('zt-id') ? new Date(val('zt-id')).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '',
                    due: val('zt-idue') ? new Date(val('zt-idue')).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '',
                    currency: val('zt-icur'), items: lines(), tax_rate: +val('zt-itax') || 0, discount: +val('zt-idisc') || 0, notes: val('zt-inotes'), fmt }) });
                if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || 'Couldn’t make it'); }
                const blob = await r.blob(), no = r.headers.get('X-Number') || kind;
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${no}.${fmt}`; document.body.appendChild(a); a.click(); a.remove();
                // remember the business details (and the next number) for next time
                const p = (await call('/api/tools/data/prefs')).value || {}; p.business = saved.business;
                await call('/api/tools/data/prefs', { method: 'PUT', body: { value: p } });
                toast(`${no} downloaded`, 'success');
            } catch (e) { toast(e.message, 'error'); }
            b.disabled = false;
        };
        m.body.querySelector('[data-a=pdf]').onclick = (e) => make('pdf', e.currentTarget);
        m.body.querySelector('[data-a=docx]').onclick = (e) => make('docx', e.currentTarget);
    }
    function meeting() {
        const m = Z.modal({ id: 'zt-meet', title: 'Meeting notes', sub: 'Record a meeting or upload a recording — get a summary, decisions and to-dos', icon: 'users', wide: true });
        m.body.innerHTML = `<div class="zt-rec"><button class="zu-btn pri" data-a="rec">🎙️ Start recording</button><span class="zt-rect"></span></div>
            <p class="zw-fine">Recording uses this device's microphone; keep this window open until you press Stop. Ask everyone's OK before recording a meeting.</p>
            <label class="zu-l">…or upload a recording <em>(audio or video, up to 100 MB)</em></label><input type="file" class="zu-in" id="zt-mf" accept="audio/*,video/*">
            <label class="zu-l">Meeting name <em>(optional)</em></label><input class="zu-in" id="zt-mt" placeholder="e.g. Weekly team meeting">
            <div class="zt-mout"></div>`;
        let rec = null, chunks = [], t0 = 0, tick = null;
        const status = (t) => { m.body.querySelector('.zt-rect').textContent = t; };
        const process = async (blob, name) => {
            const out = m.body.querySelector('.zt-mout');
            out.innerHTML = '<div class="zt-loading"><span class="zf-spin"></span> Uploading…</div>';
            try {
                const fd = new FormData(); fd.append('file', new File([blob], name, { type: blob.type || 'audio/webm' }));
                const up = await fetch('/api/files/upload', { method: 'POST', credentials: 'same-origin', body: fd });
                const u = await up.json().catch(() => ({})); if (!up.ok) throw new Error(u.detail || 'Upload failed');
                out.innerHTML = '<div class="zt-loading"><span class="zf-spin"></span> Listening and writing the notes… (about a minute for every 10 minutes of meeting)</div>';
                const d = await call('/api/tools/meeting', { method: 'POST', body: { file_id: u.file.id, title: val('zt-mt') } });
                out.innerHTML = `<div class="zt-brief"></div><details class="zt-tx"><summary>Full transcript</summary><pre></pre></details><div class="zw-row"><button class="zu-btn pri sm" data-a="canvas">Open in Canvas</button><button class="zu-btn sm" data-a="copy">Copy notes</button></div>`;
                T && window.ZRender ? ZRender.render(out.querySelector('.zt-brief'), d.notes, { inner: true }) : (out.querySelector('.zt-brief').textContent = d.notes);
                out.querySelector('pre').textContent = d.transcript;
                out.querySelector('[data-a=copy]').onclick = async (e) => { try { await navigator.clipboard.writeText(d.notes); } catch (x) {} e.target.textContent = 'Copied ✓'; };
                out.querySelector('[data-a=canvas]').onclick = async () => {
                    const cv = (await call('/api/canvas', { method: 'POST', body: { title: d.title + ' — notes', content: `# ${d.title}\n\n${d.notes}\n\n---\n\n## Transcript\n\n${d.transcript}` } })).canvas;
                    m.close(); if (window.ZCanvas) ZCanvas.show(cv);
                };
            } catch (e) { out.innerHTML = `<p class="zw-empty">${esc(e.message)}</p>`; }
        };
        m.body.querySelector('[data-a=rec]').onclick = async (e) => {
            const b = e.currentTarget;
            if (rec) { rec.stop(); return; }
            let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (x) { return toast('The microphone is blocked — allow it in your browser settings', 'error'); }
            chunks = []; rec = new MediaRecorder(stream);
            rec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
            rec.onstop = () => { clearInterval(tick); stream.getTracks().forEach(t => t.stop()); b.textContent = '🎙️ Start recording'; status(''); const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' }); rec = null; process(blob, 'meeting.' + (/ogg/.test(blob.type) ? 'ogg' : 'webm')); };
            rec.start(5000); t0 = Date.now(); b.textContent = '⏹ Stop and make notes';
            tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); status(`● Recording ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`); if (s >= 7200) rec && rec.stop(); }, 500);
        };
        m.body.querySelector('#zt-mf').onchange = (e) => { const f = e.target.files[0]; if (f) process(f, f.name); };
        m.onClose = () => { if (rec) { try { rec.stop(); } catch (x) {} } };
    }

    /* ── Fun ── */
    async function rewards() {
        const m = Z.modal({ id: 'zt-rew', title: 'Rewards', sub: 'Badges for the things you do with Zelpophai', icon: 'trophy', wide: true });
        m.body.innerHTML = '<div class="zt-loading"><span class="zf-spin"></span></div>';
        try {
            const d = await call('/api/tools/rewards?tz=' + encodeURIComponent(tz()));
            const xmas = (() => { try { return parseInt(localStorage.getItem('zp_xmas_caught') || '0', 10); } catch (e) { return 0; } })();
            m.body.innerHTML = `<div class="zt-lvl"><div class="zt-lvn">Level ${d.level}</div><div class="zt-xp"><i style="width:${Math.round(d.into / d.need * 100)}%"></i></div><small>${d.into} / ${d.need} points to level ${d.level + 1} · ${d.earned} of ${d.total} badges${d.streak ? ' · 🔥 ' + d.streak + '-day study streak' : ''}${xmas ? ' · 🎄 ' + xmas + ' baubles' : ''}</small></div>
              <div class="zt-badges">${d.badges.map(b => `<div class="zt-badge ${b.got ? 'got' : ''}"><span>${b.icon}</span><b>${esc(b.name)}</b><small>${esc(b.how)}</small></div>`).join('')}</div>
              <p class="zw-fine">Points come from chatting, studying, daily streaks and badges. Keep going!</p>`;
        } catch (e) { m.body.innerHTML = `<p class="zw-empty">${esc(e.message)}</p>`; }
    }

    T.Tools.extra.push(
        ['recipes', '🍳', 'Recipe from your fridge', 'Snap your fridge or list what you have — get recipes and a shopping list.', 'Everyday', recipes],
        ['exams', '🗓️', 'Exam revision planner', 'A day-by-day timetable up to your exams, with flashcards for each subject.', 'Learn', exams],
        ['lessons', '🗣️', 'Language lessons', 'A 10-minute lesson every day with practice, corrections and a streak.', 'Learn', lessons],
        ['story', '📖', 'Story mode', 'Write a story together, chapter by chapter, with pictures — then download it as a book.', 'Create', story],
        ['logo', '🎨', 'Logo & poster maker', 'Logos, posters, flyers, invitations and social posts.', 'Create', logo],
        ['music', '🎵', 'Make music', 'Background tracks, jingles and songs from a description.', 'Create', music],
        ['cv', '📄', 'CV & job matcher', 'Your match score, a tailored CV and a cover letter for a job advert.', 'Work', cv],
        ['sheet', '📊', 'Spreadsheet helper', 'Ask questions about an Excel or CSV file and get answers and charts.', 'Work', sheet],
        ['invoice', '🧾', 'Invoices & quotes', 'A tidy PDF invoice, quote or receipt with the sums done for you.', 'Work', invoice],
        ['meeting', '🎙️', 'Meeting notes', 'Record or upload a meeting — get a summary, decisions and to-dos.', 'Work', meeting],
        ['characters', '🎭', 'Characters', 'Chat with a pirate, a detective, a dragon or a figure from history.', 'Fun', characters],
        ['rewards', '🏆', 'Rewards', 'Your badges, level and streaks.', 'Fun', rewards],
    );
    Object.assign(T, { recipes, exams, lessons, story, logo, music, cv, sheet, invoice, meeting, characters, rewards });
})();
