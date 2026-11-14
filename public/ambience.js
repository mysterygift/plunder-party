// The sound of a room: little effects that go off now and then while a game's
// diorama is on screen (rain on the window, a crackle from the fire, a whale
// far off). Each layer fires every few seconds, somewhere between its two
// numbers, and goes through the music channel, so the Music switch silences it.
//
//   const room = createAmbience([
//     { name: 'slTickTock', every: [2, 2], level: 0.3 },
//     { name: 'slRain', every: [20, 40], level: 0.6 },
//   ]);
//   room.tick(dt, playing)   call every frame; nothing fires while `playing` is false

import * as sound from './sound.js';

const between = ([lo, hi]) => lo + Math.random() * (hi - lo);

export function createAmbience(layers) {
  const due = layers.map((layer) => between(layer.every) * (layer.soon ? 0.1 : 0.6));
  return {
    tick(dt, playing = true) {
      if (!playing || document.hidden) return;
      layers.forEach((layer, i) => {
        due[i] -= dt;
        if (due[i] > 0) return;
        due[i] = between(layer.every);
        if (layer.when && !layer.when()) return;
        sound.play(layer.name, { level: layer.level ?? 0.5, ambience: true });
      });
    },
  };
}
