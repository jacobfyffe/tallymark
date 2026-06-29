-- 0001_charts.sql
-- Phase 3 charting schema.
--
-- Stores computed weekly chart entries. Peak position and weeks-on-chart are
-- derived from these rows at query time (always consistent; can be materialized
-- later if needed). Reads upstream play/work data; never mutates it.

-- One row per (scope, week) that has been computed.
CREATE TABLE IF NOT EXISTS chart_weeks (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- 'global' or 'personal:<userId>'. A chart is always tied to a scope.
    scope           TEXT NOT NULL,
    -- The week's Monday as an ISO date (in the scope's timezone). Stable id.
    week_start      DATE NOT NULL,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (scope, week_start)
);

-- One row per (scope, week, work): where that work ranked that week.
CREATE TABLE IF NOT EXISTS chart_entries (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chart_week_id   BIGINT NOT NULL REFERENCES chart_weeks(id) ON DELETE CASCADE,
    work_id         BIGINT NOT NULL,
    rank            INTEGER NOT NULL,
    play_count      INTEGER NOT NULL,
    UNIQUE (chart_week_id, work_id)
);

CREATE INDEX IF NOT EXISTS idx_chart_entries_work ON chart_entries(work_id);
CREATE INDEX IF NOT EXISTS idx_chart_entries_week_rank ON chart_entries(chart_week_id, rank);
