import { DB32 } from '@constants';
import type { Entity } from '@entities/entity';
import type { Vec2 } from '@types';
import { Container, Graphics } from 'pixi.js';

// Tail-wiggle frequency in Hz. 5 Hz feels alive without being frantic —
// matches the slow drift of a fish in a calm pool.
const WIGGLE_FREQUENCY = 5;

// Authored description of a fish swimming in a body of water. The fish
// moves horizontally at constant `speed`, reverses direction at minX or
// maxX, and continuously wiggles its tail.
//
// All coordinates are in world (logical) pixels.
//   x   - initial centre x
//   y   - centre y of the fish body (the fish "depth" in the water)
//   minX / maxX - centre-x bounds; reverse when reached
//   facing - 1 = initially swimming right, -1 = left (default 1)
//   color  - body colour; defaults to tahitiGold (warm orange that pops
//            against the dark Venice-blue water)
export interface FishSpec {
  x: number;
  y: number;
  speed: number;
  minX: number;
  maxX: number;
  facing?: 1 | -1;
  color?: number;
}

// A small fish that swims back and forth horizontally in a water body.
// Purely decorative — no collision, no interaction. The Game's per-frame
// entity update loop calls update(dt) so the fish moves and animates
// without any extra wiring.
export class Fish implements Entity {
  readonly sprite: Container;

  private posX: number;
  private readonly posY: number;
  private velX: number;
  private facing: 1 | -1;
  private readonly minX: number;
  private readonly maxX: number;
  // Public so Game can read the colour of the specific fish the player
  // bumped into and render the matching-colour fish in the greeting
  // popup. Without this, every first-fish popup would show the default
  // orange variant even when the player just brushed a yellow or red
  // fish.
  readonly color: number;

  private readonly body: Graphics;
  private elapsedTime = 0;
  private currentTailFrame = -1;

  constructor(spec: FishSpec) {
    this.posX = spec.x;
    this.posY = spec.y;
    this.facing = spec.facing ?? 1;
    this.velX = this.facing * spec.speed;
    this.minX = spec.minX;
    this.maxX = spec.maxX;
    this.color = spec.color ?? DB32.tahitiGold;

    this.sprite = new Container();
    this.body = new Graphics();
    this.sprite.addChild(this.body);

    this.redraw(0);
    this.currentTailFrame = 0;
    this.syncSprite();
  }

  update(dt: number): void {
    this.elapsedTime += dt;
    this.posX += this.velX * dt;

    // Reverse at bounds. Pin to the exact bound so the fish doesn't drift
    // out then snap back over multiple frames.
    if (this.posX < this.minX) {
      this.posX = this.minX;
      this.velX = Math.abs(this.velX);
      this.facing = 1;
    } else if (this.posX > this.maxX) {
      this.posX = this.maxX;
      this.velX = -Math.abs(this.velX);
      this.facing = -1;
    }

    const tailFrame = Math.floor(this.elapsedTime * WIGGLE_FREQUENCY) & 1;
    if (tailFrame !== this.currentTailFrame) {
      this.currentTailFrame = tailFrame;
      this.redraw(tailFrame);
    }

    this.syncSprite();
  }

  private redraw(tailFrame: number): void {
    this.body.clear();
    drawFish(this.body, tailFrame, this.color);
  }

  // AABB overlap between the fish body's bounding box and the player's
  // AABB. World-space coords. Used by Game to detect the player's
  // first-fish encounter and fire the greeting popup. Bounds are a
  // touch generous around the body so a swimming player doesn't need
  // pixel-perfect alignment to trigger.
  isPlayerInRange(playerPos: Vec2, playerSize: Vec2): boolean {
    const fishLeft = this.posX + Fish.BODY_LEFT;
    const fishRight = this.posX + Fish.BODY_RIGHT;
    const fishTop = this.posY + Fish.BODY_TOP;
    const fishBottom = this.posY + Fish.BODY_BOTTOM;
    const playerLeft = playerPos.x;
    const playerRight = playerPos.x + playerSize.x;
    const playerTop = playerPos.y;
    const playerBottom = playerPos.y + playerSize.y;
    return playerLeft < fishRight && playerRight > fishLeft && playerTop < fishBottom && playerBottom > fishTop;
  }

  // Fish-body extent in entity-local coordinates (around posX, posY).
  // posY anchors the BOTTOM of the body; the tail (frame 1) extends up
  // to y=-3. Right side has the head; the head sits at x=2.
  private static readonly BODY_LEFT = -4;
  private static readonly BODY_RIGHT = 3;
  private static readonly BODY_TOP = -3;
  private static readonly BODY_BOTTOM = 1;

