// Save game in localStorage (one slot). Saved when you sleep in the bunk, and on quitting from the porch.
export interface SaveData {
  v: 1;
  day: number;
  hour: number;
  money: number;
  items: [string, number][];
  contracts: { id: string; state: string; progress: number }[];
  journal: [string, string[]][];
  houndTrust: number;
  stove: { fuel: number; roomTemp: number };
  stacked: number;
  sharp: [string, number][];
  flags: string[];
}

const KEY = 'bushed.save.v1';

export function hasSave(): boolean {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function writeSave(d: SaveData): void {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* private mode: no saves */ }
}

export function readSave(): SaveData | null {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    const d = JSON.parse(s) as SaveData;
    return d.v === 1 ? d : null;
  } catch { return null; }
}

export function clearSave(): void { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
