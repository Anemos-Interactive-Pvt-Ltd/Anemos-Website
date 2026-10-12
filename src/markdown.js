// Markdown -> HTML for posts. Everything an author types goes through marked, then through an
// allow-list so a post can never carry scripts, forms or styles onto the site.
import { marked } from 'marked';

marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    // The post title is the page's h1, so "# Heading" in a post becomes an h2, and so on.
    heading({ tokens, depth }) {
      const level = Math.min(depth + 1, 6);
      return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
    },
  },
});

const ALLOWED = {
  p: [], br: [], h2: [], h3: [], h4: [], h5: [], h6: [],
  strong: [], em: [], b: [], i: [], u: [], s: [], del: [], sup: [], sub: [],
  a: ['href', 'title'], ul: [], ol: ['start'], li: [], blockquote: [], hr: [],
  code: ['class'], pre: [], img: ['src', 'alt', 'title', 'width', 'height'],
  table: [], thead: [], tbody: [], tr: [], th: ['align'], td: ['align'],
  figure: [], figcaption: [], input: ['type', 'checked', 'disabled'],
};
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'textarea', 'select', 'button', 'noscript', 'svg', 'math', 'template', 'link', 'meta', 'base', 'video', 'audio']);

async function sanitize(dirty) {
  const rewriter = new HTMLRewriter().on('*', {
    element(el) {
      const tag = el.tagName.toLowerCase();
      if (DROP_WITH_CONTENT.has(tag)) { el.remove(); return; }
      const allowed = ALLOWED[tag];
      if (!allowed) { el.removeAndKeepContent(); return; }
      for (const [name] of [...el.attributes]) {
        if (!allowed.includes(name)) { el.removeAttribute(name); continue; }
        const v = (el.getAttribute(name) || '').trim();
        if (name === 'href' && !/^(https?:\/\/|mailto:|\/|#)/i.test(v)) el.removeAttribute(name);
        if (name === 'src' && !/^(\/media\/|https:\/\/)/i.test(v)) el.removeAttribute(name);
        if (name === 'class' && !/^language-[a-z0-9+#.-]+$/i.test(v)) el.removeAttribute(name);
        if ((name === 'width' || name === 'height') && !/^\d{1,4}$/.test(v)) el.removeAttribute(name);
      }
      if (tag === 'a' && /^https?:\/\//i.test(el.getAttribute('href') || '')) el.setAttribute('rel', 'noopener');
      if (tag === 'img') { if (el.getAttribute('src')) el.setAttribute('loading', 'lazy'); else el.remove(); }
      if (tag === 'input') { if (el.getAttribute('type') === 'checkbox') el.setAttribute('disabled', ''); else el.remove(); }
    },
  });
  return rewriter.transform(new Response(dirty, { headers: { 'content-type': 'text/html; charset=utf-8' } })).text();
}

export async function renderMarkdown(md) {
  return sanitize(marked.parse(String(md || '')));
}
