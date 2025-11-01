# Research: Gmail IMAP Email Monitor

**Feature**: 001-gmail-imap-monitor
**Date**: 2025-11-01
**Purpose**: Resolve technical decisions for implementation

## Overview

This document captures research findings and technical decisions for the Gmail IMAP Email Monitor. Three primary areas required investigation:

1. IMAP library selection for Gmail connectivity with IDLE support
2. SQLite library selection for email storage
3. Testing framework for Node.js

## Decision 1: IMAP Library Selection

### Decision: `imap` (formerly node-imap)

**Rationale**:
- **Mature and widely adopted**: Over 1M weekly downloads on npm, battle-tested in production
- **IMAP IDLE support**: Native support for IDLE extension required for real-time push notifications (FR-002)
- **Low-level control**: Provides fine-grained control over connection lifecycle, essential for implementing custom reconnection logic with exponential backoff (FR-007)
- **Active maintenance**: Recently transferred to new maintainer, continues to receive updates
- **Event-driven architecture**: Aligns well with long-running process requirements (FR-016)
- **Gmail compatibility**: Well-documented Gmail integration patterns

**Alternatives Considered**:

| Library | Pros | Cons | Verdict |
|---------|------|------|---------|
| `imap-simple` | Higher-level API, promises/async-await support | Abandoned (last update 2018), no active maintenance, less control over connection lifecycle | ❌ Rejected - unmaintained |
| `emailjs-imap-client` | Modern ES6+, good TypeScript support | Primarily browser-focused, less suited for long-running Node.js processes | ❌ Rejected - wrong use case |
| `imapflow` | Modern async/await API, active development | Newer (less battle-tested), fewer production deployments for long-running services | ⚠️ Viable alternative but less proven |

**Selected**: `imap` (npm package)

**Implementation Notes**:
- Use event listeners for `mail` (new email), `error` (connection issues), `end` (connection closed)
- Implement IDLE using `connection.idle()` and `connection.done()`
- Handle reconnection logic in application layer (not library-provided)
- Implement TLS/SSL connection with `{ host: 'imap.gmail.com', port: 993, tls: true }`

---

## Decision 2: SQLite Library Selection

### Decision: `better-sqlite3`

**Rationale**:
- **Synchronous API**: Simplifies error handling and state management in long-running process - no async race conditions
- **Performance**: 2-4x faster than `sqlite3` for typical workloads due to synchronous nature and better optimization
- **Memory efficiency**: Lower memory overhead, critical for <100MB constraint
- **Reliability**: Fewer edge cases with connection pooling and transaction management
- **Simplicity**: Synchronous operations align well with sequential email processing requirements
- **Native performance**: C++ bindings provide near-native SQLite performance

**Alternatives Considered**:

| Library | Pros | Cons | Verdict |
|---------|------|------|---------|
| `sqlite3` | Most popular (3M+ weekly downloads), async/promise API | Async overhead unnecessary for single-threaded email processing, potential race conditions, slower | ❌ Rejected - unnecessary complexity |
| `sql.js` | Pure JavaScript (WASM), no native deps | Poor performance, high memory usage, not suited for persistent storage | ❌ Rejected - wrong use case |

**Selected**: `better-sqlite3`

**Implementation Notes**:
- Use prepared statements for all queries (INSERT, SELECT, UID lookups)
- Enable WAL mode for better concurrency: `db.pragma('journal_mode = WAL')`
- Create indexes on `uid` (primary key) and `received_at` (chronological queries) as per requirements
- Use transactions for batch operations during sync after reconnection
- Database path: `./data/emails.db` as specified in requirements

---

## Decision 3: Testing Framework Selection

### Decision: `node:test` (Node.js built-in test runner)

**Rationale**:
- **Zero dependencies**: Built into Node.js v24 LTS (target platform), reduces dependency footprint
- **Native integration**: First-class support for ES modules, async/await, and modern JavaScript
- **Sufficient features**: Includes test suites, assertions, mocking, coverage reporting - adequate for project needs
- **Performance**: Faster startup time without external dependencies
- **Maintenance**: No version conflicts or security vulnerabilities from third-party test frameworks
- **Simplicity**: Aligns with lightweight, single-purpose service architecture

**Alternatives Considered**:

| Framework | Pros | Cons | Verdict |
|-----------|------|------|---------|
| `jest` | Most popular, rich ecosystem, great mocking | Heavy (45+ dependencies), slower startup, overkill for simple service | ❌ Rejected - too heavy |
| `vitest` | Modern, fast, Vite-compatible | Primarily for frontend/Vite projects, unnecessary complexity | ❌ Rejected - wrong ecosystem |
| `ava` | Concurrent test execution, modern API | Additional dependency, minimal benefit for small test suite | ❌ Rejected - unnecessary |
| `mocha` + `chai` | Flexible, widely adopted | Two dependencies, more boilerplate, Node.js built-in is sufficient | ❌ Rejected - redundant |

**Selected**: `node:test` with `node:assert`

