# Dust

*Everything returns to dust.*

**Dust** is our own falling-sand physics sandbox, built on lessons studied from
[Powder Game and Powder Game 2](https://dan-ball.jp/en/) by ha55ii / Dan-Ball, and from the
wider genre they inspired (The Powder Toy, Sandspiel, Noita).

The founding rule of this project — the one rule we never break:

> **Every element interacts with every other element. No dead pairs. Ever.**

When two kinds of matter touch in Dust, *something* defined happens — even if that something
is "they politely ignore each other because the physics layers already resolved it."
The interaction matrix is complete by construction, checked by machine, and — this is the fun
part — rediscoverable by the player as an in-game codex.

## Status

🏗️ **The Namesake shipped (M2 complete)** — nine elements now: wall, sand, **dust**,
water, **mud**, fire, **smoke**, steam. Dust is the star: it rides every draft, settles
into caked drifts, wets into mud, and when it hangs thick near flame it **deflagrates** —
a rolling flash that slams the pressure field and lofts more dust into the burn (settled
dust only smolders; suspension time is tracked per grain). Fire exhales smoke; a little
smoke always settles back as soot-dust — *everything returns to dust*. The 🖐 **drag
tool** grabs matter and throws it with real ballistic velocity: collision-checked flight,
friction, gravity arcs. Deterministic fixed-timestep sim, 50,000-dot budget, 60 fps at
~3.1 ms/tick average with the full budget in chaos (target ≤ 8 ms). The air field
landed early: a 4×4-px-cell velocity grid that fire feeds with convection, everything
rides by windage, the 💨 wind tool blows (strength and reach scale with the pen, PG-style),
and the 🌀 flow filter reveals (velocity vectors + red/blue pressure tint). The air is now
a coupled velocity+pressure sim, PG/TPT-style: divergence builds pressure, gradients
accelerate air, so jets grow wakes, blasts make waves, and low-pressure zones genuinely
suck matter in. Fire drops local pressure (chimney draft). The wind tool is a leaf
blower: wind streams from the pointer along your stroke direction the whole time the
button is held (a short red line shows the aim); right-click is a vacuum. Every element
brush also keeps emitting while held, PG-pen style, and pen sizes run 0–9 like PG's. Wind lingers, travels, and meets walls like real wind —
blocked, then fanning out along the face from the stagnation point. Falling water and sand
shimmy like Powder Game's instead of dropping in rigid columns, and water queues behind its
own flow instead of ping-ponging, so slopes and spouts drain fluidly. Next up: the Namesake
update (dust + deflagration + drag), then M1's data-driven chemistry engine (docs/05).

**Just want to play?** Grab [`dust.html`](dust.html) — the whole game in one
self-contained file. Save it anywhere and double-click; no server, no install.
(It's the committed output of `npm run standalone`, regenerated on release.)

```bash
npm install
npm run dev         # play it (Vite dev server)
npm test            # sim behavior + determinism/golden-frame suite
npm run bench       # 50k-dot perf bench vs the 8 ms budget
npm run smoke       # headless browser run + screenshot via Playwright
npm run standalone  # rebuild the single-file dust.html
```

Draw with the left mouse button, erase with the right. `⏸/⏭` pause and single-step.

## The documents

| Doc | What's inside |
|---|---|
| [docs/01-study-powder-game.md](docs/01-study-powder-game.md) | The research: how Powder Game 1 & 2 actually work, what changed between them, and the genre lessons from Noita, The Powder Toy, and Sandspiel |
| [docs/02-design.md](docs/02-design.md) | Our design: pillars, systems (grid, wind, reactions), tools, rendering modes, the Discovery Codex, and the signature Dust mechanic |
| [docs/03-elements.md](docs/03-elements.md) | The v1 roster: 24 elements, their property table, and a short field-guide bio for each |
| [docs/04-interaction-matrix.md](docs/04-interaction-matrix.md) | The meticulous part: the complete 24×24 interaction matrix, the layered resolution algorithm, and the reaction registry |
| [docs/05-roadmap.md](docs/05-roadmap.md) | Engine architecture choice and milestones M0 → M5 |

## The pitch in one paragraph

A browser-native falling-sand toy where wind is a first-class citizen, reactions are
cartoon-legible rather than thermodynamically pious, and the game's namesake — dust — is the
universal residue of the world: wood burns to it, plants wither to it, metal rusts to it,
smoke settles as it. Let it hang in the air, add one spark, and learn why grain silos explode.
A completion codex turns the interaction matrix itself into the collectible.
