/**
 * M0 exit-test bench: ~50k live dots on the full 400×300 grid, 600 ticks.
 * Target (docs/05): sim ≤ 8 ms/frame on a mid laptop.
 *
 *   npm run bench
 */
import { World } from '../src/sim/world.ts'
import { SAND, WATER, FIRE, WALL, STEAM, DUST } from '../src/sim/elements.ts'

const w = new World(400, 300, 0xbeef)

// Terrain: shelves that force lots of lateral flow.
for (let x = 0; x < 260; x++) w.set(x, 120, WALL)
for (let x = 140; x < 400; x++) w.set(x, 200, WALL)

// ~50k dots incl. dust near the fire rows, so the bench pays for lofting,
// wetting, smoke plumes, and deflagration chains — the worst realistic case.
for (let y = 0; y < 41; y++) for (let x = 20; x < 380; x++) w.set(x, y, SAND) // 14,760
for (let y = 43; y < 56; y++) for (let x = 20; x < 380; x++) w.set(x, y, DUST) // 4,680
for (let y = 130; y < 190; y++) for (let x = 0; x < 380; x++) w.set(x, y, WATER) // ~22,800
for (let y = 202; y < 209; y++) for (let x = 140; x < 380; x++) w.set(x, y, DUST) // 1,680
for (let y = 240; y < 250; y++) for (let x = 0; x < 400; x++) w.set(x, y, FIRE) // 4,000
for (let y = 260; y < 264; y++) for (let x = 0; x < 400; x++) w.set(x, y, STEAM) // 1,600

console.log(`grid ${w.w}x${w.h}, dots: ${w.count}/${w.budget}`)

/** Fire burns out in ≤71 ticks; relighting keeps the workload at ~50k active dots. */
function reignite(): void {
  for (let y = 240; y < 250; y++) for (let x = 0; x < 400; x++) w.set(x, y, FIRE)
}

// Unmeasured warm-up so JIT tiering (slow ticks #0–#10) doesn't pollute the gate.
const WARMUP = 50
for (let t = 0; t < WARMUP; t++) {
  if (t % 50 === 0) reignite()
  w.step()
}

const TICKS = 600
const times: number[] = []
let minDots = w.count
for (let t = 0; t < TICKS; t++) {
  if (t % 50 === 0) reignite()
  const t0 = performance.now()
  w.step()
  times.push(performance.now() - t0)
  if (w.count < minDots) minDots = w.count
}

times.sort((a, b) => a - b)
const avg = times.reduce((s, x) => s + x, 0) / times.length
const p50 = times[Math.floor(times.length * 0.5)]
const p95 = times[Math.floor(times.length * 0.95)]
const max = times[times.length - 1]

console.log(`ticks: ${TICKS} (+${WARMUP} warm-up), dots: ${minDots}–${w.budget} live`)
console.log(
  `ms/tick — avg ${avg.toFixed(3)}  p50 ${p50.toFixed(3)}  p95 ${p95.toFixed(3)}  max ${max.toFixed(3)}`,
)
// Gate on p95 as well as avg: a 60fps frame budget is per-tick, and an
// avg-only gate would pass a build whose worst ticks drop frames.
const BUDGET_MS = 8
const pass = avg <= BUDGET_MS && p95 <= BUDGET_MS
console.log(pass ? `PASS (avg & p95 ≤ ${BUDGET_MS} ms)` : `FAIL (budget ${BUDGET_MS} ms)`)
if (!pass) process.exit(1)
