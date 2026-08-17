import { World } from './sim/world.ts'
import { Renderer } from './render/renderer.ts'
import { WALL, SAND, WATER, FIRE, EMPTY, SHADES } from './sim/elements.ts'

const world = new World(400, 300, 0xd05e ^ Date.now())
const canvas = document.getElementById('view') as HTMLCanvasElement
const renderer = new Renderer(canvas, world)

// ---- toolbar -------------------------------------------------------------

// el: -1 marks the wind tool — it blows the air field instead of painting.
type Tool = { name: string; el: number; density: number }
const WIND_TOOL = -1
const TOOLS: Tool[] = [
  { name: 'wall', el: WALL, density: 1 },
  { name: 'sand', el: SAND, density: 1 },
  { name: 'water', el: WATER, density: 1 },
  { name: 'fire', el: FIRE, density: 0.3 },
  { name: '💨 wind', el: WIND_TOOL, density: 1 },
  { name: 'erase', el: EMPTY, density: 1 },
]
const PEN_SIZES = [1, 2, 4, 8, 16]

let tool = TOOLS[1] // sand
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
  const b = button(`${t.el === EMPTY || t.el === WIND_TOOL ? '' : swatch(t.el)}${t.name}`, () => {
    tool = t
    toolButtons.forEach((x) => x.classList.remove('active'))
    b.classList.add('active')
  })
  toolbar.appendChild(b)
  return b
})
toolButtons[1].classList.add('active')

controls.append(
  ...PEN_SIZES.map((s, idx) => {
    const b = button(`●${s}`, (btn) => {
      pen = s
      controls.querySelectorAll('button.pen').forEach((x) => x.classList.remove('active'))
      btn.classList.add('active')
    })
    b.classList.add('pen')
    if (s === 4) b.classList.add('active')
    return b
  }),
)
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

let drawing = false
let erasing = false
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
 * Wind input, PG-style: press to anchor, drag to aim — a red line shows the
 * blow direction and strength, and wind streams continuously every sim tick
 * while the button is held. Right button with the wind tool is a VACUUM
 * (PG's air-decrease): a moving low-pressure zone that sucks matter toward
 * the cursor through the pressure field.
 */
const windInput = {
  active: false,
  mode: 'blow' as 'blow' | 'suck',
  anchorX: 0,
  anchorY: 0,
  curX: 0,
  curY: 0,
}

function pumpWind(): void {
  if (!windInput.active) return
  if (windInput.mode === 'suck') {
    world.wind.addPressure(windInput.curX, windInput.curY, -(0.35 + pen * 0.1), pen * 4 + 8)
    return
  }
  const k = 0.004 + pen * 0.002 // strength scales with pen (PG rule)
  const clamp = (v: number) => (v > 3 ? 3 : v < -3 ? -3 : v)
  const dvx = clamp((windInput.curX - windInput.anchorX) * k)
  const dvy = clamp((windInput.curY - windInput.anchorY) * k)
  world.wind.addImpulse(windInput.anchorX, windInput.anchorY, dvx, dvy, pen * 4 + 8)
}

/** Stamp along the segment from the previous event so fast strokes stay solid. */
function stroke(x0: number, y0: number, x1: number, y1: number): void {
  const el = erasing ? EMPTY : tool.el
  const density = erasing ? 1 : tool.density
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / steps)
    const y = Math.round(y0 + ((y1 - y0) * s) / steps)
    world.paintDisk(x, y, pen, el, density)
  }
}

// Stroke state is a single slot, so only the primary pointer draws — a second
// finger would otherwise interleave positions and paint streaks between them.
canvas.addEventListener('pointerdown', (e) => {
  if (!e.isPrimary) return
  e.preventDefault()
  canvas.setPointerCapture(e.pointerId)
  const [x, y] = canvasPos(e)
  if (tool.el === WIND_TOOL) {
    windInput.active = true
    windInput.mode = e.button === 2 ? 'suck' : 'blow'
    windInput.anchorX = x
    windInput.anchorY = y
    windInput.curX = x
    windInput.curY = y
    return
  }
  drawing = true
  erasing = e.button === 2
  lastX = x
  lastY = y
  stroke(lastX, lastY, lastX, lastY)
})
canvas.addEventListener('pointermove', (e) => {
  if (!e.isPrimary) return
  const [x, y] = canvasPos(e)
  if (windInput.active) {
    windInput.curX = x
    windInput.curY = y
    return
  }
  if (!drawing) return
  stroke(lastX, lastY, x, y)
  lastX = x
  lastY = y
})
canvas.addEventListener('pointerup', (e) => {
  if (!e.isPrimary) return
  drawing = false
  windInput.active = false
})
canvas.addEventListener('pointercancel', (e) => {
  if (!e.isPrimary) return
  drawing = false
  windInput.active = false
})
canvas.addEventListener('contextmenu', (e) => e.preventDefault())

// ---- main loop: fixed 60 Hz sim, render every animation frame ------------

const SIM_HZ = 60
const STEP_MS = 1000 / SIM_HZ
const MAX_STEPS = 4 // don't spiral after a background-tab stall

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
  const t0 = performance.now()
  while (acc >= STEP_MS && steps < MAX_STEPS) {
    if (!paused || stepOnce) {
      pumpWind() // held wind/vacuum streams into every tick
      world.step()
      stepOnce = false
      stepped++
    }
    acc -= STEP_MS
    steps++
  }
  if (acc >= STEP_MS) acc = 0 // dropped ticks; keep real-time feel
  if (stepped > 0) simEma += ((performance.now() - t0) / stepped - simEma) * 0.1

  renderer.windLine =
    windInput.active && windInput.mode === 'blow'
      ? {
          x0: windInput.anchorX,
          y0: windInput.anchorY,
          x1: windInput.curX,
          y1: windInput.curY,
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
