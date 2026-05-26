import { DB32 } from '@constants';
import type { Entity } from '@entities/entity';
import { Container, Graphics } from 'pixi.js';

// Hop dynamics — tuned by feel for a small "petit saut" arc.
//   HOP_VEL   - initial upward velocity in px/s (negative-y direction)
//   HOP_HORIZ - horizontal velocity during the hop
//   GRAVITY   - downward acceleration in px/s² (private to the pumpkin
//               so its arc is independent of the player's)
//   COOLDOWN  - rest time between hops, in seconds
//
// The gravity-driven arc is what gives each hop its natural easing —
// slow at the apex, fast on landing. NO bouncing on ground contact: the
// pumpkin lands cleanly, waits for COOLDOWN, then launches the next hop.
const HOP_VEL = 110;
const HOP_HORIZ = 30;
const GRAVITY = 280;
const COOLDOWN = 0.4;

// Authored description of a hopping pumpkin. Like Rabbit, the bounds are
// passed in by the level author so the pumpkin stays on its platform —
// the entity does not consult the tilemap.
//   x       - initial centre x
//   y       - FOOT y (where the pumpkin's base rests on the platform)
//   minX / maxX - centre-x bounds; reverse facing when reached
//   facing  - initial facing direction (default 1, i.e. right)
export interface PumpkinSpec {
  x: number;
  y: number;
  minX: number;
  maxX: number;
  facing?: 1 | -1;
}

// A small orange pumpkin that hops along a platform. Drawn around (0, 0)
// with the base at y=0. The Game's per-frame entity loop drives both the
// hop physics and the (very simple) bounce squash on the sprite.
//
// Physics model:
//   - Idle on the platform with a cooldown counter ticking down.
//   - When cooldown hits 0, kick off a new hop: vel.y = -HOP_VEL,
//     vel.x = facing * HOP_HORIZ.
//   - During the hop, GRAVITY pulls vel.y back down. Position updates each
//     frame. When pos.y returns to baseY (=== spec.y), snap to ground,
//     zero vel, reset cooldown.
//   - Out-of-bounds: pin to the bound, flip facing, mirror in-flight vel.
//
// This is deliberately the pumpkin's OWN gravity — not the player's
// (700 px/s²) — so the hop arc reads as "tiny pumpkin", floaty and gentle.
export class Pumpkin implements Entity {
  readonly sprite: Container;

  private posX: number;
  private posY: number;
  private velX = 0;
  private velY = 0;
  private facing: 1 | -1;
  private readonly baseY: number;
  private readonly minX: number;
  private readonly maxX: number;

  private isAirborne = false;
  private cooldownTimer = COOLDOWN;

  private readonly body: Graphics;

  constructor(spec: PumpkinSpec) {
    this.posX = spec.x;
    this.posY = spec.y;
    this.baseY = spec.y;
    this.facing = spec.facing ?? 1;
    this.minX = spec.minX;
    this.maxX = spec.maxX;

    this.sprite = new Container();
    this.body = new Graphics();
    drawPumpkin(this.body);
    this.sprite.addChild(this.body);

    this.syncSprite();
  }

  update(dt: number): void {
    if (this.isAirborne) {
      // Gravity + integrate position. The gravity term is what gives the
      // arc its natural easing: vel.y starts at -HOP_VEL (fast up), is
      // decelerated to 0 at the apex, then accelerated back down. By the
      // time the pumpkin lands, it's moving faster than when it took off
      // — that's the "weight" the user wanted.
      this.velY += GRAVITY * dt;
      this.posX += this.velX * dt;
      this.posY += this.velY * dt;

      // Land — clean stop, no bounce. The natural arc above already
      // does all the easing.
      if (this.posY >= this.baseY) {
        this.posY = this.baseY;
        this.velY = 0;
        this.velX = 0;
        this.isAirborne = false;
        this.cooldownTimer = COOLDOWN;
      }
    } else {
      // Tick down cooldown, then kick off a new hop.
      this.cooldownTimer -= dt;
      if (this.cooldownTimer <= 0) {
        this.velY = -HOP_VEL;
        this.velX = this.facing * HOP_HORIZ;
        this.isAirborne = true;
      }
    }

    // Bounds. Pin and flip if a hop would leave the platform. Mirror the
    // in-flight horizontal velocity so the rest of the current hop carries
    // it the other way (reads as "bounced off an invisible wall").
    if (this.posX < this.minX) {
      this.posX = this.minX;
      this.facing = 1;
      if (this.isAirborne) this.velX = Math.abs(this.velX);
    } else if (this.posX > this.maxX) {
      this.posX = this.maxX;
      this.facing = -1;
      if (this.isAirborne) this.velX = -Math.abs(this.velX);
    }

    this.syncSprite();
  }

  private syncSprite(): void {
    this.sprite.x = this.posX;
    this.sprite.y = this.posY;
    this.sprite.scale.set(this.facing, 1);
  }
}

// Drawn around (0, 0) with the base at y=0. 7 wide × 8 tall.
//
// Silhouette is built as three rows of decreasing-then-increasing width
// to give a clearly ROUND shape at this tiny scale:
//
//      .█████.   y=-6  tapered top (5 wide)
//      ███████   y=-5  widest band (7 wide)
//      ███████   y=-4
//      ███████   y=-3
//      ███████   y=-2
//      .█████.   y=-1  tapered bottom (5 wide)
//
// Then a top highlight (lit from upper-left), a right-side shadow column,
// a darker bottom row for grounding, and a single centre rib so the gourd
// reads as having lobes without looking like a jack-o'-lantern.
function drawPumpkin(g: Graphics): void {
  const orange = DB32.tahitiGold;
  const orangeHi = DB32.twine;
  const orangeShadow = DB32.rope;
  const stem = DB32.dell;
  const stemHi = DB32.eltGreen;

  // Stem — 2 px wide × 2 tall, on top centre, slightly inset.
  g.rect(-1, -8, 2, 2).fill(stem);
  g.rect(-1, -8, 1, 2).fill(stemHi);

  // Body fill — 3 rectangles forming the rounded silhouette.
  g.rect(-2, -6, 5, 1).fill(orange); // top tapered row
  g.rect(-3, -5, 7, 4).fill(orange); // middle widest band
  g.rect(-2, -1, 5, 1).fill(orange); // bottom tapered row

  // Lit highlight along the top + upper-left curve — sells the "round".
  g.rect(-1, -6, 3, 1).fill(orangeHi);
  g.rect(-3, -5, 1, 1).fill(orangeHi);

  // Right-side shadow column (light comes from upper-left, so the
  // right edge falls into shadow).
  g.rect(3, -5, 1, 4).fill(orangeShadow);

  // Bottom darkening — the tapered bottom row uses the shadow tone so
  // the pumpkin reads as "resting on the ground" rather than floating.
  g.rect(-2, -1, 5, 1).fill(orangeShadow);

  // Single centre rib — a 1-px shadow line down the middle of the body.
  // Two ribs felt busy at this size; one rib reads as the central lobe
  // crease and that's enough to suggest the gourd's shape.
  g.rect(0, -5, 1, 4).fill(orangeShadow);
}
