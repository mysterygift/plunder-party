// The sounds of Bombard!: gunnery, splintering timber, a storm, and one very
// large squid. Like everything in sound.js these are synthesized on the spot;
// there are no audio files.
//
// Each recipe gets `t` (when to start, in seconds). To hear one, open the
// browser console on the big screen and run e.g.  sfx('bbCannon')
// All the names start with "bb" so they are easy to find in sfxList().

import { addEffects, SONGS } from './sound.js';

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

addEffects(({ tone, noise, voice, FX }) => ({
  // ----- the guns -----

  /** A fuse fizzing down to the touch-hole. */
  bbFuse(t, length = 0.45) {
    noise(t, length, { gain: 0.07, from: 5200, to: 7600, type: 'highpass', attack: 0.03 });
    for (let when = 0; when < length; when += 0.04) {
      if (Math.random() < 0.6) noise(t + when, 0.02, { gain: 0.06, from: rand(3000, 6500), type: 'bandpass', q: 6, attack: 0.001 });
    }
  },

  /** A great gun going off: the crack, the body of the bang, a thump in the chest, and the echo rolling back off the water. */
  bbCannon(t, loud = 1) {
    noise(t, 0.05, { gain: 0.55 * loud, from: 4200, type: 'highpass', attack: 0.001 }); // crack
    noise(t, 1.5, { gain: 0.75 * loud, from: 1400, to: 45, attack: 0.003 }); // bang
    tone(96, t, 1.1, { gain: 0.6 * loud, slideTo: 27 }); // thump
    tone(48, t, 1.5, { type: 'triangle', gain: 0.25 * loud, slideTo: 24 });
    noise(t + 0.34, 1.3, { gain: 0.16 * loud, from: 420, to: 60, attack: 0.08 }); // first echo
    noise(t + 0.82, 1.8, { gain: 0.08 * loud, from: 260, to: 50, attack: 0.25 }); // and again, further off
  },

  /** The ball in the air. */
  bbWhistle(t, length = 0.8) {
    voice(t, length, { freq: [[0, 1500], [0.5, 1150], [1, 620]], gain: 0.035, attack: length * 0.4, release: 0.05, vibrato: { rate: 9, depth: 14 } });
    noise(t, length, { gain: 0.035, from: 2400, to: 900, type: 'bandpass', q: 3, attack: length * 0.5 });
  },

  /** The whole business for one gun: fuse, bang. */
  bbFire(t, loud = 1) {
    FX.bbFuse(t, 0.3);
    FX.bbCannon(t + 0.3, loud);
  },

  /** A ball hitting nothing but sea: a tall column of water coming down again. */
  bbSplash(t) {
    tone(150, t, 0.25, { gain: 0.32, slideTo: 48 }); // ploomp
    noise(t, 0.9, { gain: 0.38, from: 3800, to: 240, attack: 0.01 });
    noise(t + 0.06, 0.5, { gain: 0.14, from: 5200, type: 'highpass', attack: 0.04 });
    noise(t + 0.45, 0.9, { gain: 0.12, from: 2600, to: 600, type: 'bandpass', q: 0.8, attack: 0.25 }); // the spray landing
    FX.bubbles(t + 0.4);
  },

  /** A ball hitting a ship: the smack, then planks and splinters going everywhere. */
  bbHit(t) {
    noise(t, 0.06, { gain: 0.5, from: 3000, type: 'highpass', attack: 0.001 });
    noise(t, 0.5, { gain: 0.5, from: 1700, to: 120, attack: 0.002 });
    tone(130, t, 0.4, { type: 'triangle', gain: 0.5, slideTo: 42 });
    for (let i = 0; i < 9; i++) {
      const when = t + 0.04 + Math.random() * 0.42;
      const hz = rand(500, 2400);
      noise(when, rand(0.03, 0.09), { gain: rand(0.12, 0.28), from: hz, to: hz * 0.6, type: 'bandpass', q: 5, attack: 0.001 }); // cracks
    }
    for (let i = 0; i < 5; i++) FX.knock(t + 0.3 + Math.random() * 0.6, rand(0.2, 0.5)); // bits landing on deck
  },

  /** Something on fire. */
  bbCrackle(t, length = 1.6) {
    noise(t, length, { gain: 0.05, from: 500, to: 900, type: 'bandpass', q: 0.6, attack: 0.2 });
    for (let when = 0; when < length; when += 0.03) {
      if (Math.random() < 0.45) noise(t + when, 0.012, { gain: rand(0.04, 0.13), from: rand(1800, 5200), type: 'bandpass', q: 4, attack: 0.001 });
    }
  },

  /** A ship going down: timbers groaning, a rush of water, and a long stream of bubbles. */
  bbSink(t) {
    voice(t, 1.5, { type: 'sawtooth', freq: [[0, 70], [0.4, 48], [1, 30]], gain: 0.2, attack: 0.2, release: 0.5, filter: { from: 700, to: 260, q: 8 } });
    voice(t + 0.5, 1.3, { type: 'sawtooth', freq: [[0, 95], [1, 40]], gain: 0.1, attack: 0.25, release: 0.4, filter: { from: 1500, to: 500, q: 11 } });
    noise(t + 0.7, 2.2, { gain: 0.22, from: 1800, to: 180, attack: 0.5 });
    for (let i = 0; i < 26; i++) {
      const when = t + 1.0 + i * 0.085 + Math.random() * 0.05;
      const hz = rand(180, 520) * (1 - i / 60);
      tone(hz, when, 0.08, { gain: 0.07 * (1 - i / 34), slideTo: hz * 1.8 });
    }
    tone(70, t + 2.6, 0.9, { gain: 0.2, slideTo: 30 });
  },

  /** A puff of fog being blown away. */
  bbFog(t) {
    noise(t, 0.6, { gain: 0.07, from: 500, to: 2600, type: 'bandpass', q: 0.9, attack: 0.2 });
  },

  /** Ramming home the next charge. */
  bbReload(t) {
    noise(t, 0.22, { gain: 0.09, from: 900, to: 1900, type: 'bandpass', q: 2, attack: 0.05 });
    noise(t + 0.26, 0.2, { gain: 0.09, from: 1900, to: 800, type: 'bandpass', q: 2, attack: 0.05 });
    FX.knock(t + 0.52, 0.6);
    tone(2400, t + 0.56, 0.08, { type: 'square', gain: 0.02 });
  },

  /** The guns being run out: trucks rumbling over the deck, then thumping home against the ports. */
  bbRunOut(t) {
    noise(t, 0.9, { gain: 0.22, from: 130, to: 210, attack: 0.25 });
    for (let i = 0; i < 6; i++) noise(t + 0.08 + i * 0.13, 0.05, { gain: 0.1, from: 300, attack: 0.004 });
    FX.knock(t + 0.92, 1);
    FX.knock(t + 1.06, 0.8);
    FX.creak(t + 0.3);
    FX.pipe(t + 1.25);
  },

  /** One war drum. */
  bbDrum(t, loud = 1) {
    tone(118, t, 0.32, { gain: 0.5 * loud, slideTo: 52 });
    noise(t, 0.09, { gain: 0.2 * loud, from: 900, attack: 0.002 });
  },
  bbSnare(t, loud = 1) {
    noise(t, 0.11, { gain: 0.16 * loud, from: 1700, type: 'highpass', attack: 0.002 });
    tone(210, t, 0.07, { type: 'triangle', gain: 0.12 * loud, slideTo: 150 });
  },

  /** "Beat to quarters": the drum that sends everyone to their guns, and the bosun's pipe over the top. */
  bbQuarters(t) {
    const step = 0.125;
    'x.xxx.x.x.xxx.xxxxxx.x.x...'.split('').forEach((c, i) => {
      if (c === 'x') FX.bbSnare(t + i * step, i % 4 === 0 ? 1 : 0.6);
    });
    [0, 8, 16, 24].forEach((i) => FX.bbDrum(t + i * step, 0.8));
    FX.whistle(t + 0.4);
    FX.bell(t + 2.6);
  },

  /** Three slow drums and a roll: the moment before the broadside. */
  bbReady(t) {
    FX.bbDrum(t, 0.9);
    FX.bbDrum(t + 0.3, 0.9);
    FX.drumroll(t + 0.6, 0.9);
    FX.bbDrum(t + 1.5, 1.2);
  },

  /** A battle some way off. */
  bbDistant(t) {
    const shots = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < shots; i++) {
      const when = t + i * rand(0.25, 0.6);
      noise(when, 1.6, { gain: 0.1, from: 300, to: 50, attack: 0.05 });
      tone(60, when, 0.9, { gain: 0.1, slideTo: 30 });
    }
  },

  /** A flag cracking in the wind. */
  bbFlag(t) {
    for (let i = 0; i < 4; i++) noise(t + i * 0.13 + Math.random() * 0.04, 0.07, { gain: 0.07, from: rand(600, 1100), attack: 0.004 });
  },

  // ----- drinking -----

  /** Glug, glug, glug... aah. */
  bbSwig(t) {
    for (let i = 0; i < 3; i++) {
      const when = t + i * 0.2;
      tone(170 + i * 22, when, 0.13, { gain: 0.2, slideTo: 330 + i * 40 });
      noise(when, 0.05, { gain: 0.04, from: 700, attack: 0.005 });
    }
    noise(t + 0.75, 0.5, { gain: 0.05, from: 1400, to: 700, type: 'bandpass', q: 1.2, attack: 0.08 }); // aah
  },

  /** A whole side of the room drinking: tankards knocked together, then down the hatch. */
  bbToast(t) {
    for (let i = 0; i < 4; i++) {
      const when = t + i * 0.09 + Math.random() * 0.04;
      tone(rand(1500, 2300), when, 0.25, { type: 'triangle', gain: 0.08 });
      FX.knock(when, 0.3);
    }
    FX.bbSwig(t + 0.45);
    FX.bbSwig(t + 0.6);
  },

  /** Hurrah! (A few rough voices, more or less together.) */
  bbCheer(t) {
    for (let i = 0; i < 6; i++) {
      const base = rand(150, 260);
      const when = t + Math.random() * 0.12;
      voice(when, rand(0.7, 1.0), {
        type: 'sawtooth',
        freq: [[0, base], [0.25, base * 1.5], [1, base * 1.25]],
        gain: 0.035,
        attack: 0.06,
        release: 0.35,
        vibrato: { rate: rand(5, 8), depth: 10 },
        filter: { from: 800, to: 1300, q: 2.5 },
      });
    }
    noise(t, 1.1, { gain: 0.05, from: 1200, to: 2200, type: 'bandpass', q: 0.7, attack: 0.15 });
  },

  // ----- weather -----

  /** A gust with rain in it. */
  bbGust(t) {
    const length = rand(2.6, 4.2);
    noise(t, length, { gain: 0.1, from: rand(180, 320), to: rand(700, 1300), type: 'bandpass', q: 1.2, attack: length * 0.45 });
    noise(t + 0.4, length * 0.8, { gain: 0.035, from: 3800, to: 5200, type: 'highpass', attack: length * 0.3 }); // rain on the deck
    voice(t + 0.2, length * 0.8, { freq: [[0, 380], [0.5, 520], [1, 340]], gain: 0.012, attack: 0.9, release: 0.9 }); // the rigging moaning
  },

  /** Thunder: the crack overhead, then the long roll. */
  bbThunder(t) {
    noise(t, 0.12, { gain: 0.4, from: 2600, type: 'highpass', attack: 0.002 });
    noise(t + 0.02, 0.7, { gain: 0.5, from: 900, to: 90, attack: 0.004 });
    for (let i = 0; i < 6; i++) {
      const when = t + 0.3 + i * rand(0.3, 0.5);
      noise(when, rand(0.8, 1.4), { gain: 0.22 * (1 - i / 8), from: rand(120, 260), to: 45, attack: 0.12 });
    }
    tone(52, t, 2.4, { gain: 0.3, slideTo: 26 });
  },

  // ----- the Kraken -----

  /** Something enormous moving under the hull. */
  bbRumble(t, length = 3.2) {
    noise(t, length, { gain: 0.34, from: 70, to: 130, attack: length * 0.55 });
    voice(t, length, { freq: [[0, 31], [0.6, 40], [1, 34]], gain: 0.3, attack: length * 0.5, release: 0.5, vibrato: { rate: 6, depth: 3 } });
    for (let i = 0; i < 14; i++) {
      const hz = rand(120, 300);
      tone(hz, t + length * 0.3 + i * 0.16 + Math.random() * 0.08, 0.09, { gain: 0.05, slideTo: hz * 1.7 });
    }
  },

  /** The roar: a low growl with a throat to it. */
  bbRoar(t, length = 2.4) {
    voice(t, length, {
      type: 'sawtooth',
      freq: [[0, 74], [0.18, 96], [0.7, 62], [1, 38]],
      gain: 0.3,
      attack: 0.12,
      release: 0.7,
      vibrato: { rate: 23, depth: 9 },
      filter: { type: 'lowpass', from: 500, to: 1500, q: 5 },
    });
    voice(t + 0.03, length, {
      type: 'square',
      freq: [[0, 111], [0.18, 147], [0.7, 93], [1, 55]],
      gain: 0.1,
      attack: 0.15,
      release: 0.7,
      vibrato: { rate: 31, depth: 14 },
      filter: { from: 900, to: 420, q: 3 },
    });
    noise(t, length, { gain: 0.16, from: 380, to: 1300, type: 'bandpass', q: 1.4, attack: 0.2 });
    tone(44, t, length, { gain: 0.3, slideTo: 27 });
  },

  /** It has been hit, and it minds. */
  bbScreech(t) {
    voice(t, 0.75, {
      type: 'sawtooth',
      freq: [[0, 420], [0.2, 980], [0.6, 760], [1, 260]],
      gain: 0.14,
      attack: 0.02,
      release: 0.25,
      vibrato: { rate: 36, depth: 120 },
      filter: { from: 1900, to: 900, q: 3 },
    });
    noise(t, 0.5, { gain: 0.08, from: 2400, to: 1100, type: 'bandpass', q: 2, attack: 0.02 });
    tone(140, t, 0.5, { type: 'triangle', gain: 0.2, slideTo: 60 });
  },

  /** A tentacle bursting up through the surface. */
  bbTentacle(t) {
    noise(t, 0.9, { gain: 0.32, from: 220, to: 3400, attack: 0.5 });
    noise(t + 0.55, 0.8, { gain: 0.16, from: 4200, to: 1500, type: 'highpass', attack: 0.06 });
    tone(60, t, 0.8, { gain: 0.25, slideTo: 120 });
    FX.bubbles(t + 0.1);
    FX.bubbles(t + 0.5);
  },

  /** The tentacle coming down: the rush of air, then a blow like a falling mast. */
  bbSlam(t, onWood = false) {
    noise(t, 0.34, { gain: 0.2, from: 2600, to: 320, type: 'bandpass', q: 1.5, attack: 0.2 }); // whoosh
    const hit = t + 0.34;
    tone(88, hit, 0.9, { gain: 0.7, slideTo: 24 });
    noise(hit, 0.7, { gain: 0.5, from: 1000, to: 70, attack: 0.003 });
    if (onWood) FX.bbHit(hit);
    else FX.bbSplash(hit);
  },

  /** A piece of Kraken sliding back under, leaving ink. */
  bbSever(t) {
    FX.bbScreech(t);
    noise(t + 0.25, 0.5, { gain: 0.2, from: 900, to: 200, type: 'bandpass', q: 1.2, attack: 0.03 }); // squelch
    FX.splash(t + 0.5);
  },

  /** The end of it: a roar that runs out of breath and goes under. */
  bbKrakenDeath(t) {
    FX.bbRoar(t, 3.4);
    FX.bbScreech(t + 0.5);
    FX.bbScreech(t + 1.5);
    noise(t + 2.2, 2.6, { gain: 0.3, from: 2200, to: 120, attack: 0.6 });
    for (let i = 0; i < 30; i++) {
      const hz = rand(140, 460) * (1 - i / 70);
      tone(hz, t + 2.8 + i * 0.09 + Math.random() * 0.05, 0.09, { gain: 0.07 * (1 - i / 38), slideTo: hz * 1.8 });
    }
  },

  /** A minute gun and a bell, for when it all goes wrong. */
  bbDoom(t) {
    [147, 139, 123, 98].forEach((hz, i) => {
      tone(hz, t + i * 0.7, 1.1, { type: 'sawtooth', gain: 0.07 });
      tone(hz / 2, t + i * 0.7, 1.1, { type: 'triangle', gain: 0.16 });
    });
    FX.distantBell(t + 2.9);
    FX.distantBell(t + 4.3);
  },

  /** A salute: guns fired for joy rather than in anger. */
  bbSalute(t) {
    FX.bbCannon(t, 0.6);
    FX.bbCannon(t + 0.55, 0.5);
    FX.bbCannon(t + 1.05, 0.6);
    FX.bbCheer(t + 1.3);
  },
}));

