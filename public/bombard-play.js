// Bombard! on the phones: a flat, top-down version of the diorama on the TV.
// The board is one SVG picture, drawn fresh from whatever the server last sent.
//
// play.js owns the page; this file just supplies the three Bombard screens
// (which side you're on, aiming, and watching the volley) and handles taps.

import { esc, serverNow } from './common.js';

const T = 100; // one tile, in SVG units
const EDGE = 40; // the wooden frame around the sea

// The same paint scheme as the 3D models on the TV (see bombard-host.js).
export const LIVERY = {
  pirates: { hull: '#3d2b20', rail: '#1f1612', deck: '#8f6c47', sail: '#b8392d', flag: '#17151c' },
  navy: { hull: '#2a4f80', rail: '#e3b84f', deck: '#c9aa7b', sail: '#fff1c9', flag: '#c8372d' },
};
const KRAKEN = { skin: '#8a2f6f', dark: '#5a1d4b', spot: '#f2a9c4', eye: '#f7d154' };

/** Which paint a ship wears. In the Kraken hunt both navies sail together, told apart by name. */
export function liveryFor(sideId, name) {
  if (sideId === 'navy' || sideId === 'pirates') return sideId;
  return String(name ?? '').startsWith('HMS') ? 'navy' : 'pirates';
}

// A cheap, repeatable "random" number for a tile, so the fog looks the same on every redraw.
const rnd = (i, salt) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ---------------------------------------------------------------------------
// Drawing pieces from above. Every piece is drawn pointing the same way (bow
// to the left, stern to the right) inside one 100x100 tile; the caller turns it.
// ---------------------------------------------------------------------------

function shipPart({ seg, len }, c) {
  const bow = seg === 0;
  const stern = seg === len - 1;
  const hull = bow ? 'M101,26 L62,26 Q22,30 5,50 Q22,70 62,74 L101,74 Z' : stern ? 'M-1,26 L66,26 Q93,27 94,50 Q93,73 66,74 L-1,74 Z' : 'M-1,26 H101 V74 H-1 Z';
  const deck = bow ? 'M101,33 L63,33 Q31,36 19,50 Q31,64 63,67 L101,67 Z' : stern ? 'M-1,33 L64,33 Q85,34 86,50 Q85,66 64,67 L-1,67 Z' : 'M-1,33 H101 V67 H-1 Z';
  const planks = [41, 50, 59].map((y) => `<line x1="${bow ? 34 : 0}" y1="${y}" x2="${stern ? 80 : 100}" y2="${y}" stroke="rgba(60,35,10,.28)" stroke-width="1.5"/>`).join('');
  let rig;
  if (bow) {
    // The bowsprit and a jib.
    rig = `<line x1="4" y1="50" x2="60" y2="50" stroke="#4a3524" stroke-width="4" stroke-linecap="round"/>
      <path d="M22,50 L60,34 Q54,50 60,66 Z" fill="${c.sail}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>`;
  } else {
    // A mast and its square sail, bellying towards the bow.
    const x = stern ? 40 : 52;
    rig = `<line x1="${x}" y1="10" x2="${x}" y2="90" stroke="#4a3524" stroke-width="5" stroke-linecap="round"/>
      <path d="M${x},13 Q${x - 30},50 ${x},87 Q${x - 9},50 ${x},13 Z" fill="${c.sail}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
      <circle cx="${x}" cy="50" r="6.5" fill="#4a3524"/>`;
  }
  const cabin = stern ? `<rect x="64" y="38" width="20" height="24" rx="4" fill="${c.rail}" stroke="rgba(0,0,0,.4)" stroke-width="1.5"/><rect x="88" y="45" width="13" height="10" fill="${c.flag}" stroke="#fff8e4" stroke-width="1.2"/>` : '';
  return `<path d="${hull}" fill="${c.hull}" stroke="rgba(0,0,0,.55)" stroke-width="2"/>
    <path d="${hull}" fill="none" stroke="${c.rail}" stroke-width="3" opacity=".9" transform="translate(50 50) scale(.93) translate(-50 -50)"/>
    <path d="${deck}" fill="${c.deck}"/>${planks}${cabin}${rig}`;
}

