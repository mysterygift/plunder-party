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
  knots: 'knots.json',
  knotsQuestions: 'knots-questions.json',
  brig: 'brig.json',
  lawyer: 'sea-lawyer.json',
  parley: 'parley.json',
  bottle: 'bottle.json',
  mutiny: 'mutiny.json',
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
    need(loc.kind === undefined || reckoning.kinds?.[loc.kind], `content/dead-reckoning.json: "${loc.name}" has the kind "${loc.kind}", which isn't one of the "kinds" at the top of the file.`);
  }
  need(Array.isArray(colours.ideas) && colours.ideas.length >= 6, 'content/colours.json needs at least 6 "ideas".');
  need(Array.isArray(colours.spareNames) && colours.spareNames.length >= 6, 'content/colours.json needs at least 6 "spareNames".');
  const { bombard } = content;
  for (const list of ['pirateShips', 'navyShips']) {
    need(Array.isArray(bombard[list]) && bombard[list].length >= 7, `content/bombard.json needs at least 7 "${list}".`);
  }
  checkStory(content.onepiece);
  checkLawyer(content.lawyer);
  need(Array.isArray(content.parley.prompts) && content.parley.prompts.length >= 10, 'content/parley.json needs at least 10 "prompts".');
  need(Array.isArray(content.bottle.ideas) && content.bottle.ideas.length >= 12, 'content/bottle.json needs at least 12 "ideas".');
  need(Array.isArray(content.parley.finalPrompts) && content.parley.finalPrompts.length >= 1, 'content/parley.json needs at least 1 "finalPrompts" entry.');
  checkQuestions(content.knotsQuestions);
  checkMutiny(content.mutiny);
  return content;
}

/** Sea Lawyer: every question needs a blank to fill, the real answer, and a few house lies. */
function checkLawyer(bank) {
  const file = 'content/sea-lawyer.json';
  need(Array.isArray(bank?.questions) && bank.questions.length >= 8, `${file} needs at least 8 "questions".`);
  bank.questions.forEach((x, i) => {
    const where = `${file}: question ${i + 1}`;
    need(typeof x.q === 'string' && x.q.includes('___'), `${where} needs a "q" with ___ where the answer goes.`);
    need(typeof x.a === 'string' && x.a.trim(), `${where} ("${x.q}") has no answer "a".`);
    need(Array.isArray(x.decoys) && x.decoys.length >= 3, `${where} ("${x.q}") needs at least three "decoys" (house lies).`);
  });
}

/** Mutiny: every topic needs enough watchwords to hide one among, and questions written for its kind. */
function checkMutiny(bank) {
  const file = 'content/mutiny.json';
  need(Array.isArray(bank?.topics) && bank.topics.length >= 6, `${file} needs at least 6 "topics".`);
  need(bank.questions && typeof bank.questions === 'object', `${file} needs "questions".`);
  const enough = (kind) => Array.isArray(bank.questions[kind]) && bank.questions[kind].filter((q) => typeof q === 'string' && q.trim()).length >= 6;
  need(enough('crew'), `${file} needs at least 6 "crew" questions (for the One of Us plot).`);
  const names = new Set();
  for (const topic of bank.topics) {
    const where = `${file}: topic "${topic?.name}"`;
    need(typeof topic?.name === 'string' && topic.name.trim(), `${file}: every topic needs a "name".`);
    need(!names.has(topic.name), `${where} is in the list twice.`);
    names.add(topic.name);
    need(topic.kind !== 'crew' && enough(topic.kind), `${where} has the kind "${topic.kind}", which needs at least 6 questions of its own under "questions".`);
    need(Array.isArray(topic.words) && topic.words.length >= 6 && topic.words.every((w) => typeof w === 'string' && w.trim()), `${where} needs at least 6 "words".`);
    need(new Set(topic.words.map((w) => w.trim().toLowerCase())).size === topic.words.length, `${where} has the same word twice.`);
  }
}

/** Knot So Fast: every question needs one right answer and three different wrong ones. */
function checkQuestions(bank) {
  const file = 'content/knots-questions.json';
  need(Array.isArray(bank?.categories), `${file} needs a list of "categories".`);
  let total = 0;
  for (const cat of bank.categories) {
    need(typeof cat.id === 'string' && typeof cat.name === 'string' && Array.isArray(cat.questions), `${file}: every category needs an "id", a "name" and a list of "questions".`);
    cat.questions.forEach((x, i) => {
      const where = `${file}: question ${i + 1} in "${cat.name}"`;
      need(typeof x.q === 'string' && x.q.trim(), `${where} has no "q".`);
      need(typeof x.a === 'string' && x.a.trim(), `${where} ("${x.q}") has no right answer "a".`);
      need(Array.isArray(x.wrong) && x.wrong.length === 3 && x.wrong.every((w) => typeof w === 'string' && w.trim()), `${where} ("${x.q}") needs exactly three "wrong" answers.`);
      need(new Set([x.a, ...x.wrong].map((a) => a.trim().toLowerCase())).size === 4, `${where} ("${x.q}") has the same answer twice.`);
      total++;
    });
  }
  need(total >= 60, `${file} needs at least 60 questions (it has ${total}).`);
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
