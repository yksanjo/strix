/**
 * Recon Command
 * Main command that ties together all modules
 */

const { SOAROrchestrator } = require('../soar/orchestrator');
const { parsePorts } = require('../utils/validators');

/**
 * Execute reconnaissance command
 * @param {string} target - Target to scan
 * @param {object} options - Command options
 * @returns {Promise<void>}
 */
async function reconCommand(target, options) {
  // Parse options
  const reconOptions = {
    timeout: parseInt(options.timeout, 10) || 60,
    quick: options.quick || false,
    verbose: options.verbose || false,
    noColor: options.noColor || false,
    output: options.output || null,
    ports: options.ports ? parsePorts(options.ports) : null
  };

  // Create and execute orchestrator
  const orchestrator = new SOAROrchestrator(reconOptions);
  
  try {
    await orchestrator.execute(target);
  } catch (error) {
    console.error('Reconnaissance failed:', error.message);
    if (reconOptions.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

module.exports = {
  reconCommand
};
