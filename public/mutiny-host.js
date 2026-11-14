// Mutiny on the big screen: the plotters, down in the hold at night.
//
// Every pirate is a carved wooden figure in their own colour, stood in a
// horseshoe round a hatch cover with a lantern on it. On top of the lantern
// sits the chameleon: it turns to look at one pirate after another and takes
// their colour, because it could be any of them. When the hands are shown,
// arms go up round the circle. When the crew accuses, daggers come down into
// the deck in front of whoever they named; the camera goes in close on the
// one unmasked, and then the chameleon jumps onto the head of the pirate who
// really was bluffing.
//
// Round the edges: the ship's cat on the barrels, a hammock, a gun at its
// port, a rat, a fly the chameleon has its eye on, and boots on the deck
// overhead that make everybody duck.
//
// host.js draws the words (the question, the candidates, who got what); this
// file owns the hold and everything in it, using the kit in kit3d.js.

import { THREE, createStage, shapes, paint, part, figure, decal, planks, rand, easeIn, linear, chipHtml } from './kit3d.js';
import { esc, fmt } from './common.js';
import * as sound from './sound.js';
import { createAmbience } from './ambience.js';
import './mutiny-sound.js';

const ARC = { a: 10.4, b: 6, spread: 1.8 }; // the horseshoe of figures (spread: radians either side of straight back)
const LABEL_Y = 4.75; // how high the name plates float
const TABLE = 0.85; // how high the hatch cover in the middle stands
const PERCH = new THREE.Vector3(0, TABLE + 1.66, 0); // the top of the lantern on it, where the chameleon sits
const PERCH_SIZE = 0.72;
const HEAD_Y = 2.96; // ...and the top of a pirate's head, where it ends up
const HEAD_SIZE = 0.6;
const WHITE = new THREE.Color(0xffffff);
const GREEN = new THREE.Color(0x6fbf3a);
const GREY = new THREE.Color(0x8d8f86);

let stage = null;
let players = new Map();
let seats = new Map(); // id -> { id, angle, pos, yaw, fig, arm, raise, want, label, daggers: [], count, sig }
let seatsKey = '';
let view = null;
let lastKey = null;
let phaseAt = 0; // stage.clock when the current view arrived
let playing = false;
let lamp = null;
let liz = null;
let cat = null;
let rat = null;
let fly = null;
let hammock = null;
let hangers = [];
let motes = [];
let dust = [];
const cam = { target: new THREE.Vector3(0, 0.8, -0.8), dist: 34, elevation: 0.36 };

// Below decks at night: the hull working, the sea on the other side of it, a drip, a lantern on its hook.
const room = createAmbience([
  { name: 'muCreak', every: [3, 8], level: 0.55, soon: true },
  { name: 'muLap', every: [5, 9], level: 0.6, soon: true },
  { name: 'muDrip', every: [1.5, 5], level: 0.4 },
  { name: 'muChain', every: [9, 20], level: 0.35 },
  { name: 'distantBell', every: [50, 100], level: 0.25 },
]);

const S = () => shapes();
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const colourOf = (id) => players.get(id)?.color ?? '#888888';

/** A spot on the horseshoe: k = 1 is where the figures stand. */
function onArc(angle, k = 1, y = 0) {
  return new THREE.Vector3(Math.sin(angle) * ARC.a * k, y, -Math.cos(angle) * ARC.b * k);
}

// ---------------------------------------------------------------------------
// Building the hold
// ---------------------------------------------------------------------------

function barrel(into, x, z, { r = 0.95, h = 2.1, lie = false, turn = 0 } = {}) {
  const g = new THREE.Group();
  part(new THREE.CylinderGeometry(r * 0.88, r * 0.88, h, 12), paint(0x6d4424, { rough: 0.8 }), { at: [0, h / 2, 0], into: g });
  part(new THREE.CylinderGeometry(r, r, h * 0.5, 12), paint(0x7a4c26, { rough: 0.8 }), { at: [0, h / 2, 0], into: g });
  for (const y of [0.16, 0.84]) part(new THREE.CylinderGeometry(r * 0.93, r * 0.93, h * 0.07, 12), paint(0x2b2d33, { rough: 0.4, metal: 0.5 }), { at: [0, h * y, 0], into: g });
  g.position.set(x, lie ? r : 0, z);
  if (lie) {
    g.rotation.set(0, turn, Math.PI / 2);
    g.position.x += h / 2;
  }
  into.add(g);
  return g;
}

function crate(into, x, y, z, size = 1.5, turn = 0) {
  const g = new THREE.Group();
  part(S().box, paint(0x7b5a34, { rough: 0.85 }), { size: [size, size, size], into: g });
  const edge = paint(0x4d351d, { rough: 0.85 });
  for (const s of [-1, 1]) {
    part(S().box, edge, { at: [0, (s * size) / 2, 0], size: [size * 1.04, size * 0.1, size * 1.04], into: g });
    part(S().box, edge, { at: [(s * size) / 2, 0, size / 2], size: [size * 0.1, size, size * 0.06], into: g });
  }
  part(S().box, edge, { at: [0, 0, size / 2], size: [size * 0.1, size * 1.3, size * 0.05], turn: [0, 0, Math.PI / 4], into: g });
  g.position.set(x, y + size / 2, z);
  g.rotation.y = turn;
  into.add(g);
  return g;
}

