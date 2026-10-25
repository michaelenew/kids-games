import type Phaser from 'phaser';
import * as THREE from 'three';
import type { RobotLook } from '../art';
import { addCity, addJunk, addSkyBits, skyTexture } from './backdrop';
import { METAL, glow, glowSprite, rboxGeo } from './kit';
import {
  beacon, box, crusher, drone, enemyShot, finishFlag, oilCan, playerShot, rustbot, scrap, shockwave, turret,
  type BoxKind, type Model,
} from './props';
import { Robot, ROBOT_HEIGHT } from './robot';
import { type Stage, UNIT, px2w, py2w } from './stage';

export type TrackKind =
  | 'rustbot' | 'turret' | 'drone' | 'boss'
  | 'shot' | 'eshot' | 'shock'
  | 'scrap' | 'oil' | 'beacon' | 'flag'
  | 'box-wood' | 'box-steel' | 'box-titan' | 'box-energy';

type GameSprite = Phaser.GameObjects.Sprite;

interface Tracked {
  obj: GameSprite;
  kind: TrackKind;
  model: Model;
  /** Where the model's origin sits relative to the sprite's position, in px. */
  dy: number;
  /** Depth: characters stand in front of blocks; boxes sit in the block row. */
  z: number;
}

const TILE_DEPTH = 3.2;
const TILE_Z = -1.0;
const PLAYER_HEIGHT_PX = 92;
/** Characters stand just in front of crates (which are 1 unit deep) so nothing hides them. */
const ACTOR_Z = 0.55;

