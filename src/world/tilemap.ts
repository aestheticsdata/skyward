import { DB32, TILE_SIZE } from '@constants';
import { Graphics } from 'pixi.js';

// True-neutral dark greys for the crypt — outside the DB32 palette on
// purpose. Every dark DB32 tone (valhalla, opal, loulou) carries a
// chromatic tint that reads as purple/green/blue at small scale. These
// two are RGB-balanced (R=G=B) so they're pure grey, no bias.
const CRYPT_WALL = 0x202020; // near-black neutral grey (wall base)
const CRYPT_FLOOR = 0x303030; // slightly lighter neutral grey (floor base)
const CRYPT_HI = 0xcfcfcf; // bright cool-white "reflet" highlight
const CRYPT_LO = 0x000000; // pure black mortar

// Tile type. Uses a const object (not enum) so it plays nicely with
// `isolatedModules` in tsconfig.
//
// Three material families currently:
//   - Outdoor: Grass / Dirt / Stone / DarkStone — used by the meadow.
//   - Castle:  CastleBrick (wall) / CastleFloor (polished slabs) /
//              GoldPillar (classical column). Used by the Old Keep.
//              Neutral cool-grey, walls darker, floor lighter, pillars
//              warm gold for contrast.
//   - Crypt:   CryptBrick / CryptFloor. Used by the Old Keep's crypt.
//              VERY dark palette — almost-black masonry that catches just
//              enough candlelight to read. The crypt is meant to feel
//              like a cosy hideout deep underground.
// Water is shared (lakes happen in both biomes).
export const Tile = {
  Empty: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  DarkStone: 4,
  Water: 5,
  CastleBrick: 6,
  CastleFloor: 7,
  GoldPillar: 8,
  CryptBrick: 9,
  CryptFloor: 10,
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
  B: Tile.CastleBrick,
  F: Tile.CastleFloor,
  P: Tile.GoldPillar,
  c: Tile.CryptBrick,
  v: Tile.CryptFloor,
};

const TILE_COLORS: Record<Tile, number> = {
  [Tile.Empty]: 0,
  [Tile.Grass]: DB32.eltGreen,
  [Tile.Dirt]: DB32.oiledCedar,
  [Tile.Stone]: DB32.heather,
  [Tile.DarkStone]: DB32.topaz,
  [Tile.Water]: DB32.venice,
  // CastleBrick — neutral mid-grey (dimGray). The first cut used
  // deepKoamaru, which reads as muted purple-blue: wrong for the
  // grey-stone reference and explicitly disliked. dimGray is a true
  // neutral grey — no purple, no blue. Highlight + shadow come from
  // heather + valhalla in drawCastleBrick.
  [Tile.CastleBrick]: DB32.dimGray,
  // CastleFloor — one notch LIGHTER than the wall (heather over dimGray),
  // so polished slabs read as catching ambient candle light. Still in the
  // grey family, slight cool tint that says "stone."
  [Tile.CastleFloor]: DB32.heather,
  // GoldPillar — warm gold base. The big chromatic contrast against the
  // surrounding cool greys is what makes a column read as "ornamental,
  // not structural" at a glance. rainforest is a mid-gold/olive that
  // takes goldenFizz highlights and stinger shadows beautifully.
  [Tile.GoldPillar]: DB32.rainforest,
  // CryptBrick — TRUE neutral dark grey (custom, outside DB32). DB32's
  // dark tones (valhalla, opal, loulou) all carry a tint — valhalla pulls
  // blue/purple, opal pulls green, loulou pulls purple. The user wants
  // grey, not tinted dark. 0x202020 is RGB(32,32,32): channels equal,
  // no chromatic bias, nearly black but readable against the pure-black
  // crypt backdrop.
  [Tile.CryptBrick]: CRYPT_WALL,
  // CryptFloor — one notch lighter than the wall (still neutral grey)
  // so the floor catches just enough candlelight to walk by.
  [Tile.CryptFloor]: CRYPT_FLOOR,
};

