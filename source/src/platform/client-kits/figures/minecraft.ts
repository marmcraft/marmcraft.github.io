import type { Client, ClientKit, Figure, FigureHeld, FigureRig } from '@platform/client';
import { Euler, Mat4, Quat, Vec3 } from '@platform/client/math';
import { inFist } from './held';

/**
 * Box figures with whole arms and legs (\`ModelSpec.limbs: 'solid'\`) moved as Minecraft moves its
 * players (\`HumanoidModel.setupAnim\`): legs and arms swung from the hip and shoulder as they walk and
 * run (\`cos(limbSwing * 0.6662) * 1.4 * amount\` for a leg, half that and opposite for an arm), the
 * arms swaying a little while they stand, the body tipped forward to sneak, an arm swung down to
 * hit or build, an arm raised a little while something's held, the head turned where they look,
 * and a fall onto their side when they die. The body never bends: it's one box.
 *
 * List it before \`figures.humanoid()\`: that kit leaves these figures to it.
 */
export function minecraft(): ClientKit {
  const animators = new WeakMap<Figure, Animator>();
  return {
    name: 'figures.minecraft',
    frame(client: Client) {
      for (const fig of client.figures.all) {
        if (!fig.rig || fig.spec.limbs !== 'solid') continue;
        let a = animators.get(fig);
        if (!a) animators.set(fig, (a = new Animator(fig, fig.rig)));
        a.frame();
        fig.posed = true;
      }
    },
  };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** Minecraft's ticks a second: its walk is worked out a tick at a time. */
const TPS = 20;
/** How long a swing of the arm takes (Minecraft's six ticks). */
const SWING = 6 / TPS;
/** How long the fall onto their side takes when they die (Minecraft's twenty ticks). */
const DEATH = 1;

const e1 = new Euler(0, 0, 0, 'YXZ');
const q1 = new Quat();
const q2 = new Quat();
const m1 = new Mat4();
const v1 = new Vec3();
/** A turn from Minecraft's angles (x tips forward, y turns, z rolls), each as its model applies them. */
const rot = (out: Quat, x: number, y = 0, z = 0) => out.setFromEuler(e1.set(x, y, z, 'ZYX'));

class Animator {
  /** Minecraft's \`limbSwing\` (how far the walk has gone) and \`limbSwingAmount\` (how much it shows, eased). */
  private pos = 0;
  private amount = 0;
  private last = -1;
  private heldFrom: FigureHeld | null = null;

  constructor(
    private fig: Figure,
    private rig: FigureRig,
  ) {}

  frame() {
    const s = this.fig.state;
    const dt = this.last < 0 ? 0 : clamp(s.time - this.last, 0, 0.1);
    this.last = s.time;
    const j = this.rig.joints;
    const rest = this.rig.rest;
    for (const name of Object.keys(rest) as (keyof typeof rest)[]) {
      j[name].position.copy(rest[name].position);
      j[name].quaternion.copy(rest[name].quaternion);
    }

    // The walk: \`amount\` eases toward how fast they're going (four times the blocks a tick, at most 1),
    // and \`pos\` runs on by it each tick: a walk shows about 0.86 of it, a sprint all of it.
    const want = Math.min(1, ((s.speed ?? 0) / TPS) * 4);
    this.amount += (want - this.amount) * (1 - Math.pow(0.6, dt * TPS));
    this.pos += this.amount * dt * TPS;
    const sw = this.pos * 0.6662;
    const amt = this.amount;
    const age = s.time * TPS;
    const crouch = clamp(s.posture, 0, 1);
    const held = !!this.fig.held;

    // Dying: over onto their side, as Minecraft's fall is (the whole of them, about their feet).
    if (s.dying > 0) {
      const t = clamp(s.dying / DEATH, 0, 1);
      const fall = Math.sqrt(t) * (Math.PI / 2);
      rot(q1, 0, 0, fall);
      j.hips.quaternion.multiply(q1);
      this.hand();
      return;
    }

    // Legs from the hips, each the other way to the other; arms the other way to their own side's leg, half as far.
    // (Minecraft's angles as they are: this rig, too, swings a hanging limb forward for a negative turn about x.)
    const legR = Math.cos(sw) * 1.4 * amt;
    const legL = Math.cos(sw + Math.PI) * 1.4 * amt;
    let armRx = Math.cos(sw + Math.PI) * 2 * amt * 0.5;
    let armLx = Math.cos(sw) * 2 * amt * 0.5;
    // Standing about, the arms sway a little out from the body and back, and forward and back.
    const sway = Math.cos(age * 0.09) * 0.05 + 0.05;
    let armRz = -sway;
    const armLz = sway;
    armRx += Math.sin(age * 0.067) * 0.05;
    armLx -= Math.sin(age * 0.067) * 0.05;
    // Something in hand: that arm raised a little, and it swings less.
    if (held) armRx = armRx * 0.5 - Math.PI / 10;
    // A swing (hitting, building): the arm brought down from over the shoulder, across the body, the body turned with it.
    let bodyY = 0;
    const a = s.attackT < SWING ? s.attackT / SWING : 1;
    if (a < 1) {
      bodyY = Math.sin(Math.sqrt(a) * Math.PI * 2) * 0.2;
      const f = 1 - Math.pow(1 - a, 4);
      const pitch = clamp(s.headPitch, -1.2, 1.2);
      armRx -= Math.sin(f * Math.PI) * 1.2 + Math.sin(a * Math.PI) * -(pitch - 0.7) * 0.75;
      armRz += Math.sin(a * Math.PI) * 0.4;
    }
    // Sneaking: the body tipped forward (the arms go with it, on its shoulders), the hips down.
    const bodyX = 0.5 * crouch;
    j.hips.position.y -= 0.14 * crouch;

    rot(q1, bodyX, bodyY, 0);
    j.spine.quaternion.multiply(q1);
    rot(q1, armRx, 0, armRz);
    j.upperArmR.quaternion.multiply(q1);
    rot(q1, armLx, 0, armLz);
    j.upperArmL.quaternion.multiply(q1);
    rot(q1, legR, 0, 0);
    j.upperLegR.quaternion.multiply(q1);
    rot(q1, legL, 0, 0);
    j.upperLegL.quaternion.multiply(q1);

    // The head where they look, whatever the body's doing.
    this.rig.body.updateWorldMatrix(true, false);
    this.rig.root.updateMatrixWorld(true);
    const bodyQ = this.rig.body.getWorldQuaternion(q2);
    q1.setFromEuler(e1.set(clamp(s.headPitch, -1.4, 1.4), s.headYaw, 0, 'YXZ')).premultiply(bodyQ);
    j.neck.getWorldQuaternion(q2);
    j.head.quaternion.copy(q2.invert().multiply(q1));
    this.hand();
  }

  /** What's in hand, in the right fist (placed on the chest where the fist is, as the humanoid kit does). */
  private hand() {
    const h = this.fig.held;
    if (h !== this.heldFrom) {
      this.heldFrom = h;
      if (h) inFist(h);
    }
    if (!h) return;
    const j = this.rig.joints;
    const mount = h.mount;
    if (mount.parent !== j.chest) j.chest.add(mount);
    mount.visible = true;
    j.gripR.updateWorldMatrix(true, false);
    j.chest.updateWorldMatrix(true, false);
    m1.copy(j.chest.matrixWorld).invert().multiply(j.gripR.matrixWorld).decompose(mount.position, mount.quaternion, v1);
    mount.updateMatrixWorld(true);
  }
}
