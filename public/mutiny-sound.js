// The sounds of Mutiny: the hold of a ship at night. The hull creaking, water
// slapping the planks, a drip in the bilge, boots on the deck overhead and a
// rat somewhere make the room (see the ambience in mutiny-host.js); the knock,
// the daggers and the chameleon are the plot. Synthesized, like everything in
// sound.js. Try them from the console: sfx('muCreak')

import { addEffects, SONGS } from './sound.js';

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
let kit = null;

addEffects((blocks) => {
  kit = blocks;
  const { tone, noise, voice } = blocks;
  return {
    // ----- the hold at night -----

    /** A big timber taking the strain: a slow groan that slides down. */
    muCreak(t) {
      const hz = rand(70, 110);
      voice(t, rand(1.1, 1.9), { type: 'sawtooth', freq: [[0, hz], [0.35, hz * 1.25], [0.7, hz * 0.9], [1, hz * 1.05]], gain: 0.035, attack: 0.25, release: 0.5, filter: { type: 'bandpass', from: 420, q: 4 } });
      for (let i = 0; i < 4; i++) noise(t + rand(0.1, 1.4), 0.03, { gain: rand(0.02, 0.05), from: rand(500, 1200), type: 'bandpass', q: 5, attack: 0.002 });
    },
    /** The sea on the other side of the planks: a slap, and a gurgle running aft. */
    muLap(t) {
      noise(t, 1.6, { gain: 0.07, from: 180, to: 520, attack: 0.7 });
      noise(t + 0.9, 0.5, { gain: 0.05, from: 900, to: 400, type: 'bandpass', q: 1.2, attack: 0.05 });
      for (let i = 0; i < 5; i++) tone(rand(240, 420), t + 1.1 + i * rand(0.08, 0.16), 0.07, { type: 'sine', gain: 0.012, slideTo: rand(300, 600) });
    },
    /** A drip into the bilge. */
    muDrip(t) {
      const hz = rand(900, 1500);
      tone(hz, t, 0.09, { type: 'sine', gain: 0.045, slideTo: hz * 1.9 });
      tone(hz * 0.5, t + 0.05, 0.16, { type: 'sine', gain: 0.02, slideTo: hz * 0.4 });
    },
    /** Boots crossing the deck overhead. Everybody below holds their breath. */
    muSteps(t) {
      const steps = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < steps; i++) {
        const at = t + i * 0.52 + rand(-0.04, 0.04);
        noise(at, 0.09, { gain: 0.16, from: 260, to: 120, attack: 0.004 });
        tone(72, at, 0.16, { gain: 0.1, slideTo: 50 });
      }
    },
    /** A rat: a squeak or two, and claws on the planks. */
    muRat(t) {
      for (let i = 0; i < 2; i++) voice(t + i * 0.16, 0.08, { type: 'sine', freq: [[0, 3300], [0.5, 4100], [1, 3000]], gain: 0.025, attack: 0.005, release: 0.04 });
      for (let i = 0; i < 14; i++) noise(t + 0.3 + i * 0.07, 0.02, { gain: 0.03, from: rand(2500, 4500), type: 'bandpass', q: 3, attack: 0.001 });
    },
    /** A lantern swinging on its hook. */
    muChain(t) {
      for (let i = 0; i < 3; i++) tone(rand(1700, 2300), t + i * rand(0.09, 0.2), 0.12, { type: 'triangle', gain: 0.014 });
    },

    // ----- the plot -----

    /** Knuckles on the barrel: the secret knock. */
    muKnock(t) {
      for (const at of [0, 0.16, 0.5]) {
        noise(t + at, 0.05, { gain: 0.22, from: 520, to: 220, attack: 0.002 });
        tone(128, t + at, 0.12, { gain: 0.15, slideTo: 88 });
      }
    },
    /** The bosun, under their breath: psst. */
    muWhistle(t) {
      noise(t, 0.16, { gain: 0.07, from: 5200, type: 'highpass', attack: 0.02 });
      noise(t + 0.24, 0.3, { gain: 0.09, from: 6000, type: 'highpass', attack: 0.03 });
    },
    /** Every hand at once: sleeves, and a murmur round the barrel. */
    muHands(t) {
      for (let i = 0; i < 7; i++) noise(t + rand(0, 0.3), 0.2, { gain: 0.06, from: rand(900, 1600), to: rand(2800, 4200), type: 'bandpass', q: 1.2, attack: 0.05 });
      for (let i = 0; i < 6; i++) {
        const hz = rand(140, 260);
        voice(t + 0.5 + rand(0, 0.5), rand(0.3, 0.6), { type: 'sawtooth', freq: [[0, hz], [0.5, hz * 1.12], [1, hz * 0.95]], gain: 0.012, attack: 0.08, release: 0.2, filter: { type: 'bandpass', from: 800, q: 1.4 } });
      }
    },
    /** Time to accuse: a dagger hilt rapped on the barrel, twice. */
    muGavel(t) {
      for (const at of [0, 0.3]) {
        noise(t + at, 0.06, { gain: 0.3, from: 900, to: 260, attack: 0.002 });
        tone(170, t + at, 0.2, { type: 'triangle', gain: 0.16, slideTo: 110 });
      }
    },
    /** A dagger coming down into the deck. */
    muThunk(t) {
      noise(t, 0.08, { gain: 0.26, from: 760, to: 200, attack: 0.002 });
      tone(165, t, 0.2, { type: 'triangle', gain: 0.15, slideTo: 105 });
      const ring = rand(1150, 1500);
      tone(ring, t + 0.01, 0.4, { type: 'triangle', gain: 0.035, slideTo: ring * 0.95 }); // the blade quivering
    },
    /** The chameleon's tongue: out, and back with a snap. */
    muTongue(t) {
      voice(t, 0.13, { type: 'sine', freq: [[0, 380], [1, 1500]], gain: 0.07, attack: 0.005, release: 0.02 });
      voice(t + 0.16, 0.1, { type: 'sine', freq: [[0, 1400], [1, 420]], gain: 0.06, attack: 0.005, release: 0.03 });
      noise(t + 0.27, 0.03, { gain: 0.14, from: 2600, type: 'bandpass', q: 2, attack: 0.001 });
    },
    /** The chameleon jumps: a springy boing. */
    muHop(t) {
      voice(t, 0.42, { type: 'triangle', freq: [[0, 210], [0.25, 560], [0.6, 320], [1, 640]], gain: 0.09, attack: 0.01, release: 0.12, vibrato: { rate: 26, depth: 26 } });
    },
    /** ...and lands on somebody's head. */
    muLand(t) {
      noise(t, 0.1, { gain: 0.16, from: 480, to: 190, attack: 0.003 });
      voice(t + 0.02, 0.18, { type: 'sine', freq: [[0, 820], [1, 520]], gain: 0.05, attack: 0.005, release: 0.08 });
    },
    /** Unmasked: the crew gasps, then a low chord of doom. */
    muGotcha(t) {
      noise(t, 0.5, { gain: 0.1, from: 1400, to: 3400, type: 'bandpass', q: 0.9, attack: 0.18 });
      for (const [hz, gain] of [[147, 0.12], [175, 0.08], [220, 0.07], [294, 0.05]]) tone(hz, t + 0.45, 1.5, { type: 'triangle', gain });
    },
    /** The wrong pirate: a sad slide downhill. */
    muWrong(t) {
      voice(t, 0.75, { type: 'sawtooth', freq: [[0, 311], [0.45, 233], [1, 156]], gain: 0.05, attack: 0.02, release: 0.25, filter: { type: 'lowpass', from: 1200, q: 1 } });
      voice(t + 0.02, 0.75, { type: 'triangle', freq: [[0, 156], [0.45, 117], [1, 78]], gain: 0.09, attack: 0.02, release: 0.25 });
    },
    /** The plot holds: irons clapped on, and the crew jeers. */
    muCaught(t) {
      for (let i = 0; i < 9; i++) tone(rand(1500, 2600), t + i * 0.055 + rand(0, 0.02), 0.09, { type: 'triangle', gain: 0.04 });
      noise(t + 0.5, 0.07, { gain: 0.24, from: 1400, to: 500, attack: 0.002 });
      for (let i = 0; i < 8; i++) {
        const hz = rand(200, 400);
        voice(t + 0.6 + rand(0, 0.4), rand(0.4, 0.8), { type: 'sawtooth', freq: [[0, hz], [0.4, hz * 1.3], [1, hz * 0.85]], gain: 0.016, attack: 0.05, release: 0.25, filter: { type: 'bandpass', from: 1100, q: 1.2 } });
      }
    },
    /** Got away: quick feet up the ladder, and a cheeky two-note whistle from the top. */
    muEscape(t) {
      for (let i = 0; i < 10; i++) noise(t + i * 0.06, 0.025, { gain: 0.07, from: 1800 + i * 260, type: 'bandpass', q: 3, attack: 0.001 });
      voice(t + 0.75, 0.16, { type: 'sine', freq: [[0, 1250], [1, 1320]], gain: 0.07, attack: 0.02, release: 0.05 });
      voice(t + 0.97, 0.3, { type: 'sine', freq: [[0, 1580], [0.6, 1660], [1, 1500]], gain: 0.07, attack: 0.02, release: 0.1 });
    },
  };
});

