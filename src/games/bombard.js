// BOMBARD! - Pirates against the Navy, and then both against something worse.
//
// Part one: the crew is split into two sides, who go and stand on either side
// of the room. Each side has a fleet hidden in the fog. Every round, everybody
// picks a tile in the enemy's waters; then all the guns fire.
//   - Miss:  you take a swig.
//   - Hit:   nothing happens (yet).
//   - Sink:  the whole enemy side drinks.
// The battle ends when one side has no ships left.
//
// Part two: the Kraken. Everyone is on the same side now, firing into the fog
// to find its head and arms. Missing costs nothing, but after every volley the
// Kraken hits back.
//   - It hits a ship:   everyone takes a swig.
//   - It sinks a ship:  somebody goes down with it and is out of the game.
// Kill the Kraken to win. Lose every ship and it's Davy Jones for the lot of you.
//
// Board sizes, fleets and the Kraken's temper are in the tables just below.
// Timers, the drink and the ship names are in content/bombard.json.

import { shuffle, sample } from '../util.js';

export const meta = {
  id: 'bombard',
  name: 'Bombard!',
  icon: '💣',
  tagline: 'Pirates v. Navy v. something with tentacles',
  blurb: 'Two sides, two fleets hidden in the fog. Pick a tile and fire: miss and you drink, sink a ship and the other side drinks. Then the Kraken wakes up. Have a drink to hand.',
  min: 2,
  narrator: false, // the guns do the talking: no spoken lines in this game
};

// Timelines are worked out in "script time"; SPEED squeezes them the same way the engine squeezes its timers.
const SPEED = Number(process.env.SPEED) > 0 ? Number(process.env.SPEED) : 1;

/** Ship types, and how many tiles each takes up. */
export const KINDS = {
  frigate: { size: 4, label: 'frigate' },
  brigantine: { size: 3, label: 'brigantine' },
  sloop: { size: 2, label: 'sloop' },
  head: { size: 4, label: 'head' }, // the Kraken's head is a 2x2 block
  arm: { size: 0, label: 'tentacle' }, // arms come in several lengths
  knob: { size: 1, label: 'knob' }, // a single tile of bonus: hitting it pays out, but you needn't, to win
};

const F = 'frigate';
const B = 'brigantine';
const S = 'sloop';

/** Part one, by the number of guns each side fires per round. */
export const BATTLES = {
  2: { cols: 5, rows: 5, fleet: [F, B, S] },
  3: { cols: 6, rows: 6, fleet: [F, B, B, S] },
  4: { cols: 7, rows: 7, fleet: [F, F, B, B, S] },
  5: { cols: 8, rows: 7, fleet: [F, F, B, B, B, S, S] },
  6: { cols: 8, rows: 8, fleet: [F, F, B, B, B, S, S] },
};

/**
 * Part two, by the number of players. `arms` are tentacle lengths (the head is
 * always there too, and so is the bonus knob); they're short and kept well
 * apart, so the Kraken is scattered all over its lair. `strikes` is how many
 * times it lashes out per round; `cunning` is how often it goes back for a ship
 * it has already hurt. Tuned with pretend games (great wave included) so the
 * crew wins a bit more often than not, in about nine rounds or fewer.
 */
export const HUNTS = {
  2: { lair: [4, 4], arms: [2, 1], sea: [5, 5], fleet: [B, S, S], strikes: 2, cunning: 0.2 },
  3: { lair: [5, 5], arms: [2, 1], sea: [5, 5], fleet: [B, S, S], strikes: 2, cunning: 0.2 },
  4: { lair: [6, 5], arms: [2, 2, 1], sea: [5, 5], fleet: [F, B, S], strikes: 2, cunning: 0.55 },
  5: { lair: [6, 6], arms: [2, 2, 1, 1], sea: [5, 5], fleet: [F, B, S], strikes: 2, cunning: 0.6 },
  6: { lair: [7, 6], arms: [2, 2, 1, 1], sea: [6, 6], fleet: [F, B, B, S], strikes: 3, cunning: 0.45 },
  7: { lair: [7, 7], arms: [2, 2, 2, 1, 1], sea: [6, 6], fleet: [F, B, B, S], strikes: 3, cunning: 0.45 },
  8: { lair: [7, 7], arms: [2, 2, 2, 1, 1, 1], sea: [6, 6], fleet: [F, B, B, S], strikes: 3, cunning: 0.7 },
  9: { lair: [8, 7], arms: [2, 2, 2, 1, 1, 1], sea: [6, 6], fleet: [F, B, B, S, S], strikes: 3, cunning: 0.7 },
  10: { lair: [7, 7], arms: [2, 2, 2, 1, 1, 1], sea: [6, 6], fleet: [F, B, B, S, S], strikes: 4, cunning: 0.7 },
  11: { lair: [8, 7], arms: [2, 2, 2, 2, 1, 1, 1], sea: [6, 6], fleet: [F, B, B, S, S], strikes: 4, cunning: 0.8 },
  12: { lair: [8, 7], arms: [2, 2, 2, 2, 1, 1, 1], sea: [6, 6], fleet: [F, B, B, S, S], strikes: 5, cunning: 0.45 },
};

