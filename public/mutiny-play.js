// Mutiny on the phones: your secret (the watchword, or the news that you are
// the Chameleon), and whatever this plot needs from you: pick a question,
// put your hand up or keep it down, accuse somebody, guess the watchword.
//
// play.js owns the page; this file supplies the screens (they all start "mu-")
// and handles their taps. Most screens end with the same strip along the
// bottom, where a tap shows your secret again for a few seconds.

import { esc } from './common.js';

const chip = (o) => `<span class="chip" style="--c:${esc(o.color)}"><span class="face"><span>${esc(o.avatar)}</span></span><span class="nm">${esc(o.name)}</span></span>`;
const HAND = { true: '✋', false: '✊', null: '?' };

// What this phone has done but the server has not confirmed yet. It lives here,
// not on the server, so it survives the page being redrawn.
const local = {
  peek: false, // the secret strip is open
  peekTimer: null,
  turned: null, // the key of the card that has been turned face up
  writing: null, // the key of the question screen where "write your own" is open
  sent: null, // the key of the screen whose answer is on its way
};

// ---------------------------------------------------------------------------
// The pieces every screen shares
// ---------------------------------------------------------------------------

/** The watchword as this phone should say it: a thing in quotes, or a crewmate by name. */
const watchword = (v) => (v.kind === 'crew' ? `${esc(v.word)}${v.me ? ' (that’s you)' : ''}` : esc(v.word));

/** The strip along the bottom: tap it to see your secret. */
function secret(v) {
  if (v.unmasked || v.spy === undefined) return '';
  if (!local.peek) return '<button class="mu-secret" data-act="mu-peek">🤫 <b>Your secret</b><small>tap to peek</small></button>';
  return v.spy
    ? '<button class="mu-secret open spy" data-act="mu-peek">🦎 <b>You’re the Chameleon</b><small>blend in</small></button>'
    : `<button class="mu-secret open" data-act="mu-peek">🗝️ <b>${watchword(v)}</b><small>the watchword</small></button>`;
}

const page = (v, body, cls = '') => `<div class="fill scroll mu ${cls}"><div class="mu-body">${body}</div>${secret(v)}</div>`;
const progress = (v) => (v.of > 1 ? `<p class="tiny">Question ${v.q} of ${v.of}</p>` : '');

// ---------------------------------------------------------------------------
// The screens
// ---------------------------------------------------------------------------

/** The start of a plot: a card, face down. Turn it over to learn the watchword, or that you don't know it. */
function card(v) {
  if (v.ready) {
    return page(v, '<div class="big-icon">🤐</div><h1 class="title small">Not a word.</h1><p class="sub">Waiting for the rest of the crew…</p>');
  }
  if (local.turned !== v.key) {
    return `<div class="fill mu"><div class="mu-body">
      <button class="mu-card back" data-act="mu-turn">
        <span class="mu-card-icon">🤫</span>
        <b>${v.crewRound ? 'One of Us' : esc(v.topic)}</b>
        <small>Make sure nobody can see your phone, then tap to turn the card over.</small>
      </button>
    </div></div>`;
  }
  const face = v.spy
    ? `<div class="mu-card spy">
        <span class="mu-card-icon">🦎</span>
        <b>You are the Chameleon</b>
        <p>Everybody else knows the watchword. You don’t. It is ${v.kind === 'crew' ? '<em>one of the crew</em>' : `something from <em>${esc(v.topic)}</em>`}.</p>
        <ul><li>Answer every question as if you knew.</li><li>Watch the hands and work out what it is.</li><li>If they catch you, name the watchword and you still get away.</li></ul>
      </div>`
    : `<div class="mu-card crew">
        <span class="mu-card-icon">🗝️</span>
        <small>The watchword is</small>
        <b class="mu-word">${watchword(v)}</b>
        <p>One of the crew doesn’t know it: the Chameleon. ${v.me ? 'Answer about yourself, honestly.' : 'Answer honestly.'}</p>
        <ul><li>Spot who is guessing.</li><li>Don’t give the watchword away: a caught Chameleon who names it goes free.</li></ul>
      </div>`;
  return `<div class="fill scroll mu"><div class="mu-body">${face}${v.double ? '<p class="tiny">The last plot: everything pays double.</p>' : ''}<button class="btn" data-act="mu-ready">Got it. Hide this</button></div></div>`;
}