// A band that tiptoes: a plucked fiddle, a plucked bass, and somebody tapping a barrel very quietly.
const band = {
  lead(hz, at, seconds, out) {
    kit.tone(hz, at, Math.min(0.3, 0.14 + seconds * 0.4), { type: 'triangle', gain: 0.085, bus: out });
    kit.tone(hz * 2, at, 0.07, { type: 'sine', gain: 0.03, bus: out });
    kit.noise(at, 0.02, { gain: 0.012, from: 2600, type: 'bandpass', q: 1.5, attack: 0.002, bus: out }); // the finger on the string
  },
  bass(hz, at, seconds, out) {
    kit.tone(hz, at, 0.42, { type: 'triangle', gain: 0.17, bus: out });
    kit.tone(hz * 2, at, 0.12, { type: 'sine', gain: 0.04, bus: out });
  },
  drums(token, at, out) {
    if (token === 'k') kit.tone(92, at, 0.14, { gain: 0.09, slideTo: 60, bus: out });
    else if (token === 'h') kit.noise(at, 0.025, { gain: 0.016, from: 3200, type: 'bandpass', q: 2.5, attack: 0.002, bus: out });
  },
};

// An original creep in D minor: all tiptoes and looks over the shoulder.
SONGS.mutiny = {
  title: 'Below Decks',
  step: 0.17,
  bar: 8,
  band,
  lead: `D4 . F4 . A4 . F4 .    | D4 . F4 . Bb4 - A4 .
       | G4 . Bb4 . D5 . Bb4 .  | A4 - . . . . A3 .
       | D4 . F4 . A4 . F4 .    | D4 . F4 . C#5 - D5 .
       | E5 . D5 . C#5 . A4 .   | D4 - . . . . . .
       | F4 . A4 . C5 . A4 .    | F4 . A4 . D5 - C5 .
       | Bb4 . G4 . E4 . G4 .   | A4 - . . C#4 . E4 .
       | D4 . F4 . A4 . F4 .    | Bb4 . A4 . G4 . F4 .
       | E4 . G4 . F4 . E4 .    | D4 - - . . . . .`,
  bass: `D2 . . . A2 . . . | D2 . . . A2 . . .
       | G2 . . . D3 . . . | A2 . . . A2 . C#3 .
       | D2 . . . A2 . . . | D2 . . . A2 . . .
       | A2 . . . A2 . . . | D2 . . . A2 . D2 .
       | F2 . . . C3 . . . | F2 . . . C3 . . .
       | G2 . . . G2 . . . | A2 . . . A2 . . .
       | D2 . . . A2 . . . | G2 . . . G2 . . .
       | A2 . . . A2 . . . | D2 . . . . . . .`,
  drums: 'k . . . h . h .',
};
