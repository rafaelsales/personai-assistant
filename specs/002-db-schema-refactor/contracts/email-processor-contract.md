# Email Processor Contract

**Feature**: Database Schema Refactor
**Module**: `src/email-processor.js`
**Date**: 2025-11-01

## Overview

This contract defines required updates to the email processor module to support the new database schema with text-based IDs and thread tracking.

## Required Changes

### Function: `fetchEmail(imapClient, id)`

**Current Behavior**:
- Fetches email from IMAP server
- Parses headers and body
- Builds email record with fields: `id`, `from_address`, `to_address`, `cc_address`, `subject`, `body`, `received_at`, `labels`, `downloaded_at`
- Returns email record object

**Required Changes**:

1. **Add thread_id extraction** from IMAP attributes:
   ```javascript
   // Extract thread_id from IMAP Gmail extension
   const threadId = emailData.attrs?.['x-gm-thrid'] || '';
   ```

2. **Include thread_id in email record**:
   ```javascript
   const emailRecord = {
     id: emailData.id,           // Already text from IMAP
     thread_id: threadId,         // NEW: Gmail thread ID
     received_at: formattedDate,
     downloaded_at: nowFormatted,
     from_address: parsed.from?.text || headers.from || '',
     to_address: parsed.to?.text || headers.to || '',
     cc_address: parsed.cc?.text || headers.cc || null,
     subject: parsed.subject || headers.subject || '',
     labels: labelsJson,
     body: bodyText
   };
   ```

3. **Ensure ID is text type**:
   - IMAP library already returns message IDs as strings
   - Verify `emailData.id` is not being converted to integer
   - If conversion exists, remove it

### Function: `processNewEmail(imapClient, db, emailId)`

**Current Behavior**:
- Fetches email using `fetchEmail()`
- Stores email using `storeEmail(db, emailRecord)`
- Updates state manager
- Handles errors

**Required Changes**:

1. **Update to accept text-based email IDs**:
   - Parameter `emailId` should be string type
   - No conversion to integer

2. **Verify email record includes thread_id**:
   - Email record from `fetchEmail()` will include `thread_id`
   - Pass to `storeEmail()` without modification

**No other changes required** - function signature remains the same.

## IMAP Gmail Extensions

### Available Gmail-Specific Attributes

The IMAP library provides Gmail extensions through `x-gm-*` attributes:

| Attribute | Description | Type | Example |
|-----------|-------------|------|---------|
| `x-gm-msgid` | Gmail message ID (decimal) | number | 1234567890123456789 |
| `x-gm-thrid` | Gmail thread ID (decimal) | number | 9876543210987654321 |
| `x-gm-labels` | Gmail labels | array | `['\\Inbox', '\\Important']` |

**Note**: Gmail IDs from IMAP are **decimal numbers**, not the same as Gmail API message IDs (which are hexadecimal). For this implementation:
- Use the IMAP message UID as the `id` (text format)
- Use `x-gm-thrid` converted to string as the `thread_id`

### Extracting Thread ID

```javascript
// In fetchEmail() function
const threadId = emailData.attrs?.['x-gm-thrid']
  ? String(emailData.attrs['x-gm-thrid'])
  : '';
```

## Updated Email Record Schema

**Before (Old Schema)**:
```javascript
{
  id: number,              // Integer ID
  from_address: string,
  to_address: string,
  cc_address: string|null,
  subject: string,
  body: string,
  received_at: string,
  labels: string,
  downloaded_at: string
}
```

**After (New Schema)**:
```javascript
{
  id: string,              // Text ID (IMAP UID as string)
  thread_id: string,       // Gmail thread ID as string
  received_at: string,     // Reordered
  downloaded_at: string,   // Reordered
  from_address: string,
  to_address: string,
  cc_address: string|null,
  subject: string,
  labels: string,          // Reordered
  body: string
}
```

## Implementation Checklist

### src/email-processor.js Changes

- [ ] Update `fetchEmail()` to extract `x-gm-thrid` from IMAP attributes
- [ ] Convert thread ID to string: `String(attrs['x-gm-thrid']) || ''`
- [ ] Add `thread_id` field to email record construction
- [ ] Verify `id` field is already text (from IMAP UID)
- [ ] Update field order in email record object to match new schema
- [ ] Handle missing thread_id gracefully (empty string fallback)

### Testing Requirements

- [ ] Test with email that has thread_id
- [ ] Test with email that has no thread_id (missing attribute)
- [ ] Verify thread_id is string type
- [ ] Verify id is string type (not number)
- [ ] Verify duplicate detection still works with text IDs

