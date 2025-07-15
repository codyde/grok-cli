import terminalKit from 'terminal-kit';
import { GrokClient } from './api.js';
import { FileUtils } from './file-utils.js';

const term = terminalKit.terminal;

export class ChatMessage {
  constructor(role, content) {
    this.role = role;
    this.content = content;
    this.timestamp = new Date();
  }
}

export class TerminalApp {
  constructor() {
    this.grokClient = new GrokClient();
    this.messages = [];
    this.input = '';
    this.scrollOffset = 0;
    this.autoScroll = true;
    this.isStreaming = false;
    
    // File search state
    this.fileSearchActive = false;
    this.fileSearchQuery = '';
    this.fileSearchResults = [];
    this.fileSearchSelected = 0;
    
    // Terminal dimensions
    this.width = term.width;
    this.height = term.height;
    this.chatHeight = this.height - 5; // Leave space for input and borders
    this.inputY = this.height - 2;
    
    this.setupTerminal();
    this.setupEventHandlers();
    
    // Add welcome message
    this.addMessage('assistant', 'Welcome to Grok CLI! Start typing to chat with Grok. Use @ to reference files.');
    this.render();
  }

  setupTerminal() {
    term.fullscreen(true);
    term.hideCursor();
    term.clear();
    
    // Handle terminal resize
    term.on('resize', (width, height) => {
      this.width = width;
      this.height = height;
      this.chatHeight = height - 5;
      this.inputY = height - 2;
      this.render();
    });
  }

  setupEventHandlers() {
    term.on('key', (name, matches, data) => {
      switch (name) {
        case 'CTRL_C':
          this.cleanup();
          process.exit(0);
          break;
          
        case 'ENTER':
          if (this.fileSearchActive) {
            this.selectFile();
          } else {
            this.submitMessage();
          }
          break;
          
        case 'BACKSPACE':
          this.deleteChar();
          break;
          
        case 'UP':
          if (this.fileSearchActive) {
            this.fileSearchPrevious();
          } else {
            this.scrollUp();
          }
          break;
          
        case 'DOWN':
          if (this.fileSearchActive) {
            this.fileSearchNext();
          } else {
            this.scrollDown();
          }
          break;
          
        case 'PAGE_UP':
          this.scrollPageUp();
          break;
          
        case 'PAGE_DOWN':
          this.scrollPageDown();
          break;
          
        case 'HOME':
          this.scrollToTop();
          break;
          
        case 'END':
          this.scrollToBottom();
          break;
          
        case 'ESCAPE':
          if (this.fileSearchActive) {
            this.closeFileSearch();
          }
          break;
          
        default:
          if (data && data.isCharacter && data.codepoint) {
            this.addChar(String.fromCodePoint(data.codepoint));
          }
          break;
      }
    });
  }

  addMessage(role, content) {
    const message = new ChatMessage(role, content);
    this.messages.push(message);
    
    if (this.autoScroll) {
      this.scrollToBottom();
    }
    
    this.render();
  }

  addChar(char) {
    this.input += char;
    
    if (char === '@' || this.fileSearchActive) {
      this.updateFileSearch();
    }
    
    this.render();
  }

  deleteChar() {
    if (this.input.length > 0) {
      this.input = this.input.slice(0, -1);
      
      if (this.fileSearchActive) {
        this.updateFileSearch();
      }
      
      this.render();
    }
  }

  async updateFileSearch() {
    const atIndex = this.input.lastIndexOf('@');
    if (atIndex !== -1) {
      const query = this.input.substring(atIndex + 1);
      this.fileSearchQuery = query;
      this.fileSearchActive = true;
      
      this.fileSearchResults = await FileUtils.searchFiles(query);
      this.fileSearchSelected = 0;
      
      this.render();
    } else {
      this.closeFileSearch();
    }
  }

  closeFileSearch() {
    this.fileSearchActive = false;
    this.fileSearchResults = [];
    this.render();
  }

  selectFile() {
    if (this.fileSearchActive && this.fileSearchResults.length > 0) {
      const selectedFile = this.fileSearchResults[this.fileSearchSelected];
      const fileName = selectedFile.split('/').pop();
      
      const atIndex = this.input.lastIndexOf('@');
      if (atIndex !== -1) {
        this.input = this.input.substring(0, atIndex + 1) + fileName + ' ';
      }
      
      this.closeFileSearch();
    }
  }

