import { DB32, TILE_SIZE } from '@constants';
import { Bird, drawBird } from '@entities/bird';
import { Decoration } from '@entities/decoration';
import type { Entity, InteractContext } from '@entities/entity';
import { drawFishLarge, Fish } from '@entities/fish';
import { Landmark } from '@entities/landmark';
import { Player } from '@entities/player';
import { drawRabbit, Rabbit } from '@entities/rabbit';
import { Audio } from '@systems/audio';
import { Camera } from '@systems/camera';
import { Greeting } from '@systems/greeting';
import { Input, KEYS_DOWN, KEYS_INTERACT, KEYS_JUMP, KEYS_LEFT, KEYS_RESPAWN, KEYS_RIGHT } from '@systems/input';
import { Sketchbook } from '@systems/sketchbook';
import { WorldState } from '@systems/world-state';
import type { Level } from '@world/level';
import { loadLevel, STARTING_LEVEL_ID } from '@world/levels';
import { ParallaxBackground } from '@world/parallax';
import {
  renderCryptBackdrop,
  renderIndoorBackdrop,
  renderRockBackground,
  renderTilemap,
  renderWaterBody,
  renderWaterSurfaceInto,
} from '@world/tilemap';
import { type Application, Container, Graphics } from 'pixi.js';

// Water surface bob — vertical amplitude (px) and angular frequency (rad/s)
// of the gentle sine that makes the lake feel alive. Amplitude is kept at 1
// pixel so the surface still lands on the integer grid.
const WATER_BOB_AMPLITUDE = 1;
const WATER_BOB_FREQ = 4;

// The Game owns one Player, one Camera, one Parallax — all reused across
// level transitions — plus a `levelLayer` sub-container that's rebuilt
// every time the active level changes.
//
// Container hierarchy:
//   stage
//   ├── parallax.container          (rebuilt per-flavor on transition)
//   ├── world (camera-offset)
//   │   ├── levelLayer              (cleared + repopulated on transition)
//   │   │   ├── rock backdrop
//   │   │   ├── tilemap
//   │   │   ├── water body / surface
//   │   │   ├── decorations
//   │   │   ├── landmarks
//   │   │   └── entities (doors, future levers/gates)
//   │   └── player.sprite           (persists across transitions)
//   └── sketchbook.container        (modal overlay, pauses gameplay)
export class Game {
  private readonly app: Application;
  private readonly input: Input;
  private readonly audio: Audio;
  private readonly sketchbook: Sketchbook;
  // Single greeting overlay reused for both first-rabbit and first-fish
  // encounters (and any future "you just met X" popup). Only one
  // popup can be visible at a time anyway since gameplay pauses.
  private readonly greeting: Greeting;
  private readonly worldState: WorldState;

  // Camera-offset world container.
  private readonly world: Container;
  // Per-level visuals + entities — emptied and rebuilt on transitionTo().
  private readonly levelLayer: Container;
  // Animated water surface — recreated as a fresh Graphics each mount so we
  // don't keep stale draws around when the level swaps.
  private waterSurface: Graphics;

  private readonly player: Player;
  private readonly camera: Camera;
  private readonly parallax: ParallaxBackground;

  // The active level. Always non-null after the constructor.
  private currentLevel: Level;
  private currentLandmarks: Landmark[] = [];
  private currentEntities: Entity[] = [];

  // True once the player has discovered any landmark this session.
  // Subsequent prompts (on landmarks AND doors) collapse to the small "!"
  // indicator. Persists across level transitions on purpose — the player
  // doesn't need to re-learn the mechanic every time they enter a door.
  private interactionTutorialDone = false;
  // Time accumulated while the player is in water. Drives the surface bob.
  // Reset on level transition AND when the player exits water.
  private waterAnimTime = 0;

