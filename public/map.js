// A small pan-and-zoom treasure map, drawn as SVG from public/world.json.
// Used on the phones (tap to drop an X) and on the TV (the big reveal).
//
// Map space is simple: x = longitude, y = -latitude, so the whole world is the
// rectangle from (-180,-90) to (180,90) and a point's position needs no maths.

const NS = 'http://www.w3.org/2000/svg';
const LIMITS = { minLat: -62, maxLat: 84, minWidth: 5, maxWidth: 360 };

let worldPromise;
const loadWorld = () => (worldPromise ??= fetch('/world.json').then((r) => r.json()));

const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

export function createMap({ onPick = null } = {}) {
  const el = document.createElement('div');
  el.className = 'map';
  const svg = svgEl('svg', { preserveAspectRatio: 'none' });
  const grid = svgEl('g', { class: 'map-grid' });
  const world = svgEl('g');
  const lines = svgEl('g', { class: 'map-lines' });
  const marks = svgEl('g', { class: 'map-marks' });
  svg.append(grid, world, lines, marks);
  el.append(svg);

  // Faint latitude / longitude lines, like an old chart.
  for (let lon = -180; lon <= 180; lon += 30) grid.append(svgEl('line', { x1: lon, x2: lon, y1: -90, y2: 90 }));
  for (let lat = -60; lat <= 60; lat += 30) grid.append(svgEl('line', { x1: -180, x2: 180, y1: lat, y2: lat }));

  loadWorld().then((data) => {
    world.setAttribute('transform', `scale(${1 / data.scale})`);
    world.append(svgEl('path', { class: 'map-land', d: data.land }), svgEl('path', { class: 'map-borders', d: data.borders }));
  });

  // What part of the world is on screen: centre + width, in degrees.
  const view = { cx: 0, cy: -15, w: 360 };
  let pickable = false;
  let flight = 0;

  const size = () => el.getBoundingClientRect();
  const unitsPerPixel = () => view.w / (size().width || 1);

  function apply() {
    const rect = size();
    if (!rect.width || !rect.height) return;
    view.w = Math.min(LIMITS.maxWidth, Math.max(LIMITS.minWidth, view.w));
    view.cx = Math.min(180, Math.max(-180, view.cx));
    view.cy = Math.min(-LIMITS.minLat, Math.max(-LIMITS.maxLat, view.cy));
    const h = (view.w * rect.height) / rect.width;
    svg.setAttribute('viewBox', `${view.cx - view.w / 2} ${view.cy - h / 2} ${view.w} ${h}`);
    // Markers stay the same size on screen however far you zoom.
    // (offsetWidth ignores the TV's stage scaling, so markers scale with the stage.)
    const u = view.w / (el.offsetWidth || rect.width);
    for (const mark of marks.children) mark.setAttribute('transform', `translate(${mark.dataset.x} ${mark.dataset.y}) scale(${u})`);
  }
  new ResizeObserver(apply).observe(el);

  const toMap = (clientX, clientY) => {
    const rect = size();
    const u = unitsPerPixel();
    return { x: view.cx + (clientX - rect.left - rect.width / 2) * u, y: view.cy + (clientY - rect.top - rect.height / 2) * u };
  };

  function zoomAt(clientX, clientY, factor) {
    const before = toMap(clientX, clientY);
    view.w = Math.min(LIMITS.maxWidth, Math.max(LIMITS.minWidth, view.w * factor));
    const after = toMap(clientX, clientY);
    view.cx += before.x - after.x;
    view.cy += before.y - after.y;
    apply();
  }

  // ----- touch / mouse: drag to pan, pinch or wheel to zoom, tap to pick -----
  const fingers = new Map();
  let travelled = 0;
  let wasPinch = false;

  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 1) {
      travelled = 0;
      wasPinch = false;
    } else {
      wasPinch = true;
    }
    cancelAnimationFrame(flight);
  });

  svg.addEventListener('pointermove', (e) => {
    const prev = fingers.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    if (fingers.size === 1) {
      const u = unitsPerPixel();
      view.cx -= (next.x - prev.x) * u;
      view.cy -= (next.y - prev.y) * u;
      travelled += Math.abs(next.x - prev.x) + Math.abs(next.y - prev.y);
      fingers.set(e.pointerId, next);
      apply();
    } else if (fingers.size === 2) {
      const other = [...fingers].find(([id]) => id !== e.pointerId)[1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      fingers.set(e.pointerId, next);
      if (before > 0 && after > 0) zoomAt((next.x + other.x) / 2, (next.y + other.y) / 2, before / after);
    }
  });

  const lift = (e) => {
    if (!fingers.has(e.pointerId)) return;
    fingers.delete(e.pointerId);
    if (e.type === 'pointerup' && fingers.size === 0 && !wasPinch && travelled < 12 && pickable && onPick) {
      const p = toMap(e.clientX, e.clientY);
      onPick({ lat: Math.min(89, Math.max(-89, -p.y)), lng: Math.min(180, Math.max(-180, p.x)) });
    }
  };
  svg.addEventListener('pointerup', lift);
  svg.addEventListener('pointercancel', lift);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  // ----- drawing markers -----

  function markEl(m) {
    const g = svgEl('g', { class: `mark mark-${m.kind}` });
    g.dataset.x = m.lng;
    g.dataset.y = -m.lat;
    if (m.delay) g.style.animationDelay = `${m.delay}ms`;
    const inner = svgEl('g', { class: 'mark-body' });
    if (m.delay) inner.style.animationDelay = `${m.delay}ms`;
    if (m.kind === 'x') {
      // The treasure: a bold red X.
      inner.append(
        svgEl('path', { class: 'x-halo', d: 'M-15,-15L15,15M15,-15L-15,15' }),
        svgEl('path', { class: 'x-ink', d: 'M-15,-15L15,15M15,-15L-15,15' }),
      );
    } else {
      // A player's guess: a coloured dot with their emoji.
      const r = m.kind === 'me' ? 15 : 19;
      inner.append(svgEl('circle', { r, fill: m.color ?? '#c8372d', class: 'pin-dot' }));
      if (m.emoji) {
        const face = svgEl('text', { class: 'pin-face', y: 1 });
        face.textContent = m.emoji;
        inner.append(face);
      }
    }
    if (m.label) {
      const text = svgEl('text', { class: 'mark-label', y: m.kind === 'x' ? -26 : 40 });
      text.textContent = m.label;
      inner.append(text);
    }
    g.append(inner);
    return g;
  }

  return {
    el,
    setPickable(on) {
      pickable = on;
    },
    /** marks: [{ lat, lng, kind: 'x' | 'pin' | 'me', color, emoji, label, delay }], lines: [{ from, to, color, delay }] */
    draw({ marks: markList = [], lines: lineList = [] }) {
      marks.replaceChildren(...markList.map(markEl));
      lines.replaceChildren(
        ...lineList.map((l) => {
          const line = svgEl('line', { x1: l.from.lng, y1: -l.from.lat, x2: l.to.lng, y2: -l.to.lat, stroke: l.color ?? '#2b1b0f' });
          if (l.delay) line.style.animationDelay = `${l.delay}ms`;
          return line;
        }),
      );
      apply();
    },
    /** Show the whole world. */
    reset() {
      cancelAnimationFrame(flight);
      const rect = size();
      const aspect = rect.width && rect.height ? rect.width / rect.height : 2;
      // Wide screens fit the height; tall phones fit the width.
      view.w = Math.min(360, (LIMITS.maxLat - LIMITS.minLat) * aspect * 1.02);
      if (aspect < 1) view.w = 360;
      view.cx = 0;
      view.cy = -(LIMITS.maxLat + LIMITS.minLat) / 2;
      apply();
    },
    zoomBy(factor) {
      const rect = size();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
    },
    /** Glide the camera so that all the given { lat, lng } points are in view. */
    flyTo(points, ms = 1800) {
      const rect = size();
      if (!points.length || !rect.width) return;
      const xs = points.map((p) => p.lng);
      const ys = points.map((p) => -p.lat);
      const spanX = Math.max(...xs) - Math.min(...xs);
      const spanY = Math.max(...ys) - Math.min(...ys);
      const target = {
        cx: (Math.max(...xs) + Math.min(...xs)) / 2,
        cy: (Math.max(...ys) + Math.min(...ys)) / 2,
        w: Math.min(360, Math.max(28, spanX * 1.5, spanY * 1.6 * (rect.width / rect.height))),
      };
      const from = { ...view };
      const start = performance.now();
      cancelAnimationFrame(flight);
      const step = (now) => {
        const t = Math.min(1, (now - start) / ms);
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease in-out
        view.cx = from.cx + (target.cx - from.cx) * e;
        view.cy = from.cy + (target.cy - from.cy) * e;
        view.w = from.w + (target.w - from.w) * e;
        apply();
        if (t < 1) flight = requestAnimationFrame(step);
      };
      flight = requestAnimationFrame(step);
    },
  };
}
