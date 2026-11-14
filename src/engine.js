// The game engine: one "room" (the party), its players, and whichever game is
// currently running.
//
// How it fits together
// --------------------
// * Every screen (the TV and each phone) holds one long-lived connection to
//   the server and simply draws whatever "view" the server last sent it.
//   All game state lives here on the server; the screens are dumb.
// * A game is an async function. It calls ctx.screen(...) to say what the TV
//   and the phones should show, then `await ctx.wait(...)` until a timer runs
//   out or everybody has answered. That makes each game read top-to-bottom
//   like a script - see src/games/*.js.

import crypto from 'node:crypto';
import { loadContent, Deck, fillPlaceholders } from './content.js';
import { cleanText, sample } from './util.js';
import * as broadside from './games/broadside.js';
import * as scuttlebutt from './games/scuttlebutt.js';
import * as reckoning from './games/reckoning.js';
import * as colours from './games/colours.js';
import * as bombard from './games/bombard.js';
import * as liars from './games/liars.js';

export const GAMES = [broadside, scuttlebutt, colours, reckoning, bombard, liars];

const AVATARS = ['🦜', '🐙', '🦀', '🦈', '🐬', '🐢', '🦑', '🐡', '🦞', '🐳', '🐒', '🦩'];
const COLORS = ['#e4572e', '#17bebb', '#ffc914', '#76b041', '#b388eb', '#f78fb3', '#4ea8de', '#ff9f1c', '#2ec4b6', '#e56b6f', '#9bc53d', '#c9ada7'];
const MAX_PLAYERS = AVATARS.length;
// For testing: SPEED=20 npm start makes every timer run 20x faster.
const SPEED = Number(process.env.SPEED) > 0 ? Number(process.env.SPEED) : 1;
const AWAY_AFTER_MS = 8000; // a phone that has been gone this long no longer holds up the game

/** Thrown inside a game when the host ends it early. */
export class Aborted extends Error {}

// Whole phrases, not bare growls: text-to-speech voices clip a lone "Arr!" into a grunt.
// "Ahrr" is spelled that way on purpose: the voice reads "Arr" as "air". These are only ever spoken.
const DEFAULT_SIGNOFFS = ['Yarr, me hearties!', 'Ahrr, matey!', 'Yo ho ho!', 'Shiver me timbers!', 'Aye aye, captain!', 'Ahoy there!', 'Heave ho!', 'Thar she blows!', 'Savvy?'];

const WATCH = { screen: 'wait', icon: '👀', text: 'Eyes on the big screen!' };

// ---------------------------------------------------------------------------
// Room
// ---------------------------------------------------------------------------

export class Room {
  constructor({ getUrls, narrator = null }) {
    this.getUrls = getUrls; // a function, so the address stays right if the wifi changes
    this.narrator = narrator; // renders the narrator's lines to audio (see src/speech.js)
    this.players = [];
    this.clients = new Set();
    this.game = null; // { def, ctx } while a game is running
    this.selected = null;
    this.toast = null;
    this.toastId = 0;
    this.usedDecks = new Map();
    this.assets = new Map(); // bulky things (drawings) that screens fetch by id; see GameContext.stash
    this.pushQueued = false;
    try {
      this.content = loadContent();
    } catch (err) {
      console.error(`\n  ⚠  ${err.message}\n`);
      this.content = { party: {} };
      this.flash(err.message);
    }
  }

  get party() {
    return this.content.party ?? {};
  }

  // ----- connections -----

  addClient(client) {
    this.clients.add(client);
    const p = client.player;
    if (p) {
      p.conns++;
      p.away = false;
      clearTimeout(p.awayTimer);
    }
    this.push();
  }

  removeClient(client) {
    this.clients.delete(client);
    const p = client.player;
    if (p && --p.conns <= 0) {
      p.conns = 0;
      clearTimeout(p.awayTimer);
      p.awayTimer = setTimeout(() => {
        p.away = true;
        this.game?.ctx.poke();
        this.push();
      }, AWAY_AFTER_MS);
    }
  }

  playerByToken(token) {
    return token ? this.players.find((p) => p.token === token) : undefined;
  }

  vip() {
    return this.players.find((p) => !p.away) ?? this.players[0];
  }

  // ----- joining -----

