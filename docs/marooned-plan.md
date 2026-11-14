# Marooned: plan for a choose-your-own captain's log

A short co-operative story game for Plunder Party. The whole crew plays one
team. On the TV an old ship's log writes itself beside a model island on the
Bombard! tavern table, where the story is acted out; at every turn of the
story the crew votes on what to do, then everybody rolls one die on their phone
and the total decides how well it goes: Perfect, Good, Neutral, Bad or
Diabolical.

Working title is **Marooned** (game id `marooned`). "Captain's Log" is already
the name of a Scuttlebutt round, so the game needs its own name; the logbook
itself is titled *The Log of the {star}'s Revenge, kept by Capt. {star}*.

- Players: 2 to 12, one team, no scores
- Length: about 12 minutes (8 rolls)
- Nothing here is built yet. This is the design to build from.

## 1. One beat of the game

Every scene runs the same four steps, about a minute in all.

1. **The entry.** A new log entry writes itself onto the log page in
   handwriting while the narrator reads it. On the model island beside it, the
   crew's pegs arrive at the scene.
2. **The vote.** The entry ends on a decision. Two or three options appear on
   the page and on every phone. 20 seconds, majority wins, votes show live on
   the TV as ink blots so people can shout about it. A tie is settled by a
   doubloon flip on the TV. The losing options get struck through with a quill.
3. **The roll.** Every phone shows one bone die and a Roll button. Each die
   is thrown onto the table on the TV under its owner's name and the running
   total inks itself in. Anyone who hasn't rolled after 12 seconds (or whose phone is asleep) has
   theirs rolled by the ship's cat, so there are always exactly as many dice as
   players.
4. **The outcome.** A slider runs along a brass rule on the table to the
   total, a wax seal stamps the result (PERFECT … DIABOLICAL), and the
   rest of the entry writes itself in to say what happened.

## 2. Systems

### 2.1 Turning a total into one of five outcomes

The sum of the dice bunches up around the middle more and more as the crew
grows, so fixed cut-offs would make a Perfect nearly impossible for ten
players and common for two. Instead the cut-offs are worked out from the exact
odds for however many dice are being rolled, aiming at the same chances every
time: **10% Diabolical, 20% Bad, 40% Neutral, 20% Good, 10% Perfect**.

What that comes to (computed, not guessed):

| Crew | Diabolical | Bad | Neutral | Good | Perfect |
| --- | --- | --- | --- | --- | --- |
| 2 | 2–3 | 4–5 | 6–8 | 9–10 | 11–12 |
| 3 | 3–6 | 7–8 | 9–12 | 13–14 | 15–18 |
| 4 | 4–9 | 10–12 | 13–15 | 16–18 | 19–24 |
| 5 | 5–12 | 13–15 | 16–19 | 20–22 | 23–30 |
| 6 | 6–15 | 16–18 | 19–23 | 24–26 | 27–36 |
| 8 | 8–21 | 22–25 | 26–30 | 31–34 | 35–48 |
| 10 | 10–28 | 29–32 | 33–37 | 38–41 | 42–60 |
| 12 | 12–34 | 35–38 | 39–45 | 46–49 | 50–72 |

Dice are whole numbers, so the real chances wobble a little (Perfect is 8% to
12% depending on crew size). The game computes the table at run time for any
crew from 1 to 12; the five target percentages live in the content file so they
can be tuned after a playtest.

The brass rule is engraved with its five zones, so the crew can see what
they need before they roll ("we need 24 for Good").

### 2.2 What a choice changes

Every option carries one of three marks, written in the margin beside it:

| Mark | Effect |
| --- | --- |
| **Canny** | The safe way. A Diabolical counts as Bad, but a Perfect only counts as Good. |
| **Bold** | Whatever the dice say. |
| **Daft** | The scale tilts one notch against the crew, but it is the only way to win that scene's special prize. Daft options are also where the best jokes go. |

Canny and Bold average out the same, so that choice is about nerve: play canny
to protect a lead, bold when the crew needs a Perfect. Daft is a worse bet on
purpose, taken for the prize or the laugh.

### 2.3 Kit, woes and the tilt of the scale

