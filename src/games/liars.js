// LiAARRRRGH'S DICE - bluff, bid, and call it.
//
// Everybody rolls their dice in secret (they show on your own phone). Then the
// crew takes turns, going round the table:
//   - BID:  "there are at least four 5s", counting every die under every cup.
//           Each bid must beat the last: more dice of any number, or the same
//           number of dice with a higher face.
//   - CALL: shout "LiAARRRRGH!" at the last bid. All the cups come up.
//           If the bid was good, the caller loses a die; if not, the bidder does.
// Whoever loses a die opens the next round. No dice left and you are out.
// The last pirate holding a die wins.
//
// Timers, dice per pirate, wild ones and the drink are in content/liars-dice.json.

import { shuffle, clamp } from '../util.js';

export const meta = {
  id: 'liars',
  name: 'LiAARRRRGH’s Dice',
  narrator: false, // nobody talks over a game of bluff: the TV and the sound effects carry it
  icon: '🎲',
  tagline: 'Bluff, bid, and call it',
  blurb: 'Roll in secret, then bid how many of a number are hiding under ALL the cups, or call the last bid a lie. Whoever’s wrong loses a die.',
  min: 2,
};

const POINTS = { challenge: 100, outlast: 300, lastStanding: 1000 };

/**
 * Dice each, when content/liars-dice.json leaves "diceEach" at 0. The game lasts
 * about one round per die on the table, so a big crew gets fewer each to keep
 * it to a quarter of an hour or so. (The classic game is five each, whatever the crew.)
 */
const autoDice = (crew) => (crew <= 3 ? 5 : crew === 4 ? 4 : crew <= 6 ? 3 : 2);

const FACE_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
const rollDie = () => 1 + Math.floor(Math.random() * 6);

/** Does this die count towards a bid on `face`? */
export const counts = (die, face, wild) => die === face || (wild && die === 1);

/** Is "q dice showing f" a bid that may follow `bid`, with `total` dice on the table? */
export function legalBid(q, f, bid, total) {
  if (!Number.isInteger(q) || !Number.isInteger(f) || f < 1 || f > 6 || q < 1 || q > total) return false;
  return !bid || q > bid.q || (q === bid.q && f > bid.f);
}

/**
 * The ship's parrot plays for anyone who runs out of time or has wandered off.
 * It plays the odds and never bluffs: it knows the hand it is standing in for,
 * and reckons one in six of everybody else's dice shows any given number
 * (one in three with wild ones). Returns { q, f } or 'call'.
 */
export function parrot(dice, bid, total, wild) {
  const mine = (f) => dice.filter((d) => counts(d, f, wild)).length;
  const expected = (f) => mine(f) + (total - dice.length) * (wild && f !== 1 ? 1 / 3 : 1 / 6);

  if (!bid) {
    // Open on whatever it holds most of (the higher number if it's a draw).
    let best = 1;
    for (let f = 2; f <= 6; f++) if (mine(f) >= mine(best)) best = f;
    return { q: clamp(Math.floor(expected(best)), 1, total), f: best };
  }
  if (bid.q > expected(bid.f) + 1) return 'call';

  // Otherwise the cheapest raise on each number, and take the most believable one.
  let choice = null;
  for (let f = 1; f <= 6; f++) {
    const q = f > bid.f ? bid.q : bid.q + 1;
    const margin = expected(f) - q;
    if (q <= total && (!choice || margin > choice.margin)) choice = { q, f, margin };
  }
  return !choice || choice.margin < -1.5 ? 'call' : { q: choice.q, f: choice.f };
}

const LOCKER = { screen: 'wait', key: 'ld-locker', icon: '💀', text: 'Davy Jones has your dice.', sub: 'Heckle from the deep.' };

