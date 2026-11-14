// Parley on the big screen: the crew round a bonfire on a moonlit beach.
//
// Every pirate is a carved wooden figure in their own colour, standing in a
// horseshoe behind the fire. While they vote, somebody now and then gets up to
// something (a marshmallow, a cutlass, a guitar...). When the votes are counted,
// doubloons drop out of the night sky and stack up in front of whoever got them;
// then the camera goes in close on the crew's pick (split screen for a tie) and
// a tricorn drops onto their head. Behind them the sea rolls in under the moon.
//
// host.js draws the words (the question, who saw it coming); this file owns
// the beach and everything on it, using the kit in kit3d.js.

import { THREE, createStage, shapes, paint, part, figure, decal, palm, rand, easeOut, easeIn, backOut, linear, chipHtml } from './kit3d.js';
import { esc, fmt } from './common.js';
import * as sound from './sound.js';
import { createAmbience } from './ambience.js';
import './parley-sound.js';

const ARC = { a: 10.2, b: 5.8, spread: 1.85 }; // the horseshoe of figures round the fire (spread: radians either side of straight back)
const COIN = 0.085; // the thickness of one doubloon
const LABEL_Y = 4.9; // how high the name plates float, above the hats

let stage = null;
let players = new Map();
let fire = null;
let sea = null;
let foam = null;
let embers = [];
let seats = new Map(); // id -> { id, pos, fig, label, coins: [], count, hat, sig }
let seatsKey = '';
let countKey = null;
let playing = false;
let view = null;
const cam = { target: new THREE.Vector3(0, 0.6, -0.8), dist: 34, elevation: 0.36 };

// Round the fire at night: the fire itself, the surf, the crickets, an owl in the palms.
const room = createAmbience([
  { name: 'paCrackle', every: [0.25, 1.1], level: 0.5, soon: true },
  { name: 'paSurf', every: [6.5, 9.5], level: 0.65, soon: true },
  { name: 'paCrickets', every: [2.5, 6], level: 0.4 },
  { name: 'paOwl', every: [24, 50], level: 0.4 },
  { name: 'paPalms', every: [12, 26], level: 0.45 },
  { name: 'distantBell', every: [45, 90], level: 0.3 },
]);

/** A spot on the horseshoe: k = 1 is where the figures stand. */
function onArc(angle, k = 1, y = 0) {
  return new THREE.Vector3(Math.sin(angle) * ARC.a * k, y, -Math.cos(angle) * ARC.b * k);
}

// ---------------------------------------------------------------------------
// Building the beach
// ---------------------------------------------------------------------------

function buildSand(scene) {
  const sand = decal((c, s) => {
    c.fillStyle = '#b89462';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,240,200' : '90,60,30'},${rand(0.04, 0.14)})`;
      c.fillRect(rand(0, s), rand(0, s), rand(1, 3), rand(1, 3));
    }
    // Ripples left by the wind.
    for (let i = 0; i < 40; i++) {
      c.strokeStyle = `rgba(120,85,45,${rand(0.05, 0.12)})`;
      c.lineWidth = rand(2, 5);
      const y = rand(0, s);
      c.beginPath();
      c.moveTo(0, y);
      c.bezierCurveTo(s * 0.3, y + rand(-20, 20), s * 0.6, y + rand(-20, 20), s, y + rand(-10, 10));
      c.stroke();
    }
  }, 512);
  sand.wrapS = sand.wrapT = THREE.RepeatWrapping;
  sand.repeat.set(10, 6);
  const beach = part(shapes().flat, new THREE.MeshStandardMaterial({ map: sand, roughness: 1 }), { at: [0, 0, 6], size: [160, 1, 60], into: scene });
  beach.castShadow = false;
  // Wet sand where the waves reach, darker and shinier.
  const wet = part(shapes().flat, new THREE.MeshStandardMaterial({ color: 0x6f5636, roughness: 0.35, metalness: 0.1 }), { at: [0, 0.005, -21], size: [160, 1, 8], into: scene });
  wet.castShadow = false;
}

