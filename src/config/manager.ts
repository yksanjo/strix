/**
 * Configuration Manager for CodeReview AI
 * Handles loading, saving, and merging configurations
 */

import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../types';
import { getStore, initializeStore } from '../db/store';

const DEFAULT_CONFIG_PATH = path.join(__dirname, '../../config/default.json');

export class ConfigManager {
  private config: Config;
  private configPath: string;
  private initialized: boolean = false;

  constructor(configPath?: string) {
    this.configPath = configPath || DEFAULT_CONFIG_PATH;
    this.config = this.getBuiltInDefault();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load default config
    let defaultConfig: Config;
    try {
      const defaultContent = fs.readFileSync(this.configPath, 'utf-8');
      defaultConfig = JSON.parse(defaultContent);
    } catch (error) {
      console.warn('Failed to load default config, using built-in defaults');
      defaultConfig = this.getBuiltInDefault();
    }

    // Override with environment variables
    const envConfig = this.loadFromEnvironment();
    
    // Override with stored config from database
    const storedConfig = await this.loadFromDatabase();

    // Merge all configs: default < stored < env
    this.config = this.mergeConfigs(defaultConfig, storedConfig, envConfig);
    this.initialized = true;
  }

  private getBuiltInDefault(): Config {
    return {
      ai: {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.3,
        maxTokens: 4000
      },
      review: {
        strictness: 'medium',
        categories: {
          security: true,
          performance: true,
          bestPractices: true,
          style: true,
          documentation: true
        },
        maxIssuesPerFile: 20,
        ignorePatterns: [
          'node_modules/**',
          'dist/**',
          'build/**',
          '*.min.js',
          '*.map',
          '.git/**'
        ]
      },
      learning: {
        enabled: true,
        minFeedbackCount: 3,
        decayFactor: 0.95
      },
      github: {
        webhookPath: '/webhook',
        autoReview: true,
        requireApproval: false
      },
      database: {
        path: './data/codereview.db'
      },
      output: {
        format: 'terminal',
        showLineNumbers: true,
        colorize: true
      }
    };
  }

  private loadFromEnvironment(): Partial<Config> {
    const envConfig: Partial<Config> = {};

    if (process.env.OPENAI_API_KEY) {
      envConfig.ai = {
        provider: 'openai',
        model: process.env.AI_MODEL || 'gpt-4',
        temperature: parseFloat(process.env.AI_TEMPERATURE || '0.3'),
        maxTokens: parseInt(process.env.AI_MAX_TOKENS || '4000'),
        apiKey: process.env.OPENAI_API_KEY
      };
    }

    if (process.env.ANTHROPIC_API_KEY) {
      envConfig.ai = {
        provider: 'anthropic',
        model: process.env.AI_MODEL || 'claude-3-opus',
        temperature: parseFloat(process.env.AI_TEMPERATURE || '0.3'),
        maxTokens: parseInt(process.env.AI_MAX_TOKENS || '4000'),
        apiKey: process.env.ANTHROPIC_API_KEY
      };
    }

    if (process.env.GITHUB_TOKEN) {
      envConfig.github = {
        webhookPath: '/webhook',
        autoReview: true,
        requireApproval: false,
        token: process.env.GITHUB_TOKEN
      };
    }

    if (process.env.DB_PATH) {
      envConfig.database = {
        path: process.env.DB_PATH
      };
    }

    return envConfig;
  }

