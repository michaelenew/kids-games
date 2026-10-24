# Mecha Forge

A robot action game for a kid going into 3rd grade. You blast rust-bots, collect scrap, and, if you want to, build upgrades in the **Engineering Zone**. Each upgrade is a short hands-on math job. The math never blocks play; it makes the harder levels easier.

See [GAME_DESIGN.md](GAME_DESIGN.md) for the full plan and the syllabus mapping.

## What's in the prototype

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

- **iPad:** on-screen ◀ ▶, JUMP and FIRE buttons. Multi-touch works, so he can hold ▶ and tap JUMP. Play it sideways.
- **Laptop:** ← → or A/D to move, Space/↑/W to jump, F/J/X to fire, Esc to pause.

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

If the game feels slow on an older device, add `?canvas` to the address to use a simpler drawing mode.

## Development

```bash
npm test           # unit tests for the math problem generators and level maps
npm run typecheck
```

Code layout:

```
src/
  skills/      pure math: problem generators and checks (unit tested)
  scenes/      Title, Garage, Level, Engineering, and one scene per bench
  levels.ts    level maps, built with small helper calls
  state.ts     save data, gear stats, skill tracking
  art.ts       all art, drawn in code (no image files)
  ui/          buttons, dialog, speech, touch/keyboard controls
```

Adding a level means adding a builder function to `levels.ts`. Making a bench harder or easier means changing the matching generator in `src/skills/`.
