// ============================================================
// panel_automation.js
// Extracted from panel.js — Runtime message listener (progress,
// batch control, retry), jumpToNextBatch, updateUIProgress,
// addActivityLog / addActivityLogBatch, renderActivityLogs,
// updateSignalStatus.
// ZERO logic changes. Shared batch state hoisted to global scope.
// ============================================================

// ============================================================
// SHARED AUTOMATION STATE (was inside DOMContentLoaded closure)
// ============================================================
var activeBatchWaitTimer = null;
var activeBatchWaitInterval = null;
var isSkipInProgress = false;
var currentBatchRetries = 0;

// ============================================================
// PROGRESS UI
// ============================================================
function updateUIProgress(done, total, batchActive, batchTotal, hint = "") {
  const box = document.getElementById('progress-tracking-box');
  const fill = document.getElementById('progress-bar-fill');
  const percentTxt = document.getElementById('percent-complete');
  const batchTitle = document.getElementById('batch-progress-title');
  const countTxt = document.getElementById('groups-count-progress');
  const hintTxt = document.getElementById('detailed-status-hint');

  if (!box || !total) return;

  const percent = Math.round((done / total) * 100);
  if (fill) fill.style.width = percent + '%';
  if (percentTxt) percentTxt.textContent = percent + '%';
  if (batchTitle) batchTitle.textContent = `Batch ${batchActive} of ${batchTotal}`;
  if (countTxt) countTxt.textContent = `${done} / ${total} Groups Shared`;
  if (hint && hintTxt) hintTxt.textContent = hint;

  // ── n8n-style Node Highlighting ───────────────────────────
  const nodes = {
    nav:    document.getElementById('node-nav'),
    stab:   document.getElementById('node-stab'),
    menu:   document.getElementById('node-menu'),
    select: document.getElementById('node-select'),
    save:   document.getElementById('node-save'),
    post:   document.getElementById('node-post')
  };

  const resetNodes = () => Object.values(nodes).forEach(n => n?.classList.remove('active', 'completed'));
  const setNode    = (id, state) => nodes[id]?.classList.add(state);

  resetNodes();

  if (hint.includes("Navigating")) {
    setNode('nav', 'active');
  } else if (hint.includes("Stabilizing")) {
    setNode('nav', 'completed');
    setNode('stab', 'active');
  } else if (hint.includes("Opening") || hint.includes("Clicking Share")) {
    setNode('nav', 'completed');
    setNode('stab', 'completed');
    setNode('menu', 'active');
  } else if (hint.includes("list") || hint.includes("Selected:") || hint.includes("Dialog") || hint.includes("Loading Groups")) {
    setNode('nav', 'completed');
    setNode('stab', 'completed');
    setNode('menu', 'completed');
    setNode('select', 'active');
  } else if (hint.includes("SAVE") || hint.includes("Confirming") || hint.includes("Clicking Save")) {
    setNode('nav', 'completed');
    setNode('stab', 'completed');
    setNode('menu', 'completed');
    setNode('select', 'completed');
    setNode('save', 'active');
  } else if (hint.includes("POST") || hint.includes("Finalizing") || hint.includes("Clicking POST") || hint.includes("Waiting for POST")) {
    setNode('nav', 'completed');
    setNode('stab', 'completed');
    setNode('menu', 'completed');
    setNode('select', 'completed');
    setNode('save', 'completed');
    setNode('post', 'active');
  } else if (hint.includes("Submitting") || hint.includes("FINISHED")) {
    setNode('nav', 'completed');
    setNode('stab', 'completed');
    setNode('menu', 'completed');
    setNode('select', 'completed');
    setNode('save', 'completed');
    setNode('post', 'completed');
  }

  if (done === total && total > 0) {
    if (hintTxt) hintTxt.textContent = "All Tasks Completed!";
    box.style.borderColor = "rgba(0, 255, 136, 0.4)";
    Object.values(nodes).forEach(n => n?.classList.add('completed'));
  } else {
    box.style.borderColor = "rgba(30,178,255,0.2)";
  }
}

// ============================================================
// ACTIVITY LOG STORAGE
// ============================================================
function addActivityLog(entry) {
  chrome.storage.local.get(['activityLogs', 'currentRunNumber'], (res) => {
    const logs = res.activityLogs || [];
    const runNumber = res.currentRunNumber || 1;
    logs.push({
      id: Date.now(),
      runNumber: runNumber,
      icon: entry.icon || 'ℹ️',
      msg: entry.msg || '',
      status: entry.status || 'info',
      groupName: entry.groupName || '',
      postContent: entry.postContent ? entry.postContent.substring(0, 50) : '',
      timestamp: new Date().toLocaleTimeString()
    });
    chrome.storage.local.set({ activityLogs: logs });
  });
}

