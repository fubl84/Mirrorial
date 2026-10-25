const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1']);
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'forwarded', 'via'];

const stripMappedPrefix = (address = '') => `${address}`.replace(/^::ffff:/i, '');

let interfaceCache = { at: 0, values: new Set() };
const getOwnInterfaceAddresses = (now = Date.now()) => {
  if (now - interfaceCache.at < 30000) {
    return interfaceCache.values;
  }
  const values = new Set();
  Object.values(os.networkInterfaces()).forEach((entries) => {
    (entries || []).forEach((entry) => values.add(stripMappedPrefix(entry.address)));
  });
  interfaceCache = { at: now, values };
  return values;
};

// "Local" means the TCP peer is this machine (loopback or one of its own addresses).
const isLocalAddress = (address) => {
  const normalized = stripMappedPrefix(address);
  return LOOPBACK_ADDRESSES.has(normalized) || getOwnInterfaceAddresses().has(normalized);
};

const normalizeHostname = (hostHeader = '') => {
  const value = `${hostHeader}`.trim().toLowerCase();
  if (!value) {
    return '';
  }
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end > 0 ? value.slice(1, end) : value;
  }
  return value.replace(/:\d+$/, '');
};

// DNS rebinding needs a DNS name. IP literals and "localhost" cannot be rebound to another machine.
const isIpOrLocalhost = (hostname) => hostname === 'localhost' || net.isIP(hostname) > 0;

const getOriginHostname = (origin) => {
  try {
    return normalizeHostname(new URL(origin).host);
  } catch (error) {
    return '';
  }
};

const hasProxyHeaders = (req) => PROXY_HEADERS.some((header) => req.headers?.[header] !== undefined);

// Trusted = same machine, no proxy in between, and neither Host nor Origin is a DNS name.
// This keeps the Flutter display (http://127.0.0.1:3000) working without credentials while blocking
// DNS rebinding and CSRF from websites opened in a browser on the mirror itself.
const isTrustedLocalRequest = (req, { trustLocal = true } = {}) => {
  if (!trustLocal || !isLocalAddress(req.socket?.remoteAddress) || hasProxyHeaders(req)) {
    return false;
  }
  if (!isIpOrLocalhost(normalizeHostname(req.headers?.host))) {
    return false;
  }
  const origin = req.headers?.origin;
  return origin === undefined || isIpOrLocalhost(getOriginHostname(origin));
};

const extractBearerToken = (req) => {
  const header = req.headers?.authorization;
  const match = typeof header === 'string' ? header.match(/^Bearer\s+(.+)$/i) : null;
  return match ? match[1].trim() : '';
};

const tokensMatch = (candidate, expected) => {
  if (!candidate || !expected) {
    return false;
  }
  const left = crypto.createHash('sha256').update(candidate).digest();
  const right = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(left, right);
};

const loadOrCreateAccessToken = ({ dataRoot, envToken = process.env.MIRRORIAL_ACCESS_TOKEN, log = console.log }) => {
  if (typeof envToken === 'string' && envToken.trim().length >= 16) {
    return envToken.trim();
  }

  const tokenPath = path.join(dataRoot, 'access-token');
  try {
    const existing = fs.readFileSync(tokenPath, 'utf8').trim();
    if (existing.length >= 16) {
      return existing;
    }
  } catch (error) {
    // No usable token yet; create one below.
  }

  const token = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.writeFileSync(tokenPath, `${token}\n`, { mode: 0o600 });
  fs.chmodSync(tokenPath, 0o600);
  log(`[security] Created a remote access token at ${tokenPath}`);
  log(`[security] Remote UI access token: ${token}`);
  return token;
};

module.exports = {
  extractBearerToken,
  getOriginHostname,
  hasProxyHeaders,
  isIpOrLocalhost,
  isLocalAddress,
  isTrustedLocalRequest,
  loadOrCreateAccessToken,
  normalizeHostname,
  tokensMatch,
};