  constructor(app: Application) {
    this.app = app;
    this.input = new Input();
    this.audio = new Audio();
    this.sketchbook = new Sketchbook();
    this.greeting = new Greeting();
    this.worldState = new WorldState();

    // Container hierarchy. Build empty containers first; populate later.
    this.world = new Container();
    this.levelLayer = new Container();
    this.world.addChild(this.levelLayer);

    // Load the starting level so we can wire camera + parallax to its size.
    this.currentLevel = loadLevel(STARTING_LEVEL_ID);

    // Parallax on stage BEHIND the world container.
    this.parallax = new ParallaxBackground(
      this.currentLevel.spec.parallax,
      this.currentLevel.tilemap.width * TILE_SIZE,
    );
    app.stage.addChild(this.parallax.container);
    app.stage.addChild(this.world);

    // Player at the starting level's default spawn. The Player instance is
    // shared across transitions — its position is moved on each one.
    const spawn = this.currentLevel.spawn(this.currentLevel.spec.defaultSpawnId);
    this.player = new Player(spawn.x, spawn.y);
    this.world.addChild(this.player.sprite);

    // Camera bound to the starting level's dimensions. setBounds() updates
    // these on transitions.
    this.camera = new Camera(this.currentLevel.tilemap);

    // Sketchbook overlay on stage above the world so it stays fixed on
    // screen (not affected by the camera) and renders on top of everything.
    app.stage.addChild(this.sketchbook.container);

    // Greeting overlay sits on top of the sketchbook in z-order.
    app.stage.addChild(this.greeting.container);

    // Placeholder; mountLevelContent() overwrites this immediately.
    this.waterSurface = new Graphics();

    // Populate the level layer for the starting level.
    this.mountLevelContent();

    // Snap the camera onto the player at startup so it doesn't ease in from (0, 0).
    this.aimCameraAtPlayer();
    this.camera.snap();
    this.camera.applyTo(this.world);
  }

  start(): void {
    this.app.ticker.add((ticker) => {
      const dt = Math.min(ticker.deltaMS / 1000, 1 / 30);
      const tilemap = this.currentLevel.tilemap;

      // Water surface bob — runs only while the player is in water; the
      // surface snaps to rest as soon as they step out. Body never moves;
      // only the highlight/sheen strip ripples ±1 px around its rest line.
      // Only the pool the player is currently inside ripples; other lakes
      // in the level stay perfectly still.
      const playerTx = Math.floor((this.player.pos.x + this.player.size.x / 2) / TILE_SIZE);
      const playerTy = Math.floor((this.player.pos.y + this.player.size.y / 2) / TILE_SIZE);
      const activeBodyId = this.player.inWater ? tilemap.waterBodyAt(playerTx, playerTy) : -1;
      if (this.player.inWater) {
        this.waterAnimTime += dt;
      } else {
        this.waterAnimTime = 0;
      }
      const surfaceOffset = Math.round(Math.sin(this.waterAnimTime * WATER_BOB_FREQ) * WATER_BOB_AMPLITUDE);
      renderWaterSurfaceInto(this.waterSurface, tilemap, surfaceOffset, activeBodyId);

      if (this.greeting.isVisible()) {
        // Greeting popup open: gameplay is paused (rabbits, fish,
        // birds, pumpkin, player — nothing updates). Closes on a fresh
        // movement-key press. We use isAnyPressed (not isAnyDown) so the
        // popup doesn't close on the same frame it opens just because
        // the player was already holding a direction key.
        if (
          this.input.isAnyPressed(KEYS_LEFT) ||
          this.input.isAnyPressed(KEYS_RIGHT) ||
          this.input.isAnyPressed(KEYS_JUMP) ||
          this.input.isAnyPressed(KEYS_DOWN)
        ) {
          this.greeting.hide();
        }
      } else if (this.sketchbook.isVisible()) {
        // Sketchbook open: gameplay is paused. Only the close input is handled.
        if (this.input.isAnyPressed(KEYS_INTERACT)) {
          this.audio.closeBook();
          this.sketchbook.hide();
        }
      } else {
        // Respawn (R) — now goes to the CURRENT level's default spawn, not
        // the meadow's. Still the temporary escape hatch from underground
        // until ascent mechanics land.
        if (this.input.isAnyPressed(KEYS_RESPAWN)) {
          this.respawnAtDefault();
        }

        this.player.update(this.input, dt, tilemap);

        // SFX driven by player one-shot event flags (set during update()).
        if (this.player.didJumpThisFrame) this.audio.jump();
        if (this.player.didLandThisFrame) this.audio.land();
        if (this.player.didFootstepThisFrame) {
          if (this.player.inWater) this.audio.wadeStep();
          else this.audio.footstep();
        }
        if (this.player.didEnterWaterThisFrame) this.audio.splash();
        if (this.player.didSwimStrokeThisFrame) this.audio.swimStroke();

        // Per-frame entity update (e.g. animated decorations once we add
        // them, lever cooldowns, push-block physics). Doors have no update.
        for (const entity of this.currentEntities) {
          entity.update?.(dt);
        }

        // First-encounter checks. Each fires exactly ONCE per Game
        // instance — the corresponding WorldState flag short-circuits
        // the rest of every future call.
        this.checkRabbitEncounter();
        this.checkFishEncounter();
        this.checkBirdEncounter();

        this.runInteractionLoop();

        this.aimCameraAtPlayer();
        this.camera.update(dt);
        this.camera.applyTo(this.world);
        this.parallax.update(this.camera);
      }

      this.input.endFrame();
    });
  }

