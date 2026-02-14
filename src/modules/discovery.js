/**
 * Target Discovery Module
 * Discovers live hosts, open ports, and services
 */

const net = require('net');
const { promisify } = require('util');
const dns = require('dns').promises;
const { dnsLookup } = require('../dns/sslip');
const Logger = require('../utils/logger');

const socketConnect = promisify(net.connect);

/**
 * Check if a port is open on a host
 * @param {string} host - Host IP or hostname
 * @param {number} port - Port number
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<boolean>}
 */
async function checkPort(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      cleanup();
      resolve(true);
    });

    socket.on('timeout', () => {
      cleanup();
      resolve(false);
    });

    socket.on('error', () => {
      cleanup();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * Scan multiple ports on a host
 * @param {string} host - Host to scan
 * @param {number[]} ports - Ports to scan
 * @param {Logger} logger - Logger instance
 * @param {AbortSignal} signal - Abort signal
 * @returns {Promise<Array>} - Open ports with service info
 */
async function scanPorts(host, ports, logger, signal) {
  const results = [];
  const portServiceMap = getCommonPortServices();

  for (let i = 0; i < ports.length; i++) {
    if (signal && signal.aborted) break;
    
    const port = ports[i];
    logger.progress(i + 1, ports.length, `Scanning port ${port}`);

    try {
      const isOpen = await checkPort(host, port, 2000);
      if (isOpen) {
        results.push({
          port,
          service: portServiceMap[port] || 'unknown',
          state: 'open'
        });
        logger.debug(`Port ${port} is open (${portServiceMap[port] || 'unknown'})`);
      }
    } catch (error) {
      logger.debug(`Error scanning port ${port}: ${error.message}`);
    }
  }

  return results;
}

/**
 * Get common port to service mapping
 */
function getCommonPortServices() {
  return {
    20: 'ftp-data',
    21: 'ftp',
    22: 'ssh',
    23: 'telnet',
    25: 'smtp',
    53: 'dns',
    80: 'http',
    110: 'pop3',
    111: 'rpcbind',
    135: 'msrpc',
    139: 'netbios-ssn',
    143: 'imap',
    443: 'https',
    445: 'microsoft-ds',
    993: 'imaps',
    995: 'pop3s',
    1433: 'mssql',
    1521: 'oracle',
    3306: 'mysql',
    3389: 'rdp',
    5432: 'postgresql',
    5900: 'vnc',
    6379: 'redis',
    8080: 'http-proxy',
    8443: 'https-alt',
    27017: 'mongodb'
  };
}

/**
 * Discover target information
 * @param {string} target - Target domain, IP, or CIDR
 * @param {object} options - Options
 * @returns {Promise<object>} - Discovery results
 */
async function discoverTarget(target, options = {}) {
  const logger = new Logger({ verbose: options.verbose });
  const timeout = (options.timeout || 60) * 1000;
  const startTime = Date.now();
  const signal = { aborted: false };

  // Set up timeout
  const timeoutId = setTimeout(() => {
    signal.aborted = true;
    logger.warning('Discovery timeout reached');
  }, timeout);

  try {
    logger.section('Target Discovery');
    logger.info(`Resolving target: ${target}`);

    // Resolve target to IP
    const { ip, usingSslip } = await dnsLookup(target);
    
    if (!ip) {
      throw new Error(`Could not resolve target: ${target}`);
    }

    logger.success(`Resolved to IP: ${ip}`);
    if (usingSslip) {
      logger.info('Using sslip.io DNS resolution');
    }

    // Determine target type
    const targetType = determineTargetType(target, ip);
    logger.info(`Target type: ${targetType}`);

    // Get ports to scan
    const ports = options.ports || [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 993, 995, 1433, 3306, 3389, 5432, 5900, 8080, 8443];
    
    if (options.quick) {
      // Quick scan - fewer ports
      ports.splice(8); // Only scan first 8 ports
    }

    logger.subsection('Port Scanning');
    logger.info(`Scanning ${ports.length} ports on ${ip}...`);

    const openPorts = await scanPorts(ip, ports, logger, signal);

    // Service detection (basic)
    const services = await detectServices(ip, openPorts, logger);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    return {
      target,
      ip,
      targetType,
      usingSslip,
      openPorts: services,
      totalPortsScanned: ports.length,
      openPortCount: openPorts.length,
      scanTime: elapsed,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Discovery failed: ${error.message}`);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Determine target type
 */
function determineTargetType(target, ip) {
  if (target.includes('/')) return 'cidr';
  if (/^\d+\.\d+\.\d+\.\d+$/.test(target)) return 'ip';
  if (target.includes(':')) return 'ipv6';
  return 'domain';
}

/**
 * Basic service detection via banner grabbing
 */
async function detectServices(host, openPorts, logger) {
  const results = [];

  for (const port of openPorts) {
    let serviceInfo = {
      port: port.port,
      service: port.service,
      state: 'open'
    };

    try {
      // Try to get service banner
      const banner = await grabBanner(host, port.port);
      if (banner) {
        serviceInfo.banner = banner;
        serviceInfo.version = extractVersion(banner);
      }
    } catch (error) {
      logger.debug(`Could not grab banner for port ${port.port}`);
    }

    results.push(serviceInfo);
  }

  return results;
}

/**
 * Grab service banner
 */
async function grabBanner(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let data = '';
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeout);

    socket.on('data', (chunk) => {
      data += chunk.toString();
      if (data.length > 0) {
        cleanup();
        resolve(data.trim().substring(0, 200));
      }
    });

    socket.on('timeout', () => {
      cleanup();
      resolve(null);
    });

    socket.on('error', () => {
      cleanup();
      resolve(null);
    });

    // HTTP/HTTPS special handling
    if (port === 80 || port === 8080) {
      socket.write('HEAD / HTTP/1.0\r\n\r\n');
    } else if (port === 443 || port === 8443) {
      // HTTPS - just connect and wait
    }

    socket.connect(port, host);
  });
}

/**
 * Extract version info from banner
 */
function extractVersion(banner) {
  if (!banner) return null;
  
  // Look for version patterns
  const versionPatterns = [
    /([\w]+)\s+(\d+\.\d+)/i,
    /version\s+(\d+\.\d+)/i,
    /([\w]+)\/(\d+\.\d+)/i
  ];

  for (const pattern of versionPatterns) {
    const match = banner.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

module.exports = {
  discoverTarget,
  checkPort,
  scanPorts,
  detectServices,
  grabBanner
};
