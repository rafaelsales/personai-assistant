# Database Module Contract

**Module**: `src/database.js`
**Purpose**: SQLite database operations for email storage
**Dependencies**: `better-sqlite3`

## Public Interface

### `initDatabase(dbPath: string): Database`

Initialize SQLite database with schema and indexes.

**Parameters**:
- `dbPath` (string): Absolute path to SQLite database file

**Returns**: Database instance (better-sqlite3 `Database` object)

**Behavior**:
- Creates database file if it doesn't exist
- Creates `emails` table with schema from data-model.md
- Creates indexes (`idx_received_at`, `idx_from_address`)
- Enables WAL mode
- Sets synchronous mode to NORMAL

**Errors**:
- Throws `DatabaseError` with code `INIT_FAILED` if database cannot be created
- Throws `DatabaseError` with code `SCHEMA_FAILED` if schema/indexes fail

**Example**:
```javascript
const db = initDatabase('./data/emails.db');
```

---

### `storeEmail(db: Database, email: EmailRecord): boolean`

Store email in database with duplicate prevention.

**Parameters**:
- `db` (Database): Database instance from `initDatabase()`
- `email` (EmailRecord): Email object matching schema:
  ```typescript
  {
    uid: number;
    from_address: string;
    to_address: string;
    cc_address: string | null;
    subject: string;
    body: string;
    original_date: string;  // ISO 8601
    labels: string;         // JSON array string
    received_at: string;    // ISO 8601
  }
  ```

**Returns**: `boolean`
- `true` if email was stored successfully
- `false` if email already exists (duplicate UID)

**Behavior**:
- Validates email object structure
- Checks for duplicate UID (SELECT query)
- If not duplicate, inserts email
- Uses prepared statement for performance
- Logs warning if duplicate detected

**Errors**:
- Throws `ValidationError` if email object is invalid
- Throws `DatabaseError` with code `INSERT_FAILED` if insertion fails (not duplicate)

**Example**:
```javascript
const email = {
  uid: 12345,
  from_address: 'sender@example.com',
  to_address: 'recipient@gmail.com',
  cc_address: null,
  subject: 'Test Email',
  body: 'This is a test',
  original_date: '2025-11-01T10:00:00.000Z',
  labels: '["INBOX"]',
  received_at: '2025-11-01T10:00:02.123Z'
};

const stored = storeEmail(db, email);
if (stored) {
  console.log('Email stored successfully');
} else {
  console.log('Duplicate email, skipped');
}
```

---

### `getEmailByUid(db: Database, uid: number): EmailRecord | null`

Retrieve email by UID.

**Parameters**:
- `db` (Database): Database instance
- `uid` (number): Email UID

**Returns**: `EmailRecord | null`
- Email object if found
- `null` if not found

**Behavior**:
- Uses prepared statement with primary key lookup (O(1))
- Returns single record or null

**Errors**:
- Throws `ValidationError` if UID is not a positive integer
- Throws `DatabaseError` with code `QUERY_FAILED` if query fails

**Example**:
```javascript
const email = getEmailByUid(db, 12345);
if (email) {
  console.log('Found email:', email.subject);
}
```

---

### `getRecentEmails(db: Database, limit: number): EmailRecord[]`

Retrieve most recent emails in chronological order.

**Parameters**:
- `db` (Database): Database instance
- `limit` (number): Maximum number of emails to retrieve (default: 100)

**Returns**: `EmailRecord[]` - Array of email objects, ordered by `received_at` DESC

**Behavior**:
- Uses `idx_received_at` index for efficient scan
- Orders by `received_at` descending (most recent first)
- Limits result set

**Errors**:
- Throws `ValidationError` if limit is not a positive integer
- Throws `DatabaseError` with code `QUERY_FAILED` if query fails

**Example**:
```javascript
const recentEmails = getRecentEmails(db, 50);
recentEmails.forEach(email => {
  console.log(`${email.received_at}: ${email.subject}`);
});
```

---

### `countEmails(db: Database): number`

Count total emails in database.

**Parameters**:
- `db` (Database): Database instance

**Returns**: `number` - Total count of emails

**Behavior**:
- Executes `SELECT COUNT(*) FROM emails`
- Returns integer count

**Errors**:
- Throws `DatabaseError` with code `QUERY_FAILED` if query fails

