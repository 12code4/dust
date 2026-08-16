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

🏗️ **M0 shipped** — the falling-sand core is real: sand, water, wall, fire (+steam),
deterministic fixed-timestep sim, 50,000-dot budget, 60 fps with ~3 ms/tick at full budget
(target ≤ 8 ms). Next up: M1, the data-driven chemistry engine (docs/05).

```bash
npm install
npm run dev     # play it (Vite dev server)
npm test        # sim behavior + determinism/golden-frame suite
npm run bench   # 50k-dot perf bench vs the 8 ms budget
npm run smoke   # headless browser run + screenshot via Playwright
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