function buildHull(scene) {
  const boards = planks(['#4a3220', '#412b1b', '#503624', '#46301f']);
  boards.wrapS = boards.wrapT = THREE.RepeatWrapping;
  boards.repeat.set(7, 6);
  const floor = part(S().flat, new THREE.MeshStandardMaterial({ map: boards, roughness: 0.82 }), { at: [0, 0, 6], size: [96, 1, 64], into: scene });
  floor.castShadow = false;

  // The ship's side: dark planking behind everybody, with her ribs standing proud of it.
  const side = planks(['#3a2616', '#33200f', '#3f2a18', '#352312']);
  side.wrapS = side.wrapT = THREE.RepeatWrapping;
  side.repeat.set(6, 2);
  const wall = part(S().upright, new THREE.MeshStandardMaterial({ map: side, roughness: 0.9 }), { at: [0, 8, -13.2], size: [96, 16, 1], into: scene });
  wall.castShadow = false;
  const rib = paint(0x2c1c10, { rough: 0.9 });
  for (let x = -27; x <= 27; x += 6) part(S().box, rib, { at: [x, 8, -12.7], size: [0.8, 16, 0.9], into: scene });
  part(S().box, rib, { at: [0, 3.2, -12.8], size: [96, 0.5, 0.6], into: scene });
  part(S().box, rib, { at: [0, 9.4, -12.8], size: [96, 0.6, 0.7], into: scene });

  // A gunport, propped open on the night, and the gun that goes with it.
  const night = decal((c, s) => {
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#16284a');
    g.addColorStop(0.55, '#3d5f8f');
    g.addColorStop(0.56, '#0e2238');
    g.addColorStop(1, '#081524');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.fillStyle = '#fff6d8';
    c.beginPath();
    c.arc(s * 0.68, s * 0.26, s * 0.1, 0, 7);
    c.fill();
    c.fillStyle = 'rgba(255,246,216,0.35)';
    for (let i = 0; i < 9; i++) c.fillRect(s * (0.5 + Math.random() * 0.36), s * (0.6 + i * 0.04), s * (0.04 + Math.random() * 0.1), 2);
  }, 128);
  part(S().upright, new THREE.MeshBasicMaterial({ map: night }), { at: [-14.5, 4.9, -13.1], size: [2.7, 2.1, 1], shadow: false, into: scene });
  for (const [x, y, w, h] of [[-14.5, 6.05, 3.1, 0.25], [-14.5, 3.75, 3.1, 0.25], [-15.95, 4.9, 0.25, 2.5], [-13.05, 4.9, 0.25, 2.5]]) part(S().box, rib, { at: [x, y, -13], size: [w, h, 0.3], into: scene });
  part(S().box, paint(0x4a3220, { rough: 0.85 }), { at: [-14.5, 6.9, -12.3], size: [2.9, 0.16, 2.2], turn: [0.55, 0, 0], into: scene }); // the port lid
  const moon = new THREE.SpotLight(0x8fb0ff, 70, 30, 0.42, 0.7, 1.4);
  moon.position.set(-14.5, 5, -13);
  moon.target.position.set(-11.5, 0, -4);
  scene.add(moon, moon.target);
  const gun = new THREE.Group();
  const iron = paint(0x24262b, { rough: 0.45, metal: 0.6 });
  part(new THREE.CylinderGeometry(0.42, 0.6, 4, 12), iron, { at: [0, 1.5, 0], turn: [Math.PI / 2 - 0.08, 0, 0], into: gun });
  part(S().smooth, iron, { at: [0, 1.66, 2.1], size: 0.5, into: gun });
  part(S().box, paint(0x5a3519, { rough: 0.8 }), { at: [0, 0.7, 0.5], size: [1.7, 0.7, 3], into: gun });
  for (const x of [-0.95, 0.95]) for (const z of [-0.5, 1.5]) part(S().disc, paint(0x3a2414, { rough: 0.8 }), { at: [x, 0.45, z], size: [0.45, 0.22, 0.45], turn: [0, 0, Math.PI / 2], into: gun });
  gun.position.set(-14.5, 0, -10.6);
  gun.rotation.y = Math.PI;
  scene.add(gun);
  for (let i = 0; i < 6; i++) part(S().smooth, iron, { at: [-11.8 + (i % 3) * 0.62, 0.3 + (i > 2 ? 0.5 : 0), -11.6 + (i > 2 ? 0.2 : 0)], size: 0.3, into: scene }); // shot

  // The ladder up to the hatch, and the light that comes down it.
  const ladder = new THREE.Group();
  const pole = paint(0x6b4a2a, { rough: 0.85 });
  for (const x of [-0.8, 0.8]) part(S().box, pole, { at: [x, 6, 0], size: [0.2, 12.4, 0.26], into: ladder });
  for (let y = 0.9; y < 12; y += 1.1) part(S().box, pole, { at: [0, y, 0], size: [1.6, 0.14, 0.24], into: ladder });
  ladder.position.set(16, 0, -10.6);
  ladder.rotation.x = -0.2;
  scene.add(ladder);
  const hatch = new THREE.SpotLight(0x9db8ff, 120, 34, 0.26, 0.8, 1.2);
  hatch.position.set(16.5, 16, -7.5);
  hatch.target.position.set(15.5, 0, -8.5);
  scene.add(hatch, hatch.target);
  const shaft = part(new THREE.CylinderGeometry(0.9, 2.6, 13, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x9db8ff, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }), { at: [16, 6.5, -8], shadow: false, into: scene });
  shaft.renderOrder = 2;
}

function buildCargo(scene) {
  // Rum, stacked up by the gun: three on the deck and one on top. The ship's cat has the top one.
  barrel(scene, -8.6, -11.2);
  barrel(scene, -6.6, -11.4);
  barrel(scene, -4.7, -11.1);
  barrel(scene, -6.4, -11.2, { h: 1.9 }).position.y = 2.1;
  barrel(scene, -19.5, -9.5, { lie: true, turn: 0.3 });
  // Crates and sacks on the other side.
  crate(scene, 5.2, 0, -11.3, 1.9, 0.1);
  crate(scene, 7.4, 0, -11.2, 1.7, -0.15);
  crate(scene, 6.2, 1.9, -11.3, 1.4, 0.4);
  crate(scene, 19, 0, -9.5, 2, 0.5);
  const sack = paint(0xb39a6b, { rough: 1 });
  for (const [x, y, z, t] of [[10, 0.45, -11.3, 0.2], [11.4, 0.45, -11.1, -0.3], [10.7, 1.2, -11.3, 0.1]]) part(S().smooth, sack, { at: [x, y, z], size: [0.95, 0.5, 0.7], turn: [0, t, 0], into: scene });
  // A coil of rope.
  const rope = paint(0xa98a55, { rough: 1 });
  for (let i = 0; i < 4; i++) part(new THREE.TorusGeometry(0.75 - i * 0.05, 0.11, 6, 18), rope, { at: [-11.5, 0.12 + i * 0.2, 6.2], turn: [Math.PI / 2, 0, 0], into: scene });

  // A hammock slung between two posts, with somebody in it who was not invited.
  const post = paint(0x3a2616, { rough: 0.9 });
  for (const x of [1.4, 9.6]) part(S().box, post, { at: [x, 8, -12.2], size: [0.5, 16, 0.5], into: scene });
  hammock = new THREE.Group();
  const canvas = paint(0xc9b78c, { rough: 1 });
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const sag = Math.sin(t * Math.PI);
    part(S().box, canvas, { at: [(t - 0.5) * 7.4, -sag * 1.5, 0], size: [1, 0.08, 1.5 - (1 - sag) * 0.9], turn: [0, 0, -Math.cos(t * Math.PI) * 0.6], into: hammock });
  }
  part(S().smooth, paint(0x7c8a5a, { rough: 1 }), { at: [0.2, -1.15, 0], size: [2, 0.55, 0.6], into: hammock }); // the sleeper, under a blanket
  part(S().smooth, paint(0xc89a64, { rough: 0.6 }), { at: [-2.1, -0.85, 0], size: 0.36, into: hammock });
  hammock.position.set(5.5, 7.2, -11.6);
  scene.add(hammock);

  // Two small lanterns on hooks at the back, swinging with the ship.
  for (const x of [-21, 21.5]) {
    const g = new THREE.Group();
    part(S().disc, paint(0x24262b, { metal: 0.5, rough: 0.5 }), { at: [0, -2, 0], size: [0.03, 4, 0.03], shadow: false, into: g });
    part(S().box, paint(0x24262b, { metal: 0.5, rough: 0.5 }), { at: [0, -4.05, 0], size: [0.5, 0.1, 0.5], shadow: false, into: g });
    part(S().box, paint(0xffb85c, { glow: 2 }), { at: [0, -4.4, 0], size: [0.36, 0.6, 0.36], shadow: false, into: g });
    part(S().box, paint(0x24262b, { metal: 0.5, rough: 0.5 }), { at: [0, -4.75, 0], size: [0.5, 0.1, 0.5], shadow: false, into: g });
    const light = new THREE.PointLight(0xffa24a, 26, 20, 1.7);
    light.position.y = -4.4;
    g.add(light);
    g.position.set(x, 11.6, -10.5);
    scene.add(g);
    hangers.push({ g, phase: x });
  }
}

