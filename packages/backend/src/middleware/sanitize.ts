import { Request, Response, NextFunction } from 'express';

/**
 * Strips HTML tags and dangerous patterns from strings.
 * Lightweight sanitization without external dependencies.
 */
function stripHtml(input: string): string {
  return input
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove javascript: protocol
    .replace(/javascript\s*:/gi, '')
    // Remove data: protocol (except common safe data URIs for images)
    .replace(/data\s*:\s*(?!image\/(png|jpe?g|gif|webp|svg\+xml))/gi, 'data_blocked:')
    // Remove on* event handlers
    .replace(/\bon\w+\s*=/gi, '')
    // Remove style expressions
    .replace(/expression\s*\(/gi, '')
    // Trim whitespace
    .trim();
}

/**
 * Recursively sanitize all string values in an object.
 */
function sanitizeValue(value: any, depth = 0): any {
  // Prevent infinite recursion
  if (depth > 10) return value;

  if (typeof value === 'string') {
    return stripHtml(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const sanitized: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      // Skip sanitizing password fields and tokens
      if (['password', 'passwordHash', 'token', 'refreshToken', 'secret'].includes(key)) {
        sanitized[key] = val;
      } else {
        sanitized[key] = sanitizeValue(val, depth + 1);
      }
    }
    return sanitized;
  }

  return value;
}

/**
 * Express middleware that sanitizes request body, query, and params.
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }

  if (req.query && typeof req.query === 'object') {
    // Only sanitize string query params
    for (const [key, val] of Object.entries(req.query)) {
      if (typeof val === 'string') {
        (req.query as Record<string, any>)[key] = stripHtml(val);
      }
    }
  }

  if (req.params && typeof req.params === 'object') {
    for (const [key, val] of Object.entries(req.params)) {
      if (typeof val === 'string') {
        req.params[key] = stripHtml(val);
      }
    }
  }

  next();
}

/**
 * Validate and sanitize a message content string specifically.
 * Allows some formatting but strips dangerous content.
 */
export function sanitizeMessageContent(content: string): string {
  return content
    // Remove script tags entirely
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove event handlers
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
    // Remove javascript: and vbscript: protocols
    .replace(/(javascript|vbscript)\s*:/gi, '')
    // Keep basic formatting but strip everything else
    .trim();
}
