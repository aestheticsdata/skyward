import { DB32 } from '@constants';
import type { Entity } from '@entities/entity';
import { Container, Graphics } from 'pixi.js';

// Body bob frequency in Hz. 2 Hz reads as a gentle walking gait — too
// fast and it looks like the rabbit is bouncing/hopping, which would
// imply the rabbit can JUMP (which the user explicitly doesn't want).
const BOB_FREQUENCY = 2;

// Authored description of a rabbit walking back and forth on a platform.
// The rabbit moves at constant `speed`, reverses direction at minX or
// maxX, and never jumps or falls — the bounds are passed in so the level
// author guarantees the rabbit stays on its platform.
//
// All coordinates in world (logical) pixels.
//   x   - initial centre x
//   y   - FOOT y (where the rabbit's feet rest on the platform top)
//   minX / maxX - centre-x bounds; reverse when reached
//   facing - initial facing direction (default 1, i.e. right)
export interface RabbitSpec {
  x: number;
  y: number;
  speed: number;
  minX: number;
  maxX: number;
  facing?: 1 | -1;
}

// A small rabbit that paces a fixed strip of platform. Purely decorative
// — no collision with the player or terrain, no interaction. The Game's
// per-frame entity update loop drives the motion + animation.
//
// The rabbit deliberately does NOT use the tilemap to detect edges. It
// uses the minX/maxX bounds the level author passes in. This makes
// placement explicit (the author chooses which platform the rabbit
// belongs to) and avoids edge cases when the platform geometry changes.
export class Rabbit implements Entity {
  readonly sprite: Container;

  private posX: number;
  private readonly posY: number;
  private velX: number;
  private facing: 1 | -1;
  private readonly minX: number;
  private readonly maxX: number;

  private readonly body: Graphics;
  private elapsedTime = 0;
  private currentBobFrame = -1;

  constructor(spec: RabbitSpec) {
    this.posX = spec.x;
    this.posY = spec.y;
    this.facing = spec.facing ?? 1;
    this.velX = this.facing * spec.speed;
    this.minX = spec.minX;
    this.maxX = spec.maxX;

    this.sprite = new Container();
    this.body = new Graphics();
    this.sprite.addChild(this.body);

    this.redraw(0);
    this.currentBobFrame = 0;
    this.syncSprite();
  }

  update(dt: number): void {
    this.elapsedTime += dt;
    this.posX += this.velX * dt;

    if (this.posX < this.minX) {
      this.posX = this.minX;
      this.velX = Math.abs(this.velX);
      this.facing = 1;
    } else if (this.posX > this.maxX) {
      this.posX = this.maxX;
      this.velX = -Math.abs(this.velX);
      this.facing = -1;
    }

    const bobFrame = Math.floor(this.elapsedTime * BOB_FREQUENCY) & 1;
    if (bobFrame !== this.currentBobFrame) {
      this.currentBobFrame = bobFrame;
      this.redraw(bobFrame);
    }

    this.syncSprite();
  }

  private redraw(bobFrame: number): void {
    this.body.clear();
    drawRabbit(this.body, bobFrame);
  }

  private syncSprite(): void {
    this.sprite.x = this.posX;
    this.sprite.y = this.posY;
    this.sprite.scale.set(this.facing, 1);
  }
}

// Drawn around (0, 0) with feet at y=0, head on the RIGHT (positive x).
// 9 wide × 9 tall. Animation alternates a 1-px body bob and a small
// shift of the visible feet so the rabbit reads as walking, not sliding.
function drawRabbit(g: Graphics, bobFrame: number): void {
  const fur = DB32.twine; // warm tan
  const furHi = DB32.pancho; // lighter tan highlight
  const furShadow = DB32.oiledCedar; // brown shadow
  const belly = DB32.lightSteel; // pale belly + tail puff
  const eye = DB32.valhalla;
  const nose = DB32.loulou;

  // 1-pixel body bob — body sits slightly higher on alternating frames.
  const bob = bobFrame === 0 ? 0 : -1;

  // Tail — small white puff on the LEFT (back end).
  g.rect(-4, -4 + bob, 1, 2).fill(belly);

  // Body — 6 wide × 3 tall, centred horizontally. Belly band on bottom.
  g.rect(-3, -5 + bob, 6, 3).fill(fur);
  g.rect(-3, -5 + bob, 6, 1).fill(furHi);
  g.rect(-3, -3 + bob, 6, 1).fill(furShadow);
  g.rect(-2, -3 + bob, 4, 1).fill(belly);

  // Head — 4 wide × 3 tall, on the RIGHT side, raised above the body.
  g.rect(2, -7 + bob, 4, 3).fill(fur);
  g.rect(2, -7 + bob, 4, 1).fill(furHi);

  // Two ears, slightly different heights — tall vertical strips on top.
  g.rect(2, -9 + bob, 1, 2).fill(fur); // shorter back ear
  g.rect(4, -10 + bob, 1, 3).fill(fur); // taller front ear

  // Eye + nose (face details on the head's right side).
  g.rect(4, -6 + bob, 1, 1).fill(eye);
  g.rect(5, -5 + bob, 1, 1).fill(nose);

  // Feet — two small dark blocks. The "walking" cycle swaps which one is
  // forward (creates the alternating-step look without a full skeleton).
  if (bobFrame === 0) {
    g.rect(-3, -1, 2, 1).fill(furShadow); // back foot back
    g.rect(1, -1, 2, 1).fill(furShadow); // front foot forward
  } else {
    g.rect(-2, -1, 2, 1).fill(furShadow); // back foot forward
    g.rect(0, -1, 2, 1).fill(furShadow); // front foot back
  }
}