/** Rusty plate texture for the ground tops. */
function plateTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6a4a3c';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,25,20' : '150,95,60'},${Math.random() * 0.25})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 6, 1 + Math.random() * 3);
  }
  g.strokeStyle = 'rgba(20,12,10,0.8)';
  g.lineWidth = 3;
  g.strokeRect(2, 2, 124, 124);
  g.fillStyle = '#b8a090';
  for (const [x, y] of [[10, 10], [118, 10], [10, 118], [118, 118]]) {
    g.beginPath();
    g.arc(x, y, 4, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Bursts of glowing sparks and chunks of metal, drawn with one instanced mesh. */
class Particles {
  readonly mesh: THREE.InstancedMesh;
  private pos: THREE.Vector3[] = [];
  private vel: THREE.Vector3[] = [];
  private life: number[] = [];
  private size: number[] = [];
  private spin: number[] = [];
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();

  constructor(readonly max = 400) {
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    mat.userData.disposable = true;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, max);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < max; i++) {
      this.pos.push(new THREE.Vector3());
      this.vel.push(new THREE.Vector3());
      this.life.push(0);
      this.size.push(0);
      this.spin.push(0);
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, new THREE.Color(0));
    }
  }

  emit(x: number, y: number, color: number, count: number, opts: { speed?: number; size?: number; glow?: number; up?: number } = {}) {
    const c = new THREE.Color(color).multiplyScalar(opts.glow ?? 2.5);
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.speed ?? 6) * (0.4 + Math.random() * 0.8);
      this.pos[i].set(x, y, (Math.random() - 0.5) * 0.6);
      this.vel[i].set(Math.cos(a) * sp, Math.sin(a) * sp + (opts.up ?? 3), (Math.random() - 0.5) * sp);
      this.life[i] = 0.5 + Math.random() * 0.5;
      this.size[i] = (opts.size ?? 0.07) * (0.6 + Math.random() * 0.8);
      this.spin[i] = Math.random() * 10;
      this.mesh.setColorAt(i, c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const p = this.pos[i];
      const v = this.vel[i];
      v.y -= 22 * dt;
      p.addScaledVector(v, dt);
      const s = this.life[i] > 0 ? this.size[i] * Math.min(1, this.life[i] * 3) : 0;
      this.spin[i] += dt * 8;
      this.e.set(this.spin[i], this.spin[i] * 0.7, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(p, this.q, new THREE.Vector3(s, s, s));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class WorldView {
  readonly root = new THREE.Group();
  readonly player: Robot;
  private tracked: Tracked[] = [];
  private particles = new Particles();
  private flashes: { s: THREE.Sprite; life: number }[] = [];
  private blinkers: THREE.Object3D[] = [];
  private t = 0;
  private playerScale: number;
  /** Mark of the blaster, so shots are drawn at the right size. */
  blasterMark = 0;
  /** Where the player is, in px (for turret aiming). */
  playerPx = { x: 0, y: 0 };

  constructor(private stage: Stage, map: string[], look: RobotLook) {
    stage.clear();
    const cols = map[0].length;
    const rows = map.length;
    const groundY = py2w(12 * UNIT);

    this.buildTiles(map);
    addCity(this.root, 0, cols, groundY);
    addJunk(this.root, -10, cols + 10, groundY);
    addSkyBits(this.root, cols / 2, groundY);
    this.root.traverse((o) => {
      if ((o as THREE.Sprite).isSprite && o.userData.blink !== undefined) this.blinkers.push(o);
    });

    this.player = new Robot(look);
    this.playerScale = PLAYER_HEIGHT_PX / UNIT / ROBOT_HEIGHT;
    this.player.holder.scale.setScalar(this.playerScale);
    this.player.holder.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh));
    this.root.add(this.player.holder);
    this.root.add(this.particles.mesh);

    stage.content.add(this.root);
    stage.activate(skyTexture(), new THREE.Fog(0x1a1030, 22, 95));
    stage.onUpdate((dt) => this.update(dt));
    void rows;
  }

  private buildTiles(map: string[]) {
    const rows = map.length;
    const cols = map[0].length;
    const tops: [number, number][] = [];
    const dirt: [number, number][] = [];
    const crates: [number, number][] = [];
    const spikes: [number, number][] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = map[r][c];
        if (ch === '=') {
          tops.push([c, r]);
          for (let rr = r + 1; rr < rows; rr++) dirt.push([c, rr]);
        } else if (ch === '#') crates.push([c, r]);
        else if (ch === '^') spikes.push([c, r]);
      }
    }

    const m = new THREE.Matrix4();
    const place = (inst: THREE.InstancedMesh, cells: [number, number][], z = TILE_Z) => {
      cells.forEach(([c, r], i) => {
        m.makeTranslation(c + 0.5, -(r + 0.5), z);
        inst.setMatrixAt(i, m);
      });
      inst.receiveShadow = true;
      this.root.add(inst);
    };

    const topMat = new THREE.MeshStandardMaterial({ map: plateTexture(), metalness: 0.6, roughness: 0.55 });
    topMat.userData.disposable = true;
    // Plain boxes: there are hundreds of tiles, so every triangle counts.
    const tileGeo = new THREE.BoxGeometry(1, 1, TILE_DEPTH);
    place(new THREE.InstancedMesh(tileGeo, topMat, Math.max(1, tops.length)), tops);
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x3a2620, metalness: 0.2, roughness: 0.9 });
    dirtMat.userData.disposable = true;
    place(new THREE.InstancedMesh(tileGeo, dirtMat, Math.max(1, dirt.length)), dirt);

    // Unbreakable blocks: heavy riveted girders. (Breakable boxes have X braces.)
    if (crates.length) {
      const block = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 0.98, 0.98), METAL.dark, crates.length);
      const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(0.86, 0.86, 1.0), METAL.gunmetal, crates.length);
      const rivets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.7, 1.02), METAL.dark, crates.length);
      crates.forEach(([c, r], i) => {
        const t = m.makeTranslation(c + 0.5, -(r + 0.5), 0);
        block.setMatrixAt(i, t);
        frame.setMatrixAt(i, t);
        rivets.setMatrixAt(i, t);
      });
      for (const inst of [block, frame, rivets]) {
        inst.castShadow = true;
        inst.receiveShadow = true;
        this.root.add(inst);
      }
    }

    // Spikes: rows of steel cones with hot tips.
    if (spikes.length) {
      const per = 4;
      const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(0.1, 0.5, 6), METAL.chrome, spikes.length * per * 2);
      const tips = new THREE.InstancedMesh(new THREE.ConeGeometry(0.04, 0.12, 6), glow(0xff3b3b, 2.5), spikes.length * per * 2);
      let k = 0;
      for (const [c, r] of spikes) {
        for (let i = 0; i < per; i++) {
          for (const z of [-0.25, 0.25]) {
            const x = c + 0.125 + i * 0.25;
            const yb = -(r + 1);
            cone.setMatrixAt(k, m.makeTranslation(x, yb + 0.25, z));
            tips.setMatrixAt(k, m.makeTranslation(x, yb + 0.45, z));
            k++;
          }
        }
      }
      cone.castShadow = true;
      this.root.add(cone, tips);
    }

    // A glowing trim line along the front edge of every run of ground.
    const trimMat = glow(0xff8c42, 1.6);
    for (let r = 0; r < rows; r++) {
      let start = -1;
      for (let c = 0; c <= cols; c++) {
        const on = c < cols && map[r][c] === '=';
        if (on && start < 0) start = c;
        if (!on && start >= 0) {
          const len = c - start;
          const strip = new THREE.Mesh(rboxGeo(len - 0.1, 0.05, 0.05, 0.02), trimMat);
          strip.position.set(start + len / 2, -r - 0.08, TILE_Z + TILE_DEPTH / 2 + 0.01);
          this.root.add(strip);
          start = -1;
        }
      }
    }
  }

  /** Give a game object a 3D body. The game object itself should be invisible. */
  track(obj: GameSprite, kind: TrackKind) {
    let model: Model;
    let dy = 0;
    switch (kind) {
      case 'rustbot': model = rustbot(); break;
      case 'turret': model = turret(); break;
      case 'drone': model = drone(); dy = -22; break;
      case 'boss': model = crusher(); break;
      case 'shot': model = playerShot(this.blasterMark); break;
      case 'eshot': model = enemyShot(); break;
      case 'shock': model = shockwave(); dy = 15; break;
      case 'scrap': model = scrap(); break;
      case 'oil': model = oilCan(); break;
      case 'beacon': model = beacon(); break;
      case 'flag': model = finishFlag(); dy = 0; break;
      default: model = box(kind.slice(4) as BoxKind); break;
    }
    model.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.castShadow === undefined) o.castShadow = true;
    });
    this.root.add(model.root);
    const t: Tracked = { obj, kind, model, dy, z: kind.startsWith('box-') ? 0 : ACTOR_Z };
    this.tracked.push(t);
    this.place(t);
  }

  private place(t: Tracked) {
    t.model.root.position.set(px2w(t.obj.x), py2w(t.obj.y + t.dy), t.z);
  }

  placePlayer(px: number, py: number) {
    this.player.holder.position.set(px2w(px), py2w(py), ACTOR_Z);
  }

  /** Muzzle tip in px, so shots start right at the barrel. */
  muzzlePx(): { x: number; y: number } {
    const v = this.player.muzzleWorld();
    return { x: v.x * UNIT, y: -v.y * UNIT };
  }

  burst(px: number, py: number, color: number, count = 14, big = false) {
    const x = px2w(px);
    const y = py2w(py);
    this.particles.emit(x, y, color, count, big ? { speed: 9, size: 0.12, up: 4 } : {});
    const s = glowSprite(color, big ? 3.5 : 0.9, big ? 2 : 1.4);
    s.position.set(x, y, ACTOR_Z + 0.3);
    this.root.add(s);
    this.flashes.push({ s, life: big ? 0.25 : 0.12 });
  }

  /** Blow up a tracked enemy: debris in its own colors plus a fireball. */
  explode(obj: GameSprite, big = false) {
    const t = this.tracked.find((tr) => tr.obj === obj);
    const colors = t?.model.debris.length ? t.model.debris : [0x8d99ae];
    const h = (obj.body as Phaser.Physics.Arcade.Body | null)?.height ?? 40;
    this.debris(obj.x, obj.y - h / 2, colors, big ? 60 : 18);
    if (big) {
      for (let i = 0; i < 5; i++) this.burst(obj.x + (Math.random() - 0.5) * 140, obj.y - Math.random() * 140, 0xff8c1a, 20, true);
    }
  }

  /** Chunks of metal flying off a destroyed enemy. */
  debris(px: number, py: number, colors: number[], count = 16) {
    for (const c of colors) this.particles.emit(px2w(px), py2w(py), c, Math.ceil(count / colors.length), { speed: 7, size: 0.16, glow: 0.8, up: 5 });
    this.burst(px, py, 0xff8c1a, 20, true);
  }

  setCamera(scrollX: number, scrollY: number, zoom = 1) {
    this.stage.setCameraPx(scrollX, scrollY, zoom);
  }

  private update(dt: number) {
    this.t += dt;
    const now = performance.now();
    for (const t of this.tracked) {
      const obj = t.obj;
      if (!obj.scene || !obj.active) {
        t.model.root.removeFromParent();
        continue;
      }
      this.place(t);
      const hitAt = obj.getData('hitAt') as number | undefined;
      const e = obj.getData('e') as { state?: string } | undefined;
      const body = obj.body as Phaser.Physics.Arcade.Body | null;
      let aim: number | undefined;
      if (t.kind === 'turret') aim = Math.atan2(this.playerPx.y - 40 - (obj.y - 26), this.playerPx.x - obj.x);
      if (t.kind === 'shot' || t.kind === 'eshot') {
        const vx = body?.velocity.x ?? 0;
        t.model.root.rotation.y = vx < 0 ? Math.PI : 0;
      }
      t.model.animate({
        t: this.t,
        dt,
        facing: obj.flipX ? 1 : -1,
        sinceHit: hitAt === undefined ? Infinity : (now - hitAt) / 1000,
        state: t.kind === 'beacon' ? (obj.texture.key === 'beacon-on' ? 'on' : 'off') : e?.state,
        aim,
        vx: body?.velocity.x ?? 0,
        hp: obj.getData('maxHp') ? (obj.getData('hp') as number) / (obj.getData('maxHp') as number) : undefined,
      });
    }
    this.tracked = this.tracked.filter((t) => t.obj.scene && t.obj.active);

    this.player.update(dt);
    this.particles.update(dt);
    for (const f of this.flashes) {
      f.life -= dt;
      f.s.material.opacity = Math.max(0, f.life * 6);
      if (f.life <= 0) f.s.removeFromParent();
    }
    this.flashes = this.flashes.filter((f) => f.life > 0);
    for (const b of this.blinkers) b.visible = Math.sin(this.t * 3 + (b.userData.blink as number)) > 0.3;
  }
}
