// The sounds of Message in a Bottle: a sunny lagoon (see the ambience in
// bottle-host.js), corks, glass and paper. Synthesized, like everything in
// sound.js. Try them from the console: sfx('mbWhale')

import { addEffects, SONGS } from './sound.js';

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
let kit = null;

addEffects((blocks) => {
  kit = blocks;
  const { tone, noise, voice, FX } = blocks;

  /** Glass knocking on glass: a bright, short ring. */
  const clink = (t, loud = 1) => {
    const hz = rand(2600, 3400);
    tone(hz, t, 0.5, { type: 'sine', gain: 0.05 * loud });
    tone(hz * 2.76, t, 0.2, { type: 'sine', gain: 0.02 * loud });
    noise(t, 0.015, { gain: 0.04 * loud, from: 7000, type: 'highpass', attack: 0.001 });
  };

  return {
    // ----- the lagoon -----

    /** Little waves lapping at a beach. */
    mbLap(t) {
      for (let i = 0; i < 3; i++) noise(t + i * rand(0.4, 0.8), rand(0.4, 0.8), { gain: rand(0.03, 0.06), from: rand(500, 900), to: rand(1500, 2400), type: 'bandpass', q: 1.2, attack: 0.12 });
    },
    /** Two bottles bumping together somewhere out on the water. */
    mbClink(t) {
      clink(t, 0.8);
      if (Math.random() < 0.6) clink(t + rand(0.15, 0.4), 0.5);
    },
    /** A warm breeze. */
    mbBreeze(t) {
      noise(t, 4, { gain: 0.04, from: 400, to: 900, type: 'bandpass', q: 0.6, attack: 1.6 });
    },
    /** A whale singing, a very long way off. */
    mbWhale(t) {
      voice(t, 2.4, { type: 'sine', freq: [[0, 180], [0.4, 260], [0.75, 220], [1, 140]], gain: 0.05, attack: 0.5, release: 0.8, vibrato: { rate: 3, depth: 6 } });
      voice(t + 2.6, 1.6, { type: 'sine', freq: [[0, 300], [0.5, 380], [1, 240]], gain: 0.035, attack: 0.3, release: 0.6, vibrato: { rate: 4, depth: 8 } });
    },

    // ----- bottles -----

    /** A cork pushed home, and the bottle set down on the water. */
    mbCork(t) {
      voice(t, 0.07, { type: 'sine', freq: [[0, 700], [1, 260]], gain: 0.12, attack: 0.003, release: 0.03 });
      noise(t, 0.04, { gain: 0.08, from: 1800, type: 'bandpass', q: 2, attack: 0.002 });
      clink(t + 0.2, 0.6);
      FX.splash(t + 0.35);
    },
    /** The bottles set off across the lagoon. */
    mbDrift(t) {
      noise(t, 2.6, { gain: 0.06, from: 300, to: 1200, type: 'bandpass', q: 0.8, attack: 0.8 });
      for (let i = 0; i < 4; i++) clink(t + 0.4 + i * rand(0.4, 0.7), 0.5);
    },
    /** A bottle washes up on the sand. */
    mbWashUp(t) {
      noise(t, 1.6, { gain: 0.08, from: 260, to: 1100, attack: 0.6 });
      noise(t + 1.0, 1.8, { gain: 0.06, from: 3500, to: 1000, type: 'highpass', attack: 0.1 });
      clink(t + 1.3);
      voice(t + 1.9, 0.08, { type: 'sine', freq: [[0, 300], [1, 900]], gain: 0.1, attack: 0.003, release: 0.03 }); // the cork comes out
    },
    /** A scroll unrolled. */
    mbUnroll(t) {
      noise(t, 0.6, { gain: 0.08, from: 2500, to: 5000, type: 'bandpass', q: 0.9, attack: 0.05 });
      FX.paper(t + 0.2);
    },
  };
});

