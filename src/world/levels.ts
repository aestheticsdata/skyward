import { DB32, TILE_SIZE } from '@constants';
import type { DecorationSpec } from '@entities/decoration';
import type { LandmarkSpec } from '@entities/landmark';
import { Tilemap } from '@world/tilemap';

// Test level: 60 wide × 22 tall — three screens wide, ~1.6 screens tall.
// Exercises horizontal AND vertical camera scrolling, plus the underground.
//
// Asymmetric platform layout (three zones, three different patterns) avoids
// the boring left/right mirror symmetry the first draft had:
//
//   LEFT zone   (cols 0-19)  : row 6 (5-7) → row 3 (10-12). Jump up-RIGHT.
//   MIDDLE zone (cols 20-39) : row 6 (24-27, wider) → row 4 (29-31).
//                              Only 2 tiles up — easier hop.
//   RIGHT zone  (cols 40-59) : row 6 (47-49) → row 3 (43-45). Jump up-LEFT.
//
// The three row-6 platforms also have different widths (3, 4, 3) so the
// horizon doesn't repeat. Above each row-6 platform there's no vertical
// stack so straight-up jumps from row 6 are never blocked.
//
// Underground: three vertical shafts at the main-floor gaps (cols 6-7,
// 20-21, 42-43) lead down through stone to a wide cavern (rows 13-17).
// The cavern has a lake (Water tile, passable) in the middle of the floor.
// One additional landmark — Sunken Stone — sits inside the lake.
//
// Note on ascent: with current jump physics (max ≈ 64 px = 4 tiles), the
// player cannot easily climb back out of the cavern. The stepping stones
// at row 15 are visible features for atmosphere, not viable climbing
// platforms (they're not aligned with the shafts). Ascent will need
// dedicated mechanics (ladders, double jump, ledge grab) later.
//
// Legend (see CHAR_TO_TILE in tilemap.ts):
//   . sky / empty   G grass   D dirt   S stone   K dark stone   W water
const TEST_LEVEL_ROWS = [
  '............................................................', // 0
  '............................................................', // 1
  '............................................................', // 2
  '..........GGG..............................GGG..............', // 3
  '.............................GGG............................', // 4
  '...............................................GGG..........', // 5
  '.....GGG................GGGG................................', // 6
  '............................................................', // 7
  'GGGGGG..GGGGGGGGGGGG...GGGGGGGGGGGGGGGGGGG..GG..GGGGGGGGGGGG', // 8
  'DDDDDD..DDDDDDDDDDDD..DDDDDDDDDDDDDDDDDDDD..DDD..DDDDDDDDDDD', // 9
  'SSSSSS.SSSSSSSSSSSSS.SSSSSSSSSSSSSSSSSSSSS.SSS....SSSSSSSSSS', // 10
  'SSSSS...SSSSSSSSSSSS..SSSSSSSSSSSSSSSSSS...............SSSSS', // 11
  'SSSSSSS...SSSSSSSSS....SSSSSSSSSSSSSSSS........SSSSSSSSSSSSS', // 12
  'SSSSS....SSSSSSSSSSSS..SSSSSSSSSSSSSSSSSS....SSS..SSSSSSSSSS', // 13
  'SS........................................................SS', // 14
  'SS........SS................SS...........SSS..............SS', // 15
  'SS........................................................SS', // 16
  'SSSSSSSSSSSSSSWWWWWWWWWWWWWWWWWWSSSSSSSSSSSSSSS.........SSSS', // 17
  'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS....SSSSS', // 18
  'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK...KKKKKKK..KKKKKK', // 19
  'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK...............KKKKKK', // 20
  'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKWWWWWWWWKKKKKKKKK', // 21
  'KKKKKKKKKKKKKKKKKKKKKKKKKK..KKKKKKKKKKKKKKKWWWWWWKKKKKKKKKKK', // 21
  'KKKKKKKKKKKKKKKKKKKKKKKKKK...KKKKKKKKKKKKKKWWWWWWKKKKKKKKKKK', // 21
  'KKKKKKKKKKKK....KKKKKKKKK.........K...KKKKWWWWWWWWWKKKKKKKKK', // 21
  'KKKKKKKKKK.......KKKK......KKKKKKWWWWWWWWWWWWWWWKKKKKKKKKKKK', // 21
  'KKKKKKKKKK..KKK........KKKKKKKKKKKKKKKKKKWWWWWWWWKKKKKKKKKKK', // 21
  'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKWWWWWWWWWWKKKKKKKKKK', // 21
  'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKWWWWWWWWWWWWWWKKKKKKKKKKKK', // 21
  'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKWWWWWWWWWWWWKKKKKKKKKKK', // 21
  'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK', // 21
  'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK', // 21
] as const;

