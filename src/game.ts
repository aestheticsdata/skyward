import { SCREEN_WIDTH, TILE_SIZE } from '@constants';
import { Player } from '@entities/player';
import { Camera } from '@systems/camera';
import { Input } from '@systems/input';
import { loadTestLevel, TEST_LEVEL_GRASS_ROW } from '@world/levels';
import { ParallaxBackground } from '@world/parallax';
import { renderTilemap, type Tilemap } from '@world/tilemap';
import { type Application, Container } from 'pixi.js';

export class Game {
  private readonly app: Application;
  private readonly input: Input;
  private readonly tilemap: Tilemap;
  private readonly player: Player;
  private readonly camera: Camera;
  private readonly parallax: ParallaxBackground;
  // Everything that scrolls with the camera lives in this container. The stage
  // applies the upscale; this container applies the camera offset.
  private readonly world: Container;

  constructor(app: Application) {
    this.app = app;
    this.input = new Input();

    this.tilemap = loadTestLevel();

    // Parallax goes on the stage BEFORE the world container so it renders
    // behind the tilemap and the player.
    this.parallax = new ParallaxBackground(this.tilemap.width * TILE_SIZE);
    app.stage.addChild(this.parallax.container);

    this.world = new Container();
    this.world.addChild(renderTilemap(this.tilemap));
    app.stage.addChild(this.world);

    // Player spawns standing on the main grass floor, near the left side of
    // the level (so they can naturally explore rightward toward the second gap).
    const grassTopY = TEST_LEVEL_GRASS_ROW * TILE_SIZE;
    this.player = new Player(SCREEN_WIDTH / 2 - 6, grassTopY - 16);
    this.world.addChild(this.player.sprite);

    // Snap the camera onto the player at startup so it doesn't ease in from (0, 0).
    this.camera = new Camera(this.tilemap);
    this.aimCameraAtPlayer();
    this.camera.snap();
    this.camera.applyTo(this.world);
  }

  start(): void {
    this.app.ticker.add((ticker) => {
      // Cap dt so a paused tab can't catapult the player.
      const dt = Math.min(ticker.deltaMS / 1000, 1 / 30);

      this.player.update(this.input, dt, this.tilemap);
      this.input.endFrame();

      this.aimCameraAtPlayer();
      this.camera.update(dt);
      this.camera.applyTo(this.world);
      this.parallax.update(this.camera);
    });
  }

  private aimCameraAtPlayer(): void {
    this.camera.follow(this.player.pos.x + this.player.size.x / 2, this.player.pos.y + this.player.size.y / 2);
  }
}
