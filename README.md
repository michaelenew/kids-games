# Mecha Forge

A 3D robot action game for a kid going into 3rd grade. You fight an alien invasion in an arcade shooter, blast rust-bots in side-scrolling patrols, collect scrap, transform into a car, forge and repair armor plates, and, if you want to, build upgrades in the **Engineering Zone**. Each upgrade is a short hands-on math job, and each one visibly changes the robot. The math never blocks play; it makes the harder levels easier.

See [GAME_DESIGN.md](GAME_DESIGN.md) for the full plan and the syllabus mapping.

## What's in the prototype

- **Arcade invasion missions** (the main mode). Like the arcade rail shooters: the camera rides along on its own (on a dropship, on foot, or as a car on the highway), stops, and aliens swoop, leap off rooftops and chase him. He only has to put a finger on them. Aim assist locks on to whatever is under his finger and the robot, in the foreground, fires; green alien shots can be shot down too. Waves end in slow motion, and missions 2, 5, 10, 15, 20, 25, 30 and 35 end with a boss: knock out its four pods, then its core. Thirty-five missions: the city (missions 1 to 5, BOLT), Egypt (6 to 10, STRIKER the jet), the Amazon (11 to 15, STRIKER), the Grand Canyon (16 to 20, TITAN the construction robot), the Arctic (21 to 25, RHINO the tank, all review), the Counterattack (26 to 30, any robot he picks, all review) and the Deep (31 to 35, TRIDENT the submarine, dividing). The first mission can't be lost. Code: `src/three/invasion.ts` (the shooter), `src/three/missions.ts` (missions as data), `src/scenes/Invasion.ts` (the HUD).
- **Pacing.** The first five missions only use place value (armor and simple repairs), measuring and fact fluency. Time, money, the mission report and subtraction repairs start in Egypt. Between missions there are never more than two math sections in a row: mission control (before a mission) and the mission report (after one) take turns, and a repair counts as one section. Playing a mission or building an upgrade starts the count over. Upgrades don't count: building one ends with the new part on the robot right away. At most two plates need repair, with at most one count-up warm-up per visit (`pace` in `src/state.ts`).
- **Every new idea gets a "how to" first.** The first time any concept comes up, a HOW TO card explains it step by step with the numbers in front of him, and that first problem is guided (`src/ui/howto.ts`, `src/skills/concepts.ts`):
  - Armor and repairs: hundreds, tens, ones, a zero in the middle (705), the thousands place, numbers written in words (chunk by chunk, including teens), and expanded form.
  - Blaster: half inches, quarter inches, and reading a length off the ruler; the first cut has the target marked.
  - Boots: making a number from two cells, adding and taking away in a chain, and quick facts (the timer waits while he reads).