/** How many clear tiles the bits of Kraken try to keep between them, so it's scattered all over its lair. */
const KRAKEN_SPREAD = 2;

const POINTS = { hit: 100, sink: 200, victory: 300, krakenHit: 150, sever: 250, knob: 400, slain: 500 };

const DEFAULT_NAMES = {
  pirates: ['The Soggy Biscuit', 'The Unwashed', 'Plank You Very Much', 'The Angry Haddock', 'Rum for Improvement', 'The Crusty Barnacle', 'The Wet Sock', 'Sea You Later'],
  navy: ['HMS Pompous', 'HMS Insufferable', 'HMS Paperwork', 'HMS Stiff Upper Lip', 'HMS Regret', 'HMS Unsinkable', 'HMS Tea Break', 'HMS Mind Your Manners'],
};

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------
//
// A board is a grid of tiles numbered left to right, top to bottom. `pieces`
// are the things hidden on it (ships, or bits of Kraken). Each piece lists its
// tiles in order: bow to stern for a ship, shoulder to tip for a tentacle.

const STEP = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // which way a piece runs from its first tile: east, south, west, north

/**
 * Try to fit every piece onto the grid. Returns the tiles for each, or null.
 * `gap` is how many empty tiles must lie between pieces (0 lets them touch).
 */
function arrange(cols, rows, specs, gap) {
  const taken = new Set();
  const placed = [];
  const free = (x, y) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
    if (!gap) return !taken.has(y * cols + x);
    for (let dy = -gap; dy <= gap; dy++) {
      for (let dx = -gap; dx <= gap; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && taken.has(ny * cols + nx)) return false;
      }
    }
    return true;
  };

  for (const spec of specs) {
    let cells = null;
    let dir = 0;
    for (let attempt = 0; attempt < 80 && !cells; attempt++) {
      const x = Math.floor(Math.random() * cols);
      const y = Math.floor(Math.random() * rows);
      let spots;
      if (spec.kind === 'head') {
        dir = 0;
        spots = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
      } else {
        dir = Math.floor(Math.random() * 4);
        spots = Array.from({ length: spec.size }, (_, n) => [x + STEP[dir][0] * n, y + STEP[dir][1] * n]);
      }
      if (spots.every(([sx, sy]) => free(sx, sy))) cells = spots.map(([sx, sy]) => sy * cols + sx);
    }
    if (!cells) return null;
    for (const c of cells) taken.add(c);
    placed.push({ ...spec, cells, dir });
  }
  return placed;
}

/**
 * Scatter pieces at random. Tries for `spread` empty tiles between them, then
 * settles for one, then (if the sea is just too crowded) lets them touch.
 */
function scatter(cols, rows, specs, spread) {
  const order = [...specs].sort((a, b) => b.size - a.size); // big ones first: they are the hardest to fit
  const gaps = [...new Set([spread, Math.min(spread, 1), 0])];
  for (const gap of gaps) {
    for (let attempt = 0; attempt < 150; attempt++) {
      const placed = arrange(cols, rows, order, gap);
      if (placed) return placed;
    }
  }
  throw new Error(`Could not fit ${specs.length} pieces on a ${cols}x${rows} board.`);
}

const index = (board) => {
  board.at = new Map();
  for (const piece of board.pieces) for (const c of piece.cells) board.at.set(c, piece);
};

/**
 * Build a board with the given pieces scattered at random.
 *   specs:  [{ kind, size, name }]
 *   open:   true if everybody can see what is on it (the fleet in part two)
 *   spread: how many empty tiles to try to leave between pieces
 */
export function makeBoard(cols, rows, specs, { open = false, spread = 1 } = {}) {
  const placed = scatter(cols, rows, specs, spread);
  const pieces = placed.map((p, id) => ({ id, kind: p.kind, name: p.name ?? null, cells: p.cells, dir: p.dir, hits: new Set(), sunk: false }));
  const board = { cols, rows, open, pieces, shots: new Map(), wave: 0 };
  index(board);
  return board;
}

/**
 * The great wave: everything still afloat swims off somewhere new, its wounds
 * healed, and the whole board goes back under the fog. What was sunk stays gone.
 */
export function rehide(board, spread = 1) {
  const alive = board.pieces.filter((p) => !p.sunk);
  const placed = scatter(board.cols, board.rows, alive.map((p) => ({ kind: p.kind, size: p.cells.length, id: p.id })), spread);
  for (const spot of placed) {
    const piece = board.pieces[spot.id];
    piece.cells = spot.cells;
    piece.dir = spot.dir;
    piece.hits = new Set();
  }
  for (const piece of board.pieces) if (piece.sunk) piece.cells = [];
  board.shots = new Map();
  board.wave++;
  index(board);
}

const partOf = (piece, tile) => ({ id: piece.id, kind: piece.kind, seg: piece.cells.indexOf(tile), len: piece.cells.length, dir: piece.dir });
const wholeOf = (piece) => ({ id: piece.id, kind: piece.kind, name: piece.name, cells: piece.cells, dir: piece.dir });

