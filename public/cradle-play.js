// Cradle to Kraken on the phones: the ship's wheel you flick to spin, the
// orders you give each year, bets on raids, tales, and your sea chest.
//
// play.js owns the page; this file supplies the ck-* screens and handles their
// taps. Every screen carries the same two extras from the server: `pour` (a
// drink you've just been told to take, shown as a banner) and `status` (your
// doubloons, ship, crew, maps, cards and shipmate, along the bottom).

import { esc, fmt } from './common.js';

const face = (p) => `<span class="chip" style="--c:${esc(p.color)}"><span class="face"><span>${esc(p.avatar)}</span></span></span>`;
const swigs = (n) => `${n} swig${n === 1 ? '' : 's'}`;

// What this phone remembers between redraws.
const local = {
  spin: { key: null, at: 0, roll: null, sent: false }, // the wheel's animation
  fair: false, // "play Fair Winds" ticked on the wheel
  give: new Map(), // task id -> [ids] of swigs handed out so far
  card: new Map(), // task id -> the card picked, waiting for a target
  sent: new Set(), // task ids already answered, waiting for the server
  chest: false, // the sea chest opened up
  poured: null, // the last drink banner we buzzed for
};

// ---------------------------------------------------------------------------
// The ship's wheel
// ---------------------------------------------------------------------------

const SPOKES = 10;
const SPIN_MS = 2600;

/** A ship's wheel with the numbers 1 to 10 on its handles. `turn` is how far it has turned (degrees). */
function wheelSvg(cls = '', style = '') {
  const spokes = [];
  const numbers = [];
  for (let i = 0; i < SPOKES; i++) {
    const a = (i / SPOKES) * Math.PI * 2;
    const x = (r) => (100 + Math.sin(a) * r).toFixed(1);
    const y = (r) => (100 - Math.cos(a) * r).toFixed(1);
    spokes.push(`<line x1="${x(18)}" y1="${y(18)}" x2="${x(92)}" y2="${y(92)}" class="ck-spoke"/><ellipse cx="${x(88)}" cy="${y(88)}" rx="7" ry="7" class="ck-handle"/>`);
    numbers.push(`<text x="${x(56)}" y="${y(56)}" class="ck-num" transform="rotate(${(i * 360) / SPOKES} ${x(56)} ${y(56)})">${i + 1}</text>`);
  }
  return `<svg viewBox="0 0 200 200" class="ck-wheel ${cls}">
    <g class="ck-wheel-turn" style="${style}">
      ${spokes.join('')}
      <circle cx="100" cy="100" r="66" class="ck-rim"/><circle cx="100" cy="100" r="66" class="ck-rim-in"/>
      ${numbers.join('')}
      <circle cx="100" cy="100" r="20" class="ck-hub"/><circle cx="100" cy="100" r="7" class="ck-hub-in"/>
    </g>
  </svg><div class="ck-pointer">▼</div>`;
}

/** The wheel, turning towards whatever the server rolled (resuming mid-spin on a redraw). */
function wheel(v) {
  const s = local.spin;
  if (s.key !== v.key) Object.assign(s, { key: v.key, at: 0, roll: null, sent: false });
  if (v.roll && s.roll !== v.roll) Object.assign(s, { roll: v.roll, at: Date.now() });
  if (!v.roll) return `<div class="ck-wheel-box ${s.sent ? 'whirl' : ''}" data-act="ck-flick">${wheelSvg()}</div>`;
  const target = -((v.roll - 1) * 360) / SPOKES - 360 * 5;
  const elapsed = Date.now() - s.at;
  const style = elapsed > SPIN_MS ? `--to:${target}deg` : `--to:${target}deg;animation-delay:${-elapsed}ms`;
  return `<div class="ck-wheel-box ${elapsed > SPIN_MS ? 'still' : 'settle'}">${wheelSvg('', style)}</div>`;
}

