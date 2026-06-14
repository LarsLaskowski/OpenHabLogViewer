// Browser entry point: importing main.ts only wires up the module; calling
// init() starts the app. Tests can import the extracted modules (and main.ts'
// helpers) without triggering bootstrap/SSE side effects.
import { init } from './main.js';

init();
