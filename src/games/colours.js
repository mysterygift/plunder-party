// FLYING COLOURS - daft flags for dafter ships.
// ("Colours" is what sailors call a ship's flag.)
//
// Each round:
//   1. Everyone draws pirate flags on their phone.
//   2. Everyone invents ship names, each one prompted by a crewmate's flag.
//   3. Every flag and every name is dealt out to exactly one player (never the
//      one who made it), so no two hands share anything. Each player pairs one
//      flag with one name to launch a ship.
//   4. The ships parade across the TV and the crew votes for the finest.
//
// Flags and names nobody used stay in the hold for round two.
// Drawing ideas, spare names and timers live in content/colours.json.

import { shuffle, sample, cleanText, readTime, clamp } from '../util.js';
import { sanitizeFlag } from '../../public/flag.js'; // the drawing format, shared with the screens

export const meta = {
  id: 'colours',
  name: 'Flying Colours',
  icon: '🏴‍☠️',
  tagline: 'Daft flags for dafter ships',
  blurb: 'Draw pirate flags on your phone, then dream up ship names. Everyone is dealt a haul of other people’s flags and names, and launches the best pairing. The crew votes for the finest ship.',
  min: 3,
};

const MAX_NAME = 40;
const HAND = { flags: { min: 2, max: 4 }, names: { min: 3, max: 5 } };
const GRACE_MS = 1500; // phones send in unfinished work when the clock runs out

export async function run(ctx) {
  const content = ctx.content.colours;
  const count = (value, fallback, max) => clamp(Math.round(Number(value)) || fallback, 1, max);

  // Everything made so far that hasn't sailed yet.
  const hold = {
    flags: [], // { id, artist }       id is the drawing's id on the server
    names: [], // { id, text, author }
    ideas: ctx.deck('ideas', content.ideas),
    spareNames: ctx.deck('spareNames', content.spareNames),
    spareFlags: [],
    taken: new Set(), // every name so far, lower-cased, so the same one never turns up twice
    nextId: 0,
  };

  await ctx.intro([
    'First, draw pirate flags on your phone. Then invent names for pirate ships.',
    'You’ll be dealt a haul of your crewmates’ flags and names. Pair the best flag with the best name to launch a ship.',
    'The crew votes for the finest ship. There are doubloons for whoever launched it, drew it and named it.',
  ]);

  await playRound(ctx, hold, { number: 1, flags: count(content.flagsEach, 3, 4), names: count(content.namesEach, 4, 6), multiplier: 1 });
  await ctx.scoreboard('After the first launch');
  await playRound(ctx, hold, { number: 2, flags: 1, names: 2, multiplier: 2 });
  await ctx.gameOver();
}

async function playRound(ctx, hold, round) {
  await drawFlags(ctx, hold, round);
  await writeNames(ctx, hold, round);
  const ships = await launchShips(ctx, hold, round);
  await parade(ctx, ships, round);
  await vote(ctx, ships, round);
}

/** Phones send in whatever was half-finished when the clock ran out; give them a moment to arrive. */
async function brushesDown(ctx, host, onAction, text) {
  ctx.screen({ host, onAction, player: () => ({ screen: 'wait', icon: '⏳', text }) });
  await ctx.wait(GRACE_MS);
}

// ---------------------------------------------------------------------------
// 1. Draw flags
// ---------------------------------------------------------------------------