function helm(v) {
  const done = v.roll != null;
  const fresh = done && Date.now() - local.spin.at < SPIN_MS + 200;
  let head;
  let foot;
  if (v.mode === 'duel') {
    head = `<p class="ck-kick">${v.raider ? 'You’re raiding' : 'You’re being raided by'}</p><h2 class="ck-h">${esc(v.foe)}!</h2><p class="ck-sub">Spin high. ${v.bonus ? `Your ship and calling add +${v.bonus}.` : ''}</p>`;
    foot = done ? `<p class="ck-result ${fresh ? 'wait' : ''}">You spun <b>${v.roll}</b>${v.bonus ? ` + ${v.bonus} = <b>${v.roll + v.bonus}</b>` : ''}</p>` : '';
  } else if (v.mode === 'job') {
    head = '<p class="ck-kick">The Kraken’s hoard</p><h2 class="ck-h">One Last Job</h2><p class="ck-sub">1–3 caught (half your doubloons) · 4–6 ×1.25 · 7–9 ×1.6 · 10 doubles it</p>';
    foot = done ? `<p class="ck-result ${fresh ? 'wait' : ''}">You spun <b>${v.roll}</b></p>` : '';
  } else {
    head = `<p class="ck-kick">Year ${v.status?.year ?? ''}</p><h2 class="ck-h">Spin the helm!</h2><p class="ck-sub">Flick the wheel, or tap the button.${v.becalmed ? ' <b>Becalmed:</b> this spin is halved.' : ''}</p>`;
    foot = done ? `<p class="ck-result ${fresh ? 'wait' : ''}">You spun <b>${v.roll}</b>${v.move !== v.roll ? `: sail <b>${v.move}</b>` : ''}${v.why ? `<small>${esc(v.why)}</small>` : ''}</p>` : '';
  }
  const fair = v.canFair && !done ? `<button class="ck-toggle ${local.fair ? 'on' : ''}" data-act="ck-fair">🌬️ Play Fair Winds <small>+3 to this spin</small></button>` : '';
  const button = done ? '' : `<button class="btn ck-spin" data-act="ck-spin" ${local.spin.sent ? 'disabled' : ''}>${local.spin.sent ? 'Spinning…' : 'Spin the helm!'}</button>`;
  return `<div class="ck-panel ck-helm">${head}${wheel(v)}${foot}${fair}${button}</div>`;
}

// ---------------------------------------------------------------------------
// The orders: everything to decide this year
// ---------------------------------------------------------------------------

const person = (p, act, task, extra = '', cls = '') =>
  `<button class="ck-person ${cls}" data-act="${act}" data-task="${task}" data-value="${esc(p.id)}">${face(p)}<b>${esc(p.name)}</b><small>💰 ${fmt(p.cash)}</small>${extra}</button>`;

