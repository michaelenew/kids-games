# MECHA FORGE — Game Design Outline

A robot action game where every upgrade is built by hand in the workshop, and the math is how the building works.

Source syllabus: "Entering 3rd Grade Math Summer Packet" (35 pages, 8 weeks).

> **Update after the second prototype:** the main mode is now an **arcade invasion** shooter (the camera moves on its own, he just touches aliens), with the side-scroller kept as "patrols". The robot starts as a plain grey frame, and armor is five colored plates built in the **armor forge** from hundreds, tens and ones. Mark I plates are round hundreds. Damage from missions knocks points off plates, and the **repair bay** asks for the exact missing amount (the less round numbers), shown as holes in each plate. Repairs are required before the next mission; all other upgrades stay optional.

> **Update after the first prototype:** math is now **opt-in**. Instead of the forge being a required step after every defeat, there's an **Engineering Zone** he can visit whenever he likes. Levels get harder over time, and the upgrades he builds there (armor, a bigger blaster, jump boots) make them easier. Every level stays beatable with starter gear. Sprocket suggests the Engineering Zone after a retreat, but never forces it. Read "the forge" below as the Engineering Zone, and "Not enough!" moments as nudges, not gates.

---

## 0. Rules for every new piece of learning

1. **Start small.** The first problem of any kind is the easiest version, with a walk-through.
2. **Make it visual.** Show the thing (the clock hand moving, the plate with holes, the stacked sum), don't just state it.
3. **It has to make sense in the story.** The math is how the robot gets built, repaired, launched or briefed, never a riddle standing between him and the fun.
4. **One or two math sections between rewards, at most.** When unsure, add more blasting, not more math. He'll get the math if he keeps playing; if he stops playing, none of it matters.

---

- **His work stays on screen.** Whenever he works something out (a subtraction, counting up, a clock sweep, counting bricks, charging cells) and a later question needs that result, the work or its result stays visible until he's answered. Hints that give an answer don't fade away while he still has to type it.

## 1. What the packet actually teaches

The packet has 35 pages. Grouped by skill:

| # | Skill | Packet pages | What "done" looks like |
|---|-------|-------------|-------------------------|
| A | **Place value & expanded form** (3-digit, then 4-digit), number words, standard form | 1, 6, 10, 14, 19, 23, 32 | 6,725 = 6,000 + 700 + 20 + 5 = "six thousand seven hundred twenty-five" |
| B | **Comparing numbers** (<, >, =) | 24 | 401 > 399 |
| C | **Fact fluency**: add/subtract within 20, chains like 9 − 4 + 3, addition tables, timed (45s to 2 min) | 4, 9, 13, 18, 22, 26, 31, 35 | Fast, accurate recall |
| D | **Multi-digit addition** (two-digit numbers, three at a time, with carrying) | 5, 26, 27 | 97 + 30 + 94 |
| E | **3-digit subtraction** | 15, 27 | 845 − 290 |
| F | **Word problems**: multi-step, "how many more", "how many left", missing part | 3, 7, 12, 21, 29, 34 | "Had 41, ate 6, then 12 more. How many left?" |
| G | **Telling time**: 5-minute marks, then to the minute, analog to digital; days of the week | 2, 21, 33 | Reads 3:47 off a clock face |
| H | **Money**: penny, nickel, dime, quarter, dollar, totals up to $2 | 11, 21, 28, 29 | $1 + 2 quarters + 3 dimes = $1.80 |
| I | **Graphs**: picture graphs (including "each picture = 3"), bar graphs, "twice as many" | 8, 17, 30 | Reads and compares graphs |
| J | **Measuring** with a ruler to the nearest ¼ inch | 20 | Crayon is 2¾ in |
| K | **Multiplication as equal groups**: ×0, ×1, ×2, ×5, ×10 facts | 16, 22, 26, 31, 35 | 3 groups of 4 = 12 |
| L | **Division as fair sharing** | 25, 35 | 12 shared by 3 = 4 each |
| M | Odds and ends: skip counting by 5s, even/odd, estimating ("about 20 or 30?"), simple fractions (¼ of a cake), calendar | 21, 29 | — |

