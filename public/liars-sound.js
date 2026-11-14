// The sounds of LiAARRRRGH's Dice: dice in a leather cup, a fist on the
// barrel, and the cups coming up. Like everything in sound.js these are
// synthesized on the spot; there are no audio files.
//
// Each recipe gets `t` (when to start, in seconds). To hear one, open the
// browser console on the big screen and run e.g.  sfx('ldShake')
// All the names start with "ld" so they are easy to find in sfxList().

import { addEffects, SONGS } from './sound.js';

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

let kit = null; // the building blocks from sound.js (tone, noise, voice), kept for the band further down

addEffects((blocks) => {
  kit = blocks;
  const { tone, noise, voice, FX } = blocks;
  return {
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
  };
});

// ---------------------------------------------------------------------------
// Music: a tavern band, not the usual bleeps
// ---------------------------------------------------------------------------
//
// The tune is written in the same text format as the songs in sound.js, but
// this song brings its own players (the `band` below): a fiddle on the melody,
// a squeezebox vamping underneath, a plucked bass, and a bodhrán and tambourine
// keeping time. Each player reads the track with the same name.

/** The band. Each player is handed (pitch in Hz, when, how long, where to send the sound). */
const band = {
  /** The fiddle: a bright, slightly wobbly bowed string, with a little scratch as the bow bites. */
  lead(hz, at, seconds, out) {
    kit.voice(at, seconds + 0.04, { type: 'sawtooth', freq: hz, gain: 0.05, attack: 0.035, release: 0.07, vibrato: { rate: 5.7, depth: hz * 0.006 }, filter: { type: 'lowpass', from: 3000, to: 2100, q: 1.2 }, bus: out });
    kit.voice(at, seconds + 0.04, { type: 'square', freq: hz * 1.003, gain: 0.012, attack: 0.05, release: 0.07, vibrato: { rate: 5.7, depth: hz * 0.006 }, filter: { type: 'lowpass', from: 1800, q: 0.8 }, bus: out });
    kit.noise(at, 0.05, { gain: 0.012, from: 3200, type: 'bandpass', q: 2, attack: 0.008, bus: out });
  },

  /** The squeezebox: two reeds a hair out of tune with each other, playing the note and the fifth above it. */
  box(hz, at, seconds, out) {
    for (const pitch of [hz, hz * 1.5]) {
      for (const detune of [0.996, 1.004]) {
        kit.voice(at, seconds * 0.8, { type: 'square', freq: pitch * detune, gain: 0.011, attack: 0.03, release: 0.06, filter: { type: 'lowpass', from: 1500, q: 0.7 }, bus: out });
      }
    }
  },

  /** The bass: one fat plucked string. */
  bass(hz, at, seconds, out) {
    kit.tone(hz, at, Math.max(0.4, seconds * 1.3), { type: 'triangle', gain: 0.2, bus: out });
    kit.tone(hz * 2, at, 0.16, { type: 'sawtooth', gain: 0.025, bus: out });
  },

  /** k = the bodhrán, struck in the middle; h = a tap near its rim; s = a tambourine. */
  drums(token, at, out) {
    if (token === 'k') {
      kit.tone(105, at, 0.2, { gain: 0.26, slideTo: 58, bus: out });
      kit.noise(at, 0.05, { gain: 0.05, from: 500, attack: 0.002, bus: out });
    } else if (token === 'h') {
      kit.tone(190, at, 0.07, { type: 'triangle', gain: 0.07, slideTo: 120, bus: out });
      kit.noise(at, 0.03, { gain: 0.025, from: 1400, type: 'bandpass', q: 1.5, attack: 0.002, bus: out });
    } else if (token === 's') {
      kit.noise(at, 0.12, { gain: 0.05, from: 7000, type: 'highpass', attack: 0.004, bus: out });
      kit.tone(190, at, 0.07, { type: 'triangle', gain: 0.05, slideTo: 120, bus: out });
    }
  },
};

// An original jig in A minor (six steps to the bar: ONE two three FOUR five six).
SONGS.liars = {
  title: 'The Bluffer’s Jig',
  step: 0.168,
  bar: 6,
  band,
  lead: `A4 - B4 C5 - A4 | B4 - G4 E4 - G4 | A4 - B4 C5 - E5 | D5 - B4 G4 - B4
       | A4 - B4 C5 - A4 | B4 - G4 E4 - G4 | A4 B4 C5 D5 E5 G5 | E5 D5 B4 A4 - .
       | A5 - G5 E5 - C5 | D5 - E5 G5 - E5 | A5 - G5 E5 - C5 | D5 E5 D5 B4 - G4
       | C5 - E5 G5 - E5 | D5 - B4 G4 - B4 | A4 B4 C5 D5 B4 G4 | A4 - - A4 - .`,
  box: `. A3 A3 . A3 A3 | . G3 G3 . G3 G3 | . A3 A3 . A3 A3 | . G3 G3 . G3 G3
      | . A3 A3 . A3 A3 | . G3 G3 . G3 G3 | . A3 A3 . A3 A3 | . E3 E3 . A3 A3
      | . A3 A3 . A3 A3 | . G3 G3 . G3 G3 | . A3 A3 . A3 A3 | . G3 G3 . G3 G3
      | . C4 C4 . C4 C4 | . G3 G3 . G3 G3 | . A3 A3 . G3 G3 | . A3 A3 . A3 .`,
  bass: `A2 - . E3 - . | G2 - . D3 - . | A2 - . E3 - . | G2 - . D3 - .
       | A2 - . E3 - . | G2 - . D3 - . | A2 - . E3 - . | E2 - . A2 - .
       | A2 - . E3 - . | G2 - . D3 - . | A2 - . E3 - . | G2 - . D3 - .
       | C3 - . G2 - . | G2 - . D3 - . | A2 - . G2 - . | A2 - . A2 - .`,
  drums: 'k h h s h h k h h s h k',
};
