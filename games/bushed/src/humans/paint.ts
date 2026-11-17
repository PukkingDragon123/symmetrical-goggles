// Paints one person's whole texture page (1024 x 512): skin, face, hair and beard (skin.ts), then every
// garment (clothes.ts). Pages are cached per look seed + name by model.ts.
import { Page } from './px';
import type { HumanLook } from './looks';
import type { Shape } from './shape';
import type { Dims } from './rig';
import { PAGE_W, PAGE_H } from './page';
import { skinPal, paintHead, paintLids, paintNeck, paintHair, paintBeard } from './skin';
import { paintTorso, paintOuter, paintArms, paintLegs, paintFeet, paintHands, paintCollar, paintHat, paintApron, paintExtra, paintFallback } from './clothes';
import type { Ctx } from './clothes';

export function paintPage(L: HumanLook, sh: Shape, d: Dims): Page {
  const P = new Page(PAGE_W, PAGE_H);
  const K = skinPal(L);
  const C: Ctx = { L, sh, d, K, seed: L.seed * 7 + 11 };
  paintHead(P, L, K);
  paintLids(P, L, K);
  paintNeck(P, L, K);
  paintHair(P, L, K);
  paintBeard(P, L, K);
  paintTorso(P, C);
  paintOuter(P, C);
  paintArms(P, C);
  paintLegs(P, C);
  paintFeet(P, C);
  paintHands(P, C);
  paintCollar(P, C);
  paintHat(P, C);
  paintApron(P, C);
  paintExtra(P, C);
  paintFallback(P, C);
  return P;
}
