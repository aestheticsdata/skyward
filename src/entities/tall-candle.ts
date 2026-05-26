import { DB32 } from '@constants';
import type { Entity } from '@entities/entity';
import { Container, Graphics } from 'pixi.js';

// Frequency (Hz) at which the flame alternates between its two frames.
// 6 Hz feels alive without being epileptic — slow enough to read as
// natural candlelight, fast enough to be unmistakably ANIMATING.
const FLAME_FREQUENCY = 6;

// A tall floor-standing candelabra: iron base + stem + wax candle + a
// flickering flame on top. The body geometry is static (built once); only
// the flame is cleared + redrawn on the frames when its 2-state phase
// flips. Same approach the player uses for footsteps: count up time,
// quantise to integer "frame index," only repaint when the index changes.
//
// Drawn around the origin (0, 0) — foot at y=0, body extending into
// negative y. Same convention as Landmark and Decoration so a single
// `x/y` spec works for placement on any tile.
//
// Visual brief: 6 wide × 16 tall total. From bottom to top —
//   - Iron base (6 wide, 2 tall): dimGray cap with a single highlight
//   - Stem (2 wide, 4 tall): valhalla, taller than the candle is wide
//   - Wax candle (4 wide, 6 tall): pale near-white with a darker side
//   - Wick (1 px), then the flame
// The flame alternates between a "tall narrow" frame and a "wide squat"
// frame — same total area, just redistributed, which reads as flicker.
export class TallCandle implements Entity {
  readonly sprite: Container;
  private readonly body: Graphics;
  private readonly flame: Graphics;
  private elapsedTime = 0;
  private currentFlameFrame = -1; // forces an initial draw

  constructor(x: number, y: number) {
    this.sprite = new Container();
    this.sprite.x = x;
    this.sprite.y = y;

    this.body = new Graphics();
    drawCandleBody(this.body);
    this.sprite.addChild(this.body);

    this.flame = new Graphics();
    this.sprite.addChild(this.flame);
    this.updateFlame(0);
    this.currentFlameFrame = 0;
  }

  update(dt: number): void {
    this.elapsedTime += dt;
    const frame = Math.floor(this.elapsedTime * FLAME_FREQUENCY) & 1;
    if (frame !== this.currentFlameFrame) {
      this.currentFlameFrame = frame;
      this.updateFlame(frame);
    }
  }

  private updateFlame(frame: number): void {
    this.flame.clear();
    drawFlame(this.flame, frame);
  }
}

// Iron base, dark stem, pale candle. Static — never changes after construction.
function drawCandleBody(g: Graphics): void {
  const iron = DB32.dimGray;
  const ironHi = DB32.heather;
  const ironShadow = DB32.valhalla;
  const wax = DB32.lightSteel;
  const waxHi = DB32.white;
  const waxShadow = DB32.heather;

  // Base — wide 6×2 cap at the very bottom.
  g.rect(-3, -2, 6, 2).fill(iron);
  g.rect(-3, -2, 6, 1).fill(ironHi);
  g.rect(-3, -1, 6, 1).fill(ironShadow);

  // Stem — 2 wide × 4 tall, sitting on the base.
  g.rect(-1, -6, 2, 4).fill(iron);
  g.rect(-1, -6, 1, 4).fill(ironHi);

  // Wax candle — 4 wide × 6 tall. The 1-px shadow on the right gives the
  // candle a sense of being cylindrical instead of a flat rectangle.
  g.rect(-2, -12, 4, 6).fill(wax);
  g.rect(-2, -12, 4, 1).fill(waxHi);
  g.rect(1, -12, 1, 6).fill(waxShadow);

  // Wick — single dark pixel poking out of the top centre of the wax.
  g.rect(0, -13, 1, 1).fill(DB32.valhalla);
}

// Flame — two frames. Both burn the same total area, just shaped
// differently, so the eye sees motion without the candle "growing/
// shrinking." Frame 0: tall thin tongue (more vertical). Frame 1:
// wider rounded teardrop (more horizontal).
function drawFlame(g: Graphics, frame: number): void {
  const core = DB32.white;
  const body = DB32.goldenFizz;
  const halo = DB32.tahitiGold;

  if (frame === 0) {
    // Tall narrow flame — 2 wide × 4 tall body + 1-px tongue on top.
    g.rect(-1, -17, 2, 1).fill(body); // tip
    g.rect(-1, -16, 2, 3).fill(body); // body
    g.rect(0, -16, 1, 2).fill(core); // bright core inside body
    g.rect(-2, -15, 1, 1).fill(halo); // left halo
    g.rect(1, -15, 1, 1).fill(halo); // right halo
  } else {
    // Wide squatter flame — 3 wide × 3 tall, with a halo flicker.
    g.rect(-1, -16, 2, 1).fill(body); // top
    g.rect(-2, -15, 4, 2).fill(body); // wider middle
    g.rect(-1, -15, 2, 1).fill(core); // bright core
    g.rect(-3, -14, 1, 1).fill(halo); // left halo (further out)
    g.rect(2, -14, 1, 1).fill(halo); // right halo
  }
}
