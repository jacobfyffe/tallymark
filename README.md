# Tallymark

A music tracking and charting service. Tallymark captures your listening (each play is a **tally**), resolves those tallies into canonical songs, computes weekly charts (rank, peak position, weeks-on-chart), and serves it all through a web UI — and an **orchestrator** runs the whole pipeline automatically so the system runs itself.

This is a monorepo (npm workspaces) consolidating what began as separate services, so they share code cleanly and deploy as one unit.

## Layout

```
tallymark/
├── shared/
│   └── db/                  @tallymark/db — shared Postgres pool + logger
├── packages/
│   ├── scrobbler/           capture tallies from Spotify + enrich with ISRCs
│   ├── track-matching/      resolve tallies into canonical recordings & works
│   ├── charts/              weekly + live chart computation
│   ├── web-server/          API serving chart data (with movement) + admin
│   └── web/                 React (Vite) frontend
└── apps/
    └── orchestrator/        the always-on scheduler that runs the pipeline
```

The data flows in one direction: **capture → resolve → chart → serve**, all over one shared Postgres database.

## The orchestrator

The orchestrator (`apps/orchestrator`) is the piece that makes Tallymark self-running. It imports the real logic from each package (no duplication) and runs two scheduled loops:

- **Pipeline loop** (~60s): capture new tallies, then resolve them (ISRC → fuzzy → works grouping).
- **Finalize loop** (~1h): recompute finalized charts for the global scope and every user's personal scope. Chart computation self-detects completed weeks and is idempotent, so this naturally picks up each week as it closes.

Each cycle is error-isolated — a failure is logged and the loop continues rather than crashing the process.

```bash
npm install                          # from the repo root — links all packages
cp apps/orchestrator/.env.example apps/orchestrator/.env   # fill in DB + Spotify
npm run orchestrator:dev             # start the self-running pipeline
```

## Database setup

The packages share one database. On a fresh database, apply each package's migrations:

```bash
npm run migrate:dev --workspace @tallymark/scrobbler
npm run migrate:dev --workspace @tallymark/track-matching
npm run migrate:dev --workspace @tallymark/charts
```

## Web app

```bash
npm run dev --workspace @tallymark/web-server   # API on :4000
npm run dev --workspace @tallymark/web          # frontend on :5173
```

## Workspace commands

```bash
npm run typecheck     # typecheck every package
npm run build         # build every package
```

## Status

Built and typechecking across all packages; unit tests pass (track-matching 22, charts 9). Next: deployment (hosted Postgres + always-on hosting), a rename pass through the UI, and feature work (artist pages, richer admin).
