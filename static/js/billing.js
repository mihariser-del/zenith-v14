const Billing = {
    plans: null,
    async loadPlans() {
        try {
            const data = await api('/api/billing/plans');
            this.plans = data.plans;
            return data.plans;
        } catch { return []; }
    },
    async showUpgrade(reason) {
        if (window.__modalOpen) return; // a limit popup or another billing modal is already open
        window.__modalOpen = true;
        const plans = this.plans || await this.loadPlans();
        const modal = document.createElement('div');
        modal.className = 'modal zp-modal';
        modal.style.display = 'flex';
        modal.style.zIndex = '10000'; // above share (700) / invite (9999) modals so guest popups are never hidden
        modal.style.background = 'rgba(10,3,22,.86)';
        const isGuest = (reason && reason.includes('Guest')) || (window.user && window.user.username && window.user.username.startsWith('guest_'));
        const isLimit = reason && (reason.includes('limit') || reason.includes('reached') || reason.includes('pause') || reason.includes('Free limit') || reason.includes('Guest limit'));
        const title = isGuest ? 'Login Required' : (isLimit ? 'Upgrade to Continue' : 'Choose Your Plan');
        const sub = isGuest ? 'Guests have limited access.' : (isLimit ? reason : 'Unlock Pro and Ultimate for unlimited features.');
        const proMonthly = plans.find(p=>p.id==='pro_monthly') || {price:5.99};
        const proAnnual = plans.find(p=>p.id==='pro_annual') || {price:59.99};
        const proLifetime = plans.find(p=>p.id==='pro_lifetime') || {price:200};
        const ultMonthly = plans.find(p=>p.id==='ultimate_monthly') || {price:11.99};
        const ultAnnual = plans.find(p=>p.id==='ultimate_annual') || {price:119.99};
        const ultLifetime = plans.find(p=>p.id==='ultimate_lifetime') || {price:400};
        let activeTab = 'monthly';
        const planCard = (name, cls, price, priceNote, badgeTxt, badgeCls, featNote, feats, btnTxt, btnCls, planId) => `
            <div class="zp-plan ${cls}">
                ${badgeTxt ? `<div class="zp-badge ${badgeCls}">${badgeTxt}</div>` : ''}
                <div class="zp-name">${name}</div>
                <div class="zp-price">${price}<small>${priceNote}</small></div>
                <div class="zp-feat-note">${featNote}</div>
                <ul class="zp-feats">${feats.map(f => `<li>${f}</li>`).join('')}</ul>
                <button class="zp-btn ${btnCls}" data-plan="${planId}">${btnTxt}</button>
            </div>`;
        const renderCards = () => {
            const isMonthly = activeTab === 'monthly';
            const isYearly = activeTab === 'yearly';
            const isLifetime = activeTab === 'lifetime';
            if (isMonthly) {
                return `
                    <div class="zp-cards">
                        ${planCard('Pro', 'zp-pro', `$${proMonthly.price}`, '/mo', '', '', 'for individuals getting started',
                            ['100 images/day', '100 uploads/day', 'File edit &amp; generate', 'Higher daily limits'], 'Get Pro', 'cyan', 'pro_monthly')}
                        ${planCard('👑 Ultimate', 'zp-ult', `$${ultMonthly.price}`, '/mo', 'POPULAR', 'hot', 'everything, fully unlocked',
                            ['Everything in Pro', 'Unlimited + gpt-4o / claude', 'Unlimited voice', 'Priority support'], 'Go Ultimate', 'gold', 'ultimate_monthly')}
                    </div>
                `;
            } else if (isYearly) {
                return `
                    <div class="zp-cards">
                        ${planCard('Pro Annual', 'zp-pro', `$${proAnnual.price}`, '/yr', 'SAVE 17%', 'save', 'best value for a year ahead',
                            ['Everything in Pro monthly', '17% cheaper than monthly', 'Billed once a year', 'Same limits as Pro'], 'Get Pro Annual', 'cyan', 'pro_annual')}
                        ${planCard('👑 Ultimate Annual', 'zp-ult', `$${ultAnnual.price}`, '/yr', 'SAVE 17%', 'save', 'best value for a year ahead',
                            ['Everything in Ultimate', '17% cheaper than monthly', 'Billed once a year', 'Priority support'], 'Go Ultimate Annual', 'gold', 'ultimate_annual')}
                    </div>
                `;
            } else {
                return `
                    <div class="zp-cards">
                        ${planCard('Pro Lifetime', 'zp-pro', `$${proLifetime.price}`, ' once', 'ONE-TIME', 'save', 'pay once, own forever',
                            ['Everything in Pro', 'One-time payment', 'No recurring bills', 'Yours for life'], 'Buy Lifetime Pro', 'cyan', 'pro_lifetime')}
                        ${planCard('👑 Ultimate Lifetime', 'zp-ult', `$${ultLifetime.price}`, ' once', 'ONE-TIME', 'hot', 'pay once, own forever',
                            ['Everything in Ultimate', 'One-time payment', 'No recurring bills', 'Yours for life'], 'Buy Lifetime Ultimate', 'gold', 'ultimate_lifetime')}
                    </div>
                `;
            }
        };
        modal.innerHTML = `
            <div class="zp-card">
                <div class="zp-glow" style="top:-70px; right:-60px; width:210px; height:210px; background:rgba(255,61,180,.16);"></div>
                <div class="zp-glow" style="bottom:-80px; left:-70px; width:230px; height:230px; background:rgba(34,211,238,.13);"></div>
                <h2 class="zp-title">${title}</h2>
                <p class="zp-sub">${sub}</p>
                ${isGuest ? `
                    <div class="zp-guest">
                        <div class="zp-guest-ic">🚀</div>
                        <div class="zp-guest-title">${title}</div>
                        <div class="zp-guest-desc">Guests have limited access — locking invites, chat sharing, documents and file tools. Login for free unlimited chat.</div>
                        <button id="billing-login" class="zp-login">Login / Register</button>
                    </div>` : `
                    <div style="display:flex; gap:8px; justify-content:center; margin-bottom:16px; flex-wrap:wrap;">
                        <button id="tab-monthly" class="zp-tab zp-tab-on">Monthly</button>
                        <button id="tab-yearly" class="zp-tab">Yearly</button>
                        <button id="tab-lifetime" class="zp-tab zp-tab-gold">✦ Lifetime</button>
                    </div>
                    <div id="billing-cards">${renderCards()}</div>`}
                <button id="billing-close" class="zp-maybe">Maybe later</button>
            </div>
            <style>
                .zp-card{width:94%;max-width:660px;background:linear-gradient(165deg,#1d0f43,#14092e 55%,#0d0626);border:1px solid rgba(139,92,246,.55);border-radius:22px;padding:26px 22px;max-height:90vh;overflow-y:auto;position:relative;box-shadow:0 24px 70px rgba(0,0,0,.6),0 0 70px rgba(139,92,246,.28),inset 0 1px 0 rgba(255,255,255,.06);}
                .zp-card::before{content:'';position:absolute;top:0;left:6%;right:6%;height:2px;background:linear-gradient(90deg,transparent,#22d3ee,#ff3db4,#ffd23f,transparent);}
                .zp-glow{position:absolute;border-radius:50%;filter:blur(42px);pointer-events:none;}
                .zp-title{font-size:24px;font-weight:900;text-align:center;margin:0 0 6px;background:linear-gradient(90deg,#22d3ee,#ff3db4 55%,#ffd23f);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 16px rgba(139,92,246,.45));}
                .zp-sub{text-align:center;color:#b6a8e0;font-size:13px;margin:0 0 14px;}
                .zp-tab{padding:8px 18px;border-radius:100px;border:1px solid rgba(139,92,246,.4);background:transparent;color:#b6a8e0;cursor:pointer;font-weight:700;font-size:13px;transition:all .15s;}
                .zp-tab:hover{background:rgba(139,92,246,.14);box-shadow:0 0 16px rgba(139,92,246,.25);}
                .zp-tab-on{background:linear-gradient(135deg,#22d3ee,#8b5cf6);border-color:transparent;color:#fff;box-shadow:0 4px 18px rgba(34,211,238,.35);}
                .zp-tab-gold{color:#ffd23f;border-color:rgba(255,210,63,.45);text-shadow:0 0 12px rgba(255,210,63,.35);}
                .zp-tab-gold.zp-tab-on{background:linear-gradient(135deg,#FFD700,#FF8C00);color:#111;box-shadow:0 4px 18px rgba(255,140,0,.4);text-shadow:none;}
                .zp-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-bottom:14px;}
                .zp-plan{position:relative;border-radius:16px;padding:16px 15px;text-align:center;overflow:hidden;transition:transform .15s,box-shadow .15s;}
                .zp-plan:hover{transform:translateY(-2px);}
                .zp-pro{background:linear-gradient(160deg,rgba(34,211,238,.10),rgba(23,10,51,.7));border:1px solid rgba(34,211,238,.45);box-shadow:0 0 24px rgba(34,211,238,.12);}
                .zp-pro:hover{box-shadow:0 0 34px rgba(34,211,238,.3);}
                .zp-ult{background:linear-gradient(160deg,rgba(255,210,63,.12),rgba(255,140,0,.06) 60%,rgba(23,10,51,.7));border:1px solid rgba(255,210,63,.6);box-shadow:0 0 26px rgba(255,210,63,.16);}
                .zp-ult:hover{box-shadow:0 0 38px rgba(255,210,63,.36);}
                .zp-badge{position:absolute;top:-1px;right:14px;font-size:9px;font-weight:800;letter-spacing:1px;padding:4px 9px;border-radius:0 0 9px 9px;}
                .zp-badge.hot{background:linear-gradient(90deg,#FFD700,#FF8C00);color:#111;box-shadow:0 4px 14px rgba(255,140,0,.5);}
                .zp-badge.save{background:linear-gradient(90deg,#22d3ee,#8b5cf6);color:#fff;box-shadow:0 4px 14px rgba(34,211,238,.4);}
                .zp-name{font-weight:800;font-size:16px;margin:14px 0 2px;}
                .zp-pro .zp-name{color:#7df0ff;text-shadow:0 0 14px rgba(34,211,238,.5);}
                .zp-ult .zp-name{color:#ffd23f;text-shadow:0 0 14px rgba(255,210,63,.5);}
                .zp-price{font-size:27px;font-weight:900;color:#fff;letter-spacing:.5px;}
                .zp-price small{font-size:12px;color:#8b7fb8;font-weight:600;}
                .zp-feat-note{font-size:11px;color:#8b7fb8;margin:6px 0 0;}
                .zp-feats{list-style:none;margin:12px 0 0;padding:0;text-align:left;font-size:12px;color:#c4b5fd;line-height:1.75;}
                .zp-feats li::before{content:'◆';margin-right:8px;font-size:9px;}
                .zp-pro .zp-feats li::before{color:#22d3ee;text-shadow:0 0 10px rgba(34,211,238,.8);}
                .zp-ult .zp-feats li::before{color:#ffd23f;text-shadow:0 0 10px rgba(255,210,63,.8);}
                .zp-btn{display:block;width:100%;margin-top:14px;padding:11px;border:none;border-radius:11px;font-weight:800;font-size:14px;cursor:pointer;transition:transform .15s,box-shadow .15s;}
                .zp-btn:hover{transform:translateY(-1px);}
                .zp-btn.cyan{background:linear-gradient(135deg,#22d3ee,#3fb6ff 45%,#8b5cf6);background-size:160% 160%;animation:zpDrift 5s ease infinite;color:#fff;box-shadow:0 6px 22px rgba(34,211,238,.4);}
                .zp-btn.gold{background:linear-gradient(135deg,#FFD700,#FFB300 45%,#FF8C00);background-size:160% 160%;animation:zpDrift 5s ease infinite;color:#111;box-shadow:0 6px 22px rgba(255,140,0,.4);}
                .zp-guest{position:relative;text-align:center;padding:26px 14px;border:1px dashed rgba(255,210,63,.45);border-radius:16px;background:rgba(255,210,63,.05);margin-bottom:14px;}
                .zp-guest-ic{font-size:50px;margin-bottom:10px;filter:drop-shadow(0 0 18px rgba(34,211,238,.5));animation:zpBob 3s ease-in-out infinite;}
                .zp-guest-title{font-size:22px;font-weight:900;margin-bottom:8px;background:linear-gradient(90deg,#22d3ee,#ff3db4 60%,#ffd23f);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 14px rgba(255,61,180,.35));}
                .zp-guest-desc{font-size:13px;color:#b6a8e0;line-height:1.7;margin:0 0 20px;}
                .zp-login{display:block;margin:0 auto;padding:13px 34px;border:none;border-radius:12px;background:linear-gradient(135deg,#22d3ee,#8b5cf6 55%,#ff3db4);background-size:180% 180%;animation:zpDrift 6s ease infinite;color:#fff;font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 8px 28px rgba(255,61,180,.4);transition:transform .15s,box-shadow .15s;}
                .zp-login:hover{transform:translateY(-2px);box-shadow:0 12px 34px rgba(255,61,180,.55);}
                .zp-maybe{display:block;margin:12px auto 0;background:transparent;border:none;color:#8b7fb8;cursor:pointer;font-size:12px;transition:color .15s;}
                .zp-maybe:hover{color:#c4b5fd;}
                @keyframes zpDrift{0%,100%{background-position:0% 50%;}50%{background-position:100% 50%;}}
                @keyframes zpBob{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}
            </style>
        `;
        document.body.appendChild(modal);
        const attachPlanHandlers = () => {
            if (isGuest) return;
            modal.querySelectorAll('[data-plan]').forEach(btn=>{
                btn.addEventListener('click', async ()=>{
                    const planId = btn.dataset.plan;
                    btn.disabled = true;
                    const oldTxt = btn.textContent;
                    btn.textContent = 'Processing…';
                    try {
                        const res = await api('/api/billing/create-checkout', {method:'POST', body:JSON.stringify({plan_id:planId, success_url: window.location.href, cancel_url: window.location.href})});
                        if (res.mock) {
                            // Dev mode — plan granted server-side. Don't navigate anywhere.
                            showToast(res.message || 'Plan activated (dev mode)', 'success');
                            window.__modalOpen = false;
                            setTimeout(()=>modal.remove(), 900);
                        } else if (res.url) {
                            // Real PesaPal checkout URL — navigate away.
                            window.location.href = res.url;
                        } else {
                            showToast('Checkout did not return a URL', 'error');
                            window.__modalOpen = false;
                            modal.remove();
                        }
                    } catch(e){
                        showToast(e && e.message ? e.message : 'Billing error', 'error');
                        btn.disabled = false;
                        btn.textContent = oldTxt;
                    }
                });
            });
        };
        attachPlanHandlers();
        // Tabs
        const switchTab = (tab) => {
            activeTab = tab;
            modal.querySelector('#billing-cards').innerHTML = renderCards();
            ['monthly','yearly','lifetime'].forEach(t=>{
                const btn = modal.querySelector(`#tab-${t}`);
                if (btn) btn.className = t === tab ? (t === 'lifetime' ? 'zp-tab zp-tab-gold zp-tab-on' : 'zp-tab zp-tab-on') : (t === 'lifetime' ? 'zp-tab zp-tab-gold' : 'zp-tab');
            });
            attachPlanHandlers();
        };
        if (!isGuest) {
            modal.querySelector('#tab-monthly').addEventListener('click', ()=>switchTab('monthly'));
            modal.querySelector('#tab-yearly').addEventListener('click', ()=>switchTab('yearly'));
            modal.querySelector('#tab-lifetime').addEventListener('click', ()=>switchTab('lifetime'));
        }
        modal.querySelector('#billing-close').addEventListener('click', ()=>{ modal.remove(); window.__modalOpen = false; });
        modal.addEventListener('click', e=>{ if(e.target===modal){ modal.remove(); window.__modalOpen = false; } });
        const loginBtn = modal.querySelector('#billing-login');
        if(loginBtn) loginBtn.addEventListener('click', async ()=>{
            modal.remove(); window.__modalOpen = false;
            // Guest login button (upgrade popup) — same as the limit popup: warn like
            // the logout flow, then actually log the guest out so they land on the
            // register screen ('/' alone would bounce them back because the cookie lives).
            let ok = true;
            if (typeof showConfirm === 'function') {
                try {
                    ok = await showConfirm('End guest session?', 'Using log out will permanently delete this guest account and all its messages. They cannot be recovered. Continue?', false);
                } catch (e) { ok = true; }
                if (!ok) return;
            }
            try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
            window.location.replace('/');
        });
    }
};
// Global dedupe: only one limit/billing modal at a time.
function _routeLimitMessage(msg) {
    if (window.__modalOpen) return;
    const isCooldown = /wait\s+\d+m\s*\d+s|cooldown|pause/i.test(msg);
    if (isCooldown) {
        setTimeout(() => { if (typeof showLimitPopup === 'function') showLimitPopup(msg); }, 300);
    } else {
        setTimeout(() => Billing.showUpgrade(msg), 300);
    }
}
// Intercept 429 upgrade prompts globally
const _origFetch = window.fetch;
window.fetch = async (...args)=>{
    const res = await _origFetch(...args);
    if(res.status===429){
        try{
            const data = await res.clone().json();
            const msg = data.detail || 'Limit reached';
            if(msg.includes('limit') || msg.includes('Guest') || msg.includes('Upgrade') || msg.includes('pause')){
                _routeLimitMessage(msg);
            }
        }catch{}
    }
    return res;
};
// Also hook api() 429
const _origApi = window.api;
if(_origApi){
    const orig = window.api;
    window.api = async (...args)=>{
        try{ return await orig(...args); }
        catch(e){
            if(e.message && (e.message.includes('limit') || e.message.includes('Guest') || e.message.includes('Upgrade') || e.message.includes('pause'))){
                _routeLimitMessage(e.message);
            }
            throw e;
        }
    };
}
