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
  Water: 5,
} as const;

export type Tile = (typeof Tile)[keyof typeof Tile];

// Characters used in ASCII level data.
const CHAR_TO_TILE: Record<string, Tile> = {
  '.': Tile.Empty,
  G: Tile.Grass,
  D: Tile.Dirt,
  S: Tile.Stone,
  K: Tile.DarkStone,
  W: Tile.Water,
};

const TILE_COLORS: Record<Tile, number> = {
  [Tile.Empty]: 0,
  [Tile.Grass]: DB32.eltGreen,
  [Tile.Dirt]: DB32.oiledCedar,
  [Tile.Stone]: DB32.heather,
  [Tile.DarkStone]: DB32.topaz,
  [Tile.Water]: DB32.venice,
};

// Solid tiles block movement. Water is intentionally NOT solid — we want the
// player to wade through it (no death, no swimming for now; pure visual).
const TILE_SOLID: Record<Tile, boolean> = {
  [Tile.Empty]: false,
  [Tile.Grass]: true,
  [Tile.Dirt]: true,
  [Tile.Stone]: true,
  [Tile.DarkStone]: true,
  [Tile.Water]: false,
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
  // Inside the level, solidity comes from TILE_SOLID (Water is passable).
  isSolid(tx: number, ty: number): boolean {
    if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) {
      return true;
    }
    return TILE_SOLID[this.tiles[ty * this.width + tx]];
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

// Render the static tilemap (everything except water) into a single Graphics.
// Water is excluded here and rendered separately by `renderWater()` so the
// game loop can animate it (1-px bob).
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
      if (t === Tile.Empty || t === Tile.Water) continue;
      const x = tx * TILE_SIZE;
      const y = ty * TILE_SIZE;
      drawTile(g, t, x, y, tx, ty);
    }
  }
  return g;
}

// Static body of every water tile. Never animated — the bottom of the lake.
// Called once at scene setup.
export function renderWaterBody(map: Tilemap): Graphics {
  const g = new Graphics();
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (map.at(tx, ty) !== Tile.Water) continue;
      const x = tx * TILE_SIZE;
      const y = ty * TILE_SIZE;
      const bodyTop = y + STATIC_BODY_TOP_OFFSET;
      g.rect(x, bodyTop, TILE_SIZE, y + TILE_SIZE - bodyTop).fill(TILE_COLORS[Tile.Water]);
    }
  }
  return g;
}

// Solid-rock backdrop for the underground portion of the level. Renders
// behind the tilemap inside the world container, so any cave interior or
// shaft opening reveals rock instead of the cornflower sky / parallax
// mountains that would otherwise show through.
//
// Visually: a dark base fill peppered with hash-stable speckles in two
// shades. The speckles add texture so the rock face doesn't read as a flat
// wall of paint, and because they're hash-derived they stay put as the
// camera moves (no shimmer).
export function renderRockBackground(width: number, startY: number, endY: number): Graphics {
  const g = new Graphics();
  // Base "rock" color — `verdigris` (a neutral medium-dark gray) rather than
  // `opal`. Opal is the color of the foreground parallax mountain, so the
  // backdrop would visually merge into the mountain whenever both appeared
  // in the same view. Verdigris is one notch lighter and slightly warmer,
  // keeping the layers distinct.
  g.rect(0, startY, width, endY - startY).fill(DB32.verdigris);

  // Speckle pattern. Two density bands give a couple of shades, which reads
  // as mineral grain rather than dust. Pure rect() — pixel-perfect, no
  // strokes or anti-aliasing.
  for (let y = startY; y < endY; y++) {
    for (let x = 0; x < width; x++) {
      const n = (x * 374761393 + y * 668265263) | 0;
      const h = (((n ^ (n >>> 13)) * 1274126177) >>> 0) / 0xffffffff;
      if (h < 0.008) {
        g.rect(x, y, 1, 1).fill(DB32.dimGray);
      } else if (h < 0.016) {
        g.rect(x, y, 1, 1).fill(DB32.opal);
      }
    }
  }
  return g;
}

