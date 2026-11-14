// Bombard! on the big screen: a tabletop diorama of the battle, drawn in 3D
// with three.js. Painted wooden ships, cotton-wool fog, a tray of resin sea.
//
// host.js draws the words around the edge (sides, crew, fleets); this file
// owns the model on the table and everything that happens to it.
//
// How it fits together
// --------------------
// * show(view) is called every time the server sends a new view. It makes
//   sure the two boards exist and match what the server says is revealed.
// * A volley arrives as a timeline of events (shots, Kraken strikes, banners)
//   with times attached. They are played back here, in step with the sound,
//   and each one reveals its tile as it lands.
// * Everything that moves is a "tween": a little function called every frame
//   with a number going from 0 to 1.
//
// World units: one board fits in an 8x8 square. x runs left to right, y is up,
// z comes towards the camera. The sea is at y = 0.

import * as THREE from './vendor/three.module.min.js';
import * as sound from './sound.js';
import { serverNow, esc } from './common.js';
import { LIVERY, liveryFor } from './bombard-play.js';
import './bombard-sound.js';

const BOARD = 8; // each board is fitted into a square this big
const CENTRE = [-5.2, 5.2]; // where the two boards sit, left and right
const TRAY = { w: 20.6, d: 10.6 }; // the tray of sea they share
const IMPACT = 0.72; // how far through a shot's time the ball lands (the server uses the same number)
const KRAKEN = { skin: 0xb23f92, dark: 0x6a2358, spot: 0xf7b7d2, eye: 0xf7d154 };
/** Is this piece part of the Kraken (head, tentacle or its bonus knob) rather than a ship? */
const isKraken = (kind) => kind === 'head' || kind === 'arm' || kind === 'knob';

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeIn = (k) => k ** 3;
const easeInOut = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
const backOut = (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;
const linear = (k) => k;

// ---------------------------------------------------------------------------
// Set-up (done once, the first time the game is shown)
// ---------------------------------------------------------------------------

let layer = null; // the <div> that holds the canvas and the labels drawn over it
let renderer, scene, camera, sun, sky, water, callouts, bannerEl;
let boards = []; // [left, right]
let boardsKey = null;
let flags = [];
let candleFlame = null;
let candleLight = null;
let running = false;
let lastFrame = 0;
let clock = 0; // seconds since the diorama was first shown
let shake = 0;
let mood = { storm: 0, target: 0 };
let players = new Map();
let current = null; // the latest view
let shownKey = null;

const tweens = new Set();
const actors = new Set(); // things with a life of their own: update(dt) -> false when finished
const burning = new Set(); // flames to flicker
const cam = { target: new THREE.Vector3(0, 0, 0.2), dist: 30, elevation: 1.04 };

/** Run fn(eased, raw) every frame for `dur` seconds. */
function tween(dur, fn, { delay = 0, ease = easeOut, done = null } = {}) {
  const tw = { t: -delay, dur: Math.max(0.001, dur), fn, ease, done };
  tweens.add(tw);
  return tw;
}

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
  SHAPES.round = new THREE.IcosahedronGeometry(1, 2);
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

const labelCache = new Map();
function labelTexture(text) {
  if (!labelCache.has(text)) {
    labelCache.set(
      text,
      decal((c, s) => {
        c.font = `${s * 0.74}px "Pirata One", Georgia, serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.lineWidth = s * 0.09;
        c.lineJoin = 'round';
        c.strokeStyle = 'rgba(20, 10, 4, 0.75)';
        c.strokeText(text, s / 2, s * 0.54);
        c.fillStyle = '#f4e6c1';
        c.fillText(text, s / 2, s * 0.54);
      }, 128),
    );
  }
  return labelCache.get(text);
}

// A red X, daubed on with a wide brush that was running out of paint.
let crossTexture = null;
let missTexture = null;
function brushX(colour, width) {
  return decal((c, s) => {
    c.lineCap = 'round';
    c.strokeStyle = colour;
    const stroke = (x0, y0, cx, cy, x1, y1) => {
      const line = (off, thick, alpha) => {
        c.globalAlpha = alpha;
        c.lineWidth = thick * s;
        c.beginPath();
        c.moveTo(x0 * s + off * s, y0 * s - off * s);
        c.quadraticCurveTo(cx * s + off * s, cy * s - off * s, x1 * s + off * s * 0.5, y1 * s - off * s * 0.5);
        c.stroke();
      };
      line(0, 0.1 * width, 1); // the body of the stroke
      for (let i = 0; i < 10; i++) line(rand(-0.075, 0.075) * width, rand(0.008, 0.03), rand(0.5, 1)); // bristles straying either side
      // A few dry streaks where the paint ran thin.
      c.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 5; i++) line(rand(-0.05, 0.05) * width, rand(0.004, 0.012), rand(0.4, 0.9));
      c.globalCompositeOperation = 'source-over';
    };
    stroke(0.14, 0.17, 0.46, 0.44, 0.86, 0.85);
    stroke(0.86, 0.14, 0.54, 0.5, 0.14, 0.84);
  });
}

function init() {
  shapes();
  layer = document.createElement('div');
  layer.id = 'bbLayer';
  layer.hidden = true;
  layer.innerHTML = '<div class="bb-callouts"></div><div class="bb-vignette"></div><div class="bb-banner" hidden><b></b><span></span></div>';
  document.getElementById('stage').before(layer);
  callouts = layer.querySelector('.bb-callouts');
  bannerEl = layer.querySelector('.bb-banner');

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

  crossTexture = brushX('#e0382a', 1.25);
  missTexture = brushX('#2b1b0f', 0.8);

  buildTable();
  window.addEventListener('resize', fit);
  fit();
}

// ----- the table, the tray and the sea -----

function buildTable() {
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
  const top = part(shapes().flat, new THREE.MeshStandardMaterial({ map: wood, roughness: 0.85 }), { at: [0, -0.6, 0], size: [90, 1, 60], into: scene });
  top.castShadow = false;

  // The tray: four dark rails with brass corners.
  const rail = paint(0x3f2817, { rough: 0.6 });
  const brass = paint(0xd9a441, { rough: 0.35 });
  const t = 0.55; // how thick the rails are
  const { w, d } = TRAY;
  for (const z of [-1, 1]) part(shapes().box, rail, { at: [0, -0.1, z * (d / 2 + t / 2)], size: [w + t * 2, 1.0, t], into: scene });
  for (const x of [-1, 1]) part(shapes().box, rail, { at: [x * (w / 2 + t / 2), -0.1, 0], size: [t, 1.0, d], into: scene });
  for (const x of [-1, 1]) for (const z of [-1, 1]) part(shapes().box, brass, { at: [x * (w / 2 + t / 2), -0.08, z * (d / 2 + t / 2)], size: [t + 0.08, 1.06, t + 0.08], into: scene });

  // The sea: one sheet of little triangles, each a slightly different blue, which rises and falls.
  const g = new THREE.PlaneGeometry(w, d, 70, 30).rotateX(-Math.PI / 2).toNonIndexed();
  const count = g.attributes.position.count;
  const colours = new Float32Array(count * 3);
  const base = new THREE.Color();
  for (let i = 0; i < count; i += 3) {
    base.setHSL(0.52 + rand(-0.012, 0.012), 0.62, 0.3 + rand(-0.025, 0.035));
    for (let k = 0; k < 3; k++) base.toArray(colours, (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  water = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.22, metalness: 0.15 }));
  water.receiveShadow = true;
  scene.add(water);

  buildProps();
}

// ----- the clutter on the table -----
//
// The battle is a game laid out on a tavern table, so around it are the things
// that would be: ale, doubloons, a dagger or two. They are made life-size next
// to the little ships, which is what makes the ships look like models.

const TABLE = -0.6; // the height of the table top

function tankard(x, z, turn = 0) {
  const g = new THREE.Group();
  const S = shapes();
  const oak = paint(0x8a5a2e, { rough: 0.8 });
  const iron = paint(0x2b2d33, { rough: 0.4 });
  part(new THREE.CylinderGeometry(1.25, 1.4, 3.2, 14), oak, { at: [0, 1.6, 0], into: g });
  for (const y of [0.5, 2.7]) part(new THREE.CylinderGeometry(1.43 - y * 0.05, 1.45 - y * 0.05, 0.22, 14), iron, { at: [0, y, 0], into: g }); // the hoops
  part(new THREE.TorusGeometry(0.85, 0.2, 6, 12, Math.PI), oak, { at: [1.3, 1.6, 0], turn: [0, 0, -Math.PI / 2], into: g }); // the handle
  part(S.disc, paint(0xd9952b, { rough: 0.3 }), { at: [0, 3.1, 0], size: [1.15, 0.1, 1.15], shadow: false, into: g }); // ale
  // A good head on it, with some running down the side.
  const froth = paint(0xfff6df, { rough: 1 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    part(S.ball, froth, { at: [Math.cos(a) * 0.75, 3.25 + rand(-0.05, 0.12), Math.sin(a) * 0.75], size: rand(0.38, 0.52), into: g });
  }
  part(S.ball, froth, { at: [0, 3.4, 0], size: 0.8, into: g });
  part(S.ball, froth, { at: [-0.95, 2.9, 0.85], size: [0.3, 0.55, 0.3], into: g });
  g.position.set(x, TABLE, z);
  g.rotation.y = turn;
  scene.add(g);
}

function doubloons(x, z, { stack = 0, loose = 0, spread = 1.6 } = {}) {
  const gold = paint(0xe9b949, { rough: 0.28 });
  const dark = paint(0xc8962f, { rough: 0.35 });
  const coin = (cx, y, cz, tilt = 0) => {
    const c = part(shapes().disc, Math.random() < 0.3 ? dark : gold, { at: [cx, y, cz], size: [0.48, 0.09, 0.48], turn: [tilt, rand(0, 3), tilt * 0.6], into: scene });
    part(shapes().disc, dark, { at: [0, 0.52, 0], size: [0.7, 0.1, 0.7], shadow: false, into: c }); // the stamped face
  };
  for (let i = 0; i < stack; i++) coin(x + rand(-0.05, 0.05), TABLE + 0.05 + i * 0.095, z + rand(-0.05, 0.05));
  for (let i = 0; i < loose; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.7 + Math.random() * spread;
    const leaning = Math.random() < 0.25;
    coin(x + Math.cos(a) * r, TABLE + (leaning ? 0.16 : 0.05), z + Math.sin(a) * r, leaning ? rand(0.3, 0.6) : 0);
  }
}

/** A dagger. `stuck` drives it point-first into the table instead of laying it flat. */
function dagger(x, z, turn = 0, stuck = false) {
  const g = new THREE.Group();
  const S = shapes();
  const steel = paint(0xcfd6dc, { rough: 0.18 });
  const brass = paint(0xd9a441, { rough: 0.3 });
  const blade = new THREE.ConeGeometry(0.38, 5.2, 4).rotateZ(-Math.PI / 2); // a long diamond, point towards +x
  part(blade, steel, { at: [2.6, 0, 0], size: [1, 0.22, 1], into: g });
  part(S.box, paint(0x9aa3aa, { rough: 0.3 }), { at: [2.2, 0.05, 0], size: [3.6, 0.03, 0.08], shadow: false, into: g }); // the fuller
  part(S.box, brass, { at: [0, 0, 0], size: [0.28, 0.24, 1.5], into: g }); // the guard
  for (const side of [-1, 1]) part(S.ball, brass, { at: [0, 0, side * 0.78], size: 0.19, into: g });
  part(S.rod, paint(0x3a2416, { rough: 0.9 }), { at: [-1.0, 0, 0], size: [0.2, 1.8, 0.2], turn: [0, 0, Math.PI / 2], into: g }); // the grip
  for (const gx of [-0.5, -1.0, -1.5]) part(S.rod, brass, { at: [gx, 0, 0], size: [0.215, 0.06, 0.215], turn: [0, 0, Math.PI / 2], shadow: false, into: g });
  part(S.ball, brass, { at: [-2.05, 0, 0], size: 0.3, into: g }); // the pommel
  if (stuck) {
    g.position.set(x, TABLE + 4.3, z);
    g.rotation.set(0.25, turn, -Math.PI / 2 + 0.22); // point down, leaning a little
  } else {
    g.position.set(x, TABLE + 0.1, z);
    g.rotation.y = turn;
  }
  scene.add(g);
}

function buildProps() {
  const S = shapes();

  // Ale: one at each near corner, one behind.
  tankard(-11.2, 9.4, 0.6);
  tankard(11.9, 8.8, 2.5);
  tankard(7.5, -9.6, -0.8);

  // Doubloons: a couple of stacks and a spill.
  doubloons(-6.3, 8.0, { stack: 6, loose: 7 });
  doubloons(-4.7, 8.5, { stack: 3 });
  doubloons(8.3, 7.5, { stack: 4, loose: 5, spread: 1.2 });
  doubloons(-11.6, -7.8, { stack: 5, loose: 6 });
  doubloons(1.2, -7.4, { loose: 5, spread: 1.4 });
  doubloons(12.6, 0.5, { stack: 2, loose: 4, spread: 1 });
  doubloons(-12.4, 2.5, { loose: 3, spread: 0.8 });

  // Daggers: one laid down, one settling an argument.
  dagger(-1.5, 8.3, 0.18);
  dagger(-4.2, -8.6, 0.4, true);

  // A chart, half unrolled, with somebody's X on it.
  const chart = decal((c, s) => {
    c.fillStyle = '#e9d8a6';
    c.fillRect(0, 0, s, s);
    c.strokeStyle = 'rgba(90, 60, 25, 0.5)';
    c.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.ellipse(s * rand(0.2, 0.8), s * rand(0.25, 0.75), s * rand(0.08, 0.2), s * rand(0.05, 0.14), rand(0, 3), 0, 7);
      c.stroke();
    }
    c.setLineDash([10, 9]);
    c.beginPath();
    c.moveTo(s * 0.12, s * 0.8);
    c.bezierCurveTo(s * 0.3, s * 0.4, s * 0.55, s * 0.75, s * 0.78, s * 0.3);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = '#b3261c';
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(s * 0.72, s * 0.23);
    c.lineTo(s * 0.84, s * 0.37);
    c.moveTo(s * 0.84, s * 0.23);
    c.lineTo(s * 0.72, s * 0.37);
    c.stroke();
  });
  const paper = new THREE.MeshStandardMaterial({ map: chart, roughness: 0.95 });
  const map = new THREE.Group();
  part(S.flat, paper, { at: [0, 0.02, 0], size: [6.2, 1, 4.6], into: map });
  part(S.rod, paint(0xd9c58f, { rough: 0.95 }), { at: [-3.2, 0.3, 0], size: [0.32, 4.7, 0.32], turn: [Math.PI / 2, 0, 0], into: map }); // the rolled end
  map.position.set(-9.8, TABLE, -8.6);
  map.rotation.y = 0.22;
  scene.add(map);

  // A candle, burned well down, which lights that end of the table.
  const candle = new THREE.Group();
  part(S.disc, paint(0xd9a441, { rough: 0.3 }), { at: [0, 0.08, 0], size: [1.1, 0.16, 1.1], into: candle });
  part(S.rod, paint(0xf3e7c9, { rough: 0.6 }), { at: [0, 0.9, 0], size: [0.42, 1.6, 0.42], into: candle });
  for (const [dx, dz, h] of [[0.36, 0.1, 0.9], [-0.2, 0.33, 0.6], [-0.1, -0.38, 1.1]]) part(S.ball, paint(0xf3e7c9, { rough: 0.6 }), { at: [dx, 1.7 - h / 2, dz], size: [0.13, h / 2, 0.13], into: candle }); // drips
  candleFlame = part(S.cone, new THREE.MeshBasicMaterial({ color: 0xffc35a }), { at: [0, 2.05, 0], size: [0.16, 0.6, 0.16], shadow: false, into: candle });
  candleLight = new THREE.PointLight(0xff9a3c, 60, 16, 1.7);
  candleLight.position.set(0, 2.6, 0);
  candle.add(candleLight);
  candle.position.set(11.8, TABLE, -8.2);
  scene.add(candle);

  // A pair of bone dice, and the bottle the ale didn't come from.
  const bone = paint(0xf1ead6, { rough: 0.5 });
  const pip = paint(0x1c1410);
  for (const [x, z, turn] of [[4.6, 7.6, 0.4], [5.6, 8.3, 1.2]]) {
    const die = part(S.box, bone, { at: [x, TABLE + 0.35, z], size: 0.7, turn: [0, turn, 0], into: scene });
    for (const [px, pz] of [[-0.25, -0.25], [0, 0], [0.25, 0.25]]) part(S.disc, pip, { at: [px, 0.5, pz], size: [0.09, 0.02, 0.09], shadow: false, into: die });
  }
  const glass = paint(0x2f6b45, { rough: 0.15 });
  const bottle = new THREE.Group();
  part(S.rod, glass, { at: [0, 0, 0], size: [0.9, 3.4, 0.9], turn: [0, 0, Math.PI / 2], into: bottle });
  part(S.rod, glass, { at: [2.3, 0, 0], size: [0.34, 1.5, 0.34], turn: [0, 0, Math.PI / 2], into: bottle });
  part(S.rod, paint(0x9b7a4a), { at: [3.15, 0, 0], size: [0.3, 0.35, 0.3], turn: [0, 0, Math.PI / 2], into: bottle }); // the cork
  bottle.position.set(-13.4, TABLE + 0.9, -3.2);
  bottle.rotation.y = 1.3;
  scene.add(bottle);
}

function waves(t) {
  const pos = water.geometry.attributes.position;
  const a = pos.array;
  const swell = 0.045 + mood.storm * 0.055;
  for (let i = 0; i < a.length; i += 3) {
    const x = a[i];
    const z = a[i + 2];
    a[i + 1] = Math.sin(x * 1.3 + t * 1.1) * Math.cos(z * 1.7 + t * 0.8) * swell + Math.sin(x * 3.1 - z * 2.3 + t * 1.9) * swell * 0.4;
  }
  pos.needsUpdate = true;
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

  // The words drawn by host.js sit in a 16:9 box in the middle of the window.
  // Keep the tray inside that box, below the names.
  const fx = (1920 * unit) / w;
  const fy = (1080 * unit) / h;
  const top = fy * (1 - (2 * 205) / 1080);
  const bottom = -fy * (1 - (2 * 105) / 1080);
  const sideLimit = fx * 0.97;
  const corners = [];
  for (const x of [-1, 1]) for (const z of [-1, 1]) for (const y of [-0.4, 1.3]) corners.push(new THREE.Vector3(x * (TRAY.w / 2 + 0.6), y, z * (TRAY.d / 2 + 0.6)));
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
// Models
// ---------------------------------------------------------------------------

// Ships are built one tile at a time (bow, middle, stern), because that is how
// they get revealed. Each part is modelled inside a 1x1 tile, bow towards -x.

const OUTLINE = {
  bow: [[0.5, -0.215], [0.12, -0.215], [-0.2, -0.15], [-0.46, 0], [-0.2, 0.15], [0.12, 0.215], [0.5, 0.215]],
  mid: [[0.5, -0.215], [-0.5, -0.215], [-0.5, 0.215], [0.5, 0.215]],
  stern: [[-0.5, -0.215], [0.3, -0.215], [0.45, -0.15], [0.45, 0.15], [0.3, 0.215], [-0.5, 0.215]],
};
const shrink = (points, k, keep) => points.map(([x, z]) => [Math.abs(x) === 0.5 && keep ? x : x * k, z * k]);

const shipParts = new Map();
function shipPart(where, liveryName) {
  const key = `${where}:${liveryName}`;
  if (shipParts.has(key)) return shipParts.get(key).clone();
  const c = LIVERY[liveryName];
  const hex = (s) => new THREE.Color(s).getHex();
  const hull = paint(hex(c.hull));
  const trim = paint(hex(c.rail), { rough: 0.5 });
  const deck = paint(hex(c.deck));
  const spar = paint(0x4a3524);
  const sail = paint(hex(c.sail), { side: THREE.DoubleSide, rough: 0.9 });
  const g = new THREE.Group();
  const S = shapes();

  slab(OUTLINE[where], -0.06, 0.17, hull, g);
  slab(shrink(OUTLINE[where], 1.035, true), 0.17, 0.215, trim, g);
  slab(shrink(OUTLINE[where], 0.86, true), 0.215, 0.235, deck, g);
  // Gun ports along each side.
  for (const z of [-1, 1]) {
    for (const x of where === 'bow' ? [0.3] : where === 'stern' ? [-0.3, 0.05] : [-0.25, 0.25]) part(S.box, paint(0x14100c), { at: [x, 0.09, z * 0.218], size: [0.09, 0.06, 0.02], shadow: false, into: g });
  }

  const mast = (x, height, yards) => {
    part(S.rod, spar, { at: [x, 0.235 + height / 2, 0], size: [0.026, height, 0.026], into: g });
    part(S.rod, spar, { at: [x, 0.235 + height + 0.02, 0], size: [0.05, 0.04, 0.05], into: g }); // the crow's nest
    yards.forEach(([y, span, drop]) => {
      // The yard is braced round (turned on the mast), so the sail shows from above whichever way the ship lies.
      const yard = new THREE.Group();
      yard.position.set(x, y, 0);
      yard.rotation.y = 0.62;
      g.add(yard);
      part(S.rod, spar, { size: [0.016, span, 0.016], turn: [Math.PI / 2, 0, 0], into: yard });
      // A square sail, bellied out towards the bow by the wind.
      const cloth = new THREE.PlaneGeometry(span * 0.94, drop, 6, 3).rotateY(Math.PI / 2);
      const p = cloth.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const across = p.getZ(i) / (span * 0.47);
        const down = 0.5 - p.getY(i) / drop;
        // Bellied by the wind, and raked so that the cloth shows from above.
        p.setX(i, -0.15 * (1 - across * across) * Math.sin(Math.PI * Math.min(1, down * 0.8 + 0.2)) - 0.3 * down);
      }
      cloth.computeVertexNormals();
      part(cloth, sail, { at: [-0.015, -drop / 2 - 0.01, 0], into: yard });
    });
  };

  if (where === 'bow') {
    part(S.rod, spar, { at: [-0.36, 0.3, 0], size: [0.02, 0.42, 0.02], turn: [0, 0, 1.25], into: g }); // the bowsprit
    part(S.rod, spar, { at: [0.3, 0.52, 0], size: [0.022, 0.58, 0.022], into: g });
    const jib = new THREE.BufferGeometry();
    jib.setAttribute('position', new THREE.Float32BufferAttribute([-0.52, 0.37, 0, 0.27, 0.3, 0.02, 0.27, 0.78, 0], 3));
    jib.computeVertexNormals();
    part(jib, sail, { into: g });
  } else if (where === 'mid') {
    mast(0.02, 0.92, [[0.74, 0.74, 0.4], [1.06, 0.54, 0.28]]);
  } else {
    mast(-0.16, 0.8, [[0.7, 0.68, 0.38], [0.96, 0.48, 0.23]]);
    part(S.box, hull, { at: [0.27, 0.27, 0], size: [0.32, 0.11, 0.36], into: g }); // the quarterdeck
    part(S.box, trim, { at: [0.27, 0.335, 0], size: [0.34, 0.02, 0.38], into: g });
    part(S.box, paint(0xffd97a, { glow: 0.9 }), { at: [0.455, 0.24, 0], size: [0.02, 0.07, 0.2], shadow: false, into: g }); // the lit windows of the great cabin
    part(S.rod, spar, { at: [0.42, 0.52, 0], size: [0.012, 0.38, 0.012], into: g });
    part(S.box, paint(hex(c.flag), { side: THREE.DoubleSide }), { at: [0.51, 0.63, 0], size: [0.17, 0.11, 0.008], into: g });
  }
  // Toy proportions: a bit beamier and taller than a real ship, so it reads from across the room.
  const chunky = new THREE.Group();
  g.scale.set(1, 1.2, 1.32);
  chunky.add(g);
  shipParts.set(key, chunky);
  return chunky.clone();
}

/** A chain of beads that can be bent into any tentacle shape you like. */
function makeTentacle({ beads = 14, thick = 0.34, thin = 0.07, length = 4 } = {}) {
  const group = new THREE.Group();
  const skin = paint(KRAKEN.skin, { rough: 0.45 });
  const spot = paint(KRAKEN.spot, { rough: 0.5 });
  const list = [];
  for (let i = 0; i < beads; i++) {
    const u = i / (beads - 1);
    const r = thick + (thin - thick) * u;
    const bead = part(shapes().ball, skin, { size: r, into: group });
    if (i % 2 === 1 && r > 0.1) part(shapes().ball, spot, { at: [0.72, 0, 0], size: 0.36, shadow: false, into: bead }); // a sucker
    list.push(bead);
  }
  /** bend: how far it leans over (radians, at the tip). curl: extra curl at the end. sway: a wave travelling along it. */
  group.pose = (bend, curl = 0, sway = 0, phase = 0) => {
    let x = 0;
    let y = 0;
    const step = length / beads;
    for (let i = 0; i < beads; i++) {
      const u = i / (beads - 1);
      const a = bend * u + curl * u * u + sway * u * Math.sin(phase + u * 5);
      x += Math.sin(a) * step;
      y += Math.cos(a) * step;
      list[i].position.set(x, y, 0);
      list[i].rotation.z = -a;
    }
  };
  group.pose(0);
  group.span = length;
  return group;
}

function krakenHead(size = 1) {
  const g = new THREE.Group();
  const S = shapes();
  const skin = paint(KRAKEN.skin, { rough: 0.4 });
  const dark = paint(KRAKEN.dark, { rough: 0.5 });
  part(S.round, skin, { at: [0, 0.2, 0], size: [0.95, 0.8, 0.95], into: g });
  part(S.round, skin, { at: [0, 0.85, -0.25], size: [0.72, 0.75, 0.8], into: g }); // the mantle, swept back
  for (const [x, y, z, r] of [[-0.4, 0.95, 0.1, 0.13], [0.3, 1.2, -0.2, 0.16], [0.55, 0.6, 0.35, 0.1], [-0.6, 0.5, 0.3, 0.09], [0, 1.45, -0.5, 0.12]]) part(S.ball, dark, { at: [x, y, z], size: r, shadow: false, into: g });
  for (const x of [-0.42, 0.42]) {
    part(S.round, paint(KRAKEN.eye, { glow: 0.55, rough: 0.3 }), { at: [x, 0.42, 0.72], size: 0.2, into: g });
    part(S.round, paint(0x120a10), { at: [x, 0.42, 0.89], size: [0.05, 0.15, 0.06], shadow: false, into: g });
    part(S.box, dark, { at: [x, 0.66, 0.74], size: [0.44, 0.1, 0.2], turn: [0.2, 0, x > 0 ? 0.35 : -0.35], into: g }); // a furious brow
  }
  g.scale.setScalar(size);
  return g;
}

/** One tile's worth of Kraken, for the board. */
function krakenPart(piece) {
  const g = new THREE.Group();
  if (piece.kind === 'head') {
    // The head covers four tiles. Each tile gets a solid lump of it, leaning in towards the middle,
    // so that any quarter looks like something on its own and all four make one great domed head.
    const S = shapes();
    const skin = paint(KRAKEN.skin, { rough: 0.4 });
    const dark = paint(KRAKEN.dark, { rough: 0.5 });
    const dx = piece.seg % 2 === 0 ? 1 : -1; // which way the middle of the head is
    const dz = piece.seg < 2 ? 1 : -1;
    const back = piece.seg < 2;
    part(S.round, skin, { at: [dx * 0.2, back ? 0.42 : 0.2, dz * 0.2], size: [0.66, back ? 0.95 : 0.62, 0.66], into: g });
    part(S.ball, dark, { at: [dx * -0.12, back ? 1.05 : 0.62, dz * -0.05], size: 0.12, shadow: false, into: g });
    part(S.ball, dark, { at: [dx * 0.3, back ? 1.25 : 0.72, dz * 0.3], size: 0.09, shadow: false, into: g });
    if (!back) {
      // The two near quarters each have an eye, glaring up at the camera.
      part(S.round, paint(KRAKEN.eye, { glow: 0.6, rough: 0.3 }), { at: [dx * 0.12, 0.5, 0.42], size: 0.2, into: g });
      part(S.round, paint(0x120a10), { at: [dx * 0.12, 0.56, 0.58], size: [0.05, 0.14, 0.06], shadow: false, into: g });
      part(S.box, dark, { at: [dx * 0.12, 0.74, 0.44], size: [0.46, 0.1, 0.2], turn: [0.3, 0, dx * -0.35], into: g });
    }
    return g;
  }
  if (piece.kind === 'knob') {
    // The bonus tile: a fat, warty knob with a glossy golden tip, so it reads as something special.
    const S = shapes();
    const skin = paint(KRAKEN.skin, { rough: 0.4 });
    const dark = paint(KRAKEN.dark, { rough: 0.5 });
    part(S.round, skin, { at: [0, 0.12, 0], size: [0.7, 0.32, 0.7], into: g });
    part(S.round, skin, { at: [0, 0.42, 0], size: [0.36, 0.5, 0.36], into: g });
    part(S.round, paint(KRAKEN.eye, { glow: 0.45, rough: 0.25 }), { at: [0, 0.72, 0], size: 0.24, into: g });
    for (const [x, y, z] of [[0.22, 0.2, 0.12], [-0.18, 0.24, -0.16], [0.05, 0.5, 0.18]]) part(S.ball, dark, { at: [x, y, z], size: 0.07, shadow: false, into: g });
    return g;
  }
  // An arm: a hump of tentacle rising out of the water and going back in. The tip curls up instead.
  const u = piece.seg / piece.len;
  const thick = 0.25 - 0.11 * u;
  const tip = piece.seg === piece.len - 1;
  const t = makeTentacle({ beads: 9, thick, thin: tip ? 0.05 : thick * 0.86, length: tip ? 1.25 : 1.5 });
  t.position.set(-0.5, -0.12, 0);
  g.add(t);
  g.userData.arm = { t, tip, seed: Math.random() * 6 };
  poseArm(g, 0);
  return g;
}

function poseArm(g, time) {
  const { t, tip, seed } = g.userData.arm;
  if (tip) t.pose(1.1 + Math.sin(time * 1.6 + seed) * 0.12, 2.6, 0.12, time * 2 + seed);
  else t.pose(0.55, 2.05, 0.06, time * 2 + seed); // up, over and down again within the tile
}

/** A puff of cotton-wool fog covering one tile. */
const fogShapes = [];
function fogPuff() {
  if (fogShapes.length === 0) {
    for (let v = 0; v < 6; v++) {
      const lumps = [];
      const n = 5;
      for (let i = 0; i < n; i++) {
        const lump = new THREE.IcosahedronGeometry(rand(0.3, 0.42), 1);
        lump.scale(1, rand(0.55, 0.8), 1);
        lump.translate(rand(-0.24, 0.24), rand(0.12, 0.26), rand(-0.24, 0.24));
        lumps.push(lump.toNonIndexed());
      }
      const size = lumps.reduce((sum, l) => sum + l.attributes.position.count, 0);
      const pos = new Float32Array(size * 3);
      let at = 0;
      for (const l of lumps) {
        pos.set(l.attributes.position.array, at);
        at += l.attributes.position.array.length;
      }
      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      merged.computeVertexNormals();
      fogShapes.push(merged);
    }
  }
  return part(pick(fogShapes), paint(0xd2dde8, { rough: 1 }), { turn: [0, pick([0, 1, 2, 3]) * (Math.PI / 2), 0] });
}

// ---------------------------------------------------------------------------
// The colours: a flag on a buoy at the corner of each side's waters
// ---------------------------------------------------------------------------

function buildFlags(phase) {
  for (const f of flags) scene.remove(f.group);
  flags = [];
  if (phase !== 1) return;
  flags = [0, 1].map((i) => {
    const side = i === 0 ? -1 : 1;
    const group = new THREE.Group();
    group.position.set(side * (TRAY.w / 2 - 0.5), 0, -TRAY.d / 2 + 0.55);
    part(shapes().rod, paint(0x7a4f2a), { at: [0, 0.08, 0], size: [0.24, 0.3, 0.24], into: group }); // a barrel for a buoy
    part(shapes().rod, paint(0x24262b), { at: [0, 0.13, 0], size: [0.25, 0.04, 0.25], into: group });
    part(shapes().rod, paint(0x4a3524), { at: [0, 1.0, 0], size: [0.035, 1.7, 0.035], into: group });
    // Black for the Pirates, blue for the Navy.
    const cloth = decal((c, s) => {
      c.fillStyle = i === 0 ? '#17151c' : '#22467a';
      c.fillRect(0, 0, s, s);
      c.font = `${s * 0.6}px serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#f4f0e4';
      c.fillText(i === 0 ? '☠' : '⚓', s / 2, s * 0.54);
    });
    const shape = new THREE.PlaneGeometry(1.1, 0.7, 8, 1);
    const flag = part(shape, new THREE.MeshStandardMaterial({ map: cloth, side: THREE.DoubleSide, roughness: 0.9 }), { at: [0.57, 1.45, 0], into: group });
    flag.userData.rest = Float32Array.from(shape.attributes.position.array);
    scene.add(group);
    return { group, flag, seed: i * 2 };
  });
}

function flutter(t) {
  for (const f of flags) {
    const p = f.flag.geometry.attributes.position;
    const rest = f.flag.userData.rest;
    for (let i = 0; i < p.count; i++) {
      const along = (rest[i * 3] + 0.55) / 1.1;
      p.setZ(i, Math.sin(along * 6 - t * (5 + mood.storm * 5)) * 0.09 * along);
    }
    p.needsUpdate = true;
    f.group.rotation.z = Math.sin(t * 1.2 + f.seed) * 0.06; // the buoy rocking
  }
}

// ---------------------------------------------------------------------------
// A board: one side's waters
// ---------------------------------------------------------------------------

class Board {
  constructor(index, side) {
    const { cols, rows, open } = side.board;
    Object.assign(this, { index, id: side.id, cols, rows, open, wave: side.board.wave ?? 0 });
    this.tile = Math.min(BOARD / cols, BOARD / rows);
    this.cx = CENTRE[index];
    this.group = new THREE.Group();
    this.fog = new Map(); // tile -> its puff
    this.shown = new Map(); // tile -> { hit }
    this.parts = new Map(); // tile -> the model standing on it
    this.sunk = new Set(); // piece ids
    this.names = new Map(); // piece id -> name (once known)
    scene.add(this.group);

    const w = cols * this.tile;
    const d = rows * this.tile;
    // Chart lines, painted on the water.
    const pts = [];
    for (let x = 0; x <= cols; x++) pts.push(this.cx - w / 2 + x * this.tile, 0.07, -d / 2, this.cx - w / 2 + x * this.tile, 0.07, d / 2);
    for (let z = 0; z <= rows; z++) pts.push(this.cx - w / 2, 0.07, -d / 2 + z * this.tile, this.cx + w / 2, 0.07, -d / 2 + z * this.tile);
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.group.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0xf4e6c1, transparent: true, opacity: 0.42 })));

    // Letters along the far edge, numbers down the left: the same as on the phones.
    const label = (text, x, z) => {
      const m = part(shapes().flat, new THREE.MeshBasicMaterial({ map: labelTexture(text), transparent: true, depthWrite: false }), { at: [x, 0.09, z], size: [0.74, 1, 0.74], shadow: false, into: this.group });
      m.renderOrder = 2;
    };
    for (let x = 0; x < cols; x++) label(String.fromCharCode(65 + x), this.cx - w / 2 + (x + 0.5) * this.tile, -d / 2 - 0.42);
    for (let z = 0; z < rows; z++) label(String(z + 1), this.cx - w / 2 - 0.42, -d / 2 + (z + 0.5) * this.tile);

    if (!open) {
      for (let i = 0; i < cols * rows; i++) {
        const puff = fogPuff();
        puff.position.copy(this.pos(i));
        puff.scale.setScalar(this.tile * 1.02);
        puff.userData.drift = Math.random() * 6;
        this.group.add(puff);
        this.fog.set(i, puff);
      }
    }
  }

  /** The middle of a tile, on the water. */
  pos(tile, y = 0) {
    const col = tile % this.cols;
    const row = Math.floor(tile / this.cols);
    return new THREE.Vector3(this.cx + (col - (this.cols - 1) / 2) * this.tile, y, (row - (this.rows - 1) / 2) * this.tile);
  }

  /** Fog rolling in over the whole board (used when a battle starts). */
  rollIn(delay = 0) {
    for (const [i, puff] of this.fog) {
      const size = this.tile * 1.02;
      puff.scale.setScalar(0.001);
      tween(0.7, (k) => puff.scale.setScalar(Math.max(0.001, size * k)), { delay: delay + (i % this.cols) * 0.07 + Math.random() * 0.5, ease: backOut });
    }
  }

  /** Put the model for one tile of a piece on the board. */
  place(tile, piece, { pop = false } = {}) {
    if (this.parts.has(tile)) return this.parts.get(tile);
    let g;
    if (isKraken(piece.kind)) {
      g = krakenPart(piece);
    } else {
      const where = piece.seg === 0 ? 'bow' : piece.seg === piece.len - 1 ? 'stern' : 'mid';
      g = shipPart(where, liveryFor(this.id, this.names.get(piece.id)));
    }
    g.position.copy(this.pos(tile));
    g.rotation.y = piece.kind === 'head' || piece.kind === 'knob' ? 0 : (-piece.dir * Math.PI) / 2;
    g.scale.setScalar(this.tile);
    g.userData.piece = piece.id;
    g.userData.kraken = isKraken(piece.kind);
    this.group.add(g);
    this.parts.set(tile, g);

    if (pop) {
      const size = this.tile;
      tween(0.45, (k) => g.scale.setScalar(Math.max(0.001, size * k)), { ease: backOut });
    }
    return g;
  }

  /** Daub an X on a tile: red for a hit, a small ink one for a miss. */
  mark(tile, hit, { pop = false } = {}) {
    const m = part(shapes().flat, new THREE.MeshBasicMaterial({ map: hit ? crossTexture : missTexture, transparent: true, depthTest: !hit, depthWrite: false, opacity: hit ? 0.9 : 0.6 }), {
      at: this.pos(tile, 0.11).toArray(),
      size: [this.tile * (hit ? 0.98 : 0.7), 1, this.tile * (hit ? 0.98 : 0.7)],
      turn: [0, rand(-0.25, 0.25), 0],
      shadow: false,
      into: this.group,
    });
    m.renderOrder = hit ? 20 : 3;
    if (pop) {
      const size = m.scale.x;
      tween(0.3, (k) => m.scale.set(size * (3 - 2 * k), 1, size * (3 - 2 * k)), { ease: easeIn });
    }
  }

  setAlight(tile) {
    const g = this.parts.get(tile);
    if (!g || g.userData.flames) return;
    const flames = new THREE.Group();
    // Drawn after the painted X (which sits on top of everything else), so the fire still shows.
    const fire = (colour) => new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.96 });
    [[0xff7a1a, [0, 0.45, 0], [0.15, 0.5, 0.15]], [0xffe14a, [0.03, 0.4, 0.04], [0.085, 0.32, 0.085]], [0xff5a14, [-0.14, 0.36, -0.06], [0.1, 0.3, 0.1]]].forEach(([colour, at, size]) => {
      part(shapes().cone, fire(colour), { at, size, shadow: false, into: flames }).renderOrder = 30;
    });
    flames.userData = { seed: Math.random() * 9 };
    g.add(flames);
    g.userData.flames = flames;
    burning.add(flames);
  }

  /** Blow the fog off a tile. */
  clearFog(tile, instant) {
    const puff = this.fog.get(tile);
    if (!puff) return;
    this.fog.delete(tile);
    if (instant) return void this.group.remove(puff);
    const size = puff.scale.x;
    const y = puff.position.y;
    tween(0.55, (k) => {
      puff.scale.setScalar(Math.max(0.001, size * (1 + 0.5 * Math.sin(k * Math.PI) - k)));
      puff.position.y = y + k * 0.9;
    }, { ease: linear, done: () => this.group.remove(puff) });
  }

  /** Show what is on a tile. `quiet` means no animation (catching up with the server). */
  reveal(tile, hit, piece, quiet) {
    if (this.shown.has(tile)) return false;
    this.shown.set(tile, { hit });
    this.clearFog(tile, quiet);
    if (hit && piece) {
      this.place(tile, piece, { pop: !quiet && !this.open });
      if (!isKraken(piece.kind)) this.setAlight(tile);
    }
    this.mark(tile, hit, { pop: !quiet });
    return true;
  }

  /** A whole piece is finished: a ship rolls over and settles; a bit of Kraken slides under. */
  sink(piece, quiet) {
    if (this.sunk.has(piece.id)) return;
    this.sunk.add(piece.id);
    const kraken = isKraken(piece.kind);
    const lean = pick([-1, 1]) * rand(0.35, 0.6);
    piece.cells.forEach((tile, n) => {
      const g = this.parts.get(tile);
      if (!g) return;
      if (g.userData.flames) {
        burning.delete(g.userData.flames);
        g.remove(g.userData.flames);
        g.userData.flames = null;
      }
      g.userData.wreck = true;
      const y0 = g.position.y;
      const size = g.scale.x;
      const settle = (k) => {
        if (kraken) {
          g.position.y = y0 - k * 0.5 * this.tile;
          g.scale.setScalar(size * (1 - 0.45 * k));
        } else {
          g.rotation.x = lean * k;
          g.position.y = y0 - k * 0.2 * this.tile;
        }
      };
      if (quiet) return settle(1);
      // Thrash or shudder first, then go down.
      tween(2.2, (k, raw) => {
        settle(k);
        g.rotation.z = Math.sin(raw * 26) * 0.07 * (1 - raw);
      }, { delay: n * 0.12, ease: easeInOut });
      for (let i = 0; i < 3; i++) setTimeout(() => splash(this.pos(tile).add(new THREE.Vector3(rand(-0.3, 0.3), 0, rand(-0.3, 0.3))), 0.5), 300 + n * 120 + i * 450);
    });
    if (kraken) {
      // A slick of ink where it went down.
      for (const tile of piece.cells) {
        const ink = part(shapes().disc, new THREE.MeshBasicMaterial({ color: 0x1c0a22, transparent: true, opacity: 0.5, depthWrite: false }), { at: this.pos(tile, 0.08).toArray(), size: [this.tile * 0.5, 0.01, this.tile * 0.5], shadow: false, into: this.group });
        if (!quiet) tween(1.6, (k) => ink.scale.set(this.tile * 0.5 * k, 0.01, this.tile * 0.5 * k), { delay: 0.4 });
      }
    }
  }

  /** Make this board agree with what the server says, without any fuss. */
  catchUp(view, quiet = true) {
    for (const p of view.pieces) if (p.name) this.names.set(p.id, p.name);
    if (this.open) {
      // Everyone can see this fleet: put every ship out.
      for (const p of view.pieces) p.cells?.forEach((tile, seg) => this.place(tile, { id: p.id, kind: p.kind, seg, len: p.len, dir: p.dir }));
    }
    for (const t of view.tiles) this.reveal(t.i, t.hit, t.part, quiet);
    for (const p of view.pieces) if (p.sunk && p.cells) this.sink(p, quiet);
  }

  /** Ships sailing in from the edge of the board (the fleet in part two). */
  sailIn() {
    for (const g of this.parts.values()) {
      const home = g.position.clone();
      const from = home.clone().add(new THREE.Vector3(-9, 0, 0));
      g.position.copy(from);
      tween(2.6, (k) => g.position.lerpVectors(from, home, k), { delay: 0.3 + (g.userData.piece ?? 0) * 0.35, ease: easeOut });
    }
  }

  dispose() {
    for (const g of this.parts.values()) if (g.userData.flames) burning.delete(g.userData.flames);
    scene.remove(this.group);
  }
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** A puff of smoke (or anything round that swells and fades away by shrinking). */
function puff(at, { colour = 0xd9d4cc, size = 0.3, rise = 0.8, life = 1.1, drift = null, glow = 0 } = {}) {
  const m = part(shapes().ball, paint(colour, { glow, rough: 1 }), { at: at.toArray(), size: 0.01, shadow: false, into: scene });
  const d = drift ?? new THREE.Vector3(rand(-0.25, 0.25), rise, rand(-0.25, 0.25));
  const start = at.clone();
  tween(life, (k, raw) => {
    m.position.copy(start).addScaledVector(d, raw);
    m.scale.setScalar(Math.max(0.001, size * Math.sin(Math.min(1, raw * 1.15) * Math.PI) ** 0.6 * (0.6 + raw * 0.8)));
  }, { ease: linear, done: () => scene.remove(m) });
}

