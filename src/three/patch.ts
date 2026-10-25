import * as THREE from 'three';

/**
 * A damaged armor plate on the robot, drawn as base-ten blocks: hundreds are
 * 10×10 slabs, tens are 1×10 bars, ones are single squares. Missing points
 * are empty sockets with glowing edges. Repairs fill the sockets in place.
 */

export type Place = 1 | 2 | 3;

export interface PatchPiece {
  place: Place;
  mesh: THREE.Mesh;
  outline: THREE.LineSegments;
  hole: boolean;
  filled: boolean;
  pop: number;
}

const GAP = 0.6;

function gridTexture(cols: number, rows: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = Math.max(16, cols * 16);
  c.height = Math.max(16, rows * 16);
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 2;
  for (let i = 1; i < cols; i++) {
    g.beginPath();
    g.moveTo((i * c.width) / cols, 0);
    g.lineTo((i * c.width) / cols, c.height);
    g.stroke();
  }
  for (let i = 1; i < rows; i++) {
    g.beginPath();
    g.moveTo(0, (i * c.height) / rows);
    g.lineTo(c.width, (i * c.height) / rows);
    g.stroke();
  }
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 4;
  g.strokeRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A charred, cracked patch of plate: hides exactly how much is missing. */
function scorchTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 10, 64, 64, 90);
  grad.addColorStop(0, '#3a2a22');
  grad.addColorStop(1, '#0c0a0a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.4})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
  }
  g.strokeStyle = 'rgba(255,140,40,0.9)';
  g.lineWidth = 2;
  for (let k = 0; k < 6; k++) {
    g.beginPath();
    let x = 64, y = 64;
    g.moveTo(x, y);
    for (let i = 0; i < 6; i++) {
      x += (Math.random() - 0.5) * 50;
      y += (Math.random() - 0.5) * 50;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Block size in cells for each place. */
const SIZE: Record<Place, [number, number]> = { 1: [10, 10], 2: [1, 10], 3: [1, 1] };

export class PlatePatch {
  readonly group = new THREE.Group();
  readonly pieces: PatchPiece[] = [];
  /** World size of one cell. */
  readonly cell: number;
  private flashT = 0;
  private t = 0;
  private filledMat: Record<Place, THREE.MeshStandardMaterial>;
  private holeMat: THREE.MeshStandardMaterial;
  private edgeMat: THREE.LineBasicMaterial;
  private edgeRed: THREE.LineBasicMaterial;
  private edgeDone: THREE.LineBasicMaterial;
  private covers: THREE.Mesh[] = [];

  /**
   * `have` and `missing` are [hundreds, tens, ones]. The patch is fitted into
   * `width` × `height` world units, facing +Z.
   */
  constructor(have: [number, number, number], missing: [number, number, number], color: number, width: number, height: number) {
    const mat = (m: THREE.Material) => {
      m.userData.disposable = true;
      return m;
    };
    this.filledMat = {
      1: mat(new THREE.MeshStandardMaterial({ color, map: gridTexture(10, 10), metalness: 0.55, roughness: 0.35 })) as THREE.MeshStandardMaterial,
      2: mat(new THREE.MeshStandardMaterial({ color, map: gridTexture(1, 10), metalness: 0.55, roughness: 0.35 })) as THREE.MeshStandardMaterial,
      3: mat(new THREE.MeshStandardMaterial({ color, map: gridTexture(1, 1), metalness: 0.55, roughness: 0.35 })) as THREE.MeshStandardMaterial,
    };
    this.holeMat = mat(new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 0.9 })) as THREE.MeshStandardMaterial;
    this.edgeMat = mat(new THREE.LineBasicMaterial({ color: new THREE.Color(0xff9f1c).multiplyScalar(2.2), toneMapped: false })) as THREE.LineBasicMaterial;
    this.edgeRed = mat(new THREE.LineBasicMaterial({ color: new THREE.Color(0xff2a2a).multiplyScalar(3), toneMapped: false })) as THREE.LineBasicMaterial;
    this.edgeDone = mat(new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })) as THREE.LineBasicMaterial;

    const nH = have[0] + missing[0];
    const nT = have[1] + missing[1];
    const nO = have[2] + missing[2];

    // Pick how many hundreds go in a row so the whole thing fits best.
    let best = { cell: 0, perRow: 1 };
    for (let perRow = 1; perRow <= Math.max(1, nH); perRow++) {
      const rows = Math.ceil(nH / perRow);
      const lowW = nT * (1 + GAP * 0.6) + (nO ? 1 + Math.min(5, nO) * 1.2 : 0);
      const w = Math.max(perRow * (10 + GAP), lowW, 4);
      const h = rows * (10 + GAP) + (nT || nO ? 10 + GAP : 0);
      const cell = Math.min(width / w, height / h);
      if (cell > best.cell) best = { cell, perRow };
    }
    const c = best.cell;
    this.cell = c;
    const perRow = best.perRow;
    const rows = Math.ceil(nH / perRow);
    const totalW = Math.max(perRow * (10 + GAP), nT * (1 + GAP * 0.6) + (nO ? 1 + Math.min(5, nO) * 1.2 : 0)) * c;
    const totalH = (rows * (10 + GAP) + (nT || nO ? 10 + GAP : 0)) * c;

    // Backing: the plate itself, a little darker, with a rim.
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(totalW + c * 2, totalH + c * 2, c * 0.6),
      mat(new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.35), metalness: 0.7, roughness: 0.4 })),
    );
    back.position.z = -c * 0.5;
    this.group.add(back);

    const x0 = -totalW / 2;
    const y0 = totalH / 2;
    const add = (place: Place, hole: boolean, x: number, y: number) => {
      const [cw, ch] = SIZE[place];
      const geo = new THREE.BoxGeometry(cw * c * 0.96, ch * c * 0.96, c * 0.5);
      const mesh = new THREE.Mesh(geo, hole ? this.holeMat : this.filledMat[place]);
      mesh.position.set(x + (cw * c) / 2, y - (ch * c) / 2, hole ? -c * 0.3 : 0);
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geo), hole ? this.edgeMat : this.edgeDone);
      mesh.add(outline);
      this.group.add(mesh);
      this.pieces.push({ place, mesh, outline, hole, filled: !hole, pop: 0 });
    };
    // Filled blocks first, then the holes, for each place.
    for (let i = 0; i < nH; i++) {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      add(1, i >= have[0], x0 + col * (10 + GAP) * c, y0 - row * (10 + GAP) * c);
    }
    const lowY = y0 - rows * (10 + GAP) * c;
    for (let i = 0; i < nT; i++) add(2, i >= have[1], x0 + i * (1 + GAP * 0.6) * c, lowY);
    const onesX = x0 + nT * (1 + GAP * 0.6) * c + c;
    for (let i = 0; i < nO; i++) add(3, i >= have[2], onesX + (i % 5) * 1.2 * c, lowY - Math.floor(i / 5) * 1.2 * c);
  }

  /**
   * Cover the damage with scorch marks so the holes can't simply be counted:
   * he has to work out the missing amount (full minus what's left). The
   * covers are a bit bigger than the holes and uneven.
   */
  coverHoles() {
    const mat = new THREE.MeshStandardMaterial({ map: scorchTexture(), roughness: 1, emissive: 0x401000, emissiveIntensity: 0.6 });
    mat.userData.disposable = true;
    const c = this.cell;
    for (const place of [1, 2, 3] as Place[]) {
      const holes = this.holes(place);
      if (!holes.length) continue;
      const box = new THREE.Box3();
      for (const h of holes) {
        h.mesh.geometry.computeBoundingBox();
        box.union(h.mesh.geometry.boundingBox!.clone().translate(h.mesh.position));
      }
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const padL = c * (0.6 + Math.random() * 2.5);
      const padR = c * (0.6 + Math.random() * 2.5);
      const padY = c * (0.4 + Math.random() * 1.2);
      const cover = new THREE.Mesh(new THREE.BoxGeometry(size.x + padL + padR, size.y + padY * 2, c * 0.7), mat);
      cover.position.set(center.x + (padR - padL) / 2, center.y, c * 0.25);
      cover.rotation.z = (Math.random() - 0.5) * 0.08;
      this.group.add(cover);
      this.covers.push(cover);
    }
  }

  get covered() {
    return this.covers.length > 0;
  }

  /** Blow the scorch away to show the real holes. */
  reveal() {
    for (const cv of this.covers) cv.userData.vanish = 1;
  }

  holes(place?: Place): PatchPiece[] {
    return this.pieces.filter((p) => p.hole && (place === undefined || p.place === place));
  }

  /** Snap a piece into a hole. */
  fill(p: PatchPiece) {
    p.filled = true;
    p.mesh.material = this.filledMat[p.place];
    p.outline.material = this.edgeDone;
    p.mesh.position.z = 0;
    p.pop = 1;
  }

  /** Take a piece back out (wrong answer). */
  unfill(p: PatchPiece) {
    p.filled = false;
    p.mesh.material = this.holeMat;
    p.outline.material = this.edgeMat;
    p.mesh.position.z = -this.cell * 0.3;
  }

  /** Flash the empty holes red for a moment. */
  flash(seconds = 1.6) {
    this.flashT = seconds;
  }

  update(dt: number) {
    this.t += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    const red = this.flashT > 0 && Math.floor(this.t / 0.12) % 2 === 0;
    const pulse = 1.6 + Math.sin(this.t * 5) * 0.8;
    this.edgeMat.color.setHex(0xff9f1c).multiplyScalar(pulse);
    for (const cv of this.covers) {
      if (!cv.userData.vanish) continue;
      cv.userData.vanish -= dt * 4;
      cv.scale.setScalar(Math.max(0.001, cv.userData.vanish));
      cv.position.z += dt * this.cell * 6;
    }
    this.covers = this.covers.filter((cv) => {
      if (cv.userData.vanish !== undefined && cv.userData.vanish <= 0) {
        cv.removeFromParent();
        return false;
      }
      return true;
    });
    for (const p of this.pieces) {
      if (p.hole && !p.filled) p.outline.material = red ? this.edgeRed : this.edgeMat;
      if (p.pop > 0) {
        p.pop = Math.max(0, p.pop - dt * 4);
        const s = 1 + Math.sin(p.pop * Math.PI) * 0.35;
        p.mesh.scale.set(s, s, 1 + p.pop * 2);
      }
    }
  }

  /** Screen-space center and width (px) of a piece. */
  screenOf(p: PatchPiece, camera: THREE.Camera, w: number, h: number): { x: number; y: number; size: number } {
    p.mesh.updateWorldMatrix(true, false);
    const center = new THREE.Vector3().setFromMatrixPosition(p.mesh.matrixWorld);
    const [cw] = SIZE[p.place];
    const edge = p.mesh.localToWorld(new THREE.Vector3((cw * this.cell) / 2, 0, 0));
    const a = center.clone().project(camera);
    const b = edge.project(camera);
    return { x: ((a.x + 1) / 2) * w, y: ((1 - a.y) / 2) * h, size: Math.abs(b.x - a.x) * w };
  }
}
