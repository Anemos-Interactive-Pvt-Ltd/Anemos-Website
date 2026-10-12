// The admin at admin.anemosinteractive.com: the post list, the editor, image uploads and the
// JSON API the editor talks to. Only reachable with a verified @anemosinteractive.com sign-in.
import { getUser, isAdmin, devCookie, clearDevCookie } from './auth.js';
import { renderMarkdown } from './markdown.js';
import { renderPost, media } from './public.js';
import * as db from './db.js';
import { esc, fmtDate, html, json, now, redirect, slugify } from './util.js';

const NOINDEX = { 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store' };
const ASSET = /^\/(style\.css|admin\.css|admin\.js|wind\.js|logo(-white)?\.svg|apple-touch-icon\.png|fonts\/[\w.-]+|brand\/[\w.-]+)$/;
const MEDIA_KEY = /^[0-9]{4}\/[0-9]{2}\/[a-z0-9]+\.(png|jpg|webp|gif)$/;
const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_IMAGE = 8 * 1024 * 1024;

export async function handleAdmin(request, env, ctx, url) {
  const path = url.pathname;
  if (path === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain' } });
  if (ASSET.test(path)) return env.ASSETS.fetch(request);
  // The public pages are not served on this hostname.
  if (path.endsWith('.html') || /^\/(products|about|book|contact|privacy|terms|blogs)(\/|$)/.test(path)) return redirect('/admin');
  if (path.startsWith('/media/')) return media(request, env, path.slice(7));
  if (path === '/admin/login') return login(request, env);
  if (path === '/admin/logout') return logout(env);

  const user = await getUser(request, env, url);
  if (!user) {
    if (env.ACCESS_AUD) return html(shell('Sign in required', `<h1>Sign in required</h1><p>Sign in with your Anemos Interactive Microsoft account to continue.</p><p><a class="btn" href="/admin">Sign in</a></p>`), 401, NOINDEX);
    return redirect('/admin/login');
  }
  const admin = isAdmin(user.email, env);

  if (path === '/' || path === '/admin/') return redirect('/admin');
  if (request.method === 'GET') {
    let m;
    if (path === '/admin') return listPage(env, user, admin);
    if (path === '/admin/new') return editorPage(env, user, admin, null);
    if ((m = path.match(/^\/admin\/edit\/(\d+)$/))) return editorPage(env, user, admin, +m[1]);
    if ((m = path.match(/^\/admin\/preview\/(\d+)$/))) return previewPage(env, user, admin, +m[1]);
  }
  if (path.startsWith('/api/')) return api(request, env, ctx, url, user, admin);
  return html(shell('Not found', '<h1>Not found</h1><p>There is nothing at this address.</p><p><a class="btn" href="/admin">Back to posts</a></p>', user), 404, NOINDEX);
}

// ---------- pages ----------

function shell(title, body, user, editor = false) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — Blogs admin</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" type="image/svg+xml" href="/logo.svg">
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/admin.css">
</head>
<body class="admin-body">
<header class="admin-top">
  <div class="container">
    <a class="wordmark" href="/admin"><img src="/logo-white.svg" alt="" class="logo-symbol">anemos <span>interactive</span></a>
    <span class="admin-tag">Blogs admin</span>
    ${user ? `<span class="admin-user">${esc(user.name)} · <a href="/admin/logout">Sign out</a></span>` : ''}
  </div>
</header>
<main class="container admin-main">
${body}
</main>
${editor ? '<script src="/admin.js"></script>' : ''}
</body>
</html>
`;
}

async function listPage(env, user, admin) {
  await db.upsertAuthor(env.DB, user.email, user.name, now());
  const posts = await db.listForUser(env.DB, user.email, admin);
  const rows = posts.map((p) => `
      <tr>
        <td><a href="/admin/edit/${p.id}">${esc(p.title) || '(untitled)'}</a></td>
        <td><span class="pill ${p.status}">${p.status}</span></td>${admin ? `
        <td>${esc(p.author_name)}</td>` : ''}
        <td>${fmtDate(p.updated_at)}</td>
        <td class="row-actions">${p.status === 'published'
          ? `<a href="${esc(env.SITE_ORIGIN)}/blogs/${esc(p.slug)}" target="_blank" rel="noopener">View</a>`
          : `<a href="/admin/preview/${p.id}" target="_blank">Preview</a>`}</td>
      </tr>`).join('');
  const body = `<div class="admin-head">
  <h1>${admin ? 'All posts' : 'Your posts'}</h1>
  <a class="btn" href="/admin/new">New post</a>
</div>
${posts.length ? `<table class="posts">
  <thead><tr><th>Title</th><th>Status</th>${admin ? '<th>Author</th>' : ''}<th>Updated</th><th></th></tr></thead>
  <tbody>${rows}
  </tbody>
</table>` : '<p class="muted">No posts yet. Start with “New post”.</p>'}`;
  return html(shell('Posts', body, user), 200, NOINDEX);
}

async function editorPage(env, user, admin, id) {
  let post = null;
  if (id) {
    post = await db.getById(env.DB, id);
    if (!post) return html(shell('Not found', '<h1>Not found</h1><p>That post no longer exists.</p><p><a class="btn" href="/admin">Back to posts</a></p>', user), 404, NOINDEX);
    if (!admin && post.author_email !== user.email) return html(shell('Not yours', '<h1>Not yours to edit</h1><p>You can only change posts you wrote.</p><p><a class="btn" href="/admin">Back to posts</a></p>', user), 403, NOINDEX);
  }
  const d = post
    ? { id: post.id, title: post.title, slug: post.slug, excerpt: post.excerpt, body_md: post.body_md, cover_key: post.cover_key || '', cover_alt: post.cover_alt, status: post.status }
    : { id: 0, title: '', slug: '', excerpt: '', body_md: '', cover_key: '', cover_alt: '', status: 'draft' };
  const published = d.status === 'published';
  const body = `<div class="admin-head">
  <h1>${post ? 'Edit post' : 'New post'}</h1>
  <a href="/admin">All posts</a>
</div>
<form id="post-form" class="editor" autocomplete="off">
  <label>Title
    <input name="title" required maxlength="140" value="${esc(d.title)}">
  </label>
  <label>Address
    <span class="hint">${esc(env.SITE_ORIGIN)}/blogs/<strong id="slug-echo">${esc(d.slug)}</strong></span>
    <input name="slug" maxlength="80" pattern="[a-z0-9-]+" value="${esc(d.slug)}">
  </label>
  <label>Summary
    <span class="hint">Shown on the Blogs page and in search results. Up to 300 characters.</span>
    <textarea name="excerpt" rows="2" maxlength="300">${esc(d.excerpt)}</textarea>
  </label>
  <div class="field">
    <span class="label">Cover image</span>
    <div id="cover-preview" class="cover-preview">${d.cover_key ? `<img src="/media/${esc(d.cover_key)}" alt="">` : ''}</div>
    <div class="row">
      <input type="file" id="cover-file" accept="image/png,image/jpeg,image/webp,image/gif">
      <button type="button" class="link" id="cover-remove"${d.cover_key ? '' : ' hidden'}>Remove</button>
    </div>
    <input type="hidden" name="cover_key" value="${esc(d.cover_key)}">
    <label>Cover description
      <span class="hint">What the image shows, for screen readers and search engines.</span>
      <input name="cover_alt" maxlength="200" value="${esc(d.cover_alt)}">
    </label>
  </div>
  <div class="field">
    <span class="label">Post</span>
    <div class="toolbar" role="toolbar" aria-label="Formatting">
      <button type="button" data-md="h2" title="Heading">H2</button>
      <button type="button" data-md="h3" title="Subheading">H3</button>
      <button type="button" data-md="h4" title="Small heading">H4</button>
      <span class="sep"></span>
      <button type="button" data-md="bold" title="Bold (Ctrl+B)"><b>B</b></button>
      <button type="button" data-md="italic" title="Italic (Ctrl+I)"><i>I</i></button>
      <button type="button" data-md="underline" title="Underline (Ctrl+U)"><u>U</u></button>
      <button type="button" data-md="strike" title="Strikethrough"><s>S</s></button>
      <button type="button" data-md="sub" title="Subscript, as in H₂O">x<sub>2</sub></button>
      <button type="button" data-md="sup" title="Superscript, as in 2²">x<sup>2</sup></button>
      <span class="sep"></span>
      <button type="button" data-md="link" title="Link (Ctrl+K)">Link</button>
      <input type="file" id="insert-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
      <button type="button" id="insert-image" title="Insert an image">Image</button>
      <span class="sep"></span>
      <button type="button" data-md="ul" title="Bulleted list">• List</button>
      <button type="button" data-md="ol" title="Numbered list">1. List</button>
      <button type="button" data-md="task" title="Checklist">☐ Checklist</button>
      <button type="button" data-md="quote" title="Quote">Quote</button>
      <button type="button" data-md="code" title="Inline code">Code</button>
      <button type="button" data-md="codeblock" title="Code block">Code block</button>
      <button type="button" data-md="table" title="Table">Table</button>
      <button type="button" data-md="hr" title="Divider line">Divider</button>
      <span class="grow"></span>
      <button type="button" id="toggle-preview" class="preview-toggle">Preview</button>
    </div>
    <textarea name="body_md" id="body" rows="22" spellcheck="true">${esc(d.body_md)}</textarea>
    <div id="preview" class="post-body preview" hidden></div>
    <p class="hint hint-row"><span>Select text and use the bar above, or type Markdown: **bold**, *italic*, [link](https://…), - list, > quote.</span><span id="count"></span></p>
  </div>
  <div class="actions-bar">
    <button type="submit" class="btn" data-action="${published ? 'publish' : 'draft'}">${published ? 'Update' : 'Save draft'}</button>
    ${published ? '<button type="button" class="btn btn-ghost" data-action="unpublish">Unpublish</button>' : '<button type="button" class="btn" data-action="publish">Publish</button>'}
    ${post ? `<a class="link" href="/admin/preview/${post.id}" target="_blank">Preview page</a>` : ''}
    ${published ? `<a class="link" href="${esc(env.SITE_ORIGIN)}/blogs/${esc(d.slug)}" target="_blank" rel="noopener">View live</a>` : ''}
    ${post ? '<button type="button" class="link danger" data-action="delete">Delete</button>' : ''}
    <span id="status" class="status-line" role="status"></span>
  </div>
</form>
<script>window.__post = ${JSON.stringify(d).replace(/</g, '\\u003c')};</script>`;
  return html(shell(post ? 'Edit post' : 'New post', body, user, true), 200, NOINDEX);
}

async function previewPage(env, user, admin, id) {
  const post = await db.getById(env.DB, id);
  if (!post) return html(shell('Not found', '<h1>Not found</h1><p>That post no longer exists.</p>', user), 404, NOINDEX);
  if (!admin && post.author_email !== user.email) return html(shell('Not yours', '<h1>Not yours to view</h1><p>You can only preview posts you wrote.</p>', user), 403, NOINDEX);
  return html(renderPost(post, { preview: true }), 200, NOINDEX);
}

// ---------- sign-in without Access (DEV_KEY) ----------

function loginForm(error = '') {
  return `<h1>Sign in</h1>
<p class="muted">Temporary sign-in until the Microsoft account sign-in is connected.</p>
${error ? `<p class="error">${esc(error)}</p>` : ''}
<form method="post" action="/admin/login" class="editor narrow">
  <label>Admin key<input type="password" name="key" required></label>
  <label>Your @anemosinteractive.com email<input type="email" name="email" required></label>
  <label>Your name<input name="name" required maxlength="80"></label>
  <button type="submit" class="btn">Sign in</button>
</form>`;
}

async function login(request, env) {
  if (env.ACCESS_AUD) return redirect('/admin');
  if (!env.DEV_KEY) return html(shell('Admin not set up', '<h1>Admin not set up</h1><p>No sign-in is configured for this address yet.</p>'), 503, NOINDEX);
  if (request.method === 'POST') {
    const f = await request.formData();
    const email = String(f.get('email') || '').trim().toLowerCase();
    const name = String(f.get('name') || '').trim().slice(0, 80);
    if (f.get('key') !== env.DEV_KEY || !email.endsWith('@' + env.ALLOWED_DOMAIN)) return html(shell('Sign in', loginForm('That key or email is not right.')), 403, NOINDEX);
    return new Response(null, { status: 303, headers: { location: '/admin', 'set-cookie': await devCookie(env, email, name) } });
  }
  return html(shell('Sign in', loginForm()), 200, NOINDEX);
}

function logout(env) {
  if (env.ACCESS_AUD) return redirect('/cdn-cgi/access/logout');
  return new Response(null, { status: 303, headers: { location: '/admin/login', 'set-cookie': clearDevCookie } });
}

// ---------- API ----------

async function api(request, env, ctx, url, user, admin) {
  const path = url.pathname;
  const method = request.method;
  if (request.headers.get('x-requested-with') !== 'anemos-admin') return json({ error: 'Bad request.' }, 400);
  if (path === '/api/preview' && method === 'POST') {
    const b = await request.json();
    return json({ html: await renderMarkdown(b.body_md) });
  }
  if (path === '/api/media' && method === 'POST') return upload(request, env, user);
  if (path === '/api/posts' && method === 'POST') return savePost(request, env, ctx, user, null);
  const m = path.match(/^\/api\/posts\/(\d+)$/);
  if (m) {
    const post = await db.getById(env.DB, +m[1]);
    if (!post) return json({ error: 'That post no longer exists.' }, 404);
    if (!admin && post.author_email !== user.email) return json({ error: 'You can only change posts you wrote.' }, 403);
    if (method === 'PUT') return savePost(request, env, ctx, user, post);
    if (method === 'DELETE') { await db.deletePost(env.DB, post.id); return json({ ok: true }); }
  }
  return json({ error: 'Not found.' }, 404);
}

async function savePost(request, env, ctx, user, existing) {
  const b = await request.json();
  const title = String(b.title || '').trim().slice(0, 140);
  if (!title) return json({ error: 'The post needs a title.' }, 400);
  const slug = slugify(b.slug || title);
  if (await db.slugTaken(env.DB, slug, existing ? existing.id : 0)) return json({ error: `The address “${slug}” is already used by another post.` }, 409);
  const action = ['draft', 'publish', 'unpublish'].includes(b.action) ? b.action : 'draft';
  const status = action === 'publish' ? 'published' : action === 'unpublish' ? 'draft' : (existing ? existing.status : 'draft');
  const t = now();
  const body_md = String(b.body_md || '');
  const f = {
    slug, title,
    excerpt: String(b.excerpt || '').trim().slice(0, 300),
    body_md, body_html: await renderMarkdown(body_md),
    cover_key: MEDIA_KEY.test(b.cover_key || '') ? b.cover_key : null,
    cover_alt: String(b.cover_alt || '').trim().slice(0, 200),
    author_email: existing ? existing.author_email : user.email,
    status,
    created_at: existing ? existing.created_at : t,
    updated_at: t,
    published_at: status === 'published' ? (existing && existing.published_at) || t : (existing ? existing.published_at : null),
  };
  let id = existing ? existing.id : 0;
  if (existing) await db.updatePost(env.DB, id, f); else id = await db.createPost(env.DB, f);
  if (status === 'published' && env.INDEXNOW_KEY) ctx.waitUntil(pingIndexNow(env, [`${env.SITE_ORIGIN}/blogs/${slug}`, `${env.SITE_ORIGIN}/blogs`]));
  return json({ ok: true, id, slug, status: f.status, published_at: f.published_at });
}

async function upload(request, env, user) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'No file received.' }, 400);
  const ext = IMAGE_EXT[file.type];
  if (!ext) return json({ error: 'Use a PNG, JPEG, WebP or GIF image.' }, 400);
  if (file.size > MAX_IMAGE) return json({ error: 'Images must be under 8 MB.' }, 400);
  const d = new Date();
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(10)), (n) => (n % 36).toString(36)).join('');
  const key = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${rand}.${ext}`;
  await env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  await db.insertMedia(env.DB, { key, uploader_email: user.email, content_type: file.type, size: file.size, created_at: now() });
  return json({ ok: true, key, url: `/media/${key}` });
}

// Tell Bing (and the other IndexNow engines) a page changed; production only.
function pingIndexNow(env, urls) {
  const host = new URL(env.SITE_ORIGIN).host;
  return fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: env.INDEXNOW_KEY, keyLocation: `${env.SITE_ORIGIN}/${env.INDEXNOW_KEY}.txt`, urlList: urls }),
  }).catch(() => {});
}
