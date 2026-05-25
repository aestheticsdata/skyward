import { DB32, TILE_SIZE } from '@constants';
import { Graphics } from 'pixi.js';

// Tile type. Uses a const object (not enum) so it plays nicely with
// `isolatedModules` in tsconfig.
export const Tile = {
  Empty: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  DarkStone: 4,
} as const;

export type Tile = (typeof Tile)[keyof typeof Tile];

// Characters used in ASCII level data.
const CHAR_TO_TILE: Record<string, Tile> = {
  '.': Tile.Empty,
  G: Tile.Grass,
  D: Tile.Dirt,
  S: Tile.Stone,
  K: Tile.DarkStone,
};

const TILE_COLORS: Record<Tile, number> = {
  [Tile.Empty]: 0,
  [Tile.Grass]: DB32.eltGreen,
  [Tile.Dirt]: DB32.oiledCedar,
  [Tile.Stone]: DB32.heather,
  [Tile.DarkStone]: DB32.topaz,
};

export class Tilemap {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly Tile[];

  constructor(width: number, height: number, tiles: readonly Tile[]) {
    this.width = width;
    this.height = height;
    this.tiles = tiles;
  }

  // Build a tilemap from human-readable ASCII rows (see CHAR_TO_TILE legend).
  // Throws if rows are ragged or contain unknown characters — fail-fast at boot.
  static fromAscii(rows: readonly string[]): Tilemap {
    const height = rows.length;
    const width = rows[0]?.length ?? 0;
    const tiles: Tile[] = [];
    for (let y = 0; y < height; y++) {
      const row = rows[y];
      if (row == null || row.length !== width) {
        throw new Error(`Tilemap row ${y} has length ${row?.length ?? 0}, expected ${width}`);
      }
      for (let x = 0; x < width; x++) {
        const ch = row[x];
        const t = CHAR_TO_TILE[ch];
        if (t === undefined) {
          throw new Error(`Unknown tile char '${ch}' at (${x}, ${y})`);
        }
        tiles.push(t);
      }
    }
    return new Tilemap(width, height, tiles);
  }

  at(tx: number, ty: number): Tile {
    if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) {
      return Tile.Empty;
    }
    return this.tiles[ty * this.width + tx];
  }

  // Out-of-bounds tiles are treated as solid so every level has implicit walls.
  // (`at()` still returns Empty for OOB — that's a renderer concern; collision
  // uses this method instead.)
  isSolid(tx: number, ty: number): boolean {
    if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) {
      return true;
    }
    return this.tiles[ty * this.width + tx] !== Tile.Empty;
  }
}

// Stable per-tile pseudo-random in [0, 1). Different tiles get reproducibly
// different decoration patterns — we want a stone block to look the same every
// time the level renders, never animated by frame.
function tileHash(tx: number, ty: number, salt: number): number {
  const n = (tx * 374761393 + ty * 668265263 + salt * 1274126177) | 0;
  // Knuth multiplicative hash; final `>>> 0` keeps it unsigned, divide for [0,1).
  return (((n ^ (n >>> 13)) * 1274126177) >>> 0) / 0xffffffff;
}

// Render the whole tilemap into a single Graphics. Cheap for small levels;
// later we can switch to chunked rendering or a ParticleContainer if needed.
//
// Visual language: solid base fill, then 1-pixel highlight/shadow edges, then
// a small amount of tile-stable detail (tufts on grass, speckles on dirt,
// cracks on stone). Avoids strokes (which sub-pixel anti-alias) — every mark
// is a `rect(...).fill(...)` so it lands on the logical pixel grid.
export function renderTilemap(map: Tilemap): Graphics {
  const g = new Graphics();
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const t = map.at(tx, ty);
      if (t === Tile.Empty) continue;
      const x = tx * TILE_SIZE;
      const y = ty * TILE_SIZE;
      drawTile(g, t, x, y, tx, ty);
    }
  }
  return g;
}

