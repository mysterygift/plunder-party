// Find the One Piece on the phones: a page torn from the captain's log.
// Three things can be on it: something to read, a vote, or a die to roll.
//
// play.js owns the page; this file supplies the screens and handles their taps.
// The die is the same drawing LiAARRRRGH's Dice uses, coloured as bone by onepiece.css.

import { esc } from './common.js';
import { dieTag, dieBack } from './liars-play.js';

const BAND_WORDS = { perfect: 'Perfect', good: 'Good', neutral: 'Neutral', bad: 'Bad', diabolical: 'Diabolical' };

/** A wax seal with a word pressed into it. Shared with the TV (onepiece-host.js). */
export function sealTag(band, label = BAND_WORDS[band] ?? '') {
  // A slightly lumpy circle, so it looks poured rather than drawn with a compass.
  const lumps = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    const r = 46 + [3, -2, 4, 0, -3, 2, 5, -1, 3, -2, 1, 4, -3, 2][i];
    return `${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`;
  });
  const size = label.length > 8 ? 13.5 : label.length > 6 ? 16 : 19;
  return `<span class="op-seal ${esc(band)}"><svg viewBox="0 0 100 100">
    <polygon class="wax" points="${lumps.join(' ')}"/>
    <circle class="ring" cx="50" cy="50" r="35"/>
    <text x="50" y="${50 + size * 0.34}" text-anchor="middle" font-size="${size}">${esc(label)}</text>
  </svg></span>`;
}

// What this phone has tapped but the server has not yet confirmed. It lives
// here, not on the server, so it survives the page being redrawn.
const local = { voteKey: null, voted: null, rollKey: null, sent: false, landedKey: null, landedAt: 0 };

function page(v) {
  return `<div class="center op-phone">
    <div class="op-leaf">
      ${v.band ? sealTag(v.band, v.text) : `<h1 class="op-h">${esc(v.text)}</h1>`}
      ${v.sub ? `<p class="op-sub">${esc(v.sub)}</p>` : ''}
    </div>
  </div>`;
}

function vote(v) {
  if (local.voteKey !== v.key) Object.assign(local, { voteKey: v.key, voted: null });
  const mine = v.mine ?? local.voted;
  const options = v.options
    .map(
      (o) => `<button class="op-slip ${o.id === mine ? 'on' : ''}" data-act="op-vote" data-id="${o.id}">
        <b>${esc(o.text)}</b><i class="op-mark ${esc(o.mark)}">${esc(o.markName)}</i>
      </button>`,
    )
    .join('');
  return `<div class="fill scroll op-phone">
    <div class="op-leaf">
      <p class="op-kick">${esc(v.heading)}</p>
      <h1 class="op-h">${esc(v.ask || 'We resolved to…')}</h1>
      <div class="op-slips">${options}</div>
      <p class="op-sub">${mine === null ? 'Tap one. Most votes wins, and the more of us agree, the more the roll is worth.' : 'Vote cast. Tap another to change your mind.'}</p>
    </div>
  </div>`;
}

function roll(v) {
  if (local.rollKey !== v.key) Object.assign(local, { rollKey: v.key, sent: false });
  const boosted = v.boost > 1;
  const times = boosted ? `×${v.boost.toFixed(2).replace(/0$/, '')}` : '';
  if (v.n === null) {
    return `<div class="center op-phone">
      <div class="op-leaf">
        <p class="op-kick">${esc(v.heading)}</p>
        <div class="op-die waiting">${dieBack()}</div>
        <button class="btn op-throw" data-act="op-roll" ${local.sent ? 'disabled' : ''}>${local.sent ? 'Rolling…' : 'Roll'}</button>
        <p class="op-sub">The crew needs ${v.need} or better between us.${boosted ? ` We were of one mind, so the dice count ${times}.` : ''}</p>
      </div>
    </div>`;
  }
  // The die tumbles once, when its number first arrives; later redraws pick the tumble up where it was.
  if (local.landedKey !== v.key) Object.assign(local, { landedKey: v.key, landedAt: Date.now() });
  const elapsed = Date.now() - local.landedAt;
  const tumbling = elapsed < 800;
  return `<div class="center op-phone">
    <div class="op-leaf">
      <p class="op-kick">${esc(v.heading)}</p>
      <div class="op-die">${dieTag(v.n, tumbling ? 'roll' : '', tumbling ? ` style="animation-delay:${-elapsed}ms"` : '')}</div>
      <h1 class="op-h">You rolled a ${v.n}</h1>
      <p class="op-sub">${
        v.done
          ? boosted
            ? `The crew rolled ${v.sum}. Of one mind, ${times}: ${v.total}.`
            : `The crew rolled ${v.total}.`
          : `${v.sum} so far, with ${v.count - v.rolled} still to roll. We need ${v.need}${boosted ? `, and the dice count ${times}` : ''}.`
      }</p>
    </div>
  </div>`;
}

function end(v) {
  const titles = v.titles.map((t) => `<p class="op-title">${esc(t)}</p>`).join('');
  return `<div class="center op-phone">
    <div class="op-leaf">
      <p class="op-kick">Crew muster</p>
      <h1 class="op-h">You rolled ${v.total} in all</h1>
      ${titles}
      ${v.canContinue ? '<button class="btn" data-act="continue">Back to port</button>' : '<p class="op-sub">Waiting for the captain…</p>'}
    </div>
  </div>`;
}

export const onePieceScreens = { 'op-page': page, 'op-vote': vote, 'op-roll': roll, 'op-end': end };

/** A tap on one of this game's buttons. `send` posts to the server. */
export async function onePieceTap(act, id, view, send) {
  const el = document.getElementById('screen');
  if (act === 'op-vote' && view?.screen === 'op-vote') {
    local.voted = Number(id);
    navigator.vibrate?.(15);
    el.innerHTML = vote(view);
    return send({ type: 'op-vote', key: view.key, id: Number(id) });
  }
  if (act === 'op-roll' && view?.screen === 'op-roll' && !local.sent) {
    const key = view.key;
    local.sent = true;
    navigator.vibrate?.([20, 30, 20, 30, 60]);
    el.innerHTML = roll(view);
    const result = await send({ type: 'op-roll', key });
    // The server normally answers with the number straight away; if it didn't, let them try again.
    const retry = () => {
      if (local.rollKey !== key || !local.sent || local.landedKey === key) return;
      local.sent = false;
      const now = document.body.dataset.screen === 'op-roll' ? shown : null;
      if (now?.key === key && now.n === null) el.innerHTML = roll(now);
    };
    if (result?.error) retry();
    else setTimeout(retry, 3000);
  }
}

let shown = null; // the view currently on screen

/** Called by play.js on every redraw. */
export function onePieceShown(v) {
  shown = v;
}
