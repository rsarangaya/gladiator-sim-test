// The player's bag: a handful of slots for consumables (see data/items.ts).
import { INV_SLOTS, ITEMS } from '../data/items';
import type { Save } from '../game/state';
import type { IconKind } from '../render/scenes';

export function bagHtml(s: Save, iconHtml: (k: IconKind, sz?: number, cls?: string) => string): string {
  const cells = Array.from({ length: INV_SLOTS }, (_, i) => {
    const id = s.inv?.[i];
    if (!id) return '<div class="bagslot empty">empty</div>';
    const d = ITEMS[id];
    return `<div class="bagslot">${iconHtml(d.icon, 32)}<b>${d.name}</b><span class="dim">${d.desc}</span>`
      + `<div class="row2"><button data-use="${i}" class="pri">Use</button><button data-drop="${i}">Drop</button></div></div>`;
  });
  return `<div class="bag">${cells.join('')}</div>`;
}