function armPart({ seg, len }) {
  // One wiggling tentacle, fat at the shoulder and thin at the tip, cut into tiles.
  const last = seg === len - 1;
  const end = last ? 78 : 100;
  const top = [];
  const bottom = [];
  const suckers = [];
  for (let x = 0; x <= end; x += 10) {
    const along = (seg + x / 100) / len;
    const mid = 50 + 11 * Math.sin(Math.PI * (seg + x / 100));
    const half = 21 - 13 * along;
    top.push(`${x},${(mid - half).toFixed(1)}`);
    bottom.unshift(`${x},${(mid + half).toFixed(1)}`);
    if (x % 20 === 10) suckers.push(`<circle cx="${x}" cy="${mid.toFixed(1)}" r="${(half * 0.36).toFixed(1)}" fill="${KRAKEN.spot}" stroke="${KRAKEN.dark}" stroke-width="1.2"/>`);
  }
  const tipMid = 50 + 11 * Math.sin(Math.PI * (seg + end / 100));
  const tip = last ? `<circle cx="${end}" cy="${tipMid.toFixed(1)}" r="${(21 - 13 * ((seg + end / 100) / len)).toFixed(1)}" fill="${KRAKEN.skin}" stroke="${KRAKEN.dark}" stroke-width="2.5"/>` : '';
  return `${tip}<polygon points="${[...top, ...bottom].join(' ')}" fill="${KRAKEN.skin}" stroke="${KRAKEN.dark}" stroke-width="2.5" stroke-linejoin="round"/>${suckers.join('')}`;
}

function headPart({ seg }) {
  // The head is one big dome across four tiles; each tile shows its quarter.
  const cx = seg % 2 === 0 ? 100 : 0;
  const cy = seg < 2 ? 100 : 0;
  const eye = (dx) => `<circle cx="${cx + dx}" cy="${cy + 34}" r="15" fill="${KRAKEN.eye}" stroke="${KRAKEN.dark}" stroke-width="3"/><ellipse cx="${cx + dx}" cy="${cy + 34}" rx="4.5" ry="11" fill="#1a0d16"/>`;
  const spots = [[-52, -40, 9], [-22, -58, 6], [30, -48, 10], [56, -22, 6], [-60, 8, 5], [8, -24, 7]].map(([dx, dy, r]) => `<circle cx="${cx + dx}" cy="${cy + dy}" r="${r}" fill="${KRAKEN.dark}" opacity=".55"/>`).join('');
  return `<circle cx="${cx}" cy="${cy}" r="88" fill="${KRAKEN.skin}" stroke="${KRAKEN.dark}" stroke-width="4"/>
    <ellipse cx="${cx - 26}" cy="${cy - 34}" rx="34" ry="22" fill="#fff" opacity=".12"/>${spots}${eye(-36)}${eye(36)}`;
}

