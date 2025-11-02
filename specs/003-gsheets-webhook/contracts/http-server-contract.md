# HTTP Server Lifecycle Contract

**Feature**: 003-gsheets-webhook
**Version**: 1.0.0
**Date**: 2025-11-01

## Overview

This contract defines the lifecycle, initialization, shutdown, and operational behavior of the webhook HTTP server.

## Server Initialization

### Startup Sequence

**Contract**:
```
1. Load configuration (port, database path)
2. Initialize database connection
3. Verify database schema exists
4. Start HTTP server on configured port
5. Log startup confirmation
6. Ready to accept requests
```

### Startup Contract Tests

#### Test Case 1: Successful Startup

**Preconditions**:
- Port 8455 is available
- Database file path is writable
- Database schema exists

**Expected Behavior**:
```javascript
// Server starts successfully
// Logs: "Webhook server listening on port 8455"
// Logs: "Database connected at ./data/emails.db"
// Process does not exit
```

**Verification**:
```bash
# Server is listening
curl http://localhost:8455/health
# Returns 200 OK with healthy status
```

---

#### Test Case 2: Port Already in Use

**Preconditions**:
- Port 8455 is already occupied by another process

**Expected Behavior**:
```javascript
// Server fails to start
// Logs error: "Error: Port 8455 is already in use"
// Process exits with code 1
```

**Contract**:
- MUST log clear error message
- MUST exit cleanly (no hanging process)
- MUST NOT retry binding to port automatically

---

#### Test Case 3: Database Initialization Failure

**Preconditions**:
- Database file path is not writable
- OR database file is corrupted

**Expected Behavior**:
```javascript
// Server fails to start
// Logs error: "Database initialization failed: [error details]"
// Process exits with code 1
```

**Contract**:
- MUST NOT start HTTP server if database fails
- MUST log database error details
- MUST exit cleanly

---

## Server Configuration

### Configuration Contract

**Required Configuration**:
```javascript
{
  port: 8455,              // HTTP server port (hardcoded)
  databasePath: string,    // Path to SQLite database (from config)
  maxPayloadSize: 1048576  // 1MB in bytes (hardcoded)
}
```

**Configuration Sources**:
1. **Port**: Hardcoded to 8455 (spec requirement)
2. **Database Path**: From existing config module or default `./data/emails.db`
3. **Max Payload Size**: Hardcoded to 1MB

**Future Enhancement** (out of scope):
- Environment variable override: `process.env.WEBHOOK_PORT || 8455`

---

## Request Handling

### Request Lifecycle

**Contract**:
```
1. Receive HTTP request
2. Log request metadata (method, path, timestamp, correlation ID)
3. Route to handler based on method + path
4. Execute handler (parse → validate → process → respond)
5. Log response metadata (status, latency, correlation ID)
6. Send response to client
```

### Logging Contract

**Required Log Events**:

#### Startup
```json
{
  "level": "info",
  "message": "Webhook server starting",
  "port": 8455,
  "databasePath": "./data/emails.db"
}
```

#### Request Received
```json
{
  "level": "info",
  "message": "Request received",
  "method": "POST",
  "path": "/webhook",
  "correlationId": "req-abc123",
  "timestamp": "2025-11-01T12:00:00.000Z"
}
```

#### Validation Error
```json
{
  "level": "warn",
  "message": "Validation failed",
  "correlationId": "req-abc123",
  "error": "Missing required fields: subject",
  "messageId": null
}
```

#### Email Stored
```json
{
  "level": "info",
  "message": "Email stored",
  "correlationId": "req-abc123",
  "messageId": "18f3a8b9c7d2e1f0",
  "action": "stored"
}
```

#### Email Skipped (Duplicate)
```json
{
  "level": "info",
  "message": "Email skipped (duplicate)",
  "correlationId": "req-abc123",
  "messageId": "18f3a8b9c7d2e1f0",
  "action": "skipped"
}
```

