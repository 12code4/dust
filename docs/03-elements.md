# Dust — The v1 Element Roster

Twenty-four elements. Every one earns its slot by interacting richly with the others —
an element that only does one thing didn't make the cut. Codes are used in the
[interaction matrix](04-interaction-matrix.md).

## Roster at a glance

| # | Code | Element | State | Density | Windage | Notes |
|---|---|---|---|---|---|---|
| 1 | `Wl` | Wall | static | — | 0 | indestructible boundary |
| 2 | `Wd` | Wood | static | — | 0 | flammable structure |
| 3 | `Mt` | Metal | static | — | 0 | conductor; rusts |
| 4 | `Ic` | Ice | static | — | 0 | spreads freezing; frictionless top |
| 5 | `Gl` | Glass | static | — | 0 | transparent; acid/lava-proof; brittle |
| 6 | `Pl` | Plant | static | — | 0 | grows with water |
| 7 | `Sa` | Sand | powder | 2.0 | 0.3 | vitrifies to glass |
| 8 | `Du` | **Dust** | powder | 0.4 | 1.0 | the namesake; floats, lofts, deflagrates |
| 9 | `Gp` | Gunpowder | powder | 1.8 | 0.3 | sharp explosion; ruined by moisture |
| 10 | `St` | Salt | powder | 1.9 | 0.3 | dissolves; melts ice |
| 11 | `Se` | Seed | powder | 1.1 | 0.4 | sprouts in mud/wet sand |
| 12 | `Sn` | Stone | powder* | 2.6 | 0.05 | *falls straight, never slides; smashable |
| 13 | `Md` | Mud | powder | 2.2 | 0.1 | sticky; seedbed; bakes to stone |
| 14 | `Wt` | Water | liquid | 1.0 | 0.15 | the universal solvent-ish |
| 15 | `Br` | Brine | liquid | 1.2 | 0.15 | conductive; kills plants; leaves salt |
| 16 | `Ol` | Oil | liquid | 0.8 | 0.15 | floats; burns long; acid-proof |
| 17 | `Lv` | Lava | liquid | 3.0 | 0.05 | melts/ignites; cools to stone |
| 18 | `Ac` | Acid | liquid | 1.1 | 0.15 | dissolves nearly everything |
| 19 | `Sm` | Steam | gas | −0.5 | 0.9 | condenses on cold; becomes rain |
| 20 | `Sk` | Smoke | gas | −0.3 | 0.9 | fades; settles as soot-dust |
| 21 | `Fi` | Fire | energy | −0.7 | 0.7 | rises, spreads, dies without fuel |
| 22 | `Sp` | Spark | energy | 0 | 0 | travels conductors; ignites |
| 23 | `Cl` | Clone | static | — | 0 | imprints first touch, emits forever |
| 24 | `Vo` | Void | static | — | 0 | deletes all comers |

Properties driving the default layers (full semantics in doc 04):

| Property | Elements with it |
|---|---|
| `flammable` | Wd, Pl, Se, Du, Gp(→boom), Ol, (Sk? no — inert) |
| `meltable` (by fire/lava) | Ic→Wt; Sn→Lv (lava only, slow) |
| `extinguishes fire` | Wt, Br, Sa (smothers), Md |
| `conductive` (spark) | Mt, Br |
| `spark-ignitable` | Gp, Du(airborne), Ol |
| `acid-immune` | Gl, Wl, Ol, Cl, Vo (everything else is soluble) |
| `freezable` (by ice) | Wt→Ic |
| `grows` | Pl (with Wt), Se (on Md) |

## Field guide (the fun part)

**Wall** — The referee. Interacts with everything by refusing to interact, which — note —
is still a defined interaction. Draw arenas, pipes, silos.

**Wood** — Honest lumber. Holds up anything, burns beautifully, and leaves ash-dust as a
reminder of hubris. Insulates spark (build switch housings from it).

**Metal** — The conductor. Spark races along it; build wires, gates, lightning rods. Proof
against lava (a deliberate gift to machine-builders) but not against chemistry: water rusts
it slowly, brine devours it, and rusted metal crumbles to dust.

**Ice** — Patient and expansionist: freezes adjacent water, so a seed crystal grows a
glacier. Slippery — powders skitter off its surface instead of piling. Salt is its nemesis.

**Glass** — Born from sand in lava's embrace. Transparent (light modes love it), immune to
acid and lava — the only honest container for both — but a sharp pressure spike shatters it
back to sand. Steam fogs it with condensation droplets, because of course it does.

