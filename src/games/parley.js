// PARLEY - who among ye…?
//
// The crew gathers round a bonfire on the beach. A question goes up ("Who's
// most likely to cry at a wedding?"). Everyone votes for a crewmate in secret,
// then predicts who the crew as a whole will pick. Votes are never shown, only
// counted: a doubloon lands in front of each pirate for every vote they get.
//   * predict the crew's pick    -> doubloons (this is how you win)
//   * every vote you get          -> a few doubloons of infamy
// Two rounds (the second pays double), then the Black Spot: one last question,
// and you guess how many votes you'll get yourself.
//
// Questions live in content/parley.json.

import { shuffle } from '../util.js';

export const meta = {
  id: 'parley',
  name: 'Parley',
  icon: '🔥',
  tagline: 'Who among ye…?',
  blurb: 'A question about the crew goes up: who’s most likely to…? Vote in secret, then guess who everyone else picked. Read the room to win.',
  min: 3,
  narrator: false, // round the fire, the crackle and the surf do the talking
};

export async function run(ctx) {
  const content = ctx.content.parley;
  const deck = ctx.deck('prompts', content.prompts);
  const each = Number(content.promptsPerRound) > 0 ? Number(content.promptsPerRound) : ctx.players.length > 8 ? 3 : 4;

  await ctx.intro([
    'A question about the crew goes up. Vote for whoever fits it best. Nobody will ever know who you voted for.',
    'Then guess who the rest of the crew picked. Guess right for doubloons.',
    'Every vote you get earns you a little infamy, too.',
  ]);

  for (const round of [{ n: 1, label: 'Round one', mult: 1 }, { n: 2, label: 'Round two', mult: 2 }]) {
    for (let i = 0; i < each; i++) await ask(ctx, ctx.fill(deck.draw()), { ...round, number: i + 1, of: each });
    await ctx.scoreboard(round.n === 1 ? 'Round the fire so far' : 'Before the Black Spot');
  }
  await blackSpot(ctx, ctx.fill(ctx.deck('final', content.finalPrompts).draw()));
  await ctx.gameOver();
}

const seats = (ctx) => ctx.players.map((p) => p.id);
const option = (p, me) => ({ id: p.id, text: `${p.avatar} ${p.name}`, sub: p === me ? 'That’s you' : undefined });

// ---------------------------------------------------------------------------

async function ask(ctx, prompt, round) {
  const key = `pa-${round.n}-${round.number}`;
  const votes = new Map(); // voter -> player voted for
  const guesses = new Map(); // player -> who they think the crew picked
  const done = (p) => (votes.has(p) ? 1 : 0) + (guesses.has(p) ? 1 : 0);
  const base = { screen: 'pa', prompt, roundLabel: round.label, number: round.number, of: round.of, mult: round.mult, seats: seats(ctx) };

  ctx.screen({
    sfx: 'paGong',
    host: () => ({ ...base, key: `${key}-vote`, phase: 'vote', music: 'parley', done: ctx.players.filter((p) => done(p) === 2).map((p) => p.id) }),
    player: (p) => {
      if (!votes.has(p)) return { screen: 'choose', key: `${key}-v`, heading: 'Your secret vote', prompt, options: ctx.players.map((q) => option(q, p)) };
      if (!guesses.has(p)) return { screen: 'choose', key: `${key}-g`, heading: 'Who will the crew pick?', prompt: 'Guess who gets the most votes.', options: ctx.players.map((q) => option(q, p)) };
      return { screen: 'wait', key: `${key}-in`, icon: '🔥', text: 'Ballot in the fire.', sub: 'Nobody will ever know.' };
    },
    onAction: (p, msg) => {
      const target = ctx.players.find((q) => q.id === msg.id);
      if (msg.type !== 'choose' || !target) return;
      if (msg.key === `${key}-v` && !votes.has(p)) votes.set(p, target);
      else if (msg.key === `${key}-g` && votes.has(p) && !guesses.has(p)) guesses.set(p, target);
    },
  });
  await ctx.wait(ctx.seconds('vote', 40), { timer: true, until: () => ctx.players.every((p) => done(p) === 2 || ctx.away(p)) });

  // --- the count ---
  const tally = new Map(ctx.players.map((p) => [p, 0]));
  for (const target of votes.values()) tally.set(target, tally.get(target) + 1);
  const most = Math.max(0, ...tally.values());
  const winners = most ? ctx.players.filter((p) => tally.get(p) === most) : [];
  const gains = new Map(ctx.players.map((p) => [p, 0]));
  const give = (p, n) => {
    gains.set(p, gains.get(p) + n);
    ctx.award(p, n);
  };
  for (const [p, n] of tally) give(p, n * 100 * round.mult);
  const seers = ctx.players.filter((p) => winners.includes(guesses.get(p)));
  for (const p of seers) give(p, 1000 * round.mult);

  // Coins are dropped in a shuffled order so the count builds up suspense; the TV acts it out.
  const coins = shuffle([...votes.values()].map((p) => p.id));
  const landed = 1.4 + coins.length * 0.42; // seconds until the last coin is down (the TV uses the same sum)
  ctx.screen({
    sfx: 'drumroll',
    host: () => ({
      ...base,
      key: `${key}-count`,
      phase: 'count',
      coins,
      tally: ctx.players.map((p) => ({ id: p.id, votes: tally.get(p) })),
      winners: winners.map((p) => p.id),
      seers: seers.map((p) => p.id),
      gain: 1000 * round.mult,
      landed,
    }),
    player: (p) => {
      const gain = gains.get(p);
      const n = tally.get(p);
      const sub = [n ? `${n} vote${n > 1 ? 's' : ''} for you` : 'Not a single vote for you', seers.includes(p) ? 'and you read the crew perfectly' : ''].filter(Boolean).join(', ');
      return { screen: 'wait', key: `${key}-r`, icon: seers.includes(p) ? '🎯' : n ? '🪙' : '🌊', text: gain ? `+${gain.toLocaleString('en')} doubloons` : 'Nothing this time.', sub: `${sub}.` };
    },
  });
  await ctx.wait((landed + 6.5) * 1000);
}