export async function run(ctx) {
  const settings = ctx.content.liars ?? {};
  const wild = settings.wildOnes === true;
  const drink = typeof settings.drink === 'string' ? settings.drink.trim() : '';
  const each = clamp(Math.round(Number(settings.diceEach)) || autoDice(ctx.players.length), 1, 6);

  // The seating plan: turns go round this list, and the TV draws it as a ring.
  const seats = shuffle(ctx.players).map((p) => ({ p, id: p.id, dice: [], count: each, out: false }));
  const seatOf = (p) => seats.find((s) => s.p === p);
  const alive = () => seats.filter((s) => !s.out);
  /** The next pirate round the table who still has dice. */
  const after = (seat) => {
    const from = seats.indexOf(seat);
    for (let i = 1; i <= seats.length; i++) {
      const next = seats[(from + i) % seats.length];
      if (!next.out) return next;
    }
    return seat;
  };

  await ctx.intro([
    `Everyone rolls ${each === 1 ? 'one die' : `${FACE_WORDS[each]} dice`} in secret. Yours are on your phone.`,
    'On your turn, bid how many of one number are hiding under all the cups put together. Every bid must beat the last.',
    `Or call the last bid a lie. Whoever is wrong loses a die.${wild ? ' Ones are wild: they count as any number.' : ''}`,
    'The last pirate with a die takes the treasure.',
  ]);

  let starter = seats[0];
  for (let round = 1; alive().length > 1; round++) starter = await playRound(round, starter);

  // The last pirate standing always finishes top of the table.
  const champion = alive()[0];
  const bestOfTheRest = Math.max(0, ...seats.filter((s) => s !== champion).map((s) => s.p.score));
  ctx.award(champion.p, Math.max(POINTS.lastStanding, bestOfTheRest - champion.p.score + POINTS.challenge));
  await ctx.gameOver();

  // -------------------------------------------------------------------------

  /** One round: roll, bid round the table until somebody calls, lift the cups. Returns who opens the next. */
  async function playRound(round, opener) {
    const key = `ld-${round}`;
    for (const s of seats) s.dice = s.out ? [] : Array.from({ length: s.count }, rollDie).sort((a, b) => a - b);
    const total = seats.reduce((n, s) => n + s.dice.length, 0);

    let phase = 'roll'; // roll -> bid -> call -> lift -> verdict (-> sunk)
    let turn = opener;
    let thinking = false; // true while `turn` may actually act
    let bid = null; // the bid on the table: { q, f, seat, auto }
    const history = [];
    let caller = null;
    const lifted = new Set(); // seats whose cups have come up
    let tally = 0;
    let result = null;

    const hostView = () => ({
      screen: 'ld-table',
      key,
      music: phase === 'bid' ? 'liars' : null, // the bidding tune (public/liars-sound.js)
      round,
      phase,
      wild,
      total,
      seats: seats.map((s) => ({ id: s.id, count: s.dice.length, out: s.out, dice: lifted.has(s) ? s.dice : null })),
      turn: turn.id,
      thinking,
      bid: bid && { q: bid.q, f: bid.f, by: bid.seat.id, auto: bid.auto, n: history.length },
      trail: history.slice(0, -1).slice(-5).map((b) => ({ q: b.q, f: b.f })),
      caller: caller?.id ?? null,
      tally,
      result,
    });

    const handView = (p) => {
      const seat = seatOf(p);
      if (seat.out) return LOCKER;
      return {
        screen: 'ld-hand',
        key: `${key}-${history.length}`,
        round,
        phase,
        wild,
        total,
        dice: seat.dice,
        bid: bid && { q: bid.q, f: bid.f, by: bid.seat.p.name, mine: bid.seat === seat, auto: bid.auto },
        turn: turn.p.name,
        nextIsMe: turn === seat,
        myTurn: thinking && turn === seat,
      };
    };

    // --- the roll ---
    ctx.screen({
      sfx: 'ldShake',
      host: hostView,
      player: handView,
    });
    await ctx.wait(round === 1 ? 4200 : 2800);

    // --- bidding, round and round ---
    phase = 'bid';
    while (!caller) {
      const seat = turn;
      const turnKey = `${key}-${history.length}`;
      let move = null;
      thinking = true;
      ctx.screen({
        sfx: history.length ? 'ldBid' : null,
        host: hostView,
        player: handView,
        onAction: (p, msg) => {
          if (p !== seat.p || msg.key !== turnKey || move) return;
          if (msg.type === 'ld-call' && bid) move = 'call';
          if (msg.type === 'ld-bid' && legalBid(msg.q, msg.f, bid, total)) move = { q: msg.q, f: msg.f };
        },
      });
      await ctx.wait(ctx.seconds('turn', 30), { timer: true, until: () => move !== null || ctx.away(seat.p) });
      thinking = false;

      const auto = move === null;
      if (auto) move = parrot(seat.dice, bid, total, wild);
      if (move === 'call') {
        caller = seat;
      } else {
        bid = { ...move, seat, auto };
        history.push(bid);
        turn = after(seat);
        if (auto) {
          // Give the room a moment to see what the parrot did before the next pirate's clock starts.
          ctx.screen({ sfx: 'parrot', host: hostView, player: handView });
          await ctx.wait(2200);
        }
      }
    }

    // --- "LiAARRRRGH!" ---
    const accused = bid.seat;
    const watching = (p) => {
      const seat = seatOf(p);
      if (seat.out) return LOCKER;
      if (seat === caller) return { screen: 'wait', key: `${key}-call`, icon: '🫵', text: 'You called it!', sub: 'Moment of truth…' };
      if (seat === accused) return { screen: 'wait', key: `${key}-call`, icon: '😬', text: `${caller.p.name} says you’re lying!`, sub: 'Look innocent.' };
      return { screen: 'wait', key: `${key}-call`, icon: '👀', text: 'Eyes on the big screen!', sub: `${caller.p.name} called ${accused.p.name} a liar.` };
    };

    phase = 'call';
    ctx.screen({
      sfx: 'ldLiar',
      host: hostView,
      player: watching,
    });
    await ctx.wait(3800);

    // --- the cups come up one at a time, finishing with the accused ---
    phase = 'lift';
    const order = [];
    for (let s = after(accused); order.length < alive().length; s = after(s)) order.push(s);
    const beat = clamp(9000 / order.length, 750, 1400);
    for (const seat of order) {
      const found = seat.dice.filter((d) => counts(d, bid.f, wild)).length;
      lifted.add(seat);
      tally += found;
      ctx.screen({ sfx: found ? 'ldFound' : 'ldLift', host: hostView, player: watching });
      await ctx.wait(beat);
    }

    // --- the verdict ---
    const good = tally >= bid.q;
    const loser = good ? caller : accused;
    const winner = good ? accused : caller;
    ctx.award(winner.p, POINTS.challenge);
    loser.count--;
    const sunk = loser.count === 0;
    result = { count: tally, good, loser: loser.id, winner: winner.id, sunk, drink };

    const verdictFor = (p) => {
      const seat = seatOf(p);
      const vKey = `${key}-verdict`;
      if (seat === loser) {
        return { screen: 'wait', key: vKey, icon: sunk ? '💀' : '🎲', text: sunk ? 'That was your last die!' : 'You lose a die!', sub: drink ? `Take a swig of ${drink}.` : good ? 'The bid was good.' : 'Caught red-handed.' };
      }
      if (seat.out) return LOCKER;
      if (seat === winner) return { screen: 'wait', key: vKey, icon: '💰', text: `+${POINTS.challenge} doubloons`, sub: good ? 'Honest as the day is long.' : 'You smelled a rat.' };
      return { screen: 'wait', key: vKey, icon: '👀', text: `${loser.p.name} loses a die.`, sub: good ? 'The bid was good.' : 'It was a lie!' };
    };

    phase = 'verdict';
    ctx.screen({
      sfx: good ? 'ldHonest' : 'ldLie',
      host: hostView,
      player: verdictFor,
    });
    await ctx.wait(6500);

    if (sunk) {
      loser.out = true;
      for (const s of alive()) ctx.award(s.p, POINTS.outlast);
      const more = alive().length > 1;
      phase = 'sunk';
      ctx.screen({
        sfx: 'ldSunk',
        host: hostView,
        player: (p) => (p === loser.p ? { screen: 'wait', key: `${key}-sunk`, icon: '💀', text: 'You’re out of dice.', sub: 'Off to Davy Jones’ locker with you.' } : verdictFor(p)),
      });
      await ctx.wait(more ? 4500 : 3000);
    }

    return loser.out ? after(loser) : loser;
  }
}
