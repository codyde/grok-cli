import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';
import debugLogger from './debug-logger.js';
import * as Sentry from '@sentry/node';

const { logger } = Sentry;

export class GrokClient {
  constructor() {
    // Verify API key exists
    if (!process.env.XAI_API_KEY) {
      throw new Error('XAI_API_KEY environment variable is required');
    }
    this.apiKey = process.env.XAI_API_KEY;
    this.baseURL = 'https://api.x.ai/v1';
    this.tempDir = null;
    this.toolResultsCache = new Map(); // Cache for large tool results
    logger.info('GrokClient initialized', { apiKeySet: true });
  }

  async initTempDir() {
    if (!this.tempDir) {
      this.tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'grok-cli-'));
      logger.debug(logger.fmt`Initialized temporary directory: ${this.tempDir}`);
    }
    return this.tempDir;
  }

  async cleanup() {
    if (this.tempDir) {
      try {
        await fs.rm(this.tempDir, { recursive: true, force: true });
        logger.info('Cleaned up temporary directory', { path: this.tempDir });
        this.tempDir = null;
        this.toolResultsCache.clear();
      } catch (error) {
        logger.error('Failed to cleanup temp directory', { error: error.message });
        console.warn('Failed to cleanup temp directory:', error.message);
      }
    }
  }

  getTools() {
    logger.trace('Fetching available tools');
    return [
      {
        type: 'function',
        function: {
          name: 'listFiles',
          description: 'List all files and directories in a given path. Use this when the user asks about files in a directory, wants to see what files exist, or needs to explore the file system structure.',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The directory path to list (use "." for current directory if not specified)',
              },
              showHidden: {
                type: 'boolean',
                description: 'Whether to include hidden files that start with a dot',
              }
            },
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'readFile',
          description: 'Read the complete contents of a file. Use this when the user asks to see file contents, examine code, or analyze a specific file.',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The full path to the file to read'
              }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'writeFile',
          description: 'Write or create a new file with the specified content. Use this when the user wants to create a new file, save content, or overwrite an existing file.',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The full path where the file should be written'
              },
              content: {
                type: 'string',
                description: 'The complete content to write to the file'
              }
            },
            required: ['path', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'executeShell',
          description: 'Executes a bash/shell command on the local system and returns the output. Use this for CLI interactions like git or gh. WARNING: Only use for safe, non-destructive commands.',
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: 'The full shell command to execute'
              },
              workingDir: {
                type: 'string',
                description: 'Optional working directory (defaults to current)'
              },
              timeout: {
                type: 'number',
                description: 'Optional timeout in seconds (defaults to 30)'
              }
            },
            required: ['command']
          }
        }
      }
    ];
  }

  async executeToolCall(toolCall) {
    try {
      const functionName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);
      
      logger.info('Executing tool call', { functionName, args });
      let result;
      let summary = null;
      
      switch (functionName) {
        case 'listFiles':
          result = await this.listFilesImpl(args);
          // Keep list results as-is, they're usually manageable
          break;
        case 'writeFile':
          result = await this.writeFileImpl(args);
          break;
        case 'readFile':
          result = await this.readFileImpl(args);
          // Create summary for large file contents
          if (result.length > 500) {
            const tempDir = await this.initTempDir();
            const tempFile = path.join(tempDir, `tool_${toolCall.id}.txt`);
            await fs.writeFile(tempFile, result, 'utf8');
            
            this.toolResultsCache.set(toolCall.id, {
              fullPath: tempFile,
              fullContent: result
            });
            
            // Create a summary for the UI
            const lines = result.split('\n');
            const fileSize = result.length;
            const lineCount = lines.length;
            const filePath = args.path || 'unknown';
            
            summary = `📄 Read file: ${filePath} (${fileSize} bytes, ${lineCount} lines)\n[Full content cached for AI analysis]`;
            logger.info('Read large file, summary created', { filePath, fileSize, lineCount });
            result = summary;
          }
          break;
        case 'executeShell':
          result = await this.executeShellImpl(args);
          // For large outputs, we could add caching similar to readFile if needed
          break;
        default:
          result = `Unknown tool: ${functionName}`;
      }
      
      logger.info('Tool call executed successfully', { functionName });
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: functionName,
        content: result,
        _cached: summary !== null // Flag to indicate if full content is cached
      };
    } catch (error) {
      logger.error('Error executing tool call', { error: error.message });
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: toolCall.function.name,
        content: `Error: ${error.message}`
      };
    }
  }

  async listFilesImpl({ path: dirPath = '.', showHidden = false }) {
    try {
      const fullPath = path.resolve(dirPath);
      const stats = await fs.stat(fullPath);
      
      if (!stats.isDirectory()) {
        logger.warn('Path is not a directory', { path: fullPath });
        return `Path "${fullPath}" is not a directory`;
      }

      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const filtered = entries.filter(entry => showHidden || !entry.name.startsWith('.'));
      const sorted = filtered.sort((a, b) => a.name.localeCompare(b.name));
      
      if (sorted.length === 0) {
        logger.info('Directory is empty', { path: fullPath, showHidden });
        return `Directory ${fullPath} appears to be empty (showing ${showHidden ? 'all files' : 'non-hidden files only'})`;
      }
      
      let result = `📁 Contents of ${fullPath}:\n\n`;
      for (const entry of sorted) {
        const icon = entry.isDirectory() ? '📁' : '📄';
        result += `${icon} ${entry.name}\n`;
      }
      
      logger.info('Listed files in directory', { path: fullPath, fileCount: sorted.length });
      return result;
    } catch (error) {
      logger.error('Error listing files', { error: error.message });
      return `Error listing files: ${error.message}`;
    }
  }

  async writeFileImpl({ path: filePath, content }) {
    try {
      const fullPath = path.resolve(filePath);
      const dir = path.dirname(fullPath);
      
      // Create directory if it doesn't exist
      await fs.mkdir(dir, { recursive: true });
      
      // Write the file
      await fs.writeFile(fullPath, content, 'utf8');
      
      logger.info('File written successfully', { path: fullPath, contentLength: content.length });
      return `Successfully wrote ${content.length} bytes to ${fullPath}`;
    } catch (error) {
      logger.error('Error writing file', { error: error.message });
      return `Error writing file: ${error.message}`;
    }
  }

  async readFileImpl({ path: filePath }) {
    try {
      const fullPath = path.resolve(filePath);
      const content = await fs.readFile(fullPath, 'utf8');
      
      logger.info('File read successfully', { path: fullPath, contentLength: content.length });
      return `Contents of ${fullPath}:\n${content}`;
    } catch (error) {
      logger.error('Error reading file', { error: error.message });
      return `Error reading file: ${error.message}`;
    }
  }

  async executeShellImpl({ command, workingDir = process.cwd(), timeout = 30 }) {
    try {
      const execPromise = promisify(exec);
      const { stdout, stderr } = await execPromise(command, { cwd: workingDir, timeout: timeout * 1000 });
      logger.info('Shell command executed', { command, workingDir });
      return `Executed "${command}" in ${workingDir}:\nStdout: ${stdout}\nStderr: ${stderr}\nExit code: 0`;
    } catch (error) {
      logger.error('Error executing shell command', { command, error: error.message });
      return `Error executing "${command}" in ${workingDir}:\nStdout: ${error.stdout || ''}\nStderr: ${error.stderr || ''}\nExit code: ${error.code || 1}\nError: ${error.message}`;
    }
  }

  async chat(messages, useTools = true, abortSignal = null) {
    // Enforce grok-4 first, then fallback
    const modelNames = ['grok-4', 'grok-beta', 'grok-3'];
    
    for (const modelName of modelNames) {
      try {
        debugLogger.info(`🔍 Trying model: ${modelName}`);
        logger.debug(logger.fmt`Attempting to use model: ${modelName}`);
        
        const requestBody = {
          model: modelName,
          messages: messages,
          temperature: 0.7
        };

        if (useTools) {
          requestBody.tools = this.getTools();
        }

        const response = await fetch(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: abortSignal
        });

        if (!response.ok) {
          const errorData = await response.text();
          debugLogger.error(`❌ Model ${modelName} error:`, errorData);
          logger.error('API request failed', { model: modelName, status: response.status, error: errorData });
          
          // If it's a 503 or model unavailable, try next model
          if (response.status === 503 || errorData.includes('unavailable')) {
            debugLogger.warn(`⏭️  Model ${modelName} unavailable, trying next...`);
            logger.warn('Model unavailable, retrying with next', { model: modelName });
            continue;
          }
          
          throw new Error(`XAI API error: ${response.status} ${response.statusText} - ${errorData}`);
        }

        const data = await response.json();
        debugLogger.info(`✅ Successfully using model: ${modelName}`);
        logger.info('API request successful', { model: modelName });
        return {
          content: data.choices[0].message.content,
          toolCalls: data.choices[0].message.tool_calls || []
        };
      } catch (error) {
        debugLogger.error(`❌ Failed with model ${modelName}:`, error.message);
        logger.error('Model attempt failed', { model: modelName, error: error.message });
        // Continue to next model
      }
    }
    
    logger.fatal('All models failed or are unavailable');
    throw new Error('All models failed or are unavailable');
  }

  async *streamWithTools(messages, abortSignal = null) {
    try {
      let currentMessages = [...messages];
      let iterationCount = 0;
      const maxIterations = 25; // Safety limit to prevent infinite loops
      
      logger.info('Starting streaming with tools', { messageCount: messages.length });
      while (iterationCount < maxIterations) {
        if (abortSignal && abortSignal.aborted) {
          logger.warn('Streaming aborted by signal');
          break;
        }
        
        // Check for tool calls
        const result = await this.chat(currentMessages, true, abortSignal);
        const { content, toolCalls } = result;

        // If there are tool calls, execute them
        if (toolCalls && toolCalls.length > 0) {
          yield `🔧 Executing ${toolCalls.length} tool call(s)... (iteration ${iterationCount + 1})\n\n`;
          logger.info('Executing tool calls', { count: toolCalls.length, iteration: iterationCount + 1 });
          
          // Execute all tool calls
          const toolResults = [];
          const aiToolResults = []; // Full content for AI
          
          for (const toolCall of toolCalls) {
            if (abortSignal && abortSignal.aborted) {
              logger.warn('Tool execution aborted');
              break;
            }
            const result = await this.executeToolCall(toolCall);
            
            // For UI: use the summary/truncated version
            toolResults.push(result);
            yield `📋 **${toolCall.function.name}**: ${result.content}\n\n`;
            
            // For AI: use full content if cached
            if (result._cached && this.toolResultsCache.has(toolCall.id)) {
              const cached = this.toolResultsCache.get(toolCall.id);
              aiToolResults.push({
                ...result,
                content: cached.fullContent
              });
            } else {
              aiToolResults.push(result);
            }
          }
          
          if (abortSignal && abortSignal.aborted) {
            logger.warn('Streaming aborted after tool execution');
            break;
          }
          
          // Add tool calls and results to message history for next iteration
          // Use full content for AI context, but this won't be shown in UI
          currentMessages = [
            ...currentMessages,
            { 
              role: 'assistant', 
              content: content || '', 
              tool_calls: toolCalls 
            },
            ...aiToolResults // Use full content for AI reasoning
          ];
          
          iterationCount++;
        } else {
          // No more tool calls, stream the final response
          logger.info('No more tool calls, streaming final response');
          if (content) {
            for (const char of content) {
              if (abortSignal && abortSignal.aborted) {
                logger.warn('Streaming content aborted');
                break;
              }
              yield char;
            }
          }
          break; // Exit the loop when no more tool calls
        }
      }
      
      // Safety check: if we hit max iterations, provide a final response
      if (iterationCount >= maxIterations) {
        yield `\n\n⚠️ Reached maximum tool call iterations (${maxIterations}). Providing summary...\n\n`;
        logger.warn('Reached maximum tool call iterations', { maxIterations });
        const finalResult = await this.chat(currentMessages, false, abortSignal); // No tools for final response
        if (finalResult.content) {
          for (const char of finalResult.content) {
            if (abortSignal && abortSignal.aborted) {
              logger.warn('Final streaming aborted');
              break;
            }
            yield char;
          }
        }
      }
    } catch (error) {
      console.error('Streaming API error:', error);
      logger.error('Streaming API error', { error: error.message });
      throw new Error(`Streaming API error: ${error.message}`);
    }
  }

  async *chatStream(messages, abortSignal = null) {
    // Enforce grok-4 first for streaming
    const modelNames = ['grok-4', 'grok-beta', 'grok-3'];
    
    for (const modelName of modelNames) {
      try {
        debugLogger.info(`🔍 Trying streaming model: ${modelName}`);
        logger.debug(logger.fmt`Attempting streaming with model: ${modelName}`);
        
        const requestBody = {
          model: modelName,
          messages: messages,
          temperature: 0.7,
          stream: true
        };

        const response = await fetch(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: abortSignal
        });

        if (!response.ok) {
          const errorData = await response.text();
          debugLogger.error(`❌ Streaming model ${modelName} error:`, errorData);
          logger.error('Streaming API request failed', { model: modelName, status: response.status, error: errorData });
          
          // If it's a 503 or model unavailable, try next model
          if (response.status === 503 || errorData.includes('unavailable')) {
            debugLogger.warn(`⏭️  Streaming model ${modelName} unavailable, trying next...`);
            logger.warn('Streaming model unavailable, retrying with next', { model: modelName });
            continue;
          }
          
          throw new Error(`XAI API error: ${response.status} ${response.statusText} - ${errorData}`);
        }

        debugLogger.info(`✅ Successfully streaming with model: ${modelName}`);
        logger.info('Streaming API request successful', { model: modelName });
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          // Check if we were aborted
          if (abortSignal && abortSignal.aborted) {
            reader.cancel();
            logger.warn('Streaming reader cancelled due to abort signal');
            break;
          }
          
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                logger.info('Streaming completed');
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices[0]?.delta?.content;
                if (delta) {
                  yield delta;
                }
              } catch (e) {
                // Skip malformed JSON
                logger.warn('Skipped malformed JSON in stream', { line });
              }
            }
          }
        }
        
        logger.info('Streaming completed normally');
        return; // Successfully completed streaming
        
      } catch (error) {
        debugLogger.error(`❌ Streaming failed with model ${modelName}:`, error.message);
        logger.error('Streaming model attempt failed', { model: modelName, error: error.message });
        // Continue to next model
      }
    }
    
    logger.fatal('All streaming models failed or are unavailable');
    throw new Error('All streaming models failed or are unavailable');
  }

}

// Helper function to convert our internal message format to XAI API format
export function createChatMessages(messages) {
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}