import pg from 'pg';
import { log } from './logger.js';

/**
 * A single shared connection pool for the whole process.
 *
 * `pg.Pool` manages a set of reusable connections; you acquire one per query
 * and it's returned automatically. Never create a second pool — that defeats
 * the purpose and can exhaust Postgres connection limits.
 *
 * In the workspace this lives in @tallymark/db so every package and the
 * orchestrator share one pool implementation instead of copy-pasting it. It
 * reads DATABASE_URL directly (rather than reaching into any single app's
 * config), which keeps the shared layer decoupled from app-specific settings.
 */
function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }
  return url;
}

export const pool = new pg.Pool({
  connectionString: connectionString(),
  // Conservative on purpose: a polling + charting workload doesn't need many
  // connections, and a small pool stays well under Postgres limits.
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  // Errors on idle clients surface here. Log loudly but don't crash — the pool
  // recycles the bad client.
  log.error('Unexpected error on idle database client', { error: err.message });
});

/**
 * Thin query helper that infers row shape from the caller. Use parameterized
 * queries ($1, $2, ...) exclusively — never interpolate input into SQL.
 */
export async function query<Row extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>,
): Promise<pg.QueryResult<Row>> {
  return pool.query<Row>(text, params as unknown[] | undefined);
}

/**
 * Run statements inside a transaction. The callback receives a dedicated
 * client; if it throws, the transaction rolls back.
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
