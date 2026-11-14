// All the TV's audio, generated in the browser with the Web Audio API:
// sound effects, sea ambience, chiptune shanties, and a spoken narrator.
// No audio files are needed.
//
// To change the music, scroll down to SONGS: each tune is just text.

let audio = null;
let sfxBus = null;
let musicBus = null; // music + sea, switched by the Music setting
let duck = null; // turns the music down while the narrator is talking
let noiseLoop = null; // one shared buffer of hiss, used for drums, waves and whooshes

export const settings = { sound: true, music: true, narrator: true, voice: null };

/** Browsers only allow sound after a click, so the host screen calls this on first click. */
export function unlock() {
  if (audio) return audio.resume();
  audio = new AudioContext();
  sfxBus = audio.createGain();
  musicBus = audio.createGain();
  duck = audio.createGain();
  sfxBus.connect(audio.destination);
  musicBus.connect(duck).connect(audio.destination);

  noiseLoop = audio.createBuffer(1, audio.sampleRate * 3, audio.sampleRate);
  const data = noiseLoop.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  applySettings();
  startSea();
  startBackground();
  applyMusic();
}

export function applySettings() {
  if (!audio) return;
  sfxBus.gain.value = settings.sound ? 1 : 0;
  musicBus.gain.value = settings.music ? 1 : 0;
  if (!settings.narrator) hush();
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

// Where sounds are currently being sent. play() points this at a volume knob
// of its own for the duration of one effect, so effects can be played quietly
// (as background ambience) without rewriting them.
let target = null;

/** A plucked note that fades away. */
function tone(freq, at, length, { type = 'sine', gain = 0.18, slideTo = null, bus = target } = {}) {
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + length);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(amp).connect(bus);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

/** A burst of filtered hiss. Every burst fades in and out, so it never clicks. */
function noise(at, length, { gain = 0.3, from = 800, to = from, q = 0.7, type = 'lowpass', attack = 0.02, bus = target } = {}) {
  const src = audio.createBufferSource();
  src.buffer = noiseLoop;
  src.loop = true;
  const filter = audio.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, at);
  if (to !== from) filter.frequency.exponentialRampToValueAtTime(to, at + length);
  const amp = audio.createGain();
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + length);
  amp.gain.linearRampToValueAtTime(0, at + length + 0.02);
  src.connect(filter).connect(amp).connect(bus);
  src.start(at, Math.random() * 2);
  src.stop(at + length + 0.05);
}

/**
 * A sustained, shaped sound: the pitch can glide through several points, wobble
 * (vibrato), and pass through a filter. Used for whistles, gulls, creaks, squawks.
 *   freq: a number, or [[0, hz], [0.3, hz], [1, hz]] where the first value is
 *         how far through the sound (0 to 1) that pitch is reached.
 */
function voice(at, length, { type = 'sine', freq, gain = 0.1, attack = 0.02, release = 0.08, vibrato = null, filter = null, bus = target }) {
  const end = at + length;
  const osc = audio.createOscillator();
  osc.type = type;
  const points = Array.isArray(freq) ? freq : [[0, freq]];
  osc.frequency.setValueAtTime(points[0][1], at);
  for (const [fraction, hz] of points.slice(1)) osc.frequency.exponentialRampToValueAtTime(hz, at + fraction * length);

  if (vibrato) {
    const lfo = audio.createOscillator();
    const depth = audio.createGain();
    lfo.frequency.value = vibrato.rate;
    depth.gain.value = vibrato.depth;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(at);
    lfo.stop(end + 0.05);
  }

  let node = osc;
  if (filter) {
    const f = audio.createBiquadFilter();
    f.type = filter.type ?? 'bandpass';
    f.Q.value = filter.q ?? 1;
    f.frequency.setValueAtTime(filter.from, at);
    if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, end);
    node = node.connect(f);
  }

  const amp = audio.createGain();
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + attack);
  amp.gain.setValueAtTime(gain, Math.max(at + attack, end - release));
  amp.gain.linearRampToValueAtTime(0, end);
  node.connect(amp).connect(bus);
  osc.start(at);
  osc.stop(end + 0.05);
}

// ---------------------------------------------------------------------------
// Sound effects
// ---------------------------------------------------------------------------
//
// Every effect is a small recipe built from the pieces above. `t` is when it
// starts. Bigger effects are made by calling smaller ones (a volley is three
// cannons and a splash). To hear one on its own, open the browser console on
// the big screen and run:  sfx('gulls')

