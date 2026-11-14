// Knot So Fast on the phones: one question, four big answers, and a thin strip
// saying where you are in the race. Questions come in waves; between them the
// phone covers up and tells you to watch the telly.
//
// This screen is built for speed, so it works differently from the others:
//   * The server sends the next few questions ahead of time, with the right
//     answer marked. A tap is judged here, at once, and the next question is
//     on screen before the server has even heard about it. (The server still
//     keeps the score: it checks every answer against what it dealt.)
//   * play.js normally redraws the whole screen whenever the server says
//     anything. Here that happens several times a second, so instead this
//     file builds the screen once per race and only changes the bits that
//     move. A redraw must never land between a thumb going down and coming up.
//   * Answers are taken on "pointerdown", the moment the thumb touches.

import { esc } from './common.js';

/** The six paint schemes, shared with the TV (see knots-host.js). */
export const PAINTS = [
  { name: 'red', sail: '#d2402f', hull: '#3d2b20', trim: '#e3b84f' },
  { name: 'navy', sail: '#3f74c4', hull: '#22344f', trim: '#e9e2cf' },
  { name: 'gold', sail: '#f2b632', hull: '#5a3a1e', trim: '#fff1c9' },
  { name: 'green', sail: '#46a85f', hull: '#27402d', trim: '#e3b84f' },
  { name: 'purple', sail: '#9a63d8', hull: '#35264d', trim: '#f0d9ff' },
  { name: 'black', sail: '#3a3a46', hull: '#17151c', trim: '#c8372d' },
];

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
const RIGHT_MS = 110; // how long a right answer stays green before the next question

// Everything this screen remembers between messages from the server.
const L = {
  key: null, // which race the screen is built for
  root: null,
  send: null,
  view: null,
  queue: [], // questions waiting to be asked; queue[0] is the one on screen
  seen: 0, // the highest question id taken from the server so far
  asked: null, // the question on screen and tappable right now
  askedAt: 0,
  locked: false, // true for a moment after an answer, right or wrong
  fuse: null, // timer for the powder question on screen
  noticeId: 0,
  noticeTimer: null,
  place: null,
  wave: 0, // which wave of questions the queue belongs to
};

const $ = (sel) => L.root?.querySelector(sel);

function build(el, v) {
  el.innerHTML = `<div class="kn" data-kind="${esc(v.kind)}" style="--sail:${PAINTS[v.paint % PAINTS.length].sail}">
    <div class="kn-strip">
      <div class="kn-line"><span class="kn-place"><b></b><small></small></span><span class="kn-ship"></span><span class="kn-lap"></span></div>
      <div class="kn-wind"><i></i></div>
      <p class="kn-gap"></p>
      <p class="kn-toast" hidden></p>
    </div>
    <div class="kn-card parch"><div class="kn-fuse"><i></i></div><p class="kn-cat"></p><p class="kn-q"></p></div>
    <p class="kn-mate" hidden></p>
    <div class="kn-answers">${[0, 1, 2, 3].map((i) => `<button class="kn-a" data-kn="${i}"><span></span></button>`).join('')}</div>
    <div class="kn-over" hidden></div>
  </div>`;
  Object.assign(L, { key: v.key, root: el.firstElementChild, queue: [], seen: 0, asked: null, locked: false, place: null, wave: v.wave ?? 0, noticeId: v.notice?.id ?? 0 });
  clearTimeout(L.fuse);
}

/** Put the question at the front of the queue on screen. */
function ask() {
  clearTimeout(L.fuse);
  L.locked = false;
  const d = L.queue[0];
  const card = $('.kn-card');
  L.root.classList.toggle('waiting', !d);
  card.classList.remove('gold', 'fizzled');
  if (!d) {
    L.asked = null;
    return;
  }
  L.asked = d;
  L.askedAt = performance.now();
  $('.kn-cat').textContent = d.c;
  $('.kn-q').textContent = d.q;
  L.root.querySelectorAll('.kn-a').forEach((b, i) => {
    b.className = 'kn-a';
    b.firstElementChild.textContent = d.o[i];
  });
  // Restart the little "new question" animation.
  card.classList.remove('fresh');
  void card.offsetWidth;
  card.classList.add('fresh');
  if (d.gold) light(d);
}

