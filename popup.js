document.addEventListener('DOMContentLoaded', () => {

  // ============================================================
  // INITIALIZE EXTRACTED MODULES
  // ============================================================
  initializeTooltips();   // uses popup_utils inline below (identical to panel version)
  initPopupGroupsUI();    // popup_groups_ui.js

  // ============================================================
  // MAIN APPLICATION ELEMENTS
  // ============================================================
  const shareBtn = document.getElementById('share-button');
  const delayInput = document.getElementById('share-delay');
  const randomizeCheckbox = document.getElementById('randomize-delay');
  const postContentArea = document.getElementById('post-content');

  // Signature
  const signatureToggleBtn = document.getElementById('signature-toggle-btn');
  const signatureContainer = document.getElementById('signature-container');
  const signatureEnabledCheckbox = document.getElementById('signature-enabled');
  const signatureTextarea = document.getElementById('signature-text');
  const signatureSaveBtn = document.getElementById('signature-save-btn');

  // Save Post Preset button
  const savePostPresetBtn = document.getElementById('save-post-preset-btn');

  // ============================================================
  // VIEW MANAGEMENT — switch between main and sub-views
  // ============================================================
  function showView(view) {
    const shareContainer = document.getElementById('share-container');
    const addressBookView = document.getElementById('address-book-view');
    if (view === 'main') {
      if (shareContainer) shareContainer.classList.remove('hidden');
      if (addressBookView) addressBookView.classList.add('hidden');
    } else if (view === 'templates') {
      if (shareContainer) shareContainer.classList.add('hidden');
      if (addressBookView) addressBookView.classList.remove('hidden');
    }
  }

  // ============================================================
  // SIGNATURE FUNCTIONALITY
  // ============================================================
  // Load saved signature
  chrome.storage.local.get(['signature_text', 'signature_enabled'], (result) => {
    if (signatureTextarea && result.signature_text) {
      signatureTextarea.value = result.signature_text;
    }
    if (signatureEnabledCheckbox && result.signature_enabled) {
      signatureEnabledCheckbox.checked = result.signature_enabled;
    }
  });

  if (signatureToggleBtn) {
    signatureToggleBtn.addEventListener('click', () => {
      if (signatureContainer) {
        signatureContainer.classList.toggle('hidden');
        signatureToggleBtn.textContent = signatureContainer.classList.contains('hidden')
          ? '✍️ Add Signature'
          : '✍️ Hide Signature';
      }
    });
  }

  if (signatureSaveBtn) {
    signatureSaveBtn.addEventListener('click', () => {
      const text = signatureTextarea ? signatureTextarea.value : '';
      const enabled = signatureEnabledCheckbox ? signatureEnabledCheckbox.checked : false;
      chrome.storage.local.set({ signature_text: text, signature_enabled: enabled }, () => {
        signatureSaveBtn.textContent = '✅ Saved!';
        setTimeout(() => { signatureSaveBtn.textContent = '💾 Save'; }, 2000);
      });
    });
  }

  // ============================================================
  // SAVE AS POST PRESET (Save post text as template)
  // ============================================================
  if (savePostPresetBtn) {
    savePostPresetBtn.addEventListener('click', () => {
      const postText = postContentArea ? postContentArea.value.trim() : '';
      if (!postText) {
        alert('Please enter some post content first before saving as a template!');
        return;
      }
      const name = prompt('Enter a name for this post template:', '');
      if (!name || !name.trim()) return;

      chrome.storage.local.get(['postTemplates'], (result) => {
        const postTemplates = result.postTemplates || {};
        if (postTemplates[name.trim()]) {
          if (!confirm(`A template named "${name.trim()}" already exists. Replace it?`)) return;
        }
        postTemplates[name.trim()] = postText;
        chrome.storage.local.set({ postTemplates }, () => {
          savePostPresetBtn.textContent = '✅ Saved!';
          setTimeout(() => { savePostPresetBtn.textContent = '💾 Save as Preset'; }, 2000);
        });
      });
    });
  }

  // ============================================================
  // BUTTON: Share to Groups
  // ============================================================
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      const selectedGroups = [];
      document.querySelectorAll('.group-checkbox:checked').forEach(cb => {
        const label = cb.nextElementSibling;
        if (label) selectedGroups.push(label.textContent);
      });

      if (selectedGroups.length === 0) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'trigger_page_share' }, (response) => {
              if (chrome.runtime.lastError || !response || !response.success) {
                alert('Please select at least one group (either in this popup or on the page).');
              } else {
                window.close();
              }
            });
          }
        });
        return;
      }

      // Get signature
      let postSignature = null;
      if (signatureEnabledCheckbox && signatureEnabledCheckbox.checked && signatureTextarea) {
        postSignature = signatureTextarea.value.trim() || null;
      }

      const message = postContentArea ? postContentArea.value : '';
      const delay = delayInput ? parseInt(delayInput.value) : 30;
      const randomize = randomizeCheckbox ? randomizeCheckbox.checked : false;

      // Repeat controls
      const repeatCountInput = document.getElementById('repeat-count');
      const repeatDelayMinInput = document.getElementById('repeat-delay-min');
      const repeatDelaySecInput = document.getElementById('repeat-delay-sec');
      
      const repeatCount = repeatCountInput ? parseInt(repeatCountInput.value) || 1 : 1;
      const repeatDelayMin = repeatDelayMinInput ? parseInt(repeatDelayMinInput.value) || 0 : 0;
      const repeatDelaySec = repeatDelaySecInput ? parseInt(repeatDelaySecInput.value) || 0 : 0;
      const repeatDelayTotalMs = ((repeatDelayMin * 60) + repeatDelaySec) * 1000;

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: "share_to_groups",
            groups: selectedGroups,
            postContent: message,
            postSignature: postSignature,
            delay: delay,
            randomizeDelay: randomize,
            repeatCount: repeatCount,
            repeatDelayMs: repeatDelayTotalMs
          });
          window.close();
        }
      });
    });
  }

  // ============================================================
  // HEADER ICON: 📝 Saved Post Templates (Address Book)
  // ============================================================
  const addressBookIcon = document.getElementById('addressBookIcon');
  if (addressBookIcon) {
    addressBookIcon.addEventListener('click', () => {
      showView('templates');  // Show view first so DOM elements are visible
      // Small delay to ensure DOM is rendered before init tries to find elements
      setTimeout(() => {
        if (typeof initializeAddressBook === 'function') {
          initializeAddressBook(showView);
        }
      }, 20);
    });
  }

  // ============================================================
  // HEADER ICON: ⚡ 1 Click Share Templates
  // ============================================================
  const oneClickTemplatesIcon = document.getElementById('oneClickTemplatesIcon');
  if (oneClickTemplatesIcon) {
    oneClickTemplatesIcon.addEventListener('click', () => {
      // Initialize one-click templates and open manager
      if (typeof initializeOneClickTemplates === 'function') {
        initializeOneClickTemplates(showView);
      }
      // Open the manager modal directly
      const managerModal = document.getElementById('one-click-manager-modal');
      if (managerModal) {
        managerModal.classList.remove('hidden');
        // Populate templates list
        if (window.oneClickTemplates && window.oneClickTemplates.showManagerModal) {
          window.oneClickTemplates.showManagerModal();
        }
      }
    });
  }

  // ============================================================
  // INITIALIZE PRESETS UI (popup_presets.js)
  // ============================================================
  initPopupPresetsUI();

  // ============================================================
  // HEADER ICON: ⚙️ Settings (popup_settings.js)
  // ============================================================
  const settingsIcon = document.getElementById('settingsIcon');
  const settingsPanel = popupCreateSettingsPanel();
  document.querySelector('.wrapper').appendChild(settingsPanel);
  initPopupSettingsUI(settingsPanel, settingsIcon, delayInput, randomizeCheckbox);

  // ============================================================
  // INITIALIZE MODULES
  // ============================================================
  // Initialize 1 Click Templates module
  if (typeof initializeOneClickTemplates === 'function') {
    initializeOneClickTemplates(showView);
  }

  // Close one-click modals
  const closeCreateOneClick = document.getElementById('close-create-one-click');
  if (closeCreateOneClick) {
    closeCreateOneClick.addEventListener('click', () => {
      document.getElementById('create-one-click-modal')?.classList.add('hidden');
    });
  }

  const closeOneClickManager = document.getElementById('close-one-click-manager');
  if (closeOneClickManager) {
    closeOneClickManager.addEventListener('click', () => {
      document.getElementById('one-click-manager-modal')?.classList.add('hidden');
    });
  }

  // ============================================================
  // ACTIVITY LOG FUNCTIONALITY
  // ============================================================
  const activityLogIcon = document.getElementById('activityLogIcon');
  const activityLogModal = document.getElementById('activity-log-modal');
  const closeActivityLog = document.getElementById('close-activity-log');
  const logEntriesContainer = document.getElementById('log-entries');
  const clearLogsBtn = document.getElementById('clear-logs-btn');
  const refreshLogsBtn = document.getElementById('refresh-logs-btn');

  function renderActivityLogs() {
    if (!logEntriesContainer) return;
    
    chrome.storage.local.get(['activityLogs'], (result) => {
      const logs = result.activityLogs || [];
      if (logs.length === 0) {
        logEntriesContainer.innerHTML = '<p style="text-align: center; color: #9ca3af; padding: 20px;">No logs found.</p>';
        return;
      }

      const successCount = logs.filter(l => l.status === 'success').length;
      const failCount = logs.filter(l => l.status === 'failed').length;
      
      // Calculate total time duration
      let timeStr = '0s';
      if (logs.length > 1) {
        const sortedById = [...logs].sort((a,b) => a.id - b.id);
        const diffMs = sortedById[sortedById.length - 1].id - sortedById[0].id;
        const hours = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        const secs = Math.floor((diffMs % 60000) / 1000);
        
        if (hours > 0) {
          timeStr = `${hours}h ${mins}m ${secs}s`;
        } else if (mins > 0) {
          timeStr = `${mins}m ${secs}s`;
        } else {
          timeStr = `${secs}s`;
        }
      }

      // Summary Header
      let html = `
        <div style="display: flex; justify-content: space-around; padding: 10px; background: rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 5px;">
          <div style="text-align:center;"><span style="color:#4ade80; font-size:16px; font-weight:bold;">${successCount}</span><br><span style="font-size:10px; color:#aaa;">SUCCESS</span></div>
          <div style="text-align:center;"><span style="color:#f87171; font-size:16px; font-weight:bold;">${failCount}</span><br><span style="font-size:10px; color:#aaa;">FAILED</span></div>
          <div style="text-align:center;"><span style="color:#1eb2ff; font-size:16px; font-weight:bold;">${timeStr}</span><br><span style="font-size:10px; color:#aaa;">DURATION</span></div>
          <div style="text-align:center;"><span style="color:#fff; font-size:16px; font-weight:bold;">${logs.length}</span><br><span style="font-size:10px; color:#aaa;">TOTAL</span></div>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; color: #fff;">
          <thead>
            <tr style="background: rgba(30,178,255,0.1); text-align: left;">
              <th style="padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.1);">Run</th>
              <th style="padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.1);">Status</th>
              <th style="padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.1);">Group Info</th>
              <th style="padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.1);">Time</th>
            </tr>
          </thead>
          <tbody>
      `;

      // Sort logs by newest first
      const sortedLogs = [...logs].sort((a, b) => b.id - a.id);
      
      html += sortedLogs.map(log => {
        const statusColor = log.status === 'success' ? '#4ade80' : '#f87171';
        return `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 6px; text-align:center; font-weight:bold; color:#1eb2ff;">${log.runNumber || 1}</td>
            <td style="padding: 6px; color:${statusColor}; font-weight:bold;">${log.status.toUpperCase()}</td>
            <td style="padding: 6px;">
              <div style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight:600;">${log.groupName}</div>
              ${log.error ? `<div style="color:#f87171; font-size:9px; line-height:1.1; margin-top:2px;">${log.error}</div>` : ''}
              <div style="color:#9ca3af; font-size:9px;">Post: ${log.postContent || '...'}</div>
            </td>
            <td style="padding: 6px; color: #9ca3af; font-size:10px;">${log.timestamp || ''}</td>
          </tr>
        `;
      }).join('');

      html += `</tbody></table>`;
      logEntriesContainer.innerHTML = html;
    });
  }

  if (activityLogIcon) {
    activityLogIcon.addEventListener('click', () => {
      activityLogModal?.classList.remove('hidden');
      renderActivityLogs();
    });
  }

  if (closeActivityLog) {
    closeActivityLog.addEventListener('click', () => {
      activityLogModal?.classList.add('hidden');
    });
  }

  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all activity logs?')) {
        chrome.storage.local.set({ activityLogs: [] }, () => {
          renderActivityLogs();
        });
      }
    });
  }

  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener('click', renderActivityLogs);
  }

  // ============================================================
  // SHOW UI
  // ============================================================
  document.body.classList.remove('hidden');
});