  // Switch to a different level, placing the player at the named spawn.
  // Called from entity InteractContexts (doors today, teleport pads etc.
  // later). Synchronous — by the time it returns, the world has been
  // rebuilt and the camera snapped.
  //
  // Defensive ordering: build + validate the NEW level first (loadLevel and
  // spawn() both throw on bad ids). Only after they succeed do we tear down
  // the current one — that way an authoring typo in a door spec doesn't
  // leave us stranded with an empty world.
  private transitionTo(levelId: string, spawnId: string): void {
    const next = loadLevel(levelId);
    const nextSpawn = next.spawn(spawnId);

    // Tear down current level. Player persists.
    this.clearLevelLayer();
    this.waterAnimTime = 0;

    this.currentLevel = next;
    this.mountLevelContent();

    // Reposition player at the spawn point.
    this.player.pos.x = nextSpawn.x;
    this.player.pos.y = nextSpawn.y;
    this.player.vel.x = 0;
    this.player.vel.y = 0;

    // Camera + parallax for the new level. The setBounds reconfigures the
    // clamp; snap+apply puts the viewport on the player immediately so
    // there's no smooth pan from the old position.
    this.camera.setBounds(next.tilemap);
    this.parallax.rebuild(next.spec.parallax, next.tilemap.width * TILE_SIZE);
    this.aimCameraAtPlayer();
    this.camera.snap();
    this.camera.applyTo(this.world);
    this.parallax.update(this.camera);
  }

