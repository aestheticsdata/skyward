import { Graphics } from 'pixi.js';

// A purely visual world element — tree, bush, rock, mushroom, etc. No state,
// no interaction. Lives in the world container so it scrolls with the camera.
//
// Drawing convention matches Landmark: the spec draws around origin (0, 0)
// with the visible base sitting on the y=0 line; everything else extends
// into negative y. The Decoration just positions the Graphics at spec.x/y.
export interface DecorationSpec {
  x: number;
  y: number;
  draw(g: Graphics): void;
}

export class Decoration {
  readonly sprite: Graphics;

  constructor(spec: DecorationSpec) {
    this.sprite = new Graphics();
    this.sprite.x = spec.x;
    this.sprite.y = spec.y;
    spec.draw(this.sprite);
  }
}
