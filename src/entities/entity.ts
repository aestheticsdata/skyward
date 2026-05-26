import type { WorldState } from '@systems/world-state';
import type { Vec2 } from '@types';
import type { Container } from 'pixi.js';

// Display mode for a "you can interact with this" prompt above an entity.
//   'tutorial' - full "press E" tooltip (used the first time, before the
//                player has discovered the interact mechanic on a landmark)
//   'simple'   - small "!" indicator (used afterward)
//   null       - hidden
export type PromptMode = 'tutorial' | 'simple' | null;

// Context handed to an entity when the player interacts with it (presses E
// while in range), and also to the level's `createEntities` factory.
//
// Phase 1 callbacks:
//   transitionTo - swap the active level. Doors call this on E.
//   worldState   - shared cross-level flag store. No entity uses it yet,
//                  but it's wired so phase-2 levers / pressure plates /
//                  gates can read+write without an interface change.
//
// Phase 2 will likely extend this with audio cues and tilemap-solidity
// overlay hooks (for portcullises that block movement until a flag flips).
export interface InteractContext {
  // Switch to another level at the named spawn point. Caller is responsible
  // for picking a valid spawn id; Level.spawn() throws if it doesn't exist.
  transitionTo(levelId: string, spawnId: string): void;
  readonly worldState: WorldState;
}

// Base shape every world entity satisfies. Entities live in the active
// level's `levelLayer` container, scroll with the camera, and (for the
// interactable subset) participate in the proximity-prompt loop.
//
// Optional members are how we express capabilities without a class hierarchy:
//   - update?           → entity ticks each frame (lever cooldowns, plate
//                         depress animation, push-block physics, …)
//   - isPlayerInRange?  → entity is interactable; Game's prompt loop should
//                         consider it
//   - interact?         → called when player presses E while in range
//   - setPromptMode?    → entity can show/hide its proximity indicator
//
// An entity that's purely visual (a flickering candle, say) would set only
// `sprite` + `update`. A door is interactable but has no per-frame logic so
// it skips `update` and implements the interaction set.
export interface Entity {
  readonly sprite: Container;
  update?(dt: number): void;
  isPlayerInRange?(playerPos: Vec2, playerSize: Vec2): boolean;
  interact?(ctx: InteractContext): void;
  setPromptMode?(mode: PromptMode): void;
}
