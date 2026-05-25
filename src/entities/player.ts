import { COYOTE_TIME, DB32, JUMP_BUFFER, JUMP_RELEASE_MULT, JUMP_VELOCITY, WALK_SPEED } from '@constants';
import { type Input, KEYS_JUMP, KEYS_LEFT, KEYS_RIGHT } from '@systems/input';
import { type Body, stepPhysics } from '@systems/physics';
import type { Vec2 } from '@types';
import type { Tilemap } from '@world/tilemap';
import { Graphics } from 'pixi.js';

// Walk-cycle angular frequency (rad/s). One sin period spans both feet — at
// 8 rad/s a full cycle is ≈0.78 s and you see roughly 2.5 footstep transitions
// per second. Tweak if the cadence feels off vs WALK_SPEED.
const WALK_CYCLE_FREQ = 8;

// Procedural figure. Geometry is redrawn from scratch every frame so that the
// feet, arm, and body-bob can animate as pure integer-pixel offsets — no
// `scale` tricks, which would break pixel-art rendering for a fractional
// frame. Cost is ~20 rect() calls per frame, well below anything that matters.
//
// The character is composed bottom-up around (0, 0): feet at the origin, head
// at negative y. That puts the natural anchor at the AABB body's bottom-center
// (`pos.x + size.x/2`, `pos.y + size.y`), so no pivot offset is needed.

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

  constructor(x: number, y: number) {
    this.pos = { x, y };
    this.sprite = new Graphics();
    this.syncSprite();
  }

  update(input: Input, dt: number, tilemap: Tilemap): void {
    this.elapsedTime += dt;

    // 1. Coyote timer: refreshed while on ground, counts down once airborne.
    if (this.onGround) {
      this.coyoteTimer = COYOTE_TIME;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }
    this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);

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

    this.syncSprite();
  }

  // Rebuild the figure each frame so feet, arm, and body-bob can swing as
  // 1-pixel integer offsets. Stays pixel-perfect — no scale-based animation.
  // Cost is ~20 rect() calls/frame.
  //
  // Visual brief: a small hooded cartographer in a pale near-white cloak,
  // with two gray-white boots and a darker satchel strap doubling as the
  // visible arm. Three poses:
  //   - idle   : feet at rest, arm at rest
  //   - walk   : feet alternate horizontal offsets, arm swings opposite, body
  //              bobs up 1 px at each mid-stride
  //   - jump   : feet tucked together, arm raised diagonally up-and-forward
  private drawFigure(): void {
    const g = this.sprite;
    g.clear();

    // Palette
    const cloak = DB32.lightSteel; // pale near-white wool — main body
    const cloakHi = DB32.white; // pure white — top-edge highlight
    const cloakLo = DB32.heather; // muted blue-gray — hem shadow
    const inside = DB32.valhalla; // deep shadow inside the hood
    const eye = DB32.twine; // single warm pixel — the only visible spot of skin
    const boots = DB32.heather; // gray-white boots, harmonize with the cloak
    const strap = DB32.dimGray; // satchel strap / arm (darker, reads against the pale cloak)

    // Animation state.
    //   phase ∈ [-1, +1]      — sine wave that drives the walk
    //   stepOffset ∈ {-1, 0, +1} — quantized step swing
    //   bodyBob ∈ {0, -1}      — 1-pixel vertical bounce at mid-stride
    const airborne = !this.onGround;
    const walking = this.onGround && this.vel.x !== 0;
    const phase = walking ? Math.sin(this.elapsedTime * WALK_CYCLE_FREQ) : 0;
    const stepOffset = Math.round(phase);
    const bodyBob = walking ? -Math.round(Math.abs(phase)) : 0;

    // Feet — two 2×2 boots with a 2-pixel gap between them at rest.
    //   walking : left foot swings +stepOffset, right foot swings -stepOffset
    //             (always moving opposite — looks like alternating strides)
    //   jumping : both feet pulled together at center
    if (airborne) {
      g.rect(-2, -2, 2, 2).fill(boots);
      g.rect(0, -2, 2, 2).fill(boots);
    } else {
      g.rect(-3 + stepOffset, -2, 2, 2).fill(boots);
      g.rect(1 - stepOffset, -2, 2, 2).fill(boots);
    }

    // Cloak — main body. 10 wide × 8 tall. Top row is highlighted, bottom row
    // is shaded; the two thin bands give volume without needing a real outline.
    // The whole upper body shifts by `bodyBob` while walking.
    g.rect(-5, -10 + bodyBob, 10, 8).fill(cloak);
    g.rect(-5, -10 + bodyBob, 10, 1).fill(cloakHi);
    g.rect(-5, -3 + bodyBob, 10, 1).fill(cloakLo);

    // Hood — 8 wide × 6 tall, sits flush on top of the cloak.
    g.rect(-4, -16 + bodyBob, 8, 6).fill(cloak);
    g.rect(-4, -16 + bodyBob, 8, 1).fill(cloakHi);

    // Inside the hood: deep shadow + a single warm pixel for the eye. The eye
    // sits on the +x side so scale.x = -1 mirroring puts it on whichever side
    // the character faces.
    g.rect(-3, -15 + bodyBob, 6, 4).fill(inside);
    g.rect(1, -13 + bodyBob, 1, 1).fill(eye);

    // Arm — drawn as a 4-pixel diagonal "strap" across the cloak.
    //   walking : shifts horizontally opposite to the step (arm/leg in
    //             counter-phase reads as natural gait)
    //   jumping : raised diagonally up-and-forward — the "leap" pose
    //   idle    : at base position
    if (airborne) {
      g.rect(0, -10, 1, 1).fill(strap);
      g.rect(1, -11, 1, 1).fill(strap);
      g.rect(2, -12, 1, 1).fill(strap);
      g.rect(3, -13, 1, 1).fill(strap);
    } else {
      const armDx = -stepOffset;
      g.rect(-4 + armDx, -7 + bodyBob, 1, 1).fill(strap);
      g.rect(-3 + armDx, -6 + bodyBob, 1, 1).fill(strap);
      g.rect(-2 + armDx, -5 + bodyBob, 1, 1).fill(strap);
      g.rect(-1 + armDx, -4 + bodyBob, 1, 1).fill(strap);
    }
  }

  // Position is kept as floats here — the PixiJS Application has roundPixels
  // enabled, which rounds renderables once at render time. Rounding here as
  // well would compound with the camera/world container's own rounding and
  // produce a 1-pixel horizontal jitter during smooth scrolling.
  //
  // scale.x = ±1 mirrors the figure in place around its vertical axis (the
  // character is drawn symmetrically around x=0, so the mirror reads as
  // "facing left"). scale.y stays at 1: any non-integer scale would break
  // pixel-art rendering.
  private syncSprite(): void {
    this.drawFigure();
    this.sprite.x = this.pos.x + this.size.x / 2;
    this.sprite.y = this.pos.y + this.size.y;
    this.sprite.scale.set(this.facing, 1);
  }
}