function taskCard(t, v) {
  const id = esc(t.id);
  const choice = (value, label, sub = '', cls = '') => `<button class="ck-choice ${cls}" data-act="ck-task" data-task="${id}" data-value="${esc(JSON.stringify(value))}"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</button>`;
  const cash = v.status?.cash ?? 0;
  switch (t.kind) {
    case 'fork':
      return `<h3>🪧 Which way, captain?</h3>${t.options.map((o) => choice(o.id, esc(o.name), esc(o.blurb), o.risky ? 'risky' : '')).join('')}`;
    case 'ship': {
      const rows = t.options.map((o) => choice(o.id, `${o.icon} ${esc(o.name)} · ${fmt(o.price)}`, `Room for ${o.crew} crew · +${o.duel} in a duel${o.price > cash ? ' · the loan shark will chip in' : ''}`)).join('');
      return `<h3>🔨 The shipyard</h3><p class="ck-note">You’ve made captain: share-outs pay more from now on. Trade in your ${esc(v.status.ship.name.toLowerCase())} for something bigger? It sells for more at the end and carries more crew.</p>${rows}${choice('keep', `Keep my ${esc(v.status.ship.name.toLowerCase())}`)}`;
    }
    case 'map':
      return `<h3>🗺️ A treasure map</h3><p class="ck-note">Costs ${fmt(t.cost)}. Pays you ${fmt(t.pays)} every time ANYONE spins its number, for the rest of the game.</p>
        <div class="ck-numbers">${t.options.map((n) => `<button class="ck-number" data-act="ck-task" data-task="${id}" data-value="${n}">${n}</button>`).join('')}</div>${choice('pass', 'No thanks')}`;
    case 'raid':
      return `<h3>⚔️ Raid a rival!</h3><p class="ck-note">You both spin. Win and you take a fifth of their doubloons (more from the richest). Lose and you pay them.</p><div class="ck-people">${t.people.map((p) => person(p, 'ck-task', id)).join('')}</div>`;
    case 'propose':
      return `<h3>💍 Tortuga</h3><p class="ck-note">Propose to a crewmate. Say yes and you’re shipmates: wedding presents all round, and from now on you drink together.</p><div class="ck-people">${t.people.map((p) => person(p, 'ck-task', id)).join('')}</div>${choice('sea', '🌊 Marry the sea', 'A quiet life, and a little gift')}`;
    case 'answer':
      return `<h3>💌 A proposal!</h3><p class="ck-note">Say yes and you’re shipmates: you drink together for the rest of the game. Say no and they drink alone.</p><div class="ck-people">${t.people.map((p) => person(p, 'ck-task', id, '<i>Say yes</i>')).join('')}</div>${choice('none', 'Turn them down', 'They’ll need a drink')}`;
    case 'give': {
      const given = local.give.get(t.id) ?? [];
      const left = t.n - given.length;
      const pips = (pid) => given.filter((g) => g === pid).length;
      return `<h3>🍺 Hand out ${swigs(t.n)}</h3>${t.text ? `<p class="ck-note">${esc(t.text)}</p>` : ''}
        <div class="ck-people">${t.people.map((p) => person(p, 'ck-give', id, pips(p.id) ? `<i class="ck-pips">${'🍺'.repeat(pips(p.id))}</i>` : '', pips(p.id) ? 'on' : '')).join('')}</div>
        <div class="ck-row"><button class="ck-choice slim" data-act="ck-give-undo" data-task="${id}" ${given.length ? '' : 'disabled'}>↩︎ Undo</button>
        <button class="btn" data-act="ck-give-send" data-task="${id}" ${left ? 'disabled' : ''}>${left ? `${swigs(left)} to go` : 'Pour them!'}</button></div>`;
    }
    case 'retire':
      return `<h3>🐙 You made it to the Lair!</h3><p class="ck-note">Retire now. Your choice:</p>
        ${choice('sunset', '🌅 Sunset Cove', `A safe pension of ${fmt(t.pension)}. Feet up.`)}
        ${choice('job', '💀 One Last Job', 'At the end, one spin: 1–3 caught (lose half), 4–6 ×1.25, 7–9 ×1.6, 10 doubles your doubloons', 'risky')}`;
    case 'card': {
      const picked = local.card.get(t.id);
      if (picked) {
        return `<h3>${picked.icon} ${esc(picked.name)}</h3><p class="ck-note">Who’s it for?</p><div class="ck-people">${t.people.map((p) => person(p, 'ck-card-at', id)).join('')}</div>${`<button class="ck-choice slim" data-act="ck-card-back" data-task="${id}">↩︎ Back</button>`}`;
      }
      return `<h3>🃏 Play a fate card?</h3>${t.cards.map((c) => `<button class="ck-choice card" data-act="ck-card" data-task="${id}" data-value="${esc(c.id)}"><b>${c.icon} ${esc(c.name)}</b><small>${esc(c.text)}</small></button>`).join('')}${choice('skip', 'Keep my cards for now')}`;
    }
    case 'haunt':
      return `<h3>👻 Haunt the living</h3><p class="ck-note">Pick a pirate still at sea: they take a swig and pay you a little.</p><div class="ck-people">${t.people.map((p) => person(p, 'ck-task', id)).join('')}</div>${choice('skip', 'Rest in peace this year')}`;
  }
  return '';
}

function decide(v) {
  const tasks = v.tasks.filter((t) => !local.sent.has(`${v.key}:${t.id}`));
  if (!tasks.length) return `<div class="ck-panel"><div class="big-icon">⏳</div><h2 class="ck-h">Sending…</h2></div>`;
  return `<div class="ck-orders">${tasks.map((t) => `<section class="ck-task parch ck-${t.kind}">${taskCard(t, v)}</section>`).join('')}</div>`;
}

// ---------------------------------------------------------------------------
// The other screens
// ---------------------------------------------------------------------------