/** Turn the question on screen gold and start its fuse. */
function light(d) {
  if (d.lit || d.fizz) return;
  d.lit = true;
  const card = $('.kn-card');
  card.classList.add('gold');
  const seconds = L.view?.fuse ?? 8;
  const bar = $('.kn-fuse i');
  bar.style.animation = 'none';
  void bar.offsetWidth;
  bar.style.animation = `kn-fuse ${seconds}s linear forwards`;
  navigator.vibrate?.([30, 40, 30]);
  clearTimeout(L.fuse);
  L.fuse = setTimeout(() => {
    if (L.asked !== d) return;
    d.gold = false;
    d.fizz = true;
    card.classList.remove('gold');
    card.classList.add('fizzled');
  }, seconds * 1000);
}

/** Post an answer, trying again if the wifi dropped it. The server ignores anything it has already scored. */
async function post(message, tries = 0) {
  const result = await L.send(message);
  if (result?.error && tries < 4 && L.key === message.key) setTimeout(() => post(message, tries + 1), 400);
}

function answer(pick) {
  const d = L.asked;
  if (!d || L.locked || L.view?.phase !== 'go') return;
  L.locked = true;
  L.asked = null;
  L.queue.shift();
  clearTimeout(L.fuse);
  const right = pick === d.r;
  post({ type: 'kn-answer', key: L.key, deal: d.id, pick, ms: Math.round(performance.now() - L.askedAt), gold: d.gold === true, fizz: d.fizz === true });

  const buttons = L.root.querySelectorAll('.kn-a');
  buttons[d.r].classList.add('right');
  if (right) {
    navigator.vibrate?.(12);
    setTimeout(ask, RIGHT_MS);
  } else {
    buttons[pick].classList.add('wrong');
    for (const b of buttons) if (!b.classList.contains('right') && !b.classList.contains('wrong')) b.classList.add('dim');
    L.root.classList.remove('shake');
    void L.root.offsetWidth;
    L.root.classList.add('shake', 'locked');
    navigator.vibrate?.([70, 40, 70]);
    setTimeout(() => {
      L.root.classList.remove('locked');
      ask();
    }, L.view?.lock ?? 1000);
  }
}

function toast(notice) {
  const el = $('.kn-toast');
  el.textContent = notice.text;
  el.dataset.tone = notice.tone ?? '';
  el.hidden = false;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  if (notice.tone === 'bad') navigator.vibrate?.([120, 60, 120]);
  clearTimeout(L.noticeTimer);
  L.noticeTimer = setTimeout(() => (el.hidden = true), 2200);
}

const names = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0]);

/** What covers the question when there isn't one to answer: the countdown, the finish, the gap between waves. */
function overlay(v) {
  if (v.phase === 'ready') {
    const who = v.kind === 'scramble' ? 'Thumbs ready…' : v.mates.length ? `Aboard <b>${esc(v.ship)}</b> with ${v.mates.map(esc).join(' and ')}` : `Aboard <b>${esc(v.ship)}</b>`;
    return `<p class="kn-lead">${who}</p><div class="kn-count">${v.count || 'GO!'}</div>`;
  }
  if (v.done != null) {
    const head = v.kind === 'scramble' ? 'Oars down!' : v.done === 1 ? 'You won!' : 'Home!';
    return `<div class="kn-flag">${v.done === 1 ? '🏆' : '🏁'}</div><h2>${head}</h2><p class="kn-lead">${ordinal(v.done)} of ${v.ships}${v.phase === 'over' ? '' : '. Shout at the others.'}</p>`;
  }
  if (v.rest) {
    const still = v.still?.length ? `Waiting on ${esc(names(v.still.slice(0, 3)))}${v.still.length > 3 ? ' and co' : ''}…` : 'Next wave in a moment…';
    return `<div class="kn-flag kn-eyes">👀</div><h2>Eyes on the telly!</h2><p class="kn-lead">${still}</p>`;
  }
  return null;
}

