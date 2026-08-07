#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  B-APP Baccarat Engine (Expo, local-first, landscape tablet). Milestone 2 —
  build the Active Shoe "History Input" mode: left info panel (shoe info, totals,
  history-confirmation status), center roadmaps (Bead Plate, Big Road, Big Eye
  Boy, Small Road, Cockroach Pig), bottom large PLAYER/TIE/BANKER buttons (P/T/B
  order) with PP/BP markers and COMPLETE/PARTIAL pair modes, plus secondary
  controls (Undo, Edit/Delete Round, New/Clear Shoe, Start Live, Start Historical
  Test). Include history checkpoints (15/20/30/+10), 8-non-Tie warm-up gate,
  Review Data with edit/delete + full roadmap rebuild, and double-tap prevention.
  No prediction logic. DB-001 must not be modified; no dependency upgrades.

backend:
  - task: "No backend (local-first, offline app)"
    implemented: true
    working: "NA"
    file: "N/A"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "This app is fully offline with no backend/network. Persistence is on-device SQLite (native) with an AsyncStorage web fallback."

frontend:
  - task: "Active Shoe History Input screen (info panel + roadmaps + controls)"
    implemented: true
    working: true
    file: "src/app/(shell)/index.tsx, src/ui/history/*, src/ui/roadmap/RoadmapBoards.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Verified in web preview via screenshot automation: entered 10-15 rounds, stats update (total/non-Tie/P/T/B), roadmaps render (bead plate, big road with tie count, three derived roads), round-15 checkpoint banner appears, Review Data lists rounds with edit/delete, edit round + delete round rebuild the roadmap, Clear Shoe confirmation dialog shows. Start Live/Historical enabled after 8 non-Tie."
        -working: true
        -agent: "testing"
        -comment: "COMPREHENSIVE INTERACTION-LEVEL VALIDATION COMPLETE (A1-H2). ALL TESTS PASS. Round entry (A1-A4): Player/Tie/Banker buttons increment stats correctly, Tie doesn't increment non-Tie, roadmaps (Bead Plate, Big Road) update. Input safety (B1-B3): Pair toggles reset after entry, rapid double-tap protection works (max 5 increments), round numbers contiguous 1..N with no duplicates. Pair modes (C1-C6): Partial mode shows UNKNOWN, Complete mode shows NO, PP/BP toggles work individually and together, pair states persist in Review Data. Editing (D1-D6): Undo removes last round, edit last/middle rounds works, delete last/middle rounds works with renumbering, roadmaps rebuild after edits. Revision audit (E1): State persists after page reload (edits/deletes preserved). Warm-up & checkpoints (F1-F9): Start buttons disabled before 8 non-Tie then enabled, Tie doesn't count toward 8, checkpoint banners appear at 15/20/30/40/50, checkpoint Review opens modal, checkpoint Start Live doesn't crash. Shoe controls (G1-G4): Clear Shoe cancel preserves rounds, Clear Shoe confirm clears all, New Shoe cancel preserves shoe, New Shoe confirm creates fresh shoe with new ID, repeated New Shoe handled correctly. Persistence across reload (H1-H2): Full state persists (stats, shoe ID, pair states, roadmaps rebuild). No console errors detected. App is fully functional on web (landscape tablet 1280x800)."
  - task: "Pure History domain (pair-mode, statistics, checkpoints, guard, session)"
    implemented: true
    working: true
    file: "src/domain/history/*, src/tests/history.test.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "22 Jest tests pass: add P/T/B, pair COMPLETE/PARTIAL, PP/BP auto-reset, double-tap/busy guard, undo, edit, delete+renumber, full roadmap rebuild, checkpoint cadence, 8-non-Tie gate."
  - task: "History persistence (SQLite native / AsyncStorage web) + additive repo methods"
    implemented: true
    working: true
    file: "src/workflows/history/*, src/data/repositories/round-repository.ts, shoe-repository.ts, src/tests/database.test.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "DB-001 unchanged. Added RoundRepository.update/replaceShoe and ShoeRepository.updateMeta (all atomic). 4 new DB persistence tests pass. Web bundle fixed by platform-specific create-store.web.ts so expo-sqlite/wa-sqlite wasm is not bundled on web."