function calling(v) {
  const cards = v.options
    .map((c) => `<button class="ck-calling parch" data-act="ck-calling" data-value="${esc(c.id)}">
      <span class="ck-calling-icon">${c.icon}</span><b>${esc(c.name)}</b>
      <span class="ck-wage">🪙 ${fmt(c.share)} a share-out</span>
      <small>${esc(c.perk)}</small>
    </button>`)
    .join('');
  return `<div class="ck-panel"><p class="ck-kick">Your life at sea begins</p><h2 class="ck-h">Pick a calling</h2><p class="ck-sub">It sets your wages, and gives you a trick. You start with ${fmt(v.purse)} doubloons.</p><div class="ck-callings">${cards}</div></div>`;
}

function wager(v) {
  const side = (s, k) => `<button class="ck-choice ck-bet" data-act="ck-bet" data-value="${k}"><b>Back ${esc(s.name)}</b><small>${s.bonus ? `+${s.bonus} on the spin` : 'no bonus'}</small></button>`;
  return `<div class="ck-panel"><p class="ck-kick">A raid!</p><h2 class="ck-h">${esc(v.a.name)} <i>v</i> ${esc(v.b.name)}</h2>
    <p class="ck-sub">Who wins? Right: +${fmt(v.stake)}. Wrong: ${v.drink ? 'a swig' : 'a fine'}.</p>${side(v.a, 'a')}${side(v.b, 'b')}</div>`;
}

function tale(v) {
  if (v.role === 'teller') {
    return `<div class="ck-panel ck-tale"><p class="ck-kick">${v.truth ? 'Truth or rum' : 'A tavern tale'}</p><p class="ck-prompt">${esc(v.prompt)}</p>
      <p class="ck-sub">${v.truth ? 'Answer it out loud, honestly.' : 'Tell it out loud to the room. Make it good: the crew votes Legend or Bilge.'}</p>
      <button class="btn" data-act="ck-told">I’m done</button></div>`;
  }
  return `<div class="ck-panel ck-tale"><p class="ck-kick">Listen to ${esc(v.teller)}</p><p class="ck-prompt">${esc(v.prompt)}</p>${v.truth ? '' : '<p class="ck-sub">You’ll vote when they’re done.</p>'}</div>`;
}

const vote = (v) => `<div class="ck-panel ck-tale"><p class="ck-kick">${esc(v.teller)}’s tale</p><p class="ck-prompt small">${esc(v.prompt)}</p>
  <div class="ck-row"><button class="ck-choice ck-legend" data-act="ck-vote" data-value="legend"><b>🏆 Legend</b></button><button class="ck-choice ck-bilge" data-act="ck-vote" data-value="bilge"><b>🪣 Bilge</b></button></div></div>`;

const truth = (v) => `<div class="ck-panel ck-tale"><p class="ck-kick">Truth or rum</p><p class="ck-prompt">${esc(v.prompt)}</p>
  <div class="ck-row"><button class="ck-choice" data-act="ck-truth" data-value="answer"><b>🗣️ I’ll answer</b></button><button class="ck-choice ck-bilge" data-act="ck-truth" data-value="drink"><b>🍺 I’ll drink</b></button></div></div>`;

