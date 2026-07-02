// Shared types mirroring the server's JSON shapes, plus a tiny fetch client.

export type Movement = 'new' | 'up' | 'down' | 'steady';

export interface ChartEntryArtist {
  /** Null means this work hasn't been artist-linked yet — render as plain
   *  text rather than a link. */
  id: string | null;
  name: string;
}

export interface ChartEntry {
  work_id: string;
  rank: number;
  play_count: number;
  title: string;
  artists: ChartEntryArtist[];
  peak_position: number;
  weeks_on_chart: number;
  movement: Movement;
  movement_amount: number | null;
  image_url: string | null;
}

export interface ChartResponse {
  scope: string;
  week_start: string | null;
  /** Every charted week for this scope, oldest first — drives prev/next navigation. */
  available_weeks: string[];
  entries: ChartEntry[];
}

export interface WorkSummary {
  id: string;
  title: string;
  artist_name: string;
  recording_count: number;
  total_plays: number;
}

export interface ArtistChartSong {
  work_id: string;
  title: string;
  peak_position: number;
  weeks_on_chart: number;
  total_plays: number;
  currently_charting: boolean;
  current_rank: number | null;
  is_primary_credit: boolean;
  collaborators: ChartEntryArtist[];
  image_url: string | null;
}

export interface ArtistChartSection {
  songs: ArtistChartSong[];
}

export interface ArtistResponse {
  artist: { id: string; name: string } | null;
  global: ArtistChartSection;
  personal: ArtistChartSection;
}

export interface SongHistoryPoint {
  week_start: string;
  rank: number;
}

export interface SongChartSection {
  peak_position: number | null;
  weeks_on_chart: number;
  total_plays: number;
  currently_charting: boolean;
  current_rank: number | null;
  history: SongHistoryPoint[];
}

export interface SongResponse {
  work: { id: string; title: string } | null;
  artists: ChartEntryArtist[];
  image_url: string | null;
  global: SongChartSection;
  personal: SongChartSection;
}

export interface SearchResult {
  artists: { id: string; name: string }[];
  works: { id: string; title: string; artist_name: string }[];
}

export interface CurrentUser {
  userId: string;
  spotifyUserId: string | null;
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
  me: () => getJSON<CurrentUser>('/api/me'),
  logout: () =>
    fetch('/logout', { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error('Logout failed');
    }),
  globalChart: (week?: string) =>
    getJSON<ChartResponse>(`/api/charts/global${week ? `?week=${encodeURIComponent(week)}` : ''}`),
  personalChart: (userId: string, week?: string) =>
    getJSON<ChartResponse>(
      `/api/charts/personal/${userId}${week ? `?week=${encodeURIComponent(week)}` : ''}`,
    ),
  artist: (artistId: string, personalUserId: string) =>
    getJSON<ArtistResponse>(
      `/api/artists/${encodeURIComponent(artistId)}?personalUserId=${encodeURIComponent(personalUserId)}`,
    ),
  song: (workId: string, personalUserId: string) =>
    getJSON<SongResponse>(
      `/api/works/${encodeURIComponent(workId)}?personalUserId=${encodeURIComponent(personalUserId)}`,
    ),
  search: (q: string) => getJSON<SearchResult>(`/api/search?q=${encodeURIComponent(q)}`),
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
