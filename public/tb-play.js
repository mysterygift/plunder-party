// To the Brig with Ye on the phones: your secret orders, and whatever this
// leg needs from you (pick the lookouts, hoist a flag, vote on the heading,
// vote on the brig).
//
// play.js owns the page; this file supplies the screens (they all start "tb-")
// and handles their taps. Every screen ends with the same strip along the
// bottom, where a tap shows which side you are on for a few seconds.

import { esc } from './common.js';

const SIDE = {
  port: { word: 'Port', arrow: '◀', hint: 'left' },
  starboard: { word: 'Starboard', arrow: '▶', hint: 'right' },
};

/** A signal flag: red for port, green for starboard. Shared with the TV (tb-host.js). */
export function signalFlag(side, cls = '') {
  const s = SIDE[side];
  return `<span class="tb-flag ${esc(side)} ${cls}"><i>${side === 'port' ? s.arrow : ''}</i><b>${s.word}</b><i>${side === 'starboard' ? s.arrow : ''}</i></span>`;
}

const chip = (o) => `<span class="chip" style="--c:${esc(o.color)}"><span class="face"><span>${esc(o.avatar)}</span></span><span class="nm">${esc(o.name)}</span></span>`;
const list = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? ''));

// What this phone has done but the server has not confirmed yet. It lives here,
// not on the server, so it survives the page being redrawn.
const local = {
  peek: false, // the secret orders strip is open
  peekTimer: null,
  turned: null, // the key of the orders card that has been turned face up
  pickKey: null, // the captain's half-made choice of lookouts
  picked: [],
  sent: null, // the key of the screen whose answer is on its way
};

// ---------------------------------------------------------------------------
// The pieces every screen shares
// ---------------------------------------------------------------------------

/** How she is doing: which leg, and how much hull is left. */
function chart(v) {
  if (!v.legs || !v.leg) return '';
  const planks = Array.from({ length: v.hullMax }, (_, i) => `<i class="${i < v.hull ? '' : 'gone'}"></i>`).join('');
  return `<p class="tb-chart"><span>Leg ${v.leg} of ${v.legs}</span><span class="tb-hull" aria-label="${v.hull} of ${v.hullMax} hull left">${planks}</span></p>`;
}

/** The strip along the bottom: tap it to see which side you are on. */
function orders(v) {
  if (v.unmasked) return '';
  if (!local.peek) return '<button class="tb-orders" data-act="tb-peek">🤫 <b>Your secret orders</b><small>tap to peek</small></button>';
  return v.role === 'mutineer'
    ? `<button class="tb-orders open mutineer" data-act="tb-peek">😈 <b>Mutineer</b><small>${v.mates.length ? `with ${esc(list(v.mates))}` : 'on your own'}</small></button>`
    : '<button class="tb-orders open" data-act="tb-peek">⚓ <b>Loyal crew</b><small>find the mutineers</small></button>';
}

const page = (v, body, cls = '') => `<div class="fill scroll tb ${cls}">${chart(v)}<div class="tb-body">${body}</div>${orders(v)}</div>`;

// ---------------------------------------------------------------------------
// The screens
// ---------------------------------------------------------------------------

/** The start of a voyage: a card, face down. Turn it over to learn your side. */
function role(v) {
  if (v.ready) {
    return page(v, '<div class="big-icon">🤐</div><h1 class="title small">Not a word.</h1><p class="sub">Waiting for the rest of the crew…</p>');
  }
  if (local.turned !== v.key) {
    return `<div class="fill tb"><div class="tb-body">
      <button class="tb-card back" data-act="tb-turn">
        <span class="tb-card-icon">🤫</span>
        <b>Your secret orders</b>
        <small>Make sure nobody can see your phone, then tap to turn them over.</small>
      </button>
    </div></div>`;
  }
  const n = v.traitors;
  const card =
    v.role === 'mutineer'
      ? `<div class="tb-card mutineer">
          <span class="tb-card-icon">😈</span>
          <b>You are a mutineer</b>
          <p>${v.mates.length ? `So ${v.mates.length > 1 ? 'are' : 'is'} <em>${esc(list(v.mates))}</em>.` : 'You are on your own.'} Wreck the ship before she reaches the island.</p>
          <ul><li>Up the crow’s nest, hoist the wrong flag.</li><li>Vote for the rocks.</li><li>Get honest pirates sent to the brig.</li><li>Don’t get caught.</li></ul>
        </div>`
      : `<div class="tb-card loyal">
          <span class="tb-card-icon">⚓</span>
          <b>You are loyal crew</b>
          <p>${n === 1 ? 'One of the crew is a mutineer' : `${n} of the crew are mutineers`}. Get the ship to the island in one piece.</p>
          <ul><li>Up the crow’s nest, hoist the true flag.</li><li>Work out who is lying.</li><li>Send them to the brig.</li></ul>
        </div>`;
  return `<div class="fill scroll tb"><div class="tb-body">${card}<button class="btn" data-act="tb-ready">Got it. Hide this</button></div></div>`;
}