// Row index of the main outdoor floor. Used to place the player at spawn.
export const TEST_LEVEL_GRASS_ROW = 8;

// Standard ink color depending on discovered state for landmark bodies.
const inkFor = (discovered: boolean): number => (discovered ? DB32.opal : DB32.valhalla);

// ---------------------------------------------------------------------------
// Landmarks. Six total: five on the surface (spread across the asymmetric
// platform layout) plus one underground in the lake.
// ---------------------------------------------------------------------------

export const TEST_LEVEL_LANDMARKS: LandmarkSpec[] = [
  // 1) Old Cairn — main floor far left, near spawn.
  {
    id: 'old-cairn',
    x: 2 * 16 + 8,
    y: TEST_LEVEL_GRASS_ROW * 16,
    name: 'Old Cairn',
    description:
      'A stack of stones, placed with care. Each one chosen, each one balanced. ' +
      'No one remembers who built them, or why.',
    drawBody(g, discovered) {
      const ink = inkFor(discovered);
      const stone = discovered ? DB32.dimGray : DB32.heather;
      const stoneHi = discovered ? DB32.dimGray : DB32.lightSteel;
      g.rect(-5, -3, 10, 3).fill(stone);
      g.rect(-5, -3, 10, 1).fill(stoneHi);
      g.rect(-5, -3, 1, 3).fill(ink);
      g.rect(4, -3, 1, 3).fill(ink);
      g.rect(-5, -1, 10, 1).fill(ink);
      g.rect(-3, -6, 6, 3).fill(stone);
      g.rect(-3, -6, 6, 1).fill(stoneHi);
      g.rect(-3, -6, 1, 3).fill(ink);
      g.rect(2, -6, 1, 3).fill(ink);
      g.rect(-2, -9, 4, 3).fill(stone);
      g.rect(-2, -9, 4, 1).fill(stoneHi);
      g.rect(-2, -9, 1, 3).fill(ink);
      g.rect(1, -9, 1, 3).fill(ink);
      g.rect(-1, -10, 2, 1).fill(stoneHi);
    },
    drawSketch(g) {
      const stone = DB32.heather;
      const stoneHi = DB32.lightSteel;
      const ink = DB32.valhalla;
      g.rect(-22, 12, 44, 8).fill(stone).rect(-22, 12, 44, 1).fill(stoneHi);
      g.rect(-16, 0, 32, 12).fill(stone).rect(-16, 0, 32, 1).fill(stoneHi);
      g.rect(-12, -12, 24, 12).fill(stone).rect(-12, -12, 24, 1).fill(stoneHi);
      g.rect(-6, -22, 12, 10).fill(stoneHi);
      g.rect(-10, 4, 5, 1).fill(ink);
      g.rect(0, -6, 6, 1).fill(ink);
      g.rect(-5, 15, 8, 1).fill(ink);
    },
  },

  // 2) Stone Marker — LEFT zone, row 6 (cols 5-7).
  {
    id: 'stone-marker',
    x: 6 * 16 + 8,
    y: 6 * 16,
    name: 'Stone Marker',
    description: 'An old marker, carved with worn symbols. The carvings spiral upward — almost forming a face.',
    drawBody(g, discovered) {
      const ink = inkFor(discovered);
      const fill = discovered ? DB32.dimGray : DB32.pancho;
      const baseFill = discovered ? DB32.opal : DB32.oiledCedar;
      g.rect(-3, -2, 6, 2).fill(baseFill);
      g.rect(-3, -2, 6, 1).fill(ink);
      g.rect(-2, -14, 4, 12).fill(fill);
      g.rect(-2, -14, 4, 1).fill(ink);
      g.rect(-2, -3, 4, 1).fill(ink);
      g.rect(-2, -14, 1, 12).fill(ink);
      g.rect(1, -14, 1, 12).fill(ink);
      g.rect(-3, -16, 6, 2).fill(fill);
      g.rect(-3, -16, 6, 1).fill(ink);
      g.rect(-3, -16, 1, 2).fill(ink);
      g.rect(2, -16, 1, 2).fill(ink);
      g.rect(-1, -11, 2, 1).fill(ink);
      g.rect(-1, -7, 2, 1).fill(ink);
    },
    drawSketch(g) {
      g.rect(-10, 16, 20, 4).fill(DB32.oiledCedar);
      g.rect(-7, -20, 14, 36).fill(DB32.heather);
      g.rect(-10, -24, 20, 4).fill(DB32.lightSteel);
      for (let i = 0; i < 4; i++) {
        g.rect(-4, -14 + i * 8, 8, 1).fill(DB32.dimGray);
      }
    },
  },

  // 3) Ruined Arch — LEFT zone, row 3 (cols 10-12). Reached via Stone Marker.
  {
    id: 'ruined-arch',
    x: 11 * 16 + 8,
    y: 3 * 16,
    name: 'Ruined Arch',
    description:
      "What's left of a doorway, half sunken into the soil. " +
      "The other half is gone. You can't tell what was once on the other side.",
    drawBody(g, discovered) {
      const ink = inkFor(discovered);
      const stone = discovered ? DB32.dimGray : DB32.heather;
      const stoneHi = discovered ? DB32.dimGray : DB32.lightSteel;
      g.rect(-5, -10, 2, 10).fill(stone);
      g.rect(-5, -10, 2, 1).fill(stoneHi);
      g.rect(-5, -10, 1, 10).fill(ink);
      g.rect(-4, -10, 1, 1).fill(ink);
      g.rect(-5, -1, 2, 1).fill(ink);
      g.rect(3, -10, 2, 10).fill(stone);
      g.rect(3, -10, 2, 1).fill(stoneHi);
      g.rect(4, -10, 1, 10).fill(ink);
      g.rect(3, -10, 1, 1).fill(ink);
      g.rect(3, -1, 2, 1).fill(ink);
      g.rect(-5, -12, 3, 2).fill(stone);
      g.rect(-5, -12, 3, 1).fill(stoneHi);
      g.rect(-5, -12, 1, 2).fill(ink);
      g.rect(2, -12, 3, 2).fill(stone);
      g.rect(2, -12, 3, 1).fill(stoneHi);
      g.rect(4, -12, 1, 2).fill(ink);
      g.rect(-1, -1, 2, 1).fill(stone);
    },
    drawSketch(g) {
      const stone = DB32.heather;
      const stoneHi = DB32.lightSteel;
      const ink = DB32.valhalla;
      g.rect(-22, -16, 8, 36).fill(stone).rect(-22, -16, 8, 1).fill(stoneHi);
      g.rect(14, -16, 8, 36).fill(stone).rect(14, -16, 8, 1).fill(stoneHi);
      g.rect(-22, -22, 12, 6).fill(stone).rect(-22, -22, 12, 1).fill(stoneHi);
      g.rect(10, -22, 12, 6).fill(stone).rect(10, -22, 12, 1).fill(stoneHi);
      g.rect(-18, -10, 1, 12).fill(ink);
      g.rect(18, -8, 1, 14).fill(ink);
      g.rect(-8, 18, 4, 2).fill(stone);
      g.rect(2, 19, 5, 1).fill(stone);
    },
  },

  // 4) Hollow Tree — MIDDLE zone, row 6 (cols 24-27, 4 wide).
  {
    id: 'hollow-tree',
    x: 25 * 16 + 8,
    y: 6 * 16,
    name: 'Hollow Tree',
    description:
      'A trunk hollowed out by time. Inside, the air smells of old paper. ' +
      'Someone — or something — was here recently. Or perhaps very long ago.',
    drawBody(g, discovered) {
      const ink = inkFor(discovered);
      const wood = discovered ? DB32.dimGray : DB32.oiledCedar;
      const woodHi = discovered ? DB32.heather : DB32.rope;
      const cavity = DB32.valhalla;
      g.rect(-4, -13, 8, 13).fill(wood);
      g.rect(-4, -13, 8, 1).fill(woodHi);
      g.rect(-4, -13, 1, 13).fill(ink);
      g.rect(3, -13, 1, 13).fill(ink);
      g.rect(-2, -9, 4, 5).fill(cavity);
      g.rect(-2, -9, 4, 1).fill(ink);
      g.rect(-2, -5, 4, 1).fill(ink);
      g.rect(-5, -2, 10, 2).fill(wood);
      g.rect(-5, -2, 10, 1).fill(ink);
      g.rect(-5, -2, 1, 2).fill(ink);
      g.rect(4, -2, 1, 2).fill(ink);
      g.rect(-3, -11, 1, 1).fill(ink);
      g.rect(2, -7, 1, 1).fill(ink);
    },
    drawSketch(g) {
      const wood = DB32.oiledCedar;
      const woodHi = DB32.rope;
      const cavity = DB32.valhalla;
      const ink = DB32.valhalla;
      g.rect(-14, -28, 28, 44).fill(wood);
      g.rect(-14, -28, 28, 2).fill(woodHi);
      g.rect(-20, 12, 40, 8).fill(wood);
      g.rect(-20, 12, 40, 2).fill(woodHi);
      g.rect(-8, -14, 16, 22).fill(cavity);
      g.rect(-8, -14, 16, 2).fill(ink);
      for (let i = 0; i < 4; i++) {
        g.rect(-12, -20 + i * 8, 4, 1).fill(ink);
        g.rect(8, -20 + i * 8, 4, 1).fill(ink);
      }
    },
  },

  // 5) Crystal Vein — RIGHT zone, row 3 (cols 43-45). Player jumps up-LEFT
  //    from row-6 platform (cols 47-49) to reach this.
  {
    id: 'crystal-vein',
    x: 44 * 16 + 8,
    y: 3 * 16,
    name: 'Crystal Vein',
    description:
      'A vein of pale blue crystal, breaking through the soil. They hum faintly when you stand close — ' +
      'just on the edge of being heard.',
    drawBody(g, discovered) {
      const ink = inkFor(discovered);
      const cLight = discovered ? DB32.heather : DB32.viking;
      const cMid = discovered ? DB32.dimGray : DB32.cornflower;
      const cDark = discovered ? DB32.opal : DB32.venice;
      const baseStone = discovered ? DB32.dimGray : DB32.heather;
      g.rect(-4, -2, 8, 2).fill(baseStone);
      g.rect(-4, -2, 8, 1).fill(ink);
      g.rect(-1, -12, 2, 1).fill(cDark);
      g.rect(-1, -11, 2, 1).fill(cMid);
      g.rect(-2, -10, 4, 6).fill(cLight);
      g.rect(-2, -10, 1, 6).fill(cMid);
      g.rect(1, -10, 1, 6).fill(cMid);
      g.rect(-2, -4, 4, 1).fill(cMid);
      g.rect(2, -6, 1, 1).fill(cDark);
      g.rect(2, -5, 2, 3).fill(cLight);
      g.rect(2, -5, 2, 1).fill(cMid);
      g.rect(-4, -4, 1, 1).fill(cMid);
      g.rect(-4, -3, 2, 1).fill(cLight);
    },
    drawSketch(g) {
      const cLight = DB32.viking;
      const cMid = DB32.cornflower;
      const cDark = DB32.venice;
      const baseStone = DB32.heather;
      const ink = DB32.valhalla;
      g.rect(-22, 12, 44, 8).fill(baseStone);
      g.rect(-22, 12, 44, 1).fill(DB32.lightSteel);
      g.rect(-22, 19, 44, 1).fill(ink);
      g.rect(-4, -24, 8, 4).fill(cDark);
      g.rect(-8, -20, 16, 8).fill(cMid);
      g.rect(-10, -12, 20, 20).fill(cLight);
      g.rect(-10, -12, 20, 1).fill(DB32.white);
      g.rect(-2, -22, 1, 28).fill(cMid);
      g.rect(2, -22, 1, 28).fill(cDark);
      g.rect(10, -8, 5, 5).fill(cDark);
      g.rect(8, -3, 9, 14).fill(cLight);
      g.rect(8, -3, 9, 1).fill(DB32.white);
    },
  },

  // 6) Sunken Stone — UNDERGROUND, sitting on the cavern floor in the lake.
  //    Row 18 col 23 (under the water at row 17 cols 14-31). The first
  //    landmark the player can only reach by going DOWN.
  {
    id: 'sunken-stone',
    x: 23 * 16 + 8,
    y: 18 * 16,
    name: 'Sunken Stone',
    description:
      'A worn obelisk standing knee-deep in still water. Its surface is covered in tiny scratches — ' +
      'too regular to be erosion, too faint to read.',
    drawBody(g, discovered) {
      const ink = inkFor(discovered);
      const stone = discovered ? DB32.dimGray : DB32.lightSteel;
      const stoneHi = discovered ? DB32.heather : DB32.white;
      // Tall narrow obelisk poking out of the water.
      g.rect(-2, -14, 4, 14).fill(stone);
      g.rect(-2, -14, 4, 1).fill(stoneHi);
      g.rect(-2, -14, 1, 14).fill(ink);
      g.rect(1, -14, 1, 14).fill(ink);
      // Tip taper (1px narrower at top).
      g.rect(-1, -16, 2, 2).fill(stone);
      g.rect(-1, -16, 2, 1).fill(stoneHi);
      // Faint scratch marks.
      g.rect(-1, -11, 2, 1).fill(ink);
      g.rect(-1, -7, 2, 1).fill(ink);
      g.rect(-1, -4, 2, 1).fill(ink);
    },
    drawSketch(g) {
      const stone = DB32.lightSteel;
      const stoneHi = DB32.white;
      const ink = DB32.valhalla;
      const water = DB32.venice;
      // Tall obelisk.
      g.rect(-8, -28, 16, 44).fill(stone);
      g.rect(-8, -28, 16, 2).fill(stoneHi);
      g.rect(-4, -34, 8, 6).fill(stone);
      g.rect(-4, -34, 8, 2).fill(stoneHi);
      // Water at its base.
      g.rect(-24, 16, 48, 6).fill(water);
      g.rect(-24, 16, 48, 1).fill(DB32.cornflower);
      // Scratch marks all along the obelisk.
      for (let i = 0; i < 6; i++) {
        g.rect(-4, -22 + i * 6, 8, 1).fill(ink);
      }
    },
  },
];

