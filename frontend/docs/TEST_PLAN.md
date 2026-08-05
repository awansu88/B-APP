# Test Plan

## Tooling
- **Jest** with **ts-jest** (node environment) — pure TypeScript domain tests
  only. Prediction logic is independent from React (Principle #3), so no React
  Native renderer is required.
- Config: `jest.config.js` (roots `<rootDir>/src`, `testMatch **/*.test.ts`,
  `@/` module mapper).

## Scripts
| Script                  | Purpose                                   |
|-------------------------|-------------------------------------------|
| `npm run typecheck`     | `tsc --noEmit` (strict TypeScript)        |
| `npm run lint`          | `expo lint` (ESLint, eslint-config-expo)  |
| `npm test`              | Run all Jest suites                       |
| `npm run test:roadmap`  | Roadmap suite only (`jest roadmap`)       |
| `npm run test:engine`   | Engine suite only (`jest engine`)         |
| `npx expo-doctor`       | Project health checks                     |

## Suites (Milestone 0)
### `src/tests/smoke.test.ts`
- Locked version registry values.
- Locked engine thresholds (8 / 0.75 / 3).
- UI outcome order P / T / B.
- Session environments and prediction decisions.
- Diagnostics snapshot builds from locked config.

### `src/tests/roadmap.test.ts`
- Locked roadmap version.
- Column-major 6-row Bead Plate reconstruction from raw rounds.
- Order-independence (reconstructable from unordered input).
- Non-Tie counting and the 8-result warm-up boundary.

### `src/tests/engine.test.ts`
- Confidence band classification, including the 0.75 clamp.
- Locked analyzer modes (ACTIVE / SHADOW_ONLY / DISABLED).
- Step evaluation with Tie-as-PUSH and SKIP handling.
- Three-win sequence: achieve on 3 wins; SKIP/PUSH ignored; LOSS resets.

## Expected result (Milestone 0)
- typecheck: **pass**
- lint: **pass**
- `npm test`: **3 suites, 20 tests, all passing**
- `test:roadmap`: **1 suite, 4 tests**
- `test:engine`: **1 suite, 10 tests**
- expo-doctor: **18/18 checks pass**