const FX = {
  // ----- wood, rope and metal -----

  /** A thump on timber. */
  knock(t, loud = 1) {
    tone(170, t, 0.12, { type: 'triangle', gain: 0.3 * loud, slideTo: 80 });
    noise(t, 0.06, { gain: 0.1 * loud, from: 900, attack: 0.002 });
  },
  /** The ship's clock, for the last few seconds of a countdown. */
  tick(t) {
    tone(520, t, 0.05, { type: 'triangle', gain: 0.14, slideTo: 380 });
    noise(t, 0.025, { gain: 0.05, from: 2500, type: 'highpass', attack: 0.001 });
  },
  /** Timbers groaning. */
  creak(t) {
    voice(t, 1.0, { type: 'sawtooth', freq: [[0, 46], [0.45, 72], [1, 50]], gain: 0.16, attack: 0.18, release: 0.3, filter: { from: 520, to: 880, q: 9 } });
    voice(t + 0.12, 0.7, { type: 'sawtooth', freq: [[0, 61], [1, 88]], gain: 0.07, attack: 0.2, release: 0.25, filter: { from: 1300, to: 1700, q: 12 } });
  },
  /** Two strikes of the ship's bell. */
  bell(t) {
    for (const when of [t, t + 0.38]) {
      tone(1320, when, 1.4, { gain: 0.14 });
      tone(1980, when, 0.9, { gain: 0.07 });
      tone(2790, when, 0.5, { gain: 0.04 });
    }
  },
  /** A single bell, far off. */
  distantBell(t) {
    tone(990, t, 2.2, { gain: 0.05 });
    tone(1485, t, 1.4, { gain: 0.02 });
  },
  /** Steel on steel. */
  clash(t) {
    for (const [hz, len] of [[2140, 0.7], [2960, 0.55], [3890, 0.45], [5130, 0.3], [6350, 0.22]]) {
      tone(hz * (0.97 + Math.random() * 0.06), t, len, { gain: 0.05 });
    }
    noise(t, 0.07, { gain: 0.14, from: 5000, type: 'highpass', attack: 0.001 });
  },
  /** A proper sword fight: three clashes. */
  swords(t) {
    FX.clash(t);
    FX.clash(t + 0.21);
    FX.clash(t + 0.5);
  },
  /** The anchor chain running out, then the anchor hitting the water. */
  anchor(t) {
    let when = t;
    for (let i = 0; i < 14; i++) {
      tone(2300 + Math.random() * 900, when, 0.03, { type: 'square', gain: 0.035 });
      noise(when, 0.02, { gain: 0.05, from: 4000, type: 'highpass', attack: 0.001 });
      when += 0.085 - i * 0.003;
    }
    FX.splash(when + 0.05);
  },
  /** A telescope being pulled open. */
  spyglass(t) {
    [620, 790, 980].forEach((hz, i) => {
      tone(hz, t + i * 0.13, 0.05, { type: 'square', gain: 0.05 });
      FX.knock(t + i * 0.13, 0.25);
    });
    tone(2093, t + 0.45, 0.6, { gain: 0.06 });
  },
  /** A quill scratching across a page, a few words at a time. */
  quill(t) {
    let when = t + 0.35;
    while (when < t + 3.0) {
      const strokes = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < strokes; i++) {
        const hz = 3200 + Math.random() * 2600;
        noise(when, 0.07, { gain: 0.045, from: hz, to: hz * 1.3, type: 'bandpass', q: 2.5, attack: 0.015 });
        when += 0.075 + Math.random() * 0.04;
      }
      when += 0.1 + Math.random() * 0.12; // lifting the pen between words
    }
  },
  /** A chart being unrolled. */
  paper(t) {
    noise(t, 0.12, { gain: 0.06, from: 2600, to: 5200, type: 'highpass', attack: 0.03 });
    noise(t + 0.1, 0.16, { gain: 0.07, from: 3400, to: 2200, type: 'highpass', attack: 0.04 });
    noise(t + 0.24, 0.1, { gain: 0.04, from: 4200, type: 'highpass', attack: 0.02 });
  },

  // ----- sea and sky -----

  /** Something (or someone) going overboard. */
  splash(t) {
    noise(t, 0.75, { gain: 0.34, from: 3200, to: 280, attack: 0.012 });
    noise(t + 0.05, 0.4, { gain: 0.12, from: 5000, type: 'highpass', attack: 0.03 });
    FX.bubbles(t + 0.35);
  },
  bubbles(t) {
    for (let i = 0; i < 7; i++) {
      const hz = 260 + Math.random() * 380;
      tone(hz, t + i * 0.085 + Math.random() * 0.04, 0.07, { gain: 0.06, slideTo: hz * 1.9 });
    }
  },
  /** A wave rolling in. */
  wave(t) {
    noise(t, 2.6, { gain: 0.11, from: 320, to: 1300, attack: 1.1 });
  },
  /** A gust catching the sails. */
  wind(t) {
    noise(t, 0.7, { gain: 0.13, from: 260, to: 1500, type: 'bandpass', q: 1.4, attack: 0.22 });
    noise(t + 0.22, 0.1, { gain: 0.07, from: 700, attack: 0.005 }); // the canvas snapping taut
  },
  whoosh(t) {
    FX.wind(t);
  },
  /** Seagulls. */
  gulls(t) {
    let when = t;
    const cries = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < cries; i++) {
      const pitch = 0.9 + Math.random() * 0.25;
      voice(when, 0.34, {
        type: 'triangle',
        freq: [[0, 1350 * pitch], [0.22, 2250 * pitch], [1, 1150 * pitch]],
        gain: 0.07,
        attack: 0.03,
        release: 0.14,
        vibrato: { rate: 28, depth: 45 },
      });
      when += 0.4 + Math.random() * 0.18;
    }
  },
  /** Polly has opinions. */
  parrot(t) {
    for (const [when, len] of [[t, 0.3], [t + 0.36, 0.2]]) {
      voice(when, len, {
        type: 'sawtooth',
        freq: [[0, 950], [0.35, 1750], [1, 1050]],
        gain: 0.13,
        attack: 0.015,
        release: 0.06,
        vibrato: { rate: 38, depth: 170 },
        filter: { from: 2300, q: 2.2 },
      });
    }
  },

  // ----- signals -----

  /** The bosun's pipe: "all hands!" */
  whistle(t) {
    voice(t, 1.15, {
      freq: [[0, 1850], [0.2, 1900], [0.32, 2950], [0.82, 3000], [1, 1700]],
      gain: 0.075,
      attack: 0.04,
      release: 0.12,
      vibrato: { rate: 11, depth: 18 },
    });
  },
  /** A short pipe, for "your turn". */
  pipe(t) {
    voice(t, 0.5, { freq: [[0, 2100], [0.3, 2900], [1, 2950]], gain: 0.07, attack: 0.03, release: 0.1 });
  },
  /** Something went wrong. */
  horn(t) {
    tone(147, t, 0.28, { type: 'sawtooth', gain: 0.1 });
    tone(110, t + 0.24, 0.5, { type: 'sawtooth', gain: 0.1 });
  },
  /** A drum roll that swells. */
  drumroll(t, length = 0.9) {
    for (let when = 0; when < length; when += 0.045) {
      noise(t + when, 0.05, { gain: 0.03 + 0.09 * (when / length), from: 1500, type: 'highpass', attack: 0.002 });
    }
  },

  // ----- players doing things -----

  /** Boots up the gangplank, and a little ding: someone has joined. */
  board(t) {
    FX.knock(t, 0.7);
    FX.knock(t + 0.17, 0.85);
    tone(1568, t + 0.33, 0.5, { type: 'triangle', gain: 0.09 });
  },
  /** A cork popping: an answer has been bottled. */
  cork(t) {
    tone(900, t, 0.09, { gain: 0.24, slideTo: 240 });
    noise(t, 0.03, { gain: 0.09, from: 3000, type: 'highpass', attack: 0.001 });
  },
  join(t) {
    FX.cork(t);
  },

  // ----- treasure -----

  coins(t) {
    for (let i = 0; i < 9; i++) tone(1800 + Math.random() * 1600, t + i * 0.06 + Math.random() * 0.03, 0.12, { type: 'triangle', gain: 0.07 });
  },
  /** A shovel in the sand. */
  dig(t) {
    noise(t, 0.24, { gain: 0.2, from: 1500, to: 480, type: 'bandpass', q: 1.1, attack: 0.03 });
  },
  /** The lid of a treasure chest creaking open on a pile of gold. */
  chest(t) {
    voice(t, 0.5, { type: 'sawtooth', freq: [[0, 58], [1, 96]], gain: 0.13, attack: 0.1, release: 0.15, filter: { from: 700, to: 1500, q: 9 } });
    [1047, 1319, 1568, 2093, 2637].forEach((hz, i) => tone(hz, t + 0.45 + i * 0.06, 0.6, { type: 'triangle', gain: 0.07 }));
    FX.coins(t + 0.6);
  },
  /** Dig, dig, thunk, treasure. */
  treasure(t) {
    FX.dig(t);
    FX.dig(t + 0.34);
    FX.knock(t + 0.72);
    FX.chest(t + 0.95);
  },
  reveal(t) {
    [392, 494, 587, 784].forEach((f, i) => tone(f, t + i * 0.07, 0.5, { type: 'triangle', gain: 0.12 }));
  },

  // ----- gunnery -----

  cannon(t, loud = 1) {
    noise(t, 1.1, { gain: 0.6 * loud, from: 900, to: 60, attack: 0.004 });
    tone(110, t, 0.9, { gain: 0.45 * loud, slideTo: 32 });
  },
  /** One answer wins a duel: a cannon shot, then the loser hits the water. */
  duel(t) {
    FX.cannon(t + 1.0, 0.85);
    FX.splash(t + 1.95);
  },
  /** A full broadside: three guns, then the splash. */
  volley(t) {
    FX.cannon(t + 1.0, 0.7);
    FX.cannon(t + 1.24, 0.6);
    FX.cannon(t + 1.52, 0.75);
    FX.splash(t + 2.4);
  },

  // ----- celebrations -----

  fanfare(t) {
    const notes = [392, 392, 392, 523, 659, 523, 659, 784];
    const times = [0, 0.14, 0.28, 0.42, 0.7, 0.98, 1.12, 1.26];
    notes.forEach((f, i) => {
      const long = i === notes.length - 1;
      tone(f, t + times[i], long ? 1.2 : 0.26, { type: 'square', gain: 0.07 });
      tone(f / 2, t + times[i], long ? 1.2 : 0.26, { type: 'triangle', gain: 0.1 });
    });
    FX.coins(t + 1.3);
  },
  /** The winner: drum roll, fanfare, and a two-gun salute. */
  finale(t) {
    FX.drumroll(t, 0.9);
    FX.fanfare(t + 0.9);
    FX.cannon(t + 2.6, 0.55);
    FX.cannon(t + 3.1, 0.55);
    FX.gulls(t + 3.8);
  },
};

