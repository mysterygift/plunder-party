// The sounds of Cradle to Kraken: a warm evening at sea (see the ambience in
// cradle-host.js), the ship's wheel, coins, glasses, wedding bells and the
// Kraken itself. Synthesized, like everything in sound.js. Try them from the
// console on the big screen: sfx('ckWedding')

import { addEffects, SONGS } from './sound.js';

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
let kit = null;

addEffects((blocks) => {
  kit = blocks;
  const { tone, noise, voice, FX } = blocks;

  /** One tick of a wooden ratchet. */
  const click = (t, loud = 1) => {
    noise(t, 0.03, { gain: 0.09 * loud, from: 2400, type: 'bandpass', q: 3, attack: 0.002 });
    tone(rand(500, 620), t, 0.04, { type: 'triangle', gain: 0.03 * loud });
  };
  /** A glass of something, clinked. */
  const glass = (t, loud = 1) => {
    const hz = rand(2100, 2700);
    tone(hz, t, 0.6, { type: 'sine', gain: 0.045 * loud });
    tone(hz * 2.4, t, 0.25, { type: 'sine', gain: 0.018 * loud });
  };

  return {
    // ----- the evening sea -----
    ckLap(t) {
      for (let i = 0; i < 3; i++) noise(t + i * rand(0.5, 0.9), rand(0.5, 0.9), { gain: rand(0.025, 0.05), from: rand(350, 700), to: rand(1200, 1900), type: 'bandpass', q: 1.1, attack: 0.15 });
    },
    /** Tortuga, far off across the water: a burst of laughter and a glass. */
    ckTavern(t) {
      for (let i = 0; i < 5; i++) voice(t + i * rand(0.08, 0.16), rand(0.1, 0.2), { type: 'sawtooth', freq: [[0, rand(220, 340)], [1, rand(180, 260)]], gain: 0.006, attack: 0.02, release: 0.05, filter: { type: 'lowpass', from: 900 } });
      glass(t + 0.6, 0.35);
    },

    // ----- the wheel and the board -----
    /** The helm spun: a run of clicks that slows down. */
    ckSpin(t) {
      let at = t;
      for (let i = 0; i < 24; i++) {
        click(at, 1 - i / 30);
        at += 0.03 + (i / 24) ** 2 * 0.2;
      }
    },
    /** A ship hopping onto a stepping-stone. */
    ckStep(t) {
      noise(t, 0.06, { gain: 0.05, from: 700, type: 'bandpass', q: 2, attack: 0.003 });
      tone(rand(180, 230), t, 0.08, { type: 'triangle', gain: 0.035 });
    },
    /** Off they all go: a horn, a wave and a creak. */
    ckSail(t) {
      FX.whoosh(t);
      FX.wave(t + 0.2);
      FX.creak(t + 0.5);
    },
    ckBell(t) {
      FX.bell(t);
    },
    ckHorn(t) {
      FX.horn(t);
      FX.gulls(t + 0.8);
    },
    ckLand(t) {
      FX.knock(t);
      FX.paper(t + 0.2);
    },
    ckQuill(t) {
      FX.quill(t);
    },
    ckCoins(t) {
      FX.coins(t);
      FX.coins(t + 0.25);
    },
    ckTreasure(t) {
      FX.treasure(t);
      FX.coins(t + 0.4);
    },
    ckFanfare(t) {
      FX.fanfare(t);
    },
    ckDrum(t) {
      FX.drumroll(t, 1.6);
    },
    ckCard(t) {
      noise(t, 0.12, { gain: 0.08, from: 3000, to: 6000, type: 'bandpass', q: 0.8, attack: 0.01 });
      voice(t + 0.12, 0.5, { type: 'triangle', freq: [[0, 520], [1, 1040]], gain: 0.05, attack: 0.02, release: 0.2 });
    },

    // ----- love and heartbreak -----
    /** Wedding bells: a run down the scale on a high bell, and glasses raised. */
    ckWedding(t) {
      [1568, 1397, 1319, 1175, 1047, 1175, 1319, 1568].forEach((hz, i) => {
        tone(hz, t + i * 0.16, 1.1, { type: 'sine', gain: 0.05 });
        tone(hz * 2.01, t + i * 0.16, 0.5, { type: 'sine', gain: 0.015 });
      });
      glass(t + 1.5);
      glass(t + 1.62, 0.8);
      glass(t + 1.7, 0.7);
    },
    /** A sad slide on a squeezebox. */
    ckHeartbreak(t) {
      voice(t, 1.2, { type: 'sawtooth', freq: [[0, 392], [0.4, 370], [1, 262]], gain: 0.04, attack: 0.05, release: 0.4, vibrato: { rate: 5, depth: 5 }, filter: { type: 'lowpass', from: 1200 } });
      voice(t + 0.05, 1.2, { type: 'sawtooth', freq: [[0, 311], [1, 208]], gain: 0.025, attack: 0.05, release: 0.4, filter: { type: 'lowpass', from: 900 } });
    },
    ckWave(t) {
      FX.wave(t);
      FX.gulls(t + 0.4);
    },

    // ----- fights -----
    ckDuel(t) {
      FX.clash(t);
      FX.drumroll(t + 0.3, 1.1);
    },
    ckCannon(t) {
      FX.cannon(t);
      FX.cannon(t + 0.3, 0.7);
      FX.coins(t + 1.1);
    },
    ckClash(t) {
      FX.clash(t);
      FX.clash(t + 0.35);
    },
    ckParley(t) {
      FX.pipe(t);
      FX.whistle(t + 0.5);
    },

    // ----- the crowd -----
    /** A cheer from the crew: lots of voices sliding up. */
    ckCheer(t) {
      for (let i = 0; i < 12; i++) voice(t + rand(0, 0.25), rand(0.5, 0.9), { type: 'sawtooth', freq: [[0, rand(200, 320)], [0.3, rand(380, 520)], [1, rand(300, 420)]], gain: 0.008, attack: 0.05, release: 0.3, filter: { type: 'bandpass', from: 1100, q: 0.8 } });
      noise(t, 0.9, { gain: 0.05, from: 1500, type: 'bandpass', q: 0.5, attack: 0.1 });
      FX.coins(t + 0.3);
    },
    /** Boos and a raspberry. */
    ckBoo(t) {
      for (let i = 0; i < 9; i++) voice(t + rand(0, 0.2), rand(0.7, 1.1), { type: 'sawtooth', freq: [[0, rand(170, 230)], [1, rand(110, 150)]], gain: 0.01, attack: 0.08, release: 0.3, filter: { type: 'lowpass', from: 700 } });
    },
    ckTale(t) {
      FX.knock(t);
      FX.knock(t + 0.18);
      tone(392, t + 0.4, 0.5, { type: 'triangle', gain: 0.05 });
    },
    /** A big glug and an "ahh". */
    ckSwig(t) {
      for (let i = 0; i < 5; i++) voice(t + i * 0.13, 0.09, { type: 'sine', freq: [[0, 260 - i * 15], [1, 140]], gain: 0.09, attack: 0.01, release: 0.04 });
      voice(t + 0.85, 0.6, { type: 'sawtooth', freq: [[0, 260], [1, 180]], gain: 0.02, attack: 0.05, release: 0.3, filter: { type: 'bandpass', from: 800, q: 1 } });
      glass(t + 1.4, 0.6);
    },
    ckGhost(t) {
      voice(t, 1.8, { type: 'sine', freq: [[0, 520], [0.5, 760], [1, 440]], gain: 0.04, attack: 0.4, release: 0.6, vibrato: { rate: 6, depth: 18 } });
      noise(t, 1.6, { gain: 0.04, from: 600, to: 2400, type: 'bandpass', q: 2, attack: 0.5 });
    },

    // ----- the Kraken -----
    ckKraken(t) {
      voice(t, 2.2, { type: 'sawtooth', freq: [[0, 55], [0.4, 70], [1, 40]], gain: 0.12, attack: 0.3, release: 0.8, filter: { type: 'lowpass', from: 300 } });
      voice(t + 0.1, 2, { type: 'square', freq: [[0, 41], [1, 33]], gain: 0.05, attack: 0.3, release: 0.8, filter: { type: 'lowpass', from: 200 } });
      FX.splash(t + 0.6);
      FX.bubbles(t + 1);
    },
  };
});

