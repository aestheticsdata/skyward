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
export const WALK_SPEED = 96; // horizontal max speed
export const COYOTE_TIME = 0.08; // grace period to still jump after walking off a ledge
export const JUMP_BUFFER = 0.1; // grace period for jump press just before landing

// Visual / animation feel. These only affect rendering, never physics.
export const LANDING_SQUASH_DURATION = 0.12; // seconds the squash takes to recover
export const LANDING_SQUASH_AMOUNT = 0.3; // scale.y dips to (1 - this) on impact
export const AIR_STRETCH_AMOUNT = 0.15; // max ± scale.y deviation while airborne
export const WALK_BOB_FREQUENCY = 10; // rad/s — visual step rate
export const WALK_BOB_AMPLITUDE = 0.04; // scale.y oscillation while walking

// Camera smoothing: higher = snappier follow. Time-based so it's framerate-independent.
// f = 1 - exp(-RATE * dt). At 60fps with RATE=10, f ≈ 0.155 per frame.
export const CAMERA_SMOOTHING_RATE = 10;
