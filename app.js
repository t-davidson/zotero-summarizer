// app.js - Main application file
const express = require('express');
const path = require('path');
const axios = require('axios');
const OpenAI = require('openai');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

// Setup logging
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Create a log file with timestamp
const logFileName = `app-${new Date().toISOString().replace(/:/g, '-')}.log`;
const logFilePath = path.join(logDir, logFileName);
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

// Symlink to latest log for easy access
const latestLogPath = path.join(logDir, 'latest.log');
try {
  if (fs.existsSync(latestLogPath)) {
    fs.unlinkSync(latestLogPath);
  }
  fs.symlinkSync(logFilePath, latestLogPath);
} catch (error) {
  console.log(`Could not create symlink to latest log: ${error.message}`);
}

// Override console.log and console.error to also write to our log file
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function() {
  const args = Array.from(arguments);
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] INFO: ${args.join(' ')}\n`;
  logStream.write(logMessage);
  originalConsoleLog.apply(console, args);
};

console.error = function() {
  const args = Array.from(arguments);
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ERROR: ${args.join(' ')}\n`;
  logStream.write(logMessage);
  originalConsoleError.apply(console, args);
};

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ZOTERO_API_KEY = process.env.ZOTERO_API_KEY;
const ZOTERO_USER_ID = process.env.ZOTERO_USER_ID;

// Check required environment variables
if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY is required in .env file');
  process.exit(1);
}

if (!ZOTERO_API_KEY) {
  console.error('Error: ZOTERO_API_KEY is required in .env file');
  process.exit(1);
}

