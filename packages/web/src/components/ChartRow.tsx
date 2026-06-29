import type { ChartEntry } from '../lib/api';

/** A single chart row: rank, movement marker, track, and chart-culture stats. */
export function ChartRow({ entry }: { entry: ChartEntry }) {
  return (
    <div className={`entry${entry.rank === 1 ? ' is-one' : ''}`}>
      <div className="rank">{entry.rank}</div>
      <Movement entry={entry} />
      <div className="meta">
        <div className="title">{entry.title}</div>
        <div className="artist">{entry.artist_name}</div>
      </div>
      <div className="stats">
        <div>
          <span className="plays">{entry.play_count}</span> {entry.play_count === 1 ? 'play' : 'plays'}
        </div>
        <div>
          <span className="peak">peak #{entry.peak_position}</span> · {entry.weeks_on_chart}w
        </div>
      </div>
    </div>
  );
}

/** The signature element: how a track moved since last week. */
function Movement({ entry }: { entry: ChartEntry }) {
  if (entry.movement === 'new') {
    return (
      <div className="move new">
        <span className="arrow">★</span>
        NEW
      </div>
    );
  }
  if (entry.movement === 'steady') {
    return (
      <div className="move steady">
        <span className="arrow">–</span>
      </div>
    );
  }
  const up = entry.movement === 'up';
  const amount = entry.movement_amount === null ? 0 : Math.abs(entry.movement_amount);
  return (
    <div className={`move ${up ? 'up' : 'down'}`}>
      <span className="arrow">{up ? '▲' : '▼'}</span>
      {amount}
    </div>
  );
}
