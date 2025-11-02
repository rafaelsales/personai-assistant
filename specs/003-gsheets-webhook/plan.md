# Implementation Plan: Google Sheets Webhook Server

**Branch**: `003-gsheets-webhook` | **Date**: 2025-11-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-gsheets-webhook/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Create a new webhook server entrypoint that listens on port 8455 to receive email data from Google Apps Script (gmail-to-sheet.gs). The server accepts JSON payloads containing email metadata and content, then stores them in the existing SQLite database with idempotent behavior (silently ignoring duplicate message IDs). Uses Node.js built-in HTTP server and reuses the existing database.js module for data persistence.

## Technical Context

**Language/Version**: JavaScript ES2022+ / Node.js v24 LTS
**Primary Dependencies**: Node.js built-in `http` module, existing better-sqlite3 ^11.0.0 (via src/database.js)
**Storage**: SQLite with existing schema from src/database.js (TEXT id as primary key, includes thread_id)
**Testing**: Node.js built-in test runner (node --test) - matching existing project setup
**Target Platform**: macOS (local development), Linux server (deployment)
**Project Type**: Single project (extends existing gmail-imap-monitor application)
**Performance Goals**: <500ms per webhook request, handle 10+ concurrent requests
**Constraints**: <200ms p95 for typical payloads (<100KB), must handle up to 1MB payloads, 24+ hour uptime
**Scale/Scope**: Single webhook endpoint, idempotent storage, basic error handling and logging

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: ✓ PASS (No project constitution defined - using best practices)

Since no project constitution is defined (.specify/memory/constitution.md contains only template), this feature follows Node.js and project conventions:
- Reuses existing database.js module (user requirement)
- Single project structure matching existing codebase (src/, tests/)
- Node.js built-in test runner matching package.json configuration
- ES2022+ modules matching existing code style

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── config.js              # Existing - Configuration loader
├── database.js            # Existing - SQLite operations (REUSED)
├── email-processor.js     # Existing - Email parsing
├── imap-client.js         # Existing - IMAP connection
├── imap-monitor.js        # Existing - IMAP monitoring service
├── logger.js              # Existing - Logging utility
├── state-manager.js       # Existing - State management
├── tunnel.js              # Existing - Localtunnel service
└── webhook-server.js      # NEW - Webhook HTTP server (this feature)

tests/
└── webhook-server.test.js # NEW - Webhook server tests (this feature)
```

**Structure Decision**: Single project structure (Option 1) matching existing codebase. New files:
- `src/webhook-server.js`: Main webhook server implementation with HTTP request handling, JSON validation, and database integration
- `tests/webhook-server.test.js`: Unit and integration tests for webhook endpoints and error handling

This follows the existing flat structure in `src/` where each service has its own entry point file.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

N/A - No constitution violations. This feature follows existing project conventions.
