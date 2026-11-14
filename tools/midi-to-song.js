// Turn a MIDI file into one of the game's songs (the text tracks in public/*-sound.js).
//
//   node tools/midi-to-song.js tune.mid            -> prints a song to paste into SONGS
//   node tools/midi-to-song.js tune.mid --name=bottle
//
// The game's bands play one note at a time per part, so the notes are shared
// out: the melody to the "lead", the low notes to the "bass", and the chords
// to up to three reeds, "chord1" to "chord3" (see below for how). It works on a
// piano part where both hands are in one track as well as on separate tracks.
// Notes are snapped to a grid of eighth notes (or sixteenths, if the tune needs
// them). Drums are left out.
//
//   node tools/midi-to-song.js tune.mid --notes   -> list the first notes, to see how it's built

import fs from 'node:fs';

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('Usage: node tools/midi-to-song.js <file.mid> [--name=bottle]');
  process.exit(1);
}
const name = flags.find((f) => f.startsWith('--name='))?.slice(7) ?? 'tune';
const data = fs.readFileSync(file);

// ----- reading the file -----

let at = 0;
const u8 = () => data[at++];
const u16 = () => (data[at++] << 8) | data[at++];
const u32 = () => ((data[at++] << 24) | (data[at++] << 16) | (data[at++] << 8) | data[at++]) >>> 0;
const str = (n) => data.toString('latin1', at, (at += n));
function vlq() {
  let n = 0;
  for (;;) {
    const b = u8();
    n = (n << 7) | (b & 0x7f);
    if (!(b & 0x80)) return n;
  }
}

if (str(4) !== 'MThd') throw new Error('Not a MIDI file.');
const headerLength = u32();
u16(); // format
const trackCount = u16();
const division = u16();
at = 8 + headerLength;
if (division & 0x8000) throw new Error('SMPTE timing is not supported.');
const ppq = division;

let tempo = 500000; // microseconds per quarter note (the first tempo in the file wins)
let tempoSet = false;
let meter = [4, 4];
const tracks = [];

for (let t = 0; t < trackCount; t++) {
  if (str(4) !== 'MTrk') throw new Error(`Track ${t + 1} is damaged.`);
  const end = u32() + at;
  let tick = 0;
  let status = 0;
  const open = new Map(); // "channel:pitch" -> note
  const notes = [];
  let label = '';
  while (at < end) {
    tick += vlq();
    let byte = data[at];
    if (byte & 0x80) {
      status = byte;
      at++;
    }
    const type = status & 0xf0;
    const channel = status & 0x0f;
    if (status === 0xff) {
      const meta = u8();
      const len = vlq();
      const body = data.subarray(at, at + len);
      at += len;
      if (meta === 0x51 && !tempoSet) {
        tempo = (body[0] << 16) | (body[1] << 8) | body[2];
        tempoSet = true;
      }
      if (meta === 0x58) meter = [body[0], 2 ** body[1]];
      if (meta === 0x03) label = body.toString('latin1');
    } else if (status === 0xf0 || status === 0xf7) {
      at += vlq();
    } else if (type === 0x90 || type === 0x80) {
      const pitch = u8();
      const velocity = u8();
      const k = `${channel}:${pitch}`;
      if (type === 0x90 && velocity > 0) {
        open.set(k, { pitch, start: tick, channel });
      } else if (open.has(k)) {
        const n = open.get(k);
        open.delete(k);
        n.end = tick;
        notes.push(n);
      }
    } else if (type === 0xc0 || type === 0xd0) at += 1;
    else at += 2; // the other channel messages carry two bytes
  }
  at = end;
  const melodic = notes.filter((n) => n.channel !== 9 && n.end > n.start); // channel 10 is drums
  if (melodic.length) tracks.push({ label, notes: melodic, mean: melodic.reduce((s, n) => s + n.pitch, 0) / melodic.length });
}
if (!tracks.length) throw new Error('No notes found.');

// ----- snapping to a grid -----

const eighth = ppq / 2;
const all = tracks.flatMap((t) => t.notes);
const offGrid = all.filter((n) => Math.abs(n.start / eighth - Math.round(n.start / eighth)) > 0.2).length / all.length;
const stepTicks = offGrid > 0.1 ? ppq / 4 : eighth;
const stepsPerBar = Math.round((meter[0] * (4 / meter[1]) * ppq) / stepTicks);
const lastTick = Math.max(...all.map((n) => n.end));
const steps = Math.ceil(lastTick / stepTicks / stepsPerBar) * stepsPerBar;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (p) => `${NAMES[p % 12]}${Math.floor(p / 12) - 1}`;