/**
 * Play an effect by name.
 *   level:    volume, 1 = normal
 *   ambience: true sends it through the music channel (so the Music switch silences it)
 */
export function play(name, { level = 1, ambience = false } = {}) {
  if (!audio || !FX[name]) return;
  if (!ambience && !settings.sound) return;
  const out = audio.createGain();
  out.gain.value = level;
  out.connect(ambience ? musicBus : sfxBus);
  target = out;
  try {
    FX[name](audio.currentTime + 0.02);
  } finally {
    target = null;
  }
  setTimeout(() => out.disconnect(), 8000);
}

export const effectNames = () => Object.keys(FX);

/**
 * Lets a game bring its own effects in a file of its own (see bombard-sound.js).
 * `make` is handed the building blocks and returns { name: recipe } to add to FX.
 */
export function addEffects(make) {
  Object.assign(FX, make({ tone, noise, voice, FX }));
}

// ---------------------------------------------------------------------------
// Ambience: waves on the hull
// ---------------------------------------------------------------------------

function startSea() {
  const src = audio.createBufferSource();
  src.buffer = noiseLoop;
  src.loop = true;
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 520;
  const amp = audio.createGain();
  amp.gain.value = 0.03;
  // A slow swell: the volume rises and falls every eight seconds or so.
  const swell = audio.createOscillator();
  const depth = audio.createGain();
  swell.frequency.value = 0.12;
  depth.gain.value = 0.018;
  swell.connect(depth).connect(amp.gain);
  src.connect(filter).connect(amp).connect(musicBus);
  src.start();
  swell.start();
}

