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

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'post';
}

// "ronak.jacob@…" -> "Ronak Jacob", used only when the sign-in gives no display name.
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
  return new Response(res.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
