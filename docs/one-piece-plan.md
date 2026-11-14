# Find the One Piece: plan for a choose-your-own captain's log

A short co-operative story game for Plunda the Bunda. The whole crew plays one
team. On the TV an old ship's log writes itself beside a view of the island, a
world built in the hand-carved diorama style of Bombard!, where the story is
acted out. At every turn of the story the crew votes on what to do, then everybody rolls one die on their phone
and the total decides how well it goes: Perfect, Good, Neutral, Bad or
Diabolical.

The game is called **Find the One Piece** (game id `onepiece`). The crew are
after a treasure called the One Piece, the map says it is in the volcano, and
the joke is that nobody ever finds it, in any ending, or learns what it is a
piece of. The logbook itself is titled *The Log of the {star}'s Revenge, kept
by Capt. {star}*.

- Players: 2 to 12, one team, no scores
- Length: about 12 minutes (8 rolls)
- Built on 14 November 2026. This document was the design; "As built" below
  says where the finished game differs from it.

## As built

The game is in and playable: `npm run bots -- 5 onepiece` plays one through.
It follows this plan except where noted here.

- **No narrator.** Nothing is read aloud. The page writes itself to the
  scratch of a quill, each page is paced by how long it takes to write and
  read, and the music carries the mood instead.
- **A tune for every part of the story.** Fourteen in all: one each for the
  beach, the jungle, New Oldham, the monkey, the trial, the climb, the hoard
  and the dragon, one for each of the five endings, and one for the muster.
  They are in `public/onepiece-sound.js`, and each scene names its tune.
- **A slimmer log page and a nearer camera.** The page takes about a third of
  the screen and the island fills the rest, framed much closer than first
  planned.
- **The camera keeps moving.** Every phase of a scene (the entry, the vote,
  the roll, the count, the outcome) has its own camera move, and the camera
  drifts between them.
- **The trial.** The cross stands on open ground where the monkey fell, with
  the monkey on the front of it and the crew well to one side. The village
  sign is up on a tall post behind the huts.
- **Falling over.** The lowest roller does a quick pratfall and gets straight
  back up; the beaten monkey ends on his back with his legs in the air.
- **No shared model kit.** The plan was to lift Bombard!'s model-making code
  into a file both games use. Liar's Dice had already been built with its own
  copy, so this game does the same in `public/onepiece-world.js`, and Bombard!
  and Liar's Dice were left untouched. The dice drawing is borrowed directly
  from `public/liars-play.js`.
- **Not built:** the optional birthday-wish re-roll for the guest of honour.
- **Not yet tried with a room of real phones.** It has been played end to end
  by bots, and by hand on one phone-sized screen.

## 1. One beat of the game

Every scene runs the same four steps, about a minute in all.

1. **The entry.** A new log entry writes itself onto the log page in
   handwriting, to the scratch of a quill. In the world behind it, the crew
   arrive at the scene.
2. **The vote.** The entry ends on a decision. Two or three options appear on
   the page and on every phone. 20 seconds, majority wins, votes show live on
   the TV as ink blots so people can shout about it. A tie is settled by a
   doubloon flip on the TV. The losing options get struck through with a quill.
3. **The roll.** Every phone shows one bone die and a Roll button. Each die
   lands on the log page beside its owner's name and the running total inks
   itself in. Anyone who hasn't rolled after 12 seconds (or whose phone is asleep) has
   theirs rolled by the ship's cat, so there are always exactly as many dice as
   players.
4. **The outcome.** A marker slides along a scale at the foot of the page to
   the total, a wax seal stamps the result (PERFECT … DIABOLICAL), and the
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

The scale is ruled on the page with its five zones, so the crew can see what
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

Outcomes hand out **kit** (good) and **woes** (bad). Each is sketched in the
log's margin, woes in red ink, and the crew's figures carry the kit they hold.
Each is called back exactly once or twice later in the story.

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
notches either way. A notch moves the zone boundaries, visibly, on the
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

The climax is three rolls, not one. A fight gauge with seven notches is drawn
across the log page, the marker starting in the middle. Each exchange moves it:
Perfect +2, Good +1, Neutral 0, Bad −1, Diabolical −2. Where it rests after the
third exchange is the ending:

| Marker | Ending |
| --- | --- |
| +3 or better | **Perfect.** The dragon is beaten, the treasure is yours, a sail appears on the horizon and the crew lights the signal fire off the dragon's last ember. Rescued, rich. |
| +1, +2 | **Good.** The dragon slinks off. The ship sees the fire and takes the crew off, but it is HMS Paperwork, and the treasure is confiscated against a receipt. |
| 0 | **Neutral.** A draw. The dragon keeps its hoard, the crew keep their skins, and the ship sails past because nobody has anything dry to light. Back to the village for tea. The log continues. |
| −1, −2 | **Bad.** The crew escape with nothing, on fire. The ship does see smoke. The smoke is the crew. It sails on. The tribe have the big pan on. |
| −3 or worse | **Diabolical.** Everyone is eviscerated by dragonfire. The page burns away, and a last entry appears in a clawed hand: "Day 5. Ate crew. Bit gamey." |

In none of them is the One Piece found: even the richest crew comes home
without it, and the dragon has never heard of it.

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

This outline came first; the script in `content/one-piece.json` is now the
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
village. He is a real monkey, an ordinary one. Big Sandra goes pale: "It's 'im." He
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

Either way, clutched in his fist: **a treasure map**. An X on the volcano,
marked "the One Piece".
In the corner, a small drawing of a dragon. Big Sandra: "Oh aye. We don't go up
there."

### Day 4: The Volcano (roll 5)

The camera leaves the village and climbs to the mountain as the cloud lifts
off it.

- Canny: the goat track, the long way round.
- Bold: the lava tube. Quicker, and only slightly on fire.
- Daft: shout "hello?" into the crater to see if anyone's in.

A whole map tilts the roll for the crew; a chewed one tilts it against. A good
climb earns **high ground** and full pockets; a bad one leaves the crew
**Singed**; a Diabolical one also drops a piece of kit into the lava.

Then, no roll: the treasure chamber. Gold to the ceiling. Something large is
asleep on it. It is no longer asleep.

### Day 4, night: The Dragon (rolls 6, 7 and 8)

Three exchanges on the fight gauge (section 2.4). It is full night; the only
light is lava, gold and the dragon.

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

## 4. The look: the island itself, built like a diorama

The TV looks at the real island: open sea to the horizon, sky, weather, the
time of day. There is no table and no tray. But everything in that world is
made the way Bombard!'s models are made, hand-carved and painted, so it reads
as a diorama you could reach into. The captain's log sits beside it: the
page takes the left third of the screen and the island the right two thirds.

A simple split: **the world is where the story is seen; the page is where the
game is played.**

**What keeps it looking like a diorama**
- Flat-shaded, chunky, hand-carved shapes in pots of paint, exactly as in
  Bombard!. Nothing smooth, nothing realistic.
- The same faceted sea, now running to the horizon instead of stopping at the
  edge of a tray.
- Cotton-wool for everything soft: clouds, mist, smoke, the steam off the
  volcano, the dragon's breath.
- A low camera with the near and far edges of the picture thrown out of
  focus. That shallow focus is what makes a real place look like a miniature.
- People are little carved figures, not characters with faces.

**The world**
- One island holds the whole journey: the reef with the wreck on it, the
  beach, the jungle, the village clearing, the volcano behind. The camera
  travels through it from scene to scene, with an establishing shot for each.
- What the crew has not reached yet is hidden by weather rather than by the
  edge of a board: sea mist on the first morning, mist in the jungle, a cap of
  cloud on the mountain. It clears as they go.
- The sky keeps the log's time. Dawn on the beach, a hot white noon in the
  jungle, dusk and firelight in the village, a red glow from below on the
  climb, and full night with stars for the dragon, lit only by lava, gold and
  fire.
- **The crew** are small carved pirates, one per player, in that player's
  colour. They move as a gaggle. On each outcome the {hero} hops and the
  {jonah} falls over. They carry what they have won: one has the stick, two
  roll the cask, one wears the Big Pan as a hat.
- **The cast:**
  - Big Sandra, larger than anyone, with an apron and a ladle, and the
    "New Oldham" sign.
  - The Big Pan over its fire, with the crew sat in it when captured.
  - The monkey: a real monkey, who walks in from the woods on all fours. No
    clothes, no character, nothing explained. Afterwards, the cross made of
    two sticks.
  - Inside the volcano, a second set: a cavern lit by lava, a heap of
    Bombard!'s doubloons, and the dragon coiled on it. The camera goes in
    through the crater. Bombard!'s Kraken shows a creature can be built this
    way.

**The log page**
- Always on screen, in the left third, beside the island. Ruled header (Day, Wind, Course,
  Remarks) in IM Fell English; the entry in handwriting that writes itself on
  with the quill sound.
- Options are written in as alternatives. Votes land beside them as ink blots
  in each player's colour, and the losers are struck through.
- The dice land on the page, one beside each pirate's name in a muster
  column. These are the same dice Liar's Dice draws, coloured as bone.
- The scale is ruled across the foot of the page with its five zones, and the
  result is stamped on as a wax seal: gold, green, plain, black, red.
