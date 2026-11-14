// Knot So Fast on the big screen: a model regatta on the tavern table, drawn in
// 3D with three.js in the same hand-carved style as Bombard!. A tray of resin
// sea, a desert island in the middle of it, and painted ships racing round.
//
// host.js draws the sheets that come up between races (crews, the table, the
// muster). This file owns the model, and the words that sit over it during a
// race: the running order along the bottom, name flags, callouts, the countdown.
//
// How it fits together
// --------------------
// * show(view) is called every time the server sends a view. During a race
//   that is a few times a second, with every ship's position and wind.
// * Between those messages this file does the sums itself, with the same
//   motion code the server uses (knots-motion.js), so the ships glide. When a
//   fresh message disagrees slightly, the difference is eased out, not jumped.
// * Things that happen (a shot, a hit, a new leader) arrive as a short list of
//   numbered events; each is acted out once.
// * Everything else that moves is a "tween": a little function called every
//   frame with a number going from 0 to 1.
//
// * Round the tray is the tavern: the race is being bet on. Coins are flung
//   onto the table, fists pound it, daggers get stuck in it, and the punters
//   shout. None of that touches the race; it is all set off by the same events.
//
// World units: the tray is about 20 wide. x runs left to right, y is up, z
// comes towards the camera. The sea is at y = 0.

import * as THREE from './vendor/three.module.min.js';
import * as sound from './sound.js';
import { serverNow, esc } from './common.js';
import { PAINTS } from './knots-play.js';
import { advance, speedOf, freshWind, inOrder } from './knots-motion.js';
import './knots-sound.js';

const TRAY = { w: 20.6, d: 10.6 }; // the tray of sea, the same one Bombard! uses
const TABLE = -0.6; // the height of the table top
const COURSE = { a: 7.9, b: 3.75 }; // the racing line: an oval this far across and this deep (half-widths)
const FINISH = { post: [0, 1.62], buoy: [0, COURSE.b + 1.45] }; // the two ends of the bunting, as [x, z]

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const easeOut = (k) => 1 - (1 - k) ** 3;
const linear = (k) => k;
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

let layer = null; // the <div> that holds the canvas and the words drawn over it
let renderer, scene, camera, sun, sky, water;
let ui = {}; // the bits of the HUD
let running = false;
let lastFrame = 0;
let time = 0; // seconds since the model was first shown
let shake = 0;
let bolt = 0; // lightning
let players = new Map();
let current = null; // the latest view

const tweens = new Set();
const cam = { target: new THREE.Vector3(0, 0, 0.2), dist: 30, elevation: 1.04 };

// The island's moving parts.
let castaway = null;
let fire = null; // { flames, lamp }
let candle = null; // { flame, lamp }
let lighthouse = null; // { lamp, glass, beam }
let nextSmoke = 0;
let nextBolt = 6;

// The race as this screen understands it.
const race = { key: null, kind: null, clock: 0, rate: 0, motion: null, goal: null, lastEvent: 0, phase: null, count: null, order: '' };
let fleet = []; // every ship (or rowing boat) on the water
const fleetById = new Map();
const balls = new Set(); // cannonballs in the air

// The tavern round the tray.
const RUG = { w: 25.6, d: 14.6, turn: 0.035, x: 0.2, z: 0.25 }; // the rug the tray stands on
const mugs = []; // tankards, which jump when the table is thumped
const arms = []; // the punters' fists resting on the edge of the table
const coins = []; // bets thrown onto the table during this game
const daggers = []; // ...and the daggers stuck into it
let nextRuckus = 3;
let lastHeckle = 0;
let oddsAt = 0;

/** Run fn(eased, raw) every frame for `dur` seconds. */
function tween(dur, fn, { delay = 0, ease = easeOut, done = null } = {}) {
  const tw = { t: -delay, dur: Math.max(0.001, dur), fn, ease, done };
  tweens.add(tw);
  return tw;
}

// ----- paint and parts (the same kit Bombard! is made with) -----

const paints = new Map();
/** A pot of paint. Everything is flat-shaded, so the models look hand-carved. */
function paint(color, { glow = 0, rough = 0.75, side = THREE.FrontSide } = {}) {
  const key = `${color}:${glow}:${rough}:${side}`;
  if (!paints.has(key)) {
    paints.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: rough, metalness: 0.02, side, emissive: glow ? color : 0x000000, emissiveIntensity: glow }));
  }
  return paints.get(key);
}
const hex = (css) => new THREE.Color(css).getHex();

const SHAPES = {};
function shapes() {
  if (SHAPES.box) return SHAPES;
  SHAPES.box = new THREE.BoxGeometry(1, 1, 1);
  SHAPES.ball = new THREE.IcosahedronGeometry(1, 1);
  SHAPES.rock = new THREE.IcosahedronGeometry(1, 0);
  SHAPES.rod = new THREE.CylinderGeometry(1, 1, 1, 8);
  SHAPES.cone = new THREE.ConeGeometry(1, 1, 7);
  SHAPES.disc = new THREE.CylinderGeometry(1, 1, 1, 20);
  SHAPES.ring = new THREE.TorusGeometry(1, 0.08, 6, 24).rotateX(Math.PI / 2);
  SHAPES.flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
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

/** A flat outline (given from above, as [x, z] points) made into a slab between two heights. */
function slab(points, y0, y1, material, into) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  g.translate(0, y1, 0);
  return part(g, material, { into });
}

/** Text or a little drawing on a square of canvas, to stick onto a model. */
function decal(draw, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// ----- the course -----

// The racing line is an oval. Ships must cover it at an even pace, so the oval
// is measured once (how far round is each angle?) and looked up after that.
const ARC = (() => {
  const steps = 720;
  const lengths = [0];
  let px = 0;
  let pz = COURSE.b;
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = -COURSE.a * Math.sin(a);
    const z = COURSE.b * Math.cos(a);
    lengths.push(lengths[i - 1] + Math.hypot(x - px, z - pz));
    px = x;
    pz = z;
  }
  return { steps, lengths, total: lengths[steps] };
})();

/**
 * Where a ship that has sailed `frac` of a lap is, and which way it points.
 * The line starts at the front of the tray (nearest the camera), heads left,
 * and goes round the island clockwise as seen from above. `lane` moves the
 * ship out from the racing line (negative is nearer the island).
 */
function spot(frac, lane = 0) {
  const want = (((frac % 1) + 1) % 1) * ARC.total;
  let lo = 0;
  let hi = ARC.steps;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ARC.lengths[mid] <= want) lo = mid;
    else hi = mid;
  }
  const a = ((lo + (want - ARC.lengths[lo]) / (ARC.lengths[hi] - ARC.lengths[lo])) / ARC.steps) * Math.PI * 2;
  const x = -COURSE.a * Math.sin(a);
  const z = COURSE.b * Math.cos(a);
  const tx = -COURSE.a * Math.cos(a);
  const tz = -COURSE.b * Math.sin(a);
  const nx = x / COURSE.a ** 2;
  const nz = z / COURSE.b ** 2;
  const n = Math.hypot(nx, nz);
  return { x: x + (nx / n) * lane, z: z + (nz / n) * lane, turn: Math.atan2(tz, -tx) };
}

// ----- setting up -----

function init() {
  shapes();
  layer = document.createElement('div');
  layer.id = 'knLayer';
  layer.hidden = true;
  layer.innerHTML = `<div class="kn-vignette"></div>
    <div class="kn-tags"></div>
    <div class="kn-callouts"></div>
    <div class="kn-hud">
      <div class="kn-top"><b></b><span></span></div>
      <div class="kn-cards"></div>
      <div class="kn-heckles"></div>
      <div class="kn-ticker" hidden></div>
      <div class="kn-big" hidden></div>
      <div class="kn-rules parch" hidden></div>
      <div class="kn-banner" hidden><b></b><span></span></div>
    </div>`;
  document.getElementById('stage').before(layer);
  for (const name of ['top', 'tags', 'callouts', 'cards', 'heckles', 'ticker', 'big', 'rules', 'banner']) ui[name] = layer.querySelector(`.kn-${name}`);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  layer.prepend(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a1c12);
  camera = new THREE.PerspectiveCamera(28, 16 / 9, 1, 200);

  sky = new THREE.HemisphereLight(0xfff1d8, 0x4a6a80, 1.25);
  scene.add(sky);
  sun = new THREE.DirectionalLight(0xffe9c4, 2.6);
  sun.position.set(-9, 17, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 14, bottom: -14, near: 1, far: 60 });
  sun.shadow.bias = -0.0006;
  sun.shadow.radius = 5;
  scene.add(sun);

  buildTable();
  buildTavern();
  buildIsland();
  buildLine();
  window.addEventListener('resize', fit);
  fit();
}

// ----- the table, the tray and the sea -----

function buildTable() {
  const S = shapes();
  // The table top: planks, drawn once onto a canvas.
  const wood = decal((c, s) => {
    c.fillStyle = '#5b3d25';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) {
      c.fillStyle = ['#63432a', '#573a23', '#6a4a2f', '#5e4027'][i];
      c.fillRect(0, (i * s) / 4, s, s / 4 - 3);
    }
    for (let i = 0; i < 260; i++) {
      c.strokeStyle = `rgba(${Math.random() < 0.5 ? '30,15,5' : '150,110,70'},${0.05 + Math.random() * 0.1})`;
      c.lineWidth = 1 + Math.random() * 2;
      const y = Math.random() * s;
      c.beginPath();
      c.moveTo(0, y);
      c.bezierCurveTo(s * 0.3, y + rand(-6, 6), s * 0.7, y + rand(-6, 6), s, y);
      c.stroke();
    }
  }, 512);
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  wood.repeat.set(5, 4);
  const top = part(S.flat, new THREE.MeshStandardMaterial({ map: wood, roughness: 0.85 }), { at: [0, TABLE, 0], size: [90, 1, 60], into: scene });
  top.castShadow = false;

  // The tray: four dark rails with brass corners.
  const rail = paint(0x3f2817, { rough: 0.6 });
  const brass = paint(0xd9a441, { rough: 0.35 });
  const t = 0.55;
  const { w, d } = TRAY;
  for (const z of [-1, 1]) part(S.box, rail, { at: [0, -0.1, z * (d / 2 + t / 2)], size: [w + t * 2, 1.0, t], into: scene });
  for (const x of [-1, 1]) part(S.box, rail, { at: [x * (w / 2 + t / 2), -0.1, 0], size: [t, 1.0, d], into: scene });
  for (const x of [-1, 1]) for (const z of [-1, 1]) part(S.box, brass, { at: [x * (w / 2 + t / 2), -0.08, z * (d / 2 + t / 2)], size: [t + 0.08, 1.06, t + 0.08], into: scene });

  // The sea: one sheet of little triangles, each a slightly different blue, which rises and falls.
  const g = new THREE.PlaneGeometry(w, d, 70, 30).rotateX(-Math.PI / 2).toNonIndexed();
  const count = g.attributes.position.count;
  const colours = new Float32Array(count * 3);
  const base = new THREE.Color();
  for (let i = 0; i < count; i += 3) {
    // Paler and greener in the shallows round the island.
    const x = (g.attributes.position.getX(i) + g.attributes.position.getX(i + 1) + g.attributes.position.getX(i + 2)) / 3;
    const z = (g.attributes.position.getZ(i) + g.attributes.position.getZ(i + 1) + g.attributes.position.getZ(i + 2)) / 3;
    const shallow = clamp(1.6 - Math.hypot(x / 5.6, z / 1.75), 0, 1);
    base.setHSL(0.52 - shallow * 0.045 + rand(-0.012, 0.012), 0.62 - shallow * 0.1, 0.3 + shallow * 0.2 + rand(-0.025, 0.035));
    for (let k = 0; k < 3; k++) base.toArray(colours, (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  water = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.22, metalness: 0.15 }));
  water.receiveShadow = true;
  scene.add(water);

  // The clutter that makes it a table: doubloons and a candle (the ale and the punters are in buildTavern).
  const gold = paint(0xe9b949, { rough: 0.28 });
  const dark = paint(0xc8962f, { rough: 0.35 });
  const coin = (x, y, z, tilt = 0) => part(S.disc, Math.random() < 0.3 ? dark : gold, { at: [x, y, z], size: [0.48, 0.09, 0.48], turn: [tilt, rand(0, 3), tilt * 0.6], into: scene });
  for (let i = 0; i < 7; i++) coin(12.6 + rand(-0.05, 0.05), ground(12.6, 5.6) + 0.05 + i * 0.095, 5.6 + rand(-0.05, 0.05));
  for (let i = 0; i < 6; i++) coin(12.6 + rand(-0.9, 0.9), ground(12.6, 5.6) + 0.05, 5.6 + rand(-1.6, 1.2));

  // A candle, burned well down. It is lit for the evening race and the storm.
  const stick = new THREE.Group();
  part(S.disc, paint(0xd9a441, { rough: 0.3 }), { at: [0, 0.08, 0], size: [1.1, 0.16, 1.1], into: stick });
  part(S.rod, paint(0xf3e7c9, { rough: 0.6 }), { at: [0, 0.9, 0], size: [0.42, 1.6, 0.42], into: stick });
  const flame = part(S.cone, new THREE.MeshBasicMaterial({ color: 0xffc35a }), { at: [0, 2.05, 0], size: [0.16, 0.6, 0.16], shadow: false, into: stick });
  const lamp = new THREE.PointLight(0xff9a3c, 0, 18, 1.7);
  lamp.position.set(0, 2.6, 0);
  stick.add(lamp);
  stick.position.set(12.4, ground(12.4, -8.3), -8.3);
  scene.add(stick);
  candle = { flame, lamp };
}

