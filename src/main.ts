import { World } from './sim/world.ts'
import { Renderer } from './render/renderer.ts'
import {
  WALL,
  SAND,
  WATER,
  FIRE,
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
  EMPTY,
  SHADES,
} from './sim/elements.ts'

const world = new World(400, 300, 0xd05e ^ Date.now())
const canvas = document.getElementById('view') as HTMLCanvasElement
const renderer = new Renderer(canvas, world)

// ---- toolbar -------------------------------------------------------------

// Negative el marks the non-painting tools.
type Tool = { name: string; el: number; density: number }
const WIND_TOOL = -1
const DRAG_TOOL = -2
const VAC_TOOL = -3
const TOOLS: Tool[] = [
  { name: 'wall', el: WALL, density: 1 },
  { name: 'sand', el: SAND, density: 1 },
  { name: 'dust', el: DUST, density: 1 },
  { name: 'stone', el: STONE, density: 1 },
  { name: 'water', el: WATER, density: 1 },
  { name: 'mud', el: MUD, density: 1 },
  { name: 'lava', el: LAVA, density: 1 },
  { name: 'fire', el: FIRE, density: 0.3 },
  { name: 'smoke', el: SMOKE, density: 0.5 },
  { name: 'glass', el: GLASS, density: 1 },
  { name: 'wood', el: WOOD, density: 1 },
  { name: 'seed', el: SEED, density: 0.4 },
  { name: 'vine', el: VINE, density: 1 },
  { name: 'ice', el: ICE, density: 1 },
  { name: 'gunpowder', el: GUNPOWDER, density: 1 },
  { name: 'oil', el: OIL, density: 1 },
  { name: '💨 wind', el: WIND_TOOL, density: 1 },
  { name: '🌪 vac', el: VAC_TOOL, density: 1 },
  { name: '🖐 drag', el: DRAG_TOOL, density: 1 },
  { name: 'erase', el: EMPTY, density: 1 },
]
const PEN_MIN = 0 // PG's pen-s range: 0–9
const PEN_MAX = 9

// Dual wield: left button paints toolL, right button paints toolR — select
// with left/right clicks on the toolbar. Holding both mixes the two.
let toolL = TOOLS[1] // sand
let toolR = TOOLS[TOOLS.length - 1] // erase (right-drag erases, as ever)
let pen = 4
let paused = false
let stepOnce = false

const toolbar = document.getElementById('toolbar')!
const controls = document.getElementById('controls')!

function button(label: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.innerHTML = label
  b.addEventListener('click', () => onClick(b))
  return b
}

function swatch(el: number): string {
  const [r, g, b] = SHADES[el][0]
  return `<span class="swatch" style="background:rgb(${r},${g},${b})"></span>`
}

const toolButtons = TOOLS.map((t) => {
  const b = button(`${t.el < EMPTY ? '' : t.el === EMPTY ? '' : swatch(t.el)}${t.name}`, () => {
    toolL = t
    toolButtons.forEach((x) => x.classList.remove('active'))
    b.classList.add('active')
  })
  b.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    if (t.el < EMPTY) return // special tools live on the left button only
    toolR = t
    toolButtons.forEach((x) => x.classList.remove('active-r'))
    b.classList.add('active-r')
  })
  toolbar.appendChild(b)
  return b
})
toolButtons[1].classList.add('active')
toolButtons[TOOLS.length - 1].classList.add('active-r')

// Compact pen-size stepper: [−] ●n [+] over PG's 0–9 range (also mouse wheel).
const penLabel = document.createElement('span')
penLabel.className = 'pen-label'
function setPen(v: number): void {
  pen = Math.max(PEN_MIN, Math.min(PEN_MAX, v))
  penLabel.textContent = `●${pen}`
}
controls.append(
  button('−', () => setPen(pen - 1)),
  penLabel,
  button('+', () => setPen(pen + 1)),
)
setPen(pen)

