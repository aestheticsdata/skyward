import { DB32 } from '@constants';
import type { LandmarkSpec } from '@entities/landmark';
import { Tilemap } from '@world/tilemap';
import type { Graphics } from 'pixi.js';

// Test level: 40 wide × 14 tall — two screens wide, one screen tall.
// Designed to exercise the camera (horizontal scroll) alongside collision.
//
//   - main grass floor with TWO gaps (cave entrances), one near the left,
//     one roughly in the middle, so falling through is reachable from spawn
//   - a few floating platforms at varying heights for jump testing
//   - stone caves of equal depth under both gaps, with the lower stone band
//     forming a sealed floor under everything (no falling out the bottom)
//   - dark stone deeper down for atmosphere
//
// Vertical extent stays at one screen for now; the camera supports both axes
// and will start scrolling vertically as soon as a level exceeds 14 rows.
//
// Legend (see CHAR_TO_TILE in tilemap.ts):
//   . sky / empty   G grass   D dirt   S stone   K dark stone
const TEST_LEVEL_ROWS = [
  '........................................',
  '........................................',
  '........................................',
  '.............GGG........GGG.............',
  '........................................',
  '........................................',
  '.....GGG..............GGG...............',
  '........................................',
  'GGGGGG..GGGGGGGGGGGG..GGGGGGGGGGGGGGGGGG',
  'DDDDDD..DDDDDDDDDDDD..DDDDDDDDDDDDDDDDDD',
  'SSSSSS..SSSSSSSSSSSS..SSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
  'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
  'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
] as const;

// Row index of the main outdoor floor. Used to place the player at spawn.
export const TEST_LEVEL_GRASS_ROW = 8;

// Landmarks for this level. One stone marker on the left grass platform
// (cols 5-7 on row 6). Player must jump up to discover it.
export const TEST_LEVEL_LANDMARKS: LandmarkSpec[] = [
  {
    id: 'stone-marker-01',
    x: 6 * 16 + 8, // centered on tile (col 6) of the platform
    y: 6 * 16, // sits on top of row 6 (the platform surface)
    name: 'Stone Marker',
    description: 'An old marker, carved with worn symbols. The carvings spiral upward — almost forming a face.',
    drawSketch(g: Graphics): void {
      // Enlarged version of the in-world landmark, drawn around (0, 0)
      // with positive y extending downward (base) and negative y upward (cap).
      g.rect(-10, 16, 20, 4).fill(DB32.oiledCedar); // base
      g.rect(-7, -20, 14, 36).fill(DB32.heather); // column
      g.rect(-10, -24, 20, 4).fill(DB32.lightSteel); // cap
      // Faint carved horizontal bands suggesting weathered glyphs.
      for (let i = 0; i < 4; i++) {
        g.rect(-4, -14 + i * 8, 8, 1).fill(DB32.dimGray);
      }
    },
  },
];

export function loadTestLevel(): Tilemap {
  return Tilemap.fromAscii(TEST_LEVEL_ROWS);
}