// ============================================================
// TOOLTIP LOGIC (identical to panel version, in popup scope)
// ============================================================
function initializeTooltips() {
  document.querySelectorAll('.info-icon[title]').forEach(icon => {
    const title = icon.getAttribute('title');
    if (title && !icon.getAttribute('data-image-tooltip')) {
      icon.setAttribute('data-tooltip', title);
      icon.removeAttribute('title');
    }
  });

  const textTooltipModal = document.createElement('div');
  textTooltipModal.className = 'tooltip-modal hidden';
  textTooltipModal.innerHTML = `
    <div class="tooltip-modal-content text-tooltip-content">
      <button class="tooltip-close-btn">✕</button>
      <div class="tooltip-text-content"></div>
    </div>`;
  document.body.appendChild(textTooltipModal);

  const imageTooltipModal = document.createElement('div');
  imageTooltipModal.className = 'tooltip-modal hidden';
  imageTooltipModal.innerHTML = `
    <div class="tooltip-modal-content">
      <button class="tooltip-close-btn">✕</button>
      <img class="tooltip-image" src="" alt="Info">
    </div>`;
  document.body.appendChild(imageTooltipModal);

  const closeText = textTooltipModal.querySelector('.tooltip-close-btn');
  const textContent = textTooltipModal.querySelector('.tooltip-text-content');
  closeText.addEventListener('click', () => textTooltipModal.classList.add('hidden'));
  textTooltipModal.addEventListener('click', (e) => {
    if (e.target === textTooltipModal) textTooltipModal.classList.add('hidden');
  });

  const closeImage = imageTooltipModal.querySelector('.tooltip-close-btn');
  const imageContent = imageTooltipModal.querySelector('.tooltip-image');
  closeImage.addEventListener('click', () => imageTooltipModal.classList.add('hidden'));
  imageTooltipModal.addEventListener('click', (e) => {
    if (e.target === imageTooltipModal) imageTooltipModal.classList.add('hidden');
  });

  document.querySelectorAll('.info-icon').forEach(icon => {
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = icon.getAttribute('data-tooltip');
      const imgSrc = icon.getAttribute('data-image-tooltip');
      if (imgSrc) {
        imageContent.src = imgSrc;
        imageTooltipModal.classList.remove('hidden');
      } else if (text) {
        textContent.textContent = text;
        textTooltipModal.classList.remove('hidden');
      }
    });
  });
}
