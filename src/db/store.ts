/**
 * SQLite Database Store for CodeReview AI
 * Uses sql.js (pure JavaScript SQLite) for persistence
 */

import * as path from 'path';
import * as fs from 'fs';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { TeamStandard, Feedback, Config } from '../types';

export class DatabaseStore {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private initialized: boolean = false;

  constructor(dbPath: string = './data/codereview.db') {
    this.dbPath = dbPath;
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const SQL = await initSqlJs();
    
    // Load existing database if it exists
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    // Create tables
    this.db.run(`
      CREATE TABLE IF NOT EXISTS team_standards (
        id TEXT PRIMARY KEY,
        rule TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        weight REAL DEFAULT 1.0,
        feedback_count INTEGER DEFAULT 0,
        accepted_count INTEGER DEFAULT 0,
        rejected_count INTEGER DEFAULT 0,
        last_updated TEXT NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL,
        accepted INTEGER NOT NULL,
        comment TEXT,
        timestamp TEXT NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS review_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file TEXT NOT NULL,
        language TEXT NOT NULL,
        issues_json TEXT NOT NULL,
        timestamp TEXT NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    this.save();
    this.initialized = true;
  }

  private save(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
  }

  // Team Standards Methods
  getAllStandards(): TeamStandard[] {
    this.ensureInitialized();
    const results = this.db!.exec('SELECT * FROM team_standards ORDER BY weight DESC');
    if (results.length === 0) return [];

    return results[0].values.map((row: any[]) => ({
      id: row[0],
      rule: row[1],
      description: row[2],
      category: row[3],
      weight: row[4],
      feedbackCount: row[5],
      acceptedCount: row[6],
      rejectedCount: row[7],
      lastUpdated: new Date(row[8])
    }));
  }

  getStandardsByCategory(category: string): TeamStandard[] {
    this.ensureInitialized();
    const stmt = this.db!.prepare('SELECT * FROM team_standards WHERE category = ? ORDER BY weight DESC');
    stmt.bind([category]);
    
    const standards: TeamStandard[] = [];
    while (stmt.step()) {
      const row = stmt.get();
      standards.push({
        id: row[0] as string,
        rule: row[1] as string,
        description: row[2] as string,
        category: row[3] as any,
        weight: row[4] as number,
        feedbackCount: row[5] as number,
        acceptedCount: row[6] as number,
        rejectedCount: row[7] as number,
        lastUpdated: new Date(row[8] as string)
      });
    }
    stmt.free();
    return standards;
  }

  upsertStandard(standard: TeamStandard): void {
    this.ensureInitialized();
    
    // Check if exists
    const existing = this.db!.exec(`SELECT id FROM team_standards WHERE id = '${standard.id}'`);
    
    if (existing.length > 0 && existing[0].values.length > 0) {
      this.db!.run(`
        UPDATE team_standards SET
          rule = ?, description = ?, category = ?, weight = ?,
          feedback_count = ?, accepted_count = ?, rejected_count = ?, last_updated = ?
        WHERE id = ?
      `, [
        standard.rule, standard.description, standard.category, standard.weight,
        standard.feedbackCount, standard.acceptedCount, standard.rejectedCount,
        standard.lastUpdated.toISOString(), standard.id
      ]);
    } else {
      this.db!.run(`
        INSERT INTO team_standards (id, rule, description, category, weight, feedback_count, accepted_count, rejected_count, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        standard.id, standard.rule, standard.description, standard.category, standard.weight,
        standard.feedbackCount, standard.acceptedCount, standard.rejectedCount,
        standard.lastUpdated.toISOString()
      ]);
    }
    
