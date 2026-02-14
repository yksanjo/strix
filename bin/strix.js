#!/usr/bin/env node

/**
 * Strix - Autonomous Recon Agent Platform
 * CLI Entry Point
 * "Security Recon in 60 seconds"
 */

const { program } = require('commander');
const chalk = require('chalk');
const { reconCommand } = require('../src/commands/recon');
const { validateTarget } = require('../src/utils/validators');

program
  .name('strix')
  .description('Strix - Autonomous Recon Agent Platform\n"Security Recon in 60 seconds"')
  .version('1.0.0');

// Main recon command
program
  .command('recon')
  .description('Run full security reconnaissance scan')
  .argument('<target>', 'Target domain, IP address, or CIDR range')
  .option('-o, --output <file>', 'Output PDF report path')
  .option('-t, --timeout <seconds>', 'Maximum scan time in seconds', '60')
  .option('-q, --quick', 'Quick scan mode (reduced checks)', false)
  .option('-v, --verbose', 'Verbose output', false)
  .option('--no-color', 'Disable colored output')
  .option('-p, --ports <ports>', 'Custom ports to scan (comma-separated)')
  .action(async (target, options) => {
    try {
      // Validate target
      if (!validateTarget(target)) {
        console.error(chalk.red('✗ Invalid target format'));
        console.log(chalk.yellow('Please provide a valid domain, IP address, or CIDR range'));
        process.exit(1);
      }

      // Disable colors if requested
      if (options.noColor) {
        chalk.level = 0;
      }

      // Run recon
      await reconCommand(target, options);
    } catch (error) {
      console.error(chalk.red('✗ Error:'), error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Scan command alias
program
  .command('scan')
  .description('Alias for recon command')
  .argument('<target>', 'Target domain, IP address, or CIDR range')
  .option('-o, --output <file>', 'Output PDF report path')
  .option('-t, --timeout <seconds>', 'Maximum scan time in seconds', '60')
  .option('-q, --quick', 'Quick scan mode (reduced checks)', false)
  .option('-v, --verbose', 'Verbose output', false)
  .option('--no-color', 'Disable colored output')
  .action(async (target, options) => {
    // Reuse recon command logic
    program.commands.find(c => c.name() === 'recon').parse(['strix', 'recon', target, ...process.argv.slice(4)]);
  });

// Help command enhancement
program.on('command:*', () => {
  console.error(chalk.red('✗ Invalid command: %s'), program.args.join(' '));
  console.log(chalk.yellow('Run "strix --help" for available commands'));
  process.exit(1);
});

program.parse(process.argv);
