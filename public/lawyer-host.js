// Sea Lawyer on the big screen: the Admiralty court, as a desk diorama.
//
// A great leather-bound lexicon lies open on the judge's desk. The question is
// written on its left page; the right page stays blank until the verdict,
// when the truth inks itself in and the gavel comes down. Round it: a candle,
// a quill in its pot, the scales of justice, a stack of law books, and the
// judge's trinkets: a Newton's cradle, a globe, an hourglass that's turned for
// every question, a pocket watch, a ship in a bottle, a telescope and a skull.
//
// host.js draws the words over the top (the sealed letters, the stamps); this
// file owns the desk and everything on it, using the kit in kit3d.js.

import { THREE, createStage, shapes, paint, part, decal, wrapText, planks, flame, rand, easeOut, easeIn, linear } from './kit3d.js';
import { esc, fmt } from './common.js';
import { createAmbience } from './ambience.js';
import './lawyer-sound.js';

const PAGE = { w: 6.1, h: 8, y: 0.62 }; // each page of the open book, lying on the desk
const INK = '#2b1b0f';

let stage = null;
let book = null; // { left, right, leftTex, rightTex }
let gavel = null;
let scales = null;
let candle = null;
let trinkets = null; // the things on the desk that move: the cradle, the globe, the hourglass, the watch
let shake = 0;
let lastKey = null;
let playing = false; // false while the game is paused: the room falls quiet too

// The court in session: the clock, the weather on the stern windows, and the public gallery.
const room = createAmbience([
  { name: 'slTickTock', every: [2, 2], level: 0.35 },
  { name: 'slRain', every: [16, 34], level: 0.7, soon: true },
  { name: 'slThunder', every: [40, 80], level: 0.55 },
  { name: 'slWhisper', every: [12, 26], level: 0.55 },
  { name: 'slCough', every: [30, 70], level: 0.45 },
  { name: 'paper', every: [20, 45], level: 0.3 },
  { name: 'creak', every: [14, 32], level: 0.4 },
]);
let page = { prompt: '', topic: '', truth: null, fact: null, footer: '', inked: 0 };
const cam = { target: new THREE.Vector3(0, 0.6, 0.3), dist: 18, elevation: 1.05, yaw: 0 };
const camTo = { ...cam, target: cam.target.clone() };

// Where the camera sits for each part of a question.
const SHOTS = {
  write: { target: [0, 0.4, 1.0], dist: 22.5, elevation: 1.1, yaw: 0 },
  pick: { target: [0, 0, -2.6], dist: 30, elevation: 0.98, yaw: 0 },
  lie: { target: [0, 0, -2.6], dist: 30, elevation: 0.98, yaw: 0 },
  truth: { target: [3.1, 0.5, 0.7], dist: 17, elevation: 1.22, yaw: -0.04 },
};

// ---------------------------------------------------------------------------
// The pages
// ---------------------------------------------------------------------------

function parchment(c, w, h, spineOnRight) {
  c.fillStyle = '#f3e7c9';
  c.fillRect(0, 0, w, h);
  // Darker towards the spine, where the pages curve down into the binding.
  const g = c.createLinearGradient(spineOnRight ? w : 0, 0, spineOnRight ? 0 : w, 0);
  g.addColorStop(0, 'rgba(120,80,35,0.45)');
  g.addColorStop(0.12, 'rgba(120,80,35,0.12)');
  g.addColorStop(1, 'rgba(120,80,35,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // Foxing: little brown spots of age.
  for (let i = 0; i < 60; i++) {
    c.fillStyle = `rgba(140,95,40,${rand(0.03, 0.1)})`;
    c.beginPath();
    c.arc(rand(0, w), rand(0, h), rand(2, 14), 0, Math.PI * 2);
    c.fill();
  }
  // A ruled border.
  c.strokeStyle = 'rgba(122,42,29,0.55)';
  c.lineWidth = 3;
  c.strokeRect(54, 54, w - 108, h - 108);
  c.lineWidth = 1.2;
  c.strokeRect(66, 66, w - 132, h - 132);
}

function drawLeft(c, w, h) {
  parchment(c, w, h, true);
  c.fillStyle = '#7a2a1d';
  c.font = '54px "Pirata One"';
  c.textAlign = 'center';
  c.fillText('The Ship’s Lexicon', w / 2, 150);
  c.fillStyle = INK;
  c.font = 'italic 40px "IM Fell English"';
  c.fillText(page.topic, w / 2, 210);
  c.fillRect(w / 2 - 120, 240, 240, 3);
  const text = page.prompt.replace(/_+/g, '_______');
  const size = text.length < 45 ? 104 : text.length < 80 ? 92 : text.length < 115 ? 80 : 70;
  c.font = `${size}px "IM Fell English"`;
  wrapText(c, text, w / 2, 340 + size * 0.6, w - 190, size * 1.18, { align: 'center', maxLines: 9 });
  c.font = 'italic 34px "IM Fell English"';
  c.fillStyle = 'rgba(43,27,15,0.7)';
  c.fillText(page.footer, w / 2, h - 110);
}

function drawRight(c, w, h) {
  parchment(c, w, h, false);
  c.fillStyle = '#7a2a1d';
  c.font = '54px "Pirata One"';
  c.textAlign = 'center';
  c.fillText('The Truth of It', w / 2, 150);
  c.fillStyle = INK;
  c.fillRect(w / 2 - 120, 180, 240, 3);

  if (!page.truth) {
    // Blank lines waiting for the verdict, and the court's seal.
    c.strokeStyle = 'rgba(43,27,15,0.25)';
    c.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(130, 380 + i * 110);
      c.lineTo(w - 130, 380 + i * 110);
      c.stroke();
    }
    c.font = 'italic 38px "IM Fell English"';
    c.fillStyle = 'rgba(43,27,15,0.55)';
    c.fillText('Sealed until the verdict', w / 2, h - 300);
    seal(c, w / 2, h - 190, 70);
    return;
  }

  // The answer, written in by hand, sweeping on from the left as `inked` runs to 1.
  c.save();
  c.beginPath();
  c.rect(0, 0, 90 + (w - 120) * page.inked, h);
  c.clip();
  c.fillStyle = '#1d2a55';
  const big = page.truth.length < 40 ? 96 : 80;
  c.font = `${big}px "Cedarville Cursive"`;
  const below = wrapText(c, page.truth, w / 2, 350, w - 180, big * 1.3, { align: 'center', maxLines: 5 });
  c.restore();
  if (page.fact && page.inked >= 1) {
    c.fillStyle = 'rgba(43,27,15,0.85)';
    c.font = 'italic 38px "IM Fell English"';
    wrapText(c, page.fact, w / 2, Math.max(below + 60, 640), w - 220, 50, { align: 'center', maxLines: 7 });
  }
  if (page.inked >= 1) seal(c, w / 2, h - 170, 70, 'TRUE');
}