function buildTable(scene) {
  const g = new THREE.Group();
  // A hatch cover: a low drum of planks bound in iron. Low and narrow, so its shadow doesn't swallow the deck.
  const top = planks(['#6b4a2a', '#5f4024', '#73502e', '#644527'], 256);
  part(new THREE.CylinderGeometry(1.5, 1.5, TABLE - 0.1, 20), paint(0x5a3d22, { rough: 0.85 }), { at: [0, (TABLE - 0.1) / 2, 0], into: g });
  part(new THREE.CylinderGeometry(1.56, 1.56, 0.1, 20), new THREE.MeshStandardMaterial({ map: top, roughness: 0.8 }), { at: [0, TABLE - 0.05, 0], into: g });
  for (const y of [0.2, 0.62]) part(new THREE.CylinderGeometry(1.54, 1.54, 0.1, 20), paint(0x2b2d33, { rough: 0.4, metal: 0.5 }), { at: [0, y, 0], into: g });
  const on = new THREE.Group(); // everything stood on the table; y = 0 is the table top
  on.position.y = TABLE;
  g.add(on);
  // The plan, weighted down with a bottle and somebody's winnings.
  const chart = decal((c, s) => {
    c.fillStyle = '#e9d8ab';
    c.fillRect(0, 0, s, s);
    c.strokeStyle = '#7a4e26';
    c.lineWidth = 4;
    c.setLineDash([10, 9]);
    c.beginPath();
    c.moveTo(s * 0.15, s * 0.75);
    c.bezierCurveTo(s * 0.3, s * 0.2, s * 0.6, s * 0.9, s * 0.8, s * 0.3);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = '#a3261d';
    c.lineWidth = 8;
    c.beginPath();
    c.moveTo(s * 0.74, s * 0.24);
    c.lineTo(s * 0.86, s * 0.36);
    c.moveTo(s * 0.86, s * 0.24);
    c.lineTo(s * 0.74, s * 0.36);
    c.stroke();
  }, 128);
  part(S().flat, new THREE.MeshStandardMaterial({ map: chart, roughness: 1 }), { at: [0.6, 0.015, 0.8], size: [1.1, 1, 0.8], turn: [0, 0.5, 0], shadow: false, into: on });
  part(new THREE.CylinderGeometry(0.15, 0.19, 0.66, 8), paint(0x2f6b3a, { rough: 0.2 }), { at: [-0.95, 0.33, 0.6], into: on });
  part(new THREE.CylinderGeometry(0.055, 0.09, 0.28, 8), paint(0x2f6b3a, { rough: 0.2 }), { at: [-0.95, 0.8, 0.6], into: on });
  for (let i = 0; i < 5; i++) part(S().disc, paint(0xf2c230, { rough: 0.3, metal: 0.4 }), { at: [-0.4 + rand(-0.25, 0.25), 0.03 + (i > 2 ? 0.06 : 0), 1.1 + rand(-0.12, 0.12)], size: [0.17, 0.05, 0.17], into: on });

  // The lantern in the middle: the only real light down here.
  const iron = paint(0x24262b, { rough: 0.45, metal: 0.6 });
  part(S().disc, iron, { at: [0, 0.08, 0], size: [0.52, 0.14, 0.52], into: on });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    part(S().box, iron, { at: [Math.cos(a) * 0.42, 0.7, Math.sin(a) * 0.42], size: [0.06, 1.15, 0.06], shadow: false, into: on });
  }
  const glass = part(S().disc, paint(0xffc56a, { glow: 2.2 }), { at: [0, 0.7, 0], size: [0.3, 0.95, 0.3], shadow: false, into: on });
  part(new THREE.ConeGeometry(0.62, 0.34, 8), iron, { at: [0, 1.42, 0], shadow: false, into: on });
  part(S().disc, iron, { at: [0, 1.6, 0], size: [0.34, 0.08, 0.34], shadow: false, into: on }); // where the chameleon sits
  const light = new THREE.PointLight(0xff9a48, 130, 38, 1.6);
  light.position.set(0, 1.15, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.002;
  on.add(light);
  const spill = new THREE.PointLight(0xff9a48, 34, 26, 1.5); // the glow off the deckhead: no shadows, so the table's own shadow isn't pitch black
  spill.position.set(0, 6.5, 0);
  g.add(spill);
  scene.add(g);

  // Dust turning over in the lamplight.
  const speck = paint(0xffcf8a, { glow: 2.5 });
  motes = Array.from({ length: 26 }, () => ({ m: part(S().ball, speck, { size: 0.03, shadow: false, into: scene }), a: rand(0, 7), r: rand(1, 5.5), y: rand(1.4, 6), w: rand(0.05, 0.22) * (Math.random() < 0.5 ? -1 : 1), bob: rand(0, 7) }));
  return { light, spill, glass, boost: 1 };
}

/** The chameleon. Built facing +x; its skin and belly are its own paint, so it can change colour. */
function buildLizard(scene) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: GREEN, flatShading: true, roughness: 0.55, emissive: GREEN, emissiveIntensity: 0.3 });
  const belly = new THREE.MeshStandardMaterial({ color: 0xcfe58a, flatShading: true, roughness: 0.6, emissive: 0xcfe58a, emissiveIntensity: 0.2 });
  const body = part(S().smooth, skin, { at: [0, 0.55, 0], size: [0.95, 0.5, 0.42], into: g });
  part(S().smooth, belly, { at: [0.05, 0.42, 0], size: [0.82, 0.36, 0.37], into: g });
  for (let i = 0; i < 7; i++) part(S().cone, skin, { at: [-0.68 + i * 0.22, 1.04 - Math.abs(i - 3) * 0.04, 0], size: [0.07, 0.22, 0.07], into: g }); // the crest down its back

  const head = new THREE.Group();
  head.position.set(0.98, 0.74, 0);
  g.add(head);
  part(S().smooth, skin, { size: [0.48, 0.34, 0.32], into: head });
  part(S().cone, skin, { at: [-0.14, 0.34, 0], size: [0.22, 0.58, 0.2], turn: [0, 0, 0.55], into: head }); // the casque
  part(S().smooth, belly, { at: [0.2, -0.12, 0], size: [0.3, 0.15, 0.25], into: head });
  // Two turret eyes that go their own ways.
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Group();
    eye.position.set(0.14, 0.1, side * 0.27);
    head.add(eye);
    part(S().smooth, belly, { size: 0.17, into: eye });
    part(S().smooth, paint(0x16110c, { rough: 0.3 }), { at: [0.03, 0, side * 0.13], size: 0.08, into: eye });
    return { g: eye, t: 0, x: 0, y: 0 };
  });
  // The tongue, kept rolled up until something flies past.
  const tongue = new THREE.Group();
  tongue.position.set(0.44, -0.06, 0);
  head.add(tongue);
  const pink = paint(0xf0607a, { rough: 0.5 });
  part(S().disc, pink, { at: [0.5, 0, 0], size: [0.035, 1, 0.035], turn: [0, 0, -Math.PI / 2], shadow: false, into: tongue });
  part(S().smooth, pink, { at: [1, 0, 0], size: [0.03, 0.09, 0.09], shadow: false, into: tongue });
  tongue.scale.set(0.001, 1, 1);
  tongue.visible = false;

  for (const sx of [-0.5, 0.5]) {
    for (const sz of [-1, 1]) {
      part(S().disc, skin, { at: [sx, 0.2, sz * 0.4], size: [0.07, 0.46, 0.07], turn: [sz * 0.55, 0, 0], into: g });
      part(S().smooth, skin, { at: [sx + 0.04, 0.03, sz * 0.54], size: [0.15, 0.05, 0.12], into: g });
    }
  }
  // The tail, curled up tight.
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const r = 0.46 * (1 - t * 0.82);
    const a = -t * 5.4;
    part(S().smooth, skin, { at: [-1.38 + Math.cos(a) * r, 0.5 + Math.sin(a) * r, 0], size: 0.17 * (1 - t * 0.7), into: g });
  }
  g.position.copy(PERCH);
  g.scale.setScalar(PERCH_SIZE);
  scene.add(g);
  return { g, skin, belly, body, head, eyes, tongue, mode: 'perch', on: null, want: GREEN.clone(), wantYaw: -0.5, look: 1, snap: 14, mood: null };
}

