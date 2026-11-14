// Robot pirates, for trying the games without a room full of people.
//
//   npm run bots                  -> 4 bots join the lobby and play along
//   npm run bots -- 6             -> 6 bots
//   npm run bots -- 4 scuttlebutt -> 4 bots, and they start that game themselves
//                                    (broadside | scuttlebutt | colours | reckoning | bombard | liars | onepiece | knots | brig | lawyer | parley | bottle | cradle)
//
// Start the server first (npm start). You can join on your own phone too:
// the bots answer and vote, you play for real.

const count = Number(process.argv[2]) || 4;
const autoGame = process.argv[3] ?? null;
const base = process.env.URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const fast = !!process.env.FAST;

const NAMES = ['Blackbeard', 'Anne', 'Calico', 'Redbeard', 'Morgan', 'Bonny', 'Flint', 'Silver', 'Kidd', 'Bart', 'Gráinne', 'Stede'];
const QUIPS = [
  'A soggy biscuit', 'Your mum’s parrot', 'Seventeen angry crabs', 'Rum, but the bad kind', 'Mutiny, obviously',
  'A wooden leg full of bees', 'Captain Pugwash’s tax return', 'The kraken’s ex', 'An IOU from Davy Jones', 'Just vibes',
  'A map to the nearest Greggs', 'Scurvy, but make it fashion', 'It was like that when I got here', 'Honestly? Lovely.',
  'Never again', 'Ten out of ten, would plunder again', 'The seagulls know what they did',
];

const SHIPS = [
  'The Soggy Biscuit', 'HMS Regret', 'The Angry Haddock', 'Rum for Improvement', 'The Wet Sock', 'Polly’s Revenge', 'The Flying Flapjack',
  'Barnacle Bill’s Bathtub', 'The Sinking Feeling', 'Plank You Very Much', 'The Crusty Barnacle', 'Sea You Later', 'The Unwashed', 'HMS Oops',
];

