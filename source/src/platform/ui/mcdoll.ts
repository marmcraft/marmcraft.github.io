import * as THREE from 'three';
import type { ModelSpec } from '../api/types';
import { boxGeometry } from '../render/entities';

/**
 * The player in their own inventory, as Minecraft shows them: their figure, live, its head (and a
 * little of its body) turned toward the pointer. A box figure in its skin, drawn by a small
 * renderer of its own onto the canvas the inventory gives it.
 */
/** A piece of what the figure wears: its model (the game's own, shared), the box part it hangs on, and where on the figure its origin goes (texels). */
export interface DollWear {
  key: string;
  part: string;
  pivot: [number, number, number];
  geometry: THREE.BufferGeometry;
  map: THREE.Texture;
  /** How it's turned on its part (a quaternion), brought to a size (`fit`: its shape's own width, in blocks), and whether it's its middle or its own origin that goes on the spot. */
  turn?: readonly [number, number, number, number];
  fit?: number;
  centered?: boolean;
}

export class McDoll {
  readonly canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer | null = null;
  private failed = false;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-0.75, 0.75, 2.05, -0.1, 0.1, 20);
  private figure: THREE.Group | null = null;
  private head: THREE.Object3D | null = null;
  private key = '';
  /** What frees a figure lent by the world (`set`'s `jointed`), while there's one. */
  private lent: (() => void) | null = null;
  private map: THREE.DataTexture | null = null;
  /** Where the pointer is from the figure's face: across and up, each about -1 to 1. */
  private aim = { x: 0, y: 0 };
  private turned = { x: 0, y: 0 };
  /** How far round it's been turned by hand (radians), over the little it turns to follow the pointer. */
  spin = 0;
  /** Its parts by name, and how each is turned at rest: what a gesture moves, and puts back. */
  private parts = new Map<string, { node: THREE.Object3D; rest: THREE.Euler; at: THREE.Vector3 }>();
  /** A gesture under way (`play`): which, and how long it's been going (seconds). */
  private gesture: { name: string; t: number } | null = null;
  private clock = 0;
  /** Whether it stands easy when nothing else is asked of it (breathing, its arms a little loose): the inventory's own stands still. */
  easy = false;
  /** The light it stands in (what its colours are multiplied by): white shows the skin's own colours, as the inventory does. */
  readonly light = new THREE.Color(1, 1, 1);
  /** How high the view reaches (blocks from its feet): a tall hat needs more than a head does. */
  top = 2.05;
  /** How low the view reaches (blocks from its feet): -0.1 its feet; more, cut off above them (a hat's viewer shows head and shoulders). */
  bottom = -0.1;

  constructor() {
    this.camera.position.set(0, 0, 6);
    this.canvas.className = 'mcinv-doll-view';
  }

  /** The figure to show: a box model and the skin sheet it's cut from (built again only when they change). */
  /**
   * `jointed`: the figure as the world has it, where it can be had so (`EntityGraphics.dollFigure`): one skin on joints, with elbows
   * and knees and its second layer in 3D. Without it (or where it gives none), a box for each part, stiff, as the inventory's is.
   */
  set(spec: ModelSpec, atlas: { name: string; width: number; height: number; pixels: Uint8Array }, wear: readonly DollWear[] = [], jointed?: (spec: ModelSpec) => { root: THREE.Group; joints: Map<string, THREE.Object3D>; mesh: THREE.SkinnedMesh; dispose(): void } | null) {
    const key = `${jointed ? 'jointed|' : ''}${atlas.name}|${JSON.stringify(spec.parts)}|${wear.map((w) => `${w.key}@${w.part}@${w.pivot.join(' ')}@${w.turn?.join(' ') ?? ''}@${w.fit ?? ''}`).join(',')}`;
    if (key === this.key) return;
    this.key = key;
    this.clear();
    this.map = new THREE.DataTexture(atlas.pixels, atlas.width, atlas.height, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.map.colorSpace = THREE.SRGBColorSpace;
    this.map.magFilter = this.map.minFilter = THREE.NearestFilter;
    this.map.flipY = false;
    this.map.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial({ map: this.map, transparent: true, alphaTest: 0.5 });
    const limber = jointed?.(spec) ?? null;
    const root = limber?.root ?? new THREE.Group();
    const pivots = new Map<string, THREE.Object3D>();
    // Where each part's own pivot is from what it hangs on here (texels): nothing for a box on its own pivot; on joints, a part
    // hangs from the joint that carries it (the body from the chest, a little above its own pivot).
    const from = new Map<string, [number, number, number]>();
    if (limber) {
      limber.mesh.material = new THREE.MeshBasicMaterial({ map: this.map, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
      this.lent = limber.dispose;
      root.updateMatrixWorld(true);
      const at = new THREE.Vector3();
      const scale = spec.scale ?? 1;
      for (const [part, joint] of [['head', 'head'], ['body', 'chest'], ['armR', 'upperArmR'], ['armL', 'upperArmL'], ['legR', 'upperLegR'], ['legL', 'upperLegL']] as const) {
        const node = limber.joints.get(joint);
        const p = spec.parts.find((q) => q.name === part);
        if (!node || !p) continue;
        pivots.set(part, node);
        node.getWorldPosition(at);
        from.set(part, [p.pivot[0] - (at.x * 16) / scale, p.pivot[1] - (at.y * 16) / scale, p.pivot[2] - (at.z * 16) / scale]);
      }
      // (And the joints a box figure hasn't: what a gesture bends.)
      for (const joint of ['lowerArmR', 'lowerArmL', 'lowerLegR', 'lowerLegL']) {
        const node = limber.joints.get(joint);
        if (node) pivots.set(joint, node);
      }
    }
    // (Parents first: a hat hangs from the head.)
    for (const p of limber ? [] : [...spec.parts].sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0))) {
      const pivot = new THREE.Object3D();
      pivot.position.set(p.pivot[0] / 16, p.pivot[1] / 16, p.pivot[2] / 16);
      const r = p.rotation ?? [0, 0, 0];
      pivot.rotation.set(r[0], r[1], r[2]);
      const mesh = new THREE.Mesh(boxGeometry(p, atlas.width, atlas.height), material);
      mesh.position.set((p.offset[0] + p.size[0] / 2) / 16, (p.offset[1] + p.size[1] / 2) / 16, (p.offset[2] + p.size[2] / 2) / 16);
      pivot.add(mesh);
      (p.parent ? (pivots.get(p.parent) ?? root) : root).add(pivot);
      pivots.set(p.name, pivot);
    }
    // What they wear: each piece's own model on the part it covers, where Minecraft hinges that part.
    for (const w of wear) {
      const pivot = pivots.get(w.part);
      const part = spec.parts.find((q) => q.name === w.part);
      if (!pivot || !part) continue;
      const mesh = new THREE.Mesh(w.geometry, new THREE.MeshBasicMaterial({ map: w.map, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
      // (The piece's models and pictures are the game's own, shared: not freed with the figure.)
      mesh.userData.shared = true;
      const off = from.get(w.part) ?? [0, 0, 0];
      mesh.position.set((w.pivot[0] - part.pivot[0] + off[0]) / 16, (w.pivot[1] - part.pivot[1] + off[1]) / 16, (w.pivot[2] - part.pivot[2] + off[2]) / 16);
      if (w.turn) mesh.quaternion.set(w.turn[0], w.turn[1], w.turn[2], w.turn[3]);
      if (w.fit || w.centered) {
        w.geometry.boundingSphere ?? w.geometry.computeBoundingSphere();
        const ball = w.geometry.boundingSphere!;
        if (w.fit) mesh.scale.setScalar(w.fit / Math.max(0.05, ball.radius * 2));
        // (Its middle on the spot: moved back by where its middle is, as it's turned and sized.)
        if (w.centered) mesh.position.sub(ball.center.clone().multiplyScalar(mesh.scale.x).applyQuaternion(mesh.quaternion));
      }
      pivot.add(mesh);
    }
    if (!limber) root.scale.setScalar(spec.scale ?? 1);
    this.figure = root;
    this.parts = new Map([...pivots].map(([name, node]) => [name, { node, rest: node.rotation.clone(), at: node.position.clone() }]));
    this.head = pivots.get('head') ?? null;
    this.scene.add(root);
  }

  /** Where the pointer is on the page: the figure looks that way. */
  look(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    this.aim.x = Math.max(-1, Math.min(1, (clientX - (r.left + r.width / 2)) / (r.width * 2.5)));
    this.aim.y = Math.max(-1, Math.min(1, (r.top + r.height * 0.22 - clientY) / (r.height * 1.6)));
  }

  /** How long each gesture takes (seconds). */
  static readonly GESTURES: Record<string, number> = { wave: 2.4, stretch: 3.2, cheer: 1.8, bow: 2.2, shrug: 1.6 };

  /** A gesture, from its start: a wave, a stretch, a cheer, a bow, a shrug. It plays once over whatever it was doing. */
  play(name: string) {
    if (McDoll.GESTURES[name]) this.gesture = { name, t: 0 };
  }

  /** The parts as the gesture under way (and standing easy) has them this frame. Arms hang along -y from their shoulders; the right is at -x. */
  private pose(dt: number) {
    this.clock += dt;
    const p = (name: string) => this.parts.get(name);
    for (const part of this.parts.values()) {
      part.node.rotation.copy(part.rest);
      part.node.position.copy(part.at);
    }
    if (this.figure) this.figure.position.y = 0;
    const [armR, armL, legR, legL, body] = [p('armR'), p('armL'), p('legR'), p('legL'), p('body')];
    // (Elbows and knees, where the figure has them: on joints.)
    const [foreR, foreL, shinR, shinL] = [p('lowerArmR'), p('lowerArmL'), p('lowerLegR'), p('lowerLegL')];
    const t = this.clock;
    if (this.easy) {
      // Standing easy: the arms a little loose and never quite still.
      const sway = Math.sin(t * 1.4) * 0.035;
      if (armR) armR.node.rotation.z += -0.05 - sway;
      if (armL) armL.node.rotation.z += 0.05 + sway;
      if (armR) armR.node.rotation.x += Math.sin(t * 0.9) * 0.03;
      if (armL) armL.node.rotation.x -= Math.sin(t * 0.9) * 0.03;
      // (No arm hangs quite straight.)
      if (foreR) foreR.node.rotation.x += -0.1 - Math.sin(t * 0.9 + 0.6) * 0.04;
      if (foreL) foreL.node.rotation.x += -0.1 + Math.sin(t * 0.9 + 0.6) * 0.04;
    }
    const g = this.gesture;
    if (!g) return;
    const long = McDoll.GESTURES[g.name] ?? 1;
    g.t += dt;
    if (g.t >= long) return void (this.gesture = null);
    // (Into it and out of it by degrees: a quarter of a second each end.)
    const k = Math.min(1, g.t / 0.28, (long - g.t) / 0.28);
    const e = k * k * (3 - 2 * k);
    if (g.name === 'wave') {
      if (armR) {
        // (With an elbow, it's the forearm that goes to and fro, the arm held up; without, the whole arm.)
        armR.node.rotation.z += (foreR ? -2.3 : -2.55 + Math.sin(g.t * 11) * 0.32) * e;
        armR.node.rotation.x += -0.15 * e;
      }
      if (foreR) foreR.node.rotation.z += (-0.45 + Math.sin(g.t * 11) * 0.45) * e;
      if (this.head) this.head.rotation.z += Math.sin(g.t * 5.5) * 0.06 * e;
    } else if (g.name === 'stretch') {
      // Both arms up and back, a lean with them, a little shake at the top.
      const top = Math.max(0, Math.sin((g.t / long) * Math.PI)) ** 0.6;
      const shake = Math.sin(g.t * 14) * 0.03 * top;
      if (armR) armR.node.rotation.set(armR.rest.x - 2.95 * top * e, armR.rest.y, armR.rest.z - (0.35 + shake) * top * e);
      if (armL) armL.node.rotation.set(armL.rest.x - 2.95 * top * e, armL.rest.y, armL.rest.z + (0.35 + shake) * top * e);
      if (this.head) this.head.rotation.x += -0.3 * top * e;
      if (this.figure) this.figure.position.y = 0.03 * top * e;
    } else if (g.name === 'cheer') {
      const hop = Math.abs(Math.sin(g.t * 7));
      if (armR) armR.node.rotation.z += -2.7 * e;
      if (armL) armL.node.rotation.z += 2.7 * e;
      if (this.figure) this.figure.position.y = hop * 0.12 * e;
      if (legR) legR.node.rotation.x += Math.sin(g.t * 7) * 0.15 * e;
      if (legL) legL.node.rotation.x -= Math.sin(g.t * 7) * 0.15 * e;
      if (foreR) foreR.node.rotation.z += -0.35 * e;
      if (foreL) foreL.node.rotation.z += 0.35 * e;
      if (shinR) shinR.node.rotation.x += Math.max(0, Math.sin(g.t * 7)) * 0.3 * e;
      if (shinL) shinL.node.rotation.x += Math.max(0, -Math.sin(g.t * 7)) * 0.3 * e;
    } else if (g.name === 'bow') {
      const down = Math.sin((g.t / long) * Math.PI) * e;
      if (body) body.node.rotation.x += 0.5 * down;
      if (this.head) {
        this.head.rotation.x += 0.75 * down;
        this.head.position.z += 0.2 * down;
        this.head.position.y -= 0.1 * down;
      }
      if (armR) armR.node.rotation.x += -0.45 * down;
      if (armL) armL.node.rotation.x += -0.45 * down;
      if (armR) armR.node.position.z += 0.16 * down;
      if (armL) armL.node.position.z += 0.16 * down;
    } else if (g.name === 'shrug') {
      const up = Math.sin((g.t / long) * Math.PI) * e;
      if (armR) armR.node.rotation.z += -0.55 * up;
      if (armL) armL.node.rotation.z += 0.55 * up;
      if (armR) armR.node.rotation.x += -0.5 * up;
      if (armL) armL.node.rotation.x += -0.5 * up;
      // (Hands turned out and up, the forearms bent: what a shrug is.)
      if (foreR) foreR.node.rotation.x += -1.1 * up;
      if (foreL) foreL.node.rotation.x += -1.1 * up;
      if (this.head) this.head.rotation.z += 0.18 * up;
    }
  }

  /** Draw it (call each frame it's on show); `dt` seconds since the last. */
  draw(dt: number) {
    if (!this.figure) return;
    const w = this.canvas.clientWidth * (window.devicePixelRatio || 1);
    const h = this.canvas.clientHeight * (window.devicePixelRatio || 1);
    if (!w || !h) return;
    if (!this.renderer && !this.failed) {
      try {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: false });
        this.renderer.setClearColor(0x000000, 0);
      } catch {
        this.failed = true;
      }
    }
    if (!this.renderer) return;
    if (this.canvas.width !== Math.round(w) || this.canvas.height !== Math.round(h)) this.renderer.setSize(Math.round(w), Math.round(h), false);
    const half = (((this.top - this.bottom) / 2) * w) / h;
    this.camera.left = -half;
    this.camera.right = half;
    this.camera.top = this.top;
    this.camera.bottom = this.bottom;
    this.camera.updateProjectionMatrix();
    // (Eased round: the head most of the way, the body a little.)
    const k = Math.min(1, dt * 12);
    this.turned.x += (this.aim.x - this.turned.x) * k;
    this.turned.y += (this.aim.y - this.turned.y) * k;
    this.figure.rotation.y = this.turned.x * 0.45 + this.spin;
    this.pose(dt);
    if (this.head) {
      this.head.rotation.y += this.turned.x * 0.7;
      this.head.rotation.x += -this.turned.y * 0.55;
    }
    // (Its colours in the light it's given: every piece of it alike.)
    this.figure.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (m?.color && !m.color.equals(this.light)) m.color.copy(this.light);
    });
    this.renderer.render(this.scene, this.camera);
  }

  /** Done with it: its figure and its renderer let go of. */
  dispose() {
    this.clear();
    this.key = '';
    this.renderer?.dispose();
    this.renderer = null;
  }

  private clear() {
    if (this.figure) {
      this.scene.remove(this.figure);
      this.figure.traverse((o) => {
        if (o instanceof THREE.Mesh && !o.userData.shared) o.geometry.dispose();
        else if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
      });
    }
    this.lent?.();
    this.lent = null;
    this.map?.dispose();
    this.figure = this.head = null;
  }
}
