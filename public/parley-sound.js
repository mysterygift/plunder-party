// The sounds of Parley: a night on the beach round a bonfire. The fire, the
// surf, crickets and an owl make the room (see the ambience in parley-host.js);
// the coins, the hat and the crew's cheer are the count. Synthesized, like
// everything in sound.js. Try them from the console: sfx('paSurf')

import { addEffects, SONGS } from './sound.js';

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
let kit = null;

addEffects((blocks) => {
  kit = blocks;
  const { tone, noise, voice, FX } = blocks;
  return {
    // ----- the beach at night -----

    /** The fire: a few pops and snaps, and a soft roar underneath. */
    paCrackle(t) {
      noise(t, 1.2, { gain: 0.025, from: 380, attack: 0.3 });
      const pops = 1 + Math.floor(Math.random() * 4);
      for (let i = 0; i < pops; i++) {
        const at = t + rand(0, 0.9);
        noise(at, rand(0.01, 0.04), { gain: rand(0.08, 0.22), from: rand(1500, 5000), type: 'bandpass', q: 1.5, attack: 0.001 });
        if (Math.random() < 0.3) noise(at + 0.02, 0.06, { gain: 0.06, from: 900, type: 'bandpass', q: 3, attack: 0.002 });
      }
    },
    /** A wave rolling up the sand, breaking, and hissing back down. */
    paSurf(t) {
      noise(t, 2.2, { gain: 0.09, from: 250, to: 900, attack: 1.4 });
      noise(t + 1.6, 2.8, { gain: 0.07, from: 3500, to: 900, type: 'highpass', attack: 0.15 });
      noise(t + 2.4, 3.2, { gain: 0.04, from: 5000, to: 2000, type: 'bandpass', q: 0.6, attack: 0.4 });
    },
    /** Crickets in the dune grass: a quick chirping trill or two. */
    paCrickets(t) {
      const hz = rand(4200, 4800);
      const bursts = 2 + Math.floor(Math.random() * 3);
      for (let b = 0; b < bursts; b++) {
        for (let i = 0; i < 5; i++) tone(hz, t + b * 0.45 + i * 0.032, 0.025, { type: 'sine', gain: 0.022 });
      }
    },
    /** An owl somewhere in the palms: hoo… hoo-hoo. */
    paOwl(t) {
      for (const [at, len] of [[0, 0.5], [0.85, 0.22], [1.15, 0.6]]) {
        voice(t + at, len, { type: 'sine', freq: [[0, 390], [0.3, 420], [1, 360]], gain: 0.05, attack: 0.08, release: 0.2, vibrato: { rate: 6, depth: 4 } });
      }
    },
    /** A breath of wind through the palm fronds. */
    paPalms(t) {
      noise(t, 3.5, { gain: 0.05, from: 1200, to: 2600, type: 'bandpass', q: 0.8, attack: 1.4 });
      for (let i = 0; i < 18; i++) noise(t + rand(0.8, 3), 0.05, { gain: rand(0.01, 0.025), from: rand(2500, 5000), type: 'bandpass', q: 2, attack: 0.01 });
    },

    // ----- the count -----

    /** A question goes up: a deep gong, like a ship's bell struck underwater. */
    paGong(t) {
      for (const [hz, gain] of [[110, 0.22], [221, 0.1], [331, 0.05], [497, 0.03]]) tone(hz, t, 3.2, { gain });
      noise(t, 0.08, { gain: 0.1, from: 600, attack: 0.002 });
    },
    /** One doubloon landing on the stack. */
    paCoin(t) {
      const hz = rand(2400, 3100);
      tone(hz, t, 0.4, { type: 'triangle', gain: 0.07 });
      tone(hz * 1.51, t, 0.25, { type: 'sine', gain: 0.04 });
      noise(t, 0.03, { gain: 0.08, from: 6000, type: 'highpass', attack: 0.001 });
    },
    /** The hat lands: a soft felt thump. */
    paHat(t) {
      noise(t, 0.12, { gain: 0.18, from: 420, to: 180, attack: 0.003 });
      tone(140, t, 0.15, { gain: 0.12, slideTo: 90 });
    },
    // ----- antics round the fire (see ANTICS in parley-host.js) -----

    /** A prop appears from nowhere: a soft pop. */
    paPop(t) {
      voice(t, 0.09, { type: 'sine', freq: [[0, 500], [1, 1100]], gain: 0.06, attack: 0.005, release: 0.04 });
    },
    /** A blade cutting the air. */
    paSwish(t) {
      noise(t, 0.22, { gain: 0.12, from: 900, to: 4200, type: 'bandpass', q: 1.4, attack: 0.04 });
    },
    /** A dagger landing in somebody's coat. */
    paThunk(t) {
      noise(t, 0.08, { gain: 0.25, from: 700, to: 200, attack: 0.002 });
      tone(180, t, 0.18, { type: 'triangle', gain: 0.14, slideTo: 120 });
      tone(1250, t + 0.01, 0.35, { type: 'triangle', gain: 0.04, slideTo: 1180 }); // the blade quivering
    },
    /** The musket's hammer, drawn back. */
    paClick(t) {
      noise(t, 0.02, { gain: 0.12, from: 3500, type: 'bandpass', q: 3, attack: 0.001 });
      noise(t + 0.12, 0.02, { gain: 0.16, from: 2500, type: 'bandpass', q: 3, attack: 0.001 });
    },
    /** The musket going off, a little too close to somebody's face. */
    paMusket(t) {
      noise(t, 0.6, { gain: 0.45, from: 3000, to: 200, attack: 0.002 });
      tone(160, t, 0.4, { gain: 0.3, slideTo: 45 });
      noise(t + 0.05, 1.4, { gain: 0.08, from: 600, to: 120, attack: 0.1 });
      voice(t + 0.7, 0.5, { type: 'sine', freq: [[0, 1400], [1, 1300]], gain: 0.03, attack: 0.02, release: 0.3 }); // ringing ears
    },
    /** A marshmallow catching light. */
    paSizzle(t) {
      noise(t, 0.9, { gain: 0.08, from: 4500, type: 'highpass', attack: 0.05 });
      noise(t, 0.3, { gain: 0.08, from: 900, to: 1800, type: 'bandpass', q: 1, attack: 0.01 });
    },

    /** The crew whoops and the fire roars up. */
    paCheer(t) {
      for (let i = 0; i < 9; i++) {
        const at = t + rand(0, 0.5);
        const hz = rand(260, 520);
        voice(at, rand(0.4, 0.8), { type: 'sawtooth', freq: [[0, hz], [0.4, hz * 1.35], [1, hz * 0.9]], gain: 0.018, attack: 0.05, release: 0.25, filter: { type: 'bandpass', from: 1100, q: 1.2 } });
      }
      noise(t, 1.6, { gain: 0.08, from: 500, to: 1400, attack: 0.15 });
      FX.coins(t + 0.4);
    },
  };
});

