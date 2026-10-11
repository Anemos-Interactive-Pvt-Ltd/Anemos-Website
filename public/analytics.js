/* Google Analytics 4 for the Anemos Interactive site.
 *
 * Consent first: until the visitor accepts the cookie line, the tag runs cookieless (Google
 * Consent Mode, analytics storage denied) and only counts visits in aggregate. Accepting
 * turns on full measurement; declining keeps it cookieless and hides the line for good.
 * The tag script itself is fetched after the page has loaded, so it never competes with the
 * site's own files on a slow connection.
 *
 * Events: pages call window.track(name, params). Anything tracked before this file loads is
 * queued by the one-line stub in each page's <head>.
 */
(function () {
  var ID = 'G-W8FTJQJ2JM';
  var choice = null;
  try { choice = localStorage.getItem('anemos-consent'); } catch (e) { /* storage blocked: treat as undecided */ }

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('consent', 'default', {
    analytics_storage: choice === 'granted' ? 'granted' : 'denied',
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'
  });
  gtag('js', new Date());
  gtag('config', ID);

  var queued = window.__trackQ || [];
  window.track = function (name, params) { gtag('event', name, params || {}); };
  for (var i = 0; i < queued.length; i++) window.track(queued[i][0], queued[i][1]);

  function loadTag() {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    document.head.appendChild(s);
  }
  if (document.readyState === 'complete') loadTag(); else window.addEventListener('load', loadTag);

  // Clicks worth knowing about, wherever they happen.
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (a.classList.contains('social')) window.track('social_click', { network: (a.getAttribute('aria-label') || '').split(' ')[0] });
    else if (/(^|\/)book(\.html)?$/.test(href)) window.track('book_click', { from: location.pathname });
    else if (/^mailto:/.test(href)) window.track('email_click', { from: location.pathname });
  });

  // The cookie line.
  if (choice) return;
  var bar = document.createElement('div');
  bar.className = 'consent';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Cookies');
  bar.innerHTML = '<p>We use cookies to see how the site is used.</p><button type="button" class="btn consent-accept">Accept</button><button type="button" class="consent-decline">Decline</button>';
  function decide(value) {
    try { localStorage.setItem('anemos-consent', value); } catch (e) { /* fine without */ }
    gtag('consent', 'update', { analytics_storage: value });
    window.track('consent', { choice: value });
    bar.classList.add('is-gone');
    setTimeout(function () { bar.remove(); }, 400);
  }
  bar.querySelector('.consent-accept').addEventListener('click', function () { decide('granted'); });
  bar.querySelector('.consent-decline').addEventListener('click', function () { decide('denied'); });
  function show() { document.body.appendChild(bar); requestAnimationFrame(function () { bar.classList.add('is-in'); }); }
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
