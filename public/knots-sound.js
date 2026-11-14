// The sounds of Knot So Fast: a starting gun, the chatter of right answers, a
// bell for the last lap, and a reel that steps up a key for it. Like everything
// in sound.js these are synthesized on the spot; there are no audio files.
//
// Each recipe gets `t` (when to start, in seconds). To hear one, open the
// browser console on the big screen and run e.g.  sfx('knGun')
// All the names start with "kn" so they are easy to find in sfxList().
// The cannon, the hit and the splash are Bombard!'s own (bombard-sound.js).

import { addEffects, SONGS } from './sound.js';
import './bombard-sound.js';

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

let kit = null; // the building blocks from sound.js (tone, noise, voice), kept for the band further down

addEffects((blocks) => {
  kit = blocks;
  const { tone, noise, FX } = blocks;
  return {
    /** One beep of the countdown. */
    knBeep(t) {
      tone(660, t, 0.16, { type: 'square', gain: 0.07 });
      tone(1320, t, 0.12, { type: 'triangle', gain: 0.05 });
    },

    /** The starting gun, and a cheer of whistles. */
    knGun(t) {
      FX.bbCannon(t, 0.9);
      tone(990, t + 0.02, 0.5, { type: 'square', gain: 0.07 });
      tone(1320, t + 0.02, 0.5, { type: 'triangle', gain: 0.06 });
    },

    /** A right answer somewhere in the fleet: a rope snapping taut. Soft, because there are a lot of them. */
    knTick(t) {
      tone(rand(1500, 1900), t, 0.05, { type: 'triangle', gain: 0.05 });
      noise(t, 0.03, { gain: 0.035, from: 3200, type: 'bandpass', q: 3, attack: 0.001 });
    },

    /** A ship's gun: a short fuse, then the bang. */
    knCannon(t) {
      FX.bbFuse(t, 0.12);
      FX.bbCannon(t + 0.1, 0.75);
    },

    /** The ball going home. */
    knHit(t) {
      FX.bbHit(t);
    },

    /** The ball going in the sea. */
    knSplash(t) {
      FX.bbSplash(t);
    },

    /** Damp powder. */
    knFizz(t) {
      noise(t, 0.5, { gain: 0.09, from: 6000, to: 1500, type: 'highpass', attack: 0.01 });
      tone(240, t + 0.1, 0.35, { type: 'sawtooth', gain: 0.04, slideTo: 90 });
    },

    /** A new leader: a rush of wind and two notes going up. */
    knLead(t) {
      FX.whoosh(t);
      tone(784, t + 0.08, 0.14, { type: 'triangle', gain: 0.09 });
      tone(1175, t + 0.2, 0.3, { type: 'triangle', gain: 0.09 });
    },

    /** Somebody is on a roll. */
    knRoll(t) {
      [784, 988, 1175, 1568].forEach((hz, i) => tone(hz, t + i * 0.07, 0.16, { type: 'triangle', gain: 0.07 }));
    },

    /** The bell for the last lap, rung hard. */
    knBell(t) {
      for (let i = 0; i < 4; i++) FX.bell(t + i * 0.28);
    },

    /** First across the line: the gun, then a fanfare. */
    knFinish(t) {
      FX.bbCannon(t, 1);
      FX.fanfare(t + 0.35);
    },

    /** A doubloon landing on the table. */
    knClink(t) {
      const hz = rand(2600, 3600);
      tone(hz, t, 0.09, { type: 'triangle', gain: 0.06 });
      tone(hz * 1.48, t + 0.015, 0.12, { type: 'sine', gain: 0.04 });
      noise(t, 0.02, { gain: 0.04, from: 5000, type: 'highpass', attack: 0.001 });
    },

    /** A dagger going into the table: the thud, and the blade singing. */
    knThunk(t) {
      FX.knock(t, 1.5);
      tone(64, t, 0.22, { gain: 0.35, slideTo: 38 });
      tone(1870, t + 0.01, 0.7, { type: 'triangle', gain: 0.035 });
      tone(2790, t + 0.01, 0.5, { type: 'sine', gain: 0.02 });
    },

    /** A fist on the table. */
    knSlam(t) {
      tone(92, t, 0.16, { gain: 0.34, slideTo: 44 });
      noise(t, 0.07, { gain: 0.14, from: 420, attack: 0.002 });
    },

    /** The room winces. */
    knOoh(t) {
      for (let i = 0; i < 6; i++) {
        const base = rand(170, 290);
        blocks.voice(t + rand(0, 0.1), rand(0.6, 0.9), { type: 'sawtooth', freq: [[0, base * 1.25], [0.3, base * 1.3], [1, base * 0.78]], gain: 0.03, attack: 0.07, release: 0.3, filter: { type: 'lowpass', from: 900, to: 500, q: 2 } });
      }
    },

    /** Talk round the table: a few low voices, none of them saying anything you could catch. */
    knMurmur(t) {
      for (let i = 0; i < 9; i++) {
        const base = rand(95, 190);
        const when = t + rand(0, 1.6);
        blocks.voice(when, rand(0.18, 0.4), { type: 'sawtooth', freq: [[0, base], [0.5, base * rand(0.9, 1.25)], [1, base * rand(0.85, 1.05)]], gain: 0.014, attack: 0.04, release: 0.1, filter: { type: 'bandpass', from: rand(500, 1100), to: rand(400, 900), q: 2.5 } });
      }
    },

    /** Another ship home. */
    knHome(t) {
      FX.bell(t);
      FX.coins(t + 0.2);
    },
  };
});

