// One-off asset builder. The results are already checked in under public/,
// so you only need to run this (npm run build:assets) if you want to change
// the map detail or swap the fonts.
//
//  - public/world.json : world coastlines + borders as compact SVG path data
//  - public/fonts/*    : the two web fonts, so the game works with no internet

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { feature, mesh } from 'topojson-client';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- map ----------
// Coordinates are stored as integers: longitude * SCALE, -latitude * SCALE
// (so "up" is north in SVG space). The client wraps them in scale(1/SCALE).
const SCALE = 20;

const landTopo = require('world-atlas/land-50m.json');
const countryTopo = require('world-atlas/countries-50m.json');

const land = feature(landTopo, landTopo.objects.land);
const borders = mesh(countryTopo, countryTopo.objects.countries, (a, b) => a !== b);

function lineToPath(points, close) {
  const pts = [];
  for (const [lon, lat] of points) {
    const x = Math.round(lon * SCALE);
    const y = Math.round(-lat * SCALE);
    const last = pts[pts.length - 1];
    if (!last || last[0] !== x || last[1] !== y) pts.push([x, y]);
  }
  if (close && pts.length > 1) {
    const [a, b] = [pts[0], pts[pts.length - 1]];
    if (a[0] === b[0] && a[1] === b[1]) pts.pop();
  }
  if (pts.length < (close ? 3 : 2)) return '';
  let d = `M${pts[0][0]},${pts[0][1]}l`;
  for (let i = 1; i < pts.length; i++) {
    d += `${pts[i][0] - pts[i - 1][0]},${pts[i][1] - pts[i - 1][1]} `;
  }
  return d.trimEnd() + (close ? 'z' : '');
}

function polygons(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

// The source data is "stitched" across the 180° line, so a ring can jump from
// +180 to -180 (Russia, Fiji, Antarctica). Drawn naively that leaves a stray
// line right across the map. Instead we unwrap each ring so it is continuous
// (it may poke past ±180), and draw a second copy shifted by 360° so the part
// that pokes out reappears on the other side.
function unwrap(ring) {
  const out = [[ring[0][0], ring[0][1]]];
  let offset = 0;
  for (let i = 1; i < ring.length; i++) {
    const jump = ring[i][0] - ring[i - 1][0];
    if (jump > 180) offset -= 360;
    else if (jump < -180) offset += 360;
    out.push([ring[i][0] + offset, ring[i][1]]);
  }
  // A ring that goes all the way round the globe (Antarctica) is closed off via the pole.
  const first = out[0];
  const last = out[out.length - 1];
  if (Math.abs(last[0] - first[0]) > 180) {
    const pole = first[1] < 0 ? -90 : 90;
    out.push([last[0], pole], [first[0], pole]);
  }
  return out;
}

function shifted(points, by) {
  return points.map(([lon, lat]) => [lon + by, lat]);
}

let landPath = '';
const geoms = land.type === 'FeatureCollection' ? land.features.map((f) => f.geometry) : [land.geometry];
for (const g of geoms) {
  for (const poly of polygons(g)) {
    for (const ring of poly) {
      const flat = unwrap(ring);
      const lons = flat.map((p) => p[0]);
      landPath += lineToPath(flat, true);
      if (Math.max(...lons) > 180) landPath += lineToPath(shifted(flat, -360), true);
      if (Math.min(...lons) < -180) landPath += lineToPath(shifted(flat, 360), true);
    }
  }
}

// Borders are plain lines, so those are simply cut wherever they jump across the map.
let borderPath = '';
for (const line of borders.coordinates) {
  let piece = [line[0]];
  for (let i = 1; i < line.length; i++) {
    if (Math.abs(line[i][0] - line[i - 1][0]) > 180) {
      borderPath += lineToPath(piece, false);
      piece = [];
    }
    piece.push(line[i]);
  }
  borderPath += lineToPath(piece, false);
}

fs.mkdirSync(path.join(root, 'public'), { recursive: true });
const out = path.join(root, 'public', 'world.json');
fs.writeFileSync(out, JSON.stringify({ scale: SCALE, land: landPath, borders: borderPath }));
console.log(`world.json  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);

// ---------- fonts ----------
const fonts = [
  '@fontsource/pirata-one/files/pirata-one-latin-400-normal.woff2',
  '@fontsource/im-fell-english/files/im-fell-english-latin-400-normal.woff2',
  '@fontsource/im-fell-english/files/im-fell-english-latin-400-italic.woff2',
  '@fontsource/cedarville-cursive/files/cedarville-cursive-latin-400-normal.woff2',
];
fs.mkdirSync(path.join(root, 'public', 'fonts'), { recursive: true });
for (const f of fonts) {
  const dest = path.join(root, 'public', 'fonts', path.basename(f));
  fs.copyFileSync(require.resolve(f), dest);
  console.log(`font        ${path.basename(f)}`);
}
