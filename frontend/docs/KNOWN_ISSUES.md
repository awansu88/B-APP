# Known Issues

## Milestone 1

### 1. Git root is `/app`; app root is `/app/frontend`; no backend tracked
The Git repository root is `/app`; the Expo application lives in `/app/frontend`
(all project commands run from there). No backend directory/file is tracked and
the app makes no network calls.

**Impact:** none. **Action:** none.

### 2. Package manager is npm; platform preview launches via yarn
The project uses **npm** with a committed `package-lock.json` (single lock file
so `expo-doctor` is clean). The preview supervisor launches via `yarn expo
start`, which only runs the local `expo` binary. If `package.json` is edited
through the platform watcher a stray `yarn.lock` can reappear — delete it to
keep a single npm lock file.

**Impact:** cosmetic. **Action:** keep npm.

### 3. `sql.js` is a TEST-ONLY dependency
`sql.js` (+ `@types/sql.js`) is a **devDependency** used only by the Jest DB
tests (`src/tests/support/sqljs-database.ts`) so repositories/migrations can run
in node without the native module. The app itself uses `expo-sqlite`. `sql.js`
is never imported by application code and is not bundled.

**Impact:** none on the app. **Action:** none.

### 4. expo-sqlite adapter is complete but not yet wired to screens (RESOLVED in M2)
The SQLite layer is now wired into the Active Shoe screen through the
`useHistorySession` workflow and `SqliteHistoryStore`. On native the accepted
DB-001 database persists rounds; see Milestone 2 note below for the web fallback.

**Impact:** none. **Action:** none.

### 5. Prediction/confidence/sequence logic is still unimplemented
`categorizeConfidence`, `evaluateStep`, and `evaluateThreeWinSequence` remain
explicit placeholders that throw. This is intentional scope control for
Milestone 1 (roadmap + data only), not a defect.

**Impact:** none. **Action:** implement in the authorised future milestone.

### 6. Derived-road golden coverage (RESOLVED)
Big Eye Boy / Small Road / Cockroach Pig now have literal, independently
hand-computed golden tests: first activation points, stable RED and BLUE runs,
structural colour transitions, derived dragon-tail, big-road dragon-tail
interaction, deterministic rebuild after a middle-round edit, and structural
enum integrity. The earlier deferral is resolved.

**Impact:** none. **Action:** none.

## Milestone 2

### 7. Web persistence uses an AsyncStorage fallback (not expo-sqlite)
`expo-sqlite`'s web backend (wa-sqlite / OPFS) is not reliably available in the
Metro web preview (the `wa-sqlite.wasm` asset fails to resolve/serve), so the web
build persists rounds through an AsyncStorage-backed `MemoryHistoryStore`. The
backend is chosen by platform-specific `create-store.ts` (native → SQLite) vs
`create-store.web.ts` (web → AsyncStorage) so the native module and its wasm are
never bundled on web. The persisted data shape is identical and raw rounds remain
the only source of truth.

**Impact:** none on native devices (real SQLite is used); web is a preview-only
convenience. **Action:** none required; revisit if web SQLite becomes reliable.

### 8. Edit/Delete persist via full renumbered replacement
To keep both persistence backends consistent and avoid touching DB-001, an
arbitrary edit uses `RoundRepository.update` and a middle-round delete / shoe
clear uses `RoundRepository.replaceShoe` (delete-all + re-insert renumbered 1..n,
inside one transaction). This is O(n) per structural mutation — negligible for a
single shoe (< ~90 rounds) and it guarantees no duplicate round numbers.

**Impact:** none. **Action:** none.

### 9. Forward modes are wired to data only (no prediction)
Start Live / Start Historical Test become available after 8 non-Tie results and
set the shoe's `environment` (mapping subsequent round `source` to LIVE /
HISTORICAL_TEST). They do **not** produce predictions — that is a later milestone.

**Impact:** none. **Action:** implement prediction flow when authorised.

## No functional defects
All verification gates pass (see `docs/TEST_PLAN.md` and `docs/CURRENT_STATE.md`).
