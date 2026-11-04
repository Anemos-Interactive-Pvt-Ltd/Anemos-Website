// Small helpers shared by the public blog pages and the admin.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "12 October 2026", from an ISO timestamp, on the studio's clock (India).
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch (e) {
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
}

export const now = () => new Date().toISOString();

// Width and height of a PNG, JPEG, GIF or WebP from its bytes, or null (also for sizes no real
// image has, so a malformed file can't make a page reserve a huge blank area).
export function imageSize(b) {
  const s = readImageSize(b);
  return s && s.every((n) => Number.isInteger(n) && n > 0 && n <= 16384) ? s : null;
}
function readImageSize(b) {
  const u16be = (i) => (b[i] << 8) | b[i + 1], u16le = (i) => b[i] | (b[i + 1] << 8), u24le = (i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  const tag = (i, t) => String.fromCharCode(...b.subarray(i, i + t.length)) === t;
  if (b.length > 24 && b[0] === 0x89 && tag(1, 'PNG')) return [(b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0];
  if (b.length > 10 && (tag(0, 'GIF87a') || tag(0, 'GIF89a'))) return [u16le(6), u16le(8)];
  if (b.length > 30 && tag(0, 'RIFF') && tag(8, 'WEBP')) {
    if (tag(12, 'VP8 ')) return [u16le(26) & 0x3fff, u16le(28) & 0x3fff];
    if (tag(12, 'VP8L')) return [1 + (((b[22] & 0x3f) << 8) | b[21]), 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6))];
    if (tag(12, 'VP8X')) return [1 + u24le(24), 1 + u24le(27)];
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [u16be(i + 7), u16be(i + 5)];
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
      i += 2 + u16be(i + 2);
    }
  }
  return null;
}

// Adds width and height to every <img> pointing at /media/ that has a known size and none of its
// own, so the browser reserves the space before the image arrives.
export function sizeImages(html, sizes) {
  return String(html).replace(/<img\b([^>]*?)\ssrc="\/media\/([^"]+)"([^>]*)>/g, (all, before, key, after) => {
    const s = sizes[key];
    if (!s || /\swidth=/.test(before + after)) return all;
    return `<img${before} src="/media/${key}" width="${s[0]}" height="${s[1]}"${after}>`;
  });
}

// Set on responses that are our own static pages (public/*.html), so worker.js knows it may stamp
// a nonce on their scripts. Removed before the response leaves.
export const TRUSTED_STATIC = 'x-trusted-static';

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'post';
}

// Turns the part of an email address before the @ into a readable name; used only when the
// sign-in gives no display name.
export function nameFromEmail(email) {
  return String(email).split('@')[0].split(/[._-]+/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export const html = (body, status = 200, headers = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });

export const redirect = (to, status = 302) => new Response(null, { status, headers: { location: to } });

// The static 404 page, with a 404 status.
export async function notFound(env, request) {
  const res = await env.ASSETS.fetch(new Request(new URL('/404.html', request.url), { method: 'GET' }));
  return new Response(res.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', [TRUSTED_STATIC]: '1' } });
}