  // Build the level-layer container for the active level: rock backdrop,
  // tilemap, water, decorations, landmarks, entities. Called from the
  // constructor and from transitionTo. Assumes levelLayer is empty.
  private mountLevelContent(): void {
    const level = this.currentLevel;
    const tilemap = level.tilemap;
    const mapWidthPx = tilemap.width * TILE_SIZE;
    const mapHeightPx = tilemap.height * TILE_SIZE;

    // Backdrop — sits behind everything in the level layer. The renderer
    // depends on the level's flavor:
    //   'cave'        → the dark rock texture (granite + striations), right
    //                   for outdoor caves seen through ground gaps.
    //   'indoor-dark' → a flat near-black fill, right for a castle interior
    //                   where the rock texture would read as "dirt on the
    //                   walls" (this was an actual user complaint in the
    //                   first cut of the keep).
    const startY = level.spec.rockBgStartRow * TILE_SIZE;
    let backdrop: Graphics;
    if (level.spec.backdrop === 'cave') {
      backdrop = renderRockBackground(mapWidthPx, startY, mapHeightPx);
    } else if (level.spec.backdrop === 'crypt-black') {
      backdrop = renderCryptBackdrop(mapWidthPx, startY, mapHeightPx);
    } else {
      backdrop = renderIndoorBackdrop(mapWidthPx, startY, mapHeightPx);
    }
    this.levelLayer.addChild(backdrop);

    // Static tilemap (everything except water).
    this.levelLayer.addChild(renderTilemap(tilemap));

    // Water — body + animated surface. Body goes first so surface renders
    // over it. The waterSurface field is REASSIGNED here — the old Graphics
    // from a previous level was already removed by clearLevelLayer().
    this.levelLayer.addChild(renderWaterBody(tilemap));
    this.waterSurface = new Graphics();
    renderWaterSurfaceInto(this.waterSurface, tilemap, 0, -1);
    this.levelLayer.addChild(this.waterSurface);

    // Decorations.
    for (const spec of level.spec.decorations) {
      this.levelLayer.addChild(new Decoration(spec).sprite);
    }

    // Landmarks (materialised — instance carries the discovered flag, prompt
    // state, etc.).
    this.currentLandmarks = level.spec.landmarks.map((spec) => new Landmark(spec));
    for (const landmark of this.currentLandmarks) {
      this.levelLayer.addChild(landmark.sprite);
    }

    // Interactive entities. The context handed to the factory is the same
    // shape we hand to entity.interact() — phase 1 only exposes
    // transitionTo, but Lever/PressurePlate in phase 2 will likely read or
    // write WorldState at construction (e.g. a lever drawn in its pulled
    // pose because its target flag is already true).
    const ctx = this.makeInteractContext();
    this.currentEntities = [...level.spec.createEntities(ctx)];
    for (const entity of this.currentEntities) {
      this.levelLayer.addChild(entity.sprite);
    }
  }

  // Remove every child from levelLayer and reset the per-level arrays.
  // Children are removed (not destroyed) — destroying mid-tick on Pixi 8
  // can race with pending draws on the same Graphics. They'll be collected
  // shortly. Acceptable at this content scale.
  private clearLevelLayer(): void {
    this.levelLayer.removeChildren();
    this.currentLandmarks = [];
    this.currentEntities = [];
  }

  // Allocate a fresh interaction context. Cheap (one closure capture per
  // frame); centralised here so phase 2 has one place to add audio cues
  // and tilemap-solidity overlay hooks.
  private makeInteractContext(): InteractContext {
    return {
      transitionTo: (levelId, spawnId) => this.transitionTo(levelId, spawnId),
      worldState: this.worldState,
    };
  }

  // Per-frame interaction pass — promo prompts on all interactables in
  // range, and dispatch a single E-press to the first hit. Landmarks take
  // priority over entities (so a door overlapping a landmark zone won't
  // hijack the discovery). At most one interaction per frame: once we
  // dispatch, we stop — vital for doors specifically, because transitionTo
  // wipes `currentEntities` mid-iteration.
  private runInteractionLoop(): void {
    const pressedE = this.input.isAnyPressed(KEYS_INTERACT);
    let handled = false;

    // Landmarks.
    for (const landmark of this.currentLandmarks) {
      const inRange = landmark.isPlayerInRange(this.player.pos, this.player.size);
      if (landmark.discovered) {
        landmark.setPromptMode(null);
      } else {
        landmark.setPromptMode(inRange ? (this.interactionTutorialDone ? 'simple' : 'tutorial') : null);
      }
      if (!handled && inRange && pressedE) {
        if (!landmark.discovered) {
          landmark.markDiscovered();
          this.interactionTutorialDone = true;
          this.audio.discover();
        }
        this.sketchbook.show(landmark.spec);
        handled = true;
      }
    }

    // Interactive entities.
    const ctx = this.makeInteractContext();
    for (const entity of this.currentEntities) {
      if (!entity.isPlayerInRange || !entity.interact) continue;
      const inRange = entity.isPlayerInRange(this.player.pos, this.player.size);
      entity.setPromptMode?.(inRange ? (this.interactionTutorialDone ? 'simple' : 'tutorial') : null);
      if (!handled && inRange && pressedE) {
        entity.interact(ctx);
        handled = true;
        // STOP iterating: transitionTo (or any future state-mutating
        // interact) may have just replaced this.currentEntities with a
        // different array. Continuing the loop would touch stale data or
        // index past the new array.
        break;
      }
    }
  }