// ---------------------------------------------------------------------------
// Music: a reel, played by a tavern band (the same idea as liars-sound.js)
// ---------------------------------------------------------------------------

const band = {
  /** The fiddle. */
  lead(hz, at, seconds, out) {
    kit.voice(at, seconds + 0.03, { type: 'sawtooth', freq: hz, gain: 0.048, attack: 0.02, release: 0.05, vibrato: { rate: 6, depth: hz * 0.005 }, filter: { type: 'lowpass', from: 3200, to: 2200, q: 1.2 }, bus: out });
    kit.noise(at, 0.04, { gain: 0.011, from: 3200, type: 'bandpass', q: 2, attack: 0.006, bus: out });
  },

  /** A plucked bass. */
  bass(hz, at, seconds, out) {
    kit.tone(hz, at, Math.max(0.3, seconds * 1.2), { type: 'triangle', gain: 0.2, bus: out });
    kit.tone(hz * 2, at, 0.12, { type: 'sawtooth', gain: 0.025, bus: out });
  },

  /** k = the bodhrán, h = a tap on its rim, s = a tambourine. */
  drums(token, at, out) {
    if (token === 'k') {
      kit.tone(108, at, 0.18, { gain: 0.26, slideTo: 58, bus: out });
      kit.noise(at, 0.05, { gain: 0.05, from: 500, attack: 0.002, bus: out });
    } else if (token === 'h') {
      kit.tone(195, at, 0.06, { type: 'triangle', gain: 0.06, slideTo: 120, bus: out });
    } else if (token === 's') {
      kit.noise(at, 0.1, { gain: 0.05, from: 7000, type: 'highpass', attack: 0.004, bus: out });
      kit.tone(195, at, 0.06, { type: 'triangle', gain: 0.05, slideTo: 120, bus: out });
    }
  },
};

// An original reel in D (eight steps to the bar).
SONGS.knots = {
  title: 'The Following Wind',
  step: 0.122,
  bar: 8,
  band,
  lead: `D5 E5 F#5 A5 B5 A5 F#5 A5 | G5 B5 A5 F#5 E5 F#5 D5 E5 | D5 E5 F#5 A5 B5 A5 F#5 D5 | E5 F#5 G5 E5 C#5 A4 B4 C#5
       | D5 E5 F#5 A5 B5 A5 F#5 A5 | G5 B5 A5 F#5 E5 F#5 D5 F#5 | A5 F#5 D5 F#5 G5 E5 C#5 E5 | D5 - A4 - D5 - - .
       | F#5 A5 D6 A5 F#5 A5 D6 A5 | G5 B5 D6 B5 G5 B5 D6 B5 | F#5 A5 D6 A5 F#5 A5 D6 A5 | E5 A5 C#6 A5 E5 A5 C#6 A5
       | F#5 A5 D6 A5 F#5 A5 D6 A5 | G5 B5 D6 B5 A5 G5 F#5 E5 | D5 F#5 A5 F#5 G5 E5 C#5 E5 | D5 - A4 - D5 - - .`,
  bass: `D3 - - - A2 - - - | G2 - - - D3 - - - | D3 - - - A2 - - - | A2 - - - E3 - - -
       | D3 - - - A2 - - - | G2 - - - D3 - - - | D3 - - - A2 - - - | D3 - A2 - D3 - - .
       | D3 - - - A2 - - - | G2 - - - D3 - - - | D3 - - - A2 - - - | A2 - - - E3 - - -
       | D3 - - - A2 - - - | G2 - - - A2 - - - | D3 - - - A2 - - - | D3 - A2 - D3 - - .`,
  drums: 'k h s h k h s h',
};

// For the last lap: the same tune a tone higher and a notch quicker.
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const up = (track, semitones) =>
  track.replace(/([A-G]#?)(\d)/g, (_, name, octave) => {
    const n = NAMES.indexOf(name) + semitones + Number(octave) * 12;
    return `${NAMES[n % 12]}${Math.floor(n / 12)}`;
  });
SONGS.knotsLast = { ...SONGS.knots, title: 'The Following Wind (last lap)', step: 0.108, lead: up(SONGS.knots.lead, 2), bass: up(SONGS.knots.bass, 2) };
