// A small kit for the big screen's 3D dioramas, shared by Sea Lawyer, Parley
// and Message in a Bottle. It is the same recipe the dice table and the
// Bombard! battle use (see liars-host.js), lifted out so each new game only
// has to build its model and act out the views:
//
//   const stage = createStage({ id: 'slLayer', background: 0x1a110b });
//   stage.scene.add(...)              build the model once
//   stage.onFrame = (dt, clock) => {} anything that moves every frame
//   stage.open() / stage.close()      show and hide the layer (and its render loop)
//
// Everything is flat-shaded, so the models look hand-carved, like the others.
// World units are roughly "a hand's width"; y is up, z comes towards the camera.

import * as THREE from './vendor/three.module.min.js';
import { createLookPass } from './looks3d.js';

export { THREE };

export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const easeOut = (k) => 1 - (1 - k) ** 3;
export const easeIn = (k) => k ** 3;
export const easeInOut = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
export const backOut = (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;
export const linear = (k) => k;

const SHAPES = {};
/** The handful of shapes every model is carved from (made once, shared). */
export function shapes() {
  if (SHAPES.box) return SHAPES;
  SHAPES.box = new THREE.BoxGeometry(1, 1, 1);
  SHAPES.ball = new THREE.IcosahedronGeometry(1, 1);
  SHAPES.smooth = new THREE.IcosahedronGeometry(1, 3);
  SHAPES.cone = new THREE.ConeGeometry(1, 1, 7);
  SHAPES.disc = new THREE.CylinderGeometry(1, 1, 1, 20);
  SHAPES.round = new THREE.CylinderGeometry(1, 1, 1, 40);
  SHAPES.flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  SHAPES.upright = new THREE.PlaneGeometry(1, 1);
  SHAPES.halo = new THREE.RingGeometry(0.92, 1.12, 40).rotateX(-Math.PI / 2);
  return SHAPES;
}

// Lighting styles (looks.js) live in looks3d.js: every stage draws through a
// look pass, and every material takes part on its own. Tune a style for a
// stage with createStage({ looks: { knee, house, dither: {...} } }).
export { keepPlain } from './looks3d.js';

const paints = new Map();
/** A pot of paint. `glow` makes it light itself (flames, lamps, moonlight). */
export function paint(color, { glow = 0, rough = 0.75, metal = 0.02 } = {}) {
  const key = `${color}:${glow}:${rough}:${metal}`;
  if (!paints.has(key)) {
    paints.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: rough, metalness: metal, emissive: glow ? color : 0x000000, emissiveIntensity: glow }));
  }
  return paints.get(key);
}

/** Make one painted piece and (optionally) add it to a parent. */
export function part(geometry, material, { at = [0, 0, 0], size = [1, 1, 1], turn = [0, 0, 0], shadow = true, into = null } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...at);
  m.scale.set(...(Array.isArray(size) ? size : [size, size, size]));
  m.rotation.set(...turn);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  into?.add(m);
  return m;
}

/** A drawing on a canvas, to stick onto a model. `draw(ctx, w, h)` can be called again via texture.redraw(). */
export function decal(draw, w = 256, h = w) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.redraw = (fn = draw) => {
    ctx.clearRect(0, 0, w, h);
    fn(ctx, w, h);
    texture.needsUpdate = true;
  };
  texture.redraw();
  return texture;
}

/** Wrap text onto a canvas inside a box; returns the y below the last line. */
export function wrapText(ctx, text, x, y, maxWidth, lineHeight, { align = 'left', maxLines = 12 } = {}) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const tryLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(tryLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = tryLine;
  }
  if (line) lines.push(line);
  ctx.textAlign = align;
  for (const l of lines.slice(0, maxLines)) {
    ctx.fillText(l, x, y);
    y += lineHeight;
  }
  return y;
}

/** Wood grain, drawn once: planks of `tones`, scratched with grain lines. */
export function planks(tones = ['#573b24', '#4b321e', '#5d4129', '#523722'], size = 512) {
  return decal((c, s) => {
    c.fillStyle = '#3a2716';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < tones.length; i++) {
      c.fillStyle = tones[i];
      c.fillRect(0, (i * s) / tones.length, s, s / tones.length - 3);
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
  }, size);
}

