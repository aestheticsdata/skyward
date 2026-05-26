import { DB32, TILE_SIZE } from '@constants';
import { Chandelier } from '@entities/chandelier';
import type { DecorationSpec } from '@entities/decoration';
import { Door } from '@entities/door';
import type { Entity } from '@entities/entity';
import type { LandmarkSpec } from '@entities/landmark';
import { TallCandle } from '@entities/tall-candle';
import type { LevelSpec, SpawnPoint } from '@world/level';
import type { Graphics } from 'pixi.js';

// The Crypt — small, dark, cosy. Deeply buried.
//
// 22 wide × 28 tall. The visible chamber is small (one screen wide,
// 8 rows of interior) but it sits buried under many layers of stone,
// so when the player jumps in the crypt they NEVER see sky above the
// ceiling — only more brick. The visible interior:
//
//   Rows 0-13   solid CryptBrick — 14 rows of overhead stone. Camera
//               can only ever reveal brick at the top of the viewport.
//   Rows 14-15  ceiling (the bricks the player can JUST see above their
//               head if they jump from the floor)
//   Rows 16-22  interior (7 rows of headroom)
//   Row 23      polished crypt floor
//   Rows 24-27  foundation (4 rows of stone below the floor)
//
// Walls are CryptBrick (true neutral near-black with white "reflets"
// highlights) and floor is CryptFloor (one notch lighter). Backdrop is
// 'crypt-black' (pure black) so every gap between objects reads as
// "the candlelight can't reach back there."
//
// Furniture: two red-velvet armchairs flanking the tomb inscription,
// each by a candle. A cosy hideout buried under the keep — a place
// you'd want to sit down in, not just pass through.
//
// Legend (see CHAR_TO_TILE in tilemap.ts):
//   . empty   c CryptBrick   v CryptFloor
const OLD_KEEP_CRYPT_ROWS = [
  'cccccccccccccccccccccc', //  0  deep stone overhead
  'cccccccccccccccccccccc', //  1
  'cccccccccccccccccccccc', //  2
  'cccccccccccccccccccccc', //  3
  'cccccccccccccccccccccc', //  4
  'cccccccccccccccccccccc', //  5
  'cccccccccccccccccccccc', //  6
  'cccccccccccccccccccccc', //  7
  'cccccccccccccccccccccc', //  8
  'cccccccccccccccccccccc', //  9
  'cccccccccccccccccccccc', // 10
  'cccccccccccccccccccccc', // 11
  'cccccccccccccccccccccc', // 12
  'cccccccccccccccccccccc', // 13
  'cccccccccccccccccccccc', // 14  ceiling (visible from inside)
  'cccccccccccccccccccccc', // 15
  'cccccccccccccccccccccc', // 16  interior
  'cccccccccccccccccccccc', // 17
  'cc..................cc', // 18
  'cc..................cc', // 19
  'cc..................cc', // 20
  'cc..................cc', // 21
  'cc..................cc', // 22
  'ccvvvvvvvv..vvvvvvvvcc', // 23  polished crypt floor
  'ccccccc.....cccccccccc', // 24  foundation
  'ccccccc..ccccccccccccc', // 25
  'ccccccc........ccccccc', // 26
  'cccccccccccccccccccccc', // 27
] as const;

const FLOOR_ROW = 23;
const STAND_Y = FLOOR_ROW * TILE_SIZE;
const STAND_SPAWN_Y = STAND_Y - TILE_SIZE;

// Return door — back up to the keep's basement. Sits at the left wall.
const RETURN_DOOR_COL = 3;
const RETURN_DOOR_X = RETURN_DOOR_COL * TILE_SIZE + 8;

const OLD_KEEP_CRYPT_SPAWNS: SpawnPoint[] = [
  // 'from-keep' — player descended from the keep's basement. Two tiles
  // right of the return door, clear of its interaction zone.
  { id: 'from-keep', x: 6 * TILE_SIZE + 2, y: STAND_SPAWN_Y },
];

// ---------------------------------------------------------------------------
// Landmark — the engraved tomb slab on the crypt floor.
// ---------------------------------------------------------------------------

const inkFor = (discovered: boolean): number => (discovered ? DB32.opal : DB32.valhalla);