#### Database Error
```json
{
  "level": "error",
  "message": "Database operation failed",
  "correlationId": "req-abc123",
  "messageId": "18f3a8b9c7d2e1f0",
  "error": "SQLITE_BUSY: database is locked"
}
```

#### Response Sent
```json
{
  "level": "info",
  "message": "Response sent",
  "correlationId": "req-abc123",
  "statusCode": 200,
  "latencyMs": 45
}
```

---

## Error Recovery

### Non-Fatal Errors (Server Continues)

**Contract**: Server MUST continue operating after these errors:

1. **Validation errors** (400 Bad Request)
   - Invalid JSON
   - Missing required fields
   - Payload too large

2. **Database duplicate errors** (treated as success)
   - PRIMARY KEY constraint violation
   - Return 200 OK with action: "skipped"

3. **Individual request errors**
   - Unhandled exceptions in request handler
   - Return 500 Internal Server Error
   - Log full error with stack trace
   - Continue accepting new requests

### Fatal Errors (Server Must Shutdown)

**Contract**: Server SHOULD exit gracefully after these errors:

1. **Database connection lost** (and cannot reconnect)
   - Log critical error
   - Initiate graceful shutdown
   - Exit with code 1

2. **Unhandled exceptions in server initialization**
   - Log error
   - Exit with code 1

**Error Recovery Contract Test**:

```javascript
// Test: Server continues after request error
1. Send valid request → 200 OK (baseline)
2. Send invalid JSON → 400 Bad Request
3. Send valid request → 200 OK (server still operational)
4. Send request with missing field → 400 Bad Request
5. Send valid request → 200 OK (server still operational)

// Server must process all 5 requests without crashing
```

---

## Graceful Shutdown

### Shutdown Contract

**Trigger Signals**:
- `SIGTERM` (kill, systemd stop)
- `SIGINT` (Ctrl+C in terminal)

**Shutdown Sequence**:
```
1. Receive shutdown signal
2. Log shutdown initiation
3. Stop accepting new requests (close HTTP server)
4. Wait for in-flight requests to complete (max 5 seconds)
5. Close database connection
6. Log shutdown complete
7. Exit with code 0
```

### Shutdown Contract Test

**Test Case 1: Clean Shutdown**

**Steps**:
```bash
1. Start server
2. Send SIGTERM signal
3. Verify shutdown sequence in logs
4. Verify process exits with code 0
```

**Expected Logs**:
```json
{ "level": "info", "message": "Shutdown signal received (SIGTERM)" }
{ "level": "info", "message": "Stopping HTTP server" }
{ "level": "info", "message": "Closing database connection" }
{ "level": "info", "message": "Shutdown complete" }
```

---

**Test Case 2: Shutdown with In-Flight Requests**

**Steps**:
```bash
1. Start server
2. Send request (hold response for 3 seconds)
3. Send SIGTERM during request processing
4. Verify request completes before shutdown
```

**Expected Behavior**:
- Request receives 200 OK response
- Server waits for request to complete
- Then proceeds with shutdown sequence

---

**Test Case 3: Forced Shutdown (Timeout)**

**Steps**:
```bash
1. Start server
2. Send request (hold response for 10 seconds)
3. Send SIGTERM during request processing
4. After 5 second timeout, force shutdown
```

**Expected Behavior**:
- Server waits max 5 seconds for in-flight requests
- After timeout, force close connections
- Close database
- Exit with code 0

**Contract**:
- In-flight request timeout: 5 seconds
- After timeout: close immediately

---

## Resource Management

### Memory Contract

**Maximum Memory Usage**: < 100MB resident set size (RSS)

**Contract Tests**:
```javascript
// Test: Memory leak detection
1. Start server
2. Send 10,000 requests over 1 minute
3. Measure RSS before and after
4. RSS should not grow linearly with request count
5. RSS should stabilize after warmup period
```