function wait(v) {
  return page(
    v,
    `<div class="big-icon">${esc(v.icon ?? '👀')}</div>
     <h1 class="title small">${esc(v.text)}</h1>
     ${v.sub ? `<p class="sub">${esc(v.sub)}</p>` : ''}`,
    v.jailed ? 'jailed' : '',
  );
}

/** The captain: send two pirates up the crow's nest. */
function pick(v) {
  if (local.pickKey !== v.key) Object.assign(local, { pickKey: v.key, picked: [] });
  const sent = local.sent === v.key;
  const tiredPicked = local.picked.some((id) => v.options.find((o) => o.id === id)?.tired);
  const options = v.options
    .map((o) => {
      const on = local.picked.includes(o.id);
      const blocked = !on && (local.picked.length >= 2 || (o.tired && tiredPicked)); // only one of last leg's pair may go again
      return `<button class="tb-pick ${on ? 'on' : ''}" data-act="tb-choose" data-id="${esc(o.id)}" ${blocked || sent ? 'disabled' : ''}>
        ${chip(o)}<small>${o.me ? 'that’s you' : ''}${o.me && o.tired ? ' · ' : ''}${o.tired ? 'went up last leg' : ''}</small>
      </button>`;
    })
    .join('');
  return page(
    v,
    `<p class="heading light">You’re the captain</p>
     <p class="prompt light">Send two pirates up the crow’s nest. Only they will see the reef.</p>
     <div class="tb-picks">${options}</div>
     <button class="btn" data-act="tb-send" ${local.picked.length === 2 && !sent ? '' : 'disabled'}>${sent ? 'Up they go…' : 'Send them up'}</button>`,
  );
}

/** A lookout: you can see the reef. Hoist a flag (a true one, or not). */
function nest(v) {
  const safe = SIDE[v.safe];
  const sight = `<div class="tb-sight ${esc(v.safe)}">
      <small>Through the spyglass</small>
      <b>${v.safe === 'port' ? `${safe.arrow} ` : ''}${safe.word} is safe${v.safe === 'starboard' ? ` ${safe.arrow}` : ''}</b>
      <span>The reef is to ${v.safe === 'port' ? 'starboard' : 'port'}.</span>
    </div>`;
  if (v.mine) {
    return page(v, `${sight}<p class="sub">You hoisted</p><div class="tb-mine">${signalFlag(v.mine)}</div><p class="tiny">The crew will see both flags, but not whose is whose.</p>`);
  }
  const sent = local.sent === v.key;
  const flag = (side) => `<button class="tb-hoist ${side}" data-act="tb-flag" data-id="${side}" ${sent ? 'disabled' : ''}>${signalFlag(side)}<small>${SIDE[side].hint}</small></button>`;
  return page(
    v,
    `<p class="heading light">You’re up the crow’s nest</p>
     <p class="tiny">with ${esc(v.mate)}. Keep this screen to yourself.</p>
     ${sight}
     <p class="prompt light">Hoist a flag to tell the crew which way to steer:</p>
     <div class="tb-two">${flag('port')}${flag('starboard')}</div>
     ${v.role === 'mutineer' ? '<p class="tiny">😈 Nobody will know which flag was yours.</p>' : ''}`,
  );
}

/** Everybody on deck: which way do we steer? */
function helm(v) {
  const split = v.flags[0] !== v.flags[1];
  const flags = `<div class="tb-flags">${v.flags.map((f) => signalFlag(f)).join('')}</div>
    <p class="tiny">${split ? `${esc(v.lookouts)}: one of them is lying.` : `${esc(v.lookouts)} agree.`}</p>`;
  const saw = v.saw ? `<p class="tb-saw">🔭 You saw it yourself: <b>${SIDE[v.saw].word.toLowerCase()}</b> is safe.</p>` : '';
  if (v.mine) {
    return page(v, `${flags}<p class="sub">You voted to steer</p><div class="tb-mine">${signalFlag(v.mine)}</div><p class="tiny">Keep arguing until the rest have voted.</p>`);
  }
  const sent = local.sent === v.key;
  const way = (side) => `<button class="tb-hoist ${side}" data-act="tb-steer" data-id="${side}" ${sent ? 'disabled' : ''}>${signalFlag(side)}<small>${SIDE[side].hint}</small></button>`;
  return page(
    v,
    `<p class="heading light">Which way do we steer?</p>
     ${flags}${saw}
     <p class="prompt light">${split ? 'Argue it out, then vote:' : 'Trust them? Vote:'}</p>
     <div class="tb-two">${way('port')}${way('starboard')}</div>`,
  );
}

