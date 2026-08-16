/**
 * M0 exit-test bench: ~50k live dots on the full 400×300 grid, 600 ticks.
 * Target (docs/05): sim ≤ 8 ms/frame on a mid laptop.
 *
 *   npm run bench
 */
import { World } from '../src/sim/world.ts'
import { SAND, WATER, FIRE, WALL, STEAM } from '../src/sim/elements.ts'

const w = new World(400, 300, 0xbeef)

// Terrain: shelves that force lots of lateral flow.
for (let x = 0; x < 260; x++) w.set(x, 120, WALL)
for (let x = 140; x < 400; x++) w.set(x, 200, WALL)

// ~50k dots: a sand mass, a deep pool, fire, and steam for the risers.
for (let y = 0; y < 60; y++) for (let x = 20; x < 380; x++) w.set(x, y, SAND) // 21,600
for (let y = 130; y < 190; y++) for (let x = 0; x < 380; x++) w.set(x, y, WATER) // ~22,800
for (let y = 240; y < 250; y++) for (let x = 0; x < 400; x++) w.set(x, y, FIRE) // 4,000
for (let y = 260; y < 264; y++) for (let x = 0; x < 400; x++) w.set(x, y, STEAM) // 1,600

console.log(`grid ${w.w}x${w.h}, dots: ${w.count}/${w.budget}`)

const TICKS = 600
const times: number[] = []
for (let t = 0; t < TICKS; t++) {
  const t0 = performance.now()
  w.step()
  times.push(performance.now() - t0)
}

times.sort((a, b) => a - b)
const avg = times.reduce((s, x) => s + x, 0) / times.length
const p50 = times[Math.floor(times.length * 0.5)]
const p95 = times[Math.floor(times.length * 0.95)]
const max = times[times.length - 1]

console.log(`ticks: ${TICKS}, dots at end: ${w.count}`)
console.log(
  `ms/tick — avg ${avg.toFixed(3)}  p50 ${p50.toFixed(3)}  p95 ${p95.toFixed(3)}  max ${max.toFixed(3)}`,
)
const BUDGET_MS = 8
console.log(avg <= BUDGET_MS ? `PASS (avg ≤ ${BUDGET_MS} ms)` : `FAIL (avg > ${BUDGET_MS} ms)`)
if (avg > BUDGET_MS) process.exit(1)
