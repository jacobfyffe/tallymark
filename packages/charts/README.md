# charts

Computes weekly music charts from canonical play data — rank, peak position, and weeks-on-chart — in the style of Billboard / Last.fm. This is Phase 3 of a larger music-tracking service: Phase 1 ([scrobbler](https://github.com/jacobfyffe/scrobbler)) captures plays, Phase 2 ([track-matching](https://github.com/jacobfyffe/track-matching)) resolves them into canonical works, and this turns that into charts.

## What it computes

- **Weekly rankings** — for each completed chart week, works ranked by play count (Top 100).
- **Peak position** — the best rank a work has ever reached.
- **Weeks-on-chart** — how many weeks a work has appeared.

Charts rank **works** (songs), so different versions group per the Phase 2 rules.

## Design

- **Fixed weeks**, Monday 00:00 → Sunday 23:59, the Billboard model — which keeps weeks-on-chart clean. A week is charted once it has fully elapsed; the in-progress week is excluded.
- **Timezone:** personal charts use a configurable local zone (Eastern by default); global charts use UTC. (A global chart can't meaningfully mix per-user local weeks, so it standardizes on UTC.)
- **Scope:** every chart is either `global` (all users pooled) or `personal:<userId>` (one user). The same engine runs both; scope is a filter plus a label. With one user, the two are currently identical.
- **Eligibility:** Top 100, no minimum play count.
- **Tie-break:** equal play counts are broken by earliest first-play — the work you discovered first ranks higher.

## Architecture

Shares one PostgreSQL database with Phases 1–2. **Reads** `plays`, `play_resolutions`, `recording_works`, `works`; **writes** its own chart tables; never mutates upstream data.

| Table | Purpose |
| --- | --- |
| `chart_weeks` | One row per (scope, week) computed. |
| `chart_entries` | One row per (scope, week, work): rank + play count. |

Peak position and weeks-on-chart are derived from `chart_entries` at query time, so they're always consistent.

### Module layout

| Path | Responsibility |
| --- | --- |
| `src/charting/weeks.ts` | Week-boundary math (timezone- and DST-aware). |
| `src/charting/repository.ts` | Ranking query, persistence, chart/derived-stat queries. |
| `src/charting/engine.ts` | Compute all completed weeks for a scope. |
| `src/charting/run.ts` | Entrypoint: compute global + per-user personal charts. |
| `src/charting/show.ts` | Display a computed (finalized) chart. |
| `src/charting/live.ts` | Live Chart: rank the current in-progress week on demand. |

## Setup

Prerequisites: Node 20+, and the same database Phases 1–2 use.

```bash
npm install
cp .env.example .env          # DATABASE_URL points at the shared database
npm run migrate:dev           # create chart tables
npm run chart:dev             # compute charts for all completed weeks
npm run show                  # display the latest global chart
```

Other views:

```bash
npm run show global 2026-06-22     # a specific global week
npm run show personal 1            # latest week for user #1
npm run live                       # Live Chart: the current in-progress week
npm run live personal 1            # live chart for user #1
```

The **Live Chart** ranks the current, unfinished week on demand — "what's hot right now." It's provisional (not saved, no peak/weeks-on-chart) and complements the official finalized weekly charts.

## Scripts

| Command | Description |
| --- | --- |
| `npm run chart:dev` | Compute charts (global + personal) for all completed weeks. |
| `npm run show ...` | Display a finalized chart (global / specific week / personal). |
| `npm run live ...` | Live Chart: rank the current in-progress week. |
| `npm run migrate:dev` | Apply migrations. |
| `npm test` | Week-math unit tests (incl. DST boundaries). |
| `npm run build` / `npm run typecheck` | Compile / type-check. |

## Roadmap

- **Done:** weekly ranking, peak position, weeks-on-chart; global + personal scopes.
- **Next:** a web frontend for charts (and an admin view for works merge/split) — both are interfaces over this canonical data.