/** A blob of red wax with the court's mark pressed into it. */
function seal(c, x, y, r, word = '⚓') {
  c.save();
  c.fillStyle = '#9e2219';
  c.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rr = r * (1 + (i % 2 ? 0.06 : -0.02));
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.fill();
  c.strokeStyle = 'rgba(255,200,170,0.4)';
  c.lineWidth = 4;
  c.beginPath();
  c.arc(x, y, r * 0.72, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = 'rgba(255,220,200,0.75)';
  c.font = `${word.length > 2 ? r * 0.42 : r * 0.8}px "Pirata One"`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(word, x, y + 2);
  c.restore();
}

function redrawPages() {
  book.leftTex.redraw();
  book.rightTex.redraw();
}

// ---------------------------------------------------------------------------
// Building the desk
// ---------------------------------------------------------------------------

function buildBook(scene) {
  const S = shapes();
  const leather = paint(0x6b2418, { rough: 0.6 });
  const gilt = paint(0xd9a441, { rough: 0.35, metal: 0.3 });
  const pages = paint(0xeadbb4, { rough: 0.95 });
  const g = new THREE.Group();

  // The covers, open flat with a little overhang, and the spine between them.
  for (const side of [-1, 1]) {
    const half = new THREE.Group();
    part(S.box, leather, { at: [side * (PAGE.w / 2 + 0.05), 0.08, 0], size: [PAGE.w + 0.45, 0.16, PAGE.h + 0.5], into: half });
    // The block of pages, thicker towards the spine.
    part(S.box, pages, { at: [side * (PAGE.w / 2), 0.36, 0], size: [PAGE.w - 0.05, 0.42, PAGE.h - 0.05], into: half });
    half.rotation.z = side * -0.045; // the pages rise a little towards the spine
    g.add(half);
  }
  part(S.round, leather, { at: [0, 0.18, 0], size: [0.35, PAGE.h + 0.5, 0.35], turn: [Math.PI / 2, 0, 0], into: g });
  // Gilt corners on the covers.
  for (const x of [-PAGE.w - 0.2, PAGE.w + 0.2]) for (const z of [-PAGE.h / 2 - 0.15, PAGE.h / 2 + 0.15]) part(S.box, gilt, { at: [x, 0.17, z], size: [0.5, 0.04, 0.5], turn: [0, Math.PI / 4, 0], into: g });
  // A red ribbon bookmark trailing out of the bottom.
  part(S.box, paint(0xa8281f, { rough: 0.8 }), { at: [0.25, 0.6, PAGE.h / 2 + 0.55], size: [0.22, 0.02, 1.3], turn: [0.05, 0.1, 0], into: g });

  const leftTex = decal(drawLeft, 1024, 1344);
  const rightTex = decal(drawRight, 1024, 1344);
  const sheet = (tex, side) => {
    const m = part(new THREE.PlaneGeometry(PAGE.w - 0.12, PAGE.h - 0.12).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }), { at: [side * (PAGE.w / 2 + 0.02), 0, 0], shadow: false });
    m.receiveShadow = true;
    const holder = new THREE.Group();
    holder.add(m);
    holder.position.y = PAGE.y - 0.02 + 0.015;
    holder.rotation.z = side * -0.045;
    g.add(holder);
    return m;
  };
  const left = sheet(leftTex, -1);
  const right = sheet(rightTex, 1);
  scene.add(g);
  return { group: g, left, right, leftTex, rightTex };
}

