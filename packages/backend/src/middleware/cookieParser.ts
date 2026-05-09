import { Request, Response, NextFunction } from 'express';

/**
 * Minimal cookie parser middleware.
 * Parses the Cookie header and populates req.cookies.
 */
export function cookieParser(req: Request, _res: Response, next: NextFunction): void {
  const cookieHeader = req.headers.cookie;
  (req as any).cookies = {};

  if (cookieHeader) {
    const pairs = cookieHeader.split(';');
    for (const pair of pairs) {
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) continue;
      const key = pair.substring(0, eqIndex).trim();
      const val = pair.substring(eqIndex + 1).trim();
      try {
        (req as any).cookies[key] = decodeURIComponent(val);
      } catch {
        (req as any).cookies[key] = val;
      }
    }
  }

  next();
}

// Extend Express Request type to include cookies
declare global {
  namespace Express {
    interface Request {
      cookies?: Record<string, string>;
    }
  }
}

/**
 * Helper to set secure auth cookies on the response.
 */
export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  isProduction = process.env.NODE_ENV === 'production'
): void {
  // Access token cookie — short-lived, httpOnly
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: '/',
  });

  // Refresh token cookie — longer-lived, httpOnly
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/auth', // Only sent to auth endpoints
  });
}

/**
 * Clear auth cookies on logout.
 */
export function clearAuthCookies(res: Response): void {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/api/auth' });
}
