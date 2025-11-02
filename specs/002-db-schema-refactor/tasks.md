# Tasks: Database Schema Refactor

**Input**: Design documents from `/specs/002-db-schema-refactor/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: No tests requested in specification - tests are optional for this refactoring task

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- Paths assume single project structure per plan.md

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Backup preparation and validation before schema changes

- [X] T001 Create database backup at data/emails.db.backup-$(date +%Y%m%d-%H%M%S) before making any changes
- [X] T002 Verify current database schema by running: sqlite3 data/emails.db ".schema emails" to document baseline

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core schema migration infrastructure that MUST be complete before user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Add schema version detection function needsMigration() in src/database.js to check for INTEGER id and missing thread_id
- [X] T004 Add schema migration function migrateSchema() in src/database.js implementing the "create new table + copy data + rename" pattern from research.md
- [X] T005 Add migration validation logic in src/database.js to verify row count matches between old and new tables before commit
- [X] T006 Update initDatabase() in src/database.js to detect and run migration automatically when old schema is found
- [X] T007 Add migration logging in src/database.js to log start, progress, and completion of schema migration

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Store Gmail Message IDs as Text (Priority: P1) 🎯 MVP

**Goal**: Change `id` field from INTEGER to TEXT, implement automatic migration, and maintain duplicate detection with text-based IDs

**Independent Test**: Store an email with a Gmail message ID (text), verify it's stored correctly, retrieve it by ID, and confirm duplicate detection still works

### Implementation for User Story 1

- [X] T008 [US1] Update CREATE TABLE statement in src/database.js to use TEXT PRIMARY KEY for id field instead of INTEGER
- [X] T009 [US1] Update CREATE TABLE statement in src/database.js to add thread_id TEXT NOT NULL field immediately after id
- [X] T010 [US1] Update CREATE TABLE statement in src/database.js to reorder columns: id, thread_id, received_at, downloaded_at, from_address, to_address, cc_address, subject, labels, body
- [X] T011 [US1] Implement migration SQL in migrateSchema() to create emails_new table with new schema in src/database.js
- [X] T012 [US1] Implement migration SQL in migrateSchema() to INSERT data from old table with CAST(id AS TEXT) and empty thread_id in src/database.js
- [X] T013 [US1] Implement migration SQL in migrateSchema() to DROP old table and RENAME emails_new to emails in src/database.js
- [X] T014 [US1] Update storeEmail() duplicate check in src/database.js to work with TEXT id (verify WHERE id = ? works correctly)
- [X] T015 [US1] Update getEmailById() in src/database.js to accept string id parameter instead of number
- [X] T016 [US1] Verify all SQL queries in src/database.js use parameterized queries with text IDs (no changes needed, just verify)
- [X] T017 [US1] Test migration by running npm run imap-monitor with existing database and verify logs show successful migration
- [X] T018 [US1] Verify migrated data by running: sqlite3 data/emails.db "SELECT typeof(id), id, thread_id FROM emails LIMIT 5" and confirm id is text type

**Checkpoint**: At this point, User Story 1 should be fully functional - text IDs work, migration completes successfully, duplicate detection works

---

## Phase 4: User Story 2 - Track Email Thread Context (Priority: P2)

**Goal**: Extract thread_id from Gmail IMAP, store alongside message_id, and enable querying emails by conversation thread

**Independent Test**: Store emails from the same Gmail thread, verify both have the same thread_id, then query by thread_id to retrieve all thread messages

### Implementation for User Story 2

- [X] T019 [P] [US2] Add getEmailsByThread() function in src/database.js that queries by thread_id and orders by received_at
- [X] T020 [P] [US2] Update fetchEmail() in src/email-processor.js to extract x-gm-thrid from emailData.attrs IMAP attributes
- [X] T021 [US2] Update fetchEmail() in src/email-processor.js to convert thread_id to string: String(attrs['x-gm-thrid']) || ''
- [X] T022 [US2] Update email record construction in src/email-processor.js to include thread_id field after id
- [X] T023 [US2] Update email record construction in src/email-processor.js to ensure id is explicitly converted to string: String(emailData.id)
- [X] T024 [US2] Update email record field order in src/email-processor.js to match database schema: id, thread_id, received_at, downloaded_at, from_address, to_address, cc_address, subject, labels, body
- [X] T025 [US2] Add error handling in fetchEmail() in src/email-processor.js for missing x-gm-thrid (fallback to empty string)
- [X] T026 [US2] Test thread_id extraction by running npm run imap-monitor, sending yourself a test email, replying to create a thread, and verifying both emails have same thread_id
- [X] T027 [US2] Test getEmailsByThread() by querying: sqlite3 data/emails.db "SELECT id, subject, thread_id FROM emails WHERE thread_id != '' ORDER BY received_at" and verify thread grouping

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - text IDs work, thread_id is captured from new emails, and thread queries work

---

## Phase 5: User Story 3 - Organize Email Metadata Logically (Priority: P3)

**Goal**: Verify database schema has correct column order with logical grouping (IDs, timestamps, addresses, content)

**Independent Test**: Inspect database schema and verify column order matches: id, thread_id, received_at, downloaded_at, from_address, to_address, cc_address, subject, labels, body

### Implementation for User Story 3

- [X] T028 [US3] Verify column order in CREATE TABLE statement matches spec in src/database.js (id, thread_id, received_at, downloaded_at, from_address, to_address, cc_address, subject, labels, body)
- [X] T029 [US3] Verify column order in migration INSERT statement matches new schema in src/database.js
- [X] T030 [US3] Update CREATE INDEX statements in src/database.js to include idx_thread_id ON emails(thread_id)
- [X] T031 [US3] Verify all indexes are created in correct order: idx_downloaded_at, idx_from_address, idx_thread_id in src/database.js
- [X] T032 [US3] Test schema inspection by running: sqlite3 data/emails.db ".schema emails" and verify column order and indexes
- [X] T033 [US3] Test that existing queries (getRecentEmails, countEmails) still work correctly with new column order

**Checkpoint**: All user stories should now be independently functional - schema has correct structure, all queries work, indexes are in place

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation, testing, and documentation updates

- [X] T034 [P] Run validation checklist from quickstart.md: verify new database creates correct schema, migration works, duplicate detection works
- [X] T035 [P] Run integration test: send test email, verify it's stored with text ID and thread_id, query by thread, verify results
- [X] T036 [P] Test edge case: verify empty thread_id (for migrated records) doesn't break queries or storage
- [X] T037 [P] Test edge case: verify long Gmail message IDs (16-20 chars) are stored without truncation
- [X] T038 [P] Performance validation: run migration on database with existing records, verify completes in <1 second per 10k records
- [X] T039 [P] Verify gmail-to-sheet.gs has NOT been modified (per requirement FR-011)
- [X] T040 Run full system test: npm run imap-monitor, wait for new email, verify end-to-end functionality
- [X] T041 Create post-migration database backup: cp data/emails.db data/emails.db.post-migration-$(date +%Y%m%d-%H%M%S)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User Story 1 (P1): Can start after Foundational - No dependencies on other stories
  - User Story 2 (P2): Can start after Foundational - Independent of US1 (but enhances it)
  - User Story 3 (P3): Can start after US1 completes - Validates schema structure
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories (FOUNDATION)
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Independent but builds on US1's schema changes
- **User Story 3 (P3)**: Should start after US1 (validates the column reordering from US1) - Independent verification

### Within Each User Story

**User Story 1**:
- T008-T010: Schema definition updates (can do together)
- T011-T013: Migration SQL implementation (sequential, builds on schema)
- T014-T016: Code updates for text IDs (parallel, different concerns)
- T017-T018: Testing (sequential, after implementation)

**User Story 2**:
- T019-T020: Parallel (different files: database.js vs email-processor.js)
- T021-T025: Sequential (all in email-processor.js, building email record)
- T026-T027: Testing (sequential, after implementation)

**User Story 3**:
- T028-T031: Sequential verification tasks (all in database.js)
- T032-T033: Testing (sequential, after verification)

### Parallel Opportunities

- **Phase 1**: T001 and T002 can run in parallel (different operations)
- **Phase 2**: T003-T007 must run sequentially (all modify database.js, interdependent)
- **User Story 1**: T014, T015, T016 can run in parallel (different functions in same file but independent changes)
- **User Story 2**: T019 and T020 can run in parallel (different files), then T021-T025 sequential
- **User Story 3**: Must run sequentially (all verification/testing)
- **Phase 6**: T034-T039 can all run in parallel (different validation tasks)

---

## Parallel Example: User Story 2

```bash
# Launch model and database function creation together:
Task: "Add getEmailsByThread() function in src/database.js"
Task: "Update fetchEmail() in src/email-processor.js to extract x-gm-thrid"

