import Phaser from 'phaser';
import { sfx } from '../audio';
import { COINS, type Coin, coinsTotal, makePriceProblem, moneyText, type PriceProblem } from '../skills/money';
import { type GearId, activeBot, bumpGuide, gearInfo, guideCount, recordSkill } from '../state';
import { getStage } from '../three/stage';
import { H, W, button, dialog, panel, sparks, text, toast } from '../ui/widgets';

/**
 * The junk trader sells the power core every upgrade needs. He only takes
 * old human coins, and he never makes change: pay the exact price.
 */

interface TraderData {
  gear: GearId;
  mark: 1 | 2 | 3;
  /** Where to go once the core is bought. */
  then: { key: string; data?: object };
}

const ROMAN = ['', 'I', 'II', 'III'];
const LOOK: Record<Coin['id'], { r: number; color: number; rim: number; ridges: boolean }> = {
  penny: { r: 30, color: 0xb8733d, rim: 0x7a4a24, ridges: false },
  nickel: { r: 36, color: 0xbfc5cc, rim: 0x7d848c, ridges: false },
  dime: { r: 27, color: 0xd9dde2, rim: 0x8d949c, ridges: true },
  quarter: { r: 42, color: 0xcdd2d8, rim: 0x80878f, ridges: true },
  dollar: { r: 46, color: 0xe2bb55, rim: 0x9c7a26, ridges: false },
};

export class TraderScene extends Phaser.Scene {
  private job!: TraderData;
  private problem!: PriceProblem;
  private paid: Coin[] = [];
  private counter!: Phaser.GameObjects.Container;
  private totalText!: Phaser.GameObjects.Text;
  private misses = 0;
  /** Coin images in the jar, by coin. */
  private jar = new Map<string, Phaser.GameObjects.Image>();
  /** Walk-through line (first visits). */
  private guideText!: Phaser.GameObjects.Text;
  private guided = false;
  private pulse: Phaser.Tweens.Tween | null = null;
  private busy = false;

  constructor() {
    super('Trader');
  }

  init(data: TraderData) {
    this.job = data;
    this.paid = [];
    this.misses = 0;
    this.jar = new Map();
    this.pulse = null;
    this.busy = false;
  }

