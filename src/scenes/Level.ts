import Phaser from 'phaser';
import { COLORS, FONT, ROBOT_CX, ROBOT_H, ROBOT_W, TILE, makeRobotTextures } from '../art';
import { GROUND_ROW, LEVELS, ROWS, type LevelDef } from '../levels';
import {
  ARMOR, BLASTER_COOLDOWN, BLASTER_DAMAGE, BLASTER_SCALE, JUMP_VELOCITY,
  canDoubleJump, hasSeen, markSeen, persist, save,
} from '../state';
import { Controls } from '../ui/controls';
import { H, W, button, dialog, panel, sparks, speak, text, toast } from '../ui/widgets';

const GRAVITY = 1500;
const RUN_SPEED = 290;
const COYOTE_MS = 110;
const JUMP_BUFFER_MS = 130;

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

export class LevelScene extends Phaser.Scene {
  private def!: LevelDef;
  private solid: boolean[][] = [];
  private player!: Sprite;
  private controls!: Controls;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private spikes!: Phaser.Physics.Arcade.StaticGroup;
  private pickups!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemyShots!: Phaser.Physics.Arcade.Group;
  private boss: Sprite | null = null;
  private bossBar: Phaser.GameObjects.Graphics | null = null;
  private bossLabel: Phaser.GameObjects.Text | null = null;
  private bgFar!: Phaser.GameObjects.TileSprite;
  private bgNear!: Phaser.GameObjects.TileSprite;
  private hud!: Phaser.GameObjects.Graphics;
  private armorText!: Phaser.GameObjects.Text;
  private scrapText!: Phaser.GameObjects.Text;

