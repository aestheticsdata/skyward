import { DB32, TILE_SIZE } from '@constants';
import type { DecorationSpec } from '@entities/decoration';
import { Door } from '@entities/door';
import type { Entity } from '@entities/entity';
import type { LandmarkSpec } from '@entities/landmark';
import { TallCandle } from '@entities/tall-candle';
import type { LevelSpec, SpawnPoint } from '@world/level';
import type { Graphics } from 'pixi.js';

// The Old Keep — THREE-storey great hall with floating staircase + basement.
//
// 50 wide × 26 tall. Three floors stacked vertically:
//
//   Upper floor (row 8, cols 2-28) — the "balcony"
//     - Stone Throne (col 14) + Bookshelf (col 20) + columns + candles
//     - Reached by climbing the floating staircase from the lower floor
//
//   Floating staircase (rows 10/12/14/16, cols 29-36) — connects lower to upper
//     - 4 stone slabs, each 2 tiles wide × 1 tile tall, FLOATING
//     - Each step is 2 tiles up + 2 tiles LEFT of the next-lower one
//     - Player jumps from lower floor onto step 1 (col 35-36 row 16),
//       then up-left onto each subsequent step, up to the upper floor
//     - NOTHING under each step — lower floor remains fully walkable
//
//   Lower floor (row 18, cols 2-47) — the entry hall
//     - Return door at col 3 (back to meadow)
//     - Hole in the floor at cols 36-37 — player drops to the basement
//     - Four gold columns, three candles, two hanging banners
//
//   Basement chamber (rows 19-22) — the "souterrain"
//     - Reached by falling through the hole in the lower floor
//     - Descend door at col 8 (down to the crypt) — far from the entry
//       hole, so the player has to walk left through the basement to
//       find it
//     - One climbing step (col 41 row 20) on the east side: from the
//       basement floor, jump onto the step, then jump up-left back to
//       the lower floor (col 38, just east of the hole)
//     - Two gold columns + two candles light the basement
//     - Basement floor at row 22 (cols 2-47)
//
// Legend (see CHAR_TO_TILE in tilemap.ts):
//   . empty   B CastleBrick   F CastleFloor   P GoldPillar
const OLD_KEEP_ROWS = [
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', //  0  ceiling top
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', //  1  ceiling underside
  'BB.........................................................BB', //  2  upper room
  'BB.........................................................BB', //  3
  'BB.........................................................BB', //  4
  'BB.....PP......PP......PP..................................BB', //  5  upper-floor columns (capitals)
  'BB.....PP......PP......PP..................................BB', //  6
  'BB.....PP......PP......PP..................................BB', //  7  upper-floor columns (bases)
  'BBFFFFFFFFFFFFFFFFFFFFFFFFFFFF.............................BB', //  8  UPPER FLOOR (cols 2-28)
  'BBFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF..............PP.......BB', //  9  lower room (above lower floor)
  'BBFFFFFFFFFFFFFFFFFFFFFFFFFFFF...........FFFFFFFFFFFFFFFFFFBB', // 10  step 4 floating (cols 29-30)
  'BBFFFFFFFFFFFFFFFFFFFFFFFFFFFF.........FF..................BB', // 11
  'BB...................................FF....................BB', // 12  step 3 floating (cols 31-32)
  'BB.................................FF......................BB', // 13
  'BB...............................FF........................BB', // 14  step 2 floating (cols 33-34)
  'BB.........................................................BB', // 15
  'BB.....................................FF..................BB', // 16  step 1 floating (cols 35-36)
  'BB....PP......PP......PP......PP...........................BB', // 17  lower-room columns
  'BBFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF..FFFFFFFFFFFFFFFFFFFFFBB', // 18  LOWER FLOOR (cols 2-35, 38-47) — hole at 36-37
  'BB.........................................................BB', // 19  basement chamber (top)
  'BB.......................................F.................BB', // 20  basement climb-out step (col 41)
  'BB.....PP..............PP..................................BB', // 21  basement gold columns
  'BBFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFBB', // 22  BASEMENT FLOOR (cols 2-47)
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', // 23  foundation top
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', // 24  foundation
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', // 25  foundation
] as const;

