// LiAARRRRGH's Dice on the big screen: a tabletop diorama drawn in 3D with
// three.js. An oval gaming tray on a tavern table, a leather cup for every
// pirate, and the bid chalked on the baize in the middle.
//
// host.js draws the words (the bid along the top, the stamps); this file owns
// the model on the table, the name plates round it, and everything that moves.
//
// How it fits together
// --------------------
// * show(view) is called every time the server sends a new view. It compares
//   the view with what is already on the table and acts out the difference:
//   a new round deals the cups, a new bid is chalked up, a seat whose dice have
//   arrived has its cup lifted, a result flicks the loser's die off the table.
// * Everything that moves is a "tween": a little function called every frame
//   with a number going from 0 to 1.
//
// World units: the tray is about 15 wide. x runs left to right, y is up, z
// comes towards the camera. The baize is at y = 0.

import * as THREE from './vendor/three.module.min.js';
import { esc } from './common.js';
import { dieBack, bidTag } from './liars-play.js';
import './liars-sound.js';

const TRAY = { a: 7.6, b: 4.7 }; // the oval tray: half its width, half its depth
const CUPS = 0.77; // how far out from the middle the cups sit (1 = the rail)
const NAMES = 1.23; // ...and the name plates
const TABLE = -0.45; // the height of the tavern table the tray sits on
const DIE = 0.8; // a die, at its biggest

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeIn = (k) => k ** 3;
const backOut = (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;
const linear = (k) => k;

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

let layer = null; // the <div> that holds the canvas and the name plates drawn over it
let labelsEl, renderer, scene, camera, sun, candleFlame, candleLight, ring, turnLamp, flash;
let running = false;
let lastFrame = 0;
let clock = 0;
let shake = 0;
let players = new Map();

const tweens = new Set();
const cam = { target: new THREE.Vector3(0, 0, 0.2), dist: 30, elevation: 1.0 };

// What is on the table right now.
let roundKey = null;
let seats = new Map(); // id -> { id, index, pos, tangent, cup, dice: [], label, lifted, dieSize }
let seatsKey = '';
let marks = []; // the chalk outlines in the middle, one per die bid
let claim = { q: 0, f: 0, n: -1, size: 1, spot: () => new THREE.Vector3(), found: 0 };
let acted = { call: false, result: false, sunk: false };
let turnSeat = null;

/** Run fn(eased, raw) every frame for `dur` seconds. */
function tween(dur, fn, { delay = 0, ease = easeOut, done = null } = {}) {
  const tw = { t: -delay, dur: Math.max(0.001, dur), fn, ease, done };
  tweens.add(tw);
  return tw;
}

// ----- paint and parts -----

const paints = new Map();
/** A pot of paint. Everything is flat-shaded, so the models look hand-carved. */
function paint(color, { glow = 0, rough = 0.75 } = {}) {
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
  SHAPES.cone = new THREE.ConeGeometry(1, 1, 7);
  SHAPES.disc = new THREE.CylinderGeometry(1, 1, 1, 20);
  SHAPES.oval = new THREE.CylinderGeometry(1, 1, 1, 64);
  SHAPES.flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  SHAPES.cup = new THREE.CylinderGeometry(0.5, 0.68, 1.05, 14);
  SHAPES.band = new THREE.CylinderGeometry(0.7, 0.73, 0.17, 14);
  SHAPES.cap = new THREE.CylinderGeometry(0.53, 0.53, 0.07, 14);
  SHAPES.halo = new THREE.RingGeometry(0.92, 1.12, 40).rotateX(-Math.PI / 2);
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

/** A point on the oval, `k` of the way out from the middle. Angle 0 is the far side; it runs clockwise as the TV sees it. */
const onOval = (angle, k = 1, y = 0) => new THREE.Vector3(Math.sin(angle) * TRAY.a * k, y, -Math.cos(angle) * TRAY.b * k);

/** Where a seat's name plate goes: outside the rail, and a little further back on the far side, where the table is foreshortened. */
function nameSpot(angle) {
  const p = onOval(angle, NAMES);
  if (p.z < 0) p.z *= 1.14;
  return p;
}

// ----- dice -----

// Where the spots go on each face (the same layout as the dice on the phones).
const SPOTS = {
  1: [[50, 50]],
  2: [[29, 29], [71, 71]],
  3: [[27, 27], [50, 50], [73, 73]],
  4: [[29, 29], [71, 29], [29, 71], [71, 71]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[29, 25], [71, 25], [29, 50], [71, 50], [29, 75], [71, 75]],
};

function rounded(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

const faceTextures = new Map();
function faceTexture(n) {
  if (!faceTextures.has(n)) {
    faceTextures.set(n, decal((c, s) => {
      const u = s / 100;
      c.fillStyle = '#cdbb8e'; // the worn edge of the die
      c.fillRect(0, 0, s, s);
      c.fillStyle = '#fbf2d8';
      rounded(c, 4 * u, 4 * u, 92 * u, 92 * u, 16 * u);
      c.fill();
      c.fillStyle = n === 1 ? '#c8372d' : '#2b1b0f';
      for (const [x, y] of SPOTS[n]) {
        c.beginPath();
        c.arc(x * u, y * u, (n === 1 ? 14 : 10) * u, 0, Math.PI * 2);
        c.fill();
      }
    }, 128));
  }
  return faceTextures.get(n);
}

// A box's six sides, in the order three.js paints them: +x, -x, +y, -y, +z, -z.
// Opposite sides of a die add up to seven.
const SIDES = [2, 5, 1, 6, 3, 4];
// How to turn the die so that each number is on top.
const TOP = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 2: [0, 0, Math.PI / 2], 5: [0, 0, -Math.PI / 2], 3: [-Math.PI / 2, 0, 0], 4: [Math.PI / 2, 0, 0] };

const diceSkins = new Map();
/**
 * The six painted sides of a die showing `value`: 'hit' (it counts, so it glows)
 * or 'dim' (it doesn't). The side that is face up is painted brighter than the
 * rest, so the number that matters is the one you read from across the room.
 */
function skin(kind, value) {
  const key = `${kind}:${value}`;
  if (!diceSkins.has(key)) {
    diceSkins.set(key, SIDES.map((n) => {
      const top = n === value;
      const colour = kind === 'hit' ? (top ? 0xffffff : 0xd9b46a) : top ? 0xcfc6b2 : 0x8f8674;
      return new THREE.MeshStandardMaterial({ map: faceTexture(n), roughness: 0.5, color: colour, emissive: kind === 'hit' ? 0xffa21f : 0x000000, emissiveIntensity: kind === 'hit' ? (top ? 0.22 : 0.4) : 0 });
    }));
  }
  return diceSkins.get(key);
}

const UP = new THREE.Vector3(0, 1, 0);
function makeDie(value, kind) {
  const mesh = new THREE.Mesh(shapes().box, skin(kind, value));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.top = new THREE.Quaternion().setFromEuler(new THREE.Euler(...TOP[value]));
  spin(mesh, rand(-0.25, 0.25));
  return mesh;
}

/** Turn a die about the vertical, keeping its number on top. */
function spin(mesh, yaw) {
  mesh.quaternion.setFromAxisAngle(UP, yaw).multiply(mesh.userData.top);
}

const chalkTextures = new Map();
/** A die face scrawled on the baize in chalk: the outline of one die the bid says is out there somewhere. */
function chalkTexture(n) {
  if (!chalkTextures.has(n)) {
    chalkTextures.set(n, decal((c, s) => {
      const u = s / 100;
      c.strokeStyle = 'rgba(255,255,255,0.9)';
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.lineCap = 'round';
      // Go round the outline a few times with a shaky hand.
      for (let pass = 0; pass < 3; pass++) {
        c.lineWidth = rand(2, 4) * u;
        c.globalAlpha = rand(0.35, 0.7);
        rounded(c, (9 + rand(-1.5, 1.5)) * u, (9 + rand(-1.5, 1.5)) * u, 82 * u, 82 * u, 15 * u);
        c.stroke();
      }
      c.globalAlpha = 0.85;
      for (const [x, y] of SPOTS[n]) {
        c.beginPath();
        c.arc((x + rand(-1, 1)) * u, (y + rand(-1, 1)) * u, 8 * u, 0, Math.PI * 2);
        c.fill();
      }
    }, 128));
  }
  return chalkTextures.get(n);
}

// ----- setting up -----

function init() {
  shapes();
  layer = document.createElement('div');
  layer.id = 'ldLayer';
  layer.hidden = true;
  layer.innerHTML = '<div class="ld-vignette"></div><div class="ld-labels"></div>';
  document.getElementById('stage').before(layer);
  labelsEl = layer.querySelector('.ld-labels');

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  layer.prepend(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d130c);
  camera = new THREE.PerspectiveCamera(28, 16 / 9, 1, 200);

  // A dim tavern: a little light from everywhere, a lamp overhead, and a candle on the table.
  scene.add(new THREE.HemisphereLight(0xffe6c0, 0x3a2a1c, 0.75));
  sun = new THREE.DirectionalLight(0xffdfb0, 2.1);
  sun.position.set(-7, 17, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 11, bottom: -11, near: 1, far: 60 });
  sun.shadow.bias = -0.0006;
  sun.shadow.radius = 5;
  scene.add(sun);

  // The glow under whoever's turn it is, and the lamp that follows them round the table.
  ring = new THREE.Mesh(shapes().halo, new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0, depthWrite: false }));
  ring.position.y = 0.02;
  scene.add(ring);
  turnLamp = new THREE.PointLight(0xffc266, 0, 6, 1.5);
  scene.add(turnLamp);
  // ...and one over the middle, for big moments.
  flash = new THREE.PointLight(0xffffff, 0, 16, 1.4);
  flash.position.set(0, 3.2, 0);
  scene.add(flash);

  buildTable();
  buildProps();
  window.addEventListener('resize', fit);
  fit();
}