function buildGavel(scene) {
  const S = shapes();
  const oak = paint(0x5a3519, { rough: 0.55 });
  const brass = paint(0xd9a441, { rough: 0.3, metal: 0.4 });
  // The sound block it strikes.
  part(S.round, oak, { at: [8.9, 0.22, 4.6], size: [1.15, 0.44, 1.15], into: scene });
  part(S.round, brass, { at: [8.9, 0.45, 4.6], size: [1.18, 0.04, 1.18], into: scene });
  // The gavel pivots on the end of its handle, which rests on the desk.
  const pivot = new THREE.Group();
  pivot.position.set(11.6, 0.3, 5.8);
  const arm = new THREE.Group();
  pivot.add(arm);
  part(S.disc, oak, { at: [-1.7, 0, 0], size: [0.14, 3.4, 0.14], turn: [0, 0, Math.PI / 2], into: arm });
  const head = part(S.disc, oak, { at: [-3.2, 0.25, 0], size: [0.42, 1.5, 0.42], turn: [Math.PI / 2, 0, 0], into: arm });
  for (const z of [-0.6, 0.6]) part(S.disc, brass, { at: [-3.2, 0.25, z], size: [0.45, 0.12, 0.45], turn: [Math.PI / 2, 0, 0], into: arm });
  pivot.rotation.y = Math.atan2(4.6 - 5.8, 11.6 - 8.9); // point the head at the block
  const rest = -0.11; // tilted up just enough for the head to rest on the block
  arm.rotation.z = rest;
  scene.add(pivot);
  return { pivot, arm, head, rest };
}

function buildScales(scene) {
  const S = shapes();
  const brass = paint(0xcf9a3a, { rough: 0.3, metal: 0.55 });
  const g = new THREE.Group();
  g.position.set(9.2, 0, -5.6);
  part(S.round, brass, { at: [0, 0.12, 0], size: [1.1, 0.24, 1.1], into: g });
  part(S.disc, brass, { at: [0, 2.6, 0], size: [0.12, 5, 0.12], into: g });
  part(S.ball, brass, { at: [0, 5.25, 0], size: 0.24, into: g });
  const beam = new THREE.Group();
  beam.position.set(0, 4.9, 0);
  part(S.box, brass, { at: [0, 0, 0], size: [4.6, 0.12, 0.14], into: beam });
  const pans = [];
  for (const side of [-1, 1]) {
    const hang = new THREE.Group();
    hang.position.set(side * 2.2, 0, 0);
    for (const a of [0, 2.1, 4.2]) {
      part(S.disc, brass, { at: [Math.cos(a) * 0.32, -0.95, Math.sin(a) * 0.32], size: [0.02, 1.95, 0.02], turn: [Math.sin(a) * 0.17, 0, -Math.cos(a) * 0.17], shadow: false, into: hang });
    }
    part(new THREE.CylinderGeometry(0.7, 0.45, 0.22, 20), brass, { at: [0, -1.95, 0], into: hang });
    beam.add(hang);
    pans.push(hang);
  }
  g.add(beam);
  g.scale.setScalar(0.92);
  scene.add(g);
  return { beam, pans, tilt: 0, aim: 0 };
}

function buildProps(scene) {
  const S = shapes();
  // A stack of law books, back left.
  const covers = [0x2c4a3a, 0x6b2418, 0x23324f, 0x5b3a1c];
  let y = 0;
  covers.forEach((colour, i) => {
    const h = rand(0.5, 0.8);
    part(S.box, paint(colour, { rough: 0.65 }), { at: [-9.6 + rand(-0.2, 0.2), y + h / 2, -5.4 + rand(-0.15, 0.15)], size: [3.4 - i * 0.15, h, 4.4 - i * 0.2], turn: [0, rand(-0.18, 0.18), 0], into: scene });
    part(S.box, paint(0xeadbb4, { rough: 0.9 }), { at: [-9.6, y + h / 2, -5.4], size: [3.25 - i * 0.15, h * 0.78, 4.42 - i * 0.2], turn: [0, 0, 0], into: scene });
    y += h;
  });
  // The candle, on top of the books, so it lights the page from the corner.
  part(S.disc, paint(0xb8862f, { rough: 0.4 }), { at: [-9.4, y + 0.08, -5.2], size: [0.75, 0.16, 0.75], into: scene });
  part(S.disc, paint(0xf3e6c4, { rough: 0.9 }), { at: [-9.4, y + 0.95, -5.2], size: [0.3, 1.7, 0.3], into: scene });
  part(S.ball, paint(0xf3e6c4, { rough: 0.9 }), { at: [-9.2, y + 1.5, -5.08], size: [0.12, 0.25, 0.12], into: scene });
  candle = flame(scene, { at: [-9.4, y + 2.1, -5.2], strength: 55, reach: 26 });

  // An inkwell with a quill in it, by the right-hand page.
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.15, metalness: 0.1, flatShading: true });
  part(new THREE.CylinderGeometry(0.55, 0.7, 0.75, 8), glass, { at: [7.7, 0.38, -1.8], into: scene });
  part(S.disc, paint(0x111111, { rough: 0.2 }), { at: [7.7, 0.78, -1.8], size: [0.32, 0.08, 0.32], into: scene });
  const quill = new THREE.Group();
  quill.position.set(7.7, 0.7, -1.8);
  quill.rotation.set(0.15, 0.4, -0.5);
  part(S.disc, paint(0xe8e0cc, { rough: 0.8 }), { at: [0, 1.6, 0], size: [0.04, 3.2, 0.04], into: quill });
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    part(S.box, paint(0xf1ece0, { rough: 0.95 }), { at: [0.12 * Math.sin(t * Math.PI), 1.4 + t * 1.8, 0], size: [0.55 * Math.sin(t * Math.PI) + 0.05, 0.12, 0.02], turn: [0, 0, 0.5], shadow: false, into: quill });
  }
  scene.add(quill);

  // A magnifying glass, and a few doubloons for the court's fees.
  const brass = paint(0xd9a441, { rough: 0.3, metal: 0.4 });
  part(new THREE.TorusGeometry(0.95, 0.09, 6, 28), brass, { at: [-8.2, 0.12, 3.6], turn: [Math.PI / 2, 0, 0], into: scene });
  part(S.round, new THREE.MeshStandardMaterial({ color: 0xcfe6ff, roughness: 0.05, transparent: true, opacity: 0.3 }), { at: [-8.2, 0.1, 3.6], size: [0.92, 0.03, 0.92], shadow: false, into: scene });
  part(S.disc, paint(0x3a2414, { rough: 0.6 }), { at: [-9.6, 0.12, 4.9], size: [0.13, 1.9, 0.13], turn: [Math.PI / 2, 0, 0.75], into: scene });
  const gold = paint(0xf2c230, { rough: 0.3 });
  for (let i = 0; i < 7; i++) part(S.disc, gold, { at: [6.2 + rand(-0.9, 0.9), 0.05 + (i < 4 ? i * 0.09 : 0), 5.4 + rand(-0.6, 0.6)], size: [0.36, 0.09, 0.36], turn: [0, rand(0, 3), 0], into: scene });
}

