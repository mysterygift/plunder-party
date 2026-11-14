# 🏴‍☠️ Plunder Party

A pirate party game pack you host on your laptop. The laptop is the big screen
(AirPlay it to the TV); everyone else plays in their phone's browser over the
same wifi. Nothing to install on the phones.

Six original games:

| Game | What it is | Players |
| --- | --- | --- |
| 💥 **Broadside** | Answer daft prompts. Two answers go head to head, the crew votes. Ends with "The Last Word", where everyone answers the same prompt. | 3–12 |
| 🦜 **Scuttlebutt** | Answer an innocent question. A crewmate gets your answer with no context and decides what it was *really* about. Vote for the best twist. Played on a retro "ShipOS" desktop. | 3–12 |
| 🏴‍☠️ **Flying Colours** | Draw pirate flags on your phone, then invent ship names. Everyone is dealt a haul of other people’s flags and names (no two hands share anything) and pairs one of each to launch a ship. The ships parade across the TV and the crew votes for the finest. | 3–12 |
| 🗺️ **Dead Reckoning** | Clues (and optionally a photo) appear on the TV. Drop an X on the treasure map on your phone. Closest wins the most doubloons. | 1–12 |
| 💣 **Bombard!** | A drinking game. The crew is split into Pirates and Navy, each with a fleet hidden in fog. Pick a tile, fire: miss and you take a swig, sink a ship and the other side drinks. Then everyone joins forces against the Kraken. The TV shows the battle as a 3D tabletop diorama. | 2–12 |
| 🎲 **LiAARRRRGH’s Dice** | Liar’s dice. Everyone rolls in secret (your dice are on your phone), then you take turns bidding how many of a number are under *all* the cups, or calling the last bid a lie. Whoever is wrong loses a die. Last pirate with a die wins. | 2–12 |

## Running it

```bash
npm install   # first time only
npm start
```

That starts the server and opens the big screen at `http://localhost:3000/host`.

1. Click the big screen once ("hoist the sails"). Browsers only allow sound after a click.
2. AirPlay / mirror that browser window to the TV, and press **F** for fullscreen.
3. Guests scan the QR code (or type the address shown) on the same wifi.
4. The first person to join is the **captain**: they pick the game and start it from their phone. You can also click the game cards on the laptop.

If macOS asks whether to let "node" accept incoming connections, click **Allow**,
otherwise phones can't reach the laptop.

### Controls on the laptop

Hover the bottom-right corner for buttons, or use the keyboard:

| Key | Does |
| --- | --- |
| Space | Skip ahead (ends the current timer or reveal) |
| P | Pause / resume |
| Esc | End the game and return to the lobby |
| S / M / N | Sound effects / music & sea ambience / narrator voice on or off |
| F | Fullscreen |

In the lobby, click a player's name to remove them. Anything that can't be
undone (removing a player, ending a game) asks first in a popup: Enter for yes,
Esc for no.

## Making it yours

Everything you'd want to change for a party is in the `content/` folder. Files
are re-read every time a game starts, so you can edit between games without
restarting.

| File | What's in it |
| --- | --- |
| `content/party.json` | Party title, tagline, and the guest of honour's name |
| `content/broadside.json` | Broadside prompts, final-round prompts, timer lengths |
| `content/scuttlebutt.json` | Scuttlebutt rounds: questions, wording, timers |
| `content/colours.json` | Flying Colours: drawing ideas, spare ship names, timers, how many flags and names each |
| `content/bombard.json` | Bombard!: the round timer, what everyone is drinking, and the names of the ships |
| `content/liars-dice.json` | LiAARRRRGH’s Dice: the turn timer, dice each, wild ones, and what the loser drinks |
| `content/dead-reckoning.json` | Locations: name, coordinates, clues, fun fact, optional photo |
| `content/theme.css` | Colours and fonts for every screen |
| `content/images/` | Photos for Dead Reckoning |

**Placeholders in prompts**

- `{star}` becomes the guest of honour from `party.json`
- `{player}` becomes a random player's name (use it twice for two different players)

**Adding a Dead Reckoning location with a photo**

Put the photo in `content/images/`, then add an entry like this. Clues go from
hardest to easiest; they're revealed one at a time as the clock runs down.
(Right-click a spot in any maps app to copy its latitude and longitude.)

```json
{
  "name": "Where we got engaged",
  "lat": 53.4084, "lng": -2.9916,
  "image": "engagement.jpg",
  "clues": ["It rained.", "There were ferries.", "It's a city famous for four lads with guitars."],
  "fact": "She said yes."
}
```

**Adding a Scuttlebutt round**

