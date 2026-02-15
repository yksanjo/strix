/**
 * AI Service for CodeReview AI
 * Handles AI-powered code analysis using OpenAI or Anthropic
 */

import OpenAI from 'openai';
import { Config, TeamStandard, Language, CodeIssue, AIPromptContext } from '../types';
import { getConfigManager } from '../config/manager';

export class AIService {
  private client: OpenAI | null = null;
  private config: Config;

  constructor(config?: Config) {
    this.config = config || getConfigManager().getConfig();
    this.initializeClient();
  }

  private initializeClient(): void {
    const apiKey = this.config.ai.apiKey || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      console.warn('No AI API key configured. Using fallback pattern detection.');
      return;
    }

    if (this.config.ai.provider === 'openai') {
      this.client = new OpenAI({ apiKey });
    }
    // Anthropic would use a different client
  }

  /**
   * Analyze code and return issues using AI
   */
  async analyzeCode(context: AIPromptContext): Promise<CodeIssue[]> {
    // If no AI client, use fallback pattern detection
    if (!this.client) {
      return this.fallbackAnalysis(context);
    }

    try {
      if (this.config.ai.provider === 'openai') {
        return await this.analyzeWithOpenAI(context);
      }
    } catch (error) {
      console.error('AI analysis failed, falling back to pattern detection:', error);
      return this.fallbackAnalysis(context);
    }

    return this.fallbackAnalysis(context);
  }

  private async analyzeWithOpenAI(context: AIPromptContext): Promise<CodeIssue[]> {
    const prompt = this.buildPrompt(context);
    
    const response = await this.client!.chat.completions.create({
      model: this.config.ai.model,
      messages: [
        {
          role: 'system',
          content: `You are an expert code reviewer. Analyze the code and provide feedback on issues. 
Return a JSON array of issues in this exact format:
[{"line": 1, "severity": "critical|warning|suggestion", "category": "security|performance|bestPractices|style|documentation", "message": "...", "suggestion": "...", "rule": "rule-name"}]

Only return valid JSON, no other text.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: this.config.ai.temperature,
      max_tokens: this.config.ai.maxTokens
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    try {
      const issues = JSON.parse(content);
      return issues.map((issue: any) => ({
        id: this.generateIssueId(context.file, issue.line),
        file: context.file,
        line: issue.line,
        severity: issue.severity,
        category: issue.category,
        message: issue.message,
        suggestion: issue.suggestion,
        rule: issue.rule
      }));
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return [];
    }
  }

  private buildPrompt(context: AIPromptContext): string {
    const standardsInfo = context.standards.length > 0 
      ? `Team Standards to consider:\n${context.standards.map(s => `- ${s.rule}: ${s.description} (weight: ${s.weight})`).join('\n')}`
      : 'No specific team standards defined yet.';

    let prompt = `Analyze this ${context.language} code file: ${context.file}

${standardsInfo}

Code to review:
\`\`\`${context.language}
${context.code}
\`\`\`

Provide a detailed analysis of issues found.`;

    if (context.diff) {
      prompt += `\n\nChanges in this diff:
\`\`\`diff
${context.diff}
\`\`\``;
    }

    return prompt;
  }

  /**
   * Fallback pattern-based analysis when AI is not available
   */
  private fallbackAnalysis(context: AIPromptContext): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const lines = context.code.split('\n');

    // Pattern detectors based on language
    const patterns = this.getLanguagePatterns(context.language);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      for (const pattern of patterns) {
        if (pattern.regex.test(line)) {
          issues.push({
            id: this.generateIssueId(context.file, lineNumber),
            file: context.file,
            line: lineNumber,
            severity: pattern.severity,
            category: pattern.category,
            message: pattern.message,
            suggestion: pattern.suggestion,
            rule: pattern.rule,
            code: line.trim()
          });
        }
      }
    }

    return this.filterBySeverity(issues);
  }

  private getLanguagePatterns(language: Language) {
    const commonPatterns = [
      {
        regex: /console\.(log|debug|info)/g,
        severity: 'suggestion' as const,
        category: 'bestPractices' as const,
        message: 'Console statement found - consider removing for production code',
        suggestion: 'Use a proper logging library (e.g., Winston, Pino) instead',
        rule: 'no-console'
      },
      {
        regex: /TODO|FIXME|HACK|XXX/g,
        severity: 'suggestion' as const,
        category: 'documentation' as const,
        message: 'Incomplete code marker found',
        suggestion: 'Address this TODO or create a tracking issue',
        rule: 'no-incomplete-todos'
      },
      {
        regex: /debugger;/g,
        severity: 'warning' as const,
        category: 'bestPractices' as const,
        message: 'Debugger statement found',
        suggestion: 'Remove debugger statement before committing',
        rule: 'no-debugger'
      },
      {
        regex: /eval\(/g,
        severity: 'critical' as const,
        category: 'security' as const,
        message: 'Use of eval() detected - potential security vulnerability',
        suggestion: 'Avoid using eval(). Use JSON.parse() or other safer alternatives',
        rule: 'no-eval'
      },
      {
        regex: /password|secret|api[_-]?key|token|private[_-]?key/gi,
        severity: 'critical' as const,
        category: 'security' as const,
        message: 'Potential hardcoded credential detected',
        suggestion: 'Move sensitive data to environment variables or a secrets manager',
        rule: 'no-hardcoded-secrets'
      },
      {
        regex: /==(?!=)/g,
        severity: 'warning' as const,
        category: 'bestPractices' as const,
        message: 'Loose equality comparison (==) detected',
        suggestion: 'Use strict equality (===) for more predictable behavior',
        rule: 'eqeqeq'
      },
      {
        regex: /catch\s*\(\s*\)/g,
        severity: 'warning' as const,
        category: 'bestPractices' as const,
        message: 'Empty catch block - errors are being silently ignored',
        suggestion: 'Handle the error properly or log it at minimum',
        rule: 'no-empty-catch'
      }
    ];

    const jsPatterns = [
      {
        regex: /var\s+\w+/g,
        severity: 'suggestion' as const,
        category: 'style' as const,
        message: 'var keyword used - consider using let or const',
        suggestion: 'Use const for values that are not reassigned, let otherwise',
        rule: 'no-var'
      },
      {
        regex: /function\s+\w+\s*\([^)]{80,}\)/g,
        severity: 'warning' as const,
        category: 'style' as const,
        message: 'Function has too many parameters',
        suggestion: 'Consider using an options object or breaking into smaller functions',
        rule: 'max-params'
      },
      {
        regex: /=>\s*{[^}]{300,}}/g,
        severity: 'warning' as const,
        category: 'style' as const,
        message: 'Arrow function is too complex',
        suggestion: 'Break this function into smaller, more readable pieces',
        rule: 'complexity'
      }
    ];

    const pythonPatterns = [
      {
        regex: /from\s+\w+\s+import\s+\*/g,
        severity: 'warning' as const,
        category: 'style' as const,
        message: 'Wildcard import detected',
        suggestion: 'Import specific names to avoid namespace pollution',
        rule: 'wildcard-import'
      },
      {
        regex: /except:/g,
        severity: 'warning' as const,
        category: 'bestPractices' as const,
        message: 'Bare except clause detected',
        suggestion: 'Catch specific exceptions instead',
        rule: 'bare-except'
      },
      {
        regex: /print\s*\(/g,
        severity: 'suggestion' as const,
        category: 'bestPractices' as const,
        message: 'Print statement found',
        suggestion: 'Use the logging module instead',
        rule: 'no-print'
      }
    ];

    switch (language) {
      case 'javascript':
      case 'typescript':
        return [...commonPatterns, ...jsPatterns];
      case 'python':
        return [...commonPatterns, ...pythonPatterns];
      default:
        return commonPatterns;
    }
  }

  private filterBySeverity(issues: CodeIssue[]): CodeIssue[] {
    const strictness = this.config.review.strictness;
    
    // Define which severity levels to show based on strictness
    const severityFilter: Record<string, string[]> = {
      low: ['critical'],
      medium: ['critical', 'warning'],
      high: ['critical', 'warning', 'suggestion']
    };

    const allowed = severityFilter[strictness] || severityFilter.medium;
    return issues.filter(issue => allowed.includes(issue.severity));
  }

  private generateIssueId(file: string, line: number): string {
    return `${file}:${line}:${Date.now()}`;
  }

  /**
   * Generate initial team standards from existing codebase
   */
  async learnFromCodebase(code: string, language: Language): Promise<Partial<TeamStandard>[]> {
    if (!this.client) {
      return this.extractStandardsFromPatterns(code, language);
    }

    try {
      const prompt = `Analyze this ${language} code and extract coding standards and patterns that should be enforced:

\`\`\`${language}
${code}
\`\`\`

Return a JSON array of standards in this format:
[{"rule": "rule-name", "description": "...", "category": "security|performance|bestPractices|style|documentation", "weight": 1.0}]`;

      const response = await this.client.chat.completions.create({
        model: this.config.ai.model,
        messages: [
          {
            role: 'system',
            content: 'You are a code patterns expert. Extract coding standards from code.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return [];

      const standards = JSON.parse(content);
      return standards.map((s: any) => ({
        ...s,
        id: this.generateIssueId(s.rule, 0),
        feedbackCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        lastUpdated: new Date()
      }));
    } catch (error) {
      console.error('Failed to learn from codebase:', error);
      return this.extractStandardsFromPatterns(code, language);
    }
  }

  private extractStandardsFromPatterns(code: string, language: Language): Partial<TeamStandard>[] {
    // Extract basic standards from code patterns
    const standards: Partial<TeamStandard>[] = [];

    if (language === 'typescript' || language === 'javascript') {
      if (code.includes('interface ') || code.includes('type ')) {
        standards.push({
          rule: 'use-types',
          description: 'Use TypeScript types/interfaces for better type safety',
          category: 'bestPractices',
          weight: 1.0
        });
      }
    }

    return standards;
  }

  /**
   * Generate contextual feedback message
   */
  async generateFeedback(issue: CodeIssue, teamStandards: TeamStandard[]): Promise<string> {
    const relevantStandard = teamStandards.find(s => s.rule === issue.rule);
    
    let feedback = `**${issue.severity.toUpperCase()}**: ${issue.message}`;
    
    if (issue.suggestion) {
      feedback += `\n\nSuggestion: ${issue.suggestion}`;
    }

    if (relevantStandard && relevantStandard.weight > 1.5) {
      feedback += `\n\n> This aligns with your team's standard: ${relevantStandard.description}`;
    }

    return feedback;
  }
}
