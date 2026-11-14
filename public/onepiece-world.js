// Find the One Piece: the island, drawn in 3D with three.js.
//
// This is the world the captain's log describes: open sea, an island with a
// beach, a jungle, a village and a volcano, and (somewhere else entirely) the
// cavern under the volcano. Everything is built the way Bombard!'s models are,
// from flat-shaded shapes in pots of paint, so it looks like a diorama you
// could reach into. Nothing is loaded from a file.
//
// How it fits together
// --------------------
// * show(view) is called every time the server sends a new view. The view
//   carries a "world" note: which part of the island the story is at, what
//   the crew is carrying, and (after a roll) how it went.
// * arrive() runs when the story moves to a new place: it moves the camera,
//   changes the light, walks the crew over and sets out the cast.
// * react() runs when a roll's outcome is announced: the best roller hops,
//   the worst falls over, and the scene does whatever the result calls for.
// * Everything that moves is a "tween": a little function called every frame
//   with a number going from 0 to 1.
//
// World units: a person is about 1 tall. x runs left to right, y is up, z
// comes towards the camera. The sea is at y = 0.

import * as THREE from './vendor/three.module.min.js';
import { createLookPass } from './looks3d.js';
import * as sound from './sound.js';
import { LIVERY } from './bombard-play.js';

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeInOut = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
const linear = (k) => k;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Where things are. The cavern is a separate set, far off to one side, and the
// camera cuts to it.
const SAND = 0.42; // how high the beach stands out of the sea
const TURF = 0.9; // ...and the grass
const VOLCANO = { x: 11, z: -10, base: 7.5, top: 2, height: 10 };
const CAVE = V(160, 0, 0);
const SPOT = {
  beach: V(-9.6, SAND, 6.0),
  jungle: V(-2.6, TURF, 2.4),
  pan: V(7.2, TURF, 3.2),
  feast: V(5.6, TURF, 4.6),
  cross: V(3.0, TURF, 4.0), // on the open ground where the monkey fell
  trial: V(5.9, TURF, 4.7), // where the crew stands to watch, well to one side
  woods: V(0.9, TURF, 1.2), // where the monkey comes out of the trees
  monkey: V(3.1, TURF, 4.3), // ...and where he stops: open ground, well clear of the pan
  slope: V(10.2, 4.05, -4.55),
  summit: V(VOLCANO.x, VOLCANO.height, VOLCANO.z),
  cave: V(CAVE.x, 0, 7.0),
};

// The camera's standing orders for each part of the story: what it looks at,
// from how far, how high above the horizon, and how far round to the side.
const SHOTS = {
  sea: { at: [1, 2.6, -2], dist: 40, up: 0.14, round: -0.55 },
  beach: { at: [-10.0, 1.0, 6.3], dist: 10.5, up: 0.3, round: -0.5 },
  jungle: { at: [-2.6, 1.5, 2.2], dist: 9.5, up: 0.36, round: -0.1 },
  village: { at: [6.7, 1.5, 3.5], dist: 10, up: 0.3, round: 0.14 },
  monkey: { at: [4.5, 1.2, 4.3], dist: 8.2, up: 0.26, round: -0.12 },
  cross: { at: [3.9, 1.5, 4.2], dist: 6.6, up: 0.2, round: 0.1 },
  volcano: { at: [10.4, 4.7, -7.4], dist: 21.5, up: 0.2, round: -0.16 },
  cave: { at: [CAVE.x, 2.9, 3.4], dist: 21, up: 0.2, round: 0.07 },
  rescue: { at: [7, 3.2, -3], dist: 46, up: 0.1, round: -0.22 },
};

// The camera never sits still for long. Each phase of a scene has its own
// move, given as changes to the shot above: nearer or farther (dist is a
// multiple), higher or lower, round to one side, and a slow drift that carries
// on for as long as the phase lasts (push: nearer per second; spin: round per second).
const MOVES = {
  from: { dist: 1.7, up: 0.2, round: -0.6 }, // where an arrival starts, before it settles
  entry: { dist: 1, up: 0, round: 0, push: -0.006, spin: 0.012 },
  vote: { dist: 0.8, up: -0.08, round: 0.42, lift: -0.25, spin: -0.02 },
  chosen: { dist: 0.86, up: 0.02, round: 0.2, push: 0.004 },
  roll: { dist: 1.16, up: 0.16, round: -0.36, spin: 0.03 },
  tally: { dist: 0.9, up: 0.1, round: -0.12, push: -0.03 },
  outcome: { dist: 0.7, up: -0.05, round: 0.16, lift: -0.15, push: -0.004, spin: -0.014 },
  still: { dist: 1, up: 0, round: 0, spin: 0.02 },
};

// The light for each part of the story: the top of the sky, the colour of the
// horizon (which the far sea fades into), the sun, and the light from the sky.
const MOODS = {
  dawn: { sky: '#6f9fc4', haze: '#f3d2ab', sun: '#ffd9a0', sunI: 2.5, air: 1.15, from: [-12, 9, 12] },
  noon: { sky: '#3f8fc9', haze: '#d5ead9', sun: '#fff4d6', sunI: 3.0, air: 1.3, from: [-6, 18, 8] },
  dusk: { sky: '#2a2c5c', haze: '#e58a5c', sun: '#ff9a5a', sunI: 1.5, air: 0.62, from: [14, 6, 10] },
  ash: { sky: '#3a2626', haze: '#b25a3d', sun: '#ff8f5c', sunI: 1.7, air: 0.6, from: [-10, 12, 10] },
  cave: { sky: '#060304', haze: '#150906', sun: '#ffb070', sunI: 0.35, air: 0.28, from: [-4, 14, 12] },
  gold: { sky: '#7fb4d8', haze: '#ffe1ab', sun: '#ffe2a8', sunI: 2.9, air: 1.25, from: [-14, 8, 10] },
};

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

let layer = null; // the <div> that holds the sky, the canvas and the sheets laid over it
// Lighting styles (see looks3d.js). House style: a storybook printed in halftone,
// on paper, with a palette drawn from the haze, so it turns with the story's mood.
const LOOK_TUNING = {
  knee: 1,
  house: {
    light: { pattern: 'halftone', bands: 4, cell: 2, spread: 1, amount: 0.5 },
    post: { palette: { colours: [new THREE.Color(0x1d1410), new THREE.Color(), new THREE.Color(), new THREE.Color(0xfff6e4)], amount: 0.35 }, paper: 0.15 },
  },
};
let styler = null;

let renderer, scene, camera, sun, air, sea, skies, wash;
let running = false;
let paused = false;
let lastFrame = 0;
let clock = 0;
let shake = 0;
let players = new Map();

const tweens = new Set();
const flames = new Set(); // things that flicker
const fx = new THREE.Group(); // smoke, sparks and anything else that comes and goes
const cam = { at: V(0, 2, 0), dist: 50, up: 0.2, round: 0, push: 0, spin: 0, name: 'sea', tween: null };
const light = { haze: new THREE.Color('#f3d2ab') }; // tweened by setMood

/** Run fn(eased, raw) every frame for `dur` seconds. */
function tween(dur, fn, { delay = 0, ease = easeOut, done = null } = {}) {
  // Anything meant to happen at once does, without waiting for the next frame
  // (so the picture is right even if the game is paused when the page loads).
  if (dur <= 0.02 && delay <= 0) {
    fn(1, 1);
    done?.();
    return null;
  }
  const tw = { t: -delay, dur: Math.max(0.001, dur), fn, ease, done };
  tweens.add(tw);
  return tw;
}
/**
 * Do something a little later, as part of acting out the current scene. If the
 * story has moved on by then (somebody pressed Space), it is quietly dropped,
 * so one scene's leftovers never land in the next. `always` is for things
 * that must finish whatever happens, like the second half of a cut.
 */
function after(seconds, fn, always = false) {
  const scene = now.key;
  return tween(0.001, () => {}, { delay: seconds, done: () => (always || now.key === scene) && fn() });
}

// ----- paint and parts -----

const paints = new Map();
/** A pot of paint. Everything is flat-shaded, so the models look hand-carved. */
function paint(color, { glow = 0, rough = 0.8, side = THREE.FrontSide } = {}) {
  const key = `${color}:${glow}:${rough}:${side}`;
  if (!paints.has(key)) {
    paints.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: rough, metalness: 0.02, side, emissive: glow ? color : 0x000000, emissiveIntensity: glow }));
  }
  return paints.get(key);
}

const S = {};
function shapes() {
  if (S.box) return S;
  S.box = new THREE.BoxGeometry(1, 1, 1);
  S.ball = new THREE.IcosahedronGeometry(1, 1);
  S.rock = new THREE.IcosahedronGeometry(1, 0);
  S.rod = new THREE.CylinderGeometry(1, 1, 1, 8);
  S.cone = new THREE.ConeGeometry(1, 1, 7);
  S.disc = new THREE.CylinderGeometry(1, 1, 1, 16);
  return S;
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

/** A lumpy outline, for coasts: an oval with a few slow wobbles in it. */
function blob(cx, cz, a, b, wobble, n = 60) {
  const points = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = 1 + wobble * (0.55 * Math.sin(3 * t + 1.3) + 0.3 * Math.sin(5 * t + 0.4) + 0.2 * Math.sin(2 * t + 2.1));
    points.push([cx + Math.cos(t) * a * r, cz + Math.sin(t) * b * r]);
  }
  return points;
}

/** Text or a little drawing on a piece of canvas, to stick onto a model. */
function decal(draw, w = 256, h = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A clump of cotton wool: several squashed balls merged into one piece. Used for cloud, mist and smoke. */
const wool = [];
function cotton(colour = 0xe6edf2) {
  if (wool.length === 0) {
    for (let v = 0; v < 6; v++) {
      const lumps = [];
      for (let i = 0; i < 6; i++) {
        const lump = new THREE.IcosahedronGeometry(rand(0.3, 0.46), 1);
        lump.scale(1, rand(0.55, 0.8), 1);
        lump.translate(rand(-0.34, 0.34), rand(-0.05, 0.16), rand(-0.26, 0.26));
        lumps.push(lump.toNonIndexed());
      }
      const pos = new Float32Array(lumps.reduce((sum, l) => sum + l.attributes.position.array.length, 0));
      let at = 0;
      for (const l of lumps) {
        pos.set(l.attributes.position.array, at);
        at += l.attributes.position.array.length;
      }
      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      merged.computeVertexNormals();
      wool.push(merged);
    }
  }
  return part(pick(wool), paint(colour, { rough: 1, glow: 0.3 }), { turn: [0, rand(0, 6.3), 0], shadow: false });
}

function init() {
  shapes();
  layer = document.createElement('div');
  layer.id = 'opLayer';
  layer.hidden = true;
  layer.innerHTML = '<div class="op-sky"></div><div class="op-sky"></div><div class="op-focus far"></div><div class="op-focus near"></div><div class="op-vignette"></div><div class="op-wash"></div>';
  document.getElementById('stage').before(layer);
  skies = [...layer.querySelectorAll('.op-sky')];
  wash = layer.querySelector('.op-wash');

  // The sky is two sheets of colour behind a see-through canvas, so it can fade from one time of day to the next.
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  styler = createLookPass(renderer, LOOK_TUNING);
  skies[1].after(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(light.haze.getHex(), 50, 170);
  camera = new THREE.PerspectiveCamera(28, 16 / 9, 1, 420);

  air = new THREE.HemisphereLight(0xfff1d8, 0x4d6a5a, 1.2);
  scene.add(air);
  sun = new THREE.DirectionalLight(0xffe9c4, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 22, bottom: -22, near: 1, far: 120 });
  sun.shadow.bias = -0.0008;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target, fx);

  buildSea();
  buildIsland();
  buildVillage();
  buildVolcano();
  buildCave();
  buildSky();
  buildCast();
  window.addEventListener('resize', fit);
  fit();
}

