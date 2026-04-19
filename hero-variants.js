// Hero variants — stippled, animated, graphite-luminance
// All share: ~30% base opacity, black ink with occasional #1a6b3c accents,
// subtle per-particle luminance, slow autonomous loop, gentle cursor parallax.
//
// Each variant is a React component that renders a <canvas> sized to its
// parent and keeps an RAF loop internally.

const ACCENT = '#1a6b3c';
// INK / BG are read live from CSS custom properties on <body>, so the canvas
// picks up dark-mode changes automatically. We read per-frame in the draw fn.
const INK_FALLBACK = '#0d0d0d';
const BG_FALLBACK  = '#faf6f3';
function readInk() {
  if (typeof document === 'undefined') return INK_FALLBACK;
  const v = getComputedStyle(document.body).getPropertyValue('--hero-ink').trim();
  return v || INK_FALLBACK;
}
function readBg() {
  if (typeof document === 'undefined') return BG_FALLBACK;
  const v = getComputedStyle(document.body).getPropertyValue('--hero-bg').trim();
  return v || BG_FALLBACK;
}
// Back-compat stubs for any code paths that still reference INK/BG literals.
// These are overwritten each frame via the live readers above.
let INK = INK_FALLBACK;
let BG  = BG_FALLBACK;

// ── useCanvas ───────────────────────────────────────────────
// Utility: mounts a <canvas>, handles DPR + resize, calls draw(ctx, t, w, h, mouse)
// Returns a ref for the wrapper div.
function useCanvas(drawFn, deps = []) {
  const wrapRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const mouseRef = React.useRef({ x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 });
  // Keep latest drawFn in a ref so the RAF loop always calls the freshest
  // closure (e.g. after prop changes) without tearing down the canvas.
  const drawRef = React.useRef(drawFn);
  drawRef.current = drawFn;

  React.useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const onMove = (e) => {
      const r = wrap.getBoundingClientRect();
      mouseRef.current.tx = (e.clientX - r.left) / r.width;
      mouseRef.current.ty = (e.clientY - r.top) / r.height;
    };
    wrap.addEventListener('mousemove', onMove);

    let raf, start = performance.now();
    const tick = (now) => {
      // Refresh live ink/bg once per frame so dark-mode toggles are picked up
      // without a reload. Cheap — CSS var lookup.
      INK = readInk();
      BG  = readBg();
      const t = (now - start) / 1000;
      // ease mouse toward target for parallax smoothing
      const m = mouseRef.current;
      m.x += (m.tx - m.x) * 0.06;
      m.y += (m.ty - m.y) * 0.06;
      ctx.clearRect(0, 0, w, h);
      drawRef.current(ctx, t, w, h, m);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener('mousemove', onMove);
    };
  }, deps);

  return { wrapRef, canvasRef };
}

// Helper: draw a single "pencil dot" — small filled circle with subtle
// graphite luminance driven by a per-dot phase.
function dot(ctx, x, y, r, alpha, color = INK) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Seeded random so shapes are stable across frames
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hermite smoothstep from 0→1 across [e0,e1], 1 across [e1,e2], 1→0 across [e2,e3].
// Used for feathered masking.
function smoothMask(v, e0, e1, e2, e3) {
  if (v <= e0 || v >= e3) return 0;
  if (v >= e1 && v <= e2) return 1;
  if (v < e1) {
    const u = (v - e0) / (e1 - e0);
    return u * u * (3 - 2 * u);
  }
  const u = (e3 - v) / (e3 - e2);
  return u * u * (3 - 2 * u);
}

// ════════════════════════════════════════════════════════════
// 1. DNA double helix — dotted, slowly rotating
// ════════════════════════════════════════════════════════════
function HeroDNA() {
  const { wrapRef, canvasRef } = useCanvas((ctx, t, w, h, m) => {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const helixH = Math.min(h * 0.95, 820);
    const helixW = Math.min(w * 0.42, 320);
    const turns = 3.2;
    const pts = 260;
    const par = (m.x - 0.5) * 10; // parallax tilt

    // Accent: mark every Nth rung as green
    for (let i = 0; i < pts; i++) {
      const u = i / (pts - 1);
      const y = cy + (u - 0.5) * helixH;
      const phase = u * turns * Math.PI * 2 + t * 0.35;
      const x1 = cx + Math.sin(phase) * helixW + par;
      const x2 = cx + Math.sin(phase + Math.PI) * helixW + par;
      // depth 0..1 via cosine — closer strand is larger & darker
      const d1 = (Math.cos(phase) + 1) / 2;
      const d2 = (Math.cos(phase + Math.PI) + 1) / 2;
      // per-point luminance (graphite catching light)
      const lum1 = 0.55 + 0.45 * Math.sin(t * 1.2 + i * 0.3);
      const lum2 = 0.55 + 0.45 * Math.sin(t * 1.2 + i * 0.3 + 2.1);

      const isAccent = i % 37 === 0;
      const color = isAccent ? ACCENT : INK;

      dot(ctx, x1, y, 1.2 + d1 * 2.2, (0.25 + d1 * 0.55) * lum1, color);
      dot(ctx, x2, y, 1.2 + d2 * 2.2, (0.25 + d2 * 0.55) * lum2, color);

      // base-pair rungs every 8th step, as a string of tiny dots
      if (i % 8 === 0) {
        const steps = 10;
        for (let s = 1; s < steps; s++) {
          const sx = x1 + (x2 - x1) * (s / steps);
          const sdepth = (d1 * (1 - s / steps) + d2 * (s / steps));
          dot(ctx, sx, y, 0.7, 0.18 + sdepth * 0.25, isAccent && s === 5 ? ACCENT : INK);
        }
      }
    }
    ctx.globalAlpha = 1;
  }, []);
  return React.createElement(
    'div',
    { ref: wrapRef, style: { position: 'absolute', inset: 0 } },
    React.createElement('canvas', { ref: canvasRef })
  );
}

