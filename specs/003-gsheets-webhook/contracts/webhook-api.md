# Webhook API Contract

**Feature**: 003-gsheets-webhook
**Version**: 1.0.0
**Date**: 2025-11-01

## Endpoint: POST /webhook

Receives email data from Google Apps Script and stores it in SQLite database.

### Request

#### HTTP Method
`POST`

#### Headers

| Header | Required | Value |
|--------|----------|-------|
| Content-Type | Yes | `application/json` |
| Content-Length | Yes | Request body size in bytes (max 1MB = 1048576 bytes) |

#### Request Body

**Format**: JSON

**Schema**:
```json
{
  "id": "string (required, Gmail message ID)",
  "thread_id": "string (required, Gmail thread ID)",
  "received_at": "string (required, ISO 8601 timestamp)",
  "downloaded_at": "string (required, ISO 8601 timestamp)",
  "broadcasted_at": "string (optional, ISO 8601 timestamp or empty)",
  "from_address": "string (required, email address)",
  "to_address": "string (required, email address(es), comma-separated)",
  "cc_address": "string (optional, email address(es), comma-separated or empty)",
  "subject": "string (required, email subject line)",
  "labels": "string (required, Gmail labels, comma-separated or empty)",
  "body": "string (required, email body text)"
}
```

**Required Fields** (must be present and non-empty):
- id
- thread_id
- received_at
- downloaded_at
- from_address
- to_address
- subject
- labels (can be empty string)
- body

**Optional Fields**:
- cc_address (can be missing or empty string)
- broadcasted_at (present in payload but not stored in database)

**Example**:
```json
{
  "id": "18f3a8b9c7d2e1f0",
  "thread_id": "18f3a8b9c7d2e1f0",
  "received_at": "2025-11-01 10:30:00",
  "downloaded_at": "2025-11-01 10:31:15",
  "broadcasted_at": "2025-11-01 10:31:20",
  "from_address": "sender@example.com",
  "to_address": "recipient@example.com",
  "cc_address": "",
  "subject": "Test Email",
  "labels": "INBOX, UNREAD",
  "body": "This is a test email body."
}
```

### Response

#### Success Response (Email Stored)

**Status Code**: `200 OK`

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "status": "success",
  "action": "stored",
  "id": "18f3a8b9c7d2e1f0"
}
```

**Fields**:
- `status`: Always "success" for 200 responses
- `action`: "stored" when email was inserted into database
- `id`: Echo of the message ID from request

---

#### Success Response (Email Skipped - Duplicate)

**Status Code**: `200 OK`

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "status": "success",
  "action": "skipped",
  "id": "18f3a8b9c7d2e1f0"
}
```

**Fields**:
- `status`: Always "success" for 200 responses
- `action`: "skipped" when email ID already exists in database (idempotent behavior)
- `id`: Echo of the message ID from request

---

#### Error Response (Validation Failed)

**Status Code**: `400 Bad Request`

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "status": "error",
  "message": "Missing required fields: id, subject",
  "code": "VALIDATION_ERROR"
}
```

**Fields**:
- `status`: Always "error" for error responses
- `message`: Human-readable error description
- `code`: Machine-readable error code

**Error Codes**:
- `VALIDATION_ERROR`: Missing or invalid required fields
- `INVALID_JSON`: Request body is not valid JSON
- `PAYLOAD_TOO_LARGE`: Request body exceeds 1MB limit

**Example Scenarios**:

*Missing required field*:
```json
{
  "status": "error",
  "message": "Missing required fields: id",
  "code": "VALIDATION_ERROR"
}
```

*Invalid JSON*:
```json
{
  "status": "error",
  "message": "Invalid JSON in request body",
  "code": "INVALID_JSON"
}
```

*Empty required field*:
```json
{
  "status": "error",
  "message": "Missing required fields: subject",
  "code": "VALIDATION_ERROR"
}
```

---

#### Error Response (Server Error)

**Status Code**: `500 Internal Server Error`

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "status": "error",
  "message": "Database operation failed",
  "code": "DATABASE_ERROR"
}
```

