// A tree the player is working on. Lifecycle:
//   standing  - detached from the forest instances; notches carve the trunk (Notch bands, clip-hidden bark)
//   creaking  - remaining hinge is close to failing: it groans, sways, needles sift down
//   falling   - a dynamic Rapier body pivoting on a revolute hinge at the notch, released at ~35 degrees
//   fallen    - lying on its branches: limb it (branch_<id> children come off as debris), buck it into sections;
//               any section without branches becomes a clean WoodPiece log
import * as THREE from 'three';
import { physics, RAPIER, GROUP, groups } from '../physics/physics';
import { Notch, clipMaterial, clipDepthMaterial, type StrikeType } from './notch';
import type { TreeLike, TreeRefLike, BranchInfo } from './types';
import { WoodPiece, DENSITY, type StemSample } from './wood';
import { debris, puffs } from '../gfx/particles';
import { WOOD, type Species } from './woodtex';
import { heightAt } from '../world/layout';

export type TreeState = 'standing' | 'creaking' | 'falling' | 'fallen' | 'gone';

export interface TreeEvents {
  sound(id: string, pos: THREE.Vector3, vol?: number, rate?: number): void;
  shake(amount: number, pos: THREE.Vector3): void;
  /** the falling stem passes the player: returns true if the player was struck */
  crushCheck(seg0: THREE.Vector3, seg1: THREE.Vector3, r: number, speed: number): void;
  spawnPiece(p: WoodPiece): void;
  felled(t: ChopTree): void;
}

interface Section {
  y0: number; y1: number;
  root: THREE.Group;          // synced to body
  object: THREE.Object3D;     // clone of the tree object, offset so stem-local coords work
  trunk: THREE.Mesh | null;
  clip: ReturnType<typeof clipMaterial> | null;
  body: RAPIER.RigidBody | null;
  branches: Map<string, { obj: THREE.Object3D; info: BranchInfo; dmg: number }>;
  caps: THREE.Object3D[];
}

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

export class ChopTree {
  readonly ref: TreeRefLike;
  readonly model: TreeLike;
  readonly species: Species;
  readonly scale: number;
  /** world-space group at the tree base (rotY + scale applied) */
  readonly root = new THREE.Group();
  state: TreeState = 'standing';
  notches: Notch[] = [];
  /** 0..1, how close the hinge is to failing */
  tension = 0;
  rotten: boolean;
  protectedTree: boolean;
  private object: THREE.Object3D;
  private barkMat: THREE.Material | null = null;
  private trunk: THREE.Mesh | null = null;
  private clip: ReturnType<typeof clipMaterial> | null = null;
  private sway = 0;
  private swayV = 0;
  private fallDir = new THREE.Vector2(1, 0);
  private creakT = 0;
  private stumpBody: RAPIER.RigidBody | null = null;
  private stumpCol: RAPIER.Collider | null = null;
  private joint: RAPIER.ImpulseJoint | null = null;
  private landed = false;
  private fallT = 0;
  private cutY = 0;
  sections: Section[] = [];
  private ev: TreeEvents;
  private stem: StemSample[];

  constructor(ref: TreeRefLike, model: TreeLike, object: THREE.Object3D, ev: TreeEvents, flags: { rotten?: boolean; protected?: boolean } = {}) {
    this.ref = ref; this.model = model; this.species = model.species; this.scale = ref.scale; this.ev = ev;
    this.rotten = !!flags.rotten; this.protectedTree = !!flags.protected;
    this.object = object;
    this.root.position.set(ref.x, ref.y, ref.z);
    this.root.rotation.y = ref.rotY;
    this.root.scale.setScalar(ref.scale);
    this.root.add(object);
    this.stem = model.trunk.map((s) => ({ ...s }));
    this.trunk = (object.getObjectByName('trunk') as THREE.Mesh) ?? null;
    if (this.trunk) {
      this.barkMat = this.trunk.material as THREE.Material;
      this.clip = clipMaterial(this.barkMat);
      this.trunk.material = this.clip.mat;
      this.trunk.customDepthMaterial = clipDepthMaterial(this.clip.bands, this.clip.keep);
    }
  }

  /** world point -> trunk-local */
  toLocal(p: THREE.Vector3): THREE.Vector3 { return this.object.worldToLocal(p.clone()); }

