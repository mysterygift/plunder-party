// The narrator's voice.
//
// On a Mac the server renders each line to a small audio file using the
// built-in `say` command, and the TV page plays that file through the same
// audio system as the music. That gives much better voices than the browser's
// own speech engine, and clean fades instead of pops at the end of a line.
//
// On anything other than macOS this quietly does nothing and the TV page
// falls back to the browser's speech engine.

import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// One cache folder per port, so two copies of the server never trip over each other.
const CACHE_DIR = path.join(os.tmpdir(), `plunder-party-speech-${process.env.PORT || 3000}`);
const MAX_JOBS = 400;

export class Narrator {
  constructor() {
    this.jobs = new Map(); // id -> Promise<file path | null>
    this.voices = [];
    this.available = false;
    if (process.platform !== 'darwin') return;
    try {
      // Each line looks like:  Daniel (English (UK))   en_GB    # Hello! My name is Daniel.
      this.voices = execFileSync('say', ['-v', '?'], { encoding: 'utf8' })
        .split('\n')
        .map((line) => /^(.+?)\s+([a-z]{2,3}_[A-Za-z0-9]+)\s+#/.exec(line))
        .filter(Boolean)
        .map(([, name, locale]) => ({ name, locale }));
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      this.available = true;
    } catch {
      this.available = false;
    }
  }

  /** The server calls this once at start-up, so a change of system voice is picked up. */
  clearCache() {
    if (!this.available) return;
    fs.rmSync(CACHE_DIR, { recursive: true, force: true });
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  /**
   * Decide which voice to use.
   *   wanted = "system"  -> whatever is set as the Mac's system voice, which can be a Siri voice
   *   wanted = "Jamie"   -> the first installed voice whose name contains that
   *   otherwise          -> the best English voice installed: Premium, then Enhanced, then Daniel
   */
  pickVoice(wanted) {
    if (wanted === 'system') return null;
    if (wanted) {
      const match = this.voices.find((v) => v.name.toLowerCase().includes(String(wanted).toLowerCase()));
      if (match) return match.name;
    }
    const english = this.voices.filter((v) => v.locale.startsWith('en'));
    const british = english.filter((v) => v.locale === 'en_GB');
    return (
      british.find((v) => v.name.includes('(Premium)')) ??
      english.find((v) => v.name.includes('(Premium)')) ??
      british.find((v) => v.name.includes('(Enhanced)')) ??
      english.find((v) => v.name.includes('(Enhanced)')) ??
      british.find((v) => v.name.startsWith('Daniel')) ??
      british[0] ??
      english[0]
    )?.name ?? null;
  }

  /** Start rendering a line. Returns an id the TV can fetch it by, or null if unavailable. */
  prepare(text, wantedVoice) {
    if (!this.available) return null;
    const voice = this.pickVoice(wantedVoice);
    // `say` treats [[...]] as commands (pauses, speed changes); don't let players type those.
    const clean = String(text).replace(/\[\[|\]\]/g, ' ').slice(0, 600);
    const id = crypto.createHash('sha1').update(`${voice}\n${clean}`).digest('hex').slice(0, 16);
    if (!this.jobs.has(id)) {
      if (this.jobs.size >= MAX_JOBS) this.jobs.delete(this.jobs.keys().next().value);
      this.jobs.set(id, this.render(id, clean, voice));
    }
    return id;
  }

  /** Resolves with the audio file's path once it is ready (or null if it failed). */
  async file(id) {
    const file = await (this.jobs.get(id) ?? null);
    return file && fs.existsSync(file) ? file : null;
  }

  render(id, text, voice) {
    const file = path.join(CACHE_DIR, `${id}.wav`);
    if (fs.existsSync(file)) return Promise.resolve(file);
    return new Promise((resolve) => {
      const args = [...(voice ? ['-v', voice] : []), '-o', file, '--data-format=LEI16@44100'];
      const child = spawn('say', args, { stdio: ['pipe', 'ignore', 'ignore'] });
      const timeout = setTimeout(() => child.kill(), 15_000);
      child.on('error', () => resolve(null));
      child.on('close', (code) => {
        clearTimeout(timeout);
        // If a voice can't be saved to a file it leaves it empty or silent; treat that as a failure
        // so the TV falls back to the browser's voice instead of saying nothing.
        resolve(code === 0 && hasSound(file) ? file : null);
      });
      child.stdin.on('error', () => {});
      child.stdin.end(text); // the text goes in via stdin, never through a shell
    });
  }
}

/** True if the file exists and contains something louder than silence. */
function hasSound(file) {
  try {
    const bytes = fs.readFileSync(file);
    for (let i = 4096; i + 1 < bytes.length; i += 64) {
      if (Math.abs(bytes.readInt16LE(i)) > 400) return true;
    }
  } catch {
    // fall through
  }
  return false;
}
