// Lighting styles for the big screen's 3D dioramas, picked from the host's
// control bar (the 💡 button opens a menu; L steps through them). The choice is
// remembered on this laptop.
//
// Every style is optional: "plain" is the normal lighting and the default.
// "house" is each game's own look (set in its tuning, see looks3d.js); the
// rest are single effects, the same in every game, for trying things out.
//
// To add a style: list it here, give it defaults in looks3d.js's STYLES, and
// (if it needs something new) teach looks3d.js how to draw it.

export const LOOKS = [
  { id: 'plain', name: 'Plain lighting' },
  { id: 'house', name: 'House style', hint: 'each game’s own look' },
  { id: 'dither', name: 'Dithered light' },
  { id: 'cel', name: 'Cel bands', hint: 'hard steps, coloured shadows' },
  { id: 'hatch', name: 'Cross-hatching' },
  { id: 'stipple', name: 'Stipple' },
  { id: 'halftone', name: 'Halftone dots' },
  { id: 'outline', name: 'Ink outlines' },
  { id: 'palette', name: 'Limited palette' },
  { id: 'tilt', name: 'Tilt-shift', hint: 'top and bottom out of focus, like a model' },
  { id: 'fog', name: 'Dithered fog', hint: 'Parley, the Brig and the One Piece' },
];

const KEY = 'plunder-look';
let current = 'plain';
try {
  const saved = localStorage.getItem(KEY);
  if (LOOKS.some((l) => l.id === saved)) current = saved;
} catch {}

export const look = () => current;
export const lookName = (id = current) => LOOKS.find((l) => l.id === id).name;

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
