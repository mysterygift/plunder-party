// Find the One Piece on the big screen: the captain's log.
//
// The log page sits on the left third of the screen and is ordinary HTML,
// drawn here. The island fills the rest and is a 3D model, drawn behind the
// page by onepiece-world.js.
//
// A scene moves through phases, and the page has two "sides" to hold them:
//   entry, vote                   -> the entry, then the options to vote on
//   chosen, roll, tally, outcome  -> what was chosen, the dice, the scale, and what came of it
// The page is redrawn from scratch whenever anything changes, so every piece
// that animates has a name: host.js remembers when each name first appeared
// and picks its animation up where it had got to.

import { esc } from './common.js';
import { dieTag, dieBack } from './liars-play.js';
import { sealTag } from './onepiece-play.js';
import * as world from './onepiece-world.js';
import * as sound from './sound.js';
import './onepiece-sound.js';

const BANDS = ['diabolical', 'bad', 'neutral', 'good', 'perfect'];
const INK_SPEED = 38; // ms per letter; src/games/onepiece.js times each page by the same number

// ---------------------------------------------------------------------------
// Showing and hiding (the two functions host.js calls), and the page's own sounds
// ---------------------------------------------------------------------------
//
// Nothing in this game is read aloud, so the page makes its own noise: a quill
// scratches for as long as it is writing, and each die clicks as it lands.

let heard = { page: null, dice: 0 };
let quill = null; // the timer for the next scratch

function stopWriting() {
  clearTimeout(quill);
  quill = null;
}

/** Scratch away for as long as `letters` take to write, starting after `delay` ms. */
function write(letters, delay) {
  stopWriting();
  const until = performance.now() + delay + letters * INK_SPEED;
  const scratch = () => {
    if (performance.now() >= until) return stopWriting();
    sound.play('opWrite', { level: 0.55 });
    quill = setTimeout(scratch, 800);
  };
  quill = setTimeout(scratch, delay);
}

export function show(view, players) {
  world.show(view, players);

  // A new piece of writing has started: what is it, and when does the pen touch the page?
  const page = `${view.key}:${view.phase}:${view.ending?.step ?? ''}:${view.paused ? 'paused' : ''}`;
  if (page !== heard.page) {
    heard.page = page;
    const [text, delay] =
      view.phase === 'title' ? [view.cover.kept, 2600]
      : view.phase === 'entry' ? [view.entry.join(' '), 500]
      : view.phase === 'chosen' ? [view.lead, 500]
      : view.phase === 'outcome' ? [view.outcome.join(' '), 1300]
      : view.phase === 'ending' && !view.ending.other ? [view.ending.paras.at(-1), 500]
      : ['', 0];
    if (text && !view.paused) write(text.length, delay);
    else stopWriting();
  }

  const landed = view.phase === 'roll' ? view.roll.dice.filter((d) => d.n !== null).length : 0;
  if (landed > heard.dice) sound.play('opDie');
  heard.dice = landed;
}

export function hide() {
  stopWriting();
  heard = { page: null, dice: 0 };
  world.hide();
}

// ---------------------------------------------------------------------------
// Little ink drawings for the margin: one for each piece of kit and each woe
// ---------------------------------------------------------------------------

