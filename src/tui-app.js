import blessed from 'blessed';
import { GrokClient, createChatMessages } from './api.js';
import { FileUtils } from './file-utils.js';

export class ChatMessage {
  constructor(role, content) {
    this.role = role;
    this.content = content;
    this.timestamp = new Date();
  }
}

export class App {
  constructor() {
    this.grokClient = new GrokClient();
    this.messages = [];
    this.input = '';
    this.inputCursor = 0;
    this.scrollOffset = 0;
    this.autoScroll = true;
    this.isStreaming = false;
    
    // File search state
    this.fileSearchActive = false;
    this.fileSearchQuery = '';
    this.fileSearchResults = [];
    this.fileSearchSelected = 0;
    
    this.setupScreen();
    this.setupWidgets();
    this.setupEventHandlers();
    
    // Add welcome message
    this.addMessage('assistant', 'Welcome to Grok CLI! Start typing to chat with Grok. Use @ to reference files.\n\n🔧 I have access to file system tools and can help you list, read, and write files when needed.');
  }

  setupScreen() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Grok CLI'
    });
  }

  setupWidgets() {
    // Chat messages box
    this.chatBox = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-3',
      content: '',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'cyan'
        }
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true
    });

    // File search box (initially hidden)
    this.fileSearchBox = blessed.list({
      parent: this.screen,
      top: '100%-11',
      left: 0,
      width: '100%',
      height: 8,
      items: [],
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'yellow'
        },
        selected: {
          bg: 'blue'
        }
      },
      keys: true,
      vi: true,
      hidden: true
    });

    // Input box
    this.inputBox = blessed.textbox({
      parent: this.screen,
      bottom: 1,
      left: 0,
      width: '100%',
      height: 3,
      inputOnFocus: true,
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'green'
        },
        focus: {
          border: {
            fg: 'cyan'
          }
        }
      }
    });

    // Helper text box
    this.helperBox = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: '',
      tags: true,
      style: {
        fg: 'grey'
      },
      align: 'center'
    });

    this.updateChatTitle();
    this.updateInputTitle();
  }

  setupEventHandlers() {
    // Global key handlers
    this.screen.key(['escape', 'q', 'C-c'], () => {
      if (this.fileSearchActive) {
        this.closeFileSearch();
      } else {
        return process.exit(0);
      }
    });

    // Input box handlers
    this.inputBox.key('enter', () => {
      if (this.fileSearchActive) {
        this.selectFile();
      } else {
        // Don't await here, just fire and forget
        this.submitMessage().catch(error => {
          console.error('Error submitting message:', error);
        });
      }
    });

    this.inputBox.on('keypress', (ch, key) => {
      if (!key) return;
      
      if (key.name === 'tab' && this.fileSearchActive) {
        this.selectFile();
      } else if (key.name === 'up' && this.fileSearchActive) {
        this.fileSearchPrevious();
      } else if (key.name === 'down' && this.fileSearchActive) {
        this.fileSearchNext();
      } else if (key.name === 'up' && !this.fileSearchActive) {
        this.scrollUp();
      } else if (key.name === 'down' && !this.fileSearchActive) {
        this.scrollDown();
      } else if (key.name === 'pageup') {
        this.scrollPageUp();
      } else if (key.name === 'pagedown') {
        this.scrollPageDown();
      } else if (key.name === 'home') {
        this.scrollToTop();
      } else if (key.name === 'end') {
        this.scrollToBottom();
      }
    });

    this.inputBox.on('value', (value) => {
      this.input = value;
      this.updateFileSearch().catch(error => {
        console.error('Error updating file search:', error);
      });
    });

    // File search handlers
    this.fileSearchBox.key(['enter'], () => {
      this.selectFile();
    });

    this.fileSearchBox.key(['escape'], () => {
      this.closeFileSearch();
    });

    // Focus input by default
    this.inputBox.focus();
  }

  addMessage(role, content) {
    const message = new ChatMessage(role, content);
    this.messages.push(message);
    this.updateChatDisplay();
    
    if (this.autoScroll) {
      this.scrollToBottom();
    }
  }

  updateChatDisplay() {
    const chatContent = this.messages.map(msg => {
      const timestamp = msg.timestamp.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      const roleColor = msg.role === 'user' ? 'cyan' : 'green';
      const header = `{${roleColor}-fg}{bold}[${timestamp}] ${msg.role}{/bold}{/${roleColor}-fg}`;
      
      // Handle "Thinking..." display
      let content = msg.content;
      if (content === 'Thinking...' && this.isStreaming) {
        content = '🤔 Thinking...';
      }
      
      return `${header}\n${content}\n`;
    }).join('\n');

    this.chatBox.setContent(chatContent);
    this.screen.render();
  }

  updateChatTitle() {
    const title = this.scrollOffset > 0 
      ? `Chat (↑ ${this.scrollOffset} lines from bottom)`
      : this.autoScroll 
        ? 'Chat (auto-scroll)'
        : 'Chat';
    this.chatBox.setLabel(title);
  }

  updateInputTitle() {
    this.inputBox.setLabel('Message');
    this.updateHelperText();
  }

  updateHelperText() {
    const helpText = this.fileSearchActive
      ? 'Ctrl+C: quit | Esc: close file search | Tab/Enter: select file'
      : 'Ctrl+C: quit | ↑↓: scroll | PgUp/PgDn/Home/End: navigation | @: reference files';
    this.helperBox.setContent(helpText);
  }

  async updateFileSearch() {
    // Check for @ symbol in input
    const atIndex = this.input.lastIndexOf('@');
    if (atIndex !== -1) {
      const query = this.input.substring(atIndex + 1);
      this.fileSearchQuery = query;
      this.fileSearchActive = true;
      
      // Search for files
      this.fileSearchResults = await FileUtils.searchFiles(query);
      this.fileSearchSelected = 0;
      
      // Update file search box
      this.fileSearchBox.setItems(this.fileSearchResults.map(file => file));
      this.fileSearchBox.select(0);
      this.fileSearchBox.setLabel(`Files matching: ${query}`);
      this.fileSearchBox.show();
      
      this.updateInputTitle();
      this.screen.render();
    } else {
      this.closeFileSearch();
    }
  }

  closeFileSearch() {
    this.fileSearchActive = false;
    this.fileSearchResults = [];
    this.fileSearchBox.hide();
    this.updateInputTitle();
    this.inputBox.focus();
    this.screen.render();
  }

  selectFile() {
    if (this.fileSearchActive && this.fileSearchResults.length > 0) {
      const selectedFile = this.fileSearchResults[this.fileSearchSelected];
      const fileName = selectedFile.split('/').pop();
      
      // Replace the @ query with the selected filename and add a space
      const atIndex = this.input.lastIndexOf('@');
      if (atIndex !== -1) {
        const newInput = this.input.substring(0, atIndex + 1) + fileName + ' ';
        this.inputBox.setValue(newInput);
        this.input = newInput;
      }
      
      this.closeFileSearch();
    }
  }

  fileSearchNext() {
    if (this.fileSearchResults.length > 0) {
      this.fileSearchSelected = (this.fileSearchSelected + 1) % this.fileSearchResults.length;
      this.fileSearchBox.select(this.fileSearchSelected);
      this.screen.render();
    }
  }

  fileSearchPrevious() {
    if (this.fileSearchResults.length > 0) {
      this.fileSearchSelected = this.fileSearchSelected === 0 
        ? this.fileSearchResults.length - 1
        : this.fileSearchSelected - 1;
      this.fileSearchBox.select(this.fileSearchSelected);
      this.screen.render();
    }
  }

  scrollUp() {
    this.scrollOffset += 1;
    this.autoScroll = false;
    this.chatBox.scroll(-1);
    this.updateChatTitle();
    this.screen.render();
  }

  scrollDown() {
    if (this.scrollOffset > 0) {
      this.scrollOffset -= 1;
      this.chatBox.scroll(1);
      
      if (this.scrollOffset === 0) {
        this.autoScroll = true;
      }
      
      this.updateChatTitle();
      this.screen.render();
    }
  }

  scrollPageUp() {
    this.scrollOffset += 10;
    this.autoScroll = false;
    this.chatBox.scroll(-10);
    this.updateChatTitle();
    this.screen.render();
  }

  scrollPageDown() {
    if (this.scrollOffset >= 10) {
      this.scrollOffset -= 10;
      this.chatBox.scroll(10);
    } else {
      this.scrollOffset = 0;
      this.chatBox.scrollTo(this.chatBox.getScrollHeight());
    }
    
    if (this.scrollOffset === 0) {
      this.autoScroll = true;
    }
    
    this.updateChatTitle();
    this.screen.render();
  }

  scrollToTop() {
    this.scrollOffset = Math.max(0, this.messages.length - 1);
    this.autoScroll = false;
    this.chatBox.scrollTo(0);
    this.updateChatTitle();
    this.screen.render();
  }

  scrollToBottom() {
    this.scrollOffset = 0;
    this.autoScroll = true;
    this.chatBox.scrollTo(this.chatBox.getScrollHeight());
    this.updateChatTitle();
    this.screen.render();
  }

  async submitMessage() {
    if (!this.input.trim() || this.isStreaming) {
      return;
    }

    const userInput = this.input.trim();
    
    console.log('Submitting message:', userInput); // Debug log
    
    // Clear input and close file search
    this.inputBox.clearValue();
    this.input = '';
    this.closeFileSearch();
    
    // Add user message
    this.addMessage('user', userInput);
    
    // No longer need local command handling - tools are now handled by AI SDK
    
    // Add "Thinking..." message
    this.addMessage('assistant', 'Thinking...');
    
    // Set streaming state
    this.isStreaming = true;
    
    try {
      console.log('Processing file references...'); // Debug log
      
      // Process file references
      const processedInput = await FileUtils.processFileReferences(userInput);
      
      console.log('Processed input:', processedInput); // Debug log
      
      // Prepare messages for API
      const systemMessage = {
        role: 'system',
        content: processedInput.includes('File:')
          ? 'You are a helpful AI assistant with access to file system tools. You can list files, read files, and write files on the local system. When analyzing files or code, provide your analysis and then ALWAYS end your response with a brief closing message that encourages the user to continue the conversation, such as "What would you like to explore next?" or "Feel free to ask me anything else!" or "Any other questions about this code?" This closing message is REQUIRED for every response, regardless of content length.'
          : 'You are a helpful AI assistant with access to file system tools. You can list files, read files, and write files on the local system to help with development tasks. Use your tools when appropriate to help the user. At the end of each response, include a brief closing message that encourages the user to continue the conversation, such as "What would you like to explore next?" or "Feel free to ask me anything else!" or similar friendly prompts.'
      };
      
      // Create conversation messages (exclude the "Thinking..." message)
      const conversationMessages = this.messages
        .filter(msg => msg.content !== 'Thinking...')
        .map(msg => ({
          role: msg.role,
          content: msg.role === 'user' && msg.content === userInput ? processedInput : msg.content
        }));
      
      const allMessages = [systemMessage, ...conversationMessages];
      
      console.log('Sending to API with', allMessages.length, 'messages'); // Debug log
      
      // Stream the response with tools
      let responseContent = '';
      const streamGenerator = this.grokClient.chatStreamWithTools(allMessages);
      
      // Update the "Thinking..." message with streaming content
      const thinkingMessageIndex = this.messages.length - 1;
      
      console.log('Starting to stream response...'); // Debug log
      
      for await (const chunk of streamGenerator) {
        if (chunk) {
          responseContent += chunk;
          
          // Update the last assistant message
          this.messages[thinkingMessageIndex].content = responseContent;
          this.updateChatDisplay();
          
          // Small delay to make streaming visible
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      console.log('Streaming complete. Final response length:', responseContent.length); // Debug log
      
    } catch (error) {
      console.error('Submit message error:', error); // Debug log
      
      // Update the thinking message with error
      const thinkingMessageIndex = this.messages.length - 1;
      this.messages[thinkingMessageIndex].content = `Error: ${error.message}`;
      this.updateChatDisplay();
    } finally {
      this.isStreaming = false;
      console.log('Streaming state set to false'); // Debug log
    }
  }

}

export async function runApp() {
  const app = new App();
  
  // Render the screen
  app.screen.render();
  
  // Keep the process alive
  return new Promise(() => {
    // The app will handle its own lifecycle
  });
}