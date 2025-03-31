# Zotero-Summarizer

A tool for creating AI assistants from your Zotero library to help analyze and summarize academic papers.

## ⚠️ Important Requirements and Warnings

### Zotero Requirements
- **API Access**: Requires a Zotero API key with **READ access** to your library
- **Cloud Storage**: Assumes all PDFs are stored in Zotero cloud storage
- **Account**: You must have a Zotero account with synced collections

### OpenAI Requirements
- **Paid Account**: Requires an OpenAI paid account (not free tier)
- **API Key**: Needs an OpenAI API key with full access to the Assistants API
- **Permissions**: The app will create, load, modify, and delete assistants in your account
- **Cost Warning**: Using this application will incur charges on your OpenAI account:
  - PDF uploads and vector embedding generation cost money
  - Assistant API calls cost money
  - Costs vary based on PDF size and chat usage

## Setup

1. **API Keys**:
   - Create a [Zotero API key](https://www.zotero.org/settings/keys/new) with read access
   - Get your [OpenAI API key](https://platform.openai.com/api-keys) from a paid account

2. **Environment Setup**:
   - Clone this repository
   - Create a `.env` file with the following variables:
     ```
     OPENAI_API_KEY=your_openai_api_key
     ZOTERO_API_KEY=your_zotero_api_key
     ZOTERO_USER_ID=your_zotero_user_id
     PORT=3000
     ```
   - Install dependencies: `npm install`

## Running the Application

The application runs on HTTPS for security:

```
npm start
```

This will start:
- HTTPS server at https://localhost:3000 (main application)
- HTTP redirect server at http://localhost:3001 (redirects to HTTPS)

### Self-Signed Certificate Warning

The application uses a self-signed certificate for local HTTPS. When accessing the application:

1. Your browser will show a security warning - this is normal
2. Click "Advanced" or "Details" on the warning page
3. Choose "Proceed to localhost (unsafe)" or similar option
4. This warning only appears because you're using a local certificate, not because the app is unsafe

## Features

- Connect to your Zotero library and browse collections
- View academic papers and check which have available PDFs
- Create AI assistants with selected PDFs for research analysis
- Load existing assistants you've created previously
- Chat with your assistant about your research papers
- Toggle between light and dark mode

## Security Notes

- Your API keys are stored only in the local `.env` file (not committed to git)
- All communication uses HTTPS encryption
- PDFs are temporarily downloaded to your computer before being sent to OpenAI

## Limitations

- Only works with PDFs stored in Zotero cloud storage
- Cannot process extremely large PDFs (OpenAI has file size limits)
- Quality of assistant responses depends on OpenAI's underlying models