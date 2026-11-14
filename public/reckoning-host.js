// Dead Reckoning on the big screen: a model of the world that fills the TV,
// drawn in 3D with three.js. The land is cut out of board and painted, with
// little carved mountains, and it sits in a resin sea with a few ships on it.
//
// host.js draws the words (the clues, the results); this file owns the model
// and everything that happens to it.
//
// How it fits together
// --------------------
// * show(view) is called every time the server sends a new view. There are
//   three kinds: the title card (the whole world), the guessing (the camera
//   wanders slowly along the map, like somebody searching it), and the reveal.
// * The reveal is acted out here: the camera flies to the spot, a red X is
//   stamped on it, then everybody's pin is stuck in the map, furthest first,
//   each with a trail of dots back to the X. REVEAL has the timings, and the
//   results panel uses the same ones so the two stay in step.
// * Everything that moves is a "tween": a little function called every frame
//   with a number going from 0 to 1.
//
// World units: one degree is 1/15 of a unit, so the world is 24 wide. x runs
// west to east, y is up, z comes towards the camera (south). The sea is at
// y = 0 and the land is a slab LAND thick sitting on it. The land is laid out
// three times side by side, so the map carries on past its own edges.

import * as THREE from './vendor/three.module.min.js';
import { createLookPass } from './looks3d.js';
import * as sound from './sound.js';
import { esc, fmt } from './common.js';

const DEG = 1 / 15; // one degree of the map, in world units
const LAT = { south: -86, north: 84 }; // beyond these it is all ice
const MID = (LAT.south + LAT.north) / 2;
const WIDE = 360 * DEG; // once round the world
const LAND = 0.14; // how thick the land is
const MARK = 0.03; // pins and the X are sized by how far away the camera is, so they look the same however close it gets

/** When things happen in the reveal, in seconds. */
export const REVEAL = {
  x: 1.3, // the X is stamped on the spot
  pins: 3.1, // the first pin goes in
  gap: (n) => Math.min(0.55, 4.5 / Math.max(1, n)), // ...and the rest follow this far apart
};

// Where on the 1920x1080 stage the model has to fit, for each kind of shot.
const BOX = {
  wide: { left: 0, right: 1920, top: 190, bottom: 1060 }, // the whole world
  search: { left: 0, right: 1270, top: 120, bottom: 1075 }, // top to bottom, beside the clues
  reveal: { left: 90, right: 1240, top: 290, bottom: 930 }, // beside the results
};

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeIn = (k) => k ** 3;
const easeInOut = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
const backOut = (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;
const linear = (k) => k;

/** Where a place on the map is in the model. */
const spot = (lat, lng, y = 0) => new THREE.Vector3(lng * DEG, y, -(clamp(lat, LAT.south, LAT.north) - MID) * DEG);

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

let layer = null; // the <div> that holds the canvas and the name tags drawn over it
// Lighting styles (see looks3d.js). House style: kept very subtle so the map
// stays crisp: a faint fine dither only where the light changes, and soft ink
// round the carved coastlines and everything on the table.
const LOOK_TUNING = {
  knee: 1,
  house: {
    light: { pattern: 'bayer', bands: 6, cell: 2, spread: 0.3, amount: 0.35 },
    post: { outline: { strength: 0.55, width: 1.2, colour: 0x2a1a0e, crease: 0.6 } },
  },
};
let styler = null;

let tagsEl, renderer, scene, camera, sun, water;
let running = false;
let lastFrame = 0;
let clock = 0;
let shake = 0;
let players = new Map();
let shownKey = null;
let mode = null; // 'dr-round' | 'dr-guess' | 'dr-reveal'
let flight = null; // the camera move in progress, if there is one
let pan = null; // { mid, half, from }: the slow wander along the map while people guess
let revealPoints = null; // what the reveal shot has to keep in view (for when the window is resized)
let land = []; // the coastlines, kept so we can tell land from sea: [{ pts, box, holes }]

const tweens = new Set();
const marks = new Set(); // pins and the X: { group, at, lift, pop, light }
const tags = new Set(); // name tags: { el, at, rise, w, h, x, y, dy, fixed }
const loose = new Set(); // anything else to clear off the map between rounds
const ships = [];
const cam = { target: new THREE.Vector3(0, 0, 0), dist: 34, elevation: 1.1 };

/** Run fn(eased, raw) every frame for `dur` seconds. */
function tween(dur, fn, { delay = 0, ease = easeOut, done = null } = {}) {
  const tw = { t: -delay, dur: Math.max(0.001, dur), fn, ease, done };
  tweens.add(tw);
  return tw;
}
const after = (delay, fn) => tween(0.001, () => {}, { delay, done: fn });

// ----- paint and parts -----

const paints = new Map();
/** A pot of paint. Everything is flat-shaded, so the models look hand-carved. */
function paint(color, { glow = 0, rough = 0.75, side = THREE.FrontSide } = {}) {
  const key = `${color}:${glow}:${rough}:${side}`;
  if (!paints.has(key)) {
    paints.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: rough, metalness: 0.02, side, emissive: glow ? color : 0x000000, emissiveIntensity: glow }));
  }
  return paints.get(key);
}

const SHAPES = {};
function shapes() {
  if (SHAPES.box) return SHAPES;
  SHAPES.box = new THREE.BoxGeometry(1, 1, 1);
  SHAPES.ball = new THREE.IcosahedronGeometry(1, 1);
  SHAPES.rod = new THREE.CylinderGeometry(1, 1, 1, 8);
  SHAPES.cone = new THREE.ConeGeometry(1, 1, 7);
  SHAPES.peak = new THREE.ConeGeometry(1, 1, 5);
  SHAPES.disc = new THREE.CylinderGeometry(1, 1, 1, 20);
  SHAPES.dot = new THREE.CylinderGeometry(1, 1, 1, 8);
  SHAPES.flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  SHAPES.ring = new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2);
  return SHAPES;
}

/** Make one painted piece and (optionally) add it to a parent. */
function part(geometry, material, { at = [0, 0, 0], size = [1, 1, 1], turn = [0, 0, 0], shadow = true, into = null } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...at);
  m.scale.set(...(Array.isArray(size) ? size : [size, size, size]));
  m.rotation.set(...turn);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  into?.add(m);
  return m;
}

