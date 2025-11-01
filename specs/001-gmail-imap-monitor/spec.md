# Feature Specification: Gmail IMAP Email Monitor

**Feature Branch**: `001-gmail-imap-monitor`
**Created**: 2025-11-01
**Status**: Draft
**Input**: User description: "Gmail IMAP email monitor that maintains persistent connection, downloads new emails in real-time, and stores them in SQLite database with automatic reconnection"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Real-Time Email Receipt (Priority: P1)

As a user with an active Gmail account, I want my emails to be captured and stored locally in real-time so that I can access them immediately after they arrive without manual intervention.

**Why this priority**: This is the core value proposition - real-time email monitoring. Without this, the system provides no advantage over manual email checking.

**Independent Test**: Can be fully tested by sending a test email to the monitored Gmail account and verifying it appears in the local database within seconds. Delivers immediate value as a basic email capture system.

**Acceptance Scenarios**:

1. **Given** the monitor is connected to Gmail and idle, **When** a new email arrives in the inbox, **Then** the email appears in the local database within 5 seconds with all metadata (from, to, subject, body, labels, timestamps)
2. **Given** the monitor is running, **When** multiple emails arrive simultaneously, **Then** all emails are captured and stored without loss or duplication
3. **Given** an email with HTML content arrives, **When** the monitor processes it, **Then** both the HTML body and all metadata are stored correctly
4. **Given** an email with multiple recipients (To, CC) arrives, **When** stored, **Then** all recipient information is preserved accurately

---

### User Story 2 - Automatic Reconnection & Sync (Priority: P2)

As a user whose computer may sleep or lose internet connectivity, I want the monitor to automatically reconnect and sync missed emails so that I never lose email data due to temporary disconnections.

**Why this priority**: Critical for reliability in real-world usage where network interruptions and computer sleep cycles are common. Without this, manual intervention would be required frequently.

**Independent Test**: Can be tested by intentionally disconnecting the network, sending test emails during the disconnection, then reconnecting. System should automatically recover and sync missed emails. Delivers value as a reliable, hands-off monitoring solution.

**Acceptance Scenarios**:

1. **Given** the monitor detects a connection loss, **When** the network becomes available, **Then** the system reconnects automatically within 60 seconds using exponential backoff
2. **Given** emails arrived during a disconnection period, **When** the monitor reconnects, **Then** all missed emails are synced and stored in chronological order
3. **Given** the computer wakes from sleep, **When** the monitor detects the state change, **Then** it re-establishes the connection and syncs any missed emails within 60 seconds
4. **Given** reconnection fails multiple times, **When** the system retries, **Then** it uses exponential backoff (1s, 2s, 4s, 8s, up to 60s) without flooding logs or consuming excessive resources

---

### User Story 3 - State Visibility & Monitoring (Priority: P3)

As a system administrator or power user, I want to see the current connection status and last sync state so that I can verify the monitor is working correctly and troubleshoot issues if needed.

**Why this priority**: Important for operational transparency and debugging, but not required for basic functionality. Users can operate the system without actively monitoring state.

**Independent Test**: Can be tested by examining the state file and logs while performing various operations (connection, disconnection, email receipt). Delivers value as a diagnostic and monitoring tool.

**Acceptance Scenarios**:

1. **Given** the monitor is running, **When** I check the state file, **Then** I see current connection status (connected/reconnecting/disconnected), last UID processed, and timestamps for last connection and last email
2. **Given** an error occurs (authentication failure, network timeout), **When** I check the state file, **Then** the error details are recorded with timestamp
3. **Given** emails are being processed, **When** I check the logs, **Then** I see timestamped entries for each email received including UID, subject, and sender
4. **Given** the monitor is reconnecting, **When** I check logs and state, **Then** I see reconnection attempts with timestamps and the exponential backoff pattern

---

### Edge Cases