  create() {
    getStage(this.game.canvas).clear();
    this.makeCoinTextures();
    this.problem = makePriceProblem(Math.random, this.job.mark, guideCount('money'));
    this.add.rectangle(W / 2, H / 2, W, H, 0x2a1d14, 1);
    // A cluttered junk stall.
    const g = this.add.graphics();
    g.fillStyle(0x3d2b1f, 1).fillRect(0, 430, W, 290);
    g.fillStyle(0x5c4030, 1).fillRect(0, 420, W, 18);
    for (let i = 0; i < 14; i++) g.fillStyle(0x4a3628 + (i % 3) * 0x050505, 1).fillRoundedRect(20 + i * 92, 300 + (i % 2) * 30, 70, 120, 8);
    text(this, W / 2, 40, 'JUNK TRADER', 44, '#ffd166').setStroke('#000000', 6);
    button(this, 95, 46, 160, 60, '◀ Back', () => this.scene.start('Engineering'), { size: 24, fill: 0x3d4458 });
    this.drawTrader(200, 300);

    // The item and its price tag.
    const info = gearInfo(activeBot())[this.job.gear];
    panel(this, 570, 210, 440, 230, 0x1d1410, 0xffd166);
    text(this, 570, 130, `POWER CORE`, 30, '#4cf0ff');
    text(this, 570, 170, `for ${info.title} Mark ${ROMAN[this.job.mark]}`, 22, '#ffffff');
    const core = this.add.graphics();
    core.fillStyle(0x4cf0ff, 0.3).fillCircle(450, 245, 40).fillStyle(0x4cf0ff, 1).fillCircle(450, 245, 22);
    this.tweens.add({ targets: core, alpha: 0.6, duration: 600, yoyo: true, repeat: -1 });
    const tag = this.add.graphics().fillStyle(0xf8f4e8, 1).fillRoundedRect(520, 210, 200, 70, 10).lineStyle(3, 0x7a4a24, 1).strokeRoundedRect(520, 210, 200, 70, 10);
    void tag;
    text(this, 620, 245, moneyText(this.problem.price), 44, '#1a1423');

    // The counter where coins go.
    panel(this, 1040, 230, 400, 260, 0x1d1410, 0x9ad1ff);
    text(this, 1040, 120, 'YOUR PAYMENT (tap a coin to take it back)', 16, '#9ad1ff');
    this.counter = this.add.container(0, 0);
    this.totalText = text(this, 1040, 335, '', 30, '#06d6a0');

    // The coin jar.
    text(this, 640, 470, 'COIN JAR: tap a coin to put it on the counter', 22, '#ffd166');
    const coins = this.problem.coins;
    coins.forEach((c, i) => {
      const x = 640 + (i - (coins.length - 1) / 2) * 170;
      const img = this.add.image(x, 570, `coin-${c.id}`).setInteractive({ useHandCursor: true });
      this.jar.set(c.id, img);
      img.on('pointerup', () => this.addCoin(c, img));
      text(this, x, 640, c.name, 22, '#ffffff');
      if (this.job.mark === 1) text(this, x, 670, moneyText(c.cents), 20, '#ffd166');
    });
    const pay = button(this, 1130, 470, 200, 70, 'PAY', () => this.pay(), { fill: 0xf77f00, edge: 0xffd166, size: 34 });
    void pay;
    // First two visits: a guide that suggests the biggest coin that still fits.
    const visits = guideCount('money');
    this.guided = visits < 2;
    if (visits < 4) this.problem.showTotal = true;
    this.guideText = text(this, 640, 400, visits >= 2 && visits < 4 ? 'Tip: start with the biggest coin that fits, then add smaller ones.' : '', 22, '#ffffff', { wordWrap: { width: 900 } })
      .setStroke('#000000', 5).setDepth(5);
    this.refresh();
    dialog(this, [{ who: 'sprocket', text: `Every upgrade needs a power core. This one costs ${moneyText(this.problem.price)}. The trader never makes change, so pay the exact amount!` }], () => {});
  }

  private drawTrader(x: number, y: number) {
    const g = this.add.graphics();
    g.fillStyle(0x6b4f3a, 1).fillRoundedRect(x - 70, y - 40, 140, 160, 30); // robe
    g.fillStyle(0x4a3628, 1).fillCircle(x, y - 70, 55); // hood
    g.fillStyle(0x1a1423, 1).fillCircle(x, y - 62, 38);
    g.fillStyle(0xffd166, 1).fillCircle(x - 14, y - 66, 7).fillCircle(x + 14, y - 66, 7); // eyes
    g.fillStyle(0x8d99ae, 1).fillRect(x - 90, y + 10, 30, 12).fillRect(x + 60, y + 10, 30, 12); // arms
  }

