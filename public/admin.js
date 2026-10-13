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
  // Anything larger than 1600px on its longest side is scaled down in the browser before upload.
  async function shrink(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
    const MAX = 1600;
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) return file;
    if (bmp.width <= MAX && bmp.height <= MAX) { bmp.close(); return file; }
    const scale = MAX / Math.max(bmp.width, bmp.height);
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    const blob = await new Promise((r) => c.toBlob(r, file.type, 0.86));
    return blob ? new File([blob], file.name, { type: file.type }) : file;
  }
  async function upload(file) {
    file = await shrink(file);
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

  // Formatting toolbar: wraps the selection in Markdown (or the few HTML tags Markdown lacks)
  const sel = () => ({ s: body.selectionStart, e: body.selectionEnd, t: body.value.slice(body.selectionStart, body.selectionEnd) });
  function put(s, e, text, selStart, selEnd) { body.focus(); body.setRangeText(text, s, e, 'end'); body.setSelectionRange(selStart, selEnd); }
  function wrap(before, after, placeholder) { const r = sel(); const inner = r.t || placeholder; put(r.s, r.e, before + inner + after, r.s + before.length, r.s + before.length + inner.length); }
  function prefixLines(prefix, numbered) {
    const r = sel(); const start = body.value.lastIndexOf('\n', r.s - 1) + 1; let end = body.value.indexOf('\n', r.e); if (end === -1) end = body.value.length;
    const out = body.value.slice(start, end).split('\n').map((l, i) => (numbered ? (i + 1) + '. ' : prefix) + l.replace(/^(#{1,6} |- \[[ x]\] |- |\d+\. |> )/, '')).join('\n');
    put(start, end, out, start, start + out.length);
  }
  function block(text) {
    const r = sel(); const before = body.value.slice(0, r.s); const pad = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    put(r.s, r.e, pad + text + '\n', r.s + pad.length, r.s + pad.length + text.length);
  }
  const actions = {
    h2: () => prefixLines('## '), h3: () => prefixLines('### '), h4: () => prefixLines('#### '),
    bold: () => wrap('**', '**', 'bold text'), italic: () => wrap('*', '*', 'italic text'),
    underline: () => wrap('<u>', '</u>', 'underlined text'), strike: () => wrap('~~', '~~', 'struck-out text'),
    sub: () => wrap('<sub>', '</sub>', '2'), sup: () => wrap('<sup>', '</sup>', '2'),
    link: () => { const r = sel(); const url = prompt('Link address', 'https://'); if (!url || url === 'https://') return; const text = r.t || 'link text'; put(r.s, r.e, '[' + text + '](' + url + ')', r.s + 1, r.s + 1 + text.length); },
    ul: () => prefixLines('- '), ol: () => prefixLines('', true), task: () => prefixLines('- [ ] '), quote: () => prefixLines('> '),
    code: () => wrap('`', '`', 'code'), codeblock: () => block('```\ncode\n```'),
    table: () => block('| Column | Column |\n| --- | --- |\n| Cell | Cell |'), hr: () => block('---'),
  };
  form.querySelectorAll('.toolbar [data-md]').forEach((b) => b.addEventListener('click', () => { if (body.hidden) return; actions[b.dataset.md](); }));
  body.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const key = { b: 'bold', i: 'italic', u: 'underline', k: 'link' }[e.key.toLowerCase()];
      if (key) { e.preventDefault(); actions[key](); }
      return;
    }
    // Enter inside a list, checklist or quote continues it; Enter on an empty item ends it.
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || body.selectionStart !== body.selectionEnd) return;
    const s = body.selectionStart; const lineStart = body.value.lastIndexOf('\n', s - 1) + 1;
    const line = body.value.slice(lineStart, s);
    const nl = body.value.indexOf('\n', s); const lineEnd = nl === -1 ? body.value.length : nl;
    const row = body.value.slice(lineStart, lineEnd).match(/^\|(.*)\|\s*$/);
    if (row) {
      e.preventDefault();
      const cells = row[1].split('|');
      if (cells.every((c) => !c.trim())) { put(lineStart, lineEnd, '', lineStart, lineStart); return; }
      const ins = '\n|' + cells.map(() => '  ').join('|') + '|';
      put(lineEnd, lineEnd, ins, lineEnd + 3, lineEnd + 3);
      return;
    }
    const m = line.match(/^(\s*)(- \[[ x]\] |[-*] |(\d+)\. |> )(.*)$/);
    if (!m) return;
    e.preventDefault();
    const indent = m[1], marker = m[2], num = m[3], rest = m[4];
    if (!rest.trim()) { put(lineStart, s, indent, lineStart + indent.length, lineStart + indent.length); return; }
    const next = num ? (parseInt(num, 10) + 1) + '. ' : marker.startsWith('- [') ? '- [ ] ' : marker;
    const ins = '\n' + indent + next;
    put(s, s, ins, s + ins.length, s + ins.length);
    body.dispatchEvent(new Event('input'));
  });

  // Word count and reading time
  const count = document.getElementById('count');
  const recount = () => { const words = (body.value.match(/\S+/g) || []).length; count.textContent = words ? words + ' words · ' + Math.max(1, Math.round(words / 220)) + ' min read' : ''; };
  body.addEventListener('input', recount); recount();

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
