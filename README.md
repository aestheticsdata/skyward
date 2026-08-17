# Loamkeep

A 16-bit-style 2D exploration platformer, in the lineage of Rick Dangerous and
Prince of Persia — but with **no enemies, no traps, and no death**. The focus is
mood, atmosphere, and discovery rather than challenge. You play a hooded
wanderer exploring a small world; landmarks log into a sketchbook as you
find them.

> Status: playable vertical slice. Three connected levels (meadow → old keep →
> crypt) with doorway transitions, wildlife (rabbits, fish, birds, a hopping
> pumpkin), water you can wade and swim through, and a procedural Amiga-500
> art direction. Everything ships as TypeScript — there are still no PNGs or
> audio samples.

## Design constraints

- **No fail states.** No enemies, no traps, no time pressure. Just exploration.
- **Mysterious, not threatening.** Wonder rather than fear.
- **Both axes of traversal.** Outdoor zones connect to underground via vertical
  descents and doorways; the game scrolls on both X and Y.
- **Late-80s Amiga 500 aesthetic.** 32-color palette, chunky sprites, parallax
  scrolling, internal resolution of 320×224.
- **Sketchbook-as-progression.** No XP, no upgrades. Progression is the set of
  places, animals, and scenes the player has personally seen and logged.
- **Everything is procedural.** Characters, tiles, parallax, water, wildlife,
  and sound effects are all generated in code. No PNGs, no audio samples — the
  whole game ships as TypeScript. Iteration is instant (edit code → see/hear
  result next frame) and style stays consistent because it all flows from one
  head.

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
- **Web Audio over audio samples.** SFX (jump, land, footstep, splash,
  swim-stroke, discovery, page turn) are synthesized live from oscillators +
  a noise buffer — same primitives as a NES sound chip. Zero asset loading,
  free style consistency, and parameters can be tuned in code without a tool
  round-trip.

## Code architecture

Composition over inheritance, plain-function "systems" over a formal ECS
framework. Entities hold state; behavior lives in functions that take state
and update it. No deep class hierarchies.

```
src/
  main.ts           # PixiJS app boot
  game.ts           # Owns the scene, level transitions, audio, and update loop
  constants.ts      # Tunable feel numbers (gravity, jump, water, palette, …)
  types.ts          # Shared types
  entities/
    entity.ts       # Entity interface + InteractContext for interactables
    player.ts       # Player: input, water-aware physics, procedural figure
    landmark.ts     # Discoverable in-world marker + proximity prompt
    door.ts         # Interactable doorway — triggers a level transition on E
    decoration.ts   # Purely visual world prop (trees, bushes, statues, …)
    chandelier.ts   # Hanging crypt light
    tall-candle.ts  # Candelabrum floor-light
    rabbit.ts       # Pacing wildlife — bob animation, AABB greet hitbox
    fish.ts         # Swimming wildlife — colour-aware, lives in water bodies
    bird.ts         # Flying wildlife — silhouette + 2-frame flap
    pumpkin.ts      # Hopping pumpkin — gravity-driven arc with cooldown
  systems/
    physics.ts      # AABB-vs-tilemap collision, gravity, terminal velocity
    camera.ts       # Smooth follow camera with bounds clamping
    input.ts        # Keyboard state (down / pressed / released)
    audio.ts        # Web Audio synth + 8-bit SFX
    sketchbook.ts   # Discovery modal (landmark page)
    greeting.ts     # First-encounter "you met X" popup (rabbit/fish/bird)
    world-state.ts  # Cross-level boolean-flag store
  world/
    tilemap.ts      # Tile enum + Tilemap class + procedural per-tile renderer
    level.ts        # LevelSpec interface + materialised Level (ASCII → Tilemap)
    levels.ts       # Level registry + loadLevel() lookup
    levels/
      meadow.ts          # Outdoor starting area
      old-keep.ts        # Indoor castle interior
      old-keep-crypt.ts  # Underground crypt
    parallax.ts     # Procedural parallax background (per-flavor)
```

## Notable details

- **Platformer feel tricks**: coyote time, jump buffer, variable jump height
  (tap = hop, hold = full jump), asymmetric gravity (lighter rising, heavier
  falling). All tunable from `constants.ts`.
- **Procedural character animation**: the hooded wanderer is rebuilt from
  `rect()` primitives every frame, with three poses (idle / walk / jump) and a
  1-pixel walk cycle (two alternating feet, vertical body bob, counter-phase
  arm). Pure integer-pixel offsets — no scale tricks, stays pixel-perfect at
  all times.
- **Footstep cadence is distance-based**, not phase-based. Fires every 20 px
  walked so the rhythm stays regular regardless of the sin-driven visual
  stride.
