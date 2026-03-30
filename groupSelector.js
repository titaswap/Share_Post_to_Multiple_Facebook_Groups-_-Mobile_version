console.log('✅ [GS-INIT] groupSelector.js loaded!');

let automation_cancelled = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'share_to_groups') {
        console.log('📨 [GS-MSG] Received share_to_groups command.', request);
        const groupsToSelect = request.groups || [];
        const captionGroupName = request.activeCaptionGroup || null;
        automation_cancelled = false;

        chrome.storage.local.set({ is_automation_running: true, inter_batch_wait: false }, () => {
            chrome.runtime.sendMessage({ type: 'status_update', running: true });
            console.log(`▶️ [GS-START] Starting in 1s for ${groupsToSelect.length} groups.`);
            setTimeout(() => selectGroupsInDOM(groupsToSelect, captionGroupName), 1000);
        });

        if (sendResponse) sendResponse({ success: true });
        return true;
    }

    // pause_for_batch_wait: inter-batch countdown — stop local loop ONLY.
    // Must NOT write is_automation_running to storage — would kill panel countdown.
    if (request.type === 'pause_for_batch_wait') {
        console.log('⏸️ [GS-PAUSE] pause_for_batch_wait received. Stopping automation loop.');
        automation_cancelled = true;
        document.querySelectorAll('[id*="overlay"]').forEach(o => o.style.display = 'none');
        if (sendResponse) sendResponse({ ok: true });
    }

    if (request.type === 'stop_automation') {
        console.log('🛑 [GS-STOP] Stop command received.');
        automation_cancelled = true;
        // NOTE: inter_batch_wait managed by panel only — do NOT set here
        chrome.storage.local.set({ is_automation_running: false });
        document.querySelectorAll('[id*="overlay"]').forEach(o => o.style.display = 'none');
        if (sendResponse) sendResponse({ ok: true });
    }
});

