import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import debugLogger from './debug-logger.js';

const { createElement: h } = React;

// Debug Window Component
const DebugWindow = ({ onClose }) => {
  const { exit } = useApp();
  const [logs, setLogs] = useState([]);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  
  // Handle keyboard input for debug window
  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      // Clear screen artifacts before closing
      process.stdout.write('\x1bc'); // Clear screen
      onClose();
    }
    
    if (key.upArrow) {
      setScrollOffset(prev => Math.min(logs.length - 1, prev + 1));
      setAutoScroll(false);
    }
    
    if (key.downArrow) {
      setScrollOffset(prev => {
        const newOffset = Math.max(0, prev - 1);
        if (newOffset === 0) {
          setAutoScroll(true);
        }
        return newOffset;
      });
    }
    
    if (key.pageUp) {
      setScrollOffset(prev => Math.min(logs.length - 1, prev + 10));
      setAutoScroll(false);
    }
    
    if (key.pageDown) {
      setScrollOffset(prev => {
        const newOffset = Math.max(0, prev - 10);
        if (newOffset === 0) {
          setAutoScroll(true);
        }
        return newOffset;
      });
    }
    
    if (key.home) {
      setScrollOffset(logs.length - 1);
      setAutoScroll(false);
    }
    
    if (key.end) {
      setScrollOffset(0);
      setAutoScroll(true);
    }
    
    if (input === 'c' && !key.ctrl) {
      // Clear logs
      debugLogger.clearLogs();
      setLogs([]);
      setScrollOffset(0);
      setAutoScroll(true);
    }
  });

  // Update logs periodically
  useEffect(() => {
    const updateLogs = () => {
      const newLogs = debugLogger.getLogs();
      setLogs(newLogs);
      
      // Auto-scroll to bottom if enabled
      if (autoScroll) {
        setScrollOffset(0);
      }
    };

    updateLogs();
    const interval = setInterval(updateLogs, 100);
    return () => clearInterval(interval);
  }, [autoScroll]);

  const getLogColor = (level) => {
    switch (level) {
      case 'error': return 'red';
      case 'warn': return 'yellow';
      case 'info': return 'blue';
      case 'debug': return 'gray';
      default: return 'white';
    }
  };

  const displayLogs = scrollOffset === 0 
    ? logs 
    : logs.slice(0, logs.length - scrollOffset);

  const title = autoScroll
    ? `Debug Console (${logs.length} logs) - Auto-scroll`
    : `Debug Console (${logs.length} logs) - Manual (↑${scrollOffset} from bottom)`;

  return h(Box, { flexDirection: 'column', height: '100vh', width: '100%' },
    h(Box, { borderStyle: 'single', borderColor: 'yellow', padding: 1, flexDirection: 'column', flexGrow: 1 },
      h(Text, { color: 'yellow', bold: true }, title),
      h(Box, { flexDirection: 'column', flexGrow: 1 },
        ...displayLogs.map((log, index) => {
          const timestamp = new Date(log.timestamp).toLocaleTimeString();
          const content = log.args ? `${log.message} ${log.args.join(' ')}` : log.message;
          
          return h(Box, { key: index, flexDirection: 'column', marginBottom: 0 },
            h(Text, { color: 'gray' }, `[${timestamp}] `),
            h(Text, { color: getLogColor(log.level) }, `[${log.level.toUpperCase()}] ${content}`)
          );
        })
      )
    ),
    
    h(Box, { justifyContent: 'center', padding: 0 },
      h(Text, { color: 'gray' }, 'ESC: close | ↑↓: scroll | PgUp/PgDn/Home/End: navigation | c: clear logs')
    )
  );
};

export default DebugWindow;