- **Multi-level architecture**: each level is a `LevelSpec` (ASCII rows +
  spawns + landmark/decoration/entity factories) registered in `levels.ts`.
  Doors carry a `(targetLevelId, targetSpawnId)`; on E, `Game.transitionTo`
  tears down the current level layer, rebuilds the new one, and repositions
  the persistent player at the named spawn. The same Player, Camera, and
  parallax container are reused across transitions.
- **Per-level visual flavor**: each level picks its own parallax flavor
  (`meadow` rolling hills, `keep` indoor backdrop) and backdrop kind (`cave`
  rock texture, `indoor-dark` flat near-black, `crypt-black` pure black for
  candle-lit underground).
- **Expanded tile palette**: grass / dirt / stone / dark stone (outdoor),
  castle brick / castle floor / gold pillar (castle interior), crypt brick /
  crypt floor (deep underground), plus water. Authored in ASCII — each
  character maps to one tile type.
- **Water mechanics**: wade on submerged ground at reduced speed, swim freely
  off-ground, hold jump to rise, hold down to dive. Exit-pop boost when
  leaving the surface with upward velocity (so you can climb a one-tile bank).
  Submerged pixels get a blue tint applied at render time, and the surface
  ripples ±1 px only on the body the player is currently inside.
- **Wildlife**: rabbits pacing platforms, fish swimming in water bodies, birds
  silhouetted across the sky, a hopping pumpkin with its own gravity. None
  collide with the player; they just inhabit the world.
- **First-encounter greetings**: the first time you bump into a rabbit, fish,
  or bird, a parchment popup pauses gameplay with a small line of speech
  ("Est-ce que tu as une carotte buddy ?"). One-shot per session, tracked in
  `WorldState`. Closes on any movement-key press.
- **Per-tile procedural detail**: a stable hash per `(tx, ty)` seeds grass
  tufts and sparse red wildflowers, dirt speckles, dark-stone speckles, brick
  mortar joints — consistent under camera scroll, no per-frame randomness.
- **Discovery loop**: landmarks in the world show a "press E" tutorial the
  first time, then a small "!" indicator afterward. Discovering one opens a
  sketchbook overlay with an illustration and description; the in-world
  marker desaturates to "logged" state. The same prompt model is reused by
  doors — once you've discovered any interactable, the tutorial bubble
  collapses to "!" everywhere.
- **Implicit level walls**: out-of-bounds tiles report as solid, so every
  level gets boundary walls for free.
- **Level data is plain ASCII**: each level is an array of strings where each
  character is a tile type (`.` sky, `G` grass, `D` dirt, `S` stone,
  `K` dark stone, `W` water, `B`/`F`/`P` castle bricks/floor/pillar,
  `c`/`v` crypt bricks/floor). Easy to hand-edit and read.
- **Logical resolution is 320×224.** The PixiJS stage is integer-upscaled
  for pixel-perfect rendering at any window size.
- **Scene graph**: a parallax container behind, a world container (level layer
  + persistent player) in front, modal overlays (sketchbook, greeting) on top
  of the stage. The camera offsets only the world container; parallax layers
  each get a fraction of that offset.

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

## Deployment

Deploy to production (versioned release + auto rollback on failure):

```sh
./scripts/deploy.sh deploy
```

Other actions:

```sh
./scripts/deploy.sh rollback
./scripts/deploy.sh list-releases
./scripts/deploy.sh rollback-to release-YYYYMMDD-HHMMSS-branch-hash
```

- Target host default: `debian@ks-b`, app folder `/var/www/loamkeep`
  (URL `https://loamkeep.1991computer.com/`). Everything lives inside it,
  bkmk-style: live root `front/` (the nginx root), versioned history
  `front-releases/`, previous version `front.bak/`. Same release mechanics as
  Shatter's deploy, which this script was ported from.
- The deploy refuses a dirty tree or a `HEAD` not level with `origin/master`,
  then typechecks and builds locally (`tsc --noEmit` + `vite build --base=./`)
  and uploads `dist/` to a versioned
  `front-releases/release-<timestamp>-<branch>-<hash>` with `release.json`
  metadata. The previous live version is kept as `front.bak` and restored
  automatically if the healthcheck fails.
- Healthcheck marker in the deployed HTML: `Loamkeep` (the page title).
- Every deploy and rollback is reported to Zeus (app `loamkeep`, role `front`),
  like the other 1991computer apps.

## Controls

- **Move**: ← → / A D / Q D (AZERTY)
- **Jump / swim up**: Space / ↑ / W / Z (AZERTY)
- **Dive (while in water)**: ↓ / S
- **Interact / close sketchbook**: E
- **Respawn at level's default spawn**: R
