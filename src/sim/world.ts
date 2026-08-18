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
  LAVA,
  STONE,
  GLASS,
  WOOD,
  SEED,
  VINE,
  ICE,
  GUNPOWDER,
  OIL,
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
  /**
   * Cells currently held by the drag tool: the sim marks them updated at the
   * start of each tick, so gravity and element rules leave them in the hand
   * until released.
   */
  held: readonly number[] | null = null
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
    if (el === FIRE) {
      // ~1.5s of assured burn, then a 33% extinction roll every half second
      // (drawn up-front as a geometric tail so meta stays a simple countdown).
      this.meta[i] = this.fireLife()
    } else if (el === STEAM) this.meta[i] = 60 + this.rng.int(60)
    else if (el === SMOKE) this.meta[i] = 80 + this.rng.int(70)
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
    if (this.held) for (const hi of this.held) this.updated[hi] = 1
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
          case LAVA:
            this.updateLava(x, y, i)
            break
          case STONE:
            this.updateStone(x, y, i)
            break
          case GLASS:
            this.updateGlass(x, y, i)
            break
          case WOOD:
            this.updateWood(x, y, i)
            break
          case SEED:
            this.updateSeed(x, y, i)
            break
          case VINE:
            this.updateVine(x, y, i)
            break
          case ICE:
            this.updateIce(x, y, i)
            break
          case GUNPOWDER:
            this.updateGunpowder(x, y, i)
            break
          case OIL:
            this.updateOil(x, y, i)
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

  /**
   * Pen-fire lifespan: ~1.5s assured, then 33% extinction rolls per 0.5s.
   * Reaction flames (wood licks, lava tongues, pops, blast fronts) use their
   * own brief lives — they render pure ember-red, while this long life walks
   * the full red/orange/yellow mix.
   */
  private fireLife(): number {
    let life = 90
    while (life < 240 && this.rng.chance(0.67)) life += 30
    return life
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
    // Drag is horizontal-only for heavy matter: vertical friction would
    // cancel gravity exactly and freeze every fall at terminal-crawl. Gases
    // get gentle decay on both axes instead of gravity (below).
    let nvx = vx === 0 ? 0 : vx - sx
    let nvy = vy
    if (nx > 0 && !movedX) nvx = 0
    if (ny > 0 && !movedY) nvy = 0
    // Landing (blocked while moving down) with little sideways speed ends the
    // flight cleanly — otherwise gravity would re-arm a phantom 1-quarter-cell
    // velocity forever and the particle would never resume element behavior.
    const grounded = sy > 0 && ny > 0 && !movedY
    // Hard landings break stone: a thrown boulder arrives as sand.
    if (grounded && this.cells[j] === STONE && vy >= 12) {
      this.cells[j] = SAND
      this.impX[j] = 0
      this.impY[j] = 0
      return
    }
    if (grounded && nvx >= -2 && nvx <= 2) {
      this.impX[j] = 0
      this.impY[j] = 0
      return
    }
    const el = this.cells[j]
    const gas = el === STEAM || el === SMOKE || el === FIRE
    if (gas) {
      nvy = vy === 0 ? 0 : vy - sy // gases coast to a stop, no gravity
      if (ny > 0 && !movedY) nvy = 0
    } else if (!grounded) {
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
   * collision-checked. Returns the dot's new cell index (unchanged if it
   * couldn't move), or -1 if there is no draggable dot there.
   */
  dragMove(x: number, y: number, dx: number, dy: number): number {
    if (!this.inBounds(x, y)) return -1
    const i = y * this.w + x
    const el = this.cells[i]
    if (el === EMPTY || el === WALL) return -1
    const j = this.lineWalk(
      i,
      x,
      y,
      dx < 0 ? -dx : dx,
      dy < 0 ? -dy : dy,
      dx > 0 ? 1 : -1,
      dy > 0 ? 1 : -1,
    )
    if (j !== i) this.moveTo(i, j)
    return j
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
    // pinning against them. Heavy matter also blows THROUGH gases (swap), so
    // a gust drives a stream of grains through its own dust and smoke — but
    // gases and flame don't displace each other (a fire must not dodge a
    // quench by riding its own steam).
    const self = this.cells[i]
    const selfGas = self === STEAM || self === SMOKE || self === FIRE
    const horizFirst = this.rng.chance(ax / (ax + ay))
    for (let attempt = 0; attempt < 2; attempt++) {
      if (horizFirst === (attempt === 0)) {
        const d = wx > 0 ? 1 : -1
        const nx = x + d
        if (ax > 0.02 && nx >= 0 && nx < this.w) {
          const t = this.cells[i + d]
          if (t === EMPTY) {
            this.moveTo(i, i + d)
            return true
          }
          if (!selfGas && (t === STEAM || t === SMOKE)) {
            this.swap(i, i + d)
            return true
          }
        }
      } else {
        const d = wy > 0 ? 1 : -1
        const ny = y + d
        if (ay > 0.02 && ny >= 0 && ny < this.h) {
          const t = this.cells[i + d * this.w]
          if (t === EMPTY) {
            this.moveTo(i, i + d * this.w)
            return true
          }
          if (!selfGas && (t === STEAM || t === SMOKE)) {
            this.swap(i, i + d * this.w)
            return true
          }
        }
      }
    }
    return false
  }

  private updateSand(x: number, y: number, i: number): void {
    if (this.windPush(x, y, i, WINDAGE[SAND])) return
    // Vertical-contact reactions (one read for settled grains): water above
    // soaks the top layer into mud; lava above vitrifies it to glass. Mud
    // sinks / glass holds, exposing the next layer, so both spread downward.
    if (y > 0) {
      const above = this.cells[i - this.w]
      if (above === WATER && this.rng.chance(0.02)) {
        this.cells[i] = MUD
        this.meta[i] = 0
        this.updated[i] = 1
        return
      }
      if (above === LAVA && this.rng.chance(0.35)) {
        this.cells[i] = GLASS
        this.meta[i] = 0
        this.updated[i] = 1
        return
      }
    }
    if (y + 1 >= this.h) return
    const below = i + this.w
    const b = this.cells[below]
    if (b === LAVA && this.rng.chance(0.35)) {
      this.cells[i] = GLASS // poured into the melt
      this.meta[i] = 0
      this.updated[i] = 1
      return
    }
    // Smother (the R6 classic): sand starves a flame and takes its cell.
    if (b === FIRE && this.rng.chance(0.85)) {
      this.cells[below] = EMPTY
      this.meta[below] = 0
      this.shade[below] = 0
      this.count--
      this.moveTo(i, below)
      return
    }
    // Gases don't hold sand up — it falls through, and they bubble around it.
    if ((b === STEAM || b === SMOKE) && this.rng.chance(0.9)) {
      this.swap(i, below)
      return
    }
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
    // On ice, friction vanishes (R32): a grain skates SIDEWAYS along the
    // sheet, fast — diagonal slides can't fire on a flat floor, so this is
    // the move that keeps powder from piling on a rink.
    if (b === ICE) {
      const sl = x > 0 && this.cells[i - 1] === EMPTY
      const sr = x + 1 < this.w && this.cells[i + 1] === EMPTY
      if (sl || sr) {
        const d = sl && sr ? this.rng.sign() : sl ? -1 : 1
        let dest = i + d
        const x2 = x + d * 2
        if (x2 >= 0 && x2 < this.w && this.cells[i + d * 2] === EMPTY) dest = i + d * 2
        this.moveTo(i, dest)
        return
      }
    }
    // Slide, with friction: a grain on a steep ledge only topples sometimes,
    // so piles come out textured and varied instead of relaxing instantly
    // into identical razor-edged 45° pyramids. Openness is checked before any
    // draw, so grains inside a settled pile still cost zero PRNG. Slipperiness
    // reaches one layer up: sand resting on sand-on-ice slides without grip.
    const le = x > 0 && this.cells[below - 1] === EMPTY
    const re = x + 1 < this.w && this.cells[below + 1] === EMPTY
    if (!le && !re) return
    // Slick reaches down through shallow sand: a grain whose support column
    // stands on ice (within two layers) has nothing to grip.
    let slick = false
    if (b === SAND && y + 2 < this.h) {
      const b2 = this.cells[below + this.w]
      slick =
        b2 === ICE ||
        (b2 === SAND && y + 3 < this.h && this.cells[below + this.w * 2] === ICE)
    }
    if (!slick && !this.rng.chance(0.5)) return
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
      const b = this.cells[below]
      // Rain falls through cloud: gases yield and bubble up past the drop.
      if ((b === STEAM || b === SMOKE) && this.rng.chance(0.85)) {
        this.swap(i, below)
        return
      }
      // Density sort: water sinks beneath oil, so oil always ends on top.
      if (b === OIL && this.rng.chance(0.35)) {
        this.swap(i, below)
        return
      }
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
    // Quench comes BEFORE wind: a flame touching water dies this tick, no
    // dodging downwind first. And it's the WATER that may boil into steam,
    // not the fire — steam is water's ghost, not fire's.
    const { w, cells } = this
    const wj =
      y + 1 < this.h && cells[i + w] === WATER ? i + w
      : y > 0 && cells[i - w] === WATER ? i - w
      : x > 0 && cells[i - 1] === WATER ? i - 1
      : x + 1 < w && cells[i + 1] === WATER ? i + 1
      : -1
    if (wj >= 0) {
      if (this.rng.chance(0.25)) {
        cells[wj] = STEAM
        this.meta[wj] = 60 + this.rng.int(60)
        this.updated[wj] = 1
      }
      cells[i] = EMPTY
      this.meta[i] = 0
      this.shade[i] = 0
      this.count--
      return
    }
    if (this.windPush(x, y, i, WINDAGE[FIRE])) return
    const life = this.meta[i]
    if (life <= 1) {
      // Fire's receipt: some becomes smoke; most just goes out.
      if (this.rng.chance(0.125)) {
        cells[i] = SMOKE
        this.meta[i] = 80 + this.rng.int(70)
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
    // Condensation: steam touching glass or ice beads into water.
    const { w: ww, cells: cc } = this
    const l = x > 0 ? cc[i - 1] : 0
    const r = x + 1 < ww ? cc[i + 1] : 0
    const u = y > 0 ? cc[i - ww] : 0
    const dn = y + 1 < this.h ? cc[i + ww] : 0
    if (
      (l === GLASS || l === ICE || r === GLASS || r === ICE ||
        u === GLASS || u === ICE || dn === GLASS || dn === ICE) &&
      this.rng.chance(0.12)
    ) {
      cc[i] = WATER
      this.meta[i] = this.rng.next() & 1
      this.updated[i] = 1
      return
    }
    // Bubbles: steam under water rises straight up through the pool.
    if (y > 0 && cc[i - ww] === WATER && this.rng.chance(0.35)) {
      this.swap(i, i - ww)
      return
    }
    const life = this.meta[i]
    if (life <= 1) {
      // End of life: some condenses and falls as rain (R27 — weather is the
      // fire brigade, and rain settles airborne dust); the rest dissipates.
      if (this.rng.chance(0.15)) {
        this.cells[i] = WATER
        this.meta[i] = this.rng.next() & 1
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
    // Ignition check — dust is the deflagration's actor. Lava counts as an
    // ignition source just like open flame.
    const fireNear =
      (x > 0 && (cells[i - 1] === FIRE || cells[i - 1] === LAVA)) ||
      (x + 1 < w && (cells[i + 1] === FIRE || cells[i + 1] === LAVA)) ||
      (y > 0 && (cells[i - w] === FIRE || cells[i - w] === LAVA)) ||
      (y + 1 < this.h && (cells[i + w] === FIRE || cells[i + w] === LAVA))
    if (fireNear) {
      if (this.meta[i] >= 3 && this.suspendedDustNeighbors(x, y, i) >= 2) {
        // FLASH — the grain-silo moment. The pressure spike is the chain:
        // it lofts nearby dust into the fire that's about to reach it.
        // Tuned for a rolling whoomph, not artillery: soft pop, wide burn.
        cells[i] = FIRE
        this.meta[i] = 10 + this.rng.int(10) // a flash front, not a campfire
        this.updated[i] = 1
        this.wind.addPressure(x, y, 1.4, 8)
        return
      }
      if (this.rng.chance(0.25)) {
        cells[i] = FIRE // settled dust burns quick — a racing ground fire
        this.meta[i] = 24 + this.rng.int(24) // consumption fire: brief
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
    if ((b === STEAM || b === SMOKE) && this.rng.chance(0.7)) {
      this.swap(i, below) // even dust settles through a plume, slowly
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
    // Bubbles: smoke under water rises through the pool, not around it.
    if (y > 0 && this.cells[i - this.w] === WATER && this.rng.chance(0.3)) {
      this.swap(i, i - this.w)
      return
    }
    const life = this.meta[i]
    if (life <= 1) {
      // Soot: a little of every plume comes back down as the namesake.
      if (this.rng.chance(0.03)) {
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

  /**
   * Molten rock: the terrain printer. Water quenches it to stone (and boils
   * to steam), sand vitrifies against it, mud bakes to stone, dust ignites.
   * It breathes heat into the air, flickers flame, and — left alone long
   * enough — crusts over into stone on its own.
   */
  private updateLava(x: number, y: number, i: number): void {
    const { w, cells } = this
    // R1, the classic: lava + water → stone + steam, at the interface.
    for (let d = 0; d < 4; d++) {
      const j =
        d === 0 ? (x > 0 ? i - 1 : -1)
        : d === 1 ? (x + 1 < w ? i + 1 : -1)
        : d === 2 ? (y > 0 ? i - w : -1)
        : y + 1 < this.h ? i + w : -1
      if (j >= 0 && cells[j] === WATER && this.rng.chance(0.85)) {
        cells[j] = STEAM
        this.meta[j] = 60 + this.rng.int(60)
        this.updated[j] = 1
        cells[i] = STONE
        this.meta[i] = 0
        this.updated[i] = 1
        return
      }
    }
    // Heat: gentler than open flame, but constant.
    this.wind.perturb(x, y, (this.rng.int(21) - 10) * 0.001, -(5 + this.rng.int(16)) * 0.001)
    if (this.rng.chance(0.004) && y > 0 && cells[i - w] === EMPTY && this.count < this.budget) {
      this.write(i - w, FIRE)
      this.meta[i - w] = 8 + this.rng.int(10) // brief tongue of flame
      this.count++
      this.updated[i - w] = 1
    }
    // Crust over, eventually (trace rate — pools skin unevenly over ~a minute).
    if (this.rng.chance(0.0002)) {
      cells[i] = STONE
      this.meta[i] = 0
      this.updated[i] = 1
      return
    }
    // Movement: a slow, viscous liquid.
    const below = i + w
    if (y + 1 < this.h && cells[below] === EMPTY) {
      this.moveTo(i, below)
      return
    }
    if (
      y + 1 < this.h &&
      (cells[below] === STEAM || cells[below] === SMOKE) &&
      this.rng.chance(0.8)
    ) {
      this.swap(i, below)
      return
    }
    if (y + 1 < this.h) {
      const le = x > 0 && cells[below - 1] === EMPTY
      const re = x + 1 < w && cells[below + 1] === EMPTY
      if ((le || re) && this.rng.chance(0.6)) {
        const d = le && re ? this.rng.sign() : le ? -1 : 1
        this.moveTo(i, below + d)
        return
      }
    }
    if (!this.rng.chance(0.4)) return // viscosity: often just sits
    const dir = this.meta[i] === 0 ? -1 : 1
    const ahead = x + dir >= 0 && x + dir < w ? cells[i + dir] : WALL
    if (ahead === EMPTY) {
      this.moveTo(i, i + dir)
      return
    }
    const behind = x - dir >= 0 && x - dir < w ? cells[i - dir] : WALL
    if (behind !== EMPTY) return
    this.meta[i] = dir === -1 ? 1 : 0
    this.moveTo(i, i - dir)
  }

  /**
   * Falls dead straight and never slides — the cliff-builder. Smashes to
   * sand on a hard ballistic landing, melts slowly in lava, and erodes to
   * sand at a trace rate under running water. Mountains lose eventually.
   */
  private updateStone(x: number, y: number, i: number): void {
    const { w, cells } = this
    if (y > 0 && cells[i - w] === WATER && this.rng.chance(0.0004)) {
      cells[i] = SAND // erosion, the long game
      this.updated[i] = 1
      return
    }
    const nearLava =
      (x > 0 && cells[i - 1] === LAVA) ||
      (x + 1 < w && cells[i + 1] === LAVA) ||
      (y > 0 && cells[i - w] === LAVA) ||
      (y + 1 < this.h && cells[i + w] === LAVA)
    if (nearLava && this.rng.chance(0.004)) {
      cells[i] = LAVA // the mountain surrenders
      this.meta[i] = 0
      this.updated[i] = 1
      return
    }
    if (y + 1 >= this.h) return
    const below = i + w
    const b = cells[below]
    if (b === EMPTY) {
      this.moveTo(i, below)
      return
    }
    if (b === WATER && this.rng.chance(0.7)) {
      this.swap(i, below)
      return
    }
    if (b === LAVA && this.rng.chance(0.25)) {
      this.swap(i, below) // submerges into the melt that is consuming it
      return
    }
    if ((b === STEAM || b === SMOKE || b === FIRE) && this.rng.chance(0.9)) {
      this.swap(i, below) // a boulder does not negotiate with vapors
    }
  }

  /**
   * Born from sand in lava's embrace. Sits perfectly still, lets steam bead
   * on it, shrugs off fire and lava — but a sharp pressure spike (either
   * sign) shatters it back to the sand it came from.
   */
  private updateGlass(x: number, y: number, i: number): void {
    const { w, cells } = this
    // Lava un-makes what it made: glass softens back into the melt.
    const nearLava =
      (x > 0 && cells[i - 1] === LAVA) ||
      (x + 1 < w && cells[i + 1] === LAVA) ||
      (y > 0 && cells[i - w] === LAVA) ||
      (y + 1 < this.h && cells[i + w] === LAVA)
    if (nearLava && this.rng.chance(0.008)) {
      cells[i] = LAVA
      this.meta[i] = 0
      this.updated[i] = 1
      return
    }
    const p = this.wind.p[this.wind.cellIndex(x, y)]
    if ((p > 2.8 || p < -2.8) && this.rng.chance(0.5)) {
      cells[i] = SAND
      this.meta[i] = 0
      this.updated[i] = 1
    }
  }

  /**
   * Wet earth: heavy, sticky, nearly windproof. Fire dries it back to sand;
   * lava fires it into stone — pottery, at geological temperature.
   */
  private updateMud(x: number, y: number, i: number): void {
    const { w, cells } = this
    let fireNear = false
    let lavaNear = false
    for (let d = 0; d < 4; d++) {
      const j =
        d === 0 ? (x > 0 ? i - 1 : -1)
        : d === 1 ? (x + 1 < w ? i + 1 : -1)
        : d === 2 ? (y > 0 ? i - w : -1)
        : y + 1 < this.h ? i + w : -1
      if (j < 0) continue
      if (cells[j] === FIRE) fireNear = true
      else if (cells[j] === LAVA) lavaNear = true
    }
    if (lavaNear && this.rng.chance(0.3)) {
      cells[i] = STONE // kiln-fired
      this.meta[i] = 0
      this.updated[i] = 1
      return
    }
    if (fireNear && this.rng.chance(0.03)) {
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
    if ((b === STEAM || b === SMOKE) && this.rng.chance(0.9)) {
      this.swap(i, below) // falls through gas
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

  /**
   * Timber. Catches slowly (hold a flame to it), then burns IN PLACE — the
   * structure keeps its shape while flames dance on it — and finally
   * crumbles, part ash-dust, part nothing. Water douses a burning log.
   * meta is the burn clock: 0 = sound wood, >0 = burning.
   */
  private updateWood(x: number, y: number, i: number): void {
    const { w, cells } = this
    let fireNear = false
    let waterNear = false
    for (let d = 0; d < 4; d++) {
      const j =
        d === 0 ? (x > 0 ? i - 1 : -1)
        : d === 1 ? (x + 1 < w ? i + 1 : -1)
        : d === 2 ? (y > 0 ? i - w : -1)
        : y + 1 < this.h ? i + w : -1
      if (j < 0) continue
      if (cells[j] === FIRE || cells[j] === LAVA) fireNear = true
      else if (cells[j] === WATER) waterNear = true
    }
    const burning = this.meta[i] > 0
    if (!burning) {
      if (fireNear && this.rng.chance(0.06)) this.meta[i] = 1 // caught
      return
    }
    if (waterNear) {
      this.meta[i] = 0 // doused — the char survives
      return
    }
    this.meta[i]++
    if (this.meta[i] > 70) {
      // Burnt through: everything returns to dust (some of it, anyway).
      if (this.rng.chance(0.35)) {
        cells[i] = DUST
        this.meta[i] = 0
      } else {
        cells[i] = EMPTY
        this.meta[i] = 0
        this.shade[i] = 0
        this.count--
      }
      this.updated[i] = 1
      return
    }
    // Flames lick off the burning log into open neighbors.
    if (this.rng.chance(0.35) && this.count < this.budget) {
      const d = this.rng.int(4)
      const j =
        d === 0 ? (x > 0 ? i - 1 : -1)
        : d === 1 ? (x + 1 < w ? i + 1 : -1)
        : d === 2 ? (y > 0 ? i - w : -1)
        : y + 1 < this.h ? i + w : -1
      if (j >= 0 && cells[j] === EMPTY) {
        this.write(j, FIRE)
        this.meta[j] = 10 + this.rng.int(14) // licks off the log: brief, red
        this.count++
        this.updated[j] = 1
      }
    }
  }

  /**
   * Falls, rolls, waits for wet ground. On mud — or on sand with water at
   * hand — it sprouts into a sapling that grows a wood trunk. Pops into flame near fire or lava.
   */
  private updateSeed(x: number, y: number, i: number): void {
    const { w, cells } = this
    const hotNear =
      (x > 0 && (cells[i - 1] === FIRE || cells[i - 1] === LAVA)) ||
      (x + 1 < w && (cells[i + 1] === FIRE || cells[i + 1] === LAVA)) ||
      (y > 0 && (cells[i - w] === FIRE || cells[i - w] === LAVA)) ||
      (y + 1 < this.h && (cells[i + w] === FIRE || cells[i + w] === LAVA))
    if (hotNear && this.rng.chance(0.5)) {
      cells[i] = FIRE // pop!
      this.meta[i] = 12 + this.rng.int(12)
      this.updated[i] = 1
      return
    }
    // A sprouted seed climbs its own trunk: it converts to wood and re-seeds
    // itself one cell up, meta counting the height left to grow — a sapling
    // rising in real time.
    if (this.meta[i] > 0 && y + 1 < this.h && cells[i + w] === WOOD) {
      if (!this.rng.chance(0.12)) return
      const h = this.meta[i]
      cells[i] = WOOD
      this.meta[i] = 0
      this.updated[i] = 1
      if (h > 1 && y > 0 && cells[i - w] === EMPTY && this.count < this.budget) {
        this.write(i - w, SEED)
        this.meta[i - w] = h - 1
        this.count++
        this.updated[i - w] = 1
      }
      return
    }
    if (this.windPush(x, y, i, WINDAGE[SEED])) return
    if (y + 1 >= this.h) return
    const below = i + w
    const b = cells[below]
    if (b === EMPTY) {
      this.moveTo(i, below)
      return
    }
    if ((b === STEAM || b === SMOKE) && this.rng.chance(0.6)) {
      this.swap(i, below)
      return
    }
    if (b === WATER) {
      if (this.rng.chance(0.15)) this.swap(i, below) // drifts down through ponds
      return
    }
    // Sprout: mud is a seedbed; sand will do if water is within reach. The
    // seed roots as the first wood cell and re-seeds itself above with a
    // height budget — a tree, grown trunk-cell by trunk-cell.
    if (b === MUD && this.rng.chance(0.02)) {
      this.sprout(x, y, i)
      return
    }
    if (b === SAND || b === DUST) {
      const wet =
        (x > 0 && cells[i - 1] === WATER) ||
        (x + 1 < w && cells[i + 1] === WATER) ||
        (y > 0 && cells[i - w] === WATER)
      if (wet && this.rng.chance(0.02)) {
        this.sprout(x, y, i)
        return
      }
    }
    // Round little things roll off ledges (and skitter on ice).
    const le = x > 0 && cells[below - 1] === EMPTY
    const re = x + 1 < w && cells[below + 1] === EMPTY
    if (!le && !re) return
    if (b !== ICE && !this.rng.chance(0.4)) return
    const d = le && re ? this.rng.sign() : le ? -1 : 1
    this.moveTo(i, below + d)
  }

  /** Root a seed: it becomes wood and a climbing seed rises to grow the trunk. */
  private sprout(x: number, y: number, i: number): void {
    this.cells[i] = WOOD
    this.meta[i] = 0
    this.updated[i] = 1
    if (y > 0 && this.cells[i - this.w] === EMPTY && this.count < this.budget) {
      this.write(i - this.w, SEED)
      this.meta[i - this.w] = 3 + this.rng.int(6) // trunk height to come
      this.count++
      this.updated[i - this.w] = 1
    }
  }

  /**
   * Living green. Grows over and around water — into OPEN cells, not into
   * the pond itself — sipping the water that fuels it. A crowding limit
   * (a shoot only extends where it isn't hemmed in by other vine) keeps
   * the growth branchy and tendril-like instead of a solid green block.
   */
  private updateVine(x: number, y: number, i: number): void {
    const { w, cells } = this
    let waterAt = -1
    for (let d = 0; d < 4; d++) {
      const j =
        d === 0 ? (x > 0 ? i - 1 : -1)
        : d === 1 ? (x + 1 < w ? i + 1 : -1)
        : d === 2 ? (y > 0 ? i - w : -1)
        : y + 1 < this.h ? i + w : -1
      if (j < 0) continue
      const n = cells[j]
      if ((n === FIRE || n === LAVA) && this.rng.chance(0.35)) {
        cells[i] = FIRE
        this.meta[i] = 14 + this.rng.int(14)
        this.updated[i] = 1
        return
      }
      if (n === WATER) waterAt = j
    }
    if (waterAt < 0 || !this.rng.chance(0.15)) return // no source, no growth
    // Shoot direction: mostly lateral, so vines creep along the waterline
    // (shoots that climb away from water stop growing — by design — which
    // reads as stubs and sprigs above a spreading green fringe).
    const r = this.rng.int(10)
    const d = r < 3 ? 0 : r < 6 ? 1 : r < 9 ? 2 : 3
    const tx = d === 0 ? x - 1 : d === 1 ? x + 1 : x
    const ty = d === 2 ? y - 1 : d === 3 ? y + 1 : y
    if (tx < 0 || tx >= w || ty < 0 || ty >= this.h) return
    const t = ty * w + tx
    if (cells[t] !== EMPTY) return
    if (this.vineNeighbors(tx, ty, t) > 3) return // crowded: stay branchy
    if (this.count >= this.budget) return
    this.write(t, VINE)
    this.count++
    this.updated[t] = 1
    // Growth drinks: about one water cell per few new shoots.
    if (this.rng.chance(0.3)) {
      cells[waterAt] = EMPTY
      this.meta[waterAt] = 0
      this.shade[waterAt] = 0
      this.count--
      this.updated[waterAt] = 1
    }
  }

  /** 8-neighborhood vine census — the branching (crowding) limit. */
  private vineNeighbors(x: number, y: number, i: number): number {
    const { w, cells } = this
    let n = 0
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy
      if (yy < 0 || yy >= this.h) continue
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const xx = x + dx
        if (xx < 0 || xx >= w) continue
        if (cells[i + dy * w + dx] === VINE) n++
      }
    }
    return n
  }

  /**
   * Patient and expansionist: spreads freezing into touching water, so a
   * crystal seeds a glacier. Melts near heat; lava and ice both pay (R3).
   * Its surface is frictionless — powders skitter off instead of piling.
   */
  private updateIce(x: number, y: number, i: number): void {
    const { w, cells } = this
    for (let d = 0; d < 4; d++) {
      const j =
        d === 0 ? (x > 0 ? i - 1 : -1)
        : d === 1 ? (x + 1 < w ? i + 1 : -1)
        : d === 2 ? (y > 0 ? i - w : -1)
        : y + 1 < this.h ? i + w : -1
      if (j < 0) continue
      const n = cells[j]
      if (n === LAVA && this.rng.chance(0.4)) {
        cells[i] = WATER // both sides pay: ice melts…
        this.meta[i] = this.rng.next() & 1
        this.updated[i] = 1
        cells[j] = STONE // …and the lava freezes
        this.meta[j] = 0
        this.updated[j] = 1
        return
      }
      if (n === FIRE && this.rng.chance(0.08)) {
        cells[i] = WATER
        this.meta[i] = this.rng.next() & 1
        this.updated[i] = 1
        return
      }
      if (n === WATER && this.rng.chance(0.012)) {
        cells[j] = ICE // the glacier creeps
        this.meta[j] = 0
        this.updated[j] = 1
        return
      }
    }
  }

  /**
   * The sharp cousin of dust's whoomph. Touching fire or lava detonates it
   * outright: the grain becomes a brief blast-front flame and slams a hard
   * spike into the pressure field — piles chain grain-to-grain into a real
   * explosion (hard enough to shatter glass). Moisture ruins it to dust.
   */
  private updateGunpowder(x: number, y: number, i: number): void {
    const { w, cells } = this
    let hot = false
    let wet = false
    for (let d = 0; d < 4; d++) {
      const j =
        d === 0 ? (x > 0 ? i - 1 : -1)
        : d === 1 ? (x + 1 < w ? i + 1 : -1)
        : d === 2 ? (y > 0 ? i - w : -1)
        : y + 1 < this.h ? i + w : -1
      if (j < 0) continue
      const n = cells[j]
      if (n === FIRE || n === LAVA) hot = true
      else if (n === WATER || n === STEAM) wet = true
    }
    if (hot) {
      cells[i] = FIRE
      this.meta[i] = 8 + this.rng.int(8) // blast front, not a campfire
      this.updated[i] = 1
      this.wind.addPressure(x, y, 4, 12)
      return
    }
    if (wet && this.rng.chance(0.25)) {
      cells[i] = DUST // damp powder is just grey dirt
      this.meta[i] = 0
      this.updated[i] = 1
      return
    }
    if (this.windPush(x, y, i, WINDAGE[GUNPOWDER])) return
    if (y + 1 >= this.h) return
    const below = i + w
    const b = cells[below]
    if (b === EMPTY) {
      if (
        y + 2 < this.h &&
        cells[below + w] === EMPTY &&
        this.rng.chance(0.12)
      ) {
        const dd = this.rng.sign()
        const nx = x + dd
        if (nx >= 0 && nx < w && cells[below + dd] === EMPTY) {
          this.moveTo(i, below + dd)
          return
        }
      }
      this.moveTo(i, below)
      return
    }
    if ((b === STEAM || b === SMOKE) && this.rng.chance(0.9)) {
      this.swap(i, below)
      return
    }
    if (b === WATER && this.rng.chance(0.5)) {
      this.swap(i, below) // sinks — and the soak will ruin it
      return
    }
    const le = x > 0 && cells[below - 1] === EMPTY
    const re = x + 1 < w && cells[below + 1] === EMPTY
    if (!le && !re) return
    if (!this.rng.chance(0.5)) return
    const dd = le && re ? this.rng.sign() : le ? -1 : 1
    this.moveTo(i, below + dd)
  }

  /**
   * Slow dark fuel. Floats on water (water sinks past it), pours goopily,
   * and lights eagerly from fire or lava — a burning slick spreads flame
   * across its whole surface.
   */
  private updateOil(x: number, y: number, i: number): void {
    const { w, cells } = this
    const hot =
      (x > 0 && (cells[i - 1] === FIRE || cells[i - 1] === LAVA)) ||
      (x + 1 < w && (cells[i + 1] === FIRE || cells[i + 1] === LAVA)) ||
      (y > 0 && (cells[i - w] === FIRE || cells[i - w] === LAVA)) ||
      (y + 1 < this.h && (cells[i + w] === FIRE || cells[i + w] === LAVA))
    if (hot && this.rng.chance(0.3)) {
      cells[i] = FIRE
      this.meta[i] = 14 + this.rng.int(14) // reaction flame: brief, red
      this.updated[i] = 1
      return
    }
    if (this.windPush(x, y, i, WINDAGE[OIL])) return
    const below = i + w
    if (y + 1 < this.h && cells[below] === EMPTY) {
      if (
        y + 2 < this.h &&
        cells[below + w] === EMPTY &&
        this.rng.chance(0.2)
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
    if (y + 1 < this.h) {
      const b = cells[below]
      if ((b === STEAM || b === SMOKE) && this.rng.chance(0.85)) {
        this.swap(i, below)
        return
      }
      const le = x > 0 && cells[below - 1] === EMPTY
      const re = x + 1 < w && cells[below + 1] === EMPTY
      if (le || re) {
        const d = le && re ? this.rng.sign() : le ? -1 : 1
        this.moveTo(i, below + d)
        return
      }
      // Supported-only spreading, same rule as water (airborne clumps hold).
      const bb = cells[below]
      if (bb === OIL) {
        const supported = y + 2 >= this.h || cells[below + w] !== EMPTY
        if (!supported) return
      }
    }
    const dir = this.meta[i] === 0 ? -1 : 1
    const ahead = x + dir >= 0 && x + dir < w ? cells[i + dir] : WALL
    if (ahead === EMPTY) {
      let dest = i + dir
      if (x + dir * 2 >= 0 && x + dir * 2 < w && cells[i + dir * 2] === EMPTY) dest = i + dir * 2
      this.moveTo(i, dest)
      return
    }
    const behind = x - dir >= 0 && x - dir < w ? cells[i - dir] : WALL
    if (behind !== EMPTY) return
    if (ahead === OIL && this.rng.chance(0.8)) return // queue with the slick
    this.meta[i] = dir === -1 ? 1 : 0
    this.moveTo(i, i - dir)
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
