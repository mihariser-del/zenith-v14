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
        const plans = this.plans || await this.loadPlans();
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.style.zIndex = '500';
        const isGuest = reason && reason.includes('Guest');
        const title = isGuest ? 'Login Required' : 'Upgrade to Continue';
        const sub = isGuest ? 'Guests have limited access. Login for free unlimited chat.' : reason || 'You have reached your free limit.';
        // Find pro plans
        const proMonthly = plans.find(p=>p.id==='pro_monthly') || {price:5.99};
        const proAnnual = plans.find(p=>p.id==='pro_annual') || {price:59.99};
        const ultMonthly = plans.find(p=>p.id==='ultimate_monthly') || {price:11.99};
        const ultAnnual = plans.find(p=>p.id==='ultimate_annual') || {price:119.99};
        modal.innerHTML = `
            <div style="max-width:650px; width:95%; background:linear-gradient(160deg,#1A1D21,#22262B); border:1px solid #2a2f36; border-radius:16px; padding:24px; max-height:90vh; overflow-y:auto;">
                <h2 style="text-align:center; color:#DDE4EE; margin-bottom:8px;">${title}</h2>
                <p style="text-align:center; color:#8B949E; font-size:13px; margin-bottom:16px;">${sub}</p>
                ${isGuest ? `<div style="text-align:center; margin-bottom:16px;"><button id="billing-login" style="padding:10px 20px; background:#fff; color:#000; border:none; border-radius:8px; font-weight:600; cursor:pointer;">Login / Register</button></div>` : ''}
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
                    <div style="background:#111315; border:2px solid #C0C7D1; border-radius:12px; padding:16px; text-align:center;">
                        <div style="font-weight:700; color:#C0C7D1;">Pro</div>
                        <div style="font-size:22px; font-weight:800; color:#fff;">$${proMonthly.price}<span style="font-size:12px; color:#8B949E;">/mo</span></div>
                        <div style="font-size:11px; color:#8B949E;">or $${proAnnual.price}/yr (17% off)</div>
                        <div style="font-size:11px; color:#4ADE80; margin:6px 0;">✓ 5-day FREE trial</div>
                        <div style="font-size:11px; color:#8B949E; text-align:left; margin:8px 0;">• Unlimited chat (low model free)<br>• 100 images/day<br>• 100 uploads/day<br>• File edit/generate (pptx)</div>
                        <button data-plan="pro_monthly" style="margin-top:10px; width:100%; padding:10px; background:linear-gradient(135deg,#DDE4EE,#8B949E); color:#111315; border:none; border-radius:8px; font-weight:700; cursor:pointer;">Start Pro Trial</button>
                        <button data-plan="pro_annual" style="margin-top:6px; width:100%; padding:8px; background:transparent; border:1px solid #C0C7D1; color:#C0C7D1; border-radius:8px; cursor:pointer; font-size:11px;">Pro Annual $59.99</button>
                    </div>
                    <div style="background:linear-gradient(135deg,#FFD70022,#FF8C0022); border:2px solid #FFD700; border-radius:12px; padding:16px; text-align:center;">
                        <div style="font-weight:700; color:#FFD700;">👑 Ultimate</div>
                        <div style="font-size:22px; font-weight:800; color:#fff;">$${ultMonthly.price}<span style="font-size:12px; color:#8B949E;">/mo</span></div>
                        <div style="font-size:11px; color:#8B949E;">or $${ultAnnual.price}/yr (17% off)</div>
                        <div style="font-size:11px; color:#8B949E; margin:6px 0;">&nbsp;</div>
                        <div style="font-size:11px; color:#8B949E; text-align:left; margin:8px 0;">• Everything in Pro<br>• Unlimited + gpt-4o/claude<br>• Voice-to-voice unlimited<br>• API + white-label</div>
                        <button data-plan="ultimate_monthly" style="margin-top:10px; width:100%; padding:10px; background:linear-gradient(135deg,#FFD700,#FF8C00); color:#000; border:none; border-radius:8px; font-weight:700; cursor:pointer;">Go Ultimate</button>
                        <button data-plan="ultimate_annual" style="margin-top:6px; width:100%; padding:8px; background:transparent; border:1px solid #FFD700; color:#FFD700; border-radius:8px; cursor:pointer; font-size:11px;">Ultimate Annual $119.99</button>
                    </div>
                </div>
                <div style="text-align:center;">
                    <button id="billing-close" style="background:transparent; border:none; color:#8B949E; cursor:pointer; font-size:12px;">Maybe later</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#billing-close').addEventListener('click', ()=>modal.remove());
        modal.addEventListener('click', e=>{ if(e.target===modal) modal.remove(); });
        const loginBtn = modal.querySelector('#billing-login');
        if(loginBtn) loginBtn.addEventListener('click', ()=>{ modal.remove(); window.location.href='/'; });
        modal.querySelectorAll('[data-plan]').forEach(btn=>{
            btn.addEventListener('click', async ()=>{
                const planId = btn.dataset.plan;
                if(planId==='pro_monthly' || planId==='pro_annual'){
                    // Try trial first for pro
                    try {
                        const trial = await api('/api/billing/trial/start', {method:'POST'});
                        showToast('Pro trial started! 5 days free.', 'success');
                        modal.remove();
                        return;
                    } catch(e){
                        // If trial already used, go to checkout
                        if(!e.message.includes('Already')) { showToast(e.message,'error'); return; }
                    }
                }
                try {
                    const res = await api('/api/billing/create-checkout', {method:'POST', body:JSON.stringify({plan_id:planId, success_url: window.location.href, cancel_url: window.location.href})});
                    if(res.url) window.location.href = res.url;
                    else showToast('Checkout mock — set Stripe keys for real billing', '');
                    modal.remove();
                } catch(e){ showToast(e.message,'error'); }
            });
        });
    },
    async checkTrialOffer() {
        try {
            const status = await api('/api/billing/status');
            if(!status.is_pro && !status.is_ultimate && !status.trial_active){
                // Show free 5-day Pro offer once per user (localStorage)
                const seen = localStorage.getItem('zenith_trial_offer_seen');
                if(!seen){
                    localStorage.setItem('zenith_trial_offer_seen','1');
                    setTimeout(()=>this.showUpgrade('🎁 Free 5-day Pro trial — try Ultimate features free!'), 2000);
                }
            }
        } catch {}
    }
};
document.addEventListener('DOMContentLoaded', ()=>{ setTimeout(()=>Billing.checkTrialOffer(), 3000); });
// Intercept 429 upgrade prompts globally
const _origFetch = window.fetch;
window.fetch = async (...args)=>{
    const res = await _origFetch(...args);
    if(res.status===429){
        try{
            const data = await res.clone().json();
            const msg = data.detail || 'Limit reached';
            if(msg.includes('limit') || msg.includes('Guest') || msg.includes('Upgrade')){
                setTimeout(()=>Billing.showUpgrade(msg), 300);
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
                Billing.showUpgrade(e.message);
            }
            throw e;
        }
    };
}
