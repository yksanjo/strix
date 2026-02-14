/**
 * SOAR Orchestration Module
 * Security Orchestration, Automation & Response
 * Coordinates the entire reconnaissance workflow
 */

const Logger = require('../utils/logger');
const { discoverTarget } = require('../modules/discovery');
const { assessVulnerabilities } = require('../modules/vuln');
const { simulateExploits, analyzeAttackSurface } = require('../modules/exploit');
const { generatePDFReport } = require('../modules/pdf');

/**
 * SOAR Orchestrator - Main workflow controller
 */
class SOAROrchestrator {
  constructor(options = {}) {
    this.logger = new Logger({
      verbose: options.verbose,
      noColor: options.noColor
    });
    this.timeout = (options.timeout || 60) * 1000;
    this.options = options;
    this.workflow = [];
    this.results = {};
    this.startTime = null;
    this.endTime = null;
  }

  /**
   * Execute full reconnaissance workflow
   * @param {string} target - Target to scan
   * @returns {Promise<object>} - Complete scan results
   */
  async execute(target) {
    this.startTime = new Date();
    this.logger.banner();
    this.logger.section('Starting SOAR Orchestration');
    this.logger.info(`Target: ${target}`);
    this.logger.info(`Timeout: ${this.timeout / 1000}s`);
    this.logger.info(`Mode: ${this.options.quick ? 'Quick' : 'Full'}`);

    try {
      // Phase 1: Discovery
      await this.runPhase('Discovery', async () => {
        const discoveryResults = await discoverTarget(target, {
          timeout: this.options.timeout,
          quick: this.options.quick,
          verbose: this.options.verbose,
          ports: this.options.ports
        });
        this.results.discovery = discoveryResults;
        return discoveryResults;
      });

      // Phase 2: Vulnerability Assessment
      await this.runPhase('Vulnerability Assessment', async () => {
        const vulnResults = await assessVulnerabilities(this.results.discovery, {
          verbose: this.options.verbose
        });
        this.results.vulnerabilities = vulnResults;
        return vulnResults;
      });

      // Phase 3: Exploit Simulation (Educational)
      await this.runPhase('Exploit Simulation', async () => {
        const exploitResults = await simulateExploits(this.results.vulnerabilities, {
          verbose: this.options.verbose
        });
        this.results.exploits = exploitResults;
        return exploitResults;
      });

      // Phase 4: Attack Surface Analysis
      await this.runPhase('Attack Surface Analysis', async () => {
        const attackSurface = analyzeAttackSurface(
          this.results.discovery,
          this.results.vulnerabilities
        );
        this.results.attackSurface = attackSurface;
        return attackSurface;
      });

      // Generate final results
      this.endTime = new Date();
      this.results.summary = this.generateSummary();

      // Generate PDF if requested
      if (this.options.output) {
        await this.runPhase('Report Generation', async () => {
          await generatePDFReport(this.results, this.options.output);
          this.logger.success(`Report saved to: ${this.options.output}`);
        });
      }

      // Display summary
      this.displaySummary();

      return this.results;

    } catch (error) {
      this.logger.error(`Workflow failed: ${error.message}`);
      if (this.options.verbose) {
        this.logger.error(error.stack);
      }
      throw error;
    }
  }