function buildCat(scene) {
  const g = new THREE.Group();
  const fur = paint(0x26222a, { rough: 0.9 });
  part(S().smooth, fur, { at: [0, 0.5, 0], size: [0.5, 0.55, 0.62], into: g });
  const head = new THREE.Group();
  head.position.set(0, 1.12, 0.38);
  g.add(head);
  part(S().smooth, fur, { size: 0.34, into: head });
  for (const x of [-0.19, 0.19]) {
    part(S().cone, fur, { at: [x, 0.3, 0], size: [0.12, 0.26, 0.1], into: head });
    part(S().smooth, paint(0xd8e84a, { glow: 1.6 }), { at: [x * 0.7, 0.04, 0.3], size: [0.06, 0.075, 0.03], shadow: false, into: head });
  }
  part(S().smooth, paint(0xf3eee0, { rough: 0.8 }), { at: [0, 0.3, 0.52], size: [0.2, 0.26, 0.1], into: g }); // a white bib
  const tail = Array.from({ length: 6 }, (_, i) => part(S().smooth, fur, { at: [0.5 + i * 0.2, 0.14, -0.3], size: 0.13 - i * 0.008, into: g }));
  g.position.set(-6.4, 4, -10.9);
  g.rotation.y = 0.5;
  g.scale.setScalar(1.25);
  scene.add(g);
  return { g, head, tail };
}

function buildRat(scene) {
  const g = new THREE.Group();
  const fur = paint(0x5d5750, { rough: 0.9 });
  part(S().smooth, fur, { at: [0, 0.2, 0], size: [0.36, 0.2, 0.2], into: g });
  part(S().smooth, fur, { at: [0.38, 0.2, 0], size: [0.18, 0.13, 0.13], into: g });
  for (const z of [-0.1, 0.1]) part(S().smooth, paint(0xd9a0a0, { rough: 0.8 }), { at: [0.3, 0.34, z], size: 0.07, into: g });
  part(S().disc, paint(0xd9a0a0, { rough: 0.8 }), { at: [-0.62, 0.14, 0], size: [0.025, 0.6, 0.025], turn: [0, 0, Math.PI / 2 - 0.2], into: g });
  g.visible = false;
  scene.add(g);
  return { g, next: rand(14, 26) };
}

function init() {
  stage = createStage({
    id: 'muLayer',
    background: 0x0a0705,
    exposure: 1.15,
    fov: 30,
    overlay: '<div class="muh-vignette"></div>',
    // Lighting styles (see looks3d.js). The lantern is bright up close, so the knee is high.
    // House style: a fine dither where the lamplight gives out, and nothing else.
    looks: { knee: 4, house: { light: { pattern: 'bayer', bands: 7, cell: 2, spread: 0.4, amount: 0.6 } } },
  });
  const { scene } = stage;
  scene.fog = new THREE.Fog(0x0a0705, 46, 100);
  scene.add(new THREE.HemisphereLight(0x44557d, 0x1c1009, 0.75));
  const fill = new THREE.DirectionalLight(0x8fa8ff, 0.55); // a little cold light from the camera's side, so nothing is a silhouette
  fill.position.set(8, 26, 30);
  scene.add(fill);

  buildHull(scene);
  buildCargo(scene);
  lamp = buildTable(scene);
  liz = buildLizard(scene);
  cat = buildCat(scene);
  rat = buildRat(scene);
  fly = { m: part(S().ball, paint(0x0c0a08, { rough: 0.4 }), { size: 0.07, shadow: false, into: scene }), a: rand(0, 6), gone: 0 };
  stage.onFrame = frame;
  stage.onFit = fit;
}

// ---------------------------------------------------------------------------
// The crew
// ---------------------------------------------------------------------------

/** kit3d's figure, plus an arm to put up (and one to keep down; every third pirate has a hook on it). */
function plotter(colour, i) {
  const fig = figure(colour);
  const coat = paint(new THREE.Color(colour).getHex(), { rough: 0.55 });
  const wood = paint(0xc89a64, { rough: 0.6 });
  const limb = new THREE.CylinderGeometry(0.15, 0.12, 1, 8);
  const arm = new THREE.Group();
  arm.position.set(0.52, 1.78, 0);
  part(limb, coat, { at: [0, -0.5, 0], into: arm });
  part(S().smooth, wood, { at: [0, -1.1, 0], size: 0.23, into: arm });
  arm.rotation.z = 0.16;
  fig.add(arm);
  const other = new THREE.Group();
  other.position.set(-0.52, 1.78, 0);
  part(limb, coat, { at: [0, -0.5, 0], into: other });
  if (i % 3 === 1) part(new THREE.TorusGeometry(0.13, 0.035, 6, 12, Math.PI * 1.4), paint(0xd8dde3, { rough: 0.25, metal: 0.8 }), { at: [0, -1.18, 0], turn: [0, 0, Math.PI * 0.8], into: other });
  else part(S().smooth, wood, { at: [0, -1.1, 0], size: 0.2, into: other });
  other.rotation.z = -0.16;
  fig.add(other);
  return { fig, arm };
}

function seatCrew(ids) {
  const sig = ids.map((id) => `${id}:${colourOf(id)}`).join(',');
  if (sig === seatsKey) return;
  for (const seat of seats.values()) {
    stage.scene.remove(seat.fig);
    for (const d of seat.daggers) stage.scene.remove(d);
    seat.label.remove();
  }
  seats = new Map();
  seatsKey = sig;
  const n = ids.length;
  ids.forEach((id, i) => {
    const angle = n === 1 ? 0 : -ARC.spread + (2 * ARC.spread * i) / (n - 1);
    const pos = onArc(angle);
    const { fig, arm } = plotter(colourOf(id), i);
    fig.position.copy(pos);
    fig.rotation.y = Math.atan2(-pos.x, -pos.z); // face the lantern
    stage.scene.add(fig);
    seats.set(id, { id, angle, pos, yaw: fig.rotation.y, fig, arm, raise: 0, want: 0, wantAt: 0, phase: rand(0, 6), label: stage.label('muh-label'), daggers: [], count: 0, sig: '' });
  });
  placeLizard(null);
  fit();
}

// Things that belong to the phase on screen: cancelled when the game moves on.
const acts = new Set();
function act(dur, fn, opts) {
  const tw = stage.tween(dur, fn, opts);
  acts.add(tw);
  return tw;
}
const later = (delay, fn) => act(0.001, (k, raw) => raw >= 1 && fn(), { delay });

function clearActs() {
  for (const tw of acts) stage.cancel(tw);
  acts.clear();
  for (const seat of seats.values()) {
    seat.fig.position.y = 0;
    seat.fig.rotation.set(0, seat.yaw, 0);
  }
}

function clearDaggers() {
  for (const seat of seats.values()) {
    for (const d of seat.daggers) stage.scene.remove(d);
    seat.daggers = [];
    seat.count = 0;
  }
}

/** Put every arm where the hands for the latest question say (or all down). */
function setHands(hands) {
  for (const seat of seats.values()) {
    seat.want = hands?.[seat.id] === true ? 1 : 0;
    seat.wantAt = stage.clock + (hands ? rand(0, 0.35) : 0);
  }
}

function makeDagger() {
  const g = new THREE.Group();
  part(S().cone, paint(0xd8dde3, { rough: 0.2, metal: 0.8 }), { at: [0, 0.42, 0], size: [0.09, 0.85, 0.03], turn: [Math.PI, 0, 0], into: g }); // point down
  part(S().box, paint(0xf2c230, { rough: 0.3, metal: 0.4 }), { at: [0, 0.88, 0], size: [0.36, 0.07, 0.09], into: g });
  part(S().disc, paint(0x2b1b10, { rough: 0.8 }), { at: [0, 1.06, 0], size: [0.045, 0.3, 0.045], into: g });
  part(S().smooth, paint(0xf2c230, { rough: 0.3, metal: 0.4 }), { at: [0, 1.24, 0], size: 0.07, into: g });
  g.scale.setScalar(1.55);
  return g;
}

