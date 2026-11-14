// KNOT SO FAST - a quick-fire trivia regatta.
//
// Crews of two or three sail a ship round a desert island. Questions come onto
// every phone in quick waves: a right answer fills the sails, a wrong one spills
// some wind and locks the phone for a second. Once a phone has answered its
// wave it tells its owner to watch the telly, and when every phone is done (or
// the wave runs out of time) there's a short breather while the TV camera
// swoops in on the leader. That way the room actually sees the race. Now and then a ship is dealt a
// gold "powder" question, and a right answer to that fires a cannon at the
// ship one place ahead.
//
// In a crew only one sailor answers each wave: the helm, which passes round
// the crew wave by wave. Everyone else gets a chore that messes with the
// other ships: chucking junk in their way, bailing water, heckling, and
// firing the cannon when the helm loads it. Anyone not answering (a helm
// who has finished, or everyone in the breather) can heckle.
//
//   1. The Scramble: 45 seconds, everyone alone in a rowing boat. It teaches the
//      game and ranks the room.
//   2. Crews are picked from that ranking, fastest with slowest.
//   3. Three races. After the first, the ships start staggered: the higher up
//      the table, the further back. The last race pays double.
//
// Unlike the other games this one has to move things many times a second, so
// alongside the usual ctx.wait() it runs a clock of its own (see `tick`).
// The motion itself is in public/knots-motion.js, shared with the TV.
//
// Every number is in content/knots.json; the questions are in
// content/knots-questions.json. The design is in docs/knot-so-fast-plan.md.

import { shuffle, sample, clamp } from '../util.js';
import { MOTION, advance, inOrder } from '../../public/knots-motion.js';

export const meta = {
  id: 'knots',
  name: 'Knot So Fast',
  icon: '⛵',
  tagline: 'Know things. Go faster. Shoot whoever’s winning.',
  blurb: 'A quick-fire trivia race round a desert island, in crews of two or three. Right answers fill your sails. A gold question fires your cannon at the ship in front.',
  min: 2,
  narrator: false, // no talking: the guns, the bell and the band carry it
};

// The race clock is squeezed by SPEED the same way the engine squeezes its timers.
const SPEED = Number(process.env.SPEED) > 0 ? Number(process.env.SPEED) : 1;
const TICK_MS = 50;
const HAND = 3; // questions each phone holds ahead, so the next one shows with no wait
const PAINTS = 6; // paint schemes for ships (see public/knots-host.js)

const DEFAULT_SHIPS = ['The Wet Sock', 'The Soggy Biscuit', 'Rum for Improvement', 'The Angry Haddock', 'Plank You Very Much', 'Sea You Later', 'The Crusty Barnacle', 'HMS Oops'];

// What a deckhand on junk duty finds in the hold, and what the punters on board shout.
const JUNK = [
  ['🛢️', 'barrel'], ['📦', 'crate'], ['⚓', 'spare anchor'], ['🦆', 'rubber duck'], ['🪼', 'jellyfish'], ['🧀', 'wheel of cheese'],
  ['🛒', 'shopping trolley'], ['🚽', 'toilet'], ['🪑', 'deckchair'], ['🐙', 'octopus'], ['🥾', 'soggy boot'], ['🍍', 'pineapple'],
];
const TAUNTS = [
  'Call that sailing?', 'My nan rows faster!', 'Absolute shambles!', 'Bottled it!', 'Is that a pedalo?', 'Row, you muppets!',
  'Taxi for that lot!', 'Have a word with yourselves!', 'Shocking!', 'Put the kettle on, you’re not winning', 'Sink! Sink! Sink!', 'Going home in a rowing boat!',
];
const CHORES = [['junk', 3], ['bail', 2], ['taunt', 2]]; // and how often each comes up

