// Queries against the blog database (D1). Every post row comes back with the author's
// current display name joined in, so a rename in Microsoft 365 shows on old posts too.

import { nameFromEmail } from './util.js';

const COLS = 'p.id, p.slug, p.title, p.excerpt, p.body_md, p.body_html, p.cover_key, p.cover_alt, p.author_email, p.status, p.created_at, p.updated_at, p.published_at, a.name AS author_name, m.width AS cover_w, m.height AS cover_h';
const FROM = 'FROM posts p LEFT JOIN authors a ON a.email = p.author_email LEFT JOIN media m ON m.key = p.cover_key';

// A post whose author has no saved display name shows a name made from the address, never the address.
const named = (row) => (row && !row.author_name ? { ...row, author_name: nameFromEmail(row.author_email) } : row);

export async function listPublished(db, limit, offset) {
  const { results } = await db.prepare(`SELECT ${COLS} ${FROM} WHERE p.status = 'published' ORDER BY p.published_at DESC, p.id DESC LIMIT ? OFFSET ?`).bind(limit, offset).all();
  return results.map(named);
}

export async function countPublished(db) {
  return (await db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE status = 'published'`).first()).n;
}

export async function getPublishedBySlug(db, slug) {
  return named(await db.prepare(`SELECT ${COLS} ${FROM} WHERE p.slug = ? AND p.status = 'published'`).bind(slug).first());
}

export async function getById(db, id) {
  return named(await db.prepare(`SELECT ${COLS} ${FROM} WHERE p.id = ?`).bind(id).first());
}

export async function listForUser(db, email, isAdmin) {
  const q = isAdmin
    ? db.prepare(`SELECT ${COLS} ${FROM} ORDER BY p.updated_at DESC`)
    : db.prepare(`SELECT ${COLS} ${FROM} WHERE p.author_email = ? ORDER BY p.updated_at DESC`).bind(email);
  return (await q.all()).results.map(named);
}

export async function slugTaken(db, slug, excludeId = 0) {
  return !!(await db.prepare(`SELECT 1 FROM posts WHERE slug = ? AND id != ?`).bind(slug, excludeId).first());
}

export async function createPost(db, f) {
  const row = await db.prepare(`INSERT INTO posts (slug, title, excerpt, body_md, body_html, cover_key, cover_alt, author_email, status, created_at, updated_at, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(f.slug, f.title, f.excerpt, f.body_md, f.body_html, f.cover_key, f.cover_alt, f.author_email, f.status, f.created_at, f.updated_at, f.published_at).first();
  return row.id;
}

export function updatePost(db, id, f) {
  return db.prepare(`UPDATE posts SET slug = ?, title = ?, excerpt = ?, body_md = ?, body_html = ?, cover_key = ?, cover_alt = ?, status = ?, updated_at = ?, published_at = ? WHERE id = ?`)
    .bind(f.slug, f.title, f.excerpt, f.body_md, f.body_html, f.cover_key, f.cover_alt, f.status, f.updated_at, f.published_at, id).run();
}

export function deletePost(db, id) {
  return db.prepare(`DELETE FROM posts WHERE id = ?`).bind(id).run();
}

export function upsertAuthor(db, email, name, at) {
  return db.prepare(`INSERT INTO authors (email, name, updated_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`)
    .bind(email, name, at).run();
}

export function insertMedia(db, m) {
  return db.prepare(`INSERT INTO media (key, uploader_email, content_type, size, created_at, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(m.key, m.uploader_email, m.content_type, m.size, m.created_at, m.width ?? null, m.height ?? null).run();
}

// Pixel sizes for the given media keys, as { key: [width, height] }.
export async function mediaSizes(db, keys) {
  const list = [...new Set(keys)].slice(0, 50);
  if (!list.length) return {};
  const { results } = await db.prepare(`SELECT key, width, height FROM media WHERE width IS NOT NULL AND key IN (${list.map(() => '?').join(',')})`).bind(...list).all();
  return Object.fromEntries(results.map((r) => [r.key, [r.width, r.height]]));
}

export function insertAudit(db, a) {
  return db.prepare(`INSERT INTO audit (at, actor, action, post_id, detail) VALUES (?, ?, ?, ?, ?)`)
    .bind(a.at, a.actor, a.action, a.post_id, a.detail).run();
}