function wait(v) {
  return page(
    v,
    `<div class="big-icon">${esc(v.icon ?? '👀')}</div>
     <h1 class="title small">${esc(v.text)}</h1>
     ${v.sub ? `<p class="sub">${esc(v.sub)}</p>` : ''}`,
  );
}

/** The bosun: choose what the crew is asked, or write it. No secret strip here, so the keyboard has room. */
function ask(v) {
  const sent = local.sent === v.key;
  if (local.writing === v.key) {
    return `<div class="fill scroll mu"><div class="mu-body">
      <p class="heading light">Hands up if…</p>
      <textarea id="muOwn" rows="2" maxlength="${v.max}" placeholder="…it’s bigger than the captain’s hat" autocomplete="off" enterkeyhint="send" ${sent ? 'disabled' : ''}></textarea>
      <p class="tiny">A yes-or-no question. Woolly ones start the best arguments.</p>
      <button class="btn" data-act="mu-own" ${sent ? 'disabled' : ''}>${sent ? 'Asking…' : 'Ask the crew'}</button>
      <button class="mu-link" data-act="mu-cards" ${sent ? 'disabled' : ''}>← Back to the cards</button>
    </div></div>`;
  }
  const cards = v.cards.map((c) => `<button class="mu-q" data-act="mu-pick" data-id="${c.id}" ${sent ? 'disabled' : ''}><small>Hands up if…</small><b>${esc(c.text)}</b></button>`).join('');
  return `<div class="fill scroll mu"><div class="mu-body">
    <p class="heading light">You’re the bosun</p>
    <p class="prompt light">Pick what the crew is asked${v.spy ? '. Choose like you know the watchword' : ''}.</p>
    ${progress(v)}
    <div class="mu-qs">${cards}<button class="mu-q own" data-act="mu-write" ${sent ? 'disabled' : ''}><b>✍️ Write your own</b></button></div>
  </div></div>`;
}

/** Everybody: hand up, or hand down? Nobody sees until every hand is in. */
function hands(v) {
  const question = `<div class="mu-ask"><small>Hands up if…</small><b>${esc(v.question)}</b></div>`;
  if (v.mine !== null) {
    return page(v, `${question}<div class="big-icon">${v.mine ? '✋' : '✊'}</div><p class="sub">${v.mine ? 'Your hand is up.' : 'Your hand is down.'}</p><p class="tiny">Nobody sees until every hand is in.</p>`);
  }
  const sent = local.sent === v.key;
  return page(
    v,
    `${progress(v)}${question}
     <div class="mu-two">
       <button class="mu-hand up" data-act="mu-hand" data-id="up" ${sent ? 'disabled' : ''}><span>✋</span><b>Hand up</b></button>
       <button class="mu-hand down" data-act="mu-hand" data-id="down" ${sent ? 'disabled' : ''}><span>✊</span><b>Hand down</b></button>
     </div>
     ${v.spy ? '<p class="tiny">🦎 Take a guess, and look sure about it.</p>' : v.me ? '<p class="tiny">It’s about you. Be honest.</p>' : ''}`,
  );
}

/** Everybody: who is the Chameleon? Each suspect comes with how they answered. */
function vote(v) {
  if (v.mine) {
    const who = v.options.find((o) => o.id === v.mine);
    return page(v, `<div class="big-icon">🗡️</div><p class="sub">You accused</p><div class="mu-mine">${who ? chip(who) : ''}</div><p class="tiny">Keep arguing until the rest have chosen.</p>`);
  }
  const sent = local.sent === v.key;
  const key = v.questions.map((q, i) => `<li><b>${i + 1}</b> ${esc(q)}</li>`).join('');
  const options = v.options
    .map((o) => `<button class="mu-pick" data-act="mu-accuse" data-id="${esc(o.id)}" ${sent ? 'disabled' : ''}>${chip(o)}<span class="mu-row">${o.hands.map((h) => `<i class="${h === true ? 'up' : h === false ? 'down' : ''}">${HAND[h]}</i>`).join('')}</span></button>`)
    .join('');
  return page(
    v,
    `<p class="heading light">Who’s the Chameleon?</p>
     <p class="prompt light">${v.spy ? 'Accuse somebody. Anybody but you.' : 'Argue it out, then accuse somebody.'}</p>
     <ol class="mu-key">${key}</ol>
     <div class="mu-picks">${options}</div>`,
  );
}