function buildSea(scene) {
  const geo = new THREE.PlaneGeometry(220, 90, 110, 36).rotateX(-Math.PI / 2);
  geo.translate(0, -0.25, -68);
  const base = Float32Array.from(geo.attributes.position.array);
  const mat = new THREE.MeshStandardMaterial({ color: 0x0f2c48, roughness: 0.28, metalness: 0.25, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  scene.add(mesh);
  // The line of foam where each wave breaks; it rushes up the sand and slides back.
  foam = part(shapes().flat, new THREE.MeshBasicMaterial({ color: 0xdfeff0, transparent: true, opacity: 0.55, depthWrite: false }), { at: [0, 0.03, -23], size: [160, 1, 1.2], shadow: false, into: scene });
  return { mesh, geo, base };
}

function waves(clock) {
  const pos = sea.geo.attributes.position;
  const a = pos.array;
  for (let i = 0; i < a.length; i += 3) {
    const x = sea.base[i];
    const z = sea.base[i + 2];
    a[i + 1] = sea.base[i + 1] + Math.sin(x * 0.18 + clock * 0.9) * 0.35 + Math.cos(z * 0.23 - clock * 1.3) * 0.3 + Math.sin((x + z) * 0.41 + clock * 1.7) * 0.12;
  }
  pos.needsUpdate = true;
  sea.geo.computeVertexNormals();
  // Each wave runs up the beach every eight seconds or so.
  const surf = (Math.sin(clock * 0.78) + 1) / 2;
  foam.position.z = -24 + surf * 3.4;
  foam.material.opacity = 0.2 + 0.45 * (1 - surf) * surf * 4 * 0.25 + 0.25 * surf;
}

function buildSky(scene) {
  // The moon, low over the sea, and a path of light under it.
  part(shapes().smooth, new THREE.MeshBasicMaterial({ color: 0xfff6d8 }), { at: [-34, 30, -150], size: 7, shadow: false, into: scene });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: decal((c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,246,216,0.55)');
    g.addColorStop(0.3, 'rgba(255,246,216,0.15)');
    g.addColorStop(1, 'rgba(255,246,216,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  }), transparent: true, depthWrite: false }));
  halo.position.set(-34, 30, -151);
  halo.scale.set(70, 70, 1);
  scene.add(halo);
  // Stars on a dome.
  const n = 900;
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const az = rand(-Math.PI * 0.9, Math.PI * 0.9);
    const el = rand(0.05, 1.2);
    p.set([Math.sin(az) * Math.cos(el) * 190, 4 + Math.sin(el) * 150, -Math.cos(az) * Math.cos(el) * 190], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfdf8e8, size: 0.7, sizeAttenuation: true, transparent: true, opacity: 0.85 })));
}

function buildFire(scene) {
  const S = shapes();
  const g = new THREE.Group();
  // A ring of stones.
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2;
    const stone = part(S.ball, paint(i % 2 ? 0x6b6660 : 0x575350, { rough: 0.95 }), { at: [Math.cos(a) * 1.75, 0.18, Math.sin(a) * 1.75], size: [rand(0.35, 0.5), rand(0.25, 0.38), rand(0.35, 0.5)], turn: [0, rand(0, 3), 0], into: g });
    stone.castShadow = false;
  }
  // Driftwood logs leaned into a cone.
  const wood = paint(0x4a3220, { rough: 0.9 });
  const char = paint(0x1d1410, { rough: 1 });
  // Driftwood stacked into a low cone: each log's foot rests by the stones, its tip leans in over the middle.
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const lean = 0.5; // radians above the sand: a shallow stack, not a spiky one
    const dir = new THREE.Vector3(-Math.cos(a) * Math.cos(lean), Math.sin(lean), -Math.sin(a) * Math.cos(lean));
    const log = part(S.disc, i % 2 ? wood : char, { size: [0.16, 1.9, 0.16], shadow: false, into: g });
    log.quaternion.setFromUnitVectors(up, dir);
    log.position.set(Math.cos(a) * 1.3, 0.14, Math.sin(a) * 1.3).addScaledVector(dir, 0.95);
  }
  part(S.round, paint(0xff7a1a, { glow: 1.2, rough: 1 }), { at: [0, 0.06, 0], size: [1.15, 0.1, 1.15], shadow: false, into: g }); // the embers in the bed
  // The flames: a few glowing cones that dance.
  const flames = [
    { colour: 0xff5a14, at: [0, 1.1, 0], size: [0.9, 2.6, 0.9] },
    { colour: 0xff9a1f, at: [0.25, 1.0, 0.15], size: [0.6, 2.0, 0.6] },
    { colour: 0xffcf4a, at: [-0.2, 0.85, -0.1], size: [0.45, 1.6, 0.45] },
    { colour: 0xff7a1a, at: [-0.35, 0.8, 0.3], size: [0.5, 1.5, 0.5] },
    { colour: 0xffe28a, at: [0.05, 0.7, 0], size: [0.3, 1.1, 0.3] },
  ].map((f, i) => ({ ...f, mesh: part(S.cone, paint(f.colour, { glow: 2.4 }), { at: f.at, size: f.size, shadow: false, into: g }), phase: i * 1.7 }));
  const light = new THREE.PointLight(0xff8a3a, 120, 34, 1.6);
  light.position.set(0, 2.4, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.002;
  g.add(light);
  scene.add(g);

  // Sparks drifting up out of the fire.
  const spark = paint(0xffb54a, { glow: 3 });
  embers = Array.from({ length: 34 }, () => {
    const m = part(S.ball, spark, { size: 0.05, shadow: false, into: scene });
    const e = { m, t: rand(0, 3), life: rand(2, 3.5), x: rand(-0.6, 0.6), z: rand(-0.6, 0.6), drift: rand(-0.5, 0.5) };
    return e;
  });
  return { group: g, flames, light, boost: 1 };
}

function rowingBoat(scene, x, z, turn) {
  const S = shapes();
  const g = new THREE.Group();
  const hull = paint(0x6b4426, { rough: 0.8 });
  const trim = paint(0x2f5d72, { rough: 0.7 });
  part(S.box, hull, { at: [0, 0.35, 0], size: [5, 0.7, 1.9], into: g });
  part(S.box, trim, { at: [0, 0.75, 0.95], size: [5, 0.16, 0.12], into: g });
  part(S.box, trim, { at: [0, 0.75, -0.95], size: [5, 0.16, 0.12], into: g });
  part(new THREE.ConeGeometry(0.96, 1.6, 4), hull, { at: [3.2, 0.36, 0], size: [1, 1, 0.98], turn: [Math.PI / 4, 0, -Math.PI / 2], into: g });
  for (const sx of [-1.2, 0.8]) part(S.box, paint(0x8a6440, { rough: 0.8 }), { at: [sx, 0.72, 0], size: [0.4, 0.08, 1.8], into: g });
  part(S.disc, paint(0xa47a4c, { rough: 0.8 }), { at: [0.4, 0.9, 0.3], size: [0.06, 4.6, 0.06], turn: [0.1, 0, Math.PI / 2 - 0.1], into: g }); // an oar
  g.position.set(x, 0, z);
  g.rotation.set(0, turn, 0.12);
  scene.add(g);
}

function props(scene) {
  const S = shapes();
  // A rum barrel and a couple of bottles, and a sea chest, round the edge of the firelight.
  const barrel = new THREE.Group();
  part(new THREE.CylinderGeometry(0.85, 0.85, 1.9, 12), paint(0x7a4c26, { rough: 0.8 }), { at: [0, 0.95, 0], into: barrel });
  for (const y of [0.3, 1.6]) part(new THREE.CylinderGeometry(0.88, 0.88, 0.14, 12), paint(0x2b2d33, { rough: 0.4 }), { at: [0, y, 0], into: barrel });
  barrel.position.set(-12.5, 0, 3.5);
  scene.add(barrel);
  const glass = paint(0x2f6b3a, { rough: 0.2 });
  part(new THREE.CylinderGeometry(0.2, 0.25, 0.9, 8), glass, { at: [-11, 0.45, 4.6], into: scene });
  part(new THREE.CylinderGeometry(0.2, 0.25, 0.9, 8), glass, { at: [11.6, 0.22, 4.8], turn: [0, 0.4, Math.PI / 2], into: scene });
  const chest = new THREE.Group();
  part(S.box, paint(0x5a3519, { rough: 0.7 }), { at: [0, 0.55, 0], size: [2.2, 1.1, 1.4], into: chest });
  part(new THREE.CylinderGeometry(0.7, 0.7, 2.2, 12, 1, false, 0, Math.PI), paint(0x6b4426, { rough: 0.7 }), { at: [0, 1.1, 0], turn: [0, 0, Math.PI / 2], size: [1, 1, 1], into: chest });
  for (const x of [-0.8, 0.8]) part(S.box, paint(0xd9a441, { rough: 0.35, metal: 0.4 }), { at: [x, 1.0, 0], size: [0.14, 1.3, 1.46], into: chest });
  chest.position.set(12.6, 0, 2.6);
  chest.rotation.y = -0.5;
  scene.add(chest);
  for (let i = 0; i < 6; i++) part(S.disc, paint(0xf2c230, { rough: 0.3 }), { at: [11.5 + rand(-1, 1), 0.04, 3.6 + rand(-0.8, 0.8)], size: [0.28, COIN, 0.28], turn: [rand(-0.1, 0.1), rand(0, 3), 0], into: scene });
  rowingBoat(scene, -15, -13, 0.5);
  palm(scene, -19, -6, 0.32, 10, 0);
  palm(scene, -24, 1, 0.22, 8, 2);
  palm(scene, 19, -8, -0.3, 11, 3.1);
  palm(scene, 25, 0, -0.2, 8.5, 1);
}

