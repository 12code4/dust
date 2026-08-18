# Dust — The Complete Interaction Matrix

This is the meticulous heart of the project: **every one of the 24×24 = 576 cells is
defined**. Most resolve through the default physics layers; ~70 are special pairs from the
registry. The rule for all future development:

> **An element does not exist until its entire row is defined. The build enforces this.**

## 1. Resolution algorithm

When particle A is adjacent to particle B, the first layer that claims the pair resolves it:

```
resolve(A, B):
  1. SOVEREIGNS   — Void deletes any arrival. Clone imprints/emits. Wall is inert.
  2. SPECIAL PAIR — registry lookup (unordered pair) → transformation + rate
  3. FIRE & HEAT  — fire/lava/spark vs. flammable/meltable/extinguishing properties
  4. ELECTRICITY  — spark vs. conductive / spark-ignitable properties
  5. ACID         — acid vs. soluble (default: soluble; immunity is the exception)
  6. MOVEMENT     — density displacement, powder piling, gas rise, pass-through
```

Layer 6 always succeeds, so `resolve` is **total**: there is no pair of elements without a
defined outcome. "·" in the matrix means "resolved by layer 6" — two elements coexisting,
piling, or density-sorting *is* their interaction.

All reactions are stochastic per tick at rates: **instant**, **fast** (~0.5), **slow**
(~0.05), **vslow** (~0.005), **trace** (~0.0005). Cartoon chemistry, PG-style: no
temperature scalar, just contact + probability.

## 2. Cell legend

| Code | Meaning | | Code | Meaning |
|---|---|---|---|---|
| `·` | default physics only (layer 6) | | `melt` | becomes liquid form (ice→water, stone→lava) |
| `ρ` | density interplay worth noticing | | `frz` | water freezes to ice |
| `—` | self (piling/merging) | | `cnd` | steam condenses to water on it |
| `ign` | catches fire | | `diss` | dissolved by acid (→ smoke wisp) |
| `boom` | detonation + pressure impulse | | `imm` | notable immunity (nothing happens, on purpose) |
| `flash` | dust deflagration (see R19) | | `cond` | conducts spark |
| `ext` | fire is extinguished | | `die` | spark dies |
| `ext+St` | extinguished, salt residue | | `rust` / `rust+` | rusts to dust (slow / fast) |
| `→X` | transforms into element X | | `wthr` | withers to dust |
| `grow` | growth (plant/seed) | | `ruin` | gunpowder ruined → dust |
| `spr` | seed sprouts to plant | | `wash` | washed from the air (faster decay) |
| `slip` | won't pile — slides off (ice) | | `ero` | erodes to sand (trace rate) |
| `bake` | mud hardens to stone | | `dry` | mud dries to sand |
| `copy` | clone imprints & emits it | | `del` | void deletes it |
| `neut` | mutual consumption (acid+water) | | | |

## 3. The matrix

Symmetric: cell (row, col) = cell (col, row). Read the cell as "what happens when these two
meet." Details and rates live in the registry (§4).

### Columns 1–12: Wall, Wood, Metal, Ice, Glass, Plant, Sand, Dust, Gunpowder, Salt, Seed, Stone

| | Wl | Wd | Mt | Ic | Gl | Pl | Sa | Du | Gp | St | Se | Sn |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Wl** Wall | — | · | · | · | · | · | · | · | · | · | · | · |
| **Wd** Wood | · | — | · | · | · | · | · | · | · | · | · | · |
| **Mt** Metal | · | · | — | · | · | · | · | · | · | · | · | · |
| **Ic** Ice | · | · | · | — | · | · | slip | slip | slip | →Br | slip | · |
| **Gl** Glass | · | · | · | · | — | · | · | · | · | · | · | · |
| **Pl** Plant | · | · | · | · | · | — | · | · | · | wthr | · | · |
| **Sa** Sand | · | · | · | slip | · | · | — | · | · | · | · | · |
| **Du** Dust | · | · | · | slip | · | · | · | — | · | · | · | · |
| **Gp** Gunpowder | · | · | · | slip | · | · | · | · | — | · | · | · |
| **St** Salt | · | · | · | →Br | · | wthr | · | · | · | — | wthr | · |
| **Se** Seed | · | · | · | slip | · | · | · | · | · | wthr | — | · |
| **Sn** Stone | · | · | · | · | · | · | · | · | · | · | · | — |
| **Md** Mud | · | · | · | · | · | · | · | · | · | · | spr | · |
| **Wt** Water | · | · | rust | frz | · | grow | →Md | →Md | ruin | →Br | spr | ero |
| **Br** Brine | · | · | rust+ | melt | · | wthr | →Md | →Md | ruin | · | wthr | ero |
| **Ol** Oil | · | · | · | · | · | · | ρ | ρ | ρ | ρ | ρ | ρ |
| **Lv** Lava | · | ign | imm | →Wt+Sn | melt | ign | →Gl | flash | boom | · | ign | melt |
| **Ac** Acid | imm | diss | diss | diss | imm | diss | diss | diss | diss | diss | diss | diss |
| **Sm** Steam | · | · | · | cnd | cnd | · | · | · | ruin | · | · | · |
| **Sk** Smoke | · | · | · | · | · | · | · | · | · | · | · | · |
| **Fi** Fire | · | ign | · | melt | · | ign | ext | flash | boom | · | ign | · |
| **Sp** Spark | · | · | cond | · | · | · | · | flash | boom | · | · | · |
| **Cl** Clone | · | copy | copy | copy | copy | copy | copy | copy | copy | copy | copy | copy |
| **Vo** Void | · | del | del | del | del | del | del | del | del | del | del | del |

