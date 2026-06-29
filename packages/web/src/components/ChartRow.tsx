import type { ChartEntry } from '../lib/api';
import { TallyMarks } from './TallyMarks';

/**
 * A chart row: rank, movement, album art, track, and the tally-mark play count.
 * The #1 entry gets a hero treatment (larger art and type) so the top of the
 * chart reads as a moment, the way a real countdown's #1 does.
 */
export function ChartRow({ entry }: { entry: ChartEntry }) {
  const isOne = entry.rank === 1;
  return (
    <div className={`entry${isOne ? ' is-one' : ''}`}>
      <div className="rank">{entry.rank}</div>
      <Movement entry={entry} />
      <Cover entry={entry} />
      <div className="meta">
        <div className="title">{entry.title}</div>
        <div className="artist">{entry.artist_name}</div>
      </div>
      <div className="stats">
        <TallyMarks count={entry.play_count} />
        <span className="count">
          {entry.play_count}
          <span className="unit"> {entry.play_count === 1 ? 'tally' : 'tallies'}</span>
        </span>
        <span className="extra">
          <span className="peak">peak #{entry.peak_position}</span> · {entry.weeks_on_chart}w
        </span>
      </div>
    </div>
  );
}

/** Album cover, with a graceful fallback tile when no art is available. */
function Cover({ entry }: { entry: ChartEntry }) {
  if (entry.image_url) {
    return <img className="cover" src={entry.image_url} alt="" loading="lazy" />;
  }
  // Fallback: a quiet tile with the track's first initial.
  const initial = entry.title.trim().charAt(0).toUpperCase() || '♪';
  return (
    <div className="cover cover-fallback" aria-hidden="true">
      {initial}
    </div>
  );
}

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