/** A tricorn hat: a black crown with the brim turned up on three sides, and gold braid. */
function tricorn() {
  const g = new THREE.Group();
  const felt = paint(0x6a3f22, { rough: 0.6 }); // brown leather: black felt vanished against the night
  const braid = paint(0xf2c230, { rough: 0.3, metal: 0.4 });
  part(new THREE.CylinderGeometry(0.42, 0.5, 0.45, 16), felt, { at: [0, 0.22, 0], into: g });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const side = new THREE.Group();
    side.rotation.y = a;
    part(S().box, felt, { at: [0, 0.16, 0.6], size: [1.25, 0.36, 0.08], turn: [-0.3, 0, 0], into: side });
    part(S().box, braid, { at: [0, 0.34, 0.66], size: [1.27, 0.09, 0.12], turn: [-0.3, 0, 0], into: side });
    g.add(side);
  }
  part(S().smooth, braid, { at: [0, 0.48, 0.02], size: 0.08, into: g });
  // A big red plume, so the winner stands out from the back of the room.
  const plume = paint(0xd63a2f, { rough: 0.8 });
  for (let i = 0; i < 6; i++) part(S().ball, plume, { at: [-0.25 - i * 0.1, 0.55 + i * 0.16 - i * i * 0.02, -0.15], size: [0.1, 0.26, 0.1], turn: [0, 0, 0.6 + i * 0.12], into: g });
  g.scale.setScalar(1.45);
  return g;
}
const S = () => shapes();

function init() {
  stage = createStage({
    id: 'paLayer',
    background: 0x081324,
    exposure: 1.15,
    fov: 30,
    overlay: '<div class="pa-vignette"></div><div class="pa-dividers"></div><div class="pa-flash"></div>',
    // Lighting styles (see looks3d.js). The knee is high because the fire is bright
    // (and roars to over twice that when a coin lands), so the crew's faces still
    // sit between bands in a close-up. House style: rings of firelight that
    // stipple at their edges, with the moonlit sand and sea dithered too.
    looks: {
      knee: 4,
      house: { light: { pattern: 'bayer', bands: 6, cell: 2, spread: 0.45, amount: 0.75 }, fog: { bands: 5 } },
    },
  });
  const { scene } = stage;
  scene.fog = new THREE.Fog(0x081324, 70, 210);
  scene.add(new THREE.HemisphereLight(0x5a7cb8, 0x2a1c10, 0.55));
  const moon = new THREE.DirectionalLight(0xa8c0ff, 1.0);
  moon.position.set(-20, 30, -40);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -30, right: 30, top: 20, bottom: -20, near: 1, far: 120 });
  moon.shadow.bias = -0.0008;
  scene.add(moon);

  buildSand(scene);
  sea = buildSea(scene);
  buildSky(scene);
  fire = buildFire(scene);
  props(scene);
  stage.onFrame = frame;
  stage.onFit = fit;
  // Try one from the big screen's console while Parley is on: antic('guitar'), antic('musket')...
  window.antic = (kind) => {
    if (!ANTICS[kind]) return Object.keys(ANTICS);
    stopAntic();
    startAntic(kind);
  };
}

// ---------------------------------------------------------------------------
// The crew
// ---------------------------------------------------------------------------

function seatCrew(ids) {
  const sig = ids.join(',');
  if (sig === seatsKey) return;
  stopAntic();
  for (const seat of seats.values()) {
    stage.scene.remove(seat.fig);
    for (const c of seat.coins) stage.scene.remove(c);
    if (seat.hat) stage.scene.remove(seat.hat);
    seat.label.remove();
  }
  seats = new Map();
  seatsKey = sig;
  const n = ids.length;
  ids.forEach((id, i) => {
    const angle = n === 1 ? 0 : -ARC.spread + (2 * ARC.spread * i) / (n - 1);
    const pos = onArc(angle);
    const fig = figure(players.get(id)?.color ?? '#888');
    fig.position.copy(pos);
    fig.rotation.y = Math.atan2(-pos.x, -pos.z); // face the fire
    stage.scene.add(fig);
    const label = stage.label('pa-label');
    seats.set(id, { id, angle, pos, fig, label, coins: [], count: 0, hat: null, sig: '', stack: onArc(angle, 0.74), yaw: fig.rotation.y });
  });
  fit();
}

const countTweens = new Set();
/** A tween that belongs to the count (cancelled if the count is cut short). */
function ct(dur, fn, opts) {
  const tw = stage.tween(dur, fn, opts);
  countTweens.add(tw);
  return tw;
}

/** Do something once, part-way through the count. */
const later = (delay, fn) => ct(0.001, (k, raw) => raw >= 1 && fn(), { delay });

function clearCount() {
  for (const tw of countTweens) stage.cancel(tw);
  countTweens.clear();
  for (const seat of seats.values()) {
    for (const c of seat.coins) stage.scene.remove(c);
    seat.coins = [];
    seat.count = 0;
    if (seat.hat) stage.scene.remove(seat.hat);
    if (seat.ring) stage.scene.remove(seat.ring);
    seat.hat = null;
    seat.ring = null;
    seat.fig.position.y = 0;
  }
}

/** Drop one doubloon out of the sky onto a pirate's stack. */
function dropCoin(seat, delay) {
  const coin = part(shapes().disc, paint(0xf2c230, { rough: 0.28, metal: 0.35 }), { size: [0.34, COIN, 0.34], into: stage.scene });
  coin.visible = false;
  const n = seat.coins.length;
  seat.coins.push(coin);
  const rest = new THREE.Vector3(seat.stack.x + rand(-0.04, 0.04), COIN / 2 + n * COIN, seat.stack.z + rand(-0.04, 0.04));
  const spin = rand(6, 10);
  ct(0.5, (k) => {
    coin.visible = true;
    coin.position.set(rest.x, rest.y + (1 - k) * 9, rest.z);
    coin.rotation.set(spin * (1 - k), rand(0, 0.2), spin * 0.7 * (1 - k));
  }, {
    delay,
    ease: easeIn,
    done: () => {
      coin.rotation.set(0, rand(0, 3), 0);
      seat.count++;
      sound.play('paCoin', { level: 0.8 });
      fire.boost = 1.25;
    },
  });
}

