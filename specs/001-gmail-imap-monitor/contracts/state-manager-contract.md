# State Manager Module Contract

**Module**: `src/state-manager.js`
**Purpose**: Manage connection state persistence to JSON file
**Dependencies**: Node.js `fs` module

## Public Interface

### `initState(stateFilePath: string): ConnectionState`

Initialize or load connection state from file.

**Parameters**:
- `stateFilePath` (string): Absolute path to state JSON file

**Returns**: `ConnectionState` object:
```typescript
{
  last_id: number;
  last_id_received_at: string;      // ISO 8601
  last_connected_at: string;         // ISO 8601
  last_error: string | null;
  connection_status: 'connected' | 'reconnecting' | 'disconnected';
}
```

**Behavior**:
- If file exists: Load and validate JSON
- If file doesn't exist: Create with initial state:
  ```json
  {
    "last_id": 0,
    "last_id_received_at": "1970-01-01T00:00:00.000Z",
    "last_connected_at": "1970-01-01T00:00:00.000Z",
    "last_error": null,
    "connection_status": "disconnected"
  }
  ```
- Creates parent directory if needed
- Validates state structure and field types

**Errors**:
- Throws `StateError` with code `INIT_FAILED` if file cannot be created
- Throws `StateError` with code `INVALID_STATE` if JSON is corrupted (attempts recovery with initial state)
- Throws `StateError` with code `VALIDATION_FAILED` if state structure is invalid

**Example**:
```javascript
const state = initState('./data/current_state.json');
console.log('Current id:', state.last_id);
```

---

### `readState(stateFilePath: string): ConnectionState`

Read current state from file.

**Parameters**:
- `stateFilePath` (string): Absolute path to state JSON file

**Returns**: `ConnectionState` object

**Behavior**:
- Reads file synchronously
- Parses JSON
- Validates structure
- Returns state object

**Errors**:
- Throws `StateError` with code `READ_FAILED` if file cannot be read
- Throws `StateError` with code `INVALID_STATE` if JSON is malformed
- Throws `StateError` with code `VALIDATION_FAILED` if state structure is invalid

**Example**:
```javascript
const state = readState('./data/current_state.json');
console.log('Status:', state.connection_status);
```

---

### `updateState(stateFilePath: string, updates: Partial<ConnectionState>): ConnectionState`

Update state file with new values (atomic write).

**Parameters**:
- `stateFilePath` (string): Absolute path to state JSON file
- `updates` (Partial<ConnectionState>): Object with fields to update (partial update supported)

**Returns**: `ConnectionState` - Updated state object

**Behavior**:
- Reads current state
- Merges updates (shallow merge)
- Validates merged state
- **Atomic write**: Writes to temp file, then renames (prevents corruption)
- Pretty-prints JSON (2-space indent for readability)
- Returns updated state

**Errors**:
- Throws `StateError` with code `UPDATE_FAILED` if write fails
- Throws `ValidationError` if updates contain invalid values

**Example**:
```javascript
// Update after processing email
const newState = updateState('./data/current_state.json', {
  last_id: 12345,
  last_id_received_at: '2025-11-01T10:00:02.123Z',
  last_error: null
});

// Update connection status
const newState = updateState('./data/current_state.json', {
  connection_status: 'connected',
  last_connected_at: new Date().toISOString()
});
```

---

### `clearError(stateFilePath: string): ConnectionState`

Clear last error (convenience function).

**Parameters**:
- `stateFilePath` (string): Absolute path to state JSON file

**Returns**: `ConnectionState` - Updated state with `last_error` set to `null`

**Behavior**:
- Calls `updateState()` with `{ last_error: null }`
- Use when connection recovers or error is resolved

**Errors**:
- Same as `updateState()`

**Example**:
```javascript
// After successful reconnection
const state = clearError('./data/current_state.json');
```

---

### `validateState(state: any): ConnectionState`

Validate state object structure and types.

**Parameters**:
- `state` (any): Object to validate

**Returns**: `ConnectionState` - Validated and normalized state object

**Behavior**:
- Checks all required fields exist
- Validates field types:
  - `last_id`: Must be non-negative integer
  - `last_id_received_at`: Must be valid ISO 8601 string
  - `last_connected_at`: Must be valid ISO 8601 string
  - `last_error`: Must be string or null
  - `connection_status`: Must be one of `'connected'`, `'reconnecting'`, `'disconnected'`
- Normalizes values if needed (e.g., converts numeric strings to numbers)

**Errors**:
- Throws `ValidationError` with code `INVALID_FIELD` if any field is invalid
- Includes context with field name and value

**Example**:
```javascript
try {
  const validState = validateState(rawState);
} catch (err) {
  console.error('Invalid state:', err.context.field);
}
```

---

## Error Types

### `StateError`

Thrown when state file operations fail.

**Properties**:
- `name`: `'StateError'`
- `message`: Description of failure
- `code`: One of:
  - `'INIT_FAILED'` - State initialization failed
  - `'READ_FAILED'` - Cannot read state file
  - `'UPDATE_FAILED'` - Cannot write state file
  - `'INVALID_STATE'` - JSON is malformed or corrupted
  - `'VALIDATION_FAILED'` - State structure is invalid
