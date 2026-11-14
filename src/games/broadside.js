// BROADSIDE - a duel of wits.
//
// Rounds 1 & 2: every prompt is secretly given to two players. Their answers
//               go head-to-head on the TV and everyone else votes.
// Final round:  one prompt for the whole crew; everybody votes for a favourite.
//
// Prompts live in content/broadside.json.

import { shuffle, cleanText, readTime, tidy } from '../util.js';

export const meta = {
  id: 'broadside',
  name: 'Broadside',
  icon: '💥',
  tagline: 'A duel of wits on the high seas',
  blurb: 'Answer daft prompts on your phone. Your answer faces off against a crewmate’s, and the rest of the crew votes for the funniest.',
  min: 3,
};

const MAX_ANSWER = 80;

export async function run(ctx) {
  const content = ctx.content.broadside;
  const deck = ctx.deck('prompts', content.prompts);

  await ctx.intro([
    'Each of you gets two prompts. Answer them with the funniest thing you can think of.',
    'Your answer goes head to head with a crewmate’s. Everyone else votes.',
    'Win every single vote and you score a broadside bonus.',
  ]);

  for (const round of [1, 2]) {
    await duelRound(ctx, deck, round);
    await ctx.scoreboard(round === 1 ? 'After the first volley' : 'Before the last word');
  }

  await lastWord(ctx, ctx.deck('final', content.finalPrompts));
  await ctx.gameOver();
}

// ---------------------------------------------------------------------------

async function duelRound(ctx, deck, round) {
  // Sit the players in a random circle; each prompt goes to two neighbours,
  // so everybody answers exactly two prompts.
  const circle = shuffle(ctx.players);
  const duels = circle.map((p, i) => ({
    id: i,
    prompt: ctx.fill(deck.draw()),
    sides: [p, circle[(i + 1) % circle.length]],
    answers: [null, null],
    votes: new Map(), // voter -> 0 or 1
  }));

  const mine = (p) => duels.filter((d) => d.sides.includes(p));
  const answered = (d, p) => d.answers[d.sides.indexOf(p)] !== null;
  const doneCount = (p) => mine(p).filter((d) => answered(d, p)).length;

  // --- writing ---
  ctx.screen({
    say: round === 1 ? 'Round one. Answer the prompts on your phone.' : 'Round two. The doubloons are doubled.',
    sfx: 'bell',
    host: () => ({
      screen: 'writing',
      key: `bs-write-${round}`,
      title: `Round ${round}`,
      text: 'Answer your prompts on your phone!',
      note: round === 2 ? 'Doubloons are doubled this round' : null,
      progress: ctx.players.map((p) => ({ id: p.id, done: doneCount(p), of: 2 })),
    }),
    player: (p) => {
      const duel = mine(p).find((d) => !answered(d, p));
      if (!duel) return { screen: 'wait', icon: '🍾', text: 'Answers away!', sub: 'Waiting on the slowcoaches…' };
      return {
        screen: 'write',
        key: `bs-${round}-${duel.id}`,
        heading: `Prompt ${doneCount(p) + 1} of 2`,
        prompt: duel.prompt,
        placeholder: 'Something witty…',
        max: MAX_ANSWER,
      };
    },
    onAction: (p, msg) => {
      if (msg.type !== 'answer') return;
      const duel = mine(p).find((d) => !answered(d, p));
      const text = cleanText(msg.text, MAX_ANSWER);
      if (duel && text && msg.key === `bs-${round}-${duel.id}`) duel.answers[duel.sides.indexOf(p)] = text;
    },
  });
  await ctx.wait(ctx.seconds('write', 90), {
    timer: true,
    until: () => ctx.players.every((p) => doneCount(p) === 2 || ctx.away(p)),
  });

  // --- the duels ---
  for (const duel of shuffle(duels)) await showDuel(ctx, duel, round);
}

