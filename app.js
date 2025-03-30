// app.js - Main application file
const express = require('express');
const path = require('path');
const axios = require('axios');
const OpenAI = require('openai');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

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

// Cache for OpenAI file IDs and assistant ID
let openaiCache = {
  fileIds: {},
  assistantId: null
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
    
    // Get collection items
    const response = await axios.get(
      `${zoteroConfig.baseUrl}/users/${ZOTERO_USER_ID}/collections/${collectionId}/items`, {
        headers: zoteroConfig.headers,
        params: { format: 'json', include: 'data,meta' }
      }
    );
    
    // Filter to only include items with PDFs
    const items = response.data.filter(item => {
      return item.data.contentType === 'application/pdf' || 
             (item.data.itemType === 'attachment' && item.data.contentType === 'application/pdf') ||
             (item.data.itemType === 'document' && item.meta && item.meta.numAttachments > 0);
    });
    
    res.json(items);
  } catch (error) {
    console.error('Error fetching collection items:', error);
    res.status(500).json({ error: 'Failed to fetch collection items' });
  }
});

// Get PDF attachment for an item
app.get('/api/item/:itemKey/pdf', async (req, res) => {
  try {
    const { itemKey } = req.params;
    
    // First, check if the item is itself a PDF or get its attachments
    let pdfUrl;
    
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
      return res.json({ fileId: openaiCache.fileIds[itemKey] });
    }
    
    // Upload file to OpenAI
    const file = await openai.files.create({
      file: fs.createReadStream(filePath),
      purpose: 'assistants',
    });
    
    // Cache the file ID
    openaiCache.fileIds[itemKey] = file.id;
    
    res.json({ fileId: file.id });
  } catch (error) {
    console.error('Error uploading PDF to OpenAI:', error);
    res.status(500).json({ error: 'Failed to upload PDF to OpenAI' });
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
    let assistant;
    
    if (assistantId) {
      // Update existing assistant
      assistant = await openai.beta.assistants.update(assistantId, {
        name,
        instructions,
        tools: [{ type: "retrieval" }],
        file_ids: fileIds,
        model: "gpt-4o"
      });
    } else {
      // Create new assistant
      assistant = await openai.beta.assistants.create({
        name,
        instructions,
        tools: [{ type: "retrieval" }],
        file_ids: fileIds,
        model: "gpt-4o"
      });
      
      // Cache the assistant ID
      openaiCache.assistantId = assistant.id;
    }
    
    res.json(assistant);
  } catch (error) {
    console.error('Error creating/updating OpenAI assistant:', error);
    res.status(500).json({ error: 'Failed to create/update OpenAI assistant' });
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

// Cleanup temp files when the server exits
process.on('exit', () => {
  const tempDir = path.join(__dirname, 'temp');
  if (fs.existsSync(tempDir)) {
    const files = fs.readdirSync(tempDir);
    files.forEach(file => {
      if (file !== '.gitkeep') {
        try {
          fs.unlinkSync(path.join(tempDir, file));
        } catch (error) {
          console.error(`Failed to delete temp file ${file}: ${error.message}`);
        }
      }
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using Zotero account with User ID: ${ZOTERO_USER_ID}`);
});