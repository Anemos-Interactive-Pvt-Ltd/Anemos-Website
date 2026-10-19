// Entry point. The same Worker serves the public site (static assets plus the blog pages) and,
// on the admin hostname, the blog admin. Which one depends only on the hostname.
import { handlePublic } from './public.js';
import { handleAdmin } from './admin.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const admin = url.hostname === env.ADMIN_HOST;
    try {
      const res = admin ? await handleAdmin(request, env, ctx, url) : await handlePublic(request, env, ctx, url);
      return secure(res, admin);
    } catch (err) {
      console.error(err && err.stack || err);
      return secure(new Response('Something went wrong. Please try again in a moment.', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } }), admin);
    }
  },
};

// Every response leaves with the same protective headers. HTML pages also get a Content
// Security Policy: scripts may only come from the site itself (inline ones carry a nonce made
// fresh for each response; 'unsafe-inline' is only a fallback for old browsers that don't know
// nonces, and is ignored by every browser that does), from Google Analytics and from Cloudflare's own beacon; fonts may
// also come from Google's copies, which style.css names as the fallback to our own; the booking
// calendar is the only thing that may sit in a frame; nothing may frame our pages. Static files
// that never reach the Worker get the plain headers from public/_headers instead.
const PUBLIC_CSP = (nonce) => [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://www.googletagmanager.com https://static.cloudflareinsights.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://api.web3forms.com https://cloudflareinsights.com",
  "frame-src https://bookings.cloud.microsoft https://*.cloud.microsoft https://login.microsoftonline.com https://login.live.com https://outlook.office.com https://outlook.office365.com",
  "object-src 'none'", "base-uri 'self'", "form-action 'self' https://api.web3forms.com", "frame-ancestors 'none'", 'upgrade-insecure-requests',
].join('; ');
const ADMIN_CSP = (nonce) => [
  "default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'unsafe-inline'`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https:",
  "font-src 'self' https://fonts.gstatic.com", "connect-src 'self'", "frame-src 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

function secure(res, admin) {
  const h = new Headers(res.headers);
  h.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  h.set('x-frame-options', 'DENY');
  const isHtml = (h.get('content-type') || '').includes('text/html');
  const nonce = isHtml ? btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))) : null;
  if (isHtml) h.set('content-security-policy', (admin ? ADMIN_CSP : PUBLIC_CSP)(nonce));
  const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  if (!isHtml) return out;
  return new HTMLRewriter().on('script', { element(el) { el.setAttribute('nonce', nonce); } }).transform(out);
}
