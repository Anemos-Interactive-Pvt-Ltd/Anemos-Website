/* Anemos Interactive — the wind run.
 *
 * Home page: the page scroll drives a runner along an obstacle course drawn on
 * a canvas. Wind ribbons trace the path he is about to take, and each block of
 * copy is blown in as he reaches its stretch of the course.
 * Contact page: the same ribbons, drifting quietly behind the heading.
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
    const STOPS = [0, 8.6, 21.5, 33.6, 45.8, 57.7, LENGTH]; // where the dots and nav links land
    const JUMPS = [
      { x: 10.6, hw: 1.15, h: 0.8 },    // hurdle
      { x: 13.4, hw: 1.15, h: 0.8 },    // hurdle
      { x: 36.0, hw: 1.8, h: 1.0 },     // chasm
      { x: 48.0, hw: 1.6, h: 1.25 },    // crates
      { x: 60.0, hw: 1.75, h: 1.25 },   // gears
    ];
    const CHASM = [34.7, 37.3];
    const CYCLE = 1.5;                                      // ground covered by one full stride cycle

    const ORBS = [];
    for (const j of JUMPS) for (const d of [-0.5, 0, 0.5]) ORBS.push(j.x + d * j.hw);
    for (const x of [5, 6, 7, 18, 19, 20, 22.5, 24, 25.5, 29.5, 30.5, 31.5, 41, 42, 43, 53, 54, 55, 65, 66, 67]) ORBS.push(x);

    const rand = rng(7);
    const STARS = Array.from({ length: 70 }, () => ({ x: rand(), y: rand() * 0.62, r: 0.5 + rand() * 1.1, ph: rand() * TAU }));
    const MOTES = Array.from({ length: 28 }, (_, i) => ({
      s: rand(), off: -0.9 + rand() * 1.5, speed: 0.6 + rand() * 1.2,
      len: 0.08 + rand() * 0.2, alpha: 0.15 + rand() * 0.4, leaf: i % 5 === 0, ph: rand() * TAU,
    }));
    function makeSkyline(seed, period, minH, maxH) {
      const r = rng(seed), out = [];
      for (let x = 0; x < period;) {
        const w = 0.35 + r() * 0.6;
        out.push({ x, w, h: minH + r() * (maxH - minH), cap: r() });
        x += w + (r() < 0.2 ? 0.15 + r() * 0.3 : 0);
      }
      return out;
    }
    const FAR = makeSkyline(11, 30, 0.5, 1.3);
    const NEAR = makeSkyline(23, 38, 0.4, 1.8);

    // Scene state
    let W = 0, H = 0, u = 100, gy = 0, rx = 0;
    let guide = new Float32Array(0), scratch = new Float32Array(0);
    let top = 0, scrollLen = 1;
    let cur = 0, vel = 0, phase = 0, runAmt = 0, facing = 1;
    let flow = 0, time = 0, last = 0, raf = 0;
    let live = false, visible = true, first = true;
    let activeIdx = -2, lastP = -1;
    const scarf = Array.from({ length: 8 }, () => ({ x: 0, y: 0, px: 0, py: 0 }));

    const X = wx => rx + (wx - cur) * u;

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
      u = Math.min(H * 0.17, W * 0.26, 150);
      gy = H * 0.82;
      rx = clamp(W * 0.3, 96, 520);
      guide = new Float32Array(Math.ceil((W + PAD * 2) / STEP) + 1);
      scratch = new Float32Array(guide.length);
      top = journey.getBoundingClientRect().top + window.scrollY;
      scrollLen = Math.max(1, journey.offsetHeight - stage.offsetHeight);
      first = true;
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

    // Pose = [thighA, kneeA, thighB, kneeB, armA, elbowA, armB, elbowB, lean], degrees.
    // A is the near side. Angles are from straight down, positive towards the way he faces.
    function runPose(ph) {
      const tA = cycle(THIGH, ph), tB = cycle(THIGH, ph + 0.5);
      return [tA, cycle(KNEE, ph), tB, cycle(KNEE, ph + 0.5), tB - 8, 80 + tB * 0.4, tA - 8, 80 + tA * 0.4, 13];
    }
    const idlePose = t => [15, 16, -12, 9, -10 + Math.sin(t * 1.6) * 2, 28, 12 - Math.sin(t * 1.6) * 2, 24, 5];
    const airPose = t => { const s = Math.sin(t * 2.2) * 4; return [58 + s, 28, -38 - s, 78, -55, 35, 65 + s, 50, 10]; };
    const CHEER = [10, 6, -10, 5, 142, 10, -150, -10, -2];
    const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

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
      drawArm(s, s.armB, '#8f97cf');
      drawLeg(s.legB, '#8f97cf');
      ctx.strokeStyle = '#f3f5ff'; ctx.lineWidth = 0.13 * u;
      line(0, 0, s.sx, s.sy);
      ctx.fillStyle = '#f3f5ff';
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
      drawLeg(s.legA, '#f3f5ff');
      drawArm(s, s.armA, '#f3f5ff');
      ctx.restore();
    }

    /* ----- World ----- */

    function drawStars() {
      for (const s of STARS) {
        ctx.fillStyle = `rgba(220,230,255,${0.25 + 0.2 * Math.sin(time * 1.3 + s.ph)})`;
        ctx.beginPath(); ctx.arc(mod(s.x * W - cur * u * 0.02, W), s.y * H, s.r, 0, TAU); ctx.fill();
      }
    }

    function drawSkyline(list, period, parallax, alpha) {
      const off = mod(cur * parallax, period);
      const reps = Math.ceil(W / (period * u)) + 1;
      ctx.fillStyle = `rgba(190,200,255,${alpha})`;
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

    function drawGround() {
      const a = clamp(X(CHASM[0]), -10, W + 10), b = clamp(X(CHASM[1]), -10, W + 10);
      const g = ctx.createLinearGradient(0, gy, 0, H);
      g.addColorStop(0, 'rgba(10,9,44,0.62)'); g.addColorStop(1, 'rgba(8,7,34,0.94)');
      ctx.fillStyle = g;
      ctx.fillRect(-10, gy, a + 10, H - gy);
      ctx.fillRect(b, gy, W + 10 - b, H - gy);

      ctx.strokeStyle = 'rgba(255,255,255,0.24)'; ctx.lineWidth = 1.5; ctx.lineCap = 'butt';
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
      const firstTick = Math.floor(cur - rx / u) - 1, lastTick = Math.ceil(cur + (W - rx) / u) + 1;
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
    const pagePath = path => path.replace(/index\.html$/, '');

    function goTo(idx, behavior = 'smooth') {
      window.scrollTo({ top: top + STOPS[idx] / LENGTH * scrollLen, behavior });
    }
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
      b.addEventListener('click', () => goTo(i));
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
      goTo(i);
    });
    // Tabbing into a panel that is not on screen brings the run to it.
    panels.forEach((p, i) => p.addEventListener('focusin', () => {
      if (live && activeIdx !== i) goTo(i, 'auto');
    }));

    /* ----- Frame ----- */

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      time += dt;

      const target = clamp((window.scrollY - top) / scrollLen, 0, 1) * LENGTH;
      const prev = cur;
      cur = first ? target : cur + (target - cur) * ease(dt, 7);
      if (Math.abs(target - cur) < 0.0005) cur = target;
      const dx = first ? 0 : cur - prev;
      vel += (dx / dt - vel) * ease(dt, 10);
      phase += Math.abs(dx) / CYCLE;
      const moving = Math.abs(vel) > 0.25;
      runAmt += ((moving ? 1 : 0) - runAmt) * ease(dt, moving ? 14 : 6);
      // Scroll back up and he turns to run back; once he stops he faces the wind's way again.
      facing += ((vel < -0.4 ? -1 : 1) - facing) * ease(dt, 12);
      flow += dt * (140 + Math.abs(vel) * u * 0.3);

      const p = cur / LENGTH;
      if (Math.abs(p - lastP) > 0.002) { stage.style.setProperty('--p', p.toFixed(3)); lastP = p; }
      const near = Math.round(cur / SPACING);
      const idx = Math.abs(cur - near * SPACING) <= REACH ? near : -1;
      if (idx !== activeIdx) setActive(idx);

      // The wind takes the line the runner is about to take.
      for (let i = 0; i < guide.length; i++) {
        guide[i] = gy - (0.6 + liftAt(cur + (i * STEP - PAD - rx) / u)) * u;
      }
      const blur = Math.round(0.4 * u / STEP);
      soften(guide, scratch, blur);
      soften(scratch, guide, blur);
      const wind = { W, u, t: time, flow, guide, focus: rx / W, rgb: '47,208,201', glow: '234,255,251' };

      ctx.clearRect(0, 0, W, H);
      drawStars();
      drawSkyline(FAR, 30, 0.12, 0.035);
      drawSeaLink();
      drawSkyline(NEAR, 38, 0.3, 0.06);
      for (const r of RIBBONS) if (!r.front) strokeRibbon(ctx, r, wind);
      drawGround();
      drawGate(-0.25, 'START');
      for (const [i, wx] of [22.6, 24, 25.4].entries()) drawPennant(wx, 1.0 + i * 0.14, i * 1.3);
      drawGate(LENGTH - 0.9, '', true);
      drawPennant(LENGTH + 1.3, 1.5, 0.7);
      drawHurdle(JUMPS[0].x);
      drawHurdle(JUMPS[1].x);
      drawCrates(JUMPS[3].x);
      drawGears(JUMPS[4].x);
      drawOrbs();
      drawRunner(dt);
      for (const r of RIBBONS) if (r.front) strokeRibbon(ctx, r, wind);
      drawMotes();
      first = false;
    }

    function start() {
      if (!raf && live && visible) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }
    function stop() {
      cancelAnimationFrame(raf); raf = 0;
    }

    const tallEnough = window.matchMedia('(min-height: 560px)');
    function setLive() {
      const want = !reducedMotion.matches && tallEnough.matches;
      if (want === live) return;
      live = want;
      journey.classList.toggle('is-live', live);
      panels.forEach(p => {
        p.classList.toggle('wind-armed', live);
        if (!live) p.classList.remove('is-active', 'is-past');
      });
      if (live) {
        measure();
        activeIdx = -2;
        start();
      } else {
        stop();
      }
    }

    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start(); else stop();
    }).observe(journey);
    new ResizeObserver(() => { if (live) measure(); }).observe(stage);
    reducedMotion.addEventListener('change', setLive);
    tallEnough.addEventListener('change', setLive);
    window.addEventListener('hashchange', () => {
      const i = hashIndex(location.hash);
      if (live && i >= 0) goTo(i);
    });

    setLive();
    const startAt = hashIndex(location.hash);
    if (live && startAt > 0) requestAnimationFrame(() => goTo(startAt, 'auto'));
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
    new ResizeObserver(measure).observe(canvas);
    new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(raf); raf = 0;
      if (entry.isIntersecting) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }).observe(canvas);
    measure();
  }

  const journey = document.getElementById('journey');
  if (journey) initJourney(journey);
  const ambient = document.querySelector('.wind-ambient');
  if (ambient) initAmbient(ambient);
})();
