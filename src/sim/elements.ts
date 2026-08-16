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

export const ELEMENT_COUNT = 6

export const ELEMENT_NAMES = ['empty', 'wall', 'sand', 'water', 'fire', 'steam'] as const

/** Elements that count against the dot budget (walls are scenery, not dots). */
export function isDot(el: number): boolean {
  return el >= SAND
}

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
]
