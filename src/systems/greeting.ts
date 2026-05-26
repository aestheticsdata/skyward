import { DB32, DEFAULT_SCALE, SCREEN_HEIGHT, SCREEN_WIDTH } from '@constants';
import { Container, Graphics, Text } from 'pixi.js';

// Frame geometry inside the 320×224 logical viewport. Same proportions
// as the Sketchbook overlay so the modals feel related.
const FRAME_X = 40;
const FRAME_Y = 32;
const FRAME_W = 240;
const FRAME_H = 160;

// Where the subject (an oversized rabbit, fish, etc.) is anchored
// inside the frame. The subject is drawn with FEET / BOTTOM at y=0 in
// its local coords; this is the world point of that anchor.
const SUBJECT_CENTER_X = FRAME_X + 60;
const SUBJECT_BOTTOM_Y = FRAME_Y + 130;

// Speech bubble — sits to the upper-right of the subject with a small
// tail of stair-step pixels pointing toward the subject. Width is sized
// so the speech text wraps comfortably (with the BUBBLE_W − 16 inner
// width as the wrap boundary).
const BUBBLE_X = FRAME_X + 95;
const BUBBLE_Y = FRAME_Y + 30;
const BUBBLE_W = 130;
const BUBBLE_H = 60;

// One greeting popup, parameterised per-encounter. `show(spec)` swaps
// the subject drawing and the speech text; the frame, backdrop, and
// "[ move to continue ]" hint stay constant.
export interface GreetingSpec {
  // Per-subject draw function. Called once at show() time on a Graphics
  // anchored at (SUBJECT_CENTER_X, SUBJECT_BOTTOM_Y) and pre-scaled by
  // `subjectScale`. Same drawing convention as the in-world sprite:
  // around (0, 0) with the bottom of the visible body at y=0.
  drawSubject: (g: Graphics) => void;
  // Integer scale applied to the subject. 4× for ~9-px-tall things
  // (rabbit), higher for tinier things (fish at 3 tall) to maintain
  // visual presence in the frame.
  subjectScale: number;
  // The speech line. PixiJS wordWrap handles line breaks based on the
  // bubble's inner width, so the caller doesn't need to split with \n.
  speech: string;
}

// Modal "you just met something" overlay. Reused by Game for the
// first-rabbit and first-fish encounters. Closes when the player
// presses any movement key (Game owns that input check).
export class Greeting {
  readonly container: Container;
  // Per-show content (subject + bubble + speech) — cleared and rebuilt
  // on each show() so a single instance can serve multiple subjects.
  private readonly content: Container;
  private _visible = false;

  constructor() {
    this.container = new Container();
    this.container.visible = false;

    // Dim backdrop behind the frame.
    const backdrop = new Graphics().rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill({ color: DB32.valhalla, alpha: 0.7 });
    this.container.addChild(backdrop);

    // Parchment-coloured frame + 2-px wooden border.
    const frame = new Graphics().rect(FRAME_X, FRAME_Y, FRAME_W, FRAME_H).fill(DB32.pancho);
    const border = new Graphics().rect(FRAME_X, FRAME_Y, FRAME_W, FRAME_H).stroke({ color: DB32.oiledCedar, width: 2 });
    this.container.addChild(frame);
    this.container.addChild(border);

    // Static "move to continue" hint at the bottom of the frame.
    const hint = new Text({
      text: '[ move to continue ]',
      style: { fontFamily: 'monospace', fontSize: 8, fill: DB32.dimGray },
    });
    hint.resolution = DEFAULT_SCALE;
    hint.position.set(FRAME_X + (FRAME_W - Math.ceil(hint.width)) / 2, FRAME_Y + FRAME_H - 16);
    this.container.addChild(hint);

    // Per-show content goes here.
    this.content = new Container();
    this.container.addChild(this.content);
  }

  show(spec: GreetingSpec): void {
    this.clearContent();

    // Subject — drawn at integer scale, positioned with its bottom
    // anchor at the SUBJECT_* coords.
    const subject = new Graphics();
    spec.drawSubject(subject);
    subject.scale.set(spec.subjectScale, spec.subjectScale);
    subject.position.set(SUBJECT_CENTER_X, SUBJECT_BOTTOM_Y);
    this.content.addChild(subject);

    // Speech bubble.
    const bubble = new Graphics();
    bubble.rect(BUBBLE_X, BUBBLE_Y, BUBBLE_W, BUBBLE_H).fill(DB32.lightSteel);
    bubble.rect(BUBBLE_X, BUBBLE_Y, BUBBLE_W, BUBBLE_H).stroke({ color: DB32.valhalla, width: 1 });
    this.content.addChild(bubble);

    // 3-step stair tail pointing down-and-LEFT from the bubble's
    // bottom-left toward the subject (subject sits lower-left).
    const tail = new Graphics();
    const tx = BUBBLE_X + 10;
    const ty = BUBBLE_Y + BUBBLE_H;
    tail.rect(tx, ty, 6, 3).fill(DB32.lightSteel);
    tail.rect(tx - 2, ty + 3, 6, 3).fill(DB32.lightSteel);
    tail.rect(tx - 4, ty + 6, 6, 3).fill(DB32.lightSteel);
    // Tail outline edges so it visually merges with the bubble border.
    tail.rect(tx, ty, 1, 3).fill(DB32.valhalla);
    tail.rect(tx - 2, ty + 3, 1, 3).fill(DB32.valhalla);
    tail.rect(tx - 4, ty + 6, 6, 1).fill(DB32.valhalla);
    tail.rect(tx - 4, ty + 6, 1, 3).fill(DB32.valhalla);
    this.content.addChild(tail);

    // Speech line. PixiJS wordWrap on the bubble's inner width.
    const speech = new Text({
      text: spec.speech,
      style: {
        fontFamily: 'monospace',
        fontSize: 11,
        fill: DB32.valhalla,
        lineHeight: 13,
        wordWrap: true,
        wordWrapWidth: BUBBLE_W - 16,
      },
    });
    speech.resolution = DEFAULT_SCALE;
    speech.position.set(BUBBLE_X + 8, BUBBLE_Y + 8);
    this.content.addChild(speech);

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
    for (const child of this.content.removeChildren()) {
      child.destroy();
    }
  }
}
