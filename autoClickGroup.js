console.log('✅ [NAV-CORE] autoClickGroup.js initialized!');

let scanInterval = null;
let countdownTimer = null;
let globalAttempts = 0;

// STOP / PAUSE LISTENER - Immediately halt all timers
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'pause_for_batch_wait') {
        console.log('⏸️ [NAV-PAUSE] pause_for_batch_wait received. Clearing NAV timers.');
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
        if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
        const overlay = document.getElementById('automation-countdown-overlay');
        if (overlay) { overlay.style.display = 'none'; }
        globalAttempts = 0;
        if (sendResponse) sendResponse({ ok: true });
    }

    if (request.type === 'stop_automation' || request.type === 'all_batches_complete') {
        console.log(`🛑 [NAV-STOP] "${request.type}" received. Clearing NAV timers.`);
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
        if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
        const overlay = document.getElementById('automation-countdown-overlay');
        if (overlay) { overlay.style.display = 'none'; }
        globalAttempts = 0;
        if (sendResponse) sendResponse({ ok: true });
    }
});


function ensureOverlay() {
    let overlay = document.getElementById('automation-countdown-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'automation-countdown-overlay';
        overlay.style.cssText = `
            position: fixed; top: 15%; left: 50%; transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.95); color: white; padding: 15px 30px;
            border-radius: 16px; z-index: 10000000; border: 2px solid #1eb2ff;
            font-family: sans-serif; box-shadow: 0 10px 40px rgba(0,0,0,0.8);
            display: flex; flex-direction: column; align-items: center; gap: 5px;
        `;
        document.body.appendChild(overlay);
    }
    return overlay;
}

const dispatchClick = (el, type) => {
    if (!el) return;
    console.log(`⚡ [CLICK-LAYER] Dispatching ${type} to target element.`);
    el.style.outline = "8px solid #ff0000";
    el.style.boxShadow = "0 0 50px #ff0000";
    
    const opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.click();
    console.log("✅ [SUCCESS] Click event confirmed!");
};

async function openShareToGroupMenu() {
    console.log("🚀 [SYSTEM-START] openShareToGroupMenu triggered.");
    
    if (countdownTimer) clearInterval(countdownTimer);
    if (scanInterval) clearInterval(scanInterval);
    globalAttempts = 0;

    let countdown = 5;
    const overlay = ensureOverlay();
    overlay.style.display = 'flex';

    countdownTimer = setInterval(() => {
        console.log(`⏱️ [COUNTDOWN-LAYER] Remaining: ${countdown}s`);
        overlay.innerHTML = `
            <span style="color:#1eb2ff; font-size:12px; font-weight:800; letter-spacing:1s;">STABILIZING MENU</span>
            <span style="font-size:32px; font-weight:900;">${countdown}s</span>
        `;
        
        chrome.runtime.sendMessage({ 
            type: 'task_countdown', 
            active: true, 
            name: "Waiting for stability", 
            remaining: countdown,
            stepIndex: 1
        });

        if (countdown <= 0) {
            clearInterval(countdownTimer);
            overlay.innerHTML = `<span style="color:#00ff88; font-size:16px;">🔍 ATTEMPTING SCAN...</span>`;
            console.log("🔍 [SCAN-LAYER] Moving to Grid/List detection...");
            scanForGroupOption();
        }
        countdown--;
    }, 1000);
}

function scanForGroupOption() {
    const overlay = document.getElementById('automation-countdown-overlay');

    scanInterval = setInterval(() => {
        globalAttempts++;
        console.log(`🧪 [RETRY-LAYER] Scanning Cycle #${globalAttempts}...`);
        
        if (globalAttempts === 4 || globalAttempts === 8 || globalAttempts === 12) {
            console.log(`🔄 [RETRY-LAYER] Menu not found after scans. Re-clicking Share button! (Attempt ${globalAttempts/4}/3)`);
            if (typeof findPrimaryShareButton === 'function' && typeof safeClick === 'function') {
                const btn = findPrimaryShareButton();
                if (btn) {
                    safeClick(btn);
                    console.log("✅ [RETRY-LAYER] Native Share button re-clicked successfully. Waiting for menu...");
                } else {
                    console.log("⚠️ [RETRY-LAYER] Share button not found on screen for native re-click.");
                }
            }
        }

        if (globalAttempts > 15) {
            console.log("❌ [RETRY-FAIL] Exhausted 3 native Share button re-clicks. Notifying panel to full-reload/retry...");
            clearInterval(scanInterval);
            if (overlay) overlay.style.display = 'none';
            chrome.runtime.sendMessage({ type: 'batch_retry_requested', reason: 'share_menu_not_found' });
            return;
        }

        const allDoms = [...document.querySelectorAll('a, [role="button"], div, span, li')];
        console.log(`🔎 [SCAN-INFO] Indexed ${allDoms.length} elements for analysis.`);
        
        let target = null;
        for (let item of allDoms) {
            const rawText = (item.innerText || "").trim();
            const txt = rawText.toLowerCase();
            const aria = (item.getAttribute('aria-label') || "").trim().toLowerCase();
            
            if (rawText.length > 80) continue;

            const isShareInGroup =
                txt === "share in a group" ||
                txt === "গ্রুপে শেয়ার করুন" ||
                txt === "গ্রুপে শেয়ার" ||
                txt.startsWith("share in a group") ||
                aria === "share in a group" ||
                aria.includes("share in a group");

            const isGroupsTab =
                txt === "groups" ||
                txt === "গ্রুপ" ||
                aria === "groups";

            if (isShareInGroup || isGroupsTab) {
                const rect = item.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < window.innerHeight) {
                    console.log(`🎯 [MATCH-FOUND] Text: "${rawText}" (len:${rawText.length}), ARIA: "${aria}"`);
                    target = (item.tagName === 'A' || item.getAttribute('role') === 'button')
                        ? item
                        : (item.closest('a, [role="button"]') || item);
                    break;
                }
            }
        }

        if (target) {
            console.log("🎯 [FINAL-STEP] Target locked! Dispacthing Click...");
            clearInterval(scanInterval);
            setTimeout(() => {
                dispatchClick(target, "GRID/LIST BUTTON");
                if (overlay) overlay.style.display = 'none';
            }, 600);
        } else {
            // ✅ Every 5 failed attempts → instantly focus browser window and keep retrying same step
            if (globalAttempts % 5 === 0) {
                console.warn(`🪟 [FOCUS-RETRY] Step slow/missing at attempt ${globalAttempts}. Focusing browser...`);
                chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason: 'share_menu_scan_retry' });
            }
            console.log("😴 [SLEEP-LAYER] No match found in this cycle. Retrying in 1s...");
        }
    }, 1000);
}