// ════════════════════════════════════════════════════════════
// 2. Kaplan–Meier survival curves — staircase step functions in stipple
// ════════════════════════════════════════════════════════════
function HeroKM() {
  // Generate stable step-function data once
  const curves = React.useMemo(() => {
    const rand = mulberry32(42);
    const out = [];
    // 4 curves with different hazards
    const hazards = [0.06, 0.10, 0.14, 0.22];
    for (let c = 0; c < hazards.length; c++) {
      const steps = [];
      let s = 1;
      let x = 0;
      while (x < 1 && s > 0.02) {
        const dx = 0.015 + rand() * 0.03;
        x += dx;
        if (x > 1) break;
        steps.push({ x, s });
        s *= 1 - hazards[c] * (0.6 + rand() * 0.8);
      }
      out.push({ steps, hazard: hazards[c], accent: c === 1 });
    }
    return out;
  }, []);

  const { wrapRef, canvasRef } = useCanvas((ctx, t, w, h, m) => {
    const pad = { l: w * 0.08, r: w * 0.08, t: h * 0.15, b: h * 0.2 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    const par = (m.x - 0.5) * 6;

    // Axes — stippled
    for (let i = 0; i < 180; i++) {
      const u = i / 180;
      // x axis
      dot(ctx, pad.l + pw * u + par, pad.t + ph, 0.6, 0.25);
      // y axis
      dot(ctx, pad.l + par, pad.t + ph * u, 0.6, 0.25);
    }

    curves.forEach((c, ci) => {
      const color = c.accent ? ACCENT : INK;
      let prevX = pad.l + par;
      let prevS = 1;
      const dotsPerSegment = 22;
      let jitterSeed = ci * 1000;

      // start with dot at (0, 1)
      const allSteps = [{ x: 0, s: 1 }, ...c.steps];

      for (let i = 0; i < allSteps.length; i++) {
        const { x, s } = allSteps[i];
        const px = pad.l + pw * x + par;
        const py = pad.t + ph * (1 - prevS);
        // horizontal segment from prevX to px at height prevS
        const dx = px - prevX;
        const segDots = Math.max(3, Math.floor(Math.abs(dx) / 4));
        for (let k = 0; k <= segDots; k++) {
          const u = k / segDots;
          const x0 = prevX + dx * u;
          // tiny vertical jitter to feel pencil-drawn
          const seed = Math.sin((jitterSeed + k) * 12.9898) * 43758.5453;
          const jy = (seed - Math.floor(seed) - 0.5) * 1.2;
          // travelling luminance
          const lum = 0.5 + 0.5 * Math.sin(t * 0.8 + u * 3 + ci * 1.2);
          dot(ctx, x0, py + jy, 0.9, (0.35 + 0.35 * lum), color);
        }
        // vertical drop from prevS to s at x=px
        const dyStart = pad.t + ph * (1 - prevS);
        const dyEnd = pad.t + ph * (1 - s);
        const dySegs = Math.max(3, Math.floor(Math.abs(dyEnd - dyStart) / 4));
        for (let k = 0; k <= dySegs; k++) {
          const u = k / dySegs;
          const y0 = dyStart + (dyEnd - dyStart) * u;
          const seed = Math.sin((jitterSeed + 500 + k) * 12.9898) * 43758.5453;
          const jx = (seed - Math.floor(seed) - 0.5) * 1.2;
          const lum = 0.5 + 0.5 * Math.sin(t * 0.8 + u * 3 + ci * 1.2 + 1.5);
          dot(ctx, px + jx, y0, 0.9, (0.3 + 0.3 * lum), color);
        }
        // censor tick marks occasionally
        if (i > 0 && i % 3 === 0) {
          for (let k = -2; k <= 2; k++) {
            dot(ctx, px, py + k * 1.4, 0.7, 0.35, color);
          }
        }
        prevX = px;
        prevS = s;
        jitterSeed += 37;
      }
    });
    ctx.globalAlpha = 1;
  }, [curves]);

  return React.createElement(
    'div',
    { ref: wrapRef, style: { position: 'absolute', inset: 0 } },
    React.createElement('canvas', { ref: canvasRef })
  );
}

// ════════════════════════════════════════════════════════════
// 3. Scatter cloud with regression line
// ════════════════════════════════════════════════════════════
function HeroRegression() {
  const points = React.useMemo(() => {
    const rand = mulberry32(7);
    const pts = [];
    for (let i = 0; i < 220; i++) {
      const x = rand();
      // y = 0.3 + 0.55*x + noise
      const noise = (rand() - 0.5) * 0.35;
      const y = 0.25 + 0.55 * x + noise;
      pts.push({ x, y: Math.max(0.02, Math.min(0.98, y)), phase: rand() * 7 });
    }
    return pts;
  }, []);

  const { wrapRef, canvasRef } = useCanvas((ctx, t, w, h, m) => {
    const pad = { l: w * 0.08, r: w * 0.08, t: h * 0.12, b: h * 0.15 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    const par = (m.x - 0.5) * 8;
    const parY = (m.y - 0.5) * 4;

    // regression line (stippled, green accent, with CI band)
    const slope = 0.55;
    const intercept = 0.25;
    const ciWidth = 0.05;

    // CI band — dotted cloud bounded by two curves
    for (let i = 0; i < 200; i++) {
      const u = i / 199;
      const cx = pad.l + pw * u + par;
      const cyLine = pad.t + ph * (1 - (intercept + slope * u));
      // dots along the band (black, faint)
      for (let k = 0; k < 2; k++) {
        const seed = Math.sin((i * 7 + k * 13) * 12.9898) * 43758.5453;
        const jitter = (seed - Math.floor(seed) - 0.5) * 2 * ciWidth * ph;
        dot(ctx, cx, cyLine + jitter + parY, 0.7, 0.22);
      }
    }

    // main regression line — green, travelling luminance
    for (let i = 0; i < 260; i++) {
      const u = i / 259;
      const cx = pad.l + pw * u + par;
      const cy = pad.t + ph * (1 - (intercept + slope * u)) + parY;
      const lum = 0.4 + 0.6 * Math.sin(t * 0.9 - u * 4);
      dot(ctx, cx, cy, 1.4, (0.55 + 0.35 * lum), ACCENT);
    }

    // scatter points — pencil-dot blobs (cluster of 2-3 mini dots each)
    points.forEach((p, i) => {
      const cx = pad.l + pw * p.x + par * 1.3;
      const cy = pad.t + ph * (1 - p.y) + parY * 1.3;
      const lum = 0.45 + 0.55 * Math.sin(t * 0.7 + p.phase);
      const alpha = 0.35 + 0.35 * lum;
      // cluster
      dot(ctx, cx, cy, 1.6, alpha);
      dot(ctx, cx + 1.4, cy - 0.8, 1.0, alpha * 0.7);
      dot(ctx, cx - 1.1, cy + 1.1, 0.9, alpha * 0.6);
    });

    // subtle axes
    for (let i = 0; i < 120; i++) {
      const u = i / 120;
      dot(ctx, pad.l + pw * u + par, pad.t + ph + parY, 0.55, 0.22);
      dot(ctx, pad.l + par, pad.t + ph * u + parY, 0.55, 0.22);
    }
    ctx.globalAlpha = 1;
  }, [points]);

  return React.createElement(
    'div',
    { ref: wrapRef, style: { position: 'absolute', inset: 0 } },
    React.createElement('canvas', { ref: canvasRef })
  );
}

// ════════════════════════════════════════════════════════════
// 4. Bell curve forming from a particle cloud
// ════════════════════════════════════════════════════════════
function HeroDistribution({ breathRef, safeRectRef, startState = 'chaos', endState = 'bell' }) {
  // Bell / KM / regression all fit into the same plot frame.
  // Right-of-text zone — shapes fit inside this in plot-fraction coords.
  const MEAN = 0.78;
  const SD = 0.08;
  const N_BARS = 23;
  const ACCENT_BARS = new Set([9, 13, 18]);
  const TOTAL = 1800;

  // Bar x positions (normalized 0..1 across plot width) — span ±2.4 SD
  const bars = React.useMemo(() => {
    const out = [];
    const spanSD = 2.4;
    for (let i = 0; i < N_BARS; i++) {
      const u = i / (N_BARS - 1);
      const z = (u - 0.5) * 2 * spanSD;
      const x = MEAN + z * SD;
      const height = Math.exp(-0.5 * z * z);
      out.push({ x, z, height, accent: ACCENT_BARS.has(i) });
    }
    return out;
  }, []);

  // Stable per-particle attributes (pool). Target positions depend on endState
  // and are computed separately below.
  const particles = React.useMemo(() => {
    const rand = mulberry32(19);
    const out = [];
    for (let i = 0; i < TOTAL; i++) {
      out.push({
        eagerness: Math.pow(rand(), 0.7),
        noiseX: rand() * 1.05 - 0.025,
        noiseY: rand() * 1.05 - 0.025,
        driftAx: rand() * 6.28,
        driftAy: rand() * 6.28,
        driftSx: 0.02 + rand() * 0.05,
        driftSy: 0.02 + rand() * 0.05,
        phase: rand() * 7,
      });
    }
    return out;
  }, []);

  // End-state targets — each is an array of length TOTAL, with
  // {x, y, accent, kind, radius, eagerness?}.
  // Allocated independently per end-state: the same particle can be an
  // outline point in the bell but an axis tick in the regression.
  const endTargets = React.useMemo(() => {
    // ── BELL ────────────────────────────────────────
    const bellTargets = (() => {
      const rand = mulberry32(101);
      const arr = new Array(TOTAL);
      let idx = 0;
      const heightSum = bars.reduce((s, b) => s + b.height, 0);
      const OUTLINE_COUNT = Math.floor(TOTAL * 0.14);
      const BAR_BUDGET = TOTAL - OUTLINE_COUNT;
      // Bar particles
      bars.forEach((b, bi) => {
        const n = Math.round((b.height / heightSum) * BAR_BUDGET);
        for (let k = 0; k < n && idx < TOTAL - OUTLINE_COUNT; k++) {
          const colWidth = (1 / N_BARS) * 0.40;
          const jx = (rand() - 0.5) * colWidth;
          const slotFrac = (k + 0.5 + (rand() - 0.5) * 0.3) / n;
          arr[idx++] = {
            x: b.x + jx,
            y: 1 - b.height * 0.88 * slotFrac,
            accent: b.accent,
            kind: 'bar',
            radius: 1.35,
            eagerBias: 0.0, // form early
          };
        }
      });
      // Fill any remainder with bar-center fallback
      while (idx < TOTAL - OUTLINE_COUNT) {
        arr[idx++] = { x: MEAN, y: 0.5, accent: false, kind: 'bar', radius: 1.35, eagerBias: 0 };
      }
      // Outline
      for (let k = 0; k < OUTLINE_COUNT; k++) {
        const u = k / (OUTLINE_COUNT - 1);
        const z = (u - 0.5) * 2 * 2.6;
        const x = MEAN + z * SD;
        const height = Math.exp(-0.5 * z * z);
        const jy = (rand() - 0.5) * 0.004;
        arr[idx++] = {
          x,
          y: 1 - height * 0.88 + jy,
          accent: false,
          kind: 'outline',
          radius: 1.7,
          eagerBias: 0.5, // form late
        };
      }
      return arr;
    })();

    // ── KAPLAN–MEIER ────────────────────────────────
    // Three step-functions on the plot frame. Time axis on x (0→1), survival
    // probability on y (1=top, 0=bottom). Plot area uses x ∈ [0.12, 0.95],
    // y ∈ [0.12, 0.92] so axes are clearly visible.
    const kmTargets = (() => {
      const rand = mulberry32(202);
      const arr = new Array(TOTAL);
      let idx = 0;
      const X0 = 0.58, X1 = 0.98, Y0 = 0.04, Y1 = 0.96;
      // Axis particles first (small budget)
      const X_AXIS_N = Math.floor(TOTAL * 0.035);
      const Y_AXIS_N = Math.floor(TOTAL * 0.03);
      const TICK_N = Math.floor(TOTAL * 0.015);
      for (let k = 0; k < X_AXIS_N; k++) {
        const u = k / (X_AXIS_N - 1);
        const jy = (rand() - 0.5) * 0.002;
        arr[idx++] = { x: X0 + u * (X1 - X0), y: Y1 + jy, accent: false, kind: 'axis', radius: 1.0, eagerBias: 0.4 };
      }
      for (let k = 0; k < Y_AXIS_N; k++) {
        const u = k / (Y_AXIS_N - 1);
        const jx = (rand() - 0.5) * 0.002;
        arr[idx++] = { x: X0 + jx, y: Y0 + u * (Y1 - Y0), accent: false, kind: 'axis', radius: 1.0, eagerBias: 0.4 };
      }
      // Small tick marks at 0, 0.5, 1.0 on y-axis (just a few dots each)
      [0, 0.5, 1].forEach((yFrac) => {
        for (let k = 0; k < TICK_N / 3; k++) {
          const tx = X0 - 0.01 - (k / (TICK_N / 3)) * 0.008;
          arr[idx++] = { x: tx, y: Y1 - yFrac * (Y1 - Y0), accent: false, kind: 'axis', radius: 1.0, eagerBias: 0.4 };
        }
      });

      // Three survival curves — different shapes, middle one green (best survival).
      // Each curve is drawn as a step function with particles distributed along
      // horizontal segments and vertical drops.
      const curveDefs = [
        // Middle curve: declines moderately — control, black.
        { steps: [[0,1.00],[0.10,0.92],[0.22,0.82],[0.36,0.70],[0.50,0.58],[0.64,0.46],[0.78,0.35],[0.90,0.25],[1.00,0.17]], accent: false },
        // Top curve: best survival — green accent.
        { steps: [[0,1.00],[0.15,0.97],[0.30,0.93],[0.45,0.88],[0.60,0.83],[0.75,0.78],[0.88,0.74],[1.00,0.70]], accent: true  },
        // Bottom curve: worst survival — steepest drop.
        { steps: [[0,1.00],[0.06,0.82],[0.14,0.64],[0.24,0.48],[0.36,0.35],[0.50,0.24],[0.65,0.16],[0.82,0.09],[1.00,0.05]], accent: false },
      ];

      const remaining = TOTAL - idx;
      const perCurve = Math.floor(remaining / curveDefs.length);

      curveDefs.forEach((cd) => {
        // Compute total path length (sum of |dx| + |dy|) to distribute evenly.
        let totalLen = 0;
        for (let s = 1; s < cd.steps.length; s++) {
          const [px, py] = cd.steps[s-1];
          const [cx, cy] = cd.steps[s];
          totalLen += Math.abs(cx - px) + Math.abs(py - cy);
        }
        // Walk path and distribute perCurve particles.
        const stepLen = totalLen / perCurve;
        let acc = 0;
        let budget = perCurve;
        for (let s = 1; s < cd.steps.length && budget > 0; s++) {
          const [px, py] = cd.steps[s-1];
          const [cx, cy] = cd.steps[s];
          const segH = Math.abs(cx - px);   // horizontal segment at prev y
          const segV = Math.abs(py - cy);   // vertical drop at new x
          // horizontal
          let dist = 0;
          while (dist < segH && budget > 0) {
            const u = dist / segH;
            const xN = px + (cx - px) * u;
            const yN = py;
            const jx = (rand() - 0.5) * 0.001;
            const jy = (rand() - 0.5) * 0.0015;
            arr[idx++] = {
              x: X0 + xN * (X1 - X0) + jx,
              y: Y1 - yN * (Y1 - Y0) + jy,
              accent: cd.accent, kind: 'curve', radius: 1.15,
              eagerBias: 0.1,
            };
            dist += stepLen;
            budget--;
          }
          acc += segH;
          // vertical
          dist = 0;
          while (dist < segV && budget > 0) {
            const u = dist / segV;
            const xN = cx;
            const yN = py + (cy - py) * u;
            const jx = (rand() - 0.5) * 0.0015;
            const jy = (rand() - 0.5) * 0.001;
            arr[idx++] = {
              x: X0 + xN * (X1 - X0) + jx,
              y: Y1 - yN * (Y1 - Y0) + jy,
              accent: cd.accent, kind: 'curve', radius: 1.15,
              eagerBias: 0.1,
            };
            dist += stepLen;
            budget--;
          }
          acc += segV;
        }
      });
      while (idx < TOTAL) {
        arr[idx++] = { x: X0 + rand() * (X1 - X0), y: Y1, accent: false, kind: 'axis', radius: 1.0, eagerBias: 0.4 };
      }
      return arr;
    })();

    // ── REGRESSION ──────────────────────────────────
    // Scatter points (black) around a fitted line (green), plus axes.
    const regTargets = (() => {
      const rand = mulberry32(303);
      const arr = new Array(TOTAL);
      let idx = 0;
      const X0 = 0.58, X1 = 0.98, Y0 = 0.04, Y1 = 0.96;

      // Axes
      const X_AXIS_N = Math.floor(TOTAL * 0.035);
      const Y_AXIS_N = Math.floor(TOTAL * 0.03);
      for (let k = 0; k < X_AXIS_N; k++) {
        const u = k / (X_AXIS_N - 1);
        const jy = (rand() - 0.5) * 0.002;
        arr[idx++] = { x: X0 + u * (X1 - X0), y: Y1 + jy, accent: false, kind: 'axis', radius: 1.0, eagerBias: 0.4 };
      }
      for (let k = 0; k < Y_AXIS_N; k++) {
        const u = k / (Y_AXIS_N - 1);
        const jx = (rand() - 0.5) * 0.002;
        arr[idx++] = { x: X0 + jx, y: Y0 + u * (Y1 - Y0), accent: false, kind: 'axis', radius: 1.0, eagerBias: 0.4 };
      }

      // Fitted line (green) — positive slope, starts near bottom-left and
      // rises to upper-right. y_fit(x) = intercept + slope * x in data-coords.
      const slope = 0.72;
      const intercept = 0.12;
      const LINE_N = Math.floor(TOTAL * 0.20);
      for (let k = 0; k < LINE_N; k++) {
        const u = k / (LINE_N - 1);
        const xN = u;
        const yN = intercept + slope * xN;
        const jx = (rand() - 0.5) * 0.0015;
        const jy = (rand() - 0.5) * 0.0015;
        arr[idx++] = {
          x: X0 + xN * (X1 - X0) + jx,
          y: Y1 - yN * (Y1 - Y0) + jy,
          accent: true, kind: 'line', radius: 1.5,
          eagerBias: 0.4,
        };
      }

      // Scatter points (black) — gaussian noise around the line
      const SCATTER_N = TOTAL - idx;
      for (let k = 0; k < SCATTER_N; k++) {
        // Stratified x so points spread evenly
        const xN = (k + rand()) / SCATTER_N;
        const yFit = intercept + slope * xN;
        // Box-Muller
        const u1 = Math.max(1e-6, rand());
        const u2 = rand();
        const zn = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const yN = yFit + zn * 0.08;
        // Clip into plot
        const yClip = Math.max(0.02, Math.min(0.98, yN));
        arr[idx++] = {
          x: X0 + xN * (X1 - X0),
          y: Y1 - yClip * (Y1 - Y0),
          accent: false, kind: 'scatter', radius: 1.4,
          eagerBias: 0.05,
        };
      }

      return arr;
    })();

    // ── PEDIGREE ─────────────────────────────────────
    // Classical genetics pedigree: squares = male, circles = female.
    // Filled = affected (green accent). Three generations. Gen III is
    // spread wide under the II_c3 × II_p4 marriage so symbols don't
    // overlap even with particle dot radius added.
    const pedTargets = (() => {
      const rand = mulberry32(606);
      const arr = new Array(TOTAL);
      let idx = 0;
      const X0 = 0.58, X1 = 0.98, Y0 = 0.04, Y1 = 0.96;
      const W = X1 - X0, H = Y1 - Y0;
      const SYM_RX = 0.022;  // half-width in plot-fraction units
      const SYM_RY = 0.055;  // half-height — compensates for wide artboard aspect (≈ RX * 2.5)

      const push = (x, y, opts = {}) => {
        if (idx >= TOTAL) return;
        arr[idx++] = {
          x, y,
          accent: !!opts.accent,
          kind: opts.kind || 'ped',
          radius: opts.radius != null ? opts.radius : 1.15,
          eagerBias: opts.eagerBias != null ? opts.eagerBias : 0.15,
        };
      };

      const drawSymbol = (cx, cy, type, filled) => {
        const outlineN = 56;
        for (let k = 0; k < outlineN; k++) {
          const u = k / outlineN;
          let x, y;
          if (type === 'square') {
            const t = u * 4;
            if (t < 1)      { x = cx - SYM_RX + t * 2 * SYM_RX; y = cy - SYM_RY; }
            else if (t < 2) { x = cx + SYM_RX; y = cy - SYM_RY + (t - 1) * 2 * SYM_RY; }
            else if (t < 3) { x = cx + SYM_RX - (t - 2) * 2 * SYM_RX; y = cy + SYM_RY; }
            else            { x = cx - SYM_RX; y = cy + SYM_RY - (t - 3) * 2 * SYM_RY; }
          } else {
            const ang = u * Math.PI * 2;
            x = cx + Math.cos(ang) * SYM_RX;
            y = cy + Math.sin(ang) * SYM_RY;
          }
          const jx = (rand() - 0.5) * 0.0006, jy = (rand() - 0.5) * 0.0006;
          push(x + jx, y + jy, {
            kind: 'line', radius: 1.25, accent: !!filled, eagerBias: 0.22,
          });
        }
        if (filled) {
          for (let k = 0; k < 24; k++) {
            let rx, ry;
            if (type === 'square') {
              rx = (rand() - 0.5) * 2 * SYM_RX * 0.72;
              ry = (rand() - 0.5) * 2 * SYM_RY * 0.72;
            } else {
              const u = rand();
              const r = Math.sqrt(u) * 0.76;
              const ang = rand() * Math.PI * 2;
              rx = Math.cos(ang) * r * SYM_RX; ry = Math.sin(ang) * r * SYM_RY;
            }
            push(cx + rx, cy + ry, {
              kind: 'line', radius: 1.2, accent: true, eagerBias: 0.18,
            });
          }
        }
      };

      // Generation y-positions.
      const GY1 = Y0 + H * 0.16;
      const GY2 = Y0 + H * 0.50;
      const GY3 = Y0 + H * 0.84;
      const px = (f) => X0 + W * f;

      // Gen I couple (centered-ish).
      const I_Px = px(0.32);
      const I_Fx = px(0.58);
      drawSymbol(I_Px, GY1, 'square', false);
      drawSymbol(I_Fx, GY1, 'circle', true);

      // Gen II — 3 children spread wide + married-in partner at far right.
      // c3 × p4 marriage midpoint sits far enough right to let Gen III
      // spread comfortably beneath it.
      const II_c1 = px(0.08);  // affected son
      const II_c2 = px(0.30);  // unaffected daughter
      const II_c3 = px(0.54);  // affected daughter (carrier)
      const II_p4 = px(0.92);  // married-in unaffected male
      drawSymbol(II_c1, GY2, 'square', true);
      drawSymbol(II_c2, GY2, 'circle', false);
      drawSymbol(II_c3, GY2, 'circle', true);
      drawSymbol(II_p4, GY2, 'square', false);

      // Gen III — 3 grandchildren centered under II_c3 × II_p4 midpoint (0.73).
      // Wide horizontal spread so they don't visually crowd each other.
      const III_g1 = px(0.55);
      const III_g2 = px(0.73);
      const III_g3 = px(0.91);
      drawSymbol(III_g1, GY3, 'square', false);
      drawSymbol(III_g2, GY3, 'circle', true);
      drawSymbol(III_g3, GY3, 'square', false);

      const drawLine = (x1, y1, x2, y2, n = 30) => {
        for (let k = 0; k < n; k++) {
          const u = k / (n - 1);
          const x = x1 + (x2 - x1) * u;
          const y = y1 + (y2 - y1) * u;
          const jx = (rand() - 0.5) * 0.0006, jy = (rand() - 0.5) * 0.0006;
          push(x + jx, y + jy, {
            kind: 'axis', radius: 0.95, eagerBias: 0.48,
          });
        }
      };

      // Gen I marriage line.
      drawLine(I_Px + SYM_RX, GY1, I_Fx - SYM_RX, GY1, 24);
      // Vertical drop from I midpoint to Gen II sibling line.
      const I_mid = (I_Px + I_Fx) / 2;
      const SIB_Y = GY1 + (GY2 - GY1) * 0.50;
      drawLine(I_mid, GY1, I_mid, SIB_Y, 20);
      // Gen II sibling line — horizontal from c1 to c3.
      drawLine(II_c1, SIB_Y, II_c3, SIB_Y, 58);
      drawLine(II_c1, SIB_Y, II_c1, GY2 - SYM_RY, 18);
      drawLine(II_c2, SIB_Y, II_c2, GY2 - SYM_RY, 18);
      drawLine(II_c3, SIB_Y, II_c3, GY2 - SYM_RY, 18);
      // Marriage line between II_c3 and II_p4.
      drawLine(II_c3 + SYM_RX, GY2, II_p4 - SYM_RX, GY2, 32);
      // Drop from their midpoint to Gen III sibling line.
      const II_mid = (II_c3 + II_p4) / 2;
      const SIB_Y3 = GY2 + (GY3 - GY2) * 0.50;
      drawLine(II_mid, GY2, II_mid, SIB_Y3, 20);
      // Gen III sibling line.
      drawLine(III_g1, SIB_Y3, III_g3, SIB_Y3, 46);
      drawLine(III_g1, SIB_Y3, III_g1, GY3 - SYM_RY, 18);
      drawLine(III_g2, SIB_Y3, III_g2, GY3 - SYM_RY, 18);
      drawLine(III_g3, SIB_Y3, III_g3, GY3 - SYM_RY, 18);

      const allSymbols = [
        { x: I_Px, y: GY1, type: 'square', filled: false },
        { x: I_Fx, y: GY1, type: 'circle', filled: true  },
        { x: II_c1, y: GY2, type: 'square', filled: true  },
        { x: II_c2, y: GY2, type: 'circle', filled: false },
        { x: II_c3, y: GY2, type: 'circle', filled: true  },
        { x: II_p4, y: GY2, type: 'square', filled: false },
        { x: III_g1, y: GY3, type: 'square', filled: false },
        { x: III_g2, y: GY3, type: 'circle', filled: true  },
        { x: III_g3, y: GY3, type: 'square', filled: false },
      ];
      while (idx < TOTAL) {
        const s = allSymbols[Math.floor(rand() * allSymbols.length)];
        const u = rand();
        let x, y;
        if (s.type === 'square') {
          const t = u * 4;
          if (t < 1)      { x = s.x - SYM_RX + t * 2 * SYM_RX; y = s.y - SYM_RY; }
          else if (t < 2) { x = s.x + SYM_RX; y = s.y - SYM_RY + (t - 1) * 2 * SYM_RY; }
          else if (t < 3) { x = s.x + SYM_RX - (t - 2) * 2 * SYM_RX; y = s.y + SYM_RY; }
          else            { x = s.x - SYM_RX; y = s.y + SYM_RY - (t - 3) * 2 * SYM_RY; }
        } else {
          const ang = u * Math.PI * 2;
          x = s.x + Math.cos(ang) * SYM_RX;
          y = s.y + Math.sin(ang) * SYM_RY;
        }
        const jx = (rand() - 0.5) * 0.0012, jy = (rand() - 0.5) * 0.0012;
        push(x + jx, y + jy, {
          kind: 'line', radius: 1.1, accent: s.filled, eagerBias: 0.22,
        });
      }
      return arr;
    })();

    // ── HEX LATTICE ──────────────────────────────────
    // Hexagonal (triangular) lattice of dots. One accent-green node.
    // Surprising because it reveals pure order after three data-viz
    // variants — and reads as crystal/hex-binning resonant.
    const hexTargets = (() => {
      const rand = mulberry32(707);
      const arr = new Array(TOTAL);
      let idx = 0;
      const push = (x, y, opts = {}) => {
        if (idx >= TOTAL) return;
        arr[idx++] = {
          x, y,
          accent: !!opts.accent,
          kind: opts.kind || 'hex',
          radius: opts.radius != null ? opts.radius : 1.25,
          eagerBias: opts.eagerBias != null ? opts.eagerBias : 0.2,
        };
      };

      // Plot region.
      const X0 = 0.58, X1 = 0.98, Y0 = 0.06, Y1 = 0.94;
      const W = X1 - X0, H = Y1 - Y0;

      // Hex lattice geometry.
      //
      // Artboard aspect is wide (~2.43:1 pw:ph in px). We want the lattice
      // to LOOK regular — equilateral hex cells — in pixel space. In
      // plot-fraction coords, to render an equilateral hex row we set:
      //   dx_px = step_px     → dx_frac = step_px / pw
      //   dy_px = step_px * sqrt(3)/2 → dy_frac = step_px * (√3/2) / ph
      //
      // Given pw/ph ≈ 2.43, dy_frac / dx_frac ≈ 2.43 * √3/2 ≈ 2.105.
      //
      // So in plot-coords, dy = dx * 2.105 for equilateral-looking hexes.
      const COLS = 17;
      const ROWS = 9;
      const dxFrac = (W * 0.98) / (COLS - 1);     // spans ~98% of W
      const dyFrac = dxFrac * 2.105;              // compensates aspect
      // Vertical span: (ROWS-1)*dyFrac + dyFrac (stagger compensation)
      // Center the block vertically in the plot.
      const gridH = (ROWS - 1) * dyFrac;
      const startY = Y0 + (H - gridH) / 2;
      const startX = X0 + (W - (COLS - 1) * dxFrac) / 2;

      // Pick one accent node — roughly right-of-center, middle row.
      // Slightly off-center for visual rhythm.
      const accentR = 4, accentC = 11;

      // Collect all node centers first.
      const nodes = [];
      for (let r = 0; r < ROWS; r++) {
        const yRow = startY + r * dyFrac;
        // Odd rows shifted right by dxFrac/2 for hex stagger.
        const xOffset = (r % 2 === 0) ? 0 : dxFrac * 0.5;
        // Skip last col on odd rows so edges stay flush-ish.
        const colsThisRow = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < colsThisRow; c++) {
          const xCol = startX + c * dxFrac + xOffset;
          const isAccent = (r === accentR && c === accentC);
          nodes.push({ x: xCol, y: yRow, accent: isAccent });
        }
      }

      // Draw each node as a small filled dot. Node size is pixel-small;
      // ~6-8 particles per node, stratified in a small disc.
      // Scale disc radii to account for artboard aspect so dots look round.
      const nodeRX = 0.0055;   // half-width  (plot-fraction)
      const nodeRY = 0.0135;   // half-height (plot-fraction, compensates aspect)
      const PER_NODE = Math.max(6, Math.floor((TOTAL * 0.75) / nodes.length));

      nodes.forEach((n) => {
        // Small disc fill — stratified polar.
        for (let k = 0; k < PER_NODE; k++) {
          const u = rand();
          const r = Math.sqrt(u);
          const ang = rand() * Math.PI * 2;
          const rx = Math.cos(ang) * r * nodeRX;
          const ry = Math.sin(ang) * r * nodeRY;
          push(n.x + rx, n.y + ry, {
            kind: 'line',
            radius: n.accent ? 1.35 : 1.20,
            accent: n.accent,
            eagerBias: n.accent ? 0.15 : 0.22,
          });
        }
      });

      // Fill remainder by reinforcing existing nodes (random jitter around
      // a random node center) — keeps all particles within the lattice.
      while (idx < TOTAL) {
        const n = nodes[Math.floor(rand() * nodes.length)];
        const u = rand();
        const r = Math.sqrt(u);
        const ang = rand() * Math.PI * 2;
        const rx = Math.cos(ang) * r * nodeRX;
        const ry = Math.sin(ang) * r * nodeRY;
        push(n.x + rx, n.y + ry, {
          kind: 'line', radius: 1.15, accent: n.accent,
          eagerBias: n.accent ? 0.15 : 0.22,
        });
      }
      return arr;
    })();

    return { bell: bellTargets, km: kmTargets, regression: regTargets, pedigree: pedTargets, hex: hexTargets };
  }, [bars]);

  // Precomputed origin positions for each non-chaos start state.
  // Each is an array of {x, y} in plot-normalized coords, one per particle.
  const origins = React.useMemo(() => {
    const rand = mulberry32(13571);
    const N = particles.length;
    // Shuffle an index list so grid/row assignments aren't correlated with
    // bar-index ordering (otherwise the histogram's left edge always maps to
    // the grid's top-left, which looks too "on rails" during the transition).
    const shuffled = Array.from({ length: N }, (_, i) => i);
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // GRID — spreadsheet-like lattice with a slight per-cell jitter.
    // Aspect-aware: ~N cells arranged to roughly fill the 16:9 plot.
    const cols = Math.ceil(Math.sqrt(N * 2.2));   // wider than tall
    const rows = Math.ceil(N / cols);
    const gridXPad = 0.04, gridYPad = 0.08;
    const grid = new Array(N);
    for (let k = 0; k < N; k++) {
      const idx = shuffled[k];
      const r = Math.floor(k / cols);
      const c = k % cols;
      const gx = gridXPad + (c + 0.5) / cols * (1 - gridXPad * 2);
      const gy = gridYPad + (r + 0.5) / rows * (1 - gridYPad * 2);
      const jx = (rand() - 0.5) * (1 / cols) * 0.18;
      const jy = (rand() - 0.5) * (1 / rows) * 0.18;
      grid[idx] = { x: gx + jx, y: gy + jy };
    }

    // ROWS — evenly-spaced horizontal bands like lines of streaming text/data.
    // More y-jitter than the strict lattice so it reads as a coherent stream
    // with local structure, not rigid lanes.
    const ROW_COUNT = 12;
    const rowXPad = 0.04, rowYPad = 0.08;
    const perRow = Math.ceil(N / ROW_COUNT);
    const rowsArr = new Array(N);
    for (let k = 0; k < N; k++) {
      const idx = shuffled[k];
      const r = Math.floor(k / perRow);
      const c = k % perRow;
      const rx = rowXPad + (c + 0.5) / perRow * (1 - rowXPad * 2);
      const ry = rowYPad + (r + 0.5) / ROW_COUNT * (1 - rowYPad * 2);
      const jx = (rand() - 0.5) * (1 / perRow) * 0.4;
      // Much larger y jitter (up to ~0.9 × row spacing) so rows overlap
      // significantly and the whole thing reads as a tilted stream, not lanes.
      const jy = (rand() - 0.5) * (1 / ROW_COUNT) * 0.9;
      rowsArr[idx] = { x: rx + jx, y: ry + jy };
    }

    // FLOW — per-particle "home" base position plus a unique phase.
    // The draw loop adds time-varying curl displacement around the home.
    const flow = new Array(N);
    for (let k = 0; k < N; k++) {
      flow[k] = {
        hx: 0.05 + rand() * 0.9,
        hy: 0.10 + rand() * 0.8,
        ph: rand() * Math.PI * 2,
        // Flow-field sample seeds (per-particle variation in the trajectory).
        fa: rand() * Math.PI * 2,
        fs: 0.25 + rand() * 0.4, // speed
      };
    }

    return { grid, rows: rowsArr, flow };
  }, [particles]);

  const { wrapRef, canvasRef } = useCanvas((ctx, t, w, h, m) => {
    const pad = { l: w * 0.05, r: w * 0.05, t: h * 0.12, b: h * 0.14 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    const par = (m.x - 0.5) * 6;
    const parY = (m.y - 0.5) * 3;

    // Breath is externally-driven when a ref is provided; otherwise fall back
    // to the autonomous slow loop (used by the design-canvas preview).
    let breath;
    if (breathRef && breathRef.current != null) {
      breath = breathRef.current;
    } else {
      const raw = 0.5 + 0.5 * Math.sin(t * 0.22);
      breath = raw * raw * (3 - 2 * raw);
    }

    // Opacity gain: 0.43 at full chaos → 1.0 at peak resolution.
    const gain = 0.43 + 0.57 * breath;

    // Optional text safe zone (in normalized plot-relative 0..1 coords).
    // Particles inside it are faded toward zero, with a feathered edge.
    const safe = safeRectRef && safeRectRef.current;

    // Every visible dot is a particle. Each has its own arrival schedule:
    // a particle's personal 'progress' ramps from 0 (scatter) to 1 (target)
    // as the breath crosses its eagerness window.
    particles.forEach((p, i) => {
      // Scatter origin — depends on startState. All modes decay toward the
      // target as prog increases, so the bell always resolves the same way.
      let scatterX, scatterY;
      const drift = 0.045;
      if (startState === 'grid' && origins.grid[i]) {
        const g = origins.grid[i];
        // Tiny breathing jitter so the grid feels alive, not frozen.
        scatterX = g.x + Math.sin(t * 0.6 + p.driftAx) * 0.006;
        scatterY = g.y + Math.cos(t * 0.6 + p.driftAy) * 0.006;
      } else if (startState === 'rows' && origins.rows[i]) {
        const r = origins.rows[i];
        // Streaming along a ~15° downward slope. Each particle flows in the
        // tilted direction at its own pace, wrapping with modulo.
        const SLOPE = 0.27; // tan(15°) ≈ 0.268
        const rowSpeed = 0.018 + (i % 5) * 0.004;
        const dx = (r.x + t * rowSpeed) % 1;
        // The row's baseline y shifts with x so particles appear to travel
        // along the slope. Shifted down by half the slope so the stream sits
        // centered rather than drifting off the bottom.
        const baseY = r.y + (dx - 0.5) * SLOPE;
        scatterX = dx;
        scatterY = baseY + Math.sin(t * 0.4 + p.driftAy) * 0.006;
      } else if (startState === 'flow' && origins.flow[i]) {
        const f = origins.flow[i];
        // Curl-like flow field: particles orbit their home and drift along a
        // slow noise gradient. Uses cheap analytical curl of sin/cos.
        const tt = t * f.fs;
        const nx = Math.sin(f.hx * 4.2 + tt * 0.3 + f.ph) * 0.5
                 + Math.cos(f.hy * 3.7 - tt * 0.25) * 0.5;
        const ny = Math.cos(f.hx * 3.1 - tt * 0.35 + f.ph) * 0.5
                 + Math.sin(f.hy * 4.8 + tt * 0.28) * 0.5;
        scatterX = f.hx + nx * 0.08;
        scatterY = f.hy + ny * 0.08;
      } else {
        // Default: chaotic random cloud (original behavior).
        scatterX = p.noiseX + Math.sin(t * p.driftSx + p.driftAx) * drift;
        scatterY = p.noiseY + Math.cos(t * p.driftSy + p.driftAy) * drift;
      }

      // Linger: no particle moves until breath crosses FORM_DELAY. Gives the
      // reader a moment to perceive the chaotic start before ordering begins.
      const FORM_DELAY = 0.18;
      const SPREAD = 0.50;
      // Eagerness is stable per-particle; per-end-state bias pushes certain
      // roles (outlines, axes, regression line) later in the form-up so the
      // data points land before the reference lines do.
      const preTgt = (endTargets[endState] || endTargets.bell)[i];
      const bias = (preTgt && preTgt.eagerBias) || 0;
      const e = Math.min(1, p.eagerness * (1 - bias) + bias);
      const start = FORM_DELAY + e * (1 - FORM_DELAY - SPREAD);
      const end = start + SPREAD;
      let progRaw = (breath - start) / (end - start);
      progRaw = Math.max(0, Math.min(1, progRaw));
      // Quintic smoothstep — softer start, longer tail. This ramps more
      // gently than cubic so particles don't appear to snap into motion
      // at the moment their form-up window opens.
      const prog = progRaw * progRaw * progRaw * (progRaw * (progRaw * 6 - 15) + 10);

      // Pick target from current endState (fallback to bell).
      const targetList = endTargets[endState] || endTargets.bell;
      const tgt = targetList[i] || { x: 0.5, y: 0.5, accent: false, kind: 'bar', radius: 1.2 };

      const x = scatterX + (tgt.x - scatterX) * prog;
      const y = scatterY + (tgt.y - scatterY) * prog;

      // Safe zone: particles inside the text rect are nearly invisible,
      // fading smoothly to fully visible outside it. The suppression itself
      // is scaled by (1 - prog) so that as particles settle into the final
      // shape (which already avoids the text), the fade lifts entirely.
      let safeMul = 1;
      if (safe) {
        // Continuous falloff based on signed distance to the nearest edge.
        // Inside the box: dist > 0 → strong suppression. Outside: dist < 0,
        // exponentially falling off to 1 within FALLOFF plot-units.
        const dx = Math.max(safe.x - x, x - (safe.x + safe.w), 0);
        const dy = Math.max(safe.y - y, y - (safe.y + safe.h), 0);
        const distOutside = Math.sqrt(dx * dx + dy * dy);
        // Inside penalty: if both dx=0 and dy=0 we're inside — measure how
        // deep by taking min distance to an edge.
        const inside = dx === 0 && dy === 0;
        let insideDepth = 0;
        if (inside) {
          insideDepth = Math.min(
            x - safe.x, (safe.x + safe.w) - x,
            y - safe.y, (safe.y + safe.h) - y,
          );
        }
        // Combine: a single value 0..1 that's 1 at the center of the box,
        // falls to ~0.5 at the edge, and keeps falling off outside.
        const FALLOFF = 0.06; // plot-fraction units; ~6% of width
        // suppress is high when we're well inside, drops near/across the edge.
        let suppress;
        if (inside) {
          // Smoothly ramp from 0 at edge to 1 deep inside.
          const u = Math.min(1, insideDepth / FALLOFF);
          suppress = u * u * (3 - 2 * u); // smoothstep
        } else {
          // Outside: drop exponentially with distance.
          suppress = Math.exp(-distOutside / FALLOFF) * 0.5;
        }
        // Only active while forming — as prog → 1 the safe zone vanishes.
        const lift = 1 - prog;
        safeMul = 1 - suppress * lift * 0.95;
      }

      const cx = pad.l + pw * x + par * (1 - prog);
      const cy = pad.t + ph * y + parY * (1 - prog);

      // Luminance shimmer fades as the shape settles — prog near 1 → nearly
      // constant opacity, so the end state reads as clean and smooth.
      const shimmer = (1 - prog * 0.92);
      const lum = 0.85 + 0.15 * Math.sin(t * 0.9 + p.phase) * shimmer;
      const baseAlpha = tgt.kind === 'outline' || tgt.kind === 'line'
        ? (0.62 + 0.28 * lum)
        : (0.55 + 0.25 * lum);
      const alpha = baseAlpha * gain * safeMul;
      const color = tgt.accent ? ACCENT : INK;
      const r = tgt.radius * (0.85 + 0.35 * prog);
      dot(ctx, cx, cy, r, alpha, color);
    });

    ctx.globalAlpha = 1;  }, [particles, endTargets, endState, startState]);

  return React.createElement(
    'div',
    { ref: wrapRef, style: { position: 'absolute', inset: 0 } },
    React.createElement('canvas', { ref: canvasRef })
  );
}

// ════════════════════════════════════════════════════════════
// 5. Topographic contour lines (probability surface)
// ════════════════════════════════════════════════════════════
function HeroTopo() {
  const { wrapRef, canvasRef } = useCanvas((ctx, t, w, h, m) => {
    const par = (m.x - 0.5) * 14;
    const parY = (m.y - 0.5) * 8;

    // Two Gaussian bumps slowly drifting → creates a changing surface
    const bumps = [
      { x: 0.38 + Math.sin(t * 0.12) * 0.03, y: 0.42 + Math.cos(t * 0.15) * 0.03, s: 0.18, a: 1 },
      { x: 0.66 + Math.cos(t * 0.1) * 0.04, y: 0.56 + Math.sin(t * 0.13) * 0.03, s: 0.22, a: 0.85 },
    ];
    const field = (x, y) => {
      let v = 0;
      for (const b of bumps) {
        const dx = (x - b.x) / b.s;
        const dy = (y - b.y) / b.s;
        v += b.a * Math.exp(-(dx * dx + dy * dy));
      }
      return v;
    };

    // 8 contour levels; each drawn as stippled dots along the isocurve
    const levels = [0.15, 0.28, 0.42, 0.56, 0.7, 0.84, 0.98, 1.1];
    const accentLevel = 3; // 4th contour is the green one

    // Sample a grid and draw dots where |field - level| is below a threshold
    const cols = 180, rows = 110;
    for (let li = 0; li < levels.length; li++) {
      const lv = levels[li];
      const color = li === accentLevel ? ACCENT : INK;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i / cols;
          const y = j / rows;
          const f = field(x, y);
          const d = Math.abs(f - lv);
          if (d < 0.012) {
            // luminance sweep: a 'light source' at angle t
            const angle = t * 0.3;
            const lx = 0.5 + Math.cos(angle) * 0.6;
            const ly = 0.5 + Math.sin(angle) * 0.6;
            const dist = Math.hypot(x - lx, y - ly);
            const lum = Math.max(0, 1 - dist * 1.1);
            const alpha = (0.35 + 0.55 * lum) * (li === accentLevel ? 1.0 : 0.85);
            dot(ctx, x * w + par, y * h + parY, 0.9, alpha, color);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }, []);

  return React.createElement(
    'div',
    { ref: wrapRef, style: { position: 'absolute', inset: 0 } },
    React.createElement('canvas', { ref: canvasRef })
  );
}

Object.assign(window, {
  HeroDNA, HeroKM, HeroRegression, HeroDistribution, HeroTopo,
});
