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
import { orgAdminRoutes } from './modules/org-admin/orgAdmin.routes';
import { statusRoutes } from './modules/status/status.routes';
import { superAdminRoutes } from './modules/super-admin/superAdmin.routes';
import { announcementRoutes } from './modules/announcements/announcement.routes';
import { interPanelRoutes } from './modules/inter-panel/interPanel.routes';
import { projectRoutes } from './modules/projects/project.routes';
import { checklistRoutes } from './modules/checklists/checklist.routes';
import { callRoutes } from './modules/calls/call.routes';
import { pushRoutes } from './modules/push/push.routes';
import { agentRoutes } from './modules/agents/agent.routes';
import { initializePush } from './modules/push/pushService';
import { initializeLinda } from './modules/linda/linda.controller';
import { seedAgents } from './modules/agents/agent.controller';
import { startTaskReminderJob } from './modules/tasks/taskReminder';
import { resolveOrganization } from './middleware/orgScope';

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

  // Ensure logos subdirectory exists
  const logosDir = path.join(uploadsDir, 'logos');
  if (!fs.existsSync(logosDir)) {
    fs.mkdirSync(logosDir, { recursive: true });
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
  // IMPORTANT: The super-admin router must be registered BEFORE any router
  // that applies a global `authenticate` middleware (e.g. messagingRoutes
  // uses `router.use(authenticate)`). Otherwise a public endpoint like
  // POST /api/super-admin/login gets blocked by the earlier router's
  // auth middleware before it can reach its own handler.
  app.use('/api/auth', authRoutes);
  app.use('/api', superAdminRoutes);
  app.use('/api', interPanelRoutes);
  app.use('/api', pushRoutes);       // Must be before messagingRoutes (has public endpoint)
  app.use('/api', messagingRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api', lindaRoutes);
  app.use('/api', taskRoutes);
  app.use('/api', projectRoutes);
  app.use('/api', checklistRoutes);
  app.use('/api', callRoutes);
  app.use('/api', agentRoutes);
  app.use('/api', adminRoutes);
  // IMPORTANT: orgAdminRoutes MUST be scoped to /api/org-admin so its
  // router.use(requireOrgAdmin) middleware does not leak to subsequent
  // routers (like status and announcements).  The individual routes inside
  // orgAdminRoutes already include the /org-admin prefix in their paths,
  // so we strip it here to avoid double-prefixing.
  app.use('/api', statusRoutes);
  app.use('/api', announcementRoutes);
  app.use('/api', orgAdminRoutes);

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Connect database
  await connectDatabase();

  // Initialize Web Push
  initializePush();

  // Initialize WebSocket
  initializeSocketServer(httpServer);

  // Seed AI agent catalog
  await seedAgents();

  // Initialize Linda bot (ensure she's online)
  await initializeLinda();

  // Start background task reminder job (Linda notifies assignees about ignored tasks)
  startTaskReminderJob();

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
