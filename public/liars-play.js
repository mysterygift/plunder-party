// LiAARRRRGH's Dice on the phones: your own dice, the bid on the table, and
// (on your turn) the buttons to raise it or call it.
//
// play.js owns the page; this file supplies the one screen ("ld-hand") and
// handles its taps. The dice drawings are shared with the TV (liars-host.js).

import { esc } from './common.js';

// ---------------------------------------------------------------------------
// Drawing dice
// ---------------------------------------------------------------------------

// Where the spots go on each face, on a 100x100 die.
const SPOTS = {
  1: [[50, 50]],
  2: [[29, 29], [71, 71]],
  3: [[27, 27], [50, 50], [73, 73]],
  4: [[29, 29], [71, 29], [29, 71], [71, 71]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[29, 25], [71, 25], [29, 50], [71, 50], [29, 75], [71, 75]],
};
const BODY = '<rect class="die-body" x="5" y="5" width="90" height="90" rx="20"/><rect class="die-shine" x="12" y="10" width="76" height="34" rx="15"/>';

/** One die showing `n`. `cls` adds classes such as "hit" (it counts) or "dim" (it doesn't). */
export function dieTag(n, cls = '', attrs = '') {
  const spots = (SPOTS[n] ?? []).map(([x, y]) => `<circle class="die-spot" cx="${x}" cy="${y}" r="${n === 1 ? 13 : 9.5}"/>`).join('');
  return `<span class="die ${cls}" data-n="${Number(n)}"${attrs}><svg viewBox="0 0 100 100">${BODY}${spots}</svg></span>`;
}

/** A die nobody can see yet. */
export function dieBack(cls = '', attrs = '') {
  return `<span class="die back ${cls}"${attrs}><svg viewBox="0 0 100 100">${BODY}<text class="die-q" x="50" y="70" text-anchor="middle">?</text></svg></span>`;
}

/** A bid, as a picture: "4 × ⚄". */
export function bidTag(q, f, cls = '') {
  return `<span class="ld-bid ${cls}"><b>${Number(q)}</b><i>×</i>${dieTag(f)}</span>`;
}

// ---------------------------------------------------------------------------
// The rules the buttons need (the server checks everything again)
// ---------------------------------------------------------------------------

const legal = (q, f, v) => q >= 1 && q <= v.total && f >= 1 && f <= 6 && (!v.bid || q > v.bid.q || (q === v.bid.q && f > v.bid.f));
/** The fewest dice a new bid could name. */
const lowest = (v) => (!v.bid ? 1 : v.bid.f === 6 ? v.bid.q + 1 : v.bid.q);
const canRaise = (v) => lowest(v) <= v.total;

// What this player has dialled in but not yet sent. It lives here, not on the
// server, so it survives the page being redrawn.
const local = { key: null, q: 1, f: 2, sent: false, hidden: false, round: 0, rolledAt: 0 };

function startTurn(v) {
  if (local.key === v.key) return;
  // Start on the most natural raise: one more of the same number.
  let q = v.bid ? v.bid.q + 1 : 1;
  let f = v.bid ? v.bid.f : mostCommon(v.dice);
  if (!legal(q, f, v)) [q, f] = [lowest(v), v.bid && v.bid.f < 6 ? v.bid.f + 1 : 1];
  Object.assign(local, { key: v.key, q, f, sent: false });
}

