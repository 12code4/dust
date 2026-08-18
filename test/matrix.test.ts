import { describe, expect, it } from 'vitest'
import { World } from '../src/sim/world.ts'
import { ELEMENT_PROPS, INTERACTIONS, UNARY, IMPLEMENTED, elementName } from '../src/sim/data.ts'
import { WINDAGE, ELEMENT_COUNT, SHADES, ELEMENT_NAMES } from '../src/sim/elements.ts'
import {
  WALL,
  SAND,
  WATER,
  FIRE,
  STEAM,
  DUST,
  SMOKE,
  MUD,
  LAVA,
  STONE,
  GLASS,
  WOOD,
  SEED,
  PLANT,
  ICE,
} from '../src/sim/elements.ts'

/**
 * THE COMPLETENESS GATE (docs/04 §5). An element does not exist until its
 * data is complete and every special pair it appears in has a live behavior
 * probe. Adding element N+1 without finishing its row fails this file.
 */

const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)

describe('the matrix is complete', () => {
  it('every implemented element has props, windage, palette, and a name', () => {
    for (const el of IMPLEMENTED) {
      expect(ELEMENT_PROPS[el], `props for ${elementName(el)}`).toBeDefined()
      expect(WINDAGE[el], `windage for ${elementName(el)}`).toBeDefined()
      expect(SHADES[el], `palette for ${elementName(el)}`).toBeDefined()
      expect(ELEMENT_NAMES[el], `name for #${el}`).toBeDefined()
    }
    expect(IMPLEMENTED.length).toBe(ELEMENT_COUNT - 1)
  })

  it('the interaction registry is well-formed (known elements, no duplicate pairs)', () => {
    const seen = new Set<string>()
    for (const { a, b } of INTERACTIONS) {
      expect(ELEMENT_PROPS[a], `unknown element ${a}`).toBeDefined()
      expect(ELEMENT_PROPS[b], `unknown element ${b}`).toBeDefined()
      const k = key(a, b)
      expect(seen.has(k), `duplicate pair ${k}`).toBe(false)
      seen.add(k)
    }
  })

  it('every registered interaction and unary transition has a live probe', () => {
    for (const { a, b, effect } of INTERACTIONS) {
      expect(
        PAIR_PROBES[key(a, b)],
        `no probe for ${elementName(a)}+${elementName(b)} (“${effect}”)`,
      ).toBeDefined()
    }
    for (const { el, effect } of UNARY) {
      expect(
        UNARY_PROBES[el],
        `no unary probe for ${elementName(el)} (“${effect}”)`,
      ).toBeDefined()
    }
  })
})

// ---- pair probes: place the reactants, run, observe the products ----------

type Probe = () => void

