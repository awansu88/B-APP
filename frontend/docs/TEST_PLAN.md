# Test Plan

## Scope (Milestone 0)
Tests validate ONLY: locked constants, the version registry, enum/type
behaviour, the disabled/analyzer registry (data), a read-only diagnostics
snapshot built from constants, and that future-milestone functions are explicit
**unimplemented placeholders** (they throw). No test validates roadmap,
confidence, analyzer, voting, or sequence **logic** — none is implemented yet.

## Tooling
- **Jest** with **ts-jest** (node environment) — pure TypeScript only.
- Config: `jest.config.js` (roots `<rootDir>/src`, `testMatch **/*.test.ts`,
  `@/` module mapper).

## Scripts
| Script                  | Purpose                                   |
|-------------------------|-------------------------------------------|
| `npm run typecheck`     | `tsc --noEmit` (strict TypeScript)        |
| `npm run lint`          | `expo lint` (ESLint, eslint-config-expo)  |
| `npm test`              | Run all Jest suites                       |
| `npm run test:roadmap`  | Roadmap scaffolding suite (`jest roadmap`)|
| `npm run test:engine`   | Engine scaffolding suite (`jest engine`)  |
| `npx expo-doctor`       | Project health checks                     |

## Suites
### `src/tests/smoke.test.ts` (6 tests)
Locked version registry, locked thresholds (8 / 0.75 / 3), UI outcome order
P / T / B, session environments, prediction decisions, and a diagnostics
snapshot built from locked constants.

### `src/tests/roadmap.test.ts` (3 tests)
Locked roadmap version, the `BEAD_PLATE_ROWS = 6` layout constant, and that
`reconstructBeadPlate` is an explicit unimplemented placeholder (throws).

### `src/tests/engine.test.ts` (10 tests)
Locked engine version and thresholds; enum values for decisions / confidence
categories / step evaluations; analyzer registry modes (ACTIVE / SHADOW_ONLY /
DISABLED — data only); and that `categorizeConfidence`, `evaluateStep`, and
`evaluateThreeWinSequence` are explicit unimplemented placeholders (throw).

## Expected result (Milestone 0)
- typecheck: **pass**
- lint: **pass**
- `npm test`: **3 suites, 19 tests passing**
- `test:roadmap`: **1 suite, 3 tests**
- `test:engine`: **1 suite, 10 tests**
- expo-doctor: **18/18 checks pass**
