// Shared types mirroring the server's JSON shapes, plus a tiny fetch client.

export type Movement = 'new' | 'up' | 'down' | 'steady';

export interface ChartEntry {
  rank: number;
  play_count: number;
  title: string;
  artist_name: string;
  peak_position: number;
  weeks_on_chart: number;
  movement: Movement;
  movement_amount: number | null;
  image_url: string | null;
}

export interface ChartResponse {
  scope: string;
  week_start: string | null;
  entries: ChartEntry[];
}

export interface WorkSummary {
  id: string;
  title: string;
  artist_name: string;
  recording_count: number;
  total_plays: number;
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export const apiClient = {
  globalChart: () => getJSON<ChartResponse>('/api/charts/global'),
  personalChart: (userId: string) => getJSON<ChartResponse>(`/api/charts/personal/${userId}`),
  works: (search: string) =>
    getJSON<WorkSummary[]>(`/api/works${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  merge: (sourceWorkId: string, targetWorkId: string) =>
    postJSON<{ ok: boolean; recordingsAffected: number; note: string }>('/api/admin/merge', {
      sourceWorkId,
      targetWorkId,
    }),
  split: (workId: string) =>
    postJSON<{ ok: boolean; recordingsAffected: number; note: string }>('/api/admin/split', {
      workId,
    }),
};