// ----- trinkets: the clutter of a busy court -----

/** The executive toy: five steel balls on threads, clacking back and forth for ever. */
function newtonsCradle(scene, x, z, turn = 0) {
  const S = shapes();
  const brass = paint(0xd9a441, { rough: 0.25, metal: 0.6 });
  const steel = paint(0xdfe4ea, { rough: 0.12, metal: 0.9 });
  const thread = paint(0xeeeeee, { rough: 1 });
  const g = new THREE.Group();
  part(S.box, paint(0x2a1a10, { rough: 0.5 }), { at: [0, 0.08, 0], size: [2.6, 0.16, 1.3], into: g });
  for (const sx of [-1.15, 1.15]) for (const sz of [-0.5, 0.5]) part(S.disc, brass, { at: [sx, 1.05, sz], size: [0.04, 1.9, 0.04], into: g });
  for (const sz of [-0.5, 0.5]) part(S.disc, brass, { at: [0, 2.0, sz], size: [0.04, 2.34, 0.04], turn: [0, 0, Math.PI / 2], into: g });
  const R = 0.2;
  const L = 1.25;
  const balls = [];
  for (let i = 0; i < 5; i++) {
    const pivot = new THREE.Group();
    pivot.position.set((i - 2) * 2 * R, 2.0, 0);
    for (const sz of [-0.5, 0.5]) part(S.disc, thread, { at: [0, -L / 2, sz / 2], size: [0.008, Math.hypot(L, sz), 0.008], turn: [Math.atan2(sz, L), 0, 0], shadow: false, into: pivot });
    part(S.smooth, steel, { at: [0, -L, 0], size: R, into: pivot });
    g.add(pivot);
    balls.push(pivot);
  }
  g.position.set(x, 0, z);
  g.rotation.y = turn;
  scene.add(g);
  return balls;
}

/** A globe on a turned stand, tilted on its axis, slowly turning. Here be dragons. */
function globe(scene, x, z) {
  const S = shapes();
  const wood = paint(0x5a3519, { rough: 0.55 });
  const brass = paint(0xd9a441, { rough: 0.3, metal: 0.5 });
  const map = decal((c, w, h) => {
    c.fillStyle = '#2f5f7a';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(240,225,190,0.25)';
    c.lineWidth = 1;
    for (let i = 1; i < 12; i++) {
      c.beginPath();
      c.moveTo((i * w) / 12, 0);
      c.lineTo((i * w) / 12, h);
      c.stroke();
    }
    for (let i = 1; i < 6; i++) {
      c.beginPath();
      c.moveTo(0, (i * h) / 6);
      c.lineTo(w, (i * h) / 6);
      c.stroke();
    }
    // Continents, roughly as an old chartmaker guessed them.
    for (let k = 0; k < 9; k++) {
      const cx = rand(0, w);
      const cy = rand(h * 0.15, h * 0.85);
      const r = rand(18, 52);
      c.fillStyle = '#d9c08a';
      c.strokeStyle = '#5a3d1e';
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const rr = r * rand(0.55, 1.25);
        c.lineTo(cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr);
      }
      c.fill();
      c.stroke();
    }
  }, 512, 256);
  const g = new THREE.Group();
  part(S.round, wood, { at: [0, 0.1, 0], size: [0.85, 0.2, 0.85], into: g });
  part(S.disc, wood, { at: [0, 0.65, 0], size: [0.12, 1.0, 0.12], into: g });
  part(S.smooth, wood, { at: [0, 1.15, 0], size: 0.18, into: g });
  const tilt = new THREE.Group();
  tilt.position.set(0, 2.25, 0);
  tilt.rotation.z = 0.41;
  g.add(tilt);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshStandardMaterial({ map, roughness: 0.55 }));
  ball.castShadow = true;
  tilt.add(ball);
  part(new THREE.TorusGeometry(1.1, 0.045, 6, 48, Math.PI * 1.25), brass, { turn: [0, 0, -Math.PI * 0.62], into: tilt });
  g.position.set(x, 0, z);
  scene.add(g);
  return ball;
}