/**
 * A full-window 3D layer that sits behind host.js's 1920x1080 stage.
 *   id          the layer's element id (style it in the game's CSS)
 *   background  the colour behind everything
 *   overlay     extra HTML laid over the canvas (a vignette, say)
 *   looks       this scene's tuning for the optional lighting styles (see looks3d.js):
 *               { knee, house: { light, fog, post }, dither: {...}, ... }
 */
export function createStage({ id, background = 0x101010, exposure = 1.1, fov = 30, overlay = '', looks = null }) {
  shapes();
  const layer = document.createElement('div');
  layer.id = id;
  layer.className = 'kit-layer';
  layer.hidden = true;
  layer.innerHTML = `${overlay}<div class="kit-labels"></div>`;
  document.getElementById('stage').before(layer);
  const labelsEl = layer.querySelector('.kit-labels');

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  layer.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.5, 400);

  const tweens = new Set();
  const stage = {
    layer,
    labelsEl,
    renderer,
    scene,
    camera,
    clock: 0,
    unit: 1,
    running: false,
    look: createLookPass(renderer, looks ?? {}),
    get looks() {
      return stage.look.tuning; // change it live, e.g. stage.looks.dither.bands = 3
    },
    onFrame: null, // (dt, clock) => {}
    onFit: null, // () => {} after the window changes size

    /** Run fn(eased, raw) every frame for `dur` seconds. */
    tween(dur, fn, { delay = 0, ease = easeOut, done = null } = {}) {
      const tw = { t: -delay, dur: Math.max(0.001, dur), fn, ease, done };
      tweens.add(tw);
      return tw;
    },
    clearTweens() {
      tweens.clear();
    },
    cancel(tw) {
      tweens.delete(tw);
    },

    // Split screen: set to [{ camera, x, y, w, h }] (fractions of the window, y from the top)
    // to draw the scene once per panel; null draws it whole through stage.camera.
    views: null,

    /** Where a point in the world appears in the window, in CSS pixels (seen through one panel, if split). */
    onScreen(point, panel = null) {
      const v = point.clone().project(panel?.camera ?? camera);
      const box = panel ?? { x: 0, y: 0, w: 1, h: 1 };
      return { x: (box.x + ((v.x + 1) / 2) * box.w) * window.innerWidth, y: (box.y + ((1 - v.y) / 2) * box.h) * window.innerHeight, behind: v.z > 1 };
    },

    /** An HTML label that follows a point in the world (call stage.pin each frame). */
    label(cls = '') {
      const el = document.createElement('div');
      el.className = `kit-label ${cls}`;
      labelsEl.append(el);
      return el;
    },
    pin(el, point, panel = null) {
      const { x, y } = stage.onScreen(point, panel);
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    },

    fit() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      stage.unit = Math.min(w / 1920, h / 1080); // one "TV pixel", the same scale host.js uses
      layer.style.setProperty('--u', stage.unit);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      stage.onFit?.();
    },

    open() {
      if (!layer.hidden) return false;
      layer.hidden = false;
      stage.fit();
      stage.running = true;
      last = performance.now();
      requestAnimationFrame(frame);
      return true;
    },
    close() {
      if (layer.hidden) return false;
      layer.hidden = true;
      stage.running = false;
      tweens.clear();
      return true;
    },
  };

  let last = 0;
  function frame(now) {
    if (!stage.running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    stage.clock += dt;
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
    stage.onFrame?.(dt, stage.clock);
    stage.look.render(scene, camera, stage.views);
  }

  window.addEventListener('resize', () => !layer.hidden && stage.fit());
  return stage;
}

