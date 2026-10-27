import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * The 3D view: one renderer and camera, a sky, soft cartoon lighting, and a
 * glow pass ("bloom") that makes horns, sparkles and rainbows shine. Each
 * place in the game (the ranch, a trail, the race) puts its things in
 * `world` and is swapped out by clearing it.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 600);
  readonly world = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private updaters = new Set<(dt: number) => void>();
  private last = performance.now();
  private slowFrames = 0;
  private lowQuality = false;
  /** Game time runs at this speed (slow motion is less than 1). */
  timeScale = 1;
  /** Game-clock seconds since start (slows down with timeScale). */
  time = 0;

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    parent.appendChild(this.renderer.domElement);
    Object.assign(this.renderer.domElement.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', display: 'block' });

    this.hemi = new THREE.HemisphereLight(0xdff3ff, 0x7fb86a, 1.0);
    this.sun = new THREE.DirectionalLight(0xfff2dd, 1.7);
    this.sun.position.set(30, 50, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 150;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.world);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(0x6fb8ff) },
          mid: { value: new THREE.Color(0xbfe6ff) },
          bottom: { value: new THREE.Color(0xffd6ec) },
        },
        vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
          void main(){ float h = vP.y;
          vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.55, h)) : mix(mid, bottom, smoothstep(0.0, 0.2, -h));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }`,
      }),
    );
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(0xcfe9ff, 60, 260);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.45, 0.97);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.resize();
    const tick = () => {
      requestAnimationFrame(tick);
      this.frame();
    };
    requestAnimationFrame(tick);
  }

  /** Pastel sky colors (top of the sky, horizon, below the horizon) and fog. */
  setSky(top: number, mid: number, bottom: number, fog = mid, near = 60, far = 260): void {
    const u = this.sky.material.uniforms;
    u.top.value.set(top);
    u.mid.value.set(mid);
    u.bottom.value.set(bottom);
    const f = this.scene.fog as THREE.Fog;
    f.color.set(fog);
    f.near = near;
    f.far = far;
  }

  /** Run this every frame (with game-clock seconds) until the returned function is called. */
  onFrame(fn: (dt: number) => void): () => void {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  /** Empty the world and stop every per-frame job: moving to a new place. */
  clear(): void {
    this.updaters.clear();
    this.timeScale = 1;
    this.hemi.intensity = 1.0;
    this.sun.intensity = 1.7;
    for (const c of [...this.world.children]) {
      this.world.remove(c);
      dispose(c);
    }
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // Keep the scene from feeling cramped in portrait.
    this.camera.fov = w / h < 1 ? 70 : 50;
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const now = performance.now();
    const real = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const dt = real * this.timeScale;
    this.time += dt;
    for (const fn of [...this.updaters]) fn(dt);
    this.sky.position.copy(this.camera.position);
    this.watchSpeed(real);
    if (this.lowQuality) this.renderer.render(this.scene, this.camera);
    else this.composer.render(real);
  }

  /** On a slow device, drop the glow and the extra-sharp pixels. */
  private watchSpeed(real: number): void {
    if (this.lowQuality) return;
    this.slowFrames = real > 1 / 35 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 90) {
      this.lowQuality = true;
      this.renderer.setPixelRatio(1);
      this.resize();
    }
  }
}

export function dispose(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      if (mat.userData.shared) continue;
      (mat as THREE.MeshBasicMaterial).map?.dispose();
      mat.dispose();
    }
  });
}

/** A 3-step light ramp for the cartoon (toon) materials. */
let ramp: THREE.DataTexture | null = null;
export function toonRamp(): THREE.DataTexture {
  if (!ramp) {
    ramp = new THREE.DataTexture(new Uint8Array([165, 165, 165, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 3, 1);
    ramp.minFilter = THREE.NearestFilter;
    ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
  }
  return ramp;
}

export function toon(color: THREE.ColorRepresentation, extra: Partial<THREE.MeshToonMaterialParameters> = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...extra });
}

export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}