function waves(t, swell) {
  const pos = water.geometry.attributes.position;
  const a = pos.array;
  for (let i = 0; i < a.length; i += 3) {
    const x = a[i];
    const z = a[i + 2];
    a[i + 1] = Math.sin(x * 1.3 + t * 1.1) * Math.cos(z * 1.7 + t * 0.8) * swell + Math.sin(x * 3.1 - z * 2.3 + t * 1.9) * swell * 0.4;
  }
  pos.needsUpdate = true;
}

// ----- the tavern round the tray -----

/** How high the table is at a spot: the bare wood, or the rug lying on it. */
function ground(x, z) {
  const onRug = Math.abs(x - RUG.x) < RUG.w / 2 - 0.2 && Math.abs(z - RUG.z) < RUG.d / 2 - 0.2;
  return TABLE + (onRug ? 0.075 : 0.012);
}

function tankard(x, z, turn = 0) {
  const S = shapes();
  const g = new THREE.Group();
  const oak = paint(0x8a5a2e, { rough: 0.8 });
  const iron = paint(0x2b2d33, { rough: 0.4 });
  part(new THREE.CylinderGeometry(1.25, 1.4, 3.2, 14), oak, { at: [0, 1.6, 0], into: g });
  for (const y of [0.5, 2.7]) part(new THREE.CylinderGeometry(1.43 - y * 0.05, 1.45 - y * 0.05, 0.22, 14), iron, { at: [0, y, 0], into: g }); // the hoops
  part(new THREE.TorusGeometry(0.85, 0.2, 6, 12, Math.PI), oak, { at: [1.3, 1.6, 0], turn: [0, 0, -Math.PI / 2], into: g }); // the handle
  // A good head on it.
  const froth = paint(0xfff6df, { rough: 1 });
  for (let i = 0; i < 9; i++) part(S.ball, froth, { at: [Math.cos(i * 0.7) * 0.75, 3.25 + rand(-0.05, 0.12), Math.sin(i * 0.7) * 0.75], size: rand(0.38, 0.52), into: g });
  part(S.ball, froth, { at: [0, 3.4, 0], size: 0.8, into: g });
  g.position.set(x, ground(x, z), z);
  g.rotation.y = turn;
  g.userData.rest = g.position.y;
  scene.add(g);
  mugs.push(g);
}

/**
 * A punter's forearm, life-size, resting on the table with the fist towards
 * the tray. Only the fist and a bit of sleeve reach into the picture; the
 * rest of him is out in the dark.
 */
function arm(x, z, turn, coat, skin = 0xd9a074) {
  const S = shapes();
  const g = new THREE.Group();
  const flesh = paint(skin, { rough: 0.8 });
  part(new THREE.CylinderGeometry(1.45, 1.05, 9.5, 10), paint(coat, { rough: 0.95 }), { at: [-6.7, 1.2, 0], turn: [0, 0, Math.PI / 2], into: g }); // the sleeve
  part(new THREE.CylinderGeometry(1.3, 1.22, 0.9, 10), paint(0xe9dfc8, { rough: 0.9 }), { at: [-1.9, 1.12, 0], turn: [0, 0, Math.PI / 2], into: g }); // a grubby cuff
  part(S.rod, flesh, { at: [-1.25, 1.02, 0], size: [0.72, 0.7, 0.86], turn: [0, 0, Math.PI / 2], into: g }); // the wrist
  part(S.ball, flesh, { at: [-0.1, 0.98, 0], size: [1.1, 0.95, 1.12], into: g }); // the fist
  for (let i = 0; i < 4; i++) part(S.ball, flesh, { at: [0.72, 1.12 - Math.abs(i - 1.5) * 0.06, -0.72 + i * 0.48], size: [0.36, 0.34, 0.25], into: g }); // knuckles
  part(S.ball, flesh, { at: [0.25, 0.85, 1.0], size: [0.62, 0.36, 0.34], turn: [0, 0.5, 0], into: g }); // the thumb
  g.position.set(x, ground(x, z), z);
  g.rotation.y = turn;
  Object.assign(g.userData, { rest: g.position.y, seed: rand(0, 6), lift: 0 });
  scene.add(g);
  arms.push(g);
}

