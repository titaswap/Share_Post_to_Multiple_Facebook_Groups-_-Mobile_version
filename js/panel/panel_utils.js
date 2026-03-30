// ============================================================
// panel_utils.js
// Extracted from panel.js — Pure utilities: tab helpers,
// custom alert, view switching, tooltip logic.
// ZERO logic changes. Functions use getElementById internally
// instead of closure-scope variables (absolutely necessary
// for cross-file access, behavior is 100% identical).
// ============================================================

// ============================================================
// TAB HELPERS
// ============================================================
function getTargetTabId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('tabId') ? parseInt(params.get('tabId')) : null;
}

// Smart Tab Selector (Existing FB Tab > Create New)
function provideActiveTab(callback) {
    const paramId = getTargetTabId();
    
    const findFBTabs = () => {
        chrome.tabs.query({ url: "*://*.facebook.com/*" }, (tabs) => {
            if (tabs.length > 0) {
                callback(tabs[0].id);
            } else {
                // No FB tab found, create a new one
                const defaultUrl = document.getElementById('post-link-to-visit') ? document.getElementById('post-link-to-visit').value.trim() : "https://www.facebook.com";
                chrome.tabs.create({ url: defaultUrl }, (newTab) => {
                    callback(newTab.id);
                });
            }
        });
    };

    if (paramId) {
        chrome.tabs.get(paramId, (tab) => {
            if (chrome.runtime.lastError || !tab) {
                findFBTabs();
            } else {
                callback(paramId);
            }
        });
    } else {
        findFBTabs();
    }
}

// ============================================================
// CUSTOM ALERT
// ============================================================
function showCustomAlert(title, message, icon = 'ℹ️') {
  const overlay = document.getElementById('custom-alert');
  const titleEl = document.getElementById('custom-alert-title');
  const msgEl = document.getElementById('custom-alert-message');
  const iconEl = document.getElementById('custom-alert-icon');
  const btn = document.getElementById('custom-alert-btn');

  if (!overlay || !titleEl || !msgEl || !btn) return;

  titleEl.textContent = title;
  msgEl.textContent = message;
  iconEl.textContent = icon;
  overlay.classList.add('show');

  const close = () => overlay.classList.remove('show');
  btn.onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
}

// ============================================================
// VIEW MANAGEMENT — switch between main and sub-views
// ============================================================
function showView(view) {
  // Get elements directly by ID (necessary for cross-file access)
  const shareContainer = document.getElementById('share-container');
  const addressBookView = document.getElementById('address-book-view');
  const captionsView = document.getElementById('captions-view');
  const linksView = document.getElementById('links-view');

  // Hide all views first
  if (shareContainer) shareContainer.classList.add('hidden');
  if (addressBookView) addressBookView.classList.add('hidden');
  if (linksView) linksView.classList.add('hidden');
  if (captionsView) captionsView.classList.add('hidden');

  if (view === 'main') {
    if (shareContainer) shareContainer.classList.remove('hidden');
  } else if (view === 'templates') {
    if (addressBookView) addressBookView.classList.remove('hidden');
  } else if (view === 'links') {
    if (linksView) linksView.classList.remove('hidden');
  } else if (view === 'captions') {
    if (captionsView) captionsView.classList.remove('hidden');
  }
}

// ============================================================
// TOOLTIP LOGIC
// ============================================================
const removeDefaultTooltips = () => {
  document.querySelectorAll('.info-icon[title]').forEach(icon => {
    const title = icon.getAttribute('title');
    if (title && !icon.getAttribute('data-image-tooltip')) {
      icon.setAttribute('data-tooltip', title);
      icon.removeAttribute('title');
    }
  });
};

function initializeTooltips() {
  removeDefaultTooltips();

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

// ============================================================
// SCHEDULE PREVIEW HELPER
// (global so panel_presets.js can call it when applying workflow)
// ============================================================
function updateSchedulePreview() {
  const intervalType = document.getElementById('schedule-interval-type');
  const intervalValue = document.getElementById('schedule-interval-value');
  const previewText = document.getElementById('schedule-preview-text');
  const intervalLabel = document.getElementById('schedule-interval-label');

  if (!intervalType || !intervalValue || !previewText || !intervalLabel) return;
  const type = intervalType.value;
  const val = intervalValue.value || 0;
  
  intervalLabel.textContent = `${type.toUpperCase()} BETWEEN TRIGGERS`;
  const labelSingular = type.slice(0, -1);
  
  if (val == 1) {
      previewText.textContent = `🔄 Every ${labelSingular}`;
  } else {
      previewText.textContent = `🔄 Every ${val} ${type}`;
  }
}