### Columns 13–24: Mud, Water, Brine, Oil, Lava, Acid, Steam, Smoke, Fire, Spark, Clone, Void

| | Md | Wt | Br | Ol | Lv | Ac | Sm | Sk | Fi | Sp | Cl | Vo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Wl** Wall | · | · | · | · | · | imm | · | · | · | · | · | · |
| **Wd** Wood | · | · | · | · | ign | diss | · | · | ign | · | copy | del |
| **Mt** Metal | · | rust | rust+ | · | imm | diss | · | · | · | cond | copy | del |
| **Ic** Ice | · | frz | melt | · | →Wt+Sn | diss | cnd | · | melt | · | copy | del |
| **Gl** Glass | · | · | · | · | melt | imm | cnd | · | · | · | copy | del |
| **Pl** Plant | · | grow | wthr | · | ign | diss | · | · | ign | · | copy | del |
| **Sa** Sand | · | →Md | →Md | ρ | →Gl | diss | · | · | ext | · | copy | del |
| **Du** Dust | · | →Md | →Md | ρ | flash | diss | · | · | flash | flash | copy | del |
| **Gp** Gunpowder | · | ruin | ruin | ρ | boom | diss | ruin | · | boom | boom | copy | del |
| **St** Salt | · | →Br | · | ρ | · | diss | · | · | · | · | copy | del |
| **Se** Seed | spr | spr | wthr | ρ | ign | diss | · | · | ign | · | copy | del |
| **Sn** Stone | · | ero | ero | ρ | melt | diss | · | · | · | · | copy | del |
| **Md** Mud | — | · | · | ρ | bake | diss | · | · | dry | · | copy | del |
| **Wt** Water | · | — | ρ | ρ | →Sn+Sm | neut | · | wash | ext | die | copy | del |
| **Br** Brine | · | ρ | — | ρ | →Sn+Sm+St | neut | · | · | ext+St | cond | copy | del |
| **Ol** Oil | ρ | ρ | ρ | — | ign | imm | · | · | ign | ign | copy | del |
| **Lv** Lava | bake | →Sn+Sm | →Sn+Sm+St | ign | — | →Sk | · | · | · | · | copy | del |
| **Ac** Acid | diss | neut | neut | imm | →Sk | — | · | · | · | · | copy | del |
| **Sm** Steam | · | · | · | · | · | · | — | · | · | · | copy | del |
| **Sk** Smoke | · | wash | · | · | · | · | · | — | · | · | copy | del |
| **Fi** Fire | dry | ext | ext+St | ign | · | · | · | · | — | · | copy | del |
| **Sp** Spark | · | die | cond | ign | · | · | · | · | · | — | copy | del |
| **Cl** Clone | copy | copy | copy | copy | copy | copy | copy | copy | copy | copy | — | del |
| **Vo** Void | del | del | del | del | del | del | del | del | del | del | del | — |

## 4. Reaction registry

Transformations happen at the contact interface; "A+B → X+Y" means the A-side becomes X and
the B-side becomes Y where it makes sense (noted otherwise).

