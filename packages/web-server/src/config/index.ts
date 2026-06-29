import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`Missing required environment variable: ${name}`);
  return v;
}
function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}
function asInt(v: string, name: string): number {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`${name} must be an integer, got: ${v}`);
  return n;
}

export const config = {
  env: optional('NODE_ENV', 'development'),
  port: asInt(optional('PORT', '4000'), 'PORT'),
  // Shared database with all prior phases.
  databaseUrl: required('DATABASE_URL'),
  // Allowed origin for the frontend dev server (CORS).
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),
} as const;
