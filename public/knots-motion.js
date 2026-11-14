// Knot So Fast: how a ship moves. This one small sum is used by the server
// (which runs the race) and by the TV (which works the motion out for itself
// between the server's messages, so the ships glide instead of jumping).
//
// A ship is { pos, wind, holedUntil, done }:
//   pos         leagues sailed since the start of the race
//   wind        0 to `max`; right answers add to it and it leaks away
//   holedUntil  race-clock time until which a cannon hit is slowing it down
//   done        the race-clock time it crossed the line, or null
//
// `m` is the "wind" block of content/knots.json plus holedSpeed from "powder".

export const MOTION = {
  lap: 100, // leagues in a lap
  drift: 1.2, // leagues a second with no wind at all
  top: 4.2, // extra leagues a second at full wind
  curve: 0.6, // below 1, the first pips of wind are worth more than the last
  max: 10,
  leak: 0.1, // the share of the wind lost each second
  freshWind: 0.15, // ships behind the leader get up to this much extra speed...
  freshWindAt: 40, // ...when they are this many leagues behind
  holedSpeed: 0.35, // a holed ship keeps this much of its speed
};

/** How much "fresh wind" a ship this far behind the leader gets, from 0 to 1. */
export const freshWind = (ship, leaderPos, m) => Math.min(1, Math.max(0, (leaderPos - ship.pos) / m.freshWindAt));

/** Leagues a second, right now. */
export function speedOf(ship, leaderPos, clock, m) {
  let v = m.drift + m.top * (Math.max(0, ship.wind) / m.max) ** m.curve;
  v *= 1 + m.freshWind * freshWind(ship, leaderPos, m);
  if (clock < ship.holedUntil) v *= m.holedSpeed;
  return v;
}

/** Move one ship on by `dt` seconds. `clock` is the race clock at the start of the step. */
export function advance(ship, dt, leaderPos, clock, m) {
  if (ship.done != null) return;
  ship.pos += speedOf(ship, leaderPos, clock, m) * dt;
  ship.wind *= Math.exp(-m.leak * dt);
}

/** Race order: finished ships by finishing time, then everyone else by how far they have got. */
export function inOrder(ships) {
  return [...ships].sort((a, b) => {
    if (a.done != null || b.done != null) return (a.done ?? Infinity) - (b.done ?? Infinity);
    return b.pos - a.pos;
  });
}