const OLD_KEEP_CRYPT_LANDMARKS: LandmarkSpec[] = [
  {
    id: 'crypt-inscription',
    x: 11 * TILE_SIZE + 8,
    y: STAND_Y,
    name: 'Crypt Inscription',
    description:
      'A flat stone tomb, set into the floor. The lid is engraved in a language you do not know, but ' +
      'the script spirals — the same spiral as the Stone Marker, as the Throne. ' +
      'Three names are picked out in faint gold leaf. The dates have worn away.',
    drawBody(g, discovered) {
      const ink = inkFor(discovered);
      const stone = discovered ? DB32.dimGray : DB32.heather;
      const stoneHi = discovered ? DB32.dimGray : DB32.lightSteel;
      const stoneShadow = discovered ? DB32.opal : DB32.dimGray;
      const gold = discovered ? DB32.dimGray : DB32.goldenFizz;

      // Base slab — 20 wide × 5 tall, sitting flat on the floor.
      g.rect(-10, -5, 20, 5).fill(stone);
      g.rect(-10, -5, 20, 1).fill(stoneHi);
      g.rect(-10, -5, 1, 5).fill(ink);
      g.rect(9, -5, 1, 5).fill(ink);
      g.rect(-10, -1, 20, 1).fill(ink);

      // Inset carved area — slightly recessed on the lid. 16 wide × 3 tall.
      g.rect(-8, -4, 16, 3).fill(stoneShadow);
      g.rect(-8, -4, 16, 1).fill(ink);

      // Engraved spiral motif in the centre of the lid — same shape as
      // the Stone Marker and Throne.
      g.rect(-2, -3, 4, 1).fill(ink);
      g.rect(-2, -3, 1, 2).fill(ink);
      g.rect(1, -3, 1, 2).fill(ink);
      g.rect(-2, -2, 4, 1).fill(ink);

      // Three small gold marks on the lid — the "names in gold leaf."
      g.rect(-7, -3, 1, 1).fill(gold);
      g.rect(-5, -3, 1, 1).fill(gold);
      g.rect(6, -3, 1, 1).fill(gold);
    },
    drawSketch(g) {
      const stone = DB32.heather;
      const stoneHi = DB32.lightSteel;
      const ink = DB32.valhalla;
      const gold = DB32.goldenFizz;
      const stoneShadow = DB32.dimGray;

      g.rect(-22, 8, 44, 12).fill(stone);
      g.rect(-22, 8, 44, 2).fill(stoneHi);
      g.rect(-22, 8, 2, 12).fill(ink);
      g.rect(20, 8, 2, 12).fill(ink);

      g.rect(-18, -8, 36, 16).fill(stone);
      g.rect(-18, -8, 36, 2).fill(stoneHi);
      g.rect(-18, 6, 36, 2).fill(stoneShadow);
      g.rect(-18, -8, 2, 16).fill(ink);
      g.rect(16, -8, 2, 16).fill(ink);

      g.rect(-12, -4, 24, 2).fill(ink);
      g.rect(-12, -4, 2, 10).fill(ink);
      g.rect(10, -4, 2, 10).fill(ink);
      g.rect(-12, 4, 24, 2).fill(ink);
      g.rect(-4, -2, 2, 6).fill(ink);
      g.rect(2, -2, 2, 6).fill(ink);

      g.rect(-16, 0, 4, 1).fill(gold);
      g.rect(-16, 2, 3, 1).fill(gold);
      g.rect(13, 0, 4, 1).fill(gold);
    },
  },
];

// ---------------------------------------------------------------------------
// Cosy armchair decoration. Drawn around (0, 0) with feet at y=0.
//
// Visual brief: a small wooden-framed armchair upholstered in deep red
// velvet, with a gold finial across the top of the backrest. 12 wide × 12
// tall. Reads at game scale as "this is where you sit by the candle to
// read a book." The dark crypt context makes the warm red+gold pop.
// ---------------------------------------------------------------------------

