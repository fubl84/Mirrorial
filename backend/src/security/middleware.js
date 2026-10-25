const {
  extractBearerToken,
  getOriginHostname,
  isIpOrLocalhost,
  isTrustedLocalRequest,
  tokensMatch,
} = require('./access');
const { createRateLimiter } = require('./limits');

// Mounted with app.use('/api', ...), so req.path is relative to /api.
const createAuthMiddleware = ({
  getToken,
  publicPaths = [],
  trustLocal = true,
  failureLimiter = createRateLimiter({ windowMs: 5 * 60000, max: 10 }),
}) => {
  const publicSet = new Set(publicPaths);

  return (req, res, next) => {
    const clientKey = req.socket?.remoteAddress || 'unknown';
    const presented = extractBearerToken(req);
    req.auth = { authenticated: false, method: null };

    if (presented) {
      if (failureLimiter.isBlocked(clientKey)) {
        res.set('Retry-After', '300');
        return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
      }
      if (tokensMatch(presented, getToken())) {
        failureLimiter.reset(clientKey);
        req.auth = { authenticated: true, method: 'token' };
      } else {
        failureLimiter.consume(clientKey);
        if (!publicSet.has(req.path)) {
          return res.status(401).json({ error: 'Invalid access token.' });
        }
      }
    }

    if (!req.auth.authenticated && isTrustedLocalRequest(req, { trustLocal })) {
      req.auth = { authenticated: true, method: 'local' };
    }

    if (req.auth.authenticated || publicSet.has(req.path)) {
      return next();
    }

    res.set('WWW-Authenticate', 'Bearer realm="mirrorial"');
    return res.status(401).json({ error: 'Authentication required.', authRequired: true });
  };
};

// Cross-origin browser access is only allowed from IP/localhost origins (dev server, LAN by IP)
// or from explicitly configured origins. Credentials are sent as a Bearer header, never as cookies.
const buildCorsOptions = ({ extraOrigins = [] } = {}) => {
  const allowed = new Set(extraOrigins.filter(Boolean));
  return {
    origin: (origin, callback) => callback(
      null,
      !origin || allowed.has(origin) || isIpOrLocalhost(getOriginHostname(origin)),
    ),
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  };
};

const securityHeaders = (req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  if (req.path.startsWith('/api/')) {
    res.set('Cache-Control', 'no-store');
  } else {
    res.set('X-Frame-Options', 'DENY');
  }
  next();
};

module.exports = {
  buildCorsOptions,
  createAuthMiddleware,
  securityHeaders,
};
