// FIND THE ONE PIECE - a choose-your-own captain's log, played as one crew.
//
// The whole story lives in content/one-piece.json. This file only walks it:
//   1. A log entry writes itself onto the page.
//   2. The crew votes on what to do (majority wins; a tie is a coin flip).
//   3. Everybody rolls one die on their phone. The total, set against the odds
//      for that many dice, gives one of five results: diabolical, bad,
//      neutral, good or perfect.
//   4. The matching outcome is written in. It may hand the crew kit (which helps
//      later rolls) or woes (which hurt them), and says which scene is next.
// The last three scenes are a fight with a dragon: each result moves a marker
// along a gauge, and where it rests picks one of five endings.
//
// There are no scores. Nobody wins unless everybody does.

import { sample, clamp } from '../util.js';

export const meta = {
  id: 'onepiece',
  name: 'Find the One Piece',
  icon: '🏝️',
  narrator: false, // a log is read, not read out: the TV writes it on to the scratch of a quill
  tagline: 'A captain’s log. There is treasure. Probably.',
  blurb: 'A choose-your-own adventure for the whole crew. Vote on what to do, then everybody rolls a die: the crew’s total decides how it goes, from Perfect all the way down to Diabolical.',
  min: 2,
  coop: true, // one team: the phones hide the doubloon counter
};

export const BANDS = ['diabolical', 'bad', 'neutral', 'good', 'perfect'];

// ---------------------------------------------------------------------------
// The odds
// ---------------------------------------------------------------------------
//
// The sum of several dice bunches up round the middle more and more as dice
// are added, so fixed cut-offs would be unfair to big crews. Instead the
// cut-offs are placed wherever the real odds for that many dice come closest
// to the chances we are aiming for.

/** How likely each total is with n dice: chances[total]. */
function chances(n) {
  let d = [1];
  for (let i = 0; i < n; i++) {
    const next = Array(d.length + 6).fill(0);
    d.forEach((p, sum) => {
      for (let face = 1; face <= 6; face++) next[sum + face] += p / 6;
    });
    d = next;
  }
  return d;
}

// When kit or woes tilt the scale, these are the chances aimed for instead:
// the chance of diabolical, then of bad-or-worse, neutral-or-worse, good-or-worse.
const TILTED = {
  '-2': [0.22, 0.5, 0.87, 0.97],
  '-1': [0.15, 0.4, 0.8, 0.95],
  1: [0.05, 0.2, 0.6, 0.85],
  2: [0.03, 0.13, 0.5, 0.78],
};

/**
 * The top total of each of the first four bands, for n dice.
 * (Everything above the last one is perfect.)
 *   odds: the five percentages from the content file, worst first
 *   tilt: -2 (against the crew) to +2 (for them)
 */
export function cutsFor(n, tilt = 0, odds = [10, 20, 40, 20, 10]) {
  let targets = TILTED[tilt];
  if (!targets) {
    const sum = odds.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    targets = odds.slice(0, 4).map((p) => (acc += p / sum));
  }
  const d = chances(n);
  const upTo = [];
  let acc = 0;
  for (let s = 0; s < d.length; s++) upTo[s] = acc += d[s] ?? 0;

  const cuts = [];
  let lowest = n;
  targets.forEach((target, k) => {
    let best = lowest;
    let miss = Infinity;
    // Leave room above for the bands still to come, so none is ever empty.
    for (let s = lowest; s <= 6 * n - (4 - k); s++) {
      const off = Math.abs(upTo[s] - target);
      if (off < miss) {
        miss = off;
        best = s;
      }
    }
    cuts.push(best);
    lowest = best + 1;
  });
  return cuts;
}

export function bandOf(total, cuts) {
  const i = cuts.findIndex((top) => total <= top);
  return BANDS[i === -1 ? 4 : i];
}

// ---------------------------------------------------------------------------
// The game
// ---------------------------------------------------------------------------

