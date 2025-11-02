# Research: Google Sheets Webhook Server

**Feature**: 003-gsheets-webhook
**Date**: 2025-11-01
**Phase**: 0 (Outline & Research)

## Overview

This document captures research decisions and rationale for implementing a webhook server to receive email data from Google Apps Script and store it in SQLite.

## Technology Decisions

### HTTP Server Framework

**Decision**: Node.js built-in `http` module

**Rationale**:
- Zero additional dependencies (minimalist approach)
- Sufficient for single webhook endpoint use case
- Matches project's lightweight philosophy (no Express/Fastify overhead)
- Built-in JSON parsing via `JSON.parse()` on request body
- Direct control over request/response handling
- Node.js v24 LTS provides stable, performant HTTP implementation

**Alternatives Considered**:
- **Express.js**: Rejected - adds dependency overhead for single endpoint, feature-rich but unnecessary for this use case
- **Fastify**: Rejected - performance benefits negligible at this scale (10 concurrent requests), adds complexity
- **Hono**: Rejected - modern but adds external dependency when built-in module suffices

### Database Integration

**Decision**: Reuse existing `src/database.js` module with `storeEmail()` function

**Rationale**:
- User explicitly requested reusing database.js
- Already implements idempotent storage (checks for duplicate IDs before insertion)
- Current schema matches gmail-to-sheet.gs payload structure exactly (TEXT id, thread_id, etc.)
- Proven implementation with WAL mode enabled for concurrent access
- No schema changes needed

**Implementation Notes**:
- Import `initDatabase()` and `storeEmail()` from existing module
- Use `storeEmail()` return value (true/false) to determine if email was stored or skipped
- Let database.js handle all SQLite operations and error handling

### Request Validation

**Decision**: Manual JSON schema validation using JavaScript object property checks

**Rationale**:
- Simple validation needs (check presence of required fields)
- Avoids external validation library dependency (joi, ajv, zod)
- Required fields from gmail-to-sheet.gs: id, thread_id, received_at, downloaded_at, from_address, to_address, subject, labels, body
- Optional fields: cc_address, broadcasted_at
- Can implement in ~20 lines of code

**Validation Rules**:
```javascript
// Required fields (must be present and non-empty strings)
const requiredFields = [
  'id', 'thread_id', 'received_at', 'downloaded_at',
  'from_address', 'to_address', 'subject', 'labels', 'body'
];

// Optional fields (may be empty string or missing)
const optionalFields = ['cc_address', 'broadcasted_at'];
```

**Alternatives Considered**:
- **Zod**: Rejected - type-safe but adds dependency, overkill for simple field checks
- **Joi**: Rejected - mature but heavyweight for this use case
- **AJV**: Rejected - fast JSON Schema validator but unnecessary complexity

### Logging Strategy

**Decision**: Reuse existing `src/logger.js` module

**Rationale**:
- Consistent logging format across application
- Already available in codebase
- Provides structured logging capabilities
- No need to reinvent logging infrastructure

**Log Events**:
- Server startup (port, database path)
- Each webhook request (timestamp, message ID, success/duplicate/error)
- Validation failures (missing fields, malformed JSON)
- Database errors
- Server shutdown

### Error Handling

**Decision**: HTTP status code-based error responses with JSON error messages

**Rationale**:
- Standard HTTP semantics for webhook integrations
- Google Apps Script can easily check response.getResponseCode()
- Clear separation between client errors (400) and server errors (500)

**Response Format**:
```javascript
// Success (200 OK)
{ "status": "success", "action": "stored" | "skipped", "id": "message-id" }

// Client Error (400 Bad Request)
{ "status": "error", "message": "Missing required fields: id, subject", "code": "VALIDATION_ERROR" }

// Server Error (500 Internal Server Error)
{ "status": "error", "message": "Database operation failed", "code": "DATABASE_ERROR" }
```

### Port Configuration

**Decision**: Hardcoded port 8455 (as specified in requirements)

**Rationale**:
- User explicitly specified port 8455
- No configuration flexibility needed at this stage
- Can add environment variable support later if needed (PORT env var)

**Future Enhancement**:
- Consider adding `process.env.WEBHOOK_PORT || 8455` for flexibility
- Document in quickstart.md how to override if needed

### Concurrency Handling

**Decision**: Rely on Node.js event loop and better-sqlite3 WAL mode

**Rationale**:
- Node.js handles concurrent HTTP requests naturally via event loop
- SQLite WAL (Write-Ahead Logging) mode already enabled in database.js (line 145: `db.pragma('journal_mode = WAL')`)
- WAL allows multiple simultaneous readers and one writer
- better-sqlite3 is synchronous but non-blocking at I/O level with WAL
- Meets requirement of handling 10+ concurrent requests

**Performance Characteristics**:
- WAL mode supports concurrent reads during writes
- Each HTTP request handler operates independently
- Database locks are held only during actual write operation (milliseconds)
- Expected <200ms p95 latency for typical payloads

### Health Check Endpoint

**Decision**: Implement GET `/health` endpoint

**Rationale**:
- Supports User Story 3 (Monitor Server Health)
- Simple implementation (check database connection, return uptime)
- Industry standard for service monitoring
- Useful for deployment health checks and monitoring tools