// Three floors — entities sit on whichever is appropriate. Y is the world-Y
// of each floor's top edge (the surface the player walks on); the SPAWN
// counterpart is 16 px above so the player AABB feet land exactly on it.
const UPPER_FLOOR_ROW = 8;
const UPPER_FLOOR_Y = UPPER_FLOOR_ROW * TILE_SIZE;

const LOWER_FLOOR_ROW = 18;
const LOWER_FLOOR_Y = LOWER_FLOOR_ROW * TILE_SIZE;
const LOWER_SPAWN_Y = LOWER_FLOOR_Y - TILE_SIZE;

const BASEMENT_FLOOR_ROW = 22;
const BASEMENT_FLOOR_Y = BASEMENT_FLOOR_ROW * TILE_SIZE;
const BASEMENT_SPAWN_Y = BASEMENT_FLOOR_Y - TILE_SIZE;

// Door placement:
//   - Return door (back to meadow) on the LOWER floor.
//   - Descend door (down to the crypt) in the BASEMENT — far from the
//     hole the player drops in through, so they have to walk through the
//     basement chamber to find it.
//   - Stone Throne + Bookshelf landmarks on the UPPER floor — the climb
//     is the reward.
const RETURN_DOOR_COL = 3;
const RETURN_DOOR_X = RETURN_DOOR_COL * TILE_SIZE + 8;

const DESCEND_DOOR_COL = 8;
const DESCEND_DOOR_X = DESCEND_DOOR_COL * TILE_SIZE + 8;

// Spawns:
//   'from-meadow' - LOWER floor, near the return door (cool down on entry).
//   'from-crypt'  - BASEMENT floor, near the descend door (where the
//                   player exited the crypt).
const SPAWN_FROM_MEADOW_X = 5 * TILE_SIZE + 2;
const SPAWN_FROM_CRYPT_X = 11 * TILE_SIZE + 2;

const OLD_KEEP_SPAWNS: SpawnPoint[] = [
  { id: 'from-meadow', x: SPAWN_FROM_MEADOW_X, y: LOWER_SPAWN_Y },
  { id: 'from-crypt', x: SPAWN_FROM_CRYPT_X, y: BASEMENT_SPAWN_Y },
];

// ---------------------------------------------------------------------------
// Landmarks — keep-specific. Phase 3 ships with one (Stone Throne); more
// arrive in phase 4 (Great Kettle, Stained Glass, Old Banner with lore).
// ---------------------------------------------------------------------------

const inkFor = (discovered: boolean): number => (discovered ? DB32.opal : DB32.valhalla);

