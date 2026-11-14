// MUTINY - one of you doesn't know the watchword.
//
// The crew is down in the hold, plotting. Every plot has a secret watchword
// (a dartboard, Blackpool, Mary Berry, one of the crew...) and every phone is
// told it. Except one: the Chameleon, the captain's spy, who has to blend in.
//
// One plot goes like this:
//   1. DEAL:   phones show the watchword, or "you are the Chameleon". The TV
//              shows what it could be: a dozen candidates on the same theme.
//   2. HANDS:  three times over, the bosun (it passes round the crew) picks a
//              question from a hand of three, or writes one: "Hands up if it's
//              bigger than a ship's cat." Everybody answers in secret, all at
//              once, and then every hand is shown together. The Chameleon is
//              guessing. But the questions are woolly on purpose, so honest
//              pirates disagree too, and that is what the arguing is about.
//   3. ARGUE:  out loud, in the room. Then everybody accuses somebody.
//   4. UNMASK: whoever has the most daggers (it has to be one pirate, no ties)
//              is unmasked. If that's the Chameleon, they get one last chance:
//              name the watchword and they slip the noose anyway. So the crew
//              can't ask questions that give the watchword away.
//
// What keeps it fresh: the watchwords and the questions are two separate
// decks, so the same pairing never comes up twice; neither repeats all night;
// the bosun can write a question of their own; and one plot a game is "One of
// Us", where the watchword is somebody in the room.
//
// Topics, questions, rounds and timers are in content/mutiny.json.

import { shuffle, sample, clamp, cleanText } from '../util.js';

export const meta = {
  id: 'mutiny',
  name: 'Mutiny',
  icon: '🦎',
  tagline: 'One of you doesn’t know the watchword',
  blurb: 'The crew is plotting, and everybody knows the secret watchword. Except the Chameleon, who is bluffing. Hands up, hands down, argue it out, then unmask the one who is blending in.',
  min: 3,
  narrator: false, // down in the hold it's all whispers: the creaking hull and the lantern do the talking
};

const POINTS = {
  sharpEye: 500, // you accused the real Chameleon (whatever the rest of the crew did)
  caught: 1000, // every loyal pirate, when the Chameleon is unmasked and can't name the watchword
  slipped: 1500, // the Chameleon: unmasked, but named the watchword
  escaped: 2500, // the Chameleon: never unmasked
};

const SHOWN = 12; // how many candidate watchwords go up on the TV
const CUSTOM_MAX = 70; // the longest question a bosun can write

/** A setting from the content file as a whole number in range, or the fallback when it is missing or 0. */
const setting = (value, fallback, lo, hi) => clamp(Math.round(Number(value)) || fallback, lo, hi);

/** Tidy a question a bosun typed: no "Hands up if" on the front (the TV adds it), no full stop on the end. */
function tidyQuestion(text) {
  return cleanText(text, CUSTOM_MAX + 20)
    .replace(/^hands?\s+up\s+if\s*(…|\.\.\.)?\s*/i, '')
    .replace(/[.…]+$/, '')
    .slice(0, CUSTOM_MAX)
    .trim();
}

