import {
  WALL,
  SAND,
  WATER,
  FIRE,
  STEAM,
  DUST,
  SMOKE,
  MUD,
  LAVA,
  STONE,
  GLASS,
  WOOD,
  SEED,
  VINE,
  ICE,
  ELEMENT_COUNT,
  ELEMENT_NAMES,
} from './elements.ts'

/**
 * The single source of truth the completeness gate checks (docs/04 §5).
 * Every implemented element must have a property row here, and every special
 * pair must appear in INTERACTIONS with a behavior probe in
 * test/matrix.test.ts. Movement/density defaults cover everything else —
 * that's layer 6 of the resolution algorithm, and it is total by design.
 */

export type ElementState = 'static' | 'powder' | 'liquid' | 'gas' | 'energy'

export interface ElementProps {
  state: ElementState
  /** Relative density; drives sink/float. Gases negative by convention. */
  density: number
}

export const ELEMENT_PROPS: Readonly<Record<number, ElementProps>> = {
  [WALL]: { state: 'static', density: Infinity },
  [SAND]: { state: 'powder', density: 2.0 },
  [WATER]: { state: 'liquid', density: 1.0 },
  [FIRE]: { state: 'energy', density: -0.7 },
  [STEAM]: { state: 'gas', density: -0.5 },
  [DUST]: { state: 'powder', density: 0.4 },
  [SMOKE]: { state: 'gas', density: -0.3 },
  [MUD]: { state: 'powder', density: 2.2 },
  [LAVA]: { state: 'liquid', density: 3.0 },
  [STONE]: { state: 'powder', density: 2.6 },
  [GLASS]: { state: 'static', density: 2.5 },
  [WOOD]: { state: 'static', density: 1.5 },
  [SEED]: { state: 'powder', density: 1.1 },
  [VINE]: { state: 'static', density: 1.2 },
  [ICE]: { state: 'static', density: 0.92 },
}

/**
 * Every special (non-default) pair among implemented elements, in docs/04's
 * terms. Unordered: {a, b} === {b, a}. The matrix test asserts each entry has
 * a live behavior probe — a reaction listed here but not observable in sim
 * fails the build.
 */
export interface Interaction {
  a: number
  b: number
  effect: string
}

export const INTERACTIONS: readonly Interaction[] = [
  { a: WATER, b: FIRE, effect: 'kills the flame; a little of the water boils to steam' },
  { a: WATER, b: SAND, effect: 'wets → mud' },
  { a: WATER, b: DUST, effect: 'wets/soaks → mud' },
  { a: WATER, b: LAVA, effect: 'stone + steam (the terrain printer)' },
  { a: WATER, b: STONE, effect: 'erosion → sand (trace)' },
  { a: FIRE, b: DUST, effect: 'suspended: deflagration; settled: fast burn' },
  { a: FIRE, b: MUD, effect: 'dries → sand' },
  { a: LAVA, b: SAND, effect: 'vitrifies → glass' },
  { a: LAVA, b: MUD, effect: 'bakes → stone' },
  { a: LAVA, b: DUST, effect: 'ignites (as fire does)' },
  { a: LAVA, b: STONE, effect: 'melts → lava (slow); stone sinks in' },
  { a: LAVA, b: GLASS, effect: 'softens back into the melt (slow)' },
  { a: SAND, b: FIRE, effect: 'smothers the flame' },
  { a: STEAM, b: GLASS, effect: 'condenses → water on the pane' },
  { a: WOOD, b: FIRE, effect: 'catches slowly, burns in place, crumbles to ash-dust' },
  { a: WOOD, b: LAVA, effect: 'ignites (as fire does)' },
  { a: WOOD, b: WATER, effect: 'douses a burning log' },
  { a: SEED, b: MUD, effect: 'sprouts → a sapling that grows a wood trunk' },
  { a: SEED, b: WATER, effect: 'sprouts on wet sand; drifts down through ponds' },
  { a: SEED, b: FIRE, effect: 'pops into flame' },
  { a: SEED, b: LAVA, effect: 'pops into flame' },
  { a: VINE, b: WATER, effect: 'grows around it in branching shoots, sipping the source' },
  { a: VINE, b: FIRE, effect: 'burns eagerly' },
  { a: VINE, b: LAVA, effect: 'burns eagerly' },
  { a: ICE, b: WATER, effect: 'freezes it — the glacier creeps' },
  { a: ICE, b: FIRE, effect: 'melts → water' },
  { a: ICE, b: LAVA, effect: 'both pay: ice → water, lava → stone (R3)' },
  { a: ICE, b: STEAM, effect: 'condenses → water on the cold face' },
  { a: ICE, b: SAND, effect: 'frictionless: grains skate off (R32)' },
]

/**
 * Single-element transitions (no partner needed) — also probed.
 */
export const UNARY: readonly { el: number; effect: string }[] = [
  { el: FIRE, effect: 'emits smoke; dies to smoke or nothing' },
  { el: SMOKE, effect: 'fades; ~2% settles as soot-dust' },
  { el: STEAM, effect: 'condenses to water at end of life' },
  { el: LAVA, effect: 'crusts to stone at a trace rate' },
  { el: STONE, effect: 'smashes to sand on hard ballistic landing' },
]

/** Elements the UI can place; the matrix test checks props exist for all. */
export const IMPLEMENTED: readonly number[] = Array.from(
  { length: ELEMENT_COUNT - 1 },
  (_, k) => k + 1,
)

export function elementName(el: number): string {
  return ELEMENT_NAMES[el] ?? `#${el}`
}
