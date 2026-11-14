// The sounds and tunes of Find the One Piece. Like everything in sound.js they
// are synthesized on the spot; there are no audio files.
//
// Nothing in this game is spoken, so the music does the narrator's job: every
// part of the story has its own tune, written to match its mood. They are
// listed at the bottom, in story order. Each scene in content/one-piece.json
// names the tune it wants ("music": "opJungle").
//
// To hear an effect, open the browser console on the big screen and run e.g.
// sfx('opRoar'). All the names start with "op" so they are easy to find in
// sfxList().

import { addEffects, SONGS } from './sound.js';

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

let kit = null; // the building blocks from sound.js (tone, noise, voice), kept for the instruments further down

addEffects((blocks) => {
  kit = blocks;
  const { tone, noise, voice, FX } = blocks;
  return {
    /** A quill crossing the page: about a second of scratching. The TV repeats it for as long as it is writing. */
    opWrite(t) {
      let when = t;
      while (when < t + 0.75) {
        const strokes = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < strokes; i++) {
          const hz = rand(3000, 5600);
          noise(when, 0.07, { gain: 0.04, from: hz, to: hz * 1.3, type: 'bandpass', q: 2.5, attack: 0.015 });
          when += rand(0.07, 0.11);
        }
        when += rand(0.08, 0.2); // lifting the pen between words
      }
    },

    /** A line struck through the options nobody chose. */
    opStrike(t) {
      for (const dt of [0, 0.32]) noise(t + dt, 0.26, { gain: 0.07, from: 2600, to: 5200, type: 'bandpass', q: 1.6, attack: 0.03 });
    },

    /** Everybody's dice, rattling in their fists. */
    opRattle(t) {
      for (let when = 0; when < 0.9; when += rand(0.03, 0.08)) {
        noise(t + when, 0.03, { gain: rand(0.04, 0.1), from: rand(1800, 4200), type: 'bandpass', q: 5, attack: 0.001 });
        if (Math.random() < 0.3) tone(rand(900, 1500), t + when, 0.03, { type: 'triangle', gain: 0.03 });
      }
    },

    /** One die landing on the page. */
    opDie(t) {
      for (const [dt, loud] of [[0, 1], [0.09, 0.6], [0.15, 0.35]]) {
        tone(rand(700, 1100), t + dt, 0.05, { type: 'triangle', gain: 0.09 * loud });
        noise(t + dt, 0.04, { gain: 0.1 * loud, from: 2400, type: 'bandpass', q: 3, attack: 0.001 });
      }
    },

    /** The seal coming down on a middling result. */
    opStamp(t) {
      FX.knock(t, 1.3);
      noise(t, 0.16, { gain: 0.2, from: 500, to: 140, attack: 0.002 });
    },

    /** A bad result: the seal, and the band losing heart. */
    opBad(t) {
      FX.opStamp(t);
      voice(t + 0.12, 0.5, { type: 'sawtooth', freq: [[0, 196], [1, 185]], gain: 0.07, attack: 0.03, release: 0.2, filter: { type: 'lowpass', from: 1200, to: 500, q: 1 } });
      voice(t + 0.6, 0.9, { type: 'sawtooth', freq: [[0, 147], [1, 131]], gain: 0.08, attack: 0.03, release: 0.4, filter: { type: 'lowpass', from: 1000, to: 350, q: 1 } });
    },

    /** A diabolical one: a nasty chord, and something heavy falling a long way. */
    opDoom(t) {
      FX.opStamp(t);
      for (const hz of [98, 139, 196, 233]) {
        voice(t + 0.08, 1.9, { type: 'sawtooth', freq: [[0, hz], [1, hz * 0.94]], gain: 0.06, attack: 0.02, release: 0.9, filter: { type: 'lowpass', from: 2200, to: 300, q: 1.5 } });
      }
      noise(t + 0.1, 1.8, { gain: 0.22, from: 400, to: 50, attack: 0.05 });
      tone(70, t + 0.1, 1.6, { gain: 0.3, slideTo: 32 });
    },

    /** The dragon. */
    opRoar(t) {
      voice(t, 1.9, { type: 'sawtooth', freq: [[0, 120], [0.15, 210], [0.6, 150], [1, 70]], gain: 0.2, attack: 0.08, release: 0.6, vibrato: { rate: 31, depth: 26 }, filter: { type: 'lowpass', from: 500, to: 1900, q: 2 } });
      voice(t, 1.9, { type: 'square', freq: [[0, 61], [0.2, 104], [1, 40]], gain: 0.12, attack: 0.08, release: 0.6, vibrato: { rate: 24, depth: 12 } });
      noise(t + 0.05, 2.1, { gain: 0.3, from: 300, to: 2400, q: 0.8, attack: 0.3 });
      noise(t + 0.9, 1.4, { gain: 0.16, from: 1800, to: 200, attack: 0.1 });
    },

    /** A monkey, giving notice. */
    opMonkey(t) {
      let when = t;
      for (let i = 0; i < 7; i++) {
        const high = i > 2;
        const hz = high ? rand(1100, 1500) : rand(520, 700);
        voice(when, high ? 0.12 : 0.17, { type: 'sawtooth', freq: [[0, hz * 0.8], [0.3, hz], [1, hz * 0.7]], gain: 0.09, attack: 0.01, release: 0.04, filter: { type: 'bandpass', from: hz * 1.8, q: 3 } });
        when += high ? rand(0.11, 0.15) : rand(0.18, 0.24);
      }
    },
  };
});