**Implementation Notes**:
- Use `import test from 'node:test'` and `import assert from 'node:assert/strict'`
- Organize tests by module: `tests/unit/imap-client.test.js`, `tests/unit/database.test.js`, etc.
- Integration tests in `tests/integration/` for end-to-end IMAP + DB flows
- Contract tests in `tests/contract/` to validate state file schema against spec
- Run with `node --test tests/**/*.test.js`
- Coverage with `node --test --experimental-test-coverage`

---

## Additional Technical Decisions

### Environment Configuration: `dotenv`

**Decision**: Use `dotenv` for environment variable management

**Rationale**:
- Industry standard for Node.js environment configuration
- Simple `.env` file format specified in requirements
- Zero runtime overhead (loaded once at startup)
- Wide adoption and documentation

**Implementation**:
```javascript
import 'dotenv/config';  // Load at entry point

// Access variables
const config = {
  gmail: {
    user: process.env.GMAIL_USER,
    password: process.env.GMAIL_APP_PASSWORD,
  },
  imap: {
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.IMAP_PORT || '993'),
    tls: process.env.IMAP_TLS !== 'false',
  },
  db: {
    path: process.env.DB_PATH || './data/emails.db',
  },
  state: {
    path: process.env.STATE_FILE_PATH || './data/current_state.json',
  },
  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
```

---

### Logging Strategy: Console with Timestamps

**Decision**: Use structured console logging with ISO 8601 timestamps

**Rationale**:
- No external dependencies required (FR-011 specifies console with timestamps)
- Sufficient for background service monitoring
- Easy to redirect to files or log aggregation tools via shell redirection
- Meets requirements for ERROR, WARN, INFO, DEBUG levels

**Implementation Pattern**:
```javascript
const logger = {
  error: (msg, meta = {}) => console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    message: msg,
    ...meta
  })),
  warn: (msg, meta = {}) => console.warn(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'WARN',
    message: msg,
    ...meta
  })),
  info: (msg, meta = {}) => console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    message: msg,
    ...meta
  })),
  debug: (msg, meta = {}) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        message: msg,
        ...meta
      }));
    }
  },
};
```

---

### Reconnection Strategy: Custom Exponential Backoff

**Decision**: Implement custom exponential backoff in application layer

**Rationale**:
- Requirements specify exact backoff pattern: 1s, 2s, 4s, 8s, max 60s (FR-007)
- IMAP libraries don't provide this out-of-box
- Full control over reconnection logic ensures compliance with FR-006 (30s detection) and FR-007

**Implementation Pattern**:
```javascript
class ReconnectionManager {
  constructor() {
    this.delays = [1000, 2000, 4000, 8000];  // 1s, 2s, 4s, 8s
    this.maxDelay = 60000;  // 60s
    this.currentAttempt = 0;
  }

  getNextDelay() {
    const delay = this.delays[this.currentAttempt] || this.maxDelay;
    this.currentAttempt = Math.min(this.currentAttempt + 1, this.delays.length);
    return delay;
  }

  reset() {
    this.currentAttempt = 0;
  }
}
```

---

### Email Parsing: IMAP Library Built-in + MailParser

**Decision**: Use `imap` library's built-in parsing with `mailparser` for body content

**Rationale**:
- `imap` provides header parsing out-of-box
- `mailparser` handles complex MIME parsing for HTML/text body extraction
- Widely used together in production systems
- Handles edge cases (no subject, no body, special characters) gracefully

**Implementation Notes**:
- Use `imap.fetch()` with `bodies` parameter to retrieve headers and body
- Pipe body stream to `mailparser` for content extraction
- Store both `text` and `html` parts (prioritize `text`, fallback to `html`)
- Handle missing fields with empty strings (edge case requirement)

---

## Summary of Technical Stack

| Component | Selection | Version/Notes |
|-----------|-----------|---------------|
| **Runtime** | Node.js | v24 LTS (ES2022+ modules) |
| **IMAP Client** | `imap` | Latest stable |
| **SQLite** | `better-sqlite3` | Latest stable, WAL mode |
| **Testing** | `node:test` + `node:assert` | Built-in (Node.js 24+) |
| **Email Parsing** | `mailparser` | For MIME/body parsing |
| **Configuration** | `dotenv` | Environment variables |
| **Logging** | Console (structured JSON) | ISO 8601 timestamps |

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Gmail IMAP API changes | Use stable `imap` library with broad Gmail user base; monitor Gmail developer announcements |
| Connection stability on macOS sleep/wake | Implement robust error detection (30s timeout) and reconnection logic; test thoroughly with actual sleep cycles |
| SQLite database corruption | Enable WAL mode; implement error recovery; graceful degradation (log error, continue monitoring) |
| Memory leaks in long-running process | Use synchronous SQLite (avoids async handles); implement proper event listener cleanup; monitor with `process.memoryUsage()` |
| Email parsing edge cases | Comprehensive error handling around mailparser; skip malformed emails (log and continue per FR-014) |

---

## Next Steps (Phase 1)

With all technical decisions resolved, proceed to:

1. **Data Model Design** (`data-model.md`) - Define SQLite schema and state file structure
2. **API Contracts** (`contracts/`) - Define internal module interfaces (not REST APIs)
3. **Quickstart Guide** (`quickstart.md`) - Setup and usage instructions
4. **Agent Context Update** - Update Claude context with selected technologies
