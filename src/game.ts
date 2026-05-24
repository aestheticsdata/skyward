import { SCREEN_WIDTH, TILE_SIZE } from '@constants';
import { Landmark } from '@entities/landmark';
import { Player } from '@entities/player';
import { Camera } from '@systems/camera';
import { Input, KEYS_INTERACT } from '@systems/input';
import { Sketchbook } from '@systems/sketchbook';
import { loadTestLevel, TEST_LEVEL_GRASS_ROW, TEST_LEVEL_LANDMARKS } from '@world/levels';
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
  private readonly landmarks: Landmark[];
  private readonly sketchbook: Sketchbook;
  // True once the player has discovered any landmark. Subsequent landmarks
  // show only the small "!" indicator instead of the full "press E" tutorial
  // tooltip — they've learned the mechanic.
  private interactionTutorialDone = false;
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

    // Landmarks go in the world (so they scroll with the camera). Added
    // before the player so the player draws on top when overlapping.
    this.landmarks = TEST_LEVEL_LANDMARKS.map((spec) => new Landmark(spec));
    for (const landmark of this.landmarks) {
      this.world.addChild(landmark.sprite);
    }

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

    // Sketchbook overlay is on the stage above the world so it stays fixed
    // on screen (not affected by the camera) and renders on top of everything.
    this.sketchbook = new Sketchbook();
    app.stage.addChild(this.sketchbook.container);
  }

  start(): void {
    this.app.ticker.add((ticker) => {
      const dt = Math.min(ticker.deltaMS / 1000, 1 / 30);

      if (this.sketchbook.isVisible()) {
        // Sketchbook open: gameplay is paused. Only the close input is handled.
        if (this.input.isAnyPressed(KEYS_INTERACT)) {
          this.sketchbook.hide();
        }
      } else {
        this.player.update(this.input, dt, this.tilemap);

        // Landmarks: show/hide proximity prompts, open sketchbook on E.
        for (const landmark of this.landmarks) {
          if (landmark.discovered) continue;
          const inRange = landmark.isPlayerInRange(this.player.pos, this.player.size);
          landmark.setPromptMode(inRange ? (this.interactionTutorialDone ? 'simple' : 'tutorial') : null);
          if (inRange && this.input.isAnyPressed(KEYS_INTERACT)) {
            landmark.markDiscovered();
            this.interactionTutorialDone = true;
            this.sketchbook.show(landmark.spec);
            break; // one interaction per frame
          }
        }

        this.aimCameraAtPlayer();
        this.camera.update(dt);
        this.camera.applyTo(this.world);
        this.parallax.update(this.camera);
      }

      this.input.endFrame();
    });
  }

  private aimCameraAtPlayer(): void {
    this.camera.follow(this.player.pos.x + this.player.size.x / 2, this.player.pos.y + this.player.size.y / 2);
  }
}
