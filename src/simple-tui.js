import readline from 'readline';
import { GrokClient } from './api.js';
import { FileUtils } from './file-utils.js';

export class SimpleChatApp {
  constructor() {
    this.grokClient = new GrokClient();
    this.messages = [];
    this.isStreaming = false;
    
    // Setup readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> '
    });
    
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.rl.on('line', async (input) => {
      await this.handleInput(input.trim());
    });

    this.rl.on('close', () => {
      console.log('\nGoodbye!');
      process.exit(0);
    });

    // Handle Ctrl+C
    this.rl.on('SIGINT', () => {
      console.log('\nGoodbye!');
      process.exit(0);
    });
  }

  addMessage(role, content) {
    const message = {
      role,
      content,
      timestamp: new Date()
    };
    this.messages.push(message);
  }

  formatMessage(message) {
    const time = message.timestamp.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const roleColor = message.role === 'user' ? '\x1b[36m' : '\x1b[32m'; // cyan for user, green for assistant
    const reset = '\x1b[0m';
    
    return `${roleColor}[${time}] ${message.role}:${reset}\n${message.content}\n`;
  }

  displayMessage(message) {
    console.log(this.formatMessage(message));
  }

  async handleInput(input) {
    if (!input || this.isStreaming) {
      this.rl.prompt();
      return;
    }

    // Special commands
    if (input === '/quit' || input === '/exit') {
      console.log('Goodbye!');
      process.exit(0);
    }

    if (input === '/help') {
      this.showHelp();
      this.rl.prompt();
      return;
    }

    // Add user message
    const userMessage = { role: 'user', content: input, timestamp: new Date() };
    this.addMessage('user', input);
    this.displayMessage(userMessage);

    // Show thinking message
    console.log('\x1b[32m🤔 Thinking...\x1b[0m');
    this.isStreaming = true;

    try {
      // Process file references
      const processedInput = await FileUtils.processFileReferences(input);
      
      // Prepare messages for API
      const systemMessage = {
        role: 'system',
        content: processedInput.includes('File:')
          ? 'You are a helpful AI assistant. When analyzing files or code, provide your analysis and then ALWAYS end your response with a brief closing message that encourages the user to continue the conversation.'
          : 'You are a helpful AI assistant. At the end of each response, include a brief closing message that encourages the user to continue the conversation.'
      };

      // Create conversation messages
      const conversationMessages = this.messages.map(msg => ({
        role: msg.role,
        content: msg.role === 'user' && msg.content === input ? processedInput : msg.content
      }));

      const allMessages = [systemMessage, ...conversationMessages];

      // Clear the "thinking" line
      process.stdout.write('\r\x1b[K');

      // Start assistant response
      const assistantMessage = { role: 'assistant', content: '', timestamp: new Date() };
      const time = assistantMessage.timestamp.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      
      console.log(`\x1b[32m[${time}] assistant:\x1b[0m`);

      // Stream the response
      let responseContent = '';
      const streamGenerator = this.grokClient.chatStream(allMessages);

      for await (const chunk of streamGenerator) {
        if (chunk) {
          responseContent += chunk;
          process.stdout.write(chunk);
        }
      }

      // Add final newline and store the complete message
      console.log('\n');
      assistantMessage.content = responseContent;
      this.addMessage('assistant', responseContent);

    } catch (error) {
      console.log(`\x1b[31mError: ${error.message}\x1b[0m\n`);
    } finally {
      this.isStreaming = false;
      this.rl.prompt();
    }
  }

  showHelp() {
    console.log(`
\x1b[36mGrok CLI Help:\x1b[0m
- Type your message and press Enter to chat
- Use @filename to reference files (e.g., @package.json)
- Commands:
  /help - Show this help
  /quit or /exit - Exit the application
  Ctrl+C - Exit the application

\x1b[33mFile referencing examples:\x1b[0m
- @main.js - Include main.js file
- @src/api - Search for files matching "api" in src directory
    `);
  }

  start() {
    console.log('\x1b[36m' + '='.repeat(50) + '\x1b[0m');
    console.log('\x1b[36m          Welcome to Grok CLI!\x1b[0m');
    console.log('\x1b[36m' + '='.repeat(50) + '\x1b[0m');
    console.log('Start typing to chat with Grok. Use @filename to reference files.');
    console.log('Type /help for more commands.\n');
    
    this.rl.prompt();
  }
}

export function runApp() {
  const app = new SimpleChatApp();
  app.start();
}