/**
 * Feedback Generator for CodeReview AI
 * Generates contextual, formatted feedback messages
 */

import chalk from 'chalk';
import { CodeIssue, FileAnalysis, ReviewResult, TeamStandard, Config } from '../types';
import { getConfigManager } from '../config/manager';

export class FeedbackGenerator {
  private config: Config;

  constructor(config?: Config) {
    this.config = config || getConfigManager().getConfig();
  }

  /**
   * Generate terminal output for a review result
   */
  generateTerminalOutput(result: ReviewResult): string {
    const lines: string[] = [];
    
    // Header
    lines.push('');
    lines.push(chalk.bold.cyan('═'.repeat(60)));
    lines.push(chalk.bold.cyan('  📋 Code Review Report'));
    lines.push(chalk.bold.cyan('═'.repeat(60)));
    lines.push('');

    // Summary
    lines.push(chalk.bold('Summary:'));
    lines.push(`  Files reviewed: ${chalk.white(result.summary.totalFiles)}`);
    lines.push(`  Total issues:  ${this.colorBySeverity(result.summary.totalIssues, result.summary.totalIssues)}`);
    lines.push(`    ${chalk.red('●')} Critical: ${chalk.red(result.summary.critical)}`);
    lines.push(`    ${chalk.yellow('●')} Warnings: ${chalk.yellow(result.summary.warning)}`);
    lines.push(`    ${chalk.blue('○')} Suggestions: ${chalk.blue(result.summary.suggestion)}`);
    lines.push('');
    lines.push(`  Duration: ${(result.duration / 1000).toFixed(2)}s`);
    lines.push('');

    // By category
    lines.push(chalk.bold('By Category:'));
    for (const [category, count] of Object.entries(result.summary.byCategory)) {
      if (count > 0) {
        lines.push(`  ${this.getCategoryIcon(category)} ${category}: ${count}`);
      }
    }
    lines.push('');

    // Detailed issues per file
    lines.push(chalk.bold.cyan('─'.repeat(60)));
    lines.push(chalk.bold.cyan('  Detailed Issues'));
    lines.push(chalk.bold.cyan('─'.repeat(60)));
    lines.push('');

    for (const fileAnalysis of result.files) {
      if (fileAnalysis.issues.length === 0) continue;

      lines.push(chalk.bold.white(`📄 ${fileAnalysis.file}`));
      lines.push(chalk.gray(`   Language: ${fileAnalysis.language} | Lines: ${fileAnalysis.lines}`));
      lines.push(chalk.gray('   ' + '─'.repeat(50)));
      
      for (const issue of fileAnalysis.issues) {
        lines.push(this.formatIssue(issue));
      }
      lines.push('');
    }

    // Footer
    lines.push(chalk.bold.cyan('═'.repeat(60)));
    lines.push(chalk.gray(`  Generated: ${result.timestamp.toISOString()}`));
    lines.push(chalk.bold.cyan('═'.repeat(60)));
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Format a single issue
   */
  formatIssue(issue: CodeIssue): string {
    const severityIcon = this.getSeverityIcon(issue.severity);
    const severityColor = this.getSeverityColor(issue.severity);
    const lineInfo = this.config.output.showLineNumbers 
      ? chalk.gray(`:${issue.line}`)
      : '';
    
    const lines: string[] = [];
    lines.push(`   ${severityIcon} ${chalk.gray('Line ')}${issue.line}${lineInfo} ${severityColor(issue.severity.toUpperCase())} ${chalk.gray(`[${issue.category}]`)}`);
    lines.push(`      ${issue.message}`);
    
    if (issue.suggestion) {
      lines.push(chalk.green(`      💡 Suggestion: ${issue.suggestion}`));
    }
    
    if (issue.code) {
      lines.push(chalk.gray(`      Code: ${issue.code}`));
    }

    return lines.join('\n');
  }

  /**
   * Generate JSON output
   */
  generateJSONOutput(result: ReviewResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * Generate Markdown output
   */
  generateMarkdownOutput(result: ReviewResult): string {
    const lines: string[] = [];

    // Header
    lines.push('# Code Review Report\n');
    
    // Summary
    lines.push('## Summary\n');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Files Reviewed | ${result.summary.totalFiles} |`);
    lines.push(`| Total Issues | ${result.summary.totalIssues} |`);
    lines.push(`| Critical | ${result.summary.critical} |`);
    lines.push(`| Warnings | ${result.summary.warning} |`);
    lines.push(`| Suggestions | ${result.summary.suggestion} |`);
    lines.push(`| Duration | ${(result.duration / 1000).toFixed(2)}s |`);
    lines.push('');

    // By category
    lines.push('## By Category\n');
    for (const [category, count] of Object.entries(result.summary.byCategory)) {
      if (count > 0) {
        lines.push(`- **${category}**: ${count}`);
      }
    }
    lines.push('');

    // Detailed issues
    lines.push('## Detailed Issues\n');
    
    for (const fileAnalysis of result.files) {
      if (fileAnalysis.issues.length === 0) continue;

      lines.push(`### ${fileAnalysis.file}\n`);
      lines.push(`*Language: ${fileAnalysis.language} | Lines: ${fileAnalysis.lines}*\n`);
      
      for (const issue of fileAnalysis.issues) {
        lines.push(this.formatIssueMarkdown(issue));
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format issue in Markdown
   */
  formatIssueMarkdown(issue: CodeIssue): string {
    const severityBadge = `\`${issue.severity.toUpperCase()}\``;
    const categoryBadge = `\`${issue.category}\``;
    
    let md = `#### Line ${issue.line} ${severityBadge} ${categoryBadge}\n`;
    md += `\n${issue.message}\n`;
    
    if (issue.suggestion) {
      md += `\n> 💡 **Suggestion**: ${issue.suggestion}\n`;
    }
    
    if (issue.code) {
      md += `\n\`\`\`\n${issue.code}\n\`\`\`\n`;
    }

    return md;
  }

  /**
   * Generate GitHub PR review comment
   */
  generateGitHubComment(result: ReviewResult): string {
    if (result.summary.totalIssues === 0) {
      return '✅ Great job! No issues found in this PR.';
    }

    const lines: string[] = [];
    lines.push('## 📋 Code Review Results\n');
    
    lines.push(`**Summary**: ${result.summary.critical} critical, ${result.summary.warning} warnings, ${result.summary.suggestion} suggestions\n`);
    
    for (const fileAnalysis of result.files) {
      if (fileAnalysis.issues.length === 0) continue;

      lines.push(`### ${fileAnalysis.file}\n`);
      
      for (const issue of fileAnalysis.issues) {
        lines.push(this.formatGitHubIssue(issue));
      }
      lines.push('');
    }

    lines.push('---\n');
    lines.push('*This review was automatically generated by CodeReview AI*');

    return lines.join('\n');
  }

  /**
   * Format issue for GitHub
   */
  formatGitHubIssue(issue: CodeIssue): string {
    const severityEmoji = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '⚪';
    
    let text = `- ${severityEmoji} **Line ${issue.line}** [${issue.category}] ${issue.message}`;
    
    if (issue.suggestion) {
      text += `\n  > 💡 ${issue.suggestion}`;
    }

    return text;
  }

  /**
   * Generate review summary for GitHub PR
   */
  generateGitHubReviewBody(result: ReviewResult): { body: string; annotations: any[] } {
    const annotations: any[] = [];
    
    for (const fileAnalysis of result.files) {
      for (const issue of fileAnalysis.issues) {
        annotations.push({
          path: fileAnalysis.file,
          line: issue.line,
          severity: issue.severity === 'critical' ? 'FAILURE' : issue.severity === 'warning' ? 'WARNING' : 'NOTICE',
          message: issue.message,
          annotation_level: issue.severity === 'critical' ? 'failure' : issue.severity === 'warning' ? 'warning' : 'notice'
        });
      }
    }

    return {
      body: this.generateGitHubComment(result),
      annotations
    };
  }

  // Helper methods
  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'critical': return chalk.red('🔴');
      case 'warning': return chalk.yellow('🟡');
      case 'suggestion': return chalk.blue('⚪');
      default: return '○';
    }
  }

  private getSeverityColor(severity: string): any {
    switch (severity) {
      case 'critical': return chalk.red;
      case 'warning': return chalk.yellow;
      case 'suggestion': return chalk.blue;
      default: return chalk.white;
    }
  }

  private colorBySeverity(value: number, total: number): string {
    if (total === 0) return chalk.green('0');
    const ratio = value / total;
    if (ratio > 0.5) return chalk.red(value.toString());
    if (ratio > 0.2) return chalk.yellow(value.toString());
    return chalk.green(value.toString());
  }

  private getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      security: '🔒',
      performance: '⚡',
      bestPractices: '✨',
      style: '💅',
      documentation: '📖'
    };
    return icons[category] || '📌';
  }