/** A drawing on a canvas, to stick onto a model. */
function decal(draw, width = 256, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function init() {
  shapes();
  layer = document.createElement('div');
  layer.id = 'drLayer';
  layer.hidden = true;
  layer.innerHTML = '<div class="dr-vignette"></div><div class="dr-tags"></div>';
  document.getElementById('stage').before(layer);
  tagsEl = layer.querySelector('.dr-tags');

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  styler = createLookPass(renderer, LOOK_TUNING);
  layer.prepend(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x123c46);
  camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.5, 240);

  scene.add(new THREE.HemisphereLight(0xfff1d8, 0x4a6a80, 1.25));
  sun = new THREE.DirectionalLight(0xffe9c4, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);

  buildSea();
  buildWorld();
  window.addEventListener('resize', () => {
    fit();
    reframe();
  });
  fit();
}

// ----- the sea -----

function buildSea() {
  const S = shapes();

  // One sheet of little triangles, each a slightly different blue, which rises and falls.
  const g = new THREE.PlaneGeometry(WIDE * 3, 26, 200, 64).rotateX(-Math.PI / 2).toNonIndexed(); // a good way past the top of the map, so there is always open water up there
  const count = g.attributes.position.count;
  const colours = new Float32Array(count * 3);
  const base = new THREE.Color();
  for (let i = 0; i < count; i += 3) {
    base.setHSL(0.53 + rand(-0.012, 0.012), 0.6, 0.29 + rand(-0.025, 0.035));
    for (let k = 0; k < 3; k++) base.toArray(colours, (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  water = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.22, metalness: 0.15 }));
  water.receiveShadow = true;
  scene.add(water);

  // An ice shelf across the bottom of the world: like the sea, a sheet of triangles in slightly different whites.
  const south = spot(LAT.south, 0).z;
  const shelf = new THREE.PlaneGeometry(WIDE * 3, 12, 150, 24).rotateX(-Math.PI / 2).toNonIndexed();
  const whites = new Float32Array(shelf.attributes.position.count * 3);
  for (let i = 0; i < whites.length / 3; i += 3) {
    base.setHSL(0.55 + rand(-0.03, 0.03), 0.3, 0.88 + rand(-0.05, 0.05));
    for (let k = 0; k < 3; k++) base.toArray(whites, (i + k) * 3);
  }
  shelf.setAttribute('color', new THREE.BufferAttribute(whites, 3));
  const ice = new THREE.Mesh(shelf, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6 }));
  ice.position.set(0, LAND + 0.002, south + 6);
  ice.receiveShadow = true;
  scene.add(ice);

  // Pack ice across the top: hundreds of floes, thin at first and crowding together towards the pole.
  const north = spot(LAT.north, 0).z;
  const floes = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), paint(0xf4f6f3, { rough: 0.7 }), 520);
  const floe = new THREE.Object3D();
  for (let i = 0; i < floes.count; i++) {
    const far = 1 - Math.random() ** 2; // 0 at the edge of the pack, 1 at the pole
    const size = rand(0.08, 0.2) + far * rand(0.1, 0.5);
    floe.position.set(rand(-WIDE * 1.5, WIDE * 1.5), 0.03, north + 0.25 - far * 4.6);
    floe.rotation.set(0, rand(0, 3), 0);
    floe.scale.set(size, rand(0.05, 0.1), size * rand(0.6, 1));
    floe.updateMatrix();
    floes.setMatrixAt(i, floe.matrix);
  }
  floes.castShadow = true;
  floes.receiveShadow = true;
  scene.add(floes);

  // A compass rose, painted on the sea where there is nothing else to look at.
  const rose = decal((c, s) => {
    c.translate(s / 2, s / 2);
    c.strokeStyle = 'rgba(244, 230, 193, 0.55)';
    c.lineWidth = s * 0.012;
    for (const r of [0.44, 0.33]) {
      c.beginPath();
      c.arc(0, 0, s * r, 0, Math.PI * 2);
      c.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const long = i % 4 === 0;
      const len = s * (long ? 0.42 : i % 2 === 0 ? 0.3 : 0.18);
      c.save();
      c.rotate((i * Math.PI) / 8);
      c.fillStyle = long ? 'rgba(244, 230, 193, 0.8)' : 'rgba(244, 230, 193, 0.45)';
      c.beginPath();
      c.moveTo(0, -len);
      c.lineTo(s * 0.035, 0);
      c.lineTo(-s * 0.035, 0);
      c.fill();
      c.fillStyle = 'rgba(200, 55, 45, 0.75)';
      if (long) {
        c.beginPath();
        c.moveTo(0, -len);
        c.lineTo(0, 0);
        c.lineTo(-s * 0.035, 0);
        c.fill();
      }
      c.restore();
    }
    c.fillStyle = 'rgba(244, 230, 193, 0.9)';
    c.font = `${s * 0.085}px "Pirata One", Georgia, serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('N', 0, -s * 0.465);
  }, 512);
  const roseAt = spot(-38, 84, 0.05);
  part(S.flat, new THREE.MeshStandardMaterial({ map: rose, transparent: true, depthWrite: false, roughness: 0.6 }), { at: roseAt.toArray(), size: [2.6, 1, 2.6], shadow: false, into: scene });

  // Three little ships, a long way from anywhere.
  for (const [lat, lng, turn] of [[31, -43, 0.5], [6, -146, -0.4], [-14, 76, 2.4], [-48, -20, 2.9], [40, 165, 0.2]]) ships.push(ship(spot(lat, lng), turn));
}

function ship(at, turn) {
  const S = shapes();
  const g = new THREE.Group();
  const oak = paint(0x6b4526);
  const sail = paint(0xf1e6c8, { rough: 0.9, side: THREE.DoubleSide });
  part(S.box, oak, { at: [0, 0.06, 0], size: [0.46, 0.12, 0.17], into: g });
  part(S.cone, oak, { at: [0.31, 0.06, 0], size: [0.085, 0.18, 0.085], turn: [0, 0, -Math.PI / 2], into: g }); // the bow
  part(S.box, paint(0x4a2f18), { at: [-0.2, 0.15, 0], size: [0.12, 0.08, 0.17], into: g }); // the stern castle
  for (const [x, h] of [[0.08, 0.5], [-0.1, 0.4]]) {
    part(S.rod, oak, { at: [x, 0.12 + h / 2, 0], size: [0.012, h, 0.012], into: g });
    part(S.box, sail, { at: [x + 0.02, 0.14 + h * 0.6, 0], size: [0.02, h * 0.55, 0.26], into: g });
  }
  part(S.box, paint(0x17151c), { at: [0.05, 0.66, 0], size: [0.09, 0.05, 0.01], into: g }); // a very small Jolly Roger
  g.position.copy(at);
  g.rotation.y = turn;
  scene.add(g);
  return { g, seed: rand(0, 6) };
}

// ---------------------------------------------------------------------------
// The world: coastlines from world.json, cut out of board and painted
// ---------------------------------------------------------------------------

/** The outlines in world.json: "M x,y l dx,dy dx,dy ... z", in twentieths of a degree, north upwards. */
function outlines(d, scale) {
  const lines = [];
  for (const piece of d.split('M')) {
    if (!piece) continue;
    const closed = piece.endsWith('z');
    const [start, steps = ''] = (closed ? piece.slice(0, -1) : piece).split('l');
    let [x, y] = start.split(',').map(Number);
    const pts = [[x / scale, y / scale]];
    for (const step of steps.split(' ')) {
      if (!step) continue;
      const comma = step.indexOf(',');
      x += Number(step.slice(0, comma));
      y += Number(step.slice(comma + 1));
      pts.push([x / scale, y / scale]);
    }
    lines.push({ pts, closed });
  }
  return lines;
}

/** Drop the points that are closer together than `step` degrees. A carved coast wants fewer, bigger cuts. */
function coarser(pts, step, closed) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const last = out[out.length - 1];
    if ((pts[i][0] - last[0]) ** 2 + (pts[i][1] - last[1]) ** 2 >= step * step) out.push(pts[i]);
  }
  if (!closed && out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  // A very small island would vanish altogether: keep it as a triangle.
  if (closed && out.length < 3 && pts.length >= 3) return [pts[0], pts[Math.floor(pts.length / 3)], pts[Math.floor((pts.length * 2) / 3)]];
  return out;
}

/** Cut an outline off at the edges of the map. */
function trimmed(pts) {
  const edges = [[0, -180, 1], [0, 180, -1], [1, -LAT.north, 1], [1, -LAT.south, -1]];
  if (pts.every((p) => edges.every(([axis, bound, way]) => (p[axis] - bound) * way >= 0))) return pts;
  let out = pts;
  for (const [axis, bound, way] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i];
      const b = src[(i + 1) % src.length];
      const inA = (a[axis] - bound) * way >= 0;
      const inB = (b[axis] - bound) * way >= 0;
      if (inA) out.push(a);
      if (inA !== inB) {
        const k = (bound - a[axis]) / (b[axis] - a[axis]);
        out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
      }
    }
  }
  return out;
}

function area(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

function boxOf(pts) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of pts) {
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  }
  return box;
}

function within(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** How high the ground is at a place: the top of the land, or just above the water. */
function groundAt(lat, lng) {
  const y = -lat;
  for (const piece of land) {
    const [x0, y0, x1, y1] = piece.box;
    if (lng < x0 || lng > x1 || y < y0 || y > y1 || !within(piece.pts, lng, y)) continue;
    if (!piece.holes.some((h) => within(h, lng, y))) return LAND + 0.012;
  }
  return 0.05;
}

/** The paint for the top of the land: greens and sands by latitude, with the deserts, jungles and ice dabbed on. */
function landPaint() {
  const span = LAT.north - LAT.south;
  return decal((c, w, h) => {
    const X = (lng) => ((lng + 180) / 360) * w;
    const Y = (lat) => ((LAT.north - lat) / span) * h;
    const bands = c.createLinearGradient(0, 0, 0, h);
    for (const [lat, colour] of [[84, '#f2f1e8'], [74, '#e6e8da'], [67, '#a9b78c'], [58, '#6e9463'], [46, '#86a95f'], [33, '#a5b267'], [20, '#8fae5d'], [4, '#5d9853'], [-12, '#7fa858'], [-28, '#a8b168'], [-42, '#7fa55f'], [-56, '#9aab7b'], [-61, '#eceee6'], [-86, '#f6f6f1']]) {
      bands.addColorStop((LAT.north - lat) / span, colour);
    }
    c.fillStyle = bands;
    c.fillRect(0, 0, w, h);
    const dab = (lng, lat, rx, ry, colour) => {
      c.save();
      c.translate(X(lng), Y(lat));
      c.scale((rx / 360) * w, (ry / span) * h);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `${colour}e6`);
      g.addColorStop(0.45, `${colour}b0`);
      g.addColorStop(1, `${colour}00`);
      c.fillStyle = g;
      c.fillRect(-1, -1, 2, 2);
      c.restore();
    };
    const SAND = '#dcc487';
    const JUNGLE = '#4b8a4c';
    const ICE = '#f4f3ec';
    // deserts
    for (const d of [[8, 23, 30, 9], [28, 26, 12, 7], [46, 23, 11, 9], [58, 33, 9, 6], [64, 42, 10, 5], [102, 42, 14, 5], [71, 27, 5, 4], [133, -25, 16, 9], [20, -24, 8, 7], [-69, -24, 4, 9], [-68, -44, 5, 7], [-111, 31, 9, 6], [46, 8, 6, 5]]) dab(...d, SAND);
    // jungle
    for (const d of [[-62, -4, 17, 11], [21, 0, 13, 8], [112, 1, 21, 9], [-87, 14, 7, 5], [100, 16, 8, 8], [142, -5, 9, 5]]) dab(...d, JUNGLE);
    // ice
    for (const d of [[-41, 73, 20, 11], [-75, 80, 22, 6], [95, 79, 30, 4], [17, 79, 10, 3]]) dab(...d, ICE);
    // A dry brush over the lot, so it looks painted rather than printed.
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = Math.random() < 0.5 ? `rgba(255, 250, 225, ${rand(0.02, 0.08)})` : `rgba(40, 60, 30, ${rand(0.02, 0.07)})`;
      c.fillRect(Math.random() * w, Math.random() * h, rand(2, 9), rand(1, 3));
    }
  }, 2048, Math.round((2048 * span) / 360));
}

async function buildWorld() {
  let data;
  try {
    data = await fetch('/world.json').then((r) => r.json());
  } catch {
    return; // no map: the pins still work, on an empty sea
  }
  const rings = outlines(data.land, data.scale)
    .filter((l) => l.closed)
    .map((l) => trimmed(coarser(l.pts, 0.1, true)))
    .filter((pts) => pts.length >= 3)
    .map((pts) => ({ pts, area: area(pts), box: boxOf(pts), holes: [] }));
  if (!rings.length) return;

  // Lakes and inland seas are drawn the other way round from coastlines. Give each to the land it is a hole in.
  const biggest = rings.reduce((a, b) => (Math.abs(b.area) > Math.abs(a.area) ? b : a));
  const coasts = rings.filter((r) => Math.sign(r.area) === Math.sign(biggest.area));
  for (const hole of rings) {
    if (coasts.includes(hole)) continue;
    const [x, y] = hole.pts[0];
    const home = coasts
      .filter((c) => x >= c.box[0] && x <= c.box[2] && y >= c.box[1] && y <= c.box[3] && within(c.pts, x, y))
      .sort((a, b) => Math.abs(a.area) - Math.abs(b.area))[0];
    home?.holes.push(hole.pts);
  }
  land = coasts;

  // The top of the land (triangles) and its cut edge (a wall round every outline).
  const span = LAT.north - LAT.south;
  const top = { pos: [], uv: [] };
  const wall = [];
  const ink = [];
  const X = (p) => p[0] * DEG;
  const Z = (p) => (p[1] + MID) * DEG;
  const vec = (pts) => pts.map((p) => new THREE.Vector2(p[0], p[1]));
  for (const coast of coasts) {
    const contour = vec(coast.pts);
    const holes = coast.holes.map(vec);
    let faces;
    try {
      faces = THREE.ShapeUtils.triangulateShape(contour, holes);
    } catch {
      continue;
    }
    const all = contour.concat(...holes);
    for (const face of faces) {
      let [a, b, cc] = face.map((i) => all[i]);
      if ((b.y - a.y) * (cc.x - a.x) - (b.x - a.x) * (cc.y - a.y) < 0) [b, cc] = [cc, b]; // face up
      for (const p of [a, b, cc]) {
        top.pos.push(p.x * DEG, LAND, (p.y + MID) * DEG);
        top.uv.push((p.x + 180) / 360, (-p.y - LAT.south) / span);
      }
    }
    for (const pts of [coast.pts, ...coast.holes]) {
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        wall.push(X(a), LAND, Z(a), X(b), LAND, Z(b), X(b), -0.1, Z(b), X(a), LAND, Z(a), X(b), -0.1, Z(b), X(a), -0.1, Z(a));
        ink.push(X(a), LAND + 0.004, Z(a), X(b), LAND + 0.004, Z(b));
      }
    }
  }

  const topG = new THREE.BufferGeometry();
  topG.setAttribute('position', new THREE.Float32BufferAttribute(top.pos, 3));
  topG.setAttribute('uv', new THREE.Float32BufferAttribute(top.uv, 2));
  topG.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(top.pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const world = new THREE.Group();
  const topMesh = new THREE.Mesh(topG, new THREE.MeshStandardMaterial({ map: landPaint(), roughness: 0.92, metalness: 0 }));
  topMesh.receiveShadow = true;
  world.add(topMesh);

  const wallG = new THREE.BufferGeometry();
  wallG.setAttribute('position', new THREE.Float32BufferAttribute(wall, 3));
  wallG.computeVertexNormals();
  const wallMesh = new THREE.Mesh(wallG, paint(0xa98652, { rough: 0.9, side: THREE.DoubleSide }));
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  world.add(wallMesh);

  // The coast inked round the edge, and the borders scored across the top.
  const line = (points, colour, opacity) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    world.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity })));
  };
  line(ink, 0x3d2a12, 0.7);
  const scored = [];
  for (const border of outlines(data.borders, data.scale)) {
    const pts = coarser(border.pts, 0.1, false);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (Math.max(a[1], b[1]) > -LAT.south || Math.min(a[1], b[1]) < -LAT.north || Math.abs(a[0]) > 180 || Math.abs(b[0]) > 180) continue;
      scored.push(X(a), LAND + 0.006, Z(a), X(b), LAND + 0.006, Z(b));
    }
  }
  line(scored, 0x4a3518, 0.38);

  buildMountains(world);

  // The same world again to the west and to the east, so the map carries on past the edge of the screen.
  scene.add(world);
  for (const side of [-1, 1]) {
    const again = world.clone();
    again.position.x = side * WIDE;
    scene.add(again);
  }
}

/** Mountain ranges, as rows of little carved peaks with snow on. */
function buildMountains(world) {
  const peaks = [];
  const range = (from, to, n, size) => {
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : i / (n - 1);
      peaks.push([from[0] + (to[0] - from[0]) * k + rand(-0.7, 0.7), from[1] + (to[1] - from[1]) * k + rand(-0.7, 0.7), size * rand(0.75, 1.15)]);
    }
  };
  range([35, 74], [27.5, 96], 10, 0.2); // Himalaya
  range([36.5, 80], [35.5, 98], 6, 0.15);
  range([42, 76], [42.5, 86], 3, 0.15); // Tian Shan
  range([49, 88], [47, 96], 2, 0.13); // Altai
  range([36, 70], [36, 70], 1, 0.16); // Hindu Kush
  range([34, 47], [29.5, 53], 3, 0.12); // Zagros
  range([36, 52], [36, 52], 1, 0.11);
  range([44.6, 6.6], [47.2, 13.4], 4, 0.11); // Alps
  range([42.7, -0.4], [42.5, 1.6], 2, 0.08); // Pyrenees
  range([47.3, 25], [45.5, 25], 2, 0.08); // Carpathians
  range([43, 41.5], [41.6, 47], 3, 0.12); // Caucasus
  range([60.5, 8], [68, 17], 5, 0.1); // Scandinavia
  range([52, 59], [65, 60], 5, 0.09); // Urals
  range([37, 32], [38.5, 42.5], 3, 0.1); // Turkey
  range([31, -8], [35, 3], 4, 0.1); // Atlas
  range([8, 38], [12.5, 39], 3, 0.12); // Ethiopia
  range([-3.1, 37.3], [-3.1, 37.3], 1, 0.13); // Kilimanjaro
  range([-29.5, 29], [-29.5, 29], 1, 0.1); // Drakensberg
  range([23.3, 5.7], [20.5, 17.5], 2, 0.08); // the Sahara's own
  range([15, 44], [15, 44], 1, 0.09); // Yemen
  range([60, -128], [36, -106], 10, 0.16); // Rockies
  range([63, -151], [61, -141], 2, 0.15); // Alaska
  range([47, -121.5], [37, -119], 4, 0.11); // Cascades, Sierra Nevada
  range([27, -107], [19, -99], 4, 0.1); // Sierra Madre
  range([36, -82], [43, -73], 3, 0.06); // Appalachians
  for (const [a, b, n] of [[[8, -73], [-2, -78.5], 3], [[-6, -77.5], [-16, -70.5], 4], [[-19, -68], [-30, -69.8], 4], [[-34, -70.2], [-51, -73], 6]]) range(a, b, n, 0.15); // Andes
  range([36.3, 138], [43.2, 142.8], 2, 0.08); // Japan
  range([56, 160], [56, 160], 1, 0.1); // Kamchatka
  range([6, 116.5], [6, 116.5], 1, 0.09); // Borneo
  range([-4.5, 138], [-6, 145], 3, 0.13); // New Guinea
  range([-43.4, 170.6], [-44.7, 168.4], 2, 0.09); // New Zealand
  range([-36.5, 148.3], [-36.5, 148.3], 1, 0.07);
  range([57, -4.8], [57, -4.8], 1, 0.05); // the Highlands
  range([64.6, -18], [64.6, -18], 1, 0.07); // Iceland
  range([42.5, 13.5], [42.5, 21], 2, 0.06);

  const rock = new THREE.InstancedMesh(SHAPES.peak, paint(0x8d8672, { rough: 0.9 }), peaks.length);
  const snow = new THREE.InstancedMesh(SHAPES.peak, paint(0xf6f4ec, { rough: 0.8 }), peaks.length);
  const at = new THREE.Object3D();
  peaks.forEach(([lat, lng, r], i) => {
    const h = r * 1.5;
    at.position.copy(spot(lat, lng, LAND + h / 2));
    at.rotation.set(0, rand(0, 6), 0);
    at.scale.set(r, h, r);
    at.updateMatrix();
    rock.setMatrixAt(i, at.matrix);
    at.position.y = LAND + h * 0.79;
    at.scale.set(r * 0.44, h * 0.42, r * 0.44);
    at.updateMatrix();
    snow.setMatrixAt(i, at.matrix);
  });
  for (const m of [rock, snow]) {
    m.castShadow = true;
    m.receiveShadow = true;
    world.add(m);
  }
}

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

function fit() {
  if (!layer) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  layer.style.setProperty('--u', Math.min(w / 1920, h / 1080)); // one "TV pixel", the same scale host.js uses for its stage
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  for (const t of tags) Object.assign(t, { w: t.el.offsetWidth, h: t.el.offsetHeight });
}

function aimCamera(jx = 0, jy = 0) {
  const { target, dist, elevation } = cam;
  camera.position.set(target.x + jx, target.y + Math.sin(elevation) * dist + jy, target.z + Math.cos(elevation) * dist);
  camera.lookAt(target.x + jx * 0.6, target.y, target.z);
  camera.updateMatrixWorld();
}

/**
 * Where the camera has to be so that every one of `points` lands inside `box`
 * (a rectangle on the 1920x1080 stage). With `across: false` only the height
 * has to fit, and the camera stays where it is from side to side.
 */
function framing(points, box, elevation, { across = true } = {}) {
  const saved = { target: cam.target.clone(), dist: cam.dist, elevation: cam.elevation };
  const w = window.innerWidth;
  const h = window.innerHeight;
  const unit = Math.min(w / 1920, h / 1080);
  const L = ((box.left - 960) * unit) / (w / 2);
  const R = ((box.right - 960) * unit) / (w / 2);
  const T = ((540 - box.top) * unit) / (h / 2);
  const B = ((540 - box.bottom) * unit) / (h / 2);

  const middle = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / points.length);
  cam.target.set(across ? middle.x : 0, 0, middle.z);
  cam.dist = 30;
  cam.elevation = elevation;
  const v = new THREE.Vector3();
  for (let i = 0; i < 60; i++) {
    aimCamera();
    let lo = Infinity;
    let hi = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (const p of points) {
      v.copy(p).project(camera);
      lo = Math.min(lo, v.y);
      hi = Math.max(hi, v.y);
      left = Math.min(left, v.x);
      right = Math.max(right, v.x);
    }
    const grow = Math.max(across ? (right - left) / (R - L) : 0, (hi - lo) / (T - B));
    cam.dist = clamp(cam.dist * (1 + (grow - 1) * 0.8), 3, 90);
    if (across) cam.target.x += ((right + left) / 2 - (R + L) / 2) * cam.dist * 0.16 * camera.aspect;
    cam.target.z -= ((hi + lo) / 2 - (T + B) / 2) * cam.dist * 0.18;
  }
  aimCamera();
  // How far a step sideways across the map moves things on the screen (for the pan).
  const here = v.copy(cam.target).project(camera).x;
  const perUnit = v.set(cam.target.x + 1, 0, cam.target.z).project(camera).x - here;
  const shot = { target: cam.target.clone(), dist: cam.dist, elevation, perUnit, L, R };
  cam.target.copy(saved.target);
  cam.dist = saved.dist;
  cam.elevation = saved.elevation;
  aimCamera();
  return shot;
}

/** The corners of a slice of the map, from one latitude to another. */
const corners = (south, north) => {
  const out = [];
  for (const lng of [-180, 180]) for (const lat of [south, north]) out.push(spot(lat, lng), spot(lat, lng, 0.5));
  return out;
};

const wideShot = () => framing(corners(-80, LAT.north), BOX.wide, 1.13);

/** The shot for the guessing: the map fills the screen from top to bottom, and the camera wanders from one end of it to the other. */
function searchShot() {
  const shot = framing(corners(-57, 80), BOX.search, 1.05, { across: false });
  const west = -WIDE / 2 - shot.L / shot.perUnit; // the camera position that puts the west end of the map on the left of the screen
  const east = WIDE / 2 - shot.R / shot.perUnit; // ...and the east end up against the clues
  shot.mid = (west + east) / 2;
  shot.half = Math.max(0, (east - west) / 2);
  shot.target.x = shot.mid;
  return shot;
}

function jump(shot) {
  if (flight) tweens.delete(flight);
  flight = null;
  cam.target.copy(shot.target);
  cam.dist = shot.dist;
  cam.elevation = shot.elevation;
}

function fly(shot, dur, done = null) {
  if (flight) tweens.delete(flight);
  pan = null;
  const from = { target: cam.target.clone(), dist: cam.dist, elevation: cam.elevation };
  flight = tween(dur, (k) => {
    cam.target.lerpVectors(from.target, shot.target, k);
    cam.dist = from.dist + (shot.dist - from.dist) * k;
    cam.elevation = from.elevation + (shot.elevation - from.elevation) * k;
  }, { ease: easeInOut, done: () => {
    flight = null;
    done?.();
  } });
}

/** The window changed shape: put the camera back where this kind of screen wants it. */
function reframe() {
  if (!layer || layer.hidden) return;
  if (mode === 'dr-guess') {
    const shot = searchShot();
    jump(shot);
    pan = { mid: shot.mid, half: shot.half, from: pan?.from ?? clock };
  } else if (mode === 'dr-reveal' && revealPoints) jump(framing(revealPoints, BOX.reveal, 0.98));
  else jump(wideShot());
}

// ---------------------------------------------------------------------------
// Things that get put on the map
// ---------------------------------------------------------------------------

function clearTable() {
  tweens.clear();
  flight = null;
  for (const m of marks) scene.remove(m.group);
  marks.clear();
  for (const thing of loose) scene.remove(thing);
  loose.clear();
  tags.clear();
  tagsEl.replaceChildren();
  shake = 0;
}

function addTag(html, cls, at, rise) {
  const el = document.createElement('div');
  el.className = `dr-tag ${cls}`;
  el.innerHTML = html;
  tagsEl.append(el);
  const t = { el, at, rise, w: el.offsetWidth, h: el.offsetHeight, x: 0, y: 0, dy: 0, fixed: cls.includes('dr-here') };
  tags.add(t);
  return t;
}

/** A puff of little bits flying up and out from a point. */
function burst(at, n, colour, size, { glow = 0, spread = 1 } = {}) {
  const material = paint(colour, { glow, rough: 0.4 });
  for (let i = 0; i < n; i++) {
    const bit = part(SHAPES.ball, material, { at: at.toArray(), size: 0.001, shadow: false, into: scene });
    loose.add(bit);
    const a = rand(0, Math.PI * 2);
    const out = rand(0.3, 1) * spread;
    const up = rand(0.8, 1.9) * spread;
    const big = size * rand(0.6, 1.2);
    tween(rand(0.7, 1.1), (_, k) => {
      bit.position.set(at.x + Math.cos(a) * out * k, at.y + up * (k - k * k) * 2.4, at.z + Math.sin(a) * out * k);
      bit.scale.setScalar(Math.max(0.001, big * (1 - k * k)));
    }, { ease: linear, done: () => {
      scene.remove(bit);
      loose.delete(bit);
    } });
  }
}

/** X marks the spot: stamped down hard, with a glow and a spray of gold. */
function stampX(place) {
  const S = shapes();
  const at = spot(place.lat, place.lng, groundAt(place.lat, place.lng));
  const group = new THREE.Group();
  const red = paint(0xd63a2b, { rough: 0.5, glow: 0.25 });
  const cream = paint(0xfff3d6, { rough: 0.6 });
  for (const turn of [Math.PI / 4, -Math.PI / 4]) {
    part(S.box, cream, { at: [0, 0.03, 0], size: [1.22, 0.05, 0.36], turn: [0, turn, 0], into: group });
    part(S.box, red, { at: [0, 0.07, 0], size: [1.08, 0.08, 0.22], turn: [0, turn, 0], into: group });
  }
  const light = new THREE.PointLight(0xffc85a, 0, 1, 1.6);
  light.position.set(0, 1.1, 0);
  group.add(light);
  scene.add(group);
  const mark = { group, at, lift: 0, pop: 3.4, light, glow: 0 };
  marks.add(mark);
  tween(0.38, (k) => {
    mark.pop = 3.4 - 2.4 * k;
  }, { ease: easeIn, done: () => {
    shake = Math.max(shake, 0.5);
    const s = cam.dist * MARK;
    burst(at, 16, 0xf7c948, 0.11 * s, { glow: 0.5, spread: 1.5 * s });
    tween(0.9, (k) => {
      mark.glow = 1 + 2.2 * (1 - k);
    });
    addTag(`<b>${esc(place.name)}</b>`, 'dr-here', at, 1.0);
  } });
  return mark;
}

/** One pirate's guess: a pin stuck in the map, a trail of dots to the X, and a tag saying how far out they were. */
function dropPin(result, place, scale, { unit, best }) {
  const S = shapes();
  const p = players.get(result.id);
  const colour = p?.color ?? '#c8372d';
  const at = spot(result.lat, result.lng, groundAt(result.lat, result.lng));
  const group = new THREE.Group();
  part(S.rod, paint(0xd8dde2, { rough: 0.2 }), { at: [0, 0.55, 0], size: [0.035, 1.5, 0.035], into: group });
  const head = part(S.ball, paint(colour, { rough: 0.3, glow: 0.18 }).clone(), { at: [0, 1.42, 0], size: 0.3, into: group });
  group.rotation.set(rand(-0.12, 0.12), rand(0, 6), rand(-0.12, 0.12));
  scene.add(group);
  const mark = { group, at, lift: 9, pop: 1, head };
  marks.add(mark);

  tween(0.34, (k) => {
    mark.lift = 9 * (1 - k);
  }, { ease: easeIn, done: () => {
    sound.play('knock', { level: 0.7 });
    shake = Math.max(shake, 0.12);
    burst(at, 5, 0xe9dcb8, 0.07 * scale, { spread: 0.5 * scale });
    tween(0.3, (k) => {
      mark.pop = 0.8 + 0.2 * k;
    }, { ease: backOut });
    trail(at, spot(place.lat, place.lng), colour, scale, () => {
      const how = result.bullseye ? '🎯 spot on' : `${fmt(result.off)} ${unit}`;
      mark.tag = addTag(`<span class="face"><span>${p?.avatar ?? ''}</span></span><b>${esc(p?.name ?? '')}</b><i>${how}</i>`, best ? 'best' : '', at, 1.85);
      mark.tag.el.style.setProperty('--c', colour);
      if (best) crown(mark, scale);
    });
  } });
}

/** A dotted line across the map, laid one dot at a time. */
function trail(from, to, colour, scale, done) {
  const length = from.distanceTo(new THREE.Vector3(to.x, from.y, to.z));
  const step = Math.max(0.3 * scale, length / 140);
  const n = Math.floor(length / step) - 1;
  if (n < 1) return done();
  const dots = new THREE.InstancedMesh(SHAPES.dot, paint(colour, { glow: 0.45, rough: 0.5 }), n);
  const at = new THREE.Object3D();
  const y = LAND + 0.03;
  for (let i = 0; i < n; i++) {
    const k = (i + 1) / (n + 1);
    at.position.set(from.x + (to.x - from.x) * k, y, from.z + (to.z - from.z) * k);
    at.scale.set(0.085 * scale, 0.02, 0.085 * scale);
    at.updateMatrix();
    dots.setMatrixAt(i, at.matrix);
  }
  dots.count = 0;
  scene.add(dots);
  loose.add(dots);
  tween(clamp(length * 0.08, 0.25, 0.6), (k) => {
    dots.count = Math.round(n * k);
  }, { ease: linear, done });
}

/** The closest guess: its pin lights up, with a gold ring round it and a shower of coins. */
function crown(mark, scale) {
  sound.play('coins');
  mark.head.material.emissiveIntensity = 0.9;
  const ring = part(SHAPES.ring, new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, side: THREE.DoubleSide, depthWrite: false }), { at: [mark.at.x, mark.at.y + 0.02, mark.at.z], size: 0.001, shadow: false, into: scene });
  loose.add(ring);
  tween(0.9, (k) => {
    ring.scale.setScalar(Math.max(0.001, scale * (0.3 + 1.6 * k)));
    ring.material.opacity = 1 - k;
  });
  const top = mark.at.clone().setY(mark.at.y + 1.4 * scale);
  burst(top, 22, 0xf7c948, 0.1 * scale, { glow: 0.5, spread: 1.6 * scale });
}

// ---------------------------------------------------------------------------
// The three kinds of screen
// ---------------------------------------------------------------------------

function reveal(view, fresh) {
  const place = view.place;
  const found = view.results.filter((r) => r.off !== null); // closest first
  // Keep the spot, a bit of the map round it and every guess in view, pins and all.
  const keep = [];
  for (const [dLat, dLng] of [[5, -8], [5, 8], [-5, -8], [-5, 8]]) keep.push(spot(place.lat + dLat, place.lng + dLng));
  for (const r of found) keep.push(spot(r.lat, r.lng), spot(r.lat, r.lng, 1.2));
  revealPoints = keep;
  const shot = framing(keep, BOX.reveal, 0.98);
  if (fresh) jump(wideShot());
  fly(shot, 2.3);
  const scale = shot.dist * MARK;

  after(REVEAL.x, () => stampX(place));
  const gap = REVEAL.gap(found.length);
  [...found].reverse().forEach((r, i) => {
    after(REVEAL.pins + i * gap, () => dropPin(r, place, scale, { unit: view.unit, best: r === found[0] }));
  });
}

function search(fresh) {
  const shot = searchShot();
  const begin = () => {
    pan = { mid: shot.mid, half: shot.half, from: clock };
  };
  if (fresh) {
    jump(shot);
    begin();
  } else fly(shot, 2.2, begin);
}

// ---------------------------------------------------------------------------
// Every frame
// ---------------------------------------------------------------------------

const projected = new THREE.Vector3();

/**
 * Put every name tag over its pin. Guesses often land in a huddle, so a tag
 * that would cover another one is nudged up until it is clear.
 */
function placeTags(s, dt) {
  for (const t of tags) {
    projected.set(t.at.x, t.at.y + t.rise * s, t.at.z).project(camera);
    t.x = ((projected.x + 1) / 2) * window.innerWidth;
    t.y = ((1 - projected.y) / 2) * window.innerHeight; // the bottom middle of the tag
  }
  const placed = [];
  const order = [...tags].sort((a, b) => b.fixed - a.fixed || b.y - a.y); // the place name first, then from the bottom of the screen up
  for (const t of order) {
    let y = t.y;
    if (!t.fixed) {
      for (let tries = 0; tries < 8; tries++) {
        const hit = placed.find((p) => Math.abs(p.x - t.x) < (p.w + t.w) / 2 + 4 && y > p.top - 2 && y - t.h < p.bottom + 2);
        if (!hit) break;
        y = hit.top - 4;
      }
      t.dy += (y - t.y - t.dy) * Math.min(1, dt * 9);
      y = t.y + t.dy;
    }
    placed.push({ x: t.x, w: t.w, top: y - t.h, bottom: y });
    t.el.style.transform = `translate(${t.x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }
}

function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  clock += dt;

  for (const tw of [...tweens]) {
    tw.t += dt;
    if (tw.t < 0) continue;
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(tw.ease(k), k);
    if (k >= 1 && tweens.delete(tw)) tw.done?.();
  }

  // The sea, and the ships on it.
  const pos = water.geometry.attributes.position;
  const a = pos.array;
  for (let i = 0; i < a.length; i += 3) a[i + 1] = Math.sin(a[i] * 1.3 + clock * 0.9) * Math.cos(a[i + 2] * 1.7 + clock * 0.7) * 0.022 + Math.sin(a[i] * 3.1 - a[i + 2] * 2.3 + clock * 1.6) * 0.009;
  pos.needsUpdate = true;
  for (const s of ships) {
    s.g.position.y = Math.sin(clock * 1.1 + s.seed) * 0.02;
    s.g.rotation.z = Math.sin(clock * 0.9 + s.seed) * 0.06;
  }

  // The camera: wandering along the map while people guess, plus whatever has just thumped the map.
  if (pan && !flight) cam.target.x = pan.mid + pan.half * Math.sin(((clock - pan.from) * Math.PI * 2) / 52);
  shake *= Math.max(0, 1 - dt * 5);
  const sway = cam.dist / 30;
  aimCamera((Math.sin(clock * 0.21) * 0.14 + rand(-1, 1) * shake * 0.4) * sway, rand(-1, 1) * shake * 0.4 * sway);

  // The sun follows the camera, so the shadows stay sharp however close it gets.
  const reach = cam.dist * 0.62;
  sun.position.set(cam.target.x - reach * 0.55, reach * 1.05, cam.target.z + reach * 0.55);
  sun.target.position.copy(cam.target);
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.5, far: reach * 4 });
  sun.shadow.camera.updateProjectionMatrix();

  // Pins and the X stay the same size on the screen.
  const s = cam.dist * MARK;
  for (const m of marks) {
    m.group.position.set(m.at.x, m.at.y + m.lift * s, m.at.z);
    m.group.scale.setScalar(s * m.pop);
    if (m.light) {
      m.light.intensity = 26 * s * s * m.glow;
      m.light.distance = 9 * s;
    }
  }
  placeTags(s, dt);

  styler.render(scene, camera);
}

