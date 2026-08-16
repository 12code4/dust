# Study: Powder Game 1 & 2 (Dan-Ball), and the genre around them

This is the research half of the project: what these games are, how they work, and what
lessons we take. Facts below are drawn from the Dan-Ball community wiki, reviews, and
technical write-ups of related engines (sources at the bottom), plus general knowledge of
the games. Where counts differ between sources we say so.

---

## 1. Powder Game (2007) — "dust"

Powder Game (internal name **dust** — hence this repo's name) is ha55ii's particle sandbox,
originally a Java applet, later JavaScript. It is *the* canonical browser falling-sand game.

### The playfield

- A pixel grid (~120,000 cells; Powder Game 2 later measured 280×496 = 138,880).
- A hard **40,000 dot limit**: at most 40k particles alive at once, with a live counter.
  This began as a performance guardrail and became a creative constraint — the community
  learned to budget dots the way demoscene coders budget bytes.
- Zoom scale ×1–×16, adjustable simulation speed, grid overlay, copy/paste.

### The element roster (~36 by final versions; wiki counts 34 "natural" as of ver 9.5)

Roughly grouped:

- **Powders**: powder, sand-like variants, gunpowder, salt, snow, seed, stone (falls as a
  rigid clump; smashes to powder at high speed/drag)
- **Liquids**: water, seawater, oil, magma, nitro (touch-sensitive liquid explosive), mercury
- **Solids**: wood, metal, ice, glass, block/wall, fuse
- **Gases**: gas (flammable), steam, cloud
- **Energy/emitters**: fire, torch (permanent flame), thunder (lightning), spark (travels
  along metal), laser
- **Living**: ant (tunnels), bird (flocks), fish (PG2)
- **Specials**: clone (imprints the first element that touches it, then emits it forever),
  acid (dissolves nearly everything), virus (spreads through matter, then resolves),
  soapy (makes bubbles), superball (very bouncy), fireworks, C-4, bomb, fan (blows wind),
  pump, vine

### Reactions: cartoon chemistry, exhaustively defined

The community maintains a full **reaction table** — every element × every element — because
the game itself behaves that way. Signature chains, confirmed via the wiki's reaction pages:

- water + magma → **stone + steam** (the classic terrain generator)
- seawater + magma → **salt + stone + steam** (evaporation leaves the salt behind!)
- salt + water → seawater; seawater is denser and behaves differently from water
- water + wood → **seed**; seed + wood/powder/vine → grows **wood** (trees!)
- seawater kills plant matter (turns wood/vine/seed to powder) — salting the earth works
- ice spreads freezing into adjacent water; wind turns ice to snow
- **acid dissolves everything except clone, glass, and fan**
- **virus converts what it touches** (infection sweeps across a build, then resolves)
- spark travels along metal; thunder strikes; laser beams cut and ignite
- stone smashes into powder when moved violently with drag

Two things to notice, because they are the deep design insight of Powder Game:

1. **There are no dead pairs.** Acid, virus, fire, and wind are defined against *everything*.
   The player never finds an inert combination that feels like missing content.
2. **Reactions are legible, instant, and visible.** No hidden temperature scalar (unlike The
   Powder Toy). Contact + probability = transformation. A child can predict it; an adult can
   still be surprised by chains (magma + seawater → salt crust → salt melts the ice below…).

### Wind: the invisible protagonist

Powder Game's real signature is not any element — it's the **air simulation**. A coarse
velocity/pressure field covers the playfield:

- **Wind tool** pushes air directionally; **air tool** raises/lowers pressure at a point.
- **Drag tool** grabs elements and objects and flings them.
- Explosions shove the air field; the air field advects powders, gases, fire, and stickmen.
- The **fan** element emits wind continuously → player-built machines: elevators, sorters,
  perpetual fountains, wave pools.

Most Powder Game clones skip the wind field. That's precisely why clones feel dead and
Powder Game feels alive: wind couples *every* element to every other element *at a distance*.

### Objects: the sandbox becomes a game engine

- **Ball** — bouncy circles that can be typed as elements (water ball, seawater ball…)
  with their own reaction rules.
- **Box** — rigid containers.
- **Player** — a controllable stickman (arrow keys; a second player on WASD). Square head
  vs. circle head.
- **Fighter** — an armless stickman with no real AI that runs, jumps, and *kicks* anything
  movable, chaotically.

Stickmen transformed the toy into a game-maker: the community invented **player courses**
(platforming levels), fighter arenas, pinball, and physics puzzles — inside a particle toy.

### Display modes as a creative medium

BG modes recolor/re-render the simulation: **BG-line** (shows air flow), **BG-blur**,
**BG-shade** (glow), **BG-aura** (visualizes wind), **BG-light** (motion tracing),
**BG-toon**, **BG-mesh** (wind grid), **BG-gray**. The community used these as *art media* —
"stop-art" and pixel-art genres exist because renderers are content, not settings.

### The community loop

Upload to the Dan-Ball server (rate-limited: one upload per user per day, 50 per 12h
globally), vote (one vote per work, no self-votes, voting closes after three months),
browse by code number. Whole genres emerged: checker-style pixel art, logic circuits built
from spark+metal, cannon tech, "sendai-style" art, courses. The game stayed culturally alive
for 15+ years because *sharing was built in*.

---

## 2. Powder Game 2 (2011) — the rewrite

ha55ii rewrote the engine rather than extend PG1. Per the wiki's comparison page:

- **Focus: fluid dynamics.** Liquids flow far more convincingly; the screen is wider
  (280×496 = 138,880 px), same 40,000 dot limit.
- **New elements**: **sand** (distinct from powder), **mud** (sand + water — and mud dries
  back to sand under fire/lava/spark heat), **fish**, **bubble** (from soapy), **crystal**,
  **conveyer**, **jointbomb**. Late-version roster: ~44–48 elements depending on how you
  count (the wiki lists: powder, water, fire, seed, wood, gunpowder, fan, ice, snow,
  superball, clone, fireworks, oil, C-4, sand, mud, stone, lava, steam, virus, nitro, ant,
  torch, gas, soapy, thunder, metal, bomb, laser, acid, vine, salt, seawater, glass, bird,
  fish, mercury, spark, fuse, cloud, pump, crystal, jointbomb, conveyer, readvar).
- **Magma renamed lava** (near-identical behavior); stone now smashes into **sand** rather
  than powder.
- **Joint** — up to 999 rigid links: ropes, chains, bridges, vehicles. This replaced PG1's
  box/bubble tools and unlocked *machines* as a genre.
- **Cyclone** — a vortex object; more wind-field toys.
- Some regressions accepted in trade: fan direction locked to 45° steps.
- Players/fighters/boxes pass through **loop** edges on all sides (PG1: only left/right).

**The meta-lesson from the sequel**: engine architecture determines which elements are even
possible — ha55ii had to rewrite to get real fluids and joints. And notably, PG2 did *not*
kill PG1; the original's tighter feel kept its own audience. Sequels split communities;
architecture should be planned so the *first* engine can grow.

---

## 3. Genre cousins: what the neighbors learned

### The Powder Toy (2008–, C++/SDL, open source)

The maximalist branch: per-particle **temperature**, **air pressure and velocity** (computed
on a coarse 4×4 grid, like PG's wind), optional **Newtonian gravity**, 180–250+ elements,
electronics, even nuclear physics. Lessons:

- **Property-driven simulation generalizes.** Temperature/pressure per particle means new
  elements inherit sensible behavior for free — you don't hand-write every pair.
- **But curation matters.** 250 elements overwhelm newcomers; TPT is beloved by experts and
  opaque to children. Powder Game's ~40 curated elements is the better *toy*.
- Coarse-grid air (4×4 cells) is a proven, cheap trick we should copy.

### Noita / "Falling Everything" engine (Nolla Games, GDC 2019)

The falling-sand engine that shipped a full roguelite. Petri Purho's talk gives us the
performance playbook:

- **Update bottom-up** so falling rows resolve consistently (and alternate horizontal scan
  direction to avoid left/right bias).
- **64×64 chunks, each with a dirty rect** — only simulate where something moved. This is
  how a huge world sleeps cheaply.
- **Rigid bodies via marching squares** over pixel groups — pixels and physics bodies in one
  world (their trick for Box2D integration).
- Emergence needs tuning: "surprising but fair" is a design target, not an accident.

### Sandspiel (Max Bittker, 2018, Rust→WASM + WebGL)

The modern web proof: a falling-sand game in the browser at 60fps, sim in Rust compiled to
WebAssembly, rendering in WebGL, fluid-ish wind pass on the GPU. Lessons:

- **Browser-first is viable and is the right distribution** — Powder Game's reach came from
  being one click away. Zero install, instant share.
- Uploads render as **animated GIFs in a public gallery** — the share artifact itself is
  delightful and scrolls well.
- His stated goal echoes Dan-Ball: an environment that "supports sharing and forking of fun
  creations," later including a programmable custom-element API (Sandspiel Studio).

---

## 4. The lessons we are actually taking

1. **No dead pairs.** The reaction table is the game. Completeness must be enforced by
   architecture (data + tests), not by discipline.
2. **Wind day one.** The air field is the soul of Powder Game; clones die without it.
3. **Legibility over realism.** Contact reactions with visible results beat hidden scalars.
   (We steal TPT's *generality* via properties, but keep PG's *presentation*.)
4. **Constraints are content.** Dot limit with a visible counter; small curated roster;
   modest canvas. Budgeting is play.
5. **Byproducts make ecosystems.** water→steam→rain, wood→fire→smoke→soot. Cycles, not
   one-shot effects, keep a sandbox alive after the player stops drawing.
6. **Renderers are media.** Ship BG modes early; the art community shows up when the toy
   is beautiful.
7. **Objects turn a toy into a game-maker.** Balls → stickmen → joints, in that order of
   effort/payoff. (PG2's joint was the single biggest creative unlock of the sequel.)
8. **Sharing is the moat.** URL-encoded saves first (zero backend), gallery with animated
   thumbnails second, votes third — with Dan-Ball-style rate limits from day one.
9. **Plan the engine for where you're going.** PG needed a rewrite for fluids and joints.
   Noita's chunk/dirty-rect scheme and TPT's coarse air grid are the proven bones; adopt
   them in v1 so we never need our own "Powder Game 2 rewrite."
10. **Have a namesake.** PG's identity is wind + dots. Ours is **dust** — see the design doc.

---

## Sources

- Dan-Ball official: [Powder Game](https://dan-ball.jp/en/javagame/dust/) ·
  [Powder Game 2](https://dan-ball.jp/en/javagame/dust2/)
- Dan-Ball Wiki (Fandom): [Powder Game](https://danball.fandom.com/wiki/Powder_Game) ·
  [Powder Game 2](https://danball.fandom.com/wiki/Powder_Game_2) ·
  [Reaction Table](https://danball.fandom.com/wiki/Powder_Game_Reaction_Table) ·
  [Comparison of PG and PG2](https://danball.fandom.com/wiki/Comparison_of_Powder_Game_and_Powder_Game_2) ·
  [Element](https://danball.fandom.com/wiki/Element) ·
  [Fighter](https://danball.fandom.com/wiki/Fighter) ·
  [Player](https://danball.fandom.com/wiki/Player_(Powder_Game)) ·
  [Natural element](https://danball.fandom.com/wiki/Natural_element)
- [Jay Is Games: Powder Game review](https://jayisgames.com/review/powder-game.php)
- Noita: [GDC 2019 — Exploring the Tech and Design of Noita](https://www.gdcvault.com/play/1025695/Exploring-the-Tech-and-Design) ·
  [80.lv article](https://80.lv/articles/noita-a-game-based-on-falling-sand-simulation) ·
  [talk notes](https://braindump.jethro.dev/posts/gdc_vault_exploring_the_tech_and_design_of_noita/)
- The Powder Toy: [powdertoy.co.uk](https://powdertoy.co.uk) ·
  [GitHub](https://github.com/The-Powder-Toy/The-Powder-Toy)
- Sandspiel: [Making Sandspiel — Max Bittker](https://maxbittker.com/making-sandspiel/) ·
  [GitHub](https://github.com/MaxBittker/sandspiel)
- [Wikipedia: Falling-sand game](https://en.wikipedia.org/wiki/Falling-sand_game)
