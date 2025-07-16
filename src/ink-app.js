#!/usr/bin/env node
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { GrokClient } from './api.js';
import { FileUtils } from './file-utils.js';
import DebugWindow from './debug-window.js';
import debugLogger from './debug-logger.js';
import CommandSelector from './command-selector.js';
import fs from 'node:fs/promises';
import * as Sentry from '@sentry/node';

const { logger } = Sentry;

const { createElement: h } = React;

// Chat Message Lines Generator
const getMessageLines = (message, isLast, isStreaming) => {
  const lines = [];
  
  const timestamp = message.timestamp.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });

  const roleColor = message.role === 'user' ? 'cyan' : (message.role === 'system' ? 'yellow' : 'green');
  
  const displayRole = message.role === 'assistant' ? 'Grok' : (message.role === 'system' ? 'System' : message.role);
  
  let displayContent = message.content;
  
  // Special handling for thinking messages during streaming
  if (isLast && isStreaming && THINKING_MESSAGES.includes(displayContent)) {
    displayContent = message.content; // Already set, but can add animation if desired
  }

  lines.push({ type: 'text', text: `[${timestamp}] `, color: 'gray', bold: false });
  lines.push({ type: 'text', text: `${displayRole}:`, color: roleColor, bold: true });

  const contentColor = message.isWelcome ? 'whiteBright' : undefined; // undefined for default
  const contentBold = message.isWelcome;
  const contentLines = displayContent.split('\n');
  contentLines.forEach(line => {
    if (line.trim() === '') {
      lines.push({ type: 'spacer' });
    } else {
      lines.push({ type: 'text', text: line, color: contentColor, bold: contentBold });
    }
  });

  // Add separator for system messages
  if (message.role === 'system') {
    lines.push({ type: 'text', text: '---', color: 'gray', bold: false });
  }

  // Add extra spacing: one blank line between messages, two after welcome/banner
  lines.push({ type: 'spacer' });
  if (message.isWelcome) {
    lines.push({ type: 'spacer' });
  }

  return lines;
};

// File Search Component (limited to 5 results)
const FileSearch = ({ results, query, onSelect }) => {
  const displayedResults = results.slice(0, 5);
  const items = displayedResults.map((file) => ({
    label: file,
    value: file
  }));

  return h(Box, { borderStyle: 'single', borderColor: 'yellow', padding: 1, flexDirection: 'column' },
    h(Text, { color: 'yellow' }, `Files matching: ${query}`),
    items.length > 0 
      ? h(SelectInput, { items, onSelect })
      : h(Text, { color: 'yellow' }, 'No files found'),
    results.length > 5 && h(Text, { color: 'yellow' }, `+ ${results.length - 5} more, refine your query...`)
  );
};

