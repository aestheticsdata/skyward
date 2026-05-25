import { GRAVITY, GRAVITY_FALL_MULT, TERMINAL_VELOCITY, TILE_SIZE } from '@constants';
import type { Vec2 } from '@types';
import type { Tilemap } from '@world/tilemap';

// Any dynamic body in the world (player today; NPCs, falling props later).
export interface Body {
  pos: Vec2; // top-left corner in logical pixels
  vel: Vec2; // px/s
  size: Vec2; // width/height in logical pixels
  onGround: boolean; // set by stepPhysics each tick
  // If true, stepPhysics skips its normal gravity/terminal-velocity step —
  // the caller is responsible for applying swim physics to `vel.y` instead.
  swimming?: boolean;
}

// Advance one body by dt:
//   1. Apply asymmetric gravity — but ONLY while airborne. Adding gravity at
//      rest on the ground accumulates sub-pixel drift between snap-to-ground
//      passes and renders as a 1-pixel jitter.
//   2. Cap fall speed at TERMINAL_VELOCITY.
//   3. Move X, then resolve X collision against the tilemap.
//   4. Move Y, then resolve Y collision (also sets onGround).
//   5. Probe ground: if we ended this frame not flagged grounded but a solid
//      tile is directly under our feet, snap and re-flag. Catches the static
//      rest case where resolveY does nothing because vel.y is exactly 0.
//
// Axis-separated AABB collision: doing X and Y as two separate passes makes
// wall-slide behave naturally and prevents corner-grab artifacts.
export function stepPhysics(body: Body, tilemap: Tilemap, dt: number): void {
  const wasGrounded = body.onGround;

  // Normal gravity is skipped when the body is swimming — swim physics is
  // owned by the entity (see Player.update). stepPhysics still does the
  // position update and tile collision so swimming bodies bonk on walls
  // and floors the same way.
  if (!body.swimming) {
    if (!wasGrounded) {
      // Airborne: normal asymmetric gravity.
      const g = body.vel.y < 0 ? GRAVITY : GRAVITY * GRAVITY_FALL_MULT;
      body.vel.y += g * dt;
    } else if (body.vel.y > 0) {
      // Grounded with leftover downward velocity (would be accumulated drift):
      // clear it. vel.y < 0 here means a jump impulse was just applied — leave
      // that alone.
      body.vel.y = 0;
    }
    if (body.vel.y > TERMINAL_VELOCITY) body.vel.y = TERMINAL_VELOCITY;
  }

  // Each frame starts not-grounded; physics below may flag it back to true.
  body.onGround = false;

  body.pos.x += body.vel.x * dt;
  resolveX(body, tilemap);

  body.pos.y += body.vel.y * dt;
  resolveY(body, tilemap);

  if (!body.onGround && body.vel.y >= 0) {
    probeGround(body, tilemap);
  }
}

// X collision uses a 1px vertical inset so the body doesn't catch on tile
// corners while sliding along a wall.
function resolveX(body: Body, tilemap: Tilemap): void {
  if (body.vel.x === 0) return;

  const tileTop = Math.floor((body.pos.y + 1) / TILE_SIZE);
  const tileBottom = Math.floor((body.pos.y + body.size.y - 1) / TILE_SIZE);

  if (body.vel.x > 0) {
    const tileX = Math.floor((body.pos.x + body.size.x - 1) / TILE_SIZE);
    for (let ty = tileTop; ty <= tileBottom; ty++) {
      if (tilemap.isSolid(tileX, ty)) {
        body.pos.x = tileX * TILE_SIZE - body.size.x;
        body.vel.x = 0;
        return;
      }
    }
  } else {
    const tileX = Math.floor(body.pos.x / TILE_SIZE);
    for (let ty = tileTop; ty <= tileBottom; ty++) {
      if (tilemap.isSolid(tileX, ty)) {
        body.pos.x = (tileX + 1) * TILE_SIZE;
        body.vel.x = 0;
        return;
      }
    }
  }
}

// Y collision also uses a 1px horizontal inset for the same reason.
function resolveY(body: Body, tilemap: Tilemap): void {
  if (body.vel.y === 0) return;

  const tileLeft = Math.floor((body.pos.x + 1) / TILE_SIZE);
  const tileRight = Math.floor((body.pos.x + body.size.x - 1) / TILE_SIZE);

  if (body.vel.y > 0) {
    // Falling — check the row at the body's feet.
    const tileY = Math.floor((body.pos.y + body.size.y - 1) / TILE_SIZE);
    for (let tx = tileLeft; tx <= tileRight; tx++) {
      if (tilemap.isSolid(tx, tileY)) {
        body.pos.y = tileY * TILE_SIZE - body.size.y;
        body.vel.y = 0;
        body.onGround = true;
        return;
      }
    }
  } else {
    // Rising — bonk on a ceiling tile.
    const tileY = Math.floor(body.pos.y / TILE_SIZE);
    for (let tx = tileLeft; tx <= tileRight; tx++) {
      if (tilemap.isSolid(tx, tileY)) {
        body.pos.y = (tileY + 1) * TILE_SIZE;
        body.vel.y = 0;
        return;
      }
    }
  }
}

// Check the tile directly below the body. If solid, snap to its top and flag
// grounded. Called when resolveY didn't trigger (vel.y === 0) — i.e., static
// rest. Without this, onGround would flicker false every frame at rest.
function probeGround(body: Body, tilemap: Tilemap): void {
  const tileLeft = Math.floor((body.pos.x + 1) / TILE_SIZE);
  const tileRight = Math.floor((body.pos.x + body.size.x - 1) / TILE_SIZE);
  const tileBelow = Math.floor((body.pos.y + body.size.y) / TILE_SIZE);

  for (let tx = tileLeft; tx <= tileRight; tx++) {
    if (tilemap.isSolid(tx, tileBelow)) {
      body.pos.y = tileBelow * TILE_SIZE - body.size.y;
      body.onGround = true;
      return;
    }
  }
}