// Solid tiles block movement. A few are intentionally NOT solid:
//   - Water: the player wades / swims through it.
//   - GoldPillar: purely decorative. Drawn into the tilemap so authors
//     can place ornamental columns straight from the ASCII (`P`) without
//     spawning a Decoration entity per column, but the player should
//     walk THROUGH them — they're ambient castle furniture, not the
//     room's structural skeleton.
const TILE_SOLID: Record<Tile, boolean> = {
  [Tile.Empty]: false,
  [Tile.Grass]: true,
  [Tile.Dirt]: true,
  [Tile.Stone]: true,
  [Tile.DarkStone]: true,
  [Tile.Water]: false,
  [Tile.CastleBrick]: true,
  [Tile.CastleFloor]: true,
  [Tile.GoldPillar]: false,
  [Tile.CryptBrick]: true,
  [Tile.CryptFloor]: true,
};

export class Tilemap {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly Tile[];
  // Per-tile water "body" id. Tiles that are part of the same 4-connected
  // pool share the same positive id; non-water tiles get -1. Used so the
  // water-surface animation only ripples the pool the player is currently
  // standing in, leaving every other lake in the level still.
  readonly waterBodyId: readonly number[];

  constructor(width: number, height: number, tiles: readonly Tile[]) {
    this.width = width;
    this.height = height;
    this.tiles = tiles;
    this.waterBodyId = computeWaterBodies(width, height, tiles);
  }

  // Water body id at (tx, ty), or -1 if that tile isn't water.
  waterBodyAt(tx: number, ty: number): number {
    if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return -1;
    return this.waterBodyId[ty * this.width + tx];
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

// 4-connected flood fill over Water tiles. Each connected pool gets a unique
// non-negative id; all other tiles get -1. Runs once at tilemap construction.
function computeWaterBodies(width: number, height: number, tiles: readonly Tile[]): number[] {
  const ids = new Array<number>(width * height).fill(-1);
  let next = 0;
  const stack: number[] = [];
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] !== Tile.Water || ids[i] !== -1) continue;
    const id = next++;
    stack.push(i);
    while (stack.length > 0) {
      const j = stack.pop() as number;
      if (ids[j] !== -1) continue;
      ids[j] = id;
      const x = j % width;
      const y = (j - x) / width;
      if (x > 0 && tiles[j - 1] === Tile.Water && ids[j - 1] === -1) stack.push(j - 1);
      if (x < width - 1 && tiles[j + 1] === Tile.Water && ids[j + 1] === -1) stack.push(j + 1);
      if (y > 0 && tiles[j - width] === Tile.Water && ids[j - width] === -1) stack.push(j - width);
      if (y < height - 1 && tiles[j + width] === Tile.Water && ids[j + width] === -1) stack.push(j + width);
    }
  }
  return ids;
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

// True for a water tile whose neighbor directly above is EMPTY (air) — only
// then does the tile get the meniscus + animated surface treatment.
// Crucially: water tiles capped by a stone/dirt block above are NOT surface
// tiles. They sit inside the level body and render as solid blue, so a lake
// passing under a stone overhang doesn't draw a fake "surface line"
// underneath the stone.
function isWaterSurface(map: Tilemap, tx: number, ty: number): boolean {
  if (map.at(tx, ty) !== Tile.Water) return false;
  return map.at(tx, ty - 1) === Tile.Empty;
}

