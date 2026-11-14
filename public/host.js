// The big screen. It receives a "view" from the server and draws it.
// Each entry in `screens` turns one kind of view into HTML.

import { esc, fmt, connect, post, startTimers, ask, dismissQuestion } from './common.js';
import * as sound from './sound.js';
import { flagTag } from './flag.js';
import * as diorama from './bombard-host.js';
import * as diceTable from './liars-host.js';
import * as captainsLog from './onepiece-host.js';
import * as regatta from './knots-host.js';
import * as chartTable from './reckoning-host.js';
import * as bowView from './tb-host.js';
import * as court from './lawyer-host.js';
import * as beach from './parley-host.js';
import * as lagoon from './bottle-host.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const screenEl = $('screen');

let view = null;
let players = new Map();
let lastKey = null;
let qr = { url: null, svg: '' };

// ---------------------------------------------------------------------------
// Small drawing helpers
// ---------------------------------------------------------------------------

// The screen is redrawn from scratch whenever anything changes, so entrance
// animations need care: `anim` remembers when each element first appeared and
// resumes its animation mid-flight (or skips it) on later redraws.
const firstSeen = new Map();

function age(id) {
  const now = performance.now();
  if (!firstSeen.has(id)) firstSeen.set(id, now);
  return now - firstSeen.get(id);
}

function anim(id, name = 'pop', delay = 0, duration = 600, extraStyle = '') {
  const elapsed = age(id);
  if (elapsed > delay + duration + 60) return extraStyle ? ` style="${extraStyle}"` : '';
  return ` data-anim="${name}" style="animation-delay:${Math.round(delay - elapsed)}ms;animation-duration:${duration}ms;${extraStyle}"`;
}

/** A number that counts up from one value to another. */
function count(id, from, to, delay = 0, duration = 1200) {
  age(id);
  return `<span data-count="${id}" data-from="${from}" data-to="${to}" data-delay="${delay}" data-duration="${duration}">${fmt(from)}</span>`;
}

function tickCounters() {
  for (const el of document.querySelectorAll('[data-count]')) {
    const { count: id, from, to, delay, duration } = el.dataset;
    const t = Math.min(1, Math.max(0, (age(id) - delay) / duration));
    const eased = 1 - (1 - t) ** 3;
    el.textContent = fmt(Math.round(Number(from) + (to - from) * eased));
  }
  followRules();
  requestAnimationFrame(tickCounters);
}

// A long list of rules can run off the bottom of the telly. As each rule
// appears, glide the intro up just far enough to keep it on screen. The shift
// lives out here so a redraw (which rebuilds the intro) carries on smoothly.
let introShift = 0;
function followRules() {
  const intro = screenEl.firstElementChild;
  const items = intro?.querySelectorAll('.rules li[data-at]');
  if (!items?.length) {
    introShift = 0;
    return;
  }
  let last = null;
  for (const li of items) if (age(li.dataset.rule) >= Number(li.dataset.at)) last = li;
  let target = 0;
  if (last) {
    const scale = stage.getBoundingClientRect().width / 1920;
    const over = (last.getBoundingClientRect().bottom - screenEl.getBoundingClientRect().bottom) / scale;
    target = Math.max(0, over + introShift + 40); // 40px of breathing room under the last rule
  }
  introShift += (target - introShift) * 0.1;
  if (Math.abs(target - introShift) < 0.5) introShift = target;
  intro.style.transform = introShift ? `translateY(${-introShift.toFixed(1)}px)` : '';
}

function chip(id, { cls = '', label = true } = {}) {
  const p = players.get(id);
  if (!p) return '';
  return `<span class="chip ${cls}" style="--c:${p.color}"><span class="face"><span>${p.avatar}</span></span>${label ? `<span class="nm">${esc(p.name)}</span>` : ''}</span>`;
}

/**
 * Text that writes itself on, a letter at a time, like a pen crossing the page.
 * Each letter is wiped in from the left; words stay whole so lines wrap normally.
 */
