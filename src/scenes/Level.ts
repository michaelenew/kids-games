import Phaser from 'phaser';
import { COLORS, FONT, ROBOT_CX, ROBOT_H, ROBOT_W, TILE, makeRobotTextures } from '../art';
import { MissionArmor, lookFromSave, totalMax } from '../armor';
import { type Tuning, onLevelCleared, onLevelStart, tuning } from '../assist';
import { GROUND_ROW, LEVELS, ROWS, type LevelDef } from '../levels';
import {
  BLASTER_COOLDOWN, BLASTER_DAMAGE, JUMP_VELOCITY,
  canDoubleJump, hasSeen, markSeen, persist, save,
} from '../state';
import { getStage } from '../three/stage';
import { type TrackKind, WorldView } from '../three/world';
import { Controls } from '../ui/controls';
import { H, W, button, dialog, panel, speak, text, toast } from '../ui/widgets';

const GRAVITY = 1500;
const RUN_SPEED = 290;
const CAR_SPEED = 470;
const JUMP_BUFFER_MS = 130;
/** Where shots leave the cannon, relative to the robot's feet, per blaster mark (px). */
const MUZZLE_X = [34, 46, 48, 50];
const MUZZLE_Y = 58;
/** The action camera is zoomed in so the robot is big on screen; menus use a second, unzoomed camera. */
const ZOOM = 1.4;

type Hurt = 'fall' | 'boss' | 'enemy';
type Sprite = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
type EnemyKind = 'rustbot' | 'turret' | 'drone' | 'boss';

interface EnemyData {
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  dir: number;
  nextFire: number;
  baseY: number;
  state: 'walk' | 'windup' | 'air' | 'rest';
  stateUntil: number;
  wasAirborne: boolean;
  hitsSinceDrop: number;
}

const DAMAGE: Record<EnemyKind, number> = { rustbot: 50, turret: 50, drone: 40, boss: 150 };
const HP: Record<EnemyKind, number> = { rustbot: 2, turret: 3, drone: 1, boss: 30 };
const RAM_DAMAGE = 3;

/** Breakable boxes: which blaster mark cracks them, how tough they are, how much scrap is inside. */
const BOXES: Record<string, { kind: 'wood' | 'steel' | 'titan' | 'energy'; need: number; hp: number; scrap: number }> = {
  w: { kind: 'wood', need: 0, hp: 2, scrap: 1 },
  s: { kind: 'steel', need: 1, hp: 4, scrap: 2 },
  x: { kind: 'titan', need: 2, hp: 6, scrap: 3 },
  e: { kind: 'energy', need: 3, hp: 8, scrap: 4 },
};

/** The car unlocks once the first mission is done. */
export function carUnlocked(): boolean {
  return save().levelsDone.includes('junkyard');
}

export class LevelScene extends Phaser.Scene {
  private def!: LevelDef;
  private solid: boolean[][] = [];
  private player!: Sprite;
  private controls!: Controls;
  private view!: WorldView;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private spikes!: Phaser.Physics.Arcade.StaticGroup;
  private boxes!: Phaser.Physics.Arcade.StaticGroup;
  private pickups!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemyShots!: Phaser.Physics.Arcade.Group;
  private boss: Sprite | null = null;
  private bossBar: Phaser.GameObjects.Graphics | null = null;
  private bossLabel: Phaser.GameObjects.Text | null = null;
  private hud!: Phaser.GameObjects.Graphics;
  private armorText!: Phaser.GameObjects.Text;
  private scrapText!: Phaser.GameObjects.Text;

  private armor = 0;
  private maxArmor = 0;
  private marmor!: MissionArmor;
  private facing = 1;
  private invulnUntil = 0;
  private lastGrounded = 0;
  private jumpQueuedAt = -1000;
  private usedDoubleJump = false;
  private nextShot = 0;
  private respawn = { x: 0, y: 0 };
  private checkpointCol = -1;
  private runScrap = 0;
  private over = false;
  private paused = false;
  private bossStarted = false;
  private car = false;
  private nextTransform = 0;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  /** Hidden help for this attempt (see assist.ts). */
  private tune!: Tuning;
  private merciesLeft = 0;
  private lastSafe = { x: 0, y: 0 };
  private lastClank = 0;

  constructor() {
    super('Level');
  }

  init(data: { levelId: string; checkpointCol?: number }) {
    this.def = LEVELS.find((l) => l.id === data.levelId) ?? LEVELS[0];
    this.checkpointCol = data.checkpointCol ?? -1;
    this.over = false;
    this.paused = false;
    this.boss = null;
    this.bossBar = null;
    this.bossLabel = null;
    this.bossStarted = false;
    this.runScrap = 0;
    this.usedDoubleJump = false;
    this.car = false;
    this.facing = 1;
  }