That's 13 skills. The game below covers all of them.

---

## 2. The big idea

**He is a robot that builds its own body.** He wakes up as a half-broken robot in a junkyard on an alien world. A small robot sidekick runs the workshop and talks to him. Outside, a rogue factory has gone haywire and is sending out machines. Every time he gets beaten, or hits a wall he can't get past, he goes back to the forge and **builds** something better.

**The rule that keeps it from feeling like school:** the math is never a gate in front of a reward ("answer this, get a gun"). The math is *how the thing gets built*. You don't answer "what is 300 + 40 + 7"; you bolt 3 big plates, 4 strips and 7 rivets onto your arm, and the armor readout says **347**. If you build it wrong, the armor doesn't fit, or it's too weak and you see the hit punch through. That consequence is the feedback, not a red X.

### Avoiding copyright problems

A transforming robot is a general idea, so it's fine. Things to avoid: the words Autobot, Decepticon, Cybertron, Energon, "Roll out", Optimus/Megatron-style names, the Transformers face logo, and the "transform" sound effect. Make the robot look like *his* robot: he names it and picks its colors in the first session. That also makes him care about it more.

### The cast

- **Him** (robot, he names it): starts as a torso on treads with one arm.
- **SPROCKET**: a small, chatty workshop robot. Tells the story, reads every problem out loud, never makes him feel dumb. ("Ooh, sparks! Too short. Let's measure again.")
- **COMMANDER VOLT**: the radio voice who gives missions. This is a great part to **record in your own voice**.
- **THE FOUNDRY**: the bad guy, a factory brain. Each chapter's boss is one of its machines.

---

## 3. The core loop (one round, about 5 to 8 minutes)

```
   ┌──────────────┐     gets beaten or     ┌──────────────────┐
   │  1. MISSION  │ ──── hits a wall ────▶ │  2. "NOT ENOUGH" │
   │  (action)    │                        │  radio moment    │
   └──────────────┘                        └────────┬─────────┘
          ▲                                         │
          │                                         ▼
   ┌──────────────┐                        ┌──────────────────┐
   │ 4. PAYOFF:   │ ◀──── test fire ────── │  3. THE FORGE    │
   │ smash the    │                        │  (math = building)│
   │ thing that   │                        └──────────────────┘
   │ beat you     │
   └──────────────┘
```

1. **Mission.** Real action: side-scrolling, jumping, blasting, driving. No math on screen.
2. **"Not enough" moment.** Something makes the problem obvious and concrete. The boss's hit does 250 damage and his armor is 100. A gap in the road is 9 inches wide and his ramp is 6. A locked door opens at 3:45 and he doesn't know when that is. Sprocket on the radio: *"Pull back! Our armor's too thin. Get to the forge!"*
3. **The forge.** He builds the fix. This is where the math lives, framed as a building job with a clear target from step 2.
4. **Payoff.** He goes straight back and smashes the thing that beat him. This step matters most. The reward is not a medal screen. It's watching the hit bounce off.

---

## 4. Getting harder: Mark I → Mark II → Mark III

Every piece of gear gets upgraded three times. Each upgrade is one turn of the loop, and each makes the same skill a bit harder:

| Mark | What it feels like | The math step |
|------|--------------------|---------------|
| **Mark I** | Hands-on. Drag real pieces. | Picture/blocks version. The number shows up *after* he builds, as a readout. |
| **Mark II** | Reading a blueprint. | The target is written as a number, in words, or in expanded form. He builds to spec. |
| **Mark III** | Under pressure. | **Time challenge**: base under attack, build it before the shields fail. Or a story problem from Commander Volt. |

Between marks he plays more of the level, and the next boss is tougher, which naturally sets up "it's not enough, we need to fix our gear."

**Time challenges are generous and adaptive.** The timer starts long and only gets shorter once he's comfortable. Running out of time means "the shield flickered, you lost some health", not "game over". Fast fact recall (skill C) is the main thing the packet times, so that's where most time challenges go.

---

## 5. Easing in: how much "school" per chapter

Rough share of play time spent in the forge:

```
Ch 0   ▏ 0%      pure action, just learn to play and love the robot
Ch 1   ██ 10%
Ch 2   ███ 15%
Ch 3   ████ 20%
Ch 4   █████ 25%
Ch 5   ██████ 30%
Ch 6   ███████ 35%
Ch 7   ████████ 40%
Ch 8   ████████ 40%  (control room)
Finale ██████ 30%    ends on action
```

It never goes above about 40%. Early forge jobs are really short: Chapter 1, Mark I is about 60 seconds of dragging plates.

---

## 6. The campaign: chapters mapped to skills

Each chapter gives him a new **body part or vehicle**, so he can watch the robot grow. Order is easiest first, not the packet's week order.

### Chapter 0 — "Boot Up" (session 1, no math)
He's switched on in a junkyard: one arm, treads, a weak blaster. Name the robot, pick colors. A short, fun level of smashing rust-bots. It ends with a big machine (the "Crusher") flattening him, and Sprocket dragging him back to the forge. **Cliffhanger.**

### Chapter 1 — "Armor Up"
**Skills: A (3-digit place value), B (comparing), C (light).**
- **Mark I:** Armor is built from pieces: **big plate = 100, strip = 10, rivet = 1** (the same base-ten blocks on packet page 10). Crusher hits for 250, so he needs more than 250. He drags pieces on and the readout climbs. 
- **Mark II:** The armor socket only takes an exact spec, written as "four hundred twenty-six" or "400 + 20 + 6". Build it exactly or it rattles loose.
- **Comparing:** He finds salvage plates in the level, labeled 401 and 399. Pick the stronger one before the conveyor dumps the other into the furnace.
- **Mark III:** Base alarm. Patch 3 armor panels before the timer runs out.
- **Fluency, inside the action:** the blaster overheats. A heat number shows on his arm (say 14). Cooling pickups say "−6", "−9". He grabs the one that brings it to exactly the safe number. This is how fact practice happens *during* levels instead of on a worksheet.

### Chapter 2 — "Blaster Forge"
**Skills: J (measuring), C (fact chains).**
- **Mark I:** Cut the barrel. A part has to fit a socket that's 3½ inches. Drag a laser cutter along an on-screen ruler with ¼-inch marks. Too short: sparks and it falls out. Too long: it won't close.
- **Mark II:** Measure salvage parts (an on-screen version of packet page 20) to find the one that fits.
- **Mark III:** Energy cell chains. The blaster charge has to hit exactly 12. Cells are +7, −4, +9 (the "9 − 4 + 3" chains from the drill pages). Charge it up while enemies close in.

### Chapter 3 — "Wheels" (he can now transform into a vehicle — the big reward)
**Skills: G (time), D (multi-digit addition), M (calendar).**
- **Mark I:** The bridge lowers at 3:45. A big analog clock is on the dashboard. He drags the hands to set his launch alarm. Wrong time means he arrives at a raised bridge.
- **Mark II:** Read the clock to the minute (packet page 33) for tighter launch windows, and convert it to the digital display.
- **Mark III:** A race. Three track legs are 97, 30 and 94 meters. Load enough fuel for the total. Fuel too low means he stalls short of the finish (and can see exactly how short).
- **Calendar:** "The supply drop comes in 5 days. Today is Friday."

### Chapter 4 — "Scrap Market"
**Skill: H (money).**
The Junk Trader only takes old human coins found in the ruins (this lets the game use real pennies, nickels, dimes, quarters and dollars, which is the skill). He collects coins in levels and pays the trader for parts.
- **Mark I:** Count the coins in his pocket.
- **Mark II:** Pay exact change. The trader has no change.
- **Mark III:** A shopping list from the Commander ("we need a $1.35 servo and a 40¢ fuse") with a fixed purse. Choose what to buy.

### Chapter 5 — "Radar"
**Skills: I (graphs), F (word problems: compare).**
The radar station shows enemy sightings by sector as a **picture graph** (later, "each icon = 3 drones") and enemy types as a **bar graph**.
- He uses the graph to decide which sector to hit and what weapon to take. "There are twice as many flyers as tanks. Bring the anti-air cannon."
- Graph questions *are* the plan: "How many more drones in Sector B than Sector D?" decides where to send the decoy.