**Response Format**:
```javascript
{
  "status": "healthy",
  "uptime": 86400, // seconds
  "port": 8455,
  "database": "connected",
  "timestamp": "2025-11-01T12:00:00.000Z"
}
```

## Integration Points

### Google Apps Script (gmail-to-sheet.gs)

**Expected Behavior**:
- Sends HTTP POST to webhook server with JSON payload
- Content-Type: application/json header
- Expects 200 OK for both successful storage and duplicate skips
- Implements retry logic (3 attempts with 3 second delay) in Apps Script
- Halts broadcast on persistent failures

**Webhook Server Responsibilities**:
- Accept POST requests on `/webhook` endpoint
- Parse JSON body
- Validate required fields
- Store in database via storeEmail()
- Return appropriate status code

### SQLite Database (src/database.js)

**Integration Method**:
```javascript
import { initDatabase, storeEmail } from './database.js';

const db = initDatabase('./data/emails.db'); // Use default path
const wasStored = storeEmail(db, emailPayload);
// wasStored = true if inserted, false if duplicate
```

**Schema Alignment**:
- gmail-to-sheet.gs payload maps directly to database schema
- No transformation needed (field names match exactly)
- TEXT id as primary key enables idempotent behavior

## Best Practices

### Node.js HTTP Server Patterns

**Best Practices Applied**:
1. **Single Responsibility**: Each request handler does one thing (validate → store → respond)
2. **Graceful Shutdown**: Handle SIGTERM/SIGINT to close database and server cleanly
3. **Request Body Limits**: Enforce 1MB max payload size to prevent memory issues
4. **Async Error Handling**: Wrap request handlers in try-catch, send 500 on unexpected errors
5. **Logging**: Log all requests with correlation IDs for debugging

**Code Structure**:
```javascript
// Recommended structure
- Server initialization
- Request routing (POST /webhook, GET /health)
- Request handlers with error boundaries
- Validation utilities
- Graceful shutdown handlers
```

### Security Considerations

**Current Scope** (no authentication per spec):
- Assumes trusted internal network
- No authentication/authorization implemented (out of scope)
- Input validation prevents injection attacks (JSON parsing, no SQL string concatenation)

**Future Enhancements** (out of scope for this feature):
- API key authentication via header (X-API-Key)
- HTTPS/TLS termination (handled by reverse proxy)
- Rate limiting to prevent abuse

### Testing Strategy

**Test Coverage**:
1. **Unit Tests**:
   - Request validation logic
   - JSON parsing error handling
   - Response formatting

2. **Integration Tests**:
   - POST /webhook with valid payload → 200 OK, data stored
   - POST /webhook with duplicate ID → 200 OK, data skipped
   - POST /webhook with missing fields → 400 Bad Request
   - POST /webhook with invalid JSON → 400 Bad Request
   - GET /health → 200 OK with status info

3. **Edge Case Tests**:
   - Large payloads (approaching 1MB limit)
   - Special characters in email content (UTF-8, emojis)
   - Concurrent requests (simulate 10+ parallel POSTs)
   - Database unavailable scenario

**Test Framework**: Node.js built-in test runner (`node --test`)

## Performance Considerations

### Expected Performance

**Latency Targets**:
- p50: <100ms (typical payload processing)
- p95: <200ms (spec requirement)
- p99: <500ms (max acceptable per spec)

**Throughput**:
- 10+ concurrent requests (spec requirement)
- Estimated capacity: 50-100 req/s (limited by SQLite write throughput)

### Bottlenecks & Mitigations

**Potential Bottleneck**: SQLite write lock contention
**Mitigation**: WAL mode allows concurrent reads, single writer sufficient for webhook use case

**Potential Bottleneck**: JSON parsing large payloads
**Mitigation**: 1MB request size limit, stream-based parsing not needed at this scale

**Potential Bottleneck**: Memory leaks from unclosed resources
**Mitigation**: Explicit database cleanup on shutdown, no persistent request state

## Open Questions & Assumptions

### Assumptions Made

1. **Database Path**: Use default path from existing config (assume `./data/emails.db` or similar)
2. **Error Recovery**: Google Apps Script handles retry logic, webhook server doesn't need to queue failed requests
3. **Payload Size**: Typical emails <100KB, max 1MB (based on Google Sheets 50k char limit)
4. **Deployment**: Single instance deployment (no load balancer, no horizontal scaling needed)
5. **Network**: Google Apps Script can reach webhook server on port 8455 (firewall rules configured)

### No Clarifications Needed

All technical decisions can proceed with reasonable defaults:
- HTTP framework: built-in http module
- Validation: simple field checking
- Storage: reuse database.js
- Logging: reuse logger.js
- Port: 8455 (specified)

## Summary

This research establishes a minimalist, dependency-free approach to webhook server implementation:
- **Zero new dependencies** (built-in Node.js http module)
- **Reuses existing infrastructure** (database.js, logger.js)
- **Simple validation** (manual field checks, no schema library)
- **Standard HTTP semantics** (200/400/500 status codes)
- **Idempotent design** (leveraging database.js duplicate checking)

Ready to proceed to Phase 1 (Design & Contracts).