Copy one of the rounds in `content/scuttlebutt.json`. `questions` are what the
victim answers; `twistPrompt` is what the twister is asked; `setup` and `bridge`
are the lines shown around the twist and the answer on the TV (`{name}` is the
victim). Mark one round `"final": true` to make it the double-points closer.
Add `"style": "diary"` to show the answer as handwriting that writes itself
onto a diary page (Captain's Log uses this).

**Tuning Flying Colours**

`content/colours.json` has the lot. `ideas` are the "Stuck? Try…" nudges shown
above the easel (they finish the sentence "Try …", and take `{star}` and
`{player}`). `flagsEach` and `namesEach` set how much everyone makes in round
one; if you raise them, raise `seconds.draw` and `seconds.names` to match.
`spareNames` only appear when the hold runs short, for example when half the
crew ran out of time. Round two adds one more flag and two more names each, and
everything nobody used in round one comes back around.

**Bombard!: the rules, and tuning them**

Have a drink to hand. Everyone is split at random into Pirates (who stand to
the left of the TV) and Navy (to the right). Each side has a fleet of frigates
(4 tiles), brigantines (3) and sloops (2) hidden under the fog.

- Each round everybody taps a tile in the enemy's waters and lights the fuse.
  There are 30 seconds; anyone who doesn't pick gets a random tile, which always
  misses. Crewmates can see each other's picks, so no two aim at the same tile.
- **Miss:** you take a swig. **Hit:** nothing happens. **Sink a ship:** the
  whole enemy side drinks.
- When one fleet is gone, the Kraken turns up and everyone is on the same side,
  firing into the fog to find its head and tentacles. Missing now costs nothing,
  but after each volley the Kraken hits back at the fleet. **It hits a ship:**
  everyone takes a swig. **It sinks a ship:** somebody at random goes down with
  it and is out. Kill every piece of the Kraken to win; lose every ship and it wins.

With an odd number of players the smaller side gets a spare gun each round
(someone picks two tiles), so both sides always fire the same number of shots.

`content/bombard.json` has the timers (`seconds.aim`, `seconds.krakenAim`), the
`drink` the narrator and the phones mention ("rum" by default; "your drink"
works too), and the ship names. Board sizes, fleet sizes and how nasty the
Kraken is are in the tables at the top of `src/games/bombard.js`: `BATTLES` for
part one and `HUNTS` for part two (`strikes` is how many times it lashes out
per round; one more makes it a lot harder).

**LiAARRRRGH’s Dice: the rules, and tuning them**

Everyone rolls their dice in secret; yours show on your own phone (there is a
"Hide my dice" button for when the pirate next to you gets curious). The TV
shows the crew sat in a ring, which is the order the turns go in.

- On your turn, either **bid** or **call it**. A bid says "there are at least
  four 5s", counting every die under every cup, yours included. Each bid must
  beat the last: more dice of any number, or the same number of dice with a
  higher face (so `4 × 5` can be followed by `4 × 6` or `5 ×` anything).
- **LiAARRRRGH!** calls the last bid a lie. Every cup comes up. If there are
  enough, the bid was good and the caller loses a die; if not, the bidder does.
- Whoever lost the die opens the next round. No dice left and you are out.
  The last pirate holding a die wins.
- Run out of time and the ship's parrot takes your turn. It plays the odds and
  never bluffs.

`content/liars-dice.json` has the settings:

- `seconds.turn`: how long each pirate gets (30).
- `diceEach`: `0` picks for you by crew size (5 dice each for 2–3 players, 4
  for 4, 3 for 5–6, 2 for 7 or more), which keeps a game to roughly a quarter
  of an hour. The classic game is `5` whatever the crew; expect it to run long
  with a crowd, since a game lasts about one round per die on the table.
- `wildOnes`: `true` makes 1s count as any number.
- `drink`: what the loser of each round takes a swig of. Use `""` for no drinking.

**The narrator**

On a Mac, the server renders each narrator line with one of macOS's own voices
and the big screen plays it (see `src/speech.js`). Settings live in `party.json`:

```json
"narrator": {
  "voice": "",
  "signoffs": ["Yarr, me hearties!", "Yo ho ho!", "Shiver me timbers!"]
}
```

- `voice`: `"system"` uses whatever is set as the Mac's system voice (System
  Settings → Accessibility → Read & Speak → System voice). That is how to get a
  **Siri voice**: pick one there. Change it any time, then restart the server.
- Or name an installed voice, e.g. `"Daniel"` or `"Jamie"`. Leave it empty to
  pick the best English one installed (Premium, then Enhanced, then Daniel).
  More voices are a free download under Manage Voices in the same settings pane.
- `npm start` prints which voice is in use. If a voice can't be rendered, the
  narrator falls back to the browser's built-in voice.
