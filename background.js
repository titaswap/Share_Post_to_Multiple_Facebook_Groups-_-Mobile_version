let panelTabId = null;

chrome.action.onClicked.addListener((currentTab) => {
  // Check if our panel tab is already open
  if (panelTabId !== null) {
    chrome.tabs.get(panelTabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        // Tab was closed, open a new one
        openPanelTab(currentTab.id);
      } else {
        // Tab exists, bring it to front
        chrome.tabs.update(panelTabId, { active: true });
        // Optionally update the window focus as well (for desktop)
        if (tab.windowId) {
            chrome.windows.update(tab.windowId, { focused: true, drawAttention: true });
        }
      }
    });
  } else {
    openPanelTab(currentTab.id);
  }
});

function openPanelTab(targetTabId) {
  chrome.tabs.create({
    url: `panel.html?tabId=${targetTabId}`,
    active: true
  }, (tab) => {
    panelTabId = tab.id;
  });
}

// When a tab is closed, check if it was our panel tab
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === panelTabId) {
    console.log('🚨 Panel closed. Terminating all active automation and schedules...');
    
    // 1. Reset Storage to Idle
    chrome.storage.local.set({ 
        is_automation_running: false, 
        auto_trigger_share: false 
    });
    
    // 2. Remove all scheduled tasks/triggers
    chrome.alarms.clearAll();
    chrome.storage.local.remove(['scheduled_config', 'next_trigger_time']);
    
    // 3. Notify any running content script to stop immediately
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            if (tab.url && tab.url.includes("facebook.com")) {
                chrome.tabs.sendMessage(tab.id, { type: 'stop_automation' }).catch(() => {});
            }
        });
    });

    panelWindowId = null;
  }
});

