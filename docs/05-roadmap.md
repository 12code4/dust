# Dust — Engine Notes & Roadmap

## 1. Engine architecture (the decision)

**TypeScript + Vite, Canvas2D `ImageData` blit, sim in plain typed arrays.**
Port the hot loop to Rust/WASM (Sandspiel's proven path) *only if profiling demands it*;
upgrade rendering to WebGL when display modes need shaders.

Why this and not that:

- **Browser-first** is non-negotiable — Powder Game's reach *was* the browser. One click,
  zero install, save codes in URLs.
- **CPU sim in JS first**: our world is 400×300 = 120,000 cells with a 50,000-dot cap.
  The Powder Toy pushes far more in C++; Sandspiel runs comparable grids in WASM at 60fps;
  a tight structure-of-arrays JS loop with no allocation handles this budget. Measured
  target: **sim ≤ 8 ms/frame** at 60fps on a mid laptop; if we blow it, the sim module is
  designed to port to WASM without API change.
- **Determinism from day one** (fixed timestep, seeded xorshift PRNG, integer math): replays,
  golden tests, and URL saves all fall out of this single property. Retrofitting it is
  miserable; we never will.

### Core loop (per tick)

1. **Wind pass** — 50×38 coarse air grid: advect, diffuse, decay; apply impulses queued by
   explosions/convection (TPT's coarse-grid trick).
2. **Particle pass** — bottom-up scan for falling matter, top-down for rising, horizontal
   direction alternating per row/frame (Noita's playbook); per-cell parity bit prevents
   double-updates; movement layer then reaction layers (see doc 04 §1).
3. **Render pass** — element→RGBA palette into `ImageData`; display modes post-process
   (air heatmap, flow vectors, glow, toon, gray, reaction-flash).

### Performance guardrails

- 32×32 **chunks with dirty rects** — sleeping regions cost ~zero (Noita's scheme, scaled
  to our world size).
- The **50,000-dot budget** is both homage and our hard perf ceiling — the counter in the
  UI is the same number the engine trusts.
- No per-particle allocation, ever. SoA typed arrays: `element`, `meta`, `impulse`, `parity`.

### Data-driven chemistry

`elements.toml` (properties: state, density, windage, flammable, conductive, soluble, …)
and `reactions.toml` (special pairs: reactants, products, rate, effects). The sim compiles
these into flat lookup tables at boot. CI runs the completeness suite (doc 04 §5): the
matrix cannot regress, and adding an element without finishing its row fails the build.

## 2. Milestones

### M0 — Falling sand weekend *(prove the loop)*
Sand, water, wall, fire. Bottom-up scan, density displacement, Canvas blit, pause/step,
FPS + dot counters. **Exit test**: 50k particles at 60fps.

### M1 — The chemistry engine *(prove the matrix)*
All 24 elements' *properties*; resolution layers 1–6; `elements.toml`/`reactions.toml`;
completeness CI + first golden-frame tests. Not all special pairs yet — but every pair
*resolves*. **Exit test**: CI matrix suite green.

### M2 — Wind & the Namesake *(prove the soul)*
Coarse air field; wind/air±/drag tools; convection, explosion impulses; dust lofting,
settling, and **deflagration**; ember carry. **Exit test**: the grain-silo demo — burn a
forest, watch soot fill the sky, strike one spark, regret it.

### M3 — Full registry & the Codex *(prove the content)*
Every registry reaction implemented + unit-tested; Discovery Codex UI (24×24 grid fills as
you witness); display modes; URL save codes; undo. **Exit test**: a fresh player can reach
100% codex — every special pair is actually reachable in play.

### M4 — Objects *(prove the game-maker)*
Ball (element-typed, matrix semantics preserved) → box + joints (ropes, bridges, vehicles)
→ Player & Fighter stickfolk (arrows/WASD; the kicker) → fan/emitter/pressure-plate
primitives. Each lands in PG's historical order because that was the ascending payoff order.
**Exit test**: build a playable platforming course with a lava hazard and a rope bridge.

### M5 — Community *(prove the moat)*
Gallery with animated WebP thumbnails (Sandspiel's insight), Dan-Ball-style rate limits
(1 upload/day, vote caps, no self-votes), forking with lineage. Optional: daily challenge
seed ("build X with 5,000 dots").

## 3. Testing philosophy

- **Unit**: one test per registry reaction (place, step, assert products).
- **Property/fuzz**: random draws each frame; invariants — dot count ≤ budget, no
  `UNDEFINED` resolution, no particle overlap, symmetric matrix.
- **Golden frames**: seeded scenes hashed after N ticks; any diff is a deliberate,
  reviewed change. Determinism makes flake impossible — a failing golden test is a real bug.
- **The silo demo** stays in CI forever as the canary: if dust stops exploding, the build
  is broken *culturally*, whatever the unit tests say.

## 4. Open questions (deliberately deferred, not forgotten)

1. Do liquids need pressure-based equalization (U-tube behavior) in v1, or does PG-style
   spreading feel good enough? *(Decide in M2 playtesting.)*
2. Glass rendering: true transparency needs render-order care in Canvas2D — cheap trick or
   WebGL earlier than planned?
3. Codex auto-credit for `·` pairs: credit on first adjacency, or only special pairs count
   toward 100%? *(Leaning: only special pairs count; defaults shown as pre-filled gray.)*
4. Mobile: touch drag conflicts with pan/zoom — PG never solved mobile well; Sandspiel did.
   Study its touch UX before M3.
5. v2 roster candidates, in matrix-cost order: virus, gas, nitro, fuse, laser, thunder,
   mercury, ant, bird, fish. Each costs a full 24-cell row — the bar is meant to be felt.