// ---------------------------------------------------------------------------
// The band
// ---------------------------------------------------------------------------
//
// Each of these makes one instrument: a function sound.js calls for every
// note, with the pitch, when to play it, how long to hold it, and where to
// send the sound.

/** A concertina: two reeds, a touch out of tune with each other. */
const reed = (gain = 0.032) => (freq, at, seconds, out) => {
  for (const detune of [0.996, 1.004]) {
    kit.voice(at, seconds + 0.06, { type: 'sawtooth', freq: freq * detune, gain, attack: 0.05, release: 0.14, vibrato: { rate: 5.5, depth: freq * 0.004 }, filter: { type: 'lowpass', from: 1800, q: 0.8 }, bus: out });
  }
};

/** Brass: each note opens up as it sounds. */
const brass = (gain = 0.06, bright = 2400) => (freq, at, seconds, out) => {
  kit.voice(at, seconds, { type: 'sawtooth', freq: [[0, freq * 0.97], [0.1, freq], [1, freq]], gain, attack: 0.03, release: 0.07, filter: { type: 'lowpass', from: 800, to: bright, q: 1.2 }, bus: out });
};

/** A tuba going "oom". */
const tuba = (freq, at, seconds, out) => {
  kit.voice(at, Math.min(seconds, 0.3) + 0.08, { type: 'triangle', freq, gain: 0.2, attack: 0.012, release: 0.1, bus: out });
  kit.voice(at, Math.min(seconds, 0.3) + 0.08, { type: 'sawtooth', freq, gain: 0.035, attack: 0.012, release: 0.1, filter: { type: 'lowpass', from: 500, q: 1 }, bus: out });
};

/** Anything struck or plucked: it sounds, and dies away. */
const pluck = (type, gain, ring) => (freq, at, seconds, out) => kit.tone(freq, at, ring, { type, gain, bus: out });

/** A music box: a bright note with a higher one ringing over it. */
const box = (gain = 0.07) => (freq, at, seconds, out) => {
  kit.tone(freq, at, 0.9, { type: 'triangle', gain, bus: out });
  kit.tone(freq * 3, at, 0.35, { type: 'sine', gain: gain * 0.25, bus: out });
};

/** A church organ, more or less. */
const organ = (gain = 0.04) => (freq, at, seconds, out) => {
  for (const [times, share] of [[1, 1], [2, 0.5], [3, 0.22], [0.5, 0.5]]) {
    kit.voice(at, seconds + 0.12, { type: 'sine', freq: freq * times, gain: gain * share, attack: 0.07, release: 0.2, bus: out });
  }
};