// ---------------------------------------------------------------------------
// Music (the same text format as the songs in sound.js)
// ---------------------------------------------------------------------------

// An original fife-and-drum march, for choosing your target.
SONGS.bombard = {
  title: 'Run Out the Guns',
  step: 0.15,
  bar: 8,
  lead: `D5 - D5 E5 F#5 - D5 -  | A5 - F#5 - D5 - A4 -
       | B4 - B4 C#5 D5 - B4 -  | A4 - - - A4 - . .
       | D5 - D5 E5 F#5 - A5 -  | B5 - A5 - F#5 - D5 -
       | E5 - G5 F#5 E5 - C#5 - | D5 - - - D5 - . .
       | F#5 - A5 - D6 - A5 -   | B5 - G5 - E5 - G5 -
       | F#5 - A5 F#5 D5 - F#5 D5 | E5 - - - A4 - . .
       | F#5 - A5 - D6 - A5 -   | B5 - D6 B5 A5 - F#5 -
       | G5 - E5 - C#5 - E5 -   | D5 - - - D5 - . .`,
  bass: `D2 . A2 . D2 . A2 . | D2 . A2 . D2 . A2 .
       | G2 . D3 . G2 . D3 . | A2 . E3 . A2 . A2 .
       | D2 . A2 . D2 . A2 . | G2 . D3 . D2 . A2 .
       | A2 . E3 . A2 . E3 . | D2 . A2 . D2 . . .`,
  drums: 's . s s k . s . s . s s k s s s',
};

// Something slow and low, for hunting in the fog.
SONGS.kraken = {
  title: 'What Lies Beneath',
  step: 0.24,
  bar: 8,
  leadGain: 0.035,
  lead: `D4 - - - F4 - E4 -   | D4 - - - - - . .
       | D4 - - - F4 - G4 -   | A4 - - G#4 - - . .
       | A4 - - - Bb4 - A4 -  | F4 - - E4 - - . .
       | D4 - E4 - F4 - E4 -  | D4 - - - - - . .
       | D5 - - - C5 - Bb4 -  | A4 - - - - - . .
       | Bb4 - - - A4 - G4 -  | F4 - - E4 - - . .
       | D4 - F4 - A4 - G#4 - | A4 - - - Bb4 - - -
       | A4 - F4 - E4 - C#4 - | D4 - - - - - . .`,
  bass: `D2 - - - - - - - | D2 - - - A1 - - -
       | D2 - - - - - - - | A1 - - - - - - -
       | F2 - - - - - - - | C2 - - - A1 - - -
       | Bb1 - - - A1 - - - | D2 - - - - - - -`,
  drums: 'k . . k . . . . k . . k . . h .',
};
