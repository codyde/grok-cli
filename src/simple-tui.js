#!/usr/bin/env node

import readline from 'node:readline';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GrokClient } from './api.js';
import { FileUtils } from './file-utils.js';
import debugLogger from './debug-logger.js';
import { logger } from '@sentry/node';

const GROK_ASCII = `
 ██████╗ ██████╗  ██████╗ ██╗  ██╗      ██╗  ██║
██╔════╝ ██╔══██╗██╔═══██╗██║ ██╔╝      ██║  ██║
██║  ███╗██████╔╝██║   ██║█████╔╝ █████╗██████╔╝
██║   ██║██╔══██╗██║   ██║██╔═██╗ ╚════╝╚═══██╔╝
╚██████╔╝██║  ██║╚██████╔╝██║  ██╗           ██║
 ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝           ╚═╝
`;

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

function main() {
  if (!process.env.XAI_API_KEY) {
    console.error('Error: XAI_API_KEY environment variable not set');
    process.exit(1);
  }

  const grokClient = new GrokClient();
  let conversation = [];

  console.log(GROK_ASCII);
  console.log('Welcome to Grok CLI Simple! Type your message and press enter. Use /help for commands.\\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input.startsWith('/')) {
      await handleCommand(input, conversation, grokClient, rl);
      rl.prompt();
      return;
    }

    console.log(`[${new Date().toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute: '2-digit'})}] You: ${input}`);

    const processedInput = await FileUtils.processFileReferences(input);

    conversation.push({ role: 'user', content: processedInput });

    const thinking = THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)];
    process.stdout.write(`[${new Date().toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute: '2-digit'})}] Grok: ${thinking}`);

    let response = '';
    try {
      const systemMessage = {
        role: 'system',
        content: processedInput.includes('File:') 
          ? 'You are Grok, a helpful AI built by xAI with access to file system tools. You can list files, read files, and write files on the local system. When analyzing files or code, provide your analysis and then ALWAYS end your response with a brief closing message that encourages the user to continue the conversation.'
          : 'You are Grok, a helpful AI built by xAI with access to file system tools. You can list files, read files, and write files on the local system to help with development tasks. Use your tools when appropriate to help the user. At the end of each response, include a brief closing message that encourages the user to continue the conversation.'
      };

      const apiMessages = [systemMessage, ...conversation];

      const stream = grokClient.streamWithTools(apiMessages);

      // Clear thinking message line (move to new line)
      console.log();

      for await (const chunk of stream) {
        response += chunk;
        process.stdout.write(chunk);
      }
      console.log(); // New line after response
    } catch (error) {
      console.log(`\\nError: ${error.message}`);
    }

    conversation.push({ role: 'assistant', content: response });

    rl.prompt();
  });

  rl.on('close', async () => {
    console.log('\\nBye!');
    await grokClient.cleanup();
    process.exit(0);
  });
}

async function handleCommand(input, conversation, grokClient, rl) {
  const parts = input.substring(1).split(' ');
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case 'help':
      console.log('Available commands:\\n/clear - Clear conversation\\n/save [filename] - Save conversation to JSON\\n/debug - Show debug info\\n/help - This help');
      break;
    case 'clear':
      conversation.length = 0;
      console.log('Conversation cleared.');
      break;
    case 'save':
      const filename = parts[1] || 'grok-conversation.json';
      try {
        const chatData = JSON.stringify(conversation, null, 2);
        await fs.writeFile(filename, chatData);
        console.log(`Conversation saved to ${filename}.`);
      } catch (error) {
        console.log(`Error saving: ${error.message}`);
      }
      break;
    case 'debug':
      console.log('Debug info: Conversation length: ' + conversation.length);
      // Could add more, like last logs
      break;
    default:
      console.log(`Unknown command: ${cmd}`);
  }
}

main();