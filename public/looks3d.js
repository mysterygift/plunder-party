// The lighting styles (looks.js) made real, for every 3D scene on the big screen.
//
// Two halves:
//   * Light patterns, done inside every lit material: the light falling on a
//     surface (never its paint) is cut into a few bands, and the seams between
//     bands are drawn with a pattern: a Bayer dither, pen hatching, cross-
//     hatching, stipple, halftone dots, or nothing at all (hard cel bands).
//     Fog can be stepped and dithered the same way. Glow is left alone, so
//     flames and lamps stay smooth.
//   * A screen pass, only when a style needs one: ink outlines (where depth
//     jumps or folds), a limited palette with ordered dither, paper grain, a
//     saturation push, and tilt-shift (to make a scene look like a model).
//
// Every scene draws through a pass:
//   const look = createLookPass(renderer, { knee: 2, house: { light: {...}, post: {...} } });
//   look.render(scene, camera)            instead of renderer.render(scene, camera)
//
// Sizes (cell, outline width) are in TV pixels: one pixel of the 1920x1080
// stage, so the patterns look the same from the sofa on any screen. They are
// kept fine and blended in (amount < 1); the first dither was too heavy-handed.
//
// The tuning object belongs to the game and can be changed live (a palette
// that turns green when the Kraken comes, say): it is read every frame.

import * as THREE from './vendor/three.module.min.js';
import { look } from './looks.js';

// ---------------------------------------------------------------------------
// The styles on the menu, as they look in a scene that hasn't tuned them.
// A game's tuning[id] is merged on top; tuning.house is that game's own look.
// ---------------------------------------------------------------------------
const PATTERNS = { bayer: 0, hatch: 1, cross: 2, stipple: 3, halftone: 4, cel: 5 };

export const STYLES = {
  dither: { light: { pattern: 'bayer', bands: 6, cell: 2, spread: 0.45, amount: 0.75 } },
  cel: { light: { pattern: 'cel', bands: 3, spread: 0.06, amount: 0.85, tint: 0x5b5f9e, tintAmount: 0.35 } },
  hatch: { light: { pattern: 'cross', bands: 4, cell: 2, spread: 1, amount: 0.7 } },
  stipple: { light: { pattern: 'stipple', bands: 5, cell: 2, spread: 0.8, amount: 0.7 } },
  halftone: { light: { pattern: 'halftone', bands: 4, cell: 3, spread: 1, amount: 0.7 } },
  outline: { post: { outline: { strength: 0.85, width: 1.5, colour: 0x1b130d, crease: 0.6 } } },
  palette: { post: { palette: { levels: 4, amount: 0.8, cell: 2 } } },
  tilt: { post: { tilt: { amount: 1, centre: 0.5, band: 0.2 } } },
  fog: { fog: { bands: 5, cell: 2 }, light: { pattern: 'bayer', bands: 6, cell: 2, spread: 0.45, amount: 0.4 } },
};

const LIGHT_DEFAULTS = { pattern: 'bayer', bands: 6, cell: 2, spread: 0.45, amount: 0.75, tint: 0xffffff, tintAmount: 0 };

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(a, b) {
  if (!isObj(b)) return b === undefined ? a : b;
  const out = { ...(isObj(a) ? a : {}) };
  for (const k of Object.keys(b)) out[k] = merge(out[k], b[k]);
  return out;
}

/** What the scene should look like right now (null = plain lighting). */
export function resolveLook(tuning = {}) {
  const id = look();
  if (id === 'plain') return null;
  const base = id === 'house' ? (tuning.house ?? STYLES.dither) : merge(STYLES[id], tuning[id]);
  if (!base) return null;
  const spec = { ...base };
  if (spec.light) spec.light = { ...LIGHT_DEFAULTS, knee: tuning.knee ?? 1, ...spec.light };
  return spec;
}

