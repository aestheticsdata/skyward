import { DB32 } from '@constants';
import type { Entity } from '@entities/entity';
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
  private readonly color: number;

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
function drawFish(g: Graphics, tailFrame: number, color: number): void {
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
