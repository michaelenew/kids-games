import * as THREE from 'three';
import type { Stage } from './stage';

/**
 * Sparkles, hearts, confetti, shock rings, fireworks and rainbow trails: the
 * celebration effects. Each burst lives for a moment and cleans itself up.
 */

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let starTex: THREE.Texture | null = null;
function star(): THREE.Texture {
  starTex ??= canvasTexture(64, (g, s) => {
    const c = s / 2;
    const grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    // Four-point twinkle.
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.moveTo(c, 0); g.lineTo(c + 3, c - 3); g.lineTo(s, c); g.lineTo(c + 3, c + 3);
    g.lineTo(c, s); g.lineTo(c - 3, c + 3); g.lineTo(0, c); g.lineTo(c - 3, c - 3);
    g.closePath();
    g.fill();
  });
  return starTex;
}

let heartTex: THREE.Texture | null = null;
function heart(): THREE.Texture {
  heartTex ??= canvasTexture(128, (g, s) => {
    g.translate(s / 2, s / 2 + 8);
    g.scale(s / 128, s / 128);
    g.fillStyle = '#ff4f9a';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(0, 38);
    g.bezierCurveTo(-60, 0, -48, -52, 0, -22);
    g.bezierCurveTo(48, -52, 60, 0, 0, 38);
    g.closePath();
    g.fill();
    g.stroke();
  });
  return heartTex;
}

export const RAINBOW = [0xff4d6d, 0xff9f1c, 0xffe14d, 0x52d273, 0x3fa9f5, 0x7b6cf6, 0xc77dff];
export const PASTEL = [0xffffff, 0xffd6f2, 0xfff3a3, 0xc9f2ff, 0xe0ccff];

interface Live {
  obj: THREE.Object3D;
  age: number;
  life: number;
  step: (k: number, dt: number) => void;
}

export class Fx {
  private live: Live[] = [];

  constructor(private stage: Stage) {}

  /** Call every frame. */
  update(dt: number): void {
    for (const l of this.live) {
      l.age += dt;
      l.step(Math.min(1, l.age / l.life), dt);
    }
    for (const l of this.live.filter((x) => x.age >= x.life)) {
      l.obj.parent?.remove(l.obj);
      l.obj.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
    }
    this.live = this.live.filter((x) => x.age < x.life);
  }

  private add(obj: THREE.Object3D, life: number, step: Live['step']): void {
    this.stage.world.add(obj);
    this.live.push({ obj, age: 0, life, step });
  }

  /** A burst of twinkling sparkles. */
  sparkles(at: THREE.Vector3, opts: { count?: number; colors?: number[]; speed?: number; size?: number; life?: number; gravity?: number; up?: number } = {}): void {
    const { count = 60, colors = PASTEL, speed = 4, size = 0.45, life = 1.4, gravity = -3, up = 2 } = opts;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const vel: THREE.Vector3[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      pos.set([at.x, at.y, at.z], i * 3);
      const v = new THREE.Vector3().randomDirection().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      v.y += up;
      vel.push(v);
      c.set(colors[i % colors.length]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size, map: star(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    this.add(pts, life, (k, dt) => {
      for (let i = 0; i < count; i++) {
        const v = vel[i];
        v.y += gravity * dt;
        v.multiplyScalar(1 - 1.2 * dt);
        pos[i * 3] += v.x * dt;
        pos[i * 3 + 1] += v.y * dt;
        pos[i * 3 + 2] += v.z * dt;
      }
      g.attributes.position.needsUpdate = true;
      m.opacity = 1 - k * k;
      m.size = size * (1 + Math.sin(k * 30) * 0.15);
    });
  }

  /** Hearts that float up and fade. */
  hearts(at: THREE.Vector3, count = 6): void {
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heart(), transparent: true, depthWrite: false }));
      const start = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.4, (Math.random() - 0.5) * 1.2));
      s.position.copy(start);
      const delay = i * 0.12;
      const drift = (Math.random() - 0.5) * 0.8;
      this.add(s, 1.8 + delay, (_k, _dt) => {
        const age = Math.max(0, (s.userData.age = (s.userData.age ?? 0) + _dt) - delay);
        const t = age / 1.8;
        s.position.set(start.x + Math.sin(age * 4) * 0.2 + drift * t, start.y + t * 2.2, start.z);
        const sc = Math.min(1, age * 6) * 0.55;
        s.scale.set(sc, sc, sc);
        (s.material as THREE.SpriteMaterial).opacity = age <= 0 ? 0 : 1 - t * t;
      });
    }
  }

  /** Colorful paper confetti raining down around a point. */
  confetti(at: THREE.Vector3, count = 120, spread = 6): void {
    const geo = new THREE.PlaneGeometry(0.16, 0.24);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    inst.frustumCulled = false;
    const parts = Array.from({ length: count }, (_, i) => ({
      p: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * 2, (Math.random() - 0.5) * spread)),
      v: new THREE.Vector3((Math.random() - 0.5) * 3, 4 + Math.random() * 5, (Math.random() - 0.5) * 3),
      r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
      spin: 4 + Math.random() * 8,
      c: RAINBOW[i % RAINBOW.length],
    }));
    parts.forEach((pt, i) => inst.setColorAt(i, new THREE.Color(pt.c)));
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    this.add(inst, 3.5, (k, dt) => {
      parts.forEach((pt, i) => {
        pt.v.y = Math.max(-1.6, pt.v.y - 9 * dt);
        pt.p.addScaledVector(pt.v, dt);
        pt.p.x += Math.sin(pt.spin * k * 3) * dt * 0.8;
        pt.r.x += pt.spin * dt;
        pt.r.y += pt.spin * 0.7 * dt;
        inst.setMatrixAt(i, m4.compose(pt.p, q.setFromEuler(pt.r), one));
      });
      inst.instanceMatrix.needsUpdate = true;
      mat.opacity = k > 0.8 ? (1 - k) * 5 : 1;
    });
  }

  /** A glowing ring that bursts outward. */
  ring(at: THREE.Vector3, color = 0xffffff, size = 4, flat = true): void {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 48), m);
    ring.position.copy(at);
    if (flat) ring.rotation.x = Math.PI / 2;
    else ring.lookAt(this.stage.camera.position);
    this.add(ring, 0.8, (k) => {
      ring.scale.setScalar(0.2 + k * size);
      m.opacity = (1 - k) * 0.9;
    });
  }

  /** A rainbow of rings, one color after another. */
  rainbowRings(at: THREE.Vector3, size = 5, flat = true): void {
    RAINBOW.forEach((c, i) => setTimeout(() => this.ring(at, c, size * (1 + i * 0.08), flat), i * 70));
  }

  /** A crystal bursting into glittering shards. */
  shards(at: THREE.Vector3, color: number, count = 16): void {
    const geo = new THREE.TetrahedronGeometry(0.3);
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, transparent: true, flatShading: true });
    const grp = new THREE.Group();
    const parts = Array.from({ length: count }, () => {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(at);
      m.scale.setScalar(0.6 + Math.random());
      grp.add(m);
      const v = new THREE.Vector3().randomDirection().multiplyScalar(4 + Math.random() * 5);
      v.y = Math.abs(v.y) + 3;
      return { m, v, spin: new THREE.Vector3().randomDirection().multiplyScalar(10) };
    });
    this.add(grp, 1.3, (k, dt) => {
      for (const p of parts) {
        p.v.y -= 14 * dt;
        p.m.position.addScaledVector(p.v, dt);
        p.m.rotation.x += p.spin.x * dt;
        p.m.rotation.y += p.spin.y * dt;
      }
      mat.opacity = 1 - k * k;
    });
  }

  /** A firework: a rocket streak then a big colored burst, high up. */
  firework(at: THREE.Vector3): void {
    const colors = [RAINBOW[Math.floor(Math.random() * RAINBOW.length)], 0xffffff, RAINBOW[Math.floor(Math.random() * RAINBOW.length)]];
    this.sparkles(at.clone().add(new THREE.Vector3(0, -6, 0)), { count: 8, colors: [0xfff3a3], speed: 0.3, up: 9, gravity: -2, life: 0.6, size: 0.6 });
    setTimeout(() => this.sparkles(at, { count: 90, colors, speed: 7, up: 0, gravity: -2, life: 1.8, size: 0.7 }), 600);
  }
}