async function drawFlags(ctx, hold, round) {
  const k = `fc-${round.number}`;
  const drawn = new Map(ctx.players.map((p) => [p, 0]));
  const ideas = new Map(ctx.players.map((p) => [p, Array.from({ length: round.flags }, () => ctx.fill(hold.ideas.draw()))]));
  const finished = (p) => drawn.get(p) >= round.flags;
  const keyFor = (p) => `${k}-draw-${drawn.get(p)}`;

  const onAction = (p, msg) => {
    if (msg.type !== 'flag' || msg.key !== keyFor(p) || finished(p)) return;
    const flag = sanitizeFlag(msg.flag);
    if (!flag) return;
    hold.flags.push({ id: ctx.stash(flag), artist: p });
    drawn.set(p, drawn.get(p) + 1);
  };
  const host = () => ({
    screen: 'writing',
    key: `${k}-draw`,
    title: round.number === 1 ? 'Stitch your flags' : 'One last flag',
    text: round.number === 1 ? `Draw ${round.flags === 1 ? 'a pirate flag' : `${round.flags} pirate flags`} on your phone. Art skills not required.` : 'The fleet needs fresh colours. Draw one more flag.',
    note: round.multiplier > 1 ? 'Doubloons are doubled this round' : null,
    progress: ctx.players.map((p) => ({ id: p.id, done: drawn.get(p), of: round.flags })),
  });

  ctx.screen({
    say: round.number === 1 ? 'Round one. Draw your flags. No artistic talent required.' : 'Round two. One more flag each, and the doubloons are doubled.',
    sfx: 'bell',
    host,
    onAction,
    player: (p) =>
      finished(p)
        ? { screen: 'wait', icon: '🧵', text: 'Flags stitched!', sub: 'Waiting on the slower seamstresses…' }
        : {
            screen: 'draw',
            key: keyFor(p),
            heading: round.flags > 1 ? `Flag ${drawn.get(p) + 1} of ${round.flags}` : 'One more flag',
            idea: ideas.get(p)[drawn.get(p)],
          },
  });
  await ctx.wait(ctx.seconds(round.number === 1 ? 'draw' : 'drawExtra', round.number === 1 ? 180 : 75), {
    timer: true,
    until: () => ctx.players.every((p) => finished(p) || ctx.away(p)),
  });
  if (!ctx.players.every(finished)) await brushesDown(ctx, host, onAction, 'Brushes down!');
}

// ---------------------------------------------------------------------------
// 2. Name ships
// ---------------------------------------------------------------------------

async function writeNames(ctx, hold, round) {
  const k = `fc-${round.number}`;
  const written = new Map(ctx.players.map((p) => [p, 0]));
  const finished = (p) => written.get(p) >= round.names;
  const keyFor = (p) => `${k}-name-${written.get(p)}`;

  // Each name is prompted by one of somebody else's flags, a different one each time.
  const muses = new Map(ctx.players.map((p) => [p, shuffle(hold.flags.filter((f) => f.artist !== p))]));
  const museFor = (p) => {
    const flags = muses.get(p);
    return flags.length ? flags[written.get(p) % flags.length].id : null;
  };

  ctx.screen({
    say: 'Now name some ships. What vessel would fly a flag like that?',
    sfx: 'quill',
    host: () => ({
      screen: 'writing',
      key: `${k}-names`,
      title: 'Christen some ships',
      text: 'You’ll be shown a crewmate’s flag. What’s the ship that flies it called?',
      progress: ctx.players.map((p) => ({ id: p.id, done: written.get(p), of: round.names })),
    }),
    player: (p) =>
      finished(p)
        ? { screen: 'wait', icon: '🍾', text: 'Ships christened!', sub: 'Bottle smashed. Mind the glass.' }
        : {
            screen: 'write',
            key: keyFor(p),
            heading: `Ship name ${written.get(p) + 1} of ${round.names}`,
            flag: museFor(p),
            prompt: museFor(p) ? 'What’s the name of the ship that flies this flag?' : 'Name a pirate ship.',
            placeholder: 'The…',
            max: MAX_NAME,
          },
    onAction: (p, msg) => {
      const text = cleanText(msg.text, MAX_NAME);
      if (msg.type !== 'answer' || msg.key !== keyFor(p) || !text || finished(p)) return;
      written.set(p, written.get(p) + 1);
      if (hold.taken.has(text.toLowerCase())) return; // somebody already thought of that one
      hold.taken.add(text.toLowerCase());
      hold.names.push({ id: hold.nextId++, text, author: p });
    },
  });
  await ctx.wait(ctx.seconds(round.number === 1 ? 'names' : 'namesExtra', round.number === 1 ? 80 : 45), {
    timer: true,
    until: () => ctx.players.every((p) => finished(p) || ctx.away(p)),
  });
}

