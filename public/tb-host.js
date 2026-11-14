// To the Brig with Ye on the big screen: the view from the bow, drawn in 3D
// with three.js. The camera stands on the foredeck looking ahead along the
// bowsprit. In the distance the channel forks round a rock: port to the left,
// starboard to the right, and a reef under the water on one side.
//
// host.js draws the words (the banner along the top, the crew along the
// bottom, the votes); this file owns the ship, the sea, the fork and
// everything that moves.
//
// How it fits together
// --------------------
// * The ship never moves. The camera rides on her deck, and the sea and the
//   rocks slide towards her: `nav.dist` is how far off the fork is, and
//   `nav.travel` how far she has sailed (which is what makes the waves pass).
// * show(view) is called every time the server sends a new view. When the
//   phase changes it acts out the difference: the wheel goes over, the reef
//   breaks the surface, she strikes or sails clear.
// * Everything that moves is a "tween": a little function called every frame
//   with a number going from 0 to 1.
//
// World units: the foredeck is about 7 wide. x runs left to right (port is
// negative), y is up, and the ship points along -z. The sea is at y = 0.

import * as THREE from './vendor/three.module.min.js';
import { createLookPass } from './looks3d.js';
import { esc } from './common.js';
import { signalFlag } from './tb-play.js';
import './tb-sound.js';

const DECK = 1.5; // the height of the foredeck above the sea
const EYE = [0, DECK + 1.85, 3.6]; // where the camera stands
const GAP = 17; // how far either side of the middle rock the two channels run
const SEA = { cols: 96, rows: 84, cell: 5, far: -385 }; // the sheet of sea: 480 wide, 420 deep
const HOLD = 125; // she heaves to about this far off the fork while the crew argues

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeIn = (k) => k ** 2.2;
const easeInOut = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
const linear = (k) => k;
const otherSide = (side) => (side === 'port' ? 'starboard' : 'port');
const sign = (side) => (side === 'port' ? -1 : 1);

/** A repeatable source of random numbers, so a leg's rocks look the same if the page is reloaded. */
function seeded(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

let layer = null; // the <div> that holds the canvas and the signs drawn over it
// Lighting styles (see looks3d.js). House style: near-monochrome, with the
// light and the fog dithered. Red is the only colour left: the port light, the
// red buoys, and whatever else is red when it matters.
const LOOK_TUNING = {
  knee: 1,
  house: {
    light: { pattern: 'bayer', bands: 6, cell: 2, spread: 0.45, amount: 0.7 },
    fog: { bands: 6, cell: 2 },
    post: { palette: { colours: [0x0d1215, 0x2f3b42, 0x6e7d84, 0xb9c3c4, 0xeef0ea], amount: 0.85, keepRed: 1 } },
  },
};
let styler = null;

let marksEl, renderer, scene, camera, boat, sea, dome, hemi, sun, sunGlow, bell;
let running = false;
let lastFrame = 0;
let clock = 0;
let shake = 0;

const tweens = new Set();
const flecks = []; // scraps of foam drifting past
const bits = []; // things thrown in the air: splinters, spray
const clouds = [];

// Where she is and how she is sitting in the water.
const nav = { dist: 400, speed: 5, travel: 0, lastTravel: 0, flow: 5, steering: false, stuck: false, lateral: 0, yaw: 0, lean: 0, pitch: 0, sink: 0, gloom: 0, gloomWant: 0, painted: -1, mist: 0, mistWant: 0, paintedMist: -1 };
let fork = null; // { group, reefs: { port, starboard }, buoys: [], up: null }
let island = null; // { group, dist } - the end of a voyage the crew wins
let legKey = null;
let phase = null;
let sprayIn = 0;
let sinkTimer = null;

/** Run fn(eased, raw) every frame for `dur` seconds. */
function tween(dur, fn, { delay = 0, ease = easeOut, done = null } = {}) {
  const tw = { t: -delay, dur: Math.max(0.001, dur), fn, ease, done };
  tweens.add(tw);
  return tw;
}

// ----- paint and parts -----

const paints = new Map();
/** A pot of paint. Everything is flat-shaded, so the models look hand-carved. */
function paint(color, { glow = 0, rough = 0.8 } = {}) {
  const key = `${color}:${glow}:${rough}`;
  if (!paints.has(key)) {
    paints.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: rough, metalness: 0.02, emissive: glow ? color : 0x000000, emissiveIntensity: glow }));
  }
  return paints.get(key);
}

const SHAPES = {};
function shapes() {
  if (SHAPES.box) return SHAPES;
  SHAPES.box = new THREE.BoxGeometry(1, 1, 1);
  SHAPES.ball = new THREE.IcosahedronGeometry(1, 1);
  SHAPES.lump = new THREE.IcosahedronGeometry(1, 0);
  SHAPES.crag = new THREE.ConeGeometry(1, 1, 6);
  SHAPES.pole = new THREE.CylinderGeometry(1, 1, 1, 8);
  SHAPES.spar = new THREE.CylinderGeometry(0.55, 1, 1, 8); // thinner at the far end
  SHAPES.flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  SHAPES.ring = new THREE.RingGeometry(0.72, 1, 28).rotateX(-Math.PI / 2);
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

const UP = new THREE.Vector3(0, 1, 0);
/** A round timber (or a rope) running from one point to another. */
function beam(from, to, radius, material, { into, taper = false, shadow = true } = {}) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const along = b.clone().sub(a);
  const m = new THREE.Mesh(taper ? shapes().spar : shapes().pole, material);
  m.position.copy(a).addScaledVector(along, 0.5);
  m.scale.set(radius, along.length(), radius);
  m.quaternion.setFromUnitVectors(UP, along.clone().normalize());
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  into?.add(m);
  return m;
}

/** A little drawing on a square of canvas, to stick onto a model. */
function decal(draw, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// ----- setting up -----

function init() {
  shapes();
  layer = document.createElement('div');
  layer.id = 'tbLayer';
  layer.hidden = true;
  layer.innerHTML = `<div class="tb-drown"></div><div class="tb-vignette"></div><div class="tb-flash"></div>
    <div class="tb-marks"><div class="tb-mark port" hidden></div><div class="tb-mark starboard" hidden></div></div>`;
  document.getElementById('stage').before(layer);
  marksEl = { port: layer.querySelector('.tb-mark.port'), starboard: layer.querySelector('.tb-mark.starboard') };

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  styler = createLookPass(renderer, LOOK_TUNING);
  layer.prepend(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf4bd8c, 70, 345);
  camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.3, 1500);

  hemi = new THREE.HemisphereLight(0xfff0dc, 0x35566b, 1.15);
  scene.add(hemi);
  // The sun is low and ahead, off the port bow: the rocks stand dark against the sky.
  sun = new THREE.DirectionalLight(0xffd9a8, 2.4);
  sun.position.set(-16, 15, -22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 12, bottom: -8, near: 1, far: 70 });
  sun.shadow.bias = -0.0008;
  sun.shadow.radius = 4;
  scene.add(sun);

  buildSky();
  buildSea();
  buildBoat();
  for (let i = 0; i < 70; i++) {
    const m = part(shapes().flat, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: rand(0.25, 0.6), depthWrite: false }), { size: [rand(0.5, 1.4), 1, rand(0.25, 0.5)], shadow: false, into: scene });
    m.position.set(rand(-90, 90), 0, rand(-230, 12));
    flecks.push(m);
  }
  window.addEventListener('resize', fit);
  fit();
}

