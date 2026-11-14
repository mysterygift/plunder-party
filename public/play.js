// The phone screen: a controller in the browser. Like the TV, it just draws
// whatever "view" the server sends, and posts back what the player taps.

import { esc, fmt, connect, post, startTimers, ask, dismissQuestion } from './common.js';
import { createMap } from './map.js';
import { bombardScreens, bombardTap, bombardShown } from './bombard-play.js';
import { liarsScreens, liarsTap, liarsShown } from './liars-play.js';
import { onePieceScreens, onePieceTap, onePieceShown } from './onepiece-play.js';
import { knotsShown } from './knots-play.js';
import { brigScreens, brigTap, brigShown } from './tb-play.js';
import { mutinyScreens, mutinyTap, mutinyShown } from './mutiny-play.js';
import { FLAG_W, FLAG_H, CLOTHS, INKS, WIDTHS, ERASER, MAX_STROKES, MAX_POINTS, strokePath, strokesSvg, inkColor, flagTag } from './flag.js';

const $ = (id) => document.getElementById(id);
const screenEl = $('screen');
const TOKEN_KEY = 'plunder-token';
const NAME_KEY = 'plunder-name';

let token = localStorage.getItem(TOKEN_KEY) ?? '';
let view = null;
let lastJson = '';
let busy = false;

const send = (body) => post('/api/action', { token, ...body });

// ---------------------------------------------------------------------------
// The treasure map lives outside the normal redraw so it keeps its zoom.
// ---------------------------------------------------------------------------

let myPin = null;
let mapKey = null;
const map = createMap({
  onPick(point) {
    if (view?.screen !== 'map' || view.locked) return;
    myPin = point;
    drawPin();
    send({ type: 'pin', key: view.key, ...point });
    const lock = document.querySelector('[data-act="lock"]');
    if (lock) lock.disabled = false;
    navigator.vibrate?.(15);
  },
});

function drawPin() {
  map.draw({ marks: myPin ? [{ kind: 'x', lat: myPin.lat, lng: myPin.lng }] : [] });
}

/** The answer: your pin, the real spot, and a dotted line showing how far out you were. */
function drawReveal(v) {
  const spot = v.reveal;
  map.draw({
    marks: [
      { kind: 'pin', lat: myPin.lat, lng: myPin.lng, color: v.me?.color, emoji: v.me?.avatar },
      { kind: 'x', lat: spot.lat, lng: spot.lng, label: spot.name, delay: 500 },
    ],
    lines: [{ from: myPin, to: spot, color: '#fff3d6', delay: 800 }],
  });
  requestAnimationFrame(() => map.flyTo([myPin, spot], 1500));
}

const clueHtml = (clue) => `<b>Clue ${clue.n} of ${clue.of}</b><span>${esc(clue.text)}</span>`;

// ---------------------------------------------------------------------------
// The flag easel (Flying Colours). Like the map, it lives outside the normal
// redraw: a half-drawn flag must survive whatever the server sends meanwhile.
// ---------------------------------------------------------------------------

const pad = { key: null, cloth: 0, ink: 0, width: 1, strokes: [], points: 0, sent: false, live: null };
const padFlag = () => ({ cloth: pad.cloth, strokes: pad.strokes });

/** Bring the tool buttons and the cloth in line with `pad`. */
function refreshPad() {
  if (!$('pad')) return;
  $('padCloth').setAttribute('fill', CLOTHS[pad.cloth]);
  $('clothDot').style.background = CLOTHS[pad.cloth];
  for (const el of screenEl.querySelectorAll('[data-act="ink"]')) el.classList.toggle('on', Number(el.dataset.id) === pad.ink);
  for (const el of screenEl.querySelectorAll('[data-act="size"]')) el.classList.toggle('on', Number(el.dataset.id) === pad.width);
  const empty = pad.strokes.length === 0;
  $('hoist').disabled = empty || pad.sent;
  $('undo').disabled = empty;
  $('clear').disabled = empty;
  $('padHint').hidden = !empty;
  $('padFull').hidden = pad.points < MAX_POINTS && pad.strokes.length < MAX_STROKES;
}

