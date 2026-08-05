# Known Issues

## Milestone 0 (post compliance cleanup)

### 1. Git repository root is `/app`; backend removed
The Git repository root is **`/app`** (not `/app/frontend`). The hosting
template originally tracked a sample FastAPI backend under `/app/backend`. That
scaffolding has been **removed from both Git and disk**, and its supervisor
process was stopped. `git ls-files` now contains **no backend files**. The app
itself has no backend, no cloud, no auth, and makes no network calls.

**Impact:** none on the app. **Action:** none required. If a future platform
process recreates `/app/backend`, it is unused by B-APP and must not be wired in.

### 2. Package manager is npm; platform preview launches via yarn
The project standard is **npm** with a committed `package-lock.json`
(`yarn.lock` was intentionally removed so `expo-doctor` reports a single lock
file). The platform preview supervisor launches the app via `yarn expo start`,
which only invokes the local `expo` binary and needs no lock file. If
`package.json` is edited through the platform watcher, a `yarn.lock` may be
regenerated; delete it again to keep a single (npm) lock file.

**Impact:** cosmetic / CI lock-file inference only. **Action:** keep npm.

### 3. `resolutions` field is yarn-specific
`package.json` retains a yarn `resolutions` block (transitive security pins)
from the template; npm ignores it (it uses `overrides`). Non-blocking for the
MVP. Mirroring into `overrides` is optional and deferred (editing package.json
may retrigger the platform yarn watcher — see #2).

**Impact:** low. **Action:** optional, deferred.

### 4. Domain logic is deliberately unimplemented (placeholders throw)
`reconstructBeadPlate`, `categorizeConfidence`, `evaluateStep`, and
`evaluateThreeWinSequence` are explicit Milestone 0 placeholders that **throw**
if executed. This is intentional scope control, not a defect. Nothing imports or
runs them except their scaffolding tests.

**Impact:** none. **Action:** implement in the authorised future milestone.

## No functional defects
No known functional bugs in the Milestone 0 shell or scaffolding. All
verification gates pass (see `docs/TEST_PLAN.md` and `docs/CURRENT_STATE.md`).
