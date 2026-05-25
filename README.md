# Skyward

A 16-bit-style 2D exploration platformer, in the lineage of Rick Dangerous and
Prince of Persia — but with **no enemies, no traps, and no death**. The focus is
mood, atmosphere, and discovery rather than challenge.

> Status: early proof of concept. Engine, core feel, and a deliberate
> procedural art direction are all in place. World tiles, the character,
> parallax mountains, and SFX are all generated in code — there are no
> external asset files.

## Design constraints

- **No fail states.** No enemies, no traps, no time pressure. Just exploration.
- **Mysterious, not threatening.** Wonder rather than fear.
- **Both axes of traversal.** Outdoor zones connect to underground via vertical
  descents; the game scrolls on both X and Y.
- **Late-80s Amiga 500 aesthetic.** 32-color palette, chunky sprites, parallax
  scrolling, internal resolution of 320×224.
- **Everything is procedural.** Characters, tiles, parallax, and sound effects
  are all generated in code. No PNGs, no audio samples — the whole game ships
  as TypeScript. Iteration is instant (edit code → see/hear result next frame)
  and style stays consistent because it all flows from one head.

## Tech stack

| Tool | Role |
|---|---|
| [PixiJS 8](https://pixijs.com/) | 2D WebGL renderer (everything drawn with `Graphics` primitives) |
| Web Audio API | Procedural 8-bit-style SFX synth (oscillators + noise) |
| TypeScript (strict) | Language, with comprehensive `@`-prefixed path aliases |
| [Vite](https://vitejs.dev/) | Dev server and bundler |
| [Biome](https://biomejs.dev/) | Formatter, linter, and import organizer in one |

### Why these choices

- **PixiJS over Phaser.** Leaner, more control. Platformer feel is in the
  details (jump arc, collision response, camera lerp), and a smaller engine
  makes those details easier to own.
- **Custom AABB physics over a physics engine.** Generic physics engines
  (Matter.js, planck.js, Box2D) make platformer jumps feel floaty and
  imprecise. The whole physics step is ~150 lines of hand-written
  axis-separated AABB-vs-tilemap collision, which is how Celeste,
  Hollow Knight, and Super Meat Boy all work.
- **DawnBringer 32 palette.** Well-known pixel-art palette that fits the
  Amiga 500 era. All colors are referenced by name from `constants.ts`.
- **Web Audio over audio samples.** SFX (jump, land, footstep, discovery,
  page turn) are synthesized live from oscillators + a noise buffer — same
  primitives as a NES sound chip. Zero asset loading, free style consistency,
  and parameters can be tuned in code without a tool round-trip.

## Code architecture

Composition over inheritance, plain-function "systems" over a formal ECS
framework. Entities hold state; behavior lives in functions that take state
and update it. No deep class hierarchies.

```
src/
  main.ts           # PixiJS app boot
  game.ts           # Owns the scene, entities, audio, and update loop
  constants.ts      # Tunable feel numbers (gravity, jump, palette, etc.)
  types.ts          # Shared types
  entities/
    player.ts       # Player: state, input, procedural figure (rebuilt each frame)
    landmark.ts     # Discoverable in-world marker + proximity prompt
  systems/
    physics.ts      # AABB-vs-tilemap collision, gravity, terminal velocity
    camera.ts       # Smooth follow camera with bounds clamping
    input.ts        # Keyboard state (down / pressed / released)
    audio.ts        # Web Audio synth + 8-bit SFX (jump, land, footstep, …)
    sketchbook.ts   # Discovery modal overlay (landmark page)
  world/
    tilemap.ts      # Tile enum, Tilemap class, renderer with per-tile detail
    levels.ts       # ASCII level data + landmark specs
    parallax.ts     # Procedural hill-silhouette parallax background
```

## Notable details

- **Platformer feel tricks**: coyote time, jump buffer, variable jump height
  (tap = hop, hold = full jump), asymmetric gravity (lighter rising, heavier
  falling). All tunable from `constants.ts`.
- **Procedural character animation**: the hooded figure is rebuilt from `rect()`
  primitives every frame, with three poses (idle / walk / jump) and a 1-pixel
  walk cycle (two alternating feet, vertical body bob, counter-phase arm).
  Pure integer-pixel offsets — no scale tricks, stays pixel-perfect at all times.
- **Footstep cadence is distance-based**, not phase-based. Fires every 20 px
  walked so the rhythm stays regular regardless of the sin-driven visual
  stride (which spends more time near its extremes than near zero).
- **Per-tile procedural detail**: a stable hash per `(tx, ty)` seeds grass
  tufts and sparse red wildflowers, dirt speckles, and dark-stone speckles —
  consistent under camera scroll, no per-frame randomness.
- **Discovery loop**: landmarks in the world show a "press E" tutorial the
  first time, then a small "!" indicator afterward. Discovering one opens a
  sketchbook overlay with an illustration and a description; the in-world
  marker desaturates to "logged" state.
- **Implicit level walls**: out-of-bounds tiles report as solid, so every
  level gets boundary walls for free.
- **Level data is plain ASCII**: each level is an array of strings where each
  character is a tile type (`.` sky, `G` grass, `D` dirt, `S` stone,
  `K` dark stone). Easy to hand-edit and read.
- **Logical resolution is 320×224.** The PixiJS stage is integer-upscaled
  for pixel-perfect rendering at any window size.
- **Two-container scene graph**: a parallax container behind, a world
  container (tilemap + entities) in front. The camera offsets the world
  container; parallax layers each get a fraction of that offset.

## Running locally

```sh
pnpm install
pnpm dev
```

Then open http://127.0.0.1:5173.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server with HMR |
| `pnpm build` | Typecheck and produce a production bundle |
| `pnpm typecheck` | TypeScript only |
| `pnpm check` | Biome: format + lint + import sort (read-only) |
| `pnpm check:fix` | Biome: apply all fixes |
| `pnpm format` | Biome: format only |
| `pnpm lint` | Biome: lint only |

## Controls

- **Move**: ← → / A D / Q D (AZERTY)
- **Jump**: Space / ↑ / W / Z (AZERTY)
- **Interact / close sketchbook**: E