/** The Chameleon, caught: one guess at the watchword. */
function guess(v) {
  const sent = local.sent === v.key;
  const options = v.options
    .map((o) => `<button class="mu-word-btn" data-act="mu-guess" data-id="${esc(o.id)}" ${sent ? 'disabled' : ''}>${o.player ? chip({ ...o.player, name: `${o.text}${o.me ? ' (you)' : ''}` }) : `<b>${esc(o.text)}</b>`}</button>`)
    .join('');
  return `<div class="fill scroll mu"><div class="mu-body">
    <p class="heading light">They’ve got you!</p>
    <p class="prompt light">One chance: name the watchword and you still slip away.</p>
    <div class="mu-words ${v.kind === 'crew' ? 'crew' : ''}">${options}</div>
  </div></div>`;
}

export const mutinyScreens = { 'mu-card': card, 'mu-wait': wait, 'mu-ask': ask, 'mu-hands': hands, 'mu-vote': vote, 'mu-guess': guess };

// ---------------------------------------------------------------------------
// Taps
// ---------------------------------------------------------------------------

let shown = null; // the view currently on screen

const redraw = () => {
  const el = document.getElementById('screen');
  if (!el || !shown || !mutinyScreens[shown.screen]) return;
  const draft = document.getElementById('muOwn')?.value;
  el.innerHTML = mutinyScreens[shown.screen](shown);
  const box = document.getElementById('muOwn');
  if (box && draft !== undefined) box.value = draft;
};

/** A tap on one of this game's buttons. `send` posts to the server. */
export async function mutinyTap(act, id, view, send) {
  if (!view || !mutinyScreens[view.screen]) return;
  shown = view;

  if (act === 'mu-peek') {
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
  if (act === 'mu-turn') {
    local.turned = view.key;
    navigator.vibrate?.(30);
    return redraw();
  }
  if (act === 'mu-write' || act === 'mu-cards') {
    if (local.sent === view.key) return;
    local.writing = act === 'mu-write' ? view.key : null;
    redraw();
    document.getElementById('muOwn')?.focus({ preventScroll: true });
    return;
  }

  // Everything else is an answer for the server.
  let message = null;
  if (act === 'mu-ready') message = { type: 'mu-ready' };
  if (act === 'mu-pick' && view.screen === 'mu-ask') message = { type: 'mu-pick', key: view.key, id: Number(id) };
  if (act === 'mu-own' && view.screen === 'mu-ask') {
    const box = document.getElementById('muOwn');
    const text = box?.value.trim() ?? '';
    if (text.length < 3) return box?.focus();
    message = { type: 'mu-own', key: view.key, text };
  }
  if (act === 'mu-hand' && view.screen === 'mu-hands') message = { type: 'mu-hand', key: view.key, up: id === 'up' };
  if (act === 'mu-accuse' && view.screen === 'mu-vote') message = { type: 'mu-accuse', key: view.key, id };
  if (act === 'mu-guess' && view.screen === 'mu-guess') message = { type: 'mu-guess', key: view.key, id };
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
export function mutinyShown(v) {
  if (!mutinyScreens[v.screen]) return;
  if (shown && shown.key !== v.key) local.peek = false; // a new screen: close the secret strip
  shown = v;
  const asked = ['mu-card', 'mu-ask', 'mu-hands', 'mu-vote', 'mu-guess'].includes(v.screen) && !v.ready && (v.mine ?? null) === null;
  if (!asked || buzzed === v.key) return;
  buzzed = v.key;
  navigator.vibrate?.(v.screen === 'mu-ask' || v.screen === 'mu-guess' ? [70, 50, 70] : 40);
}