**Memory Leak Indicators**:
- ❌ RSS grows > 10MB after processing 10k requests
- ❌ RSS continues growing after warmup period
- ✅ RSS stabilizes within 50-100MB range

---

### Database Connection Contract

**Connection Lifecycle**:
- **Opened**: During server initialization
- **Closed**: During graceful shutdown
- **Singleton**: One database connection for entire server process

**Contract**:
- MUST NOT open new database connections per request
- MUST reuse single database connection (initialized at startup)
- MUST close connection on shutdown
- MUST handle SQLITE_BUSY errors gracefully (WAL mode should minimize)

---

### File Descriptor Contract

**Expected FDs**:
- 1x SQLite database file
- 1x HTTP server socket (listening)
- Nx Active HTTP connections (transient, ≤ 10 concurrent)

**Contract Test**:
```bash
# Check open file descriptors
lsof -p <server-pid> | wc -l
# Should be < 50 under normal load
# Should not grow indefinitely
```

---

## Concurrency Contract

### Thread Model

**Contract**: Single-threaded Node.js event loop

**Implications**:
- No shared state concerns (no mutexes needed)
- Concurrent requests handled via async I/O
- Database operations are synchronous but WAL mode allows concurrency

---

### Concurrent Request Handling

**Contract**: Handle 10+ concurrent POST /webhook requests

**Test Scenario**:
```javascript
// Send 20 concurrent identical requests (same message ID)
// Expected:
//   - 1 request: 200 OK with "stored"
//   - 19 requests: 200 OK with "skipped"
//   - Database: 1 row inserted
//   - No 500 errors
//   - All requests complete within 500ms
```

**Race Condition Handling**:
- **Duplicate detection**: Database PRIMARY KEY constraint handles race conditions
- **UNIQUE constraint error**: Caught and treated as duplicate (return 200 OK with "skipped")

---

## Health Check Contract

### Health Status Determination

**Contract**:

| Condition | Status | HTTP Code |
|-----------|--------|-----------|
| Server running + DB connected | "healthy" | 200 OK |
| Server running + DB disconnected | "degraded" | 200 OK |
| Server not running | (no response) | N/A |

**Health Check Tests**:

#### Test 1: Healthy Server
```bash
curl http://localhost:8455/health
# Expect: 200 OK with status: "healthy"
```

#### Test 2: Database Disconnected
```bash
# Simulate database disconnection (close DB connection internally)
curl http://localhost:8455/health
# Expect: 200 OK with status: "degraded"
```

---

## Uptime Contract

### Availability Requirement

**Contract**: Server must remain operational for 24+ hours without restart

**Test Scenario**:
```bash
1. Start server
2. Run continuous load test for 24 hours (10 req/min)
3. Periodically check /health endpoint
4. Verify:
   - Server responds to all requests
   - No memory leaks (RSS stable)
   - No file descriptor leaks
   - No crashes or restarts
```

**Success Criteria**:
- 100% request success rate
- 100% health check success rate
- Memory usage < 100MB
- Process uptime = 24+ hours

---

## Summary

This contract defines:

- ✅ Startup sequence and initialization requirements
- ✅ Configuration sources and defaults
- ✅ Request handling lifecycle
- ✅ Logging requirements (structured JSON logs)
- ✅ Error recovery behavior (non-fatal vs fatal)
- ✅ Graceful shutdown sequence
- ✅ Resource management constraints (memory, FDs, DB connections)
- ✅ Concurrency model and race condition handling
- ✅ Health check semantics
- ✅ Uptime and reliability requirements

**Implementation Checklist**:
- [ ] Graceful shutdown on SIGTERM/SIGINT
- [ ] Structured logging for all operations
- [ ] Single database connection (reused across requests)
- [ ] Memory usage < 100MB under load
- [ ] 24+ hour uptime without crashes
- [ ] Concurrent request handling (10+)
- [ ] Health check endpoint functional