function buildTavern() {
  const S = shapes();

  // An old chart, left on the table from some other argument. It pokes out from under the rug at the corners.
  const chart = decal((c, s) => {
    c.fillStyle = '#d9c69a';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(${pick(['120,85,40', '90,60,25', '255,245,215'])},${rand(0.04, 0.12)})`;
      c.beginPath();
      c.ellipse(rand(0, s), rand(0, s), rand(20, 110), rand(20, 80), rand(0, 3), 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = 'rgba(70,45,20,0.35)';
    c.lineWidth = 1.5;
    for (const [cx, cy] of [[s * 0.2, s * 0.3], [s * 0.78, s * 0.72]]) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
        c.stroke();
      }
      c.beginPath();
      c.arc(cx, cy, s * 0.06, 0, Math.PI * 2);
      c.stroke();
    }
    c.strokeStyle = 'rgba(60,35,15,0.6)';
    c.lineWidth = 6;
    c.strokeRect(14, 14, s - 28, s - 28);
  }, 512);
  const sheet = part(S.flat, new THREE.MeshStandardMaterial({ map: chart, roughness: 0.95 }), { at: [2.6, TABLE + 0.012, -1.4], size: [29.5, 1, 18.6], turn: [0, 0.19, 0], into: scene });
  sheet.castShadow = false;

  // The rug the tray stands on: red, navy and cream, worn thin in places, with a fringe at each end.
  const weave = decal((c, s) => {
    const k = RUG.d / RUG.w; // the canvas is square but the rug is not, so shapes are squeezed across to come out true
    c.fillStyle = '#7b2320';
    c.fillRect(0, 0, s, s);
    const band = (inset, width, colour) => {
      c.strokeStyle = colour;
      c.lineWidth = width;
      c.strokeRect(inset * k, inset, s - inset * k * 2, s - inset * 2);
    };
    band(s * 0.035, s * 0.07, '#1f2f4f');
    band(s * 0.08, s * 0.012, '#e3d2a4');
    band(s * 0.115, s * 0.03, '#a8842f');
    band(s * 0.145, s * 0.01, '#e3d2a4');
    // A lattice of diamonds across the middle.
    const step = s / 9;
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 17; col++) {
        const x = s * 0.5 + (col - 8) * step * k * 1.05;
        const y = row * step + (col % 2 ? step / 2 : 0);
        if (x < s * 0.19 * k + 30 || x > s - s * 0.19 * k - 30 || y < s * 0.19 || y > s * 0.81) continue;
        c.fillStyle = (row + col) % 3 === 0 ? '#1f2f4f' : (row + col) % 3 === 1 ? '#a8842f' : '#93302a';
        c.beginPath();
        c.moveTo(x, y - step * 0.36);
        c.lineTo(x + step * 0.36 * k, y);
        c.lineTo(x, y + step * 0.36);
        c.lineTo(x - step * 0.36 * k, y);
        c.fill();
      }
    }
    // Wear: the threads show, and some of it has faded.
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = `rgba(${Math.random() < 0.5 ? '30,10,8' : '240,215,170'},${rand(0.03, 0.12)})`;
      c.fillRect(rand(0, s), rand(0, s), rand(1, 4), rand(4, 16));
    }
    for (let i = 0; i < 10; i++) {
      c.fillStyle = `rgba(215,185,140,${rand(0.05, 0.12)})`;
      c.beginPath();
      c.ellipse(rand(0, s), rand(0, s), rand(30, 90), rand(40, 140), 0, 0, Math.PI * 2);
      c.fill();
    }
  }, 1024);
  const rug = new THREE.Group();
  part(S.box, paint(0x4a1512, { rough: 1 }), { at: [0, 0.03, 0], size: [RUG.w, 0.06, RUG.d], into: rug });
  const pile = part(S.flat, new THREE.MeshStandardMaterial({ map: weave, roughness: 1 }), { at: [0, 0.064, 0], size: [RUG.w, 1, RUG.d], into: rug });
  pile.castShadow = false;
  const tassel = paint(0xe3d2a4, { rough: 1 });
  for (const end of [-1, 1]) {
    for (let i = 0; i < 58; i++) {
      const z = -RUG.d / 2 + 0.14 + (i / 57) * (RUG.d - 0.28);
      part(S.box, tassel, { at: [end * (RUG.w / 2 + 0.26 + rand(-0.03, 0.05)), 0.02, z], size: [0.52, 0.025, 0.07], turn: [0, rand(-0.25, 0.25), 0], shadow: false, into: rug });
    }
  }
  rug.position.set(RUG.x, TABLE, RUG.z);
  rug.rotation.y = RUG.turn;
  scene.add(rug);

  // Ale. Each of these jumps when somebody thumps the table.
  tankard(-13.5, -6.9, 0.8);
  tankard(14.3, 0.9, 3.6);
  tankard(-14.6, 4.9, 2.2);

  // The punters. Four of them have a fist on the table.
  arm(-13.6, 1.6, 0.12, 0x7a1f1c);
  arm(13.7, -3.3, Math.PI - 0.1, 0x1f3a5f, 0xb9804f);
  arm(-6.9, -9.1, -Math.PI / 2 + 0.16, 0x3d2b20, 0xe2b48c);
  arm(7.6, -9.3, -Math.PI / 2 - 0.2, 0x2f4a2f);
}

// ----- the island -----

/** A wobbly oval, as [x, z] points going round. */
function blob(rx, rz, wobble, seed, n = 30) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const r = 1 + wobble * Math.sin(a * 3 + seed) + wobble * 0.6 * Math.sin(a * 5 + seed * 2.3);
    return [Math.cos(a) * rx * r, Math.sin(a) * rz * r];
  });
}

function palm(into, x, z, height, lean, turn) {
  const S = shapes();
  const g = new THREE.Group();
  const bark = paint(0x7a5a36, { rough: 0.9 });
  const barkDark = paint(0x67492a, { rough: 0.9 });
  // The trunk: short lengths, each leaning a little more than the last.
  const lengths = 6;
  let px = 0;
  let py = 0;
  let angle = 0;
  for (let i = 0; i < lengths; i++) {
    const len = height / lengths;
    angle += lean / lengths;
    const cx = px + (Math.sin(angle) * len) / 2;
    const cy = py + (Math.cos(angle) * len) / 2;
    part(S.rod, i % 2 ? bark : barkDark, { at: [cx, cy, 0], size: [0.075 - i * 0.006, len * 1.08, 0.075 - i * 0.006], turn: [0, 0, -angle], into: g });
    px += Math.sin(angle) * len;
    py += Math.cos(angle) * len;
  }
  // The fronds: long leaves drooping away from the crown.
  const leaf = paint(0x4f9a45, { rough: 0.85 });
  const leafDark = paint(0x3d7f3a, { rough: 0.85 });
  for (let i = 0; i < 7; i++) {
    const frond = new THREE.Group();
    frond.position.set(px, py, 0);
    frond.rotation.y = (i / 7) * Math.PI * 2 + rand(-0.2, 0.2);
    part(S.ball, i % 2 ? leaf : leafDark, { at: [0.3, 0.04, 0], size: [0.34, 0.035, 0.1], turn: [0, 0, -0.3], into: frond });
    part(S.ball, i % 2 ? leafDark : leaf, { at: [0.66, -0.16, 0], size: [0.24, 0.03, 0.08], turn: [0, 0, -0.85], into: frond });
    g.add(frond);
  }
  for (const [dx, dz] of [[0.07, 0.05], [-0.06, 0.06], [0.01, -0.08]]) part(S.ball, paint(0x4a3220), { at: [px + dx, py - 0.07, dz], size: 0.06, into: g });
  g.position.set(x, 0.2, z);
  g.rotation.y = turn;
  into.add(g);
}

function buildIsland() {
  const S = shapes();
  const g = new THREE.Group();
  scene.add(g);
  const sand = paint(0xe9d28f, { rough: 0.95 });
  const sandPale = paint(0xf3e2ad, { rough: 0.95 });
  const wet = paint(0xcbb06f, { rough: 0.7 });
  const rock = paint(0x7d7b78, { rough: 0.9 });
  const rockDark = paint(0x62605e, { rough: 0.9 });
  const wood = paint(0x6b4526, { rough: 0.85 });
  const woodDark = paint(0x4a3220, { rough: 0.85 });
  const bone = paint(0xf1ead6, { rough: 0.7 });

  // Three layers of sand, like a contour model.
  slab(blob(5.15, 1.45, 0.055, 1.3), -0.08, 0.06, wet, g);
  slab(blob(4.85, 1.25, 0.06, 0.4), 0.06, 0.2, sand, g);
  const dune = slab(blob(2.7, 0.62, 0.1, 2.2), 0.2, 0.31, sandPale, g);
  dune.position.set(0.7, 0, -0.25);
  for (const [x, z, s] of [[-3.3, -0.3, 0.5], [-0.6, -0.7, 0.42], [1.9, 0.5, 0.36], [3.1, -0.5, 0.45]]) part(S.ball, paint(0x7fa651, { rough: 1 }), { at: [x, 0.2, z], size: [s, 0.1, s * 0.6], into: g }); // scrub

  palm(g, -3.6, -0.15, 1.9, 0.55, 0.4);
  palm(g, -3.0, 0.35, 1.5, 0.4, 2.6);
  palm(g, 1.3, -0.55, 2.1, 0.5, 3.6);
  palm(g, 4.0, 0.1, 1.6, 0.6, 5.3);

  // The ribs of a wrecked hull, half buried.
  const wreck = new THREE.Group();
  part(S.box, woodDark, { at: [0, 0.03, 0], size: [1.5, 0.07, 0.08], into: wreck });
  for (let i = 0; i < 6; i++) {
    const x = -0.62 + i * 0.25;
    const h = 0.34 + Math.sin((i / 5) * Math.PI) * 0.22;
    for (const side of [-1, 1]) {
      if (side > 0 && i > 3) continue; // some have fallen
      part(S.box, wood, { at: [x, h / 2, side * 0.2], size: [0.05, h, 0.05], turn: [side * 0.42, 0, 0], into: wreck });
    }
  }
  part(S.rod, woodDark, { at: [-0.9, 0.3, 0], size: [0.03, 0.7, 0.03], turn: [0, 0, 0.9], into: wreck }); // what is left of the bowsprit
  wreck.position.set(-1.5, 0.2, -0.45);
  wreck.rotation.set(0, 0.35, 0.07);
  g.add(wreck);

  // A chest, and the last person who found it.
  const chest = new THREE.Group();
  part(S.box, wood, { at: [0, 0.09, 0], size: [0.34, 0.18, 0.22], into: chest });
  part(S.box, woodDark, { at: [0, 0.23, -0.1], size: [0.36, 0.05, 0.22], turn: [-0.9, 0, 0], into: chest }); // the lid, thrown back
  part(S.box, paint(0xd9a441, { rough: 0.35 }), { at: [0, 0.09, 0.112], size: [0.06, 0.08, 0.01], into: chest });
  for (let i = 0; i < 7; i++) part(S.disc, paint(0xe9b949, { rough: 0.28, glow: 0.25 }), { at: [rand(-0.12, 0.12), 0.19 + rand(0, 0.03), rand(-0.06, 0.06)], size: [0.04, 0.012, 0.04], turn: [rand(-0.5, 0.5), 0, rand(-0.5, 0.5)], into: chest });
  chest.position.set(0.55, 0.31, -0.2);
  chest.rotation.y = -0.4;
  g.add(chest);
  const skeleton = new THREE.Group();
  part(S.ball, bone, { at: [0, 0.27, 0], size: [0.07, 0.075, 0.07], into: skeleton }); // skull
  part(S.rod, bone, { at: [0, 0.14, 0.01], size: [0.05, 0.16, 0.035], turn: [0.25, 0, 0], into: skeleton }); // ribs
  part(S.rod, bone, { at: [0.05, 0.03, 0.14], size: [0.014, 0.24, 0.014], turn: [1.45, 0, 0.15], into: skeleton });
  part(S.rod, bone, { at: [-0.05, 0.03, 0.14], size: [0.014, 0.24, 0.014], turn: [1.45, 0, -0.2], into: skeleton });
  part(S.rod, bone, { at: [0.11, 0.12, 0.03], size: [0.012, 0.18, 0.012], turn: [0.3, 0, -0.9], into: skeleton });
  skeleton.position.set(0.98, 0.31, -0.22);
  skeleton.rotation.y = -1.2;
  g.add(skeleton);

  // HELP, spelled out in pebbles on the beach facing the camera.
  const help = decal((c, s) => {
    c.clearRect(0, 0, s, s);
    c.font = `700 ${s * 0.36}px Georgia, serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.setLineDash([s * 0.012, s * 0.03]);
    c.lineCap = 'round';
    c.lineWidth = s * 0.026;
    c.strokeStyle = '#5d5a57';
    c.strokeText('HELP', s / 2, s / 2);
  }, 512);
  const sign = part(S.flat, new THREE.MeshStandardMaterial({ map: help, transparent: true, roughness: 1 }), { at: [2.35, 0.207, 0.62], size: [1.9, 1, 1.9], turn: [0, 0.06, 0], shadow: false, into: g });
  sign.receiveShadow = true;

  // A lean-to made of driftwood and palm leaves.
  const hut = new THREE.Group();
  const thatch = paint(0x8f8a45, { rough: 1, side: THREE.DoubleSide });
  part(S.box, thatch, { at: [0, 0.2, 0.13], size: [0.6, 0.02, 0.5], turn: [0.95, 0, 0], into: hut });
  part(S.box, paint(0x7c7a3c, { rough: 1, side: THREE.DoubleSide }), { at: [0, 0.2, -0.13], size: [0.6, 0.02, 0.5], turn: [-0.95, 0, 0], into: hut });
  part(S.rod, wood, { at: [0, 0.4, 0], size: [0.02, 0.7, 0.02], turn: [0, 0, Math.PI / 2], into: hut });
  hut.position.set(2.75, 0.31, -0.35);
  hut.rotation.y = 0.5;
  g.add(hut);

  // The signal fire, at the eastern end where a passing ship might see it.
  const pit = new THREE.Group();
  for (let i = 0; i < 5; i++) part(S.rod, woodDark, { at: [0, 0.05, 0], size: [0.025, 0.34, 0.025], turn: [Math.PI / 2, (i / 5) * Math.PI, 0.25], into: pit });
  for (let i = 0; i < 7; i++) part(S.rock, i % 2 ? rock : rockDark, { at: [Math.cos(i * 0.9) * 0.2, 0.02, Math.sin(i * 0.9) * 0.2], size: 0.05, into: pit });
  const flames = [0xffd45a, 0xff8a2a, 0xff5a1f].map((colour, i) => part(S.cone, paint(colour, { glow: 2.2 }), { at: [[0, 0.05, -0.04][i], 0.2, [0, 0.04, -0.03][i]], size: [0.09 - i * 0.02, 0.3, 0.09 - i * 0.02], shadow: false, into: pit }));
  const lamp = new THREE.PointLight(0xff8a3c, 6, 5, 1.6);
  lamp.position.set(0, 0.5, 0);
  pit.add(lamp);
  pit.position.set(3.75, 0.2, 0.45);
  g.add(pit);
  fire = { flames, lamp, at: new THREE.Vector3(3.75, 0.5, 0.45) };

  // The castaway. He watches whoever is winning.
  castaway = new THREE.Group();
  part(S.rod, paint(0x8b6a3d), { at: [0, 0.07, 0], size: [0.05, 0.14, 0.05], into: castaway }); // ragged trousers
  part(S.rod, paint(0xe8dcc0), { at: [0, 0.19, 0], size: [0.055, 0.12, 0.055], into: castaway }); // what was a shirt
  part(S.ball, paint(0xd9a074), { at: [0, 0.31, 0], size: 0.055, into: castaway });
  part(S.ball, paint(0x6b4a2a), { at: [0, 0.27, 0.035], size: [0.045, 0.05, 0.03], into: castaway }); // beard
  for (const side of [-1, 1]) part(S.rod, paint(0xd9a074), { at: [side * 0.08, 0.27, 0], size: [0.014, 0.16, 0.014], turn: [0, 0, side * -2.4], into: castaway }); // arms up
  castaway.position.set(-0.55, 0.2, 0.75);
  g.add(castaway);

  // Rocks at the western turn, with a ring of foam where the sea breaks on them.
  for (const [x, z, s, y] of [[-6.5, 0.1, 0.5, 0.2], [-6.05, -0.35, 0.34, 0.12], [-6.2, 0.5, 0.26, 0.1], [-6.85, -0.3, 0.22, 0.06], [-5.75, 0.2, 0.18, 0.05]]) {
    part(S.rock, Math.random() < 0.5 ? rock : rockDark, { at: [x, y, z], size: [s, s * 0.85, s * 0.9], turn: [rand(0, 3), rand(0, 3), 0], into: g });
    part(S.ring, paint(0xf2fbff, { rough: 0.5 }), { at: [x, 0.03, z], size: [s * 1.25, 0.6, s * 1.2], shadow: false, into: g });
  }

  // A stubby lighthouse on its own rock at the eastern turn.
  const tower = new THREE.Group();
  part(S.rock, rockDark, { at: [0, 0.05, 0], size: [0.6, 0.28, 0.55], into: tower });
  part(S.ring, paint(0xf2fbff, { rough: 0.5 }), { at: [0, 0.03, 0], size: [0.72, 0.6, 0.66], shadow: false, into: tower });
  const white = paint(0xf4efe2);
  const red = paint(0xc8372d);
  for (let i = 0; i < 4; i++) part(new THREE.CylinderGeometry(0.2 - i * 0.022, 0.222 - i * 0.022, 0.3, 10), i % 2 ? red : white, { at: [0, 0.4 + i * 0.3, 0], into: tower });
  part(S.disc, paint(0x2b2d33), { at: [0, 1.57, 0], size: [0.2, 0.04, 0.2], into: tower });
  const glass = part(S.rod, paint(0xffe9a3, { glow: 0.5 }), { at: [0, 1.69, 0], size: [0.11, 0.2, 0.11], shadow: false, into: tower });
  part(S.cone, red, { at: [0, 1.88, 0], size: [0.17, 0.18, 0.17], into: tower });
  const lampLight = new THREE.PointLight(0xffe2a0, 0, 9, 1.5);
  lampLight.position.set(0, 1.7, 0);
  tower.add(lampLight);
  // The beam: a long pale wedge that sweeps round when the lamp is lit.
  const beam = new THREE.Group();
  const wedge = part(new THREE.ConeGeometry(0.9, 7, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), { at: [3.5, 0, 0], turn: [0, 0, Math.PI / 2], shadow: false, into: beam });
  beam.position.set(0, 1.69, 0);
  beam.rotation.z = -0.1;
  tower.add(beam);
  tower.position.set(6.55, 0, 0);
  g.add(tower);
  lighthouse = { lamp: lampLight, glass, beam, wedge };
}