// The band: a fiddle on the tune, a squeezebox underneath (as in the Bottle's tune), and a bodhrán.
function reed(hz, at, seconds, out) {
  for (const detune of [0.996, 1.004]) kit.voice(at, Math.max(0.12, seconds * 0.9), { type: 'square', freq: hz * detune, gain: 0.009, attack: 0.03, release: 0.06, filter: { type: 'lowpass', from: 1300, q: 0.5 }, bus: out });
}
const band = {
  lead(hz, at, seconds, out) {
    kit.voice(at, seconds, { type: 'sawtooth', freq: hz, gain: 0.028, attack: 0.03, release: Math.min(0.14, seconds * 0.4), vibrato: { rate: 6, depth: hz * 0.006 }, filter: { type: 'bandpass', from: 2000, q: 0.9 }, bus: out });
  },
  bass(hz, at, seconds, out) {
    kit.voice(at, Math.max(0.2, seconds * 0.9), { type: 'square', freq: hz, gain: 0.045, attack: 0.02, release: 0.08, filter: { type: 'lowpass', from: 480, q: 0.5 }, bus: out });
  },
  chord1: reed,
  chord2: reed,
  drums(token, at, out) {
    if (token === 'k') kit.tone(90, at, 0.2, { gain: 0.13, slideTo: 55, bus: out });
    else if (token === 's') kit.noise(at, 0.12, { gain: 0.03, from: 900, type: 'bandpass', q: 0.8, attack: 0.01, bus: out });
    else if (token === 'h') kit.noise(at, 0.08, { gain: 0.012, from: 2400, type: 'lowpass', attack: 0.02, bus: out });
  },
};

