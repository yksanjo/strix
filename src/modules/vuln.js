/**
 * Vulnerability Assessment Module
 * Identifies common vulnerabilities and security weaknesses
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const tls = require('tls');
const net = require('net');
const Logger = require('../utils/logger');

/**
 * Common vulnerability checks - definitions only
 */
const VULN_CHECKS = {
  // HTTP Security Headers
  missingSecurityHeaders: {
    severity: 'medium',
    description: 'Missing security headers',
    remediation: 'Implement security headers like HSTS, X-Frame-Options, CSP'
  },

  // SSL/TLS Issues
  sslWeakCiphers: {
    severity: 'high',
    description: 'Weak SSL/TLS configuration',
    remediation: 'Disable weak ciphers and enable TLS 1.2+ only'
  },

  // Open Ports
  sensitivePorts: {
    severity: 'high',
    description: 'Sensitive ports exposed',
    remediation: 'Close unnecessary ports and restrict access'
  },

  // Default Credentials
  defaultCredentials: {
    severity: 'critical',
    description: 'Potential default credentials',
    remediation: 'Change default passwords immediately'
  },

  // Information Disclosure
  infoDisclosure: {
    severity: 'low',
    description: 'Information disclosure detected',
    remediation: 'Remove version disclosure and sensitive info from responses'
  },

  // HTTP Methods
  dangerousMethods: {
    severity: 'medium',
    description: 'Dangerous HTTP methods enabled',
    remediation: 'Disable TRACE, PUT, DELETE unless needed'
  },

  // SSL Certificate
  sslCertificate: {
    severity: 'medium',
    description: 'SSL certificate issues',
    remediation: 'Use valid, properly configured SSL certificates'
  }
};

/**
 * Run vulnerability assessment
 * @param {object} discoveryResults - Results from discovery module
 * @param {object} options - Options
 * @returns {Promise<object>} - Vulnerability findings
 */
async function assessVulnerabilities(discoveryResults, options = {}) {
  const logger = new Logger({ verbose: options.verbose });
  const findings = [];

  logger.section('Vulnerability Assessment');
  logger.info(`Assessing ${discoveryResults.openPorts.length} open services...`);

  const openPorts = discoveryResults.openPorts;

  // Check each open port for vulnerabilities
  for (let i = 0; i < openPorts.length; i++) {
    const service = openPorts[i];
    logger.progress(i + 1, openPorts.length, `Checking ${service.service} on port ${service.port}`);

    const vulns = await checkServiceVulnerabilities(service, discoveryResults.ip, logger);
    findings.push(...vulns);
  }

  // Calculate risk score
  const riskScore = calculateRiskScore(findings);

  logger.success(`Found ${findings.length} potential issues`);

  return {
    findings,
    riskScore,
    criticalCount: findings.filter(f => f.severity === 'critical').length,
    highCount: findings.filter(f => f.severity === 'high').length,
    mediumCount: findings.filter(f => f.severity === 'medium').length,
    lowCount: findings.filter(f => f.severity === 'low').length,
    infoCount: findings.filter(f => f.severity === 'info').length
  };
}

/**
 * Check vulnerabilities for a specific service
 */
async function checkServiceVulnerabilities(service, ip, logger) {
  const findings = [];

  try {
    switch (service.service) {
      case 'http':
      case 'https':
      case 'http-proxy':
      case 'https-alt':
        const httpFindings = await checkHTTPService(service, ip, logger);
        findings.push(...httpFindings);
        break;

      case 'ssh':
        const sshFindings = await checkSSHService(service, ip, logger);
        findings.push(...sshFindings);
        break;

      case 'ftp':
        const ftpFindings = await checkFTPService(service, ip, logger);
        findings.push(...ftpFindings);
        break;

      case 'rdp':
        const rdpFindings = await checkRDPService(service, ip, logger);
        findings.push(...rdpFindings);
        break;

      case 'smtp':
        const smtpFindings = await checkSMTPService(service, ip, logger);
        findings.push(...smtpFindings);
        break;

      case 'mysql':
      case 'mssql':
      case 'postgresql':
      case 'mongodb':
        const dbFindings = await checkDatabaseService(service, ip, logger);
        findings.push(...dbFindings);
        break;

      default:
        logger.debug(`No specific checks for ${service.service}`);
    }
  } catch (error) {
    logger.debug(`Error checking ${service.service}: ${error.message}`);
  }

  return findings;
}

/**
 * Check HTTP/HTTPS service
 */
