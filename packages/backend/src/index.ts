import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { connectDatabase } from './config/database';
import { initializeSocketServer } from './services/socket';
import { authRoutes } from './modules/auth/auth.routes';
import { messagingRoutes } from './modules/messaging/messaging.routes';
import { userRoutes } from './modules/user/user.routes';
import { lindaRoutes } from './modules/linda/linda.routes';
import { taskRoutes } from './modules/tasks/task.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { statusRoutes } from './modules/status/status.routes';
import { announcementRoutes } from './modules/announcements/announcement.routes';
import { initializeLinda } from './modules/linda/linda.controller';

async function bootstrap() {
  const app = express();
  const httpServer = createServer(app);

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Ensure avatars subdirectory exists
  const avatarsDir = path.join(uploadsDir, 'avatars');
  if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
  }

  // Middleware
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(morgan('dev'));

  // Serve uploaded files statically
  app.use('/uploads', express.static(uploadsDir));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api', messagingRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api', lindaRoutes);
  app.use('/api', taskRoutes);
  app.use('/api', adminRoutes);
  app.use('/api', statusRoutes);
  app.use('/api', announcementRoutes);

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Connect database
  await connectDatabase();

  // Initialize WebSocket
  initializeSocketServer(httpServer);

  // Initialize Linda bot (ensure she's online)
  await initializeLinda();

  // Start server
  httpServer.listen(env.PORT, () => {
    console.warn(`
🚀 Exclusive Messenger API running!
   HTTP:      http://localhost:${env.PORT}
   WebSocket: ws://localhost:${env.PORT}
   Health:    http://localhost:${env.PORT}/health
   Env:       ${env.NODE_ENV}
    `);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.warn('Shutting down...');
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