function inked(id, text, start = 0, perLetter = 42) {
  const elapsed = age(id);
  let n = 0;
  return String(text)
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s*$/.test(part)) return part ? ' ' : '';
      const letters = [...part].map((ch) => `<span class="ink" style="animation-delay:${Math.round(start + n++ * perLetter - elapsed)}ms">${esc(ch)}</span>`).join('');
      n++; // a beat for the space
      return `<span class="ink-word">${letters}</span>`;
    })
    .join('');
}

const isRetro = () => view?.game === 'scuttlebutt';

/** A retro desktop window (used for everything in Scuttlebutt). */
function win(title, body, cls = '') {
  return `<div class="win ${cls}"${anim(`win-${cls}`, 'pop', 0, 350)}>
    <div class="win-bar"><span class="win-title">${title}</span><span class="win-btns"><i>–</i><i>□</i><i class="x">×</i></span></div>
    <div class="win-body">${body}</div>
  </div>`;
}

const framed = (title, body, cls) => (isRetro() ? win(title, body, cls) : body);

function progress(list) {
  return `<div class="progress">${list
    .map((x) => {
      const pips = Array.from({ length: x.of }, (_, i) => `<i class="${i < x.done ? 'on' : ''}"></i>`).join('');
      return `<span class="prog ${x.done >= x.of ? 'done' : ''}">${chip(x.id)}<span class="pips">${pips}</span></span>`;
    })
    .join('')}</div>`;
}

const voteHint = (v) => `<p class="hint">Vote on your phone! <span class="tally">${v.voted.length} in</span></p>`;

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