async function showDuel(ctx, duel, round) {
  const [a, b] = duel.answers;
  const voters = ctx.players.filter((p) => !duel.sides.includes(p));
  const key = `bs-duel-${round}-${duel.id}`;
  const base = { screen: 'bs-duel', key, round, prompt: duel.prompt };

  if (a === null && b === null) {
    ctx.screen({ host: () => ({ ...base, step: 'nobody' }), say: `${duel.prompt} Nobody answered. Shameful.`, sfx: 'splash' });
    await ctx.wait(4500);
    return;
  }

  // 1. The prompt on its own
  ctx.screen({ say: duel.prompt, sfx: 'wind', host: () => ({ ...base, step: 'prompt' }) });
  await ctx.wait(readTime(duel.prompt, 1200));

  // 2. Both answers; the rest of the crew votes
  if (a !== null && b !== null) {
    ctx.screen({
      sfx: 'swords',
      host: () => ({ ...base, step: 'vote', answers: [a, b], voted: [...duel.votes.keys()].map((p) => p.id) }),
      player: (p) => {
        if (duel.sides.includes(p)) return { screen: 'wait', key, icon: '😬', text: 'That’s your answer up there.', sub: 'Look confident.' };
        if (duel.votes.has(p)) return { screen: 'wait', key, icon: '🗳️', text: 'Vote cast!' };
        return { screen: 'choose', key, heading: 'Which is funnier?', prompt: duel.prompt, options: [{ id: 0, text: a }, { id: 1, text: b }] };
      },
      onAction: (p, msg) => {
        if (msg.type === 'choose' && msg.key === key && voters.includes(p) && !duel.votes.has(p) && (msg.id === 0 || msg.id === 1)) {
          duel.votes.set(p, msg.id);
        }
      },
    });
    await ctx.wait(ctx.seconds('vote', 20), {
      timer: true,
      until: () => voters.every((p) => duel.votes.has(p) || ctx.away(p)),
    });
  }

  // 3. The result
  const result = scoreDuel(ctx, duel, round);
  const winnerName = result.winner >= 0 ? duel.sides[result.winner].name : null;
  ctx.screen({
    say: result.sweep ? `Broadside! ${winnerName} takes every vote!` : winnerName ? `${winnerName} wins it.` : 'A dead heat!',
    // A clean sweep gets the full broadside; a win gets one gun; a tie is just steel on steel.
    sfx: result.sweep ? 'volley' : result.winner >= 0 ? 'duel' : 'swords',
    host: () => ({ ...base, step: 'result', answers: [a, b], result }),
    player: (p) => {
      const side = duel.sides.indexOf(p);
      if (side < 0) return { screen: 'wait', key: `${key}-r`, icon: '👀', text: 'Eyes on the big screen!' };
      const gain = result.gains[side];
      return { screen: 'wait', key: `${key}-r`, icon: gain ? '💰' : '🌊', text: gain ? `+${gain} doubloons` : 'Sunk without trace.' };
    },
  });
  await ctx.wait(result.sweep ? 8000 : 6500);
}

function scoreDuel(ctx, duel, round) {
  const pot = 1000 * round;
  const votes = [0, 1].map((side) => [...duel.votes].filter(([, v]) => v === side).map(([p]) => p.id));
  const total = votes[0].length + votes[1].length;
  let gains = [0, 0];
  let winner = -1;
  let sweep = false;
  const forfeit = duel.answers[0] === null || duel.answers[1] === null;

  if (forfeit) {
    winner = duel.answers[0] === null ? 1 : 0;
    gains[winner] = pot;
  } else if (total > 0) {
    gains = votes.map((v) => tidy((pot * v.length) / total));
    if (votes[0].length !== votes[1].length) winner = votes[0].length > votes[1].length ? 0 : 1;
    sweep = winner >= 0 && votes[1 - winner].length === 0 && total >= 2;
    if (sweep) gains[winner] += 250 * round;
  }

  duel.sides.forEach((p, i) => ctx.award(p, gains[i]));
  return { authors: duel.sides.map((p) => p.id), votes, gains, winner, sweep, forfeit };
}

// ---------------------------------------------------------------------------