function drawArmchair(g: Graphics): void {
  const wood = DB32.oiledCedar;
  const woodHi = DB32.rope;
  const woodShadow = DB32.valhalla;
  const cushion = DB32.clairvoyant; // deep red
  const cushionHi = DB32.brown; // brighter red highlight
  const cushionShadow = DB32.loulou; // dark plum shadow
  const trim = DB32.goldenFizz;

  // Two short wooden legs at the bottom, 2 px wide each at the chair's
  // left and right edges. Tiny shadow gap between them suggests the
  // chair is lifted off the floor.
  g.rect(-6, -2, 2, 2).fill(wood);
  g.rect(4, -2, 2, 2).fill(wood);
  g.rect(-6, -2, 2, 1).fill(woodHi);
  g.rect(4, -2, 2, 1).fill(woodHi);

  // Wooden seat frame — 12 wide × 2 tall above the legs.
  g.rect(-6, -4, 12, 2).fill(wood);
  g.rect(-6, -4, 12, 1).fill(woodHi);
  g.rect(-6, -3, 12, 1).fill(woodShadow);

  // Red velvet seat cushion — 10 wide × 1 tall on the frame.
  g.rect(-5, -5, 10, 1).fill(cushionHi);

  // Armrests — 2 px wide × 4 tall on each side, between seat and backrest top.
  g.rect(-6, -9, 2, 4).fill(wood);
  g.rect(4, -9, 2, 4).fill(wood);
  g.rect(-6, -9, 2, 1).fill(woodHi);
  g.rect(4, -9, 2, 1).fill(woodHi);

  // Backrest cushion — 8 wide × 6 tall, between the armrests.
  g.rect(-4, -11, 8, 6).fill(cushion);
  g.rect(-4, -11, 8, 1).fill(cushionHi);
  g.rect(-4, -11, 1, 6).fill(cushionShadow);
  g.rect(3, -11, 1, 6).fill(cushionShadow);
  g.rect(-4, -6, 8, 1).fill(cushionShadow); // seat-back transition shadow

  // Gold finial trim across the top of the backrest.
  g.rect(-3, -12, 6, 1).fill(trim);

  // Single decorative tuft (gold button) on the backrest centre.
  g.rect(-1, -8, 2, 1).fill(trim);
}

const onCryptFloor = (col: number, draw: (g: Graphics) => void): DecorationSpec => ({
  x: col * TILE_SIZE + 8,
  y: STAND_Y,
  draw,
});

const OLD_KEEP_CRYPT_DECORATIONS: DecorationSpec[] = [
  // Two armchairs flanking the tomb inscription (which sits at col 11).
  // Left chair faces right (toward the inscription), right chair faces
  // left. Together with the candles either side, the chamber reads as
  // a private reading nook around the tomb.
  onCryptFloor(7, drawArmchair),
  onCryptFloor(15, drawArmchair),
];

export const oldKeepCryptLevel: LevelSpec = {
  id: 'old-keep-crypt',
  name: 'The Crypt',
  rows: OLD_KEEP_CRYPT_ROWS,
  spawns: OLD_KEEP_CRYPT_SPAWNS,
  defaultSpawnId: 'from-keep',
  landmarks: OLD_KEEP_CRYPT_LANDMARKS,
  decorations: OLD_KEEP_CRYPT_DECORATIONS,
  parallax: 'keep',
  // Pure-black backdrop — darker than the keep's indoor-dark. The crypt
  // is meant to feel like a candle-lit hideout where you can't see the
  // back of the room. Walls of CryptBrick (opal) read as "almost-black
  // brick" against this; only the candles and armchair upholstery have
  // any warm colour at all.
  backdrop: 'crypt-black',
  rockBgStartRow: 0,
  createEntities(): readonly Entity[] {
    return [
      // Return door — back up to the keep's basement. Player exited from
      // the keep's descend door at basement col 8; coming back lands them
      // at the 'from-keep' spawn there (col 11).
      new Door({
        id: 'crypt-return-door',
        x: RETURN_DOOR_X,
        y: STAND_Y,
        targetLevelId: 'old-keep',
        targetSpawnId: 'from-crypt',
        promptLabel: 'ascend',
      }),
      // Two candles, one beside each armchair.
      new TallCandle(5 * TILE_SIZE + 8, STAND_Y),
      new TallCandle(17 * TILE_SIZE + 8, STAND_Y),
      // Iron chandelier hanging from the ceiling underside above the
      // tomb inscription (centre of the room). Anchored at its top
      // (chain attachment point) at the world Y of the ceiling
      // underside — the bottom of the last solid brick row = top of
      // the first interior row (row 18). Hangs ~10 px down into the
      // chamber, well above the player's head.
      new Chandelier(11 * TILE_SIZE + 8, 18 * TILE_SIZE),
    ];
  },
};
