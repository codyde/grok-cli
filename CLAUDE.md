# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

grok-cli-js is a terminal-based chat application that interfaces with Grok (xAI's AI assistant) through a TUI built with JavaScript/Node.js. The application provides a chat interface with file referencing capabilities and real-time streaming responses.

## SDK Requirements

This project uses the **Vercel AI SDK v4+ with XAI provider** for optimal performance and developer experience.

**Current Implementation:**
- `@ai-sdk/xai` - Official XAI provider for AI SDK
- `ai` package - Core AI SDK with generateText, streamText, etc.
- Modern tool calling with built-in streaming support

**Key Benefits:**
- Reduced flickering with buffered streaming updates
- Native tool calling integration
- Automatic error handling and retry logic
- Type-safe API interfaces

## Development Commands

### Build and Run
```bash
npm start            # Run the application
npm run dev          # Run with watch mode
```

## Environment Setup

The application requires an `XAI_API_KEY` environment variable to connect to Grok. This should be set in a `.env` file:
```
XAI_API_KEY=your_api_key_here
```

## Architecture Overview

### Core Components

1. **main.js** - Entry point that loads environment variables and launches the TUI
2. **api.js** - Handles communication with XAI API using native fetch calls
   - `GrokClient` class manages API calls
   - Supports both regular chat and streaming responses
   - Implements tool calling using XAI's native format
3. **ink-app.js** - Main TUI application logic using React/Ink
   - `App` component manages application state
   - Handles user input, chat history, scrolling, and file search
   - Implements file referencing with `@filename` syntax
   - Manages streaming response display
4. **file-utils.js** - File system utilities for file referencing

### Key Features

- **File Referencing**: Type `@filename` to search and include file contents in chat
- **Streaming Responses**: Real-time character-by-character response display
- **Tool Calling**: Native XAI tool calling for file system operations
- **Scrollable Chat**: Navigate chat history with arrow keys, Page Up/Down, Home/End
- **Auto-scroll**: Automatically follows new messages unless user scrolls up

### Dependencies

- `ink` - React-based TUI framework
- `react` - Component framework
- `dotenv` - Environment variable loading
- Native fetch for XAI API calls

### Tool Calling

Uses XAI's native tool calling format:
```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "tool_name",
        "description": "Tool description",
        "parameters": { ... }
      }
    }
  ]
}
```

## File Structure

```
src/
├── main.js          # Application entry point
├── api.js           # Native XAI API client
├── ink-app.js       # Main Ink/React TUI application
├── file-utils.js    # File system utilities
└── tui-app.js       # Alternative blessed TUI (not used)
```