// "The Long Way Round": an original jig in G, for the whole voyage.
SONGS.cradle = {
  title: 'The Long Way Round',
  step: 0.17,
  bar: 6,
  band,
  lead: `G4 - B4 D5 - B4 | C5 - E5 D5 - B4 | A4 - B4 C5 - A4 | B4 - G4 D4 - -
       | G4 - B4 D5 - G5 | F#5 - D5 E5 - C5 | B4 - G4 A4 - F#4 | G4 - - G4 - .
       | G4 - B4 D5 - B4 | C5 - E5 D5 - B4 | A4 - B4 C5 - A4 | B4 - G4 D4 - -
       | G4 - B4 D5 - G5 | F#5 - D5 E5 - C5 | B4 - G4 A4 - F#4 | G4 - - G4 - .
       | D5 - E5 F#5 - D5 | G5 - F#5 E5 - D5 | C5 - D5 E5 - C5 | D5 - B4 G4 - -
       | E5 - D5 C5 - B4 | A4 - B4 C5 - E5 | D5 - B4 A4 - F#4 | G4 - - - - .
       | D5 - E5 F#5 - D5 | G5 - F#5 E5 - D5 | C5 - D5 E5 - G5 | F#5 - D5 B4 - -
       | E5 - G5 D5 - B4 | C5 - A4 B4 - G4 | A4 - F#4 D4 - F#4 | G4 - - - - .`,
  bass: `G2 - . D3 - . | C3 - . G2 - . | D3 - . A2 - . | G2 - . D3 - .
       | G2 - . D3 - . | D3 - . C3 - . | G2 - . D3 - . | G2 - . G2 - .
       | G2 - . D3 - . | C3 - . G2 - . | D3 - . A2 - . | G2 - . D3 - .
       | G2 - . D3 - . | D3 - . C3 - . | G2 - . D3 - . | G2 - . G2 - .
       | D3 - . A2 - . | G2 - . D3 - . | C3 - . G2 - . | G2 - . D3 - .
       | C3 - . G2 - . | A2 - . E2 - . | D3 - . D2 - . | G2 - . G2 - .
       | D3 - . A2 - . | G2 - . D3 - . | C3 - . G2 - . | D3 - . A2 - .
       | C3 - . G2 - . | A2 - . E2 - . | D3 - . D2 - . | G2 - . G2 - .`,
  chord1: `. . B3 . . B3 | . . C4 . . C4 | . . A3 . . A3 | . . B3 . . B3
       | . . B3 . . B3 | . . A3 . . C4 | . . B3 . . A3 | . . B3 . . B3
       | . . B3 . . B3 | . . C4 . . C4 | . . A3 . . A3 | . . B3 . . B3
       | . . B3 . . B3 | . . A3 . . C4 | . . B3 . . A3 | . . B3 . . B3
       | . . A3 . . A3 | . . B3 . . B3 | . . C4 . . C4 | . . B3 . . B3
       | . . C4 . . C4 | . . A3 . . A3 | . . A3 . . A3 | . . B3 . . B3
       | . . A3 . . A3 | . . B3 . . B3 | . . C4 . . C4 | . . A3 . . A3
       | . . C4 . . C4 | . . A3 . . A3 | . . A3 . . A3 | . . B3 . . B3`,
  chord2: `. . D4 . . D4 | . . E4 . . E4 | . . F#4 . . F#4 | . . D4 . . D4
       | . . D4 . . D4 | . . F#4 . . E4 | . . D4 . . F#4 | . . D4 . . D4
       | . . D4 . . D4 | . . E4 . . E4 | . . F#4 . . F#4 | . . D4 . . D4
       | . . D4 . . D4 | . . F#4 . . E4 | . . D4 . . F#4 | . . D4 . . D4
       | . . F#4 . . F#4 | . . D4 . . D4 | . . E4 . . E4 | . . D4 . . D4
       | . . E4 . . E4 | . . C4 . . C4 | . . F#4 . . F#4 | . . D4 . . D4
       | . . F#4 . . F#4 | . . D4 . . D4 | . . E4 . . E4 | . . F#4 . . F#4
       | . . E4 . . E4 | . . C4 . . C4 | . . F#4 . . F#4 | . . D4 . . D4`,
  drums: 'k . h s . h',
};

// "Steel at Dusk": the raid, a tight loop over a pounding drum.
SONGS.cradleDuel = {
  title: 'Steel at Dusk',
  step: 0.12,
  bar: 8,
  band: { bass: band.bass, drums: band.drums },
  lead: `E4 . E4 . G4 . E4 . | F#4 . E4 . D4 . B3 . | E4 . E4 . G4 . A4 . | B4 . A4 . G4 . F#4 .`,
  bass: `E2 . E2 . E2 . E2 . | D2 . D2 . D2 . D2 . | C2 . C2 . C2 . C2 . | B1 . B1 . B1 . B1 .`,
  drums: 'k . s . k k s .',
  leadGain: 0.03,
};
