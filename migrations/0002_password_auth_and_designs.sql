-- Phase 2: Login mit Benutzername + Passwort (kein OAuth) und gemeinsame Tabelle für Autos und Motoren.
-- Zum Zeitpunkt dieser Migration existieren noch keine Nutzerdaten; alte Tabellen werden ersetzt.

DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS likes;
DROP TABLE IF EXISTS vehicle_tags;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS oauth_accounts;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL,
  username_lower  TEXT NOT NULL UNIQUE,
  -- SHA-256(salt ‖ clientKey); clientKey = PBKDF2-SHA-256(Passwort, 600 000 Runden) im Browser.
  password_hash   TEXT NOT NULL,
  password_salt   TEXT NOT NULL,
  -- Erhöhen macht alle bestehenden Sessions ungültig (Passwortwechsel, „überall abmelden“).
  session_version INTEGER NOT NULL DEFAULT 0,
  design_count    INTEGER NOT NULL DEFAULT 0,
  banned          INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

CREATE TABLE designs (
  id             TEXT PRIMARY KEY,
  kind           TEXT NOT NULL CHECK (kind IN ('car', 'engine')),
  owner_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  visibility     TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'unlisted', 'public')),
  schema_version INTEGER NOT NULL,
  -- Fortlaufende Version; R2-Schlüssel enthalten sie, damit Daten unveränderlich gecacht werden können.
  version        INTEGER NOT NULL DEFAULT 1,
  data_key       TEXT NOT NULL,
  thumb_key      TEXT,
  -- Kennzahlen für Filter und Karten (vom Client berechnet, serverseitig auf Plausibilität geprüft).
  power_w        REAL,
  torque_nm      REAL,
  mass_kg        REAL,
  accel_s        REAL,
  top_speed_ms   REAL,
  cost_eur       REAL,
  category       TEXT,   -- Auto: Karosserieform; Motor: Bauart (inline/v/boxer)
  layout         TEXT,   -- Auto: fwd/rwd/awd; Motor: Kraftstoff
  fork_of        TEXT,
  like_count     INTEGER NOT NULL DEFAULT 0,
  report_count   INTEGER NOT NULL DEFAULT 0,
  hidden         INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  published_at   INTEGER
);
CREATE INDEX idx_designs_owner ON designs (owner_id, updated_at DESC);
CREATE INDEX idx_designs_gallery_recent ON designs (kind, visibility, hidden, published_at DESC);
CREATE INDEX idx_designs_gallery_likes ON designs (kind, visibility, hidden, like_count DESC, id);

CREATE TABLE likes (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  design_id  TEXT NOT NULL REFERENCES designs (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, design_id)
);

CREATE TABLE reports (
  design_id   TEXT NOT NULL REFERENCES designs (id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (design_id, reporter_id)
);
