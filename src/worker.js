// Entry point. The same Worker serves the public site (static assets plus the blog pages) and,
// on the admin hostname, the blog admin. Which one depends only on the hostname.
import { handlePublic } from './public.js';
import { handleAdmin } from './admin.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.hostname === env.ADMIN_HOST) return await handleAdmin(request, env, ctx, url);
      return await handlePublic(request, env, ctx, url);
    } catch (err) {
      console.error(err && err.stack || err);
      return new Response('Something went wrong. Please try again in a moment.', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  },
};
