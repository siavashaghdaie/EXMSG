import Redis from 'ioredis';
import { env } from './env';

// Support REDIS_URL (production) or individual host/port/password (development)
const retryStrategy = (times: number) => Math.min(times * 50, 2000);

export const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { retryStrategy, maxRetriesPerRequest: 3 })
  : new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      retryStrategy,
      maxRetriesPerRequest: 3,
    });

redis.on('connect', () => {
  console.warn('✅ Redis connected successfully');
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
});

// Helper functions for common Redis operations
export const cacheUtils = {
  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  },

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await redis.setex(key, ttlSeconds, serialized);
    } else {
      await redis.set(key, serialized);
    }
  },

  async del(key: string): Promise<void> {
    await redis.del(key);
  },

  // User presence tracking
  async setUserOnline(userId: string): Promise<void> {
    await redis.set(`presence:${userId}`, 'online');
    await redis.set(`lastseen:${userId}`, new Date().toISOString());
  },

  async setUserOffline(userId: string): Promise<void> {
    await redis.del(`presence:${userId}`);
    await redis.set(`lastseen:${userId}`, new Date().toISOString());
  },

  async isUserOnline(userId: string): Promise<boolean> {
    const status = await redis.get(`presence:${userId}`);
    return status === 'online';
  },

  // Typing indicators
  async setTyping(userId: string, conversationId: string): Promise<void> {
    await redis.setex(`typing:${conversationId}:${userId}`, 5, '1');
  },

  async getTypingUsers(conversationId: string): Promise<string[]> {
    const keys = await redis.keys(`typing:${conversationId}:*`);
    return keys.map((key) => key.split(':').pop()!);
  },
};