// ---------------------------------------------------------------------------
// 3. Deal the hands and launch the ships
// ---------------------------------------------------------------------------

/**
 * Share items out so each goes to exactly one player, never to its own maker.
 * Whoever has the fewest gets the next one; short hands are topped up with spares.
 */
function deal(items, players, { min, max }, makerOf, spare) {
  const hands = new Map(players.map((p) => [p, []]));
  for (const item of shuffle(items)) {
    const takers = shuffle(players)
      .filter((p) => p !== makerOf(item) && hands.get(p).length < max)
      .sort((a, b) => hands.get(a).length - hands.get(b).length);
    if (takers.length) hands.get(takers[0]).push(item);
  }
  for (const hand of hands.values()) while (hand.length < min) hand.push(spare());
  return hands;
}

async function launchShips(ctx, hold, round) {
  const k = `fc-${round.number}`;
  const key = `${k}-combine`;
  const flagHands = deal(hold.flags, ctx.players, HAND.flags, (f) => f.artist, () => spareFlag(ctx, hold));
  const nameHands = deal(hold.names, ctx.players, HAND.names, (n) => n.author, () => spareName(ctx, hold));
  const picks = new Map(); // player -> { flag, name }

  const onAction = (p, msg) => {
    const flag = flagHands.get(p).find((f) => f.id === msg.flag);
    const name = nameHands.get(p).find((n) => n.id === msg.name);
    if (msg.type === 'combine' && msg.key === key && flag && name && !picks.has(p)) picks.set(p, { flag, name });
  };
  const host = () => ({
    screen: 'writing',
    key,
    title: 'Launch a ship',
    text: 'You’ve been dealt flags and names. Pair up the two that belong together.',
    progress: ctx.players.map((p) => ({ id: p.id, done: picks.has(p) ? 1 : 0, of: 1 })),
  });

  ctx.screen({
    say: 'Every ship needs a flag and a name. Pick the pair that belongs together.',
    sfx: 'anchor',
    host,
    onAction,
    player: (p) =>
      picks.has(p)
        ? { screen: 'wait', icon: '⛵', text: 'Ship launched!', sub: 'She floats. Mostly.' }
        : {
            screen: 'combine',
            key,
            flags: flagHands.get(p).map((f) => ({ id: f.id })),
            names: nameHands.get(p).map((n) => ({ id: n.id, text: n.text })),
          },
  });
  await ctx.wait(ctx.seconds('combine', 60), {
    timer: true,
    until: () => ctx.players.every((p) => picks.has(p) || ctx.away(p)),
  });
  if (!ctx.players.every((p) => picks.has(p))) await brushesDown(ctx, host, onAction, 'All hands on deck!');

  // Anyone who didn't choose gets a ship thrown together from their hand.
  for (const p of ctx.players) {
    if (!picks.has(p)) picks.set(p, { flag: sample(flagHands.get(p)), name: sample(nameHands.get(p)) });
  }

  // What sailed leaves the hold; everything else waits for the next round.
  const sailed = new Set([...picks.values()].flatMap((pick) => [pick.flag, pick.name]));
  hold.flags = hold.flags.filter((f) => !sailed.has(f));
  hold.names = hold.names.filter((n) => !sailed.has(n));

  return shuffle([...picks]).map(([captain, pick], id) => ({ id, captain, flag: pick.flag, name: pick.name, votes: [] }));
}

// ---------------------------------------------------------------------------
// 4. The parade
// ---------------------------------------------------------------------------

const card = (ship) => ({ id: ship.id, flag: ship.flag.id, name: ship.name.text });

const credits = (ship) => ({
  ...card(ship),
  captain: ship.captain.id,
  artist: ship.flag.artist?.id ?? null,
  author: ship.name.author?.id ?? null,
  votes: ship.votes,
  gain: ship.gain,
  best: ship.best,
});

