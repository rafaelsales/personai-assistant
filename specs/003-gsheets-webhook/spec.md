# Feature Specification: Google Sheets Webhook Server

**Feature Branch**: `003-gsheets-webhook`
**Created**: 2025-11-01
**Status**: Draft
**Input**: User description: "Create a new entrypoint to the app to start a gsheets-webhook-server. This server listens at 8455 according, then takes the JSON payload produced by gmail-to-sheet.gs and stores into the existing SQLite DB. If a message id already exists (should be a conflict due to PK), just silently ignore as it's already stored (idempotency)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Receive Email Data from Google Sheets (Priority: P1)

The system receives email data from Google Apps Script via webhook and stores it in the local database, enabling centralized email data management without manual intervention.

**Why this priority**: This is the core functionality that enables automated data ingestion from Gmail via Google Sheets. Without this, the entire webhook integration cannot function.

**Independent Test**: Can be fully tested by running the webhook server, sending a POST request with valid email JSON payload, and verifying the data is stored in SQLite database. Delivers value by automating email data capture.

**Acceptance Scenarios**:

1. **Given** the webhook server is running on port 8455, **When** Google Apps Script sends a valid email JSON payload, **Then** the email is stored in the SQLite database with all fields persisted correctly
2. **Given** the webhook server receives an email payload, **When** the message ID already exists in the database, **Then** the duplicate is silently ignored (no error, no duplicate entry) and the server returns success
3. **Given** the webhook server is running, **When** a valid email payload is received, **Then** the server responds with HTTP 200 status within 2 seconds

---

### User Story 2 - Handle Invalid or Malformed Data (Priority: P2)

The system gracefully handles invalid or incomplete webhook payloads without crashing or corrupting existing data.

**Why this priority**: Essential for system stability and data integrity, but secondary to basic ingestion capability.

**Independent Test**: Can be tested independently by sending various malformed payloads (missing fields, invalid JSON, wrong data types) and verifying the server responds appropriately without storing corrupt data.

**Acceptance Scenarios**:

1. **Given** the webhook server is running, **When** a payload with missing required fields is received, **Then** the server returns HTTP 400 Bad Request with a descriptive error message and does not store any data
2. **Given** the webhook server is running, **When** invalid JSON is received, **Then** the server returns HTTP 400 Bad Request and remains operational for subsequent requests
3. **Given** the webhook server encounters a database error, **When** attempting to store an email, **Then** the server returns HTTP 500 Internal Server Error and logs the error details for debugging

---

### User Story 3 - Monitor Server Health (Priority: P3)

Operators can verify the webhook server is running and operational through health check endpoints.

**Why this priority**: Useful for monitoring and operations but not critical for basic functionality.

**Independent Test**: Can be tested by calling a health endpoint and verifying it returns a successful response indicating server status.

**Acceptance Scenarios**:

1. **Given** the webhook server is running, **When** a health check endpoint is called, **Then** the server returns HTTP 200 with status information (uptime, port, database connection status)

---

### Edge Cases

- What happens when the database file is locked or inaccessible?
- How does the system handle extremely large email bodies (>1MB)?
- What happens if Google Apps Script sends the same email multiple times in rapid succession?
- How does the server behave when receiving concurrent webhook requests?
- What happens if the database schema doesn't match expected structure?
- How does the server handle special characters or encoding issues in email content?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a new executable entrypoint to start the webhook server independently from other application services
- **FR-002**: System MUST listen for HTTP POST requests on port 8455
- **FR-003**: System MUST accept JSON payloads matching the structure produced by gmail-to-sheet.gs (id, thread_id, received_at, downloaded_at, broadcasted_at, from_address, to_address, cc_address, subject, labels, body)
- **FR-004**: System MUST validate incoming JSON payload contains all required fields before attempting database storage
- **FR-005**: System MUST store received email data in the existing SQLite database using the current schema (TEXT id as primary key)
- **FR-006**: System MUST implement idempotent behavior: when a message ID already exists in database, silently skip insertion without error
- **FR-007**: System MUST return HTTP 200 OK when email is successfully stored or skipped due to duplicate ID
- **FR-008**: System MUST return HTTP 400 Bad Request when payload validation fails
- **FR-009**: System MUST return HTTP 500 Internal Server Error when database operations fail
- **FR-010**: System MUST log all incoming webhook requests including timestamp, success/failure status, and message ID
- **FR-011**: System MUST gracefully handle database connection initialization and cleanup
- **FR-012**: System MUST continue operating after handling individual request errors (resilience)

### Key Entities

- **Email Record**: Represents an email message received via webhook with fields matching gmail-to-sheet.gs output structure (id, thread_id, received_at, downloaded_at, broadcasted_at, from_address, to_address, cc_address, subject, labels, body)
- **Webhook Request**: Represents an incoming HTTP POST containing email data in JSON format
- **Database Connection**: Represents the SQLite database instance where emails are persisted

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Server starts successfully and listens on port 8455 within 5 seconds
- **SC-002**: Successfully processes and stores valid email payloads with 100% data integrity (all fields preserved exactly as received)
- **SC-003**: Handles duplicate message IDs with zero errors logged (idempotent operations)
- **SC-004**: Processes individual webhook requests in under 500ms for typical email payloads (<100KB)
- **SC-005**: Server remains operational for 24+ hours of continuous running without crashes or memory leaks
- **SC-006**: Returns appropriate HTTP status codes (200, 400, 500) for 100% of requests based on outcome
- **SC-007**: Successfully handles 10+ concurrent webhook requests without data corruption or errors

## Assumptions *(optional)*

- The existing SQLite database schema (from database.js) is already properly initialized before the webhook server starts
- Google Apps Script (gmail-to-sheet.gs) will always send JSON payloads with Content-Type: application/json header
- The default database path will be used, consistent with other application components
- Network connectivity between Google Apps Script and the webhook server endpoint exists and is reliable
- Port 8455 is available and not blocked by firewall rules
- The webhook server will run on the same machine where the SQLite database is located
- Email payloads will typically be under 100KB in size, with rare cases up to 1MB (based on Google Sheets 50,000 character cell limit)

## Dependencies *(optional)*

- Existing SQLite database module (src/database.js) providing initDatabase() and storeEmail() functions
- Gmail-to-sheet.gs Google Apps Script must be configured to send webhooks to correct endpoint URL
- Better-sqlite3 library already installed and available
- Node.js HTTP framework for handling webhook requests (assumed to be selected during planning phase)

## Out of Scope *(optional)*

- Authentication or authorization for webhook endpoint (assumes trusted internal network)
- Webhook retry logic or message queuing (Apps Script handles retries)
- Real-time notifications when emails are received
- Web UI or dashboard for monitoring received emails
- Email processing, analysis, or automated responses
- Database backup or replication
- HTTPS/SSL termination (assumes handled by reverse proxy if needed)
- Rate limiting or throttling of incoming webhook requests
- Modification or deletion of stored emails via webhook API