function reed(hz, at, seconds, out) {
  // A soft swell in and out: a square wave that starts or stops abruptly clicks.
  for (const detune of [0.996, 1.004]) kit.voice(at, Math.max(0.12, seconds * 0.9), { type: 'square', freq: hz * detune, gain: 0.01, attack: 0.04, release: 0.07, filter: { type: 'lowpass', from: 1200, q: 0.5 }, bus: out });
}

// A squeezebox and a fiddle on the beach: the bass buttons and the chords underneath, the fiddle on the tune.
const band = {
  /** The fiddle: a bowed, slightly wavering line. */
  lead(hz, at, seconds, out) {
    kit.voice(at, seconds, { type: 'sawtooth', freq: hz, gain: 0.03, attack: 0.04, release: Math.min(0.15, seconds * 0.4), vibrato: { rate: 6, depth: hz * 0.007 }, filter: { type: 'bandpass', from: 1900, q: 0.9 }, bus: out });
  },
  /** The squeezebox's chords: each note on two reeds a hair out of tune with each other. */
  chord1: reed,
  chord2: reed,
  chord3: reed,
  /** The squeezebox's bass buttons: the "oom". */
  bass(hz, at, seconds, out) {
    kit.voice(at, Math.max(0.25, seconds * 0.9), { type: 'square', freq: hz, gain: 0.05, attack: 0.03, release: 0.1, filter: { type: 'lowpass', from: 500, q: 0.5 }, bus: out });
  },
  drums(token, at, out) {
    if (token === 'k') kit.tone(85, at, 0.18, { gain: 0.13, slideTo: 55, bus: out });
    else if (token === 'h') kit.noise(at, 0.09, { gain: 0.012, from: 2200, type: 'lowpass', attack: 0.025, bus: out }); // a brush on the drum skin, not a sharp tick
  },
};

