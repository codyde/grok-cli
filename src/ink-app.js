#!/usr/bin/env node
import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { GrokClient } from './api.js';
import { FileUtils } from './file-utils.js';
import DebugWindow from './debug-window.js';
import debugLogger from './debug-logger.js';
import CommandSelector from './command-selector.js';
import fs from 'node:fs/promises';

const { createElement: h } = React;

// Chat Message Component
const ChatMessage = ({ message, isStreaming }) => {
  const timestamp = message.timestamp.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });

  const roleColor = message.role === 'user' ? 'cyan' : 'green';
  
  let displayContent = message.content;
  // Display the thinking message if it's currently streaming and content matches any thinking message
  if (isStreaming && THINKING_MESSAGES.includes(message.content)) {
    displayContent = message.content;
  }

  // Special styling for welcome message with ASCII art
  if (message.isWelcome) {
    return h(Box, { flexDirection: 'column', marginBottom: 1 },
      h(Text, { color: 'gray' }, `[${timestamp}] `),
      h(Text, { color: roleColor, bold: true }, `${message.role}:`),
      h(Text, { color: 'whiteBright', bold: true }, displayContent)
    );
  }

  return h(Box, { flexDirection: 'column', marginBottom: 1 },
    h(Text, { color: 'gray' }, `[${timestamp}] `),
    h(Text, { color: roleColor, bold: true }, `${message.role}:`),
    h(Text, null, displayContent)
  );
};

// File Search Component
const FileSearch = ({ results, query, onSelect }) => {
  const items = results.map((file) => ({
    label: file,
    value: file
  }));

  return h(Box, { borderStyle: 'single', borderColor: 'yellow', padding: 1, flexDirection: 'column' },
    h(Text, { color: 'yellow' }, `Files matching: ${query}`),
    items.length > 0 
      ? h(SelectInput, { items, onSelect })
      : h(Text, { color: 'yellow' }, 'No files found')
  );
};

// Main Chat Display Component
const ChatDisplay = ({ messages, scrollOffset, isStreaming }) => {
  const totalMessages = messages.length;
  const displayMessages = scrollOffset === 0 
    ? messages 
    : messages.slice(0, totalMessages - scrollOffset);

  const title = scrollOffset > 0 
    ? `Chat (↑ ${scrollOffset} messages from bottom) - ${displayMessages.length}/${totalMessages}`
    : `Chat (auto-scroll) - ${totalMessages} messages`;

  return h(Box, { borderStyle: 'single', borderColor: 'cyan', padding: 1, flexDirection: 'column', flexGrow: 1 },
    h(Text, { color: 'cyan' }, title),
    h(Box, { flexDirection: 'column', flexGrow: 1 },
      ...displayMessages.map((message, index) =>
        h(ChatMessage, { 
          key: `${message.timestamp.getTime()}-${index}`,
          message, 
          isStreaming: isStreaming && index === displayMessages.length - 1 && scrollOffset === 0
        })
      )
    )
  );
};

// Input Component
const InputBox = ({ value, onChange, onSubmit, fileSearchActive }) => {
  return h(Box, { borderStyle: 'single', borderColor: 'green', padding: 1, flexDirection: 'column' },
    h(Text, { color: 'green' }, 'Message'),
    h(TextInput, {
      value,
      onChange,
      onSubmit,
      placeholder: 'Type your message...'
    })
  );
};

// Helper Text Component
const HelperText = ({ fileSearchActive, commandSearchActive, isStreaming }) => {
  let helpText;
  
  if (fileSearchActive) {
    helpText = 'Ctrl+C: quit | Esc: close file search | Tab/Enter: select file';
  } else if (commandSearchActive) {
    helpText = 'Ctrl+C: quit | Esc: close command search | Tab/Enter: select command';
  } else if (isStreaming) {
    helpText = 'Ctrl+C: quit | Esc Esc: cancel generation | ↑↓: scroll while not streaming';
  } else {
    helpText = 'Ctrl+C: quit | ↑↓: scroll | PgUp/PgDn/Home/End: navigation | @: reference files | /: commands';
  }

  return h(Box, { justifyContent: 'center', padding: 0 },
    h(Text, { color: 'gray' }, helpText)
  );
};

