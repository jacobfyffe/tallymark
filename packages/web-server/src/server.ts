import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { api } from './routes/api.js';
import { log } from '@tallymark/db';
import type { Request, Response, NextFunction } from 'express';

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', api);

// Centralized error handler.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  log.error('Request failed', { error: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: 'Internal error' });
});

app.listen(config.port, () => {
  log.info('Charts API listening', { port: config.port });
});