function repaintPad() {
  $('padInk').innerHTML = strokesSvg(padFlag());
  refreshPad();
}

function setupPad(key, v = {}) {
  // A fresh black flag and white paint (or whatever the game asks for); the brush size carries over.
  Object.assign(pad, { key, cloth: v.cloth ?? 0, ink: v.ink ?? 0, strokes: [], points: 0, sent: false, live: null });
  const svg = $('pad');
  const at = (e) => {
    const box = svg.getBoundingClientRect();
    const x = Math.round(((e.clientX - box.left) / box.width) * FLAG_W);
    const y = Math.round(((e.clientY - box.top) / box.height) * FLAG_H);
    return [Math.min(FLAG_W, Math.max(0, x)), Math.min(FLAG_H, Math.max(0, y))];
  };

  svg.addEventListener('pointerdown', (e) => {
    if (pad.live || pad.sent || pad.points >= MAX_POINTS || pad.strokes.length >= MAX_STROKES) return;
    e.preventDefault();
    svg.setPointerCapture?.(e.pointerId);
    const stroke = { c: pad.ink, w: pad.width, p: at(e) };
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('stroke', inkColor(padFlag(), stroke));
    el.setAttribute('stroke-width', WIDTHS[stroke.w]);
    el.setAttribute('d', strokePath(stroke.p));
    $('padInk').append(el);
    pad.strokes.push(stroke);
    pad.points++;
    pad.live = { pointer: e.pointerId, stroke, el };
    refreshPad();
  });

  svg.addEventListener('pointermove', (e) => {
    const live = pad.live;
    if (live?.pointer !== e.pointerId) return;
    const batch = e.getCoalescedEvents?.() ?? [];
    for (const event of batch.length ? batch : [e]) {
      const [x, y] = at(event);
      const p = live.stroke.p;
      // Skip points that have barely moved: it keeps drawings small without changing how they look.
      if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) < 4 || pad.points >= MAX_POINTS) continue;
      p.push(x, y);
      pad.points++;
    }
    live.el.setAttribute('d', strokePath(live.stroke.p));
  });

  const lift = (e) => {
    if (pad.live?.pointer === e.pointerId) pad.live = null;
  };
  svg.addEventListener('pointerup', lift);
  svg.addEventListener('pointercancel', lift);
  repaintPad();
}

async function padTool(act, id) {
  if (pad.sent || pad.live) return;
  if (act === 'clear') {
    const key = pad.key;
    if (pad.strokes.length === 0) return;
    if (!(await ask({ title: 'Scrub this flag?', text: 'Your drawing is wiped and you start again on fresh cloth.', yes: 'Scrub it', no: 'Keep it' }))) return;
    if (pad.key !== key || pad.sent) return; // the game moved on while the question was up
    Object.assign(pad, { strokes: [], points: 0 });
  }
  if (act === 'ink') pad.ink = Number(id);
  if (act === 'size') pad.width = Number(id);
  if (act === 'cloth') pad.cloth = (pad.cloth + 1) % CLOTHS.length;
  if (act === 'undo') pad.points -= (pad.strokes.pop()?.p.length ?? 0) / 2;
  repaintPad();
}

async function sendFlag(key) {
  if (pad.sent || pad.strokes.length === 0) return;
  pad.sent = true;
  pad.live = null;
  const button = $('hoist');
  if (button) button.textContent = 'Sending…';
  refreshPad();
  const result = await send({ type: 'flag', key, flag: padFlag() });
  const retry = () => {
    if (pad.key !== key || !pad.sent) return;
    pad.sent = false;
    if (button?.isConnected) button.textContent = 'Try again';
    refreshPad();
  };
  if (result.error) retry();
  else setTimeout(retry, 3000); // the server normally swaps the screen straight away
}

// Pairing a flag with a name: the choice is kept here until it is launched.
const pick = { key: null, flag: null, name: null, sent: false };

function refreshPick() {
  for (const el of screenEl.querySelectorAll('[data-act="pick-flag"]')) el.classList.toggle('on', el.dataset.id === pick.flag);
  for (const el of screenEl.querySelectorAll('[data-act="pick-name"]')) el.classList.toggle('on', Number(el.dataset.id) === pick.name);
  const launch = $('launch');
  if (launch) launch.disabled = pick.flag === null || pick.name === null || pick.sent;
}