const screens = {
  blank: () => '',

  lobby(v) {
    const chosen = v.games.find((g) => g.id === v.selected);
    const captain = players.get(v.vip);
    const short = chosen ? Math.max(0, chosen.min - v.players.length) : 0;

    const games = v.games
      .map(
        (g, i) => `<button class="game ${g.id === v.selected ? 'on' : ''}" data-act="select" data-game="${g.id}"${anim(`g${g.id}`, 'rise', 250 + i * 130)}>
          <span class="game-icon">${g.icon}</span>
          <span class="game-name">${esc(g.name)}</span>
          <span class="game-tag">${esc(g.tagline)}</span>
          <span class="game-min">${g.min === 1 ? 'Any crew size' : `${g.min}+ pirates`}</span>
        </button>`,
      )
      .join('');

    let cta;
    if (!chosen) {
      cta = `<p class="hint">${captain ? `Captain ${esc(captain.name)}: pick a game on your phone` : 'Waiting for the first pirate to come aboard…'}</p>`;
    } else if (short) {
      cta = `<p class="blurb">${esc(chosen.blurb)}</p><p class="hint">Need ${short} more pirate${short > 1 ? 's' : ''} for this one</p>`;
    } else {
      cta = `<p class="blurb">${esc(chosen.blurb)}</p><button class="btn big" data-act="start">Set sail!</button>`;
    }

    // Once anyone has banked doubloons, the crew lines up richest first: the overall leaderboard.
    const best = Math.max(0, ...v.players.map((p) => p.total));
    const roster = best ? [...v.players].sort((a, b) => b.total - a.total) : v.players;
    const crew = v.players.length
      ? roster
          .map(
            (p) => `<span class="crew-slot ${p.away ? 'away' : ''} ${best && p.total === best ? 'lead' : ''}" data-act="kick" data-id="${p.id}" title="Click to remove ${esc(p.name)}"${anim(`p${p.id}`, 'pop')}>
              ${chip(p.id)}${best ? `<span class="tally">💰 ${p.total.toLocaleString('en')}</span>` : ''}${p.id === v.vip ? '<span class="badge">Captain</span>' : ''}${p.wins ? `<span class="badge gold">🏆 ${p.wins}</span>` : ''}
            </span>`,
          )
          .join('')
      : '<span class="hint">No pirates aboard yet</span>';

    return `<div class="lobby">
      <div class="lobby-main">
        <h1 class="title huge"${anim('title', 'drop', 0, 900)}>${esc(v.title)}</h1>
        <p class="tagline">${esc(v.tagline)}</p>
        <div class="games">${games}</div>
        <div class="cta">${cta}</div>
      </div>
      <aside class="join parch"${anim('join', 'from-right', 200, 700)}>
        <h2>Join the crew</h2>
        <div class="qr">${qr.svg}</div>
        <p>Scan with your phone camera, or open</p>
        <p class="url">${esc(v.urls.display)}</p>
        <p class="small">in your browser, on the same wifi</p>
      </aside>
      <div class="crew">${crew}</div>
    </div>`;
  },

  intro(v) {
    let at = 1300 + v.name.length * 70;
    const rules = v.rules
      .map((rule, i) => {
        const html = `<li data-rule="rule${i}" data-at="${at}"${anim(`rule${i}`, 'rise', at, 500)}>${esc(rule)}</li>`;
        at += rule.length * 62 + 300;
        return html;
      })
      .join('');
    return framed(
      `${v.icon} ${esc(v.name)} Setup Wizard`,
      `<div class="intro">
        <div class="intro-icon"${anim('icon', 'pop', 0, 600)}>${v.icon}</div>
        <h1 class="title huge"${anim('name', 'slam', 200, 600)}>${esc(v.name)}</h1>
        <p class="tagline">${esc(v.tagline)}</p>
        <ol class="rules">${rules}</ol>
      </div>`,
      'wide',
    );
  },

  writing(v) {
    return framed(
      `✏️ ${esc(v.title)}`,
      `<div class="writing">
        <h1 class="title"${anim('t', 'drop', 0, 600)}>${esc(v.title)}</h1>
        ${v.prompt ? `<div class="prompt parch"${anim('p', 'pop', 300)}>${esc(v.prompt)}</div>` : ''}
        <p class="lead">${esc(v.text)}</p>
        ${v.note ? `<p class="note">${esc(v.note)}</p>` : ''}
        ${progress(v.progress)}
      </div>`,
      'wide',
    );
  },

  'bs-duel'(v) {
    const r = v.result;
    const side = (i) => {
      const text = v.answers[i];
      const won = r && r.winner === i;
      const lost = r && r.winner >= 0 && r.winner !== i;
      const card = `<div class="answer parch ${text === null ? 'blank' : ''}"${lost ? anim(`sink${i}`, 'sink', 1500, 900) : ''}>${text === null ? 'No answer. Lost at sea.' : esc(text)}</div>`;
      const meta = r
        ? `<div class="votes">${r.votes[i].map((id, n) => `<span${anim(`v${i}-${n}`, 'pop', 250 + n * 160, 400)}>${chip(id, { label: false })}</span>`).join('')}</div>
           <div class="duel-meta"${anim(`m${i}`, 'rise', 1100, 500)}>${chip(r.authors[i])}<span class="gain">+${fmt(r.gains[i])}</span></div>`
        : '';
      return `<div class="duel-side ${won ? 'won' : ''} ${lost ? 'lost' : ''}"${anim(`a${i}`, i ? 'from-right' : 'from-left', i * 300, 600)}>${card}${meta}</div>`;
    };
    return `<div class="duel">
      <div class="prompt parch"${anim('p', 'drop', 0, 600)}>${esc(v.prompt)}</div>
      ${v.step === 'nobody' ? '<p class="lead">Nobody answered. This one sinks without a trace.</p>' : ''}
      ${v.answers ? `<div class="duel-row">${side(0)}<div class="vs"${anim('vs', 'slam', 500, 500)}>VS</div>${side(1)}</div>` : ''}
      ${v.step === 'vote' ? voteHint(v) : ''}
      ${r?.sweep ? `<div class="stamp"${anim('stamp', 'slam', 1300, 500)}>Broadside!</div>` : ''}
      ${r?.forfeit ? `<div class="stamp small"${anim('stamp', 'slam', 900, 500)}>Wins by forfeit</div>` : ''}
      ${r && !r.forfeit && r.winner < 0 ? `<div class="stamp small"${anim('stamp', 'slam', 900, 500)}>${r.votes[0].length ? 'Dead heat' : 'No votes!'}</div>` : ''}
    </div>`;
  },

  // A grid of answers to vote on, then the same grid with the results.
  gallery(v) {
    const n = v.cards.length;
    const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    const result = v.step === 'result';
    const cards = v.cards
      .map((c, i) => {
        const body =
          c.twist !== undefined
            ? `<div class="tw"><p class="tw-setup">${esc(c.setup)}</p><p class="tw-twist">${esc(c.twist)}</p><p class="tw-bridge">${esc(c.bridge)}</p><p class="tw-answer ${c.style === 'diary' ? 'hand' : ''}">${c.style === 'diary' ? esc(c.answer) : `“${esc(c.answer)}”`}</p></div>`
            : `<p class="g-text">${esc(c.text)}</p>`;
        const foot = result
          ? `<div class="g-foot"${anim(`foot${c.id}`, 'rise', 400 + i * 260, 450)}>
              <span class="g-author">${c.authorLabel ? `<em>${esc(c.authorLabel)}</em>` : ''}${chip(c.author)}</span>
              <span class="g-votes">${c.votes.map((id) => chip(id, { label: false })).join('')}</span>
              <span class="gain">+${fmt(c.gain)}</span>
            </div>`
          : '';
        return `<div class="g-card ${isRetro() ? 'os-card' : 'parch'} ${result && c.best ? 'best' : ''}"${anim(`card${c.id}`, 'pop', i * 90, 450)}>${body}${foot}</div>`;
      })
      .join('');
    return `<div class="gallery ${result ? 'is-result' : ''}" style="--cols:${cols};--rows:${rows}">
      <h1 class="title small">${esc(v.title)}</h1>
      ${v.prompt ? `<div class="prompt parch slim">${esc(v.prompt)}</div>` : ''}
      <div class="g-grid">${cards}</div>
      ${v.step === 'vote' ? voteHint(v) : ''}
    </div>`;
  },

  'sb-round'(v) {
    return win(
      `${v.icon} ${esc(v.window)}`,
      `<div class="sb-round">
        <div class="sb-round-icon"${anim('i', 'pop', 200)}>${v.icon}</div>
        <p class="os-kicker">Round ${v.number}${v.double ? ' · double doubloons' : ''}</p>
        <h1 class="os-h1">${esc(v.name)}</h1>
        <p class="os-lead">${esc(v.intro)}</p>
        <div class="os-loading"><i></i></div>
      </div>`,
      'mid',
    );
  },

  'sb-show'(v) {
    const c = v.card;
    return win(
      `${c.icon} ${esc(c.window)}`,
      `<div class="sb-show">
        <p class="sb-setup"${anim('s', 'fade', 0, 400)}>${esc(c.setup)}</p>
        <p class="sb-twist"${anim('t', 'slam', 500, 450)}>${esc(c.twist)}</p>
        ${
          v.step >= 2
            ? `<div class="sb-reply"${anim('r', 'rise', 0, 500)}>
                <p class="sb-bridge">${esc(c.bridge)}</p>
                ${
                  c.style === 'diary'
                    ? `<div class="sb-diary">${chip(c.victim)}<p class="sb-hand">${inked('hand', c.answer, 700)}</p></div>`
                    : `<div class="sb-post">${chip(c.victim)}<p class="sb-answer">“${esc(c.answer)}”</p></div>`
                }
              </div>`
            : ''
        }
      </div>`,
      'wide',
    );
  },

  scores(v) {
    const max = Math.max(1, ...v.rows.map((r) => r.score));
    const rows = v.rows
      .map((r, i) => {
        const gain = r.score - r.prev;
        return `<div class="score-row"${anim(`row${r.id}`, 'from-left', i * 110, 500)}>
          <span class="rank">${r.rank}</span>
          ${chip(r.id)}
          <span class="score-bar"><i${anim(`bar${r.id}`, 'grow', 500 + i * 110, 1300, `width:${Math.max(1.5, (r.score / max) * 100)}%`)}></i></span>
          <span class="score-num">${count(`num${r.id}`, r.prev, r.score, 500 + i * 110, 1300)}</span>
          <span class="gain">${gain > 0 ? `+${fmt(gain)}` : ''}</span>
        </div>`;
      })
      .join('');
    return framed('💰 Loot.xls', `<div class="scores ${v.rows.length > 7 ? 'dense' : ''}"><h1 class="title">${esc(v.title)}</h1><div class="score-list">${rows}</div></div>`, 'wide');
  },

  gameover(v) {
    const top = v.rows[0]?.score ?? 0;
    const winners = v.winners
      .map((id) => `<div class="winner">${chip(id, { label: false })}<div class="winner-name">${esc(players.get(id)?.name)}</div></div>`)
      .join('');
    const rest = v.rows
      .filter((r) => !v.winners.includes(r.id))
      .map((r, i) => `<span class="rest-row"${anim(`rest${r.id}`, 'rise', 1600 + i * 150, 450)}><b>${r.rank}</b>${chip(r.id)}<span>${fmt(r.score)}</span></span>`)
      .join('');
    return framed(
      '🏆 Winner.exe',
      `<div class="gameover">
        <p class="kicker"${anim('k', 'fade', 0, 600)}>The treasure goes to…</p>
        <div class="winners"${anim('w', 'slam', 900, 700)}>${winners}</div>
        <p class="winner-score"${anim('s', 'rise', 1500, 500)}>💰 ${fmt(top)} doubloons</p>
        <div class="rest">${rest}</div>
        <button class="btn" data-act="continue"${anim('b', 'fade', 3000, 600)}>Back to port</button>
      </div>`,
      'wide',
    );
  },

  // Flying Colours: one ship on parade. Step 1 hoists the flag, step 2 names
  // the ship, step 3 (the round's winner) adds who made it.
  'fc-show'(v) {
    const s = v.ship;
    const who = (label, id, nobody) => `<span class="fc-who"><em>${label}</em>${id ? chip(id) : `<span class="nm">${nobody}</span>`}</span>`;
    return `<div class="fc-show">
      <div class="fc-mast"${anim('mast', 'fade', 0, 500)}>
        <div class="fc-hoist"${anim('flag', 'hoist', 150, 1700)}>${flagTag(s.flag, '', true)}</div>
      </div>
      <p class="kicker">${esc(v.teaser)}</p>
      ${v.step >= 2 ? `<div class="fc-plate"${anim('plate', 'slam', 0, 500)}>${esc(s.name)}</div>` : '<div class="fc-plate ghost">? ? ?</div>'}
      ${
        v.step === 3
          ? `<div class="fc-credits"${anim('credits', 'rise', 900, 500)}>
              ${who('launched by', s.captain)}${who('flag by', s.artist, 'found in the hold')}${who('named by', s.author, 'the ship’s parrot')}
              <span class="gain">+${fmt(s.gain)}</span>
            </div>`
          : ''
      }
    </div>`;
  },

  // Flying Colours: the whole fleet side by side, to vote on and then with the results.
  'fc-fleet'(v) {
    const n = v.ships.length;
    const cols = n <= 3 ? n : n === 4 ? 2 : n <= 6 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    const result = v.step === 'result';
    const name = (id, nobody) => esc(players.get(id)?.name ?? nobody);
    const ships = v.ships
      .map((s, i) => {
        const foot = result
          ? `<div class="g-foot"${anim(`foot${s.id}`, 'rise', 400 + i * 220, 450)}>
              <span class="g-author">${chip(s.captain)}</span>
              <span class="g-votes">${s.votes.map((id) => chip(id, { label: false })).join('')}</span>
              <span class="gain">+${fmt(s.gain)}</span>
            </div>
            <p class="fc-made"${anim(`made${s.id}`, 'fade', 700 + i * 220, 450)}>🎨 ${name(s.artist, 'the hold')} · ✍️ ${name(s.author, 'the parrot')}</p>`
          : '';
        return `<div class="fc-ship parch ${result && s.best ? 'best' : ''}"${anim(`ship${s.id}`, 'pop', i * 90, 450)}>
          <div class="fc-ship-flag">${flagTag(s.flag)}</div>
          <p class="fc-ship-name">${esc(s.name)}</p>
          ${foot}
        </div>`;
      })
      .join('');
    return `<div class="gallery fc-fleet ${result ? 'is-result' : ''}" style="--cols:${cols};--rows:${rows}">
      <h1 class="title small">${esc(v.title)}</h1>
      <div class="g-grid">${ships}</div>
      ${v.step === 'vote' ? voteHint(v) : ''}
    </div>`;
  },

  // LiAARRRRGH's Dice: the table is a 3D model drawn behind this; these are the words over it (see liars-host.js).
  ...diceTable.liarsScreens({ anim, chip, player: (id) => players.get(id) }),

  // Find the One Piece: the captain's log, beside a 3D island drawn behind it (see onepiece-host.js).
  ...captainsLog.onePieceScreens({ anim, chip, inked }),

  // Knot So Fast: the race is a 3D model drawn behind this; these are the sheets between races (see knots-host.js).
  ...regatta.knotsScreens({ anim, chip }),

  // Dead Reckoning: the map is a 3D model drawn behind this; these are the clues and the results (see reckoning-host.js).
  ...chartTable.reckoningScreens({ anim, chip, progress }),

  // To the Brig with Ye: the view from the bow is a 3D model drawn behind this; these are the words over it (see tb-host.js).
  ...bowView.brigScreens({ anim, chip, player: (id) => players.get(id) }),

  // Sea Lawyer: the court's desk and the open lexicon are a 3D model drawn behind this (see lawyer-host.js).
  ...court.lawyerScreens({ anim, chip, progress }),

  // Parley: the beach, the bonfire and the crew's figures are a 3D model drawn behind this (see parley-host.js).
  ...beach.parleyScreens({ anim, chip }),

  // Message in a Bottle: the islands and the drifting bottles are a 3D model drawn behind this (see bottle-host.js).
  ...lagoon.bottleScreens({ anim, chip }),

  // Bombard!: the battle itself is a 3D model drawn behind this (see bombard-host.js).
  // These are just the words along the top: the two sides and their crews.
  bombard(v) {
    const ready = new Set(v.ready ?? []);
    const side = (s, i) => {
      const crew = s.crew
        .map((id) => `<span class="bb-hand ${ready.has(id) ? 'ready' : ''} ${s.lost.includes(id) ? 'lost' : ''}">${chip(id, { label: s.crew.length <= 4 })}</span>`)
        .join('');
      const vital = s.board.pieces.filter((p) => p.kind !== 'knob'); // the knob is a bonus, not a piece you must sink
      const afloat = vital.filter((p) => !p.sunk).length;
      const what = s.id === 'kraken' ? `${afloat} of ${vital.length} pieces left` : `${afloat} afloat`;
      return `<div class="bb-side s${i} ${v.winner === s.id ? 'won' : ''}" data-side="${s.id}"${anim(`side${s.id}`, i ? 'from-right' : 'from-left', 0, 600)}>
          <h2><span>${s.icon}</span> ${esc(s.name)} <small>${what}</small></h2>
          <div class="bb-crew">${crew}</div>
        </div>`;
    };
    const stats = (v.stats ?? [])
      .map((st, i) => `<p class="bb-stat"${anim(`stat${i}`, 'rise', 2500 + i * 500, 500)}><em>${esc(st.label)}</em> ${st.players.map((id) => chip(id)).join(' ')} <b>${esc(st.value)}</b></p>`)
      .join('');
    return `<div class="bb-hud" data-mode="${v.mode}" data-phase="${v.phase}">
      ${v.sides.map(side).join('')}
      <div class="bb-head">
        <h1${anim(`head-${v.headline}`, 'drop', 0, 500)}>${esc(v.headline ?? '')}</h1>
        <p>${esc(v.sub ?? '')}</p>
        ${stats}
      </div>
    </div>`;
  },

};

