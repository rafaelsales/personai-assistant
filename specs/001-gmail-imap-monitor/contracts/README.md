# Module Contracts: Gmail IMAP Email Monitor

**Feature**: 001-gmail-imap-monitor
**Date**: 2025-11-01
**Purpose**: Define internal module interfaces and contracts

## Overview

This directory contains contract definitions for internal modules. Since this is a background service (not a REST API), these contracts define:

1. **Module Interfaces**: Function signatures and expected behavior
2. **Data Contracts**: Input/output structures for module interactions
3. **Error Contracts**: Expected error types and handling

These contracts serve as:
- **Documentation** for module responsibilities
- **Testing guides** for contract/integration tests
- **Implementation blueprints** for developers

---

## Module Architecture

```text
┌─────────────────────────────────────────────────┐
│                   index.js                      │
│            (Main Entry Point)                   │
│  - Process lifecycle (startup, shutdown)        │
│  - Orchestrate modules                          │
│  - Handle SIGINT/SIGTERM                        │
└─────────────────────────────────────────────────┘
           │          │          │
           ▼          ▼          ▼
┌─────────────┐ ┌────────────┐ ┌──────────────┐
│config.js    │ │state-      │ │database.js   │
│             │ │manager.js  │ │              │
│Load env vars│ │R/W state   │ │SQLite ops    │
└─────────────┘ └────────────┘ └──────────────┘
                      │               │
                      ▼               ▼
           ┌──────────────────────────────┐
           │      imap-client.js          │
           │  (IMAP Connection Manager)   │
           │  - Connect, IDLE, reconnect  │
           └──────────────────────────────┘
                      │
                      ▼
           ┌──────────────────────────────┐
           │   email-processor.js         │
           │  (Email Parser & Storage)    │
           │  - Parse, validate, store    │
           └──────────────────────────────┘
```

---

## Contracts

1. **[config.js](./config-contract.md)** - Configuration loading and validation
2. **[database.js](./database-contract.md)** - SQLite operations
3. **[state-manager.js](./state-manager-contract.md)** - State file operations
4. **[imap-client.js](./imap-client-contract.md)** - IMAP connection management
5. **[email-processor.js](./email-processor-contract.md)** - Email parsing and storage

---

## Contract Testing

Each contract should have corresponding tests in `tests/contract/`:

```text
tests/contract/
├── config.contract.test.js
├── database.contract.test.js
├── state-manager.contract.test.js
├── imap-client.contract.test.js
└── email-processor.contract.test.js
```

**Contract tests verify**:
- Function signatures match contract specifications
- Input validation behavior is correct
- Output structures match expected schemas
- Error handling follows contract error specifications
- Edge cases defined in contracts are handled

---

## Error Handling Philosophy

All modules follow consistent error handling:

1. **Validation Errors**: Throw immediately for invalid inputs
2. **Operational Errors**: Return error objects or throw with context
3. **Fatal Errors**: Log and propagate to main process for restart decision
4. **Transient Errors**: Retry with backoff (connection issues, locks)

**Error Structure**:
```javascript
class ModuleError extends Error {
  constructor(message, code, context = {}) {
    super(message);
    this.name = 'ModuleError';
    this.code = code;  // e.g., 'CONNECTION_FAILED', 'INVALID_EMAIL'
    this.context = context;  // Additional info (id, attempt, etc.)
    this.timestamp = new Date().toISOString();
  }
}
```

---

## Next Steps

Review individual contract files for detailed specifications of each module.