function drawTile(g: Graphics, t: Tile, x: number, y: number, tx: number, ty: number): void {
  // Base fill — every tile starts with this.
  g.rect(x, y, TILE_SIZE, TILE_SIZE).fill(TILE_COLORS[t]);

  switch (t) {
    case Tile.Grass:
      drawGrass(g, x, y, tx, ty);
      break;
    case Tile.Dirt:
      drawDirt(g, x, y, tx, ty);
      break;
    case Tile.Stone:
      drawStone(g, x, y, tx, ty);
      break;
    case Tile.DarkStone:
      drawDarkStone(g, x, y, tx, ty);
      break;
  }
}

function drawGrass(g: Graphics, x: number, y: number, tx: number, ty: number): void {
  // Bright top line — the horizon-marker that reads as "this is the surface."
  g.rect(x, y, TILE_SIZE, 1).fill(DB32.atlantis);

  // A few short tufts standing up off the top edge. Position and count are
  // stable per tile (no jitter across frames). Tufts only render if there's
  // empty space above — they shouldn't poke into the next tile up.
  const tuftCount = tileHash(tx, ty, 1) < 0.5 ? 2 : 3;
  for (let i = 0; i < tuftCount; i++) {
    const tx0 = Math.floor(tileHash(tx, ty, 10 + i) * (TILE_SIZE - 2)) + 1;
    g.rect(x + tx0, y - 1, 1, 1).fill(DB32.atlantis);
  }

  // Sparse wildflowers — roughly 1 grass tile in 5 grows one. The flower is
  // a 2-pixel green stem rising off the grass with a 1- or 2-pixel red petal
  // head on top (50/50 between the two head sizes). Position and shape are
  // hash-stable per tile so they don't shimmer as the camera moves.
  if (tileHash(tx, ty, 100) < 0.2) {
    // Leave 1 px of margin so a 2-wide petal head still fits inside the tile.
    const fx = 1 + Math.floor(tileHash(tx, ty, 101) * (TILE_SIZE - 2));
    // Stem (2 px tall, rising off the grass).
    g.rect(x + fx, y - 1, 1, 1).fill(DB32.eltGreen);
    g.rect(x + fx, y - 2, 1, 1).fill(DB32.eltGreen);
    // Petal head: always 1 px directly above the stem, plus an optional second
    // px next to it.
    g.rect(x + fx, y - 3, 1, 1).fill(DB32.clairvoyant);
    if (tileHash(tx, ty, 102) < 0.5) {
      g.rect(x + fx + 1, y - 3, 1, 1).fill(DB32.clairvoyant);
    }
  }
}

function drawDirt(g: Graphics, x: number, y: number, tx: number, ty: number): void {
  // A handful of darker speckles scattered across the tile. Two layers of
  // depth: a darker brown and a slightly lighter accent.
  for (let i = 0; i < 4; i++) {
    const sx = Math.floor(tileHash(tx, ty, 20 + i) * (TILE_SIZE - 2)) + 1;
    const sy = Math.floor(tileHash(tx, ty, 30 + i) * (TILE_SIZE - 2)) + 1;
    g.rect(x + sx, y + sy, 1, 1).fill(DB32.loulou);
  }
}

function drawStone(g: Graphics, x: number, y: number, _tx: number, _ty: number): void {
  // Top highlight + bottom shadow — gives volume without needing a real outline.
  // The body of the stone tile stays clean; the cracks we used to scatter here
  // were too noisy and broke the calm-band look between dirt and bedrock.
  g.rect(x, y, TILE_SIZE, 1).fill(DB32.lightSteel);
  g.rect(x, y + TILE_SIZE - 1, TILE_SIZE, 1).fill(DB32.dimGray);
}

function drawDarkStone(g: Graphics, x: number, y: number, tx: number, ty: number): void {
  // Subtle speckle — dark stone is meant to read as deep background, not as
  // a place the player is meant to look at. Keep the detail very sparse.
  for (let i = 0; i < 2; i++) {
    const sx = Math.floor(tileHash(tx, ty, 50 + i) * (TILE_SIZE - 2)) + 1;
    const sy = Math.floor(tileHash(tx, ty, 60 + i) * (TILE_SIZE - 2)) + 1;
    g.rect(x + sx, y + sy, 1, 1).fill(DB32.opal);
  }
}