/**
 * Called by play.js every time the server sends a view. Returns true if this
 * file has dealt with it (so play.js must leave the screen alone).
 */
export function knotsShown(v, el, send) {
  if (v.screen !== 'kn-race') {
    if (L.key) {
      clearTimeout(L.fuse);
      Object.assign(L, { key: null, root: null, view: null, queue: [], asked: null });
    }
    return false;
  }
  L.send = send;
  if (L.key !== v.key || !L.root?.isConnected) build(el, v);
  L.view = v;

  // --- the strip ---
  $('.kn-place b').textContent = ordinal(v.place);
  $('.kn-place small').textContent = ` of ${v.ships}`;
  $('.kn-ship').textContent = v.kind === 'scramble' ? 'The Scramble' : v.ship;
  $('.kn-lap').textContent = v.laps ? `Lap ${v.lap}/${v.laps}` : '';
  $('.kn-wind i').style.width = `${Math.round(v.wind * 100)}%`;
  $('.kn-gap').textContent = v.gap ? `${v.gap.leagues} league${v.gap.leagues === 1 ? '' : 's'} ${v.gap.dir} ${v.gap.name}` : '';
  L.root.classList.toggle('holed', !!v.holed);
  L.root.classList.toggle('rolling', !!v.roll);
  L.root.classList.toggle('home', v.done != null);
  if (L.place != null && v.place !== L.place && v.phase === 'go') {
    const strip = $('.kn-strip');
    strip.classList.remove('up', 'down');
    void strip.offsetWidth;
    strip.classList.add(v.place < L.place ? 'up' : 'down');
  }
  L.place = v.place;
  if (v.notice && v.notice.id !== L.noticeId) {
    L.noticeId = v.notice.id;
    toast(v.notice);
  }
  const mate = $('.kn-mate');
  mate.hidden = !v.mate;
  if (v.mate) mate.textContent = `🧨 ${v.mate} has the powder question. Help them!`;

  // --- a new wave: forget anything left over from the last one, and give a nudge to look down ---
  if ((v.wave ?? 0) !== L.wave) {
    if (L.wave && v.phase === 'go') navigator.vibrate?.([25, 50, 25]);
    L.wave = v.wave ?? 0;
    L.queue = [];
    L.asked = null;
  }

  // --- the question ---
  const cover = overlay(v);
  const over = $('.kn-over');
  const coverKey = cover ? `${v.phase}:${v.count}:${v.done}:${v.rest}:${v.still?.join()}` : '';
  if (over.dataset.key !== coverKey) {
    over.dataset.key = coverKey;
    over.hidden = !cover;
    over.innerHTML = cover ?? '';
  }
  L.root.classList.toggle('covered', !!cover);
  if (cover) return true;

  for (const d of v.hand) {
    if (d.id > L.seen) {
      L.seen = d.id;
      L.queue.push({ ...d });
    }
  }
  if (v.powder != null) {
    const d = L.queue.find((x) => x.id === v.powder);
    if (d && !d.fizz) {
      d.gold = true;
      if (d === L.asked) light(d);
    }
  }
  if (!L.asked && !L.locked) ask();
  return true;
}

// Answers are taken the moment a thumb touches the glass. (Keys 1 to 4 work too, for trying it on a laptop.)
document.addEventListener('pointerdown', (e) => {
  const button = L.root && e.target.closest?.('[data-kn]');
  if (!button || !L.root.contains(button)) return;
  e.preventDefault();
  answer(Number(button.dataset.kn));
});
document.addEventListener('keydown', (e) => {
  if (L.root?.isConnected && ['1', '2', '3', '4'].includes(e.key)) answer(Number(e.key) - 1);
});