  join(rawName, token) {
    const existing = this.playerByToken(token);
    if (existing) return { token: existing.token };

    let name = cleanText(rawName, 12);
    if (!name) return { error: 'Ye need a name, sailor.' };
    if (this.players.length >= MAX_PLAYERS) return { error: 'The ship is full!' };

    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${cleanText(rawName, 10)} ${n}`;

    const player = {
      id: crypto.randomUUID().slice(0, 8),
      token: crypto.randomUUID(),
      name,
      avatar: AVATARS.find((a) => !this.players.some((p) => p.avatar === a)),
      color: COLORS.find((c) => !this.players.some((p) => p.color === c)),
      score: 0,
      wins: 0,
      conns: 0,
      away: false,
      awayTimer: null,
    };
    this.players.push(player);
    this.push();
    return { token: player.token };
  }

  // ----- actions -----

  /** Something tapped on a phone. */
  playerAction(player, msg) {
    if (this.game) {
      if (this.game.ctx.players.includes(player)) this.game.ctx.act(player, msg);
      return;
    }
    if (msg.type === 'avatar') {
      const free = AVATARS.filter((a) => a === player.avatar || !this.players.some((p) => p.avatar === a));
      player.avatar = free[(free.indexOf(player.avatar) + 1) % free.length];
    } else if (player === this.vip()) {
      if (msg.type === 'select') this.select(msg.game);
      if (msg.type === 'start') this.startGame();
    }
    this.push();
  }

  /** Something clicked or pressed on the laptop running the TV screen. */
  hostAction(msg) {
    const ctx = this.game?.ctx;
    switch (msg.type) {
      case 'select': this.select(msg.game); break;
      case 'start': this.startGame(); break;
      case 'skip': ctx?.skip(); break;
      case 'pause': ctx?.togglePause(); break;
      case 'end': ctx?.abort(); break;
      case 'continue': ctx?.act(null, { type: 'continue' }); break;
      case 'kick':
        if (!this.game) {
          const gone = this.players.find((p) => p.id === msg.id);
          this.players = this.players.filter((p) => p !== gone);
          if (gone) gone.token = null;
          for (const c of this.clients) if (c.player === gone) c.player = null;
        }
        break;
    }
    this.push();
  }

  select(id) {
    if (!this.game && GAMES.some((g) => g.meta.id === id)) this.selected = id;
  }

  flash(text) {
    const toast = { id: ++this.toastId, text };
    this.toast = toast;
    setTimeout(() => {
      if (this.toast === toast) {
        this.toast = null;
        this.push();
      }
    }, 7000);
    this.push();
  }

  // ----- running a game -----

  async startGame() {
    if (this.game) return;
    const def = GAMES.find((g) => g.meta.id === this.selected);
    if (!def) return this.flash('Pick a game first.');
    if (this.players.length < def.meta.min) {
      return this.flash(`${def.meta.name} needs at least ${def.meta.min} pirates aboard.`);
    }
    try {
      this.content = loadContent(); // pick up any edits made since the last game
    } catch (err) {
      return this.flash(err.message);
    }

    this.assets.clear();
    const ctx = new GameContext(this, def, [...this.players]);
    this.game = { def, ctx };
    for (const p of ctx.players) p.score = 0;
    try {
      await def.run(ctx);
    } catch (err) {
      if (!(err instanceof Aborted)) {
        console.error(err);
        this.flash(`The game hit a reef: ${err.message}`);
      }
    } finally {
      ctx.abort();
      this.game = null;
      this.push();
    }
  }

  /** The narrator ends every line with a pirate word (set "signoffs" in party.json; [] turns it off). */
  withSignOff(text) {
    const signoffs = this.party.narrator?.signoffs ?? DEFAULT_SIGNOFFS;
    if (!Array.isArray(signoffs) || signoffs.length === 0) return text;
    const line = /[.!?…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
    return `${line} ${sample(signoffs)}`;
  }

  speechUrl(text) {
    const id = this.narrator?.prepare(text, this.party.narrator?.voice);
    return id ? `/api/speech/${id}.wav` : null;
  }

  usedFor(deckName) {
    if (!this.usedDecks.has(deckName)) this.usedDecks.set(deckName, new Set());
    return this.usedDecks.get(deckName);
  }

  // ----- views -----

  publicPlayer(p) {
    return { id: p.id, name: p.name, avatar: p.avatar, color: p.color, score: p.score, wins: p.wins, away: p.away };
  }

  gameList() {
    return GAMES.map((g) => g.meta);
  }

  hostView() {
    const base = {
      role: 'host',
      title: this.party.title ?? 'Plunder Party',
      tagline: this.party.tagline ?? '',
      players: this.players.map((p) => this.publicPlayer(p)),
      vip: this.vip()?.id ?? null,
      urls: this.getUrls(),
      toast: this.toast,
      narrator: this.party.narrator ?? null,
    };
    if (!this.game) {
      return { ...base, screen: 'lobby', key: 'lobby', games: this.gameList(), selected: this.selected };
    }
    const { ctx, def } = this.game;
    const view = { ...base, game: def.meta.id, gameName: def.meta.name, gameIcon: def.meta.icon, endsAt: ctx.endsAt, paused: ctx.paused, say: ctx.say, sfx: ctx.sfx, ...ctx.current.host() };
    view.key ??= view.screen;
    return view;
  }

  playerView(player) {
    const title = this.party.title ?? 'Plunder Party';
    if (!player) return { role: 'player', screen: 'join', key: 'join', title, inGame: !!this.game };

    const vip = this.vip();
    const base = { role: 'player', title, me: this.publicPlayer(player), isVip: player === vip };
    if (!this.game) {
      const chosen = GAMES.find((g) => g.meta.id === this.selected)?.meta;
      return {
        ...base,
        screen: 'lobby',
        key: 'lobby',
        vipName: vip?.name,
        games: this.gameList(),
        selected: this.selected,
        crew: this.players.length,
        short: chosen ? Math.max(0, chosen.min - this.players.length) : 0,
      };
    }
    const { ctx, def } = this.game;
    if (!ctx.players.includes(player)) {
      return { ...base, screen: 'wait', key: 'spectator', icon: '🔭', text: `${def.meta.name} is under way. You'll be dealt in for the next game!` };
    }
    const view = { ...base, game: def.meta.id, gameName: def.meta.name, endsAt: ctx.endsAt, paused: ctx.paused, ...ctx.current.player(player) };
    view.key ??= view.screen;
    return view;
  }

  /** Send every connected screen its latest view (batched once per tick). */
  push() {
    if (this.pushQueued) return;
    this.pushQueued = true;
    setImmediate(() => {
      this.pushQueued = false;
      const t = Date.now();
      let hostView;
      for (const client of this.clients) {
        try {
          const view = client.role === 'host' ? (hostView ??= this.hostView()) : this.playerView(client.player);
          client.send({ t, view });
        } catch (err) {
          console.error('Could not build a view:', err);
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------
// GameContext: the toolbox handed to each game's run() function
// ---------------------------------------------------------------------------

class GameContext {
  constructor(room, def, players) {
    this.room = room;
    this.meta = def.meta;
    this.players = players;
    this.content = room.content;
    this.current = { host: () => ({ screen: 'blank' }), player: () => WATCH, onAction: null };
    this.say = null; // { id, text } - a line for the TV's narrator to read out
    this.sfx = null; // { id, name } - a sound effect for the TV to play
    this.cueId = 0;
    this.endsAt = null; // when the on-screen countdown hits zero (ms since epoch)
    this.paused = false;
    this.pausedAt = 0;
    this.pending = null; // the wait() currently in progress
    this.aborted = false;
    this.shownScores = new Map(players.map((p) => [p, 0]));
  }

  // ----- content helpers -----

  deck(name, items) {
    return new Deck(items, this.room.usedFor(`${this.meta.id}:${name}`));
  }

  fill(text) {
    return fillPlaceholders(text, this.players.map((p) => p.name), this.content.party?.guestOfHonour);
  }

  /** Seconds for a timer, overridable from the game's content file. */
  seconds(name, fallback) {
    const custom = this.content[this.meta.id]?.seconds?.[name];
    return (Number(custom) > 0 ? Number(custom) : fallback) * 1000;
  }

  /**
   * Park something bulky (a drawing) on the server and get back an id for it.
   * Views carry just the id; screens fetch the real thing once from /api/asset/<id>.
   */
  stash(data) {
    const id = crypto.randomBytes(8).toString('hex');
    this.room.assets.set(id, data);
    return id;
  }

  // ----- screens -----

  /**
   * Set what everyone sees.
   *   host()      -> data for the TV
   *   player(p)   -> data for one phone (defaults to "look at the big screen")
   *   onAction    -> called with (player, message) when a phone sends something
   *   say / sfx   -> optional narrator line / sound effect for the TV
   */
  screen({ host, player, onAction, say, sfx }) {
    this.current = { host, player: player ?? (() => WATCH), onAction: onAction ?? null };
    if (say && this.meta.narrator !== false) { // a game can ask for no narrator at all (meta.narrator: false)
      const text = this.room.withSignOff(say);
      this.say = { id: ++this.cueId, text, src: this.room.speechUrl(text) };
    }
    if (sfx) this.sfx = { id: ++this.cueId, name: sfx };
    this.room.push();
  }

  update() {
    this.room.push();
  }

  /**
   * Pause the game script for `ms`, or until `until()` becomes true
   * (it is re-checked after every player action).
   *   timer: true  -> show a countdown on every screen
   */
  wait(ms, { until = null, timer = false } = {}) {
    if (this.aborted) return Promise.reject(new Aborted());
    if (until?.()) return Promise.resolve();
    ms /= SPEED;
    return new Promise((resolve, reject) => {
      const pending = { until, reject, remaining: ms, startedAt: Date.now(), handle: null };
      pending.finish = () => {
        clearTimeout(pending.handle);
        if (this.pending === pending) this.pending = null;
        if (timer) this.endsAt = null;
        resolve();
      };
      this.pending = pending;
      const from = this.paused ? this.pausedAt : Date.now();
      if (timer) this.endsAt = from + ms;
      if (!this.paused) pending.handle = setTimeout(pending.finish, ms);
      this.room.push();
    });
  }

  /** For countdowns that span several wait() calls. */
  startClock(ms) {
    this.endsAt = (this.paused ? this.pausedAt : Date.now()) + ms / SPEED;
  }

  stopClock() {
    this.endsAt = null;
  }

  /** True once a player's phone has been disconnected for a while. */
  away(player) {
    return player.away;
  }

  act(player, msg) {
    this.current.onAction?.(player, msg);
    this.poke();
    this.room.push();
  }

  poke() {
    if (this.pending?.until?.()) this.pending.finish();
  }

  skip() {
    this.pending?.finish();
  }

  togglePause() {
    const now = Date.now();
    const pending = this.pending;
    if (!this.paused) {
      this.paused = true;
      this.pausedAt = now;
      if (pending?.handle) {
        clearTimeout(pending.handle);
        pending.handle = null;
        pending.remaining -= now - pending.startedAt;
      }
    } else {
      this.paused = false;
      if (this.endsAt) this.endsAt += now - this.pausedAt;
      if (pending) {
        pending.startedAt = now;
        pending.handle = setTimeout(pending.finish, Math.max(0, pending.remaining));
      }
    }
    this.room.push();
  }

  abort() {
    this.aborted = true;
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      clearTimeout(pending.handle);
      pending.reject(new Aborted());
    }
  }

  // ----- scores -----

  award(player, points) {
    player.score += points;
  }

  /** Sorted scores, including what each player had last time we showed them. */
  standings() {
    const sorted = [...this.players].sort((a, b) => b.score - a.score);
    const rows = sorted.map((p) => ({
      id: p.id,
      score: p.score,
      prev: this.shownScores.get(p) ?? 0,
      rank: 1 + sorted.findIndex((q) => q.score === p.score),
    }));
    for (const p of this.players) this.shownScores.set(p, p.score);
    return rows;
  }

  // ----- screens every game shares -----

  async intro(rules) {
    const { name, tagline, icon } = this.meta;
    this.screen({
      say: `${name}. ${rules.join(' ')}`,
      sfx: 'whistle',
      host: () => ({ screen: 'intro', key: 'intro', name, tagline, icon, rules }),
      player: () => ({ screen: 'wait', icon, text: `${name} is about to begin…` }),
    });
    await this.wait(5000 + rules.join(' ').length * 62);
  }

  async scoreboard(title, ms = 9000) {
    const rows = this.standings();
    this.screen({
      say: title,
      sfx: 'chest',
      host: () => ({ screen: 'scores', key: `scores-${title}`, title, rows }),
      player: (p) => {
        const row = rows.find((r) => r.id === p.id);
        return { screen: 'wait', key: `scores-${title}`, icon: '💰', text: `${row.score.toLocaleString('en')} doubloons`, sub: `${ordinal(row.rank)} place` };
      },
    });
    await this.wait(ms);
  }

  async gameOver() {
    const rows = this.standings();
    const winners = this.players.filter((p) => p.score === rows[0].score);
    for (const p of winners) p.wins++;
    const names = winners.map((p) => p.name).join(' and ');
    let done = false;
    this.screen({
      say: `${names} ${winners.length > 1 ? 'share' : 'takes'} the treasure!`,
      sfx: 'finale',
      host: () => ({ screen: 'gameover', key: 'gameover', rows, winners: winners.map((p) => p.id) }),
      player: (p) => {
        const row = rows.find((r) => r.id === p.id);
        return {
          screen: 'gameover',
          won: winners.includes(p),
          rank: ordinal(row.rank),
          score: row.score,
          canContinue: p === this.room.vip(),
        };
      },
      onAction: (p, msg) => {
        if (msg.type === 'continue' && (p === null || p === this.room.vip())) done = true;
      },
    });
    await this.wait(10 * 60 * 1000, { until: () => done });
  }
}

export function ordinal(n) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}