/** A flare of light that dies away (a gun going off inside the fog, a fire catching). */
function glow(at, colour, seconds, strength = 30) {
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
  // The column of water.
  const column = part(shapes().cone, white, { at: [at.x, 0, at.z], size: [0.22 * size, 0.01, 0.22 * size], shadow: false, into: scene });
  tween(0.75, (k, raw) => {
    const h = Math.sin(raw * Math.PI) * 1.5 * size;
    column.scale.set(0.22 * size * (1 + raw), Math.max(0.01, h), 0.22 * size * (1 + raw));
    column.position.y = h / 2;
  }, { ease: linear, done: () => scene.remove(column) });
  // The ring spreading out.
  const ring = part(shapes().ring, white, { at: [at.x, 0.08, at.z], size: 0.05, shadow: false, into: scene });
  tween(1.1, (k, raw) => {
    ring.scale.set(0.15 + k * 0.75 * size, Math.max(0.01, 1 - raw), 0.15 + k * 0.75 * size);
  }, { done: () => scene.remove(ring) });
  // Spray.
  for (let i = 0; i < Math.round(9 * size); i++) {
    const a = Math.random() * Math.PI * 2;
    const drop = part(shapes().ball, white, { size: rand(0.04, 0.09) * size, shadow: false });
    fling(drop, new THREE.Vector3(at.x, 0.1, at.z), new THREE.Vector3(Math.cos(a) * rand(0.5, 1.6), rand(2.5, 4.6) * Math.sqrt(size), Math.sin(a) * rand(0.5, 1.6)), rand(0.7, 1.0));
  }
}