// ---------------------------------------------------------------------------
// Decoration drawing functions. All draw at origin (0, 0) with the visible
// base on the y=0 line, extending upward into negative y.
// ---------------------------------------------------------------------------

function drawSmallTree(g: import('pixi.js').Graphics): void {
  const trunk = DB32.oiledCedar;
  const leafMid = DB32.eltGreen;
  const leafLight = DB32.atlantis;
  const leafDark = DB32.dell;
  // Trunk.
  g.rect(-1, -6, 2, 6).fill(trunk);
  // Canopy (round-ish, three stacked rectangles narrowing toward the top).
  g.rect(-4, -10, 8, 4).fill(leafMid);
  g.rect(-3, -13, 6, 3).fill(leafMid);
  g.rect(-2, -15, 4, 2).fill(leafMid);
  // Highlights and shadows.
  g.rect(-2, -15, 4, 1).fill(leafLight);
  g.rect(-3, -13, 1, 1).fill(leafLight);
  g.rect(2, -13, 1, 1).fill(leafLight);
  g.rect(-4, -7, 8, 1).fill(leafDark);
}

function drawPineTree(g: import('pixi.js').Graphics): void {
  const trunk = DB32.oiledCedar;
  const leafMid = DB32.dell;
  const leafLight = DB32.eltGreen;
  // Trunk.
  g.rect(-1, -6, 2, 6).fill(trunk);
  // Three tiers of triangular canopy, narrowing toward the top.
  g.rect(-5, -10, 10, 4).fill(leafMid);
  g.rect(-5, -10, 10, 1).fill(leafLight);
  g.rect(-4, -14, 8, 4).fill(leafMid);
  g.rect(-4, -14, 8, 1).fill(leafLight);
  g.rect(-3, -18, 6, 4).fill(leafMid);
  g.rect(-3, -18, 6, 1).fill(leafLight);
  g.rect(-1, -19, 2, 1).fill(leafLight);
}