const PAIR_PROBES: Record<string, Probe> = {
  [key(WATER, FIRE)]: () => {
    const w = new World(20, 20, 42)
    for (let x = 0; x < 20; x++) w.set(x, 10, FIRE)
    for (let x = 0; x < 20; x++) w.set(x, 9, WATER)
    for (let t = 0; t < 5; t++) w.step()
    expect(w.countOf(FIRE)).toBe(0) // water kills flame
    expect(w.countOf(STEAM)).toBeGreaterThan(0) // by boiling a little of itself
    expect(w.countOf(STEAM) + w.countOf(WATER)).toBe(20)
  },
  [key(WATER, SAND)]: () => {
    const w = new World(20, 30, 7)
    for (let x = 0; x < 20; x++) for (let y = 27; y < 30; y++) w.set(x, y, SAND)
    for (let x = 0; x < 20; x++) for (let y = 24; y < 27; y++) w.set(x, y, WATER)
    for (let t = 0; t < 200; t++) w.step()
    expect(w.countOf(MUD)).toBeGreaterThan(0)
  },
  [key(WATER, DUST)]: () => {
    const w = new World(20, 30, 7)
    for (let x = 0; x < 20; x++) for (let y = 26; y < 30; y++) w.set(x, y, WATER)
    w.paintDisk(10, 5, 3, DUST)
    for (let t = 0; t < 250; t++) w.step()
    expect(w.countOf(MUD)).toBeGreaterThan(0)
    expect(w.countOf(DUST)).toBe(0)
  },
  [key(WATER, LAVA)]: () => {
    const w = new World(30, 30, 7)
    for (let x = 0; x < 30; x++) w.set(x, 29, LAVA)
    for (let x = 0; x < 30; x++) w.set(x, 25, WATER)
    for (let t = 0; t < 60; t++) w.step()
    expect(w.countOf(STONE)).toBeGreaterThan(0)
    expect(w.countOf(STEAM)).toBeGreaterThan(0)
  },
  [key(WATER, STONE)]: () => {
    const w = new World(40, 20, 7)
    for (let x = 0; x < 40; x++) w.set(x, 19, STONE)
    for (let x = 0; x < 40; x++) for (let y = 15; y < 19; y++) w.set(x, y, WATER)
    for (let t = 0; t < 800; t++) w.step()
    expect(w.countOf(SAND) + w.countOf(MUD)).toBeGreaterThan(0) // eroded (sand may wet on)
  },
  [key(FIRE, DUST)]: () => {
    const w = new World(60, 60, 13)
    w.paintDisk(30, 20, 6, DUST)
    w.paintDisk(30, 32, 4, FIRE)
    const dust0 = w.countOf(DUST)
    for (let t = 0; t < 60; t++) w.step()
    expect(w.countOf(DUST)).toBeLessThan(dust0)
  },
  [key(FIRE, MUD)]: () => {
    const w = new World(30, 30, 7)
    for (let x = 10; x < 20; x++) w.set(x, 29, MUD)
    for (let t = 0; t < 300; t++) {
      w.paintDisk(15, 26, 4, FIRE, 0.5)
      w.step()
    }
    expect(w.countOf(SAND)).toBeGreaterThan(0)
  },
  [key(LAVA, SAND)]: () => {
    const w = new World(30, 30, 7)
    for (let x = 0; x < 30; x++) w.set(x, 29, SAND)
    for (let x = 10; x < 20; x++) w.set(x, 26, LAVA)
    for (let t = 0; t < 100; t++) w.step()
    expect(w.countOf(GLASS)).toBeGreaterThan(0)
  },
  [key(LAVA, MUD)]: () => {
    const w = new World(30, 30, 7)
    for (let x = 0; x < 30; x++) w.set(x, 29, MUD)
    for (let x = 10; x < 20; x++) w.set(x, 26, LAVA)
    for (let t = 0; t < 100; t++) w.step()
    expect(w.countOf(STONE)).toBeGreaterThan(0)
  },
  [key(LAVA, DUST)]: () => {
    const w = new World(30, 40, 7)
    for (let x = 0; x < 30; x++) w.set(x, 39, LAVA)
    w.paintDisk(15, 10, 4, DUST)
    const dust0 = w.countOf(DUST)
    for (let t = 0; t < 120; t++) w.step()
    expect(w.countOf(DUST)).toBeLessThan(dust0) // burned on contact
  },
  [key(LAVA, STONE)]: () => {
    // Isolated specimen: one stone boxed in with lava neighbors. The only
    // way its cell can ever read LAVA is the melt — crust noise can't fake it.
    const w = new World(5, 6, 7)
    for (let x = 0; x < 5; x++) w.set(x, 4, WALL)
    w.set(0, 3, WALL)
    w.set(4, 3, WALL)
    w.set(2, 3, STONE)
    w.set(1, 3, LAVA)
    w.set(3, 3, LAVA)
    w.set(2, 2, LAVA)
    let melted = false
    for (let t = 0; t < 600 && !melted; t++) {
      w.step()
      if (w.get(2, 3) === LAVA) melted = true
    }
    expect(melted).toBe(true)
  },
  [key(LAVA, GLASS)]: () => {
    // Isolated specimen, same scheme as lava+stone: the glass cell can only
    // ever read LAVA via the melt.
    const w = new World(5, 6, 7)
    for (let x = 0; x < 5; x++) w.set(x, 4, WALL)
    w.set(0, 3, WALL)
    w.set(4, 3, WALL)
    w.set(2, 3, GLASS)
    w.set(1, 3, LAVA)
    w.set(3, 3, LAVA)
    w.set(2, 2, LAVA)
    let melted = false
    for (let t = 0; t < 900 && !melted; t++) {
      w.step()
      if (w.get(2, 3) === LAVA) melted = true
    }
    expect(melted).toBe(true)
  },
  [key(SAND, FIRE)]: () => {
    // Torch row buried under a sand pour: every covered flame dies at once
    // (natural life runs to 71 ticks, so survivors at t=45 would prove the
    // smother missing) and the sand lands on the floor it cleared.
    const w = new World(10, 30, 21)
    for (let x = 0; x < 10; x++) w.set(x, 29, FIRE)
    for (let x = 0; x < 10; x++) for (let y = 4; y < 8; y++) w.set(x, y, SAND)
    for (let t = 0; t < 45; t++) w.step()
    expect(w.countOf(FIRE)).toBe(0)
    let sandOnFloor = 0
    for (let x = 0; x < 10; x++) if (w.get(x, 29) === SAND) sandOnFloor++
    expect(sandOnFloor).toBeGreaterThan(5)
  },
  [key(STEAM, GLASS)]: () => {
    const w = new World(20, 30, 7)
    for (let x = 0; x < 20; x++) w.set(x, 10, GLASS) // a pane over a boiler
    w.paintDisk(10, 20, 4, STEAM)
    for (let t = 0; t < 120; t++) w.step()
    expect(w.countOf(WATER)).toBeGreaterThan(0)
  },
  [key(WOOD, FIRE)]: () => {
    // Ignition: flame held to a log catches it (meta > 0 = burning).
    const w = new World(20, 20, 19)
    for (let x = 5; x < 15; x++) w.set(x, 19, WOOD)
    let caught = false
    for (let t = 0; t < 120 && !caught; t++) {
      w.paintDisk(10, 17, 2, FIRE, 0.5)
      w.step()
      for (let x = 5; x < 15; x++) if (w.meta[19 * 20 + x] > 0) caught = true
    }
    expect(caught).toBe(true)
    // Burn-through: isolated burning beams crumble, some into ash-dust
    // (isolated in mid-air so their own flames — which rise — can't consume
    // the ash, which falls).
    const w2 = new World(60, 40, 19)
    for (let k = 0; k < 14; k++) {
      w2.set(4 + k * 4, 20, WOOD)
      w2.meta[20 * 60 + 4 + k * 4] = 1
    }
    for (let t = 0; t < 250; t++) w2.step()
    expect(w2.countOf(WOOD)).toBe(0) // all burnt through
    expect(w2.countOf(DUST)).toBeGreaterThan(0) // and left ash behind
  },
  [key(WOOD, LAVA)]: () => {
    const w = new World(20, 20, 19)
    for (let x = 0; x < 20; x++) w.set(x, 19, WOOD)
    for (let x = 8; x < 12; x++) w.set(x, 17, LAVA)
    let caught = false
    for (let t = 0; t < 400 && !caught; t++) {
      w.step()
      for (let x = 0; x < 20; x++)
        if (w.get(x, 19) === WOOD && w.meta[19 * 20 + x] > 0) caught = true
      if (w.countOf(WOOD) < 20) caught = true // or already burnt through
    }
    expect(caught).toBe(true)
  },
  [key(WOOD, WATER)]: () => {
    // Douse: a burning log with water pinned beside it stops burning.
    const w = new World(10, 10, 19)
    w.set(3, 9, WALL) // pin the water so it can't flow away first
    w.set(5, 9, WOOD)
    w.meta[9 * 10 + 5] = 10 // mid-burn
    w.set(4, 9, WATER)
    w.step()
    expect(w.get(5, 9)).toBe(WOOD)
    expect(w.meta[9 * 10 + 5]).toBe(0) // the char survives, fire is out
  },
  [key(SEED, MUD)]: () => {
    const w = new World(20, 20, 23)
    for (let x = 0; x < 20; x++) w.set(x, 19, MUD)
    w.set(10, 5, SEED)
    for (let t = 0; t < 400; t++) w.step()
    expect(w.countOf(PLANT)).toBeGreaterThan(0)
  },
  [key(SEED, WATER)]: () => {
    // Wet sand sprouts a seed that lands beside a puddle.
    const w = new World(20, 20, 23)
    for (let x = 0; x < 20; x++) w.set(x, 19, SAND)
    for (let x = 0; x < 6; x++) w.set(x, 18, WATER)
    w.set(7, 5, SEED)
    for (let t = 0; t < 600; t++) w.step()
    expect(w.countOf(PLANT)).toBeGreaterThan(0)
  },
  [key(SEED, FIRE)]: () => {
    const w = new World(10, 10, 23)
    w.set(5, 9, SEED)
    w.set(4, 9, FIRE)
    let popped = false
    for (let t = 0; t < 30 && !popped; t++) {
      w.paintDisk(4, 9, 1, FIRE, 0.5)
      w.step()
      if (w.countOf(SEED) === 0) popped = true
    }
    expect(popped).toBe(true)
  },
  [key(SEED, LAVA)]: () => {
    const w = new World(10, 12, 23)
    for (let x = 0; x < 10; x++) w.set(x, 11, LAVA)
    w.set(5, 3, SEED)
    for (let t = 0; t < 60; t++) w.step()
    expect(w.countOf(SEED)).toBe(0)
  },
  [key(PLANT, WATER)]: () => {
    const w = new World(20, 20, 23)
    for (let x = 0; x < 20; x++) for (let y = 15; y < 20; y++) w.set(x, y, WATER)
    w.set(10, 14, PLANT) // a sprig resting on the pond's surface
    const plant0 = w.countOf(PLANT)
    const water0 = w.countOf(WATER)
    for (let t = 0; t < 400; t++) w.step()
    expect(w.countOf(PLANT)).toBeGreaterThan(plant0 + 4) // grew around the pond…
    expect(w.countOf(WATER)).toBeGreaterThan(water0 * 0.5) // …without draining it
  },
  [key(PLANT, FIRE)]: () => {
    const w = new World(20, 20, 23)
    for (let x = 0; x < 20; x++) w.set(x, 19, PLANT)
    w.paintDisk(10, 17, 2, FIRE)
    for (let t = 0; t < 200; t++) w.step()
    expect(w.countOf(PLANT)).toBeLessThan(20)
  },
  [key(PLANT, LAVA)]: () => {
    const w = new World(20, 20, 23)
    for (let x = 0; x < 20; x++) w.set(x, 19, PLANT)
    for (let x = 8; x < 12; x++) w.set(x, 17, LAVA)
    for (let t = 0; t < 200; t++) w.step()
    expect(w.countOf(PLANT)).toBeLessThan(20)
  },
  [key(ICE, WATER)]: () => {
    const w = new World(20, 20, 29)
    for (let x = 0; x < 20; x++) for (let y = 15; y < 20; y++) w.set(x, y, WATER)
    w.set(10, 14, ICE) // seed crystal on the pond
    const ice0 = w.countOf(ICE)
    for (let t = 0; t < 600; t++) w.step()
    expect(w.countOf(ICE)).toBeGreaterThan(ice0) // the glacier crept
  },
  [key(ICE, FIRE)]: () => {
    const w = new World(10, 10, 29)
    w.set(5, 9, ICE)
    let melted = false
    for (let t = 0; t < 80 && !melted; t++) {
      w.paintDisk(4, 8, 1, FIRE, 0.6)
      w.step()
      if (w.countOf(ICE) === 0) melted = true
    }
    expect(melted).toBe(true)
  },
  [key(ICE, LAVA)]: () => {
    // R3: both pay — the meeting yields water AND stone. Products may be
    // consumed again by the remaining pool (stone remelts, water boils), so
    // observe their existence during the run, not just at the end.
    const w = new World(12, 12, 29)
    for (let x = 0; x < 12; x++) w.set(x, 11, ICE)
    for (let x = 4; x < 8; x++) w.set(x, 9, LAVA)
    let sawWater = false
    let sawStone = false
    for (let t = 0; t < 200 && !(sawWater && sawStone); t++) {
      w.step()
      if (w.countOf(WATER) + w.countOf(STEAM) > 0) sawWater = true
      if (w.countOf(STONE) > 0) sawStone = true
    }
    expect(sawWater).toBe(true)
    expect(sawStone).toBe(true)
  },
  [key(ICE, STEAM)]: () => {
    const w = new World(20, 30, 29)
    for (let x = 0; x < 20; x++) w.set(x, 10, ICE) // cold ceiling
    w.paintDisk(10, 20, 4, STEAM)
    for (let t = 0; t < 120; t++) w.step()
    expect(w.countOf(WATER)).toBeGreaterThan(0)
  },
  [key(ICE, SAND)]: () => {
    // R32's observable is the footprint: the same pour scatters into a wide
    // drift on ice (grains skate to the edges) vs a tight pyramid on stone.
    expect(pourFootprint(SAND, ICE)).toBeGreaterThan(pourFootprint(SAND, STONE) * 1.5)
  },
}

