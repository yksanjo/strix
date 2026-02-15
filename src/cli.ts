#!/usr/bin/env node

/**
 * CLI Interface for CodeReview AI
 * Command-line tool for running code reviews
 */

import { Command } from 'commander';
import * as fs from 'fs';
import ora from 'ora';
import chalk from 'chalk';
import { Analyzer } from './engine/analyzer';
import { FeedbackGenerator } from './feedback/generator';
import { Learner } from './learning/learner';
import { GitHubWebhook } from './github/webhook';
import { getConfigManager, initializeConfigManager } from './config/manager';
import { initializeStore } from './db/store';
import * as readline from 'readline';

async function main() {
  const program = new Command();

  // Initialize components
  await initializeConfigManager();
  await initializeStore();
  
  const configManager = getConfigManager();
  const analyzer = new Analyzer();
  const feedbackGenerator = new FeedbackGenerator();
  const learner = new Learner();

  program
    .name('codereview')
    .description('AI-Powered Code Review Bot - Automated code reviewer that learns your team\'s standards')
    .version('1.0.0');

  // Analyze command
  program
    .command('analyze')
    .description('Analyze code files or directories')
    .argument('<path>', 'File or directory to analyze')
    .option('-c, --config <path>', 'Path to config file')
    .option('-o, --output <format>', 'Output format (terminal, json, markdown)', 'terminal')
    .option('--strictness <level>', 'Review strictness (low, medium, high)', 'medium')
    .action(async (targetPath: string, options: any) => {
      const spinner = ora('Analyzing code...').start();
      
      try {
        // Update config if provided
        if (options.config) {
          configManager.loadFromFile(options.config);
        }
        
        const config = configManager.getConfig();
        config.output.format = options.output;
        config.review.strictness = options.strictness;
        
        let result;
        
        // Check if path is file or directory
        const stats = fs.statSync(targetPath);
        
        if (stats.isFile()) {
          const analysis = await analyzer.analyzeFile(targetPath);
          result = {
            files: [analysis],
            summary: {
              totalFiles: 1,
              totalIssues: analysis.issues.length,
              critical: analysis.issues.filter(i => i.severity === 'critical').length,
              warning: analysis.issues.filter(i => i.severity === 'warning').length,
              suggestion: analysis.issues.filter(i => i.severity === 'suggestion').length,
              byCategory: {
                security: analysis.issues.filter(i => i.category === 'security').length,
                performance: analysis.issues.filter(i => i.category === 'performance').length,
                bestPractices: analysis.issues.filter(i => i.category === 'bestPractices').length,
                style: analysis.issues.filter(i => i.category === 'style').length,
                documentation: analysis.issues.filter(i => i.category === 'documentation').length
              }
            },
            duration: 0,
            timestamp: new Date()
          };
        } else if (stats.isDirectory()) {
          result = await analyzer.analyzeDirectory(targetPath);
        } else {
          spinner.fail('Invalid path');
          process.exit(1);
        }
        
        spinner.stop();
        
        // Output results
        const output = feedbackGenerator.generateOutput(result);
        console.log(output);
        
        // Exit with error code if critical issues found
        if (result.summary.critical > 0) {
          process.exit(1);
        }
      } catch (error: any) {
        spinner.fail(`Error: ${error.message}`);
        console.error(error);
        process.exit(1);
      }
    });

  // Learn command
  program
    .command('learn')
    .description('Learn team standards from an existing codebase')
    .argument('<directory>', 'Directory to analyze and learn from')
    .action(async (dirPath: string) => {
      const spinner = ora('Learning from codebase...').start();
      
      try {
        const standards = await learner.learnFromCodebase(dirPath);
        spinner.succeed(`Learned ${standards.length} team standards`);
        
        if (standards.length > 0) {
          console.log('\nLearned Standards:');
          console.log('─'.repeat(50));
          
          for (const standard of standards) {
            console.log(`\n📌 ${chalk.bold(standard.rule)}`);
            console.log(`   ${standard.description}`);
            console.log(`   Category: ${standard.category} | Weight: ${standard.weight.toFixed(2)}`);
          }
        }
      } catch (error: any) {
        spinner.fail(`Error: ${error.message}`);
        console.error(error);
        process.exit(1);
      }
    });

  // Standards command
  program
    .command('standards')
    .description('Show current team standards')
    .option('-c, --category <category>', 'Filter by category')
    .action(async (options: any) => {
      try {
        const standards = options.category 
          ? learner.getStandardsByCategory(options.category as any)
          : learner.getStandards();
        
        if (standards.length === 0) {
          console.log(chalk.yellow('No team standards defined yet.'));
          console.log(chalk.gray('Run "codereview learn <directory>" to learn from your codebase.'));
          return;
        }
        
        console.log(chalk.bold.cyan('\n═══ Team Standards ═══\n'));
        
        for (const standard of standards) {
          const acceptanceRate = standard.feedbackCount > 0 
            ? (standard.acceptedCount / standard.feedbackCount * 100).toFixed(0)
            : 'N/A';
          
          console.log(`📌 ${chalk.bold(standard.rule)}`);
          console.log(`   ${standard.description}`);
          console.log(`   Category: ${standard.category}`);
          console.log(`   Weight: ${chalk.green(standard.weight.toFixed(2))}`);
          console.log(`   Feedback: ${standard.feedbackCount} (${acceptanceRate}% accepted)`);
          console.log('');
        }
        
        // Show stats
        const stats = learner.getStats();
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`Total Standards: ${stats.totalStandards}`);
        console.log(`Total Feedback: ${stats.totalFeedback}`);
        console.log(`Average Acceptance: ${(stats.averageAcceptanceRate * 100).toFixed(0)}%`);
      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Config command
  program
    .command('config')
    .description('Manage configuration')
    .addCommand(
      new Command('get')
        .description('Get config value')
        .argument('<key>', 'Config key (e.g., ai.model)')
        .action((key: string) => {
          const value = configManager.get(key);
          console.log(JSON.stringify(value, null, 2));
        })
    )
    .addCommand(
      new Command('set')
        .description('Set config value')
        .argument('<key>', 'Config key (e.g., ai.model)')
        .argument('<value>', 'Config value')
        .action(async (key: string, value: string) => {
          try {
            let parsedValue: any = value;
            try {
              parsedValue = JSON.parse(value);
            } catch {
              // Keep as string
            }
            
            await configManager.set(key, parsedValue);
            console.log(chalk.green(`✓ Set ${key} to ${value}`));
          } catch (error: any) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
          }
        })
    )
    .addCommand(
      new Command('show')
        .description('Show current configuration')
        .action(() => {
          const config = configManager.getConfig();
          console.log(JSON.stringify(config, null, 2));
        })
    )
    .addCommand(
      new Command('reset')
        .description('Reset configuration to defaults')
        .action(() => {
          configManager.reset();
          console.log(chalk.green('✓ Configuration reset to defaults'));
        })
    );

  // Server command
  program
    .command('server')
    .description('Start the webhook server for GitHub integration')
    .option('-p, --port <port>', 'Port to run on', '3000')
    .option('-s, --secret <secret>', 'GitHub webhook secret')
    .action((options: any) => {
      console.log(chalk.cyan('\n🚀 Starting CodeReview AI Server...\n'));
      
      const webhook = new GitHubWebhook(options.secret);
      webhook.start(parseInt(options.port));
    });

  // Feedback command
  program
    .command('feedback')
    .description('Provide feedback on a review issue')
    .argument('<issue-id>', 'Issue ID to provide feedback on')
    .argument('<accepted>', 'Was the feedback accepted? (yes/no)')
    .option('-c, --comment <comment>', 'Optional comment')
    .action(async (issueId: string, accepted: string, options: any) => {
      try {
        const isAccepted = accepted.toLowerCase() === 'yes' || accepted.toLowerCase() === 'y';
        learner.processFeedback(issueId, isAccepted, options.comment);
        
        console.log(chalk.green(`✓ Feedback recorded for issue ${issueId}`));
        console.log(chalk.gray(`  Accepted: ${isAccepted}`));
        if (options.comment) {
          console.log(chalk.gray(`  Comment: ${options.comment}`));
        }
      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Interactive review command
  program
    .command('review')
    .description('Start an interactive code review session')
    .argument('<path>', 'File or directory to review')
    .action(async (targetPath: string) => {
      const spinner = ora('Starting interactive review...').start();
      
      try {
        let result;
        const stats = fs.statSync(targetPath);
        
        if (stats.isFile()) {
          const analysis = await analyzer.analyzeFile(targetPath);
          result = {
            files: [analysis],
            summary: {
              totalFiles: 1,
              totalIssues: analysis.issues.length,
              critical: analysis.issues.filter(i => i.severity === 'critical').length,
              warning: analysis.issues.filter(i => i.severity === 'warning').length,
              suggestion: analysis.issues.filter(i => i.severity === 'suggestion').length,
              byCategory: {
                security: analysis.issues.filter(i => i.category === 'security').length,
                performance: analysis.issues.filter(i => i.category === 'performance').length,
                bestPractices: analysis.issues.filter(i => i.category === 'bestPractices').length,
                style: analysis.issues.filter(i => i.category === 'style').length,
                documentation: analysis.issues.filter(i => i.category === 'documentation').length
              }
            },
            duration: 0,
            timestamp: new Date()
          };
        } else {
          result = await analyzer.analyzeDirectory(targetPath);
        }
        
        spinner.stop();
        
        console.log(feedbackGenerator.generateTerminalOutput(result));
        
        const allIssues = result.files.flatMap(f => f.issues);
        
        if (allIssues.length > 0) {
          console.log(chalk.cyan('\n═══ Provide Feedback ═══\n'));
          
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          const askFeedback = (index: number) => {
            if (index >= allIssues.length) {
              console.log(chalk.green('\n✓ Thank you for your feedback!'));
              rl.close();
              return;
            }
            
            const issue = allIssues[index];
            console.log(`\nIssue ${index + 1}/${allIssues.length}`);
            console.log(chalk.gray('─'.repeat(40)));
            console.log(`File: ${issue.file}:${issue.line}`);
            console.log(`Severity: ${issue.severity} | Category: ${issue.category}`);
            console.log(`Message: ${issue.message}`);
            
            rl.question('\nWas this feedback helpful? (y/n/q): ', async (answer) => {
              const lower = answer.toLowerCase();
              
              if (lower === 'q') {
                rl.close();
                return;
              }
              
              if (lower === 'y' || lower === 'n') {
                learner.processFeedback(issue.id, lower === 'y');
              }
              
              askFeedback(index + 1);
            });
          };
          
          askFeedback(0);
        }
      } catch (error: any) {
        spinner.fail(`Error: ${error.message}`);
        process.exit(1);
      }
    });

  // Initialize command
  program
    .command('init')
    .description('Initialize CodeReview AI')
    .action(() => {
      console.log(chalk.cyan('Initializing CodeReview AI...\n'));
      console.log(chalk.green('✓ Database initialized'));
      console.log(chalk.green('✓ Configuration loaded'));
      
      console.log(chalk.gray('\nNext steps:'));
      console.log('  1. Set your AI API key:');
      console.log(chalk.gray('     export OPENAI_API_KEY=your-key'));
      console.log('     or');
      console.log(chalk.gray('     export ANTHROPIC_API_KEY=your-key'));
      console.log('\n  2. Learn from your codebase:');
      console.log(chalk.gray('     codereview learn ./src'));
      console.log('\n  3. Run a review:');
      console.log(chalk.gray('     codereview analyze ./src'));
      console.log('\n  4. Start webhook server (optional):');
      console.log(chalk.gray('     codereview server'));
    });

  // Parse commands
  program.parse();
}

main().catch(console.error);