/** The start and finish: a line of bunting from a post on the beach to a buoy out in the tray. */
function buildLine() {
  const S = shapes();
  const g = new THREE.Group();
  scene.add(g);
  const pole = paint(0x4a3524);
  const [px, pz] = FINISH.post;
  const [bx, bz] = FINISH.buoy;
  const top = 2.05;
  part(S.rod, pole, { at: [px, top / 2, pz], size: [0.035, top, 0.035], into: g });
  part(S.rod, paint(0xc8372d), { at: [bx, 0.07, bz], size: [0.2, 0.16, 0.2], into: g }); // the buoy
  part(S.rod, paint(0xf4efe2), { at: [bx, 0.18, bz], size: [0.15, 0.07, 0.15], into: g });
  part(S.rod, pole, { at: [bx, top / 2 + 0.1, bz], size: [0.03, top - 0.2, 0.03], into: g });
  const colours = [0xc8372d, 0xf7c948, 0x3f74c4, 0x46a85f, 0xf4efe2];
  const flags = 13;
  for (let i = 0; i <= flags; i++) {
    const k = i / flags;
    const z = pz + (bz - pz) * k;
    const y = top - Math.sin(k * Math.PI) * 0.3;
    if (i < flags) {
      const k2 = (i + 1) / flags;
      const y2 = top - Math.sin(k2 * Math.PI) * 0.3;
      const len = Math.hypot((bz - pz) / flags, y2 - y);
      part(S.rod, paint(0x2b1b0f), { at: [px, (y + y2) / 2, z + (bz - pz) / flags / 2], size: [0.008, len, 0.008], turn: [Math.atan2((bz - pz) / flags, y2 - y), 0, 0], shadow: false, into: g }); // the string
    }
    if (i === 0 || i === flags) continue;
    const pennant = new THREE.BufferGeometry();
    pennant.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.085, 0, 0, 0.085, 0, -0.2, 0], 3));
    pennant.computeVertexNormals();
    part(pennant, paint(colours[i % colours.length], { side: THREE.DoubleSide }), { at: [px, y, z], into: g });
  }
}

// ----- fitting the picture into the window -----

function fit() {
  if (!layer) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const unit = Math.min(w / 1920, h / 1080); // one "TV pixel", the same scale host.js uses for its stage
  layer.style.setProperty('--u', unit);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  // The words sit in a 16:9 box in the middle of the window. Keep the tray inside that box,
  // below the title and above the row of cards.
  const fx = (1920 * unit) / w;
  const fy = (1080 * unit) / h;
  const top = fy * (1 - (2 * 168) / 1080);
  const bottom = -fy * (1 - (2 * 226) / 1080);
  const sideLimit = fx * 0.97;
  const corners = [];
  for (const x of [-1, 1]) for (const z of [-1, 1]) for (const y of [-0.4, 1.6]) corners.push(new THREE.Vector3(x * (TRAY.w / 2 + 0.6), y, z * (TRAY.d / 2 + 0.6)));
  const v = new THREE.Vector3();
  cam.dist = 30;
  cam.target.set(0, 0, 0.2);
  for (let i = 0; i < 40; i++) {
    aimCamera();
    let lo = Infinity;
    let hi = -Infinity;
    let wide = 0;
    for (const c of corners) {
      v.copy(c).project(camera);
      lo = Math.min(lo, v.y);
      hi = Math.max(hi, v.y);
      wide = Math.max(wide, Math.abs(v.x));
    }
    const grow = Math.max(wide / sideLimit, (hi - lo) / (top - bottom));
    cam.dist *= 1 + (grow - 1) * 0.8;
    cam.target.z -= (((hi + lo) / 2 - (top + bottom) / 2) * cam.dist) / 5.5;
  }
  aimCamera();
}

function aimCamera(jx = 0, jy = 0) {
  const { target, dist, elevation } = cam;
  camera.position.set(target.x + jx, target.y + Math.sin(elevation) * dist + jy, target.z + Math.cos(elevation) * dist);
  camera.lookAt(target.x + jx * 0.6, target.y, target.z);
  camera.updateMatrixWorld();
}

/** Where a point on the table appears in the window, in CSS pixels. */
function onScreen(point) {
  const v = point.clone().project(camera);
  return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
}

// ---------------------------------------------------------------------------
// The light: morning, late afternoon, and a storm at night
// ---------------------------------------------------------------------------

const LIGHTS = {
  morning: { sky: 1.25, skyColour: 0xfff1d8, sun: 2.6, sunColour: 0xffe9c4, sunAt: [-9, 17, 9], back: 0x2a1c12, swell: 1, lamps: 0 },
  evening: { sky: 0.78, skyColour: 0xffc9a0, sun: 2.3, sunColour: 0xff9a55, sunAt: [-18, 8, 5], back: 0x21130a, swell: 1.25, lamps: 1 },
  storm: { sky: 0.4, skyColour: 0x8ea3c9, sun: 0.85, sunColour: 0xa8bde8, sunAt: [-6, 16, 10], back: 0x0b0d12, swell: 2.4, lamps: 1 },
};
const lit = { name: 'morning', sky: 1.25, skyColour: new THREE.Color(0xfff1d8), sun: 2.6, sunColour: new THREE.Color(0xffe9c4), sunAt: new THREE.Vector3(-9, 17, 9), back: new THREE.Color(0x2a1c12), swell: 1, lamps: 0 };
const scratch = new THREE.Color();

function relight(dt) {
  const want = LIGHTS[lit.name] ?? LIGHTS.morning;
  const k = Math.min(1, dt * 0.9);
  for (const key of ['sky', 'sun', 'swell', 'lamps']) lit[key] += (want[key] - lit[key]) * k;
  lit.skyColour.lerp(scratch.set(want.skyColour), k);
  lit.sunColour.lerp(scratch.set(want.sunColour), k);
  lit.back.lerp(scratch.set(want.back), k);
  lit.sunAt.lerp(new THREE.Vector3(...want.sunAt), k);

  // Lightning, in the storm.
  bolt *= Math.max(0, 1 - dt * 7);
  if (lit.name === 'storm' && !current?.paused) {
    nextBolt -= dt;
    if (nextBolt <= 0) {
      nextBolt = rand(5, 12);
      bolt = 5;
      tween(0.1, () => {}, { delay: 0.16, done: () => (bolt = Math.max(bolt, 3)) });
      sound.play('bbThunder', { level: 0.5, ambience: true });
    }
  }

  sky.intensity = lit.sky + bolt * 0.25;
  sky.color.copy(lit.skyColour);
  sun.intensity = lit.sun + bolt;
  sun.color.copy(lit.sunColour);
  sun.position.copy(lit.sunAt);
  scene.background.copy(lit.back);

  const flicker = 0.85 + 0.15 * Math.sin(time * 13) * Math.sin(time * 7.3);
  candle.lamp.intensity = 70 * flicker * lit.lamps;
  candle.flame.visible = lit.lamps > 0.3;
  candle.flame.scale.y = 0.6 * flicker;
  lighthouse.lamp.intensity = 14 * lit.lamps;
  lighthouse.glass.material = paint(0xffe9a3, { glow: lit.lamps > 0.5 ? 2.4 : 0.5 });
  lighthouse.wedge.material.opacity = 0.13 * lit.lamps;
  lighthouse.beam.rotation.y = time * 0.9;
  fire.flames.forEach((flame, i) => {
    const f = 0.8 + 0.3 * Math.sin(time * (11 + i * 3) + i);
    flame.scale.y = [0.34, 0.24, 0.2][i] * f;
    flame.position.y = 0.05 + flame.scale.y / 2;
  });
  fire.lamp.intensity = (4 + lit.lamps * 9) * flicker;
}

// ---------------------------------------------------------------------------
// Models: a ship for each crew, a rowing boat for each pirate in the Scramble
// ---------------------------------------------------------------------------

function peg(into, x, y, z, colour, scale = 1) {
  const S = shapes();
  part(S.rod, paint(hex(colour)), { at: [x, y + 0.065 * scale, z], size: [0.045 * scale, 0.13 * scale, 0.045 * scale], into });
  part(S.ball, paint(0xe2b48c), { at: [x, y + 0.165 * scale, z], size: 0.042 * scale, into });
}

const HULL = [[-0.98, 0], [-0.66, -0.15], [-0.25, -0.215], [0.52, -0.215], [0.7, -0.15], [0.7, 0.15], [0.52, 0.215], [-0.25, 0.215], [-0.66, 0.15]];
const shrunk = (points, k) => points.map(([x, z]) => [x * k, z * k]);

/** A two-masted ship in one of the six paint schemes, bow towards -x, with its crew on deck. */
function makeShip(scheme, crew) {
  const S = shapes();
  const hull = paint(hex(scheme.hull));
  const trim = paint(hex(scheme.trim), { rough: 0.5 });
  const deck = paint(0xb08a5a);
  const spar = paint(0x4a3524);
  const cloth = paint(hex(scheme.sail), { side: THREE.DoubleSide, rough: 0.9 });
  const g = new THREE.Group();
  const sails = [];

  slab(HULL, -0.06, 0.17, hull, g);
  slab(shrunk(HULL, 1.035), 0.17, 0.215, trim, g);
  slab(shrunk(HULL, 0.86), 0.215, 0.235, deck, g);
  for (const z of [-1, 1]) for (const x of [-0.42, -0.14, 0.14, 0.42]) part(S.box, paint(0x14100c), { at: [x, 0.09, z * 0.218], size: [0.08, 0.055, 0.02], shadow: false, into: g }); // gun ports

  const mast = (x, height, yards) => {
    part(S.rod, spar, { at: [x, 0.235 + height / 2, 0], size: [0.026, height, 0.026], into: g });
    part(S.rod, spar, { at: [x, 0.235 + height + 0.02, 0], size: [0.05, 0.04, 0.05], into: g }); // the crow's nest
    for (const [y, span, drop] of yards) {
      // The yard is braced round (turned on the mast), so the sail shows from above whichever way the ship lies.
      const yard = new THREE.Group();
      yard.position.set(x, y, 0);
      yard.rotation.y = 0.62;
      g.add(yard);
      part(S.rod, spar, { size: [0.016, span, 0.016], turn: [Math.PI / 2, 0, 0], into: yard });
      // A square sail, bellied out towards the bow by the wind and raked so the cloth shows from above.
      const sheet = new THREE.PlaneGeometry(span * 0.94, drop, 6, 3).rotateY(Math.PI / 2);
      const p = sheet.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const across = p.getZ(i) / (span * 0.47);
        const down = 0.5 - p.getY(i) / drop;
        p.setX(i, -0.15 * (1 - across * across) * Math.sin(Math.PI * Math.min(1, down * 0.8 + 0.2)) - 0.3 * down);
      }
      sheet.computeVertexNormals();
      sails.push(part(sheet, cloth, { at: [-0.015, -drop / 2 - 0.01, 0], into: yard }));
    }
  };
  mast(-0.24, 0.95, [[0.74, 0.74, 0.4], [1.06, 0.54, 0.28]]);
  mast(0.28, 0.8, [[0.7, 0.66, 0.37], [0.96, 0.46, 0.22]]);

  part(S.rod, spar, { at: [-0.86, 0.3, 0], size: [0.02, 0.44, 0.02], turn: [0, 0, 1.25], into: g }); // the bowsprit
  const jib = new THREE.BufferGeometry();
  jib.setAttribute('position', new THREE.Float32BufferAttribute([-1.04, 0.37, 0, -0.27, 0.3, 0.02, -0.26, 0.86, 0], 3));
  jib.computeVertexNormals();
  part(jib, cloth, { into: g });

  part(S.box, hull, { at: [0.5, 0.27, 0], size: [0.36, 0.11, 0.37], into: g }); // the quarterdeck
  part(S.box, trim, { at: [0.5, 0.335, 0], size: [0.38, 0.02, 0.39], into: g });
  part(S.box, paint(0xffd97a, { glow: 0.9 }), { at: [0.705, 0.2, 0], size: [0.02, 0.07, 0.2], shadow: false, into: g }); // the lit windows of the great cabin
  part(S.rod, spar, { at: [0.66, 0.52, 0], size: [0.012, 0.38, 0.012], into: g });
  part(S.box, cloth, { at: [0.75, 0.63, 0], size: [0.17, 0.11, 0.008], into: g });

  // A long gold pennant at the masthead, flown while somebody aboard is on a roll.
  const pennant = part(S.box, paint(0xffd23f, { glow: 1.6, side: THREE.DoubleSide }), { at: [0.04, 0.235 + 0.95 + 0.11, 0], size: [0.56, 0.06, 0.008], shadow: false, into: g });
  pennant.visible = false;

  const berths = [[-0.56, 0.235, 0], [0.02, 0.235, 0.07], [0.5, 0.345, 0]];
  crew.forEach((id, i) => {
    const [x, y, z] = berths[i % berths.length];
    peg(g, x, y, z, players.get(id)?.color ?? '#f4e6c1');
  });

  // Toy proportions: a bit beamier and taller than a real ship, so it reads from across the room.
  g.scale.set(0.94, 1.14, 1.24);
  return { model: g, sails, pennant, oars: [], height: 1.55 };
}