const GLYPHS = {
  stick: 'M8 33 L19 19 L31 7 M19 19 l6 1 M13 27 l-4 -1',
  rum: 'M11 10 Q20 6 29 10 V30 Q20 34 11 30 Z M11 16 Q20 13 29 16 M11 24 Q20 27 29 24 M20 8 V32',
  pan: 'M8 16 H32 V26 Q32 31 27 31 H13 Q8 31 8 26 Z M5 16 H35 M32 20 h5 M8 20 h-5 M15 11 q2 -3 0 -6 M24 11 q2 -3 0 -6',
  'map-whole': 'M7 11 l9 -3 l8 3 l9 -3 V29 l-9 3 l-8 -3 l-9 3 Z M16 8 V29 M24 11 V32 M26 17 l4 4 m0 -4 l-4 4',
  'map-torn': 'M7 11 l9 -3 l3 1 l-2 5 l3 4 l-3 5 l2 6 l-2 -1 l-9 3 Z M24 10 l9 -2 V29 l-9 3 l-2 -6 l3 -5 l-3 -4 Z M27 16 l4 4 m0 -4 l-4 4',
  'map-chewed': 'M7 11 l9 -3 l6 2 q-4 3 0 6 q-5 3 -1 7 q-4 3 0 7 l-5 -1 l-9 3 Z M11 16 l3 3 m0 -3 l-3 3',
  'high-ground': 'M4 32 L17 13 L24 23 L28 18 L36 32 Z M17 13 V5 l7 2.5 l-7 2.5',
  lookout: 'M6 27 l15 -9 l3 5 l-15 9 Z M21 18 l8 -5 l2 4 l-8 5 M29 13 l5 -3',
  welcome: 'M10 13 H26 V28 Q26 32 22 32 H14 Q10 32 10 28 Z M26 17 h3 q4 0 4 4 q0 4 -4 4 h-3 M15 9 q2 -2 0 -5 M21 9 q2 -2 0 -5',
  friends: 'M20 32 C5 22 8 8 20 15 C32 8 35 22 20 32 Z',
  secret: 'M8 33 L30 8 M30 8 Q35 21 19 27 M30 8 Q17 7 13 21 M16 24 h-5 M21 18 l-6 -1',
  soggy: 'M20 5 Q9 20 13 27 Q20 35 27 27 Q31 20 20 5 Z M16 24 q1 4 5 4',
  marinated: 'M5 16 Q18 13 30 16 Q28 28 18 28 Q9 28 7 21 Z M30 16 q6 -1 5 3 q-1 4 -6 5 M13 33 h11 M15 9 q2 -2 0 -5',
  tea: 'M13 6 V34 M9 6 V14 Q9 18 13 18 Q17 18 17 14 V6 M27 34 V6 Q33 10 33 21 H27',
  bitten: 'M7 13 q3 6 6 0 q3 6 6 0 q3 6 6 0 q3 6 6 0 M7 28 q3 -6 6 0 q3 -6 6 0 q3 -6 6 0 q3 -6 6 0',
  singed: 'M20 5 Q31 17 27 26 Q25 34 20 34 Q11 34 12 24 Q12 19 16 16 Q16 22 20 22 Q23 17 20 5 Z',
};

