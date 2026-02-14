/**
 * Input validation utilities
 */

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
const DOMAIN_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

/**
 * Validate if target is a valid domain, IP, or CIDR
 * @param {string} target - Target to validate
 * @returns {boolean} - True if valid
 */
function validateTarget(target) {
  if (!target || typeof target !== 'string') {
    return false;
  }

  const trimmed = target.trim();
  
  // Check for IP
  if (IP_REGEX.test(trimmed)) {
    return validateIP(trimmed);
  }
  
  // Check for CIDR
  if (CIDR_REGEX.test(trimmed)) {
    const [ip, mask] = trimmed.split('/');
    return validateIP(ip) && parseInt(mask) >= 0 && parseInt(mask) <= 32;
  }
  
  // Check for domain
  return DOMAIN_REGEX.test(trimmed);
}

/**
 * Validate IP address
 * @param {string} ip - IP to validate
 * @returns {boolean} - True if valid
 */
function validateIP(ip) {
  const parts = ip.split('.');
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}

/**
 * Parse port specification
 * @param {string} ports - Comma-separated ports
 * @returns {number[]} - Array of ports
 */
function parsePorts(ports) {
  if (!ports) {
    return [80, 443, 22, 21, 25, 53, 8080, 8443];
  }
  
  return ports.split(',').map(p => {
    const port = parseInt(p.trim(), 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port: ${p}`);
    }
    return port;
  });
}

/**
 * Check if target is private IP
 * @param {string} ip - IP to check
 * @returns {boolean} - True if private
 */
function isPrivateIP(ip) {
  const parts = ip.split('.').map(p => parseInt(p, 10));
  
  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  
  // 127.0.0.0/8
  if (parts[0] === 127) return true;
  
  return false;
}

module.exports = {
  validateTarget,
  validateIP,
  parsePorts,
  isPrivateIP
};
