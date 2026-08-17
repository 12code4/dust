import { Prng } from './prng.ts'
import { Wind } from './wind.ts'
import { EMPTY, WALL, SAND, WATER, FIRE, STEAM, isDot, WINDAGE } from './elements.ts'

/**
 * The simulation grid. Structure-of-arrays, no per-particle allocation:
 *  - cells: element id per cell
 *  - meta:  per-element scratch (fire/steam lifetime, water flow direction)
 *  - shade: color variant chosen at spawn, travels with the particle
 *  - updated: per-tick guard so a particle moves at most once per step
 *
 * Scan order (the Noita playbook, docs/05): bottom-up so falling matter lands
 * before the row above falls into it; horizontal direction alternates by
 * (row + frame) parity to avoid left/right bias. Fallers move into rows the
 * scan has already passed, so they can't be processed twice; rising matter
 * (fire, steam) moves into rows NOT yet scanned, and the `updated` guard is
 * what stops it from being re-processed there — without it a flame could climb
 * the whole grid in one tick.
 */
export class World {
  readonly w: number
  readonly h: number
  readonly budget: number
  readonly cells: Uint8Array
  readonly meta: Uint8Array
  readonly shade: Uint8Array
  readonly wind: Wind
  private readonly updated: Uint8Array
  private rng: Prng
  frame = 0
  count = 0 // live dots (walls excluded)

  constructor(w = 400, h = 300, seed = 1, budget = 50_000) {
    this.w = w
    this.h = h
    this.budget = budget
    this.cells = new Uint8Array(w * h)
    this.meta = new Uint8Array(w * h)
    this.shade = new Uint8Array(w * h)
    this.updated = new Uint8Array(w * h)
    this.wind = new Wind(w, h)
    this.rng = new Prng(seed)
  }

  reset(seed: number): void {
    this.cells.fill(0)
    this.meta.fill(0)
    this.shade.fill(0)
    this.updated.fill(0)
    this.wind.clear()
    this.rng = new Prng(seed)
    this.frame = 0
    this.count = 0
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.w && y >= 0 && y < this.h
  }

  /** Out of bounds reads as WALL: the playfield is a sealed box. */
  get(x: number, y: number): number {
    return this.inBounds(x, y) ? this.cells[y * this.w + x] : WALL
  }

  /**
   * Place an element. Walls overwrite anything (they are scenery); dots spawn
   * only into empty cells and respect the budget. EMPTY erases.
   * Returns true if the cell changed.
   */
  set(x: number, y: number, el: number): boolean {
    if (!this.inBounds(x, y)) return false
    const i = y * this.w + x
    const cur = this.cells[i]
    if (el === cur) return false
    if (el === EMPTY || el === WALL) {
      if (isDot(cur)) this.count--
      this.write(i, el)
      return true
    }
    if (cur !== EMPTY) return false
    if (this.count >= this.budget) return false
    this.write(i, el)
    this.count++
    return true
  }

  private write(i: number, el: number): void {
    const old = this.cells[i]
    if (old === WALL !== (el === WALL)) {
      this.wind.setSolidPixel(i % this.w, (i / this.w) | 0, el === WALL)
    }
    this.cells[i] = el
    this.shade[i] = this.rng.next() & 3
    if (el === FIRE) this.meta[i] = 24 + this.rng.int(48)
    else if (el === STEAM) this.meta[i] = 100 + this.rng.int(140)
    else if (el === WATER) this.meta[i] = this.rng.next() & 1
    else this.meta[i] = 0
  }