const glyph = (id) => `<svg class="op-glyph" viewBox="0 0 40 40"><path d="${GLYPHS[id] ?? 'M8 20 H32'}"/></svg>`;

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/** host.js hands over its drawing helpers (see the top of that file for what each does). */
export function onePieceScreens({ anim, chip, inked }) {
  /** The ruled header every page of a ship's log has. Here it is mostly for jokes. */
  const header = (h) => `<div class="op-head">
      ${[['Day', h.day], ['Wind', h.wind], ['Course', h.course], ['Remarks', h.remarks]]
        .map(([label, value], i) => `<div class="op-cell"><small>${label}</small><span${anim(`head${i}`, 'fade', 150 + i * 220, 500)}>${esc(value)}</span></div>`)
        .join('')}
    </div>`;

  /** Kit and woes, drawn in the margin at the foot of the page. */
  function stores(v) {
    const item = (x, cls) => `<span class="op-item ${cls}" title="${esc(x.note ?? '')}"${x.fresh ? anim(`item-${x.id}`, 'pop', 600, 500) : ''}>${glyph(x.id)}<i>${esc(x.name)}</i></span>`;
    if (!v.kit.length && !v.woes.length) return '<div class="op-stores"></div>';
    return `<div class="op-stores">
      ${v.kit.length ? `<div class="op-shelf"><small>Stores</small>${v.kit.map((x) => item(x, 'kit')).join('')}</div>` : ''}
      ${v.woes.length ? `<div class="op-shelf woes"><small>Woes</small>${v.woes.map((x) => item(x, 'woe')).join('')}</div>` : ''}
    </div>`;
  }

  /** The options, written into the entry as alternatives. Once one is chosen the rest are struck through. */
  function options(v, small) {
    const decided = v.options.some((o) => o.chosen !== null);
    return `<ol class="op-options ${small ? 'small' : ''}">${v.options
      .map((o, i) => {
        const votes = o.votes.map((id) => `<span${anim(`vote-${id}`, 'pop', 0, 350)}>${chip(id, { label: false })}</span>`).join('');
        const cls = !decided ? '' : o.chosen ? 'chosen' : 'struck';
        return `<li class="${cls}"${small ? '' : anim(`option${i}`, 'rise', 200 + i * 260, 450)}>
          <span class="op-what"><span class="op-text">${esc(o.text)}</span><i class="op-mark ${esc(o.mark)}">${esc(o.markName)}</i></span>
          <span class="op-votes">${votes}</span>
        </li>`;
      })
      .join('')}</ol>`;
  }

  /** "×1.15", for a crew that agreed. */
  const times = (boost) => `×${boost.toFixed(2).replace(/0$/, '')}`;

  /**
   * The dice as they land, one beside each pirate, and the running total.
   * Once all hands have rolled, a crew of one mind sees its total multiplied.
   */
  function dice(r) {
    const men = r.dice
      .map((d) => {
        const die = d.n === null ? dieBack('waiting') : `<span${anim(`die-${d.id}`, 'op-drop', 0, 600)}>${dieTag(d.n)}</span>`;
        return `<span class="op-man ${d.cat ? 'cat' : ''}">${chip(d.id, { label: r.count <= 4 })}${die}${d.cat ? '<em>🐈</em>' : ''}</span>`;
      })
      .join('');
    const landed = r.dice.filter((d) => d.n !== null).length;
    const all = landed === r.count;
    const boosted = r.boost > 1;
    const caption = !all ? `${landed} of ${r.count} rolled` : boosted ? `${r.sum} ${times(r.boost)}` : 'All hands';
    const shown = all ? r.total : r.sum;
    return `<div class="op-dice ${r.count > 4 ? 'dense' : ''}">${men}</div>
      <p class="op-sum ${all && boosted ? 'boosted' : ''}"><small>${caption}</small><b>${shown || '–'}</b></p>`;
  }

  /**
   * The scale: five zones of equal width, each marked with the totals that land
   * in it. From the tally onwards a marker slides along to the crew's total.
   */
  function scale(v) {
    const r = v.roll;
    const { min, max, cuts } = r.scale;
    const lows = [min, ...cuts.map((c) => c + 1)];
    const highs = [...cuts, max];
    const zones = BANDS.map((band, i) => {
      const off = r.canny && (i === 0 || i === 4);
      return `<div class="op-zone ${band} ${off ? 'off' : ''}"><b>${band === 'diabolical' ? 'Diabolical' : band[0].toUpperCase() + band.slice(1)}</b><span>${lows[i] === highs[i] ? lows[i] : `${lows[i]}–${highs[i]}`}</span></div>`;
    }).join('');

    let marker = '';
    if (v.phase === 'tally' || v.phase === 'outcome') {
      const zone = Math.max(0, cuts.findIndex((c) => r.total <= c) === -1 ? 4 : cuts.findIndex((c) => r.total <= c));
      const within = (r.total - lows[zone] + 0.5) / (highs[zone] - lows[zone] + 1);
      const at = ((zone + within) / 5) * 100;
      marker = `<div class="op-marker"${anim('marker', 'op-slide', 250, 1900, `left:${at.toFixed(2)}%;--from:0%`)}><b>${r.total}</b></div>`;
    }
    const notes = [
      r.boost > 1 ? `<span class="for">Of one mind: the dice count ${times(r.boost)}.</span>` : '',
      r.helped.length ? `<span class="for">In our favour: ${esc(r.helped.join(', '))}.</span>` : '',
      r.hurt.length ? `<span class="against">Against us: ${esc(r.hurt.join(', '))}.</span>` : '',
      r.canny ? '<span>A canny plan: no worse than Bad, no better than Good.</span>' : '',
    ].join(' ');
    return `<div class="op-scale-wrap">
      <p class="op-notes">${notes || `We need ${r.need} or better.`}</p>
      <div class="op-scale">${zones}${marker}</div>
    </div>`;
  }

  /** The dragon fight: a notched track with the dragon at one end and the ship's flag at the other. */
  function gauge(v) {
    if (!v.gauge) return '';
    const at = (m) => ((Math.max(-3, Math.min(3, m)) + 3) / 6) * 100;
    const now = v.gauge.marker;
    const before = v.phase === 'outcome' ? now - (v.moved ?? 0) : now;
    const notches = Array.from({ length: 7 }, (_, i) => `<i class="${i === 3 ? 'mid' : ''}" style="left:${(i / 6) * 100}%"></i>`).join('');
    const peg =
      v.phase === 'outcome' && before !== now
        ? `<div class="op-peg"${anim('peg', 'op-slide', 1200, 1100, `left:${at(now)}%;--from:${at(before)}%`)}></div>`
        : `<div class="op-peg" style="left:${at(now)}%"></div>`;
    return `<div class="op-gauge"><span class="op-end bad">🐉</span><div class="op-track">${notches}${peg}</div><span class="op-end good">🏴‍☠️</span></div>`;
  }

  function scenePage(v) {
    const first = v.phase === 'entry' || v.phase === 'vote';
    if (first) {
      return `${header(v.scene.header)}
        <div class="op-body">
          <p class="op-hand">${inked('entry', v.entry.join(' '), 500, INK_SPEED)}</p>
          ${v.phase === 'vote' ? `<p class="op-hand op-ask"${anim('ask', 'fade', 0, 500)}>${esc(v.ask)}</p>${options(v, false)}<p class="op-prompt"${anim('prompt', 'fade', 900, 600)}>Vote on your phone</p>` : ''}
        </div>`;
    }
    const outcome =
      v.phase === 'outcome'
        ? `<div class="op-outcome">
             <div class="op-stamp"${anim('seal', 'slam', 100, 450)}>${sealTag(v.band, v.bandName)}${v.softened ? `<small class="op-soft">the dice said ${esc(v.rolled)}</small>` : ''}</div>
             <p class="op-hand">${inked('outcome', v.outcome.join(' '), 1300, INK_SPEED)}</p>
           </div>`
        : '';
    return `${header(v.scene.header)}
      <div class="op-body side-two">
        <p class="op-hand op-ask">${esc(v.ask)}</p>
        ${options(v, true)}
        ${v.tied && v.phase === 'chosen' ? `<p class="op-prompt"${anim('tie', 'fade', 0, 500)}>A tie, settled with a doubloon</p>` : ''}
        ${v.roll.boost > 1 && v.phase === 'chosen' ? `<p class="op-prompt"${anim('accord', 'fade', 300, 500)}>${v.roll.backers === v.roll.count ? 'All' : v.roll.backers} of one mind: the dice count ${times(v.roll.boost)}</p>` : ''}
        <p class="op-hand">${inked('lead', v.lead, 500, INK_SPEED)}</p>
        ${v.phase === 'chosen' ? '' : `<div class="op-roll"${anim('roll', 'rise', 0, 450)}>${dice(v.roll)}</div>${scale(v)}`}
        ${gauge(v)}
        ${outcome}
      </div>`;
  }

  function titlePage(v) {
    return `<div class="op-title">
      <p class="op-rule">❦</p>
      <p class="op-small"${anim('t0', 'fade', 300, 900)}>A true and faithful</p>
      <h1${anim('t1', 'fade', 900, 1200)}>${esc(v.cover.heading)}</h1>
      <p class="op-rule">⁂</p>
      <p class="op-hand op-kept">${inked('kept', v.cover.kept, 2600, 70)}</p>
      <p class="op-note"${anim('t3', 'fade', 4200, 900)}>${esc(v.cover.note)}</p>
    </div>`;
  }

  function endingPage(v) {
    const e = v.ending;
    const paras = e.paras.map((text, i) => `<p class="op-hand">${inked(`end${i}`, text, 500, INK_SPEED)}</p>`).join('');
    const signed = e.signed ? `<p class="op-hand op-signed"${anim('signed', 'fade', 900 + e.paras.at(-1).length * INK_SPEED, 900)}>${esc(e.signed)}</p>` : '';
    const other = e.other
      ? `<div class="op-other"${anim('other', 'fade', 2200, 1200)}><p>${esc(e.other.text)}</p><p class="op-claw">${esc(e.other.signed ?? '')}</p></div>`
      : '';
    return `${header(e.header)}
      <div class="op-body op-ending ${e.other ? 'burnt' : ''}">
        ${paras}${signed}
        <div class="op-stamp end"${anim('seal', 'slam', 400, 450)}>${sealTag(e.band)}</div>
      </div>
      ${e.other ? `<div class="op-char"${anim('char', 'op-burn', 0, 2600)}></div>${other}` : ''}`;
  }

  function musterPage(v) {
    const m = v.muster;
    const rows = m.rows.map((r, i) => `<li${anim(`row${r.id}`, 'rise', 300 + i * 120, 400)}>${chip(r.id)}<b>${r.total}</b></li>`).join('');
    const honours = m.honours
      .map((h, i) => `<p class="op-honour"${anim(`hon${i}`, 'rise', 1400 + i * 500, 450)}><b>${esc(h.name)}</b> ${h.ids.map((id) => chip(id)).join(' ')}<i>${esc(h.note ?? '')}</i></p>`)
      .join('');
    return `<div class="op-muster">
      <h1>${esc(m.heading)}</h1>
      <p class="op-small">${esc(m.intro)}</p>
      <ol class="${m.rows.length > 6 ? 'dense' : ''}">${rows}</ol>
      ${honours}
      <button class="btn" data-act="continue"${anim('back', 'fade', 4000, 600)}>Back to port</button>
    </div>`;
  }

  return {
    op(v) {
      const body = v.phase === 'title' ? titlePage(v) : v.phase === 'ending' ? endingPage(v) : v.phase === 'muster' ? musterPage(v) : scenePage(v);
      const name = v.scene?.name ?? v.ending?.name ?? '';
      return `<div class="op" data-phase="${v.phase}">
        <div class="op-book">
          <div class="op-leaf"${anim('leaf', 'op-turn', 0, 700)}>
            ${body}
            ${v.phase === 'title' || v.phase === 'muster' ? '' : stores(v)}
          </div>
        </div>
        ${name ? `<p class="op-place"${anim('place', 'fade', 600, 900)}>${esc(name)}</p>` : ''}
      </div>`;
    },
  };
}
