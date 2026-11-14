// Message in a Bottle on the big screen: an archipelago on a sunny day.
//
// Every pirate has a little island of their own in a ring round a shipwreck,
// with a palm, a flag in their colour, and the pirate themself (one of Parley's
// pawns) on the beach. Whoever has a bottle holds it; every time the crew
// finishes a page they lob the bottles across the lagoon to the next island
// along. For the reveal the camera follows one bottle round the ring, page by
// page, while host.js unrolls each page on a scroll beside it. Anything that
// gets between the camera and the bottle dissolves out of the way.
//
// Built with the kit in kit3d.js, like Sea Lawyer and Parley.

import { THREE, createStage, shapes, paint, part, figure, decal, palm, rand, easeOut, easeInOut, linear, chipHtml } from './kit3d.js';
import { esc, fmt } from './common.js';
import { flagTag } from './flag.js';
import { createAmbience } from './ambience.js';
import './bottle-sound.js';

const RING = { a: 15, b: 8.6 }; // the islands sit on this ellipse round the wreck
const FIG = 0.85; // the crew: Parley's pawns, a touch smaller to fit their islands
const HOLD = new THREE.Vector3(0, 1.1, 0.72); // where a held bottle sits, cradled in front below the collar (figure space, before FIG)
const UP = new THREE.Vector3(0, 1, 0);
const LABEL_Y = 5.3; // name plates float over the pirates' heads

let stage = null;
let players = new Map();
let sea = null;
let islands = new Map(); // id -> { id, pos, group, fig, anim, label, flag, sig }
let islandsKey = '';
let bottles = []; // { group, holder: island id, at: where it's going, state: 'held' | 'windup' | 'flying', from, t, dur, peak, spin }
let gulls = [];
let clouds = [];
let view = null;
let playing = false;
let focus = null; // the bottle the camera follows during the reveal
const cam = { target: new THREE.Vector3(0, 0, 0), dist: 40, elevation: 0.72 };
const shot = { pos: new THREE.Vector3(), look: new THREE.Vector3(), snapped: false };

// A sunny lagoon: the water lapping, gulls, bottles knocking together, a whale far out, a buoy's bell.
const room = createAmbience([
  { name: 'mbLap', every: [3, 5.5], level: 0.6, soon: true },
  { name: 'gulls', every: [9, 20], level: 0.4 },
  { name: 'mbClink', every: [5, 12], level: 0.45 },
  { name: 'mbBreeze', every: [12, 24], level: 0.45 },
  { name: 'mbWhale', every: [35, 70], level: 0.5 },
  { name: 'distantBell', every: [30, 60], level: 0.3 },
]);

const onRing = (angle, k = 1, y = 0) => new THREE.Vector3(Math.sin(angle) * RING.a * k, y, -Math.cos(angle) * RING.b * k);

// ---------------------------------------------------------------------------
// The lagoon
// ---------------------------------------------------------------------------

// The sea, done like Bombard's resin tray: one sheet of little triangles, each a
// slightly different blue, rippling in short waves that cross each other. The
// triangles are small round the islands and grow towards the horizon, where the
// fog takes over. The paler lagoon inside the ring is painted into the water.
const SEA_BLUE = new THREE.Color(0x1b8fb0);
const LAGOON = new THREE.Color(0x4fc2c6);
const FOAM_AT = 0.2; // how high a crest has to be to break white

/** How high the water is at a spot (shared by the sea and everything that floats on it). */
function swell(x, z, t) {
  return (
    Math.sin(x * 0.55 + t * 1.1) * Math.cos(z * 0.7 + t * 0.8) * 0.13 + // the main chop
    Math.sin(x * 1.3 - z * 0.95 + t * 1.9) * 0.05 + // little ripples across it
    Math.sin((x + z) * 0.3 - t * 0.6) * 0.1 // a long swell rolling through
  );
}

