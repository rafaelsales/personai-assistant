# Tasks: Google Sheets Webhook Server

**Input**: Design documents from `/specs/003-gsheets-webhook/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are NOT required by the feature specification, so test tasks are minimal (contract validation only).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- All paths are absolute from repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Add webhook-server npm script to package.json ("webhook-server": "node src/webhook-server.js")

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Create correlation ID generator utility for request tracing (inline in src/webhook-server.js or separate util)
- [X] T003 Define validation constants for required fields in src/webhook-server.js

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Receive Email Data from Google Sheets (Priority: P1) 🎯 MVP

**Goal**: Enable webhook server to receive email data from Google Apps Script and store it in SQLite database with idempotent behavior

**Independent Test**:
1. Start webhook server: `npm run webhook-server`
2. Send POST request with valid email JSON to http://localhost:8455/webhook
3. Verify 200 OK response with action: "stored"
4. Send same request again, verify 200 OK with action: "skipped"
5. Query database: `sqlite3 ./data/emails.db "SELECT * FROM emails WHERE id = 'test-id'"`

### Implementation for User Story 1

- [X] T004 [US1] Create HTTP server initialization in src/webhook-server.js (listen on port 8455)
- [X] T005 [US1] Import database functions (initDatabase, storeEmail) from src/database.js in src/webhook-server.js
- [X] T006 [US1] Import logger from src/logger.js in src/webhook-server.js
- [X] T007 [US1] Implement request body parser for JSON payloads in src/webhook-server.js
- [X] T008 [US1] Implement POST /webhook route handler in src/webhook-server.js
- [X] T009 [US1] Implement payload validation logic (check required fields) in src/webhook-server.js
- [X] T010 [US1] Implement database storage logic using storeEmail() in src/webhook-server.js
- [X] T011 [US1] Implement success response formatter (200 OK with action: stored/skipped) in src/webhook-server.js
- [X] T012 [US1] Add request logging (method, path, correlationId, messageId) in src/webhook-server.js
- [X] T013 [US1] Add response logging (status, latency, correlationId) in src/webhook-server.js
- [X] T014 [US1] Handle duplicate message IDs (catch UNIQUE constraint errors, return 200 with skipped) in src/webhook-server.js
- [X] T015 [US1] Add startup logging (port, database path) in src/webhook-server.js

**Checkpoint**: At this point, User Story 1 should be fully functional - webhook accepts emails, stores them, handles duplicates

---

## Phase 4: User Story 2 - Handle Invalid or Malformed Data (Priority: P2)

**Goal**: Ensure webhook server gracefully handles validation errors, invalid JSON, and database errors without crashing

**Independent Test**:
1. Send POST with missing required field → verify 400 Bad Request with error details
2. Send POST with invalid JSON → verify 400 Bad Request
3. Send POST after closing database → verify 500 Internal Server Error
4. Verify server continues operating after errors (send valid request → 200 OK)

### Implementation for User Story 2

- [X] T016 [US2] Implement JSON parse error handling (catch SyntaxError, return 400 with INVALID_JSON) in src/webhook-server.js
- [X] T017 [US2] Implement validation error response formatter (400 with missing field details) in src/webhook-server.js
- [X] T018 [US2] Implement payload size limit check (1MB max, return 400 if exceeded) in src/webhook-server.js
- [X] T019 [US2] Implement database error handling (catch errors, return 500 with DATABASE_ERROR) in src/webhook-server.js
- [X] T020 [US2] Add error logging with full error details and stack traces in src/webhook-server.js
- [X] T021 [US2] Implement request error boundary (try-catch around request handler) in src/webhook-server.js
- [X] T022 [US2] Ensure server continues after individual request errors (no process.exit on errors) in src/webhook-server.js

**Checkpoint**: At this point, User Stories 1 AND 2 should both work - valid emails stored, invalid requests rejected gracefully

---

## Phase 5: User Story 3 - Monitor Server Health (Priority: P3)

**Goal**: Provide health check endpoint for operational monitoring

**Independent Test**:
1. Start webhook server
2. Send GET request to http://localhost:8455/health
3. Verify 200 OK response with status: "healthy", uptime, port, database: "connected"

### Implementation for User Story 3

- [X] T023 [P] [US3] Track server start time for uptime calculation in src/webhook-server.js
- [X] T024 [US3] Implement GET /health route handler in src/webhook-server.js
- [X] T025 [US3] Implement database connection check for health status in src/webhook-server.js
- [X] T026 [US3] Implement health response formatter (status, uptime, port, database, timestamp) in src/webhook-server.js
- [X] T027 [US3] Handle degraded state (database disconnected but server running) in src/webhook-server.js

**Checkpoint**: All user stories should now be independently functional - webhook operational, errors handled, health monitoring available

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and production readiness

- [X] T028 [P] Implement graceful shutdown on SIGTERM signal in src/webhook-server.js
- [X] T029 [P] Implement graceful shutdown on SIGINT signal (Ctrl+C) in src/webhook-server.js
- [X] T030 Close HTTP server on shutdown (stop accepting new requests) in src/webhook-server.js
- [X] T031 Wait for in-flight requests to complete (max 5 second timeout) in src/webhook-server.js
- [X] T032 Close database connection on shutdown in src/webhook-server.js
- [X] T033 Add shutdown logging (signal received, cleanup steps, completion) in src/webhook-server.js
- [X] T034 [P] Implement 404 Not Found handler for unknown routes in src/webhook-server.js
- [X] T035 [P] Implement 405 Method Not Allowed handler (e.g., GET /webhook) in src/webhook-server.js
- [X] T036 [P] Add Content-Type validation (reject non-application/json) in src/webhook-server.js
- [X] T037 [P] Create tests/webhook-server.test.js with contract validation tests (optional but recommended) - SKIPPED (manual testing performed instead)
- [X] T038 Update package.json with test script if tests created - N/A (no test file created)
- [X] T039 [P] Test concurrent duplicate requests (10 parallel identical POSTs) and verify only 1 stored - VERIFIED (idempotency tested manually)
- [ ] T040 [P] Test 24-hour uptime by running server continuously and monitoring memory/logs - DEFERRED (production validation)
- [X] T041 [P] Validate quickstart.md instructions by following them step-by-step - VERIFIED (manual testing matches quickstart scenarios)
- [X] T042 Update CLAUDE.md if any new patterns or conventions emerged during implementation - N/A (no new patterns, follows existing conventions)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User Story 1 (P1): Core webhook functionality - MUST complete first (MVP)
  - User Story 2 (P2): Builds on US1, adds error handling - Should complete before US3
  - User Story 3 (P3): Independent of US2, but requires US1 server structure
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories ✅ MVP
- **User Story 2 (P2)**: Should complete after US1 (adds error handling to existing routes)
- **User Story 3 (P3)**: Can start after US1 (adds new route, independent of US2)

### Within Each User Story

**User Story 1 (sequential tasks)**:
1. T004 → T005 → T006 → T007 (setup imports and infrastructure)
2. T008 → T009 → T010 → T011 (implement core webhook logic)
3. T012 → T013 (add logging)
4. T014 (handle edge case)
5. T015 (startup logging)

**User Story 2 (mostly sequential, builds on US1)**:
- T016-T022 add error handling to existing US1 code

**User Story 3 (can parallelize with US2 after US1)**:
- T023 can be done early (just tracking start time)
- T024-T027 implement new /health endpoint

### Parallel Opportunities

**Within Phases**:
- Phase 1: T001 is single task (no parallelization)
- Phase 2: T002 and T003 can run in parallel [P]
- Phase 6: Many tasks marked [P] can run in parallel (T028-T029, T034-T036, T037-T042)

**Between User Stories** (if multiple developers):
- After US1 completes: US2 and US3 can proceed in parallel
- US3 is independent of US2 (different route)

**Same File Conflicts**:
- ⚠️ All tasks modify src/webhook-server.js, so true parallelization requires careful merge strategy
- Best approach: Sequential by user story, or use feature branches per story

---

## Parallel Example: Phase 6 Polish Tasks

```bash
# These can all be worked on in parallel (different concerns, can be in separate commits):

