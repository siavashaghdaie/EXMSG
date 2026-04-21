import { API_BASE_URL } from '@/config/api';

/**
 * Server origin derived from the API base URL.
 * API_BASE_URL = 'https://theomnilink.io/api' -> SERVER_ORIGIN = 'https://theomnilink.io'
 */
const SERVER_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

/**
 * Converts a relative server path (e.g. `/uploads/avatars/abc.jpg`) into
 * a fully-qualified URL that React Native's <Image> can load.
 *
 * If the path is already absolute (starts with http:// or https://), it is
 * returned as-is. Null/undefined inputs return undefined.
 */
export function getFullUrl(path: string | undefined | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${SERVER_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}
