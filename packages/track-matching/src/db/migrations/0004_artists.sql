-- 0004_artists.sql
-- Artist identity layer, for artist pages and collaboration credit.
--
-- Spotify's track payload already lists every credited artist (id + name) per
-- track. The scrobbler collapses that into a single joined display string at
-- ingest time (plays.artist_name), but the raw payload — including each
-- artist's stable Spotify id — is preserved in plays.raw. This layer derives
-- structured, many-to-many artist credit from that raw data, so a
-- collaboration's work links to BOTH artists rather than living inside one
-- combined name string.
--
-- Like the works layer, this is additive and fully recomputable: it can be
-- wiped and rebuilt from plays.raw + recording_works without losing anything.

-- One row per distinct Spotify artist seen across any play.
CREATE TABLE IF NOT EXISTS artists (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Spotify's own artist id. Stable identity key — never derived from name
    -- matching, so "Marshmello" can't accidentally split or merge with itself.
    spotify_artist_id TEXT NOT NULL UNIQUE,
    -- Display name, from the most recent play we saw this artist on.
    name              TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Many-to-many: a work can have multiple credited artists (a collaboration),
-- and an artist has many works. This is what lets a collab appear on every
-- credited artist's page.
CREATE TABLE IF NOT EXISTS work_artists (
    work_id    BIGINT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    artist_id  BIGINT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    PRIMARY KEY (work_id, artist_id)
);

-- Looking up "all works for this artist" (an artist page) is the hot path;
-- looking up "all artists for this work" (rendering collab credit on a chart
-- row) is covered by the primary key itself.
CREATE INDEX IF NOT EXISTS idx_work_artists_artist ON work_artists(artist_id);