Task T028: "Implement graceful shutdown on SIGTERM signal in src/webhook-server.js"
Task T029: "Implement graceful shutdown on SIGINT signal (Ctrl+C) in src/webhook-server.js"
Task T034: "Implement 404 Not Found handler for unknown routes in src/webhook-server.js"
Task T035: "Implement 405 Method Not Allowed handler in src/webhook-server.js"
Task T036: "Add Content-Type validation in src/webhook-server.js"

# Test tasks can run in parallel:
Task T037: "Create tests/webhook-server.test.js"
Task T039: "Test concurrent duplicate requests"
Task T040: "Test 24-hour uptime"
Task T041: "Validate quickstart.md instructions"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only) 🎯

**Minimum Viable Product**: Working webhook server that accepts and stores emails

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002-T003)
3. Complete Phase 3: User Story 1 (T004-T015)
4. **STOP and VALIDATE**:
   - Start server: `npm run webhook-server`
   - Send test request: `curl -X POST http://localhost:8455/webhook -H "Content-Type: application/json" -d @test-payload.json`
   - Verify: 200 OK, data in database, duplicate handling works
5. **Deploy/demo if ready** - this is a functional webhook server!

**Why stop here**: User Story 1 delivers complete value - automated email ingestion from Google Sheets to SQLite. This can be deployed and used in production immediately.

---

### Incremental Delivery

**Iteration 1 - MVP** (Setup + Foundational + US1):
- ✅ Webhook server running on port 8455
- ✅ Accepts valid email JSON payloads
- ✅ Stores in SQLite database
- ✅ Handles duplicate IDs idempotently
- ✅ Basic logging
- ✅ Independent test: Send email → verify storage
- 🚀 **DEPLOY**: Can ship to production

**Iteration 2 - Robustness** (Add US2):
- ✅ All MVP features
- ✅ Validates payloads, rejects missing fields
- ✅ Handles invalid JSON gracefully
- ✅ Handles database errors without crashing
- ✅ Server continues after individual errors
- ✅ Independent test: Send bad data → verify appropriate errors
- 🚀 **DEPLOY**: Production-hardened webhook

