// DEAD RECKONING - find the spot on the treasure map.
// ("Dead reckoning" is navigating by educated guess, which is the whole game.)
//
// The TV shows clues (and a photo, if the location has one). Everyone drops an
// X on the map on their phone. The closer you are, the more doubloons you get.
//
// Locations live in content/dead-reckoning.json. Add your own photos to
// content/images/ and reference them with "image": "my-photo.jpg".

import { distanceKm } from '../util.js';

export const meta = {
  id: 'reckoning',
  name: 'Dead Reckoning',
  icon: '🗺️',
  tagline: 'X marks the spot… roughly',
  blurb: 'Clues appear on the big screen. Drop your X on the treasure map. The closer you land, the more doubloons you dig up.',
  min: 1,
};

const FULL_MARKS = 1000;
const BULLSEYE_KM = 75; // this close counts as spot-on
const FALLOFF_KM = 2000; // bigger = more forgiving

export function pointsFor(km) {
  if (km <= BULLSEYE_KM) return FULL_MARKS;
  return Math.round(FULL_MARKS * Math.exp(-(km - BULLSEYE_KM) / FALLOFF_KM));
}

export async function run(ctx) {
  const content = ctx.content.reckoning;
  const deck = ctx.deck('locations', content.locations);
  const total = Math.min(Number(content.rounds) || 5, content.locations.length);

  await ctx.intro([
    'A mystery location is coming up, with clues that get easier as time runs out.',
    'Tap the map on your phone to drop your X. Pinch to zoom in for a better aim.',
    'The closer you land, the more doubloons you dig up.',
  ]);

  for (let n = 1; n <= total; n++) {
    const double = n === total && total > 1;
    await playLocation(ctx, deck.draw(), n, total, double ? 2 : 1);
    if (n < total && n % 2 === 0) await ctx.scoreboard(`After ${n} of ${total} locations`, 7000);
  }
  await ctx.gameOver();
}

async function playLocation(ctx, place, n, total, multiplier) {
  const guesses = new Map(); // player -> { lat, lng, locked }
  const key = `dr-${n}`;
  const image = place.image ? `/content/images/${encodeURIComponent(place.image)}` : null;
  const locked = (p) => guesses.get(p)?.locked === true;

  // --- title card ---
  ctx.screen({
    say: multiplier > 1 ? 'Final location. Double doubloons.' : `Location ${n}.`,
    sfx: 'spyglass',
    host: () => ({ screen: 'dr-round', key: `${key}-title`, n, total, double: multiplier > 1 }),
  });
  await ctx.wait(3200);

  // --- guessing: clues are revealed one at a time across the countdown ---
  const clues = place.clues;
  const duration = ctx.seconds('guess', 60);
  const everyoneLocked = () => ctx.players.every((p) => locked(p) || ctx.away(p));

  ctx.startClock(duration);
  for (let shown = 1; shown <= clues.length; shown++) {
    ctx.screen({
      say: clues[shown - 1],
      sfx: 'paper',
      host: () => ({
        screen: 'dr-guess',
        key,
        n,
        total,
        image,
        clues: clues.slice(0, shown),
        more: clues.length - shown,
        progress: ctx.players.map((p) => ({ id: p.id, done: locked(p) ? 1 : 0, of: 1 })),
      }),
      player: (p) => {
        const g = guesses.get(p);
        return { screen: 'map', key, pin: g ? { lat: g.lat, lng: g.lng } : null, locked: locked(p) };
      },
      onAction: (p, msg) => {
        if (locked(p)) return;
        if (msg.type === 'pin' && msg.key === key && Number.isFinite(msg.lat) && Number.isFinite(msg.lng)) {
          guesses.set(p, { lat: Math.max(-90, Math.min(90, msg.lat)), lng: Math.max(-180, Math.min(180, msg.lng)), locked: false });
        }
        if (msg.type === 'lock' && msg.key === key && guesses.has(p)) guesses.get(p).locked = true;
      },
    });
    await ctx.wait(duration / clues.length, { until: everyoneLocked });
    if (everyoneLocked()) break;
  }
  ctx.stopClock();

  // --- reveal ---
  const results = ctx.players
    .map((p) => {
      const g = guesses.get(p);
      if (!g) return { id: p.id, player: p, km: null, points: 0 };
      const km = distanceKm(g, place);
      return { id: p.id, player: p, lat: g.lat, lng: g.lng, km: Math.round(km), points: pointsFor(km) * multiplier };
    })
    .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  for (const r of results) ctx.award(r.player, r.points);

  const closest = results[0];
  ctx.screen({
    say: `It was ${place.name}. ${closest.km !== null ? `${closest.player.name} was closest.` : 'Nobody even guessed!'}`,
    sfx: 'treasure',
    host: () => ({
      screen: 'dr-reveal',
      key: `${key}-reveal`,
      n,
      total,
      place: { name: place.name, lat: place.lat, lng: place.lng, fact: place.fact ?? null },
      image,
      results: results.map(({ player, ...rest }) => rest),
      scores: ctx.players.map((p) => ({ id: p.id, score: p.score })),
    }),
    player: (p) => {
      const r = results.find((x) => x.player === p);
      if (r.km === null) return { screen: 'wait', key: `${key}-reveal`, icon: '🌊', text: 'No X, no treasure.', sub: place.name };
      return {
        screen: 'wait',
        key: `${key}-reveal`,
        icon: r.km <= BULLSEYE_KM ? '🎯' : '🧭',
        text: `${r.km.toLocaleString('en')} km off`,
        sub: `+${r.points.toLocaleString('en')} doubloons · ${place.name}`,
      };
    },
  });
  await ctx.wait(12500);
}
