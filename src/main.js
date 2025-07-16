#!/usr/bin/env node

import '../instrument.js';
import React from 'react';
import { render } from 'ink';
import dotenv from 'dotenv';
import App from './ink-app.js';

// Load environment variables from .env file
dotenv.config();

function main() {
  // Check if XAI_API_KEY is set
  if (!process.env.XAI_API_KEY) {
    console.error('Error: XAI_API_KEY environment variable not set');
    console.error('Please set it in your .env file or as an environment variable');
    process.exit(1);
  }

  // Clear screen and setup fullscreen
  console.clear();
  process.stdout.write('\x1b[?1049h'); // Enter alternate screen buffer
  process.stdout.write('\x1b[H\x1b[2J'); // Clear screen and move cursor to home

  // Render the Ink app
  const { unmount } = render(React.createElement(App));

  // Handle cleanup on exit
  process.on('SIGINT', () => {
    unmount();
    process.stdout.write('\x1b[?1049l'); // Exit alternate screen buffer
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    unmount();
    process.stdout.write('\x1b[?1049l'); // Exit alternate screen buffer
    process.exit(0);
  });
}

main();