function addActivityLogBatch(entries) {
  chrome.storage.local.get(['activityLogs', 'currentRunNumber'], (res) => {
    const logs = res.activityLogs || [];
    const runNumber = res.currentRunNumber || 1;
    const now = Date.now();
    entries.forEach((entry, i) => {
      logs.push({
        id: now + i,
        runNumber: runNumber,
        icon: entry.icon || '✅',
        msg: entry.msg || '',
        status: entry.status || 'success',
        groupName: entry.groupName || '',
        postContent: entry.postContent ? entry.postContent.substring(0, 50) : '',
        timestamp: new Date().toLocaleTimeString()
      });
    });
    chrome.storage.local.set({ activityLogs: logs });
  });
}

// ============================================================
// ACTIVITY LOG RENDER (Premium Table View)
// ============================================================
function renderActivityLogs() {
  const container = document.getElementById('log-entries');
  if (!container) return;

  chrome.storage.local.get(['activityLogs'], (res) => {
    const logs = res.activityLogs || [];
    if (logs.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: #9ca3af; padding: 20px;">No activity logged yet.</p>';
      return;
    }

    // 1. Calculate Summary Stats
    const successCount = logs.filter(l => l.status === 'success').length;
    const failedCount = logs.filter(l => l.status === 'failed').length;
    
    let durationStr = '0s';
    if (logs.length > 1) {
        const sorted = [...logs].sort((a,b) => a.id - b.id);
        const diffMs = sorted[sorted.length-1].id - sorted[0].id;
        const h = Math.floor(diffMs / 3600000);
        const m = Math.floor((diffMs % 3600000) / 60000);
        const s = Math.floor((diffMs % 60000) / 1000);
        durationStr = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
    }

    // 2. Summary Header UI
    let html = `
      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:1px; background: rgba(255,255,255,0.05); margin-bottom:15px; border:1px solid rgba(255,255,255,0.1); border-radius:10px; overflow:hidden;">
          <div style="padding:15px 5px; text-align:center; background:#0d1d2f;">
              <div style="color:#4ade80; font-size:18px; font-weight:800; line-height:1;">${successCount}</div>
              <div style="color:rgba(255,255,255,0.4); font-size:9px; font-weight:700; margin-top:5px; text-transform:uppercase; letter-spacing:0.5px;">Success</div>
          </div>
          <div style="padding:15px 5px; text-align:center; background:#0d1d2f;">
              <div style="color:#f87171; font-size:18px; font-weight:800; line-height:1;">${failedCount}</div>
              <div style="color:rgba(255,255,255,0.4); font-size:9px; font-weight:700; margin-top:5px; text-transform:uppercase; letter-spacing:0.5px;">Failed</div>
          </div>
          <div style="padding:15px 5px; text-align:center; background:#0d1d2f;">
              <div style="color:#1eb2ff; font-size:18px; font-weight:800; line-height:1; white-space:nowrap; padding:0 3px;">${durationStr}</div>
              <div style="color:rgba(255,255,255,0.4); font-size:9px; font-weight:700; margin-top:5px; text-transform:uppercase; letter-spacing:0.5px;">Duration</div>
          </div>
          <div style="padding:15px 5px; text-align:center; background:#0d1d2f;">
              <div style="color:#fff; font-size:18px; font-weight:800; line-height:1;">${logs.length}</div>
              <div style="color:rgba(255,255,255,0.4); font-size:9px; font-weight:700; margin-top:5px; text-transform:uppercase; letter-spacing:0.5px;">Total</div>
          </div>
      </div>

      <!-- Table View -->
      <div style="border:1px solid rgba(255,255,255,0.1); border-radius:10px; overflow:hidden; background:#0d1d2f;">
          <table style="width:100%; border-collapse:collapse; text-align:left; font-size:11px;">
              <thead>
                  <tr style="background:rgba(30,178,255,0.08); border-bottom:1px solid rgba(255,255,255,0.1);">
                      <th style="padding:10px; color:#fff; font-weight:700; width:40px;">Run</th>
                      <th style="padding:10px; color:#fff; font-weight:700; width:60px;">Status</th>
                      <th style="padding:10px; color:#fff; font-weight:700;">Group Info</th>
                      <th style="padding:10px; color:#fff; font-weight:700; text-align:right;">Time</th>
                  </tr>
              </thead>
              <tbody>
                  ${logs.map(log => {
                      const isPostLog = !!log.groupName;
                      if (!isPostLog) {
                          return `
                              <tr style="border-bottom:1px solid rgba(255,255,255,0.03); background:rgba(255,255,255,0.01);">
                                  <td style="padding:8px 10px; color:rgba(255,255,255,0.2); text-align:center;">-</td>
                                  <td style="padding:8px 10px;"><span style="color:#9ca3af; background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px; font-size:9px; font-weight:800;">INFO</span></td>
                                  <td colspan="1" style="padding:8px 10px; color:rgba(255,255,255,0.5); font-style:italic;">${log.msg}</td>
                                  <td style="padding:8px 10px; color:rgba(255,255,255,0.3); text-align:right; font-size:9px;">${log.timestamp}</td>
                              </tr>
                          `;
                      }
                      
                      const statusColor = log.status === 'success' ? '#4ade80' : '#f87171';
                      return `
                      <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                          <td style="padding:12px 10px; color:#1eb2ff; font-weight:800; text-align:center;">${log.runNumber}</td>
                          <td style="padding:12px 10px;"><span style="color:${statusColor}; font-weight:900; letter-spacing:0.5px;">${log.status.toUpperCase()}</span></td>
                          <td style="padding:12px 10px;">
                              <div style="color:#fff; font-weight:700; font-size:12px; margin-bottom:2px;">${log.groupName} ${log.status === 'success' ? '✅' : '❌'}</div>
                              <div style="color:rgba(255,255,255,0.3); font-size:9px;">Post: ${log.postContent.substring(0, 30)}...</div>
                          </td>
                          <td style="padding:12px 10px; color:rgba(255,255,255,0.4); text-align:right; font-weight:600; font-size:10px;">${log.timestamp}</td>
                      </tr>
                      `;
                  }).join('')}
              </tbody>
          </table>
      </div>
    `;
    container.innerHTML = html;
  });
}

