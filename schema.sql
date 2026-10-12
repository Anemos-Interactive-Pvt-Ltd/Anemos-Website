-- Blog storage (Cloudflare D1). Apply with:
--   npx wrangler d1 execute anemos-blog-experiment --env experiment --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT    NOT NULL UNIQUE,
  title        TEXT    NOT NULL,
  excerpt      TEXT    NOT NULL DEFAULT '',
  body_md      TEXT    NOT NULL DEFAULT '',
  body_html    TEXT    NOT NULL DEFAULT '',
  cover_key    TEXT,
  cover_alt    TEXT    NOT NULL DEFAULT '',
  author_email TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'draft',   -- draft | published
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL,
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS posts_status_published ON posts (status, published_at DESC);
CREATE INDEX IF NOT EXISTS posts_author ON posts (author_email, updated_at DESC);

-- Display names, refreshed from the Microsoft account on every admin visit.
CREATE TABLE IF NOT EXISTS authors (
  email      TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Images uploaded through the admin, stored in R2 under `key`.
CREATE TABLE IF NOT EXISTS media (
  key            TEXT PRIMARY KEY,
  uploader_email TEXT NOT NULL,
  content_type   TEXT NOT NULL,
  size           INTEGER NOT NULL,
  created_at     TEXT NOT NULL
);