// ---------------------------------------------------------------------------
// The material half: one set of shared uniforms, set by whichever scene is
// drawing, and a hook every MeshStandardMaterial (and, for fog, every
// MeshBasicMaterial) picks up without anyone having to ask.
// ---------------------------------------------------------------------------
const U = {
  kStyle: { value: 0 }, // 0 = plain light
  kPattern: { value: 0 },
  kBands: { value: 6 },
  kCell: { value: 2 }, // device pixels
  kKnee: { value: 1 }, // light this bright sits halfway up the bands
  kSpread: { value: 0.45 }, // 1 = pattern everywhere, small = solid bands with patterned seams
  kAmount: { value: 0.75 }, // blend back toward smooth light
  kTint: { value: new THREE.Color(1, 1, 1) }, // the colour of the darkest band (cel's coloured shadows)
  kTintAmount: { value: 0 },
  kFogBands: { value: 0 },
  kFogCell: { value: 2 },
  // See-through occluders (pass.focus): whatever stands between the camera and
  // what it's looking at, or right up against the lens, dissolves into a stipple.
  kFade: { value: 0 },
  kFadeCam: { value: new THREE.Vector3() },
  kFadeTargets: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, // xyz = where, w = how big (world units)
  kFadeCount: { value: 0 },
  kFadeNear: { value: 0 }, // closer to the camera than this fades too; 0 = off
  kFadeCell: { value: 2 },
};

const COMMON_GLSL = /* glsl */ `
uniform float kStyle, kPattern, kBands, kCell, kKnee, kSpread, kAmount, kTintAmount, kFogBands, kFogCell;
uniform vec3 kTint;
uniform float kFade, kFadeCount, kFadeNear, kFadeCell;
uniform vec3 kFadeCam;
uniform vec4 kFadeTargets[8];
varying vec3 vKitWorld;
float kitBayer(vec2 p) {
  const float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  ivec2 i = ivec2(mod(floor(p), 4.0));
  return (m[i.x + i.y * 4] + 0.5) / 16.0;
}
float kitHash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}
// Dissolve this pixel if it hides the target (inside the cone from the camera to
// the target, and nearer than it) or sits right up against the lens. A faint
// stipple stays, so you can still tell something was there.
void kitFadeOut() {
  if (kFade < 0.5) return;
  vec3 toP = vKitWorld - kFadeCam;
  float a = 0.0;
  if (kFadeNear > 0.0) a = 1.0 - smoothstep(kFadeNear * 0.5, kFadeNear, length(toP));
  for (int i = 0; i < 8; i++) {
    if (float(i) >= kFadeCount) break;
    float R = kFadeTargets[i].w;
    vec3 seg = kFadeTargets[i].xyz - kFadeCam;
    float L = max(length(seg), 0.001);
    vec3 dir = seg / L;
    float along = dot(toP, dir);
    float off = length(toP - dir * along);
    float r = R * max(along, 0.0) / L; // the target's outline, as seen from the camera
    float hides = (1.0 - smoothstep(r * 0.75, r * 1.05 + 0.05, off)) * (1.0 - smoothstep(L - R * 0.9, L - R * 0.5, along)) * step(0.0, along);
    a = max(a, hides);
  }
  if (kitBayer(gl_FragCoord.xy / kFadeCell) < a * 0.82) discard;
}
float kitLine(float u) { return 1.0 - abs(fract(u) - 0.5) * 2.0; } // 1 on the pen line, 0 between
// The threshold for each pixel: where it is above the light, the pixel takes the band below.
float kitPattern(vec2 frag) {
  vec2 p = frag / kCell;
  if (kPattern < 0.5) return kitBayer(p);
  if (kPattern < 1.5) return kitLine((p.x + p.y) * 0.25);
  if (kPattern < 2.5) return max(kitLine((p.x + p.y) * 0.25), 0.65 * kitLine((p.x - p.y) * 0.25)); // the second pen only in the dark
  if (kPattern < 3.5) return kitHash(floor(p));
  if (kPattern < 4.5) {
    vec2 q = mat2(0.866, 0.5, -0.5, 0.866) * p / 3.0; // a screen of dots, turned 30 degrees like print
    return 1.0 - length(fract(q) - 0.5) * 1.4142;
  }
  return 0.5;
}
`;