// Now and then, something happens out at sea: gulls, a creaking timber, a
// distant bell, a wave. Quiet, random, and silent while the narrator talks.
const BACKGROUND = ['gulls', 'gulls', 'creak', 'creak', 'wave', 'distantBell'];
let backgroundOn = true;

function startBackground() {
  const again = () => {
    setTimeout(() => {
      if (backgroundOn && settings.music && !talking && !document.hidden) {
        play(BACKGROUND[Math.floor(Math.random() * BACKGROUND.length)], { level: 0.45, ambience: true });
      }
      again();
    }, 9000 + Math.random() * 14000);
  };
  again();
}

/** Switch the random background sounds on or off (off while the game is paused). */
export function background(on) {
  backgroundOn = on;
}

// ---------------------------------------------------------------------------
// Chiptune shanties
// ---------------------------------------------------------------------------
//
// Each song is written as text, one token per step:
//   C4, F#5, Bb3 ...  play that note      -   keep holding the previous note
//   .                 silence             |   bar line (ignored, just for reading)
// Drums use  k = kick,  s = snare,  h = hi-hat.
// `step` is the length of one step in seconds, so smaller = faster.
// The lead line sets how long the song is; bass and drums repeat underneath.
//
// Which song plays where: 'lobby' in the lobby, and each game's id while people
// are thinking (see the sound.music(...) call in host.js).