/** One accusation: a dagger comes down into the deck in front of the accused. */
function throwDagger(seat, delay) {
  const d = makeDagger();
  d.visible = false;
  stage.scene.add(d);
  const n = seat.daggers.length;
  seat.daggers.push(d);
  const slot = (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 0.5; // 0, then alternately either side
  const base = onArc(seat.angle, 0.7);
  const along = new THREE.Vector3(Math.cos(seat.angle) * ARC.a, 0, Math.sin(seat.angle) * ARC.b).normalize();
  const rest = base.addScaledVector(along, slot).setY(-0.3);
  const lean = [rand(-0.2, 0.2), rand(0, 3), rand(-0.25, 0.25)];
  act(0.42, (k) => {
    d.visible = true;
    d.position.set(rest.x, rest.y + (1 - k) * 10, rest.z);
    d.rotation.set(lean[0], lean[1] + (1 - k) * 9, lean[2]);
  }, {
    delay,
    ease: easeIn,
    done: () => {
      seat.count++;
      sound.play('muThunk', { level: 0.85 });
      lamp.boost = 1.3;
      act(0.5, (k, raw) => (d.rotation.z = lean[2] + Math.sin(raw * 30) * 0.12 * (1 - raw))); // it quivers
    },
  });
}

// ---------------------------------------------------------------------------
// The chameleon
// ---------------------------------------------------------------------------

/** Put the chameleon somewhere without any fuss: on a pirate's head, or (null) back on the lantern. */
function placeLizard(seat) {
  if (!liz) return;
  liz.mood = null;
  liz.g.rotation.set(0, seat ? -0.5 : liz.g.rotation.y, 0);
  liz.tongue.visible = false;
  if (seat) {
    liz.mode = 'head';
    liz.on = seat;
    liz.g.position.copy(seat.pos).setY(HEAD_Y);
    liz.g.scale.setScalar(HEAD_SIZE);
    liz.want.set(colourOf(seat.id));
  } else {
    liz.mode = 'perch';
    liz.on = null;
    liz.g.position.copy(PERCH);
    liz.g.scale.setScalar(PERCH_SIZE);
    liz.look = 0.3;
  }
}

/** The jump: off wherever it is, a somersault, and down onto a pirate's head, turning their colour as it goes. */
function leapTo(seat, delay, done = null) {
  let from = null;
  let size = 1;
  const to = seat.pos.clone().setY(HEAD_Y);
  act(0.85, (k, raw) => {
    if (!from) {
      from = liz.g.position.clone();
      size = liz.g.scale.x;
      liz.mode = 'leap';
      liz.mood = null;
      liz.want.set(colourOf(seat.id));
      sound.play('muHop');
    }
    liz.g.position.lerpVectors(from, to, raw);
    liz.g.position.y += Math.sin(raw * Math.PI) * 3.4;
    liz.g.rotation.z = -raw * Math.PI * 2;
    liz.g.scale.setScalar(size + (HEAD_SIZE - size) * raw);
  }, {
    delay,
    ease: linear,
    done: () => {
      placeLizard(seat);
      sound.play('muLand');
      done?.();
    },
  });
}

function hop(seat, delay, height = 0.8, times = 2) {
  for (let i = 0; i < times; i++) act(0.45, (k, raw) => (seat.fig.position.y = Math.sin(raw * Math.PI) * height * (i ? 0.6 : 1)), { delay: delay + i * 0.5, ease: linear });
}

/** No, not me: an innocent pirate shakes their head. */
function shake(seat, delay) {
  act(1.3, (k, raw) => (seat.fig.rotation.y = seat.yaw + Math.sin(raw * Math.PI * 5) * 0.4 * (1 - raw)), { delay, ease: linear });
}

function lizardFrame(dt, clock) {
  // Its colour drifts towards whatever it has its eye on.
  liz.skin.color.lerp(liz.want, 1 - Math.exp(-dt * 3.2));
  liz.skin.emissive.copy(liz.skin.color);
  liz.belly.color.copy(liz.skin.color).lerp(WHITE, 0.5);
  liz.belly.emissive.copy(liz.belly.color);
  liz.body.scale.y = 0.5 * (1 + 0.06 * Math.sin(clock * 2.3));
  for (const eye of liz.eyes) {
    eye.t -= dt;
    if (eye.t <= 0) Object.assign(eye, { t: rand(0.4, 2), x: rand(-0.5, 0.5), y: rand(-1, 1) });
    eye.g.rotation.x += (eye.x - eye.g.rotation.x) * Math.min(1, dt * 9);
    eye.g.rotation.y += (eye.y - eye.g.rotation.y) * Math.min(1, dt * 9);
  }

  if (liz.mode === 'perch') {
    // On the lantern: look at one pirate, then another, and take their colour.
    liz.look -= dt;
    if (liz.look <= 0 && seats.size && !liz.busy) {
      const seat = pick([...seats.values()]);
      liz.wantYaw = Math.atan2(-seat.pos.z, seat.pos.x);
      liz.want.set(colourOf(seat.id));
      liz.look = rand(2.2, 4);
    }
    const turn = Math.atan2(Math.sin(liz.wantYaw - liz.g.rotation.y), Math.cos(liz.wantYaw - liz.g.rotation.y));
    liz.g.rotation.y += turn * Math.min(1, dt * 2.6);
    liz.g.position.y = PERCH.y;
  } else if (liz.mode === 'head' && liz.on) {
    const bob = liz.mood === 'smug' ? Math.abs(Math.sin(clock * 5)) * 0.35 : 0;
    liz.g.position.y = HEAD_Y + liz.on.fig.position.y + bob;
    if (liz.mood === 'smug') {
      liz.g.rotation.y += dt * 5;
      liz.want.setHSL((clock * 0.6) % 1, 0.75, 0.55); // showing off
    } else if (liz.mood === 'caught') {
      liz.want.copy(GREY);
      liz.g.scale.set(HEAD_SIZE * 1.15, HEAD_SIZE * 0.6, HEAD_SIZE * 1.15); // gone flat
    }
  }

  // The fly it has been watching. Every so often: tongue.
  fly.gone -= dt;
  fly.a += dt * 0.55;
  const fy = PERCH.y + 0.48 + (liz.busy ? 0 : Math.sin(clock * 3.1) * 0.3);
  fly.m.visible = fly.gone <= 0 && view?.phase !== 'muster';
  fly.m.position.set(Math.cos(fly.a) * 2.7 + Math.sin(clock * 9) * 0.05, fy, -Math.sin(fly.a) * 2.7);
  liz.snap -= dt;
  if (liz.snap <= 0 && liz.mode === 'perch' && fly.gone <= 0 && playing && ['ask', 'hands', 'argue', 'deal'].includes(view?.phase)) {
    liz.snap = rand(16, 30);
    liz.busy = true;
    liz.wantYaw = fly.a + 0.25; // lead it a little
    stage.tween(0.28, (k, raw) => {
      if (liz.mode !== 'perch') return;
      liz.g.rotation.y = fly.a; // snap round
      liz.tongue.visible = true;
      liz.tongue.scale.x = Math.max(0.001, Math.sin(raw * Math.PI) * 2.25);
      if (raw > 0.5) fly.gone = rand(5, 9);
    }, {
      delay: 0.9,
      ease: linear,
      done: () => {
        liz.tongue.visible = false;
        liz.busy = false;
        liz.look = 1.5;
      },
    });
    stage.tween(0.001, (k, raw) => raw >= 1 && liz.mode === 'perch' && sound.play('muTongue', { level: 0.7 }), { delay: 0.85 });
  }
}

// ---------------------------------------------------------------------------
// The camera: one wide shot of the hold, or in close on whoever has been unmasked
// ---------------------------------------------------------------------------

const shot = { mode: 'wide', pos: new THREE.Vector3(), look: new THREE.Vector3(), target: null, snapped: false };
const wideAt = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
const CLOSE = { dist: 15, lookY: 2.9, camY: 5.6 }; // looking at their hat rather than their middle, so the head sits clear of the stamp across the top

function closeUp(seat) {
  const toLamp = new THREE.Vector3(-seat.pos.x, 0, -seat.pos.z).normalize();
  const toCam = new THREE.Vector3(wideAt.pos.x - seat.pos.x, 0, wideAt.pos.z - seat.pos.z).normalize();
  const dir = toLamp.multiplyScalar(0.45).add(toCam.multiplyScalar(0.55)).normalize();
  const look = seat.pos.clone().setY(CLOSE.lookY);
  const pos = look.clone().addScaledVector(dir, CLOSE.dist);
  pos.y = CLOSE.camY;
  shot.mode = 'close';
  shot.target = { pos, look };
  stage.labelsEl.classList.add('closed');
}

function wideShot() {
  shot.mode = 'wide';
  shot.target = null;
  stage.labelsEl.classList.remove('closed');
}

function moveCamera(dt, clock) {
  const drift = Math.sin(clock * 0.17) * 0.35;
  wideAt.pos.set(cam.target.x + drift, cam.target.y + Math.sin(cam.elevation) * cam.dist, cam.target.z + Math.cos(cam.elevation) * cam.dist);
  wideAt.look.set(cam.target.x + drift * 0.5, cam.target.y, cam.target.z);
  if (!shot.snapped) {
    shot.pos.copy(wideAt.pos);
    shot.look.copy(wideAt.look);
    shot.snapped = true;
  }
  const want = shot.mode === 'close' ? shot.target : wideAt;
  const f = 1 - Math.exp(-dt * 2.2);
  shot.pos.lerp(want.pos, f);
  shot.look.lerp(want.look, f);
  stage.camera.position.copy(shot.pos);
  stage.camera.lookAt(shot.look);
  stage.camera.rotation.z += Math.sin(clock * 0.45) * 0.007; // she rolls, very slightly
  stage.camera.updateMatrixWorld();
}

function aimCamera() {
  const { target, dist, elevation } = cam;
  stage.camera.position.set(target.x, target.y + Math.sin(elevation) * dist, target.z + Math.cos(elevation) * dist);
  stage.camera.lookAt(target.x, target.y, target.z);
  stage.camera.updateMatrixWorld();
}

/** Frame the horseshoe inside the 16:9 stage, under the question and above the candidates. */
function fit() {
  if (!stage) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const u = stage.unit;
  const fx = (1920 * u) / w;
  const fy = (1080 * u) / h;
  const top = fy * (1 - (2 * 330) / 1080);
  const bottom = -fy * (1 - (2 * 215) / 1080);
  const side = fx * 0.86;
  const rim = [];
  for (let i = 0; i <= 12; i++) {
    const angle = -ARC.spread + (2 * ARC.spread * i) / 12;
    rim.push(onArc(angle).setY(LABEL_Y + 0.55), onArc(angle, 0.66).setY(0));
  }
  const v = new THREE.Vector3();
  cam.dist = 34;
  cam.target.set(0, 0.8, -0.8);
  for (let i = 0; i < 40; i++) {
    aimCamera();
    let lo = Infinity;
    let hi = -Infinity;
    let wide = 0;
    for (const p of rim) {
      v.copy(p).project(stage.camera);
      lo = Math.min(lo, v.y);
      hi = Math.max(hi, v.y);
      wide = Math.max(wide, Math.abs(v.x));
    }
    const grow = Math.max(wide / side, (hi - lo) / (top - bottom));
    cam.dist *= 1 + (grow - 1) * 0.8;
    cam.target.y += (((hi + lo) / 2 - (top + bottom) / 2) * cam.dist) / 6;
  }
  aimCamera();
}

// ---------------------------------------------------------------------------
// The name plates
// ---------------------------------------------------------------------------

const HAND = { true: '<i class="up">✋</i>', false: '<i class="down">✊</i>', null: '<i class="none">?</i>' };

function labels(v) {
  const after = (s) => stage.clock - phaseAt >= s;
  const done = new Set(v.done ?? v.ready ?? v.voted ?? []);
  const unmasked = v.phase === 'guess' || v.phase === 'result' || (v.phase === 'verdict' && after(v.landed + (v.accused && !v.caught ? 5.8 : 3.1)));
  for (const seat of seats.values()) {
    const p = players.get(seat.id);
    // How this pirate answered each question so far.
    const row = (v.asked ?? []).filter((q) => q.hands).map((q) => HAND[q.hands[seat.id]] ?? HAND.null).join('');
    let foot = row ? `<span class="muh-row">${row}</span>` : '';
    let tag = '';
    if (v.phase === 'deal') foot = done.has(seat.id) ? '<span class="muh-done">✓ ready</span>' : '<span class="muh-wait">reading…</span>';
    if (v.phase === 'ask' && v.bosun === seat.id) tag = '<span class="muh-tag">Bosun</span>';
    if (v.phase === 'hands') foot += done.has(seat.id) ? '<span class="muh-done">✓</span>' : '<span class="muh-wait">…</span>';
    if (v.phase === 'argue' && done.has(seat.id)) foot += '<span class="muh-done">🗡️</span>';
    if (v.phase === 'verdict' && seat.count) foot += `<span class="muh-count">🗡️ ${seat.count}</span>`;
    if (unmasked && v.chameleon === seat.id) tag = '<span class="muh-tag spy">🦎 The Chameleon</span>';
    else if (v.phase === 'result' && v.topic.kind === 'crew' && v.secret === seat.id) tag = '<span class="muh-tag gold">🗝️ The watchword</span>';
    else if (v.phase === 'muster') foot = '';
    const cls = `muh-label ${p?.away ? 'away' : ''} ${['deal', 'hands', 'argue'].includes(v.phase) && done.has(seat.id) ? 'in' : ''}`;
    const html = `${tag}${chipHtml(p, esc)}${foot ? `<span class="muh-foot">${foot}</span>` : ''}`;
    if (seat.sig !== html + cls) {
      seat.sig = html + cls;
      seat.label.className = `kit-label ${cls}`;
      seat.label.innerHTML = html;
    }
  }
}

// ---------------------------------------------------------------------------
// Acting out each phase
// ---------------------------------------------------------------------------

function enter(v) {
  clearActs();
  const spy = seats.get(v.chameleon);
  if (v.phase !== 'verdict') wideShot();
  if (v.phase === 'muster') stage.labelsEl.classList.add('closed'); // the titles card has the names; the plates would only poke out from behind it
  if (!['verdict', 'guess', 'result'].includes(v.phase)) clearDaggers();

  if (v.phase === 'show') setHands(v.asked.at(-1)?.hands ?? null);
  else setHands(null);

  if (v.phase === 'verdict') {
    clearDaggers();
    placeLizard(null);
    v.daggers.forEach((id, i) => {
      const seat = seats.get(id);
      if (seat) throwDagger(seat, 1.2 + i * 0.4 - 0.42);
    });
    const accused = seats.get(v.accused);
    if (accused) {
      // In close on whoever the crew named... and then the truth.
      later(v.landed + 0.3, () => closeUp(accused));
      if (v.caught) {
        leapTo(accused, v.landed + 2.2, () => {
          sound.play('muGotcha');
          lamp.boost = 1.8;
        });
        act(1.6, (k, raw) => (accused.fig.rotation.z = Math.sin(raw * Math.PI * 7) * 0.2 * (1 - raw)), { delay: v.landed + 3.1, ease: linear });
      } else {
        later(v.landed + 3, () => sound.play('muWrong'));
        shake(accused, v.landed + 3);
        later(v.landed + 5, wideShot);
        if (spy) leapTo(spy, v.landed + 5.2, () => (liz.mood = 'smug'));
        if (spy) hop(spy, v.landed + 6.1);
      }
    } else if (spy) {
      leapTo(spy, v.landed + 2.3, () => (liz.mood = 'smug'));
      hop(spy, v.landed + 3.2);
    }
    return;
  }

  if (v.phase === 'guess' || v.phase === 'result') {
    if (spy && liz.on !== spy) placeLizard(spy);
    if (v.phase === 'result') {
      if (v.outcome === 'caught') {
        liz.mood = 'caught';
        if (spy) act(1.2, (k) => (spy.fig.position.y = -0.3 * k), { delay: 0.3 });
        if (spy) act(1.2, (k) => (spy.fig.rotation.x = 0.18 * k), { delay: 0.3 });
        for (const seat of seats.values()) if (seat !== spy) hop(seat, 0.6 + rand(0, 0.5), 0.5);
      } else {
        liz.mood = 'smug';
        if (spy) hop(spy, 0.3, 1, 3);
      }
    }
    return;
  }
  placeLizard(null);
}

/** Boots on the deck overhead: dust comes down, the lamp gutters, and everybody ducks. */
let nextSteps = rand(22, 40);
function footsteps() {
  sound.play('muSteps', { level: 0.8, ambience: true });
  lamp.boost = 0.55;
  for (const seat of seats.values()) act(2.8, (k, raw) => (seat.fig.position.y = -0.22 * Math.sin(Math.min(1, raw * 5) * Math.PI / 2) * (raw > 0.8 ? (1 - raw) / 0.2 : 1)), { ease: linear });
  const grit = paint(0x9a8463, { rough: 1 });
  for (let i = 0; i < 46; i++) {
    const m = part(S().box, grit, { size: rand(0.03, 0.07), shadow: false, into: stage.scene });
    const x = rand(-11, 11);
    const z = rand(-7, 4);
    const fall = { m, t: -rand(0, 2.2), life: rand(1.6, 2.4), x, z };
    m.visible = false;
    dust.push(fall);
  }
}

function runRat(dt) {
  rat.next -= dt;
  if (rat.next > 0 || !['ask', 'hands', 'argue'].includes(view?.phase)) return;
  rat.next = rand(30, 55);
  const dir = Math.random() < 0.5 ? 1 : -1;
  const z = rand(3.4, 4.6);
  rat.g.rotation.y = dir > 0 ? 0 : Math.PI;
  sound.play('muRat', { level: 0.6 });
  stage.tween(3.4, (k, raw) => {
    rat.g.visible = raw < 1;
    const stop = raw > 0.42 && raw < 0.56; // it stops dead in the middle, has a look, and carries on
    const along = raw <= 0.42 ? raw : stop ? 0.42 : raw - 0.14;
    rat.g.position.set(dir * (-17 + (along / 0.86) * 34), stop ? 0 : Math.abs(Math.sin(raw * 60)) * 0.08, z);
    rat.g.rotation.z = stop ? 0.5 : 0; // up on its hind legs
  }, { ease: linear });
}

function frame(dt, clock) {
  // The lantern: a steady flame that jumps when something lands, and gutters when the captain walks over.
  lamp.boost += (1 - lamp.boost) * Math.min(1, dt * 1.4);
  const flicker = 0.9 + 0.1 * Math.sin(clock * 11) * Math.sin(clock * 6.7);
  lamp.light.intensity = 130 * flicker * lamp.boost;
  lamp.spill.intensity = 34 * lamp.boost;
  lamp.glass.scale.x = lamp.glass.scale.z = 0.3 * (0.94 + 0.06 * flicker);
  for (const hang of hangers) hang.g.rotation.z = Math.sin(clock * 0.9 + hang.phase) * 0.13;
  hammock.rotation.x = Math.sin(clock * 0.9) * 0.1;
  for (const m of motes) {
    m.a += m.w * dt;
    m.m.position.set(Math.cos(m.a) * m.r, m.y + Math.sin(clock * 0.4 + m.bob) * 0.5, Math.sin(m.a) * m.r);
  }
  for (let i = dust.length - 1; i >= 0; i--) {
    const d = dust[i];
    d.t += dt;
    if (d.t < 0) continue;
    const k = d.t / d.life;
    d.m.visible = k < 1;
    d.m.position.set(d.x + Math.sin(d.t * 3 + d.z) * 0.15, 10 * (1 - k * k), d.z);
    if (k >= 1) {
      stage.scene.remove(d.m);
      dust.splice(i, 1);
    }
  }
  // The cat: tail going, eyes on the chameleon.
  cat.tail.forEach((ball, i) => (ball.position.z = -0.3 + Math.sin(clock * 2.1 - i * 0.6) * 0.05 * i));
  const toLiz = Math.atan2(liz.g.position.x - cat.g.position.x, liz.g.position.z - cat.g.position.z) - cat.g.rotation.y;
  cat.head.rotation.y += (Math.max(-0.9, Math.min(0.9, toLiz)) - cat.head.rotation.y) * Math.min(1, dt * 3);

  // Arms: up for those with their hand up, with a bit of a wave.
  for (const seat of seats.values()) {
    const want = clock >= seat.wantAt ? seat.want : seat.raise > 0.5 ? 1 : 0;
    seat.raise += (want - seat.raise) * Math.min(1, dt * 8);
    seat.arm.rotation.z = 0.16 + seat.raise * (Math.PI - 0.5) + (seat.raise > 0.8 ? Math.sin(clock * 7 + seat.phase) * 0.09 : 0);
  }

  room.tick(dt, playing);
  if (playing) {
    lizardFrame(dt, clock);
    runRat(dt);
    nextSteps -= dt;
    if (nextSteps <= 0) {
      nextSteps = rand(35, 60);
      if (['ask', 'hands', 'argue'].includes(view?.phase)) footsteps();
    }
  }
  moveCamera(dt, clock);
  if (view) labels(view);
  for (const seat of seats.values()) stage.pin(seat.label, seat.pos.clone().setY(LABEL_Y));
}

// ---------------------------------------------------------------------------
// The two functions host.js calls
// ---------------------------------------------------------------------------

export function show(v, playerMap) {
  if (!stage) init();
  players = playerMap;
  if (stage.open()) {
    shot.snapped = false;
    lastKey = null;
  }
  playing = !v.paused;
  seatCrew(v.seats);
  view = v;
  if (v.key !== lastKey) {
    lastKey = v.key;
    phaseAt = stage.clock;
    enter(v);
  }
  labels(v);
}

export function hide() {
  if (!stage?.close()) return;
  clearActs();
  clearDaggers();
  wideShot();
  placeLizard(null);
  liz.busy = false;
  rat.g.visible = false;
  lastKey = null;
  view = null;
}

// ---------------------------------------------------------------------------
// The words host.js draws over the top
// ---------------------------------------------------------------------------

export function mutinyScreens({ anim, chip }) {
  const chips = (ids) => ids.map((id) => chip(id)).join('');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  /** The candidates along the bottom: what the watchword could be. */
  function words(v, { fresh = false, hot = false } = {}) {
    if (!v.words) return '';
    const marked = v.phase === 'result';
    if (v.topic.kind === 'crew') {
      if (marked) return '';
      return `<div class="muh-words crew ${hot ? 'hot' : ''}"${fresh ? anim('words', 'rise', 900, 500) : ''}><span class="muh-word">The watchword is <b>one of the crew</b>. But which?</span></div>`;
    }
    const cells = v.words
      .map((w, i) => {
        const cls = marked && w.id === v.secret ? 'secret' : marked && w.id === v.guess ? 'wrong' : marked ? 'dim' : '';
        return `<span class="muh-word ${cls}"${fresh ? anim(`word${i}`, 'pop', 900 + i * 70, 350) : ''}>${marked && w.id === v.secret ? '🗝️ ' : marked && w.id === v.guess ? '🦎 ' : ''}${esc(w.text)}</span>`;
      })
      .join('');
    return `<div class="muh-words ${hot ? 'hot' : ''}">${cells}</div>`;
  }

  function mu(v) {
    const head = `<div class="muh-head">
      <span>${v.phase === 'muster' ? 'The muster' : `Plot ${v.round.n} of ${v.round.of}`}</span>
      ${v.phase === 'muster' ? '' : `<span class="muh-topic">${esc(v.topic.name)}</span>`}
      ${v.round.double ? '<span class="muh-mult">×2 doubloons</span>' : ''}
    </div>`;
    const wrap = (body) => `<div class="muh" data-phase="${v.phase}">${head}${body}</div>`;
    const of = (list) => `<span class="tally">${list.length} of ${v.seats.length}</span>`;
    const asked = v.asked ?? [];
    const key = asked.length ? `<ol class="muh-key">${asked.map((q) => `<li>${esc(q.text)}</li>`).join('')}</ol>` : '';

    if (v.phase === 'deal') {
      return wrap(`<div class="muh-card parch"${anim('card', 'drop', 150, 600)}>
          <small>A new plot. The watchword is…</small>
          <b>${v.topic.kind === 'crew' ? 'one of the crew' : `something from “${esc(v.topic.name)}”`}</b>
        </div>
        <p class="muh-hint"${anim('hint', 'rise', 700, 500)}>Look at your phone, and keep it to yourself. One of you is the Chameleon. ${of(v.ready)}</p>
        ${words(v, { fresh: true })}`);
    }

    if (v.phase === 'ask') {
      return wrap(`<div class="muh-card parch"${anim('card', 'drop', 0, 500)}>
          <small>Question ${v.q} of ${v.perRound}</small>
          <b class="muh-who">${chip(v.bosun)} is choosing what to ask…</b>
        </div>
        <p class="muh-hint">The bosun picks one of three questions, or writes their own</p>
        ${words(v)}`);
    }

    if (v.phase === 'hands' || v.phase === 'show') {
      const q = asked.at(-1);
      const card = `<div class="muh-card parch"${v.phase === 'hands' ? anim('card', 'slam', 0, 450) : ''}>
          <small>Hands up if…</small>
          <b>${esc(v.question)}</b>
          <span class="muh-by">${q?.own ? '✍️ written' : 'asked'} by ${chip(v.bosun)}</span>
        </div>`;
      const hint =
        v.phase === 'hands'
          ? `<p class="muh-hint"${anim('hint', 'rise', 500, 400)}>Hand up or hand down? Answer on your phone ${of(v.done)}</p>`
          : `<p class="muh-hint big"${anim('hint', 'pop', 300, 450)}><b>✋ ${plural(v.up, 'hand')} up</b><b>✊ ${v.down} down</b></p>`;
      return wrap(`${card}${hint}${words(v)}`);
    }

    if (v.phase === 'argue') {
      return wrap(`<div class="muh-card parch slim"${anim('card', 'drop', 0, 500)}>
          <small>Who’s the Chameleon?</small>
          ${key}
        </div>
        <p class="muh-hint"${anim('hint', 'rise', 500, 400)}>Argue it out, then accuse somebody on your phone ${of(v.voted)}</p>
        ${words(v)}`);
    }

    if (v.phase === 'verdict') {
      // Each line is its own slip of parchment, laid down as the hold acts it out (see enter() above for the timings).
      const ms = v.landed * 1000;
      const votes = (id) => v.tally.find((t) => t.id === id)?.votes ?? 0;
      const slip = (id, at, html) => `<div class="muh-line parch"${anim(id, 'rise', at, 500)}>${html}</div>`;
      let stamp = '';
      let lines;
      if (v.accused && v.caught) {
        stamp = `<div class="muh-stamp spy"${anim('stamp', 'slam', ms + 3050, 450)}>🦎 The Chameleon!</div>`;
        lines = slip('l1', ms + 1300, `<em>The crew unmasks</em>${chip(v.accused)}<span class="muh-votes">🗡️ ${votes(v.accused)}</span>`);
      } else if (v.accused) {
        // Wrong pirate: the stamp comes and goes with the close-up, so it is out of the way when the real one is shown.
        stamp = `<div class="muh-stamp loyal fleeting"${anim('stamp', 'stamp-pass', ms + 3050, 2300)}>An honest pirate!</div>`;
        lines = `${slip('l1', ms + 1300, `<em>The crew unmasks</em>${chip(v.accused)}<span class="muh-votes">🗡️ ${votes(v.accused)}</span>`)}
          ${slip('l2', ms + 5900, `<em>…but the Chameleon was</em>${chip(v.chameleon)}<b class="muh-away">Got away!</b>`)}`;
      } else {
        lines = `${slip('l1', ms + 700, v.tied.length ? `<em>A tie between</em>${chips(v.tied)}<em>so nobody is unmasked</em>` : '<em>Nobody accused anybody!</em>')}
          ${slip('l2', ms + 3150, `<em>The Chameleon was</em>${chip(v.chameleon)}<b class="muh-away">Got away!</b>`)}`;
      }
      return wrap(`<div class="muh-card parch slim"><small>Who’s the Chameleon?</small></div>${stamp}<div class="muh-slips">${lines}</div>`);
    }

    if (v.phase === 'guess') {
      return wrap(`<div class="muh-card parch"${anim('card', 'drop', 0, 500)}>
          <small>Caught! But there’s one way out…</small>
          <b class="muh-who">${chip(v.chameleon)} gets one guess at the watchword</b>
        </div>
        <p class="muh-hint">Name it, and the Chameleon slips away</p>
        ${words(v, { hot: true })}`);
    }

    if (v.phase === 'result') {
      const secret = v.words.find((w) => w.id === v.secret);
      const guessed = v.words.find((w) => w.id === v.guess);
      const name = (w) => (w.player ? chip(w.player) : `<b>${esc(w.text)}</b>`);
      const who = chip(v.chameleon);
      const lines = [];
      if (v.outcome === 'caught') {
        lines.push(`${who}<em>${guessed ? 'guessed' : 'couldn’t name it.'}</em>${guessed ? `${name(guessed)}<em>Wrong!</em>` : ''}`);
        lines.push(`<em>The plot holds. Every loyal pirate</em><span class="gain">+${fmt(v.gains.crew)}</span>`);
      } else if (v.outcome === 'slipped') {
        lines.push(`${who}<em>named the watchword and slips the noose!</em><span class="gain">+${fmt(v.gains.chameleon)}</span>`);
      } else {
        lines.push(`${who}<em>was the Chameleon, and got clean away!</em><span class="gain">+${fmt(v.gains.chameleon)}</span>`);
      }
      lines.push(v.sharp.length ? `<em>Sharp eyes</em>${chips(v.sharp)}<span class="gain">+${fmt(v.gains.sharp)}${v.sharp.length > 1 ? ' each' : ''}</span>` : '<em>Nobody accused the right pirate.</em>');
      return wrap(`<div class="muh-card parch"${anim('card', 'drop', 0, 500)}>
          <small>The watchword was</small>
          <b class="muh-secret"${anim('secret', 'slam', 700, 500)}>${name(secret)}</b>
        </div>
        <div class="muh-banner parch"${anim('banner', 'rise', 1500, 500)}>${lines.map((l, i) => `<div class="muh-line"${anim(`r${i}`, 'rise', 1700 + i * 1300, 500)}>${l}</div>`).join('')}</div>
        ${words(v)}`);
    }

    if (v.phase === 'muster') {
      const rows = v.titles
        .map((t, i) => `<div class="muh-title"${anim(`t${i}`, 'from-left', 500 + i * 2400, 500)}><em>${esc(t.label)}</em>${chips(t.players)}<span>${esc(t.value)}</span></div>`)
        .join('');
      return wrap(`<div class="muh-titles parch"${anim('titles', 'drop', 0, 500)}>${rows}</div>`);
    }
    return wrap('');
  }

  return { mu };
}
