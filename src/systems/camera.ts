import { CAMERA_SMOOTHING_RATE, SCREEN_HEIGHT, SCREEN_WIDTH, TILE_SIZE } from '@constants';
import type { Vec2 } from '@types';
import type { Tilemap } from '@world/tilemap';
import type { Container } from 'pixi.js';

// A simple 2D follow-camera. Tracks a target world point with exponential
// smoothing on both axes and clamps to the level rectangle so we never reveal
// out-of-bounds space.
export class Camera {
  // Top-left of the viewport in world (logical) pixels.
  readonly pos: Vec2 = { x: 0, y: 0 };

  // Where pos is lerping toward. Set by follow().
  readonly target: Vec2 = { x: 0, y: 0 };

  private readonly worldWidth: number;
  private readonly worldHeight: number;

  constructor(tilemap: Tilemap) {
    this.worldWidth = tilemap.width * TILE_SIZE;
    this.worldHeight = tilemap.height * TILE_SIZE;
  }

  // Aim the camera so that the world point (cx, cy) sits at the screen center.
  // Clamped so the viewport never extends past the level boundary.
  follow(cx: number, cy: number): void {
    const maxX = Math.max(0, this.worldWidth - SCREEN_WIDTH);
    const maxY = Math.max(0, this.worldHeight - SCREEN_HEIGHT);
    this.target.x = clamp(cx - SCREEN_WIDTH / 2, 0, maxX);
    this.target.y = clamp(cy - SCREEN_HEIGHT / 2, 0, maxY);
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
  // Rounding to integer keeps the upscaled pixel art crisp.
  applyTo(container: Container): void {
    container.x = -Math.round(this.pos.x);
    container.y = -Math.round(this.pos.y);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
