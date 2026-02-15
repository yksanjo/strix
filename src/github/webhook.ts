/**
 * GitHub Webhook Handler for CodeReview AI
 * Handles GitHub PR events and posts automated reviews
 */

import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { Octokit } from 'octokit';
import * as crypto from 'crypto';
import { GitHubWebhookPayload, Config, ReviewResult } from '../types';
import { Analyzer } from '../engine/analyzer';
import { FeedbackGenerator } from '../feedback/generator';
import { getConfigManager } from '../config/manager';
import { getStore } from '../db/store';

export class GitHubWebhook {
  private app: express.Application;
  private octokit: Octokit | null = null;
  private config: Config;
  private analyzer: Analyzer;
  private feedbackGenerator: FeedbackGenerator;
  private webhookSecret: string;

  constructor(webhookSecret?: string) {
    this.app = express();
    this.config = getConfigManager().getConfig();
    this.analyzer = new Analyzer(this.config);
    this.feedbackGenerator = new FeedbackGenerator(this.config);
    this.webhookSecret = webhookSecret || process.env.GITHUB_WEBHOOK_SECRET || '';
    
    this.setupMiddleware();
    this.setupRoutes();
    
    if (this.config.github.token) {
      this.octokit = new Octokit({ auth: this.config.github.token });
    }
  }