  // Detect the FIRST time the player overlaps any Rabbit. Sets the
  // 'rabbit-greeted' world-state flag and opens the greeting popup
  // with the rabbit subject. Subsequent calls do nothing because the
  // flag short-circuits the search. Cross-level: the flag survives
  // transitions, so meeting a rabbit in the meadow won't fire again
  // if a rabbit ever shows up in another level.
  private checkRabbitEncounter(): void {
    if (this.worldState.get('rabbit-greeted')) return;
    for (const entity of this.currentEntities) {
      if (!(entity instanceof Rabbit)) continue;
      if (entity.isPlayerInRange(this.player.pos, this.player.size)) {
        this.worldState.set('rabbit-greeted', true);
        this.greeting.show({
          drawSubject: (g) => drawRabbit(g, 0),
          subjectScale: 4,
          speech: 'Est-ce que tu as une carotte buddy ?',
        });
        return;
      }
    }
  }

  // Same as checkRabbitEncounter but for fish. Fires once across the
  // entire session on first AABB overlap with any Fish. The popup
  // shows the SAME colour as the fish the player actually bumped into
  // (orange / yellow / red — whichever entity triggered the check),
  // not a hardcoded default. drawFishLarge is ~22×10 at native size;
  // scale ×3 fills the popup frame at the same visual weight as the
  // rabbit at ×4.
  private checkFishEncounter(): void {
    if (this.worldState.get('fish-greeted')) return;
    for (const entity of this.currentEntities) {
      if (!(entity instanceof Fish)) continue;
      if (entity.isPlayerInRange(this.player.pos, this.player.size)) {
        this.worldState.set('fish-greeted', true);
        const touchedColor = entity.color;
        this.greeting.show({
          drawSubject: (g) => drawFishLarge(g, touchedColor),
          subjectScale: 3,
          speech: 'oh tiens ?! Un gros poisson bizarre !',
        });
        return;
      }
    }
  }

  // First-bird encounter. Same one-shot semantics as the rabbit/fish
  // checks, with one extra guard: SKIPPED while the player is airborne.
  // Pausing gameplay mid-jump would freeze the player suspended in the
  // air — visually jarring. The user explicitly asked to avoid that.
  // So the bird only "stops to chat" if it crosses the player when
  // they're standing on a platform (typically the high row-3/row-4
  // grass islands where the bird flight band sits).
  private checkBirdEncounter(): void {
    if (this.worldState.get('bird-greeted')) return;
    if (!this.player.onGround) return;
    for (const entity of this.currentEntities) {
      if (!(entity instanceof Bird)) continue;
      if (entity.isPlayerInRange(this.player.pos, this.player.size)) {
        this.worldState.set('bird-greeted', true);
        this.greeting.show({
          // Wings UP (frame 1) reads as "caught mid-flap" — a single
          // frozen flight pose, the right vibe for "stopped to chat."
          drawSubject: (g) => drawBird(g, 1, DB32.valhalla),
          subjectScale: 8,
          speech: 'un oiseau mutant !',
        });
        return;
      }
    }
  }

  private respawnAtDefault(): void {
    const spawn = this.currentLevel.spawn(this.currentLevel.spec.defaultSpawnId);
    this.player.pos.x = spawn.x;
    this.player.pos.y = spawn.y;
    this.player.vel.x = 0;
    this.player.vel.y = 0;
    this.aimCameraAtPlayer();
    this.camera.snap();
  }

  private aimCameraAtPlayer(): void {
    this.camera.follow(this.player.pos.x + this.player.size.x / 2, this.player.pos.y + this.player.size.y / 2);
  }
}
