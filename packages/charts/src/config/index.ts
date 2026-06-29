import 'dotenv/config';

/**
 * Configuration for the charting engine.
 *
 * Reads the same database Phases 1 and 2 write to. The only chart-specific knob
 * is the personal-chart timezone (week boundaries for personal charts use local
 * time; global charts always use UTC).
 */

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function asInt(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got: ${value}`);
  }
  return parsed;
}

export const config = {
  env: optional('NODE_ENV', 'development'),

  database: {
    url: required('DATABASE_URL'),
  },

  charts: {
    // IANA timezone for PERSONAL chart week boundaries. Global charts use UTC.
    // Default America/New_York (Eastern) per the project's locked decision.
    personalTimezone: optional('CHART_PERSONAL_TZ', 'America/New_York'),
    // Max entries per weekly chart.
    size: asInt(optional('CHART_SIZE', '100'), 'CHART_SIZE'),
  },
} as const;

export type Config = typeof config;
