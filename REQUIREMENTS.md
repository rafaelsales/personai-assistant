# Gmail IMAP Email Monitor - Requirements Document

## Overview
A local macOS background program that maintains a persistent IMAP connection to Gmail, downloads new emails in real-time, and stores them in a local SQLite database with automatic reconnection and sync capabilities.

## Technology Stack
- **Language**: JavaScript (ES2022+)
- **Runtime**: Node.js (v24 LTS or higher)
- **Protocol**: IMAP with IDLE extension
- **Database**: SQLite
- **Email Provider**: Gmail

## Core Features

### 1. Real-Time Email Monitoring
- Establish persistent IMAP connection to Gmail
- Use IMAP IDLE to receive push notifications for new emails
- Download email metadata and content immediately upon receipt

### 2. Connection Management
- Maintain persistent connection with automatic health checks
- Detect connection drops (network issues, hibernation, timeouts)
- Implement automatic reconnection with exponential backoff
- On reconnection: sync missed emails using `SEARCH UID <last_id>:*`

### 3. Email Storage (SQLite)

**Database Schema: `emails` table**
- `id` (INTEGER PRIMARY KEY) - IMAP id
- `from` (TEXT) - Sender email address
- `to` (TEXT) - Recipient email address(es)
- `cc` (TEXT) - CC recipients
- `subject` (TEXT) - Email subject
- `body` (TEXT) - Email body (plain text or HTML)
- `received_at` (TEXT/DATETIME) - Original sent date/time from email headers
- `labels` (TEXT) - Gmail labels/folders (JSON array stored as string)
- `downloaded_at` (TEXT/DATETIME) - Timestamp when received by local IMAP client

**Indexes:**
- Index on `id` for fast lookups
- Index on `downloaded_at` for chronological queries

### 4. State Management (JSON)

**File: `current_state.json`**
```json
{
  "last_id": 12345,
  "last_id_received_at": "2025-11-01T10:30:45.123Z",
  "last_connected_at": "2025-11-01T10:30:45.123Z",
  "last_error": null,
  "connection_status": "connected"
}
```

**Fields:**
- `last_id` (number) - Highest id processed
- `last_id_received_at` (ISO 8601 string) - Timestamp when last id was received
- `last_connected_at` (ISO 8601 string) - Last successful connection timestamp
- `last_error` (string|null) - Last error/exception message, null if none
- `connection_status` (string) - Current status: "connected", "reconnecting", "disconnected"

**Update Policy:**
- Update immediately after each email is processed
- Update on connection state changes
- Update on errors/exceptions

### 5. Email Operations (Future)
The program should be designed to support:
- Add labels to emails
- Move emails to trash
- Mark as read/unread

## Technical Requirements

### JavaScript/Node.js
- Use ES Modules (ESM)
- Use modern async/await syntax
- Use latest JavaScript features (ES2022+)
- Proper error handling with try/catch
- Structured logging (console with timestamps)

### IMAP Library
- Recommended: `node-imap` or `imap-simple`
- Must support IMAP IDLE
- Must support id-based operations

### SQLite Library
- Recommended: `better-sqlite3` (synchronous, fast)
- Alternative: `sqlite3` (async)

### Error Handling
- Graceful handling of connection drops
- Retry logic with exponential backoff (1s, 2s, 4s, 8s, max 60s)
- Log all errors to state file and console
- Don't crash on single email parsing errors

### Performance
- Handle large mailboxes (10,000+ emails)
- Efficient id-based incremental sync
- Avoid re-downloading existing emails

### Process Management
- Run as long-lived background process
- Graceful shutdown on SIGINT/SIGTERM
- Close IMAP connection cleanly
- Flush state to disk on exit

## Gmail-Specific Requirements

### Authentication
- Support Gmail App Passwords (IMAP enabled)
- Store credentials in environment variables (.env)

### Gmail Labels
- Map Gmail labels to IMAP folders
- Store labels as JSON array in database
- Handle special Gmail folders (INBOX, [Gmail]/Sent Mail, etc.)

### IMAP Settings for Gmail
```
Host: imap.gmail.com
Port: 993
Security: TLS/SSL
```

## File Structure
```
personai-assistant/
├── README.md                 # Setup and usage instructions
├── REQUIREMENTS.md           # This document
├── package.json              # Dependencies
├── src/
│   ├── index.js             # Main entry point
│   ├── imap-client.js       # IMAP connection and operations
│   ├── email-processor.js   # Email parsing and storage
│   ├── database.js          # SQLite operations
│   ├── state-manager.js     # current_state.json management
│   └── config.js            # Configuration loader
├── data/
│   ├── emails.db            # SQLite database
│   └── current_state.json   # State file
└── .env.example             # Example environment variables
```

## Configuration

**Environment Variables (`.env`)**
```
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-app-password
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_TLS=true
DB_PATH=./data/emails.db
STATE_FILE_PATH=./data/current_state.json
LOG_LEVEL=info
```

## Logging Requirements
- Timestamp on all log entries
- Log levels: ERROR, WARN, INFO, DEBUG
- Log events:
  - Connection established/lost
  - Email received (id, subject, from)
  - Sync started/completed
  - Errors with stack traces
  - Reconnection attempts

## Success Criteria
1. Program successfully connects to Gmail via IMAP
2. Receives emails in real-time via IDLE
3. Stores all specified email fields in SQLite
4. Maintains accurate state in `current_state.json`
5. Automatically syncs missed emails after reconnection
6. Runs continuously without crashes
7. Handles Mac hibernation/wake cycles gracefully