function buildSea(scene) {
  // A grid squeezed towards the middle: cells about half a unit wide round the
  // ring, several units wide far out (u + u^3 stretches the edges).
  const geo = new THREE.PlaneGeometry(2, 2, 170, 120).rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i);
    const v = p.getZ(i);
    p.setXYZ(i, u * 46 + u ** 3 * 84, 0, v * 30 + v ** 3 * 70);
  }
  const sheet = geo.toNonIndexed();
  const base = Float32Array.from(sheet.attributes.position.array);

  // A colour for each triangle: sea blue, a shade off either way, paler in the lagoon.
  const colours = new Float32Array(base.length);
  const c = new THREE.Color();
  const hsl = {};
  for (let i = 0; i < base.length; i += 9) {
    const x = (base[i] + base[i + 3] + base[i + 6]) / 3;
    const z = (base[i + 2] + base[i + 5] + base[i + 8]) / 3;
    const inLagoon = 1 - THREE.MathUtils.smoothstep(Math.hypot(x / (RING.a + 7), z / (RING.b + 7)), 0.8, 1.2);
    c.copy(SEA_BLUE).lerp(LAGOON, inLagoon * 0.55).getHSL(hsl);
    c.setHSL(hsl.h + rand(-0.012, 0.012), hsl.s, hsl.l + rand(-0.025, 0.035));
    for (let k = 0; k < 3; k++) c.toArray(colours, i + k * 3);
  }
  sheet.setAttribute('color', new THREE.BufferAttribute(colours, 3));

  // Smooth light in every lighting style (banding on rolling water looks wrong),
  // and the tops of the highest crests break white.
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.25, metalness: 0.12 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying float vSeaY;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvSeaY = transformed.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vSeaY;\nvoid main() {')
      .replace('#include <color_fragment>', `#include <color_fragment>\n\tdiffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.86, 0.96, 0.97 ), smoothstep( ${FOAM_AT.toFixed(2)}, ${(FOAM_AT + 0.08).toFixed(2)}, vSeaY ) * 0.75 );`);
  };
  const mesh = new THREE.Mesh(sheet, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return { geo: sheet, base };
}

function waves(clock) {
  const pos = sea.geo.attributes.position;
  const a = pos.array;
  const b = sea.base;
  for (let i = 0; i < a.length; i += 3) a[i + 1] = swell(b[i], b[i + 2], clock);
  pos.needsUpdate = true;
}

function buildSky(scene) {
  part(shapes().smooth, new THREE.MeshBasicMaterial({ color: 0xfff1b8 }), { at: [60, 70, -170], size: 9, shadow: false, into: scene });
  const white = paint(0xffffff, { rough: 1 });
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < 6; j++) part(shapes().ball, white, { at: [j * 2.2 - 5, rand(0, 1.5), rand(-1, 1)], size: rand(1.6, 2.8), shadow: false, into: g });
    g.position.set(rand(-120, 120), rand(26, 42), rand(-150, -90));
    g.scale.setScalar(rand(1.5, 2.6));
    scene.add(g);
    clouds.push({ g, speed: rand(0.4, 1.1) });
  }
}

/** The wreck in the middle of the lagoon: a mast with its crow's nest, a tattered sail, and the bow poking out. */
function buildWreck(scene) {
  const S = shapes();
  const wood = paint(0x4a3220, { rough: 0.9 });
  const g = new THREE.Group();
  part(S.disc, wood, { at: [0, 3.2, 0], size: [0.22, 7.5, 0.22], turn: [0, 0, 0.18], into: g });
  part(S.disc, wood, { at: [0.45, 5.2, 0], size: [0.12, 3.6, 0.12], turn: [0, 0, Math.PI / 2 + 0.18], into: g });
  part(new THREE.CylinderGeometry(0.75, 0.6, 0.5, 10, 1, true), wood, { at: [1.15, 6.4, 0], into: g });
  const sail = part(new THREE.PlaneGeometry(3, 2.4, 6, 4), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.95, side: THREE.DoubleSide, flatShading: true }), { at: [0.25, 3.9, 0.1], turn: [0, 0.1, 0.18], into: g });
  const p = sail.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 1.6) * 0.25 + rand(-0.06, 0.06)); // billow
  sail.geometry.computeVertexNormals();
  part(new THREE.ConeGeometry(1.4, 4, 4), paint(0x5a3d26, { rough: 0.9 }), { at: [-2, 0.4, 1.2], turn: [0.9, 0.6, 0.4], into: g }); // the bow
  for (let i = 0; i < 5; i++) part(S.ball, paint(0x5f6a6e, { rough: 1 }), { at: [rand(-2.5, 2.5), 0, rand(-1.5, 1.5)], size: rand(0.5, 1.1), into: g }); // rocks
  scene.add(g);
}