  private makeCoinTextures() {
    for (const c of COINS) {
      const key = `coin-${c.id}`;
      if (this.textures.exists(key)) continue;
      const L = LOOK[c.id];
      const g = this.add.graphics();
      const r = L.r;
      const d = r * 2 + 6;
      g.fillStyle(0x000000, 0.35).fillCircle(r + 5, r + 6, r);
      g.fillStyle(L.rim, 1).fillCircle(r + 3, r + 3, r);
      g.fillStyle(L.color, 1).fillCircle(r + 3, r + 3, r - 4);
      if (L.ridges) {
        g.lineStyle(1, L.rim, 1);
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2;
          g.lineBetween(r + 3 + Math.cos(a) * (r - 4), r + 3 + Math.sin(a) * (r - 4), r + 3 + Math.cos(a) * r, r + 3 + Math.sin(a) * r);
        }
      }
      // A simple profile on the face, like the head on real coins.
      g.fillStyle(L.rim, 0.55).fillCircle(r + 3, r - 2, r * 0.32).fillRect(r + 3 - r * 0.2, r - 2, r * 0.4, r * 0.5);
      g.fillStyle(0xffffff, 0.35).fillCircle(r - r * 0.3, r - r * 0.3, r * 0.25);
      g.generateTexture(key, d, d);
      g.destroy();
    }
  }

  private addCoin(c: Coin, from: Phaser.GameObjects.Image) {
    if (this.busy) return;
    if (this.paid.length >= 16) {
      toast(this, 1040, 300, 'The counter is full!', '#ff9f9f', 24);
      return;
    }
    this.paid.push(c);
    sfx.coin();
    const fly = this.add.image(from.x, from.y, from.texture.key);
    const slot = this.slotPos(this.paid.length - 1);
    this.tweens.add({ targets: fly, x: slot.x, y: slot.y, scale: 0.7, duration: 250, ease: 'Cubic.easeOut', onComplete: () => {
      fly.destroy();
      this.refresh();
    } });
  }

  private slotPos(i: number) {
    return { x: 880 + (i % 6) * 62, y: 170 + Math.floor(i / 6) * 62 };
  }

  private refresh() {
    this.counter.removeAll(true);
    this.paid.forEach((c, i) => {
      const p = this.slotPos(i);
      const img = this.add.image(p.x, p.y, `coin-${c.id}`).setScale(0.7).setInteractive({ useHandCursor: true });
      img.on('pointerup', () => {
        if (this.busy) return;
        this.paid.splice(i, 1);
        sfx.ui();
        this.refresh();
      });
      this.counter.add(img);
    });
    this.totalText.setText(this.problem.showTotal ? `Total: ${moneyText(coinsTotal(this.paid))}` : 'Total: ? (count it!)');
    if (this.guided) this.guide();
  }

  /** Walk-through: say how much is still needed and pulse the coin to add next. */
  private guide() {
    this.pulse?.stop();
    for (const img of this.jar.values()) img.setScale(1);
    const have = coinsTotal(this.paid);
    const need = this.problem.price - have;
    if (need < 0) {
      this.guideText.setText(`That's ${moneyText(have)}, too much! Tap a coin on the counter to take it back.`);
      return;
    }
    if (need === 0) {
      this.guideText.setText(`${moneyText(have)} exactly! Press PAY.`);
      return;
    }
    const best = [...this.problem.coins].sort((a, b) => b.cents - a.cents).find((c) => c.cents <= need);
    if (!best) return;
    const lead = have ? `We have ${moneyText(have)}. We still need ${moneyText(need)}.` : `We need ${moneyText(need)}.`;
    this.guideText.setText(`${lead} The biggest coin that fits is a ${best.name.toLowerCase()} (${moneyText(best.cents)}). Tap it!`);
    const img = this.jar.get(best.id);
    if (img) this.pulse = this.tweens.add({ targets: img, scale: 1.2, duration: 350, yoyo: true, repeat: -1 });
  }

  private pay() {
    if (this.busy) return;
    const total = coinsTotal(this.paid);
    if (!this.paid.length) {
      toast(this, 1040, 300, 'Put some coins on the counter first!', '#ff9f9f', 22);
      return;
    }
    if (total === this.problem.price) {
      this.busy = true;
      recordSkill('money', this.misses === 0);
      bumpGuide('money');
      sfx.success();
      sparks(this, 1040, 230, 0xffd166, 30);
      toast(this, 640, 330, `Exactly ${moneyText(total)}! The core is yours!`, '#06d6a0', 36);
      this.time.delayedCall(1500, () => this.scene.start(this.job.then.key, this.job.then.data));
      return;
    }
    this.misses++;
    sfx.buzz();
    this.cameras.main.shake(120, 0.004);
    const msg = total < this.problem.price
      ? `That's only ${moneyText(total)}. Not enough!`
      : `That's ${moneyText(total)}. Too much! I don't make change.`;
    toast(this, 640, 330, msg, '#ff9f9f', 30);
    // After two misses, show the running total as a hint.
    if (this.misses >= 2) {
      this.problem.showTotal = true;
      this.refresh();
    }
  }
}