  fileSearchNext() {
    if (this.fileSearchResults.length > 0) {
      this.fileSearchSelected = (this.fileSearchSelected + 1) % this.fileSearchResults.length;
      this.render();
    }
  }

  fileSearchPrevious() {
    if (this.fileSearchResults.length > 0) {
      this.fileSearchSelected = this.fileSearchSelected === 0 
        ? this.fileSearchResults.length - 1
        : this.fileSearchSelected - 1;
      this.render();
    }
  }

  scrollUp() {
    this.scrollOffset += 1;
    this.autoScroll = false;
    this.render();
  }

  scrollDown() {
    if (this.scrollOffset > 0) {
      this.scrollOffset -= 1;
      if (this.scrollOffset === 0) {
        this.autoScroll = true;
      }
      this.render();
    }
  }

  scrollPageUp() {
    this.scrollOffset += 10;
    this.autoScroll = false;
    this.render();
  }

  scrollPageDown() {
    if (this.scrollOffset >= 10) {
      this.scrollOffset -= 10;
    } else {
      this.scrollOffset = 0;
    }
    
    if (this.scrollOffset === 0) {
      this.autoScroll = true;
    }
    
    this.render();
  }

  scrollToTop() {
    this.scrollOffset = Math.max(0, this.messages.length - 1);
    this.autoScroll = false;
    this.render();
  }

  scrollToBottom() {
    this.scrollOffset = 0;
    this.autoScroll = true;
    this.render();
  }

