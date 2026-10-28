import { ALL_LETTER_WORDS, LETTERS, lettersIn } from '../letters';
import { type CaseMode, lessonShare, MATH_LEVELS, MAX_BOX, MAX_LESSON_SHARE } from '../learn';
import { hush } from '../speak';
import { persist, resetSave, save } from '../state';
import type { UI } from '../ui';
import { voice } from '../voice';

/**
 * The grown-ups' panel (press and hold the gear): how the microphone is
 * doing, a letter-by-letter voice check, settings, and her progress.
 */
export function openGrownups(ui: UI, onChange: () => void): void {
  hush();
  const sv = save();
  const status =
    voice.status === 'ready'
      ? '✅ Listening on this device. Nothing is sent anywhere.'
      : voice.status === 'loading'
        ? `⏳ Getting the speech model ready (${Math.round(voice.progress * 100)}%)…`
        : `⚠️ Voice is off${voice.error ? `: ${voice.error}` : ''}. She can tap answers instead.`;
  const opt = (group: string, value: string, label: string, on: boolean) => `<button class="opt${on ? ' on' : ''}" data-g="${group}" data-v="${value}">${label}</button>`;
  const letterCells = [...LETTERS, ...LETTERS.map((l) => l.toLowerCase())].map((l) => {
    const st = sv.letters[l];
    const cls = !st ? '' : st.box >= 3 ? 'ok' : st.box >= 1 ? 'meh' : 'bad';
    return `<div class="cell ${cls}"><b>${l}</b>${st ? `${st.right}/${st.seen} right` : 'not yet'}</div>`;
  }).join('');
  const checkCells = Object.keys(sv.voiceCheck).length
    ? LETTERS.map((l) => {
        const heard = sv.voiceCheck[l];
        if (heard === undefined) return '';
        const ls = lettersIn(heard);
        const cls = ls.includes(l) ? 'ok' : ls.length ? 'bad' : 'meh';
        return `<div class="cell ${cls}"><b>${l}</b>${heard || '(nothing)'}</div>`;
      }).join('')
    : '<span class="note">Not run yet.</span>';

  ui.panel.innerHTML = `<div class="box">
    <h2>Grown-ups</h2>
    <div>${status}</div>
    <div class="row" style="margin-top:8px">
      ${voice.status === 'failed' || voice.status === 'off' ? '<button class="opt" data-act="retry">Try the microphone again</button>' : ''}
      ${voice.ready ? '<button class="opt" data-act="check">Voice check: say every letter</button>' : ''}
    </div>
    <h3>Play and learning</h3>
    <div class="note">It starts as pure play, then mixes in letters (and the Feed math) a little more after each activity, up to about half.
      Right now: about ${Math.round(lessonShare(sv.pace.played) * 100)}% learning (${sv.pace.played} activities played; tops out at ${MAX_LESSON_SHARE * 100}%).</div>
    <h3>Answer by</h3>
    <div class="row">${opt('tap', '0', '🎤 Talking', !sv.tapMode)}${opt('tap', '1', '👆 Tapping', sv.tapMode)}</div>
    <h3>Letters</h3>
    <div class="row">${opt('case', 'upper', 'ABC', sv.caseMode === 'upper')}${opt('case', 'lower', 'abc', sv.caseMode === 'lower')}${opt('case', 'both', 'Both', sv.caseMode === 'both')}</div>
    <h3>Math</h3>
    <div class="row">${MATH_LEVELS.map((m, i) => opt('math', String(i), m, sv.math.level === i)).join('')}</div>
    <h3>Letter progress</h3>
    <div class="note">Green: knows it (right the first time, several times). Yellow: getting there. Red: needs practice. Box ${MAX_BOX} is the top.</div>
    <div class="grid">${letterCells}</div>
    <h3>Last voice check (what the recognizer heard)</h3>
    <div class="grid">${checkCells}</div>
    <p class="note">Tips: a two-finger tap anywhere counts the current answer as right (for when the recognizer mishears her). On a keyboard, typing the letter or number works too.</p>
    <div class="row" style="justify-content:space-between;margin-top:16px">
      <button class="opt" data-act="reset">Start over (erase progress)</button>
      <button class="opt on" data-act="close">Done</button>
    </div>
  </div>`;
  ui.panel.classList.remove('hide');

  const close = () => {
    ui.panel.classList.add('hide');
    ui.panel.innerHTML = '';
  };
  ui.panel.onclick = async (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    const g = b.dataset.g;
    const v = b.dataset.v!;
    if (g === 'tap') sv.tapMode = v === '1';
    if (g === 'case') sv.caseMode = v as CaseMode;
    if (g === 'math') sv.math = { ...sv.math, level: Number(v), streak: 0 };
    if (g) {
      persist();
      onChange();
      openGrownups(ui, onChange);
      return;
    }
    switch (b.dataset.act) {
      case 'close':
        close();
        break;
      case 'reset':
        if (confirm('Erase all unicorns and progress?')) {
          resetSave();
          close();
          location.reload();
        }
        break;
      case 'retry':
        try {
          await voice.start();
        } catch {
          // Status shows the error.
        }
        openGrownups(ui, onChange);
        break;
      case 'check':
        close();
        await voiceCheck(ui);
        openGrownups(ui, onChange);
        break;
    }
  };
}

/**
 * Voice check: show each letter big, she says it, and we record exactly
 * what the recognizer heard. Shows which letters it struggles with for her.
 */
async function voiceCheck(ui: UI): Promise<void> {
  const sv = save();
  sv.voiceCheck = {};
  ui.check.classList.remove('hide');
  let stopAll = false;
  ui.check.innerHTML = `<div class="letter"></div><div class="heard"></div><button class="opt" style="font-size:20px;padding:10px 20px">Stop</button>`;
  const letterEl = ui.check.querySelector('.letter') as HTMLElement;
  const heardEl = ui.check.querySelector('.heard') as HTMLElement;
  (ui.check.querySelector('button') as HTMLElement).onclick = () => (stopAll = true);
  for (const l of LETTERS) {
    if (stopAll) break;
    letterEl.textContent = l;
    heardEl.textContent = 'Listening…';
    const text = await new Promise<string>((resolve) => {
      let last = '';
      const stop = voice.listen(ALL_LETTER_WORDS, (h) => {
        heardEl.textContent = h.text;
        last = h.text;
        if (h.final) finish(h.text);
      });
      const timer = setTimeout(() => finish(last), 6000);
      const watch = setInterval(() => stopAll && finish(last), 200);
      function finish(t: string) {
        clearTimeout(timer);
        clearInterval(watch);
        stop();
        resolve(t);
      }
    });
    sv.voiceCheck[l] = text;
    const ok = lettersIn(text).includes(l);
    heardEl.textContent = `${ok ? '✅' : '❌'} heard “${text || 'nothing'}”`;
    await new Promise((r) => setTimeout(r, 700));
  }
  persist();
  ui.check.classList.add('hide');
}
