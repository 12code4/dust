import { SHADES, FIRE, ELEMENT_COUNT } from '../sim/elements.ts'
import type { World } from '../sim/world.ts'

/**
 * ImageData blitter. Colors are pre-packed into a Uint32 palette indexed by
 * (element * 4 + shade); we write whole pixels through a Uint32 view, which is
 * byte-order dependent, so the palette is packed to match the host endianness
 * (in practice always little-endian, but checking costs one line at startup).
 */
export class Renderer {
  /** The flow filter: reveal the (otherwise invisible) air field as vectors. */
  flow = false
  /** PG's red line: the wind tool's aim, drawn while the button is held. */
  windLine: { x0: number; y0: number; x1: number; y1: number } | null = null
  private readonly ctx: CanvasRenderingContext2D
  private readonly image: ImageData
  private readonly pixels: Uint32Array
  private readonly palette: Uint32Array
  private readonly world: World

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.world = world
    canvas.width = world.w
    canvas.height = world.h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    this.ctx = ctx
    this.image = ctx.createImageData(world.w, world.h)
    this.pixels = new Uint32Array(this.image.data.buffer)

    const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1
    this.palette = new Uint32Array(ELEMENT_COUNT * 4)
    for (let el = 0; el < ELEMENT_COUNT; el++) {
      for (let s = 0; s < 4; s++) {
        const [r, g, b] = SHADES[el][s]
        this.palette[el * 4 + s] = littleEndian
          ? (0xff << 24) | (b << 16) | (g << 8) | r
          : (r << 24) | (g << 16) | (b << 8) | 0xff
      }
    }
  }

  draw(): void {
    const { cells, meta, shade } = this.world
    const { pixels, palette } = this
    for (let i = 0; i < cells.length; i++) {
      const el = cells[i]
      // Fire renders by remaining lifetime (white-hot birth → red embers).
      // Lives run 90–240, so >>6 spreads fresh flame across the red/orange/
      // yellow mix and saves pure ember-red for the fade.
      const s = el === FIRE ? Math.min(3, meta[i] >> 6) : shade[i]
      pixels[i] = palette[el * 4 + s]
    }
    this.ctx.putImageData(this.image, 0, 0)
    if (this.flow) this.drawFlow()
    if (this.windLine) {
      const { x0, y0, x1, y1 } = this.windLine
      const ctx = this.ctx
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.9)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x0 + 0.5, y0 + 0.5)
      ctx.lineTo(x1 + 0.5, y1 + 0.5)
      ctx.stroke()
    }
  }

  /**
   * BG-line's heir: pressure as a red (high) / blue (low) tint, and one short
   * vector per air cell that's actually moving.
   */
  private drawFlow(): void {
    const { wind } = this.world
    const ctx = this.ctx
    const cell = 4
    for (let cy = 0; cy < wind.ch; cy++) {
      for (let cx = 0; cx < wind.cw; cx++) {
        const p = wind.p[cy * wind.cw + cx]
        if (p > 0.25 || p < -0.25) {
          const a = Math.min(0.35, Math.abs(p) * 0.1)
          ctx.fillStyle = p > 0 ? `rgba(255,90,60,${a})` : `rgba(70,130,255,${a})`
          ctx.fillRect(cx * cell, cy * cell, cell, cell)
        }
      }
    }
    ctx.strokeStyle = 'rgba(110, 210, 255, 0.55)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let cy = 0; cy < wind.ch; cy++) {
      for (let cx = 0; cx < wind.cw; cx++) {
        const i = cy * wind.cw + cx
        const vx = wind.vx[i]
        const vy = wind.vy[i]
        if (vx * vx + vy * vy < 0.0025) continue
        const px = cx * cell + cell / 2
        const py = cy * cell + cell / 2
        ctx.moveTo(px, py)
        ctx.lineTo(px + vx * 8, py + vy * 8)
      }
    }
    ctx.stroke()
  }
}