  private setupMiddleware(): void {
    this.app.use(bodyParser.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      }
    }));

    // Webhook signature verification
    this.app.use((req: Request, res: Response, next) => {
      if (this.webhookSecret) {
        const signature = req.headers['x-hub-signature-256'] as string;
        if (!this.verifySignature(req as any, signature)) {
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }
      }
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', service: 'codereview-ai' });
    });

    // Webhook endpoint
    this.app.post(this.config.github.webhookPath, async (req: Request, res: Response) => {
      try {
        await this.handleWebhook(req.body, req as any);
        res.json({ status: 'processed' });
      } catch (error) {
        console.error('Webhook handling error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Manual review trigger
    this.app.post('/review', async (req: Request, res: Response) => {
      try {
        const { owner, repo, pull_number } = req.body;
        if (!owner || !repo || !pull_number) {
          res.status(400).json({ error: 'Missing required fields: owner, repo, pull_number' });
          return;
        }

        const result = await this.reviewPullRequest(owner, repo, pull_number);
        res.json(result);
      } catch (error) {
        console.error('Review error:', error);
        res.status(500).json({ error: 'Failed to review pull request' });
      }
    });
  }

  private verifySignature(req: any, signature: string): boolean {
    if (!signature || !this.webhookSecret) {
      return !this.webhookSecret; // Allow if no secret configured
    }

    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    const digest = 'sha256=' + hmac.update(req.rawBody).digest('hex');
    
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  }

  private async handleWebhook(payload: GitHubWebhookPayload, req: any): Promise<void> {
    const event = req.headers['x-github-event'] as string;
    
    console.log(`Received GitHub event: ${event}`);
    
    // Only handle pull request events
    if (event !== 'pull_request') {
      console.log(`Ignoring event: ${event}`);
      return;
    }

    const action = payload.action;
    const pr = payload.pull_request;
    const repo = payload.repository;

    // Only process certain actions
    if (!['opened', 'synchronize', 'reopened'].includes(action)) {
      console.log(`Ignoring PR action: ${action}`);
      return;
    }

    console.log(`Processing PR #${pr.number} - ${pr.title}`);
    
    // Get the PR files
    const files = await this.getPullRequestFiles(
      repo.owner.login,
      repo.name,
      pr.number
    );

    // Analyze each file
    const results: ReviewResult[] = [];
    for (const file of files) {
      // Create a temporary file for analysis
      const tempFile = {
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch
      };

      // For simplicity, we'll analyze the file content if available
      if (file.contents_url) {
        try {
          // Get file content from the API
          const content = await this.getFileContent(repo.owner.login, repo.name, file.filename, pr.head.sha);
          const result = await this.analyzer.analyzeFile(file.filename);
          results.push({
            files: [result],
            summary: {
              totalFiles: 1,
              totalIssues: result.issues.length,
              critical: result.issues.filter(i => i.severity === 'critical').length,
              warning: result.issues.filter(i => i.severity === 'warning').length,
              suggestion: result.issues.filter(i => i.severity === 'suggestion').length,
              byCategory: {
                security: result.issues.filter(i => i.category === 'security').length,
                performance: result.issues.filter(i => i.category === 'performance').length,
                bestPractices: result.issues.filter(i => i.category === 'bestPractices').length,
                style: result.issues.filter(i => i.category === 'style').length,
                documentation: result.issues.filter(i => i.category === 'documentation').length
              }
            },
            duration: 0,
            timestamp: new Date()
          });
        } catch (error) {
          console.error(`Error analyzing ${file.filename}:`, error);
        }
      }
    }

    // Combine results
    const combinedResult = this.combineResults(results);

    // Post review to GitHub
    if (this.octokit && this.config.github.autoReview) {
      await this.postReview(
        repo.owner.login,
        repo.name,
        pr.number,
        combinedResult
      );
    }
  }

  private async getPullRequestFiles(owner: string, repo: string, pullNumber: number): Promise<any[]> {
    if (!this.octokit) {
      console.warn('No GitHub token configured, skipping file fetch');
      return [];
    }

    try {
      const { data } = await this.octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber
      });
      return data;
    } catch (error) {
      console.error('Error fetching PR files:', error);
      return [];
    }
  }

  private async getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string> {
    if (!this.octokit) {
      return '';
    }

    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref
      });

      if ('content' in data && data.content) {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }
      return '';
    } catch (error) {
      console.error(`Error fetching content for ${path}:`, error);
      return '';
    }
  }

  private async reviewPullRequest(owner: string, repo: string, pullNumber: number): Promise<ReviewResult> {
    const pr = await this.octokit?.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber
    });

    if (!pr) {
      throw new Error('Failed to get pull request');
    }

    const files = await this.getPullRequestFiles(owner, repo, pullNumber);
    const results: ReviewResult[] = [];

    for (const file of files) {
      const content = await this.getFileContent(owner, repo, file.filename, pr.data.head.sha);
      if (content) {
        const result = await this.analyzer.analyzeFile(file.filename);
        results.push({
          files: [result],
          summary: {
            totalFiles: 1,
            totalIssues: result.issues.length,
            critical: result.issues.filter(i => i.severity === 'critical').length,
            warning: result.issues.filter(i => i.severity === 'warning').length,
            suggestion: result.issues.filter(i => i.severity === 'suggestion').length,
            byCategory: {
              security: result.issues.filter(i => i.category === 'security').length,
              performance: result.issues.filter(i => i.category === 'performance').length,
              bestPractices: result.issues.filter(i => i.category === 'bestPractices').length,
              style: result.issues.filter(i => i.category === 'style').length,
              documentation: result.issues.filter(i => i.category === 'documentation').length
            }
          },
          duration: 0,
          timestamp: new Date()
        });
      }
    }

    return this.combineResults(results);
  }

  private combineResults(results: ReviewResult[]): ReviewResult {
    const allFiles = results.flatMap(r => r.files);
    
    const summary = {
      totalFiles: allFiles.length,
      totalIssues: results.reduce((sum, r) => sum + r.summary.totalIssues, 0),
      critical: results.reduce((sum, r) => sum + r.summary.critical, 0),
      warning: results.reduce((sum, r) => sum + r.summary.warning, 0),
      suggestion: results.reduce((sum, r) => sum + r.summary.suggestion, 0),
      byCategory: {
        security: results.reduce((sum, r) => sum + r.summary.byCategory.security, 0),
        performance: results.reduce((sum, r) => sum + r.summary.byCategory.performance, 0),
        bestPractices: results.reduce((sum, r) => sum + r.summary.byCategory.bestPractices, 0),
        style: results.reduce((sum, r) => sum + r.summary.byCategory.style, 0),
        documentation: results.reduce((sum, r) => sum + r.summary.byCategory.documentation, 0)
      }
    };

    return {
      files: allFiles,
      summary,
      duration: results.reduce((sum, r) => sum + r.duration, 0),
      timestamp: new Date()
    };
  }

  private async postReview(owner: string, repo: string, pullNumber: number, result: ReviewResult): Promise<void> {
    if (!this.octokit) {
      console.warn('No GitHub token configured, cannot post review');
      return;
    }

    const reviewBody = this.feedbackGenerator.generateGitHubComment(result);
    const { annotations } = this.feedbackGenerator.generateGitHubReviewBody(result);

    // Determine review state
    let state: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' = 'COMMENT';
    if (result.summary.critical > 0) {
      state = 'REQUEST_CHANGES';
    }

    try {
      await this.octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: pullNumber,
        body: reviewBody,
        event: state,
        comments: annotations.slice(0, 50).map(a => ({
          path: a.path,
          line: a.line,
          body: a.message
        }))
      });

      console.log(`Posted review to ${owner}/${repo}#${pullNumber}`);
    } catch (error) {
      console.error('Error posting review:', error);
    }
  }

  /**
   * Start the webhook server
   */
  start(port: number = 3000): void {
    this.app.listen(port, () => {
      console.log(`🚀 CodeReview AI webhook server running on port ${port}`);
      console.log(`   Webhook URL: http://localhost:${port}${this.config.github.webhookPath}`);
    });
  }

  /**
   * Get the Express app for testing
   */
  getApp(): express.Application {
    return this.app;
  }
}
