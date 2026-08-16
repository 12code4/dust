import { SHADES, FIRE, ELEMENT_COUNT } from '../sim/elements.ts'
import type { World } from '../sim/world.ts'

/**
 * ImageData blitter. Colors are pre-packed into a Uint32 palette indexed by
 * (element * 4 + shade); we write whole pixels through a Uint32 view, which is
 * byte-order dependent, so the palette is packed to match the host endianness
 * (in practice always little-endian, but checking costs one line at startup).
 */
export class Renderer {
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
      const s = el === FIRE ? Math.min(3, meta[i] >> 4) : shade[i]
      pixels[i] = palette[el * 4 + s]
    }
    this.ctx.putImageData(this.image, 0, 0)
  }
}