- `context`: Object with details (e.g., `{ stateFilePath, parseError }`)

### `ValidationError`

Thrown when state validation fails.

**Properties**:
- `name`: `'ValidationError'`
- `message`: Description of validation failure
- `code`: `'INVALID_FIELD'`
- `context`: Object with details (e.g., `{ field: 'last_id', value: -1, expected: 'non-negative integer' }`)

---

## Performance Characteristics

| Operation | Expected Time | Notes |
|-----------|---------------|-------|
| `initState()` | <50ms | One-time operation |
| `readState()` | <5ms | Synchronous file read + JSON parse |
| `updateState()` | <10ms | Synchronous write + rename (atomic) |
| `validateState()` | <1ms | In-memory validation |

**Frequency** (from FR-005):
- After each email processed (1 update per email)
- On connection state changes (infrequent)
- On errors (occasional)

**Expected Load**: ~100 updates/day (SC-006) = negligible I/O impact

---

## State Transitions

```javascript
// Valid transitions for connection_status

// Initial startup
updateState(path, { connection_status: 'disconnected' });

// Attempting connection
updateState(path, { connection_status: 'reconnecting' });

// Connection successful
updateState(path, {
  connection_status: 'connected',
  last_connected_at: new Date().toISOString(),
  last_error: null
});

// Connection lost, attempting reconnect
updateState(path, {
  connection_status: 'reconnecting',
  last_error: 'Connection timeout'
});

// Fatal error, giving up
updateState(path, {
  connection_status: 'disconnected',
  last_error: 'Authentication failed'
});
```

---

## Testing Requirements

### Unit Tests (`tests/unit/state-manager.test.js`)

1. Test `initState()`:
   - Creates file if missing
   - Creates parent directory if needed
   - Loads existing file
   - Uses initial state on first run
   - Handles corrupted JSON (recovery)

2. Test `readState()`:
   - Reads valid state
   - Throws on missing file
   - Throws on malformed JSON
   - Throws on invalid structure

3. Test `updateState()`:
   - Updates single field
   - Updates multiple fields
   - Preserves unchanged fields
   - Atomic write (creates temp file)
   - Handles write failures

4. Test `validateState()`:
   - Accepts valid state
   - Rejects invalid last_id (negative, non-integer)
   - Rejects invalid dates (non-ISO 8601)
   - Rejects invalid connection_status (not in enum)
   - Rejects missing required fields

5. Test `clearError()`:
   - Sets last_error to null
   - Preserves other fields

### Contract Tests (`tests/contract/state-manager.contract.test.js`)

1. Verify function signatures match contract
2. Verify error types and codes
3. Verify atomic write behavior (no partial writes)
4. Verify state file format matches data-model.md schema
5. Test concurrent updates (should be serialized)

---

## Atomic Write Implementation

**Critical**: Updates must be atomic to prevent corruption on crashes.

```javascript
function updateState(stateFilePath, updates) {
  // Read current state
  const currentState = readState(stateFilePath);

  // Merge updates
  const newState = { ...currentState, ...updates };

  // Validate
  validateState(newState);

  // Atomic write: temp file + rename
  const tempPath = `${stateFilePath}.tmp`;
  const json = JSON.stringify(newState, null, 2);

  try {
    fs.writeFileSync(tempPath, json, 'utf8');
    fs.renameSync(tempPath, stateFilePath);  // Atomic on POSIX
  } catch (err) {
    // Clean up temp file if exists
    try { fs.unlinkSync(tempPath); } catch {}
    throw new StateError('State update failed', 'UPDATE_FAILED', { stateFilePath, error: err });
  }

  return newState;
}
```

---

## Example Usage

```javascript
import { initState, updateState, clearError } from './state-manager.js';

// Initialize state
const statePath = './data/current_state.json';
const state = initState(statePath);
console.log('Starting id:', state.last_id);

// After processing email
function onEmailProcessed(email) {
  updateState(statePath, {
    last_id: email.id,
    last_id_received_at: email.downloaded_at,
    last_error: null
  });
}

// On connection success
function onConnected() {
  updateState(statePath, {
    connection_status: 'connected',
    last_connected_at: new Date().toISOString(),
    last_error: null
  });
}

// On connection error
function onConnectionError(error) {
  updateState(statePath, {
    connection_status: 'reconnecting',
    last_error: error.message
  });
}

// On recovery
function onRecovered() {
  clearError(statePath);
}
```

---

## Notes

- **Synchronous I/O**: Uses `fs.*Sync()` for simplicity and atomicity. Since updates are infrequent (per-email), blocking is acceptable.
- **Atomic Writes**: Rename operation is atomic on POSIX (macOS), ensuring no partial writes.
- **Human Readable**: JSON is pretty-printed for debugging and manual inspection.
- **No Locking**: Single process only; no need for file locking.
- **Backup Strategy**: Future enhancement could create `.bak` file before each write for recovery.
