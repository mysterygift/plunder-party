// The sounds of To the Brig with Ye: the ship's bell, flags running up the
// halyard, timber meeting rock, and the brig door. Like everything in sound.js
// these are synthesized on the spot; there are no audio files.
//
// Each recipe gets `t` (when to start, in seconds). To hear one, open the
// browser console on the big screen and run e.g.  sfx('tbReef')
// All the names start with "tb" so they are easy to find in sfxList().

import { addEffects, SONGS } from './sound.js';

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

addEffects(({ tone, noise, voice, FX }) => ({
  /** The sides are dealt: a low drum, and something nasty in the cellos. */
  tbRoles(t) {
    for (const [at, loud] of [[0, 1], [0.5, 0.7], [0.75, 0.7], [1.25, 1.2]]) {
      tone(92, t + at, 0.5, { gain: 0.3 * loud, slideTo: 50 });
      noise(t + at, 0.07, { gain: 0.07 * loud, from: 420, attack: 0.002 });
    }
    for (const hz of [82, 98, 116.5]) {
      voice(t + 1.25, 2.2, { type: 'sawtooth', freq: [[0, hz], [1, hz * 0.985]], gain: 0.05, attack: 0.3, release: 1.2, filter: { type: 'lowpass', from: 1300, to: 380, q: 1.5 } });
    }
  },

  /** A new leg: two strokes on the ship's bell. */
  tbBell(t) {
    for (const at of [0, 0.42]) {
      tone(1175, t + at, 1.5, { gain: 0.14 });
      tone(1760, t + at, 1.0, { gain: 0.07 });
      tone(2480, t + at, 0.5, { gain: 0.04 });
    }
  },

  /** Up the rigging: hands and feet on the ratlines, and a spyglass pulled open at the top. */
  tbClimb(t) {
    for (let i = 0; i < 7; i++) {
      FX.knock(t + i * 0.17, 0.3 + i * 0.03);
      voice(t + i * 0.17, 0.1, { type: 'sawtooth', freq: [[0, 190 + i * 22], [1, 235 + i * 22]], gain: 0.025, attack: 0.02, release: 0.04, filter: { from: 900, q: 6 } });
    }
    FX.spyglass(t + 1.3);
  },

  /** One flag running up the halyard and snapping open in the wind. */
  tbHoist(t, hz = 660) {
    voice(t, 0.34, { type: 'triangle', freq: [[0, hz * 0.5], [1, hz]], gain: 0.07, attack: 0.03, release: 0.05 });
    noise(t, 0.34, { gain: 0.05, from: 900, to: 3200, type: 'bandpass', q: 2, attack: 0.05 });
    noise(t + 0.34, 0.12, { gain: 0.16, from: 2400, to: 700, attack: 0.002 });
  },

  /** Two flags that agree: up, up, and a bright fifth. */
  tbFlags(t) {
    FX.tbHoist(t, 660);
    FX.tbHoist(t + 0.5, 660);
    tone(784, t + 1.0, 0.7, { type: 'triangle', gain: 0.1 });
    tone(1175, t + 1.0, 0.7, { type: 'triangle', gain: 0.07 });
  },

  /** Two flags that don't: up, up, and a chord with a knife in it. */
  tbSplit(t) {
    FX.tbHoist(t, 660);
    FX.tbHoist(t + 0.5, 466);
    for (const hz of [147, 208, 311]) {
      voice(t + 1.0, 1.5, { type: 'sawtooth', freq: [[0, hz], [1, hz * 0.97]], gain: 0.07, attack: 0.02, release: 0.7, filter: { type: 'lowpass', from: 2600, to: 600, q: 2 } });
    }
    FX.knock(t + 1.0, 1.4);
    FX.drumroll(t + 1.5, 1.6);
  },

  /** The wheel goes over: the rudder groans, the sails fill, and a drum roll for whatever is under the water. */
  tbTurn(t) {
    FX.knock(t, 0.9);
    voice(t + 0.05, 1.1, { type: 'sawtooth', freq: [[0, 70], [0.6, 118], [1, 96]], gain: 0.12, attack: 0.15, release: 0.3, filter: { from: 600, to: 1300, q: 8 } });
    noise(t + 0.3, 1.6, { gain: 0.16, from: 500, to: 1900, type: 'bandpass', q: 0.8, attack: 0.5 });
    FX.drumroll(t + 1.2, 2.3);
  },

  /** Timber on rock: a crunch you feel in your teeth, planks letting go, and the sea coming in. */
  tbReef(t) {
    noise(t, 1.3, { gain: 0.6, from: 1400, to: 70, attack: 0.003 });
    tone(86, t, 1.1, { gain: 0.5, slideTo: 30 });
    for (let i = 0; i < 9; i++) {
      const at = t + 0.08 + i * rand(0.05, 0.11);
      noise(at, 0.07, { gain: rand(0.12, 0.26), from: rand(900, 2600), type: 'bandpass', q: 3, attack: 0.001 });
      tone(rand(160, 420), at, 0.08, { type: 'square', gain: 0.05, slideTo: 90 });
    }
    voice(t + 0.5, 1.4, { type: 'sawtooth', freq: [[0, 120], [0.5, 64], [1, 82]], gain: 0.12, attack: 0.1, release: 0.5, filter: { from: 500, to: 1100, q: 9 } });
    FX.splash(t + 0.9);
    [330, 311, 277, 196].forEach((hz, i) => tone(hz, t + 1.5 + i * 0.2, i === 3 ? 0.9 : 0.3, { type: 'sawtooth', gain: 0.07 }));
  },

  /** Clear water: the bow wave hissing past, a rising tune, gulls. */
  tbClear(t) {
    noise(t, 1.8, { gain: 0.14, from: 700, to: 2600, type: 'bandpass', q: 0.7, attack: 0.5 });
    [392, 494, 587, 784, 988].forEach((hz, i) => tone(hz, t + 0.5 + i * 0.09, 0.6, { type: 'triangle', gain: 0.1 }));
    FX.gulls(t + 1.3);
  },

  /** To the brig: dragged down the ladder, the iron door, the key. */
  tbBrig(t) {
    for (let i = 0; i < 4; i++) FX.knock(t + i * 0.14, 0.7);
    // the door: a deep iron clang with a long ring on it
    const slam = t + 0.75;
    noise(slam, 0.3, { gain: 0.4, from: 2200, to: 180, attack: 0.002 });
    tone(73, slam, 0.9, { gain: 0.4, slideTo: 46 });
    for (const [hz, len] of [[392, 1.6], [587, 1.3], [831, 1.0], [1245, 0.7], [1870, 0.4]]) tone(hz * rand(0.985, 1.015), slam, len, { gain: 0.06 });
    // the key, and the chain
    for (let i = 0; i < 3; i++) tone(2600 + i * 320, slam + 0.65 + i * 0.09, 0.05, { type: 'square', gain: 0.04 });
    for (let i = 0; i < 9; i++) {
      tone(rand(2200, 3300), slam + 1.0 + i * 0.07, 0.03, { type: 'square', gain: 0.03 });
      noise(slam + 1.0 + i * 0.07, 0.02, { gain: 0.04, from: 4000, type: 'highpass', attack: 0.001 });
    }
  },

  /** Nobody goes below: a shrug on the squeezebox. */
  tbShrug(t) {
    tone(330, t, 0.25, { type: 'triangle', gain: 0.1 });
    tone(262, t + 0.22, 0.5, { type: 'triangle', gain: 0.1 });
    FX.knock(t + 0.22, 0.5);
  },

  /** Land ho! */
  tbLand(t) {
    FX.tbBell(t);
    FX.fanfare(t + 0.7);
    FX.gulls(t + 1.9);
  },

  /** She's going down: the last groan of the hull, and a long way to the bottom. */
  tbSunk(t) {
    voice(t, 2.4, { type: 'sawtooth', freq: [[0, 110], [0.4, 62], [1, 38]], gain: 0.16, attack: 0.2, release: 0.8, filter: { from: 420, to: 900, q: 8 } });
    [294, 277, 233, 196, 147].forEach((hz, i) => tone(hz, t + 0.3 + i * 0.3, i === 4 ? 1.6 : 0.4, { type: 'sawtooth', gain: 0.07 }));
    FX.splash(t + 1.6);
    FX.bubbles(t + 2.2);
    FX.bubbles(t + 3.0);
  },
}));

