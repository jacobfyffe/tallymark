import { useEffect, useState } from 'react';
import { apiClient, type ChartResponse } from '../lib/api';
import { ChartRow } from './ChartRow';

type Status = 'loading' | 'ready' | 'error';

/** Fetches and displays a finalized chart (global or personal). */
export function ChartView({ scope }: { scope: { kind: 'global' } | { kind: 'personal'; userId: string } }) {
  const [data, setData] = useState<ChartResponse | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    const load = scope.kind === 'global' ? apiClient.globalChart() : apiClient.personalChart(scope.userId);
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
  }, [scope.kind, scope.kind === 'personal' ? scope.userId : '']);

  if (status === 'loading') {
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

  return (
    <>
      <div className="chart-meta">
        <span>Week of {data.week_start}</span>
        <span>{data.entries.length} on the chart</span>
      </div>
      {data.entries.map((e) => (
        <ChartRow key={`${e.rank}-${e.title}`} entry={e} />
      ))}
    </>
  );
}