/** Fire on a tile. Returns what happened, and marks the board. */
export function strike(board, tile) {
  const piece = board.at.get(tile) ?? null;
  board.shots.set(tile, { hit: !!piece });
  if (!piece) return { tile, hit: false, part: null, sunk: null };
  piece.hits.add(tile);
  const sunk = !piece.sunk && piece.hits.size === piece.cells.length;
  if (sunk) piece.sunk = true;
  return { tile, hit: true, part: partOf(piece, tile), sunk: sunk ? wholeOf(piece) : null };
}

export const afloat = (board) => board.pieces.filter((p) => !p.sunk);
/** The bits of Kraken that still have to go before it's dead. The knob is a bonus, not one of them. */
const vitals = (board) => afloat(board).filter((p) => p.kind !== 'knob');
const untouched = (board) => Array.from({ length: board.cols * board.rows }, (_, i) => i).filter((i) => !board.shots.has(i));
const coord = (board, tile) => `${String.fromCharCode(65 + (tile % board.cols))}${Math.floor(tile / board.cols) + 1}`;

/** What the screens are allowed to know about a board. */
function boardView(board) {
  return {
    cols: board.cols,
    rows: board.rows,
    open: board.open,
    wave: board.wave, // goes up each time the board is wiped and hidden again
    tiles: [...board.shots].map(([i, shot]) => (shot.hit ? { i, hit: true, part: partOf(board.at.get(i), i) } : { i, hit: false })),
    pieces: board.pieces.map((p) => ({
      id: p.id,
      kind: p.kind,
      len: p.cells.length,
      sunk: p.sunk,
      hits: board.open || p.sunk ? p.hits.size : undefined,
      ...(board.open || p.sunk ? { name: p.name, cells: p.cells, dir: p.dir } : {}),
    })),
  };
}

/** Where the Kraken strikes next: sometimes back at a wounded ship, otherwise anywhere. */
export function krakenTarget(board, cunning) {
  const open = untouched(board);
  if (open.length === 0) return null;
  const wounded = [];
  for (const piece of afloat(board)) {
    for (const hit of piece.hits) {
      const x = hit % board.cols;
      const y = Math.floor(hit / board.cols);
      for (const [dx, dy] of STEP) {
        const nx = x + dx;
        const ny = y + dy;
        const n = ny * board.cols + nx;
        if (nx >= 0 && ny >= 0 && nx < board.cols && ny < board.rows && !board.shots.has(n)) wounded.push(n);
      }
    }
  }
  return wounded.length && Math.random() < cunning ? sample(wounded) : sample(open);
}

// ---------------------------------------------------------------------------
// The game
// ---------------------------------------------------------------------------

export async function run(ctx) {
  const content = ctx.content.bombard ?? {};
  const drink = content.drink || 'rum';
  const names = { pirates: content.pirateShips ?? DEFAULT_NAMES.pirates, navy: content.navyShips ?? DEFAULT_NAMES.navy };
  const game = { ctx, drink, names, swigs: new Map(ctx.players.map((p) => [p, 0])), volleys: 0 };

  await ctx.intro([
    'You’ll be split into Pirates and Navy. Each side has a fleet hidden in the fog.',
    `Every round, pick a tile in the enemy’s waters. Miss, and you take a swig of ${drink}.`,
    'Sink a ship and the whole enemy side drinks.',
    'Last fleet afloat wins. And then… well. You’ll see.',
  ]);

  const sides = await pickSides(game);
  const winner = await seaBattle(game, sides);
  await battleOver(game, sides, winner);
  const slain = await krakenHunt(game);
  await finale(game, slain);
  await ctx.gameOver();
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const listNames = (players) => {
  const n = players.map((p) => p.name);
  return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
};

/** Hand out ship names from a list, making more up if the list runs dry. */
function christen(kinds, pool) {
  const deck = shuffle(pool);
  return kinds.map((kind, i) => ({ kind, size: KINDS[kind].size, name: deck[i] ?? `${deck[i % deck.length]} the Second` }));
}

// ----- sides -----

async function pickSides(game) {
  const { ctx } = game;
  const order = shuffle(ctx.players);
  // With an odd number, a coin toss decides which side gets the extra hand.
  const cut = Math.random() < 0.5 ? Math.ceil(order.length / 2) : Math.floor(order.length / 2);
  const a = order.slice(0, cut);
  const b = order.slice(cut);
  const guns = Math.max(2, a.length, b.length);
  const plan = BATTLES[Math.min(6, guns)];

  const make = (id, name, icon, crew, where) => ({
    id,
    name,
    icon,
    crew,
    where,
    guns,
    board: makeBoard(plan.cols, plan.rows, christen(plan.fleet, game.names[id])),
  });
  const sides = [make('pirates', 'Pirates', '🏴‍☠️', a, 'left'), make('navy', 'Navy', '⚓', b, 'right')];
  game.sides = sides;

  ctx.screen({
    sfx: 'bbQuarters',
    host: () => ({ ...scene(game, 1, sides), key: 'bb-sides', mode: 'sides', headline: 'Choose your side? No. It’s been chosen.', sub: 'Pirates to the LEFT of the screen · Navy to the RIGHT' }),
    player: (p) => {
      const side = sides.find((s) => s.crew.includes(p));
      const mates = side.crew.filter((q) => q !== p);
      return {
        screen: 'bb-side',
        key: 'bb-sides',
        side: side.id,
        name: side.name,
        icon: side.icon,
        where: side.where,
        mates: mates.length ? `With ${listNames(mates)}` : 'A crew of one. Brave.',
      };
    },
  });
  await ctx.wait(13000);
  return sides;
}

/** The parts of the TV's view that every Bombard screen shares. */
function scene(game, phase, sides) {
  return {
    screen: 'bombard',
    phase,
    drink: game.drink,
    sides: sides.map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      crew: s.crew.map((p) => p.id),
      lost: (s.lost ?? []).map((p) => p.id),
      board: boardView(s.board),
    })),
  };
}