/** Low strings, bowed hard. */
const strings = (gain = 0.04, bright = 1500) => (freq, at, seconds, out) => {
  for (const detune of [0.994, 1, 1.006]) {
    kit.voice(at, seconds + 0.05, { type: 'sawtooth', freq: freq * detune, gain, attack: 0.05, release: 0.1, filter: { type: 'lowpass', from: bright, q: 0.9 }, bus: out });
  }
};

/** A trombone that cannot quite hold the note. */
const trombone = (gain = 0.08) => (freq, at, seconds, out) => {
  kit.voice(at, seconds + 0.1, { type: 'sawtooth', freq: [[0, freq * 1.03], [0.2, freq], [0.75, freq], [1, freq * 0.93]], gain, attack: 0.06, release: 0.2, vibrato: { rate: 5, depth: freq * 0.012 }, filter: { type: 'lowpass', from: 1100, to: 600, q: 1.4 }, bus: out });
};

/** A long low note that never quite goes away. */
const drone = (gain = 0.07) => (freq, at, seconds, out) => {
  kit.voice(at, seconds + 0.4, { type: 'sawtooth', freq, gain, attack: 0.4, release: 0.6, filter: { type: 'lowpass', from: 260, to: 420, q: 2 }, bus: out });
  kit.voice(at, seconds + 0.4, { type: 'sine', freq: freq * 1.5, gain: gain * 0.4, attack: 0.5, release: 0.6, bus: out });
};

/** Drums beyond the usual kick, snare and hat: T and t are hand drums, x a shaker, b a big slow drum, g a far-off bell. */
const drums = (token, at, out) => {
  if (token === 'T' || token === 't') {
    const hz = token === 'T' ? 190 : 120;
    kit.tone(hz, at, 0.22, { type: 'sine', gain: 0.22, slideTo: hz * 0.6, bus: out });
    kit.noise(at, 0.05, { gain: 0.06, from: 900, type: 'bandpass', q: 1.5, attack: 0.002, bus: out });
  } else if (token === 'x') {
    kit.noise(at, 0.05, { gain: 0.035, from: 6000, type: 'highpass', attack: 0.004, bus: out });
  } else if (token === 'b') {
    kit.tone(78, at, 0.7, { type: 'sine', gain: 0.32, slideTo: 44, bus: out });
    kit.noise(at, 0.25, { gain: 0.1, from: 300, to: 80, attack: 0.004, bus: out });
  } else if (token === 'g') {
    for (const [hz, share] of [[392, 1], [784, 0.4], [1046, 0.2]]) kit.tone(hz, at, 2.4, { type: 'sine', gain: 0.07 * share, bus: out });
  } else if (token === 'k') {
    kit.tone(140, at, 0.12, { type: 'sine', gain: 0.24, slideTo: 45, bus: out });
  } else if (token === 's') {
    kit.noise(at, 0.1, { gain: 0.07, from: 1800, type: 'highpass', attack: 0.002, bus: out });
  } else if (token === 'h') {
    kit.noise(at, 0.03, { gain: 0.03, from: 7000, type: 'highpass', attack: 0.002, bus: out });
  }
};

// ---------------------------------------------------------------------------
// The tunes, in story order
// ---------------------------------------------------------------------------
//
// One note per step; "-" holds the note, "." is a rest, "|" is only there to
// help you count. `step` is the length of a step in seconds, `bar` how many
// steps make a bar.

// Shipwrecked: a slow, wistful waltz on a concertina. Nobody is coming.
SONGS.opBeach = {
  title: 'Ship Mislaid',
  step: 0.3,
  bar: 6,
  band: { lead: reed(), bass: pluck('triangle', 0.14, 1.3) },
  lead: `D4 - - F4 - A4 | G4 - - E4 - - | F4 - - A4 - D5 | C5 - - - A4 -
       | Bb4 - - A4 - G4 | F4 - - E4 - D4 | E4 - - G4 - E4 | D4 - - - - .`,
  bass: `D2 - - A2 - - | C2 - - G2 - - | D2 - - A2 - - | F2 - - C3 - -
       | G2 - - D3 - - | D2 - - A2 - - | A2 - - E2 - - | D2 - - - - .`,
};

