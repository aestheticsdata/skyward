import { DB32, DEFAULT_SCALE, SCREEN_HEIGHT, SCREEN_WIDTH } from '@constants';
import type { LandmarkSpec } from '@entities/landmark';
import { Container, Graphics, Text } from 'pixi.js';

// Frame geometry inside the 320×224 logical viewport.
const FRAME_X = 40;
const FRAME_Y = 32;
const FRAME_W = 240;
const FRAME_H = 160;

// Modal overlay shown when the player discovers a landmark. Pauses gameplay
// while visible. Content is rebuilt every show() so each landmark gets its
// own page.
export class Sketchbook {
  readonly container: Container;
  private readonly content: Container;
  private _visible = false;

  constructor() {
    this.container = new Container();
    this.container.visible = false;

    // Dim the world behind the overlay.
    const backdrop = new Graphics().rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill({ color: DB32.valhalla, alpha: 0.7 });
    this.container.addChild(backdrop);

    // Parchment-like frame with a wooden border.
    const frame = new Graphics().rect(FRAME_X, FRAME_Y, FRAME_W, FRAME_H).fill(DB32.pancho);
    const border = new Graphics().rect(FRAME_X, FRAME_Y, FRAME_W, FRAME_H).stroke({ color: DB32.oiledCedar, width: 2 });
    this.container.addChild(frame);
    this.container.addChild(border);

    // Per-page content lives here, recreated each show().
    this.content = new Container();
    this.container.addChild(this.content);
  }

  show(spec: LandmarkSpec): void {
    this.clearContent();

    // Title
    const title = makeText(spec.name, {
      fontFamily: 'monospace',
      fontSize: 14,
      fontWeight: 'bold',
      fill: DB32.valhalla,
    });
    title.position.set(FRAME_X + 12, FRAME_Y + 10);
    this.content.addChild(title);

    // Underline separator
    const sep = new Graphics().rect(FRAME_X + 12, FRAME_Y + 32, FRAME_W - 24, 1).fill(DB32.oiledCedar);
    this.content.addChild(sep);

    // Sketch — provided by the landmark spec. Centered in the left column.
    const sketch = new Graphics();
    spec.drawSketch(sketch);
    sketch.position.set(FRAME_X + 50, FRAME_Y + 110);
    this.content.addChild(sketch);

    // Description on the right column, word-wrapped.
    const description = makeText(spec.description, {
      fontFamily: 'monospace',
      fontSize: 9,
      fill: DB32.valhalla,
      wordWrap: true,
      wordWrapWidth: 130,
      lineHeight: 13,
    });
    description.position.set(FRAME_X + 110, FRAME_Y + 46);
    this.content.addChild(description);

    // Close hint at the bottom.
    const hint = makeText('[ press E to close ]', {
      fontFamily: 'monospace',
      fontSize: 8,
      fill: DB32.dimGray,
    });
    hint.position.set(FRAME_X + (FRAME_W - hint.width) / 2, FRAME_Y + FRAME_H - 16);
    this.content.addChild(hint);

    this._visible = true;
    this.container.visible = true;
  }

  hide(): void {
    this._visible = false;
    this.container.visible = false;
    this.clearContent();
  }

  isVisible(): boolean {
    return this._visible;
  }

  private clearContent(): void {
    // Remove and destroy children so text textures don't pile up.
    for (const child of this.content.removeChildren()) {
      child.destroy();
    }
  }
}

// biome-ignore lint/suspicious/noExplicitAny: Pixi's TextStyle type is awkward to use here.
function makeText(text: string, style: any): Text {
  const t = new Text({ text, style });
  // Render text at the upscale resolution so it stays crisp on screen.
  t.resolution = DEFAULT_SCALE;
  return t;
}
