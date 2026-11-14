// SEA LAWYER - lie through your teeth.
//
// Each question is a real (and obscure) bit of sailors' slang or sea history
// with the answer blanked out. Everyone writes a convincing fake answer. Then
// all the fakes go in with the truth, and each pirate tries to pick the truth.
//   * find the truth        -> doubloons
//   * fool a crewmate        -> doubloons for every pirate who fell for your lie
// Two rounds (the second pays double), then one last question at triple.
//
// Questions live in content/sea-lawyer.json. Each has the answer and a few
// "house lies" that fill the docket when the crew is small.

import { shuffle, cleanText, readTime } from '../util.js';

export const meta = {
  id: 'lawyer',
  name: 'Sea Lawyer',
  icon: '⚖️',
  tagline: 'Lie through your teeth, matey',
  blurb: 'A real bit of sea slang or sea history, with the answer blanked out. Write a lie convincing enough to fool your crewmates, then try to spot the truth among everyone else’s.',
  min: 3,
  narrator: false, // no voice: the room's own sounds and the gavel do the talking
};

const MAX_LIE = 60;
const MIN_OPTIONS = 4; // the truth and at least three lies on every docket

/** How an answer is shown: a capital letter and no full stop, so the truth looks like every lie. */
const tidyUp = (text) => {
  const t = String(text).trim().replace(/[.!]+$/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Lower-case, no punctuation, no leading "a"/"the", so near-identical answers match. */
export function normalise(text) {
  return String(text)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(a|an|the|to|its|it s) /, '')
    .trim();
}

/** Has somebody written the real answer (or near enough) instead of a lie? */
export function isTheTruth(text, question) {
  const lie = normalise(text);
  const truths = [question.a, ...(question.alts ?? [])].map(normalise);
  if (truths.includes(lie)) return true;
  // A one-word answer hidden inside a longer one still gives the game away ("the ship's dog").
  const words = new Set(lie.split(' '));
  return truths.some((t) => !t.includes(' ') && t.length > 2 && words.has(t));
}

export async function run(ctx) {
  const content = ctx.content.lawyer;
  const deck = ctx.deck('questions', content.questions);
  const each = Number(content.questionsPerRound) > 0 ? Number(content.questionsPerRound) : ctx.players.length > 8 ? 2 : 3;

  await ctx.intro([
    'A real question goes up, with the answer blanked out. Write a lie: something that sounds like it could be true.',
    'Then every lie goes in with the real answer. Pick the one you think is true.',
    'Find the truth for doubloons. Fool a crewmate and you pocket doubloons for every pirate who believed you.',
  ]);

  const rounds = [
    { n: 1, label: 'Round one', count: each, mult: 1 },
    { n: 2, label: 'Round two', count: each, mult: 2 },
    { n: 3, label: 'The last lie', count: 1, mult: 3 },
  ];
  for (const round of rounds) {
    for (let i = 0; i < round.count; i++) await question(ctx, deck.draw(), round, i);
    if (round.n === 1) await ctx.scoreboard('After the first hearing');
    if (round.n === 2) await ctx.scoreboard('Before the last lie');
  }
  await ctx.gameOver();
}

// ---------------------------------------------------------------------------

async function question(ctx, q, round, index) {
  const key = `sl-${round.n}-${index}`;
  const prompt = ctx.fill(q.q);
  const base = {
    screen: 'sl',
    round: round.n,
    roundLabel: round.label,
    number: index + 1,
    of: round.count,
    mult: round.mult,
    topic: q.topic ?? 'From the ship’s lexicon',
    prompt,
  };

  // --- 1. everyone writes a lie ---
  const lies = new Map(); // player -> text
  const caught = new Map(); // player -> how many times they wrote the truth by accident
  ctx.screen({
    sfx: 'quill',
    host: () => ({
      ...base,
      key: `${key}-write`,
      phase: 'write',
      music: 'lawyer',
      progress: ctx.players.map((p) => ({ id: p.id, done: lies.has(p) ? 1 : 0, of: 1 })),
    }),
    player: (p) =>
      lies.has(p)
        ? { screen: 'wait', key: `${key}-lodged`, icon: '🪶', text: 'Lie lodged with the court.', sub: 'Keep a straight face.' }
        : {
            screen: 'write',
            key: `${key}-w${caught.get(p) ?? 0}`,
            heading: round.n === 3 ? 'The last lie · triple doubloons' : `Question ${index + 1} of ${round.count}`,
            prompt,
            warn: caught.get(p) ? 'Blast! That’s the real answer. Write a lie instead.' : null,
            placeholder: 'A lie that sounds true…',
            max: MAX_LIE,
          },
    onAction: (p, msg) => {
      const text = cleanText(msg.text, MAX_LIE);
      if (msg.type !== 'answer' || !text || lies.has(p) || msg.key !== `${key}-w${caught.get(p) ?? 0}`) return;
      if (isTheTruth(text, q)) caught.set(p, (caught.get(p) ?? 0) + 1);
      else lies.set(p, text);
    },
  });
  await ctx.wait(ctx.seconds('write', 55), {
    timer: true,
    until: () => ctx.players.every((p) => lies.has(p) || ctx.away(p)),
  });

  // --- 2. the docket: every lie (the same lie twice is one entry), the truth, and house lies to fill it out ---
  const byText = new Map();
  for (const [author, text] of lies) {
    const k = normalise(text);
    if (!byText.has(k)) byText.set(k, { text: tidyUp(text), authors: [], kind: 'lie' });
    byText.get(k).authors.push(author);
  }
  const entries = [...byText.values(), { text: tidyUp(q.a), authors: [], kind: 'truth' }];
  for (const decoy of shuffle(q.decoys ?? [])) {
    if (entries.length >= MIN_OPTIONS) break;
    if (!byText.has(normalise(decoy))) entries.push({ text: tidyUp(decoy), authors: [], kind: 'house' });
  }
  const docket = shuffle(entries).map((e, id) => ({ ...e, id, pickers: [] }));
  const truth = docket.find((e) => e.kind === 'truth');
  const choices = (p) => docket.filter((e) => !e.authors.includes(p));
  const picks = new Map(); // player -> entry

  ctx.screen({
    sfx: 'paper',
    host: () => ({
      ...base,
      key: `${key}-pick`,
      phase: 'pick',
      music: 'lawyer',
      options: docket.map((e) => ({ id: e.id, text: e.text })),
      voted: [...picks.keys()].map((p) => p.id),
    }),
    player: (p) =>
      picks.has(p)
        ? { screen: 'wait', key: `${key}-picked`, icon: '⚖️', text: 'Your verdict is in.', sub: 'The court will now hear the evidence.' }
        : { screen: 'choose', key: `${key}-pick`, heading: 'Which is the truth?', prompt, options: choices(p).map((e) => ({ id: e.id, text: e.text })) },
    onAction: (p, msg) => {
      const entry = docket.find((e) => e.id === msg.id);
      if (msg.type === 'choose' && msg.key === `${key}-pick` && entry && !entry.authors.includes(p) && !picks.has(p)) {
        picks.set(p, entry);
        entry.pickers.push(p);
      }
    },
  });
  await ctx.wait(ctx.seconds('pick', 30), {
    timer: true,
    until: () => ctx.players.every((p) => picks.has(p) || ctx.away(p)),
  });

  // --- 3. the evidence: every lie somebody fell for, least popular first, then the truth ---
  const gains = new Map(ctx.players.map((p) => [p, 0]));
  const give = (p, n) => {
    gains.set(p, gains.get(p) + n);
    ctx.award(p, n);
  };
  const fooled = docket.filter((e) => e.kind !== 'truth' && e.pickers.length > 0).sort((a, b) => a.pickers.length - b.pickers.length);
  const shown = []; // what has been revealed so far, for the docket on the TV
  const state = (e) => ({
    id: e.id,
    text: e.text,
    kind: shown.includes(e) ? e.kind : null,
    pickers: shown.includes(e) ? e.pickers.map((p) => p.id) : [],
    authors: shown.includes(e) ? e.authors.map((p) => p.id) : [],
    gain: e.gain ?? 0,
  });
  const phone = (p) => {
    const mine = picks.get(p);
    const gain = gains.get(p);
    return { screen: 'wait', key: `${key}-ev`, icon: gain ? '💰' : '🧐', text: gain ? `+${gain.toLocaleString('en')} doubloons so far` : mine ? 'The evidence is being heard…' : 'You didn’t pick. Contempt of court!' };
  };

  for (const [i, e] of fooled.entries()) {
    e.gain = e.kind === 'lie' ? 500 * round.mult * e.pickers.length : 0;
    for (const author of e.authors) give(author, e.gain);
    shown.push(e);
    ctx.screen({
      sfx: 'slLie',
      host: () => ({ ...base, key: `${key}-lie-${i}`, phase: 'lie', music: null, focus: e.id, options: docket.map(state) }),
      player: phone,
    });
    await ctx.wait(Math.max(5200, readTime(e.text, 3600)));
  }

  for (const p of truth.pickers) give(p, 1000 * round.mult);
  truth.gain = 1000 * round.mult;
  shown.push(truth, ...docket.filter((e) => !shown.includes(e)));
  ctx.screen({
    sfx: truth.pickers.length ? 'gavel' : 'gavelEmpty',
    host: () => ({ ...base, key: `${key}-truth`, phase: 'truth', music: null, focus: truth.id, truth: tidyUp(q.a), fact: q.fact ?? null, options: docket.map(state) }),
    player: (p) => {
      const gain = gains.get(p);
      const fell = picks.get(p);
      if (fell === truth) return { screen: 'wait', key: `${key}-done`, icon: '⚖️', text: `+${gain.toLocaleString('en')} doubloons`, sub: 'You found the truth!' };
      if (gain) return { screen: 'wait', key: `${key}-done`, icon: '😈', text: `+${gain.toLocaleString('en')} doubloons`, sub: 'For your lies alone. Shameless.' };
      return { screen: 'wait', key: `${key}-done`, icon: '🌊', text: fell ? 'Hoodwinked!' : 'No verdict, no doubloons.', sub: fell?.authors.length ? `That was ${fell.authors.map((a) => a.name).join(' and ')}’s lie.` : fell ? 'That was the court’s own lie.' : '' };
    },
  });
  await ctx.wait(q.fact ? Math.max(8500, readTime(q.fact, 5000)) : 7500);
}