/** Columns occupied by the powder after a fixed pour + settle. */
function pourFootprint(powder: number, floor: number): number {
  const w = new World(61, 40, 29)
  for (let x = 0; x < 61; x++) w.set(x, 39, floor)
  for (let t = 0; t < 100; t++) {
    w.set(30, 0, powder)
    w.step()
  }
  for (let t = 0; t < 400; t++) w.step()
  let cols = 0
  for (let x = 0; x < 61; x++) {
    for (let y = 0; y < 39; y++)
      if (w.get(x, y) === powder) {
        cols++
        break
      }
  }
  return cols
}

// ---- unary probes ---------------------------------------------------------

const UNARY_PROBES: Record<number, Probe> = {
  [FIRE]: () => {
    const w = new World(30, 40, 11)
    for (let t = 0; t < 40; t++) {
      w.paintDisk(15, 35, 5, FIRE, 0.5)
      w.step()
    }
    expect(w.countOf(SMOKE)).toBeGreaterThan(0)
  },
  [SMOKE]: () => {
    // Soot forms as plumes die — though lingering flames may re-burn it, so
    // observe its existence during the decay, not just at the end.
    const w = new World(30, 40, 11)
    for (let t = 0; t < 120; t++) {
      w.paintDisk(15, 35, 5, FIRE, 0.5)
      w.step()
    }
    let sawSoot = false
    for (let t = 0; t < 650; t++) {
      w.step()
      if (w.countOf(DUST) > 0) sawSoot = true
    }
    expect(w.countOf(SMOKE)).toBe(0)
    expect(sawSoot).toBe(true)
  },
  [STEAM]: () => {
    const w = new World(20, 20, 5)
    w.paintDisk(10, 15, 3, STEAM)
    for (let t = 0; t < 400; t++) w.step()
    expect(w.countOf(STEAM)).toBe(0)
    expect(w.countOf(WATER)).toBeGreaterThan(0) // some of it rained back
  },
  [LAVA]: () => {
    const w = new World(30, 30, 5)
    for (let x = 0; x < 30; x++) for (let y = 25; y < 30; y++) w.set(x, y, LAVA)
    for (let t = 0; t < 900; t++) w.step()
    expect(w.countOf(STONE)).toBeGreaterThan(0) // crusted
  },
  [STONE]: () => {
    const w = new World(200, 60, 17)
    w.set(10, 58, STONE)
    for (let t = 0; t < 5; t++) w.step()
    w.setImpulse(10, 59, 28, -18)
    for (let t = 0; t < 150; t++) w.step()
    expect(w.countOf(SAND)).toBe(1) // smashed on landing
    expect(w.countOf(STONE)).toBe(0)
  },
}

describe('pair probes (every special reaction observably fires)', () => {
  for (const { a, b, effect } of INTERACTIONS) {
    it(`${elementName(a)} + ${elementName(b)} — ${effect}`, () => {
      PAIR_PROBES[key(a, b)]()
    })
  }
})

describe('unary probes', () => {
  for (const { el, effect } of UNARY) {
    it(`${elementName(el)} — ${effect}`, () => {
      UNARY_PROBES[el]()
    })
  }
})