// ---------------------------------------------------------------------------
// The sea and the sky
// ---------------------------------------------------------------------------

function buildSea() {
  // One big sheet of little triangles, each a slightly different blue, which rises and falls.
  const g = new THREE.PlaneGeometry(320, 320, 80, 80).rotateX(-Math.PI / 2).toNonIndexed();
  const count = g.attributes.position.count;
  const colours = new Float32Array(count * 3);
  const base = new THREE.Color();
  for (let i = 0; i < count; i += 3) {
    base.setHSL(0.525 + rand(-0.012, 0.012), 0.6, 0.31 + rand(-0.025, 0.035));
    for (let k = 0; k < 3; k++) base.toArray(colours, (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  sea = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.25, metalness: 0.12 }));
  sea.receiveShadow = true;
  scene.add(sea);
}

function waves(t) {
  const pos = sea.geometry.attributes.position;
  const a = pos.array;
  for (let i = 0; i < a.length; i += 3) {
    const x = a[i];
    const z = a[i + 2];
    a[i + 1] = Math.sin(x * 0.42 + t * 0.9) * Math.cos(z * 0.5 + t * 0.7) * 0.14 + Math.sin(x * 1.1 - z * 0.8 + t * 1.6) * 0.06;
  }
  pos.needsUpdate = true;
}

const clouds = [];
const mists = []; // { stage, puffs }: weather that hides whatever the crew has not reached yet

function buildSky() {
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rand(-0.15, 0.15);
    const far = rand(70, 110);
    const c = cotton(0xf4f1ea);
    c.position.set(Math.cos(a) * far, rand(16, 30), Math.sin(a) * far);
    c.scale.set(rand(9, 16), rand(3.5, 5.5), rand(6, 9));
    c.userData.drift = rand(0.2, 0.6);
    scene.add(c);
    clouds.push(c);
  }
  // Mist over the jungle, over the village, and a cap of cloud on the mountain.
  const bank = (stage, spots, size, colour = 0xdfe9ee) => {
    const puffs = spots.map(([x, y, z]) => {
      const p = cotton(colour);
      p.position.set(x + rand(-0.6, 0.6), y, z + rand(-0.6, 0.6));
      p.userData = { home: p.position.clone(), size: size * rand(0.8, 1.25), drift: rand(0, 6) };
      p.scale.setScalar(p.userData.size);
      scene.add(p);
      return p;
    });
    mists.push({ stage, puffs, gone: false });
  };
  const grid = (x0, x1, z0, z1, step, y) => {
    const spots = [];
    for (let x = x0; x <= x1; x += step) for (let z = z0; z <= z1; z += step) spots.push([x, y, z]);
    return spots;
  };
  bank(2, grid(-8, 2.5, -7, 3.5, 2.1, 2.9), 3.6);
  bank(3, grid(3.5, 11, 0, 5.5, 2.0, 2.4), 3.4);
  const cap = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    cap.push([VOLCANO.x + Math.cos(a) * rand(1.5, 5.5), rand(6.2, 10.5), VOLCANO.z + Math.sin(a) * rand(1.5, 5.5)]);
  }
  bank(4, cap, 4.6, 0xcfd3d6);
}

/** Clear the weather from everything the crew has now reached. */
function liftMist(stage, snap) {
  for (const m of mists) {
    const gone = stage >= m.stage;
    if (gone === m.gone) continue;
    m.gone = gone;
    for (const p of m.puffs) {
      const from = p.scale.x;
      const to = gone ? 0.001 : p.userData.size;
      const rise = gone ? 2.5 : 0;
      tween(snap ? 0.01 : rand(2.2, 4.2), (k) => {
        p.scale.setScalar(from + (to - from) * k);
        p.position.y = p.userData.home.y + rise * k;
      }, { delay: snap ? 0 : rand(0, 1.2), ease: easeInOut });
    }
  }
}

let skyNow = 0;
let moodNow = null;

/** Change the time of day. */
function setMood(name, seconds = 3) {
  if (name === moodNow) return;
  moodNow = name;
  const m = MOODS[name];
  // The sky: fade the spare sheet in over the current one.
  skyNow = 1 - skyNow;
  skies[skyNow].style.background = `linear-gradient(180deg, ${m.sky} 0%, ${m.haze} 32%)`;
  skies[skyNow].style.transitionDuration = `${seconds}s`;
  skies[skyNow].style.opacity = 1;
  skies[1 - skyNow].style.transitionDuration = `${seconds}s`;
  skies[1 - skyNow].style.opacity = skyNow === 1 ? 1 : 0; // the bottom sheet stays put; the top one fades over it

  const from = { haze: light.haze.clone(), sun: sun.color.clone(), sunI: sun.intensity, air: air.intensity, dir: sunDir.clone() };
  const to = { haze: new THREE.Color(m.haze), sun: new THREE.Color(m.sun), dir: V(...m.from).normalize() };
  tween(seconds, (k) => {
    light.haze.lerpColors(from.haze, to.haze, k);
    scene.fog.color.copy(light.haze);
    sun.color.lerpColors(from.sun, to.sun, k);
    sun.intensity = from.sunI + (m.sunI - from.sunI) * k;
    air.intensity = from.air + (m.air - from.air) * k;
    sunDir.lerpVectors(from.dir, to.dir, k).normalize();
  }, { ease: easeInOut });
}
const sunDir = V(-12, 9, 12).normalize();

// ---------------------------------------------------------------------------
// The island
// ---------------------------------------------------------------------------

const sway = []; // palm tops, which nod in the wind
let wreck = null;

function palm(x, z, y, height = rand(2.2, 3.1)) {
  const g = new THREE.Group();
  const bark = paint(0x8a6a44);
  const lean = rand(-0.22, 0.22);
  // The trunk: three lengths, each leaning a little more than the last.
  let at = V(0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const tilt = lean * (i + 1) * 0.6;
    const len = height / 3;
    part(S.rod, bark, { at: [at.x + Math.sin(tilt) * len * 0.5, at.y + len * 0.5, 0], size: [0.11 - i * 0.02, len * 1.05, 0.11 - i * 0.02], turn: [0, 0, -tilt], into: g });
    at = V(at.x + Math.sin(tilt) * len, at.y + Math.cos(tilt) * len, 0);
  }
  const top = new THREE.Group();
  top.position.copy(at);
  const leaf = [paint(0x3f8f4a), paint(0x4fa356), paint(0x357a40)];
  for (let i = 0; i < 7; i++) {
    const frond = new THREE.Group();
    frond.rotation.y = (i / 7) * Math.PI * 2 + rand(-0.2, 0.2);
    part(S.box, pick(leaf), { at: [0.62, -0.16, 0], size: [1.25, 0.05, 0.36], turn: [0, 0, -0.42], into: frond });
    part(S.box, pick(leaf), { at: [1.28, -0.58, 0], size: [0.55, 0.05, 0.26], turn: [0, 0, -0.95], into: frond });
    top.add(frond);
  }
  part(S.ball, paint(0x6b4a2a), { at: [0.1, -0.12, 0.1], size: 0.13, into: top }); // a coconut
  top.userData.seed = rand(0, 6);
  sway.push(top);
  g.add(top);
  g.position.set(x, y, z);
  g.rotation.y = rand(0, 6.3);
  scene.add(g);
  return g;
}

function tree(x, z, y) {
  const g = new THREE.Group();
  const h = rand(0.7, 1.5);
  part(S.rod, paint(0x5b3d25), { at: [0, h / 2, 0], size: [0.12, h, 0.12], into: g });
  const greens = [0x2f7a3c, 0x3a8a45, 0x286a35, 0x479a4d];
  for (let i = 0; i < 3; i++) {
    part(S.ball, paint(pick(greens)), { at: [rand(-0.35, 0.35), h + rand(0.15, 0.75), rand(-0.35, 0.35)], size: [rand(0.55, 0.9), rand(0.45, 0.7), rand(0.55, 0.9)], into: g });
  }
  g.position.set(x, y, z);
  g.scale.setScalar(rand(0.9, 1.35));
  scene.add(g);
}

function rock(x, y, z, size, colour = 0x6f6a64) {
  return part(S.rock, paint(colour), { at: [x, y, z], size: [size * rand(0.8, 1.3), size * rand(0.6, 1), size * rand(0.8, 1.3)], turn: [rand(0, 3), rand(0, 3), 0], into: scene });
}

function buildIsland() {
  slab(blob(1, -1, 17.6, 11.6, 0.1), -1.4, SAND, paint(0xe8d39a, { rough: 1 }), scene); // the beach, all the way round
  slab(blob(2.5, -2, 13.8, 8.6, 0.09), -1.2, TURF, paint(0x6fae56, { rough: 1 }), scene); // the green in the middle

  // The jungle: thick everywhere except the path through it and the two places people stand.
  const clear = [[SPOT.jungle, 1.9], [SPOT.woods, 1.1], [V(-6.5, 0, 4.2), 1.5]];
  let planted = 0;
  for (let tries = 0; planted < 70 && tries < 900; tries++) {
    const x = rand(-9, 3.2);
    const z = rand(-8, 4.2);
    const onTurf = ((x - 2.5) / 12.4) ** 2 + ((z + 2) / 7.0) ** 2 < 1;
    const inTheWay = z > 0.9 && x > -7.4 && x < 2.6; // keep the front of the jungle open, so the camera can see in
    if (!onTurf || inTheWay || clear.some(([c, r]) => Math.hypot(x - c.x, z - c.z) < r)) continue;
    if (Math.random() < 0.35) palm(x, z, TURF, rand(1.8, 2.8));
    else tree(x, z, TURF);
    planted++;
  }
  // A few palms and rocks along the shore.
  for (const [x, z] of [[-12.6, 4.2], [-6.6, 5.4], [-13.4, 1.4], [14.6, 5.2], [-13.4, 7.8], [-8.3, 2.6], [13.2, -1.5]]) palm(x, z, SAND);
  for (const [x, z, s] of [[-8.0, 7.4, 0.3], [-11.4, 5.0, 0.22], [-13.9, 8.6, 0.5], [-15.6, 6.4, 0.42], [3.6, 9.4, 0.45], [16.4, 7.6, 0.6]]) rock(x, s * 0.4 + (Math.abs(x) > 13 ? -0.1 : SAND - 0.1), z, s);

  // The reef, with what is left of the ship on it.
  for (let i = 0; i < 9; i++) rock(-16.4 + rand(-1.6, 1.6), rand(-0.15, 0.1), 10.2 + rand(-1.3, 1.3), rand(0.3, 0.7), 0x4f4b48);
  wreck = makeShip('pirates', true);
  wreck.position.set(-16.3, 0.1, 10.0);
  wreck.rotation.set(0.1, 0.9, 0.42);
  wreck.userData.home = wreck.position.clone();
  scene.add(wreck);
}