async function selectGroupsInDOM(groupsToSelect, forwardedGroup) {
    console.log(`🔧 [GS-DOM] selectGroupsInDOM called with ${groupsToSelect.length} groups.`);
    if (!groupsToSelect || groupsToSelect.length === 0) {
        console.warn('⚠️ [GS-DOM] No groups provided. Aborting.');
        return;
    }

    // ✅ SAFETY: Always reset lock at the very start
    automation_cancelled = false;
    await new Promise(r => chrome.storage.local.set({ 
        inter_batch_wait: false, 
        is_automation_running: true 
    }, r));
    console.log('🔓 [GS-DOM] Lock cleared. Starting safe.');


    const isStopped = async () => {
        if (automation_cancelled) return true;
        const s = await new Promise(r => chrome.storage.local.get(['is_automation_running', 'inter_batch_wait'], r));
        return s.is_automation_running === false || s.inter_batch_wait === true;
    };

    const smartHighlight = (el) => {
        if (!el) return;
        el.style.outline = "4px solid red";
        el.style.boxShadow = "0 0 20px red";
        el.style.borderRadius = "8px";
        el.style.transition = "all 0.3s ease";
        setTimeout(() => { el.style.outline = ""; el.style.boxShadow = ""; }, 2000);
    };

    const sleep = (min, max, msg) => {
        return new Promise(async (resolve, reject) => {
            if (await isStopped()) { automation_cancelled = true; return reject("cancelled"); }

            let stepIndex = 0;
            if (msg.includes("Matching")) stepIndex = 3;
            if (msg.includes("Dialog") || msg.includes("Modal") || msg.includes("Readying")) stepIndex = 4;
            if (msg.includes("POST") || msg.includes("Cleaning")) stepIndex = 5;

            const ms = Math.floor(Math.random() * (max - min + 1) + min) * 1000;
            console.log(`⏳ [GS-SLEEP] "${msg}" for ${Math.round(ms/1000)}s`);

            chrome.runtime.sendMessage({ type: 'task_countdown', active: true, name: msg, remaining: Math.round(ms/1000), stepIndex });

            const overlay = document.getElementById('automation-countdown-overlay');
            if (overlay) {
                overlay.style.opacity = '1';
                overlay.style.display = 'flex';
                overlay.innerHTML = `<div style="display:flex;flex-direction:column;gap:2px;align-items:center;">
                    <span style="color:#1eb2ff;font-size:11px;font-weight:700;">${msg}...</span>
                    <span id="auto-rem-count" style="color:#fff;font-size:14px;font-weight:800;">${Math.round(ms/1000)}s</span></div>`;
            }

            let rem = Math.round(ms / 1000);
            const inv = setInterval(async () => {
                if (await isStopped()) {
                    clearInterval(inv);
                    if (overlay) overlay.style.display = 'none';
                    return reject("cancelled");
                }
                const el = document.getElementById('auto-rem-count');
                if (el) el.innerText = `${rem}s`;
                rem--;
                if (rem < 0) { clearInterval(inv); if (overlay) overlay.style.display = 'none'; resolve(); }
            }, 1000);
        });
    };

    const smartClick = (el, name = "Target") => {
        if (!el || automation_cancelled) return;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        smartHighlight(el);
        console.log(`⚡ [GS-CLICK] ${name}`);
        el.click();
    };

    // ─── LAYER 1: CHECKBOX SELECTION ────────────────────────────────────────
    console.log('🔍 [GS-L1] Starting checkbox scan...');
    let selectedCount = 0;

    const retryCheckboxScan = async (maxRetries = 3) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`🔄 [GS-L1-RETRY] Checkbox scan attempt ${attempt}/${maxRetries}`);
            const checkboxes = document.querySelectorAll('[role="checkbox"], input[type="checkbox"]');
            console.log(`📋 [GS-L1-INFO] Found ${checkboxes.length} checkboxes in DOM.`);

            if (checkboxes.length > 0) return checkboxes;

            // ✅ Checkbox missing/slow → immediately focus browser, then retry same step
            console.warn(`⚠️ [GS-L1-WARN] No checkboxes found. Focusing browser & retrying in 2s...`);
            chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason: 'checkbox_not_found' });
            await new Promise(r => setTimeout(r, 2000));
        }
        console.error('❌ [GS-L1-FAIL] Could not find checkboxes after all retries.');
        return [];
    };

    try {
        const MAX_SELECTION_RETRIES = 3;

        for (let selAttempt = 1; selAttempt <= MAX_SELECTION_RETRIES; selAttempt++) {
            if (await isStopped()) throw "cancelled";

            const checkboxes = await retryCheckboxScan(3);
            selectedCount = 0; // reset for this scan pass

            for (const box of checkboxes) {
                if (await isStopped()) throw "cancelled";

                let nameContent = '';
                let parent = box.parentElement;
                for (let i = 0; i < 5 && parent; i++) {
                    if (parent.innerText?.trim()) {
                        const lines = parent.innerText.split('\n').map(l => l.trim()).filter(Boolean);
                        for (let line of lines) if (!line.match(/checked|selected/i)) { nameContent = line; break; }
                    }
                    if (nameContent) break;
                    parent = parent.parentElement;
                }

                if (nameContent && groupsToSelect.includes(nameContent)) {
                    const isChecked = box.checked || box.getAttribute('aria-checked') === 'true';
                    if (!isChecked) {
                        console.log(`✅ [GS-L1-MATCH] Selecting: "${nameContent}"`);
                        await sleep(2, 4, "Matching " + nameContent);
                        const targetBox = box.closest('div[role="checkbox"]') || box;
                        smartHighlight(targetBox);
                        smartClick(targetBox, nameContent);
                    } else {
                        console.log(`ℹ️ [GS-L1-SKIP] Already checked: "${nameContent}"`);
                    }
                    selectedCount++;
                    chrome.runtime.sendMessage({ type: 'selection_progress', current: selectedCount, total: groupsToSelect.length });
                }
            }

            console.log(`🎯 [GS-L1-DONE] Pass ${selAttempt}: Selected ${selectedCount}/${groupsToSelect.length} groups.`);

            // All target groups found — no need to retry
            if (selectedCount >= groupsToSelect.length) break;

            // Some groups missing → focus browser instantly + retry same step
            const missing = groupsToSelect.length - selectedCount;
            console.warn(`⚠️ [GS-L1-MISS] ${missing} group(s) not found in DOM. Focusing browser & retrying (${selAttempt}/${MAX_SELECTION_RETRIES})...`);
            chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason: 'checkbox_not_found' });
            await new Promise(r => setTimeout(r, 2000));
        }


        // ─── LAYER 2: SAVE BUTTON ────────────────────────────────────────────
        await sleep(3, 5, "Preparing Dialog");
        console.log('🔍 [GS-L2] Searching for Save/Done button...');

        const findSaveBtn = (maxRetries = 3) => {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                const btn = document.querySelector('[data-action-id="1"]') ||
                    [...document.querySelectorAll('[role="button"]')].find(el => {
                        const t = el.innerText.toLowerCase();
                        return t === 'save' || t === 'done' || t === 'সংরক্ষণ' || t === 'confirm';
                    });
                if (btn) {
                    console.log(`✅ [GS-L2-FOUND] Save button found on attempt ${attempt}.`);
                    return btn;
                }
                // Layer 1: per-attempt → focus browser instantly
                console.warn(`⚠️ [GS-L2-RETRY] Save button not found (attempt ${attempt}/${maxRetries}). Focusing browser...`);
                chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason: 'save_button_not_found' });
            }
            return null;
        };

        // Layer 2: outer retry — re-run findSaveBtn up to 3 times
        let saveBtn = null;
        for (let outer = 1; outer <= 3; outer++) {
            saveBtn = findSaveBtn(3);
            if (saveBtn) break;
            console.warn(`🔁 [GS-L2-OUTER] Inner exhausted. Re-focusing browser (outer ${outer}/3)...`);
            chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason: 'save_button_not_found' });
            if (outer < 3) await new Promise(r => setTimeout(r, 2000));
        }

        if (!saveBtn) {
            console.error('❌ [GS-L2-FAIL] Save button not found after all retries. Aborting.');
            return;
        }

        smartClick(saveBtn, "Saving Selection");
        await sleep(8, 12, "Opening Share Modal");

        // ─── LAYER 3: CAPTION INJECTION ──────────────────────────────────────
        console.log('🔍 [GS-L3] Caption Injection layer...');
        let targetGroup = forwardedGroup;
        if (!targetGroup) {
            const storage = await new Promise(r => chrome.storage.local.get(['active_caption_group'], r));
            targetGroup = storage.active_caption_group;
            console.log(`📦 [GS-L3-INFO] Caption group from storage: "${targetGroup}"`);
        }

        let typingFinished = false;
        if (targetGroup && targetGroup !== "undefined" && typeof CaptionManager !== 'undefined') {
            const caption = await CaptionManager.getUnusedCaption(targetGroup);

            if (caption === undefined || caption === null || caption === '') {
                // ── No captions available ──────────────────────────────────────
                console.warn(`⚠️ [GS-L3-EMPTY] Caption group "${targetGroup}" returned no caption.`);
                console.warn('⚠️ [GS-L3-REASON] All captions exhausted or group is empty. Posting without caption.');
                typingFinished = true;

            } else {
                // ── Valid caption: inject it ───────────────────────────────────
                console.log(`📝 [GS-L3-CAPTION] Caption fetched (${caption.length} chars): "${caption.substring(0, 60)}..."`);

                let textArea = null;
                for (let i = 0; i < 15; i++) {
                    if (await isStopped()) throw "cancelled";
                    console.log(`🔎 [GS-L3-SCAN] TextArea scan attempt ${i+1}/15...`);

                    textArea = document.querySelector('textarea, [contenteditable="true"]');
                    if (textArea && textArea.getBoundingClientRect().height > 20) {
                        console.log('✅ [GS-L3-FOUND] TextArea found!');
                        break;
                    }

                    const candidates = [...document.querySelectorAll('[data-mcomponent="ServerTextArea"]')];
                    const visible = candidates.filter(el => el.getBoundingClientRect().top < window.innerHeight);
                    console.log(`📋 [GS-L3-INFO] Visible ServerTextAreas: ${visible.length}`);

                    if (visible.length > 0) {
                        visible.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
                        const placeholder = visible.find(x => x.innerText.toLowerCase().includes("write") || x.innerText.toLowerCase().includes("something")) || visible[0];
                        if (placeholder) smartClick(placeholder, "Opening TextBox");
                    }
                    await new Promise(r => setTimeout(r, 2000));
                }

                if (textArea) {
                    await sleep(2, 3, "Focusing Input");
                    smartHighlight(textArea);
                    textArea.focus();
                    textArea.click();

                    // Wait for focus to settle before typing
                    await new Promise(r => setTimeout(r, 1000));

                    console.log('🖊️ [GS-L3-DEBUG] Sending caption to background debugger engine...');
                    const result = await new Promise(resolve => {
                        chrome.runtime.sendMessage(
                            { action: 'DEBUGGER_TYPE', text: caption },
                            (res) => resolve(res)
                        );
                    });

                    if (result?.success) {
                        console.log('✅ [GS-L3-TYPED] Caption injected via debugger successfully.');
                    } else {
                        console.warn(`⚠️ [GS-L3-TYPED] Debugger typing response: ${result?.error || 'unknown'}`);
                    }

                    await CaptionManager.markAsUsed(targetGroup, caption);
                    typingFinished = true;
                    await sleep(4, 6, "Readying Final Post");
                } else {
                    console.error('❌ [GS-L3-FAIL] TextArea not found after 15 attempts. Posting without caption.');
                    typingFinished = true;
                }

            }

        } else {
            console.log('ℹ️ [GS-L3-BYPASS] No caption group configured. Skipping caption step.');
            typingFinished = true;
        }

        // ─── LAYER 3.5: FEELING / ACTIVITY ───────────────────────────────────
        if (typingFinished) {
            if (await isStopped()) throw "cancelled";
            console.log('😊 [GS-L3.5] Starting Feeling/Activity selection...');

            // Helper: find a visible element by exact innerText (short text, max 50 chars)
            const findByText = (texts) => {
                const cands = [...document.querySelectorAll('[tabindex="0"], [role="button"], [data-focusable="true"]')];
                for (const el of cands) {
                    const raw = (el.innerText || '').trim();
                    if (raw.length > 50) continue;
                    const txt = raw.toLowerCase();
                    if (texts.some(t => txt === t.toLowerCase())) {
                        const r = el.getBoundingClientRect();
                        if (r.width > 0 && r.height > 0) return el;
                    }
                }
                return null;
            };

            // Helper: two-layer find with focus+retry
            // ariaLabel: optional — tries aria-label selector FIRST (for icon-only buttons)
            const findWithRetry = async (texts, label, reason, ariaLabel = null) => {
                for (let outer = 1; outer <= 3; outer++) {
                    for (let inner = 1; inner <= 3; inner++) {
                        // Strategy 1: aria-label selector (most reliable for icon buttons)
                        let el = null;
                        if (ariaLabel) {
                            el = document.querySelector(`[aria-label="${ariaLabel}"]`);
                            if (el) {
                                const r = el.getBoundingClientRect();
                                if (r.width <= 0 || r.height <= 0) el = null; // not visible
                            }
                        }
                        // Strategy 2: innerText match
                        if (!el) el = findByText(texts);

                        if (el) return el;

                        // Layer 1: focus browser instantly on each miss
                        console.warn(`⚠️ [GS-L3.5] "${label}" not found (outer ${outer}/3 inner ${inner}/3). Focusing browser...`);
                        chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason });
                        await new Promise(r => setTimeout(r, 1500));
                        if (await isStopped()) throw "cancelled";
                    }
                    // Layer 2: outer re-focus after inner exhausted
                    if (outer < 3) {
                        console.warn(`🔁 [GS-L3.5] Inner exhausted for "${label}". Re-focusing (outer ${outer}/3)...`);
                        chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason });
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }
                return null;
            };

            // Helper: click with red highlight
            const highlightClick = (el, label) => {
                el.style.outline = '4px solid red';
                el.style.boxShadow = '0 0 20px red';
                setTimeout(() => { el.style.outline = ''; el.style.boxShadow = ''; }, 2000);
                smartClick(el, label);
            };

            // ── Step 1: Click "Feeling/activity" ────────────────────────────
            await sleep(5, 5, "Before Feeling/Activity");
            if (await isStopped()) throw "cancelled";

            const feelingActivityBtn = await findWithRetry(
                ['Feeling/activity', 'Feeling/Activity'],
                'Feeling/Activity', 'feeling_activity_not_found',
                'Feeling/activity'  // ✅ aria-label selector — button has emoji icon, no visible text
            );

            if (feelingActivityBtn) {
                highlightClick(feelingActivityBtn, "Feeling/Activity");
                console.log('✅ [GS-L3.5-FA] Feeling/Activity clicked.');

                // ── Step 2: Click "Thinking about..." ────────────────────────
                await sleep(5, 5, "Loading Feeling Options");
                if (await isStopped()) throw "cancelled";

                const feelingDotBtn = await findWithRetry(
                    ['Thinking about...', 'Thinking about…'],
                    'Thinking about...', 'thinking_about_not_found'
                );

                if (feelingDotBtn) {
                    highlightClick(feelingDotBtn, "Thinking about...");
                    console.log('✅ [GS-L3.5-FE] Thinking about... clicked.');

                    // ── Step 3: Click "life" ─────────────────────────────────
                    await sleep(5, 5, "Loading Feelings List");
                    if (await isStopped()) throw "cancelled";

                    const sadBtn = await findWithRetry(
                        ['life'],
                        'life', 'feeling_item_not_found'
                    );

                    if (sadBtn) {
                        highlightClick(sadBtn, "Thinking about: life");
                        console.log('✅ [GS-L3.5-SAD] Activity "life" selected.');
                        await sleep(2, 3, "After Feeling Selected");
                    } else {
                        console.warn('⚠️ [GS-L3.5-SAD] "life" not found after all retries. Skipping.');
                    }
                } else {
                    console.warn('⚠️ [GS-L3.5-FE] "Thinking about..." not found after all retries. Skipping.');
                }
            } else {
                console.warn('⚠️ [GS-L3.5-FA] Feeling/Activity not found after all retries. Skipping.');
            }
        }

        // ─── LAYER 4: FINAL POST ─────────────────────────────────────────────
        if (typingFinished) {
            if (await isStopped()) throw "cancelled";
            console.log('🔍 [GS-L4] Searching for Final Post button...');

            let finalPostBtn = null;
            for (let attempt = 1; attempt <= 4; attempt++) {
                const candidates = [...document.querySelectorAll('[data-action-id="1"]')];
                candidates.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
                finalPostBtn = candidates[0] || null;
                if (finalPostBtn) break;
                // ✅ POST button not found → immediately focus browser, retry same step
                console.warn(`⚠️ [GS-L4-RETRY] POST button not found (attempt ${attempt}/4). Focusing browser...`);
                chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason: 'post_button_not_found' });
                await new Promise(r => setTimeout(r, 1500));
            }

            if (finalPostBtn) {
                console.log('🚀 [GS-L4-FINAL] Clicking POST button!');
                smartClick(finalPostBtn, "Final POST");

                // Collect names of groups that were actually matched & selected
                const selectedGroupNames = groupsToSelect.slice(0, selectedCount);
                console.log(`📋 [GS-L4-NAMES] Groups shared: ${selectedGroupNames.join(', ')}`);

                chrome.storage.local.set({ inter_batch_wait: true }, () => {
                    console.log("🔒 [GS-L4-LOCK] Inter-batch lock engaged.");
                    setTimeout(() => {
                        chrome.runtime.sendMessage({ 
                            type: 'batch_post_finished',
                            groupsShared: selectedCount,
                            groupNames: selectedGroupNames
                        });
                        console.log("📨 [GS-L4-MSG] batch_post_finished sent with group names.");
                    }, 500);
                });
            } else {
                console.error('❌ [GS-L4-FAIL] Post button not found!');
            }
        }

    } catch (e) {
        if (e === "cancelled") {
            console.log("🚫 [GS-ABORT] Automation cancelled by user.");
        } else {
            console.error("❌ [GS-ERROR] Unexpected error:", e);
        }
    }
}
