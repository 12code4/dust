/**
 * Deterministic xorshift32 PRNG. The entire simulation draws randomness from
 * one of these, so (seed + inputs) fully determines every frame — the property
 * that makes golden-frame tests, replays, and URL saves possible.
 */
export class Prng {
  private s: number

  constructor(seed: number) {
    // 0 is a fixed point of xorshift; nudge it.
    this.s = (seed | 0) || 0x9e3779b9
  }

  /** Uniform u32. */
  next(): number {
    let x = this.s
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    // State stays int32 (`| 0`) so V8 keeps the field as a Smi — storing the
    // u32 form forces a heap-double field and costs ~19% of every sim tick.
    // Same 32 bits either way; the u32 view is materialized only on return.
    this.s = x | 0
    return x >>> 0
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return this.next() % n
  }

  /** True with probability p (p in [0,1]). */
  chance(p: number): boolean {
    return this.next() < p * 4294967296
  }

  /** Uniformly -1 or +1. */
  sign(): number {
    return (this.next() & 1) === 0 ? -1 : 1
  }
}
