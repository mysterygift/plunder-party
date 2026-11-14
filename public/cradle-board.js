// Cradle to Kraken: the board, shared by the server (which moves the ships) and
// the big screen (which lays it out in 3D). Plain data and arithmetic only.
//
// The route is a run of segments. Each letter in `spaces` is one space:
//
//   $ fortune        x misfortune      g grog (a drink)     r raid (pick a rival)
//   f fate card      t tavern tale     c new crew           k kraken (lose crew)
//   m treasure map   p share-out (paid when you pass it, and on landing)
//
// and the capital letters are landmarks:
//
//   S the start      T Tortuga (propose to a crewmate)      F a fork in the route
//   Y the shipyard   E the Kraken's Lair (the end: retire)
//
// Forks and the end halt every ship that reaches them (STOPS). Tortuga, the
// shipyard and share-outs catch every ship that sails past (CATCH), so nobody
// misses a wedding or a new ship for want of the right number.
//
// A fork's segment names the two branches it splits into; both branches run on
// into the same segment. `risky` branches are shorter, but their stakes are doubled.
// `way` is where the segment runs on the big screen's table (x to the right,
// z towards the camera), used only by layout().

export const SEGMENTS = [
  { id: 'cove', name: 'Cradle Cove', stage: 1, spaces: 'S$gtpc$rgxp', way: [[-50, 34], [-40, 39], [-28, 36], [-17, 29], [-5, 33], [4, 31]], next: 'tortuga' },
  { id: 'tortuga', name: 'Tortuga', stage: 1, spaces: 'T', way: [[11, 27]], next: 'strait' },
  { id: 'strait', name: 'Tortuga Strait', stage: 2, spaces: 'gtm$r', way: [[18, 28], [27, 25], [34, 18], [37, 11]], next: 'fork1' },
  { id: 'fork1', name: 'The Devil’s Fork', stage: 2, spaces: 'F', way: [[37, 5]], fork: ['deep', 'lanes'] },
  { id: 'deep', name: 'Kraken Deep', stage: 2, risky: true, spaces: 'kr$kf', way: [[31, 1], [24, -2], [16, -3]], next: 'open', blurb: 'Shorter, but the stakes are doubled' },
  { id: 'lanes', name: 'Merchant Lanes', stage: 2, spaces: '$pmc$tpg', way: [[44, 0], [47, -8], [40, -14], [29, -13], [19, -9]], next: 'open', blurb: 'The long way round: steady trade, two share-outs' },
  { id: 'open', name: 'The Open Sea', stage: 3, spaces: 'f$rtp', way: [[11, -6], [2, -4], [-8, -2], [-17, -1]], next: 'yard' },
  { id: 'yard', name: 'The Shipyard', stage: 3, spaces: 'Y', way: [[-24, -2]], next: 'coast' },
  { id: 'coast', name: 'Corsair Coast', stage: 4, spaces: '$crtpgx', way: [[-31, -4], [-40, -9], [-46, -17], [-43, -25], [-34, -29], [-26, -30]], next: 'fork2' },
  { id: 'fork2', name: 'Treasure Fork', stage: 4, spaces: 'F', way: [[-20, -32]], fork: ['skull', 'gov'] },
  { id: 'skull', name: 'Skull Island', stage: 4, risky: true, spaces: 'k$r$g', way: [[-14, -38], [-6, -41], [2, -40]], next: 'reach', blurb: 'Shorter, but the stakes are doubled' },
  { id: 'gov', name: 'Governor’s Waters', stage: 4, spaces: 'p$cmtp', way: [[-14, -27], [-5, -24], [3, -27], [7, -33]], next: 'reach', blurb: 'The long way round, past the fort: two share-outs' },
  { id: 'reach', name: 'Old Salt’s Reach', stage: 5, spaces: 'g$tprk', way: [[10, -39], [18, -42], [26, -40], [33, -43], [38, -48]], next: 'lair' },
  { id: 'lair', name: 'The Kraken’s Lair', stage: 5, spaces: 'E', way: [[44, -52]] },
];

export const STOPS = new Set(['F', 'E']);
export const CATCH = new Set(['T', 'Y', 'p']);

