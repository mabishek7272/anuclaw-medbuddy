import { getDb } from './connection';

export { getDb, ensureDbReady } from './connection';

export const db = {
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const pool = getDb();
    const res = await pool.query(sql, params);
    return res.rows;
  },

  async queryOne<T = any>(sql: string, params?: any[]): Promise<T | undefined> {
    const pool = getDb();
    const res = await pool.query(sql, params);
    return res.rows[0];
  }
};