function buildIsland(id, angle) {
  const S = shapes();
  const pos = onRing(angle);
  const g = new THREE.Group();
  g.position.copy(pos);
  g.rotation.y = Math.atan2(-pos.x, -pos.z); // local +z faces the wreck: the beach the crew stand on
  const sand = paint(0xe8cf92, { rough: 1 });
  part(S.smooth, sand, { at: [0, -0.35, 0], size: [3.2, 1.1, 2.7], into: g });
  part(S.smooth, paint(0xd9bd7c, { rough: 1 }), { at: [0.5, -0.2, -0.3], size: [2, 1.15, 1.6], into: g });
  part(S.round, new THREE.MeshBasicMaterial({ color: 0xa8eee2, transparent: true, opacity: 0.45, depthWrite: false }), { at: [0, 0.04, 0], size: [3.9, 0.01, 3.4], shadow: false, into: g }); // surf round the beach
  for (let i = 0; i < 3; i++) part(S.ball, paint(0x7a7f80, { rough: 1 }), { at: [rand(-2.4, 2.4), 0.1, rand(-1.8, -0.4)], size: rand(0.25, 0.5), into: g });
  palm(g, -0.7, -0.6, rand(0.15, 0.35), rand(5.5, 7), rand(0, 6));
  // A flagpole with a pennant in the pirate's colour, at the back of the island.
  const colour = players.get(id)?.color ?? '#888';
  part(S.disc, paint(0x6b4426, { rough: 0.8 }), { at: [1.35, 1.6, -0.7], size: [0.06, 3.2, 0.06], into: g });
  const flag = part(new THREE.PlaneGeometry(1.3, 0.8, 6, 2), new THREE.MeshStandardMaterial({ color: new THREE.Color(colour), roughness: 0.8, side: THREE.DoubleSide, flatShading: true }), { at: [2.0, 2.85, -0.7], into: g });
  flag.userData.base = Float32Array.from(flag.geometry.attributes.position.array);
  // The pirate, on the beach facing the lagoon.
  const fig = figure(colour);
  fig.scale.setScalar(FIG);
  fig.position.set(0.15, 0.58, 1.15);
  fig.rotation.order = 'YXZ'; // turn first, then lean
  g.add(fig);
  stage.scene.add(g);
  return { id, angle, pos, group: g, flag, fig, anim: null, label: stage.label('mb-label'), sig: '' };
}

function makeBottle() {
  const S = shapes();
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0x6fd39a, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.5, flatShading: true });
  part(new THREE.CylinderGeometry(0.42, 0.42, 1.4, 12), glass, { into: g });
  part(new THREE.CylinderGeometry(0.16, 0.4, 0.45, 12), glass, { at: [0, 0.92, 0], into: g });
  part(new THREE.CylinderGeometry(0.15, 0.15, 0.35, 10), glass, { at: [0, 1.3, 0], into: g });
  part(new THREE.CylinderGeometry(0.17, 0.14, 0.3, 10), paint(0x9a6a3a, { rough: 0.9 }), { at: [0, 1.55, 0], into: g });
  part(S.disc, paint(0xf1e3c0, { rough: 0.9 }), { size: [0.24, 1.1, 0.24], into: g }); // the scroll inside
  part(S.disc, paint(0xb3271e, { rough: 0.7 }), { size: [0.26, 0.12, 0.26], into: g }); // its ribbon
  g.rotation.z = Math.PI / 2 - 0.15; // floats on its side, neck a little up
  const holder = new THREE.Group();
  holder.add(g);
  holder.scale.setScalar(1.0); // in proportion to the pirates holding them
  stage.scene.add(holder);
  return holder;
}

function makeGull() {
  const g = new THREE.Group();
  const white = paint(0xf6f6f2, { rough: 0.8 });
  part(shapes().smooth, white, { size: [0.35, 0.22, 0.7], into: g });
  const wings = [-1, 1].map((side) => {
    const w = new THREE.Group();
    part(shapes().box, white, { at: [side * 0.8, 0, 0], size: [1.6, 0.05, 0.45], into: w });
    part(shapes().box, paint(0x2b2b2b, { rough: 0.8 }), { at: [side * 1.55, 0, 0], size: [0.3, 0.06, 0.4], into: w });
    g.add(w);
    return w;
  });
  stage.scene.add(g);
  return { g, wings, r: rand(12, 22), h: rand(9, 14), speed: rand(0.15, 0.3) * (Math.random() < 0.5 ? -1 : 1), phase: rand(0, 6) };
}

