import { DB32 } from '@constants';
import type { Entity } from '@entities/entity';
import type { Vec2 } from '@types';
import { Container, Graphics } from 'pixi.js';

// Wing-flap frequency in Hz. 8 Hz reads as small fast-flapping bird at
// this distance (the classic Amiga "two-pixel V flapping across the
// sky").
const FLAP_FREQUENCY = 8;

// Authored description of a bird flying back and forth across the level.
// Like Fish/Rabbit, the bounds are passed explicitly so the bird stays
// within the intended flight corridor.
//   x       - initial centre x
//   y       - flight altitude (centre y of the bird body)
//   minX / maxX - centre-x bounds; reverse when reached
//   facing  - initial flight direction (default 1, i.e. right)
//   color   - silhouette colour (defaults to valhalla — near-black, the
//             "distant bird against the sky" look)
export interface BirdSpec {
  x: number;
  y: number;
  speed: number;
  minX: number;
  maxX: number;
  facing?: 1 | -1;
  color?: number;
}

// A tiny silhouetted bird that flies horizontally back and forth across
// a level. Purely decorative.
//
// Same scaffolding as Fish/Rabbit: horizontal motion at constant speed,
// reverse at minX/maxX, 2-frame wing animation driven by a phase counter.
// No vertical motion — we don't need bobbing at this scale.
export class Bird implements Entity {
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
  private currentWingFrame = -1;

  constructor(spec: BirdSpec) {
    this.posX = spec.x;
    this.posY = spec.y;
    this.facing = spec.facing ?? 1;
    this.velX = this.facing * spec.speed;
    this.minX = spec.minX;
    this.maxX = spec.maxX;
    this.color = spec.color ?? DB32.valhalla;

    this.sprite = new Container();
    this.body = new Graphics();
    this.sprite.addChild(this.body);

    this.redraw(0);
    this.currentWingFrame = 0;
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

    const wingFrame = Math.floor(this.elapsedTime * FLAP_FREQUENCY) & 1;
    if (wingFrame !== this.currentWingFrame) {
      this.currentWingFrame = wingFrame;
      this.redraw(wingFrame);
    }

    this.syncSprite();
  }

  private redraw(wingFrame: number): void {
    this.body.clear();
    drawBird(this.body, wingFrame, this.color);
  }

  private syncSprite(): void {
    this.sprite.x = this.posX;
    this.sprite.y = this.posY;
    // Birds are symmetric front-to-back at this scale, so mirroring on
    // facing change is cosmetic (no visible effect). Apply it anyway so
    // any future asymmetric refinement (beak, tail) reads correctly.
    this.sprite.scale.set(this.facing, 1);
  }

  // AABB overlap between the bird's wing-spread silhouette and the
  // player's AABB. World-space coords. Used by Game to detect the
  // player's first-bird encounter — only ever triggers when the
  // player happens to be standing on a platform tall enough to put
  // them in the bird flight band.
  isPlayerInRange(playerPos: Vec2, playerSize: Vec2): boolean {
    const birdLeft = this.posX + Bird.BODY_LEFT;
    const birdRight = this.posX + Bird.BODY_RIGHT;
    const birdTop = this.posY + Bird.BODY_TOP;
    const birdBottom = this.posY + Bird.BODY_BOTTOM;
    const playerLeft = playerPos.x;
    const playerRight = playerPos.x + playerSize.x;
    const playerTop = playerPos.y;
    const playerBottom = playerPos.y + playerSize.y;
    return playerLeft < birdRight && playerRight > birdLeft && playerTop < birdBottom && playerBottom > birdTop;
  }

  // Bird silhouette extent in entity-local coordinates. The bird is the
  // classic "M": wings spread from x=-3 to x=3, wing tips reach up to
  // y=-3 in the wings-up frame, body line at y=-2. The bottom of the
  // hitbox is at y=0 (the anchor point).
  private static readonly BODY_LEFT = -3;
  private static readonly BODY_RIGHT = 4;
  private static readonly BODY_TOP = -3;
  private static readonly BODY_BOTTOM = 0;
}

// Drawn around (0, 0). The bird is essentially the classic "M" / "V"
// flying-bird shape: a central body (3 px wide) with two wings, the
// wing tips flapping up and down.
//
// Frame 0 — wings down (mid-flap): tips at y = -1.
// Frame 1 — wings up (top of flap): tips at y = -3.
//
// Exported so the greeting popup can render an oversized copy when
// the player meets their first bird.
export function drawBird(g: Graphics, wingFrame: number, color: number): void {
  // Body — 3 px wide × 1 tall, centred. Constant across frames.
  g.rect(-1, -2, 3, 1).fill(color);

  if (wingFrame === 0) {
    // Wings down — inner wing pixel at y = -2, outer tip at y = -1.
    g.rect(-2, -2, 1, 1).fill(color);
    g.rect(2, -2, 1, 1).fill(color);
    g.rect(-3, -1, 1, 1).fill(color);
    g.rect(3, -1, 1, 1).fill(color);
  } else {
    // Wings up — inner wing at y = -2, outer tip at y = -3.
    g.rect(-2, -2, 1, 1).fill(color);
    g.rect(2, -2, 1, 1).fill(color);
    g.rect(-3, -3, 1, 1).fill(color);
    g.rect(3, -3, 1, 1).fill(color);
  }
}
