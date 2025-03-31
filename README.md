# Zotero-Summarizer

A tool for creating AI assistants from your Zotero library to help analyze and summarize academic papers.

## Setup

1. Clone this repository
2. Create a `.env` file with the following variables:
   ```
   OPENAI_API_KEY=your_openai_api_key
   ZOTERO_API_KEY=your_zotero_api_key
   ZOTERO_USER_ID=your_zotero_user_id
   PORT=3000
   ```
3. Install dependencies:
   ```
   npm install
   ```

## Running the Application

The application runs on HTTPS for security:

```
npm start
```

This will start:
- HTTPS server at https://localhost:3000 (main application)
- HTTP redirect server at http://localhost:3001 (redirects to HTTPS)

### Note about self-signed certificates

The application uses a self-signed certificate for HTTPS. When accessing the application for the first time, your browser might show a security warning. You can safely proceed by clicking "Advanced" and then "Proceed to localhost (unsafe)".

## Features

- Connect to your Zotero library
- Browse collections and documents
- Create AI assistants with selected PDFs
- Load existing assistants
- Chat with your assistant about your research papers
- Dark mode support