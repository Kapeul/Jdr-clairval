// Légende des cases. Chaque caractère du tableau `terrain` d'une carte correspond à une entrée.
// ground : couleur et hauteur du sol ; block : volume posé dessus ; prop : petit décor.

export type PropKind =
  | 'tree'
  | 'pine'
  | 'bush'
  | 'tomb'
  | 'well'
  | 'door'
  | 'mushroom'
  | 'bed'
  | 'cage'
  | 'fire'
  | 'tent'
  | 'table'
  | 'candles'
  | 'statue'
  | 'hay'
  | 'sarcophagus'
  | 'stairs'
  | 'post'
  | 'rock'
  | 'stone'

export interface TerrainDef {
  name: string
  ground: string
  h: number // hauteur du sol
  block?: { color: string; h: number; top?: string }
  prop?: PropKind
  walkable: boolean
  water?: boolean
}

export const TERRAIN: Record<string, TerrainDef> = {
  '.': { name: 'Herbe', ground: '#6f9e4c', h: 0.2, walkable: true },
  ',': { name: 'Sous-bois', ground: '#4d7638', h: 0.2, walkable: true },
  '=': { name: 'Chemin', ground: '#b09062', h: 0.18, walkable: true },
  ':': { name: 'Pavés', ground: '#a19c90', h: 0.22, walkable: true },
  '_': { name: 'Plancher', ground: '#8f6b43', h: 0.24, walkable: true },
  '-': { name: 'Dalles', ground: '#86827b', h: 0.24, walkable: true },
  '~': { name: 'Eau', ground: '#3d73ad', h: 0.06, walkable: false, water: true },
  m: { name: 'Marais', ground: '#4f5d3a', h: 0.1, walkable: false, water: true },
  x: { name: 'Fosse', ground: '#121214', h: 0.02, walkable: false },
  '#': { name: 'Mur', ground: '#77736d', h: 0.24, block: { color: '#7c776f', h: 1.3, top: '#8f8a82' }, walkable: false },
  H: { name: 'Bâtiment', ground: '#8f6b43', h: 0.24, block: { color: '#cdb78d', h: 1.2, top: '#a44b36' }, walkable: false },
  G: { name: 'Grange', ground: '#8f6b43', h: 0.24, block: { color: '#9a7449', h: 1.1, top: '#6b4f33' }, walkable: false },
  K: { name: 'Château', ground: '#77736d', h: 0.24, block: { color: '#8d8a84', h: 2.0, top: '#6c6964' }, walkable: false },
  '^': { name: 'Rochers', ground: '#6f9e4c', h: 0.2, prop: 'rock', walkable: false },
  '|': { name: 'Palissade', ground: '#6f9e4c', h: 0.2, prop: 'post', walkable: false },
  T: { name: 'Arbre', ground: '#6f9e4c', h: 0.2, prop: 'tree', walkable: false },
  Y: { name: 'Sapin', ground: '#4d7638', h: 0.2, prop: 'pine', walkable: false },
  '"': { name: 'Broussailles', ground: '#5f8a40', h: 0.2, prop: 'bush', walkable: true },
  t: { name: 'Tombe', ground: '#617f45', h: 0.2, prop: 'tomb', walkable: true },
  k: { name: 'Sarcophage', ground: '#86827b', h: 0.24, prop: 'sarcophagus', walkable: false },
  w: { name: 'Puits', ground: '#a19c90', h: 0.22, prop: 'well', walkable: false },
  '+': { name: 'Porte', ground: '#8f6b43', h: 0.24, prop: 'door', walkable: true },
  o: { name: 'Champignons', ground: '#4d7638', h: 0.2, prop: 'mushroom', walkable: true },
  b: { name: 'Lit', ground: '#8f6b43', h: 0.24, prop: 'bed', walkable: false },
  c: { name: 'Cage', ground: '#4d7638', h: 0.2, prop: 'cage', walkable: false },
  f: { name: 'Feu', ground: '#b09062', h: 0.18, prop: 'fire', walkable: false },
  A: { name: 'Tente', ground: '#4d7638', h: 0.2, prop: 'tent', walkable: false },
  P: { name: 'Pont', ground: '#8a7a66', h: 0.3, walkable: true },
  s: { name: 'Escalier', ground: '#86827b', h: 0.24, prop: 'stairs', walkable: true },
  r: { name: 'Table', ground: '#8f6b43', h: 0.24, prop: 'table', walkable: false },
  '*': { name: 'Cercle rituel', ground: '#3d3346', h: 0.24, prop: 'candles', walkable: true },
  S: { name: 'Statue', ground: '#a19c90', h: 0.22, prop: 'statue', walkable: false },
  h: { name: 'Foin', ground: '#8f6b43', h: 0.24, prop: 'hay', walkable: false },
  n: { name: 'Pierre blanche', ground: '#4d7638', h: 0.2, prop: 'stone', walkable: true },
}

export const VOID = ' '

export function terrainAt(rows: string[], x: number, y: number): TerrainDef | null {
  const c = rows[y]?.[x]
  if (!c || c === VOID) return null
  return TERRAIN[c] ?? TERRAIN['.']
}

/** Petit bruit déterministe pour varier les teintes */
export function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
