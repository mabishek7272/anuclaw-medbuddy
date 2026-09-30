import { Pool, types } from 'pg';
import { config } from '../config';
import { logger } from '../logger';
import * as crypto from 'crypto';

// Parse PostgreSQL INT8 (BIGINT) as JavaScript integers to prevent Date parsing errors on frontend
types.setTypeParser(20, parseInt);

let _pool: Pool | null = null;
let _migrationPromise: Promise<void> | null = null;

export function getDb(): Pool {
  if (!_pool) {
    _pool = new Pool({
      host: config.pg.host,
      port: config.pg.port,
      user: config.pg.user,
      password: config.pg.pass,
      database: config.pg.dbName,
    });
    _pool.on('error', (err) => {
      logger.error('Unexpected error on idle PostgreSQL client', err);
    });
    // Trigger migrations immediately on boot, and cache the promise
    _migrationPromise = migrate(_pool);
  }
  return _pool;
}

export async function ensureDbReady(): Promise<void> {
  getDb();
  if (_migrationPromise) {
    await _migrationPromise;
  }
}

async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Create tables in order
    await client.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id VARCHAR(255) PRIMARY KEY,
        channel VARCHAR(50) NOT NULL,
        name VARCHAR(255),
        created_at VARCHAR(100) NOT NULL,
        last_seen_at VARCHAR(100)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(255) PRIMARY KEY,
        group_id VARCHAR(255) NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        channel VARCHAR(50) NOT NULL,
        sender_id VARCHAR(255),
        sender_name VARCHAR(255),
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        media_type VARCHAR(50),
        media_path VARCHAR(500),
        created_at VARCHAR(100) NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(255) PRIMARY KEY,
        group_id VARCHAR(255) NOT NULL UNIQUE REFERENCES groups(id) ON DELETE CASCADE,
        messages_json TEXT NOT NULL DEFAULT '[]',
        updated_at VARCHAR(100) NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(255) PRIMARY KEY,
        group_id VARCHAR(255) NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        channel VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        cron VARCHAR(100) NOT NULL,
        prompt TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run_at VARCHAR(100),
        next_run_at VARCHAR(100),
        created_at VARCHAR(100) NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS memory_facts (
        id SERIAL PRIMARY KEY,
        group_id VARCHAR(255) NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        key VARCHAR(255) NOT NULL,
        value TEXT NOT NULL,
        confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        source VARCHAR(50) NOT NULL DEFAULT 'agent',
        superseded_by INTEGER REFERENCES memory_facts(id) ON DELETE SET NULL,
        created_at VARCHAR(100) NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_traces (
        id SERIAL PRIMARY KEY,
        group_id VARCHAR(255) NOT NULL,
        session_id VARCHAR(255),
        event VARCHAR(100) NOT NULL,
        data_json TEXT,
        created_at VARCHAR(100) NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dash_users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) NOT NULL DEFAULT 'viewer',
        scope_json TEXT DEFAULT '{}',
        password_hash VARCHAR(255),
        created_at BIGINT NOT NULL,
        last_login_at BIGINT,
        terms_accepted_at BIGINT DEFAULT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES dash_users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        key_hash VARCHAR(255) NOT NULL,
        key_prefix VARCHAR(50) NOT NULL,
        scopes TEXT DEFAULT '["read"]',
        created_at BIGINT NOT NULL,
        last_used_at BIGINT,
        expires_at BIGINT,
        revoked INTEGER DEFAULT 0
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dash_sessions (
        jti VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES dash_users(id) ON DELETE CASCADE,
        expires_at BIGINT NOT NULL,
        revoked INTEGER DEFAULT 0,
        ip VARCHAR(50),
        user_agent TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id SERIAL PRIMARY KEY,
        ts BIGINT NOT NULL,
        actor_id VARCHAR(255),
        actor_type VARCHAR(50) DEFAULT 'user',
        action VARCHAR(255) NOT NULL,
        target_type VARCHAR(50),
        target_id VARCHAR(255),
        before_json TEXT,
        after_json TEXT,
        channel VARCHAR(50),
        group_id VARCHAR(255),
        ip VARCHAR(50),
        signature TEXT,
        meta TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tool_calls (
        id SERIAL PRIMARY KEY,
        group_id VARCHAR(255),
        skill VARCHAR(255),
        success INTEGER DEFAULT 1,
        latency_ms INTEGER,
        ts BIGINT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pipelines (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100) DEFAULT 'custom',
        nodes TEXT NOT NULL DEFAULT '[]',
        connections TEXT DEFAULT '[]',
        trigger_type VARCHAR(50) DEFAULT 'manual',
        schedule_cron VARCHAR(100),
        created_by VARCHAR(255),
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        active INTEGER DEFAULT 1,
        run_count INTEGER DEFAULT 0,
        last_run_at BIGINT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pipeline_runs (
        id VARCHAR(255) PRIMARY KEY,
        pipeline_id VARCHAR(255) NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'pending',
        inputs TEXT DEFAULT '{}',
        node_results TEXT DEFAULT '{}',
        final_output TEXT,
        artifacts TEXT DEFAULT '[]',
        started_at BIGINT,
        finished_at BIGINT,
        triggered_by VARCHAR(255),
        error TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id VARCHAR(255) PRIMARY KEY,
        uid VARCHAR(255) UNIQUE,
        name VARCHAR(255) NOT NULL,
        dob VARCHAR(100),
        sex VARCHAR(10),
        conditions TEXT DEFAULT '[]',
        medications TEXT DEFAULT '[]',
        genomic_profile TEXT DEFAULT '{}',
        risk_score DOUBLE PRECISION DEFAULT 0,
        risk_level VARCHAR(50) DEFAULT 'unknown',
        risk_factors TEXT DEFAULT '[]',
        ai_summary TEXT,
        trial_matches TEXT DEFAULT '[]',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        summary_updated_at BIGINT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_analyses (
        id VARCHAR(255) PRIMARY KEY,
        patient_id VARCHAR(255) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        skill VARCHAR(255) NOT NULL,
        prompt TEXT,
        result TEXT,
        artifacts TEXT DEFAULT '[]',
        ts BIGINT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        tenant_id VARCHAR(255) PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        api_key VARCHAR(255) NOT NULL UNIQUE,
        plan VARCHAR(50) NOT NULL DEFAULT 'free',
        rate_limit_per_min INTEGER NOT NULL DEFAULT 10,
        monthly_quota INTEGER,
        usage_this_month INTEGER NOT NULL DEFAULT 0,
        usage_total INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        webhook_url VARCHAR(500),
        created_at VARCHAR(100) NOT NULL,
        last_active_at VARCHAR(100)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS api_usage_log (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
        endpoint VARCHAR(255) NOT NULL,
        skill VARCHAR(255),
        status_code INTEGER NOT NULL,
        latency_ms INTEGER,
        tokens_used INTEGER,
        created_at VARCHAR(100) NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS quota_resets (
        tenant_id VARCHAR(255) PRIMARY KEY REFERENCES tenants(tenant_id) ON DELETE CASCADE,
        reset_at VARCHAR(100) NOT NULL
      )
    `);

    // ── E-LAB platform tiering columns on tenants (additive, idempotent) ──────
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS scopes TEXT`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS baa_status VARCHAR(20) DEFAULT 'none'`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS residency VARCHAR(20) DEFAULT 'us'`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS allowed_clinical_domains TEXT`);

    // Indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id, created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_memory_facts_group ON memory_facts(group_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks(group_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_traces_group ON agent_traces(group_id, created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_events(ts)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events(action)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_toolcalls_ts ON tool_calls(ts)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_toolcalls_skill ON tool_calls(skill)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pipeline_runs_pid ON pipeline_runs(pipeline_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_patient_uid ON patients(uid)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_patient_analyses ON patient_analyses(patient_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_patients_risk ON patients(risk_score DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_usage_tenant ON api_usage_log(tenant_id, created_at)');

    // Seed default admin users
    const adminEmail = 'admin@amgi.io';
    const adminLocalEmail = 'admin@anuclaw.local';
    
    const adminCheck = await client.query('SELECT id FROM dash_users WHERE role=$1 LIMIT 1', ['admin']);
    if (adminCheck.rows.length === 0) {
      const now = Date.now();
      const hash = (pw: string) => crypto.createHash('sha256').update(pw + 'anuclaw-salt').digest('hex');
      
      // admin@amgi.io / admin123
      await client.query(`
        INSERT INTO dash_users (id, email, name, role, scope_json, password_hash, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [crypto.randomUUID(), adminEmail, 'Admin', 'admin', '{}', hash('admin123'), now]);
      
      // admin@anuclaw.local
      await client.query(`
        INSERT INTO dash_users (id, email, name, role, scope_json, password_hash, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [crypto.randomUUID(), adminLocalEmail, 'Admin', 'admin', '{}', hash('admin123'), now]);

      
      logger.info('Default admin seeded to PostgreSQL.');
    }

    await client.query('COMMIT');
    logger.info('PostgreSQL Database initialised & migrated successfully');
  } catch (err: any) {
    await client.query('ROLLBACK');
    logger.error('PostgreSQL Database migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}
