// BUSHED's people on Gacha Garage's human model (./gg, ported from the author's didactic-broccoli src/people): one
// rigidly skinned low-poly mesh and one painted pixel-art atlas per person, a face painted live (expressions, blinks,
// eye darts, a talking mouth), procedural walking with IK-planted feet, arm-IK gestures and poses, dressed in bush
// clothing painted in GG's style (flannel checks, suspenders, toques, work gloves, jeans, logger boots, parkas...).
//
//   import { buildHuman } from './humans';
//   const gerard = buildHuman('shopkeeper');          // or buildHuman(makeLook('hunter')), buildHuman(variant(...))
//   scene.add(gerard.root); gerard.root.position.set(x, heightAt(x, z), z);
//   gerard.anim.play('lean'); gerard.anim.talking = true; gerard.anim.lookAt(camera.position);
//   gerard.anim.expression('happy', 2);               // a face for two seconds
//   gerard.socket('R').add(bottleMesh);               // held items: grip at origin, handle +Y, edge +Z
//   gerard.anim.onEvent((ev) => { if (ev === 'impact') thunk(); });
//   each frame: gerard.anim.update(dt);
//
// First-person arms and hands on the same model: FPRig (./fprig, used by src/player/arms.ts and the cooking hands).
export { buildHuman, wetMaterial } from './model';
export type { HumanModel } from './model';
export { NpcAnimator, NpcAnimator as HumanAnimator, NPC_ANIMS } from './anim';
export type { NpcAnim, NpcEvent } from './anim';
export { makeLook, variant, LOOK_IDS, SETTS } from './looks';
export type { HumanLook, LookId, Sett, Build } from './looks';
export { lookToSpec } from './spec';
export { FPRig } from './fprig';
export { Human } from './gg/Human';
export { EXPRESSIONS } from './gg/face';
export { GESTURES } from './gg/gestures';
export type { Spec } from './gg/types';
export { FINGERS, FING, THUMB, tdir, fpDims, twoBone, frameRot, framePos, setFrameRot } from './rig';
export type { Dims } from './rig';