  private async loadFromDatabase(): Promise<Partial<Config>> {
    try {
      const store = getStore();
      await store.initialize();
      const stored = store.getAllConfig();
      
      if (Object.keys(stored).length === 0) {
        return {};
      }

      const config: Partial<Config> = {};
      
      if (stored.aiProvider) {
        config.ai = {
          provider: stored.aiProvider as 'openai' | 'anthropic',
          model: stored.aiModel || 'gpt-4',
          temperature: parseFloat(stored.aiTemperature || '0.3'),
          maxTokens: parseInt(stored.aiMaxTokens || '4000'),
          apiKey: stored.aiApiKey
        };
      }

      if (stored.reviewStrictness) {
        config.review = {
          strictness: stored.reviewStrictness as 'low' | 'medium' | 'high',
          categories: {
            security: stored.categorySecurity !== 'false',
            performance: stored.categoryPerformance !== 'false',
            bestPractices: stored.categoryBestPractices !== 'false',
            style: stored.categoryStyle !== 'false',
            documentation: stored.categoryDocumentation !== 'false'
          },
          maxIssuesPerFile: parseInt(stored.maxIssuesPerFile || '20'),
          ignorePatterns: stored.ignorePatterns ? JSON.parse(stored.ignorePatterns) : []
        };
      }

      if (stored.learningEnabled !== undefined) {
        config.learning = {
          enabled: stored.learningEnabled === 'true',
          minFeedbackCount: parseInt(stored.minFeedbackCount || '3'),
          decayFactor: parseFloat(stored.decayFactor || '0.95')
        };
      }

      if (stored.githubWebhookPath) {
        config.github = {
          webhookPath: stored.githubWebhookPath,
          autoReview: stored.githubAutoReview !== 'false',
          requireApproval: stored.githubRequireApproval === 'true',
          token: stored.githubToken
        };
      }

      if (stored.databasePath) {
        config.database = {
          path: stored.databasePath
        };
      }

      if (stored.outputFormat) {
        config.output = {
          format: stored.outputFormat as 'terminal' | 'json' | 'markdown',
          showLineNumbers: stored.outputShowLineNumbers !== 'false',
          colorize: stored.outputColorize !== 'false'
        };
      }

      return config;
    } catch (error) {
      return {};
    }
  }

  private mergeConfigs(...configs: Partial<Config>[]): Config {
    const defaultConfig = this.getBuiltInDefault();
    
    for (const config of configs) {
      if (!config) continue;
      
      if (config.ai) {
        defaultConfig.ai = { ...defaultConfig.ai, ...config.ai };
      }
      if (config.review) {
        defaultConfig.review = { ...defaultConfig.review, ...config.review };
        if (config.review.categories) {
          defaultConfig.review.categories = { ...defaultConfig.review.categories, ...config.review.categories };
        }
      }
      if (config.learning) {
        defaultConfig.learning = { ...defaultConfig.learning, ...config.learning };
      }
      if (config.github) {
        defaultConfig.github = { ...defaultConfig.github, ...config.github };
      }
      if (config.database) {
        defaultConfig.database = { ...defaultConfig.database, ...config.database };
      }
      if (config.output) {
        defaultConfig.output = { ...defaultConfig.output, ...config.output };
      }
    }

    return defaultConfig;
  }

  getConfig(): Config {
    return this.config;
  }

  async setConfig(key: string, value: string): Promise<void> {
    const store = getStore();
    await store.initialize();
    store.setConfig(key, value);
    // Reload config
    await this.initialize();
  }

  get<T>(path: string): T {
    const keys = path.split('.');
    let result: any = this.config;
    
    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = result[key];
      } else {
        return undefined as T;
      }
    }
    
    return result as T;
  }

  async set<T>(path: string, value: T): Promise<void> {
    const keys = path.split('.');
    let current: any = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }
    
    const lastKey = keys[keys.length - 1];
    current[lastKey] = value;
    
    // Save to database
    const store = getStore();
    await store.initialize();
    store.setConfig(path, JSON.stringify(value));
  }

  reset(): void {
    this.config = this.getBuiltInDefault();
  }

  saveToFile(filePath: string): void {
    fs.writeFileSync(filePath, JSON.stringify(this.config, null, 2));
  }

  loadFromFile(filePath: string): void {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileConfig = JSON.parse(content);
    this.config = this.mergeConfigs(this.config, fileConfig);
  }
}

let configInstance: ConfigManager | null = null;

export function getConfigManager(configPath?: string): ConfigManager {
  if (!configInstance) {
    configInstance = new ConfigManager(configPath);
  }
  return configInstance;
}

export async function initializeConfigManager(configPath?: string): Promise<ConfigManager> {
  if (!configInstance) {
    configInstance = new ConfigManager(configPath);
  }
  await configInstance.initialize();
  return configInstance;
}

export function resetConfigManager(): void {
  configInstance = null;
}
