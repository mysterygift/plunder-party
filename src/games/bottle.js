// MESSAGE IN A BOTTLE - a drawing game of whispers across the archipelago.
//
// Every pirate has an island. Each writes a message and corks it in a bottle,
// and the bottles drift on to the next island along:
//   * if a bottle brings you words, draw them
//   * if it brings you a drawing, write down what you think it shows
// Nobody sees more than the page just before theirs. After a few hops every
// bottle washes back up and the whole chain is unrolled on the TV, page by
// page, to see how "Gaz's stag do in Magaluf" became "a crab on fire".
// After each bottle the crew votes for its best page: doubloons to whoever
// wrote or drew it.
//
// Ideas for opening messages and the timers live in content/bottle.json.

import { shuffle, cleanText, clamp } from '../util.js';
import { sanitizeFlag } from '../../public/flag.js'; // the drawing format, shared with the screens (see Flying Colours)

export const meta = {
  id: 'bottle',
  name: 'Message in a Bottle',
  icon: '🍾',
  tagline: 'Draw it, guess it, pass it on',
  blurb: 'Write a message and send it off in a bottle. The next pirate draws it, the next guesses what the drawing is, and so on round the islands. Then every bottle is unrolled to see what became of it.',
  min: 3,
  narrator: false, // the sea, the gulls and the glass do the talking
};

const MAX_TEXT = 70;
const GRACE_MS = 1500; // phones send in unfinished drawings when the clock runs out

export async function run(ctx) {
  const content = ctx.content.bottle;
  const ideas = ctx.deck('ideas', content.ideas);
  const crew = shuffle(ctx.players); // the order of the islands round the ring
  const n = crew.length;
  const hops = clamp(Number(content.pages) || Math.min(n, 6), 4, 8); // pages in every bottle (fewer than four is no fun)

  // bottles[b].pages[s] is page s of the bottle that starts on island b.
  // Page s of bottle b is written by whoever lives on island (b + s) % n.
  const bottles = crew.map((p, b) => ({ id: b, starter: p, pages: [] }));
  const islands = crew.map((p) => p.id);
  const hand = (b, s) => crew[(b + s) % n];
  const bottleFor = (p, s) => bottles[(crew.indexOf(p) - s + n * 8) % n];

  await ctx.intro([
    'Write a message and cork it in a bottle. It drifts off to the next island.',
    'Bottle brings you words? Draw them. Brings you a drawing? Write what you think it shows. You only ever see the page before yours.',
    'At the end, every bottle is unrolled. Vote for the best page in each: doubloons to whoever made it.',
  ]);

  for (let s = 0; s < hops; s++) await page(ctx, { s, hops, bottles, islands, hand, bottleFor, ideas });
  for (const bottle of bottles) await unroll(ctx, bottle, { islands, hand, hops });
  await ctx.scoreboard('The tide has turned');
  await ctx.gameOver();
}

/** The newest page in a bottle that is words, or a drawing. */
const latest = (bottle, kind, before) => bottle.pages.slice(0, before).reverse().find((x) => x.kind === kind);

// ---------------------------------------------------------------------------
// One hop: everyone adds one page to the bottle in front of them
// ---------------------------------------------------------------------------

async function page(ctx, { s, hops, bottles, islands, hand, bottleFor, ideas }) {
  const kind = s === 0 ? 'write' : s % 2 ? 'draw' : 'describe';
  const key = `mb-${s}`;
  const done = new Set();
  const suggestion = new Map(ctx.players.map((p) => [p, ctx.fill(ideas.draw())]));

  const put = (p, entry) => {
    const bottle = bottleFor(p, s);
    if (done.has(p) || bottle.pages[s]) return;
    bottle.pages[s] = { ...entry, author: p };
    done.add(p);
  };
  const onAction = (p, msg) => {
    if (msg.key !== `${key}-${p.id}`) return;
    if (kind === 'draw' && msg.type === 'flag') {
      const flag = sanitizeFlag(msg.flag);
      if (flag) put(p, { kind: 'drawing', flag: ctx.stash(flag) });
    } else if (kind !== 'draw' && msg.type === 'answer') {
      const text = cleanText(msg.text, MAX_TEXT);
      if (text) put(p, { kind: 'text', text });
    }
  };

  const host = () => ({
    screen: 'mb',
    key: `${key}-${kind}`,
    phase: kind,
    step: s,
    of: hops,
    islands,
    // Where each bottle is bobbing: off the island of whoever has it now.
    holders: bottles.map((b) => hand(b.id, s).id),
    done: [...done].map((p) => p.id),
    music: 'bottle',
  });

  const player = (p) => {
    if (done.has(p)) return { screen: 'wait', key: `${key}-sent`, icon: '🍾', text: 'Corked and cast off!', sub: 'Watch it bob away on the big screen.' };
    const bottle = bottleFor(p, s);
    const k = `${key}-${p.id}`;
    if (kind === 'write') {
      return { screen: 'write', key: k, heading: 'Write a message for the bottle', prompt: 'Something for the next pirate to draw. The stranger the better.', placeholder: `e.g. ${suggestion.get(p)}`, max: MAX_TEXT };
    }
    if (kind === 'draw') {
      const words = latest(bottle, 'text', s)?.text ?? suggestion.get(p);
      return { screen: 'draw', key: k, heading: `Page ${s + 1} of ${hops}`, prompt: words, cloth: 5, ink: 1, noCloth: true, send: 'Cork it!' };
    }
    const drawing = latest(bottle, 'drawing', s);
    const lost = !bottle.pages[s - 1] || bottle.pages[s - 1].kind !== 'drawing';
    if (!drawing || lost) {
      const words = latest(bottle, 'text', s)?.text ?? suggestion.get(p);
      return { screen: 'write', key: k, heading: `Page ${s + 1} of ${hops}`, context: { label: 'The drawing washed away! It was meant to be:', text: words }, prompt: 'Say it again, in your own words.', placeholder: 'It’s…', max: MAX_TEXT };
    }
    return { screen: 'write', key: k, heading: `Page ${s + 1} of ${hops}`, flag: drawing.flag, prompt: 'What on earth is this a drawing of?', placeholder: 'It’s…', max: MAX_TEXT };
  };

  ctx.screen({ sfx: s === 0 ? 'mbCork' : 'mbDrift', host, player, onAction });
  const seconds = kind === 'write' ? ctx.seconds('write', 45) : kind === 'draw' ? ctx.seconds('draw', 80) : ctx.seconds('describe', 40);
  await ctx.wait(seconds, { timer: true, until: () => ctx.players.every((p) => done.has(p) || ctx.away(p)) });

  if (kind === 'draw' && done.size < ctx.players.length) {
    // Brushes down: the phones send in whatever was on the page; give it a moment to arrive.
    ctx.screen({ host, onAction, player: (p) => (done.has(p) ? player(p) : { screen: 'wait', key: `${key}-down`, icon: '⏳', text: 'Ink down!' }) });
    await ctx.wait(GRACE_MS);
  }
  // Anyone who didn't manage a page leaves a gap: the bottle sails on regardless.
  for (const b of bottles) if (!b.pages[s]) b.pages[s] = { kind: 'lost', author: hand(b.id, s) };
}