// ---------------------------------------------------------------------------
// Music to argue to
// ---------------------------------------------------------------------------
//
// An original slow air in E minor: eight steps to the bar, kept low and sparse
// because the room is supposed to be shouting over it.
SONGS.brig = {
  title: 'Below Decks',
  step: 0.23,
  bar: 8,
  leadGain: 0.028,
  lead: `E4 - - G4 - F#4 E4 - | B3 - - E4 - - D4 - | E4 - - G4 - A4 B4 - | A4 - G4 - F#4 - - .
       | E4 - - G4 - F#4 E4 - | B3 - - D4 - - E4 - | G4 - F#4 - E4 - D4 - | E4 - - - - - . .
       | B4 - - A4 - G4 A4 - | G4 - - F#4 - E4 F#4 - | E4 - - D4 - B3 D4 - | E4 - - - F#4 - - .
       | G4 - - A4 - B4 - - | A4 - G4 - F#4 - D4 - | E4 - - D4 - B3 - - | E4 - - - - - . .`,
  bass: `E2 - . . B2 - . . | E2 - . . B2 - . . | E2 - . . B2 - . . | D2 - . . A2 - . .
       | E2 - . . B2 - . . | G2 - . . D2 - . . | C2 - . . D2 - . . | E2 - . . E2 - . .`,
  drums: 'k . . . h . . h',
};
