// Logical (internal) resolution. The whole game is authored in this coordinate space;
// the canvas itself is rendered at SCREEN_* x DEFAULT_SCALE for pixel-perfect upscale.
export const SCREEN_WIDTH = 320;
export const SCREEN_HEIGHT = 224;

// Classic Amiga tile size. All level geometry is on this grid.
export const TILE_SIZE = 16;

// Integer upscale factor applied to the Pixi stage.
export const DEFAULT_SCALE = 3;

// DawnBringer 32 palette (DB32) — well-known pixel-art palette that fits the late-80s look.
// Stored as hex numbers so they plug straight into Pixi tints / fills.
export const DB32 = {
  black: 0x000000,
  valhalla: 0x222034,
  loulou: 0x45283c,
  oiledCedar: 0x663931,
  rope: 0x8f563b,
  tahitiGold: 0xdf7126,
  twine: 0xd9a066,
  pancho: 0xeec39a,
  goldenFizz: 0xfbf236,
  atlantis: 0x99e550,
  christi: 0x6abe30,
  eltGreen: 0x37946e,
  dell: 0x4b692f,
  verdigris: 0x595652,
  opal: 0x323c39,
  deepKoamaru: 0x3f3f74,
  venice: 0x306082,
  royalBlue: 0x5b6ee1,
  cornflower: 0x639bff,
  viking: 0x5fcde4,
  lightSteel: 0xcbdbfc,
  white: 0xffffff,
  heather: 0x9badb7,
  topaz: 0x847e87,
  dimGray: 0x696a6a,
  smokeyAsh: 0x76428a,
  clairvoyant: 0xac3232,
  brown: 0xd95763,
  mandy: 0xd77bba,
  plum: 0x8f974a,
  rainforest: 0x8a6f30,
  stinger: 0x524b24,
} as const;

// Physics "feel" numbers. All in logical pixels and seconds. Tweak liberally.
//
// Relationships (for tuning intuition):
//   max jump height = JUMP_VELOCITY² / (2 * GRAVITY)
//   time to apex   = JUMP_VELOCITY / GRAVITY
// With current numbers: ~64px (4 tiles) high, ~0.43s up.
export const GRAVITY = 700; // px/s² downward, while ascending
export const GRAVITY_FALL_MULT = 1.6; // gravity multiplier while falling (snappy fall vs floaty rise)
export const JUMP_VELOCITY = 300; // initial upward speed when jumping
export const JUMP_RELEASE_MULT = 0.5; // upward velocity is cut by this when jump key is released early
export const TERMINAL_VELOCITY = 450; // max downward speed in px/s
export const WALK_SPEED = 72; // horizontal max speed (was 96 — felt "100 à l'heure")
export const COYOTE_TIME = 0.08; // grace period to still jump after walking off a ledge
export const JUMP_BUFFER = 0.1; // grace period for jump press just before landing

// Water feel — one unified model:
//   - In water on solid ground: walk at WADE_SPEED (slower than land).
//   - In water off ground, no input: WATER_GRAVITY pulls down (slow sink,
//     capped at WATER_TERMINAL_VEL). The player drops to the lake floor and
//     can walk there.
//   - In water off ground, jump held: vel.y = -SWIM_UP_SPEED (rises through
//     the water).
//   - In water off ground, down held: vel.y = SWIM_DOWN_SPEED (dives).
// Exiting the water with upward velocity gets a small jump boost so the
// player can pop onto a lake bank one tile above the surface.
export const WADE_SPEED = 56; // horizontal walk speed while wading on a submerged floor
export const SWIM_HORIZONTAL_SPEED = 60; // horizontal swim speed when off ground in water
// Up-swim is intentionally slow so a brief jump-key tap only nudges the
// player a few pixels — sustained pressing is required to actually ascend.
// At 60 px/s a 0.1 s tap moves ~6 px (<½ tile); a held press climbs 1 tile
// in ~0.27 s.
export const SWIM_UP_SPEED = 60;
export const SWIM_DOWN_SPEED = 110; // downward velocity while down is held in water
export const WATER_GRAVITY = 160; // slow sink while floating idle in water
export const WATER_TERMINAL_VEL = 90; // cap on the slow sink so it never feels like a freefall
// Boost applied to vel.y the frame the player's midpoint leaves the water
// while still moving up — turns the gentle swim-up momentum into a small
// jump that can clear a one-tile bank. Tuned to JUMP_VELOCITY * 0.75 so an
// exit pop reads as a deliberate jump out of the lake.
export const WATER_EXIT_BOOST = 225;
// Velocity allowed at the very moment of entering water. Caps the fall
// momentum so the player floats on entry instead of plunging.
export const WATER_ENTRY_VEL_CAP = 60;
// Interval between two automatic swim-stroke SFX (the muffled "whoosh")
// while the player is swimming (off ground in water) and moving.
export const SWIM_STROKE_INTERVAL = 0.55;
// Blue cast used on submerged pixels. Result = base * tint / 255 per
// channel, so the red+green channels need to be reasonably low for white
// pixels (the hood highlight) to read as obviously blue. 0x6090e8 takes
// pure white down to (96, 144, 232) — clearly blue, not pale-white.
export const SUBMERGED_TINT = 0x6090e8;

// Camera smoothing: higher = snappier follow. Time-based so it's framerate-independent.
// f = 1 - exp(-RATE * dt). At 60fps with RATE=10, f ≈ 0.155 per frame.
export const CAMERA_SMOOTHING_RATE = 10;

// Landmark interaction zone: half-extents (in logical pixels) around the
// landmark's visual center. Player center inside this rectangle = can interact.
export const LANDMARK_INTERACT_RANGE_X = 16;
export const LANDMARK_INTERACT_RANGE_Y = 20;