// The party's own tune, converted from a MIDI file with tools/midi-to-song.js (run it again on another file to swap it).
SONGS.bottle = {
  title: 'Cool Tune',
  step: 0.167,
  bar: 6,
  band,
  drums: 'k . h . h .',
  lead: `. . . . . . | . E4 - - - - | . . . . . . | . E4 - - - -
       | . . . . . . | . E4 - - - - | . . . . . . | . E4 - - - -
       | D4 F4 D5 - - - | D4 F4 D5 - - - | E5 - - F5 E5 F5 | E5 C5 A4 - - -
       | A4 - D4 - F4 G4 | A4 - - - - - | A4 - D4 - F4 G4 | E4 - - - - -
       | D4 F4 D5 - - - | D4 F4 D5 - - - | E5 - - F5 E5 F5 | E5 C5 A4 - - -
       | A4 - D4 - F4 G4 | A4 - - - A4 - | D4 - . . . . | . E4 - - - -
       | . . . . . . | . E4 - - - - | . . . . . . | . E4 - - - -
       | . . . . . . | . E4 - - - - | D5 F5 D6 - - - | D5 F5 D6 - - -
       | E6 - - F6 E6 F6 | E6 C6 A5 - - - | A5 - D5 - F5 G5 | A5 - - - - -
       | A5 - D5 - F5 . | . . . . . . | D5 F5 D6 - - - | D5 F5 D6 - - -
       | E6 - - F6 E6 F6 | E6 C6 A5 - - - | A5 - D5 - F5 G5 | A5 - A5 - A5 -
       | D5 - . . . . | . E4 - - - - | . . . . . . | . E4 - - - -
       | D5 - . . . . | . E4 - - - - | . . . . . . | . E4 - - - -
       | D4 F4 D5 - - - | D4 F4 D5 - - - | E5 - - F5 E5 F5 | E5 C5 A4 - - -
       | A4 - D4 - F4 G4 | A4 - - - - - | A4 - D4 - F4 G4 | E4 - - - - -
       | D4 F4 D5 - - - | D4 F4 D5 - - - | E5 - - F5 E5 F5 | E5 C5 A4 - - -
       | A4 - D4 - F4 G4 | A4 - - - A4 - | D4 - . . . . | . E4 - - - -
       | . . . . . . | . E4 - - - - | . . . . . . | . E4 - - - -
       | . . . . . . | . E4 - - - - | D5 F5 D6 - - - | D5 F5 D6 - - -
       | E6 - - F6 E6 F6 | E6 C6 A5 - - - | A5 - D5 - F5 G5 | A5 - - - - -
       | A5 - D5 - F5 . | . . . . . . | D5 F5 D6 - - - | D5 F5 D6 - - -
       | E6 - - F6 E6 F6 | E6 C6 A5 - - - | A5 - D5 - F5 G5 | A5 - A5 - A5 -
       | D5 - . . . . | . E4 - - - - | . . . . . . | . E4 - - - -
       | D5 - . . . . | . E4 - - - - | . . . . . . | . E4 - - - -`,
  bass: `D2 - - - - - | E2 - - - - - | F2 - - - - - | E2 - - - - -
       | D2 - - - - - | E2 - - - - - | F2 - - - - - | E2 - - - - -
       | D2 - . . . . | E2 . . . . . | F2 - . . . . | E2 . . . . .
       | A#1 - A#2 - A#2 - | F1 - F2 - - - | A#1 - A#2 - A#2 - | A1 - A2 - - -
       | D2 - . . . . | E2 . . . . . | F2 - . . . . | E2 . . . . .
       | A#1 - A#2 - A#2 - | A1 - A2 - A2 - | D2 - - - - - | E2 - - - - -
       | F2 - - - - - | E2 - - - - - | D2 - - - - - | E2 - - - - -
       | F2 - - - - - | E2 - - - - - | D2 - . . . . | E2 . . . . .
       | F2 - . . . . | E2 . . . . . | A#1 - . . . . | F1 - . . . .
       | A#1 - . . . . | A1 - . . . . | D2 - . . . . | E2 . . . . .
       | F2 - . . . . | E2 . . . . . | A#1 - . . . . | A1 - . . . .
       | D2 - - - - - | E2 - - - - - | F2 - - - - - | E2 - - - - -
       | D2 - - - - - | E2 - - - - - | F2 - - - - - | E2 - - - - -
       | D2 - . . . . | E2 . . . . . | F2 - . . . . | E2 . . . . .
       | A#1 - A#2 - A#2 - | F1 - F2 - - - | A#1 - A#2 - A#2 - | A1 - A2 - - -
       | D2 - . . . . | E2 . . . . . | F2 - . . . . | E2 . . . . .
       | A#1 - A#2 - A#2 - | A1 - A2 - A2 - | D2 - - - - - | E2 - - - - -
       | F2 - - - - - | E2 - - - - - | D2 - - - - - | E2 - - - - -
       | F2 - - - - - | E2 - - - - - | D2 - . . . . | E2 . . . . .
       | F2 - . . . . | E2 . . . . . | A#1 - . . . . | F1 - . . . .
       | A#1 - . . . . | A1 - . . . . | D2 - . . . . | E2 . . . . .
       | F2 - . . . . | E2 . . . . . | A#1 - . . . . | A1 - . . . .
       | D2 - - - - - | E2 - - - - - | F2 - - - - - | E2 - - - - -
       | D2 - - - - - | E2 - - - - - | F2 - - - - - | E2 - - - - -`,
  chord1: `D3 - D4 - D4 - | E3 - G4 - - - | F3 - F4 - F4 - | E3 - G4 - - -
       | D3 - D4 - D4 - | E3 - G4 - - - | F3 - F4 - F4 - | E3 - G4 - - -
       | D3 - D3 - D3 - | . E3 E3 - - - | F3 - F3 - F3 - | . E3 E3 - - -
       | A#2 - D3 - D3 - | F2 - C3 - - - | A#2 - D3 - D3 - | A2 - C#3 - - -
       | D3 - D3 - D3 - | . E3 E3 - - - | F3 - F3 - F3 - | . E3 E3 - - -
       | A#2 - D3 - D3 - | A2 - C#3 - C#3 - | D3 - D4 - D4 - | E3 - G4 - - -
       | F3 - F4 - F4 - | E3 - G4 - - - | D3 - D4 - D4 - | E3 - G4 - - -
       | F3 - F4 - F4 - | E3 - G4 - - - | D3 - D4 - D4 - | . E3 E4 - - -
       | F3 - F4 - F4 - | . E3 E4 - - - | A#2 - A#3 - A#3 - | F2 - F3 - - -
       | A#2 - A#3 - A#3 F5 | A2 - A3 - - - | D3 - D4 - D4 - | . E3 E4 - - -
       | F3 - F4 - F4 - | . E3 E4 - - - | A#2 - A#3 - A#3 - | A2 - A3 - A3 -
       | D3 - D4 - D4 - | E3 - G4 - - - | F3 - F4 - F4 - | E3 - G4 - - -
       | D3 - D4 - D4 - | E3 - G4 - - - | F3 - F4 - F4 - | E3 - G4 - - -
       | D3 - D3 - D3 - | . E3 E3 - - - | F3 - F3 - F3 - | . E3 E3 - - -
       | A#2 - D3 - D3 - | F2 - C3 - - - | A#2 - D3 - D3 - | A2 - C#3 - - -
       | D3 - D3 - D3 - | . E3 E3 - - - | F3 - F3 - F3 - | . E3 E3 - - -
       | A#2 - D3 - D3 - | A2 - C#3 - C#3 - | D3 - D4 - D4 - | E3 - G4 - - -
       | F3 - F4 - F4 - | E3 - G4 - - - | D3 - D4 - D4 - | E3 - G4 - - -
       | F3 - F4 - F4 - | E3 - G4 - - - | D3 - D4 - D4 - | . E3 E4 - - -
       | F3 - F4 - F4 - | . E3 E4 - - - | A#2 - A#3 - A#3 - | F2 - F3 - - -
       | A#2 - A#3 - A#3 F5 | A2 - A3 - - - | D3 - D4 - D4 - | . E3 E4 - - -
       | F3 - F4 - F4 - | . E3 E4 - - - | A#2 - A#3 - A#3 - | A2 - A3 - A3 -
       | D3 - D4 - D4 - | E3 - G4 - - - | F3 - F4 - F4 - | E3 - G4 - - -
       | D3 - D4 - D4 - | E3 - G4 - - - | F3 - F4 - F4 - | E3 - G4 - - -`,
  chord2: `. . F4 - F4 - | . . B4 - - - | . . A4 - A4 - | . . B4 - - -
       | . . F4 - F4 - | . . B4 - - - | . . A4 - A4 - | . . B4 - - -
       | . . F3 - F3 - | . . G3 - - - | . . A3 - A3 - | . . G3 - - -
       | . . F3 - F3 - | . . F3 - - - | . . F3 - F3 - | . . E3 - - -
       | . . F3 - F3 - | . . G3 - - - | . . A3 - A3 - | . . G3 - - -
       | . . F3 - F3 - | . . E3 - E3 - | . . F4 - F4 - | . . B4 - - -
       | . . A4 - A4 - | . . B4 - - - | . . F4 - F4 - | . . B4 - - -
       | . . A4 - A4 - | . . B4 - - - | . . F4 - F4 - | . . G4 - - -
       | . . A4 - A4 - | . . G4 - - - | . . D4 - D4 - | . . C4 - - -
       | . . D4 - D4 G5 | E5 - C#4 - - - | . . F4 - F4 - | . . G4 - - -
       | . . A4 - A4 - | . . G4 - - - | . . D4 - D4 - | . . C#4 - C#4 -
       | . . F4 - F4 - | . . B4 - - - | . . A4 - A4 - | . . B4 - - -
       | . . F4 - F4 - | . . B4 - - - | . . A4 - A4 - | . . B4 - - -
       | . . F3 - F3 - | . . G3 - - - | . . A3 - A3 - | . . G3 - - -
       | . . F3 - F3 - | . . F3 - - - | . . F3 - F3 - | . . E3 - - -
       | . . F3 - F3 - | . . G3 - - - | . . A3 - A3 - | . . G3 - - -
       | . . F3 - F3 - | . . E3 - E3 - | . . F4 - F4 - | . . B4 - - -
       | . . A4 - A4 - | . . B4 - - - | . . F4 - F4 - | . . B4 - - -
       | . . A4 - A4 - | . . B4 - - - | . . F4 - F4 - | . . G4 - - -
       | . . A4 - A4 - | . . G4 - - - | . . D4 - D4 - | . . C4 - - -
       | . . D4 - D4 G5 | E5 - C#4 - - - | . . F4 - F4 - | . . G4 - - -
       | . . A4 - A4 - | . . G4 - - - | . . D4 - D4 - | . . C#4 - C#4 -
       | . . F4 - F4 - | . . B4 - - - | . . A4 - A4 - | . . B4 - - -
       | . . F4 - F4 - | . . B4 - - - | . . A4 - A4 - | . . B4 - - -`,
  chord3: `. . A4 - A4 - | . . . . . . | . . C5 - C5 - | . . . . . .
       | . . A4 - A4 - | . . . . . . | . . C5 - C5 - | . . . . . .
       | . . A3 - A3 - | . . B3 - - - | . . C4 - C4 - | . . B3 - - -
       | . . . . . . | . . . . . . | . . . . . . | . . . . . .
       | . . A3 - A3 - | . . B3 - - - | . . C4 - C4 - | . . B3 - - -
       | . . . . . . | . . . . . . | . . A4 - A4 - | . . E5 - - -
       | . . C5 - C5 - | . . E5 - - - | . . A4 - A4 - | . . E5 - - -
       | . . C5 - C5 - | . . E5 - - - | . . A4 - A4 - | . . B4 - - -
       | . . C5 - C5 - | . . B4 - - - | . . F4 - F4 - | . . . . . .
       | . . F4 - F4 - | F5 . E4 - - - | . . A4 - A4 - | . . B4 - - -
       | . . C5 - C5 - | . . B4 - - - | . . F4 - F4 - | . . E4 - E4 -
       | . . A4 - A4 - | . . . . . . | . . C5 - C5 - | . . . . . .
       | . . A4 - A4 - | . . . . . . | . . C5 - C5 - | . . . . . .
       | . . A3 - A3 - | . . B3 - - - | . . C4 - C4 - | . . B3 - - -
       | . . . . . . | . . . . . . | . . . . . . | . . . . . .
       | . . A3 - A3 - | . . B3 - - - | . . C4 - C4 - | . . B3 - - -
       | . . . . . . | . . . . . . | . . A4 - A4 - | . . E5 - - -
       | . . C5 - C5 - | . . E5 - - - | . . A4 - A4 - | . . E5 - - -
       | . . C5 - C5 - | . . E5 - - - | . . A4 - A4 - | . . B4 - - -
       | . . C5 - C5 - | . . B4 - - - | . . F4 - F4 - | . . . . . .
       | . . F4 - F4 - | F5 . E4 - - - | . . A4 - A4 - | . . B4 - - -
       | . . C5 - C5 - | . . B4 - - - | . . F4 - F4 - | . . E4 - E4 -
       | . . A4 - A4 - | . . . . . . | . . C5 - C5 - | . . . . . .
       | . . A4 - A4 - | . . . . . . | . . C5 - C5 - | . . . . . .`,
};
