# Mecha Forge

A 3D robot action game for a kid going into 3rd grade. You blast rust-bots, collect scrap, transform into a car, and, if you want to, build upgrades in the **Engineering Zone**. Each upgrade is a short hands-on math job, and each one visibly changes the robot. The math never blocks play; it makes the harder levels easier.

See [GAME_DESIGN.md](GAME_DESIGN.md) for the full plan and the syllabus mapping.

## What's in the prototype

- **A 3D robot that gets visibly cooler.** Metallic paint, chrome pistons, glowing visor and core, truck-style chest windows, wheels and exhaust stacks. Every upgrade adds real 3D parts: shoulder armor, then a chest emblem and knee spikes, then gold horns and wings. The blaster goes from a stubby cannon to a long barrel, then twin barrels with glowing coils, then a spinning gatling gun plus a shoulder missile pod. The boots go from pistons to glowing armored boots to jet thrusters.
- **It transforms into a car** (unlocked after the first mission): press C, or tap CAR on the iPad. The car is faster and rams small enemies.
- **The install moment:** finishing a bench job shows the new part flying onto the spinning robot, then the robot shows it off.
- **3 levels:** The Junkyard, Scrap Canyon, and Crusher's Gate (boss fight). Each one is beatable with starter gear, and each gets harder than the last.
- **Engineering Zone:** three benches, each with Mark I → II → III upgrades.

| Bench | Upgrade it gives | Math skill (from the summer packet) |
|-------|------------------|-------------------------------------|
| Armor | More armor (300 → 800) | Place value: build numbers from plates (100), strips (10), rivets (1); then number words and expanded form; then 4-digit numbers on a timer |
| Blaster | More damage, bigger shots, rapid fire | Measuring on a ruler to the ½ inch, then ¼ inch, then reading lengths |
| Jump Boots | Higher jumps, then double jump | Two numbers that make a sum; add/subtract chains like 9 − 4 + 3; timed fast facts within 20 |

- **Sprocket** (a robot sidekick) reads everything aloud and gives stronger hints after each miss. Turn the voice off in Garage → ⚙.
- **Mistakes are physical:** a barrel that's too short falls out, and armor with the wrong pieces rattles. The game shows which column was off.
- **Time challenges** (Mark III) get 30 seconds longer after each time-out, so he can't get stuck.
- **Progress for grown-ups:** Garage → ⚙ → "Grown-ups: progress" shows first-try accuracy for each skill.
- **Saves automatically** in the browser.

## Controls

- **iPad:** on-screen ◀ ▶, JUMP, FIRE and CAR buttons. Multi-touch works, so he can hold ▶ and tap JUMP. Play it sideways. In the garage, drag across the robot to spin it.
- **Laptop:** ← → or A/D to move, Space/↑/W to jump, F/J/X to fire, C or Shift to transform, Esc to pause.

You can jump on rust-bots' heads to squash them.

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
  scenes/      Title, Garage, Level, Engineering, Install, and one scene per bench
  three/       the 3D layer: robot model and animation, enemies, world, garage showcase
  levels.ts    level maps, built with small helper calls
  state.ts     save data, gear stats, skill tracking
  art.ts       2D art for menus and benches, drawn in code (no image files)
  ui/          buttons, dialog, speech, touch/keyboard controls
```

How the two layers fit together: the game logic (movement, collisions, menus) runs in Phaser on a transparent canvas. Underneath it, a Three.js canvas draws the 3D world. Each game object is invisible in Phaser and has a 3D model that follows it every frame (`src/three/world.ts`). One 3D unit equals one 48px tile, so the two line up exactly.

Adding a level means adding a builder function to `levels.ts`. Making a bench harder or easier means changing the matching generator in `src/skills/`.
