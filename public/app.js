// public/app.js
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
    const refreshBtnEl = document.getElementById('refresh-btn');
    const loadingOverlayEl = document.getElementById('loading-overlay');
    const loadingTextEl = document.getElementById('loading-text');
    
    // Hide the settings button since we're using env vars now
    const settingsBtnEl = document.getElementById('settings-btn');
    if (settingsBtnEl) {
        settingsBtnEl.style.display = 'none';
    }

    // State
    let state = {
        collections: [],
        documents: [],
        selectedCollection: null,
        selectedDocuments: [],
        assistant: null,
        currentThread: null,
        documentFileIds: {}
    };

    // Initialize app
    function initApp() {
        // Set up event listeners
        setupEventListeners();
        
        // Load collections automatically on page load
        loadCollections();
    }

    // Set up event listeners
    function setupEventListeners() {
        // Refresh button
        refreshBtnEl.addEventListener('click', () => {
            loadCollections();
        });

        // Select all documents button
        selectAllBtn.addEventListener('click', () => {
            // Only consider documents with PDFs
            const documentsWithPDF = state.documents.filter(doc => doc.hasPDF);
            const isAllSelected = state.selectedDocuments.length === documentsWithPDF.length;
            
            if (isAllSelected) {
                // Deselect all
                state.selectedDocuments = [];
                document.querySelectorAll('.document-item').forEach(el => {
                    el.classList.remove('selected');
                    const checkbox = el.querySelector('input[type="checkbox"]');
                    if (!checkbox.disabled) {
                        checkbox.checked = false;
                    }
                });
                selectAllBtn.textContent = 'Select All';
            } else {
                // Select all documents with PDFs
                state.selectedDocuments = documentsWithPDF.map(doc => ({
                    id: doc.key,
                    key: doc.key,
                    title: doc.data.title || 'Untitled Document',
                    pdfAttachments: doc.pdfAttachments
                }));
                
                // Update UI
                document.querySelectorAll('.document-item').forEach(el => {
                    const doc = state.documents.find(d => d.key === el.dataset.id);
                    if (doc && doc.hasPDF) {
                        el.classList.add('selected');
                        el.querySelector('input[type="checkbox"]').checked = true;
                    }
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
            
            // Show loading with progress tracking enabled
            showLoading('Creating your research assistant...', true);
            
            try {
                // Step 1: Download PDFs from Zotero
                const totalDocs = state.selectedDocuments.length;
                updateDownloadProgress(0, totalDocs);
                
                // First, download all selected PDFs from Zotero
                const fileIds = [];
                const failedDocuments = [];
                let successfulDownloads = 0;
                
                for (let i = 0; i < state.selectedDocuments.length; i++) {
                    const doc = state.selectedDocuments[i];
                    
                    try {
                        // Skip if already uploaded
                        if (state.documentFileIds[doc.id]) {
                            fileIds.push(state.documentFileIds[doc.id]);
                            successfulDownloads++;
                            updateDownloadProgress(successfulDownloads, totalDocs);
                            continue;
                        }
                        
                        // Update progress text to show current document
                        loadingTextEl.textContent = `Downloading PDF: ${doc.title}`;
                        
                        // Determine if we have specific attachment info
                        let pdfUrl = `/api/item/${doc.key}/pdf`;
                        
                        // If we know about specific attachments, use the first one
                        if (doc.pdfAttachments && doc.pdfAttachments.length > 0) {
                            pdfUrl = `/api/item/${doc.key}/pdf?attachmentKey=${doc.pdfAttachments[0].key}`;
                        }
                        
                        // Fetch the PDF from Zotero
                        const pdfResponse = await fetch(pdfUrl);
                        
                        if (!pdfResponse.ok) {
                            const pdfError = await pdfResponse.json();
                            failedDocuments.push({
                                title: doc.title,
                                error: pdfError.error || 'Unknown error'
                            });
                            continue;
                        }
                        
                        const pdfData = await pdfResponse.json();
                        
                        // Update download progress
                        successfulDownloads++;
                        updateDownloadProgress(successfulDownloads, totalDocs);
                        
                        // Track the successfully downloaded PDF for upload
                        doc.localFilePath = pdfData.filePath;
                        
                    } catch (error) {
                        console.error(`Error downloading document ${doc.title}:`, error);
                        failedDocuments.push({
                            title: doc.title,
                            error: error.message || 'Unknown error during download'
                        });
                    }
                }
                
                // Update download progress with final status
                if (successfulDownloads === totalDocs) {
                    updateDownloadProgress(successfulDownloads, totalDocs, 'success');
                } else if (successfulDownloads > 0) {
                    updateDownloadProgress(successfulDownloads, totalDocs, 'warning');
                } else {
                    updateDownloadProgress(0, totalDocs, 'error');
                }
                
                // Step 2: Upload PDFs to OpenAI
                const docsToUpload = state.selectedDocuments.filter(doc => doc.localFilePath || state.documentFileIds[doc.id]);
                let successfulUploads = 0;
                
                // Initialize upload progress
                updateUploadProgress(0, docsToUpload.length);
                
                for (let i = 0; i < docsToUpload.length; i++) {
                    const doc = docsToUpload[i];
                    
                    try {
                        // Skip if already uploaded to OpenAI
                        if (state.documentFileIds[doc.id]) {
                            fileIds.push(state.documentFileIds[doc.id]);
                            successfulUploads++;
                            updateUploadProgress(successfulUploads, docsToUpload.length);
                            continue;
                        }
                        
                        // Update progress text
                        loadingTextEl.textContent = `Uploading to OpenAI: ${doc.title}`;
                        
                        // Upload to OpenAI
                        const uploadResponse = await fetch('/api/openai/upload', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                filePath: doc.localFilePath,
                                itemKey: doc.id
                            })
                        });
                        
                        if (!uploadResponse.ok) {
                            const uploadError = await uploadResponse.json();
                            failedDocuments.push({
                                title: doc.title,
                                error: uploadError.error || 'Failed to upload to OpenAI'
                            });
                            continue;
                        }
                        
                        const uploadData = await uploadResponse.json();
                        state.documentFileIds[doc.id] = uploadData.fileId;
                        fileIds.push(uploadData.fileId);
                        
                        // Update upload progress
                        successfulUploads++;
                        updateUploadProgress(successfulUploads, docsToUpload.length);
                        
                    } catch (error) {
                        console.error(`Error uploading document ${doc.title}:`, error);
                        failedDocuments.push({
                            title: doc.title,
                            error: error.message || 'Unknown error during upload'
                        });
                    }
                }
                
                // Update upload progress with final status
                if (successfulUploads === docsToUpload.length) {
                    updateUploadProgress(successfulUploads, docsToUpload.length, 'success');
                } else if (successfulUploads > 0) {
                    updateUploadProgress(successfulUploads, docsToUpload.length, 'warning');
                } else {
                    updateUploadProgress(0, docsToUpload.length, 'error');
                }
                
                // Show warnings about failed documents
                if (failedDocuments.length > 0) {
                    const failureMessage = `Unable to process ${failedDocuments.length} document(s). The assistant will be created with the remaining ${fileIds.length} document(s).`;
                    showAlert(failureMessage, 'warning');
                    console.warn('Failed documents:', failedDocuments);
                }
                
                // If all documents failed, stop here
                if (fileIds.length === 0) {
                    throw new Error('No documents could be processed. Please check your library and try again.');
                }
                
                // Start assistant progress
                updateAssistantProgress(10, 'Creating assistant...');
                
                // Update progress for assistant creation
                loadingTextEl.textContent = 'Creating assistant...';
                updateAssistantProgress(30, 'Initializing assistant...');
                
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
                
                updateAssistantProgress(60, 'Processing documents...');
                
                const assistantData = await assistantResponse.json();
                
                if (assistantResponse.ok) {
                    // Update progress to complete
                    updateAssistantProgress(100, 'Assistant ready!', 'success');
                    
                    // Short delay to show completion
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    state.assistant = assistantData;
                    assistantStatusEl.textContent = 'Ready';
                    assistantStatusEl.classList.remove('bg-gray-200', 'text-gray-600');
                    assistantStatusEl.classList.add('bg-green-100', 'text-green-800');
                    
                    // Enable chat
                    chatInputEl.disabled = false;
                    sendMessageBtn.disabled = false;
                    
                    // Reset chat container with initial welcome message
                    chatContainerEl.innerHTML = `
                        <div class="assistant-message chat-message">
                            <p>Hello! I'm your Zotero research assistant. I have access to ${state.selectedDocuments.length} 
                            document(s) from your library.</p>
                            <p class="mt-2">I'm now analyzing the content to help with your research...</p>
                        </div>
                    `;
                    
                    showAlert('Assistant created successfully!', 'success');
                    
                    // Send an initial prompt to ask the assistant to describe its knowledge
                    setTimeout(() => {
                        const initialPrompt = `I've shared ${state.selectedDocuments.length} academic papers with you. Please:
1. Tell me the titles and authors of each paper you can access
2. For each paper, give me a brief (2-3 sentence) summary of its main topic and key findings
3. Let me know if any files appear to be incomplete or if you're having trouble accessing them
4. Suggest 2-3 interesting research questions I could ask you based on these papers

This will help me understand what knowledge you have available.`;
                        
                        // Add a typing indicator 
                        const typingIndicator = document.createElement('div');
                        typingIndicator.className = 'assistant-message chat-message';
                        typingIndicator.innerHTML = `<div class="spinner-small"></div><span class="ml-2">Analyzing documents...</span>`;
                        chatContainerEl.appendChild(typingIndicator);
                        
                        // We don't show the user message since this is automatic
                        sendInitialQuery(initialPrompt, typingIndicator);
                    }, 1500);
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
        showLoading('Loading collections...');
        
        try {
            const response = await fetch('/api/collections');
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
                    Failed to load collections. Check server logs for details.
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
            li.className = 'collection-item p-2 rounded hover:bg-blue-100 cursor-pointer flex justify-between items-center';
            li.dataset.id = collection.key;
            // Add visual indication that this item is clickable
            li.style.cursor = 'pointer';
            
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
            const response = await fetch(`/api/collection/${collectionId}/items`);
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
        
        // Count documents with PDFs
        const docsWithPdfs = state.documents.filter(doc => doc.hasPDF).length;
        documentCountEl.textContent = `${state.documents.length} documents (${docsWithPdfs} with PDFs)`;
        
        state.documents.forEach(doc => {
            const docEl = document.createElement('div');
            docEl.className = `document-item border rounded p-3 mb-3 flex items-start ${!doc.hasPDF ? 'opacity-60' : ''}`;
            docEl.dataset.id = doc.key;
            
            // Determine document title and authors
            let title = doc.data.title || 'Untitled Document';
            let authors = '';
            let journal = '';
            let year = doc.data.date ? doc.data.date.substring(0, 4) : '';
            
            if (doc.data.creators && doc.data.creators.length > 0) {
                authors = doc.data.creators.map(creator => {
                    return creator.firstName && creator.lastName 
                        ? `${creator.lastName}, ${creator.firstName}` 
                        : creator.name || '';
                }).join('; ');
            }
            
            // Get publication details based on item type
            if (doc.data.itemType === 'journalArticle') {
                journal = doc.data.publicationTitle ? `${doc.data.publicationTitle}` : '';
                if (doc.data.volume) journal += doc.data.volume ? `, ${doc.data.volume}` : '';
                if (doc.data.issue) journal += doc.data.issue ? `(${doc.data.issue})` : '';
                if (doc.data.pages) journal += doc.data.pages ? `, pp. ${doc.data.pages}` : '';
            } else if (doc.data.itemType === 'conferencePaper') {
                journal = doc.data.conferenceName || '';
            } else if (doc.data.itemType === 'book') {
                journal = doc.data.publisher || '';
            }
            
            // PDF availability badge
            const pdfBadge = doc.hasPDF 
                ? '<span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full ml-1 whitespace-nowrap">PDF Available</span>'
                : '<span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full ml-1 whitespace-nowrap">No PDF</span>';
            
            docEl.innerHTML = `
                <input type="checkbox" class="mt-1 mr-3 h-5 w-5 text-blue-600 rounded" ${!doc.hasPDF ? 'disabled' : ''} />
                <div class="flex-1">
                    <div class="flex items-start justify-between">
                        <h3 class="font-medium">${title}</h3>
                        ${pdfBadge}
                    </div>
                    ${authors ? `<p class="text-sm text-gray-600">${authors}</p>` : ''}
                    ${journal ? `<p class="text-xs text-gray-700 mt-1">${journal}</p>` : ''}
                    ${year ? `<p class="text-xs text-gray-500 mt-1">${year}</p>` : ''}
                    ${doc.data.DOI ? `<p class="text-xs text-blue-500 mt-1">DOI: ${doc.data.DOI}</p>` : ''}
                </div>
            `;
            
            documentsContainerEl.appendChild(docEl);
            
            // Only enable checkbox for items with PDFs
            const checkbox = docEl.querySelector('input[type="checkbox"]');
            
            if (doc.hasPDF) {
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) {
                        docEl.classList.add('selected');
                        if (!state.selectedDocuments.find(d => d.id === doc.key)) {
                            state.selectedDocuments.push({
                                id: doc.key,
                                key: doc.key,
                                title: title,
                                pdfAttachments: doc.pdfAttachments
                            });
                        }
                    } else {
                        docEl.classList.remove('selected');
                        state.selectedDocuments = state.selectedDocuments.filter(d => d.id !== doc.key);
                    }
                    
                    updateSelectedDocsList();
                    
                    // Update select all button text
                    const availableDocs = state.documents.filter(d => d.hasPDF).length;
                    if (state.selectedDocuments.length === availableDocs) {
                        selectAllBtn.textContent = 'Deselect All';
                    } else {
                        selectAllBtn.textContent = 'Select All';
                    }
                });
                
                // Click on document (toggle checkbox)
                docEl.addEventListener('click', (e) => {
                    if (e.target !== checkbox && e.target.tagName !== 'A') {
                        checkbox.checked = !checkbox.checked;
                        checkbox.dispatchEvent(new Event('change'));
                    }
                });
            }
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

    // Send initial query to analyze documents
    async function sendInitialQuery(prompt, typingIndicator) {
        if (!state.assistant) return;
        
        try {
            // Scroll to bottom
            chatContainerEl.scrollTop = chatContainerEl.scrollHeight;
            
            // Send to API
            const response = await fetch('/api/openai/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: prompt,
                    assistantId: state.assistant.id
                })
            });
            
            const data = await response.json();
            
            // Remove typing indicator
            if (typingIndicator) {
                chatContainerEl.removeChild(typingIndicator);
            }
            
            if (response.ok) {
                // Save thread ID for continued conversation
                state.currentThread = data.threadId;
                
                // Add assistant response to chat
                appendMessage(data.message, 'assistant');
            } else {
                throw new Error(`Failed to get response: ${data.error}`);
            }
        } catch (error) {
            console.error('Error sending initial query:', error);
            
            // Remove typing indicator if it exists
            if (typingIndicator) {
                chatContainerEl.removeChild(typingIndicator);
            }
            
            // Add error message
            appendMessage('Sorry, I was unable to analyze the documents. Please ask me specific questions about them instead.', 'assistant', true);
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

    // Progress tracking elements
    const progressContainerEl = document.getElementById('progress-container');
    const downloadProgressContainerEl = document.getElementById('download-progress-container');
    const downloadProgressBarEl = document.getElementById('download-progress-bar');
    const downloadProgressTextEl = document.getElementById('download-progress-text');
    const uploadProgressContainerEl = document.getElementById('upload-progress-container');
    const uploadProgressBarEl = document.getElementById('upload-progress-bar');
    const uploadProgressTextEl = document.getElementById('upload-progress-text');
    const assistantProgressContainerEl = document.getElementById('assistant-progress-container');
    const assistantProgressBarEl = document.getElementById('assistant-progress-bar');
    const assistantProgressTextEl = document.getElementById('assistant-progress-text');

    // Show loading overlay
    function showLoading(text = 'Loading...', showProgress = false) {
        loadingTextEl.textContent = text;
        loadingOverlayEl.classList.remove('hidden');
        
        // Show/hide progress bar container
        if (showProgress) {
            progressContainerEl.classList.remove('hidden');
        } else {
            progressContainerEl.classList.add('hidden');
        }
        
        // Reset and hide all progress bars
        resetProgressBars();
    }

    // Hide loading overlay
    function hideLoading() {
        loadingOverlayEl.classList.add('hidden');
        progressContainerEl.classList.add('hidden');
        resetProgressBars();
    }
    
    // Reset all progress bars
    function resetProgressBars() {
        // Reset download progress
        downloadProgressContainerEl.classList.add('hidden');
        downloadProgressBarEl.style.width = '0%';
        downloadProgressTextEl.textContent = '0/0';
        
        // Reset upload progress
        uploadProgressContainerEl.classList.add('hidden');
        uploadProgressBarEl.style.width = '0%';
        uploadProgressTextEl.textContent = '0/0';
        
        // Reset assistant progress
        assistantProgressContainerEl.classList.add('hidden');
        assistantProgressBarEl.style.width = '0%';
        assistantProgressTextEl.textContent = 'Initializing...';
        
        // Remove any status classes
        downloadProgressBarEl.className = 'progress-bar';
        uploadProgressBarEl.className = 'progress-bar';
        assistantProgressBarEl.className = 'progress-bar';
    }
    
    // Update download progress
    function updateDownloadProgress(current, total, status = '') {
        downloadProgressContainerEl.classList.remove('hidden');
        const percentage = Math.round((current / total) * 100);
        downloadProgressBarEl.style.width = `${percentage}%`;
        downloadProgressTextEl.textContent = `${current}/${total}`;
        
        // Update status if provided
        if (status) {
            if (status === 'success') {
                downloadProgressBarEl.classList.add('success');
            } else if (status === 'warning') {
                downloadProgressBarEl.classList.add('warning');
            } else if (status === 'error') {
                downloadProgressBarEl.classList.add('error');
            }
        }
    }
    
    // Update upload progress
    function updateUploadProgress(current, total, status = '') {
        uploadProgressContainerEl.classList.remove('hidden');
        const percentage = Math.round((current / total) * 100);
        uploadProgressBarEl.style.width = `${percentage}%`;
        uploadProgressTextEl.textContent = `${current}/${total}`;
        
        // Update status if provided
        if (status) {
            if (status === 'success') {
                uploadProgressBarEl.classList.add('success');
            } else if (status === 'warning') {
                uploadProgressBarEl.classList.add('warning');
            } else if (status === 'error') {
                uploadProgressBarEl.classList.add('error');
            }
        }
    }
    
    // Update assistant creation progress
    function updateAssistantProgress(percentage, text, status = '') {
        assistantProgressContainerEl.classList.remove('hidden');
        assistantProgressBarEl.style.width = `${percentage}%`;
        assistantProgressTextEl.textContent = text;
        
        // Update status if provided
        if (status) {
            if (status === 'success') {
                assistantProgressBarEl.classList.add('success');
            } else if (status === 'warning') {
                assistantProgressBarEl.classList.add('warning');
            } else if (status === 'error') {
                assistantProgressBarEl.classList.add('error');
            }
        }
    }

    // Show alert message
    function showAlert(message, type = 'error') {
        const alertEl = document.createElement('div');
        
        // Choose background color based on alert type
        let bgColorClass = 'bg-red-500 text-white'; // default for error
        
        if (type === 'success') {
            bgColorClass = 'bg-green-500 text-white';
        } else if (type === 'warning') {
            bgColorClass = 'bg-yellow-500 text-white';
        }
        
        alertEl.className = `fixed top-4 right-4 p-4 rounded shadow-lg z-50 ${bgColorClass}`;
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
});