export const SONGS = {
  // An original jig in D minor.
  lobby: {
    title: 'Plunder Jig',
    step: 0.2,
    bar: 6,
    lead: `D4 - F4 A4 - F4 | G4 - E4 C4 - E4 | D4 - F4 A4 - D5 | C5 - A4 A4 - -
         | D5 - C5 A4 - F4 | G4 - A4 G4 - E4 | F4 - D4 E4 - C4 | D4 - - D4 - -
         | F4 - A4 D5 - A4 | C5 - G4 E4 - G4 | F4 - A4 D5 - F5 | E5 - C5 A4 - -
         | D5 - F5 E5 - C5 | A4 - C5 G4 - E4 | F4 - E4 D4 - C4 | D4 - - - - .`,
    bass: `D2 - . A2 - . | C2 - . G2 - . | D2 - . A2 - . | A2 - . E2 - .
         | D2 - . A2 - . | C2 - . G2 - . | D2 - . C2 - . | D2 - . D2 - .`,
    drums: 'k . h s . h',
  },

  // "Drunken Sailor" (traditional), for Broadside.
  broadside: {
    title: 'Drunken Sailor',
    step: 0.13,
    bar: 16,
    lead: `A4 - A4 A4 A4 - A4 A4 A4 - D4 - F4 - A4 -
         | G4 - G4 G4 G4 - G4 G4 G4 - C4 - E4 - G4 -
         | A4 - A4 A4 A4 - A4 A4 A4 - B4 - C5 - D5 -
         | C5 - A4 - G4 - E4 - D4 - - - D4 - - .
         | A4 - - - A4 - A4 - A4 - D4 - F4 - A4 -
         | G4 - - - G4 - G4 - G4 - C4 - E4 - G4 -
         | A4 - - - A4 - A4 - A4 - B4 - C5 - D5 -
         | C5 - A4 - G4 - E4 - D4 - - - D4 - - .`,
    bass: `D2 - . . A2 - . . D2 - . . A2 - . .
         | C2 - . . G2 - . . C2 - . . G2 - . .
         | D2 - . . A2 - . . D2 - . . A2 - . .
         | C2 - . . G2 - . . D2 - . . D2 - A2 -`,
    drums: 'k . h . s . h . k . h h s . h .',
  },

  // An original hornpipe made of bleepy broken chords, for Scuttlebutt's retro desktop.
  scuttlebutt: {
    title: 'Dial-Up Hornpipe',
    step: 0.155,
    bar: 8,
    lead: `C5 E5 G5 E5 C6 G5 E5 G5 | D5 G5 B5 G5 D5 B4 D5 G5
         | C5 E5 A5 E5 C5 A4 C5 E5 | F5 A5 C6 A5 F5 E5 D5 C5
         | E5 - G5 E5 C5 - E5 C5   | D5 - G5 D5 B4 - D5 B4
         | F5 A5 C6 A5 G5 B5 D5 G5 | C6 - G5 - C5 - . .
         | A4 C5 E5 A5 E5 C5 A4 C5 | G4 B4 E5 G5 E5 B4 G4 B4
         | F4 A4 C5 F5 C5 A4 F4 A4 | G4 B4 D5 G5 B5 G5 D5 B4
         | A5 - E5 C5 A4 - C5 E5   | G5 - E5 B4 G4 - B4 E5
         | F5 A5 C6 A5 G5 B5 D6 B5 | C6 - - - G5 - C5 -`,
    bass: `C3 . C3 . G2 . C3 . | G2 . G2 . D3 . G2 .
         | A2 . A2 . E3 . A2 . | F2 . F2 . C3 . F2 .
         | C3 . C3 . G2 . C3 . | G2 . G2 . D3 . G2 .
         | F2 . F2 . G2 . G2 . | C3 . G2 . C3 . . .
         | A2 . A2 . E3 . A2 . | E2 . E2 . B2 . E2 .
         | F2 . F2 . C3 . F2 . | G2 . G2 . D3 . G2 .
         | A2 . A2 . E3 . A2 . | E2 . E2 . B2 . E2 .
         | F2 . F2 . G2 . G2 . | C3 . G2 . C3 . C3 .`,
    drums: 'k h s h k h s h',
  },

  // "Skye Boat Song" (traditional air), gentle sailing music for Dead Reckoning.
  reckoning: {
    title: 'Skye Boat Song',
    step: 0.15,
    bar: 12,
    leadGain: 0.04,
    lead: `D4 - - E4 D4 - G4 - - - G4 - | A4 - - B4 A4 - D5 - - - - -
         | B4 - - A4 B4 - E4 - - - E4 - | D4 - - - - - - - - - . .
         | D4 - - E4 D4 - G4 - - - G4 - | A4 - - B4 A4 - D5 - - - - -
         | B4 - - A4 B4 - E4 - - - E4 - | G4 - - - - - - - - - . .
         | B4 - - G4 B4 - B4 - - - - - | A4 - - E4 A4 - A4 - - - - -
         | G4 - - E4 G4 - G4 - - - G4 - | E4 - - - - - - - - - . .
         | B4 - - G4 B4 - B4 - - - - - | A4 - - E4 A4 - A4 - - - - -
         | G4 - - E4 G4 - G4 - - - G4 - | E4 - - - - - - - - - . .`,
    bass: `G2 - D3 - G3 - G2 - D3 - G3 - | D2 - A2 - D3 - D2 - A2 - D3 -
         | E2 - B2 - E3 - E2 - B2 - E3 - | D2 - A2 - D3 - D2 - A2 - D3 -
         | G2 - D3 - G3 - G2 - D3 - G3 - | D2 - A2 - D3 - D2 - A2 - D3 -
         | E2 - B2 - E3 - C2 - G2 - C3 - | G2 - D3 - G3 - G2 - D3 - G3 -
         | E2 - B2 - E3 - E2 - B2 - E3 - | A2 - E3 - A3 - A2 - E3 - A3 -
         | E2 - B2 - E3 - E2 - B2 - E3 - | E2 - B2 - E3 - E2 - B2 - E3 -
         | E2 - B2 - E3 - E2 - B2 - E3 - | A2 - E3 - A3 - A2 - E3 - A3 -
         | E2 - B2 - E3 - E2 - B2 - E3 - | E2 - B2 - E3 - D2 - A2 - D3 -`,
    drums: 'k . . . h . . . h . . .',
  },

  // An original reel in G, bright and busy, for stitching flags in Flying Colours.
  colours: {
    title: 'Needle and Thread',
    step: 0.16,
    bar: 8,
    lead: `G4 B4 D5 B4 G4 B4 D5 G5   | F#5 D5 A4 D5 F#5 - D5 -
         | E5 G5 E5 C5 E5 - C5 -     | D5 B4 G4 B4 A4 - - -
         | G4 B4 D5 B4 G4 B4 D5 G5   | F#5 D5 A4 D5 F#5 - A5 -
         | G5 E5 C5 E5 D5 B4 A4 F#4  | G4 - - - G4 - . .
         | B4 - D5 - G5 - D5 B4      | C5 - E5 - G5 - E5 C5
         | A4 - D5 - F#5 - D5 A4     | B4 D5 G5 D5 B4 - - -
         | E5 - G5 E5 C5 - E5 C5     | D5 - G5 D5 B4 - D5 B4
         | C5 E5 D5 C5 B4 A4 G4 F#4  | G4 - - - G4 - - .`,
    bass: `G2 . D3 . G2 . D3 . | D2 . A2 . D2 . A2 .
         | C2 . G2 . C2 . G2 . | G2 . D3 . D2 . A2 .
         | G2 . D3 . G2 . D3 . | D2 . A2 . D2 . A2 .
         | C2 . G2 . D2 . A2 . | G2 . D3 . G2 . . .
         | G2 . D3 . G2 . D3 . | C2 . G2 . C2 . G2 .
         | D2 . A2 . D2 . A2 . | G2 . D3 . G2 . D3 .
         | C2 . G2 . C2 . G2 . | G2 . D3 . G2 . D3 .
         | C2 . G2 . D2 . A2 . | G2 . D3 . G2 . G2 .`,
    drums: 'k . h . s . h h',
  },
};