**Water, heat, and stone**
- **R1** Water + Lava → Stone + Steam *(instant at interface — the terrain printer)*
- **R2** Brine + Lava → Stone + Steam + Salt speck *(instant; evaporation leaves the salt)*
- **R3** Ice + Lava → Water + Stone *(instant; both sides pay)*
- **R4** Water + Fire → fire dies; some adjacent water → Steam *(instant)*
- **R5** Brine + Fire → fire dies; brine → Steam + Salt residue *(fast)*
- **R6** Sand + Fire → fire smothered; sand unchanged *(instant — cheap firefighting)*
- **R7** Ice + Water → water freezes → Ice *(slow — glaciers creep)*
- **R8** Salt + Ice → Ice → Brine *(slow — road salt)*
- **R9** Brine + Ice → Ice → Water *(slow — brine won't freeze)*
- **R10** Salt + Water → both → Brine *(fast)*

**Earth and life**
- **R11** Sand/Dust + Water/Brine → Mud *(slow contact soak)*
- **R12** Seed on Mud (or seed touching sand+water) → sprouts Plant *(slow)*
- **R13** Plant + Water → grows into adjacent empty cells, occasionally consuming the water *(slow)*
- **R14** Salt/Brine + Plant/Seed → withers → Dust *(slow — salting the earth)*
- **R15** Metal + Water → Dust (rust) *(vslow)*; Metal + Brine → *(slow)* — salt corrodes
- **R16** Gunpowder + Water/Brine/Steam → ruined → Dust *(fast — sprinklers defeat bombs)*

**Fire and boom**
- **R17** Ignition (fire/lava vs. flammables): Wood *(slow catch)*, Plant *(fast)*,
  Seed *(fast, pops)*, Oil *(fast)* — burning organics leave **Dust** (ash) + Smoke
- **R18** Gunpowder detonation (fire/spark/lava/another boom): cluster → Fire + Smoke +
  sharp pressure impulse into the wind field *(instant, chains)*
- **R19** **Dust deflagration**: airborne dust density ≥ 3 in any 3×3 neighborhood + any
  ignition source → cell-to-cell flash fire + rolling pressure pulse that lofts more dust
  *(instant, chains)*. Settled dust merely smolders like slow wood.
- **R20** Sand + Lava → Glass *(fast — vitrification)*
- **R21** Mud + Lava → Stone (baked — pottery!) *(fast)*; Mud + Fire → Sand (dried) *(slow)*
- **R22** Stone + Lava → Lava *(slow — mountains surrender eventually)*

**Breakage and erosion**
- **R23** Stone moved at high speed → Sand (smash); Glass hit by pressure spike → Sand (shatter)
- **R24** Stone + Water/Brine → Sand *(trace — erosion, the long game)*

**Chemistry**
- **R25** Acid dissolves any soluble neighbor → smoke wisp; the acid is consumed with ~30%
  chance per dissolve *(fast)*. Immune: Wall, Glass, Oil, Clone, Void. Acid + Water/Brine →
  mutual slow consumption (dilution). Acid + Lava → acid boils → Smoke.
- **R26** Spark travels along Metal and through Brine; dies in fresh Water; ignites
  Gunpowder (R18), airborne Dust (R19), and Oil (R17) *(instant)*

**Sky**
- **R27** Steam: lifespan ends → Water (rain); touching Ice/Glass → condenses immediately *(fast)*
- **R28** Smoke: fades; ~2% settle as **Dust** (soot). Adjacent Water washes smoke (double decay)
- **R31** Fire injects updraft into the wind field (convection); wind can carry a burning
  cell one step (embers) *(chance per tick)*

**Sovereigns**
- **R29** Clone: imprints the first non-Wall/Clone/Void element to touch it, then emits it
  while the dot budget allows. Immune to acid and lava.
- **R30** Void: deletes any particle that arrives. No residue. No exceptions.
- **R32** Ice is slippery: powders (not stone) refuse to pile on it and slide off.

## 5. Enforced completeness

The matrix above is the *spec*. In code it becomes data (`elements.toml` + `reactions.toml`),
and CI runs, at minimum:

```
for A in ELEMENTS:
  for B in ELEMENTS:
    outcome = resolve(A, B)        # must never throw / return UNDEFINED
    assert outcome is not None
assert matrix_is_symmetric()       # pair (A,B) and (B,A) resolve identically
assert every_special_pair_has_a_registry_entry_and_a_unit_test()
```

Plus golden-frame determinism tests (seeded scene → N ticks → grid hash) and per-registry
unit tests (place water next to lava, step, assert stone+steam).

**Adding element #25 therefore costs**: one property row, any special pairs, unit tests for
those pairs — and the build stays red until all 24 existing elements have a defined answer
to the newcomer. The discipline Powder Game's community kept in a wiki, we keep in CI.

## 6. Notable deliberate choices (the "imm" cells)

- **Metal vs. Lava — nothing.** Metal survives lava so machine-builders can pipe it. Its
  weakness is chemistry (water, brine, acid), not heat. A trade of realism for buildability.
- **Glass vs. Acid — nothing.** Acid's honest container, homage to PG's acid immunities
  (clone, glass, fan). Lava, however, un-makes what it made: glass softens slowly back
  into the melt (changed from the original "lava-proof" spec during M1a playtesting).
- **Oil vs. Acid — nothing, and it floats.** Oil is the lid for your acid vat.
- **Wall vs. everything — nothing.** The referee never plays.
- **Salt vs. Lava — nothing.** (Molten salt is real, but one liquid per pun is our limit.)
