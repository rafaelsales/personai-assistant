# Implementation Plan: Gmail IMAP Email Monitor

**Branch**: `001-gmail-imap-monitor` | **Date**: 2025-11-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-gmail-imap-monitor/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Build a local macOS background service that maintains a persistent IMAP connection to Gmail, downloads new emails in real-time using IMAP IDLE, and stores them in a local SQLite database. The system must handle network interruptions gracefully with automatic reconnection and email synchronization, maintain accurate state tracking, and run continuously as a long-lived process. The implementation will use Node.js with modern JavaScript (ES2022+), IMAP libraries supporting IDLE extension, and SQLite for local storage.

## Technical Context

**Language/Version**: JavaScript ES2022+ / Node.js v24 LTS (ES Modules)
**Primary Dependencies**: `imap` (IMAP client with IDLE), `better-sqlite3` (synchronous SQLite), `mailparser` (email parsing), `dotenv` (configuration)
**Storage**: SQLite with WAL mode (./data/emails.db) + JSON state file (./data/current_state.json)
**Testing**: `node:test` + `node:assert` (Node.js built-in test runner)
**Target Platform**: macOS (Darwin)
**Project Type**: Single (background service/daemon)
**Performance Goals**: <5 second email receipt latency, <60 second reconnection time, support 10,000+ emails without degradation
**Constraints**: Must handle Mac sleep/wake cycles, must not crash on individual email parsing errors, must use exponential backoff (1s, 2s, 4s, 8s, max 60s), <100MB memory footprint
**Scale/Scope**: Single Gmail account, INBOX only, 10,000+ emails, continuous 7+ day operation

**Note**: All NEEDS CLARIFICATION items resolved in [research.md](./research.md)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: N/A - No project constitution found at `.specify/memory/constitution.md` (file contains template placeholder). Proceeding with standard Node.js best practices and requirements specification adherence.