// Sim speed stepper: ⏪ ×1 ⏩ over 1/8× … 8× (halving/doubling steps).
let simSpeed = 1
const speedLabel = document.createElement('span')
speedLabel.className = 'pen-label'
function setSpeed(v: number): void {
  simSpeed = Math.max(0.125, Math.min(8, v))
  speedLabel.textContent = simSpeed >= 1 ? `×${simSpeed}` : `×1/${1 / simSpeed}`
}
const sep0 = document.createElement('div')
sep0.className = 'sep'
controls.append(
  sep0,
  button('⏪', () => setSpeed(simSpeed / 2)),
  speedLabel,
  button('⏩', () => setSpeed(simSpeed * 2)),
)
setSpeed(1)
const sep = document.createElement('div')
sep.className = 'sep'
controls.append(
  sep,
  button('⏸ pause', (b) => {
    paused = !paused
    b.textContent = paused ? '▶ play' : '⏸ pause'
  }),
  button('⏭ step', () => {
    stepOnce = true
  }),
  button('🗑 clear', () => world.reset(0xd05e ^ Date.now())),
  button('🌀 flow', (b) => {
    renderer.flow = !renderer.flow
    b.classList.toggle('active', renderer.flow)
  }),
)

// ---- pointer drawing -----------------------------------------------------

let drawingL = false
let drawingR = false
let lastX = 0
let lastY = 0

function canvasPos(e: PointerEvent): [number, number] {
  // Map through the content box: getBoundingClientRect() includes the border,
  // which would skew clicks by up to half a cell at the edges.
  const rect = canvas.getBoundingClientRect()
  const bx = e.clientX - rect.left - canvas.clientLeft
  const by = e.clientY - rect.top - canvas.clientTop
  return [
    Math.floor((bx / canvas.clientWidth) * world.w),
    Math.floor((by / canvas.clientHeight) * world.h),
  ]
}

/**
 * Wind input: a leaf blower at the pointer. Wind exits from the CURRENT
 * cursor position every sim tick while the button is held, aimed along the
 * stroke's motion (holding still keeps blowing the last direction; strength
 * scales with the pen, PG-style). Right button with the wind tool is a
 * VACUUM (PG's air-decrease): a moving low-pressure zone that sucks matter
 * toward the cursor through the pressure field.
 */
const windInput = {
  active: false,
  mode: 'blow' as 'blow' | 'suck',
  dirX: 0, // unit aim from smoothed recent motion; zero until first movement
  dirY: 0,
  emaX: 0, // motion EMA — raw per-event deltas are 1–2 cell steps that
  emaY: 0, // quantize to 8 directions; smoothing preserves fine angles
  curX: 0,
  curY: 0,
}

/**
 * Drag input: the dots under the pen at CLICK time are grabbed and stay
 * grabbed — held in the hand against gravity (the sim skips held cells) and
 * hauled with the cursor in formation, collision-checked. Release throws
 * them with the tracked hand speed as real ballistic velocity.
 */
type Grabbed = { i: number; ox: number; oy: number }
const dragInput = {
  active: false,
  grabbed: [] as Grabbed[],
  curX: 0,
  curY: 0,
  vX: 0, // cursor velocity EMA, cells/tick
  vY: 0,
}

function beginDrag(x: number, y: number): void {
  dragInput.active = true
  dragInput.grabbed = []
  dragInput.curX = x
  dragInput.curY = y
  dragInput.vX = 0
  dragInput.vY = 0
  const r = pen + 1
  for (let oy = -r; oy <= r; oy++) {
    for (let ox = -r; ox <= r; ox++) {
      if (ox * ox + oy * oy > r * r) continue
      const cx = x + ox
      const cy = y + oy
      if (cx < 0 || cx >= world.w || cy < 0 || cy >= world.h) continue
      const i = cy * world.w + cx
      const el = world.cells[i]
      if (el !== EMPTY && el !== WALL) dragInput.grabbed.push({ i, ox, oy })
    }
  }
  world.held = dragInput.grabbed.map((g) => g.i)
}

