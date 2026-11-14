// Cradle to Kraken on the big screen: the whole voyage of a life, laid out as a
// toy board on a sea at sunset.
//
// The route (cradle-board.js) is a boardwalk of painted wooden stepping-stones
// on posts, winding from Cradle Cove's lighthouse past Tortuga's lanterns, the
// fork signposts, the shipyard, Skull Island and the Governor's fort, to the
// Kraken's Lair, where a great kraken guards its hoard. Every pirate is a toy
// ship in their colour that grows from a rowing boat to a galleon, with their
// crew as little pegs on deck. The camera follows the pack as it sails, closes
// in on whoever is in the spotlight, and pulls back to the Kraken at the end.
//
// host.js draws the words over the top (cradleScreens below): the ledger, the
// landing cards, the duels and so on.
//
// Built with the kit in kit3d.js, like Message in a Bottle and Parley.

import { THREE, createStage, shapes, paint, part, figure, decal, palm, rand, easeOut, easeInOut, chipHtml, keepPlain } from './kit3d.js';
import { esc, fmt } from './common.js';
import { createAmbience } from './ambience.js';
import * as sound from './sound.js';
import { layout, buildBoard, KINDS, SEGMENTS } from './cradle-board.js';
import './cradle-sound.js';

const TILE_Y = 0.75; // the top of a stepping-stone
const LABEL_LIFT = 3.2;
const UP = new THREE.Vector3(0, 1, 0);

let stage = null;
let players = new Map();
let view = null;
let playing = false;
let sea = null;
let spots = []; // [x, z] for every space
let board = [];
let ships = new Map(); // id -> ship
let kraken = null;
let tentacles = []; // every tentacle on the board, animated together
let flames = [];
let beam = null;
let gulls = [];
let clouds = [];
let popups = []; // { el, at: Vector3 | () => Vector3, born, life }
let lastStep = 0;
let seen = { sail: null, pours: null, land: null, spin: new Set(), wed: null, duel: null };
const cam = { pos: new THREE.Vector3(0, 90, 90), look: new THREE.Vector3(), snapped: false };

// The sound of a warm evening at sea: waves on the posts, gulls heading home, a bell, the tavern far off.
const room = createAmbience([
  { name: 'ckLap', every: [3, 6], level: 0.55, soon: true },
  { name: 'gulls', every: [10, 22], level: 0.35 },
  { name: 'creak', every: [8, 16], level: 0.35 },
  { name: 'distantBell', every: [26, 50], level: 0.3 },
  { name: 'ckTavern', every: [18, 34], level: 0.35 },
]);

const v3 = (i, y = TILE_Y) => new THREE.Vector3(spots[i][0], y, spots[i][1]);
const big = (i) => 'STFYE'.includes(board[i]?.t);

// ---------------------------------------------------------------------------
// Sea and sky
// ---------------------------------------------------------------------------

const SUN = new THREE.Vector3(-70, 16, -250);

function swell(x, z, t) {
  return Math.sin(x * 0.32 + t * 0.9) * Math.cos(z * 0.41 + t * 0.7) * 0.13 + Math.sin(x * 0.9 - z * 0.7 + t * 1.6) * 0.04 + Math.sin((x + z) * 0.17 - t * 0.5) * 0.1;
}

function buildSea(scene) {
  const geo = new THREE.PlaneGeometry(2, 2, 180, 140).rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i);
    const v = p.getZ(i);
    p.setXYZ(i, u * 62 + u ** 3 * 240, -0.3, v * 52 + v ** 3 * 220 - 8);
  }
  const sheet = geo.toNonIndexed();
  const base = Float32Array.from(sheet.attributes.position.array);
  const colours = new Float32Array(base.length);
  const deep = new THREE.Color(0x5a3f86);
  const near = new THREE.Color(0x2f7aa4);
  const rose = new THREE.Color(0x9a5a8e);
  const glow = new THREE.Color(0xffa25e);
  const c = new THREE.Color();
  const hsl = {};
  for (let i = 0; i < base.length; i += 9) {
    const x = (base[i] + base[i + 3] + base[i + 6]) / 3;
    const z = (base[i + 2] + base[i + 5] + base[i + 8]) / 3;
    c.copy(near).lerp(deep, THREE.MathUtils.smoothstep(-z, 10, 150)).lerp(rose, 0.08 + 0.08 * Math.sin(x * 0.05 + z * 0.03));
    // The sun's road: a warm streak across the water towards the setting sun.
    const across = Math.abs(x - SUN.x * ((z - 20) / (SUN.z - 20)));
    const road = (1 - THREE.MathUtils.smoothstep(across, 4, 26 + Math.max(0, -z) * 0.25)) * THREE.MathUtils.smoothstep(-z, -10, 120);
    c.lerp(glow, road * 0.45);
    c.getHSL(hsl);
    c.setHSL(hsl.h + rand(-0.01, 0.01), hsl.s, hsl.l + rand(-0.025, 0.03) + (road > 0.3 && Math.random() < 0.2 ? 0.07 : 0));
    for (let k = 0; k < 3; k++) c.toArray(colours, i + k * 3);
  }
  sheet.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const mat = keepPlain(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.62, metalness: 0 }));
  const mesh = new THREE.Mesh(sheet, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return { geo: sheet, base };
}

function waves(clock) {
  const a = sea.geo.attributes.position.array;
  const b = sea.base;
  for (let i = 0; i < a.length; i += 3) a[i + 1] = -0.3 + swell(b[i], b[i + 2], clock);
  sea.geo.attributes.position.needsUpdate = true;
}

function buildSky(scene) {
  // A dome painted from violet overhead through rose to gold at the horizon.
  const dome = new THREE.SphereGeometry(330, 32, 20);
  const pos = dome.attributes.position;
  const colours = [];
  const top = new THREE.Color(0x2a1d4f);
  const mid = new THREE.Color(0xc0507a);
  const low = new THREE.Color(0xffb36b);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 330;
    if (h > 0.18) c.copy(mid).lerp(top, THREE.MathUtils.smoothstep(h, 0.18, 0.7));
    else c.copy(low).lerp(mid, THREE.MathUtils.smoothstep(h, -0.02, 0.18));
    colours.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  scene.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
  // The sun, sitting on the sea, and a soft halo round it.
  part(shapes().smooth, new THREE.MeshBasicMaterial({ color: 0xffe2a0, fog: false }), { at: SUN.toArray(), size: 22, shadow: false, into: scene });
  part(shapes().smooth, new THREE.MeshBasicMaterial({ color: 0xffb070, fog: false, transparent: true, opacity: 0.25, depthWrite: false }), { at: SUN.toArray(), size: 40, shadow: false, into: scene });
  // Long low clouds, lit pink from below.
  const pink = new THREE.MeshBasicMaterial({ color: 0xf59aa3, fog: false });
  const dusk = new THREE.MeshBasicMaterial({ color: 0x8e5c8f, fog: false });
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < 6; j++) part(shapes().ball, j % 2 ? pink : dusk, { at: [j * 3 - 8, rand(0, 1), rand(-1, 1)], size: [rand(3, 5), rand(0.8, 1.4), rand(1.5, 2.5)], shadow: false, into: g });
    g.position.set(rand(-260, 260), rand(30, 75), rand(-300, -230));
    g.scale.setScalar(rand(1.6, 3));
    scene.add(g);
    clouds.push({ g, speed: rand(0.5, 1.4) });
  }
  // The first stars coming out overhead.
  const stars = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 300; i++) {
    const a = rand(0, Math.PI * 2);
    const e = rand(0.45, 1.4);
    pts.push(Math.cos(a) * Math.cos(e) * 320, Math.sin(e) * 320, Math.sin(a) * Math.cos(e) * 320);
  }
  stars.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xfff4e0, size: 1.4, fog: false, transparent: true, opacity: 0.7 })));
}

// ---------------------------------------------------------------------------
// The board: stepping-stones, the boardwalk between them, and the landmarks
// ---------------------------------------------------------------------------

