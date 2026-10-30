# Unicorn Rancher

A 3D unicorn game for a kid going into kindergarten. She practices **letter names by saying them out loud**, and counting and adding with apples. This is a prototype; the main open question is whether voice recognition works well enough for her voice. If it doesn't, the game will change direction.

Play it at **https://michaelenew.github.io/kids-games/unicorn-rancher/**.

## How it plays

The rule from Mecha Forge applies here too: the learning is how things happen in the story. Saying a letter is how you cast unicorn magic. Few controls, lots of spectacle. She never steers anything, and a wrong answer never costs her anything.

- **The ranch** (home). Her unicorns wander a fenced paddock beside a red barn, rolling hills and a rainbow while the camera drifts around. Tapping a unicorn makes it rear up, whinny and say its name. Big buttons: Explore, Race, Style, and later Feed. Race and Style unlock once she has a unicorn; Feed appears (glowing, "Your unicorns are hungry!") once learning has started.
- **Explore (trails).** The ride moves on its own: on foot the first time, then on her favorite unicorn's back. Trails take turns among Blossom Woods, Candy Hills and Twilight Glade. Shiny bubbles float along the path for her to pop any time. Three glowing crystals block the path; each one is either a letter to say or a crystal to tap (see Pacing). Either way it shatters into shards and sparkles, and a line of flowers blooms along the path. At the end a shy wild unicorn waits in a glade. Three times she either says a letter (it floats up from the unicorn's horn into the middle of the view) or pets the unicorn with a tap, and each time it comes closer. On the last one it rears up, there are rainbow rings and confetti, it gets a name, and it gallops into the ranch.
- **Race.** Four unicorns gallop around a road in the clouds, past balloons and floating islands. At each of four rainbow gates, time slows to slow motion and a letter (or, for a fun gate, a star to tap) appears inside the arch. Doing it gives a rainbow-trail speed boost, with a whoosh and the camera widening. The finish has fireworks, confetti and a ribbon (1st, 2nd or 3rd).
- **Aliens.** Night falls and silly aliens in flying saucers float over the ranch. Tap one and her unicorn zaps it with a rainbow laser from its horn; it spins away home. Their goo splats harmlessly on her unicorn's shield. Three waves, then the big mothership: its shield is a letter to say (or a tap), then all her unicorns gallop in and zap it together, tap by tap, until it spins off in fireworks and she gets a space medal. A later wave can bring one alien with a letter shield.
- **Stars.** Golden stars drift down over a twilight meadow; tap one and it zooms into her unicorn's horn. After a dozen, a star shower, then a shooting star to wish on. A big letter star may stop in the sky to be named.
- **Dance** (no learning). Her unicorns bounce to a tune on a light-up dance floor with a disco ball and swinging lights. Big buttons: spin, jump, change the lights, fireworks, and done.
- **Style** (no learning). A unicorn on a little stage; tap colors for its coat, mane and horn, with arrows to switch unicorns. Every change sparkles.
- **Feed (math).** Apples pop onto a picnic table with her unicorns behind it. She says (or taps) how many there are, the apples fly into the unicorns' mouths, and hearts float up. Three problems per visit.

## Pacing: fun first

Like Mecha Forge, it starts heavy on the fun and layers learning in (`lessonShare` in `src/unicorn/learn.ts`):
- The first 3 activities have no learning at all: every crystal, gate and wild unicorn is a tap, and Feed isn't on the menu yet.
- After that, about 20% of those moments are letters, growing by 5% per activity to a cap of 50%. They're spread out, never more than two letters in a row.
- Feed (the math) appears after the 4th activity and is always her choice. Style is always pure play.
- The grown-ups' panel shows the current mix.

## Learning

**Letters.** Uppercase and lowercase mixed by default (each case is tracked separately); just ABC or just abc can be chosen in the grown-ups' panel. Each letter has a flashcard box from 0 to 4. A first-try answer moves it up one box, and needing help moves it down one. Low boxes come up much more often, and none of the last four letters repeats (`src/unicorn/learn.ts`).

**New letters are taught first.** The first two times she meets each letter (B and b count separately), she isn't quizzed: "This is bee. Can you say bee?" She just says it back. After that it's "What letter is this?".

**When she gets one wrong** (`src/unicorn/ask.ts`):
1. "Ooh, so close! Try again!"
2. "This is B. Can you say B?" From here on, any rhyming letter counts too (B, C, D, E, G, P, T, V, Z rhyme), because the recognizer mixes those up even when she's right.
3. "That's B!", and the game moves on.

If she says nothing for 8 seconds, the game nudges her ("Say the letter out loud!"), then gives the same help. A recognition failure therefore never stalls the game or makes her feel wrong. It only keeps that letter in a low box.

