// address-book.js - Post Template Manager
// Module-level so both init and re-init use the same render function

let _addressBookInitialized = false;
let _abShowView = null;
let _editingKey = null;

/**
 * Renders template cards with the modern design.
 * Called on first load and on every re-open.
 */
function _renderTemplates() {
  const templateList = document.getElementById('template-list');
  if (!templateList) return;

  chrome.storage.local.get('postTemplates', (result) => {
    const postTemplates = result.postTemplates || {};
    const templateKeys = Object.keys(postTemplates);

    templateList.innerHTML = '';

    if (templateKeys.length === 0) {
      templateList.innerHTML = `
        <div style="
          text-align: center;
          padding: 32px 20px;
        ">
          <div style="font-size: 42px; margin-bottom: 12px; opacity: 0.55;">📝</div>
          <p style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.5); margin: 0 0 5px 0;">No templates saved yet</p>
          <p style="font-size: 11.5px; color: rgba(255,255,255,0.3); margin: 0; line-height: 1.5;">Click "Add New Template" below to get started</p>
        </div>`;
      return;
    }

    for (const key in postTemplates) {
      const preview = postTemplates[key].substring(0, 55) +
        (postTemplates[key].length > 55 ? '...' : '');

      const entry = document.createElement('div');
      entry.className = 'template-entry';
      entry.style.cssText = `
        background: rgba(8, 20, 45, 0.9);
        border: 1px solid rgba(30, 178, 255, 0.2);
        border-radius: 12px;
        padding: 11px 13px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        transition: background 0.2s, border-color 0.2s;
        box-sizing: border-box;
      `;

      entry.innerHTML = `
        <!-- Text side -->
        <div style="flex: 1; min-width: 0; overflow: hidden;">
          <div style="
            font-size: 13px;
            font-weight: 700;
            color: #1eb2ff;
            margin-bottom: 3px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          ">${key}</div>
          <div style="
            font-size: 11.5px;
            color: rgba(255,255,255,0.4);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.4;
          ">${preview || '—'}</div>
        </div>

        <!-- Button side -->
        <div style="display: flex; gap: 6px; flex-shrink: 0; align-items: center;">

          <!-- Use (green check) -->
          <button class="use-btn" data-key="${key}" title="Use this template"
            style="
              width: 34px;
              height: 34px;
              background: rgba(34, 197, 94, 0.2);
              border: 1.5px solid rgba(34, 197, 94, 0.55);
              color: #4ade80;
              border-radius: 9px;
              font-size: 16px;
              font-weight: 700;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: background 0.18s, transform 0.15s;
              padding: 0;
              line-height: 1;
              box-sizing: border-box;
            ">✓</button>

          <!-- Edit (orange pencil) -->
          <button class="edit-btn" data-key="${key}" title="Edit template"
            style="
              width: 34px;
              height: 34px;
              background: rgba(251, 146, 60, 0.18);
              border: 1.5px solid rgba(251, 146, 60, 0.5);
              color: #fb923c;
              border-radius: 9px;
              font-size: 15px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: background 0.18s, transform 0.15s;
              padding: 0;
              line-height: 1;
              box-sizing: border-box;
            ">✏️</button>

          <!-- Delete (red trash) -->
          <button class="delete-btn" data-key="${key}" title="Delete template"
            style="
              width: 34px;
              height: 34px;
              background: rgba(239, 68, 68, 0.18);
              border: 1.5px solid rgba(239, 68, 68, 0.45);
              color: #f87171;
              border-radius: 9px;
              font-size: 15px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: background 0.18s, transform 0.15s;
              padding: 0;
              line-height: 1;
              box-sizing: border-box;
            ">🗑️</button>

        </div>
      `;

      // Card hover
      entry.addEventListener('mouseenter', () => {
        entry.style.borderColor = 'rgba(30,178,255,0.4)';
        entry.style.background = 'rgba(16, 32, 65, 0.95)';
      });
      entry.addEventListener('mouseleave', () => {
        entry.style.borderColor = 'rgba(30,178,255,0.2)';
        entry.style.background = 'rgba(8, 20, 45, 0.9)';
      });

      // Button hover effects
      const useBtn = entry.querySelector('.use-btn');
      useBtn.addEventListener('mouseenter', () => { useBtn.style.background = 'rgba(34,197,94,0.38)'; useBtn.style.transform = 'scale(1.1)'; });
      useBtn.addEventListener('mouseleave', () => { useBtn.style.background = 'rgba(34,197,94,0.2)'; useBtn.style.transform = 'scale(1)'; });

      const editBtn = entry.querySelector('.edit-btn');
      editBtn.addEventListener('mouseenter', () => { editBtn.style.background = 'rgba(251,146,60,0.35)'; editBtn.style.transform = 'scale(1.1)'; });
      editBtn.addEventListener('mouseleave', () => { editBtn.style.background = 'rgba(251,146,60,0.18)'; editBtn.style.transform = 'scale(1)'; });

      const delBtn = entry.querySelector('.delete-btn');
      delBtn.addEventListener('mouseenter', () => { delBtn.style.background = 'rgba(239,68,68,0.35)'; delBtn.style.transform = 'scale(1.1)'; });
      delBtn.addEventListener('mouseleave', () => { delBtn.style.background = 'rgba(239,68,68,0.18)'; delBtn.style.transform = 'scale(1)'; });

      // Click handlers (use event delegation via button not needed — direct)
      useBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const k = useBtn.dataset.key;
        chrome.storage.local.get('postTemplates', (res) => {
          const pt = res.postTemplates || {};
          const postContentArea = document.getElementById('post-content');
          if (postContentArea && pt[k]) {
            postContentArea.value = pt[k];
            document.dispatchEvent(new CustomEvent('templateUsed', { detail: { content: pt[k] } }));
          }
          if (_abShowView) _abShowView('main');
        });
      });

      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const k = editBtn.dataset.key;
        chrome.storage.local.get('postTemplates', (res) => {
          const pt = res.postTemplates || {};
          _editingKey = k;
          _showEditForm(k, pt[k] || '');
        });
      });

      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const k = delBtn.dataset.key;
        if (confirm(`Delete template "${k}"?`)) {
          chrome.storage.local.get('postTemplates', (res) => {
            const pt = res.postTemplates || {};
            delete pt[k];
            chrome.storage.local.set({ postTemplates: pt }, _renderTemplates);
          });
        }
      });

      templateList.appendChild(entry);
    }
  });
}

