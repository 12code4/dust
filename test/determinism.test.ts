import { describe, expect, it } from 'vitest'
import { World } from '../src/sim/world.ts'
import { SAND, WATER, FIRE, WALL } from '../src/sim/elements.ts'

/**
 * Fingerprint of the canonical scene after 600 ticks. If a sim change is
 * intended to alter behavior, recompute (scripts in bench/golden style) and
 * update this constant in the same reviewed commit.
 */
const GOLDEN_HASH = 0xb5b6d1fe

/** A busy scripted scene: shelves, pours, and a fire — same for both worlds. */
function script(w: World): void {
  for (let x = 10; x < 60; x++) w.set(x, 40, WALL)
  for (let x = 40; x < 90; x++) w.set(x, 70, WALL)
  w.paintDisk(30, 10, 9, SAND)
  w.paintDisk(60, 5, 9, WATER)
  w.paintDisk(70, 70, 5, FIRE)
}

describe('determinism', () => {
  it('same seed + same inputs → identical grids, tick for tick', () => {
    const a = new World(120, 90, 12345)
    const b = new World(120, 90, 12345)
    script(a)
    script(b)
    for (let t = 0; t < 600; t++) {
      a.step()
      b.step()
    }
    expect(a.hash()).toBe(b.hash())
    expect(a.cells).toEqual(b.cells)
  })

  it('different seeds diverge (the randomness is actually used)', () => {
    const a = new World(120, 90, 1)
    const b = new World(120, 90, 2)
    script(a)
    script(b)
    for (let t = 0; t < 120; t++) {
      a.step()
      b.step()
    }
    expect(a.hash()).not.toBe(b.hash())
  })

  it('golden frame: the canonical scene fingerprint is stable', () => {
    // If this fails, the sim's behavior changed. If the change was intended,
    // rerun and update the constant — deliberately, in a reviewed commit.
    const w = new World(120, 90, 12345)
    script(w)
    for (let t = 0; t < 600; t++) w.step()
    expect(w.hash()).toBe(GOLDEN_HASH)
  })
})
