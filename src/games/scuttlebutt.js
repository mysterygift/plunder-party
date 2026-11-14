// SCUTTLEBUTT - twist your crewmates' words.
// ("Scuttlebutt" is old sailor slang for gossip.)
//
// Each round:
//   1. Everyone answers an innocent question.
//   2. Each answer is passed, with no context, to another player who invents
//      what it was "really" about.
//   3. The twisted pairings are shown on the TV and everyone votes for the best.
//
// Rounds, questions and wording all live in content/scuttlebutt.json.

import { shuffle, sample, cleanText, readTime } from '../util.js';

export const meta = {
  id: 'scuttlebutt',
  name: 'Scuttlebutt',
  icon: '🦜',
  tagline: 'Twist your crewmates’ words on the pirate internet',
  blurb: 'Answer an innocent question. Then a crewmate gets your answer, with no idea what you were asked, and makes it look as bad as possible.',
  min: 3,
  narrator: false, // nothing read aloud: the ShipOS desktop and its bleeps carry it
};

const MAX_ANSWER = 70;
const MAX_TWIST = 90;

export async function run(ctx) {
  const content = ctx.content.scuttlebutt;

  await ctx.intro([
    'First, answer an innocent question honestly.',
    'Then you’ll be handed someone else’s answer, and you decide what they were really talking about.',
    'The crew votes for the best twist.',
  ]);

  // Pick this game's rounds: a few at random, always ending on a "final" one.
  const finals = content.rounds.filter((r) => r.final);
  const finale = finals.length ? sample(finals) : null;
  const count = Math.max(1, Number(content.roundsPerGame) || 3);
  const rounds = shuffle(content.rounds.filter((r) => r !== finale)).slice(0, finale ? count - 1 : count);
  if (finale) rounds.push(finale);

  for (let i = 0; i < rounds.length; i++) {
    const last = i === rounds.length - 1 && rounds.length > 1;
    await playRound(ctx, content, rounds[i], i, last ? 2 : 1);
    if (!last) await ctx.scoreboard(`After round ${i + 1}`);
  }
  await ctx.gameOver();
}