const nameList = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : (list[0] ?? ''));
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const round = (n, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

/** Read content/knots.json, falling back to the plan's numbers for anything missing or silly. */
function settings(raw = {}) {
  const num = (value, fallback, lo = 0, hi = Infinity) => (typeof value === 'number' && Number.isFinite(value) ? clamp(value, lo, hi) : fallback);
  const list = (value, fallback) => (Array.isArray(value) && value.length && value.every((n) => typeof n === 'number' && n >= 0) ? value : fallback);
  const w = raw.wind ?? {};
  const p = raw.powder ?? {};
  const s = raw.seconds ?? {};
  const wv = raw.waves ?? {};
  const ch = raw.chores ?? {};
  return {
    races: Math.round(num(raw.races, 3, 1, 9)),
    laps: Math.round(num(raw.laps, 3, 1, 20)),
    scramble: raw.scramble !== false,
    trios: raw.crews === 'trios',
    scrambleSeconds: num(s.scramble, 45, 5, 600),
    cutoff: num(s.cutoff, 20, 0, 600),
    countdown: Math.round(num(s.countdown, 3, 1, 10)),
    lock: num(s.lock, 1, 0, 10),
    fuse: num(s.fuse, 8, 2, 60),
    waveQuestions: Math.round(num(wv.questions, 4, 0, 50)), // 0: no waves, questions non-stop
    waveSeconds: num(wv.seconds, 16, 3, 120),
    breather: num(wv.breather, 5, 0, 30),
    scrambleWaves: wv.scramble === true,
    chores: ch.on !== false, // false: everyone in a crew answers at once, as before
    fireSeconds: num(ch.fireSeconds, 5, 1, 30),
    dropWind: num(ch.dropWind, 0.3, 0, 1),
    dropSafe: num(ch.dropSafe, 4, 0, 60),
    grabSeconds: num(ch.grabSeconds, 3, 0, 60),
    bailTaps: Math.round(num(ch.bailTaps, 15, 1, 200)),
    bailWind: num(ch.bailWind, 0.4, 0, 5),
    bailRest: num(ch.bailRest, 4, 0, 60), // after a full bucket, how long before the next one
    tauntWind: num(ch.tauntWind, 0, 0, 1),
    heckleSeconds: num(ch.heckleSeconds, 1.2, 0, 10), // how long a heckle covers the helm's question
    heckleSafe: num(ch.heckleSafe, 3, 0, 60), // and how long before the same sailor can be put off again
    tauntGap: num(ch.tauntGap, 5, 0.2, 60), // how long between one sailor's heckles
    motion: {
      lap: num(w.lap, MOTION.lap, 10),
      drift: num(w.drift, MOTION.drift, 0.05),
      top: num(w.top, MOTION.top),
      curve: num(w.curve, MOTION.curve, 0.1, 3),
      max: num(w.max, MOTION.max, 1),
      leak: num(w.leak, MOTION.leak, 0, 5),
      freshWind: num(w.freshWind, MOTION.freshWind, 0, 2),
      freshWindAt: num(w.freshWindAt, MOTION.freshWindAt, 1),
      holedSpeed: num(p.holedSpeed, MOTION.holedSpeed, 0, 1),
    },
    gust: num(w.gust, 4.3),
    wrongCost: num(w.wrongCost, 0.5, 0, 5),
    rollAfter: Math.round(num(w.rollAfter, 5, 1, 99)),
    rollBonus: num(w.rollBonus, 1.5, 1, 5),
    powderEvery: list(p.every, [16, 13, 11, 10, 9]),
    powderFirst: list(p.first, [8, 12]),
    flight: num(p.flight, 1.2, 0.2, 10),
    holedSeconds: num(p.holedSeconds, 3, 0, 60),
    holedWind: num(p.holedWind, 0.5, 0, 1),
    safeSeconds: num(p.safeSeconds, 6, 0, 120),
    stagger: num(raw.stagger, 10, 0, 90),
    finalTimes: num(raw.finalRaceTimes, 2, 1, 10),
    doubloons: list(raw.doubloons, [1000, 700, 500, 300, 200, 100]),
    shipNames: Array.isArray(raw.ships) && raw.ships.filter((n) => typeof n === 'string' && n.trim()).length >= 6 ? raw.ships.filter((n) => typeof n === 'string' && n.trim()) : DEFAULT_SHIPS,
  };
}

/** How many sailors go in each ship. Pairs where possible, one trio if the number is odd; two or three players get a boat each. */
export function crewSizes(players, trios = false) {
  if (players <= 3) return Array(players).fill(1);
  const ships = trios ? Math.ceil(players / 3) : Math.floor(players / 2);
  const sizes = Array(ships).fill(Math.floor(players / ships));
  for (let i = 0; i < players % ships; i++) sizes[i]++;
  return sizes;
}

/**
 * Pick the crews from a ranking (best first), so that they come out as even as
 * possible: the fastest get a ship each, then everyone else is handed out from
 * the slowest up, each going to the strongest crew that still has a berth.
 * `score` says how good each sailor is (how far they rowed in the Scramble).
 */
export function draftCrews(ranked, sizes, score) {
  const crews = sizes.map((size, i) => ({ size, members: [ranked[i]] }));
  const rest = ranked.slice(sizes.length).reverse();
  const average = (crew) => crew.members.reduce((sum, s) => sum + score(s), 0) / crew.members.length;
  for (const sailor of rest) {
    const open = crews.filter((c) => c.members.length < c.size);
    // Fill the pairs before anyone gets a third hand, so the trio is topped up last, from the middle of the table.
    const fewest = Math.min(...open.map((c) => c.members.length));
    const pick = open.filter((c) => c.members.length === fewest).sort((a, b) => average(b) - average(a))[0];
    pick.members.push(sailor);
  }
  return crews.map((c) => c.members);
}

export async function run(ctx) {
  const S = settings(ctx.content.knots);
  const M = S.motion;

  // ----- the questions -----

  const bank = [];
  for (const cat of ctx.content.knotsQuestions?.categories ?? []) {
    for (const x of cat.questions ?? []) bank.push({ ...x, cat: cat.name, catId: cat.id });
  }

  /** A sailor's own shuffled run through the bank. It remembers what this phone has seen, across games, and never deals the same category twice running. */
  function dealerFor(player) {
    const seen = ctx.room.usedFor(`knots:q:${player.id}`);
    let pile = [];
    let lastCat = null;
    return () => {
      if (pile.length === 0) {
        let fresh = bank.filter((x) => !seen.has(x.q));
        if (fresh.length < 20) {
          seen.clear();
          fresh = bank;
        }
        pile = shuffle(fresh);
      }
      let i = pile.length - 1;
      for (let tries = 0; tries < 8 && i > 0 && pile[i].catId === lastCat; tries++) i--;
      const [x] = pile.splice(i, 1);
      seen.add(x.q);
      lastCat = x.catId;
      const options = shuffle([x.a, ...x.wrong]);
      return { q: x.q.includes('{') ? ctx.fill(x.q) : x.q, o: options, r: options.indexOf(x.a), c: x.cat };
    };
  }

  // ----- the people -----

  let noticeId = 0;
  const sailors = new Map(
    ctx.players.map((p) => [
      p,
      { p, id: p.id, deal: dealerFor(p), out: [], quota: Infinity, nextId: 1, streak: 0, best: 0, right: 0, wrong: 0, times: [], hits: 0, nextOk: 0, powder: null, notice: null, boat: null, rowed: 0, chore: null, lastChore: null, tauntAt: -99, heckle: null, heckleSafeUntil: -1, bailAt: 0, dropped: 0, bailed: 0, fired: 0 },
    ]),
  );
  const tell = (s, text, tone = '') => (s.notice = { id: ++noticeId, text, tone });
  /** Keep a phone's hand full, as far as this wave allows. */
  const topUp = (s) => {
    while (s.out.length < HAND && s.quota > 0) {
      s.out.push({ id: s.nextId++, ...s.deal() });
      s.quota--;
    }
  };
  /** Still answering this wave? (The hand is only empty once the wave's questions are all dealt and answered.) */
  const stillGoing = (s) => s.out.length > 0 && !s.p.away && s.boat?.done == null;
  const awake = (v) => v.crew.filter((s) => !s.p.away).length || v.crew.length;
  const rolling = (s) => s.streak > S.rollAfter;

  // ----- one race (the Scramble is a race too: no finish line, no cannons, a time limit) -----

  let R = null; // the race in progress

  const vessel = (id, name, paint, crew) => ({ id, name, paint, crew, pos: 0, head: 0, wind: 0, holedUntil: -1, safeUntil: -1, nextPowder: 0, done: null, place: null, answers: 0, holes: 0, holesAll: 0, points: 0, last: 0, helm: null, turn: 0, loaded: null, junkSafeUntil: -1 });

  function event(type, more = {}) {
    R.events.push({ id: ++R.eventId, t: round(R.clock), type, ...more });
    if (R.events.length > 24) R.events.shift();
    R.dirty = true;
  }

  function fizzle(v, s, why) {
    event('fizzle', { ship: v.id, by: s.id });
    tell(s, why, 'bad');
  }

  function fire(v, s) {
    const order = inOrder(R.vessels);
    const target = order[order.indexOf(v) - 1];
    if (!target) return fizzle(v, s, 'Nobody ahead of you to shoot at!');
    if (target.done != null) return fizzle(v, s, `${target.name} is already home.`);
    const land = R.clock + S.flight;
    R.balls.push({ from: v, to: target, by: s, land });
    event('shot', { from: v.id, to: target.id, by: s.id, land: round(land) });
    tell(s, `FIRE! Aiming at ${target.name}`, 'good');
  }

  /** A right answer to a powder question. In a crew it only loads the gun: a deckhand has to fire it. */
  function load(v, s) {
    const gunners = v.crew.filter((c) => c !== s && c.chore && !c.p.away);
    if (gunners.length === 0) return fire(v, s);
    v.loaded = { by: s, until: R.clock + S.fireSeconds };
    event('loaded', { ship: v.id, by: s.id });
    tell(s, `Loaded! ${nameList(gunners.map((g) => g.p.name))}: FIRE!`, 'good');
  }

  function landBall(ball) {
    const { to, from, by } = ball;
    if (to.done != null || R.clock < to.safeUntil) return event('miss', { to: to.id, from: from.id });
    to.holedUntil = R.clock + S.holedSeconds;
    to.safeUntil = R.clock + S.safeSeconds;
    to.wind *= S.holedWind;
    to.holes++;
    by.hits++;
    event('hit', { to: to.id, from: from.id, by: by.id, until: round(to.holedUntil) });
    for (const s of to.crew) tell(s, `Holed by ${by.p.name}!`, 'bad');
    for (const s of from.crew) tell(s, s === by ? `Direct hit on ${to.name}!` : `${by.p.name} holed ${to.name}!`, 'good');
  }

  /** Every tap from a phone in a race: answers, and the chores. */
  function onAction(p, msg) {
    if (!R || msg.key !== R.key || R.phase !== 'go') return;
    const s = sailors.get(p);
    const v = s?.boat;
    if (!v || v.done != null) return;
    if (msg.type === 'kn-answer') return onAnswer(s, v, msg);
    const chore = choreOf(s);
    if (!chore) return;
    const target = R.vessels.find((t) => t.id === msg.to && t !== v && t.done == null);

    if (msg.type === 'kn-fire' && v.loaded && s !== v.loaded.by) {
      v.loaded = null;
      s.fired++;
      fire(v, s);
    } else if (msg.type === 'kn-drop' && chore.kind === 'junk' && chore.item && target) {
      const [emoji, thing] = chore.item;
      chore.item = null;
      chore.grabAt = R.clock + S.grabSeconds;
      if (R.clock < target.junkSafeUntil) {
        event('drop', { from: v.id, to: target.id, by: s.id, item: emoji, thing, miss: true });
        tell(s, `The ${thing} bobbed straight past them.`, 'bad');
      } else {
        target.wind *= 1 - S.dropWind;
        target.junkSafeUntil = R.clock + S.dropSafe;
        s.dropped++;
        event('drop', { from: v.id, to: target.id, by: s.id, item: emoji, thing });
        tell(s, `${emoji} Right in front of ${target.name}!`, 'good');
        for (const c of target.crew) tell(c, `${emoji} ${s.p.name} chucked a ${thing} at you!`, 'bad');
      }
    } else if (msg.type === 'kn-bail' && chore.kind === 'bail') {
      if (R.clock < chore.restUntil) return; // catching their breath after the last bucket: taps go nowhere
      // Taps come in little batches. Cap them, so a script can't bail faster than a thumb.
      const now = Date.now();
      const taps = Math.min(Math.floor(Number(msg.taps) || 0), 6, Math.ceil(((now - s.bailAt) / 1000) * 16 * SPEED), S.bailTaps - chore.taps);
      s.bailAt = now;
      if (taps <= 0) return;
      chore.taps += taps;
      if (chore.taps >= S.bailTaps) {
        chore.taps = 0;
        chore.restUntil = R.clock + S.bailRest;
        s.bailed++;
        if (R.clock < v.holedUntil) {
          v.holedUntil = R.clock;
          event('patch', { ship: v.id, by: s.id });
          for (const c of v.crew) tell(c, c === s ? 'Hole patched!' : `${s.p.name} patched the hole!`, 'good');
        } else {
          v.wind = Math.min(M.max, v.wind + S.bailWind);
        }
      }
    } else if (msg.type === 'kn-taunt' && target && R.clock - s.tauntAt >= S.tauntGap) {
      s.tauntAt = R.clock;
      const text = sample(TAUNTS);
      target.wind *= 1 - S.tauntWind;
      // It lands on the phones of whoever over there is answering, and puts them off for a moment.
      const putOff = target.crew.filter((c) => !c.chore && c.out.length && R.clock >= c.heckleSafeUntil);
      for (const c of putOff) {
        c.heckle = { id: ++noticeId, by: s.p.name, text, ms: Math.round((S.heckleSeconds * 1000) / SPEED) };
        c.heckleSafeUntil = R.clock + S.heckleSafe;
        c.nextOk = Math.max(c.nextOk, Date.now() + c.heckle.ms);
      }
      event('taunt', { from: v.id, to: target.id, by: s.id, text, landed: putOff.length > 0 });
    } else return;
    R.dirty = true;
  }

  /** Somebody tapped an answer. The phone has already shown them right or wrong; this is where it counts. */
  function onAnswer(s, v, msg) {
    const index = s.out.findIndex((d) => d.id === msg.deal);
    if (index < 0 || Date.now() < s.nextOk) return;
    const [deal] = s.out.splice(index, 1);
    s.out = s.out.filter((d) => d.id > deal.id - HAND); // anything much older was lost on the way; forget it

    const right = msg.pick === deal.r;
    const share = S.gust / (v.helm ? 1 : awake(v)); // a lone helm fills the sails for the whole crew
    if (right) {
      s.streak++;
      s.best = Math.max(s.best, s.streak);
      s.right++;
      v.answers++;
      v.wind = Math.min(M.max, v.wind + share * (rolling(s) ? S.rollBonus : 1));
      if (Number.isFinite(msg.ms)) s.times.push(clamp(msg.ms, 150, 30000));
      if (s.streak === S.rollAfter + 1) event('roll', { ship: v.id, by: s.id });
    } else {
      s.streak = 0;
      s.wrong++;
      v.wind = Math.max(0, v.wind - share * S.wrongCost);
      s.nextOk = Date.now() + (S.lock * 1000 * 0.5) / SPEED;
    }

    topUp(s);
    if (s.powder?.deal === deal.id) {
      if (msg.gold === true) {
        s.powder = null;
        if (right) load(v, s);
        else fizzle(v, s, 'Misfire! Wrong answer.');
      } else if (msg.fizz === true) {
        s.powder = null;
        fizzle(v, s, 'Too slow: the fuse went out.');
      } else {
        if (s.out.length) s.powder.deal = s.out[0].id; // the phone had already moved past it: make it the next one instead
        else s.powder = null; // ...unless that was the last question of the wave
      }
    }
    R.dirty = true;
  }

  /** Move the race on by `h` seconds. */
  function step(h) {
    const leaderPos = Math.max(...R.vessels.map((v) => v.pos));
    for (const v of R.vessels) {
      if (v.done != null) continue;
      advance(v, h, leaderPos, R.clock, M);
      if (R.goal && v.pos >= R.goal) {
        v.pos = R.goal;
        v.done = R.clock;
        v.place = ++R.home;
        if (v.place === 1) R.cutoffAt = R.clock + S.cutoff;
        for (const s of v.crew) s.powder = null;
        v.loaded = null;
        event('finish', { ship: v.id, place: v.place });
      }
    }
    R.clock += h;

    for (let i = R.balls.length - 1; i >= 0; i--) {
      if (R.clock >= R.balls[i].land) landBall(R.balls.splice(i, 1)[0]);
    }

    for (const v of R.vessels) {
      if (v.loaded && R.clock >= v.loaded.until) {
        event('fizzle', { ship: v.id, by: v.loaded.by.id });
        for (const c of v.crew) tell(c, 'Too slow! Nobody fired the cannon.', 'bad');
        v.loaded = null;
      }
      for (const c of v.crew) {
        if (c.chore?.kind === 'junk' && !c.chore.item && R.clock >= c.chore.grabAt) {
          c.chore.item = sample(JUNK);
          R.dirty = true;
        }
      }
    }

    if (R.waves) {
      const w = R.wave;
      if (w.on && (R.clock >= w.until || ![...sailors.values()].some(stillGoing))) endWave();
      else if (!w.on && R.clock >= w.until) startWave();
    }

    const order = inOrder(R.vessels);
    if (R.cannons) {
      order.forEach((v, place) => {
        if (place === 0 || v.done != null || R.clock < v.nextPowder || order[place - 1].done != null) return;
        if (v.loaded || v.crew.some((s) => s.powder)) return;
        const hands = v.crew.filter((s) => !s.p.away && s.out.length);
        if (hands.length === 0) return;
        const s = sample(hands);
        s.powder = { deal: s.out[Math.min(1, s.out.length - 1)].id, since: R.clock };
        v.nextPowder = R.clock + S.powderEvery[Math.min(place - 1, S.powderEvery.length - 1)];
        R.dirty = true;
      });
      // A phone that never answers (asleep, or the crew gave up) must not sit on the powder for ever.
      for (const s of sailors.values()) if (s.powder && R.clock - s.powder.since > S.fuse + 15) s.powder = null;
    }

    // Who is in front? A new leader has to be clearly ahead, or two ships side by side would swap every tick.
    const front = order[0];
    const leader = R.vessels.find((v) => v.id === R.leader);
    if (!leader) R.leader = front.id;
    else if (front !== leader && (leader.done == null ? front.pos - leader.pos > 0.6 : false)) {
      R.leader = front.id;
      if (R.clock > 4) event('lead', { ship: front.id });
    }
    if (R.goal && S.laps > 1 && !R.lastLap && front.pos >= R.goal - M.lap) {
      R.lastLap = true;
      event('lastlap', { ship: front.id });
    }

    const everyoneHome = R.vessels.every((v) => v.done != null);
    if (everyoneHome || (R.cutoffAt != null && R.clock >= R.cutoffAt) || (R.limit && R.clock >= R.limit)) endRace();
  }

  /** Deal everyone a fresh wave of questions. With waves off there is just the one, and it never ends. */
  function startWave() {
    const w = R.wave;
    w.n++;
    w.on = true;
    w.until = R.clock + S.waveSeconds;
    for (const v of R.vessels) handOut(v);
    for (const s of sailors.values()) {
      s.out = [];
      s.quota = s.chore ? 0 : R.waves || Infinity;
      topUp(s);
    }
    if (w.n > 1) event('wave', { n: w.n });
    R.dirty = true;
  }

  /** Does this race split crews into a helm and deckhands? */
  const crewed = (v) => R.kind === 'race' && R.waves > 0 && S.chores && v.crew.length > 1;
  /** Who takes the helm next wave: the crew take turns, skipping anyone who's wandered off. */
  const nextHelm = (v) => {
    const here = v.crew.filter((s) => !s.p.away);
    const pool = here.length ? here : v.crew;
    return pool[v.turn % pool.length];
  };

  /** Give a ship its helm for this wave, and everyone else a chore (never the same one twice running, nor the same as a crewmate's). */
  function handOut(v) {
    for (const s of v.crew) s.chore = null;
    v.helm = null;
    if (!crewed(v) || v.done != null) return;
    v.helm = nextHelm(v);
    v.turn++;
    const taken = new Set();
    for (const s of v.crew) {
      if (s === v.helm) continue;
      const options = CHORES.filter(([kind]) => kind !== s.lastChore && !taken.has(kind));
      const pool = options.length ? options : CHORES;
      let roll = Math.random() * pool.reduce((sum, [, weight]) => sum + weight, 0);
      const [kind] = pool.find(([, weight]) => (roll -= weight) < 0) ?? pool[0];
      taken.add(kind);
      s.lastChore = kind;
      s.chore = { kind, item: kind === 'junk' ? sample(JUNK) : null, grabAt: 0, taps: 0, restUntil: -1 };
    }
  }

  /** What this sailor can do right now instead of answering: their chore, or a heckle while they wait. */
  function choreOf(s) {
    const v = s.boat;
    if (R.kind !== 'race' || !S.chores || R.phase !== 'go' || v.done != null || R.vessels.filter((t) => t.done == null).length < 2) return null;
    if (s.chore) return s.chore;
    const resting = R.waves > 0 && (!R.wave.on || s.out.length === 0);
    return resting ? { kind: 'taunt' } : null;
  }

  /** Phones down, eyes up: a few seconds of just sailing before the next wave. */
  function endWave() {
    const w = R.wave;
    w.on = false;
    w.until = R.clock + S.breather;
    for (const s of sailors.values()) Object.assign(s, { out: [], quota: 0, powder: null });
    event('breather', { n: w.n });
    R.dirty = true;
  }

  function endRace() {
    if (R.phase === 'over') return;
    R.phase = 'over';
    inOrder(R.vessels).forEach((v, i) => (v.place ??= i + 1));
    for (const s of sailors.values()) Object.assign(s, { powder: null, chore: null });
    for (const v of R.vessels) Object.assign(v, { loaded: null, helm: null });
    R.dirty = true;
  }

  /** The race clock. Runs many times a second beside the engine's own timers, and obeys pause, SPEED and "end game" as they do. */
  function tick() {
    const now = Date.now();
    if (ctx.paused || ctx.aborted || R.phase !== 'go') {
      R.tickedAt = now;
      return;
    }
    let left = Math.min(0.25, (now - R.tickedAt) / 1000) * SPEED;
    R.tickedAt = now;
    while (left > 1e-6 && R.phase === 'go') {
      const h = Math.min(0.05, left);
      step(h);
      left -= h;
    }
    // Screens are told when something happens, and once a second regardless; in between the TV does the sums itself.
    if (R.dirty || now - R.pushedAt > 1000) {
      R.dirty = false;
      R.pushedAt = now;
      ctx.update();
    }
    if (R.phase === 'over') ctx.poke();
  }

  const lapOf = (v) => clamp(Math.floor(v.pos / M.lap) + 1, 1, S.laps);

  function hostRace() {
    return {
      screen: 'kn-race',
      key: R.key,
      music: R.phase === 'go' ? (R.lastLap ? 'knotsLast' : 'knots') : null,
      kind: R.kind,
      n: R.n,
      of: S.races,
      laps: S.laps,
      phase: R.phase,
      count: R.count,
      light: R.light,
      clock: round(R.clock, 3),
      at: R.tickedAt,
      rate: SPEED,
      goal: R.goal,
      limit: R.limit,
      motion: M,
      flight: S.flight,
      lastLap: R.lastLap,
      ships: R.vessels.map((v) => ({
        id: v.id,
        name: v.name,
        paint: v.paint,
        crew: v.crew.map((s) => s.id),
        head: v.head,
        pos: round(v.pos, 3),
        wind: round(v.wind, 3),
        holedUntil: round(v.holedUntil, 3),
        done: v.done == null ? null : round(v.done, 3),
        place: v.place,
        right: v.answers,
        roll: v.crew.some(rolling),
        asking: R.waves > 0 && R.wave.on && R.phase === 'go' && v.crew.some(stillGoing),
        helm: v.helm?.id ?? null,
        loaded: !!v.loaded,
      })),
      breather: R.waves > 0 && !R.wave.on && R.phase === 'go',
      events: R.events,
    };
  }

  function playerRace(p) {
    const s = sailors.get(p);
    const v = s.boat;
    const order = inOrder(R.vessels);
    const i = order.indexOf(v);
    const ahead = order[i - 1];
    const behind = order[i + 1];
    const holder = v.crew.find((c) => c !== s && c.powder);
    // Between waves, or done with this one: the phone says to watch the telly.
    const rest = R.waves && R.phase === 'go' && v.done == null ? (!R.wave.on ? 'breather' : s.out.length ? null : 'done') : null;
    const chore = choreOf(s);
    return {
      screen: 'kn-race',
      key: R.key,
      kind: R.kind,
      n: R.n,
      of: S.races,
      phase: R.phase,
      count: R.count,
      hand: R.phase === 'go' && v.done == null && !rest ? s.out : [],
      chore: chore
        ? {
            kind: chore.kind,
            item: chore.item ? { e: chore.item[0], name: chore.item[1] } : null,
            wait: chore.kind === 'junk' && !chore.item ? round(Math.max(0, chore.grabAt - R.clock), 1) : 0,
            taps: S.bailTaps,
            filled: chore.taps ?? 0,
            rest: round(S.bailRest / SPEED, 2), // these three in real seconds, for the phone's own timers
            gap: round(S.tauntGap / SPEED, 2),
            cool: round(Math.max(0, chore.kind === 'bail' ? chore.restUntil - R.clock : chore.kind === 'taunt' ? s.tauntAt + S.tauntGap - R.clock : 0) / SPEED, 2),
          }
        : null,
      helm: v.helm && v.helm !== s ? v.helm.p.name : null,
      upNext: R.waves > 0 && !R.wave.on && crewed(v) && nextHelm(v) === s,
      fire: chore && v.loaded && v.loaded.by !== s ? { by: v.loaded.by.p.name, left: round(v.loaded.until - R.clock, 1) } : null,
      targets: chore ? order.filter((t) => t !== v && t.done == null).map((t) => ({ id: t.id, name: t.name, paint: t.paint, place: order.indexOf(t) + 1 })) : null,
      wave: R.wave.n,
      rest,
      still: rest === 'done' ? [...sailors.values()].filter(stillGoing).map((c) => c.p.name) : null,
      powder: s.powder?.deal ?? null,
      mate: holder ? holder.p.name : null,
      ship: v.name,
      paint: v.paint,
      mates: v.crew.filter((c) => c !== s).map((c) => c.p.name),
      place: i + 1,
      ships: order.length,
      lap: lapOf(v),
      laps: R.goal ? S.laps : 0,
      wind: round(v.wind / M.max),
      gap: ahead ? { name: ahead.name, leagues: Math.max(1, Math.round(ahead.pos - v.pos)), dir: 'behind' } : behind ? { name: behind.name, leagues: Math.max(1, Math.round(v.pos - behind.pos)), dir: 'ahead of' } : null,
      roll: rolling(s),
      holed: R.clock < v.holedUntil,
      notice: s.notice,
      heckle: s.heckle,
      lock: S.lock * 1000,
      fuse: S.fuse,
      done: v.done != null || R.phase === 'over' ? v.place : null,
    };
  }

  /** Run one race from the countdown to the last ship home. */
  async function sail({ kind, n, vessels, cannons, goal, limit, light }) {
    R = { key: `kn-${kind}-${n}`, kind, n, phase: 'ready', count: 0, clock: 0, tickedAt: Date.now(), pushedAt: 0, dirty: false, vessels, cannons, goal, limit, light, cutoffAt: null, home: 0, balls: [], events: [], eventId: 0, leader: null, lastLap: false, waves: kind === 'scramble' && !S.scrambleWaves ? 0 : S.waveQuestions, wave: { n: 0, on: false, until: 0 } };
    for (const v of vessels) {
      Object.assign(v, { pos: v.head, wind: 0, holedUntil: -1, safeUntil: -1, done: null, place: null, holes: 0, nextPowder: rand(S.powderFirst[0], S.powderFirst[1] ?? S.powderFirst[0]) });
      Object.assign(v, { helm: null, turn: Math.floor(Math.random() * v.crew.length), loaded: null, junkSafeUntil: -1 });
      for (const s of v.crew) Object.assign(s, { boat: v, out: [], quota: 0, streak: 0, powder: null, notice: null, chore: null, heckle: null, heckleSafeUntil: -1, tauntAt: -99 }); // race clocks start at 0, so clear anything timed on the last one
    }
    ctx.screen({ host: hostRace, player: playerRace, onAction });
    for (R.count = S.countdown; R.count > 0; R.count--) {
      ctx.update();
      await ctx.wait(1000);
    }

    R.phase = 'go';
    startWave();
    R.tickedAt = Date.now();
    if (limit) ctx.startClock(limit * 1000);
    ctx.update();
    const timer = setInterval(tick, TICK_MS);
    try {
      await ctx.wait(20 * 60 * 1000, { until: () => R.phase === 'over' });
    } finally {
      clearInterval(timer);
      ctx.stopClock();
    }
    endRace(); // if somebody pressed Space to skip ahead, call it where the ships are
    ctx.update();
    await ctx.wait(kind === 'scramble' ? 2500 : 3500);
    return inOrder(vessels);
  }

  // ----- the rules, on a screen of their own like every other game -----

  const berths = [...new Set(crewSizes(ctx.players.length, S.trios))].sort();
  const alone = berths[0] === 1;
  const crewOf = berths.map((n) => ['', 'one', 'two', 'three', 'four', 'five'][n] ?? n).join(' or ');
  const races = S.races === 1 ? 'one race' : `${S.races} races`;
  const double = S.races > 1 && S.finalTimes > 1 ? ` The last one pays ${S.finalTimes === 2 ? 'double' : `${S.finalTimes} times over`}.` : '';
  await ctx.intro([
    S.waveQuestions ? 'Questions come to your phone in quick waves. Right answers fill your sails.' : 'Questions fire onto your phone non-stop. Right answers fill your sails.',
    'A wrong answer spills some wind and costs you a second.',
    'A gold question loads your cannon: get it right to fire at the ship in front.',
    ...(S.waveQuestions && (alone || !S.chores) ? ['Done your wave? Eyes on the telly, and heckle the others.'] : []),
    ...(S.scramble ? [`First, the Scramble: ${Math.round(S.scrambleSeconds)} seconds${S.waveQuestions && !S.scrambleWaves ? ' non-stop' : ''}, every pirate for themselves.`] : []),
    (alone ? `Then ${races} round the island.` : `Then crews of ${crewOf}, for ${races} round the island.`) + double,
    // The crews' rule comes after the crews are mentioned.
    ...(S.waveQuestions && !alone && S.chores ? ['In a crew, take turns at the helm. Everyone else does chores: chuck junk, bail, fire the cannon, heckle the other helms.'] : []),
  ]);

  // ----- 1. the Scramble -----

  let ranked = shuffle([...sailors.values()]);
  if (S.scramble) {
    const boats = ranked.map((s, i) => vessel(s.id, s.p.name, i % PAINTS, [s]));
    const order = await sail({ kind: 'scramble', n: 0, vessels: boats, cannons: false, goal: null, limit: S.scrambleSeconds, light: 'morning' });
    ranked = order.map((v) => v.crew[0]);
    for (const v of order) v.crew[0].rowed = v.pos;
  }

  // ----- 2. the crews -----

  const sizes = crewSizes(ranked.length, S.trios);
  const names = shuffle(S.shipNames);
  const paints = shuffle(Array.from({ length: PAINTS }, (_, i) => i));
  const ships = draftCrews(ranked, sizes, (s) => s.rowed).map((crew, i) => vessel(`ship${i}`, sizes[0] === 1 ? crew[0].p.name : names[i % names.length], paints[i % PAINTS], crew));
  const shipView = (v) => ({ id: v.id, name: v.name, paint: v.paint, crew: v.crew.map((s) => s.id) });
  const solo = sizes[0] === 1;

  if (!solo || S.scramble) {
    ctx.screen({
      host: () => ({
        screen: 'kn-crews',
        key: 'kn-crews',
        music: 'knots',
        solo,
        rowed: S.scramble ? ranked.map((s) => ({ id: s.id, leagues: Math.round(s.rowed) })) : null,
        ships: ships.map(shipView),
      }),
      player: (p) => {
        const s = sailors.get(p);
        const mine = ships.find((v) => v.crew.includes(s));
        const mates = mine.crew.filter((c) => c !== s).map((c) => c.p.name);
        const rowed = S.scramble ? `You rowed ${Math.round(s.rowed)} leagues: ${ordinal(ranked.indexOf(s) + 1)} of ${ranked.length}.` : '';
        if (solo) return { screen: 'wait', key: 'kn-crews', icon: '⛵', text: 'Now for the real thing.', sub: rowed };
        return { screen: 'wait', key: 'kn-crews', icon: '⛵', text: `You’re aboard ${mine.name}`, sub: `with ${mates.join(' and ')}. Go and sit together! ${rowed}` };
      },
    });
    await ctx.wait(ctx.seconds('crews', 12));
  }

  // ----- 3. the races -----

  const table = () => [...ships].sort((a, b) => b.points - a.points || a.last - b.last);

  for (let n = 1; n <= S.races; n++) {
    const final = n === S.races && S.races > 1;
    // Staggered start: top of the table on the line, each place below a bit further ahead.
    const standing = table();
    for (const v of ships) v.head = n === 1 ? 0 : standing.indexOf(v) * S.stagger;
    const light = n === 1 ? 'morning' : final && S.races > 2 ? 'storm' : 'evening';
    const order = await sail({ kind: 'race', n, vessels: ships, cannons: ships.length > 1, goal: S.laps * M.lap, limit: null, light });

    const times = final ? S.finalTimes : 1;
    const before = new Map(ships.map((v) => [v, v.points]));
    const winner = order[0];
    const results = order.map((v, i) => {
      const won = Math.round((S.doubloons[i] ?? 0) * times);
      v.points += won;
      v.last = i + 1;
      v.holesAll += v.holes;
      for (const s of v.crew) ctx.award(s.p, won);
      const behind = i === 0 ? null : v.done != null ? `+${(v.done - winner.done).toFixed(1)}s` : `${Math.max(1, Math.round(R.goal - v.pos))} leagues short`;
      return { ...shipView(v), place: i + 1, won, behind, holes: v.holes };
    });
    // A dead heat on doubloons at the very end goes to whoever was ahead in the last race.
    if (n === S.races) {
      const [first, second] = table();
      if (second && first.points === second.points) {
        first.points += 10;
        for (const s of first.crew) ctx.award(s.p, 10);
      }
    }
    const standings = table().map((v) => ({ ...shipView(v), points: v.points, was: before.get(v) }));
    const key = `kn-table-${n}`;
    ctx.screen({
      host: () => ({ screen: 'kn-table', key, music: 'knots', n, of: S.races, final: n === S.races, double: times > 1, results, standings, next: n < S.races ? (n + 1 === S.races && S.finalTimes > 1 ? 'Last race next: it pays double' : `Race ${n + 1} next`) : null }),
      player: (p) => {
        const s = sailors.get(p);
        const mine = results.find((r) => r.crew.includes(s.id));
        return { screen: 'wait', key, icon: mine.place === 1 ? '🏆' : '🏁', text: `${mine.name} finished ${ordinal(mine.place)}`, sub: `+${mine.won.toLocaleString('en')} doubloons each${n < S.races ? '. Get ready for the next one!' : ''}` };
      },
    });
    await ctx.wait(ctx.seconds('table', 8));
  }

  // ----- 4. the muster: who was sharp, who was quick, who got shot to pieces -----

  const everyone = [...sailors.values()];
  const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
  /** The best sailor(s) by some measure, or nothing if nobody qualifies. */
  const award = (label, measure, show, { lowest = false, among = everyone } = {}) => {
    const scored = among.map((s) => ({ s, n: measure(s) })).filter((x) => x.n != null && Number.isFinite(x.n));
    if (scored.length === 0) return null;
    const best = lowest ? Math.min(...scored.map((x) => x.n)) : Math.max(...scored.map((x) => x.n));
    if (!lowest && best <= 0) return null;
    return { label, players: scored.filter((x) => x.n === best).map((x) => x.s.id).slice(0, 3), value: show(best) };
  };
  const tried = (s) => s.right + s.wrong;
  const sieve = [...ships].sort((a, b) => b.holesAll - a.holesAll)[0];
  const awards = [
    award('Sharpest Eye', (s) => (tried(s) >= 10 ? Math.round((s.right / tried(s)) * 100) : null), (n) => `${n}% right`),
    award('Fastest Fingers', (s) => (s.times.length >= 10 ? Math.round(median(s.times) / 100) / 10 : null), (n) => `${n.toFixed(1)}s an answer`, { lowest: true }),
    award('Master Gunner', (s) => s.hits, (n) => `${n} hit${n === 1 ? '' : 's'}`),
    award('Longest Roll', (s) => s.best, (n) => `${n} in a row`),
    award('Loose Cannon', (s) => s.wrong, (n) => `${n} wrong`),
    award('Rubbish Tip', (s) => s.dropped, (n) => `${n} thing${n === 1 ? '' : 's'} chucked`),
    sieve?.holesAll > 0 ? { label: 'The Colander', players: sieve.crew.map((s) => s.id).slice(0, 3), value: `holed ${sieve.holesAll} time${sieve.holesAll === 1 ? '' : 's'}` } : null,
    S.scramble ? award('First Oar', (s) => Math.round(s.rowed), (n) => `${n} leagues in the Scramble`) : null,
  ].filter(Boolean);

  const champion = table()[0];
  ctx.screen({
    sfx: 'chest',
    host: () => ({ screen: 'kn-muster', key: 'kn-muster', music: 'knots', champion: shipView(champion), standings: table().map((v) => ({ ...shipView(v), points: v.points })), awards }),
    player: (p) => {
      const s = sailors.get(p);
      const mine = awards.filter((a) => a.players.includes(s.id)).map((a) => a.label);
      const total = tried(s);
      return { screen: 'wait', key: 'kn-muster', icon: mine.length ? '🎖️' : '📜', text: mine.length ? mine.join(' · ') : 'The muster', sub: total ? `You got ${s.right} of ${total} right.` : '' };
    },
  });
  await ctx.wait(ctx.seconds('muster', 15));
  await ctx.gameOver();
}