// Static body of every water tile. Never animated.
//   - Surface tile (water above is empty/solid): leave the top
//     STATIC_BODY_TOP_OFFSET pixels blank — the animated surface fills them
//     each frame.
//   - Submerged tile (water above): fill the whole tile, no recess. That's
//     what makes a deep lake look like one continuous pool instead of a
//     stack of horizontal bands.
export function renderWaterBody(map: Tilemap): Graphics {
  const g = new Graphics();
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (map.at(tx, ty) !== Tile.Water) continue;
      const x = tx * TILE_SIZE;
      const y = ty * TILE_SIZE;
      if (isWaterSurface(map, tx, ty)) {
        const bodyTop = y + STATIC_BODY_TOP_OFFSET;
        g.rect(x, bodyTop, TILE_SIZE, y + TILE_SIZE - bodyTop).fill(TILE_COLORS[Tile.Water]);
      } else {
        g.rect(x, y, TILE_SIZE, TILE_SIZE).fill(TILE_COLORS[Tile.Water]);
      }
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

  // Geological striations — every ~12 rows, a 1-pixel darker band that
  // wavers slightly along its length (sin-modulated) so it reads as a
  // sedimentary layer instead of a ruler-straight stripe. Without these
  // the rock face was a flat field of speckle; with them it gains depth
  // and the Amiga-style "this is a cave wall, not paint" feel.
  for (let bandY = startY + 6; bandY < endY; bandY += 12) {
    const phase = bandY * 0.13;
    for (let x = 0; x < width; x++) {
      const wobble = Math.round(Math.sin(x * 0.04 + phase) * 1.5);
      g.rect(x, bandY + wobble, 1, 1).fill(DB32.opal);
    }
  }

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
// Only renders for SURFACE tiles (water with non-water above). Submerged
// tiles get no top edge treatment so a deep lake reads as one pool.
//
// `surfaceOffset` is in pixels: 0 = rest, negative = surface lifted (ripple
// up), positive = surface dipped (ripple down). Always rounded to an integer
// by the caller so the surface stays on the pixel grid. Applied ONLY to the
// pool whose id matches `activeBodyId`; every other water surface in the
// level stays at rest. Pass -1 (or any unused id) to keep everything still.
//
// The animated strip extends from `sy` down to the static body top, so as
// the surface moves up, the visible water grows by the offset (filler is
// the same color as the static body). No gap ever appears between strip
// and body.
export function renderWaterSurfaceInto(g: Graphics, map: Tilemap, surfaceOffset: number, activeBodyId: number): void {
  g.clear();
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (!isWaterSurface(map, tx, ty)) continue;
      const x = tx * TILE_SIZE;
      const y = ty * TILE_SIZE;
      const localOffset = map.waterBodyAt(tx, ty) === activeBodyId ? surfaceOffset : 0;
      const sy = y + WATER_REST_DEPRESSION + localOffset;
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
      drawDarkStone(g, x, y, ty);
      break;
    case Tile.CastleBrick:
      drawCastleBrick(g, x, y, tx, ty);
      break;
    case Tile.CastleFloor:
      drawCastleFloor(g, x, y, tx, ty);
      break;
    case Tile.GoldPillar:
      drawGoldPillar(g, x, y);
      break;
    case Tile.CryptBrick:
      drawCryptBrick(g, x, y, tx, ty);
      break;
    case Tile.CryptFloor:
      drawCryptFloor(g, x, y, ty);
      break;
  }
}

