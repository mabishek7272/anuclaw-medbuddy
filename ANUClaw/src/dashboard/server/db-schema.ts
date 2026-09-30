import Database from 'better-sqlite3';

export function migrateDashboard(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dash_users (
      id                TEXT PRIMARY KEY,
      email             TEXT UNIQUE NOT NULL,
      name              TEXT,
      role              TEXT NOT NULL DEFAULT 'viewer',
      scope_json        TEXT DEFAULT '{}',
      password_hash     TEXT,
      created_at        INTEGER NOT NULL,
      last_login_at     INTEGER,
      terms_accepted_at INTEGER DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      name        TEXT NOT NULL,
      key_hash    TEXT NOT NULL,
      key_prefix  TEXT NOT NULL,
      scopes      TEXT DEFAULT '["read"]',
      created_at  INTEGER NOT NULL,
      last_used_at INTEGER,
      expires_at  INTEGER,
      revoked     INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES dash_users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_user   ON api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

    CREATE TABLE IF NOT EXISTS dash_sessions (
      jti        TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked    INTEGER DEFAULT 0,
      ip         TEXT,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES dash_users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          INTEGER NOT NULL,
      actor_id    TEXT,
      actor_type  TEXT DEFAULT 'user',
      action      TEXT NOT NULL,
      target_type TEXT,
      target_id   TEXT,
      before_json TEXT,
      after_json  TEXT,
      channel     TEXT,
      group_id    TEXT,
      ip          TEXT,
      signature   TEXT
    );

    CREATE TABLE IF NOT EXISTS tool_calls (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id   TEXT,
      skill      TEXT,
      success    INTEGER DEFAULT 1,
      latency_ms INTEGER,
      ts         INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_ts     ON audit_events(ts);
    CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_events(actor_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events(action);
    CREATE INDEX IF NOT EXISTS idx_toolcalls_ts ON tool_calls(ts);
    CREATE INDEX IF NOT EXISTS idx_toolcalls_skill ON tool_calls(skill);

    -- Full-text search over messages (FTS5)
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content, group_id UNINDEXED, sender_name UNINDEXED, created_at UNINDEXED,
      content='messages', content_rowid='rowid'
    );

    CREATE VIEW IF NOT EXISTS skill_stats AS
    SELECT
      skill,
      COUNT(*) as invocations,
      CAST(AVG(latency_ms) AS INTEGER) as avg_latency,
      ROUND(SUM(CASE WHEN success=1 THEN 1.0 ELSE 0.0 END) / COUNT(*), 3) as success_rate
    FROM tool_calls
    WHERE ts > (strftime('%s','now','-7 days') * 1000)
    GROUP BY skill;
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pipelines (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      description  TEXT,
      category     TEXT DEFAULT 'custom',
      nodes        TEXT NOT NULL DEFAULT '[]',
      connections  TEXT DEFAULT '[]',
      trigger_type TEXT DEFAULT 'manual',
      schedule_cron TEXT,
      created_by   TEXT,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      active       INTEGER DEFAULT 1,
      run_count    INTEGER DEFAULT 0,
      last_run_at  INTEGER
    );

    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id          TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL,
      status      TEXT DEFAULT 'pending',
      inputs      TEXT DEFAULT '{}',
      node_results TEXT DEFAULT '{}',
      final_output TEXT,
      artifacts   TEXT DEFAULT '[]',
      started_at  INTEGER,
      finished_at INTEGER,
      triggered_by TEXT,
      error       TEXT,
      FOREIGN KEY (pipeline_id) REFERENCES pipelines(id)
    );

    CREATE TABLE IF NOT EXISTS patients (
      id                TEXT PRIMARY KEY,
      uid               TEXT UNIQUE,
      name              TEXT NOT NULL,
      dob               TEXT,
      sex               TEXT,
      conditions        TEXT DEFAULT '[]',
      medications       TEXT DEFAULT '[]',
      genomic_profile   TEXT DEFAULT '{}',
      risk_score        REAL DEFAULT 0,
      risk_level        TEXT DEFAULT 'unknown',
      risk_factors      TEXT DEFAULT '[]',
      ai_summary        TEXT,
      trial_matches     TEXT DEFAULT '[]',
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL,
      summary_updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS patient_analyses (
      id          TEXT PRIMARY KEY,
      patient_id  TEXT NOT NULL,
      skill       TEXT NOT NULL,
      prompt      TEXT,
      result      TEXT,
      artifacts   TEXT DEFAULT '[]',
      ts          INTEGER NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_pid ON pipeline_runs(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_patient_uid       ON patients(uid);
    CREATE INDEX IF NOT EXISTS idx_patient_analyses  ON patient_analyses(patient_id);
    CREATE INDEX IF NOT EXISTS idx_patients_risk     ON patients(risk_score DESC);
  `);

  // Safe column additions for existing DBs
  try { db.exec(`ALTER TABLE dash_users ADD COLUMN terms_accepted_at INTEGER DEFAULT NULL`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE audit_events ADD COLUMN meta TEXT`); } catch { /* already exists */ }

  // Seed default admin if none exists
  const adminExists = db.prepare("SELECT id FROM dash_users WHERE role='admin' LIMIT 1").get();
  if (!adminExists) {
    const crypto = require('crypto') as typeof import('crypto');
    const id = crypto.randomUUID();
    const now = Date.now();
    // default password: admin123 (bcrypt-style placeholder — change on first login)
    db.prepare(`
      INSERT INTO dash_users (id, email, name, role, scope_json, created_at)
      VALUES (?, 'admin@anuclaw.local', 'Admin', 'admin', '{}', ?)
    `).run(id, now);
  }
}
