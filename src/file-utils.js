import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import * as Sentry from '@sentry/node';

const { logger } = Sentry;

export class FileUtils {
  static async searchFiles(query = '') {
    try {
      // Find all files in current directory and subdirectories
      const allFiles = await glob('**/*', {
        nodir: true,
        ignore: ['node_modules/**', '.git/**', '*.log', 'target/**']
      });

      logger.info('Searching files', { query, totalFiles: allFiles.length });
      if (!query) {
        logger.debug('No query provided, returning top 10 files');
        return allFiles.slice(0, 10); // Limit to 10 results
      }

      // Filter files based on query
      const filtered = allFiles.filter(file => {
        const fileName = path.basename(file);
        return fileName.toLowerCase().includes(query.toLowerCase());
      });

      logger.info('File search completed', { query, results: filtered.length });
      return filtered.slice(0, 10); // Limit to 10 results
    } catch (error) {
      logger.error('Error searching files', { error: error.message });
      console.error('Error searching files:', error);
      return [];
    }
  }

  static async findAndReadFile(query) {
    try {
      // First try exact match
      const allFiles = await glob('**/*', {
        nodir: true,
        ignore: ['node_modules/**', '.git/**', '*.log', 'target/**']
      });

      logger.info('Finding and reading file', { query, totalFiles: allFiles.length });
      // Exact filename match
      for (const file of allFiles) {
        const fileName = path.basename(file);
        if (fileName === query || file.endsWith(query)) {
          logger.info('Exact file match found', { file });
          return await fs.readFile(file, 'utf-8');
        }
      }

      // Fuzzy match
      for (const file of allFiles) {
        const fileName = path.basename(file);
        if (fileName.toLowerCase().includes(query.toLowerCase())) {
          logger.info('Fuzzy file match found', { file });
          return await fs.readFile(file, 'utf-8');
        }
      }

      logger.warn('No file match found', { query });
      return null;
    } catch (error) {
      logger.error('Error reading file', { error: error.message });
      console.error('Error reading file:', error);
      return null;
    }
  }

  static async processFileReferences(input) {
    let processed = input;
    const fileRefRegex = /@(\S+)/g;
    let hasFiles = false;

    logger.info('Processing file references', { input });
    let match;
    while ((match = fileRefRegex.exec(input)) !== null) {
      const fileRef = match[1];
      const content = await this.findAndReadFile(fileRef);
      
      if (content !== null) {
        logger.info('File reference processed', { fileRef });
        const replacement = `\n\nFile: ${fileRef}\n\`\`\`\n${content}\n\`\`\`\n`;
        processed = processed.replace(match[0], replacement);
        hasFiles = true;
      } else {
        logger.warn('File reference not found', { fileRef });
      }
    }

    // Add explicit reminder for file analysis
    if (hasFiles) {
      processed += '\n\n[Please analyze the above file(s) and remember to end your response with a friendly closing message encouraging further conversation.]';
      logger.info('Added file analysis reminder');
    }

    logger.debug(logger.fmt`Processed input with file references: ${processed}`);
    return processed;
  }
}