const tops = new Map();
/** The painted top of a stepping-stone: a coloured disc with its emblem. */
function tileTop(t) {
  if (tops.has(t)) return tops.get(t);
  const k = KINDS[t];
  const tex = decal((c, w) => {
    c.fillStyle = '#e9d9b4';
    c.fillRect(0, 0, w, w);
    c.fillStyle = k.colour;
    c.beginPath();
    c.arc(w / 2, w / 2, w * 0.42, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = w * 0.03;
    c.strokeStyle = 'rgba(40,20,10,0.55)';
    c.stroke();
    c.font = `${w * 0.44}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(k.icon, w / 2, w * 0.53);
  }, 128);
  const m = keepPlain(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  tops.set(t, m);
  return m;
}

function buildBoardModel(scene) {
  const S = shapes();
  const wood = paint(0x6b4527, { rough: 0.85 });
  const dark = paint(0x3f2716, { rough: 0.9 });
  const plank = paint(0x8a6038, { rough: 0.85 });
  const rope = paint(0xc9ad7a, { rough: 0.9 });
  const disc = new THREE.CylinderGeometry(1, 1, 1, 24);
  const face = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);

  board.forEach((s, i) => {
    const [x, z] = spots[i];
    const r = big(i) ? 1.9 : 1.25;
    part(disc, wood, { at: [x, TILE_Y - 0.22, z], size: [r, 0.4, r], into: scene });
    part(disc, dark, { at: [x, TILE_Y - 0.48, z], size: [r * 1.04, 0.12, r * 1.04], into: scene });
    part(face, tileTop(s.t), { at: [x, TILE_Y + 0.0, z], size: [r * 0.94, 1, r * 0.94], shadow: false, into: scene }).receiveShadow = true;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      part(S.disc, dark, { at: [x + Math.cos(a) * r * 0.7, -1.2, z + Math.sin(a) * r * 0.7], size: [0.14, 2.6, 0.14], into: scene });
    }
    // The boardwalk to each next stone: planks across two ropes.
    for (const n of s.next) {
      const a = new THREE.Vector3(x, 0, z);
      const b = new THREE.Vector3(spots[n][0], 0, spots[n][1]);
      const gap = a.distanceTo(b);
      const dir = b.clone().sub(a).normalize();
      const from = a.clone().addScaledVector(dir, big(i) ? 1.8 : 1.15);
      const to = b.clone().addScaledVector(dir, -(big(n) ? 1.8 : 1.15));
      const len = from.distanceTo(to);
      if (len < 0.2) continue;
      const yaw = Math.atan2(dir.x, dir.z);
      const count = Math.max(2, Math.round(len / 0.55));
      for (let k = 0; k < count; k++) {
        const at = from.clone().lerp(to, (k + 0.5) / count);
        const sag = Math.sin(((k + 0.5) / count) * Math.PI) * 0.18;
        part(S.box, plank, { at: [at.x, TILE_Y - 0.28 - sag, at.z], size: [0.95, 0.08, 0.38], turn: [0, yaw, 0], into: scene });
      }
      for (const side of [-1, 1]) {
        const off = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(0.5 * side);
        const mid = from.clone().lerp(to, 0.5).add(off);
        part(S.box, rope, { at: [mid.x, TILE_Y - 0.08, mid.z], size: [0.05, 0.05, len], turn: [0, yaw, 0], shadow: false, into: scene });
      }
      void gap;
    }
  });

  // The names of the waters, floating over each stretch of the route.
  for (const seg of SEGMENTS) {
    if (seg.spaces.length < 3) continue;
    const ids = board.filter((s) => s.seg === seg.id).map((s) => s.i);
    const mid = ids[Math.floor(ids.length / 2)];
    const el = stage.label('ck-zone');
    el.innerHTML = `${esc(seg.name)}${seg.risky ? '<b>stakes ×2</b>' : ''}`;
    zones.push({ el, at: v3(mid, 0.2).add(new THREE.Vector3(0, 0, 2.6)) });
  }
}
const zones = [];

/** A mound of sand under part of the route, with a few rocks and maybe a palm. */
function island(scene, x, z, rx, rz, { palms = 0, rocks = 3, colour = 0xe0bf83 } = {}) {
  const S = shapes();
  part(S.smooth, paint(colour, { rough: 1 }), { at: [x, -1.15, z], size: [rx, 1.55, rz], into: scene });
  part(S.round, new THREE.MeshBasicMaterial({ color: 0xffd9b0, transparent: true, opacity: 0.35, depthWrite: false }), { at: [x, -0.18, z], size: [rx * 1.12, 0.01, rz * 1.12], shadow: false, into: scene });
  for (let i = 0; i < rocks; i++) part(S.ball, paint(0x6c6470, { rough: 1 }), { at: [x + rand(-rx, rx) * 0.8, -0.2, z + rand(-rz, rz) * 0.7], size: rand(0.4, 0.9), into: scene });
  for (let i = 0; i < palms; i++) palm(scene, x + rand(-rx, rx) * 0.6, z + rand(-rz, rz) * 0.6, rand(0.15, 0.35), rand(5, 7.5), rand(0, 6));
}

function house(scene, x, z, colour, turn = 0, s = 1) {
  const S = shapes();
  const g = new THREE.Group();
  part(S.box, paint(colour, { rough: 0.8 }), { at: [0, 1, 0], size: [2.2, 2, 2], into: g });
  part(new THREE.ConeGeometry(1.75, 1.3, 4), paint(0x8c3a2a, { rough: 0.8 }), { at: [0, 2.65, 0], turn: [0, Math.PI / 4, 0], into: g });
  part(S.box, paint(0xffc46a, { glow: 1.4 }), { at: [0, 1.1, 1.01], size: [0.5, 0.6, 0.04], shadow: false, into: g });
  g.position.set(x, 0.2, z);
  g.rotation.y = turn;
  g.scale.setScalar(s);
  scene.add(g);
  return g;
}

function lighthouse(scene, x, z) {
  const S = shapes();
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) part(new THREE.CylinderGeometry(0.95 - i * 0.1, 1.05 - i * 0.1, 1.6, 14), paint(i % 2 ? 0xf1ece0 : 0xc8372d, { rough: 0.7 }), { at: [0, 0.8 + i * 1.6, 0], into: g });
  part(new THREE.CylinderGeometry(0.75, 0.75, 1.1, 12), paint(0xffe9a8, { glow: 2.5 }), { at: [0, 8.8, 0], shadow: false, into: g });
  part(new THREE.ConeGeometry(0.95, 1, 12), paint(0x2b2b33, { rough: 0.6 }), { at: [0, 9.8, 0], into: g });
  const light = new THREE.PointLight(0xffd890, 30, 26, 1.6);
  light.position.set(0, 8.8, 0);
  g.add(light);
  // A slow sweeping beam.
  beam = new THREE.Group();
  beam.position.set(0, 8.8, 0);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 26, 16, 1, true).translate(0, -13, 0).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.add(cone);
  g.add(beam);
  g.position.set(x, 0.4, z);
  scene.add(g);
}

function lantern(into, x, y, z, colour = 0xffb050) {
  const m = part(shapes().ball, paint(colour, { glow: 2.2 }), { at: [x, y, z], size: 0.22, shadow: false, into });
  return m;
}

function tavern(scene, x, z) {
  const S = shapes();
  const g = new THREE.Group();
  part(S.box, paint(0x7a5134, { rough: 0.8 }), { at: [0, 1.6, 0], size: [6, 3.2, 3.6], into: g });
  part(S.box, paint(0xd9c7a0, { rough: 0.8 }), { at: [0, 4.0, 0], size: [5.6, 1.8, 3.4], into: g });
  part(new THREE.ConeGeometry(4.4, 2.2, 4), paint(0x4a2a1c, { rough: 0.8 }), { at: [0, 6, 0], size: [1, 1, 0.65], turn: [0, Math.PI / 4, 0], into: g });
  for (const wx of [-1.8, 0, 1.8]) part(S.box, paint(0xffb85c, { glow: 1.8 }), { at: [wx, 1.5, 1.81], size: [0.8, 0.9, 0.05], shadow: false, into: g });
  part(S.box, paint(0xffd27a, { glow: 1.2 }), { at: [0, 4, 1.71], size: [1, 0.7, 0.05], shadow: false, into: g });
  // The sign, swinging over the door.
  const sign = decal((c, w, h) => {
    c.fillStyle = '#2b1b0f';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#f7c948';
    c.font = `${h * 0.42}px "Pirata One", serif`;
    c.textAlign = 'center';
    c.fillText('The Drowned Rat', w / 2, h * 0.65);
  }, 256, 64);
  part(S.box, new THREE.MeshStandardMaterial({ map: sign, roughness: 0.8 }), { at: [0, 3.2, 2.2], size: [3.2, 0.8, 0.08], into: g });
  // Lanterns on a string from the eaves to a pole.
  part(S.disc, paint(0x4a2a1c), { at: [5.2, 2, 3], size: [0.12, 4, 0.12], into: g });
  const colours = [0xff6f5e, 0xffc24a, 0x7fd6ff, 0xb388eb, 0x8be08b];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const l = lantern(g, -2.8 + t * 8, 3.6 - Math.sin(t * Math.PI) * 0.8, 1.9 + t * 1.1, colours[i % colours.length]);
    flames.push({ m: l, phase: rand(0, 6) });
  }
  const light = new THREE.PointLight(0xffa64a, 40, 18, 1.6);
  light.position.set(0, 2.5, 3.5);
  g.add(light);
  flames.push({ light, base: 40, phase: 1 });
  g.position.set(x, 0.3, z);
  g.rotation.y = -0.35;
  scene.add(g);
}

function signpost(scene, x, z, turn, labels) {
  const S = shapes();
  const g = new THREE.Group();
  part(S.disc, paint(0x5a3a22), { at: [0, 1.6, 0], size: [0.14, 3.2, 0.14], into: g });
  labels.forEach((text, i) => {
    const tex = decal((c, w, h) => {
      c.fillStyle = '#c9a56a';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#2b1b0f';
      c.font = `${h * 0.5}px "Pirata One", serif`;
      c.textAlign = 'center';
      c.fillText(text, w / 2, h * 0.68);
    }, 256, 56);
    const board = part(S.box, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), { at: [i ? -0.9 : 0.9, 2.6 - i * 0.7, 0], size: [2.2, 0.5, 0.08], turn: [0, 0, i ? 0.05 : -0.05], into: g });
    void board;
  });
  g.position.set(x, TILE_Y, z);
  g.rotation.y = turn;
  scene.add(g);
}

/** A tentacle: a curling chain of balls, thick at the water and thin at the tip. */
function tentacle(scene, x, z, { length = 9, thick = 0.9, colour = 0x7b2f5e, turn = rand(0, 6), speed = 1 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, -0.4, z);
  g.rotation.y = turn;
  const skin = paint(colour, { rough: 0.6 });
  const sucker = paint(0xe8a6b8, { rough: 0.6 });
  const segs = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const r = thick * (1 - (i / n) * 0.82);
    const m = part(shapes().ball, skin, { size: r, into: g });
    if (i % 2 === 0 && i < n - 2) part(shapes().ball, sucker, { at: [0, 0, r * 0.85], size: [r * 0.35, r * 0.35, r * 0.2], into: m }).scale.multiplyScalar(1 / r);
    segs.push(m);
  }
  scene.add(g);
  const t = { g, segs, length, phase: rand(0, 6), speed, rise: 1, base: 1 };
  tentacles.push(t);
  return t;
}

function curl(t, clock) {
  const n = t.segs.length;
  const step = (t.length / n) * t.rise;
  let x = 0;
  let y = 0;
  let a = Math.PI / 2; // straight up
  for (let i = 0; i < n; i++) {
    const k = i / n;
    a += (0.08 + Math.sin(clock * 0.9 * t.speed + t.phase + k * 3) * 0.16) * (0.5 + k * 1.6) * t.base;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    t.segs[i].position.set(x, y, Math.sin(clock * 0.7 + t.phase + k * 2) * k * 0.8);
  }
}

function buildKraken(scene, x, z) {
  const S = shapes();
  const g = new THREE.Group();
  const skin = paint(0x7b2f5e, { rough: 0.55 });
  const head = part(S.smooth, skin, { at: [0, 5, 0], size: [6, 7.5, 5.5], into: g });
  part(S.smooth, paint(0x5f2149, { rough: 0.6 }), { at: [0, 1.2, 0.5], size: [6.6, 3, 6], into: g });
  const eyes = [-1, 1].map((side) => {
    const white = part(S.smooth, paint(0xfff1a8, { glow: 1.2 }), { at: [side * 2.4, 4.2, 4.4], size: [1.25, 1.5, 0.8], shadow: false, into: g });
    part(S.smooth, paint(0x120712), { at: [0, 0, 0.55], size: [0.3, 0.8, 0.35], shadow: false, into: white });
    return white;
  });
  g.position.set(x, 0, z);
  g.rotation.y = -0.5;
  scene.add(g);
  const arms = [];
  for (let i = 0; i < 7; i++) {
    const a = -1.2 + (i / 6) * 2.4;
    arms.push(tentacle(scene, x + Math.sin(a - 0.5) * 9, z + Math.cos(a - 0.5) * 7, { length: rand(10, 15), thick: 1.2, turn: a + Math.PI / 2, speed: rand(0.7, 1.1) }));
  }
  // The hoard: a heap of gold and a couple of chests.
  const gold = paint(0xf2c14e, { glow: 0.35, rough: 0.35, metal: 0.6 });
  const hx = x - 7;
  const hz = z + 6;
  for (let i = 0; i < 70; i++) {
    const r = Math.sqrt(Math.random()) * 3;
    const a = rand(0, Math.PI * 2);
    part(S.disc, gold, { at: [hx + Math.cos(a) * r, 0.2 + (3 - r) * 0.5 + rand(0, 0.3), hz + Math.sin(a) * r], size: [0.35, 0.08, 0.35], turn: [rand(-0.6, 0.6), 0, rand(-0.6, 0.6)], into: scene });
  }
  part(S.smooth, gold, { at: [hx, 0, hz], size: [3.4, 1.6, 3.4], into: scene });
  for (const [cx, cz, t] of [[hx + 2.5, hz + 1, 0.4], [hx - 2.2, hz - 0.6, -0.5]]) {
    const chest = new THREE.Group();
    part(S.box, paint(0x6b3f1f), { at: [0, 0.5, 0], size: [1.6, 1, 1], into: chest });
    part(S.box, paint(0xb9801a, { metal: 0.6, rough: 0.4 }), { at: [0, 0.5, 0], size: [1.65, 0.15, 1.05], into: chest });
    part(S.box, paint(0x6b3f1f), { at: [0, 1.15, -0.35], size: [1.6, 0.25, 1], turn: [-0.9, 0, 0], into: chest });
    chest.position.set(cx, 0.6, cz);
    chest.rotation.y = t;
    scene.add(chest);
  }
  const glow = new THREE.PointLight(0xffc860, 30, 16, 1.5);
  glow.position.set(hx, 3, hz);
  scene.add(glow);
  return { g, head, eyes, arms, glow, mood: 0 };
}

function skull(scene, x, z) {
  const S = shapes();
  island(scene, x, z, 5.5, 4.2, { rocks: 4, colour: 0x8a8076 });
  const bone = paint(0xe8e0cc, { rough: 0.9 });
  const g = new THREE.Group();
  part(S.smooth, bone, { at: [0, 3, 0], size: [3.2, 3, 2.8], into: g });
  part(S.box, bone, { at: [0, 1.1, 0.9], size: [2.4, 1.2, 1.4], into: g });
  for (const side of [-1, 1]) part(S.smooth, paint(0x1a1012), { at: [side * 1.15, 3.1, 2.3], size: [0.75, 0.85, 0.6], shadow: false, into: g });
  part(new THREE.ConeGeometry(0.4, 0.7, 3), paint(0x1a1012), { at: [0, 2.2, 2.6], turn: [Math.PI, 0, 0], into: g });
  for (let i = 0; i < 5; i++) part(S.box, paint(0x1a1012), { at: [-0.9 + i * 0.45, 0.95, 1.62], size: [0.08, 0.7, 0.05], shadow: false, into: g });
  g.position.set(x, 0, z);
  g.rotation.y = 0.3;
  scene.add(g);
}

function fort(scene, x, z) {
  const S = shapes();
  island(scene, x, z, 6, 4.5, { palms: 1, rocks: 2 });
  const stone = paint(0xb7a98f, { rough: 0.95 });
  const g = new THREE.Group();
  for (const [wx, wz, sx, sz] of [[0, -2.5, 8, 0.8], [-3.8, 0, 0.8, 5], [3.8, 0, 0.8, 5]]) part(S.box, stone, { at: [wx, 1.2, wz], size: [sx, 2.4, sz], into: g });
  for (let i = 0; i < 7; i++) part(S.box, stone, { at: [-3.6 + i * 1.2, 2.65, -2.5], size: [0.6, 0.5, 0.8], into: g });
  part(new THREE.CylinderGeometry(1.2, 1.4, 5, 10), stone, { at: [2.8, 2.5, -1.8], into: g });
  part(new THREE.ConeGeometry(1.5, 1.6, 10), paint(0x3c5a8a), { at: [2.8, 5.8, -1.8], into: g });
  part(S.disc, paint(0x3a2a1a), { at: [-2.8, 4, -2], size: [0.08, 3.4, 0.08], into: g });
  const flag = part(new THREE.PlaneGeometry(1.6, 1, 6, 2), new THREE.MeshStandardMaterial({ color: 0xf1ece0, side: THREE.DoubleSide, roughness: 0.8 }), { at: [-2, 5.2, -2], into: g });
  flag.userData.base = Float32Array.from(flag.geometry.attributes.position.array);
  flags.push(flag);
  for (const cx of [-1.5, 0, 1.5]) part(S.disc, paint(0x2b2b30, { metal: 0.6, rough: 0.4 }), { at: [cx, 2.2, -2.95], size: [0.22, 1.2, 0.22], turn: [Math.PI / 2 - 0.2, 0, 0], into: g });
  g.position.set(x, 0.2, z);
  g.rotation.y = 0.2;
  scene.add(g);
}
const flags = [];

function shipyard(scene, x, z) {
  const S = shapes();
  island(scene, x, z, 7, 5, { rocks: 2 });
  const wood = paint(0x9a7046, { rough: 0.85 });
  const g = new THREE.Group();
  part(S.box, paint(0x7a5a3a), { at: [0, 0.3, 0], size: [3, 0.3, 10], turn: [0.08, 0, 0], into: g }); // the slipway
  part(S.box, wood, { at: [0, 0.9, 0], size: [0.4, 0.5, 8], into: g }); // the keel
  for (let i = 0; i < 9; i++) {
    const zz = -3.6 + i * 0.9;
    const w = 1.4 + Math.sin((i / 8) * Math.PI) * 0.8;
    for (const side of [-1, 1]) part(S.box, wood, { at: [side * w * 0.6, 1.9, zz], size: [0.18, 2.2, 0.18], turn: [0, 0, side * -0.45], into: g });
  }
  part(S.disc, paint(0x5a3a22), { at: [3.4, 3.5, 2], size: [0.2, 7, 0.2], into: g }); // a crane
  part(S.box, paint(0x5a3a22), { at: [2, 6.8, 2], size: [3.4, 0.2, 0.2], into: g });
  part(S.box, paint(0xc9ad7a), { at: [0.5, 5.4, 2], size: [0.04, 2.6, 0.04], into: g });
  g.position.set(x, 0.2, z);
  g.rotation.y = 0.9;
  scene.add(g);
}

function buoy(scene, x, z, colour) {
  const g = new THREE.Group();
  part(shapes().cone, paint(colour), { at: [0, 0.6, 0], size: [0.5, 1.4, 0.5], into: g });
  part(shapes().ball, paint(0xffe29a, { glow: 1.5 }), { at: [0, 1.45, 0], size: 0.14, shadow: false, into: g });
  g.position.set(x, 0, z);
  scene.add(g);
  bobbers.push({ g, x, z, phase: rand(0, 6) });
}
const bobbers = [];

function buildLandmarks(scene) {
  const at = (t, n = 0) => board.filter((s) => s.t === t)[n]?.i;
  const pos = (i) => spots[i];
  // Cradle Cove: a harbour with a lighthouse and a few cottages.
  const [sx, sz] = pos(0);
  island(scene, sx - 2, sz + 6, 10, 5, { palms: 2, rocks: 3 });
  lighthouse(scene, sx - 8, sz + 5);
  house(scene, sx + 2, sz + 7.5, 0xe7d3a8, 0.3);
  house(scene, sx - 3, sz + 9, 0xa7c4d8, -0.2, 0.85);
  house(scene, sx + 6, sz + 6.5, 0xe8a48c, 0.6, 0.8);
  // Tortuga.
  const [tx, tz] = pos(at('T'));
  island(scene, tx + 1, tz + 5, 8, 5, { palms: 3, rocks: 2 });
  tavern(scene, tx + 1.5, tz + 6.5);
  // The forks.
  const f1 = at('F', 0);
  const f2 = at('F', 1);
  signpost(scene, pos(f1)[0] + 2.4, pos(f1)[1] + 1.2, 0.4, ['Kraken Deep', 'Merchant Lanes']);
  signpost(scene, pos(f2)[0] - 2.2, pos(f2)[1] + 1.4, -0.3, ['Skull Island', 'The Fort']);
  // Kraken Deep: arms coming up beside the route.
  const deep = board.filter((s) => s.seg === 'deep').map((s) => s.i);
  for (const [k, side] of [[0, 1], [2, -1], [3, 1]]) {
    const [dx, dz] = pos(deep[Math.min(k, deep.length - 1)]);
    tentacle(scene, dx + side * 3.4, dz + side * 2.2, { length: rand(5, 7), thick: 0.6 });
  }
  // Merchant Lanes: buoys.
  const lanes = board.filter((s) => s.seg === 'lanes').map((s) => s.i);
  lanes.forEach((i, k) => k % 2 === 0 && buoy(scene, pos(i)[0] + (k % 4 ? 2.6 : -2.6), pos(i)[1] + 1.5, k % 4 ? 0x3d9a5b : 0xc8372d));
  // The shipyard.
  const [yx, yz] = pos(at('Y'));
  shipyard(scene, yx - 2, yz + 5.5);
  // Skull Island and the Governor's fort.
  const skullIds = board.filter((s) => s.seg === 'skull').map((s) => s.i);
  const [kx, kz] = pos(skullIds[Math.floor(skullIds.length / 2)]);
  skull(scene, kx + 1, kz - 5.5);
  const govIds = board.filter((s) => s.seg === 'gov').map((s) => s.i);
  const [gx, gz] = pos(govIds[Math.floor(govIds.length / 2)]);
  fort(scene, gx + 1, gz + 5.5);
  // Old Salt's Reach: a scatter of sea stacks.
  for (const i of board.filter((s) => s.seg === 'reach').map((s) => s.i)) {
    if (Math.random() < 0.5) part(shapes().ball, paint(0x6c6470, { rough: 1 }), { at: [pos(i)[0] + rand(-4, 4), 0.2, pos(i)[1] + (Math.random() < 0.5 ? -3.5 : 3.5)], size: [rand(0.8, 1.6), rand(1.5, 3), rand(0.8, 1.6)], into: scene });
  }
  // The Lair, with Sunset Cove off to one side.
  const [ex, ez] = pos(at('E'));
  island(scene, ex - 3, ez + 4, 10, 6.5, { rocks: 5, colour: 0x9b8a78 });
  kraken = buildKraken(scene, ex + 7, ez - 6);
  island(scene, ex - 14, ez + 3, 5, 4, { palms: 2, rocks: 1 });
  house(scene, ex - 14, ez + 2.5, 0xf4e6c1, 0.5, 1.2);
}

// ---------------------------------------------------------------------------
// The pirates' ships
// ---------------------------------------------------------------------------

const SHIP_SIZES = { rowboat: 1.25, sloop: 1.4, brig: 1.6, galleon: 1.8 };

/** A toy ship in a pirate's colour: hull, masts and sails for its type, and the crew on deck. */
function buildShip(type, colour, crew) {
  const S = shapes();
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const hullWood = paint(0x5a3820, { rough: 0.75 });
  const stripe = paint(new THREE.Color(colour).getHex(), { rough: 0.5 });
  const sailCloth = new THREE.MeshStandardMaterial({ color: 0xf3e6c8, roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
  const L = { rowboat: 1.6, sloop: 2.0, brig: 2.3, galleon: 2.6 }[type];
  const W = { rowboat: 0.75, sloop: 0.85, brig: 0.95, galleon: 1.05 }[type];
  part(S.box, hullWood, { at: [0, 0.32, 0], size: [W, 0.55, L], into: body });
  part(S.box, stripe, { at: [0, 0.52, 0], size: [W * 1.04, 0.14, L * 1.01], into: body });
  part(new THREE.ConeGeometry(W * 0.72, W * 1.3, 4), hullWood, { at: [0, 0.34, L / 2 + W * 0.45], size: [1, 1, 0.7], turn: [Math.PI / 2, Math.PI / 4, 0], into: body });
  if (type !== 'rowboat') part(S.box, hullWood, { at: [0, 0.75, -L / 2 + 0.4], size: [W, 0.45, 0.8], into: body }); // the stern castle
  if (type === 'galleon') part(S.box, stripe, { at: [0, 1.1, -L / 2 + 0.4], size: [W * 1.02, 0.25, 0.82], into: body });
  const masts = { rowboat: [], sloop: [0.1], brig: [0.45, -0.4], galleon: [0.75, 0, -0.7] }[type];
  const sails = [];
  for (const mz of masts) {
    const h = type === 'sloop' ? 2.2 : type === 'brig' ? 2.4 : 2.6;
    part(S.disc, paint(0x3f2716), { at: [0, 0.5 + h / 2, mz], size: [0.06, h, 0.06], into: body });
    for (const [y, w] of [[0.5 + h * 0.42, 1.2], [0.5 + h * 0.78, 0.9]]) {
      const sail = part(new THREE.PlaneGeometry(W * w * 1.3, h * 0.32, 4, 2), sailCloth, { at: [0, y, mz + 0.05], into: body });
      const p = sail.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, 0.12 * Math.cos((p.getX(i) / (W * w)) * Math.PI));
      sail.geometry.computeVertexNormals();
      sails.push(sail);
    }
    const pennant = part(new THREE.PlaneGeometry(0.7, 0.3, 4, 1).translate(0.35, 0, 0), new THREE.MeshStandardMaterial({ color: colour, side: THREE.DoubleSide, roughness: 0.8 }), { at: [0, 0.5 + h + 0.1, mz], shadow: false, into: body });
    pennant.userData.base = Float32Array.from(pennant.geometry.attributes.position.array);
    flags.push(pennant);
  }
  if (type === 'rowboat') for (const side of [-1, 1]) part(S.box, paint(0x9a7046), { at: [side * W * 0.75, 0.5, 0], size: [1.3, 0.05, 0.12], turn: [0, 0.3 * side, -0.35 * side], into: body });
  // The crew: little pegs on deck.
  const pegs = [];
  for (let i = 0; i < crew; i++) {
    const peg = new THREE.Group();
    const shirt = paint([0xd9d2c0, 0x3b5f8a, 0x8a3b3b, 0x4f7a4a, 0xc9a24a][i % 5], { rough: 0.7 });
    part(new THREE.CylinderGeometry(0.1, 0.14, 0.34, 8), shirt, { at: [0, 0.17, 0], into: peg });
    part(S.smooth, paint(0xd8a878, { rough: 0.6 }), { at: [0, 0.42, 0], size: 0.11, into: peg });
    const row = Math.floor(i / 2);
    peg.position.set((i % 2 ? 0.22 : -0.22) * W, 0.6, L / 2 - 0.45 - row * 0.42);
    body.add(peg);
    pegs.push(peg);
  }
  g.scale.setScalar(SHIP_SIZES[type]);
  return { g, body, sails, pegs };
}

function makeShip(id) {
  const p = players.get(id);
  const label = stage.label('ck-tag');
  return { id, group: null, type: null, crew: -1, colour: p?.color ?? '#888', at: 0, queue: [], hop: null, label, sig: '', yaw: 0, spot: new THREE.Vector3(), mood: null };
}

function refreshShip(s, pirate) {
  if (s.type === pirate.ship && s.crew === pirate.crew) return;
  const grow = s.type && s.type !== pirate.ship;
  if (s.group) stage.scene.remove(s.group);
  const built = buildShip(pirate.ship, s.colour, pirate.crew);
  s.group = built.g;
  s.parts = built;
  s.type = pirate.ship;
  s.crew = pirate.crew;
  stage.scene.add(s.group);
  s.group.position.copy(s.spot.lengthSq() ? s.spot : v3(s.at));
  if (grow) {
    sparkle(s.group.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xffe08a, 26);
    const scale = SHIP_SIZES[pirate.ship];
    stage.tween(0.9, (k) => s.group.scale.setScalar(scale * (0.4 + 0.6 * k)), { ease: (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2 });
  }
}

/** Where a ship rests on its stone, sharing it with whoever else is there. */
function berth(s) {
  // Retired: moored in a row along Sunset Cove, beside the Lair.
  if (board[s.at]?.t === 'E') {
    const moored = [...ships.values()].filter((o) => !o.hop && !o.queue.length && o.at === s.at).sort((a, b) => (a.id < b.id ? -1 : 1));
    const k = Math.max(0, moored.indexOf(s));
    return v3(s.at, TILE_Y).add(new THREE.Vector3(-3.4 - (k % 4) * 3.3, 0, 2.6 + Math.floor(k / 4) * 3.4));
  }
  const here = [...ships.values()].filter((o) => !o.hop && !o.queue.length && o.at === s.at).sort((a, b) => (a.id < b.id ? -1 : 1));
  const n = here.length;
  const k = here.indexOf(s);
  const base = v3(s.at, TILE_Y);
  if (n <= 1 || k < 0) return base;
  const r = (big(s.at) ? 1.7 : 1.2) * (n > 4 ? 1.25 : 1);
  const a = (k / n) * Math.PI * 2 + 0.6;
  return base.add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
}

/** Which way a ship faces: towards where it's going next. */
function heading(i) {
  const next = board[i]?.next?.[0];
  if (next === undefined) return Math.PI;
  return Math.atan2(spots[next][0] - spots[i][0], spots[next][1] - spots[i][1]);
}

function moveShips(dt, clock) {
  for (const s of ships.values()) {
    if (!s.group) continue;
    if (!s.hop && s.queue.length) {
      const to = s.queue.shift();
      s.hop = { from: s.group.position.clone(), to, t: 0, dur: view?.spot?.hop ?? 0.42 };
      s.yaw = Math.atan2(spots[to][0] - s.group.position.x, spots[to][1] - s.group.position.z);
    }
    if (s.hop) {
      const h = s.hop;
      h.t = Math.min(1, h.t + dt / h.dur);
      const end = v3(h.to, TILE_Y);
      s.group.position.lerpVectors(h.from, end, easeInOut(h.t));
      s.group.position.y += Math.sin(h.t * Math.PI) * 1.3;
      s.parts.body.rotation.x = Math.sin(h.t * Math.PI * 2) * -0.25;
      if (h.t >= 1) {
        s.at = h.to;
        s.hop = null;
        s.parts.body.rotation.x = 0;
        landed(s);
      }
    } else {
      const want = berth(s);
      s.group.position.lerp(want, 1 - Math.exp(-dt * 6));
      s.group.position.y = TILE_Y + Math.sin(clock * 2 + s.colour.length + s.id.charCodeAt(0)) * 0.04;
      if (!s.queue.length) s.yaw = board[s.at]?.t === 'E' ? Math.PI * 0.85 : heading(s.at);
    }
    let d = s.yaw - s.group.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    s.group.rotation.y += d * (1 - Math.exp(-dt * 8));
    s.parts.body.rotation.z = Math.sin(clock * 1.6 + s.id.charCodeAt(1)) * 0.05;
    s.spot.copy(s.group.position);
  }
}

/** A ship touches down on a stone: a knock, and anything it was owed there. */
function landed(s) {
  const now = performance.now();
  if (now - lastStep > 90) {
    lastStep = now;
    sound.play('ckStep', { level: 0.6 });
  }
  const steps = (s.stepped = (s.stepped ?? 0) + 1);
  for (const e of view?.spot?.events ?? []) {
    if (e.id !== s.id || e.step !== steps) continue;
    if (e.kind === 'pay') pop(s, `<span class="ck-pop gold">🪙 +${fmt(e.amount)}</span>`);
    if (e.kind === 'T') pop(s, '<span class="ck-pop pink">💍 Tortuga!</span>');
    if (e.kind === 'Y') pop(s, '<span class="ck-pop">🎖️ Captain!</span>');
  }
}

// ---------------------------------------------------------------------------
// Little effects
// ---------------------------------------------------------------------------

/** Words that float up off a ship and fade. */
function pop(s, html, life = 2.2) {
  const el = stage.label('ck-popup');
  el.innerHTML = html;
  popups.push({ el, at: () => s.spot.clone().add(new THREE.Vector3(0, LABEL_LIFT + 0.6, 0)), born: stage.clock, life });
}

function sparkle(at, colour = 0xffe08a, n = 18) {
  const mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, depthWrite: false });
  for (let i = 0; i < n; i++) {
    const m = part(shapes().ball, mat, { at: at.toArray(), size: rand(0.08, 0.18), shadow: false, into: stage.scene });
    const v = new THREE.Vector3(rand(-1, 1), rand(1, 3), rand(-1, 1));
    stage.tween(rand(0.9, 1.5), (k, raw) => {
      m.position.copy(at).addScaledVector(v, raw * 1.6);
      m.position.y -= raw * raw * 1.5;
      mat.opacity = 1 - raw;
    }, { done: () => stage.scene.remove(m) });
  }
}

function hearts(at) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xff6f9a, transparent: true, depthWrite: false });
  for (let i = 0; i < 16; i++) {
    const m = part(shapes().smooth, mat, { at: at.toArray(), size: rand(0.18, 0.3), shadow: false, into: stage.scene });
    const drift = new THREE.Vector3(rand(-1.5, 1.5), 0, rand(-1.5, 1.5));
    stage.tween(rand(2, 3.2), (k, raw) => {
      m.position.copy(at).addScaledVector(drift, raw).add(new THREE.Vector3(Math.sin(raw * 9 + i) * 0.3, raw * 5, 0));
      mat.opacity = 1 - raw;
    }, { delay: i * 0.06, done: () => stage.scene.remove(m) });
  }
}

function smoke(at, colour = 0xd8d0c4) {
  const mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.8, depthWrite: false });
  for (let i = 0; i < 10; i++) {
    const m = part(shapes().ball, mat, { at: at.toArray(), size: 0.3, shadow: false, into: stage.scene });
    const v = new THREE.Vector3(rand(-1, 1), rand(0.3, 1.2), rand(-1, 1));
    stage.tween(1.6, (k, raw) => {
      m.position.copy(at).addScaledVector(v, easeOut(raw) * 2.5);
      m.scale.setScalar(0.3 + raw * 1.4);
      mat.opacity = 0.8 * (1 - raw);
    }, { delay: i * 0.03, done: () => stage.scene.remove(m) });
  }
  const flash = new THREE.PointLight(0xffa040, 60, 14, 1.5);
  flash.position.copy(at);
  stage.scene.add(flash);
  stage.tween(0.4, (k) => (flash.intensity = 60 * (1 - k)), { done: () => stage.scene.remove(flash) });
}

/** A tentacle bursts up beside a ship, then sinks again. */
function krakenStrike(s) {
  const at = s.spot.clone();
  const t = tentacle(stage.scene, at.x + 1.8, at.z + 0.6, { length: 7, thick: 0.6, turn: Math.atan2(-1.8, -0.6) + Math.PI / 2 });
  t.rise = 0.01;
  stage.tween(0.6, (k) => (t.rise = k), { ease: easeOut });
  stage.tween(0.9, (k) => (t.rise = 1 - k), {
    delay: 2.6,
    ease: easeInOut,
    done: () => {
      stage.scene.remove(t.g);
      tentacles.splice(tentacles.indexOf(t), 1);
    },
  });
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/** Frame a set of points (world space) with room for the ledger on the right. */
function frameOn(points, { min = 26, tilt = 0.95, pad = 1.25, side = 0.16, lift = 0.2 } = {}) {
  const box = new THREE.Box3();
  for (const p of points) box.expandByPoint(p);
  if (box.isEmpty()) box.expandByPoint(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(min, size.x * 0.62, size.z * 1.05) * pad;
  const dist = span / (2 * Math.tan((stage.camera.fov * Math.PI) / 360)) * 0.95;
  // Look a little to the right of and in front of the subject, so it sits clear of the ledger and the panel along the bottom.
  const look = c.clone().add(new THREE.Vector3(dist * side, 0, dist * lift));
  const pos = look.clone().add(new THREE.Vector3(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist));
  return { pos, look };
}

const shipAt = (id) => ships.get(id)?.spot ?? null;

function shot() {
  const v = view;
  if (!v) return frameOn([new THREE.Vector3()]);
  const spot = v.spot ?? {};
  const all = [...ships.values()].map((s) => s.spot.clone());
  const sailing = v.pirates.filter((p) => !p.retired).map((p) => shipAt(p.id)).filter(Boolean);
  const lair = spots.length ? v3(spots.length - 1) : new THREE.Vector3();
  const pair = (a, b) => frameOn([shipAt(a), shipAt(b)].filter(Boolean), { min: 18, tilt: 0.75 });
  switch (v.phase) {
    case 'intro':
    case 'calling':
    case 'callings':
      return frameOn([v3(0), ...all], { min: 34, tilt: 0.7 });
    case 'wedding':
      return spot.b ? pair(spot.a, spot.b) : frameOn([shipAt(spot.a)], { min: 14, tilt: 0.7 });
    case 'card':
      return spot.target ? pair(spot.by, spot.target) : frameOn([shipAt(spot.by)], { min: 16, tilt: 0.7 });
    case 'duel':
      return pair(spot.a, spot.b);
    case 'tale':
      return frameOn([shipAt(spot.by)], { min: 13, tilt: 0.62, side: 0.24 });
    case 'wakes':
    case 'job':
    case 'tally':
    case 'titles':
      return frameOn([lair, kraken.g.position.clone().add(new THREE.Vector3(0, 6, 0))], { min: 34, tilt: 0.45, side: 0.2 });
    case 'decide':
      return frameOn(all.length ? all : [lair], { min: 30, tilt: 0.7 });
    default: {
      const moving = [...ships.values()].filter((s) => s.hop || s.queue.length).map((s) => s.spot.clone());
      const pts = v.phase === 'sail' && moving.length ? [...moving, ...sailing] : sailing.length ? sailing : all;
      return frameOn(pts.length ? pts : [lair], { min: 28, tilt: 0.66 });
    }
  }
}

function moveCamera(dt, clock) {
  const want = shot();
  const drift = new THREE.Vector3(Math.sin(clock * 0.11) * 1.2, 0, Math.cos(clock * 0.09) * 0.8);
  want.pos.add(drift);
  if (!cam.snapped) {
    cam.pos.copy(want.pos);
    cam.look.copy(want.look);
    cam.snapped = true;
  }
  const f = 1 - Math.exp(-dt * 1.4);
  cam.pos.lerp(want.pos, f);
  cam.look.lerp(want.look, f);
  stage.camera.position.copy(cam.pos);
  stage.camera.lookAt(cam.look);
  stage.camera.updateMatrixWorld();
}

// ---------------------------------------------------------------------------
// Every frame
// ---------------------------------------------------------------------------

function frame(dt, clock) {
  waves(clock);
  moveShips(dt, clock);
  for (const t of tentacles) curl(t, clock);
  if (kraken) {
    const wake = ['wakes', 'job'].includes(view?.phase) ? 1 : 0;
    kraken.mood += (wake - kraken.mood) * (1 - Math.exp(-dt * 2));
    kraken.g.position.y = Math.sin(clock * 0.6) * 0.3 + kraken.mood * 1.5;
    for (const e of kraken.eyes) e.material.emissiveIntensity = 1.2 + kraken.mood * 2 + Math.sin(clock * 3) * 0.2;
    for (const a of kraken.arms) a.speed = 0.8 + kraken.mood * 1.6;
    kraken.glow.intensity = 30 + Math.sin(clock * 2) * 5;
  }
  if (beam) beam.rotation.y = clock * 0.6;
  for (const f of flames) {
    const k = 0.85 + 0.15 * Math.sin(clock * 11 + f.phase) * Math.sin(clock * 6.3 + f.phase);
    if (f.light) f.light.intensity = f.base * k;
    if (f.m) f.m.scale.setScalar(0.22 * (0.9 + 0.1 * k));
  }
  for (const flag of flags) {
    const a = flag.geometry.attributes.position;
    const b = flag.userData.base;
    for (let i = 0; i < a.count; i++) a.setZ(i, Math.sin(b[i * 3] * 5 - clock * 6) * 0.08 * (b[i * 3] + 0.4));
    a.needsUpdate = true;
  }
  for (const b of bobbers) {
    b.g.position.y = swell(b.x, b.z, clock) - 0.2;
    b.g.rotation.z = Math.sin(clock * 1.3 + b.phase) * 0.12;
  }
  for (const gull of gulls) {
    const t = clock * gull.speed + gull.phase;
    gull.g.position.set(gull.cx + Math.cos(t) * gull.r, gull.h + Math.sin(t * 2) * 0.8, gull.cz + Math.sin(t) * gull.r * 0.6);
    gull.g.rotation.y = -t + (gull.speed > 0 ? Math.PI : 0);
    const flap = Math.sin(clock * 7 + gull.phase) * 0.4;
    gull.wings[0].rotation.z = flap;
    gull.wings[1].rotation.z = -flap;
  }
  for (const c of clouds) {
    c.g.position.x += c.speed * dt;
    if (c.g.position.x > 280) c.g.position.x = -280;
  }
  room.tick(dt, playing);
  moveCamera(dt, clock);
  // Labels: each ship's name tag, the zone names, and anything floating up.
  for (const s of ships.values()) {
    if (!s.group) continue;
    stage.pin(s.label, s.spot.clone().add(new THREE.Vector3(0, LABEL_LIFT * SHIP_SIZES[s.type], 0)));
  }
  const far = stage.camera.position.distanceTo(cam.look);
  for (const z of zones) {
    stage.pin(z.el, z.at);
    z.el.style.opacity = far > 70 ? 0.85 : far > 45 ? 0.5 : 0;
  }
  stage.labelsEl.style.setProperty('--zoom', Math.max(0.6, Math.min(1.25, 60 / far)).toFixed(2));
  stage.labelsEl.classList.toggle('ck-far', far > 75);
  popups = popups.filter((p) => {
    const age = stage.clock - p.born;
    if (age > p.life) {
      p.el.remove();
      return false;
    }
    stage.pin(p.el, (typeof p.at === 'function' ? p.at() : p.at).add(new THREE.Vector3(0, age * 1.4, 0)));
    p.el.style.opacity = Math.min(1, (p.life - age) * 2);
    return true;
  });
}

function makeGull(cx, cz) {
  const g = new THREE.Group();
  const white = paint(0xf6efe6, { rough: 0.8 });
  part(shapes().smooth, white, { size: [0.35, 0.22, 0.7], into: g });
  const wings = [-1, 1].map((side) => {
    const w = new THREE.Group();
    part(shapes().box, white, { at: [side * 0.8, 0, 0], size: [1.6, 0.05, 0.45], into: w });
    part(shapes().box, paint(0x2b2b2b), { at: [side * 1.55, 0, 0], size: [0.3, 0.06, 0.4], into: w });
    g.add(w);
    return w;
  });
  stage.scene.add(g);
  return { g, wings, cx, cz, r: rand(10, 20), h: rand(9, 15), speed: rand(0.15, 0.3) * (Math.random() < 0.5 ? -1 : 1), phase: rand(0, 6) };
}

function init(boardData) {
  stage = createStage({
    id: 'ckLayer',
    background: 0x2a1d4f,
    exposure: 1.2,
    fov: 32,
    overlay: '<div class="ck-vignette"></div>',
    // Lighting styles (see looks3d.js). House style: a fine, light dither on
    // the light (the Parley look, but gentler) and a touch of tilt-shift, so
    // the board reads as a toy on a table.
    looks: {
      knee: 1.2,
      house: { light: { pattern: 'bayer', bands: 6, cell: 2, spread: 0.45, amount: 0.35 }, post: { tilt: { amount: 0.8, centre: 0.52, band: 0.24 } } },
    },
  });
  const { scene } = stage;
  scene.fog = new THREE.Fog(0xf0a07e, 55, 200);
  scene.add(new THREE.HemisphereLight(0xffc6b0, 0x34407a, 1.25));
  const sun = new THREE.DirectionalLight(0xffc27a, 2.6);
  sun.position.set(-45, 30, -60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 70, bottom: -70, near: 1, far: 220 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8fa8ff, 0.5);
  fill.position.set(40, 30, 60);
  scene.add(fill);

  board = boardData.length ? boardData.map((s, i) => ({ i, ...s })) : buildBoard();
  spots = layout();
  sea = buildSea(scene);
  buildSky(scene);
  buildBoardModel(scene);
  buildLandmarks(scene);
  gulls = [makeGull(-30, 20), makeGull(20, 10), makeGull(-10, -30), makeGull(30, -40)];
  stage.onFrame = frame;
}

// ---------------------------------------------------------------------------
// The two functions host.js calls
// ---------------------------------------------------------------------------

function tagHtml(p, pirate) {
  const mate = pirate.mate ? '<i class="ck-ring">💍</i>' : '';
  const state = pirate.retired ? `<i>${pirate.plan === 'job' ? '💀' : '🌅'}</i>` : pirate.becalmed ? '<i>🌫️</i>' : '';
  return `${chipHtml(p, esc, { label: false })}<b>${esc(p.name)}</b>${mate}${state}`;
}

export function show(v, playerMap) {
  if (!stage) init(v.board ?? []);
  players = playerMap;
  if (stage.open()) cam.snapped = false;
  playing = !v.paused;
  const prev = view;
  view = v;

  // Ships: one per pirate, rebuilt when they buy a bigger one or their crew changes.
  for (const pirate of v.pirates) {
    let s = ships.get(pirate.id);
    if (!s) {
      s = makeShip(pirate.id);
      s.at = pirate.pos;
      ships.set(pirate.id, s);
    }
    refreshShip(s, pirate);
    const p = players.get(pirate.id);
    const html = tagHtml(p ?? { name: '?', avatar: '', color: '#888' }, pirate);
    if (s.sig !== html) {
      s.sig = html;
      s.label.innerHTML = html;
      s.label.className = `kit-label ck-tag ${pirate.retired ? 'retired' : ''}`;
    }
  }

  // Sailing: queue up each ship's path, once per sail.
  if (v.phase === 'sail' && seen.sail !== v.key) {
    seen.sail = v.key;
    for (const path of v.spot.paths ?? []) {
      const s = ships.get(path.id);
      if (!s) continue;
      s.at = path.from;
      s.stepped = 0;
      s.queue = path.path.slice();
    }
  } else if (v.phase !== 'sail') {
    // Anywhere else, a ship that isn't where the server says jumps there (e.g. after a reload).
    for (const pirate of v.pirates) {
      const s = ships.get(pirate.id);
      if (s && !s.hop && !s.queue.length && s.at !== pirate.pos) s.queue = [pirate.pos];
    }
  }

  // Spins: a number pops off each ship as its wheel lands.
  if (v.phase === 'spin') {
    for (const r of v.spot.spun ?? []) {
      const mark = `${v.key}:${r.id}`;
      if (seen.spin.has(mark)) continue;
      seen.spin.add(mark);
      const s = ships.get(r.id);
      if (s) pop(s, `<span class="ck-pop spin">🎡 ${r.roll}${r.move !== r.roll ? ` → ${r.move}` : ''}</span>`, 2.6);
    }
    for (const m of v.spot.payouts ?? []) {
      const mark = `${v.key}:map:${m.owner}:${m.by}`;
      if (seen.spin.has(mark)) continue;
      seen.spin.add(mark);
      const s = ships.get(m.owner);
      if (s) pop(s, `<span class="ck-pop gold">🗺️ ${m.n}! +${fmt(600)}</span>`, 2.6);
    }
  }

  // Landings: the Kraken strikes, crew come aboard.
  if (v.phase === 'land' && seen.land !== v.key) {
    seen.land = v.key;
    for (const c of v.spot.cards ?? []) {
      const s = ships.get(c.id);
      if (!s) continue;
      if (c.t === 'k') setTimeout(() => krakenStrike(s), 400);
      if (c.t === '$') sparkle(s.spot.clone().add(new THREE.Vector3(0, 1.2, 0)));
    }
  }

  // Drinks: a tankard pops off whoever has to drink.
  const pourKey = `${v.key}:${(v.pours ?? []).length}`;
  if (seen.pours !== pourKey) {
    const already = seen.pours?.startsWith(`${v.key}:`) ? Number(seen.pours.split(':').pop()) : 0;
    seen.pours = pourKey;
    for (const d of (v.pours ?? []).slice(already)) {
      const s = ships.get(d.id);
      if (s) pop(s, d.n ? `<span class="ck-pop swig">🍺 ×${d.n}</span>` : '<span class="ck-pop">🫀 Iron Liver!</span>', 2.8);
    }
  }

  // The big moments.
  if (v.phase === 'wedding' && seen.wed !== v.key) {
    seen.wed = v.key;
    const a = ships.get(v.spot.a);
    const b = v.spot.b ? ships.get(v.spot.b) : null;
    if (v.spot.kind === 'wed' && a && b) setTimeout(() => hearts(a.spot.clone().lerp(b.spot, 0.5).add(new THREE.Vector3(0, 1.5, 0))), 300);
  }
  if (v.phase === 'duel' && v.spot.result && seen.duel !== v.key) {
    seen.duel = v.key;
    const a = ships.get(v.spot.a);
    const b = ships.get(v.spot.b);
    if (a && b) {
      smoke(a.spot.clone().add(new THREE.Vector3(0, 1, 0)));
      setTimeout(() => smoke(b.spot.clone().add(new THREE.Vector3(0, 1, 0))), 250);
    }
  }
  void prev;
}

export function hide() {
  if (!stage?.close()) return;
  view = null;
  for (const p of popups) p.el.remove();
  popups = [];
}

// ---------------------------------------------------------------------------
// The words host.js draws over the top
// ---------------------------------------------------------------------------

export function cradleScreens({ anim, chip, player }) {
  const name = (id) => esc(player(id)?.name ?? '?');
  const money = (n) => `${n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
  const signed = (n) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '');
  const SHIP_ICON = { rowboat: '🛶', sloop: '⛵', brig: '🚢', galleon: '🏴‍☠️' };
  const PHASES = {
    calling: 'Pick a calling', callings: 'The crew signs on', spin: 'Spin the helm!', sail: 'Full sail!', land: 'Landfall', decide: 'Orders, captains',
    orders: 'Orders given', wedding: 'Tortuga', card: 'Fate takes a hand', duel: 'A raid!', tale: 'Tavern tales', give: 'Bottoms up', haunt: 'A haunting',
    wakes: 'The Kraken wakes', job: 'One Last Job', tally: 'The reckoning', titles: 'Tales of the voyage',
  };

  function ledger(v) {
    const rows = [...v.pirates].sort((a, b) => b.cash - a.cash);
    const lead = rows[0]?.cash;
    return `<aside class="ck-ledger">${rows
      .map((x, i) => `<div class="ck-row-l ${x.retired ? 'retired' : ''} ${x.cash === lead && lead > 0 ? 'lead' : ''}"${anim(`led${x.id}`, 'from-right', i * 50, 400)}>
        <span class="ck-rank">${i + 1}</span>${chip(x.id, { label: false })}
        <span class="ck-who"><b>${name(x.id)}</b><small>${x.calling ? `${x.calling.icon} ${esc(x.calling.name)}` : '…'}${x.mate ? ` · 💍 ${name(x.mate)}` : ''}</small></span>
        <span class="ck-assets">${SHIP_ICON[x.ship]}<em>${x.crew}</em>${x.maps.length ? `🗺️<em>${x.maps.join(' ')}</em>` : ''}${v.drink ? `🍺<em>${x.swigs}</em>` : ''}</span>
        <span class="ck-cash">${money(x.cash)}${x.iou ? `<small>🦈 ×${x.iou}</small>` : ''}</span>
        ${x.retired ? `<span class="ck-state">${x.plan === 'job' ? '💀' : x.plan === 'sunset' ? '🌅' : '⚓'}</span>` : ''}
      </div>`)
      .join('')}</aside>`;
  }

  function pours(v) {
    if (!v.pours?.length) return '';
    const merged = new Map();
    for (const d of v.pours) {
      const m = merged.get(d.id) ?? { id: d.id, n: 0, fine: 0, why: [] };
      m.n += d.n;
      m.fine += d.fine ?? 0;
      if (!m.why.includes(d.why)) m.why.push(d.why);
      merged.set(d.id, m);
    }
    return `<div class="ck-pours">${[...merged.values()]
      .map((d, i) => `<div class="ck-pour-tag ${d.n ? '' : 'saved'}"${anim(`pour${d.id}-${d.n}`, 'ck-slam', i * 160, 500)}>${chip(d.id)}<b>${d.n ? (v.drink ? `🍺 ×${d.n}` : `💸 ${fmt(d.fine)}`) : '🫀 saved'}</b><small>${esc(d.why.slice(0, 2).join(' · '))}</small></div>`)
      .join('')}</div>`;
  }

  const head = (v, extra = '') => `<div class="ck-head"${anim(`head-${v.phase}`, 'drop', 0, 450)}><span class="ck-year">${v.year ? `Year ${v.year} <small>of ${v.maxYears}</small>` : 'Cradle to Kraken'}</span><span class="ck-phase">${esc(PHASES[v.phase] ?? '')}</span>${extra}</div>`;

  const progress = (items) => `<div class="ck-progress">${items.map((x) => `<span class="${x.done ? 'done' : ''}">${chip(x.id, { label: false })}${x.done ? '<i>✓</i>' : ''}</span>`).join('')}</div>`;

  function body(v) {
    const s = v.spot ?? {};
    switch (v.phase) {
      case 'calling':
        return `<div class="ck-card ck-centre parch"${anim('cc', 'pop', 200, 500)}><h2>Your life at sea begins</h2><p>Choose a calling on your phone. It sets your wages and gives you a trick.</p>${progress(v.pirates.map((x) => ({ id: x.id, done: (s.chosen ?? []).includes(x.id) })))}</div>`;
      case 'callings':
        return `<div class="ck-grid">${(s.list ?? [])
          .map((x, i) => `<div class="ck-mini parch"${anim(`cl${x.id}`, 'pop', i * 140, 450)}>${chip(x.id)}<b>${x.calling.icon} ${esc(x.calling.name)}</b><small>🪙 ${fmt(x.calling.share)} · ${esc(x.calling.perk)}</small>${x.maps.length ? `<small>🗺️ Free map: ${x.maps[0]}</small>` : ''}</div>`)
          .join('')}</div>`;
      case 'spin': {
        const spun = new Map((s.spun ?? []).map((r) => [r.id, r]));
        return `<div class="ck-strip"${anim('spin', 'rise', 200, 450)}>${(s.sailing ?? [])
          .map((id) => {
            const r = spun.get(id);
            return `<span class="ck-spun ${r ? 'in' : ''}">${chip(id, { label: false })}<b${r ? anim(`roll${id}`, 'ck-slam', 0, 450) : ''}>${r ? r.roll : '…'}</b>${r && r.move !== r.roll ? `<small>sail ${r.move}</small>` : ''}</span>`;
          })
          .join('')}</div>${(s.payouts ?? []).length ? `<p class="ck-maps">${s.payouts.map((m) => `🗺️ <b>${m.n}</b> pays ${chip(m.owner, { label: false })}`).join(' · ')}</p>` : ''}`;
      }
      case 'land':
        return `<div class="ck-lands n${Math.min(12, (s.cards ?? []).length)}">${(s.cards ?? [])
          .map((c, i) => {
            const k = c.t;
            return `<div class="ck-land parch t-${k === '$' ? 'fortune' : k} ${c.risky ? 'risky' : ''}"${anim(`land${c.id}`, 'pop', i * 220, 450)}>
              <div class="ck-land-top">${chip(c.id, { label: false })}<span class="ck-land-kind">${c.icon} ${esc(c.title)}</span></div>
              <p>${esc(c.text)}${c.extra && c.text !== c.extra ? ` <em>${esc(c.extra)}</em>` : ''}</p>
              ${c.joined ? `<p class="ck-land-crew">🧑‍🤝‍🧑 ${c.joined.map(esc).join(', ')}</p>` : ''}
              ${c.lost ? `<p class="ck-land-crew lost">🐙 ${c.lost.map(esc).join(', ')}</p>` : ''}
              ${c.gain ? `<span class="ck-land-gain ${c.gain < 0 ? 'neg' : ''}">${signed(c.gain)}</span>` : ''}
              ${c.game ? '<span class="ck-land-game">Everyone plays!</span>' : ''}
            </div>`;
          })
          .join('')}</div>`;
      case 'decide':
        return `<div class="ck-card ck-low parch"${anim('dec', 'rise', 100, 450)}><h2>📜 Orders on your phones</h2>${progress(s.progress ?? [])}</div>`;
      case 'orders':
        return `<div class="ck-card ck-list parch"${anim('ord', 'pop', 100, 450)}>${(s.orders ?? []).map((o, i) => `<p${anim(`o${i}`, 'from-left', 200 + i * 220, 400)}>${chip(o.id)} <span>${o.icon} ${esc(o.text)}</span>${o.risky ? ' <b class="ck-risky">stakes ×2</b>' : ''}</p>`).join('')}</div>`;
      case 'wedding': {
        if (s.kind === 'sea') return `<div class="ck-card ck-centre parch"${anim('w', 'pop', 0, 500)}><div class="ck-big">🌊</div><h2>${chip(s.a)} marries the sea</h2><p>A quiet life. The sea sends a little gift.</p></div>`;
        if (s.kind === 'no') return `<div class="ck-card ck-centre parch"${anim('w', 'pop', 0, 500)}><div class="ck-big"${anim('wb', 'ck-slam', 900, 500)}>💔</div><h2>${chip(s.a)} proposed to ${chip(s.b)}…</h2><p${anim('wn', 'rise', 1400, 400)}>…and was turned down. Drink to forget.</p></div>`;
        return `<div class="ck-card ck-centre parch wed"${anim('w', 'pop', 0, 500)}><div class="ck-big"${anim('wb', 'ck-slam', 500, 500)}>💍</div><h2>${chip(s.a)} &amp; ${chip(s.b)}</h2><p${anim('wn', 'rise', 1100, 400)}>${s.mutual ? 'Love at first sight: they proposed to each other!' : 'Said yes!'} Shipmates for life: from now on they drink together. Wedding presents all round.</p></div>`;
      }
      case 'card':
        return `<div class="ck-card ck-centre ck-fate"${anim('cd', 'ck-flip', 0, 700)}><div class="ck-big">${s.icon}</div><h2>${esc(s.name)}</h2><p>${chip(s.by)}${s.target ? ` ➜ ${chip(s.target)}` : ''}</p>${s.text ? `<p class="ck-fate-text"${anim('cdt', 'rise', 700, 400)}>${esc(s.text)}</p>` : ''}</div>`;
      case 'duel': {
        if (s.parley) return `<div class="ck-card ck-centre parch"${anim('dp', 'pop', 0, 500)}><div class="ck-big">🏳️</div><h2>${chip(s.a)} tries to raid ${chip(s.b)}</h2><p>…who waves a white flag. Parley! No fight today.</p></div>`;
        const side = (k) => {
          const id = s[k];
          const roll = s.rolls?.[id];
          const total = s.totals?.[k];
          const won = s.result === k;
          const lost = s.result && s.result !== k && s.result !== 'draw';
          const backers = Object.entries(s.bets ?? {}).filter(([, side]) => side === k).map(([b]) => chip(b, { label: false })).join('');
          return `<div class="ck-duelist ${won ? 'won' : ''} ${lost ? 'lost' : ''}">
            ${chip(id)}<small>${k === 'a' ? 'raider' : 'defender'}${s.bonus?.[k] ? ` · +${s.bonus[k]}` : ''}${k === 'b' && s.bounty ? ' · <b class="ck-bounty">BOUNTY</b>' : ''}</small>
            <span class="ck-roll"${roll ? anim(`r${k}${roll}`, 'ck-slam', 0, 450) : ''}>${roll ?? '🎡'}</span>
            ${total !== undefined ? `<span class="ck-total">= ${total}</span>` : ''}
            <div class="ck-backers">${backers}</div>
          </div>`;
        };
        const verdict = !s.result
          ? '<p class="ck-sub">Both spin on their phones. Everyone else: place your bets!</p>'
          : s.result === 'draw'
            ? `<p class="ck-verdict"${anim('vd', 'ck-slam', 300, 500)}>A bloody draw! Both drink.</p>`
            : `<p class="ck-verdict"${anim('vd', 'ck-slam', 300, 500)}>${chip(s.result === 'a' ? s.a : s.b)} ${s.result === 'a' ? `plunders ${fmt(s.take ?? 0)}!` : `fights them off and takes ${fmt(s.take ?? 0)}!`}</p>`;
        return `<div class="ck-card ck-duel parch"${anim('duel', 'pop', 0, 450)}><div class="ck-duel-row">${side('a')}<span class="ck-vs">⚔️</span>${side('b')}</div>${verdict}</div>`;
      }
      case 'tale': {
        const votes = Object.values(s.votes ?? {});
        const legend = votes.filter((x) => x === 'legend').length;
        let foot = '';
        if (s.truth) {
          foot = s.stage === 'choose' ? '<p class="ck-sub">Answer honestly… or drink.</p>' : s.stage === 'answer' ? '<p class="ck-sub">🗣️ They’re answering. Listen!</p>' : s.stage === 'answered' ? `<p class="ck-verdict"${anim('tv', 'ck-slam', 0, 500)}>The truth! ${signed(s.gain ?? 0)}</p>` : `<p class="ck-verdict"${anim('tv', 'ck-slam', 0, 500)}>🍺 Chose the rum!</p>`;
        } else if (s.stage === 'tell') foot = '<p class="ck-sub">🗣️ Tell it out loud! The crew votes Legend or Bilge after.</p>';
        else if (s.stage === 'vote') foot = `<p class="ck-sub">Vote on your phones: 🏆 Legend or 🪣 Bilge <span class="tally">${votes.length} in</span></p>`;
        else foot = `<p class="ck-verdict"${anim('tv', 'ck-slam', 0, 500)}>${(s.legend ?? 0) > (s.bilge ?? 0) || ((s.legend ?? 0) === (s.bilge ?? 0) && s.legend) ? `🏆 LEGEND! ${signed(s.gain ?? 0)}` : '🪣 BILGE! Drink up.'} <small>${s.legend ?? legend} v ${s.bilge ?? votes.length - legend}</small></p>`;
        return `<div class="ck-card ck-tale-card parch"${anim('tale', 'pop', 0, 500)}><p class="ck-kick">${chip(s.by)} ${s.truth ? 'must tell the truth' : 'tells a tale'}</p><p class="ck-prompt">${esc(s.prompt)}</p>${foot}</div>`;
      }
      case 'give':
        return `<div class="ck-card ck-list parch"${anim('give', 'pop', 0, 450)}>${(s.gifts ?? []).map((g, i) => `<p${anim(`g${i}`, 'from-left', 200 + i * 300, 400)}>${chip(g.by)} <span>hands out</span> ${[...new Set(g.to)].map((id) => `${chip(id, { label: false })}<b>×${g.to.filter((x) => x === id).length}</b>`).join(' ')}</p>`).join('')}</div>`;
      case 'haunt':
        return `<div class="ck-card ck-list parch ghostly"${anim('h', 'pop', 0, 450)}>${(s.haunts ?? []).map((h, i) => `<p${anim(`h${i}`, 'from-left', 200 + i * 300, 400)}>👻 ${chip(h.by)} <span>haunts</span> ${chip(h.to)}</p>`).join('')}</div>`;
      case 'wakes':
        return `<div class="ck-stamp"${anim('wake', 'ck-slam', 200, 600)}>THE KRAKEN WAKES</div><p class="ck-sub ck-under">${(s.late ?? []).map((id) => chip(id)).join(' ')} still at sea: dragged to retirement, no bonus.</p>`;
      case 'job': {
        const band = s.band ? `<p class="ck-verdict ${s.times < 1 ? 'bad' : ''}"${anim(`jb${s.band}`, 'ck-slam', 0, 500)}>${esc(s.band)}${s.gain !== undefined ? ` ${signed(s.gain)}` : ` ×${s.times}`}</p>` : '<p class="ck-sub">Spinning…</p>';
        return `<div class="ck-card ck-centre parch"${anim(`job${s.by}`, 'pop', 0, 450)}><p class="ck-kick">${chip(s.by)} risks ${fmt(s.cash)} on</p><h2>One Last Job</h2><span class="ck-roll big"${s.roll ? anim(`jr${s.roll}`, 'ck-slam', 0, 450) : ''}>${s.roll ?? '🎡'}</span>${band}<p class="ck-odds">1–3 caught · 4–6 ×1.25 · 7–9 ×1.6 · 10 ×2</p></div>`;
      }
      case 'tally': {
        const rows = (s.rows ?? []).map((r, i) => {
          const d = 600 + (s.rows.length - 1 - i) * 1100;
          return `<tr${anim(`t${r.id}`, 'from-left', d, 450)}><td>${i + 1}</td><td>${chip(r.id)}</td><td>${money(r.start)}</td><td>${SHIP_ICON[r.ship]} +${fmt(r.sale)}</td><td>${r.crewCount ? `🧑‍🤝‍🧑 +${fmt(r.crew)}` : '–'}</td><td>${r.mapCount ? `🗺️ +${fmt(r.maps)}` : '–'}</td><td class="neg">${r.debt ? `🦈 −${fmt(r.debt)}` : '–'}</td><td class="ck-tot">${money(r.total)}</td></tr>`;
        });
        return `<div class="ck-card ck-tally parch"${anim('tally', 'pop', 0, 450)}><h2>The reckoning</h2><table><thead><tr><th></th><th></th><th>Doubloons</th><th>Ship sold</th><th>Crew paid</th><th>Maps</th><th>IOUs</th><th>Worth</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
      }
      case 'titles':
        return `<div class="ck-grid">${(s.titles ?? []).map((t, i) => `<div class="ck-mini parch title"${anim(`ti${i}`, 'pop', 300 + i * 900, 500)}><span class="ck-big">${t.icon}</span><b>${esc(t.name)}</b><small>${esc(t.what)}: ${esc(String(t.value))}</small><span>${t.ids.map((id) => chip(id)).join(' ')}</span></div>`).join('')}</div>`;
      case 'sail':
        return '';
      default:
        return '';
    }
  }

  function ck(v) {
    const showLedger = !['tally', 'titles'].includes(v.phase);
    return `<div class="ck" data-phase="${esc(v.phase)}">
      ${head(v)}
      ${showLedger ? ledger(v) : ''}
      <div class="ck-body">${body(v)}</div>
      ${pours(v)}
    </div>`;
  }

  return { ck };
}
