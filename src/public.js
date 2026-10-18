// The visitor-facing blog: /blogs, /blogs/<slug>, the RSS feed, the sitemap with posts added,
// and the images under /media/. Everything else on the public hostnames is a static asset.
import { pageShell } from './layout.js';
import * as db from './db.js';
import { esc, fmtDate, html, notFound, redirect } from './util.js';
import { STAMP } from './stamp.js';

const SITE = 'https://anemosinteractive.com';
const PER_PAGE = 12;
const BLOG_TITLE = 'Blogs — Anemos Interactive';
const BLOG_DESC = 'The Anemos Interactive blog: notes from a game and technology studio on what we\'re building, the tools and tech we find fascinating, and what we learn along the way.';
const BLOG_LEDE = 'Notes from the studio: what we\'re building, the tech we\'re into, and what we learn on the way.';
const ORG = { '@type': 'Organization', name: 'Anemos Interactive', url: SITE, logo: { '@type': 'ImageObject', url: `${SITE}/apple-touch-icon.png` } };
const MEDIA_KEY = /^[0-9]{4}\/[0-9]{2}\/[a-z0-9]+\.(png|jpg|webp|gif)$/;
const PAGE_HEADERS = { 'cache-control': 'public, max-age=0, must-revalidate' };

export async function handlePublic(request, env, ctx, url) {
  const path = url.pathname;
  if (path === '/blogs/') return redirect('/blogs' + url.search, 301);
  if (path === '/blogs') return blogIndex(request, env, url);
  if (path === '/blogs/feed.xml') return feed(env);
  if (path.startsWith('/blogs/')) {
    const slug = path.slice(7);
    if (slug.endsWith('/')) return redirect('/blogs/' + slug.slice(0, -1), 301);
    return blogPost(request, env, slug);
  }
  if (path === '/sitemap.xml') return sitemap(request, env);
  if (path.startsWith('/media/')) return media(request, env, path.slice(7));
  if (path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/')) return notFound(env, request);
  return stampAssets(await env.ASSETS.fetch(request));
}

// The static pages reference style.css and the scripts by plain name; add the deploy stamp so a
// change is picked up on the next load instead of after the browser's cache expires.
const STAMPED = /^\/?(style\.css|wind\.js|analytics\.js)$/;
function stampAssets(res) {
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
  const fix = (attr) => ({ element(el) { const v = el.getAttribute(attr) || ''; const m = v.match(STAMPED); if (m) el.setAttribute(attr, `${v}?v=${STAMP[m[1]]}`); } });
  return new HTMLRewriter().on('link[rel="stylesheet"]', fix('href')).on('script[src]', fix('src')).transform(res);
}

async function blogIndex(request, env, url) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const total = await db.countPublished(env.DB);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (page > pages) return notFound(env, request);
  const posts = await db.listPublished(env.DB, PER_PAGE, (page - 1) * PER_PAGE);

  const cards = posts.map((p) => `
        <a class="post-card" href="/blogs/${esc(p.slug)}">
          ${p.cover_key ? `<img src="/media/${esc(p.cover_key)}" alt="${esc(p.cover_alt)}" loading="lazy">` : '<div class="post-card-mark" aria-hidden="true"><img src="/logo.svg" alt=""></div>'}
          <div class="post-card-body">
            <div class="post-meta">${fmtDate(p.published_at)} · ${esc(p.author_name)}</div>
            <h2>${esc(p.title)}</h2>
            ${p.excerpt ? `<p>${esc(p.excerpt)}</p>` : ''}
          </div>
        </a>`).join('');
  const pager = pages > 1 ? `
      <nav class="pagination" aria-label="More posts">
        ${page > 1 ? `<a href="/blogs${page > 2 ? '?page=' + (page - 1) : ''}">Newer posts</a>` : '<span></span>'}
        ${page < pages ? `<a href="/blogs?page=${page + 1}">Older posts</a>` : ''}
      </nav>` : '';

  const main = `<main class="about-page blog-page">
  <section class="page-intro about-intro">
    <canvas class="wind-ambient" aria-hidden="true"></canvas>
    <div class="container">
      <h1 data-wind="words">Blogs</h1>
      <p class="lede" data-wind="words">${BLOG_LEDE}</p>
    </div>
  </section>

  <section class="about-block">
    <div class="container">${posts.length ? `
      <div class="blog-list">${cards}
      </div>` : ''}${pager}
    </div>
  </section>
</main>`;

  const canonical = `${SITE}/blogs${page > 1 ? '?page=' + page : ''}`;
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Blog', name: 'Anemos Interactive blog', url: `${SITE}/blogs`, description: BLOG_DESC, publisher: ORG };
  const title = page > 1 ? `Blogs, page ${page} — Anemos Interactive` : BLOG_TITLE;
  return html(pageShell({ title, description: BLOG_DESC, canonical, main, jsonLd, adminHost: env.ADMIN_HOST }), 200, PAGE_HEADERS);
}

