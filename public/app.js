document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const collectionsListEl = document.getElementById('collections-list');
    const collectionCountEl = document.getElementById('collection-count');
    const documentsContainerEl = document.getElementById('documents-container');
    const documentsTitleEl = document.getElementById('documents-title');
    const documentCountEl = document.getElementById('document-count');
    const selectAllBtn = document.getElementById('select-all-btn');
    const createAssistantBtn = document.getElementById('create-assistant-btn');
    const assistantNameEl = document.getElementById('assistant-name');
    const assistantInstructionsEl = document.getElementById('assistant-instructions');
    const selectedDocsEl = document.getElementById('selected-docs');
    const selectedDocsListEl = document.getElementById('selected-docs-list');
    const assistantStatusEl = document.getElementById('assistant-status');
    const chatContainerEl = document.getElementById('chat-container');
    const chatInputEl = document.getElementById('chat-input');
    const sendMessageBtn = document.getElementById('send-message-btn');
    const settingsBtnEl = document.getElementById('settings-btn');
    const settingsModalEl = document.getElementById('settings-modal');
    const closeSettingsEl = document.getElementById('close-settings');
    const saveSettingsEl = document.getElementById('save-settings');
    const zoteroApiKeyEl = document.getElementById('zotero-api-key');
    const zoteroUserIdEl = document.getElementById('zotero-user-id');
    const openaiApiKeyEl = document.getElementById('openai-api-key');
    const refreshBtnEl = document.getElementById('refresh-btn');
    const loadingOverlayEl = document.getElementById('loading-overlay');
    const loadingTextEl = document.getElementById('loading-text');

    // State
    let state = {
        collections: [],
        documents: [],
        selectedCollection: null,
        selectedDocuments: [],
        assistant: null,
        currentThread: null,
        documentFileIds: {},
        settings: {
            zoteroApiKey: localStorage.getItem('zoteroApiKey') || '',
            zoteroUserId: localStorage.getItem('zoteroUserId') || '',
            openaiApiKey: localStorage.getItem('openaiApiKey') || ''
        }
    };

    // Initialize app
    function initApp() {
        // Load settings from localStorage
        zoteroApiKeyEl.value = state.settings.zoteroApiKey;
        zoteroUserIdEl.value = state.settings.zoteroUserId;
        openaiApiKeyEl.value = state.settings.openaiApiKey;

        // Set up event listeners
        setupEventListeners();

        // If we have Zotero credentials, load collections
        if (state.settings.zoteroApiKey && state.settings.zoteroUserId) {
            loadCollections();
        }
    }

    // Set up event listeners
    function setupEventListeners() {
        // Settings modal
        settingsBtnEl.addEventListener('click', () => {
            settingsModalEl.classList.remove('hidden');
        });

        closeSettingsEl.addEventListener('click', () => {
            settingsModalEl.classList.add('hidden');
        });

        saveSettingsEl.addEventListener('click', () => {
            const zoteroApiKey = zoteroApiKeyEl.value.trim();
            const zoteroUserId = zoteroUserIdEl.value.trim();
            const openaiApiKey = openaiApiKeyEl.value.trim();
            
            // Save to state and localStorage
            state.settings.zoteroApiKey = zoteroApiKey;
            state.settings.zoteroUserId = zoteroUserId;
            state.settings.openaiApiKey = openaiApiKey;
            
            localStorage.setItem('zoteroApiKey', zoteroApiKey);
            localStorage.setItem('zoteroUserId', zoteroUserId);
            localStorage.setItem('openaiApiKey', openaiApiKey);
            
            settingsModalEl.classList.add('hidden');
            
            // Load collections with new credentials
            if (zoteroApiKey && zoteroUserId) {
                loadCollections();
            }
        });

        // Refresh button
        refreshBtnEl.addEventListener('click', () => {
            if (state.settings.zoteroApiKey && state.settings.zoteroUserId) {
                loadCollections();
            } else {
                showAlert('Please enter your Zotero credentials in Settings first');
            }
        });

        // Select all documents button
        selectAllBtn.addEventListener('click', () => {
            const isAllSelected = state.selectedDocuments.length === state.documents.length;
            
            if (isAllSelected) {
                // Deselect all
                state.selectedDocuments = [];
                document.querySelectorAll('.document-item').forEach(el => {
                    el.classList.remove('selected');
                    el.querySelector('input[type="checkbox"]').checked = false;
                });
                selectAllBtn.textContent = 'Select All';
            } else {
                // Select all
                state.selectedDocuments = [...state.documents];
                document.querySelectorAll('.document-item').forEach(el => {
                    el.classList.add('selected');
                    el.querySelector('input[type="checkbox"]').checked = true;
                });
                selectAllBtn.textContent = 'Deselect All';
            }
            
            updateSelectedDocsList();
        });

        // Create assistant button
        createAssistantBtn.addEventListener('click', async () => {
            if (state.selectedDocuments.length === 0) {
                showAlert('Please select at least one document');
                return;
            }
            
            const name = assistantNameEl.value.trim();
            const instructions = assistantInstructionsEl.value.trim();
            
            if (!name || !instructions) {
                showAlert('Please provide a name and instructions for your assistant');
                return;
            }
            
            showLoading('Creating assistant...');
            
            try {
                // First, upload all selected PDFs to OpenAI
                const fileIds = [];
                for (const doc of state.selectedDocuments) {
                    if (!state.documentFileIds[doc.id]) {
                        // Fetch the PDF from Zotero
                        const pdfResponse = await fetch(`/api/item/${doc.key}/pdf?userId=${state.settings.zoteroUserId}&apiKey=${state.settings.zoteroApiKey}`);
                        const pdfData = await pdfResponse.json();
                        
                        if (pdfResponse.ok) {
                            // Upload to OpenAI
                            const uploadResponse = await fetch('/api/openai/upload', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    filePath: pdfData.filePath,
                                    itemKey: doc.id
                                })
                            });
                            
                            const uploadData = await uploadResponse.json();
                            
                            if (uploadResponse.ok) {
                                state.documentFileIds[doc.id] = uploadData.fileId;
                                fileIds.push(uploadData.fileId);
                            } else {
                                throw new Error(`Failed to upload PDF: ${uploadData.error}`);
                            }
                        } else {
                            throw new Error(`Failed to fetch PDF: ${pdfData.error}`);
                        }
                    } else {
                        // Already uploaded, just add the fileId
                        fileIds.push(state.documentFileIds[doc.id]);
                    }
                }
                
                // Now create or update the assistant
                const assistantResponse = await fetch('/api/openai/assistant', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name,
                        instructions,
                        fileIds
                    })
                });
                
                const assistantData = await assistantResponse.json();
                
                if (assistantResponse.ok) {
                    state.assistant = assistantData;
                    assistantStatusEl.textContent = 'Ready';
                    assistantStatusEl.classList.remove('bg-gray-200', 'text-gray-600');
                    assistantStatusEl.classList.add('bg-green-100', 'text-green-800');
                    
                    // Enable chat
                    chatInputEl.disabled = false;
                    sendMessageBtn.disabled = false;
                    
                    // Reset chat container
                    chatContainerEl.innerHTML = `
                        <div class="assistant-message chat-message">
                            Hello! I'm your Zotero research assistant. I have access to ${state.selectedDocuments.length} 
                            document(s) from your library. How can I help you with your research today?
                        </div>
                    `;
                    
                    showAlert('Assistant created successfully!', 'success');
                } else {
                    throw new Error(`Failed to create assistant: ${assistantData.error}`);
                }
            } catch (error) {
                console.error('Error creating assistant:', error);
                showAlert(`Error: ${error.message}`);
            } finally {
                hideLoading();
            }
        });

        // Send message button
        sendMessageBtn.addEventListener('click', () => {
            sendMessage();
        });
        
        // Send message on Enter key
        chatInputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }

    // Load collections from Zotero
    async function loadCollections() {
        if (!state.settings.zoteroApiKey || !state.settings.zoteroUserId) {
            showAlert('Please enter your Zotero credentials in Settings first');
            return;
        }
        
        showLoading('Loading collections...');
        
        try {
            const response = await fetch(`/api/collections?userId=${state.settings.zoteroUserId}&apiKey=${state.settings.zoteroApiKey}`);
            const data = await response.json();
            
            if (response.ok) {
                state.collections = data;
                renderCollections();
            } else {
                throw new Error(`Failed to load collections: ${data.error}`);
            }
        } catch (error) {
            console.error('Error loading collections:', error);
            showAlert(`Error: ${error.message}`);
            
            // Show empty collections list
            collectionsListEl.innerHTML = `
                <li class="flex items-center justify-center py-8 text-red-500">
                    Failed to load collections. Check your credentials.
                </li>
            `;
        } finally {
            hideLoading();
        }
    }

    // Render collections
    function renderCollections() {
        collectionsListEl.innerHTML = '';
        collectionCountEl.textContent = `${state.collections.length} collections`;
        
        if (state.collections.length === 0) {
            collectionsListEl.innerHTML = `
                <li class="flex items-center justify-center py-8 text-gray-400">
                    No collections found
                </li>
            `;
            return;
        }
        
        state.collections.forEach(collection => {
            const li = document.createElement('li');
            li.className = 'collection-item p-2 rounded flex justify-between items-center';
            li.dataset.id = collection.key;
            
            li.innerHTML = `
                <div class="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                    </svg>
                    <span>${collection.data.name}</span>
                </div>
            `;
            
            collectionsListEl.appendChild(li);
            
            li.addEventListener('click', () => {
                document.querySelectorAll('.collection-item').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
                loadDocuments(collection.key);
                state.selectedCollection = collection.key;
            });
        });
    }

    // Load documents for a collection
    async function loadDocuments(collectionId) {
        showLoading('Loading documents...');
        
        try {
            const response = await fetch(`/api/collection/${collectionId}/items?userId=${state.settings.zoteroUserId}&apiKey=${state.settings.zoteroApiKey}`);
            const data = await response.json();
            
            if (response.ok) {
                state.documents = data;
                state.selectedDocuments = [];
                renderDocuments();
            } else {
                throw new Error(`Failed to load documents: ${data.error}`);
            }
        } catch (error) {
            console.error('Error loading documents:', error);
            showAlert(`Error: ${error.message}`);
            
            // Show empty documents container
            documentsContainerEl.innerHTML = `
                <div class="flex items-center justify-center py-12 text-red-500">
                    Failed to load documents
                </div>
            `;
        } finally {
            hideLoading();
        }
    }

    // Render documents
    function renderDocuments() {
        documentsContainerEl.innerHTML = '';
        
        const collection = state.collections.find(c => c.key === state.selectedCollection);
        if (collection) {
            documentsTitleEl.textContent = `${collection.data.name} Documents`;
        }
        
        documentCountEl.textContent = `${state.documents.length} documents`;
        
        if (state.documents.length === 0) {
            documentsContainerEl.innerHTML = `
                <div class="flex items-center justify-center py-12 text-gray-400">
                    No documents found in this collection
                </div>
            `;
            selectAllBtn.classList.add('hidden');
            return;
        }
        
        selectAllBtn.classList.remove('hidden');
        
        state.documents.forEach(doc => {
            const docEl = document.createElement('div');
            docEl.className = 'document-item border rounded p-3 mb-3 flex items-start';
            docEl.dataset.id = doc.key;
            
            // Determine document title and authors
            let title = doc.data.title || 'Untitled Document';
            let authors = '';
            
            if (doc.data.creators && doc.data.creators.length > 0) {
                authors = doc.data.creators.map(creator => {
                    return creator.firstName && creator.lastName 
                        ? `${creator.lastName}, ${creator.firstName}` 
                        : creator.name || '';
                }).join('; ');
            }
            
            docEl.innerHTML = `
                <input type="checkbox" class="mt-1 mr-3 h-5 w-5 text-blue-600 rounded" />
                <div class="flex-1">
                    <h3 class="font-medium">${title}</h3>
                    ${authors ? `<p class="text-sm text-gray-600">${authors}</p>` : ''}
                    ${doc.data.date ? `<p class="text-xs text-gray-500">${doc.data.date}</p>` : ''}
                </div>
            `;
            
            documentsContainerEl.appendChild(docEl);
            
            // Checkbox events
            const checkbox = docEl.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    docEl.classList.add('selected');
                    if (!state.selectedDocuments.find(d => d.id === doc.key)) {
                        state.selectedDocuments.push({
                            id: doc.key,
                            key: doc.key,
                            title: title
                        });
                    }
                } else {
                    docEl.classList.remove('selected');
                    state.selectedDocuments = state.selectedDocuments.filter(d => d.id !== doc.key);
                }
                
                updateSelectedDocsList();
                
                // Update select all button text
                if (state.selectedDocuments.length === state.documents.length) {
                    selectAllBtn.textContent = 'Deselect All';
                } else {
                    selectAllBtn.textContent = 'Select All';
                }
            });
            
            // Click on document (toggle checkbox)
            docEl.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });
        });
        
        // Enable create assistant button if documents are available
        createAssistantBtn.disabled = false;
        
        // Reset selected documents list
        updateSelectedDocsList();
    }

    // Update selected documents list
    function updateSelectedDocsList() {
        if (state.selectedDocuments.length > 0) {
            selectedDocsEl.classList.remove('hidden');
            selectedDocsListEl.innerHTML = '';
            
            state.selectedDocuments.forEach(doc => {
                const li = document.createElement('li');
                li.textContent = doc.title;
                selectedDocsListEl.appendChild(li);
            });
            
            // Enable create assistant button
            createAssistantBtn.disabled = false;
        } else {
            selectedDocsEl.classList.add('hidden');
            
            // Disable create assistant button
            createAssistantBtn.disabled = true;
        }
    }

    // Send message to assistant
    async function sendMessage() {
        const message = chatInputEl.value.trim();
        
        if (!message || !state.assistant) return;
        
        // Add user message to chat
        appendMessage(message, 'user');
        
        // Clear input
        chatInputEl.value = '';
        
        // Disable input and button while processing
        chatInputEl.disabled = true;
        sendMessageBtn.disabled = true;
        
        try {
            // Add typing indicator
            const typingIndicator = document.createElement('div');
            typingIndicator.className = 'assistant-message chat-message';
            typingIndicator.innerHTML = `<div class="spinner-small"></div>`;
            chatContainerEl.appendChild(typingIndicator);
            
            // Scroll to bottom
            chatContainerEl.scrollTop = chatContainerEl.scrollHeight;
            
            // Send to API
            let response;
            if (state.currentThread) {
                // Continue existing thread
                response = await fetch('/api/openai/continue', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        prompt: message,
                        threadId: state.currentThread,
                        assistantId: state.assistant.id
                    })
                });
            } else {
                // Start new thread
                response = await fetch('/api/openai/query', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        prompt: message,
                        assistantId: state.assistant.id
                    })
                });
            }
            
            const data = await response.json();
            
            // Remove typing indicator
            chatContainerEl.removeChild(typingIndicator);
            
            if (response.ok) {
                // Save thread ID for continued conversation
                state.currentThread = data.threadId;
                
                // Add assistant response to chat
                appendMessage(data.message, 'assistant');
            } else {
                throw new Error(`Failed to get response: ${data.error}`);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            
            // Remove typing indicator if it exists
            const typingIndicator = document.querySelector('.spinner-small')?.parentElement;
            if (typingIndicator) {
                chatContainerEl.removeChild(typingIndicator);
            }
            
            // Add error message
            appendMessage('Sorry, I encountered an error processing your request. Please try again.', 'assistant', true);
        } finally {
            // Re-enable input and button
            chatInputEl.disabled = false;
            sendMessageBtn.disabled = false;
            chatInputEl.focus();
        }
    }

    // Append message to chat
    function appendMessage(text, role, isError = false) {
        const messageEl = document.createElement('div');
        messageEl.className = `${role}-message chat-message${isError ? ' error' : ''}`;
        
        // Convert newlines to <br> and handle markdown-like formatting
        const formattedText = text
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
        
        messageEl.innerHTML = formattedText;
        chatContainerEl.appendChild(messageEl);
        
        // Scroll to bottom
        chatContainerEl.scrollTop = chatContainerEl.scrollHeight;
    }

    // Show loading overlay
    function showLoading(text = 'Loading...') {
        loadingTextEl.textContent = text;
        loadingOverlayEl.classList.remove('hidden');
    }

    // Hide loading overlay
    function hideLoading() {
        loadingOverlayEl.classList.add('hidden');
    }

    // Show alert message
    function showAlert(message, type = 'error') {
        const alertEl = document.createElement('div');
        alertEl.className = `fixed top-4 right-4 p-4 rounded shadow-lg z-50 ${
            type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
        }`;
        alertEl.textContent = message;
        
        document.body.appendChild(alertEl);
        
        // Remove after 3 seconds
        setTimeout(() => {
            alertEl.classList.add('opacity-0', 'transition-opacity', 'duration-500');
            setTimeout(() => {
                document.body.removeChild(alertEl);
            }, 500);
        }, 3000);
    }

    // Initialize the app
    initApp();