Outcomes hand out **kit** (good) and **woes** (bad). Kit is set out on the
table as little models, woes are written in the log's margin in red ink, and
each is called back exactly once or twice later in the story.

| Kit | Where it comes from | Where it helps |
| --- | --- | --- |
| The Stick | Beach or jungle | The monkey; the dragon's soft spot |
| Cask of rum | The wreck | Buys off the tribe (and is spent), or keep it for the dragon's throat |
| The Big Pan | A gift from the tribe if they like you | A shield against dragonfire |
| The Map | Always found on the monkey: whole, torn or chewed | The climb; knowing the dragon's soft spot |
| High ground | A good climb | The dragon's first breath |

| Woe | Where it comes from | Where it hurts |
| --- | --- | --- |
| Soggy | A bad day on the beach | The jungle |
| Marinated | Caught badly by the tribe and basted in gravy | The dragon finds the crew delicious |
| Bitten | A scrappy monkey fight | The dragon's soft spot |
| Singed | A bad climb | The last exchange |

Each relevant piece of kit tilts the scale one notch the crew's way for that
roll; each relevant woe tilts it one notch against. The tilt is capped at two
notches either way. A notch moves the zone boundaries, visibly, on the brass
scale:

| Tilt | Diabolical | Bad | Neutral | Good | Perfect |
| --- | --- | --- | --- | --- | --- |
| +2 | 3% | 10% | 37% | 28% | 22% |
| +1 | 5% | 15% | 40% | 25% | 15% |
| 0 | 10% | 20% | 40% | 20% | 10% |
| −1 | 15% | 25% | 40% | 15% | 5% |
| −2 | 22% | 28% | 37% | 10% | 3% |

Working in percentages rather than "+2 to the roll" keeps a piece of kit worth
the same to a crew of three as to a crew of twelve.

### 2.4 The dragon fight and the five endings

The climax is three rolls, not one. A fight gauge with seven notches sits on
the table, the marker starting in the middle. Each exchange moves it:
Perfect +2, Good +1, Neutral 0, Bad −1, Diabolical −2. Where it rests after the
third exchange is the ending:

| Marker | Ending |
| --- | --- |
| +3 or better | **Perfect.** The dragon is beaten, the treasure is yours, a sail appears on the horizon and the crew lights the signal fire off the dragon's last ember. Rescued, rich. |
| +1, +2 | **Good.** The dragon slinks off. The ship sees the fire and takes the crew off, but it is HMS Paperwork, and the treasure is confiscated against a receipt. |
| 0 | **Neutral.** A draw. The dragon keeps its hoard, the crew keep their skins, and the ship sails past because nobody has anything dry to light. Back to the village for tea. The log continues. |
| −1, −2 | **Bad.** The crew escape with nothing, on fire. The ship does see smoke. The smoke is the crew. It sails on. The tribe have the big pan on. |
| −3 or worse | **Diabolical.** Everyone is eviscerated by dragonfire. The page burns away, and a last entry appears in a clawed hand: "Day 5. Ate crew. Bit gamey." |

With nothing tilting the scale the endings fall roughly 9% / 30% / 22% / 30% /
9%. A crew that arrives well kitted (a notch in their favour on every exchange)
gets about 19% Perfect and 4% Diabolical; a crew that arrives basted, bitten
and singed gets the reverse. So the journey matters, and the last roll still
decides it.

### 2.5 Smaller rules

- **Co-op, no doubloons.** No scoreboard and no winner; the phones hide the
  doubloon counter for this game. The game ends on its own ending page, not the
  pack's usual "who took the treasure" screen.
- **Names in the story.** Outcome text can use `{hero}` (highest die that roll)
  and `{jonah}` (lowest), alongside the existing `{star}` and `{player}`, so the
  log blames real people: "{jonah} fell in the rock pool. Again."
- **Crew muster.** After the ending, one last page lists every pirate with the
  total they rolled all game and hands out titles: Luckiest Hand, The Jonah,
  Most Sixes, Most Ones.
- **Birthday wish (optional).** If a player's name matches the guest of honour,
  she gets one "Captain's privilege" per game: make the whole crew roll again.
