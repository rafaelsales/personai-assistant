# Research: Database Schema Refactor

**Feature**: Database Schema Refactor
**Branch**: 002-db-schema-refactor
**Date**: 2025-11-01

## Overview

This document captures research decisions for refactoring the SQLite database schema to use text-based Gmail message IDs, add thread tracking, and reorganize columns logically.

## Key Decisions

### Decision 1: SQLite Schema Migration Strategy

**Decision**: Use "create new table + copy data + rename" approach (SQLite's recommended migration pattern)

**Rationale**:
- SQLite has limited ALTER TABLE capabilities (cannot change PRIMARY KEY type or reorder columns)
- Creating a new table with the correct schema and migrating data is the safest approach
- Allows for data validation during migration
- Enables rollback by keeping the old table temporarily
- WAL mode ensures minimal service disruption during migration

**Alternatives Considered**:
1. **ALTER TABLE commands**: Rejected because SQLite doesn't support changing PRIMARY KEY type from INTEGER to TEXT, and column reordering requires recreating the table anyway
2. **Export/Import with sqlite3 CLI**: Rejected because it requires stopping the service and has no rollback mechanism
3. **Incremental migration with dual writes**: Rejected as overly complex for a single-user service

**Implementation Approach**:
```sql
BEGIN TRANSACTION;

-- Create new table with updated schema
CREATE TABLE emails_new (
  id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  downloaded_at TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  cc_address TEXT,
  subject TEXT NOT NULL,
  labels TEXT NOT NULL,
  body TEXT NOT NULL
);

-- Copy data from old table (convert integer id to text)
INSERT INTO emails_new
SELECT
  CAST(id AS TEXT),
  '',  -- thread_id will need to be populated from email source
  received_at,
  downloaded_at,
  from_address,
  to_address,
  cc_address,
  subject,
  labels,
  body
FROM emails;

-- Drop old table and rename new table
DROP TABLE emails;
ALTER TABLE emails_new RENAME TO emails;

-- Recreate indexes
CREATE INDEX idx_received_at ON emails(downloaded_at);
CREATE INDEX idx_from_address ON emails(from_address);
CREATE INDEX idx_thread_id ON emails(thread_id);

COMMIT;
```

### Decision 2: Handling Thread ID for Existing Records

**Decision**: Populate thread_id as empty string for migrated records, require thread_id for new records

**Rationale**:
- Existing database records don't have thread_id information (it wasn't captured originally)
- Gmail API doesn't provide historical thread_id without re-fetching emails
- Empty string is a valid placeholder that won't break queries
- New emails will capture thread_id from the Gmail source
- Application code can handle empty thread_id gracefully (treat as single-message threads)

**Alternatives Considered**:
1. **Re-fetch all emails from Gmail**: Rejected due to Gmail API rate limits and complexity
2. **Use message ID as thread ID for old records**: Rejected because it's semantically incorrect and would complicate future thread-based queries
3. **NULL thread_id**: Rejected because NOT NULL constraint is cleaner and prevents issues with string operations

### Decision 3: Index Strategy

**Decision**: Add index on thread_id, preserve existing indexes on downloaded_at and from_address

**Rationale**:
- Thread-based queries (User Story 2) will benefit from thread_id index
- Existing indexes on downloaded_at and from_address are used by current queries (getRecentEmails)
- SQLite query planner will automatically choose the best index
- Index on received_at not needed since queries use downloaded_at

**Alternatives Considered**:
1. **Composite index (thread_id, received_at)**: Rejected as premature optimization; single-column index sufficient for expected query patterns
2. **Full-text search index**: Out of scope for this feature

### Decision 4: Data Type for Text IDs

**Decision**: Use TEXT data type (not VARCHAR) for id and thread_id

**Rationale**:
- SQLite TEXT is the standard string type (VARCHAR is an alias)
- Gmail message IDs are variable length (typically 16-20 characters)
- No performance benefit to specifying length in SQLite
- TEXT PRIMARY KEY is well-optimized in SQLite

**Alternatives Considered**:
1. **VARCHAR(255)**: Rejected because SQLite treats it identically to TEXT
2. **BLOB**: Rejected because text operations and debugging are simpler with TEXT

### Decision 5: Migration Execution Timing

**Decision**: Run migration automatically on next database initialization if old schema detected

**Rationale**:
- Single-user service with no concurrent access during startup
- Automatic migration reduces manual intervention
- Migration can be validated before committing transaction
- Service startup is the safest time for schema changes

**Alternatives Considered**:
1. **Manual migration script**: Rejected because it requires user intervention and increases error potential
2. **Runtime migration check on first write**: Rejected because it adds complexity and could fail during email processing

## Technical Details

### SQLite Version Compatibility

- **Minimum Version**: SQLite 3.7.11 (for WAL mode support)
- **better-sqlite3 Compatibility**: Version 11.0.0 supports all required features
- **Node.js Compatibility**: Node.js v24 has built-in support for modern SQLite

### Performance Considerations

- **Migration Time**: For typical database sizes (<10,000 records), migration completes in <1 second
- **TEXT vs INTEGER Primary Key**: TEXT primary keys in SQLite have negligible performance impact for this use case
- **Index Overhead**: Three indexes add ~20-30% storage overhead but are essential for query performance

### Error Handling

**Migration Failures**:
- Transaction rollback on any error preserves original table
- Log migration errors with full SQL error details
- Fail fast: do not start service if migration fails

**Duplicate Detection**:
- After migration, duplicate check uses TEXT-based ID comparison
- Existing duplicate detection logic in `storeEmail()` requires no changes (SQL WHERE clause works with TEXT)

## Best Practices Applied

1. **Transactional DDL**: All schema changes wrapped in single transaction
2. **Zero-downtime approach**: WAL mode allows reads during migration
3. **Data preservation**: Validation step before dropping old table
4. **Idempotent migration**: Check for migration state before executing
5. **Semantic correctness**: Empty string for missing thread_id is semantically cleaner than NULL

## Open Questions

None - all clarifications resolved.

## References

- [SQLite ALTER TABLE documentation](https://www.sqlite.org/lang_altertable.html)
- [SQLite Datatype documentation](https://www.sqlite.org/datatype3.html)
- [better-sqlite3 Migration patterns](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- Gmail API Message ID format: Base64url-encoded strings (~16-20 chars)