- `signoffs`: the pirate phrase tacked on the end of every line. Use `[]` for none.
  Whole phrases work better than a bare "Arr!", which most voices clip into a grunt.
- `npm run narrator` reads every sign-off aloud through the laptop's speakers,
  one at a time, so you can hear how your chosen voice handles each and delete
  any it mangles. `npm run narrator -- 'Ahoy!' 'Avast!'` reads your own phrases
  instead, numbered, which is handy for trying different spellings. (Use single
  quotes: in double quotes the terminal trips over the exclamation mark.)

**Sound effects**

Cannons, splashes, sword clashes, gulls, creaking timbers, the bosun's whistle
and the rest are all synthesized in `public/sound.js` under `FX`; each is a
short recipe you can tweak. To audition one, open the browser console on the big
screen and run `sfx('gulls')` (`sfxList()` shows every name). Gulls, creaks,
waves and a distant bell also drift in at random as background; the Music
switch (M) silences those along with the tunes.

**The music**

Each game has its own chiptune shanty, written as plain text in
`public/sound.js` under `SONGS` (one note per step, `-` to hold, `.` for a
rest). `lobby` plays in the lobby; `broadside`, `scuttlebutt`, `colours` and
`reckoning` play while people are thinking in that game. Bombard!'s two tunes
(`bombard` and `kraken`) and all its sounds (`sfx('bbCannon')`, `sfx('bbRoar')`
and friends) are in `public/bombard-sound.js`. Edit the notes, change `step` to
alter the tempo, or paste in a tune of your own. LiAARRRRGH’s Dice keeps its
tune (`liars`) and sounds (`sfx('ldShake')`, `sfx('ldLiar')` and friends) in
`public/liars-sound.js`.

If a content file has a typo, the big screen shows a red message telling you
which file and where.

## Trying it without a crowd

```bash
npm run bots                    # 4 robot pirates join and play along
npm run bots -- 6               # 6 of them
npm run bots -- 4 scuttlebutt   # they also start the game themselves
npm run bots -- 5 colours       # they scribble flags too (badly)
npm run bots -- 6 bombard       # three a side, firing more or less at random
npm run bots -- 4 liars         # they bid, bluff a bit, and call each other out
```

Join on your own phone as well and you can play a real game against them.
`SPEED=20 npm start` makes every timer run 20x faster, handy when testing changes.

## How it works (for the curious)

```
server.js            HTTP server: serves the pages, keeps a live connection to every screen
src/engine.js        The room, the players, and the toolbox games are written with
src/games/*.js       One file per game. Each is a single async function that reads like a script
src/content.js       Loads and checks the files in content/
src/speech.js        Renders the narrator's lines to audio with the Mac's voices
public/host.*        The big screen
public/play.*        The phone controller
public/map.js        The pan-and-zoom treasure map (plain SVG)
public/flag.js       The flag drawing format, shared by the phones, the TV and the server
public/sound.js      Sound effects, chiptune shanties and narrator playback
public/bombard-*.js  Bombard!: the 3D diorama on the TV (-host), the flat board on phones (-play), its sounds (-sound)
public/liars-*.js    LiAARRRRGH’s Dice: the ring of players on the TV (-host), your dice and the bid buttons on phones (-play), its sounds (-sound)
public/vendor/       three.js, which draws the diorama (copied from node_modules, so no internet is needed)
tools/bots.js        Robot players
tools/build-assets.js  Regenerates the map data and fonts (already done; rarely needed)
```

The key idea: **all game state lives on the server, and the screens are dumb.**
Each screen holds one open connection (Server-Sent Events) and simply draws the
latest "view" the server sends. When someone taps something, their phone POSTs
a tiny JSON message back.

A game is written top to bottom as a script:

```js
ctx.screen({
  host: () => ({ screen: 'writing', title: 'Round 1', ... }),   // what the TV shows
  player: (p) => ({ screen: 'write', prompt: '...' }),          // what each phone shows
  onAction: (p, msg) => { /* someone sent an answer */ },
});
await ctx.wait(90_000, { timer: true, until: () => everyoneHasAnswered });
```

`src/games/broadside.js` is the best one to read first.

## Troubleshooting

- **Phones can't connect:** same wifi as the laptop? Did you click *Allow* on the macOS firewall prompt? Some guest/hotel networks block devices from seeing each other; a phone hotspot works as a fallback.
- **No sound on the TV:** click the big screen once, and check macOS is sending audio to the AirPlay device.
- **A phone went to sleep mid-game:** just unlock it; it reconnects by itself and the game doesn't wait for sleeping phones.
- **Port already in use:** `PORT=3001 npm start`

Fonts: Pirata One and IM Fell English (SIL Open Font License). Map data: Natural Earth (public domain), via the `world-atlas` package.
