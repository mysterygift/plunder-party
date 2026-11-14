// CRADLE TO KRAKEN - a whole pirate life, one spin of the helm at a time.
//
// Everybody's ship starts in Cradle Cove and races up the route to the
// Kraken's Lair, where they retire. Each year is played all at once:
//
//   1. SPIN    everyone flicks the ship's wheel on their phone (1 to 10).
//              Treasure maps pay out whenever ANYONE spins their number.
//   2. SAIL    the ships sail. Sailing past a share-out pays your calling's
//              wages; sailing past Tortuga or the shipyard stops you for a
//              wedding or a new ship. Forks and the Lair halt you.
//   3. LAND    whatever you land on happens: fortune, misfortune, grog, new
//              crew, the Kraken, a fate card, a raid, a tavern tale…
//   4. DECIDE  everyone makes their choices at once on their phone: which way
//              at a fork, which ship to buy, who to raid, who to propose to,
//              who gets your swigs, whether to play a fate card.
//   5. THE SHOW the big screen plays out the year's drama one at a time:
//              weddings and heartbreak, fate cards, raids (a duel of spins,
//              with the rest of the crew betting on it), tales and truths.
//
// At the Lair you choose to retire to Sunset Cove (a safe pension) or take
// One Last Job (a final spin that can halve or double your doubloons).
// Retired pirates haunt the living. When the last ship arrives (or the Kraken
// wakes, after the last year), the ships are sold, the crew paid off, the IOUs
// settled, and the richest pirate wins.
//
// Drinks: every penalty is a swig of content.drink. Shipmates (married at
// Tortuga) drink together. Leave "drink" empty for no drinking: each swig then
// costs a fine in doubloons instead.
//
// The board is in public/cradle-board.js (shared with the big screen); the cards,
// callings and timers are in content/cradle.json.

import { shuffle, sample, clamp, cleanText } from '../util.js';
import { buildBoard, segmentOf, STOPS, KINDS } from '../../public/cradle-board.js';

export const meta = {
  id: 'cradle',
  name: 'Cradle to Kraken',
  icon: '🧭',
  tagline: 'A whole pirate life, one spin at a time',
  blurb: 'Race your ship from the cradle to the Kraken. Pick a calling, marry a crewmate, buy a galleon, raid your rivals, tell tall tales and drink when the sea says so. Richest pirate at retirement wins.',
  min: 2,
  narrator: false, // the sea, the wheel and the crew do the talking
};

// ---------------------------------------------------------------------------
// The numbers. Most can be overridden in content/cradle.json.
// ---------------------------------------------------------------------------

const STAKES = [0, 1, 1.5, 2, 2.5, 3]; // money on the board grows as the voyage goes on (by stage)
const SHIPS = [
  { id: 'rowboat', name: 'Rowing boat', icon: '🛶', cost: 0, sale: [500, 1500], crew: 2, duel: 0 },
  { id: 'sloop', name: 'Sloop', icon: '⛵', cost: 6000, sale: [3000, 10000], crew: 4, duel: 1 },
  { id: 'brig', name: 'Brigantine', icon: '🚢', cost: 12000, sale: [7000, 20000], crew: 6, duel: 2 },
  { id: 'galleon', name: 'Galleon', icon: '🏴‍☠️', cost: 20000, sale: [12000, 34000], crew: 8, duel: 3 },
];
const ECON = {
  captain: 1.5, // share-outs pay this much more once you've made captain at the shipyard
  mapCost: 2500,
  mapPays: 600, // every time anyone spins your number
  mapSells: 1000,
  mapsEach: 3,
  crewWorth: 1500, // each crew member, paid off at the end
  whipRound: 200, // everyone chips in this much when you take on crew or get married
  wedding: 1500,
  sea: 1000, // "married to the sea"
  loan: 5000, // run out of money and the loan shark lends this much…
  repay: 6000, // …and wants this much back at the end
  raidMin: 1000,
  raidShare: 0.2,
  bounty: 1000, // extra for raiding the richest pirate
  raidFail: 1000, // what a failed raider pays the defender (times the stakes)
  wager: 300,
  tale: 1500,
  truth: 500,
  pension: 3000,
  arrival: [5000, 3000, 2000, 1000, 500],
  haunt: 300,
  quartermasterCut: 150,
  cookCut: 300,
  shantyVote: 300,
};
const LAST_JOB = [
  { upTo: 3, times: 0.5, name: 'Caught!', swigs: 3 },
  { upTo: 6, times: 1.25, name: 'A tidy haul' },
  { upTo: 9, times: 1.6, name: 'A fat prize' },
  { upTo: 10, times: 2, name: 'THE KRAKEN’S HOARD' },
];

const FATE = {
  fair: { name: 'Fair Winds', icon: '🌬️', text: '+3 to your next spin. Play it on the wheel.', when: 'spin' },
  becalm: { name: 'Becalmed', icon: '🌫️', text: 'Halve a rival’s next spin.', target: true },
  bait: { name: 'Kraken Bait', icon: '🦑', text: 'A rival loses a crew member and takes a swig.', target: true, nasty: true },
  press: { name: 'Press Gang', icon: '🪝', text: 'Steal a crew member from a rival.', target: true, nasty: true },
  pickpocket: { name: 'Pickpocket', icon: '🤏', text: 'Take 1,500 from a rival.', target: true, nasty: true },
  round: { name: 'Round’s on Me', icon: '🍻', text: 'Everyone else takes a swig and pays you 300.' },
  parley: { name: 'Parley', icon: '🏳️', text: 'Kept: stops the next raid or nasty card aimed at you.', passive: true },
  liver: { name: 'Iron Liver', icon: '🫀', text: 'Kept: cancels the next swig you’re told to take.', passive: true },
};
const FATE_DECK = ['fair', 'fair', 'fair', 'becalm', 'becalm', 'bait', 'bait', 'press', 'press', 'pickpocket', 'pickpocket', 'round', 'round', 'parley', 'parley', 'liver', 'liver'];
const HAND = 3;