async function sendPick(key) {
  if (pick.sent || pick.flag === null || pick.name === null) return;
  pick.sent = true;
  refreshPick();
  const result = await send({ type: 'combine', key, flag: pick.flag, name: pick.name });
  const retry = () => {
    if (pick.key !== key || !pick.sent) return;
    pick.sent = false;
    refreshPick();
  };
  if (result.error) retry();
  else setTimeout(retry, 3000);
}

// ---------------------------------------------------------------------------
// The look picker: tap your mascot in the lobby to choose an icon and a colour.
// It sits outside #screen so server pushes refresh it rather than wipe it.
// Anything another pirate already has is greyed out.
// ---------------------------------------------------------------------------

let looksEl = null;

function openLooks() {
  if (looksEl || view?.screen !== 'lobby') return;
  looksEl = document.createElement('div');
  looksEl.className = 'modal looks';
  looksEl.innerHTML = `<div class="modal-card parch looks-card" role="dialog" aria-modal="true" aria-labelledby="looksTitle">
    <div class="looks-head"><span id="looksMe"></span><h2 id="looksTitle">Pick yer look</h2></div>
    <p class="looks-label">Mascot</p><div class="looks-grid" id="looksAvatars"></div>
    <p class="looks-label">Colour</p><div class="looks-grid" id="looksColors"></div>
    <div class="modal-btns"><button class="modal-btn yes" data-look="done">Done</button></div>
  </div>`;
  looksEl.addEventListener('click', onLooksTap);
  document.addEventListener('keydown', onLooksKey, true);
  document.body.append(looksEl);
  refreshLooks();
  looksEl.querySelector('[data-look="done"]').focus({ preventScroll: true });
}

function closeLooks() {
  if (!looksEl) return;
  document.removeEventListener('keydown', onLooksKey, true);
  looksEl.remove();
  looksEl = null;
}

function onLooksKey(e) {
  if (e.key !== 'Escape') return;
  e.stopImmediatePropagation();
  closeLooks();
}

let lookPending = null; // a tap the server hasn't shown back yet: { kind, id, until }

/** Redraw the picker from the latest view, plus any choice the server hasn't confirmed yet. */
function refreshLooks() {
  if (!looksEl) return;
  const { avatars, colors } = view.looks;
  const p = lookPending;
  const lost = p && (p.kind === 'avatar' ? avatars : colors).find((o) => o.id === p.id)?.taken; // someone beat us to it
  if (p && (view.me[p.kind] === p.id || lost || Date.now() > p.until)) lookPending = null;
  const mine = lookPending ? { ...view.me, [p.kind]: p.id } : view.me;
  $('looksMe').innerHTML = face(mine, 'big');
  const cell = (kind, o, style, content) => {
    const on = o.id === mine[kind];
    const label = o.taken ? `${kind === 'color' ? 'Colour' : o.id} taken by ${o.taken}` : kind === 'color' ? `Colour ${o.id}` : o.id;
    return `<button class="look ${on ? 'on' : ''}" data-look="${kind}" data-id="${o.id}" style="${style}" aria-label="${esc(label)}" aria-pressed="${on}" ${o.taken ? 'disabled' : ''}>${content}</button>`;
  };
  $('looksAvatars').innerHTML = avatars.map((o) => cell('avatar', o, `--c:${mine.color}`, `<span>${o.id}</span>`)).join('');
  $('looksColors').innerHTML = colors.map((o) => cell('color', o, `--c:${o.id}`, `<span>${mine.avatar}</span>`)).join('');
}

