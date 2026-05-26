import { CAMERA_SMOOTHING_RATE, SCREEN_HEIGHT, SCREEN_WIDTH, TILE_SIZE } from '@constants';
import type { Vec2 } from '@types';
import type { Tilemap } from '@world/tilemap';
import type { Container } from 'pixi.js';

// A simple 2D follow-camera. Tracks a target world point with exponential
// smoothing on both axes and clamps horizontally + at the world floor so we
// never reveal underground out-of-bounds space. The top is intentionally
// unclamped: the player can jump above the world's top row from high
// platforms, and the Pixi stage background (cornflower) matches the sky, so
// revealing extra space above the level just looks like more sky.
//
// The world bounds are mutable — `setBounds()` reconfigures the clamp when
// the active level changes (meadow → keep, etc.). One Camera instance per
// session, reused across transitions.
export class Camera {
  // Top-left of the viewport in world (logical) pixels.
  readonly pos: Vec2 = { x: 0, y: 0 };

  // Where pos is lerping toward. Set by follow().
  readonly target: Vec2 = { x: 0, y: 0 };

  private worldWidth: number;
  private worldHeight: number;

  constructor(tilemap: Tilemap) {
    this.worldWidth = tilemap.width * TILE_SIZE;
    this.worldHeight = tilemap.height * TILE_SIZE;
  }

  // Reconfigure the clamp bounds for a new level. Pos isn't snapped here —
  // call snap() after the new follow target is set if you want an instant
  // jump (which Game does on level transitions).
  setBounds(tilemap: Tilemap): void {
    this.worldWidth = tilemap.width * TILE_SIZE;
    this.worldHeight = tilemap.height * TILE_SIZE;
  }

  // Aim the camera so that the world point (cx, cy) sits at the screen center.
  // Clamped horizontally and at the bottom so we never show beyond the level
  // edges or underneath the world floor; the top edge is uncapped so the
  // camera can follow the player above row 0 when they jump from high
  // platforms.
  follow(cx: number, cy: number): void {
    const maxX = Math.max(0, this.worldWidth - SCREEN_WIDTH);
    const maxY = Math.max(0, this.worldHeight - SCREEN_HEIGHT);
    this.target.x = clamp(cx - SCREEN_WIDTH / 2, 0, maxX);
    this.target.y = Math.min(cy - SCREEN_HEIGHT / 2, maxY);
  }

  // Snap to target immediately. Useful on the first frame so the camera
  // doesn't ease in from (0, 0).
  snap(): void {
    this.pos.x = this.target.x;
    this.pos.y = this.target.y;
  }

  // Exponential smoothing toward target. Time-based so a slower framerate
  // produces the same effective motion, not a jerkier one.
  update(dt: number): void {
    const f = 1 - Math.exp(-CAMERA_SMOOTHING_RATE * dt);
    this.pos.x += (this.target.x - this.pos.x) * f;
    this.pos.y += (this.target.y - this.pos.y) * f;
  }

  // Apply the inverse of pos as a translation on the world container.
  // Position is kept as a float — the Application's roundPixels setting
  // rounds at render time. Rounding here as well would cause sub-pixel
  // jitter on entities inside the container (because their own positions
  // also get rounded, and two independent roundings don't align frame-to-frame).
  applyTo(container: Container): void {
    container.x = -this.pos.x;
    container.y = -this.pos.y;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
