import { DB32, DEFAULT_SCALE, LANDMARK_INTERACT_RANGE_X, LANDMARK_INTERACT_RANGE_Y } from '@constants';
import type { Vec2 } from '@types';
import { Container, Graphics, Text } from 'pixi.js';

// Half the height of a landmark body. Used to compute the y-center of the
// interaction zone (which sits in the middle of the visible column, not at
// its base).
const LANDMARK_HALF_HEIGHT = 8;

// Static description of a landmark: where it sits in the world, plus the
// content of its sketchbook page when discovered.
export interface LandmarkSpec {
  id: string;
  // World position of the landmark's base (the point where it touches a tile).
  x: number;
  y: number;
  name: string;
  description: string;
  // Populate the given Graphics with the in-world body. Drawn around the
  // origin (0, 0): feet at the origin, body extending into negative y.
  // `discovered` flips the palette to the muted "logged" state.
  drawBody(g: Graphics, discovered: boolean): void;
  // Populate the given Graphics with the sketchbook illustration. Drawn
  // around the origin (0, 0); the sketchbook positions the result inside
  // the frame.
  drawSketch(g: Graphics): void;
}

// Which prompt is currently displayed above the landmark:
//   - 'tutorial': full "press E" tooltip (shown once, before the player has
//                 ever discovered a landmark)
//   - 'simple':   small "!" indicator (used afterward)
//   - null:       hidden
export type PromptMode = 'tutorial' | 'simple' | null;

// A landmark in the world. Owns its in-world sprite (base + column + cap),
// its proximity prompt (tutorial tooltip or simple indicator), and a
// "discovered" flag that desaturates the sprite once documented.
export class Landmark {
  readonly spec: LandmarkSpec;
  discovered = false;
  readonly sprite: Container;

  private body: Graphics;
  private prompt: Container | null = null;
  private promptMode: PromptMode = null;

  constructor(spec: LandmarkSpec) {
    this.spec = spec;
    this.sprite = new Container();
    this.sprite.x = spec.x;
    this.sprite.y = spec.y;
    this.body = this.makeBody();
    this.sprite.addChild(this.body);
  }

  // True if the player's center is inside the interaction zone.
  isPlayerInRange(playerPos: Vec2, playerSize: Vec2): boolean {
    const px = playerPos.x + playerSize.x / 2;
    const py = playerPos.y + playerSize.y / 2;
    const dx = Math.abs(px - this.spec.x);
    const dy = Math.abs(py - (this.spec.y - LANDMARK_HALF_HEIGHT));
    return dx <= LANDMARK_INTERACT_RANGE_X && dy <= LANDMARK_INTERACT_RANGE_Y;
  }

  setPromptMode(mode: PromptMode): void {
    if (this.promptMode === mode) return;
    if (this.prompt) {
      this.sprite.removeChild(this.prompt);
      this.prompt.destroy({ children: true });
      this.prompt = null;
    }
    this.promptMode = mode;
    if (mode !== null) {
      this.prompt = mode === 'tutorial' ? this.makeTutorialPrompt() : this.makeSimplePrompt();
      this.sprite.addChild(this.prompt);
    }
  }

  markDiscovered(): void {
    if (this.discovered) return;
    this.discovered = true;
    this.setPromptMode(null);
    // Note: we intentionally do NOT re-render the body in a "logged" palette.
    // Discovered landmarks keep their original look so the world doesn't
    // lose color over time; the only state change is the prompt going away.
  }

  // The visual is drawn with its origin at the BASE (where it sits on a tile).
  // Per-landmark geometry comes from `spec.drawBody()` — different landmarks
  // have very different shapes (column, cairn, arch, tree, crystal). This
  // class just owns the lifecycle.
  //
  // We always pass `false` as the discovered flag here: per the design above,
  // the in-world appearance never changes after discovery. The flag is kept
  // on the `LandmarkSpec` interface in case a future design wants it.
  private makeBody(): Graphics {
    const g = new Graphics();
    this.spec.drawBody(g, false);
    return g;
  }

  // Small "!" indicator hovering above the landmark — used after the player
  // has learned the interaction.
  private makeSimplePrompt(): Container {
    const c = new Container();
    const g = new Graphics();
    g.rect(-1, -25, 2, 4).fill(DB32.goldenFizz);
    g.rect(-1, -20, 2, 2).fill(DB32.goldenFizz);
    c.addChild(g);
    return c;
  }

  // Full "press E" tooltip — shown the first time the player is in range,
  // before they've ever discovered anything.
  private makeTutorialPrompt(): Container {
    const c = new Container();
    const text = new Text({
      text: 'press E',
      style: { fontFamily: 'monospace', fontSize: 7, fill: DB32.valhalla },
    });
    text.resolution = DEFAULT_SCALE;
    const pad = 3;
    const w = Math.ceil(text.width);
    const h = Math.ceil(text.height);
    const boxBottom = -19; // a couple of px above the landmark cap
    const boxTop = boxBottom - h - pad * 2;

    const bg = new Graphics()
      .rect(-w / 2 - pad, boxTop, w + pad * 2, boxBottom - boxTop)
      .fill(DB32.pancho)
      .stroke({ color: DB32.oiledCedar, width: 1 });
    text.position.set(-w / 2, boxTop + pad);

    c.addChild(bg);
    c.addChild(text);
    return c;
  }
}