  /** Stamp a filled disk. `density` < 1 dithers the brush (nice for fire). */
  paintDisk(cx: number, cy: number, r: number, el: number, density = 1): void {
    const r2 = r * r
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue
        if (density < 1 && !this.rng.chance(density)) continue
        this.set(cx + dx, cy + dy, el)
      }
    }
  }

  /** Advance one tick. */
  step(): void {
    this.wind.step()
    this.updated.fill(0)
    this.frame++
    const { w, h, cells, updated } = this
    for (let y = h - 1; y >= 0; y--) {
      const row = y * w
      const ltr = ((y + this.frame) & 1) === 0
      const x0 = ltr ? 0 : w - 1
      const dx = ltr ? 1 : -1
      for (let k = 0, x = x0; k < w; k++, x += dx) {
        const i = row + x
        const el = cells[i]
        if (el === EMPTY || el === WALL || updated[i]) continue
        switch (el) {
          case SAND:
            this.updateSand(x, y, i)
            break
          case WATER:
            this.updateWater(x, y, i)
            break
          case FIRE:
            this.updateFire(x, y, i)
            break
          case STEAM:
            this.updateSteam(x, y, i)
            break
        }
      }
    }
  }

  // ---- movement primitives ----------------------------------------------

  /** Move the particle at i into the EMPTY cell j. */
  private moveTo(i: number, j: number): void {
    const { cells, meta, shade, updated } = this
    cells[j] = cells[i]
    meta[j] = meta[i]
    shade[j] = shade[i]
    cells[i] = EMPTY
    meta[i] = 0
    shade[i] = 0
    updated[i] = 1
    updated[j] = 1
  }

  /** Exchange the particles at i and j (e.g. sand sinking through water). */
  private swap(i: number, j: number): void {
    const { cells, meta, shade, updated } = this
    const ce = cells[i]
    const cm = meta[i]
    const cs = shade[i]
    cells[i] = cells[j]
    meta[i] = meta[j]
    shade[i] = shade[j]
    cells[j] = ce
    meta[j] = cm
    shade[j] = cs
    updated[i] = 1
    updated[j] = 1
  }

  // ---- element behaviors -------------------------------------------------

  /**
   * Let the air field shove this particle one cell, chance ∝ wind speed ×
   * windage. The calm-threshold early-out costs zero PRNG draws, so settled
   * scenes under still air pay only two float reads per particle.
   */
  private windPush(x: number, y: number, i: number, windage: number): boolean {
    const wi = this.wind.cellIndex(x, y)
    const wx = this.wind.vx[wi]
    const wy = this.wind.vy[wi]
    const ax = wx < 0 ? -wx : wx
    const ay = wy < 0 ? -wy : wy
    const m = (ax + ay) * windage
    if (m < 0.05) return false
    if (!this.rng.chance(m > 0.9 ? 0.9 : m)) return false
    if (this.rng.chance(ax / (ax + ay))) {
      const d = wx > 0 ? 1 : -1
      const nx = x + d
      if (nx >= 0 && nx < this.w && this.cells[i + d] === EMPTY) {
        this.moveTo(i, i + d)
        return true
      }
    } else {
      const d = wy > 0 ? 1 : -1
      const ny = y + d
      if (ny >= 0 && ny < this.h && this.cells[i + d * this.w] === EMPTY) {
        this.moveTo(i, i + d * this.w)
        return true
      }
    }
    return false
  }

  private updateSand(x: number, y: number, i: number): void {
    if (this.windPush(x, y, i, WINDAGE[SAND])) return
    if (y + 1 >= this.h) return
    const below = i + this.w
    const b = this.cells[below]
    if (b === EMPTY) {
      // A pinch of freefall wobble: pours fan out organically instead of
      // dropping in ruler-straight streams (subtler than water's — piles
      // should still stack crisp).
      if (this.rng.chance(0.12)) {
        const d = this.rng.sign()
        const nx = x + d
        if (nx >= 0 && nx < this.w && this.cells[below + d] === EMPTY) {
          this.moveTo(i, below + d)
          return
        }
      }
      this.moveTo(i, below)
      return
    }
    if (b === WATER && this.rng.chance(0.6)) {
      this.swap(i, below) // sink
      return
    }
    // Slide. Check openness before drawing a direction: this path runs for
    // every settled grain, and a draw only matters when both sides are open.
    const le = x > 0 && this.cells[below - 1] === EMPTY
    const re = x + 1 < this.w && this.cells[below + 1] === EMPTY
    if (!le && !re) return
    const d = le && re ? this.rng.sign() : le ? -1 : 1
    this.moveTo(i, below + d)
  }

  private updateWater(x: number, y: number, i: number): void {
    if (this.windPush(x, y, i, WINDAGE[WATER])) return
    const below = i + this.w
    if (y + 1 < this.h && this.cells[below] === EMPTY) {
      // Freefall wobble (the PG look): streams shimmy and break apart instead
      // of dropping as rigid columns — an echo of PG's per-dot momentum in
      // never-quite-still air.
      if (this.rng.chance(0.3)) {
        const d = this.rng.sign()
        const nx = x + d
        if (nx >= 0 && nx < this.w && this.cells[below + d] === EMPTY) {
          this.moveTo(i, below + d)
          return
        }
      }
      this.moveTo(i, below)
      return
    }
    if (y + 1 < this.h) {
      const le = x > 0 && this.cells[below - 1] === EMPTY
      const re = x + 1 < this.w && this.cells[below + 1] === EMPTY
      if (le || re) {
        const d = le && re ? this.rng.sign() : le ? -1 : 1
        this.moveTo(i, below + d)
        return
      }
    }
    // Horizontal flow with direction memory and dispersion (up to 3 cells).
    // Queueing beats ping-pong: blocked by fellow water ahead usually means
    // "the stream is moving, hold your heading and wait your turn" — flipping
    // on every block made queued particles wander backward against the flow
    // and drain in stiff single-file. Blocked by a wall means turn around for
    // real. Boxed in on both sides: rest with zero PRNG draws, so still pools
    // stay bit-stable.
    const dir = this.meta[i] === 0 ? -1 : 1
    const ahead = x + dir >= 0 && x + dir < this.w ? this.cells[i + dir] : WALL
    if (ahead === EMPTY) {
      let dest = i + dir
      for (let s = 2; s <= 3; s++) {
        const tx = x + dir * s
        if (tx < 0 || tx >= this.w || this.cells[i + dir * s] !== EMPTY) break
        dest = i + dir * s
      }
      this.moveTo(i, dest)
      return
    }
    const behind = x - dir >= 0 && x - dir < this.w ? this.cells[i - dir] : WALL
    if (behind !== EMPTY) return
    if (ahead === WATER && this.rng.chance(0.8)) return // queue behind the flow
    this.meta[i] = dir === -1 ? 1 : 0 // turn around
    this.moveTo(i, i - dir)
  }

  private updateFire(x: number, y: number, i: number): void {
    // Fire breathes into the air field (PG's decompiled numbers, scaled to our
    // grid): random sideways flutter, steady updraft. This is why smoke curls,
    // steam sways, and a big blaze makes its own weather.
    this.wind.perturb(
      x,
      y,
      (this.rng.int(41) - 20) * 0.002,
      -(10 + this.rng.int(41)) * 0.002,
    )
    if (this.windPush(x, y, i, WINDAGE[FIRE])) return
    // Quench: touching water turns the flame into a puff of steam.
    const { w, cells } = this
    if (
      (y + 1 < this.h && cells[i + w] === WATER) ||
      (y > 0 && cells[i - w] === WATER) ||
      (x > 0 && cells[i - 1] === WATER) ||
      (x + 1 < w && cells[i + 1] === WATER)
    ) {
      cells[i] = STEAM
      this.meta[i] = 60 + this.rng.int(60)
      this.updated[i] = 1
      return
    }
    const life = this.meta[i]
    if (life <= 1) {
      cells[i] = EMPTY
      this.meta[i] = 0
      this.shade[i] = 0
      this.count--
      return
    }
    this.meta[i] = life - 1
    // Rise with flicker; lick sideways under ceilings.
    if (this.rng.chance(0.8) && y > 0) {
      const dx = this.rng.int(3) - 1
      const nx = x + dx
      if (nx >= 0 && nx < w && cells[i - w + dx] === EMPTY) {
        this.moveTo(i, i - w + dx)
        return
      }
    }
    if (this.rng.chance(0.3)) {
      const d = this.rng.sign()
      const nx = x + d
      if (nx >= 0 && nx < w && cells[i + d] === EMPTY) this.moveTo(i, i + d)
    }
  }

  private updateSteam(x: number, y: number, i: number): void {
    if (this.windPush(x, y, i, WINDAGE[STEAM])) return
    const life = this.meta[i]
    if (life <= 1) {
      this.cells[i] = EMPTY
      this.meta[i] = 0
      this.shade[i] = 0
      this.count--
      return
    }
    this.meta[i] = life - 1
    const { w, cells } = this
    if (this.rng.chance(0.7) && y > 0) {
      const dx = this.rng.int(3) - 1
      const nx = x + dx
      if (nx >= 0 && nx < w && cells[i - w + dx] === EMPTY) {
        this.moveTo(i, i - w + dx)
        return
      }
    }
    if (this.rng.chance(0.4)) {
      const d = this.rng.sign()
      const nx = x + d
      if (nx >= 0 && nx < w && cells[i + d] === EMPTY) this.moveTo(i, i + d)
    }
  }

  // ---- inspection (tests, HUD) ------------------------------------------

  countOf(el: number): number {
    let n = 0
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === el) n++
    return n
  }

  /**
   * FNV-1a over cells+meta+shade: the golden-frame fingerprint. Shade is
   * deterministic state that travels with particles and drives rendering, so
   * it belongs in the fingerprint — a shade-transport regression must not be
   * able to hide behind matching cells/meta.
   */
  hash(): number {
    let h = 0x811c9dc5
    const { cells, meta, shade } = this
    for (let i = 0; i < cells.length; i++) {
      h ^= cells[i]
      h = Math.imul(h, 0x01000193)
      h ^= meta[i]
      h = Math.imul(h, 0x01000193)
      h ^= shade[i]
      h = Math.imul(h, 0x01000193)
    }
    return h >>> 0
  }
}
