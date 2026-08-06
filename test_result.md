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
    -message: "Milestone 2 complete. Audit gate green (typecheck, lint, 77 jest tests, roadmap 26, engine 10, expo-doctor 18/18, package-lock.json unchanged). UI verified via screenshot automation. Frontend automated testing (deep flows) NOT run yet — awaiting user go-ahead per protocol."