function init() {
  stage = createStage({
    id: 'mbLayer',
    background: 0x8fd0ee,
    exposure: 1.05,
    fov: 30,
    overlay: '<div class="mb-vignette"></div>',
    // Lighting styles (see looks3d.js). House style: no shading at all, just a
    // touch of tilt-shift (top and bottom of the screen gently out of focus) to
    // sell the little diorama.
    looks: {
      knee: 1,
      house: { post: { tilt: { amount: 1, centre: 0.5, band: 0.2 } } },
    },
  });
  const { scene } = stage;
  scene.fog = new THREE.Fog(0x9fd8ef, 80, 220);
  scene.add(new THREE.HemisphereLight(0xcfeeff, 0x2a6f80, 0.9));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.2);
  sun.position.set(30, 40, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 22, bottom: -22, near: 1, far: 120 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  sea = buildSea(scene);
  buildSky(scene);
  buildWreck(scene);
  gulls = Array.from({ length: 4 }, makeGull);
  stage.onFrame = frame;
  stage.onFit = fit;
  // Try a throw from the big screen's console while the game is on: toss() passes a
  // random bottle to the next island along, toss(2) slows the throw down 2x to watch it.
  window.toss = (slow = 1) => {
    const b = bottles.find((x) => x.state === 'held');
    const ids = [...islands.keys()];
    if (!b || ids.length < 2) return 'No bottle to throw.';
    const next = ids[(ids.indexOf(b.holder) + 1) % ids.length];
    tossSlow = slow;
    sail(b, next);
    return `${players.get(b.holder)?.name ?? b.holder} throws to ${players.get(next)?.name ?? next}`;
  };
}
let tossSlow = 1;

// ---------------------------------------------------------------------------
// Islands and bottles
// ---------------------------------------------------------------------------

function placeIslands(ids) {
  const sig = ids.join(',');
  if (sig === islandsKey) return;
  for (const isle of islands.values()) {
    stage.scene.remove(isle.group);
    isle.label.remove();
  }
  for (const b of bottles) stage.scene.remove(b.group);
  islands = new Map();
  bottles = [];
  islandsKey = sig;
  ids.forEach((id, i) => islands.set(id, buildIsland(id, (i / ids.length) * Math.PI * 2 + Math.PI * 0.08)));
  bottles = ids.map((id) => ({ group: makeBottle(), holder: id, at: id, state: 'held', caught: 0, from: new THREE.Vector3(), t: 1, dur: 1, peak: 0, spin: rand(0, 6) }));
  for (const isle of islands.values()) isle.group.updateMatrixWorld(true);
  for (const b of bottles) b.group.position.copy(holdPoint(islands.get(b.holder), b));
  fit();
}

// ---------------------------------------------------------------------------
// Throwing and catching. Whoever has a bottle holds it in front of them; to pass
// it on they turn to face the next island, wind up and lob it across the lagoon,
// and the catcher dips as it lands in their arms.
// ---------------------------------------------------------------------------

const THROW = { windup: 0.32, release: 0.42, done: 0.95 }; // seconds into a throw
const CATCH = 0.45;

/** How far an island's pirate has to turn (from facing the wreck) to face a point. */
function turnToward(isle, point) {
  const local = isle.group.worldToLocal(point.clone());
  return Math.atan2(local.x - isle.fig.position.x, local.z - isle.fig.position.z);
}

/** The middle of an island's pirate, in the world. */
const chestOf = (isle) => isle.fig.localToWorld(new THREE.Vector3(0, 1.45, 0));

const SPARE = [[-1.05, -0.45], [1.05, -0.55], [-0.45, -1.15], [0.55, -1.25]]; // where spare bottles lie: either side of the pirate and behind, out of the way (island space)

/**
 * Where a bottle held by this island goes: the newest one in the pirate's arms,
 * any others laid on the sand round their feet.
 */
