# Data Model: Database Schema Refactor

**Feature**: Database Schema Refactor
**Branch**: 002-db-schema-refactor
**Date**: 2025-11-01

## Overview

This document defines the updated data model for the email storage system after the schema refactor. The primary change is aligning the database schema with Gmail's data model by using text-based identifiers and adding thread tracking.

## Entities

### Email

Represents a single email message stored from Gmail.

**Attributes**:

| Field | Type | Required | Description | Validation Rules |
|-------|------|----------|-------------|------------------|
| id | TEXT | Yes | Gmail message ID (unique identifier) | Non-empty string, PRIMARY KEY |
| thread_id | TEXT | Yes | Gmail thread ID (conversation grouping) | Non-empty string (empty string for migrated records) |
| received_at | TEXT | Yes | ISO 8601 timestamp when email was received in Gmail | Valid ISO 8601 datetime string |
| downloaded_at | TEXT | Yes | ISO 8601 timestamp when email was downloaded locally | Valid ISO 8601 datetime string |
| from_address | TEXT | Yes | Sender email address | Non-empty string |
| to_address | TEXT | Yes | Recipient email addresses (comma-separated) | Non-empty string |
| cc_address | TEXT | No | CC email addresses (comma-separated) | String or NULL |
| subject | TEXT | Yes | Email subject line | Non-empty string |
| labels | TEXT | Yes | Gmail labels (comma-separated) | String (may be empty) |
| body | TEXT | Yes | Email body content (plain text or HTML) | String (may be empty) |

**Indexes**:
- PRIMARY KEY on `id`
- INDEX on `downloaded_at` (for time-based queries)
- INDEX on `from_address` (for sender-based queries)
- INDEX on `thread_id` (for conversation-based queries)

**Constraints**:
- `id` must be unique (PRIMARY KEY)
- All fields except `cc_address` are NOT NULL
- `body` length limited to 50,000 characters (enforced at application layer)

### Schema Definition (SQLite)

```sql
CREATE TABLE emails (
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

CREATE INDEX idx_downloaded_at ON emails(downloaded_at);
CREATE INDEX idx_from_address ON emails(from_address);
CREATE INDEX idx_thread_id ON emails(thread_id);
```

## Relationships

### Email ↔ Thread (Implicit)

- **Type**: Many-to-One (many emails can belong to one thread)
- **Relationship**: Emails with the same `thread_id` are part of the same conversation
- **Cardinality**: 1:N (one thread can have N emails)
- **Implementation**: Denormalized - thread_id stored directly in emails table
- **Rationale**: No separate threads table needed; thread metadata comes from Gmail API

**Query Pattern**:
```sql
-- Get all emails in a thread
SELECT * FROM emails WHERE thread_id = ? ORDER BY received_at;

-- Count messages per thread
SELECT thread_id, COUNT(*) as message_count
FROM emails
GROUP BY thread_id
ORDER BY message_count DESC;
```

## State Transitions

Emails are immutable once stored. No state transitions occur after insertion.

**Email Lifecycle**:
1. **Created**: Email downloaded from Gmail and inserted into database
2. **Stored**: Email exists in database (terminal state)

**Migration Lifecycle** (one-time):
1. **Old Schema**: Email exists with INTEGER id, no thread_id
2. **Migration**: Convert id to TEXT, add empty thread_id
3. **New Schema**: Email exists with TEXT id and thread_id

## Data Migration Mapping

### Old Schema → New Schema

| Old Field | Old Type | New Field | New Type | Transformation |
|-----------|----------|-----------|----------|----------------|
| id | INTEGER | id | TEXT | `CAST(id AS TEXT)` |
| - | - | thread_id | TEXT | `''` (empty string) |
| from_address | TEXT | from_address | TEXT | No change |
| to_address | TEXT | to_address | TEXT | No change |
| cc_address | TEXT | cc_address | TEXT | No change |
| subject | TEXT | subject | TEXT | No change |
| body | TEXT | body | TEXT | No change |
| received_at | TEXT | received_at | TEXT | No change (reordered) |
| labels | TEXT | labels | TEXT | No change (reordered) |
| downloaded_at | TEXT | downloaded_at | TEXT | No change (reordered) |

**Column Order Changes**:
- Old: id, from_address, to_address, cc_address, subject, body, received_at, labels, downloaded_at
- New: id, thread_id, received_at, downloaded_at, from_address, to_address, cc_address, subject, labels, body

## Validation Rules

### Application-Level Validation

1. **Email ID Validation**:
   - Must be non-empty string
   - Typically 16-20 characters (Gmail format)
   - Alphanumeric with hyphens/underscores

2. **Thread ID Validation**:
   - Must be non-empty string (empty string allowed for migrated records)
   - Same format as email ID

3. **Timestamp Validation**:
   - Must be valid ISO 8601 format: `YYYY-MM-DD HH:MM:SS`
   - received_at should be ≤ downloaded_at

4. **Email Address Validation**:
   - from_address must contain '@'
   - to_address may contain multiple addresses (comma-separated)

5. **Body Length**:
   - Maximum 50,000 characters (SQLite cell limit consideration)
   - Truncate with '...' if exceeded

### Database-Level Validation

- PRIMARY KEY constraint on `id` (automatic uniqueness check)
- NOT NULL constraints on required fields
- No FOREIGN KEY constraints (denormalized design)

## Query Patterns

### Duplicate Detection
```sql
SELECT 1 FROM emails WHERE id = ?
```

### Store Email
```sql
INSERT INTO emails (
  id, thread_id, received_at, downloaded_at,
  from_address, to_address, cc_address, subject, labels, body
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

### Get Email by ID
```sql
SELECT * FROM emails WHERE id = ?
```

### Get Recent Emails
```sql
SELECT id, from_address, subject, downloaded_at
FROM emails
ORDER BY downloaded_at DESC
LIMIT ?
```

### Get Thread Messages
```sql
SELECT * FROM emails
WHERE thread_id = ? AND thread_id != ''
ORDER BY received_at
```

### Count Emails
```sql
SELECT COUNT(*) as count FROM emails
```

## Design Decisions

### Why TEXT instead of INTEGER for ID?

Gmail message IDs are text strings that don't fit into INTEGER type. Using TEXT:
- Preserves exact Gmail message ID format
- Prevents data loss from conversion
- Aligns with Gmail API data types
- Negligible performance impact in SQLite

### Why Add thread_id Field?

Thread tracking enables:
- Conversation context for emails
- Grouping related messages
- Future features like thread-based views
- Alignment with Gmail's data model

### Why Denormalized (No Threads Table)?

Benefits of denormalization:
- Simpler schema (one table instead of two)
- Faster queries (no JOIN needed)
- Thread metadata comes from Gmail, not stored locally
- Sufficient for current use case

Trade-offs accepted:
- Thread ID duplicated across emails (acceptable storage overhead)
- No thread-level metadata storage (not needed)

### Why Empty String for Missing thread_id?

For migrated records without thread_id:
- Empty string is semantically clear ("no thread info")
- NOT NULL constraint prevents NULL-handling complexity
- Query filtering is simple: `WHERE thread_id != ''`
- String operations work consistently

## Future Considerations

### Potential Schema Extensions (Out of Scope)

1. **Attachment Tracking**: Separate table for attachments with foreign key to emails
2. **Thread Metadata**: Separate threads table with thread-level attributes
3. **Full-Text Search**: FTS5 virtual table for body/subject search
4. **Email Status**: Add status field for read/unread/archived
5. **Sender Normalization**: Separate senders table to avoid duplication

These extensions are not part of the current refactor but could be added in future iterations.
