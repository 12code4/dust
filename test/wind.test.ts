import { describe, expect, it } from 'vitest'
import { World } from '../src/sim/world.ts'
import { Wind } from '../src/sim/wind.ts'
import { WALL, SAND, WATER, MUD, FIRE, STEAM } from '../src/sim/elements.ts'

function centroidX(w: World, el: number): number {
  let sum = 0
  let n = 0
  for (let y = 0; y < w.h; y++)
    for (let x = 0; x < w.w; x++)
      if (w.get(x, y) === el) {
        sum += x
        n++
      }
  return n === 0 ? -1 : sum / n
}

describe('wind field', () => {
  it('is deterministic: same impulses → identical fields', () => {
    const a = new Wind(120, 90)
    const b = new Wind(120, 90)
    for (const wind of [a, b]) {
      wind.addImpulse(60, 45, 2, -1, 20)
      wind.addPressure(80, 30, -2, 12)
      for (let t = 0; t < 50; t++) {
        wind.step()
        if (t === 25) wind.addImpulse(30, 60, -1.5, 0.5, 12)
      }
    }
    expect(a.vx).toEqual(b.vx)
    expect(a.vy).toEqual(b.vy)
    expect(a.p).toEqual(b.p)
  })

  it('decays back to a dead calm, even after a pressure blast', () => {
    const wind = new Wind(120, 90)
    wind.addImpulse(60, 45, 3, 3, 30)
    wind.addPressure(60, 45, 6, 24) // explosion-sized spike
    for (let t = 0; t < 500; t++) wind.step()
    for (let i = 0; i < wind.vx.length; i++) {
      expect(Math.abs(wind.vx[i])).toBeLessThan(0.01)
      expect(Math.abs(wind.vy[i])).toBeLessThan(0.01)
      expect(Math.abs(wind.p[i])).toBeLessThan(0.01)
    }
  })

  it('a low-pressure zone sucks the surrounding air inward', () => {
    const wind = new Wind(120, 90)
    for (let t = 0; t < 10; t++) {
      wind.addPressure(60, 45, -1.5, 10) // sustained vacuum, like the tool
      wind.step()
    }
    // Left of the vacuum air flows right (toward it); right of it flows left.
    expect(wind.vx[wind.cellIndex(44, 45)]).toBeGreaterThan(0.05)
    expect(wind.vx[wind.cellIndex(76, 45)]).toBeLessThan(-0.05)
    // Above it flows down; below it flows up.
    expect(wind.vy[wind.cellIndex(60, 29)]).toBeGreaterThan(0.05)
    expect(wind.vy[wind.cellIndex(60, 61)]).toBeLessThan(-0.05)
  })

  it('gusts spread to neighboring cells (diffusion)', () => {
    const wind = new Wind(120, 90)
    wind.perturb(60, 45, 3, 0)
    for (let t = 0; t < 5; t++) wind.step()
    // A cell two over from the impulse point now feels some of it.
    const i = wind.cellIndex(68, 45)
    expect(wind.vx[i]).toBeGreaterThan(0.01)
  })
})

describe('wind meets walls', () => {
  it('does not blow through a wall, and deflects along it', () => {
    const w = new World(120, 60, 3)
    for (let y = 0; y < 60; y++) w.set(60, y, WALL) // full-height wall
    for (let t = 0; t < 30; t++) {
      w.wind.addImpulse(40, 30, 2.5, 0, 16) // steady rightward blow at the wall
      w.step()
    }
    // Downwind of the wall: still air. (Wall occupies air-cell column 15.)
    for (let cy = 0; cy < w.wind.ch; cy++) {
      for (let cx = 17; cx < w.wind.cw; cx++) {
        const i = cy * w.wind.cw + cx
        expect(Math.abs(w.wind.vx[i])).toBeLessThan(0.05)
        expect(Math.abs(w.wind.vy[i])).toBeLessThan(0.05)
      }
    }
    // Upwind face: the into-wall component is killed…
    const face = w.wind.cellIndex(56, 30)
    expect(w.wind.vx[face]).toBeLessThanOrEqual(0)
    // …but air escapes along the wall: somewhere on the face, tangential flow.
    let tangential = 0
    for (let cy = 0; cy < w.wind.ch; cy++) {
      tangential = Math.max(tangential, Math.abs(w.wind.vy[cy * w.wind.cw + 14]))
    }
    expect(tangential).toBeGreaterThan(0.05)
  })

  it('erasing a wall lets wind through again', () => {
    const w = new World(80, 40, 3)
    for (let y = 0; y < 40; y++) w.set(40, y, WALL)
    for (let y = 0; y < 40; y++) w.set(40, y, 0) // erase it
    for (let t = 0; t < 20; t++) {
      w.wind.addImpulse(20, 20, 2.5, 0, 12)
      w.step()
    }
    const beyond = w.wind.cellIndex(56, 20)
    expect(w.wind.vx[beyond]).toBeGreaterThan(0.05)
  })
})

