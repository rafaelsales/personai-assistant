# API Contracts: Google Sheets Webhook Server

**Feature**: 003-gsheets-webhook
**Date**: 2025-11-01
**Phase**: 1 (Design & Contracts)

## Overview

This directory contains API contract definitions for the webhook server endpoints. The server exposes two HTTP endpoints:

1. **POST /webhook**: Receive email data from Google Apps Script
2. **GET /health**: Health check endpoint for monitoring

## Contract Files

- [webhook-api.md](./webhook-api.md): HTTP API contract for webhook endpoints
- [http-server-contract.md](./http-server-contract.md): Server lifecycle and behavior contract

## Testing Contracts

Contract tests should verify:
- Request/response schemas match specifications
- HTTP status codes are returned correctly
- Error responses include required fields
- Idempotency behavior (duplicate requests return success)
- Concurrent request handling

See [webhook-api.md](./webhook-api.md) for detailed contract test scenarios.