if (!ZOTERO_USER_ID) {
  console.error('Error: ZOTERO_USER_ID is required in .env file');
  process.exit(1);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Cache for OpenAI file IDs, assistant ID, and vector store ID
let openaiCache = {
  fileIds: {},
  assistantId: null,
  vectorStoreId: null
};

// Zotero API configuration
const zoteroConfig = {
  baseUrl: 'https://api.zotero.org',
  headers: {
    'Zotero-API-Version': '3',
    'Authorization': `Bearer ${ZOTERO_API_KEY}`
  }
};

// Get Zotero collections
app.get('/api/collections', async (req, res) => {
  try {
    const response = await axios.get(`${zoteroConfig.baseUrl}/users/${ZOTERO_USER_ID}/collections`, {
      headers: zoteroConfig.headers
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching Zotero collections:', error);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

// Get items in a Zotero collection
app.get('/api/collection/:collectionId/items', async (req, res) => {
  try {
    const { collectionId } = req.params;
    
    console.log(`Fetching items from collection ${collectionId}`);
    
    // Function to fetch a page of items
    async function fetchItemsPage(start = 0) {
      return axios.get(
        `${zoteroConfig.baseUrl}/users/${ZOTERO_USER_ID}/collections/${collectionId}/items`, {
          headers: zoteroConfig.headers,
          params: { 
            format: 'json', 
            include: 'data',
            limit: 100,
            start
          }
        }
      );
    }
    
    // Get the first page of items
    const firstPageResponse = await fetchItemsPage();
    let allItems = firstPageResponse.data;
    
    // Check if there are more items to fetch (using Link header)
    const linkHeader = firstPageResponse.headers.link;
    if (linkHeader && linkHeader.includes('rel="next"')) {
      // Extract total count from Link header if available
      console.log('Pagination detected in collection response');
      
      // Get total item count from header or make estimate
      let totalItems = 0;
      if (firstPageResponse.headers['total-results']) {
        totalItems = parseInt(firstPageResponse.headers['total-results']);
        console.log(`Collection has ${totalItems} total items`);
      } else {
        // Estimate based on first page
        totalItems = Math.max(200, allItems.length * 2); // Assume at least 2 pages
        console.log(`Estimating collection has at least ${totalItems} items`);
      }
      
      // Fetch remaining pages in parallel
      const remainingPageCount = Math.ceil((totalItems - allItems.length) / 100);
      console.log(`Fetching ${remainingPageCount} additional pages`);
      
      const pagePromises = [];
      for (let i = 1; i <= remainingPageCount; i++) {
        pagePromises.push(fetchItemsPage(i * 100));
      }
      
      const pageResponses = await Promise.all(pagePromises);
      for (const pageResponse of pageResponses) {
        allItems = allItems.concat(pageResponse.data);
      }
      
      console.log(`Total ${allItems.length} items fetched`);
    }
    
    // Keep academic items that are likely papers, books, etc.
    const academicItems = allItems.filter(item => {
      // Include all common academic item types
      const academicTypes = [
        'journalArticle',
        'book',
        'bookSection',
        'document',
        'report',
        'conferencePaper',
        'thesis',
        'manuscript',
        'preprint',
        'blogPost',
        'webpage',
        'magazineArticle',
        'newspaperArticle',
        'letter',
        'interview',
        'presentation',
        'audioRecording',
        'videoRecording',
        'podcast',
        'case',
        'statute',
        'bill',
        'hearing',
        'patent',
        'map'
      ];
      
      // Include all academic items
      return academicTypes.includes(item.data.itemType) || 
             // Also include parent items that might have PDF attachments
             (item.meta && item.meta.numChildren && item.meta.numChildren > 0);
    });
    
    console.log(`Found ${academicItems.length} academic items out of ${allItems.length} total items`);
    
    // For each item, check if it has PDF attachments
    const enhancedItems = await Promise.all(academicItems.map(async (item) => {
      try {
        // Check for PDF attachments
        const attachmentsResponse = await axios.get(
          `${zoteroConfig.baseUrl}/users/${ZOTERO_USER_ID}/items/${item.key}/children`, {
            headers: zoteroConfig.headers
          }
        );
        
        // Look for PDF attachments
        const pdfAttachments = attachmentsResponse.data.filter(
          attachment => attachment.data.contentType === 'application/pdf'
        );
        
        // Add PDF availability and attachment info to the item
        return {
          ...item,
          hasPDF: pdfAttachments.length > 0,
          pdfAttachments: pdfAttachments.map(att => ({ 
            key: att.key, 
            title: att.data.title || 'PDF'
          }))
        };
      } catch (error) {
        console.error(`Error checking attachments for item ${item.key}:`, error);
        return {
          ...item,
          hasPDF: false,
          pdfAttachments: []
        };
      }
    }));
    
    res.json(enhancedItems);
  } catch (error) {
    console.error('Error fetching collection items:', error);
    res.status(500).json({ error: 'Failed to fetch collection items' });
  }
});

// Get PDF attachment for an item
app.get('/api/item/:itemKey/pdf', async (req, res) => {
  try {
    const { itemKey } = req.params;
    const { attachmentKey } = req.query; // Optional attachment key if known
    
    // Determine PDF URL based on parameters
    let pdfUrl;
    
    if (attachmentKey) {
      // If we already know which attachment to use
      pdfUrl = `${zoteroConfig.baseUrl}/users/${ZOTERO_USER_ID}/items/${attachmentKey}/file`;
    } else {
      // Check if the item is itself a PDF 
      const itemResponse = await axios.get(
        `${zoteroConfig.baseUrl}/users/${ZOTERO_USER_ID}/items/${itemKey}`, {
          headers: zoteroConfig.headers
        }
      );
      
      if (itemResponse.data.data.contentType === 'application/pdf') {
        pdfUrl = `${zoteroConfig.baseUrl}/users/${ZOTERO_USER_ID}/items/${itemKey}/file`;
      } else {
        // Get attachments for this item
        const attachmentsResponse = await axios.get(
          `${zoteroConfig.baseUrl}/users/${ZOTERO_USER_ID}/items/${itemKey}/children`, {
            headers: zoteroConfig.headers
          }
        );
        
        // Find the first PDF attachment
        const pdfAttachment = attachmentsResponse.data.find(
          attachment => attachment.data.contentType === 'application/pdf'
        );
        
        if (pdfAttachment) {
          pdfUrl = `${zoteroConfig.baseUrl}/users/${ZOTERO_USER_ID}/items/${pdfAttachment.data.key}/file`;
        } else {
          return res.status(404).json({ error: 'No PDF attachment found for this item' });
        }
      }
    }
    
    try {
      // Get the PDF file
      const pdfResponse = await axios.get(pdfUrl, {
        headers: zoteroConfig.headers,
        responseType: 'arraybuffer'
      });
      
      // Save the PDF temporarily
      const tempFilePath = path.join(__dirname, 'temp', `${itemKey}.pdf`);
      fs.mkdirSync(path.join(__dirname, 'temp'), { recursive: true });
      fs.writeFileSync(tempFilePath, pdfResponse.data);
      
      res.json({ filePath: tempFilePath });
    } catch (pdfError) {
      console.error('Error downloading PDF file:', pdfError);
      return res.status(404).json({ error: 'PDF file could not be downloaded' });
    }
  } catch (error) {
    console.error('Error fetching PDF:', error);
    res.status(500).json({ error: 'Failed to fetch PDF' });
  }
});

// Upload a PDF to OpenAI
app.post('/api/openai/upload', async (req, res) => {
  try {
    const { filePath, itemKey } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    // Check if this PDF has already been uploaded to OpenAI
    if (openaiCache.fileIds[itemKey]) {
      console.log(`Using cached file ID for ${itemKey}: ${openaiCache.fileIds[itemKey]}`);
      return res.json({ fileId: openaiCache.fileIds[itemKey] });
    }
    
    console.log(`Uploading PDF from ${filePath} to OpenAI`);
    
    // Verify the file exists and is readable
    if (!fs.existsSync(filePath)) {
      console.error(`File does not exist: ${filePath}`);
      return res.status(400).json({ error: `File does not exist: ${filePath}` });
    }
    
    // Get file size for logging
    const stats = fs.statSync(filePath);
    console.log(`File size: ${stats.size} bytes`);
    
    // Upload file to OpenAI
    const file = await openai.files.create({
      file: fs.createReadStream(filePath),
      purpose: 'assistants',
    });
    
    console.log(`Successfully uploaded file to OpenAI with ID: ${file.id}`);
    
    // Cache the file ID
    openaiCache.fileIds[itemKey] = file.id;
    
    res.json({ fileId: file.id });
  } catch (error) {
    console.error('Error uploading PDF to OpenAI:', error);
    // Log more detailed error information
    if (error.response) {
      console.error('OpenAI API error response:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    res.status(500).json({ error: `Failed to upload PDF to OpenAI: ${error.message}` });
  }
});

// Create or update an OpenAI assistant with selected PDFs
app.post('/api/openai/assistant', async (req, res) => {
  try {
    const { name, instructions, fileIds } = req.body;
    
    if (!name || !instructions || !fileIds || fileIds.length === 0) {
      return res.status(400).json({ error: 'Name, instructions, and file IDs are required' });
    }
    
    let assistantId = openaiCache.assistantId;
    let vectorStoreId = openaiCache.vectorStoreId;
    let assistant;
    
    console.log(`Working with ${fileIds.length} files:`, fileIds);
    
    try {
      // Step 1: Create or use existing vector store
      if (!vectorStoreId) {
        console.log('Creating new vector store for document search');
        const vectorStore = await openai.vectorStores.create({
          name: `Zotero Document Store ${new Date().toISOString()}`
        });
        vectorStoreId = vectorStore.id;
        openaiCache.vectorStoreId = vectorStoreId;
        console.log(`Created vector store: ${vectorStoreId}`);
      } else {
        console.log(`Using existing vector store: ${vectorStoreId}`);
      }
      
      // Step 2: Add files to the vector store
      console.log(`Adding ${fileIds.length} files to vector store ${vectorStoreId}`);
      
      try {
        // Create a batch of files to add to the vector store
        const fileBatch = await openai.vectorStores.fileBatches.create(vectorStoreId, {
          file_ids: fileIds
        });
        
        console.log(`Created file batch ${fileBatch.id} with ${fileIds.length} files`);
        
        // Poll until processing is complete
        const pollStart = Date.now();
        let batchStatus = await openai.vectorStores.fileBatches.retrieve(vectorStoreId, fileBatch.id);
        
        console.log(`Initial batch status: ${batchStatus.status}`);
        
        // Wait for the file batch to finish processing with a timeout
        while (batchStatus.status === 'in_progress') {
          // Add a safety timeout (5 minutes)
          if (Date.now() - pollStart > 5 * 60 * 1000) {
            console.warn('File batch processing timeout after 5 minutes');
            break;
          }
          
          console.log('File batch still processing, waiting...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          batchStatus = await openai.vectorStores.fileBatches.retrieve(vectorStoreId, fileBatch.id);
        }
        
        console.log(`Final file batch status: ${batchStatus.status}`);
        
        if (batchStatus.status === 'failed') {
          console.error('File batch processing failed:', batchStatus.error);
          throw new Error(`File batch processing failed: ${batchStatus.error?.message || 'Unknown error'}`);
        }
      } catch (batchErr) {
        console.error('Error adding files to vector store:', batchErr);
        // Continue to assistant creation even if there was an error
      }
      
      // Step 3: Create or update the assistant with the vector store
      if (assistantId) {
        try {
          // Check if the assistant exists
          assistant = await openai.beta.assistants.retrieve(assistantId);
          console.log(`Retrieved existing assistant ${assistantId}`);
          
          // Update the assistant properties and link to vector store
          assistant = await openai.beta.assistants.update(assistantId, {
            name,
            instructions,
            tools: [{ type: "file_search" }],
            model: "gpt-4o",
            tool_resources: {
              file_search: {
                vector_store_ids: [vectorStoreId]
              }
            }
          });
          
          console.log(`Updated assistant ${assistant.id} with vector store ${vectorStoreId}`);
        } catch (err) {
          console.log(`Error with existing assistant, will create new one: ${err.message}`);
          assistantId = null;
        }
      }
      
      // Create a new assistant if needed
      if (!assistantId) {
        console.log(`Creating new assistant with vector store ${vectorStoreId}`);
        
        // Create the assistant with the vector store
        assistant = await openai.beta.assistants.create({
          name,
          instructions,
          tools: [{ type: "file_search" }],
          model: "gpt-4o",
          tool_resources: {
            file_search: {
              vector_store_ids: [vectorStoreId]
            }
          }
        });
        
        assistantId = assistant.id;
        console.log(`Created new assistant ${assistant.id} with vector store ${vectorStoreId}`);
        
        // Cache the assistant ID
        openaiCache.assistantId = assistantId;
      }
      
      // Verify the vector store and assistant configuration
      try {
        // Check vector store status
        const vectorStoreDetails = await openai.vectorStores.retrieve(vectorStoreId);
        console.log(`Vector store ${vectorStoreId} status: ${vectorStoreDetails.status}`);
        console.log(`Vector store has ${vectorStoreDetails.file_counts.total} total files`);
        console.log(`Vector store has ${vectorStoreDetails.file_counts.completed} completed files`);
        console.log(`Vector store has ${vectorStoreDetails.file_counts.in_progress} in-progress files`);
        console.log(`Vector store has ${vectorStoreDetails.file_counts.failed} failed files`);
        
        // Refetch the assistant to get latest details
        assistant = await openai.beta.assistants.retrieve(assistantId);
        console.log(`Assistant ${assistant.id} successfully configured`);
      } catch (verifyErr) {
        console.error('Error verifying configuration:', verifyErr.message);
      }
      
      // Add vector store and file info to the response
      assistant.vector_store_id = vectorStoreId;
      assistant.file_count = fileIds.length;
      assistant.file_ids = fileIds;
      
    } catch (err) {
      console.error('Error with vector store or assistant operations:', err);
      throw err;
    }
    
    res.json(assistant);
  } catch (error) {
    console.error('Error creating/updating OpenAI assistant:', error);
    
    // Detailed error log
    if (error.response) {
      console.error('OpenAI API response error:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    
    // Extract and format a more helpful error message
    let errorMessage = 'Failed to create/update OpenAI assistant';
    
    if (error.message) {
      errorMessage += `: ${error.message}`;
    }
    
    if (error.error && error.error.message) {
      errorMessage += ` - ${error.error.message}`;
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// Create a thread and send a message to the assistant
app.post('/api/openai/query', async (req, res) => {
  try {
    const { prompt, assistantId } = req.body;
    
    if (!prompt || !assistantId) {
      return res.status(400).json({ error: 'Prompt and assistant ID are required' });
    }
    
    // Create a thread
    const thread = await openai.beta.threads.create();
    
    // Add a message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: prompt
    });
    
    // Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId
    });
    
    // Poll for the run to complete
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    
    // Wait for the run to complete (in a real app, you might want to implement a webhook instead)
    while (runStatus.status !== 'completed' && runStatus.status !== 'failed') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    }
    
    if (runStatus.status === 'failed') {
      return res.status(500).json({ error: 'Assistant run failed', details: runStatus });
    }
    
    // Get the messages
    const messages = await openai.beta.threads.messages.list(thread.id);
    
    // Return the assistant's response
    const assistantMessages = messages.data.filter(msg => msg.role === 'assistant');
    const latestMessage = assistantMessages[0];
    
    res.json({
      message: latestMessage.content[0].text.value,
      threadId: thread.id
    });
  } catch (error) {
    console.error('Error querying OpenAI assistant:', error);
    res.status(500).json({ error: 'Failed to query OpenAI assistant' });
  }
});

// Continue an existing conversation thread
app.post('/api/openai/continue', async (req, res) => {
  try {
    const { prompt, threadId, assistantId } = req.body;
    
    if (!prompt || !threadId || !assistantId) {
      return res.status(400).json({ error: 'Prompt, thread ID, and assistant ID are required' });
    }
    
    // Add a message to the thread
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: prompt
    });
    
    // Run the assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId
    });
    
    // Poll for the run to complete
    let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    
    // Wait for the run to complete
    while (runStatus.status !== 'completed' && runStatus.status !== 'failed') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    }
    
    if (runStatus.status === 'failed') {
      return res.status(500).json({ error: 'Assistant run failed', details: runStatus });
    }
    
    // Get the messages
    const messages = await openai.beta.threads.messages.list(threadId);
    
    // Return the assistant's response
    const assistantMessages = messages.data.filter(msg => msg.role === 'assistant');
    const latestMessage = assistantMessages[0];
    
    res.json({
      message: latestMessage.content[0].text.value,
      threadId: threadId
    });
  } catch (error) {
    console.error('Error continuing conversation:', error);
    res.status(500).json({ error: 'Failed to continue conversation' });
  }
});

// Function to clean up temp files
function cleanupTempFiles() {
  console.log('Cleaning up temporary files...');
  const tempDir = path.join(__dirname, 'temp');
  if (fs.existsSync(tempDir)) {
    const files = fs.readdirSync(tempDir);
    files.forEach(file => {
      if (file !== '.gitkeep') {
        try {
          fs.unlinkSync(path.join(tempDir, file));
          console.log(`Deleted temp file: ${file}`);
        } catch (error) {
          console.error(`Failed to delete temp file ${file}: ${error.message}`);
        }
      }
    });
  }
  
  // Close the log stream
  if (logStream) {
    console.log('Closing log file...');
    logStream.end();
  }
}

// Clean up resources when the server exits
process.on('exit', cleanupTempFiles);
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  cleanupTempFiles();
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  cleanupTempFiles();
  process.exit(0);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  cleanupTempFiles();
  process.exit(1);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using Zotero account with User ID: ${ZOTERO_USER_ID}`);
});