function pumpDrag(): void {
  if (!dragInput.active) return
  const clamp6 = (v: number) => (v > 6 ? 6 : v < -6 ? -6 : v)
  // Pull each grabbed dot toward its formation slot around the cursor.
  let mx = 0
  let my = 0
  let n = 0
  for (const g of dragInput.grabbed) {
    const cx = g.i % world.w
    const cy = (g.i / world.w) | 0
    const dx = clamp6(dragInput.curX + g.ox - cx)
    const dy = clamp6(dragInput.curY + g.oy - cy)
    if (dx !== 0 || dy !== 0) {
      const j = world.dragMove(cx, cy, dx, dy)
      if (j >= 0) g.i = j
    }
    mx += dx
    my += dy
    n++
  }
  // Hand velocity: how fast the formation is actually being hauled.
  if (n > 0) {
    dragInput.vX = dragInput.vX * 0.7 + (mx / n) * 0.3
    dragInput.vY = dragInput.vY * 0.7 + (my / n) * 0.3
  }
  world.held = dragInput.grabbed.map((g) => g.i)
}

function releaseDrag(withThrow: boolean): void {
  if (!dragInput.active) return
  dragInput.active = false
  world.held = null
  if (withThrow) {
    // The throw: hand speed (cells/tick) → particle velocity (quarter-cells).
    const qvx = Math.round(dragInput.vX * 5)
    const qvy = Math.round(dragInput.vY * 5)
    if (qvx !== 0 || qvy !== 0) {
      for (const g of dragInput.grabbed) {
        world.setImpulse(g.i % world.w, (g.i / world.w) | 0, qvx, qvy)
      }
    }
  }
  dragInput.grabbed = []
  dragInput.vX = 0
  dragInput.vY = 0
}

function pumpWind(): void {
  if (!windInput.active) return
  if (windInput.mode === 'suck') {
    world.wind.addPressure(windInput.curX, windInput.curY, -(0.3 + pen * 0.18), pen * 3 + 8)
    return
  }
  if (windInput.dirX === 0 && windInput.dirY === 0) return // no aim yet
  const s = 0.9 + pen * 0.42 // breath at pen 0, gale at pen 9
  world.wind.addImpulse(
    windInput.curX,
    windInput.curY,
    windInput.dirX * s,
    windInput.dirY * s,
    pen * 3 + 6,
  )
}

/**
 * Element brushes emit continuously too (PG's pen): while the button is held
 * the brush re-stamps every sim tick at the pointer, so fire keeps burning,
 * water keeps pouring, and sand keeps streaming as the pile drains away
 * beneath the pen. Occupied cells no-op, so static stamps (wall) are free.
 */
function pumpPaint(): void {
  const both = drawingL && toolL.el >= EMPTY && drawingR
  if (drawingL && toolL.el >= EMPTY)
    world.paintDisk(lastX, lastY, pen, toolL.el, toolL.density * (both ? 0.5 : 1))
  if (drawingR)
    world.paintDisk(lastX, lastY, pen, toolR.el, toolR.density * (both ? 0.5 : 1))
}

/** Stamp along the segment from the previous event so fast strokes stay solid. */
function stroke(x0: number, y0: number, x1: number, y1: number, t: Tool, mix: boolean): void {
  const density = t.density * (mix ? 0.5 : 1)
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / steps)
    const y = Math.round(y0 + ((y1 - y0) * s) / steps)
    world.paintDisk(x, y, pen, t.el, density)
  }
}

