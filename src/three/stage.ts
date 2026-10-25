import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { save } from '../state';

/**
 * The 3D layer. It sits underneath the (transparent) 2D game canvas and
 * draws robots, enemies and the world. The camera is set up so that the
 * z = 0 plane lines up exactly with the 2D game's 1280×720 screen: one
 * world unit is one 48px tile, and y is flipped (2D y grows downward).
 */

export const UNIT = 48;
const SCREEN_W = 1280;
const SCREEN_H = 720;
const FOV = 35;
/** Distance at which the view is exactly 15 units (720px) tall. */
export const CAM_DIST = (SCREEN_H / UNIT / 2) / Math.tan(((FOV / 2) * Math.PI) / 180);

export type Quality = 'high' | 'med' | 'low';

export const px2w = (px: number) => px / UNIT;
export const py2w = (py: number) => -py / UNIT;

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, SCREEN_W / SCREEN_H, 0.5, 400);
  readonly key: THREE.DirectionalLight;
  readonly content = new THREE.Group();
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private updaters = new Set<(dt: number) => void>();
  private active = false;
  private clearedOnce = false;
  quality: Quality;
  private forced: boolean;
  private frameTimes: number[] = [];
  private cssW = SCREEN_W;
  private cssH = SCREEN_H;

  constructor(readonly canvas: HTMLCanvasElement) {
    const q = new URLSearchParams(window.location.search).get('quality') as Quality | null;
    this.forced = q === 'high' || q === 'med' || q === 'low';
    this.quality = this.forced ? q! : save().graphics === 'fast' ? 'low' : 'med';

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Reflections for all the shiny metal come from a soft studio environment.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x2a1a24, 0.55));
    this.key = new THREE.DirectionalLight(0xfff0dd, 2.6);
    this.key.position.set(6, 12, 10);
    this.key.shadow.mapSize.set(1024, 1024);
    const sc = this.key.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 60;
    this.key.shadow.bias = -0.0006;
    this.scene.add(this.key, this.key.target);
    const rim = new THREE.DirectionalLight(0x4cc9f0, 2.2);
    rim.position.set(-8, 5, -10);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0xff8c6b, 0.7);
    fill.position.set(-10, -2, 8);
    this.scene.add(fill);

    this.scene.add(this.content);
    this.setCameraPx(0, 0);
    this.applyQuality();
  }

  private applyQuality() {
    const dpr = window.devicePixelRatio || 1;
    const ratio = this.quality === 'high' ? Math.min(dpr, 2) : this.quality === 'med' ? Math.min(dpr, 1.5) : 1;
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.key.castShadow = this.quality !== 'low';
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    if (this.quality !== 'low') {
      const composer = new EffectComposer(this.renderer);
      composer.addPass(new RenderPass(this.scene, this.camera));
      const res = new THREE.Vector2(this.cssW, this.cssH).multiplyScalar(this.quality === 'high' ? 0.5 : 0.35);
      this.bloom = new UnrealBloomPass(res, 0.5, 0.4, 0.92);
      composer.addPass(this.bloom);
      composer.addPass(new OutputPass());
      this.composer = composer;
    }
    this.resize(this.cssW, this.cssH);
  }

  /** Switch between adaptive quality ('best') and the cheapest look ('fast'). */
  setGraphics(mode: 'best' | 'fast') {
    if (new URLSearchParams(window.location.search).has('quality')) return;
    this.forced = mode === 'fast';
    this.quality = mode === 'fast' ? 'low' : 'med';
    this.frameTimes = [];
    this.applyQuality();
  }

  resize(w: number, h: number) {
    this.cssW = Math.max(1, Math.round(w));
    this.cssH = Math.max(1, Math.round(h));
    this.renderer.setSize(this.cssW, this.cssH, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(this.cssW, this.cssH);
  }

  /**
   * Point the camera at the same spot as the 2D camera. Like the 2D camera,
   * the view centre is scroll + half the screen, whatever the zoom.
   */
  setCameraPx(scrollX: number, scrollY: number, zoom = 1) {
    const cx = px2w(scrollX + SCREEN_W / 2);
    const cy = py2w(scrollY + SCREEN_H / 2);
    this.camera.position.set(cx, cy, CAM_DIST / zoom);
    this.camera.lookAt(cx, cy, 0);
    this.key.position.set(cx + 6, cy + 12, 10);
    this.key.target.position.set(cx, cy, 0);
  }

  /** Remove everything from the previous screen. */
  clear() {
    this.updaters.clear();
    for (const child of [...this.content.children]) {
      child.removeFromParent();
      disposeTree(child);
    }
    this.scene.background = null;
    this.scene.fog = null;
    this.active = false;
    this.clearedOnce = false;
    // The arcade shooter changes the lens; put it back.
    this.camera.fov = FOV;
    this.camera.near = 0.5;
    this.camera.far = 400;
    this.camera.updateProjectionMatrix();
    this.setCameraPx(0, 0);
  }

  /** Start drawing again; call after adding things to `content`. */
  activate(background: THREE.Color | THREE.Texture, fog?: THREE.Fog) {
    this.scene.background = background;
    this.scene.fog = fog ?? null;
    this.active = true;
  }

  onUpdate(fn: (dt: number) => void) {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  frame(dt: number) {
    if (!this.active) {
      if (!this.clearedOnce) {
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.clear();
        this.clearedOnce = true;
      }
      return;
    }
    const step = Math.min(dt, 0.05);
    for (const fn of this.updaters) fn(step);
    if (this.composer) this.composer.render(step);
    else this.renderer.render(this.scene, this.camera);
    this.watchSpeed(dt);
  }

  /** Drop to a cheaper quality if frames are consistently slow. */
  private watchSpeed(dt: number) {
    if (this.forced || this.quality === 'low') return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (avg > 1 / 40) {
      this.quality = this.quality === 'high' ? 'med' : 'low';
      this.applyQuality();
    }
  }
}

export function disposeTree(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    // Geometry is shared and cached, so only per-object materials are freed.
    if (m.material && (m.material as THREE.Material).userData?.disposable) (m.material as THREE.Material).dispose();
  });
}

let stage: Stage | null = null;

/** The 3D layer, created on first use under the given 2D game canvas. */
export function getStage(gameCanvas?: HTMLCanvasElement): Stage {
  if (!stage) {
    if (!gameCanvas?.parentElement) throw new Error('Stage not initialised');
    initStage(gameCanvas.parentElement, gameCanvas);
  }
  return stage!;
}

export function hasStage() {
  return stage !== null;
}

/** Create the 3D canvas under the 2D game canvas and keep their sizes in sync. */
export function initStage(parent: HTMLElement, gameCanvas: HTMLCanvasElement): Stage {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.zIndex = '0';
  canvas.style.pointerEvents = 'none';
  parent.style.position = 'relative';
  parent.insertBefore(canvas, parent.firstChild);
  gameCanvas.style.position = 'relative';
  gameCanvas.style.zIndex = '1';

  stage = new Stage(canvas);
  const sync = () => {
    const pr = parent.getBoundingClientRect();
    const r = gameCanvas.getBoundingClientRect();
    canvas.style.left = `${r.left - pr.left}px`;
    canvas.style.top = `${r.top - pr.top}px`;
    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;
    stage!.resize(r.width, r.height);
  };
  new ResizeObserver(sync).observe(gameCanvas);
  // The 2D canvas is re-centred after the window settles, so sync again a moment later.
  window.addEventListener('resize', () => {
    sync();
    setTimeout(sync, 120);
  });
  sync();
  return stage;
}