/** Everybody on deck: who goes below? */
function brig(v) {
  if (v.mine) {
    const who = v.options.find((o) => o.id === v.mine);
    return page(v, `<div class="big-icon">⛓️</div><p class="sub">You voted for</p><div class="tb-mine">${who ? chip(who) : '<b>Nobody</b>'}</div><p class="tiny">Keep arguing until the rest have voted.</p>`);
  }
  const sent = local.sent === v.key;
  const options = v.options.map((o) => `<button class="tb-pick" data-act="tb-jail" data-id="${esc(o.id)}" ${sent ? 'disabled' : ''}>${chip(o)}</button>`).join('');
  return page(
    v,
    `<p class="heading light">Who goes to the brig?</p>
     <p class="prompt light">Most votes goes below. It takes at least two.</p>
     <div class="tb-picks">${options}<button class="tb-pick nobody" data-act="tb-jail" data-id="nobody" ${sent ? 'disabled' : ''}><b>Nobody</b><small>not sure enough yet</small></button></div>`,
  );
}

export const brigScreens = { 'tb-role': role, 'tb-wait': wait, 'tb-pick': pick, 'tb-nest': nest, 'tb-helm': helm, 'tb-brig': brig };

// ---------------------------------------------------------------------------
// Taps
// ---------------------------------------------------------------------------

let shown = null; // the view currently on screen

const redraw = () => {
  const el = document.getElementById('screen');
  if (el && shown && brigScreens[shown.screen]) el.innerHTML = brigScreens[shown.screen](shown);
};

/** A tap on one of this game's buttons. `send` posts to the server. */
export async function brigTap(act, id, view, send) {
  if (!view || !brigScreens[view.screen]) return;
  shown = view;

  if (act === 'tb-peek') {
    clearTimeout(local.peekTimer);
    local.peek = !local.peek;
    if (local.peek) {
      local.peekTimer = setTimeout(() => {
        local.peek = false;
        redraw();
      }, 4000);
    }
    return redraw();
  }
  if (act === 'tb-turn') {
    local.turned = view.key;
    navigator.vibrate?.(30);
    return redraw();
  }
  if (act === 'tb-choose' && view.screen === 'tb-pick') {
    if (local.sent === view.key) return;
    const at = local.picked.indexOf(id);
    if (at >= 0) local.picked.splice(at, 1);
    else if (local.picked.length < 2) local.picked.push(id);
    navigator.vibrate?.(10);
    return redraw();
  }

  // Everything else is an answer for the server.
  let message = null;
  if (act === 'tb-ready') message = { type: 'tb-ready' };
  if (act === 'tb-send' && view.screen === 'tb-pick' && local.picked.length === 2) message = { type: 'tb-pick', key: view.key, ids: [...local.picked] };
  if (act === 'tb-flag' && view.screen === 'tb-nest') message = { type: 'tb-flag', key: view.key, side: id };
  if (act === 'tb-steer' && view.screen === 'tb-helm') message = { type: 'tb-steer', key: view.key, side: id };
  if (act === 'tb-jail' && view.screen === 'tb-brig') message = { type: 'tb-jail', key: view.key, id };
  if (!message || local.sent === view.key) return;

  const key = view.key;
  local.sent = key;
  navigator.vibrate?.(30);
  redraw();
  const result = await send(message);
  // The server normally swaps the screen straight away; if it didn't, let them try again.
  const retry = () => {
    if (local.sent !== key) return;
    local.sent = null;
    if (shown?.key === key) redraw();
  };
  if (result?.error) retry();
  else setTimeout(retry, 3000);
}

let buzzed = null;

/** Called by play.js on every redraw: buzz the phone when it has something to do. */
export function brigShown(v) {
  if (!brigScreens[v.screen]) return;
  if (shown && shown.key !== v.key) local.peek = false; // a new screen: close the orders strip
  shown = v;
  const asked = ['tb-role', 'tb-pick', 'tb-nest', 'tb-helm', 'tb-brig'].includes(v.screen) && !v.mine && !v.ready;
  if (!asked || buzzed === v.key) return;
  buzzed = v.key;
  navigator.vibrate?.(v.screen === 'tb-pick' || v.screen === 'tb-nest' ? [70, 50, 70] : 40);
}
