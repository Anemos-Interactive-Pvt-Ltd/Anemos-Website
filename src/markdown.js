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
// Dropped together with everything inside them. This must include every element whose contents
// the HTML parser reads as plain text (script, style, title, textarea, xmp, iframe, noembed,
// noframes, noscript, plaintext): unwrapping one of those would turn its text back into markup.
const DROP_WITH_CONTENT = new Set(['script', 'style', 'title', 'textarea', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext',
  'object', 'embed', 'applet', 'frameset', 'frame', 'form', 'select', 'button', 'svg', 'math', 'template', 'link', 'meta', 'base', 'video', 'audio']);

// What a browser would make of an attribute value: character references decoded, then tabs,
// newlines and other control characters removed (browsers strip them from URLs). Checks run on
// this, and this is what gets written back.
const codePoint = (n) => String.fromCodePoint(n > 0 && n <= 0x10ffff ? n : 0xfffd);
function urlAsBrowserSeesIt(v) {
  return v
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => codePoint(+d))
    .replace(/&(tab|newline);/gi, ' ')
    .replace(/[\u0000-\u0020\u007f]/g, '');
}

// The index where the HTML ends inside an unfinished tag, attribute value or comment, or -1.
// The HTML parser passes an unfinished tag at the very end of its input straight through, and a
// browser would finish it with whatever the page puts next; the caller turns that tail into text.
export function unfinishedTail(html) {
  let state = 'data', start = -1;
  for (let i = 0; i < html.length; i++) {
    const c = html[i];
    if (state === 'data') {
      if (c !== '<') continue;
      if (html.startsWith('<!--', i)) { state = 'comment'; start = i; i += 3; }
      else if (/[A-Za-z\/!?]/.test(html[i + 1] || '')) { state = 'tag'; start = i; }
    } else if (state === 'tag') {
      if (c === '"') state = 'dq'; else if (c === "'") state = 'sq'; else if (c === '>') state = 'data';
    } else if (state === 'dq') { if (c === '"') state = 'tag'; }
    else if (state === 'sq') { if (c === "'") state = 'tag'; }
    else if (state === 'comment' && html.startsWith('-->', i)) { state = 'data'; i += 2; }
  }
  return state === 'data' ? -1 : start;
}

const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Thrown when the parser can't read the markup unambiguously; the admin answers with a 400.
export class UnreadableMarkup extends Error {}

async function sanitize(dirty) {
  const rewriter = new HTMLRewriter().on('*', {
    element(el) {
      const tag = el.tagName.toLowerCase();
      if (DROP_WITH_CONTENT.has(tag)) { el.remove(); return; }
      const allowed = ALLOWED[tag];
      if (!allowed) { el.removeAndKeepContent(); return; }
      // Each attribute is taken once (the first copy, which is the one browsers use), checked,
      // and written back; every other copy is dropped, so a repeated attribute can't smuggle a
      // second value through.
      for (const name of new Set([...el.attributes].map(([n]) => n))) {
        const raw = (el.getAttribute(name) || '').trim();
        const v = name === 'href' || name === 'src' ? urlAsBrowserSeesIt(raw) : raw;
        for (let i = 0; i < 20 && el.hasAttribute(name); i++) el.removeAttribute(name);
        if (!allowed.includes(name)) continue;
        // Site paths must start with one slash: "//host" and "/\\host" are links to another site.
        if (name === 'href' && !/^(https?:\/\/|mailto:|\/(?![\/\\])|#)/i.test(v)) continue;
        if (name === 'src' && !/^(\/media\/|https:\/\/)/i.test(v)) continue;
        if (name === 'class' && !/^language-[a-z0-9+#.-]+$/i.test(v)) continue;
        if ((name === 'width' || name === 'height') && !/^\d{1,4}$/.test(v)) continue;
        el.setAttribute(name, v);
      }
      if (tag === 'a' && /^https?:\/\//i.test(el.getAttribute('href') || '')) el.setAttribute('rel', 'noopener');
      if (tag === 'img') { if (el.getAttribute('src')) el.setAttribute('loading', 'lazy'); else el.remove(); }
      if (tag === 'input') { if (el.getAttribute('type') === 'checkbox') el.setAttribute('disabled', ''); else el.remove(); }
    },
  }).onDocument({
    // Comments carry nothing a reader sees, and the odd things a browser treats as comments
    // (CDATA sections, stray processing instructions) go with them.
    comments(c) { c.remove(); },
  });
  let out;
  try {
    out = await rewriter.transform(new Response(dirty, { headers: { 'content-type': 'text/html; charset=utf-8' } })).text();
  } catch (err) {
    throw new UnreadableMarkup(String(err && err.message || err));
  }
  const at = unfinishedTail(out);
  return at < 0 ? out : out.slice(0, at) + escapeText(out.slice(at));
}

export async function renderMarkdown(md) {
  return sanitize(marked.parse(String(md || '')));
}