function holdPoint(isle, bottle) {
  const mine = bottles.filter((b) => b.holder === isle.id && b.state !== 'flying').sort((a, b) => b.caught - a.caught);
  const i = Math.max(0, mine.indexOf(bottle));
  if (i === 0) return isle.fig.localToWorld(HOLD.clone());
  const [x, z] = SPARE[(i - 1) % SPARE.length];
  return isle.group.localToWorld(new THREE.Vector3(isle.fig.position.x + x, 0.95, isle.fig.position.z + z));
}
const inArms = (isle, bottle) => bottles.filter((b) => b.holder === isle.id && b.state !== 'flying').sort((a, b) => b.caught - a.caught)[0] === bottle;

/** Pass a bottle to another island: thrown by whoever has it, caught by them. */
function sail(bottle, id, seconds = 1.6) {
  if (bottle.at === id || !islands.has(id)) return;
  bottle.at = id;
  const from = islands.get(bottle.holder);
  if (!from || bottle.state === 'flying' || bottle.holder === id) return launch(bottle, seconds);
  if (from.anim?.kind === 'throw' && from.anim.bottle.state === 'windup') launch(from.anim.bottle, from.anim.seconds); // two at once: let the first one go
  bottle.state = 'windup';
  from.anim = { kind: 'throw', t: 0, turn: turnToward(from, islands.get(id).pos), bottle, seconds };
}

function launch(bottle, seconds) {
  bottle.state = 'flying';
  bottle.from = bottle.group.position.clone();
  bottle.t = 0;
  const to = islands.get(bottle.at);
  const d = bottle.from.distanceTo(to.pos);
  bottle.dur = Math.min(seconds, 0.75 + d * 0.045);
  bottle.peak = 1.6 + d * 0.27;
}

function animateCrew(dt) {
  dt /= tossSlow;
  for (const isle of islands.values()) {
    const fig = isle.fig;
    const a = isle.anim;
    let yaw = 0;
    let lean = 0;
    let dip = 0;
    if (a) {
      a.t += dt;
      if (a.kind === 'throw') {
        const { windup, release, done } = THROW;
        if (a.t < windup) {
          const k = easeOut(a.t / windup);
          yaw = a.turn * k;
          lean = -0.38 * k; // rock back
        } else if (a.t < release) {
          const k = (a.t - windup) / (release - windup);
          yaw = a.turn;
          lean = -0.38 + 0.78 * easeOut(k); // and fling forward
          if (k > 0.55 && a.bottle.state === 'windup') launch(a.bottle, a.seconds);
        } else {
          const k = Math.min(1, (a.t - release) / (done - release));
          yaw = a.turn * (1 - easeInOut(k));
          lean = 0.4 * (1 - easeInOut(k));
        }
        if (a.bottle.state === 'windup' && a.t >= release) launch(a.bottle, a.seconds);
        if (a.t >= done) isle.anim = null;
      } else if (a.kind === 'catch') {
        const k = Math.min(1, a.t / CATCH);
        const bump = Math.sin(k * Math.PI);
        yaw = a.turn * (1 - easeInOut(k));
        lean = -0.22 * bump; // knocked back a touch
        dip = -0.14 * bump;
        if (a.t >= CATCH) isle.anim = null;
      }
    }
    fig.rotation.set(lean, yaw, 0);
    fig.position.y = 0.58 + dip;
    isle.group.updateMatrixWorld(true);
  }
}