async function onLooksTap(e) {
  if (e.target === looksEl) return closeLooks();
  const el = e.target.closest('[data-look]');
  if (!el || el.disabled) return;
  if (el.dataset.look === 'done') return closeLooks();
  const kind = el.dataset.look;
  navigator.vibrate?.(10);
  lookPending = { kind, id: el.dataset.id, until: Date.now() + 1500 };
  refreshLooks(); // show it straight away
  await send({ type: 'look', [kind]: el.dataset.id });
  setTimeout(refreshLooks, 1600); // if the server never showed it back, fall back to what it says
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

const face = (p, cls = '') => `<span class="chip ${cls}" style="--c:${p.color}"><span class="face"><span>${p.avatar}</span></span></span>`;

/** Scuttlebutt screens get a little retro window frame. */
const frame = (v, title, body) =>
  v.skin === 'retro'
    ? `<div class="win"><div class="win-bar"><span>${esc(title)}</span><span class="win-x">×</span></div><div class="win-body">${body}</div></div>`
    : `<div class="card parch">${body}</div>`;

const screens = {
  join(v) {
    return `<div class="center">
      <div class="flag">🏴‍☠️</div>
      <h1 class="title">${esc(v.title)}</h1>
      <form class="card parch" data-form="join">
        <label for="name">What do they call ye?</label>
        <input id="name" name="name" maxlength="12" autocomplete="off" autocapitalize="words" enterkeyhint="go" placeholder="Your name" value="${esc(localStorage.getItem(NAME_KEY) ?? '')}">
        <p class="error" id="error" hidden></p>
        <button class="btn" type="submit">Come aboard</button>
      </form>
      ${v.inGame ? '<p class="sub">A game is under way. Join now and you’ll be dealt in for the next one.</p>' : ''}
    </div>`;
  },

  lobby(v) {
    const games = v.games
      .map(
        (g) => `<button class="pick ${g.id === v.selected ? 'on' : ''}" data-act="select" data-game="${g.id}">
          <span class="pick-icon">${g.icon}</span>
          <span class="pick-text"><b>${esc(g.name)}</b><small>${esc(g.tagline)}</small></span>
        </button>`,
      )
      .join('');
    const chosen = v.games.find((g) => g.id === v.selected);
    const captain = v.isVip
      ? `<p class="sub">You’re the captain. Pick a game:</p>
         <div class="picks">${games}</div>
         ${
           chosen
             ? v.short
               ? `<p class="sub">Need ${v.short} more pirate${v.short > 1 ? 's' : ''} for ${esc(chosen.name)}.</p>`
               : '<button class="btn" data-act="start">Everyone’s in. Set sail!</button>'
             : ''
         }`
      : `<p class="sub">${chosen ? `Next up: <b>${chosen.icon} ${esc(chosen.name)}</b>` : `Captain ${esc(v.vipName)} is choosing a game…`}</p>`;
    return `<div class="center">
      <button class="avatar" data-act="looks" aria-label="Change your mascot and colour">${face(v.me, 'big')}<span class="avatar-edit" aria-hidden="true">✎</span></button>
      <p class="tiny">Tap to change your mascot and colour</p>
      <h1 class="title small">Welcome aboard, ${esc(v.me.name)}!</h1>
      <p class="tiny">${v.crew} in the crew</p>
      ${captain}
    </div>`;
  },

  wait(v) {
    return `<div class="center">
      <div class="big-icon">${v.icon ?? '👀'}</div>
      <h1 class="title small">${esc(v.text)}</h1>
      ${v.sub ? `<p class="sub">${esc(v.sub)}</p>` : ''}
    </div>`;
  },

  write(v) {
    return `<div class="fill">
      <form data-form="answer">
        ${frame(
          v,
          v.heading,
          `<p class="heading">${esc(v.heading)}</p>
           ${v.context ? `<div class="context"><small>${esc(v.context.label)}</small><p>“${esc(v.context.text)}”</p></div>` : ''}
           ${v.flag ? `<div class="muse">${flagTag(v.flag)}</div>` : ''}
           <p class="prompt">${esc(v.prompt)}</p>
           ${v.warn ? `<p class="warn">${esc(v.warn)}</p>` : ''}
           <textarea id="answer" name="text" rows="3" maxlength="${v.max}" placeholder="${esc(v.placeholder ?? '')}" autocomplete="off" enterkeyhint="send"></textarea>
           <div class="row"><span class="counter" id="counter">0 / ${v.max}</span><button class="btn" type="submit">Send</button></div>`,
        )}
      </form>
    </div>`;
  },

  choose(v) {
    const options = v.options
      .map(
        (o) => `<button class="option ${o.flag ? 'with-flag' : ''}" data-act="choose" data-id="${o.id}">
          ${o.flag ? flagTag(o.flag) : ''}<span><b>${esc(o.text)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>
        </button>`,
      )
      .join('');
    return `<div class="fill scroll">
      <p class="heading light">${esc(v.heading)}</p>
      ${v.prompt ? `<p class="prompt light">${esc(v.prompt)}</p>` : ''}
      <div class="options ${v.skin === 'retro' ? 'retro' : ''}">${options}</div>
    </div>`;
  },

  draw(v) {
    const inks = INKS.map((color, i) => `<button class="sw" data-act="ink" data-id="${i}" style="--c:${color}" aria-label="Paint colour ${i + 1}"></button>`).join('');
    const sizes = WIDTHS.map((w, i) => `<button class="tool size" data-act="size" data-id="${i}" aria-label="Brush size ${i + 1}"><i style="--d:${6 + i * 8}px"></i></button>`).join('');
    return `<div class="fill scroll draw">
      <p class="heading light">${esc(v.heading)}</p>
      ${v.prompt ? `<p class="draw-this"><small>Draw this:</small>${esc(v.prompt)}</p>` : ''}
      ${v.idea ? `<p class="tiny">Stuck? Try ${esc(v.idea)}.</p>` : ''}
      <div class="easel">
        <svg id="pad" viewBox="0 0 ${FLAG_W} ${FLAG_H}" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <rect id="padCloth" width="${FLAG_W}" height="${FLAG_H}"/>
          <g id="padInk"></g>
        </svg>
        <p id="padHint" class="pad-note">Draw here with your finger</p>
        <p id="padFull" class="pad-note low" hidden>Out of paint! Hoist it, or undo a bit.</p>
      </div>
      <div class="tools">
        <div class="tool-row">${inks}<button class="sw rubber" data-act="ink" data-id="${ERASER}" aria-label="Eraser">🧽</button></div>
        <div class="tool-row">
          ${v.noCloth ? '<i id="clothDot" hidden></i>' : '<button class="tool wide" data-act="cloth" aria-label="Change the cloth colour"><i id="clothDot"></i>Cloth</button>'}
          ${sizes}
          <button class="tool" id="undo" data-act="undo" aria-label="Undo">↩︎</button>
          <button class="tool" id="clear" data-act="clear" aria-label="Start again">🗑️</button>
        </div>
      </div>
      <button class="btn" id="hoist" data-act="hoist" disabled>${esc(v.send ?? 'Hoist it!')}</button>
    </div>`;
  },

  combine(v) {
    const flags = v.flags.map((f) => `<button class="hand-flag" data-act="pick-flag" data-id="${f.id}">${flagTag(f.id)}</button>`).join('');
    const names = v.names.map((n) => `<button class="option slim" data-act="pick-name" data-id="${n.id}"><b>${esc(n.text)}</b></button>`).join('');
    return `<div class="fill scroll combine">
      <p class="heading light">Launch a ship</p>
      <p class="prompt light">1. Pick a flag</p>
      <div class="hand-flags">${flags}</div>
      <p class="prompt light">2. Pick the name that suits it</p>
      <div class="options">${names}</div>
      <div class="launch-bar"><button class="btn" id="launch" data-act="launch" disabled>Launch the ship!</button></div>
    </div>`;
  },

  map(v) {
    const r = v.reveal;
    let foot;
    if (r) {
      const place = r.of > 1 ? (r.rank === 1 ? 'Closest of the whole crew!' : `${r.rank} of ${r.of} on the map`) : '';
      foot = `<p class="map-result">${r.bullseye ? '🎯 Spot on!' : `<b>${fmt(r.off)}</b> ${esc(r.unit)} off`} <span class="gain">+${fmt(r.points)}</span></p>
        <p class="tiny">${esc(r.name)}${place ? ` · ${place}` : ''}</p>`;
    } else if (v.locked) {
      foot = '<p class="locked">🔒 X locked in. Good luck!</p>';
    } else {
      foot = `<p class="tiny">Tap the map to drop your X. Pinch to zoom.</p>
        <button class="btn" data-act="lock" ${myPin ? '' : 'disabled'}>Lock in my X</button>`;
    }
    return `<div class="map-screen">
      ${!r && v.clue ? `<div class="map-clue" id="mapClue">${clueHtml(v.clue)}</div>` : ''}
      <div class="map-wrap">
        <div id="mapSlot"></div>
        <div class="zoom"><button data-act="zoom-in" aria-label="Zoom in">+</button><button data-act="zoom-out" aria-label="Zoom out">−</button></div>
      </div>
      <div class="map-foot">${foot}</div>
    </div>`;
  },

  ...bombardScreens, // Bombard!: bb-side, bb-aim, bb-watch (see bombard-play.js)
  ...liarsScreens, // LiAARRRRGH's Dice: ld-hand (see liars-play.js)
  ...onePieceScreens, // Find the One Piece: op-page, op-vote, op-roll, op-end (see onepiece-play.js)
  ...brigScreens, // To the Brig with Ye: tb-role, tb-wait, tb-pick, tb-nest, tb-helm, tb-brig (see tb-play.js)
  ...mutinyScreens, // Mutiny: mu-card, mu-wait, mu-ask, mu-hands, mu-vote, mu-guess (see mutiny-play.js)

  gameover(v) {
    return `<div class="center">
      <div class="big-icon">${v.won ? '🏆' : '🏴‍☠️'}</div>
      <h1 class="title">${v.won ? 'You won!' : `${esc(v.rank)} place`}</h1>
      <p class="sub">${fmt(v.score)} doubloons</p>
      ${v.canContinue ? '<button class="btn" data-act="continue">Back to port</button>' : '<p class="tiny">Waiting for the captain…</p>'}
    </div>`;
  },
};

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function render(v) {
  // Skip redraws that change nothing, so we never wipe out half-typed text.
  const json = JSON.stringify(v);
  if (json === lastJson) return;
  const previous = view;
  lastJson = json;
  view = v;
  busy = false;

  document.title = v.title;
  document.body.dataset.screen = v.screen;
  document.body.dataset.game = v.game ?? '';
  document.body.classList.toggle('retro', v.game === 'scuttlebutt');
  $('me').innerHTML = v.me ? `${face(v.me)}<b>${esc(v.me.name)}</b><span class="score">${v.game && !v.coop ? `💰 ${fmt(v.me.score)}` : ''}</span>` : '';

  // Flying Colours: when the clock runs out, send in whatever was on the easel
  // (or already picked) rather than losing it. The server waits a moment for these.
  const moved = previous?.screen !== v.screen || previous?.key !== v.key;
  if (moved) dismissQuestion(); // any "are you sure?" was about a screen that has gone
  if (v.screen === 'lobby') refreshLooks();
  else closeLooks();
  if (moved && previous?.screen === 'draw' && pad.key === previous.key) sendFlag(previous.key);
  if (moved && previous?.screen === 'combine' && pick.key === previous.key) sendPick(previous.key);
  // The easel and the pairing screen keep their own state; nothing to redraw until they change.
  if (!moved && (v.screen === 'draw' || v.screen === 'combine')) return;

  // The map screen only needs a full redraw when the round or lock state changes.
  // A new clue just changes the strip along the top.
  if (v.screen === 'map' && previous?.screen === 'map' && previous.key === v.key && previous.locked === v.locked && !previous.reveal === !v.reveal) {
    const strip = $('mapClue');
    if (strip && v.clue && v.clue.n !== previous.clue?.n) {
      strip.innerHTML = clueHtml(v.clue);
      strip.classList.remove('fresh');
      void strip.offsetWidth; // start the flash again
      strip.classList.add('fresh');
      navigator.vibrate?.(20);
    }
    return;
  }

  // Knot So Fast builds its race screen once and then only changes what moves (see knots-play.js).
  if (knotsShown(v, screenEl, send)) return;

  const typing = screenEl.querySelector('input, textarea');
  bombardShown(v);
  liarsShown(v);
  onePieceShown(v);
  brigShown(v);
  mutinyShown(v);
  const draft = typing && previous?.key === v.key ? { id: typing.id, value: typing.value } : null;
  screenEl.innerHTML = (screens[v.screen] ?? screens.wait)(v);
  if (draft && $(draft.id)) $(draft.id).value = draft.value;

  if (v.screen === 'map') {
    $('mapSlot').append(map.el);
    if (mapKey !== v.key) {
      mapKey = v.key;
      myPin = v.pin;
      requestAnimationFrame(() => map.reset());
    }
    myPin ??= v.pin;
    map.setPickable(!v.locked);
    if (v.reveal) {
      myPin = v.pin;
      drawReveal(v);
    } else drawPin();
    const lock = document.querySelector('[data-act="lock"]');
    if (lock) lock.disabled = !myPin;
  }

  if (v.screen === 'draw') setupPad(v.key, v);
  if (v.screen === 'combine') {
    Object.assign(pick, { key: v.key, flag: null, name: null, sent: false });
    refreshPick();
  }

  const input = $('answer');
  if (input) {
    input.addEventListener('input', () => ($('counter').textContent = `${input.value.length} / ${v.max}`));
    // Enter sends; nobody needs a line break in a one-liner.
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.form.requestSubmit();
      }
    });
    input.focus({ preventScroll: true });
  }
  if (previous?.key !== v.key) navigator.vibrate?.(['write', 'choose', 'map', 'draw', 'combine', 'bb-side', 'bb-aim', 'op-vote', 'op-roll'].includes(v.screen) ? 40 : 0);
}

