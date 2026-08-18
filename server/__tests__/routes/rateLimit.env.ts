/**
 * Side-effect-only module: forces rate limiting ON with a tiny chat cap.
 *
 * `config/env.ts` reads `process.env` once, at import time, so these values
 * must be set BEFORE the app (and its env module) is imported. This file is
 * imported *first* in `rateLimit.test.ts`; ES imports are hoisted above
 * statements but still execute in source order, so this runs before the
 * `../../src/app` import that follows it. A static import (rather than a
 * dynamic `await import()`) keeps the test consistent with every other suite
 * and avoids TS2835 under NodeNext module resolution.
 *
 * `afterAll` in the test deletes these again so they can't leak into another
 * suite sharing the same Jest worker process.
 */
process.env.RATE_LIMIT_ENABLED = 'true';
process.env.RATE_LIMIT_CHAT_MAX = '3';
process.env.RATE_LIMIT_GLOBAL_MAX = '1000'; // keep the global net out of the way