  /** current stem-local height of the first notch (for the falling pivot) */
  private notchAt(y: number): Notch {
    for (const n of this.notches) if (Math.abs(n.y - y) < 0.22) return n;
    if (this.notches.length >= 2) {
      // the third distinct height: reuse the nearest
      return this.notches.reduce((a, b) => (Math.abs(a.y - y) < Math.abs(b.y - y) ? a : b));
    }
    const prof = { radiusAt: (yy: number) => this.model.radiusAt(yy), outlineAt: this.model.outlineAt?.bind(this.model) };
    const bark = this.barkMat ?? new THREE.MeshStandardMaterial({ color: 0x554433 });
    const n = new Notch(y, prof, this.species, bark);
    const c = this.model.centerAt(y);
    n.mesh.position.set(c[0], 0, c[1]);
    this.object.add(n.mesh);
    this.notches.push(n);
    this.updateClip();
    return n;
  }

  private updateClip(): void {
    if (!this.clip) return;
    this.notches.forEach((n, i) => {
      const [a, b] = n.band;
      this.clip!.bands[0].setComponent(i * 2, a);
      this.clip!.bands[0].setComponent(i * 2 + 1, b);
    });
  }

  /**
   * An axe strike on the standing trunk.
   * hit: world point on the bark; amount: kerf depth in metres (world); returns what happened for feedback.
   */
  strikeStanding(hit: THREE.Vector3, swingDir: THREE.Vector3, amount: number): { removed: number; bruised: boolean; type: StrikeType; notch: Notch } | null {
    if (this.state !== 'standing' && this.state !== 'creaking') return null;
    const lp = this.toLocal(hit);
    const y = THREE.MathUtils.clamp(lp.y, 0.25, Math.min(1.6, this.model.height * 0.5));
    // above an existing cut line by 3..30 cm -> the angled (diag) kerf, else a flat kerf
    let type: StrikeType = 'flat';
    let ny = y;
    // strikes on the line drive the flat kerf; strikes off the line (above or below) drive the angled kerf
    for (const n of this.notches) {
      const dy = Math.abs(y - n.y);
      if (dy <= 0.03) { ny = n.y; break; }
      if (dy < 0.3 + n.maxOpen()) { type = 'diag'; ny = n.y; break; }
    }
    const notch = this.notchAt(ny);
    if (notch.hits === 0 && notch.lastType === null && type === 'flat') {
      // the very first strike on fresh bark makes a diag kerf if the swing comes downward
      if (swingDir.y < -0.25) type = 'diag';
    }
    const c = this.model.centerAt(notch.y);
    const theta = Math.atan2(lp.z - c[1], lp.x - c[0]);
    const r = notch.strike(theta, type, (amount / this.scale) * (this.rotten ? 1.8 : 1));
    this.updateClip();
    this.checkHinge(notch);
    // a little shudder runs up the trunk
    this.swayV += amount * 6;
    return { ...r, type, notch };
  }

  private leanVec(): THREE.Vector2 { return this.model.lean.clone(); }

  private checkHinge(n: Notch): void {
    const open = n.openDir();
    const lean = this.leanVec();
    const leanAlong = lean.dot(open);
    // the hinge fails when enough wood is gone; lean toward the notch helps, lean away holds it back
    const threshold = THREE.MathUtils.clamp(0.5 - leanAlong * 4 - (this.rotten ? 0.12 : 0), 0.32, 0.72);
    const f = Math.max(...this.notches.map((x) => x.removedFraction()));
    this.tension = THREE.MathUtils.clamp((f - (threshold - 0.16)) / 0.16, 0, 1);
    if (this.tension > 0 && this.state === 'standing') this.state = 'creaking';
    if (f >= threshold) {
      const d = open.clone().multiplyScalar(1).add(lean.clone().multiplyScalar(6));
      this.fallDir.copy(d.lengthSq() > 1e-6 ? d.normalize() : open);
      this.cutY = n.y;
      this.fell(n);
    }
  }