const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4" -> 440. Returns NaN for anything that isn't a note name. */
export function noteFrequency(name) {
  const match = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!match) return NaN;
  const semitone = SEMITONES[match[1]] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0);
  return 440 * 2 ** ((semitone - 9) / 12 + (Number(match[3]) - 4));
}

export const parseTrack = (text) => text.replace(/\|/g, ' ').trim().split(/\s+/);

/** A steady chiptune note: quick attack, held, quick release. */
function chip(freq, at, length, type, gain, bus) {
  const end = at + Math.max(0.05, length);
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + 0.006);
  amp.gain.linearRampToValueAtTime(gain * 0.65, Math.min(at + 0.07, end - 0.03));
  amp.gain.setValueAtTime(gain * 0.65, end - 0.025);
  amp.gain.linearRampToValueAtTime(0, end);
  osc.connect(amp).connect(bus);
  osc.start(at);
  osc.stop(end + 0.02);
}

function drum(kind, at, bus) {
  if (kind === 'k') {
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.frequency.setValueAtTime(140, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.1);
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(0.2, at + 0.004);
    amp.gain.linearRampToValueAtTime(0, at + 0.12);
    osc.connect(amp).connect(bus);
    osc.start(at);
    osc.stop(at + 0.15);
  } else if (kind === 's') {
    noise(at, 0.09, { gain: 0.06, from: 1800, type: 'highpass', attack: 0.002, bus });
  } else if (kind === 'h') {
    noise(at, 0.03, { gain: 0.03, from: 7000, type: 'highpass', attack: 0.002, bus });
  }
}