/** A robot's idea of a flag: a few wobbly scribbles in random colours. */
function scribble() {
  const strokes = Array.from({ length: 5 + Math.floor(Math.random() * 5) }, () => {
    let x = 60 + Math.random() * 480;
    let y = 40 + Math.random() * 320;
    const p = [];
    for (let i = 0; i < 12 + Math.random() * 30; i++) {
      p.push(Math.round(x), Math.round(y));
      x = Math.min(590, Math.max(10, x + (Math.random() - 0.5) * 90));
      y = Math.min(390, Math.max(10, y + (Math.random() - 0.5) * 90));
    }
    return { c: Math.floor(Math.random() * 7), w: Math.floor(Math.random() * 3), p };
  });
  return { cloth: Math.floor(Math.random() * 6), strokes };
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const otherSide = (side) => (side === 'port' ? 'starboard' : 'port');
const pause = (lo, hi) => new Promise((r) => setTimeout(r, fast ? 60 + Math.random() * 150 : lo + Math.random() * (hi - lo)));

/**
 * A robot's turn at LiAARRRRGH's Dice. It knows its own dice and guesses the
 * rest from the odds, with a random amount of nerve so it sometimes bluffs
 * and sometimes calls too early.
 */
function liarsMove(view) {
  const { dice, total, bid, wild, key } = view;
  const mine = (f) => dice.filter((d) => d === f || (wild && d === 1)).length;
  const expected = (f) => mine(f) + (total - dice.length) * (wild && f !== 1 ? 1 / 3 : 1 / 6);
  const nerve = Math.random() * 2.5 - 0.75;
  if (bid && bid.q > expected(bid.f) + nerve) return { type: 'ld-call', key };
  const raises = [];
  for (let f = 1; f <= 6; f++) {
    const q = !bid ? Math.max(1, Math.round(expected(f)) - 1) : f > bid.f ? bid.q : bid.q + 1;
    if (q <= total) raises.push({ q, f, appeal: expected(f) - q + Math.random() * 1.5 });
  }
  if (raises.length === 0) return { type: 'ld-call', key };
  const best = raises.sort((a, b) => b.appeal - a.appeal)[0];
  return { type: 'ld-bid', key, q: best.q, f: best.f };
}

/** A robot's answer to one of Cradle to Kraken's orders: mostly sensible, sometimes reckless. */
function cradleChoice(t, view) {
  const cash = view.status?.cash ?? 0;
  const person = () => pick(t.people ?? []).id;
  switch (t.kind) {
    case 'fork': return Math.random() < 0.45 ? 0 : 1;
    case 'ship': {
      const affordable = t.options.filter((o) => o.price <= cash * 1.2);
      return affordable.length && Math.random() < 0.8 ? affordable[affordable.length - 1].id : 'keep';
    }
    case 'map': return Math.random() < 0.6 && cash > t.cost ? pick(t.options) : 'pass';
    case 'raid': return [...t.people].sort((a, b) => b.cash - a.cash)[0].id; // always go for the richest
    case 'propose': return Math.random() < 0.8 ? person() : 'sea';
    case 'answer': return Math.random() < 0.75 ? pick(t.people).id : 'none';
    case 'give': return Array.from({ length: t.n }, person);
    case 'retire': return Math.random() < 0.5 ? 'sunset' : 'job';
    case 'card': {
      if (Math.random() < 0.3) return 'skip';
      const card = pick(t.cards);
      return { card: card.id, target: card.target ? person() : undefined };
    }
    case 'haunt': return Math.random() < 0.7 ? person() : 'skip';
  }
  return null;
}

async function post(path, body) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

async function runBot(name, index) {
  const joined = await post('/api/join', { name });
  if (joined.error) return console.log(`${name}: ${joined.error}`);
  const { token } = joined;
  const act = (body) => post('/api/action', { token, ...body });
  const handled = new Set();
  let starting = false;

  let latest = null;
  const brigMemo = { leg: null, lookouts: [], split: false, suspects: new Set() }; // To the Brig with Ye: what this robot remembers between screens

  async function onView(view) {
    latest = view;
    const id = `${view.screen}:${view.key}:${view.selected ?? ''}`;
    if (handled.has(id)) return;
    handled.add(id);

    switch (view.screen) {
      case 'lobby':
        handled.clear(); // back in port: the next game's screens are all new, even if they share names with the last one's
        brigMemo.suspects.clear();
        if (autoGame && view.isVip && view.crew >= count && !starting) {
          starting = true;
          setTimeout(() => (starting = false), 5000);
          await pause(1500, 2500);
          await act({ type: 'select', game: autoGame });
          await pause(1000, 2000);
          await act({ type: 'start' });
        }
        break;
      case 'write':
        await pause(2000, 9000);
        await act({ type: 'answer', key: view.key, text: view.game === 'colours' ? `${pick(SHIPS)}${Math.random() < 0.5 ? ` ${pick(['II', 'III', 'Jr', 'of Doom', 'Returns'])}` : ''}` : pick(QUIPS) });
        break;
      case 'choose':
        await pause(1500, 6000);
        await act({ type: 'choose', key: view.key, id: pick(view.options).id });
        break;
      case 'draw':
        await pause(3000, 12000);
        await act({ type: 'flag', key: view.key, flag: scribble() });
        break;
      case 'combine':
        await pause(2000, 9000);
        await act({ type: 'combine', key: view.key, flag: pick(view.flags).id, name: pick(view.names).id });
        break;
      case 'bb-aim': {
        // Bombard!: mostly pick a tile at random; sometimes go for the tiles next to a hit.
        await pause(2000, 14000);
        for (let tries = 0; tries < 6; tries++) {
          const now = latest; // crewmates may have taken aim while this bot was thinking
          if (now.screen !== 'bb-aim' || now.key !== view.key || now.locked || now.need === 0) break;
          const { cols, rows, tiles } = now.board;
          const shot = new Set(tiles.map((t) => t.i));
          const taken = new Set(now.mates.map((m) => m.tile));
          const free = Array.from({ length: cols * rows }, (_, i) => i).filter((i) => !shot.has(i) && !taken.has(i));
          const near = free.filter((i) => tiles.some((t) => t.hit && Math.abs((t.i % cols) - (i % cols)) + Math.abs(Math.floor(t.i / cols) - Math.floor(i / cols)) === 1));
          const aims = [];
          while (aims.length < now.need) {
            const pool = (near.length && Math.random() < 0.7 ? near : free).filter((i) => !aims.includes(i));
            if (pool.length === 0) break;
            aims.push(pick(pool));
          }
          await act({ type: 'bb-aim', key: view.key, tiles: aims });
          await pause(300, 900);
          await act({ type: 'bb-fire', key: view.key });
          await pause(400, 800); // if a crewmate got to the same tile first, go round again
        }
        break;
      }
      case 'ld-hand': {
        // LiAARRRRGH's Dice: wait for our turn (the same view comes round again when it is).
        if (!view.myTurn) {
          handled.delete(id);
          break;
        }
        await pause(1500, 7000);
        await act(liarsMove(view));
        break;
      }
      case 'op-vote':
        // Find the One Piece: vote for something, then roll when asked.
        if (view.mine !== null) break;
        await pause(1500, 9000);
        await act({ type: 'op-vote', key: view.key, id: pick(view.options).id });
        break;
      case 'op-roll':
        if (view.n !== null) break;
        await pause(800, 6000);
        await act({ type: 'op-roll', key: view.key });
        break;
      case 'kn-race': {
        // Knot So Fast: answer whatever is at the front of the hand, over and over, until the race is done.
        // Each bot has its own pace and its own idea of the right answer, so the fleet spreads out.
        const skill = { time: 2600 + (index % 5) * 650, right: 0.58 + (index % 4) * 0.09 };
        const answered = new Set();
        let firedAt = null;
        while (latest.screen === 'kn-race' && latest.key === view.key) {
          const deal = latest.phase === 'go' ? latest.hand.find((d) => !answered.has(d.id)) : null;
          // Off the helm: do the chore instead. Bots are keen but not superhuman.
          const job = latest.phase === 'go' && !deal ? latest.chore : null;
          if (job) {
            const target = latest.targets?.length ? pick(latest.targets).id : null;
            if (latest.fire && firedAt !== latest.fire.by + latest.fire.left) {
              firedAt = latest.fire.by + latest.fire.left;
              await pause(500, 2500);
              await act({ type: 'kn-fire', key: view.key });
            } else if (job.kind === 'junk' && job.item && target) {
              await pause(1200, 4000);
              await act({ type: 'kn-drop', key: view.key, to: target });
            } else if (job.kind === 'bail') {
              await pause(250, 400);
              await act({ type: 'kn-bail', key: view.key, taps: 3 });
            } else if (job.kind === 'taunt' && target) {
              await pause(2000, 6000);
              if (latest.chore?.kind === 'taunt') await act({ type: 'kn-taunt', key: view.key, to: target });
            } else await new Promise((r) => setTimeout(r, 200));
            continue;
          }
          if (!deal) {
            await new Promise((r) => setTimeout(r, 200));
            continue;
          }
          const began = Date.now();
          await pause(skill.time * 0.6, skill.time * 1.6);
          const right = Math.random() < skill.right;
          answered.add(deal.id);
          await act({ type: 'kn-answer', key: view.key, deal: deal.id, pick: right ? deal.r : (deal.r + 1 + Math.floor(Math.random() * 3)) % 4, ms: Date.now() - began, gold: latest.powder === deal.id });
          if (!right) await pause(1000, 1100);
        }
        break;
      }
      // To the Brig with Ye. Loyal robots are honest and a bit gullible. Mutinous
      // ones play to win: they send themselves up the nest, lie when it counts
      // (and always when one more strike would sink her), never shop a mate, and
      // try to get the honest lookout from a split locked up. Mutineers know each
      // other, so two of them in the nest agree who lies without a word.
      case 'tb-role':
        brigMemo.suspects.clear(); // a new voyage, new sides
        await pause(1500, 6000);
        await act({ type: 'tb-ready' });
        break;
      case 'tb-pick': {
        await pause(2000, 8000);
        const mate = (o) => o.me || view.mates.includes(o.name);
        const ok = (a, b) => b && b.id !== a.id && !(a.tired && b.tired);
        let first, second;
        if (view.role === 'mutineer') {
          first = view.options.find((o) => o.me) ?? pick(view.options.filter(mate).concat(view.options)); // me, else a mate, else anybody
          second = pick(view.options.filter((o) => !mate(o) && ok(first, o))) ?? pick(view.options.filter((o) => ok(first, o)));
        } else {
          const trusted = view.options.filter((o) => !brigMemo.suspects.has(o.name));
          first = pick(trusted.length ? trusted : view.options);
          const rest = view.options.filter((o) => ok(first, o));
          const trustedRest = rest.filter((o) => !brigMemo.suspects.has(o.name));
          second = pick(trustedRest.length ? trustedRest : rest);
        }
        await act({ type: 'tb-pick', key: view.key, ids: [first.id, second.id] });
        break;
      }
      case 'tb-nest': {
        if (view.mine) break;
        await pause(1500, 6000);
        let lie = false;
        if (view.role === 'mutineer') {
          const killing = view.hull === 1; // one more strike sinks her
          if (view.mates.includes(view.mate)) lie = killing || name < view.mate; // two mates up: one lies (a split they can argue), or both for the kill
          else lie = killing || Math.random() < 0.8;
        }
        // view.safe is what this robot's spyglass shows, which in fog may be wrong.
        await act({ type: 'tb-flag', key: view.key, side: lie ? otherSide(view.safe) : view.safe });
        break;
      }
      case 'tb-helm': {
        const lookouts = view.lookouts.split(' and ');
        const split = view.flags[0] !== view.flags[1];
        Object.assign(brigMemo, { leg: view.key, lookouts, split });
        if (split) for (const l of lookouts) if (l !== name) brigMemo.suspects.add(l);
        if (view.mine) break;
        await pause(2500, 14000);
        const agreed = split ? null : view.flags[0];
        let side;
        if (view.role !== 'mutineer') side = agreed ?? pick(view.flags);
        else if (agreed) side = lookouts.every((l) => view.mates.includes(l)) && view.hull === 1 ? agreed : otherSide(agreed); // two mates both lying for the kill: back them
        else side = pick(view.flags); // a split, and no telling which flag is the lie
        await act({ type: 'tb-steer', key: view.key, side });
        break;
      }
      case 'tb-brig': {
        if (view.mine) break;
        await pause(2500, 12000);
        const memo = brigMemo.leg?.startsWith(view.key.replace(/-brig$/, '')) ? brigMemo : { lookouts: [], split: false };
        const named = (n) => view.options.find((o) => o.name === n);
        let vote = null;
        if (view.role === 'mutineer') {
          const honest = memo.lookouts.filter((l) => l !== name && !view.mates.includes(l));
          const frame = memo.split && honest.length === 1 && memo.lookouts.length - honest.length === 1 ? named(honest[0]) : null; // a mate lied: blame the other one
          const loyal = view.options.filter((o) => !view.mates.includes(o.name));
          vote = frame ?? (Math.random() < 0.4 ? null : pick(loyal));
        } else if (memo.split && Math.random() < 0.7) {
          vote = pick(memo.lookouts.map(named).filter(Boolean)) ?? null;
        } else if (Math.random() < 0.4) {
          vote = pick(view.options);
        }
        await act({ type: 'tb-jail', key: view.key, id: vote?.id ?? 'nobody' });
        break;
      }
      // Cradle to Kraken: spin, give orders, bet, vote, tell tales (well, press the button).
      case 'ck-calling':
        await pause(1500, 7000);
        await act({ type: 'ck-calling', id: pick(view.options).id });
        break;
      case 'ck-helm':
        if (view.roll != null) break;
        await pause(800, 5000);
        await act({ type: 'ck-spin', key: view.key, fair: !!view.canFair && Math.random() < 0.6 });
        break;
      case 'ck-decide':
        for (const t of view.tasks) {
          await pause(800, 3500);
          await act({ type: 'ck-task', key: view.key, task: t.id, value: cradleChoice(t, view) });
        }
        break;
      case 'ck-wager':
        await pause(1000, 5000);
        await act({ type: 'ck-bet', key: view.key, side: pick(['a', 'b']) });
        break;
      case 'ck-tale':
        if (view.role !== 'teller') break;
        await pause(3000, 9000);
        await act({ type: 'ck-told', key: view.key });
        break;
      case 'ck-vote':
        await pause(1000, 5000);
        await act({ type: 'ck-vote', key: view.key, vote: Math.random() < 0.6 ? 'legend' : 'bilge' });
        break;
      case 'ck-truth':
        await pause(1500, 5000);
        await act({ type: 'ck-truth', key: view.key, choice: Math.random() < 0.5 ? 'answer' : 'drink' });
        break;
      case 'op-end':
        if (autoGame && view.canContinue) {
          await pause(8000, 9000);
          await act({ type: 'continue' });
        }
        break;
      case 'map':
        if (view.locked) break;
        await pause(4000, 20000);
        await act({ type: 'pin', key: view.key, lat: -50 + Math.random() * 110, lng: -150 + Math.random() * 300 });
        await pause(500, 2000);
        await act({ type: 'lock', key: view.key });
        break;
      case 'gameover':
        if (autoGame && view.canContinue) {
          await pause(8000, 9000);
          await act({ type: 'continue' });
        }
        break;
    }
  }

  // Read the server's event stream by hand (it is just lines of text).
  const res = await fetch(`${base}/api/events?token=${token}`);
  const decoder = new TextDecoder();
  let buffer = '';
  console.log(`${name} is aboard`);
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const line = block.split('\n').find((l) => l.startsWith('data: '));
      if (line) onView(JSON.parse(line.slice(6)).view).catch((err) => console.error(name, err.message));
    }
  }
}

for (let i = 0; i < count; i++) {
  runBot(NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${i}` : ''), i).catch((err) => console.error(`Could not reach ${base} - is the server running? (${err.message})`));
  await new Promise((r) => setTimeout(r, 250));
}
