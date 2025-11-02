# Quickstart: Database Schema Refactor

**Feature**: Database Schema Refactor
**Branch**: 002-db-schema-refactor
**Date**: 2025-11-01

## Overview

This quickstart guide provides step-by-step instructions for implementing and testing the database schema refactor. Follow these steps to migrate from the old schema (INTEGER id, no thread tracking) to the new schema (TEXT id, thread_id support).

## Prerequisites

- Node.js v24+ installed
- Existing gmail-imap-monitor project
- SQLite database with existing emails (optional, for migration testing)
- Access to Gmail IMAP for integration testing

## Implementation Steps

### Step 1: Update Database Schema (User Story 1)

**Goal**: Change `id` from INTEGER to TEXT and implement migration

**Files to modify**:
- `src/database.js`

**Tasks**:

1. **Add migration detection function**:
   ```javascript
   function needsMigration(db) {
     const tableInfo = db.prepare("PRAGMA table_info(emails)").all();
     const idColumn = tableInfo.find(col => col.name === 'id');
     const hasThreadId = tableInfo.some(col => col.name === 'thread_id');

     return idColumn && idColumn.type === 'INTEGER' && !hasThreadId;
   }
   ```

2. **Add migration function**:
   ```javascript
   function migrateSchema(db) {
     logger.info('Starting schema migration...');

     db.exec(`
       BEGIN TRANSACTION;

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

       DROP TABLE emails;
       ALTER TABLE emails_new RENAME TO emails;

       CREATE INDEX idx_downloaded_at ON emails(downloaded_at);
       CREATE INDEX idx_from_address ON emails(from_address);
       CREATE INDEX idx_thread_id ON emails(thread_id);

       COMMIT;
     `);

     logger.info('Schema migration completed successfully');
   }
   ```

3. **Update initDatabase() to run migration**:
   ```javascript
   export function initDatabase(dbPath) {
     // ... existing code ...
     const db = new Database(dbPath);

     // Check if migration is needed
     const tableExists = db.prepare(
       "SELECT name FROM sqlite_master WHERE type='table' AND name='emails'"
     ).get();

     if (tableExists && needsMigration(db)) {
       migrateSchema(db);
     } else if (!tableExists) {
       // Create new table with updated schema
       db.exec(`CREATE TABLE emails (...)`); // Use new schema
     }

     return db;
   }
   ```

4. **Update CREATE TABLE for new databases**:
   ```javascript
   db.exec(`
     CREATE TABLE IF NOT EXISTS emails (
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
     )
   `);
   ```

**Test**:
```bash
# Run with existing database to test migration
npm run imap-monitor

# Check logs for "Schema migration completed successfully"
# Verify database schema: sqlite3 data/emails.db ".schema emails"
```

### Step 2: Add Thread ID Support (User Story 2)

**Goal**: Extract and store thread_id from Gmail IMAP

**Files to modify**:
- `src/email-processor.js`

**Tasks**:

1. **Update fetchEmail() to extract thread_id**:
   ```javascript
   export async function fetchEmail(imapClient, id) {
     try {
       const emailData = await imapClient.fetchEmail(id);

       // ... existing parsing code ...

       // NEW: Extract Gmail thread ID
       const threadId = emailData.attrs?.['x-gm-thrid']
         ? String(emailData.attrs['x-gm-thrid'])
         : '';

       // Updated email record with thread_id
       const emailRecord = {
         id: String(emailData.id),
         thread_id: threadId,
         received_at: formatDate(parsed.date),
         downloaded_at: formatDate(new Date()),
         from_address: parsed.from?.text || headers.from || '',
         to_address: parsed.to?.text || headers.to || '',
         cc_address: parsed.cc?.text || headers.cc || null,
         subject: parsed.subject || headers.subject || '',
         labels: labelsJson,
         body: parsed.text || parsed.html || ''
       };

       return emailRecord;
     } catch (error) {
       logger.error('Email fetch failed', { id, error: error.message });
       throw error;
     }
   }
   ```

2. **Add getEmailsByThread() function to database.js**:
   ```javascript
   export function getEmailsByThread(db, threadId) {
     try {
       const stmt = db.prepare(`
         SELECT * FROM emails
         WHERE thread_id = ? AND thread_id != ''
         ORDER BY received_at
       `);
       return stmt.all(threadId);
     } catch (error) {
       throw new Error(`Thread query failed: ${error.message}`);
     }
   }
   ```

