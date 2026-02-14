/**
 * SSLIP.io DNS Integration
 * SSLIP.io provides DNS for testing - it resolves *.sslip.io to IP addresses
 */

const dns = require('dns').promises;
const { isPrivateIP } = require('../utils/validators');

/**
 * Resolve a domain using sslip.io
 * @param {string} domain - Domain to resolve
 * @returns {Promise<string|null>} - IP address or null
 */
async function resolveWithSslip(domain) {
  try {
    // If it's already an IP, return it
    if (/^\d+\.\d+\.\d+\.\d+$/.test(domain)) {
      return domain;
    }

    // Try DNS resolution first
    const addresses = await dns.resolve4(domain).catch(() => []);
    
    if (addresses && addresses.length > 0) {
      // Filter out private IPs if it's a sslip.io domain
      for (const addr of addresses) {
        if (!isPrivateIP(addr)) {
          return addr;
        }
      }
      return addresses[0]; // Return first if all are private
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Check if domain uses sslip.io
 * @param {string} domain - Domain to check
 * @returns {boolean}
 */
function isSslipDomain(domain) {
  return domain.endsWith('.sslip.io') || domain.includes('.sslip.io');
}

/**
 * Get IP from sslip.io domain
 * sslip.io resolves subdomains to their IP representation
 * e.g., 192-168-1-1.sslip.io -> 192.168.1.1
 * @param {string} domain - sslip.io domain
 * @returns {string|null} - IP address
 */
function ipFromSslip(domain) {
  if (!isSslipDomain(domain)) {
    return null;
  }
  
  // Extract subdomain part
  const subdomain = domain.replace('.sslip.io', '');
  
  // Convert hyphenated IP to dotted notation
  // e.g., 192-168-1-1 -> 192.168.1.1
  const ip = subdomain.replace(/-/g, '.');
  
  // Validate it's a valid IP
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return null;
  }
  
  const valid = parts.every(part => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= 255;
  });
  
  return valid ? ip : null;
}

/**
 * Create sslip.io domain from IP
 * @param {string} ip - IP address
 * @returns {string} - sslip.io domain
 */
function toSslipDomain(ip) {
  return ip.replace(/\./g, '-') + '.sslip.io';
}

/**
 * Perform DNS lookup with fallback to sslip.io
 * @param {string} target - Target domain or IP
 * @returns {Promise<{ip: string, usingSslip: boolean}>}
 */
async function dnsLookup(target) {
  // If it's an IP, return directly
  if (/^\d+\.\d+\.\d+\.\d+$/.test(target)) {
    return { ip: target, usingSslip: false };
  }
  
  // If it's a sslip.io domain, extract IP
  if (isSslipDomain(target)) {
    const ip = ipFromSslip(target);
    if (ip) {
      return { ip, usingSslip: true };
    }
  }
  
  // Try regular DNS resolution
  const ip = await resolveWithSslip(target);
  if (ip) {
    return { ip, usingSslip: false };
  }
  
  // Try with sslip.io suffix
  const sslipTarget = toSslipDomain(target);
  const sslipIp = await resolveWithSslip(sslipTarget);
  if (sslipIp) {
    return { ip: sslipIp, usingSslip: true };
  }
  
  return { ip: null, usingSslip: false };
}

module.exports = {
  resolveWithSslip,
  isSslipDomain,
  ipFromSslip,
  toSslipDomain,
  dnsLookup
};