async function parade(ctx, ships, round) {
  const teasers = shuffle(['Who sails under this flag?', 'What ship flies these colours?', 'Sail ho! Who goes there?', 'A flag on the horizon. Whose is it?']);
  for (const [i, ship] of ships.entries()) {
    const key = `fc-${round.number}-show-${ship.id}`;
    const teaser = teasers[i % teasers.length];
    const player = (p) => (p === ship.captain ? { screen: 'wait', key, icon: '😬', text: 'That’s your ship up there.', sub: 'Stand proud.' } : { screen: 'wait', key, icon: '👀', text: 'Eyes on the big screen!' });

    ctx.screen({ say: teaser, sfx: 'drumroll', player, host: () => ({ screen: 'fc-show', key, step: 1, teaser, ship: card(ship) }) });
    await ctx.wait(3400);
    ctx.screen({ say: ship.name.text, sfx: 'cannon', player, host: () => ({ screen: 'fc-show', key, step: 2, teaser, ship: card(ship) }) });
    await ctx.wait(readTime(ship.name.text, 2600));
  }
}

// ---------------------------------------------------------------------------
// 5. The vote
// ---------------------------------------------------------------------------

async function vote(ctx, ships, round) {
  const k = `fc-${round.number}`;
  const m = round.multiplier;
  const cast = new Map(ctx.players.map((p) => [p, new Set()])); // voter -> the ships they chose
  const rivals = (p) => ships.filter((s) => s.captain !== p);
  const allowance = (p) => Math.min(ships.length > 5 ? 2 : 1, rivals(p).length); // a big fleet earns a second vote
  const finished = (p) => cast.get(p).size >= allowance(p);
  const keyFor = (p) => `${k}-vote-${cast.get(p).size}`;

  ctx.screen({
    say: ships.length > 5 ? 'Vote for your two favourite ships.' : 'Vote for the finest ship in the fleet.',
    sfx: 'pipe',
    host: () => ({
      screen: 'fc-fleet',
      key: `${k}-fleet`,
      title: 'The fleet',
      step: 'vote',
      ships: ships.map(card),
      voted: ctx.players.filter(finished).map((p) => p.id),
    }),
    player: (p) =>
      finished(p)
        ? { screen: 'wait', key: `${k}-voted`, icon: '🗳️', text: cast.get(p).size > 1 ? 'Votes cast!' : 'Vote cast!' }
        : {
            screen: 'choose',
            key: keyFor(p),
            heading: cast.get(p).size ? 'And your runner-up?' : 'Finest ship in the fleet?',
            prompt: 'You can’t vote for your own ship.',
            options: rivals(p).filter((s) => !cast.get(p).has(s)).map((s) => ({ id: s.id, text: s.name.text, flag: s.flag.id })),
          },
    onAction: (p, msg) => {
      const ship = ships.find((s) => s.id === msg.id);
      if (msg.type !== 'choose' || msg.key !== keyFor(p) || finished(p) || !ship || ship.captain === p || cast.get(p).has(ship)) return;
      cast.get(p).add(ship);
      ship.votes.push(p.id);
    },
  });
  await ctx.wait(ctx.seconds('vote', 40), {
    timer: true,
    until: () => ctx.players.every((p) => finished(p) || ctx.away(p)),
  });

  // --- results: the captain scores per vote; whoever drew the flag and wrote the name take a share ---
  const gains = new Map(ctx.players.map((p) => [p, 0]));
  const give = (p, points) => {
    if (!p || !points) return; // spare flags and names belong to nobody
    gains.set(p, gains.get(p) + points);
    ctx.award(p, points);
  };
  const most = Math.max(...ships.map((s) => s.votes.length));
  for (const ship of ships) {
    const n = ship.votes.length;
    ship.best = most > 0 && n === most;
    ship.gain = (n * 500 + (ship.best ? 250 : 0)) * m;
    give(ship.captain, ship.gain);
    give(ship.flag.artist, n * 200 * m);
    give(ship.name.author, n * 200 * m);
  }
  const winners = ships.filter((s) => s.best);
  const playerResult = (p) => ({ screen: 'wait', key: `${k}-result`, icon: gains.get(p) ? '💰' : '🌊', text: gains.get(p) ? `+${gains.get(p)} doubloons` : 'No votes this time.' });

  ctx.screen({
    say: winners.length ? `The finest ship afloat is ${winners.map((s) => s.name.text).join(', and ')}.` : 'Nobody voted. Mutiny!',
    sfx: 'chest',
    player: playerResult,
    host: () => ({ screen: 'fc-fleet', key: `${k}-fleet`, title: 'Honours of the fleet', step: 'result', ships: ships.map(credits) }),
  });
  await ctx.wait(7000 + ships.length * 800);

  // --- a clear winner gets one more turn in the sun ---
  if (winners.length === 1) {
    const [flagship] = winners;
    ctx.screen({
      say: `Launched by ${flagship.captain.name}.`,
      sfx: 'fanfare',
      player: playerResult,
      host: () => ({ screen: 'fc-show', key: `${k}-flagship`, step: 3, teaser: 'Flagship of the fleet', ship: credits(flagship) }),
    });
    await ctx.wait(7500);
  }
}

