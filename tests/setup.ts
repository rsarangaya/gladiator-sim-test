import { EVENTS } from '../src/game/state';
// Random day events are off by default in tests; tests/events.test.ts switches them on.
EVENTS.enabled = false;