let wantedSong = null;
let override = null; // a tune that takes over from whatever the screen wants (Parley's guitarist strikes up)
let fade = 0; // seconds to cross-fade the next change of tune; 0 is the usual quick cut
let playing = null; // { name, out, timer }
const bookmarks = new Map(); // where each song got to, so it carries on rather than restarting

function startSong(name) {
  const song = SONGS[name];
  if (!song || !audio || playing?.name === name) return;
  stopSong();

  // A song can bring its own band instead of the chiptune voices (see liars-sound.js):
  //   band: { lead(freq, at, seconds, out), bass(...), drums(token, at, out), fiddle(...), ... }
  // Each player in the band reads the track of the same name. Parts with no player get the usual bleeps.
  const band = song.band ?? {};
  const tracks = {};
  for (const part of new Set(['lead', 'bass', 'drums', ...Object.keys(band)])) if (song[part]) tracks[part] = parseTrack(song[part]);
  const length = tracks.lead.length;
  const out = audio.createGain();
  out.connect(musicBus);
  if (fade) {
    out.gain.setValueAtTime(0, audio.currentTime);
    out.gain.linearRampToValueAtTime(1, audio.currentTime + fade);
  }

  let index = bookmarks.get(name) ?? 0;
  let next = audio.currentTime + 0.12;

  const scheduleStep = (i, at) => {
    for (const [voice, tokens] of Object.entries(tracks)) {
      const token = tokens[i % tokens.length];
      if (token === '-' || token === '.') continue;
      if (voice === 'drums') {
        (band.drums ?? drum)(token, at, out);
        continue;
      }
      let held = 1;
      while (held < tokens.length && tokens[(i + held) % tokens.length] === '-') held++;
      const seconds = held * song.step * 0.92;
      if (band[voice]) band[voice](noteFrequency(token), at, seconds, out);
      else if (voice === 'lead') chip(noteFrequency(token), at, seconds, 'square', song.leadGain ?? 0.045, out);
      else chip(noteFrequency(token), at, seconds, 'triangle', 0.13, out);
    }
  };

  // Notes are scheduled a fraction of a second ahead, so stopping is instant.
  const pump = () => {
    if (next < audio.currentTime) next = audio.currentTime + 0.05; // fell behind (tab was hidden)
    while (next < audio.currentTime + 0.35) {
      scheduleStep(index, next);
      index = (index + 1) % length;
      next += song.step;
    }
    bookmarks.set(name, index - (index % song.bar)); // resume from the start of this bar
  };
  pump();
  playing = { name, out, timer: setInterval(pump, 90) };
}

