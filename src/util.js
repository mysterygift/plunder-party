// Small helpers shared by the engine and the games.

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sample = (list) => list[Math.floor(Math.random() * list.length)];

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Tidy up text typed on a phone: collapse whitespace and cap the length. */
export function cleanText(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** How long (ms) the big screen should linger so a line can be read aloud. */
export function readTime(text, base = 2200) {
  return clamp(base + String(text).length * 65, 3000, 11000);
}

/** Great-circle distance in kilometres between two lat/lng points. */
export function distanceKm(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Round to the nearest ten so scores look tidy. */
export const tidy = (n) => Math.round(n / 10) * 10;
