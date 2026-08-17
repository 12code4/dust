import { Prng } from './prng.ts'
import { Wind } from './wind.ts'
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
  isDot,
  WINDAGE,
} from './elements.ts'

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
  /**
   * Ballistic velocity in quarter-cells per tick (±31 ≈ ±7.75 cells/tick).
   * Nonzero means the particle is in flight — thrown by the drag tool (or,
   * later, blasted by explosions) — and moves by physics: collision-checked
   * line steps, friction, and gravity arcs, until it lands.
   */
  readonly impX: Int8Array
  readonly impY: Int8Array
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
    this.impX = new Int8Array(w * h)
    this.impY = new Int8Array(w * h)
    this.updated = new Uint8Array(w * h)
    this.wind = new Wind(w, h)
    this.rng = new Prng(seed)
  }

  reset(seed: number): void {
    this.cells.fill(0)
    this.meta.fill(0)
    this.shade.fill(0)
    this.impX.fill(0)
    this.impY.fill(0)
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
    this.impX[i] = 0
    this.impY[i] = 0
    if (el === FIRE) this.meta[i] = 24 + this.rng.int(48)
    else if (el === STEAM) this.meta[i] = 100 + this.rng.int(140)
    else if (el === SMOKE) this.meta[i] = 150 + this.rng.int(100)
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
        // A particle in ballistic flight moves by physics, not by element rules.
        if ((this.impX[i] | this.impY[i]) !== 0) {
          this.flight(x, y, i)
          continue
        }
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
          case DUST:
            this.updateDust(x, y, i)
            break
          case SMOKE:
            this.updateSmoke(x, y, i)
            break
          case MUD:
            this.updateMud(x, y, i)
            break
        }
      }
    }
  }

  // ---- movement primitives ----------------------------------------------

  /** Move the particle at i into the EMPTY cell j. */
  private moveTo(i: number, j: number): void {
    const { cells, meta, shade, impX, impY, updated } = this
    cells[j] = cells[i]
    meta[j] = meta[i]
    shade[j] = shade[i]
    impX[j] = impX[i]
    impY[j] = impY[i]
    cells[i] = EMPTY
    meta[i] = 0
    shade[i] = 0
    impX[i] = 0
    impY[i] = 0
    updated[i] = 1
    updated[j] = 1
  }

  /** Exchange the particles at i and j (e.g. sand sinking through water). */
  private swap(i: number, j: number): void {
    const { cells, meta, shade, impX, impY, updated } = this
    const ce = cells[i]
    const cm = meta[i]
    const cs = shade[i]
    const cx = impX[i]
    const cy = impY[i]
    cells[i] = cells[j]
    meta[i] = meta[j]
    shade[i] = shade[j]
    impX[i] = impX[j]
    impY[i] = impY[j]
    cells[j] = ce
    meta[j] = cm
    shade[j] = cs
    impX[j] = cx
    impY[j] = cy
    updated[i] = 1
    updated[j] = 1
  }

  // ---- ballistics ---------------------------------------------------------

  /**
   * Walk the particle at i up to (nx, ny) cells along (sx, sy), stopping
   * before the first obstacle. Returns the final index (may be i). Steps the
   * axis with the most remaining distance first, so paths approximate the
   * straight line and can't tunnel through anything.
   */
  private lineWalk(i: number, x: number, y: number, nx: number, ny: number, sx: number, sy: number): number {
    let cx = x
    let cy = y
    let ci = i
    let blockedX = nx === 0
    let blockedY = ny === 0
    while (!blockedX || !blockedY) {
      const stepH = !blockedX && (blockedY || nx >= ny)
      if (stepH) {
        const tx = cx + sx
        if (tx >= 0 && tx < this.w && this.cells[ci + sx] === EMPTY) {
          cx = tx
          ci += sx
          if (--nx === 0) blockedX = true
        } else blockedX = true
      } else {
        const ty = cy + sy
        if (ty >= 0 && ty < this.h && this.cells[ci + sy * this.w] === EMPTY) {
          cy = ty
          ci += sy * this.w
          if (--ny === 0) blockedY = true
        } else blockedY = true
      }
    }
    return ci
  }

  /**
   * One tick of ballistic flight: move along the stored velocity with
   * collision, then apply friction and gravity. Flight ends on landing or
   * when becalmed; normal element behavior resumes the next tick.
   */
  private flight(x: number, y: number, i: number): void {
    const vx = this.impX[i]
    const vy = this.impY[i]
    const ax = vx < 0 ? -vx : vx
    const ay = vy < 0 ? -vy : vy
    const sx = vx > 0 ? 1 : -1
    const sy = vy > 0 ? 1 : -1
    // Quarter-cells → whole cells, with stochastic rounding so fractional
    // speeds average out correctly instead of truncating to zero.
    const nx = (ax + this.rng.int(4)) >> 2
    const ny = (ay + this.rng.int(4)) >> 2
    const j = this.lineWalk(i, x, y, nx, ny, sx, sy)
    if (j !== i) this.moveTo(i, j)
    else this.updated[i] = 1
    // Post-move physics. Hitting something kills that axis; friction bleeds
    // the rest; gravity bends heavy matter into arcs (gases just glide).
    const jx = j % this.w
    const jy = (j / this.w) | 0
    const movedX = jx - x === (nx === 0 ? 0 : sx * nx)
    const movedY = jy - y === (ny === 0 ? 0 : sy * ny)
    let nvx = vx === 0 ? 0 : vx - sx // friction, one quarter-cell per tick
    let nvy = vy === 0 ? 0 : vy - sy
    if (nx > 0 && !movedX) nvx = 0
    if (ny > 0 && !movedY) nvy = 0
    // Landing (blocked while moving down) with little sideways speed ends the
    // flight cleanly — otherwise gravity would re-arm a phantom 1-quarter-cell
    // velocity forever and the particle would never resume element behavior.
    const grounded = sy > 0 && ny > 0 && !movedY
    if (grounded && nvx >= -2 && nvx <= 2) {
      this.impX[j] = 0
      this.impY[j] = 0
      return
    }
    const el = this.cells[j]
    const gas = el === STEAM || el === SMOKE || el === FIRE
    if (!gas && !grounded) {
      nvy += 1 // gravity, a quarter-cell per tick²
      if (nvy > 31) nvy = 31
    }
    this.impX[j] = nvx
    this.impY[j] = nvy
  }

  /** Throw the dot at (x, y): velocity in quarter-cells/tick, clamped ±31. */
  setImpulse(x: number, y: number, qvx: number, qvy: number): void {
    if (!this.inBounds(x, y)) return
    const i = y * this.w + x
    const el = this.cells[i]
    if (el === EMPTY || el === WALL) return
    this.impX[i] = qvx > 31 ? 31 : qvx < -31 ? -31 : qvx
    this.impY[i] = qvy > 31 ? 31 : qvy < -31 ? -31 : qvy
  }

  /**
   * Drag-tool haul: shift the dot at (x, y) by up to (dx, dy) immediately,
   * collision-checked. Returns true if it moved.
   */
  dragMove(x: number, y: number, dx: number, dy: number): boolean {
    if (!this.inBounds(x, y)) return false
    const i = y * this.w + x
    const el = this.cells[i]
    if (el === EMPTY || el === WALL) return false
    const j = this.lineWalk(
      i,
      x,
      y,
      dx < 0 ? -dx : dx,
      dy < 0 ? -dy : dy,
      dx > 0 ? 1 : -1,
      dy > 0 ? 1 : -1,
    )
    if (j === i) return false
    this.moveTo(i, j)
    return true
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
    // Squared windage: in a gale strong enough to cap light matter's chance,
    // linear scaling would cap heavy matter too and erase the distinction —
    // dust must dance in wind that sand only twitches at.
    const m = (ax + ay) * windage * windage * 2
    if (m < 0.08) return false
    if (!this.rng.chance(m > 0.95 ? 0.95 : m)) return false
    // Try the probabilistically-dominant axis; if that way is blocked, take
    // the other — matter deflects around obstacles with the flow instead of
    // pinning against them.
    const horizFirst = this.rng.chance(ax / (ax + ay))
    for (let attempt = 0; attempt < 2; attempt++) {
      if (horizFirst === (attempt === 0)) {
        const d = wx > 0 ? 1 : -1
        const nx = x + d
        if (ax > 0.02 && nx >= 0 && nx < this.w && this.cells[i + d] === EMPTY) {
          this.moveTo(i, i + d)
          return true
        }
      } else {
        const d = wy > 0 ? 1 : -1
        const ny = y + d
        if (ay > 0.02 && ny >= 0 && ny < this.h && this.cells[i + d * this.w] === EMPTY) {
          this.moveTo(i, i + d * this.w)
          return true
        }
      }
    }
    return false
  }

  private updateSand(x: number, y: number, i: number): void {
    if (this.windPush(x, y, i, WINDAGE[SAND])) return
    // Wetting: water resting on sand slowly soaks the top layer into mud.
    // (Checking only the cell above keeps settled sand to one extra read;
    // mud then sinks through the pool and exposes the next layer.)
    if (y > 0 && this.cells[i - this.w] === WATER && this.rng.chance(0.02)) {
      this.cells[i] = MUD
      this.meta[i] = 0
      this.updated[i] = 1
      return
    }
    if (y + 1 >= this.h) return
    const below = i + this.w
    const b = this.cells[below]
    if (b === EMPTY) {
      // A pinch of wobble, but only in TRUE freefall (two clear cells below):
      // a grain skimming a pile face has one empty below and must not jitter
      // off it, or every slope fizzes and pours flatten into wide fans.
      if (
        y + 2 < this.h &&
        this.cells[below + this.w] === EMPTY &&
        this.rng.chance(0.12)
      ) {
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
    // Slide, with friction: a grain on a steep ledge only topples sometimes,
    // so piles come out textured and varied instead of relaxing instantly
    // into identical razor-edged 45° pyramids. Openness is checked before any
    // draw, so grains inside a settled pile still cost zero PRNG.
    const le = x > 0 && this.cells[below - 1] === EMPTY
    const re = x + 1 < this.w && this.cells[below + 1] === EMPTY
    if (!le && !re) return
    if (!this.rng.chance(0.5)) return
    const d = le && re ? this.rng.sign() : le ? -1 : 1
    this.moveTo(i, below + d)
  }

  private updateWater(x: number, y: number, i: number): void {
    if (this.windPush(x, y, i, WINDAGE[WATER])) return
    const below = i + this.w
    if (y + 1 < this.h && this.cells[below] === EMPTY) {
      // Freefall wobble (the PG look): streams shimmy and break apart instead
      // of dropping as rigid columns — an echo of PG's per-dot momentum in
      // never-quite-still air. True freefall only (two clear cells below), so
      // droplets skimming a surface don't fizz sideways off it.
      if (
        y + 2 < this.h &&
        this.cells[below + this.w] === EMPTY &&
        this.rng.chance(0.3)
      ) {
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
    // Horizontal flow happens only when SUPPORTED — resting on floor, solid
    // matter, or water that itself has something under it. A particle inside
    // a falling clump (below it is water that's about to fall) must wait, not
    // spread: without this gate, mid-air collisions sent falling blobs
    // skating sideways until they hit the screen edges before ever landing.
    // Clumps now fall as clumps; only landed water seeks its level.
    if (y + 1 >= this.h) {
      // resting on the world floor: supported
    } else {
      const b = this.cells[below]
      if (b === WATER) {
        const supported =
          y + 2 >= this.h || this.cells[below + this.w] !== EMPTY
        if (!supported) return // airborne clump: hold formation
      }
      // WALL/SAND under us = supported; EMPTY was handled by the fall branch.
    }
    // Direction memory + dispersion (up to 3 cells). Queueing beats
    // ping-pong: blocked by fellow water ahead usually means "the stream is
    // moving, hold your heading and wait your turn" — flipping on every block
    // made queued particles wander backward against the flow and drain in
    // stiff single-file. Blocked by a wall means turn around for real. Boxed
    // in on both sides: rest with zero PRNG draws, so still pools stay
    // bit-stable.
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
    // grid): random sideways flutter, steady updraft, and a pressure DROP —
    // PG's fire lowers local air pressure, so a blaze sucks air in at its
    // base like a chimney. This is why smoke curls, steam sways, and a big
    // blaze makes its own weather.
    this.wind.perturb(
      x,
      y,
      (this.rng.int(41) - 20) * 0.002,
      -(10 + this.rng.int(41)) * 0.002,
    )
    this.wind.perturbP(x, y, -0.006)
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
      // Fire's receipt: much of it becomes smoke; the rest just goes out.
      if (this.rng.chance(0.35)) {
        cells[i] = SMOKE
        this.meta[i] = 150 + this.rng.int(100)
        this.updated[i] = 1
      } else {
        cells[i] = EMPTY
        this.meta[i] = 0
        this.shade[i] = 0
        this.count--
      }
      return
    }
    this.meta[i] = life - 1
    // A burning cell also puffs smoke upward now and then (budget allowing).
    if (this.rng.chance(0.04) && y > 0 && cells[i - w] === EMPTY && this.count < this.budget) {
      this.write(i - w, SMOKE)
      this.count++
      this.updated[i - w] = 1
    }
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

  /**
   * The namesake. Feather-light: rides every draft, falls lazily, settles
   * into soft drifts — and when it hangs thick in the air near flame, it
   * deflagrates: a rolling cell-to-cell flash that slams the pressure field,
   * lofting more dust into the burn. Settled dust merely smolders.
   */
  private updateDust(x: number, y: number, i: number): void {
    const { w, cells } = this
    // Suspension clock (dust's meta): counts ticks spent with open air below,
    // resets on rest. Only dust suspended ≥3 ticks is fuel-air mixture — a
    // grain collapsing one cell into a smolder cavity never qualifies, so
    // piles burn slow while clouds and poured streams detonate.
    const inAir = y + 1 < this.h && cells[i + w] === EMPTY
    if (inAir) {
      if (this.meta[i] < 200) this.meta[i]++
    } else this.meta[i] = 0
    // Ignition check — dust is the deflagration's actor.
    const fireNear =
      (x > 0 && cells[i - 1] === FIRE) ||
      (x + 1 < w && cells[i + 1] === FIRE) ||
      (y > 0 && cells[i - w] === FIRE) ||
      (y + 1 < this.h && cells[i + w] === FIRE)
    if (fireNear) {
      if (this.meta[i] >= 3 && this.suspendedDustNeighbors(x, y, i) >= 2) {
        // FLASH — the grain-silo moment. The pressure spike is the chain:
        // it lofts nearby dust into the fire that's about to reach it.
        cells[i] = FIRE
        this.meta[i] = 10 + this.rng.int(10)
        this.updated[i] = 1
        this.wind.addPressure(x, y, 2.2, 10)
        return
      }
      if (this.rng.chance(0.06)) {
        cells[i] = FIRE // settled dust only smolders
        this.meta[i] = 12 + this.rng.int(12)
        this.updated[i] = 1
        return
      }
    }
    // Settled dust cakes: it takes a real gust to loft it off a surface, so
    // a fire's own gentle convection doesn't aerosolize a pile into a bomb.
    // Once airborne it rides everything at full windage.
    const resting = y + 1 < this.h && cells[i + w] !== EMPTY
    if (this.windPush(x, y, i, resting ? 0.55 : WINDAGE[DUST])) return
    // Wetting from above (rain settles dust), same rule as sand but faster.
    if (y > 0 && cells[i - w] === WATER && this.rng.chance(0.1)) {
      cells[i] = MUD
      this.meta[i] = 0
      this.updated[i] = 1
      return
    }
    const below = i + w
    if (y + 1 >= this.h) return
    const b = cells[below]
    if (b === EMPTY) {
      if (this.rng.chance(0.35)) return // hover — dust falls lazily
      if (
        y + 2 < this.h &&
        cells[below + w] === EMPTY &&
        this.rng.chance(0.3)
      ) {
        const d = this.rng.sign()
        const nx = x + d
        if (nx >= 0 && nx < w && cells[below + d] === EMPTY) {
          this.moveTo(i, below + d)
          return
        }
      }
      this.moveTo(i, below)
      return
    }
    if (b === WATER) {
      // Floats a while (density 0.4), then soaks through into mud.
      if (this.rng.chance(0.08)) {
        cells[i] = MUD
        this.meta[i] = 0
        this.updated[i] = 1
      }
      return
    }
    // Slides eagerly — drifts smooth themselves out.
    const le = x > 0 && cells[below - 1] === EMPTY
    const re = x + 1 < w && cells[below + 1] === EMPTY
    if (!le && !re) return
    if (!this.rng.chance(0.7)) return
    const d = le && re ? this.rng.sign() : le ? -1 : 1
    this.moveTo(i, below + d)
  }

  /**
   * 3×3 census of SUSPENDED dust (airborne clock ≥ 2) — the deflagration
   * density gate. Settled grains are not fuel-air mixture, however close.
   */
  private suspendedDustNeighbors(x: number, y: number, i: number): number {
    const { w, cells, meta } = this
    let n = 0
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy
      if (yy < 0 || yy >= this.h) continue
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const xx = x + dx
        if (xx < 0 || xx >= w) continue
        const j = i + dy * w + dx
        if (cells[j] === DUST && meta[j] >= 2) n++
      }
    }
    return n
  }

  private updateSmoke(x: number, y: number, i: number): void {
    if (this.windPush(x, y, i, WINDAGE[SMOKE])) return
    const life = this.meta[i]
    if (life <= 1) {
      // Soot: a little of every plume comes back down as the namesake.
      if (this.rng.chance(0.02)) {
        this.cells[i] = DUST
        this.meta[i] = 0
        this.updated[i] = 1
      } else {
        this.cells[i] = EMPTY
        this.meta[i] = 0
        this.shade[i] = 0
        this.count--
      }
      return
    }
    this.meta[i] = life - 1
    const { w, cells } = this
    if (this.rng.chance(0.6) && y > 0) {
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

  /** Wet earth: heavy, sticky, nearly windproof. Fire bakes it back to sand. */
  private updateMud(x: number, y: number, i: number): void {
    const { w, cells } = this
    const dryNear =
      (x > 0 && cells[i - 1] === FIRE) ||
      (x + 1 < w && cells[i + 1] === FIRE) ||
      (y > 0 && cells[i - w] === FIRE) ||
      (y + 1 < this.h && cells[i + w] === FIRE)
    if (dryNear && this.rng.chance(0.03)) {
      cells[i] = SAND
      this.meta[i] = 0
      this.updated[i] = 1
      return
    }
    if (y + 1 >= this.h) return
    const below = i + w
    const b = cells[below]
    if (b === EMPTY) {
      this.moveTo(i, below) // falls straight — no wobble, no spray
      return
    }
    if (b === WATER && this.rng.chance(0.4)) {
      this.swap(i, below) // sinks
      return
    }
    // Barely slides: mud holds steep, lumpy shapes.
    const le = x > 0 && cells[below - 1] === EMPTY
    const re = x + 1 < w && cells[below + 1] === EMPTY
    if (!le && !re) return
    if (!this.rng.chance(0.05)) return
    const d = le && re ? this.rng.sign() : le ? -1 : 1
    this.moveTo(i, below + d)
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
    const { cells, meta, shade, impX, impY } = this
    for (let i = 0; i < cells.length; i++) {
      h ^= cells[i]
      h = Math.imul(h, 0x01000193)
      h ^= meta[i]
      h = Math.imul(h, 0x01000193)
      h ^= shade[i]
      h = Math.imul(h, 0x01000193)
      h ^= (impX[i] & 0xff) ^ ((impY[i] & 0xff) << 8)
      h = Math.imul(h, 0x01000193)
    }
    return h >>> 0
  }
}
