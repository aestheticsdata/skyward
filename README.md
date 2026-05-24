# Skyward

A 16-bit-style 2D exploration platformer, in the lineage of Rick Dangerous and
Prince of Persia — but with **no enemies, no traps, and no death**. The focus is
mood, atmosphere, and discovery rather than challenge.

> Status: early proof of concept. The engine and core feel are in place; the art
> is still procedural placeholder shapes (rectangles, polygons, colored fills).
> Real pixel art comes once the mechanics feel right.

## Design constraints

- **No fail states.** No enemies, no traps, no time pressure. Just exploration.
- **Mysterious, not threatening.** Wonder rather than fear.
- **Both axes of traversal.** Outdoor zones connect to underground via vertical
  descents; the game scrolls on both X and Y.
- **Late-80s Amiga 500 aesthetic.** 32-color palette, chunky sprites, parallax
  scrolling, internal resolution of 320×224.

## Tech stack

| Tool | Role |
|---|---|
| [PixiJS 8](https://pixijs.com/) | 2D WebGL renderer |
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

## Code architecture

Composition over inheritance, plain-function "systems" over a formal ECS
framework. Entities hold state; behavior lives in functions that take state
and update it. No deep class hierarchies.

```
src/
  main.ts           # PixiJS app boot
  game.ts           # Owns the scene, entities, and update loop
  constants.ts      # Tunable feel numbers (gravity, jump, palette, etc.)
  types.ts          # Shared types
  entities/
    player.ts       # Player: state, input handling, sprite
  systems/
    physics.ts      # AABB-vs-tilemap collision, gravity, terminal velocity
    camera.ts       # Smooth follow camera with bounds clamping
    input.ts        # Keyboard state (down / pressed / released)
  world/
    tilemap.ts      # Tile enum, Tilemap class, renderer
    levels.ts       # ASCII level data
    parallax.ts     # Procedural hill-silhouette parallax background
```

## Notable details

- **Platformer feel tricks**: coyote time, jump buffer, variable jump height
  (tap = hop, hold = full jump), asymmetric gravity (lighter rising, heavier
  falling), and a landing-squash animation. All tunable from `constants.ts`.
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