### Chapter 6 — "Missile Pods & the Drone Squad"
**Skills: K (equal groups / multiplication), L (fair sharing / division), M (fractions, skip counting).**
- **Mark I:** Missile pods. 3 pods of 4 rockets each. Load them and see the 3 × 4 grid fill. ×0, ×1, ×2, ×5, ×10 come up here.
- **Mark II:** Four helper drones join. He has 12 energy cells and has to share them so each drone gets the same number, or the weakest one falls behind.
- **Fractions:** split the reactor's power between 4 systems, so each gets ¼ (a pie-chart power dial).
- **Skip counting by 5s:** an ammo belt that loads 5 at a time.

### Chapter 7 — "Fortress"
**Skills: A (4-digit place value), E (3-digit subtraction), F (multi-step word problems).**
- **Mark I:** Fortress walls use a new piece: the **mega-block = 1,000**. 4-digit armor.
- **Mark II:** Damage reports. "Wall was 845, took a 290 hit. What's left?" He decides which wall to repair first.
- **Mark III:** Commander Volt's briefings become real multi-step problems. "We had 105 shield cells, used 23, then salvaged 45. Enough to hold the gate (needs 120)?" These are the packet's word problems with the story changed to the robot's world.

### Chapter 8 — "The Control Room"
**New skill (beyond the packet): basic programming and path planning.**
He sits at a console and programs a small scout drone across a grid: `forward 3`, `turn right`, `repeat 4 times`. Then he plays the level, and the drone does what he programmed: opens a door, distracts a turret, drops a shield. If he programmed it wrong, the drone goes off course and he sees it happen during play. That's a natural "fix our gear" moment for code.

This reuses the math: counting squares (addition), "repeat 3 times, move 4 each time" (multiplication), reading the map's grid.

Later control-room missions get harder: plan around a patrol that passes at a set time (time), stay inside a fuel budget (subtraction), choose the shortest of two routes (comparing).

### Finale — "The Foundry Core"
A boss fight that uses everything, one phase per skill. It is short on forge time and big on action, so it ends on a high.

---

## 7. Keeping him coming back across sessions

1. **The robot visibly grows.** The garage screen shows the robot with every part he built. Chapter 0 is a torso on treads. By the finale it's a full mech that turns into a vehicle. Being able to point at it and say "I built that arm" is the main hook.
2. **End every session on a cliffhanger, not mid-forge.** Sessions are planned to be 20 to 30 minutes. The game watches the clock and finishes the current round, then ends on a teaser: *"Sprocket picked up a strange signal... tomorrow."* Never stop in the middle of a worksheet-feeling bit.
3. **Start every session with action.** The first 2 to 3 minutes of every session are a level, never the forge.
4. **Hidden blueprints** in levels unlock cosmetic parts (horns, paint, a jetpack trail). This gives a reason to replay old levels, which quietly reviews old skills.
5. **Maintenance jobs (spaced review).** Old gear "wears out". Every few sessions the armor needs a quick 30-second patch job using last week's skill. This is spaced repetition: coming back to a skill after some time away helps it stick much better than drilling it all at once.
6. **Daily salvage run.** An optional 5-minute mission with one quick forge job and a guaranteed coin reward. Good for short days.
7. **He names things.** The robot, the vehicle mode, the drones.
8. **Your voice.** If Commander Volt is you, it becomes a game you made together. Big motivator at this age.

---

## 8. Learning-science rules built into the game

- **Mistakes are physical, not red X's.** A part too short throws sparks. Armor too thin cracks on test. He sees *how wrong* it was, so he can fix it.
- **Hints get stronger after misses.** First miss: Sprocket gives a nudge. Second miss: the blocks or number-line picture appears. Third: Sprocket walks through it with him. No dead ends.
- **Everything is read aloud.** A third grader's reading is often behind their math. Word problems should never be blocked by reading. Use the browser's built-in speech, or recorded lines.
- **Difficulty follows him.** Each skill has levels inside it (e.g. place value: 2-digit → 3-digit with zeros like 709 → 4-digit). The game moves him up after a few correct answers in a row, and back down quietly if he's struggling.
- **Mastery tracking per skill.** A hidden record of which skills are solid and which are shaky. It decides which maintenance jobs come up and powers a parent view (see below).
- **Numbers come from generators, not fixed lists.** Each skill has a small function that makes fresh problems at a given difficulty, so replays are never memorized.

