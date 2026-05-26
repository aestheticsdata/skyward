import type { DecorationSpec } from '@entities/decoration';
import type { Entity, InteractContext } from '@entities/entity';
import type { LandmarkSpec } from '@entities/landmark';
import { Tilemap } from '@world/tilemap';

// A named point inside a level. Doors target these by id, the level's default
// spawn is one of these by id, and respawn/teleport features will reuse the
// same lookup.
export interface SpawnPoint {
  id: string;
  // Top-left of the player AABB in world (logical) pixels.
  x: number;
  y: number;
}

// Which parallax flavor sits behind this level. The meadow's distant-hill
// silhouettes don't fit an indoor castle; the keep wants either nothing or
// a dim interior backdrop. Add more flavors here as new biomes arrive.
export type ParallaxFlavor = 'meadow' | 'keep';

// What kind of solid backdrop sits at the back of the world container,
// behind the tilemap.
//   'cave'        - dark rock texture with speckle + striation bands.
//                   Right for outdoor levels whose caves want a granite
//                   feel showing through any gap in the main floor.
//   'indoor-dark' - flat near-black (valhalla) fill. Right for indoor
//                   levels (castle, keep): the cave texture reads as
//                   "dirt on the walls" in here, which is wrong.
//   'crypt-black' - PURE black fill. The darkest backdrop available, for
//                   spaces meant to feel "candle-lit hideout deep
//                   underground" — you can't see the back of the room.
export type BackdropKind = 'cave' | 'indoor-dark' | 'crypt-black';

// Authored description of a level. Pure data + factory functions — the
// runtime `Level` (below) is built from this and mounted by Game.
//
// Per-level fields that came from constants in the single-level draft:
//   rockBgStartRow  - row where the dark "rock" backdrop begins. Meadow uses
//                     the grass row (so cave-gaps in the main floor reveal
//                     rock from above). The keep, being entirely underground,
//                     starts at row 0 so every pixel of its backdrop is rock.
//   parallax        - flavor key (see ParallaxFlavor).
//   defaultSpawnId  - the spawn used when the level is first entered.
export interface LevelSpec {
  id: string;
  // Display name (used in dev logging today; will surface in UI later).
  name: string;
  // ASCII rows fed to Tilemap.fromAscii (see CHAR_TO_TILE in tilemap.ts).
  rows: readonly string[];
  // Named spawn points — at minimum the default one. Doors target these.
  spawns: readonly SpawnPoint[];
  defaultSpawnId: string;
  landmarks: readonly LandmarkSpec[];
  decorations: readonly DecorationSpec[];
  // Factory for the level's interactive entities. Re-runs on every mount, so
  // entity instances are fresh each visit. Persistent state (e.g. a lever's
  // pulled/unpulled position) belongs in WorldState, not on the entity.
  //
  // The context passed in lets entities trigger world-affecting actions
  // without holding a reference to Game directly. Phase 1 only uses
  // `transitionTo`; later phases will extend InteractContext.
  createEntities(ctx: InteractContext): readonly Entity[];
  parallax: ParallaxFlavor;
  backdrop: BackdropKind;
  // Row at which the backdrop starts. For outdoor levels this is the grass
  // row (so cave-gaps above ground reveal rock from above); for indoor
  // levels this is row 0 (the whole level wants the indoor backdrop).
  rockBgStartRow: number;
}

// Materialised level: spec + built Tilemap. Mounting still happens in Game,
// which owns the world container and player. We pre-build the Tilemap here
// because parsing ASCII rows is fail-fast (throws on ragged rows / unknown
// chars) and we'd rather discover authoring mistakes at registry-load time
// than mid-transition.
export class Level {
  readonly spec: LevelSpec;
  readonly tilemap: Tilemap;

  constructor(spec: LevelSpec) {
    this.spec = spec;
    this.tilemap = Tilemap.fromAscii(spec.rows);
  }

  spawn(id: string): SpawnPoint {
    const sp = this.spec.spawns.find((s) => s.id === id);
    if (!sp) {
      throw new Error(`Level '${this.spec.id}' has no spawn '${id}'`);
    }
    return sp;
  }
}
