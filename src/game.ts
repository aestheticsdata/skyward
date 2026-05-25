import { SCREEN_WIDTH, TILE_SIZE } from '@constants';
import { Decoration } from '@entities/decoration';
import { Landmark } from '@entities/landmark';
import { Player } from '@entities/player';
import { Audio } from '@systems/audio';
import { Camera } from '@systems/camera';
import { Input, KEYS_INTERACT, KEYS_RESPAWN } from '@systems/input';
import { Sketchbook } from '@systems/sketchbook';
import { loadTestLevel, TEST_LEVEL_DECORATIONS, TEST_LEVEL_GRASS_ROW, TEST_LEVEL_LANDMARKS } from '@world/levels';
import { ParallaxBackground } from '@world/parallax';
import {
  renderRockBackground,
  renderTilemap,
  renderWaterBody,
  renderWaterSurfaceInto,
  type Tilemap,
} from '@world/tilemap';
import { type Application, Container, Graphics } from 'pixi.js';

// Y row where the underground rock backdrop starts. Begins at the main-floor
// row itself so the cave-entrance gaps in the main floor reveal rock from
// above (cave entrances look dark), not cornflower sky.
const ROCK_BG_START_ROW = TEST_LEVEL_GRASS_ROW;

// Water surface bob — vertical amplitude (px) and angular frequency (rad/s)
// of the gentle sine that makes the lake feel alive. Amplitude is kept at 1
// pixel so the surface still lands on the integer grid.
const WATER_BOB_AMPLITUDE = 1;
const WATER_BOB_FREQ = 4;

// Player spawn location — centered horizontally on the first screen,
// standing on the main grass floor.
const SPAWN_X = SCREEN_WIDTH / 2 - 6;

export class Game {
  private readonly app: Application;
  private readonly input: Input;
  private readonly audio: Audio;
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
  // Animated water surface — the highlight + sheen strip. Re-rendered each
  // frame with a small Y offset (sine wave) while the player is in water.
  // The static body of the lake lives in a separate Graphics behind this and
  // never moves.
  private readonly waterSurface: Graphics;
  // Time accumulated while the player is in water. Drives the surface bob.
  // Reset to 0 when the player exits, so the surface snaps back to rest.
  private waterAnimTime = 0;
  // Spawn Y depends on the level — keep it for respawn after descent.
  private readonly spawnY: number;