function _showEditForm(name, data) {
  const editForm = document.getElementById('edit-form');
  const editNameInput = document.getElementById('edit-name');
  const editDataTextarea = document.getElementById('edit-data');
  const addNewButton = document.getElementById('add-new');
  const templateList = document.getElementById('template-list');

  if (!editForm) return;
  if (editNameInput) editNameInput.value = name || '';
  if (editDataTextarea) editDataTextarea.value = data || '';
  editForm.classList.remove('hidden');
  if (addNewButton) addNewButton.closest('div').style.display = 'none';
  if (templateList) templateList.style.display = 'none';
}

function _hideEditForm() {
  const editForm = document.getElementById('edit-form');
  const addNewButton = document.getElementById('add-new');
  const templateList = document.getElementById('template-list');

  if (editForm) editForm.classList.add('hidden');
  if (addNewButton) addNewButton.closest('div').style.display = '';
  if (templateList) {
    templateList.style.display = 'flex';
    templateList.style.flexDirection = 'column';
    templateList.style.gap = '8px';
  }
  _editingKey = null;
}

// ============================================================
// MAIN INIT — called by popup.js
// ============================================================
function initializeAddressBook(showView) {
  _abShowView = showView;

  // Always refresh template list on every open
  _renderTemplates();

  // If already fully initialized (event listeners attached), just refresh
  if (_addressBookInitialized) return;
  _addressBookInitialized = true;

  const addNewButton = document.getElementById('add-new');
  const saveEditButton = document.getElementById('save-edit');
  const cancelEditButton = document.getElementById('cancel-edit');
  const backButton = document.getElementById('back-button');

  if (addNewButton) {
    addNewButton.addEventListener('click', () => {
      _editingKey = null;
      _showEditForm('', '');
    });
  }

  if (saveEditButton) {
    saveEditButton.addEventListener('click', () => {
      const name = document.getElementById('edit-name')?.value.trim();
      const data = document.getElementById('edit-data')?.value.trim();

      if (!name || !data) {
        alert('Template name and content cannot be empty.');
        return;
      }

      chrome.storage.local.get('postTemplates', (result) => {
        const postTemplates = result.postTemplates || {};
        if (_editingKey && _editingKey !== name) {
          delete postTemplates[_editingKey];
        }
        postTemplates[name] = data;
        chrome.storage.local.set({ postTemplates }, () => {
          _hideEditForm();
          _renderTemplates();
        });
      });
    });
  }

  if (cancelEditButton) {
    cancelEditButton.addEventListener('click', _hideEditForm);
  }

  if (backButton) {
    backButton.addEventListener('click', () => {
      if (showView) showView('main');
    });
  }

  // Expose for external use
  window.addNewTemplateWithContent = (content) => {
    _editingKey = null;
    _showEditForm('', content);
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = initializeAddressBook;
}
