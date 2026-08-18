// Jest setup — runs before any module (and before env.ts's dotenv.config()).
//
// The route/middleware suites are written for no-auth ("anonymous") mode and
// assert the anonymous user. If the developer's local `.env` has a real
// CLERK_SECRET_KEY, dotenv would flip `authEnabled` on and every auth-gated
// route test would 401. Pin auth OFF here so `npm test` is deterministic
// regardless of local secrets.
//
// We assign '' rather than `delete` because dotenv.config() only fills keys
// that are ABSENT from process.env — an empty string counts as present, so it
// won't be overwritten from `.env`.
process.env.CLERK_SECRET_KEY = '';
process.env.CLERK_PUBLISHABLE_KEY = '';