// ----- one round of aiming, shared by both parts -----

/**
 * Everybody picks their tiles.
 *   gunners: [{ player, side, target, guns }] where side/target are indexes into `sides`
 * Returns the same list with `tiles` filled in ({ tile, auto }).
 */
async function takeAim(game, phase, sides, round, gunners, { headline }) {
  const { ctx } = game;
  const key = `bb-${phase}-${round}`;
  const orders = new Map(gunners.map((g) => [g.player, { ...g, aims: [], locked: false }]));

  const spokenFor = (order) => {
    const set = new Set();
    for (const other of orders.values()) if (other !== order && other.target === order.target) for (const t of other.aims) set.add(t);
    return set;
  };
  const roomFor = (order) => {
    const board = sides[order.target].board;
    const taken = spokenFor(order);
    return untouched(board).filter((t) => !taken.has(t)).length;
  };
  const need = (order) => Math.min(order.guns, roomFor(order));
  const ready = (order) => order.locked || ctx.away(order.player) || need(order) === 0;

  ctx.screen({
    sfx: 'bbRunOut',
    host: () => ({
      ...scene(game, phase, sides),
      key,
      mode: 'aim',
      round,
      music: phase === 2 ? 'kraken' : 'bombard',
      headline,
      sub: 'Pick your tile, then light the fuse',
      progress: gunners.map((g) => ({ id: g.player.id, done: orders.get(g.player).locked ? 1 : 0, of: 1 })),
      ready: gunners.filter((g) => orders.get(g.player).locked).map((g) => g.player.id),
    }),
    player: (p) => {
      const order = orders.get(p);
      if (!order) return spectatorView(game, sides, p);
      const side = sides[order.side];
      const enemy = sides[order.target];
      const mates = [];
      for (const other of orders.values()) {
        if (other === order || other.target !== order.target) continue;
        for (const tile of other.aims) mates.push({ tile, id: other.player.id, avatar: other.player.avatar, color: other.player.color });
      }
      return {
        screen: 'bb-aim',
        key,
        phase,
        side: side.id,
        enemy: { id: enemy.id, name: enemy.name, icon: enemy.icon },
        board: boardView(enemy.board),
        guns: order.guns,
        need: need(order),
        aims: order.aims,
        locked: order.locked,
        mates,
        waiting: order.locked ? [...orders.values()].filter((o) => !ready(o)).map((o) => o.player.name) : [],
      };
    },
    onAction: (p, msg) => {
      const order = orders.get(p);
      if (!order || order.locked || msg.key !== key) return;
      const board = sides[order.target].board;
      if (msg.type === 'bb-aim' && Array.isArray(msg.tiles)) {
        const taken = spokenFor(order);
        const tiles = [...new Set(msg.tiles)].filter((t) => Number.isInteger(t) && t >= 0 && t < board.cols * board.rows && !board.shots.has(t) && !taken.has(t));
        order.aims = tiles.slice(-order.guns); // tap a new tile with every gun aimed and the oldest aim moves
      }
      if (msg.type === 'bb-fire' && order.aims.length > 0 && order.aims.length >= need(order)) order.locked = true;
    },
  });
  await ctx.wait(ctx.seconds(phase === 2 ? 'krakenAim' : 'aim', 30), { timer: true, until: () => [...orders.values()].every(ready) });

  // Anyone who didn't pick gets a tile chosen for them. It always misses.
  const chosen = new Map(sides.map((_, i) => [i, new Set()]));
  for (const order of orders.values()) for (const t of order.aims) chosen.get(order.target).add(t);
  return [...orders.values()].map((order) => {
    const board = sides[order.target].board;
    const tiles = order.aims.map((tile) => ({ tile, auto: false }));
    while (tiles.length < order.guns) {
      const duds = untouched(board).filter((t) => !board.at.has(t) && !chosen.get(order.target).has(t));
      if (duds.length === 0) break;
      const tile = sample(duds);
      chosen.get(order.target).add(tile);
      tiles.push({ tile, auto: true });
    }
    return { ...order, tiles, picked: order.aims.length };
  });
}

function spectatorView(game, sides, p) {
  const lost = sides.some((s) => (s.lost ?? []).includes(p));
  if (lost) return { screen: 'wait', key: 'bb-lost', icon: '💀', text: 'Dragged to the depths', sub: `Finish your ${game.drink} and heckle the survivors.` };
  return { screen: 'wait', key: 'bb-watch', icon: '👀', text: 'Eyes on the big screen!' };
}

