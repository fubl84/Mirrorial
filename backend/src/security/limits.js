const crypto = require('crypto');

// Fixed-window in-memory rate limiter (no dependency, single process).
const createRateLimiter = ({ windowMs, max, now = () => Date.now() }) => {
  const buckets = new Map();

  const prune = (current) => {
    if (buckets.size < 500) {
      return;
    }
    buckets.forEach((bucket, key) => {
      if (bucket.resetAt <= current) {
        buckets.delete(key);
      }
    });
  };

  const consume = (key) => {
    const current = now();
    prune(current);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= current) {
      bucket = { count: 0, resetAt: current + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    return {
      allowed: bucket.count <= max,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - current) / 1000)),
    };
  };

  const isBlocked = (key) => {
    const bucket = buckets.get(key);
    return Boolean(bucket && bucket.resetAt > now() && bucket.count >= max);
  };

  return { consume, isBlocked, reset: (key) => buckets.delete(key) };
};

const defaultKey = (req) => req.socket?.remoteAddress || 'unknown';

const rateLimitMiddleware = (limiter, keyFn = defaultKey) => (req, res, next) => {
  const result = limiter.consume(keyFn(req));
  if (!result.allowed) {
    res.set('Retry-After', `${result.retryAfterSeconds}`);
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  return next();
};

// Expiring one-time store, used for OAuth `state` values.
const createExpiringStore = ({ ttlMs, maxSize = 200, now = () => Date.now() }) => {
  const entries = new Map();

  const purge = () => {
    const current = now();
    entries.forEach((entry, key) => {
      if (entry.expiresAt <= current) {
        entries.delete(key);
      }
    });
  };

  return {
    issue(value = true, key = crypto.randomBytes(24).toString('hex')) {
      purge();
      while (entries.size >= maxSize) {
        entries.delete(entries.keys().next().value);
      }
      entries.set(key, { value, expiresAt: now() + ttlMs });
      return key;
    },
    take(key) {
      purge();
      const entry = entries.get(key);
      if (!entry) {
        return null;
      }
      entries.delete(key);
      return entry.value;
    },
    size() {
      purge();
      return entries.size;
    },
  };
};

module.exports = {
  createExpiringStore,
  createRateLimiter,
  rateLimitMiddleware,
};