function mostCommon(dice) {
  let best = 6;
  const count = (f) => dice.filter((d) => d === f).length;
  for (let f = 6; f >= 1; f--) if (count(f) > count(best)) best = f;
  return best;
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

/** The buttons for a turn: dial in a bid, send it, or call the last one. */
function controls(v) {
  const call = v.bid
    ? `<button class="btn ld-call" data-act="ld-call" ${local.sent ? 'disabled' : ''}>LiAARRRRGH!<small>Call ${esc(v.bid.by)} a liar</small></button>`
    : '';
  if (!canRaise(v)) return `<p class="ld-status">There is no higher bid.<small>You’ll have to call it.</small></p>${call}`;

  const faces = [1, 2, 3, 4, 5, 6]
    .map((f) => `<button class="ld-face ${f === local.f ? 'on' : ''}" data-act="ld-face" data-id="${f}" ${legal(local.q, f, v) ? '' : 'disabled'} aria-label="${f}s">${dieTag(f)}</button>`)
    .join('');
  const ok = legal(local.q, local.f, v) && !local.sent;
  return `<p class="ld-prompt">${v.bid ? 'Your turn: raise it, or call it' : 'Your turn: open the bidding'}</p>
    <div class="ld-dial">
      <button class="ld-step" data-act="ld-less" ${local.q <= lowest(v) ? 'disabled' : ''} aria-label="Fewer">−</button>
      <span class="ld-preview">${bidTag(local.q, local.f)}</span>
      <button class="ld-step" data-act="ld-more" ${local.q >= v.total ? 'disabled' : ''} aria-label="More">+</button>
    </div>
    <div class="ld-faces">${faces}</div>
    <button class="btn ld-go" data-act="ld-bid" ${ok ? '' : 'disabled'}>${local.sent ? 'Sent…' : 'Make this bid'}</button>
    ${call ? `<p class="ld-or"><span>or</span></p>${call}` : ''}`;
}

function hand(v) {
  if (v.round !== local.round) Object.assign(local, { round: v.round, rolledAt: Date.now() });
  const rolling = Date.now() - local.rolledAt < 900;
  const dice = v.dice.map((d, i) => (local.hidden ? dieBack() : dieTag(d, `${rolling ? 'roll' : ''} ${v.wild && d === 1 ? 'wild' : ''}`, ` style="animation-delay:${i * 70}ms"`))).join('');

  const table = v.bid
    ? `<p class="ld-says">${v.bid.mine ? 'You say' : `<b>${esc(v.bid.by)}</b> says`} there are at least</p>
       <div class="ld-claim">${bidTag(v.bid.q, v.bid.f)}</div>
       ${v.bid.auto ? `<p class="ld-says">🦜 The parrot bid for ${v.bid.mine ? 'you' : 'them'}.</p>` : ''}`
    : `<p class="ld-open">No bid yet</p><p class="ld-says">${v.nextIsMe ? 'You open' : `<b>${esc(v.turn)}</b> opens`} the bidding.</p>`;

  let panel;
  if (v.myTurn) {
    startTurn(v);
    panel = controls(v);
  } else if (v.phase === 'roll') {
    panel = '<p class="ld-status">Have a look at your dice…<small>and keep them to yourself.</small></p>';
  } else if (v.bid?.mine) {
    panel = `<p class="ld-status">Your bid stands. Look innocent.<small>Waiting for ${esc(v.turn)}…</small></p>`;
  } else {
    panel = `<p class="ld-status">Waiting for ${esc(v.turn)}…</p>`;
  }

  return `<div class="fill scroll ld-hand ${v.myTurn ? 'my-turn' : ''}">
    <div class="ld-table parch">
      <p class="ld-kick">Round ${v.round} · ${v.total} dice in play${v.wild ? ' · 1s are wild' : ''}</p>
      ${table}
    </div>
    <button class="ld-tray" data-act="ld-peek" aria-label="${local.hidden ? 'Show my dice' : 'Hide my dice'}">
      <span class="ld-tray-top"><b>Your dice</b><i>${local.hidden ? 'tap to show' : 'tap to hide'}</i></span>
      <span class="ld-dice">${dice}</span>
    </button>
    <div class="ld-panel">${panel}</div>
  </div>`;
}

export const liarsScreens = { 'ld-hand': hand };

const redraw = (view) => {
  const el = document.getElementById('screen');
  if (el && view?.screen === 'ld-hand') el.innerHTML = hand(view);
};

/** A tap on one of this game's buttons. `send` posts to the server. */
export async function liarsTap(act, id, view, send) {
  if (view?.screen !== 'ld-hand') return;
  if (act === 'ld-peek') {
    local.hidden = !local.hidden;
    return redraw(view);
  }
  if (!view.myTurn || local.sent || local.key !== view.key) return;

  if (act === 'ld-less' || act === 'ld-more') {
    local.q = Math.min(view.total, Math.max(lowest(view), local.q + (act === 'ld-more' ? 1 : -1)));
    // Dropping back to the same count as the last bid: only higher numbers will do.
    if (!legal(local.q, local.f, view) && view.bid && view.bid.f < 6) local.f = view.bid.f + 1;
    navigator.vibrate?.(8);
    return redraw(view);
  }
  if (act === 'ld-face') {
    if (!legal(local.q, Number(id), view)) return;
    local.f = Number(id);
    navigator.vibrate?.(8);
    return redraw(view);
  }

  const message = act === 'ld-call' ? { type: 'ld-call', key: view.key } : act === 'ld-bid' && legal(local.q, local.f, view) ? { type: 'ld-bid', key: view.key, q: local.q, f: local.f } : null;
  if (!message) return;
  const key = view.key;
  local.sent = true;
  navigator.vibrate?.(act === 'ld-call' ? [40, 40, 120] : 30);
  redraw(view);
  const result = await send(message);
  // The server normally swaps the screen straight away; if it didn't, let them try again.
  const retry = () => {
    if (local.key !== key || !local.sent) return;
    local.sent = false;
    if (shown?.key === key && shown.myTurn) redraw(shown); // still their turn, as far as the server has said
  };
  if (result?.error) retry();
  else setTimeout(retry, 3000);
}

let shown = null; // the view currently on screen
let buzzed = null;

/** Called by play.js on every redraw: buzz the phone when it becomes this player's turn. */
export function liarsShown(v) {
  shown = v;
  if (v.screen !== 'ld-hand' || !v.myTurn || buzzed === v.key) return;
  buzzed = v.key;
  navigator.vibrate?.([70, 50, 70]);
}