/** How fast the TV writes, in ms a letter. public/onepiece-host.js uses the same number. */
const INK = 38;
/** How long to leave something on the page: the time it takes to write on, and a moment to take it in. */
const read = (text, extra = 2200) => 700 + String(text).length * INK + extra;

export async function run(ctx) {
  const story = ctx.content.onepiece;
  const star = ctx.content.party?.guestOfHonour || 'the Captain';
  const ship = String(story.ship ?? 'Revenge').replaceAll('{star}', star);
  const scenes = new Map(story.scenes.map((s) => [s.id, s]));
  const odds = BANDS.map((b) => Number(story.odds?.[b]) || 0);

  const has = new Set(); // kit, woes and notes the crew is carrying
  const fresh = new Set(); // ...and which of them arrived in the current scene
  const tally = new Map(ctx.players.map((p) => [p, { total: 0, sixes: 0, ones: 0 }]));
  let marker = 0; // the dragon fight: positive is good for the crew
  let hero = null; // highest die of the latest roll
  let jonah = null; // lowest
  let sceneNo = 0;

  const fill = (text, extra = {}) =>
    String(text ?? '')
      .replaceAll('{star}', star)
      .replaceAll('{ship}', ship)
      .replace(/\{(\w+)\}/g, (whole, name) => extra[name] ?? whole);

  const test = (rule) => (!rule.if || has.has(rule.if)) && (!rule.unless || !has.has(rule.unless));
  const give = (id) => {
    if (!has.has(id)) fresh.add(id);
    has.add(id);
  };

  /** Work through a list of "also" lines: returns the sentences that apply, and does what they say. */
  function alsoLines(list, names) {
    const out = [];
    for (const rule of list ?? []) {
      if (!test(rule)) continue;
      if (rule.loseOne) {
        const gone = rule.loseOne.find((id) => has.has(id));
        if (!gone) continue; // nothing to lose, so nothing to say
        has.delete(gone);
      }
      for (const id of rule.gain ?? []) give(id);
      for (const id of rule.lose ?? []) has.delete(id);
      if (rule.text) out.push(fill(rule.text, names));
    }
    return out;
  }

  const kitList = () => Object.keys(story.kit).filter((id) => has.has(id)).map((id) => ({ id, ...story.kit[id], fresh: fresh.has(id) }));
  const woeList = () => Object.keys(story.woes).filter((id) => has.has(id)).map((id) => ({ id, ...story.woes[id], fresh: fresh.has(id) }));

  /** What the island needs to know to act the story out (see public/onepiece-host.js). */
  const world = (set, more = {}) => ({ set, has: [...has], crew: ctx.players.map((p) => p.id), hero: hero?.id ?? null, jonah: jonah?.id ?? null, marker, ...more });

  const PAGE = (text, sub) => ({ screen: 'op-page', text, sub });

  // ----- the rules, then the title page -----

  await ctx.intro(story.rules ?? []);

  ctx.screen({
    sfx: 'paper',
    host: () => ({ screen: 'op', key: 'op-title', music: story.title.music ?? null, phase: 'title', cover: { heading: fill(story.title.heading), kept: fill(story.title.kept), note: fill(story.title.note) }, kit: [], woes: [], world: world('sea') }),
    player: () => ({ ...PAGE(fill(story.title.heading), fill(story.title.kept)), key: 'op-title' }),
  });
  await ctx.wait(7000);

  // ----- the story -----

  let id = story.start;
  while (id && id !== 'ending') id = await playScene(scenes.get(id));
  await playEnding();
  await muster();

  // -------------------------------------------------------------------------

  async function playScene(scene) {
    sceneNo++;
    fresh.clear();
    const key = `op-${sceneNo}-${scene.id}`;
    const names = { player: sample(ctx.players).name }; // {player} is the same pirate all the way through a scene
    const entry = [fill(scene.entry, names), ...alsoLines(scene.also, names)];
    const music = scene.music ?? null; // each part of the story has its own tune (see public/onepiece-sound.js)

    // What the screens are told. `more` grows as the scene moves through its phases.
    let more = { phase: 'entry' };
    const base = () => ({
      screen: 'op',
      key,
      music,
      scene: { id: scene.id, name: scene.name, header: scene.header, fight: !!scene.fight },
      entry,
      kit: kitList(),
      woes: woeList(),
      gauge: scene.fight ? { marker, ends: story.fight.endings } : null,
      ...more,
      world: world(scene.set, { scene: scene.id, phase: more.phase, band: more.band ?? null }),
    });
    const show = (opts = {}) =>
      ctx.screen({ host: base, player: () => ({ ...PAGE(scene.name, 'Eyes on the log.'), key: `${key}-${more.phase}` }), ...opts });

    // --- 1. the entry ---
    const ask = scene.options ? fill(scene.ask ?? '') : '';
    show({ sfx: 'paper' });
    await ctx.wait(read(entry.join(' '), scene.options ? 1200 : 3200));
    if (!scene.options) return scene.next;

    // --- 2. the vote ---
    const open = scene.options.map((o, i) => ({ ...o, id: i })).filter((o) => (!o.needs || has.has(o.needs)) && (!o.unless || !has.has(o.unless)));
    const votes = new Map(); // player -> option id
    const optionViews = (chosen = null) =>
      open.map((o) => ({
        id: o.id,
        mark: o.mark,
        markName: story.marks?.[o.mark] ?? o.mark,
        text: fill(o.text, names),
        votes: ctx.players.filter((p) => votes.get(p) === o.id).map((p) => p.id),
        chosen: chosen === null ? null : o.id === chosen,
      }));

    more = { phase: 'vote', ask, options: optionViews() };
    ctx.screen({
      sfx: 'bell',
      host: () => ({ ...base(), options: optionViews() }),
      player: (p) => ({ screen: 'op-vote', key: `${key}-vote`, heading: scene.name, ask, options: optionViews().map(({ id, mark, markName, text }) => ({ id, mark, markName, text })), mine: votes.get(p) ?? null }),
      onAction: (p, msg) => {
        if (msg.type === 'op-vote' && msg.key === `${key}-vote` && open.some((o) => o.id === msg.id)) votes.set(p, msg.id);
      },
    });
    await ctx.wait(ctx.seconds('vote', 20), { timer: true, until: () => ctx.players.every((p) => votes.has(p) || ctx.away(p)) });

    const counts = open.map((o) => ({ o, n: [...votes.values()].filter((v) => v === o.id).length }));
    const most = Math.max(...counts.map((c) => c.n));
    const tied = counts.filter((c) => c.n === most);
    const option = sample(tied).o;
    if (option.spends) has.delete(option.spends);

    // --- how the scale is tilted for this roll ---
    const helped = [];
    const hurt = [];
    let tilt = 0;
    for (const [thing, by] of Object.entries(scene.tilts ?? {})) {
      if (!has.has(thing)) continue;
      tilt += by;
      (by > 0 ? helped : hurt).push((story.kit[thing] ?? story.woes[thing])?.name ?? thing);
    }
    if (option.tilt) {
      tilt += option.tilt;
      (option.tilt > 0 ? helped : hurt).push(story.kit[option.spends]?.name ?? 'a good plan');
    }
    if (option.mark === 'daft') {
      tilt -= 1;
      hurt.push('a daft plan');
    }
    tilt = clamp(tilt, -2, 2);

    const n = ctx.players.length;
    const cuts = cutsFor(n, tilt, odds);
    const canny = option.mark === 'canny';
    const lead = fill(option.lead, names);
    const dice = new Map(); // player -> { n, cat }
    const diceViews = () => ctx.players.map((p) => ({ id: p.id, n: dice.get(p)?.n ?? null, cat: dice.get(p)?.cat ?? false }));
    const total = () => [...dice.values()].reduce((sum, d) => sum + d.n, 0);
    const rollView = () => ({ dice: diceViews(), total: total(), count: n, scale: { min: n, max: 6 * n, cuts }, need: cuts[2] + 1, tilt, helped, hurt, canny });

    // --- 3. what was chosen, and its opening line ---
    more = { phase: 'chosen', ask, options: optionViews(option.id), tied: tied.length > 1, lead, roll: rollView() };
    show({ sfx: tied.length > 1 ? 'coins' : 'opStrike' });
    await ctx.wait(read(lead, tied.length > 1 ? 2800 : 1200));

    // --- 4. the roll ---
    const roll = (p, cat = false) => {
      if (dice.has(p)) return;
      const value = 1 + Math.floor(Math.random() * 6);
      dice.set(p, { n: value, cat });
      const t = tally.get(p);
      t.total += value;
      if (value === 6) t.sixes++;
      if (value === 1) t.ones++;
    };
    more = { ...more, phase: 'roll' };
    ctx.screen({
      sfx: 'opRattle',
      host: () => ({ ...base(), roll: rollView() }),
      player: (p) => ({ screen: 'op-roll', key: `${key}-roll`, heading: scene.name, n: dice.get(p)?.n ?? null, need: cuts[2] + 1, total: total(), rolled: dice.size, count: n }),
      onAction: (p, msg) => {
        if (msg.type === 'op-roll' && msg.key === `${key}-roll`) roll(p);
      },
    });
    await ctx.wait(ctx.seconds('roll', 12), { timer: true, until: () => ctx.players.every((p) => dice.has(p)) });
    for (const p of ctx.players) roll(p, true); // the ship's cat rolls for anyone who didn't

    // Who rolled best and worst (for {hero} and {jonah}); never the same pirate twice if it can be helped.
    const sorted = [...dice.entries()].sort((a, b) => b[1].n - a[1].n);
    hero = sample(sorted.filter(([, d]) => d.n === sorted[0][1].n))[0];
    const low = sorted.filter(([p, d]) => d.n === sorted.at(-1)[1].n && p !== hero);
    jonah = low.length ? sample(low)[0] : sample(sorted.filter(([p]) => p !== hero))[0];
    names.hero = hero.name;
    names.jonah = jonah.name;

    // --- 5. the count: the marker slides along the scale and the seal comes down ---
    const rolled = bandOf(total(), cuts);
    const band = canny ? (rolled === 'diabolical' ? 'bad' : rolled === 'perfect' ? 'good' : rolled) : rolled;
    more = { ...more, phase: 'tally', roll: rollView(), rolled };
    show({ sfx: 'drumroll', player: (p) => ({ screen: 'op-roll', key: `${key}-roll`, heading: scene.name, n: dice.get(p).n, need: cuts[2] + 1, total: total(), rolled: n, count: n, done: true }) });
    await ctx.wait(3000);

    // --- 6. the outcome ---
    const outcome = option.outcomes?.[band] ?? scene.outcomes[band];
    for (const thing of outcome.gain ?? []) give(thing);
    for (const thing of outcome.woe ?? []) give(thing);
    if (outcome.note) give(outcome.note);
    const text = [fill(outcome.text, names), ...alsoLines(outcome.also, names)];
    const moved = scene.fight ? (outcome.move ?? story.fight.moves[band]) : 0;
    marker += moved;

    const label = story.bands?.[band] ?? band;
    more = { ...more, phase: 'outcome', band, bandName: label, softened: band !== rolled, outcome: text, moved, hero: hero.id, jonah: jonah.id };
    show({
      sfx: band === 'perfect' ? 'fanfare' : band === 'good' ? 'chest' : band === 'neutral' ? 'opStamp' : band === 'bad' ? 'opBad' : 'opDoom',
      player: (p) => ({ screen: 'op-page', key: `${key}-outcome`, band, text: label, sub: p === hero ? 'Highest roll. The log will remember.' : p === jonah ? 'Lowest roll. The log will remember that too.' : 'Eyes on the log.' }),
    });
    await ctx.wait(read(text.join(' '), 4200));

    return outcome.next ?? scene.next;
  }

  async function playEnding() {
    const ends = story.fight.endings;
    const band = marker >= ends.perfect ? 'perfect' : marker >= ends.good ? 'good' : marker >= ends.neutral ? 'neutral' : marker > ends.diabolical ? 'bad' : 'diabolical';
    const end = story.endings[band];
    const names = { hero: hero?.name ?? star, jonah: jonah?.name ?? star, player: sample(ctx.players).name };
    const paras = end.entry.map((t) => fill(t, names));
    const other = end.otherHand ? { text: [fill(end.otherHand.text, names), ...alsoLines(end.otherHand.also, names)].join(' '), signed: end.otherHand.signed } : null;
    fresh.clear();

    // One paragraph at a time, then (in the worst ending) the entry in another hand.
    const steps = paras.length + (other ? 1 : 0);
    for (let shown = 1; shown <= steps; shown++) {
      const isOther = shown > paras.length;
      const line = isOther ? other.text : paras[shown - 1];
      ctx.screen({
        sfx: shown === 1 ? (band === 'perfect' ? 'finale' : band === 'diabolical' ? 'opRoar' : 'paper') : isOther ? 'opDoom' : null,
        host: () => ({
          screen: 'op',
          key: 'op-ending',
          music: end.music ?? null,
          phase: 'ending',
          ending: { band, name: end.name, header: end.header, paras: paras.slice(0, Math.min(shown, paras.length)), signed: shown >= paras.length && !end.burns ? fill(end.signed ?? '') : '', other: isOther ? other : null, burns: !!end.burns, step: shown },
          kit: kitList(),
          woes: woeList(),
          world: world(end.set, { ending: band, step: shown }),
        }),
        player: () => ({ screen: 'op-page', key: `op-ending-${shown}`, band, text: end.name, sub: 'Eyes on the log.' }),
      });
      await ctx.wait(read(line, shown === steps ? 7000 : 1800));
    }
  }

  /** The last page: who rolled what, and a few titles. Stays up until the captain moves on. */
  async function muster() {
    const rows = ctx.players.map((p) => ({ id: p.id, ...tally.get(p) })).sort((a, b) => b.total - a.total);
    const best = (field, pick = Math.max) => {
      const value = pick(...rows.map((r) => r[field]));
      return rows.filter((r) => r[field] === value && (field === 'total' || value > 0)).map((r) => r.id);
    };
    const titles = story.muster?.titles ?? {};
    const honours = [
      { ...titles.luckiest, ids: best('total') },
      { ...titles.jonah, ids: best('total', Math.min) },
      { ...titles.sixes, ids: best('sixes') },
      { ...titles.ones, ids: best('ones') },
    ].filter((h) => h.name && h.ids.length);

    let done = false;
    ctx.screen({
      sfx: 'paper',
      host: () => ({ screen: 'op', key: 'op-muster', music: story.muster?.music ?? null, phase: 'muster', muster: { heading: story.muster?.heading ?? 'Crew Muster', intro: story.muster?.intro ?? '', rows, honours }, kit: kitList(), woes: woeList(), world: world('muster') }),
      player: (p) => {
        const mine = honours.filter((h) => h.ids.includes(p.id)).map((h) => h.name);
        return { screen: 'op-end', key: 'op-muster', total: tally.get(p).total, titles: mine, canContinue: p === ctx.room.vip() };
      },
      onAction: (p, msg) => {
        if (msg.type === 'continue' && (p === null || p === ctx.room.vip())) done = true;
      },
    });
    await ctx.wait(10 * 60 * 1000, { until: () => done });
  }
}
