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

### 4. expo-sqlite adapter is complete but not yet wired to screens
`ExpoSqliteDatabase` and the repositories are implemented and tested (via the
in-memory driver) but are intentionally **not wired into any screen** — screens
and prediction modules are out of scope for Milestone 1. This is dormant,
non-broken infrastructure (no partial UI integration).

**Impact:** none. **Action:** wire up in a later milestone.

### 5. Prediction/confidence/sequence logic is still unimplemented
`categorizeConfidence`, `evaluateStep`, and `evaluateThreeWinSequence` remain
explicit placeholders that throw. This is intentional scope control for
Milestone 1 (roadmap + data only), not a defect.

**Impact:** none. **Action:** implement in the authorised future milestone.

### 6. Derived roads are computed but not asserted to fixed coordinates
Big Eye Boy / Small Road / Cockroach Pig are produced by the engine using the
standard column-comparison algorithm and are covered by a chop sanity check.
The 16 required golden tests assert Bead Plate / Big Road / ties / pairs /
leading-tie / rebuild determinism (the milestone's enumerated scenarios); exact
derived-road coordinate goldens can be added in a later milestone.

**Impact:** low. **Action:** optional future hardening.

## No functional defects
All verification gates pass (see `docs/TEST_PLAN.md` and `docs/CURRENT_STATE.md`).
