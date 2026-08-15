// Hero variants: stippled, animated, graphite-luminance
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
      // without a reload. Cheap: CSS var lookup.
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

// Helper: draw a single "pencil dot", small filled circle with subtle
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
// 1. DNA double helix: dotted, slowly rotating
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
      // depth 0..1 via cosine: closer strand is larger & darker
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
// 2. Kaplan–Meier survival curves: staircase step functions in stipple
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

    // Axes: stippled
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

    // CI band: dotted cloud bounded by two curves
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

    // main regression line: green, travelling luminance
    for (let i = 0; i < 260; i++) {
      const u = i / 259;
      const cx = pad.l + pw * u + par;
      const cy = pad.t + ph * (1 - (intercept + slope * u)) + parY;
      const lum = 0.4 + 0.6 * Math.sin(t * 0.9 - u * 4);
      dot(ctx, cx, cy, 1.4, (0.55 + 0.35 * lum), ACCENT);
    }

    // scatter points: pencil-dot blobs (cluster of 2-3 mini dots each)
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
// ─────────────────────────────────────────────────────────────────────────
// Map of Europe, as a point cloud for the 'map' end state.
// Generated by tools/img2points.py from europe_simple.png. To swap in a
// different drawing, re-run that script and replace the two constants below:
//   python tools/img2points.py yourdrawing.png --n 1800 --name EUROPE
//                              --accent-box 0.425,0.345,0.515,0.455
// Coordinates are plot-fraction, quantised to 1/1000. The accent indices
// pick out Denmark, which renders in the brand green.
const EUROPE = '795,804;800,313;709,766;701,376;801,284;749,815;681,365;870,851;862,791;669,506;695,390;763,400;778,692;852,370;781,781;676,847;867,410;695,530;675,526;820,810;674,396;830,78;804,854;836,836;610,830;642,189;806,341;776,211;669,462;809,96;855,332;932,659;827,247;862,264;888,454;801,788;840,137;837,140;704,781;676,619;610,801;615,833;697,533;816,76;829,345;766,484;915,642;675,177;747,769;815,228;894,653;795,306;707,474;855,397;669,177;796,386;791,688;775,692;682,461;742,348;785,164;744,374;893,684;775,423;756,449;781,433;700,432;726,514;672,179;818,289;822,209;786,146;945,517;824,775;703,471;823,335;827,400;648,451;795,290;777,714;774,386;933,623;716,501;810,355;681,841;773,231;619,729;677,720;770,465;842,186;679,387;709,737;777,402;659,866;744,801;656,711;703,459;689,788;626,851;641,499;682,687;791,480;898,497;894,691;609,812;682,597;784,446;906,637;687,799;795,867;789,798;651,497;685,462;806,270;829,332;667,582;676,160;826,407;627,671;847,869;686,535;899,632;748,792;650,130;744,733;693,373;732,739;811,83;703,370;794,486;932,630;776,438;681,374;651,705;776,781;650,438;783,785;922,668;780,189;794,899;664,193;768,753;679,622;937,504;825,203;675,428;673,501;791,769;776,429;641,175;665,604;801,386;662,590;822,814;775,708;882,452;826,451;860,798;834,128;785,172;778,776;909,642;753,457;875,419;850,882;845,189;755,817;744,808;640,859;639,480;648,125;933,606;779,458;703,383;807,808;740,383;795,442;795,860;869,844;778,433;783,133;892,723;860,293;682,357;787,137;852,332;826,770;827,779;694,337;871,422;809,338;667,467;828,341;811,212;926,675;783,730;848,225;804,458;663,497;760,386;609,820;898,662;667,412;673,432;806,328;725,523;670,452;805,351;648,863;929,513;747,834;832,347;900,656;770,432;623,692;655,705;666,449;819,78;748,711;632,164;765,448;926,622;637,156;693,581;747,804;832,73;636,678;797,814;700,582;738,363;909,627;819,824;851,872;750,484;835,135;856,805;816,267;827,789;682,403;881,429;712,539;791,905;668,455;850,231;704,477;638,166;820,423;916,497;869,419;741,729;801,102;746,757;830,365;615,805;817,760;898,486;706,512;766,361;818,818;767,370;797,483;768,396;653,862;834,358;656,420;803,111;637,671;645,186;762,729;890,483;833,335;766,428;690,794;878,769;619,834;815,274;786,159;925,507;729,500;763,365;822,770;825,68;947,526;754,785;691,350;910,652;679,846;734,733;680,818;834,78;734,490;703,582;662,133;655,856;821,269;832,111;806,358;675,717;631,169;818,795;773,462;784,688;684,577;800,713;818,72;806,367;784,878;720,726;641,484;689,444;676,513;804,862;695,776;767,237;781,462;841,844;931,610;933,503;894,700;934,663;883,459;861,273;775,458;684,364;754,775;810,843;851,214;707,526;895,678;942,507;668,611;809,737;823,75;672,172;725,742;801,901;943,582;617,756;806,749;853,360;768,376;850,373;866,873;752,779;832,376;907,493;697,584;612,805;708,753;828,70;750,433;626,844;845,172;668,428;890,714;798,376;658,494;879,444;669,577;744,303;919,501;650,455;648,111;778,684;861,406;825,792;648,118;677,377;682,475;803,866;910,494;704,768;714,488;672,539;621,844;815,309;676,445;644,442;834,840;715,546;703,542;798,820;825,425;757,765;680,418;854,365;747,811;685,527;610,788;691,539;768,407;807,817;916,510;784,154;794,392;756,461;644,464;765,409;686,588;695,368;869,859;819,299;709,775;688,577;781,688;756,744;944,568;679,477;795,760;800,828;782,692;698,788;923,676;681,483;758,261;705,457;661,704;671,458;676,490;857,828;842,164;676,465;768,488;653,700;672,151;890,739;822,462;783,486;643,481;680,510;770,386;825,432;808,789;812,91;858,403;950,526;665,860;755,810;740,355;830,218;676,520;856,876;701,415;691,529;662,125;626,684;667,135;673,486;779,718;646,425;826,389;648,694;776,225;731,733;761,266;745,387;756,378;620,734;878,433;618,704;789,491;878,776;678,422;670,854;625,857;635,130;738,488;659,487;673,711;840,144;790,125;744,284;616,828;697,433;867,838;873,425;778,215;698,400;708,549;809,853;800,879;679,639;774,451;729,510;681,584;807,461;651,854;699,422;675,381;879,782;822,399;675,403;749,765;950,568;948,551;931,665;801,729;805,260;839,378;649,188;872,416;935,658;823,325;728,519;612,818;840,836;799,724;832,354;816,461;807,849;664,470;714,509;885,455;630,671;648,433;668,598;678,582;729,529;654,493;784,461;851,322;676,626;849,342;618,766;762,422;672,552;673,510;685,540;655,431;801,371;663,597;663,708;629,853;857,250;753,433;772,705;937,601;820,305;894,717;701,776;774,416;798,807;690,451;826,763;772,455;779,468;834,115;679,649;788,478;775,407;903,633;622,742;898,685;694,538;637,170;892,711;762,740;885,471;700,344;680,399;677,497;668,474;772,474;717,532;894,480;857,381;879,423;642,864;915,663;856,386;941,585;618,711;744,821;776,465;814,302;892,486;682,645;888,746;780,727;866,785;832,815;782,169;679,685;844,860;833,370;838,117;673,423;829,392;795,426;787,121;873,784;913,658;756,470;751,439;683,468;829,209;792,124;665,585;854,872;835,89;842,850;752,749;680,666;682,413;704,526;781,734;753,383;641,684;739,726;682,636;673,854;804,89;675,578;797,863;752,792;694,406;860,831;892,695;812,78;742,309;622,714;848,216;776,789;613,825;666,546;853,316;798,707;670,603;665,182;882,753;640,697;788,687;814,215;758,797;942,519;769,471;835,351;689,338;835,399;755,841;850,209;715,724;640,104;659,125;815,821;785,889;742,496;785,681;687,354;790,804;901,629;831,339;679,827;857,795;804,331;776,687;783,175;768,477;676,840;884,769;607,776;622,833;740,305;744,313;917,669;701,785;776,698;634,872;804,837;674,622;676,473;668,527;646,501;667,143;756,756;688,345;739,337;740,312;918,656;924,671;657,435;909,635;896,648;832,827;744,490;801,834;685,786;672,144;776,473;775,396;718,726;886,762;727,730;670,714;773,402;698,367;759,413;681,626;798,419;723,526;875,776;800,815;669,420;747,396;780,477;671,160;667,717;853,378;829,786;649,701;812,849;807,347;715,539;668,483;769,250;750,786;666,711;807,471;800,854;742,360;824,264;934,652;707,452;773,768;818,457;863,801;772,781;748,276;942,575;834,821;889,730;819,328;837,841;759,406;813,757;899,675;818,752;709,747;752,840;778,784;629,684;861,258;659,193;688,562;788,879;672,610;857,817;671,436;791,746;766,420;837,81;911,630;805,814;731,516;764,251;679,487;805,105;858,883;676,702;650,431;762,371;837,102;825,785;820,452;821,413;807,334;804,374;930,655;651,866;640,118;822,805;645,477;760,723;861,396;781,442;751,419;698,348;822,260;800,893;647,689;660,137;756,802;663,548;752,724;750,425;642,504;680,471;634,147;891,700;778,199;629,870;706,568;795,885;678,836;817,295;782,185;655,697;712,734;804,740;757,721;901,643;768,452;619,841;826,442;801,847;882,762;928,661;755,276;669,493;677,483;772,376;801,736;837,394;701,445;661,493;734,743;843,179;737,351;829,225;665,533;758,381;772,697;886,740;841,864;783,141;812,786;935,595;670,416;769,759;807,864;666,591;813,747;784,744;809,862;782,798;953,545;755,428;813,477;805,792;649,857;859,410;797,471;847,212;646,446;812,837;682,380;759,475;861,837;817,321;678,517;805,465;686,342;795,908;826,209;713,501;790,112;658,133;788,698;624,837;644,867;693,355;634,160;752,270;756,833;807,266;688,436;788,442;813,284;753,446;892,704;635,685;675,151;676,585;817,306;654,127;778,412;673,520;697,426;790,898;756,410;746,381;872,794;786,789;750,284;703,483;656,487;778,863;897,695;753,768;839,860;797,295;885,756;810,261;832,102;645,860;786,694;799,280;748,844;735,496;819,312;700,352;858,267;788,753;784,737;775,445;707,486;825,394;821,821;788,131;682,370;801,773;678,507;781,179;949,574;628,863;753,474;780,876;820,798;945,510;634,111;684,808;838,389;796,702;885,446;805,731;666,423;777,454;742,797;692,778;688,530;637,144;949,520;742,378;700,545;699,380;841,151;669,133;720,734;863,869;675,608;678,543;646,438;681,831;810,232;612,791;794,413;679,532;660,183;681,658;682,438;646,198;612,773;790,692;694,788;809,744;672,186;937,646;742,331;622,750;815,811;759,740;776,419;726,737;682,652;887,753;947,577;825,79;688,782;762,394;865,833;632,114;659,714;929,633;882,444;686,581;751,711;797,766;712,763;717,737;860,251;932,640;915,653;744,828;842,172;651,190;790,438;644,692;749,750;823,237;791,864;832,120;631,859;763,260;721,530;642,857;764,416;864,405;670,584;707,743;656,866;768,746;728,743;765,749;789,484;920,507;683,662;884,746;657,428;632,131;798,319;673,843;670,138;862,823;731,744;791,118;811,470;806,95;808,82;668,723;742,289;887,724;895,665;785,180;794,420;737,332;835,144;764,374;919,665;740,376;785,750;930,624;794,815;866,857;829,802;663,480;669,588;834,831;844,870;866,422;812,219;675,506;857,296;630,162;819,261;865,797;697,782;811,254;651,692;608,794;617,747;799,381;798,850;813,815;848,351;853,389;698,412;935,633;741,299;822,79;947,564;812,227;672,588;915,503;844,198;678,525;819,196;935,640;697,386;825,415;663,718;870,412;710,499;662,423;782,873;856,290;709,509;804,846;941,594;720,538;695,578;754,266;764,442;760,400;637,860;798,287;797,438;795,115;688,465;613,798;681,542;812,464;712,513;649,503;837,373;831,400;611,782;617,718;755,791;838,150;885,464;837,109;804,471;642,475;753,464;772,876;660,499;744,836;644,494;634,118;810,755;719,542;647,491;707,519;835,846;928,627;848,202;897,640;782,195;818,271;803,99;640,870;757,820;638,112;755,438;794,755;818,280;732,510;669,445;899,668;669,538;890,707;676,713;773,410;760,734;769,483;645,111;752,409;829,202;851,221;856,823;705,578;744,792;743,814;810,828;953,564;787,801;683,815;639,688;816,211;748,287;656,137;679,675;835,341;666,128;813,250;759,376;833,393;814,831;783,478;753,716;802,378;750,773;762,407;713,746;647,192;644,700;813,293;822,449;799,396;637,120;653,425;840,167;751,755;688,458;861,804;838,847;899,646;756,824;798,843;804,324;804,830;623,850;823,810;771,488;640,192;711,488;791,753;679,462;615,763;703,533;726,532;741,486;891,471;704,519;676,392;643,104;679,431;666,539;795,402;863,412;940,600;668,554;850,365;816,791;841,386;810,222;738,318;782,681;816,798;744,393;615,840;676,549;694,345;759,810;775,727;806,737;684,591;751,277;665,526;665,486;642,490;859,821;773,470;617,736;615,770;799,403;766,762;815,244;793,109;712,770;732,493;628,678;632,156;746,718;747,483;847,196;620,718;622,707;836,824;789,810;776,203;747,496;803,782;770,243;867,863;798,311;810,459;850,337;663,186;779,182;751,387;838,86;817,804;729,739;904,491;620,759;827,812;790,909;692,533;798,426;939,581;925,663;828,823;776,882;779,869;689,587;854,325;880,449;754,480;698,441;796,396;632,681;745,750;649,471;704,445;658,856;857,316;645,458;801,862;784,795;707,760;771,227;799,305;657,701;809,797;887,734;740,368;672,442;667,490;897,491;898,652;647,467;792,442;723,540;653,435;823,405;809,250;812,825;621,688;711,742;864,862;793,436;829,776;669,149;699,390;662,416;912,646;671,849;639,674;788,743;665,140;714,740;761,746;710,757;623,681;948,535;606,782;692,574;673,157;670,523;676,438;835,381;913,497;869,866;684,442;859,245;811,344;670,548;667,850;896,658;715,494;630,127;788,117;900,493;855,243;635,176;850,328;652,490;820,276;644,193;950,559;675,591;841,856;777,872;854,883;662,543;698,358;679,593;685,435;630,118;738,325;818,206;800,475;770,775;656,196;792,429;753,834;904,499;635,137;612,836;877,785;826,335;689,571;823,457;834,405;777,731;638,681;818,465;857,235;619,752;826,802;797,431;932,514;753,759;610,768;756,729;694,569;647,130;815,88;834,95;953,556;707,462;799,731;845,182;794,446;865,844;671,514;673,164;813,801;675,707;845,205;851,355;638,497;769,232;744,716;911,639;679,370;683,825;662,536;905,629;828,797;816,755;862,283;678,394;887,459;799,464;654,186;706,775;825,329;859,282;877,416;637,484;735,503;673,493;795,697;745,843;691,342;782,162;641,691;763,734;644,121;859,289;753,742;824,198;800,329;773,478;775,886;848,190;625,676;641,470;711,546;806,277;770,371;851,384;666,186;747,296;797,407;689,536;643,451;798,104;937,591;910,507;900,637;882,436;801,364;792,801;853,228;672,529;863,830;767,438;739,344;773,438;795,718;746,280;796,108;758,455;731,523;934,613;750,494;860,879;703,773;758,827;669,186;807,857;634,669;782,888;949,542;823,244;686,468;838,125;787,459;820,70;701,425;779,451;771,237;796,875;837,94;679,630;753,394;906,504;704,464;641,183;923,501;632,140;695,351;824,768;682,679;671,497;820,436;816,284;812,238;679,708;857,284;809,474;854,373;706,535;673,451;944,523;697,543;619,742;778,481;700,538;637,869;786,899;822,429;837,405;919,672;863,786;709,565;742,804;809,821;613,766;774,720;681,810;682,530;817,478;683,674;683,694;645,432;739,500;860,872;742,367;750,834;684,350;703,564;678,413;775,876;784,895;748,488;794,765;675,542;797,891;710,730;795,772;795,299;869,792;695,413;753,423;749,740;673,581;859,389;681,702;638,694;792,811;888,465;679,697;865,416;697,572;650,195;811,805;695,400;814,468;815,203;852,240;704,493;685,452;818,83;798,772;654,441;858,311;825,232;795,475;637,108;788,892;783,452;679,406;622,726;820,765;825,225;687,446;795,710;829,810;723,736;769,426;686,361;774,785;782,866;712,755;788,902;792,490;766,400;857,393;772,442;913,509;788,452;772,393;746,727;825,254;709,542;815,221;696,376;771,762;641,109;852,878;779,892;887,475;857,276;854,812;795,313;792,705;870,782;753,415;748,390;774,702;709,532;838,133;936,608;766,740;901,501;638,186;707,558;882,773;834,107;741,316;679,716;692,367;607,788;656,499;803,319;803,280;895,705;802,841;660,860;632,122;744,295;857,257;685,649;691,564;765,394;712,494;856,300;800,296;737,734;769,365;832,83;691,578;928,503;851,345;765,244;859,300;807,101;712,555;764,756;722,730;777,721;778,442;826,216;710,520;673,616;809,89;813,792;639,179;829,234;775,378;685,669;810,815;922,513;775,216;832,361;779,789;790,872;931,507;909,499;812,857;656,183;644,471;791,762;803,723;809,784;702,574;750,720;809,257;774,870;797,781;859,810;678,851;786,487;702,451;823,759;614,814;663,864;797,283;762,378;662,487;639,491;676,536;808,363;926,513;848,360;754,753;710,527;803,264;668,499;742,386;835,389;798,389;800,886;800,869;951,535;687,567;742,723;756,390;749,383;642,115;893,491;665,416;761,254;802,824;653,135;798,117;715,733;835,365;724,535;800,111;707,493;753,488;823,418;835,122;814,235;854,311;773,219;671,428;824,818;781,426;665,578;698,341;681,691;747,746;810,243;812,206;768,769;786,128;753,802;675,169;773,212;931,617;844,160;620,695;778,206;775,772;647,854;699,575;816,315;748,827;820,334;838,399;838,854;821,444;701,438;825,240;785,475;806,823;781,151;798,899;841,394;812,797;759,462;758,271;823,438;667,193;853,339;897,671;792,695;680,494;913,635;838,159;691,784;775,484;662,529;765,433;697,394;684,656;809,465;932,649;755,405;777,889;928,668;787,867;694,363;659,707;876,429;696,420;799,905;779,885;778,192;847,878;653,196;867,853;665,477;895,487;756,419;672,721;773,711;661,190;841,159;820,256;670,616;806,785;747,820;631,867';
const EUROPE_ACCENT = new Set([11,63,64,65,80,92,106,131,148,162,172,179,199,213,220,257,259,261,271,279,322,340,350,390,397,430,456,482,524,534,540,544,549,593,606,689,694,696,733,749,760,774,775,784,801,810,820,836,868,875,879,904,926,961,968,995,1026,1081,1082,1123,1132,1136,1155,1162,1250,1432,1449,1451,1455,1473,1478,1537,1564,1573,1580,1582,1585,1601,1628,1633,1645,1653,1682,1701,1723,1769,1774,1790]);

