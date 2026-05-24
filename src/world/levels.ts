import { Tilemap } from '@world/tilemap';

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

export function loadTestLevel(): Tilemap {
  return Tilemap.fromAscii(TEST_LEVEL_ROWS);
}
