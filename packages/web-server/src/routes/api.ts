import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  getChart,
  getArtist,
  getWork,
  search,
  listWorks,
  mergeWorks,
  splitWork,
} from '../db/repository.js';

/**
 * API routes.
 *
 *   GET  /api/charts/global?week=YYYY-MM-DD           a chart week (defaults to latest)
 *   GET  /api/charts/personal/:userId?week=YYYY-MM-DD same, for a personal chart
 *   GET  /api/artists/:id?personalUserId              an artist's global + personal chart history
 *   GET  /api/works/:id?personalUserId                 one song's global + personal chart history
 *   GET  /api/search?q=...                             artists + songs matching a term
 *   GET  /api/works?search=...                        works list for the admin view
 *   POST /api/admin/merge                              { sourceWorkId, targetWorkId }
 *   POST /api/admin/split                               { workId }
 *
 * Note: the live (in-progress week) chart is computed by the charts engine, not
 * stored, so it's not served here yet — the web app shows finalized charts. A
 * future endpoint could compute live on demand.
 */
export const api = Router();

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
}

/**
 * Who is the currently logged-in user?
 * Returns 401 if no session exists — the frontend uses this to decide
 * whether to show the chart or the login page.
 */
api.get('/me', (req: Request, res: Response) => {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not logged in' });
    return;
  }
  res.json({
    userId: req.session.userId,
    spotifyUserId: req.session.spotifyUserId ?? null,
  });
});

api.get(
  '/charts/global',
  wrap(async (req, res) => {
    const week = typeof req.query.week === 'string' ? req.query.week : undefined;
    res.json(await getChart('global', week));
  }),
);

api.get(
  '/charts/personal/:userId',
  wrap(async (req, res) => {
    const userId = req.params.userId;
    const week = typeof req.query.week === 'string' ? req.query.week : undefined;
    res.json(await getChart(`personal:${userId}`, week));
  }),
);

api.get(
  '/artists/:id',
  wrap(async (req, res) => {
    const artistId = req.params.id;
    // The currently-viewing user's personal chart, for the "Personal" section.
    // Hardcoded to user #1 today (same as the rest of the app, until there's
    // real auth) but accepts an override via query string.
    const personalUserId = typeof req.query.personalUserId === 'string' ? req.query.personalUserId : '1';
    const result = await getArtist(artistId, personalUserId);
    if (!result.artist) {
      res.status(404).json({ error: 'Artist not found' });
      return;
    }
    res.json(result);
  }),
);

api.get(
  '/works/:id',
  wrap(async (req, res) => {
    const workId = req.params.id;
    const personalUserId = typeof req.query.personalUserId === 'string' ? req.query.personalUserId : '1';
    const result = await getWork(workId, personalUserId);
    if (!result.work) {
      res.status(404).json({ error: 'Song not found' });
      return;
    }
    res.json(result);
  }),
);

api.get(
  '/search',
  wrap(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      res.json({ artists: [], works: [] });
      return;
    }
    res.json(await search(q));
  }),
);

api.get(
  '/works',
  wrap(async (req, res) => {
    const searchTerm = typeof req.query.search === 'string' ? req.query.search : null;
    res.json(await listWorks(searchTerm, 200));
  }),
);

api.post(
  '/admin/merge',
  wrap(async (req, res) => {
    const { sourceWorkId, targetWorkId } = req.body as {
      sourceWorkId?: string;
      targetWorkId?: string;
    };
    if (!sourceWorkId || !targetWorkId) {
      res.status(400).json({ error: 'sourceWorkId and targetWorkId are required' });
      return;
    }
    if (sourceWorkId === targetWorkId) {
      res.status(400).json({ error: 'Cannot merge a work into itself' });
      return;
    }
    const affected = await mergeWorks(sourceWorkId, targetWorkId);
    res.json({ ok: true, recordingsAffected: affected, note: 'Run the resolver to apply.' });
  }),
);

api.post(
  '/admin/split',
  wrap(async (req, res) => {
    const { workId } = req.body as { workId?: string };
    if (!workId) {
      res.status(400).json({ error: 'workId is required' });
      return;
    }
    const affected = await splitWork(workId);
    res.json({ ok: true, recordingsAffected: affected, note: 'Run the resolver to apply.' });
  }),
);
