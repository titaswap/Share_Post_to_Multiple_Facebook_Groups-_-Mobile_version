document.addEventListener('DOMContentLoaded', () => {
  const generateIcon = document.getElementById('generateContentIcon');
  const aiMagicBtn = document.getElementById('ai-magic-btn');
  const aiModal = document.getElementById('ai-content-modal');
  const closeAiModal = document.getElementById('close-ai-modal');
  const generateBtn = document.getElementById('ai-generate-btn');
  const applyBtn = document.getElementById('ai-apply-btn');
  const resultsContainer = document.getElementById('ai-results-container');
  const promptInput = document.getElementById('ai-prompt');
  const countSelect = document.getElementById('ai-variation-count');
  const statusDiv = document.getElementById('ai-status');
  const variationIndicator = document.getElementById('variation-indicator');
  const variationCountText = document.getElementById('variation-count-text');
  const editVariationsBtn = document.getElementById('edit-variations-btn');

  // System Prompt UI Elements
  const promptSettingsBtn = document.getElementById('ai-prompt-settings-btn');
  const systemPromptContainer = document.getElementById('ai-system-prompt-container');
  const systemPromptInput = document.getElementById('ai-system-prompt');
  const saveSystemPromptBtn = document.getElementById('ai-save-system-prompt');
  const resetSystemPromptBtn = document.getElementById('ai-reset-system-prompt');

  // Default System Prompt
  const DEFAULT_SYSTEM_PROMPT = "You are a social media assistant. Generate distinct variations of a Facebook post based on the user's prompt. Each variation should be unique but convey the same core message. Vary the wording, tone, and structure to help avoid spam detection.";

  // Store generated variations globally
  let currentVariations = [];

  // Load stored system prompt
  chrome.storage.local.get(['aiSystemPrompt'], (result) => {
    if (result.aiSystemPrompt) {
      systemPromptInput.value = result.aiSystemPrompt;
    } else {
      systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
    }
  });

  // Toggle System Prompt Settings
  promptSettingsBtn.addEventListener('click', () => {
    if (systemPromptContainer.classList.contains('hidden')) {
      systemPromptContainer.classList.remove('hidden');
      promptSettingsBtn.innerHTML = '<span class="settings-icon">⚙️</span> Hide Advanced';
    } else {
      systemPromptContainer.classList.add('hidden');
      promptSettingsBtn.innerHTML = '<span class="settings-icon">⚙️</span> Advanced';
    }
  });

  // Save System Prompt
  saveSystemPromptBtn.addEventListener('click', () => {
    const newPrompt = systemPromptInput.value.trim();
    if (newPrompt) {
      chrome.storage.local.set({ aiSystemPrompt: newPrompt }, () => {
        showStatus('System prompt saved!', 'success');
        setTimeout(() => {
          if (statusDiv.textContent === 'System prompt saved!') statusDiv.classList.add('hidden');
        }, 2000);
      });
    }
  });

  // Reset System Prompt
  resetSystemPromptBtn.addEventListener('click', () => {
    systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
    chrome.storage.local.remove('aiSystemPrompt', () => {
      showStatus('System prompt reset to default.', 'success');
      setTimeout(() => {
        if (statusDiv.textContent === 'System prompt reset to default.') statusDiv.classList.add('hidden');
      }, 2000);
    });
  });

  // Open Modal - from header icon (if it exists)
  if (generateIcon) {
    generateIcon.addEventListener('click', () => {
      openAIModal();
    });
  }

  // Open Modal - from magic button
  if (aiMagicBtn) {
    aiMagicBtn.addEventListener('click', () => {
      openAIModal();
    });
  }

  // Edit variations button
  if (editVariationsBtn) {
    editVariationsBtn.addEventListener('click', () => {
      openAIModal();
      // If we have current variations, show them
      if (currentVariations.length > 0) {
        displayResults(currentVariations);
      }
    });
  }

  function openAIModal() {
    // Check if there's content in the main post textarea and populate the AI prompt
    const mainPostContent = document.getElementById('post-content');
    if (mainPostContent && mainPostContent.value.trim()) {
      promptInput.value = mainPostContent.value.trim();
    }

    aiModal.classList.remove('hidden');
    statusDiv.textContent = '';
    statusDiv.className = 'status hidden';
  }

  // Close Modal
  closeAiModal.addEventListener('click', () => {
    aiModal.classList.add('hidden');
  });

  // Close modal when clicking outside
  aiModal.addEventListener('click', (e) => {
    if (e.target === aiModal) {
      aiModal.classList.add('hidden');
    }
  });

  // Generate Content
  generateBtn.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();
    const count = parseInt(countSelect.value, 10);
    const systemPrompt = systemPromptInput.value.trim() || DEFAULT_SYSTEM_PROMPT;

    if (!prompt) {
      showStatus('Please describe your message first.', 'error');
      return;
    }

    showStatus('Generating variations...', 'loading');
    resultsContainer.innerHTML = '';
    applyBtn.classList.add('hidden');

    // [SAFE MODE] AI Generation Disabled
    showStatus('AI features are disabled in this safe version.', 'error');
    console.log('AI generation blocked: No background script available.');
    /*
    chrome.runtime.sendMessage({
      type: 'generate_content',
      prompt: prompt,
      count: count,
      systemPrompt: systemPrompt,
      apiKey: null // Will fetch Vercel API key in background
    }, (response) => {
      if (response && response.success) {
        currentVariations = response.variations;
        displayResults(currentVariations);
        showStatus(`Successfully generated ${currentVariations.length} variations!`, 'success');
      } else {
        showStatus(response.message || 'Generation failed. Please try again.', 'error');
      }
    });
    */
  });

  // Display Results
  function displayResults(variations) {
    resultsContainer.innerHTML = '';

    variations.forEach((text, index) => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'ai-result-item';

      const headerDiv = document.createElement('div');
      headerDiv.style.display = 'flex';
      headerDiv.style.justifyContent = 'space-between';
      headerDiv.style.alignItems = 'center';
      headerDiv.style.marginBottom = '8px';

      const checkboxContainer = document.createElement('div');
      checkboxContainer.style.display = 'flex';
      checkboxContainer.style.alignItems = 'center';
      checkboxContainer.style.gap = '8px';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true; // Default selected
      checkbox.id = `variation-${index}`;

      const label = document.createElement('label');
      label.htmlFor = `variation-${index}`;
      label.textContent = `Variation ${index + 1}`;

      checkboxContainer.appendChild(checkbox);
      checkboxContainer.appendChild(label);

      headerDiv.appendChild(checkboxContainer);

      const contentArea = document.createElement('textarea');
      contentArea.value = text;
      contentArea.className = 'variation-content';

      itemDiv.appendChild(headerDiv);
      itemDiv.appendChild(contentArea);

      resultsContainer.appendChild(itemDiv);
    });

    applyBtn.classList.remove('hidden');
  }

  // Apply Selection
  applyBtn.addEventListener('click', () => {
    const selectedVariations = [];
    const items = resultsContainer.querySelectorAll('.ai-result-item');

    items.forEach(item => {
      const checkbox = item.querySelector('input[type="checkbox"]');
      const textarea = item.querySelector('textarea');

      if (checkbox.checked) {
        selectedVariations.push(textarea.value);
      }
    });

    if (selectedVariations.length === 0) {
      showStatus('Please select at least one variation.', 'error');
      return;
    }

    // Store the variations
    currentVariations = selectedVariations;

    // Show variation indicator
    if (variationIndicator) {
      variationIndicator.classList.remove('hidden');
      variationCountText.textContent = `${selectedVariations.length} unique variation${selectedVariations.length > 1 ? 's' : ''} ready`;
    }

    // Dispatch event for popup.js to catch
    const event = new CustomEvent('variationsApplied', {
      detail: { variations: selectedVariations }
    });
    document.dispatchEvent(event);

    aiModal.classList.add('hidden');
    showStatus('', 'hidden');
  });

  function showStatus(msg, type) {
    statusDiv.textContent = msg;
    statusDiv.className = `status ${type}`;
    statusDiv.classList.remove('hidden');
  }
});
