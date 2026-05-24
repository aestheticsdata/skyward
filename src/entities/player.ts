import {
  AIR_STRETCH_AMOUNT,
  COYOTE_TIME,
  DB32,
  JUMP_BUFFER,
  JUMP_RELEASE_MULT,
  JUMP_VELOCITY,
  LANDING_SQUASH_AMOUNT,
  LANDING_SQUASH_DURATION,
  WALK_BOB_AMPLITUDE,
  WALK_BOB_FREQUENCY,
  WALK_SPEED,
} from '@constants';
import { type Input, KEYS_JUMP, KEYS_LEFT, KEYS_RIGHT } from '@systems/input';
import { type Body, stepPhysics } from '@systems/physics';
import type { Vec2 } from '@types';
import type { Tilemap } from '@world/tilemap';
import { Graphics } from 'pixi.js';

// Velocity range used to map vel.y → airborne stretch/squash.
const AIR_STRETCH_VELOCITY_REF = 300;

export class Player implements Body {
  pos: Vec2;
  vel: Vec2 = { x: 0, y: 0 };
  readonly size: Vec2 = { x: 12, y: 16 };
  onGround = false;
  readonly sprite: Graphics;

  // Jump-feel timers (count DOWN; > 0 means active).
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;

  // Animation state.
  private facing: 1 | -1 = 1;
  private elapsedTime = 0;
  private landingTimer = 0;

  constructor(x: number, y: number) {
    this.pos = { x, y };

    // The eye intentionally lives only on one side. With the sprite mirrored
    // via scale.x = -1 it visually "leads" the direction the player is facing.
    this.sprite = new Graphics()
      .rect(0, 0, this.size.x, this.size.y)
      .fill(DB32.cornflower)
      .rect(7, 5, 2, 2)
      .fill(DB32.white);

    // Pivot at the bottom-center: scale.y stretches from the feet (no sinking
    // into the floor) and scale.x = -1 mirrors in place instead of translating.
    this.sprite.pivot.set(this.size.x / 2, this.size.y);

    this.syncSprite();
  }

  update(input: Input, dt: number, tilemap: Tilemap): void {
    this.elapsedTime += dt;
    const wasGrounded = this.onGround;

    // 1. Coyote timer: refreshed while on ground, counts down once airborne.
    if (this.onGround) {
      this.coyoteTimer = COYOTE_TIME;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }
    this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    this.landingTimer = Math.max(0, this.landingTimer - dt);

    // 2. Buffer jump presses so an early press still triggers a jump on landing.
    if (input.isAnyPressed(KEYS_JUMP)) {
      this.jumpBufferTimer = JUMP_BUFFER;
    }

    // 3. Horizontal target velocity + facing direction.
    let move = 0;
    if (input.isAnyDown(KEYS_LEFT)) move -= 1;
    if (input.isAnyDown(KEYS_RIGHT)) move += 1;
    this.vel.x = move * WALK_SPEED;
    if (move > 0) this.facing = 1;
    else if (move < 0) this.facing = -1;

    // 4. Trigger jump if both timers are active.
    if (this.coyoteTimer > 0 && this.jumpBufferTimer > 0) {
      this.vel.y = -JUMP_VELOCITY;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
    }

    // 5. Variable jump height.
    if (this.vel.y < 0 && input.isAnyReleased(KEYS_JUMP)) {
      this.vel.y *= JUMP_RELEASE_MULT;
    }

    // 6. Gravity + position + tilemap collision.
    stepPhysics(this, tilemap, dt);

    // 7. Detect landing (airborne → grounded transition) and kick off squash.
    if (this.onGround && !wasGrounded) {
      this.landingTimer = LANDING_SQUASH_DURATION;
    }

    this.syncSprite();
  }

  // The sprite is positioned at the body's bottom-center to match its pivot.
  private syncSprite(): void {
    this.sprite.x = Math.round(this.pos.x + this.size.x / 2);
    this.sprite.y = Math.round(this.pos.y + this.size.y);
    this.sprite.scale.set(this.facing, this.computeScaleY());
  }

  // Visual state priority: landing impact > airborne stretch > walking bob > rest.
  private computeScaleY(): number {
    if (this.landingTimer > 0) {
      // Linear recovery from the initial squash back to 1.
      const t = this.landingTimer / LANDING_SQUASH_DURATION;
      return 1 - LANDING_SQUASH_AMOUNT * t;
    }
    if (!this.onGround) {
      // Stretch while rising, squash while falling. vel.y clamped so terminal
      // velocity doesn't push the squash beyond AIR_STRETCH_AMOUNT.
      const v = Math.max(-AIR_STRETCH_VELOCITY_REF, Math.min(AIR_STRETCH_VELOCITY_REF, this.vel.y));
      return 1 + (-v / AIR_STRETCH_VELOCITY_REF) * AIR_STRETCH_AMOUNT;
    }
    if (this.vel.x !== 0) {
      return 1 + Math.sin(this.elapsedTime * WALK_BOB_FREQUENCY) * WALK_BOB_AMPLITUDE;
    }
    return 1;
  }
}