function buildTable() {
  // The tavern table: planks, drawn once onto a canvas.
  const wood = decal((c, s) => {
    c.fillStyle = '#4f3520';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) {
      c.fillStyle = ['#573b24', '#4b321e', '#5d4129', '#523722'][i];
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
  const top = part(shapes().flat, new THREE.MeshStandardMaterial({ map: wood, roughness: 0.85 }), { at: [0, TABLE, 0], size: [90, 1, 60], into: scene });
  top.castShadow = false;

  // The tray: a dark wooden base, green baize, and a rail of short lengths bent round it.
  const { a, b } = TRAY;
  part(shapes().oval, paint(0x3a2414, { rough: 0.65 }), { at: [0, TABLE / 2 - 0.02, 0], size: [a + 0.5, -TABLE - 0.04, b + 0.5], into: scene });
  const baize = part(shapes().oval, new THREE.MeshStandardMaterial({ color: 0x1e5c45, roughness: 1 }), { at: [0, -0.05, 0], size: [a + 0.1, 0.1, b + 0.1], into: scene });
  baize.castShadow = false;

  const rail = paint(0x4a2e18, { rough: 0.55 });
  const brass = paint(0xd9a441, { rough: 0.35 });
  const lengths = 72;
  for (let i = 0; i < lengths; i++) {
    const angle = (i / lengths) * Math.PI * 2;
    const here = onOval(angle, 1, 0.14);
    here.x += Math.sin(angle) * 0.28;
    here.z -= Math.cos(angle) * 0.28;
    const next = onOval(angle + (Math.PI * 2) / lengths, 1, 0.14);
    next.x += Math.sin(angle + (Math.PI * 2) / lengths) * 0.28;
    next.z -= Math.cos(angle + (Math.PI * 2) / lengths) * 0.28;
    const along = next.clone().sub(here);
    part(shapes().box, rail, { at: [here.x + along.x / 2, 0.14, here.z + along.z / 2], size: [along.length() * 1.12, 0.5, 0.5], turn: [0, -Math.atan2(along.z, along.x), 0], into: scene });
    if (i % 6 === 0) part(shapes().ball, brass, { at: [here.x, 0.42, here.z], size: 0.13, into: scene });
  }
}

// ----- the clutter on the table -----
//
// It's a game in a tavern, so round the tray are the things that would be:
// ale, doubloons and a candle. They are what make the table look like a table.

function tankard(x, z, turn = 0) {
  const g = new THREE.Group();
  const S = shapes();
  const oak = paint(0x8a5a2e, { rough: 0.8 });
  const iron = paint(0x2b2d33, { rough: 0.4 });
  part(new THREE.CylinderGeometry(1.1, 1.25, 2.8, 14), oak, { at: [0, 1.4, 0], into: g });
  for (const y of [0.45, 2.35]) part(new THREE.CylinderGeometry(1.27 - y * 0.05, 1.29 - y * 0.05, 0.2, 14), iron, { at: [0, y, 0], into: g });
  part(new THREE.TorusGeometry(0.75, 0.18, 6, 12, Math.PI), oak, { at: [1.15, 1.4, 0], turn: [0, 0, -Math.PI / 2], into: g });
  const froth = paint(0xfff6df, { rough: 1 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    part(S.ball, froth, { at: [Math.cos(a) * 0.65, 2.85 + rand(-0.05, 0.1), Math.sin(a) * 0.65], size: rand(0.34, 0.46), into: g });
  }
  part(S.ball, froth, { at: [0, 3, 0], size: 0.7, into: g });
  g.position.set(x, TABLE, z);
  g.rotation.y = turn;
  g.scale.setScalar(0.62); // a tankard, next to cups that hold five dice
  scene.add(g);
}

function doubloons(x, z, { stack = 0, loose = 0, spread = 1.5 } = {}) {
  const gold = paint(0xf2c230, { rough: 0.3 });
  for (let i = 0; i < stack; i++) {
    part(shapes().disc, gold, { at: [x + rand(-0.04, 0.04), TABLE + 0.05 + i * 0.1, z + rand(-0.04, 0.04)], size: [0.36, 0.09, 0.36], turn: [0, rand(0, 3), 0], into: scene });
  }
  for (let i = 0; i < loose; i++) {
    part(shapes().disc, gold, { at: [x + rand(-spread, spread), TABLE + 0.05, z + rand(-spread, spread)], size: [0.36, 0.09, 0.36], turn: [rand(-0.1, 0.1), rand(0, 3), 0], into: scene });
  }
}

function candle(x, z) {
  const S = shapes();
  part(S.disc, paint(0xb8862f, { rough: 0.4 }), { at: [x, TABLE + 0.08, z], size: [0.75, 0.16, 0.75], into: scene }); // a brass dish
  part(S.disc, paint(0xf3e6c4, { rough: 0.9 }), { at: [x, TABLE + 0.75, z], size: [0.3, 1.3, 0.3], into: scene });
  part(S.ball, paint(0xf3e6c4, { rough: 0.9 }), { at: [x + 0.2, TABLE + 1.2, z + 0.12], size: [0.12, 0.22, 0.12], into: scene }); // a run of wax
  candleFlame = part(S.cone, paint(0xffc24a, { glow: 2.2 }), { at: [x, TABLE + 1.72, z], size: [0.17, 0.6, 0.17], shadow: false, into: scene });
  candleLight = new THREE.PointLight(0xffa64a, 40, 16, 1.7);
  candleLight.position.set(x, TABLE + 2.1, z);
  scene.add(candleLight);
}

function buildProps() {
  candle(-9.9, -5.4);
  tankard(10.6, -5.2, 2.4);
  tankard(-10.4, 4.6, 0.5);
  doubloons(10.2, 5.2, { stack: 6, loose: 5, spread: 1.1 });
  doubloons(11.3, 4.1, { stack: 3 });
  doubloons(-8.6, 5.9, { loose: 4, spread: 0.9 });
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
  // Keep the ring of name plates inside that box, below the bid along the top.
  const fx = (1920 * unit) / w;
  const fy = (1080 * unit) / h;
  const top = fy * (1 - (2 * 282) / 1080);
  const bottom = -fy * (1 - (2 * 94) / 1080);
  const sideLimit = fx * 0.855;
  const rim = Array.from({ length: 16 }, (_, i) => nameSpot((i / 16) * Math.PI * 2));
  const v = new THREE.Vector3();
  cam.dist = 30;
  cam.target.set(0, 0, 0.2);
  for (let i = 0; i < 40; i++) {
    aimCamera();
    let lo = Infinity;
    let hi = -Infinity;
    let wide = 0;
    for (const p of rim) {
      v.copy(p).project(camera);
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
// Effects
// ---------------------------------------------------------------------------

/** A puff of dust (anything round that swells and fades away by shrinking). */
function puff(at, { colour = 0xd9cdb8, size = 0.3, rise = 0.7, life = 0.9 } = {}) {
  const m = part(shapes().ball, paint(colour, { rough: 1 }), { at: at.toArray(), size: 0.01, shadow: false, into: scene });
  const drift = new THREE.Vector3(rand(-0.3, 0.3), rise, rand(-0.3, 0.3));
  const start = at.clone();
  tween(life, (k, raw) => {
    m.position.copy(start).addScaledVector(drift, raw);
    m.scale.setScalar(Math.max(0.001, size * Math.sin(Math.min(1, raw * 1.15) * Math.PI) ** 0.6 * (0.6 + raw * 0.8)));
  }, { ease: linear, done: () => scene.remove(m) });
}

/** Light the middle of the table up for a moment. */
function flare(colour, strength, seconds) {
  flash.color.set(colour);
  tween(seconds, (k) => (flash.intensity = strength * (1 - k)));
}

// ---------------------------------------------------------------------------
// Cups, dice and chalk
// ---------------------------------------------------------------------------

function makeCup(colour) {
  const g = new THREE.Group();
  const S = shapes();
  part(S.cup, paint(0x7a4a28, { rough: 0.8 }), { at: [0, 0.525, 0], into: g }); // the leather
  part(S.band, paint(new THREE.Color(colour).getHex(), { rough: 0.6 }), { at: [0, 0.13, 0], into: g }); // a band in the pirate's own colour
  part(S.cap, paint(0x4a2a15, { rough: 0.7 }), { at: [0, 1.06, 0], into: g });
  return g;
}

/** Clear the table and seat the crew for a new round. */
function deal(view, withShake) {
  for (const seat of seats.values()) {
    if (seat.cup) scene.remove(seat.cup);
    for (const d of seat.dice) scene.remove(d.mesh);
  }
  chalk(0, 0, -1);
  acted = { call: false, result: false, sunk: false };
  claim.found = 0;

  // The seating plan only changes between games.
  const plan = view.seats.map((s) => s.id).join();
  if (plan !== seatsKey) {
    seatsKey = plan;
    labelsEl.replaceChildren();
    seats = new Map();
    const crew = view.seats.length;
    labelsEl.style.setProperty('--seat', crew <= 4 ? 40 : crew <= 6 ? 36 : crew <= 9 ? 31 : 27);
    view.seats.forEach((s, index) => {
      const angle = (crew === 2 ? Math.PI / 2 : 0) + (index / crew) * Math.PI * 2;
      const label = document.createElement('div');
      label.className = 'ld-label';
      labelsEl.append(label);
      seats.set(s.id, {
        id: s.id,
        index,
        pos: onOval(angle, CUPS),
        name: nameSpot(angle),
        tangent: new THREE.Vector3(Math.cos(angle) * TRAY.a, 0, Math.sin(angle) * TRAY.b).normalize(),
        cup: null,
        dice: [],
        label,
        lifted: false,
        sig: '',
      });
    });
    // Dice are laid out in a row along the rail, so they get smaller if the neighbours are close.
    const list = [...seats.values()];
    for (const seat of list) {
      const others = list.filter((o) => o !== seat).map((o) => o.pos.distanceTo(seat.pos));
      seat.room = others.length ? Math.min(...others) : 8;
    }
  }

  for (const s of view.seats) {
    const seat = seats.get(s.id);
    seat.dice = [];
    seat.lifted = false;
    seat.cup = null;
    if (s.count === 0) continue;
    const cup = makeCup(players.get(s.id)?.color ?? '#f7c948');
    cup.position.copy(seat.pos);
    scene.add(cup);
    seat.cup = cup;
    if (withShake) rattle(cup);
  }
}

/** Dice going round a cup, and then the cup slammed down (in time with the "ldShake" sound). */
function rattle(cup) {
  const home = cup.position.clone();
  const seed = rand(0, 10);
  tween(1.38, (k, raw) => {
    const t = raw * 1.38;
    cup.position.set(home.x + Math.sin(t * 31 + seed) * 0.09, 0.75 + Math.sin(t * 23 + seed) * 0.12, home.z + Math.cos(t * 27 + seed) * 0.09);
    cup.rotation.set(Math.sin(t * 29 + seed) * 0.22, 0, Math.cos(t * 33 + seed) * 0.22);
  }, {
    ease: linear,
    done: () => {
      cup.rotation.set(0, 0, 0);
      tween(0.09, (k) => cup.position.set(home.x, 0.75 * (1 - k), home.z), {
        ease: easeIn,
        done: () => {
          shake = Math.max(shake, 0.12);
          puff(home.clone().setY(0.1), { size: 0.22, rise: 0.3, life: 0.5 });
        },
      });
    },
  });
}

/** Knuckles rapped on the cup: somebody has made a bid. */
function knock(seat) {
  if (!seat?.cup || seat.lifted) return;
  const cup = seat.cup;
  tween(0.36, (k, raw) => (cup.position.y = Math.abs(Math.sin(raw * Math.PI * 2)) * 0.28 * (1 - raw * 0.5)), { ease: linear, done: () => (cup.position.y = 0) });
}

/** Chalk the bid on the baize: `q` outlines of a die showing `f`. */
function chalk(q, f, n) {
  for (const m of marks) {
    scene.remove(m);
    m.material.dispose();
  }
  marks = [];
  // A grid in the middle of the tray, wider than it is deep, that shrinks to fit a big bid.
  // (Dice found over and above the bid carry on along the row, so there are always at least three columns.)
  const cols = Math.max(3, Math.ceil(Math.sqrt(q * 2.6)));
  const rows = Math.ceil(Math.max(q, 1) / cols);
  const across = Math.min(Math.max(q, 1), cols); // how many marks are in the first row, which is the one to centre
  const pitch = Math.min(1.4, 6.6 / cols, 3.3 / (rows + 0.4));
  const spot = (i) => new THREE.Vector3(((i % cols) - (across - 1) / 2) * pitch, 0, (Math.floor(i / cols) - (rows - 1) / 2) * pitch + 0.15);
  claim = { q, f, n, size: pitch * 0.8, spot, found: 0 };
  for (let i = 0; i < q; i++) {
    const mark = new THREE.Mesh(shapes().flat, new THREE.MeshBasicMaterial({ map: chalkTexture(f), transparent: true, opacity: 0.8, depthWrite: false }));
    mark.position.copy(spot(i)).setY(0.012);
    mark.rotation.y = rand(-0.12, 0.12);
    mark.scale.setScalar(0.001);
    scene.add(mark);
    marks.push(mark);
    tween(0.3, (k) => mark.scale.setScalar(Math.max(0.001, pitch * 0.92 * k)), { delay: i * 0.035, ease: backOut });
  }
}

/** A seat's cup comes up. Its dice spread out along the rail; the ones that count hop into the middle. */
function lift(seat, values, view) {
  seat.lifted = true;
  const cup = seat.cup;
  if (cup) {
    const lean = seat.pos.x >= 0 ? -1 : 1;
    tween(0.4, (k) => {
      cup.position.y = k * 1.9;
      cup.rotation.z = lean * k * 0.6;
    });
    tween(0.22, (k) => cup.scale.setScalar(Math.max(0.001, 1 - k)), { delay: 0.5, ease: easeIn, done: () => scene.remove(cup) });
    seat.cup = null;
  }

  const size = Math.min(DIE, (seat.room * 0.82) / values.length);
  const pitch = size * 1.18;
  let hop = 0;
  values.forEach((value, k) => {
    const hit = value === view.bid.f || (view.wild && value === 1);
    const mesh = makeDie(value, hit ? 'hit' : 'dim');
    const home = seat.pos.clone().addScaledVector(seat.tangent, (k - (values.length - 1) / 2) * pitch).setY(size / 2);
    const yaw = rand(-0.25, 0.25);
    mesh.position.copy(seat.pos).setY(size / 2);
    mesh.scale.setScalar(0.001);
    scene.add(mesh);
    const die = { mesh, value, hit, atSeat: true };
    seat.dice.push(die);
    // Out from under the cup...
    tween(0.34, (e) => {
      mesh.position.lerpVectors(seat.pos, home, e).setY(size / 2);
      mesh.scale.setScalar(Math.max(0.001, size * e));
      spin(mesh, yaw + (1 - e) * 3);
    }, { delay: 0.12 });
    if (!hit) return;
    // ...and, if it counts, over onto the next chalk mark.
    const slot = claim.found++;
    const to = claim.spot(slot).setY(claim.size / 2);
    const mark = marks[slot];
    die.atSeat = false;
    tween(0.52, (e, raw) => {
      mesh.position.lerpVectors(home, to, e);
      mesh.position.y += Math.sin(raw * Math.PI) * 1.7;
      mesh.scale.setScalar(size + (claim.size - size) * e);
      spin(mesh, yaw + raw * Math.PI * 2);
    }, {
      delay: 0.6 + hop++ * 0.17,
      ease: (k) => k * k * (3 - 2 * k),
      done: () => {
        if (mark) mark.visible = false;
        puff(to.clone().setY(0.08), { size: 0.14, rise: 0.25, life: 0.4 });
      },
    });
  });
}

/** The verdict: either every chalk mark has a die on it, or it hasn't. Then the loser's die leaves the table. */
function verdict(view) {
  const r = view.result;
  if (r.good) {
    flare(0xffd76a, 55, 1.6);
    for (const seat of seats.values()) {
      for (const d of seat.dice.filter((x) => !x.atSeat)) {
        const y = d.mesh.position.y;
        tween(0.5, (k, raw) => (d.mesh.position.y = y + Math.sin(raw * Math.PI) * 0.5), { delay: 0.35 + rand(0, 0.25), ease: linear });
      }
    }
  } else {
    // The marks nobody could fill are the lie.
    flare(0xff4630, 60, 1.8);
    shake = Math.max(shake, 0.3);
    for (const mark of marks.filter((m) => m.visible)) {
      mark.material.color.set(0xff6a55);
      mark.material.opacity = 1;
      const size = mark.scale.x;
      tween(1.6, (k, raw) => mark.scale.setScalar(size * (1 + Math.sin(raw * Math.PI * 5) * 0.12 * (1 - raw))), { ease: linear });
    }
  }

  // The loser gives one up (one that didn't count, if they have one left by the rail).
  const seat = seats.get(r.loser);
  const die = seat?.dice.find((d) => d.atSeat) ?? seat?.dice.at(-1);
  if (!die) return;
  die.gone = true;
  const from = die.mesh.position.clone();
  const out = seat.pos.clone().setY(0).normalize();
  const size = die.mesh.scale.x;
  tween(1.1, (k, raw) => {
    const t = raw * 1.1;
    die.mesh.position.set(from.x + out.x * 5.5 * t, from.y + 6.2 * t - 6.5 * t * t, from.z + out.z * 5.5 * t);
    die.mesh.rotation.x += 0.25;
    die.mesh.rotation.z += 0.18;
    if (raw > 0.75) die.mesh.scale.setScalar(Math.max(0.001, size * ((1 - raw) / 0.25)));
  }, { delay: 1.5, ease: linear, done: () => scene.remove(die.mesh) });
}

// ---------------------------------------------------------------------------
// The name plates round the table
// ---------------------------------------------------------------------------

function chipHtml(id) {
  const p = players.get(id);
  return p ? `<span class="chip" style="--c:${esc(p.color)}"><span class="face"><span>${esc(p.avatar)}</span></span><span class="nm">${esc(p.name)}</span></span>` : '';
}

function labels(view) {
  const r = view.result;
  for (const s of view.seats) {
    const seat = seats.get(s.id);
    if (!seat) continue;
    let tag = '';
    if (r?.loser === s.id) tag = `<span class="ld-tag">${r.sunk ? 'Sunk!' : 'Loses a die'}</span>`;
    else if (r?.winner === s.id) tag = `<span class="ld-tag gold">${r.good ? 'Honest!' : 'Called it!'}</span>`;
    else if (view.caller === s.id) tag = '<span class="ld-tag">Calls it!</span>';
    else if (view.caller && view.bid?.by === s.id) tag = '<span class="ld-tag dark">The bidder</span>';

    const out = s.out || s.count === 0;
    const turn = view.phase === 'bid' && view.thinking && view.turn === s.id;
    // How many dice they have left: public knowledge, even while the dice themselves are under the cup.
    const left = s.count - (r?.loser === s.id ? 1 : 0); // the loser's plate is one short as soon as the verdict is in
    const count = out || left === 0 ? '<span class="ld-gone">💀 in the locker</span>' : `<span class="ld-left">${dieBack().repeat(left)}</span>`;
    const html = `${tag}${chipHtml(s.id)}${count}`;
    // On the far side of the table the tag hangs below the plate, clear of the words along the top.
    const cls = `ld-label ${out ? 'out' : ''} ${turn ? 'turn' : ''} ${seat.name.z < -1 ? 'far' : ''} ${players.get(s.id)?.away ? 'away' : ''}`;
    if (seat.sig !== html + cls) {
      seat.sig = html + cls;
      seat.label.className = cls;
      seat.label.innerHTML = html;
    }
  }
}

function placeLabels() {
  for (const seat of seats.values()) {
    const { x, y } = onScreen(seat.name);
    seat.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
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

  const flicker = 0.85 + 0.15 * Math.sin(clock * 13) * Math.sin(clock * 7.3);
  candleLight.intensity = 40 * flicker;
  candleFlame.scale.y = 0.6 * flicker;

  // The glow slides round to whoever's turn it is.
  const lit = turnSeat ? 1 : 0;
  ring.material.opacity += (lit * (0.65 + 0.25 * Math.sin(clock * 5)) - ring.material.opacity) * Math.min(1, dt * 8);
  turnLamp.intensity += (lit * 14 - turnLamp.intensity) * Math.min(1, dt * 6);
  if (turnSeat) {
    ring.position.lerp(new THREE.Vector3(turnSeat.pos.x, 0.02, turnSeat.pos.z), Math.min(1, dt * 9));
    ring.scale.setScalar(1 + 0.05 * Math.sin(clock * 5));
    turnLamp.position.copy(ring.position).setY(2.4);
  }

  // A slow drift of the camera, plus whatever has just thumped the table.
  shake *= Math.max(0, 1 - dt * 5);
  aimCamera(Math.sin(clock * 0.21) * 0.22 + rand(-1, 1) * shake, rand(-1, 1) * shake);
  placeLabels();
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// The two functions host.js calls
// ---------------------------------------------------------------------------

/** Draw (or update) the diorama for a view of the game. */
export function show(view, playerMap) {
  if (!layer) init();
  players = playerMap;
  if (layer.hidden) {
    layer.hidden = false;
    fit();
    running = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  if (view.key !== roundKey) {
    roundKey = view.key;
    deal(view, view.phase === 'roll');
  }

  // A new bid: chalk it up, and the bidder raps their cup.
  const b = view.bid;
  if (b && b.n !== claim.n) {
    chalk(b.q, b.f, b.n);
    if (view.phase === 'bid') knock(seats.get(b.by));
  }
  turnSeat = view.phase === 'bid' && view.thinking ? (seats.get(view.turn) ?? null) : null;

  // "LiAARRRRGH!": the table jumps.
  if (view.caller && !acted.call) {
    acted.call = true;
    shake = Math.max(shake, 0.4);
    flare(0xff5a3c, 45, 1.2);
    knock(seats.get(view.caller));
  }

  // Cups whose dice have arrived come up.
  if (b) {
    for (const s of view.seats) {
      const seat = seats.get(s.id);
      if (s.dice && seat && !seat.lifted) lift(seat, s.dice, view);
    }
  }

  if (view.result && !acted.result) {
    acted.result = true;
    verdict(view);
  }
  if (view.phase === 'sunk' && !acted.sunk) {
    acted.sunk = true;
    const seat = seats.get(view.result.loser);
    if (seat) for (let i = 0; i < 5; i++) puff(seat.pos.clone().add(new THREE.Vector3(rand(-0.6, 0.6), 0.2, rand(-0.6, 0.6))), { colour: 0x8a8f96, size: 0.4, rise: 1.2, life: 1.3 });
  }

  labels(view);
}

/** Put the diorama away (another screen is showing). */
export function hide() {
  if (!layer || layer.hidden) return;
  layer.hidden = true;
  running = false;
  tweens.clear();
  for (const seat of seats.values()) {
    if (seat.cup) scene.remove(seat.cup);
    for (const d of seat.dice) scene.remove(d.mesh);
  }
  chalk(0, 0, -1);
  tweens.clear();
  labelsEl.replaceChildren();
  seats = new Map();
  seatsKey = '';
  roundKey = null;
  turnSeat = null;
  flash.intensity = 0;
  shake = 0;
}

// ---------------------------------------------------------------------------
// The words host.js draws over the top
// ---------------------------------------------------------------------------

/** host.js hands over its drawing helpers and gets back the screen ("ld-table"). */
export function liarsScreens({ anim, chip, player }) {
  const name = (id) => esc(player(id)?.name ?? 'Somebody');

  function table(v) {
    const b = v.bid;
    const r = v.result;
    let top;
    let extra = '';

    if (v.phase === 'roll') {
      top = `<p class="ld-main"${anim('shake', 'slam', 0, 450)}>Shake ’em!</p><p class="ld-sub">${chip(v.turn)} opens the bidding</p>`;
    } else if (v.phase === 'bid') {
      const next = v.thinking ? `<p class="ld-sub ld-next">${chip(v.turn)} ${b ? 'raise it, or call it!' : 'opens the bidding'}</p>` : `<p class="ld-sub">🦜 The parrot bid for ${name(b.by)}</p>`;
      top = b
        ? `<p class="ld-main"${anim(`bid${b.n}`, 'pop', 0, 380)}>${chip(b.by)}${b.auto ? '<i>’s parrot</i>' : ''} <i>says at least</i> ${bidTag(b.q, b.f)}</p>${next}`
        : `<p class="ld-main">No bid yet</p>${next}`;
    } else if (v.phase === 'sunk') {
      top = `<p class="ld-main">💀 ${name(r.loser)} is out of dice</p><p class="ld-sub">Off to Davy Jones’ locker</p>`;
    } else {
      // The showdown: who called whom, the count as the cups come up, and then who pays for it.
      const found = v.phase === 'call' ? '' : `<span class="ld-gap"></span><span class="ld-found ${r ? (r.good ? 'good' : 'bad') : ''}"${anim(`tally${v.tally}`, 'pop', 0, 350)}>${v.tally}</span> <i>${r ? 'found' : 'so far'}</i>`;
      const head = r ? `<p class="ld-kicker ${r.good ? 'good' : ''}">${r.good ? 'The bid was good!' : `${name(b.by)} was lying!`}</p>` : `<p class="ld-kicker">${name(v.caller)} calls ${name(b.by)} a liar!</p>`;
      const foot = r ? `<p class="ld-sub"${anim('loser', 'rise', 1400, 450)}>${chip(r.loser)} loses a die${r.drink ? ` <i>and takes a swig of ${esc(r.drink)}</i>` : ''}</p>` : '';
      top = `${head}<p class="ld-main"><i>The bid: at least</i> ${bidTag(b.q, b.f)}${found}</p>${foot}`;
      if (v.phase === 'call') extra = `<div class="stamp"${anim('shout', 'slam', 0, 500)}>LiAARRRRGH!</div>`;
      // The verdict is stamped across the table, then gets out of the way of the dice.
      if (r) extra = `<div class="ld-stamp ${r.good ? 'good' : ''}"${anim('stamp', 'ld-stamp', 400, 2600)}>${r.good ? 'Honest!' : 'Liar!'}</div>`;
    }

    return `<div class="ld" data-phase="${esc(v.phase)}">
      <div class="ld-top parch"${anim('top', 'drop', 0, 500)}>${top}</div>
      ${extra}
    </div>`;
  }

  return { 'ld-table': table };
}