function drawGrass(g: Graphics, x: number, y: number, tx: number, ty: number): void {
  // Bright top line — the horizon-marker that reads as "this is the surface."
  g.rect(x, y, TILE_SIZE, 1).fill(DB32.atlantis);

  // Darker grass body bottom — 3-row band that transitions to dirt below,
  // so the grass tile reads as having depth (turf rooted into soil) instead
  // of being a flat green slab. Classic Amiga touch.
  g.rect(x, y + TILE_SIZE - 3, TILE_SIZE, 3).fill(DB32.dell);
  // 1-px dither row at the band edge — softens the cut from mid-green to
  // dark-green so it doesn't look like a hard horizontal stripe.
  for (let i = 0; i < TILE_SIZE; i += 2) {
    g.rect(x + i, y + TILE_SIZE - 4, 1, 1).fill(DB32.dell);
  }

  // Speckled tone variation in the grass body — a few darker green pixels
  // scattered through the middle band so the surface looks like blades, not
  // a painted block.
  for (let i = 0; i < 5; i++) {
    const sx = Math.floor(tileHash(tx, ty, 60 + i) * TILE_SIZE);
    const sy = 2 + Math.floor(tileHash(tx, ty, 70 + i) * 8);
    g.rect(x + sx, y + sy, 1, 1).fill(DB32.dell);
  }
  // Two lighter blade specks above the band — catches the highlight.
  for (let i = 0; i < 2; i++) {
    const sx = Math.floor(tileHash(tx, ty, 80 + i) * TILE_SIZE);
    const sy = 1 + Math.floor(tileHash(tx, ty, 90 + i) * 6);
    g.rect(x + sx, y + sy, 1, 1).fill(DB32.atlantis);
  }

  // A few short tufts standing up off the top edge. Position and count are
  // stable per tile (no jitter across frames). Denser than before for a
  // tufted-meadow feel.
  const tuftCount = tileHash(tx, ty, 1) < 0.4 ? 3 : 4;
  for (let i = 0; i < tuftCount; i++) {
    const tx0 = Math.floor(tileHash(tx, ty, 10 + i) * (TILE_SIZE - 2)) + 1;
    g.rect(x + tx0, y - 1, 1, 1).fill(DB32.atlantis);
    // Occasional 2-px tall tuft for variety.
    if (tileHash(tx, ty, 20 + i) < 0.3) {
      g.rect(x + tx0, y - 2, 1, 1).fill(DB32.atlantis);
    }
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
  // Horizontal striation — one slightly darker row, position varies per tile
  // column so the lines don't form a continuous stripe across the level.
  // Reads as compressed-earth strata rather than a flat brown surface.
  const striationY = 2 + Math.floor(tileHash(tx, ty, 70) * 10);
  g.rect(x, y + striationY, TILE_SIZE, 1).fill(DB32.loulou);

  // Speckles — denser than before, mix of darker and lighter so the surface
  // feels grainy.
  for (let i = 0; i < 7; i++) {
    const sx = Math.floor(tileHash(tx, ty, 20 + i) * (TILE_SIZE - 2)) + 1;
    const sy = Math.floor(tileHash(tx, ty, 30 + i) * (TILE_SIZE - 2)) + 1;
    g.rect(x + sx, y + sy, 1, 1).fill(DB32.loulou);
  }
  for (let i = 0; i < 3; i++) {
    const sx = Math.floor(tileHash(tx, ty, 40 + i) * (TILE_SIZE - 2)) + 1;
    const sy = Math.floor(tileHash(tx, ty, 50 + i) * (TILE_SIZE - 2)) + 1;
    g.rect(x + sx, y + sy, 1, 1).fill(DB32.rope);
  }

  // Embedded pebble — about one tile in three has a small gray rock poking
  // through the soil. Adds the "rough mineral earth" feel of Amiga dirt
  // textures instead of flat brown. Capped to topaz so it doesn't read as
  // a glowing white dot on dark soil — a softer "exposed stone" tone.
  if (tileHash(tx, ty, 80) < 0.35) {
    const px = 2 + Math.floor(tileHash(tx, ty, 81) * (TILE_SIZE - 6));
    const py = 4 + Math.floor(tileHash(tx, ty, 82) * (TILE_SIZE - 8));
    g.rect(x + px, y + py, 2, 2).fill(DB32.topaz);
    g.rect(x + px, y + py, 2, 1).fill(DB32.heather);
  }
}

// One brick of the running-bond pattern at global pixel coords (gx, gy),
// 8x8, clipped to the tile rect (tileX, tileY, 16, 16). Bevel reads as
// "lit from above" — a single-pixel top highlight, dark mortar on right
// and bottom. Left edge is intentionally NOT highlighted: the side
// highlight made each brick face read as a pale tile (Minecraft) rather
// than rough masonry (Rome AGA / Gods). The 1-px top highlight alone is
// enough to suggest sun on the upper edge without bleaching the face.
//
// Every brick of a given rock type uses the SAME face color — Amiga
// stone tilesets are uniform within a material. No per-brick accent.
//
// Only the brick edges that actually fall inside the tile are drawn — so
// bricks crossing a tile boundary look correct on both sides.
function drawBrick(
  g: Graphics,
  gx: number,
  gy: number,
  tileX: number,
  tileY: number,
  base: number,
  hi: number,
  lo: number,
): void {
  const x0 = Math.max(gx, tileX);
  const x1 = Math.min(gx + 8, tileX + TILE_SIZE);
  const y0 = Math.max(gy, tileY);
  const y1 = Math.min(gy + 8, tileY + TILE_SIZE);
  if (x0 >= x1 || y0 >= y1) return;

  g.rect(x0, y0, x1 - x0, y1 - y0).fill(base);

  // Top highlight — single pixel along the brick's top edge.
  if (gy >= tileY) {
    g.rect(x0, gy, x1 - x0, 1).fill(hi);
  }
  // Right and bottom mortar lines. Drawn after the top highlight so the
  // top-right corner ends up dark (the bevel signature).
  if (gx + 7 < tileX + TILE_SIZE) {
    g.rect(gx + 7, y0, 1, y1 - y0).fill(lo);
  }
  if (gy + 7 < tileY + TILE_SIZE) {
    g.rect(x0, gy + 7, x1 - x0, 1).fill(lo);
  }
}

// Lay out the brick pattern for a single 16x16 tile. Two brick rows per
// tile (each 8 px tall). Even brick rows are aligned (bricks at x=0,8);
// odd rows shift by +4 px (running-bond stagger). Brick row index is
// global (ty * 2 + halfRow), so the stagger reads continuously across
// vertically adjacent tiles.
function drawBrickPattern(g: Graphics, x: number, y: number, ty: number, base: number, hi: number, lo: number): void {
  for (let halfRow = 0; halfRow < 2; halfRow++) {
    const brickY = y + halfRow * 8;
    const brickRowIndex = ty * 2 + halfRow;
    const offset = (brickRowIndex & 1) === 0 ? 0 : 4;
    // First brick whose right edge is past the tile's left edge.
    const firstBrickX = Math.floor((x - offset) / 8) * 8 + offset;
    for (let brickX = firstBrickX; brickX < x + TILE_SIZE; brickX += 8) {
      drawBrick(g, brickX, brickY, x, y, base, hi, lo);
    }
  }
}

function drawStone(g: Graphics, x: number, y: number, tx: number, ty: number): void {
  drawBrickPattern(g, x, y, ty, TILE_COLORS[Tile.Stone], DB32.lightSteel, DB32.dimGray);

  // Sparse crack — about one brick in twelve gets a single-pixel chip on
  // its face, giving the wall character without becoming busy. Same
  // shadow tone as the mortar so it stays inside the material's palette.
  if (tileHash(tx, ty, 110) < 0.18) {
    const cx = 2 + Math.floor(tileHash(tx, ty, 111) * (TILE_SIZE - 4));
    const cy = 2 + Math.floor(tileHash(tx, ty, 112) * (TILE_SIZE - 4));
    g.rect(x + cx, y + cy, 1, 1).fill(DB32.dimGray);
  }
}

function drawDarkStone(g: Graphics, x: number, y: number, ty: number): void {
  // Same brick pattern as Stone but a darker, more underground palette:
  // topaz base, heather highlight (lighter than base), valhalla shadow
  // (almost black). Reads as the same mason work, deeper in the earth.
  drawBrickPattern(g, x, y, ty, TILE_COLORS[Tile.DarkStone], DB32.heather, DB32.valhalla);
}

// Dressed castle masonry. Same running-bond pattern as Stone/DarkStone, but
// the palette is a neutral mid-grey with a cool top highlight and near-black
// mortar. Reads as "cut stone built for a wall, not raw cave rock." The
// grey was chosen explicitly to avoid any purple/violet tint — the previous
// deepKoamaru base was rejected for that reason.
function drawCastleBrick(g: Graphics, x: number, y: number, tx: number, ty: number): void {
  drawBrickPattern(g, x, y, ty, TILE_COLORS[Tile.CastleBrick], DB32.heather, DB32.valhalla);

  // Occasional darker rivet / fixing point on the face — about one brick in
  // eight. Small touch that suggests the wall is held together by ironwork,
  // a recurring motif in Amiga castle interiors.
  if (tileHash(tx, ty, 130) < 0.12) {
    const rx = 3 + Math.floor(tileHash(tx, ty, 131) * (TILE_SIZE - 6));
    const ry = 3 + Math.floor(tileHash(tx, ty, 132) * (TILE_SIZE - 6));
    g.rect(x + rx, y + ry, 1, 1).fill(DB32.valhalla);
  }
}

// Polished castle flagstone. One notch LIGHTER than the wall (heather vs
// dimGray) so the floor catches more ambient light — the reference shows
// the same hierarchy: walls darker, floor brighter, both clearly the same
// "indoor stone" family. Highlight is lightSteel (the strongest cool light
// the palette gives short of white) so the polished sheen reads even in
// dim corners.
function drawCastleFloor(g: Graphics, x: number, y: number, tx: number, ty: number): void {
  drawBrickPattern(g, x, y, ty, TILE_COLORS[Tile.CastleFloor], DB32.lightSteel, DB32.dimGray);

  // Very sparse polish glint — a single bright pixel on roughly one tile in
  // twelve. Mimics candlelight catching a worn edge. Same hash channel as
  // grass speckle so we never collide with another tile's variation.
  if (tileHash(tx, ty, 140) < 0.08) {
    const px = 4 + Math.floor(tileHash(tx, ty, 141) * (TILE_SIZE - 8));
    const py = 4 + Math.floor(tileHash(tx, ty, 142) * (TILE_SIZE - 8));
    g.rect(x + px, y + py, 1, 1).fill(DB32.white);
  }
}

// Crypt masonry. Same running-bond pattern as CastleBrick but in true
// neutral dark greys with BRIGHT WHITE highlights on the top bevel —
// the "reflets blancs" the user explicitly asked for. The contrast
// (near-black base + near-white edge) reads as polished dark stone
// catching candlelight, not the muted purple/green/blue tones the DB32
// dark colours produce.
function drawCryptBrick(g: Graphics, x: number, y: number, tx: number, ty: number): void {
  drawBrickPattern(g, x, y, ty, TILE_COLORS[Tile.CryptBrick], CRYPT_HI, CRYPT_LO);

  // Sparse pure-white sparkle — about one brick in twelve catches an
  // extra glint on its face. Reinforces the "reflets blancs" feel
  // without being busy.
  if (tileHash(tx, ty, 150) < 0.08) {
    const cx = 2 + Math.floor(tileHash(tx, ty, 151) * (TILE_SIZE - 4));
    const cy = 2 + Math.floor(tileHash(tx, ty, 152) * (TILE_SIZE - 4));
    g.rect(x + cx, y + cy, 1, 1).fill(DB32.white);
  }
}

// Crypt floor — one notch lighter than the wall so the floor catches
// more of the candlelight, just enough to walk by. Same dark brick
// pattern, same bright white highlights.
function drawCryptFloor(g: Graphics, x: number, y: number, ty: number): void {
  drawBrickPattern(g, x, y, ty, TILE_COLORS[Tile.CryptFloor], CRYPT_HI, CRYPT_LO);
}

// Golden classical column. Vertical "round column" shading per tile: a
// bright fluting line on the left (catching the light), a deep shadow band
// on the right (the column receding into the room), and a centre seam to
// suggest the cylindrical face. Not the brick pattern — pillars in the
// reference read as one continuous polished surface, not stacked stones.
//
// Each tile is self-contained: two pillar tiles stacked vertically still
// produce a continuous column because the per-tile pattern is identical
// top-to-bottom. Phase-3 polish can add capitals (when the tile above is
// empty) and bases (tile below is floor) by extending this with neighbor
// awareness in renderTilemap.
function drawGoldPillar(g: Graphics, x: number, y: number): void {
  const goldHi = DB32.goldenFizz;
  const goldShadow = DB32.stinger;
  const goldDeepShadow = DB32.oiledCedar;

  // Base is already filled by drawTile with TILE_COLORS[Tile.GoldPillar]
  // (rainforest). The flutes carve light/dark stripes into that base.

  // Bright catch-light along the left edge — the column is "lit from the
  // upper-left," same convention as every other tile in this game.
  g.rect(x + 2, y, 1, TILE_SIZE).fill(goldHi);

  // Centre seam — a single darker line down the middle suggests the
  // cylinder turning past its highlight.
  g.rect(x + 8, y, 1, TILE_SIZE).fill(goldShadow);

  // Right-side falloff — two adjacent dark stripes give the column visual
  // depth as it recedes from the light. The outer one is darker to fake a
  // gradient inside the 32-color palette's limits.
  g.rect(x + 13, y, 1, TILE_SIZE).fill(goldShadow);
  g.rect(x + 14, y, 1, TILE_SIZE).fill(goldDeepShadow);
}

// Solid indoor backdrop for castle / dungeon interiors. Renders a single
// near-black rectangle the size of the level — sits behind the tilemap, so
// any empty space inside the keep reads as the deep blackness of a stone
// hall lit only by candles. Replaces renderRockBackground for the indoor
// flavor, where the cave-rock texture would read as "dirt on the walls."
//
// First cut had faint horizontal bands every 24 rows in `loulou` (a dark
// plum) for "subtle depth." Against the very dark base they actually read
// as bright red stripes — wrong. Removed. Phase 3 polish can layer in
// distant pillar silhouettes or candle-glow halos to break uniformity in
// a way that reads as ambient atmosphere instead of paint scratches.
export function renderIndoorBackdrop(width: number, startY: number, endY: number): Graphics {
  const g = new Graphics();
  // valhalla — the darkest navy in DB32. Black would feel too flat against
  // the cool greys of the brickwork; valhalla keeps the room "indoors at
  // night" without disappearing.
  g.rect(0, startY, width, endY - startY).fill(DB32.valhalla);
  return g;
}

// Crypt backdrop — even darker than indoor-dark. Pure black, for the
// "candle-lit hideout deep underground" feel. Against the CryptBrick
// (opal) walls and CryptFloor (verdigris) the black backdrop reads as
// "you can't see the back of the room" which is exactly what we want.
export function renderCryptBackdrop(width: number, startY: number, endY: number): Graphics {
  const g = new Graphics();
  g.rect(0, startY, width, endY - startY).fill(DB32.black);
  return g;
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
