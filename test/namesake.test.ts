import { describe, expect, it } from 'vitest'
import { World } from '../src/sim/world.ts'
import { WALL, SAND, WATER, FIRE, DUST, SMOKE, MUD } from '../src/sim/elements.ts'

function maxPressure(w: World): number {
  let m = 0
  for (let i = 0; i < w.wind.p.length; i++) if (w.wind.p[i] > m) m = w.wind.p[i]
  return m
}

describe('dust, the namesake', () => {
  it('rides wind that sand shrugs off', () => {
    const mk = (el: number) => {
      const w = new World(120, 60, 9)
      for (let y = 50; y < 60; y++) for (let x = 20; x < 40; x++) w.set(x, y, el)
      for (let t = 0; t < 60; t++) w.step() // settle
      for (let t = 0; t < 60; t++) {
        w.wind.addImpulse(30, 46, 2, -0.4, 20)
        w.step()
      }
      let moved = 0
      for (let y = 0; y < 60; y++)
        for (let x = 46; x < 120; x++) if (w.get(x, y) === el || w.get(x, y) === MUD) moved++
      return moved
    }
    const dustMoved = mk(DUST)
    const sandMoved = mk(SAND)
    expect(dustMoved).toBeGreaterThan(sandMoved * 2)
    expect(dustMoved).toBeGreaterThan(30)
  })

  it('settled drifts in calm air are bit-stable', () => {
    const w = new World(60, 40, 5)
    for (let x = 10; x < 50; x++) for (let y = 0; y < 4; y++) w.set(x, y, DUST)
    for (let t = 0; t < 400; t++) w.step() // fall + settle completely
    const h0 = w.hash()
    for (let t = 0; t < 40; t++) w.step()
    expect(w.hash()).toBe(h0)
  })

  it('wets into mud on water, and mud bakes back to sand', () => {
    const w = new World(40, 40, 7)
    for (let x = 0; x < 40; x++)
      for (let y = 34; y < 40; y++) w.set(x, y, WATER)
    w.paintDisk(20, 10, 3, DUST)
    for (let t = 0; t < 300; t++) w.step()
    expect(w.countOf(DUST)).toBe(0)
    const mud = w.countOf(MUD)
    expect(mud).toBeGreaterThan(0)
    // Bake: drain ALL the water, then torch the mud that settled below it.
    for (let x = 0; x < 40; x++) for (let y = 0; y < 40; y++) {
      if (w.get(x, y) === WATER) w.set(x, y, 0)
    }
    for (let t = 0; t < 400; t++) {
      w.paintDisk(20, 36, 4, FIRE, 0.4)
      w.step()
    }
    expect(w.countOf(SAND)).toBeGreaterThan(0)
  })

  it('fire exhales smoke, and smoke settles into soot-dust', () => {
    const w = new World(40, 60, 11)
    for (let t = 0; t < 120; t++) {
      w.paintDisk(20, 50, 5, FIRE, 0.5)
      w.step()
    }
    expect(w.countOf(SMOKE)).toBeGreaterThan(5)
    // Longest fire ≈ 240 ticks + smoke life ≤ 150: give every plume time.
    // Lingering flames may re-burn settled soot, so track that it ever formed.
    let sawSoot = false
    for (let t = 0; t < 650; t++) {
      w.step()
      if (w.countOf(DUST) > 0) sawSoot = true
    }
    expect(w.countOf(SMOKE)).toBe(0)
    expect(sawSoot).toBe(true) // ...and some of it came home
  })
})

describe('deflagration — the silo canary', () => {
  // If dust ever stops exploding, the build is culturally broken (docs/05).
  it('an airborne dust cloud meeting fire flashes and slams the pressure field', () => {
    const w = new World(100, 80, 13)
    w.paintDisk(50, 30, 8, DUST) // a hanging cloud, falling lazily
    w.paintDisk(50, 44, 4, FIRE) // flame rising to meet it
    const dust0 = w.countOf(DUST)
    let peakP = 0
    let peakFire = 0
    for (let t = 0; t < 50; t++) {
      w.step()
      peakP = Math.max(peakP, maxPressure(w))
      peakFire = Math.max(peakFire, w.countOf(FIRE))
    }
    expect(peakP).toBeGreaterThan(0.8) // the blast wave
    expect(peakFire).toBeGreaterThan(30) // the chain flash
    expect(w.countOf(DUST)).toBeLessThan(dust0 * 0.75) // the cloud burned
  })

  it('settled dust only smolders — no blast wave', () => {
    const w = new World(100, 80, 13)
    for (let x = 30; x < 60; x++)
      for (let y = 74; y < 80; y++) w.set(x, y, DUST)
    for (let t = 0; t < 60; t++) w.step() // fully at rest
    w.paintDisk(27, 77, 2, FIRE)
    let peakP = 0
    for (let t = 0; t < 25; t++) {
      w.paintDisk(27, 77, 2, FIRE, 0.5)
      w.step()
      peakP = Math.max(peakP, maxPressure(w))
    }
    // A real flash spikes ≥ 2.2; smolder churn's pressure noise sits well
    // under 1. The gap between those is what this canary guards.
    expect(peakP).toBeLessThan(1.0)
  })
})

describe('ballistics (the drag tool throw)', () => {
  it('a thrown grain flies in an arc and lands far away', () => {
    const w = new World(200, 60, 17)
    w.set(10, 58, SAND)
    for (let t = 0; t < 5; t++) w.step() // rests on the floor
    w.setImpulse(10, 59, 24, -20) // hard throw, up and to the right
    for (let t = 0; t < 120; t++) w.step()
    expect(w.countOf(SAND)).toBe(1)
    let fx = -1
    let fy = -1
    for (let y = 0; y < 60; y++)
      for (let x = 0; x < 200; x++) if (w.get(x, y) === SAND) {
        fx = x
        fy = y
      }
    expect(fx).toBeGreaterThan(30) // sailed well downrange
    expect(fy).toBeGreaterThan(50) // and came back to earth
  })

  it('flight cannot pass through walls', () => {
    const w = new World(100, 40, 17)
    for (let y = 0; y < 40; y++) w.set(50, y, WALL)
    w.set(10, 38, SAND)
    for (let t = 0; t < 3; t++) w.step()
    w.setImpulse(10, 39, 31, -8)
    for (let t = 0; t < 100; t++) w.step()
    expect(w.countOf(SAND)).toBe(1)
    for (let y = 0; y < 40; y++)
      for (let x = 51; x < 100; x++) expect(w.get(x, y)).not.toBe(SAND)
  })

  it('dragMove hauls a dot, reports its new index, and conserves it', () => {
    const w = new World(60, 40, 3)
    w.set(20, 39, WATER)
    const j = w.dragMove(20, 39, 5, -3)
    expect(j).toBe(36 * 60 + 25)
    expect(w.countOf(WATER)).toBe(1)
    expect(w.get(25, 36)).toBe(WATER)
  })

  it('held cells sit still against gravity until released', () => {
    const w = new World(20, 40, 3)
    w.set(10, 5, SAND)
    w.held = [5 * 20 + 10]
    for (let t = 0; t < 30; t++) w.step()
    expect(w.get(10, 5)).toBe(SAND) // suspended in the hand
    w.held = null
    for (let t = 0; t < 60; t++) w.step()
    let onFloor = false
    for (let x = 0; x < 20; x++) if (w.get(x, 39) === SAND) onFloor = true
    expect(onFloor).toBe(true) // released: falls (wobble may shift the column)
  })
})