export const KINDS = {
  $: { name: 'Fortune', icon: '💰', colour: '#e8b53a' },
  x: { name: 'Misfortune', icon: '💀', colour: '#5a5f6b' },
  g: { name: 'Grog', icon: '🍺', colour: '#c8641e' },
  r: { name: 'Raid', icon: '⚔️', colour: '#b3271e' },
  f: { name: 'Fate', icon: '🃏', colour: '#6b45a8' },
  t: { name: 'Tavern Tale', icon: '🎙️', colour: '#d85a8a' },
  c: { name: 'New Crew', icon: '🧑‍🤝‍🧑', colour: '#3d9a5b' },
  k: { name: 'Kraken', icon: '🐙', colour: '#2a3f7a' },
  m: { name: 'Treasure Map', icon: '🗺️', colour: '#b98a4a' },
  p: { name: 'Share-out', icon: '🪙', colour: '#f2d16b' },
  S: { name: 'Cradle Cove', icon: '⚓', colour: '#e9dcc0' },
  T: { name: 'Tortuga', icon: '💍', colour: '#f08ab0' },
  F: { name: 'A fork', icon: '🪧', colour: '#e9dcc0' },
  Y: { name: 'The Shipyard', icon: '🔨', colour: '#e9dcc0' },
  E: { name: 'The Kraken’s Lair', icon: '🐙', colour: '#e9dcc0' },
};

/**
 * The board as a list of spaces:
 *   { i, t: letter, seg: segment id, stage, risky, next: [space index, ...] }
 * Every space has one `next`, except a fork (two, in the order of its `fork`) and the end (none).
 */
export function buildBoard() {
  const spaces = [];
  const first = {};
  for (const seg of SEGMENTS) {
    first[seg.id] = spaces.length;
    for (const t of seg.spaces) spaces.push({ i: spaces.length, t, seg: seg.id, stage: seg.stage, risky: !!seg.risky, next: [] });
  }
  for (const seg of SEGMENTS) {
    const from = first[seg.id];
    for (let k = 0; k < seg.spaces.length - 1; k++) spaces[from + k].next = [from + k + 1];
    const last = spaces[from + seg.spaces.length - 1];
    if (seg.fork) last.next = seg.fork.map((id) => first[id]);
    else if (seg.next) last.next = [first[seg.next]];
  }
  return spaces;
}

export const segmentOf = (id) => SEGMENTS.find((s) => s.id === id);

// ---------------------------------------------------------------------------
// Where each space sits on the table (for the big screen)
// ---------------------------------------------------------------------------

/** A point on a Catmull-Rom curve through `pts` (an array of [x, z]) at t in 0..1 per span. */
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
}

/** A smooth line through the points, sampled finely: [[x, z], ...]. */
function smooth(pts, per = 24) {
  if (pts.length < 2) return pts.slice();
  const out = [];
  const at = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let s = 0; s < per; s++) out.push(catmull(at(i - 1), at(i), at(i + 1), at(i + 2), s / per));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** n points spaced evenly along a polyline, including both ends. */
function spread(line, n) {
  if (n === 1) return [line[0]];
  const lens = [0];
  for (let i = 1; i < line.length; i++) lens.push(lens[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const total = lens[lens.length - 1];
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const want = (total * k) / (n - 1);
    while (j < lens.length - 2 && lens[j + 1] < want) j++;
    const f = (want - lens[j]) / Math.max(1e-6, lens[j + 1] - lens[j]);
    out.push([line[j][0] + (line[j + 1][0] - line[j][0]) * f, line[j][1] + (line[j + 1][1] - line[j][1]) * f]);
  }
  return out;
}

/**
 * Where every space goes: [[x, z], ...] by space index. A segment's spaces are
 * spread along a smooth line through its `way`; a single-space stop sits on its
 * one point. The line starts where the previous segment's last way point left off,
 * so the spacing runs on round each corner.
 */
export function layout() {
  const spots = [];
  const lastPoint = {};
  for (const seg of SEGMENTS) lastPoint[seg.id] = seg.way[seg.way.length - 1];
  const before = {}; // the point a segment carries on from
  for (const seg of SEGMENTS) {
    if (seg.next) before[seg.next] ??= lastPoint[seg.id];
    for (const id of seg.fork ?? []) before[id] = lastPoint[seg.id];
  }
  for (const seg of SEGMENTS) {
    const n = seg.spaces.length;
    if (n === 1) {
      spots.push(seg.way[0]);
      continue;
    }
    const start = before[seg.id];
    const line = smooth(start ? [start, ...seg.way] : seg.way);
    const pts = spread(line, start ? n + 1 : n);
    spots.push(...(start ? pts.slice(1) : pts));
  }
  return spots;
}
