/**
 * Logging utilities with colored output
 */

const chalk = require('chalk');

class Logger {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.noColor = options.noColor || false;
    
    if (this.noColor) {
      chalk.level = 0;
    }
  }

  setVerbose(verbose) {
    this.verbose = verbose;
  }

  info(message) {
    console.log(chalk.blue('ℹ'), message);
  }

  success(message) {
    console.log(chalk.green('✓'), message);
  }

  warning(message) {
    console.log(chalk.yellow('⚠'), message);
  }

  error(message) {
    console.log(chalk.red('✗'), message);
  }

  debug(message) {
    if (this.verbose) {
      console.log(chalk.gray('[DEBUG]'), message);
    }
  }

  section(title) {
    console.log(chalk.cyan.bold('\n' + '═'.repeat(60)));
    console.log(chalk.cyan.bold(`  ${title}`));
    console.log(chalk.cyan.bold('═'.repeat(60) + '\n'));
  }

  subsection(title) {
    console.log(chalk.cyan('\n▶ ') + chalk.bold(title));
  }

  banner() {
    console.log(chalk.cyan(`
    ███████╗██╗   ██╗██████╗ ███████╗██████╗     ██████╗ ███████╗ ██████╗ 
    ██╔════╝██║   ██║██╔══██╗██╔════╝██╔══██╗    ██╔══██╗██╔════╝██╔════╝ 
    ███████╗██║   ██║██████╔╝█████╗  ██████╔╝    ██████╔╝█████╗  ██║      
    ╚════██║██║   ██║██╔═══╝ ██╔══╝  ██╔══██╗    ██╔══██╗██╔══╝  ██║      
    ███████║╚██████╔╝██║     ███████╗██║  ██║    ██║  ██║███████╗╚██████╗ 
    ╚══════╝ ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═╝    ╚═╝  ╚═╝╚══════╝ ╚═════╝ 
    `));
    console.log(chalk.white.bold('    Autonomous Recon Agent Platform'));
    console.log(chalk.gray('    "Security Recon in 60 seconds"\n'));
  }

  progress(current, total, message = '') {
    const percent = Math.round((current / total) * 100);
    const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
    process.stdout.write(`\r${chalk.blue('▓')} [${bar}] ${percent}% ${message}`);
    if (current === total) {
      process.stdout.write('\n');
    }
  }

  table(headers, rows) {
    const colWidths = headers.map((h, i) => {
      const maxRow = Math.max(...rows.map(r => (r[i] || '').toString().length));
      return Math.max(h.length, maxRow);
    });

    const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join(chalk.gray(' │ '));
    console.log(chalk.gray('┌') + colWidths.map(w => '─'.repeat(w)).join(chalk.gray('─┬─')) + chalk.gray('┐'));
    console.log(chalk.cyan(headerRow));
    console.log(chalk.gray('├') + colWidths.map(w => '─'.repeat(w)).join(chalk.gray('─┼─')) + chalk.gray('┤'));
    
    rows.forEach(row => {
      const rowStr = row.map((cell, i) => (cell || '').toString().padEnd(colWidths[i])).join(chalk.gray(' │ '));
      console.log(rowStr);
    });
    
    console.log(chalk.gray('└') + colWidths.map(w => '─'.repeat(w)).join(chalk.gray('─┴─')) + chalk.gray('┘'));
  }
}

module.exports = Logger;
