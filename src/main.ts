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

  const game = new Game(app);
  game.start();

  console.log('The Cartographer — phase 2 running.');
}

main().catch((err) => {
  console.error(err);
});
