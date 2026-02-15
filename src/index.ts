/**
 * CodeReview AI - Entry Point
 * AI-Powered Code Review Bot
 * 
 * This module provides the main entry point for programmatic usage
 */

export { Analyzer } from './engine/analyzer';
export { AIService } from './engine/ai';
export { Parser } from './engine/parser';
export { FeedbackGenerator } from './feedback/generator';
export { Learner } from './learning/learner';
export { GitHubWebhook } from './github/webhook';
export { ConfigManager, getConfigManager, resetConfigManager } from './config/manager';
export { DatabaseStore, getStore, closeStore } from './db/store';
export * from './types';

// Main review function
import { Analyzer } from './engine/analyzer';
import { FeedbackGenerator } from './feedback/generator';
import { Config } from './types';

export interface ReviewOptions {
  path: string;
  config?: Config;
  output?: 'terminal' | 'json' | 'markdown';
}

/**
 * Quick review function for simple use cases
 */
export async function review(options: ReviewOptions): Promise<string> {
  const analyzer = new Analyzer(options.config);
  const feedbackGenerator = new FeedbackGenerator(options.config);
  
  const stats = require('fs').statSync(options.path);
  
  let result;
  if (stats.isFile()) {
    const analysis = await analyzer.analyzeFile(options.path);
    result = {
      files: [analysis],
      summary: {
        totalFiles: 1,
        totalIssues: analysis.issues.length,
        critical: analysis.issues.filter((i: any) => i.severity === 'critical').length,
        warning: analysis.issues.filter((i: any) => i.severity === 'warning').length,
        suggestion: analysis.issues.filter((i: any) => i.severity === 'suggestion').length,
        byCategory: {
          security: analysis.issues.filter((i: any) => i.category === 'security').length,
          performance: analysis.issues.filter((i: any) => i.category === 'performance').length,
          bestPractices: analysis.issues.filter((i: any) => i.category === 'bestPractices').length,
          style: analysis.issues.filter((i: any) => i.category === 'style').length,
          documentation: analysis.issues.filter((i: any) => i.category === 'documentation').length
        }
      },
      duration: 0,
      timestamp: new Date()
    };
  } else {
    result = await analyzer.analyzeDirectory(options.path);
  }
  
  return feedbackGenerator.generateOutput(result);
}

// CLI entry point
if (require.main === module) {
  require('./cli');
}