/** An hourglass. It is turned over for every new question, and runs out in about the time it takes to write a lie. */
function hourglass(scene, x, z) {
  const S = shapes();
  const wood = paint(0x4a2c18, { rough: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xe8f4ff, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false });
  const sand = paint(0xe2c27a, { rough: 1 });
  const holder = new THREE.Group();
  holder.position.set(x, 0.95, z);
  const g = new THREE.Group();
  holder.add(g);
  for (const y of [-0.88, 0.88]) part(S.round, wood, { at: [0, y, 0], size: [0.62, 0.12, 0.62], into: g });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    part(S.disc, wood, { at: [Math.cos(a) * 0.52, 0, Math.sin(a) * 0.52], size: [0.05, 1.7, 0.05], into: g });
  }
  part(new THREE.CylinderGeometry(0.45, 0.06, 0.8, 14), glass, { at: [0, 0.42, 0], shadow: false, into: g });
  part(new THREE.CylinderGeometry(0.06, 0.45, 0.8, 14), glass, { at: [0, -0.42, 0], shadow: false, into: g });
  const top = part(new THREE.ConeGeometry(0.38, 0.62, 14).rotateX(Math.PI), sand, { into: g }); // apex down, at the neck
  const bottom = part(new THREE.ConeGeometry(0.4, 0.45, 14), sand, { into: g }); // a heap, apex up
  const stream = part(S.disc, sand, { at: [0, -0.4, 0], size: [0.018, 0.75, 0.018], shadow: false, into: g });
  scene.add(holder);
  return { g, top, bottom, stream, full: 0.15, turning: false };
}

function pourSand(glass, dt) {
  if (!glass.turning) glass.full = Math.max(0, glass.full - dt / 55);
  const up = Math.cbrt(glass.full);
  const down = Math.cbrt(1 - glass.full);
  glass.top.scale.setScalar(Math.max(0.001, up));
  glass.top.position.y = 0.06 + 0.31 * up;
  glass.bottom.scale.setScalar(Math.max(0.001, down));
  glass.bottom.position.y = -0.82 + 0.225 * down;
  glass.stream.visible = glass.full > 0 && !glass.turning;
}

/** Turn the hourglass over: what had run through is now waiting at the top. */
function turnHourglass(glass) {
  if (glass.turning) return;
  glass.turning = true;
  stage.tween(0.9, (k) => (glass.g.rotation.z = Math.PI * k), {
    ease: easeOut,
    done: () => {
      glass.g.rotation.z = 0;
      glass.full = 1 - glass.full;
      glass.turning = false;
    },
  });
}

