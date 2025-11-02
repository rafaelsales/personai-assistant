# Database API Contract

**Feature**: Database Schema Refactor
**Module**: `src/database.js`
**Date**: 2025-11-01

## Overview

This contract defines the JavaScript API for database operations after the schema refactor. All functions maintain backward compatibility while supporting the new schema with text-based IDs and thread tracking.

## Module Exports

### `initDatabase(dbPath)`

Initializes SQLite database with schema and indexes. Automatically migrates from old schema if detected.

**Parameters**:
- `dbPath` (string, required): Absolute path to SQLite database file

**Returns**:
- `Database`: better-sqlite3 Database instance

**Throws**:
- `Error`: If database initialization or migration fails

**Behavior**:
1. Creates parent directory if it doesn't exist
2. Opens database connection
3. Enables WAL mode for better concurrency
4. Detects schema version (checks for `thread_id` column)
5. Runs migration if old schema detected
6. Creates new table with updated schema if empty
7. Creates indexes

**Example**:
```javascript
import { initDatabase } from './database.js';

const db = initDatabase('/Users/me/data/emails.db');
```

**Migration Logic**:
```javascript
// Pseudo-code for migration detection
if (tableExists('emails') && !columnExists('emails', 'thread_id')) {
  runMigration(); // Convert old schema to new schema
}
```

---

### `storeEmail(db, email)`

Stores email in database with duplicate prevention.

**Parameters**:
- `db` (Database, required): Database instance from `initDatabase()`
- `email` (Object, required): Email record object with the following structure:
  ```javascript
  {
    id: string,              // Gmail message ID (text)
    thread_id: string,       // Gmail thread ID (text, may be empty string)
    received_at: string,     // ISO 8601 datetime
    downloaded_at: string,   // ISO 8601 datetime
    from_address: string,    // Sender email
    to_address: string,      // Recipients (comma-separated)
    cc_address: string|null, // CC recipients (comma-separated) or null
    subject: string,         // Email subject
    labels: string,          // Gmail labels (comma-separated)
    body: string             // Email body content
  }
  ```

**Returns**:
- `boolean`: `true` if email stored successfully, `false` if duplicate (ID already exists)

**Throws**:
- `Error`: If insertion fails due to constraint violation or database error

**Behavior**:
1. Check for duplicate ID using `SELECT 1 FROM emails WHERE id = ?`
2. Return `false` if ID exists (skip duplicate)
3. Insert email with all fields
4. Return `true` on success

**Example**:
```javascript
const email = {
  id: 'abc123def456',
  thread_id: 'thread789',
  received_at: '2025-11-01 10:30:00',
  downloaded_at: '2025-11-01 10:31:00',
  from_address: 'sender@example.com',
  to_address: 'recipient@example.com',
  cc_address: null,
  subject: 'Test Email',
  labels: 'INBOX, UNREAD',
  body: 'Email content here'
};

const stored = storeEmail(db, email);
// stored === true (success) or false (duplicate)
```

---

### `getEmailById(db, id)`

Retrieves email by its ID.

**Parameters**:
- `db` (Database, required): Database instance
- `id` (string, required): Email ID (text format)

**Returns**:
- `Object|null`: Email object with all fields, or `null` if not found

**Throws**:
- `Error`: If query execution fails

**Behavior**:
1. Execute `SELECT * FROM emails WHERE id = ?`
2. Return email object or `null` if not found

**Example**:
```javascript
const email = getEmailById(db, 'abc123def456');
if (email) {
  console.log(email.subject); // Access email fields
}
```

---

### `countEmails(db)`

Counts total emails in database.

**Parameters**:
- `db` (Database, required): Database instance

**Returns**:
- `number`: Total email count

**Throws**:
- `Error`: If query execution fails

**Behavior**:
1. Execute `SELECT COUNT(*) as count FROM emails`
2. Return count value

**Example**:
```javascript
const total = countEmails(db);
console.log(`Total emails: ${total}`);
```

---

### `getRecentEmails(db, limit = 100)`

Gets recent emails in chronological order (newest first).

**Parameters**:
- `db` (Database, required): Database instance
- `limit` (number, optional): Maximum number of emails to retrieve (default: 100)

**Returns**:
- `Array<Object>`: Array of email objects with fields: `id`, `from_address`, `subject`, `downloaded_at`

**Throws**:
- `Error`: If query execution fails

**Behavior**:
1. Execute `SELECT id, from_address, subject, downloaded_at FROM emails ORDER BY downloaded_at DESC LIMIT ?`
2. Return array of email objects

**Example**:
```javascript
const recent = getRecentEmails(db, 50);
recent.forEach(email => {
  console.log(`${email.downloaded_at}: ${email.subject}`);
});
```

---

### `getEmailsByThread(db, threadId)`

**NEW FUNCTION**: Retrieves all emails in a thread.

**Parameters**:
- `db` (Database, required): Database instance
- `threadId` (string, required): Gmail thread ID

**Returns**:
- `Array<Object>`: Array of email objects in chronological order (oldest first)

**Throws**:
- `Error`: If query execution fails

**Behavior**:
1. Execute `SELECT * FROM emails WHERE thread_id = ? ORDER BY received_at`
2. Return array of email objects
3. Returns empty array if thread_id is empty string or no matches

**Example**:
```javascript
const threadEmails = getEmailsByThread(db, 'thread789');
console.log(`Thread has ${threadEmails.length} messages`);
threadEmails.forEach(email => {
  console.log(`${email.received_at}: ${email.subject}`);
});
```

