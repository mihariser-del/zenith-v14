/* Voice conversation: talk to Zelpophai hands-free.
   You speak → it answers out loud, sentence by sentence as the answer arrives → it listens again.
   Tap the orb (or press Space) to interrupt. window.ZPVoice = { open, close, active, feed } */
(function () {
  'use strict';
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  const V = { active: false, el: null, rec: null, state: 'idle', muted: false, spoken: 0, queue: [], speaking: false, done: true, lastText: '', heard: '', turnT: null, started: 0, ctx: null, stream: null, raf: 0, silenceT: null };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sv = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const local = () => (typeof Settings !== 'undefined' ? Settings.getLocal() : {});
  const setLocal = (p) => { if (typeof Settings !== 'undefined') Settings.saveLocal({ ...Settings.getLocal(), ...p }); };
  const lang = () => local().speechLang || 'en-GB';

  /* ---- voices ---- */
  function voicesFor(l) {
    const all = synth ? synth.getVoices() : [];
    const base = l.split('-')[0];
    const exact = all.filter((v) => v.lang.replace('_', '-') === l), near = all.filter((v) => v.lang.replace('_', '-') !== l && v.lang.toLowerCase().startsWith(base));
    return [...exact, ...near];
  }
  function pickVoice() {
    const list = voicesFor(lang()); const want = local().voiceName;
    return list.find((v) => v.name === want) || list.find((v) => /natural|neural|online|google|premium|enhanced/i.test(v.name)) || list[0] || null;
  }
  // Used by the normal "read aloud" button too, so it follows your chosen language and voice.
  window.ZPVoicePick = pickVoice;

  /* ---- what to say: clean the text and cut it into sentences ---- */
  function clean(t) {
    return String(t || '').replace(/```[\s\S]*?(```|$)/g, ' (there is some code here, see the chat) ').replace(/<zfile[\s\S]*?(<\/zfile>|$)/gi, ' (I made a file for you, it is in the chat) ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, ' a link ').replace(/`([^`]+)`/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s*[-*+]\s+/gm, '').replace(/^\s*\|.*\|\s*$/gm, ' ').replace(/[*_~#>]/g, '').replace(/\s+/g, ' ').trim();
  }
  function feed(full, final) {
    if (!V.active) return;
    if (final) V.done = true;
    const text = clean(full);
    if (text.length < V.spoken) V.spoken = 0;
    let rest = text.slice(V.spoken);
    const re = /[^.!?。！？\n]+[.!?。！？]+["')\]]?\s+|[^.!?。！？\n]{180,}?[,;:]\s+/g; let m, used = 0;
    while ((m = re.exec(rest))) { V.queue.push(m[0].trim()); used = re.lastIndex; }
    if (final && rest.slice(used).trim()) { V.queue.push(rest.slice(used).trim()); used = rest.length; }
    V.spoken += used;
    pump();
  }
  function pump() {
    if (!V.active || V.speaking) return;
    const next = V.queue.shift();
    if (!next) { if (V.done && V.state === 'speaking') afterAnswer(); return; }
    if (!synth) { caption('ai', next); return pump(); }
    setState('speaking'); caption('ai', next);
    const u = new SpeechSynthesisUtterance(next), v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang();
    u.rate = parseFloat(local().speechRate) || 1;
    V.speaking = true;
    const end = () => { if (!V.speaking) return; V.speaking = false; clearTimeout(V.guard); pump(); };
    u.onend = end; u.onerror = end;
    V.guard = setTimeout(end, Math.max(6000, next.length * 110));   // some browsers never fire "end"
    try { synth.speak(u); } catch (e) { end(); }
  }
  function stopSpeaking() { V.queue = []; V.speaking = false; clearTimeout(V.guard); try { if (synth) synth.cancel(); } catch (e) {} }
  function afterAnswer() { if (!V.active) return; if (V.muted) setState('paused'); else listen(); }

  /* ---- listening ---- */
  function listen() {
    if (!V.active || V.muted) return;
    if (!SR) { setState('paused'); status('This browser can\'t listen. Try Chrome or Edge.'); return; }
    if (V.rec) { try { V.rec.onend = null; V.rec.abort(); } catch (e) {} }
    const r = V.rec = new SR(); r.lang = lang(); r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
    V.heard = ''; let finalText = '';
    const send = () => { clearTimeout(V.silenceT); const t = (finalText + ' ' + V.heard).replace(/\s+/g, ' ').trim(); if (!t) return; finalText = ''; V.heard = ''; try { r.onend = null; r.stop(); } catch (e) {} ask(t); };
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i]; if (res.isFinal) finalText += ' ' + res[0].transcript; else interim += res[0].transcript; }
      V.heard = interim; caption('you', (finalText + ' ' + interim).trim());
      clearTimeout(V.silenceT);
      // you stopped talking: send after a short pause
      V.silenceT = setTimeout(send, interim ? 1500 : 900);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { V.muted = true; setState('paused'); status('Zelpophai isn\'t allowed to use your microphone. Allow it in your browser (the lock icon next to the address), then tap the microphone.'); paintMute(); }
      else if (e.error === 'audio-capture') { V.muted = true; setState('paused'); status('No microphone was found on this device.'); paintMute(); }
    };
    r.onend = () => { if (V.active && V.state === 'listening' && !V.muted) { const t = (finalText + ' ' + V.heard).trim(); if (t) send(); else setTimeout(() => { if (V.active && V.state === 'listening') listen(); }, 250); } };
    setState('listening'); caption('you', '');
    try { r.start(); } catch (e) { setTimeout(() => { if (V.active && V.state === 'listening') listen(); }, 600); }
  }
  function stopListening() { clearTimeout(V.silenceT); if (V.rec) { try { V.rec.onend = null; V.rec.abort(); } catch (e) {} V.rec = null; } }

  /* ---- one turn ---- */
  async function ask(text) {
    if (!V.active) return;
    if (limitHit()) return;
    stopListening(); setState('thinking'); caption('you', text);
    V.spoken = 0; V.queue = []; V.done = false; V.turns = (V.turns || 0) + 1; const turn = V.turns;
    try {
      if (!Chat.activeId) await Chat.create();
      const input = $('user-input'); input.value = text; input.dispatchEvent(new Event('input'));
      if (typeof Voice !== 'undefined') Voice.voiceToVoice = false;
      await Chat.send();
    } catch (e) { status('Something went wrong. Tap the orb to try again.'); }
    // Safety net: if nothing was spoken at all (an error, or an answer with no text), go back to listening.
    setTimeout(function wait() {
      if (!V.active || turn !== V.turns) return;
      if (Chat.isStreaming) return setTimeout(wait, 400);
      V.done = true;
      if (!V.speaking && !V.queue.length && V.state === 'thinking') { V.queue.push('Sorry, I couldn\'t answer that just now. Please try again.'); pump(); }
      else if (!V.speaking && !V.queue.length && V.state === 'speaking') afterAnswer(); else pump();
    }, 800);
  }

  /* ---- free daily limit (same 30 minutes as before) ---- */
  function limitHit() {
    if (typeof Voice === 'undefined' || !Voice.voiceLimitReached || !Voice.voiceLimitReached()) return false;
    close();
    if (typeof showLimitPopup === 'function') showLimitPopup('Voice limit reached — 30 minutes of voice chat used today. Resets at midnight (UTC).');
    return true;
  }

  /* ---- screen ---- */
  const LABEL = { listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking — tap to interrupt', paused: 'Paused — tap the microphone to carry on', idle: '' };
  function status(t) { const s = $('zvc-status'); if (s) s.textContent = t; }
  function setState(s) { V.state = s; if (!V.el) return; V.el.dataset.state = s; status(LABEL[s] || ''); }
  function caption(who, text) {
    const you = $('zvc-you'), ai = $('zvc-ai'); if (!you) return;
    if (who === 'you') { you.textContent = text; if (text) ai.textContent = ''; }
    else ai.textContent = text;
  }
  function paintMute() { const b = $('zvc-mute'); if (!b) return; b.classList.toggle('on', V.muted); b.setAttribute('aria-pressed', V.muted); b.title = V.muted ? 'Turn the microphone on' : 'Pause the microphone'; b.querySelector('span').textContent = V.muted ? 'Unmute' : 'Mute'; }
  function tick() {
    const t = $('zvc-time'); if (!t || !V.active) return;
    const s = Math.floor((Date.now() - V.started) / 1000); let txt = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    const u = window.user || {};
    if (typeof Voice !== 'undefined' && !(u.is_pro || u.is_ultimate || u.role === 'owner') && !(u.username || '').startsWith('guest_')) txt += ` · ${Voice.voiceMinutesLeft()} min left today`;
    t.textContent = txt;
  }
  // The orb gently follows how loud you are.
  async function meter() {
    try {
      V.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AC = window.AudioContext || window.webkitAudioContext; V.ctx = new AC();
      const an = V.ctx.createAnalyser(); an.fftSize = 256; V.ctx.createMediaStreamSource(V.stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const loop = () => { if (!V.active) return; an.getByteTimeDomainData(buf); let sum = 0; for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; sum += x * x; }
        const lvl = Math.min(1, Math.sqrt(sum / buf.length) * 4); const orb = $('zvc-orb'); if (orb) orb.style.setProperty('--lvl', V.state === 'listening' ? lvl.toFixed(3) : '0'); V.raf = requestAnimationFrame(loop); };
      loop();
    } catch (e) { /* no meter: the orb still animates on its own */ }
  }

  function settingsPanel() {
    const box = $('zvc-set'); if (!box) return; box.hidden = !box.hidden; if (box.hidden) return;
    const list = voicesFor(lang()); const cur = pickVoice();
    box.innerHTML = `<label for="zvc-voice">Voice</label><select id="zvc-voice">${list.length ? list.map((v) => `<option value="${esc(v.name)}"${cur && cur.name === v.name ? ' selected' : ''}>${esc(v.name.replace(/Microsoft |Google /, ''))}</option>`).join('') : '<option>Default voice</option>'}</select>
      <label for="zvc-rate">Speed <b id="zvc-rate-l">${local().speechRate || 1}×</b></label><input type="range" id="zvc-rate" min="0.6" max="1.8" step="0.1" value="${local().speechRate || 1}">
      <button type="button" id="zvc-try">Hear this voice</button><p>The language is set in Settings → Voice.</p>`;
    $('zvc-voice').onchange = () => setLocal({ voiceName: $('zvc-voice').value });
    $('zvc-rate').oninput = () => { const v = parseFloat($('zvc-rate').value); $('zvc-rate-l').textContent = v + '×'; setLocal({ speechRate: v }); };
    $('zvc-try').onclick = () => { const was = V.state; stopListening(); stopSpeaking(); V.done = true; V.spoken = 0; V.queue = ['Hi, this is how I sound.']; setState('speaking'); pump(); void was; };
  }

  function open() {
    if (V.active) return;
    const u = window.user || {};
    if (!SR) { showToast('Voice conversation needs Chrome, Edge or Safari', 'error'); return; }
    if (limitHit()) return;
    V.active = true; V.muted = false; V.started = Date.now(); V.queue = []; V.spoken = 0; V.done = true; V.turns = 0;
    const el = V.el = document.createElement('div'); el.id = 'zvc'; el.className = 'zvc'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Voice conversation');
    el.innerHTML = `<div class="zvc-top"><span class="zvc-brand"><i>Z</i> Voice conversation</span><span class="zvc-time" id="zvc-time">0:00</span></div>
      <div class="zvc-mid"><button type="button" class="zvc-orb" id="zvc-orb" aria-label="Tap to interrupt or start listening"><span></span><span></span><span></span></button>
        <div class="zvc-status" id="zvc-status" role="status" aria-live="polite"></div>
        <div class="zvc-you" id="zvc-you"></div><div class="zvc-ai" id="zvc-ai"></div></div>
      <div class="zvc-set" id="zvc-set" hidden></div>
      <div class="zvc-bar"><button type="button" id="zvc-mute" aria-pressed="false">${sv('<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v4"/>')}<span>Mute</span></button>
        <button type="button" id="zvc-gear">${sv('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>')}<span>Voice</span></button>
        <button type="button" id="zvc-chat">${sv('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>')}<span>Show chat</span></button>
        <button type="button" id="zvc-end" class="end">${sv('<path d="M6 6l12 12M18 6L6 18"/>')}<span>End</span></button></div>
      <p class="zvc-tip">Just talk. Tap the orb or press Space to interrupt. Everything is saved in your chat.</p>`;
    document.body.appendChild(el);
    $('zvc-orb').onclick = interrupt;
    $('zvc-mute').onclick = () => { V.muted = !V.muted; paintMute(); if (V.muted) { stopListening(); if (V.state === 'listening') setState('paused'); } else if (V.state === 'paused' || V.state === 'idle') listen(); };
    $('zvc-gear').onclick = settingsPanel;
    $('zvc-chat').onclick = () => { el.classList.toggle('mini'); $('zvc-chat').querySelector('span').textContent = el.classList.contains('mini') ? 'Full screen' : 'Show chat'; };
    $('zvc-end').onclick = close;
    document.addEventListener('keydown', onKey, true);
    V.timer = setInterval(tick, 1000); tick();
    if (typeof Voice !== 'undefined') { Voice.voiceModeActive = true; if (Voice._startVoiceTimer) Voice._startVoiceTimer(); }
    if (synth) { try { synth.getVoices(); } catch (e) {} }
    void u; meter(); listen();
  }
  function interrupt() {
    if (!V.active) return;
    if (V.state === 'speaking' || V.state === 'thinking') { stopSpeaking(); V.done = true; try { if (Chat.isStreaming && Chat.abortController) Chat.abortController.abort(); } catch (e) {} V.muted = false; paintMute(); listen(); }
    else if (V.state === 'paused' || V.state === 'idle') { V.muted = false; paintMute(); listen(); }
  }
  function onKey(e) {
    if (!V.active) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.preventDefault(); e.stopPropagation(); interrupt(); }
  }
  function close() {
    if (!V.active) return;
    V.active = false; stopListening(); stopSpeaking(); clearInterval(V.timer); cancelAnimationFrame(V.raf);
    document.removeEventListener('keydown', onKey, true);
    try { if (V.stream) V.stream.getTracks().forEach((t) => t.stop()); } catch (e) {} try { if (V.ctx) V.ctx.close(); } catch (e) {} V.stream = V.ctx = null;
    if (typeof Voice !== 'undefined') { Voice.voiceModeActive = false; Voice.voiceToVoice = false; if (Voice._stopVoiceTimer) Voice._stopVoiceTimer(); }
    if (V.el) { V.el.remove(); V.el = null; }
  }

  function init() {
    // a clear button next to the microphone, instead of the hidden right-click
    const mic = $('mic-btn');
    if (mic && SR && !$('voice-chat-btn')) {
      const b = document.createElement('button'); b.className = mic.className; b.id = 'voice-chat-btn'; b.type = 'button'; b.title = 'Voice conversation — talk and listen hands-free';
      b.innerHTML = sv('<path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 11v2"/>') + '<span>Talk</span>';
      mic.parentNode.insertBefore(b, mic.nextSibling); b.addEventListener('click', open);
    }
    if (typeof Voice !== 'undefined') { Voice.openVoiceMode = open; Voice.closeVoiceMode = close; }
  }
  window.ZPVoice = { open, close, feed, init, get active() { return V.active; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0)); else setTimeout(init, 0);
})();