function buildSky() {
  dome = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(dome.geometry.attributes.position.count * 3), 3));
  dome.renderOrder = -2;
  scene.add(dome);

  // The sun itself: a soft disc low on the horizon.
  const glow = decal((c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,250,225,1)');
    g.addColorStop(0.1, 'rgba(255,236,180,0.95)');
    g.addColorStop(0.32, 'rgba(255,196,120,0.3)');
    g.addColorStop(1, 'rgba(255,180,110,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
  sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  sunGlow.position.set(-430, 96, -900);
  sunGlow.scale.setScalar(620);
  sunGlow.renderOrder = -1;
  scene.add(sunGlow);

  // A few slabs of cloud, lit from underneath.
  const cloud = new THREE.MeshBasicMaterial({ color: 0xffe2c4, fog: false, transparent: true, opacity: 0.8 });
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < 4; j++) part(shapes().ball, cloud, { at: [j * rand(34, 52), rand(-6, 6), rand(-18, 18)], size: [rand(46, 80), rand(9, 16), rand(26, 40)], shadow: false, into: g });
    g.position.set(rand(-950, 950), rand(170, 330), rand(-1000, -520));
    g.userData.drift = rand(1.5, 4);
    scene.add(g);
    clouds.push(g);
  }
}

/**
 * Colour the sky, the haze and the light for how much trouble she is in (g: 0
 * is a fair morning, 1 is grim) and how foggy the leg is (mist: 0 to 1). Fog
 * pulls the haze in close, so the fork only comes clear as she heaves to.
 */
function paintMood(g, mist = nav.mist) {
  nav.painted = g;
  nav.paintedMist = mist;
  const zenith = new THREE.Color(0x27497f).lerp(new THREE.Color(0x151b29), g).lerp(new THREE.Color(0xa9b0b7), mist * 0.9);
  const haze = new THREE.Color(0xf4bd8c).lerp(new THREE.Color(0x6d7280), g).lerp(new THREE.Color(0xbfc5ca), mist * 0.9);
  scene.fog.near = 70 - 64 * mist;
  scene.fog.far = 345 - 170 * mist; // at its thickest the fork is a ghost where she heaves to
  const pos = dome.geometry.attributes.position;
  const col = dome.geometry.attributes.color;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = clamp(pos.getY(i) / 1200, 0, 1) ** 0.5;
    c.copy(haze).lerp(zenith, h);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  scene.fog.color.copy(haze);
  renderer.setClearColor(haze);
  sea.material.color.set(0xffffff).lerp(new THREE.Color(0x76808f), g);
  hemi.intensity = 1.15 - 0.5 * g;
  sun.intensity = 2.4 - 1.5 * g;
  sunGlow.material.opacity = (1 - 0.85 * g) * (1 - 0.92 * mist);
  for (const cl of clouds) cl.children[0].material.color.set(0xffe2c4).lerp(new THREE.Color(0x565b68), g).lerp(new THREE.Color(0xd5d9dd), mist * 0.6);
}

// ----- the sea -----

/** How high the water stands at a spot, where z is measured on the water itself (not from the ship). */
function swellAt(x, z, t) {
  return (0.42 * Math.sin(x * 0.11 + z * 0.05 + t * 0.9) + 0.3 * Math.sin(z * 0.21 - t * 1.3) + 0.16 * Math.sin((x - z) * 0.37 + t * 1.9)) * (1 + nav.gloom * 0.9);
}

function buildSea() {
  // One sheet of little triangles, each a slightly different blue, which rises and falls.
  // It is laid out in rows from the horizon to the ship, so that as she sails the whole
  // sheet can slide a row towards her and snap back, handing each row's colours on to the next.
  const { cols, rows, cell, far } = SEA;
  const positions = new Float32Array(cols * rows * 18);
  const colours = new Float32Array(cols * rows * 18);
  let n = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x0 = (i - cols / 2) * cell;
      const z0 = far + j * cell;
      for (const [dx, dz] of [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]]) {
        positions[n++] = x0 + dx * cell;
        positions[n++] = 0;
        positions[n++] = z0 + dz * cell;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  sea = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.42, metalness: 0.1 }));
  sea.frustumCulled = false;
  sea.receiveShadow = false;
  sea.userData = { heights: new Float32Array((cols + 1) * (rows + 1)), whole: 0 };
  for (let j = 0; j < rows; j++) tintRow(j);
  scene.add(sea);
}

const DEEP = new THREE.Color(0x12566f);
const SHALLOW = new THREE.Color(0x36a0aa);
const tint = new THREE.Color();
/** Give one row of the sea a fresh set of blues. */
function tintRow(j) {
  const col = sea.geometry.attributes.color.array;
  let n = j * SEA.cols * 18;
  for (let i = 0; i < SEA.cols * 2; i++) {
    tint.copy(DEEP).lerp(SHALLOW, Math.random() ** 1.6);
    for (let k = 0; k < 3; k++) {
      col[n++] = tint.r;
      col[n++] = tint.g;
      col[n++] = tint.b;
    }
  }
}

function waves() {
  const { cols, rows, cell, far } = SEA;
  const whole = Math.floor(nav.travel / cell);
  // She has sailed another row's worth: every row takes over the colours of the one beyond it.
  const col = sea.geometry.attributes.color;
  const stride = cols * 18;
  let moved = whole - sea.userData.whole;
  if (moved !== 0) {
    sea.userData.whole = whole;
    for (moved = clamp(moved, 0, rows); moved > 0; moved--) {
      col.array.copyWithin(stride, 0, col.array.length - stride);
      tintRow(0);
    }
    col.needsUpdate = true;
  }
  sea.position.z = nav.travel - whole * cell;

  const heights = sea.userData.heights;
  for (let j = 0; j <= rows; j++) {
    const z = far + j * cell - whole * cell;
    for (let i = 0; i <= cols; i++) heights[j * (cols + 1) + i] = swellAt((i - cols / 2) * cell, z, clock);
  }
  const pos = sea.geometry.attributes.position.array;
  let n = 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = heights[j * (cols + 1) + i];
      const b = heights[(j + 1) * (cols + 1) + i];
      const c = heights[j * (cols + 1) + i + 1];
      const d = heights[(j + 1) * (cols + 1) + i + 1];
      pos[n] = a;
      pos[n + 3] = b;
      pos[n + 6] = c;
      pos[n + 9] = c;
      pos[n + 12] = b;
      pos[n + 15] = d;
      n += 18;
    }
  }
  sea.geometry.attributes.position.needsUpdate = true;
}

