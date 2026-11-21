// The Jeep is gone: the logging truck (./truck.ts) took its place and keeps its API, so main.ts, game.ts, flow.ts,
// the ground cover and the hunting noises keep working through this alias.
export { Truck as Jeep } from './truck';
export type { DriveInput, JeepMeta, TruckMeta, MountName } from './truck';
export type { AutopilotSpec } from './truckphysics';
export { installTruck } from './install';
