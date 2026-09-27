(function () {
    const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

    // Set PDF.js worker
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    let apiKey = '';
    let currentChatId = null;
    let chats = [];
    let uploadedFileContent = '';
    let uploadedFileName = '';

    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveApiBtn = document.getElementById('saveApiBtn');
    const apiStatus = document.getElementById('apiStatus');
    const messagesContainer = document.getElementById('messagesContainer');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const fileInput = document.getElementById('fileInput');
    const fileBadgeContainer = document.getElementById('fileBadgeContainer');
    const historyList = document.getElementById('historyList');
    const newChatBtn = document.getElementById('newChatBtn');

    function generateId() { return Date.now() + '-' + Math.random().toString(36).substring(2, 9); }

    function loadApiKeyFromStorage() {
        const stored = localStorage.getItem('openrouter_api_key');
        if (stored) { apiKey = stored; apiKeyInput.value = stored; updateApiStatus(true); }
        else { updateApiStatus(false); }
    }
    function saveApiKeyToStorage(key) {
        if (key) localStorage.setItem('openrouter_api_key', key);
        else localStorage.removeItem('openrouter_api_key');
    }
    function updateApiStatus(isActive) {
        if (isActive && apiKey) {
            apiStatus.classList.add('active');
            apiStatus.innerHTML = `<i class="fas fa-circle" style="font-size: 8px; color: #1e7b4c;"></i> <span>API key set</span>`;
        } else {
            apiStatus.classList.remove('active');
            apiStatus.innerHTML = `<i class="fas fa-circle" style="font-size: 8px; color: #b0b0b8;"></i> <span>not set</span>`;
        }
    }
    function showFileBadge(name) {
        fileBadgeContainer.innerHTML = `
          <div class="file-name-badge">
            <i class="fas fa-file-alt"></i> ${name.length > 30 ? name.substring(0, 27) + '...' : name}
            <i class="fas fa-times" id="removeFileBtn" style="cursor: pointer;"></i>
          </div>`;
        document.getElementById('removeFileBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            uploadedFileContent = ''; uploadedFileName = '';
            fileBadgeContainer.innerHTML = ''; fileInput.value = '';
        });
    }

    function createNewChat(initialTitle = 'New chat') {
        const chat = {
            id: generateId(),
            title: initialTitle,
            messages: [{ role: 'assistant', content: "Hi! I'm your study assistant. Upload a book or lecture notes (PDF, DOCX, TXT), and I'll help you understand the material. Ask me anything!", timestamp: Date.now() }]
        };
        chats.unshift(chat);
        currentChatId = chat.id;
        renderHistory(); renderMessages();
        return chat;
    }
    function getCurrentChat() { return chats.find(c => c.id === currentChatId) || chats[0]; }

    function addMessageToCurrentChat(role, content) {
        const chat = getCurrentChat();
        if (!chat) return;
        chat.messages.push({ role, content, timestamp: Date.now() });
        if (role === 'user' && chat.title === 'New chat') {
            chat.title = content.length > 30 ? content.substring(0, 28) + '...' : content;
        }
        renderHistory(); renderMessages();
    }

    function renderHistory() {
        if (chats.length === 0) { historyList.innerHTML = '<div class="empty-history">No chats yet</div>'; return; }
        let html = '';
        chats.forEach(chat => {
            const isActive = chat.id === currentChatId;
            const safeTitle = chat.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            html += `<div class="history-item ${isActive ? 'active' : ''}" data-chat-id="${chat.id}"><i class="far fa-comment"></i> ${safeTitle}</div>`;
        });
        historyList.innerHTML = html;
        document.querySelectorAll('.history-item').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.getAttribute('data-chat-id');
                if (id) switchChat(id);
            });
        });
    }

    function switchChat(id) {
        const chat = chats.find(c => c.id === id);
        if (!chat) return;
        currentChatId = id;
        renderHistory(); renderMessages();
        uploadedFileContent = ''; uploadedFileName = '';
        fileBadgeContainer.innerHTML = ''; fileInput.value = '';
    }

    function renderMessages() {
        const chat = getCurrentChat();
        if (!chat) return;
        let html = '';
        chat.messages.forEach(msg => {
            const isUser = msg.role === 'user';
            const bubbleClass = isUser ? 'user' : 'bot';
            const icon = isUser ? '' : '<i class="fas fa-robot"></i>';
            let content = msg.content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            html += `
            <div class="message ${bubbleClass}">
              <div>
                <div class="bubble">${icon} ${content}</div>
                <div class="meta">${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>`;
        });
        messagesContainer.innerHTML = html;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async function callOpenRouter(userMessage, fileContext = '') {
        if (!apiKey) throw new Error('API key not set. Please enter your OpenRouter API key.');

        const chat = getCurrentChat();
        const systemMessage = `You are a helpful study assistant. Use the provided lecture/book content to answer questions accurately. Be concise and educational.`;

        const contextMessages = chat.messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .slice(0, -1)
            .slice(-8)
            .map(m => ({ role: m.role, content: m.content }));

        let userContent = userMessage;
        if (fileContext) {
            userContent = `[Uploaded file content]\n${fileContext}\n\n[Question]\n${userMessage}`;
        }

        const messages = [
            { role: 'system', content: systemMessage },
            ...contextMessages,
            { role: 'user', content: userContent }
        ];

        const response = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'openai/gpt-4o-mini',
                messages: messages,
                temperature: 0.7,
                max_tokens: 1500
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        if (!data.choices || !data.choices[0]) throw new Error('Unexpected API response');
        return data.choices[0].message.content;
    }

    async function handleSendMessage() {
        const text = messageInput.value.trim();
        if (!text) return;
        if (!apiKey) { alert('Please set your OpenRouter API key first.'); return; }

        sendBtn.disabled = true;
        sendBtn.innerHTML = '<div class="spinner"></div>';

        addMessageToCurrentChat('user', text);
        messageInput.value = '';

        try {
            const aiResponse = await callOpenRouter(text, uploadedFileContent);
            addMessageToCurrentChat('assistant', aiResponse);
        } catch (error) {
            console.error('API error:', error);
            addMessageToCurrentChat('assistant', `⚠️ Error: ${error.message}`);
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
            messageInput.focus();
        }
    }

    // ==================== FILE UPLOAD (PDF / DOCX / TXT) ====================
    async function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const name = file.name;
        const ext = name.substring(name.lastIndexOf('.')).toLowerCase();

        fileBadgeContainer.innerHTML = `<div class="file-name-badge" style="background:#f2f2f5;color:#5e5e66;">⏳ Reading ${name}...</div>`;

        try {
            let text = '';

            if (ext === '.pdf') {
                text = await extractPdfText(file);
            } else if (ext === '.docx') {
                text = await extractDocxText(file);
            } else if (ext === '.doc') {
                throw new Error('Purani .doc files support nahi hain. Please .docx ya .pdf use karo.');
            } else {
                text = await readAsText(file);
            }

            if (!text || text.trim().length === 0) {
                throw new Error('File se koi text nahi mila (scanned PDF hai ya empty file).');
            }

            const MAX_CHARS = 20000;
            if (text.length > MAX_CHARS) {
                text = text.substring(0, MAX_CHARS) + '\n\n[... file truncated ...]';
            }

            uploadedFileContent = text;
            uploadedFileName = name;
            showFileBadge(name);

        } catch (err) {
            console.error('File upload error:', err);
            uploadedFileContent = '';
            uploadedFileName = '';
            fileBadgeContainer.innerHTML = '';
            fileInput.value = '';
            alert('❌ File read nahi ho payi:\n\n' + err.message);
        }
    }

    async function extractPdfText(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        const totalPages = pdf.numPages;

        for (let i = 1; i <= totalPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(' ');
            fullText += `\n\n--- Page ${i} ---\n${pageText}`;
        }
        return fullText;
    }

    async function extractDocxText(file) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
    }

    function readAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('File padhne mein error'));
            reader.readAsText(file);
        });
    }

    function handleSaveApiKey() {
        const key = apiKeyInput.value.trim();
        if (!key) { alert('Please enter a valid API key'); return; }
        apiKey = key;
        saveApiKeyToStorage(key);
        updateApiStatus(true);
        saveApiBtn.innerHTML = '<i class="fas fa-check"></i> Saved';
        setTimeout(() => { saveApiBtn.innerHTML = '<i class="fas fa-save"></i> Save'; }, 1500);
    }

    function handleNewChat() {
        createNewChat();
        uploadedFileContent = ''; uploadedFileName = '';
        fileBadgeContainer.innerHTML = ''; fileInput.value = '';
        messageInput.value = '';
        messageInput.focus();
    }

    function init() {
        loadApiKeyFromStorage();
        if (chats.length === 0) createNewChat('Welcome chat');
        renderHistory(); renderMessages();

        saveApiBtn.addEventListener('click', handleSaveApiKey);
        apiKeyInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSaveApiKey(); });
        sendBtn.addEventListener('click', handleSendMessage);
        messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleSendMessage(); } });
        fileInput.addEventListener('change', handleFileUpload);
        newChatBtn.addEventListener('click', handleNewChat);
    }

    init();
})();