/** The height of the water at a spot measured from the ship. */
const waterAt = (x, z) => swellAt(x, z - nav.travel, clock);

// ----- the ship: all we ever see of her is the foredeck and the bowsprit -----

/** The edge of the foredeck on one side, from beside the camera round to the stem. */
function gunwale(side, steps = 12) {
  const points = [[3.7 * side, 5], [3.7 * side, 0]];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // a curve from (3.7, 0) through a bulge at (3.5, -4.6) to the stem at (0, -6.8)
    points.push([side * ((1 - t) ** 2 * 3.7 + 2 * (1 - t) * t * 3.5), -(2 * (1 - t) * t * 4.6 + t ** 2 * 6.8)]);
  }
  return points;
}

function buildBoat() {
  boat = new THREE.Group();
  scene.add(boat);
  boat.add(camera);
  sun.target = boat;

  // The deck: planks running fore and aft, drawn once onto a canvas.
  const planks = decal((c, s) => {
    c.fillStyle = '#8a6a44';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 8; i++) {
      c.fillStyle = ['#8f6f48', '#84643f', '#96754c', '#7d5e3b'][i % 4];
      c.fillRect((i * s) / 8, 0, s / 8 - 3, s);
    }
    for (let i = 0; i < 220; i++) {
      c.strokeStyle = `rgba(${Math.random() < 0.5 ? '50,30,12' : '190,150,100'},${0.05 + Math.random() * 0.12})`;
      c.lineWidth = 1 + Math.random() * 2;
      const x = Math.random() * s;
      c.beginPath();
      c.moveTo(x, 0);
      c.bezierCurveTo(x + rand(-5, 5), s * 0.3, x + rand(-5, 5), s * 0.7, x, s);
      c.stroke();
    }
    c.fillStyle = 'rgba(30,18,8,0.55)';
    for (let i = 0; i < 8; i++) for (const y of [0.2, 0.7]) c.fillRect((i * s) / 8 + 6, ((y + (i % 2) * 0.25) % 1) * s, s / 8 - 15, 3); // the butt joints
  }, 512);
  planks.wrapS = planks.wrapT = THREE.RepeatWrapping;
  planks.repeat.set(0.22, 0.22);

  const outline = new THREE.Shape();
  const port = gunwale(-1);
  const starboard = gunwale(1);
  outline.moveTo(port[0][0], -port[0][1]);
  for (const [x, z] of port.slice(1)) outline.lineTo(x, -z);
  for (const [x, z] of starboard.slice(0, -1).reverse()) outline.lineTo(x, -z);
  const deck = new THREE.Mesh(new THREE.ShapeGeometry(outline).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: planks, roughness: 0.85 }));
  deck.position.y = DECK;
  deck.receiveShadow = true;
  boat.add(deck);

  // The bulwarks: short lengths of timber bent round the edge of the deck, with a rail on top.
  const timber = paint(0x5b3b20, { rough: 0.7 });
  const rail = paint(0x8a5a2c, { rough: 0.5 });
  for (const edge of [port, starboard]) {
    for (let i = 0; i < edge.length - 1; i++) {
      const [x0, z0] = edge[i];
      const [x1, z1] = edge[i + 1];
      const length = Math.hypot(x1 - x0, z1 - z0);
      const yaw = -Math.atan2(z1 - z0, x1 - x0);
      part(shapes().box, timber, { at: [(x0 + x1) / 2, DECK + 0.42, (z0 + z1) / 2], size: [length * 1.08, 0.95, 0.24], turn: [0, yaw, 0], into: boat });
      part(shapes().box, rail, { at: [(x0 + x1) / 2, DECK + 0.93, (z0 + z1) / 2], size: [length * 1.1, 0.12, 0.44], turn: [0, yaw, 0], into: boat });
    }
  }

  // The bowsprit, and the stays running from it up to the foremast (which is behind us).
  const spar = paint(0x9a6b38, { rough: 0.55 });
  const rope = paint(0x3d2c18, { rough: 1 });
  const iron = paint(0x2a2a2e, { rough: 0.5 });
  // (It is steeved flatter than a real one, so its tip stays under the horizon and out of the way of the fork.)
  beam([0, DECK + 0.45, -4.6], [0, DECK + 1.2, -15.5], 0.25, spar, { into: boat, taper: true });
  part(shapes().box, timber, { at: [0, DECK + 0.42, -5.9], size: [0.85, 0.85, 1.5], into: boat }); // the knightheads the bowsprit sits between
  for (const z of [-8.2, -11.6]) part(shapes().pole, iron, { at: [0, DECK + 0.45 + ((-z - 4.6) / 10.9) * 0.75, z], size: [0.27, 0.12, 0.27], turn: [-1.5, 0, 0], into: boat });
  beam([0, DECK + 1.18, -15.2], [0, 24, 2.5], 0.035, rope, { into: boat, shadow: false }); // the forestay
  for (const s of [-1, 1]) beam([0, DECK + 1.1, -14.6], [s * 3.2, DECK + 0.9, -2.2], 0.03, rope, { into: boat, shadow: false }); // the bowsprit shrouds

  // The ship's lights: red to port, green to starboard. (They really are that way round.)
  for (const s of [-1, 1]) {
    const [x, z] = gunwale(s)[5];
    const colour = s < 0 ? 0xe0392b : 0x2fbf5b;
    part(shapes().pole, iron, { at: [x, DECK + 1.3, z], size: [0.05, 0.7, 0.05], into: boat });
    part(shapes().box, iron, { at: [x, DECK + 1.72, z], size: [0.36, 0.08, 0.36], into: boat });
    part(shapes().box, paint(colour, { glow: 1.6, rough: 0.3 }), { at: [x, DECK + 1.92, z], size: [0.28, 0.34, 0.28], shadow: false, into: boat });
    part(shapes().crag, iron, { at: [x, DECK + 2.2, z], size: [0.26, 0.22, 0.26], into: boat });
    const lamp = new THREE.PointLight(colour, 5, 7, 1.6);
    lamp.position.set(x - s * 0.4, DECK + 1.9, z);
    boat.add(lamp);
  }

  // The ship's bell on its belfry, rung at the start of every leg.
  const brass = paint(0xd9a441, { rough: 0.3 });
  for (const s of [-1, 1]) part(shapes().box, timber, { at: [1.35 + s * 0.3, DECK + 0.45, -3.9], size: [0.09, 0.9, 0.09], into: boat });
  part(shapes().box, timber, { at: [1.35, DECK + 0.93, -3.9], size: [0.8, 0.1, 0.14], into: boat });
  bell = new THREE.Group();
  bell.position.set(1.35, DECK + 0.88, -3.9);
  part(shapes().spar, brass, { at: [0, -0.24, 0], size: [0.2, 0.3, 0.2], into: bell });
  part(shapes().ball, brass, { at: [0, -0.44, 0], size: 0.05, into: bell });
  boat.add(bell);

  // A barrel and a coil of rope, so the deck looks lived on.
  const barrel = new THREE.Group();
  part(shapes().pole, paint(0x6e4a26, { rough: 0.8 }), { at: [0, 0.45, 0], size: [0.4, 0.9, 0.4], into: barrel });
  for (const y of [0.17, 0.73]) part(shapes().pole, iron, { at: [0, y, 0], size: [0.42, 0.06, 0.42], into: barrel });
  barrel.position.set(-1.7, DECK, -3.6);
  boat.add(barrel);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 6, 14).rotateX(Math.PI / 2), paint(0xb89a63, { rough: 1 }));
  coil.position.set(2.3, DECK + 0.1, -2.2);
  coil.castShadow = true;
  boat.add(coil);
  part(new THREE.TorusGeometry(0.36, 0.1, 6, 14).rotateX(Math.PI / 2), paint(0xb89a63, { rough: 1 }), { at: [2.3, DECK + 0.27, -2.2], into: boat });
}

