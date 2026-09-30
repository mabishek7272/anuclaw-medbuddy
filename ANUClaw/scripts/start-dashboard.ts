/**
 * Start ONLY the ANUClaw dashboard (backend + built SPA) — no messaging channels.
 * Requires Postgres (per .env PG_*). Serves the dashboard at DASHBOARD_PORT (3722)
 * and migrates + seeds the default admin on first boot.
 *
 *   npm run start:dashboard   →   http://localhost:3722  (admin@amgi.io / admin123)
 */
import { ensureDbReady } from '../src/db/connection';
import { mountDashboard } from '../src/dashboard/server/index';

(async () => {
  await ensureDbReady(); // migrate + seed default admin
  mountDashboard();
})().catch((e) => {
  console.error('Dashboard failed to start:', e?.message ?? e);
  process.exit(1);
});
