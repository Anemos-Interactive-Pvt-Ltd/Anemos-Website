// The page shell for the blog pages: the same header, nav, footer and scripts as the static
// pages (about.html is the reference), with absolute paths because posts live under /blogs/.
import { esc } from './util.js';

export function pageShell({ title, description, canonical, ogType = 'website', ogImage, ogImageAlt, bodyClass = 'home', main, jsonLd, extraHead = '', analytics = true }) {
  const image = ogImage || 'https://anemosinteractive.com/og-image.png';
  const imageAlt = ogImageAlt || 'Anemos Interactive: games and technology, built in Mumbai, made for the world.';
  // Lines left empty by an optional tag are dropped, so the output validates cleanly.
  return page().replace(/\n[ \t]+(?=\n)/g, '');

  function page() { return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="Anemos Interactive">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${esc(image)}">
  ${ogImage ? '' : '<meta property="og:image:width" content="1200">\n  <meta property="og:image:height" content="630">'}
  <meta property="og:image:alt" content="${esc(imageAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${esc(image)}">
  <meta name="theme-color" content="#141242">
  <link rel="alternate" type="application/rss+xml" title="Anemos Interactive blog" href="https://anemosinteractive.com/blogs/feed.xml">
  <link rel="preload" href="/fonts/questrial-400.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="icon" type="image/svg+xml" href="/logo.svg">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="stylesheet" href="/style.css">
  ${extraHead}
  <script>window.__trackQ = []; window.track = function (n, p) { window.__trackQ.push([n, p]); };</script>
  <script>try { if (sessionStorage.getItem('wind-arrive')) document.documentElement.classList.add('wind-arriving'); } catch (e) {}</script>
  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body class="${bodyClass}">

<header>
  <div class="container header-inner">
    <a class="wordmark" href="/index.html"><img src="/logo-white.svg" alt="Anemos Interactive logo" class="logo-symbol">anemos <span>interactive</span></a>
    <button type="button" class="menu-toggle" aria-label="Open menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <nav class="nav" id="site-nav">
      <a href="/index.html">Home</a>
      <a href="/index.html#services">Services</a>
      <a href="/products.html">Products</a>
      <a href="/index.html#courses">Courses</a>
      <a href="/blogs" class="active">Blogs</a>
      <a href="/index.html#follow">Socials</a>
      <a href="/index.html#about">About us</a>
      <a href="/book.html">Book a call</a>
      <a href="/contact.html">Contact us</a>
    </nav>
  </div>
</header>

${main}

<footer>
  <div class="container">
    <div class="wordmark"><img src="/logo-white.svg" alt="" class="logo-symbol logo-symbol-footer">anemos <span>interactive</span></div>
    <div class="legal">
      Anemos Interactive Private Limited<br>
      CIN: U58203MH2026PTC475216 &nbsp;·&nbsp; GSTIN: 27ABGCA5982P1ZU &nbsp;·&nbsp; IEC: ABGCA5982P<br>
      Registered office (mailing address): F50, 1st Floor, The Zone, Chandravarkar Road, Borivali West, Mumbai – 400092, Maharashtra, India<br>
      <a href="mailto:contactus@anemosinteractive.com">contactus@anemosinteractive.com</a><br><br>
      © 2026 Anemos Interactive Private Limited. All rights reserved. &nbsp;·&nbsp; <a href="/privacy.html">Privacy policy</a> &nbsp;·&nbsp; <a href="/terms.html">Terms of use</a>
    </div>
  </div>
</footer>

<script>
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('site-nav');
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open);
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    nav.classList.remove('open');
    toggle.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }));
</script>
<script src="/wind.js"></script>
${analytics ? '\n<script src="/analytics.js" defer></script>\n' : ''}
</body>
</html>
`; }
}