# After both complete, continue with email record updates sequentially
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (backup database)
2. Complete Phase 2: Foundational (migration infrastructure)
3. Complete Phase 3: User Story 1 (text IDs + migration)
4. **STOP and VALIDATE**: Test migration works, text IDs work, duplicate detection works
5. This is the minimum viable change - database uses text IDs correctly

### Incremental Delivery

1. Complete Setup + Foundational → Migration infrastructure ready
2. Add User Story 1 → Test independently → **MVP Ready** (text IDs work, migration works)
3. Add User Story 2 → Test independently → **Enhanced** (thread tracking added)
4. Add User Story 3 → Test independently → **Complete** (schema fully validated)
5. Add Polish → **Production Ready** (all validations pass)

### Sequential Execution (Recommended)

Since this is a database refactoring task affecting a single service:

1. **Phase 1-2**: Setup + Foundation (required)
2. **Phase 3**: User Story 1 COMPLETE (critical foundation - do not proceed until working)
3. **Phase 4**: User Story 2 COMPLETE (builds on US1)
4. **Phase 5**: User Story 3 COMPLETE (validates US1 and US2)
5. **Phase 6**: Polish and validate everything

**Rationale**: Database schema changes are interdependent, and all changes affect the same file (src/database.js). Sequential execution reduces risk of conflicts and ensures each change is validated before proceeding.

---

## Summary

- **Total Tasks**: 41 tasks
- **User Story 1 (P1)**: 11 tasks (T008-T018) - Foundation schema changes
- **User Story 2 (P2)**: 9 tasks (T019-T027) - Thread tracking
- **User Story 3 (P3)**: 6 tasks (T028-T033) - Schema validation
- **Setup**: 2 tasks (T001-T002)
- **Foundational**: 5 tasks (T003-T007)
- **Polish**: 8 tasks (T034-T041)

**Parallel Opportunities**: 7 tasks can run in parallel (marked with [P])

**MVP Scope**: Phase 1 + Phase 2 + Phase 3 (User Story 1) = 18 tasks for minimum viable schema refactor

**Independent Test Criteria**:
- **US1**: Store email with text ID, retrieve it, verify duplicate detection works
- **US2**: Store thread emails, verify same thread_id, query by thread_id
- **US3**: Inspect schema, verify column order and indexes

---

## Notes

- All tasks include specific file paths (src/database.js or src/email-processor.js)
- [P] tasks = can run in parallel (different files or independent operations)
- [Story] labels map tasks to user stories for traceability
- Each user story can be independently tested per acceptance scenarios
- Migration is automatic - runs on next database initialization
- No changes to gmail-to-sheet.gs (explicitly out of scope)
- Tests are optional - not included since not requested in specification
