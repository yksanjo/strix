/**
 * Core type definitions for CodeReview AI
 */

export type Severity = 'critical' | 'warning' | 'suggestion';
export type Category = 'security' | 'performance' | 'bestPractices' | 'style' | 'documentation';
export type Strictness = 'low' | 'medium' | 'high';
export type Language = 'javascript' | 'typescript' | 'python' | 'go' | 'rust' | 'java' | 'c' | 'cpp' | 'csharp' | 'ruby' | 'php' | 'swift' | 'kotlin' | 'scala' | 'bash' | 'unknown';

export interface CodeIssue {
  id: string;
  file: string;
  line: number;
  column?: number;
  severity: Severity;
  category: Category;
  message: string;
  suggestion?: string;
  code?: string;
  rule?: string;
}

export interface FileAnalysis {
  file: string;
  language: Language;
  content: string;
  lines: number;
  issues: CodeIssue[];
  timestamp: Date;
}

export interface ReviewResult {
  files: FileAnalysis[];
  summary: {
    totalFiles: number;
    totalIssues: number;
    critical: number;
    warning: number;
    suggestion: number;
    byCategory: Record<Category, number>;
  };
  duration: number;
  timestamp: Date;
}

export interface TeamStandard {
  id: string;
  rule: string;
  description: string;
  category: Category;
  weight: number;
  feedbackCount: number;
  acceptedCount: number;
  rejectedCount: number;
  lastUpdated: Date;
}

export interface Feedback {
  id: string;
  issueId: string;
  accepted: boolean;
  comment?: string;
  timestamp: Date;
}

export interface Config {
  ai: {
    provider: 'openai' | 'anthropic';
    model: string;
    temperature: number;
    maxTokens: number;
    apiKey?: string;
  };
  review: {
    strictness: Strictness;
    categories: Record<Category, boolean>;
    maxIssuesPerFile: number;
    ignorePatterns: string[];
  };
  learning: {
    enabled: boolean;
    minFeedbackCount: number;
    decayFactor: number;
  };
  github: {
    webhookPath: string;
    autoReview: boolean;
    requireApproval: boolean;
    token?: string;
  };
  database: {
    path: string;
  };
  output: {
    format: 'terminal' | 'json' | 'markdown';
    showLineNumbers: boolean;
    colorize: boolean;
  };
}

export interface GitHubPullRequest {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body?: string;
  head: string;
  base: string;
  author: string;
}

export interface GitHubWebhookPayload {
  action: string;
  number: number;
  pull_request: {
    id: number;
    number: number;
    title: string;
    body: string;
    html_url: string;
    user: {
      login: string;
    };
    head: {
      sha: string;
      ref: string;
    };
    base: {
      ref: string;
      sha: string;
    };
    changed_files: number;
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
    };
  };
  sender: {
    login: string;
  };
}

export interface AIPromptContext {
  code: string;
  file: string;
  language: Language;
  standards: TeamStandard[];
  config: Config;
  diff?: string;
}