// ---------------------------------------------------------------------------
// The two functions host.js calls
// ---------------------------------------------------------------------------

/** Draw (or update) the map for a view of the game. */
export function show(view, playerMap) {
  if (!layer) init();
  players = playerMap;
  const fresh = layer.hidden;
  if (fresh) {
    layer.hidden = false;
    fit();
    running = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }
  if (view.key === shownKey) return;
  shownKey = view.key;
  mode = view.screen;
  pan = null;
  clearTable();

  if (mode === 'dr-reveal') reveal(view, fresh);
  else if (mode === 'dr-guess') search(fresh);
  else {
    // The title card: the whole world, with the camera settling in over it.
    const shot = wideShot();
    if (fresh) jump({ ...shot, dist: shot.dist * 1.18 });
    fly(shot, fresh ? 2.6 : 1.8);
  }
}

/** Put the map away (another screen is showing). */
export function hide() {
  if (!layer || layer.hidden) return;
  layer.hidden = true;
  running = false;
  clearTable();
  shownKey = null;
  mode = null;
  pan = null;
}

// ---------------------------------------------------------------------------
// The words host.js draws over the top
// ---------------------------------------------------------------------------

/** host.js hands over its drawing helpers and gets back the screens ("dr-round", "dr-guess", "dr-reveal"). */
export function reckoningScreens({ anim, chip, progress }) {
  const kindTag = (kind) => (kind ? `<span class="dr-kind"><span>${esc(kind.icon ?? '')}</span>${esc(kind.name)}</span>` : '');

  return {
    'dr-round'(v) {
      return `<div class="dr-round">
        <p class="kicker">${v.double ? 'Final location' : 'Location'}</p>
        <h1 class="title huge"${anim('t', 'slam', 150, 600)}>${v.n} <small>of</small> ${v.total}</h1>
        ${v.kind ? `<p class="dr-theme parch"${anim('k', 'pop', 700, 500)}>${kindTag(v.kind)}</p>` : ''}
        ${v.double ? `<p class="note"${anim('d', 'rise', 1100, 500)}>Double doubloons!</p>` : ''}
      </div>`;
    },

    'dr-guess'(v) {
      const last = v.clues.length - 1;
      const clues = v.clues
        .map((c, i) => `<div class="clue parch ${i < last ? 'old' : ''}"${anim(`clue${i}`, 'from-right', 0, 550)}><span class="clue-n">${i + 1}</span><span>${esc(c)}</span></div>`)
        .join('');
      return `<div class="dr-guess">
        <aside class="dr-side ${v.image ? 'has-image' : ''}">
          <p class="dr-meta">Location ${v.n} of ${v.total}${v.kind ? ` · ${kindTag(v.kind)}` : ''}</p>
          <h1 class="title">Where in the world?</h1>
          ${v.image ? `<div class="dr-photo parch"${anim('photo', 'pop', 0, 600)}><img src="${esc(v.image)}" alt=""></div>` : ''}
          ${clues}
          <p class="hint">${v.more ? `${v.more} more clue${v.more > 1 ? 's' : ''} on the way…` : 'That’s every clue. Drop your X!'}</p>
        </aside>
        ${progress(v.progress)}
      </div>`;
    },

    'dr-reveal'(v) {
      const found = v.results.filter((r) => r.off !== null).length;
      const gap = REVEAL.gap(found);
      // Closest at the top, but they arrive furthest first, in step with the pins.
      const rows = v.results
        .map((r, i) => {
          const turn = r.off === null ? found : found - 1 - i;
          const how = r.off === null ? 'no guess' : r.bullseye ? '🎯 spot on' : `${fmt(r.off)} ${esc(v.unit)}`;
          return `<div class="dr-row ${i === 0 && r.off !== null ? 'best' : ''}"${anim(`row${r.id}`, 'from-right', (REVEAL.pins + turn * gap) * 1000 + 500, 450)}>
            <b class="dr-rank">${r.off === null ? '–' : i + 1}</b>
            ${chip(r.id)}
            <span class="km">${how}</span>
            <span class="gain">+${fmt(r.points)}</span>
          </div>`;
        })
        .join('');
      return `<div class="dr-reveal">
        <aside class="dr-panel parch"${anim('panel', 'from-right', 300, 600)}>
          <p class="kicker dark">${v.kind ? kindTag(v.kind) : 'It was…'}</p>
          <h2 class="place"${anim('place', 'pop', REVEAL.x * 1000 + 300, 500)}>${esc(v.place.name)}</h2>
          ${v.image ? `<img class="dr-thumb" src="${esc(v.image)}" alt="">` : ''}
          ${v.place.fact ? `<p class="fact"${anim('fact', 'fade', REVEAL.x * 1000 + 900, 700)}>${esc(v.place.fact)}</p>` : ''}
          <div class="dr-results ${v.results.length > 7 ? 'dense' : ''}">${rows}</div>
        </aside>
      </div>`;
    },
  };
}
