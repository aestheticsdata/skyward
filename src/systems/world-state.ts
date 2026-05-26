// Cross-level boolean flag store. Switches, levers, and pressure plates
// write into it; gates and portcullises read from it. Lives on the Game
// instance so the state survives level transitions — a portcullis you opened
// in the keep stays open after a trip back to the meadow and a return visit.
//
// Naming convention for keys: '<level-id>.<mechanism>' (e.g.
// 'meadow.sluice-open', 'keep.crypt-portcullis-open'). Game-wide flags use a
// bare name. The store doesn't enforce this — it's just a Map<string, boolean>
// — but the convention makes the source of a flag obvious at a glance.
//
// Phase 1 has no callers yet; Door uses Game.transitionTo directly. The class
// exists now so phase 2's lever/gate plumbing slots in without touching the
// Game wiring.
export class WorldState {
  private flags = new Map<string, boolean>();

  // Read a flag. Unset flags read as false — every flag has an implicit
  // default-off, so we never have to seed the store before checking.
  get(name: string): boolean {
    return this.flags.get(name) ?? false;
  }

  set(name: string, value: boolean): void {
    this.flags.set(name, value);
  }

  // Convenience for one-shot toggles (levers, etc.).
  toggle(name: string): boolean {
    const next = !this.get(name);
    this.set(name, next);
    return next;
  }
}