function stopSong() {
  if (!playing) return;
  const { out, timer } = playing;
  playing = null;
  clearInterval(timer);
  out.gain.setTargetAtTime(0, audio.currentTime, fade ? fade / 3 : 0.06); // quick fade, no click (or a slow one, when asked)
  setTimeout(() => out.disconnect(), fade * 1000 + 700);
}

/** Play one of SONGS by name, or pass null for silence. */
export function music(name) {
  wantedSong = name;
  applyMusic();
}

/**
 * Let one tune take over from whatever the screens ask for, fading across over
 * `seconds`; pass null to fade back. (Parley: somebody pulls out a guitar.)
 */
export function musicOverride(name, seconds = 1) {
  if (override === name) return;
  override = name;
  fade = seconds;
  applyMusic();
}

function applyMusic() {
  if (!audio) return;
  const name = override ?? wantedSong;
  if (name) startSong(name);
  else stopSong();
  fade = 0;
}

// ---------------------------------------------------------------------------
// Narrator
// ---------------------------------------------------------------------------
//
// Each line arrives as { text, src }. `src` is an audio file the server has
// rendered with one of the Mac's voices (see src/speech.js). It is played
// through the same audio system as everything else, with a short fade at each
// end, so there is no click when a line starts or stops.
//
// A new line never chops off the one being spoken: it waits its turn, and if
// several pile up only the newest is kept. Music is turned down while he talks.
//
// If there is no `src` (not a Mac, or the render failed) it falls back to the
// browser's own speech engine.

let talking = false;
let queued = null; // the line waiting to be spoken
let voiceSource = null; // the audio currently playing, so it can be hushed
let voiceGain = null;

async function loadSpeech(src) {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    return await audio.decodeAudioData(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function playSpeech(buffer) {
  return new Promise((resolve) => {
    const now = audio.currentTime + 0.03;
    const end = now + buffer.duration;
    const src = audio.createBufferSource();
    const amp = audio.createGain();
    src.buffer = buffer;
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(1, now + 0.015);
    amp.gain.setValueAtTime(1, Math.max(now + 0.02, end - 0.05));
    amp.gain.linearRampToValueAtTime(0, end);
    src.connect(amp).connect(audio.destination);
    src.onended = resolve;
    src.start(now);
    voiceSource = src;
    voiceGain = amp;
  });
}

function pickBrowserVoice() {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const wanted = settings.voice?.toLowerCase();
  return (
    (wanted && voices.find((v) => v.name.toLowerCase().includes(wanted))) ||
    voices.find((v) => v.name.startsWith('Daniel') && v.lang === 'en-GB') ||
    voices.find((v) => v.lang === 'en-GB' && v.localService) ||
    voices.find((v) => v.lang?.startsWith('en')) ||
    null
  );
}

function browserSpeak(text) {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve();
    const line = new SpeechSynthesisUtterance(text);
    const voice = pickBrowserVoice();
    if (voice) line.voice = voice;
    line.onend = line.onerror = resolve;
    setTimeout(resolve, 3000 + text.length * 110); // in case the browser never reports the end
    synth.speak(line);
  });
}

async function speak(job) {
  talking = true;
  duck.gain.setTargetAtTime(0.3, audio.currentTime, 0.08);
  try {
    const buffer = await job.buffer;
    if (!settings.narrator) return;
    if (buffer) await playSpeech(buffer);
    else await browserSpeak(job.text);
  } finally {
    voiceSource = null;
    const next = queued;
    queued = null;
    // Skip a waiting line if it has gone stale; the screen has moved on.
    if (next && settings.narrator && Date.now() - next.at < 8000) {
      speak(next);
    } else {
      talking = false;
      duck.gain.setTargetAtTime(1, audio.currentTime, 0.15);
    }
  }
}

/** Speak a cue from the server: { text, src }. */
export function say(cue) {
  if (!audio || !settings.narrator || !cue?.text) return;
  // Start downloading straight away, even if the previous line is still playing.
  const job = { text: cue.text, at: Date.now(), buffer: cue.src ? loadSpeech(cue.src) : Promise.resolve(null) };
  if (talking) queued = job;
  else speak(job);
}

/** Stop the narrator mid-line (used when he is switched off). */
function hush() {
  queued = null;
  window.speechSynthesis?.cancel();
  if (voiceSource && voiceGain) {
    voiceGain.gain.cancelScheduledValues(audio.currentTime);
    voiceGain.gain.setTargetAtTime(0, audio.currentTime, 0.03);
    voiceSource.stop(audio.currentTime + 0.2);
  }
}