// ---------------------------------------------------------------------------
// Spare flags and names, for when the hold runs short (somebody's phone fell overboard)
// ---------------------------------------------------------------------------

const ring = (cx, cy, rx, ry = rx, steps = 28) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI;
    return [Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a))];
  }).flat();

/** A filled-in blob: rings painted inside one another with the fattest brush. */
const blob = (c, cx, cy, rx, ry = rx) => [1, 0.62, 0.25].map((f) => ({ c, w: 2, p: ring(cx, cy, rx * f, ry * f) }));
const dab = (c, x, y, w = 1) => ({ c, w, p: [x, y] });

const heart = Array.from({ length: 41 }, (_, i) => {
  const t = (i / 40) * 2 * Math.PI;
  return [Math.round(300 + 9.5 * 16 * Math.sin(t) ** 3), Math.round(185 - 9.5 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)))];
}).flat();

const SPARE_FLAGS = [
  // a skull and crossbones, of sorts
  { cloth: 0, strokes: [{ c: 0, w: 1, p: [140, 80, 460, 330] }, { c: 0, w: 1, p: [460, 80, 140, 330] }, ...blob(0, 300, 185, 78, 68), dab(1, 270, 175, 2), dab(1, 330, 175, 2), { c: 1, w: 0, p: [272, 222, 300, 232, 328, 222] }] },
  // a suspiciously cheerful sun
  { cloth: 2, strokes: [...blob(3, 300, 200, 100), dab(1, 265, 175), dab(1, 335, 175), { c: 1, w: 1, p: [250, 225, 275, 250, 300, 258, 325, 250, 350, 225] }] },
  // a love heart (these are sensitive pirates)
  { cloth: 0, strokes: [{ c: 2, w: 2, p: heart }] },
  // the catch of the day
  { cloth: 3, strokes: [{ c: 0, w: 1, p: ring(270, 200, 135, 75) }, { c: 0, w: 1, p: [405, 200, 500, 130, 500, 270, 405, 200] }, dab(0, 190, 180, 1), { c: 0, w: 0, p: [150, 225, 185, 235, 215, 225] }] },
  // X marks the spot
  { cloth: 5, strokes: [{ c: 1, w: 1, p: ring(300, 200, 150, 130) }, { c: 2, w: 2, p: [215, 125, 385, 275] }, { c: 2, w: 2, p: [385, 125, 215, 275] }] },
];

function spareName(ctx, hold) {
  let text = '';
  for (let tries = 0; tries < 30; tries++) {
    text = ctx.fill(hold.spareNames.draw());
    if (!hold.taken.has(text.toLowerCase())) break;
  }
  hold.taken.add(text.toLowerCase());
  return { id: hold.nextId++, text, author: null };
}

function spareFlag(ctx, hold) {
  if (hold.spareFlags.length === 0) hold.spareFlags = shuffle(SPARE_FLAGS);
  return { id: ctx.stash(hold.spareFlags.pop()), artist: null };
}
