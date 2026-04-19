// hero-mount.jsx — mounts the HeroDistribution canvas into the real site's
// hero section. Unlike HeroFrame (the design-canvas version), this does NOT
// render its own text or nav — the site's markup already provides those.
//
// Responsibilities:
//   • Mount a <canvas> inside #hero-anim
//   • Measure the existing .hero-content element and expose it as a safeRect
//     (in plot-fraction coords) so particles fade around the copy
//   • Drive a "breath" value based on IntersectionObserver + hover state
//   • Cycle through end states on each hover-in (bell → km → regression → pedigree → hex)
//   • Respect prefers-reduced-motion (mount static, no animation)
//   • Auto-skip on narrow viewports (the site's CSS also hides us via display:none)

// HeroDistribution is defined in hero-variants.jsx (loaded before this file)
// and exported onto `window`. We pull it off window under a local alias
// to avoid re-declaring an identifier that Babel's in-browser transformer
// has already seen from the earlier script.
const HeroDist = window.HeroDistribution;

const DIST_PAD = { l: 0.05, r: 0.05, t: 0.12, b: 0.14 }; // must match HeroDistribution

function SiteHeroAnim() {
  const wrapRef = React.useRef(null);
  const breathRef = React.useRef(0);
  const breathTargetRef = React.useRef(0);
  const safeRectRef = React.useRef(null);
  const END_STATES = ['bell', 'km', 'regression', 'pedigree', 'hex'];
  const [endIdx, setEndIdx] = React.useState(0);
  const endIdxRef = React.useRef(0); // first state is bell (index 0)

  // Reduced motion → skip animation + pin breath to full.
  const prefersReduced = React.useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Measure real .hero-content block → safeRect in normalized plot coords.
  // The hero-content lives as a sibling of #hero-anim, inside .hero.
  React.useEffect(() => {
    const update = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const hero = wrap.closest('.hero');
      const text = hero && hero.querySelector('.hero-content');
      if (!hero || !text) return;
      const wr = wrap.getBoundingClientRect();
      const tr = text.getBoundingClientRect();
      if (!wr.width || !wr.height) return;
      // canvas-local 0..1 coords for the text rect
      const cx0 = (tr.left  - wr.left) / wr.width;
      const cy0 = (tr.top   - wr.top)  / wr.height;
      const cx1 = (tr.right - wr.left) / wr.width;
      const cy1 = (tr.bottom - wr.top) / wr.height;
      // convert canvas coords → plot coords (plot = canvas minus DIST_PAD)
      const toPlotX = (c) => (c - DIST_PAD.l) / (1 - DIST_PAD.l - DIST_PAD.r);
      const toPlotY = (c) => (c - DIST_PAD.t) / (1 - DIST_PAD.t - DIST_PAD.b);
      const px0 = toPlotX(cx0), px1 = toPlotX(cx1);
      const py0 = toPlotY(cy0), py1 = toPlotY(cy1);
      const padY = 0.12, padX = 0.02;
      safeRectRef.current = {
        x: Math.min(px0, px1) - padX,
        y: Math.min(py0, py1) - padY,
        w: Math.abs(px1 - px0) + padX * 2,
        h: Math.abs(py1 - py0) + padY * 2,
      };
    };
    update();
    const ro = new ResizeObserver(update);
    if (wrapRef.current) ro.observe(wrapRef.current);
    const hero = wrapRef.current && wrapRef.current.closest('.hero');
    if (hero) ro.observe(hero);
    window.addEventListener('resize', update);
    // Re-measure once fonts load (text block can reflow)
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(update).catch(() => {});
    }
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  // Drive breath: visible → slow form-up; hovered → full form-up.
  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    // Reduced motion: pin breath to 1 and bail — no RAF, no IO, no hover cycle.
    if (prefersReduced) {
      breathRef.current = 1;
      breathTargetRef.current = 1;
      return;
    }
    // We observe the .hero section (the parent the user actually scrolls past),
    // not our own wrap — visibility of the animation container equals visibility
    // of the hero, and the hero is a bigger target for the threshold bands.
    const hero = wrap.closest('.hero') || wrap;
    let visible = 0;
    let hover = 0;
    const updateTarget = () => {
      const visCap = Math.min(visible, 1) * 0.55;
      const hoverTarget = hover;
      breathTargetRef.current = Math.max(visCap, hoverTarget);
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) visible = e.intersectionRatio;
      updateTarget();
    }, { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] });
    io.observe(hero);

    const onEnter = () => {
      hover = 1;
      endIdxRef.current = (endIdxRef.current + 1) % END_STATES.length;
      setEndIdx(endIdxRef.current);
      updateTarget();
    };
    const onLeave = () => { hover = 0; updateTarget(); };
    hero.addEventListener('mouseenter', onEnter);
    hero.addEventListener('mouseleave', onLeave);

    let raf;
    const tick = () => {
      const cur = breathRef.current;
      const tgt = breathTargetRef.current;
      let speed;
      if (tgt > cur) speed = hover ? 0.0055 : 0.0025;
      else           speed = 0.01;
      breathRef.current = cur + (tgt - cur) * speed;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      io.disconnect();
      hero.removeEventListener('mouseenter', onEnter);
      hero.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, [prefersReduced]);

  return React.createElement(
    'div',
    { ref: wrapRef, className: 'hero-anim__stage', 'aria-hidden': 'true' },
    React.createElement(HeroDist, {
      breathRef: breathRef,
      safeRectRef: safeRectRef,
      endState: END_STATES[endIdx],
    })
  );
}

// ── Boot ─────────────────────────────────────────────────────
// Only mount on non-mobile — the hero-visual is display:none below 600px anyway.
// Keep a small guard in case someone loads this file on a very narrow viewport.
(function boot() {
  const mount = document.getElementById('hero-anim');
  if (!mount) return;
  // Respect the site's CSS breakpoint — don't bother mounting on phones.
  if (window.matchMedia('(max-width: 600px)').matches) {
    return;
  }
  // Once we're mounting, hide the fallback <img> to avoid double-rendering.
  const fallback = document.querySelector('.hero-visual > img');
  if (fallback) fallback.style.display = 'none';
  const root = ReactDOM.createRoot(mount);
  root.render(React.createElement(SiteHeroAnim));
})();
