#!/usr/bin/env python3
"""
img2points.py: turn a simple black-and-white drawing into a point cloud that
the hero animation can settle into.

The hero canvas (hero-variants.js) positions every particle with a target
{x, y} in plot-fraction coordinates, where 0..1 spans the plot box in each
axis. This script samples the dark pixels of a drawing, spaces the samples
evenly, fits them into a chosen sub-box without distorting the drawing, and
emits a compact JS literal you can paste into hero-variants.js.

Typical use
-----------
    python tools/img2points.py europe_simple.png --n 1800 --name EUROPE_PTS

Then paste the printed block into hero-variants.js and build targets from it.

Design notes
------------
* Even spacing matters more than exact count. Randomly sampling dark pixels
  gives clumps and holes that read as noise once the particles settle. This
  uses greedy dart-throwing with a spatial hash, which produces blue-noise-ish
  spacing along the stroke.

* Aspect ratio is not preserved by fraction coordinates alone. The plot box is
  wider than it is tall in pixels, so mapping a square drawing to a square
  fraction range would stretch it. --plot-aspect carries the pixel aspect of
  the plot box so the drawing keeps its shape. Default 2.43 comes from
  hero-variants.js: pw = w * 0.90, ph = h * 0.74, on a hero canvas of about
  2:1, giving (0.90 * 2) / 0.74.

* --accent-box marks a rectangle of the drawing as accent points, which the
  hero renders in the brand green. Coordinates are fractions of the image,
  measured from the top left. Use it to pick out one country.
"""

import argparse
import random
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: python -m pip install Pillow")


def load_ink(path, threshold, invert):
    """Return (ink_pixels, width, height). Ink is anything darker than threshold."""
    img = Image.open(path).convert("L")
    w, h = img.size
    px = img.load()
    ink = []
    for y in range(h):
        for x in range(w):
            v = px[x, y]
            dark = v > threshold if invert else v < threshold
            if dark:
                ink.append((x, y))
    return ink, w, h


def dart_throw(points, radius, limit):
    """Greedy blue-noise sampling: accept a point only if no accepted point is
    within `radius`. Uses a grid keyed on radius so each test is O(1)."""
    cell = radius / 1.4142
    grid = {}
    out = []
    for (x, y) in points:
        gx, gy = int(x / cell), int(y / cell)
        ok = True
        for dx in (-2, -1, 0, 1, 2):
            for dy in (-2, -1, 0, 1, 2):
                for (ox, oy) in grid.get((gx + dx, gy + dy), ()):
                    if (ox - x) ** 2 + (oy - y) ** 2 < radius * radius:
                        ok = False
                        break
                if not ok:
                    break
            if not ok:
                break
        if ok:
            out.append((x, y))
            grid.setdefault((gx, gy), []).append((x, y))
            if len(out) >= limit:
                break
    return out


def sample_evenly(ink, n, seed):
    """Pick n well-spaced points from the ink pixels."""
    rng = random.Random(seed)
    shuffled = ink[:]
    rng.shuffle(shuffled)

    # Bracket a spacing that yields about n points, then bisect.
    lo, hi = 0.5, 200.0
    best = None
    for _ in range(24):
        mid = (lo + hi) / 2
        got = dart_throw(shuffled, mid, int(n * 1.35))
        if len(got) >= n:
            best = got
            lo = mid            # can afford to space out further
        else:
            hi = mid
        if best is not None and abs(len(best) - n) <= max(2, n // 200):
            break
    if best is None:
        best = shuffled[:n]
    rng.shuffle(best)
    return best[:n]


def fit_box(pts, iw, ih, x0, x1, y0, y1, plot_aspect):
    """Map image pixels into the fraction sub-box, preserving the drawing's
    shape given that the plot box is `plot_aspect` times wider than tall."""
    fw, fh = x1 - x0, y1 - y0
    img_aspect = iw / ih
    # Pixel aspect of the available fraction box.
    box_aspect = (fw * plot_aspect) / fh
    if img_aspect >= box_aspect:      # drawing is relatively wider: fit width
        used_fw = fw
        used_fh = fw * plot_aspect / img_aspect
    else:                              # fit height
        used_fh = fh
        used_fw = fh * img_aspect / plot_aspect
    ox = x0 + (fw - used_fw) / 2
    oy = y0 + (fh - used_fh) / 2
    out = []
    for (px, py) in pts:
        out.append((ox + (px / iw) * used_fw,
                    oy + (py / ih) * used_fh))
    return out, (used_fw, used_fh)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image")
    ap.add_argument("--n", type=int, default=1800, help="number of points (default 1800, the hero's particle count)")
    ap.add_argument("--threshold", type=int, default=128, help="0-255; pixels darker than this are ink")
    ap.add_argument("--invert", action="store_true", help="treat LIGHT pixels as ink instead")
    ap.add_argument("--x0", type=float, default=0.58)
    ap.add_argument("--x1", type=float, default=0.98)
    ap.add_argument("--y0", type=float, default=0.04)
    ap.add_argument("--y1", type=float, default=0.96)
    ap.add_argument("--plot-aspect", type=float, default=2.43,
                    help="pixel width/height of the plot box (default 2.43)")
    ap.add_argument("--accent-box", default=None,
                    help="x0,y0,x1,y1 as fractions of the IMAGE; points inside are marked accent")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--name", default="SHAPE_PTS")
    ap.add_argument("--preview", default=None, help="write a PNG preview of the sampled points")
    args = ap.parse_args()

    ink, iw, ih = load_ink(Path(args.image), args.threshold, args.invert)
    if not ink:
        sys.exit("No ink pixels found. Try adjusting --threshold or --invert.")
    print(f"image {iw}x{ih}, ink pixels {len(ink)}", file=sys.stderr)

    pts = sample_evenly(ink, args.n, args.seed)
    print(f"sampled {len(pts)} points", file=sys.stderr)

    accent = set()
    if args.accent_box:
        ax0, ay0, ax1, ay1 = (float(v) for v in args.accent_box.split(","))
        for i, (px, py) in enumerate(pts):
            u, v = px / iw, py / ih
            if ax0 <= u <= ax1 and ay0 <= v <= ay1:
                accent.add(i)
        print(f"accent points: {len(accent)}", file=sys.stderr)

    if args.preview:
        prev = Image.new("RGB", (iw, ih), "white")
        pp = prev.load()
        for i, (px, py) in enumerate(pts):
            col = (26, 107, 60) if i in accent else (20, 20, 20)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    x, y = int(px) + dx, int(py) + dy
                    if 0 <= x < iw and 0 <= y < ih:
                        pp[x, y] = col
        prev.save(args.preview)
        print(f"preview written to {args.preview}", file=sys.stderr)

    mapped, used = fit_box(pts, iw, ih, args.x0, args.x1, args.y0, args.y1, args.plot_aspect)
    print(f"occupies {used[0]:.3f} x {used[1]:.3f} in fraction coords", file=sys.stderr)

    # Emit as quantised integers in a single string: far smaller than an array
    # of objects, and parsed once at module load.
    coords = []
    for (x, y) in mapped:
        coords.append(f"{round(x * 1000)},{round(y * 1000)}")
    print(f"// {len(mapped)} points sampled from {Path(args.image).name} by tools/img2points.py")
    print(f"// Quantised to 1/1000 of the plot box. Decode: v / 1000.")
    print(f"const {args.name} = '{';'.join(coords)}';")
    if accent:
        print(f"const {args.name}_ACCENT = new Set([{','.join(str(i) for i in sorted(accent))}]);")


if __name__ == "__main__":
    main()