const OLD_KEEP_LANDMARKS: LandmarkSpec[] = [
  // Stone Throne — centred on the UPPER floor (col 14). The throne is the
  // climb's reward: player has to find the staircase on the right side and
  // ascend four steps to reach this room.
  {
    id: 'stone-throne',
    x: 14 * TILE_SIZE + 8,
    y: UPPER_FLOOR_Y,
    name: 'Stone Throne',
    description:
      'A throne carved from a single block of dark stone. The seat is worn smooth in the shape of someone ' +
      'who sat here often, long ago. The back is engraved with a spiral motif you have seen before — ' +
      'on the Stone Marker.',
    drawBody(g, discovered) {
      const ink = inkFor(discovered);
      const stone = discovered ? DB32.dimGray : DB32.heather;
      const stoneHi = discovered ? DB32.dimGray : DB32.lightSteel;
      const stoneShadow = discovered ? DB32.opal : DB32.dimGray;
      const accent = discovered ? DB32.heather : DB32.goldenFizz;

      // Base — 16 wide × 4 tall slab.
      g.rect(-8, -4, 16, 4).fill(stone);
      g.rect(-8, -4, 16, 1).fill(stoneHi);
      g.rect(-8, -4, 1, 4).fill(ink);
      g.rect(7, -4, 1, 4).fill(ink);
      g.rect(-8, -1, 16, 1).fill(ink);

      // Seat block — 12 wide × 4 tall sitting on the base.
      g.rect(-6, -8, 12, 4).fill(stone);
      g.rect(-6, -8, 12, 1).fill(stoneHi);
      g.rect(-6, -8, 1, 4).fill(ink);
      g.rect(5, -8, 1, 4).fill(ink);
      g.rect(-6, -5, 12, 1).fill(stoneShadow);

      // Backrest — 12 wide × 12 tall rising from the seat.
      g.rect(-6, -20, 12, 12).fill(stone);
      g.rect(-6, -20, 12, 1).fill(stoneHi);
      g.rect(-6, -20, 1, 12).fill(ink);
      g.rect(5, -20, 1, 12).fill(ink);

      // Spiral motif carved into the backrest centre. Three short lines
      // at increasing depth — reads as a coiled glyph.
      g.rect(-3, -16, 6, 1).fill(ink);
      g.rect(-3, -16, 1, 4).fill(ink);
      g.rect(2, -16, 1, 4).fill(ink);
      g.rect(-3, -13, 6, 1).fill(ink);
      g.rect(-1, -15, 1, 2).fill(ink);

      // Finial — small carved cap on top of the backrest.
      g.rect(-4, -22, 8, 2).fill(stone);
      g.rect(-4, -22, 8, 1).fill(stoneHi);
      g.rect(-1, -24, 2, 2).fill(accent);
    },
    drawSketch(g) {
      const stone = DB32.heather;
      const stoneHi = DB32.lightSteel;
      const ink = DB32.valhalla;
      const accent = DB32.goldenFizz;

      // Base.
      g.rect(-20, 16, 40, 6).fill(stone);
      g.rect(-20, 16, 40, 1).fill(stoneHi);
      // Seat.
      g.rect(-16, 8, 32, 8).fill(stone);
      g.rect(-16, 8, 32, 1).fill(stoneHi);
      // Backrest.
      g.rect(-16, -24, 32, 32).fill(stone);
      g.rect(-16, -24, 32, 1).fill(stoneHi);
      // Spiral.
      g.rect(-8, -16, 16, 1).fill(ink);
      g.rect(-8, -16, 1, 8).fill(ink);
      g.rect(7, -16, 1, 8).fill(ink);
      g.rect(-8, -8, 16, 1).fill(ink);
      g.rect(-3, -14, 1, 6).fill(ink);
      g.rect(2, -14, 1, 4).fill(ink);
      // Finial.
      g.rect(-10, -28, 20, 4).fill(stoneHi);
      g.rect(-3, -32, 6, 4).fill(accent);
    },
  },
];

// ---------------------------------------------------------------------------
// Decorations — static visuals. The hanging banner anchors at its BOTTOM
// tip (so we can hang it from a known ceiling row); the bookshelf anchors
// at its foot (standard floor-stand convention).
// ---------------------------------------------------------------------------

// A long burgundy banner hanging from an iron pole. 8 wide × 26 tall when
// fully drawn. Anchored at its BOTTOM tip (y=0) so the spec passes the
// world-Y of the lowest pixel — the pole sits 26 px above that.
//
// Visual brief: iron pole across the top, two flat hanging straps, then
// cloth in deep burgundy with a paler vertical band down the middle and a
// 3-tooth fringe at the bottom. Reads at game scale as "stately heraldic
// banner."
function drawBanner(g: Graphics): void {
  const iron = DB32.dimGray;
  const ironHi = DB32.heather;
  const cloth = DB32.clairvoyant; // deep red
  const clothHi = DB32.brown; // bright red highlight
  const clothShadow = DB32.loulou; // very dark plum
  const trim = DB32.goldenFizz; // gold trim

  // Iron pole across the very top — 8 wide × 1 tall.
  g.rect(-4, -26, 8, 1).fill(iron);
  g.rect(-4, -26, 8, 1).fill(ironHi); // (single bright top line, will be overwritten by content below)
  g.rect(-4, -25, 8, 1).fill(iron);

  // Two short iron straps connecting pole to cloth — 1 wide × 2 tall each.
  g.rect(-3, -24, 1, 2).fill(iron);
  g.rect(2, -24, 1, 2).fill(iron);

  // Cloth body — 6 wide × 20 tall.
  g.rect(-3, -22, 6, 20).fill(cloth);
  // Top highlight strip and shadow accents.
  g.rect(-3, -22, 6, 1).fill(clothShadow);
  g.rect(-3, -22, 1, 20).fill(clothShadow);
  g.rect(2, -22, 1, 20).fill(clothShadow);
  // Vertical highlight stripe down the middle — 1 px wide.
  g.rect(-1, -21, 1, 19).fill(clothHi);
  // Single gold trim emblem near the top of the cloth.
  g.rect(-1, -18, 2, 2).fill(trim);

  // Fringe at the bottom — 3 hanging teeth, each 2 wide × 2 tall.
  g.rect(-3, -2, 2, 2).fill(cloth);
  g.rect(0, -2, 1, 2).fill(cloth);
  g.rect(2, -2, 1, 2).fill(cloth);
  // Tooth shadows.
  g.rect(-3, -2, 1, 2).fill(clothShadow);
  g.rect(2, -2, 1, 2).fill(clothShadow);
}