**Test**:
```bash
# Run monitor and wait for new emails
npm run imap-monitor

# Check logs for thread_id being captured
# Query database to verify: sqlite3 data/emails.db "SELECT id, thread_id FROM emails LIMIT 10;"
```

### Step 3: Verify Column Order (User Story 3)

**Goal**: Ensure database schema has correct column order

**Verification**:
```bash
# Check schema in SQLite
sqlite3 data/emails.db ".schema emails"

# Expected output:
# CREATE TABLE emails (
#   id TEXT PRIMARY KEY NOT NULL,
#   thread_id TEXT NOT NULL,
#   received_at TEXT NOT NULL,
#   downloaded_at TEXT NOT NULL,
#   from_address TEXT NOT NULL,
#   to_address TEXT NOT NULL,
#   cc_address TEXT,
#   subject TEXT NOT NULL,
#   labels TEXT NOT NULL,
#   body TEXT NOT NULL
# );
```

**Note**: Column order is verified during migration and table creation. No additional code changes needed.

## Testing Guide

### Manual Testing

#### Test 1: Fresh Database (No Migration)

1. Delete existing database: `rm data/emails.db`
2. Start monitor: `npm run imap-monitor`
3. Verify new schema created:
   ```bash
   sqlite3 data/emails.db "PRAGMA table_info(emails);"
   ```
4. Expected: id is TEXT, thread_id exists

#### Test 2: Migration from Old Schema

1. Restore database backup with old schema (INTEGER id, no thread_id)
2. Start monitor: `npm run imap-monitor`
3. Check logs for migration message
4. Verify schema migrated:
   ```bash
   sqlite3 data/emails.db "SELECT typeof(id), thread_id FROM emails LIMIT 1;"
   ```
5. Expected: typeof(id) = 'text', thread_id = '' (empty for migrated records)

#### Test 3: Thread ID Extraction

1. Send yourself a test email
2. Reply to create a thread
3. Wait for monitor to download both emails
4. Query thread:
   ```bash
   sqlite3 data/emails.db "SELECT id, subject, thread_id FROM emails WHERE thread_id != '' LIMIT 5;"
   ```
5. Expected: Both emails in thread have same thread_id

#### Test 4: Duplicate Detection

1. Stop monitor
2. Manually insert duplicate email (same id):
   ```bash
   sqlite3 data/emails.db "INSERT INTO emails VALUES ('test123', 'thread456', '2025-11-01 10:00:00', '2025-11-01 10:01:00', 'from@test.com', 'to@test.com', NULL, 'Test', 'INBOX', 'Body');"
   ```
3. Try to insert duplicate via code:
   ```javascript
   const email = { id: 'test123', /* ... */ };
   const stored = storeEmail(db, email);
   console.log(stored); // Should be false (duplicate)
   ```
4. Expected: duplicate detected, returns false

### Integration Testing

#### Test Flow: New Email with Thread

1. **Setup**: Clear database or use test database
2. **Action**: Send email to Gmail account
3. **Verify**: Monitor downloads email
4. **Action**: Reply to email (creates thread)
5. **Verify**: Monitor downloads reply
6. **Query**: `SELECT * FROM emails WHERE thread_id = '<thread_id>';`
7. **Expected**: Both emails returned, same thread_id

#### Test Flow: Migration Preserves Data

1. **Setup**: Database with 100 emails (old schema)
2. **Action**: Start monitor (triggers migration)
3. **Verify**: Migration logs success
4. **Query**: `SELECT COUNT(*) FROM emails;`
5. **Expected**: Count unchanged (100 emails)
6. **Query**: `SELECT id, thread_id FROM emails LIMIT 5;`
7. **Expected**: All ids are text, all thread_ids are empty string

### Automated Testing (If Implementing Tests)

```javascript
// tests/database.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { initDatabase, storeEmail, getEmailsByThread } from '../src/database.js';

test('migration converts INTEGER id to TEXT', (t) => {
  // Create old schema database
  // Run initDatabase()
  // Verify id column is TEXT
});

test('storeEmail accepts text id', (t) => {
  const db = initDatabase(':memory:');
  const email = {
    id: 'text-id-123',
    thread_id: 'thread-456',
    // ... other fields
  };
  const stored = storeEmail(db, email);
  assert.strictEqual(stored, true);
});

test('getEmailsByThread returns thread messages', (t) => {
  const db = initDatabase(':memory:');
  // Store multiple emails with same thread_id
  // Query by thread_id
  // Verify all returned
});
```

