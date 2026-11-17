// BUSHED's people: realistic lofted, skinned humans with painted pixel-art bush clothing, NPC animation and the
// parts the first-person arms are built from. Ported from Limbophobia's human builder via Blobfish's cleanup.
//
//   import { buildHuman } from './humans';
//   const gerard = buildHuman('shopkeeper');          // or buildHuman(makeLook('hunter')), buildHuman(variant(...))
//   scene.add(gerard.root); gerard.root.position.set(x, heightAt(x, z), z);
//   gerard.anim.play('lean'); gerard.anim.talking = true; gerard.anim.lookAt(camera.position);
//   gerard.socket('R').add(bottleMesh);               // held items: grip at origin, handle +Y, edge +Z
//   gerard.anim.onEvent((ev) => { if (ev === 'impact') thunk(); });
//   each frame: gerard.anim.update(dt);
export { buildHuman, humanParts, armsGeometry, humanMaterial, makeSocket } from './model';
export type { HumanModel, HumanParts } from './model';
export { HumanAnimator, NPC_ANIMS, setGrip, twistAboutY, track } from './anim';
export type { NpcAnim } from './anim';
export { makeLook, variant, LOOK_IDS, SETTS } from './looks';
export type { HumanLook, LookId, Sett } from './looks';
export { rigDims, makeSkeleton, BONES, twoBone, frameRot, framePos, setFrameRot } from './rig';
export type { Dims, Build } from './rig';