/** A ship, small and simple. `broken` leaves the masts snapped and the sails in rags. */
function makeShip(liveryName, broken = false) {
  const c = LIVERY[liveryName] ?? LIVERY.pirates;
  const g = new THREE.Group();
  const hull = [[-1.6, -0.45], [0.9, -0.5], [1.9, 0], [0.9, 0.5], [-1.6, 0.45], [-1.8, 0]];
  slab(hull, -0.2, 0.42, paint(c.hull), g);
  slab(hull.map(([x, z]) => [x * 0.93, z * 0.84]), 0.42, 0.47, paint(c.deck), g);
  part(S.box, paint(c.rail), { at: [-1.2, 0.66, 0], size: [0.85, 0.4, 0.82], into: g }); // the stern castle
  for (const [x, h] of [[-0.35, 2.0], [0.75, 1.6]]) {
    const tall = broken ? h * rand(0.35, 0.6) : h;
    part(S.rod, paint(0x5b3d25), { at: [x, 0.45 + tall / 2, 0], size: [0.05, tall, 0.05], turn: broken ? [rand(-0.2, 0.2), 0, rand(-0.25, 0.25)] : [0, 0, 0], into: g });
    if (!broken) {
      part(S.box, paint(c.sail, { side: THREE.DoubleSide }), { at: [x + 0.06, 0.45 + h * 0.62, 0], size: [0.05, h * 0.5, 1.0], into: g });
      part(S.box, paint(c.sail, { side: THREE.DoubleSide }), { at: [x + 0.06, 0.45 + h * 0.22, 0], size: [0.05, h * 0.22, 1.15], into: g });
    } else {
      part(S.box, paint(c.sail), { at: [x + 0.1, 0.55, rand(-0.2, 0.2)], size: [0.5, 0.04, 0.7], turn: [0.2, rand(0, 3), 0.1], into: g });
    }
  }
  if (!broken) part(S.box, paint(c.flag), { at: [-0.15, 2.52, 0], size: [0.4, 0.24, 0.03], into: g });
  return g;
}

// ---------------------------------------------------------------------------
// The village of New Oldham
// ---------------------------------------------------------------------------

let pan = null;
let panFire = null;
let sandra = null;
const villagers = [];

/** A little carved person: a tapered body, a round head and (for pirates) a hat. */
function person(colour, { size = 1, skin = 0xe2ab80, kind = 'pirate' } = {}) {
  const g = new THREE.Group();
  const inner = new THREE.Group(); // tipped over when they fall, so the outer group stays upright for placing
  g.add(inner);
  const body = part(new THREE.CylinderGeometry(0.15, 0.25, 0.56, 8), paint(colour), { at: [0, 0.28, 0], into: inner });
  part(S.ball, paint(skin), { at: [0, 0.71, 0], size: 0.17, into: inner });
  if (kind === 'pirate') {
    part(S.disc, paint(0x1c1a1f), { at: [0, 0.84, 0], size: [0.25, 0.035, 0.25], into: inner });
    part(S.ball, paint(0x1c1a1f), { at: [0, 0.88, 0], size: [0.14, 0.09, 0.14], into: inner });
  } else {
    // Villagers wear a blue and white scarf, as anyone from Oldham might.
    part(S.disc, paint(0x1e5fa8), { at: [0, 0.57, 0], size: [0.2, 0.07, 0.2], into: inner });
    part(S.box, paint(0xf2f2f2), { at: [0.1, 0.44, 0.17], size: [0.07, 0.22, 0.03], into: inner });
    part(S.ball, paint(pick([0x5a3a22, 0x2b1b12, 0x9a9a9a, 0xb5722e])), { at: [0, 0.8, -0.03], size: [0.17, 0.11, 0.17], into: inner }); // hair
  }
  g.scale.setScalar(size);
  g.userData = { inner, body, size, colour, seed: rand(0, 6) };
  return g;
}

function hut(x, z, turn) {
  const g = new THREE.Group();
  part(S.rod, paint(0xcdaa72), { at: [0, 0.42, 0], size: [0.68, 0.84, 0.68], into: g });
  part(S.cone, paint(0xb38d3c), { at: [0, 1.3, 0], size: [0.98, 0.95, 0.98], into: g });
  part(S.box, paint(0x3a2414), { at: [0, 0.3, 0.66], size: [0.3, 0.6, 0.06], into: g });
  g.position.set(x, TURF, z);
  g.rotation.y = turn;
  scene.add(g);
}

function fire(x, y, z, size = 1) {
  const g = new THREE.Group();
  for (const [dx, dz, h, colour] of [[0, 0, 0.55, 0xff8a1e], [0.12, 0.08, 0.36, 0xffc23a], [-0.1, -0.06, 0.4, 0xff5a1e]]) {
    const f = part(S.cone, new THREE.MeshBasicMaterial({ color: colour }), { at: [dx, h / 2, dz], size: [0.16, h, 0.16], shadow: false, into: g });
    f.userData.h = h;
  }
  const lamp = new THREE.PointLight(0xff8a3c, 0, 14, 1.6);
  lamp.position.y = 0.6;
  g.add(lamp);
  g.position.set(x, y, z);
  g.scale.setScalar(size);
  g.userData = { lamp, seed: rand(0, 6), power: 26 * size, lit: 1 };
  flames.add(g);
  scene.add(g);
  return g;
}

function buildVillage() {
  for (const [x, z, turn] of [[3.6, 2.4, 0.5], [5.2, 1.1, 0.2], [7.0, 0.5, 0], [8.9, 0.8, -0.2], [10.5, 1.9, -0.5]]) hut(x, z, turn);

  // The Big Pan: iron, on three stones, with a fire under it.
  pan = new THREE.Group();
  const iron = paint(0x26272b, { rough: 0.55, side: THREE.DoubleSide });
  part(new THREE.CylinderGeometry(1.0, 0.8, 0.62, 14, 1, true), iron, { at: [0, 0.55, 0], into: pan });
  part(S.disc, iron, { at: [0, 0.26, 0], size: [0.8, 0.04, 0.8], into: pan });
  part(new THREE.TorusGeometry(1.0, 0.05, 6, 18).rotateX(Math.PI / 2), iron, { at: [0, 0.86, 0], into: pan });
  for (const side of [-1, 1]) part(new THREE.TorusGeometry(0.2, 0.04, 5, 10, Math.PI), iron, { at: [side * 1.02, 0.7, 0], turn: [0, 0, side * -1.57], into: pan });
  part(S.disc, paint(0x7a4a22, { rough: 0.5 }), { at: [0, 0.66, 0], size: [0.93, 0.03, 0.93], shadow: false, into: pan }); // gravy
  for (let i = 0; i < 3; i++) part(S.rock, paint(0x6f6a64), { at: [Math.cos(i * 2.1) * 0.7, 0.1, Math.sin(i * 2.1) * 0.7], size: 0.2, into: pan });
  pan.position.copy(SPOT.pan);
  scene.add(pan);
  panFire = fire(SPOT.pan.x, TURF + 0.02, SPOT.pan.z + 0.05, 0.9);

  // The sign.
  const sign = new THREE.Group();
  part(S.rod, paint(0x5b3d25), { at: [0, 1.45, 0], size: [0.06, 2.9, 0.06], into: sign });
  const words = decal((c, w, h) => {
    c.fillStyle = '#f1e3bd';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#3a2414';
    c.lineWidth = 10;
    c.strokeRect(5, 5, w - 10, h - 10);
    c.fillStyle = '#3a2414';
    c.textAlign = 'center';
    // Shrink each line until it fits inside the frame with room to spare.
    const fitted = (text, style, size, y) => {
      do c.font = `${style} ${size--}px Georgia, serif`;
      while (c.measureText(text).width > w - 90);
      c.fillText(text, w / 2, y);
    };
    fitted('NEW OLDHAM', 'bold', 66, 104);
    fitted('twinned with Oldham', 'italic', 36, 166);
  }, 512, 224);
  part(S.box, new THREE.MeshStandardMaterial({ map: words, roughness: 0.9 }), { at: [0, 2.75, 0.04], size: [1.7, 0.74, 0.05], into: sign });
  sign.position.set(6.0, TURF, 1.7);
  sign.rotation.y = 0.12;
  scene.add(sign);

  // Big Sandra: larger than anyone, in an apron, with a ladle.
  sandra = person(0x1e5fa8, { size: 1.75, kind: 'villager' });
  part(S.box, paint(0xf2efe6), { at: [0, 0.27, 0.2], size: [0.26, 0.4, 0.05], into: sandra.userData.inner });
  part(S.rod, paint(0x8a8f98), { at: [0.3, 0.5, 0.1], size: [0.02, 0.6, 0.02], turn: [0, 0, -0.5], into: sandra.userData.inner });
  part(S.ball, paint(0x8a8f98), { at: [0.45, 0.76, 0.1], size: 0.07, into: sandra.userData.inner });
  sandra.position.set(SPOT.pan.x + 1.7, TURF, SPOT.pan.z + 0.5);
  sandra.rotation.y = -0.7;
  scene.add(sandra);

  const tops = [0x8a5a3c, 0xa8773f, 0x6b7a4a, 0x9a4a3a, 0x556b7a, 0xb08d57];
  for (const [x, z, turn] of [[5.1, 2.3, 0.6], [6.2, 1.7, 0.3], [8.4, 1.9, -0.3], [9.6, 2.7, -0.6], [4.4, 2.9, 0.9], [11.5, 3.2, -1.2]]) {
    const v = person(pick(tops), { size: rand(0.95, 1.15), kind: 'villager' });
    v.position.set(x, TURF, z);
    v.rotation.y = turn;
    scene.add(v);
    villagers.push(v);
  }
}