const LIT_GLSL = /* glsl */ `
// Land light of brightness l on a band: x = how much to scale it by, y = which band (0..1).
vec2 kitBand(float l, float t) {
  if (l <= 1e-5) return vec2(1.0, 0.0);
  // Squeeze the HDR light into 0..bands, with more bands in the dark (the sqrt),
  // so moonlight and the far edge of a lamp's reach don't round down to black.
  float x = sqrt(l / (l + kKnee)) * kBands;
  float f = clamp((fract(x) - 0.5) / max(kSpread, 0.01) + 0.5, 0.0, 1.0);
  // The top band stops half a band short of "infinitely bright", or a flare blows out flat.
  float lv = min(floor(x) + step(t, f), kBands - 0.5) / kBands;
  float q = lv * lv;
  return vec2((kKnee * q / (1.0 - q)) / l, lv);
}
void kitLight(inout ReflectedLight r) {
#ifndef KIT_PLAIN
  if (kStyle < 0.5) return;
  const vec3 LUMA = vec3(0.299, 0.587, 0.114);
  float t = kitPattern(gl_FragCoord.xy);
  // Lamps, moon and sky together, so shadowed ground bands too...
  vec2 b = kitBand(dot(r.directDiffuse + r.indirectDiffuse, LUMA), t);
  vec3 k = vec3(mix(1.0, b.x, kAmount)) * mix(vec3(1.0), mix(kTint, vec3(1.0), b.y), kTintAmount);
  r.directDiffuse *= k;
  r.indirectDiffuse *= k;
  // ...and shine (a glint on the sea) bands on its own.
  r.directSpecular *= mix(1.0, kitBand(dot(r.directSpecular, LUMA), t).x, kAmount);
#endif
}
`;

const FOG_GLSL = /* glsl */ `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	if ( kFogBands > 0.5 ) { // stepped fog, dithered between steps
		float fx = fogFactor * kFogBands;
		fogFactor = ( floor( fx ) + step( kitBayer( gl_FragCoord.xy / kFogCell ), fract( fx ) ) ) / kFogBands;
	}
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;

const WORLD_VERT = /* glsl */ `
	vec4 kitW = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		kitW = batchingMatrix * kitW;
	#endif
	#ifdef USE_INSTANCING
		kitW = instanceMatrix * kitW;
	#endif
	vKitWorld = ( modelMatrix * kitW ).xyz;`;
function worldVaryings(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', 'varying vec3 vKitWorld;\nvoid main() {')
    .replace('#include <project_vertex>', `#include <project_vertex>${WORLD_VERT}`);
}
function litHook(shader) {
  Object.assign(shader.uniforms, U);
  worldVaryings(shader);
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', `${COMMON_GLSL}${LIT_GLSL}\nvoid main() {\n\tkitFadeOut();`)
    .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n\tkitLight( reflectedLight );')
    .replace('#include <fog_fragment>', FOG_GLSL);
}
function basicHook(shader) {
  Object.assign(shader.uniforms, U);
  worldVaryings(shader);
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', `${COMMON_GLSL}\nvoid main() {\n\tkitFadeOut();`)
    .replace('#include <fog_fragment>', FOG_GLSL);
}
// On the prototypes, so every material in every game takes part. (Plain light
// costs one uniform check; three.js caches the compiled shaders as usual.)
THREE.MeshStandardMaterial.prototype.onBeforeCompile = litHook;
THREE.MeshBasicMaterial.prototype.onBeforeCompile = basicHook;

/** Keep a material out of the light patterns (dice that must stay easy to read, say). */
export function keepPlain(material) {
  material.defines = { ...material.defines, KIT_PLAIN: '' };
  material.needsUpdate = true;
  return material;
}

/** One TV pixel, in the canvas's device pixels. */
function tvPixel(renderer) {
  const el = renderer.domElement;
  const w = el.clientWidth || window.innerWidth;
  const h = el.clientHeight || window.innerHeight;
  return Math.min(w / 1920, h / 1080) * renderer.getPixelRatio();
}
const cellPx = (cell, unit) => Math.max(1, Math.round(cell * unit));