- Kit and woes are small ink sketches in the margin, woes in red.
- For the dragon, the fight gauge is drawn across the page, with the dragon's
  head at one end and the ship's flag at the other.

**The endings in the world**
- Perfect: dawn, a beacon lit on the summit, a Bombard! pirate ship coming in
  from the horizon, fireworks.
- Good: the same, but the ship wears Bombard!'s navy paint. HMS Paperwork.
- Neutral: the sail crosses the horizon and goes. The crew are sat round the
  pan in the village, this time outside it.
- Bad: the crew run down the mountain alight, trailing smoke, past a ship
  that keeps going, and into the pan.
- Diabolical: fire fills the cavern and the picture goes white, then to ash.
  The log page burns through to show the last entry in a clawed hand.

**The phones** are a page torn from the log: the options as handwritten slips,
one bone die and a Roll button. Big tap targets, nothing to read that isn't
also on the TV.

**How this plan got here.** First the TV was a flat logbook with pen sketches;
then a model island on Bombard!'s tavern table. This version keeps Bombard!'s
way of making things and drops the table: the island is the world.

## 5. Sound

- Nothing is read aloud. A quill scratches for as long as the page is writing,
  each die clicks as it lands, and the seal comes down with a thump.
- Every part of the story has its own tune, written to match its mood: a
  wistful concertina waltz for the shipwreck, hand drums and a thumb piano for
  the jungle, a colliery brass band for New Oldham, a quick chromatic scramble
  for the monkey, a straight-faced hymn for the trial, low strings for the
  climb, a music box for the hoard, and everything at once for the dragon.
- Each ending has its own too: a sunlit shanty, a naval march that ends on the
  wrong note, a lullaby, a waltz for one sad trombone, and a far-off bell.
- Effects: dice rattling, the seal, a monkey's screech, a dragon's roar.

## 6. Build notes

### The dice

LiAARRRRGH's Dice (being built in another session as this is written) has
what is needed: the server rolls each die (`rollDie` in `src/games/liars.js`),
and `public/liars-play.js` exports `dieTag(n)`, an SVG die face, with a `roll`
class that tumbles it. This game uses the same drawing and tumble so the two
games feel like the same set of dice, reskinned to bone by CSS.

Two differences from Liar's Dice:
- There, the dice roll themselves at the start of a round. Here each player
  taps Roll, so it feels like their throw. The phone sends the tap, the server
  picks the number, the phone tumbles and lands on it.
- Shake-to-roll is not possible: iPhones only expose the motion sensor to
  pages served over https, and the game is served over plain http on the wifi.

Once Liar's Dice has settled, move `dieTag` and `rollDie` into shared files
(`public/dice.js`, `src/dice.js`) that both games import, rather than having
this game reach into another game's file.

### Files

| File | What |
| --- | --- |
| `src/games/onepiece.js` | The game: a small story runner that walks the scenes in the content file, plus the vote, the roll, and the outcome maths |
| `content/one-piece.json` | The whole story, the odds, the timers. Editable between games like every other content file |
| `public/onepiece-host.js` | The TV: the log page |
| `public/onepiece-world.js` | The TV: the island, the cast, the camera and everything that happens there |
| `public/onepiece-sound.js` | The effects and the fourteen tunes |
| `public/onepiece-play.js` | The vote and roll screens for phones |
| `public/onepiece.css` | The look, scoped to this game |

Small touches to shared files, following how Bombard! and Liar's Dice plug in:
register the game in `src/engine.js`, the content file in `src/content.js`,
the screens in `public/host.js` and `public/play.js`, the stylesheet in the two
HTML files, a tune and effects in the sound files, teach `tools/bots.js` to
vote and roll, and a row in the README. One real change to the engine: a flag so phones hide the
doubloon counter in a co-op game.


### How the story is written down

The full first draft of the script is in `content/one-piece.json`. Nothing reads
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

Lines are written to be read at a glance from across a room: short, with no
straight quotes.

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

All six steps are done: the story runner, the roll, the script, the world,
the sound, and a play-through with bots and on a phone-sized screen. What is
left is a game with real people in the room, to tune the timers and the odds.

## 7. Decisions

All settled on 14 November 2026.

1. **The name.** Find the One Piece. The joke is that you don't.
2. **Where the log goes.** The log page beside the island.
3. **The monkey.** A real monkey who walks in from the woods. An ordinary
   animal, played straight: no clothes, nothing explained.
4. **The script.** A full first draft is in `content/one-piece.json`, about
   4,600 words. It is meant to be argued with: change any line, joke or name.
5. **Length.** Eight rolls, about 12 minutes.