function HeroDistribution({ breathRef, safeRectRef, startState = 'chaos', endState = 'bell' }) {
  // Bell / KM / regression all fit into the same plot frame.
  // Right-of-text zone: shapes fit inside this in plot-fraction coords.
  const MEAN = 0.78;
  const SD = 0.08;
  const N_BARS = 23;
  const ACCENT_BARS = new Set([9, 13, 18]);
  const TOTAL = 1800;

  // Bar x positions (normalized 0..1 across plot width): span ±2.4 SD
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

  // End-state targets: each is an array of length TOTAL, with
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

      // Three survival curves: different shapes, middle one green (best survival).
      // Each curve is drawn as a step function with particles distributed along
      // horizontal segments and vertical drops.
      const curveDefs = [
        // Middle curve: declines moderately, control, black.
        { steps: [[0,1.00],[0.10,0.92],[0.22,0.82],[0.36,0.70],[0.50,0.58],[0.64,0.46],[0.78,0.35],[0.90,0.25],[1.00,0.17]], accent: false },
        // Top curve: best survival, green accent.
        { steps: [[0,1.00],[0.15,0.97],[0.30,0.93],[0.45,0.88],[0.60,0.83],[0.75,0.78],[0.88,0.74],[1.00,0.70]], accent: true  },
        // Bottom curve: worst survival, steepest drop.
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
    // ── MAP ─────────────────────────────────────────
    // Particles settle into the coastline of Europe. The points are
    // pre-sampled and evenly spaced by tools/img2points.py, so there is no
    // geometry to compute here: decode, jitter slightly, assign.
    const mapTargets = (() => {
      const rand = mulberry32(303);
      const arr = new Array(TOTAL);
      const pairs = EUROPE.split(';');
      for (let i = 0; i < TOTAL; i++) {
        // If the drawing yields fewer points than particles, wrap around and
        // nudge harder, so the surplus thickens the stroke instead of piling
        // up exactly on top of earlier points.
        const src = pairs[i % pairs.length];
        const c = src.indexOf(',');
        const wrapped = i >= pairs.length;
        const jitter = wrapped ? 0.004 : 0.0015;
        arr[i] = {
          x: (+src.slice(0, c)) / 1000 + (rand() - 0.5) * jitter,
          y: (+src.slice(c + 1)) / 1000 + (rand() - 0.5) * jitter,
          accent: EUROPE_ACCENT.has(i % pairs.length),
          kind: 'outline',
          radius: 1.0,
          eagerBias: 0.35,
        };
      }
      return arr;
    })();


    const pedTargets = (() => {
      const rand = mulberry32(606);
      const arr = new Array(TOTAL);
      let idx = 0;
      const X0 = 0.58, X1 = 0.98, Y0 = 0.04, Y1 = 0.96;
      const W = X1 - X0, H = Y1 - Y0;
      const SYM_RX = 0.022;  // half-width in plot-fraction units
      const SYM_RY = 0.055;  // half-height: compensates for wide artboard aspect (≈ RX * 2.5)

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

      // Gen II: 3 children spread wide + married-in partner at far right.
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

      // Gen III: 3 grandchildren centered under II_c3 × II_p4 midpoint (0.73).
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
      // Gen II sibling line: horizontal from c1 to c3.
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
    // variants: and reads as crystal/hex-binning resonant.
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
      // to LOOK regular: equilateral hex cells, in pixel space. In
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

      // Pick one accent node: roughly right-of-center, middle row.
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
        // Small disc fill: stratified polar.
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
      // a random node center): keeps all particles within the lattice.
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

    return { bell: bellTargets, km: kmTargets, map: mapTargets, pedigree: pedTargets, hex: hexTargets };
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

    // GRID: spreadsheet-like lattice with a slight per-cell jitter.
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

    // ROWS: evenly-spaced horizontal bands like lines of streaming text/data.
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

    // FLOW: per-particle "home" base position plus a unique phase.
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
      // Scatter origin: depends on startState. All modes decay toward the
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
      // Quintic smoothstep: softer start, longer tail. This ramps more
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
        // Inside penalty: if both dx=0 and dy=0 we're inside, measure how
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
        // Only active while forming: as prog → 1 the safe zone vanishes.
        const lift = 1 - prog;
        safeMul = 1 - suppress * lift * 0.95;
      }

      const cx = pad.l + pw * x + par * (1 - prog);
      const cy = pad.t + ph * y + parY * (1 - prog);

      // Luminance shimmer fades as the shape settles: prog near 1 → nearly
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