// ---------------------------------------------------------------------------
// The volcano, and the cavern under it
// ---------------------------------------------------------------------------

let crater = null;
let smokeLevel = 0.5; // how hard the mountain is smoking

function buildVolcano() {
  const { x, z, base, top, height } = VOLCANO;
  const stone = paint(0x5a4a42, { rough: 1 });
  part(new THREE.CylinderGeometry(top, base, height, 11, 3), stone, { at: [x, height / 2, z], into: scene });
  part(new THREE.CylinderGeometry(base * 1.02, base * 1.25, 1.4, 11), paint(0x4c5a3c, { rough: 1 }), { at: [x, 0.3, z], into: scene }); // scrub round the foot
  // The crater: a glowing lid, and streaks of lava down the sides.
  part(S.disc, paint(0xff6a1f, { glow: 2.2 }), { at: [x, height - 0.12, z], size: [top * 0.86, 0.1, top * 0.86], shadow: false, into: scene });
  for (const a of [0.5, 1.5, 2.5, 4.2]) {
    const run = new THREE.Group();
    run.position.set(x, 0, z);
    run.rotation.y = a;
    const slope = Math.atan2(base - top, height);
    const mid = height / 2 + 1.6; // how far up the middle of the streak is
    part(S.box, paint(0xff5a1e, { glow: 1.6 }), { at: [base - (base - top) * (mid / height) + 0.05, mid, 0], size: [0.07, height * 0.62, 0.22], turn: [0, 0, slope], shadow: false, into: run });
    scene.add(run);
  }
  crater = new THREE.PointLight(0xff5a1e, 0, 40, 1.4);
  crater.position.set(x, height + 1.5, z);
  scene.add(crater);
  for (let i = 0; i < 12; i++) {
    const a = rand(0, 6.3);
    const r = rand(base * 0.75, base * 1.1);
    rock(x + Math.cos(a) * r, rand(0.8, 2.2), z + Math.sin(a) * r, rand(0.4, 0.9), 0x4a3d37);
  }
}

let dragon = null;
let caveLamps = [];
const heapAt = (r) => Math.max(0, 3.1 * (1 - r / 5.2)); // how high the pile of gold is, r from its middle

function buildCave() {
  const cave = new THREE.Group();
  cave.position.copy(CAVE);
  const dark = [0x2b2422, 0x332a27, 0x241e1c, 0x3b302b];
  part(S.disc, paint(0x2a2320, { rough: 1 }), { at: [0, -0.5, 0], size: [26, 1, 26], into: cave });
  // The walls: a horseshoe of rock teeth, open towards the camera.
  for (let i = 0; i < 46; i++) {
    const a = Math.PI * (0.92 + (i / 45) * 1.16) + rand(-0.03, 0.03); // round the back, from one side to the other
    const r = rand(11.5, 17);
    const h = rand(5, 15);
    part(S.cone, paint(pick(dark), { rough: 1 }), { at: [Math.cos(a) * r, h / 2, Math.sin(a) * r * 0.8 - 1], size: [rand(1.6, 3.4), h, rand(1.6, 3.4)], turn: [rand(-0.06, 0.06), rand(0, 3), rand(-0.06, 0.06)], into: cave });
  }
  for (let i = 0; i < 16; i++) part(S.cone, paint(pick(dark), { rough: 1 }), { at: [rand(-13, 13), rand(13.5, 16), rand(-9, 1)], size: [rand(0.5, 1.3), rand(2.5, 6), rand(0.5, 1.3)], turn: [Math.PI, 0, 0], shadow: false, into: cave });
  // Lava, at the sides.
  for (const [x, z, r] of [[-9.5, 2.5, 2.4], [9.8, 1.2, 2.8], [-6, -5.5, 1.8], [7, -6, 1.6]]) {
    part(S.disc, paint(0xff5a1e, { glow: 2.4 }), { at: [x, 0.03, z], size: [r, 0.06, r * 0.7], shadow: false, into: cave });
    const lamp = new THREE.PointLight(0xff5a1e, 0, 30, 1.5);
    lamp.position.set(x, 1.2, z);
    lamp.userData.power = 90;
    cave.add(lamp);
    caveLamps.push(lamp);
  }
  // The hoard.
  const gold = paint(0xdfa51e, { rough: 0.4 });
  part(new THREE.ConeGeometry(5.2, 3.1, 13), gold, { at: [0, 1.55, 0], into: cave });
  for (let i = 0; i < 90; i++) {
    const a = rand(0, 6.3);
    const r = rand(0.4, 7.2);
    part(S.disc, gold, { at: [Math.cos(a) * r, heapAt(r) + 0.05, Math.sin(a) * r], size: [0.16, 0.035, 0.16], turn: [rand(-0.5, 0.5), 0, rand(-0.5, 0.5)], into: cave });
  }
  for (let i = 0; i < 14; i++) {
    const a = rand(0, 6.3);
    const r = rand(0.5, 5);
    part(S.rock, paint(pick([0xc8372d, 0x2ec4b6, 0x4ea8de, 0xb388eb]), { rough: 0.2, glow: 0.3 }), { at: [Math.cos(a) * r, heapAt(r) + 0.14, Math.sin(a) * r], size: rand(0.1, 0.2), into: cave });
  }
  const glint = new THREE.PointLight(0xffc45a, 0, 26, 1.4);
  glint.position.set(0, 6.5, 3);
  glint.userData.power = 38;
  cave.add(glint);
  caveLamps.push(glint);
  scene.add(cave);

  dragon = makeDragon();
  dragon.group.position.copy(CAVE);
  scene.add(dragon.group);
}

/**
 * The dragon: a chain of beads from tail to head, a head, and two wings. It
 * has two poses, asleep (coiled round the top of the hoard) and awake (the
 * front half reared up), and `wake` slides between them.
 */
function makeDragon() {
  const group = new THREE.Group();
  const hide = paint(0x2f7d4f, { rough: 0.6 });
  const dark = paint(0x245f3d, { rough: 0.6, side: THREE.DoubleSide });
  const horn = paint(0xe8d9a8, { rough: 0.5 });
  const N = 24;
  const beads = [];
  for (let i = 0; i < N; i++) {
    const s = i / (N - 1);
    const fat = 0.22 + Math.sin(Math.min(1, s * 1.25) * Math.PI) ** 0.7 * 0.62;
    const bead = part(S.ball, hide, { size: [fat, fat * 0.92, fat], into: group });
    if (i % 2 === 0 && i > 1 && i < N - 1) part(S.cone, horn, { at: [0, 1.05, 0], size: [0.22, 0.6, 0.22], into: bead }); // spines
    beads.push(bead);
  }
  const head = new THREE.Group();
  part(S.ball, hide, { size: [0.62, 0.52, 0.7], into: head });
  part(S.box, hide, { at: [0, -0.02, 0.78], size: [0.62, 0.36, 0.95], into: head });
  const jaw = part(S.box, paint(0x3a9160, { rough: 0.6 }), { at: [0, -0.3, 0.66], size: [0.52, 0.16, 0.9], into: head });
  for (const side of [-1, 1]) {
    part(S.cone, horn, { at: [side * 0.34, 0.5, -0.4], size: [0.13, 0.85, 0.13], turn: [-0.8, 0, side * -0.35], into: head });
    part(S.ball, paint(0x10231a), { at: [side * 0.2, 0.08, 1.24], size: 0.06, into: head }); // nostrils
  }
  const eyes = [-1, 1].map((side) => part(S.ball, paint(0xffd23f, { glow: 2.6 }), { at: [side * 0.42, 0.22, 0.32], size: [0.11, 0.11, 0.11], shadow: false, into: head }));
  group.add(head);

  const wings = [-1, 1].map((side) => {
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(3.6, 1.9), new THREE.Vector2(3.0, 0.2), new THREE.Vector2(2.3, -0.9), new THREE.Vector2(1.2, -0.5)]);
    const g = new THREE.ShapeGeometry(shape);
    if (side < 0) g.scale(-1, 1, 1);
    const wing = part(g, dark, { into: group });
    wing.userData.side = side;
    return wing;
  });
  const fireLamp = new THREE.PointLight(0xff7a2a, 0, 28, 1.3);
  group.add(fireLamp);
  return { group, beads, head, jaw, eyes, wings, fireLamp, N, wake: 0, recoil: 0, down: 0, aim: V(0, 1, 8), breathing: 0, sink: 0 };
}

const _a = V(0, 0, 0);
const _b = V(0, 0, 0);

/** Where bead `s` (0 = tail, 1 = head) sits, asleep and awake. */
function dragonSpine(s, t, out, awake) {
  const turn = s * 5.6 + 0.6;
  const r = 3.5 - s * 1.9;
  out.set(Math.cos(turn) * r, heapAt(r) + 0.45, Math.sin(turn) * r);
  if (!awake || s < 0.5) return out;
  // Awake: the front half lifts off the gold in an S, swaying, with the head out over the crew.
  const u = (s - 0.5) / 0.5;
  dragonSpine(0.5, t, _b, false);
  const lift = Math.sin(u * Math.PI * 0.5);
  out.set(_b.x * (1 - u) + Math.sin(t * 0.9 + u * 2) * 0.5 * u, _b.y + lift * 5.4 + Math.sin(u * Math.PI) * 0.4, _b.z + (1.2 - _b.z) * u + Math.sin(u * Math.PI) * -1.4 + u * 2.6);
  return out;
}

function poseDragon(t) {
  const d = dragon;
  for (let i = 0; i < d.N; i++) {
    const s = i / (d.N - 1);
    dragonSpine(s, t, _a, false);
    const sx = _a.x;
    const sy = _a.y;
    const sz = _a.z;
    dragonSpine(s, t, _a, true);
    const b = d.beads[i];
    const pull = Math.max(0, s - 0.5) * 2; // how much of a flinch reaches this bead
    b.position.set(sx + (_a.x - sx) * d.wake, sy + (_a.y - sy) * d.wake - d.down * pull * 3.8 - d.sink, sz + (_a.z - sz) * d.wake - d.recoil * pull * 2.6);
    b.position.y += Math.sin(t * 1.3 + s * 3) * 0.035; // breathing
  }
  const neck = d.beads[d.N - 1].position;
  const before = d.beads[d.N - 3].position;
  d.head.position.copy(neck).addScaledVector(_a.copy(neck).sub(before).normalize(), 0.75);
  _b.copy(d.head.position).add(_a); // asleep: nose along the coil
  _b.lerp(d.aim, d.wake * (1 - d.down)); // awake: eyes on the crew
  d.head.lookAt(_b.x + d.group.position.x, _b.y, _b.z + d.group.position.z);
  d.jaw.rotation.x = d.breathing * 0.55;
  const open = Math.max(0.08, Math.min(1, d.wake * 1.6) * (1 - d.down));
  for (const eye of d.eyes) eye.scale.y = 0.11 * open;
  // Wings: folded along the back asleep, half open awake, beating slowly.
  const root = d.beads[Math.round(d.N * 0.52)].position;
  for (const wing of d.wings) {
    const side = wing.userData.side;
    wing.position.set(root.x + side * 0.4, root.y + 0.3, root.z);
    const spread = d.wake * (1 - d.down);
    wing.rotation.set(-0.3 * spread, side * (1.2 - spread * 0.9), side * (0.15 + spread * (0.55 + Math.sin(t * 1.7) * 0.16)));
    wing.scale.setScalar(0.55 + spread * 0.75);
  }
  d.fireLamp.position.copy(d.head.position).add(_a.set(0, 0, 1.2));
  d.fireLamp.intensity = d.breathing * 160;
}