metadata:
  created_by: "main_agent"
  version: "2.0"
  test_sequence: 0
  run_ui: false

test_plan:
  current_focus:
    - "Active Shoe History Input screen (info panel + roadmaps + controls)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: "Milestone 2 complete + FINAL ACCEPTANCE AUDIT done. Scope verified: roadmap engine, DB-001 schema/migrations, engine thresholds & version registry all UNCHANGED vs base commit 31fccc4; no prediction/analyzer/voting/confidence/risk/session/snapshot/sequence code or records added; Start Live/Historical only set shoe environment (gated at 8 non-Tie). Gate green: typecheck, lint, npm test = 5 suites / 79 tests (smoke 6, engine 10, roadmap 26, database 15, history 22), roadmap 26, engine 10, expo-doctor 18/18, package-lock.json unchanged, web bundle HTTP 200, console clean."
    -agent: "testing"
    -message: "Interaction-level validation of History Input screen at 1280x800: ALL 42 cases (A1-H2) PASS — round entry, input safety/double-tap, pair COMPLETE/PARTIAL, PP/BP reset, undo/edit/delete + renumber, full roadmap rebuild, 8-non-Tie warm-up gate, checkpoints at 15/20/30/40/50, Review Data edit/delete, Clear Shoe & New Shoe confirmation + unique new shoe id, and persistence across page reload. No console errors. No action items."
    -agent: "main"
    -message: "77-vs-78 test-count inconsistency RESOLVED: prior summary mis-stated '4' new DB tests; the true count was 3 at that time (update, replaceShoe-replace, replaceShoe-clear) — no test was removed/renamed/merged. During this audit 2 more DB tests were added (New-Shoe preservation, round-id stability), so database.test.ts is now 15 and the grand total is 79. Native SQLite = status A (IMPLEMENTED_NOT_RUNTIME_VERIFIED); web AsyncStorage persistence verified across reload."
    -agent: "main"
    -message: "MILESTONE 3 FINAL ACCEPTANCE AUDIT: PASS. Scope verified vs accepted M2 base ef9f330 -> HEAD: only snapshot/feature/analysis domains, analysis.test.ts, additive barrels, and docs changed; roadmap engine/types, history domain/workflow/UI, DB-001 schema/migrations, repositories, engine thresholds, version registry ALL UNCHANGED. Future-scope clean: no voting/confidence/prediction-record/locking/evaluation/betting/balance/sequence logic; runner emits no final PLAYER/BANKER/BET/SKIP decision; fully deterministic (no random/time). Warm-up behavior confirmed: all directional analyzers ABSTAIN below 8 non-Tie (unchanged). Gate: typecheck/lint pass, npm test 6 suites/107 (smoke 6, engine 10, roadmap 26, database 15, history 22, analysis 28) exactly as expected, roadmap 26, engine 10, expo-doctor 18/18, package-lock.json unchanged. Docs corrected so Milestone 4 = Decision Pipeline ONLY (draft + trace, no writes/locking) and prediction LOCKING = Milestone 5. Milestone 4 NOT started. Pure-domain milestone: no UI/backend surface, so no frontend/backend testing agent applicable; Jest is authoritative."
    -agent: "testing"
    -message: "COMPREHENSIVE INTERACTION-LEVEL VALIDATION COMPLETE. All 42 test scenarios (A1-H2) PASS. Tested: round entry, input safety (double-tap protection, pair reset), pair modes (Partial/Complete with PP/BP toggles), editing (undo, edit/delete last/middle rounds with renumbering), persistence (state survives reload), warm-up gate (8 non-Tie requirement), checkpoints (15/20/30/40/50 with Continue/Review/Start Live actions), shoe controls (Clear/New Shoe with cancel/confirm), and full persistence across page reload. No console errors. App is production-ready for web (landscape tablet). Screenshots captured at key validation points."
    -agent: "main"
    -message: "MILESTONE 4 (DECISION PIPELINE) COMPLETE. Audit passed (branch main, clean tree, baseline 7 suites/120 green, DB-001 intact). Built pure-domain src/domain/decision/* (config DECISION-001, types, families, data-quality gate, weighted voting + family correlation cap + conflict detection, evidence-depth confidence engine with locked 55/60/70/75 bands, risk filter, pipeline). Order: Module Results -> Data Quality Gate -> Weighted Voting -> Family Correlation Cap -> Conflict Detection -> Confidence Engine -> Risk Filter -> Prediction Draft, with independent ACTIVE and SHADOW (volatility) records + full trace. Player/Banker support computed independently; weighted agreement is a consensus ratio (NOT a win probability); confidence gated by agreement>=58% and >=2 directional modules, clamped 0.75; family cap discounts correlated evidence (CONTEXT/regime x0.5 so regime modifies context without duplicating trend). Data Quality PASS/LIMIT/BLOCK; risk filter may retain/downgrade/turn BET->SKIP but NEVER reverses side, raises category, or increases confidence. Volatility SHADOW_ONLY (active unaffected); Historical Matcher OFF. Versions VOTE-001/CONF-001/RISK-001, config DECISION-001. NO persistence, NO prediction locking, NO result submission/evaluation, NO sequence tracking (Milestone 5). Added src/tests/decision.test.ts (18 deterministic fixed-vector cases incl. all 14 required scenarios). Gate: typecheck pass, lint pass, npm test 8 suites/138 (smoke 6, engine 10, roadmap 26, database 15, history 22, analysis 28, reliability 13, decision 18), test:roadmap 26, test:engine 10, expo-doctor 18/18, package-lock.json unchanged. DB-001/roadmap engine/thresholds/version-registry/analyzer-modes/History workflow&UI all UNCHANGED. M0 placeholders (categorizeConfidence/evaluateStep/evaluateThreeWinSequence) untouched (still throw). Pure-domain milestone: no UI/backend surface, Jest authoritative; no frontend/backend testing agent applicable." Takeover audit (Phase 1) matched exactly: remote awansu88/B-APP, branch main, HEAD 4e02c619, tag m03-analysis-engine-rc1, DB-001/FEATURE-001/SNAPSHOT-001, npm; npm ci left package-lock.json unchanged; baseline 6 suites/107 (smoke 6, engine 10, roadmap 26, database 15, history 22, analysis 28), roadmap 26, engine 10, expo-doctor 18/18. Phase 2 correction: analyzer `reliability` is now a deterministic, versioned UNCALIBRATED MVP PRIOR (RELIABILITY_PRIORS/RELPRIOR-001 in src/domain/analysis/types.ts) fully decoupled from current-shoe conditions. Removed the old sampleFactor(min(nonTie/20,1))*(0.5+0.5*stabilityScore) coupling plus the regime *0.5, Volatility reliability=stabilityScore, Derived-Road *0.5, and Data-Quality reliability=quality couplings. Priors (conservative, not tuned): streak 0.50, chop 0.50, run-length 0.45, distribution 0.40, regime-transition 0.45, data-quality-guard 0.50, volatility 0.30, derived-road 0.30, historical-matcher 0.00. Strength/feature formulas UNCHANGED; Data Quality Guard ACTIVE/non-directional (strength=data quality); Volatility & Derived Road SHADOW_ONLY; Historical Matcher DISABLED. Files changed: src/domain/analysis/types.ts, src/domain/analysis/modules.ts, new src/tests/reliability.test.ts (13). Gate: typecheck pass, lint pass, npm test 7 suites/120 (smoke 6, engine 10, roadmap 26, database 15, history 22, analysis 28, reliability 13), roadmap 26, engine 10, expo-doctor 18/18, package-lock.json unchanged, DB-001/roadmap engine/thresholds/History workflow&UI unchanged. Milestone 4 (Decision Pipeline) NOT started. Pure-domain change: no UI/backend surface, so Jest is authoritative (no frontend/backend testing agent applicable)."