  // ------------------------------------------------------------------ falling
  private fell(n: Notch): void {
    this.state = 'falling';
    (this.object.userData.setWind as ((w: number) => void) | undefined)?.(0);
    this.fallT = 0;
    const s = this.scale;
    // world-space fall direction (trunk-local xz -> world via the root's yaw)
    const yaw = this.ref.rotY;
    const fd = new THREE.Vector3(this.fallDir.x, 0, this.fallDir.y).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).normalize();
    const c = this.model.centerAt(n.y);
    const cutLocal = new THREE.Vector3(c[0], n.y, c[1]);
    const cutWorld = this.object.localToWorld(cutLocal.clone());
    const depthFall = n.sectorDepth(Math.atan2(this.fallDir.y, this.fallDir.x));
    const hingeWorld = cutWorld.clone().addScaledVector(fd, Math.max(0, n.R - depthFall) * s * 0.85);

    // stump stays: everything below the cut
    const { lower, upper } = n.splitBand();
    const stumpGroup = new THREE.Group();
    stumpGroup.position.copy(this.root.position); stumpGroup.rotation.copy(this.root.rotation); stumpGroup.scale.copy(this.root.scale);
    const stumpObj = this.object.clone(false);
    const stumpTrunk = this.trunk ? this.trunk.clone() : null;
    if (stumpTrunk && this.clip) {
      const cl = clipMaterial(this.barkMat!);
      cl.keep.set(-10, n.y - 0.03);
      stumpTrunk.material = cl.mat;
      stumpTrunk.customDepthMaterial = clipDepthMaterial(cl.bands, cl.keep);
      stumpObj.add(stumpTrunk);
    }
    lower.position.copy(n.mesh.position);
    stumpObj.add(lower);
    const cap = n.capMesh('stump', this.ref.id as number);
    cap.position.copy(n.mesh.position);
    stumpObj.add(cap);
    this.addHingeSplinters(stumpObj, n, true);
    stumpGroup.add(stumpObj);
    this.root.parent?.add(stumpGroup);
    this.stumpGroup = stumpGroup;
    // static stump collider
    this.stumpBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cutWorld.x, (this.root.position.y + cutWorld.y) / 2 - 0.02, cutWorld.z));
    const stH = Math.max(0.05, (cutWorld.y - this.root.position.y) / 2 - 0.02);
    // the stump ignores the falling stem until the hinge lets go
    this.stumpCol = physics.world.createCollider(RAPIER.ColliderDesc.cylinder(stH, n.R * s).setCollisionGroups(groups(GROUP.STATIC, 0xffff & ~GROUP.DYNAMIC)), this.stumpBody);

    // the falling section: the tree object with the stump part clipped away
    n.mesh.removeFromParent();
    upper.position.copy(n.mesh.position);
    this.object.add(upper);
    const topCap = n.capMesh('top', this.ref.id as number);
    topCap.position.copy(n.mesh.position);
    this.object.add(topCap);
    this.addHingeSplinters(this.object, n, false);
    if (this.clip) { this.clip.keep.set(n.y + 0.001, 1e4); this.clip.bands[0].set(1, 0, 1, 0); }
    // other notches above/below the cut are irrelevant now
    for (const o of this.notches) if (o !== n) o.mesh.removeFromParent();

    // body origin at the cut centre; the tree object hangs from it
    const sec = this.makeSection(n.y, this.model.height, this.root, this.object, cutWorld);
    this.sections = [sec];
    // revolute hinge to the stump
    const body = sec.body!;
    // positive rotation about this axis tips the top toward fd
    const axisW = new THREE.Vector3(fd.z, 0, -fd.x);
    const bq = body.rotation();
    const bodyQ = new THREE.Quaternion(bq.x, bq.y, bq.z, bq.w);
    const invQ = bodyQ.clone().invert();
    const a1 = hingeWorld.clone().sub(cutWorld).applyQuaternion(invQ);
    const ax1 = axisW.clone().applyQuaternion(invQ);
    const st = this.stumpBody.translation();
    const a2 = hingeWorld.clone().sub(new THREE.Vector3(st.x, st.y, st.z));
    const jd = RAPIER.JointData.revolute({ x: a1.x, y: a1.y, z: a1.z }, { x: a2.x, y: a2.y, z: a2.z }, { x: ax1.x, y: ax1.y, z: ax1.z });
    this.joint = physics.world.createImpulseJoint(jd, body, this.stumpBody, true);
    // a nudge over the hinge
    const tip = axisW.clone().multiplyScalar(0.25);
    body.setAngvel({ x: tip.x, y: tip.y, z: tip.z }, true);
    this.fallAxis.copy(axisW);
    this.ev.sound('tree_crack', cutWorld, 1);
    debris.emit('splinter', cutWorld, fd.clone().multiplyScalar(-1.5), 8, { spread: 1.5 });
  }

  private stumpGroup: THREE.Group | null = null;
  private fallAxis = new THREE.Vector3();

  private addHingeSplinters(parent: THREE.Object3D, n: Notch, stump: boolean): void {
    // torn hinge fibres: thin wedge shards across the uncut side
    const L = WOOD[this.species];
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(L.sap[0] / 255, L.sap[1] / 255, L.sap[2] / 255).multiplyScalar(0.9), roughness: 1 });
    const g = new THREE.BufferGeometry();
    const pos: number[] = [];
    const c = this.model.centerAt(n.y);
    const r0 = n.R;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      if (n.sectorDepth(a) > r0 * 0.6) continue;
      const rr = Math.random() * r0 * 0.9;
      const x = c[0] + Math.cos(a) * rr, z = c[1] + Math.sin(a) * rr;
      const h = (0.015 + Math.random() * 0.06) * (stump ? 1 : -1);
      const w = 0.006 + Math.random() * 0.01;
      const t = a + Math.PI / 2;
      pos.push(x - Math.cos(t) * w, n.y, z - Math.sin(t) * w, x + Math.cos(t) * w, n.y, z + Math.sin(t) * w, x, n.y + h, z);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    mat.side = THREE.DoubleSide;
    parent.add(m);
  }

  private makeSection(y0: number, y1: number, holder: THREE.Group, object: THREE.Object3D, originWorld: THREE.Vector3): Section {
    const s = this.scale;
    const wq = holder.getWorldQuaternion(new THREE.Quaternion());
    const root = new THREE.Group();
    root.position.copy(originWorld);
    root.quaternion.copy(wq);
    root.scale.setScalar(s);
    // object keeps its local frame; shift so originWorld is the root origin
    const local = object.worldToLocal(originWorld.clone());
    object.position.sub(local.clone().applyQuaternion(object.quaternion));
    holder.parent?.add(root);
    root.add(object);
    if (holder !== root && holder.children.length === 0) holder.removeFromParent();
    // body with trunk + crown colliders
    const body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(originWorld.x, originWorld.y, originWorld.z)
        .setRotation({ x: wq.x, y: wq.y, z: wq.z, w: wq.w }).setLinearDamping(0.15).setAngularDamping(0.6).setCcdEnabled(true),
    );
    const toBody = (p: THREE.Vector3) => p.clone().sub(local).multiplyScalar(s);
    // stem samples clipped to [y0 + 4 cm, y1] so the section never starts inside the stump
    const yA = y0 + 0.04;
    const interp = (y: number) => { const r = this.model.radiusAt(y); const c = this.model.centerAt(y); return { y, r, x: c[0], z: c[1] }; };
    const sp = [interp(yA), ...this.stem.filter((q) => q.y > yA + 0.05 && q.y < y1 - 0.05), interp(Math.min(y1, this.model.height))];
    let totalMass = 0;
    for (let i = 0; i < sp.length - 1; i++) {
      const a = toBody(new THREE.Vector3(sp[i].x, sp[i].y, sp[i].z)), b = toBody(new THREE.Vector3(sp[i + 1].x, sp[i + 1].y, sp[i + 1].z));
      const len = a.distanceTo(b);
      if (len < 0.05) continue;
      const r = ((sp[i].r + sp[i + 1].r) / 2) * s;
      const mass = Math.PI * r * r * len * DENSITY[this.species] * (this.rotten ? 0.6 : 1);
      totalMass += mass;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      const cd = RAPIER.ColliderDesc.cylinder(len / 2, Math.max(0.03, r)).setTranslation(mid.x, mid.y, mid.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setMass(mass).setFriction(0.9).setRestitution(0.02)
        .setCollisionGroups(groups(GROUP.DYNAMIC, 0xffff & ~GROUP.PLAYER));
      const col = physics.world.createCollider(cd, body);
      physics.owner.set(col.handle, this);
    }
    // crown: branches cushion the fall and hold the stem off the ground
    const branches = new Map<string, { obj: THREE.Object3D; info: BranchInfo; dmg: number }>();
    for (const b of this.model.branches) {
      if (b.base.y < y0 || b.base.y > y1) continue;
      const o = object.getObjectByName(`branch_${b.id}`);
      if (o) branches.set(String(b.id), { obj: o, info: b, dmg: 0 });
    }
    if (branches.size > 0) {
      const crownR = Math.max(0.3, Math.min(2.2, this.model.dbh * 4)) * s * 0.55;
      const cy0 = Math.max(y0, Math.min(...[...branches.values()].map((b) => b.info.base.y)));
      const n = 4;
      for (let k = 0; k < n; k++) {
        const y = cy0 + ((y1 - cy0) * (k + 0.5)) / n;
        const c = this.model.centerAt(y);
        const p = toBody(new THREE.Vector3(c[0], y, c[1]));
        const rr = crownR * (1 - (k / n) * 0.7);
        const cd = RAPIER.ColliderDesc.ball(rr).setTranslation(p.x, p.y, p.z).setMass((this.model.crownMass * (this.rotten ? 0.5 : 1)) / n)
          .setFriction(1.2).setRestitution(0.0).setCollisionGroups(groups(GROUP.DEBRIS, GROUP.GROUND | GROUP.STATIC));
        const col = physics.world.createCollider(cd, body);
        physics.owner.set(col.handle, this);
        totalMass += this.model.crownMass / n;
      }
    }
    physics.sync(body, root);
    let trunk: THREE.Mesh | null = null, clip: ReturnType<typeof clipMaterial> | null = null;
    object.traverse((o) => { if (o.name === 'trunk' && (o as THREE.Mesh).isMesh) trunk = o as THREE.Mesh; });
    if (trunk && this.clip && object === this.object) clip = this.clip;
    void totalMass;
    return { y0, y1, root, object, trunk, clip, body, branches, caps: [] };
  }

  update(dt: number, camPos: THREE.Vector3): void {
    if (this.state === 'standing' || this.state === 'creaking') {
      // sway spring: shudders after strikes, leans toward the fall side when creaking
      const target = this.tension * 0.012;
      this.swayV += ((target - this.sway) * 30 - this.swayV * 4) * dt;
      this.sway += this.swayV * dt;
      const yaw = this.ref.rotY;
      const ax = new THREE.Vector3(-this.fallDirGuess().y, 0, this.fallDirGuess().x);
      this.object.quaternion.setFromAxisAngle(ax, this.sway);
      void yaw;
      if (this.state === 'creaking') {
        this.creakT -= dt;
        if (this.creakT <= 0) {
          this.creakT = 1.2 + Math.random() * 2.5 * (1 - this.tension);
          const p = this.root.position.clone().add(new THREE.Vector3(0, 1.2, 0));
          this.ev.sound('tree_creak', p, 0.5 + this.tension * 0.5, 0.9 + Math.random() * 0.2);
          // needles sift from the crown
          const top = this.root.position.clone().add(new THREE.Vector3(0, this.model.height * this.scale * 0.7, 0));
          debris.emit(this.species === 'birch' ? 'leaf' : 'needle', top, new THREE.Vector3(0, -0.5, 0), 6, { spread: 2.5 });
        }
      }
    } else if (this.state === 'falling') {
      this.fallT += dt;
      const sec = this.sections[0];
      const body = sec.body!;
      const r = body.rotation();
      _q.set(r.x, r.y, r.z, r.w);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
      const tilt = Math.acos(THREE.MathUtils.clamp(up.y, -1, 1));
      if (this.joint && tilt > 0.62) {
        physics.world.removeImpulseJoint(this.joint, true);
        this.joint = null;
        this.stumpCol?.setCollisionGroups(groups(GROUP.STATIC, 0xffff));
        this.ev.sound('tree_crack', this.root.position.clone(), 0.7, 0.8);
      }
      // tip and crush check
      const t = body.translation();
      const tipLocal = new THREE.Vector3(0, (this.model.height - this.cutY) * this.scale, 0).applyQuaternion(_q);
      const tip = new THREE.Vector3(t.x, t.y, t.z).add(tipLocal);
      const av = body.angvel();
      const speed = Math.hypot(av.x, av.y, av.z) * tipLocal.length();
      this.ev.crushCheck(new THREE.Vector3(t.x, t.y, t.z), tip, this.model.dbh * this.scale * 0.5 + 0.4, speed);
      if (!this.landed && tilt > 1.05 && tip.y - heightAt(tip.x, tip.z) < 2.2 && speed > 2) {
        this.landed = true;
        const mid = new THREE.Vector3(t.x, t.y, t.z).lerp(tip, 0.6);
        const big = THREE.MathUtils.clamp(this.model.mass / 1500, 0.3, 1.5);
        this.ev.sound('tree_fall', mid, Math.min(1, 0.5 + big * 0.4), 1.1 - big * 0.2);
        this.ev.shake(Math.min(1.2, big), mid);
        for (let k = 0; k < 6; k++) {
          const p = new THREE.Vector3(t.x, t.y, t.z).lerp(tip, 0.4 + k * 0.1);
          debris.emit(this.species === 'birch' ? 'leaf' : 'needle', p.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(0, 2, 0), 18, { spread: 4 });
          debris.emit('twig', p, new THREE.Vector3(0, 2, 0), 2, { spread: 3 });
          puffs.emit(p, new THREE.Vector3(0, 0.6, 0), { size: 1.2, grow: 2.5, life: 2.4, color: new THREE.Color(0.55, 0.5, 0.42), alpha: 0.35, n: 2, spread: 1.2 });
        }
      }
      const lvv = body.linvel();
      if (this.fallT > 2.5 && this.landed && (body.isSleeping() || (Math.hypot(av.x, av.y, av.z) < 0.15 && Math.hypot(lvv.x, lvv.y, lvv.z) < 0.3))) {
        this.state = 'fallen';
        this.ev.felled(this);
      }
      if (this.fallT > 12) { this.state = 'fallen'; this.ev.felled(this); }
    }
    void camPos;
  }

  private fallDirGuess(): THREE.Vector2 {
    if (this.notches.length === 0) return this.model.lean.lengthSq() > 0 ? this.model.lean.clone().normalize() : new THREE.Vector2(1, 0);
    return this.notches[0].openDir();
  }

  // ------------------------------------------------------------------ fallen: limbing and bucking
  /** find which section/branch a mesh hit belongs to */
  classifyHit(obj: THREE.Object3D): { sec: Section; branch?: string } | null {
    for (const sec of this.sections) {
      let o: THREE.Object3D | null = obj;
      let branch: string | undefined;
      while (o) {
        if (o.name.startsWith('branch_')) branch = o.name.slice(7);
        if (o === sec.object) return { sec, branch };
        o = o.parent;
      }
    }
    return null;
  }

  /** limbing strike; returns true when the branch came off */
  strikeBranch(sec: Section, id: string, amount: number, hit: THREE.Vector3): boolean {
    const b = sec.branches.get(id);
    if (!b) return false;
    b.dmg += amount;
    debris.emit('bark', hit, new THREE.Vector3(0, 1, 0), 2, { spread: 1.5 });
    debris.emit('chip', hit, new THREE.Vector3(0, 1, 0), 1, { spread: 1.2 });
    if (b.dmg < b.info.r * this.scale * 0.9 + 0.01) return false;
    // detach: re-parent into its own dynamic body
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    b.obj.updateWorldMatrix(true, false);
    b.obj.matrixWorld.decompose(wp, wq, ws);
    const holder = new THREE.Group();
    holder.position.copy(wp); holder.quaternion.copy(wq); holder.scale.copy(ws);
    sec.root.parent?.add(holder);
    b.obj.removeFromParent();
    b.obj.position.set(0, 0, 0); b.obj.quaternion.identity(); b.obj.scale.set(1, 1, 1);
    holder.add(b.obj);
    sec.branches.delete(id);
    const len = b.info.len * this.scale;
    const dirW = b.info.dir.clone().applyQuaternion(sec.root.quaternion).normalize();
    const baseW = sec.object.localToWorld(b.info.base.clone());
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(wp.x, wp.y, wp.z)
      .setRotation({ x: wq.x, y: wq.y, z: wq.z, w: wq.w }).setLinearDamping(0.4).setAngularDamping(1.2));
    const mid = baseW.clone().addScaledVector(dirW, len / 2).sub(wp).applyQuaternion(wq.clone().invert());
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirW.clone().applyQuaternion(wq.clone().invert()).normalize());
    const col = physics.world.createCollider(RAPIER.ColliderDesc.capsule(Math.max(0.05, len / 2 - 0.2), Math.max(0.12, len * 0.12))
      .setTranslation(mid.x, mid.y, mid.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setMass(Math.max(1, b.info.mass * 0.6))
      .setFriction(1.4).setCollisionGroups(groups(GROUP.DEBRIS, GROUP.GROUND | GROUP.STATIC | GROUP.DYNAMIC)), body);
    physics.sync(body, holder);
    holder.userData.slash = { body, collider: col, mass: b.info.mass, species: this.species, len };
    this.slash.push(holder);
    this.ev.sound('branch_snap', hit, 0.8, 0.9 + Math.random() * 0.3);
    debris.emit(this.species === 'birch' ? 'leaf' : 'needle', hit, new THREE.Vector3(0, 1.5, 0), 10, { spread: 2 });
    return true;
  }

  /** limbed branches lying around (the game turns them into kindling/slash) */
  readonly slash: THREE.Group[] = [];

  /**
   * Bucking strike on a fallen section at stem-local height y. Uses a Notch ring as the kerf.
   * Returns the new pieces created when the cut completes.
   */
  strikeBuck(sec: Section, hitWorld: THREE.Vector3, amount: number, saw: boolean): { done: boolean; removed: number } {
    const lp = sec.object.worldToLocal(hitWorld.clone());
    const y = THREE.MathUtils.clamp(lp.y, sec.y0 + 0.25, sec.y1 - 0.2);
    if (y <= sec.y0 + 0.2 || y >= sec.y1 - 0.15) return { done: false, removed: 0 };
    let kerf = (sec as any).kerfs?.find((k: Notch) => Math.abs(k.y - y) < 0.15) as Notch | undefined;
    if (!kerf) {
      const prof = { radiusAt: (yy: number) => this.model.radiusAt(yy), outlineAt: this.model.outlineAt?.bind(this.model) };
      kerf = new Notch(y, prof, this.species, this.barkMat ?? new THREE.MeshStandardMaterial());
      const c = this.model.centerAt(y);
      kerf.mesh.position.set(c[0], 0, c[1]);
      sec.object.add(kerf.mesh);
      ((sec as any).kerfs ??= []).push(kerf);
      if (sec.clip) {
        const ks = (sec as any).kerfs as Notch[];
        ks.slice(-2).forEach((k, i) => { sec.clip!.bands[1].setComponent(i * 2, k.band[0]); sec.clip!.bands[1].setComponent(i * 2 + 1, k.band[1]); });
      }
    }
    const c = this.model.centerAt(kerf.y);
    const theta = Math.atan2(lp.z - c[1], lp.x - c[0]);
    // a saw makes a thin clean kerf: alternate types automatically
    const type: StrikeType = saw ? (kerf.lastType === 'flat' ? 'diag' : 'flat') : (lp.y > kerf.y + 0.02 ? 'diag' : 'flat');
    const r = kerf.strike(theta, type, (amount / this.scale) * (saw ? 1.4 : 1), saw ? 0.12 : 0.065);
    if (sec.clip) {
      const ks = (sec as any).kerfs as Notch[];
      ks.slice(-2).forEach((k, i) => { sec.clip!.bands[1].setComponent(i * 2, k.band[0]); sec.clip!.bands[1].setComponent(i * 2 + 1, k.band[1]); });
    }
    if (kerf.removedFraction() > 0.58) {
      this.completeBuck(sec, kerf, saw);
      return { done: true, removed: r.removed };
    }
    return { done: false, removed: r.removed };
  }

  private completeBuck(sec: Section, kerf: Notch, saw: boolean): void {
    const yb = kerf.y;
    kerf.mesh.removeFromParent();
    const body = sec.body!;
    const t = body.translation(), r = body.rotation();
    const bq = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const lv = body.linvel(), av = body.angvel();
    // pieces: [y0, yb] and [yb, y1]
    const parts: [number, number][] = [[sec.y0, yb], [yb, sec.y1]];
    physics.removeBody(body);
    sec.body = null;
    const newSecs: Section[] = [];
    for (const [a, b] of parts) {
      const hasBranches = [...sec.branches.values()].some((br) => br.info.base.y >= a && br.info.base.y < b);
      // world centre of this piece along the stem
      const ym = (a + b) / 2;
      const c = this.model.centerAt(ym);
      const midW = sec.object.localToWorld(new THREE.Vector3(c[0], ym, c[1]));
      if (!hasBranches || b - a < 1.2) {
        const piece = new WoodPiece({
          species: this.species,
          stem: this.stem.map((q) => ({ y: q.y * this.scale, r: q.r * this.scale, x: q.x * this.scale, z: q.z * this.scale })),
          y0: a * this.scale, y1: b * this.scale, seed: (Number(this.ref.id) * 131 + Math.round(a * 100)) | 0,
          quality: this.rotten ? 0.35 : 1, ends: saw ? 'saw' : 'axe',
        });
        const stemQ = bq.clone().multiply(sec.object.quaternion);
        piece.spawn(midW, stemQ, new THREE.Vector3(lv.x, lv.y, lv.z), new THREE.Vector3(av.x, av.y, av.z));
        this.ev.spawnPiece(piece);
      } else {
        // still has branches: a new section sharing the tree object (clone)
        const obj = sec.object.clone(true);
        let tr: THREE.Mesh | null = null;
        obj.traverse((o) => { if (o.name === 'trunk' && (o as THREE.Mesh).isMesh) tr = o as THREE.Mesh; });
        // remove branches outside [a, b]
        for (const br of this.model.branches) {
          if (br.base.y >= a && br.base.y < b) continue;
          obj.getObjectByName(`branch_${br.id}`)?.removeFromParent();
        }
        let clip: ReturnType<typeof clipMaterial> | null = null;
        if (tr) {
          clip = clipMaterial(this.barkMat ?? ((tr as THREE.Mesh).material as THREE.Material));
          clip.keep.set(a, b);
          (tr as THREE.Mesh).material = clip.mat;
          (tr as THREE.Mesh).customDepthMaterial = clipDepthMaterial(clip.bands, clip.keep);
        }
        const holder = new THREE.Group();
        holder.position.copy(new THREE.Vector3(t.x, t.y, t.z)); holder.quaternion.copy(bq); holder.scale.copy(sec.root.scale);
        sec.root.parent?.add(holder);
        obj.position.copy(sec.object.position); obj.quaternion.copy(sec.object.quaternion);
        holder.add(obj);
        const cW = sec.object.localToWorld(new THREE.Vector3(this.model.centerAt(a)[0], a, this.model.centerAt(a)[1]));
        const ns = this.makeSection(a, b, holder, obj, cW);
        ns.clip = clip;
        ns.trunk = tr;
        ns.body!.setLinvel(lv, true); ns.body!.setAngvel(av, true);
        // cut faces
        for (const yy of [a, b]) {
          if (yy <= 0.001 || yy >= this.model.height - 0.01) continue;
          const capN = new Notch(yy, { radiusAt: (q) => this.model.radiusAt(q) }, this.species, new THREE.MeshStandardMaterial());
          const cm = capN.capMesh(yy === a ? 'top' : 'stump');
          const cc = this.model.centerAt(yy);
          cm.position.set(cc[0], 0, cc[1]);
          obj.add(cm);
        }
        newSecs.push(ns);
      }
    }
    sec.root.removeFromParent();
    this.sections = this.sections.filter((s) => s !== sec).concat(newSecs);
    if (this.sections.length === 0) this.state = 'gone';
    this.ev.sound(saw ? 'log_thud' : 'tree_crack', sec.root.position.clone(), 0.6, 1.3);
  }

  dispose(): void {
    for (const s of this.sections) { if (s.body) physics.removeBody(s.body); s.root.removeFromParent(); }
    this.root.removeFromParent();
    this.stumpGroup?.removeFromParent();
  }
}