/** Share a side's guns out among its crew; any spare guns rotate round by round. */
function shareGuns(crew, guns, round) {
  const each = Math.floor(guns / crew.length);
  const spare = guns % crew.length;
  return new Map(crew.map((p, i) => [p, each + ((i - round + crew.length * 1000) % crew.length < spare ? 1 : 0)]));
}

// ----- a volley: everything that happens after the fuses are lit -----

/**
 * A little builder for the timeline the TV plays back. Times are in script
 * milliseconds while building; `finish` converts them to real ones.
 */
function timeline(start = 1900) {
  const events = [];
  const phones = new Map(); // player -> [{ at, icon, text, sub }]
  return {
    t: start,
    events,
    add(event) {
      events.push({ ...event, at: this.t });
      return this;
    },
    /** A message for one player's phone, shown when the moment arrives on the TV. */
    tell(player, at, note) {
      if (!phones.has(player)) phones.set(player, []);
      phones.get(player).push({ ...note, at });
    },
    finish() {
      for (const e of events) {
        e.at = Math.round(e.at / SPEED);
        if (e.dur) e.dur = Math.round(e.dur / SPEED);
      }
      for (const notes of phones.values()) for (const n of notes) n.at = Math.round(n.at / SPEED);
      return { events, phones, total: this.t };
    },
  };
}

const IMPACT = 0.72; // how far through a shot's time the ball lands

async function playVolley(game, phase, sides, round, line, { headline, sub }) {
  const { ctx } = game;
  const { events, phones, total } = line.finish();
  const id = ++game.volleys;
  const key = `bb-${phase}-${round}-volley`;
  // The boards as they were before the guns fired; the TV reveals each tile as its shot lands.
  const before = line.before;
  const t0 = Date.now();
  ctx.screen({
    host: () => ({ ...scene(game, phase, sides), sides: before, key, mode: 'volley', round, headline, sub, volley: { id, t0, events } }),
    player: (p) => {
      const notes = phones.get(p);
      if (!notes) return spectatorView(game, sides, p);
      return { screen: 'bb-watch', key, t0, notes };
    },
  });
  await ctx.wait(total);
}

// ---------------------------------------------------------------------------
// Part one: Pirates v. Navy
// ---------------------------------------------------------------------------

async function seaBattle(game, sides) {
  const { ctx } = game;
  let quiet = 0; // rounds in a row where nobody picked anything

  for (let round = 1; ; round++) {
    const gunners = sides.flatMap((side, i) => {
      const share = shareGuns(side.crew, side.guns, round);
      return side.crew.map((player) => ({ player, side: i, target: 1 - i, guns: share.get(player) })).filter((g) => g.guns > 0);
    });
    const orders = await takeAim(game, 1, sides, round, gunners, { headline: `Round ${round}` });
    quiet = orders.some((o) => o.picked > 0) ? 0 : quiet + 1;

    // --- work out the volley ---
    const before = scene(game, 1, sides).sides;
    const queues = sides.map((_, i) => shuffle(orders.filter((o) => o.side === i).flatMap((o) => o.tiles.map((t) => ({ ...t, order: o })))));
    const shots = [];
    for (let n = 0; queues.some((q) => q.length); n++) {
      const next = queues[n % 2].shift();
      if (next) shots.push(next);
    }
    const shotMs = Math.max(1500, Math.min(2400, 21000 / Math.max(1, shots.length)));
    const line = timeline();
    line.before = before;
    const sunk = [];
    const missed = new Set();

    for (const shot of shots) {
      const { player, side, target } = shot.order;
      const mine = sides[side];
      const enemy = sides[target];
      const result = strike(enemy.board, shot.tile);
      const impact = line.t + shotMs * IMPACT;
      const where = coord(enemy.board, shot.tile);
      line.add({ type: 'shot', dur: shotMs, from: side, target, tile: shot.tile, by: player.id, auto: shot.auto, hit: result.hit, part: result.part, sunk: result.sunk, drinks: result.hit ? null : [player.id] });
      line.t += shotMs;

      if (!result.hit) {
        missed.add(player);
        game.swigs.set(player, game.swigs.get(player) + 1);
        line.tell(player, impact, {
          icon: '💦',
          text: shot.auto ? `${where}: a wild shot. Splash.` : `${where}: miss!`,
          sub: `Take a swig of ${game.drink}.`,
          tone: 'bad',
        });
        continue;
      }
      ctx.award(player, POINTS.hit);
      if (!result.sunk) {
        line.tell(player, impact, { icon: '💥', text: `${where}: a hit!`, sub: 'Nothing to drink. Look smug instead.', tone: 'good' });
        continue;
      }
      // A ship goes down: the whole enemy side drinks.
      ctx.award(player, POINTS.sink);
      sunk.push({ ship: result.sunk, by: player, side: enemy });
      for (const q of enemy.crew) game.swigs.set(q, game.swigs.get(q) + 1);
      const label = `${result.sunk.name}`;
      line.tell(player, impact, { icon: '☠️', text: `You sank ${label}!`, sub: `Every one of the ${enemy.name} drinks.`, tone: 'good' });
      for (const q of mine.crew) if (q !== player) line.tell(q, impact + 500, { icon: '🎯', text: `${player.name} sank ${label}!`, sub: `The ${enemy.name} all drink.`, tone: 'good' });
      for (const q of enemy.crew) line.tell(q, impact + 500, { icon: '🍺', text: `They sank ${label}!`, sub: `Your whole side drinks. Yes, you.`, tone: 'bad' });
      line.t = impact + 300;
      line.add({ type: 'banner', dur: 3400, tone: 'drink', side: target, text: `${enemy.name}, drink!`, sub: `${player.name} sank ${label}` });
      line.t += 3400;
      // Their last ship just went down: the battle's over, so any guns still loaded stay quiet.
      if (afloat(enemy.board).length === 0) break;
    }
    line.t += 1400;

    await playVolley(game, 1, sides, round, line, { headline: 'Fire!', sub: `Miss and you take a swig of ${game.drink}` });

    // --- what's left? ---
    const left = sides.map((s) => afloat(s.board).length);
    const over = left.some((n) => n === 0) || quiet >= 2;
    ctx.screen({
      host: () => ({
        ...scene(game, 1, sides),
        key: `bb-1-${round}-after`,
        mode: 'after',
        round,
        headline: sunk.length ? `${sunk.map((s) => s.ship.name).join(' and ')} sunk!` : missed.size ? `${plural(missed.size, 'gunner')} missed` : 'Every shot a hit!',
        sub: missed.size ? `Swigs for ${listNames([...missed])}` : 'Nobody drinks. For now.',
      }),
      player: (p) => {
        const side = sides.find((s) => s.crew.includes(p));
        const n = afloat(side.board).length;
        return { screen: 'wait', key: `bb-1-${round}-after`, icon: missed.has(p) ? '🍺' : side.icon, text: missed.has(p) ? 'Swig!' : 'Reloading…', sub: `Your fleet: ${plural(n, 'ship')} afloat` };
      },
    });
    await ctx.wait(over ? 1500 : 3000);

    if (over) {
      if (left[0] === left[1]) return null; // both fleets went down together (or everyone fell asleep)
      return left[0] > left[1] ? sides[0] : sides[1];
    }
  }
}