**Plant** — Give it water and it creeps, climbs, and carpets. Brine salts it back to dust;
fire is faster. The renewable half of your fuel economy.

**Sand** — The workhorse powder. Wet it into mud, melt it into glass, drop it on a fire to
smother it (cheaper than water, no steam cloud). Erosion's final answer.

**Dust** — *The namesake.* Feather-light, rides every draft, settles into soft grey drifts
over your whole world. Wet it to mud and grow things. But let it hang thick in the air near
a flame and it goes *whoomph* — a rolling deflagration that shoves the wind field and lofts
more dust. Every fire you set is quietly loading the next one.

**Gunpowder** — Dust's disciplined military cousin: sharp, instant, directional. Water or
steam ruins it into inert grey dust — smart defenders plumb their fortress with sprinklers.

**Salt** — Dissolves into water to make brine; melts ice on contact (winter road crews know);
salts the earth so nothing grows. A tiny white powder that changes three other elements'
lives.

**Seed** — Falls, waits, and sprouts where the ground is wet (mud, wet sand). Burns like a
firework pop if you're careless. Brine kills it to dust before it dreams.

**Stone** — Falls straight down and *stacks* — build instant cliffs and columns. Smashes to
sand when thrown hard (drag-fling it), melts back to lava in lava, and erodes to sand under
running water over geological (in-game: minutes) time.

**Mud** — Sand that drank. Sticky, slow, reluctant to slide. Seeds sprout in it; fire dries
it back to sand; lava *bakes it to stone* — pottery is in the game because pottery is
delightful.

**Water** — The busiest row in the matrix: quenches fire into steam, freezes on ice,
dissolves salt, wets sand and dust to mud, sprouts seeds, rusts metal, ruins gunpowder,
kills spark, turns lava to stone. If an element hasn't met water, it hasn't lived.

**Brine** — Water with opinions. Denser (it layers *under* fresh water — pour slowly and
see), conducts spark across gaps water won't, murders plants, rusts metal fast, and when it
boils off it leaves a crust of salt behind. Evaporation ponds work.

**Oil** — Floats on everything aqueous, burns long and smoky, laughs at acid (and floats on
it — the only safe lid for an acid vat). The fuel of choice for machines and mistakes.

**Lava** — The great transformer: sand→glass, mud→stone, ice→water+stone, metal→(nothing,
it politely declines), everything organic→fire. Meets water and both flinch: stone + steam.
Cools to stone on its own eventually. Terrain printer.

**Acid** — Dissolves *everything* except glass, wall, oil, clone, and void — an homage to
Powder Game's acid (immune: clone, glass, fan). Water dilutes it at mutual cost. Lava boils
it into smoke. Store it in glass, lid it with oil, and never let it near your save.

**Steam** — Water's gap year. Rises, drifts with the wind, condenses on ice and glass into
droplets, and eventually falls back as rain. Rain settles airborne dust and wets the world:
weather is the fire brigade.

**Smoke** — The receipt for combustion. Rises, disperses, stains the air modes beautifully —
and a fraction of it settles back down as soot-dust. Burn enough forest and the sky itself
becomes ammunition.

**Fire** — Hungry, short-lived, buoyant. Spreads to anything flammable, sends convection
into the wind field (watch your smoke curl), and dies alone. Sand smothers it; water
converts it to steam; wind carries its embers to places you didn't intend.

**Spark** — Electricity, one tick at a time. Sprints along metal and brine, dies in fresh
water (impurity lesson included free), and sets off gunpowder, oil, and hanging dust. With
metal + clone + spark you can build clocks, gates, and regret.

**Clone** — The first element to touch it becomes its life's work: it emits that element
forever (budget permitting). Acid- and lava-proof, because Powder Game taught us the
alternative is sadness. The community's factory block.

**Void** — The exit. Deletes everything that touches it, no exceptions, no residue. Drains,
garbage chutes, and the bottom of every good waterfall illusion.

## Cut from v1 (with reasons, so future-us remembers)

- **Virus** (PG's chaos agent) — wants the matrix to be stable first; great v2 candidate.
- **Living creatures** (ant/bird/fish) — pathfinding is its own project; v2.
- **Mercury, nitro, C-4, fuse, laser, thunder, gas** — all beloved; deferred so v1's 24×24
  matrix ships *complete* rather than 40×40 shipping half-done. The completeness bar is the
  whole point. Each addition costs a full row: 24 new defined pairs, matrix test enforced.
- **Fan as element** — wind sources arrive with objects (M4); the wind *tools* cover v1.