describe('water flows like a stream, not a queue of soldiers', () => {
  it('queued water follows the flow instead of bouncing backward', () => {
    // A 1-high channel: floor and ceiling, three waters heading right.
    const w = new World(60, 10, 8)
    for (let x = 0; x < 60; x++) {
      w.set(x, 4, WALL)
      w.set(x, 6, WALL)
    }
    for (const x of [5, 6, 7]) {
      w.set(x, 5, WATER)
      w.meta[5 * 60 + x] = 1 // heading right
    }
    for (let t = 0; t < 15; t++) w.step()
    // All three should have advanced well to the right; with flip-on-block
    // the rear ones wandered backward instead.
    let minX = 60
    let n = 0
    for (let x = 0; x < 60; x++)
      if (w.get(x, 5) === WATER) {
        minX = Math.min(minX, x)
        n++
      }
    expect(n).toBe(3)
    expect(minX).toBeGreaterThan(9)
  })
})

describe('wind on particles', () => {
  it('a strong crosswind shoves settled sand off its pile', () => {
    const w = new World(80, 40, 7)
    for (let y = 32; y < 40; y++) for (let x = 10; x < 30; x++) w.set(x, y, SAND)
    for (let t = 0; t < 100; t++) w.step() // let it settle
    for (let t = 0; t < 80; t++) {
      w.wind.addImpulse(18, 30, 2.5, 0, 20) // gale across the pile's top
      w.step()
    }
    let displaced = 0
    for (let y = 0; y < 40; y++)
      for (let x = 34; x < 80; x++) if (w.get(x, y) === SAND) displaced++
    expect(displaced).toBeGreaterThan(10) // grains blown well past the pile
    expect(w.countOf(SAND)).toBe(160)
  })

  it('a gale tears spray off a pond', () => {
    const w = new World(120, 60, 9)
    for (let x = 10; x < 50; x++) for (let y = 50; y < 60; y++) w.set(x, y, WATER)
    for (let t = 0; t < 80; t++) {
      w.wind.addImpulse(30, 47, 3.5, -0.5, 24)
      w.step()
    }
    let blown = 0
    for (let y = 0; y < 60; y++)
      for (let x = 56; x < 120; x++) {
        const el = w.get(x, y)
        if (el === WATER || el === MUD) blown++
      }
    expect(blown).toBeGreaterThan(15) // a visible stream left the pond
  })

  it('steam rides a crosswind', () => {
    const w = new World(120, 60, 9)
    w.paintDisk(30, 40, 5, STEAM)
    const x0 = centroidX(w, STEAM)
    for (let t = 0; t < 30; t++) {
      w.wind.addImpulse(30 + t, 35, 2, 0, 30) // sustained rightward blow
      w.step()
    }
    const x1 = centroidX(w, STEAM)
    expect(x1).toBeGreaterThan(x0 + 10)
  })

  it('calm air moves nothing: a fully settled scene is bit-stable', () => {
    // Full-width slab: no open diagonals or horizontals anywhere, so the only
    // thing that could disturb it is the wind layer — which must stay silent.
    const a = new World(60, 60, 4)
    for (let x = 0; x < 60; x++) for (let y = 50; y < 60; y++) a.set(x, y, WATER)
    for (let t = 0; t < 20; t++) a.step()
    const hash0 = a.hash()
    for (let t = 0; t < 50; t++) a.step()
    expect(a.hash()).toBe(hash0)
  })

  it('fire stirs the air above it (convection updraft)', () => {
    const w = new World(60, 60, 9)
    for (let t = 0; t < 20; t++) {
      w.paintDisk(30, 50, 6, FIRE, 0.6) // keep the blaze fed
      w.step()
    }
    const i = w.wind.cellIndex(30, 44)
    expect(w.wind.vy[i]).toBeLessThan(-0.05) // negative y = upward
  })
})

describe('falling clumps stay clumps', () => {
  it('a water blob in freefall drifts a little but never sprays to the walls', () => {
    const w = new World(120, 160, 6)
    // 12-wide blob dropped from high up; the floor is ~150 rows below.
    for (let y = 5; y < 11; y++) for (let x = 54; x < 66; x++) w.set(x, y, WATER)
    for (let t = 0; t < 40; t++) w.step() // still airborne
    let minX = 120
    let maxX = 0
    for (let y = 0; y < 160; y++)
      for (let x = 0; x < 120; x++)
        if (w.get(x, y) === WATER) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
        }
    // Wobble-drift widens it somewhat; the old bug spread it wall to wall.
    expect(maxX - minX).toBeLessThan(40)
    expect(w.countOf(WATER)).toBe(72)
  })
})

describe('water freefall wobble', () => {
  it('a dripping stream spreads across several columns mid-air', () => {
    const w = new World(41, 80, 11)
    for (let t = 0; t < 40; t++) {
      w.set(20, 0, WATER)
      w.step()
    }
    const cols = new Set<number>()
    for (let y = 0; y < 60; y++)
      for (let x = 0; x < 41; x++) if (w.get(x, y) === WATER) cols.add(x)
    expect(cols.size).toBeGreaterThan(3)
  })
})