// ---------------------------------------------------------------------------
// The reveal: one bottle at a time, page by page, then a vote for its best page
// ---------------------------------------------------------------------------

const pageView = (x) => ({ kind: x.kind, text: x.text ?? null, flag: x.flag ?? null, author: x.author?.id ?? null, votes: x.votes ?? [], gain: x.gain ?? 0 });

async function unroll(ctx, bottle, { islands, hand, hops }) {
  const key = `mb-open-${bottle.id}`;
  const base = { screen: 'mb', islands, starter: bottle.starter.id, bottle: bottle.id, of: hops, music: 'bottle' }; // the tune plays on under the reveal
  const watching = (p) => ({ screen: 'wait', key: `${key}-watch`, icon: '📜', text: p === bottle.starter ? 'This one’s your bottle!' : 'Eyes on the big screen!', sub: 'Every page, one at a time.' });

  ctx.screen({ sfx: 'mbWashUp', host: () => ({ ...base, key: `${key}-arrive`, phase: 'arrive', at: bottle.starter.id }), player: watching });
  await ctx.wait(3200);

  for (let i = 0; i < bottle.pages.length; i++) {
    const x = bottle.pages[i];
    ctx.screen({
      sfx: x.kind === 'drawing' ? 'mbUnroll' : 'paper',
      host: () => ({ ...base, key: `${key}-p${i}`, phase: 'page', shown: i, at: hand(bottle.id, i).id, pages: bottle.pages.slice(0, i + 1).map(pageView) }),
      player: watching,
    });
    await ctx.wait(x.kind === 'drawing' ? 5200 : x.kind === 'lost' ? 2600 : 4200);
  }

  // --- the best page in this bottle ---
  const pages = bottle.pages.map((x, id) => ({ ...x, id, votes: [] })).filter((x) => x.kind !== 'lost');
  const voted = new Set();
  const choices = (p) => pages.filter((x) => x.author !== p);
  const canVote = (p) => choices(p).length > 0;
  if (pages.length > 1) {
    ctx.screen({
      sfx: 'pipe',
      host: () => ({ ...base, key: `${key}-fav`, phase: 'favourite', pages: bottle.pages.map(pageView), voted: [...voted].map((p) => p.id) }),
      player: (p) =>
        voted.has(p) || !canVote(p)
          ? { screen: 'wait', key: `${key}-voted`, icon: '🗳️', text: 'Vote cast!' }
          : {
              screen: 'choose',
              key: `${key}-fav`,
              heading: 'Best page in this bottle?',
              prompt: 'Not your own.',
              options: choices(p).map((x) => ({ id: x.id, text: x.kind === 'text' ? `“${x.text}”` : `Drawn by ${x.author.name}`, flag: x.kind === 'drawing' ? x.flag : undefined })),
            },
      onAction: (p, msg) => {
        const x = pages.find((y) => y.id === msg.id);
        if (msg.type !== 'choose' || msg.key !== `${key}-fav` || !x || x.author === p || voted.has(p)) return;
        voted.add(p);
        x.votes.push(p.id);
      },
    });
    await ctx.wait(ctx.seconds('favourite', 20), { timer: true, until: () => ctx.players.every((p) => voted.has(p) || !canVote(p) || ctx.away(p)) });
  }

  const most = Math.max(0, ...pages.map((x) => x.votes.length));
  for (const x of pages) {
    x.gain = x.votes.length * 300 + (most > 0 && x.votes.length === most ? 200 : 0);
    ctx.award(x.author, x.gain);
    const original = bottle.pages[x.id];
    Object.assign(original, { votes: x.votes, gain: x.gain, best: most > 0 && x.votes.length === most });
  }
  ctx.screen({
    sfx: most ? 'chest' : 'splash',
    host: () => ({ ...base, key: `${key}-fav`, phase: 'favourite-result', pages: bottle.pages.map((x) => ({ ...pageView(x), best: !!x.best })) }),
    player: (p) => {
      const gain = pages.filter((x) => x.author === p).reduce((sum, x) => sum + x.gain, 0);
      return { screen: 'wait', key: `${key}-res`, icon: gain ? '💰' : '🌊', text: gain ? `+${gain.toLocaleString('en')} doubloons` : 'No votes for your page this time.' };
    },
  });
  await ctx.wait(6000);
}
