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

// Render the whole tilemap into a single Graphics. Cheap for small levels;
// later we can switch to chunked rendering or a ParticleContainer if needed.
export function renderTilemap(map: Tilemap): Graphics {
  const g = new Graphics();
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const t = map.at(tx, ty);
      if (t === Tile.Empty) continue;
      const x = tx * TILE_SIZE;
      const y = ty * TILE_SIZE;
      g.rect(x, y, TILE_SIZE, TILE_SIZE).fill(TILE_COLORS[t]);

      // Grass: bright top edge for a crisp horizon line.
      if (t === Tile.Grass) {
        g.rect(x, y, TILE_SIZE, 1).fill(DB32.atlantis);
      }
    }
  }
  return g;
}
