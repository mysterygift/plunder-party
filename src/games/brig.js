// TO THE BRIG WITH YE - a hidden-mutineer talking game.
//
// A few of the crew are secretly mutineers, out to wreck the ship before she
// reaches the island. Everybody else is loyal. A voyage is a handful of legs,
// and each leg goes like this:
//   1. PICK:  the captain (it passes round the crew) sends two pirates up the
//             crow's nest.
//   2. NEST:  ahead, the channel forks round a rock. One side hides a reef, and
//             only the two lookouts can see which. Each hoists a flag in secret:
//             red for port, green for starboard.
//   3. HELM:  the TV shows the two flags, but not who raised which. If they
//             disagree, one of the lookouts is lying. The crew argues it out
//             (out loud, in the room) and votes on the heading.
//   4. The ship goes where the vote says. The wrong side holes the hull.
//   5. BRIG:  the crew votes somebody into the brig, or nobody. A prisoner can
//             still heckle, but cannot vote, climb the nest or be captain. The
//             brig only has so many cells: when it is full, a new prisoner turns
//             the longest-serving one loose.
// Hole the hull enough times and the mutineers win. Reach the island and the
// loyal crew does.
//
// Some legs are foggy, and everybody is told so. In fog each lookout's
// spyglass has a one-in-four chance of showing them the wrong side, and they
// can't tell when it has. So in fog a split doesn't prove anybody lied, and a
// mutineer caught out can blame the weather.
//
// A mutineer is a side you are on for the whole voyage; a lookout is a job for
// one leg. Mutineers know each other, but they see the sea no better than
// anybody else: their only weapons are a false flag when they are sent up the
// nest, a vote for the wrong heading, and getting honest pirates locked up.
//
// Legs, the hull, how many mutineers and the timers are in content/brig.json.

import { shuffle, sample, clamp } from '../util.js';

export const meta = {
  id: 'brig',
  name: 'To the Brig with Ye',
  icon: '⛓️',
  tagline: 'Somebody is steering us on to the rocks',
  blurb: 'A few of you are secret mutineers. Two lookouts flag the way past the reef; if they disagree, one is lying. Argue, steer, then lock somebody up.',
  min: 5,
};

const POINTS = {
  rightWay: 100, // a loyal pirate who voted for the safe side
  reef: 250, // every mutineer, each time she strikes
  collar: 150, // a loyal pirate whose brig vote named a real mutineer
  stitchUp: 150, // a mutineer who helped vote an honest pirate into the brig
  win: 2000, // everybody on the winning side
};

// What the crew size decides, unless content/brig.json says otherwise. These
// came out of a few hundred thousand simulated voyages: they keep the mutineers
// winning somewhere between a third and a half of the time.
export const autoMutineers = (crew) => (crew <= 6 ? 2 : crew <= 9 ? 3 : 4);
export const autoCells = (crew) => (crew <= 6 ? 1 : crew <= 9 ? 2 : 3);
export const autoLegs = (crew) => (crew % 3 === 0 ? 6 : 5); // 6, 9 and 12 are where the mutineers are thinnest on the ground

const MISREAD = 0.25; // in fog, the chance a spyglass shows a lookout the wrong side

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
const ORDINALS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const SIDES = ['port', 'starboard'];
const HAZARDS = ['Dead Man’s Gap', 'The Widow’s Teeth', 'Shipbreaker Sound', 'The Devil’s Molars', 'Hangman’s Reach', 'Barnacle Alley'];

/**
 * What the narrator makes of a leg: did she strike, did the flags disagree, did
 * the crew do as the flags said, and was it foggy? In fog a wrong flag might be
 * an honest mistake, so the narrator never calls it a lie.
 */
