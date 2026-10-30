import { type Ctx, finishedActivity, stats } from './ctx';
import { feed } from './scenes/feed';
import { openGrownups } from './scenes/grownups';
import { race } from './scenes/race';
import { ranch } from './scenes/ranch';
import { style } from './scenes/style';
import { trail } from './scenes/trail';
import { onCaption, unlockSpeech } from './speak';
import { unlockSfx } from './sfx';
import { type OwnedUnicorn, save } from './state';
import { Stage } from './three/stage';
import { UI } from './ui';
import { voice } from './voice';

/**
 * Unicorn Rancher: find and tame unicorns on trails, race them, and feed
 * them, by saying letters (and numbers) out loud.
 */

const ui = new UI();
const stage = new Stage(document.getElementById('app')!);
const ctx: Ctx = { stage, ui };
onCaption((t) => ui.setCaption(t));
ui.onGearHold(1200, () => openGrownups(ui, () => stats(ctx)));

// Her ranch is saved in this browser's local storage after every change
// (see state.ts). Ask the browser to keep it rather than clear it when space
// runs low or the site hasn't been opened for a while.
navigator.storage?.persist?.().catch(() => {});

// Start downloading the speech model straight away (no tap needed for that).
const wantVoice = !save().tapMode;
if (wantVoice) voice.load().catch(() => {});

// The glowing microphone follows how loud she is.
const meter = () => {
  ui.micLevel(voice.level);
  requestAnimationFrame(meter);
};
meter();

// A pretty ranch behind the title screen while it loads.
void ranch(ctx, { backdrop: true });

ui.cover.innerHTML = `<h1>🦄 Unicorn Rancher</h1>
  <button class="btn big">Play ▶</button>
  <div class="bar" style="visibility:hidden"><div></div></div>
  <p class="msg"></p>`;
const play = ui.cover.querySelector('button')!;
const bar = ui.cover.querySelector('.bar') as HTMLElement;
const msg = ui.cover.querySelector('.msg') as HTMLElement;

play.addEventListener('click', async () => {
  unlockSfx();
  unlockSpeech();
  play.style.display = 'none';
  if (wantVoice) {
    bar.style.visibility = 'visible';
    msg.textContent = 'Getting the unicorn magic ready…';
    try {
      await voice.start((p) => ((bar.firstElementChild as HTMLElement).style.width = `${Math.round(p * 100)}%`));
    } catch {
      msg.textContent = "The microphone isn't on, so she can tap the answers. (Grown-ups: hold ⚙ for settings.)";
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  ui.cover.classList.add('hide');
  void loop();
});

async function loop(): Promise<void> {
  let arrival: OwnedUnicorn | undefined;
  for (;;) {
    const next = await ranch(ctx, { arrival });
    arrival = undefined;
    if (next === 'trail') arrival = await trail(ctx);
    else if (next === 'race') await race(ctx);
    else if (next === 'style') await style(ctx);
    else await feed(ctx);
    finishedActivity();
    stats(ctx);
  }
}

if (import.meta.env.DEV) Object.assign(window, { voice, stage, save });
