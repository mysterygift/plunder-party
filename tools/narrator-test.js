// Hear how the narrator's voice says things, out loud, through this laptop.
//
//   npm run narrator                    -> reads every sign-off from content/party.json, one by one
//   npm run narrator -- 'Ahoy!' 'Avast!' -> reads those phrases instead, numbered
//                                          (single quotes, or zsh chokes on the "!")
//
// Handy for spotting a pirate phrase the voice mangles: note its number and
// delete it from "signoffs" in content/party.json.

import { spawnSync } from 'node:child_process';
import { loadContent } from '../src/content.js';
import { Narrator } from '../src/speech.js';

if (process.platform !== 'darwin') {
  console.log('This uses the macOS `say` command, so it only works on a Mac.');
  process.exit(0);
}

const { narrator: settings = {} } = loadContent().party;
const voice = new Narrator().pickVoice(settings.voice);
const speak = (text) => spawnSync('say', voice ? ['-v', voice] : [], { input: text });

console.log(`\n  Voice: ${voice ?? 'your Mac’s system voice'}\n`);

// Anything typed after the command is read instead of the sign-offs, one phrase per quoted argument.
const custom = process.argv.slice(2).map((text) => text.trim()).filter(Boolean);
const phrases = custom.length ? custom : (settings.signoffs ?? []);
if (!phrases.length) console.log('  No "signoffs" are set in content/party.json.\n');
phrases.forEach((phrase, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. ${phrase}`);
  speak(`Number ${i + 1}. ${custom.length ? '' : 'The treasure is buried. '}${phrase}`);
});
console.log('');