async function battleOver(game, sides, winner) {
  const { ctx } = game;
  if (winner) for (const p of winner.crew) ctx.award(p, POINTS.victory);
  const loser = winner ? sides.find((s) => s !== winner) : null;
  const headline = winner ? `The ${winner.name} rule the waves!` : 'Both fleets are firewood!';
  const sub = winner ? `The ${loser.name} are sunk to the last ship` : 'Nobody wins. Which is very much the spirit of the thing.';
  ctx.screen({
    sfx: 'fanfare',
    host: () => ({ ...scene(game, 1, sides), key: 'bb-1-over', mode: 'won', winner: winner?.id ?? null, headline, sub }),
    player: (p) => {
      const mine = sides.find((s) => s.crew.includes(p));
      if (!winner) return { screen: 'wait', key: 'bb-1-over', icon: '🤝', text: 'A draw!', sub: 'Everybody sank everybody.' };
      return mine === winner
        ? { screen: 'wait', key: 'bb-1-over', icon: '🏆', text: `The ${winner.name} win!`, sub: 'Gloat responsibly.' }
        : { screen: 'wait', key: 'bb-1-over', icon: '🌊', text: 'Sunk!', sub: `The ${winner.name} win this one.` };
    },
  });
  await ctx.wait(9000);
}

// ---------------------------------------------------------------------------
// Part two: the Kraken
// ---------------------------------------------------------------------------

