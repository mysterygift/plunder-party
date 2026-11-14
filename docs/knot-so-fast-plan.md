# Knot So Fast: plan for a quick-fire trivia regatta

A racing game for Plunder Party. Crews of two or three sail a ship round a
deserted island. Trivia questions fire onto every phone, one after another with
no pause; tap the right answer and your ship speeds up. Now and then a ship
gets a gold question, and a right answer to that one fires a cannon at the ship
in front. The TV shows the race as a model on the tavern table, built the way
Bombard!'s diorama is built.

The game is called **Knot So Fast** (game id `knots`).

- Players: 4 to 12, in crews of 2 or 3 (2 or 3 players can play with a boat each)
- Length: under 7 minutes: a 45-second sprint, then three races of about 85 seconds
- Built, on 14 November 2026. Section 9 says what was built and where it
  differs from this plan. It has been played by bots and by one person on a
  laptop, not yet by a room of people with phones.

## 1. What makes this one different

The other games in the pack take turns, wait for the room and let the narrator
talk. This one does none of that. Every choice below follows from five rules.

1. **There is always a question on your phone.** From the starting gun to the
   finish nobody waits for anybody. No rounds, no reveal, no "everyone has
   answered".
2. **The next question is there the instant you tap.** The phone holds the
   next three questions and already knows the answers, so right or wrong shows
   with no wait for the wifi.
3. **Nothing on the phone but the question.** One line of question, four big
   answers, and a thin strip saying where you are in the race. No scrolling.
4. **No talking.** No narrator, no spoken rules. The rules are three lines on a
   card, on screen during the first countdown. Guns, bells and a reel that
   speeds up on the last lap do the rest.
5. **It is a race, and you can always see who is winning.** The running order
   is on the TV and on every phone the whole time. Every overtake is called.
   When you are shot, your phone names who did it.

The game also never stops to ask anything. One race ends, the table shows for
eight seconds, the next countdown starts.

## 2. How a game goes

| Step | Time | What happens |
| --- | --- | --- |
| **The Scramble** | 45 s | Everyone alone in a rowing boat, all against all. Same quick-fire questions, no cannons. It teaches the game and ranks the room. |
| **Crews** | 12 s | The Scramble's result picks the crews: fastest with slowest. Ships are named and painted on the TV; each phone shows your ship and crewmates. |
| **Race 1** | about 85 s | Three laps of the island. All ships start level. |
| **Race 2** | about 85 s | Staggered start: the further up the table you are, the further back you start. |
| **Race 3** | about 85 s | Staggered again, and worth double. Storm, at night. |
| **The muster** | 15 s | The winning crew, then the personal awards. |

Between races: the finishing order and the table for 8 seconds while the ships
sail round to their marks, then a 3-second countdown and a gun.

**A race ends** when every ship is home, or 20 seconds after the winner
crosses the line, whichever comes first. Anyone still out is placed by how far
they got.

## 3. Systems

### 3.1 Wind and speed

Each ship has **wind**, from 0 to 10, shown as a sail filling on the phone and
on the ship's card on the TV.

- A right answer adds wind. A wrong one takes half as much away and locks that
  phone for one second (the right answer shows green meanwhile).
- Wind leaks away at 10% a second, so it halves every seven seconds. Stop
  answering and you are drifting within a quarter of a minute.
- A ship with no wind still drifts forward, so the picture never stops moving
  and every race ends.

| Wind | Speed (leagues a second) | A lap takes |
| --- | --- | --- |
| 0 | 1.2 | 83 s |
| 2 | 2.8 | 36 s |
| 5 | 4.0 | 25 s |
| 10 | 5.4 | 19 s |

A lap is 100 leagues. Speed is `1.2 + 4.2 × (wind ÷ 10)^0.6`: the first pips
of wind are worth more than the last, which keeps a brilliant crew from simply
disappearing.