function verdict(hit, split, followed, fog) {
  if (hit) return `She’s struck the reef! ${split ? 'The crew believed the wrong flag.' : !followed ? 'The flags were true, and the crew ignored them.' : fog ? 'Both flags were wrong. Fog, or foul play?' : 'Both lookouts lied!'}`;
  if (split) return fog ? 'Clear water! The crew picked the right flag.' : 'Clear water! The crew saw through the lie.';
  return followed ? null : fog ? 'Clear water! Both flags were wrong, and the crew ignored them.' : 'Clear water! Both lookouts lied, and the crew called their bluff.';
}

/** Either setting from the content file as a whole number in range, or the fallback when it is missing or 0. */
const setting = (value, fallback, lo, hi) => clamp(Math.round(Number(value)) || fallback, lo, hi);

export async function run(ctx) {
  const settings = ctx.content.brig ?? {};
  const crew = ctx.players.length;
  const voyages = setting(settings.voyages, 1, 1, 5);
  const legs = setting(settings.legs, autoLegs(crew), 2, 9);
  const hullMax = setting(settings.hull, 3, 1, 5);
  const traitors = setting(settings.mutineers, autoMutineers(crew), 1, Math.max(1, Math.floor((crew - 1) / 2)));
  const cells = setting(settings.brigSize, autoCells(crew), 1, Math.max(1, crew - 4)); // always leaves four on deck
  const fogChance = settings.fog == null || settings.fog === '' || !Number.isFinite(Number(settings.fog)) ? 0.35 : clamp(Number(settings.fog), 0, 1); // the share of legs that are foggy; 0 turns it off
  const drink = typeof settings.drink === 'string' ? settings.drink.trim() : '';
  const hazards = ctx.deck('hazards', Array.isArray(settings.hazards) && settings.hazards.length ? settings.hazards : HAZARDS);

  // Four or five short rules: the intro screen has room for about seven lines, and the TV and phones explain the rest as it comes up.
  const strikes = hullMax === 1 ? 'once' : hullMax === 2 ? 'twice' : `${(WORDS[hullMax] ?? String(hullMax)).toLowerCase()} times`;
  await ctx.intro([
    `${WORDS[traitors] ?? traitors} of you are secretly mutineers. Your phone will tell you.`,
    'Each leg, two pirates climb the crow’s nest and flag the safe way past the reef.',
    'If their flags disagree, one is lying. Argue it out, then vote on the heading.',
    ...(fogChance > 0 ? ['Some legs are foggy, and in fog a spyglass can be wrong.'] : []),
    `Then vote somebody into the brig. Strike the reef ${strikes} and she sinks.`,
  ]);

  for (let voyage = 1; voyage <= voyages; voyage++) {
    await sail(voyage);
    if (voyage < voyages) await ctx.scoreboard(`After voyage ${voyage}. New voyage, new mutineers!`);
  }
  await ctx.gameOver();

  // -------------------------------------------------------------------------

  /** One voyage: deal the sides, sail the legs, unmask the mutineers. */
  async function sail(voyage) {
    const order = shuffle(ctx.players); // the captaincy passes down this list
    const mutineers = new Set(shuffle(ctx.players).slice(0, traitors));
    const byId = (id) => order.find((p) => p.id === id);
    const ids = (list) => [...list].map((p) => p.id);
    const card = (p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color });

    let brig = []; // who is locked up, longest-serving first
    let hull = hullMax;
    let tired = []; // last leg's lookouts: they have earned a sit down
    let turn = 0;
    const log = []; // how each leg went: 'safe' or 'hit'
    const free = () => order.filter((p) => !brig.includes(p));

    /** What a phone knows that the TV must not show. */
    const secret = (p) => ({
      role: mutineers.has(p) ? 'mutineer' : 'crew',
      mates: mutineers.has(p) ? [...mutineers].filter((m) => m !== p).map((m) => m.name) : [],
      traitors,
    });
    /** What every screen shows: how far along she is and what state she is in. */
    const chart = (leg) => ({ voyage, voyages, leg, legs, hull, hullMax, log: [...log], traitors, cells, crew: ids(order), brig: ids(brig) });

    // --- the sides are dealt ---
    const seen = new Set();
    ctx.screen({
      say: `${voyages > 1 ? `Voyage ${ORDINALS[voyage] ?? voyage}. ` : ''}Look at your phone, and keep it to yourself.`,
      sfx: 'tbRoles',
      host: () => ({ screen: 'tb', key: `tb-${voyage}-0`, phase: 'roles', ...chart(0), ready: ids(seen) }),
      player: (p) => ({ screen: 'tb-role', key: `tb-${voyage}-role`, ready: seen.has(p), ...secret(p) }),
      onAction: (p, msg) => {
        if (msg.type === 'tb-ready') seen.add(p);
      },
    });
    await ctx.wait(ctx.seconds('roles', 25), { timer: true, until: () => ctx.players.every((p) => seen.has(p) || ctx.away(p)) });

    let fate = 'on';
    let leg = 0;
    while (fate === 'on') fate = await playLeg(++leg);

    // --- the unmasking ---
    const win = fate === 'sunk' ? 'mutineers' : 'crew';
    for (const p of ctx.players) if (mutineers.has(p) === (win === 'mutineers')) ctx.award(p, POINTS.win);
    const names = [...mutineers].map((p) => p.name);
    const listed = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
    ctx.screen({
      say: `${win === 'crew' ? 'Land ho! The loyal crew win.' : 'She’s going down! The mutineers win.'} The ${names.length > 1 ? 'mutineers were' : 'mutineer was'} ${listed}.`,
      sfx: win === 'crew' ? 'tbLand' : 'tbSunk',
      host: () => ({ screen: 'tb', key: `tb-${voyage}-end`, phase: 'end', ...chart(leg), finale: { win, mutineers: ids(mutineers) } }),
      player: (p) => {
        const won = mutineers.has(p) === (win === 'mutineers');
        return {
          screen: 'tb-wait',
          key: `tb-${voyage}-end`,
          icon: won ? '🏆' : win === 'crew' ? '🏝️' : '🌊',
          text: win === 'crew' ? 'Land ho! The crew win.' : 'Sunk! The mutineers win.',
          sub: `${mutineers.has(p) ? 'You were a mutineer.' : 'You were loyal.'}${won ? ` +${POINTS.win.toLocaleString('en')} doubloons` : ''}`,
          unmasked: true,
          ...secret(p),
        };
      },
    });
    await ctx.wait(13000);

    // -----------------------------------------------------------------------

    /** One leg of the voyage. Returns 'on', 'home' (that was the last leg) or 'sunk'. */
    async function playLeg(leg) {
      const key = `tb-${voyage}-${leg}`;
      const hazard = hazards.draw();
      const safe = sample(SIDES);
      const fog = Math.random() < fogChance;
      const other = safe === 'port' ? 'starboard' : 'port';
      const sight = new Map(); // lookout -> the side their spyglass says is safe (in fog, maybe wrongly)

      let captain;
      do captain = order[turn++ % order.length];
      while (brig.includes(captain));

      // Who may climb: nobody goes up two legs running, unless that leaves the
      // captain no real choice, in which case one of last leg's pair may go again.
      const rested = free().filter((p) => !tired.includes(p));
      const strict = rested.length >= 3;
      const eligible = strict ? rested : free();
      const validPair = (a, b) => a && b && a !== b && eligible.includes(a) && eligible.includes(b) && !(tired.includes(a) && tired.includes(b));

      const st = { phase: 'pick', nest: [], flags: null, voted: new Set(), result: null, jail: null, parrot: false };
      const raised = new Map(); // lookout -> the flag they hoisted
      const votes = new Map(); // pirate -> the side they voted to steer
      const ballots = new Map(); // pirate -> who they would lock up (null = nobody)
      const gains = new Map(); // pirate -> doubloons won in the phase just gone
      const gain = (p, points) => {
        ctx.award(p, points);
        gains.set(p, (gains.get(p) ?? 0) + points);
      };
      const won = (p) => (gains.get(p) ? `+${gains.get(p)} doubloons` : '');

      const hostView = () => ({
        screen: 'tb',
        key,
        music: ['pick', 'nest', 'helm', 'brig'].includes(st.phase) ? 'brig' : null, // the band stops for every reveal
        phase: st.phase,
        ...chart(leg),
        hazard,
        fog,
        captain: captain.id,
        nest: ids(st.nest),
        flags: st.flags,
        voted: ids(st.voted),
        result: st.result,
        jail: st.jail,
        parrot: st.parrot,
      });

      const phone = (p) => {
        const jailed = brig.includes(p);
        const common = { jailed, leg, legs, hull, hullMax, fog, ...secret(p) };
        const wait = (icon, text, sub = '') => ({ screen: 'tb-wait', key: `${key}-${st.phase}`, icon, text, sub, ...common });
        const lookouts = st.nest.map((n) => n.name).join(' and ');
        const r = st.result;

        switch (st.phase) {
          case 'pick':
            if (p === captain) {
              return { screen: 'tb-pick', key: `${key}-pick`, options: eligible.map((o) => ({ ...card(o), tired: tired.includes(o), me: o === p })), ...common };
            }
            if (jailed) return wait('⛓️', 'You’re in the brig.', 'Heckle through the bars. You can’t vote or climb.');
            return wait('🧭', `${captain.name} is captain.`, 'They are choosing two pirates to climb the crow’s nest.');

          case 'nest':
            if (st.nest.includes(p)) {
              return { screen: 'tb-nest', key: `${key}-nest`, safe: sight.get(p), mine: raised.get(p) ?? null, mate: st.nest.find((n) => n !== p).name, ...common };
            }
            if (jailed) return wait('⛓️', 'You’re in the brig.', `${lookouts} are up the crow’s nest.`);
            return wait(fog ? '🌫️' : '🔭', `${lookouts} are up the crow’s nest.`, fog ? 'Only they can see the reef, if the fog lets them.' : 'Only they can see the reef.');

          case 'flags':
            return st.nest.includes(p) ? wait('😇', 'The flags are up.', 'Look innocent.') : wait('👀', 'Eyes on the big screen!');

          case 'helm':
            if (jailed) return wait('⛓️', 'You’re in the brig.', 'No vote for you. Shout advice through the bars.');
            return {
              screen: 'tb-helm',
              key: `${key}-helm`,
              flags: st.flags,
              mine: votes.get(p) ?? null,
              saw: st.nest.includes(p) ? sight.get(p) : null, // a lookout knows what they saw, whatever they hoisted (in fog it may be wrong)
              lookouts,
              ...common,
            };

          case 'steer':
            return wait('⚓', r.choice === 'port' ? 'Hard to port!' : 'Hard to starboard!', 'Hold on to something.');

          case 'reef':
            if (mutineers.has(p)) return wait('😈', 'She’s struck the reef!', `${won(p)}. Look horrified.`);
            if (sight.has(p) && sight.get(p) !== safe) return wait('🌫️', 'She’s struck the reef!', `The fog fooled your spyglass. The safe way was ${safe}.${won(p) ? ` ${won(p)}` : ''}`);
            return wait('💥', 'She’s struck the reef!', won(p) ? `You voted the right way. ${won(p)}` : `The safe way was ${safe}.`);

          case 'clear':
            if (mutineers.has(p)) return wait('😒', 'Clear water.', 'Curses. Look pleased.');
            if (sight.has(p) && sight.get(p) !== safe) return wait('🌫️', 'Clear water!', `The fog fooled your spyglass: ${safe} was safe all along.${won(p) ? ` ${won(p)}` : ''}`);
            return wait('🌊', 'Clear water!', won(p));

          case 'brig':
            if (jailed) return wait('⛓️', 'You’re in the brig.', brig.length >= cells ? 'If they lock somebody else up, you could be out.' : 'The crew is voting on who joins you.');
            return {
              screen: 'tb-brig',
              key: `${key}-brig`,
              options: free().filter((o) => o !== p).map(card),
              mine: ballots.has(p) ? (ballots.get(p)?.id ?? 'nobody') : null,
              ...common,
            };

          default: {
            // 'brigged': the door slams (or doesn't)
            const j = st.jail;
            if (j.sent === p.id) return wait('⛓️', 'To the brig with ye!', drink ? `Take a swig of ${drink} on your way down.` : 'You can still heckle. You can’t vote or climb.');
            if (j.freed === p.id) return wait('🗝️', 'You’re out!', 'Back on deck with you.');
            return wait(j.sent ? '⛓️' : '🤷', j.sent ? `${byId(j.sent).name} goes to the brig.` : 'Nobody goes below.', won(p));
          }
        }
      };

      // --- 1. the captain picks two lookouts ---
      let pair = null;
      ctx.screen({
        say: `${leg === legs ? 'The last leg' : `Leg ${ORDINALS[leg] ?? leg}`}: ${hazard}${fog ? ', in thick fog. A spyglass could be wrong today' : ''}. Captain ${captain.name}, send two pirates up the crow’s nest.`,
        sfx: 'tbBell',
        host: hostView,
        player: phone,
        onAction: (p, msg) => {
          if (p !== captain || msg.type !== 'tb-pick' || msg.key !== `${key}-pick` || pair || !Array.isArray(msg.ids)) return;
          const [a, b] = msg.ids.map(byId);
          if (validPair(a, b)) pair = [a, b];
        },
      });
      await ctx.wait(ctx.seconds('pick', 30), { timer: true, until: () => pair !== null || ctx.away(captain) });
      if (!pair) {
        // The captain dithered: the ship's parrot sends up whoever is nearest.
        const first = sample(eligible.filter((p) => eligible.some((q) => validPair(p, q))));
        pair = [first, sample(eligible.filter((q) => validPair(first, q)))];
        st.parrot = true;
      }

      // --- 2. up the crow's nest: each lookout hoists a flag ---
      st.phase = 'nest';
      st.nest = pair;
      for (const p of pair) sight.set(p, fog && Math.random() < MISREAD ? other : safe);
      ctx.screen({
        sfx: 'tbClimb',
        host: hostView,
        player: phone,
        onAction: (p, msg) => {
          if (!pair.includes(p) || msg.type !== 'tb-flag' || msg.key !== `${key}-nest` || raised.has(p) || !SIDES.includes(msg.side)) return;
          raised.set(p, msg.side);
          st.voted.add(p);
        },
      });
      await ctx.wait(ctx.seconds('nest', 25), { timer: true, until: () => pair.every((p) => raised.has(p) || ctx.away(p)) });
      for (const p of pair) if (!raised.has(p)) raised.set(p, sight.get(p)); // a lookout who froze gets an honest flag (honest about what they saw)

      // --- 3. the flags, for all to see (but not who raised which) ---
      st.phase = 'flags';
      st.voted = new Set();
      st.flags = pair.map((p) => raised.get(p)).sort(); // sorted, so the order gives nothing away
      const split = st.flags[0] !== st.flags[1];
      ctx.screen({
        say: split ? (fog ? 'The flags disagree. A liar, or the fog?' : 'The flags disagree. One of them is lying!') : `Both flags say ${st.flags[0]}.`,
        sfx: split ? 'tbSplit' : 'tbFlags',
        host: hostView,
        player: phone,
      });
      await ctx.wait(split ? 5000 : 4000);

      // --- 4. argue, then vote on the heading ---
      st.phase = 'helm';
      ctx.screen({
        host: hostView,
        player: phone,
        onAction: (p, msg) => {
          if (brig.includes(p) || msg.type !== 'tb-steer' || msg.key !== `${key}-helm` || votes.has(p) || !SIDES.includes(msg.side)) return;
          votes.set(p, msg.side);
          st.voted.add(p);
        },
      });
      await ctx.wait(ctx.seconds(split ? 'argue' : 'agree', split ? 75 : 30), { timer: true, until: () => free().every((p) => votes.has(p) || ctx.away(p)) });

      const tally = { port: 0, starboard: 0 };
      for (const side of votes.values()) tally[side]++;
      const tie = tally.port === tally.starboard;
      // A dead heat: the captain has the wheel. (No captain's vote either? Follow the flags, or toss a doubloon.)
      const choice = !tie ? (tally.port > tally.starboard ? 'port' : 'starboard') : (votes.get(captain) ?? (split ? sample(SIDES) : st.flags[0]));
      const hit = choice !== safe;

      st.phase = 'steer';
      st.voted = new Set();
      st.result = { choice, tally, tie };
      ctx.screen({ sfx: 'tbTurn', host: hostView, player: phone });
      await ctx.wait(3600);

      // --- 5. ...and we find out ---
      if (hit) hull--;
      log.push(hit ? 'hit' : 'safe');
      for (const [p, side] of votes) if (!mutineers.has(p) && side === safe) gain(p, POINTS.rightWay);
      if (hit) for (const m of mutineers) gain(m, POINTS.reef);
      st.result = { ...st.result, safe, hit, split, sunk: hull === 0 };
      st.phase = hit ? 'reef' : 'clear';
      ctx.screen({
        say: verdict(hit, split, choice === st.flags[0], fog),
        sfx: hit ? 'tbReef' : 'tbClear',
        host: hostView,
        player: phone,
      });
      await ctx.wait(hit ? 7500 : 6000);

      tired = pair;
      if (hull === 0) return 'sunk';
      if (leg === legs) return 'home';

      // --- 6. who goes to the brig? ---
      gains.clear();
      st.phase = 'brig';
      ctx.screen({
        say: 'Who goes to the brig? Argue it out, then vote.',
        host: hostView,
        player: phone,
        onAction: (p, msg) => {
          if (brig.includes(p) || msg.type !== 'tb-jail' || msg.key !== `${key}-brig` || ballots.has(p)) return;
          const who = msg.id === 'nobody' ? null : byId(msg.id);
          if (who === undefined || who === p || (who && brig.includes(who))) return;
          ballots.set(p, who);
          st.voted.add(p);
        },
      });
      await ctx.wait(ctx.seconds('brig', 45), { timer: true, until: () => free().every((p) => ballots.has(p) || ctx.away(p)) });

      // Most votes goes below: but it takes at least two, and it must beat both
      // the runner-up and "nobody".
      const against = new Map(); // accused -> who voted for them
      const nobody = [];
      for (const [voter, who] of ballots) {
        if (who) against.set(who, [...(against.get(who) ?? []), voter]);
        else nobody.push(voter);
      }
      const ranked = [...against.entries()].sort((a, b) => b[1].length - a[1].length);
      const most = ranked[0]?.[1].length ?? 0;
      const sent = most >= 2 && most > (ranked[1]?.[1].length ?? 0) && most > nobody.length ? ranked[0][0] : null;

      for (const [voter, who] of ballots) {
        if (!who) continue;
        if (!mutineers.has(voter) && mutineers.has(who)) gain(voter, POINTS.collar);
        if (mutineers.has(voter) && who === sent && !mutineers.has(who)) gain(voter, POINTS.stitchUp);
      }
      let freed = null;
      if (sent) {
        brig.push(sent);
        if (brig.length > cells) freed = brig.shift();
      }
      st.phase = 'brigged';
      st.voted = new Set();
      st.jail = { votes: ranked.map(([who, by]) => ({ id: who.id, by: ids(by) })), nobody: ids(nobody), sent: sent?.id ?? null, freed: freed?.id ?? null, drink };
      ctx.screen({
        say: sent ? `To the brig with ye, ${sent.name}!${freed ? ` ${freed.name} is turned loose.` : ''}` : 'The crew can’t agree. Nobody goes below.',
        sfx: sent ? 'tbBrig' : 'tbShrug',
        host: hostView,
        player: phone,
      });
      await ctx.wait(sent ? 7000 : 4500);
      return 'on';
    }
  }
}
