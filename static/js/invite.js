/* Invite friends: your link and ways to share it, progress to the reward, the friends you invited
   and where they are, and this month's leaderboard. window.ZPInvite.open() */
(function () {
  'use strict';
  const { esc, toast, call, icon, modal, ago } = window.ZUI;
  let M = null, D = null, tab = 'share';

  function shareText() { return `I've been using Zelpophai AI — it chats, writes documents, makes images and helps with code. Come and try it with my link: ${D.link}`; }
  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg || 'Copied', 'success'); }
    catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast(okMsg || 'Copied', 'success'); } catch (err) { toast('Copy failed — select the link and copy it', 'error'); } t.remove(); }
  }

  function progress() {
    return `<div class="zin-dots" aria-label="${D.toward} of ${D.required} friends">${Array.from({ length: D.required }, (_, i) => `<span class="${i < D.toward ? 'on' : ''}">${i < D.toward ? icon('check') : i + 1}</span>`).join('')}</div>
      <div class="zin-bar"><i style="width:${D.toward / D.required * 100}%"></i></div>`;
  }

  function draw() {
    M.body.querySelectorAll('.zu-tabs [data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    const el = M.body.querySelector('.zin-pane');
    if (tab === 'share') {
      el.innerHTML = `<div class="zin-hero"><div class="zin-big"><b>${D.active}</b><span>friend${D.active === 1 ? '' : 's'} joined</span></div>
          <div class="zin-next"><b>${D.left} more</b> friend${D.left === 1 ? '' : 's'} to get <b>${esc(D.reward)}</b>${D.rewards ? `<span>You've earned this ${D.rewards} time${D.rewards === 1 ? '' : 's'} so far</span>` : ''}${D.waiting ? `<span>${D.waiting} friend${D.waiting === 1 ? ' is' : 's are'} almost there</span>` : ''}</div></div>
        ${progress()}
        ${D.reward_until ? `<div class="zin-note good">${icon('gift')}<span>Your invite reward is active until <b>${new Date(D.reward_until).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</b>.</span></div>` : ''}
        ${D.lasting_plan ? `<div class="zin-note">${icon('gift')}<span>You already have a plan with no end date, so rewards don't add time — but inviting still counts for the leaderboard.</span></div>` : ''}
        <label class="zu-l" for="zin-link">Your invite link</label>
        <div class="zin-link"><input class="zu-in" id="zin-link" readonly value="${esc(D.link)}"><button class="zu-btn pri" id="zin-copy">${icon('copy')} Copy</button></div>
        <p class="zu-fine left">Each link works for one friend. A fresh one appears here as soon as they join.${D.clicks ? ` Your links have been opened <b>${D.clicks}</b> time${D.clicks === 1 ? '' : 's'}.` : ''}</p>
        <div class="zin-share"><button id="zin-native" hidden>${icon('send')} Share…</button><button data-s="wa" class="wa">WhatsApp</button><button data-s="tg" class="tg">Telegram</button><button data-s="x" class="x">X</button><button data-s="sms">Text message</button><button data-s="mail">Email</button><button data-s="msg">Copy message</button></div>
        <details class="zin-qr"><summary>Show a QR code</summary><div id="zin-qr"></div><small>Let a friend scan this with their phone camera.</small></details>
        <div class="zin-how"><h4>How it works</h4><ol><li>Send your link to a friend.</li><li>They join and send their first ${D.active_messages} messages.</li><li>Every ${D.required} friends who join gives you <b>${esc(D.reward)}</b>.</li></ol></div>`;
      el.querySelector('#zin-copy').onclick = () => copy(D.link, 'Link copied');
      el.querySelector('#zin-link').onclick = (e) => e.target.select();
      const L = encodeURIComponent(D.link), T = encodeURIComponent(shareText()), short = encodeURIComponent('Join me on Zelpophai AI:');
      const go = { wa: `https://wa.me/?text=${T}`, tg: `https://t.me/share/url?url=${L}&text=${short}`, x: `https://twitter.com/intent/tweet?text=${short}&url=${L}`, sms: `sms:?&body=${T}`, mail: `mailto:?subject=${encodeURIComponent('Try Zelpophai AI with me')}&body=${T}` };
      el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { const k = b.dataset.s; if (k === 'msg') return copy(shareText(), 'Message copied'); if (k === 'sms' || k === 'mail') location.href = go[k]; else window.open(go[k], '_blank', 'noopener'); });
      if (navigator.share) { const nb = el.querySelector('#zin-native'); nb.hidden = false; nb.onclick = () => navigator.share({ title: 'Zelpophai AI', text: 'Join me on Zelpophai AI.', url: D.link }).catch(() => {}); }
      el.querySelector('.zin-qr').addEventListener('toggle', (e) => {
        if (!e.target.open || e.target.dataset.done) return; e.target.dataset.done = '1';
        const drawQr = () => { try { new QRCode(el.querySelector('#zin-qr'), { text: D.link, width: 170, height: 170, colorDark: '#0b1020', colorLight: '#ffffff' }); } catch (err) { el.querySelector('#zin-qr').textContent = 'QR code unavailable'; } };
        if (window.QRCode) return drawQr();
        const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = drawQr; s.onerror = () => { el.querySelector('#zin-qr').textContent = 'QR code unavailable'; }; document.head.appendChild(s);
      });
    } else if (tab === 'friends') {
      const ST = { active: ['Joined', 'good'], waiting: ['Almost there', 'warn'], gone: ['Left', ''] };
      el.innerHTML = D.friends.length ? `<div class="zin-sum"><div><b>${D.joined}</b><span>signed up</span></div><div><b>${D.active}</b><span>count for rewards</span></div><div><b>${D.waiting}</b><span>almost there</span></div></div>
        <div class="zin-friends">${D.friends.map((f) => `<div class="zin-friend"><span class="zin-av">${esc(f.name[0].toUpperCase())}</span><div><b>${esc(f.name)}</b><span>${esc(f.hint)} · joined ${ago(f.joined_at)}</span></div><span class="zu-tag ${ST[f.status][1]}">${ST[f.status][0]}</span></div>`).join('')}</div>
        ${D.waiting ? `<p class="zu-fine left">Give your “almost there” friends a nudge — an invite counts once they've confirmed their email and sent ${D.active_messages} messages.</p>` : ''}`
        : `<div class="zu-empty">${icon('users')}<b>No friends yet</b><span>When someone joins with your link they show up here, and you can see when they start counting for rewards.</span><button class="zu-btn pri sm" id="zin-goshare">Share my link</button></div>`;
      const g = el.querySelector('#zin-goshare'); if (g) g.onclick = () => { tab = 'share'; draw(); };
    } else {
      el.innerHTML = `<p class="zps-lead">Top inviters in <b>${esc(D.month)}</b>. Names are partly hidden.${D.my_rank ? ` You're <b>#${D.my_rank}</b>.` : ''}</p>
        ${D.leaderboard.length ? `<div class="zin-board">${D.leaderboard.map((r, i) => `<div class="zin-rank${r.me ? ' me' : ''}"><span class="zin-pos p${i + 1}">${i < 3 ? icon('trophy') : i + 1}</span><b>${esc(r.name)}${r.me ? ' <em>you</em>' : ''}</b><span>${r.count} friend${r.count === 1 ? '' : 's'}</span></div>`).join('')}</div>`
          : `<div class="zu-empty">${icon('trophy')}<b>Nobody's on the board yet this month</b><span>Invite one friend and the top spot is yours.</span></div>`}`;
    }
  }

  async function open() {
    tab = 'share';
    M = modal({ id: 'zin', title: 'Invite friends', icon: 'gift', sub: 'Bring 5 friends to Zelpophai and get 3 days of Pro.', tall: true });
    M.body.innerHTML = '<div class="zu-load">Loading…</div>';
    try { D = await call('/api/invite/overview'); } catch (e) { M.body.innerHTML = `<div class="zu-empty"><b>Couldn't load invites</b><span>${esc(e.message)}</span></div>`; return; }
    M.body.innerHTML = `<div class="zu-tabs"><button data-t="share">Share</button><button data-t="friends">My friends${D.joined ? ` <i>${D.joined}</i>` : ''}</button><button data-t="board">Leaderboard</button></div><div class="zin-pane"></div>`;
    M.body.querySelector('.zu-tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; draw(); } };
    draw();
  }
  window.ZPInvite = { open };
})();
