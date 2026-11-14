// Pirate flags: the drawing format shared by the phones (which draw them), the
// TV (which shows them) and the server (which checks them before passing them on).
//
// A flag is { cloth, strokes: [{ c, w, p }, ...] }
//   cloth  which of CLOTHS the flag is cut from
//   c      which of INKS the stroke is painted in, or -1 for the eraser
//          (the eraser paints in the cloth colour)
//   w      which of WIDTHS the brush was
//   p      the stroke's points, flattened: [x0, y0, x1, y1, ...] on a 600 x 400 grid

export const FLAG_W = 600;
export const FLAG_H = 400;
export const CLOTHS = ['#17151c', '#a8281f', '#1c3d6b', '#1f5e43', '#5b2a6e', '#efe6cf'];
export const INKS = ['#f6f1e4', '#17151c', '#d63a2f', '#f7c948', '#3b9bd9', '#43a862', '#f08ab1'];
export const WIDTHS = [7, 16, 34];
export const ERASER = -1;
export const MAX_STROKES = 400;
export const MAX_POINTS = 6000; // across the whole flag; keeps a drawing to a few kilobytes

const whole = (value, lo, hi, fallback) => (Number.isInteger(value) && value >= lo && value <= hi ? value : fallback);

/**
 * Rebuild a flag sent by a phone, keeping only what the format allows.
 * Returns null if there is nothing drawn on it.
 */
export function sanitizeFlag(raw) {
  const strokes = [];
  let budget = MAX_POINTS;
  for (const stroke of Array.isArray(raw?.strokes) ? raw.strokes.slice(0, MAX_STROKES) : []) {
    if (!Array.isArray(stroke?.p) || budget <= 0) continue;
    const p = [];
    for (let i = 0; i + 1 < stroke.p.length && p.length < budget * 2; i += 2) {
      const x = Math.round(Number(stroke.p[i]));
      const y = Math.round(Number(stroke.p[i + 1]));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      p.push(Math.min(FLAG_W, Math.max(0, x)), Math.min(FLAG_H, Math.max(0, y)));
    }
    if (p.length === 0) continue;
    budget -= p.length / 2;
    strokes.push({ c: whole(stroke.c, ERASER, INKS.length - 1, 0), w: whole(stroke.w, 0, WIDTHS.length - 1, 1), p });
  }
  if (strokes.length === 0) return null;
  return { cloth: whole(raw.cloth, 0, CLOTHS.length - 1, 0), strokes };
}

/** One stroke as an SVG path, rounded off through the midpoints so it doesn't look jagged. */
export function strokePath(p) {
  if (p.length < 4) return `M${p[0]} ${p[1]}h0.01`; // a single dab of the brush
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) {
    d += `Q${p[i]} ${p[i + 1]} ${(p[i] + p[i + 2]) / 2} ${(p[i + 1] + p[i + 3]) / 2}`;
  }
  return `${d}L${p[p.length - 2]} ${p[p.length - 1]}`;
}

export const inkColor = (flag, stroke) => (stroke.c < 0 ? CLOTHS[flag.cloth] : INKS[stroke.c]) ?? INKS[0];

export function strokesSvg(flag) {
  return flag.strokes.map((s) => `<path d="${strokePath(s.p)}" stroke="${inkColor(flag, s)}" stroke-width="${WIDTHS[s.w] ?? WIDTHS[1]}"/>`).join('');
}

/**
 * A whole flag as an SVG picture. The inner <svg> trims fat brush strokes at the
 * edge of the cloth, even when the picture is shown in a box of another shape.
 */
export function flagSvg(flag) {
  const size = `width="${FLAG_W}" height="${FLAG_H}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FLAG_W} ${FLAG_H}" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><svg ${size}><rect ${size} fill="${CLOTHS[flag.cloth] ?? CLOTHS[0]}"/>${strokesSvg(flag)}</svg></svg>`;
}

// ---------------------------------------------------------------------------
// Showing a flag on a screen (browser only)
// ---------------------------------------------------------------------------
//
// Drawings are too bulky to resend with every view, so a view only carries a
// flag's id. The picture is fetched once and remembered.

const pictures = new Map(); // id -> { still, waving } as HTML (both '' while the drawing is on its way)

// A flag in the wind is the picture cut into thin vertical strips. Each strip
// bobs up and down a little later than the one before it, and further the
// further it is from the mast, so a ripple runs along the cloth (the CSS is
// under "Flying Colours" in host.css). Every strip shows its slice of the same
// picture, which the browser only has to draw once.
export const WAVE_STRIPS = 72;
export const WAVE_MS = 2200; // one full ripple

function wavingHtml(flag) {
  const art = `url('data:image/svg+xml,${encodeURIComponent(flagSvg(flag))}')`; // contains no quotes once encoded
  const strips = Array.from({ length: WAVE_STRIPS }, (_, i) => `<i style="--i:${i}"></i>`).join('');
  return `<span class="flag-wave" style="--art:${art}">${strips}</span>`;
}

/**
 * HTML for the flag with this id. Fills itself in as soon as the picture arrives.
 * `waving` shows it rippling in the wind (the TV's parade) instead of flat.
 */
export function flagTag(id, cls = '', waving = false) {
  if (!/^[a-f0-9]{16}$/.test(id ?? '')) return `<span class="flag ${cls}"></span>`;
  if (!pictures.has(id)) {
    pictures.set(id, { still: '', waving: '' });
    fetch(`/api/asset/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('missing'))))
      .then((flag) => {
        const picture = { still: flagSvg(flag), waving: wavingHtml(flag) };
        pictures.set(id, picture);
        for (const el of document.querySelectorAll(`[data-flag="${id}"]`)) el.innerHTML = el.dataset.waving ? picture.waving : picture.still;
      })
      .catch(() => {
        pictures.delete(id);
        setTimeout(() => document.querySelector(`[data-flag="${id}"]`) && flagTag(id), 1500); // wifi blip: try again
      });
  }
  if (!waving) return `<span class="flag ${cls}" data-flag="${id}">${pictures.get(id).still}</span>`;
  // The screen is redrawn now and then; --t puts the ripple back where it was rather than starting it again.
  const t = Math.round(4000 + (performance.now() % WAVE_MS));
  return `<span class="flag is-waving ${cls}" data-flag="${id}" data-waving="1" style="--t:${t}ms">${pictures.get(id).waving}</span>`;
}