async function krakenHunt(game) {
  const { ctx } = game;
  const crew = [...ctx.players];
  const plan = HUNTS[Math.max(2, Math.min(12, crew.length))];

  // Whatever is still afloat (and a few ships hastily bailed out) forms one fleet.
  const pool = shuffle([...game.names.pirates, ...game.names.navy]);
  const fleet = { id: 'fleet', name: 'The Alliance', icon: '🤝', crew, lost: [], board: makeBoard(plan.sea[0], plan.sea[1], christen(plan.fleet, pool), { open: true }) };
  const beast = {
    id: 'kraken',
    name: 'The Kraken',
    icon: '🐙',
    crew: [],
    board: makeBoard(plan.lair[0], plan.lair[1], [
      { kind: 'head', size: 4, name: 'head' },
      ...plan.arms.map((size) => ({ kind: 'arm', size, name: 'tentacle' })),
      { kind: 'knob', size: 1, name: 'knob' },
    ], { spread: KRAKEN_SPREAD }),
  };
  const sides = [fleet, beast];
  game.sides = sides;
  const active = () => crew.filter((p) => !fleet.lost.includes(p));

  // --- it rises ---
  ctx.screen({
    host: () => ({ ...scene(game, 2, sides), key: 'bb-2-rise', mode: 'rise', headline: 'The Kraken wakes', sub: 'Pirates and Navy, same side now. Everyone to the middle!' }),
    player: () => ({ screen: 'wait', key: 'bb-2-rise', icon: '🐙', text: 'The Kraken!', sub: 'You’re all on the same side now.' }),
  });
  await ctx.wait(12500);

  ctx.screen({
    host: () => ({ ...scene(game, 2, sides), key: 'bb-2-rules', mode: 'brief', headline: 'Kill it before it sinks you', sub: 'It hits a ship: everyone drinks · It sinks a ship: someone is out · Find its knob for bonus doubloons' }),
    player: () => ({ screen: 'wait', key: 'bb-2-rules', icon: '🐙', text: 'Find it in the fog', sub: 'It hits a ship: everyone drinks. It sinks one: somebody’s out. It has a knob somewhere: hit it for a bonus.' }),
  });
  await ctx.wait(9000);

  let quiet = 0;
  let waved = false; // the great wave only comes once
  for (let round = 1; ; round++) {
    const gunners = active().map((player) => ({ player, side: 0, target: 1, guns: 1 }));
    const orders = await takeAim(game, 2, sides, round, gunners, { headline: `Kraken · round ${round}` });
    quiet = orders.some((o) => o.picked > 0) ? 0 : quiet + 1;

    const before = scene(game, 2, sides).sides;
    const shots = shuffle(orders.flatMap((o) => o.tiles.map((t) => ({ ...t, order: o }))));
    const shotMs = Math.max(1400, Math.min(2300, 16000 / Math.max(1, shots.length)));
    const line = timeline();
    line.before = before;
    let severed = 0;
    let hits = 0;
    let knobbed = null; // whoever found the knob this round

    // --- the crew's guns ---
    for (const shot of shots) {
      const { player } = shot.order;
      const result = strike(beast.board, shot.tile);
      const impact = line.t + shotMs * IMPACT;
      const where = coord(beast.board, shot.tile);
      line.add({ type: 'shot', dur: shotMs, from: 0, target: 1, tile: shot.tile, by: player.id, auto: shot.auto, hit: result.hit, part: result.part, sunk: result.sunk, drinks: null });
      line.t += shotMs;
      if (!result.hit) {
        line.tell(player, impact, { icon: '💦', text: `${where}: just water`, sub: 'No harm done. Keep looking.', tone: 'plain' });
        continue;
      }
      if (result.part.kind === 'knob') {
        knobbed = player;
        ctx.award(player, POINTS.knob);
        line.tell(player, impact, { icon: '🎯', text: `${where}: you found its knob!`, sub: `+${POINTS.knob} doubloons. It didn’t like that one bit.`, tone: 'good' });
        line.t = impact + 300;
        line.add({ type: 'banner', dur: 2600, tone: 'good', text: 'Right on the knob!', sub: `${player.name} gets ${POINTS.knob} bonus doubloons` });
        line.t += 2600;
        continue;
      }
      hits++;
      ctx.award(player, POINTS.krakenHit);
      if (!result.sunk) {
        line.tell(player, impact, { icon: '💥', text: `${where}: you hit it!`, sub: 'It did not like that.', tone: 'good' });
        continue;
      }
      severed++;
      ctx.award(player, POINTS.sever);
      const what = result.sunk.kind === 'head' ? 'the Kraken’s head' : 'a tentacle';
      line.tell(player, impact, { icon: '⚔️', text: result.sunk.kind === 'head' ? 'You smashed its head!' : 'You took off a tentacle!', sub: 'Calamari for everyone.', tone: 'good' });
      line.t = impact + 300;
      line.add({ type: 'banner', dur: 2600, tone: 'good', text: result.sunk.kind === 'head' ? 'Right between the eyes!' : 'Tentacle severed!', sub: `${player.name} finished off ${what}` });
      line.t += 2600;
      if (vitals(beast.board).length === 0) break; // the last of it is gone: no need to fire the rest
    }

    const slain = vitals(beast.board).length === 0;
    const drowned = [];
    let swigsAll = 0;

    // --- the Kraken hits back ---
    if (!slain) {
      line.t += 700;
      line.add({ type: 'banner', dur: 1900, tone: 'bad', text: 'The Kraken strikes!', sub: null });
      line.t += 1900;
      for (let n = 0; n < plan.strikes && afloat(fleet.board).length > 0; n++) {
        const tile = krakenTarget(fleet.board, plan.cunning);
        if (tile === null) break;
        const result = strike(fleet.board, tile);
        const dur = 2600;
        const impact = line.t + dur * IMPACT;
        let lost = null;
        if (result.sunk) {
          const still = active();
          if (still.length > 1) {
            lost = sample(still);
            fleet.lost.push(lost);
            drowned.push({ player: lost, ship: result.sunk });
          }
        }
        line.add({ type: 'strike', dur, target: 0, tile, hit: result.hit, part: result.part, sunk: result.sunk, lost: lost?.id ?? null, drinks: result.hit ? 'all' : null });
        line.t += dur;
        if (!result.hit) continue;

        swigsAll++;
        for (const p of crew) game.swigs.set(p, game.swigs.get(p) + 1);
        const ship = fleet.board.at.get(tile);
        for (const p of crew) {
          if (p === lost) continue;
          line.tell(p, impact, { icon: '🐙', text: `It hit ${ship.name}!`, sub: `Everyone takes a swig of ${game.drink}.`, tone: 'bad' });
        }
        if (result.sunk) {
          line.t = impact + 400;
          line.add({ type: 'banner', dur: 3600, tone: 'bad', text: `${ship.name} is dragged under!`, sub: lost ? `${lost.name} goes down with the ship` : 'Everyone drinks' });
          if (lost) line.tell(lost, impact + 400, { icon: '💀', text: `You went down with ${ship.name}`, sub: `You’re out. Finish your ${game.drink}.`, tone: 'bad' });
          line.t += 3600;
        } else {
          line.t = impact + 300;
          line.add({ type: 'banner', dur: 1700, tone: 'drink', text: 'Everyone drinks!', sub: `The Kraken hit ${ship.name}` });
          line.t += 1700;
        }
      }
    }
    line.t += 1300;

    await playVolley(game, 2, sides, round, line, { headline: 'Fire!', sub: 'Find its head and its arms' });

    const shipsLeft = afloat(fleet.board).length;
    const armsLeft = vitals(beast.board).length;
    const over = slain || shipsLeft === 0 || quiet >= 2;
    ctx.screen({
      host: () => ({
        ...scene(game, 2, sides),
        key: `bb-2-${round}-after`,
        mode: 'after',
        round,
        headline: drowned.length ? `${listNames(drowned.map((d) => d.player))} lost at sea` : knobbed ? `${knobbed.name} found its knob!` : severed ? `${plural(severed, 'piece')} of Kraken gone` : hits ? 'It’s wounded' : 'It’s still out there',
        sub: `${plural(armsLeft, 'piece')} of Kraken left · ${plural(shipsLeft, 'ship')} afloat`,
      }),
      player: (p) =>
        fleet.lost.includes(p)
          ? spectatorView(game, sides, p)
          : { screen: 'wait', key: `bb-2-${round}-after`, icon: '🐙', text: 'Reloading…', sub: `${plural(shipsLeft, 'ship')} afloat · ${plural(armsLeft, 'piece')} of Kraken left` },
    });
    await ctx.wait(over ? 1500 : 3000);
    if (over) return slain;

    // Down to its last couple of pieces, it throws up a great wave and hides all over again.
    if (!waved && armsLeft <= 2) {
      waved = true;
      await greatWave(game, sides);
    }
  }
}

