# Feature Specification: Database Schema Refactor

**Feature Branch**: `002-db-schema-refactor`
**Created**: 2025-11-01
**Status**: Draft
**Input**: User description: "Changes to DB:
- id should be no longer integer, it should be text
- add thread_id (text) right after id
- move received_at to after thread_id
- move downloaded_at to after received_at (after received_at having moved to thread_id)
- move labels to before body

do not touch @gmail-to-sheet.gs"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Store Gmail Message IDs as Text (Priority: P1)

The email system needs to store Gmail message IDs in their native text format to ensure compatibility with Gmail's API and prevent potential data loss from integer conversion.

**Why this priority**: This is the foundation change that affects all other modifications. Gmail message IDs are text strings that may not fit into integer types, and using the correct data type prevents data integrity issues.

**Independent Test**: Can be fully tested by storing an email with a Gmail message ID and verifying it's stored as text, retrieving it successfully, and checking for duplicate detection to still work correctly.

**Acceptance Scenarios**:

1. **Given** an email with a Gmail message ID, **When** the system stores it, **Then** the ID is stored as text without conversion or truncation
2. **Given** an existing email with a text ID, **When** the system checks for duplicates, **Then** it correctly identifies duplicate emails by their text ID
3. **Given** multiple emails with long Gmail message IDs, **When** they are stored, **Then** all IDs are preserved exactly as received

---

### User Story 2 - Track Email Thread Context (Priority: P2)

The email system needs to store thread IDs alongside message IDs to enable tracking of email conversations and grouping related messages together.

**Why this priority**: Thread tracking provides conversation context and allows grouping related emails, which is valuable for understanding email relationships but doesn't affect basic email storage functionality.

**Independent Test**: Can be fully tested by storing emails from the same Gmail thread and verifying both message_id and thread_id are captured, then querying emails by thread_id to retrieve all messages in a conversation.

**Acceptance Scenarios**:

1. **Given** an email that is part of a thread, **When** the system stores it, **Then** both message ID and thread ID are captured
2. **Given** multiple emails from the same thread, **When** they are stored, **Then** they all share the same thread_id
3. **Given** a thread_id, **When** the system queries for emails, **Then** all messages from that thread are retrievable

---

### User Story 3 - Organize Email Metadata Logically (Priority: P3)

The email database schema should organize fields in a logical order that groups related information together for better data comprehension and query efficiency.

**Why this priority**: This improves code maintainability and database comprehension but doesn't affect functionality. The new order groups identifiers together, then timestamps, then addressing, then content.

**Independent Test**: Can be fully tested by verifying the database schema reflects the new column order: id, thread_id, received_at, downloaded_at, from_address, to_address, cc_address, subject, labels, body.

**Acceptance Scenarios**:

1. **Given** the database schema, **When** inspecting column order, **Then** columns appear in the logical grouping: IDs first, timestamps second, addresses third, content last
2. **Given** existing queries and inserts, **When** they execute, **Then** they continue to work correctly with the new column order
3. **Given** the labels field, **When** storing an email, **Then** it appears before the body field in the schema

---

### Edge Cases

- What happens when a message ID or thread ID is null or empty string?
- How does the system handle migration of existing integer IDs to text format?
- What happens when querying by ID with an integer value after schema change?
- How does the system handle very long Gmail message IDs or thread IDs (potential length limits)?
- What happens to existing indexes after column reordering?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST store message IDs as text data type instead of integer
- **FR-002**: System MUST add a thread_id field of text data type immediately after the id field
- **FR-003**: System MUST reorder the received_at field to appear immediately after thread_id
- **FR-004**: System MUST reorder the downloaded_at field to appear immediately after received_at
- **FR-005**: System MUST reorder the labels field to appear immediately before the body field
- **FR-006**: System MUST maintain the order: id, thread_id, received_at, downloaded_at, from_address, to_address, cc_address, subject, labels, body
- **FR-007**: System MUST preserve all existing email data during schema migration
- **FR-008**: System MUST continue to prevent duplicate emails using the text-based ID
- **FR-009**: System MUST maintain query functionality for retrieving emails by ID with the new text type
- **FR-010**: System MUST update all database indexes to work with the new schema
- **FR-011**: System MUST NOT modify the gmail-to-sheet.gs file as part of this change

### Key Entities

- **Email Record**: Represents a stored email message with the following attributes in order:
  - id (text): Gmail message identifier
  - thread_id (text): Gmail thread identifier for grouping related messages
  - received_at (timestamp): When the email was received in Gmail
  - downloaded_at (timestamp): When the email was downloaded to local storage
  - from_address (text): Sender email address
  - to_address (text): Recipient email addresses
  - cc_address (text): CC'd email addresses
  - subject (text): Email subject line
  - labels (text): Gmail labels applied to the email
  - body (text): Email content

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All existing emails are successfully migrated to the new schema without data loss
- **SC-002**: System continues to identify and skip duplicate emails correctly with text-based IDs
- **SC-003**: Database queries return results in the same time or faster compared to the previous schema
- **SC-004**: Thread-based queries can retrieve all messages in a conversation within acceptable performance thresholds
- **SC-005**: Schema inspection shows the correct column order matching requirements
- **SC-006**: All existing application functionality continues to work after the migration

## Assumptions

- Gmail message IDs and thread IDs are provided as text strings by the email source
- The application using this database will be updated to handle text IDs instead of integer IDs
- Existing data can be safely converted from integer to text format without information loss
- Column order changes do not affect application logic that references columns by name (not position)
- The gmail-to-sheet.gs integration is independent of these database schema changes

## Out of Scope

- Changes to the gmail-to-sheet.gs file
- Changes to email processing logic beyond schema adaptation
- Performance optimization beyond maintaining existing query performance
- Adding new fields beyond thread_id
- Changing data types of fields other than id
- Adding new indexes beyond updating existing ones
