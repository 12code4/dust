import { describe, expect, it } from 'vitest'
import { World } from '../src/sim/world.ts'
import {
  EMPTY,
  WALL,
  SAND,
  WATER,
  FIRE,
  STEAM,
  DUST,
  SMOKE,
  MUD,
} from '../src/sim/elements.ts'

describe('sand', () => {
  it('falls straight down through empty space', () => {
    const w = new World(20, 20, 42)
    w.set(10, 0, SAND)
    for (let t = 0; t < 30; t++) w.step()
    expect(w.get(10, 19)).toBe(SAND)
    expect(w.countOf(SAND)).toBe(1)
  })

  it('piles instead of stacking into a single column', () => {
    const w = new World(41, 40, 42)
    for (let t = 0; t < 300; t++) {
      w.set(20, 0, SAND)
      w.step()
    }
    for (let t = 0; t < 200; t++) w.step()
    // A 1-wide tower of 300 grains would be impossible; a pile is wide.
    let width = 0
    for (let x = 0; x < 41; x++) if (w.get(x, 39) === SAND) width++
    expect(width).toBeGreaterThan(10)
  })

  it('sinks through water', () => {
    const w = new World(11, 30, 42)
    // Water pool on the floor, sand dropped in the middle. Freefall wobble
    // means it may not land dead-center — but it must reach the floor.
    for (let x = 0; x < 11; x++)
      for (let y = 24; y < 30; y++) w.set(x, y, WATER)
    w.set(5, 0, SAND)
    for (let t = 0; t < 200; t++) w.step()
    // Under water long enough, the grain may have wetted into mud — either
    // way it must have reached the floor through the pool.
    let onFloor = false
    for (let x = 0; x < 11; x++) {
      const el = w.get(x, 29)
      if (el === SAND || el === MUD) onFloor = true
    }
    expect(onFloor).toBe(true)
  })
})

describe('water', () => {
  it('spreads out to level in a basin', () => {
    const w = new World(60, 30, 42)
    // Drop a 4-wide column of water; it should end up much wider than 4.
    for (let y = 0; y < 20; y++)
      for (let x = 28; x < 32; x++) w.set(x, y, WATER)
    for (let t = 0; t < 400; t++) w.step()
    let bottomWidth = 0
    for (let x = 0; x < 60; x++) if (w.get(x, 29) === WATER) bottomWidth++
    expect(bottomWidth).toBeGreaterThan(30)
    expect(w.countOf(WATER)).toBe(80) // conserved
  })

  it('is contained by walls', () => {
    const w = new World(30, 30, 7)
    for (let y = 0; y < 30; y++) w.set(15, y, WALL) // divider
    for (let x = 0; x < 10; x++) w.set(x, 5, WATER)
    for (let t = 0; t < 300; t++) w.step()
    for (let x = 16; x < 30; x++)
      for (let y = 0; y < 30; y++) expect(w.get(x, y)).not.toBe(WATER)
  })
})

describe('fire and steam', () => {
  it('burns out and disappears without fuel', () => {
    const w = new World(30, 30, 42)
    w.paintDisk(15, 25, 4, FIRE)
    expect(w.countOf(FIRE)).toBeGreaterThan(0)
    for (let t = 0; t < 200; t++) w.step()
    expect(w.countOf(FIRE)).toBe(0)
    // What remains is exhaust: steam, smoke, soot-dust, and condensed rain.
    expect(w.count).toBe(
      w.countOf(STEAM) + w.countOf(SMOKE) + w.countOf(DUST) + w.countOf(WATER),
    )
  })

  it('is quenched by water into steam', () => {
    const w = new World(20, 20, 42)
    // Fire directly under a slab of water: every flame must touch water.
    // (A flame can dodge briefly by swapping through fresh steam.)
    for (let x = 0; x < 20; x++) w.set(x, 10, FIRE)
    for (let x = 0; x < 20; x++) w.set(x, 9, WATER)
    for (let t = 0; t < 5; t++) w.step()
    expect(w.countOf(FIRE)).toBe(0)
    expect(w.countOf(STEAM)).toBe(20)
  })

  it('steam eventually dissipates or falls back as rain', () => {
    const w = new World(20, 20, 42)
    w.paintDisk(10, 15, 3, STEAM)
    for (let t = 0; t < 300; t++) w.step()
    expect(w.countOf(STEAM)).toBe(0)
    expect(w.count).toBe(w.countOf(WATER)) // whatever remains is rainfall
  })
})

