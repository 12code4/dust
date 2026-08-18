/**
 * Browser smoke test: serves the built app, paints a scene through the
 * window.dust hook, verifies the sim actually runs at speed, and saves a
 * screenshot (SMOKE_SHOT env var overrides the output path).
 *
 *   npm run smoke
 */
import { preview } from 'vite'
import { chromium } from 'playwright'

const server = await preview({ preview: { port: 4173, host: '127.0.0.1' } })
const url = 'http://127.0.0.1:4173/'

const browser = await chromium
  .launch()
  .catch(() => chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }))

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 820 } })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => 'dust' in window)

  // Paint a scene: shelves, a sand mass, deep pools — then let it settle.
  await page.evaluate(() => {
    const { world } = window.dust
    const WALL = 1, SAND = 2, WATER = 3
    for (let x = 40; x < 240; x++) world.set(x, 170, WALL)
    for (let x = 180; x < 380; x++) world.set(x, 240, WALL)
    for (let y = 20; y < 55; y++) for (let x = 60; x < 200; x++) world.set(x, y, SAND)
    for (let y = 60; y < 105; y++) for (let x = 250; x < 385; x++) world.set(x, y, WATER)
    for (let i = 0; i < 10; i++) world.paintDisk(80 + i * 14, 130, 6, SAND)
  })
  await page.waitForTimeout(4000)

  // Light bonfires in two waves so the shot catches risen flames + fresh base
  // (fire lives ≈ 24–72 ticks, so timing matters here).
  const light = () =>
    page.evaluate(() => {
      const { world } = window.dust
      const FIRE = 4
      for (let i = 0; i < 5; i++) world.paintDisk(60 + i * 24, 288, 7, FIRE, 0.5)
    })
  await light()
  await page.waitForTimeout(500)
  await light()
  // Dress the scene: water mid-fall, dust drifts settling on the dune, flow
  // filter on, a vacuum working the dune — and a dust cloud dropped over the
  // bonfires, timed so the deflagration flash lands in the frame.
  await page.evaluate(() => {
    const DUST = 6
    const LAVA = 9
    window.dust.world.paintDisk(320, 25, 9, 3)
    for (let i = 0; i < 6; i++) window.dust.world.paintDisk(120 + i * 14, 150, 5, DUST)
    // Lava onto the dune's right slope: glass streaks, fire tongues, smoke.
    for (let i = 0; i < 3; i++) window.dust.world.paintDisk(215 + i * 8, 120, 4, LAVA)
    // The Life pack: wooden posts among the bonfires (they catch and burn
    // standing), an ice floe freezing into the pool, sprigs on the shore.
    const WOOD = 12, PLANT = 14, ICE = 15
    for (let k = 0; k < 3; k++)
      for (let y = 268; y < 296; y++) {
        window.dust.world.set(95 + k * 35, y, WOOD)
        window.dust.world.set(96 + k * 35, y, WOOD)
      }
    window.dust.world.paintDisk(350, 208, 6, ICE)
    for (let k = 0; k < 6; k++) window.dust.world.set(254 + k, 233, PLANT)
    window.dust.renderer.flow = true
    const suck = () => window.dust.world.wind.addPressure(330, 200, -1.4, 20)
    const h = setInterval(suck, 16)
    setTimeout(() => clearInterval(h), 1200)
  })
  await page.waitForTimeout(1200)
  await page.evaluate(() => {
    const DUST = 6
    window.dust.world.paintDisk(110, 255, 11, DUST, 0.8) // the silo moment
  })
  await page.waitForTimeout(400)

  const stats = await page.evaluate(() => window.dust.stats())
  console.log(
    `dots ${stats.dots}  fps ${stats.fps.toFixed(1)}  sim ${stats.simMs.toFixed(2)} ms`,
  )

  const shot = process.env.SMOKE_SHOT ?? 'dust-m0.png'
  await page.screenshot({ path: shot })
  console.log(`screenshot: ${shot}`)

  if (stats.dots < 8000) throw new Error(`too few dots: ${stats.dots}`)
  if (stats.fps < 50) throw new Error(`fps too low: ${stats.fps.toFixed(1)}`)
  // fps alone can't see a slow sim (the loop drops ticks before fps sags), so
  // hold the sim itself to the docs/05 per-tick budget.
  if (stats.simMs > 8) throw new Error(`sim too slow: ${stats.simMs.toFixed(2)} ms/tick`)
  console.log('SMOKE PASS')
} finally {
  await browser.close()
  await server.close()
}
