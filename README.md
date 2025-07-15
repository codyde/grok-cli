# grok-cli-js

![Grok CLI Demo](https://img.shields.io/badge/Version-1.0.0-blue) ![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green) ![License](https://img.shields.io/badge/License-MIT-yellow)

Terminal-based chat application for interacting with Grok (xAI) - JavaScript version. This CLI tool provides an interactive TUI (Text User Interface) for chatting with Grok AI, complete with file referencing, streaming responses, tool calling for file system operations, and debug capabilities.

Built with React and Ink for a smooth terminal experience, it allows developers to interact with Grok while referencing local files and using AI-assisted file system tools.

## Features

- **Interactive TUI**: Clean, scrollable chat interface with real-time streaming responses.
- **File Referencing**: Use `@filename` to search and include file contents in your messages (e.g., `@package.json` to analyze project dependencies).
- **Tool Calling**: Grok can use built-in tools to list files, read/write files, and execute safe shell commands (e.g., git operations).
- **Streaming Responses**: Real-time character-by-character response generation with buffered updates to reduce flickering.
- **Commands**:
  - `/debug`: Open debug console to view logs and API calls.
  - `/clear`: Reset conversation history.
  - `/save`: Save the current conversation to a JSON file.
- **Scrollable History**: Navigate chat with arrow keys, Page Up/Down, Home/End.
- **Auto-Scroll**: Automatically follows new messages unless manually scrolled.
- **Quirky Thinking Indicators**: Fun messages while Grok is processing (e.g., "🤔 Thinking...", "🚀 Launching thought rockets...").
- **Debug Logging**: Built-in logger with a dedicated debug window.
- **Alternative TUIs**: Includes implementations using Ink (primary), simple readline, terminal-kit, and blessed for flexibility.

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/codyde/grok-cli.git
   cd grok-cli
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up your environment (see below).

## Environment Setup

Create a `.env` file in the project root with your xAI API key:

```
XAI_API_KEY=your_api_key_here
```

You can obtain an API key from the [xAI Developer Console](https://console.x.ai).

## Usage

Run the application:

```
npm start
```

For development mode with auto-reload:

```
npm run dev
```

### In-App Controls

- Type messages and press Enter to send.
- Use `@` to trigger file search autocomplete.
- Use `/` to access commands (e.g., `/debug`).
- Scroll chat history with ↑↓ arrows, Page Up/Down, Home/End.
- Press Esc twice quickly to cancel ongoing generation.
- Ctrl+C to quit.

### Example

1. Start the app: `npm start`
2. Type: `Hello Grok! Can you analyze @package.json?`
3. Grok will reference the file and provide analysis.
4. Use tools: `List files in the src directory` – Grok will use the `listFiles` tool.

## Architecture

### Core Components

- **main.js**: Entry point, loads env and launches TUI.
- **api.js**: Handles xAI API communication with tool calling and streaming.
- **ink-app.js**: Primary TUI using React/Ink with components for chat, input, file search, commands, and debug.
- **file-utils.js**: Utilities for file searching and content inclusion.
- **debug-logger.js** & **debug-window.js**: Logging and debug interface.
- **command-selector.js**: Command search and execution.

### Alternative Interfaces

- **simple-tui.js**: Basic readline-based CLI without TUI.
- **terminal-tui.js**: Uses terminal-kit for a custom terminal UI.
- **tui-app.js**: Uses blessed for a widget-based TUI.

## Development

This project uses the xAI API directly with native fetch for chat completions and streaming. Tool calling is implemented for file system operations.

### Dependencies

- [Ink](https://github.com/vadimdemedes/ink): React for terminals.
- [React](https://reactjs.org/): Component framework.
- [dotenv](https://github.com/motdotla/dotenv): Environment variables.
- [glob](https://github.com/isaacs/node-glob): File pattern matching.

## Contributing

Contributions welcome! Please fork the repo and submit a pull request.

1. Fork the project.
2. Create a feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a pull request.

## License

MIT License. See [LICENSE](LICENSE) for details.

---

Built with ❤️ by [codyde](https://github.com/codyde). Powered by xAI's Grok.

What would you like to build next?