describe('movement contracts (one move per particle per tick)', () => {
  // These pin the `updated`-guard behavior directly. The golden hash also
  // covers it, but the golden's documented workflow is "regenerate when a
  // change is intended" — these tests make a guard regression loud even when
  // bundled with an intentional change (verified: deleting the guard lets
  // steam climb 6 rows in one tick while every other behavior test passes).

  function findY(w: World, el: number): number {
    for (let y = 0; y < w.h; y++)
      for (let x = 0; x < w.w; x++) if (w.get(x, y) === el) return y
    return -1
  }

  it('sand falls exactly one row per tick', () => {
    const w = new World(9, 40, 5)
    w.set(4, 0, SAND)
    for (let t = 1; t <= 20; t++) {
      w.step()
      expect(findY(w, SAND)).toBe(t)
    }
  })

  it('steam rises at most one row per tick', () => {
    const w = new World(21, 60, 5)
    w.set(10, 50, STEAM)
    let prevY = 50
    for (let t = 0; t < 30; t++) {
      w.step()
      const y = findY(w, STEAM)
      expect(y).toBeGreaterThanOrEqual(prevY - 1) // never more than one row up
      prevY = y
    }
  })

  it('fire rises at most one row per tick, and does actually rise', () => {
    const w = new World(21, 60, 5)
    w.set(10, 55, FIRE)
    let prevY = 55
    let minY = 55
    while (w.countOf(FIRE) > 0) {
      w.step()
      const y = findY(w, FIRE)
      if (y === -1) break
      expect(y).toBeGreaterThanOrEqual(prevY - 1)
      prevY = y
      if (y < minY) minY = y
    }
    expect(minY).toBeLessThan(45) // rose ≥10 rows within its lifetime
  })
})

describe('world invariants', () => {
  it('enforces the dot budget', () => {
    const w = new World(100, 100, 1, 500)
    for (let y = 0; y < 100; y++)
      for (let x = 0; x < 100; x++) w.set(x, y, SAND)
    expect(w.count).toBe(500)
    expect(w.countOf(SAND)).toBe(500)
  })

  it('walls do not count against the budget and overwrite dots', () => {
    const w = new World(10, 10, 1, 5)
    for (let x = 0; x < 10; x++) w.set(x, 9, WALL)
    expect(w.count).toBe(0)
    w.set(0, 0, SAND)
    expect(w.count).toBe(1)
    w.set(0, 0, WALL)
    expect(w.count).toBe(0)
    expect(w.get(0, 0)).toBe(WALL)
  })

  it('erasing returns budget', () => {
    const w = new World(10, 10, 1, 5)
    for (let i = 0; i < 5; i++) w.set(i, 0, SAND)
    expect(w.set(9, 9, SAND)).toBe(false)
    w.set(0, 0, EMPTY)
    expect(w.set(9, 9, SAND)).toBe(true)
  })

  it('keeps count consistent with the grid through heavy churn', () => {
    const w = new World(80, 60, 99)
    w.paintDisk(20, 10, 8, SAND)
    w.paintDisk(40, 10, 8, WATER)
    w.paintDisk(60, 40, 6, FIRE)
    for (let x = 30; x < 50; x++) w.set(x, 50, WALL)
    for (let t = 0; t < 500; t++) w.step()
    const live =
      w.countOf(SAND) +
      w.countOf(WATER) +
      w.countOf(FIRE) +
      w.countOf(STEAM) +
      w.countOf(DUST) +
      w.countOf(SMOKE) +
      w.countOf(MUD)
    expect(w.count).toBe(live)
  })
})
