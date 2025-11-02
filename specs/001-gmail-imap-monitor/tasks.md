# Tasks: Gmail IMAP Email Monitor

**Input**: Design documents from `/specs/001-gmail-imap-monitor/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Branch**: `001-gmail-imap-monitor`
**Generated**: 2025-11-01

**Tests**: Test tasks are NOT included in this task list as the specification does not explicitly request TDD approach. Tests can be added later if needed.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `- [ ] [ID] [P?] [Story?] Description with file path`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- All paths are relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic directory structure

**Tasks**:

- [x] T001 Create project directory structure (src/, data/, tests/unit/, tests/integration/, tests/contract/)
- [x] T002 Initialize package.json with Node.js v24 ES modules configuration
- [x] T003 [P] Install dependencies: imap, better-sqlite3, mailparser, dotenv
- [x] T004 [P] Create .env.example with required environment variables per quickstart.md
- [x] T005 [P] Create .gitignore to exclude .env, data/, node_modules/

**Checkpoint**: Project structure ready for module implementation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure modules that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

**Tasks**:

- [x] T006 Implement config loader in src/config.js to load and validate environment variables
- [x] T007 [P] Implement database initialization in src/database.js (schema, indexes, WAL mode per data-model.md)
- [x] T008 [P] Implement state manager initialization in src/state-manager.js (read/write/validate per state-manager-contract.md)
- [x] T009 [P] Implement structured logger utility in src/logger.js (JSON format, ISO 8601 timestamps, log levels)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Real-Time Email Receipt (Priority: P1) 🎯 MVP

**Goal**: Monitor Gmail IMAP connection, receive emails via IDLE push, parse and store in SQLite database with all metadata

**Independent Test**: Send test email to monitored Gmail account → verify appears in SQLite database within 5 seconds with all fields (from, to, subject, body, labels, timestamps)

**Why MVP**: This is the core value proposition. Without real-time monitoring, the system provides no advantage over manual email checking.

### Implementation for User Story 1

- [x] T010 [P] [US1] Implement database operations in src/database.js: storeEmail(), getEmailById(), countEmails(), closeDatabase() per database-contract.md
- [x] T011 [P] [US1] Implement state manager operations in src/state-manager.js: initState(), readState(), updateState(), validateState() per state-manager-contract.md
- [x] T012 [US1] Implement IMAP connection manager in src/imap-client.js: connect(), openInbox(), startIDLE(), handle 'mail' events (depends on T006 for config)
- [x] T013 [US1] Implement email parser in src/email-processor.js: fetchEmail(), parseHeaders(), parseBody() using mailparser
- [x] T014 [US1] Implement email validation in src/email-processor.js: validateEmailRecord() per data-model.md validation rules
- [x] T015 [US1] Implement email storage workflow in src/email-processor.js: processEmail() that calls parser → validator → storeEmail() → updateState()
- [x] T016 [US1] Implement main entry point in src/imap-monitor.js: initialize modules, start IMAP connection, handle 'mail' events, graceful shutdown on SIGINT/SIGTERM
- [x] T017 [US1] Add error handling for email parsing failures (log error, skip email, continue - FR-014)
- [x] T018 [US1] Add duplicate prevention logic using id check before insertion (FR-009)
- [x] T019 [US1] Add structured logging for email receipt events (id, subject, from, timestamp - FR-011)

**Checkpoint**: At this point, User Story 1 (real-time monitoring) should be fully functional and testable independently by sending test emails

**Acceptance Criteria**:
- ✓ Monitor connects to Gmail IMAP and enters IDLE state
- ✓ New email arrives and appears in database within 5 seconds
- ✓ All email fields stored correctly (id, from, to, cc, subject, body, received_at, labels, downloaded_at)
- ✓ Multiple simultaneous emails captured without loss or duplication
- ✓ HTML emails stored correctly
- ✓ Emails with multiple recipients (To, CC) preserved accurately

---

## Phase 4: User Story 2 - Automatic Reconnection & Sync (Priority: P2)

**Goal**: Detect connection drops, automatically reconnect with exponential backoff, sync missed emails using id-based search

**Independent Test**: Disconnect network → send test emails → reconnect network → verify system auto-recovers within 60s and all missed emails appear in database

**Why This Priority**: Critical for reliability in real-world usage where network interruptions and Mac sleep cycles are common

**Dependencies**: Requires User Story 1 complete (connection and email storage)

### Implementation for User Story 2

- [ ] T020 [US2] Implement connection health monitoring in src/imap-client.js: detect 'error' and 'end' events, 30-second timeout checks (FR-006)
- [ ] T021 [US2] Implement exponential backoff manager in src/imap-client.js: ReconnectionManager class with delays [1s, 2s, 4s, 8s, max 60s] (FR-007)
- [ ] T022 [US2] Implement automatic reconnection logic in src/imap-client.js: reconnect() method that uses exponential backoff
- [ ] T023 [US2] Implement missed email sync in src/imap-client.js: syncMissedEmails() that searches UIDs greater than last_id (FR-008)
- [ ] T024 [US2] Update state manager in src/state-manager.js: track connection_status transitions (connected/reconnecting/disconnected)
- [ ] T025 [US2] Add error logging to state file when connection drops (last_error field, FR-005)
- [ ] T026 [US2] Update main entry point in src/imap-monitor.js: wire up reconnection logic on connection loss
- [ ] T027 [US2] Add structured logging for reconnection attempts (timestamp, attempt number, backoff delay - FR-011)
- [ ] T028 [US2] Handle Mac sleep/wake cycles by treating as connection drop and triggering reconnection

**Checkpoint**: At this point, User Stories 1 AND 2 should work independently - real-time monitoring with automatic recovery

**Acceptance Criteria**:
- ✓ Connection loss detected within 30 seconds
- ✓ System auto-reconnects within 60 seconds using exponential backoff (1s, 2s, 4s, 8s, max 60s)
- ✓ Missed emails during disconnection are synced in chronological order
- ✓ Mac sleep/wake cycles handled without manual restart
- ✓ Reconnection attempts logged with backoff pattern visible
- ✓ State file reflects reconnection status and errors

---

## Phase 5: User Story 3 - State Visibility & Monitoring (Priority: P3)

**Goal**: Provide operational transparency through state file and structured logs for debugging and monitoring

**Independent Test**: Examine state file during various operations (connect, disconnect, email receipt) → verify status, UIDs, timestamps updated correctly

**Why This Priority**: Important for operational transparency and debugging, but not required for basic functionality

**Dependencies**: Requires User Stories 1 and 2 complete (all operations that update state)

### Implementation for User Story 3

- [ ] T029 [P] [US3] Add detailed state updates in src/state-manager.js: updateState() called immediately after each email processed (FR-005)
- [ ] T030 [P] [US3] Add connection timestamp tracking in src/imap-client.js: update last_connected_at on successful connection
- [ ] T031 [P] [US3] Add comprehensive logging in src/imap-monitor.js: log startup, connection established, IDLE activated
- [ ] T032 [US3] Enhance email logging in src/email-processor.js: include id, subject, sender in each log entry (FR-011)
- [ ] T033 [US3] Add error context logging: include error type, timestamp, affected email id when parsing fails
- [ ] T034 [US3] Implement state file validation on startup: check for corruption, attempt recovery with initial state if needed
- [ ] T035 [US3] Add helper function in src/state-manager.js: clearError() for use on successful recovery

**Checkpoint**: All user stories should now be independently functional with full observability

**Acceptance Criteria**:
- ✓ State file shows current connection_status (connected/reconnecting/disconnected)
- ✓ State file shows last_id and last_id_received_at after each email
- ✓ Error details recorded in state file with timestamp (last_error field)
- ✓ Logs include timestamped entries for connections, disconnections, emails received, errors
- ✓ Reconnection attempts visible in logs with exponential backoff pattern
- ✓ State updates within 2 seconds of any state change

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, edge case handling, performance optimization, production readiness

**Tasks**:

- [ ] T036 [P] Handle edge case: emails with no subject or body (store empty strings, don't fail)
- [ ] T037 [P] Handle edge case: Gmail labels with special characters/emojis (store as-is in JSON)
- [ ] T038 [P] Handle edge case: database locked errors (retry with backoff, don't crash)
- [ ] T039 [P] Handle edge case: credentials expired/revoked (log auth error, update state, attempt reconnection)
- [ ] T040 [P] Handle edge case: initial startup with empty database (start monitoring from current point, don't sync history)
- [ ] T041 [P] Implement graceful shutdown in src/imap-monitor.js: handle SIGINT/SIGTERM, close IMAP, flush state, close database (FR-012)
- [ ] T042 [P] Add performance optimization: use prepared statements for database operations (already in contract)
- [ ] T043 [P] Add performance optimization: batch sync using transactions when syncing missed emails
- [ ] T044 Create comprehensive README.md based on quickstart.md with setup, configuration, running instructions
- [ ] T045 [P] Add inline code documentation (JSDoc) for all public functions in each module
- [ ] T046 Verify memory footprint <100MB during 7-day continuous operation (manual testing or monitoring)
- [ ] T047 Verify 10,000+ email performance target (load test with batch insertion)
- [ ] T048 Final verification: Run complete acceptance test for all 3 user stories

**Checkpoint**: Feature complete, production-ready

---

## Dependencies & Execution Strategy

### User Story Dependency Graph

```text
Phase 1: Setup
    ↓