// ---------------------------------------------------------------------------
// Drawing a view
// ---------------------------------------------------------------------------

let lastSay = 0;
const OWN_AMBIENCE = ['sl', 'pa', 'mb']; // screens whose diorama makes its own background sounds (see ambience.js)
let lastSfx = 0;
let lastDone = 0;
let heard = null; // what the screen looked like last time, for spotting changes

function render(v) {
  if (view && !!view.game !== !!v.game) dismissQuestion(); // a game began or ended behind the popup
  view = v;
  players = new Map(v.players.map((p) => [p.id, p]));
  if (v.key !== lastKey) {
    firstSeen.clear();
    lastKey = v.key;
    lastDone = 0;
  }

  document.title = `${v.title} · Big Screen`;
  document.body.classList.toggle('retro', isRetro());
  document.body.classList.toggle('in-game', !!v.game);
  document.body.dataset.screen = v.screen;
  document.body.dataset.game = v.game ?? '';
  $('barTitle').textContent = v.game ? `${v.gameIcon} ${v.gameName}` : '';
  $('paused').hidden = !v.paused;

  if (v.urls.join !== qr.url) {
    qr = { url: v.urls.join, svg: '' };
    fetch('/api/qr.svg').then((r) => r.text()).then((svg) => {
      qr.svg = svg;
      if (view.screen === 'lobby') render(view);
    });
  }

  screenEl.innerHTML = (screens[v.screen] ?? screens.blank)(v);

  if (v.screen === 'bombard') diorama.show(v, players);
  else diorama.hide();
  if (v.screen === 'ld-table') diceTable.show(v, players);
  else diceTable.hide();
  if (v.screen === 'op') captainsLog.show(v, players);
  else captainsLog.hide();
  if (v.screen?.startsWith('kn-')) regatta.show(v, players);
  else regatta.hide();

  if (v.screen?.startsWith('dr-')) chartTable.show(v, players);
  else chartTable.hide();
  if (v.screen === 'tb') bowView.show(v);
  else bowView.hide();
  if (v.screen === 'sl') court.show(v);
  else court.hide();
  if (v.screen === 'pa') beach.show(v, players);
  else beach.hide();
  if (v.screen === 'mb') lagoon.show(v, players);
  else lagoon.hide();

  // Toast (errors such as "needs 3 pirates" or a typo in a content file)
  $('toast').hidden = !v.toast;
  if (v.toast) $('toast').textContent = v.toast.text;

  // Sound cues
  sound.settings.voice = v.narrator?.voice ?? null;
  // Music plays while people are thinking: the lobby tune, or the current game's own shanty.
  const thinking = ['lobby', 'writing', 'dr-guess'].includes(v.screen) && !v.paused;
  sound.music(thinking ? (v.game ?? 'lobby') : (v.music ?? null)); // a view can also ask for a tune by name
  if (!v.say) lastSay = 0;
  else if (v.say.id !== lastSay) {
    lastSay = v.say.id;
    sound.say(v.say);
  }
  if (!v.sfx) lastSfx = 0;
  else if (v.sfx.id !== lastSfx) {
    lastSfx = v.sfx.id;
    sound.play(v.sfx.name);
  }
  // Sounds the big screen works out for itself, by noticing what changed.
  const done = (v.progress ?? []).reduce((n, x) => n + x.done, 0);
  const was = heard;
  heard = { crew: v.players.length, done, paused: !!v.paused, toast: v.toast?.id ?? 0, selected: v.selected ?? null, lobby: v.screen === 'lobby' };
  if (was) {
    if (heard.crew > was.crew) sound.play('board'); // boots on the gangplank
    else if (heard.crew < was.crew) sound.play('splash'); // someone walked the plank
    if (done > lastDone) sound.play('cork'); // an answer has been bottled
    if (heard.paused !== was.paused) sound.play(heard.paused ? 'anchor' : 'pipe');
    if (heard.toast && heard.toast !== was.toast) sound.play('horn');
    if (heard.lobby && was.lobby && heard.selected !== was.selected) sound.play('knock');
  }
  sound.background(!v.paused && !OWN_AMBIENCE.includes(v.screen));
  lastDone = done;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const hostAction = (body) => post('/api/host', body);

screenEl.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, game, id } = el.dataset;
  if (act === 'kick') {
    const name = players.get(id)?.name ?? 'this pirate';
    const sure = await ask({ title: `Make ${name} walk the plank?`, text: 'This removes them from the crew. They can join again from their phone.', yes: 'Walk the plank', no: 'Let them stay' });
    if (!sure) return;
  }
  hostAction({ type: act, game, id });
});