const ROWBOAT = [[-0.37, 0], [-0.2, -0.115], [0.22, -0.125], [0.33, -0.08], [0.33, 0.08], [0.22, 0.125], [-0.2, 0.115]];

/** A rowing boat in its rower's own colour. */
function makeRowboat(crew) {
  const S = shapes();
  const colour = players.get(crew[0])?.color ?? '#c8372d';
  const g = new THREE.Group();
  slab(ROWBOAT, -0.03, 0.09, paint(hex(colour)), g);
  slab(shrunk(ROWBOAT, 0.8), 0.06, 0.094, paint(0x5b3d25), g);
  part(S.box, paint(0x8a5a2e), { at: [0.05, 0.11, 0], size: [0.06, 0.02, 0.2], into: g }); // the thwart
  peg(g, 0.05, 0.11, 0, '#f4e6c1', 0.95);
  const oars = [-1, 1].map((side) => {
    const oar = new THREE.Group();
    oar.position.set(-0.02, 0.13, side * 0.12);
    part(S.rod, paint(0x8a5a2e), { at: [0, 0, side * 0.2], size: [0.011, 0.46, 0.011], turn: [Math.PI / 2, 0, 0], into: oar });
    part(S.box, paint(hex(colour)), { at: [0, -0.01, side * 0.44], size: [0.035, 0.012, 0.11], into: oar });
    oar.userData.side = side;
    g.add(oar);
    return oar;
  });
  g.scale.setScalar(1.6);
  return { model: g, sails: [], pennant: null, oars, height: 0.85 };
}

function clearFleet() {
  for (const b of fleet) {
    scene.remove(b.group);
    b.tag.remove();
    b.card.remove();
  }
  for (const ball of balls) scene.remove(ball.mesh);
  balls.clear();
  fleet = [];
  fleetById.clear();
  race.order = '';
}

/** Put a fresh set of ships (or rowing boats) on the water. */
function setFleet(key, kind, ships) {
  clearFleet();
  race.key = key;
  race.kind = kind;
  const boats = kind === 'scramble';
  const spacing = boats ? Math.min(0.32, 2.5 / ships.length) : 0.46;
  ships.forEach((s, i) => {
    const scheme = PAINTS[s.paint % PAINTS.length];
    const made = boats ? makeRowboat(s.crew) : makeShip(scheme, s.crew);
    const group = new THREE.Group();
    const body = new THREE.Group();
    body.add(made.model);
    group.add(body);
    scene.add(group);

    const tag = document.createElement('div');
    tag.className = `kn-tag ${boats ? 'boat' : ''}`;
    const crewChips = s.crew.map((id) => chipHtml(id, false)).join('');
    tag.innerHTML = boats ? chipHtml(s.crew[0], true) : `<b></b><span>${esc(s.name)}</span>`;
    tag.style.setProperty('--sail', scheme.sail);
    ui.tags.append(tag);

    const card = document.createElement('div');
    card.className = `kn-shipcard ${boats ? 'boat' : ''}`;
    card.style.setProperty('--sail', boats ? (players.get(s.crew[0])?.color ?? scheme.sail) : scheme.sail);
    card.innerHTML = `<b class="kn-pl"></b><span class="kn-nm">${esc(s.name)}</span><span class="kn-who">${crewChips}<i class="kn-odds"></i></span><span class="kn-bar"><i></i></span><em class="kn-st"></em>`;
    ui.cards.append(card);

    const b = { id: s.id, name: s.name, crew: s.crew, boats, group, body, ...made, lane: (i - (ships.length - 1) / 2) * spacing, sim: { pos: s.pos ?? 0, wind: 0, holedUntil: -1, done: null }, slip: 0, fresh: true, tag, card, rank: -1, place: null, roll: false, right: s.right ?? 0, seed: rand(0, 6), wake: 0, smoke: 0, gust: 0, kick: 0, stroke: rand(0, 6), streak: 0, heel: 0 };
    fleet.push(b);
    fleetById.set(b.id, b);
  });
  layoutCards();
}

