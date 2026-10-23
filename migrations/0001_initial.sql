-- EricMotors: Metadaten in D1. Fahrzeugdaten selbst liegen als gzip-JSON in R2.
-- Zeitstempel: Unix-Millisekunden (INTEGER).

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  vehicle_count INTEGER NOT NULL DEFAULT 0,
  banned        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE oauth_accounts (
  provider         TEXT NOT NULL CHECK (provider IN ('github', 'google')),
  provider_user_id TEXT NOT NULL,
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at       INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_user_id)
);
CREATE INDEX idx_oauth_accounts_user ON oauth_accounts (user_id);

CREATE TABLE vehicles (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  visibility     TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'unlisted', 'public')),
  drive_type     TEXT NOT NULL,
  power_w        REAL,
  mass_kg        REAL,
  vehicle_class  TEXT,
  tags           TEXT NOT NULL DEFAULT '[]',
  fork_of        TEXT,
  schema_version INTEGER NOT NULL,
  data_key       TEXT NOT NULL,
  thumb_key      TEXT,
  like_count     INTEGER NOT NULL DEFAULT 0,
  report_count   INTEGER NOT NULL DEFAULT 0,
  hidden         INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  published_at   INTEGER
);
CREATE INDEX idx_vehicles_owner ON vehicles (owner_id, updated_at DESC);
CREATE INDEX idx_vehicles_public_recent ON vehicles (visibility, published_at DESC);
CREATE INDEX idx_vehicles_public_drive ON vehicles (visibility, drive_type, published_at DESC);
CREATE INDEX idx_vehicles_public_likes ON vehicles (visibility, like_count DESC);

CREATE TABLE vehicle_tags (
  tag        TEXT NOT NULL,
  vehicle_id TEXT NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  PRIMARY KEY (tag, vehicle_id)
);

CREATE TABLE likes (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, vehicle_id)
);

CREATE TABLE reports (
  id          TEXT PRIMARY KEY,
  vehicle_id  TEXT NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (vehicle_id, reporter_id)
);