  private armor = 0;
  private maxArmor = 0;
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
  }

  create() {
    const s = save();
    makeRobotTextures(this, { color: s.color, ...s.gear });
    this.maxArmor = ARMOR[s.gear.armor];
    this.armor = this.maxArmor;

    const map = this.def.map;
    const cols = map[0].length;
    const worldW = cols * TILE;

    this.physics.world.gravity.y = GRAVITY;
    this.physics.world.setBounds(0, 0, worldW, H + 400, true, true, true, false);
    this.cameras.main.setBounds(0, 0, worldW, H);
    this.cameras.main.setBackgroundColor(COLORS.bg);

    this.bgFar = this.add.tileSprite(0, 0, W, H, 'bg-far').setOrigin(0).setScrollFactor(0);
    this.bgNear = this.add.tileSprite(0, 0, W, H, 'bg-near').setOrigin(0).setScrollFactor(0);

    this.solids = this.physics.add.staticGroup();
    this.spikes = this.physics.add.staticGroup();
    this.pickups = this.physics.add.group({ allowGravity: false, immovable: true });
    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group({ allowGravity: false });
    this.enemyShots = this.physics.add.group({ allowGravity: false });

    this.buildWorld(map);

    // Player.
    const start = this.respawn;
    this.player = this.physics.add.sprite(start.x, start.y, 'robot0') as Sprite;
    this.player.setOrigin(ROBOT_CX / ROBOT_W, 1);
    this.player.body.setSize(34, 76).setOffset(ROBOT_CX - 17, ROBOT_H - 76);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);

    this.physics.add.collider(this.player, this.solids);
    this.physics.add.collider(this.enemies, this.solids, undefined, (e) => (e as Sprite).getData('e').kind !== 'drone');
    this.physics.add.collider(this.bullets, this.solids, (b) => b.destroy());
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

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12, -120, 0);
    this.cameras.main.setDeadzone(120, 200);

    this.controls = new Controls(this);
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
        this.showControlsHint();
      });
    } else {
      this.showControlsHint();
    }
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
          case 'F':
            this.addPickup(x, floorY - 60, 'flag');
            break;
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

  private addPickup(x: number, y: number, key: string): Phaser.Physics.Arcade.Sprite {
    const p = this.pickups.create(x, y, key) as Phaser.Physics.Arcade.Sprite;
    p.setData('kind', key.startsWith('beacon') ? 'beacon' : key);
    if (key === 'scrap') {
      this.tweens.add({ targets: p, y: y - 6, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    return p;
  }

  private spawnEnemy(ch: string, x: number, floorY: number) {
    const kind: EnemyKind = ch === 'r' ? 'rustbot' : ch === 't' ? 'turret' : ch === 'd' ? 'drone' : 'boss';
    const key = kind === 'rustbot' ? 'rustbot0' : kind === 'boss' ? 'crusher' : kind;
    const e = this.enemies.create(x, floorY, key) as Sprite;
    e.setOrigin(0.5, 1);
    const data: EnemyData = {
      kind, hp: HP[kind], maxHp: HP[kind], dir: -1, nextFire: 0, baseY: floorY - 20,
      state: 'rest', stateUntil: 0, wasAirborne: false, hitsSinceDrop: 0,
    };
    e.setData('e', data);
    if (kind === 'rustbot') {
      e.body.setSize(48, 44).setOffset(6, 8);
      e.play('rustbot-walk');
    } else if (kind === 'turret') {
      e.body.setAllowGravity(false).setImmovable(true);
      e.setFlipX(false);
    } else if (kind === 'drone') {
      e.body.setAllowGravity(false);
      e.y = floorY - 10;
      data.baseY = e.y;
    } else {
      e.body.setSize(100, 140).setOffset(20, 10);
      e.setDepth(5);
      this.boss = e;
    }
  }

  private isSolid(col: number, row: number): boolean {
    if (row < 0 || row >= ROWS) return false;
    if (col < 0 || col >= this.solid[0].length) return true;
    return this.solid[row][col];
  }

  // ---- HUD --------------------------------------------------------------

  private makeHud() {
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(600);
    this.add.text(28, 10, 'ARMOR', { fontFamily: FONT, fontSize: '20px', color: '#9ad1ff' }).setScrollFactor(0).setDepth(600);
    this.armorText = this.add
      .text(206, 52, '', { fontFamily: FONT, fontSize: '20px', color: '#ffffff' })
      .setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(601);
    this.add.image(430, 52, 'scrap').setScale(1.3).setScrollFactor(0).setDepth(600);
    this.scrapText = this.add
      .text(456, 52, '', { fontFamily: FONT, fontSize: '30px', color: '#ffd166' })
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(600);
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
    if (this.def.id !== 'junkyard' || this.checkpointCol >= 0) return;
    const msg = this.controls.touch
      ? 'Use the buttons:  ◀ ▶ to move,  JUMP,  FIRE'
      : '← → to move    SPACE to jump    F to fire';
    const t = text(this, W / 2, 180, msg, 30, '#ffffff').setScrollFactor(0).setDepth(600);
    t.setStroke('#000000', 6);
    this.tweens.add({ targets: t, alpha: 0, delay: 5000, duration: 1000, onComplete: () => t.destroy() });
  }

  // ---- Main loop --------------------------------------------------------

  update(time: number) {
    this.bgFar.tilePositionX = this.cameras.main.scrollX * 0.1;
    this.bgNear.tilePositionX = this.cameras.main.scrollX * 0.35;
    if (this.over || this.paused) return;

    this.controls.update();
    this.updatePlayer(time);
    this.updateEnemies(time);

    if (this.player.y > H + 120) {
      this.fell();
    }
  }

  private updatePlayer(time: number) {
    const c = this.controls.state;
    const body = this.player.body;
    const onGround = body.blocked.down;
    if (onGround) {
      this.lastGrounded = time;
      this.usedDoubleJump = false;
    }

    let vx = 0;
    if (c.left) vx -= RUN_SPEED;
    if (c.right) vx += RUN_SPEED;
    this.player.setVelocityX(vx);
    if (vx !== 0) this.facing = vx > 0 ? 1 : -1;
    this.player.setFlipX(this.facing < 0);

    if (vx !== 0 && onGround) {
      if (!this.player.anims.isPlaying) this.player.play('robot-walk');
    } else {
      this.player.anims.stop();
      this.player.setTexture('robot0');
    }

    if (this.controls.jumpPressed) this.jumpQueuedAt = time;
    const jv = JUMP_VELOCITY[save().gear.boots];
    const canGroundJump = time - this.lastGrounded < COYOTE_MS;
    if (time - this.jumpQueuedAt < JUMP_BUFFER_MS) {
      if (canGroundJump) {
        this.player.setVelocityY(-jv);
        this.lastGrounded = -1000;
        this.jumpQueuedAt = -1000;
      } else if (this.controls.jumpPressed && canDoubleJump() && !this.usedDoubleJump) {
        this.usedDoubleJump = true;
        this.player.setVelocityY(-jv * 0.85);
        this.jumpQueuedAt = -1000;
        sparks(this, this.player.x, this.player.y, 0x4cc9f0, 10);
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

    if (time < this.invulnUntil) {
      this.player.setAlpha(Math.floor(time / 80) % 2 ? 0.35 : 1);
    } else {
      this.player.setAlpha(1);
    }
  }

  private shoot() {
    const mark = save().gear.blaster;
    const scale = BLASTER_SCALE[mark];
    const tip = ROBOT_W - ROBOT_CX - 30 + mark * 7;
    const b = this.bullets.create(this.player.x + this.facing * tip, this.player.y - 48, 'bullet') as Phaser.Physics.Arcade.Sprite;
    b.setScale(scale).setFlipX(this.facing < 0);
    b.setVelocityX(this.facing * 760);
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
          const aheadCol = Math.floor((e.x + d.dir * 30) / TILE);
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
            d.nextFire = time + 2100;
            this.enemyShot(e.x + (dx > 0 ? 20 : -20), e.y - 26, this.player.x, this.player.y - 40, 330, DAMAGE.turret, 'enemy');
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
    const grounded = e.body.blocked.down;
    switch (d.state) {
      case 'rest':
        e.setVelocityX(0);
        if (time > d.stateUntil) {
          d.state = 'walk';
          d.stateUntil = time + Phaser.Math.Between(1400, 2200);
        }
        break;
      case 'walk':
        e.setVelocityX(Math.sign(dx) * 120);
        e.setFlipX(dx > 0);
        if (time > d.stateUntil && grounded) {
          d.state = 'windup';
          d.stateUntil = time + 650;
          e.setTexture('crusher-angry');
          e.setVelocityX(0);
        }
        break;
      case 'windup':
        e.x += Math.sin(time / 20) * 1.5;
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
          e.setTexture('crusher');
          this.cameras.main.shake(260, 0.012);
          sparks(this, e.x, e.y, 0xf77f00, 20);
          for (const dir of [-1, 1]) {
            const s = this.enemyShot(e.x + dir * 60, e.y - 15, 0, 0, 0, 100, 'boss', 'shock');
            s.setVelocityX(dir * 340);
            this.time.delayedCall(2600, () => s.destroy());
          }
          d.state = 'rest';
          d.stateUntil = time + 1100;
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
    if (speed > 0) {
      const a = Phaser.Math.Angle.Between(x, y, tx, ty);
      b.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
      this.time.delayedCall(4000, () => b.destroy());
    }
    return b;
  }

  // ---- Interactions -----------------------------------------------------

  private touchEnemy(e: Sprite) {
    const d = e.getData('e') as EnemyData;
    const pb = this.player.body;
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
    e.setTintFill(0xffffff);
    this.time.delayedCall(70, () => e.active && e.clearTint());
    sparks(this, e.x, e.y - e.height / 2, 0xffd166, 6);
    if (d.kind === 'boss') {
      d.hitsSinceDrop += dmg;
      if (d.hitsSinceDrop >= 8 && d.hp > 0) {
        d.hitsSinceDrop = 0;
        const can = this.addPickup(e.x - Math.sign(this.player.x - e.x) * 120, e.y - 300, 'oil');
        this.tweens.add({ targets: can, y: (GROUND_ROW * TILE) - 18, duration: 700, ease: 'Bounce.easeOut' });
      }
      this.drawHud();
    }
    if (d.hp <= 0) this.killEnemy(e, d);
  }

  private killEnemy(e: Sprite, d: EnemyData) {
    sparks(this, e.x, e.y - e.height / 2, 0xf77f00, d.kind === 'boss' ? 60 : 18);
    if (d.kind === 'boss') {
      this.cameras.main.shake(600, 0.02);
      const x = e.x;
      e.destroy();
      this.boss = null;
      this.bossBar?.destroy();
      this.bossLabel?.destroy();
      for (let i = 0; i < 8; i++) this.addPickup(x - 160 + i * 45, GROUND_ROW * TILE - 70, 'scrap');
      const flag = this.addPickup(x + 220, GROUND_ROW * TILE - 60, 'flag');
      flag.setAlpha(0);
      this.tweens.add({ targets: flag, alpha: 1, duration: 600 });
      toast(this, x, GROUND_ROW * TILE - 250, 'CRUSHER DOWN!', '#06d6a0', 56);
      return;
    }
    // Most enemies drop a bit of scrap.
    if (d.kind !== 'drone') this.addPickup(e.x, e.y - 30, 'scrap');
    e.destroy();
  }

  /** Returns true if damage was applied. */
  private hurt(amount: number, src: Hurt): boolean {
    if (this.over || this.time.now < this.invulnUntil) return false;
    this.armor -= amount;
    this.invulnUntil = this.time.now + 1100;
    this.cameras.main.shake(140, 0.006);
    toast(this, this.player.x, this.player.y - 100, `−${amount}`, '#ef476f', 30);
    this.drawHud();
    if (this.armor <= 0) this.retreat(src);
    return true;
  }

  private fell() {
    this.invulnUntil = 0;
    this.hurt(80, 'fall');
    if (!this.over) {
      this.player.setPosition(this.respawn.x, this.respawn.y - 10);
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
      sparks(this, item.x, item.y, 0xffd166, 6);
      item.destroy();
      this.drawHud();
    } else if (kind === 'oil') {
      this.armor = Math.min(this.maxArmor, this.armor + 150);
      toast(this, item.x, item.y - 40, '+150 armor', '#06d6a0', 30);
      item.destroy();
      this.drawHud();
    } else if (kind === 'beacon') {
      const col = item.getData('col') as number;
      if (col !== this.checkpointCol) {
        this.checkpointCol = col;
        item.setTexture('beacon-on');
        this.respawn = { x: item.x, y: (GROUND_ROW) * TILE };
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
    this.player.anims.stop();
  }

  private retreat(src: Hurt) {
    this.freeze();
    sparks(this, this.player.x, this.player.y - 40, 0xef476f, 30);
    this.player.setTint(0x555555);
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
    sparks(this, this.player.x, this.player.y - 60, 0x06d6a0, 40);

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
    };
    items.push(button(this, W / 2, H / 2 - 10, 300, 80, 'Keep playing', resume, { fill: 0x2a9d8f, edge: 0x9ff0e3 })
      .setScrollFactor(0, 0, true).setDepth(703));
    items.push(button(this, W / 2, H / 2 + 100, 300, 80, 'Back to Garage', () => this.scene.start('Garage'), { fill: 0x3d4458 })
      .setScrollFactor(0, 0, true).setDepth(703));
  }
}