// Main Chat Display Component with line-based scrolling
const ChatDisplay = ({ messages, scrollOffset, setScrollOffset, isStreaming }) => {
  const { stdout } = useStdout();
  const terminalHeight = stdout.rows || 24;
  const viewportHeight = Math.max(5, terminalHeight - 15); // Conservative estimate to avoid overflow

  const prevTotalLines = useRef(0);

  const allLines = useMemo(() => {
    let lines = [];
    messages.forEach((message, index) => {
      const isLast = index === messages.length - 1;
      lines = lines.concat(getMessageLines(message, isLast, isStreaming));
    });
    return lines;
  }, [messages, isStreaming]);

  const totalLines = allLines.length;

  // Adjust scroll offset when new lines are added (e.g., during streaming)
  useEffect(() => {
    if (scrollOffset > 0) {
      const delta = totalLines - prevTotalLines.current;
      if (delta > 0) {
        setScrollOffset(prev => prev + delta);
      }
    }
    prevTotalLines.current = totalLines;
  }, [totalLines, scrollOffset, setScrollOffset]);

  const maxOffset = Math.max(0, totalLines - viewportHeight);
  const effectiveOffset = Math.min(Math.max(0, scrollOffset), maxOffset);
  const startLine = totalLines - viewportHeight - effectiveOffset;
  const actualStart = Math.max(0, startLine);
  const visibleLines = allLines.slice(actualStart, actualStart + viewportHeight);

  return h(Box, { flexDirection: 'column', flexGrow: 1, paddingLeft: 2 },
    ...visibleLines.map((line, index) => {
      const key = `${actualStart + index}`;
      if (line.type === 'spacer') {
        return h(Box, { key, height: 1 });
      } else {
        return h(Text, { 
          key,
          color: line.color,
          bold: line.bold
        }, line.text);
      }
    })
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
  const { stdout } = useStdout();
  const terminalHeight = stdout.rows || 24;
  const viewportHeight = Math.max(5, terminalHeight - 15); // Used for page navigation
  
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

  logger.info('Grok CLI App initialized');

  // Enhanced cleanup for edge cases
  useEffect(() => {
    const cleanup = async () => {
      await grokClientRef.current.cleanup();
      logger.info('App cleanup performed');
    };

    const handleExit = () => {
      cleanup().finally(() => process.exit(0));
    };

    const handleError = (err) => {
      logger.error('Uncaught exception', { error: err.message });
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
      logger.info('App exited via Ctrl+C');
    }
    
    if (key.escape && fileSearchActive) {
      setFileSearchActive(false);
      setFileSearchResults([]);
      logger.debug('File search closed via Escape');
    }
    
    if (key.escape && commandSearchActive) {
      setCommandSearchActive(false);
      setCommandSearchQuery('');
      logger.debug('Command search closed via Escape');
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
        logger.warn('Generation cancelled by user');
      }
      
      setLastEscapeTime(now);
    }
    
    // Handle Tab key for file autocomplete
    if (key.tab && fileSearchActive && fileSearchResults.length > 0) {
      handleFileSelect({ value: fileSearchResults[0] });
      logger.debug('File selected via Tab');
      return;
    }
    
    if (key.upArrow && !fileSearchActive && !commandSearchActive) {
      setScrollOffset(prev => prev + 1);
    }
    
    if (key.downArrow && !fileSearchActive && !commandSearchActive) {
      setScrollOffset(prev => prev - 1);
    }
    
    if (key.pageUp) {
      setScrollOffset(prev => prev + viewportHeight);
    }
    
    if (key.pageDown) {
      setScrollOffset(prev => prev - viewportHeight);
    }
    
    if (key.home) {
      setScrollOffset(Infinity);
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
          logger.info('File search activated', { query, resultsCount: results.length });
        } else {
          setFileSearchActive(false);
          setFileSearchResults([]);
          setCommandSearchActive(false);
          setCommandSearchQuery('');
          logger.debug('File search deactivated due to space in query');
        }
      } 
      // Check for command search (/)
      else if (slashIndex !== -1 && (atIndex === -1 || slashIndex > atIndex)) {
        const query = input.substring(slashIndex + 1);
        setCommandSearchQuery(query);
        setCommandSearchActive(true);
        setFileSearchActive(false);
        setFileSearchResults([]);
        logger.info('Command search activated', { query });
      } 
      // No search active
      else {
        setFileSearchActive(false);
        setFileSearchResults([]);
        setCommandSearchActive(false);
        setCommandSearchQuery('');
        logger.debug('No search active');
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
    logger.debug(logger.fmt`Added message: ${role} - ${content.substring(0, 50)}`);
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
    logger.info('File selected', { fileName });
  };

  const handleCommandSelect = async (command) => {
    // Execute the command immediately
    if (command === 'debug') {
      setDebugWindowOpen(true);
      logger.info('Debug command selected');
    } else if (command === 'clear') {
      setMessages([initialWelcome]);
      addMessage('system', 'Conversation history cleared.');
      logger.info('Clear command executed');
    } else if (command === 'save') {
      try {
        const chatData = JSON.stringify(messages, (key, value) => {
          if (key === 'timestamp') return value.toISOString();
          return value;
        }, 2);
        await fs.writeFile('grok-conversation.json', chatData);
        addMessage('system', 'Conversation saved to grok-conversation.json in the current directory.');
        logger.info('Save command executed successfully');
      } catch (error) {
        addMessage('system', `Error saving conversation: ${error.message}`);
        logger.error('Error saving conversation', { error: error.message });
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
    logger.info('User input submitted', { input: userInput });
    
    // Handle slash commands (fallback for direct typing)
    if (userInput.startsWith('/')) {
      const parts = userInput.substring(1).split(' ');
      const command = parts[0].toLowerCase();
      
      if (command === 'debug') {
        setDebugWindowOpen(true);
        setInput('');
        logger.info('/debug command executed');
        return;
      } else if (command === 'clear') {
        setMessages([initialWelcome]);
        addMessage('system', 'Conversation history cleared.');
        setInput('');
        logger.info('/clear command executed');
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
          logger.info('/save command executed', { filename });
        } catch (error) {
          addMessage('system', `Error saving conversation: ${error.message}`);
          logger.error('Error in /save command', { error: error.message });
        }
        setInput('');
        return;
      }
      
      // Add more commands here in the future
      addMessage('system', `Unknown command: ${userInput}. Available commands: /debug, /clear, /save [filename]`);
      setInput('');
      logger.warn('Unknown command', { command: userInput });
      return;
    }

    setInput('');
    setFileSearchActive(false);
    setFileSearchResults([]);
    setCommandSearchActive(false);
    setCommandSearchQuery('');

    setIsStreaming(true);
    logger.info('Streaming started');

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
          ? 'You are Grok, a helpful AI built by xAI with access to file system tools. You can list files, read files, and write files on the local system. When analyzing files or code, provide your analysis and then ALWAYS end your response with a brief closing message that encourages the user to continue the conversation. For multi-step tasks, structure your thinking and responses using markdown task lists with checkboxes. Mark completed steps with ✅.'
          : 'You are Grok, a helpful AI built by xAI with access to file system tools. You can list files, read files, and write files on the local system to help with development tasks. Use your tools when appropriate to help the user. At the end of each response, include a brief closing message that encourages the user to continue the conversation. For multi-step tasks, structure your thinking and responses using markdown task lists with checkboxes. Mark completed steps with ✅.'
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
            logger.warn('Streaming aborted during chunk processing');
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
        logger.info('Streaming completed successfully');
        
      } catch (streamError) {
        // Update thinking message with error
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1].content = `Error during streaming: ${streamError.message}`;
          return updated;
        });
        logger.error('Error during streaming', { error: streamError.message });
      }

    } catch (error) {
      // Update thinking message with error
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1].content = `Error: ${error.message}`;
        return updated;
      });
      logger.error('Error in handleSubmit', { error: error.message });
    } finally {
      setIsStreaming(false);
      setAbortController(null);
      logger.info('Streaming ended');
    }
  };

  // Show debug window if open
  if (debugWindowOpen) {
    return h(DebugWindow, { 
      onClose: () => {
        setDebugWindowOpen(false);
        logger.info('Debug window closed');
      }
    });
  }

  return h(Box, { flexDirection: 'column', height: '100vh', width: '100%' },
    h(ChatDisplay, { 
      messages, 
      scrollOffset,
      setScrollOffset,
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