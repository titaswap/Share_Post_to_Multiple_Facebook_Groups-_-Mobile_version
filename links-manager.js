/**
 * Links Manager Logic
 * Manages saving, viewing, deleting and applying post links
 */

window.initializeLinksManager = function(showViewCallback) {
    const linksListMain = document.getElementById('links-list-main');
    const noLinksState = document.getElementById('no-links-state');
    const linkEditForm = document.getElementById('link-edit-form');
    const addLinkBtnContainer = document.getElementById('add-link-btn-container');
    const openAddLinkFormBtn = document.getElementById('open-add-link-form');
    
    const linkFormTitle = document.getElementById('link-form-title');
    const linkNameInput = document.getElementById('link-edit-name');
    const linkUrlInput = document.getElementById('link-edit-url');
    const saveLinkBtn = document.getElementById('save-link-btn');
    const cancelLinkEditBtn = document.getElementById('cancel-link-edit');
    const backFromLinksBtn = document.getElementById('back-from-links');

    let currentEditingLinkId = null;

    // Back button
    if (backFromLinksBtn) {
        backFromLinksBtn.onclick = () => showViewCallback('main');
    }

    // Open Add Form
    if (openAddLinkFormBtn) {
        openAddLinkFormBtn.onclick = () => {
            currentEditingLinkId = null;
            linkFormTitle.textContent = '➕ Add New Link';
            linkNameInput.value = '';
            linkUrlInput.value = '';
            linkEditForm.classList.remove('hidden');
            addLinkBtnContainer.classList.add('hidden');
        };
    }

    // Cancel Edit
    if (cancelLinkEditBtn) {
        cancelLinkEditBtn.onclick = () => {
            linkEditForm.classList.add('hidden');
            addLinkBtnContainer.classList.remove('hidden');
        };
    }

    // Save Link
    if (saveLinkBtn) {
        saveLinkBtn.onclick = () => {
            const name = linkNameInput.value.trim();
            const url = linkUrlInput.value.trim();

            if (!name || !url) {
                alert('Please fill in both fields!');
                return;
            }

            chrome.storage.local.get(['savedLinks'], (result) => {
                let links = result.savedLinks || [];
                
                if (currentEditingLinkId) {
                    // Update existing
                    links = links.map(l => l.id === currentEditingLinkId ? { ...l, name, url } : l);
                } else {
                    // Add new
                    const now = new Date();
                    const dateStr = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                    
                    links.push({
                        id: Date.now().toString(),
                        name,
                        url,
                        createdAt: `${dateStr} | ${timeStr}`
                    });
                }

                chrome.storage.local.set({ savedLinks: links }, () => {
                    linkEditForm.classList.add('hidden');
                    addLinkBtnContainer.classList.remove('hidden');
                    renderLinks();
                });
            });
        };
    }

    function renderLinks() {
        chrome.storage.local.get(['savedLinks'], (result) => {
            const links = result.savedLinks || [];
            
            if (links.length === 0) {
                noLinksState.classList.remove('hidden');
                linksListMain.innerHTML = '';
            } else {
                noLinksState.classList.add('hidden');
                linksListMain.innerHTML = '';
                
                links.forEach(link => {
                    const card = document.createElement('div');
                    card.style.cssText = `
                        background: rgba(30,178,255,0.05);
                        border: 1px solid rgba(30,178,255,0.15);
                        border-radius: 12px;
                        padding: 12px;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                        transition: all 0.2s;
                    `;

                    card.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div style="flex:1;">
                                <div style="color:#fff; font-weight:700; font-size:13px; margin-bottom:2px;">🔗 ${link.name}</div>
                                <div style="color:rgba(255,255,255,0.4); font-size:10px; word-break:break-all;">${link.url}</div>
                                <div style="color:#1eb2ff; font-size:9px; margin-top:5px; opacity:0.8; font-weight:600;">📅 ${link.createdAt || 'N/A'}</div>
                            </div>
                            <div style="display:flex; gap:6px;">
                                <button class="edit-link" data-id="${link.id}" style="background:none; border:none; cursor:pointer; font-size:14px; opacity:0.7;">✏️</button>
                                <button class="del-link" data-id="${link.id}" style="background:none; border:none; cursor:pointer; font-size:14px; opacity:0.7;">🗑️</button>
                            </div>
                        </div>
                        <button class="apply-link" data-url="${link.url}" style="
                            width:100%;
                            background: rgba(30,178,255,0.1);
                            border: 1px solid rgba(30,178,255,0.3);
                            color: #1eb2ff;
                            padding: 6px;
                            border-radius: 8px;
                            font-size: 11px;
                            font-weight: 700;
                            cursor: pointer;
                        ">APPLY LINK</button>
                    `;

                    // Event Listeners for buttons inside card
                    card.querySelector('.apply-link').onclick = () => {
                        const targetInput = document.getElementById('post-link-to-visit');
                        if (targetInput) {
                            targetInput.value = link.url;
                            showViewCallback('main');
                        }
                    };

                    card.querySelector('.edit-link').onclick = () => {
                        currentEditingLinkId = link.id;
                        linkFormTitle.textContent = '✏️ Edit Link';
                        linkNameInput.value = link.name;
                        linkUrlInput.value = link.url;
                        linkEditForm.classList.remove('hidden');
                        addLinkBtnContainer.classList.add('hidden');
                        linkEditForm.scrollIntoView({ behavior: 'smooth' });
                    };

                    card.querySelector('.del-link').onclick = () => {
                        if (confirm(`Delete link "${link.name}"?`)) {
                            chrome.storage.local.get(['savedLinks'], (res) => {
                                const updated = (res.savedLinks || []).filter(l => l.id !== link.id);
                                chrome.storage.local.set({ savedLinks: updated }, renderLinks);
                            });
                        }
                    };

                    linksListMain.appendChild(card);
                });
            }
        });
    }

    renderLinks();
};