function explosion(at, size = 1, debris = 0x6b4526) {
  const flash = part(shapes().ball, paint(0xffd45a, { glow: 3 }), { at: [at.x, 0.4, at.z], size: 0.01, shadow: false, into: scene });
  tween(0.42, (k, raw) => flash.scale.setScalar(Math.max(0.001, Math.sin(raw * Math.PI) * 0.75 * size)), { ease: linear, done: () => scene.remove(flash) });
  const burst = part(shapes().ball, paint(0xff6a1f, { glow: 1.8 }), { at: [at.x, 0.45, at.z], size: 0.01, shadow: false, into: scene });
  tween(0.6, (k, raw) => burst.scale.setScalar(Math.max(0.001, Math.sin(raw * Math.PI) ** 0.7 * 0.55 * size * (1 + raw))), { ease: linear, done: () => scene.remove(burst) });
  for (let i = 0; i < 7; i++) puff(new THREE.Vector3(at.x + rand(-0.2, 0.2), 0.4, at.z + rand(-0.2, 0.2)), { colour: pick([0x3c3835, 0x57514b, 0x2b2826]), size: rand(0.25, 0.5) * size, rise: rand(1.2, 2.2), life: rand(1.1, 1.9) });
  for (let i = 0; i < Math.round(12 * size); i++) {
    const a = Math.random() * Math.PI * 2;
    const plank = part(shapes().box, paint(debris), { size: [rand(0.12, 0.3), 0.03, 0.06] });
    fling(plank, new THREE.Vector3(at.x, 0.3, at.z), new THREE.Vector3(Math.cos(a) * rand(0.6, 2.4), rand(2.4, 5), Math.sin(a) * rand(0.6, 2.4)), rand(0.8, 1.2), rand(0.1, 0.35));
  }
  shake = Math.max(shake, 0.22 * size);
}

