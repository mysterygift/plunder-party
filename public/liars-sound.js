// The sounds of LiAARRRRGH's Dice: dice in a leather cup, a fist on the
// barrel, and the cups coming up. Like everything in sound.js these are
// synthesized on the spot; there are no audio files.
//
// Each recipe gets `t` (when to start, in seconds). To hear one, open the
// browser console on the big screen and run e.g.  sfx('ldShake')
// All the names start with "ld" so they are easy to find in sfxList().

import { addEffects, SONGS } from './sound.js';

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

addEffects(({ tone, noise, voice, FX }) => ({
  /** Dice rattling round a cup, then the cup slammed down on the barrel. */
  ldShake(t) {
    for (let when = 0; when < 1.25; when += rand(0.03, 0.075)) {
      noise(t + when, 0.03, { gain: rand(0.05, 0.14), from: rand(1800, 4400), type: 'bandpass', q: 5, attack: 0.001 });
      if (Math.random() < 0.35) tone(rand(900, 1500), t + when, 0.03, { type: 'triangle', gain: 0.04 });
    }
    FX.knock(t + 1.4, 1.4);
    noise(t + 1.4, 0.14, { gain: 0.2, from: 700, to: 200, attack: 0.002 });
  },

  /** A bid: knuckles rapped on the barrel. */
  ldBid(t) {
    FX.knock(t, 0.8);
    FX.knock(t + 0.11, 0.55);
    tone(1320, t + 0.13, 0.2, { type: 'triangle', gain: 0.06 });
  },

  /** "LiAARRRRGH!": a fist on the table, a nasty chord, steel drawn, and a drum roll while everyone holds their breath. */
  ldLiar(t) {
    FX.knock(t, 1.6);
    noise(t, 0.2, { gain: 0.25, from: 900, to: 150, attack: 0.002 });
    for (const hz of [147, 208, 277]) {
      voice(t + 0.04, 1.1, { type: 'sawtooth', freq: [[0, hz], [1, hz * 0.97]], gain: 0.07, attack: 0.02, release: 0.5, filter: { type: 'lowpass', from: 2600, to: 700, q: 2 } });
    }
    FX.clash(t + 0.4);
    FX.drumroll(t + 1.1, 2.4);
  },

  /** A cup coming up with nothing under it worth having. */
  ldLift(t) {
    noise(t, 0.18, { gain: 0.09, from: 600, to: 2600, type: 'bandpass', q: 1.2, attack: 0.06 });
    tone(280, t + 0.02, 0.12, { gain: 0.1, slideTo: 520 });
  },

  /** A cup coming up on dice that count. */
  ldFound(t) {
    FX.ldLift(t);
    tone(1568, t + 0.14, 0.5, { type: 'triangle', gain: 0.11 });
    tone(2093, t + 0.22, 0.55, { type: 'triangle', gain: 0.08 });
  },

  /** Caught lying: the tune falls down the stairs, and a gun goes off. */
  ldLie(t) {
    [392, 370, 349, 247].forEach((hz, i) => tone(hz, t + i * 0.17, i === 3 ? 0.7 : 0.26, { type: 'sawtooth', gain: 0.08 }));
    FX.cannon(t + 0.72, 0.8);
  },

  /** The bid was good after all. */
  ldHonest(t) {
    FX.reveal(t);
    FX.coins(t + 0.32);
  },

  /** Out of dice: over the side. */
  ldSunk(t) {
    tone(196, t, 0.9, { type: 'triangle', gain: 0.16, slideTo: 62 });
    FX.splash(t + 0.5);
    FX.bubbles(t + 1.1);
  },
}));

// An original reel in A minor that keeps looking over its shoulder, for bidding.
SONGS.liars = {
  title: 'The Bluffer’s Reel',
  step: 0.17,
  bar: 8,
  lead: `A4 - C5 - E5 - C5 -   | D5 - B4 - G4 - B4 -
       | A4 - C5 - E5 - A5 -   | G5 - E5 - E5 - - .
       | A4 - C5 - E5 - C5 -   | D5 - F5 - E5 - D5 -
       | C5 - B4 - A4 - G#4 -  | A4 - - - A4 - - .
       | C5 - C5 E5 G5 - E5 -  | D5 - D5 F5 A5 - F5 -
       | E5 - E5 G#5 B5 - G#5 - | A5 - G5 - E5 - - .
       | A5 - E5 - C5 - A4 -   | F5 - D5 - B4 - G4 -
       | E5 - D5 C5 B4 - G#4 - | A4 - - - - - . .`,
  bass: `A2 - . E3 A2 - . E3 | G2 - . D3 G2 - . D3
       | A2 - . E3 A2 - . E3 | E2 - . B2 E2 - . B2
       | A2 - . E3 A2 - . E3 | D2 - . A2 D2 - . A2
       | E2 - . B2 E2 - . B2 | A2 - . E3 A2 - . .
       | C3 - . G2 C3 - . G2 | D3 - . A2 D3 - . A2
       | E3 - . B2 E3 - . B2 | A2 - . E3 A2 - . E3
       | A2 - . E3 A2 - . E3 | D2 - . A2 G2 - . D3
       | E2 - . B2 E2 - . B2 | A2 - . . A2 - . .`,
  drums: 'k . h . s . h h',
};
