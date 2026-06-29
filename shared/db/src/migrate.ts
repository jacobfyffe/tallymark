import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool, withTransaction } from './pool.js';
import { log } from './logger.js';

/**
 * Forward-only migration runner for the whole workspace.
 *
 * Each package owns a directory of plain .sql files. The runner applies them in
 * the order the directories are given (phase order: scrobbler -> matching ->
 * charts), and within a directory in filename order (zero-padded prefixes).
 * Applied files are recorded in a single shared schema_migrations table keyed
 * by "<phase>/<filename>", so reruns are no-ops and phases can't collide even
 * if two use the same numeric prefix. Each file runs in its own transaction.
 *
 * Deliberately tiny — for a project this size a readable runner beats a heavy
 * dependency.
 */

export interface MigrationSource {
  /** A short, stable phase label, e.g. 'scrobbler', namespacing the records. */
  phase: string;
  /** Absolute path to that phase's migrations directory. */
  dir: string;
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const { rows } = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  return new Set(rows.map((r) => r.filename));
}

export async function migrateAll(sources: MigrationSource[]): Promise<void> {
  await ensureMigrationsTable();
  const already = await appliedMigrations();

  let appliedCount = 0;
  let total = 0;

  for (const { phase, dir } of sources) {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      total++;
      const key = `${phase}/${file}`;
      if (already.has(key)) continue;

      const sql = await readFile(join(dir, file), 'utf8');
      log.info('Applying migration', { migration: key });

      await withTransaction(async (client) => {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [key]);
      });
      appliedCount++;
    }
  }

  log.info('Migrations complete', { applied: appliedCount, total });
}