// The jungle: hand drums, a thumb piano going round and round, and something watching.
SONGS.opJungle = {
  title: 'A Personal Interest',
  step: 0.16,
  bar: 8,
  band: { lead: pluck('sine', 0.12, 0.45), bass: drone(0.06), drums },
  lead: `A3 . C4 . E4 . C4 A3 | . G3 . C4 D4 . C4 . | A3 . C4 . E4 . G4 E4 | . D4 . C4 A3 . G3 .
       | A3 . C4 . E4 . C4 A3 | . G3 . C4 D4 . E4 . | G4 . E4 . D4 . C4 A3 | . . G3 . A3 . . .`,
  bass: `A1 - - - - - - - | G1 - - - - - - - | A1 - - - - - - - | F1 - - - G1 - - -`,
  drums: 't . x T . t x . | t . x T . T t x',
};

// New Oldham: a colliery brass band, playing with more enthusiasm than anything else.
SONGS.opOldham = {
  title: 'Rag Pudding Rag',
  step: 0.18,
  bar: 8,
  band: { lead: brass(0.06), bass: tuba, pah: brass(0.028, 1500), drums },
  lead: `G4 - E4 G4 C5 - G4 - | A4 - F4 A4 C5 - A4 - | G4 - E4 G4 C5 - E5 - | D5 - B4 G4 D5 - - .
       | E5 - C5 E5 G5 - E5 - | F5 - D5 B4 G4 - B4 - | C5 E5 D5 C5 B4 D5 G4 B4 | C5 - - C5 C5 - - .`,
  bass: `C2 . G2 . C2 . G2 . | F2 . C3 . F2 . C3 . | C2 . G2 . C2 . G2 . | G2 . D3 . G2 . D3 .
       | C2 . G2 . C2 . G2 . | G2 . D3 . G2 . D3 . | C2 . G2 . G2 . D3 . | C2 . G2 . C2 . . .`,
  pah: `. E4 . E4 . E4 . E4 | . F4 . F4 . F4 . F4 | . E4 . E4 . E4 . E4 | . D4 . D4 . D4 . D4
      | . E4 . E4 . E4 . E4 | . D4 . D4 . D4 . D4 | . E4 . E4 . D4 . D4 | . E4 . E4 . E4 . .`,
  drums: 'k . s . k . s s',
};

// The monkey: quick, chromatic and none too dignified.
SONGS.opMonkey = {
  title: 'It’s ’Im',
  step: 0.11,
  bar: 8,
  band: { lead: pluck('triangle', 0.11, 0.2), bass: pluck('triangle', 0.16, 0.25), drums },
  lead: `E5 D#5 E5 B4 E5 D#5 E5 B4 | G5 F#5 G5 E5 G5 F#5 G5 E5 | A5 G5 F#5 E5 D#5 E5 F#5 D#5 | E5 . B4 . E4 . . .
       | C5 B4 C5 A4 C5 B4 C5 A4 | B4 A#4 B4 G4 B4 A#4 B4 G4 | A4 B4 C5 D5 E5 F#5 G5 A5 | B5 . B4 . E5 . . .`,
  bass: `E2 . B2 . E2 . B2 . | E2 . B2 . E2 . B2 . | A2 . E3 . B2 . F#3 . | E2 . B2 . E2 . . .
       | A2 . E3 . A2 . E3 . | G2 . D3 . G2 . D3 . | A2 . . . B2 . . . | E2 . B2 . E2 . . .`,
  drums: 'k h s h k k s h',
};

// The trial: a hymn, played with a perfectly straight face.
SONGS.opTrial = {
  title: 'Guilty of Rochdale',
  step: 0.42,
  bar: 4,
  band: { lead: organ(0.045), bass: organ(0.05), drums },
  lead: `F4 - A4 - | C5 - A4 - | Bb4 - A4 G4 | A4 - - - | F4 - G4 A4 | Bb4 - G4 - | A4 - G4 - | F4 - - .`,
  bass: `F2 - - - | A2 - - - | Bb2 - C3 - | F2 - - - | D2 - - - | G2 - C2 - | C2 - C3 - | F2 - - .`,
  drums: 'g . . . . . . . | . . . . . . . .',
};