function chipHtml(id, label) {
  const p = players.get(id);
  if (!p) return '';
  return `<span class="chip" style="--c:${esc(p.color)}"><span class="face"><span>${esc(p.avatar)}</span></span>${label ? `<span class="nm">${esc(p.name)}</span>` : ''}</span>`;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** A puff of cotton wool that swells and fades away by shrinking. */
function puff(at, { colour = 0xd9d4cc, size = 0.3, rise = 0.8, life = 1.1, drift = null, glow = 0 } = {}) {
  const m = part(shapes().ball, paint(colour, { glow, rough: 1 }), { at: at.toArray(), size: 0.01, shadow: false, into: scene });
  const d = drift ?? new THREE.Vector3(rand(-0.25, 0.25), rise, rand(-0.25, 0.25));
  const start = at.clone();
  tween(life, (k, raw) => {
    m.position.copy(start).addScaledVector(d, raw);
    m.scale.setScalar(Math.max(0.001, size * Math.sin(Math.min(1, raw * 1.15) * Math.PI) ** 0.6 * (0.6 + raw * 0.8)));
  }, { ease: linear, done: () => scene.remove(m) });
}

function flash(at, colour, seconds, strength = 30) {
  const lamp = new THREE.PointLight(colour, strength, 7, 1.6);
  lamp.position.copy(at).setY(at.y + 0.5);
  scene.add(lamp);
  tween(seconds, (k) => (lamp.intensity = strength * (1 - k)), { done: () => scene.remove(lamp) });
}

/** Something thrown: it flies up and out, comes down, and is gone. */
function fling(mesh, from, velocity, life, spin = 0) {
  mesh.position.copy(from);
  scene.add(mesh);
  const size = mesh.scale.clone();
  tween(life, (k, raw) => {
    const t = raw * life;
    mesh.position.set(from.x + velocity.x * t, from.y + velocity.y * t - 4.9 * t * t, from.z + velocity.z * t);
    mesh.rotation.x += spin;
    mesh.rotation.z += spin * 0.7;
    if (raw > 0.8) mesh.scale.copy(size).multiplyScalar((1 - raw) / 0.2);
  }, { ease: linear, done: () => scene.remove(mesh) });
}

function splash(at, size = 1) {
  const white = paint(0xf2fbff, { rough: 0.4 });
  const column = part(shapes().cone, white, { at: [at.x, 0, at.z], size: [0.22 * size, 0.01, 0.22 * size], shadow: false, into: scene });
  tween(0.75, (k, raw) => {
    const h = Math.sin(raw * Math.PI) * 1.5 * size;
    column.scale.set(0.22 * size * (1 + raw), Math.max(0.01, h), 0.22 * size * (1 + raw));
    column.position.y = h / 2;
  }, { ease: linear, done: () => scene.remove(column) });
  const ring = part(shapes().ring, white, { at: [at.x, 0.08, at.z], size: 0.05, shadow: false, into: scene });
  tween(1.1, (k, raw) => ring.scale.set(0.15 + k * 0.75 * size, Math.max(0.01, 1 - raw), 0.15 + k * 0.75 * size), { done: () => scene.remove(ring) });
  for (let i = 0; i < Math.round(9 * size); i++) {
    const a = Math.random() * Math.PI * 2;
    const drop = part(shapes().ball, white, { size: rand(0.04, 0.09) * size, shadow: false });
    fling(drop, new THREE.Vector3(at.x, 0.1, at.z), new THREE.Vector3(Math.cos(a) * rand(0.5, 1.6), rand(2.5, 4.6) * Math.sqrt(size), Math.sin(a) * rand(0.5, 1.6)), rand(0.7, 1.0));
  }
}

function explosion(at, size = 1) {
  const flare = part(shapes().ball, paint(0xffd45a, { glow: 3 }), { at: [at.x, 0.4, at.z], size: 0.01, shadow: false, into: scene });
  tween(0.42, (k, raw) => flare.scale.setScalar(Math.max(0.001, Math.sin(raw * Math.PI) * 0.75 * size)), { ease: linear, done: () => scene.remove(flare) });
  const burst = part(shapes().ball, paint(0xff6a1f, { glow: 1.8 }), { at: [at.x, 0.45, at.z], size: 0.01, shadow: false, into: scene });
  tween(0.6, (k, raw) => burst.scale.setScalar(Math.max(0.001, Math.sin(raw * Math.PI) ** 0.7 * 0.55 * size * (1 + raw))), { ease: linear, done: () => scene.remove(burst) });
  for (let i = 0; i < 6; i++) puff(new THREE.Vector3(at.x + rand(-0.2, 0.2), 0.4, at.z + rand(-0.2, 0.2)), { colour: pick([0x3c3835, 0x57514b, 0x2b2826]), size: rand(0.25, 0.5) * size, rise: rand(1.2, 2.2), life: rand(1.1, 1.9) });
  for (let i = 0; i < Math.round(11 * size); i++) {
    const a = Math.random() * Math.PI * 2;
    const plank = part(shapes().box, paint(0x6b4526), { size: [rand(0.12, 0.3), 0.03, 0.06] });
    fling(plank, new THREE.Vector3(at.x, 0.3, at.z), new THREE.Vector3(Math.cos(a) * rand(0.6, 2.4), rand(2.4, 5), Math.sin(a) * rand(0.6, 2.4)), rand(0.8, 1.2), rand(0.1, 0.35));
  }
  flash(at, 0xffb347, 0.5, 40);
  shake = Math.max(shake, 0.2 * size);
}

function firework(at) {
  const colour = pick([0xf7c948, 0xe4572e, 0x17bebb, 0xf78fb3, 0x9bc53d, 0xffffff]);
  for (let i = 0; i < 26; i++) {
    const spark = part(shapes().ball, paint(colour, { glow: 2.2 }), { size: rand(0.05, 0.09), shadow: false });
    const dir = new THREE.Vector3(rand(-1, 1), rand(-0.4, 1), rand(-1, 1)).normalize().multiplyScalar(rand(1.6, 3.2));
    fling(spark, at, dir.add(new THREE.Vector3(0, 2.2, 0)), rand(1.0, 1.5));
  }
  flash(at, colour, 0.6, 18);
}

/** A line of text that pops up over a spot on the table and floats away. */
function callout(point, html, tone = '') {
  const el = document.createElement('div');
  el.className = `kn-callout ${tone}`;
  el.innerHTML = html;
  const { x, y } = onScreen(point);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  ui.callouts.append(el);
  setTimeout(() => el.remove(), 2600);
}

function banner(text, sub, tone, seconds) {
  ui.banner.className = `kn-banner ${tone ?? ''}`;
  ui.banner.querySelector('b').textContent = text;
  ui.banner.querySelector('span').textContent = sub ?? '';
  ui.banner.hidden = false;
  ui.banner.style.animation = 'none';
  void ui.banner.offsetWidth; // start the entrance animation again
  ui.banner.style.animation = '';
  clearTimeout(banner.timer);
  banner.timer = setTimeout(() => (ui.banner.hidden = true), seconds * 1000);
}

/** The smaller line under the title: "The Wet Sock takes the lead!" */
function ticker(html) {
  ui.ticker.innerHTML = html;
  ui.ticker.hidden = false;
  ui.ticker.style.animation = 'none';
  void ui.ticker.offsetWidth;
  ui.ticker.style.animation = '';
  clearTimeout(ticker.timer);
  ticker.timer = setTimeout(() => (ui.ticker.hidden = true), 2600);
}

const above = (b, up = 0.9) => b.group.position.clone().setY(up);

// ---------------------------------------------------------------------------
// The ruckus: bets, fists and daggers
// ---------------------------------------------------------------------------

// Where things thrown onto the table can land: the strips of table that show round the tray.
const LANDING = [
  { x: [-10.8, -3.8], z: [-9.0, -6.7], weight: 3 },
  { x: [3.8, 10.8], z: [-9.0, -6.7], weight: 3 },
  { x: [-13.4, -11.8], z: [-5.2, 5.6], weight: 3 },
  { x: [11.8, 13.4], z: [-5.2, 5.6], weight: 3 },
  { x: [-11, 11], z: [6.5, 7.5], weight: 1 },
];
// Where a dagger can be stuck in: [x, z].
const STABS = [[-12.5, -3.4], [12.6, 2.9], [-9.2, -7.9], [9.6, -7.6], [-12.7, 4.6], [12.4, -5.4], [-4.6, -8.2], [4.4, -8.0]];

function landing() {
  for (let tries = 0; tries < 12; tries++) {
    let roll = Math.random() * LANDING.reduce((n, zone) => n + zone.weight, 0);
    const zone = LANDING.find((z) => (roll -= z.weight) < 0) ?? LANDING[0];
    const x = rand(...zone.x);
    const z = rand(...zone.z);
    // Not on top of the ale, a fist or a dagger.
    const blocked = [...mugs, ...arms, ...daggers].some((thing) => Math.hypot(thing.position.x - x, thing.position.z - z) < 1.9);
    if (!blocked) return { x, z };
  }
  return { x: rand(-10, 10), z: rand(6.6, 7.4) };
}

/** A bet: one doubloon flung in from somewhere off in the dark. It bounces, spins and stays where it lands. */
function tossCoin(delay = 0) {
  const S = shapes();
  const at = landing();
  const pile = coins.filter((c) => Math.hypot(c.position.x - at.x, c.position.z - at.z) < 0.5).length;
  const y = ground(at.x, at.z) + 0.05 + Math.min(4, pile) * 0.09;
  const coin = part(S.disc, paint(Math.random() < 0.3 ? 0xc8962f : 0xe9b949, { rough: 0.28 }), { size: [0.44, 0.085, 0.44], into: scene });
  coin.visible = false;
  // It comes from beyond the nearest edge of the table.
  const out = Math.abs(at.x) / 13 > Math.abs(at.z) / 8 ? new THREE.Vector3(Math.sign(at.x) * rand(5, 9), 0, rand(-3, 3)) : new THREE.Vector3(rand(-4, 4), 0, Math.sign(at.z) * rand(5, 8));
  const from = new THREE.Vector3(at.x, y + rand(4, 7), at.z).add(out);
  const spin = rand(9, 16);
  const yaw = rand(0, 6);
  coins.push(coin);
  tween(rand(0.5, 0.7), (k, raw) => {
    coin.visible = true;
    coin.position.set(from.x + (at.x - from.x) * raw, from.y + (y - from.y) * raw * raw + Math.sin(raw * Math.PI) * 1.4, from.z + (at.z - from.z) * raw);
    coin.rotation.set(raw * spin, yaw, raw * spin * 0.6);
  }, {
    delay,
    ease: linear,
    done: () => {
      sound.play('knClink', { level: rand(0.35, 0.7) });
      // One skip, and it settles flat.
      const dx = rand(-0.3, 0.3);
      const dz = rand(-0.3, 0.3);
      tween(0.26, (k, raw) => {
        coin.position.set(at.x + dx * raw, y + Math.sin(raw * Math.PI) * 0.3, at.z + dz * raw);
        coin.rotation.set((1 - raw) * 1.2, yaw + raw * 2, (1 - raw) * 0.8);
      }, { ease: linear });
    },
  });
  // The table only holds so much: the oldest bets get swept off.
  while (coins.length > 100) {
    const old = coins.shift();
    tween(0.3, (k) => old.scale.setScalar(0.44 * (1 - k) + 0.001), { done: () => scene.remove(old) });
  }
}

/** Somebody makes their point by sticking a dagger in the table. */
function stab(delay = 0) {
  if (daggers.length >= STABS.length) return;
  const S = shapes();
  const [sx, sz] = STABS.filter(([x, z]) => !daggers.some((d) => Math.hypot(d.position.x - x, d.position.z - z) < 1.5))[0] ?? STABS[0];
  const x = sx + rand(-0.4, 0.4);
  const z = sz + rand(-0.3, 0.3);
  const g = new THREE.Group();
  const steel = paint(0xcfd6dc, { rough: 0.18 });
  const brass = paint(0xd9a441, { rough: 0.3 });
  // Built point-down: the tip is at the group's origin.
  part(new THREE.ConeGeometry(0.34, 3.4, 4).rotateX(Math.PI), steel, { at: [0, 1.7, 0], size: [1, 1, 0.24], into: g });
  part(S.box, brass, { at: [0, 3.45, 0], size: [1.3, 0.22, 0.26], into: g }); // the guard
  for (const side of [-1, 1]) part(S.ball, brass, { at: [side * 0.68, 3.45, 0], size: 0.17, into: g });
  part(S.rod, paint(0x3a2416, { rough: 0.9 }), { at: [0, 4.3, 0], size: [0.18, 1.6, 0.18], into: g }); // the grip
  for (const y of [3.85, 4.3, 4.75]) part(S.rod, brass, { at: [0, y, 0], size: [0.195, 0.06, 0.195], shadow: false, into: g });
  part(S.ball, brass, { at: [0, 5.25, 0], size: 0.27, into: g }); // the pommel
  const y = ground(x, z) - 0.55; // the point is well into the wood
  const lean = { x: rand(-0.22, 0.22), z: rand(-0.22, 0.22) };
  g.rotation.set(lean.x, rand(0, 3), lean.z);
  g.position.set(x, y + 12, z);
  g.visible = false;
  scene.add(g);
  daggers.push(g);
  tween(0.14, (k, raw) => {
    g.visible = true;
    g.position.y = y + 12 * (1 - raw * raw);
  }, {
    delay,
    ease: linear,
    done: () => {
      g.position.y = y;
      sound.play('knThunk');
      shake = Math.max(shake, 0.16);
      for (let i = 0; i < 5; i++) {
        const chip = part(S.box, paint(0x8a5a2e), { size: [rand(0.08, 0.2), 0.03, 0.05] });
        const a = Math.random() * Math.PI * 2;
        fling(chip, new THREE.Vector3(x, ground(x, z) + 0.1, z), new THREE.Vector3(Math.cos(a) * rand(0.6, 1.6), rand(1.5, 3), Math.sin(a) * rand(0.6, 1.6)), rand(0.5, 0.8), 0.3);
      }
      jolt(x, z, 0.5);
      // It quivers.
      tween(1.1, (k, raw) => {
        const wobble = Math.sin(raw * 42) * 0.13 * (1 - raw) ** 2;
        g.rotation.x = lean.x + wobble;
        g.rotation.z = lean.z + wobble * 0.6;
      }, { ease: linear });
    },
  });
}

/** A thump on the table at (x, z): everything loose nearby jumps. */
function jolt(x, z, strength = 1) {
  for (const mug of mugs) {
    const near = clamp(1.4 - Math.hypot(mug.position.x - x, mug.position.z - z) / 14, 0.25, 1) * strength;
    tween(0.3, (k, raw) => (mug.position.y = mug.userData.rest + Math.sin(raw * Math.PI) * 0.4 * near), { ease: linear });
  }
  for (const coin of coins) {
    const d = Math.hypot(coin.position.x - x, coin.position.z - z);
    if (d > 6 || !coin.visible) continue;
    const base = coin.position.y;
    const hop = (0.5 - d / 14) * strength * rand(0.5, 1);
    tween(0.24, (k, raw) => (coin.position.y = base + Math.sin(raw * Math.PI) * hop), { ease: linear });
  }
}

/** One of the punters brings a fist down on the table. */
function pound(which = pick(arms), delay = 0, times = 1) {
  if (!which || which.userData.busy) return;
  which.userData.busy = true;
  for (let i = 0; i < times; i++) {
    tween(0.3, (k, raw) => {
      // Up slowly, down fast.
      which.userData.lift = raw < 0.62 ? Math.sin((raw / 0.62) * Math.PI * 0.5) * 2.1 : 2.1 * (1 - ((raw - 0.62) / 0.38) ** 2);
    }, {
      delay: delay + i * 0.34,
      ease: linear,
      done: () => {
        which.userData.lift = 0;
        if (i === times - 1) which.userData.busy = false;
        shake = Math.max(shake, 0.1);
        sound.play('knSlam', { level: rand(0.5, 0.8) });
        const fist = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), which.rotation.y).add(which.position);
        jolt(fist.x, fist.z, 0.8);
      },
    });
  }
}

// What the punters shout. {ship} is whoever it is about; {other} is another ship.
const HECKLES = {
  start: ['Ten on {ship}!', 'My boots on {ship}!', 'Who’s holding the money?', 'Twenty says {ship} sinks!', 'All of it on {ship}!'],
  lead: ['{ship}! I knew it!', 'Double it on {ship}!', 'Get in, {ship}!', 'That’s my ship, that is!', 'Not {ship}. Anyone but {ship}!'],
  hit: ['OOOH!', 'She’s holed!', 'That’s my rent, that is!', 'Right in the gunwales!', 'Fire back, you cowards!', 'I felt that from here!'],
  lastlap: ['LAST LAP!', 'Everything on {ship}!', 'Don’t you dare, {ship}!'],
  finish: ['Pay up!', 'Never in doubt!', 'Fix! It’s a fix!', 'Drinks are on {ship}!', 'Best of three!'],
  idle: ['Come on, {ship}!', 'Faster, you barnacles!', 'My nan rows quicker!', 'Another round over here!', 'Easy money, this.', 'Who had {ship}?', 'Shift yourself, {ship}!', 'Is that all you’ve got?'],
};
const SPOTS = ['left', 'right', 'top-left', 'top-right', 'low-left', 'low-right'];

/** A shout from somewhere round the table. */
function heckle(kind, ship) {
  if (time - lastHeckle < 1.1 || ui.heckles.children.length >= 3 || race.kind === 'scramble') return;
  lastHeckle = time;
  const about = ship?.name ?? pick(fleet)?.name ?? 'that one';
  const free = SPOTS.filter((spot) => !ui.heckles.querySelector(`.${spot}`));
  const el = document.createElement('div');
  el.className = `kn-heckle ${pick(free.length ? free : SPOTS)} ${kind === 'hit' || kind === 'lastlap' ? 'loud' : ''}`;
  el.style.setProperty('--tilt', `${rand(-5, 5).toFixed(1)}deg`);
  el.textContent = pick(HECKLES[kind] ?? HECKLES.idle).replace('{ship}', about);
  ui.heckles.append(el);
  setTimeout(() => el.remove(), 2400);
}

/** The room reacts to something. Nothing here changes the race; it is all for show. */
function ruckus(kind, ship) {
  const everyone = () => arms.forEach((a, i) => pound(a, i * 0.09 + rand(0, 0.08)));
  switch (kind) {
    case 'start':
      for (let i = 0; i < (race.kind === 'scramble' ? 5 : 9); i++) tossCoin(i * 0.11 + rand(0, 0.1));
      everyone();
      sound.play('bbCheer', { level: 0.6 });
      heckle('start', ship);
      break;
    case 'lead':
      for (let i = 0; i < 3; i++) tossCoin(i * 0.15);
      pound();
      heckle('lead', ship);
      break;
    case 'hit':
      if (Math.random() < 0.65) stab(0.25);
      pound(pick(arms), 0, 2);
      for (let i = 0; i < 2; i++) tossCoin(0.4 + i * 0.2);
      sound.play('knOoh', { level: 0.7 });
      heckle('hit', ship);
      break;
    case 'roll':
      tossCoin();
      break;
    case 'lastlap':
      stab(0.1);
      for (let i = 0; i < 8; i++) tossCoin(i * 0.1);
      everyone();
      sound.play('bbCheer', { level: 0.7 });
      heckle('lastlap', ship);
      break;
    case 'finish':
      for (let i = 0; i < 18; i++) tossCoin(i * 0.09);
      arms.forEach((a, i) => pound(a, i * 0.1, 3));
      sound.play('bbCheer', { level: 0.9 });
      heckle('finish', ship);
      break;
    default: {
      // Between the big moments: the odd coin, a thump, somebody shouting.
      const roll = Math.random();
      if (roll < 0.5) for (let i = 0; i < (Math.random() < 0.3 ? 2 : 1); i++) tossCoin(i * 0.2);
      else if (roll < 0.75) pound();
      else heckle('idle', ship);
      if (Math.random() < 0.35) sound.play('knMurmur', { level: 0.5, ambience: true });
    }
  }
}