// A campfire band: a fiddle that leans on its notes, and a plucked guitar.
const band = {
  lead(hz, at, seconds, out) {
    kit.voice(at, seconds, { type: 'sawtooth', freq: hz, gain: 0.032, attack: 0.06, release: Math.min(0.2, seconds * 0.4), vibrato: { rate: 5.5, depth: hz * 0.006 }, filter: { type: 'bandpass', from: 1700, q: 0.9 }, bus: out });
  },
  bass(hz, at, seconds, out) {
    kit.tone(hz, at, Math.max(0.5, seconds * 1.2), { type: 'triangle', gain: 0.17, bus: out });
    kit.tone(hz * 2, at, 0.3, { type: 'triangle', gain: 0.05, bus: out });
  },
  strum(hz, at, seconds, out) {
    [1, 1.26, 1.5].forEach((m, i) => kit.tone(hz * m, at + i * 0.018, 0.5, { type: 'triangle', gain: 0.03, bus: out }));
  },
  drums(token, at, out) {
    if (token === 'k') kit.tone(95, at, 0.18, { gain: 0.14, slideTo: 60, bus: out });
    else if (token === 's') kit.noise(at, 0.1, { gain: 0.02, from: 2000, type: 'bandpass', q: 0.8, attack: 0.02, bus: out });
  },
};

// An original waltz in G, slow and swaying, for a night round the fire.
SONGS.parley = {
  title: 'Driftwood Waltz',
  step: 0.2,
  bar: 6,
  band,
  lead: `D4 - G4 - B4 - | D5 - - - B4 - | C5 - A4 - F#4 - | G4 - - - D4 -
       | E4 - G4 - C5 - | E5 - - - C5 - | B4 - G4 - A4 - | D4 - - - - -
       | D4 - G4 - B4 - | D5 - - - G5 - | F#5 - E5 - D5 - | C5 - - - A4 -
       | B4 - D5 - G4 - | A4 - - - F#4 - | G4 - - - - - | G4 - - - . .`,
  strum: `. . G3 . G3 . | . . G3 . G3 . | . . D3 . D3 . | . . G3 . G3 .
        | . . C3 . C3 . | . . C3 . C3 . | . . G3 . D3 . | . . D3 . D3 .
        | . . G3 . G3 . | . . G3 . G3 . | . . D3 . D3 . | . . A2 . D3 .
        | . . G3 . E3 . | . . D3 . D3 . | . . G3 . G3 . | . . G3 . . .`,
  bass: `G2 - - - - - | B2 - - - - - | D2 - - - - - | G2 - - - - -
       | C3 - - - - - | A2 - - - - - | G2 - - - D2 - | D2 - - - - -
       | G2 - - - - - | B2 - - - - - | D2 - - - - - | D2 - - - - -
       | E2 - - - C3 - | D2 - - - - - | G2 - - - - - | G2 - - - - -`,
  drums: 'k . s . s .',
};

// When somebody round the fire strikes up on the guitar, the band falls quiet and it's just them:
// "Drunken Sailor" (traditional, the same tune Broadside plays), picked out on a lone guitar.
const guitar = {
  lead(hz, at, seconds, out) {
    kit.tone(hz, at, Math.max(0.35, seconds * 1.4), { type: 'triangle', gain: 0.1, bus: out });
    kit.tone(hz * 2, at, 0.25, { type: 'sine', gain: 0.03, bus: out });
    kit.noise(at, 0.04, { gain: 0.012, from: 2200, type: 'bandpass', q: 1.5, attack: 0.008, bus: out }); // the pick on the string, softly
  },
  bass(hz, at, seconds, out) {
    kit.tone(hz, at, Math.max(0.5, seconds * 1.3), { type: 'triangle', gain: 0.12, bus: out });
    [1.5, 2].forEach((m, i) => kit.tone(hz * m * 2, at + 0.02 + i * 0.015, 0.4, { type: 'triangle', gain: 0.025, bus: out })); // a light strum above it
  },
};
SONGS.paGuitar = { ...SONGS.broadside, title: 'Drunken Sailor (on the guitar)', step: 0.15, band: guitar, drums: null };