/** The crew's pick: a hat drops onto their head and they hop for joy. */
function crown(seat, delay) {
  const hat = tricorn();
  hat.visible = false;
  stage.scene.add(hat);
  seat.hat = hat;
  const head = seat.pos.clone().setY(2.55); // the crown sits down over the top of the head
  const ring = part(shapes().halo, new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0, depthWrite: false }), { at: [seat.pos.x, 0.03, seat.pos.z], size: 1.1, shadow: false, into: stage.scene });
  seat.ring = ring;
  ct(0.8, (k) => (ring.material.opacity = 0.85 * k), { delay: delay + 0.6 });
  ct(0.7, (k) => {
    hat.visible = true;
    hat.position.set(head.x, head.y + (1 - k) * 7, head.z);
    hat.rotation.set(0, seat.fig.rotation.y + (1 - k) * 5, 0);
  }, { delay, ease: easeIn, done: () => sound.play('paHat') });
  ct(0.5, (k, raw) => {
    const hop = Math.sin(raw * Math.PI) * 0.9;
    seat.fig.position.y = hop;
    hat.position.y = head.y + hop;
  }, { delay: delay + 0.75, ease: linear });
  ct(0.5, (k, raw) => {
    const hop = Math.sin(raw * Math.PI) * 0.5;
    seat.fig.position.y = hop;
    hat.position.y = head.y + hop;
  }, { delay: delay + 1.3, ease: linear });
}

function count(v) {
  clearCount();
  v.coins.forEach((id, i) => {
    const seat = seats.get(id);
    if (seat) dropCoin(seat, 1.4 + i * 0.42 - 0.5);
  });
  // Once the last coin is down, the camera goes in close on the crew's pick (side by side if it's a tie),
  // and the hat drops on their head while we're looking.
  const close = closeable(v.winners);
  for (const id of v.winners) {
    const seat = seats.get(id);
    if (seat) crown(seat, v.landed + (close ? 1.3 : 0.4));
  }
  later(v.landed + 0.3, () => {
    fire.boost = 2.2;
    sound.play(v.winners.length ? 'paCheer' : 'paCrickets');
    if (close) closeUp(v.winners);
  });
  // The Black Spot pulls back out after a moment, so everyone's guesses can be seen round the fire.
  if (close && v.spot) later(v.landed + 5.2, wideShot);
}

// ---------------------------------------------------------------------------
// The camera: one wide shot of the whole beach, or medium close-ups of the crew's pick
// ---------------------------------------------------------------------------

const shot = { mode: 'wide', pos: new THREE.Vector3(), look: new THREE.Vector3(), target: null, panels: [], snapped: false };
const wideAt = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
const CLOSE = { dist: 14, lookY: 1.2, camY: 4.4 }; // a medium close-up: the whole figure, hat and all, with room for the words

/** Up to four pirates can share the screen; a bigger tie stays on the wide shot. */
const closeable = (ids) => ids.length >= 1 && ids.length <= 4 && ids.every((id) => seats.has(id));

/** Where to stand for a close-up of one pirate: in front of them, between the fire and the usual camera. */
function closeFrame(seat, dist = CLOSE.dist) {
  const toFire = new THREE.Vector3(-seat.pos.x, 0, -seat.pos.z).normalize();
  const toCam = new THREE.Vector3(wideAt.pos.x - seat.pos.x, 0, wideAt.pos.z - seat.pos.z).normalize();
  const dir = toFire.multiplyScalar(0.5).add(toCam.multiplyScalar(0.5)).normalize();
  const look = seat.pos.clone().setY(CLOSE.lookY);
  const pos = look.clone().addScaledVector(dir, dist);
  pos.y = CLOSE.camY + (dist - CLOSE.dist) * 0.25;
  return { pos, look };
}

function closeUp(ids) {
  stopAntic();
  const list = ids.map((id) => seats.get(id));
  if (list.length === 1) {
    shot.mode = 'close';
    shot.target = closeFrame(list[0]);
  } else {
    // Split screen: one panel per pirate, each pushing in on them. It's a cut, so flash to cover it.
    shot.mode = 'split';
    const n = list.length;
    shot.panels = list.map((seat, i) => ({ seat, camera: new THREE.PerspectiveCamera(30, 1, 0.5, 400), x: i / n, y: 0, w: 1 / n, h: 1, from: closeFrame(seat, CLOSE.dist + 6), to: closeFrame(seat), t: 0 }));
    stage.views = shot.panels;
    sizePanels();
    const flashEl = stage.layer.querySelector('.pa-flash');
    flashEl.classList.remove('go');
    void flashEl.offsetWidth;
    flashEl.classList.add('go');
  }
  stage.layer.querySelector('.pa-dividers').innerHTML = shot.panels.slice(1).map((p) => `<i style="left:${(p.x * 100).toFixed(3)}%"></i>`).join('');
  stage.labelsEl.classList.add('closed');
}

function wideShot() {
  shot.mode = 'wide';
  shot.target = null;
  shot.panels = [];
  stage.views = null;
  stage.layer.querySelector('.pa-dividers').innerHTML = '';
  stage.labelsEl.classList.remove('closed');
}

function sizePanels() {
  for (const p of shot.panels) {
    p.camera.aspect = (p.w * window.innerWidth) / (p.h * window.innerHeight);
    p.camera.updateProjectionMatrix();
  }
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
  stage.camera.updateMatrixWorld();
  for (const p of shot.panels) {
    p.t = Math.min(1, p.t + dt / 1.8);
    p.camera.position.lerpVectors(p.from.pos, p.to.pos, easeOut(p.t));
    p.camera.position.x += Math.sin(clock * 0.4 + p.x * 9) * 0.08;
    p.camera.lookAt(p.to.look);
  }
}

// ---------------------------------------------------------------------------
// Antics: every so often, somebody round the fire gets up to something
// ---------------------------------------------------------------------------

const pick = (list) => list[Math.floor(Math.random() * list.length)];
let antic = null; // { kind, seat, end, tweens, props, touched, onEnd }
let nextAntic = 7;
let recentAntics = [];

const metal = () => paint(0xd8dde3, { rough: 0.2, metal: 0.8 });
const gold = () => paint(0xf2c230, { rough: 0.3, metal: 0.4 });

/** A tween that belongs to the current antic (cancelled if it's cut short). */
function at(delay, dur, fn, ease = linear) {
  const tw = stage.tween(dur, fn, { delay, ease });
  antic.tweens.add(tw);
  return tw;
}
const cue = (delay, fn) => at(delay, 0.001, (k, raw) => raw >= 1 && fn());

