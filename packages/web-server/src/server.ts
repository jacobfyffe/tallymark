import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { config } from './config/index.js';
import { api } from './routes/api.js';
import { auth } from './routes/auth.js';
import { log } from '@tallymark/db';
import type { Request, Response, NextFunction } from 'express';

const app = express();

app.use(cors({
  origin: config.corsOrigin,
  credentials: true, // required for session cookies to cross the Vite proxy
}));
app.use(express.json());

app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // In development we're on plain HTTP through the Vite proxy.
      // Set to true before deploying to HTTPS.
      secure: config.env === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1_000, // 30 days
    },
  }),
);

app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
app.use('/', auth);
app.use('/api', api);

// Centralized error handler.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  log.error('Request failed', { error: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: 'Internal error' });
});

app.listen(config.port, () => {
  log.info('Charts API listening', { port: config.port });
});
