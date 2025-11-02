# Implementation Plan: Database Schema Refactor

**Branch**: `002-db-schema-refactor` | **Date**: 2025-11-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-db-schema-refactor/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

This feature refactors the SQLite database schema to better align with Gmail's data model by changing the `id` field from INTEGER to TEXT, adding a `thread_id` field for conversation tracking, and reorganizing columns in a logical order (identifiers, timestamps, addresses, content). The changes preserve all existing data through a migration strategy while maintaining backward compatibility with the existing application code.

## Technical Context

**Language/Version**: JavaScript ES2022+ / Node.js v24 LTS
**Primary Dependencies**: better-sqlite3 ^11.0.0 (synchronous SQLite operations), imap ^0.8.19, mailparser ^3.7.0
**Storage**: SQLite with WAL mode (Write-Ahead Logging)
**Testing**: Node.js native test runner (node --test)
**Target Platform**: macOS (local background service)
**Project Type**: Single project (email monitoring service)
**Performance Goals**: Real-time email processing, maintain query performance during schema migration
**Constraints**: Zero data loss during migration, maintain duplicate detection, preserve existing application functionality
**Scale/Scope**: Personal email monitoring service, handling ongoing email ingestion with existing database records

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Initial Check Status**: ✅ PASS

**Analysis**: The project constitution template is not yet populated with specific principles. This is a database schema refactoring task that:
- Maintains existing project structure (no new libraries/services)
- Updates database schema in isolation
- Preserves backward compatibility
- Requires data migration strategy
- Does not introduce new architectural patterns

**Initial Gate Results**:
- No constitutional violations detected (constitution is in template form)
- Changes are localized to database layer (src/database.js)
- Maintains existing testing approach
- No new dependencies required

---

**Post-Design Re-evaluation**: ✅ PASS

**Design Review**:
After completing Phase 0 (research) and Phase 1 (design), the implementation approach remains consistent with initial analysis:

1. **Scope**: Changes limited to `src/database.js` and `src/email-processor.js`
2. **Dependencies**: No new dependencies added (uses existing better-sqlite3, imap, mailparser)
3. **Testing**: Maintains Node.js native test runner approach
4. **Architecture**: No new patterns introduced; database migration follows standard SQLite practices
5. **Data Model**: Single entity (Email) with enhanced fields, no new relationships
6. **Contracts**: Well-defined APIs with backward compatibility considerations
7. **Complexity**: Migration logic is straightforward (create new table, copy data, rename)

**Final Gate Results**:
- ✅ No new dependencies
- ✅ No architectural changes
- ✅ Maintains existing testing framework
- ✅ Changes are localized and well-documented
- ✅ Migration strategy is safe (transactional, with rollback)
- ✅ No changes to gmail-to-sheet.gs (per requirement)

**Conclusion**: The design fully complies with project standards. Implementation can proceed to Phase 2 (tasks generation).

## Project Structure

### Documentation (this feature)

```text
specs/002-db-schema-refactor/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── database.js          # Core database operations - WILL MODIFY
├── email-processor.js   # Email processing logic - MAY MODIFY (update references)
├── imap-client.js       # IMAP client - MAY MODIFY (pass thread_id)
├── imap-monitor.js      # Main monitor - NO CHANGES EXPECTED
├── state-manager.js     # State management - NO CHANGES EXPECTED
└── tunnel.js            # Webhook tunnel - NO CHANGES EXPECTED

tests/
└── (to be created if tests are added)

data/
└── emails.db            # SQLite database - WILL BE MIGRATED
```

**Structure Decision**: This is a single-project service with a flat source structure. The database schema changes are localized to `src/database.js`, with potential updates to `src/email-processor.js` and `src/imap-client.js` to handle the new `thread_id` field and text-based IDs. The migration will be handled by creating a new table with the updated schema and migrating data from the old table.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

N/A - No constitution violations detected.