### Parent view
A hidden screen (e.g. hold a key combo) showing each of the 13 skills with a green/yellow/red status and the mistakes he made, so you know what to talk about away from the screen.

---

## 9. Tech recommendation

**Use TypeScript + Phaser 3, built with Vite. Skip Rust/WASM.**

- **Phaser** is a mature, free JavaScript library for 2D games (sprites, physics, input, sound). It's a good fit for both the action levels and the drag-and-drop forge.
- **Rust compiled to WebAssembly** pays off when you need heavy number crunching. This game doesn't, and it would slow down the part that matters: trying ideas fast with your son.
- **React** is not needed. The forge screens can be Phaser scenes. If you later want a fancy parent dashboard, that one page could be plain HTML.
- **Saving:** browser local storage is fine for one kid on one device. Add an export/import button so progress isn't lost if the browser is cleared.
- **Art:** [Kenney.nl](https://kenney.nl) has free, public-domain robot, sci-fi and vehicle sprites. Good enough to ship, easy to swap later.
- **Voice:** the browser's built-in speech (search "Web Speech API speechSynthesis") for any text, plus your own recordings for the Commander.
- **Runs on:** any browser. Works on a laptop (keyboard) or tablet (touch), but the controls differ. Pick one first.

### Rough code layout
```
src/
  scenes/        Boot, Garage, Level*, Forge*, ControlRoom
  skills/        one file per skill: problem generator + answer check + hint steps
  progress/      save data, mastery tracking, spaced review scheduling
  story/         chapter scripts: dialog lines, which gear, which skill, which Mark
  ui/            shared drag-and-drop, ruler, clock, coin tray, graph widgets
```
Keeping **skills** separate from **story** means a new chapter is mostly writing a script, and a skill's difficulty can be tuned without touching levels.

---

## 10. Build order

1. **Prototype (one weekend-sized chunk):** Chapter 0 plus Chapter 1, Mark I only. One level, one boss, the armor forge with plates/strips/rivets, the payoff fight. **Play it with him and watch.** Does he want to go back to the forge? Does he understand the plates? Does the action feel good?
2. Fix what the playtest shows, then finish Chapter 1 (Mark II, Mark III, the overheat fluency mechanic).
3. Add the garage screen and save system. These are what bring him back tomorrow.
4. Chapters 2 to 7, one at a time, with a playtest after each.
5. Control room (Chapter 8) and finale.
6. Parent view.

---

## 11. Robot roster

- **BOLT**: his first robot, transforms into a car. Flies the city missions.
- **STRIKER** (built): a yellow fighter jet that also transforms into a walking robot. Takes over halfway through the first Egypt mission and does Egypt and the Amazon. Same three benches, its own flashy parts, plus one-mission super gadgets from the Super Lab.
- **TITAN** (built): an orange construction robot that transforms into a bulldozer. Drops in for STRIKER in the first Grand Canyon mission and does the canyon. Its armor is brick walls built in rows, which is where multiplying lives; its repairs are missing rows of bricks.
- **RHINO** (built): an army-green camo tank robot that transforms into a tank. Drops in for TITAN in the first Arctic mission. Review only: its armor uses the regular forge.
- **TRIDENT** (built): a sea-teal submarine robot with a glass dome helmet. Drops in for RHINO in the first ocean mission. Its armor is hull tiles shared into equal rows, which is where dividing lives.
- **PHANTOM** (built): a violet stealth robot that cloaks (shots pass through it) and rides a hoverbike. Drops in for TRIDENT in the first volcano mission. Its armor is cloak cells, power bars cut into equal parts, which is where fractions live.
- **ASTRO** (built): a white astronaut robot that turns into a starfighter. Lands on Titan in mission 71 (TITAN hands over to it) and fights the Titan set on foot. Review only: its benches use the regular forge.
- **Solar-system vehicles:** RHINO's Mars rover, TITAN's mining ship and lake hovercraft, TRIDENT's ice sub, PHANTOM's stealth shuttle and BOLT's rocket fighter. Any robot can ride them; each is built a part at a time in its vehicle bay.

### How the solar system is planned

- **No more review rounds.** Patrol alerts (pick any robot, the pre-launch check takes turns through every concept he has learned) plus super gadgets keep the old ideas coming back.
- **One new idea per set, at the vehicle bay.** Eighths on a ruler and "how much longer" with fractions are not sets of their own: each gets a good picture at the bench the first time only.
- **Help fades on the old ideas.** Paper mode floors rise set by set (Mars: adding and multiplying off the boxes; the belt: dividing, and subtraction onto the blank page; Europa: adding and multiplying onto the blank page; Titan: dividing; the Kuiper Belt: everything). Bay jobs on old ideas are on his own.
- **Everything he built comes back:** each old robot gets a space vehicle, and the last set is the "war": nothing new, all on paper.

### Where each skill lives, by area

| Area | Robot | New focus | Kept up (reinforcement) |
|------|-------|-----------|-------------------------|
| City (1–5) | BOLT | Place value, measuring, fact fluency | — |
| Egypt (6–10) | STRIKER | Time, money, count-up subtraction, bar graphs, adding | City skills on the benches |
| Amazon (11–15) | STRIKER | Written subtraction, picture graphs, estimating | Time, money, adding; patrol alerts with BOLT |
| Grand Canyon (16–20) | TITAN | Multiplying: walls in rows, supply drops (equal groups) | Every report kind in turn, time, money; alerts with BOLT and STRIKER |
| Arctic (21–25) | RHINO (tank) | Nothing new: a review round | Place value and written subtraction (RHINO's armor), multiplying (supply drops), every report kind, time, money |
| Counterattack (26–30) | Any robot he picks | Nothing new: a review round, with reinforcements | All of the above, on whichever robot he takes; gadgets for every robot |
| The Deep (31–35) | TRIDENT (submarine) | Dividing: sharing hull tiles equally into rows | Multiplying (missing rows on repairs), every report kind, time, money |
| Volcano Island (36–40) | PHANTOM (stealth) | Fractions: equal parts, naming fractions, fractions on a number line, one whole | Every report kind, time, money |
| Moon base (41–45) | Any robot he picks | Area (counting tiles, then rows × columns) and perimeter (adding the sides), then telling them apart | Multiplying, adding; every report kind; patrol alerts review everything |
| Moon Siege (46–50) | Any robot he picks | Nothing new: area and perimeter again with less help | The same, with outlines only |
| Space chase (51–55) | Any robot, on the starship | Comparing numbers (<, >, =), 2 to 4 digits | Paper mode: subtraction off the boxes; ×2/×5/×10 facts in the drill and alerts |
| Mars (56–60) | Any robot, on RHINO's rover | Adding three 2-digit numbers; eighths on a ruler (first time only) | Paper mode: adding and multiplying off the boxes |
| Asteroid belt (61–65) | Any robot, on TITAN's mining ship | Two-step word problems | Dividing off the boxes; subtraction on the blank page |
| Europa (66–70) | Any robot, on TRIDENT's ice sub | Picture graphs (each picture = 3 or 5, twice as many); how much longer in eighths (first time only) | Adding and multiplying on the blank page |
| Titan & Saturn (71–75) | ASTRO on foot; TITAN's hovercraft; the starship | Even and odd; ×0 and ×1 | Dividing on the blank page |
| Pluto (76–80) | Any robot, on PHANTOM's stealth shuttle | The calendar | Everything mixed into bay jobs, on his own |
| Kuiper Belt (81–85) | Any robot, on BOLT's rocket fighter | Nothing new: the "war" | Everything on the blank page |

---

## 12. Open questions

- **Device:** laptop with keyboard, or tablet with touch? This changes the action controls a lot.
- **Reading:** can he read word problems on his own, or should everything be voiced?
- **Session length:** how long does he usually play in one go?
- **His tastes:** does he like platformers (jumping), top-down shooters, or racing more? The chapter levels can lean toward his favorite.
