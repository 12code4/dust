/**
 * M0 element roster. Full 24-element roster + data-driven properties arrive in
 * M1 (see docs/03-elements.md); M0 hard-codes the five behaviors to prove the
 * loop. Ids are stable — the save format will depend on them.
 */
export const EMPTY = 0
export const WALL = 1
export const SAND = 2
export const WATER = 3
export const FIRE = 4
export const STEAM = 5
export const DUST = 6
export const SMOKE = 7
export const MUD = 8
export const LAVA = 9
export const STONE = 10
export const GLASS = 11
export const WOOD = 12
export const SEED = 13
export const PLANT = 14
export const ICE = 15

export const ELEMENT_COUNT = 16

export const ELEMENT_NAMES = [
  'empty',
  'wall',
  'sand',
  'water',
  'fire',
  'steam',
  'dust',
  'smoke',
  'mud',
  'lava',
  'stone',
  'glass',
  'wood',
  'seed',
  'plant',
  'ice',
] as const

/** Elements that count against the dot budget (walls are scenery, not dots). */
export function isDot(el: number): boolean {
  return el >= SAND
}

/**
 * How strongly the air field drags each element (docs/03). Gases ride every
 * draft, liquids resist, statics never move. Indexed by element id.
 */
export const WINDAGE: readonly number[] = [
  0, // EMPTY
  0, // WALL
  0.3, // SAND
  0.15, // WATER
  0.7, // FIRE
  0.9, // STEAM
  1.0, // DUST — the namesake rides every draft
  0.85, // SMOKE
  0.05, // MUD — sticky, nearly windproof
  0.02, // LAVA — molten rock ignores weather
  0.02, // STONE
  0, // GLASS — static
  0, // WOOD — static
  0.4, // SEED — light enough to scatter on the wind
  0, // PLANT — static
  0, // ICE — static
]

/**
 * Base colors, 4 shade variants per element. A particle picks a shade at spawn
 * and keeps it for life (the PG look: grainy, stable speckle). Fire ignores its
 * spawn shade and renders by remaining lifetime instead (hot → cool).
 */
export const SHADES: ReadonlyArray<readonly [number, number, number][]> = [
  // EMPTY — near-black, slight blue cast
  [
    [0x14, 0x16, 0x1a],
    [0x14, 0x16, 0x1a],
    [0x14, 0x16, 0x1a],
    [0x14, 0x16, 0x1a],
  ],
  // WALL — neutral masonry grays
  [
    [0x62, 0x64, 0x6a],
    [0x6a, 0x6c, 0x72],
    [0x72, 0x74, 0x7a],
    [0x5a, 0x5c, 0x62],
  ],
  // SAND — warm tans
  [
    [0xd8, 0xb4, 0x5a],
    [0xcf, 0xa9, 0x4e],
    [0xe2, 0xc0, 0x6c],
    [0xc6, 0x9e, 0x44],
  ],
  // WATER — PG-blue
  [
    [0x3b, 0x6f, 0xd6],
    [0x35, 0x66, 0xc8],
    [0x44, 0x7a, 0xe2],
    [0x2f, 0x5e, 0xbe],
  ],
  // FIRE — lifetime gradient: index 0 = dying embers … 3 = newborn white-hot
  [
    [0xb3, 0x24, 0x0c],
    [0xe2, 0x5c, 0x10],
    [0xff, 0x9e, 0x1c],
    [0xff, 0xe0, 0x66],
  ],
  // STEAM — pale fog
  [
    [0xb9, 0xc2, 0xcc],
    [0xaa, 0xb4, 0xc0],
    [0xc8, 0xd0, 0xd8],
    [0x9c, 0xa8, 0xb6],
  ],
  // DUST — soft warm greys, the color everything ends up
  [
    [0xb2, 0xac, 0xa2],
    [0xa6, 0xa0, 0x96],
    [0xbc, 0xb6, 0xac],
    [0x9a, 0x94, 0x8a],
  ],
  // SMOKE — sooty blue-greys
  [
    [0x4a, 0x4d, 0x55],
    [0x41, 0x44, 0x4c],
    [0x54, 0x57, 0x60],
    [0x38, 0x3b, 0x43],
  ],
  // MUD — rich wet browns
  [
    [0x7a, 0x55, 0x36],
    [0x70, 0x4d, 0x30],
    [0x84, 0x5d, 0x3c],
    [0x66, 0x45, 0x2a],
  ],
  // LAVA — molten glow
  [
    [0xff, 0x6a, 0x1a],
    [0xef, 0x52, 0x10],
    [0xff, 0x92, 0x33],
    [0xdc, 0x40, 0x0a],
  ],
  // STONE — cold quarry greys
  [
    [0x8a, 0x8d, 0x93],
    [0x7e, 0x81, 0x87],
    [0x96, 0x99, 0x9f],
    [0x72, 0x75, 0x7b],
  ],
  // GLASS — pale vitreous cyan
  [
    [0xb8, 0xd8, 0xdd],
    [0xaa, 0xcc, 0xd4],
    [0xc8, 0xe4, 0xe8],
    [0x9c, 0xc0, 0xc8],
  ],
  // WOOD — dry timber browns
  [
    [0x8b, 0x66, 0x3d],
    [0x81, 0x5c, 0x35],
    [0x95, 0x70, 0x45],
    [0x77, 0x52, 0x2d],
  ],
  // SEED — yellow-green kernels
  [
    [0xa8, 0xc2, 0x4e],
    [0x9c, 0xb6, 0x44],
    [0xb4, 0xce, 0x58],
    [0x90, 0xaa, 0x3a],
  ],
  // PLANT — living green
  [
    [0x3f, 0xa3, 0x48],
    [0x37, 0x97, 0x40],
    [0x47, 0xaf, 0x50],
    [0x2f, 0x8b, 0x38],
  ],
  // ICE — glacial blue
  [
    [0x9c, 0xc8, 0xf0],
    [0x8e, 0xba, 0xe4],
    [0xaa, 0xd6, 0xfc],
    [0x80, 0xac, 0xd8],
  ],
]
