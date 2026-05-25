import { DB32, SCREEN_WIDTH } from '@constants';
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

    // Sky gradient — drawn first so the mountains paint over it. Doesn't
    // scroll horizontally (scrollFactor = 0): the sky stays glued to the
    // viewport while mountains slide across. Vertically it tracks the
    // camera (handled in update()) so the horizon-line band lines up with
    // the world's grass row no matter where the camera is. Horizontal
    // bands plus 1-px dithering between them is the classic 16-bit Amiga
    // sky treatment (copper-bar effect, baked into geometry).
    this.addLayer(makeSkyGradient(SCREEN_WIDTH, HORIZON_Y), 0);

    // Far-far: barely-darker-than-sky silhouette, slowest scroll, lowest
    // peaks. A third tier of distance — without it the jump from sky to
    // the heather layer felt abrupt. Atmospheric perspective: this one
    // nearly merges with the sky.
    this.addLayer(
      makeHillSilhouette({
        width,
        horizonY: HORIZON_Y,
        maxHeight: 22,
        pointSpacing: 48,
        frequency: 0.4,
        seed: 0.9,
        color: DB32.lightSteel,
      }),
      0.15,
    );

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
        rimColor: DB32.lightSteel,
      }),
      0.3,
    );

    // Near: dark green-gray, faster scroll, taller and more jagged. The
    // contrast vs the far layer is what reads as "depth." Rim light along
    // the top edge of the silhouette suggests the sun catching the peaks —
    // a small touch that lifts the layer out of "flat shape" territory.
    this.addLayer(
      makeHillSilhouette({
        width,
        horizonY: HORIZON_Y,
        maxHeight: 56,
        pointSpacing: 16,
        frequency: 0.8,
        seed: 2.7,
        color: DB32.opal,
        rimColor: DB32.verdigris,
      }),
      0.6,
    );
  }

  update(camera: Camera): void {
    // Float positions — the Application's roundPixels rounds once at render
    // time. See camera.ts / player.ts for the same reasoning.
    //
    // Vertical scroll factor is fixed at 1 (the parallax tracks camera.pos.y
    // 1:1) so the painted horizon line stays glued to the world's grass row
    // even when the camera follows the player above the level's top edge.
    // Without this, jumping from a high platform would expose a band of sky
    // between the parallax mountains and the grass surface.
    for (const layer of this.layers) {
      layer.graphics.x = -camera.pos.x * layer.scrollFactor;
      layer.graphics.y = -camera.pos.y;
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
  // Optional 1-px rim highlight along the top edge of the silhouette —
  // suggests sun catching the peaks. Omit for the most distant layer
  // (the rim would imply too much detail at that distance).
  rimColor?: number;
}

// Generate an organic hill silhouette as a filled polygon. The top edge is
// formed by sampling a multi-octave sine; the bottom is closed off below the
// horizon so the fill extends down behind the tilemap. When `rimColor` is
// set, a second polygon traces the top edge one pixel higher in that tint,
// producing a sun-catching rim along the ridges.
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

  // Close the polygon AT the horizon — the silhouette only fills the sky
  // band above the surface. Below the horizon there's nothing (transparent),
  // so the underground rock backdrop in the world container shows through
  // any cave openings instead of these mountain colors bleeding down.
  points.push(opts.width, opts.horizonY);
  points.push(0, opts.horizonY);

  const g = new Graphics().poly(points).fill(opts.color);

  // Rim light: a 1-pixel band along the top edge of the silhouette in a
  // lighter tone. Built by tracing the sampled top points twice — once at
  // the original Y and once one pixel above — and filling the thin strip
  // between them. Reads as "sun on the ridge" without forcing a per-pixel
  // edge detection.
  if (opts.rimColor !== undefined) {
    const rim: number[] = [];
    const halfPoints = points.length - 4; // exclude the 2 horizon closure points
    for (let i = 0; i < halfPoints; i += 2) {
      rim.push(points[i], points[i + 1] - 1);
    }
    for (let i = halfPoints - 2; i >= 0; i -= 2) {
      rim.push(points[i], points[i + 1]);
    }
    g.poly(rim).fill(opts.rimColor);
  }

  return g;
}

// Clean light-blue sky. A single solid color (no bands, no dithering) —
// the cleanest possible backdrop, sky reads as sky and stays out of the
// way of the action. The blue is balanced: enough red to never look
// violet, low enough green to never look turquoise.
//
// Color chosen outside the DB32 ramp because the palette's blues all
// pulled either toward purple (cornflower, royalBlue, deepKoamaru) or
// toward cyan/turquoise (viking). This shade — RGB(136, 182, 232) —
// sits squarely between those extremes: a Mario-sky / Trap-Runner-sky
// kind of clear daylight blue.
const SKY_COLOR = 0x88b6e8;

function makeSkyGradient(width: number, horizonY: number): Graphics {
  const g = new Graphics();
  // Top is far above any reachable camera position. The vertical scroll
  // factor is 1, so when the camera looks up the screen reveals more of
  // this band — it has to extend well past any plausible camera Y.
  const skyTop = horizonY - 320;
  g.rect(0, skyTop, width, horizonY - skyTop).fill(SKY_COLOR);
  return g;
}
