// The sounds of Sea Lawyer: the gavel, a lie exposed, and a stately tune for
// the court played on something like a harpsichord. Synthesized on the spot,
// like everything in sound.js. Try them from the console: sfx('gavel')

import { addEffects, SONGS } from './sound.js';

let kit = null;

addEffects((blocks) => {
  kit = blocks;
  const { tone, noise, FX } = blocks;

  /** One strike of a gavel on its block: a hard crack with a hollow ring. */
  const strike = (t, loud = 1) => {
    noise(t, 0.05, { gain: 0.32 * loud, from: 2600, type: 'bandpass', q: 1.2, attack: 0.001 });
    tone(330, t, 0.16, { type: 'triangle', gain: 0.16 * loud, slideTo: 240 });
    tone(120, t, 0.22, { gain: 0.25 * loud, slideTo: 70 });
    FX.knock(t, 0.9 * loud);
  };

  return {
    /** The verdict: rap, rap, RAP, and the court murmurs. */
    gavel(t) {
      strike(t + 3.32, 0.7); // in time with the gavel on the TV (see bang() in lawyer-host.js)
      strike(t + 3.87, 0.8);
      strike(t + 4.42, 1.1);
      FX.reveal(t + 0.9);
      FX.coins(t + 4.8);
    },
    /** The verdict, when nobody found the truth: the raps, then a sorry little fall. */
    gavelEmpty(t) {
      strike(t + 3.32, 0.7); // in time with the gavel on the TV (see bang() in lawyer-host.js)
      strike(t + 3.87, 0.8);
      strike(t + 4.42, 1.1);
      FX.reveal(t + 0.9);
      [392, 370, 349, 294].forEach((hz, i) => tone(hz, t + 4.8 + i * 0.28, i === 3 ? 0.9 : 0.3, { type: 'sawtooth', gain: 0.05 }));
    },
    // ----- the court, while it sits (see the ambience in lawyer-host.js) -----

    /** The long-case clock in the corner: tick… tock. */
    slTickTock(t) {
      for (const [at, hz] of [[0, 2300], [1, 1900]]) {
        noise(t + at, 0.025, { gain: 0.05, from: hz, type: 'bandpass', q: 6, attack: 0.001 });
        tone(hz / 2, t + at, 0.05, { type: 'triangle', gain: 0.025 });
      }
    },
    /** Hushed whispering from the public gallery. */
    slWhisper(t) {
      let at = 0;
      const n = 8 + Math.floor(Math.random() * 10);
      for (let i = 0; i < n; i++) {
        const len = 0.04 + Math.random() * 0.1;
        noise(t + at, len, { gain: 0.03 + Math.random() * 0.03, from: 1600 + Math.random() * 2400, type: 'bandpass', q: 2.5, attack: 0.012 });
        at += len + (Math.random() < 0.2 ? 0.25 : 0.03);
      }
    },
    /** Somebody at the back clears their throat. */
    slCough(t) {
      for (const at of [0, 0.28]) {
        noise(t + at, 0.18, { gain: 0.11, from: 1100, to: 300, attack: 0.004 });
        tone(170 + Math.random() * 40, t + at, 0.14, { type: 'sawtooth', gain: 0.02, slideTo: 110 });
      }
    },
    /** Rain blowing against the stern windows, rising and falling away. */
    slRain(t) {
      noise(t, 5.5, { gain: 0.035, from: 2600, type: 'highpass', attack: 1.8 });
      for (let i = 0; i < 70; i++) {
        const at = 0.4 + Math.random() * 4.6;
        noise(t + at, 0.012, { gain: 0.03 + Math.random() * 0.04, from: 3000 + Math.random() * 4000, type: 'bandpass', q: 4, attack: 0.001 });
      }
    },
    /** Thunder, a long way off. */
    slThunder(t) {
      noise(t, 3.6, { gain: 0.16, from: 260, to: 50, attack: 0.25 });
      noise(t + 0.15, 1.2, { gain: 0.08, from: 700, to: 120, attack: 0.05 });
    },

    /** A lie exposed: one rap, a nasty chord, and a wax seal pressed down hard. */
    slLie(t) {
      strike(t + 0.42, 0.6);
      for (const hz of [185, 196, 277]) tone(hz, t + 1.5, 0.9, { type: 'sawtooth', gain: 0.045 });
      noise(t + 1.5, 0.25, { gain: 0.25, from: 500, to: 120, attack: 0.002 });
      tone(90, t + 1.5, 0.35, { gain: 0.3, slideTo: 50 });
    },
  };
});

// A harpsichord: two bright plucks a hair apart, dying away fast.
const band = {
  lead(hz, at, seconds, out) {
    for (const [mult, gain] of [[1, 0.05], [2, 0.018]]) {
      // A quick pluck, but not an instant one: a 3ms edge on a sawtooth clicks.
      kit.voice(at, Math.min(1.2, seconds + 0.25), { type: 'sawtooth', freq: hz * mult, gain, attack: 0.012, release: Math.min(1, seconds), filter: { type: 'lowpass', from: 2800, to: 800, q: 0.6 }, bus: out });
    }
  },
  bass(hz, at, seconds, out) {
    kit.voice(at, Math.min(1.4, seconds + 0.3), { type: 'sawtooth', freq: hz, gain: 0.06, attack: 0.015, release: Math.min(1.2, seconds), filter: { type: 'lowpass', from: 1100, to: 350, q: 0.5 }, bus: out });
  },
  drums(token, at, out) {
    if (token === 'k') kit.tone(70, at, 0.25, { gain: 0.16, slideTo: 45, bus: out });
    else if (token === 'h') kit.noise(at, 0.08, { gain: 0.01, from: 2400, type: 'lowpass', attack: 0.02, bus: out }); // a soft brush, not a tick
  },
};

// An original minuet in A minor, three beats to the bar, for the court in session.
SONGS.lawyer = {
  title: 'The Hanging Judge’s Minuet',
  step: 0.21,
  bar: 6,
  band,
  lead: `A4 - C5 - E5 - | D5 - C5 - B4 - | C5 - A4 - E4 - | F4 - - - E4 -
       | A4 - C5 - E5 - | G5 - F5 - E5 - | D5 - B4 - G#4 - | A4 - - - - -
       | C5 - E5 - G5 - | F5 - E5 - D5 - | E5 - C5 - A4 - | B4 - - - G4 -
       | A4 - B4 - C5 - | D5 - E5 - F5 - | E5 - D5 - B4 G#4 | A4 - - - - .`,
  bass: `A2 - E3 - A3 - | F2 - A2 - D3 - | A2 - E3 - A3 - | D2 - - - E2 -
       | A2 - E3 - A3 - | C3 - G2 - C3 - | E2 - - - E3 - | A2 - E2 - A2 -
       | C3 - G2 - C3 - | D3 - A2 - F2 - | A2 - E3 - C3 - | G2 - - - G2 -
       | F2 - A2 - C3 - | D3 - - - D2 - | E2 - - - E3 - | A2 - - - A2 .`,
  drums: 'k . h . h .',
};