  constructor(app: Application) {
    this.app = app;
    this.input = new Input();
    this.audio = new Audio();

    this.tilemap = loadTestLevel();

    // Parallax goes on the stage BEFORE the world container so it renders
    // behind the tilemap and the player.
    this.parallax = new ParallaxBackground(this.tilemap.width * TILE_SIZE);
    app.stage.addChild(this.parallax.container);

    this.world = new Container();

    // Rock backdrop — covers the entire underground portion of the level,
    // visible through any cave interior, shaft, or gap. Sits at the back of
    // the world container so the tilemap renders on top.
    const mapWidthPx = this.tilemap.width * TILE_SIZE;
    const mapHeightPx = this.tilemap.height * TILE_SIZE;
    this.world.addChild(renderRockBackground(mapWidthPx, ROCK_BG_START_ROW * TILE_SIZE, mapHeightPx));

    // Static tilemap (everything except water).
    this.world.addChild(renderTilemap(this.tilemap));

    // Water — two layers. The body is the never-animated bottom of the lake;
    // the surface is the bobbing highlight strip on top. Body goes first so
    // surface renders over it.
    this.world.addChild(renderWaterBody(this.tilemap));
    this.waterSurface = new Graphics();
    renderWaterSurfaceInto(this.waterSurface, this.tilemap, 0, -1);
    this.world.addChild(this.waterSurface);

    // Decorations (trees, bushes, rocks, mushrooms) go in the world layer
    // before the player so the player draws on top when overlapping. Purely
    // visual — no state, no interaction.
    for (const spec of TEST_LEVEL_DECORATIONS) {
      this.world.addChild(new Decoration(spec).sprite);
    }

    // Landmarks go in the world (so they scroll with the camera). Added
    // before the player so the player draws on top when overlapping.
    this.landmarks = TEST_LEVEL_LANDMARKS.map((spec) => new Landmark(spec));
    for (const landmark of this.landmarks) {
      this.world.addChild(landmark.sprite);
    }

    // Player spawns standing on the main grass floor.
    const grassTopY = TEST_LEVEL_GRASS_ROW * TILE_SIZE;
    this.spawnY = grassTopY - 16;
    this.player = new Player(SPAWN_X, this.spawnY);
    this.world.addChild(this.player.sprite);

    app.stage.addChild(this.world);

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

      // Water surface bob — runs only while the player is in water; the
      // surface snaps to rest as soon as they step out. Body never moves;
      // only the highlight/sheen strip ripples ±1 px around its rest line.
      // Only the pool the player is currently inside ripples; other lakes
      // in the level stay perfectly still.
      const playerTx = Math.floor((this.player.pos.x + this.player.size.x / 2) / TILE_SIZE);
      const playerTy = Math.floor((this.player.pos.y + this.player.size.y / 2) / TILE_SIZE);
      const activeBodyId = this.player.inWater ? this.tilemap.waterBodyAt(playerTx, playerTy) : -1;
      if (this.player.inWater) {
        this.waterAnimTime += dt;
      } else {
        this.waterAnimTime = 0;
      }
      const surfaceOffset = Math.round(Math.sin(this.waterAnimTime * WATER_BOB_FREQ) * WATER_BOB_AMPLITUDE);
      renderWaterSurfaceInto(this.waterSurface, this.tilemap, surfaceOffset, activeBodyId);

      if (this.sketchbook.isVisible()) {
        // Sketchbook open: gameplay is paused. Only the close input is handled.
        if (this.input.isAnyPressed(KEYS_INTERACT)) {
          this.audio.closeBook();
          this.sketchbook.hide();
        }
      } else {
        // Respawn-to-surface escape hatch. The underground is currently too
        // deep to climb out of with the existing jump physics — pressing R
        // teleports back to spawn. Will be replaced by proper ascent
        // mechanics later (ladders / double-jump / ledge grab).
        if (this.input.isAnyPressed(KEYS_RESPAWN)) {
          this.player.pos.x = SPAWN_X;
          this.player.pos.y = this.spawnY;
          this.player.vel.x = 0;
          this.player.vel.y = 0;
          this.aimCameraAtPlayer();
          this.camera.snap();
        }

        this.player.update(this.input, dt, this.tilemap);

        // SFX driven by player one-shot event flags (set during update()).
        // Walking sound swaps to a wet "floc" while the player is wading
        // on the bottom; swim strokes get the muffled underwater whoosh.
        if (this.player.didJumpThisFrame) this.audio.jump();
        if (this.player.didLandThisFrame) this.audio.land();
        if (this.player.didFootstepThisFrame) {
          if (this.player.inWater) this.audio.wadeStep();
          else this.audio.footstep();
        }
        if (this.player.didEnterWaterThisFrame) this.audio.splash();
        if (this.player.didSwimStrokeThisFrame) this.audio.swimStroke();

        // Landmarks: show/hide proximity prompts, open sketchbook on E.
        //   - Undiscovered landmarks: show the tutorial tooltip (first time
        //     across the run) or the small "!" indicator afterwards.
        //   - Discovered landmarks: no prompt (the player has already seen
        //     it), but pressing E while in range still reopens the page.
        for (const landmark of this.landmarks) {
          const inRange = landmark.isPlayerInRange(this.player.pos, this.player.size);
          if (landmark.discovered) {
            landmark.setPromptMode(null);
          } else {
            landmark.setPromptMode(inRange ? (this.interactionTutorialDone ? 'simple' : 'tutorial') : null);
          }
          if (inRange && this.input.isAnyPressed(KEYS_INTERACT)) {
            if (!landmark.discovered) {
              landmark.markDiscovered();
              this.interactionTutorialDone = true;
              this.audio.discover();
            }
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