/** A burst of coloured sparks high over the sea, for when there is something to celebrate. */
function firework(at) {
  const colour = pick([0xf7c948, 0xe4572e, 0x17bebb, 0xf78fb3, 0x9bc53d, 0xffffff]);
  for (let i = 0; i < 26; i++) {
    const spark = part(shapes().ball, paint(colour, { glow: 2.2 }), { size: rand(0.05, 0.09), shadow: false });
    const dir = new THREE.Vector3(rand(-1, 1), rand(-0.4, 1), rand(-1, 1)).normalize().multiplyScalar(rand(1.6, 3.2));
    fling(spark, at, dir.add(new THREE.Vector3(0, 2.2, 0)), rand(1.0, 1.5));
  }
}

/** A line of text that pops up over a spot on the table and floats away. */
function callout(point, html, tone = '') {
  const el = document.createElement('div');
  el.className = `bb-callout ${tone}`;
  el.innerHTML = html;
  const { x, y } = onScreen(point);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  callouts.append(el);
  setTimeout(() => el.remove(), 2600);
}

function banner(text, sub, tone, seconds) {
  bannerEl.className = `bb-banner ${tone ?? ''}`;
  bannerEl.querySelector('b').textContent = text;
  bannerEl.querySelector('span').textContent = sub ?? '';
  bannerEl.hidden = false;
  bannerEl.style.animation = 'none';
  void bannerEl.offsetWidth; // start the entrance animation again
  bannerEl.style.animation = '';
  clearTimeout(banner.timer);
  banner.timer = setTimeout(() => (bannerEl.hidden = true), seconds * 1000);
}

