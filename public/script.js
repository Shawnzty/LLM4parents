// Chat Application for Parents
(function() {
  'use strict';

  // State
  let conversationHistory = [];
  let isLoading = false;
  let currentModel = 'gemini-3-flash';
  let pendingImages = []; // Array of {file, dataUrl}
  let modelsData = []; // Store models info including vision support
  let isRecording = false;
  let recognition = null;
  let deviceId = null; // Unique device identifier

  // DOM Elements
  const chatContainer = document.getElementById('chat-container');
  const messagesContainer = document.getElementById('messages');
  const welcomeMessage = document.getElementById('welcome-message');
  const userInput = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const clearBtn = document.getElementById('clear-btn');
  const modelSelect = document.getElementById('model-select');
  const loadingOverlay = document.getElementById('loading-overlay');
  const errorToast = document.getElementById('error-toast');
  const imageInput = document.getElementById('image-input');
  const uploadBtn = document.getElementById('upload-btn');
  const voiceBtn = document.getElementById('voice-btn');
  const imagePreviewContainer = document.getElementById('image-preview-container');
  const imagePreviews = document.getElementById('image-previews');
  const clearImagesBtn = document.getElementById('clear-images-btn');

  // Generate UUID for device identification
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Get or create device ID
  function getDeviceId() {
    let id = localStorage.getItem('deviceId');
    if (!id) {
      id = generateUUID();
      localStorage.setItem('deviceId', id);
    }
    return id;
  }

  // Initialize
  async function init() {
    deviceId = getDeviceId();
    await loadModels();
    setupEventListeners();
    setupVoiceRecognition();
    await loadConversationFromServer();
    autoResizeTextarea();
  }

  // Load available models from server
  async function loadModels() {
    try {
      const response = await fetch('/api/models');
      const data = await response.json();
      modelsData = data.models;

      modelSelect.innerHTML = '';
      data.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        modelSelect.appendChild(option);
      });

      // Restore saved model preference
      const savedModel = localStorage.getItem('selectedModel');
      if (savedModel && data.models.find(m => m.id === savedModel)) {
        modelSelect.value = savedModel;
        currentModel = savedModel;
      }
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  }

  // Check if current model supports vision
  function currentModelSupportsVision() {
    const model = modelsData.find(m => m.id === currentModel);
    return model ? model.supportsVision : false;
  }

  // Setup event listeners
  function setupEventListeners() {
    // Send button
    sendBtn.addEventListener('click', sendMessage);

    // Enter to send (Shift+Enter for new line)
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-resize textarea
    userInput.addEventListener('input', autoResizeTextarea);

    // Clear button
    clearBtn.addEventListener('click', clearConversation);

    // Model selection
    modelSelect.addEventListener('change', (e) => {
      currentModel = e.target.value;
      localStorage.setItem('selectedModel', currentModel);

      // Warn if images are pending and model doesn't support vision
      if (pendingImages.length > 0 && !currentModelSupportsVision()) {
        showError('当前模型不支持图片，请选择支持图片的模型或清除图片');
      }
    });

    // Quick prompts
    document.querySelectorAll('.quick-prompt').forEach(btn => {
      btn.addEventListener('click', () => {
        userInput.value = btn.dataset.prompt;
        autoResizeTextarea();
        sendMessage();
      });
    });

    // Image upload button
    uploadBtn.addEventListener('click', () => {
      imageInput.click();
    });

    // Voice input button
    voiceBtn.addEventListener('click', toggleVoiceRecording);

    // Image file selection
    imageInput.addEventListener('change', handleImageSelection);

    // Clear images button
    clearImagesBtn.addEventListener('click', clearPendingImages);

    // Handle paste events for images
    document.addEventListener('paste', handlePaste);

    // Handle drag and drop
    const inputArea = document.querySelector('.input-area');
    inputArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      inputArea.style.backgroundColor = 'var(--background-color)';
    });
    inputArea.addEventListener('dragleave', () => {
      inputArea.style.backgroundColor = '';
    });
    inputArea.addEventListener('drop', handleDrop);
  }

  // Handle image selection
  function handleImageSelection(e) {
    const files = Array.from(e.target.files);
    processImageFiles(files);
    imageInput.value = ''; // Reset input
  }

  // Handle paste event
  function handlePaste(e) {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(item => item.type.startsWith('image/'));

    if (imageItems.length > 0) {
      e.preventDefault();
      const files = imageItems.map(item => item.getAsFile()).filter(Boolean);
      processImageFiles(files);
    }
  }

  // Handle drag and drop
  function handleDrop(e) {
    e.preventDefault();
    e.target.closest('.input-area').style.backgroundColor = '';

    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    processImageFiles(files);
  }

  // Setup voice recognition
  function setupVoiceRecognition() {
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported');
      voiceBtn.style.display = 'none';
      return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN'; // Chinese language

    recognition.onstart = () => {
      isRecording = true;
      voiceBtn.classList.add('recording');
      voiceBtn.innerHTML = '🔴';
      voiceBtn.title = '正在录音... 点击停止';
    };

    recognition.onend = () => {
      isRecording = false;
      voiceBtn.classList.remove('recording');
      voiceBtn.innerHTML = '🎤';
      voiceBtn.title = '语音输入 (点击开始)';
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // Update input with transcription
      if (finalTranscript) {
        userInput.value += finalTranscript;
        autoResizeTextarea();
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      isRecording = false;
      voiceBtn.classList.remove('recording');
      voiceBtn.innerHTML = '🎤';

      if (event.error === 'not-allowed') {
        showError('请允许麦克风权限以使用语音输入');
      } else if (event.error === 'no-speech') {
        showError('未检测到语音，请再试一次');
      } else {
        showError('语音识别出错，请再试一次');
      }
    };
  }

  // Toggle voice recording
  function toggleVoiceRecording() {
    if (!recognition) {
      showError('您的浏览器不支持语音输入，请使用Chrome或Edge浏览器');
      return;
    }

    if (isRecording) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (e) {
        // Already started, stop it
        recognition.stop();
      }
    }
  }

  // Process image files
  function processImageFiles(files) {
    if (files.length === 0) return;

    // Check model support
    if (!currentModelSupportsVision()) {
      showError('当前模型不支持图片，请先选择支持图片的模型（如GPT-4o、o1等）');
      return;
    }

    // Limit to 10 images
    const remainingSlots = 10 - pendingImages.length;
    if (remainingSlots <= 0) {
      showError('最多只能上传10张图片');
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);

    filesToProcess.forEach(file => {
      // Check file size (max 20MB per image)
      if (file.size > 20 * 1024 * 1024) {
        showError(`图片 ${file.name} 太大，最大支持20MB`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        pendingImages.push({ file, dataUrl });
        updateImagePreviews();
      };
      reader.readAsDataURL(file);
    });
  }

  // Update image previews
  function updateImagePreviews() {
    if (pendingImages.length === 0) {
      imagePreviewContainer.style.display = 'none';
      uploadBtn.classList.remove('has-images');
      return;
    }

    imagePreviewContainer.style.display = 'block';
    uploadBtn.classList.add('has-images');

    imagePreviews.innerHTML = '';
    pendingImages.forEach((img, index) => {
      const div = document.createElement('div');
      div.className = 'image-preview-item';
      div.innerHTML = `
        <img src="${img.dataUrl}" alt="Preview ${index + 1}">
        <button class="remove-image" data-index="${index}" title="删除">×</button>
      `;
      imagePreviews.appendChild(div);
    });

    // Add click handlers for remove buttons
    imagePreviews.querySelectorAll('.remove-image').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        pendingImages.splice(index, 1);
        updateImagePreviews();
      });
    });
  }

  // Clear pending images
  function clearPendingImages() {
    pendingImages = [];
    updateImagePreviews();
  }

  // Auto-resize textarea
  function autoResizeTextarea() {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 150) + 'px';
  }

  // Send message
  async function sendMessage() {
    const message = userInput.value.trim();
    if ((!message && pendingImages.length === 0) || isLoading) return;

    // Check if trying to send images with non-vision model
    if (pendingImages.length > 0 && !currentModelSupportsVision()) {
      showError('当前模型不支持图片，请选择支持图片的模型');
      return;
    }

    // Hide welcome message
    if (welcomeMessage) {
      welcomeMessage.style.display = 'none';
    }

    // Build message content
    let messageContent;
    const currentImages = [...pendingImages]; // Copy for display

    if (pendingImages.length > 0) {
      // Multi-modal message with images
      messageContent = [];

      // Add images first
      pendingImages.forEach(img => {
        messageContent.push({
          type: 'image_url',
          image_url: {
            url: img.dataUrl,
            detail: 'auto'
          }
        });
      });

      // Add text if present
      if (message) {
        messageContent.push({
          type: 'text',
          text: message
        });
      }
    } else {
      messageContent = message;
    }

    // Add user message to UI (with images)
    addMessageToUI('user', message, currentImages);

    // Add to conversation history
    conversationHistory.push({
      role: 'user',
      content: messageContent
    });

    // Clear input and images
    userInput.value = '';
    autoResizeTextarea();
    clearPendingImages();

    // Save to storage
    saveConversationToStorage();

    // Send to API with streaming
    await sendToAPI();
  }

  // Send to API with streaming
  async function sendToAPI() {
    isLoading = true;
    sendBtn.disabled = true;

    // Add typing indicator
    const typingElement = addTypingIndicator();

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: conversationHistory,
          model: currentModel
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '请求失败');
      }

      // Remove typing indicator
      typingElement.remove();

      // Create message element for streaming
      const messageElement = createMessageElement('assistant', '', []);
      messagesContainer.appendChild(messageElement);
      const contentElement = messageElement.querySelector('.message-content');

      // Read stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
                contentElement.innerHTML = formatMessage(fullContent);
                scrollToBottom();
              }
            } catch (e) {
              // Ignore parsing errors for incomplete chunks
            }
          }
        }
      }

      // Add to conversation history
      conversationHistory.push({
        role: 'assistant',
        content: fullContent
      });

      // Save to storage
      saveConversationToStorage();

    } catch (error) {
      console.error('API Error:', error);
      typingElement?.remove();
      showError(error.message || '发送消息失败，请稍后再试');

      // Remove the last user message from history if failed
      conversationHistory.pop();
      saveConversationToStorage();
    } finally {
      isLoading = false;
      sendBtn.disabled = false;
      scrollToBottom();
    }
  }

  // Add message to UI
  function addMessageToUI(role, content, images = []) {
    const messageElement = createMessageElement(role, content, images);
    messagesContainer.appendChild(messageElement);
    scrollToBottom();
  }

  // Create message element
  function createMessageElement(role, content, images = []) {
    const div = document.createElement('div');
    div.className = `message ${role}`;

    const avatar = role === 'user' ? '👤' : '🤖';

    let imagesHtml = '';
    if (images && images.length > 0) {
      imagesHtml = '<div class="message-images">' +
        images.map(img => `<img src="${img.dataUrl}" alt="Uploaded image" onclick="window.showImageModal(this.src)">`).join('') +
        '</div>';
    }

    div.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-content">${imagesHtml}${formatMessage(content)}</div>
    `;

    return div;
  }

  // Show image modal (exposed globally)
  window.showImageModal = function(src) {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `<img src="${src}" alt="Full size image">`;
    modal.addEventListener('click', () => modal.remove());
    document.body.appendChild(modal);
  };

  // Format message content (basic markdown support)
  function formatMessage(content) {
    if (!content) return '';

    // Escape HTML
    let formatted = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks
    formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

    // Inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');

    // Lists (basic)
    formatted = formatted.replace(/^- (.+)$/gm, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    return formatted;
  }

  // Add typing indicator
  function addTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'message assistant';
    div.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content">
        <div class="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    `;
    messagesContainer.appendChild(div);
    scrollToBottom();
    return div;
  }

  // Scroll to bottom
  function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // Clear conversation
  async function clearConversation() {
    if (conversationHistory.length === 0 && pendingImages.length === 0) return;

    if (confirm('确定要清空所有对话吗？/ Clear all messages?')) {
      conversationHistory = [];
      messagesContainer.innerHTML = '';
      clearPendingImages();
      if (welcomeMessage) {
        welcomeMessage.style.display = 'block';
      }
      localStorage.removeItem('conversationHistory');

      // Also clear from server
      try {
        await fetch('/api/history/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: deviceId })
        });
      } catch (e) {
        console.warn('Failed to clear server history:', e);
      }
    }
  }

  // Save conversation to server (with device ID)
  async function saveConversationToStorage() {
    try {
      // Only keep last 50 messages
      // Strip image data from storage to save space
      const toSave = conversationHistory.slice(-50).map(msg => {
        if (Array.isArray(msg.content)) {
          // Strip image data, keep only text
          const textContent = msg.content.find(c => c.type === 'text');
          return {
            ...msg,
            content: textContent ? textContent.text : '[图片消息]',
            hadImages: true
          };
        }
        return msg;
      });

      // Save to server
      await fetch('/api/history/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: deviceId,
          messages: toSave
        })
      });

      // Also save locally as backup
      localStorage.setItem('conversationHistory', JSON.stringify(toSave));
    } catch (e) {
      console.warn('Failed to save conversation:', e);
      // Fallback: save locally only
      try {
        localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory.slice(-50)));
      } catch (localError) {
        console.warn('Failed to save locally:', localError);
      }
    }
  }

  // Load conversation from server (with device ID)
  async function loadConversationFromServer() {
    try {
      const response = await fetch(`/api/history/load?deviceId=${encodeURIComponent(deviceId)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.messages && data.messages.length > 0) {
          welcomeMessage.style.display = 'none';
          data.messages.forEach(msg => {
            let displayContent = msg.content;
            if (msg.hadImages) {
              displayContent = '[包含图片] ' + displayContent;
            }
            addMessageToUI(msg.role, displayContent);
          });
          conversationHistory = data.messages;
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load from server, trying local storage:', e);
    }

    // Fallback: try loading from localStorage
    try {
      const saved = localStorage.getItem('conversationHistory');
      if (saved) {
        const loadedHistory = JSON.parse(saved);
        if (loadedHistory.length > 0) {
          welcomeMessage.style.display = 'none';
          loadedHistory.forEach(msg => {
            let displayContent = msg.content;
            if (msg.hadImages) {
              displayContent = '[包含图片] ' + displayContent;
            }
            addMessageToUI(msg.role, displayContent);
          });
          conversationHistory = loadedHistory;
        }
      }
    } catch (e) {
      console.warn('Failed to load conversation:', e);
      conversationHistory = [];
    }
  }

  // Show error toast
  function showError(message) {
    errorToast.textContent = message;
    errorToast.style.display = 'block';

    setTimeout(() => {
      errorToast.style.display = 'none';
    }, 5000);
  }

  // Show/hide loading overlay
  function showLoading(show) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