## Backward Compatibility

### Breaking Changes

- **Email record structure**: Gains `thread_id` field
- **Field order**: Changed to match database schema (documentation only, not functional)
- **ID type**: Changed from number to string (may affect calling code)

### Migration Impact

Code consuming `fetchEmail()` must:
1. Handle `thread_id` field in returned email record
2. Accept string IDs instead of number IDs
3. Update any integer comparisons to string comparisons

## Error Handling

### Missing IMAP Attributes

If `x-gm-thrid` is not available:
- Fallback to empty string: `thread_id = ''`
- Log warning if expected but missing
- Do not fail email processing

### Type Conversion

If `x-gm-thrid` is unexpected type:
- Use `String()` conversion to ensure text
- Empty string if conversion fails: `|| ''`

## Example Implementation

### Before

```javascript
export async function fetchEmail(imapClient, id) {
  try {
    const emailData = await imapClient.fetchEmail(id);
    const headers = parseHeaders(emailData.headers || '');
    const fullEmail = `${emailData.headers}\r\n\r\n${emailData.body || ''}`;
    const parsed = await simpleParser(fullEmail);

    const labels = emailData.attrs?.['x-gm-labels'] || [];
    const labelsJson = JSON.stringify(Array.isArray(labels) ? labels : [labels]);

    const emailRecord = {
      id: emailData.id,  // Should already be text
      from_address: parsed.from?.text || headers.from || '',
      to_address: parsed.to?.text || headers.to || '',
      cc_address: parsed.cc?.text || headers.cc || null,
      subject: parsed.subject || headers.subject || '',
      body: parsed.text || parsed.html || '',
      received_at: formatDate(parsed.date),
      labels: labelsJson,
      downloaded_at: formatDate(new Date())
    };

    return emailRecord;
  } catch (error) {
    logger.error('Email fetch failed', { id, error: error.message });
    throw error;
  }
}
```

### After

```javascript
export async function fetchEmail(imapClient, id) {
  try {
    const emailData = await imapClient.fetchEmail(id);
    const headers = parseHeaders(emailData.headers || '');
    const fullEmail = `${emailData.headers}\r\n\r\n${emailData.body || ''}`;
    const parsed = await simpleParser(fullEmail);

    const labels = emailData.attrs?.['x-gm-labels'] || [];
    const labelsJson = JSON.stringify(Array.isArray(labels) ? labels : [labels]);

    // NEW: Extract Gmail thread ID
    const threadId = emailData.attrs?.['x-gm-thrid']
      ? String(emailData.attrs['x-gm-thrid'])
      : '';

    // Updated field order to match new schema
    const emailRecord = {
      id: String(emailData.id),  // Ensure text type
      thread_id: threadId,        // NEW: Gmail thread ID
      received_at: formatDate(parsed.date),
      downloaded_at: formatDate(new Date()),
      from_address: parsed.from?.text || headers.from || '',
      to_address: parsed.to?.text || headers.to || '',
      cc_address: parsed.cc?.text || headers.cc || null,
      subject: parsed.subject || headers.subject || '',
      labels: labelsJson,
      body: parsed.text || parsed.html || ''
    };

    return emailRecord;
  } catch (error) {
    logger.error('Email fetch failed', { id, error: error.message });
    throw error;
  }
}
```

## Change Summary

| Aspect | Change Type | Details |
|--------|-------------|---------|
| `fetchEmail()` | Modified | Adds thread_id extraction |
| Email record | Extended | Gains thread_id field |
| Field order | Reordered | Matches database schema |
| ID type | Type change | Explicitly convert to string |
| Error handling | Enhanced | Handle missing x-gm-thrid |

## Dependencies

This contract depends on:
- **Database contract**: `storeEmail()` must accept `thread_id` field
- **IMAP client**: Must provide `x-gm-thrid` in email attributes
- **Data model**: Email record structure must match database schema

## Testing Strategy

### Unit Tests

1. Test `fetchEmail()` with mock IMAP data containing `x-gm-thrid`
2. Test `fetchEmail()` with mock IMAP data missing `x-gm-thrid`
3. Verify thread_id is always string type
4. Verify id is always string type

### Integration Tests

1. Fetch real email from Gmail IMAP
2. Verify thread_id is extracted correctly
3. Store email and verify thread_id is preserved
4. Query by thread_id and verify results

## Performance Impact

- Negligible: Adding thread_id extraction is a simple attribute lookup
- No additional IMAP round trips required
- String conversion overhead is trivial (<1ms)