/** One part as tokens: a note where it starts, "-" while it's held, "." for silence. A later note cuts an earlier one short. */
function line(notes) {
  const out = Array(steps).fill('.');
  for (const n of [...notes].sort((a, b) => a.start - b.start)) {
    const s = Math.round(n.start / stepTicks);
    const e = Math.max(s + 1, Math.round(n.end / stepTicks));
    if (s >= steps) continue;
    out[s] = noteName(n.pitch);
    for (let i = s + 1; i < Math.min(e, steps); i++) out[i] = '-';
  }
  return out;
}

const bars = (tokens) => {
  const rows = [];
  for (let i = 0; i < tokens.length; i += stepsPerBar * 4) {
    const chunk = [];
    for (let b = i; b < Math.min(i + stepsPerBar * 4, tokens.length); b += stepsPerBar) chunk.push(tokens.slice(b, b + stepsPerBar).join(' '));
    rows.push(chunk.join(' | '));
  }
  return rows.join('\n       | ');
};

if (flags.includes('--notes')) {
  // A look inside: each track's first notes, in steps from the start.
  for (const [i, t] of tracks.entries()) {
    console.log(`track ${i + 1} ${t.label ? `(${t.label}) ` : ''}${t.notes.length} notes`);
    for (const n of t.notes.slice(Number(process.env.FROM ?? 0), Number(process.env.FROM ?? 0) + 60)) console.log(`  step ${(n.start / stepTicks).toFixed(2)}  ${noteName(n.pitch)}  for ${((n.end - n.start) / stepTicks).toFixed(2)}`);
  }
  process.exit(0);
}

// ----- sharing the notes out between the band -----
//
// Every note that starts on the same step is looked at together, whichever track it came from:
//   * the bass is the lowest of them, if it's down below the C an octave under middle C
//   * the melody is the highest, if it stands clear above the rest (a fifth or more) or plays alone, and isn't down in the left hand
//   * whatever is left is the chord, shared between up to three squeezebox reeds, lowest first
const BASS_BELOW = 48;
const CLEAR = 7;
const MELODY_FROM = 55; // the G below middle C: anything lower is the left hand, not the tune
const byStep = new Map();
for (const n of all) {
  const s = Math.round(n.start / stepTicks);
  if (!byStep.has(s)) byStep.set(s, []);
  byStep.get(s).push(n);
}
const parts = { lead: [], bass: [], chord1: [], chord2: [], chord3: [] };
for (const group of byStep.values()) {
  const rest = [...group].sort((a, b) => a.pitch - b.pitch);
  if (rest.length > 1 && rest[0].pitch < BASS_BELOW) parts.bass.push(rest.shift());
  else if (rest.length === 1 && rest[0].pitch < BASS_BELOW) parts.bass.push(rest.shift());
  const top = rest[rest.length - 1];
  const clear = rest.length === 1 || top?.pitch - rest[rest.length - 2]?.pitch >= CLEAR;
  if (top && top.pitch >= MELODY_FROM && clear) parts.lead.push(rest.pop());
  // Octaves add nothing on one reed: keep one of each note name, lowest first.
  const seen = new Set();
  const chord = rest.filter((n) => !seen.has(n.pitch % 12) && seen.add(n.pitch % 12));
  chord.slice(0, 3).forEach((n, i) => parts[`chord${i + 1}`].push(n));
}

const secondsPerStep = (tempo / 1e6) * (stepTicks / ppq);
let out = `SONGS.${name} = {\n  title: '${name}',\n  step: ${secondsPerStep.toFixed(3)},\n  bar: ${stepsPerBar},\n  band,\n`;
for (const [part, notes] of Object.entries(parts)) if (notes.length) out += `  ${part}: \`${bars(line(notes))}\`,\n`;
out += '};\n';
process.stdout.write(out);
console.error(`${tracks.length} tracks, ${steps / stepsPerBar} bars of ${meter[0]}/${meter[1]}, ${Math.round(60e6 / tempo)} bpm, a step is ${stepTicks === eighth ? 'an eighth' : 'a sixteenth'} note`);
