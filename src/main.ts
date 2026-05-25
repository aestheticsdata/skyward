import { DB32, DEFAULT_SCALE, SCREEN_HEIGHT, SCREEN_WIDTH } from '@constants';
import { Game } from '@game';
import { Application } from 'pixi.js';

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    width: SCREEN_WIDTH * DEFAULT_SCALE,
    height: SCREEN_HEIGHT * DEFAULT_SCALE,
    background: DB32.cornflower,
    antialias: false,
    roundPixels: true,
    resolution: 1,
  });

  // All gameplay is authored in 320x224 logical space; the stage upscales it.
  app.stage.scale.set(DEFAULT_SCALE);

  const appEl = document.getElementById('app');
  if (!appEl) throw new Error('No #app element in index.html');
  appEl.appendChild(app.canvas);

  // Hide the mouse cursor over the canvas. Two layered defenses:
  //   1. inline `style.cursor = 'none'` + a matching CSS rule in index.html
  //   2. Pixi's EventSystem default cursor (re-applied on every pointer event)
  //
  // Known limitation: browsers don't re-evaluate the canvas's `cursor` rule
  // until the user's first real mouse movement, so on a fresh page load the
  // default cursor stays visible briefly until they move the mouse. We tried
  // forcing a refresh via a synthetic mousemove; modern browsers don't honor
  // it for cursor purposes. Living with this rather than hiding the cursor
  // across the whole page.
  app.canvas.style.cursor = 'none';
  app.renderer.events.cursorStyles.default = 'none';

  const game = new Game(app);
  game.start();

  console.log('The Cartographer — phase 2 running.');
}

main().catch((err) => {
  console.error(err);
});