// ---------------------------------------------------------------------------

async function blackSpot(ctx, prompt) {
  const key = 'pa-spot';
  const votes = new Map();
  const guesses = new Map(); // player -> how many votes they think they'll get
  const done = (p) => (votes.has(p) ? 1 : 0) + (guesses.has(p) ? 1 : 0);
  const base = { screen: 'pa', prompt, roundLabel: 'The Black Spot', mult: 3, seats: seats(ctx), spot: true };
  const counts = Array.from({ length: ctx.players.length + 1 }, (_, n) => ({ id: n, text: n === 0 ? 'None at all' : n === ctx.players.length ? `All ${n} of us` : `${n} vote${n > 1 ? 's' : ''}` }));

  ctx.screen({
    sfx: 'paGong',
    host: () => ({ ...base, key: `${key}-vote`, phase: 'vote', music: 'parley', done: ctx.players.filter((p) => done(p) === 2).map((p) => p.id) }),
    player: (p) => {
      if (!votes.has(p)) return { screen: 'choose', key: `${key}-v`, heading: 'The Black Spot: your vote', prompt, options: ctx.players.map((q) => option(q, p)) };
      if (!guesses.has(p)) return { screen: 'choose', key: `${key}-g`, heading: 'How many votes will YOU get?', prompt: 'Spot on wins big. One out still pays.', options: counts };
      return { screen: 'wait', key: `${key}-in`, icon: '💀', text: 'Ballot in the fire.', sub: 'Brace yourself.' };
    },
    onAction: (p, msg) => {
      if (msg.type !== 'choose') return;
      const target = ctx.players.find((q) => q.id === msg.id);
      if (msg.key === `${key}-v` && target && !votes.has(p)) votes.set(p, target);
      else if (msg.key === `${key}-g` && votes.has(p) && !guesses.has(p) && counts.some((c) => c.id === msg.id)) guesses.set(p, msg.id);
    },
  });
  await ctx.wait(ctx.seconds('spot', 45), { timer: true, until: () => ctx.players.every((p) => done(p) === 2 || ctx.away(p)) });

  const tally = new Map(ctx.players.map((p) => [p, 0]));
  for (const target of votes.values()) tally.set(target, tally.get(target) + 1);
  const most = Math.max(0, ...tally.values());
  const winners = most ? ctx.players.filter((p) => tally.get(p) === most) : [];
  const gains = new Map();
  for (const p of ctx.players) {
    const off = guesses.has(p) ? Math.abs(guesses.get(p) - tally.get(p)) : Infinity;
    const gain = off === 0 ? 3000 : off === 1 ? 1000 : 0;
    gains.set(p, gain);
    ctx.award(p, gain);
  }
  const coins = shuffle([...votes.values()].map((p) => p.id));
  const landed = 1.4 + coins.length * 0.42;
  ctx.screen({
    sfx: 'drumroll',
    host: () => ({
      ...base,
      key: `${key}-count`,
      phase: 'count',
      coins,
      tally: ctx.players.map((p) => ({ id: p.id, votes: tally.get(p), guess: guesses.get(p) ?? null, gain: gains.get(p) })),
      winners: winners.map((p) => p.id),
      seers: ctx.players.filter((p) => gains.get(p) === 3000).map((p) => p.id),
      close: ctx.players.filter((p) => gains.get(p) === 1000).map((p) => p.id),
      landed,
    }),
    player: (p) => {
      const n = tally.get(p);
      const g = guesses.get(p);
      return {
        screen: 'wait',
        key: `${key}-r`,
        icon: gains.get(p) === 3000 ? '🎯' : gains.get(p) ? '👌' : '💀',
        text: gains.get(p) ? `+${gains.get(p).toLocaleString('en')} doubloons` : 'Way off!',
        sub: `You got ${n} vote${n === 1 ? '' : 's'}${g === undefined ? '' : ` and guessed ${g}`}.`,
      };
    },
  });
  await ctx.wait((landed + 9) * 1000);
}
