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
  onepiece: 'one-piece.json',
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
  checkStory(content.onepiece);
  return content;
}

/** Find the One Piece: make sure the story holds together before anyone is halfway up a volcano. */
function checkStory(story) {
  const file = 'content/one-piece.json';
  const bands = ['diabolical', 'bad', 'neutral', 'good', 'perfect'];
  need(Array.isArray(story.scenes) && story.scenes.length >= 1, `${file} needs at least 1 scene.`);
  const ids = new Set(story.scenes.map((s) => s.id));
  const real = (id) => id === 'ending' || ids.has(id);
  need(ids.has(story.start), `${file}: "start" must name one of the scenes.`);
  need(story.kit && story.woes && story.title && story.fight?.moves && story.fight?.endings, `${file} needs "title", "kit", "woes" and "fight".`);
  const kit = (list, where) => { for (const id of list ?? []) need(story.kit[id], `${file}: ${where} mentions kit "${id}", which is not in "kit".`); };
  const checkOutcome = (o, where) => {
    need(typeof o?.text === 'string' && o.text, `${file}: ${where} needs "text".`);
    kit(o.gain, where);
    for (const id of o.woe ?? []) need(story.woes[id], `${file}: ${where} mentions woe "${id}", which is not in "woes".`);
    need(!o.next || real(o.next), `${file}: ${where} goes to "${o.next}", which is not a scene.`);
  };
  for (const scene of story.scenes) {
    const where = `scene "${scene.id}"`;
    need(typeof scene.entry === 'string' && scene.header?.day, `${file}: ${where} needs an "entry" and a "header" with a "day".`);
    if (!scene.options) {
      need(real(scene.next), `${file}: ${where} needs a "next" that is a scene (or "ending").`);
      continue;
    }
    need(scene.options.length >= 2, `${file}: ${where} needs at least 2 options.`);
    for (const band of bands) {
      checkOutcome(scene.outcomes?.[band], `${where}, outcome "${band}"`);
      need(real(scene.outcomes[band].next ?? scene.next), `${file}: ${where}, outcome "${band}" has nowhere to go next.`);
    }
    scene.options.forEach((option, i) => {
      const at = `${where}, option ${i + 1}`;
      need(option.text && option.lead && ['canny', 'bold', 'daft'].includes(option.mark), `${file}: ${at} needs "text", "lead" and a "mark" of canny, bold or daft.`);
      kit([option.needs, option.spends, option.unless].filter(Boolean), at);
      for (const [band, o] of Object.entries(option.outcomes ?? {})) {
        need(bands.includes(band), `${file}: ${at} has an outcome called "${band}".`);
        checkOutcome(o, `${at}, outcome "${band}"`);
      }
    });
  }
  for (const band of bands) need(Array.isArray(story.endings?.[band]?.entry) && story.endings[band].header?.day, `${file}: ending "${band}" needs an "entry" list and a "header".`);
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
