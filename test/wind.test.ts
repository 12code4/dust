import { describe, expect, it } from 'vitest'
import { World } from '../src/sim/world.ts'
import { Wind } from '../src/sim/wind.ts'
import { WALL, WATER, FIRE, STEAM } from '../src/sim/elements.ts'

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
      for (let t = 0; t < 50; t++) {
        wind.step()
        if (t === 25) wind.addImpulse(30, 60, -1.5, 0.5, 12)
      }
    }
    expect(a.vx).toEqual(b.vx)
    expect(a.vy).toEqual(b.vy)
  })

  it('decays back to a dead calm', () => {
    const wind = new Wind(120, 90)
    wind.addImpulse(60, 45, 3, 3, 30)
    for (let t = 0; t < 400; t++) wind.step()
    for (let i = 0; i < wind.vx.length; i++) {
      expect(Math.abs(wind.vx[i])).toBeLessThan(0.01)
      expect(Math.abs(wind.vy[i])).toBeLessThan(0.01)
    }
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