// ---------------------------------------------------------------------------
// Taps and forms
// ---------------------------------------------------------------------------

screenEl.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, game, id } = el.dataset;
  // Flying Colours: the easel's tools and the pairing screen work on local state.
  if (['ink', 'size', 'cloth', 'undo', 'clear'].includes(act)) return padTool(act, id);
  if (act === 'hoist') return sendFlag(pad.key);
  if (act === 'pick-flag' || act === 'pick-name') {
    if (pick.sent) return;
    if (act === 'pick-flag') pick.flag = id;
    else pick.name = Number(id);
    navigator.vibrate?.(10);
    return refreshPick();
  }
  if (act === 'launch') return sendPick(pick.key);
  if (act === 'looks') return openLooks();
  if (act.startsWith('bb-')) return bombardTap(act, id, view, send);
  if (act.startsWith('ld-')) return liarsTap(act, id, view, send);
  if (act.startsWith('op-')) return onePieceTap(act, id, view, send);
  if (act.startsWith('tb-')) return brigTap(act, id, view, send);
  if (act.startsWith('mu-')) return mutinyTap(act, id, view, send);
  if (busy) return;
  if (act === 'zoom-in') return map.zoomBy(0.55);
  if (act === 'zoom-out') return map.zoomBy(1.8);
  if (act === 'choose') {
    busy = true;
    el.classList.add('chosen');
    // Send the option's own id back: most are numbers, but Parley's are player ids (strings).
    const option = view.options?.find((o) => String(o.id) === id);
    const result = await send({ type: 'choose', key: view.key, id: option ? option.id : Number(id) });
    if (result.error) busy = false;
    return;
  }
  if (act === 'lock') return send({ type: 'lock', key: view.key });
  send({ type: act, game });
});

screenEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if (busy) return;

  if (form.dataset.form === 'join') {
    const name = form.name.value.trim();
    if (!name) return form.name.focus();
    busy = true;
    const result = await post('/api/join', { name, token });
    busy = false;
    if (result.error) {
      $('error').textContent = result.error;
      $('error').hidden = false;
      return;
    }
    token = result.token;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(NAME_KEY, name);
    live.reconnect();
  }

  if (form.dataset.form === 'answer') {
    const text = form.text.value.trim();
    if (!text) return form.text.focus();
    busy = true;
    form.querySelector('button').textContent = 'Sending…';
    const result = await send({ type: 'answer', key: view.key, text });
    const retry = () => {
      busy = false;
      if (form.isConnected) form.querySelector('button').textContent = 'Try again';
    };
    if (result.error) retry();
    else setTimeout(() => form.isConnected && retry(), 3000); // the server normally swaps the screen straight away
  }
});

// ---------------------------------------------------------------------------

startTimers(() => view);
const live = connect(() => `token=${encodeURIComponent(token)}`, render);