/** A gold pocket watch lying open, its second hand ticking round. */
function pocketWatch(scene, x, z) {
  const S = shapes();
  const gold = paint(0xe0b04a, { rough: 0.25, metal: 0.7 });
  const g = new THREE.Group();
  part(S.round, gold, { at: [0, 0.07, 0], size: [0.62, 0.14, 0.62], into: g });
  const face = decal((c, w) => {
    c.fillStyle = '#f6efdc';
    c.beginPath();
    c.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#2b1b0f';
    c.font = `${w * 0.11}px "IM Fell English", serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    ['XII', 'III', 'VI', 'IX'].forEach((n, i) => {
      const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
      c.fillText(n, w / 2 + Math.cos(a) * w * 0.36, w / 2 + Math.sin(a) * w * 0.36);
    });
  }, 256);
  part(new THREE.CircleGeometry(0.55, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: face, roughness: 0.4 }), { at: [0, 0.145, 0], shadow: false, into: g });
  const hand = (len, w, turn) => {
    const pivot = new THREE.Group();
    pivot.position.y = 0.15;
    pivot.rotation.y = turn;
    part(S.box, paint(0x1a1410, { rough: 0.5 }), { at: [0, 0, -len / 2], size: [w, 0.01, len], shadow: false, into: pivot });
    g.add(pivot);
    return pivot;
  };
  hand(0.3, 0.04, -1.2);
  hand(0.44, 0.03, 2.3);
  const seconds = hand(0.48, 0.012, 0);
  // The lid, open on its hinge, and the bow and chain.
  const lid = new THREE.Group();
  lid.position.set(0, 0.14, 0.62);
  lid.rotation.x = -1.9;
  part(S.round, gold, { at: [0, 0, 0.62], size: [0.62, 0.05, 0.62], into: lid });
  g.add(lid);
  part(new THREE.TorusGeometry(0.16, 0.035, 6, 16), gold, { at: [0, 0.1, -0.74], turn: [Math.PI / 2, 0, 0], into: g });
  for (let i = 0; i < 9; i++) part(new THREE.TorusGeometry(0.07, 0.02, 4, 8), gold, { at: [0.25 + i * 0.12, 0.03, -0.85 - Math.sin(i * 0.7) * 0.25], turn: [Math.PI / 2, 0, i % 2 ? Math.PI / 2 : 0], into: g });
  g.position.set(x, 0, z);
  g.rotation.y = 0.5;
  scene.add(g);
  return seconds;
}

/** A model ship, somehow, inside a bottle, on a little stand. */
function shipInABottle(scene, x, z) {
  const S = shapes();
  const g = new THREE.Group();
  const wood = paint(0x5a3519, { rough: 0.6 });
  for (const sx of [-0.9, 0.9]) part(S.box, wood, { at: [sx, 0.2, 0], size: [0.18, 0.4, 0.9], into: g });
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6d0, roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false });
  part(new THREE.CylinderGeometry(0.55, 0.55, 2.4, 16), glass, { at: [0, 0.75, 0], turn: [0, 0, Math.PI / 2], shadow: false, into: g });
  part(new THREE.CylinderGeometry(0.18, 0.5, 0.5, 16), glass, { at: [1.45, 0.75, 0], turn: [0, 0, -Math.PI / 2], shadow: false, into: g });
  part(S.disc, paint(0x9a6a3a, { rough: 0.9 }), { at: [1.85, 0.75, 0], size: [0.17, 0.3, 0.17], turn: [0, 0, Math.PI / 2], into: g });
  part(S.box, paint(0x2f5d72, { rough: 0.7 }), { at: [0, 0.32, 0], size: [2, 0.08, 0.8], shadow: false, into: g }); // painted sea
  part(S.box, paint(0x6b4426, { rough: 0.7 }), { at: [0, 0.45, 0], size: [1.2, 0.2, 0.32], into: g }); // the hull
  part(S.disc, wood, { at: [0, 0.8, 0], size: [0.02, 0.75, 0.02], into: g });
  for (const [y, w] of [[0.95, 0.5], [0.72, 0.62]]) part(S.box, paint(0xf3eee0, { rough: 0.9 }), { at: [0.02, y, 0], size: [0.03, 0.2, w], turn: [0, 0, 0.05], into: g });
  g.position.set(x, 0, z);
  g.rotation.y = -0.2;
  scene.add(g);
}

/** A brass telescope, drawn out, lying where the captain left it. */
function telescope(scene, x, z) {
  const S = shapes();
  const brass = paint(0xd2a046, { rough: 0.28, metal: 0.65 });
  const g = new THREE.Group();
  [[0.24, 1.3, 0], [0.19, 1.1, 1.05], [0.15, 0.9, 1.9]].forEach(([r, len, at]) => part(S.disc, brass, { at: [at, 0, 0], size: [r, len, r], turn: [0, 0, Math.PI / 2], into: g }));
  part(S.disc, paint(0x3a2414, { rough: 0.6 }), { at: [-0.1, 0, 0], size: [0.255, 0.7, 0.255], turn: [0, 0, Math.PI / 2], into: g }); // leather grip
  part(S.round, paint(0x0d1520, { rough: 0.05 }), { at: [-0.66, 0, 0], size: [0.2, 0.02, 0.2], turn: [0, 0, Math.PI / 2], into: g });
  g.position.set(x, 0.25, z);
  g.rotation.y = 0.35;
  scene.add(g);
}

/** A skull for a paperweight. Every proper pirate court has one. */
function skull(scene, x, z) {
  const S = shapes();
  const bone = paint(0xeee4c8, { rough: 0.8 });
  const dark = paint(0x1a1410, { rough: 1 });
  const g = new THREE.Group();
  part(S.smooth, bone, { at: [0, 0.5, 0], size: [0.48, 0.44, 0.52], into: g });
  part(S.box, bone, { at: [0, 0.18, 0.2], size: [0.42, 0.22, 0.34], into: g });
  for (const sx of [-0.17, 0.17]) part(S.smooth, dark, { at: [sx, 0.46, 0.4], size: [0.12, 0.11, 0.08], shadow: false, into: g });
  part(S.cone, dark, { at: [0, 0.32, 0.46], size: [0.05, 0.1, 0.03], turn: [0, 0, Math.PI], shadow: false, into: g });
  for (let i = 0; i < 5; i++) part(S.box, dark, { at: [-0.12 + i * 0.06, 0.16, 0.37], size: [0.012, 0.09, 0.012], shadow: false, into: g });
  g.position.set(x, 0, z);
  g.rotation.y = 0.5;
  scene.add(g);
}

/** Correspondence for the court: a few letters, tied up with string under a seal. */
function letters(scene, x, z) {
  const S = shapes();
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) part(S.box, paint([0xf1e3c0, 0xe6d3a6, 0xf6ead0, 0xdccaa0][i], { rough: 0.95 }), { at: [rand(-0.06, 0.06), 0.03 + i * 0.05, rand(-0.06, 0.06)], size: [1.5, 0.04, 1], turn: [0, rand(-0.15, 0.15), 0], into: g });
  part(S.box, paint(0x8a6440, { rough: 1 }), { at: [0, 0.2, 0], size: [1.56, 0.02, 0.05], into: g });
  part(S.box, paint(0x8a6440, { rough: 1 }), { at: [0, 0.2, 0], size: [0.05, 0.02, 1.06], into: g });
  part(S.round, paint(0x9e2219, { rough: 0.5 }), { at: [0, 0.23, 0], size: [0.2, 0.05, 0.2], into: g });
  g.position.set(x, 0, z);
  g.rotation.y = -0.25;
  scene.add(g);
}

function buildTrinkets(scene) {
  shipInABottle(scene, 2.2, -6.5);
  telescope(scene, 5.4, -6.4);
  skull(scene, -6.4, 5.5);
  letters(scene, -3.3, 5.3);
  return {
    cradle: newtonsCradle(scene, -9.5, -0.6, 0.12),
    globe: globe(scene, -4.6, -6.7),
    hourglass: hourglass(scene, 9.9, 1.4),
    watch: pocketWatch(scene, 3.8, 5.4),
  };
}

function init() {
  stage = createStage({ id: 'slLayer', background: 0x140c07, exposure: 1.05, fov: 30, overlay: '<div class="sl-vignette"></div>' });
  const { scene } = stage;

  scene.add(new THREE.HemisphereLight(0xffe2b8, 0x2a1a10, 0.55));
  const lamp = new THREE.DirectionalLight(0xffdcab, 1.7);
  lamp.position.set(-6, 18, 9);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  Object.assign(lamp.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12, near: 1, far: 60 });
  lamp.shadow.bias = -0.0006;
  lamp.shadow.radius = 5;
  scene.add(lamp);
  // A cool moonbeam from the cabin window, behind.
  const moon = new THREE.DirectionalLight(0x9fb8ff, 0.35);
  moon.position.set(8, 10, -14);
  scene.add(moon);

  // The judge's desk: dark oak, with a green leather writing surface set into it.
  const wood = planks(['#4a2c18', '#3f2513', '#4f301b', '#45291a']);
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  wood.repeat.set(4, 3);
  const top = part(shapes().flat, new THREE.MeshStandardMaterial({ map: wood, roughness: 0.7 }), { at: [0, 0, 0], size: [70, 1, 46], into: scene });
  top.castShadow = false;
  const baize = part(shapes().box, new THREE.MeshStandardMaterial({ color: 0x1f4a36, roughness: 1 }), { at: [0, 0.01, 0.2], size: [16.5, 0.02, 11.4], into: scene });
  baize.castShadow = false;
  const giltEdge = paint(0xb8862f, { rough: 0.4, metal: 0.3 });
  for (const [x, z, w, d] of [[0, -5.5, 16.6, 0.12], [0, 5.9, 16.6, 0.12], [-8.25, 0.2, 0.12, 11.5], [8.25, 0.2, 0.12, 11.5]]) part(shapes().box, giltEdge, { at: [x, 0.03, z], size: [w, 0.03, d], shadow: false, into: scene });

  book = buildBook(scene);
  gavel = buildGavel(scene);
  scales = buildScales(scene);
  buildProps(scene);
  trinkets = buildTrinkets(scene);

  stage.onFrame = frame;
  // The pages are written in the game's fonts; draw them again once those have loaded.
  Promise.all(['64px "IM Fell English"', 'italic 40px "IM Fell English"', '54px "Pirata One"', '78px "Cedarville Cursive"'].map((f) => document.fonts.load(f))).then(redrawPages, () => {});
}

// ---------------------------------------------------------------------------
// Moving things
// ---------------------------------------------------------------------------

function aim(shotName) {
  const s = SHOTS[shotName] ?? SHOTS.pick;
  camTo.target.set(...s.target);
  camTo.dist = s.dist;
  camTo.elevation = s.elevation;
  camTo.yaw = s.yaw;
}

function placeCamera(jx, jy) {
  const { target, dist, elevation, yaw } = cam;
  const flat = Math.cos(elevation) * dist;
  stage.camera.position.set(target.x + Math.sin(yaw) * flat + jx, target.y + Math.sin(elevation) * dist + jy, target.z + Math.cos(yaw) * flat);
  stage.camera.lookAt(target.x + jx * 0.5, target.y, target.z);
}

/** Bring the gavel down on its block: up, a pause, then a crack. */
function bang(times = 1) {
  for (let i = 0; i < times; i++) {
    const at = i * 0.55;
    stage.tween(0.28, (k) => (gavel.arm.rotation.z = gavel.rest - 0.75 * k), { delay: at, ease: easeOut });
    stage.tween(0.12, (k) => (gavel.arm.rotation.z = gavel.rest - 0.75 + 0.82 * k), {
      delay: at + 0.3,
      ease: easeIn,
      done: () => {
        shake = Math.max(shake, i === times - 1 ? 0.35 : 0.2);
        scales.wobble = 1;
      },
    });
    stage.tween(0.25, (k) => (gavel.arm.rotation.z = gavel.rest + 0.07 * (1 - k)), { delay: at + 0.42 });
  }
}

/** Write the truth into the book, a stroke at a time. */
function inkTheTruth(truth, fact) {
  page.truth = truth;
  page.fact = fact;
  page.inked = 0;
  book.rightTex.redraw();
  stage.tween(1.9, (k) => {
    page.inked = k;
    book.rightTex.redraw();
  }, { delay: 0.9, ease: linear });
}

function frame(dt, clock) {
  // Glide the camera towards the shot it should be on.
  const f = Math.min(1, dt * 2.2);
  cam.target.lerp(camTo.target, f);
  cam.dist += (camTo.dist - cam.dist) * f;
  cam.elevation += (camTo.elevation - cam.elevation) * f;
  cam.yaw += (camTo.yaw - cam.yaw) * f;
  shake *= Math.max(0, 1 - dt * 6);
  placeCamera(Math.sin(clock * 0.19) * 0.18 + rand(-1, 1) * shake, rand(-1, 1) * shake);

  candle.flicker(clock);
  room.tick(dt, playing);
  // The scales never quite settle; a bang sets them swinging.
  scales.wobble = (scales.wobble ?? 0) * Math.max(0, 1 - dt * 0.9);
  scales.beam.rotation.z = scales.aim * 0.18 + Math.sin(clock * 1.3) * 0.02 + Math.sin(clock * 5) * 0.12 * scales.wobble;
  for (const pan of scales.pans) pan.rotation.z = -scales.beam.rotation.z;

  // The desk toys: the cradle clacks, the globe turns, the sand runs, the watch ticks.
  const swing = Math.sin(clock * 4.2) * 0.55;
  trinkets.cradle[0].rotation.z = Math.min(0, swing);
  trinkets.cradle[4].rotation.z = Math.max(0, swing);
  trinkets.globe.rotation.y += dt * 0.25;
  pourSand(trinkets.hourglass, dt);
  trinkets.watch.rotation.y = -Math.floor(clock) * ((Math.PI * 2) / 60);
}

// ---------------------------------------------------------------------------
// The two functions host.js calls
// ---------------------------------------------------------------------------

export function show(v) {
  if (!stage) init();
  const opened = stage.open();
  playing = !v.paused;
  const fresh = v.key !== lastKey;
  lastKey = v.key;

  // A new question: write it into the book.
  const footer = `${v.roundLabel}${v.of > 1 ? ` · entry ${v.number} of ${v.of}` : ''}`;
  if (v.prompt !== page.prompt || opened) {
    Object.assign(page, { prompt: v.prompt, topic: v.topic, footer, truth: null, fact: null, inked: 0 });
    scales.aim = 0;
    redrawPages();
    if (!opened) turnHourglass(trinkets.hourglass);
  }
  aim(v.phase);
  if (opened) {
    cam.target.copy(camTo.target);
    Object.assign(cam, { dist: camTo.dist + 6, elevation: camTo.elevation, yaw: camTo.yaw });
  }
  if (!fresh) return;

  if (v.phase === 'lie') {
    // Every lie exposed tips the scales a little further, and gets one rap of the gavel.
    scales.aim = Math.max(-1, scales.aim - 0.35);
    bang(1);
  }
  if (v.phase === 'truth') {
    scales.aim = 1;
    inkTheTruth(v.truth, v.fact);
    stage.tween(0.01, () => bang(3), { delay: 2.9 });
  }
}

export function hide() {
  if (!stage?.close()) return;
  lastKey = null;
  page.prompt = '';
  shake = 0;
}

// ---------------------------------------------------------------------------
// The words host.js draws over the top
// ---------------------------------------------------------------------------

export function lawyerScreens({ anim, chip, progress }) {
  const chips = (ids, opts) => ids.map((id) => chip(id, opts)).join('');

  function letter(o, i, v) {
    const focus = v.focus === o.id;
    const cls = ['sl-letter', o.kind ?? 'sealed', focus ? 'focus' : '', v.focus !== undefined && !focus && v.phase === 'lie' ? 'dim' : ''].join(' ');
    let foot = '';
    if (o.kind === 'lie' || o.kind === 'house') {
      foot = `<div class="sl-by">${o.kind === 'house' ? '<em>The court’s own lie</em>' : `${chips(o.authors)}${o.gain ? `<span class="gain">+${fmt(o.gain)}</span>` : ''}`}</div>`;
    }
    if (o.kind === 'truth') foot = '<div class="sl-by"><em>The truth</em></div>';
    return `<div class="${cls}"${anim(`letter${o.id}`, 'pop', v.phase === 'pick' ? 200 + i * 90 : 0, 420)}>
      <span class="sl-wax">${o.kind === 'truth' ? '✓' : o.kind ? '✗' : '⚓'}</span>
      <p>${esc(o.text)}</p>
      ${o.pickers?.length && o.kind ? `<div class="sl-fell">${chips(o.pickers, { label: false })}</div>` : ''}
      ${foot}
    </div>`;
  }

  function docket(v) {
    const n = v.options.length;
    const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
    return `<div class="sl-docket" style="--cols:${cols}">${v.options.map((o, i) => letter(o, i, v)).join('')}</div>`;
  }

  function header(v) {
    return `<div class="sl-head"${anim('head', 'drop', 0, 500)}>
      <span class="sl-round">${esc(v.roundLabel)}${v.of > 1 ? ` · ${v.number} of ${v.of}` : ''}</span>
      ${v.mult > 1 ? `<span class="sl-mult">×${v.mult} doubloons</span>` : ''}
    </div>`;
  }

  function sl(v) {
    if (v.phase === 'write') {
      return `<div class="sl sl-write">
        ${header(v)}
        <div class="sl-foot"${anim('foot', 'rise', 600, 500)}>
          <p class="sl-lead">Write a convincing lie on your phone</p>
          ${progress(v.progress)}
        </div>
      </div>`;
    }

    if (v.phase === 'pick') {
      return `<div class="sl sl-pick">
        ${header(v)}
        <div class="sl-prompt parch"${anim('prompt', 'drop', 0, 500)}>${esc(v.prompt)}</div>
        ${docket(v)}
        <p class="hint">Which is the truth? Pick on your phone! <span class="tally">${v.voted.length} in</span></p>
      </div>`;
    }

    if (v.phase === 'lie') {
      const o = v.options.find((x) => x.id === v.focus);
      return `<div class="sl sl-lie">
        <div class="sl-prompt parch slim">${esc(v.prompt)}</div>
        ${docket(v)}
        <div class="sl-exhibit">
          <div class="sl-big parch"${anim('big', 'pop', 0, 450)}>
            <p class="sl-big-text">${esc(o.text)}</p>
            <div class="sl-big-fell"${anim('fell', 'rise', 700, 450)}><em>Believed by</em>${chips(o.pickers)}</div>
            <div class="sl-big-by"${anim('by', 'rise', 2300, 450)}>${o.kind === 'house' ? '<em>A lie planted by the court itself!</em>' : `<em>A lie, told by</em>${chips(o.authors)}<span class="gain">+${fmt(o.gain)}</span>`}</div>
            <div class="sl-stamp"${anim('stamp', 'slam', 1500, 500)}>LIE!</div>
          </div>
        </div>
      </div>`;
    }

    // The truth: it is written in the book; these are just who found it.
    const t = v.options.find((x) => x.id === v.focus);
    return `<div class="sl sl-truth">
      ${header(v)}
      <div class="sl-finders parch"${anim('finders', 'rise', 3300, 500)}>
        ${t.pickers.length ? `<em>Found the truth</em>${chips(t.pickers)}<span class="gain">+${fmt(t.gain)} each</span>` : '<em>Nobody found the truth. The court is ashamed of ye all.</em>'}
      </div>
    </div>`;
  }

  return { sl };
}
