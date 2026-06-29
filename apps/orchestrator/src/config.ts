import 'dotenv/config';

/**
 * Orchestrator configuration. All intervals are in milliseconds and tunable via
 * environment variables, so cadence can be adjusted without code changes.
 */

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}
function asInt(name: string, fallback: string): number {
  const v = optional(name, fallback);
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`${name} must be an integer, got: ${v}`);
  return n;
}

if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL === '') {
  throw new Error('DATABASE_URL is required for the orchestrator.');
}

export const config = {
  // How often to run the capture -> resolve -> live-chart pipeline.
  pipelineIntervalMs: asInt('ORCH_PIPELINE_INTERVAL_MS', '60000'), // 60s
  // How often to check whether a chart week has closed and needs finalizing.
  finalizeCheckIntervalMs: asInt('ORCH_FINALIZE_CHECK_INTERVAL_MS', '3600000'), // 1h
  // Max Spotify accounts to poll per capture cycle.
  capturePollLimit: asInt('ORCH_CAPTURE_POLL_LIMIT', '50'),
  // Personal-chart timezone (mirrors the charts package default).
  personalTimezone: optional('CHART_PERSONAL_TZ', 'America/New_York'),
} as const;