// ============================================================
// SYSTEM STATUS SIGNAL
// ============================================================
function updateSignalStatus(running) {
  if (isSkipInProgress) return;
  
  const skipBatchBtn = document.getElementById('skip-batch-btn');
  const indicator = document.getElementById('system-status');
  const text = document.getElementById('signal-status-text');
  const stopBtn = document.getElementById('stop-automation-btn');
  
  // Check if a trigger is actually armed in the background
  chrome.storage.local.get(['scheduled_config'], (res) => {
      const isArmed = res.scheduled_config && res.scheduled_config.isRecurring;

      if (running) {
          indicator?.classList.add('is-running');
          indicator?.classList.remove('is-armed');
          if (text) text.textContent = 'SYSTEM RUNNING...';
          if (stopBtn) stopBtn.classList.remove('hidden');
          if (skipBatchBtn) skipBatchBtn.classList.remove('hidden');
      } else if (isArmed) {
          indicator?.classList.remove('is-running');
          indicator?.classList.add('is-armed');
          if (text) text.textContent = 'TRIGGER ARMED';
          if (stopBtn) stopBtn.classList.add('hidden');
          if (skipBatchBtn) skipBatchBtn.classList.add('hidden');
      } else {
          indicator?.classList.remove('is-running');
          indicator?.classList.remove('is-armed');
          if (text) text.textContent = 'SYSTEM IDLE';
          if (stopBtn) stopBtn.classList.add('hidden');
          if (skipBatchBtn) skipBatchBtn.classList.add('hidden');
      }
  });
}

