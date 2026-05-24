import { DB32, DEFAULT_SCALE, SCREEN_HEIGHT, SCREEN_WIDTH } from '@constants';
import { Game } from '@game';
import { Application } from 'pixi.js';

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    width: SCREEN_WIDTH * DEFAULT_SCALE,
    height: SCREEN_HEIGHT * DEFAULT_SCALE,
    background: DB32.deepKoamaru,
    antialias: false,
    roundPixels: true,
    resolution: 1,
  });

  // All gameplay is authored in 320x224 logical space; the stage upscales it.
  app.stage.scale.set(DEFAULT_SCALE);

  const appEl = document.getElementById('app');
  if (!appEl) throw new Error('No #app element in index.html');
  appEl.appendChild(app.canvas);

  // Hide the mouse cursor over the play area. Pixi's EventSystem sets the
  // canvas cursor whenever it processes a pointer event, so a CSS rule alone
  // can lose the race. Setting both the inline style and Pixi's default
  // cursorStyle wins in both paths.
  app.canvas.style.cursor = 'none';
  app.renderer.events.cursorStyles.default = 'none';

  const game = new Game(app);
  game.start();

  console.log('The Cartographer — phase 2 running.');
}

main().catch((err) => {
  console.error(err);
});