  async submitMessage() {
    if (!this.input.trim() || this.isStreaming) {
      return;
    }

    const userInput = this.input.trim();
    this.input = '';
    this.closeFileSearch();
    
    // Add user message
    this.addMessage('user', userInput);
    
    // Add thinking message
    this.addMessage('assistant', 'Thinking...');
    
    this.isStreaming = true;
    
    try {
      // Process file references
      const processedInput = await FileUtils.processFileReferences(userInput);
      
      // Prepare messages
      const systemMessage = {
        role: 'system',
        content: processedInput.includes('File:')
          ? 'You are a helpful AI assistant. When analyzing files or code, provide your analysis and then ALWAYS end your response with a brief closing message that encourages the user to continue the conversation.'
          : 'You are a helpful AI assistant. At the end of each response, include a brief closing message that encourages the user to continue the conversation.'
      };

      const conversationMessages = this.messages
        .filter(msg => msg.content !== 'Thinking...')
        .map(msg => ({
          role: msg.role,
          content: msg.role === 'user' && msg.content === userInput ? processedInput : msg.content
        }));

      const allMessages = [systemMessage, ...conversationMessages];
      
      // Stream response
      let responseContent = '';
      const thinkingMessageIndex = this.messages.length - 1;
      const streamGenerator = this.grokClient.chatStream(allMessages);
      
      for await (const chunk of streamGenerator) {
        if (chunk) {
          responseContent += chunk;
          this.messages[thinkingMessageIndex].content = responseContent;
          this.render();
          
          // Small delay for smooth streaming
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
    } catch (error) {
      const thinkingMessageIndex = this.messages.length - 1;
      this.messages[thinkingMessageIndex].content = `Error: ${error.message}`;
      this.render();
    } finally {
      this.isStreaming = false;
    }
  }

  render() {
    term.clear();
    
    // Draw chat messages
    this.renderMessages();
    
    // Draw file search if active
    if (this.fileSearchActive) {
      this.renderFileSearch();
    }
    
    // Draw input area
    this.renderInput();
    
    term.moveTo(3, this.inputY + 1);
    term(this.input);
    term.moveTo(3 + this.input.length, this.inputY + 1);
  }

  renderMessages() {
    const title = this.scrollOffset > 0 
      ? `Chat (↑ ${this.scrollOffset} lines from bottom)`
      : this.autoScroll 
        ? 'Chat (auto-scroll)'
        : 'Chat';
    
    // Draw border and title
    term.moveTo(1, 1);
    term.cyan('┌' + '─'.repeat(this.width - 2) + '┐');
    term.moveTo(2, 1);
    term.cyan(title);
    
    // Calculate which messages to show
    const availableLines = this.chatHeight - 2; // Minus border lines
    const messagesToShow = this.getVisibleMessages(availableLines);
    
    let currentLine = 2;
    
    for (const msg of messagesToShow) {
      if (currentLine >= this.chatHeight) break;
      
      const timestamp = msg.timestamp.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      
      // Draw message header
      term.moveTo(1, currentLine);
      term.cyan('│');
      term.moveTo(3, currentLine);
      
      if (msg.role === 'user') {
        term.cyan(`[${timestamp}] ${msg.role}:`);
      } else {
        term.green(`[${timestamp}] ${msg.role}:`);
      }
      
      currentLine++;
      
      // Draw message content (word wrapped)
      const contentLines = this.wrapText(msg.content, this.width - 4);
      for (const line of contentLines) {
        if (currentLine >= this.chatHeight) break;
        
        term.moveTo(1, currentLine);
        term.cyan('│');
        term.moveTo(3, currentLine);
        
        if (msg.content === 'Thinking...' && this.isStreaming) {
          term.yellow('🤔 Thinking...');
        } else {
          term(line);
        }
        
        currentLine++;
      }
      
      currentLine++; // Empty line between messages
    }
    
    // Fill remaining lines with border
    for (let i = currentLine; i <= this.chatHeight; i++) {
      term.moveTo(1, i);
      term.cyan('│');
      term.moveTo(this.width, i);
      term.cyan('│');
    }
    
    // Bottom border
    term.moveTo(1, this.chatHeight + 1);
    term.cyan('└' + '─'.repeat(this.width - 2) + '┘');
  }

  renderFileSearch() {
    const searchY = this.chatHeight - 8;
    const searchHeight = 8;
    
    // Draw file search box
    term.moveTo(1, searchY);
    term.yellow('┌' + '─'.repeat(this.width - 2) + '┐');
    term.moveTo(2, searchY);
    term.yellow(`Files matching: ${this.fileSearchQuery}`);
    
    for (let i = 0; i < searchHeight - 2; i++) {
      const fileIndex = i;
      const line = searchY + 1 + i;
      
      term.moveTo(1, line);
      term.yellow('│');
      
      if (fileIndex < this.fileSearchResults.length) {
        const file = this.fileSearchResults[fileIndex];
        const isSelected = fileIndex === this.fileSearchSelected;
        
        term.moveTo(3, line);
        if (isSelected) {
          term.inverse(file);
        } else {
          term(file);
        }
      }
      
      term.moveTo(this.width, line);
      term.yellow('│');
    }
    
    term.moveTo(1, searchY + searchHeight - 1);
    term.yellow('└' + '─'.repeat(this.width - 2) + '┘');
  }

  renderInput() {
    const title = this.fileSearchActive
      ? 'Message (Ctrl+C to quit, Esc to close file search)'
      : 'Message (Ctrl+C to quit, ↑↓ to scroll, PgUp/PgDn/Home/End for navigation)';
    
    term.moveTo(1, this.inputY);
    term.green('┌' + '─'.repeat(this.width - 2) + '┐');
    term.moveTo(2, this.inputY);
    term.green(title);
    
    term.moveTo(1, this.inputY + 1);
    term.green('│');
    term.moveTo(this.width, this.inputY + 1);
    term.green('│');
    
    term.moveTo(1, this.inputY + 2);
    term.green('└' + '─'.repeat(this.width - 2) + '┘');
  }

  getVisibleMessages(availableLines) {
    if (this.scrollOffset === 0) {
      // Show most recent messages
      return this.messages.slice(-Math.floor(availableLines / 3));
    } else {
      // Show messages based on scroll offset
      const startIndex = Math.max(0, this.messages.length - this.scrollOffset - Math.floor(availableLines / 3));
      return this.messages.slice(startIndex, this.messages.length - this.scrollOffset);
    }
  }

  wrapText(text, width) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    for (const word of words) {
      if ((currentLine + word).length <= width) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    
    if (currentLine) lines.push(currentLine);
    return lines.length ? lines : [''];
  }

  cleanup() {
    term.hideCursor();
    term.clear();
    term.processExit(0);
  }
}

export function runApp() {
  const app = new TerminalApp();
  
  // Handle cleanup on exit
  process.on('exit', () => {
    try {
      app.cleanup();
    } catch (e) {
      // Ignore cleanup errors
    }
  });
  
  process.on('SIGINT', () => {
    try {
      app.cleanup();
    } catch (e) {
      // Ignore cleanup errors
    }
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    try {
      app.cleanup();
    } catch (e) {
      // Ignore cleanup errors
    }
    process.exit(0);
  });
}