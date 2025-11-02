# Contracts Directory

**Feature**: Database Schema Refactor
**Branch**: 002-db-schema-refactor

## Overview

This directory contains API contracts for modules affected by the database schema refactor. These contracts define the expected behavior, API changes, and integration requirements for each modified component.

## Contracts

### [database-contract.md](./database-contract.md)

**Module**: `src/database.js`

Defines the complete database API including:
- Schema changes (INTEGER → TEXT for id, new thread_id field)
- Migration strategy and SQL
- All exported functions with parameters and return types
- New function: `getEmailsByThread()`
- Backward compatibility considerations
- Performance expectations

**Key Changes**:
- `id` field changed from INTEGER to TEXT
- Added `thread_id` field (TEXT)
- Column order reorganized
- Automatic migration on database initialization
- New index on thread_id

### [email-processor-contract.md](./email-processor-contract.md)

**Module**: `src/email-processor.js`

Defines required updates to email processing to support new schema:
- Extract `thread_id` from IMAP Gmail extension (`x-gm-thrid`)
- Update email record structure to include thread_id
- Ensure ID is text type
- Field order alignment with database schema

**Key Changes**:
- `fetchEmail()` extracts thread_id from IMAP attributes
- Email record gains `thread_id` field
- ID explicitly converted to string

## Contract Relationships

```text
email-processor.fetchEmail()
    ↓ (produces email record with thread_id)
database.storeEmail()
    ↓ (stores in new schema)
database.getEmailsByThread()
    ↓ (retrieves thread messages)
[application code]
```

## Usage Guidelines

### For Implementers

1. **Read database-contract.md first**: Understand the schema changes and migration
2. **Read email-processor-contract.md**: Understand how to populate thread_id
3. **Check implementation checklist**: Each contract has a checklist section
4. **Run tests**: Both contracts define testing requirements

### For Reviewers

1. Verify implementation matches contract specifications
2. Check backward compatibility considerations
3. Validate error handling matches contract definitions
4. Confirm performance expectations are met

## Testing Strategy

### Contract Tests

Each contract should have corresponding contract tests that verify:
- Function signatures match specifications
- Input/output types are correct
- Error conditions are handled as specified
- Performance meets expectations

### Integration Tests

Test the complete flow:
1. Initialize database (triggers migration if needed)
2. Fetch email from IMAP (extracts thread_id)
3. Store email in database (uses new schema)
4. Query by thread_id (retrieves related messages)
5. Verify data integrity

## Migration Checklist

- [ ] Database schema updated per database-contract.md
- [ ] Migration SQL implemented and tested
- [ ] Migration validation logic implemented
- [ ] Email processor updated per email-processor-contract.md
- [ ] Thread ID extraction from IMAP implemented
- [ ] New `getEmailsByThread()` function implemented
- [ ] All existing tests updated for new schema
- [ ] Integration tests added for thread queries
- [ ] Performance validated (migration < 1s for 10k records)
- [ ] Backward compatibility verified

## Breaking Changes Summary

### API Changes

1. **Database Module**:
   - `id` parameter type: number → string
   - `storeEmail()` email object: gains `thread_id` field
   - New function: `getEmailsByThread(threadId)`

2. **Email Processor Module**:
   - `fetchEmail()` return value: gains `thread_id` field
   - Email record field order changed (documentation only)

### Data Changes

1. **Database Schema**:
   - `emails.id`: INTEGER PRIMARY KEY → TEXT PRIMARY KEY
   - `emails.thread_id`: New field (TEXT NOT NULL)
   - Column order: Reorganized (ids, timestamps, addresses, content)
   - Indexes: Added idx_thread_id

### Migration Impact

- Existing databases: Auto-migrated on next startup
- Existing code: Must handle text IDs and thread_id field
- gmail-to-sheet.gs: **NOT MODIFIED** (out of scope)

## Performance Expectations

### Database Operations

- **storeEmail()**: <5ms per email
- **getEmailById()**: <1ms (primary key lookup)
- **getEmailsByThread()**: <10ms for typical threads
- **Migration**: <1 second for 10,000 emails

### IMAP Operations

- **fetchEmail()**: No performance change (thread_id extraction is trivial)

## Error Scenarios

### Migration Errors

- **Cause**: Database locked, insufficient disk space, corruption
- **Handling**: Rollback transaction, preserve original table, fail startup
- **Recovery**: Manual intervention required

### Missing Thread ID

- **Cause**: IMAP server doesn't provide x-gm-thrid
- **Handling**: Use empty string as fallback
- **Impact**: Thread queries won't find these emails

### Type Mismatches

- **Cause**: Code passes integer ID to text-expecting function
- **Handling**: Explicit type conversion (String())
- **Prevention**: TypeScript or JSDoc annotations recommended

## Dependencies

### External Libraries

- **better-sqlite3**: Version 11.0.0+ (SQLite operations)
- **imap**: Version 0.8.19+ (Gmail IMAP with extensions)
- **mailparser**: Version 3.7.0+ (Email parsing)

### Internal Modules

- `src/database.js`: Exports database functions
- `src/email-processor.js`: Exports email processing functions
- `src/imap-client.js`: Provides IMAP connection and fetch
- `src/logger.js`: Logging infrastructure

## References

- [Gmail IMAP Extensions](https://developers.google.com/gmail/imap/imap-extensions)
- [SQLite ALTER TABLE](https://www.sqlite.org/lang_altertable.html)
- [SQLite Datatypes](https://www.sqlite.org/datatype3.html)
- [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