// ASCII Art for GROK-4
const GROK_ASCII = `
 ██████╗ ██████╗  ██████╗ ██╗  ██╗      ██╗  ██╗
██╔════╝ ██╔══██╗██╔═══██╗██║ ██╔╝      ██║  ██║
██║  ███╗██████╔╝██║   ██║█████╔╝ █████╗██████╔╝
██║   ██║██╔══██╗██║   ██║██╔═██╗ ╚════╝╚═══██╔╝
╚██████╔╝██║  ██║╚██████╔╝██║  ██╗           ██║
 ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝           ╚═╝
`;

// Quirky thinking messages
const THINKING_MESSAGES = [
  "🤔 Thinking...",
  "🧠 Processing neural pathways...",
  "⚡ Sparking some synapses...",
  "🎯 Consulting the digital oracle...",
  "🚀 Launching thought rockets...",
  "🎪 Juggling ideas in my head...",
  "🔮 Gazing into the crystal ball...",
  "🎲 Rolling the dice of wisdom...",
  "⚙️ Cranking the thought machine...",
  "🌟 Channeling cosmic insights...",
  "🎭 Putting on my thinking cap...",
  "🎨 Painting thoughts with pixels...",
  "🎵 Composing a symphony of ideas...",
  "🏗️ Building castles in the cloud...",
  "🧩 Solving the puzzle of existence...",
  "🎪 Performing mental gymnastics...",
  "🚂 All aboard the thought train...",
  "🎯 Aiming for the perfect answer...",
  "🌊 Swimming in seas of data...",
  "🎪 Conjuring digital magic..."
];

