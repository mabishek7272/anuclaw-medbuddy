import express from 'express';
import cookieParser from 'cookie-parser';
import * as path from 'path';
import { requireDashAuth } from './auth';
import { sseHandler } from './sse';

import homeRouter        from './routes/home';
import conversationsRouter from './routes/conversations';
import skillsRouter      from './routes/skills';
import hooksRouter       from './routes/hooks';
import tasksRouter       from './routes/tasks';
import channelsRouter    from './routes/channels';
import auditRouter       from './routes/audit';
import usersRouter       from './routes/users';
import settingsRouter    from './routes/settings';
import apiKeysRouter     from './routes/api-keys';
import elabRouter        from './routes/elab';
import elabEngineRouter, { ensureMfaSchema } from './routes/elab-engine';
import pipelinesRouter   from './routes/pipelines';
import patientsRouter    from './routes/patients';
import { mountDashboardCds } from './routes/cds';

export function mountDashboard(): void {
  const dash = express.Router();

  dash.use(cookieParser());
  dash.use(express.json({ limit: '4mb' }));

  // Auth routes (login/logout/refresh — no auth required)
  dash.use('/auth', usersRouter);

  // Protected API routes
  dash.use('/api/home',          homeRouter);
  dash.use('/api/conversations', conversationsRouter);
  dash.use('/api/skills',        skillsRouter);
  dash.use('/api/hooks',         hooksRouter);
  dash.use('/api/tasks',         tasksRouter);
  dash.use('/api/channels',      channelsRouter);
  dash.use('/api/audit',         auditRouter);
  dash.use('/api/users',         usersRouter);
  dash.use('/api/settings',      settingsRouter);
  dash.use('/api/keys',          apiKeysRouter);
  dash.use('/api/elab',         elabRouter);
  dash.use('/api/elab-engine',  elabEngineRouter);   // native engine console + TOTP 2FA
  dash.use('/api/pipelines',    pipelinesRouter);
  dash.use('/api/patients',     patientsRouter);

  // CDS v3 — clinician review console + endpoints (cookie-auth, shared audit log)
  mountDashboardCds(dash);

  // SSE stream
  dash.get('/api/stream', requireDashAuth, sseHandler);

  // Serve React SPA static files
  const spaDir = path.resolve(__dirname, '../../../dashboard/dist');
  dash.use(express.static(spaDir));
  dash.get('*', (_req, res) => {
    const index = path.join(spaDir, 'index.html');
    res.sendFile(index);
  });

  // Ensure the E-LAB TOTP columns exist (idempotent; DB is ready before mount).
  void ensureMfaSchema().catch((e) => console.error('[Dashboard] MFA schema:', e?.message ?? e));

  const port = Number(process.env.DASHBOARD_PORT ?? 3722);
  const dashApp = express();
  dashApp.use(dash);
  dashApp.listen(port, '127.0.0.1', () => {
    console.log(`[Dashboard] Running at http://127.0.0.1:${port}`);
  });
}