// The climb: low, slow, and getting no better the higher it goes.
SONGS.opVolcano = {
  title: 'Smells of Eggs',
  step: 0.26,
  bar: 8,
  band: { lead: strings(0.035, 1300), bass: pluck('triangle', 0.2, 0.3), drums },
  lead: `C4 - - Eb4 - - D4 - | C4 - - G3 - - - - | C4 - - Eb4 - - F4 - | G4 - - F#4 - - - -
       | Ab4 - - G4 - - F4 - | Eb4 - - D4 - - - - | C4 - Eb4 - G4 - Bb4 - | B4 - - - - - - .`,
  bass: `C2 . C2 . C2 . C2 . | C2 . C2 . C2 . C2 . | Ab1 . Ab1 . Ab1 . Ab1 . | G1 . G1 . G1 . G1 .
       | F1 . F1 . F1 . F1 . | G1 . G1 . G1 . G1 . | Ab1 . Ab1 . Bb1 . Bb1 . | G1 . G1 . G1 G1 G1 .`,
  drums: 'b . . . . . . .',
};

// The hoard: a music box in a very large, very quiet room. Then it stops.
SONGS.opHoard = {
  title: 'Which of It Is the One Piece',
  step: 0.2,
  bar: 8,
  band: { lead: box(0.06), bass: drone(0.08) },
  lead: `D5 A5 F#5 A5 D6 A5 F#5 A5 | E5 A5 G#5 A5 E6 A5 G#5 A5 | D5 A5 F#5 A5 D6 A5 F#5 A5 | C5 G5 E5 G5 C6 G5 E5 .
       | Bb4 F5 D5 F5 Bb5 F5 D5 F5 | A4 E5 C#5 E5 A5 E5 C#5 . | D5 . . A4 . . D4 . | . . . . . . . .`,
  bass: `D2 - - - - - - - | D2 - - - - - - - | D2 - - - - - - - | C2 - - - - - - -
       | Bb1 - - - - - - - | A1 - - - - - - - | D2 - - - - - - - | - - - - - - . .`,
};

// The dragon: everything the band has got, as fast as it can play it.
SONGS.opDragon = {
  title: 'Now or Never',
  step: 0.14,
  bar: 8,
  band: { lead: brass(0.055, 2800), bass: strings(0.05, 900), drums },
  lead: `D4 . D4 F4 . D4 A4 . | G4 . F4 E4 . F4 D4 . | D4 . D4 F4 . A4 D5 . | C5 . Bb4 A4 . G4 A4 .
       | Bb4 . Bb4 D5 . Bb4 F5 . | E5 . D5 C#5 . D5 A4 . | D5 C5 Bb4 A4 G4 F4 E4 C#4 | D4 . . D4 D4 . . .`,
  bass: `D2 D2 . D2 D2 . D2 D2 | D2 D2 . D2 D2 . C2 C2 | D2 D2 . D2 D2 . D2 D2 | F2 F2 . F2 E2 . E2 E2
       | Bb1 Bb1 . Bb1 Bb1 . Bb1 Bb1 | A1 A1 . A1 A1 . A1 A1 | G1 G1 . G1 A1 . A1 A1 | D2 . . D2 D2 . . .`,
  drums: 'b h k s h k s h',
};