async function blogPost(request, env, slug) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return notFound(env, request);
  const post = await db.getPublishedBySlug(env.DB, slug);
  if (!post) return notFound(env, request);
  return html(renderPost(post, { adminHost: env.ADMIN_HOST }), 200, PAGE_HEADERS);
}

// Also used by the admin's draft preview.
export function renderPost(p, { preview = false, adminHost = '' } = {}) {
  const url = `${SITE}/blogs/${p.slug}`;
  const cover = p.cover_key ? `${SITE}/media/${p.cover_key}` : null;
  const main = `<main class="about-page blog-page post-page">
  <section class="page-intro about-intro">
    <canvas class="wind-ambient" aria-hidden="true"></canvas>
    <div class="container">
      <div class="kicker" data-wind><a href="/blogs">Blogs</a></div>
      <h1 data-wind="words">${esc(p.title)}</h1>
      <p class="post-meta" data-wind>${fmtDate(p.published_at || p.updated_at)} · ${esc(p.author_name)}</p>
    </div>
  </section>

  <article class="about-block">
    <div class="container">
      ${p.cover_key ? `<img class="post-cover" src="/media/${esc(p.cover_key)}" alt="${esc(p.cover_alt)}">` : ''}
      <div class="post-body">
${p.body_html}
      </div>
      <p class="post-back"><a class="btn" href="/blogs">All posts</a></p>
    </div>
  </article>
</main>`;
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title,
    description: p.excerpt || BLOG_DESC, image: cover || `${SITE}/og-image.png`,
    datePublished: p.published_at || p.updated_at, dateModified: p.updated_at,
    author: { '@type': 'Person', name: p.author_name }, publisher: ORG, mainEntityOfPage: url,
  };
  const extraHead = preview
    ? '<meta name="robots" content="noindex, nofollow">'
    : `<meta property="article:published_time" content="${esc(p.published_at)}">\n  <meta property="article:modified_time" content="${esc(p.updated_at)}">`;
  return pageShell({
    title: `${p.title} — Anemos Interactive`, description: p.excerpt || BLOG_DESC, canonical: url,
    ogType: 'article', ogImage: cover, ogImageAlt: cover ? p.cover_alt : undefined,
    main, jsonLd, extraHead, analytics: !preview, adminHost,
  });
}

const cdata = (s) => `<![CDATA[${String(s ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
const absolute = (h) => String(h).replace(/(src|href)="\/(?!\/)/g, `$1="${SITE}/`);

async function feed(env) {
  const posts = await db.listPublished(env.DB, 20, 0);
  const items = posts.map((p) => `
    <item>
      <title>${cdata(p.title)}</title>
      <link>${SITE}/blogs/${p.slug}</link>
      <guid isPermaLink="true">${SITE}/blogs/${p.slug}</guid>
      <pubDate>${new Date(p.published_at).toUTCString()}</pubDate>
      <dc:creator>${cdata(p.author_name)}</dc:creator>
      <description>${cdata(p.excerpt)}</description>
      <content:encoded>${cdata(absolute(p.body_html))}</content:encoded>
    </item>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Anemos Interactive blog</title>
    <link>${SITE}/blogs</link>
    <atom:link href="${SITE}/blogs/feed.xml" rel="self" type="application/rss+xml"/>
    <description>${cdata(BLOG_DESC)}</description>
    <language>en</language>${posts[0] ? `
    <lastBuildDate>${new Date(posts[0].published_at).toUTCString()}</lastBuildDate>` : ''}${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}

// The static sitemap plus every published post.
async function sitemap(request, env) {
  const base = await (await env.ASSETS.fetch(new Request(new URL('/sitemap.xml', request.url)))).text();
  const posts = await db.listPublished(env.DB, 1000, 0);
  const headers = { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600' };
  if (!posts.length) return new Response(base, { headers });
  const latest = posts.map((p) => p.updated_at).sort().pop().slice(0, 10);
  const entries = [
    `  <url>\n    <loc>${SITE}/blogs</loc>\n    <lastmod>${latest}</lastmod>\n  </url>`,
    ...posts.map((p) => `  <url>\n    <loc>${SITE}/blogs/${p.slug}</loc>\n    <lastmod>${p.updated_at.slice(0, 10)}</lastmod>\n  </url>`),
  ].join('\n');
  return new Response(base.replace('</urlset>', `${entries}\n</urlset>`), { headers });
}

export async function media(request, env, key) {
  if (!MEDIA_KEY.test(key)) return notFound(env, request);
  // A PNG or JPEG can have a WebP copy stored beside it (same key, .webp). Browsers that say
  // they accept WebP get the copy; everything else, including share-preview crawlers and
  // browsers too old to read WebP, gets the original.
  let obj = null;
  if (/\.(png|jpg)$/.test(key) && (request.headers.get('accept') || '').includes('image/webp')) {
    obj = await env.MEDIA.get(key.replace(/\.(png|jpg)$/, '.webp'));
  }
  if (!obj) obj = await env.MEDIA.get(key);
  if (!obj) return notFound(env, request);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('vary', 'Accept');
  return new Response(obj.body, { headers });
}
