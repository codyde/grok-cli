import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';

export class FileUtils {
  static async searchFiles(query = '') {
    try {
      // Find all files in current directory and subdirectories
      const allFiles = await glob('**/*', {
        nodir: true,
        ignore: ['node_modules/**', '.git/**', '*.log', 'target/**']
      });

      if (!query) {
        return allFiles.slice(0, 10); // Limit to 10 results
      }

      // Filter files based on query
      const filtered = allFiles.filter(file => {
        const fileName = path.basename(file);
        return fileName.toLowerCase().includes(query.toLowerCase());
      });

      return filtered.slice(0, 10); // Limit to 10 results
    } catch (error) {
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

      // Exact filename match
      for (const file of allFiles) {
        const fileName = path.basename(file);
        if (fileName === query || file.endsWith(query)) {
          return await fs.readFile(file, 'utf-8');
        }
      }

      // Fuzzy match
      for (const file of allFiles) {
        const fileName = path.basename(file);
        if (fileName.toLowerCase().includes(query.toLowerCase())) {
          return await fs.readFile(file, 'utf-8');
        }
      }

      return null;
    } catch (error) {
      console.error('Error reading file:', error);
      return null;
    }
  }

  static async processFileReferences(input) {
    let processed = input;
    const fileRefRegex = /@(\S+)/g;
    let hasFiles = false;

    let match;
    while ((match = fileRefRegex.exec(input)) !== null) {
      const fileRef = match[1];
      const content = await this.findAndReadFile(fileRef);
      
      if (content !== null) {
        const replacement = `\n\nFile: ${fileRef}\n\`\`\`\n${content}\n\`\`\`\n`;
        processed = processed.replace(match[0], replacement);
        hasFiles = true;
      }
    }

    // Add explicit reminder for file analysis
    if (hasFiles) {
      processed += '\n\n[Please analyze the above file(s) and remember to end your response with a friendly closing message encouraging further conversation.]';
    }

    return processed;
  }
}