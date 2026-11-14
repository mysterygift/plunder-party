// Loads the editable party content from the content/ folder.
// Content is re-read every time a game starts, so you can tweak prompts
// between games without restarting the server.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shuffle } from './util.js';

export const CONTENT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content');

const FILES = {
  party: 'party.json',
  broadside: 'broadside.json',
  scuttlebutt: 'scuttlebutt.json',
  reckoning: 'dead-reckoning.json',
  colours: 'colours.json',
  bombard: 'bombard.json',
  liars: 'liars-dice.json',
};

function readJson(file) {
  const full = path.join(CONTENT_DIR, file);
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    // Surface typos in a hand-edited file as a readable message on the TV.
    throw new Error(`Problem in content/${file}: ${err.message}`);
  }
}

function need(condition, message) {
  if (!condition) throw new Error(message);
}

export function loadContent() {
  const content = {};
  for (const [key, file] of Object.entries(FILES)) content[key] = readJson(file);

  const { broadside, scuttlebutt, reckoning, colours } = content;
  need(Array.isArray(broadside.prompts) && broadside.prompts.length >= 12, 'content/broadside.json needs at least 12 "prompts".');
  need(Array.isArray(broadside.finalPrompts) && broadside.finalPrompts.length >= 1, 'content/broadside.json needs at least 1 "finalPrompts" entry.');
  need(Array.isArray(scuttlebutt.rounds) && scuttlebutt.rounds.length >= 1, 'content/scuttlebutt.json needs at least 1 round.');
  for (const round of scuttlebutt.rounds) {
    need(Array.isArray(round.questions) && round.questions.length >= 12, `content/scuttlebutt.json: round "${round.name}" needs at least 12 questions.`);
  }
  need(Array.isArray(reckoning.locations) && reckoning.locations.length >= 1, 'content/dead-reckoning.json needs at least 1 location.');
  for (const loc of reckoning.locations) {
    need(typeof loc.lat === 'number' && typeof loc.lng === 'number', `content/dead-reckoning.json: "${loc.name}" needs numeric "lat" and "lng".`);
    need(Array.isArray(loc.clues) && loc.clues.length >= 1, `content/dead-reckoning.json: "${loc.name}" needs at least 1 clue.`);
  }
  need(Array.isArray(colours.ideas) && colours.ideas.length >= 6, 'content/colours.json needs at least 6 "ideas".');
  need(Array.isArray(colours.spareNames) && colours.spareNames.length >= 6, 'content/colours.json needs at least 6 "spareNames".');
  const { bombard } = content;
  for (const list of ['pirateShips', 'navyShips']) {
    need(Array.isArray(bombard[list]) && bombard[list].length >= 7, `content/bombard.json needs at least 7 "${list}".`);
  }
  return content;
}

/**
 * A shuffled deck that remembers what it has already dealt (across games in
 * the same session), so prompts don't repeat until the deck runs out.
 */
export class Deck {
  constructor(items, used) {
    this.items = items;
    this.used = used; // Set of keys, owned by the room so it outlives one game
    this.pile = [];
  }

  static key(item) {
    return typeof item === 'string' ? item : item.name ?? JSON.stringify(item);
  }

  draw() {
    if (this.pile.length === 0) {
      let fresh = this.items.filter((item) => !this.used.has(Deck.key(item)));
      if (fresh.length === 0) {
        this.used.clear();
        fresh = this.items;
      }
      this.pile = shuffle(fresh);
    }
    const item = this.pile.pop();
    this.used.add(Deck.key(item));
    return item;
  }
}

/**
 * Swap placeholders in a prompt:
 *   {player} -> a random player's name (different names if used twice)
 *   {star}   -> the guest of honour from content/party.json
 */
export function fillPlaceholders(text, playerNames, star) {
  const names = shuffle(playerNames);
  let i = 0;
  return String(text)
    .replace(/\{player\}/g, () => names[i++ % names.length] ?? 'someone')
    .replace(/\{star\}/g, star || 'the Captain');
}