Phase 2: Foundational (config, database, state-manager, logger)
    ↓
Phase 3: User Story 1 (P1) - Real-Time Email Receipt 🎯 MVP
    ↓
Phase 4: User Story 2 (P2) - Automatic Reconnection & Sync
    ↓
Phase 5: User Story 3 (P3) - State Visibility & Monitoring
    ↓
Phase 6: Polish & Cross-Cutting Concerns
```

**Parallelization Opportunities**: All tasks marked with [P] can be executed in parallel within their phase

### Story Completion Order

1. **MVP (Minimum Viable Product)**: Complete through Phase 3 (User Story 1)
   - Delivers core value: real-time email monitoring and storage
   - Independently testable by sending test emails
   - **Task count**: T001-T019 (19 tasks)

2. **Enhanced Reliability**: Add Phase 4 (User Story 2)
   - Adds automatic reconnection and missed email sync
   - Handles real-world network interruptions
   - **Task count**: T020-T028 (9 tasks)

3. **Full Feature**: Add Phase 5 (User Story 3)
   - Adds operational visibility and debugging capabilities
   - **Task count**: T029-T035 (7 tasks)

4. **Production Ready**: Complete Phase 6 (Polish)
   - Edge cases, documentation, performance verification
   - **Task count**: T036-T048 (13 tasks)

### Parallel Execution Examples

**Within Phase 2 (Foundational)**:
- Run T007, T008, T009 in parallel (different files: database.js, state-manager.js, logger.js)

**Within Phase 3 (User Story 1)**:
- Run T010, T011 in parallel (different files: database operations, state operations)
- After T010-T011 complete: Run T012, T013, T014 sequentially (dependencies)

**Within Phase 4 (User Story 2)**:
- T020-T023 must run sequentially (same file: imap-client.js, logical dependencies)
- T027, T028 can run in parallel (different files)

**Within Phase 5 (User Story 3)**:
- Run T029, T030, T031 in parallel (different files)

**Within Phase 6 (Polish)**:
- Run T036-T040 in parallel (edge cases, different parts of codebase)
- Run T041-T043, T045 in parallel (different concerns)

---

## Independent Test Criteria

### User Story 1 (MVP) - Real-Time Email Receipt

**Test Setup**:
1. Start monitor: `npm start`
2. Verify logs show "IMAP connected" and "IDLE activated"

**Test Execution**:
1. Send test email to monitored Gmail account (from another account or Gmail web)
2. Wait 5 seconds

**Expected Results**:
- ✓ Log entry shows: `{"level":"INFO","message":"Email received","id":XXXX,"subject":"Test"}`
- ✓ SQLite query: `SELECT * FROM emails WHERE subject='Test'` returns 1 row
- ✓ All fields populated: id, from_address, to_address, subject, body, received_at, labels, downloaded_at
- ✓ State file shows: last_id updated, connection_status="connected", last_error=null

**Pass Criteria**: Email appears in database within 5 seconds with all metadata

---

### User Story 2 - Automatic Reconnection & Sync

**Test Setup**:
1. Complete User Story 1 test (monitor running and receiving emails)
2. Note current last_id from state file

**Test Execution**:
1. Disconnect network (turn off WiFi)
2. Wait 30 seconds - verify log shows "Connection lost"
3. From another device, send 2 test emails to monitored account
4. Reconnect network (turn on WiFi)
5. Wait 60 seconds

**Expected Results**:
- ✓ Log shows: "Reconnecting (attempt 1, delay 1000ms)"
- ✓ Log shows: "Reconnection successful"
- ✓ Log shows: "Syncing missed emails, count: 2"
- ✓ SQLite query: `SELECT COUNT(*) FROM emails WHERE id > [last_id]` returns 2
- ✓ State file shows: connection_status="connected", last_id updated, last_error=null

**Pass Criteria**: System auto-recovers within 60 seconds and all missed emails synced

---

### User Story 3 - State Visibility & Monitoring

**Test Setup**:
1. Complete User Stories 1 and 2 tests (monitor running with reconnection working)

**Test Execution**:
1. Check state file: `cat data/current_state.json`
2. Send test email
3. Check state file again (within 2 seconds)
4. Force connection error (invalid credentials in .env)
5. Restart monitor
6. Check state file and logs

**Expected Results**:
- ✓ State file before email: shows current connection_status, last_id, timestamps
- ✓ State file after email: last_id incremented, last_id_received_at updated
- ✓ State file after connection error: connection_status="disconnected", last_error="Authentication failed"
- ✓ Logs show all events: startup, connection attempts, errors with timestamps
- ✓ State updates within 2 seconds of any change

**Pass Criteria**: State file accurately reflects system status in real-time

---

## Task Summary

**Total Tasks**: 48

**By Phase**:
- Phase 1 (Setup): 5 tasks
- Phase 2 (Foundational): 4 tasks
- Phase 3 (User Story 1 - P1): 10 tasks
- Phase 4 (User Story 2 - P2): 9 tasks
- Phase 5 (User Story 3 - P3): 7 tasks
- Phase 6 (Polish): 13 tasks

**By User Story**:
- US1 (Real-Time Email Receipt): 10 tasks
- US2 (Automatic Reconnection): 9 tasks
- US3 (State Visibility): 7 tasks
- Infrastructure/Polish: 22 tasks

**Parallelizable Tasks**: 22 tasks marked with [P]

**MVP Scope (Recommended)**: Complete through Phase 3 (19 tasks) to deliver core value

---

## Implementation Notes

1. **Start with MVP**: Focus on Phase 1-3 (User Story 1) first. This delivers the core value proposition and can be tested independently.

2. **Module Dependencies**:
   - config.js (T006) → Required by all modules
   - database.js (T007, T010) → Required by email-processor.js
   - state-manager.js (T008, T011) → Required by imap-client.js and email-processor.js
   - logger.js (T009) → Required by all modules

3. **Testing Strategy** (if tests are added later):
   - Contract tests should be written before implementation for each module
   - Integration tests should cover end-to-end flows (IMAP → parse → store → state update)
   - Unit tests can be added incrementally as modules are implemented

4. **Key Files** (as per plan.md):
   - `src/imap-monitor.js` - Main entry point (T016, T026, T031, T041)
   - `src/config.js` - Configuration (T006)
   - `src/database.js` - SQLite operations (T007, T010)
   - `src/state-manager.js` - State persistence (T008, T011, T024, T029, T035)
   - `src/imap-client.js` - IMAP connection (T012, T020-T023, T030)
   - `src/email-processor.js` - Email parsing (T013-T015, T032)
   - `src/logger.js` - Structured logging (T009)

5. **Performance Targets** (verify in Phase 6):
   - <5 second email receipt latency (SC-001)
   - <60 second reconnection time (SC-002)
   - 7+ day continuous operation (SC-003)
   - <100MB memory footprint (constraint from plan.md)
   - 10,000+ emails without degradation (FR-013)

6. **Error Handling Patterns**:
   - Graceful degradation (log and continue, don't crash)
   - Exponential backoff for transient errors
   - Structured error logging with context
   - State file updated on errors

---

## Ready for Implementation

This task list is ready for execution with `/speckit.implement` or manual implementation.

Each task includes:
- ✓ Clear task ID for tracking
- ✓ Parallelization markers [P]
- ✓ User story labels [US1], [US2], [US3]
- ✓ Specific file paths
- ✓ Implementation details from contracts and data-model
- ✓ Dependencies identified
- ✓ Independent test criteria per user story
- ✓ MVP scope clearly defined

**Next Step**: Begin implementation starting with Phase 1 (Setup) tasks T001-T005.