// Animated water surface — the highlight + sheen strip that ripples while
// the player is in the water. Rebuilt each frame into the SAME Graphics so
// the bottom-of-lake static body never moves.
//
// `surfaceOffset` is in pixels: 0 = rest, negative = surface lifted (ripple
// up), positive = surface dipped (ripple down). Always rounded to an integer
// by the caller so the surface stays on the pixel grid.
//
// The animated strip extends from `sy` down to the static body top, so as
// the surface moves up, the visible water grows by the offset (filler is
// the same color as the static body). No gap ever appears between strip
// and body.
export function renderWaterSurfaceInto(g: Graphics, map: Tilemap, surfaceOffset: number): void {
  g.clear();
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (map.at(tx, ty) !== Tile.Water) continue;
      const x = tx * TILE_SIZE;
      const y = ty * TILE_SIZE;
      const sy = y + WATER_REST_DEPRESSION + surfaceOffset;
      const bodyTop = y + STATIC_BODY_TOP_OFFSET;
      // Surface highlight (the lit "meniscus" line).
      g.rect(x, sy, TILE_SIZE, 1).fill(DB32.cornflower);
      // Darker sheen one pixel below.
      g.rect(x, sy + 1, TILE_SIZE, 1).fill(DB32.royalBlue);
      // Filler down to the static body — same color as body, so the union
      // of (surface + static body) reads as a single seamless pool.
      if (bodyTop > sy + 2) {
        g.rect(x, sy + 2, TILE_SIZE, bodyTop - (sy + 2)).fill(TILE_COLORS[Tile.Water]);
      }
      // Tile-stable sparkle. Attached to the surface so it rides the bob.
      if (tileHash(tx, ty, 200) < 0.3) {
        const sx = 2 + Math.floor(tileHash(tx, ty, 201) * (TILE_SIZE - 4));
        g.rect(x + sx, sy + 2, 1, 1).fill(DB32.lightSteel);
      }
    }
  }
}

function drawTile(g: Graphics, t: Tile, x: number, y: number, tx: number, ty: number): void {
  // Base fill — every non-empty tile starts with this. (Water is excluded by
  // the caller in renderTilemap; it has its own renderer.)
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
  // stable per tile (no jitter across frames).
  const tuftCount = tileHash(tx, ty, 1) < 0.5 ? 2 : 3;
  for (let i = 0; i < tuftCount; i++) {
    const tx0 = Math.floor(tileHash(tx, ty, 10 + i) * (TILE_SIZE - 2)) + 1;
    g.rect(x + tx0, y - 1, 1, 1).fill(DB32.atlantis);
  }

  // Sparse wildflowers — roughly 1 grass tile in 5 grows one. A 2-pixel green
  // stem with a 1- or 2-pixel red petal head on top.
  if (tileHash(tx, ty, 100) < 0.2) {
    const fx = 1 + Math.floor(tileHash(tx, ty, 101) * (TILE_SIZE - 2));
    g.rect(x + fx, y - 1, 1, 1).fill(DB32.eltGreen);
    g.rect(x + fx, y - 2, 1, 1).fill(DB32.eltGreen);
    g.rect(x + fx, y - 3, 1, 1).fill(DB32.clairvoyant);
    if (tileHash(tx, ty, 102) < 0.5) {
      g.rect(x + fx + 1, y - 3, 1, 1).fill(DB32.clairvoyant);
    }
  }
}

function drawDirt(g: Graphics, x: number, y: number, tx: number, ty: number): void {
  // A handful of darker speckles scattered across the tile.
  for (let i = 0; i < 4; i++) {
    const sx = Math.floor(tileHash(tx, ty, 20 + i) * (TILE_SIZE - 2)) + 1;
    const sy = Math.floor(tileHash(tx, ty, 30 + i) * (TILE_SIZE - 2)) + 1;
    g.rect(x + sx, y + sy, 1, 1).fill(DB32.loulou);
  }
}

function drawStone(g: Graphics, x: number, y: number, _tx: number, _ty: number): void {
  // Top highlight + bottom shadow — gives volume without needing a real outline.
  g.rect(x, y, TILE_SIZE, 1).fill(DB32.lightSteel);
  g.rect(x, y + TILE_SIZE - 1, TILE_SIZE, 1).fill(DB32.dimGray);
}

function drawDarkStone(g: Graphics, x: number, y: number, tx: number, ty: number): void {
  // Subtle speckle — dark stone reads as deep background, not a focus area.
  for (let i = 0; i < 2; i++) {
    const sx = Math.floor(tileHash(tx, ty, 50 + i) * (TILE_SIZE - 2)) + 1;
    const sy = Math.floor(tileHash(tx, ty, 60 + i) * (TILE_SIZE - 2)) + 1;
    g.rect(x + sx, y + sy, 1, 1).fill(DB32.opal);
  }
}

// Where the water surface sits inside the tile, at rest.
//   `WATER_REST_DEPRESSION` pixels from the top of the tile = the recessed
//   "bank above the water" zone (transparent, lets the underground void
//   show through).
//   `STATIC_BODY_TOP_OFFSET` pixels from the top of the tile = where the
//   never-animated body of water starts. The surface (highlight + sheen)
//   animates between these two — when it rises by 1 px, the surface line
//   moves up but the body stays put.
const WATER_REST_DEPRESSION = 2;
const STATIC_BODY_TOP_OFFSET = WATER_REST_DEPRESSION + 4;