function chipHtml(id) {
  const p = players.get(id);
  return p ? `<span class="chip" style="--c:${esc(p.color)}"><span class="face"><span>${esc(p.avatar)}</span></span><span class="nm">${esc(p.name)}</span></span>` : '';
}

// ---------------------------------------------------------------------------
// Things that happen in a volley
// ---------------------------------------------------------------------------

/**
 * Where a shot starts from. In the Kraken hunt the fleet is in plain view, so
 * a ship fires. In the battle the fleets are hidden, so the gun flashes from
 * somewhere in that side's fog: a tile picked at random, which gives nothing away.
 */
function muzzleFor(event) {
  const board = boards[event.from];
  const ships = [...board.parts.values()].filter((g) => !g.userData.wreck);
  if (board.open && ships.length) return pick(ships).position.clone().setY(0.4 * board.tile);
  const fogged = [...board.fog.keys()];
  const tile = fogged.length ? pick(fogged) : Math.floor(Math.random() * board.cols * board.rows);
  return board.pos(tile, 0.45 * board.tile);
}

function fireShot(event, late) {
  const dur = event.dur / 1000;
  const board = boards[event.target];
  if (!board) return;
  const target = board.pos(event.tile);
  if (late > event.dur) return void land(event, board, target, true); // we missed it (the page was reloaded): just show the result

  const from = muzzleFor(event);
  const dir = Math.sign(target.x - from.x) || 1;
  const fuse = dur * 0.12;
  const flight = dur * (IMPACT - 0.12);
  sound.play('bbFuse');
  for (let i = 0; i < 3; i++) setTimeout(() => puff(from, { colour: 0xffd45a, size: 0.07, rise: 0.4, life: 0.25, glow: 2 }), i * 50);

  tween(0.001, () => {}, {
    delay: fuse,
    done: () => {
      sound.play('bbCannon', { level: rand(0.8, 1) });
      sound.play('bbWhistle', { level: 0.9 });
      shake = Math.max(shake, 0.1);
      // Flash and smoke.
      puff(from, { colour: 0xffe9a0, size: 0.5, rise: 0.1, life: 0.2, glow: 3 });
      for (let i = 0; i < 6; i++) puff(from.clone().add(new THREE.Vector3(dir * rand(0, 0.5), rand(0, 0.2), rand(-0.2, 0.2))), { size: rand(0.25, 0.5), life: rand(1, 1.8), drift: new THREE.Vector3(dir * rand(0.3, 1.4), rand(0.3, 0.9), rand(-0.3, 0.3)) });
      glow(from, 0xffb347, 0.5); // the fog lit up from inside
      setTimeout(() => sound.play('bbReload', { level: 0.5 }), 900);
      // The ball.
      const ball = part(shapes().ball, paint(0x1b1b1f, { rough: 0.4 }), { at: from.toArray(), size: 0.11, into: scene });
      const peak = 2.4 + from.distanceTo(target) * 0.12;
      let trail = 0;
      tween(flight, (k, raw) => {
        ball.position.lerpVectors(from, target, raw);
        ball.position.y = from.y + (target.y - from.y) * raw + Math.sin(raw * Math.PI) * peak;
        if (raw > trail) {
          trail = raw + 0.09;
          puff(ball.position, { size: 0.09, rise: 0.15, life: 0.5 });
        }
      }, { ease: linear, done: () => {
        scene.remove(ball);
        land(event, board, target, false);
      } });
    },
  });
}