// ============================================================
// JUMP TO NEXT BATCH (Manual Skip)
// ============================================================
function jumpToNextBatch() {
  const skipBatchBtn = document.getElementById('skip-batch-btn');
  const hintTxt = document.getElementById('detailed-status-hint');

  const cleanupSkip = () => {
    isSkipInProgress = false;
    if (skipBatchBtn) {
      skipBatchBtn.disabled = false;
      skipBatchBtn.innerHTML = '<span>⏭️</span> SKIP';
      skipBatchBtn.style.opacity = '1';
    }
    if (hintTxt) hintTxt.textContent = "Ready.";
  };

  if (activeBatchWaitTimer) {
    clearTimeout(activeBatchWaitTimer);
    activeBatchWaitTimer = null;
  }
  if (activeBatchWaitInterval) {
    clearInterval(activeBatchWaitInterval);
    activeBatchWaitInterval = null;
  }

  const targetTabId = getTargetTabId();
  
  if (skipBatchBtn) {
    isSkipInProgress = true;
    skipBatchBtn.disabled = true;
    skipBatchBtn.innerHTML = '<span>⏳</span> SKIPPING...';
    skipBatchBtn.style.opacity = '0.6';
  }
  
  if (hintTxt) hintTxt.textContent = "Skipping batch in 2s...";
  addActivityLog({ msg: "Manual Skip triggered. Closing current task...", status: "info", icon: "⏭️" });
  
  if (targetTabId) {
    chrome.tabs.sendMessage(targetTabId, { type: 'stop_automation' }).catch(() => {});
  }
  // ✅ Direct call (same-page) — runtime.sendMessage doesn't loop back to same page
  if (typeof window._wfm_onStop === 'function') window._wfm_onStop();
  chrome.runtime.sendMessage({ type: 'stop_automation' }).catch(() => {});


  setTimeout(() => {
    try {
      chrome.storage.local.get(['all_batches', 'current_batch_index', 'current_post_url', 'is_automation_running'], (res) => {
        // Note: We ignore res.is_automation_running here to force skip if requested
        
        const batches = res.all_batches || [];
        const rawIndex = res.current_batch_index;
        const currentIndex = (rawIndex === undefined || rawIndex === null) ? 0 : parseInt(rawIndex);
        const nextIndex = currentIndex + 1;
        const url = res.current_post_url;

        console.log(`Manual Skip Logic: From ${currentIndex} to ${nextIndex}. Total Batches: ${batches.length}`);

        if (batches.length === 0) {
          addActivityLog({ msg: "Skip Failed: No batches found in queue.", status: "failed", icon: "❌" });
          cleanupSkip();
          return;
        }

        if (nextIndex < batches.length) {
          addActivityLog({ msg: `Manual Skip: Moving to Batch #${nextIndex + 1} of ${batches.length}...`, status: "info", icon: "⏭️" });
          
          chrome.storage.local.set({
              'current_batch_index': nextIndex,
              'auto_select_groups': batches[nextIndex],
              'auto_trigger_share': true,
              'is_automation_running': true // Force resume if it was halted
          }, () => {
               // RESET PROGRESS ICONS IMMEDIATELY ON SKIP
               document.querySelectorAll('.step-node').forEach(node => {
                   node.classList.remove('active', 'completed');
               });
               document.getElementById('node-nav')?.classList.add('active');
               
               const doneSoFar = res.groups_processed_so_far || 0;
               const totalCount = res.total_groups_count || 0;
               updateUIProgress(doneSoFar, totalCount, nextIndex + 1, batches.length, "Skipping... Navigating next batch.");

               // ✅ FIX: Schedule flow has no tabId in URL → use provideActiveTab
               const currentTabId = getTargetTabId();
               const doSkipNav = (tabId) => {
                 if (!tabId) { addActivityLog({ msg: "Skip Failed: No Facebook tab found.", status: "failed", icon: "❌" }); return; }
                 chrome.tabs.update(tabId, { url: url, active: true }, (tabDetails) => {
                    if (tabDetails && tabDetails.windowId) {
                        chrome.windows.update(tabDetails.windowId, { focused: true, drawAttention: true });
                    }
                    console.log("Navigation triggered successfully.");
                    cleanupSkip();
                    if (skipBatchBtn) skipBatchBtn.classList.add('hidden');
                 });
               };
               if (currentTabId) { doSkipNav(currentTabId); }
               else { provideActiveTab((tabId) => doSkipNav(tabId)); }
          });
        } else {
          addActivityLog({ msg: "Manual Skip: Campaign finished via skip.", status: "info", icon: "🏁" });
          chrome.storage.local.set({ is_automation_running: false, auto_trigger_share: false, inter_batch_wait: false }, () => {
            cleanupSkip();
            updateSignalStatus(false);
            showCustomAlert("Campaign Finished", "There are no more batches in the queue.", "🏁");
            if (skipBatchBtn) skipBatchBtn.classList.add('hidden');
          });
        }
      });
    } catch (err) {
      console.error("Skip Processing Error:", err);
      addActivityLog({ msg: `Critical Error during skip: ${err.message}`, status: "failed", icon: "⚠️" });
      cleanupSkip();
    }
  }, 2000);
}

// ============================================================
// initAutomationListeners — registers the runtime message
// listener and skip/stop/activity-log button handlers.
// Called once from panel.js DOMContentLoaded.
// ============================================================

let fbNetworkWatchdogTimer = null;
let lastFbNetworkActivity = Date.now();

