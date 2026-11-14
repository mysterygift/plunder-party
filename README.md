# 🏴‍☠️ Plunda the Bunda

A pirate party game pack you host on your laptop. The laptop is the big screen
(AirPlay it to the TV); everyone else plays in their phone's browser over the
same wifi. Nothing to install on the phones.

Nine original games:

| Game | What it is | Players |
| --- | --- | --- |
| 💥 **Broadside** | Answer daft prompts. Two answers go head to head, the crew votes. Ends with "The Last Word", where everyone answers the same prompt. | 3–12 |
| 🦜 **Scuttlebutt** | Answer an innocent question. A crewmate gets your answer with no context and decides what it was *really* about. Vote for the best twist. Played on a retro "ShipOS" desktop. | 3–12 |
| 🏴‍☠️ **Flying Colours** | Draw pirate flags on your phone, then invent ship names. Everyone is dealt a haul of other people’s flags and names (no two hands share anything) and pairs one of each to launch a ship. The ships parade across the TV and the crew votes for the finest. | 3–12 |
| 🗺️ **Dead Reckoning** | Where in the world? Clues (and optionally a photo) appear on the TV, over a 3D model of the world that the camera wanders across. Drop an X on the map on your phone. Then the TV flies to the spot and sticks everyone’s pin in, furthest first. Closest wins the most doubloons. Each game deals one place from each theme: pirate haunts, off the telly, holidays, home waters and the bucket list. | 1–12 |
| 💣 **Bombard!** | A drinking game. The crew is split into Pirates and Navy, each with a fleet hidden in fog. Pick a tile, fire: miss and you take a swig, sink a ship and the other side drinks. Then everyone joins forces against the Kraken. The TV shows the battle as a 3D tabletop diorama. | 2–12 |
| 🎲 **LiAARRRRGH’s Dice** | Liar’s dice. Everyone rolls in secret (your dice are on your phone), then you take turns bidding how many of a number are under *all* the cups, or calling the last bid a lie. Whoever is wrong loses a die. Last pirate with a die wins. The TV shows the table as a 3D diorama: leather cups, the bid chalked on the baize, and the dice that count hopping onto the chalk marks. | 2–12 |
| 🏝️ **Find the One Piece** | A choose-your-own captain’s log, played as one crew with no scores. The log writes itself beside a model island; the crew votes on what to do, then everybody rolls one die and the total decides how it goes, from Perfect down to Diabolical. Beach, jungle, New Oldham, a monkey, a volcano, a dragon, and five endings. About ten minutes. | 2–12 |
| ⛵ **Knot So Fast** | A quick-fire trivia regatta. Crews of two or three race a ship round a desert island: questions fire onto every phone with no pause, right answers fill the sails, and a gold question fires your cannon at the ship in front. A 45-second solo sprint picks the crews, then three races. The TV shows it as a 3D model on the tavern table. About seven minutes. | 4–12 (2 or 3 can play, a boat each) |
| ⛓️ **To the Brig with Ye** | A talking game with secret mutineers. Each leg, the captain sends two pirates up the crow’s nest; only they can see which side of the channel hides the reef, and each hoists a flag in secret. If the flags disagree, one of them is lying: the crew argues it out, votes on the heading, then votes somebody into the brig. Three strikes on the reef and the mutineers win. The TV shows the view from the bow, with the fork in the channel ahead. About a quarter of an hour. | 5–12 |

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
| `content/one-piece.json` | Find the One Piece: the whole story (every entry, option and outcome), the odds, the timers, and which tune each scene plays |
| `content/knots.json` | Knot So Fast: races, laps, timers, how the wind and the cannon behave, doubloons, ship names |
| `content/knots-questions.json` | Knot So Fast: the 600 trivia questions, by category |
| `content/brig.json` | To the Brig with Ye: voyages, legs, the hull, how many mutineers, the size of the brig, the timers, and the names of the forks |
| `content/dead-reckoning.json` | Locations: name, theme, coordinates, clues, fun fact, optional photo. Also the themes themselves, and whether distances are in miles or km |
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
  "kind": "home",
  "name": "Where we got engaged",
  "lat": 53.4084, "lng": -2.9916,
  "image": "engagement.jpg",
  "clues": ["It rained.", "There were ferries.", "It's a city famous for four lads with guitars."],
  "fact": "She said yes."
}
```

`kind` is the theme, and has to be one of the `kinds` listed at the top of the
file (add your own there: a name and an emoji). A game deals one place from
each theme in turn, so five rounds is one of each. `"units"` is `"miles"` or
`"km"`.

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
shows the crew sat round an oval table, which is the order the turns go in
(clockwise). The plate by each cup shows how many dice that pirate has left.
A bid is a claim about the dice, not a bet: nobody stakes any doubloons.

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
- The narrator keeps quiet in this game (`narrator: false` at the top of
  `src/games/liars.js`); the table and the sound effects carry it.
- Doubloons are only the scoreboard: 100 for winning a call, 300 every time
  somebody else runs out of dice, 1,000 for being the last one in.

`content/liars-dice.json` has the settings:

- `seconds.turn`: how long each pirate gets (30).
- `diceEach`: `0` picks for you by crew size (5 dice each for 2–3 players, 4
  for 4, 3 for 5–6, 2 for 7 or more), which keeps a game to roughly a quarter
  of an hour. The classic game is `5` whatever the crew; expect it to run long
  with a crowd, since a game lasts about one round per die on the table.
- `wildOnes`: `true` makes 1s count as any number.
- `drink`: what the loser of each round takes a swig of. Use `""` for no drinking.

**Find the One Piece: how it works, and rewriting it**

Each scene is a page of the log: an entry, two to four options to vote on, and
a roll. Everybody rolls one die; the total lands in one of five results
(diabolical, bad, neutral, good, perfect), and the matching outcome is written
in. The cut-offs are worked out from the real odds for however many dice are
being rolled, so a crew of three and a crew of twelve get the same chances:
by default 10% / 20% / 40% / 20% / 10%, set by `odds`.

- Each option is marked **canny** (never diabolical, but never perfect),
  **bold** (whatever the dice say) or **daft** (the odds shift against the
  crew, but it is the only way to that scene's special prize).
- Outcomes hand out **kit** (the stick, the rum, the Big Pan…) and **woes**
  (soggy, bitten, singed…). A scene's `tilts` says which of them shift the odds
  there, and which way. They show at the foot of the log page.
- The last three scenes are the dragon fight. Each result moves a marker along
  a gauge, and where it rests after the third picks one of the five endings.
- Nobody is knocked out and there are no doubloons. After the ending, a muster
  page says who rolled what.

To change a line, find it in `content/one-piece.json` and retype it. In the
text, `{star}` is the guest of honour, `{ship}` is her ship, `{player}` is a
random pirate (the same one all through a scene), and in outcomes `{hero}` and
`{jonah}` are whoever rolled highest and lowest. To change how the story
branches:

| In the file | Means |
| --- | --- |
| `header` | The ruled top of the page: day, wind, course, remarks. Purely for jokes |
| `entry`, `ask` | What the log says, then the line that leads into the vote |
| `also` | Extra sentences added only `if` the crew has something, or `unless` they have it. They can hand out or take away kit too |
| `options` | `text` goes on the button and `lead` opens the outcome. `needs` hides an option unless the crew has that kit, `unless` hides it if they do, `spends` uses the kit up, `tilt` shifts the odds for that option alone. An option can have `outcomes` of its own, which replace the scene's |
| `outcomes` | One for each of the five results. `gain` hands out kit, `woe` a woe, `next` sends the story to a different scene |
| `note` | Something the log remembers without showing it, for a later `also` to test |
| `set`, `music` | Which part of the island the scene is acted out on, and which tune plays (the tunes are in `public/onepiece-sound.js`) |

Nothing in this game is read aloud (`narrator: false` in
`src/games/onepiece.js`): the page writes itself to the scratch of a quill, at
a pace set by `INK` in that file, and each part of the story has its own tune
instead. If the story no longer holds together after an edit (a `next` that
goes nowhere, an option with no outcome), the big screen says where.

**Knot So Fast: the rules, and tuning them**

Everyone starts alone in a rowing boat for the Scramble: 45 seconds of
quick-fire questions, which teaches the game and ranks the room. Crews are
then picked from that ranking, fastest with slowest (pairs, with one trio if
the number is odd), and each crew gets a ship. Then three races, three laps
each.

- Tap the right answer and your ship gains wind. Wind leaks away fast, so keep
  answering. A wrong answer spills some and locks your phone for a second.
- Each answer is worth less the bigger the crew, so a trio has no edge over a
  pair.
- Now and then one of the crew gets a gold **powder question** with a fuse
  burning across the top. Get it right before the fuse runs out and your gun
  fires at the ship one place ahead, which is holed for three seconds. The
  leader never gets one; the further back you are, the more often they come.
- More than five right in a row and you are "on a roll": your answers count
  half as much again until you miss.
- In races two and three the ships start staggered, the top of the table
  furthest back, and the last race pays double.
- A race ends 20 seconds after the winner crosses the line. Then a muster
  hands out titles: Sharpest Eye, Fastest Fingers, Master Gunner and so on.

The phone knows the answers ahead of time, which is what makes the next
question appear the instant you tap. The server still keeps the score.

`content/knots.json` has every number: `races`, `laps`, whether to run the
`scramble`, `crews` (`"pairs"` or `"trios"`), the timers under `seconds`, how
the `wind` behaves (`gust` is what a right answer is worth, `leak` how fast it
drains, `freshWind` the help given to ships at the back), the `powder` (how
often each place gets a powder question, and what a hit costs), the `stagger`
between places on the grid, and the `doubloons` for each place. The reasoning
behind the numbers is in `docs/knot-so-fast-plan.md`.

`content/knots-questions.json` is the question bank. Each question is one
line: `q` the question (70 characters at most), `a` the right answer, `wrong`
the other three (22 characters each at most), and a `level` from 1 (nearly
everyone gets it) to 3. A phone is never dealt the same question twice until
it has seen them all. The last category, `house`, is empty: put questions
about your own crowd there, in the same shape.

**To the Brig with Ye: the rules, and tuning them**

A few of the crew are secretly mutineers (two in a crew of 5 or 6, three for 7
to 9, four for 10 to 12). Phones deal the sides at the start; the mutineers are
told who each other are. A strip along the bottom of every phone shows your
side again for a few seconds when tapped.

A voyage is five legs (six for a crew of 6, 9 or 12). Each leg:

- **The captain** (it passes round the crew) sends two pirates up the crow's
  nest. Nobody climbs two legs running if there are enough rested hands.
- **The lookouts** see which side of the fork is safe and each hoists a flag in
  secret: red for port, green for starboard. The TV shows both flags, but not
  who raised which. A lookout who runs out of time gets an honest flag.
- **The helm.** If the flags disagree, one of the two is lying. Everybody argues
  (out loud, in the room) and votes on the heading; the timer ends early once
  every vote is in. A dead heat goes the captain's way.
- She goes where the vote says. The wrong side costs a plank of the hull.
- **The brig.** Everybody on deck votes for somebody, or for nobody. Most votes
  goes below, but it takes at least two, and it has to beat both the runner-up
  and "nobody". A prisoner can still heckle but cannot vote, climb or be
  captain. The brig has one cell (two for 7 to 9 pirates, three for 10 to 12):
  when it is full, a new prisoner turns the longest-serving one loose.

Three strikes and she sinks: the mutineers win. Reach the island and the loyal
crew does. Either way the mutineers are unmasked at the end. A mutineer is a
side for the whole voyage and a lookout is a job for one leg: mutineers see
the sea no better than anybody else, so their only weapons are a false flag
when they are sent up, a vote for the rocks, and getting honest pirates locked up.

Doubloons: 100 to a loyal pirate for each vote for the safe side and 150 for
each brig vote that names a real mutineer; 250 to every mutineer each time she
strikes and 150 for helping lock up an honest pirate; 2,000 to everybody on the
winning side. (The phones hide the doubloon counter in this game, since a
mutineer's jumps when she strikes.)

`content/brig.json` has the settings. `voyages` is how many voyages make a
game: one is about a quarter of an hour, and two or three make a half-hour game
with the sides dealt afresh each voyage and the doubloons carried over. `legs`,
`mutineers` and `brigSize` are 0 to let the crew size decide, or a number to
overrule it; `hull` is how many strikes sink her. `drink` is what a pirate
swigs on the way down to the brig (leave it empty for no drinking). `seconds`
has the timers: `roles`, `pick`, `nest`, `argue` (the flags disagree), `agree`
(they don't) and `brig`. `hazards` are the names of the forks, one drawn per leg.

The crew-size numbers came from simulating a few hundred thousand voyages and
keep the mutineers winning roughly a third to a half of the time; real crews
will be better liars and worse detectives than the simulation, so if one side
keeps winning, `hull` and `mutineers` are the two to change.

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
`public/liars-sound.js`. That tune is played by a tavern band rather than
bleeps: a song can carry a `band` of its own instruments (there it is a
fiddle, a squeezebox, a plucked bass, a bodhrán and a tambourine), one per
track, each a few lines you can retune. It plays all game and stops dead
while the cups come up.

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
npm run bots -- 5 onepiece      # they vote for whatever, and roll
npm run bots -- 8 knots         # four ships of two; they answer every few seconds and get most right
npm run bots -- 7 brig          # loyal robots are honest and gullible; mutinous ones lie most of the time
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
public/map.js        The pan-and-zoom map on the phones for Dead Reckoning (plain SVG)
public/reckoning-*   Dead Reckoning on the TV: the 3D model of the world and the reveal (-host.js), and the words over it (.css)
public/flag.js       The flag drawing format, shared by the phones, the TV and the server
public/sound.js      Sound effects, chiptune shanties and narrator playback
public/bombard-*.js  Bombard!: the 3D diorama on the TV (-host), the flat board on phones (-play), its sounds (-sound)
public/liars-*.js    LiAARRRRGH’s Dice: the 3D dice table on the TV (-host), your dice and the bid buttons on phones (-play), its sounds and tavern band (-sound)
public/onepiece-*.js Find the One Piece: the log page on the TV (-host), the island it sits beside (-world), the vote and the die on phones (-play), its sounds and tunes (-sound)
public/knots-*.js    Knot So Fast: the island and the race on the TV (-host), the question screen on phones (-play), the motion sum shared with the server (-motion), its sounds and reel (-sound)
public/tb-*.js       To the Brig with Ye: the view from the bow on the TV (-host), your orders and the votes on phones (-play), its sounds and slow air (-sound)
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