/** The bookmaker's odds on a ship, from how far off the lead it is. Purely for show. */
const PRICES = [[0.72, '1/3'], [0.6, '1/2'], [0.5, 'Evens'], [0.4, '6/4'], [0.33, '2/1'], [0.25, '3/1'], [0.2, '4/1'], [0.14, '6/1'], [0.1, '9/1'], [0.06, '16/1'], [0.03, '33/1'], [0, '50/1']];
function chalkOdds() {
  const racing = fleet.filter((b) => b.sim.done == null);
  if (race.kind !== 'race' || racing.length < 2) return fleet.forEach((b) => (b.card.querySelector('.kn-odds').textContent = ''));
  const front = Math.max(...racing.map((b) => b.sim.pos));
  const fancy = racing.map((b) => Math.exp(-(front - b.sim.pos) / 13) * (race.clock < b.sim.holedUntil ? 0.6 : 1) * (0.8 + 0.4 * clamp(b.sim.wind / (race.motion.max || 10), 0, 1)));
  const total = fancy.reduce((a, n) => a + n, 0);
  racing.forEach((b, i) => {
    const chance = fancy[i] / total;
    b.card.querySelector('.kn-odds').textContent = PRICES.find(([p]) => chance >= p)[1];
  });
  for (const b of fleet) if (b.sim.done != null) b.card.querySelector('.kn-odds').textContent = '';
}

// ---------------------------------------------------------------------------
// Things that happen in a race
// ---------------------------------------------------------------------------

function act(e) {
  const ship = fleetById.get(e.ship ?? e.to);
  switch (e.type) {
    case 'shot': {
      const from = fleetById.get(e.from);
      const to = fleetById.get(e.to);
      if (!from || !to) return;
      const muzzle = above(from, 0.35);
      for (let i = 0; i < 4; i++) puff(muzzle.clone().add(new THREE.Vector3(rand(-0.2, 0.2), 0, rand(-0.2, 0.2))), { size: rand(0.22, 0.4), rise: rand(0.5, 1.1), life: rand(0.8, 1.3) });
      flash(muzzle, 0xffb347, 0.3, 26);
      from.kick = 1;
      const mesh = part(shapes().ball, paint(0x1c1c20, { rough: 0.5 }), { at: muzzle.toArray(), size: 0.085, into: scene });
      balls.add({ mesh, from: muzzle, to, t0: race.clock, land: Math.max(race.clock + 0.2, e.land) });
      sound.play('knCannon');
      break;
    }
    case 'hit': {
      if (!ship) return;
      const at = above(ship, 0.3);
      explosion(at, 0.9);
      splash(at.clone().add(new THREE.Vector3(rand(-0.3, 0.3), 0, rand(-0.3, 0.3))), 0.7);
      callout(above(ship, ship.height), `💥 Holed by ${chipHtml(e.by, true)}`, 'bad');
      sound.play('knHit');
      ruckus('hit', ship);
      break;
    }
    case 'miss':
      if (!ship) return;
      splash(above(ship, 0).add(new THREE.Vector3(rand(-0.5, 0.5), 0, rand(0.3, 0.6))), 0.9);
      sound.play('knSplash');
      break;
    case 'fizzle':
      if (!ship) return;
      for (let i = 0; i < 3; i++) puff(above(ship, 0.4), { colour: 0x8d8780, size: rand(0.12, 0.22), rise: 0.6, life: 0.8 });
      sound.play('knFizz', { level: 0.6 });
      break;
    case 'roll':
      if (!ship) return;
      callout(above(ship, ship.height), `${chipHtml(e.by, true)} <span class="what">is on a roll!</span>`, 'gold');
      sound.play('knRoll', { level: 0.7 });
      ruckus('roll', ship);
      break;
    case 'lead':
      if (!ship) return;
      ticker(race.kind === 'scramble' ? `${chipHtml(ship.crew[0], true)} takes the lead!` : `<b>${esc(ship.name)}</b> takes the lead!`);
      sound.play('knLead', { level: 0.7 });
      ruckus('lead', ship);
      break;
    case 'lastlap':
      banner('Last lap!', '', 'bell', 2.2);
      sound.play('knBell');
      ruckus('lastlap', ship);
      break;
    case 'finish':
      if (!ship) return;
      if (e.place === 1) {
        banner(`${ship.name} wins!`, ship.crew.map((id) => players.get(id)?.name).filter(Boolean).join(' & '), 'good', 4.5);
        sound.play('knFinish');
        for (let i = 0; i < 6; i++) tween(0.01, () => {}, { delay: i * 0.3, done: () => firework(new THREE.Vector3(rand(-4, 4), rand(2.6, 3.8), rand(-1, 1))) });
        tween(2.4, (k, raw) => (castaway.position.y = 0.2 + Math.abs(Math.sin(raw * Math.PI * 6)) * 0.16), { ease: linear });
        ruckus('finish', ship);
      } else {
        callout(above(ship, ship.height), `🏁 ${ordinal(e.place)}`, 'plain');
        sound.play('knHome', { level: 0.7 });
      }
      break;
  }
}

/** Bring this screen's idea of the race into line with the server's. */
function sync(v) {
  const live = v.phase === 'go' && !v.paused;
  const ahead = live ? clamp((serverNow() - v.at) / 1000, 0, 0.5) * v.rate : 0;
  race.clock = v.clock + ahead;
  race.rate = live ? v.rate : 0;
  race.motion = v.motion;
  race.goal = v.goal;
  const leaderPos = Math.max(...v.ships.map((s) => s.pos));
  let ticks = 0;
  for (const s of v.ships) {
    const b = fleetById.get(s.id);
    if (!b) continue;
    const snap = { pos: s.pos, wind: s.wind, holedUntil: s.holedUntil, done: s.done };
    if (ahead > 0) advance(snap, ahead, leaderPos, v.clock, v.motion);
    // Keep the ship where it is on screen and let the difference drain away, unless it is too big to hide.
    const shown = b.sim.pos + b.slip;
    b.slip = b.fresh || Math.abs(shown - snap.pos) > 8 ? 0 : shown - snap.pos;
    b.fresh = false;
    b.sim = snap;
    b.place = s.place;
    b.roll = s.roll;
    if (s.right > b.right) {
      ticks += s.right - b.right;
      b.gust = 1;
    }
    b.right = s.right;
  }
  if (ticks && live) sound.play('knTick', { level: clamp(0.35 + ticks * 0.1, 0.35, 0.7) });
}

/** Put the cards along the bottom in race order. */
function layoutCards() {
  const order = inOrder(fleet.map((b) => ({ b, pos: b.sim.pos, done: b.sim.done })));
  const key = order.map((o) => o.b.id).join();
  const n = fleet.length;
  if (!n) return;
  const gap = 1.2; // in em: the HUD's em is ten TV pixels
  const width = Math.min(34, (184 - gap * (n - 1)) / n);
  const total = n * width + (n - 1) * gap;
  ui.cards.style.setProperty('--w', `${width}em`);
  ui.cards.classList.toggle('tight', width < 22);
  order.forEach(({ b }, rank) => {
    if (key !== race.order || b.rank !== rank) {
      b.rank = rank;
      b.card.style.transform = `translateX(${(184 - total) / 2 + rank * (width + gap)}em)`;
      b.card.querySelector('.kn-pl').textContent = rank + 1;
      b.card.classList.toggle('first', rank === 0);
      if (!b.boats) b.tag.querySelector('b').textContent = rank + 1;
    }
  });
  race.order = key;
}

function showRace(v) {
  if (race.key !== v.key || fleet.length !== v.ships.length) {
    setFleet(v.key, v.kind, v.ships);
    // Joining a race that is already under way (or over): don't replay everything that has happened so far.
    race.lastEvent = v.clock > 3 ? Math.max(0, ...v.events.map((e) => e.id)) : 0;
    race.phase = null;
    race.count = null;
  }
  lit.name = v.light ?? 'morning';
  sync(v);
  for (const e of v.events) {
    if (e.id <= race.lastEvent) continue;
    race.lastEvent = e.id;
    act(e);
  }

  // The words.
  ui.top.querySelector('b').textContent = v.kind === 'scramble' ? 'The Scramble' : `Race ${v.n} of ${v.of}`;
  ui.rules.hidden = v.phase !== 'rules';
  if (v.phase === 'rules' && !ui.rules.dataset.done) {
    ui.rules.dataset.done = '1';
    ui.rules.innerHTML = `<h2>The Scramble</h2><p>Every pirate for themselves. ${Math.round(v.limit)} seconds: row as far as you can.</p><ol>${v.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>`;
  }
  if (v.phase !== race.phase || v.count !== race.count) {
    const went = race.phase === 'ready' && v.phase === 'go';
    if (v.phase === 'ready' && v.count > 0) {
      ui.big.textContent = v.count;
      restart(ui.big);
      sound.play('knBeep');
    } else if (went) {
      ui.big.textContent = 'GO!';
      restart(ui.big);
      sound.play('knGun');
      ruckus('start');
      setTimeout(() => (ui.big.hidden = true), 900);
    } else if (v.phase !== 'ready') {
      ui.big.hidden = true;
    }
    if (v.phase === 'over' && race.phase === 'go' && v.kind === 'scramble') {
      banner('Oars down!', '', 'bell', 2.4);
      sound.play('knFinish');
    }
    race.phase = v.phase;
    race.count = v.count;
  }
  layer.dataset.phase = v.phase;
}

function restart(el) {
  el.hidden = false;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
}

// ---------------------------------------------------------------------------
// The frame loop
// ---------------------------------------------------------------------------

const tmp = new THREE.Vector3();

