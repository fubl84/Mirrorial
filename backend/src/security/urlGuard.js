const net = require('net');

// Home Assistant, Ollama and CalDAV servers legitimately live on the LAN or on localhost, so private
// ranges are allowed. What is blocked: non-http(s) schemes, credentials embedded in the URL, and
// link-local / cloud-metadata targets that are never a legitimate integration endpoint.
// Limitation: hostnames are not resolved here, so a DNS name that points at a blocked address is not caught.

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

const isBlockedIpv4 = (address) => {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }
  const [first, second] = parts;
  return (first === 169 && second === 254) // link-local incl. 169.254.169.254 metadata
    || first === 0 // "this" network, 0.0.0.0
    || (first === 100 && second === 100 && parts[2] === 100 && parts[3] === 200); // Alibaba metadata
};

const isBlockedIpv6 = (address) => {
  const value = address.toLowerCase();
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    return isBlockedIpv4(mapped[1]);
  }
  return /^fe[89ab][0-9a-f]:/.test(value) // fe80::/10 link-local
    || value === '::'
    || value === 'fd00:ec2::254'; // AWS IPv6 metadata
};

const assertSafeOutboundUrl = (value, label = 'URL') => {
  let parsed;
  try {
    parsed = new URL(`${value || ''}`.trim());
  } catch (error) {
    throw new Error(`${label} must be a full http:// or https:// URL.`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} must use http:// or https://.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not contain credentials. Use the username/password fields instead.`);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const ipVersion = net.isIP(hostname);
  if (
    BLOCKED_HOSTNAMES.has(hostname)
    || (ipVersion === 4 && isBlockedIpv4(hostname))
    || (ipVersion === 6 && isBlockedIpv6(hostname))
  ) {
    throw new Error(`${label} points to a blocked address.`);
  }

  return parsed;
};

const isSafeOutboundUrl = (value) => {
  try {
    assertSafeOutboundUrl(value);
    return true;
  } catch (error) {
    return false;
  }
};

// Compares scheme + host + port so a stored API key stays bound to the endpoint it was entered for.
const getUrlOrigin = (value) => {
  try {
    return new URL(`${value || ''}`.trim()).origin.toLowerCase();
  } catch (error) {
    return '';
  }
};

const LOCAL_HOST_PATTERNS = ['localhost', '127.0.0.1', '::1'];

// True for endpoints on this machine or the local network name space (".local"). Used by "local-only" privacy mode.
const isLocalBaseUrl = (baseUrl = '') => {
  try {
    const hostname = new URL(baseUrl).hostname.replace(/^\[|\]$/g, '');
    return LOCAL_HOST_PATTERNS.includes(hostname) || hostname.endsWith('.local');
  } catch (error) {
    return false;
  }
};

const sameUrlOrigin = (left, right) => {
  const leftOrigin = getUrlOrigin(left);
  return Boolean(leftOrigin) && leftOrigin === getUrlOrigin(right);
};

module.exports = {
  assertSafeOutboundUrl,
  getUrlOrigin,
  isLocalBaseUrl,
  isSafeOutboundUrl,
  sameUrlOrigin,
};
