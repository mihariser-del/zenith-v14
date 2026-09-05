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
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.style.zIndex = '500';
        const isGuest = (reason && reason.includes('Guest')) || (window.user && window.user.username && window.user.username.startsWith('guest_'));
        const isLimit = reason && (reason.includes('limit') || reason.includes('reached') || reason.includes('pause') || reason.includes('Free limit') || reason.includes('Guest limit'));
        const title = isGuest ? 'Login Required' : (isLimit ? 'Upgrade to Continue' : 'Choose Your Plan');
        const sub = isGuest ? 'Guests have limited access. Login for free unlimited chat.' : (isLimit ? reason : 'Unlock Pro and Ultimate for unlimited features.');
        const proMonthly = plans.find(p=>p.id==='pro_monthly') || {price:5.99};
        const proAnnual = plans.find(p=>p.id==='pro_annual') || {price:59.99};
        const proLifetime = plans.find(p=>p.id==='pro_lifetime') || {price:200};
        const ultMonthly = plans.find(p=>p.id==='ultimate_monthly') || {price:11.99};
        const ultAnnual = plans.find(p=>p.id==='ultimate_annual') || {price:119.99};
        const ultLifetime = plans.find(p=>p.id==='ultimate_lifetime') || {price:400};
        let activeTab = 'monthly';
        const renderCards = () => {
            const isMonthly = activeTab === 'monthly';
            const isYearly = activeTab === 'yearly';
            const isLifetime = activeTab === 'lifetime';
            if (isMonthly) {
                return `
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
                        <div style="background:#111315; border:2px solid #C0C7D1; border-radius:12px; padding:16px; text-align:center;">
                            <div style="font-weight:700; color:#C0C7D1;">Pro</div>
                            <div style="font-size:22px; font-weight:800; color:#fff;">$${proMonthly.price}<span style="font-size:12px; color:#8B949E;">/mo</span></div>
                            <div style="font-size:11px; color:#8B949E; margin:6px 0;">&nbsp;</div>
                            <div style="font-size:11px; color:#8B949E; text-align:left; margin:8px 0;">• 100 images/day<br>• 100 uploads/day<br>• File edit/generate</div>
                            <button data-plan="pro_monthly" style="margin-top:10px; width:100%; padding:10px; background:linear-gradient(135deg,#DDE4EE,#8B949E); color:#111315; border:none; border-radius:8px; font-weight:700; cursor:pointer;">Get Pro</button>
                        </div>
                        <div style="background:linear-gradient(135deg,#FFD70022,#FF8C0022); border:2px solid #FFD700; border-radius:12px; padding:16px; text-align:center;">
                            <div style="font-weight:700; color:#FFD700;">👑 Ultimate</div>
                            <div style="font-size:22px; font-weight:800; color:#fff;">$${ultMonthly.price}<span style="font-size:12px; color:#8B949E;">/mo</span></div>
                            <div style="font-size:11px; color:#8B949E; margin:6px 0;">&nbsp;</div>
                            <div style="font-size:11px; color:#8B949E; text-align:left; margin:8px 0;">• Everything in Pro<br>• Unlimited + gpt-4o/claude<br>• Voice unlimited</div>
                            <button data-plan="ultimate_monthly" style="margin-top:10px; width:100%; padding:10px; background:linear-gradient(135deg,#FFD700,#FF8C00); color:#000; border:none; border-radius:8px; font-weight:700; cursor:pointer;">Go Ultimate</button>
                        </div>
                    </div>
                `;
            } else if (isYearly) {
                return `
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
                        <div style="background:#111315; border:2px solid #C0C7D1; border-radius:12px; padding:16px; text-align:center;">
                            <div style="font-weight:700; color:#C0C7D1;">Pro Annual</div>
                            <div style="font-size:22px; font-weight:800; color:#fff;">$${proAnnual.price}<span style="font-size:12px; color:#8B949E;">/yr</span></div>
                            <div style="font-size:11px; color:#4ADE80;">17% off vs monthly</div>
                            <button data-plan="pro_annual" style="margin-top:10px; width:100%; padding:10px; background:linear-gradient(135deg,#DDE4EE,#8B949E); color:#111315; border:none; border-radius:8px; font-weight:700; cursor:pointer;">Get Pro Annual</button>
                        </div>
                        <div style="background:linear-gradient(135deg,#FFD70022,#FF8C0022); border:2px solid #FFD700; border-radius:12px; padding:16px; text-align:center;">
                            <div style="font-weight:700; color:#FFD700;">👑 Ultimate Annual</div>
                            <div style="font-size:22px; font-weight:800; color:#fff;">$${ultAnnual.price}<span style="font-size:12px; color:#8B949E;">/yr</span></div>
                            <div style="font-size:11px; color:#4ADE80;">17% off vs monthly</div>
                            <button data-plan="ultimate_annual" style="margin-top:10px; width:100%; padding:10px; background:linear-gradient(135deg,#FFD700,#FF8C00); color:#000; border:none; border-radius:8px; font-weight:700; cursor:pointer;">Get Ultimate Annual</button>
                        </div>
                    </div>
                `;
            } else {
                return `
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
                        <div style="background:#111315; border:2px solid #C0C7D1; border-radius:12px; padding:16px; text-align:center;">
                            <div style="font-weight:700; color:#C0C7D1;">Pro Lifetime</div>
                            <div style="font-size:22px; font-weight:800; color:#fff;">$${proLifetime.price}<span style="font-size:11px; color:#8B949E;"> once</span></div>
                            <div style="font-size:11px; color:#8B949E; margin:6px 0;">One-time, forever</div>
                            <button data-plan="pro_lifetime" style="margin-top:10px; width:100%; padding:10px; background:linear-gradient(135deg,#DDE4EE,#8B949E); color:#111315; border:none; border-radius:8px; font-weight:700; cursor:pointer;">Buy Lifetime Pro</button>
                        </div>
                        <div style="background:linear-gradient(135deg,#FFD70022,#FF8C0022); border:2px solid #FFD700; border-radius:12px; padding:16px; text-align:center;">
                            <div style="font-weight:700; color:#FFD700;">👑 Ultimate Lifetime</div>
                            <div style="font-size:22px; font-weight:800; color:#fff;">$${ultLifetime.price}<span style="font-size:11px; color:#8B949E;"> once</span></div>
                            <div style="font-size:11px; color:#8B949E; margin:6px 0;">One-time, forever</div>
                            <button data-plan="ultimate_lifetime" style="margin-top:10px; width:100%; padding:10px; background:linear-gradient(135deg,#FFD700,#FF8C00); color:#000; border:none; border-radius:8px; font-weight:700; cursor:pointer;">Buy Lifetime Ultimate</button>
                        </div>
                    </div>
                `;
            }
        };
        modal.innerHTML = `
            <div style="max-width:650px; width:95%; background:linear-gradient(160deg,#1A1D21,#22262B); border:1px solid #2a2f36; border-radius:16px; padding:24px; max-height:90vh; overflow-y:auto;">
                <h2 style="text-align:center; color:#DDE4EE; margin-bottom:8px;">${title}</h2>
                <p style="text-align:center; color:#8B949E; font-size:13px; margin-bottom:12px;">${sub}</p>
                ${isGuest ? `<div style="text-align:center; margin-bottom:12px; padding:24px 8px; border:1px dashed #333; border-radius:10px;">
                    <div style="font-size:13px; color:#8B949E; margin-bottom:16px;">Log in to unlock the full upgrade experience and lift guest limits.</div>
                    <button id="billing-login" style="padding:12px 28px; background:linear-gradient(135deg,#DDE4EE,#8B949E); color:#111315; border:none; border-radius:8px; font-weight:700; cursor:pointer;">Login / Register</button>
                </div>` : `
                <div style="display:flex; gap:8px; justify-content:center; margin-bottom:16px;">
                    <button id="tab-monthly" style="padding:8px 16px; border-radius:20px; border:1px solid #C0C7D1; background:${activeTab==='monthly'?'#C0C7D1':'transparent'}; color:${activeTab==='monthly'?'#111315':'#8B949E'}; cursor:pointer; font-weight:600;">Monthly</button>
                    <button id="tab-yearly" style="padding:8px 16px; border-radius:20px; border:1px solid #C0C7D1; background:transparent; color:#8B949E; cursor:pointer; font-weight:600;">Yearly</button>
                    <button id="tab-lifetime" style="padding:8px 16px; border-radius:20px; border:1px solid #C0C7D1; background:transparent; color:#8B949E; cursor:pointer; font-weight:600;">Lifetime</button>
                </div>
                ${''}`}
                ${isGuest ? '' : `<div id="billing-cards">${renderCards()}</div>`}
                <div style="text-align:center; margin-top:12px;">
                    <button id="billing-close" style="background:transparent; border:none; color:#8B949E; cursor:pointer; font-size:12px;">Maybe later</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const attachPlanHandlers = () => {
            if (isGuest) return;
            modal.querySelectorAll('[data-plan]').forEach(btn=>{
                btn.addEventListener('click', async ()=>{
                    const planId = btn.dataset.plan;
                    try {
                        const res = await api('/api/billing/create-checkout', {method:'POST', body:JSON.stringify({plan_id:planId, success_url: window.location.href, cancel_url: window.location.href})});
                        if(res.url) window.location.href = res.url;
                        else showToast('Checkout mock — set Stripe keys for real billing', '');
                        modal.remove();
                    } catch(e){ showToast(e.message,'error'); }
                });
            });
        };
        attachPlanHandlers();
        // Tabs
        const switchTab = (tab) => {
            activeTab = tab;
            modal.querySelector('#billing-cards').innerHTML = renderCards();
            // Update tab styles
            ['monthly','yearly','lifetime'].forEach(t=>{
                const btn = modal.querySelector(`#tab-${t}`);
                if(btn){
                    const isActive = t===tab;
                    btn.style.background = isActive ? '#C0C7D1' : 'transparent';
                    btn.style.color = isActive ? '#111315' : '#8B949E';
                }
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