  // Position is float — Application.roundPixels rounds at render time.
  // scale.x = facing mirrors the sprite around the centre so the head
  // always points in the swim direction.
  private syncSprite(): void {
    this.sprite.x = this.posX;
    this.sprite.y = this.posY;
    this.sprite.scale.set(this.facing, 1);
  }
}

// Drawn around (0, 0): head on the RIGHT (positive x), tail on the LEFT.
// 6 wide × 3 tall body, plus a 2-state wiggling tail. The character
// mirror in syncSprite takes care of left-facing.
//
// This is the IN-WORLD render — tiny, the size of a fish swimming in
// the lake. The greeting popup uses drawFishLarge() instead because
// scaling a 5-pixel-wide sprite up by 8× just produces large coloured
// rectangles, not a fish.
export function drawFish(g: Graphics, tailFrame: number, color: number): void {
  const body = color;
  const belly = DB32.pancho; // pale tan belly — high contrast under any body colour
  const eye = DB32.valhalla;

  // Body block — 4 wide × 2 tall, top-left at (-2, -2).
  g.rect(-2, -2, 4, 2).fill(body);
  // Belly highlight on the bottom row.
  g.rect(-2, -1, 4, 1).fill(belly);
  // Tiny eye on the head side (right).
  g.rect(1, -2, 1, 1).fill(eye);

  // Tail — alternates between "flat" (frame 0) and "split V" (frame 1).
  if (tailFrame === 0) {
    g.rect(-3, -2, 1, 2).fill(body);
  } else {
    g.rect(-3, -2, 1, 1).fill(body); // top fork
    g.rect(-3, -1, 1, 1).fill(body); // bottom fork
    g.rect(-4, -3, 1, 1).fill(body); // extended top tip
    g.rect(-4, 0, 1, 1).fill(body); // extended bottom tip
  }
}

// Larger, detailed "portrait" fish for the greeting popup. Drawn around
// (0, 0) at native logical size ~22 wide × 10 tall. Anchored at the
// fish's bottom-centre (same convention as drawFish but bigger).
//
// Why a dedicated function: drawFish's silhouette is 5×3 px total. At
// the popup's ×8 scale, that produced 5 enormous coloured rectangles
// that read as an abstract "L" shape, not a fish. drawFishLarge has
// enough native detail (body curve, snout, fan tail, dorsal + bottom
// fins, eye) that the popup gets a clearly recognisable fish.
//
// Head on the RIGHT, tail on the LEFT — same orientation as the
// in-world fish, so the popup matches what the player just bumped
// into.
export function drawFishLarge(g: Graphics, color: number): void {
  const body = color;
  const belly = DB32.pancho; // pale tan belly band
  const eyeWhite = DB32.white;
  const eye = DB32.valhalla;

  // Body — built as horizontal slabs of decreasing-then-equal width to
  // give a soft oval silhouette.
  g.rect(-7, -7, 16, 1).fill(body); // top row (narrower)
  g.rect(-8, -6, 17, 1).fill(body);
  g.rect(-9, -5, 18, 1).fill(body); // widest band
  g.rect(-9, -4, 18, 1).fill(body);
  g.rect(-9, -3, 18, 1).fill(body);
  g.rect(-9, -2, 18, 1).fill(body);
  g.rect(-8, -1, 17, 1).fill(body); // bottom (narrower)

  // Snout — tapered point on the right edge.
  g.rect(9, -5, 1, 3).fill(body);

  // Tail base — narrows on the left.
  g.rect(-10, -5, 1, 3).fill(body);

  // Tail fan — symmetric wedge at the far left, taller than the body.
  g.rect(-12, -6, 2, 5).fill(body);
  g.rect(-13, -7, 1, 1).fill(body); // upper tail tip
  g.rect(-13, -1, 1, 1).fill(body); // lower tail tip

  // Dorsal (top) fin.
  g.rect(-3, -9, 5, 2).fill(body);
  g.rect(-2, -10, 3, 1).fill(body);

  // Anal (bottom) fin.
  g.rect(-2, -1, 4, 1).fill(body);
  g.rect(-1, 0, 2, 1).fill(body);

  // Pale belly band across the lower body.
  g.rect(-7, -2, 15, 1).fill(belly);

  // Eye — 2×2 white with a 1-px dark pupil.
  g.rect(6, -5, 2, 2).fill(eyeWhite);
  g.rect(7, -4, 1, 1).fill(eye);
}