**Example**:
```javascript
const total = countEmails(db);
console.log(`Total emails: ${total}`);
```

---

### `closeDatabase(db: Database): void`

Gracefully close database connection.

**Parameters**:
- `db` (Database): Database instance

**Returns**: `void`

**Behavior**:
- Closes database connection
- Flushes any pending writes (WAL checkpoint)
- Safe to call multiple times (idempotent)

**Errors**:
- Logs warning if close fails, but does not throw

**Example**:
```javascript
closeDatabase(db);
```

---

## Error Types

### `ValidationError`

Thrown when input validation fails.

**Properties**:
- `name`: `'ValidationError'`
- `message`: Description of validation failure
- `code`: `'INVALID_INPUT'`
- `context`: Object with details (e.g., `{ field: 'uid', value: -1 }`)

### `DatabaseError`

Thrown when database operation fails.

**Properties**:
- `name`: `'DatabaseError'`
- `message`: Description of failure
- `code`: One of:
  - `'INIT_FAILED'` - Database initialization failed
  - `'SCHEMA_FAILED'` - Schema creation failed
  - `'INSERT_FAILED'` - Insert operation failed
  - `'QUERY_FAILED'` - Query operation failed
- `context`: Object with details (e.g., `{ dbPath, sqlError }`)

---

## Performance Characteristics

| Operation | Expected Time | Scalability |
|-----------|---------------|-------------|
| `initDatabase()` | <100ms | N/A (one-time) |
| `storeEmail()` | <10ms | O(1) per email |
| `getEmailByUid()` | <1ms | O(1) lookup |
| `getRecentEmails(100)` | <10ms | O(n) where n=limit |
| `countEmails()` | <5ms | O(1) with table stats |
| `closeDatabase()` | <50ms | N/A |

**Batch Performance** (with transactions):
- Storing 100 emails: <500ms (5ms per email avg)
- Meets FR-013 requirement: 10,000+ emails without degradation

---

## Testing Requirements

### Unit Tests (`tests/unit/database.test.js`)

1. Test `initDatabase()`:
   - Creates database file
   - Creates schema and indexes
   - Enables WAL mode
   - Handles existing database

2. Test `storeEmail()`:
   - Stores valid email
   - Rejects duplicate UID
   - Validates email structure
   - Handles missing optional fields (cc_address)
   - Handles edge cases (empty subject, empty body)

3. Test `getEmailByUid()`:
   - Retrieves existing email
   - Returns null for non-existent UID
   - Validates UID input

4. Test `getRecentEmails()`:
   - Returns emails in DESC order
   - Respects limit parameter
   - Returns empty array if no emails

5. Test `countEmails()`:
   - Returns correct count
   - Returns 0 for empty database

6. Test `closeDatabase()`:
   - Closes cleanly
   - Idempotent (multiple calls safe)

### Contract Tests (`tests/contract/database.contract.test.js`)

1. Verify all function signatures match contract
2. Verify error types and codes match specification
3. Verify performance characteristics (benchmark)
4. Verify data model compliance (schema matches data-model.md)

---

## Dependencies

```javascript
import Database from 'better-sqlite3';
```

**Version**: Latest stable (v11.x+ as of Nov 2025)

**Native Dependencies**: Requires node-gyp for compilation (handled by npm install)

---

## Example Usage

```javascript
import { initDatabase, storeEmail, getRecentEmails, closeDatabase } from './database.js';

// Initialize
const db = initDatabase('./data/emails.db');

// Store email
const email = {
  uid: 12345,
  from_address: 'sender@example.com',
  to_address: 'recipient@gmail.com',
  cc_address: null,
  subject: 'Test',
  body: 'Body',
  original_date: new Date().toISOString(),
  labels: '["INBOX"]',
  received_at: new Date().toISOString()
};

storeEmail(db, email);

// Query recent emails
const recent = getRecentEmails(db, 10);
console.log(`Found ${recent.length} recent emails`);

// Clean shutdown
process.on('SIGINT', () => {
  closeDatabase(db);
  process.exit(0);
});
```

---

## Notes

- **Thread Safety**: better-sqlite3 is NOT thread-safe. Only use from main thread.
- **Transactions**: For batch operations (sync after reconnect), wrap in transaction for performance.
- **WAL Mode**: Allows concurrent reads, but writes are still serialized.
- **Prepared Statements**: Automatically cached by better-sqlite3 for repeated queries.
