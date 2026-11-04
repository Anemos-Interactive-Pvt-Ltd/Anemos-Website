// Entry point. The same Worker serves the public site (static assets plus the blog pages) and,
// on the admin hostname, the blog admin. Which one depends only on the hostname.
import { handlePublic } from './public.js';
import { handleAdmin } from './admin.js';
import { INLINE_SCRIPTS } from './inline.js';
import { TRUSTED_STATIC } from './util.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const admin = url.hostname === env.ADMIN_HOST;
    try {
      const res = admin ? await handleAdmin(request, env, ctx, url) : await handlePublic(request, env, ctx, url);
      return await secure(res, admin, env);
    } catch (err) {
      console.error(err && err.stack || err);
      return await secure(new Response('Something went wrong. Please try again in a moment.', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } }), admin, env);
    }
  },
};

// Every response leaves with the same protective headers. HTML pages also get a Content Security
// Policy that names the only places scripts, fonts and frames may come from. Inline scripts are
// allowed in two ways, and never by guesswork:
//   - our own static pages (public/*.html, which contain no user content) get a nonce made fresh
//     for each response, stamped onto their scripts;
//   - pages the Worker builds around blog content get no stamping at all: their few fixed inline
//     scripts (src/inline.js) are allowed by SHA-256 hash, so a script that found its way into a
//     post would have neither and the browser would refuse it.
// 'unsafe-inline' is only a fallback for browsers too old to know nonces and hashes; every browser
// that does ignores it. Google's tag service is allowed only under /gtag/ (the analytics loader), not
// its general container loader. Fonts may also come from Google's copies, the fallback in style.css; the
// booking calendar is the only thing that may sit in a frame; nothing may frame our pages. Static
// files that never reach the Worker get the plain headers from public/_headers instead.
let hashes = null;
function scriptHashes() {
  hashes ??= Promise.all(INLINE_SCRIPTS.map(async (s) => {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
    return `'sha256-${btoa(String.fromCharCode(...digest))}'`;
  })).then((list) => list.join(' '));
  return hashes;
}

const PUBLIC_CSP = (nonce, hashes) => [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}' ${hashes} 'unsafe-inline' https://www.googletagmanager.com/gtag/ https://static.cloudflareinsights.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://api.web3forms.com https://cloudflareinsights.com",
  "frame-src https://bookings.cloud.microsoft https://*.cloud.microsoft https://login.microsoftonline.com https://login.live.com https://outlook.office.com https://outlook.office365.com",
  "object-src 'none'", "base-uri 'self'", "form-action 'self' https://api.web3forms.com", "frame-ancestors 'none'", 'upgrade-insecure-requests',
].join('; ');
const ADMIN_CSP = (nonce, hashes) => [
  "default-src 'self'", `script-src 'self' 'nonce-${nonce}' ${hashes} 'unsafe-inline'`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https:",
  "font-src 'self' https://fonts.gstatic.com", "connect-src 'self'", "frame-src 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

async function secure(res, admin, env) {
  const h = new Headers(res.headers);
  const trusted = h.get(TRUSTED_STATIC) === '1';
  h.delete(TRUSTED_STATIC);
  h.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  h.set('x-frame-options', 'DENY');
  // The test environment tells search engines not to index anything (NOINDEX in wrangler.jsonc).
  // It must stay crawlable for them to see this, so the test site's robots.txt does not block them.
  if (env && env.NOINDEX === '1') h.set('x-robots-tag', 'noindex, nofollow');
  const isHtml = (h.get('content-type') || '').includes('text/html');
  const nonce = isHtml ? btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))) : null;
  if (isHtml) h.set('content-security-policy', (admin ? ADMIN_CSP : PUBLIC_CSP)(nonce, await scriptHashes()));
  const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  if (!isHtml || !trusted) return out;
  return new HTMLRewriter().on('script', { element(el) { el.setAttribute('nonce', nonce); } }).transform(out);
}
