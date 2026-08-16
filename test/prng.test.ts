import { describe, expect, it } from 'vitest'
import { Prng } from '../src/sim/prng.ts'

describe('prng', () => {
  it('produces the canonical xorshift32 sequence — the save/replay compatibility pin', () => {
    // These constants pin the exact output stream that saves, replays, and the
    // golden-frame hash depend on. Changing the PRNG breaks every previously
    // shared save; this test exists so that break is loud and deliberate,
    // never absorbed into a routine GOLDEN_HASH regeneration.
    const r = new Prng(1)
    expect(r.next()).toBe(270369)
    expect(r.next()).toBe(67634689)
    expect(r.next()).toBe(2647435461)
  })

  it('nudges the zero seed off the xorshift fixed point', () => {
    const r = new Prng(0)
    expect(r.next()).not.toBe(0)
    expect(new Prng(0).next()).toBe(new Prng(0x9e3779b9).next())
  })

  it('chance() is exact at the extremes', () => {
    const r = new Prng(7)
    for (let i = 0; i < 1000; i++) {
      expect(r.chance(1)).toBe(true)
      expect(r.chance(0)).toBe(false)
    }
  })

  it('int(n) stays in [0, n) and sign() in {-1, +1}', () => {
    const r = new Prng(7)
    for (let i = 0; i < 1000; i++) {
      const v = r.int(48)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(48)
      expect([-1, 1]).toContain(r.sign())
    }
  })
})
