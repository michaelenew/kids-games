# Mecha Forge

A 3D robot action game for a kid going into 3rd grade. You fight an alien invasion in an arcade shooter, blast rust-bots in side-scrolling patrols, collect scrap, transform into a car, forge and repair armor plates, and, if you want to, build upgrades in the **Engineering Zone**. Each upgrade is a short hands-on math job, and each one visibly changes the robot. The math never blocks play; it makes the harder levels easier.

See [GAME_DESIGN.md](GAME_DESIGN.md) for the full plan and the syllabus mapping.

## What's in the prototype

- **Arcade invasion missions** (the main mode). Like the arcade rail shooters: the camera rides along on its own (on a dropship, on foot, or as a car on the highway), stops, and aliens swoop, leap off rooftops and chase him. He only has to put a finger on them. Aim assist locks on to whatever is under his finger and the robot, in the foreground, fires; green alien shots can be shot down too. Waves end in slow motion, and missions 2 and 5 end with a boss: knock out its four pods, then its core. Eight missions: Drop Zone, Highway Run, Street Fight, Sky Battle and The Hive Queen in the city, then Desert Landing, Temple Run and The Great Pyramid in Egypt. The first mission can't be lost. Code: `src/three/invasion.ts` (the shooter), `src/three/missions.ts` (missions as data), `src/scenes/Invasion.ts` (the HUD).
- **Pacing.** The first five missions only use place value (armor and simple repairs), measuring and fact fluency. Time, money, the mission report and subtraction repairs start in Egypt. Between missions the math stays short: one clock question before an Egypt mission, one report question after it (adding or the graph, taking turns), and at most two plates to repair.
- **Every new idea gets a "how to" first.** The first time any concept comes up, a HOW TO card explains it step by step with the numbers in front of him, and that first problem is guided (`src/ui/howto.ts`, `src/skills/concepts.ts`):
  - Armor and repairs: hundreds, tens, ones, a zero in the middle (705), the thousands place, numbers written in words (chunk by chunk, including teens), and expanded form.
  - Blaster: half inches, quarter inches, and reading a length off the ruler; the first cut has the target marked.
  - Boots: making a number from two cells, adding and taking away in a chain, and quick facts (the timer waits while he reads).
- **Walk-throughs.** Every kind of problem starts with a step-by-step guide, and the help fades:
  - Adding (two 2-digit numbers): the first 3 times, a full walk-through with carry boxes and answer boxes ("Add 8 and 7. Yes, 15! The 5 goes here, the 1 carries up..."). The next 3, he fills the boxes himself with a short nudge. After that, no help.
  - Subtraction repairs: a count-up ramp. Before each repair he does one short warm-up on a number line, in this order: 1 digit (6 up to 10) guided, 2 digits guided, 2 digits on his own, then 3 digits and 4 digits the same way. Guided means each jump is explained ("count on by ONES from 21 to 30: 22, 23... How much is that jump?", then tens, hundreds, thousands, then add the jumps). On his own, a miss shows the first jump and a second miss switches to guided. Real repairs are walked through on the number line until he has done that size of number on his own.
  - Clock questions: the first 2 of each kind are broken into small steps (which hour, then count the minutes by 5s; or count to the next hour, then the rest).
  - Money: the first 2 trader visits suggest the biggest coin that still fits, and that coin pulses. The next 2 show a tip and the running total.
  - Graphs: the first one explains how to read a bar before asking.
  - Armor building and early repairs: the first 2 say which column needs how many more taps.
- **Egypt.** Missions 6 to 8 move the invasion to Egypt: dunes, a stone causeway lined with obelisks, temple colonnades, the Nile with palm trees, a sphinx with glowing alien eyes, and pyramids with alien beacons on their tips (`src/three/desert.ts`). Mission 8 ends with the Pyramid Walker boss.
- **Mission control (time).** Before every Egypt mission, Commander Volt asks a clock question: read an analog clock (5-minute marks at first, then to the minute), how many minutes until the fleet lands, what time a trip ends, or what day it will be in a few days. A right answer adds 150 shield for that mission.
- **Junk trader (money).** Every upgrade needs a power core from the junk trader, paid in exact change from a jar of pennies, nickels, dimes, quarters and dollar coins. Mark I prices are under $1 with a running total; Mark II and III go up to $2 and he has to count it himself.
- **Mission report (graphs and addition).** After a win: a bar graph of which aliens hit him, a question about it ("which hit you most?" or "how many more?"), or adding two of his hits (two 2-digit numbers), written stacked like the packet's addition pages. Each right answer is worth 2 scrap.
- **Plain robot, colored armor.** The robot starts as a bare grey frame. Armor is five colored plates (chest, both arms, both legs), and each plate's number is part of the robot's health.
- **Armor forge** (place value). After the first mission he builds the five plates. Each blueprint shows a number (Mark I is round hundreds like 500; Mark II adds tens and number words; Mark III goes past 1,000). He builds it from hundreds, tens and ones. Right answer: the pieces fly to the robot, and the plate drops on with a clang. Wrong: the pieces flash red and bounce back, with "too heavy" or "too light".
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
- **Saves automatically** in the browser.

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
