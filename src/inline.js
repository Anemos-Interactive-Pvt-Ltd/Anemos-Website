// The inline scripts in the pages the Worker builds (src/layout.js). worker.js allows exactly these
// by their SHA-256 hash in the Content Security Policy, so any other inline script on those pages
// (one smuggled into a blog post, say) is refused by the browser. Change one here and its hash
// follows automatically.

export const TRACK_STUB = 'window.__trackQ = []; window.track = function (n, p) { window.__trackQ.push([n, p]); };';

export const ARRIVE = "try { if (sessionStorage.getItem('wind-arrive')) document.documentElement.classList.add('wind-arriving'); } catch (e) {}";

export const MENU = `
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
`;

export const INLINE_SCRIPTS = [TRACK_STUB, ARRIVE, MENU];