function wait(v) {
  const news = v.news?.length ? `<ul class="ck-news">${v.news.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
  return `<div class="ck-panel ck-wait"><div class="big-icon">${v.icon ?? '👀'}</div><h2 class="ck-h">${esc(v.text)}</h2>${v.where ? `<p class="ck-sub">${esc(v.where)}</p>` : ''}${news}</div>`;
}

// ---------------------------------------------------------------------------
// The frame round every screen: the drink banner and the sea chest
// ---------------------------------------------------------------------------

// A drink stays on screen for a while even when the big screen moves on, so nobody misses it.
let lastPour = { html: '', until: 0 };
function pourBanner(v) {
  if (!v.pour) return Date.now() < lastPour.until ? lastPour.html : '';
  const html = pourHtml(v);
  if (html !== lastPour.html) lastPour = { html, until: Date.now() + 7000 };
  return html;
}
function pourHtml(v) {
  if (v.pour.n === 0) return `<div class="ck-pour saved"><b>🫀 Iron Liver!</b><small>Not a drop.</small></div>`;
  return v.drink
    ? `<div class="ck-pour"><b>🍺 Take ${swigs(v.pour.n)}</b><small>${esc(v.pour.why)}</small></div>`
    : `<div class="ck-pour"><b>💸 Fined ${fmt(v.pour.fine)}</b><small>${esc(v.pour.why)}</small></div>`;
}

function chest(v) {
  const s = v.status;
  if (!s?.calling) return '';
  const room = `${s.crew.length}/${s.room}`;
  const strip = `<button class="ck-chest-bar" data-act="ck-chest">
    <span>💰 <b>${fmt(s.cash)}</b>${s.iou ? ` <em>🦈 ${s.iou}</em>` : ''}</span><span>${s.ship.icon} ${room}</span><span>🗺️ ${s.maps.length ? s.maps.join(' ') : '–'}</span><span>🃏 ${s.cards.length}</span>${s.drink ? `<span>🍺 ${s.swigs}</span>` : ''}<i>${local.chest ? '▾' : '▴'}</i>
  </button>`;
  if (!local.chest) return `<div class="ck-chest">${strip}</div>`;
  const cards = s.cards.length ? s.cards.map((c) => `<li><b>${c.icon} ${esc(c.name)}</b> ${esc(c.text)}</li>`).join('') : '<li class="dim">No fate cards</li>';
  return `<div class="ck-chest open">${strip}<div class="ck-chest-body">
    <p><b>${s.calling.icon} ${esc(s.calling.name)}${s.captain ? ' · Captain' : ''}</b> · 🪙 ${fmt(s.share)} a share-out<br><small>${esc(s.calling.perk)}</small></p>
    <p>${s.ship.icon} <b>${esc(s.ship.name)}</b> · room for ${s.room} crew · +${s.ship.duel} in a duel${s.crew.length ? `<br><small>Crew: ${s.crew.map(esc).join(', ')}</small>` : ''}</p>
    ${s.mate ? `<p>💍 Shipmate: <b>${esc(s.mate)}</b> (you drink together)</p>` : ''}
    ${s.iou ? `<p>🦈 You owe the loan shark ${s.iou} IOU${s.iou > 1 ? 's' : ''}, settled at the end.</p>` : ''}
    <ul class="ck-cards">${cards}</ul>
  </div></div>`;
}

const SCREENS = { 'ck-calling': calling, 'ck-helm': helm, 'ck-decide': decide, 'ck-wager': wager, 'ck-tale': tale, 'ck-vote': vote, 'ck-truth': truth, 'ck-wait': wait };

const frame = (fn) => (v) => `<div class="fill scroll ck-screen">${pourBanner(v)}${fn(v)}${chest(v)}</div>`;
export const cradleScreens = Object.fromEntries(Object.entries(SCREENS).map(([k, fn]) => [k, frame(fn)]));

// ---------------------------------------------------------------------------
// Taps
// ---------------------------------------------------------------------------

let shown = null;
const redraw = () => {
  const el = document.getElementById('screen');
  if (el && shown && SCREENS[shown.screen]) el.innerHTML = cradleScreens[shown.screen](shown);
};

async function spin(view, send) {
  if (local.spin.sent || view.roll != null) return;
  local.spin.sent = true;
  navigator.vibrate?.([20, 30, 20, 30, 20]);
  redraw();
  const key = view.key;
  const result = await send({ type: 'ck-spin', key, fair: local.fair });
  local.fair = false;
  if (result?.error) {
    local.spin.sent = false;
    redraw();
  }
}

/** Send one answer to a task, and hide it straight away. */
async function answer(view, send, task, value) {
  const mark = `${view.key}:${task}`;
  if (local.sent.has(mark)) return;
  local.sent.add(mark);
  navigator.vibrate?.(15);
  redraw();
  const result = await send({ type: 'ck-task', key: view.key, task, value });
  if (result?.error) {
    local.sent.delete(mark);
    redraw();
  }
}

export async function cradleTap(act, el, view, send) {
  if (!view?.screen?.startsWith('ck-')) return;
  const { task, value } = el.dataset;
  switch (act) {
    case 'ck-chest':
      local.chest = !local.chest;
      return redraw();
    case 'ck-calling':
      navigator.vibrate?.(20);
      el.classList.add('chosen');
      return send({ type: 'ck-calling', id: value });
    case 'ck-fair':
      local.fair = !local.fair;
      return redraw();
    case 'ck-spin':
    case 'ck-flick':
      return spin(view, send);
    case 'ck-task': {
      let v = value;
      try {
        v = JSON.parse(value);
      } catch {}
      return answer(view, send, task, v);
    }
    case 'ck-give': {
      const t = view.tasks?.find((x) => x.id === task);
      const list = local.give.get(task) ?? [];
      if (!t || list.length >= t.n) return;
      local.give.set(task, [...list, value]);
      navigator.vibrate?.(10);
      return redraw();
    }
    case 'ck-give-undo':
      local.give.set(task, (local.give.get(task) ?? []).slice(0, -1));
      return redraw();
    case 'ck-give-send':
      return answer(view, send, task, local.give.get(task) ?? []);
    case 'ck-card': {
      const t = view.tasks?.find((x) => x.id === task);
      const card = t?.cards.find((c) => c.id === value);
      if (!card) return;
      if (!card.target) return answer(view, send, task, { card: card.id });
      local.card.set(task, card);
      return redraw();
    }
    case 'ck-card-at': {
      const card = local.card.get(task);
      if (!card) return;
      local.card.delete(task);
      return answer(view, send, task, { card: card.id, target: value });
    }
    case 'ck-card-back':
      local.card.delete(task);
      return redraw();
    case 'ck-bet':
      el.classList.add('chosen');
      navigator.vibrate?.(20);
      return send({ type: 'ck-bet', key: view.key, side: value });
    case 'ck-vote':
      el.classList.add('chosen');
      navigator.vibrate?.(20);
      return send({ type: 'ck-vote', key: view.key, vote: value });
    case 'ck-truth':
      el.classList.add('chosen');
      return send({ type: 'ck-truth', key: view.key, choice: value });
    case 'ck-told':
      el.disabled = true;
      return send({ type: 'ck-told', key: view.key });
  }
}

// Flicking the wheel: a quick drag across it spins it, like the real thing.
let flick = null;
document.addEventListener('pointerdown', (e) => {
  const box = e.target.closest?.('.ck-wheel-box[data-act="ck-flick"]');
  if (!box) return;
  flick = { x: e.clientX, y: e.clientY, t: performance.now() };
});
document.addEventListener('pointerup', (e) => {
  if (!flick) return;
  const d = Math.hypot(e.clientX - flick.x, e.clientY - flick.y);
  flick = null;
  if (d > 40 && shown?.screen === 'ck-helm' && shown.roll == null) spin(shown, sendRef);
});
let sendRef = null;

/**
 * Called by play.js on every redraw. Buzzes the phone for a drink or a fresh
 * set of orders, and keeps the wheel spinning smoothly. Returns true if it drew
 * the screen itself.
 */
export function cradleShown(v, screenEl, send) {
  const was = shown;
  shown = v;
  sendRef = send;
  if (!v.screen?.startsWith('ck-')) return false;
  const pourId = v.pour ? `${v.key}:${v.pour.n}:${v.pour.why}` : null;
  if (pourId && pourId !== local.poured) {
    local.poured = pourId;
    navigator.vibrate?.([120, 60, 120, 60, 240]);
  }
  if (v.screen !== was?.screen || v.key !== was?.key) {
    if (['ck-helm', 'ck-decide', 'ck-wager', 'ck-vote', 'ck-truth', 'ck-calling'].includes(v.screen)) navigator.vibrate?.([60, 40, 60]);
  }
  if (v.screen !== 'ck-decide') {
    local.give.clear();
    local.card.clear();
  }
  // The wheel redraws itself only when the roll lands, so a stray update never jerks it.
  if (v.screen === 'ck-helm' && was?.screen === 'ck-helm' && was.key === v.key && was.roll === v.roll) {
    const bar = screenEl.querySelector('.ck-chest');
    if (bar) bar.outerHTML = chest(v);
    return true;
  }
  return false;
}