function applyMaterialLook(spec, unit) {
  const l = spec?.light;
  U.kStyle.value = l ? 1 : 0;
  if (l) {
    U.kPattern.value = PATTERNS[l.pattern] ?? 0;
    U.kBands.value = l.bands;
    U.kCell.value = cellPx(l.cell, unit);
    U.kKnee.value = l.knee;
    U.kSpread.value = l.spread;
    U.kAmount.value = l.amount;
    U.kTint.value.setHex(l.tint, THREE.LinearSRGBColorSpace);
    U.kTintAmount.value = l.tintAmount;
  }
  const f = spec?.fog;
  U.kFogBands.value = f ? f.bands : 0;
  if (f) U.kFogCell.value = cellPx(f.cell ?? 2, unit);
}

/** See-through occluders: works in every lighting style, plain included. */
function applyFade(focus, camera, unit) {
  U.kFade.value = focus ? 1 : 0;
  if (!focus) return;
  U.kFadeCam.value.setFromMatrixPosition(camera.matrixWorld);
  // { target, radius } for one thing to keep in sight, or targets: [{ at, radius }] for up to 8.
  const list = focus.targets ?? (focus.target ? [{ at: focus.target, radius: focus.radius }] : []);
  U.kFadeCount.value = Math.min(8, list.length);
  list.slice(0, 8).forEach((x, i) => U.kFadeTargets.value[i].set(x.at.x, x.at.y, x.at.z, x.radius ?? 2));
  U.kFadeNear.value = focus.near ?? 0;
  U.kFadeCell.value = cellPx(2, unit);
}

// ---------------------------------------------------------------------------
// The screen half.
// ---------------------------------------------------------------------------
const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor, tDepth;
uniform vec2 uRes;
uniform float uUnit, uNear, uFar, uTime;
uniform float uOutline, uOutlineWidth, uCrease, uBoil;
uniform vec3 uOutlineColour;
uniform vec3 uPal[8];
uniform float uPalSize, uPalAmount, uLevels, uKeepRed, uPalCell;
uniform float uPaper, uSaturate;
uniform float uTilt, uTiltCentre, uTiltBand;
varying vec2 vUv;

float kitBayer(vec2 p) {
  const float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  ivec2 i = ivec2(mod(floor(p), 4.0));
  return (m[i.x + i.y * 4] + 0.5) / 16.0;
}
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float depthAt(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }

