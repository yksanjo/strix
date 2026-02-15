/**
 * Code Analyzer Engine for CodeReview AI
 * Main orchestration for code analysis
 */

import * as path from 'path';
import { Config, CodeIssue, FileAnalysis, ReviewResult, Language, TeamStandard } from '../types';
import { AIService } from './ai';
import { Parser } from './parser';
import { getStore } from '../db/store';
import { getConfigManager } from '../config/manager';

export class Analyzer {
  private aiService: AIService;
  private parser: Parser;
  private config: Config;

  constructor(config?: Config) {
    this.config = config || getConfigManager().getConfig();
    this.aiService = new AIService(this.config);
    this.parser = new Parser();
  }

  /**
   * Analyze a single file
   */
  async analyzeFile(filePath: string): Promise<FileAnalysis> {
    const startTime = Date.now();
    
    const { content, language, lines } = await this.parser.getFileInfo(filePath);
    const relativePath = path.relative(process.cwd(), filePath);
    
    // Get team standards
    const store = getStore();
    const standards = this.config.learning.enabled ? store.getAllStandards() : [];
    
    // Filter standards by language if applicable
    const relevantStandards = this.filterStandardsForLanguage(standards, language);
    
    // Analyze with AI
    const issues = await this.aiService.analyzeCode({
      code: content,
      file: relativePath,
      language,
      standards: relevantStandards,
      config: this.config
    });

    // Limit issues per file
    const limitedIssues = issues.slice(0, this.config.review.maxIssuesPerFile);
    
    // Store review in history
    store.addReviewHistory(relativePath, language, limitedIssues);

    return {
      file: relativePath,
      language,
      content,
      lines,
      issues: limitedIssues,
      timestamp: new Date()
    };
  }

  /**
   * Analyze multiple files
   */
  async analyzeFiles(filePaths: string[]): Promise<FileAnalysis[]> {
    const analyses: FileAnalysis[] = [];
    
    for (const filePath of filePaths) {
      try {
        const analysis = await this.analyzeFile(filePath);
        analyses.push(analysis);
      } catch (error) {
        console.error(`Error analyzing ${filePath}:`, error);
      }
    }
    
    return analyses;
  }

  /**
   * Analyze a directory
   */
  async analyzeDirectory(dirPath: string): Promise<ReviewResult> {
    const startTime = Date.now();
    
    // Get all code files
    const files = await this.parser.getCodeFiles(
      dirPath, 
      this.config.review.ignorePatterns
    );
    
    // Analyze all files
    const fileAnalyses = await this.analyzeFiles(files);
    
    // Calculate summary
    const summary = this.calculateSummary(fileAnalyses);
    
    return {
      files: fileAnalyses,
      summary,
      duration: Date.now() - startTime,
      timestamp: new Date()
    };
  }

  /**
   * Analyze a diff/changes
   */
  async analyzeDiff(diff: string): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];
    
    // Parse the diff to understand what changed
    const changes = this.parseDiff(diff);
    
    for (const change of changes) {
      const { file, content, language } = change;
      
      // Get relevant standards
      const store = getStore();
      const standards = this.config.learning.enabled ? store.getAllStandards() : [];
      
      // Analyze the changed code
      const changeIssues = await this.aiService.analyzeCode({
        code: content,
        file,
        language,
        standards,
        config: this.config,
        diff
      });
      
      issues.push(...changeIssues);
    }
    
    return issues;
  }

  /**
   * Parse a unified diff format
   */
  private parseDiff(diff: string): { file: string; content: string; language: Language }[] {
    const changes: { file: string; content: string; language: Language }[] = [];
    const diffLines = diff.split('\n');
    
    let currentFile = '';
    let currentContent: string[] = [];
    
    for (const line of diffLines) {
      // Detect file changes
      if (line.startsWith('+++ b/') || line.startsWith('diff --git')) {
        // Save previous file
        if (currentFile && currentContent.length > 0) {
          const content = currentContent.join('\n');
          const language = this.parser.detectLanguage(currentFile, content);
          changes.push({ file: currentFile, content, language });
        }
        
        // Start new file
        if (line.startsWith('+++ b/')) {
          currentFile = line.substring(6).trim();
        } else if (line.startsWith('diff --git')) {
          // Extract file from diff --git a/path b/path
          const match = line.match(/diff --git a\/(.+?) b\/(.+)/);
          if (match) {
            currentFile = match[2];
          }
        }
        currentContent = [];
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        // Add added lines (skip +++)
        currentContent.push(line.substring(1));
      }
    }
    
    // Save last file
    if (currentFile && currentContent.length > 0) {
      const content = currentContent.join('\n');
      const language = this.parser.detectLanguage(currentFile, content);
      changes.push({ file: currentFile, content, language });
    }
    
    return changes;
  }

  /**
   * Filter standards relevant to the language
   */
  private filterStandardsForLanguage(standards: TeamStandard[], language: Language): TeamStandard[] {
    // For now, return all standards
    // In the future, could filter by language-specific standards
    return standards;
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(analyses: FileAnalysis[]): ReviewResult['summary'] {
    let totalIssues = 0;
    let critical = 0;
    let warning = 0;
    let suggestion = 0;
    const byCategory: Record<string, number> = {
      security: 0,
      performance: 0,
      bestPractices: 0,
      style: 0,
      documentation: 0
    };

    for (const analysis of analyses) {
      for (const issue of analysis.issues) {
        totalIssues++;
        
        switch (issue.severity) {
          case 'critical':
            critical++;
            break;
          case 'warning':
            warning++;
            break;
          case 'suggestion':
            suggestion++;
            break;
        }
        
        byCategory[issue.category]++;
      }
    }

    return {
      totalFiles: analyses.length,
      totalIssues,
      critical,
      warning,
      suggestion,
      byCategory: byCategory as any
    };
  }

  /**
   * Get issue by ID
   */
  getIssue(issueId: string): CodeIssue | null {
    const [file, linePart] = issueId.split(':');
    const line = parseInt(linePart);
    
    // Search in recent reviews
    const store = getStore();
    const history = store.getReviewHistory(100);
    
    for (const entry of history) {
      const issues = JSON.parse(entry.issues_json);
      const issue = issues.find((i: any) => i.file === file && i.line === line);
      if (issue) {
        return issue as CodeIssue;
      }
    }
    
    return null;
  }
}
