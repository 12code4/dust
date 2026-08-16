# Dust — Design

*Everything returns to dust.*

## 0. Identity

**Dust** is a browser falling-sand sandbox with three promises:

1. **Complete chemistry** — every element interacts with every other element, by
   construction (see [the matrix](04-interaction-matrix.md)).
2. **Living air** — a wind/pressure field couples everything at a distance, like the
   original Powder Game and almost no clone since.
3. **A theme that is also a mechanic** — dust is the universal residue. Organic matter
   burns and withers into dust, smoke settles as soot-dust, rusted metal crumbles to dust,
   stone erodes to sand. And suspended dust + one spark = a deflagration
   (real grain-silo physics). The world tends toward dust; the player farms, fights, and
   weaponizes that tendency.

## 1. Design pillars

| Pillar | Meaning | Stolen from |
|---|---|---|
| **No dead pairs** | Every A×B has defined behavior; completeness is machine-checked | PG's reaction table |
| **Legible cartoon chemistry** | Contact + probability → visible transformation. No hidden thermometers in v1 | PG (vs. TPT) |
| **Wind is a citizen** | Coarse air field advects particles, carries fire, lofts dust; tools push/pull/drag | PG wind/air/drag |
| **Constraints are content** | 50,000-dot budget with a live counter; curated 24-element roster | PG's 40k dot limit |
| **Cycles over effects** | Water⇄steam, wood→fire→smoke→soot-dust, dust+water→mud→(bake)→stone→(smash)→sand | PG ecosystems |
| **Renderers are media** | Multiple BG/display modes at launch | PG's BG-* modes |
| **Sharing is the moat** | Deterministic sim → tiny URL saves; gallery later | PG uploads, Sandspiel gallery |

## 2. World and systems

### 2.1 The grid

