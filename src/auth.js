// Who is using the admin. In production the admin hostname sits behind Cloudflare Access with
// Microsoft 365 as the sign-in, and every request carries a JWT that we verify here. Until
// Access is attached to a hostname, a signed cookie issued by /admin/login with the DEV_KEY
// secret stands in for it.
import { nameFromEmail } from './util.js';

const certs = { team: null, keys: {}, at: 0 };

export async function getUser(request, env, url) {
  if (env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN) return accessUser(request, env, url);
  return devUser(request, env);
}

export function isAdmin(email, env) {
  return String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).includes(email);
}

async function accessUser(request, env, url) {
  const token = request.headers.get('cf-access-jwt-assertion') || cookie(request, 'CF_Authorization');
  if (!token) return null;
  const payload = await verifyJwt(token, env);
  if (!payload) return null;
  const email = String(payload.email || '').toLowerCase();
  if (!email.endsWith('@' + env.ALLOWED_DOMAIN)) return null;
  let name = '';
  try {
    const r = await fetch(`https://${url.host}/cdn-cgi/access/get-identity`, { headers: { cookie: `CF_Authorization=${token}` } });
    if (r.ok) name = (await r.json()).name || '';
  } catch (e) { /* fall back to the email */ }
  return { email, name: name || nameFromEmail(email), mode: 'access' };
}

async function verifyJwt(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let header, payload;
  try { header = JSON.parse(b64text(h)); payload = JSON.parse(b64text(p)); } catch (e) { return null; }
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  const key = await signingKey(env, header.kid);
  if (!key) return null;
  const ok = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, b64bytes(s), new TextEncoder().encode(`${h}.${p}`));
  return ok ? payload : null;
}

async function signingKey(env, kid) {
  const stale = certs.team !== env.ACCESS_TEAM_DOMAIN || Date.now() - certs.at > 3600e3 || !certs.keys[kid];
  if (stale) {
    const data = await (await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`)).json();
    const keys = {};
    for (const k of data.keys || []) keys[k.kid] = await crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    Object.assign(certs, { team: env.ACCESS_TEAM_DOMAIN, keys, at: Date.now() });
  }
  return certs.keys[kid];
}

async function devUser(request, env) {
  if (!env.DEV_KEY) return null;
  const c = cookie(request, 'anemos_dev');
  if (!c) return null;
  const [data, sig] = c.split('.');
  if (!data || !sig || (await hmac(env.DEV_KEY, data)) !== sig) return null;
  let u;
  try { u = JSON.parse(b64text(data)); } catch (e) { return null; }
  const email = String(u.email || '').toLowerCase();
  if (!email.endsWith('@' + env.ALLOWED_DOMAIN) || !(u.exp > Date.now())) return null;
  return { email, name: u.name || nameFromEmail(email), mode: 'dev' };
}

export async function devCookie(env, email, name, days = 3) {
  const data = b64url(new TextEncoder().encode(JSON.stringify({ email, name, exp: Date.now() + days * 864e5 })));
  return `anemos_dev=${data}.${await hmac(env.DEV_KEY, data)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days * 86400}`;
}

export const clearDevCookie = 'anemos_dev=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

function cookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))));
}

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64bytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const b64text = (s) => new TextDecoder().decode(b64bytes(s));
