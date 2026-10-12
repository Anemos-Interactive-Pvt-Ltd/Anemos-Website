// The post editor: slug from the title, image uploads, Markdown preview, save/publish/delete.
(function () {
  const form = document.getElementById('post-form');
  if (!form) return;
  const post = window.__post || {};
  const $ = (sel) => form.querySelector(sel);
  const title = $('[name=title]'), slug = $('[name=slug]'), slugEcho = document.getElementById('slug-echo');
  const body = document.getElementById('body'), preview = document.getElementById('preview');
  const status = document.getElementById('status');
  let slugEdited = !!post.slug;

  const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  const say = (msg, kind) => { status.textContent = msg; status.className = 'status-line' + (kind ? ' ' + kind : ''); };

  title.addEventListener('input', () => { if (!slugEdited) { slug.value = slugify(title.value); slugEcho.textContent = slug.value; } });
  slug.addEventListener('input', () => { slugEdited = slug.value !== ''; slugEcho.textContent = slug.value; });

  async function api(method, path, data) {
    const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'anemos-admin' }, body: data ? JSON.stringify(data) : undefined });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || ('Request failed (' + res.status + ')'));
    return out;
  }
  async function upload(file) {
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/media', { method: 'POST', headers: { 'X-Requested-With': 'anemos-admin' }, body: fd });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'Upload failed.');
    return out;
  }

  // Cover image
  const coverFile = document.getElementById('cover-file'), coverKey = $('[name=cover_key]');
  const coverPreview = document.getElementById('cover-preview'), coverRemove = document.getElementById('cover-remove');
  coverFile.addEventListener('change', async () => {
    const file = coverFile.files[0]; if (!file) return;
    say('Uploading cover…');
    try {
      const out = await upload(file);
      coverKey.value = out.key;
      coverPreview.innerHTML = '<img src="' + out.url + '" alt="">';
      coverRemove.hidden = false;
      say('Cover uploaded. Save the post to keep it.', 'ok');
    } catch (e) { say(e.message, 'error'); }
    coverFile.value = '';
  });
  coverRemove.addEventListener('click', () => { coverKey.value = ''; coverPreview.innerHTML = ''; coverRemove.hidden = true; });

  // Images inside the post
  const insertFile = document.getElementById('insert-file');
  document.getElementById('insert-image').addEventListener('click', () => insertFile.click());
  insertFile.addEventListener('change', async () => {
    const file = insertFile.files[0]; if (!file) return;
    say('Uploading image…');
    try {
      const out = await upload(file);
      const md = '\n![Describe the image](' + out.url + ')\n';
      const at = body.selectionStart || body.value.length;
      body.value = body.value.slice(0, at) + md + body.value.slice(at);
      body.focus(); body.selectionStart = at + 3; body.selectionEnd = at + 3 + 'Describe the image'.length;
      say('Image added. Replace “Describe the image” with what it shows.', 'ok');
    } catch (e) { say(e.message, 'error'); }
    insertFile.value = '';
  });

  // Preview
  const toggle = document.getElementById('toggle-preview');
  toggle.addEventListener('click', async () => {
    if (!preview.hidden) { preview.hidden = true; body.hidden = false; toggle.textContent = 'Preview'; return; }
    try {
      const out = await api('POST', '/api/preview', { body_md: body.value });
      preview.innerHTML = out.html; preview.hidden = false; body.hidden = true; toggle.textContent = 'Edit';
    } catch (e) { say(e.message, 'error'); }
  });

  // Save / publish / unpublish / delete
  async function save(action) {
    if (!title.value.trim()) { say('The post needs a title.', 'error'); title.focus(); return; }
    say(action === 'publish' ? 'Publishing…' : 'Saving…');
    const data = { action, title: title.value, slug: slug.value, excerpt: $('[name=excerpt]').value, body_md: body.value, cover_key: coverKey.value, cover_alt: $('[name=cover_alt]').value };
    try {
      const out = post.id ? await api('PUT', '/api/posts/' + post.id, data) : await api('POST', '/api/posts', data);
      if (!post.id) { location.href = '/admin/edit/' + out.id + '?saved=' + action; return; }
      if (out.status !== post.status || out.slug !== post.slug) { location.href = '/admin/edit/' + post.id + '?saved=' + action; return; }
      say(action === 'unpublish' ? 'Post unpublished.' : out.status === 'published' ? 'Post updated and live.' : 'Draft saved.', 'ok');
    } catch (e) { say(e.message, 'error'); }
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); save(form.querySelector('[type=submit]').dataset.action); });
  form.querySelectorAll('button[data-action]').forEach((b) => {
    if (b.type === 'submit') return;
    b.addEventListener('click', async () => {
      if (b.dataset.action === 'delete') {
        if (!confirm('Delete this post? This cannot be undone.')) return;
        try { await api('DELETE', '/api/posts/' + post.id); location.href = '/admin'; } catch (e) { say(e.message, 'error'); }
        return;
      }
      save(b.dataset.action);
    });
  });

  const saved = new URLSearchParams(location.search).get('saved');
  if (saved) { say(saved === 'publish' ? 'Post published.' : saved === 'unpublish' ? 'Post unpublished.' : 'Draft saved.', 'ok'); history.replaceState(null, '', location.pathname); }
})();