/** A carved wooden pawn painted in a pirate's colour, with a bandana (the crew in Parley and Message in a Bottle). About 2.9 tall, facing +z. */
export function figure(colour) {
  const S = shapes();
  const g = new THREE.Group();
  const coat = paint(new THREE.Color(colour).getHex(), { rough: 0.55 });
  const wood = paint(0xc89a64, { rough: 0.6 });
  const dark = paint(new THREE.Color(colour).multiplyScalar(0.55).getHex(), { rough: 0.6 });
  part(S.round, dark, { at: [0, 0.14, 0], size: [0.72, 0.28, 0.72], into: g });
  part(new THREE.CylinderGeometry(0.34, 0.6, 1.7, 14), coat, { at: [0, 1.12, 0], into: g });
  part(S.round, wood, { at: [0, 2.02, 0], size: [0.42, 0.12, 0.42], into: g }); // the collar
  g.userData.head = part(S.smooth, wood, { at: [0, 2.48, 0], size: 0.47, into: g });
  g.userData.wood = wood;
  part(new THREE.SphereGeometry(0.49, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), dark, { at: [0, 2.52, 0], into: g }); // bandana
  part(S.ball, dark, { at: [-0.12, 2.7, -0.45], size: [0.12, 0.12, 0.2], into: g }); // its knot
  return g;
}

/** A soft warm light that flickers like a flame (call flicker(clock) each frame). */
export function flame(into, { at = [0, 0, 0], size = 1, strength = 40, reach = 16, colour = 0xffa64a } = {}) {
  const S = shapes();
  const tip = part(S.cone, paint(0xffc24a, { glow: 2.2 }), { at, size: [0.17 * size, 0.6 * size, 0.17 * size], shadow: false, into });
  const light = new THREE.PointLight(colour, strength, reach, 1.7);
  light.position.set(at[0], at[1] + 0.4 * size, at[2]);
  into.add(light);
  return {
    tip,
    light,
    flicker(clock, boost = 1) {
      const f = 0.85 + 0.15 * Math.sin(clock * 13) * Math.sin(clock * 7.3);
      light.intensity = strength * f * boost;
      tip.scale.y = 0.6 * size * f;
    },
  };
}

/** A palm tree: a leaning, ringed trunk, a crown of drooping fronds, and coconuts. */
export function palm(scene, x, z, lean = 0.2, height = 9, turn = 0) {
  const S = shapes();
  const g = new THREE.Group();
  const bark = [paint(0x6e5132, { rough: 0.9 }), paint(0x5c432a, { rough: 0.9 })];
  const segs = 9;
  let top = new THREE.Vector3();
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const x0 = Math.sin(t * 1.4) * lean * height * 0.5;
    const y0 = t * height;
    const r = 0.42 - t * 0.16;
    part(S.disc, bark[i % 2], { at: [x0, y0 + height / segs / 2, 0], size: [r, height / segs + 0.05, r], turn: [0, 0, -lean * 0.6 * t], into: g });
    top = new THREE.Vector3(x0, y0 + height / segs, 0);
  }
  const frond = paint(0x1f4a2a, { rough: 0.85 });
  const frondLight = paint(0x2c5e35, { rough: 0.85 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const leaf = new THREE.Group();
    leaf.position.copy(top);
    leaf.rotation.y = a;
    for (let j = 0; j < 5; j++) {
      const t = j / 4;
      part(S.box, j % 2 ? frond : frondLight, { at: [0.5 + t * 3.2, -t * t * 1.9, 0], size: [0.95, 0.06, 0.8 - t * 0.45], turn: [0, 0, -0.25 - t * 0.55], into: leaf });
    }
    g.add(leaf);
  }
  for (let i = 0; i < 3; i++) part(S.ball, paint(0x4a3420, { rough: 0.8 }), { at: [top.x + rand(-0.3, 0.3), top.y - 0.35, rand(-0.3, 0.3)], size: 0.3, into: g }); // coconuts
  g.position.set(x, 0, z);
  g.rotation.y = turn;
  scene.add(g);
  return g;
}

/** The same chip host.js draws, for labels that live in the 3D layer. */
export function chipHtml(p, esc, { label = true } = {}) {
  if (!p) return '';
  return `<span class="chip" style="--c:${esc(p.color)}"><span class="face"><span>${esc(p.avatar)}</span></span>${label ? `<span class="nm">${esc(p.name)}</span>` : ''}</span>`;
}
