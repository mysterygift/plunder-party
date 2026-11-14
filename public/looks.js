// Lighting styles for the big screen's 3D dioramas, picked from the host's
// control bar (the 💡 button, or L). The choice is remembered on this laptop.
//
// Every style is optional: "plain" is the normal lighting. A game's stage can
// tune a style for its own scene with createStage({ looks: { dither: {...} } })
// (see kit3d.js); a stage that doesn't tune it gets the defaults.
//
// To prototype a new style: add it to LOOKS here, then teach kit3d.js's
// applyLook() what to do with it.

export const LOOKS = [
  { id: 'plain', name: 'Plain lighting' },
  { id: 'dither', name: 'Dithered lighting' },
];

const KEY = 'plunder-look';
let current = 'plain';
try {
  const saved = localStorage.getItem(KEY);
  if (LOOKS.some((l) => l.id === saved)) current = saved;
} catch {}

export const look = () => current;
export const lookName = () => LOOKS.find((l) => l.id === current).name;

export function setLook(id) {
  if (!LOOKS.some((l) => l.id === id)) return;
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {}
}

/** Move on to the next style, round and round. */
export function nextLook() {
  const i = LOOKS.findIndex((l) => l.id === current);
  setLook(LOOKS[(i + 1) % LOOKS.length].id);
  return current;
}