---

### `closeDatabase(db)`

Gracefully closes database connection.

**Parameters**:
- `db` (Database, required): Database instance

**Returns**:
- `void`

**Throws**:
- Logs warning if close fails (does not throw)

**Behavior**:
1. Call `db.close()`
2. Log warning on error

**Example**:
```javascript
closeDatabase(db);
```

---

## Migration Contract

### Schema Version Detection

The `initDatabase()` function detects schema version by checking for the presence of the `thread_id` column:

```sql
-- Check if migration needed
SELECT sql FROM sqlite_master WHERE type='table' AND name='emails';
-- Parse SQL to check for 'thread_id' column
```

### Migration SQL

**Full Migration Transaction**:
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

-- Copy data from old table
INSERT INTO emails_new
SELECT
  CAST(id AS TEXT) as id,
  '' as thread_id,
  received_at,
  downloaded_at,
  from_address,
  to_address,
  cc_address,
  subject,
  labels,
  body
FROM emails;

-- Verify migration (count should match)
-- If mismatch, ROLLBACK

-- Drop old table and rename
DROP TABLE emails;
ALTER TABLE emails_new RENAME TO emails;

-- Recreate indexes
CREATE INDEX idx_downloaded_at ON emails(downloaded_at);
CREATE INDEX idx_from_address ON emails(from_address);
CREATE INDEX idx_thread_id ON emails(thread_id);

COMMIT;
```

### Migration Validation

Before committing migration:
1. Compare row counts: `SELECT COUNT(*) FROM emails` vs `SELECT COUNT(*) FROM emails_new`
2. Verify no data truncation: Sample and compare records
3. Log migration start and completion

### Rollback Strategy

If migration fails:
1. Transaction automatically rolls back
2. Original `emails` table remains intact
3. Service fails to start with error message
4. User must investigate and retry

## Error Handling

### Common Error Scenarios

1. **Duplicate ID**:
   - Function: `storeEmail()`
   - Behavior: Returns `false` (not an error)
   - No exception thrown

2. **Database Lock**:
   - All functions may encounter SQLITE_BUSY
   - WAL mode reduces likelihood
   - Retry logic not implemented (immediate fail)

3. **Constraint Violation**:
   - Function: `storeEmail()`
   - Throws: `Error` with message describing violation
   - Example: NOT NULL constraint failed

4. **Migration Failure**:
   - Function: `initDatabase()`
   - Throws: `Error` with migration details
   - Database remains in original state (rollback)

5. **Invalid Path**:
   - Function: `initDatabase()`
   - Throws: `Error` if parent directory creation fails

## Backward Compatibility

### API Changes

- **No breaking changes**: All existing function signatures remain the same
- **Type change**: `id` parameter in `getEmailById()` now accepts string (was implicitly number)
- **New function**: `getEmailsByThread()` is additive
- **Email object**: Gains `thread_id` field (callers must handle it)

### Migration Impact

- **Existing databases**: Automatically migrated on first `initDatabase()` call
- **Existing code**: Must be updated to:
  1. Pass text-based IDs (not integers)
  2. Provide `thread_id` in email objects
  3. Handle `thread_id` field in returned emails

## Testing Contract

### Unit Test Coverage

1. **initDatabase()**:
   - Creates new database with correct schema
   - Migrates old schema to new schema
   - Handles missing parent directory
   - Enables WAL mode

2. **storeEmail()**:
   - Stores valid email successfully
   - Detects and skips duplicates
   - Handles NULL cc_address
   - Validates NOT NULL constraints

3. **getEmailById()**:
   - Retrieves email by text ID
   - Returns null for non-existent ID
   - Returns all fields correctly

4. **getEmailsByThread()**:
   - Retrieves all thread messages
   - Orders by received_at
   - Handles empty thread_id
   - Returns empty array for non-existent thread

5. **Migration**:
   - Converts INTEGER id to TEXT
   - Adds empty thread_id
   - Preserves all data
   - Validates row count match

## Performance Contract

### Expected Performance

- **storeEmail()**: <5ms per email (duplicate check + insert)
- **getEmailById()**: <1ms (PRIMARY KEY lookup)
- **getEmailsByThread()**: <10ms for typical thread size (<50 messages)
- **getRecentEmails()**: <20ms for 100 emails
- **Migration**: <1 second for 10,000 emails

### Index Usage

- Duplicate check uses PRIMARY KEY (id)
- Recent emails uses idx_downloaded_at
- Thread queries use idx_thread_id
- Sender queries use idx_from_address

## Change Summary

### Schema Changes

| Aspect | Old | New |
|--------|-----|-----|
| id type | INTEGER | TEXT |
| thread_id | Does not exist | TEXT (empty for migrated) |
| Column order | id, from, to, cc, subject, body, received, labels, downloaded | id, thread_id, received, downloaded, from, to, cc, subject, labels, body |
| Indexes | 2 (downloaded_at, from_address) | 3 (+ thread_id) |

### API Changes

| Function | Change Type | Details |
|----------|-------------|---------|
| initDatabase() | Modified | Adds migration logic |
| storeEmail() | Modified | Accepts thread_id in email object |
| getEmailById() | Modified | Accepts TEXT id parameter |
| getEmailsByThread() | New | Retrieves thread messages |
| Other functions | Unchanged | Same behavior |