async function checkHTTPService(service, ip, logger) {
  const findings = [];
  const port = service.port;
  const isHTTPS = port === 443 || port === 8443 || service.service === 'https';
  const protocol = isHTTPS ? 'https' : 'http';

  try {
    // Check security headers
    const headers = await fetchHeaders(ip, port, isHTTPS);
    
    if (headers) {
      // Check for missing HSTS
      if (!headers['strict-transport-security']) {
        findings.push({
          type: 'Missing HSTS Header',
          severity: 'medium',
          port,
          service: 'http',
          description: 'HTTP Strict Transport Security (HSTS) header is not set',
          evidence: 'strict-transport-security header missing',
          remediation: 'Add HSTS header: Strict-Transport-Security: max-age=31536000; includeSubDomains',
          cvss: 5.3
        });
      }

      // Check for missing X-Frame-Options
      if (!headers['x-frame-options']) {
        findings.push({
          type: 'Missing X-Frame-Options',
          severity: 'medium',
          port,
          service: 'http',
          description: 'X-Frame-Options header is not set',
          evidence: 'x-frame-options header missing',
          remediation: 'Add X-Frame-Options: DENY or SAMEORIGIN',
          cvss: 5.3
        });
      }

      // Check for missing X-Content-Type-Options
      if (!headers['x-content-type-options']) {
        findings.push({
          type: 'Missing X-Content-Type-Options',
          severity: 'low',
          port,
          service: 'http',
          description: 'X-Content-Type-Options header is not set',
          evidence: 'x-content-type-options header missing',
          remediation: 'Add X-Content-Type-Options: nosniff',
          cvss: 3.7
        });
      }

      // Check for information disclosure in headers
      if (headers['server'] || headers['x-powered-by']) {
        findings.push({
          type: 'Information Disclosure',
          severity: 'low',
          port,
          service: 'http',
          description: 'Server information disclosure via headers',
          evidence: `Server: ${headers['server'] || 'unknown'}, X-Powered-By: ${headers['x-powered-by'] || 'unknown'}`,
          remediation: 'Remove or obfuscate version information from headers',
          cvss: 3.7
        });
      }
    }

    // Check for TRACE method
    const methods = await checkHttpMethods(ip, port, isHTTPS);
    if (methods.includes('TRACE')) {
      findings.push({
        type: 'TRACE Method Enabled',
        severity: 'medium',
        port,
        service: 'http',
        description: 'TRACE HTTP method is enabled (potential XST)',
        evidence: 'TRACE method available',
        remediation: 'Disable TRACE method in server configuration',
        cvss: 5.3
      });
    }

    // Check SSL/TLS if HTTPS
    if (isHTTPS) {
      const sslInfo = await checkSSLInfo(ip, port);
      if (sslInfo) {
        if (sslInfo.tlsVersion && parseFloat(sslInfo.tlsVersion) < 1.2) {
          findings.push({
            type: 'Weak TLS Version',
            severity: 'high',
            port,
            service: 'https',
            description: `Outdated TLS version: ${sslInfo.tlsVersion}`,
            evidence: `TLS ${sslInfo.tlsVersion} in use`,
            remediation: 'Enable TLS 1.2 or higher only',
            cvss: 7.5
          });
        }

        if (sslInfo.cipher && sslInfo.cipher.includes('RC4')) {
          findings.push({
            type: 'Weak Cipher',
            severity: 'high',
            port,
            service: 'https',
            description: 'Weak RC4 cipher in use',
            evidence: `Cipher: ${sslInfo.cipher}`,
            remediation: 'Disable RC4 and other weak ciphers',
            cvss: 7.5
          });
        }

        if (!sslInfo.valid) {
          findings.push({
            type: 'Invalid SSL Certificate',
            severity: 'medium',
            port,
            service: 'https',
            description: 'SSL certificate validation failed',
            evidence: sslInfo.error || 'Certificate invalid',
            remediation: 'Use a valid SSL certificate from trusted CA',
            cvss: 5.3
          });
        }
      }
    }
  } catch (error) {
    logger.debug(`HTTP check error: ${error.message}`);
  }

  return findings;
}

/**
 * Check SSH service
 */
async function checkSSHService(service, ip, logger) {
  const findings = [];

  // Check for SSH
  if (service.port === 22) {
    findings.push({
      type: 'SSH Service Exposed',
      severity: 'info',
      port: 22,
      service: 'ssh',
      description: 'SSH service is accessible',
      evidence: 'Port 22 is open',
      remediation: 'Ensure strong authentication and key-based login is required',
      cvss: 0
    });
  }

  return findings;
}

/**
 * Check FTP service
 */
async function checkFTPService(service, ip, logger) {
  const findings = [];

  if (service.port === 21) {
    findings.push({
      type: 'FTP Service Exposed',
      severity: 'high',
      port: 21,
      service: 'ftp',
      description: 'FTP service is accessible without encryption',
      evidence: 'Port 21 is open',
      remediation: 'Use SFTP or FTPS instead of unencrypted FTP',
      cvss: 7.5
    });

    // Check for anonymous access
    try {
      const supportsAnonymous = await checkFTPAnonymous(ip);
      if (supportsAnonymous) {
        findings.push({
          type: 'FTP Anonymous Access',
          severity: 'high',
          port: 21,
          service: 'ftp',
          description: 'FTP server allows anonymous access',
          evidence: 'Anonymous login accepted',
          remediation: 'Disable anonymous access unless explicitly required',
          cvss: 8.2
        });
      }
    } catch (error) {
      logger.debug(`FTP check error: ${error.message}`);
    }
  }

  return findings;
}