/** A ball (or a tentacle) arrives on a tile. */
function land(event, board, target, quiet) {
  const fresh = board.reveal(event.tile, event.hit, event.part, quiet);
  if (event.sunk) {
    board.names.set(event.sunk.id, event.sunk.name);
    board.sink(event.sunk, quiet);
  }
  if (quiet || !fresh) return;

  const above = target.clone().setY(0.9);
  const who = event.by ? chipHtml(event.by) : '';
  const kraken = isKraken(event.part?.kind);
  sound.play('bbFog', { level: 0.6 });

  if (!event.hit) {
    splash(target, event.type === 'strike' ? 1.5 : 1);
    if (event.type !== 'strike') sound.play('bbSplash');
    if (event.drinks) {
      callout(above, `${who}<span class="what">misses${event.auto ? ' (wild shot)' : ''}. Swig! 🍺</span>`, 'bad');
      setTimeout(() => sound.play('bbSwig', { level: 0.55 }), 650);
    } else if (event.type === 'shot') {
      callout(above, `${who}<span class="what">💦 just water</span>`, 'plain');
    }
    return;
  }

  explosion(target, event.sunk ? 1.5 : 1, kraken ? KRAKEN.dark : 0x6b4526);
  if (kraken) {
    sound.play(event.sunk ? 'bbSever' : 'bbScreech');
    sound.play('bbSplash', { level: 0.5 });
    for (let i = 0; i < 6; i++) puff(above.clone().setY(0.3), { colour: 0x2a1030, size: rand(0.2, 0.4), rise: rand(0.5, 1.2), life: rand(0.8, 1.4) }); // ink
    const what = event.sunk?.kind === 'knob' ? '🎯 hits its knob! Bonus!' : event.sunk ? (event.sunk.kind === 'head' ? '💥 smashes its head!' : '💥 severs a tentacle!') : '💥 hits the Kraken!';
    callout(above, `${who}<span class="what">${what}</span>`, 'good');
  } else {
    if (event.type !== 'strike') sound.play('bbHit');
    setTimeout(() => sound.play('bbCrackle', { level: 0.7 }), 350);
    if (event.type === 'shot') callout(above, `${who}<span class="what">💥 ${event.sunk ? `sinks ${esc(event.sunk.name)}!` : 'a hit!'}</span>`, 'good');
  }
  if (event.sunk && !kraken) {
    setTimeout(() => sound.play('bbSink'), 500);
    setTimeout(() => sound.play(event.type === 'strike' ? 'bbRoar' : 'bbCheer', { level: 0.8 }), 900);
  }
  if (event.type === 'strike' && event.lost) setTimeout(() => callout(above, `${chipHtml(event.lost)}<span class="what">💀 goes down with her</span>`, 'bad'), 900);
}

