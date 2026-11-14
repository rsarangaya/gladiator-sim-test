// Carried supplies (the player has only a few slots). Effects live in game/state.ts (useItem).
export type ItemId = 'salve' | 'whetstone' | 'patch' | 'tonic' | 'draught';
export interface ItemDef { id: ItemId; name: string; desc: string; price: number; icon: 'flask' | 'hammer' | 'armor' | 'bolt' | 'spi' }

export const ITEMS: Record<ItemId, ItemDef> = {
  salve:     { id: 'salve',     name: 'Healing Salve',    desc: 'Treats your worst bruise or wound at once (not lost limbs).', price: 34, icon: 'flask' },
  whetstone: { id: 'whetstone', name: 'Whetstone',        desc: 'Restores 40 weapon durability.',                              price: 18, icon: 'hammer' },
  patch:     { id: 'patch',     name: 'Armor Patch Kit',  desc: 'Restores 30 durability to your armor and shield.',            price: 22, icon: 'armor' },
  tonic:     { id: 'tonic',     name: 'Stamina Tonic',    desc: 'Restores 1 energy.',                                          price: 30, icon: 'bolt' },
  draught:   { id: 'draught',   name: 'Spirit Draught',   desc: '+8 spirit in your next fight, so you fight on longer.',        price: 28, icon: 'spi' },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const INV_SLOTS = 5;
