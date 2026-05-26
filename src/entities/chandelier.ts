import { DB32 } from '@constants';
import type { Entity } from '@entities/entity';
import { Container, Graphics } from 'pixi.js';

// 6 Hz — same cadence as the wall candle so the chandelier and tall
// candles flicker on the same beat. Looks like a single coherent lighting
// system in the crypt.
const FLAME_FREQUENCY = 6;

// A small iron chandelier that hangs from the ceiling on a single chain
// and burns two candles. Drawn around (0, 0) with the chain top at y=0
// (the entity's anchor is the ceiling-attachment point) extending DOWN
// into positive y. Drop it at the world Y of the ceiling underside.
//
// Geometry (12 wide × 10 tall, plus 3 px of flame above the candles):
//
//        flame  chain  flame      ← y = 0 (ceiling) to y = 3
//          candle   candle        ← y = 4 to y = 7
//        ============             ← y = 8 to y = 9 (iron frame bar)
//
// The chain is a single 2-px-wide line down the centre. The frame is a
// 12-wide iron bar. Two wax candles stand on the frame at x = ±5,
// horizontally offset from the chain so nothing visually overlaps.
//
// Animation strategy is the same as TallCandle: the body (chain + frame +
// candles + wicks) is static, only the flame Graphics is cleared and
// redrawn on the frames where its 2-state phase index flips.
export class Chandelier implements Entity {
  readonly sprite: Container;
  private readonly body: Graphics;
  private readonly flames: Graphics;
  private elapsedTime = 0;
  private currentFlameFrame = -1;

  constructor(x: number, y: number) {
    this.sprite = new Container();
    this.sprite.x = x;
    this.sprite.y = y;

    this.body = new Graphics();
    drawChandelierBody(this.body);
    this.sprite.addChild(this.body);

    this.flames = new Graphics();
    this.sprite.addChild(this.flames);
    this.updateFlames(0);
    this.currentFlameFrame = 0;
  }

  update(dt: number): void {
    this.elapsedTime += dt;
    const frame = Math.floor(this.elapsedTime * FLAME_FREQUENCY) & 1;
    if (frame !== this.currentFlameFrame) {
      this.currentFlameFrame = frame;
      this.updateFlames(frame);
    }
  }

  private updateFlames(frame: number): void {
    this.flames.clear();
    drawChandelierFlames(this.flames, frame);
  }
}

// Chain + iron frame + two wax candles. Static — built once.
function drawChandelierBody(g: Graphics): void {
  const iron = DB32.dimGray;
  const ironHi = DB32.heather;
  const ironShadow = DB32.valhalla;
  const wax = DB32.lightSteel;
  const waxHi = DB32.white;
  const waxShadow = DB32.heather;
  const wick = DB32.valhalla;

  // Chain — 2 px wide, 8 tall, hanging from the ceiling at the centre.
  g.rect(-1, 0, 2, 8).fill(iron);
  g.rect(-1, 0, 1, 8).fill(ironHi);

  // Iron frame bar — 12 wide × 2 tall, sitting at the bottom of the chain.
  g.rect(-6, 8, 12, 2).fill(iron);
  g.rect(-6, 8, 12, 1).fill(ironHi);
  g.rect(-6, 9, 12, 1).fill(ironShadow);

  // Decorative drop-pixels at the far ends of the frame — gives the bar
  // visual "weight" so it doesn't look like a floating line.
  g.rect(-7, 9, 1, 1).fill(ironShadow);
  g.rect(6, 9, 1, 1).fill(ironShadow);

  // Left wax candle — 2 wide × 4 tall, standing on the frame at x=-5.
  // Candle extends UPWARD from the frame (smaller y values), so it sits
  // BETWEEN the chain (centre) and the frame's left end.
  g.rect(-5, 4, 2, 4).fill(wax);
  g.rect(-5, 4, 2, 1).fill(waxHi);
  g.rect(-4, 4, 1, 4).fill(waxShadow);

  // Right wax candle — mirror of the left.
  g.rect(3, 4, 2, 4).fill(wax);
  g.rect(3, 4, 2, 1).fill(waxHi);
  g.rect(4, 4, 1, 4).fill(waxShadow);

  // Wicks — 1 px dark pixel poking out of each candle's top centre.
  g.rect(-4, 3, 1, 1).fill(wick);
  g.rect(4, 3, 1, 1).fill(wick);
}

// Two flickering flames. Same 2-frame trick as TallCandle (tall/narrow vs
// wide/squat) but mirrored — both flames flicker in sync, which reads as
// the whole chandelier "breathing" rather than individual candles being
// out of phase. Atmospheric.
function drawChandelierFlames(g: Graphics, frame: number): void {
  const core = DB32.white;
  const body = DB32.goldenFizz;
  const halo = DB32.tahitiGold;

  const leftX = -5;
  const rightX = 3;

  if (frame === 0) {
    // Tall narrow tongues.
    for (const fx of [leftX, rightX]) {
      g.rect(fx, 0, 2, 1).fill(body); // tip
      g.rect(fx, 1, 2, 2).fill(body); // body
      g.rect(fx + 1, 1, 1, 1).fill(core); // bright core
    }
  } else {
    // Wider squatter flames with side haloes.
    for (const fx of [leftX, rightX]) {
      g.rect(fx, 1, 2, 2).fill(body);
      g.rect(fx, 1, 2, 1).fill(core);
      g.rect(fx - 1, 1, 1, 1).fill(halo);
      g.rect(fx + 2, 1, 1, 1).fill(halo);
    }
  }
}