/** The Kraken lashes out: a tentacle comes up beside a tile and is brought down on it. */
function krakenStrike(event, late) {
  const dur = event.dur / 1000;
  const board = boards[event.target];
  if (!board) return;
  const target = board.pos(event.tile);
  if (late > event.dur) return void land(event, board, target, true);

  const reach = 4.3;
  const angle = rand(0, Math.PI * 2);
  const base = target.clone().add(new THREE.Vector3(Math.cos(angle) * reach * 0.62, 0, Math.sin(angle) * reach * 0.62));
  base.x = Math.max(-TRAY.w / 2 + 0.6, Math.min(TRAY.w / 2 - 0.6, base.x));
  base.z = Math.max(-TRAY.d / 2 + 0.5, Math.min(TRAY.d / 2 - 0.5, base.z));
  const arm = makeTentacle({ beads: 18, thick: 0.46, thin: 0.1, length: reach });
  arm.position.copy(base).setY(-reach);
  arm.rotation.y = Math.atan2(-(target.z - base.z), target.x - base.x); // lean towards the tile
  scene.add(arm);

  const up = dur * 0.34;
  const hold = dur * 0.2;
  const down = dur * IMPACT - up - hold;
  sound.play('bbTentacle');
  splash(base, 1.2);
  let life = 0;
  const pose = { bend: 0.15, curl: -0.5 };
  actors.add({
    update(dt) {
      life += dt;
      arm.pose(pose.bend, pose.curl, 0.16, life * 5);
      return arm.parent !== null;
    },
  });
  tween(up, (k) => (arm.position.y = -reach + reach * k - 0.2), { ease: backOut });
  tween(hold, (k) => (pose.bend = 0.15 - 0.35 * k), { delay: up, ease: easeInOut }); // rears back
  tween(down, (k) => {
    pose.bend = -0.2 + 2.05 * k;
    pose.curl = -0.5 + 0.9 * k;
  }, { delay: up + hold, ease: easeIn, done: () => {
    sound.play('bbSlam', { level: 1 });
    setTimeout(() => {
      // bbSlam has a third of a second of whoosh before the blow; the picture is already there, so add the wood now.
      if (event.hit) sound.play('bbHit');
    }, 60);
    shake = Math.max(shake, 0.35);
    land(event, board, target, false);
    splash(target, 1.3);
    if (event.hit) callout(target.clone().setY(1.4), '<span class="what">🐙 Everyone drinks! 🍺</span>', 'bad');
    if (event.hit) setTimeout(() => sound.play('bbToast', { level: 0.6 }), 800);
    // And back under.
    tween(dur * 0.26, (k) => {
      arm.position.y = -0.2 - reach * 1.05 * k;
      pose.bend = 1.85 - 0.6 * k;
    }, { delay: dur * 0.05, ease: easeIn, done: () => scene.remove(arm) });
  } });
}

// ----- playing a volley's timeline -----

let volley = null; // { id, t0, events, next }