function sail(dt) {
  const m = race.motion;
  if (!m || fleet.length === 0) return;
  const step = dt * race.rate;
  const leaderPos = Math.max(...fleet.map((b) => b.sim.pos));
  let leader = fleet[0];
  const laps = race.goal ? Math.round(race.goal / m.lap) : 0;

  for (const b of fleet) {
    if (step > 0) {
      advance(b.sim, step, leaderPos, race.clock, m);
      if (race.goal && b.sim.pos > race.goal) b.sim.pos = race.goal;
    }
    b.slip *= Math.exp(-dt * 5);
    if (b.sim.pos > leader.sim.pos) leader = b;

    // Where it is. A ship that has finished sails a little way on past the line and heaves to, out of the way.
    let pos = b.sim.pos + b.slip;
    if (b.sim.done != null && race.goal) pos = race.goal + Math.min(9 + 3.5 * (fleet.length - (b.place ?? fleet.length)), Math.max(0, race.clock - b.sim.done) * 2.4);
    const at = spot(pos / m.lap, b.lane);
    const holed = race.clock < b.sim.holedUntil;
    const moving = race.rate > 0 && b.sim.done == null;
    const speed = moving ? speedOf(b.sim, leaderPos, race.clock, m) : 0;
    const wind = clamp(b.sim.wind / m.max, 0, 1);
    const swell = lit.swell;

    b.group.position.set(at.x, Math.sin(time * 1.5 + b.seed) * 0.02 * swell, at.z);
    b.group.rotation.y = at.turn;
    // Heel and pitch: bow up when it is flying, over on its side when holed, and a lurch when its own gun goes off.
    b.kick *= Math.max(0, 1 - dt * 4);
    b.gust *= Math.max(0, 1 - dt * 5);
    b.heel += ((holed ? 0.42 : 0.05 * wind) - b.heel) * Math.min(1, dt * 6);
    b.body.rotation.x = b.heel + Math.sin(time * 1.2 + b.seed * 2) * 0.035 * swell + b.kick * 0.22;
    b.body.rotation.z = -0.06 * wind + Math.sin(time * 1.7 + b.seed) * 0.02 * swell;
    b.body.position.y = holed ? -0.05 : 0;

    // Sails fill with the wind (and flap when the ship is holed); oars pull faster the faster the boat goes.
    const fill = holed ? 0.25 + 0.2 * Math.sin(time * 14 + b.seed) : 0.22 + 0.78 * wind + b.gust * 0.25;
    for (const s of b.sails) s.scale.x = fill;
    if (b.pennant) b.pennant.visible = b.roll && !holed;
    if (b.oars.length) {
      b.stroke += dt * (moving ? 2.2 + speed * 1.9 : 0.6);
      for (const oar of b.oars) {
        oar.rotation.y = Math.sin(b.stroke) * 0.62 * oar.userData.side;
        oar.rotation.x = Math.max(0, Math.cos(b.stroke)) * 0.3 * oar.userData.side;
      }
    }

    // The wake: cotton wool off the stern, more of it the faster the ship goes.
    if (moving) {
      b.wake -= dt * speed;
      if (b.wake <= 0) {
        b.wake = b.boats ? 0.9 : 0.55;
        const back = b.boats ? 0.45 : 0.75;
        tmp.set(Math.cos(at.turn) * back, 0, -Math.sin(at.turn) * back).add(b.group.position);
        puff(new THREE.Vector3(tmp.x + rand(-0.06, 0.06), 0.03, tmp.z + rand(-0.06, 0.06)), { colour: 0xf2fbff, size: (b.boats ? 0.07 : 0.11) + speed * 0.02, rise: 0, life: 1.3, drift: new THREE.Vector3(0, 0.02, 0) });
      }
      // "Fresh wind": streaks blowing past the ships at the back, so nobody feels cheated by the help they get.
      const fresh = freshWind(b.sim, leaderPos, m);
      b.streak -= dt * fresh;
      if (fresh > 0.25 && b.streak <= 0) {
        b.streak = 0.35;
        const streak = part(shapes().box, paint(0xffffff, { glow: 0.6 }), { size: [0.5, 0.012, 0.012], turn: [0, at.turn, 0], shadow: false, into: scene });
        const from = b.group.position.clone().add(new THREE.Vector3(Math.cos(at.turn) * 1.2 + rand(-0.2, 0.2), rand(0.5, 1.1), -Math.sin(at.turn) * 1.2 + rand(-0.3, 0.3)));
        const push = new THREE.Vector3(-Math.cos(at.turn) * 2.6, 0, Math.sin(at.turn) * 2.6);
        tween(0.5, (k, raw) => {
          streak.position.copy(from).addScaledVector(push, raw);
          streak.scale.x = 0.5 * Math.sin(raw * Math.PI);
        }, { ease: linear, done: () => scene.remove(streak) });
      }
    }
    if (holed) {
      b.smoke -= dt;
      if (b.smoke <= 0) {
        b.smoke = 0.14;
        puff(above(b, 0.5), { colour: pick([0x3c3835, 0x57514b]), size: rand(0.16, 0.3), rise: rand(0.9, 1.5), life: rand(0.8, 1.3) });
      }
    }

    // Its name flag, and its card.
    const p = onScreen(tmp.copy(b.group.position).setY(b.height));
    b.tag.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    b.card.querySelector('.kn-bar i').style.width = `${Math.round(wind * 100)}%`;
    b.card.classList.toggle('holed', holed);
    b.card.classList.toggle('roll', b.roll);
    b.card.classList.toggle('home', b.sim.done != null);
    b.tag.classList.toggle('holed', holed);
    const lap = laps ? clamp(Math.floor(b.sim.pos / m.lap) + 1, 1, laps) : 0;
    b.card.querySelector('.kn-st').textContent = b.sim.done != null ? `🏁 ${ordinal(b.place ?? 1)}` : holed ? 'HOLED!' : laps ? `Lap ${lap}/${laps}` : `${Math.round(b.sim.pos)} leagues`;
  }
  if (step > 0) race.clock += step;

  for (const ball of balls) {
    const k = clamp((race.clock - ball.t0) / (ball.land - ball.t0), 0, 1);
    ball.mesh.position.lerpVectors(ball.from, above(ball.to, 0.3), k);
    ball.mesh.position.y += Math.sin(k * Math.PI) * 2.1;
    if (k >= 1 || race.rate === 0) {
      scene.remove(ball.mesh);
      balls.delete(ball);
    }
  }

  layoutCards();
  let under = 'Every pirate for themselves';
  if (laps) under = current?.phase === 'go' || current?.phase === 'over' ? `Lap ${clamp(Math.floor(leader.sim.pos / m.lap) + 1, 1, laps)} of ${laps}` : `${['No', 'One', 'Two', 'Three', 'Four', 'Five'][laps] ?? laps} lap${laps === 1 ? '' : 's'} of the island`;
  if (ui.top.dataset.under !== under) ui.top.querySelector('span').textContent = ui.top.dataset.under = under;

  // The castaway turns to watch whoever is in front.
  castaway.rotation.y = Math.atan2(leader.group.position.x - castaway.position.x, leader.group.position.z - castaway.position.z);
}

function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
  lastFrame = now;
  time += dt;

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

  relight(dt);
  waves(time, 0.045 * lit.swell);
  sail(dt);

  // The punters: fists that fidget, and something going on every few seconds while a race is on.
  for (const a of arms) a.position.y = a.userData.rest + a.userData.lift + Math.max(0, Math.sin(time * 1.3 + a.userData.seed)) * 0.05;
  if (race.rate > 0) {
    nextRuckus -= dt;
    if (nextRuckus <= 0) {
      nextRuckus = race.kind === 'scramble' ? rand(3.5, 6.5) : rand(1.8, 4.2);
      ruckus('idle');
    }
    oddsAt -= dt;
    if (oddsAt <= 0) {
      oddsAt = 1.2;
      chalkOdds();
    }
  }

  // Smoke off the signal fire.
  nextSmoke -= dt;
  if (nextSmoke <= 0) {
    nextSmoke = 0.5;
    puff(fire.at.clone(), { colour: 0xe6e1d8, size: rand(0.16, 0.26), rise: rand(2.2, 3), life: rand(2.4, 3.2), drift: new THREE.Vector3(rand(0.3, 0.7), rand(2.2, 3), rand(-0.2, 0.2)) });
  }

  // A slow drift of the camera, plus whatever the guns have shaken loose.
  shake *= Math.max(0, 1 - dt * 5);
  aimCamera(Math.sin(time * 0.21) * 0.22 + rand(-1, 1) * shake, rand(-1, 1) * shake);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// The sheets host.js draws between races, and the two functions it calls
// ---------------------------------------------------------------------------

/** The screens that come up over the model: the crews, the table after a race, and the muster at the end. */
export function knotsScreens({ anim, chip }) {
  const sail = (s) => `style="--sail:${PAINTS[s.paint % PAINTS.length].sail}"`;
  const crewOf = (s) => s.crew.map((id) => chip(id)).join('');
  return {
    'kn-race': () => '',

    'kn-crews'(v) {
      const rowed = v.rowed
        ? `<div class="kn-rowed"><h3>The Scramble</h3>${v.rowed.map((r, i) => `<p${anim(`rowed${r.id}`, 'rise', 150 + i * 90, 400)}><b>${i + 1}</b>${chip(r.id)}<i>${r.leagues} leagues</i></p>`).join('')}</div>`
        : '';
      const ships = v.ships.map((s, i) => `<div class="kn-crew" ${sail(s)}${anim(`crew${s.id}`, 'pop', 900 + i * 450, 500)}><h3>${esc(s.name)}</h3><div>${crewOf(s)}</div></div>`).join('');
      return `<div class="kn-sheet kn-crews ${v.solo ? 'solo' : ''}">
        ${rowed}
        <div class="kn-fleet"><h2>${v.solo ? 'Now for the real thing' : 'Your crews'}</h2>${v.solo ? '<p class="kn-note">A boat each. Three laps of the island.</p>' : `<div class="kn-ships">${ships}</div><p class="kn-note">Fastest with slowest. Go and sit with your crew!</p>`}</div>
      </div>`;
    },

    'kn-table'(v) {
      const results = v.results
        .map((r, i) => `<p class="kn-result ${r.place === 1 ? 'won' : ''}" ${sail(r)}${anim(`res${v.n}${r.id}`, 'rise', 200 + i * 220, 450)}><b>${ordinal(r.place)}</b><span class="nm">${esc(r.name)}</span><span class="who">${crewOf(r)}</span><i>${r.behind ?? ''}</i><em>+${r.won.toLocaleString('en')}</em></p>`)
        .join('');
      const standings = v.standings
        .map((s, i) => `<p class="kn-row" ${sail(s)}${anim(`tab${v.n}${s.id}`, 'rise', 1400 + i * 160, 450)}><b>${i + 1}</b><span class="nm">${esc(s.name)}</span><em>${s.points.toLocaleString('en')}</em></p>`)
        .join('');
      return `<div class="kn-sheet kn-table">
        <div class="kn-col"><h2>${v.final ? 'The last race' : `Race ${v.n}`}${v.double ? ' <small>double doubloons</small>' : ''}</h2>${results}</div>
        <div class="kn-col narrow"><h2>The table</h2>${standings}${v.next ? `<p class="kn-note"${anim(`next${v.n}`, 'pop', 3000, 400)}>${esc(v.next)}</p>` : ''}</div>
      </div>`;
    },

    'kn-muster'(v) {
      const awards = v.awards
        .map((a, i) => `<p class="kn-award"${anim(`aw${i}`, 'rise', 1500 + i * 700, 500)}><em>${esc(a.label)}</em><span>${a.players.map((id) => chip(id)).join(' ')}</span><b>${esc(a.value)}</b></p>`)
        .join('');
      return `<div class="kn-sheet kn-muster">
        <div class="kn-champ" ${sail(v.champion)}${anim('champ', 'pop', 0, 700)}><p>The regatta goes to</p><h1>${esc(v.champion.name)}</h1><div>${crewOf(v.champion)}</div></div>
        <div class="kn-awards">${awards}</div>
      </div>`;
    },
  };
}

/** Draw a view. Called for every "kn-" screen. */
export function show(view, playerMap) {
  if (!layer) init();
  players = playerMap;
  current = view;
  layer.hidden = false;
  layer.dataset.screen = view.screen;
  if (!running) {
    running = true;
    lastFrame = performance.now();
    fit();
    requestAnimationFrame(frame);
  }
  if (view.screen === 'kn-race') return showRace(view);

  // Between races the model carries on behind the sheet, with nobody racing.
  race.rate = 0;
  ui.big.hidden = true;
  ui.rules.hidden = true;
  if (view.screen === 'kn-crews' && race.key !== 'kn-crews') {
    lit.name = 'morning';
    setFleet('kn-crews', 'race', view.ships.map((s) => ({ ...s, pos: 0 })));
    race.motion ??= { lap: 100, max: 10 };
    race.goal = null;
  }
  if (view.screen === 'kn-muster' && Math.random() < 0.5) firework(new THREE.Vector3(rand(-6, 6), rand(2.6, 3.8), rand(-2, 2)));
}

/** Put the model away (another screen is showing). */
export function hide() {
  if (!layer || layer.hidden) return;
  layer.hidden = true;
  running = false;
  clearFleet();
  for (const tw of [...tweens]) tw.done?.(); // let every puff and splinter take itself off the table
  tweens.clear();
  for (const thing of [...coins, ...daggers]) scene.remove(thing);
  coins.length = 0;
  daggers.length = 0;
  for (const a of arms) Object.assign(a.userData, { lift: 0, busy: false });
  for (const mug of mugs) mug.position.y = mug.userData.rest;
  ui.heckles.replaceChildren();
  ui.callouts.replaceChildren();
  ui.banner.hidden = true;
  ui.ticker.hidden = true;
  ui.big.hidden = true;
  ui.rules.hidden = true;
  delete ui.rules.dataset.done;
  Object.assign(race, { key: null, kind: null, clock: 0, rate: 0, motion: null, goal: null, lastEvent: 0, phase: null, count: null, order: '' });
  lit.name = 'morning';
  current = null;
}
