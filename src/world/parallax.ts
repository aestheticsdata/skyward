import { DB32 } from '@constants';
import type { Camera } from '@systems/camera';
import { Container, Graphics } from 'pixi.js';

// Y position of the silhouette horizon line, in logical pixels.
// Matched to the grass row top so hill peaks rise into the sky band that
// sits above the tilemap.
const HORIZON_Y = 128;

interface ParallaxLayer {
  graphics: Graphics;
  scrollFactor: number; // 1 = same as camera, 0 = static
}

// A stack of distant hill silhouettes. Each layer is a single Graphics polygon;
// its x/y is offset every frame by a fraction of the camera position to fake
// depth. Far layer is drawn first (behind), near layer on top.
export class ParallaxBackground {
  readonly container: Container;
  private readonly layers: ParallaxLayer[] = [];

  constructor(levelWidthPx: number) {
    this.container = new Container();

    // Layer width must cover the visible viewport at any camera position:
    //   layer_width >= screen_width + max_camera_x * scroll_factor
    // Using the level width is generous and works for scroll_factor <= 1.
    const width = levelWidthPx;

    // Far: hazy blue-gray, slower scroll, lower peaks. The tone is close to
    // the cornflower sky on purpose — atmospheric perspective makes distant
    // mountains nearly merge with the sky.
    this.addLayer(
      makeHillSilhouette({
        width,
        horizonY: HORIZON_Y,
        maxHeight: 36,
        pointSpacing: 32,
        frequency: 0.5,
        seed: 1.3,
        color: DB32.heather,
      }),
      0.3,
    );

    // Near: dark green-gray, faster scroll, taller and more jagged. The
    // contrast vs the far layer is what reads as "depth."
    this.addLayer(
      makeHillSilhouette({
        width,
        horizonY: HORIZON_Y,
        maxHeight: 56,
        pointSpacing: 16,
        frequency: 0.8,
        seed: 2.7,
        color: DB32.opal,
      }),
      0.6,
    );
  }

  update(camera: Camera): void {
    // Float positions — the Application's roundPixels rounds once at render
    // time. See camera.ts / player.ts for the same reasoning.
    for (const layer of this.layers) {
      layer.graphics.x = -camera.pos.x * layer.scrollFactor;
      layer.graphics.y = -camera.pos.y * layer.scrollFactor;
    }
  }

  private addLayer(graphics: Graphics, scrollFactor: number): void {
    this.container.addChild(graphics);
    this.layers.push({ graphics, scrollFactor });
  }
}

interface HillSilhouetteOptions {
  width: number;
  horizonY: number;
  maxHeight: number;
  pointSpacing: number;
  frequency: number;
  seed: number;
  color: number;
}

// Generate an organic hill silhouette as a filled polygon. The top edge is
// formed by sampling a multi-octave sine; the bottom is closed off below the
// horizon so the fill extends down behind the tilemap.
function makeHillSilhouette(opts: HillSilhouetteOptions): Graphics {
  const numPoints = Math.floor(opts.width / opts.pointSpacing) + 1;
  const points: number[] = [];

  for (let i = 0; i < numPoints; i++) {
    const x = (i / (numPoints - 1)) * opts.width;
    const t = i * opts.frequency;
    const h =
      (Math.sin(t + opts.seed) * 0.5 +
        Math.sin(t * 2.3 + opts.seed * 1.7) * 0.3 +
        Math.sin(t * 4.1 + opts.seed * 2.4) * 0.2) *
        0.5 +
      0.5;
    points.push(x, opts.horizonY - h * opts.maxHeight);
  }

  // Close the polygon well below the horizon so the fill always extends
  // beyond the viewport, no matter where the camera is.
  points.push(opts.width, opts.horizonY + 200);
  points.push(0, opts.horizonY + 200);

  return new Graphics().poly(points).fill(opts.color);
}