function runTimeline() {
  if (!volley) return;
  const now = serverNow() - volley.t0;
  while (volley.next < volley.events.length && volley.events[volley.next].at <= now) {
    const event = volley.events[volley.next++];
    const late = now - event.at;
    if (event.type === 'shot') fireShot(event, late);
    else if (event.type === 'strike') krakenStrike(event, late);
    else if (event.type === 'banner' && late < event.dur) {
      banner(event.text, event.sub, event.tone, (event.dur - late) / 1000);
      if (event.tone === 'drink') sound.play('bbToast');
      if (event.text === 'The Kraken strikes!') {
        sound.play('bbRoar');
        lightning();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Set pieces: the Kraken arriving, and the two endings
// ---------------------------------------------------------------------------

let cast = []; // big models that belong to a set piece, cleared away when the scene moves on

function clearCast() {
  for (const m of cast) scene.remove(m);
  cast = [];
}

let bolt = 0; // extra light from a flash of lightning

function lightning() {
  tween(0.5, (k, raw) => (bolt = raw < 1 ? 9 * Math.max(0, Math.sin(raw * 19)) * (1 - raw) : 0), { ease: linear });
  setTimeout(() => sound.play('bbThunder', { level: 0.9 }), rand(200, 700));
}

/** A big tentacle that rises, waves about for a while, and goes back under. */
function wavingArm(at, { delay = 0, stay = 5, length = 4.4, lean = 0.5 } = {}) {
  const arm = makeTentacle({ beads: 18, thick: 0.42, thin: 0.08, length });
  arm.position.copy(at).setY(-length - 0.5);
  arm.rotation.y = rand(0, Math.PI * 2);
  scene.add(arm);
  cast.push(arm);
  let life = -delay;
  const seed = Math.random() * 9;
  let wet = false;
  actors.add({
    update(dt) {
      life += dt;
      if (life < 0) return true;
      if (!wet) {
        wet = true;
        splash(at, 1.4);
        sound.play('bbTentacle', { level: 0.8 });
      }
      const up = Math.min(1, life / 1.1);
      const down = Math.max(0, (life - stay) / 1.0);
      arm.position.y = -length - 0.5 + (length + 0.3) * backOut(up) - (length + 0.5) * easeIn(Math.min(1, down));
      arm.pose(lean + Math.sin(life * 1.7 + seed) * 0.5, 1.2 + Math.sin(life * 1.1 + seed) * 0.9, 0.22, life * 4 + seed);
      arm.rotation.y += dt * 0.25;
      if (down >= 1) scene.remove(arm);
      return down < 1;
    },
  });
}

function krakenRises() {
  clearCast();
  const lair = boards[1];
  const centre = new THREE.Vector3(lair.cx, 0, 0);
  // The fog holds off until the beast has shown itself and gone back under.
  for (const puffMesh of lair.fog.values()) puffMesh.scale.setScalar(0.001);
  boards[0].sailIn();

  sound.play('bbRumble');
  tween(3, (k, raw) => (shake = Math.max(shake, 0.05 + raw * 0.12)), { ease: linear });
  for (let i = 0; i < 16; i++) setTimeout(() => splash(centre.clone().add(new THREE.Vector3(rand(-3, 3), 0, rand(-3, 3))), rand(0.3, 0.7)), 400 + i * 160);

  // Arms first, all round the lair...
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    wavingArm(centre.clone().add(new THREE.Vector3(Math.cos(a) * 3.1, 0, Math.sin(a) * 2.7)), { delay: 2.6 + i * 0.28, stay: 5.6 - i * 0.2 });
  }
  // ...then the head.
  const head = krakenHead(2.5);
  head.position.copy(centre).setY(-5);
  scene.add(head);
  cast.push(head);
  let life = 0;
  let roared = false;
  actors.add({
    update(dt) {
      life += dt;
      const up = Math.max(0, Math.min(1, (life - 3.6) / 1.3));
      const down = Math.max(0, Math.min(1, (life - 8.2) / 1.4));
      head.position.y = -5 + 4.6 * backOut(up) - 5 * easeIn(down) + Math.sin(life * 2) * 0.08;
      head.rotation.y = Math.sin(life * 0.9) * 0.3;
      head.rotation.z = Math.sin(life * 1.3) * 0.06;
      if (up > 0 && !roared) {
        roared = true;
        sound.play('bbRoar', { level: 1 });
        splash(centre, 2.4);
        lightning();
        setTimeout(lightning, 1900);
      }
      if (down >= 1) scene.remove(head);
      return down < 1;
    },
  });
  setTimeout(() => {
    if (boards[1] !== lair) return;
    sound.play('bbSplash');
    sound.play('bbGust', { level: 0.8 });
    lair.rollIn(0.3);
  }, 9300);
}

/** The Kraken's great wave: a wall of water rolls right across its lair, and the fog comes back behind it. */
function greatWave() {
  const lair = boards[1];
  if (!lair) return;
  const w = lair.cols * lair.tile;
  const d = lair.rows * lair.tile;
  const wall = new THREE.Group();
  const sea = paint(0x2b8da0, { rough: 0.2 });
  const foam = paint(0xeef8fa, { rough: 0.6 });
  part(shapes().round, sea, { at: [0, 0, 0], size: [0.9, 2.3, d * 0.62], into: wall });
  part(shapes().round, sea, { at: [0.45, 1.6, 0], size: [0.7, 0.8, d * 0.6], into: wall }); // the lip, curling forward
  for (let z = -d / 2; z <= d / 2; z += 0.55) part(shapes().ball, foam, { at: [0.8, 1.75 + rand(-0.15, 0.15), z], size: rand(0.22, 0.36), shadow: false, into: wall });
  const x0 = lair.cx - w / 2 - 1.4;
  const x1 = lair.cx + w / 2 + 1.4;
  wall.position.set(x0, -2.6, 0);
  scene.add(wall);
  cast.push(wall);

  sound.play('bbRoar', { level: 0.8 });
  sound.play('bbRumble');
  setTimeout(() => sound.play('bbGust', { level: 0.9 }), 300);
  lightning();
  const dur = 2.4;
  let life = 0;
  let spray = 0;
  actors.add({
    update(dt) {
      life += dt;
      const k = Math.min(1, life / dur);
      wall.position.x = x0 + (x1 - x0) * easeInOut(k);
      wall.position.y = -2.6 + 2.7 * Math.pow(Math.sin(Math.PI * k), 0.4); // up out of the sea, across, and down again
      shake = Math.max(shake, 0.12 * Math.sin(Math.PI * k));
      spray -= dt;
      if (spray <= 0 && k > 0.05 && k < 0.95) {
        spray = 0.12;
        splash(new THREE.Vector3(wall.position.x + 0.5, 0, rand(-d / 2, d / 2)), rand(0.6, 1.1));
      }
      if (k >= 1) {
        scene.remove(wall);
        sound.play('bbSplash');
      }
      return k < 1;
    },
  });
}

function victory() {
  clearCast();
  const lair = boards[1];
  sound.play('bbKrakenDeath');
  for (let i = 0; i < 5; i++) {
    const at = lair.pos(Math.floor(Math.random() * lair.cols * lair.rows));
    wavingArm(at, { delay: i * 0.3, stay: 2.6, length: 3.4, lean: 1.1 });
  }
  setTimeout(() => sound.play('bbSalute'), 4200);
  setTimeout(() => sound.play('finale'), 5600);
  for (let i = 0; i < 14; i++) {
    setTimeout(() => {
      if (current?.mode !== 'victory') return;
      firework(new THREE.Vector3(rand(-9, 9), rand(2.5, 4.5), rand(-3, 2)));
      if (i % 3 === 0) sound.play('bbDistant', { level: 0.9 });
    }, 4400 + i * 620);
  }
}

function defeat() {
  clearCast();
  sound.play('bbRoar');
  setTimeout(() => sound.play('bbDoom'), 1500);
  lightning();
  const sea = boards[0];
  for (let i = 0; i < 7; i++) {
    const at = sea.pos(Math.floor(Math.random() * sea.cols * sea.rows));
    wavingArm(at, { delay: 0.4 + i * 0.5, stay: 30, length: rand(3, 4.6) });
  }
}

function salute(winner) {
  // The winning side fires blank charges out of its fog for joy, and up go the fireworks.
  const index = boards.findIndex((b) => b.id === winner);
  sound.play('bbCheer');
  const board = boards[index];
  for (let n = 0; board && n < 5; n++) {
    setTimeout(() => {
      if (current?.mode !== 'won') return;
      const from = muzzleFor({ from: index });
      sound.play('bbCannon', { level: 0.55 });
      glow(from, 0xffb347, 0.5);
      puff(from, { colour: 0xffe9a0, size: 0.5, rise: 0.1, life: 0.2, glow: 3 });
      for (let i = 0; i < 5; i++) puff(from, { size: rand(0.25, 0.5), life: rand(1, 1.8), drift: new THREE.Vector3(rand(-0.6, 0.6), rand(0.5, 1.2), rand(-0.3, 0.3)) });
    }, 900 + n * 420);
  }
  for (let i = 0; i < 9; i++) {
    setTimeout(() => {
      if (current?.mode === 'won') firework(new THREE.Vector3(index < 0 ? rand(-9, 9) : (index === 0 ? -1 : 1) * rand(1, 9), rand(2.5, 4.5), rand(-3, 2)));
    }, 1500 + i * 600);
  }
}

// ---------------------------------------------------------------------------
// The frame loop
// ---------------------------------------------------------------------------

const sunLevel = () => 2.6 - mood.storm * 1.5;
let nextAmbient = 0;

function ambience(dt) {
  nextAmbient -= dt;
  if (nextAmbient > 0 || current?.paused) return;
  if (current?.phase === 2) {
    nextAmbient = rand(2.2, 4.5);
    sound.play('bbGust', { level: 0.5, ambience: true });
    if (Math.random() < 0.22 && current.mode !== 'rise') lightning();
  } else {
    nextAmbient = rand(5, 10);
    if (current?.mode === 'aim') sound.play(pick(['bbDistant', 'bbFlag', 'creak', 'bbDistant', 'wave']), { level: 0.5, ambience: true });
  }
}

function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
  lastFrame = now;
  clock += dt;

  runTimeline();
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
  for (const actor of actors) if (actor.update(dt) === false) actors.delete(actor);

  // The weather drifts towards whatever the story calls for.
  mood.storm += (mood.target - mood.storm) * Math.min(1, dt * 0.7);
  sky.intensity = 1.25 - mood.storm * 0.75;
  sky.color.setRGB(1 - mood.storm * 0.45, 0.945 - mood.storm * 0.35, 0.85 - mood.storm * 0.05);
  sun.intensity = sunLevel() + bolt;
  scene.background.setRGB(0.165 - mood.storm * 0.1, 0.11 - mood.storm * 0.06, 0.07 - mood.storm * 0.01);

  waves(clock);
  flutter(clock);
  if (candleLight) {
    const flicker = 0.85 + 0.15 * Math.sin(clock * 13) * Math.sin(clock * 7.3);
    candleLight.intensity = 60 * flicker;
    candleFlame.scale.y = 0.6 * flicker;
  }
  for (const board of boards) {
    for (const p of board.fog.values()) p.position.y = Math.sin(clock * 0.8 + p.userData.drift) * 0.035;
    for (const g of board.parts.values()) {
      if (g.userData.arm && !g.userData.wreck) poseArm(g, clock);
      else if (!g.userData.wreck && !g.userData.kraken) {
        g.position.y = Math.sin(clock * 1.3 + g.userData.piece * 1.7) * 0.02 * (1 + mood.storm * 1.5);
        g.rotation.x = Math.sin(clock * 1.1 + g.userData.piece * 2.3) * 0.035 * (1 + mood.storm * 2);
      }
    }
  }
  for (const flames of burning) {
    const s = flames.userData;
    flames.children.forEach((flame, i) => {
      const f = 0.8 + 0.3 * Math.sin(clock * (11 + i * 3) + s.seed + i);
      flame.scale.y = [0.5, 0.32, 0.3][i] * f;
      flame.position.y = 0.22 + flame.scale.y / 2;
    });
  }
  ambience(dt);

  // A slow drift of the camera, plus whatever the guns have shaken loose.
  shake *= Math.max(0, 1 - dt * 5);
  aimCamera(Math.sin(clock * 0.21) * 0.25 + rand(-1, 1) * shake, rand(-1, 1) * shake);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// The two functions host.js calls
// ---------------------------------------------------------------------------

/** Draw (or update) the diorama for a Bombard view. */
export function show(view, playerMap) {
  if (!layer) init();
  players = playerMap;
  current = view;
  if (layer.hidden) {
    layer.hidden = false;
    fit();
  }
  if (!running) {
    running = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  // New boards when the battle changes (part one to part two, or a new game).
  const key = view.sides.map((s) => `${view.phase}:${s.id}:${s.board.cols}x${s.board.rows}`).join('|');
  const fresh = key !== boardsKey;
  if (fresh) {
    boardsKey = key;
    for (const b of boards) b.dispose();
    clearCast();
    tweens.clear();
    actors.clear();
    callouts.replaceChildren();
    volley = null;
    boards = view.sides.map((side, i) => new Board(i, side));
    buildFlags(view.phase);
  } else {
    // After the Kraken's great wave its board has been wiped and everything moved: start it afresh under new fog.
    view.sides.forEach((side, i) => {
      if ((side.board.wave ?? 0) === boards[i].wave) return;
      boards[i].dispose();
      boards[i] = new Board(i, side);
      boards[i].rollIn(0.1);
    });
  }
  view.sides.forEach((side, i) => boards[i].catchUp(side.board, true));
  mood.target = view.phase === 2 ? (view.mode === 'victory' ? 0.15 : 1) : 0;

  // A volley to play?
  if (view.volley && view.volley.id !== volley?.id) {
    volley = { ...view.volley, next: 0 };
    if (serverNow() - volley.t0 < 1200) {
      sound.play('bbReady');
      banner('Fire!', null, 'fire', 1.5);
    }
  } else if (!view.volley) {
    volley = null;
  }

  // Things that happen once, when the scene changes.
  if (view.key !== shownKey) {
    const first = shownKey === null;
    shownKey = view.key;
    if (view.mode !== 'volley') bannerEl.hidden = true;
    if (view.mode === 'sides' && fresh) boards.forEach((b, i) => b.rollIn(1.2 + i * 0.5));
    if (view.mode === 'rise' && fresh) krakenRises();
    if (view.mode === 'wave' && !first) greatWave();
    if (view.mode === 'aim') {
      // If a set piece was cut short (someone pressed Skip), clear it away and make sure the fog is in.
      clearCast();
      settleFog();
    }
    if (view.mode === 'won' && !first) salute(view.winner);
    if (view.mode === 'victory') victory();
    if (view.mode === 'defeat') defeat();
  }
}

/** Any fog still waiting to roll in gets put in place (the game has moved on to aiming). */
function settleFog() {
  for (const b of boards) {
    for (const p of b.fog.values()) {
      if (p.scale.x < b.tile * 0.5) {
        const size = b.tile * 1.02;
        const from = p.scale.x;
        tween(0.5, (k) => p.scale.setScalar(Math.max(from, size * k)));
      }
    }
  }
}

/** Put the diorama away (another screen is showing). */
export function hide() {
  if (!layer || layer.hidden) return;
  layer.hidden = true;
  running = false;
  for (const b of boards) b.dispose();
  boards = [];
  boardsKey = null;
  shownKey = null;
  volley = null;
  current = null;
  clearCast();
  tweens.clear();
  actors.clear();
  burning.clear();
  callouts.replaceChildren();
  bannerEl.hidden = true;
  mood.storm = mood.target = 0;
}