**Note**: This project should establish a constitution defining core principles (e.g., testing requirements, error handling standards, logging conventions, dependency management policies). Consider running `/speckit.constitution` to establish project principles before implementation.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
personai-assistant/
├── src/
│   ├── imap-monitor.js       # Main entry point, process lifecycle
│   ├── imap-client.js        # IMAP connection management, IDLE handling
│   ├── email-processor.js    # Email parsing and storage logic
│   ├── database.js           # SQLite operations and schema
│   ├── state-manager.js      # current_state.json read/write
│   └── config.js             # Environment variable loading
├── data/
│   ├── emails.db             # SQLite database (created at runtime)
│   └── current_state.json    # State tracking file (created at runtime)
├── tests/
│   ├── unit/                 # Unit tests for individual modules
│   ├── integration/          # Integration tests for IMAP + DB flows
│   └── contract/             # Contract tests for state file schema
├── .env.example              # Example environment variables
├── package.json              # Dependencies and scripts
└── README.md                 # Setup and usage instructions
```

**Structure Decision**: Single project structure selected as this is a standalone background service with no frontend/backend separation or mobile components. The modular source layout separates concerns: connection management (imap-client.js), data processing (email-processor.js), persistence (database.js, state-manager.js), and configuration (config.js). The main entry point (index.js) orchestrates the lifecycle.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

N/A - No constitution defined, therefore no violations to track.

---

## Phase Completion Summary

### Phase 0: Research & Decisions ✓

**Status**: Complete

**Deliverables**:
- [research.md](./research.md) - Technical decisions and library selections

**Key Decisions**:
1. **IMAP Library**: `imap` - Mature, IDLE support, low-level control for reconnection logic
2. **SQLite Library**: `better-sqlite3` - Synchronous API, 2-4x faster, simpler error handling
3. **Test Framework**: `node:test` - Built-in, zero dependencies, sufficient features
4. **Email Parsing**: `mailparser` - Standard MIME parsing, handles edge cases
5. **Logging**: Structured JSON console logging with ISO 8601 timestamps
6. **Reconnection**: Custom exponential backoff (1s, 2s, 4s, 8s, max 60s)

**Risks Identified**:
- Gmail IMAP API changes (mitigated by stable library choice)
- Connection stability on macOS sleep/wake (comprehensive testing required)
- Memory leaks in long-running process (synchronous SQLite helps, monitoring needed)

---

### Phase 1: Design & Contracts ✓

**Status**: Complete

**Deliverables**:
- [data-model.md](./data-model.md) - SQLite schema and state file structure
- [contracts/](./contracts/) - Module interface specifications
  - [README.md](./contracts/README.md) - Architecture overview
  - [database-contract.md](./contracts/database-contract.md) - Database operations
  - [state-manager-contract.md](./contracts/state-manager-contract.md) - State persistence
- [quickstart.md](./quickstart.md) - Setup and usage guide
- [CLAUDE.md](../../CLAUDE.md) - Agent context updated with tech stack

**Key Design Decisions**:
1. **Database Schema**:
   - `emails` table with id primary key
   - Indexes on `downloaded_at` (chronological) and `from_address` (queries)
   - WAL mode for better concurrency

2. **State Management**:
   - JSON file with atomic writes (temp file + rename)
   - Tracks: last_id, connection_status, timestamps, errors
   - Updated after each email and on connection changes

3. **Module Architecture**:
   - 6 modules: index.js, config.js, database.js, state-manager.js, imap-client.js, email-processor.js
   - Clear separation of concerns
   - Contract-based interfaces for testing

4. **Error Handling**:
   - Graceful degradation (log and continue)
   - Exponential backoff for transient errors
   - Duplicate prevention via id primary key
   - No crashes on individual email parsing failures

**Performance Targets Met**:
- Single email insert: <10ms
- Batch sync (100 emails): <500ms
- Support 10,000+ emails without degradation
- Memory footprint: <100MB

---

### Phase 2: Task Generation (Next Step)

**Status**: Not Started - Run `/speckit.tasks` to proceed

**Purpose**: Generate actionable, dependency-ordered implementation tasks

**Expected Output**: `tasks.md` with:
- Prioritized task list aligned with user story priorities (P1, P2, P3)
- Dependency chains (e.g., database.js before email-processor.js)
- Test-first approach (contract tests → unit tests → integration tests)
- Concrete acceptance criteria per task

**Estimated Scope**: 15-25 implementation tasks covering:
1. Project setup (package.json, directory structure, .env)
2. Core modules (config, database, state-manager)
3. IMAP connectivity (connection, IDLE, reconnection)
4. Email processing (parsing, validation, storage)
5. Testing (unit, contract, integration)
6. Documentation (README, setup guides)

---

## Constitution Check: Post-Design Re-evaluation

**Status**: N/A - No project constitution defined

**Recommendation**: Before implementation (`/speckit.implement`), consider establishing project constitution with:
- **Testing Requirements**: Test-first approach, minimum coverage, contract tests mandatory
- **Error Handling Standards**: Graceful degradation, structured error types, no crashes on individual failures
- **Logging Conventions**: Structured JSON, ISO 8601 timestamps, log levels (ERROR, WARN, INFO, DEBUG)
- **Dependency Policy**: Minimize external deps, prefer Node.js built-ins, justify heavy dependencies
- **Code Style**: ES modules, async/await, modern JavaScript (ES2022+)

Run `/speckit.constitution` to create project-wide principles that all features must follow.

---

## Ready for Next Phase

**Current Status**: Planning Complete ✓

**Next Command**: `/speckit.tasks`

**Prerequisites Met**:
- ✓ Feature specification complete (spec.md)
- ✓ Technical decisions finalized (research.md)
- ✓ Data models designed (data-model.md)
- ✓ Module contracts defined (contracts/)
- ✓ User guide prepared (quickstart.md)
- ✓ Agent context updated (CLAUDE.md)

**Branch**: `001-gmail-imap-monitor`

**Implementation Ready**: All design artifacts available for task generation and implementation.
