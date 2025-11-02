/**
 * Webhook Server for Google Sheets Email Data
 *
 * Receives email data from Google Apps Script (gmail-to-sheet.gs)
 * and stores it in SQLite database with idempotent behavior.
 *
 * Usage: npm run webhook-server
 *
 * API Endpoints:
 *
 * POST /webhook
 *   Receives email data and stores in database.
 *   Content-Type: application/json
 *   Payload format:
 *   {
 *     "id": "string (Gmail message ID, required)",
 *     "thread_id": "string (Gmail thread ID, required)",
 *     "received_at": "string (timestamp, required)",
 *     "downloaded_at": "string (timestamp, required)",
 *     "broadcasted_at": "string (timestamp, optional)",
 *     "from_address": "string (email address, required)",
 *     "to_address": "string (email address, required)",
 *     "cc_address": "string (email address, optional)",
 *     "subject": "string (email subject, required)",
 *     "labels": "string (Gmail labels, required)",
 *     "body": "string (email body, required)"
 *   }
 *   Response 200 OK: { "status": "success", "action": "stored"|"skipped", "id": "..." }
 *   Response 400 Bad Request: { "status": "error", "message": "...", "code": "..." }
 *   Response 500 Internal Server Error: { "status": "error", "message": "...", "code": "..." }
 *
 * GET /health
 *   Health check endpoint for monitoring.
 *   Response 200 OK: { "status": "healthy"|"degraded", "uptime": 123, "port": 8455, "database": "connected"|"disconnected", "timestamp": "..." }
 */

import http from 'http';
import { initDatabase, storeEmail } from './database.js';
import { logger } from './logger.js';

// Configuration
const PORT = 8455;
const DB_PATH = './data/emails.db';
const MAX_PAYLOAD_SIZE = 1048576; // 1MB in bytes

// T002: Correlation ID generator for request tracing
function generateCorrelationId() {
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// T003: Validation constants for required fields
const REQUIRED_FIELDS = [
  'id',
  'thread_id',
  'received_at',
  'downloaded_at',
  'from_address',
  'subject',
  'body'
];

// Server start time for uptime calculation (T023)
const SERVER_START_TIME = Date.now();

// Initialize database connection
let db;
try {
  db = initDatabase(DB_PATH);
  logger.info('Database initialized', { path: DB_PATH });
} catch (error) {
  logger.error('Database initialization failed', { error: error.message });
  process.exit(1);
}

// T009: Validate payload has all required fields
function validatePayload(payload) {
  const missingFields = REQUIRED_FIELDS.filter(field => {
    return !payload.hasOwnProperty(field) ||
           payload[field] === null ||
           payload[field] === undefined ||
           (typeof payload[field] === 'string' && payload[field].trim() === '');
  });

  if (missingFields.length > 0) {
    return {
      valid: false,
      message: `Missing required fields: ${missingFields.join(', ')}`,
      code: 'VALIDATION_ERROR'
    };
  }

  // Type validation - all fields must be strings
  for (const field of REQUIRED_FIELDS) {
    if (typeof payload[field] !== 'string') {
      return {
        valid: false,
        message: `Field '${field}' must be a string, got ${typeof payload[field]}`,
        code: 'VALIDATION_ERROR'
      };
    }
  }

  return { valid: true };
}

// T011: Format success response
function formatSuccessResponse(messageId, action) {
  return {
    status: 'success',
    action: action, // 'stored' or 'skipped'
    id: messageId
  };
}

// T017: Format validation error response
function formatErrorResponse(message, code) {
  return {
    status: 'error',
    message: message,
    code: code
  };
}

// T007: Parse JSON request body
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;

    req.on('data', chunk => {
      size += chunk.length;

      // T018: Check payload size limit (1MB max)
      if (size > MAX_PAYLOAD_SIZE) {
        reject({
          message: 'Payload too large (max 1MB)',
          code: 'PAYLOAD_TOO_LARGE',
          statusCode: 400
        });
        return;
      }

      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        resolve(parsed);
      } catch (error) {
        // T016: Handle JSON parse errors
        reject({
          message: 'Invalid JSON in request body',
          code: 'INVALID_JSON',
          statusCode: 400
        });
      }
    });

    req.on('error', error => {
      reject({
        message: 'Request error',
        code: 'REQUEST_ERROR',
        statusCode: 400
      });
    });
  });
}