// ----- the fork in the channel -----

const STONE = [0x4d5059, 0x5a5d66, 0x43464e, 0x62646b];

function buildFork(seed) {
  const r = seeded(seed);
  const R = (lo, hi) => lo + r() * (hi - lo);
  const stone = () => paint(STONE[Math.floor(r() * STONE.length)], { rough: 0.95 });
  const group = new THREE.Group();
  const crag = (x, z, radius, height, into = group) => part(shapes().crag, stone(), { at: [x, height / 2 - 1.2, z], size: [radius, height, radius], turn: [R(-0.09, 0.09), R(0, 6), R(-0.09, 0.09)], shadow: false, into });
  const bulk = (x, z, wide, high, deep) => part(shapes().lump, stone(), { at: [x, 0, z], size: [wide, high, deep], turn: [0, R(0, 6), 0], shadow: false, into: group });

  // The rock in the middle: a mouthful of broken teeth.
  bulk(0, 0, R(5.5, 7), R(3, 4.5), R(6.5, 9));
  const teeth = 5 + Math.floor(r() * 3);
  for (let i = 0; i < teeth; i++) {
    const angle = R(0, Math.PI * 2);
    const out = i === 0 ? 0 : R(1.5, 5.2);
    crag(Math.cos(angle) * out, Math.sin(angle) * out * 1.4, R(2.2, 4.2), R(11, 24) * (1 - out / 11));
  }

  // The headlands either side: big dark masses, some with grass on top.
  const grass = paint(0x5d7745, { rough: 1 });
  for (const s of [-1, 1]) {
    let x = 31;
    for (let i = 0; i < 7; i++) {
      const wide = R(10, 18);
      const high = R(12, 30) + i * 2.5;
      const z = R(-55, 28);
      x += wide * R(0.45, 0.8);
      bulk(s * (x + wide), z, wide, high, R(11, 20));
      if (r() < 0.5) part(shapes().lump, grass, { at: [s * (x + wide), high * 0.86, z], size: [wide * 0.7, high * 0.2, wide * 0.7], shadow: false, into: group });
      if (r() < 0.6) crag(s * (x + wide * R(0.6, 1.3)), z + R(-9, 9), R(3, 6), high * R(0.8, 1.4));
    }
  }

  // A buoy in the mouth of each channel: red to port, green to starboard.
  const buoys = [];
  for (const s of [-1, 1]) {
    const colour = s < 0 ? 0xe0392b : 0x2fbf5b;
    const b = new THREE.Group();
    part(shapes().pole, paint(colour, { rough: 0.6 }), { at: [0, 0.3, 0], size: [1.1, 1.5, 1.1], shadow: false, into: b });
    part(shapes().pole, paint(0x2a2a2e), { at: [0, 2.6, 0], size: [0.1, 3.4, 0.1], shadow: false, into: b });
    part(shapes().ball, paint(colour, { glow: 2.2, rough: 0.3 }), { at: [0, 4.5, 0], size: 0.62, shadow: false, into: b });
    b.position.set(s * GAP, 0, 24);
    b.userData.lean = R(0, 6);
    group.add(b);
    buoys.push(b);
  }

  // The reef: both channels have one built, waiting under the water. Only one will ever come up.
  const reefs = {};
  for (const side of ['port', 'starboard']) {
    const reef = new THREE.Group();
    for (let i = 0; i < 8; i++) crag(R(-5.5, 5.5), R(-3.5, 3.5), R(1, 2), R(4, 7.5), reef);
    const foam = part(shapes().ring, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }), { at: [0, 1.4, 0], size: [8.5, 1, 6.5], shadow: false, into: reef });
    reef.userData.foam = foam;
    reef.position.set(sign(side) * GAP, -10, 2);
    group.add(reef);
    reefs[side] = reef;
  }

  scene.add(group);
  return { group, reefs, buoys, up: null };
}

function dropFork() {
  if (!fork) return;
  scene.remove(fork.group);
  fork = null;
}

/** The reef on one side breaks the surface. */
function raiseReef(side) {
  if (!fork || fork.up === side) return;
  fork.up = side;
  const reef = fork.reefs[side];
  const foam = reef.userData.foam;
  tween(0.9, (k) => {
    reef.position.y = -10 + 10 * k;
    foam.material.opacity = 0.75 * k;
    foam.scale.set(8.5 * (0.5 + 0.5 * k), 1, 6.5 * (0.5 + 0.5 * k));
  }, { ease: easeOut });
  for (let i = 0; i < 14; i++) {
    const at = new THREE.Vector3(nav.lateral + sign(side) * GAP + rand(-5, 5), 0.3, -nav.dist + 2 + rand(-3, 3));
    toss(at, new THREE.Vector3(rand(-2, 2), rand(5, 10), rand(-2, 2)), { size: rand(0.4, 0.9), life: rand(0.8, 1.4), delay: rand(0, 0.5) });
  }
}

/** ...and goes back under it, so she can sail on. */
function sinkReef() {
  if (!fork?.up) return;
  const reef = fork.reefs[fork.up];
  fork.up = null;
  const from = reef.position.y;
  tween(1.6, (k) => {
    reef.position.y = from + (-10 - from) * k;
    reef.userData.foam.material.opacity = 0.75 * (1 - k);
  }, { ease: easeIn });
}

// ----- the island at the end of the voyage -----

