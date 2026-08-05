# Known Issues

## Milestone 0

### 1. Platform scaffolding directories exist outside the app repo
The hosting environment ships scaffolding at `/app/backend` (a FastAPI sample)
and `/app/tests`. These are **not part of the B-APP repository** (`/app/frontend`)
and are **not referenced** by the app. The B-APP app itself has **no backend**,
no cloud database, no auth, and makes **no network calls**. They can be ignored
for the purposes of this project and must not be wired into the app.

**Impact:** none on the app. **Action:** none required.

### 2. Package manager is npm; platform auto-install uses yarn
The project standard is **npm** and `package-lock.json` is committed
(`yarn.lock` was intentionally removed so `expo-doctor` reports a single lock
file). The platform's preview supervisor launches the app via
`yarn expo start`, which only invokes the local `expo` binary and does not
require a lock file. If `package.json` is edited through the platform's watcher,
a `yarn.lock` may be regenerated; if that happens, delete `yarn.lock` again to
keep a single (npm) lock file.

**Impact:** cosmetic / CI lock-file inference only. **Action:** keep npm; if a
stray `yarn.lock` reappears, remove it.

### 3. `resolutions` field is yarn-specific
`package.json` still contains a yarn `resolutions` block (transitive security
pins) inherited from the template. npm ignores `resolutions` (it uses
`overrides`). These pins are non-blocking for the MVP. If strict npm enforcement
of those pins is required later, mirror them into an `overrides` block — but note
that editing `package.json` may retrigger the platform yarn watcher (see #2).

**Impact:** low. **Action:** optional, deferred.

## No functional defects
No known functional bugs in the Milestone 0 shell or domain scaffolding. All
verification gates pass (see `docs/TEST_PLAN.md` and `docs/CURRENT_STATE.md`).