async function playRound(ctx, content, round, index, multiplier) {
  const questions = ctx.deck(`questions-${round.name}`, round.questions);
  const named = (text, player) => String(text ?? '').replaceAll('{name}', player.name);
  const k = `sb-${index}`;

  // One entry per player: their answer, and later the twist someone adds.
  const entries = ctx.players.map((victim, id) => ({
    id,
    victim,
    question: ctx.fill(questions.draw()),
    answer: null,
    twister: null,
    twist: null,
    votes: [],
  }));
  const entryOf = (p) => entries.find((e) => e.victim === p);
  const jobOf = (p) => entries.find((e) => e.twister === p);

  // --- round title ---
  ctx.screen({
    sfx: 'bell',
    host: () => ({ screen: 'sb-round', key: `${k}-title`, number: index + 1, name: round.name, intro: round.intro, icon: round.icon ?? '🦜', window: round.window ?? round.name, double: multiplier > 1 }),
  });
  await ctx.wait(readTime(round.intro, 3500));

  // --- 1. innocent answers ---
  ctx.screen({
    host: () => ({
      screen: 'writing',
      skin: 'retro',
      key: `${k}-answer`,
      title: round.name,
      text: 'Answer the question on your phone. Be honest…',
      progress: entries.map((e) => ({ id: e.victim.id, done: e.answer === null ? 0 : 1, of: 1 })),
    }),
    player: (p) =>
      entryOf(p).answer !== null
        ? { screen: 'wait', icon: '🫙', text: 'Answer bottled.', sub: 'What could possibly go wrong?' }
        : { screen: 'write', skin: 'retro', key: `${k}-answer`, heading: round.name, prompt: entryOf(p).question, placeholder: 'Your honest answer…', max: MAX_ANSWER },
    onAction: (p, msg) => {
      const text = cleanText(msg.text, MAX_ANSWER);
      if (msg.type === 'answer' && msg.key === `${k}-answer` && text && entryOf(p).answer === null) entryOf(p).answer = text;
    },
  });
  await ctx.wait(ctx.seconds('answer', 60), {
    timer: true,
    until: () => entries.every((e) => e.answer !== null || ctx.away(e.victim)),
  });
  for (const e of entries) e.answer ??= sample(content.fallbackAnswers ?? ['Arr.']);

  // --- 2. twists: pass each answer along to the next player in a shuffled ring ---
  const ring = shuffle(entries);
  ring.forEach((e, i) => (e.twister = ring[(i + 1) % ring.length].victim));

  ctx.screen({
    sfx: 'wind',
    host: () => ({
      screen: 'writing',
      skin: 'retro',
      key: `${k}-twist`,
      title: 'Time to twist',
      text: round.twistPrompt,
      progress: entries.map((e) => ({ id: e.twister.id, done: e.twist === null ? 0 : 1, of: 1 })),
    }),
    player: (p) => {
      const job = jobOf(p);
      if (job.twist !== null) return { screen: 'wait', icon: '😈', text: 'Twisted.', sub: 'You should be ashamed.' };
      return {
        screen: 'write',
        skin: 'retro',
        key: `${k}-twist`,
        heading: 'Twist it!',
        context: { label: 'One of your crewmates said:', text: job.answer },
        prompt: round.twistPrompt,
        placeholder: round.twistPlaceholder ?? '',
        max: MAX_TWIST,
      };
    },
    onAction: (p, msg) => {
      const text = cleanText(msg.text, MAX_TWIST);
      if (msg.type === 'answer' && msg.key === `${k}-twist` && text && jobOf(p).twist === null) jobOf(p).twist = text;
    },
  });
  await ctx.wait(ctx.seconds('twist', 80), {
    timer: true,
    until: () => entries.every((e) => e.twist !== null || ctx.away(e.twister)),
  });
  for (const e of entries) e.twist ??= sample(round.fallbackTwists ?? ['…something unspeakable']);

  // What the TV needs to draw one twisted pairing.
  const card = (e) => ({
    id: e.id,
    icon: round.icon ?? '🦜',
    window: round.window ?? round.name,
    style: round.style ?? null, // "diary" shows the answer as handwriting
    setup: named(round.setup, e.victim),
    twist: e.twist,
    bridge: named(round.bridge, e.victim),
    answer: e.answer,
    victim: e.victim.id,
  });

  // --- 3. show each pairing, one at a time ---
  const order = shuffle(entries);
  for (const e of order) {
    const key = `${k}-show-${e.id}`;
    const c = card(e);
    ctx.screen({ sfx: 'parrot', host: () => ({ screen: 'sb-show', key, card: c, step: 1 }) });
    await ctx.wait(readTime(c.setup + c.twist, 1500));
    ctx.screen({ sfx: c.style === 'diary' ? 'quill' : 'reveal', host: () => ({ screen: 'sb-show', key, card: c, step: 2 }) });
    await ctx.wait(readTime(c.bridge + c.answer, 2600));
  }

  // --- 4. vote for the best twist (not your own) ---
  const voted = new Set();
  ctx.screen({
    sfx: 'pipe',
    host: () => ({
      screen: 'gallery',
      skin: 'retro',
      key: `${k}-vote`,
      title: 'Which twist was best?',
      step: 'vote',
      cards: order.map(card),
      voted: [...voted].map((p) => p.id),
    }),
    player: (p) =>
      voted.has(p)
        ? { screen: 'wait', key: `${k}-vote`, icon: '🗳️', text: 'Vote cast!' }
        : {
            screen: 'choose',
            skin: 'retro',
            key: `${k}-vote`,
            heading: 'Best twist?',
            prompt: 'You can’t vote for your own handiwork.',
            options: order.filter((e) => e.twister !== p).map((e) => ({ id: e.id, text: e.twist, sub: `“${e.answer}”` })),
          },
    onAction: (p, msg) => {
      const entry = entries.find((e) => e.id === msg.id);
      if (msg.type === 'choose' && msg.key === `${k}-vote` && entry && entry.twister !== p && !voted.has(p)) {
        voted.add(p);
        entry.votes.push(p.id);
      }
    },
  });
  await ctx.wait(ctx.seconds('vote', 35), {
    timer: true,
    until: () => ctx.players.every((p) => voted.has(p) || ctx.away(p)),
  });

  // --- 5. results: the twister scores per vote, the victim gets a little for being a good sport ---
  const best = Math.max(...entries.map((e) => e.votes.length));
  for (const e of entries) {
    const top = best > 0 && e.votes.length === best;
    e.gain = (e.votes.length * 500 + (top ? 250 : 0)) * multiplier;
    e.sympathy = e.votes.length * 100 * multiplier;
    ctx.award(e.twister, e.gain);
    ctx.award(e.victim, e.sympathy);
  }
  ctx.screen({
    sfx: 'chest',
    host: () => ({
      screen: 'gallery',
      skin: 'retro',
      key: `${k}-vote`,
      title: 'Who twisted what',
      step: 'result',
      cards: order.map((e) => ({ ...card(e), author: e.twister.id, authorLabel: 'twisted by', votes: e.votes, gain: e.gain, best: best > 0 && e.votes.length === best })),
    }),
    player: (p) => {
      const total = jobOf(p).gain + entryOf(p).sympathy;
      return { screen: 'wait', key: `${k}-result`, icon: total ? '💰' : '🌊', text: total ? `+${total} doubloons` : 'No votes this time.' };
    },
  });
  await ctx.wait(6500 + entries.length * 700);
}