  /**
   * Run a workflow phase with timing
   */
  async runPhase(name, fn) {
    const phaseLogger = this.logger;
    phaseLogger.subsection(name);

    const phaseStart = Date.now();
    this.workflow.push({ name, status: 'running', startTime: phaseStart });

    try {
      const result = await this.executeWithTimeout(fn, name);
      const elapsed = ((Date.now() - phaseStart) / 1000).toFixed(2);
      
      phaseLogger.success(`${name} completed in ${elapsed}s`);
      
      this.workflow[this.workflow.length - 1] = {
        name,
        status: 'completed',
        duration: elapsed,
        startTime: phaseStart,
        endTime: Date.now()
      };

      return result;
    } catch (error) {
      this.workflow[this.workflow.length - 1] = {
        name,
        status: 'failed',
        error: error.message,
        startTime: phaseStart,
        endTime: Date.now()
      };
      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  async executeWithTimeout(fn, phaseName) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`${phaseName} phase timed out`));
      }, this.timeout);

      fn()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Generate executive summary
   */
  generateSummary() {
    const totalTime = ((this.endTime - this.startTime) / 1000).toFixed(2);
    const vulnResults = this.results.vulnerabilities || {};
    const discoveryResults = this.results.discovery || {};
    const exploitResults = this.results.exploits || {};

    // Calculate overall risk score
    const riskScore = Math.round(
      (vulnResults.riskScore || 0) * 0.6 +
      (exploitResults.riskDistribution?.critical || 0) * 10 +
      (exploitResults.riskDistribution?.high || 0) * 5
    );

    return {
      target: discoveryResults.target,
      ip: discoveryResults.ip,
      scanDate: this.startTime.toISOString(),
      scanDuration: totalTime,
      riskScore: Math.min(100, riskScore),
      riskLevel: this.getRiskLevel(riskScore),
      stats: {
        openPorts: discoveryResults.openPortCount || 0,
        services: discoveryResults.openPorts?.length || 0,
        vulnerabilities: {
          critical: vulnResults.criticalCount || 0,
          high: vulnResults.highCount || 0,
          medium: vulnResults.mediumCount || 0,
          low: vulnResults.lowCount || 0,
          info: vulnResults.infoCount || 0,
          total: vulnResults.findings?.length || 0
        },
        simulations: exploitResults.totalSimulations || 0,
        attackVectors: this.results.attackSurface?.totalVectors || 0
      },
      phases: this.workflow,
      recommendation: this.results.attackSurface?.recommendation || ''
    };
  }

  /**
   * Get risk level from score
   */
  getRiskLevel(score) {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    if (score >= 20) return 'LOW';
    return 'MINIMAL';
  }

  /**
   * Display summary to console
   */
  displaySummary() {
    const summary = this.summary || this.results.summary;
    const logger = this.logger;

    logger.section('Scan Complete');

    // Risk Score
    const riskColors = {
      CRITICAL: 'red',
      HIGH: 'yellow',
      MEDIUM: 'yellow',
      LOW: 'green',
      MINIMAL: 'green'
    };
    
    logger.info(`Risk Level: ${logger.constructor.prototype[riskColors[summary.riskLevel]]?.() || ''}${summary.riskLevel}`);
    logger.info(`Risk Score: ${summary.riskScore}/100`);

    // Stats
    logger.subsection('Statistics');
    logger.info(`Open Ports: ${summary.stats.openPorts}`);
    logger.info(`Services: ${summary.stats.services}`);
    logger.info(`Vulnerabilities: ${summary.stats.vulnerabilities.total}`);
    logger.info(`  - Critical: ${summary.stats.vulnerabilities.critical}`);
    logger.info(`  - High: ${summary.stats.vulnerabilities.high}`);
    logger.info(`  - Medium: ${summary.stats.vulnerabilities.medium}`);
    logger.info(`  - Low: ${summary.stats.vulnerabilities.low}`);

    // Recommendation
    if (summary.recommendation) {
      logger.subsection('Recommendation');
      logger.warning(summary.recommendation);
    }

    // Phase timing
    logger.subsection('Phase Timing');
    for (const phase of this.workflow) {
      logger.info(`${phase.name}: ${phase.duration || 'N/A'}s`);
    }

    logger.info(`\nTotal scan time: ${summary.scanDuration}s`);
    
    if (this.options.output) {
      logger.success(`\nPDF Report: ${this.options.output}`);
    }
  }

  /**
   * Get workflow status
   */
  getStatus() {
    return {
      running: this.workflow.some(p => p.status === 'running'),
      completed: this.workflow.every(p => p.status === 'completed'),
      failed: this.workflow.some(p => p.status === 'failed'),
      phases: this.workflow
    };
  }
}

/**
 * Quick scan with minimal checks
 */
async function quickScan(target, options = {}) {
  const orchestrator = new SOAROrchestrator({
    ...options,
    quick: true,
    timeout: 30
  });
  return orchestrator.execute(target);
}

/**
 * Full comprehensive scan
 */
async function fullScan(target, options = {}) {
  const orchestrator = new SOAROrchestrator({
    ...options,
    quick: false,
    timeout: options.timeout || 60
  });
  return orchestrator.execute(target);
}

module.exports = {
  SOAROrchestrator,
  quickScan,
  fullScan
};