const round100 = (n) => Math.round(n / 100) * 100;
const money = (n) => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('en')}`;

// ---------------------------------------------------------------------------

export async function run(ctx) {
  const content = ctx.content.cradle ?? {};
  const drink = typeof content.drink === 'string' ? content.drink.trim() : 'rum';
  const fine = Number(content.fine) > 0 ? Number(content.fine) : 300;
  const callings = content.callings ?? [];
  const board = buildBoard();
  const maxYears = clamp(Math.round(Number(content.maxYears)) || 14, 4, 40);
  const decks = {
    fortune: ctx.deck('fortune', content.fortune ?? [{ text: 'You found some treasure.', gain: 1000 }]),
    misfortune: ctx.deck('misfortune', content.misfortune ?? [{ text: 'You lost some treasure.', lose: 1000 }]),
    grog: ctx.deck('grog', content.grog ?? [{ text: 'Bottoms up.', kind: 'self', swigs: 1 }]),
    tales: ctx.deck('tales', content.tales ?? ['Tell the crew about your worst night out.']),
    truths: ctx.deck('truths', content.truths ?? ['Truth or rum: who here would you trust with your treasure?']),
    crew: ctx.deck('crew', content.crew ?? [{ text: 'A stowaway!', crew: 1 }]),
    kraken: ctx.deck('kraken', content.kraken ?? [{ text: 'The Kraken took one.', crew: 1 }]),
    names: ctx.deck('names', content.stowaways ?? ['Kev', 'Shaz', 'Gaz', 'Baz']),
  };
  let fateDeck = [];
  const drawFate = () => {
    if (!fateDeck.length) fateDeck = shuffle(FATE_DECK);
    return fateDeck.pop();
  };

  // ----- the pirates -----
  const P = ctx.players.map((p) => ({
    p,
    id: p.id,
    pos: 0,
    iou: 0,
    calling: null,
    captain: false,
    ship: 'rowboat',
    crew: [],
    maps: [],
    cards: [],
    mate: null,
    swigs: 0,
    retired: false,
    place: 0,
    plan: null, // at the Lair: 'sunset' or 'job'
    branch: {}, // fork space -> chosen next space
    becalmed: false,
    fair: false,
    roll: null,
    move: 0,
    path: [],
    news: [], // this year, for the phone
    stats: { raidsWon: 0, raidsLost: 0, crewLost: 0, heartbreaks: 0, legends: 0, gave: 0, rolls: [] },
  }));
  const of = (p) => P.find((x) => x.p === p);
  const byId = (id) => P.find((x) => x.id === id);
  const sailing = () => P.filter((x) => !x.retired);
  const ship = (x) => SHIPS.find((s) => s.id === x.ship);
  const callingOf = (x) => x.calling ?? {};
  const perk = (x, id) => x.calling?.id === id;
  const cash = (x) => x.p.score;
  const richest = () => [...P].sort((a, b) => cash(b) - cash(a))[0];
  const poorest = () => [...P].sort((a, b) => cash(a) - cash(b))[0];
  const share = (x) => round100((callingOf(x).share ?? 1500) * (x.captain ? ECON.captain : 1));
  const stakes = (space) => STAKES[space.stage] * (space.risky ? 2 : 1);
  let arrivals = 0;
  let year = 0;

  // ----- money -----
  /** Change someone's doubloons. Run dry and the loan shark lends you more, at a price. */
  function pay(x, amount, why = null) {
    amount = Math.round(amount);
    if (!amount) return 0;
    ctx.award(x.p, amount);
    if (why) note(x, `${amount > 0 ? '+' : '−'}${money(Math.abs(amount))} ${why}`);
    while (cash(x) < 0) {
      x.iou++;
      ctx.award(x.p, ECON.loan);
      note(x, `🦈 The loan shark lends you ${money(ECON.loan)} (you owe ${money(ECON.repay)})`);
    }
    return amount;
  }
  /** Move doubloons from one pirate to another (never more than they have). */
  function transfer(from, to, amount, why) {
    const take = Math.max(0, Math.min(Math.round(amount), cash(from)));
    pay(from, -take, why);
    pay(to, take, why);
    return take;
  }
  const note = (x, text) => x.news.push(text);

  // ----- drinks -----
  // Everything poured on the current screen, so the TV can stamp it and the phones can buzz.
  let pours = [];
  function swig(x, n, why, { buddy = true } = {}) {
    if (!n || n < 1) return;
    if (x.cards.includes('liver')) {
      x.cards.splice(x.cards.indexOf('liver'), 1);
      pours.push({ id: x.id, n: 0, why: 'Iron Liver! Not a drop.' });
      note(x, '🫀 Iron Liver saved you a swig');
      return;
    }
    x.swigs += n;
    if (drink) {
      pours.push({ id: x.id, n, why });
      note(x, `🍺 ${n} swig${n > 1 ? 's' : ''}: ${why}`);
    } else {
      pours.push({ id: x.id, n, why, fine: fine * n });
      pay(x, -fine * n, `fine: ${why}`);
    }
    if (buddy && x.mate && !x.mate.gone) swig(x.mate, n, `drinking with ${x.p.name}`, { buddy: false });
  }

  // ----- views -----
  const pub = (x) => ({
    id: x.id,
    pos: x.pos,
    cash: cash(x),
    iou: x.iou,
    ship: x.ship,
    crew: x.crew.length,
    maps: x.maps,
    cards: x.cards.length,
    mate: x.mate?.id ?? null,
    swigs: x.swigs,
    calling: x.calling && { id: x.calling.id, name: x.calling.name, icon: x.calling.icon },
    captain: x.captain,
    retired: x.retired,
    plan: x.plan,
    place: x.place,
    becalmed: x.becalmed,
  });
  const status = (x) => ({
    cash: cash(x),
    iou: x.iou,
    calling: x.calling,
    captain: x.captain,
    share: x.calling ? share(x) : 0,
    ship: ship(x),
    crew: x.crew,
    room: ship(x).crew,
    maps: x.maps,
    cards: x.cards.map((id) => ({ id, ...FATE[id] })),
    mate: x.mate?.p.name ?? null,
    swigs: x.swigs,
    drink,
    retired: x.retired,
    year,
  });
  const boardView = board.map((s) => ({ t: s.t, seg: s.seg, next: s.next }));
  let phase = 'intro';
  let spot = {};
  let screenKey = 'ck';

  /** Put up a screen: the board on the TV with `spot` over it, and `player(x)` on each phone. */
  function show(ph, data, { player = null, onAction = null, sfx = null, key = null, keep = false } = {}) {
    phase = ph;
    spot = data ?? {};
    screenKey = key ?? `ck-${year}-${ph}-${Math.random().toString(36).slice(2, 7)}`;
    if (!keep) pours = [];
    const k = screenKey;
    ctx.screen({
      sfx,
      host: () => ({ screen: 'ck', key: k, phase, year, maxYears, board: boardView, pirates: P.map(pub), spot, pours, music: spot.music === undefined ? 'cradle' : spot.music, drink, segments: segInfo }),
      player: (p) => {
        const x = of(p);
        const view = (player ?? watch)(x) ?? watch(x);
        const mine = pours.filter((d) => d.id === x.id);
        const pour = mine.length ? { n: mine.reduce((s, d) => s + d.n, 0), why: mine.map((d) => d.why).join(' · '), fine: mine.reduce((s, d) => s + (d.fine ?? 0), 0) } : null;
        return { key: `${k}-${view.sub ?? ''}`, ...view, status: status(x), news: x.news.slice(-6), pour, drink };
      },
      onAction: (p, msg) => onAction?.(of(p), msg),
    });
  }
  const segInfo = Object.fromEntries(['cove', 'tortuga', 'strait', 'fork1', 'deep', 'lanes', 'open', 'yard', 'coast', 'fork2', 'skull', 'gov', 'reach', 'lair'].map((id) => [id, { name: segmentOf(id).name, risky: !!segmentOf(id).risky, blurb: segmentOf(id).blurb ?? '' }]));
  const watch = (x, text = 'Eyes on the big screen!', icon = '👀') => ({ screen: 'ck-wait', icon, text });
  const live = (x) => !ctx.away(x.p);

  // =========================================================================
  // The voyage
  // =========================================================================

  await ctx.intro([
    'Pick a calling, then race your ship from Cradle Cove to the Kraken’s Lair. Everyone spins the helm at once, every year.',
    'Share-outs pay your wages. Marry a crewmate at Tortuga, buy a bigger ship at the yard, take on crew, buy treasure maps that pay whenever ANYONE spins your number.',
    `Raid your rivals, tell tall tales, and when the sea says drink${drink ? `, you drink your ${drink}` : ', you pay a fine'}. Shipmates drink together.`,
    'At the Lair, retire safe or risk it all on One Last Job. Richest pirate at the end takes the lot.',
  ]);

  await chooseCallings();
  while (sailing().length && year < maxYears) {
    year++;
    for (const x of P) x.news = [];
    await spinPhase();
    await sailPhase();
    const tasks = await landPhase();
    await decidePhase(tasks);
    await theShow(tasks);
  }
  await finale();
  await ctx.gameOver();

  // =========================================================================
  // Callings
  // =========================================================================

  async function chooseCallings() {
    const pool = shuffle(callings);
    let i = 0;
    const offers = new Map(P.map((x) => {
      const two = [];
      while (two.length < 2 && pool.length) {
        const c = pool[i++ % pool.length];
        if (!two.includes(c)) two.push(c);
        if (i > pool.length * 4) break;
      }
      return [x, two];
    }));
    const chosen = new Map();
    show('calling', { offers: [...offers].map(([x, two]) => ({ id: x.id, options: two.map((c) => c.id) })), chosen: [] }, {
      sfx: 'ckBell',
      player: (x) => (chosen.has(x) ? watch(x, `${chosen.get(x).icon} ${chosen.get(x).name}`, '✅') : { screen: 'ck-calling', sub: 'pick', options: offers.get(x), purse: Number(content.purse) || 2000 }),
      onAction: (x, msg) => {
        if (msg.type !== 'ck-calling' || chosen.has(x)) return;
        const c = offers.get(x).find((o) => o.id === msg.id);
        if (c) chosen.set(x, c);
        spot.chosen = [...chosen.keys()].map((y) => y.id);
      },
    });
    await ctx.wait(ctx.seconds('calling', 25), { timer: true, until: () => P.every((x) => chosen.has(x) || !live(x)) });
    for (const x of P) {
      x.calling = chosen.get(x) ?? offers.get(x)[0] ?? { id: 'none', name: 'Deckhand', icon: '🧹', share: 1500, perk: '' };
      pay(x, Number(content.purse) || 2000);
      if (perk(x, 'powdermonkey')) x.cards.push(drawFate(), drawFate());
      if (perk(x, 'seawitch')) {
        const free = freeNumbers();
        if (free.length) x.maps.push(sample(free));
      }
    }
    show('callings', { list: P.map((x) => ({ id: x.id, calling: x.calling, maps: x.maps })) }, { sfx: 'ckCoins' });
    await ctx.wait(Math.min(9000, 3500 + P.length * 500));
  }

  function freeNumbers() {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((n) => !P.some((x) => x.maps.includes(n)));
  }

  // =========================================================================
  // 1. Spin
  // =========================================================================

  async function spinPhase() {
    const crew = sailing();
    const spun = new Set();
    const payouts = []; // { n, owner, by }
    for (const x of P) Object.assign(x, { roll: null, move: 0, path: [], fair: false });

    const spin = (x, fair) => {
      if (spun.has(x) || x.retired) return;
      spun.add(x);
      const roll = 1 + Math.floor(Math.random() * 10);
      x.roll = roll;
      x.stats.rolls.push(roll);
      let move = roll;
      const why = [];
      if (fair && x.cards.includes('fair')) {
        x.cards.splice(x.cards.indexOf('fair'), 1);
        x.fair = true;
        move += 3;
        why.push('🌬️ +3');
      }
      if (x.becalmed) {
        x.becalmed = false;
        move = Math.ceil(move / 2);
        why.push('🌫️ halved');
      }
      if (perk(x, 'navigator') && move < 3) {
        move = 3;
        why.push('🧭 at least 3');
      }
      x.move = move;
      x.moveWhy = why.join(' ');
      note(x, `🎡 Spun ${roll}${why.length ? ` (${why.join(', ')}): sail ${move}` : ''}`);
      for (const owner of P.filter((y) => y.maps.includes(roll))) {
        pay(owner, ECON.mapPays, `map ${roll} came up for ${x === owner ? 'you' : x.p.name}`);
        payouts.push({ n: roll, owner: owner.id, by: x.id });
      }
      if (roll === 1) swig(x, 1, 'spun a 1, ye bilge rat');
      spot.spun = crew.filter((y) => spun.has(y)).map((y) => ({ id: y.id, roll: y.roll, move: y.move, why: y.moveWhy }));
      spot.payouts = payouts.slice();
      ctx.update();
    };

    show('spin', { spun: [], payouts: [], sailing: crew.map((x) => x.id) }, {
      sfx: year === 1 ? 'ckHorn' : 'ckBell',
      player: (x) => {
        if (x.retired) return watch(x, 'The living spin the helm…', '👻');
        return { screen: 'ck-helm', sub: spun.has(x) ? 'spun' : 'spin', mode: 'move', roll: x.roll, move: x.move, why: x.moveWhy, canFair: x.cards.includes('fair') && !spun.has(x), becalmed: x.becalmed };
      },
      onAction: (x, msg) => {
        if (msg.type === 'ck-spin') spin(x, !!msg.fair);
      },
    });
    await ctx.wait(ctx.seconds('spin', 15), { timer: true, until: () => crew.every((x) => spun.has(x) || !live(x)) });
    for (const x of crew) spin(x, false); // the wheel spins itself for anyone who dawdled
    ctx.update();
    await ctx.wait(3800 + payouts.length * 400); // long enough for the last wheel to stop on the phones (2.6s)
  }

  // =========================================================================
  // 2. Sail
  // =========================================================================

  async function sailPhase() {
    const events = [];
    for (const x of sailing()) {
      let at = x.pos;
      const path = [];
      for (let s = 0; s < x.move; s++) {
        const here = board[at];
        if (!here.next.length) break;
        at = here.next.length > 1 ? (x.branch[here.i] ?? sample(here.next)) : here.next[0];
        path.push(at);
        const t = board[at].t;
        if (t === 'p') {
          const amount = share(x);
          pay(x, amount, 'share-out');
          events.push({ id: x.id, step: path.length, kind: 'pay', amount });
          for (const q of P.filter((y) => y !== x && perk(y, 'quartermaster'))) pay(q, ECON.quartermasterCut, `your cut of ${x.p.name}’s share-out`);
        }
        if (t === 'T' || t === 'Y') events.push({ id: x.id, step: path.length, kind: t });
        if (STOPS.has(t) || t === 'T' || t === 'Y') {
          // Tortuga and the yard catch you on the way past, but only forks and the Lair stop the ship.
          if (STOPS.has(t)) break;
        }
      }
      x.path = path;
      x.passed = new Set(path.map((i) => board[i].t));
      x.from = x.pos;
      x.pos = at;
    }
    const longest = Math.max(1, ...sailing().map((x) => x.path.length));
    pours = [];
    show('sail', { paths: sailing().map((x) => ({ id: x.id, from: x.from, path: x.path })), events, hop: 0.42 }, { sfx: 'ckSail' });
    await ctx.wait(longest * 420 + 1600);
  }

  // =========================================================================
  // 3. Land
  // =========================================================================

  /** Everything that happens where each ship comes to rest. Returns the choices to make on the phones. */
  async function landPhase() {
    const cards = [];
    const tasks = new Map(P.map((x) => [x, []]));
    const queue = { tales: [] };
    const task = (x, t) => tasks.get(x).push({ id: `${t.kind}-${tasks.get(x).length}`, answer: null, ...t });

    for (const x of sailing()) {
      if (!x.path.length) continue;
      const space = board[x.pos];
      const k = stakes(space);
      const card = { id: x.id, t: space.t, title: KINDS[space.t]?.name ?? '', icon: KINDS[space.t]?.icon ?? '', seg: space.seg, risky: space.risky, text: '', gain: 0, swigs: 0 };
      const before = cash(x);
      // Tortuga and the yard happen on the way past even if the ship sails on.
      if (x.passed.has('T') && space.t !== 'T') tortuga(x, task, card, true);
      if (x.passed.has('Y') && space.t !== 'Y') yard(x, task, card, true);
      switch (space.t) {
        case '$': {
          const c = decks.fortune.draw();
          card.text = ctx.fill(c.text);
          pay(x, round100((c.gain ?? 1000) * k), 'fortune');
          break;
        }
        case 'x': {
          const c = decks.misfortune.draw();
          card.text = ctx.fill(c.text);
          pay(x, -round100((c.lose ?? 1000) * k * (perk(x, 'smuggler') ? 0.5 : 1)), 'misfortune');
          break;
        }
        case 'g': {
          const c = decks.grog.draw();
          card.text = ctx.fill(c.text);
          card.kind = c.kind;
          const n = (c.swigs ?? 1) + (space.risky && c.swigs ? 1 : 0);
          card.n = n;
          for (const cook of P.filter((y) => perk(y, 'cook'))) pay(cook, ECON.cookCut, `sold ${x === cook ? 'yourself' : x.p.name} the grog`);
          if (c.kind === 'self') swig(x, n, card.text);
          else if (c.kind === 'all') for (const y of P) swig(y, n, `${x.p.name} landed on grog`, { buddy: false });
          else if (c.kind === 'others') for (const y of P) if (y !== x) swig(y, n, `${x.p.name} landed on grog`, { buddy: false });
          else if (c.kind === 'richest') swig(richest(), n, 'the richest pirate pays the bar');
          else if (c.kind === 'poorest') swig(poorest(), n, 'the poorest pirate drowns their sorrows');
          else if (c.kind === 'mate') {
            swig(x, n, card.text, { buddy: false });
            if (x.mate) swig(x.mate, n, `${x.p.name}’s grog`, { buddy: false });
          } else if (c.kind === 'give') {
            task(x, { kind: 'give', n, required: true, text: card.text });
            card.text += ` (${n} swigs to hand out)`;
          }
          else if (c.kind === 'game') card.game = true;
          break;
        }
        case 'r': {
          const targets = P.filter((y) => y !== x && y !== x.mate && !y.retired);
          if (targets.length) {
            card.text = 'Pick a rival to raid on your phone.';
            task(x, { kind: 'raid', required: true, options: targets.map((y) => y.id), stakes: k });
          }
          else {
            card.text = 'Nobody to raid! You plunder a passing fishing boat.';
            pay(x, round100(1000 * k), 'a fishing boat');
          }
          break;
        }
        case 'f': {
          const n = perk(x, 'powdermonkey') ? 2 : 1;
          const drawn = Array.from({ length: n }, drawFate);
          for (const id of drawn) {
            x.cards.push(id);
            note(x, `🃏 Drew ${FATE[id].name}`);
          }
          while (x.cards.length > HAND) x.cards.shift();
          card.text = `Drew ${drawn.map((id) => `${FATE[id].icon} a card`).join(' and ')}.`; // what's in the hand stays secret
          break;
        }
        case 't':
          if (Math.random() < 0.5) {
            card.text = ctx.fill(decks.tales.draw());
            queue.tales.push({ kind: 'tale', x, prompt: card.text, stakes: k });
          } else {
            card.title = 'Truth or Rum';
            card.text = ctx.fill(decks.truths.draw());
            queue.tales.push({ kind: 'truth', x, prompt: card.text, stakes: k });
          }
          break;
        case 'c': {
          const c = decks.crew.draw();
          card.text = ctx.fill(c.text);
          hire(x, c.crew ?? 1, card);
          break;
        }
        case 'k': {
          const c = decks.kraken.draw();
          card.text = ctx.fill(c.text);
          const n = (c.crew ?? 1) + (space.risky ? 1 : 0);
          if (perk(x, 'surgeon') && x.crew.length) {
            card.text += ' Your surgeon stitches them back together.';
          } else if (x.crew.length) {
            const lost = x.crew.splice(-Math.min(n, x.crew.length));
            x.stats.crewLost += lost.length;
            card.lost = lost;
            note(x, `🐙 Lost ${lost.join(' and ')}`);
            swig(x, lost.length, `lost ${lost.join(' and ')} to the deep`);
          } else {
            card.text += ' No crew to take, so it takes your doubloons.';
            pay(x, -round100(1000 * k), 'the Kraken');
            swig(x, 1, 'the Kraken');
          }
          break;
        }
        case 'm': {
          const free = freeNumbers();
          if (x.maps.length < ECON.mapsEach && free.length) {
            card.text = 'A map seller! Buy a number on your phone?';
            task(x, { kind: 'map', required: true, options: free, cost: ECON.mapCost, pays: ECON.mapPays });
          }
          else card.text = x.maps.length >= ECON.mapsEach ? 'Your sea chest is full of maps already.' : 'Every map has been sold!';
          break;
        }
        case 'p':
          card.text = 'Payday! Wages paid on the way in.';
          break;
        case 'T':
          tortuga(x, task, card, false);
          break;
        case 'Y':
          yard(x, task, card, false);
          break;
        case 'F': {
          const seg = segmentOf(space.seg);
          card.text = 'Which way, captain?';
          task(x, { kind: 'fork', required: true, options: seg.fork.map((id, n) => ({ id: n, name: segmentOf(id).name, blurb: segmentOf(id).blurb ?? '', risky: !!segmentOf(id).risky })), at: space.i });
          break;
        }
        case 'E': {
          x.retired = true;
          x.place = ++arrivals;
          const bonus = ECON.arrival[x.place - 1] ?? 0;
          card.text = `Home, in ${['first', 'second', 'third', 'fourth', 'fifth'][x.place - 1] ?? `${x.place}th`} place.`;
          if (bonus) pay(x, bonus, 'arrival bonus');
          task(x, { kind: 'retire', required: true, options: ['sunset', 'job'], pension: ECON.pension });
          break;
        }
      }
      card.gain = cash(x) - before;
      cards.push(card);
    }

    // Retired pirates haunt the living.
    for (const g of P.filter((y) => y.retired && y.plan)) {
      const victims = sailing();
      if (victims.length) task(g, { kind: 'haunt', required: false, options: victims.map((y) => y.id) });
    }
    // Anyone holding a card they can play now.
    for (const x of P) {
      const playable = [...new Set(x.cards.filter((id) => !FATE[id].passive && FATE[id].when !== 'spin'))];
      if (playable.length && !(x.retired && x.plan)) task(x, { kind: 'card', required: false, options: playable, targets: P.filter((y) => y !== x && !y.retired).map((y) => y.id) });
    }

    const seconds = Math.min(10000, 4200 + cards.length * 700);
    show('land', { cards }, { sfx: cards.some((c) => c.t === 'k') ? 'ckKraken' : 'ckLand', player: (x) => landWatch(x), keep: true }); // keep the drinks poured on landing
    await ctx.wait(seconds);
    return { tasks, queue };
  }
  function landWatch(x) {
    if (x.retired && !x.path.length) return watch(x, 'The living reach their landfalls…', '👻');
    const space = board[x.pos];
    return { screen: 'ck-wait', icon: KINDS[space.t]?.icon ?? '👀', text: `You landed on ${KINDS[space.t]?.name ?? 'the sea'}`, sub: 'land', where: segmentOf(space.seg).name };
  }

  function hire(x, n, card) {
    const room = ship(x).crew - x.crew.length;
    const joined = [];
    for (let i = 0; i < n; i++) {
      const name = decks.names.draw();
      if (joined.length < room) joined.push(name);
    }
    x.crew.push(...joined);
    if (joined.length) {
      card.joined = joined;
      note(x, `🧑‍🤝‍🧑 ${joined.join(' and ')} joined your crew`);
      for (const y of P) if (y !== x) transfer(y, x, ECON.whipRound, `whip-round for ${x.p.name}’s new crew`);
    }
    if (joined.length < n) card.text += ` No room aboard your ${ship(x).name.toLowerCase()}${joined.length ? ' for the rest' : ''}: they swim home.`;
  }

  function tortuga(x, task, card, passing) {
    const free = P.filter((y) => y !== x && !y.mate);
    if (x.mate) {
      pay(x, ECON.wedding / 2, 'second honeymoon');
      pay(x.mate, ECON.wedding / 2, 'second honeymoon');
      card.extra = `💍 A second honeymoon in Tortuga with ${x.mate.p.name}.`;
    } else if (free.length) {
      task(x, { kind: 'propose', required: true, options: free.map((y) => y.id) });
      card.extra = '💍 Tortuga! Time to find a shipmate.';
    } else {
      pay(x, ECON.sea, 'married to the sea');
      card.extra = '🌊 Everyone’s spoken for. You marry the sea.';
    }
    if (!passing) card.text = card.extra;
  }

  function yard(x, task, card, passing) {
    if (!x.captain) {
      x.captain = true;
      note(x, `🎖️ Made captain: share-outs now pay ${money(share(x))}`);
    }
    const discount = perk(x, 'carpenter') ? 2 / 3 : 1;
    const current = ship(x);
    const offers = SHIPS.filter((s) => s.cost > current.cost).map((s) => ({ id: s.id, name: s.name, icon: s.icon, crew: s.crew, duel: s.duel, price: round100(s.cost * discount - current.cost * discount * 0.5) }));
    card.extra = `🎖️ Made captain! ${offers.length ? 'The shipwrights are waiting.' : ''}`;
    if (offers.length) task(x, { kind: 'ship', required: true, options: offers, cash: cash(x) });
    if (!passing) card.text = card.extra;
  }

  // =========================================================================
  // 4. Decide
  // =========================================================================

  async function decidePhase({ tasks }) {
    const all = () => [...tasks.values()].flat();
    if (!all().length) return;
    const proposals = new Map(); // target -> [suitors]
    const answered = (x) => tasks.get(x).every((t) => t.answer !== null || (!t.required && t.skipped));

    const view = (x) => {
      const mine = tasks.get(x).filter((t) => t.answer === null && !t.skipped);
      if (!mine.length) return watch(x, tasks.get(x).length ? 'Orders given!' : 'Others are deciding…', tasks.get(x).length ? '✅' : '⏳');
      return { screen: 'ck-decide', sub: mine.map((t) => t.id).join(','), tasks: mine.map((t) => taskView(x, t)) };
    };
    const name = (id) => byId(id)?.p.name ?? '?';
    const taskView = (x, t) => {
      const people = (ids) => (ids ?? []).map((id) => ({ id, name: name(id), avatar: byId(id).p.avatar, color: byId(id).p.color, cash: cash(byId(id)) }));
      switch (t.kind) {
        case 'propose':
        case 'raid':
        case 'haunt':
          return { ...t, people: people(t.options) };
        case 'answer':
          return { ...t, people: people(t.suitors) };
        case 'give':
          return { ...t, people: people(P.filter((y) => y !== x).map((y) => y.id)) };
        case 'card':
          return { ...t, cards: t.options.map((id) => ({ id, ...FATE[id] })), people: people(t.targets) };
        default:
          return t;
      }
    };

    const answer = (x, t, value) => {
      if (t.answer !== null) return;
      if (t.kind === 'propose') {
        if (value !== 'sea' && !t.options.includes(value)) return;
        t.answer = value;
        if (value !== 'sea') {
          const target = byId(value);
          if (!proposals.has(target)) proposals.set(target, []);
          proposals.get(target).push(x);
          // A target who already proposed to the suitor: love at first sight, no need to ask.
          const back = tasks.get(target).find((u) => u.kind === 'propose' && u.answer === x.id);
          const mine = tasks.get(x).find((u) => u.kind === 'answer' && u.answer === null && u.suitors.includes(target.id));
          if (mine) mine.answer = target.id; // they asked first: proposing back is a yes
          let reply = tasks.get(target).find((u) => u.kind === 'answer');
          if (!back) {
            if (!reply) {
              reply = { id: `answer-${tasks.get(target).length}`, kind: 'answer', required: true, suitors: [], answer: null };
              tasks.get(target).push(reply);
            }
            if (reply.answer === null) reply.suitors.push(x.id);
          }
        }
      } else if (t.kind === 'answer') {
        if (value !== 'none' && !t.suitors.includes(value)) return;
        t.answer = value;
      } else if (t.kind === 'give') {
        const ids = Array.isArray(value) ? value.filter((id) => byId(id) && id !== x.id).slice(0, t.n) : [];
        if (ids.length !== t.n) return;
        t.answer = ids;
      } else if (t.kind === 'card') {
        if (value === 'skip') return void (t.skipped = true);
        const card = t.options.find((id) => id === value?.card);
        if (!card || (FATE[card].target && !t.targets.includes(value.target))) return;
        t.answer = { card, target: value.target ?? null };
      } else if (t.kind === 'haunt') {
        if (value === 'skip') return void (t.skipped = true);
        if (!t.options.includes(value)) return;
        t.answer = value;
      } else if (t.kind === 'ship') {
        if (value !== 'keep' && !t.options.some((o) => o.id === value)) return;
        t.answer = value;
      } else if (t.kind === 'map') {
        if (value !== 'pass' && !(t.options.includes(value) && freeNumbers().includes(value))) return;
        t.answer = value;
      } else if (t.kind === 'raid') {
        if (!t.options.includes(value)) return;
        t.answer = value;
      } else if (t.kind === 'fork') {
        if (![0, 1].includes(value)) return;
        t.answer = value;
      } else if (t.kind === 'retire') {
        if (!['sunset', 'job'].includes(value)) return;
        t.answer = value;
      }
    };

    const progress = () => P.filter((x) => tasks.get(x).length).map((x) => ({ id: x.id, done: answered(x) }));
    show('decide', { progress: progress() }, {
      sfx: 'ckQuill',
      player: view,
      onAction: (x, msg) => {
        if (msg.type !== 'ck-task') return;
        const t = tasks.get(x).find((u) => u.id === msg.task);
        if (t) answer(x, t, msg.value);
        spot.progress = progress();
      },
    });
    const everyone = () => P.every((x) => answered(x) || !live(x));
    await ctx.wait(ctx.seconds('decide', 25), { timer: true, until: everyone });
    // A late proposal deserves an answer: a few more seconds for anyone still being asked.
    if (P.some((x) => live(x) && tasks.get(x).some((t) => t.kind === 'answer' && t.answer === null))) {
      await ctx.wait(9000, { timer: true, until: () => P.every((x) => !live(x) || tasks.get(x).every((t) => t.kind !== 'answer' || t.answer !== null)) });
    }

    // Anything left unanswered gets the default.
    for (const x of P) {
      for (const t of tasks.get(x)) {
        if (t.answer !== null || t.skipped) continue;
        if (t.kind === 'fork') t.answer = segmentOf(board[t.at].seg).fork.length - 1; // the safe way round
        if (t.kind === 'ship') t.answer = 'keep';
        if (t.kind === 'map') t.answer = 'pass';
        if (t.kind === 'raid') t.answer = sample(t.options);
        if (t.kind === 'propose') t.answer = 'sea';
        if (t.kind === 'answer') t.answer = 'none';
        if (t.kind === 'give') t.answer = Array.from({ length: t.n }, () => sample(P.filter((y) => y !== x)).id);
        if (t.kind === 'retire') t.answer = 'sunset';
        if (t.kind === 'card' || t.kind === 'haunt') t.skipped = true;
      }
    }
  }

  // =========================================================================
  // 5. The show: the year's drama, one beat at a time
  // =========================================================================

  async function theShow({ tasks, queue }) {
    const list = (kind) => P.flatMap((x) => tasks.get(x).filter((t) => t.kind === kind && t.answer !== null).map((t) => ({ x, t })));

    // --- orders: forks, ships, maps, retirements (quick, all on one screen) ---
    const orders = [];
    for (const { x, t } of list('fork')) {
      const seg = segmentOf(board[t.at].seg);
      x.branch[t.at] = board[t.at].next[t.answer];
      orders.push({ id: x.id, icon: '🪧', text: `heads for ${segmentOf(seg.fork[t.answer]).name}`, risky: !!segmentOf(seg.fork[t.answer]).risky });
    }
    for (const { x, t } of list('ship')) {
      if (t.answer === 'keep') {
        orders.push({ id: x.id, icon: ship(x).icon, text: `keeps the ${ship(x).name.toLowerCase()}` });
        continue;
      }
      const offer = t.options.find((o) => o.id === t.answer);
      pay(x, -offer.price, `bought a ${offer.name.toLowerCase()}`);
      x.ship = offer.id;
      orders.push({ id: x.id, icon: offer.icon, text: `buys a ${offer.name.toLowerCase()} for ${money(offer.price)}`, ship: offer.id });
    }
    for (const { x, t } of list('map')) {
      if (t.answer === 'pass' || !freeNumbers().includes(t.answer)) continue;
      pay(x, -t.cost, `treasure map ${t.answer}`);
      x.maps.push(t.answer);
      orders.push({ id: x.id, icon: '🗺️', text: `buys treasure map ${t.answer}` });
    }
    for (const { x, t } of list('retire')) {
      x.plan = t.answer;
      if (t.answer === 'sunset') pay(x, ECON.pension, 'a pension at Sunset Cove');
      orders.push({ id: x.id, icon: t.answer === 'sunset' ? '🌅' : '💀', text: t.answer === 'sunset' ? 'retires to Sunset Cove' : 'plans One Last Job' });
    }
    if (orders.length) {
      show('orders', { orders }, { sfx: 'ckQuill' });
      await ctx.wait(Math.min(9000, 3000 + orders.length * 900));
    }

    // --- weddings and heartbreak ---
    const weds = [];
    const proposed = list('propose');
    const done = new Set();
    for (const { x, t } of proposed) {
      if (done.has(x)) continue;
      if (t.answer === 'sea') {
        pay(x, ECON.sea, 'married to the sea');
        weds.push({ kind: 'sea', a: x.id });
        done.add(x);
        continue;
      }
      const target = byId(t.answer);
      const mutual = tasks.get(target).some((u) => u.kind === 'propose' && u.answer === x.id);
      const reply = tasks.get(target).find((u) => u.kind === 'answer');
      const yes = (mutual || reply?.answer === x.id) && !x.mate && !target.mate;
      if (yes) {
        x.mate = target;
        target.mate = x;
        done.add(x).add(target);
        weds.push({ kind: 'wed', a: x.id, b: target.id, mutual });
      } else {
        x.stats.heartbreaks++;
        weds.push({ kind: 'no', a: x.id, b: target.id, swigs: 2 });
        done.add(x);
      }
    }
    for (const w of weds) {
      const a = byId(w.a);
      const b = w.b ? byId(w.b) : null;
      if (w.kind === 'wed') {
        for (const y of [a, b]) {
          pay(y, ECON.wedding, 'wedding gift');
          for (const z of P) if (z !== a && z !== b) transfer(z, y, ECON.whipRound, `a wedding present for ${y.p.name}`);
        }
      }
      show('wedding', { ...w }, { sfx: w.kind === 'wed' ? 'ckWedding' : w.kind === 'no' ? 'ckHeartbreak' : 'ckWave' });
      if (w.kind === 'no') swig(a, 2, `${b.p.name} turned you down`, { buddy: false });
      if (w.kind === 'wed') {
        swig(a, 1, 'a toast to the happy couple', { buddy: false });
        swig(b, 1, 'a toast to the happy couple', { buddy: false });
      }
      await ctx.wait(w.kind === 'sea' ? 3500 : 5500);
    }

    // --- fate cards ---
    for (const { x, t } of list('card')) {
      const { card, target } = t.answer;
      if (!x.cards.includes(card)) continue;
      x.cards.splice(x.cards.indexOf(card), 1);
      const y = target ? byId(target) : null;
      const beat = { by: x.id, card, name: FATE[card].name, icon: FATE[card].icon, target, text: '' };
      show('card', beat, { sfx: 'ckCard' });
      if (y && FATE[card].nasty && y.cards.includes('parley')) {
        y.cards.splice(y.cards.indexOf('parley'), 1);
        beat.text = `${y.p.name} waves a white flag: Parley! Nothing happens.`;
        beat.blocked = true;
      } else if (card === 'becalm') {
        y.becalmed = true;
        beat.text = `${y.p.name}’s next spin is halved.`;
      } else if (card === 'bait') {
        if (y.crew.length && !perk(y, 'surgeon')) {
          const lost = y.crew.pop();
          y.stats.crewLost++;
          beat.text = `The Kraken takes ${lost} from ${y.p.name}’s ship.`;
        } else {
          beat.text = `No crew it can take, so it bites ${y.p.name}’s purse instead.`;
          pay(y, -1000, 'Kraken Bait');
        }
        swig(y, 1, `${x.p.name}’s Kraken Bait`);
      } else if (card === 'press') {
        if (y.crew.length && x.crew.length < ship(x).crew) {
          const who = y.crew.pop();
          x.crew.push(who);
          beat.text = `${who} is press-ganged from ${y.p.name}’s ship to ${x.p.name}’s.`;
        } else beat.text = y.crew.length ? `No room aboard! ${x.p.name}’s ship is full.` : `${y.p.name} has nobody to take.`;
      } else if (card === 'pickpocket') {
        const took = transfer(y, x, 1500, 'pickpocket');
        beat.text = `${x.p.name} lifts ${money(took)} from ${y.p.name}’s pocket.`;
      } else if (card === 'round') {
        for (const z of P) {
          if (z === x) continue;
          transfer(z, x, ECON.wager, `${x.p.name}’s round`);
          swig(z, 1, `${x.p.name}’s round`, { buddy: false });
        }
        beat.text = `Everyone drinks to ${x.p.name}, and everyone pays.`;
      }
      ctx.update();
      await ctx.wait(5000);
    }

    // --- raids ---
    for (const { x, t } of list('raid')) await raid(x, byId(t.answer), t.stakes);

    // --- tales and truths ---
    for (const tale of queue.tales) await (tale.kind === 'tale' ? tellTale(tale) : truthOrRum(tale));

    // --- swigs given out ---
    const gifts = list('give');
    if (gifts.length) {
      show('give', { gifts: gifts.map(({ x, t }) => ({ by: x.id, to: t.answer, text: t.text })) }, { sfx: 'ckSwig' });
      for (const { x, t } of gifts) {
        x.stats.gave += t.answer.length;
        const counts = {};
        for (const id of t.answer) counts[id] = (counts[id] ?? 0) + 1;
        for (const [id, n] of Object.entries(counts)) swig(byId(id), n, `a gift from ${x.p.name}`);
      }
      ctx.update();
      await ctx.wait(6000);
    }

    // --- hauntings ---
    const haunts = list('haunt');
    if (haunts.length) {
      show('haunt', { haunts: haunts.map(({ x, t }) => ({ by: x.id, to: t.answer })) }, { sfx: 'ckGhost' });
      for (const { x, t } of haunts) {
        const y = byId(t.answer);
        transfer(y, x, ECON.haunt, `haunted by ${x.p.name}`);
        swig(y, 1, `haunted by ${x.p.name}`);
      }
      ctx.update();
      await ctx.wait(5000);
    }
  }

  // ----- a raid: a duel of spins, with the rest of the crew betting on it -----
  async function raid(a, b, k) {
    if (b.cards.includes('parley')) {
      b.cards.splice(b.cards.indexOf('parley'), 1);
      show('duel', { a: a.id, b: b.id, parley: true }, { sfx: 'ckParley' });
      await ctx.wait(4500);
      return;
    }
    const bonus = (x) => ship(x).duel + (perk(x, 'gunner') ? 2 : 0);
    const rolls = new Map();
    const bets = new Map(); // bettor -> 'a' | 'b'
    const crowd = P.filter((y) => y !== a && y !== b);
    const bounty = richest() === b && cash(b) > 0;
    const beat = { a: a.id, b: b.id, bonus: { a: bonus(a), b: bonus(b) }, rolls: {}, bets: {}, bounty, music: 'cradleDuel' };
    const spin = (x) => {
      if (rolls.has(x)) return;
      rolls.set(x, 1 + Math.floor(Math.random() * 10));
      beat.rolls[x.id] = rolls.get(x);
      ctx.update();
    };
    show('duel', beat, {
      sfx: 'ckDuel',
      player: (x) => {
        if (x === a || x === b) return { screen: 'ck-helm', sub: rolls.has(x) ? 'spun' : 'spin', mode: 'duel', roll: rolls.get(x) ?? null, bonus: bonus(x), foe: (x === a ? b : a).p.name, raider: x === a };
        if (bets.has(x)) return watch(x, `You backed ${(bets.get(x) === 'a' ? a : b).p.name}`, '🎲');
        return { screen: 'ck-wager', sub: 'bet', a: { id: a.id, name: a.p.name, bonus: bonus(a) }, b: { id: b.id, name: b.p.name, bonus: bonus(b) }, stake: ECON.wager };
      },
      onAction: (x, msg) => {
        if (msg.type === 'ck-spin' && (x === a || x === b)) spin(x);
        if (msg.type === 'ck-bet' && crowd.includes(x) && !bets.has(x) && ['a', 'b'].includes(msg.side)) {
          bets.set(x, msg.side);
          beat.bets[x.id] = msg.side;
        }
      },
    });
    await ctx.wait(ctx.seconds('duel', 10), { timer: true, until: () => [a, b].every((x) => rolls.has(x) || !live(x)) && crowd.every((x) => bets.has(x) || !live(x)) });
    spin(a);
    spin(b);
    const ta = rolls.get(a) + bonus(a);
    const tb = rolls.get(b) + bonus(b);
    beat.totals = { a: ta, b: tb };
    beat.music = null;
    const winner = ta > tb ? a : tb > ta ? b : null;
    show('duel', beat, { sfx: winner ? 'ckCannon' : 'ckClash' });
    if (!winner) {
      beat.result = 'draw';
      swig(a, 1, 'a bloody draw');
      swig(b, 1, 'a bloody draw');
    } else if (winner === a) {
      beat.result = 'a';
      let take = Math.max(ECON.raidMin, cash(b) * ECON.raidShare) * (perk(a, 'privateer') ? 2 : 1);
      take = transfer(b, a, round100(take), `raided ${b.p.name}`);
      if (bounty) pay(a, ECON.bounty, `the Navy’s bounty on ${b.p.name}`);
      beat.take = take + (bounty ? ECON.bounty : 0);
      a.stats.raidsWon++;
      b.stats.raidsLost++;
      swig(b, 2, `raided by ${a.p.name}`);
    } else {
      beat.result = 'b';
      beat.take = transfer(a, b, round100(ECON.raidFail * k), `beaten off by ${b.p.name}`);
      b.stats.raidsWon++;
      a.stats.raidsLost++;
      swig(a, 2, `beaten off by ${b.p.name}`);
    }
    for (const [x, side] of bets) {
      const right = winner && (side === 'a' ? a : b) === winner;
      if (right) pay(x, ECON.wager, 'a good bet');
      else swig(x, 1, 'a bad bet');
    }
    beat.wagers = [...bets].map(([x, side]) => ({ id: x.id, right: !!winner && (side === 'a' ? a : b) === winner }));
    ctx.update();
    await ctx.wait(6500);
  }

  // ----- a tavern tale: tell it out loud, the crew votes Legend or Bilge -----
  async function tellTale({ x, prompt, stakes: k }) {
    let told = false;
    const beat = { by: x.id, prompt, stage: 'tell', music: null };
    show('tale', beat, {
      sfx: 'ckTale',
      player: (y) => (y === x ? { screen: 'ck-tale', sub: 'tell', role: 'teller', prompt } : { screen: 'ck-tale', sub: 'listen', role: 'listen', prompt, teller: x.p.name }),
      onAction: (y, msg) => {
        if (y === x && msg.type === 'ck-told') told = true;
      },
    });
    await ctx.wait(ctx.seconds('tale', 40), { timer: true, until: () => told || !live(x) });

    const votes = new Map();
    const voters = P.filter((y) => y !== x);
    beat.stage = 'vote';
    beat.votes = {};
    show('tale', beat, {
      sfx: 'ckBell',
      player: (y) => (y === x ? watch(y, 'The crew is voting on your tale…', '😬') : votes.has(y) ? watch(y, 'Vote cast!', '🗳️') : { screen: 'ck-vote', sub: 'vote', prompt, teller: x.p.name }),
      onAction: (y, msg) => {
        if (msg.type === 'ck-vote' && voters.includes(y) && !votes.has(y) && ['legend', 'bilge'].includes(msg.vote)) {
          votes.set(y, msg.vote);
          beat.votes[y.id] = msg.vote;
        }
      },
    });
    await ctx.wait(ctx.seconds('vote', 12), { timer: true, until: () => voters.every((y) => votes.has(y) || !live(y)) });
    const legend = [...votes.values()].filter((v) => v === 'legend').length;
    const bilge = votes.size - legend;
    beat.stage = 'result';
    beat.legend = legend;
    beat.bilge = bilge;
    show('tale', beat, { sfx: legend > bilge ? 'ckCheer' : 'ckBoo' });
    if (legend > bilge || (legend === bilge && legend > 0)) {
      x.stats.legends++;
      const sh = perk(x, 'shantyman');
      beat.gain = pay(x, round100(ECON.tale * k * (sh ? 2 : 1) + (sh ? legend * ECON.shantyVote : 0)), 'a legendary tale');
    } else {
      swig(x, 2, 'a tale the crew called bilge');
    }
    ctx.update();
    await ctx.wait(5000);
  }

  // ----- truth or rum: answer out loud, or drink -----
  async function truthOrRum({ x, prompt, stakes: k }) {
    let choice = null;
    let told = false;
    const beat = { by: x.id, prompt, stage: 'choose', truth: true, music: null };
    show('tale', beat, {
      sfx: 'ckTale',
      player: (y) => (y === x ? (choice ? { screen: 'ck-tale', sub: 'answer', role: 'teller', prompt, truth: true } : { screen: 'ck-truth', sub: 'choose', prompt }) : { screen: 'ck-tale', sub: 'listen', role: 'listen', prompt, teller: x.p.name, truth: true }),
      onAction: (y, msg) => {
        if (y !== x) return;
        if (msg.type === 'ck-truth' && !choice && ['answer', 'drink'].includes(msg.choice)) {
          choice = msg.choice;
          beat.stage = choice;
        }
        if (msg.type === 'ck-told' && choice === 'answer') told = true;
      },
    });
    await ctx.wait(ctx.seconds('truth', 15), { timer: true, until: () => choice !== null || !live(x) });
    if (choice === 'answer') await ctx.wait(30000, { timer: true, until: () => told || !live(x) });
    beat.stage = choice === 'answer' ? 'answered' : 'drank';
    show('tale', beat, { sfx: choice === 'answer' ? 'ckCheer' : 'ckSwig' });
    if (choice === 'answer') beat.gain = pay(x, round100(ECON.truth * k), 'telling the truth');
    else swig(x, 2, 'chose rum over the truth');
    ctx.update();
    await ctx.wait(4000);
  }

  // =========================================================================
  // The end: last jobs, the reckoning, titles
  // =========================================================================

  async function finale() {
    // The Kraken wakes for anyone still at sea.
    const late = sailing();
    if (late.length) {
      for (const x of late) {
        x.retired = true;
        x.plan = 'sunset';
        x.place = ++arrivals;
      }
      show('wakes', { late: late.map((x) => x.id), music: null }, { sfx: 'ckKraken' });
      await ctx.wait(6000);
    }

    // One Last Job.
    const jobs = P.filter((x) => x.plan === 'job');
    for (const x of jobs) {
      let roll = null;
      const beat = { by: x.id, roll: null, cash: cash(x), music: null };
      show('job', beat, {
        sfx: 'ckDrum',
        player: (y) => (y === x ? { screen: 'ck-helm', sub: roll ? 'spun' : 'spin', mode: 'job', roll } : watch(y, `${x.p.name} goes for One Last Job…`, '💀')),
        onAction: (y, msg) => {
          if (y === x && msg.type === 'ck-spin' && roll === null) {
            roll = 1 + Math.floor(Math.random() * 10);
            beat.roll = roll;
          }
        },
      });
      await ctx.wait(ctx.seconds('lastJob', 15), { timer: true, until: () => roll !== null || !live(x) });
      roll ??= 1 + Math.floor(Math.random() * 10);
      beat.roll = roll;
      const band = LAST_JOB.find((b) => roll <= b.upTo);
      const now = cash(x);
      beat.band = band.name;
      beat.times = band.times;
      ctx.update();
      await ctx.wait(2600);
      beat.gain = now > 0 ? pay(x, round100(now * band.times) - now, `One Last Job: ${band.name}`) : 0;
      show('job', beat, { sfx: band.times < 1 ? 'ckBoo' : 'ckTreasure' });
      if (band.swigs) swig(x, band.swigs, 'caught on your last job');
      await ctx.wait(5000);
    }

    // The reckoning: sell the ships, pay off the crew, cash in the maps, settle with the loan shark.
    const rows = P.map((x) => {
      const s = ship(x);
      const survey = Math.random();
      const sale = round100((s.sale[0] + (s.sale[1] - s.sale[0]) * survey) * (perk(x, 'carpenter') ? 1.25 : 1));
      const crew = x.crew.length * ECON.crewWorth;
      const maps = x.maps.length * ECON.mapSells;
      const debt = x.iou * ECON.repay;
      const start = cash(x);
      ctx.award(x.p, sale + crew + maps - debt);
      return { id: x.id, start, ship: s.id, shipName: s.name, sale, survey, crew, crewCount: x.crew.length, maps, mapCount: x.maps.length, debt, iou: x.iou, total: cash(x), swigs: x.swigs, plan: x.plan };
    }).sort((p, q) => q.total - p.total);
    show('tally', { rows, music: 'cradle' }, { sfx: 'ckCoins' });
    await ctx.wait(7000 + rows.length * 1300);

    // Titles for the night.
    const most = (f, min = 1) => {
      const best = Math.max(...P.map(f));
      return best >= min ? P.filter((x) => f(x) === best).map((x) => x.id) : [];
    };
    const avg = (x) => (x.stats.rolls.length ? x.stats.rolls.reduce((s, r) => s + r, 0) / x.stats.rolls.length : 99);
    const lowest = Math.min(...P.map(avg));
    const titles = [
      drink && { icon: '🍺', name: 'Hollow Leg', what: 'most swigs', ids: most((x) => x.swigs), value: Math.max(...P.map((x) => x.swigs)) },
      { icon: '⚔️', name: 'Most Feared', what: 'raids won', ids: most((x) => x.stats.raidsWon), value: Math.max(...P.map((x) => x.stats.raidsWon)) },
      { icon: '🎙️', name: 'Living Legend', what: 'tales the crew loved', ids: most((x) => x.stats.legends), value: Math.max(...P.map((x) => x.stats.legends)) },
      { icon: '💔', name: 'Heartbreaker’s Victim', what: 'proposals turned down', ids: most((x) => x.stats.heartbreaks), value: Math.max(...P.map((x) => x.stats.heartbreaks)) },
      { icon: '🐙', name: 'Kraken’s Favourite', what: 'crew lost to the deep', ids: most((x) => x.stats.crewLost), value: Math.max(...P.map((x) => x.stats.crewLost)) },
      { icon: '🦈', name: 'Loan Shark’s Darling', what: 'IOUs', ids: most((x) => x.iou), value: Math.max(...P.map((x) => x.iou)) },
      { icon: '🐀', name: 'Bilge Rat', what: 'worst average spin', ids: P.filter((x) => avg(x) === lowest && lowest < 99).map((x) => x.id), value: lowest < 99 ? lowest.toFixed(1) : '' },
    ].filter((t) => t && t.ids.length && t.ids.length < P.length);
    if (titles.length) {
      show('titles', { titles: titles.slice(0, 6) }, { sfx: 'ckFanfare' });
      await ctx.wait(4000 + titles.length * 1400);
    }
  }
}

export { SHIPS, FATE, ECON };
