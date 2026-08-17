/**
 * The air field — Powder Game's invisible protagonist. A coarse velocity grid
 * (4×4 px cells, the PG/TPT standard) that everything breathes into and
 * everything rides on: fire feeds it updraft, the wind tool shoves it, and
 * every mover samples it. Unseen unless the flow filter is on.
 *
 * Per tick: semi-Lagrangian advection (gusts travel and curl), one diffusion
 * relaxation (gusts spread), exponential decay (calm returns). No pressure
 * projection — decay keeps the field stable, PG-style, and explosions will
 * inject impulses directly when they arrive.
 *
 * Determinism: pure Float32 arithmetic, no randomness in here — element
 * perturbations draw from the world PRNG before they reach the field.
 */
export class Wind {
  static readonly CELL = 4
  readonly cw: number
  readonly ch: number
  vx: Float32Array
  vy: Float32Array
  private bx: Float32Array
  private by: Float32Array

  constructor(w: number, h: number) {
    this.cw = Math.ceil(w / Wind.CELL)
    this.ch = Math.ceil(h / Wind.CELL)
    const n = this.cw * this.ch
    this.vx = new Float32Array(n)
    this.vy = new Float32Array(n)
    this.bx = new Float32Array(n)
    this.by = new Float32Array(n)
  }

  clear(): void {
    this.vx.fill(0)
    this.vy.fill(0)
  }

  /** Air-cell index for a particle position (pixel coords). */
  cellIndex(px: number, py: number): number {
    return (py >> 2) * this.cw + (px >> 2)
  }

  /** Add velocity directly to the cell containing (px, py). */
  perturb(px: number, py: number, dvx: number, dvy: number): void {
    const i = this.cellIndex(px, py)
    this.vx[i] += dvx
    this.vy[i] += dvy
  }

  /**
   * Blow wind around (px, py): a splat with linear falloff over `radius`
   * pixels. This is the wind tool (and, later, explosions).
   */
  addImpulse(px: number, py: number, dvx: number, dvy: number, radius: number): void {
    const cr = Math.max(1, Math.round(radius / Wind.CELL))
    const cx = px >> 2
    const cy = py >> 2
    for (let dy = -cr; dy <= cr; dy++) {
      const y = cy + dy
      if (y < 0 || y >= this.ch) continue
      for (let dx = -cr; dx <= cr; dx++) {
        const x = cx + dx
        if (x < 0 || x >= this.cw) continue
        const d2 = dx * dx + dy * dy
        if (d2 > cr * cr) continue
        const fall = 1 - Math.sqrt(d2) / (cr + 1)
        const i = y * this.cw + x
        this.vx[i] += dvx * fall
        this.vy[i] += dvy * fall
      }
    }
  }

  step(): void {
    const { cw, ch, vx, vy, bx, by } = this
    const DIFFUSE = 0.35 // share blended from the 4-neighborhood
    const DECAY = 0.97 // calm always returns
    const MAX = 3 // clamp (air cells per tick) — keeps the field stable

    // 1. Diffuse + decay into the back buffer. Diffusion runs BEFORE advection
    //    on purpose: a fresh point impulse (one wind-tool flick) is a delta
    //    spike, and backward advection annihilates deltas — no cell's
    //    backtrace lands on the spike, so the gust would vanish in one tick.
    //    Spreading it first gives advection something smooth to transport.
    for (let y = 0; y < ch; y++) {
      const row = y * cw
      for (let x = 0; x < cw; x++) {
        const i = row + x
        const l = x > 0 ? vx[i - 1] : 0
        const r = x < cw - 1 ? vx[i + 1] : 0
        const u = y > 0 ? vx[i - cw] : 0
        const d = y < ch - 1 ? vx[i + cw] : 0
        let nvx = (vx[i] * (1 - DIFFUSE) + ((l + r + u + d) / 4) * DIFFUSE) * DECAY
        const l2 = x > 0 ? vy[i - 1] : 0
        const r2 = x < cw - 1 ? vy[i + 1] : 0
        const u2 = y > 0 ? vy[i - cw] : 0
        const d2 = y < ch - 1 ? vy[i + cw] : 0
        let nvy = (vy[i] * (1 - DIFFUSE) + ((l2 + r2 + u2 + d2) / 4) * DIFFUSE) * DECAY
        if (nvx > MAX) nvx = MAX
        else if (nvx < -MAX) nvx = -MAX
        if (nvy > MAX) nvy = MAX
        else if (nvy < -MAX) nvy = -MAX
        bx[i] = nvx
        by[i] = nvy
      }
    }

    // 2. Advect: each cell takes the velocity found upstream of itself
    //    (semi-Lagrangian, bilinear) — this is what makes gusts travel.
    for (let y = 0; y < ch; y++) {
      const row = y * cw
      for (let x = 0; x < cw; x++) {
        const i = row + x
        let sx = x - bx[i]
        let sy = y - by[i]
        if (sx < 0) sx = 0
        else if (sx > cw - 1.001) sx = cw - 1.001
        if (sy < 0) sy = 0
        else if (sy > ch - 1.001) sy = ch - 1.001
        const x0 = sx | 0
        const y0 = sy | 0
        const fx = sx - x0
        const fy = sy - y0
        const i00 = y0 * cw + x0
        const i10 = i00 + 1
        const i01 = i00 + cw
        const i11 = i01 + 1
        const w00 = (1 - fx) * (1 - fy)
        const w10 = fx * (1 - fy)
        const w01 = (1 - fx) * fy
        const w11 = fx * fy
        const nvx = bx[i00] * w00 + bx[i10] * w10 + bx[i01] * w01 + bx[i11] * w11
        const nvy = by[i00] * w00 + by[i10] * w10 + by[i01] * w01 + by[i11] * w11
        // Snap the last whisper to zero so settled air costs nothing downstream.
        vx[i] = nvx > 0.001 || nvx < -0.001 ? nvx : 0
        vy[i] = nvy > 0.001 || nvy < -0.001 ? nvy : 0
      }
    }
  }
}