// Big oak — 14 wide × 22 tall, the most imposing of the three. Thick trunk
// with a root flare, plus a four-tier rounded canopy.
function drawTallOak(g: import('pixi.js').Graphics): void {
  const trunk = DB32.oiledCedar;
  const trunkHi = DB32.rope;
  const leafMid = DB32.eltGreen;
  const leafLight = DB32.atlantis;
  const leafDark = DB32.dell;

  // Trunk — 4 px wide, 8 px tall.
  g.rect(-2, -8, 4, 8).fill(trunk);
  // Highlight along the left edge for a sense of light direction.
  g.rect(-2, -8, 1, 8).fill(trunkHi);
  // Root flare — 1 row wider than the trunk at ground level.
  g.rect(-3, -1, 6, 1).fill(trunk);

  // Canopy in four tiers: widest at the bottom, narrowing toward the crown.
  // Bottom tier — 14 wide.
  g.rect(-7, -12, 14, 4).fill(leafMid);
  g.rect(-7, -12, 14, 1).fill(leafLight);
  // Bottom-of-canopy shadow band.
  g.rect(-7, -9, 14, 1).fill(leafDark);

  // Middle tier — 12 wide.
  g.rect(-6, -16, 12, 4).fill(leafMid);
  g.rect(-6, -16, 12, 1).fill(leafLight);

  // Upper tier — 8 wide.
  g.rect(-4, -20, 8, 4).fill(leafMid);
  g.rect(-4, -20, 8, 1).fill(leafLight);

  // Crown — 4 wide.
  g.rect(-2, -22, 4, 2).fill(leafMid);
  g.rect(-2, -22, 4, 1).fill(leafLight);
}

