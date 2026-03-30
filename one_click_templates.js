/**
 * One Click Share Templates
 * Allows users to combine a Group Preset with a Post Template for instant sharing
 */

function initializeOneClickTemplates(showView) {
    console.log('Initializing One Click Share Templates...');
    
    // Modal elements
    const oneClickIcon = document.getElementById('oneClickTemplatesIcon');
    const createModal = document.getElementById('create-one-click-modal');
    const managerModal = document.getElementById('one-click-manager-modal');
    const closeCreateModal = document.getElementById('close-create-one-click');
    const closeManagerModal = document.getElementById('close-one-click-manager');
    
    // Create form elements
    const templateNameInput = document.getElementById('one-click-template-name');
    const groupPresetSelect = document.getElementById('one-click-group-preset');
    const postTemplateSelect = document.getElementById('one-click-post-template');
    const saveOneClickBtn = document.getElementById('save-one-click-template');
    const cancelOneClickBtn = document.getElementById('cancel-one-click-template');
    
    // Manager elements
    const templatesListContainer = document.getElementById('one-click-templates-list');
    const emptyTemplatesState = document.querySelector('.empty-one-click-state');
    
    console.log('Elements found:', {
        oneClickIcon: !!oneClickIcon,
        createModal: !!createModal,
        managerModal: !!managerModal
    });
    
    // Get all 1 Click Templates from storage
    function getOneClickTemplates() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['oneClickTemplates'], (result) => {
                resolve(result.oneClickTemplates || []);
            });
        });
    }
    
    // Save 1 Click Templates to storage
    function saveOneClickTemplates(templates) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ oneClickTemplates: templates }, resolve);
        });
    }
    
    // Load Group Presets for dropdown
    function loadGroupPresets() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['groupPresets'], (result) => {
                resolve(result.groupPresets || []);
            });
        });
    }
    
    // Load Post Templates for dropdown
    function loadPostTemplates() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['postTemplates'], (result) => {
                const templates = result.postTemplates || {};
                resolve(templates);
            });
        });
    }
    
    // Populate dropdowns in create modal
    async function populateDropdowns() {
        const groupPresets = await loadGroupPresets();
        const postTemplates = await loadPostTemplates();
        
        // Populate Group Preset dropdown
        groupPresetSelect.innerHTML = '<option value="">-- Select a Group List --</option>';
        groupPresets.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = `${preset.name} (${preset.groups.length} groups)`;
            groupPresetSelect.appendChild(option);
        });
        
        // Populate Post Template dropdown
        postTemplateSelect.innerHTML = '<option value="">-- Select a Post Template --</option>';
        Object.keys(postTemplates).forEach(templateName => {
            const option = document.createElement('option');
            option.value = templateName;
            option.textContent = templateName;
            postTemplateSelect.appendChild(option);
        });
    }
    
    // Show create modal
    async function showCreateModal() {
        await populateDropdowns();
        
        // Check if user has presets and templates
        const groupPresets = await loadGroupPresets();
        const postTemplates = await loadPostTemplates();
        const postTemplateKeys = Object.keys(postTemplates);
        
        if (groupPresets.length === 0 || postTemplateKeys.length === 0) {
            let message = 'To create a 1 Click Share Template, you need:\n\n';
            if (groupPresets.length === 0) {
                message += '❌ At least one Group Preset (none found)\n';
            } else {
                message += `✓ Group Presets (${groupPresets.length} found)\n`;
            }
            if (postTemplateKeys.length === 0) {
                message += '❌ At least one Post Template (none found)\n';
            } else {
                message += `✓ Post Templates (${postTemplateKeys.length} found)\n`;
            }
            message += '\nWould you like to create the missing items first?';
            
            if (confirm(message)) {
                if (groupPresets.length === 0) {
                    alert('To create Group Presets:\n\n1. Select multiple groups\n2. Click "Share to Selected Groups"\n3. When prompted, save as a preset');
                }
                if (postTemplateKeys.length === 0) {
                    // Show templates view
                    if (showView) {
                        showView('templates');
                    }
                }
            }
            return;
        }
        
        // Clear form
        templateNameInput.value = '';
        groupPresetSelect.value = '';
        postTemplateSelect.value = '';
        
        createModal.classList.remove('hidden');
    }
    
    // Hide create modal
    function hideCreateModal() {
        createModal.classList.add('hidden');
    }
    
    // Save new 1 Click Template
    async function saveNewTemplate() {
        const name = templateNameInput.value.trim();
        const groupPresetId = groupPresetSelect.value;
        const postTemplateName = postTemplateSelect.value;
        
        // Validation
        if (!name) {
            alert('Please enter a name for this template.');
            templateNameInput.focus();
            return;
        }
        
        if (!groupPresetId) {
            alert('Please select a Group List.');
            groupPresetSelect.focus();
            return;
        }
        
        if (!postTemplateName) {
            alert('Please select a Post Template.');
            postTemplateSelect.focus();
            return;
        }
        
        // Get existing templates
        const templates = await getOneClickTemplates();
        
        // Check for duplicate name
        if (templates.some(t => t.name === name)) {
            if (!confirm(`A template named "${name}" already exists. Replace it?`)) {
                return;
            }
            // Remove old template with same name
            const updatedTemplates = templates.filter(t => t.name !== name);
            templates.length = 0;
            templates.push(...updatedTemplates);
        }
        
        // Get the actual preset and post template data
        const groupPresets = await loadGroupPresets();
        const postTemplates = await loadPostTemplates();
        
        const selectedPreset = groupPresets.find(p => p.id === groupPresetId);
        const selectedPostContent = postTemplates[postTemplateName];
        
        // Create new template
        const newTemplate = {
            id: Date.now().toString(),
            name: name,
            groupPresetId: groupPresetId,
            groupPresetName: selectedPreset ? selectedPreset.name : 'Unknown',
            groupCount: selectedPreset ? selectedPreset.groups.length : 0,
            postTemplateName: postTemplateName,
            postTemplatePreview: selectedPostContent ? selectedPostContent.substring(0, 100) : '',
            createdAt: new Date().toISOString()
        };
        
        templates.push(newTemplate);
        await saveOneClickTemplates(templates);
        
        showStatus(`✓ 1 Click Template "${name}" created successfully!`, 'success');
        hideCreateModal();
        
        // Update badge
        await updateOneClickBadge();
    }
    
    // Show manager modal
    async function showManagerModal() {
        const templates = await getOneClickTemplates();
        
        if (templates.length === 0) {
            templatesListContainer.classList.add('hidden');
            emptyTemplatesState.classList.remove('hidden');
        } else {
            templatesListContainer.classList.remove('hidden');
            emptyTemplatesState.classList.add('hidden');
            
            // Render templates
            templatesListContainer.innerHTML = templates.map(template => {
                const createdDate = new Date(template.createdAt).toLocaleDateString();
                return `
                    <div class="one-click-card" data-template-id="${template.id}">
                        <div class="one-click-card-header">
                            <div class="one-click-name-display">
                                <span class="one-click-emoji">⚡</span>
                                <span>${template.name}</span>
                            </div>
                            <div class="one-click-actions-row">
                                <button class="one-click-action-btn one-click-use-btn" data-action="use" data-template-id="${template.id}">
                                    🚀 Use
                                </button>
                                <button class="one-click-action-btn one-click-delete-btn" data-action="delete" data-template-id="${template.id}">
                                    🗑️
                                </button>
                            </div>
                        </div>
                        <div class="one-click-card-body">
                            <div class="one-click-info-section">
                                <div class="one-click-info-row">
                                    <span class="one-click-info-icon">📖</span>
                                    <span class="one-click-info-label">Group List:</span>
                                    <span class="one-click-info-value">${template.groupPresetName} (${template.groupCount} groups)</span>
                                </div>
                                <div class="one-click-info-row">
                                    <span class="one-click-info-icon">📝</span>
                                    <span class="one-click-info-label">Post Template:</span>
                                    <span class="one-click-info-value">${template.postTemplateName}</span>
                                </div>
                                <div class="one-click-info-row">
                                    <span class="one-click-info-icon">📅</span>
                                    <span class="one-click-info-label">Created:</span>
                                    <span class="one-click-info-value">${createdDate}</span>
                                </div>
                            </div>
                            <div class="one-click-post-preview">
                                <div class="preview-label">Post Preview:</div>
                                <div class="preview-content">${template.postTemplatePreview}${template.postTemplatePreview.length >= 100 ? '...' : ''}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            // Add event listeners
            document.querySelectorAll('.one-click-action-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const action = btn.getAttribute('data-action');
                    const templateId = btn.getAttribute('data-template-id');
                    
                    if (action === 'use') {
                        await useOneClickTemplate(templateId);
                    } else if (action === 'delete') {
                        await deleteOneClickTemplate(templateId);
                    }
                });
            });
        }
        
        managerModal.classList.remove('hidden');
    }
    
    // Hide manager modal
    function hideManagerModal() {
        managerModal.classList.add('hidden');
    }
    
    // Use a 1 Click Template - Full implementation
    async function useOneClickTemplate(templateId) {
        const templates = await getOneClickTemplates();
        const template = templates.find(t => t.id === templateId);
        
        if (!template) {
            showStatus('Template not found.', 'error');
            return;
        }
        
        console.log('Using 1 Click Template:', template.name);
        
        // Close the manager modal
        hideManagerModal();
        
        // Switch to main view if not already there
        if (showView) {
            showView('main');
        }
        
        // Step 1: Load the post template content
        const postTemplates = await loadPostTemplates();
        const postContent = postTemplates[template.postTemplateName];
        
        if (!postContent) {
            showStatus(`Post template "${template.postTemplateName}" not found.`, 'error');
            return;
        }
        
        // Fill the post content textarea
        const postContentArea = document.getElementById('post-content');
        if (postContentArea) {
            postContentArea.value = postContent;
            console.log('✓ Filled post content');
        }
        
        // Step 2: Load the group preset and apply it
        const groupPresets = await loadGroupPresets();
        const groupPreset = groupPresets.find(p => p.id === template.groupPresetId);
        
        if (!groupPreset) {
            showStatus(`Group preset "${template.groupPresetName}" not found.`, 'error');
            return;
        }
        
        console.log('✓ Found group preset:', groupPreset.name);
        
        // Show loading message
        showStatus('⏳ Loading groups and preparing to share...', 'loading');
        
        // Wait a moment for the UI to update
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Step 3: Apply the group preset (this will load all groups and select them)
        await applyGroupPreset(groupPreset);
        
        // Step 4: Wait for groups to be loaded and selected, then AUTOMATICALLY click share
        setTimeout(() => {
            const shareButton = document.getElementById('share-button');
            if (shareButton) {
                // Scroll to share button
                shareButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                showStatus(`✓ Starting to share with "${template.name}"...`, 'loading');
                
                // Wait a moment for scroll, then automatically click the share button
                setTimeout(() => {
                    console.log('✓ Automatically clicking Share button for 1 Click Template:', template.name);
                    shareButton.click();
                }, 500);
            }
        }, 1000);
    }
    
    // Helper function to apply a group preset (similar to the one in popup.js)
    async function applyGroupPreset(preset) {
        return new Promise((resolve) => {
            const groupList = document.getElementById('group-list');
            
            // Show loading indicator
            if (groupList) {
                groupList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon" style="font-size: 48px; animation: spin 2s linear infinite;">⏳</div>
                        <p class="empty-text" style="font-size: 18px; font-weight: bold;">Loading Groups...</p>
                        <p class="empty-hint">Preparing ${preset.groups.length} groups from "${preset.name}"</p>
                        <style>
                            @keyframes spin {
                                0% { transform: rotate(0deg); }
                                100% { transform: rotate(360deg); }
                            }
                        </style>
                    </div>
                `;
            }
            
            // Trigger "Show All Groups" to load all groups from Facebook
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
                if (tabs.length === 0) {
                    showStatus('No active tab found.', 'error');
                    resolve(false);
                    return;
                }

                const tab = tabs[0];
                
                if (!tab.url || !tab.url.includes('facebook.com')) {
                    showStatus('Please navigate to Facebook first.', 'error');
                    resolve(false);
                    return;
                }

                // Send message to content script to load all groups
                chrome.tabs.sendMessage(tab.id, { type: 'show_all_groups' }, async (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error:', chrome.runtime.lastError.message);
                        showStatus('Error: Make sure the share dialog is open on Facebook.', 'error');
                        resolve(false);
                        return;
                    }

                    if (response && response.success) {
                        console.log(`✓ Loaded ${response.totalGroups} groups from Facebook`);
                        
                        // Wait for groups to fully load
                        await new Promise(r => setTimeout(r, 2000));
                        
                        // Refresh the group list in popup
                        chrome.tabs.sendMessage(tab.id, { type: 'get_groups' }, (groupsResponse) => {
                            if (groupsResponse && groupsResponse.groups && groupsResponse.groups.length > 0) {
                                // Build the group list UI
                                if (groupList) {
                                    groupList.innerHTML = '';
                                    
                                    groupsResponse.groups.forEach((group) => {
                                        const div = document.createElement('div');
                                        div.className = 'group-item';
                                        
                                        const checkbox = document.createElement('input');
                                        checkbox.type = 'checkbox';
                                        checkbox.id = 'group_' + group.name.replace(/\s/g, '_');
                                        checkbox.value = group.name;
                                        
                                        // Check if this group is in the preset
                                        checkbox.checked = preset.groups.includes(group.name);
                                        
                                        const label = document.createElement('label');
                                        label.htmlFor = checkbox.id;
                                        label.textContent = group.name;
                                        
                                        div.appendChild(checkbox);
                                        div.appendChild(label);
                                        groupList.appendChild(div);
                                    });
                                    
                                    // Update share button count
                                    const shareButton = document.getElementById('share-button');
                                    const selectedCount = preset.groups.length;
                                    if (shareButton && selectedCount > 0) {
                                        shareButton.textContent = `Share to ${selectedCount} Selected Group${selectedCount > 1 ? 's' : ''}`;
                                    }
                                    
                                    console.log(`✓ Selected ${selectedCount} groups from preset`);
                                }
                                
                                resolve(true);
                            } else {
                                showStatus('Failed to load groups.', 'error');
                                resolve(false);
                            }
                        });
                    } else {
                        showStatus('Failed to load all groups from Facebook.', 'error');
                        resolve(false);
                    }
                });
            });
        });
    }
    
    // Delete a 1 Click Template
    async function deleteOneClickTemplate(templateId) {
        const templates = await getOneClickTemplates();
        const template = templates.find(t => t.id === templateId);
        
        if (!template) {
            return;
        }
        
        if (!confirm(`Delete 1 Click Template "${template.name}"?`)) {
            return;
        }
        
        const updatedTemplates = templates.filter(t => t.id !== templateId);
        await saveOneClickTemplates(updatedTemplates);
        
        // Update badge
        await updateOneClickBadge();
        
        // Refresh manager
        await showManagerModal();
        
        showStatus(`Template "${template.name}" deleted.`, 'success');
    }
    
    // Update badge count
    async function updateOneClickBadge() {
        if (!oneClickIcon) return; // Guard: icon may not exist in all contexts
        const templates = await getOneClickTemplates();
        if (templates.length > 0) {
            oneClickIcon.classList.add('has-templates');
            oneClickIcon.setAttribute('data-template-count', templates.length);
        } else {
            oneClickIcon.classList.remove('has-templates');
            oneClickIcon.removeAttribute('data-template-count');
        }
    }
    
    // Helper function to show status (assuming it exists in popup.js)
    function showStatus(message, type) {
        if (typeof window.showStatus === 'function') {
            window.showStatus(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }
    
    // Event Listeners
    if (oneClickIcon) {
        oneClickIcon.addEventListener('click', showManagerModal);
    }
    
    if (closeCreateModal) {
        closeCreateModal.addEventListener('click', hideCreateModal);
    }
    
    if (closeManagerModal) {
        closeManagerModal.addEventListener('click', hideManagerModal);
    }
    
    if (saveOneClickBtn) {
        saveOneClickBtn.addEventListener('click', saveNewTemplate);
    }
    
    if (cancelOneClickBtn) {
        cancelOneClickBtn.addEventListener('click', hideCreateModal);
    }
    
    // Close modals when clicking outside
    if (createModal) {
        createModal.addEventListener('click', (e) => {
            if (e.target === createModal) {
                hideCreateModal();
            }
        });
    }
    
    if (managerModal) {
        managerModal.addEventListener('click', (e) => {
            if (e.target === managerModal) {
                hideManagerModal();
            }
        });
    }
    
    // Add "Create New" button in manager modal header
    const createNewBtn = document.getElementById('create-new-one-click');
    if (createNewBtn) {
        createNewBtn.addEventListener('click', () => {
            hideManagerModal();
            showCreateModal();
        });
    }
    
    // Initialize badge on load
    updateOneClickBadge();
    
    // Expose functions for external use
    window.oneClickTemplates = {
        showCreateModal,
        showManagerModal,
        updateBadge: updateOneClickBadge
    };
}

// Auto-initialize if module system is not present
if (typeof module !== 'undefined' && module.exports) {
    module.exports = initializeOneClickTemplates;
}