void main() {
  vec4 src = texture2D(tColor, vUv);
  if (uTilt > 0.0) { // tilt-shift: a band across the middle in focus, softening towards top and bottom
    float d = clamp((abs(vUv.y - uTiltCentre) - uTiltBand) / max(0.5 - uTiltBand, 0.01), 0.0, 1.0);
    float r = d * d * uTilt * uUnit * 7.0; // blur radius, device pixels
    if (r > 0.5) {
      vec3 sum = vec3(0.0);
      for (int i = 0; i < 24; i++) { // a sunflower of taps
        float fi = float(i);
        float a = fi * 2.39996;
        sum += texture2D(tColor, vUv + vec2(cos(a), sin(a)) * sqrt((fi + 0.5) / 24.0) * r / uRes).rgb;
      }
      src.rgb = sum / 24.0;
    }
  }
  float ink = 0.0;
  if (uOutline > 0.0) {
    vec2 uv = vUv;
    vec2 px = 1.0 / uRes;
    if (uBoil > 0.0) { // hand-drawn lines that redraw themselves a few times a second
      float fr = floor(uTime * uBoil);
      uv += (vec2(noise(vUv * 14.0 + fr * 7.13), noise(vUv * 14.0 - fr * 3.71)) - 0.5) * px * uUnit * 3.0;
    }
    vec2 o = px * max(1.0, uOutlineWidth * uUnit);
    float z = depthAt(uv);
    float zl = depthAt(uv - vec2(o.x, 0.0)), zr = depthAt(uv + vec2(o.x, 0.0));
    float zd = depthAt(uv - vec2(0.0, o.y)), zu = depthAt(uv + vec2(0.0, o.y));
    float edge = max(max(abs(zl - z), abs(zr - z)), max(abs(zd - z), abs(zu - z))) / z; // a jump: an outline
    float fold = (abs(zl + zr - 2.0 * z) + abs(zd + zu - 2.0 * z)) / z; // a bend: a crease
    ink = uOutline * max(smoothstep(0.03, 0.07, edge), uCrease * smoothstep(0.006, 0.02, fold));
  }

  gl_FragColor = vec4(src.rgb / max(src.a, 1e-4), 1.0); // (a see-through canvas comes back premultiplied)
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec3 c = clamp(gl_FragColor.rgb, 0.0, 1.0);
  float L = dot(c, vec3(0.299, 0.587, 0.114));
  c = clamp(mix(vec3(L), c, uSaturate), 0.0, 1.0);

  if (uPalAmount > 0.0) {
    float t = kitBayer(gl_FragCoord.xy / uPalCell);
    vec3 p;
    if (uPalSize > 1.5) { // a ramp of a few colours, darkest first, picked by brightness
      float x = clamp(L, 0.0, 1.0) * (uPalSize - 1.0);
      p = uPal[int(min(floor(x) + step(t, fract(x)), uPalSize - 1.0))];
    } else { // or just fewer shades of everything
      p = floor(c * uLevels + t) / uLevels;
    }
    float red = clamp((c.r - max(c.g, c.b)) * 4.0 - 0.6, 0.0, 1.0) * uKeepRed; // true reds can stay red (not browns)
    c = mix(c, p, uPalAmount * (1.0 - red));
  }
  if (uPaper > 0.0) { // grain and fibres, as if the scene were printed
    vec2 q = gl_FragCoord.xy / uUnit;
    float g = hash(floor(q)) * 0.6 + noise(q * vec2(0.015, 0.25)) * 0.4;
    c *= 1.0 - uPaper * g * 0.5;
  }
  c = mix(c, uOutlineColour, ink);
  gl_FragColor = vec4(c, max(src.a, ink));
}
`;

// Tune the style on screen from the big screen's console, live, e.g.
//   tuneLook({ light: { amount: 0.5, cell: 3 } })   or   tuneLook({ post: { palette: { amount: 0.4 } } })
// (it lasts until the page reloads; copy what you like into the game's tuning).
let active = null;
window.tuneLook = (tweaks = {}) => {
  if (!active) return 'No 3D scene on screen.';
  const id = look();
  if (id === 'plain') return 'Pick a lighting style first (💡 or L).';
  const t = active.tuning;
  if (id === 'house') t.house = merge(t.house ?? STYLES.dither, tweaks);
  else t[id] = merge(t[id] ?? {}, tweaks);
  return resolveLook(t);
};

const sRGB = (hex, into = new THREE.Color()) => into.setHex(hex, THREE.LinearSRGBColorSpace); // raw numbers, for after the colour conversion

/**
 * Draw a scene with the current lighting style.
 *   tuning.knee    how bright this scene's light is (1 = sun-and-sky; a bonfire at night is ~4)
 *   tuning.house   this game's own look: { light, fog, post }
 *   tuning[style]  adjustments to one of the menu styles for this scene
 */
export function createLookPass(renderer, tuning = {}) {
  let target = null;
  const uniforms = {
    tColor: { value: null },
    tDepth: { value: null },
    uRes: { value: new THREE.Vector2() },
    uUnit: { value: 1 },
    uNear: { value: 1 },
    uFar: { value: 100 },
    uTime: { value: 0 },
    uOutline: { value: 0 },
    uOutlineWidth: { value: 1.5 },
    uCrease: { value: 0.6 },
    uBoil: { value: 0 },
    uOutlineColour: { value: new THREE.Color() },
    uPal: { value: Array.from({ length: 8 }, () => new THREE.Color()) },
    uPalSize: { value: 0 },
    uPalAmount: { value: 0 },
    uLevels: { value: 4 },
    uKeepRed: { value: 0 },
    uPalCell: { value: 2 },
    uPaper: { value: 0 },
    uSaturate: { value: 1 },
    uTilt: { value: 0 },
    uTiltCentre: { value: 0.5 },
    uTiltBand: { value: 0.2 },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false, transparent: true });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const postScene = new THREE.Scene();
  postScene.add(quad);
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const size = new THREE.Vector2();
  const t0 = performance.now();

  function draw(scene, camera, views, into) {
    if (!views) {
      renderer.setRenderTarget(into);
      renderer.render(scene, camera);
      return;
    }
    // Split screen: one camera per panel ({ camera, x, y, w, h } as fractions, y from the top).
    const W = into ? size.x : window.innerWidth;
    const H = into ? size.y : window.innerHeight;
    renderer.setRenderTarget(into);
    renderer.setScissorTest(true);
    for (const p of views) {
      const rect = [p.x * W, (1 - p.y - p.h) * H, p.w * W, p.h * H]; // counted up from the bottom
      if (into) {
        into.viewport.set(...rect);
        into.scissor.set(...rect);
        into.scissorTest = true;
        renderer.setRenderTarget(into);
      } else {
        renderer.setViewport(...rect);
        renderer.setScissor(...rect);
      }
      renderer.render(scene, p.camera);
    }
    renderer.setScissorTest(false);
    if (into) {
      into.viewport.set(0, 0, W, H);
      into.scissor.set(0, 0, W, H);
      into.scissorTest = false;
    } else renderer.setViewport(0, 0, W, H);
  }

  return {
    tuning,
    /** What's being drawn this frame (null = plain), for a game that wants to know. */
    spec: null,
    /**
     * See-through occluders, null = off. { target: Vector3, radius, near }, or
     * { targets: [{ at, radius }], near } for up to 8 things to keep in sight:
     * anything between the camera and a target of that size dissolves into a
     * stipple, and so does anything nearer the camera than `near`.
     */
    focus: null,
    render(scene, camera, views = null) {
      active = this;
      const spec = resolveLook(this.tuning);
      this.spec = spec;
      const unit = tvPixel(renderer);
      applyMaterialLook(spec, unit);
      applyFade(this.focus, views?.[0]?.camera ?? camera, unit);
      const post = spec?.post;
      if (!post) {
        draw(scene, camera, views, null);
        return;
      }
      renderer.getDrawingBufferSize(size);
      if (!target || target.width !== size.x || target.height !== size.y) {
        target?.dispose();
        target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
        target.depthTexture = new THREE.DepthTexture(size.x, size.y);
      }
      draw(scene, camera, views, target);
      renderer.setRenderTarget(null);

      const cam = views?.[0]?.camera ?? camera;
      const o = post.outline;
      const pal = post.palette;
      Object.assign(uniforms.uRes.value, { x: size.x, y: size.y });
      uniforms.tColor.value = target.texture;
      uniforms.tDepth.value = target.depthTexture;
      uniforms.uUnit.value = unit;
      uniforms.uNear.value = cam.near;
      uniforms.uFar.value = cam.far;
      uniforms.uTime.value = (performance.now() - t0) / 1000;
      uniforms.uOutline.value = o ? (o.strength ?? 0.85) : 0;
      if (o) {
        uniforms.uOutlineWidth.value = o.width ?? 1.5;
        uniforms.uCrease.value = o.crease ?? 0.6;
        uniforms.uBoil.value = o.boil ?? 0;
        sRGB(o.colour ?? 0x1b130d, uniforms.uOutlineColour.value);
      }
      uniforms.uPalAmount.value = pal ? (pal.amount ?? 0.8) : 0;
      if (pal) {
        const colours = pal.colours ?? [];
        uniforms.uPalSize.value = Math.min(8, colours.length);
        colours.slice(0, 8).forEach((c, i) => sRGB(typeof c === 'number' ? c : c.getHex(), uniforms.uPal.value[i])); // hex, or a THREE.Color
        uniforms.uLevels.value = pal.levels ?? 4;
        uniforms.uKeepRed.value = pal.keepRed ?? 0;
        uniforms.uPalCell.value = cellPx(pal.cell ?? 2, unit);
      }
      uniforms.uPaper.value = post.paper ?? 0;
      uniforms.uSaturate.value = post.saturate ?? 1;
      const tilt = post.tilt;
      uniforms.uTilt.value = tilt ? (tilt.amount ?? 1) : 0;
      if (tilt) {
        uniforms.uTiltCentre.value = tilt.centre ?? 0.5; // up from the bottom of the screen
        uniforms.uTiltBand.value = tilt.band ?? 0.2; // half the height of the sharp band
      }
      renderer.render(postScene, postCamera);
    },
  };
}