function initAutomationListeners() {
  const skipBatchBtn = document.getElementById('skip-batch-btn');

  // ── Watchdog: Catch Dead/Frozen Tabs (ERR_TOO_MANY_REDIRECTS) ──
  if (fbNetworkWatchdogTimer) clearInterval(fbNetworkWatchdogTimer);
  fbNetworkWatchdogTimer = setInterval(() => {
     chrome.storage.local.get(['is_automation_running', 'inter_batch_wait', 'current_post_url'], (res) => {
         if (res.is_automation_running === true && res.inter_batch_wait === false) {
             const idleTime = Date.now() - lastFbNetworkActivity;
             if (idleTime > 60000) { // 60 seconds without a single ping
                 console.error("🛑 [WATCHDOG] Tab is dead or stuck (ERR_TOO_MANY_REDIRECTS). Attempting retry!");
                 lastFbNetworkActivity = Date.now(); // reset to prevent spamming
                 
                 if (currentBatchRetries < 2) {
                     currentBatchRetries++;
                     addActivityLog({ msg: `Tab froze or crashed. Retrying page load (Attempt ${currentBatchRetries}/2)...`, status: "warning", icon: "🔄" });
                     
                     const tabIdFromUrl = getTargetTabId();
                     const doRetry = (tabId) => {
                         if (!tabId) return;
                         console.log("🔄 Watchdog reloading tab:", tabId);
                         chrome.tabs.update(tabId, { url: res.current_post_url, active: true });
                     };
                     
                     if (tabIdFromUrl) {
                         doRetry(tabIdFromUrl);
                     } else {
                         // Schedule flow: find the active Facebook tab
                         if (typeof provideActiveTab === 'function') {
                             provideActiveTab((tabId) => doRetry(tabId));
                         }
                     }
                 } else {
                     addActivityLog({ msg: "Facebook stuck repeatedly. Auto-skipping batch.", status: "failed", icon: "🛑" });
                     currentBatchRetries = 0; // reset retries
                     jumpToNextBatch();
                 }
             }
         } else {
             lastFbNetworkActivity = Date.now(); // keep resetting while idle or waiting
         }
     });
  }, 5000);

  // ── Listener for Live Progress Updates from Content Scripts ─
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Reset watchdog on ANY automation message from the Facebook tab
    if (['progress_log', 'task_countdown', 'post_result', 'batch_post_finished'].includes(msg.type)) {
        lastFbNetworkActivity = Date.now();
    }

    if (msg.type === 'progress_log') {
        chrome.storage.local.get(['groups_processed_so_far', 'total_groups_count', 'current_batch_index', 'all_batches'], (res) => {
           const done = res.groups_processed_so_far || 0;
           const total = res.total_groups_count || 0;
           const batchIdx = res.current_batch_index || 0;
           const batches = res.all_batches || [];
           
           updateUIProgress(done, total, batchIdx + 1, batches.length, msg.hint || "");
        });
    }

    // New: Mirror Task Countdown from Page to Panel
    if (msg.type === 'task_countdown') {
        const statusOverlay = document.getElementById('status-overlay');
        const nameNode = document.getElementById('panel-task-name');
        const timerNode = document.getElementById('panel-task-timer');
        
        if (msg.stepIndex > 0) {
            const nodes = document.querySelectorAll('.step-node');
            if (nodes[msg.stepIndex]) {
                nodes[msg.stepIndex].classList.add('active', 'completed');
            }
        }

        if (statusOverlay) {
            if (msg.active) {
                statusOverlay.classList.remove('hidden');
                if (nameNode) nameNode.textContent = msg.name + '...';
                if (timerNode) timerNode.textContent = msg.remaining + 's';
            } else {
                statusOverlay.classList.add('hidden');
            }
        }
    }

    if (msg.type === 'selection_progress') {
        const progressNode = document.getElementById('groups-count-progress');
        if (progressNode) {
            progressNode.textContent = `${msg.current} / ${msg.total} Selecting...`;
            progressNode.style.color = "#1eb2ff"; // Make it blue during selection
        }
    }

    // Handle Batch Completion
    if (msg.type === 'batch_post_finished') {
       console.log("🏁 Batch completion received. Updating Activity Log...");

       // Use actual data sent from groupSelector.js
       const groupNames = msg.groupNames || [];
       const groupsShared = msg.groupsShared || groupNames.length || 0;

       // ✅ Increment SUCCESS count with ACTUAL shared count
       if (typeof stats !== 'undefined') {
           stats.success += groupsShared;
           updateActivityStatsUI();
       }

       // ✅ Log ALL GROUPS atomically in ONE storage write (prevents race condition)
       if (groupNames.length > 0) {
           addActivityLogBatch(groupNames.map(name => ({
               msg: name,
               status: 'success',
               icon: '✅',
               groupName: name
           })));
       } else {
           addActivityLog({
               msg: `Shared to ${groupsShared} group(s) successfully.`,
               status: 'success',
               icon: '✅'
           });
       }

       const progressNode = document.getElementById('groups-count-progress');
       if (progressNode) progressNode.style.color = "#fff";

       // --- UI CLEANUP FOR NEXT BATCH ---
       document.querySelectorAll('.step-node').forEach(node => {
           node.classList.remove('active', 'completed');
       });
       

       chrome.storage.local.get(['all_batches', 'current_batch_index', 'current_post_url', 'is_automation_running', 'current_batch_delay', 'groups_processed_so_far', 'total_groups_count'], (res) => {
          // EMERGENCY STOP: Don't move to next batch if user stopped
          if (res.is_automation_running === false) {
             console.log("🛑 Automation Halt: Stopping batch transition because 'STOP' was pressed.");
             return;
          }

          // ✅ SAFETY: Disable auto_trigger immediately to prevent reload re-runs
          chrome.storage.local.set({ auto_trigger_share: false });
          console.log("🔒 [PANEL] auto_trigger_share disabled during inter-batch wait.");

          const batches = res.all_batches || [];
          const currentIndex = res.current_batch_index || 0;
          const url = res.current_post_url;
          const userDelay = res.current_batch_delay || 30; 
          const nextIndex = currentIndex + 1;


          if (nextIndex < batches.length) {
             // Add a small random jitter to keep it human-like
             const jitter = Math.floor(Math.random() * (userDelay * 0.2)) - (userDelay * 0.1);
             const finalDelay = Math.max(5, userDelay + jitter);

             console.log(`⏳ Batch ${currentIndex + 1} finished. Waiting ${finalDelay.toFixed(0)}s before Batch ${nextIndex + 1}...`);
             if (skipBatchBtn) skipBatchBtn.classList.remove('hidden');
             updateSignalStatus(true);

             // Mark inter-batch countdown in storage (used by WFM/NW on reload)
             chrome.storage.local.set({ inter_batch_wait: true });

             // ── KEY FIX: Focus panel ONLY inside sendMessage CALLBACK ────────
             // Reason: if we call focusPanelNow() BEFORE stop_automation is
             // processed by the FB tab, the FB tab's visibilitychange fires
             // with _automationRunning=true → FOCUS_FB_WINDOW → race condition.
             // Putting focusPanelNow() inside the callback guarantees the FB tab
             // has already set _automationRunning=false before panel steals focus.
             const _startCountdownAfterUnlock = () => {
               if (typeof window._wfm_focusPanelNow === 'function') {
                 window._wfm_focusPanelNow('batch_countdown_start');
               }
             };

             const _fbTabIdNow = getTargetTabId();

             const _sendStopThenFocus = (fbTabId) => {
               if (!fbTabId) {
                 // No FB tab — just focus panel immediately
                 _startCountdownAfterUnlock();
                 return;
               }
               // Send pause (not stop) — preserves inter_batch_wait flag in storage.
               // pause_for_batch_wait only stops the FB tab's focus lock/watchdog
               // without resetting inter_batch_wait which WFM depends on.
               chrome.tabs.sendMessage(fbTabId, { type: 'pause_for_batch_wait' }, () => {
                 if (chrome.runtime.lastError) {} // tab might be gone — ignore
                 _startCountdownAfterUnlock();
               });
             };

             if (_fbTabIdNow) {
               _sendStopThenFocus(_fbTabIdNow);
             } else {
               provideActiveTab((t) => _sendStopThenFocus(t));
             }

               // LIVE COUNTDOWN TIMER for Batch Transition
               let remBatchTime = Math.round(finalDelay);
               
               // CLEAR PREVIOUS TO AVOID DUPLICATES
               if (activeBatchWaitTimer) { clearTimeout(activeBatchWaitTimer); activeBatchWaitTimer = null; }
               if (activeBatchWaitInterval) { clearInterval(activeBatchWaitInterval); activeBatchWaitInterval = null; }

               activeBatchWaitInterval = setInterval(() => {
                  // ZOMBIE CHECK: Stop ONLY if user explicitly pressed STOP.
                  // Check inter_batch_wait (panel-owned flag) NOT is_automation_running
                  // because pause_for_batch_wait intentionally leaves is_automation_running
                  // untouched, and any FB tab script could set it false accidentally.
                  chrome.storage.local.get(['inter_batch_wait'], (status) => {
                      if (status.inter_batch_wait === false) {
                          // Panel cleared this → user pressed STOP or campaign ended
                          clearInterval(activeBatchWaitInterval);
                          activeBatchWaitInterval = null;
                          return;
                      }

                      remBatchTime--;
                      if (remBatchTime > 0) {
                          updateUIProgress(res.groups_processed_so_far, res.total_groups_count, currentIndex + 1, batches.length, `Waiting ${remBatchTime}s for next batch...`);
                      } else {
                          clearInterval(activeBatchWaitInterval);
                          activeBatchWaitInterval = null;
                      }
                  });
               }, 1000);
 
               activeBatchWaitTimer = setTimeout(() => {
                  clearInterval(activeBatchWaitInterval);
                  activeBatchWaitInterval = null;
                  activeBatchWaitTimer = null;
                  if (skipBatchBtn) skipBatchBtn.classList.add('hidden');
                  
                  chrome.storage.local.get(['is_automation_running'], (statusRes) => {
                     if (!statusRes.is_automation_running) return;
 
                     console.log(`➡️ Moving to Batch ${nextIndex + 1} / ${batches.length}`);
                    chrome.storage.local.set({
                        'current_batch_index': nextIndex,
                        'auto_select_groups': batches[nextIndex],
                        'auto_trigger_share': true,
                        'inter_batch_wait': false    // ← countdown over, batch resuming
                    }, () => {
                        // ── STEP 3: Release panel focus → hand back to FB tab ───
                        // Tell WFM batch is running again on FB
                        if (typeof window._wfm_onBatchRunning === 'function') {
                            window._wfm_onBatchRunning();
                        }

                        const tabIdFromUrl = getTargetTabId();

                        const doNextBatch = (targetTabId) => {
                            if (!targetTabId) {
                                showCustomAlert("Tab Lost", "No Facebook tab found. Automation halted.", "🛑");
                                chrome.storage.local.set({ is_automation_running: false });
                                updateSignalStatus(false);
                                return;
                            }
                            chrome.tabs.get(targetTabId, (ctab) => {
                               if (chrome.runtime.lastError || !ctab) {
                                  showCustomAlert("Tab Lost", "Target tab closed. Automation halted.", "🛑");
                                  chrome.storage.local.set({ is_automation_running: false });
                                  updateSignalStatus(false);
                                  return;
                               }

                               // --- RESET UI FOR NEW BATCH ---
                               document.querySelectorAll('.step-node').forEach(node => {
                                   node.classList.remove('active', 'completed');
                               });
                               document.getElementById('node-nav')?.classList.add('active');

                               chrome.tabs.update(targetTabId, { url: url, active: true });
                               chrome.windows.update(ctab.windowId, { focused: true, drawAttention: true });
                            });
                        };

                        if (tabIdFromUrl) {
                            doNextBatch(tabIdFromUrl);
                        } else {
                            // Schedule flow: find the active Facebook tab
                            provideActiveTab((tabId) => doNextBatch(tabId));
                        }
                    });
                 });
              }, finalDelay * 1000);
          } else {
             console.log("✨ All batches finished successfully!");
             chrome.storage.local.set({ is_automation_running: false, auto_trigger_share: false });
             updateSignalStatus(false);
             updateUIProgress(res.total_groups_count, res.total_groups_count, batches.length, batches.length, "All Batches Finished!");

             // ✅ CRITICAL: Stop FB tab's networkWatcher FIRST, then focus panel.
             // Race condition fix: if we focus panel BEFORE stop_automation reaches FB tab,
             // FB networkWatcher (_automationRunning=true) fires FOCUS_FB_WINDOW immediately
             // → panel + FB both end up focused in a loop ❌
             // Solution: send stop_automation with CALLBACK → panel focuses only after delivery.
             const finalizeDone = () => {
                 if (typeof window._wfm_onAllDone === 'function') window._wfm_onAllDone();
                 chrome.runtime.sendMessage({ type: 'all_batches_complete' }).catch(() => {});
             };

             const fbTabId = getTargetTabId();
             if (fbTabId) {
                 // Manual flow: tab ID known — send stop, focus panel in callback
                 chrome.tabs.sendMessage(fbTabId, { type: 'stop_automation' }, () => {
                     if (chrome.runtime.lastError) {} // tab might be gone
                     finalizeDone();
                 });
             } else {
                 // Schedule flow: find active FB tab via provideActiveTab
                 provideActiveTab(t => {
                     if (t) {
                         chrome.tabs.sendMessage(t, { type: 'stop_automation' }, () => {
                             if (chrome.runtime.lastError) {}
                             finalizeDone();
                         });
                     } else {
                         finalizeDone(); // no FB tab found, focus panel anyway
                     }
                 });
             }
          }


       });
    }

     // New: Handle Batch Retry Request from autoClickGroup.js
     if (msg.type === 'batch_retry_requested') {
         chrome.storage.local.get(['current_batch_index', 'current_post_url', 'is_automation_running'], (res) => {
            if (!res.is_automation_running) return;

            if (currentBatchRetries < 2) {
                currentBatchRetries++;
                addActivityLog({ msg: `Share Menu Timeout. Retrying Batch (Attempt ${currentBatchRetries}/2)...`, status: "info", icon: "🔁" });

                // ✅ FIX: getTargetTabId() returns null in Schedule flow (no tabId in URL)
                // Use provideActiveTab() as fallback to find the active Facebook tab
                const tabIdFromUrl = getTargetTabId();
                const doRetry = (tabId) => {
                    if (!tabId) {
                        console.warn('⚠️ [RETRY] No tab found for retry. Skipping.');
                        return;
                    }
                    chrome.tabs.update(tabId, { url: res.current_post_url, active: true });
                    chrome.tabs.get(tabId, (tab) => {
                        if (tab && tab.windowId) chrome.windows.update(tab.windowId, { focused: true, drawAttention: true });
                    });
                };

                if (tabIdFromUrl) {
                    doRetry(tabIdFromUrl);
                } else {
                    // Schedule flow: find the active Facebook tab
                    provideActiveTab((tabId) => doRetry(tabId));
                }
            } else {
                addActivityLog({ msg: "Batch Failed after 2 retries. Skipping task.", status: "failed", icon: "🛑" });
                currentBatchRetries = 0;
                jumpToNextBatch();
            }
         });
     }

    // New: Handle individual group share success/fail
    if (msg.type === 'post_result') {
        chrome.storage.local.get(['post_content'], (res) => {
            addActivityLog({
                status: msg.status || 'success',
                groupName: msg.groupName || 'Unknown Group',
                postContent: res.post_content || '...',
                msg: msg.status === 'success' ? `Successfully shared to ${msg.groupName}` : `Failed to share to ${msg.groupName}`
            });
        });
    }
  });

  // ── Skip Batch Button ──────────────────────────────────────
  if (skipBatchBtn) {
    skipBatchBtn.onclick = (e) => {
      e.stopPropagation();
      jumpToNextBatch();
    };
  }

  // ── Activity Log UI Hooks ──────────────────────────────────
  const activityLogIcon = document.getElementById('activityLogIcon');
  const activityLogModal = document.getElementById('activity-log-modal');
  const closeActivityLog = document.getElementById('close-activity-log');
  const clearLogsBtn = document.getElementById('clear-logs-btn');
  const refreshLogsBtn = document.getElementById('refresh-logs-btn');

  if (activityLogIcon && activityLogModal) {
    activityLogIcon.addEventListener('click', () => {
      activityLogModal.classList.remove('hidden');
      activityLogModal.classList.add('show');
      renderActivityLogs();
    });
  }

  if (closeActivityLog) {
    closeActivityLog.addEventListener('click', () => {
      activityLogModal.classList.remove('show');
      activityLogModal.classList.add('hidden');
    });
  }

  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      if (confirm("Clear all activity history?")) {
        chrome.storage.local.set({ activityLogs: [], trigger_logs: [] }, () => {
            renderActivityLogs();
            if (typeof window.renderScheduleLogs === 'function') window.renderScheduleLogs();
        });
      }
    });
  }

  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener('click', renderActivityLogs);
  }

  // ── Stop Automation Button & Logic ────────────────────────
  const executeStopAutomation = (showAlert = true) => {
      chrome.storage.local.set({ is_automation_running: false, auto_trigger_share: false, inter_batch_wait: false }, () => {
        updateSignalStatus(false);
        const targetTabId = getTargetTabId();
        if (targetTabId) {
          chrome.tabs.sendMessage(targetTabId, { type: 'stop_automation' }).catch(() => {});
        }
        // ✅ Direct call (same-page) — runtime.sendMessage doesn't loop back to same page
        if (typeof window._wfm_onStop === 'function') window._wfm_onStop();
        // Also notify other pages (e.g. background) via runtime
        chrome.runtime.sendMessage({ type: 'stop_automation' }).catch(() => {});

        // --- FULL UI RESET ---
        document.querySelectorAll('.step-node').forEach(node => {
            node.classList.remove('active', 'completed');
        });
        
        const fill = document.getElementById('progress-bar-fill');
        const percent = document.getElementById('percent-complete');
        const batchTitle = document.getElementById('batch-progress-title');
        const countTxt = document.getElementById('groups-count-progress');
        const hintTxt = document.getElementById('detailed-status-hint');

        if (fill) fill.style.width = '0%';
        if (percent) percent.textContent = '0%';
        if (batchTitle) batchTitle.textContent = "System Ready";
        if (countTxt) countTxt.textContent = "0 / 0 Groups Shared";
        if (hintTxt) hintTxt.textContent = "System Halted";

        if (skipBatchBtn) skipBatchBtn.classList.add('hidden');
        if (activeBatchWaitTimer) { clearTimeout(activeBatchWaitTimer); activeBatchWaitTimer = null; }
        if (activeBatchWaitInterval) { clearInterval(activeBatchWaitInterval); activeBatchWaitInterval = null; }
        
        isSkipInProgress = false;
        if (skipBatchBtn) {
            skipBatchBtn.disabled = false;
            skipBatchBtn.innerHTML = '<span>⏭️</span> SKIP';
            skipBatchBtn.style.opacity = '1';
        }

        if (showAlert) showCustomAlert("System Stopped", "All automation tasks have been halted.", "🛑");
      });
  };

  const stopAutomationBtn = document.getElementById('stop-automation-btn');
  if (stopAutomationBtn) {
    stopAutomationBtn.addEventListener('click', () => executeStopAutomation(true));
  }

  // Also listen for stop commands sent from the Facebook page (Floating Stop Button)
  chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'stop_automation') {
          console.log("🛑 External stop_automation received by panel.");
          executeStopAutomation(false); // don't show custom alert if stopped from FB page to avoid confusion
      }
  });

  // ── Status Update Listener ─────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'status_update') {
      updateSignalStatus(message.running);
      
      // RESET UI NODES ON NEW CAMPAIGN START (Triggered by alarm)
      if (message.running) {
         document.querySelectorAll('.step-node').forEach(node => {
             node.classList.remove('active', 'completed');
         });
         const hint = document.getElementById('detailed-status-hint');
         if (hint) hint.textContent = "Automation Running...";
      }
    }

    // NOTE: batch_post_finished is handled by the primary listener above
    // which uses all_batches[] and current_batch_index from storage.
    // This duplicate handler has been removed to prevent conflict.
  });
}