**Sharing the wind.** A right answer is worth 4.3 pips divided by the size of
the crew: 2.15 from each of a pair, 1.43 from each of a trio. A crew's speed is
therefore its *average* player, and a trio has no edge over a pair (simulated:
33% / 34% / 33% between a pair, a trio and a pair of equal ability). If a
phone falls asleep, the share is worked out over the crew still awake.

**On a roll.** More than five right in a row and your answers are worth half
as much again until you miss. The phone glows; your figure on deck waves.

**Fresh wind.** Ships behind the leader get a little extra speed, growing with
the gap up to +15% at 40 leagues back. It is drawn as wind streaks in the sails
of the back markers so nobody feels cheated by it.

**Button mashing loses.** Tapping blind is right one time in four, and the
three misses cost more wind and more seconds than the hit earns. In simulation
a pair of mashers never won a race against two ordinary pairs and finished half
a lap behind.

### 3.2 The powder question

- Powder questions are dealt **to a ship**, not to a player, so a trio gets no
  more of them than a pair. One crew member, picked at random, gets it as their
  next question. Crewmates' phones show "Sam has the powder!" so they can shout
  help.
- It looks different: a gold card with a fuse burning across the top. Answer
  right before the fuse runs out (8 seconds) and the gun fires by itself. Wrong
  or too slow and it fizzles. It still counts as an ordinary question for wind.
- The shot goes at **the ship one place ahead in the race** at that moment,
  however far away. The ball takes 1.2 seconds to fly and always lands.
- **The leader never gets one.** The further back a ship is, the more often
  they come:

| Place | 2nd | 3rd | 4th | 5th | 6th |
| --- | --- | --- | --- | --- | --- |
| A powder question every | 16 s | 13 s | 11 s | 10 s | 9 s |

  The first arrives 8 to 12 seconds after the start.
- **Being hit:** the ship is holed. For 3 seconds it sails at about a third of
  its speed, and it loses half its wind. That costs roughly 10 leagues, or two
  and a half seconds. The crew's phones flash red and say who fired ("Holed by
  Sam!") but the questions keep coming, so the way out is to keep answering.
- A ship that has just been hit cannot be hit again for 6 seconds.

A four-ship race sees about 13 hits and 8 changes of lead. Six ships: about 21
hits.

### 3.3 Crews

- As many pairs as possible, plus one trio if the number is odd: 4 players is
  2 ships, 7 is 3 ships (one trio), 12 is 6 ships. More ships makes a better
  race than bigger crews. (`"crews": "trios"` in the content file prefers
  threes instead: 12 players become 4 ships.)
- **Seeded from the Scramble.** The fastest rower is put with the slowest,
  second fastest with second slowest, and so on. With an odd number, the
  middle rower joins the middle crew to make the trio.
- Crews stay together for all three races. Each ship gets a name from the
  content file and one of six paint schemes.
- Crews should sit together. The TV says so during the draw.

### 3.4 The staggered start

In races 2 and 3 the ships start in table order. The crew at the top starts on
the line; each place below starts 10 leagues (a tenth of a lap) further ahead.
Combined with the last race counting double, the crew leading the table going
into race 3 gets overhauled about four times in ten.

### 3.5 Doubloons

| Place | 1st | 2nd | 3rd | 4th | 5th | 6th |
| --- | --- | --- | --- | --- | --- | --- |
| Doubloons to each crew member | 1,000 | 700 | 500 | 300 | 200 | 100 |

Race 3 pays double. The Scramble pays nothing, so crewmates always have the
same score and the pack's usual ending ("Sam and Priya share the treasure!")
works as it is. A tie on doubloons goes to whoever finished ahead in race 3.

**The muster** hands out personal titles after the winner: Sharpest Eye (best
accuracy), Fastest Fingers (quickest answers), Master Gunner (most hits), The
Colander (most often holed), Longest Roll, and Loose Cannon (most wrong
answers). The Scramble's winner is named here too.

### 3.6 What the numbers come to

