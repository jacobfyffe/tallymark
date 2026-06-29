import { useEffect, useState } from 'react';
import { apiClient, type WorkSummary } from '../lib/api';

/**
 * Admin: correct how recordings group into works.
 *
 * Select one work as the "source". To merge, also pick a "target" — the source
 * folds into the target's grouping. To split, just pick the source and split it
 * into standalone recordings. Both write overrides that take effect on the next
 * resolver run (the UI says so, rather than implying instant chart changes).
 */
export function AdminView() {
  const [works, setWorks] = useState<WorkSummary[]>([]);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function reload(q: string) {
    apiClient
      .works(q)
      .then(setWorks)
      .catch(() => setNote({ kind: 'error', text: "Couldn't load works. Is the API running?" }));
  }

  useEffect(() => {
    const t = setTimeout(() => reload(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  function pick(id: string) {
    setNote(null);
    if (source === null) {
      setSource(id);
    } else if (id === source) {
      setSource(null);
      setTarget(null);
    } else if (target === id) {
      setTarget(null);
    } else {
      setTarget(id);
    }
  }

  async function doMerge() {
    if (!source || !target) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await apiClient.merge(source, target);
      setNote({ kind: 'success', text: `Merged ${r.recordingsAffected} recording(s). ${r.note}` });
      setSource(null);
      setTarget(null);
      reload(search);
    } catch (e) {
      setNote({ kind: 'error', text: e instanceof Error ? e.message : 'Merge failed' });
    } finally {
      setBusy(false);
    }
  }

  async function doSplit() {
    if (!source) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await apiClient.split(source);
      setNote({ kind: 'success', text: `Split ${r.recordingsAffected} recording(s). ${r.note}` });
      setSource(null);
      setTarget(null);
      reload(search);
    } catch (e) {
      setNote({ kind: 'error', text: e instanceof Error ? e.message : 'Split failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="admin-intro">
        Fix how versions group. Pick a song to work on; pick a second to merge the first into it, or split the first
        into separate entries. Changes apply the next time the resolver runs.
      </p>
      <input
        className="search"
        placeholder="Search songs…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {works.map((w) => {
        const role = w.id === source ? 'source' : w.id === target ? 'target' : null;
        return (
          <div
            key={w.id}
            className={`work${role ? ' selected' : ''}`}
            onClick={() => pick(w.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && pick(w.id)}
          >
            <div>
              <div className="wtitle">{w.title}</div>
              <div className="wartist">{w.artist_name}</div>
            </div>
            <div className="wmeta">
              {w.recording_count} rec · {w.total_plays} plays
            </div>
            {role && <div className="badge">{role}</div>}
          </div>
        );
      })}

      <div className="admin-bar">
        <button className="btn btn-merge" disabled={!source || !target || busy} onClick={doMerge}>
          Merge into target
        </button>
        <button className="btn btn-split" disabled={!source || busy} onClick={doSplit}>
          Split apart
        </button>
        {note && <span className={`admin-note ${note.kind}`}>{note.text}</span>}
        {!note && source && !target && <span className="admin-note">Pick a target to merge, or split the source.</span>}
        {!note && !source && <span className="admin-note">Select a song to begin.</span>}
      </div>
    </>
  );
}