**Math levels** (each level's first two problems are walked through by counting along together; four first-try answers in a row moves up a level):
1. Count up to 5
2. Count up to 10
3. Add within 5 (red apples and yellow apples)
4. Add within 10
5. Add two one-digit numbers (up to 9 + 9)

Walk-throughs go slowly: apples arrive one at a time, each is counted about once a second in a slower voice, then the total is said ("2 and 3 make 5. 5 apples!"), and the numbers stay on the apples while she answers. A wrong number triggers "Let's count together!": each apple hops, gets a number above it, and the number is said out loud. Then she tries again. Number buttons are always on screen too.

## Voice

- **[Vosk](https://alphacephei.com/vosk/)** is an offline speech recognizer. `vosk-browser` is a WebAssembly build of it that runs in a background thread of the page, in Safari, Chrome and Firefox alike, with no special server settings.
- **The model** is Vosk's small US English model, about 40 MB. It is downloaded once and stored in the browser's Cache Storage. After that it loads from the device and works offline. **No audio leaves the device.**
- **Where the model comes from.** It's too big for git, so `npm run fetch-model` (also run by the deploy) downloads it into `public/models/`. The file is checked against a checksum.
- **What it listens for.** Each question listens only for a short word list (a "grammar"): every letter's name, such as "b", "bee" or "be" for B (`src/unicorn/letters.ts`), or the numbers zero to twenty. Anything else comes back as "unknown". A short list is far more accurate than open dictation.
- **Not hearing itself.** The game ignores the microphone while the narrator (the browser's built-in text-to-speech) is talking.
- **Speed.** A right answer counts as soon as it's heard, while she's still talking. A wrong answer is only judged once she stops.

**Tested so far:** robot-voice recordings (a text-to-speech engine, not a child) of every letter, fed into the recognizer. 24 of 26 came back right. D was heard as "bee", T as "dee", and Z wasn't caught: exactly the rhyming letters the help above is built around. All 13 numbers tried came back right. The whole microphone path in the real game (microphone, recognizer, answer) was checked with a recorded "bee" played into a fake microphone. **Her real voice is the real test.**

## Grown-ups

Press and hold the ⚙ in the top-right corner for a second. The panel has:
- Voice status, and a retry button if the microphone didn't start.
- **Voice check.** It shows each letter big; she says it, and you see exactly what the recognizer heard. Afterwards a grid shows green (heard right), red (heard as another letter) or yellow (heard nothing). This is the quickest way to judge whether voice works for her.
- Answer by talking or tapping (tapping shows three letter buttons).
- Letters: ABC, abc or both. Math level.
- Her progress for every letter, and "Start over".
- **Set her ranch**: type the unicorn, ribbon and heart totals and tap Set, to bring back a ranch from another time or device. Unicorns she has are kept and missing ones are added with new looks and names; hearts are shared out among them. Letter and math progress aren't changed.

Also:
- **A two-finger tap anywhere** counts the current answer as right, for when the recognizer mishears her.
- On a laptop, **typing** the letter or number works too.

## Notes for iPad

- Her ranch (unicorns, their colors, letter and math progress, ribbons) is saved in the browser after every change and comes back on the next visit. It's saved per browser, so the iPad and the laptop each keep their own ranch.

- Use the GitHub Pages link (https). Browsers only allow the microphone on secure sites.
- The first visit downloads the 40 MB model; after that it's instant. Safari may clear site storage for sites that go unused for a few weeks. Adding the game to the Home Screen helps keep it.
- If the microphone is blocked or missing, the game still works: she taps the answers instead.

## Code

```
unicorn-rancher/index.html    the page
src/unicorn/main.ts           start screen and the main loop (ranch → activity → ranch)
src/unicorn/voice.ts          Vosk: model download and cache, microphone, listening
src/unicorn/letters.ts        letter and number words the recognizer listens for
src/unicorn/ask.ts            asking a letter or number out loud, with help and overrides
src/unicorn/learn.ts          flashcard boxes, math problems, unicorn names (unit-tested)
src/unicorn/speak.ts          the narrator (text-to-speech)
src/unicorn/sfx.ts            sound effects made in code
src/unicorn/ui.ts             buttons, mic bubble, captions, grown-ups' panel styles
src/unicorn/state.ts          the save (browser local storage)
src/unicorn/scenes/           ranch, trail, race, feed, grown-ups
src/unicorn/three/            3D: stage (renderer, glow), unicorn model, scenery, effects
tests/unicorn.test.ts         tests for the letter and math logic
```

## Ideas for next

- Lowercase-specific help (b/d/p/q look alike).
- Grooming and decorating the unicorns (ribbons on manes, painted hooves), bought with hearts.
- More trail places (crystal caves, a rainbow waterfall), and flying unicorns with wings.
- Recording a parent's voice for the narrator.
- Letter sounds (phonics), if wanted later. These need a different approach, since the recognizer only knows real words.