/** Bring a prop out: it pops into the figure's grasp. */
const PROP = 1.35; // props are a touch oversized, so they read from the back of the room
function hold(seat, obj) {
  obj.scale.setScalar(0.001);
  seat.fig.add(obj);
  antic.props.push(obj);
  at(0, 0.35, (k) => obj.scale.setScalar(Math.max(0.001, k * PROP)), backOut);
  sound.play('paPop', { level: 0.6 });
}
function putAway(obj, delay) {
  at(delay, 0.3, (k) => obj.scale.setScalar(Math.max(0.001, (1 - k) * PROP)), easeIn);
}

/** A puff of gunsmoke (or steam) that swells, rises and fades. */
function puff(where, { colour = 0xcfcac2, size = 0.35, rise = 1.2, life = 1.4 } = {}) {
  const m = part(shapes().ball, new THREE.MeshStandardMaterial({ color: colour, roughness: 1, flatShading: true, transparent: true, opacity: 0.85 }), { at: where.toArray(), size: 0.01, shadow: false, into: stage.scene });
  antic?.props.push(m);
  const drift = new THREE.Vector3(rand(-0.4, 0.4), rise, rand(-0.4, 0.4));
  const start = where.clone();
  stage.tween(life, (k, raw) => {
    m.position.copy(start).addScaledVector(drift, k);
    m.scale.setScalar(size * (0.4 + raw * 1.2));
    m.material.opacity = 0.85 * (1 - raw);
  }, { ease: easeOut, done: () => m.parent?.remove(m) });
}

function lerpColour(stops, t) {
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const k = (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      return new THREE.Color(stops[i - 1][1]).lerp(new THREE.Color(stops[i][1]), k);
    }
  }
  return new THREE.Color(stops[stops.length - 1][1]);
}