async function greatWave(game, sides) {
  const { ctx } = game;
  const [fleet, beast] = sides;
  const left = vitals(beast.board).length;
  const headline = 'A great wave!';
  const sub = `The Kraken’s last ${left === 1 ? 'piece swims off and hides' : `${left} pieces swim off and hide`} in the fog again`;
  const phone = (key) => (p) =>
    fleet.lost.includes(p) ? spectatorView(game, sides, p) : { screen: 'wait', key, icon: '🌊', text: 'A great wave!', sub: 'It’s moved and hidden again. Find it!' };

  // The wave rolls in over the board as it was...
  ctx.screen({ host: () => ({ ...scene(game, 2, sides), key: 'bb-2-wave', mode: 'wave', headline, sub }), player: phone('bb-2-wave') });
  await ctx.wait(2400);
  // ...and when it has passed, everything left has moved, healed, and gone back under the fog.
  rehide(beast.board, KRAKEN_SPREAD);
  ctx.screen({ host: () => ({ ...scene(game, 2, sides), key: 'bb-2-hidden', mode: 'hidden', headline, sub }), player: phone('bb-2-wave') });
  await ctx.wait(3600);
}

async function finale(game, slain) {
  const { ctx } = game;
  const sides = game.sides;
  const fleet = sides[0];
  if (slain) for (const p of ctx.players) ctx.award(p, POINTS.slain);

  // The thirstiest sailor gets a mention.
  const mostSwigs = Math.max(...game.swigs.values());
  const thirsty = ctx.players.filter((p) => game.swigs.get(p) === mostSwigs);
  const stats = [
    mostSwigs > 0 ? { label: 'Most swigs', players: thirsty.map((p) => p.id), value: plural(mostSwigs, 'swig') } : null,
    fleet.lost.length ? { label: 'Lost at sea', players: fleet.lost.map((p) => p.id), value: '' } : null,
  ].filter(Boolean);

  ctx.screen({
    host: () => ({
      ...scene(game, 2, sides),
      key: 'bb-end',
      mode: slain ? 'victory' : 'defeat',
      headline: slain ? 'The Kraken is slain!' : 'Davy Jones’ Locker',
      sub: slain ? 'Victory! Calamari for everyone.' : `The Kraken wins. Everyone finish your ${game.drink}.`,
      stats,
    }),
    player: () =>
      slain
        ? { screen: 'wait', key: 'bb-end', icon: '🏆', text: 'Victory!', sub: 'The Kraken is calamari.' }
        : { screen: 'wait', key: 'bb-end', icon: '🐙', text: 'The Kraken wins', sub: `Finish your ${game.drink}.` },
  });
  await ctx.wait(15000);
}