// Main App Component
const App = () => {
  const { exit } = useApp();
  
  const initialWelcome = {
    role: 'assistant',
    content: GROK_ASCII + '\n\nWelcome to Grok CLI! Start typing to chat with Grok. Use @ to reference files.\n\n🔧 I have access to file system tools and can help you list, read, and write files when needed.',
    timestamp: new Date(),
    isWelcome: true
  };

  const [messages, setMessages] = useState([initialWelcome]);
  const [input, setInput] = useState('');
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [fileSearchActive, setFileSearchActive] = useState(false);
  const [fileSearchResults, setFileSearchResults] = useState([]);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [commandSearchActive, setCommandSearchActive] = useState(false);
  const [commandSearchQuery, setCommandSearchQuery] = useState('');
  const [thinkingMessageIndex, setThinkingMessageIndex] = useState(0);
  const [debugWindowOpen, setDebugWindowOpen] = useState(false);
  const [lastEscapeTime, setLastEscapeTime] = useState(0);
  const [abortController, setAbortController] = useState(null);
  
  const grokClientRef = useRef(new GrokClient());
  const searchTimeout = useRef(null);

  // Enhanced cleanup for edge cases
  useEffect(() => {
    const cleanup = async () => {
      await grokClientRef.current.cleanup();
    };

    const handleExit = () => {
      cleanup().finally(() => process.exit(0));
    };

    const handleError = (err) => {
      console.error('Uncaught exception:', err);
      cleanup().finally(() => process.exit(1));
    };

    process.on('SIGINT', handleExit);
    process.on('SIGTERM', handleExit);
    process.on('uncaughtException', handleError);
    process.on('unhandledRejection', handleError);

    return () => {
      process.off('SIGINT', handleExit);
      process.off('SIGTERM', handleExit);
      process.off('uncaughtException', handleError);
      process.off('unhandledRejection', handleError);
      cleanup();
    };
  }, []);

  // Handle keyboard input
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      // Clean exit
      grokClientRef.current.cleanup();
      process.stdout.write('\x1b[?1049l'); // Exit alternate screen buffer
      exit();
    }
    
    if (key.escape && fileSearchActive) {
      setFileSearchActive(false);
      setFileSearchResults([]);
    }
    
    if (key.escape && commandSearchActive) {
      setCommandSearchActive(false);
      setCommandSearchQuery('');
    }
    
    // Handle double escape to cancel generation
    if (key.escape && !fileSearchActive && !commandSearchActive) {
      const now = Date.now();
      const timeDiff = now - lastEscapeTime;
      
      if (timeDiff < 500 && isStreaming && abortController) {
        // Double escape within 500ms while streaming - cancel generation
        abortController.abort();
        setAbortController(null);
        setIsStreaming(false);
        
        // Update the last message to show it was cancelled
        setMessages(prev => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[updated.length - 1].content += '\n\n[Generation cancelled by user]';
          }
          return updated;
        });
      }
      
      setLastEscapeTime(now);
    }
    
    // Handle Tab key for file autocomplete
    if (key.tab && fileSearchActive && fileSearchResults.length > 0) {
      handleFileSelect({ value: fileSearchResults[0] });
      return;
    }
    
    if (key.upArrow && !fileSearchActive && !commandSearchActive) {
      setScrollOffset(prev => Math.min(messages.length - 1, prev + 1));
    }
    
    if (key.downArrow && !fileSearchActive && !commandSearchActive) {
      setScrollOffset(prev => Math.max(0, prev - 1));
    }
    
    if (key.pageUp) {
      setScrollOffset(prev => Math.min(messages.length - 1, prev + 10));
    }
    
    if (key.pageDown) {
      setScrollOffset(prev => Math.max(0, prev - 10));
    }
    
    if (key.home) {
      setScrollOffset(messages.length - 1);
    }
    
    if (key.end) {
      setScrollOffset(0);
    }
  });

  // Debounced update for file search and command search
  useEffect(() => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = setTimeout(async () => {
      const atIndex = input.lastIndexOf('@');
      const slashIndex = input.lastIndexOf('/');
      
      // Check for file search (@)
      if (atIndex !== -1 && (slashIndex === -1 || atIndex > slashIndex)) {
        const query = input.substring(atIndex + 1);
        
        // Don't activate search if the query contains a space (completed file reference)
        if (!query.includes(' ')) {
          setFileSearchQuery(query);
          setFileSearchActive(true);
          setCommandSearchActive(false);
          
          const results = await FileUtils.searchFiles(query);
          setFileSearchResults(results);
        } else {
          setFileSearchActive(false);
          setFileSearchResults([]);
          setCommandSearchActive(false);
          setCommandSearchQuery('');
        }
      } 
      // Check for command search (/)
      else if (slashIndex !== -1 && (atIndex === -1 || slashIndex > atIndex)) {
        const query = input.substring(slashIndex + 1);
        setCommandSearchQuery(query);
        setCommandSearchActive(true);
        setFileSearchActive(false);
        setFileSearchResults([]);
      } 
      // No search active
      else {
        setFileSearchActive(false);
        setFileSearchResults([]);
        setCommandSearchActive(false);
        setCommandSearchQuery('');
      }
    }, 300); // 300ms debounce

    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [input]);

  const addMessage = (role, content) => {
    const message = {
      role,
      content,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, message]);
    setScrollOffset(0); // Auto-scroll to bottom
  };

  const handleFileSelect = (item) => {
    const fileName = item.value.split('/').pop();
    const atIndex = input.lastIndexOf('@');
    if (atIndex !== -1) {
      // Simply replace from @ to end of current query with @filename + space
      const beforeAt = input.substring(0, atIndex);
      const newInput = beforeAt + '@' + fileName + ' ';
      setInput(newInput);
    }
    setFileSearchActive(false);
    setFileSearchResults([]);
  };

  const handleCommandSelect = async (command) => {
    // Execute the command immediately
    if (command === 'debug') {
      setDebugWindowOpen(true);
    } else if (command === 'clear') {
      setMessages([initialWelcome]);
      addMessage('system', 'Conversation history cleared.');
    } else if (command === 'save') {
      try {
        const chatData = JSON.stringify(messages, (key, value) => {
          if (key === 'timestamp') return value.toISOString();
          return value;
        }, 2);
        await fs.writeFile('grok-conversation.json', chatData);
        addMessage('system', 'Conversation saved to grok-conversation.json in the current directory.');
      } catch (error) {
        addMessage('system', `Error saving conversation: ${error.message}`);
      }
    }
    
    // Clear input and command search
    setInput('');
    setCommandSearchActive(false);
    setCommandSearchQuery('');
  };

  const handleSubmit = async () => {
    if (!input.trim() || isStreaming || fileSearchActive || commandSearchActive) {
      return;
    }

    const userInput = input.trim();
    
    // Handle slash commands (fallback for direct typing)
    if (userInput.startsWith('/')) {
      const parts = userInput.substring(1).split(' ');
      const command = parts[0].toLowerCase();
      
      if (command === 'debug') {
        setDebugWindowOpen(true);
        setInput('');
        return;
      } else if (command === 'clear') {
        setMessages([initialWelcome]);
        addMessage('system', 'Conversation history cleared.');
        setInput('');
        return;
      } else if (command === 'save') {
        try {
          const filename = parts[1] || 'grok-conversation.json';
          const chatData = JSON.stringify(messages, (key, value) => {
            if (key === 'timestamp') return value.toISOString();
            return value;
          }, 2);
          await fs.writeFile(filename, chatData);
          addMessage('system', `Conversation saved to ${filename}.`);
        } catch (error) {
          addMessage('system', `Error saving conversation: ${error.message}`);
        }
        setInput('');
        return;
      }
      
      // Add more commands here in the future
      addMessage('system', `Unknown command: ${userInput}. Available commands: /debug, /clear, /save [filename]`);
      setInput('');
      return;
    }

    setInput('');
    setFileSearchActive(false);
    setFileSearchResults([]);
    setCommandSearchActive(false);
    setCommandSearchQuery('');

    setIsStreaming(true);

    // Create abort controller for this request
    const controller = new AbortController();
    setAbortController(controller);

    try {
      // Process file references FIRST
      const processedInput = await FileUtils.processFileReferences(userInput);
      
      // Add user message
      addMessage('user', userInput);
      
      // Add thinking message with cycling/random selection
      const thinkingMessage = THINKING_MESSAGES[thinkingMessageIndex % THINKING_MESSAGES.length];
      setThinkingMessageIndex(prev => prev + 1);
      addMessage('assistant', thinkingMessage);
      
      // Prepare messages for API - get clean conversation history
      const systemMessage = {
        role: 'system',
        content: processedInput.includes('File:')
          ? 'You are a helpful AI assistant with access to file system tools. You can list files, read files, and write files on the local system. When analyzing files or code, provide your analysis and then ALWAYS end your response with a brief closing message that encourages the user to continue the conversation.'
          : 'You are a helpful AI assistant with access to file system tools. You can list files, read files, and write files on the local system to help with development tasks. Use your tools when appropriate to help the user. At the end of each response, include a brief closing message that encourages the user to continue the conversation.'
      };

      // Get all messages except thinking messages and use processedInput for current user message
      const conversationHistory = messages
        .filter(msg => !THINKING_MESSAGES.includes(msg.content) && !msg.isWelcome)
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));

      // Add the current user message with processed input for API
      conversationHistory.push({
        role: 'user',
        content: processedInput
      });

      const allMessages = [systemMessage, ...conversationHistory];

      // Use native XAI streaming with batched updates
      try {
        const streamGenerator = grokClientRef.current.streamWithTools(allMessages, controller.signal);
        let responseContent = '';
        
        // Set up interval for batched updates
        const updateInterval = setInterval(() => {
          if (responseContent) {
            setMessages(prev => {
              const updated = [...prev];
              const lastMessage = updated[updated.length - 1];
              if (THINKING_MESSAGES.includes(lastMessage.content) || 
                  lastMessage.role === 'assistant') {
                updated[updated.length - 1].content = responseContent;
              }
              return updated;
            });
          }
        }, 200); // Update every 200ms

        for await (const chunk of streamGenerator) {
          // Check if we were aborted
          if (controller.signal.aborted) {
            break;
          }
          
          if (chunk) {
            responseContent += chunk;
          }
        }
        
        // Clear interval and do final update
        clearInterval(updateInterval);
        setMessages(prev => {
          const updated = [...prev];
          const lastMessage = updated[updated.length - 1];
          if (THINKING_MESSAGES.includes(lastMessage.content) || 
              lastMessage.role === 'assistant') {
            updated[updated.length - 1].content = responseContent;
          }
          return updated;
        });
        
      } catch (streamError) {
        // Update thinking message with error
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1].content = `Error during streaming: ${streamError.message}`;
          return updated;
        });
      }

    } catch (error) {
      // Update thinking message with error
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1].content = `Error: ${error.message}`;
        return updated;
      });
    } finally {
      setIsStreaming(false);
      setAbortController(null);
    }
  };

  // Show debug window if open
  if (debugWindowOpen) {
    return h(DebugWindow, { 
      onClose: () => setDebugWindowOpen(false) 
    });
  }

  return h(Box, { flexDirection: 'column', height: '100vh', width: '100%' },
    h(ChatDisplay, { 
      messages, 
      scrollOffset, 
      isStreaming
    }),
    
    fileSearchActive && fileSearchResults.length > 0 && h(FileSearch, {
      results: fileSearchResults,
      query: fileSearchQuery,
      onSelect: handleFileSelect
    }),
    
    commandSearchActive && h(CommandSelector, {
      query: commandSearchQuery,
      onSelect: handleCommandSelect
    }),
    
    h(InputBox, {
      value: input,
      onChange: setInput,
      onSubmit: handleSubmit,
      fileSearchActive: fileSearchActive || commandSearchActive
    }),
    
    h(HelperText, { fileSearchActive, commandSearchActive, isStreaming })
  );
};

export default App;