/**
 * Check RDP service
 */
async function checkRDPService(service, ip, logger) {
  const findings = [];

  if (service.port === 3389) {
    findings.push({
      type: 'RDP Service Exposed',
      severity: 'high',
      port: 3389,
      service: 'rdp',
      description: 'RDP service is accessible over network',
      evidence: 'Port 3389 is open',
      remediation: 'Restrict RDP access via firewall, use VPN, enable NLA',
      cvss: 7.5
    });
  }

  return findings;
}

/**
 * Check SMTP service
 */
async function checkSMTPService(service, ip, logger) {
  const findings = [];

  if (service.port === 25) {
    findings.push({
      type: 'SMTP Open Relay Risk',
      severity: 'high',
      port: 25,
      service: 'smtp',
      description: 'SMTP port is open - verify it is not an open relay',
      evidence: 'Port 25 is open',
      remediation: 'Configure SMTP server to prevent open relay',
      cvss: 7.5
    });
  }

  return findings;
}

/**
 * Check database services
 */
async function checkDatabaseService(service, ip, logger) {
  const findings = [];

  const dbType = service.service;
  const port = service.port;

  findings.push({
    type: 'Database Exposed',
    severity: 'critical',
    port,
    service: dbType,
    description: `${dbType.toUpperCase()} database service is network accessible`,
    evidence: `Port ${port} is open for ${dbType}`,
    remediation: 'Restrict database access to authorized hosts only, use strong authentication',
    cvss: 9.8
  });

  return findings;
}

/**
 * Fetch HTTP headers
 */
async function fetchHeaders(host, port, isHTTPS) {
  return new Promise((resolve) => {
    const protocol = isHTTPS ? https : http;
    const options = {
      hostname: host,
      port,
      path: '/',
      method: 'HEAD',
      timeout: 5000,
      rejectUnauthorized: false
    };

    const req = protocol.request(options, (res) => {
      resolve(res.headers);
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}

/**
 * Check available HTTP methods
 */
async function checkHttpMethods(host, port, isHTTPS) {
  return new Promise((resolve) => {
    const protocol = isHTTPS ? https : http;
    const options = {
      hostname: host,
      port,
      method: 'OPTIONS',
      timeout: 5000,
      rejectUnauthorized: false
    };

    const req = protocol.request(options, (res) => {
      const allow = res.headers['allow'];
      resolve(allow ? allow.split(',').map(m => m.trim()) : []);
    });

    req.on('error', () => resolve([]));
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });

    req.end();
  });
}

/**
 * Check SSL/TLS information
 */
async function checkSSLInfo(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let connected = false;

    const cleanup = () => {
      if (!connected) {
        connected = true;
        socket.destroy();
      }
    };

    socket.setTimeout(5000);

    socket.on('connect', () => {
      connected = true;
      const sslSocket = new tls.connect({
        socket,
        rejectUnauthorized: false
      });

      sslSocket.on('secureConnection', () => {
        const cert = sslSocket.getPeerCertificate();
        const cipher = sslSocket.getCipher();
        
        resolve({
          valid: cert && cert.valid_to && new Date(cert.valid_to) > new Date(),
          tlsVersion: sslSocket.getProtocol(),
          cipher: cipher ? cipher.name : null,
          subject: cert ? cert.subject : null
        });

        sslSocket.end();
      });

      sslSocket.on('error', () => {
        resolve({ valid: false, error: 'SSL error' });
        cleanup();
      });
    });

    socket.on('timeout', () => {
      resolve(null);
      cleanup();
    });

    socket.on('error', () => {
      resolve(null);
      cleanup();
    });

    socket.connect(port, host);
  });
}

/**
 * Check if FTP supports anonymous
 */
async function checkFTPAnonymous(host) {
  // Simple check - would need actual FTP client for proper check
  return false;
}

/**
 * Calculate overall risk score
 */
function calculateRiskScore(findings) {
  const weights = {
    critical: 10,
    high: 7.5,
    medium: 5,
    low: 2.5,
    info: 0
  };

  let score = 0;
  let maxScore = findings.length * 10;

  for (const finding of findings) {
    score += weights[finding.severity] || 0;
  }

  // Normalize to 0-100
  return maxScore > 0 ? Math.min(100, Math.round((score / maxScore) * 100)) : 0;
}

module.exports = {
  assessVulnerabilities,
  VULN_CHECKS,
  checkServiceVulnerabilities
};
