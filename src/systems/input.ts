// Keyboard input tracking. Uses KeyboardEvent.code (physical key position) so
// the same source key works regardless of layout (QWERTY/AZERTY/etc.).
//
// Three states per key:
//   - "down":     held this frame (good for movement)
//   - "pressed":  went from up to down this frame (good for jump start)
//   - "released": went from down to up this frame (good for variable-height jump)

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.down.has(e.code)) {
      this.pressed.add(e.code);
    }
    this.down.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (this.down.has(e.code)) {
      this.released.add(e.code);
    }
    this.down.delete(e.code);
  };

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  isAnyDown(codes: readonly string[]): boolean {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  isPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  isAnyPressed(codes: readonly string[]): boolean {
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }

  isReleased(code: string): boolean {
    return this.released.has(code);
  }

  isAnyReleased(codes: readonly string[]): boolean {
    for (const c of codes) if (this.released.has(c)) return true;
    return false;
  }

  // Call at the end of every game tick so "pressed"/"released" only fire on the
  // frame of the corresponding key event.
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
  }
}

// Binding sets — duplicated to support both QWERTY (WASD) and AZERTY (ZQSD) and arrows.
export const KEYS_LEFT = ['ArrowLeft', 'KeyA', 'KeyQ'] as const;
export const KEYS_RIGHT = ['ArrowRight', 'KeyD'] as const;
export const KEYS_JUMP = ['Space', 'ArrowUp', 'KeyW', 'KeyZ'] as const;
export const KEYS_INTERACT = ['KeyE'] as const;