function moveBottles(dt, clock) {
  const fly = dt / tossSlow;
  if (tossSlow !== 1 && !bottles.some((b) => b.state !== 'held')) tossSlow = 1;
  for (const b of bottles) {
    const g = b.group;
    if (b.state === 'flying') {
      const to = islands.get(b.at);
      b.t = Math.min(1, b.t + fly / b.dur);
      const end = holdPoint(to, b);
      g.position.lerpVectors(b.from, end, b.t);
      g.position.y += Math.sin(b.t * Math.PI) * b.peak; // up and over
      const spin = b.t * Math.PI * 3;
      g.rotation.set(spin * 0.4, b.spin + spin, Math.sin(spin) * 0.5);
      if (b.t >= 1) {
        b.state = 'held';
        b.holder = b.at;
        b.caught = performance.now();
        if (to.anim?.kind !== 'throw') to.anim = { kind: 'catch', t: 0, turn: turnToward(to, b.from) }; // (mid-throw, they just keep throwing)
        wake(end);
      }
      continue;
    }
    const isle = islands.get(b.holder);
    if (!isle) continue;
    if (b.state === 'windup' && isle.anim?.bottle !== b) {
      launch(b, 1.6); // its throw got interrupted: send it on its way anyway
      continue;
    }
    const spot = holdPoint(isle, b);
    if (inArms(isle, b)) {
      // Held across the chest, swaying a little with whoever holds it.
      spot.y += Math.sin(clock * 1.7 + b.spin) * 0.03;
      g.rotation.set(0, isle.group.rotation.y + isle.fig.rotation.y, Math.sin(clock * 1.3 + b.spin) * 0.06);
    } else {
      g.rotation.set(0, isle.group.rotation.y + b.spin, 0); // a spare, lying on the sand
    }
    if (b.state === 'windup') g.position.copy(spot); // goes wherever the throwing arm goes
    else g.position.lerp(spot, 1 - Math.exp(-dt * 12)); // shuffles over when another one arrives
  }
}

/** A little splash of spray where a bottle lands. */
function wake(at) {
  const m = part(shapes().ball, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }), { at: [at.x, at.y, at.z], size: 0.01, shadow: false, into: stage.scene });
  stage.tween(0.6, (k, raw) => {
    m.scale.setScalar(0.25 + raw * 0.6);
    m.material.opacity = 0.6 * (1 - raw);
  }, { ease: easeOut, done: () => stage.scene.remove(m) });
}

// ---------------------------------------------------------------------------
// Labels, camera, every frame
// ---------------------------------------------------------------------------

function labels(v) {
  const done = new Set(v.done ?? []);
  const writing = ['write', 'draw', 'describe'].includes(v.phase);
  for (const isle of islands.values()) {
    const p = players.get(isle.id);
    const here = !writing && v.at === isle.id;
    const foot = writing ? (done.has(isle.id) ? '<span class="mb-done">✓ corked</span>' : `<span class="mb-wait">${v.phase === 'draw' ? 'drawing…' : 'writing…'}</span>`) : '';
    const cls = `mb-label ${here ? 'here' : ''} ${writing && done.has(isle.id) ? 'in' : ''} ${p?.away ? 'away' : ''}`;
    const html = `${chipHtml(p, esc)}${foot ? `<span class="mb-foot">${foot}</span>` : ''}`;
    if (isle.sig !== html + cls) {
      isle.sig = html + cls;
      isle.label.className = `kit-label ${cls}`;
      isle.label.innerHTML = html;
    }
  }
}

function aimWide() {
  const { target, dist, elevation } = cam;
  stage.camera.position.set(target.x, target.y + Math.sin(elevation) * dist, target.z + Math.cos(elevation) * dist);
  stage.camera.lookAt(target);
  stage.camera.updateMatrixWorld();
}

/** Frame the whole ring of islands (and their name plates) in the 16:9 stage. */
function fit() {
  if (!stage) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const u = stage.unit;
  const fx = (1920 * u) / w;
  const fy = (1080 * u) / h;
  const top = fy * (1 - (2 * 200) / 1080);
  const bottom = -fy * (1 - (2 * 140) / 1080);
  const side = fx * 0.88;
  const rim = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    rim.push(onRing(a, 1, LABEL_Y + 0.6), onRing(a, 1.2, -0.5));
  }
  const p = new THREE.Vector3();
  cam.dist = 40;
  cam.target.set(0, 0, 0);
  for (let i = 0; i < 40; i++) {
    aimWide();
    let lo = Infinity;
    let hi = -Infinity;
    let wide = 0;
    for (const q of rim) {
      p.copy(q).project(stage.camera);
      lo = Math.min(lo, p.y);
      hi = Math.max(hi, p.y);
      wide = Math.max(wide, Math.abs(p.x));
    }
    const grow = Math.max(wide / side, (hi - lo) / (top - bottom));
    cam.dist *= 1 + (grow - 1) * 0.8;
    cam.target.z -= (((hi + lo) / 2 - (top + bottom) / 2) * cam.dist) / 5;
  }
  aimWide();
}