**Fields**:
- `status`: Always "error"
- `message`: Generic error description (no sensitive details)
- `code`: Machine-readable error code

**Error Codes**:
- `DATABASE_ERROR`: SQLite operation failed
- `INTERNAL_ERROR`: Unexpected server error

**Note**: Detailed error information logged server-side, not exposed to client

---

### Contract Test Scenarios

#### Test Case 1: Store New Email

**Request**:
```http
POST /webhook HTTP/1.1
Content-Type: application/json

{
  "id": "new-email-123",
  "thread_id": "thread-456",
  "received_at": "2025-11-01 12:00:00",
  "downloaded_at": "2025-11-01 12:01:00",
  "from_address": "test@example.com",
  "to_address": "recipient@example.com",
  "cc_address": "",
  "subject": "Test Subject",
  "labels": "INBOX",
  "body": "Test body"
}
```

**Expected Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "success",
  "action": "stored",
  "id": "new-email-123"
}
```

**Database Verification**:
```sql
SELECT * FROM emails WHERE id = 'new-email-123'
-- Should return 1 row with matching data
```

---

#### Test Case 2: Duplicate Email (Idempotency)

**Request** (same as Test Case 1, sent again):
```http
POST /webhook HTTP/1.1
Content-Type: application/json

{
  "id": "new-email-123",
  ...
}
```

**Expected Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "success",
  "action": "skipped",
  "id": "new-email-123"
}
```

**Database Verification**:
```sql
SELECT COUNT(*) FROM emails WHERE id = 'new-email-123'
-- Should return 1 (not 2)
```

---

#### Test Case 3: Missing Required Field

**Request**:
```http
POST /webhook HTTP/1.1
Content-Type: application/json

{
  "id": "missing-subject",
  "thread_id": "thread-789",
  "received_at": "2025-11-01 12:00:00",
  "downloaded_at": "2025-11-01 12:01:00",
  "from_address": "test@example.com",
  "to_address": "recipient@example.com",
  "labels": "",
  "body": "Test"
  // Missing "subject" field
}
```

**Expected Response**:
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "status": "error",
  "message": "Missing required fields: subject",
  "code": "VALIDATION_ERROR"
}
```

**Database Verification**:
```sql
SELECT * FROM emails WHERE id = 'missing-subject'
-- Should return 0 rows (not stored)
```

---

#### Test Case 4: Invalid JSON

**Request**:
```http
POST /webhook HTTP/1.1
Content-Type: application/json

{invalid json here
```

**Expected Response**:
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "status": "error",
  "message": "Invalid JSON in request body",
  "code": "INVALID_JSON"
}
```

---

#### Test Case 5: Empty Required Field

**Request**:
```http
POST /webhook HTTP/1.1
Content-Type: application/json

{
  "id": "",
  "thread_id": "thread-000",
  "received_at": "2025-11-01 12:00:00",
  "downloaded_at": "2025-11-01 12:01:00",
  "from_address": "test@example.com",
  "to_address": "recipient@example.com",
  "subject": "Test",
  "labels": "",
  "body": "Test"
}
```

**Expected Response**:
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "status": "error",
  "message": "Missing required fields: id",
  "code": "VALIDATION_ERROR"
}
```

---

#### Test Case 6: Concurrent Duplicate Requests

**Scenario**: Send same email ID in 5 concurrent requests

**Expected Behavior**:
- 1 request: 200 OK with "stored"
- 4 requests: 200 OK with "skipped"
- Database: Only 1 row inserted
- No errors or crashes

---

## Endpoint: GET /health

Health check endpoint for monitoring server status.

### Request

#### HTTP Method
`GET`

#### Headers
None required

#### Query Parameters
None

### Response

#### Success Response

**Status Code**: `200 OK`

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "status": "healthy",
  "uptime": 86400,
  "port": 8455,
  "database": "connected",
  "timestamp": "2025-11-01T12:00:00.000Z"
}
```

