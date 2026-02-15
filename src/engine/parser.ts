/**
 * Language Parser for CodeReview AI
 * Detects language and provides language-specific parsing utilities
 */

import * as path from 'path';
import * as fs from 'fs';
import { Language } from '../types';

// Language detection mappings
const EXTENSION_MAP: Record<string, Language> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala'
};

// Shebang patterns for script detection
const SHEBANG_PATTERNS: Record<string, Language> = {
  'python': 'python',
  'node': 'javascript',
  'ruby': 'ruby',
  'bash': 'bash',
  'sh': 'bash'
};

export class Parser {
  /**
   * Detect language from file extension or content
   */
  detectLanguage(filePath: string, content?: string): Language {
    // Try by extension first
    const ext = path.extname(filePath).toLowerCase();
    if (EXTENSION_MAP[ext]) {
      return EXTENSION_MAP[ext];
    }

    // Try by shebang in content
    if (content) {
      const shebang = this.detectFromShebang(content);
      if (shebang) {
        return shebang;
      }
    }

    return 'unknown';
  }

  /**
   * Detect language from shebang line
   */
  private detectFromShebang(content: string): Language | null {
    const firstLine = content.split('\n')[0];
    if (firstLine.startsWith('#!')) {
      for (const [pattern, lang] of Object.entries(SHEBANG_PATTERNS)) {
        if (firstLine.includes(pattern)) {
          return lang;
        }
      }
    }
    return null;
  }

  /**
   * Get file extension for language
   */
  getExtensions(language: Language): string[] {
    const extensions: string[] = [];
    for (const [ext, lang] of Object.entries(EXTENSION_MAP)) {
      if (lang === language) {
        extensions.push(ext);
      }
    }
    return extensions;
  }

  /**
   * Check if file should be ignored based on patterns
   */
  shouldIgnore(filePath: string, ignorePatterns: string[]): boolean {
    const fileName = path.basename(filePath);
    
    for (const pattern of ignorePatterns) {
      // Handle glob patterns
      if (pattern.includes('*')) {
        const regex = this.globToRegex(pattern);
        if (regex.test(filePath) || regex.test(fileName)) {
          return true;
        }
      } else if (filePath.includes(pattern) || fileName === pattern) {
        return true;
      }
    }

    return false;
  }

  /**
   * Convert glob pattern to regex
   */
  private globToRegex(glob: string): RegExp {
    let regexStr = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars
      .replace(/\*/g, '.*')                    // * matches anything
      .replace(/\?/g, '.');                     // ? matches single char
    
    return new RegExp(`^${regexStr}$`);
  }

  /**
   * Get all code files in a directory
   */
  async getCodeFiles(dirPath: string, ignorePatterns: string[] = []): Promise<string[]> {
    const files: string[] = [];
    
    const scanDir = async (dir: string) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip hidden directories and common ignore dirs
          if (!entry.name.startsWith('.') && 
              !['node_modules', 'dist', 'build', 'coverage', '__pycache__'].includes(entry.name)) {
            await scanDir(fullPath);
          }
        } else if (entry.isFile()) {
          if (!this.shouldIgnore(fullPath, ignorePatterns)) {
            const lang = this.detectLanguage(fullPath);
            if (lang !== 'unknown') {
              files.push(fullPath);
            }
          }
        }
      }
    };

    await scanDir(dirPath);
    return files;
  }

  /**
   * Read file content
   */
  async readFile(filePath: string): Promise<string> {
    return fs.promises.readFile(filePath, 'utf-8');
  }

  /**
   * Get file info
   */
  async getFileInfo(filePath: string): Promise<{
    content: string;
    language: Language;
    lines: number;
    size: number;
  }> {
    const content = await this.readFile(filePath);
    const language = this.detectLanguage(filePath, content);
    const lines = content.split('\n').length;
    const stats = await fs.promises.stat(filePath);

    return {
      content,
      language,
      lines,
      size: stats.size
    };
  }

  /**
   * Get line content at specific line number
   */
  getLineContent(content: string, lineNumber: number): string {
    const lines = content.split('\n');
    if (lineNumber > 0 && lineNumber <= lines.length) {
      return lines[lineNumber - 1];
    }
    return '';
  }

  /**
   * Get lines around a specific line (context)
   */
  getLineContext(content: string, lineNumber: number, context: number = 2): string[] {
    const lines = content.split('\n');
    const start = Math.max(0, lineNumber - context - 1);
    const end = Math.min(lines.length, lineNumber + context);
    
    return lines.slice(start, end);
  }
}
