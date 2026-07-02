import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomBytes } from 'node:crypto';
import { config } from '../config/index.js';
import { query, withTransaction, log } from '@tallymark/db';

/**
 * Auth routes.
 *
 *   GET  /connect/spotify   → redirect to Spotify consent screen
 *   GET  /callback/spotify  → handle OAuth callback, set session, redirect home
 *   POST /logout            → destroy session
 *
 * The OAuth flow is identical to the scrobbler's but lives here so the web app
 * can connect accounts without users needing to visit the scrobbler server.
 * Both servers share the same DB, so plays captured by the scrobbler's poller
 * are immediately available on the web-server's chart endpoints.
 */

export const auth = Router();

// Extend express-session's SessionData so TypeScript knows about our fields.
declare module 'express-session' {
  interface SessionData {
    userId: string;
    spotifyUserId: string;
    oauthState: string;
  }
}

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SCOPES = 'user-read-recently-played';

function basicAuth(): string {
  const raw = `${config.spotify.clientId}:${config.spotify.clientSecret}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

/** Step 1: redirect the user to Spotify's consent screen. */
auth.get('/connect/spotify', (req: Request, res: Response) => {
  const state = randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.spotify.clientId,
    scope: SCOPES,
    redirect_uri: config.spotify.redirectUri,
    state,
  });
  const authorizeUrl = `${AUTHORIZE_URL}?${params.toString()}`;
  log.info('Redirecting to Spotify authorize', { authorizeUrl });
  res.redirect(authorizeUrl);
});

/** Step 2: Spotify redirects back with ?code & ?state. */
auth.get('/callback/spotify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, state, error } = req.query;

    if (typeof error === 'string') {
      res.redirect(`/?error=${encodeURIComponent('Spotify authorization was denied.')}`);
      return;
    }
    if (typeof code !== 'string' || typeof state !== 'string') {
      res.redirect('/?error=missing_params');
      return;
    }
    if (state !== req.session.oauthState) {
      res.redirect('/?error=invalid_state');
      return;
    }
    delete req.session.oauthState;

    // Exchange code for tokens.
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: basicAuth(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.spotify.redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      throw new Error(`Spotify token exchange failed: ${tokenRes.status}`);
    }
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    if (!tokens.refresh_token) {
      throw new Error('Spotify did not return a refresh token.');
    }
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1_000);

    // Fetch the Spotify user id to use as a stable identity key.
    const profileRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) {
      throw new Error(`Failed to fetch Spotify profile: ${profileRes.status}`);
    }
    const profile = (await profileRes.json()) as { id: string; display_name?: string };

    // Upsert: if this Spotify account has connected before, update its tokens;
    // otherwise create a new user row and link it. We check first to avoid
    // creating an orphaned user row on every reconnect.
    const userId = await withTransaction(async (client) => {
      const existing = await client.query<{ user_id: string }>(
        `SELECT user_id FROM spotify_accounts WHERE spotify_user_id = $1`,
        [profile.id],
      );
      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE spotify_accounts
              SET access_token = $1, refresh_token = $2, token_expires_at = $3
            WHERE spotify_user_id = $4`,
          [tokens.access_token, tokens.refresh_token, expiresAt, profile.id],
        );
        return existing.rows[0].user_id;
      }
      const newUser = await client.query<{ id: string }>(`INSERT INTO users DEFAULT VALUES RETURNING id`);
      const newUserId = newUser.rows[0].id;
      await client.query(
        `INSERT INTO spotify_accounts
           (user_id, spotify_user_id, access_token, refresh_token, token_expires_at)
           VALUES ($1, $2, $3, $4, $5)`,
        [newUserId, profile.id, tokens.access_token, tokens.refresh_token, expiresAt],
      );
      return newUserId;
    });

    req.session.userId = String(userId);
    req.session.spotifyUserId = profile.id;

    log.info('User connected via Spotify', { userId, spotifyUserId: profile.id });
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

/** Destroy the session and send the user back to the login page. */
auth.post('/logout', (req: Request, res: Response, next: NextFunction) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.json({ ok: true });
  });
});
