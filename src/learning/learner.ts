/**
 * Learning System for CodeReview AI
 * Learns team standards from feedback and historical reviews
 */

import { TeamStandard, Feedback, Category } from '../types';
import { getStore } from '../db/store';
import { getConfigManager } from '../config/manager';
import { AIService } from '../engine/ai';
import { Parser } from '../engine/parser';

export class Learner {
  private store: ReturnType<typeof getStore>;
  private config: ReturnType<typeof getConfigManager>;
  private aiService: AIService;
  private parser: Parser;

  constructor() {
    this.store = getStore();
    this.config = getConfigManager();
    this.aiService = new AIService();
    this.parser = new Parser();
  }

  /**
   * Learn team standards from an existing codebase
   */
  async learnFromCodebase(dirPath: string): Promise<TeamStandard[]> {
    const config = this.config.getConfig();
    if (!config.learning.enabled) {
      console.log('Learning is disabled in configuration');
      return [];
    }

    console.log(`Learning from codebase: ${dirPath}`);
    
    // Get all code files
    const files = await this.parser.getCodeFiles(
      dirPath, 
      config.review.ignorePatterns
    );

    console.log(`Found ${files.length} code files to analyze`);

    const allStandards: Partial<TeamStandard>[] = [];

    // Analyze each file and extract standards
    for (const file of files) {
      try {
        const { content, language } = await this.parser.getFileInfo(file);
        const standards = await this.aiService.learnFromCodebase(content, language);
        allStandards.push(...standards);
      } catch (error) {
        console.error(`Error learning from ${file}:`, error);
      }
    }

    // Deduplicate and merge standards
    const mergedStandards = this.mergeStandards(allStandards);
    
    // Save to database
    const savedStandards: TeamStandard[] = [];
    for (const standard of mergedStandards) {
      const fullStandard: TeamStandard = {
        id: this.generateId(standard.rule!),
        rule: standard.rule!,
        description: standard.description!,
        category: standard.category!,
        weight: standard.weight || 1.0,
        feedbackCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        lastUpdated: new Date()
      };
      
      this.store.upsertStandard(fullStandard);
      savedStandards.push(fullStandard);
    }

    console.log(`Learned ${savedStandards.length} team standards`);
    return savedStandards;
  }

  /**
   * Process feedback on an issue
   */
  processFeedback(issueId: string, accepted: boolean, comment?: string): void {
    const feedback: Feedback = {
      id: this.generateId(issueId + Date.now()),
      issueId,
      accepted,
      comment,
      timestamp: new Date()
    };

    this.store.addFeedback(feedback);

    // Extract rule from issue ID and update standard
    const rule = this.extractRuleFromIssue(issueId);
    if (rule) {
      this.updateStandardFromFeedback(rule, accepted);
    }
  }

  /**
   * Update standard weights based on feedback
   */
  private updateStandardFromFeedback(rule: string, accepted: boolean): void {
    const standards = this.store.getAllStandards();
    const standard = standards.find(s => s.rule === rule);

    if (standard) {
      standard.feedbackCount++;
      if (accepted) {
        standard.acceptedCount++;
      } else {
        standard.rejectedCount++;
      }
      standard.lastUpdated = new Date();

      // Recalculate weight
      const acceptanceRate = standard.acceptedCount / standard.feedbackCount;
      standard.weight = standard.weight * (0.5 + 0.5 * acceptanceRate) * 
                       Math.min(1 + standard.feedbackCount * 0.1, 2);

      this.store.upsertStandard(standard);
    }
  }

  /**
   * Get all team standards
   */
  getStandards(): TeamStandard[] {
    return this.store.getAllStandards();
  }

  /**
   * Get standards by category
   */
  getStandardsByCategory(category: Category): TeamStandard[] {
    return this.store.getStandardsByCategory(category);
  }

  /**
   * Add a manual standard
   */
  addStandard(standard: Omit<TeamStandard, 'id' | 'feedbackCount' | 'acceptedCount' | 'rejectedCount' | 'lastUpdated'>): TeamStandard {
    const fullStandard: TeamStandard = {
      ...standard,
      id: this.generateId(standard.rule),
      feedbackCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      lastUpdated: new Date()
    };

    this.store.upsertStandard(fullStandard);
    return fullStandard;
  }

  /**
   * Remove a standard
   */
  removeStandard(id: string): void {
    this.store.deleteStandard(id);
  }

  /**
   * Merge duplicate standards
   */
  private mergeStandards(standards: Partial<TeamStandard>[]): Partial<TeamStandard>[] {
    const merged = new Map<string, Partial<TeamStandard>>();

    for (const standard of standards) {
      if (!standard.rule) continue;

      const key = standard.rule;
      if (merged.has(key)) {
        const existing = merged.get(key)!;
        // Merge by taking max weight
        if (standard.weight && standard.weight > (existing.weight || 0)) {
          existing.weight = standard.weight;
        }
        if (standard.description && !existing.description) {
          existing.description = standard.description;
        }
      } else {
        merged.set(key, standard);
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Extract rule name from issue ID
   */
  private extractRuleFromIssue(issueId: string): string | null {
    // Issue ID format: file:line:timestamp
    // We need to look up the issue to get the rule
    // For now, return null and let the system handle it
    return null;
  }

  /**
   * Generate unique ID
   */
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get learning statistics
   */
  getStats(): {
    totalStandards: number;
    standardsByCategory: Record<Category, number>;
    totalFeedback: number;
    averageAcceptanceRate: number;
  } {
    const standards = this.store.getAllStandards();
    const feedback = this.store.getRecentFeedback(1000);

    const standardsByCategory: Record<Category, number> = {
      security: 0,
      performance: 0,
      bestPractices: 0,
      style: 0,
      documentation: 0
    };

    let totalAccepted = 0;
    let totalWithFeedback = 0;

    for (const standard of standards) {
      standardsByCategory[standard.category]++;
      if (standard.feedbackCount > 0) {
        totalAccepted += standard.acceptedCount;
        totalWithFeedback += standard.feedbackCount;
      }
    }

    return {
      totalStandards: standards.length,
      standardsByCategory,
      totalFeedback: feedback.length,
      averageAcceptanceRate: totalWithFeedback > 0 ? totalAccepted / totalWithFeedback : 0
    };
  }
}