  /**
   * Generate output based on configured format
   */
  generateOutput(result: ReviewResult): string {
    switch (this.config.output.format) {
      case 'json':
        return this.generateJSONOutput(result);
      case 'markdown':
        return this.generateMarkdownOutput(result);
      case 'terminal':
      default:
        return this.generateTerminalOutput(result);
    }
  }

  /**
   * Generate feedback for a single issue with team standards context
   */
  async generateContextualFeedback(issue: CodeIssue, standards: TeamStandard[]): Promise<string> {
    const relevantStandard = standards.find(s => s.rule === issue.rule);
    
    const lines: string[] = [];
    
    // Severity and message
    const severityLabel = `[${issue.severity.toUpperCase()}]`;
    lines.push(`${severityLabel} ${issue.message}`);
    
    // Suggestion
    if (issue.suggestion) {
      lines.push(`\n💡 ${issue.suggestion}`);
    }
    
    // Team standard context
    if (relevantStandard) {
      const acceptanceRate = relevantStandard.feedbackCount > 0 
        ? (relevantStandard.acceptedCount / relevantStandard.feedbackCount * 100).toFixed(0)
        : 'N/A';
      
      lines.push(`\n📊 Team Standard: ${relevantStandard.description}`);
      lines.push(`   Weight: ${relevantStandard.weight.toFixed(2)} | Acceptance: ${acceptanceRate}%`);
    }
    
    return lines.join('\n');
  }
}