// ---------------------------------------------------------------------------
// The cast: the crew, the monkey, the cross, and the ships that come at the end
// ---------------------------------------------------------------------------

const crew = new Map(); // player id -> their carved pirate
let band = null; // the group the whole crew stands in
let props = {}; // what they carry: the stick, the cask, the pan lid
let monkey = null;
let cross = null;
let ship = null;
let beacon = null;

function buildCast() {
  band = new THREE.Group();
  band.visible = false;
  scene.add(band);

  // Kit the crew carries about with them.
  props.stick = part(S.rod, paint(0x7a5230), { at: [0.3, 0.75, 0.25], size: [0.035, 1.25, 0.035], turn: [0.25, 0, -0.35], into: band });
  props.rum = new THREE.Group();
  part(S.rod, paint(0x8a5a2e), { at: [0, 0.2, 0], size: [0.2, 0.42, 0.2], turn: [0, 0, 1.57], into: props.rum });
  for (const dx of [-0.13, 0.13]) part(S.rod, paint(0x2b2d33), { at: [dx, 0.2, 0], size: [0.215, 0.04, 0.215], turn: [0, 0, 1.57], into: props.rum });
  props.rum.position.set(-0.7, 0, 0.75);
  band.add(props.rum);
  props.pan = part(new THREE.CylinderGeometry(0.34, 0.26, 0.22, 10), paint(0x26272b, { rough: 0.55 }), { at: [0, 1.0, 0], into: band });
  for (const p of Object.values(props)) p.visible = false;

  // The monkey: an ordinary monkey, on all fours.
  monkey = new THREE.Group();
  const body = new THREE.Group();
  monkey.add(body);
  const fur = paint(0x7a4a2a);
  const face = paint(0xd6a676);
  part(S.ball, fur, { at: [0, 0.36, 0], size: [0.19, 0.17, 0.3], into: body });
  part(S.ball, fur, { at: [0, 0.52, 0.3], size: 0.15, into: body });
  part(S.ball, face, { at: [0, 0.48, 0.42], size: [0.09, 0.08, 0.07], into: body });
  for (const side of [-1, 1]) part(S.ball, face, { at: [side * 0.15, 0.56, 0.27], size: 0.05, into: body });
  const legs = [];
  for (const [x, z] of [[-0.11, 0.2], [0.11, 0.2], [-0.11, -0.2], [0.11, -0.2]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.32, z);
    part(S.rod, fur, { at: [0, -0.16, 0], size: [0.04, 0.32, 0.04], into: leg });
    body.add(leg);
    legs.push(leg);
  }
  part(new THREE.TorusGeometry(0.2, 0.028, 5, 10, Math.PI * 1.2), fur, { at: [0, 0.56, -0.38], turn: [0, 1.57, 0.5], into: body });
  monkey.userData = { body, legs, walking: false };
  monkey.scale.setScalar(1.25);
  monkey.visible = false;
  scene.add(monkey);

  // The cross: the stick, and one other stick, with the monkey hung up on the front of it.
  // He is built again here, upright and facing us, rather than bending the walking model into shape.
  cross = new THREE.Group();
  part(S.rod, paint(0x7a5230), { at: [0, 1.05, 0], size: [0.055, 2.1, 0.055], into: cross });
  part(S.rod, paint(0x6b4526), { at: [0, 1.5, 0], size: [0.05, 1.3, 0.05], turn: [0, 0, 1.57], into: cross });
  const hung = new THREE.Group();
  part(S.ball, fur, { at: [0, 1.22, 0], size: [0.18, 0.27, 0.15], into: hung }); // body
  part(S.ball, fur, { at: [0, 1.6, 0.02], size: 0.16, into: hung }); // head
  part(S.ball, face, { at: [0, 1.56, 0.14], size: [0.1, 0.085, 0.07], into: hung });
  for (const side of [-1, 1]) {
    part(S.ball, face, { at: [side * 0.17, 1.63, 0], size: 0.055, into: hung }); // ears
    part(S.ball, paint(0x1c1a1f), { at: [side * 0.06, 1.64, 0.15], size: 0.022, shadow: false, into: hung }); // eyes
    part(S.box, paint(0x1c1a1f), { at: [side * 0.065, 1.685, 0.155], size: [0.075, 0.018, 0.02], turn: [0, 0, side * -0.5], shadow: false, into: hung }); // and he looks very cross
    part(S.rod, fur, { at: [side * 0.34, 1.44, 0], size: [0.038, 0.5, 0.038], turn: [0, 0, 1.57 + side * 0.22], into: hung }); // arms, out along the beam
    part(S.rod, paint(0xd8c9a0), { at: [side * 0.55, 1.5, 0], size: [0.06, 0.07, 0.075], turn: [0, 0, 1.57], into: hung }); // rope at the wrists
    part(S.rod, fur, { at: [side * 0.07, 0.82, 0], size: [0.042, 0.42, 0.042], turn: [0, 0, side * 0.08], into: hung }); // legs
  }
  part(new THREE.TorusGeometry(0.17, 0.026, 5, 10, Math.PI * 1.3), fur, { at: [0.2, 0.92, -0.02], turn: [0, 0, -1.2], into: hung }); // tail
  hung.position.z = 0.14; // in front of the wood
  cross.add(hung);
  cross.position.copy(SPOT.cross);
  cross.rotation.y = 0.12; // square on to the camera
  cross.visible = false;
  scene.add(cross);

  beacon = fire(SPOT.summit.x + 0.9, SPOT.summit.y + 0.1, SPOT.summit.z + 1.5, 3.6);
  beacon.visible = false;
  beacon.userData.lit = 0;
}

