// Bits shared by the TV screen (host.js) and the phone screen (play.js).

/** Escape text before putting it into HTML. Everything players type goes through this. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const fmt = (n) => Number(n).toLocaleString('en');

// The server stamps every message with its own clock, so countdowns agree
// even if a phone's clock is a bit off.
let clockOffset = 0;
export const serverNow = () => Date.now() + clockOffset;

/**
 * Keep a live connection to the server. `query()` returns the query string
 * (it is a function so a phone can reconnect with its token after joining).
 */
export function connect(query, onView) {
  let source = null;
  const open = () => {
    source?.close();
    source = new EventSource(`/api/events?${query()}`);
    source.onopen = () => document.body.classList.remove('offline');
    source.onerror = () => document.body.classList.add('offline');
    source.onmessage = (event) => {
      const { t, view } = JSON.parse(event.data);
      clockOffset = t - Date.now();
      document.body.classList.remove('offline');
      onView(view);
    };
  };
  open();
  // Phones drop the connection when the screen locks; grab a fresh one on return.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) open();
  });
  return { reconnect: open };
}

export async function post(path, body) {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await res.json();
  } catch {
    return { error: 'Lost contact with the ship. Check your wifi.' };
  }
}

// ---------------------------------------------------------------------------
// "Are you sure?" popups, drawn in the page rather than by the browser
// ---------------------------------------------------------------------------

let question = null; // the popup currently on screen, if any

/**
 * Ask a yes/no question in a popup. Resolves true for yes, false for no.
 *   await ask({ title: 'Abandon ship?', text: '...', yes: 'End the game', no: 'Keep playing' })
 * Enter answers yes; Escape, or a click outside the box, answers no.
 */
export function ask({ title, text = '', yes = 'Aye', no = 'Belay that' }) {
  dismissQuestion();
  return new Promise((resolve) => {
    const returnFocus = document.activeElement;
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `<div class="modal-card parch" role="alertdialog" aria-modal="true" aria-labelledby="modalTitle">
      <h2 id="modalTitle">${esc(title)}</h2>
      ${text ? `<p>${esc(text)}</p>` : ''}
      <div class="modal-btns">
        <button class="modal-btn" data-answer="no">${esc(no)}</button>
        <button class="modal-btn yes" data-answer="yes">${esc(yes)}</button>
      </div>
    </div>`;

    const me = { close };
    function close(answer) {
      if (question !== me) return;
      question = null;
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      if (returnFocus?.isConnected) returnFocus.focus?.({ preventScroll: true });
      resolve(answer);
    }
    // While the popup is up it owns the keyboard, so Space, P, Esc and friends don't reach the game.
    function onKey(e) {
      e.stopImmediatePropagation();
      if (e.key === 'Tab') return; // let Tab move between the two buttons
      e.preventDefault();
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(document.activeElement?.dataset.answer !== 'no');
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') el.querySelector(`[data-answer="${e.key === 'ArrowLeft' ? 'no' : 'yes'}"]`).focus();
    }
    el.addEventListener('click', (e) => {
      const button = e.target.closest('[data-answer]');
      if (button) close(button.dataset.answer === 'yes');
      else if (e.target === el) close(false);
    });
    document.addEventListener('keydown', onKey, true);

    question = me;
    document.body.append(el);
    el.querySelector('.yes').focus({ preventScroll: true });
  });
}

/** Take down any popup (answering "no"), e.g. because the screen behind it has moved on. */
export function dismissQuestion() {
  question?.close(false);
}

/** Seconds left on the current countdown, or null if there isn't one. */
export function secondsLeft(view) {
  if (!view?.endsAt) return null;
  return Math.max(0, Math.ceil((view.endsAt - serverNow()) / 1000));
}

/** Keep every [data-timer] element showing the countdown. */
export function startTimers(getView, onSecond) {
  let last = null;
  setInterval(() => {
    const view = getView();
    const left = secondsLeft(view);
    for (const el of document.querySelectorAll('[data-timer]')) {
      el.hidden = left === null;
      if (left === null) continue;
      el.textContent = view.paused ? '⏸' : left;
      el.classList.toggle('urgent', left <= 5 && !view.paused);
    }
    if (left !== last && left !== null && !view.paused) onSecond?.(left);
    last = left;
  }, 150);
}