- **Laptop controls** work as in every other game: Space skips ahead, P pauses,
  Esc ends.

## 3. Narrative outline

This outline came first; the script in `content/marooned.json` is now the
authority and differs in small ways. It adds two prizes for daft choices (a
warm welcome in the village, and Darren's secret that the dragon is ticklish),
the monkey is tried for being from Rochdale, and the options in the dragon
fight are worded a little differently.

One fixed spine with branches that rejoin. Nobody is knocked out and no ending
arrives early; bad luck piles up as woes and is paid for at the volcano.

Voice: a dry, formal 18th-century log kept by a captain who is trying to keep
their dignity while everything goes wrong. Each entry has the ruled header of a
real log, used for jokes (Wind: *spiteful*. Course: *none*. Remarks: *see
below*).

### Title page

*The Log of the {star}'s Revenge, kept by Capt. {star}.* Water-stained. A note
in the corner: "If found, please return to the sea."

### Day 1: The Beach (roll 1)

The ship is on the reef and going down. The crew are ashore, alive and already
complaining.

- Canny: comb the tideline for what has washed up. (Likely prize: the Stick.)
- Bold: swim back out to the wreck before she goes under. (Prize: the rum; on a
  Perfect, the Stick as well.)
- Daft: send {player} up a palm tree to look for a pub. (Special prize: spots
  the smoke inland, tilting the jungle roll.)

Bad or worse: the crew start the trek **Soggy**.

### Day 2: The Jungle (roll 2)

Smoke inland, distant drums, and an unmistakable smell of gravy.

- Canny: follow the stream.
- Bold: cut straight through towards the drums.
- Daft: follow the smell.

This roll decides how the crew meet the tribe:

| Outcome | What happens |
| --- | --- |
| Perfect, Good | The crew see the village first and stroll in bold as brass: **guests**. |
| Neutral | They blunder in and are met with spears and a brew: guests, on probation. |
| Bad | Netted and carried in on a pole: **captured**. |
| Diabolical | Captured, and already basted: **Marinated**. |

### Day 2, evening: New Oldham (roll 3)

The tribe are cannibals. They are also, it turns out, from Oldham, and nobody
explains how. The chief is Big Sandra. The sign says "New Oldham: twinned with
Oldham". The menu is rag pudding, and tonight's filling is under discussion.
The joke is entirely on Oldham: they speak broad Lancashire, argue about
whether the meal is dinner or tea, and are very particular about gravy.

Two versions of the scene, depending on the jungle:

**Captured (in the pan)**
- Canny: wriggle out while they argue about whether it is dinner or tea.
- Bold: tell them you're from Oldham an' all. (They will ask questions.)
- Daft: criticise the seasoning.
- With the rum: offer them the cask. Two notches in the crew's favour; the rum
  is gone.

**Guests (at the feast)**
- Canny: eat what you're given and ask nothing.
- Bold: challenge Big Sandra to an arm wrestle.
- Daft: ask what's in the pudding.
- With the rum: get a round in.

The outcome sets how the tribe see the crew: **friends** (Good or better),
**tolerated** (Neutral) or **tomorrow's tea** (Bad or worse). Friends cheer for
the crew in the next scene; a tribe that has the crew down as tea has a bet on
the monkey.

### Day 3: The Monkey (roll 4)

The drums stop. A monkey walks out of the woods and into the middle of the
village. He is wearing a small waistcoat. Big Sandra goes pale: "It's 'im." He
goes for the crew.

Every option is the stick:

- Canny: hit him with the stick.
- Bold: hit him with the stick, with a run-up.
- Daft: give {player} the stick.

If the crew found the Stick earlier it tilts the roll their way. If not, Big
Sandra hands one over ("it's not a good stick").

The crew always win, the monkey is always beaten with the stick, and the tribe
always insist on a trial (verdict: "not from round here") and hang him up on a
cross made of the stick and a second stick. The roll decides what it cost:

| Outcome | What happens |
| --- | --- |
| Perfect | One swing. Made honorary Oldhamers and given **the Big Pan**. Map whole. |
| Good | A clean win. Map whole. |
| Neutral | A scrappy win. Map torn. |
| Bad | A win, after he has bitten nearly everyone: **Bitten**. Map torn. |
| Diabolical | A long, humiliating win. Bitten, he drank the rum, and he ate half the map: map chewed. |

Either way, in the waistcoat pocket: **a treasure map**. An X on the volcano.
In the corner, a small drawing of a dragon. Big Sandra: "Oh aye. We don't go up
there."

### Day 4: The Volcano (roll 5)

The camera leaves the village and climbs the island to the mountain as the fog
lifts off it.

- Canny: the goat track, the long way round.
- Bold: the lava tube. Quicker, and only slightly on fire.
- Daft: shout "hello?" into the crater to see if anyone's in.

A whole map tilts the roll for the crew; a chewed one tilts it against. A good
climb earns **high ground** and full pockets; a bad one leaves the crew
**Singed**; a Diabolical one also drops a piece of kit into the lava.

Then, no roll: the treasure chamber. Gold to the ceiling. Something large is
asleep on it. It is no longer asleep.

### Day 4, night: The Dragon (rolls 6, 7 and 8)

Three exchanges on the fight gauge (section 2.4). The sun is out; the only
light is the candle and the dragon.

1. **It breathes in.** Canny: get behind a rock. Bold: charge in under the
   flame. Daft: throw {jonah} at it. *Helps: the Big Pan, high ground. Hurts:
   Marinated.*
2. **The soft spot.** Canny: go for the tail. Bold: go for the spot marked on
   the map. Daft: tickle it. *Helps: the Stick, a whole map. Hurts: Bitten, a
   chewed map ("the map says its weak spot is the—").*
3. **Now or never.** Canny: one good shout to bring the roof down. Bold: rum
   down its throat and a spark. Daft: beat it with the stick and hang it up on
   a cross. It worked on the monkey. *Helps: the rum. Hurts: Singed.*

### Day 5: The ending

One of the five endings in section 2.4, then the crew muster.

## 4. The look: the captain's log on the Bombard! table

Same tavern table as Bombard!, same candle, same hand-carved painted models.
Where Bombard! has a tray of ships, Marooned has a **model island** standing
in the tray of resin sea, and the **captain's log lying open beside it**. The
log tells the story; the model acts it out.

**How the TV is laid out**
- The left third is the open log page. The right two thirds is the island on
  the table. Bombard! already works this way round: the model is drawn in 3D
  and the words are laid over it as ordinary text, which keeps them sharp
  enough to read from the sofa.
- The log page keeps everything from before: the ruled header (Day, Wind,
  Course, Remarks) in IM Fell English, the entry in handwriting that writes
  itself on with the quill sound, options written in as alternatives, votes
  landing beside them as ink blots in each player's colour, the losers struck
  through, and the result stamped on as a wax seal.

**The island**
- One model holds the whole journey, front left to back right: the reef with
  the wreck on it, the beach, the jungle, the village clearing, the volcano.
  The camera travels along it from scene to scene, so the crew can always see
  how far they have come and what is waiting.
- Everything not yet reached sits under cotton-wool fog, the same fog Bombard!
  uses for unexplored water. It lifts as the crew moves on.
- **The crew** are peg pirates, one per player, painted in that player's
  colour. They move as a gaggle. On each outcome the {hero}'s peg hops and the
  {jonah}'s peg falls over.
- **The cast and props**, all carved in the same style:
  - Big Sandra, a large peg with an apron and a ladle, and the "New Oldham"
    sign.
  - The Big Pan, big enough that the crew's pegs are actually sat in it when
    captured.
  - The monkey, in his waistcoat, and afterwards the cross made of two sticks.
    Played for laughs: a very cross peg monkey tied to two sticks.
  - The volcano, whose top lifts off like a lid when the crew arrive, showing
    the cavern, the heap of doubloons (Bombard!'s coins), and the dragon coiled
    on it. Bombard!'s Kraken shows a creature can be built this way.
- Life-size clutter around the tray, as in Bombard!, is what makes the island
  read as a model: tankards, a dagger, the candle.

**The dice**
- Real bone dice, one per player, thrown onto the table in front of the
  island. Each tumbles and settles on the number the server picked, with its
  owner's name floating over it.
- A brass rule lies along the front of the table, engraved with the five
  zones. A slider runs along it to the total.
- For the dragon, a notched wooden track sits on the table with the dragon's
  head carved at one end and the ship's flag at the other, and a peg that
  moves along it.

**Kit and woes**
- Kit is set out on the table beside the log as little models: the stick, the
  cask, the pan, the scrap of map. Spending or losing one takes it off the
  table.
- Woes stay in the log's margin, in red ink.

**Light**
- Bombard! already dims its sun for a storm; the same control gives each
  scene its own light. Bright morning on the beach, green gloom in the jungle,
  firelight in the village, red light from below on the volcano, and for the
  dragon the sun goes out and only the candle and the dragon's fire are left.

**The endings on the table**
- Perfect: a beacon is lit on the mountain, a pirate ship from Bombard! sails
  into the tray, fireworks.
- Good: the same, but the ship wears Bombard!'s navy paint. HMS Paperwork.
- Neutral: the pegs are sat back round the pan in the village, this time
  outside it.
- Bad: the pegs run down the mountain alight, past a ship that keeps going,
  and into the pan.
- Diabolical: fire sweeps the model, the pegs char black and tip over, the
  candle goes out, and the log page burns through to show the last entry in a
  clawed hand.

**The phones** are a page torn from the log: the options as handwritten slips,
one bone die and a Roll button. Big tap targets, nothing to read that isn't
also on the TV.

**What this replaces.** The first version of this plan had the TV as a flat
logbook with pen-and-wash sketches and a page-turn to an island chart. The
model island now does both jobs, so there are no sketches to draw.

## 5. Sound

- The narrator reads every entry. Log entries are read **without** the pirate
  sign-off ("Yo ho ho!") that the other games tack on, because it would wreck
  the deadpan.
- A slow concertina tune for the log, and a tenser one for the dragon.
- New effects: dice rattling on wood, the seal stamp, tribal drums that stop
  dead, a monkey screech, a dragon's roar, a crackling fire. The quill and
  paper sounds already exist.

## 6. Build notes

### The dice

LiAARRRRGH's Dice (being built in another session as this is written) has
what is needed: the server rolls each die (`rollDie` in `src/games/liars.js`),
and `public/liars-play.js` exports `dieTag(n)`, an SVG die face, with a `roll`
class that tumbles it. Marooned uses the same drawing and tumble so the two
games feel like the same set of dice, reskinned to bone by CSS.

Two differences from Liar's Dice:
- There, the dice roll themselves at the start of a round. Here each player
  taps Roll, so it feels like their throw. The phone sends the tap, the server
  picks the number, the phone tumbles and lands on it.
- Shake-to-roll is not possible: iPhones only expose the motion sensor to
  pages served over https, and the game is served over plain http on the wifi.

Once Liar's Dice has settled, move `dieTag` and `rollDie` into shared files
(`public/dice.js`, `src/dice.js`) that both games import, rather than having
Marooned reach into another game's file.

### Files

| File | What |
| --- | --- |
| `src/games/marooned.js` | The game: a small story runner that walks the scenes in the content file, plus the vote, the roll, and the outcome maths |
| `content/marooned.json` | The whole story, the odds, the timers. Editable between games like every other content file |
| `public/marooned-host.js` | The TV: the log page, and the island model with everything that happens on it |
| `public/diorama.js` | The model-making kit lifted out of Bombard! (paint, parts, the table and its clutter, tweens, smoke and fire, the camera) so both games build from it |
| `public/marooned-play.js` | The vote and roll screens for phones |
| `public/marooned.css` | The look, scoped to this game |

Small touches to shared files, following how Bombard! and Liar's Dice plug in:
register the game in `src/engine.js`, the content file in `src/content.js`,
the screens in `public/host.js` and `public/play.js`, the stylesheet in the two
HTML files, a tune and effects in the sound files, teach `tools/bots.js` to
vote and roll, and a row in the README. Two real changes to the engine: an
option to read a line without the sign-off, and a flag so phones hide the
doubloon counter in a co-op game.

Bombard! and Liar's Dice are both being written in this folder right now and
touch those same shared files. Start building this after they have landed.

### How the story is written down

The full first draft of the script is in `content/marooned.json`. Nothing reads
that file yet, so it is safe to edit freely.

Each scene has an entry, its options, and five outcome passages shared by all
its options. Each option adds a short lead-in line and can replace any of the
five where it has a better joke. To change a line, find it and retype it; the
rest of this section is only needed for changing how the story branches.

| In the file | Means |
| --- | --- |
| `header` | The ruled top of the log page: day, wind, course, remarks. Purely for jokes |
| `entry`, then `ask` | What the log says, then the line that leads into the vote ("We resolved to…") |
| `also` | Extra sentences added only `if` the crew has something, or `unless` they have it. An `also` line can hand out or take away kit too |
| `options` | `mark` is canny, bold or daft. `text` goes on the button, `lead` opens the outcome. `needs` hides the option unless the crew has that kit, `unless` hides it if they do, `spends` uses the kit up, `tilt` shifts the odds for that option alone |
| `tilts` | Which kit and woes shift the odds in this scene, and which way |
| `outcomes` | One passage for each of perfect, good, neutral, bad, diabolical. `gain` hands out kit, `woe` hands out a woe, `next` sends the story to a different scene |
| `note` | Something the log remembers without drawing it in the margin, for a later `also` to test (how the monkey fight went, whether the crew is in the pan) |
| `move` | In the dragon fight only: how far this outcome moves the fight marker, where a daft option earns more than usual |
| `{hero}`, `{jonah}` | Highest and lowest die of the roll just made. Only work in outcomes and endings |
| `{player}` | One random crew member, the same one all the way through a scene |
| `{star}`, `{ship}` | The guest of honour, and the ship named after her |

Lines are written to be read aloud by the narrator: no straight quotes, and
commas where the voice should breathe.

A throwaway checker confirmed the draft holds together: every scene can be
reached, every "next" exists, every option has an outcome for all five results,
and every piece of kit, woe and note is both handed out somewhere and used
somewhere. The game should run the same checks when it loads the file and show
the usual red message on the TV if one fails.

120,000 simulated games on the real script, voting at random, ended:

| | Diabolical | Bad | Neutral | Good | Perfect |
| --- | --- | --- | --- | --- | --- |
| Voting at random | 10% | 34% | 20% | 27% | 9% |
| Always canny | 2% | 33% | 29% | 34% | 2% |
| Always bold | 9% | 31% | 22% | 30% | 9% |
| Always daft | 20% | 30% | 16% | 22% | 12% |

The numbers barely move between a crew of 3 and a crew of 10, and every game
is exactly eight rolls.

### Order of work

1. Story runner and a skeleton story with placeholder text, played on the
   pack's existing plain screens. Bots can play it end to end. This proves the
   vote, the roll, the outcome maths, kit and woes, and the fight gauge.
2. The roll: shared dice, tap to roll, the brass rule, the seal. Flat on the
   plain screens first; the thrown 3D dice come with the table in step 4.
3. The full script, in the content file. (First draft done.)
4. The table. First lift the model-making kit out of Bombard! into
   `public/diorama.js` and check Bombard! still looks identical. Then the log
   page, the island blocked out in plain shapes with the camera moves and fog,
   the pegs and the dice, and last the cast: Big Sandra, the pan, the monkey,
   the volcano lid, the dragon.
5. Sound: tunes, effects, narrator pacing.
6. Playtest for length with bots and with real phones; tune timers and odds;
   README.

## 7. Decisions for you

1. **The name.** Marooned, or something of your own.
2. **Log and island together.** Planned as the log page on the left and the
   model on the right. The alternative is the island filling the whole screen
   with the log as a caption along the bottom: bigger model, less logbook.
3. **The monkey.** Planned as comedy, nothing gory: the "hung up on a cross"
   moment is a very cross peg monkey tied to two sticks. Say if you want it
   played harder or softer.
4. **The script.** A full first draft is in `content/marooned.json`, about 4,500
   words. It is meant to be argued with: change any line, joke or name.
5. **Length.** Eight rolls, about 12 minutes. Dropping the beach or folding the
   dragon to two exchanges brings it under 10.
