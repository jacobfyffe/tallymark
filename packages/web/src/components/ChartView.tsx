import { useEffect, useState } from 'react';
import { apiClient, type ChartResponse } from '../lib/api';
import { ChartRow } from './ChartRow';

type Status = 'loading' | 'ready' | 'error';
type Scope = { kind: 'global' } | { kind: 'personal'; userId: string };

/** Fetches and displays a finalized chart (global or personal), with prev/next week navigation. */
export function ChartView({ scope }: { scope: Scope }) {
  const [data, setData] = useState<ChartResponse | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  // undefined = "show me the latest week"; once a chart loads we know the
  // actual date and can step forward/back from there.
  const [week, setWeek] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    const load = scope.kind === 'global' ? apiClient.globalChart(week) : apiClient.personalChart(scope.userId, week);
    load
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [scope.kind, scope.kind === 'personal' ? scope.userId : '', week]);
  // Note: switching the Global/Personal tab routes to a different component
  // instance entirely, so `week` naturally resets to undefined (latest week)
  // whenever you switch tabs — no manual reset needed here.

  if (status === 'loading' && !data) {
    return <div className="state">Reading the tallies…</div>;
  }
  if (status === 'error') {
    return (
      <div className="state">
        <div className="big">Couldn't load the chart</div>
        Make sure the API server is running, then refresh.
      </div>
    );
  }
  if (!data || data.entries.length === 0) {
    return (
      <div className="state">
        <div className="big">No chart yet</div>
        Charts appear once a week (Mon–Sun) has fully finished. Keep listening — the first one lands when this week closes.
      </div>
    );
  }

  const idx = data.week_start ? data.available_weeks.indexOf(data.week_start) : -1;
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < data.available_weeks.length - 1;

  return (
    <>
      <div className="chart-meta">
        <span>
          <button
            type="button"
            className="week-nav"
            disabled={!hasPrev}
            onClick={() => setWeek(data.available_weeks[idx - 1])}
            aria-label="Previous week"
          >
            ‹
          </button>
          {' '}Week of {data.week_start}{' '}
          <button
            type="button"
            className="week-nav"
            disabled={!hasNext}
            onClick={() => setWeek(data.available_weeks[idx + 1])}
            aria-label="Next week"
          >
            ›
          </button>
        </span>
        <span>{data.entries.length} on the chart</span>
      </div>
      {data.entries.map((e) => (
        <ChartRow key={`${e.rank}-${e.title}`} entry={e} />
      ))}
    </>
  );
}