// Giant tree — 18 wide × 30 tall, an ancient landmark-sized oak. Tapered
// trunk (wider at the base), root flare, knot detail, and a five-tier
// rounded canopy that reaches above row-6 platforms.
function drawGiantTree(g: import('pixi.js').Graphics): void {
  const trunk = DB32.oiledCedar;
  const trunkHi = DB32.rope;
  const trunkShadow = DB32.loulou;
  const leafMid = DB32.eltGreen;
  const leafLight = DB32.atlantis;
  const leafDark = DB32.dell;

  // Trunk in two segments: 6-wide base + 4-wide upper, giving a slight
  // taper that reads as "this thing has been here a long time."
  g.rect(-3, -6, 6, 6).fill(trunk);
  g.rect(-3, -6, 1, 6).fill(trunkHi);
  g.rect(-2, -12, 4, 6).fill(trunk);
  g.rect(-2, -12, 1, 6).fill(trunkHi);
  // Single dark knot near the middle of the upper trunk.
  g.rect(0, -8, 2, 1).fill(trunkShadow);
  // Root flare — 8 wide, 1 tall at ground level.
  g.rect(-4, -1, 8, 1).fill(trunk);

  // Canopy in five tiers. Bottom row carries a shadow band so the bottom
  // edge doesn't blend into the row directly under it.
  // Bottom tier — 18 wide (the widest of any tree in this level).
  g.rect(-9, -16, 18, 4).fill(leafMid);
  g.rect(-9, -16, 18, 1).fill(leafLight);
  g.rect(-9, -13, 18, 1).fill(leafDark);

  // Second tier — 16 wide.
  g.rect(-8, -20, 16, 4).fill(leafMid);
  g.rect(-8, -20, 16, 1).fill(leafLight);

  // Third tier — 14 wide.
  g.rect(-7, -24, 14, 4).fill(leafMid);
  g.rect(-7, -24, 14, 1).fill(leafLight);

  // Fourth tier — 10 wide.
  g.rect(-5, -28, 10, 4).fill(leafMid);
  g.rect(-5, -28, 10, 1).fill(leafLight);

  // Crown — 6 wide.
  g.rect(-3, -30, 6, 2).fill(leafMid);
  g.rect(-3, -30, 6, 1).fill(leafLight);
}

