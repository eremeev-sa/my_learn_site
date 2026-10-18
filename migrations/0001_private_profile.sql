-- No credentials are included in source or the initial database.
CREATE TABLE IF NOT EXISTS learning (
  id INTEGER PRIMARY KEY CHECK (id=1),
  revision INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL
);
INSERT OR IGNORE INTO learning VALUES (1,0,'{"progress":[],"notes":[],"settings":[]}');
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  credential_tag TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY CHECK (id=1),
  count INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
