# CLAUDE.md - Guide for Claude Code

## Build Commands
- `npm start` - Run the application with Node.js
- `npm run dev` - Run with Nodemon (auto-restart on file changes)

## Code Style Guidelines

### Core Patterns
- Use Express.js for API endpoints with consistent error handling
- Initialize environment variables with validation
- Follow RESTful API design for routes

### Naming Conventions
- camelCase for variables, functions, and methods
- Descriptive variable names that indicate purpose
- API routes follow `/api/resource/action` pattern

### Code Structure
- 2-space indentation
- Clean code separation with consistent comments
- Asynchronous operations use try/catch with proper error handling

### Error Handling
- Always use try/catch for API endpoints
- Log errors with console.error()
- Return appropriate HTTP status codes with JSON error messages
- Validate environment variables and input parameters

### TypeScript/JavaScript
- Project uses vanilla JavaScript without types
- When making changes, maintain the existing JavaScript patterns
- Follow Node.js best practices for asynchronous operations

### File Management
- Temporary files stored in temp/ directory
- Implement proper cleanup on process exit