**Fields**:
- `status`: Always "healthy" if server is responding
- `uptime`: Server uptime in seconds (since process start)
- `port`: Port number server is listening on
- `database`: Database connection status ("connected" or "disconnected")
- `timestamp`: Current server time in ISO 8601 format

---

#### Error Response (Database Disconnected)

**Status Code**: `200 OK` (server still responding)

**Body**:
```json
{
  "status": "degraded",
  "uptime": 86400,
  "port": 8455,
  "database": "disconnected",
  "timestamp": "2025-11-01T12:00:00.000Z"
}
```

**Note**: Returns 200 even if database disconnected to indicate server process is alive

---

### Contract Test Scenarios

#### Test Case 1: Healthy Server

**Request**:
```http
GET /health HTTP/1.1
```

**Expected Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "healthy",
  "uptime": 123,
  "port": 8455,
  "database": "connected",
  "timestamp": "2025-11-01T12:00:00.000Z"
}
```

**Verification**:
- `uptime` should be > 0
- `timestamp` should be recent (within last few seconds)

---

## Error Handling Contract

### General Error Behavior

1. **All errors return JSON** (never HTML or plain text)
2. **Consistent error format**:
   ```json
   {
     "status": "error",
     "message": "Human-readable description",
     "code": "MACHINE_READABLE_CODE"
   }
   ```
3. **No sensitive information** in error responses (stack traces, file paths, etc.)
4. **Detailed errors logged server-side** with correlation IDs

### HTTP Status Code Contract

| Status Code | Usage |
|-------------|-------|
| 200 OK | Successful operation (stored or skipped) |
| 400 Bad Request | Client error (validation, invalid JSON, payload too large) |
| 404 Not Found | Endpoint not found (any path other than /webhook or /health) |
| 405 Method Not Allowed | Wrong HTTP method (e.g., GET /webhook, POST /health) |
| 500 Internal Server Error | Server error (database failure, unexpected error) |

### Method Not Allowed Example

**Request**:
```http
GET /webhook HTTP/1.1
```

**Expected Response**:
```http
HTTP/1.1 405 Method Not Allowed
Content-Type: application/json

{
  "status": "error",
  "message": "Method GET not allowed for /webhook",
  "code": "METHOD_NOT_ALLOWED"
}
```

### Not Found Example

**Request**:
```http
POST /unknown-endpoint HTTP/1.1
```

**Expected Response**:
```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "status": "error",
  "message": "Endpoint not found: /unknown-endpoint",
  "code": "NOT_FOUND"
}
```

---

## Performance Contract

### Latency Requirements

| Metric | Target | Measurement |
|--------|--------|-------------|
| p50 latency | < 100ms | Typical payload (<100KB) |
| p95 latency | < 200ms | Typical payload (<100KB) |
| p99 latency | < 500ms | Large payload (approaching 1MB) |

### Throughput Requirements

| Metric | Target |
|--------|--------|
| Concurrent requests | 10+ simultaneous POST /webhook |
| Sustained throughput | 50-100 requests/second |

### Resource Limits

| Resource | Limit |
|----------|-------|
| Request body size | 1MB (1048576 bytes) |
| Memory usage | < 100MB resident set size |
| File descriptors | Database connection + HTTP server (minimal) |

---

## Versioning

**Current Version**: 1.0.0

**Breaking Changes**: None planned

**Backward Compatibility**: All future changes must maintain compatibility with Google Apps Script integration (gmail-to-sheet.gs)

**Change Policy**: API contract changes require updating this document and incrementing version number

---

## Summary

This contract defines:
- ✅ Request/response schemas for /webhook and /health endpoints
- ✅ HTTP status codes for all scenarios
- ✅ Error response formats
- ✅ Idempotency behavior (duplicate handling)
- ✅ Validation rules
- ✅ Performance requirements
- ✅ Contract test scenarios

**Implementation Checklist**:
- [ ] All contract test scenarios pass
- [ ] Error responses match specified format
- [ ] Idempotency verified with concurrent requests
- [ ] Performance targets met (p95 < 200ms)
- [ ] Health endpoint returns accurate status
