// Survival without meters. Three quantities, all shown through the body and the world:
//   hunger  - kcal in the tank. Low: stomach growls, slower stamina recovery, shaky aim.
//   stamina - 0..1. Swinging, hauling, sprinting spend it; breathing gets heavy (audio), arms sag.
//   warmth  - core warmth 0..1. Follows the air temperature (time, weather, indoors, near fire, clothing).
//             Cold: visible breath, shivering arms, teeth chatter, blue-grey vignette. Too cold for too long and
//             you black out (and wake up somewhere warm, with a mystery about who carried you).
export interface Env {
  hour: number;
  /** 0..1 */
  rain: number;
  wind: number;
  indoors: boolean;
  /** heat from nearby fires in degrees C added to the air */
  fireHeat: number;
  /** interior air temperature when indoors (from the stove model) */
  roomTemp: number;
  /** in the Jeep with the heater */
  vehicle: boolean;
}

export function outdoorTemp(hour: number, day: number, rain: number): number {
  // late September in northern Ontario: ~14 C afternoons, ~0 C before dawn, colder every week
  const diurnal = Math.cos(((hour - 15) / 24) * Math.PI * 2);
  return 6.5 + 7.5 * diurnal - day * 0.35 - rain * 3;
}

export class Survival {
  kcal = 1600;
  stamina = 1;
  warmth = 0.8;
  /** air temperature at the player (C) */
  air = 10;
  day = 0;
  blackout = 0;
  /** derived feedback amounts 0..1 */
  shiver = 0;
  breath = 0;
  hungerPang = 0;
  /** heavy breathing after exertion */
  winded = 0;
  private growlT = 30;
  onGrowl: () => void = () => {};
  onBlackout: () => void = () => {};
  clothing = 0.55;

  spend(a: number): void {
    this.stamina = Math.max(0, this.stamina - a);
    this.winded = Math.min(1, this.winded + a * 2.5);
    this.kcal = Math.max(0, this.kcal - a * 90);
  }

  eat(kcal: number, warmth = 0): void {
    this.kcal = Math.min(3200, this.kcal + kcal);
    this.warmth = Math.min(1, this.warmth + warmth);
  }

  update(dtGame: number, dtReal: number, e: Env, moving: number): void {
    // air temperature where the player is
    const out = outdoorTemp(e.hour, this.day, e.rain) - e.wind * 4;
    this.air = e.vehicle ? Math.max(out, 16) : e.indoors ? e.roomTemp : out + e.fireHeat;
    // body: comfortable from ~14 C (dressed for the bush), moving keeps you warm
    const comfort = 12 - this.clothing * 6 - moving * 5;
    const delta = (this.air - comfort) / 20;
    const rate = delta < 0 ? 0.012 * (1 + e.rain * 1.5 + e.wind) : 0.03;
    this.warmth = Math.min(1, Math.max(0, this.warmth + delta * rate * dtGame * 60 / 60));
    // stamina regen: needs food and warmth
    const fed = Math.min(1, this.kcal / 900);
    const regen = 0.09 * (0.35 + 0.65 * fed) * (0.4 + 0.6 * this.warmth) * (moving > 0.7 ? 0.35 : 1);
    this.stamina = Math.min(1, this.stamina + regen * dtReal);
    this.winded = Math.max(0, this.winded - dtReal * 0.12);
    // burn calories with time (a lumberjack eats ~4000 kcal a day)
    this.kcal = Math.max(0, this.kcal - dtGame * (4000 / 86400) * (1 + moving * 0.5));
    this.shiver = Math.max(0, Math.min(1, (0.5 - this.warmth) * 2.2));
    this.breath = Math.max(0, Math.min(1, (6 - this.air) / 8));
    this.hungerPang = Math.max(0, Math.min(1, (700 - this.kcal) / 700));
    if (this.hungerPang > 0.2) {
      this.growlT -= dtReal * (0.5 + this.hungerPang);
      if (this.growlT <= 0) { this.growlT = 40 + Math.random() * 40; this.onGrowl(); }
    }
    if (this.warmth <= 0.02) {
      this.blackout += dtReal;
      if (this.blackout > 20) { this.blackout = 0; this.warmth = 0.5; this.onBlackout(); }
    } else this.blackout = Math.max(0, this.blackout - dtReal);
  }
}

/**
 * The barrel stove. Fuel is kilograms of wood; dry splits burn clean, a fresh round smoulders. Heat raises the
 * cabin air toward a target that depends on the fire size; the cabin loses heat to the outdoors through its logs.
 */
export class Stove {
  fuel = 0;
  /** 0 out .. 1 roaring */
  level = 0;
  lit = false;
  kindling = 0;
  roomTemp = 6;
  doorOpen = false;
  /** visible to the game for audio: crackle intensity */
  get crackle(): number { return this.lit ? Math.min(1, 0.25 + this.level) : 0; }

  addWood(kg: number, kind: 'split' | 'round' | 'kindling'): void {
    if (kind === 'kindling') this.kindling += kg;
    else this.fuel += kg * (kind === 'round' ? 0.7 : 1);
  }

  /** strike a match: needs kindling, or a small fire already going */
  light(): boolean {
    if (this.lit) return true;
    if (this.kindling < 0.2) return false;
    this.lit = true;
    this.level = 0.15;
    return true;
  }

  update(dtGame: number, outdoor: number): void {
    if (this.lit) {
      // kindling catches first, then splits take over
      const burnK = Math.min(this.kindling, dtGame * 0.0012);
      this.kindling -= burnK;
      const want = this.fuel > 0 ? Math.min(1, 0.25 + this.fuel / 10) : this.kindling > 0 ? 0.25 : 0;
      this.level += (want - this.level) * Math.min(1, dtGame * (this.kindling > 0 || this.fuel > 0 ? 0.004 : 0.02));
      // ~2.2 kg of wood per hour at a steady burn
      this.fuel = Math.max(0, this.fuel - dtGame * (2.2 / 3600) * (0.4 + this.level));
      if (this.fuel <= 0 && this.kindling <= 0 && this.level < 0.03) { this.lit = false; this.level = 0; }
    }
    const target = outdoor + this.level * 34;
    this.roomTemp += (target - this.roomTemp) * Math.min(1, dtGame * 0.00045);
  }
}