// Tall wooden bookshelf — 14 wide × 22 tall. Three shelves of books in
// varied colours. Anchored at the foot (standard floor-stand). The wood
// frame matches the existing Hollow Tree's palette so castle furniture
// feels visually related to the outdoor wooden world.
function drawBookshelf(g: Graphics): void {
  const wood = DB32.oiledCedar;
  const woodHi = DB32.rope;
  const woodShadow = DB32.valhalla;
  const cavity = DB32.valhalla;

  // Outer frame fill.
  g.rect(-7, -22, 14, 22).fill(wood);
  g.rect(-7, -22, 14, 1).fill(woodHi);
  g.rect(-7, -22, 1, 22).fill(woodShadow);
  g.rect(6, -22, 1, 22).fill(woodShadow);

  // Interior cavity — 10 wide × 18 tall, inset 2 px from the frame.
  g.rect(-5, -20, 10, 18).fill(cavity);

  // Three shelves at y=-8, y=-14 (creating a top, middle, bottom row of
  // books). Each shelf is a 1-px wood line across the cavity.
  g.rect(-5, -8, 10, 1).fill(wood);
  g.rect(-5, -14, 10, 1).fill(wood);

  // Books — varied 1-px-wide spines, varied heights, varied colours.
  // Top shelf (between y=-19 and y=-15, so 4 px tall):
  drawBookSpines(g, -5, -19, 10, [DB32.clairvoyant, DB32.eltGreen, DB32.tahitiGold, DB32.cornflower, DB32.brown]);
  // Middle shelf (y=-13 to y=-9, 4 tall):
  drawBookSpines(g, -5, -13, 10, [DB32.deepKoamaru, DB32.brown, DB32.dell, DB32.mandy, DB32.goldenFizz, DB32.venice]);
  // Bottom shelf (y=-7 to y=-3, 4 tall):
  drawBookSpines(g, -5, -7, 10, [DB32.rainforest, DB32.brown, DB32.eltGreen, DB32.cornflower]);

  // Bottom trim (just below the cavity — masks the wood floor edge).
  g.rect(-7, -2, 14, 1).fill(woodHi);
}

// Helper: fill a shelf with varied-height book spines starting at (x, y),
// across `width` px. Picks heights pseudo-randomly per spine from `palette`.
// Pure presentation — no logic depends on the colours so the array can be
// freely reordered.
function drawBookSpines(g: Graphics, x: number, y: number, width: number, palette: readonly number[]): void {
  // Simple hash so per-call book pattern stays stable across redraws.
  // (Decoration draws once at construction, so any deterministic pattern
  // works; this just keeps things reproducible if we ever redraw.)
  let cursor = x;
  let i = 0;
  while (cursor < x + width) {
    const colour = palette[i % palette.length];
    const w = 1 + ((i * 5) % 2); // alternate 1 px and 2 px wide spines
    if (cursor + w > x + width) break;
    const dropTop = (i * 7) % 3 === 0 ? 1 : 0; // tilt a few books down 1 px
    g.rect(cursor, y + dropTop, w, 4 - dropTop).fill(colour);
    // 1-px shadow line on the right edge of each book for separation.
    g.rect(cursor + w - 1, y + dropTop, 1, 4 - dropTop).fill(DB32.valhalla);
    cursor += w;
    i += 1;
  }
}