async function lastWord(ctx, deck) {
  const prompt = ctx.fill(deck.draw());
  const answers = new Map();
  const pot = 3000;

  // --- everyone writes ---
  ctx.screen({
    say: `The last word. Everybody answers the same prompt. ${prompt}`,
    sfx: 'bell',
    host: () => ({
      screen: 'writing',
      key: 'bs-final-write',
      title: 'The Last Word',
      text: 'One prompt. Everybody answers. Triple doubloons.',
      prompt,
      progress: ctx.players.map((p) => ({ id: p.id, done: answers.has(p) ? 1 : 0, of: 1 })),
    }),
    player: (p) =>
      answers.has(p)
        ? { screen: 'wait', icon: '🍾', text: 'Answer away!' }
        : { screen: 'write', key: 'bs-final', heading: 'The Last Word', prompt, placeholder: 'Make it count…', max: MAX_ANSWER },
    onAction: (p, msg) => {
      const text = cleanText(msg.text, MAX_ANSWER);
      if (msg.type === 'answer' && msg.key === 'bs-final' && text && !answers.has(p)) answers.set(p, text);
    },
  });
  await ctx.wait(ctx.seconds('finalWrite', 75), {
    timer: true,
    until: () => ctx.players.every((p) => answers.has(p) || ctx.away(p)),
  });

  const entries = shuffle([...answers]).map(([author, text], id) => ({ id, author, text, votes: [] }));
  if (entries.length === 0) return;

  // --- everyone votes for one favourite (not their own) ---
  const voted = new Set();
  const cards = () => entries.map((e) => ({ id: e.id, text: e.text }));
  const canVote = (p) => entries.some((e) => e.author !== p);

  if (entries.length > 1) {
    ctx.screen({
      say: 'Vote for your favourite.',
      sfx: 'pipe',
      host: () => ({ screen: 'gallery', key: 'bs-final-vote', title: 'The Last Word', prompt, step: 'vote', cards: cards(), voted: [...voted].map((p) => p.id) }),
      player: (p) =>
        voted.has(p) || !canVote(p)
          ? { screen: 'wait', key: 'bs-final-vote', icon: '🗳️', text: 'Vote cast!' }
          : {
              screen: 'choose',
              key: 'bs-final-vote',
              heading: 'Pick your favourite',
              prompt,
              options: entries.filter((e) => e.author !== p).map((e) => ({ id: e.id, text: e.text })),
            },
      onAction: (p, msg) => {
        const entry = entries.find((e) => e.id === msg.id);
        if (msg.type === 'choose' && msg.key === 'bs-final-vote' && entry && entry.author !== p && !voted.has(p)) {
          voted.add(p);
          entry.votes.push(p.id);
        }
      },
    });
    await ctx.wait(ctx.seconds('finalVote', 30), {
      timer: true,
      until: () => ctx.players.every((p) => voted.has(p) || !canVote(p) || ctx.away(p)),
    });
  }

  // --- results ---
  const total = entries.reduce((n, e) => n + e.votes.length, 0);
  const best = Math.max(...entries.map((e) => e.votes.length));
  for (const e of entries) {
    e.gain = total ? tidy((pot * e.votes.length) / total) : 0;
    ctx.award(e.author, e.gain);
  }
  const champs = entries.filter((e) => total && e.votes.length === best).map((e) => e.author.name);
  ctx.screen({
    say: champs.length ? `${champs.join(' and ')} had the last word.` : 'Nobody voted. Mutiny!',
    sfx: 'volley',
    host: () => ({
      screen: 'gallery',
      key: 'bs-final-vote',
      title: 'The Last Word',
      prompt,
      step: 'result',
      cards: entries.map((e) => ({ id: e.id, text: e.text, author: e.author.id, votes: e.votes, gain: e.gain, best: total > 0 && e.votes.length === best })),
    }),
    player: (p) => {
      const entry = entries.find((e) => e.author === p);
      return { screen: 'wait', key: 'bs-final-result', icon: entry?.gain ? '💰' : '🌊', text: entry?.gain ? `+${entry.gain} doubloons` : 'Not a single vote. Brutal.' };
    },
  });
  await ctx.wait(9000);
}