// Central Messaging Relay
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'stop_automation') {
        console.log('🛑 [BG-RELAY] Global stop_automation received. Broadcasting to all Facebook tabs...');
        // 1. Reset Storage to Idle
        chrome.storage.local.set({ 
            is_automation_running: false, 
            auto_trigger_share: false 
        });
        
        // ⚠️ DELIBERATELY COMPROMISED: We NO LONGER clear `scheduled_config` or alarms here!
        // Pressing "STOP" only halts the *current* execution.
        // The recurring schedule stays alive and will trigger again normally later.
        // (Full deactivation happens via the UI's DEACTIVATE button sending `clear_schedule_alarm`)
        
        // 2. Broadcast to all Facebook tabs
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                if (tab.url && tab.url.includes("facebook.com")) {
                    chrome.tabs.sendMessage(tab.id, { type: 'stop_automation' }).catch(() => {});
                }
            });
        });
    }

    // Scheduling Alarm Logic
    if (msg.type === 'set_schedule_alarm') {
        if (msg.recurring) {
            const nextTime = Date.now() + (msg.period * 60000);
            chrome.alarms.create('batch_schedule_alarm', { 
                periodInMinutes: msg.period,
                delayInMinutes: msg.period 
            });
            chrome.storage.local.set({ 'next_trigger_time': nextTime });
            console.log(`🔁 Recurring Trigger set: Every ${msg.period} mins. Next: ${new Date(nextTime).toLocaleTimeString()}`);
        } else {
            const targetTime = msg.time;
            chrome.alarms.create('batch_schedule_alarm', { when: targetTime });
            chrome.storage.local.set({ 'next_trigger_time': targetTime });
            console.log('📅 One-time Alarm set for:', new Date(targetTime).toLocaleString());
        }
    }
    
    if (msg.type === 'clear_schedule_alarm') {
        chrome.alarms.clear('batch_schedule_alarm');
        chrome.storage.local.remove(['next_trigger_time']);
        console.log('🗑️ Schedule Alarm Cleared.');
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'batch_schedule_alarm') {
        console.log('⏰ Trigger Alarm Fired!');
        
        // ✅ INSTANT FOCUS: Drop the panel lock and focus FB tab immediately
        chrome.runtime.sendMessage({ type: 'status_update', running: true }); 
        
        chrome.storage.local.get(['scheduled_config', 'trigger_logs'], (res) => {
            const config = res.scheduled_config;
            if (!config) return;

            // Log the trigger
            const currentLogs = res.trigger_logs || [];
            const nextRunNum = currentLogs.length + 1;
            const newLog = {
                run: nextRunNum,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
                status: 'STARTED'
            };
            currentLogs.unshift(newLog);
            const trimmedLogs = currentLogs.slice(0, 30); // Keep last 30
            chrome.storage.local.set({ trigger_logs: trimmedLogs });

            // Instantly focus an existing Facebook tab if possible before processing storage
            chrome.tabs.query({ url: "*://*.facebook.com/*" }, (tabs) => {
                const bestTab = tabs.length > 0 ? tabs[0] : null;
                if (bestTab) {
                    chrome.tabs.update(bestTab.id, { active: true }, () => {
                        if (chrome.runtime.lastError) {}
                    });
                    if (bestTab.windowId) {
                        chrome.windows.update(bestTab.windowId, { focused: true, drawAttention: true }, () => {
                            if (chrome.runtime.lastError) {}
                        });
                    }
                }

                // Update NEXT trigger time for repeating tasks
                if (config.isRecurring) {
                    const nextTime = Date.now() + (config.periodMins * 60000);
                    chrome.storage.local.set({ 'next_trigger_time': nextTime });
                }

                // 1. Prepare storage for Automation Flow
                chrome.storage.local.set({
                    'auto_trigger_share': true,
                    'all_batches': config.batches,
                    'total_groups_count': config.totalGroups,
                    'groups_processed_so_far': 0,
                    'current_batch_index': 0,
                    'current_batch_delay': config.batchDelay,
                    'current_post_url': config.url,
                    'auto_select_groups': config.batches[0] // Load first batch
                }, () => {
                // 2. Locate Best Tab (Existing Facebook Tab > New Tab)
                const executeInTab = (tabId) => {
                    chrome.tabs.update(tabId, { url: config.url }, (updatedTab) => {
                        if (chrome.runtime.lastError || !updatedTab) {
                            // Fallback if update failed mysteriously
                            chrome.tabs.create({ url: config.url }, (newTab) => {
                                chrome.storage.local.set({ lastAutomationTabId: newTab.id });
                                // Focus new tab's window
                                chrome.windows.update(newTab.windowId, { focused: true, drawAttention: true });
                            });
                        } else {
                            chrome.storage.local.set({ lastAutomationTabId: tabId });
                            // ✅ Focus the Facebook browser window
                            // On mobile this might not do much, but `updatedTab.active` was set to true above which works!
                            if (updatedTab.windowId) {
                                chrome.windows.update(updatedTab.windowId, { focused: true, drawAttention: true }, () => {
                                    if (chrome.runtime.lastError) {}
                                });
                                console.log('🪟 [ALARM] Facebook window focused.');
                            }
                            // We no longer manually pull the panel up! 
                            // windowFocusManager will cleanly pull the panel back up ONLY when the batch finishes.
                        }
                    });
                    console.log('🚀 Automation Triggered Successfully in Facebook Tab!');
                    // Notify extension panel (runtime.sendMessage → extension pages only)
                    chrome.runtime.sendMessage({ type: 'status_update', running: true });
                    // Notify content scripts (networkWatcher.js) — must use tabs.sendMessage
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tabId, { type: 'status_update', running: true }, () => {
                            if (chrome.runtime.lastError) {} // tab may not be ready yet, storage fallback handles it
                        });
                    }, 3000); // wait 3s for page/content scripts to load after URL change

                    if (!config.isRecurring) {
                        chrome.storage.local.remove(['scheduled_config', 'next_trigger_time']);
                    }
                };

                if (bestTab) {
                    executeInTab(bestTab.id);
                } else {
                    // No FB tab, create a new one
                    chrome.tabs.create({ url: config.url }, (newTab) => {
                        executeInTab(newTab.id);
                    });
                }
            });
            });
        });
    }
});

// ─── UNIVERSAL WINDOW FOCUS + TOAST NOTIFICATION HANDLER ─────────────────────
// Content scripts send { action: 'FOCUS_FB_WINDOW', reason: '...' } to:
//   1. Focus the Facebook browser window (focused + drawAttention)
//   2. Show an OS-level toast notification (visible even in full-screen)

let _lastNotifyTime = 0; // debounce: max 1 notification per 20s
let _focusedTabId = null;

// Human-readable messages for each retry reason
const _notifyMessages = {
    share_menu_scan_retry:   'Share menu is slow to load. Retrying...',
    share_menu_not_found:    '❌ Share menu not found! Reloading batch...',
    dialog_slow:             'Group dialog is taking too long. Still waiting...',
    spinner_slow:            'Network slow — spinner still visible. Waiting...',
    dialog_timeout:          '⚠️ Group dialog timed out! Retrying batch...',
    checkbox_not_found:      'Group checkboxes not found. Retrying...',
    save_button_not_found:   'Save/Done button not found. Retrying...',
    post_button_not_found:   'POST button not found. Retrying...',
};

chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg.action === 'FOCUS_FB_WINDOW') {
        const tabId = sender.tab?.id;
        if (!tabId) return;

        // Force FB tab back to front — chained (not parallel) to avoid race condition
        const forceFocusFBTab = (attempt = 1) => {
            chrome.tabs.get(tabId, (tab) => {
                if (chrome.runtime.lastError || !tab?.windowId) return;

                // Step 1: Make FB tab the active tab within its window
                chrome.tabs.update(tabId, { active: true }, () => {
                    if (chrome.runtime.lastError) {
                        console.warn(`⚠️ [BG-FOCUS] tabs.update failed (attempt ${attempt}):`, chrome.runtime.lastError.message);
                        return;
                    }
                    // Step 2: AFTER tab is active, focus the window
                    chrome.windows.update(tab.windowId, { focused: true, drawAttention: true }, () => {
                        if (chrome.runtime.lastError) return;
                        console.log(`🪟 [BG-FOCUS] ✅ FB tab active + window focused (reason: ${msg.reason}, attempt: ${attempt})`);
                    });
                });
            });
        };

        // Attempt 1: immediately
        forceFocusFBTab(1);
        // Attempt 2: retry after 200ms (Chrome may block first attempt if user is mid-action)
        setTimeout(() => forceFocusFBTab(2), 200);

        // 2. Toast notification — debounced (max 1 per 20s to avoid spam)
        const now = Date.now();
        if (now - _lastNotifyTime < 20000) return;
        _lastNotifyTime = now;
        _focusedTabId = tabId;

        const reason = msg.reason || 'step retry';
        const notifyMsg = _notifyMessages[reason] || `Step retry: ${reason}`;

        chrome.notifications.create('fb_automation_alert', {
            type:     'basic',
            iconUrl:  'icon.png',
            title:    '🤖 FB Automation — Attention Needed',
            message:  notifyMsg,
            priority: 2,
            requireInteraction: false  // auto-dismiss after ~5s
        }, (notifId) => {
            if (chrome.runtime.lastError) {
                console.warn('⚠️ Notification failed:', chrome.runtime.lastError.message);
            } else {
                console.log(`🔔 [BG-NOTIFY] Toast shown: "${notifyMsg}"`);
            }
        });
    }
});

// Clicking the notification → bring Facebook tab to front
chrome.notifications.onClicked.addListener((notifId) => {
    if (notifId === 'fb_automation_alert' && _focusedTabId) {
        chrome.tabs.update(_focusedTabId, { active: true });
        chrome.tabs.get(_focusedTabId, (tab) => {
            if (tab?.windowId) chrome.windows.update(tab.windowId, { focused: true, drawAttention: true });

        });
        chrome.notifications.clear('fb_automation_alert');
    }
});

// ─── DEBUGGER TYPING ENGINE ───────────────────────────────────────────────────
// Uses chrome.debugger (DevTools protocol) to simulate REAL trusted keystrokes.
// Required for Facebook's React editor which rejects all DOM-based text input.

let debuggerBusy = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'DEBUGGER_TYPE') {
        const tabId = sender.tab?.id;
        if (!tabId) {
            console.error('❌ [DEBUGGER] No tabId in sender.');
            sendResponse({ success: false, error: 'No tabId' });
            return true;
        }
        handleDebuggerTyping(tabId, msg.text)
            .then(() => sendResponse({ success: true }))
            .catch(e => sendResponse({ success: false, error: e?.message }));
        return true; // Keep channel open for async response
    }
});

async function handleDebuggerTyping(tabId, text) {
    // Prevent concurrent attach conflicts
    let waited = 0;
    while (debuggerBusy && waited < 5000) {
        await new Promise(r => setTimeout(r, 100));
        waited += 100;
    }
    debuggerBusy = true;
    console.log(`🖊️ [DEBUGGER] Typing ${text.length} chars in tab ${tabId}...`);

    try {
        await chrome.debugger.attach({ tabId }, '1.3');
        await new Promise(r => setTimeout(r, 300)); // settle after attach

        for (const char of text) {
            const base = {
                text: char,
                unmodifiedText: char,
                key: char,
                windowsVirtualKeyCode: char.charCodeAt(0),
                nativeVirtualKeyCode: char.charCodeAt(0),
            };
            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { ...base, type: 'keyDown' });
            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
            await new Promise(r => setTimeout(r, 40)); // human-like delay
        }

        console.log('✅ [DEBUGGER] Typing complete.');
        await chrome.debugger.detach({ tabId });

    } catch (e) {
        console.error('❌ [DEBUGGER] Error:', e);
        try { await chrome.debugger.detach({ tabId }); } catch {}
        throw e;
    } finally {
        debuggerBusy = false;
    }
}