const saved = JSON.parse(localStorage.getItem('plunder-audio') ?? '{}');
Object.assign(sound.settings, { sound: saved.sound ?? true, music: saved.music ?? true, narrator: saved.narrator ?? true });

function refreshControls() {
  for (const key of ['sound', 'music', 'narrator']) {
    document.querySelector(`[data-ctl="${key}"]`).classList.toggle('off', !sound.settings[key]);
  }
  localStorage.setItem('plunder-audio', JSON.stringify(sound.settings));
  sound.applySettings();
}

function control(name) {
  switch (name) {
    case 'pause': return hostAction({ type: 'pause' });
    case 'skip': return hostAction({ type: 'skip' });
    case 'end':
      if (!view?.game) return;
      return ask({ title: 'Abandon ship?', text: 'This ends the game and takes everyone back to port. The scores go overboard.', yes: 'End the game', no: 'Keep playing' }).then((sure) => {
        if (sure) hostAction({ type: 'end' });
      });
    case 'fullscreen':
      return document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    case 'sound':
    case 'music':
    case 'narrator':
      sound.settings[name] = !sound.settings[name];
      return refreshControls();
  }
}

$('controls').addEventListener('click', (e) => {
  const button = e.target.closest('[data-ctl]');
  if (button) control(button.dataset.ctl);
});

const KEYS = { ' ': 'skip', p: 'pause', Escape: 'end', f: 'fullscreen', s: 'sound', m: 'music', n: 'narrator' };
document.addEventListener('keydown', (e) => {
  const name = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (!name || e.metaKey || e.ctrlKey || e.altKey) return;
  e.preventDefault();
  control(name);
});

// Sound can only start after a click, so the first click "raises the curtain".
$('curtain').addEventListener('click', () => {
  sound.unlock();
  $('curtain').remove();
  refreshControls();
});
// ...and any real click or key press after that wakes the sound up, in case the
// browser held it back (a curtain lifted by a script doesn't count as a click).
for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, () => sound.unlock(), { capture: true });

// ---------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------

function fitStage() {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
}
window.addEventListener('resize', fitStage);
fitStage();

setInterval(() => {
  $('deskClock').textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}, 1000);

window.sfx = (name) => (sound.unlock(), sound.play(name)); // try effects from the console: sfx('gulls')
window.sfxList = sound.effectNames;

refreshControls();
tickCounters();
startTimers(() => view, (left) => {
  if (left > 0 && left <= 5) sound.play('tick');
});
connect(() => 'role=host', render);