Simulated before writing this down, with players who take about 4.4 seconds a
question and get 70% right (a sharp player: 3.4 s and 86%; a slow one: 5.8 s
and 55%).

| Race | Winner's time | Changes of lead | Hits | 1st and 2nd within 3 s |
| --- | --- | --- | --- | --- |
| Four even pairs | 85 s (78 to 92) | 8 | 13 | 42% |
| The same, cannons off | 75 s | 6.5 | 0 | 57% |
| Two ships (4 players) | 88 s | 5 | 4 | 43% |

Cannons make the order churn more and the finish a little less tight, which is
the right trade for a party.

How much does being good at trivia decide it? A room of mixed ability, three
races, 500 regattas each:

| Players | Ships | Strongest crew wins the regatta: random crews | Seeded crews, staggered starts, double final |
| --- | --- | --- | --- |
| 4 | 2 | 78% | 68% |
| 6 | 3 | 69% | 59% |
| 8 | 4 | 62% | 53% |
| 12 | 6 | 59% | 41% |

So the best crew wins about half the time rather than nearly always, and the
rest of the time somebody takes it off them. The catch: two quiz-league players
drawn together by bad luck still win nine races in ten against ordinary crews,
which is exactly what the seeding is there to prevent.

Every number in this section is a setting in `content/knots.json`.

## 4. The questions

### 4.1 Who they are for

People aged 24 to 30 living in the UK (born 1996 to 2002), on the nerdy side.
They did GCSEs around 2012 to 2018, grew up on CBBC, a Nintendo DS and the
Wii, read Harry Potter as it came out, were online for Vine and early YouTube,
and now watch Taskmaster and play board games.

### 4.2 The bank

600 questions for the first version, 50 in each of twelve categories. A player
sees 65 to 80 in a regatta, and the game remembers what each phone has been
dealt, so that is six or more games before anybody sees a repeat.

| Category | The sort of thing |
| --- | --- |
| Science & space | GCSE science, the periodic table, planets, the body |
| Geography | Capitals, flags, UK towns and rivers, the Tube map |
| History | Tudors, the World Wars, the things everyone did at school |
| Film & TV | Marvel, Pixar, Doctor Who, British sitcoms, Taskmaster, Bake Off |
| Gaming | Pokémon, Mario, Zelda, Minecraft, The Sims, RuneScape, board games |
| Internet & tech | How computers work, old memes, the apps of 2010 to 2020 |
| Music | 2000s and 2010s pop, indie, X Factor, the classics |
| Books & fantasy | Harry Potter, Tolkien, Hunger Games, Pratchett, comics, D&D |
| British life | The high street, food, school, kids' TV, money, the weather |
| Sport | The big tournaments, 2012, PE-lesson rules |
| Words & numbers | Times tables, quick sums, spellings, Roman numerals |
| Sea & pirates | Port and starboard, knots, famous pirates. A few, for flavour |

**All 600 are written**, 50 in each category, in
`content/knots-questions.json`. Each question is one line: `q` the question,
`a` the right answer, `wrong` the other three, `level` 1 to 3.