function moveCamera(dt, clock) {
  let pos;
  let look;
  if (focus) {
    // Following one bottle: low over the lagoon, looking out at the island it's
    // going to, with the bottle (and whoever holds it) on the left third and room
    // for the page on the right. The camera keeps its place by the island while the
    // bottle flies in, and just turns to follow it.
    const b = focus.group.position;
    const home = islands.get(focus.at)?.pos ?? b;
    const facing = new THREE.Vector3(home.x, 0, home.z).normalize(); // outwards, from the wreck to the island
    const right = facing.clone().cross(UP).normalize();
    const held = focus.state !== 'flying';
    look = b.clone().setY(held ? 1.7 : THREE.MathUtils.lerp(1.7, b.y, 0.6)).addScaledVector(right, 3.2);
    pos = new THREE.Vector3(home.x, 0, home.z).addScaledVector(facing, -13).addScaledVector(right, 2.2).setY(held ? 4.6 : Math.max(4.6, b.y * 0.5 + 3.2));
    // Anything between the camera and the bottle (the wreck, a palm) dissolves out of the way.
    stage.look.focus = { target: b.clone(), radius: 2.2, near: 3 };
  } else {
    const drift = Math.sin(clock * 0.13) * 0.6;
    pos = new THREE.Vector3(cam.target.x + drift, cam.target.y + Math.sin(cam.elevation) * cam.dist, cam.target.z + Math.cos(cam.elevation) * cam.dist);
    look = cam.target.clone().add(new THREE.Vector3(drift * 0.4, 0, 0));
    // Every pirate stays in sight: a palm in front of one melts away (and so does a gull swooping past the lens).
    stage.look.focus = { targets: [...islands.values()].map((isle) => ({ at: chestOf(isle), radius: 1.9 })), near: 3 };
  }
  stage.labelsEl.classList.toggle('mb-focus', !!focus);
  if (!shot.snapped) {
    shot.pos.copy(pos);
    shot.look.copy(look);
    shot.snapped = true;
  }
  const f = 1 - Math.exp(-dt * 1.8);
  shot.pos.lerp(pos, f);
  shot.look.lerp(look, f);
  stage.camera.position.copy(shot.pos);
  stage.camera.lookAt(shot.look);
  stage.camera.updateMatrixWorld();
}

function frame(dt, clock) {
  waves(clock);
  animateCrew(dt);
  moveBottles(dt, clock);
  for (const isle of islands.values()) {
    const a = isle.flag.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = isle.flag.userData.base[i * 3];
      a.setZ(i, Math.sin(x * 4 - clock * 6 + isle.angle) * 0.12 * (x + 0.65));
    }
    a.needsUpdate = true;
  }
  for (const gull of gulls) {
    const t = clock * gull.speed + gull.phase;
    gull.g.position.set(Math.cos(t) * gull.r, gull.h + Math.sin(t * 2) * 0.8, Math.sin(t) * gull.r * 0.6 - 4);
    gull.g.rotation.y = -t + (gull.speed > 0 ? Math.PI : 0);
    const flap = Math.sin(clock * 7 + gull.phase) * 0.4;
    gull.wings[0].rotation.z = flap;
    gull.wings[1].rotation.z = -flap;
  }
  for (const c of clouds) {
    c.g.position.x += c.speed * dt;
    if (c.g.position.x > 140) c.g.position.x = -140;
  }
  room.tick(dt, playing);
  moveCamera(dt, clock);
  if (view) labels(view);
  for (const isle of islands.values()) stage.pin(isle.label, isle.fig.localToWorld(new THREE.Vector3(0, 0, 0)).setY(LABEL_Y)); // over the pirate's head
}

// ---------------------------------------------------------------------------
// The two functions host.js calls
// ---------------------------------------------------------------------------

export function show(v, playerMap) {
  if (!stage) init();
  players = playerMap;
  if (stage.open()) shot.snapped = false;
  playing = !v.paused;
  placeIslands(v.islands);
  if (v.holders) {
    // Writing and drawing: each bottle bobs off the island of whoever has it now.
    focus = null;
    v.holders.forEach((id, b) => bottles[b] && sail(bottles[b], id));
  } else if (v.bottle !== undefined) {
    // The reveal: follow this bottle to whichever island wrote the page on show.
    const b = bottles[v.bottle];
    if (b) {
      focus = v.phase === 'favourite' || v.phase === 'favourite-result' ? null : b;
      if (v.at) sail(b, v.at, v.phase === 'arrive' ? 2.5 : 2.2);
    }
  }
  view = v;
  labels(v);
}