function knobPart() {
  // The Kraken's bonus knob: a warty lump with a shiny golden tip.
  return `<circle cx="50" cy="50" r="34" fill="${KRAKEN.skin}" stroke="${KRAKEN.dark}" stroke-width="3.5"/>
    <circle cx="50" cy="50" r="16" fill="${KRAKEN.eye}" stroke="${KRAKEN.dark}" stroke-width="2.5"/>
    <ellipse cx="45" cy="44" rx="6" ry="4" fill="#fff" opacity=".55"/>
    ${[[28, 36, 4], [70, 34, 3.5], [66, 70, 4.5], [32, 68, 3]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${KRAKEN.dark}" opacity=".6"/>`).join('')}`;
}

/** One revealed piece of something, in its tile. */
export function partSvg(part, sideId, name) {
  if (part.kind === 'head') return headPart(part);
  if (part.kind === 'knob') return knobPart();
  const inner = part.kind === 'arm' ? armPart(part) : shipPart(part, LIVERY[liveryFor(sideId, name)]);
  return `<g transform="rotate(${part.dir * 90} 50 50)">${inner}</g>`;
}

const HIT_X = `<g class="bb-x"><path d="M17,19 Q46,44 83,83 M84,17 Q54,48 16,82" stroke="#5c130d" stroke-width="19" stroke-linecap="round" fill="none" opacity=".55"/>
  <path d="M17,19 Q46,44 83,83 M84,17 Q54,48 16,82" stroke="#d63a2c" stroke-width="12" stroke-linecap="round" fill="none"/></g>`;
const MISS_X = `<g class="bb-miss"><circle cx="50" cy="50" r="27" fill="none" stroke="#e9f6f2" stroke-width="3" opacity=".45"/><circle cx="50" cy="50" r="15" fill="none" stroke="#e9f6f2" stroke-width="2.5" opacity=".35"/>
  <path d="M36,36 L64,64 M64,36 L36,64" stroke="#2b1b0f" stroke-width="6" stroke-linecap="round" opacity=".7"/></g>`;
const FLAMES = `<g class="bb-flames"><path d="M50,22 Q66,44 58,62 Q50,72 42,62 Q34,44 50,22 Z" fill="#ff8a1e"/><path d="M50,38 Q59,52 54,62 Q50,67 46,62 Q41,52 50,38 Z" fill="#ffe14a"/></g>`;

function fogSvg(i) {
  const puffs = [0, 1, 2, 3, 4]
    .map((n) => {
      const x = 14 + rnd(i, n) * 72;
      const y = 14 + rnd(i, n + 9) * 72;
      const r = 26 + rnd(i, n + 17) * 16;
      return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(0)}" fill="${n % 2 ? '#eef3f6' : '#d3dde4'}"/>`;
    })
    .join('');
  return `<rect x="-1" y="-1" width="102" height="102" fill="#bccad3"/>${puffs}`;
}

/**
 * The whole board.
 *   board:  what the server sent ({ cols, rows, tiles, pieces })
 *   sideId: whose waters these are ('pirates', 'navy' or 'kraken')
 *   aims / mates: this player's targets, and their side's
 */
