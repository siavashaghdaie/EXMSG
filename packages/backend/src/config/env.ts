import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Try multiple .env locations
const envPaths = [
  path.resolve(process.cwd(), '.env'),                    // cwd (packages/backend/)
  path.resolve(__dirname, '../../.env'),                   // relative to src/config/ or dist/config/
  path.resolve(__dirname, '../../../.env'),                // project root fallback
];

const envPath = envPaths.find(p => fs.existsSync(p));
if (envPath) {
  dotenv.config({ path: envPath });
  console.log(`[env] Loaded .env from: ${envPath}`);
} else {
  dotenv.config(); // fallback to dotenv default behavior
  console.warn('[env] No .env file found, using defaults');
}

export const env = {
  // Server
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Database
  DATABASE_URL: process.env.DATABASE_URL!,

  // Redis
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // Anthropic Claude API
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || (() => {
    console.warn('[env] WARNING: ANTHROPIC_API_KEY not set — Linda AI will use basic mode');
    return '';
  })(),

  // Resend Email
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'linda@theomnilink.io',

  // S3 / MinIO
  S3_ENDPOINT: process.env.S3_ENDPOINT || 'http://localhost:9000',
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || '',
  S3_SECRET_KEY: process.env.S3_SECRET_KEY || '',
  S3_BUCKET: process.env.S3_BUCKET || 'em-uploads',
  S3_REGION: process.env.S3_REGION || 'us-east-1',
} as const;

// Validate required vars in production
if (env.NODE_ENV === 'production') {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}