- **What happens when an email has no subject or body?** System should store empty strings and not fail
- **What happens when email body exceeds expected size limits?** System should store full content (SQLite TEXT can handle up to 1 billion characters)
- **What happens when the database file is locked or corrupted?** System should log error, attempt recovery, and continue monitoring (may lose individual email but shouldn't crash)
- **What happens when Gmail labels contain special characters or emojis?** System should store them as-is in JSON format
- **What happens when credentials expire or are revoked?** System should log authentication error, update state, and attempt reconnection with exponential backoff
- **What happens on initial startup with empty database?** System should start monitoring from current point, not download entire mailbox history (unless explicitly configured otherwise)
- **What happens when parsing an email fails?** System should log the error, skip that email, and continue processing remaining emails without crashing

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST establish and maintain a persistent IMAP connection to Gmail using secure TLS/SSL on port 993
- **FR-002**: System MUST use IMAP IDLE extension to receive real-time push notifications for new emails
- **FR-003**: System MUST store each email with the following fields: UID, from, to, cc, subject, body, original_date, labels, received_at
- **FR-004**: System MUST maintain a state file containing: last_uid, last_uid_received_at, last_connected_at, last_error, connection_status
- **FR-005**: System MUST update the state file immediately after each email is processed and on connection state changes
- **FR-006**: System MUST detect connection drops (network issues, timeouts, hibernation) within 30 seconds
- **FR-007**: System MUST automatically reconnect using exponential backoff strategy (1s, 2s, 4s, 8s, maximum 60s)
- **FR-008**: System MUST sync missed emails after reconnection by searching for UIDs greater than last_uid
- **FR-009**: System MUST prevent duplicate email storage by checking UID uniqueness before insertion
- **FR-010**: System MUST authenticate using Gmail App Password stored in environment variables
- **FR-011**: System MUST log all significant events with timestamps: connections, disconnections, emails received, errors, reconnection attempts
- **FR-012**: System MUST handle graceful shutdown on SIGINT/SIGTERM by closing IMAP connection and flushing state to disk
- **FR-013**: System MUST support at least 10,000 emails in the database without performance degradation
- **FR-014**: System MUST not crash on individual email parsing errors - log error and continue processing
- **FR-015**: System MUST store Gmail labels as JSON array in string format
- **FR-016**: System MUST run continuously as a long-lived background process until explicitly terminated

### Key Entities

- **Email Record**: Represents a single email message with metadata (UID, sender, recipients, subject, body content), delivery information (original send date, local receipt timestamp), and categorization (Gmail labels). UID serves as unique identifier and primary key.

- **Connection State**: Represents the current operational status of the IMAP monitor including connection health (connected/reconnecting/disconnected), synchronization position (last processed UID and timestamp), health tracking (last successful connection time), and error history (most recent error if any). Updated in real-time as system operates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: New emails appear in the local database within 5 seconds of arrival in Gmail inbox under normal network conditions
- **SC-002**: System automatically recovers from connection loss and syncs missed emails within 60 seconds of network restoration
- **SC-003**: System runs continuously for at least 7 days without crashes or manual intervention required
- **SC-004**: System successfully handles computer sleep/wake cycles without data loss or requiring manual restart
- **SC-005**: System maintains accurate state file with connection status updated within 2 seconds of any state change
- **SC-006**: System processes and stores at least 100 emails per day without performance degradation
- **SC-007**: All reconnection attempts follow exponential backoff pattern without overwhelming logs or system resources
- **SC-008**: Zero duplicate emails stored in database over 30-day operational period
- **SC-009**: Individual email parsing failures do not prevent processing of subsequent emails - 99.9% uptime even with malformed emails

## Assumptions

- Users have IMAP enabled on their Gmail account and possess a valid App Password
- Users have Node.js v24 LTS or higher installed on macOS
- Users will configure credentials via environment variables before first run
- SQLite database storage is sufficient (no need for external database systems)
- Only INBOX monitoring is required initially; other folders can be added later
- Full mailbox history synchronization is not required on initial startup - monitoring starts from current point
- Email content is primarily text or HTML; binary attachments are not required for initial version
- Standard disk I/O performance is adequate for real-time email storage
- Users have adequate disk space for email storage (SQLite database can grow unbounded)
- macOS is the primary platform; other platforms are not required for initial version

## Dependencies

- External IMAP library (node-imap or imap-simple) for IMAP protocol support
- External SQLite library (better-sqlite3 or sqlite3) for database operations
- Gmail IMAP service availability and API stability
- Node.js runtime environment and standard library support
- Access to environment variable configuration mechanism
- File system access for database and state file storage

## Out of Scope

The following are explicitly excluded from this feature:

- Email operations (add labels, move to trash, mark as read/unread) - reserved for future enhancement
- Multi-account support - single Gmail account only
- Email attachment download and storage
- Full-text search capabilities within stored emails
- Historical mailbox synchronization (downloading all existing emails before monitoring point)
- Email filtering or rule-based processing
- Web UI or GUI for viewing stored emails
- Email sending capabilities
- OAuth2 authentication (App Password only)
- Cross-platform support beyond macOS
- Monitoring folders other than INBOX
- Email encryption or additional security layers beyond TLS
- Performance metrics dashboard or monitoring UI
- Integration with other email clients or services
- Automated backup of database or state files