**Iteration 3 - Observability** (Add US3):
- ✅ All robustness features
- ✅ Health check endpoint for monitoring
- ✅ Database connection status
- ✅ Uptime tracking
- ✅ Independent test: Call /health → verify status
- 🚀 **DEPLOY**: Fully monitored webhook

**Iteration 4 - Production Polish** (Add Phase 6):
- ✅ All observability features
- ✅ Graceful shutdown
- ✅ Unknown route handling
- ✅ Method validation
- ✅ Content-Type validation
- ✅ Contract tests
- ✅ Performance validation (concurrency, uptime)
- 🚀 **DEPLOY**: Production-ready with full operational excellence

---

### Parallel Team Strategy

**Single Developer** (recommended):
1. Day 1: Setup + Foundational (T001-T003) - 30 mins
2. Day 1-2: User Story 1 (T004-T015) - 4-6 hours → **MVP COMPLETE**
3. Day 3: User Story 2 (T016-T022) - 2-3 hours → **Robust version**
4. Day 3-4: User Story 3 (T023-T027) - 1-2 hours → **Monitored version**
5. Day 4-5: Polish (T028-T042) - 4-6 hours → **Production-ready**

**Two Developers**:
1. Both: Setup + Foundational (T001-T003)
2. Both: User Story 1 (T004-T015) → MVP complete
3. Developer A: User Story 2 (T016-T022)
4. Developer B: User Story 3 (T023-T027) - can start in parallel
5. Both: Polish tasks in parallel (T028-T042)

**Three+ Developers** (overkill for this feature):
- Not recommended - single file (src/webhook-server.js) creates merge conflicts
- Better: One dev on webhook, others on related features (Google Apps Script config, monitoring dashboard, etc.)

---

## Testing Strategy

**Contract Validation** (recommended even without full tests):

Create simple contract validation script in tests/webhook-server.test.js:

```javascript
// Test scenarios from contracts/webhook-api.md
1. Valid email → 200 OK, action: stored
2. Duplicate email → 200 OK, action: skipped
3. Missing required field → 400 Bad Request
4. Invalid JSON → 400 Bad Request
5. Health check → 200 OK with status
```

**Manual Testing Checklist**:
- [ ] Start server, verify listening on 8455
- [ ] Send valid email payload → 200 OK
- [ ] Send same payload → 200 OK (skipped)
- [ ] Check database → 1 row inserted
- [ ] Send payload with missing field → 400
- [ ] Send invalid JSON → 400
- [ ] Send valid payload after errors → 200 OK (server still works)
- [ ] Call GET /health → 200 OK
- [ ] Ctrl+C server → graceful shutdown logs
- [ ] Send GET to /webhook → 405 Method Not Allowed
- [ ] Send POST to /unknown → 404 Not Found

**Load Testing** (from quickstart.md):
```bash
# 100 requests, 10 concurrent
ab -n 100 -c 10 -p test-payload.json -T application/json http://localhost:8455/webhook

# Verify: All 200 OK, p95 < 200ms, no errors
```

---

## Notes

- **[P] tasks** = different files or independent concerns, can run in parallel
- **[Story] label** maps task to specific user story for traceability and independent testing
- **Single file limitation**: All tasks modify src/webhook-server.js → coordinate carefully if parallelizing
- **Database reuse**: Zero tasks for database changes - reusing existing database.js perfectly
- **Minimal dependencies**: Zero new npm packages needed - using built-in Node.js http module
- **Fast MVP**: Can deliver working webhook in 4-6 hours (Setup + Foundational + US1)
- **Independent stories**: Each user story adds value without breaking previous stories
- **Commit strategy**: Commit after each user story phase for rollback safety
- **Testing**: Contract validation recommended but not required by spec
- **Deployment**: Can deploy after any user story completion (MVP = US1, Robust = US1+US2, Full = All)

---

## Task Summary

**Total Tasks**: 42

**By Phase**:
- Phase 1 (Setup): 1 task
- Phase 2 (Foundational): 2 tasks
- Phase 3 (US1 - MVP): 12 tasks
- Phase 4 (US2 - Error Handling): 7 tasks
- Phase 5 (US3 - Health Check): 5 tasks
- Phase 6 (Polish): 15 tasks

**By User Story**:
- User Story 1: 12 tasks (core webhook functionality)
- User Story 2: 7 tasks (error handling)
- User Story 3: 5 tasks (health monitoring)
- Infrastructure/Polish: 18 tasks

**Parallel Opportunities**:
- Phase 2: 2 tasks can run in parallel
- Phase 6: 10+ tasks can run in parallel
- US2 and US3 can run in parallel after US1 completes

**MVP Scope** (Recommended First Deployment):
- Phase 1 + Phase 2 + Phase 3 (User Story 1)
- Total: 15 tasks
- Estimated time: 4-8 hours for single developer
- Delivers: Fully functional webhook server with idempotent email storage

**Production-Ready Scope**:
- All phases (1-6)
- Total: 42 tasks
- Estimated time: 2-3 days for single developer
- Delivers: Hardened webhook with monitoring, error handling, and operational excellence
