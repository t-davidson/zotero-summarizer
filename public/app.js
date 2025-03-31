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
    const deleteAssistantBtn = document.getElementById('delete-assistant-btn');
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
    
    // Existing assistants elements
    const existingAssistantsEl = document.getElementById('existing-assistants');
    const refreshAssistantsBtnEl = document.getElementById('refresh-assistants-btn');
    const loadAssistantBtnEl = document.getElementById('load-assistant-btn');
    const assistantDetailsEl = document.getElementById('assistant-details');
    const assistantDetailNameEl = document.getElementById('assistant-detail-name');
    const assistantDetailCreatedEl = document.getElementById('assistant-detail-created');
    const assistantDetailModelEl = document.getElementById('assistant-detail-model');
    const assistantDetailFilesEl = document.getElementById('assistant-detail-files');
    const assistantDetailInstructionsEl = document.getElementById('assistant-detail-instructions');
    
    // Load panel elements
    const toggleLoadPanelBtn = document.getElementById('toggle-load-panel-btn');
    const loadPanelToggleIcon = document.getElementById('load-panel-toggle-icon');
    const loadAssistantContent = document.getElementById('load-assistant-content');
    
    // Dark mode toggle
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const lightIcon = document.getElementById('light-icon');
    const darkIcon = document.getElementById('dark-icon');
    
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
        documentFileIds: {},
        // Existing assistants
        availableAssistants: [],
        selectedAssistantId: null,
        // UI state
        configPanelMinimized: false,
        searchQuery: '',
        darkMode: false,
        // Flag to indicate if we're trying to recover a thread
        isRecoveringThread: false
    };
    
    // Initialize dark mode from local storage
    function initDarkMode() {
        // Check if user has a saved preference
        const savedDarkMode = localStorage.getItem('darkMode');
        
        // Apply dark mode if saved as true
        if (savedDarkMode === 'true') {
            document.documentElement.classList.add('dark');
            document.body.classList.add('dark');
            lightIcon.classList.remove('hidden');
            darkIcon.classList.add('hidden');
            state.darkMode = true;
        } else {
            // Default to light mode
            document.documentElement.classList.remove('dark');
            document.body.classList.remove('dark');
            lightIcon.classList.add('hidden');
            darkIcon.classList.remove('hidden');
            state.darkMode = false;
        }
    }

    // Thread management with localStorage
    
    // Save thread info to localStorage
    function saveThreadToStorage(assistantId, threadId) {
        if (!assistantId || !threadId) return;
        
        const threadData = {
            assistantId: assistantId,
            threadId: threadId,
            timestamp: Date.now()
        };
        
        try {
            localStorage.setItem(`thread_${assistantId}`, JSON.stringify(threadData));
            console.log(`Saved thread ${threadId} to localStorage for assistant ${assistantId}`);
        } catch (err) {
            console.error('Error saving thread to localStorage:', err);
        }
    }
    
    // Load thread info from localStorage
    function loadThreadFromStorage(assistantId) {
        if (!assistantId) return null;
        
        try {
            const threadDataStr = localStorage.getItem(`thread_${assistantId}`);
            if (!threadDataStr) return null;
            
            const threadData = JSON.parse(threadDataStr);
            
            // Check if thread data is not too old (7 days max)
            const MAX_THREAD_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
            if (Date.now() - threadData.timestamp > MAX_THREAD_AGE) {
                console.log(`Thread for assistant ${assistantId} is too old, removing from storage`);
                localStorage.removeItem(`thread_${assistantId}`);
                return null;
            }
            
            console.log(`Loaded thread ${threadData.threadId} from localStorage for assistant ${assistantId}`);
            return threadData;
        } catch (err) {
            console.error('Error loading thread from localStorage:', err);
            return null;
        }
    }
    
    // Validate a thread with the server
    async function validateThread(threadId, assistantId) {
        if (!threadId) return false;
        
        try {
            const response = await fetch('/api/openai/validate-thread', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    threadId: threadId,
                    assistantId: assistantId
                })
            });
            
            const data = await response.json();
            
            if (data.valid) {
                console.log(`Thread ${threadId} validated successfully`);
                return true;
            } else {
                console.warn(`Thread ${threadId} is invalid: ${data.error || 'Unknown error'}`);
                return false;
            }
        } catch (err) {
            console.error('Error validating thread:', err);
            return false;
        }
    }
    
    // Load existing assistants from OpenAI
    async function loadExistingAssistants() {
        try {
            // Update dropdown to show loading state
            existingAssistantsEl.innerHTML = '<option value="">Loading assistants...</option>';
            existingAssistantsEl.disabled = true;
            loadAssistantBtnEl.disabled = true;
            
            // Hide assistant details if showing
            assistantDetailsEl.classList.add('hidden');
            
            // Fetch assistants from API
            const response = await fetch('/api/openai/assistants');
            
            if (response.ok) {
                const assistants = await response.json();
                state.availableAssistants = assistants;
                
                // Populate the dropdown
                if (assistants.length === 0) {
                    existingAssistantsEl.innerHTML = '<option value="">No assistants found</option>';
                } else {
                    existingAssistantsEl.innerHTML = '<option value="">Select an assistant...</option>';
                    
                    assistants.forEach(assistant => {
                        const option = document.createElement('option');
                        option.value = assistant.id;
                        
                        // Format the creation date
                        const createdDate = new Date(assistant.created_at * 1000);
                        const formattedDate = createdDate.toLocaleDateString();
                        
                        option.textContent = `${assistant.name} (${formattedDate})`;
                        existingAssistantsEl.appendChild(option);
                    });
                }
                
                // Enable the dropdown
                existingAssistantsEl.disabled = false;
                updateLoadButtonState();
            } else {
                const errorData = await response.json();
                console.error('Error fetching assistants:', errorData.error);
                existingAssistantsEl.innerHTML = '<option value="">Error loading assistants</option>';
                showAlert(`Error loading assistants: ${errorData.error}`);
            }
        } catch (error) {
            console.error('Error loading assistants:', error);
            existingAssistantsEl.innerHTML = '<option value="">Error loading assistants</option>';
            showAlert(`Error: ${error.message || 'Failed to load assistants'}`);
        }
    }
    
    // Update the load button state based on selection
    function updateLoadButtonState() {
        loadAssistantBtnEl.disabled = !existingAssistantsEl.value;
    }
    
    // Show selected assistant details
    function showAssistantDetails(assistantId) {
        // Find the selected assistant
        const assistant = state.availableAssistants.find(a => a.id === assistantId);
        
        if (!assistant) {
            assistantDetailsEl.classList.add('hidden');
            return;
        }
        
        // Format the creation date
        const createdDate = new Date(assistant.created_at * 1000);
        const formattedDate = createdDate.toLocaleString();
        
        // Update the details
        assistantDetailNameEl.textContent = assistant.name;
        assistantDetailCreatedEl.textContent = formattedDate;
        assistantDetailModelEl.textContent = assistant.model;
        assistantDetailFilesEl.textContent = assistant.file_count || 'Unknown';
        assistantDetailInstructionsEl.textContent = assistant.instructions || 'No instructions';
        
        // Show the details panel
        assistantDetailsEl.classList.remove('hidden');
    }
    
    // Load a selected assistant
    async function loadSelectedAssistant() {
        const assistantId = existingAssistantsEl.value;
        
        if (!assistantId) {
            showAlert('Please select an assistant to load');
            return;
        }
        
        // Show loading overlay
        showLoading('Loading assistant...');
        
        try {
            // Fetch the assistant details from API
            const response = await fetch(`/api/openai/assistant/${assistantId}`);
            
            if (response.ok) {
                const assistant = await response.json();
                
                // Save assistant to state
                state.assistant = assistant;
                
                // Update UI to show active assistant
                assistantStatusEl.textContent = 'Ready';
                assistantStatusEl.classList.remove('bg-gray-200', 'text-gray-600');
                assistantStatusEl.classList.add('bg-green-100', 'text-green-800');
                
                // Show delete assistant button
                deleteAssistantBtn.classList.remove('hidden');
                
                // Enable chat functionality
                chatInputEl.disabled = false;
                sendMessageBtn.disabled = false;
                
                // Reset chat container with welcome message
                chatContainerEl.innerHTML = `
                    <div class="assistant-message chat-message">
                        <p>Successfully loaded assistant: <strong>${assistant.name}</strong></p>
                        <p class="mt-2">How can I help you today?</p>
                    </div>
                `;
                
                // Save assistant to localStorage for later restoring
                try {
                    localStorage.setItem('current_assistant', JSON.stringify({
                        id: assistant.id,
                        name: assistant.name,
                        timestamp: Date.now()
                    }));
                    console.log(`Saved assistant ${assistant.id} to localStorage`);
                } catch (storageError) {
                    console.error('Error saving assistant to localStorage:', storageError);
                }
                
                showAlert(`Assistant "${assistant.name}" loaded successfully`, 'success');
            } else {
                const errorData = await response.json();
                console.error('Error loading assistant:', errorData.error);
                showAlert(`Error: ${errorData.error || 'Failed to load assistant'}`);
            }
        } catch (error) {
            console.error('Error loading assistant:', error);
            showAlert(`Error: ${error.message || 'Failed to load assistant'}`);
        } finally {
            hideLoading();
        }
    }
    
    // Initialize app
    async function initApp() {
        // Set up event listeners
        setupEventListeners();
        
        // Initialize dark mode from saved preference
        initDarkMode();
        
        // Load collections automatically on page load
        loadCollections();
        
        // Auto-load saved assistant and thread if available
        try {
            // If we have a saved assistant in localStorage, restore it
            const savedAssistantData = localStorage.getItem('current_assistant');
            if (savedAssistantData) {
                const savedAssistant = JSON.parse(savedAssistantData);
                
                console.log('Found saved assistant in localStorage:', savedAssistant.id);
                
                // Restore assistant state
                state.assistant = {
                    id: savedAssistant.id,
                    name: savedAssistant.name
                };
                
                // Update UI to show active assistant
                assistantStatusEl.textContent = 'Ready';
                assistantStatusEl.classList.remove('bg-gray-200', 'text-gray-600');
                assistantStatusEl.classList.add('bg-green-100', 'text-green-800');
                
                // Show delete assistant button
                deleteAssistantBtn.classList.remove('hidden');
                
                // Enable chat functionality
                chatInputEl.disabled = false;
                sendMessageBtn.disabled = false;
                
                // Reset chat container with welcome message
                chatContainerEl.innerHTML = `
                    <div class="assistant-message chat-message">
                        <p>Welcome back! I'm your Zotero research assistant.</p>
                        <p class="mt-2">How can I help you today?</p>
                    </div>
                `;
                
                // If we also have a thread for this assistant, check if it's valid
                const savedThread = loadThreadFromStorage(savedAssistant.id);
                if (savedThread) {
                    console.log('Found saved thread in localStorage:', savedThread.threadId);
                    state.currentThread = savedThread.threadId;
                    // We'll validate the thread when the user sends a message
                }
            }
        } catch (error) {
            console.error('Error checking for saved assistant:', error);
        }
    }

    // Set up event listeners
    function setupEventListeners() {
        // Refresh button for collections
        refreshBtnEl.addEventListener('click', () => {
            loadCollections();
        });
        
        // Toggle load panel
        toggleLoadPanelBtn.addEventListener('click', () => {
            loadAssistantContent.classList.toggle('hidden');
            if (loadAssistantContent.classList.contains('hidden')) {
                loadPanelToggleIcon.textContent = '▼';
            } else {
                loadPanelToggleIcon.textContent = '▲';
                // Load assistants when panel is opened
                loadExistingAssistants();
            }
        });
        
        // Load existing assistants
        refreshAssistantsBtnEl.addEventListener('click', () => {
            loadExistingAssistants();
        });
        
        // Assistant selector change
        existingAssistantsEl.addEventListener('change', () => {
            state.selectedAssistantId = existingAssistantsEl.value;
            updateLoadButtonState();
            showAssistantDetails(state.selectedAssistantId);
        });
        
        // Load assistant button
        loadAssistantBtnEl.addEventListener('click', () => {
            loadSelectedAssistant();
        });
        
        // Dark mode toggle
        darkModeToggle.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            document.body.classList.toggle('dark');
            
            // Toggle icons
            lightIcon.classList.toggle('hidden');
            darkIcon.classList.toggle('hidden');
            
            // Save preference
            const isDarkMode = document.body.classList.contains('dark');
            localStorage.setItem('darkMode', isDarkMode ? 'true' : 'false');
        });
        
        // Add search input for documents
        const searchContainer = document.createElement('div');
        searchContainer.className = 'flex items-center bg-white border rounded p-1 mb-2 sticky top-0 z-10';
        searchContainer.innerHTML = `
            <input type="text" id="document-search" placeholder="Search documents..." 
                   class="flex-1 p-1 border-none focus:outline-none focus:ring-1 focus:ring-blue-300">
            <button id="clear-search-btn" class="text-gray-400 hover:text-gray-600 p-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        `;
        
        // Insert search before documents container
        documentsContainerEl.parentNode.insertBefore(searchContainer, documentsContainerEl);
        
        // Get search elements
        const searchInputEl = document.getElementById('document-search');
        const clearSearchBtnEl = document.getElementById('clear-search-btn');
        
        // Search documents on input
        searchInputEl.addEventListener('input', (e) => {
            state.searchQuery = e.target.value.trim().toLowerCase();
            filterDocuments();
        });
        
        // Clear search button
        clearSearchBtnEl.addEventListener('click', () => {
            searchInputEl.value = '';
            state.searchQuery = '';
            filterDocuments();
        });
        
        // Add minimize button to assistant config panel
        const configPanel = document.getElementById('assistant-config');
        if (configPanel) {
            // Add a header with minimize button
            const headerDiv = document.createElement('div');
            headerDiv.className = 'flex justify-between items-center mb-3 bg-gray-100 p-2 rounded';
            headerDiv.innerHTML = `
                <h3 class="font-medium">Assistant Configuration</h3>
                <button id="toggle-config-btn" class="text-gray-600 hover:text-gray-800 p-1 rounded">
                    <span id="toggle-icon">▼</span>
                </button>
            `;
            
            // Insert at the beginning of the config panel
            configPanel.insertBefore(headerDiv, configPanel.firstChild);
            
            // Get config content elements
            const configContentEls = Array.from(configPanel.children).filter(el => 
                el !== headerDiv && !el.classList.contains('hidden'));
            
            // Toggle button functionality
            const toggleBtn = document.getElementById('toggle-config-btn');
            const toggleIcon = document.getElementById('toggle-icon');
            
            toggleBtn.addEventListener('click', () => {
                state.configPanelMinimized = !state.configPanelMinimized;
                
                // Toggle config content visibility
                configContentEls.forEach(el => {
                    if (state.configPanelMinimized) {
                        el.classList.add('hidden');
                        toggleIcon.textContent = '▲';
                    } else {
                        el.classList.remove('hidden');
                        toggleIcon.textContent = '▼';
                    }
                });
            });
        }

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

        // Delete assistant button
        deleteAssistantBtn.addEventListener('click', async () => {
            if (!state.assistant || !state.assistant.id) {
                showAlert('No active assistant to delete');
                return;
            }

            // Show double confirmation dialog
            if (!confirm(`Are you sure you want to delete the assistant "${state.assistant.name || 'Unnamed'}"?`)) {
                return;
            }
            
            // Second confirmation for safety
            if (!confirm('This action CANNOT be undone. Confirm deletion?')) {
                return;
            }
            
            // Show loading overlay
            showLoading('Deleting assistant...');
            
            try {
                // Send the delete request to the backend
                const response = await fetch(`/api/openai/assistant/${state.assistant.id}`, {
                    method: 'DELETE'
                });
                
                const data = await response.json();
                
                if (response.ok && data.success) {
                    console.log('Assistant deleted successfully:', data);
                    
                    // Remove assistant from localStorage
                    try {
                        localStorage.removeItem('current_assistant');
                        localStorage.removeItem(`thread_${state.assistant.id}`);
                    } catch (storageError) {
                        console.error('Error removing assistant from localStorage:', storageError);
                    }
                    
                    // Reset application state
                    state.assistant = null;
                    state.currentThread = null;
                    state.documentFileIds = {};
                    
                    // Update UI to reflect deleted assistant
                    assistantStatusEl.textContent = 'Not Created';
                    assistantStatusEl.classList.remove('bg-green-100', 'text-green-800');
                    assistantStatusEl.classList.add('bg-gray-200', 'text-gray-600');
                    
                    // Hide delete button
                    deleteAssistantBtn.classList.add('hidden');
                    
                    // Disable chat input
                    chatInputEl.disabled = true;
                    sendMessageBtn.disabled = true;
                    
                    // Reset chat container
                    chatContainerEl.innerHTML = `
                        <div class="flex items-center justify-center h-full text-gray-400">
                            Create an assistant to start chatting
                        </div>
                    `;
                    
                    // Show success message
                    showAlert('Assistant deleted successfully', 'success');
                } else {
                    // Show error message
                    const errorMsg = data.error || 'Failed to delete assistant';
                    showAlert(`Error: ${errorMsg}`);
                }
            } catch (error) {
                console.error('Error deleting assistant:', error);
                showAlert(`Error: ${error.message || 'Unknown error during assistant deletion'}`);
            } finally {
                hideLoading();
            }
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
                    
                    // Show the delete assistant button
                    deleteAssistantBtn.classList.remove('hidden');
                    
                    // Save assistant to localStorage for later restoring
                    try {
                        localStorage.setItem('current_assistant', JSON.stringify({
                            id: assistantData.id,
                            name: name,
                            timestamp: Date.now()
                        }));
                        console.log(`Saved assistant ${assistantData.id} to localStorage`);
                    } catch (storageError) {
                        console.error('Error saving assistant to localStorage:', storageError);
                    }
                    
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
                
                // Auto-populate the Assistant Name field with the name of the selected collection
                const assistantNameEl = document.getElementById('assistant-name');
                assistantNameEl.value = collection.data.name;
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
                state.searchQuery = ''; // Reset search query when loading new collection
                if (document.getElementById('document-search')) {
                    document.getElementById('document-search').value = '';
                }
                filterDocuments(); // Use filter function which will handle rendering
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

    // Filter documents based on search query
    function filterDocuments() {
        const query = state.searchQuery.toLowerCase();
        
        // If no search query, just render the documents
        if (!query) {
            renderDocuments(state.documents);
            return;
        }
        
        // Filter documents based on search query
        const filteredDocs = state.documents.filter(doc => {
            // Search in title
            if (doc.data.title && doc.data.title.toLowerCase().includes(query)) {
                return true;
            }
            
            // Search in authors
            if (doc.data.creators && doc.data.creators.length > 0) {
                for (const creator of doc.data.creators) {
                    const authorName = (creator.firstName && creator.lastName) 
                        ? `${creator.lastName}, ${creator.firstName}`.toLowerCase()
                        : (creator.name || '').toLowerCase();
                    if (authorName.includes(query)) {
                        return true;
                    }
                }
            }
            
            // Search in journal/publication
            if (doc.data.publicationTitle && doc.data.publicationTitle.toLowerCase().includes(query)) {
                return true;
            }
            
            // Search in abstract
            if (doc.data.abstractNote && doc.data.abstractNote.toLowerCase().includes(query)) {
                return true;
            }
            
            // Search in DOI
            if (doc.data.DOI && doc.data.DOI.toLowerCase().includes(query)) {
                return true;
            }
            
            return false;
        });
        
        // Render filtered documents
        renderDocuments(filteredDocs);
    }
    
    // Render documents
    function renderDocuments(docsToRender = state.documents) {
        documentsContainerEl.innerHTML = '';
        
        const collection = state.collections.find(c => c.key === state.selectedCollection);
        if (collection) {
            documentsTitleEl.textContent = `${collection.data.name} Documents`;
        }
        
        // Show different count based on search or all documents
        if (state.searchQuery) {
            documentCountEl.textContent = `${docsToRender.length} of ${state.documents.length} documents`;
        } else {
            documentCountEl.textContent = `${state.documents.length} documents`;
        }
        
        if (docsToRender.length === 0) {
            documentsContainerEl.innerHTML = `
                <div class="flex items-center justify-center py-12 text-gray-400">
                    ${state.searchQuery ? 'No matching documents found' : 'No documents found in this collection'}
                </div>
            `;
            selectAllBtn.classList.add('hidden');
            return;
        }
        
        selectAllBtn.classList.remove('hidden');
        
        // Count documents with PDFs
        const docsWithPdfs = docsToRender.filter(doc => doc.hasPDF).length;
        documentCountEl.textContent = `${docsToRender.length} documents (${docsWithPdfs} with PDFs)`;
        
        docsToRender.forEach(doc => {
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
            let pdfBadge = '<span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full ml-1 whitespace-nowrap">No PDF</span>';
            
            if (doc.hasPDF) {
                // Show the number of attachments if there are multiple
                const pdfCount = doc.pdfAttachments ? doc.pdfAttachments.length : 0;
                if (pdfCount > 1) {
                    pdfBadge = `<span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full ml-1 whitespace-nowrap">${pdfCount} PDFs</span>`;
                } else {
                    pdfBadge = '<span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full ml-1 whitespace-nowrap">PDF Available</span>';
                }
                
                // Add tooltip with PDF info if available
                if (doc.pdfAttachments && doc.pdfAttachments.length > 0) {
                    docEl.setAttribute('title', `PDF Attachments: ${doc.pdfAttachments.map(att => att.title).join(', ')}`);
                }
            }
            
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
                
                // Save thread to localStorage
                saveThreadToStorage(state.assistant.id, data.threadId);
                
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
            
            // Validate thread if we have one
            let useExistingThread = false;
            if (state.currentThread) {
                // Check if thread is valid
                const isValid = await validateThread(state.currentThread, state.assistant.id);
                
                if (isValid) {
                    useExistingThread = true;
                } else {
                    // Thread is invalid, try to get a stored thread from localStorage
                    const storedThread = loadThreadFromStorage(state.assistant.id);
                    
                    if (storedThread && storedThread.threadId !== state.currentThread) {
                        // We have a different stored thread, try to validate it
                        const isStoredValid = await validateThread(storedThread.threadId, state.assistant.id);
                        
                        if (isStoredValid) {
                            console.log(`Using stored thread ${storedThread.threadId} from localStorage`);
                            state.currentThread = storedThread.threadId;
                            useExistingThread = true;
                            
                            // Let user know we're continuing a previous conversation
                            appendMessage('Continuing from a previous conversation...', 'system');
                        } else {
                            console.log('Stored thread is also invalid, starting new conversation');
                            state.currentThread = null;
                        }
                    } else {
                        // No valid thread found
                        console.log('No valid thread found, starting new conversation');
                        state.currentThread = null;
                    }
                }
            }
            
            // Send to API
            let response;
            
            if (useExistingThread) {
                console.log(`Continuing conversation on thread ${state.currentThread}`);
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
                console.log('Starting new conversation thread');
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
                console.log(`Using thread ID: ${state.currentThread}`);
                
                // Save thread to localStorage
                saveThreadToStorage(state.assistant.id, state.currentThread);
                
                // Add assistant response to chat
                appendMessage(data.message, 'assistant');
            } else {
                console.error('API returned error:', data.error);
                
                // Handle specific error cases
                if (data.code === 'thread_not_found' || 
                    (data.error && data.error.includes('thread') && data.error.includes('not found'))) {
                    
                    console.log('Thread not found or invalid, resetting and trying again with a new thread');
                    // Reset thread ID
                    state.currentThread = null;
                    
                    // Show message to user about the conversation restart
                    appendMessage('Your previous conversation thread has expired. Starting a new conversation...', 'assistant', true);
                    
                    // Try again with a new thread
                    console.log('Starting new conversation thread after thread error');
                    const newResponse = await fetch('/api/openai/query', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            prompt: message,
                            assistantId: state.assistant.id
                        })
                    });
                    
                    const newData = await newResponse.json();
                    
                    if (newResponse.ok) {
                        // Save new thread ID
                        state.currentThread = newData.threadId;
                        console.log(`Using new thread ID: ${state.currentThread}`);
                        
                        // Save thread to localStorage
                        saveThreadToStorage(state.assistant.id, state.currentThread);
                        
                        // Add assistant response to chat
                        appendMessage(newData.message, 'assistant');
                    } else {
                        // If the retry also failed, show error
                        appendMessage('The conversation thread was lost and a new conversation could not be started. Please refresh the page and try again.', 'assistant', true);
                    }
                } else if (data.code === 'thread_alternative_available' && data.alternateThreadId) {
                    // Server found an alternate valid thread
                    console.log(`Using alternative thread ${data.alternateThreadId} suggested by server`);
                    state.currentThread = data.alternateThreadId;
                    
                    // Let user know we're continuing a previous conversation
                    appendMessage('Continuing from a previous conversation...', 'system');
                    
                    // Try again with the alternate thread
                    const altResponse = await fetch('/api/openai/continue', {
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
                    
                    const altData = await altResponse.json();
                    
                    if (altResponse.ok) {
                        // Save thread to localStorage
                        saveThreadToStorage(state.assistant.id, state.currentThread);
                        
                        // Add assistant response to chat
                        appendMessage(altData.message, 'assistant');
                    } else {
                        throw new Error(`Failed to use alternative thread: ${altData.error}`);
                    }
                } else {
                    throw new Error(`Failed to get response: ${data.error}`);
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
            
            // Remove typing indicator if it exists
            const typingIndicator = document.querySelector('.spinner-small')?.parentElement;
            if (typingIndicator) {
                chatContainerEl.removeChild(typingIndicator);
            }
            
            // More descriptive error message
            let errorMessage = 'Sorry, I encountered an error processing your request.';
            
            // Add more details if we have them
            if (error.message && error.message.includes('Failed to get response:')) {
                errorMessage += ' ' + error.message.replace('Failed to get response: ', '');
            } else {
                errorMessage += ' Please try again.';
            }
            
            // Add error message to chat
            appendMessage(errorMessage, 'assistant', true);
            
            // If there seems to be an issue with the thread, reset it
            if (error.message && (
                error.message.includes('thread') || 
                error.message.includes('Thread') ||
                error.message.includes('not found')
            )) {
                console.log('Resetting conversation thread due to thread-related error');
                state.currentThread = null;
            }
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
        
        // Use our CSS classes instead of inline styles
        if (role === 'system') {
            messageEl.className = 'system-message chat-message';
        } else {
            messageEl.className = `${role}-message chat-message${isError ? ' error' : ''}`;
        }
        
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

    // Initialize the app with no server control buttons

    // Initialize the app
    initApp();
});