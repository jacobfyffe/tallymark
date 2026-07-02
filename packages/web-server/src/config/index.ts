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
  databaseUrl: required('DATABASE_URL'),
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),

  // Spotify OAuth — needed so the web-server can connect user accounts.
  // Use the same Spotify app (client_id/secret) as the scrobbler.
  // The redirect URI must point through the Vite proxy: localhost:5173/callback/spotify.
  spotify: {
    clientId: required('SPOTIFY_CLIENT_ID'),
    clientSecret: required('SPOTIFY_CLIENT_SECRET'),
    redirectUri: optional('SPOTIFY_REDIRECT_URI', 'http://localhost:5173/callback/spotify'),
  },

  // Session secret — any long random string. Change before deploying to prod.
  sessionSecret: required('SESSION_SECRET'),
} as const;