    this.save();
  }

  deleteStandard(id: string): void {
    this.ensureInitialized();
    this.db!.run('DELETE FROM team_standards WHERE id = ?', [id]);
    this.save();
  }

  // Feedback Methods
  addFeedback(feedback: Feedback): void {
    this.ensureInitialized();
    this.db!.run(`
      INSERT INTO feedback (id, issue_id, accepted, comment, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `, [
      feedback.id,
      feedback.issueId,
      feedback.accepted ? 1 : 0,
      feedback.comment || null,
      feedback.timestamp.toISOString()
    ]);
    this.save();
  }

  getFeedbackByIssue(issueId: string): Feedback[] {
    this.ensureInitialized();
    const stmt = this.db!.prepare('SELECT * FROM feedback WHERE issue_id = ? ORDER BY timestamp DESC');
    stmt.bind([issueId]);

    const feedbacks: Feedback[] = [];
    while (stmt.step()) {
      const row = stmt.get();
      feedbacks.push({
        id: row[0] as string,
        issueId: row[1] as string,
        accepted: row[2] === 1,
        comment: row[3] as string | undefined,
        timestamp: new Date(row[4] as string)
      });
    }
    stmt.free();
    return feedbacks;
  }

  getRecentFeedback(limit: number = 100): Feedback[] {
    this.ensureInitialized();
    const results = this.db!.exec(`SELECT * FROM feedback ORDER BY timestamp DESC LIMIT ${limit}`);
    if (results.length === 0) return [];

    return results[0].values.map((row: any[]) => ({
      id: row[0],
      issueId: row[1],
      accepted: row[2] === 1,
      comment: row[3],
      timestamp: new Date(row[4])
    }));
  }

  // Review History Methods
  addReviewHistory(file: string, language: string, issues: any[]): void {
    this.ensureInitialized();
    this.db!.run(`
      INSERT INTO review_history (file, language, issues_json, timestamp)
      VALUES (?, ?, ?, ?)
    `, [file, language, JSON.stringify(issues), new Date().toISOString()]);
    this.save();
  }

  getReviewHistory(limit: number = 100): any[] {
    this.ensureInitialized();
    const results = this.db!.exec(`SELECT * FROM review_history ORDER BY timestamp DESC LIMIT ${limit}`);
    if (results.length === 0) return [];

    return results[0].values.map((row: any[]) => ({
      id: row[0],
      file: row[1],
      language: row[2],
      issues_json: row[3],
      timestamp: row[4]
    }));
  }

  // Config Methods
  getConfig(key: string): string | null {
    this.ensureInitialized();
    const results = this.db!.exec(`SELECT value FROM config WHERE key = '${key}'`);
    if (results.length === 0 || results[0].values.length === 0) return null;
    return results[0].values[0][0] as string;
  }

  setConfig(key: string, value: string): void {
    this.ensureInitialized();
    
    const existing = this.db!.exec(`SELECT key FROM config WHERE key = '${key}'`);
    if (existing.length > 0 && existing[0].values.length > 0) {
      this.db!.run('UPDATE config SET value = ? WHERE key = ?', [value, key]);
    } else {
      this.db!.run('INSERT INTO config (key, value) VALUES (?, ?)', [key, value]);
    }
    this.save();
  }

  getAllConfig(): Record<string, string> {
    this.ensureInitialized();
    const results = this.db!.exec('SELECT key, value FROM config');
    if (results.length === 0) return {};

    const config: Record<string, string> = {};
    for (const row of results[0].values) {
      config[row[0] as string] = row[1] as string;
    }
    return config;
  }

  // Learning: Update standard weights based on feedback
  updateWeightsFromFeedback(): void {
    const standards = this.getAllStandards();
    for (const standard of standards) {
      if (standard.feedbackCount > 0) {
        const acceptanceRate = standard.acceptedCount / standard.feedbackCount;
        standard.weight = standard.weight * (0.5 + 0.5 * acceptanceRate) * Math.min(1 + standard.feedbackCount * 0.1, 2);
        this.upsertStandard(standard);
      }
    }
  }

  // Cleanup
  close(): void {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
    }
  }
}

let storeInstance: DatabaseStore | null = null;
let initPromise: Promise<DatabaseStore> | null = null;

export function getStore(dbPath?: string): DatabaseStore {
  if (!storeInstance) {
    storeInstance = new DatabaseStore(dbPath);
  }
  return storeInstance;
}

export async function initializeStore(dbPath?: string): Promise<DatabaseStore> {
  if (!storeInstance) {
    storeInstance = new DatabaseStore(dbPath);
  }
  await storeInstance.initialize();
  return storeInstance;
}

export function closeStore(): void {
  if (storeInstance) {
    storeInstance.close();
    storeInstance = null;
  }
}