Run tests:
```bash
npm test
```

## Validation Checklist

After implementing all changes:

- [ ] New database creates schema with TEXT id and thread_id
- [ ] Existing database migrates automatically on startup
- [ ] Migration preserves all existing email data
- [ ] Migration logs show success message
- [ ] New emails capture thread_id from IMAP
- [ ] Empty thread_id used when IMAP doesn't provide it
- [ ] Duplicate detection works with text IDs
- [ ] `getEmailsByThread()` retrieves thread messages correctly
- [ ] Column order matches spec: id, thread_id, received_at, downloaded_at, from_address, to_address, cc_address, subject, labels, body
- [ ] Indexes created: idx_downloaded_at, idx_from_address, idx_thread_id
- [ ] Existing functionality unchanged (getRecentEmails, countEmails, etc.)
- [ ] No changes to gmail-to-sheet.gs (verified)

## Rollback Plan

If issues occur after deployment:

1. **Stop the service**:
   ```bash
   # Kill the monitor process
   pkill -f imap-monitor
   ```

2. **Restore database backup**:
   ```bash
   cp data/emails.db.backup data/emails.db
   ```

3. **Revert code changes**:
   ```bash
   git checkout HEAD~1 -- src/database.js src/email-processor.js
   ```

4. **Restart service**:
   ```bash
   npm run imap-monitor
   ```

**Prevention**: Always backup database before schema changes:
```bash
cp data/emails.db data/emails.db.backup-$(date +%Y%m%d-%H%M%S)
```

## Troubleshooting

### Migration Fails

**Symptom**: Error during migration, service won't start

**Diagnosis**:
```bash
sqlite3 data/emails.db "SELECT name FROM sqlite_master WHERE type='table';"
# Check if emails_new exists (migration interrupted)
```

**Fix**:
1. Restore from backup
2. Check disk space: `df -h`
3. Check database integrity: `sqlite3 data/emails.db "PRAGMA integrity_check;"`
4. Retry migration

### Thread ID Not Captured

**Symptom**: thread_id is always empty for new emails

**Diagnosis**:
```javascript
// Add logging in fetchEmail()
console.log('IMAP attrs:', emailData.attrs);
// Check if x-gm-thrid exists
```

**Fix**:
- Verify Gmail IMAP extensions are enabled
- Check IMAP fetch includes attributes: `fetchEmail()` should request `['BODY[]', 'FLAGS', 'UID']` and attrs

### Duplicate Detection Not Working

**Symptom**: Duplicate emails being inserted

**Diagnosis**:
```bash
sqlite3 data/emails.db "SELECT id, COUNT(*) FROM emails GROUP BY id HAVING COUNT(*) > 1;"
# Shows duplicate IDs
```

**Fix**:
- Verify `storeEmail()` checks for duplicates before inserting
- Check PRIMARY KEY constraint exists: `PRAGMA table_info(emails);`
- Ensure id comparison is exact match (text comparison)

## Performance Monitoring

### Migration Performance

```javascript
// Add to migrateSchema()
const start = Date.now();
// ... migration code ...
const duration = Date.now() - start;
logger.info(`Migration completed in ${duration}ms`);
```

**Expected**: <1 second for 10,000 records

### Query Performance

```javascript
// Test thread query performance
const start = Date.now();
const emails = getEmailsByThread(db, threadId);
const duration = Date.now() - start;
console.log(`Thread query: ${duration}ms for ${emails.length} emails`);
```

**Expected**: <10ms for typical threads (<50 messages)

## Next Steps

After successful implementation:

1. **Monitor production**: Watch logs for migration success
2. **Verify data integrity**: Spot-check migrated records
3. **Test thread queries**: Verify thread grouping works
4. **Document**: Update README with new schema details
5. **Backup**: Create post-migration database backup

## References

- [Spec](./spec.md): Feature requirements
- [Research](./research.md): Technical decisions
- [Data Model](./data-model.md): Schema definition
- [Contracts](./contracts/): API contracts for modified modules
