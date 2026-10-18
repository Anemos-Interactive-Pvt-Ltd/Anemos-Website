-- Blog storage (Cloudflare D1). Apply with:
--   npx wrangler d1 execute anemos-blog-test --env test --remote --file=schema.sql   (anemos-blog for the live site)

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

-- Who did what in the admin: create, draft, publish, unpublish, delete, upload.
CREATE TABLE IF NOT EXISTS audit (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT    NOT NULL,
  actor   TEXT    NOT NULL,
  action  TEXT    NOT NULL,
  post_id INTEGER,
  detail  TEXT    NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS audit_at ON audit (at DESC);