export function hide() {
  if (!stage?.close()) return;
  focus = null;
  view = null;
}

// ---------------------------------------------------------------------------
// The words host.js draws over the top
// ---------------------------------------------------------------------------

export function bottleScreens({ anim, chip }) {
  const by = (x) => (x.author ? chip(x.author) : '');

  /** One page out of a bottle: words in a hand, or the drawing itself. */
  function pageBody(x, cls = '') {
    if (x.kind === 'drawing') return `<div class="mb-art ${cls}">${flagTag(x.flag)}</div>`;
    if (x.kind === 'lost') return `<p class="mb-lost ${cls}">…lost at sea…</p>`;
    return `<p class="mb-words ${cls}">${esc(x.text)}</p>`;
  }

  function mb(v) {
    if (['write', 'draw', 'describe'].includes(v.phase)) {
      const what = { write: 'Write a message to send off in your bottle', draw: 'A bottle has washed up. Draw what it says!', describe: 'A drawing has washed up. What is it?' }[v.phase];
      return `<div class="mb mb-writing">
        <div class="mb-head"${anim('head', 'drop', 0, 500)}><span class="mb-step">Page ${v.step + 1} of ${v.of}</span><span class="mb-what">${what}</span></div>
        <p class="mb-hint"${anim('hint', 'rise', 600, 500)}>On your phone <span class="tally">${v.done.length} of ${v.islands.length} corked</span></p>
      </div>`;
    }

    if (v.phase === 'arrive') {
      return `<div class="mb mb-reveal">
        <div class="mb-head"${anim('head', 'drop', 0, 500)}><span class="mb-step">A bottle washes up</span><span class="mb-what">It set off from ${chip(v.starter)}’s island</span></div>
      </div>`;
    }

    if (v.phase === 'page') {
      const x = v.pages[v.shown];
      const prev = v.pages[v.shown - 1];
      const verb = x.kind === 'drawing' ? 'drawn by' : x.kind === 'lost' ? 'lost by' : v.shown === 0 ? 'sent by' : 'guessed by';
      return `<div class="mb mb-reveal">
        <div class="mb-head slim"><span class="mb-step">Bottle from</span>${chip(v.starter)}<span class="mb-step">· page ${v.shown + 1} of ${v.of}</span></div>
        <div class="mb-scroll"${anim(`scroll${v.shown}`, 'mb-unroll', 0, 700)}>
          ${prev ? `<div class="mb-prev"><em>From</em>${pageBody(prev, 'small')}</div>` : ''}
          <div class="mb-page">${pageBody(x)}</div>
          <div class="mb-by"${anim(`by${v.shown}`, 'rise', 900, 450)}><em>${verb}</em>${by(x)}</div>
        </div>
      </div>`;
    }

    // The whole bottle laid out: vote for the best page, then the doubloons.
    const result = v.phase === 'favourite-result';
    const pages = v.pages
      .map((x, i) => `<div class="mb-card parch ${result && x.best ? 'best' : ''}"${anim(`card${i}`, 'pop', i * 110, 420)}>
        <span class="mb-n">${i + 1}</span>
        ${pageBody(x, 'small')}
        <div class="mb-card-foot">${by(x)}${result && x.votes.length ? `<span class="mb-votes">${x.votes.map((id) => chip(id, { label: false })).join('')}</span><span class="gain">+${fmt(x.gain)}</span>` : ''}</div>
      </div>`)
      .join('<span class="mb-arrow">➜</span>');
    return `<div class="mb mb-fav">
      <div class="mb-head slim"><span class="mb-step">The bottle from</span>${chip(v.starter)}</div>
      <div class="mb-chain" style="--n:${v.pages.length}">${pages}</div>
      ${result ? '' : `<p class="hint">Vote for the best page on your phone! <span class="tally">${v.voted.length} in</span></p>`}
    </div>`;
  }

  return { mb };
}