- **400×300 cells** (120,000 — a deliberate homage to PG1's playfield), one particle per cell.
- **Dot budget: 50,000** live particles, with a visible counter. Sources (clone, emitters)
  respect the budget; hitting the cap is normal play, not an error.
- Cell record (packed typed arrays, structure-of-arrays):
  `element:u8`, `meta:u8` (reaction progress / lifespan / imprint), `vx,vy:i8` (impulse),
  `clock:u1` (updated-this-tick parity bit).

### 2.2 Movement layer (state machine, PG-style)

- **Powders** fall, then slide diagonally (randomized left/right to avoid bias). Special
  cases: *stone* falls but never slides (builds cliffs); *dust* is lofted by any airflow
  and settles slowly (`terminal velocity` lowest in the game); *mud* slides reluctantly.
- **Liquids** fall, spread horizontally, and **density-sort**: oil (0.8) floats on water
  (1.0), acid (1.1) sinks in water, brine (1.2) sinks below acid, lava (3.0) sinks below
  everything. Layered-drink demos should just *work*.
- **Gases** rise with jitter and dissipate on a lifespan (steam condenses, smoke fades —
  occasionally leaving a soot-dust speck).
- **Energy** (fire, spark) is short-lived and directional: fire licks upward, spark travels
  along conductors.
- **Statics** (wall, wood, metal, ice, glass, plant, clone, void) don't move; some grow.

Scan bottom-up for falling matter, top-down for rising matter, alternating horizontal
direction each row/frame (Noita's playbook), with per-cell tick parity to prevent
double-moves.

### 2.3 Wind layer (the soul)

- Coarse **50×38 air grid** (8×8 px cells — TPT proved 4× coarse is enough; we go slightly
  coarser for speed, tune later). Each cell: `vx, vy, pressure`.
- Per tick: advect + diffuse + decay toward calm; explosions inject pressure impulses;
  fire injects gentle updraft (convection!); fans (M4) inject directed flow.
- Particles feel drag proportional to a per-element `windage`: dust 1.0, smoke/steam 0.9,
  fire 0.7, powders ~0.3, liquids ~0.15, stone 0.05, statics 0.
- **Tools**: `wind` (directional push), `air+`/`air−` (pressure), `drag` (grab & fling
  particles directly — the PG toy everyone remembers first).

### 2.4 Reaction layer

Contact-based, stochastic, resolved by **five ordered sub-layers** so that every pair has
exactly one authority (full algorithm in [doc 04](04-interaction-matrix.md)):

1. **Sovereigns** — void deletes; clone imprints & copies; wall is inert.
2. **Special pairs** — the curated registry (water+lava→stone+steam, salt+ice→brine, …).
3. **Fire & heat** — `flammable`, `meltable`, `extinguishes` properties.
4. **Electricity** — `conductive`, `ignitedBySpark` properties.
5. **Acid** — `soluble` property (default true — acid eats *almost* everything).

Anything not claimed by layers 1–5 falls through to movement/density — which is itself a
defined interaction. **Therefore the matrix is total.** A CI test iterates all ordered
pairs and fails the build if any pair resolves to "undefined" — adding element #25 without
finishing its row is a *compile error*, not a wiki TODO.

### 2.5 Determinism

Fixed timestep, seeded xorshift PRNG, integer-only sim math. Consequences:

- A save is `(seed, initial state, optional input log)` — tiny, compressible, replayable.
- Golden-frame regression tests: seed a scene, run 600 ticks, hash the grid.
- Share codes are just URLs (RLE + base64 in the fragment). Zero backend for v1 sharing.

## 3. The signature mechanic: The Namesake

Dust (the element) is what the world decays into:

| Source | Path to dust |
|---|---|
| Wood, plant, seed | burn → fire + smoke + **dust** (ash) |
| Plant, seed | wither under brine/salt → **dust** |
| Metal | rust under water/brine (slow/fast) → crumbles to **dust** |
| Smoke | occasionally settles as soot-**dust** |
| Gunpowder | ruined by water/steam → inert **dust** |
| Stone | eroded by water (very slow) → sand; smashed → sand (mineral cousin of dust) |

And dust gives back: dust + water → **mud** → seedbed for plants → plants grow → burn →
dust. The world breathes in circles.

**Dust deflagration**: when airborne dust density in a neighborhood exceeds a threshold and
meets fire/spark/lava, it flash-burns cell-to-cell and slams the air field with a pressure
pulse. Not as sharp as gunpowder — a rolling *whoomph* that lofts more dust and can chain.
Burning a forest quietly fills the sky with soot; the player learns — once — why you don't
strike a spark afterward. Rain (steam → condensation) washes dust from the air into mud.
Weather as firefighting.

## 4. Tools & UI (v1)

- Element palette (24), pen sizes 1/2/4/8/16, line & rect stamps, eraser.
- Wind / air± / drag tools.
- Pause, single-step, speed ×0.5–×8, clear, undo (one level — grid snapshot).
- Dot counter (live, top bar — the homage), FPS ticker.
- **Display modes**: `normal`, `air` (pressure heatmap), `flow` (wind vectors — BG-line's
  heir), `glow` (shade/bloom), `toon`, `gray`, and `reaction` — our own addition: cells
  flash where reactions fire this tick. It's a debugger *and* the discovery aid.

## 5. The Discovery Codex (our meta-game)

The interaction matrix isn't just architecture — it's the collectible:

- An in-game 24×24 codex grid; a cell lights up the first time the player *witnesses* that
  pair react (special pairs) or coexist meaningfully (default pairs are auto-credited the
  first time they touch).
- Completion percentage, per-element progress rings, and gentle hints for famous holes:
  *"What does lightning think of salt water?"*
- Finishing a row awards that element's **field-guide page** ([doc 03](03-elements.md) bios
  become unlockable in-game flavor).

Nobody in the genre has made *the matrix itself* the progression. It converts our
engineering discipline directly into content.

## 6. Objects (post-v1, in payoff order)

1. **Ball** — bouncy circle, typeable as any element (water ball, lava ball…) with matrix
   semantics preserved. Cheap, huge fun (PG lineage).
2. **Box & Joint** — rigid crates; distance joints for ropes, bridges, vehicles (PG2's
   biggest unlock). Marching-squares → convex hulls if we later want true pixel-bodies
   (Noita's trick).
3. **Stickfolk** — Player (arrows/WASD) and the gloriously stupid kicking Fighter. This is
   the moment the sandbox becomes a game-maker (player courses!).
4. **Emitter/sensor** primitives — clone is already an emitter; add a pressure plate and a
   gate and the logic-circuit community has what it needs.

## 7. Sharing (post-v1)

1. **URL saves** (v1, free): deterministic state in the fragment.
2. **Gallery**: uploads render as looping GIF/WebP thumbnails (Sandspiel's insight —
   the share artifact itself is alive). Dan-Ball-style limits: 1 upload/day, votes capped,
   no self-votes, voting window.
3. **Forking**: every gallery entry is loadable and re-shareable — lineage credited.

## 8. What we are deliberately NOT doing (v1)

- ❌ Per-cell temperature scalar (TPT's power, TPT's opacity) — stochastic contact reactions
  instead. Revisit only if the roster demands it.
- ❌ 100+ elements. Twenty-four, curated, complete.
- ❌ Native app. Browser-first, WASM later if profiling says so.
- ❌ Mixed salty-mud / concentration states (cut for v1: brine+sand makes ordinary mud).
- ❌ Custom user elements (Sandspiel Studio territory) — the completeness promise makes this
  hard; maybe never, and that's fine.