function drawBush(g: import('pixi.js').Graphics): void {
  const leafMid = DB32.eltGreen;
  const leafLight = DB32.atlantis;
  const leafDark = DB32.dell;
  g.rect(-3, -4, 6, 4).fill(leafMid);
  g.rect(-3, -4, 6, 1).fill(leafLight);
  g.rect(-4, -2, 1, 2).fill(leafMid);
  g.rect(3, -2, 1, 2).fill(leafMid);
  g.rect(-3, -1, 6, 1).fill(leafDark);
}

function drawBoulder(g: import('pixi.js').Graphics): void {
  const stone = DB32.heather;
  const stoneHi = DB32.lightSteel;
  const ink = DB32.valhalla;
  g.rect(-3, -5, 6, 5).fill(stone);
  g.rect(-3, -5, 6, 1).fill(stoneHi);
  g.rect(-3, -5, 1, 5).fill(ink);
  g.rect(2, -5, 1, 5).fill(ink);
  g.rect(-3, -1, 6, 1).fill(ink);
  g.rect(0, -3, 1, 1).fill(ink);
}

function drawPebbles(g: import('pixi.js').Graphics): void {
  const stone = DB32.heather;
  const stoneHi = DB32.lightSteel;
  g.rect(-2, -2, 2, 2).fill(stone);
  g.rect(-2, -2, 2, 1).fill(stoneHi);
  g.rect(0, -1, 2, 1).fill(stone);
}