// The best ending: a shanty with the sun on it.
SONGS.opFairWinds = {
  title: 'Fair Winds, at Last',
  step: 0.17,
  bar: 8,
  band: { lead: reed(0.036), fife: pluck('square', 0.035, 0.3), bass: pluck('triangle', 0.17, 0.4), drums },
  lead: `D5 - A4 D5 F#5 - A5 - | G5 - E5 G5 B5 - A5 - | F#5 - D5 F#5 A5 - D6 - | C#6 - A5 E5 A5 - - .
       | B5 - G5 B5 D6 - B5 - | A5 - F#5 A5 D6 - A5 - | G5 B5 A5 G5 F#5 A5 E5 C#5 | D5 - - D5 D5 - - .`,
  fife: `. . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . A5 C#6
       | D6 . . . . . . . | . . . . . . . . | . . . . . . . . | F#6 . A6 . D7 . . .`,
  bass: `D2 . A2 . D2 . A2 . | G2 . D3 . G2 . D3 . | D2 . A2 . D2 . A2 . | A2 . E3 . A2 . E3 .
       | G2 . D3 . G2 . D3 . | D2 . A2 . D2 . A2 . | G2 . D3 . A2 . E3 . | D2 . A2 . D2 . . .`,
  drums: 'k h s h k h s s',
};

// The good ending: a very correct naval march, which ends on the wrong note.
SONGS.opReceipt = {
  title: 'HMS Paperwork',
  step: 0.22,
  bar: 8,
  band: { lead: brass(0.055, 2000), bass: tuba, drums },
  lead: `G4 - - G4 B4 - D5 - | G5 - - F#5 E5 - D5 - | C5 - - C5 E5 - G5 - | F#5 - E5 - D5 - - .
       | G4 - - G4 B4 - D5 - | E5 - - D5 C5 - B4 - | A4 - C5 - B4 - A4 - | Ab4 - - - G4 - - .`,
  bass: `G2 . D2 . G2 . D2 . | G2 . D2 . G2 . D2 . | C2 . G2 . C2 . G2 . | D2 . A2 . D2 . . .
       | G2 . D2 . G2 . D2 . | C2 . G2 . G2 . D2 . | D2 . A2 . D2 . A2 . | Eb2 . . . G2 . . .`,
  drums: 's . s s s . s .',
};

// The middling ending: a lullaby. There is tea, and for now you are not in it.
SONGS.opTea = {
  title: 'Back for Tea',
  step: 0.26,
  bar: 6,
  band: { lead: box(0.07), bass: pluck('triangle', 0.13, 1.1) },
  lead: `B4 - D5 G5 - D5 | E5 - C5 G4 - - | A4 - C5 F#5 - D5 | B4 - - - - .
       | B4 - D5 G5 - B5 | A5 - F#5 D5 - - | E5 - C5 A4 - F#4 | G4 - - - - .`,
  bass: `G2 - - D3 - - | C2 - - G2 - - | D2 - - A2 - - | G2 - - D3 - -
       | G2 - - D3 - - | D2 - - A2 - - | C2 - - D2 - - | G2 - - - - .`,
};

// The bad ending: a waltz for one trombone, sliding steadily downhill.
SONGS.opSmoke = {
  title: 'The Smoke Was Us',
  step: 0.3,
  bar: 6,
  band: { lead: trombone(0.08), bass: tuba },
  lead: `E4 - - D#4 - - | D4 - - C#4 - - | C4 - - - B3 - | A3 - - - - .
       | A4 - - G#4 - - | G4 - - F#4 - - | F4 - E4 - D#4 - | E4 - - - - .`,
  bass: `A2 . . C3 . C3 | A2 . . C3 . C3 | D2 . . F2 . F2 | A2 . . E2 . .
       | F2 . . A2 . A2 | E2 . . G#2 . G#2 | D2 . . E2 . . | A2 . . . . .`,
};

// The worst ending: very little, very low, and a bell a long way off.
SONGS.opAshes = {
  title: 'Bit Gamey',
  step: 0.6,
  bar: 4,
  band: { lead: organ(0.05), bass: drone(0.09), drums },
  lead: `D3 - - - | F3 - E3 - | D3 - - - | A2 - - - | Bb2 - - - | A2 - - - | D3 - - - | . . . .`,
  bass: `D1 - - - | - - - - | D1 - - - | - - - - | Bb0 - - - | A0 - - - | D1 - - - | - - - -`,
  drums: 'g . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . .',
};

// The muster: the shipwreck waltz again, on a music box, now that it is all over.
SONGS.opMuster = { ...SONGS.opBeach, title: 'A True Account', band: { lead: box(0.07), bass: pluck('triangle', 0.13, 1.3) } };
