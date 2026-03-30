/**
 * WINDOW FOCUS MANAGER (Panel Context)
 *
 * State machine:
 *   panel idle / start   → _panelShouldStayFocused = true   (default — panel forced)
 *   automation START     → _panelShouldStayFocused = true   (page loading, keep panel)
 *   batch RUNNING on FB  → _panelShouldStayFocused = false  (FB tab forced, not panel)
 *   batch FINISHED       → _panelShouldStayFocused = true   (inter-batch countdown)
 *   all batches COMPLETE → _panelShouldStayFocused = true   (permanently)
 *   stop_automation      → _panelShouldStayFocused = true   (show panel)
 *   next batch RUNNING   → _panelShouldStayFocused = false  (FB tab forced again)
 */

console.log('🪟 [WFM] windowFocusManager.js loaded.');

// ─── State ────────────────────────────────────────────────────────────────────
// true  (default) — panel is forced. User cannot freely leave.
// false           — batch is actively running on Facebook tab. Panel is not forced.
let _panelShouldStayFocused = true; // ✅ default: panel forced

// ─── Guard ────────────────────────────────────────────────────────────────────
function isExtensionValid() {
    try { return !!chrome.runtime?.id; } catch (e) { return false; }
}

// ─── Helper: focus the extension panel window ─────────────────────────────────
function focusPanelNow(reason) {
    if (!isExtensionValid()) return;
    try {
        chrome.tabs.getCurrent((tab) => {
            if (tab && tab.id) {
                // ✅ Mobile Support: Mobile browsers use tabs, not multi-window popups
                chrome.tabs.update(tab.id, { active: true }, () => {
                    if (chrome.runtime.lastError) {}
                });
                // ✅ Desktop Support: Bring the window forward too
                if (tab.windowId) {
                    chrome.windows.update(tab.windowId, { focused: true, drawAttention: true }, () => {
                        if (chrome.runtime.lastError) {}
                    });
                }
                console.log(`🪟 [WFM] Panel tab activated — reason: ${reason}`);
            } else {
                // Fallback if not considered a standard tab (e.g., some popup contexts)
                chrome.windows.getCurrent(panelWin => {
                    if (!panelWin) return;
                    chrome.windows.update(panelWin.id, { focused: true, drawAttention: true }, () => {
                        if (chrome.runtime.lastError) return;
                        console.log(`🪟 [WFM] Panel window focused — reason: ${reason}`);
                    });
                });
            }
        });
    } catch (e) {
        console.warn('⚠️ [WFM] Extension context lost:', e.message);
    }
}

// ─── Helper: focus panel ONLY if flag is set ──────────────────────────────────
function focusPanelIfShouldFocus(reason) {
    if (!isExtensionValid()) return;
    if (_panelShouldStayFocused) focusPanelNow(reason);
}

// ✅ Expose globally for networkWatcher.js (same page, panel context)
window._wfm_focusPanelNow = (reason) => focusPanelNow(reason);
window._wfm_focusPanelIfShouldFocus = (reason) => focusPanelIfShouldFocus(reason);

// ✅ Direct-call API for panel.js (same page — runtime.sendMessage doesn't loop back)
// panel.js MUST call these directly instead of relying on runtime.sendMessage
window._wfm_onStop = () => {
    _panelShouldStayFocused = true;
    console.log('🪟 [WFM] _wfm_onStop() called — panel focus LOCKED.');
    focusPanelNow('automation_stopped');
};
window._wfm_onAllDone = () => {
    _panelShouldStayFocused = true;
    console.log('🪟 [WFM] _wfm_onAllDone() called — panel focus LOCKED permanently.');
    focusPanelNow('all_batches_complete');
};
window._wfm_onBatchRunning = () => {
    _panelShouldStayFocused = false;
    console.log('🪟 [WFM] _wfm_onBatchRunning() — panel focus lock RELEASED (FB tab active).');
};