There is a thirteenth, empty category called `house` for questions about the
people in the room, which only the host can write. ("What is {star}'s cat
called?")

### 4.3 The rules for writing one

A question has to be read and answered in about four seconds, so:

- The question is 70 characters at most; each answer 22 at most.
- Four answers, exactly one right. The wrong ones must tempt someone who half
  knows, and be plainly wrong to someone who knows.
- No "which of these is NOT", no "all of the above", no trick wording.
- Nothing that goes out of date: no "current", "latest", "most followed" or
  "tallest".
- One fact per question, nothing to work out, except in Words & numbers where
  the sum takes two seconds.
- Three levels: **1** nearly everyone gets it, **2** about half, **3** about a
  quarter. Half the bank is level 1, a third level 2 and the rest level 3. A
  quick-fire game wants mostly right answers: the fun is speed, and the 3s are
  where a streak dies.
- Dealing never gives a phone the same category twice running, and shuffles
  the four answers every time.

Examples, one per category:

| Question | Right | Wrong |
| --- | --- | --- |
| What is the chemical symbol for gold? | Au | Ag, Gd, Go |
| What is the capital of Australia? | Canberra | Sydney, Melbourne, Perth |
| Who was the last Tudor monarch? | Elizabeth I | Mary I, Henry VIII, Edward VI |
| Who is the Taskmaster's assistant? | Alex Horne | Greg Davies, Tim Key, Richard Osman |
| Which Pokémon is number 001 in the Pokédex? | Bulbasaur | Pikachu, Charmander, Mew |
| What does the S in HTTPS stand for? | Secure | Server, System, Socket |
| Which band was Harry Styles in? | One Direction | The Wanted, JLS, Union J |
| How many rings were made for mortal Men? | Nine | Three, Seven, One |
| What colour is the Circle line on the Tube map? | Yellow | Green, Red, Pink |
| How many players does a netball team have on court? | Seven | Five, Six, Eleven |
| What is 7 × 8? | 56 | 54, 48, 64 |
| Which side of a ship is port? | Left | Right, Front, Back |

### 4.4 Getting them right

A wrong "right answer" in front of this crowd would be argued about for the
rest of the night, so the bank is made in two passes:

1. Written a category at a time, to the rules above.
2. Every question checked by a second reader who sees only the question and
   the four answers and must pick one, then says what is wrong with it. A
   question where the reader disagrees, or where the fact itself is shaky, is
   thrown out. One whose only fault is a wrong answer that is too nearly
   right, or wording that will date, keeps its fact and gets the fix.

How the first 240 came through that: the second reader picked the intended
answer on all 240 and was unsure of 2. It raised 19 complaints. One question
was thrown out and replaced (a day on Venus is longer than its year only by
one way of measuring a day, and Mercury was among the answers). Fifteen were
fixed: six had a wrong answer that was arguably right (Bebo also had top
friends; Simon's car has a red door), the rest were wording that would date or
could be read two ways. Three were left alone on purpose: the Severn as the
UK's longest river, seven players in netball, and the colour of a bag of
Walkers cheese & onion, which is right today but is Walkers' to change. The
sixteen changed questions have not been back to a second reader.

The other 360 were written by a second writer working to these rules and the
list of faults above, then sat blind in the same way. The reader picked the
intended answer on all 360 and was unsure of none. It raised 2 real
complaints (real tennis is played at Lord's, and Dickens was on an earlier
£10 note) and 33 smaller ones. Twenty-one questions were reworded or had a
wrong answer swapped; none was thrown out. Those twenty-one have not been
re-read either.

The game also checks the file when it loads (lengths, four different answers,
a known category, a level of 1 to 3, no duplicate questions) and shows the
usual red message on the TV if anything is off.

## 5. The look

### 5.1 The TV: a model race on the tavern table

The same table, tray of faceted resin sea, brass corners, tankards and
doubloons as Bombard!. In the middle of the tray is a model of a desert
island, and the course is the water round it. The camera looks down on the
whole tray from where Bombard!'s does and does not move: in a race everyone
has to see every ship all the time.

```
 ┌──────────────────────────────────────────────────────────────┐
 │    →    →    →    →    →    →    →    →    →    →    →       │
 │  ↑    ▲ rocks                                    light ▲   ↓ │
 │  ↑       ╭─────────────────────────────────────╮           ↓ │
 │  ↑       │  palms    wreck     ✕     hut  fire │           ↓ │
 │  ↑       ╰─────────────────────────────────────╯           ↓ │
 │    ←    ←    ←    ←    ←   ┆   ←    ←    ←    ←    ←         │
 └────────────────────────────┆─────────────────────────────────┘
                     start and finish, nearest the camera
```

**The island.** A long sandbar, carved and painted like everything else:
three or four palms, the ribs of a wrecked hull, a skeleton propped against a
chest, HELP spelled out in pebbles, a lean-to, and a signal fire with a
cotton-wool column of smoke. A pile of rocks marks one end of the course and a
stubby lighthouse the other. One castaway lives there. He turns to watch the
leader go past and jumps up and down at the finish.

**The ships** are Bombard!'s brigantine (bow, mast, stern), in six paint
schemes with bold sails so they can be told apart from the sofa: red, navy,
gold, green, purple, black. The crew stand on deck as painted pegs in each
player's own colour. A name flag floats above each ship.

**What you can read off a ship without looking at any numbers:**
- Speed: the sails belly out, the bow lifts, and the cotton-wool wake behind
  gets longer.
- Fresh wind: thin white streaks blowing past the back markers.
- On a roll: a long gold pennant streams from the masthead.
- Holed: the ball arcs across the tray, a splash and a bang, the ship lurches
  and lists, the sail flaps, smoke trails off it, and for three seconds two of
  the pegs bail with buckets.
- A gun firing: fuse, flash, a cotton-wool puff, and the ship rocks back.

**The Scramble** uses the same tray with a rowing boat per player, one peg in
each, oars going faster the faster they answer.

**The finish** is a line of bunting between a post on the island and a buoy.
First ship through gets the gun, fireworks from the island, and its name
across the screen. No slow motion: the race is still on for everyone else.

**Light.** Race 1 is a clear morning. Race 2 is late afternoon with long
shadows and the candle lit. Race 3 is Bombard!'s storm: dark, rain, lightning,
a bigger swell, and the lighthouse lamp sweeping across the tray.

**The words over the model** (all in the pack's usual fonts):
- Top: which race, and the leader's lap ("Race 2 of 3 · Lap 2 of 3"). A bell
  and a banner for the last lap.
- Along the bottom: a card for each ship, in race order, left to right. Place,
  ship name, crew faces, and the wind as a filling sail. When ships change
  places the cards slide past each other.
- Callouts over the model for the things worth shouting about: "The Wet Sock
  takes the lead!", "Holed by Sam!", "Priya is on a roll".

### 5.2 The phones

```
 ┌───────────────────────────┐
 │ 2nd of 5        Lap 2 / 3 │   place, lap
 │ ▓▓▓▓▓▓▓░░░  The Wet Sock  │   your wind
 │ 6 leagues behind HMS Oops │   who to catch, or who is chasing
 ├───────────────────────────┤
 │                           │
 │   What is the chemical    │
 │     symbol for gold?      │
 │                           │
 │ ┌───────────────────────┐ │
 │ │          Ag           │ │
 │ ├───────────────────────┤ │
 │ │          Au           │ │
 │ ├───────────────────────┤ │
 │ │          Gd           │ │
 │ ├───────────────────────┤ │
 │ │          Go           │ │
 │ └───────────────────────┘ │
 └───────────────────────────┘
```

- The four answers fill the bottom half of the screen, within reach of a
  thumb. They never move or resize between questions, so the thumb learns
  where they are.
- **Right:** the button goes green and the next question is there within a
  tenth of a second.
- **Wrong:** the button goes red, the right one goes green, the screen shakes,
  and it is one second before the next question.
- **Powder question:** the card turns gold and a fuse burns across the top.
- **Holed:** a red flash and "Holed by Sam!" across the top strip. The
  question stays put.
- **On a roll:** the edge of the screen glows gold.
- The top strip is the only thing that changes besides the question, and it is
  glanceable: place, lap, wind, and the gap to the ship ahead (or, for the
  leader, to the ship behind).
- Phones buzz on a hit where the phone allows it. iPhones do not let web pages
  vibrate, so every signal is also visible.
- The pack's doubloon counter in the phone's header is swapped for the place
  during a race.

## 6. Sound

- No narrator in this game (`narrator: false`, as in Bombard! and Liar's
  Dice).
- A fast reel played by Liar's Dice's tavern band. It steps up a key and a
  notch in tempo for the last lap of each race.
- Reused from Bombard!: the fuse, the cannon, the splash, the hit, the storm.
- New: a three-beep start and gun, a soft tick for each right answer on a ship
  (so the TV chatters when a crew is flying), the last-lap bell, an overtake
  whoosh, the finishing gun, oars for the Scramble.
- The phones stay silent, as in every other game.

## 7. Build notes

### 7.1 How it fits the engine, and where it doesn't

Every other game is a script that puts up a screen and waits. This one has to
move things 20 times a second. Three things need care.

**The server runs the race.** Alongside the usual `ctx.wait(…, { until })`,
the game runs its own clock, 20 ticks a second, that moves the ships, deals
powder questions and spots the finish. It has to respect the same three things
the engine's timers do: pause (P), the `SPEED` setting for testing, and the
game being ended (Esc).

**The TV works the motion out for itself between messages.** The server sends
each ship's position, wind and state when something happens (an answer, a
hit, a finish) and once a second regardless. Between those, the TV runs the
same sum the server does, so the ships glide. That sum lives in one small file
used by both, the way `public/flag.js` is shared today. Cannon shots are sent
as timed events and played back in step, as Bombard!'s volleys are.

**The phone runs ahead of the server.** The phone is sent its next three
questions with the right answers marked. A tap is judged on the phone at once
and posted to the server, which checks it against what it dealt and scores it.
The server's word is final, and it ignores anything it did not deal or has
already scored. This does mean the answers are in the phone's memory; nobody
at a party is going to go looking.

Two consequences in the shared code:

- Both `play.js` and `host.js` redraw the whole screen whenever a new view
  arrives, and here one arrives several times a second. The race screens must
  be patched in place instead, the way the Flying Colours easel already is on
  phones. Otherwise a redraw lands between a thumb going down and coming up
  and the tap is lost.
- `play.js` blocks further taps while one is being sent. The race screen sends
  its own taps without waiting, as Bombard!'s aiming screen does.

### 7.2 Files

| File | What |
| --- | --- |
| `src/games/knots.js` | The game: the Scramble, the draw, the race clock, powder, scoring |
| `public/knots-motion.js` | The motion sum (wind, speed, holed, fresh wind), shared by the server and the TV |
| `content/knots.json` | Every number in section 3, the timers, ship names |
| `content/knots-questions.json` | The question bank |
| `public/knots-host.js` | The TV: the island, the ships, the cards and callouts |
| `public/knots-play.js` | The phone: the question screen and its own tap handling |
| `public/knots-sound.js` | The reel and the new effects |
| `public/knots.css` | The look, scoped to this game |

Small touches to shared files, as for every game: register it in
`src/engine.js`, the two content files and their checks in `src/content.js`,
the screens in `public/host.js` and `public/play.js`, the stylesheet in the
two HTML files, bots in `tools/bots.js` (they answer after two to six seconds
and get seven in ten right, so `npm run bots -- 8 knots` makes a believable
race), and a row in the README.

**The model-making kit.** Bombard!'s paint pots, parts, sea, ships, smoke,
splashes and tweens are private to `public/bombard-host.js`. The One Piece
plan already calls for lifting them into a shared `public/diorama.js`. That
has not happened yet (`public/onepiece-world.js` is still a stub). Whichever
game gets to its 3D first does the lift, and checks Bombard! still looks
identical afterwards.

**Find the One Piece is being built in this folder right now** and has
uncommitted changes in the same shared files (`engine.js`, `content.js`,
`host.js`, `play.js`, the HTML, `bots.js`). Start this after that has landed,
or build it in a separate worktree and merge.

### 7.3 Order of work

1. **The feel, flat.** The race clock, the motion file, the 240 questions
   already written, the real phone screen, and a TV that is nothing but coloured bars
   crawling across. Bots to fill the room. Then play it on real phones. If
   tapping through questions does not feel instant and a bit frantic here, no
   amount of diorama will fix it, so this is the step to get right.
2. **The whole game, still flat.** Scramble, seeded crews, powder questions,
   three races, staggered starts, doubloons, the muster.
3. **The question bank**, from the 240 already written to 600, written and
   checked as in section 4.4.
4. **The diorama.** Lift the kit out of Bombard!; the tray and island; ships
   moving round the course; wake, sails and pegs; the cannon shot and the
   holed ship; rowing boats; the three kinds of light; the cards and callouts.
5. **Sound.**
6. **Playtest with real people** and tune `content/knots.json`. The numbers
   here come from simulated players; real ones will read faster or slower.
   The two to watch are the length of a race and whether being holed feels
   like a setback or a robbery.

### 7.4 Not in the first build

- The Kraken reaching up and slapping whoever is leading, once, in race 3.
- Letting crews pick or ban a category.
- Choosing when to fire. The gun fires itself so that the phone stays one tap
  per question.
- Anything on the island that affects the race.

## 8. Decisions

Each has been settled one way so the plan holds together. All are cheap to
change before step 2.

1. **The name.** Knot So Fast. Speed in knots, and what you shout at the ship
   in front.
2. **Seeded crews.** The 45-second Scramble ranks everyone and the crews are
   balanced from it. The alternative is a random draw: 45 seconds shorter, but
   the strongest crew wins noticeably more often (59% against 41% with twelve
   players).
3. **Crews stay together** for all three races, for the rivalry. The
   alternative is redrawing them each race with personal doubloons: fairer,
   and one outright winner, but no ship to cheer for.
4. **Pairs before trios.** Twelve players is six ships of two.
5. **The gun fires itself** at the ship one place ahead, at any range.
6. **The phone knows the answers**, for the sake of an instant next question.
7. **Three races, about seven minutes.** `races` and `laps` are settings.
8. **Who writes the 600 questions.** Drafted and checked by Claude as in
   section 4.4, then read through by someone who knows the room, who also
   fills in the `house` category.

## 9. What was built

Everything in sections 2 to 6, with these differences.

**The tavern (added after the plan).** The race is being bet on. The tray now
stands on a worn rug with an old chart poking out from under it. Four punters
have a life-size fist on the edge of the table, and there are three tankards.
During a race the room reacts: coins are flung onto the table as bets and
stay there, fists pound the table (and everything loose jumps), daggers get
stuck into the wood at the big moments (a hit, the last lap), and the punters
shout ("Ten on The Wet Sock!", "That's my rent, that is!"). Each ship's card
shows a bookmaker's price that shortens and lengthens as the race goes. None
of this touches the race: it is all set off by the same events that drive the
callouts, in `public/knots-host.js` under "The ruckus".

**Not done, or done differently:**
- The model-making kit was not lifted out of Bombard! into a shared
  `public/diorama.js`. Find the One Piece was mid-build on the same thing, so
  `knots-host.js` carries its own copy of the small kit, as `liars-host.js`
  already does. Worth doing once both games have settled.
- No flat-bars version of the TV was built first (order of work, step 1). The
  server was proved headless with bots, then the phone, then the model.
- Holed ships list and trail smoke, but the crew pegs do not bail.
- The Scramble has no oar sound of its own.
- The phones' header keeps the player's name and hides the doubloon counter
  during a race; the place is in the strip below it.
- A reel was written for the game rather than borrowing Liar's Dice's band.
  It does step up a tone and a notch for the last lap.

**Still to do with real people** (section 7.3, step 6): play it in a room on
real phones and tune `content/knots.json`. The two things to watch are still
the length of a race and whether being holed feels like a setback or a
robbery. Bots that answer every 2.6 to 5.2 seconds and get 58% to 85% right
run a three-ship race in about 65 to 75 seconds.