export async function run(ctx) {
  const content = ctx.content.mutiny;
  const crew = ctx.players.length;
  const rounds = setting(content.rounds, 4, 1, 8);
  const perRound = setting(content.questionsPerRound, 3, 1, 5);
  // One plot a game is about the crew themselves: the one before last, so the last can be the big double.
  const crewRound = content.crewRound !== false && crew >= 4 && rounds >= 3 ? rounds - 1 : 0;
  const topics = ctx.deck('topics', content.topics);
  const rota = shuffle(ctx.players); // the bosun's whistle passes down this list
  let turn = 0;

  const byId = (id) => ctx.players.find((p) => p.id === id);
  const seats = ctx.players.map((p) => p.id);
  const present = () => ctx.players.filter((p) => !ctx.away(p));

  // For the muster at the end.
  const stats = new Map(ctx.players.map((p) => [p, { spy: 0, escapes: 0, sharp: 0, framed: 0, odd: 0 }]));

  await ctx.intro([
    'Everybody is told the secret watchword. Except one of you: the Chameleon.',
    'The bosun asks: hands up if…? Everyone answers at once, on their phone. The Chameleon has to guess.',
    'Then argue it out and accuse somebody. Most daggers gets unmasked.',
    'A caught Chameleon can still escape by naming the watchword. So don’t make it obvious.',
  ]);

  for (let n = 1; n <= rounds; n++) {
    await plot(n);
    if (n < rounds) await ctx.scoreboard(n === rounds - 1 ? 'One plot left, and it pays double' : `After plot ${n}`, 7000);
  }
  await muster();
  await ctx.gameOver();

  // -------------------------------------------------------------------------

  /** Anybody can be the Chameleon, even twice running, but those who have had a go are less likely. */
  function pickChameleon() {
    const weights = ctx.players.map((p) => (ctx.away(p) ? 0.05 : 1 / (1 + stats.get(p).spy * 2)));
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < ctx.players.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return ctx.players[i];
    }
    return ctx.players.at(-1);
  }

  async function plot(n) {
    const double = rounds > 1 && n === rounds;
    const mult = double ? 2 : 1;
    const isCrew = n === crewRound;
    const topic = isCrew ? { name: 'One of Us', kind: 'crew' } : topics.draw();
    const questions = ctx.deck(`questions:${topic.kind}`, content.questions[topic.kind]);

    // The watchword, and the candidates it hides among. A plain topic remembers which
    // of its words have been used tonight, so the same topic can come round again.
    let words = null; // [{ id, text }] for the TV and the Chameleon's guess
    let secret; // { id, text }
    if (isCrew) {
      const who = sample(ctx.players);
      words = ctx.players.map((p) => ({ id: p.id, text: p.name, player: p.id }));
      secret = words.find((w) => w.id === who.id);
    } else {
      const word = ctx.deck(`words:${topic.name}`, topic.words).draw();
      const others = shuffle(topic.words.filter((w) => w !== word)).slice(0, SHOWN - 1);
      words = shuffle([word, ...others]).map((text, i) => ({ id: i, text }));
      secret = words.find((w) => w.text === word);
    }
    const chameleon = pickChameleon();
    stats.get(chameleon).spy++;

    const key = `mu-${n}`;
    const asked = []; // { text, by, own, hands: Map(player -> true/false), shown }
    const base = { screen: 'mu', seats, round: { n, of: rounds, double, mult }, topic: { name: topic.name, kind: topic.kind }, words, perRound };
    const ledger = () => asked.map((q) => ({ text: q.text, by: q.by.id, own: q.own, hands: q.shown ? Object.fromEntries(ctx.players.map((p) => [p.id, q.hands.get(p) ?? null])) : null }));
    /** What a phone knows that the TV must not show. */
    const hush = (p) => ({
      spy: p === chameleon,
      word: p === chameleon ? null : secret.text,
      me: isCrew && p !== chameleon && secret.id === p.id, // the watchword is you
      topic: topic.name,
      kind: topic.kind,
    });
    const waiting = (p, extra) => ({ screen: 'mu-wait', ...hush(p), ...extra });

    // --- the deal ---
    const ready = new Set();
    ctx.screen({
      sfx: 'muKnock',
      host: () => ({ ...base, key: `${key}-deal`, phase: 'deal', music: 'mutiny', asked: [], ready: [...ready].map((p) => p.id) }),
      player: (p) => ({ screen: 'mu-card', key: `${key}-card`, ...hush(p), ready: ready.has(p), double, crewRound: isCrew }),
      onAction: (p, msg) => {
        if (msg.type === 'mu-ready') ready.add(p);
      },
    });
    await ctx.wait(ctx.seconds('deal', 25), { timer: true, until: () => present().every((p) => ready.has(p)) });

    // --- hands up if...? ---
    for (let i = 0; i < perRound; i++) {
      // The bosun: next on the rota who is actually here.
      let bosun = rota[turn++ % rota.length];
      for (let tries = 0; ctx.away(bosun) && tries < rota.length; tries++) bosun = rota[turn++ % rota.length];
      const cards = [questions.draw(), questions.draw(), questions.draw()].filter((c, at, all) => all.indexOf(c) === at);
      const qKey = `${key}-q${i + 1}`;
      let chosen = null; // { text, own }

      ctx.screen({
        sfx: 'muWhistle',
        host: () => ({ ...base, key: `${qKey}-ask`, phase: 'ask', music: 'mutiny', asked: ledger(), q: i + 1, bosun: bosun.id }),
        player: (p) =>
          p === bosun
            ? { screen: 'mu-ask', key: `${qKey}-ask`, ...hush(p), cards: cards.map((text, id) => ({ id, text })), max: CUSTOM_MAX, q: i + 1, of: perRound }
            : waiting(p, { key: `${qKey}-askw`, icon: '🗣️', text: `${bosun.name} is choosing a question…`, sub: 'Get your poker face on.' }),
        onAction: (p, msg) => {
          if (p !== bosun || chosen || msg.key !== `${qKey}-ask`) return;
          if (msg.type === 'mu-pick' && cards[msg.id]) chosen = { text: cards[msg.id], own: false };
          if (msg.type === 'mu-own') {
            const text = tidyQuestion(msg.text);
            if (text.length >= 3) chosen = { text, own: true };
          }
        },
      });
      await ctx.wait(ctx.seconds('ask', 30), { timer: true, until: () => chosen || ctx.away(bosun) });
      chosen ??= { text: sample(cards), own: false };

      const q = { text: chosen.text, by: bosun, own: chosen.own, hands: new Map(), shown: false };
      asked.push(q);
      ctx.screen({
        sfx: 'muKnock',
        host: () => ({ ...base, key: `${qKey}-hands`, phase: 'hands', music: 'mutiny', asked: ledger(), q: i + 1, bosun: bosun.id, question: q.text, done: [...q.hands.keys()].map((p) => p.id) }),
        player: (p) => ({ screen: 'mu-hands', key: `${qKey}-hands`, ...hush(p), question: q.text, mine: q.hands.get(p) ?? null, q: i + 1, of: perRound }),
        onAction: (p, msg) => {
          if (msg.type === 'mu-hand' && msg.key === `${qKey}-hands` && !q.hands.has(p)) q.hands.set(p, msg.up === true);
        },
      });
      await ctx.wait(ctx.seconds('hands', 20), { timer: true, until: () => present().every((p) => q.hands.has(p)) });

      // Every hand at once.
      q.shown = true;
      const up = ctx.players.filter((p) => q.hands.get(p) === true).length;
      const down = ctx.players.filter((p) => q.hands.get(p) === false).length;
      for (const p of ctx.players) {
        const mine = q.hands.get(p);
        if (p !== chameleon && mine !== undefined && (mine ? up : down) < (mine ? down : up)) stats.get(p).odd++;
      }
      ctx.screen({
        sfx: 'muHands',
        host: () => ({ ...base, key: `${qKey}-show`, phase: 'show', asked: ledger(), q: i + 1, bosun: bosun.id, question: q.text, up, down }),
        player: (p) => {
          const mine = q.hands.get(p);
          const same = mine === undefined ? 0 : (mine ? up : down) - 1;
          return waiting(p, {
            key: `${qKey}-show`,
            icon: mine === undefined ? '💤' : mine ? '✋' : '✊',
            text: mine === undefined ? 'You kept out of it.' : mine ? 'Your hand went up.' : 'You kept your hand down.',
            sub: mine === undefined ? 'Suspicious.' : same === 0 ? 'Nobody else did the same. Brazen it out.' : `So did ${same} other${same === 1 ? '' : 's'}.`,
          });
        },
      });
      await ctx.wait(ctx.seconds('show', 7));
    }

    // --- argue, then accuse ---
    const votes = new Map(); // accuser -> accused
    const suspects = (p) =>
      ctx.players
        .filter((q) => q !== p)
        .map((q) => ({ id: q.id, name: q.name, avatar: q.avatar, color: q.color, hands: asked.map((a) => a.hands.get(q) ?? null) }));
    ctx.screen({
      sfx: 'muGavel',
      host: () => ({ ...base, key: `${key}-argue`, phase: 'argue', music: 'mutiny', asked: ledger(), voted: [...votes.keys()].map((p) => p.id) }),
      player: (p) => ({ screen: 'mu-vote', key: `${key}-vote`, ...hush(p), options: suspects(p), mine: votes.get(p)?.id ?? null, questions: asked.map((a) => a.text) }),
      onAction: (p, msg) => {
        const target = byId(msg.id);
        if (msg.type === 'mu-accuse' && msg.key === `${key}-vote` && target && target !== p && !votes.has(p)) votes.set(p, target);
      },
    });
    await ctx.wait(ctx.seconds('argue', 90), { timer: true, until: () => present().every((p) => votes.has(p)) });

    // --- the daggers come down ---
    const tally = new Map(ctx.players.map((p) => [p, 0]));
    for (const target of votes.values()) tally.set(target, tally.get(target) + 1);
    const most = Math.max(0, ...tally.values());
    const top = ctx.players.filter((p) => most > 0 && tally.get(p) === most);
    const accused = top.length === 1 ? top[0] : null; // a tie unmasks nobody
    const caught = accused === chameleon;
    const sharp = ctx.players.filter((p) => p !== chameleon && votes.get(p) === chameleon);
    for (const p of sharp) stats.get(p).sharp++;
    for (const [p, n] of tally) if (p !== chameleon) stats.get(p).framed += n;

    const daggers = shuffle([...votes.values()].map((p) => p.id)); // thrown in a shuffled order, so the count builds
    const landed = 1.2 + daggers.length * 0.4; // seconds until the last one is in the deck (the TV uses the same sum)
    const verdict = {
      daggers,
      landed,
      tally: ctx.players.map((p) => ({ id: p.id, votes: tally.get(p) })),
      accused: accused?.id ?? null,
      tied: top.length > 1 ? top.map((p) => p.id) : [],
      chameleon: chameleon.id,
      caught,
    };
    ctx.screen({
      sfx: 'drumroll',
      host: () => ({ ...base, key: `${key}-verdict`, phase: 'verdict', asked: ledger(), ...verdict }),
      player: (p) => {
        if (p === chameleon) return waiting(p, { key: `${key}-verdict`, icon: '🦎', text: 'Hold still…', sub: 'Here come the daggers.' });
        return waiting(p, { key: `${key}-verdict`, icon: '🗡️', text: votes.has(p) ? `You accused ${votes.get(p).name}.` : 'You accused nobody.', sub: 'Eyes on the big screen.' });
      },
    });
    await ctx.wait((landed + 9) * 1000);

    // --- the Chameleon's last chance ---
    let guess = null; // the candidate the Chameleon named
    if (caught) {
      ctx.screen({
        sfx: 'muKnock',
        host: () => ({ ...base, key: `${key}-guess`, phase: 'guess', music: 'mutiny', asked: ledger(), chameleon: chameleon.id }),
        player: (p) =>
          p === chameleon
            ? { screen: 'mu-guess', key: `${key}-guess`, topic: topic.name, kind: topic.kind, options: words.map((w) => ({ id: w.id, text: w.text, player: w.player ? { avatar: byId(w.player).avatar, color: byId(w.player).color } : null, me: w.player === p.id })) }
            : waiting(p, { key: `${key}-guessw`, unmasked: true, icon: '🤞', text: `${chameleon.name} gets one guess at the watchword.`, sub: 'Not a word. Not a twitch.' }),
        onAction: (p, msg) => {
          if (p !== chameleon || guess || msg.type !== 'mu-guess' || msg.key !== `${key}-guess`) return;
          guess = words.find((w) => String(w.id) === String(msg.id)) ?? null;
        },
      });
      await ctx.wait(ctx.seconds('guess', 25), { timer: true, until: () => guess || ctx.away(chameleon) });
    }

    // --- what it was, and who gets what ---
    const named = caught && guess?.id === secret.id;
    const outcome = !caught ? 'escaped' : named ? 'slipped' : 'caught';
    const gains = new Map(ctx.players.map((p) => [p, 0]));
    const give = (p, amount) => {
      gains.set(p, gains.get(p) + amount * mult);
      ctx.award(p, amount * mult);
    };
    for (const p of sharp) give(p, POINTS.sharpEye);
    if (outcome === 'caught') for (const p of ctx.players) if (p !== chameleon) give(p, POINTS.caught);
    if (outcome === 'slipped') give(chameleon, POINTS.slipped);
    if (outcome === 'escaped') {
      give(chameleon, POINTS.escaped);
      stats.get(chameleon).escapes++;
    }
    if (outcome === 'slipped') stats.get(chameleon).escapes++;

    ctx.screen({
      sfx: outcome === 'caught' ? 'muCaught' : 'muEscape',
      host: () => ({
        ...base,
        key: `${key}-result`,
        phase: 'result',
        asked: ledger(),
        chameleon: chameleon.id,
        accused: accused?.id ?? null,
        caught,
        outcome,
        secret: secret.id,
        guess: guess?.id ?? null,
        sharp: sharp.map((p) => p.id),
        gains: { sharp: POINTS.sharpEye * mult, crew: outcome === 'caught' ? POINTS.caught * mult : 0, chameleon: gains.get(chameleon) },
      }),
      player: (p) => {
        const gain = gains.get(p);
        const word = isCrew ? secret.text : `“${secret.text}”`;
        let text;
        if (p === chameleon) text = outcome === 'escaped' ? 'You got clean away!' : outcome === 'slipped' ? 'Caught, but you named it!' : 'Caught, fair and square.';
        else text = outcome === 'caught' ? 'Got ’em!' : outcome === 'slipped' ? 'They wriggled free.' : 'The Chameleon got away.';
        return waiting(p, {
          key: `${key}-result`,
          unmasked: true,
          icon: p === chameleon ? (outcome === 'caught' ? '⛓️' : '🦎') : outcome === 'caught' ? '🗡️' : '💨',
          text,
          sub: `The watchword was ${word}. ${gain ? `+${gain.toLocaleString('en')} doubloons` : 'Nothing for you this time.'}`,
        });
      },
    });
    await ctx.wait(ctx.seconds('result', 11));
  }

  /** Before the treasure is shared out: who was slipperiest, sharpest, shiftiest. */
  async function muster() {
    const best = (field, least = 1) => {
      const top = Math.max(0, ...ctx.players.map((p) => stats.get(p)[field]));
      return top >= least ? { value: top, players: ctx.players.filter((p) => stats.get(p)[field] === top).map((p) => p.id) } : null;
    };
    const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
    const titles = [
      [best('escapes'), 'Slipperiest Lizard', (n) => `got away ${times(n)}`],
      [best('sharp'), 'Sharpest Eye', (n) => `spotted the Chameleon ${times(n)}`],
      [best('framed', 2), 'Shiftiest Honest Pirate', (n) => `${n} daggers, and innocent every time`],
      [best('odd', 2), 'Odd One Out', (n) => `disagreed with the crew ${times(n)}, knowing the watchword`],
    ]
      .filter(([won]) => won && won.players.length <= 3)
      .map(([won, label, value]) => ({ label, players: won.players, value: value(won.value) }));
    if (titles.length === 0) return;
    ctx.screen({
      sfx: 'fanfare',
      host: () => ({ screen: 'mu', key: 'mu-muster', phase: 'muster', seats, titles, asked: [], words: null, round: { n: rounds, of: rounds }, topic: { name: 'The Muster', kind: 'crew' } }),
      player: (p) => {
        const mine = titles.filter((t) => t.players.includes(p.id));
        return { screen: 'wait', key: 'mu-muster', icon: mine.length ? '🎖️' : '🦎', text: mine.length ? mine.map((t) => t.label).join(' & ') : 'The muster', sub: mine.length ? 'That’s you, that is.' : 'Eyes on the big screen.' };
      },
    });
    await ctx.wait(3500 + titles.length * 2600);
  }
}
