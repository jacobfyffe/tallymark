import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  getLatestChart,
  listWorks,
  mergeWorks,
  splitWork,
} from '../db/repository.js';

/**
 * API routes.
 *
 *   GET  /api/charts/global               latest global chart (with movement)
 *   GET  /api/charts/personal/:userId     latest personal chart
 *   GET  /api/works?search=...            works list for the admin view
 *   POST /api/admin/merge                 { sourceWorkId, targetWorkId }
 *   POST /api/admin/split                 { workId }
 *
 * Note: the live (in-progress week) chart is computed by the charts engine, not
 * stored, so it's not served here yet — the web app shows finalized charts. A
 * future endpoint could compute live on demand.
 */
export const api = Router();

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
}

api.get(
  '/charts/global',
  wrap(async (_req, res) => {
    res.json(await getLatestChart('global'));
  }),
);

api.get(
  '/charts/personal/:userId',
  wrap(async (req, res) => {
    const userId = req.params.userId;
    res.json(await getLatestChart(`personal:${userId}`));
  }),
);

api.get(
  '/works',
  wrap(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : null;
    res.json(await listWorks(search, 200));
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