function buildIsland() {
  const group = new THREE.Group();
  part(shapes().ball, paint(0xe8d294, { rough: 1 }), { at: [0, -1.5, 0], size: [44, 5.5, 28], shadow: false, into: group });
  part(shapes().lump, paint(0x5d7745, { rough: 1 }), { at: [-9, 3.5, -5], size: [19, 9, 13], shadow: false, into: group });
  part(shapes().lump, paint(0x6c8a4e, { rough: 1 }), { at: [10, 2.5, -8], size: [13, 6, 10], shadow: false, into: group });
  const trunk = paint(0x7a5a36, { rough: 0.9 });
  const leaf = paint(0x3f8a45, { rough: 0.9 });
  for (const [x, z, h, bend] of [[-20, 6, 12, -3], [-13, 9, 15, 2], [17, 5, 13, 3], [24, 2, 10, -2], [2, 10, 16, 1]]) {
    beam([x, 2.2, z], [x + bend, 2.2 + h, z], 0.5, trunk, { into: group, taper: true, shadow: false });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      part(shapes().box, leaf, { at: [x + bend + Math.cos(a) * 2.6, 1.6 + h, z + Math.sin(a) * 2.6], size: [5.6, 0.25, 1.5], turn: [0, -a, -0.45], shadow: false, into: group });
    }
  }
  // The chest, glinting on the beach.
  part(shapes().box, paint(0x6e4a26), { at: [5, 3.9, 14], size: [3.4, 2.2, 2.2], shadow: false, into: group });
  part(shapes().box, paint(0xf7c948, { glow: 1.4, rough: 0.3 }), { at: [5, 5.2, 14], size: [3.0, 0.7, 1.8], shadow: false, into: group });
  const glint = new THREE.PointLight(0xffd76a, 220, 60, 1.6);
  glint.position.set(5, 9, 17);
  group.add(glint);
  scene.add(group);
  return { group, dist: 330 };
}

// ----- fitting the picture into the window -----