// Convenience constructors for placing decorations.
//   onUpper         - foot-anchored, stands on the upper floor.
//   hangFromCeiling - bottom-tip anchored, hangs from a known ceiling row.
//                      (Used for both the top ceiling banner and the
//                      upper-floor-underside banner — same anchor logic.)
const onUpper = (col: number, draw: (g: Graphics) => void): DecorationSpec => ({
  x: col * TILE_SIZE + 8,
  y: UPPER_FLOOR_Y,
  draw,
});

const hangFromCeiling = (col: number, bottomRow: number, draw: (g: Graphics) => void): DecorationSpec => ({
  x: col * TILE_SIZE + 8,
  // Banner's anchor is its BOTTOM tip, so y is the world-Y of the lowest
  // visible pixel. We pass the bottom of the row where the banner ends.
  y: bottomRow * TILE_SIZE,
  draw,
});

const OLD_KEEP_DECORATIONS: DecorationSpec[] = [
  // Banner in the UPPER room — hangs from the top ceiling, ends around
  // row 5 (above where the player walks on the upper floor at row 8).
  hangFromCeiling(17, 5, drawBanner),
  hangFromCeiling(33, 5, drawBanner),

  // Banner in the LOWER room — hangs from the underside of the upper
  // floor (which is the lower room's "ceiling" at row 9). Bottom tip at
  // row 13 — clears the lower-room columns.
  hangFromCeiling(10, 13, drawBanner),
  hangFromCeiling(36, 13, drawBanner),

  // Bookshelf on the UPPER floor — to the right of the throne, between
  // the middle and right gold columns.
  onUpper(20, drawBookshelf),
];

export const oldKeepLevel: LevelSpec = {
  id: 'old-keep',
  name: 'The Old Keep',
  rows: OLD_KEEP_ROWS,
  spawns: OLD_KEEP_SPAWNS,
  defaultSpawnId: 'from-meadow',
  landmarks: OLD_KEEP_LANDMARKS,
  decorations: OLD_KEEP_DECORATIONS,
  parallax: 'keep',
  backdrop: 'indoor-dark',
  rockBgStartRow: 0,
  createEntities(): readonly Entity[] {
    return [
      // Return door — LOWER floor left side, back to the meadow.
      new Door({
        id: 'keep-return-door',
        x: RETURN_DOOR_X,
        y: LOWER_FLOOR_Y,
        targetLevelId: 'meadow',
        targetSpawnId: 'from-keep',
        promptLabel: 'leave',
      }),
      // Descend door — BASEMENT floor (the new "souterrain") west side,
      // down to the crypt level.
      new Door({
        id: 'keep-descend-door',
        x: DESCEND_DOOR_X,
        y: BASEMENT_FLOOR_Y,
        targetLevelId: 'old-keep-crypt',
        targetSpawnId: 'from-keep',
        promptLabel: 'descend',
      }),
      // Candles — three on the lower floor, two on the upper floor (near
      // the throne and the bookshelf), two in the basement (one on each
      // side of the basement chamber). Each instance ticks on its own
      // clock so they don't all flicker in sync.
      new TallCandle(9 * TILE_SIZE + 8, LOWER_FLOOR_Y),
      new TallCandle(21 * TILE_SIZE + 8, LOWER_FLOOR_Y),
      new TallCandle(36 * TILE_SIZE + 8, LOWER_FLOOR_Y),
      new TallCandle(11 * TILE_SIZE + 8, UPPER_FLOOR_Y),
      new TallCandle(26 * TILE_SIZE + 8, UPPER_FLOOR_Y),
      new TallCandle(14 * TILE_SIZE + 8, BASEMENT_FLOOR_Y),
      new TallCandle(30 * TILE_SIZE + 8, BASEMENT_FLOOR_Y),
    ];
  },
};
