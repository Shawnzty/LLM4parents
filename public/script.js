// Chat Application for Parents
(function() {
  'use strict';

  // State
  let conversationHistory = [];
  let isLoading = false;
  let currentModel = 'gpt-4o';

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

  // Initialize
  async function init() {
    await loadModels();
    setupEventListeners();
    loadConversationFromStorage();
    autoResizeTextarea();
  }

  // Load available models from server
  async function loadModels() {
    try {
      const response = await fetch('/api/models');
      const data = await response.json();

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
    });

    // Quick prompts
    document.querySelectorAll('.quick-prompt').forEach(btn => {
      btn.addEventListener('click', () => {
        userInput.value = btn.dataset.prompt;
        autoResizeTextarea();
        sendMessage();
      });
    });
  }

  // Auto-resize textarea
  function autoResizeTextarea() {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 150) + 'px';
  }

  // Send message
  async function sendMessage() {
    const message = userInput.value.trim();
    if (!message || isLoading) return;

    // Hide welcome message
    if (welcomeMessage) {
      welcomeMessage.style.display = 'none';
    }

    // Add user message to UI
    addMessageToUI('user', message);

    // Add to conversation history
    conversationHistory.push({
      role: 'user',
      content: message
    });

    // Clear input
    userInput.value = '';
    autoResizeTextarea();

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
      const messageElement = createMessageElement('assistant', '');
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
  function addMessageToUI(role, content) {
    const messageElement = createMessageElement(role, content);
    messagesContainer.appendChild(messageElement);
    scrollToBottom();
  }

  // Create message element
  function createMessageElement(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}`;

    const avatar = role === 'user' ? '👤' : '🤖';

    div.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-content">${formatMessage(content)}</div>
    `;

    return div;
  }

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
  function clearConversation() {
    if (conversationHistory.length === 0) return;

    if (confirm('确定要清空所有对话吗？/ Clear all messages?')) {
      conversationHistory = [];
      messagesContainer.innerHTML = '';
      if (welcomeMessage) {
        welcomeMessage.style.display = 'block';
      }
      localStorage.removeItem('conversationHistory');
    }
  }

  // Save conversation to localStorage
  function saveConversationToStorage() {
    try {
      // Only keep last 50 messages to avoid storage issues
      const toSave = conversationHistory.slice(-50);
      localStorage.setItem('conversationHistory', JSON.stringify(toSave));
    } catch (e) {
      console.warn('Failed to save conversation:', e);
    }
  }

  // Load conversation from localStorage
  function loadConversationFromStorage() {
    try {
      const saved = localStorage.getItem('conversationHistory');
      if (saved) {
        conversationHistory = JSON.parse(saved);
        if (conversationHistory.length > 0) {
          welcomeMessage.style.display = 'none';
          conversationHistory.forEach(msg => {
            addMessageToUI(msg.role, msg.content);
          });
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