function fit() {
  if (!layer) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  layer.style.setProperty('--u', Math.min(w / 1920, h / 1080)); // one "TV pixel", the same scale host.js uses for its stage
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** Throw something into the air (spray by default) and let it fall. */
function toss(at, velocity, { size = 0.5, life = 1.2, delay = 0, colour = 0xf2f6f4, shape = shapes().ball, spin = 0 } = {}) {
  const m = part(shape, paint(colour, { rough: 1 }), { at: at.toArray(), size: 0.001, shadow: false, into: scene });
  bits.push({ m, v: velocity, size: Array.isArray(size) ? size : [size, size, size], life, age: -delay, spin });
}

function flashScreen() {
  const el = layer.querySelector('.tb-flash');
  el.classList.remove('go');
  void el.offsetWidth; // start the flash again
  el.classList.add('go');
}

/** She strikes: everything jumps, timber flies, the sea comes over the bow. */
function strike() {
  shake = 1.5;
  flashScreen();
  nav.stuck = true;
  nav.speed = 0;
  const bow = new THREE.Vector3(0, DECK + 0.4, -7.5);
  for (let i = 0; i < 22; i++) {
    toss(bow.clone().add(new THREE.Vector3(rand(-2, 2), rand(0, 1), rand(-1, 1))), new THREE.Vector3(rand(-7, 7), rand(6, 15), rand(-4, 4)), {
      size: [rand(0.12, 0.3), rand(0.08, 0.16), rand(0.7, 1.9)],
      life: rand(1.2, 2.2),
      colour: [0x8a6a44, 0x5b3b20, 0x9a6b38][i % 3],
      shape: shapes().box,
      spin: rand(4, 11),
    });
  }
  for (let i = 0; i < 34; i++) {
    toss(new THREE.Vector3(rand(-5, 5), 0.5, rand(-13, -6)), new THREE.Vector3(rand(-5, 5), rand(8, 19), rand(-3, 2.5)), { size: rand(0.4, 1.1), life: rand(1, 2), delay: rand(0, 0.25) }); // (not back at the camera: a ball of spray in the face fills the screen)
  }
  // The bow rides up on the rock and stays there, heeled over.
  const heel = rand(0.5, 1) * (Math.random() < 0.5 ? -1 : 1);
  tween(0.5, (k) => {
    nav.pitch = 0.075 * k;
    nav.lean = 0.05 * heel * k;
  }, { ease: easeOut });
}

/** Sail (or be thrown) to a given distance from the fork over a number of seconds. */
function sailTo(target, seconds, ease, done) {
  const from = nav.dist;
  let last = from;
  nav.steering = true;
  return tween(seconds, (k) => {
    const d = from + (target - from) * k;
    nav.travel += last - d;
    nav.dist = last = d;
  }, { ease, done: () => {
    nav.steering = false;
    nav.speed = nav.flow;
    done?.();
  } });
}

/** Swing the fork across the bow (which is what turning looks like from the deck) over a number of seconds. */
function swingTo(target, seconds, ease = easeInOut) {
  const from = nav.lateral;
  tween(seconds, (k) => (nav.lateral = from + (target - from) * k), { ease });
}

/** Get her off the rocks and level again. */
function refloat() {
  if (!nav.stuck) return;
  sinkReef();
  const pitch = nav.pitch;
  const lean = nav.lean;
  tween(1.8, (k) => {
    nav.pitch = pitch * (1 - k);
    nav.lean = lean * (1 - k);
  }, { ease: easeInOut, done: () => (nav.stuck = false) });
}

function ringBell() {
  tween(1.6, (k, raw) => (bell.rotation.z = Math.sin(raw * Math.PI * 4) * 0.5 * (1 - raw)), { ease: linear });
}

// ---------------------------------------------------------------------------
// Acting out a change of phase
// ---------------------------------------------------------------------------

function enter(view, was) {
  const r = view.result;
  const sinking = view.phase === 'end' && view.finale?.win === 'mutineers';
  if (nav.stuck && view.phase !== 'reef' && !sinking) refloat();

  switch (view.phase) {
    case 'pick':
      ringBell();
      break;

    case 'steer': {
      // The wheel goes over: she swings towards the chosen side, heeling as she turns, and picks up speed.
      const s = sign(r.choice);
      sailTo(58, 3.5, easeInOut);
      swingTo(-s * GAP * 0.4, 3.5);
      tween(3.5, (k, raw) => {
        nav.yaw = -s * 0.07 * Math.sin(raw * Math.PI);
        nav.lean = s * 0.06 * Math.sin(raw * Math.PI);
      }, { ease: linear });
      break;
    }

    case 'reef': {
      // The rocks come up dead ahead, and there is no time to do anything about it.
      const s = sign(r.choice);
      raiseReef(r.choice);
      swingTo(-s * GAP, 1.1, easeOut);
      sailTo(13.5, was === 'steer' ? 1.45 : 0.01, easeIn, strike);
      break;
    }

    case 'clear': {
      // The rocks come up in the other channel, and she runs past them.
      const s = sign(r.choice);
      raiseReef(otherSide(r.choice));
      swingTo(-s * GAP, 1.8, easeOut);
      nav.speed = Math.max(nav.flow, 14);
      break;
    }

    case 'end':
      if (sinking) {
        // Down by the head. The camera goes under with her.
        const pitch = nav.pitch;
        const lean = nav.lean;
        tween(10, (k) => {
          nav.sink = -8.5 * k;
          nav.pitch = pitch + (-0.3 - pitch) * k;
          nav.lean = lean + (0.16 - lean) * k;
        }, { ease: easeIn });
        // The sea boils round the bow as it goes; once the camera is nearly under, the water closes over the picture.
        tween(5, () => {
          if (Math.random() < 0.3) toss(new THREE.Vector3(rand(-6, 6), 0.2, rand(-14, -5)), new THREE.Vector3(rand(-1, 1), rand(3, 7), rand(-1, 1)), { size: rand(0.3, 0.7), life: 1 });
        }, { ease: linear });
        sinkTimer = setTimeout(() => layer?.classList.add('sunk'), 3600);
      } else if (!island) {
        island = buildIsland();
        nav.gloomWant = 0;
      }
      break;
  }
}

/** How fast she wants to be going when nothing else is steering her. */
function wantSpeed() {
  if (nav.stuck) return 0;
  if (island) return clamp((island.dist - 82) * 0.2, 0, 18);
  if (!fork) return 5;
  if (['pick', 'nest', 'flags', 'helm'].includes(phase)) return clamp((nav.dist - HOLD) * 0.2, nav.dist > 70 ? 0.7 : 0.12, 18); // run in, then heave to while they argue
  if (phase === 'clear') return 21;
  if (phase === 'reef' || phase === 'steer') return 0;
  return 7;
}

// ---------------------------------------------------------------------------
// The signs over the two channels
// ---------------------------------------------------------------------------

const scratch = new THREE.Vector3();

function marks(view) {
  const r = view.result;
  const showing = fork && ['pick', 'nest', 'flags', 'helm', 'steer', 'reef', 'clear'].includes(view.phase);
  for (const side of ['port', 'starboard']) {
    const el = marksEl[side];
    el.dataset.on = showing ? '1' : '';
    if (!showing) continue;
    let cls = `tb-mark ${side}`;
    let html = `<b>${side === 'port' ? '◀ Port' : 'Starboard ▶'}</b>`;
    if (r) {
      html += `<span>${r.tally[side]} vote${r.tally[side] === 1 ? '' : 's'}</span>`;
      if (r.choice === side) cls += ' chosen';
    }
    if (r?.safe) {
      cls += r.safe === side ? ' safe' : ' reef';
      html += `<em>${r.safe === side ? 'Clear water' : '☠ The reef'}</em>`;
    }
    if (el.dataset.sig !== cls + html) {
      el.dataset.sig = cls + html;
      el.className = cls;
      el.innerHTML = html;
    }
  }
}

function placeMarks() {
  const unit = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  // The middle rock, as the window sees it: far off, the two signs stand clear of it either side rather than on top of each other.
  scratch.set(nav.lateral, 0, -nav.dist).project(camera);
  const middle = ((scratch.x + 1) / 2) * window.innerWidth;
  for (const side of ['port', 'starboard']) {
    const el = marksEl[side];
    let hide = !el.dataset.on || !fork || nav.dist > 300 || nav.dist < 16;
    if (!hide) {
      scratch.set(nav.lateral + sign(side) * GAP, 8.5 + nav.dist * 0.035, -nav.dist).project(camera);
      hide = scratch.z > 1 || Math.abs(scratch.x) > 1.05;
      if (!hide) {
        const apart = middle + sign(side) * 190 * unit;
        const x = ((scratch.x + 1) / 2) * window.innerWidth;
        const y = Math.max(((1 - scratch.y) / 2) * window.innerHeight, 330 * unit + (window.innerHeight - 1080 * unit) / 2); // never up behind the banner
        el.style.transform = `translate(${(side === 'port' ? Math.min(x, apart) : Math.max(x, apart)).toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
        el.style.opacity = clamp((300 - nav.dist) / 60, 0, 1).toFixed(2);
      }
    }
    el.hidden = hide;
  }
}

// ---------------------------------------------------------------------------
// Every frame
// ---------------------------------------------------------------------------

function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
  lastFrame = now;
  clock += dt;

  for (const tw of tweens) {
    tw.t += dt;
    if (tw.t < 0) continue;
    const raw = Math.min(1, tw.t / tw.dur);
    tw.fn(tw.ease(raw), raw);
    if (raw >= 1) {
      tweens.delete(tw);
      tw.done?.();
    }
  }

  // Sailing: unless a tween has the wheel, she eases towards whatever speed suits the moment.
  if (!nav.steering) {
    nav.speed += (wantSpeed() - nav.speed) * Math.min(1, dt * 1.4);
    nav.dist -= nav.speed * dt;
    nav.travel += nav.speed * dt;
  }
  const step = nav.travel - nav.lastTravel;
  nav.lastTravel = nav.travel;
  nav.flow = step / dt;

  if (fork) {
    fork.group.position.set(nav.lateral, 0, -nav.dist);
    for (const b of fork.buoys) {
      b.position.y = waterAt(nav.lateral + b.position.x, -nav.dist + b.position.z);
      b.rotation.z = Math.sin(clock * 1.3 + b.userData.lean) * 0.12;
      b.rotation.x = Math.sin(clock * 1.1 + b.userData.lean * 2) * 0.1;
    }
    if (nav.dist < -130) dropFork();
  }
  if (island) {
    island.dist -= step;
    island.group.position.set(0, 0, -island.dist);
  }

  waves();
  for (const f of flecks) {
    f.position.z += step;
    if (f.position.z > 14) f.position.set(rand(-90, 90), 0, f.position.z - rand(235, 250));
    f.position.y = waterAt(f.position.x, f.position.z) + 0.12;
  }
  for (const c of clouds) {
    c.position.x += c.userData.drift * dt;
    if (c.position.x > 1100) c.position.x = -1100;
  }

  // The bow wave: spray off both sides of the stem, more of it the faster she goes.
  sprayIn -= dt * Math.max(0, nav.flow - 3);
  while (sprayIn < 0 && nav.sink > -1) {
    sprayIn += 0.8;
    const s = Math.random() < 0.5 ? -1 : 1;
    toss(new THREE.Vector3(s * rand(0.6, 1.6), 0.3, rand(-6.5, -5)), new THREE.Vector3(s * rand(2.5, 6), rand(2, 4.5), rand(1, 4)), { size: rand(0.2, 0.45), life: rand(0.5, 0.9) });
  }
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i];
    b.age += dt;
    if (b.age < 0) continue;
    const k = b.age / b.life;
    if (k >= 1) {
      scene.remove(b.m);
      bits.splice(i, 1);
      continue;
    }
    b.v.y -= 20 * dt;
    b.m.position.addScaledVector(b.v, dt);
    b.m.position.z += step * 0.6;
    const swell = Math.sin(Math.min(1, k * 1.2) * Math.PI) ** 0.5;
    b.m.scale.set(b.size[0] * swell, b.size[1] * swell, b.size[2] * swell);
    if (b.spin) {
      b.m.rotation.x += b.spin * dt;
      b.m.rotation.y += b.spin * 0.6 * dt;
    }
  }

  // The weather follows the hull: every hole in it makes the day a little worse.
  nav.gloom += (nav.gloomWant - nav.gloom) * Math.min(1, dt * 0.5);
  nav.mist += (nav.mistWant - nav.mist) * Math.min(1, dt * 0.6);
  if (Math.abs(nav.gloom - nav.painted) > 0.008 || Math.abs(nav.mist - nav.paintedMist) > 0.008) paintMood(nav.gloom, nav.mist);

  // She rolls and pitches gently on the swell; the camera goes with her.
  const swell = 1 + nav.gloom * 0.9;
  boat.rotation.set(Math.sin(clock * 0.9 + 1) * 0.011 * swell + nav.pitch, nav.yaw, Math.sin(clock * 0.7) * 0.017 * swell + nav.lean);
  boat.position.y = Math.sin(clock * 0.8) * 0.13 * swell + nav.sink;
  shake *= Math.max(0, 1 - dt * 3.2);
  camera.position.set(EYE[0] + rand(-1, 1) * shake * 0.35, EYE[1] + rand(-1, 1) * shake * 0.35, EYE[2]);
  camera.rotation.set(-0.05 + rand(-1, 1) * shake * 0.02, 0, rand(-1, 1) * shake * 0.03);
  boat.updateMatrixWorld(true);

  placeMarks();
  styler.render(scene, camera);
}

// ---------------------------------------------------------------------------
// The two functions host.js calls
// ---------------------------------------------------------------------------

/** Draw (or update) the view from the bow for a view of the game. */
export function show(view) {
  if (!layer) init();
  if (layer.hidden) {
    layer.hidden = false;
    fit();
    running = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }
  layer.dataset.phase = view.phase;

  // A new leg: a new fork, a long way off in the haze.
  const leg = `${view.voyage}:${view.leg}`;
  if (leg !== legKey) {
    legKey = leg;
    dropFork();
    Object.assign(nav, { lateral: 0, yaw: 0, steering: false });
    if (view.leg === 0) {
      // A new voyage: a sound ship and a fair morning.
      if (island) scene.remove(island.group);
      island = null;
      clearTimeout(sinkTimer);
      layer.classList.remove('sunk');
      Object.assign(nav, { sink: 0, pitch: 0, lean: 0, stuck: false, gloom: 0 });
    } else if (!['brig', 'brigged', 'end'].includes(view.phase)) {
      fork = buildFork(view.key);
      nav.dist = 330;
    }
  }

  if (!view.finale) nav.gloomWant = (1 - view.hull / view.hullMax) * 0.9;
  nav.mistWant = view.fog && ['pick', 'nest', 'flags', 'helm', 'steer', 'reef', 'clear'].includes(view.phase) ? 1 : 0; // it lifts for the brig
  if (view.phase !== phase) {
    const was = phase;
    phase = view.phase;
    enter(view, was);
  }
  marks(view);
}

/** Put the scene away (another screen is showing). */
export function hide() {
  if (!layer || layer.hidden) return;
  layer.hidden = true;
  clearTimeout(sinkTimer);
  layer.classList.remove('sunk');
  running = false;
  tweens.clear();
  dropFork();
  if (island) scene.remove(island.group);
  island = null;
  for (const b of bits) scene.remove(b.m);
  bits.length = 0;
  legKey = null;
  phase = null;
  shake = 0;
  bell.rotation.z = 0;
  Object.assign(nav, { dist: 400, speed: 5, steering: false, stuck: false, lateral: 0, yaw: 0, lean: 0, pitch: 0, sink: 0, gloom: 0, gloomWant: 0, mist: 0, mistWant: 0 });
}

// ---------------------------------------------------------------------------
// The words host.js draws over the top
// ---------------------------------------------------------------------------

/** host.js hands over its drawing helpers and gets back the screen ("tb"). */
export function brigScreens({ anim, chip, player }) {
  const name = (id) => esc(player(id)?.name ?? 'Somebody');
  const names = (ids) => {
    const list = ids.map(name);
    return list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : (list[0] ?? '');
  };
  const face = (id) => chip(id, { label: false });

  /** What the result says about the lookouts. In fog a wrong flag might be an honest mistake, so it is never called a lie. */
  function verdict(v) {
    const r = v.result;
    const followed = r.choice === v.flags[0];
    if (r.hit) return r.split ? 'The crew believed the wrong flag.' : !followed ? 'The flags were true, and the crew ignored them.' : v.fog ? 'Both flags were wrong. Fog, or foul play?' : 'Both lookouts lied!';
    if (r.split) return v.fog ? 'The crew picked the right flag.' : 'The crew saw through the lie.';
    return followed ? 'Both flags were true.' : v.fog ? 'Both flags were wrong, and the crew ignored them!' : 'Both lookouts lied, and the crew called their bluff!';
  }

  /** The banner along the top: what is happening, in a kicker, a headline and a line underneath. */
  function banner(v) {
    const r = v.result;
    const leg = v.leg ? `${v.leg === v.legs ? 'The last leg' : `Leg ${v.leg} of ${v.legs}`} · ${esc(v.hazard ?? '')}${v.fog ? ' · 🌫️ Fog' : ''}` : '';
    const flags = v.flags ? `<span class="tb-flags">${v.flags.map((f, i) => `<span${anim(`flag${i}`, 'tb-hoist', i * 500, 550)}>${signalFlag(f)}</span>`).join('')}</span>` : '';
    const split = v.flags && v.flags[0] !== v.flags[1];
    const onDeck = v.crew.length - v.brig.length;
    const count = (n, of) => `<span class="tb-in">${n} of ${of} in</span>`;

    switch (v.phase) {
      case 'roles':
        return [
          v.voyages > 1 ? `Voyage ${v.voyage} of ${v.voyages}` : 'Secret orders',
          'Look at your phone',
          `${v.traitors === 1 ? 'One of you is a mutineer' : `${v.traitors} of you are mutineers`}. Keep it to yourself. <span class="tb-in">${v.ready.length} of ${v.crew.length} ready</span>`,
        ];
      case 'pick':
        return [leg, `${chip(v.captain)} <i>is captain</i>`, `Captain: send two pirates up the crow’s nest${v.fog ? '. It’s foggy: a spyglass could be wrong' : ''}`];
      case 'nest':
        return [leg, v.nest.map((id) => chip(id)).join(' <i>and</i> '), `are up the crow’s nest. Only they can see the reef${v.fog ? ', if the fog lets them' : ''}.${v.parrot ? ' <span class="tb-in">🦜 the parrot chose</span>' : ''}`];
      case 'flags':
        return [`${names(v.nest)} signal…`, flags, split ? (v.fog ? 'They disagree. A liar, or the fog?' : 'They disagree. One of them is lying!') : `Both say ${v.flags[0]}.`];
      case 'helm':
        return [`${names(v.nest)} signal…`, flags, `${split ? (v.fog ? 'A liar, or the fog? Argue it out, then vote on your phone' : 'One of them is lying. Argue it out, then vote on your phone') : 'Do you trust them? Vote on your phone'} ${count(v.voted.length, onDeck - v.nest.length)}`];
      case 'steer':
        return [
          r.tie ? `Dead heat! Captain ${name(v.captain)} has the wheel` : 'The crew has voted',
          `<span${anim('hard', 'slam', 0, 450)}>Hard to ${r.choice}!</span>`,
          `<span class="tb-tally port">Port ${r.tally.port}</span> <span class="tb-tally starboard">${r.tally.starboard} Starboard</span>`,
        ];
      case 'reef':
        return ['She’s struck the reef!', `<i>The safe way was</i> ${signalFlag(r.safe)}`, verdict(v)];
      case 'clear':
        return ['Clear water!', `<i>The reef was to</i> ${signalFlag(otherSide(r.safe))}`, verdict(v)];
      case 'brig':
        return ['Somebody is steering us wrong', 'Who goes to the brig?', `Argue it out, then vote on your phone. Most votes goes below ${count(v.voted.length, onDeck)}`];
      case 'brigged': {
        const j = v.jail;
        if (!j.sent) return ['The crew can’t agree', 'Nobody goes below', 'For now.'];
        return ['The crew has spoken', `${chip(j.sent)} <i>goes below</i>`, `${j.freed ? `${name(j.freed)} is turned loose. ` : ''}${j.drink ? `A swig of ${esc(j.drink)} on the way down.` : j.freed ? '' : 'No more voting or climbing for them.'}`];
      }
      default:
        return v.finale.win === 'crew' ? ['Land ho!', 'The loyal crew win', 'The island, the treasure, and nobody drowned.'] : ['She’s going down!', 'The mutineers win', 'All hands to the bottom of the sea.'];
    }
  }

  /** How the voyage is going: a dot for each leg, and the island at the end. */
  function chart(v) {
    if (!v.leg) return '';
    const done = v.log.length;
    const dots = Array.from({ length: v.legs }, (_, i) => `<i class="${i < done ? v.log[i] : i === v.leg - 1 ? 'now' : ''}"></i>`).join('');
    return `<div class="tb-chart">${dots}<span>🏝️</span></div>`;
  }

  function hull(v) {
    const planks = Array.from({ length: v.hullMax }, (_, i) => `<i class="${i < v.hull ? '' : 'gone'}"${i === v.hull && v.phase === 'reef' ? anim(`plank${i}`, 'tb-crack', 300, 900) : ''}></i>`).join('');
    return `<div class="tb-hull ${v.hull === 1 ? 'last' : ''}"><b>Hull</b><span>${planks}</span></div>`;
  }

  /** Along the bottom: the brig, and everybody still on deck. */
  function roster(v) {
    const voted = new Set(v.voted);
    const unmasked = new Set(v.finale?.mutineers ?? []);
    const working = ['pick', 'nest', 'flags', 'helm', 'steer', 'reef', 'clear'].includes(v.phase);
    const one = (id) => {
      let tag = '';
      if (v.finale) tag = unmasked.has(id) ? '<span class="tb-tag red">Mutineer</span>' : '';
      else if (working && v.nest.includes(id)) tag = `<span class="tb-tag ${v.captain === id ? 'gold' : ''}">🔭 ${v.captain === id ? 'Captain' : 'Lookout'}</span>`; // a captain may send themself up
      else if (working && v.captain === id) tag = '<span class="tb-tag gold">Captain</span>';
      return `<span class="tb-hand ${voted.has(id) ? 'voted' : ''} ${player(id)?.away ? 'away' : ''} ${v.finale && unmasked.has(id) ? 'traitor' : ''}">${tag}${chip(id)}</span>`;
    };
    const cells = Array.from({ length: Math.max(v.cells, v.brig.length) }, (_, i) => (v.brig[i] ? `<span class="tb-cell"${v.jail?.sent === v.brig[i] ? anim('clang', 'slam', 1500, 500) : ''}>${one(v.brig[i])}</span>` : '<span class="tb-cell empty"></span>')).join('');
    const deck = v.crew.filter((id) => !v.brig.includes(id)).map(one).join('');
    return `<div class="tb-crew ${v.crew.length > 7 ? 'dense' : ''}">
      <div class="tb-cage"><b>The brig</b>${cells}</div>
      <div class="tb-deck">${deck}</div>
    </div>`;
  }

  /** The brig vote, laid out: who voted for whom. */
  function ballot(v) {
    const j = v.jail;
    const row = (label, by, cls = '', i = 0) => `<p class="tb-row ${cls}"${anim(`row${i}`, 'from-left', i * 180, 450)}><span class="tb-who">${label}</span><span class="tb-by">${by.map(face).join('')}</span><b>${by.length}</b></p>`;
    const rows = j.votes.map((x, i) => row(chip(x.id), x.by, x.id === j.sent ? 'sent' : '', i));
    if (j.nobody.length) rows.push(row('<span class="nm">Nobody</span>', j.nobody, '', rows.length));
    return `<div class="tb-ballot parch">${rows.join('') || '<p class="tb-row">Nobody voted at all.</p>'}</div>
      ${j.sent ? `<div class="tb-stamp"${anim('stamp', 'tb-stamp', 1500, 2800)}>To the brig with ye!</div>` : ''}`;
  }

  function unmasking(v) {
    const list = v.finale.mutineers.map((id, i) => `<span class="tb-rogue"${anim(`rogue${id}`, 'slam', 2600 + i * 700, 500)}>${chip(id)}</span>`).join('');
    return `<div class="tb-unmask parch"${anim('unmask', 'rise', 1800, 600)}><p>${v.finale.mutineers.length > 1 ? 'The mutineers were' : 'The mutineer was'}</p><div>${list}</div></div>`;
  }

  function screen(v) {
    const [kicker, main, sub] = banner(v);
    let extra = '';
    if (v.phase === 'reef') extra = `<div class="tb-stamp"${anim('stamp', 'tb-stamp', 1500, 3200)}>${v.result.sunk ? 'Holed!' : 'Reef!'}</div>`;
    if (v.phase === 'clear') extra = `<div class="tb-stamp good"${anim('stamp', 'tb-stamp', 900, 2600)}>Clear water!</div>`;
    if (v.phase === 'brigged') extra = ballot(v);
    if (v.phase === 'end') extra = unmasking(v);
    return `<div class="tb-hud" data-phase="${esc(v.phase)}">
      <div class="tb-top parch"${anim('top', 'drop', 0, 500)}>
        <p class="tb-kicker">${kicker}</p>
        <p class="tb-main"${anim(`main-${v.phase}`, 'pop', 0, 380)}>${main}</p>
        <p class="tb-sub">${sub}</p>
      </div>
      ${chart(v)}${hull(v)}${extra}${roster(v)}
    </div>`;
  }

  return { tb: screen };
}
