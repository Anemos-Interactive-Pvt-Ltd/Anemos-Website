/* Anemos Interactive — the wind run.
 *
 * Home page: the page scroll drives a runner along an obstacle course drawn on
 * a canvas. Wind ribbons trace the path he is about to take, and each block of
 * copy is blown in as he reaches its stretch of the course. Between stretches
 * he runs through a hoop into a different world; the last hoop leads to the
 * contact page.
 * Contact page: the same ribbons, drifting quietly behind the heading.
 * Projects page: a building site for the game still in development.
 * Both pages: moving between pages, or jumping along the run, happens behind a
 * wipe of gusts.
 *
 * No dependencies. If the visitor prefers reduced motion, or the window is too
 * short to hold the scene, the home page stays a normal stacked page.
 */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const RAD = Math.PI / 180;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const mod = (v, n) => ((v % n) + n) % n;
  const ease = (dt, rate) => 1 - Math.exp(-dt * rate);

  // Small seeded generator, so the skyline and stars are the same on every visit.
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Browsers from 2018 lack some of the newer observers and event forms; these fall back quietly.
  const onMedia = (query, fn) => (query.addEventListener ? query.addEventListener('change', fn) : query.addListener(fn));
  function watchSize(el, fn) {
    if (window.ResizeObserver) new ResizeObserver(fn).observe(el);
    else window.addEventListener('resize', fn);
  }
  function watchVisible(el, fn) {
    if (window.IntersectionObserver) new IntersectionObserver(([entry]) => fn(entry.isIntersecting)).observe(el);
    else fn(true);
  }

  /* ---------- Text: split into words the wind can carry ---------- */

  function splitWords(el, startMs, stepMs) {
    let delay = startMs;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (!node.nodeValue.trim()) continue;
      const frag = document.createDocumentFragment();
      for (const part of node.nodeValue.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(' '));
          continue;
        }
        const word = document.createElement('span');
        word.className = 'w';
        word.textContent = part;
        word.style.setProperty('--d', delay + 'ms');
        delay += stepMs;
        frag.appendChild(word);
      }
      node.replaceWith(frag);
    }
    return delay;
  }

  // Every [data-wind] inside a block gets a staggered delay, top to bottom.
  function prepareText(block) {
    let delay = 0;
    for (const el of block.querySelectorAll('[data-wind]')) {
      if (el.dataset.wind === 'words') {
        delay = splitWords(el, delay, el.matches('h1, h2') ? 45 : 11) + 60;
      } else {
        el.classList.add('rv');
        el.style.setProperty('--d', delay + 'ms');
        delay += 90;
      }
    }
  }

  /* ---------- Wind ribbons (shared by both pages) ---------- */

  const STEP = 4;   // px between ribbon samples
  const PAD = 60;   // px the ribbons overshoot each edge

  const RIBBONS = [
    { off: -0.30, amp: 0.07, wave: 210, speed: 0.9, phase: 0.0, width: 3.0, alpha: 0.70, dash: [1.9, 0.5], flow: 1.0, glow: true, loop: 0.20, loopAt: 300, loopSpeed: 0.55 },
    { off: -0.05, amp: 0.05, wave: 170, speed: 1.2, phase: 1.7, width: 1.6, alpha: 0.42, dash: [1.1, 0.7], flow: 1.4 },
    { off: 0.18, amp: 0.06, wave: 260, speed: 0.7, phase: 3.1, width: 4.0, alpha: 0.28, dash: [2.6, 0.9], flow: 0.8 },
    { off: -0.62, amp: 0.09, wave: 300, speed: 0.6, phase: 4.4, width: 1.8, alpha: 0.38, dash: [1.4, 1.2], flow: 1.2, loop: 0.14, loopAt: 900, loopSpeed: 0.8 },
    { off: 0.02, amp: 0.08, wave: 230, speed: 1.0, phase: 5.2, width: 2.2, alpha: 0.60, dash: [1.4, 0.9], flow: 1.6, glow: true, front: true },
    { off: 0.36, amp: 0.05, wave: 190, speed: 1.3, phase: 2.3, width: 1.4, alpha: 0.38, dash: [0.9, 1.0], flow: 1.9, front: true },
  ];

  /* Each ribbon is a line of gusts: streaks with a bright head and a tail that fades out.
     o: { W, u, t, flow, guide (Float32Array of y per STEP), focus (0..1), rgb, glow } */
  function strokeRibbon(ctx, r, o) {
    const { W, u, t, flow, guide } = o;
    let loopC = 0, loopR = 0, loopW = 0;
    if (r.loop) {
      const span = W + 400;
      loopC = mod(r.loopAt + flow * r.loopSpeed, span) - 200;
      loopR = r.loop * u;
      loopW = loopR * 2.4;
    }
    const gust = r.dash[0] * u, period = gust + r.dash[1] * u;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let from = -PAD - period + mod(flow * r.flow, period); from < W + PAD; from += period) {
      const a = Math.max(from, -PAD), b = Math.min(from + gust, W + PAD);
      if (b - a < STEP) continue;
      ctx.beginPath();
      for (let sx = a, n = 0; sx <= b; sx += STEP, n++) {
        let x = sx;
        let y = guide[clamp(Math.round((sx + PAD) / STEP), 0, guide.length - 1)] + r.off * u
          + Math.sin(sx / r.wave + t * r.speed + r.phase) * r.amp * u
          + Math.sin(sx / (r.wave * 0.37) - t * r.speed * 1.7 + r.phase * 2) * r.amp * u * 0.3;
        if (loopR) {
          const k = (sx - loopC) / loopW + 0.5;
          if (k > 0 && k < 1) {
            const th = TAU * k;
            x += loopR * Math.sin(th);
            y -= loopR * (1 - Math.cos(th));
          }
        }
        if (n === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      // Strongest around the focus point, fading out towards both edges of the canvas.
      const mid = (a + b) / 2 / W;
      const edge = clamp(Math.min((mid + 0.03) / 0.16, (1.03 - mid) / 0.16), 0, 1);
      const alpha = r.alpha * edge * (0.7 + 0.6 * Math.exp(-(((mid - o.focus) / 0.28) ** 2)));
      const g = ctx.createLinearGradient(from, 0, from + gust, 0);
      g.addColorStop(0, `rgba(${o.rgb},0)`);
      g.addColorStop(0.75, `rgba(${o.rgb},${alpha})`);
      g.addColorStop(1, `rgba(${o.glow},${Math.min(1, alpha * 1.3)})`);
      ctx.strokeStyle = g;
      if (r.glow) {
        ctx.globalAlpha = 0.12;
        ctx.lineWidth = r.width * 4;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.lineWidth = r.width;
      ctx.stroke();
    }
  }

  function sizeCanvas(canvas, ctx) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { W, H };
  }

  /* ---------- Shared drawing: skyline, figure, icons ---------- */

  function makeSkyline(seed, period, minH, maxH) {
    const r = rng(seed), out = [];
    for (let x = 0; x < period;) {
      const w = 0.35 + r() * 0.6;
      out.push({ x, w, h: minH + r() * (maxH - minH), cap: r() });
      x += w + (r() < 0.2 ? 0.15 + r() * 0.3 : 0);
    }
    return out;
  }

  // The figure, in units of his own height. Pose = [thighA, kneeA, thighB, kneeB, armA, elbowA,
  // armB, elbowB, lean] in degrees; A is the near side. Angles are from straight down, positive
  // towards the way he faces. skeleton() gives joint positions relative to the hip.
  const LIMB = { thigh: 0.245, shin: 0.245, foot: 0.085, torso: 0.30, arm: 0.15, fore: 0.15, head: 0.078, neck: 0.035 };

  function skeleton(p) {
    const leg = (thigh, knee) => {
      const a = thigh * RAD, b = (thigh - knee) * RAD;
      const kx = LIMB.thigh * Math.sin(a), ky = LIMB.thigh * Math.cos(a);
      const ax = kx + LIMB.shin * Math.sin(b), ay = ky + LIMB.shin * Math.cos(b);
      return { kx, ky, ax, ay, tx: ax + LIMB.foot * Math.cos(b), ty: ay - LIMB.foot * Math.sin(b) };
    };
    const lean = p[8] * RAD, ux = Math.sin(lean), uy = -Math.cos(lean);
    const sx = LIMB.torso * ux, sy = LIMB.torso * uy;
    const arm = (sh, el) => {
      const a = sh * RAD, b = (sh + el) * RAD;
      const ex = sx + LIMB.arm * Math.sin(a), ey = sy + LIMB.arm * Math.cos(a);
      return { ex, ey, hx: ex + LIMB.fore * Math.sin(b), hy: ey + LIMB.fore * Math.cos(b) };
    };
    const legA = leg(p[0], p[1]), legB = leg(p[2], p[3]);
    return {
      legA, legB, armA: arm(p[4], p[5]), armB: arm(p[6], p[7]), sx, sy, ux, uy,
      hx: sx + ux * (LIMB.neck + LIMB.head), hy: sy + uy * (LIMB.neck + LIMB.head),
      reach: Math.max(legA.ay, legA.ty, legB.ay, legB.ty),
    };
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Line icons for what the studio makes and works with, each drawn in a -1..1 box.
  function makeGlyphs(ctx) {
    const path = (...pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
    const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
    const box = (x, y, w, h, r = 0.12) => { roundedRect(ctx, x, y, w, h, r); ctx.stroke(); };
    return {
      gamepad() { box(-1, -0.5, 2, 1, 0.45); path([-0.7, 0], [-0.3, 0]); path([-0.5, -0.2], [-0.5, 0.2]); dot(0.4, 0.12, 0.1); dot(0.66, -0.12, 0.1); },
      handheld() { box(-1, -0.55, 2, 1.1, 0.25); box(-0.42, -0.32, 0.84, 0.64, 0.06); path([-0.82, 0], [-0.6, 0]); path([-0.71, -0.11], [-0.71, 0.11]); dot(0.72, 0, 0.09); },
      joystick() { box(-0.75, 0.35, 1.5, 0.45, 0.12); path([0, 0.35], [0, -0.3]); dot(0, -0.52, 0.28); },
      trophy() {
        path([-0.5, -0.8], [0.5, -0.8], [0.45, -0.2], [0, 0.15], [-0.45, -0.2], [-0.5, -0.8]);
        path([0, 0.15], [0, 0.6]); path([-0.4, 0.75], [0.4, 0.75]);
        path([-0.5, -0.6], [-0.85, -0.6], [-0.8, -0.2], [-0.45, -0.15]); path([0.5, -0.6], [0.85, -0.6], [0.8, -0.2], [0.45, -0.15]);
      },
      code() { path([-0.35, -0.5], [-0.9, 0], [-0.35, 0.5]); path([0.35, -0.5], [0.9, 0], [0.35, 0.5]); path([0.15, -0.7], [-0.15, 0.7]); },
      pen() { path([-0.8, 0.8], [-0.6, 0.2], [0.4, -0.8], [0.8, -0.4], [-0.2, 0.6], [-0.8, 0.8]); path([0.15, -0.55], [0.55, -0.15]); },
      layers() { path([0, -0.8], [0.9, -0.35], [0, 0.1], [-0.9, -0.35], [0, -0.8]); path([-0.9, 0.05], [0, 0.5], [0.9, 0.05]); path([-0.9, 0.45], [0, 0.9], [0.9, 0.45]); },
      cube() { path([0, -0.9], [0.8, -0.45], [0.8, 0.45], [0, 0.9], [-0.8, 0.45], [-0.8, -0.45], [0, -0.9]); path([-0.8, -0.45], [0, 0], [0.8, -0.45]); path([0, 0], [0, 0.9]); },
      server() { for (const y of [-0.85, -0.25, 0.35]) { box(-0.8, y, 1.6, 0.5, 0.1); dot(-0.5, y + 0.25, 0.08); path([0, y + 0.25], [0.5, y + 0.25]); } },
      cloud() {
        ctx.beginPath();
        ctx.arc(-0.4, 0.2, 0.35, Math.PI / 2, Math.PI * 1.5); ctx.arc(-0.05, -0.2, 0.45, Math.PI, Math.PI * 1.85);
        ctx.arc(0.5, 0.15, 0.4, -Math.PI / 2, Math.PI / 2);
        ctx.closePath(); ctx.stroke();
      },
      chip() {
        box(-0.5, -0.5, 1, 1, 0.1); box(-0.2, -0.2, 0.4, 0.4, 0.04);
        for (const d of [-0.25, 0.25]) { path([d, -0.5], [d, -0.85]); path([d, 0.5], [d, 0.85]); path([-0.5, d], [-0.85, d]); path([0.5, d], [0.85, d]); }
      },
      monitor() { box(-0.9, -0.7, 1.8, 1.1, 0.1); path([0, 0.4], [0, 0.75]); path([-0.4, 0.8], [0.4, 0.8]); path([-0.55, -0.4], [-0.3, -0.15], [-0.55, 0.1]); path([-0.1, 0.1], [0.3, 0.1]); },
    };
  }

  /* ---------- Wind wipe: gusts that cover the screen and carry you somewhere else ---------- */

  const WIPE_MS = 760;   // longest band delay plus its travel time, as set in style.css
  const pagePath = path => path.replace(/index\.html$/, '');

  const wipe = (() => {
    const el = document.createElement('div');
    el.className = 'wind-wipe';
    el.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 7; i++) el.appendChild(document.createElement('i'));
    document.body.appendChild(el);
    let busy = false;

    // Put the bands in a state at once, without animating there.
    function snap(state) {
      el.classList.add('is-still');
      el.classList.remove('is-covering', 'is-clearing');
      if (state) el.classList.add(state);
      void el.offsetWidth;
      el.classList.remove('is-still');
    }
    function reset() { snap(''); busy = false; }
    function clear() {
      el.classList.replace('is-covering', 'is-clearing');
      setTimeout(reset, WIPE_MS);
    }
    function cover(then) {
      if (busy) return;
      busy = true;
      el.classList.add('is-covering');
      setTimeout(then, WIPE_MS);
    }

    return {
      reset,
      // Cover the screen, run `change` behind the cover, then blow the cover away.
      across(change) {
        if (reducedMotion.matches) return change();
        cover(() => { change(); requestAnimationFrame(clear); });
      },
      // Cover the screen and leave for another page, which clears the cover as it arrives.
      leaveTo(url) {
        if (reducedMotion.matches) { location.href = url; return; }
        cover(() => {
          try { sessionStorage.setItem('wind-arrive', '1'); } catch (e) { /* storage blocked: arrive without the wipe */ }
          location.href = url;
        });
      },
      // The inline script in <head> holds a plain cover up until this takes over from it.
      arrive() {
        const root = document.documentElement;
        if (!root.classList.contains('wind-arriving')) return;
        try { sessionStorage.removeItem('wind-arrive'); } catch (e) { /* nothing to clear */ }
        if (!reducedMotion.matches) {
          busy = true;
          snap('is-covering');
          requestAnimationFrame(() => requestAnimationFrame(clear));
        }
        root.classList.remove('wind-arriving');
      },
    };
  })();

  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target) return;
    if (a.origin !== location.origin || pagePath(a.pathname) === pagePath(location.pathname)) return;
    e.preventDefault();
    wipe.leaveTo(a.href);
  });
  // Coming back with the back button restores the page as it was left: covered.
  window.addEventListener('pageshow', e => { if (e.persisted) wipe.reset(); });

  /* ---------- Home: the run ---------- */

  function initJourney(journey) {
    const stage = journey.querySelector('.journey-stage');
    const canvas = journey.querySelector('.journey-canvas');
    const ctx = canvas.getContext('2d');
    const panels = [...journey.querySelectorAll('.panel')];
    const navLinks = [...document.querySelectorAll('#site-nav a')];
    panels.forEach(prepareText);

    // The course, measured in runner-heights. One panel every SPACING.
    const SPACING = 12;
    const LENGTH = SPACING * (panels.length - 1);
    const REACH = 4.6;                                      // how far either side of its mark a panel stays up
    const STOPS = [0, 8.6, 21.5, 33.6, 45.8, 57.7, 69.8, LENGTH]; // where the dots and nav links land
    const GOAL = LENGTH + 5.4;                              // the last hoop: through it, the wind carries you to the contact page
    const END = LENGTH + 6;                                 // where the scroll runs out
    // A hoop halfway between each pair of panels. The world changes on the far side of every one.
    const PORTALS = panels.slice(1).map((_, i) => (i + 0.5) * SPACING).concat(GOAL);
    const contactUrl = panels[panels.length - 1].querySelector('a.btn').href;

    // One world per panel, plus the white of the contact page beyond the last hoop.
    const THEMES = [
      { back: 'city', sky: ['#141242', '#262262', '#1b3a66'], sil: '190,200,255', ground: ['#0f0e3c', '#090822'], stars: 1, link: true },
      { back: 'city', sky: ['#1d1552', '#5a2a7c', '#e58a6f'], sil: '255,214,220', ground: ['#22123f', '#120924'], stars: 0.4, sun: [0.15, '255,196,140'] },
      { back: 'hills', sky: ['#0d2547', '#11505f', '#1f8f88'], sil: '205,255,244', ground: ['#0a2733', '#06151d'], turbines: true },
      { back: 'islands', sky: ['#1c0b16', '#6b1d2a', '#e2603a'], sil: '255,214,190', ground: ['#220c14', '#12060b'], stars: 1, pixel: true },
      { back: 'grid', sky: ['#0a2463', '#12409a', '#1b5fc4'], sil: '205,226,255', ground: ['#0a1f5c', '#061236'] },
      { back: 'circuit', sky: ['#04161c', '#06323a', '#0a5a5a'], sil: '120,255,235', ground: ['#03171c', '#020c0f'] },
      { back: 'city', sky: ['#1b1038', '#3b1a6b', '#c2417a'], sil: '255,205,235', ground: ['#1c0d38', '#0e061f'], stars: 0.8 },
      { back: 'hills', sky: ['#1a2466', '#2c7790', '#f2b56b'], sil: '255,236,205', ground: ['#12204f', '#090f2a'], sun: [0.35, '255,226,160'] },
      { back: 'blank', sky: ['#ffffff', '#ffffff', '#f5f6fa'], sil: '38,34,98', ground: ['#f5f6fa', '#e4e6ef'], light: true },
    ];
    const JUMPS = [
      { x: 10.6, hw: 1.15, h: 0.8 },    // hurdle
      { x: 13.4, hw: 1.15, h: 0.8 },    // hurdle
      { x: 36.0, hw: 1.8, h: 1.0 },     // chasm
      { x: 48.0, hw: 1.6, h: 1.25 },    // crates
      { x: 60.0, hw: 1.75, h: 1.25 },   // gears
      { x: 72.0, hw: 1.15, h: 0.8 },    // hurdle
    ];
    const CHASM = [34.7, 37.3];
    const CYCLE = 1.5;                                      // ground covered by one full stride cycle

    const ORBS = [];
    for (const j of JUMPS) for (const d of [-0.5, 0, 0.5]) ORBS.push(j.x + d * j.hw);
    for (const x of [5, 6, 7, 18, 19, 20, 22.5, 24, 25.5, 29.5, 30.5, 31.5, 41, 42, 43, 53, 54, 55, 65, 66, 67, 77, 78, 79]) ORBS.push(x);

    const rand = rng(7);
    const STARS = Array.from({ length: 70 }, () => ({ x: rand(), y: rand() * 0.62, r: 0.5 + rand() * 1.1, ph: rand() * TAU }));
    const MOTES = Array.from({ length: 28 }, (_, i) => ({
      s: rand(), off: -0.9 + rand() * 1.5, speed: 0.6 + rand() * 1.2,
      len: 0.08 + rand() * 0.2, alpha: 0.15 + rand() * 0.4, leaf: i % 5 === 0, ph: rand() * TAU,
    }));
    const FAR = makeSkyline(11, 30, 0.5, 1.3);
    const NEAR = makeSkyline(23, 38, 0.4, 1.8);
    const ISLES = Array.from({ length: 7 }, (_, i) => ({ x: i * 4.2 + rand() * 2, y: 0.9 + rand() * 1.6, w: 0.5 + rand() * 0.8, par: 0.15 + rand() * 0.25, ph: rand() * TAU }));
    const CUBES = Array.from({ length: 5 }, (_, i) => ({ x: i * 5 + rand() * 2.5, y: 1.2 + rand() * 1.5, s: 0.22 + rand() * 0.25, spin: 0.3 + rand() * 0.5, ph: rand() * TAU }));
    const TRACES = Array.from({ length: 16 }, () => ({ x: rand() * 24, y: 0.3 + rand() * 2.7, a: 0.6 + rand() * 1.8, d: (rand() < 0.5 ? -1 : 1) * (0.2 + rand() * 0.4), b: 0.5 + rand() * 1.6, ph: rand() }));
    // Icons hanging in the air, [where, how high, which]. The wind uncovers each as he nears it.
    const ICONS = [
      [22.6, 1.6, 'gamepad'], [24, 1.78, 'cube'], [25.4, 1.95, 'server'],
      [32.2, 1.6, 'gamepad'], [33.4, 1.95, 'handheld'], [38.8, 1.6, 'joystick'], [40.2, 1.95, 'trophy'],
      [44.2, 1.6, 'code'], [45.5, 1.95, 'pen'], [50.6, 1.6, 'layers'], [52, 1.95, 'cube'],
      [56.2, 1.6, 'server'], [57.5, 1.95, 'cloud'], [62.6, 1.6, 'chip'], [64, 1.95, 'monitor'],
    ];
    const glyphs = makeGlyphs(ctx);
    const GUSTS = Array.from({ length: 18 }, () => ({ y: rand(), len: 1.5 + rand() * 3, delay: rand() * 0.35, width: 1.5 + rand() * 4 }));

    // Scene state
    let W = 0, H = 0, u = 100, gy = 0, rx = 0;
    let span = 100;                                         // pixels per unit of course: u, stretched on wide screens
    let guide = new Float32Array(0), scratch = new Float32Array(0);
    let top = 0, scrollLen = 1;
    let cur = 0, vel = 0, phase = 0, runAmt = 0, facing = 1;
    let flow = 0, time = 0, last = 0, raf = 0;
    let live = false, visible = true, first = true, wide = false;
    let activeIdx = -2;
    let gust = null;                                        // the burst set off by running through a hoop
    const scarf = Array.from({ length: 8 }, () => ({ x: 0, y: 0, px: 0, py: 0 }));

    const X = wx => rx + (wx - cur) * span;

    function jumpAt(wx) {
      for (const j of JUMPS) {
        const d = (wx - j.x) / j.hw;
        if (d > -1 && d < 1) return { h: j.h * (1 - d * d), d };
      }
      return null;
    }
    const liftAt = wx => { const j = jumpAt(wx); return j ? j.h : 0; };
    // Running average, used to round off the take-offs and landings in the wind's line.
    function soften(from, to, r) {
      const n = from.length, at = i => from[clamp(i, 0, n - 1)];
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += at(i);
      for (let i = 0; i < n; i++) {
        to[i] = sum / (2 * r + 1);
        sum += at(i + r + 1) - at(i - r);
      }
    }
    const guideAt = sx => guide[clamp(Math.round((sx + PAD) / STEP), 0, guide.length - 1)];

    function measure() {
      ({ W, H } = sizeCanvas(canvas, ctx));
      // A short, wide window (a phone on its side) puts the copy on the left and the run on the right.
      wide = H < 560;
      journey.classList.toggle('is-wide', wide);
      u = wide ? Math.min(H * 0.2, 110) : Math.min(H * 0.17, W * 0.26, 340);
      gy = H * (wide ? 0.84 : 0.82);
      rx = wide ? W * 0.7 : Math.max(W * 0.3, 96);
      // On a wide screen the course is stretched out, so that each world fills the screen and the
      // hoop into the next one is off to the right until the visitor scrolls towards it.
      span = Math.max(u, (W - rx + 0.6 * u) / PORTALS[0]);
      // Beyond laptop width the course is stretched further still, up to 60% longer at 2560px
      // and above, and the page is made that much taller: more ground to cover between worlds,
      // and more scrolling to cover it.
      const longer = wide ? 1 : 1 + 0.6 * clamp((W - 1440) / 1120, 0, 1);
      span *= longer;
      journey.style.height = longer > 1 ? stage.offsetHeight * (1 + 9.2 * longer) + 'px' : '';
      guide = new Float32Array(Math.ceil((W + PAD * 2) / STEP) + 1);
      scratch = new Float32Array(guide.length);
      top = journey.getBoundingClientRect().top + window.scrollY;
      scrollLen = Math.max(1, journey.offsetHeight - stage.offsetHeight);
      first = true;
      fitPanels();
    }

    // Whatever the screen, each panel has to stay clear of what happens beneath it. If the copy
    // is too tall for the room it has, it is scaled down (and widened to match) until it fits.
    const CLEARANCE = [1.3, 1.85, 1.6, 2.3, 2.3, 2.3, 1.85, 1.3];   // runner-heights of scene under each panel
    function fitPanels() {
      panels.forEach((p, i) => {
        p.style.transform = p.style.width = p.style.maxWidth = '';
        const room = (wide ? H : gy - CLEARANCE[i] * u) - p.offsetTop - 10;
        const natural = p.offsetWidth;
        let scale = 1;
        for (let n = 0; n < 5 && p.offsetHeight * scale > room && scale > 0.6; n++) {
          scale = Math.max(0.6, scale * Math.max(0.8, room / (p.offsetHeight * scale)) * 0.98);
          p.style.maxWidth = 'none';
          p.style.width = natural / scale + 'px';
          p.style.transform = `scale(${scale})`;
        }
      });
    }

    /* ----- Runner ----- */

    // One leg through a stride, eight poses from foot-strike round to foot-strike.
    const THIGH = [25, 10, -5, -30, -25, 5, 40, 40];
    const KNEE = [10, 30, 20, 10, 80, 110, 90, 35];
    function cycle(keys, ph) {
      const n = keys.length, f = mod(ph, 1) * n, i = Math.floor(f), t = f - i;
      const p0 = keys[(i - 1 + n) % n], p1 = keys[i], p2 = keys[(i + 1) % n], p3 = keys[(i + 2) % n];
      return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
    }

    function runPose(ph) {
      const tA = cycle(THIGH, ph), tB = cycle(THIGH, ph + 0.5);
      return [tA, cycle(KNEE, ph), tB, cycle(KNEE, ph + 0.5), tB - 8, 80 + tB * 0.4, tA - 8, 80 + tA * 0.4, 13];
    }
    const idlePose = t => [15, 16, -12, 9, -10 + Math.sin(t * 1.6) * 2, 28, 12 - Math.sin(t * 1.6) * 2, 24, 5];
    const airPose = t => { const s = Math.sin(t * 2.2) * 4; return [58 + s, 28, -38 - s, 78, -55, 35, 65 + s, 50, 10]; };
    const CHEER = [10, 6, -10, 5, 142, 10, -150, -10, -2];
    const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

    function line(x1, y1, x2, y2) {
      ctx.beginPath(); ctx.moveTo(x1 * u, y1 * u); ctx.lineTo(x2 * u, y2 * u); ctx.stroke();
    }
    function drawLeg(l, colour) {
      ctx.strokeStyle = colour; ctx.lineWidth = 0.075 * u;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(l.kx * u, l.ky * u); ctx.lineTo(l.ax * u, l.ay * u); ctx.stroke();
      ctx.strokeStyle = '#2fd0c9'; ctx.lineWidth = 0.062 * u;
      line(l.ax, l.ay, l.tx, l.ty);
    }
    function drawArm(s, a, colour) {
      ctx.strokeStyle = colour; ctx.lineWidth = 0.06 * u;
      ctx.beginPath(); ctx.moveTo(s.sx * u, s.sy * u); ctx.lineTo(a.ex * u, a.ey * u); ctx.lineTo(a.hx * u, a.hy * u); ctx.stroke();
    }

    function stepScarf(ax, ay, dt, rel) {
      const seg = 0.055 * u, dt2 = dt * dt;
      if (first) for (const [i, p] of scarf.entries()) { p.x = p.px = ax - i * seg; p.y = p.py = ay; }
      scarf[0].x = ax; scarf[0].y = ay;
      for (let i = 1; i < scarf.length; i++) {
        const p = scarf[i];
        const vx = (p.x - p.px) * 0.9, vy = (p.y - p.py) * 0.9;
        p.px = p.x; p.py = p.y;
        p.x += vx + rel * u * 7 * dt2;
        p.y += vy + (u * 4 + Math.sin(time * 11 + i * 1.1) * u * 3 * Math.min(2, Math.abs(rel))) * dt2;
      }
      for (let k = 0; k < 4; k++) {
        for (let i = 1; i < scarf.length; i++) {
          const a = scarf[i - 1], b = scarf[i];
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
          b.x = a.x + dx / d * seg; b.y = a.y + dy / d * seg;
        }
      }
    }
    function drawScarf() {
      ctx.strokeStyle = '#2fd0c9'; ctx.lineWidth = 0.036 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(scarf[0].x, scarf[0].y);
      for (let i = 1; i < scarf.length - 1; i++) {
        const a = scarf[i], b = scarf[i + 1];
        ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      ctx.stroke();
    }

    function drawRunner(dt) {
      const j = jumpAt(cur);
      const lift = j ? j.h : 0;
      const air = j ? smooth(0, 0.22, 1 - Math.abs(j.d)) : 0;
      const cheer = smooth(LENGTH - 0.8, LENGTH - 0.05, cur) * (1 - runAmt);
      let pose = mix(idlePose(time), runPose(phase), runAmt);
      pose = mix(pose, CHEER, cheer);
      pose = mix(pose, airPose(time), air);
      const s = skeleton(pose);
      // Beyond the last hoop the world is white, so he is drawn dark.
      const [ink, shade] = cur > GOAL ? ['#262262', '#7774b3'] : ['#f3f5ff', '#8f97cf'];

      // Keep the lower foot on the ground; in the air, tuck the legs for real clearance.
      const reach = lerp(s.reach, (LIMB.thigh + LIMB.shin) * 0.92, air);
      const breathe = Math.sin(time * 2) * 0.006 * (1 - runAmt);
      const hipY = gy - (0.02 + reach + lift + breathe) * u;

      if (cur < CHASM[0] || cur > CHASM[1]) {
        ctx.fillStyle = `rgba(4,4,24,${0.3 * (1 - lift * 0.5)})`;
        ctx.beginPath(); ctx.ellipse(rx, gy + 0.02 * u, 0.24 * u * (1 - lift * 0.3), 0.03 * u, 0, 0, TAU); ctx.fill();
      }

      const face = facing < 0 ? Math.min(facing, -0.08) : Math.max(facing, 0.08);
      const flip = () => { ctx.save(); ctx.translate(rx, hipY); ctx.scale(face, 1); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; };

      flip();
      drawArm(s, s.armB, shade);
      drawLeg(s.legB, shade);
      ctx.strokeStyle = ink; ctx.lineWidth = 0.13 * u;
      line(0, 0, s.sx, s.sy);
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.arc(s.hx * u, s.hy * u, LIMB.head * u, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2fd0c9'; ctx.lineWidth = 0.05 * u;
      const nx = s.sx + s.ux * 0.045, ny = s.sy + s.uy * 0.045;
      line(nx - 0.04, ny + 0.012, nx + 0.045, ny - 0.012);
      ctx.restore();

      // The scarf streams out behind him, harder the faster he runs.
      const rel = clamp(-0.5 - vel * 0.9, -7, 4);
      stepScarf(rx + face * (s.sx + s.ux * 0.045 - 0.04) * u, hipY + (s.sy + s.uy * 0.045) * u, dt, rel);
      drawScarf();

      flip();
      drawLeg(s.legA, ink);
      drawArm(s, s.armA, ink);
      ctx.restore();
    }

    /* ----- World ----- */

    function drawStars(th) {
      for (const s of STARS) {
        ctx.fillStyle = `rgba(${th.sil},${th.stars * (0.25 + 0.2 * Math.sin(time * 1.3 + s.ph))})`;
        const x = mod(s.x * W - cur * u * 0.02, W), y = s.y * H;
        if (th.pixel) { ctx.fillRect(x, y, s.r * 2.4, s.r * 2.4); continue; }
        ctx.beginPath(); ctx.arc(x, y, s.r, 0, TAU); ctx.fill();
      }
    }

    function drawSun(th) {
      const [height, rgb] = th.sun;
      const x = W * 0.72 - cur * 0.04 * u, y = gy - height * u;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 2.6 * u);
      g.addColorStop(0, `rgba(${rgb},0.55)`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(x - 2.6 * u, y - 2.6 * u, 5.2 * u, 5.2 * u);
      ctx.fillStyle = `rgba(${rgb},0.92)`;
      ctx.beginPath(); ctx.arc(x, y, 0.62 * u, 0, TAU); ctx.fill();
    }

    function drawSkyline(th, list, period, parallax, alpha) {
      const off = mod(cur * parallax, period);
      const reps = Math.ceil(W / (period * u)) + 1;
      ctx.fillStyle = `rgba(${th.sil},${alpha})`;
      for (let k = -1; k <= reps; k++) {
        const base = (k * period - off) * u;
        for (const b of list) {
          const x = base + b.x * u, w = b.w * u;
          if (x > W || x + w < 0) continue;
          ctx.fillRect(x, gy - b.h * u, w + 0.5, b.h * u);
          if (b.cap > 0.7) ctx.fillRect(x + w * 0.4, gy - (b.h + 0.12) * u, w * 0.12, 0.12 * u);
        }
      }
    }

    // A cable-stayed bridge on the horizon at the start: a nod to the Mumbai sea link.
    function drawSeaLink() {
      const x = W * 0.78 - cur * 0.3 * u;
      if (x < -3 * u || x > W + 3 * u) return;
      const deck = gy - 0.34 * u, peak = gy - 2.0 * u;
      ctx.strokeStyle = 'rgba(190,200,255,0.13)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i <= 7; i++) {
        ctx.moveTo(x, peak + i * 0.03 * u); ctx.lineTo(x - i * 0.3 * u, deck);
        ctx.moveTo(x, peak + i * 0.03 * u); ctx.lineTo(x + i * 0.3 * u, deck);
      }
      ctx.stroke();
      ctx.lineWidth = Math.max(1.5, 0.03 * u);
      ctx.beginPath();
      ctx.moveTo(x - 0.13 * u, gy); ctx.lineTo(x, peak); ctx.lineTo(x + 0.13 * u, gy);
      ctx.moveTo(x - 2.6 * u, deck); ctx.lineTo(x + 2.6 * u, deck);
      for (const d of [-2.2, -1.3, 1.3, 2.2]) { ctx.moveTo(x + d * u, deck); ctx.lineTo(x + d * u, gy); }
      ctx.stroke();
    }

    function drawHills(th) {
      for (let k = 0; k < 3; k++) {
        const h = (0.95 - k * 0.3) * u, w = (2.4 - k * 0.5) * u, off = cur * (0.08 + k * 0.1) * u + k * 500;
        ctx.fillStyle = `rgba(${th.sil},${0.07 + k * 0.05})`;
        ctx.beginPath(); ctx.moveTo(0, gy);
        for (let x = 0; x <= W + 16; x += 16) {
          ctx.lineTo(x, gy - h * (0.55 + 0.3 * Math.sin((x + off) / w) + 0.15 * Math.sin((x + off) / (w * 0.43) + k)));
        }
        ctx.lineTo(W + 16, gy); ctx.closePath(); ctx.fill();
      }
    }

    function drawTurbines(th) {
      const period = 6 * u, hub = gy - 1.75 * u, blade = 0.5 * u;
      ctx.strokeStyle = `rgba(${th.sil},0.34)`; ctx.lineCap = 'round';
      for (let x = period * 0.4 - mod(cur * 0.18 * u, period); x < W + u; x += period) {
        ctx.lineWidth = 0.03 * u;
        ctx.beginPath(); ctx.moveTo(x, gy - 0.4 * u); ctx.lineTo(x, hub); ctx.stroke();
        ctx.lineWidth = 0.022 * u;
        ctx.beginPath();
        for (let b = 0; b < 3; b++) {
          const a = time * 1.6 + b * TAU / 3;
          ctx.moveTo(x, hub); ctx.lineTo(x + Math.cos(a) * blade, hub + Math.sin(a) * blade);
        }
        ctx.stroke();
      }
    }

    function drawIslands(th) {
      const mx = W * 0.8 - cur * 0.03 * u, my = H * 0.24;
      ctx.fillStyle = `rgba(${th.sil},0.13)`;
      ctx.beginPath(); ctx.arc(mx, my, 0.9 * u, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(${th.sil},0.3)`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mx, my, 1.08 * u, 0, TAU); ctx.stroke();
      for (const s of ISLES) {
        const x = mod((s.x - cur * s.par) * u, 30 * u) - 3 * u;
        const y = gy - s.y * u + Math.sin(time * 0.8 + s.ph) * 0.05 * u, w = s.w * u, h = w * 0.9;
        if (x + w < 0 || x - w > W) continue;
        ctx.fillStyle = `rgba(${th.sil},${0.1 + s.par * 0.4})`;
        ctx.beginPath();
        ctx.moveTo(x - w, y); ctx.lineTo(x + w, y); ctx.lineTo(x + 0.45 * w, y + 0.45 * h);
        ctx.lineTo(x + 0.12 * w, y + h); ctx.lineTo(x - 0.35 * w, y + 0.5 * h);
        ctx.closePath(); ctx.fill();
        for (const d of [-0.45, 0.3]) {
          ctx.beginPath(); ctx.moveTo(x + (d - 0.14) * w, y); ctx.lineTo(x + d * w, y - 0.26 * u); ctx.lineTo(x + (d + 0.14) * w, y); ctx.fill();
        }
        ctx.fillStyle = 'rgba(47,208,201,0.55)';
        ctx.fillRect(x - w, y - 0.03 * u, 2 * w, 0.05 * u);
      }
    }

    function wireCube(cx, cy, size, turn) {
      const ca = Math.cos(turn), sa = Math.sin(turn), ct = Math.cos(0.5), st = Math.sin(0.5);
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const x = i & 1 ? 1 : -1, y = i & 2 ? 1 : -1, z = i & 4 ? 1 : -1;
        const zr = z * ca - x * sa;
        pts.push([cx + (x * ca + z * sa) * size, cy + (y * ct - zr * st) * size]);
      }
      ctx.beginPath();
      for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) {
        if (i & bit) continue;
        ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i | bit][0], pts[i | bit][1]);
      }
      ctx.stroke();
    }

    // A blueprint: drafting grid with wireframe cubes turning in it.
    function drawGrid(th) {
      ctx.lineWidth = 1;
      for (const [cell, alpha] of [[0.6 * u, 0.08], [2.4 * u, 0.16]]) {
        ctx.strokeStyle = `rgba(${th.sil},${alpha})`;
        ctx.beginPath();
        for (let x = -mod(cur * 0.5 * u, cell); x < W; x += cell) { ctx.moveTo(x, 0); ctx.lineTo(x, gy); }
        for (let y = gy; y > 0; y -= cell) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(${th.sil},0.4)`; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      for (const c of CUBES) {
        const x = mod((c.x - cur * 0.25) * u, 26 * u) - 2 * u;
        if (x < -u || x > W + u) continue;
        wireCube(x, gy - c.y * u, c.s * u, time * c.spin + c.ph);
      }
    }

    // A circuit board: traces with a pulse of light running along each.
    function drawCircuit(th) {
      ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const t of TRACES) {
        const x0 = mod((t.x - cur * 0.22) * u, 24 * u) - 4 * u, y0 = gy - t.y * u;
        const rise = Math.abs(t.d) * u;
        const x1 = x0 + t.a * u, x2 = x1 + rise, y2 = y0 + t.d * u, x3 = x2 + t.b * u;
        if (x3 < 0 || x0 > W) continue;
        ctx.strokeStyle = `rgba(${th.sil},0.22)`;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x2, y2); ctx.lineTo(x3, y2); ctx.stroke();
        ctx.strokeStyle = `rgba(${th.sil},0.5)`;
        for (const [nx, ny] of [[x0, y0], [x3, y2]]) { ctx.beginPath(); ctx.arc(nx, ny, 0.035 * u, 0, TAU); ctx.stroke(); }
        const legs = [t.a * u, rise * Math.SQRT2, t.b * u];
        let k = mod(time * 0.35 + t.ph, 1) * (legs[0] + legs[1] + legs[2]), px, py;
        if (k < legs[0]) { px = x0 + k; py = y0; }
        else if ((k -= legs[0]) < legs[1]) { px = x1 + k / Math.SQRT2; py = y0 + Math.sign(t.d) * k / Math.SQRT2; }
        else { px = x2 + k - legs[1]; py = y2; }
        ctx.fillStyle = 'rgba(127,240,234,0.25)'; ctx.beginPath(); ctx.arc(px, py, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#7ff0ea'; ctx.beginPath(); ctx.arc(px, py, 2.4, 0, TAU); ctx.fill();
      }
    }

    const BACKS = {
      city(th) {
        drawStars(th);
        if (th.sun) drawSun(th);
        drawSkyline(th, FAR, 30, 0.12, 0.035);
        if (th.link) drawSeaLink();
        drawSkyline(th, NEAR, 38, 0.3, 0.06);
      },
      hills(th) {
        if (th.sun) drawSun(th);
        drawHills(th);
        if (th.turbines) drawTurbines(th);
      },
      islands(th) { drawStars(th); drawIslands(th); },
      grid: drawGrid,
      circuit: drawCircuit,
      blank() {},
    };

    function drawGround(th) {
      const a = clamp(X(CHASM[0]), -10, W + 10), b = clamp(X(CHASM[1]), -10, W + 10);
      const g = ctx.createLinearGradient(0, gy, 0, H);
      g.addColorStop(0, th.ground[0]); g.addColorStop(1, th.ground[1]);
      ctx.fillStyle = g;
      ctx.fillRect(-10, gy, a + 10, H - gy);
      ctx.fillRect(b, gy, W + 10 - b, H - gy);

      ctx.strokeStyle = th.light ? 'rgba(38,34,98,0.3)' : 'rgba(255,255,255,0.24)'; ctx.lineWidth = 1.5; ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(-10, gy); ctx.lineTo(a, gy); ctx.lineTo(a, gy + 0.9 * u);
      ctx.moveTo(b, gy + 0.9 * u); ctx.lineTo(b, gy); ctx.lineTo(W + 10, gy);
      ctx.stroke();

      if (b > 0 && a < W) {
        const pit = ctx.createLinearGradient(0, gy, 0, H);
        pit.addColorStop(0, 'rgba(8,7,34,0)'); pit.addColorStop(1, 'rgba(8,7,34,0.85)');
        ctx.fillStyle = pit;
        ctx.fillRect(a, gy, b - a, H - gy);
      }

      // Lane ticks, so the ground reads as moving.
      ctx.strokeStyle = 'rgba(47,208,201,0.3)'; ctx.lineWidth = 2;
      ctx.beginPath();
      const firstTick = Math.floor(cur - rx / span) - 1, lastTick = Math.ceil(cur + (W - rx) / span) + 1;
      for (let wx = firstTick; wx <= lastTick; wx++) {
        if (wx + 0.2 > CHASM[0] && wx < CHASM[1]) continue;
        ctx.moveTo(X(wx), gy + 0.1 * u); ctx.lineTo(X(wx + 0.2), gy + 0.1 * u);
      }
      ctx.stroke();

      // Two slabs hanging in the chasm.
      for (const [wx, ph] of [[35.4, 0], [36.6, 2]]) {
        const x = X(wx), y = gy + (0.16 + Math.sin(time * 1.4 + ph) * 0.04) * u;
        if (x < -u || x > W + u) continue;
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.strokeStyle = 'rgba(47,208,201,0.55)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.rect(x - 0.27 * u, y, 0.54 * u, 0.11 * u); ctx.fill(); ctx.stroke();
      }
    }

    // Each world is painted only between the hoops that bound it, so the next one
    // really is on the far side of the hoop.
    function drawWorlds() {
      let left = -Infinity;
      for (const [i, th] of THEMES.entries()) {
        const right = i < PORTALS.length ? X(PORTALS[i]) : Infinity;
        const a = Math.max(0, left), b = Math.min(W, right);
        if (b > a) {
          ctx.save();
          ctx.beginPath(); ctx.rect(a, 0, b - a, H); ctx.clip();
          const sky = ctx.createLinearGradient(0, 0, 0, gy);
          sky.addColorStop(0, th.sky[0]); sky.addColorStop(0.55, th.sky[1]); sky.addColorStop(1, th.sky[2]);
          ctx.fillStyle = sky; ctx.fillRect(a, 0, b - a, H);
          BACKS[th.back](th);
          drawGround(th);
          ctx.restore();
        }
        left = right;
      }
    }

    /* ----- Hoops ----- */

    // A wall of rising wind along the seam between two worlds.
    function drawCurtain(px, i) {
      const x = X(px), w = 0.42 * u;
      if (x < -u || x > W + u) return;
      const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
      for (const [stop, alpha] of [[0, 0], [0.4, 0.22], [0.5, 0.85], [0.6, 0.22], [1, 0]]) g.addColorStop(stop, `rgba(234,255,251,${alpha})`);
      ctx.fillStyle = g; ctx.fillRect(x - w, 0, w * 2, H);
      ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      for (let k = 0; k < 5; k++) {
        ctx.strokeStyle = `rgba(${k % 2 ? '47,208,201' : '234,255,251'},${0.55 - k * 0.07})`;
        ctx.beginPath();
        for (let y = H; y >= -20; y -= 14) {
          ctx.lineTo(x + Math.sin(y / (60 + k * 13) + time * (1.6 + k * 0.3) + k * 2 + i) * w * (0.25 + 0.12 * k), y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(234,255,251,0.75)';
      for (let k = 0; k < 10; k++) {
        const y = H - mod(time * (90 + k * 23) + k * 137, H + 40);
        ctx.beginPath(); ctx.arc(x + Math.sin(y / 50 + k) * w * 0.6, y, 1.6, 0, TAU); ctx.fill();
      }
    }

    // The hoop is drawn in two halves, far rim before the runner and near rim after, so he passes through it.
    function drawHoop(px, i, nearRim) {
      const x = X(px);
      if (x < -u || x > W + u) return;
      const ry = (px === GOAL ? 1.05 : 0.9) * u, cy = gy - ry * 0.98;
      const from = nearRim ? Math.PI / 2 : -Math.PI / 2;
      const pulse = 0.5 + 0.5 * Math.sin(time * 3 + i);
      ctx.lineCap = 'round';
      for (const [width, colour] of [[0.12 * u, `rgba(47,208,201,${0.2 + 0.14 * pulse})`], [0.05 * u, '#2fd0c9'], [0.018 * u, '#eafffb']]) {
        ctx.strokeStyle = colour; ctx.lineWidth = width;
        ctx.beginPath(); ctx.ellipse(x, cy, ry * 0.3, ry, 0, from, from + Math.PI); ctx.stroke();
      }
      if (!nearRim) return;
      // Signpost: where this hoop leads.
      const label = (i + 1 < panels.length ? panels[i + 1].dataset.label : 'Contact').toUpperCase();
      ctx.font = `${Math.max(10, 0.1 * u)}px Questrial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width + 0.24 * u, th = 0.22 * u, ty = cy - ry - 0.3 * u;
      ctx.fillStyle = 'rgba(20,18,66,0.88)'; ctx.fillRect(x - tw / 2, ty - th / 2, tw, th);
      ctx.strokeStyle = '#2fd0c9'; ctx.lineWidth = 1.5; ctx.strokeRect(x - tw / 2, ty - th / 2, tw, th);
      ctx.fillStyle = '#eafffb'; ctx.fillText(label, x, ty + 1);
    }

    function drawIcon([wx, height, kind], n) {
      const x = X(wx);
      if (x < -u || x > W + u) return;
      const edge = Math.min(rx + 4.6 * u, W * 0.9);
      const k = smooth(edge, edge - 1.4 * u, x);
      if (k <= 0) return;
      const size = 0.27 * u * (0.4 + 0.6 * k) * (1 + Math.sin(k * Math.PI) * 0.18);
      const y = gy - height * u + Math.sin(time * 1.5 + n) * 0.04 * u;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((k - 1) * 0.6 + Math.sin(time * 1.1 + n) * 0.04);
      ctx.globalAlpha = k;
      roundedRect(ctx, -size, -size, size * 2, size * 2, size * 0.5);
      ctx.fillStyle = 'rgba(20,18,66,0.72)'; ctx.fill();
      ctx.strokeStyle = 'rgba(47,208,201,0.25)'; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = '#2fd0c9'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.scale(size * 0.6, size * 0.6);
      ctx.strokeStyle = ctx.fillStyle = '#eafffb'; ctx.lineWidth = 0.14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      glyphs[kind]();
      ctx.restore();
      if (k < 1) {
        // The gust that uncovers it, and the ring it leaves.
        const head = x - 1.2 * u + k * 2.4 * u;
        const g = ctx.createLinearGradient(head - 1.2 * u, 0, head, 0);
        g.addColorStop(0, 'rgba(47,208,201,0)'); g.addColorStop(1, `rgba(234,255,251,${1 - k})`);
        ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(head - 1.2 * u, y); ctx.lineTo(head, y); ctx.stroke();
        ctx.strokeStyle = `rgba(127,240,234,${0.7 * (1 - k)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, size * (1 + k * 1.2), 0, TAU); ctx.stroke();
      }
    }

    // The burst as he goes through: a flash, and gusts tearing across the whole screen.
    function drawGust() {
      if (!gust) return;
      const k = (time - gust.at) / 0.75;
      if (k >= 1) { gust = null; return; }
      ctx.fillStyle = `rgba(234,255,251,${0.24 * (1 - k) ** 2})`;
      ctx.fillRect(0, 0, W, H);
      ctx.lineCap = 'round';
      for (const s of GUSTS) {
        const kk = clamp((k - s.delay) / (1 - s.delay), 0, 1);
        if (kk <= 0) continue;
        const len = s.len * u * (1.2 - kk * 0.6);
        let head = -len + (1 - (1 - kk) ** 3) * (W + len * 2);
        if (gust.dir < 0) head = W - head;
        const tail = head - gust.dir * len, y = s.y * H;
        const g = ctx.createLinearGradient(tail, 0, head, 0);
        g.addColorStop(0, 'rgba(47,208,201,0)'); g.addColorStop(1, `rgba(234,255,251,${0.9 * (1 - kk)})`);
        ctx.strokeStyle = g; ctx.lineWidth = s.width;
        ctx.beginPath(); ctx.moveTo(tail, y); ctx.lineTo(head, y); ctx.stroke();
      }
    }

    const seen = (wx, margin = 2) => { const x = X(wx); return x > -margin * u && x < W + margin * u; };

    function drawGate(wx, label, chequered) {
      if (!seen(wx)) return;
      const x = X(wx), h = 1.16 * u, half = 0.56 * u;
      ctx.strokeStyle = 'rgba(223,227,255,0.55)'; ctx.lineWidth = 0.035 * u; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - half, gy); ctx.lineTo(x - half, gy - h);
      ctx.moveTo(x + half, gy); ctx.lineTo(x + half, gy - h);
      ctx.stroke();
      const bh = 0.2 * u, by = gy - h;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(x - half, by, half * 2, bh);
      if (chequered) {
        const n = 10, cw = half * 2 / n;
        ctx.fillStyle = 'rgba(243,245,255,0.7)';
        for (let i = 0; i < n; i++) for (let r = 0; r < 2; r++) {
          if ((i + r) % 2 === 0) ctx.fillRect(x - half + i * cw, by + r * bh / 2, cw, bh / 2);
        }
      } else {
        ctx.fillStyle = 'rgba(243,245,255,0.85)';
        ctx.font = `${0.115 * u}px Questrial, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, x, by + bh / 2 + 1);
      }
      ctx.strokeStyle = 'rgba(47,208,201,0.7)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(x - half, by, half * 2, bh);
    }

    // A pennant on a pole, blown the way the wind is going.
    function drawPennant(wx, height, ph) {
      if (!seen(wx)) return;
      const x = X(wx), topY = gy - height * u, len = 0.5 * u, n = 8;
      ctx.strokeStyle = 'rgba(223,227,255,0.5)'; ctx.lineWidth = 0.025 * u; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, topY); ctx.stroke();
      const wave = i => Math.sin(i * 0.9 - time * 6 + ph) * 0.045 * u * (i / n);
      ctx.fillStyle = 'rgba(47,208,201,0.85)';
      ctx.beginPath(); ctx.moveTo(x, topY);
      for (let i = 1; i <= n; i++) ctx.lineTo(x + len * i / n, topY + 0.11 * u * (i / n) + wave(i));
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(x + len * i / n, topY + 0.22 * u - 0.11 * u * (i / n) + wave(i));
      ctx.closePath(); ctx.fill();
    }

    function drawHurdle(wx) {
      if (!seen(wx)) return;
      const x = X(wx), h = 0.5 * u, half = 0.22 * u, bar = 0.1 * u;
      ctx.strokeStyle = '#dfe3ff'; ctx.lineWidth = 0.03 * u; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - half, gy); ctx.lineTo(x - half, gy - h);
      ctx.moveTo(x + half, gy); ctx.lineTo(x + half, gy - h);
      ctx.stroke();
      ctx.fillStyle = '#f3f5ff';
      ctx.fillRect(x - half - 0.05 * u, gy - h - bar / 2, half * 2 + 0.1 * u, bar);
      ctx.fillStyle = '#02a09c';
      for (const d of [-0.6, 0, 0.6]) ctx.fillRect(x + d * half - 0.035 * u, gy - h - bar / 2, 0.07 * u, bar);
    }

    function drawCrate(x, y, s) {
      const d = s * 0.35;
      ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(47,208,201,0.9)';
      ctx.fillStyle = 'rgba(47,208,201,0.5)';
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + d, y - s - d); ctx.lineTo(x + s + d, y - s - d); ctx.lineTo(x + s, y - s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(47,208,201,0.22)';
      ctx.beginPath(); ctx.moveTo(x + s, y - s); ctx.lineTo(x + s + d, y - s - d); ctx.lineTo(x + s + d, y - d); ctx.lineTo(x + s, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(38,34,98,0.9)';
      ctx.beginPath(); ctx.rect(x, y - s, s, s); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill(); ctx.stroke();
    }
    function drawCrates(wx) {
      if (!seen(wx)) return;
      const s = 0.42 * u, x = X(wx) - s * 1.1;
      drawCrate(x + s, gy, s);
      drawCrate(x, gy, s);
      drawCrate(x + s * 0.5, gy - s, s);
    }

    function drawGear(cx, cy, r, teeth, rot) {
      ctx.beginPath();
      for (let i = 0; i < teeth; i++) {
        const a = rot + i / teeth * TAU, w = TAU / teeth;
        for (const [da, rr] of [[0, 0.8], [0.14, 1], [0.36, 1], [0.5, 0.8]]) {
          ctx.lineTo(cx + Math.cos(a + da * w) * r * rr, cy + Math.sin(a + da * w) * r * rr);
        }
      }
      ctx.closePath();
      ctx.moveTo(cx + r * 0.3, cy); ctx.arc(cx, cy, r * 0.3, 0, TAU, true);
      ctx.fillStyle = 'rgba(38,34,98,0.9)'; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
      ctx.strokeStyle = 'rgba(47,208,201,0.9)'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
    }
    function drawGears(wx) {
      if (!seen(wx)) return;
      const x = X(wx), rot = time * 0.5 + cur * 0.25;
      drawGear(x + 0.38 * u, gy - 0.29 * u, 0.27 * u, 6, -rot * 10 / 6 + 0.2);
      drawGear(x - 0.25 * u, gy - 0.45 * u, 0.45 * u, 10, rot);
    }

    // Sparks strung along the wind's line; each one pops as he reaches it.
    function drawOrbs() {
      for (const wx of ORBS) {
        const x = X(wx);
        if (x < -u || x > W + u) continue;
        const y = gy - (0.62 + liftAt(wx)) * u + Math.sin(time * 2.4 + wx * 1.7) * 0.03 * u;
        const passed = cur - wx;
        if (passed < 0) {
          ctx.fillStyle = 'rgba(47,208,201,0.2)';
          ctx.beginPath(); ctx.arc(x, y, 0.09 * u, 0, TAU); ctx.fill();
          ctx.fillStyle = '#7ff0ea';
          ctx.beginPath(); ctx.arc(x, y, 0.04 * u, 0, TAU); ctx.fill();
        } else if (passed < 0.6) {
          const k = passed / 0.6;
          ctx.strokeStyle = `rgba(127,240,234,${0.8 * (1 - k)})`; ctx.lineWidth = 2 * (1 - k) + 0.5;
          ctx.beginPath(); ctx.arc(x, y, (0.05 + 0.2 * k) * u, 0, TAU); ctx.stroke();
        }
      }
    }

    function drawMotes() {
      const span = W + 240;
      ctx.lineCap = 'round';
      for (const m of MOTES) {
        const x = mod(m.s * span + flow * m.speed * 1.3, span) - 120;
        const y = guideAt(x) + m.off * u + Math.sin(time * 1.3 + m.ph) * 0.06 * u;
        const fade = Math.min(1, (x + 120) / 200, (W + 120 - x) / 200);
        if (fade <= 0) continue;
        if (m.leaf) {
          ctx.save(); ctx.translate(x, y); ctx.rotate(time * 2 + m.ph);
          ctx.fillStyle = `rgba(47,208,201,${0.7 * fade})`;
          ctx.beginPath(); ctx.ellipse(0, 0, 0.035 * u, 0.015 * u, 0, 0, TAU); ctx.fill();
          ctx.restore();
        } else {
          ctx.strokeStyle = `rgba(220,255,250,${m.alpha * fade})`; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + m.len * u, y + (guideAt(x + m.len * u) - guideAt(x)) * 0.6); ctx.stroke();
        }
      }
    }

    /* ----- Page state ----- */

    function setActive(idx) {
      activeIdx = idx;
      panels.forEach((p, i) => {
        p.classList.toggle('is-active', i === idx);
        p.classList.toggle('is-past', i !== idx && cur > i * SPACING);
      });
      dots.forEach((d, i) => {
        d.classList.toggle('is-current', i === idx);
        if (i === idx) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
      });
      // Between panels the header keeps whatever it was last showing.
      if (idx < 0) return;
      const hash = idx === 1 ? '#about' : idx >= 2 && idx <= 5 ? '#services' : '';
      for (const a of navLinks) {
        const here = pagePath(a.pathname) === pagePath(location.pathname);
        a.classList.toggle('active', here && (a.hash ? a.hash === hash : idx === 0));
      }
    }

    function goTo(idx) {
      window.scrollTo(0, top + STOPS[idx] / END * scrollLen);
      first = true;
    }
    // Jumps along the run happen behind the wipe: the wind picks you up and sets you down.
    const travel = idx => wipe.across(() => goTo(idx));
    const hashIndex = hash => (hash.length > 1 ? panels.findIndex(p => p.id === hash.slice(1)) : -1);

    const dotNav = document.createElement('nav');
    dotNav.className = 'journey-dots';
    dotNav.setAttribute('aria-label', 'Sections');
    const dots = panels.map((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', p.dataset.label);
      const tip = document.createElement('span');
      tip.textContent = p.dataset.label;
      tip.setAttribute('aria-hidden', 'true');
      b.appendChild(tip);
      b.addEventListener('click', () => travel(i));
      dotNav.appendChild(b);
      return b;
    });
    stage.appendChild(dotNav);

    document.addEventListener('click', e => {
      const a = e.target.closest('a[href*="#"]');
      if (!live || !a || pagePath(a.pathname) !== pagePath(location.pathname)) return;
      const i = hashIndex(a.hash);
      if (i < 0) return;
      e.preventDefault();
      history.pushState(null, '', a.hash);
      travel(i);
    });
    // Tabbing into a panel that is not on screen brings the run to it.
    panels.forEach((p, i) => p.addEventListener('focusin', () => {
      if (live && activeIdx !== i) goTo(i);
    }));

    /* ----- Frame ----- */

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      time += dt;

      const target = clamp((window.scrollY - top) / scrollLen, 0, 1) * END;
      const prev = cur;
      cur = first ? target : cur + (target - cur) * ease(dt, 7);
      if (Math.abs(target - cur) < 0.0005) cur = target;
      const dx = first ? 0 : cur - prev;
      vel += (dx / dt - vel) * ease(dt, 10);
      phase += Math.abs(dx) * (span / u) / CYCLE;
      const moving = Math.abs(vel) > 0.25;
      runAmt += ((moving ? 1 : 0) - runAmt) * ease(dt, moving ? 14 : 6);
      // Scroll back up and he turns to run back; once he stops he faces the wind's way again.
      facing += ((vel < -0.4 ? -1 : 1) - facing) * ease(dt, 12);
      flow += dt * (140 + Math.abs(vel) * u * 0.3);

      // The last panel stays up until the final hoop, and the white beyond it, is close.
      const near = Math.min(Math.round(cur / SPACING), panels.length - 1);
      const idx = (cur > LENGTH ? cur < GOAL - 2.2 : Math.abs(cur - near * SPACING) <= REACH) ? near : -1;
      if (idx !== activeIdx) setActive(idx);

      if (!first) {
        for (const px of PORTALS) {
          if ((prev < px) === (cur < px)) continue;
          gust = { at: time, dir: cur > prev ? 1 : -1 };
          if (px === GOAL && cur > prev) wipe.leaveTo(contactUrl);
        }
      }

      // The wind takes the line the runner is about to take.
      for (let i = 0; i < guide.length; i++) {
        guide[i] = gy - (0.6 + liftAt(cur + (i * STEP - PAD - rx) / span)) * u;
      }
      const blur = Math.round(0.4 * u / STEP);
      soften(guide, scratch, blur);
      soften(scratch, guide, blur);
      const wind = { W, u, t: time, flow, guide, focus: rx / W, rgb: '47,208,201', glow: '234,255,251' };

      ctx.clearRect(0, 0, W, H);
      drawWorlds();
      for (const [i, px] of PORTALS.entries()) drawCurtain(px, i);
      for (const r of RIBBONS) if (!r.front) strokeRibbon(ctx, r, wind);
      for (const [i, px] of PORTALS.entries()) drawHoop(px, i, false);
      ICONS.forEach(drawIcon);
      drawGate(-0.25, 'START');
      for (const [i, wx] of [22.6, 24, 25.4].entries()) drawPennant(wx, 1.0 + i * 0.14, i * 1.3);
      drawGate(LENGTH - 0.9, '', true);
      drawPennant(LENGTH + 1.3, 1.5, 0.7);
      drawHurdle(JUMPS[0].x);
      drawHurdle(JUMPS[1].x);
      drawHurdle(JUMPS[5].x);
      drawCrates(JUMPS[3].x);
      drawGears(JUMPS[4].x);
      drawOrbs();
      drawRunner(dt);
      for (const [i, px] of PORTALS.entries()) drawHoop(px, i, true);
      for (const r of RIBBONS) if (r.front) strokeRibbon(ctx, r, wind);
      drawMotes();
      drawGust();
      first = false;
    }

    function start() {
      if (!raf && live && visible) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }
    function stop() {
      cancelAnimationFrame(raf); raf = 0;
    }

    const tallEnough = window.matchMedia('(min-height: 300px)');
    function setLive() {
      const want = !reducedMotion.matches && tallEnough.matches;
      if (want === live) return;
      live = want;
      journey.classList.toggle('is-live', live);
      panels.forEach(p => {
        p.classList.toggle('wind-armed', live);
        if (!live) { p.classList.remove('is-active', 'is-past'); p.style.transform = p.style.width = p.style.maxWidth = ''; }
      });
      if (live) {
        measure();
        activeIdx = -2;
        start();
      } else {
        stop();
        journey.style.height = '';
      }
    }

    watchVisible(journey, seen => {
      visible = seen;
      if (visible) start(); else stop();
    });
    watchSize(stage, () => { if (live) measure(); });
    onMedia(reducedMotion, setLive);
    onMedia(tallEnough, setLive);
    // Web fonts change how tall the copy is.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (live) fitPanels(); });
    window.addEventListener('hashchange', () => {
      const i = hashIndex(location.hash);
      if (live && i >= 0) travel(i);
    });

    setLive();
    const startAt = hashIndex(location.hash);
    if (live && startAt > 0) {
      // The browser also scrolls to the hash by itself, to wherever the pinned panel happens to
      // sit, and does so late. Go to the right place now and again once the page has loaded.
      requestAnimationFrame(() => goTo(startAt));
      window.addEventListener('load', () => setTimeout(() => { if (live) goTo(startAt); }, 0));
    }
  }

  /* ---------- Contact: wind behind the heading ---------- */

  function initAmbient(canvas) {
    const ctx = canvas.getContext('2d');
    const block = canvas.parentElement;
    prepareText(block);
    if (reducedMotion.matches) return;

    block.classList.add('wind-armed');
    requestAnimationFrame(() => requestAnimationFrame(() => block.classList.add('is-active')));

    let W = 0, H = 0, guide = new Float32Array(0), time = 0, flow = 0, last = 0, raf = 0;
    function measure() {
      ({ W, H } = sizeCanvas(canvas, ctx));
      guide = new Float32Array(Math.ceil((W + PAD * 2) / STEP) + 1).fill(H * 0.5);
    }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now; time += dt; flow += dt * 110;
      ctx.clearRect(0, 0, W, H);
      const wind = { W, u: Math.min(110, H * 0.45), t: time, flow, guide, focus: 0.45, rgb: '2,160,156', glow: '2,160,156' };
      for (const r of RIBBONS) strokeRibbon(ctx, r, wind);
    }
    watchSize(canvas, measure);
    watchVisible(canvas, seen => {
      cancelAnimationFrame(raf); raf = 0;
      if (seen) { last = performance.now(); raf = requestAnimationFrame(frame); }
    });
    measure();
  }

  /* ---------- Projects: the building site ---------- */

  function initSite(canvas) {
    const ctx = canvas.getContext('2d');
    const copy = document.querySelector('.site-copy');
    const still = reducedMotion.matches;
    prepareText(copy);
    if (!still) {
      copy.classList.add('wind-armed');
      requestAnimationFrame(() => requestAnimationFrame(() => copy.classList.add('is-active')));
    }

    const glyphs = makeGlyphs(ctx);
    const rand = rng(5);
    const STARS = Array.from({ length: 60 }, () => ({ x: rand(), y: rand() * 0.6, r: 0.5 + rand() * 1.1, ph: rand() * TAU }));
    const SKY = makeSkyline(31, 34, 0.4, 1.6);
    const YELLOW = '#ffc857';
    let W = 0, H = 0, u = 100, gy = 0, guide = new Float32Array(0), time = 0, flow = 0, last = 0, raf = 0;

    const seg = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };

    function drawBackdrop() {
      const sky = ctx.createLinearGradient(0, 0, 0, gy);
      sky.addColorStop(0, '#141242'); sky.addColorStop(0.55, '#262262'); sky.addColorStop(1, '#1b3a66');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      for (const s of STARS) {
        ctx.fillStyle = `rgba(190,200,255,${0.25 + 0.2 * Math.sin(time * 1.3 + s.ph)})`;
        ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = 'rgba(190,200,255,0.055)';
      for (const b of SKY) ctx.fillRect(b.x * u, gy - b.h * u, b.w * u + 0.5, b.h * u);
      const g = ctx.createLinearGradient(0, gy, 0, H);
      g.addColorStop(0, '#0f0e3c'); g.addColorStop(1, '#090822');
      ctx.fillStyle = g; ctx.fillRect(0, gy, W, H - gy);
      ctx.strokeStyle = 'rgba(255,255,255,0.24)'; ctx.lineWidth = 1.5; seg(0, gy, W, gy);
    }

    // Scaffolding round the thing being built: a game, its outline still being drawn.
    function drawScaffold(cx) {
      const cell = 0.7 * u, topY = gy - 3 * cell;
      ctx.strokeStyle = 'rgba(223,227,255,0.5)'; ctx.lineWidth = Math.max(1.5, 0.025 * u); ctx.lineCap = 'round';
      ctx.beginPath();
      for (const c of [-1, 0, 1]) { ctx.moveTo(cx + c * cell, gy); ctx.lineTo(cx + c * cell, topY - 0.15 * u); }
      for (let r = 1; r <= 3; r++) { ctx.moveTo(cx - cell * 1.1, gy - r * cell); ctx.lineTo(cx + cell * 1.1, gy - r * cell); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(223,227,255,0.22)';
      ctx.beginPath();
      for (let r = 0; r < 3; r++) for (const c of [-1, 0]) {
        const flip = (r + c) % 2 === 0;
        ctx.moveTo(cx + (c + (flip ? 0 : 1)) * cell, gy - r * cell); ctx.lineTo(cx + (c + (flip ? 1 : 0)) * cell, gy - (r + 1) * cell);
      }
      ctx.stroke();

      const size = 0.52 * u;
      ctx.save();
      ctx.translate(cx, gy - 1.5 * cell + Math.sin(time * 1.2) * 0.02 * u);
      roundedRect(ctx, -size, -size, size * 2, size * 2, size * 0.45);
      ctx.fillStyle = 'rgba(20,18,66,0.86)'; ctx.fill();
      ctx.strokeStyle = '#2fd0c9'; ctx.lineWidth = 2;
      ctx.setLineDash([0.16 * u, 0.1 * u]); ctx.lineDashOffset = -time * 0.3 * u; ctx.stroke(); ctx.setLineDash([]);
      ctx.scale(size * 0.6, size * 0.6);
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(time * 2);
      ctx.strokeStyle = ctx.fillStyle = '#eafffb'; ctx.lineWidth = 0.13; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      glyphs.gamepad();
      ctx.restore();
    }

    function drawCrane(mx) {
      const topY = gy - 3.3 * u, jibY = topY + 0.3 * u, half = 0.1 * u;
      ctx.strokeStyle = YELLOW; ctx.globalAlpha = 0.85; ctx.lineWidth = Math.max(1.5, 0.028 * u); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(mx - half, gy); ctx.lineTo(mx - half, topY); ctx.lineTo(mx + half, topY); ctx.lineTo(mx + half, gy);
      for (let y = gy, i = 0; y > jibY; y -= half * 2, i++) { ctx.moveTo(mx + (i % 2 ? half : -half), y); ctx.lineTo(mx + (i % 2 ? -half : half), y - half * 2); }
      ctx.moveTo(mx + 0.7 * u, jibY); ctx.lineTo(mx - 2.8 * u, jibY);
      ctx.moveTo(mx + 0.7 * u, jibY); ctx.lineTo(mx, topY - 0.3 * u); ctx.lineTo(mx - 2.8 * u, jibY);
      ctx.stroke();
      ctx.fillStyle = YELLOW; ctx.fillRect(mx + 0.45 * u, jibY, 0.3 * u, 0.22 * u);
      // The load swings a little in the wind.
      const tx = mx - (1.6 + 0.5 * Math.sin(time * 0.35)) * u;
      const drop = (1.0 + 0.25 * Math.sin(time * 0.5)) * u, sway = Math.sin(time * 1.3) * 0.07 * u;
      ctx.lineWidth = 1.5; seg(tx, jibY, tx + sway, jibY + drop);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(47,208,201,0.5)'; ctx.strokeStyle = '#2fd0c9';
      ctx.beginPath(); ctx.rect(tx + sway - 0.16 * u, jibY + drop, 0.32 * u, 0.26 * u); ctx.fill(); ctx.stroke();
    }

    function drawSign(sx) {
      const w = 1.5 * u, h = 0.66 * u, x = sx - w / 2, y = gy - 1.3 * u;
      ctx.strokeStyle = 'rgba(223,227,255,0.55)'; ctx.lineWidth = 0.035 * u; ctx.lineCap = 'round';
      seg(sx - 0.55 * u, gy, sx - 0.55 * u, y + h); seg(sx + 0.55 * u, gy, sx + 0.55 * u, y + h);
      ctx.fillStyle = 'rgba(20,18,66,0.94)'; ctx.fillRect(x, y, w, h);
      // Hazard tape along the top.
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, 0.11 * u); ctx.clip();
      ctx.fillStyle = YELLOW; ctx.fillRect(x, y, w, 0.11 * u);
      ctx.strokeStyle = '#141242'; ctx.lineWidth = 0.06 * u; ctx.lineCap = 'butt';
      for (let d = -0.2 * u; d < w + 0.2 * u; d += 0.17 * u) seg(x + d, y + 0.15 * u, x + d + 0.14 * u, y - 0.04 * u);
      ctx.restore();
      ctx.strokeStyle = YELLOW; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#f3f5ff'; ctx.font = `${0.155 * u}px Questrial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('COMING SOON', sx, y + 0.32 * u);
      // A progress bar that never quite gets there.
      const bw = 1.1 * u, by = y + 0.49 * u;
      ctx.strokeStyle = 'rgba(223,227,255,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(sx - bw / 2, by, bw, 0.07 * u);
      ctx.fillStyle = '#2fd0c9'; ctx.fillRect(sx - bw / 2, by, bw * (0.58 + 0.2 * Math.sin(time * 0.6)), 0.07 * u);
    }

    function drawCone(x) {
      ctx.fillStyle = YELLOW;
      ctx.beginPath(); ctx.moveTo(x - 0.1 * u, gy); ctx.lineTo(x, gy - 0.32 * u); ctx.lineTo(x + 0.1 * u, gy); ctx.closePath(); ctx.fill();
      ctx.fillRect(x - 0.15 * u, gy - 0.035 * u, 0.3 * u, 0.035 * u);
      ctx.strokeStyle = '#f3f5ff'; ctx.lineWidth = 0.04 * u; ctx.lineCap = 'butt';
      seg(x - 0.055 * u, gy - 0.14 * u, x + 0.055 * u, gy - 0.14 * u);
    }

    // The worker: the runner's cousin in a hard hat and vest, waving.
    function drawWorker(x) {
      const wave = Math.sin(time * 7);
      const s = skeleton([5, 3, -5, 3, 152 + wave * 6, 12 + wave * 26, 8, 12, 0]);
      const hipY = gy - (0.02 + s.reach + Math.sin(time * 2) * 0.006) * u;
      const P = (px, py) => [x + px * u, hipY + py * u];
      const limb = (colour, width, ...pts) => {
        ctx.strokeStyle = colour; ctx.lineWidth = width * u;
        ctx.beginPath(); pts.forEach((pt, i) => (i ? ctx.lineTo(...P(...pt)) : ctx.moveTo(...P(...pt)))); ctx.stroke();
      };
      ctx.fillStyle = 'rgba(4,4,24,0.3)';
      ctx.beginPath(); ctx.ellipse(x, gy + 0.02 * u, 0.24 * u, 0.03 * u, 0, 0, TAU); ctx.fill();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const leg = (l, colour) => { limb(colour, 0.075, [0, 0], [l.kx, l.ky], [l.ax, l.ay]); limb('#2fd0c9', 0.062, [l.ax, l.ay], [l.tx, l.ty]); };
      limb('#8f97cf', 0.06, [s.sx, s.sy], [s.armB.ex, s.armB.ey], [s.armB.hx, s.armB.hy]);
      leg(s.legB, '#8f97cf');
      limb('#f3f5ff', 0.13, [0, 0], [s.sx, s.sy]);
      limb(YELLOW, 0.13, [s.sx * 0.25, s.sy * 0.25], [s.sx * 0.85, s.sy * 0.85]);
      limb('#f3f5ff', 0.03, [s.sx * 0.55 - 0.06, s.sy * 0.55], [s.sx * 0.55 + 0.06, s.sy * 0.55]);
      const [hx, hy] = P(s.hx, s.hy), r = LIMB.head * u;
      ctx.fillStyle = '#f3f5ff'; ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU); ctx.fill();
      ctx.fillStyle = YELLOW; ctx.beginPath(); ctx.arc(hx, hy - r * 0.15, r * 1.12, Math.PI, TAU); ctx.fill();
      ctx.strokeStyle = YELLOW; ctx.lineWidth = 0.03 * u; seg(hx - r * 1.2, hy - r * 0.15, hx + r * 1.6, hy - r * 0.15);
      leg(s.legA, '#f3f5ff');
      limb('#f3f5ff', 0.06, [s.sx, s.sy], [s.armA.ex, s.armA.ey], [s.armA.hx, s.armA.hy]);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      drawBackdrop();
      const worker = W * 0.2, sign = worker + 1.25 * u;
      const site = Math.max(W * 0.64, sign + 2 * u), crane = Math.min(site + 1.7 * u, W - 0.5 * u);
      drawCrane(crane);
      drawScaffold(site);
      drawSign(sign);
      drawCone(sign + 1.0 * u); drawCone(site - 1.15 * u); drawCone(site + 1.1 * u);
      const wind = { W, u, t: time, flow, guide, focus: 0.3, rgb: '47,208,201', glow: '234,255,251' };
      for (const r of RIBBONS) if (!r.front) strokeRibbon(ctx, r, wind);
      drawWorker(worker);
      for (const r of RIBBONS) if (r.front) strokeRibbon(ctx, r, wind);
    }

    function measure() {
      ({ W, H } = sizeCanvas(canvas, ctx));
      // The scene lives in the room the copy's bottom padding leaves under it, so the two never meet.
      const room = parseFloat(getComputedStyle(copy).paddingBottom);
      u = Math.min(room * 0.84 / 3.65, W * 0.2, 200);
      gy = H - room * 0.14;
      guide = new Float32Array(Math.ceil((W + PAD * 2) / STEP) + 1).fill(gy - 0.7 * u);
      draw();
    }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now; time += dt; flow += dt * 130;
      draw();
    }
    watchSize(canvas, measure);
    if (!still) {
      watchVisible(canvas, seen => {
        cancelAnimationFrame(raf); raf = 0;
        if (seen) { last = performance.now(); raf = requestAnimationFrame(frame); }
      });
    }
    measure();
  }

  wipe.arrive();
  const journey = document.getElementById('journey');
  if (journey) initJourney(journey);
  const ambient = document.querySelector('.wind-ambient');
  if (ambient) initAmbient(ambient);
  const site = document.querySelector('.site-canvas');
  if (site) initSite(site);
})();