// T008: POST /webhook route handler
async function handleWebhookPost(req, res, correlationId) {
  const startTime = Date.now();
  let messageId = null;

  try {
    // T036: Validate Content-Type
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      logger.warn('Invalid Content-Type', { correlationId, contentType });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatErrorResponse(
        'Content-Type must be application/json',
        'INVALID_CONTENT_TYPE'
      )));
      return;
    }

    // Parse request body
    let payload;
    try {
      payload = await parseRequestBody(req);
      messageId = payload.id || null;
    } catch (parseError) {
      // T016: Handle JSON parse errors and T018: payload size errors
      logger.warn('Request parsing failed', {
        correlationId,
        error: parseError.message,
        code: parseError.code
      });

      res.writeHead(parseError.statusCode || 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatErrorResponse(parseError.message, parseError.code)));

      const latency = Date.now() - startTime;
      logger.info('Response sent', { correlationId, statusCode: parseError.statusCode || 400, latencyMs: latency });
      return;
    }

    // T012: Log request
    logger.info('Request received', {
      method: 'POST',
      path: '/webhook',
      correlationId,
      messageId
    });

    // T009: Validate payload
    const validation = validatePayload(payload);
    if (!validation.valid) {
      logger.warn('Validation failed', {
        correlationId,
        messageId,
        error: validation.message
      });

      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatErrorResponse(validation.message, validation.code)));

      // T013: Log response
      const latency = Date.now() - startTime;
      logger.info('Response sent', { correlationId, statusCode: 400, latencyMs: latency });
      return;
    }

    // T010: Store email in database
    let wasStored;
    try {
      wasStored = storeEmail(db, payload);
    } catch (error) {
      // T014: Handle duplicate message IDs (UNIQUE constraint errors)
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        wasStored = false; // Treat as duplicate
      } else {
        // T019: Handle other database errors
        throw error;
      }
    }

    const action = wasStored ? 'stored' : 'skipped';

    logger.info(wasStored ? 'Email stored' : 'Email skipped (duplicate)', {
      correlationId,
      messageId,
      action
    });

    // T011: Send success response
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(formatSuccessResponse(messageId, action)));

    // T013: Log response
    const latency = Date.now() - startTime;
    logger.info('Response sent', { correlationId, statusCode: 200, latencyMs: latency });

  } catch (error) {
    // T019: Database error handling
    // T020: Error logging with full details
    logger.error('Database operation failed', {
      correlationId,
      messageId,
      error: error.message,
      stack: error.stack
    });

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(formatErrorResponse(
      'Database operation failed',
      'DATABASE_ERROR'
    )));

    const latency = Date.now() - startTime;
    logger.info('Response sent', { correlationId, statusCode: 500, latencyMs: latency });
  }
}

// T024: GET /health route handler
function handleHealthGet(req, res, correlationId) {
  const uptime = Math.floor((Date.now() - SERVER_START_TIME) / 1000); // seconds

  // T025: Check database connection
  let databaseStatus = 'connected';
  let overallStatus = 'healthy';

  try {
    // Simple check: try to count emails
    db.prepare('SELECT COUNT(*) FROM emails').get();
  } catch (error) {
    // T027: Handle degraded state (database disconnected)
    databaseStatus = 'disconnected';
    overallStatus = 'degraded';
    logger.warn('Health check: database disconnected', { correlationId, error: error.message });
  }

  // T026: Format health response
  const healthResponse = {
    status: overallStatus,
    uptime: uptime,
    port: PORT,
    database: databaseStatus,
    timestamp: new Date().toISOString()
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(healthResponse));

  logger.info('Health check', { correlationId, status: overallStatus, uptime });
}

// T034: 404 Not Found handler for unknown routes
function handle404(req, res, correlationId) {
  logger.warn('Endpoint not found', { correlationId, path: req.url });

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(formatErrorResponse(
    `Endpoint not found: ${req.url}`,
    'NOT_FOUND'
  )));
}

// T035: 405 Method Not Allowed handler
function handle405(req, res, correlationId, allowedMethods) {
  logger.warn('Method not allowed', { correlationId, method: req.method, path: req.url });

  res.writeHead(405, {
    'Content-Type': 'application/json',
    'Allow': allowedMethods
  });
  res.end(JSON.stringify(formatErrorResponse(
    `Method ${req.method} not allowed for ${req.url}`,
    'METHOD_NOT_ALLOWED'
  )));
}

// T004: Create HTTP server
const server = http.createServer(async (req, res) => {
  const correlationId = generateCorrelationId();

  // T021: Request error boundary - wrap all request handling in try-catch
  try {
    // Route handling
    if (req.url === '/webhook' || req.url === '/webhook/') {
      if (req.method === 'POST') {
        await handleWebhookPost(req, res, correlationId);
      } else {
        handle405(req, res, correlationId, 'POST');
      }
    } else if (req.url === '/health' || req.url === '/health/') {
      if (req.method === 'GET') {
        handleHealthGet(req, res, correlationId);
      } else {
        handle405(req, res, correlationId, 'GET');
      }
    } else {
      handle404(req, res, correlationId);
    }
  } catch (error) {
    // T020: Unexpected error logging
    // T022: Ensure server continues after individual request errors
    logger.error('Unexpected request error', {
      correlationId,
      error: error.message,
      stack: error.stack
    });

    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatErrorResponse(
        'Internal server error',
        'INTERNAL_ERROR'
      )));
    }
  }
});

// T028: Graceful shutdown on SIGTERM
process.on('SIGTERM', () => {
  logger.info('Shutdown signal received (SIGTERM)');
  shutdown();
});

// T029: Graceful shutdown on SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  logger.info('Shutdown signal received (SIGINT)');
  shutdown();
});

// T030-T033: Graceful shutdown handler
function shutdown() {
  logger.info('Stopping HTTP server');

  // T030: Close HTTP server (stop accepting new requests)
  server.close(() => {
    logger.info('HTTP server closed');

    // T032: Close database connection
    try {
      db.close();
      logger.info('Database connection closed');
    } catch (error) {
      logger.warn('Database close warning', { error: error.message });
    }

    // T033: Log shutdown completion
    logger.info('Shutdown complete');
    process.exit(0);
  });

  // T031: Wait for in-flight requests (max 5 second timeout)
  setTimeout(() => {
    logger.warn('Forcing shutdown after timeout');
    try {
      db.close();
    } catch (error) {
      // Ignore
    }
    process.exit(1);
  }, 5000);
}

// Start server
server.listen(PORT, () => {
  // T015: Startup logging
  logger.info('Webhook server starting', {
    port: PORT,
    databasePath: DB_PATH
  });
  logger.info(`Webhook server listening on port ${PORT}`);
  logger.info(`Endpoints: POST /webhook, GET /health`);
});
