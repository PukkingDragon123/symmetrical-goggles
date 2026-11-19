// The first-person hand system (ported from Gacha Garage's FPBody.js / Held.js): grips that close on the held
// object's real surface, shape-aware holds, the weighted viewmodel motion and the body under the camera.
// FPArms (../arms.ts) assembles these; import from here to use the pieces on their own.
export { gripAngles, gripOf, applyFingers, mixFingers, sampleSurface, solveWrap, tips, Surface, NF } from './grip';
export type { Fingers, WrapOpts } from './grip';
export { analyse, radiusAt, extent, gripStyle, guessMass, axisVec } from './fit';
export type { ObjShape, GripStyle } from './fit';
export { ViewMotion } from './motion';
export type { MotionIn } from './motion';
export { FPBody } from './body';
export type { BodyIn } from './body';
