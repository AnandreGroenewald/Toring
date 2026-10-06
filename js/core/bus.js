// Tiny event bus shared by the DOM UI, the Phaser scenes and main.js.
// Kept free of Phaser/DOM so it can be imported in node tests.

export class Bus {
  constructor() {
    this._handlers = new Map();
  }

  /** Subscribe; returns an unsubscribe function. */
  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this.off(event, fn);
  }

  once(event, fn) {
    const off = this.on(event, (...args) => {
      off();
      fn(...args);
    });
    return off;
  }

  off(event, fn) {
    const set = this._handlers.get(event);
    if (set) set.delete(fn);
  }

  emit(event, ...args) {
    const set = this._handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[bus] handler for "${event}" failed`, err);
      }
    }
  }
}

export const bus = new Bus();