function drawMushroom(g: import('pixi.js').Graphics): void {
  const cap = DB32.clairvoyant;
  const stem = DB32.pancho;
  // Stem.
  g.rect(-1, -2, 2, 2).fill(stem);
  // Cap (slightly wider than the stem, with a tiny dome on top).
  g.rect(-3, -4, 6, 2).fill(cap);
  g.rect(-2, -5, 4, 1).fill(cap);
  // White spots on the cap — classic mushroom motif.
  g.rect(-2, -4, 1, 1).fill(DB32.lightSteel);
  g.rect(1, -3, 1, 1).fill(DB32.lightSteel);
}

// Convenience constructors for placing decorations on a tile row.
const onGrass = (col: number, draw: (g: import('pixi.js').Graphics) => void): DecorationSpec => ({
  x: col * TILE_SIZE + 8,
  y: TEST_LEVEL_GRASS_ROW * TILE_SIZE,
  draw,
});

const inCavern = (col: number, row: number, draw: (g: import('pixi.js').Graphics) => void): DecorationSpec => ({
  x: col * TILE_SIZE + 8,
  y: row * TILE_SIZE,
  draw,
});

// ---------------------------------------------------------------------------
// Decorations. Placement principles:
//   - Spread along the surface so the camera sees something on every screen.
//   - Don't sit on the same tile as a landmark (landmark already fills it).
//   - Underground mushrooms only on the stone parts of row 17 (not in the
//     lake, where row 17 is water).
// ---------------------------------------------------------------------------
export const TEST_LEVEL_DECORATIONS: DecorationSpec[] = [
  // Surface — left half
  onGrass(14, drawSmallTree),
  onGrass(16, drawBush),
  onGrass(18, drawGiantTree),

  // Surface — middle
  onGrass(28, drawTallOak),
  onGrass(33, drawBush),
  onGrass(36, drawBoulder),

  // Surface — right half
  onGrass(39, drawGiantTree),
  onGrass(45, drawPineTree),
  onGrass(48, drawSmallTree),
  onGrass(53, drawTallOak),
  onGrass(57, drawPebbles),

  // Underground — mushrooms on the stone parts of the cavern floor
  inCavern(3, 17, drawMushroom),
  inCavern(8, 17, drawMushroom),
  inCavern(11, 17, drawPebbles),
  inCavern(35, 17, drawMushroom),
  inCavern(40, 17, drawPebbles),
  inCavern(45, 17, drawMushroom),
  // inCavern(53, 17, drawMushroom),
];

export function loadTestLevel(): Tilemap {
  return Tilemap.fromAscii(TEST_LEVEL_ROWS);
}