export function boardSvg(board, sideId, { aims = [], mates = [], live = false } = {}) {
  const { cols, rows } = board;
  const w = cols * T;
  const h = rows * T;
  const at = (i) => `translate(${(i % cols) * T} ${Math.floor(i / cols) * T})`;
  const shot = new Map(board.tiles.map((t) => [t.i, t]));
  const pieces = new Map(board.pieces.map((p) => [p.id, p]));

  let sea = '';
  let fog = '';
  let marks = '';
  let taps = '';
  for (let i = 0; i < cols * rows; i++) {
    const tile = shot.get(i);
    if (!tile) {
      fog += `<g transform="${at(i)}">${fogSvg(i)}</g>`;
      if (live && !mates.some((m) => m.tile === i)) taps += `<rect class="bb-tap" data-act="bb-tile" data-id="${i}" transform="${at(i)}" width="100" height="100" fill="transparent"/>`;
      continue;
    }
    if (tile.hit) {
      const piece = pieces.get(tile.part.id);
      sea += `<g transform="${at(i)}" class="${piece?.sunk ? 'bb-sunk' : ''}">${partSvg(tile.part, sideId, piece?.name)}${piece?.sunk ? '' : FLAMES}</g>`;
      marks += `<g transform="${at(i)}">${HIT_X}</g>`;
    } else {
      marks += `<g transform="${at(i)}">${MISS_X}</g>`;
    }
  }

  let grid = '';
  for (let x = 1; x < cols; x++) grid += `<line x1="${x * T}" y1="0" x2="${x * T}" y2="${h}"/>`;
  for (let y = 1; y < rows; y++) grid += `<line x1="0" y1="${y * T}" x2="${w}" y2="${y * T}"/>`;

  let labels = '';
  for (let x = 0; x < cols; x++) labels += `<text x="${x * T + 50}" y="-12">${String.fromCharCode(65 + x)}</text>`;
  for (let y = 0; y < rows; y++) labels += `<text x="-20" y="${y * T + 62}">${y + 1}</text>`;

  const reticle = (i) => `<g transform="${at(i)}" class="bb-aimed"><circle cx="50" cy="50" r="33" class="edge"/><path d="M50,6 V30 M50,70 V94 M6,50 H30 M70,50 H94" class="edge"/><circle cx="50" cy="50" r="33"/><path d="M50,6 V30 M50,70 V94 M6,50 H30 M70,50 H94"/><circle cx="50" cy="50" r="8" class="dot"/></g>`;
  const mate = (m) =>
    `<g transform="${at(m.tile)}" class="bb-mate"><circle cx="50" cy="50" r="31" fill="${esc(m.color)}" stroke="#fff8e4" stroke-width="5"/><text x="50" y="66" text-anchor="middle" font-size="42">${esc(m.avatar)}</text></g>`;

  return `<svg class="bb-board" viewBox="${-EDGE} ${-EDGE} ${w + EDGE * 1.5} ${h + EDGE * 1.5}" data-side="${sideId}">
    <defs>
      <pattern id="bbWaves" width="100" height="50" patternUnits="userSpaceOnUse">
        <path d="M0,25 Q12,14 25,25 T50,25 T75,25 T100,25" fill="none" stroke="#fff" stroke-width="2.5" opacity=".13"/>
        <path d="M-25,48 Q-12,38 0,48 T25,48 T50,48 T75,48 T100,48" fill="none" stroke="#02141c" stroke-width="2.5" opacity=".14"/>
      </pattern>
      <clipPath id="bbSea"><rect width="${w}" height="${h}" rx="6"/></clipPath>
    </defs>
    <rect class="bb-frame" x="${-EDGE}" y="${-EDGE}" width="${w + EDGE * 1.5}" height="${h + EDGE * 1.5}" rx="16"/>
    <rect class="bb-lip" x="-7" y="-7" width="${w + 14}" height="${h + 14}" rx="10"/>
    <g class="bb-labels">${labels}</g>
    <g clip-path="url(#bbSea)">
      <rect class="bb-water" width="${w}" height="${h}"/>
      <rect width="${w}" height="${h}" fill="url(#bbWaves)"/>
      ${sea}
      <g class="bb-fog">${fog}</g>
      <g class="bb-grid">${grid}</g>
      ${marks}
      ${mates.map(mate).join('')}
      <g id="bbAims">${aims.map(reticle).join('')}</g>
      ${taps}
    </g>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

// Taps are shown straight away rather than waiting for the server to echo them back.
const local = { key: null, aims: [], at: 0 };

function currentAims(v) {
  if (local.key === v.key && Date.now() - local.at < 900 && !v.locked) return local.aims;
  return v.aims;
}

export const bombardScreens = {
  'bb-side'(v) {
    return `<div class="center bb-join" data-side="${esc(v.side)}">
      <div class="big-icon">${v.icon}</div>
      <p class="tiny">You have been pressed into the</p>
      <h1 class="title">${esc(v.name)}</h1>
      <p class="bb-go">${v.where === 'left' ? '⬅️ Go to the LEFT of the screen' : 'Go to the RIGHT of the screen ➡️'}</p>
      <p class="sub">${esc(v.mates)}</p>
    </div>`;
  },

  'bb-aim'(v) {
    const aims = currentAims(v);
    const full = aims.length >= v.need && aims.length > 0;
    const what = v.phase === 2 ? 'Find the Kraken in the fog' : `Fire on the ${esc(v.enemy.name)}`;
    let foot;
    if (v.locked) {
      foot = `<p class="locked">🔥 Fuse lit!</p><p class="tiny">${v.waiting.length ? `Waiting for ${esc(v.waiting.slice(0, 3).join(', '))}${v.waiting.length > 3 ? '…' : ''}` : 'Stand by…'}</p>`;
    } else if (v.need === 0) {
      foot = '<p class="tiny">Nothing left to shoot at. Stand easy.</p>';
    } else {
      foot = `<p class="tiny" id="bbHint">${v.guns > 1 ? `You have ${v.guns} guns this round: pick ${v.need} tiles.` : 'Tap a tile in the fog to take aim.'}</p>
        <button class="btn" id="bbFire" data-act="bb-fire" ${full ? '' : 'disabled'}>Light the fuse!</button>`;
    }
    return `<div class="fill bb-aim" data-side="${esc(v.side)}">
      <p class="heading light">${v.enemy.icon} ${what}</p>
      <div class="bb-slot">${boardSvg(v.board, v.enemy.id, { aims, mates: v.mates, live: !v.locked && v.need > 0 })}</div>
      <div class="bb-foot">${foot}</div>
    </div>`;
  },

  'bb-watch'(v) {
    const elapsed = serverNow() - v.t0;
    const notes = v.notes
      .map(
        (n) => `<div class="bb-note ${esc(n.tone ?? '')}" style="animation-delay:${Math.round(n.at - elapsed)}ms">
          <div class="big-icon">${n.icon}</div>
          <h1 class="title small">${esc(n.text)}</h1>
          <p class="sub">${esc(n.sub ?? '')}</p>
        </div>`,
      )
      .join('');
    return `<div class="bb-watch">
      <div class="center"><div class="big-icon">🔭</div><h1 class="title small">Guns away!</h1><p class="sub">Watch the big screen…</p></div>
      ${notes}
    </div>`;
  },
};

/** A tap on the board or the fire button. `send` posts to the server. */
export function bombardTap(act, id, view, send) {
  if (view?.screen !== 'bb-aim' || view.locked) return;
  if (act === 'bb-fire') {
    const button = document.getElementById('bbFire');
    if (button) {
      button.disabled = true;
      button.textContent = 'Lighting…';
    }
    navigator.vibrate?.(60);
    return send({ type: 'bb-fire', key: view.key });
  }
  if (act !== 'bb-tile') return;
  const tile = Number(id);
  let aims = [...currentAims(view)];
  if (aims.includes(tile)) aims = aims.filter((t) => t !== tile);
  else aims.push(tile);
  aims = aims.slice(-view.guns);
  Object.assign(local, { key: view.key, aims, at: Date.now() });

  // Redraw just the board, so the reticle moves under the finger at once.
  const slot = document.querySelector('.bb-slot');
  if (slot) slot.innerHTML = boardSvg(view.board, view.enemy.id, { aims, mates: view.mates, live: true });
  const button = document.getElementById('bbFire');
  if (button) button.disabled = !(aims.length >= view.need && aims.length > 0);
  navigator.vibrate?.(12);
  send({ type: 'bb-aim', key: view.key, tiles: aims });
}

// Buzz the phone when each of this player's results comes up on the TV.
let buzzers = [];

/** Called by play.js after every redraw. */
export function bombardShown(v) {
  document.body.dataset.bbSide = v.game === 'bombard' ? (v.side ?? document.body.dataset.bbSide ?? '') : '';
  for (const timer of buzzers) clearTimeout(timer);
  buzzers = [];
  if (v.screen !== 'bb-watch' || !navigator.vibrate) return;
  const elapsed = serverNow() - v.t0;
  for (const note of v.notes) {
    const wait = note.at - elapsed;
    if (wait > -200) buzzers.push(setTimeout(() => navigator.vibrate(note.tone === 'bad' ? [220] : note.tone === 'good' ? [50, 60, 50] : [25]), Math.max(0, wait)));
  }
}