let noteTexture = null;
function note(where) {
  noteTexture ??= decal((c, s) => {
    c.fillStyle = '#ffd36a';
    c.font = `${s * 0.8}px serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(255,170,60,0.9)';
    c.shadowBlur = s * 0.12;
    c.fillText(Math.random() < 0.5 ? '♪' : '♫', s / 2, s / 2);
  }, 128);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTexture, transparent: true, depthWrite: false }));
  sprite.position.copy(where);
  sprite.scale.setScalar(0.6);
  stage.scene.add(sprite);
  antic.props.push(sprite);
  const sway = rand(0, 6);
  at(0, 2.2, (k, raw) => {
    sprite.position.set(where.x + Math.sin(raw * 5 + sway) * 0.3, where.y + raw * 2.4, where.z);
    sprite.material.opacity = raw < 0.2 ? raw * 5 : 1 - (raw - 0.2) / 0.8;
  });
}

const ANTICS = {
  /** A marshmallow on a stick, turned slowly until it toasts, catches light, and is blown out. */
  marshmallow(seat, a) {
    const S = shapes();
    const g = new THREE.Group();
    g.position.set(0.45, 1.35, 0.35);
    g.rotation.x = -0.35;
    part(S.disc, paint(0x8a6440, { rough: 0.8 }), { at: [0, 0, 1.25], size: [0.03, 2.5, 0.03], turn: [Math.PI / 2, 0, 0], into: g });
    const tip = new THREE.Group();
    tip.position.set(0, 0, 2.5);
    g.add(tip);
    const mallow = new THREE.MeshStandardMaterial({ color: 0xfaf6ee, roughness: 0.9, flatShading: true });
    part(S.round, mallow, { size: [0.16, 0.3, 0.16], turn: [Math.PI / 2, 0, 0], into: tip });
    const blaze = part(S.cone, paint(0xff8a1f, { glow: 2.4 }), { at: [0, 0.28, 2.5], size: [0.15, 0.45, 0.15], shadow: false, into: g });
    blaze.visible = false;
    hold(seat, g);
    const shades = [[0, 0xfaf6ee], [0.4, 0xf3cf86], [0.6, 0xc07a35], [0.8, 0x3a2414], [1, 0x1a120c]];
    let lit = false;
    at(0.4, 9, (k, raw) => {
      tip.rotation.z = raw * 28;
      mallow.color.copy(lerpColour(shades, raw));
      if (raw > 0.6 && !lit) {
        lit = true;
        blaze.visible = true;
        sound.play('paSizzle');
      }
      if (blaze.visible) blaze.scale.set(0.15, 0.45 * (0.8 + 0.25 * Math.sin(raw * 90)), 0.15);
      if (raw > 0.85 && blaze.visible) {
        blaze.visible = false; // phoo
        puff(tip.getWorldPosition(new THREE.Vector3()), { colour: 0x555555, size: 0.25, rise: 1 });
      }
    });
    putAway(g, 9.7);
    a.end = stage.clock + 10.3;
  },

  /** A captain's hat, skull and crossbones on the front, tried on for size. */
  hat(seat, a) {
    const S = shapes();
    const hat = new THREE.Group();
    const felt = paint(0x16141a, { rough: 0.6 });
    const bone = paint(0xf3eee0, { rough: 0.7 });
    part(S.smooth, felt, { size: [0.95, 0.42, 0.36], into: hat });
    part(S.smooth, gold(), { at: [0, -0.15, 0], size: [0.98, 0.1, 0.38], into: hat });
    part(S.smooth, bone, { at: [0, 0.08, 0.33], size: [0.12, 0.11, 0.05], into: hat });
    for (const t of [-0.7, 0.7]) part(S.box, bone, { at: [0, -0.07, 0.34], size: [0.34, 0.04, 0.03], turn: [0, 0, t], into: hat });
    hat.position.set(0, 6, 0);
    hat.scale.setScalar(1.4);
    seat.fig.add(hat);
    a.props.push(hat);
    at(0, 0.8, (k) => {
      hat.position.y = 3.05 + (1 - k) * 3;
      hat.rotation.y = (1 - k) * 7;
    }, easeOut);
    cue(0.8, () => sound.play('paHat'));
    at(1.0, 0.5, (k, raw) => (seat.fig.position.y = Math.sin(raw * Math.PI) * 0.5));
    at(4.2, 1.2, (k, raw) => (hat.rotation.x = Math.sin(raw * Math.PI) * -0.5)); // tips it to the crew
    at(7.6, 0.7, (k) => {
      hat.position.y = 3.05 + k * 4;
      hat.rotation.y = k * 6;
      hat.scale.setScalar(Math.max(0.001, 1.4 * (1 - k)));
    }, easeIn);
    a.end = stage.clock + 8.4;
  },

  /** A cutlass: a few flashy swings, a twirl, and back in the sash. */
  cutlass(seat, a) {
    const S = shapes();
    const sword = new THREE.Group();
    sword.position.set(0.62, 1.45, 0.3);
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      part(S.box, metal(), { at: [0.14 * t * t, 0.3 + t * 1.45, 0], size: [0.12, 0.26, 0.03], turn: [0, 0, -0.3 * t], into: sword });
    }
    part(new THREE.TorusGeometry(0.16, 0.035, 6, 12, Math.PI), gold(), { at: [0, 0.15, 0], turn: [0, 0, Math.PI], into: sword });
    part(S.disc, paint(0x2b1b10, { rough: 0.8 }), { at: [0, -0.02, 0], size: [0.05, 0.32, 0.05], into: sword });
    hold(seat, sword);
    at(0.4, 3.2, (k, raw) => {
      sword.rotation.z = -0.5 + Math.sin(raw * Math.PI * 5) * 1.3;
      sword.rotation.x = Math.sin(raw * Math.PI * 2.5) * 0.9;
      const twirl = raw < 0.42 ? 0 : raw < 0.7 ? (raw - 0.42) / 0.28 : 1;
      seat.fig.rotation.y = seat.yaw + easeOut(twirl) * Math.PI * 2;
    });
    for (const d of [0.55, 1.2, 1.85, 2.5, 3.1]) cue(d, () => sound.play('paSwish'));
    at(3.6, 0.3, (k) => sword.rotation.set(0, 0, -0.2 * k));
    putAway(sword, 4.1);
    a.end = stage.clock + 4.6;
  },

  /** A dagger, thrown at a crewmate. It sticks. They wobble. */
  dagger(seat, a) {
    const S = shapes();
    const target = pick([...seats.values()].filter((s) => s !== seat));
    a.touched.push(target);
    const knife = new THREE.Group();
    knife.position.set(0.6, 1.6, 0.25);
    part(S.cone, metal(), { at: [0, 0.55, 0], size: [0.1, 0.9, 0.035], into: knife });
    part(S.box, gold(), { at: [0, 0.1, 0], size: [0.34, 0.07, 0.08], into: knife });
    part(S.disc, paint(0x2b1b10, { rough: 0.8 }), { at: [0, -0.06, 0], size: [0.04, 0.24, 0.04], into: knife });
    hold(seat, knife);
    at(0.5, 0.45, (k) => (knife.rotation.x = -1.4 * k)); // wind up
    cue(1.0, () => {
      stage.scene.attach(knife); // keep where it is in the world, but stop moving with the thrower
      sound.play('paSwish');
      const from = knife.position.clone();
      const to = target.pos.clone().setY(1.35);
      const along = from.clone().sub(to).setY(0).normalize();
      to.addScaledVector(along, 0.42); // the blade stops at the surface of their coat
      const dir = to.clone().sub(from).normalize();
      at(0, 0.6, (k, raw) => {
        knife.position.lerpVectors(from, to, raw);
        knife.position.y += Math.sin(raw * Math.PI) * 1.6;
        knife.rotation.set(raw * Math.PI * 4, 0, 0);
      });
      cue(0.6, () => {
        knife.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        knife.position.copy(to);
        sound.play('paThunk');
        at(0, 1.4, (k, raw) => (target.fig.rotation.z = Math.sin(raw * Math.PI * 6) * 0.28 * (1 - raw)));
        at(2.4, 0.5, (k) => {
          knife.position.y = to.y + (0.08 - to.y) * k;
          knife.rotation.x += 0.08;
        }, easeIn);
      });
    });
    a.end = stage.clock + 5.4;
  },

  /** A musket. They peer down the barrel to see why it won't fire. It fires. */
  musket(seat, a) {
    const S = shapes();
    const gun = new THREE.Group();
    const iron = paint(0x2b2d33, { rough: 0.35, metal: 0.6 });
    part(S.disc, iron, { at: [0, 0, 0.95], size: [0.06, 1.9, 0.06], turn: [Math.PI / 2, 0, 0], into: gun });
    part(S.box, paint(0x5a3519, { rough: 0.7 }), { at: [0, -0.08, -0.15], size: [0.15, 0.24, 0.85], turn: [0.12, 0, 0], into: gun });
    for (const z of [0.35, 1.25]) part(S.disc, gold(), { at: [0, 0, z], size: [0.075, 0.06, 0.075], turn: [Math.PI / 2, 0, 0], into: gun });
    const start = new THREE.Vector3(0.55, 1.3, 0.3);
    const aim = new THREE.Vector3(0, 2.48, 0.7 + 1.9 * PROP); // pointing back at its own face, the muzzle a hand's width away
    gun.position.copy(start);
    hold(seat, gun);
    at(0.6, 1.0, (k) => {
      gun.position.lerpVectors(start, aim, k);
      gun.rotation.y = Math.PI * k;
    }, easeOut);
    at(1.6, 1.0, (k, raw) => {
      seat.fig.rotation.x = 0.14 * Math.sin(Math.min(1, raw * 3) * Math.PI / 2); // leans in for a look
      gun.rotation.z = Math.sin(raw * 30) * 0.05;
    });
    cue(1.7, () => sound.play('paClick'));
    cue(2.7, () => {
      const muzzle = seat.fig.localToWorld(new THREE.Vector3(0, 2.48, 0.7));
      sound.play('paMusket');
      fire.boost = 1.6;
      const bang = part(shapes().ball, paint(0xffd27a, { glow: 3 }), { at: muzzle.toArray(), size: 0.01, shadow: false, into: stage.scene });
      a.props.push(bang);
      at(0, 0.3, (k, raw) => bang.scale.setScalar(Math.max(0.001, Math.sin(raw * Math.PI) * 0.8)));
      for (let i = 0; i < 6; i++) puff(muzzle.clone().add(new THREE.Vector3(rand(-0.3, 0.3), rand(-0.1, 0.3), rand(-0.3, 0.3))), { size: rand(0.3, 0.55), life: rand(1.2, 2) });
      seat.fig.userData.head.material = paint(0x2a221c, { rough: 1 }); // soot
      at(0, 2.2, (k, raw) => (seat.fig.rotation.x = -0.6 * Math.sin(Math.min(1, raw * 4) * Math.PI / 2) * (1 - raw) + Math.sin(raw * 18) * 0.06 * (1 - raw)));
      stage.scene.attach(gun);
      const from = gun.position.clone();
      const rest = from.clone().setY(0.08);
      at(0.15, 0.7, (k, raw) => {
        gun.position.lerpVectors(from, rest, k);
        gun.position.y += Math.sin(raw * Math.PI) * 0.6;
        gun.rotation.z = (Math.PI / 2) * k;
      }, easeIn);
      cue(0.85, () => sound.play('knock'));
    });
    a.end = stage.clock + 7;
  },

  /** A guitar: they strike up a shanty, and the band falls quiet to let them play. */
  guitar(seat, a) {
    const S = shapes();
    const guitar = new THREE.Group();
    const body = paint(0xb8743a, { rough: 0.5 });
    const dark = paint(0x3a2414, { rough: 0.6 });
    part(S.smooth, body, { at: [0, -0.25, 0], size: [0.42, 0.48, 0.13], into: guitar });
    part(S.smooth, body, { at: [0, 0.2, 0], size: [0.33, 0.36, 0.12], into: guitar });
    part(S.round, paint(0x120c08, { rough: 1 }), { at: [0, -0.05, 0.11], size: [0.11, 0.02, 0.11], turn: [Math.PI / 2, 0, 0], into: guitar });
    part(S.box, dark, { at: [0, 0.85, 0.02], size: [0.09, 1.0, 0.05], into: guitar });
    part(S.box, dark, { at: [0, 1.42, 0.02], size: [0.15, 0.2, 0.05], into: guitar });
    guitar.position.set(0.1, 1.3, 0.55);
    guitar.rotation.z = 0.95;
    hold(seat, guitar);
    sound.musicOverride('paGuitar', 1.4);
    a.onEnd.push(() => sound.musicOverride(null, 1.4));
    at(0.4, 15, (k, raw) => {
      guitar.rotation.z = 0.95 + Math.sin(raw * Math.PI * 2 * 30) * 0.04;
      seat.fig.rotation.z = Math.sin(stage.clock * 3.2) * 0.08;
      seat.fig.rotation.x = Math.sin(stage.clock * 6.4) * 0.03;
    });
    for (let d = 0.8; d < 14.5; d += rand(0.55, 0.9)) cue(d, () => note(guitar.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.5, 0))));
    putAway(guitar, 15.5);
    a.end = stage.clock + 16.1;
  },
};

function startAntic(chosen = null) {
  const free = [...seats.values()].filter((s) => !s.hat);
  if (free.length < 2) return;
  const kind = chosen ?? pick(Object.keys(ANTICS).filter((k) => !recentAntics.includes(k)));
  recentAntics = [...recentAntics, kind].slice(-3); // no repeats until a few others have had a go
  const seat = pick(free);
  antic = { kind, seat, end: stage.clock + 30, tweens: new Set(), props: [], touched: [seat], onEnd: [] };
  ANTICS[kind](seat, antic);
}

function stopAntic() {
  if (!antic) return;
  const a = antic;
  antic = null;
  for (const tw of a.tweens) stage.cancel(tw);
  for (const obj of a.props) obj.parent?.remove(obj);
  for (const fn of a.onEnd) fn();
  for (const seat of a.touched) {
    seat.fig.rotation.set(0, seat.yaw, 0);
    seat.fig.position.y = 0;
    seat.fig.userData.head.material = seat.fig.userData.wood;
  }
}

function antics(dt) {
  if (antic && stage.clock >= antic.end) stopAntic();
  if (antic || shot.mode !== 'wide' || view?.phase !== 'vote' || seats.size < 2) return;
  nextAntic -= dt;
  if (nextAntic > 0) return;
  startAntic();
  nextAntic = rand(6, 12);
}

// ---------------------------------------------------------------------------
// Labels, framing, every frame
// ---------------------------------------------------------------------------

function labels(v) {
  const done = new Set(v.done ?? []);
  const after = (s) => stage.clock - (view?.countAt ?? 0) >= s;
  for (const seat of seats.values()) {
    const p = players.get(seat.id);
    const row = v.tally?.find((t) => t.id === seat.id);
    let tag = '';
    let foot = '';
    if (v.phase === 'vote') foot = done.has(seat.id) ? '<span class="pa-done">✓ voted</span>' : '<span class="pa-wait">thinking…</span>';
    if (v.phase === 'count') {
      foot = `<span class="pa-count">🪙 ${seat.count}</span>`;
      if (after(v.landed + 1.6) && v.winners.includes(seat.id)) tag = `<span class="pa-tag gold">${v.spot ? 'The Black Spot!' : 'The crew’s pick'}</span>`;
      if (v.spot && row && row.guess !== null && after(v.landed + 5.6)) {
        foot += `<span class="pa-guess ${row.gain === 3000 ? 'hit' : row.gain ? 'close' : ''}">guessed ${row.guess}</span>`;
      } else if (!v.spot && v.seers.includes(seat.id) && after(v.landed + 3)) {
        foot += '<span class="pa-guess hit">🎯</span>';
      }
    }
    const cls = `pa-label ${p?.away ? 'away' : ''} ${v.phase === 'vote' && done.has(seat.id) ? 'in' : ''}`;
    const html = `${tag}${chipHtml(p, esc)}<span class="pa-foot">${foot}</span>`;
    if (seat.sig !== html + cls) {
      seat.sig = html + cls;
      seat.label.className = `kit-label ${cls}`;
      seat.label.innerHTML = html;
    }
  }
}

function placeLabels() {
  for (const seat of seats.values()) stage.pin(seat.label, seat.pos.clone().setY(LABEL_Y));
}

function aimCamera() {
  const { target, dist, elevation } = cam;
  stage.camera.position.set(target.x, target.y + Math.sin(elevation) * dist, target.z + Math.cos(elevation) * dist);
  stage.camera.lookAt(target.x, target.y, target.z);
  stage.camera.updateMatrixWorld();
}

/** Frame the horseshoe of figures inside the 16:9 stage, under the question along the top. */
function fit() {
  if (!stage) return;
  sizePanels();
  const w = window.innerWidth;
  const h = window.innerHeight;
  const u = stage.unit;
  const fx = (1920 * u) / w;
  const fy = (1080 * u) / h;
  const top = fy * (1 - (2 * 330) / 1080); // below the question card
  const bottom = -fy * (1 - (2 * 175) / 1080); // above the banner
  const side = fx * 0.86;
  const rim = [];
  for (let i = 0; i <= 12; i++) {
    const angle = -ARC.spread + (2 * ARC.spread * i) / 12;
    rim.push(onArc(angle).setY(LABEL_Y + 0.5), onArc(angle, 0.7).setY(0));
  }
  const v = new THREE.Vector3();
  cam.dist = 34;
  cam.target.set(0, 0.6, -0.8);
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
    cam.target.y += (((hi + lo) / 2 - (top + bottom) / 2) * cam.dist) / 6; // figures too high on screen: look higher, so they drop
  }
  aimCamera();
}

function frame(dt, clock) {
  waves(clock);
  // The fire: every flame dances on its own beat; it roars up when a coin lands.
  fire.boost += (1 - fire.boost) * Math.min(1, dt * 1.5);
  for (const f of fire.flames) {
    const k = 0.8 + 0.2 * Math.sin(clock * 9 + f.phase) * Math.sin(clock * 5.3 + f.phase * 2);
    f.mesh.scale.set(f.size[0] * (0.9 + 0.1 * k), f.size[1] * k * fire.boost ** 0.6, f.size[2] * (0.9 + 0.1 * k));
    f.mesh.position.y = f.at[1] * (0.9 + 0.1 * k) * fire.boost ** 0.5;
    f.mesh.rotation.y = clock * 0.6 + f.phase;
  }
  fire.light.intensity = 120 * (0.85 + 0.15 * Math.sin(clock * 13) * Math.sin(clock * 7.3)) * fire.boost;
  for (const e of embers) {
    e.t += dt;
    if (e.t > e.life) Object.assign(e, { t: 0, x: rand(-0.6, 0.6), z: rand(-0.6, 0.6), drift: rand(-0.5, 0.5), life: rand(2, 3.5) });
    const k = e.t / e.life;
    e.m.position.set(e.x + Math.sin(clock * 2 + e.drift * 9) * 0.3 + e.drift * k * 2, 1 + k * 7 * fire.boost ** 0.3, e.z + e.drift * k);
    e.m.scale.setScalar(0.06 * (1 - k));
  }
  room.tick(dt, playing);
  if (playing) antics(dt);
  moveCamera(dt, clock);
  if (view) labels(view);
  placeLabels();
}

// ---------------------------------------------------------------------------
// The two functions host.js calls
// ---------------------------------------------------------------------------

export function show(v, playerMap) {
  if (!stage) init();
  players = playerMap;
  if (stage.open()) shot.snapped = false;
  playing = !v.paused;
  seatCrew(v.seats);
  if (v.phase === 'count' && v.key !== countKey) {
    countKey = v.key;
    v.countAt = stage.clock;
    count(v);
  } else if (v.phase === 'count') {
    v.countAt = view?.countAt ?? stage.clock;
  } else if (v.phase === 'vote' && countKey) {
    countKey = null;
    clearCount();
    wideShot();
  }
  view = v;
  labels(v);
}

export function hide() {
  if (!stage?.close()) return;
  stopAntic();
  clearCount();
  wideShot();
  countKey = null;
  view = null;
}

// ---------------------------------------------------------------------------
// The words host.js draws over the top
// ---------------------------------------------------------------------------

export function parleyScreens({ anim, chip }) {
  const chips = (ids) => ids.map((id) => chip(id)).join('');
  const votes = (n) => `🪙 ${n} vote${n === 1 ? '' : 's'}`;

  function pa(v) {
    const counting = v.phase === 'count';
    const head = `<div class="pa-head"${anim('head', 'drop', 0, 500)}>
      <span>${esc(v.roundLabel)}${v.of > 1 ? ` · ${v.number} of ${v.of}` : ''}</span>
      ${v.mult > 1 ? `<span class="pa-mult">×${v.mult} doubloons</span>` : ''}
    </div>`;
    // While the votes are counted the question shrinks to a strip, out of the way of the close-up.
    const prompt = `<div class="pa-prompt parch ${v.spot ? 'spot' : ''} ${counting ? 'slim' : ''}"${anim(`prompt-${v.phase}`, counting ? 'fade' : 'drop', 150, 600)}>${v.spot ? '<span class="pa-skull">💀</span>' : ''}${esc(v.prompt)}</div>`;

    if (!counting) {
      return `<div class="pa">${head}${prompt}
        <p class="pa-hint"${anim('hint', 'rise', 800, 500)}>${v.spot ? 'Vote in secret, then guess how many votes <b>you’ll</b> get' : 'Vote in secret, then guess who the crew picked'} <span class="tally">${v.done.length} of ${v.seats.length}</span></p>
      </div>`;
    }

    // The coins drop on the beach first; the words wait until they've landed.
    const ms = v.landed * 1000;
    const n = v.winners.length;
    const tally = (id) => v.tally.find((t) => t.id === id)?.votes ?? 0;
    const seen = v.spot
      ? `${v.seers.length ? `<em>Spot on</em>${chips(v.seers)}<span class="gain">+3,000</span>` : '<em>Nobody guessed their own count exactly</em>'}${v.close.length ? `<em class="gap">One out</em>${chips(v.close)}<span class="gain">+1,000</span>` : ''}`
      : v.seers.length ? `<em>Saw it coming</em>${chips(v.seers)}<span class="gain">+${fmt(v.gain)}</span>` : '<em>Nobody saw that coming!</em>';

    if (!n) return `<div class="pa">${head}${prompt}<div class="pa-banner parch"${anim('b1', 'rise', ms + 400, 500)}><em>Not a single vote cast. Mutiny!</em></div></div>`;

    if (n > 4) {
      return `<div class="pa">${head}${prompt}
        <div class="pa-banner parch"${anim('b1', 'rise', ms + 1600, 500)}>
          <div class="pa-line"><em>A ${n}-way tie! The crew picked</em>${chips(v.winners)}</div>
          <div class="pa-line"${anim('b2', 'rise', ms + 3000, 500)}>${seen}</div>
        </div></div>`;
    }

    // A caption under each close-up (one panel per pirate, matching the split screen behind).
    const kicker = v.spot ? 'The Black Spot' : n > 1 ? 'Tied for the crew’s pick' : 'The crew’s pick';
    const panels = v.winners
      .map((id, i) => `<div class="pa-panel"><div class="pa-caption parch"${anim(`cap${i}`, 'rise', ms + 1700 + i * 200, 500)}><span class="pa-kicker">${kicker}</span>${chip(id)}<span class="pa-votes">${votes(tally(id))}</span></div></div>`)
      .join('');
    // The Black Spot pulls back to the whole beach after a few seconds, so its captions bow out then.
    const leave = v.spot ? ` style="--leave:${ms + 5000}ms"` : '';
    const seenAt = v.spot ? ms + 5800 : ms + 3200;
    return `<div class="pa is-close">${head}${prompt}
      <div class="pa-panels ${v.spot ? 'leaves' : ''}" style="--n:${n}"${leave}>${panels}</div>
      <div class="pa-banner parch slim"${anim('seen', 'rise', seenAt, 500)}><div class="pa-line">${seen}</div></div>
    </div>`;
  }

  return { pa };
}