/**
 * A rainbow ribbon streaming behind something that moves (a boosting
 * unicorn). Feed it the point to follow every frame.
 */
export class RainbowTrail {
  readonly mesh: THREE.Mesh;
  private points: THREE.Vector3[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private bandH: number;
  /** 0 = invisible, 1 = full trail. */
  strength = 0;

  constructor(private length = 40, width = 0.7) {
    this.bandH = width / RAINBOW.length;
    const bands = RAINBOW.length;
    const verts = length * 2 * bands;
    this.pos = new Float32Array(verts * 3);
    this.col = new Float32Array(verts * 4);
    const idx: number[] = [];
    for (let b = 0; b < bands; b++) {
      const base = b * length * 2;
      for (let i = 0; i < length - 1; i++) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    this.mesh.frustumCulled = false;
  }

  update(head: THREE.Vector3): void {
    this.points.unshift(head.clone());
    if (this.points.length > this.length) this.points.pop();
    const c = new THREE.Color();
    const bands = RAINBOW.length;
    const side = new THREE.Vector3();
    for (let b = 0; b < bands; b++) {
      c.set(RAINBOW[b]);
      for (let i = 0; i < this.length; i++) {
        const p = this.points[Math.min(i, this.points.length - 1)] ?? head;
        const q = this.points[Math.min(i + 1, this.points.length - 1)] ?? head;
        // Lie flat, spread sideways: a rainbow road behind the runner.
        side.set(-(p.z - q.z), 0, p.x - q.x);
        if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
        side.normalize();
        const o0 = (b - bands / 2) * this.bandH;
        const v = (b * this.length * 2 + i * 2) * 3;
        this.pos.set([p.x + side.x * o0, p.y, p.z + side.z * o0, p.x + side.x * (o0 + this.bandH), p.y, p.z + side.z * (o0 + this.bandH)], v);
        const a = this.strength * (1 - i / this.length);
        const ci = (b * this.length * 2 + i * 2) * 4;
        this.col.set([c.r, c.g, c.b, a, c.r, c.g, c.b, a], ci);
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}

/** A big, round, glowing letter (or number) that always faces the camera. */
export function glyphSprite(text: string, opts: { color?: string; ring?: string; size?: number } = {}): THREE.Sprite {
  const { color = '#7b2cbf', ring = '#ffffff', size = 2 } = opts;
  const tex = canvasTexture(256, (g, s) => {
    const c = s / 2;
    const grad = g.createRadialGradient(c, c * 0.8, 10, c, c, c);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.75, '#fff0fb');
    grad.addColorStop(1, '#ffd1f0');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(c, c, c - 10, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = ring;
    g.stroke();
    g.fillStyle = color;
    g.font = `bold ${text.length > 1 ? 120 : 170}px "Arial Rounded MT Bold", "Nunito", "Helvetica Neue", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, c, c + 10);
  });
  // Slightly below pure white, so the glow pass doesn't blur the letter.
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xe8e8e8 }));
  sp.scale.set(size, size, size);
  sp.renderOrder = 10;
  return sp;
}