/** A little disc with a player's mascot on it, floating over their pirate so they can find themselves. */
function badge(p) {
  const tex = decal((c, w) => {
    c.fillStyle = p.color;
    c.beginPath();
    c.arc(w / 2, w / 2, w / 2 - 6, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 8;
    c.strokeStyle = '#fff8e4';
    c.stroke();
    c.font = `${w * 0.56}px serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(p.avatar, w / 2, w / 2 + 6);
  }, 128, 128);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false }));
  sprite.scale.setScalar(0.36);
  sprite.position.y = 1.28;
  return sprite;
}

/** Make sure there is one pirate for everybody in the game. */
function syncCrew(ids) {
  if (ids.every((id) => crew.has(id)) && crew.size === ids.length) return;
  for (const [id, f] of crew) {
    band.remove(f);
    crew.delete(id);
  }
  ids.forEach((id) => {
    const p = players.get(id);
    const f = person(p?.color ?? '#c8372d');
    if (p) f.add(badge(p));
    f.userData.id = id;
    band.add(f);
    crew.set(id, f);
  });
  formation = null;
  form('clump', true);
}

let formation = null;

/** Arrange the crew: a loose clump, a ring (sat in the pan), or a row. */
function form(kind, snap = false) {
  if (kind === formation) return;
  formation = kind;
  const list = [...crew.values()];
  const n = list.length;
  list.forEach((f, i) => {
    let to;
    if (kind === 'pan') {
      const a = (i / n) * Math.PI * 2;
      const r = n === 1 ? 0 : n <= 6 ? 0.5 : i % 2 ? 0.62 : 0.28;
      to = V(Math.cos(a) * r, -0.06, Math.sin(a) * r); // up to their chests in gravy
    } else if (kind === 'row') {
      to = V((i - (n - 1) / 2) * 0.62, 0, 0);
    } else {
      const per = Math.ceil(n / 2);
      const row = i < per ? 0 : 1;
      const col = row === 0 ? i : i - per;
      to = V((col - ((row === 0 ? per : n - per) - 1) / 2) * 0.66 + rand(-0.06, 0.06), 0, row * 0.6 - 0.3 + rand(-0.06, 0.06));
    }
    const from = f.position.clone();
    tween(snap ? 0.01 : 0.9, (k) => f.position.lerpVectors(from, to, k), { delay: snap ? 0 : i * 0.05 });
    f.scale.setScalar(kind === 'pan' ? 0.72 : 1);
  });
}

/** Show what the crew is carrying. */
function carry(has) {
  const held = new Set(has);
  props.stick.visible = held.has('stick');
  props.rum.visible = held.has('rum');
  props.pan.visible = held.has('pan');
  // The stick goes to the first pirate, the pan lid onto the second one's head.
  const list = [...crew.values()];
  if (list[0]) props.stick.position.set(list[0].position.x + 0.26, 0.72, list[0].position.z + 0.12);
  const wearer = list[1] ?? list[0];
  if (wearer) props.pan.position.set(wearer.position.x, 0.98 * wearer.scale.y, wearer.position.z);
}

/** Walk the whole crew somewhere. They bob as they go. */
function walkCrew(to, seconds, { snap = false, face = null, done = null } = {}) {
  band.visible = true;
  const from = band.position.clone();
  const far = from.distanceTo(to);
  if (snap || far < 0.05) {
    band.position.copy(to);
    if (face !== null) band.rotation.y = face;
    done?.();
    return;
  }
  band.rotation.y = face ?? Math.atan2(to.x - from.x, to.z - from.z);
  walking = true;
  tween(seconds, (k) => band.position.lerpVectors(from, to, k), {
    ease: easeInOut,
    done: () => {
      walking = false;
      for (const f of crew.values()) f.userData.inner.position.y = 0;
      done?.();
    },
  });
}
let walking = false;

function hop(f, times = 2, height = 0.5) {
  if (!f) return;
  tween(0.42 * times, (k, raw) => (f.userData.inner.position.y = Math.abs(Math.sin(raw * Math.PI * times)) * height), { ease: linear, done: () => (f.userData.inner.position.y = 0) });
}

/** A pratfall: flat on their face, a puff of dust, and (unless they are staying down for good) straight back up. */
function topple(f, stayDown = 0.8) {
  if (!f) return;
  const inner = f.userData.inner;
  const scene = now.key;
  tween(0.28, (k) => (inner.rotation.x = k * 1.5), { ease: (k) => k * k });
  after(0.28, () => {
    const at = f.getWorldPosition(V(0, 0, 0));
    for (let i = 0; i < 3; i++) puff(V(at.x + rand(-0.2, 0.2), at.y + 0.1, at.z + rand(-0.2, 0.2)), { colour: 0xe6dcc6, size: rand(0.12, 0.22), rise: 0.5, life: 0.6 });
  });
  if (stayDown > 60) return;
  tween(0.3, (k) => (inner.rotation.x = 1.5 * (1 - k)), { delay: 0.28 + Math.min(stayDown, 1.1), done: () => now.key === scene && hop(f, 1, 0.25) });
}

/** Stand everybody up straight. Called whenever the story moves on, so nobody is left lying about. */
function upright() {
  for (const f of crew.values()) {
    f.userData.inner.rotation.set(0, 0, 0);
    f.userData.inner.position.y = 0;
  }
}

function everyone(fn, gap = 0.07) {
  [...crew.values()].forEach((f, i) => after(i * gap, () => fn(f)));
}

/** Turn the crew to charcoal (and back). */
function scorch(on) {
  for (const f of crew.values()) f.userData.body.material = paint(on ? 0x1a1513 : f.userData.colour);
}

// ----- the monkey -----

function monkeyTo(state, snap = false) {
  const m = monkey;
  if (m.userData.state === state) return;
  m.userData.state = state;
  m.userData.walking = false;
  m.userData.body.rotation.set(0, 0, 0);
  m.userData.body.position.set(0, 0, 0);
  for (const leg of m.userData.legs) leg.rotation.x = 0;
  cross.visible = state === 'cross';
  m.visible = state === 'walk' || state === 'down';
  if (state === 'walk') {
    // Out of the woods, into the middle of the village, and stop.
    const from = SPOT.woods.clone();
    const to = SPOT.monkey.clone();
    m.position.copy(from);
    m.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    m.userData.walking = true;
    tween(snap ? 0.01 : 6.5, (k) => m.position.lerpVectors(from, to, k), { ease: linear, done: () => { m.userData.walking = false; m.rotation.y = 1.45; } }); // and turns to look at the crew
  } else if (state === 'down') {
    m.position.y = TURF;
    m.userData.body.rotation.z = Math.PI; // flat on his back, legs in the air
    m.userData.body.position.y = 0.62;
    m.userData.legs.forEach((leg, i) => (leg.rotation.x = i < 2 ? -0.5 : 0.5));
  }
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** A puff of smoke (or anything round that swells and fades away by shrinking). */
function puff(at, { colour = 0xd9d4cc, size = 0.3, rise = 0.8, life = 1.1, drift = null, glow = 0 } = {}) {
  const m = part(S.ball, paint(colour, { glow, rough: 1 }), { at: at.toArray(), size: 0.01, shadow: false, into: fx });
  const d = drift ?? V(rand(-0.25, 0.25), rise, rand(-0.25, 0.25));
  const start = at.clone();
  tween(life, (k, raw) => {
    m.position.copy(start).addScaledVector(d, raw);
    m.scale.setScalar(Math.max(0.001, size * Math.sin(Math.min(1, raw * 1.15) * Math.PI) ** 0.6 * (0.6 + raw * 0.8)));
  }, { ease: linear, done: () => fx.remove(m) });
}

/** A flare of light that dies away. */
function flare(at, colour, seconds, strength = 40, reach = 12) {
  const lamp = new THREE.PointLight(colour, strength, reach, 1.6);
  lamp.position.copy(at);
  fx.add(lamp);
  tween(seconds, (k) => (lamp.intensity = strength * (1 - k)), { done: () => fx.remove(lamp) });
}

/** Something thrown: it flies up and out, comes down, and is gone. */
function fling(mesh, from, velocity, life, spin = 0) {
  mesh.position.copy(from);
  fx.add(mesh);
  const size = mesh.scale.clone();
  tween(life, (k, raw) => {
    const t = raw * life;
    mesh.position.set(from.x + velocity.x * t, from.y + velocity.y * t - 4.9 * t * t, from.z + velocity.z * t);
    mesh.rotation.x += spin;
    if (raw > 0.8) mesh.scale.copy(size).multiplyScalar((1 - raw) / 0.2);
  }, { ease: linear, done: () => fx.remove(mesh) });
}

function firework(at) {
  const colour = pick([0xf7c948, 0xe4572e, 0x17bebb, 0xf78fb3, 0x9bc53d, 0xffffff]);
  for (let i = 0; i < 26; i++) {
    const spark = part(S.ball, paint(colour, { glow: 2.4 }), { size: rand(0.12, 0.2), shadow: false });
    const dir = V(rand(-1, 1), rand(-0.4, 1), rand(-1, 1)).normalize().multiplyScalar(rand(3.5, 7));
    fling(spark, at, dir.add(V(0, 4, 0)), rand(1.1, 1.7));
  }
  flare(at, colour, 0.9, 120, 40);
}

/** Fire, loosely aimed: a burst of glowing puffs at a spot. */
function blaze(at, size = 1, count = 10) {
  for (let i = 0; i < count; i++) {
    after(i * 0.05, () => puff(V(at.x + rand(-0.6, 0.6) * size, at.y + rand(0, 0.5), at.z + rand(-0.5, 0.5) * size), { colour: pick([0xff8a1e, 0xffc23a, 0xff5a1e]), glow: 2, size: rand(0.35, 0.7) * size, rise: rand(1, 2.2), life: rand(0.6, 1.1) }));
  }
  for (let i = 0; i < 5; i++) after(0.4 + i * 0.12, () => puff(V(at.x + rand(-0.5, 0.5), at.y + 0.6, at.z + rand(-0.4, 0.4)), { colour: pick([0x3c3835, 0x57514b]), size: rand(0.3, 0.6) * size, rise: rand(1.5, 2.6), life: rand(1.2, 2) }));
  flare(V(at.x, at.y + 1, at.z), 0xff7a2a, 1.2, 60 * size, 14);
}

/** The dragon breathes fire at a spot for a while. */
function breathe(target, seconds, size = 1) {
  const d = dragon;
  d.aim.copy(target).sub(d.group.position);
  tween(0.5, (k) => (d.breathing = k));
  tween(0.6, (k) => (d.breathing = 1 - k), { delay: seconds });
  sound.play('opRoar');
  for (let t = 0.35; t < seconds; t += 0.045) {
    after(t, () => {
      const from = d.head.getWorldPosition(V(0, 0, 0));
      const to = V(target.x + rand(-1.2, 1.2) * size, target.y + rand(0, 1.2), target.z + rand(-0.6, 0.6) * size);
      const dir = to.clone().sub(from);
      from.addScaledVector(dir.clone().normalize(), 1.4);
      puff(from, { colour: pick([0xff8a1e, 0xffc23a, 0xff5a1e, 0xfff0a0]), glow: 2.4, size: rand(0.5, 1.0) * size, life: rand(0.55, 0.8), drift: to.sub(from) });
    });
  }
  shake = Math.max(shake, 0.12);
}

/** Cut to somewhere else: down to black, do it, and back up. */
function cut(fn, snap = false) {
  if (snap) return fn();
  wash.style.transition = 'opacity 0.5s';
  wash.style.background = '#000';
  wash.style.opacity = 1;
  after(0.55, () => {
    fn();
    after(0.15, () => (wash.style.opacity = 0), true);
  }, true);
}

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

/** Move the camera to a shot, by way of one of the MOVES. */
function shot(name, seconds = 3.5, snap = false, move = MOVES.entry) {
  const base = SHOTS[name];
  cam.name = name;
  const tight = name === 'cave' ? 0.45 : 1; // the cavern is one big picture: the moves there are gentler
  const to = { at: V(base.at[0], base.at[1] + (move.lift ?? 0) * tight, base.at[2]), dist: base.dist * (1 + (move.dist - 1) * tight), up: Math.max(0.07, base.up + move.up * tight), round: base.round + move.round * tight };
  const from = { at: cam.at.clone(), dist: cam.dist, up: cam.up, round: cam.round };
  if (cam.tween) tweens.delete(cam.tween);
  cam.push = 0;
  cam.spin = 0;
  cam.tween = tween(snap ? 0.01 : seconds, (k) => {
    cam.at.lerpVectors(from.at, to.at, k);
    cam.dist = from.dist + (to.dist - from.dist) * k;
    cam.up = from.up + (to.up - from.up) * k;
    cam.round = from.round + (to.round - from.round) * k;
  }, {
    ease: easeInOut,
    done: () => {
      cam.tween = null;
      cam.push = move.push ?? 0; // once it has arrived, it keeps drifting
      cam.spin = move.spin ?? 0;
    },
  });
}

/** Cut to a shot from far out, and glide in. For arriving somewhere by a cut rather than on foot. */
function glideIn(name, seconds = 7) {
  shot(name, 0, true, MOVES.from);
  after(0.05, () => shot(name, seconds, false, MOVES.entry));
}

function aimCamera(jx = 0, jy = 0) {
  const { at, dist, up } = cam;
  const round = cam.round + Math.sin(clock * 0.17) * 0.03; // a slow sway, so the picture is never quite still
  camera.position.set(at.x + Math.sin(round) * Math.cos(up) * dist + jx, at.y + Math.sin(up) * dist + jy, at.z + Math.cos(round) * Math.cos(up) * dist);
  camera.lookAt(at.x + jx * 0.6, at.y, at.z);
  // Keep the shadows round whatever the camera is looking at.
  sun.target.position.copy(at);
  sun.position.copy(at).addScaledVector(sunDir, 60);
}

function fit() {
  if (!layer) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const unit = Math.min(w / 1920, h / 1080); // one "TV pixel", the same scale host.js uses for its stage
  layer.style.setProperty('--u', unit);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // The log page covers the left of the stage, so slide the picture across: what the
  // camera looks at lands in the middle of the space that is left.
  const pageRight = (w - 1920 * unit) / 2 + 676 * unit;
  const middle = (pageRight + w) / 2;
  camera.setViewOffset(w, h, -(middle - w / 2), 0, w, h);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------
// Stage directions
// ---------------------------------------------------------------------------

const STAGE = { sea: 0, beach: 1, jungle: 2, pan: 3, feast: 3, monkey: 3, cross: 3, volcano: 4, hoard: 5, dragon: 5 };
let now = { key: null, phase: null, set: null };
let inCave = false;

function outdoors(snap) {
  if (!inCave) return;
  inCave = false;
  sea.visible = true;
  scene.fog.near = 50;
  scene.fog.far = 170;
  for (const lamp of caveLamps) lamp.intensity = 0;
}

function intoCave() {
  inCave = true;
  sea.visible = false;
  scene.fog.near = 34;
  scene.fog.far = 90;
  for (const lamp of caveLamps) lamp.intensity = lamp.userData.power;
}

/** The story has moved somewhere new. */
function arrive(view, w, snap) {
  const set = w.set;
  now.set = set;
  if (!(w.ending === 'diabolical')) upright();
  const has = new Set(w.has);
  liftMist(w.ending ? 5 : (STAGE[set] ?? 5), snap);
  panFire.userData.lit = 1;
  crater.intensity = 0;
  smokeLevel = 0.5;

  if (w.ending) return arriveEnding(w, snap);

  // The monkey's whereabouts follow from how far the story has got.
  const stage = STAGE[set] ?? 0;
  if (set === 'monkey') monkeyTo('walk', snap);
  else if (set === 'cross' || stage > 3) monkeyTo('cross', true);
  else monkeyTo('hidden', true);

  const wasCave = inCave;
  const toCave = set === 'hoard' || set === 'dragon';
  if (toCave !== wasCave) {
    return cut(() => {
      if (toCave) intoCave();
      else outdoors();
      place(set, w, has, true);
    }, snap);
  }
  place(set, w, has, snap);
}

/** Put the camera, the light and the crew where a set needs them. */
function place(set, w, has, snap) {
  switch (set) {
    case 'sea':
    case 'muster':
      setMood(set === 'muster' ? 'dusk' : 'dawn', snap ? 0.01 : 3);
      shot('sea', 6, snap, MOVES.still);
      band.visible = set === 'muster';
      if (set === 'muster') walkCrew(SPOT.beach, 0, { snap: true, face: 0.4 });
      break;
    case 'beach':
      setMood('dawn', snap ? 0.01 : 3);
      shot('beach', 5, snap);
      form('clump', snap);
      walkCrew(SPOT.beach, 0, { snap: true, face: -0.5 });
      // The wreck settles lower on the reef while they argue.
      tween(40, (k) => (wreck.position.y = wreck.userData.home.y - k * 0.5), { ease: linear });
      break;
    case 'jungle':
      setMood('noon', snap ? 0.01 : 4);
      shot('jungle', 5.5, snap);
      form('clump', snap);
      walkCrew(SPOT.jungle, 5, { snap });
      break;
    case 'pan':
      setMood('dusk', snap ? 0.01 : 4);
      shot('village', 5, snap);
      // Carried in, and dropped in the pot.
      walkCrew(V(SPOT.pan.x, TURF + 0.62, SPOT.pan.z), 3.6, { snap, done: () => form('pan') });
      if (snap) form('pan', true);
      break;
    case 'feast':
      setMood('dusk', snap ? 0.01 : 4);
      shot('village', 5, snap);
      form('row', snap);
      walkCrew(SPOT.feast, 4.2, { snap, face: 0 });
      break;
    case 'monkey':
      setMood('noon', snap ? 0.01 : 3);
      shot('monkey', 4, snap);
      if (has.has('potted')) {
        // Let out of the pan for the purpose.
        form('pan', true);
        walkCrew(V(SPOT.pan.x, TURF + 0.62, SPOT.pan.z), 0, { snap: true });
        after(snap ? 0 : 3, () => {
          form('clump');
          walkCrew(SPOT.feast, 1.6, { face: -1.45 });
        });
      } else {
        form('clump', snap);
        walkCrew(SPOT.feast, 2, { snap, face: -1.45 });
      }
      sound.play('opMonkey');
      break;
    case 'cross':
      setMood('noon', snap ? 0.01 : 2);
      shot('cross', 4, snap);
      form('clump', snap);
      walkCrew(SPOT.trial, 2.5, { snap, face: -1.45 });
      break;
    case 'volcano':
      setMood('ash', snap ? 0.01 : 5);
      shot('volcano', 6, snap);
      form('clump', snap);
      smokeLevel = 1.6;
      crater.intensity = 260;
      walkCrew(SPOT.slope, 0, { snap: true, face: 0.2 });
      break;
    case 'hoard':
    case 'dragon': {
      setMood('cave', 0.01);
      if (set === 'hoard' && !snap) glideIn('cave', 9);
      else shot('cave', snap ? 0 : 2.5, snap);
      form('clump', true);
      const z = SPOT.cave.z - Math.max(-3, Math.min(3, w.marker)) * 0.55; // winning ground, or giving it
      walkCrew(V(SPOT.cave.x, 0, z), 0, { snap: true, face: Math.PI });
      Object.assign(dragon, { down: 0, sink: 0, recoil: 0 });
      scorch(false);
      if (set === 'hoard') {
        dragon.wake = 0;
        // It sleeps through most of the entry, and then it does not.
        tween(2.4, (k) => (dragon.wake = k * 0.45), { delay: snap ? 0 : 15, ease: easeInOut });
      } else {
        const from = dragon.wake;
        tween(1.8, (k) => (dragon.wake = from + (1 - from) * k), { ease: easeInOut });
        dragon.aim.set(0, 1.2, z);
        if (from < 0.9) sound.play('opRoar');
      }
      break;
    }
  }
}

/** A roll has been counted and its outcome announced. */
function react(view, w) {
  const result = view.band;
  const good = result === 'good' || result === 'perfect';
  const poor = result === 'bad' || result === 'diabolical';
  const has = new Set(w.has);
  const here = band.position.clone();
  hop(crew.get(view.hero), result === 'perfect' ? 4 : 2);
  after(0.5, () => topple(crew.get(view.jonah)));

  switch (w.set) {
    case 'beach':
      if (poor) for (let i = 0; i < 8; i++) puff(V(here.x + rand(-0.8, 0.8), SAND + 0.2, here.z + rand(-0.5, 0.8)), { colour: 0xbfe6f2, size: rand(0.2, 0.45), rise: rand(0.8, 1.6), life: rand(0.6, 1.1) });
      tween(3, (k) => (wreck.position.y = Math.min(wreck.position.y, wreck.userData.home.y - 0.5 - k * (result === 'neutral' ? 0.3 : 0.9))), {});
      break;
    case 'pan':
    case 'feast':
      if (has.has('potted')) {
        walkCrew(V(SPOT.pan.x, TURF + 0.62, SPOT.pan.z), 1.6, { done: () => form('pan') });
      } else if (w.set === 'pan') {
        form('row');
        walkCrew(SPOT.feast, 1.8, { face: 0 });
      }
      if (good) for (const v of villagers) hop(v, 2, 0.3);
      break;
    case 'monkey': {
      // However it goes, it ends the same way: with the stick.
      const m = monkey;
      const home = m.position.clone();
      const brawl = result === 'perfect' ? 0 : result === 'good' ? 1 : result === 'neutral' ? 2 : 4;
      for (let i = 0; i < brawl; i++) {
        after(i * 0.9, () => {
          tween(0.4, (k) => m.position.lerpVectors(home, here, k * 0.8), {});
          tween(0.4, (k) => m.position.lerpVectors(here, home, 0.2 + k * 0.8), { delay: 0.45 });
          if (poor) everyone((f) => topple(f, 0.5), 0.04);
        });
      }
      after(brawl * 0.9 + 0.3, () => {
        everyone((f) => hop(f, 1, 0.35));
        const scene = now.key;
        tween(0.5, (k, raw) => (m.position.y = TURF + Math.sin(raw * Math.PI) * 1.4), { ease: linear, done: () => now.key === scene && monkeyTo('down') });
        for (let i = 0; i < 5; i++) puff(V(home.x, TURF + 0.3, home.z), { colour: 0xe6dcc6, size: rand(0.2, 0.4), life: 0.8 });
        if (good) for (const v of villagers) hop(v, 3, 0.3);
      });
      break;
    }
    case 'volcano':
      if (poor) {
        blaze(V(here.x, here.y, here.z), 1.3, 14);
        shake = 0.3;
        after(0.5, () => everyone((f) => topple(f, 0.6), 0.05));
      } else if (good) {
        everyone((f) => hop(f, 1, 0.3));
      }
      break;
    case 'dragon': {
      const d = dragon;
      const moved = view.moved ?? 0;
      const to = V(here.x, 0, SPOT.cave.z - Math.max(-3, Math.min(3, w.marker)) * 0.55);
      if (moved > 0) {
        // The crew goes in, and it flinches.
        walkCrew(V(here.x, 0, here.z - 1.4), 0.5, { face: Math.PI, done: () => walkCrew(to, 0.9, { face: Math.PI }) });
        after(0.45, () => {
          tween(0.25, (k) => (d.recoil = k * Math.min(1.6, 0.6 + moved * 0.4)), {});
          tween(1.6, (k) => (d.recoil *= 1 - k), { delay: 0.7 });
          for (let i = 0; i < 7; i++) puff(d.head.getWorldPosition(V(0, 0, 0)), { colour: 0xfff0a0, glow: 1.5, size: rand(0.2, 0.5), life: 0.6 });
          shake = 0.18;
          sound.play('clash');
        });
      } else if (moved < 0) {
        breathe(V(here.x, 0.5, here.z), moved < -1 ? 2.8 : 1.8, moved < -1 ? 1.5 : 1);
        after(0.9, () => {
          everyone((f) => topple(f, 0.7), 0.04);
          blaze(V(here.x, 0.2, here.z), 1.2, 8);
          walkCrew(to, 1.2, { face: Math.PI });
        });
      } else {
        breathe(V(here.x, 4.5, here.z + 3), 1.4, 0.8); // over their heads
      }
      break;
    }
  }
}

/** The five endings, a paragraph at a time. */
function arriveEnding(w, snap) {
  const end = w.ending;
  const step = w.step;
  const d = dragon;
  monkeyTo('cross', true);
  const caveSpot = V(SPOT.cave.x, 0, SPOT.cave.z - 1);
  const toCave = (then) => {
    if (inCave) return then();
    cut(() => {
      intoCave();
      setMood('cave', 0.01);
      glideIn('cave', 8);
      form('clump', true);
      walkCrew(caveSpot, 0, { snap: true, face: Math.PI });
      then();
    }, snap);
  };
  const outside = (shotName, mood, then) =>
    cut(() => {
      outdoors();
      setMood(mood, 0.01);
      if (snap) shot(shotName, 0, true, MOVES.still);
      else glideIn(shotName, 9);
      then();
    }, snap);
  const sail = (livery, from, to, seconds) => {
    if (ship) scene.remove(ship);
    ship = makeShip(livery);
    ship.scale.setScalar(1.8);
    ship.position.copy(from);
    ship.rotation.y = Math.atan2(-(to.z - from.z), to.x - from.x);
    scene.add(ship);
    tween(snap ? 0.01 : seconds, (k) => ship.position.lerpVectors(from, to, k), { ease: linear });
  };
  const lightBeacon = (on) => {
    beacon.visible = on;
    beacon.userData.lit = on ? 1 : 0;
  };
  const party = (n) => {
    for (let i = 0; i < n; i++) after(rand(0.3, 9), () => firework(V(rand(-4, 20), rand(12, 18), rand(-8, 10))));
  };

  if (end === 'perfect' || end === 'good') {
    if (step === 1) {
      toCave(() => {
        d.wake = Math.max(d.wake, 0.8);
        if (end === 'perfect') {
          // Beaten: it folds up on its gold.
          tween(2.2, (k) => (d.down = k), { ease: easeInOut });
          tween(2.2, (k) => (d.wake = 0.8 * (1 - k) + 0.25 * k), { ease: easeInOut });
        } else {
          // Had enough: it backs away down the far side of the heap.
          tween(4, (k) => { d.sink = k * 7; d.group.position.z = CAVE.z - k * 7; }, { ease: easeInOut });
        }
        after(1.2, () => everyone((f) => hop(f, 5, 0.5)));
        for (let i = 0; i < 30; i++) after(1 + i * 0.12, () => fling(part(S.disc, paint(0xe9b62a, { rough: 0.3, glow: 0.4 }), { size: [0.14, 0.03, 0.14], shadow: false }), V(caveSpot.x + rand(-1.5, 1.5), 0.3, caveSpot.z - 2), V(rand(-1.5, 1.5), rand(4, 7), rand(-1, 1.5)), rand(1, 1.5), 0.3));
      });
    } else if (step === 2) {
      outside('rescue', 'gold', () => {
        d.group.position.copy(CAVE);
        form('row', true);
        walkCrew(V(SPOT.summit.x - 0.9, SPOT.summit.y, SPOT.summit.z + 1.85), 0, { snap: true, face: 0.3 });
        after(snap ? 0 : 3.5, () => {
          lightBeacon(true);
          blaze(beacon.position, 2.5, 14);
        });
        sail(end === 'perfect' ? 'pirates' : 'navy', V(40, 0, 22), V(9.5, 0, 12.4), 18); // in from the open sea, to lie off the beach
      });
    } else {
      everyone((f) => hop(f, 6, 0.5));
      if (end === 'perfect') party(14);
    }
    return;
  }

  if (end === 'neutral') {
    if (step === 1) toCave(() => { d.wake = Math.max(d.wake, 0.7); d.aim.set(0, 1, 7); });
    else if (step === 2) {
      outside('rescue', 'dusk', () => {
        form('row', true);
        walkCrew(V(SPOT.summit.x - 0.4, SPOT.summit.y, SPOT.summit.z + 1.9), 0, { snap: true, face: -0.6 });
        sail('navy', V(-34, 0, -66), V(62, 0, -58), 30); // far off, and not stopping
      });
    } else {
      outside('village', 'dusk', () => {
        form('row', true);
        walkCrew(V(SPOT.feast.x + 0.4, TURF, SPOT.feast.z), 0, { snap: true, face: 0.4 });
      });
    }
    return;
  }

  if (end === 'bad') {
    if (step === 1) {
      outside('volcano', 'ash', () => {
        smokeLevel = 2;
        crater.intensity = 320;
        form('clump', true);
        scorch(true);
        walkCrew(V(SPOT.summit.x - 0.4, 8.6, SPOT.summit.z + 2.75), 0, { snap: true });
        walkCrew(V(SPOT.slope.x, 2.5, SPOT.slope.z + 0.6), 9, {}); // down the mountain, and still in the picture when they stop
        onFire = 12;
      });
    } else if (step === 2) {
      shot('rescue', 5, snap, MOVES.still);
      setMood('dusk', 4);
      sail('navy', V(-34, 0, -66), V(62, 0, -58), 30);
    } else {
      outside('village', 'dusk', () => {
        onFire = 0;
        form('pan', true);
        walkCrew(V(SPOT.pan.x, TURF + 0.62, SPOT.pan.z), 0, { snap: true });
        for (const v of villagers) hop(v, 2, 0.25);
      });
    }
    return;
  }

  // The worst one.
  if (step === 1) {
    toCave(() => {
      d.wake = 1;
      const at = band.position.clone();
      breathe(V(at.x, 0.4, at.z), 5, 2.2);
      after(1.4, () => {
        scorch(true);
        everyone((f) => topple(f, 999), 0.06);
        for (let i = 0; i < 6; i++) after(i * 0.4, () => blaze(V(at.x + rand(-2, 2), 0.2, at.z + rand(-1.5, 1.5)), 2, 10));
      });
      shake = 0.4;
      // White, and then nothing much.
      after(3.2, () => {
        wash.style.transition = 'opacity 1.6s';
        wash.style.background = '#fff3d6';
        wash.style.opacity = 1;
      });
      after(6.2, () => {
        wash.style.transition = 'opacity 3s, background 3s';
        wash.style.background = '#0a0605';
        wash.style.opacity = 0.62;
      });
    });
  }
}

let onFire = 0; // seconds of smoke still to trail behind the crew

// ---------------------------------------------------------------------------
// The frame loop
// ---------------------------------------------------------------------------

let nextSmoke = 0;

function frame(t) {
  if (!running) return;
  requestAnimationFrame(frame);
  const real = Math.min(0.05, (t - lastFrame) / 1000 || 0.016);
  lastFrame = t;
  const dt = paused ? 0 : real;
  clock += dt;

  if (!paused) {
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
  }

  if (sea.visible) waves(clock);
  for (const top of sway) top.rotation.z = Math.sin(clock * 0.9 + top.userData.seed) * 0.06;
  for (const c of clouds) c.position.x += c.userData.drift * dt * 0.3;
  for (const m of mists) if (!m.gone) for (const p of m.puffs) p.position.y = p.userData.home.y + Math.sin(clock * 0.5 + p.userData.drift) * 0.18;

  // Fires flicker.
  for (const g of flames) {
    const u = g.userData;
    g.children.forEach((flame, i) => {
      if (!flame.isMesh) return;
      const f = (0.8 + 0.3 * Math.sin(clock * (11 + i * 3) + u.seed + i)) * u.lit;
      flame.scale.y = Math.max(0.001, flame.userData.h * f);
      flame.position.y = flame.scale.y / 2;
    });
    u.lamp.intensity = u.power * u.lit * (0.85 + 0.15 * Math.sin(clock * 13 + u.seed) * Math.sin(clock * 7.3));
  }

  // The crew bob as they walk; everybody else shifts from foot to foot.
  for (const f of crew.values()) if (walking) f.userData.inner.position.y = Math.abs(Math.sin(clock * 9 + f.userData.seed)) * 0.12;
  for (const v of villagers) v.userData.inner.rotation.z = Math.sin(clock * 1.1 + v.userData.seed) * 0.05;
  if (sandra) sandra.userData.inner.rotation.z = Math.sin(clock * 0.8) * 0.04;
  if (monkey.userData.walking) {
    monkey.userData.body.position.y = Math.abs(Math.sin(clock * 8)) * 0.05;
    monkey.userData.legs.forEach((leg, i) => (leg.rotation.x = Math.sin(clock * 8 + (i % 3 ? Math.PI : 0)) * 0.6));
  }

  // The mountain smokes, harder as the crew gets nearer.
  nextSmoke -= dt;
  if (nextSmoke <= 0 && !inCave && !paused) {
    nextSmoke = 0.5 / smokeLevel;
    puff(V(VOLCANO.x + rand(-1, 1), VOLCANO.height + 0.2, VOLCANO.z + rand(-1, 1)), { colour: pick([0x6a625c, 0x8a827a, 0x4a4440]), size: rand(1.2, 2.4), life: rand(5, 8), drift: V(rand(1.5, 3.5), rand(5, 8), rand(-0.5, 0.5)) });
    if (panFire.userData.lit) puff(V(SPOT.pan.x + rand(-0.3, 0.3), TURF + 1.1, SPOT.pan.z), { colour: 0xe9e4da, size: rand(0.2, 0.36), rise: rand(1.2, 2), life: rand(1.6, 2.6) });
  }
  if (onFire > 0 && !paused) {
    onFire -= dt;
    if (Math.random() < 0.5) puff(V(band.position.x + rand(-0.5, 0.5), band.position.y + 0.8, band.position.z + rand(-0.4, 0.4)), { colour: pick([0x3c3835, 0x57514b, 0xff8a1e]), size: rand(0.25, 0.5), rise: rand(1.5, 2.6), life: rand(1, 1.8) });
  }

  poseDragon(clock);

  cam.dist *= 1 + cam.push * dt;
  cam.round += cam.spin * dt;
  shake *= Math.max(0, 1 - real * 4);
  aimCamera(rand(-1, 1) * shake, rand(-1, 1) * shake);
  // House style: the palette's middle tones come from the haze, so it turns with the mood.
  const ramp = LOOK_TUNING.house.post.palette.colours;
  ramp[1].copy(light.haze).multiplyScalar(0.42);
  ramp[2].copy(light.haze);
  styler.render(scene, camera);
}

// ---------------------------------------------------------------------------
// The two functions host.js calls
// ---------------------------------------------------------------------------

/** Draw (or update) the island for a Find the One Piece view. */
export function show(view, playerMap) {
  if (!layer) init();
  players = playerMap;
  paused = !!view.paused;
  const w = view.world;
  if (!w) return;
  const first = layer.hidden;
  if (first) {
    layer.hidden = false;
    fit();
    running = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }
  syncCrew(w.crew);

  const key = `${view.key}:${w.step ?? ''}`;
  if (key !== now.key) {
    now.key = key;
    now.phase = null;
    arrive(view, w, first);
  }
  if (view.phase !== now.phase) {
    const arriving = now.phase === null;
    now.phase = view.phase;
    // A new phase of the same scene: the camera finds a new angle on it.
    if (!arriving && !first && !w.ending && MOVES[view.phase]) shot(cam.name, view.phase === 'outcome' ? 1.6 : 2.6, false, MOVES[view.phase]);
    if (view.phase === 'outcome' && !first) react(view, w);
  }
  carry(w.has);
}

/** Put the island away (another screen is showing). */
export function hide() {
  if (!layer || layer.hidden) return;
  layer.hidden = true;
  running = false;
  tweens.clear();
  fx.clear();
  now = { key: null, phase: null, set: null };
  moodNow = null;
  formation = null;
  onFire = 0;
  walking = false;
  wash.style.opacity = 0;
  if (ship) scene.remove(ship);
  ship = null;
  beacon.visible = false;
  beacon.userData.lit = 0;
  wreck.position.copy(wreck.userData.home);
  for (const m of mists) {
    m.gone = false;
    for (const p of m.puffs) {
      p.scale.setScalar(p.userData.size);
      p.position.copy(p.userData.home);
    }
  }
  outdoors();
  Object.assign(dragon, { wake: 0, down: 0, sink: 0, recoil: 0, breathing: 0 });
  dragon.group.position.copy(CAVE);
  monkey.userData.state = null;
  monkeyTo('hidden', true);
  scorch(false);
  upright();
}