// ─── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {

    // ── Batch is actively running on FB → release panel focus ────────────────
    // networkWatcher.js keeps user on the Facebook tab during this phase.
    // User will be forced to FB tab, not panel.
    if (msg.type === 'status_update' && msg.running === true) {
        _panelShouldStayFocused = false;
        console.log('🪟 [WFM] Batch running on FB — panel focus lock RELEASED (FB tab is now forced).');
    }

    // ── Batch finished → lock panel focus flag (panel.js controls actual focus timing)
    // ⚠️ DO NOT call focusPanelNow() here — race condition risk:
    // FB tab's networkWatcher still has _automationRunning=true at this point.
    // If we focus panel now, FB tab fires visibilitychange → FOCUS_FB_WINDOW → loop!
    // panel.js calls _wfm_focusPanelNow() at countdown start (intermediate) or
    // after sending stop_automation to FB tab (last batch).
    if (msg.type === 'batch_post_finished') {
        _panelShouldStayFocused = true;
        console.log('🪟 [WFM] Batch finished — panel focus flag LOCKED (panel.js will focus at right time).');
    }

    // ── All batches done → keep panel focused permanently ────────────────────
    if (msg.type === 'all_batches_complete') {
        _panelShouldStayFocused = true;
        console.log('🪟 [WFM] All done — panel focus LOCKED permanently.');
        focusPanelNow('all_batches_complete');
    }

    // ── Automation stopped → bring user back to panel ─────────────────────────
    if (msg.type === 'stop_automation') {
        _panelShouldStayFocused = true;
        console.log('🪟 [WFM] Stop received — panel focus LOCKED.');
        focusPanelNow('automation_stopped');
    }
});

// ─── On panel load: restore state from storage ────────────────────────────────
// Default is true (panel forced). Only release if batch is actively running on FB.
chrome.storage.local.get(['is_automation_running', 'inter_batch_wait'], (res) => {
    if (chrome.runtime.lastError) return;
    const batchActiveOnFB = res.is_automation_running === true && res.inter_batch_wait === false;
    if (batchActiveOnFB) {
        // Batch is ACTIVELY running on FB tab right now (not in countdown)
        _panelShouldStayFocused = false;
        console.log('🪟 [WFM] Load: batch active on FB — panel focus lock RELEASED.');
    } else {
        // Idle, countdown (inter_batch_wait=true), or done — keep panel forced
        _panelShouldStayFocused = true;
        console.log('🪟 [WFM] Load: panel focus LOCKED (idle/countdown/done).');
    }
});

// ─── 1. Panel hidden (user switches away) ─────────────────────────────────────
// Only pull back if batch is done (flag is set), NOT during FB automation
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        focusPanelIfShouldFocus('panel_hidden_during_countdown');
    }
    // No action on visible — avoids focus loop
});

// ─── 2. Page FREEZE (panel about to sleep) ────────────────────────────────────
document.addEventListener('freeze', () => {
    console.warn('❄️ [WFM] Panel FREEZE!');
    focusPanelIfShouldFocus('panel_freeze');
}, { capture: true });

// ─── 3. Page RESUME (panel woke from sleep) ───────────────────────────────────
document.addEventListener('resume', () => {
    console.warn('☀️ [WFM] Panel RESUME from sleep!');
    focusPanelIfShouldFocus('panel_resume');
}, { capture: true });

// ─── 4. bfcache events ────────────────────────────────────────────────────────
window.addEventListener('pagehide', (e) => {
    if (e.persisted) focusPanelIfShouldFocus('panel_pagehide_bfcache');
});
window.addEventListener('pageshow', (e) => {
    if (e.persisted) focusPanelIfShouldFocus('panel_pageshow_restored');
});

// ─── 5. Panel discarded (unlikely for popup, guard anyway) ────────────────────
if (document.wasDiscarded) {
    chrome.storage.local.get(['is_automation_running', 'inter_batch_wait'], (res) => {
        if (chrome.runtime.lastError) return;
        const batchActiveOnFB = res.is_automation_running === true && res.inter_batch_wait === false;
        if (!batchActiveOnFB) {
            _panelShouldStayFocused = true;
            focusPanelNow('panel_discarded_recovery');
        }
    });
}

// ─── 6. Network events ────────────────────────────────────────────────────────
window.addEventListener('offline', () => {
    focusPanelIfShouldFocus('panel_network_offline');
});
window.addEventListener('online', () => {
    focusPanelIfShouldFocus('panel_network_online');
});
