import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

interface RateLimiterOptions {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;    // Max requests per window
  message?: string;       // Error message
  keyGenerator?: (req: Request) => string;
}

/**
 * Simple in-memory rate limiter middleware.
 * For production, replace with Redis-backed solution.
 */
export function rateLimiter(options: RateLimiterOptions) {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests, please try again later.',
    keyGenerator = (req: Request) => req.ip || req.socket.remoteAddress || 'unknown',
  } = options;

  const store: RateLimitStore = {};

  // Periodic cleanup of expired entries (every 5 minutes)
  setInterval(() => {
    const now = Date.now();
    for (const key of Object.keys(store)) {
      if (store[key].resetTime <= now) {
        delete store[key];
      }
    }
  }, 5 * 60 * 1000);

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);
    const now = Date.now();

    if (!store[key] || store[key].resetTime <= now) {
      store[key] = { count: 1, resetTime: now + windowMs };
    } else {
      store[key].count++;
    }

    const remaining = Math.max(0, maxRequests - store[key].count);
    const resetSeconds = Math.ceil((store[key].resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', resetSeconds.toString());

    if (store[key].count > maxRequests) {
      res.setHeader('Retry-After', resetSeconds.toString());
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}

// Pre-configured limiters for common use cases
export const generalLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 500,          // 500 requests per 15 min
});

export const authLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 20,           // 20 auth attempts per 15 min
  message: 'Too many login attempts. Please try again later.',
});

export const uploadLimiter = rateLimiter({
  windowMs: 60 * 1000,      // 1 minute
  maxRequests: 10,           // 10 uploads per minute
  message: 'Upload rate limit exceeded. Please wait before uploading more files.',
});

export const messageLimiter = rateLimiter({
  windowMs: 60 * 1000,      // 1 minute
  maxRequests: 60,           // 60 messages per minute
  message: 'Message rate limit exceeded. Please slow down.',
});

export const searchLimiter = rateLimiter({
  windowMs: 60 * 1000,      // 1 minute
  maxRequests: 30,           // 30 searches per minute
  message: 'Search rate limit exceeded. Please wait.',
});