// Stroke state is a single slot, so only the primary pointer draws — a second
// finger would otherwise interleave positions and paint streaks between them.
canvas.addEventListener('pointerdown', (e) => {
  if (!e.isPrimary) return
  e.preventDefault()
  canvas.setPointerCapture(e.pointerId)
  const [x, y] = canvasPos(e)
  lastX = x
  lastY = y
  if (e.button === 2) {
    // Right button always paints toolR — independently of the left hand.
    drawingR = true
    stroke(x, y, x, y, toolR, drawingL && toolL.el >= EMPTY)
    return
  }
  if (toolL.el === WIND_TOOL || toolL.el === VAC_TOOL) {
    windInput.active = true
    windInput.mode = toolL.el === VAC_TOOL ? 'suck' : 'blow'
    windInput.dirX = 0
    windInput.dirY = 0
    windInput.emaX = 0
    windInput.emaY = 0
    windInput.curX = x
    windInput.curY = y
    return
  }
  if (toolL.el === DRAG_TOOL) {
    beginDrag(x, y)
    return
  }
  drawingL = true
  stroke(x, y, x, y, toolL, drawingR)
})
canvas.addEventListener('pointermove', (e) => {
  if (!e.isPrimary) return
  const [x, y] = canvasPos(e)
  if (windInput.active) {
    const dx = x - windInput.curX
    const dy = y - windInput.curY
    if (dx !== 0 || dy !== 0) {
      windInput.emaX = windInput.emaX * 0.65 + dx * 0.35
      windInput.emaY = windInput.emaY * 0.65 + dy * 0.35
      const len = Math.hypot(windInput.emaX, windInput.emaY)
      if (len > 0.2) {
        windInput.dirX = windInput.emaX / len
        windInput.dirY = windInput.emaY / len
      }
    }
    windInput.curX = x
    windInput.curY = y
  }
  if (dragInput.active) {
    dragInput.curX = x
    dragInput.curY = y
  }
  const mix = drawingL && toolL.el >= EMPTY && drawingR
  if (drawingL && toolL.el >= EMPTY) stroke(lastX, lastY, x, y, toolL, mix)
  if (drawingR) stroke(lastX, lastY, x, y, toolR, mix)
  lastX = x
  lastY = y
})
canvas.addEventListener('pointerup', (e) => {
  if (!e.isPrimary) return
  if (e.button === 2) {
    drawingR = false
    return
  }
  drawingL = false
  windInput.active = false
  releaseDrag(true) // the throw happens here
})
canvas.addEventListener('pointercancel', (e) => {
  if (!e.isPrimary) return
  drawingL = false
  drawingR = false
  windInput.active = false
  releaseDrag(false) // cancelled: set down gently, no throw
})
canvas.addEventListener('contextmenu', (e) => e.preventDefault())
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    setPen(pen + (e.deltaY < 0 ? 1 : -1))
  },
  { passive: false },
)

// ---- main loop: fixed 60 Hz sim, render every animation frame ------------

const SIM_HZ = 60
const STEP_MS = 1000 / SIM_HZ

const dotsEl = document.getElementById('dots')!
const fpsEl = document.getElementById('fps')!
const simmsEl = document.getElementById('simms')!
document.getElementById('budget')!.textContent = String(world.budget)

let acc = 0
let last = performance.now()
let fpsEma = 60
let simEma = 0

function frame(now: number): void {
  const dt = Math.min(now - last, 250)
  last = now
  fpsEma += (1000 / Math.max(dt, 0.01) - fpsEma) * 0.05

  acc += dt
  let steps = 0
  let stepped = 0 // ticks the sim actually ran — paused frames must not feed the EMA
  const stepMs = STEP_MS / simSpeed // speed stepper stretches or packs ticks
  const maxSteps = Math.ceil(simSpeed) + 3 // allow bursts at high speed, no spirals
  const t0 = performance.now()
  while (acc >= stepMs && steps < maxSteps) {
    if (!paused || stepOnce) {
      pumpWind() // held wind/vacuum streams into every tick
      pumpDrag() // held drag hauls its catch along
      pumpPaint() // held brushes keep emitting, PG-pen style
      world.step()
      stepOnce = false
      stepped++
    }
    acc -= stepMs
    steps++
  }
  if (acc >= stepMs) acc = 0 // dropped ticks; keep real-time feel
  if (stepped > 0) simEma += ((performance.now() - t0) / stepped - simEma) * 0.1

  // Aim indicator: a short red line from the pointer along the blow direction.
  const aiming =
    windInput.active &&
    windInput.mode === 'blow' &&
    (windInput.dirX !== 0 || windInput.dirY !== 0)
  const reach = 8 + pen * 2
  renderer.windLine = aiming
    ? {
        x0: windInput.curX,
        y0: windInput.curY,
        x1: windInput.curX + windInput.dirX * reach,
        y1: windInput.curY + windInput.dirY * reach,
      }
    : null
  renderer.draw()
  dotsEl.textContent = String(world.count)
  fpsEl.textContent = fpsEma.toFixed(0)
  simmsEl.textContent = simEma.toFixed(2)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// Exposed for the smoke test and console tinkering.
declare global {
  interface Window {
    dust: {
      world: World
      renderer: Renderer
      stats: () => { dots: number; fps: number; simMs: number }
    }
  }
}
window.dust = {
  world,
  renderer,
  stats: () => ({ dots: world.count, fps: fpsEma, simMs: simEma }),
}
