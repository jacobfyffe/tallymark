-- 0005_artist_position.sql
-- Preserve each artist's position in Spotify's original credit order, so the
-- lead artist always renders first and "feat./with" wording can be correct.
--
-- Spotify's track.artists array is already ordered (lead artist at index 0,
-- featured artists after), but the first version of this layer only captured
-- *which* artists are credited, not their order — defaulting display to
-- alphabetical, which is wrong whenever the lead artist doesn't sort first.

ALTER TABLE work_artists ADD COLUMN IF NOT EXISTS position SMALLINT NOT NULL DEFAULT 0;

-- Note: existing rows default to position 0 (i.e. "everyone's the lead") until
-- the next artist-linking pipeline run, which re-derives every row's real
-- position from plays.raw and overwrites this default.
