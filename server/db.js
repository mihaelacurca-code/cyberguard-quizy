import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  admin_hash  TEXT NOT NULL,
  settings    TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS polls (
  id          INTEGER PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  question    TEXT NOT NULL,
  config      TEXT NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'draft',
  show_results INTEGER NOT NULL DEFAULT 1,
  revealed    INTEGER NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0,
  opened_at   INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS polls_event ON polls(event_id, position);

CREATE TABLE IF NOT EXISTS votes (
  id             INTEGER PRIMARY KEY,
  poll_id        INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL,
  name           TEXT NOT NULL DEFAULT '',
  value          TEXT NOT NULL,
  score          INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS votes_poll ON votes(poll_id, participant_id);

CREATE TABLE IF NOT EXISTS questions (
  id             INTEGER PRIMARY KEY,
  event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL,
  author         TEXT NOT NULL DEFAULT '',
  text           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'visible',
  highlighted    INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS questions_event ON questions(event_id);

CREATE TABLE IF NOT EXISTS upvotes (
  question_id    INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL,
  PRIMARY KEY (question_id, participant_id)
);

CREATE TABLE IF NOT EXISTS certificates (
  id             TEXT PRIMARY KEY,
  event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL,
  name           TEXT NOT NULL,
  score          INTEGER,
  issued_at      INTEGER NOT NULL,
  UNIQUE (event_id, participant_id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// Columns added after the first release. Existing databases get them on startup;
// every column has a default, so old rows stay valid.
const COLUMNS = [
  ['polls', 'kind', "TEXT NOT NULL DEFAULT ''"],
  ['votes', 'round', "TEXT NOT NULL DEFAULT ''"],
  ['questions', 'reply', "TEXT NOT NULL DEFAULT ''"],
  ['questions', 'replied_at', 'INTEGER'],
];

function migrate(db) {
  for (const [table, column, type] of COLUMNS) {
    const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS votes_round ON votes(poll_id, participant_id, round)');
}

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}
