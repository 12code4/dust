import { describe, expect, it } from 'vitest'
import { World } from '../src/sim/world.ts'
import { ELEMENT_PROPS, INTERACTIONS, UNARY, IMPLEMENTED, elementName } from '../src/sim/data.ts'
import { WINDAGE, ELEMENT_COUNT, SHADES, ELEMENT_NAMES } from '../src/sim/elements.ts'
import { WALL, SAND, WATER, FIRE, STEAM, DUST, SMOKE, MUD, LAVA, STONE, GLASS } from '../src/sim/elements.ts'

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
    w.step()
    expect(w.countOf(FIRE)).toBe(0)
    expect(w.countOf(STEAM)).toBeGreaterThan(0)
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
    const w = new World(30, 40, 11)
    for (let t = 0; t < 120; t++) {
      w.paintDisk(15, 35, 5, FIRE, 0.5)
      w.step()
    }
    for (let t = 0; t < 500; t++) w.step()
    expect(w.countOf(SMOKE)).toBe(0)
    expect(w.countOf(DUST)).toBeGreaterThan(0)
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