  create() {
    const s = save();
    makeRobotTextures(this, { color: s.color, ...s.gear });
    this.marmor = new MissionArmor(s.armor ?? {});
    this.maxArmor = totalMax(s.armor ?? {});
    this.armor = this.marmor.hp;
    this.tune = tuning(onLevelStart(this.def.id));
    this.merciesLeft = this.tune.mercies;

    const map = this.def.map;
    const cols = map[0].length;
    const worldW = cols * TILE;

    this.physics.world.gravity.y = GRAVITY;
    this.physics.world.setBounds(0, 0, worldW, H + 400, true, true, true, false);
    this.cameras.main.setBounds(0, 0, worldW, H);

    // Everything you see in the level is drawn by the 3D layer; the game
    // objects here are invisible and only handle movement and collisions.
    this.view = new WorldView(getStage(this.game.canvas), map, lookFromSave(s));
    this.view.blasterMark = s.gear.blaster;

    this.solids = this.physics.add.staticGroup();
    this.spikes = this.physics.add.staticGroup();
    this.boxes = this.physics.add.staticGroup();
    this.pickups = this.physics.add.group({ allowGravity: false, immovable: true });
    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group({ allowGravity: false });
    this.enemyShots = this.physics.add.group({ allowGravity: false });

    this.buildWorld(map);
    this.solids.setVisible(false);
    this.spikes.setVisible(false);
    this.boxes.setVisible(false);

    // Player.
    const start = this.respawn;
    this.player = this.physics.add.sprite(start.x, start.y, 'robot0') as Sprite;
    this.player.setOrigin(ROBOT_CX / ROBOT_W, 1);
    this.setPlayerBody(false);
    this.player.setCollideWorldBounds(true);
    this.player.setVisible(false);
    this.lastSafe = { x: start.x, y: start.y };

    this.physics.add.collider(this.player, this.solids);
    this.physics.add.collider(this.player, this.boxes, (_p, b) => {
      // The car smashes straight through wooden crates.
      const box = b as Phaser.Physics.Arcade.Sprite;
      if (this.car && box.getData('box').kind === 'wood') this.breakBox(box);
    });
    this.physics.add.collider(this.enemies, this.boxes, undefined, (e) => (e as Sprite).getData('e').kind !== 'drone');
    this.physics.add.collider(this.bullets, this.boxes, (b, box) => {
      const bullet = b as Phaser.Physics.Arcade.Sprite;
      this.hitBox(box as Phaser.Physics.Arcade.Sprite, bullet.x, bullet.y);
      bullet.destroy();
    });
    this.physics.add.collider(this.enemyShots, this.boxes, (b) => b.destroy());
    this.physics.add.collider(this.enemies, this.solids, undefined, (e) => (e as Sprite).getData('e').kind !== 'drone');
    this.physics.add.collider(this.bullets, this.solids, (b) => {
      this.view.burst((b as Sprite).x, (b as Sprite).y, 0xff5d8f, 5);
      b.destroy();
    });
    this.physics.add.collider(this.enemyShots, this.solids, (b) => b.destroy());
    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => {
      b.destroy();
      this.damageEnemy(e as Sprite, BLASTER_DAMAGE[save().gear.blaster]);
    });
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => this.touchEnemy(e as Sprite));
    this.physics.add.overlap(this.player, this.enemyShots, (_p, obj) => {
      const b = obj as Phaser.Physics.Arcade.Sprite;
      const dmg = (b.getData('dmg') as number) ?? 40;
      const src = (b.getData('src') as Hurt) ?? 'enemy';
      b.destroy();
      this.hurt(dmg, src);
    });
    this.physics.add.overlap(this.player, this.spikes, () => {
      if (this.hurt(60, 'enemy')) this.player.setVelocityY(-560);
    });
    this.physics.add.overlap(this.player, this.pickups, (_p, item) => this.pickup(item as Phaser.Physics.Arcade.Sprite));

    this.cameras.main.setZoom(ZOOM);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12, -90, 40);
    this.cameras.main.setDeadzone(80, 140);
    this.uiCam = this.cameras.add(0, 0, W, H);
    this.uiCam.setName('ui');

    this.controls = new Controls(this, carUnlocked());
    this.makeHud();

    this.input.keyboard?.on('keydown-ESC', () => this.pause());
    this.input.keyboard?.on('keydown-P', () => this.pause());

    const introKey = `intro-${this.def.id}`;
    if (!hasSeen(introKey) && this.checkpointCol < 0) {
      this.physics.pause();
      this.paused = true;
      dialog(this, this.def.intro, () => {
        markSeen(introKey);
        this.physics.resume();
        this.paused = false;
        this.controls.clearTaps();
        this.showControlsHint();
      });
    } else {
      this.showControlsHint();
    }
    this.syncView(0);
  }

  /** Robot is tall and narrow; the car is long and low. */
  private setPlayerBody(car: boolean) {
    const [w, h] = car ? [84, 34] : [34, 76];
    this.player.body.setSize(w, h).setOffset(ROBOT_CX - w / 2, ROBOT_H - h);
  }

  // ---- World ------------------------------------------------------------

  private buildWorld(map: string[]) {
    const cols = map[0].length;
    this.solid = Array.from({ length: ROWS }, () => Array(cols).fill(false));
    let checkpointSet = false;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = map[r][c];
        const x = c * TILE + TILE / 2;
        const y = r * TILE + TILE / 2;
        const floorY = (r + 1) * TILE;
        switch (ch) {
          case '=':
            this.solids.create(x, y, 'ground');
            this.solid[r][c] = true;
            for (let rr = r + 1; rr < ROWS; rr++) {
              this.solids.create(x, rr * TILE + TILE / 2, 'dirt');
              this.solid[rr][c] = true;
            }
            break;
          case '#':
            this.solids.create(x, y, 'crate');
            this.solid[r][c] = true;
            break;
          case 'w':
          case 's':
          case 'x':
          case 'e':
            this.addBox(ch, c, r, x, y);
            break;
          case '^': {
            const sp = this.spikes.create(x, y, 'spike') as Phaser.Physics.Arcade.Sprite;
            (sp.body as Phaser.Physics.Arcade.StaticBody).setSize(40, 22).setOffset(4, 26);
            break;
          }
          case 'o':
            this.addPickup(x, y, 'scrap');
            break;
          case 'h':
            this.addPickup(x, floorY - 18, 'oil');
            break;
          case 'k': {
            const beacon = this.addPickup(x, floorY - 36, c === this.checkpointCol ? 'beacon-on' : 'beacon-off');
            beacon.setData('col', c);
            if (c === this.checkpointCol) {
              this.respawn = { x, y: floorY };
              checkpointSet = true;
            }
            break;
          }
          case 'F': {
            const flag = this.addPickup(x, floorY - 60, 'flag');
            // A tall touch zone, so jumping high over the flag still counts.
            (flag.body as Phaser.Physics.Arcade.Body).setSize(70, 640).setOffset(-7, 120 - 640);
            break;
          }
          case 'P':
            if (!checkpointSet) this.respawn = { x, y: floorY };
            break;
          case 'r':
          case 't':
          case 'd':
          case 'B':
            this.spawnEnemy(ch, x, floorY);
            break;
        }
      }
    }
    this.solids.refresh();
  }

  private addBox(ch: string, col: number, row: number, x: number, y: number) {
    const spec = BOXES[ch];
    const b = this.boxes.create(x, y, 'crate') as Phaser.Physics.Arcade.Sprite;
    b.setData('box', spec).setData('hp', spec.hp).setData('maxHp', spec.hp).setData('cell', [col, row]);
    this.solid[row][col] = true;
    this.view.track(b as unknown as Phaser.GameObjects.Sprite, `box-${spec.kind}` as TrackKind);
  }

  /** A shot hit a box: crack it if the blaster is strong enough, otherwise clank. */
  private hitBox(box: Phaser.Physics.Arcade.Sprite, hx: number, hy: number) {
    if (!box.active) return;
    const spec = box.getData('box') as (typeof BOXES)[string];
    const mark = save().gear.blaster;
    box.setData('hitAt', performance.now());
    if (mark < spec.need) {
      this.view.burst(hx, hy, 0xdfe6ee, 6);
      if (this.time.now - this.lastClank > 2500) {
        this.lastClank = this.time.now;
        toast(this, box.x, box.y - 50, 'TOO TOUGH!', '#ffd166', 26);
        this.time.delayedCall(450, () => toast(this, box.x, box.y - 50, 'Needs a stronger blaster', '#9ad1ff', 20));
      }
      return;
    }
    const hp = (box.getData('hp') as number) - BLASTER_DAMAGE[mark];
    box.setData('hp', hp);
    this.view.burst(hx, hy, spec.kind === 'energy' ? 0xd68bff : 0xffd166, 8);
    if (hp <= 0) this.breakBox(box);
  }

  /** Smash! A heavy-feeling break: a tiny freeze, a shake, debris and scrap. */
  private breakBox(box: Phaser.Physics.Arcade.Sprite) {
    if (!box.active) return;
    const spec = box.getData('box') as (typeof BOXES)[string];
    const [col, row] = box.getData('cell') as [number, number];
    this.solid[row][col] = false;
    this.view.explode(box as unknown as Phaser.GameObjects.Sprite, spec.kind !== 'wood');
    this.cameras.main.shake(spec.kind === 'wood' ? 110 : 180, spec.kind === 'wood' ? 0.006 : 0.011);
    if (!this.over && !this.paused) {
      this.physics.pause();
      this.time.delayedCall(spec.kind === 'wood' ? 45 : 75, () => {
        if (!this.over && !this.paused) this.physics.resume();
      });
    }
    for (let i = 0; i < spec.scrap; i++) {
      const s = this.addPickup(box.x + (i - (spec.scrap - 1) / 2) * 22, box.y, 'scrap', false);
      this.tweens.add({ targets: s, y: box.y - 34 - (i % 2) * 10, duration: 380, ease: 'Back.easeOut' });
    }
    box.destroy();
    this.dropBoxAbove(col, row);
  }

  /** A box sitting on a smashed box falls into its place (and so on up the stack). */
  private dropBoxAbove(col: number, row: number) {
    const above = this.boxes.getChildren().find((o) => {
      const cell = (o as Phaser.Physics.Arcade.Sprite).getData('cell') as [number, number];
      return o.active && cell[0] === col && cell[1] === row - 1;
    }) as Phaser.Physics.Arcade.Sprite | undefined;
    if (!above) return;
    this.solid[row - 1][col] = false;
    this.solid[row][col] = true;
    above.setData('cell', [col, row]);
    this.tweens.add({
      targets: above,
      y: above.y + TILE,
      duration: 160,
      ease: 'Quad.easeIn',
      onComplete: () => {
        if (!above.active) return;
        (above.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
        this.view.burst(above.x, above.y + TILE / 2, 0xcfd8e3, 6);
        this.cameras.main.shake(60, 0.004);
        this.dropBoxAbove(col, row - 1);
      },
    });
  }

  private addPickup(x: number, y: number, key: string, bob = true): Phaser.Physics.Arcade.Sprite {
    const p = this.pickups.create(x, y, key) as Phaser.Physics.Arcade.Sprite;
    const kind = key.startsWith('beacon') ? 'beacon' : key;
    p.setData('kind', kind);
    p.setVisible(false);
    if (key === 'scrap' && bob) {
      this.tweens.add({ targets: p, y: y - 6, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    this.view.track(p, kind as TrackKind);
    return p;
  }

  private spawnEnemy(ch: string, x: number, floorY: number) {
    const kind: EnemyKind = ch === 'r' ? 'rustbot' : ch === 't' ? 'turret' : ch === 'd' ? 'drone' : 'boss';
    const key = kind === 'rustbot' ? 'rustbot0' : kind === 'boss' ? 'crusher' : kind;
    const e = this.enemies.create(x, floorY, key) as Sprite;
    e.setOrigin(0.5, 1);
    e.setVisible(false);
    const hp = Math.max(1, Math.round(HP[kind] * this.tune.enemyHp));
    const data: EnemyData = {
      kind, hp, maxHp: hp, dir: -1, nextFire: 0, baseY: floorY - 20,
      state: 'rest', stateUntil: 0, wasAirborne: false, hitsSinceDrop: 0,
    };
    e.setData('e', data);
    if (kind === 'rustbot') {
      // Frame is 60×52; the 3D model is bigger, so the body reaches above the frame.
      e.body.setSize(64, 62).setOffset(-2, -10);
    } else if (kind === 'turret') {
      e.body.setAllowGravity(false).setImmovable(true);
      e.body.setSize(56, 62).setOffset(-2, -10);
      e.setFlipX(false);
    } else if (kind === 'drone') {
      e.body.setAllowGravity(false);
      e.body.setSize(62, 44).setOffset(-3, -4);
      e.y = floorY - 10;
      data.baseY = e.y;
    } else {
      e.body.setSize(100, 140).setOffset(20, 10);
      this.boss = e;
    }
    this.view.track(e, kind);
  }

  private isSolid(col: number, row: number): boolean {
    if (row < 0 || row >= ROWS) return false;
    if (col < 0 || col >= this.solid[0].length) return true;
    return this.solid[row][col];
  }

  // ---- HUD --------------------------------------------------------------

  private makeHud() {
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(600);
    this.add.text(28, 10, 'ARMOR', { fontFamily: FONT, fontSize: '20px', color: '#9ad1ff' })
      .setStroke('#000000', 4).setScrollFactor(0).setDepth(600);
    this.armorText = this.add
      .text(206, 52, '', { fontFamily: FONT, fontSize: '20px', color: '#ffffff' })
      .setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(601);
    this.add.image(430, 52, 'scrap').setScale(1.3).setScrollFactor(0).setDepth(600);
    this.scrapText = this.add
      .text(456, 52, '', { fontFamily: FONT, fontSize: '30px', color: '#ffd166' })
      .setStroke('#000000', 5).setOrigin(0, 0.5).setScrollFactor(0).setDepth(600);
    const pauseBtn = button(this, W - 60, 50, 80, 64, 'II', () => this.pause(), { size: 30, fill: 0x3d4458 });
    pauseBtn.setScrollFactor(0, 0, true).setDepth(600);
    const title = text(this, W / 2, 110, this.def.title, 44, '#ffd166').setScrollFactor(0).setDepth(600);
    title.setStroke('#000000', 6);
    this.tweens.add({ targets: title, alpha: 0, delay: 2200, duration: 800 });
    this.drawHud();
  }

  private drawHud() {
    const g = this.hud;
    g.clear();
    const frac = Phaser.Math.Clamp(this.armor / this.maxArmor, 0, 1);
    g.fillStyle(0x000000, 0.6).fillRoundedRect(24, 36, 364, 32, 10);
    g.fillStyle(frac > 0.35 ? COLORS.good : COLORS.bad, 1).fillRoundedRect(28, 40, Math.max(8, 356 * frac), 24, 8);
    this.armorText.setText(`${Math.max(0, this.armor)} / ${this.maxArmor}`);
    this.scrapText.setText(`${save().scrap}`);

    if (this.boss && this.bossStarted && this.bossBar) {
      const e = this.boss.getData('e') as EnemyData;
      const bf = Math.max(0, e.hp / e.maxHp);
      this.bossBar.clear();
      this.bossBar.fillStyle(0x000000, 0.6).fillRoundedRect(W / 2 - 250, 86, 500, 26, 10);
      this.bossBar.fillStyle(0xef476f, 1).fillRoundedRect(W / 2 - 246, 90, 492 * bf, 18, 8);
    }
  }

  private showControlsHint() {
    if (this.checkpointCol >= 0) return;
    let msg = '';
    if (this.def.id === 'junkyard') {
      msg = this.controls.touch
        ? 'Use the buttons:  ◀ ▶ to move,  JUMP,  FIRE'
        : '← → to move    SPACE to jump    F to fire';
    } else if (carUnlocked() && !hasSeen('car-hint')) {
      markSeen('car-hint');
      msg = this.controls.touch ? 'Tap CAR to transform!' : 'Press C to transform into a car!';
    }
    if (!msg) return;
    const t = text(this, W / 2, 180, msg, 30, '#ffffff').setScrollFactor(0).setDepth(600);
    t.setStroke('#000000', 6);
    this.tweens.add({ targets: t, alpha: 0, delay: 5000, duration: 1000, onComplete: () => t.destroy() });
  }

  // ---- Main loop --------------------------------------------------------

  update(time: number) {
    this.sortCameras();
    if (!this.over && !this.paused) {
      this.controls.update();
      this.updatePlayer(time);
      this.updateEnemies(time);
      if (this.player.y > H + 120) this.fell();
    }
    this.syncView(time);
  }

  /**
   * Things pinned to the screen (HUD, menus, touch buttons) go to the
   * unzoomed UI camera; everything in the world goes to the zoomed one.
   */
  private sortCameras() {
    const main = this.cameras.main;
    for (const obj of this.children.list) {
      const o = obj as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.ScrollFactor;
      const ui = o.scrollFactorX === 0;
      o.cameraFilter = ui ? main.id : this.uiCam.id;
    }
  }

  /** Copy the game state over to the 3D layer. */
  private syncView(time: number) {
    const cam = this.cameras.main;
    const shake = cam.shakeEffect as unknown as { _offsetX: number; _offsetY: number; isRunning: boolean };
    const sx = shake.isRunning ? shake._offsetX : 0;
    const sy = shake.isRunning ? shake._offsetY : 0;
    this.view.setCamera(cam.scrollX - sx, cam.scrollY - sy, cam.zoom);

    const r = this.view.player;
    const body = this.player.body;
    this.view.placePlayer(this.player.x, this.player.y);
    this.view.playerPx = { x: this.player.x, y: this.player.y };
    r.facing = this.facing;
    r.speed = this.paused || this.over ? 0 : Math.abs(body.velocity.x);
    r.grounded = body.blocked.down || this.over;
    r.vy = body.velocity.y;
    const blink = time < this.invulnUntil && !this.over && Math.floor(time / 80) % 2 === 1;
    r.holder.visible = !blink;
  }

  private updatePlayer(time: number) {
    const c = this.controls.state;
    const body = this.player.body;
    const onGround = body.blocked.down;
    if (onGround) {
      this.lastGrounded = time;
      this.usedDoubleJump = false;
      // Safe = solid ground under both edges of the robot.
      const row = Math.floor((body.bottom + 4) / TILE);
      if (this.isSolid(Math.floor((body.left + 2) / TILE), row) && this.isSolid(Math.floor((body.right - 2) / TILE), row)) {
        this.lastSafe = { x: this.player.x, y: this.player.y };
      }
    }

    if (this.controls.carPressed && carUnlocked() && time >= this.nextTransform) this.toggleCar(time);

    const speed = this.car ? CAR_SPEED : RUN_SPEED;
    let vx = 0;
    if (c.left) vx -= speed;
    if (c.right) vx += speed;
    this.player.setVelocityX(vx);
    if (vx !== 0) this.facing = vx > 0 ? 1 : -1;
    this.player.setFlipX(this.facing < 0);

    if (this.controls.jumpPressed) this.jumpQueuedAt = time;
    const jv = JUMP_VELOCITY[save().gear.boots];
    const canGroundJump = time - this.lastGrounded < this.tune.coyoteMs;
    if (time - this.jumpQueuedAt < JUMP_BUFFER_MS) {
      if (canGroundJump) {
        this.player.setVelocityY(-jv);
        this.lastGrounded = -1000;
        this.jumpQueuedAt = -1000;
      } else if (this.controls.jumpPressed && canDoubleJump() && !this.usedDoubleJump) {
        this.usedDoubleJump = true;
        this.player.setVelocityY(-jv * 0.85);
        this.jumpQueuedAt = -1000;
        this.view.burst(this.player.x, this.player.y, 0x4cc9f0, 16);
      }
    }
    // Let go of jump early for a short hop.
    if (!c.jump && body.velocity.y < -200) {
      this.player.setVelocityY(body.velocity.y * 0.85);
    }

    if (c.fire && time >= this.nextShot) {
      this.shoot();
      this.nextShot = time + BLASTER_COOLDOWN[save().gear.blaster];
    }
  }

  private toggleCar(time: number) {
    this.car = !this.car;
    this.nextTransform = time + 650;
    this.view.player.setVehicle(this.car);
    this.setPlayerBody(this.car);
    // Changing to the taller robot shape: lift a little so feet don't sink into the floor.
    if (!this.car) this.player.y -= 2;
    this.view.burst(this.player.x, this.player.y - 30, 0x4cf0ff, 12);
  }

  private shoot() {
    const mark = save().gear.blaster;
    const x = this.player.x + this.facing * MUZZLE_X[mark];
    const y = this.player.y - (this.car ? 22 : MUZZLE_Y);
    const b = this.bullets.create(x, y, 'bullet') as Phaser.Physics.Arcade.Sprite;
    b.setVisible(false);
    (b.body as Phaser.Physics.Arcade.Body).setSize(22 + mark * 6, 24 + mark * 4);
    b.setVelocityX(this.facing * 760);
    this.view.track(b, 'shot');
    this.view.player.fire();
    this.time.delayedCall(800, () => b.destroy());
  }

  private updateEnemies(time: number) {
    for (const obj of this.enemies.getChildren()) {
      const e = obj as Sprite;
      const d = e.getData('e') as EnemyData;
      const dx = this.player.x - e.x;
      switch (d.kind) {
        case 'rustbot': {
          // Turn around at walls and ledges.
          const aheadCol = Math.floor((e.x + d.dir * 34) / TILE);
          const feetRow = Math.floor((e.y + 4) / TILE);
          const bodyRow = Math.floor((e.y - 20) / TILE);
          if (e.body.blocked.down && (!this.isSolid(aheadCol, feetRow) || this.isSolid(aheadCol, bodyRow))) {
            d.dir *= -1;
          }
          e.setVelocityX(d.dir * 75);
          e.setFlipX(d.dir > 0);
          break;
        }
        case 'turret': {
          e.setFlipX(dx > 0);
          if (Math.abs(dx) < 640 && Math.abs(this.player.y - e.y) < 320 && time > d.nextFire) {
            d.nextFire = time + 2100 * this.tune.fireDelay;
            this.enemyShot(e.x + (dx > 0 ? 40 : -40), e.y - 34, this.player.x, this.player.y - 40, 330, DAMAGE.turret, 'enemy');
          }
          break;
        }
        case 'drone': {
          const near = Math.abs(dx) < 520;
          e.setVelocityX(near ? Math.sign(dx) * 95 : 0);
          e.y = d.baseY + Math.sin(time / 380 + e.x * 0.01) * 34;
          break;
        }
        case 'boss':
          this.updateBoss(e, d, time, dx);
          break;
      }
    }
  }

  private updateBoss(e: Sprite, d: EnemyData, time: number, dx: number) {
    if (!this.bossStarted) {
      if (Math.abs(dx) > 620) return;
      this.startBossFight();
      d.state = 'rest';
      d.stateUntil = time + 900;
    }
    const pace = this.tune.bossPace;
    const grounded = e.body.blocked.down;
    switch (d.state) {
      case 'rest':
        e.setVelocityX(0);
        if (time > d.stateUntil) {
          d.state = 'walk';
          d.stateUntil = time + Phaser.Math.Between(1400, 2200) / pace;
        }
        break;
      case 'walk':
        e.setVelocityX(Math.sign(dx) * 120 * pace);
        e.setFlipX(dx > 0);
        if (time > d.stateUntil && grounded) {
          d.state = 'windup';
          d.stateUntil = time + 650 / pace;
          e.setVelocityX(0);
        }
        break;
      case 'windup':
        if (time > d.stateUntil) {
          d.state = 'air';
          d.wasAirborne = false;
          e.setVelocity(Phaser.Math.Clamp(dx * 0.9, -330, 330), -780);
        }
        break;
      case 'air':
        if (!grounded) d.wasAirborne = true;
        if (d.wasAirborne && grounded) {
          e.setVelocityX(0);
          this.cameras.main.shake(260, 0.012);
          this.view.burst(e.x - 60, e.y - 10, 0xf77f00, 18, true);
          this.view.burst(e.x + 60, e.y - 10, 0xf77f00, 18, true);
          for (const dir of [-1, 1]) {
            const s = this.enemyShot(e.x + dir * 60, e.y - 15, 0, 0, 0, 100, 'boss', 'shock');
            s.setVelocityX(dir * 340 * pace);
            this.time.delayedCall(2600, () => s.destroy());
          }
          d.state = 'rest';
          d.stateUntil = time + 1100 / pace;
        }
        break;
    }
  }

  private startBossFight() {
    this.bossStarted = true;
    this.bossBar = this.add.graphics().setScrollFactor(0).setDepth(600);
    this.bossLabel = text(this, W / 2, 140, 'THE CRUSHER', 30, '#ef476f').setScrollFactor(0).setDepth(600);
    this.bossLabel.setStroke('#000000', 6);
    toast(this, W / 2 + this.cameras.main.scrollX, 240, 'BOSS!', '#ef476f', 64);
    this.drawHud();
  }

  private enemyShot(x: number, y: number, tx: number, ty: number, speed: number, dmg: number, src: Hurt, key = 'ebullet') {
    const b = this.enemyShots.create(x, y, key) as Phaser.Physics.Arcade.Sprite;
    b.setData('dmg', dmg).setData('src', src);
    b.setVisible(false);
    if (speed > 0) {
      const a = Phaser.Math.Angle.Between(x, y, tx, ty);
      b.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
      this.time.delayedCall(4000, () => b.destroy());
    }
    this.view.track(b as unknown as Phaser.GameObjects.Sprite, key === 'shock' ? 'shock' : 'eshot');
    return b;
  }

  // ---- Interactions -----------------------------------------------------

  private touchEnemy(e: Sprite) {
    const d = e.getData('e') as EnemyData;
    const pb = this.player.body;
    // In car mode, ramming smashes smaller enemies.
    if (this.car && d.kind !== 'boss' && Math.abs(pb.velocity.x) > 200) {
      this.damageEnemy(e, RAM_DAMAGE);
      this.player.setVelocity(-Math.sign(pb.velocity.x) * 250, -300);
      this.invulnUntil = this.time.now + 400;
      return;
    }
    const stomping = pb.velocity.y > 50 && pb.bottom <= e.body.top + 22;
    if (stomping && d.kind !== 'turret') {
      this.player.setVelocityY(-520);
      this.usedDoubleJump = false;
      this.damageEnemy(e, d.kind === 'boss' ? 1 : 2);
      return;
    }
    if (this.hurt(DAMAGE[d.kind], d.kind === 'boss' ? 'boss' : 'enemy')) {
      this.player.setVelocity(Math.sign(this.player.x - e.x || 1) * 380, -380);
    }
  }

  private damageEnemy(e: Sprite, dmg: number) {
    const d = e.getData('e') as EnemyData;
    if (d.hp <= 0) return;
    d.hp -= dmg;
    e.setData('hitAt', performance.now());
    this.view.burst(e.x, e.y - e.body.height / 2, 0xffd166, 8);
    if (d.kind === 'boss') {
      d.hitsSinceDrop += dmg;
      if (d.hitsSinceDrop >= this.tune.bossDropEvery && d.hp > 0) {
        d.hitsSinceDrop = 0;
        const can = this.addPickup(e.x - Math.sign(this.player.x - e.x) * 120, e.y - 300, 'oil');
        this.tweens.add({ targets: can, y: (GROUND_ROW * TILE) - 18, duration: 700, ease: 'Bounce.easeOut' });
      }
      this.drawHud();
    }
    if (d.hp <= 0) this.killEnemy(e, d);
  }

  private killEnemy(e: Sprite, d: EnemyData) {
    this.view.explode(e, d.kind === 'boss');
    if (d.kind === 'boss') {
      this.cameras.main.shake(600, 0.02);
      const x = e.x;
      e.destroy();
      this.boss = null;
      this.bossBar?.destroy();
      this.bossLabel?.destroy();
      for (let i = 0; i < 8; i++) this.addPickup(x - 160 + i * 45, GROUND_ROW * TILE - 70, 'scrap');
      const flag = this.addPickup(x + 220, GROUND_ROW * TILE - 60, 'flag');
      (flag.body as Phaser.Physics.Arcade.Body).setSize(70, 640).setOffset(-7, 120 - 640);
      toast(this, x, GROUND_ROW * TILE - 250, 'CRUSHER DOWN!', '#06d6a0', 56);
      return;
    }
    // Most enemies drop a bit of scrap.
    if (d.kind !== 'drone') this.addPickup(e.x, e.y - 30, 'scrap');
    e.destroy();
  }

  /** Returns true if damage was applied. */
  private hurt(raw: number, src: Hurt): boolean {
    if (this.over || this.time.now < this.invulnUntil) return false;
    // Armor points run about three times the old scale, so hits do too.
    const amount = Math.max(10, Math.round((raw * 3 * this.tune.damageTaken) / 10) * 10);
    this.marmor.damage(amount);
    this.armor = this.marmor.hp;
    this.invulnUntil = this.time.now + this.tune.invulnMs;
    if (this.armor <= 0 && this.merciesLeft > 0) {
      // Hang on by a thread, and a repair can happens to drop nearby.
      this.merciesLeft--;
      this.marmor.frame = 1;
      this.armor = this.marmor.hp;
      this.invulnUntil = this.time.now + 2000;
      this.time.delayedCall(700, () => this.luckyDrop());
    }
    this.cameras.main.shake(140, 0.006);
    this.view.player.hit();
    this.view.burst(this.player.x, this.player.y - 50, 0xff5d5d, 10);
    toast(this, this.player.x, this.player.y - 110, `−${amount}`, '#ef476f', 30);
    this.drawHud();
    if (this.armor <= 0) this.retreat(src);
    return true;
  }

  /** A repair can drops from the sky just ahead of the robot. */
  private luckyDrop() {
    if (this.over) return;
    const x = Phaser.Math.Clamp(this.player.x + this.facing * 90, 30, this.physics.world.bounds.width - 30);
    const can = this.addPickup(x, this.player.y - 260, 'oil');
    this.tweens.add({ targets: can, y: this.player.y - 18, duration: 650, ease: 'Bounce.easeOut' });
  }

  private fell() {
    this.invulnUntil = 0;
    this.hurt(80, 'fall');
    if (!this.over) {
      const back = this.tune.safeRespawn ? this.lastSafe : this.respawn;
      this.player.setPosition(back.x, back.y - 10);
      this.player.setVelocity(0, 0);
      this.invulnUntil = this.time.now + 1500;
    }
  }

  private pickup(item: Phaser.Physics.Arcade.Sprite) {
    const kind = item.getData('kind');
    if (kind === 'scrap') {
      save().scrap += 1;
      this.runScrap += 1;
      persist();
      this.view.burst(item.x, item.y, 0xffd166, 8);
      item.destroy();
      this.drawHud();
    } else if (kind === 'oil') {
      this.marmor.heal(400);
      this.armor = this.marmor.hp;
      this.view.burst(item.x, item.y, 0x06d6a0, 14);
      toast(this, item.x, item.y - 40, '+400 armor', '#06d6a0', 30);
      item.destroy();
      this.drawHud();
    } else if (kind === 'beacon') {
      const col = item.getData('col') as number;
      if (col !== this.checkpointCol) {
        this.checkpointCol = col;
        item.setTexture('beacon-on');
        this.respawn = { x: item.x, y: (GROUND_ROW) * TILE };
        this.view.burst(item.x, item.y - 30, 0x06d6a0, 16);
        toast(this, item.x, item.y - 60, 'Checkpoint!', '#06d6a0', 32);
      }
    } else if (kind === 'flag') {
      this.finish();
    }
  }

  // ---- End states -------------------------------------------------------

  private freeze() {
    this.over = true;
    this.physics.pause();
    // Plate damage carries back to the garage for repairs.
    this.marmor.commit(save());
    persist();
  }

  private retreat(src: Hurt) {
    this.freeze();
    this.view.burst(this.player.x, this.player.y - 40, 0xef476f, 30, true);
    const tip = this.def.tips[src] ?? this.def.tips.enemy ?? 'Let\'s patch up and try again!';

    const box = panel(this, W / 2, H / 2 - 40, 760, 420).setScrollFactor(0).setDepth(700);
    const items: Phaser.GameObjects.GameObject[] = [box];
    items.push(text(this, W / 2, H / 2 - 210, 'EMERGENCY RETREAT!', 48, '#ef476f').setScrollFactor(0).setDepth(701));
    items.push(this.add.image(W / 2 - 300, H / 2 - 90, 'sprocket').setScrollFactor(0).setDepth(701));
    items.push(
      this.add
        .text(W / 2 - 220, H / 2 - 140, tip, { fontFamily: FONT, fontSize: '28px', color: COLORS.text, wordWrap: { width: 540 } })
        .setScrollFactor(0).setDepth(701),
    );
    speak(tip);
    const by = H / 2 + 110;
    const again = button(this, W / 2 - 240, by, 210, 76, 'Try again', () =>
      this.scene.restart({ levelId: this.def.id, checkpointCol: this.checkpointCol }), { fill: 0x2a9d8f, edge: 0x9ff0e3 });
    const forge = button(this, W / 2, by, 230, 76, 'Engineering\nZone', () => this.scene.start('Engineering'), {
      fill: 0xf77f00, edge: 0xffd166, size: 26,
    });
    const home = button(this, W / 2 + 240, by, 210, 76, 'Garage', () => this.scene.start('Garage'), { fill: 0x3d4458 });
    for (const b of [again, forge, home]) b.setScrollFactor(0, 0, true).setDepth(702);
  }

  private finish() {
    if (this.over) return;
    this.freeze();
    const s = save();
    const firstClear = !s.levelsDone.includes(this.def.id);
    if (firstClear) s.levelsDone.push(this.def.id);
    persist();
    onLevelCleared(this.def.id);
    this.view.burst(this.player.x, this.player.y - 60, 0x06d6a0, 40, true);

    const show = () => {
      panel(this, W / 2, H / 2 - 20, 680, 360).setScrollFactor(0).setDepth(700);
      text(this, W / 2, H / 2 - 150, 'MISSION COMPLETE!', 52, '#06d6a0').setScrollFactor(0).setDepth(701);
      this.add.image(W / 2 - 50, H / 2 - 50, 'scrap').setScale(2).setScrollFactor(0).setDepth(701);
      text(this, W / 2 + 40, H / 2 - 50, `+${this.runScrap}`, 48, '#ffd166').setScrollFactor(0).setDepth(701);
      text(this, W / 2, H / 2 + 10, 'scrap collected', 26, '#9ad1ff').setScrollFactor(0).setDepth(701);
      button(this, W / 2, H / 2 + 100, 280, 80, 'Back to Garage', () => this.scene.start('Garage'), {
        fill: 0x2a9d8f, edge: 0x9ff0e3,
      }).setScrollFactor(0, 0, true).setDepth(702);
    };

    if (this.def.id === 'gate' && firstClear) {
      dialog(this, [
        { who: 'sprocket', text: 'WE DID IT! The Crusher is scrap metal now!' },
        { who: 'volt', text: 'Great work. But my scanners just picked up something huge moving behind the gate...' },
        { who: 'volt', text: 'Something with wings. Rest up, rookie. We will need you again soon.' },
      ], show);
    } else {
      show();
    }
  }

  private pause() {
    if (this.over || this.paused) return;
    this.paused = true;
    this.physics.pause();
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setScrollFactor(0).setDepth(700).setInteractive());
    items.push(panel(this, W / 2, H / 2, 520, 360).setScrollFactor(0).setDepth(701));
    items.push(text(this, W / 2, H / 2 - 120, 'PAUSED', 50, '#ffd166').setScrollFactor(0).setDepth(702));
    const resume = () => {
      items.forEach((o) => o.destroy());
      this.paused = false;
      this.physics.resume();
      this.controls.clearTaps();
    };
    items.push(button(this, W / 2, H / 2 - 10, 300, 80, 'Keep playing', resume, { fill: 0x2a9d8f, edge: 0x9ff0e3 })
      .setScrollFactor(0, 0, true).setDepth(703));
    items.push(button(this, W / 2, H / 2 + 100, 300, 80, 'Back to Garage', () => this.scene.start('Garage'), { fill: 0x3d4458 })
      .setScrollFactor(0, 0, true).setDepth(703));
  }
}
