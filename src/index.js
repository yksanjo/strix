/**
 * Strix - Autonomous Recon Agent Platform
 * Main entry point
 */

const { SOAROrchestrator, quickScan, fullScan } = require('./soar/orchestrator');
const { discoverTarget } = require('./modules/discovery');
const { assessVulnerabilities } = require('./modules/vuln');
const { simulateExploits } = require('./modules/exploit');
const { generatePDFReport } = require('./modules/pdf');
const Logger = require('./utils/logger');

module.exports = {
  // Main classes
  SOAROrchestrator,
  
  // Scan functions
  quickScan,
  fullScan,
  
  // Modules
  discoverTarget,
  assessVulnerabilities,
  simulateExploits,
  generatePDFReport,
  
  // Utilities
  Logger,
  
  // Version
  version: '1.0.0'
};