- **Walk-throughs.** Every kind of problem starts with a step-by-step guide, and the help fades:
  - Adding (two 2-digit numbers): the first 3 times, a full walk-through with carry boxes and answer boxes ("Add 8 and 7. Yes, 15! The 5 goes here, the 1 carries up..."). The next 3, he fills the boxes himself with a short nudge. After that, no help.
  - Subtraction repairs: a count-up ramp. Before each repair he does one short warm-up on a number line, in this order: 1 digit (6 up to 10) guided, 2 digits guided, 2 digits on his own, then 3 digits and 4 digits the same way. A big yellow box always says the one thing to type right now ("131 → 140: how far?"), with the overall goal small above it. Each answer stays on screen in bold ("131 → 140 = 9"), and to add the jumps they're stacked up as long addition, worked one column at a time (ones, tens, hundreds, thousands) with the carried digit written on top; each column's sum stays beside the stack in bold. Guided means each jump is explained ("count on by ONES from 21 to 30: 22, 23... How much is that jump?", then tens, hundreds, thousands, then add the jumps). On his own, a miss shows the first jump and a second miss switches to guided. Real repairs are walked through on the number line until he has done that size of number on his own.
  - **Big subtraction is always step by step** (for now): repairs and warm-ups never ask for the whole answer first. Counting up is always jump by jump, and written subtraction always column by column, because typing the ones digit into an "answer" box and being told it's wrong was confusing.
  - Clock questions go easy to hard. The first visit reads three clocks: :20, then :40 (the hands sweep from the top of the hour so he sees the short hand creep toward the next number, and the walk-through says it's close to the next number but still the same hour), then :55. After that, one question per visit: minutes until (inside one hour, then across the hour), when a trip ends (the same way), reading to the minute, then a mix. Each kind is walked through in small steps the first times (`controlQuestions` in `src/skills/time.ts`). In a walk-through, each step shows its words first with a Next button, then the clock plays the long hand moving: the part it sweeps lights up, a count by 5s pops up around the rim as it passes each number, and a label shows the time it has reached. Then it asks one short question ("How many minutes did the long hand move?"). "Watch again" replays it. Once the walk-throughs are done, the questions are plain word problems with no animation.
  - **Clock answers are typed**, not picked from buttons, so they can't be guessed by tapping around: a time is typed as its digits (3 4 5 shows as 3:45). Days of the week pick from all seven days. The pre-launch armor gauge and clock checks are typed too.
  - Money: the first trader price is small (15¢ to 40¢, dimes and nickels only), and each visit is at most one step harder than the last. The first 2 visits suggest the biggest coin that still fits, and that coin pulses. The next 2 show a tip and the running total.
  - Adding: the first sum needs no carrying; later ones do.
  - Graphs: the first one explains how to read a bar before asking, and the first two ask the easier "who hit you most?"
  - Armor building and early repairs: the first 2 say which column needs how many more taps.
- **Egypt.** Missions 6 to 10 move the invasion to Egypt: dunes, a stone causeway lined with obelisks, temple colonnades, the Nile with palm trees, a sphinx with glowing alien eyes, and pyramids with alien beacons on their tips (`src/three/desert.ts`). Mission 10 ends with the Pyramid Walker boss.
- **STRIKER, the yellow fighter jet.** Mission 6 starts with BOLT on the dropship and on foot. Halfway through, Commander Volt says the saucers are too high and they have to take the fight to the air, Sprocket launches STRIKER, BOLT beams out, and the jet flies the rest (it's easy). Beating it unlocks STRIKER, which flies every Egypt mission. It has its own armor plates (nose, wings, tail fins: bare grey metal until armored yellow), cannons (nose gun → twin wing cannons → quad cannons with missiles → spinning plasma gatlings) and afterburners (one engine → a big afterburner → twin → three hyper boosters with blue flames). Afterburners make it barrel-roll past some shots ("DODGE!"). Code: `src/three/jet.ts`; both robots share the `Mech` interface in `src/three/mech.ts`.
- **STRIKER's robot mode.** STRIKER transforms between the jet and a walking robot (the jet's frame folds into a backpack, the wings fold onto its back, and the cannons move to its forearms). Missions have landing sections where it transforms, drops to the ground and fights on foot, then takes off again. In robot mode the afterburners make it hop sideways out of the way instead of rolling. The Garage has a TRANSFORM button.
- **Super gadgets (the Super Lab).** After the first Amazon mission, Sprocket finds alien tech and opens the Super Lab, a tab in the Engineering Zone. It builds one over-the-top gadget for STRIKER at a time: a Mega Cannon (double damage, huge violet beam shots), Energy Armor (a glowing force field, +1,500 armor), Drone Wingmen (two drones that zap aliens on their own) or Hyper Boosters (rainbow flames, dodges most shots). It costs 15 scrap plus a short two-problem bench job, shows on STRIKER right away, and burns out at the end of the next mission, win or lose. To see it again he builds another one.
- **Patrol alerts.** Each new mission beaten earns one alert (at most two wait at a time): aliens are back at a past map, and an older robot (one the current missions don't use) goes back to deal with them. First a pre-launch checklist where one item is his to check, taking turns between practice from that robot's own benches (battery cells, the armor gauge, a barrel on a ruler, a clock) and the current focus (fuel to top up by counting up; in the canyon, supply crates in rows to multiply). The mission plays easy, pays half scrap, and never damages plates or locks anything.
- **The Amazon.** Missions 11 to 15: a flooded river through giant trees, a stone causeway, waterfalls, step-pyramid ruins and alien hive pods (`src/three/jungle.ts`). It ends with the Hive Tree Walker boss. New math here: written (column) subtraction for repairs (below), and two new mission reports that take turns. Picture graphs: his hits drawn as pictures where each picture means 2 hits (half a picture is 1); the first time, the pictures light up one by one as it counts by 2s, and later questions ask how many more, or which alien hit him twice as many times. Estimating: "about how much damage?", rounding each hit to the nearest ten and then adding; the first time is walked through on a number line with small numbers.
- **Written subtraction repairs (from the Amazon).** Repairs become the packet's stacked subtraction, one column at a time from the ones. Easiest first: the first two need no borrowing, the next three borrow once, then whatever the damage is (often borrowing across a zero). Each kind gets a HOW TO card the first time and a walk-through: the borrow is shown first (the digit next door crossed out, one less written above it, the small digit becoming ten-something), then each column is asked (`src/ui/written.ts`).
- **TITAN, the construction robot.** Mission 16 starts with STRIKER flying into the Grand Canyon; the walkers are dug into the rock, so Sprocket drops TITAN out of the sky and STRIKER flies off. TITAN does every canyon mission. It's orange, slow and heavy-hitting: a rivet cannon on its right arm (nail gun → rivet cannon → twin rivets plus a shoulder rock launcher → a spinning plasma jackhammer) and a digger bucket on its left. Its treads upgrade lets the digger arm swat some shots out of the air ("SWAT!"). It transforms into a bulldozer: it crouches onto big tank treads and drops a dozer blade, for the chase sections. Code: `src/three/titan.ts`.
- **The Grand Canyon.** Missions 16 to 20: a dirt road along the canyon floor beside the river, striped red-rock walls, mesas, old steel bridges overhead, and alien drill rigs boring into the rock (`src/three/canyon.ts`). It ends with the Drill Walker boss. The focus here is multiplying.
- **TITAN's wall yard (multiplying).** TITAN's armor isn't plates, it's brick walls, and walls are built in rows (`src/scenes/WallForge.ts`). The blueprint says "4 rows of 5 bricks". Walked through, he taps LAY A ROW and the count beside the wall goes up by 5s (5, 10, 15, 20), then says how many bricks that is. On his own he answers first and the rows lay themselves in; a miss lights up one row with its count, a second miss switches to the walk-through. Mark I walls use only 2s, 5s and 10s; Mark II introduces the × sign ("× means rows of") with 3s and 4s; Mark III walls are taller. Every brick is 100 armor (shown, never asked). Repairs knock out whole rows ("2 rows of 5 are missing") for the first two, then whole rows plus a few loose bricks ("2 × 5, and 3 more").
- **Canyon mission control and reports.** In the canyon, every other mission control visit is a supply drop instead of a clock: "4 crates, with 5 bricks in each: how many bricks?", drawn as boxes with their bricks inside (equal groups, the other half of multiplying). The first two are walked through. The mission report goes back over everything from before, one kind per visit: adding, picture graphs, estimating and bar graphs.
- **The Arctic (review round).** Missions 21 to 25: a packed-snow road beside a frozen river, ice cliffs, snowy pines, an old research base, alien crystals, falling snow and the northern lights (`src/three/arctic.ts`); it ends with the Ice Walker. RHINO, an army-green camo tank robot, drops in for TITAN in mission 21 (TITAN's feet keep slipping on the ice) and transforms into a tank: a hull closes over it on two big tracks and a turret comes up that swings to aim. Its cannon goes machine gun → tank cannon → twin cannons with a missile pod → plasma railgun; its rocket boosters dash it past shots. No new math here: RHINO's armor is built in the regular forge (place value, with written-subtraction repairs), mission control mixes clocks and supply drops, and the report rotates through everything (`src/three/tank.ts`).
- **The Counterattack (pick your robot, review).** Missions 26 to 30 go back to each place (city, Egypt, the Amazon, the canyon, the Arctic). Before each one a WHO'S GOING? screen shows his whole collection with armor, gadget and repair status, and he picks any robot (`src/scenes/Pick.ts`). They never wait on an upgrade. STRIKER walks the on-foot parts in robot mode and flies the vehicle parts. Three are longer and call for **reinforcements** halfway: his best-upgraded other robot drops out of the sky beside him and shoots by itself. It never takes damage, so repairs stay one robot's worth. He picks the backup too (WHO'S YOUR BACKUP?). If TITAN and RHINO go together, they **combine**: RHINO folds into its tank and drives under TITAN, TITAN jumps up and locks onto the deck in a violet flash, and the two fight as one MEGA RHINO-TITAN for the rest of the mission (`src/three/megabot.ts`). He still aims with the robot he picked and only it takes hits, so repairs stay the same size.
- **Super gadgets for every robot.** Once the Arctic is done, every robot gets its own set in the Super Lab (robot tabs pick whose): BOLT's Mega Blaster, Energy Armor, Drone Buddies and Rocket Pack; TITAN's Mega Jackhammer, Steel Fortress, Drone Crew and Rocket Treads; RHINO's and TRIDENT's too. One per robot at a time, and he can build them again before every mission, as often as he likes. Building one plays the install animation; at the end of the mission it blows off the robot in a burst of violet sparks ("MEGA BLASTER BLEW OFF!"). Shared models in `src/three/gadgets.ts`.
- **The Deep (dividing).** Missions 31 to 35 under the ocean: a sandy trench, kelp forests, coral, rock arches, a sunken ship, glowing alien domes, light rays, fish and bubbles (`src/three/ocean.ts`); it ends with the Kraken Walker. TRIDENT, a sea-teal diver robot with a glass dome helmet, drops in for RHINO (too heavy down there) and transforms into a submarine. Harpoon gun → torpedoes → twin torpedoes with mini-missiles → plasma trident; jet fins dash it past shots (`src/three/sub.ts`).
- **TRIDENT's hull bay (dividing, the only new concept in the Deep).** Its armor is rows of hull tiles, and every row has to be even or it leaks. The blueprint says "10 tiles, shared equally into 2 rows". Walked through, he taps DEAL and one tile goes to each row, round after round, until the pile is empty; then he counts one row. On his own he answers first; a miss deals one round as a hint, a second miss switches to the walk-through. Mark I shares into 2 or 5 rows with small piles; Mark II brings in the ÷ sign ("12 ÷ 3", with a HOW TO card) and 3s and 4s. Every answer is checked by multiplying ("3 rows of 4 = 12 ✓"). Repairs are missing rows of tiles, done like TITAN's walls (`src/scenes/HullForge.ts`).
- **Engineering Zone robot menu.** Once STRIKER has joined, tabs at the top pick the robot (newest first, then the Super Lab); the newest robot is picked when he opens it from the garage. TITAN's armor bench is the wall yard, TRIDENT's the hull bay; its other benches use the same math as the others. He can still upgrade BOLT. STRIKER's benches use the same math as BOLT's (place value, measuring, facts), with jet pictures: the facts bench fills an afterburner flame instead of a spring. Jet missions only count jet upgrades for the "wait on an upgrade" rule below.
- **Mission control (time).** Before an Egypt mission from mission 7 on (when it's mission control's turn), Commander Volt asks clock questions, easy to hard (see Walk-throughs). Each right answer adds 150 shield for that mission.
- **Junk trader (money).** Every upgrade needs a power core from the junk trader, paid in exact change from a jar of pennies, nickels, dimes, quarters and dollar coins. Mark I prices are under $1 with a running total; Mark II and III go up to $2 and he has to count it himself.
- **Mission report (graphs and addition).** After a win: a bar graph of which aliens hit him, a question about it ("which hit you most?" or "how many more?"), or adding two of his hits (two 2-digit numbers), written stacked like the packet's addition pages. Each right answer is worth 2 scrap.
- **Plain robot, colored armor.** The robot starts as a bare grey frame. Armor is five colored plates (chest, both arms, both legs), and each plate's number is part of the robot's health.
- **Mission report adding** keeps each column's sum on screen in big bold ("8 + 7 = 15") while he writes the digit and the carry.
- **Armor forge** (place value). After the first mission he builds the five plates. Each blueprint shows a number (Mark I is round hundreds like 500; Mark II adds tens and number words; Mark III goes past 1,000). He builds it from hundreds, tens and ones. STRIKER's pieces are all its yellow. Right answer: the pieces fly to the robot, and the plate drops on with a clang. Wrong: the pieces flash red and bounce back, with "too heavy" or "too light".
- **Repair bay (subtraction).** The card shows the plate's full value and what's left ("600 − 383"), and the damage on the robot is hidden under scorch marks, so he has to work out the missing amount. When he submits, the scorch blows away and his pieces fly into the real holes. Hits land on random plates and knock points off, and after a win the damage carries back for repairs (there's no healing inside a level). After a loss the damage isn't kept: losing means upgrade, winning means repair. Heavy damage on a plate is capped somewhere between 40% and 85% of it, with a little jitter, so repair numbers stay fresh. The camera zooms in on the damaged plate on the 3D robot, which shows its missing points as empty sockets laid out as hundreds, tens and ones. He fills exactly the missing amount: pieces fly into the holes, extra pieces flash red and bounce off, empty holes flash red, and he tries again with his pieces still there. Missions wait until the robot is repaired.
- **Sound:** sound effects and music are generated in code (`src/audio.ts`). Turn them off in Garage → ⚙.
- **A 3D robot that gets visibly cooler.** Metallic paint, chrome pistons, glowing visor and core, truck-style chest windows, wheels and exhaust stacks. Every upgrade adds real 3D parts: shoulder armor, then a chest emblem and knee spikes, then gold horns and wings. The blaster goes from a stubby cannon to a long barrel, then twin barrels with glowing coils, then a spinning gatling gun plus a shoulder missile pod. The boots go from pistons to glowing armored boots to jet thrusters.
- **It transforms into a car** (unlocked after the first mission): press C, or tap CAR on the iPad. The car is faster and rams small enemies.
- **The install moment:** finishing a bench job shows the new part flying onto the spinning robot, then the robot shows it off.
- **3 side-scrolling patrols** (open after the first invasion): The Junkyard, Scrap Canyon, and Crusher's Gate (boss fight). Each one is beatable with starter gear, and each gets harder than the last.
- **Breakable boxes** in four materials: wood (any blaster), steel (Blaster Mark I), titanium (Mark II) and energy blocks (Mark III). Smashing one gives a short freeze-frame, a shake, debris and scrap. Too-tough boxes clank and say so. Boxes guard scrap vaults and shortcuts, and each later level has tougher boxes; there's always a way around, so the math stays optional.
- **No replays.** A beaten mission or patrol is locked, so the only way forward is the next one.
- **Difficulty is measured, not guessed.** A test bot plays each arcade mission the way a kid would: it picks one alien at a time (not always the best one), takes about a second to switch targets, aims a little off and trails moving targets, lifts its finger now and then, and never aims at incoming shots. Each mission's settings (`dmg`, `hp`, `fire`, `extra` in `src/three/missions.ts`) are tuned so that, with the gear he should have by then (about one upgrade per mission), he ends with about 200 armor to spare. The first try after upgrading leaves about 700; without a new upgrade he runs about 500 short. Patrols are tuned so a run that never dodges takes about 2,000 damage (`dmg` in `src/levels.ts`).
- **Each new mission waits on an upgrade.** From mission 2 on, a mission he hasn't beaten is harder (aliens hit about 35% harder, on top of him missing the upgrade itself) until he builds a new upgrade since beating the mission before. Building anything switches it to the easy settings below. Losing a mission or patrol locks it until he builds an upgrade: Sprocket says so, the only way forward is the Engineering Zone, and the button reads "Build an upgrade first!". Sprocket finds him enough scrap if he's short. Replays and a fully upgraded robot are never held back. Grown-ups can see the state under Garage → ⚙ → Grown-ups.
- **Quiet extra help after upgrades** (the kid never sees it). Building any upgrade turns on hidden help for every level not yet beaten, and each new try raises it. Enemies hit softer, the boss has less health and slows down, falls put him back on the ledge, and a "lucky" repair can drops when he's nearly out. By the third try after upgrading, the level is almost impossible to lose. Beating a level resets its help. You can see the current setting under Garage → ⚙ → Grown-ups. The numbers live in `src/assist.ts`.
- **Engineering Zone:** three benches, each with Mark I → II → III upgrades.

| Bench | Upgrade it gives | Math skill (from the summer packet) |
|-------|------------------|-------------------------------------|
| Armor (forge) | Five armor plates, Mark I → III | Place value: build each plate's number from hundreds, tens and ones; number words; 4-digit numbers. Repairs: build an exact missing amount |
| Blaster | More damage, bigger shots, rapid fire | Measuring on a ruler to the ½ inch, then ¼ inch, then reading lengths |
| Jump Boots | Higher jumps, then double jump | Two numbers that make a sum; add/subtract chains like 9 − 4 + 3; timed fast facts within 20 |

- **Sprocket** (a robot sidekick) talks in text boxes (no voice) and gives stronger hints after each miss.
- **Mistakes are physical:** a barrel that's too short falls out, and armor with the wrong pieces rattles. The game shows which column was off.
- **Time challenges** (Mark III) get 30 seconds longer after each time-out, so he can't get stuck.
- **Progress for grown-ups:** Garage → ⚙ → "Grown-ups: progress" shows first-try accuracy for each skill.
- **Preview ahead (grown-ups):** Garage → ⚙ → "Grown-ups: preview ahead" plays on a copy of his save, with a red PREVIEW banner at the top. Settings then has +50 scrap and Skip mission to jump ahead, and "End preview" throws the copy away and goes back to his real save, untouched.
- **Saves automatically** in the browser. Saves from before STRIKER keep everything, but Egypt starts again at mission 6 (the old Egypt missions were replaced), so he sees the jet take over.

## More robots (planned, not built yet)

He asked for new robots. STRIKER (the fighter jet), TITAN (the construction robot), RHINO (the tank) and TRIDENT (the submarine) are built; this one is next:

- **A robot with invisibility powers**: a stealth robot that can cloak to slip past shots.

It would plug in like the others: a model with the `Mech` interface (`src/three/mech.ts`), its own entry in `BotId` and the `BOTS` table (`src/state.ts`), a tab in the Engineering Zone menu, and its own set of missions.

## Skills from the packet not in the game yet

Kept out on purpose so no area piles on too much math at once:

- Comparing numbers with <, > and =
- Even and odd
- Fractions
- General word problems (beyond the story ones already in mission control)
- Adding three 2-digit numbers at once
- Picture graphs where each picture stands for 5 (the canyon's graphs still use 2)
- Days of the week only show up late in the clock ramp

## Controls

- **Arcade missions:** touch (or click and hold) the aliens. That's it.
- **iPad:** on-screen ◀ ▶, JUMP, FIRE and CAR buttons. Multi-touch works, so he can hold ▶ and tap JUMP. Play it sideways. In the garage, drag across the robot to spin it.
- **Laptop:** ← → or A/D to move, Space/↑/W to jump, F/J/X to fire, C or Shift to transform, Esc to pause.

You can jump on rust-bots' heads to squash them.

## Playing it

The game is hosted on GitHub Pages at **https://michaelenew.github.io/kids-games/**. Open it in Safari on the iPad (Share → "Add to Home Screen" makes it open full screen like an app) or in any browser on the laptop. It updates automatically a minute or two after every push to `main` (`.github/workflows/pages.yml`).

Progress is saved in each browser separately, so the iPad and the laptop each keep their own robot. To start over: Garage → ⚙ → Start over (tap it twice).

## Running it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Vite prints two addresses. `Local` is for the laptop. `Network` (something like `http://192.168.1.20:5173`) is for the **iPad**: open it in Safari while both devices are on the same Wi-Fi. In Safari, Share → "Add to Home Screen" makes it open full screen like an app.

To make a static copy you can put on any web host:

```bash
npm run build      # outputs to dist/
```

## Graphics and speed

The 3D layer adjusts itself: it starts at medium quality and drops to a cheaper look (no glow, no shadows) if frames get slow. If an older iPad still struggles, go to Garage → ⚙ → **Graphics: FAST**.

For testing, `?quality=high`, `?quality=med` or `?quality=low` forces a quality level, and `?canvas` draws the 2D layer without WebGL.

## Development

```bash
npm test           # unit tests for the math problem generators and level maps
npm run typecheck
```

Code layout:

```
src/
  skills/      pure math: problem generators and checks (unit tested)
  scenes/      Title, Garage, Invasion, ArmorForge, Level, Engineering, Install, and one scene per bench
  three/       the 3D layer: robot model and animation, aliens, city, dropship, effects, the arcade shooter, side-scroller world, garage showcase
  armor.ts     the five armor plates: plate numbers, mission damage, repairs
  audio.ts     sound effects and music, made with the Web Audio API
  levels.ts    level maps, built with small helper calls
  state.ts     save data, gear stats, skill tracking
  art.ts       2D art for menus and benches, drawn in code (no image files)
  ui/          buttons, dialog, speech, touch/keyboard controls
```

How the two layers fit together: the game logic (movement, collisions, menus) runs in Phaser on a transparent canvas. Underneath it, a Three.js canvas draws the 3D world. Each game object is invisible in Phaser and has a 3D model that follows it every frame (`src/three/world.ts`). One 3D unit equals one 48px tile, so the two line up exactly.

Adding a level means adding a builder function to `levels.ts`. Making a bench harder or easier means changing the matching generator in `src/skills/`.
