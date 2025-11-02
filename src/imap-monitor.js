/**
 * Gmail IMAP Email Monitor - Main Entry Point
 * Maintains persistent IMAP connection and stores emails in SQLite
 */

import { config } from './config.js';
import { logger } from './logger.js';
import { initDatabase, closeDatabase } from './database.js';
import { initState } from './state-manager.js';
import { ImapClient } from './imap-client.js';
import { processEmail } from './email-processor.js';

/**
 * Global state
 */
let db = null;
let imapClient = null;
let isShuttingDown = false;

/**
 * Initialize application
 */
async function initialize() {
  try {
    logger.info('Starting Gmail IMAP Monitor');

    // Initialize database
    db = initDatabase(config.database.path);
    logger.info('Database initialized', { dbPath: config.database.path });

    // Initialize state
    const state = initState(config.state.path);
    logger.info('State initialized', {
      last_id: state.last_id,
      connection_status: state.connection_status,
    });

    // Create IMAP client
    imapClient = new ImapClient(config);

    // Setup event handlers
    setupEventHandlers();

    // Connect to IMAP
    logger.info('Connecting to IMAP', { host: config.imap.host });
    await imapClient.connect();

    // First run: Download last X unread emails
    if (state.last_id === 0) {
      await syncInitialUnreadEmails();
    }

    // Start IDLE monitoring
    imapClient.startIDLE();

    logger.info('Gmail IMAP Monitor started successfully');
  } catch (error) {
    logger.error('Initialization failed', { error: error.message, stack: error.stack });
    await gracefulShutdown(1);
  }
}

/**
 * Sync initial unread emails on first run
 */
async function syncInitialUnreadEmails() {
  try {
    const syncCount = config.initialSync.count;
    logger.info('First run: Syncing initial unread emails', { count: syncCount });

    // Search for unread emails
    const unreadIds = await imapClient.search(['UNSEEN']);

    if (unreadIds.length === 0) {
      logger.info('No unread emails found');
      return;
    }

    // Take only the last X unread emails
    const uidsToSync = unreadIds.slice(-syncCount);
    logger.info('Found unread emails', {
      total: unreadIds.length,
      syncing: uidsToSync.length,
    });

    // Process each email
    for (const id of uidsToSync) {
      try {
        await processEmail(imapClient, db, config.state.path, id);
      } catch (error) {
        logger.warn('Failed to sync initial email', { id, error: error.message });
      }
    }

    logger.info('Initial sync complete', { emailsSynced: uidsToSync.length });
  } catch (error) {
    logger.error('Initial sync failed', { error: error.message });
    // Don't throw - continue with monitoring even if initial sync fails
  }
}

/**
 * Setup IMAP event handlers
 */
function setupEventHandlers() {
  // New mail event
  imapClient.on('mail', async (numNewMsgs) => {
    if (isShuttingDown) return;

    logger.debug('New mail event', { count: numNewMsgs });

    try {
      // Search for all messages in INBOX
      const uids = await imapClient.search(['ALL']);

      // Get current last_id from state to find new emails
      const { readState } = await import('./state-manager.js');
      const state = readState(config.state.path);
      const lastId = state.last_id;

      // Filter for UIDs greater than last processed
      const newIds = uids.filter(id => id > lastId);

      if (newIds.length === 0) {
        logger.debug('No new emails to process');
        return;
      }

      logger.info('Processing new emails', { count: newIds.length });

      // Process each new email
      for (const id of newIds) {
        try {
          await processEmail(imapClient, db, config.state.path, id);
        } catch (error) {
          // Error already logged in processEmail, continue with next email (FR-014)
          logger.warn('Skipping email due to processing error', { id });
        }
      }
    } catch (error) {
      logger.error('Error handling new mail', { error: error.message });
    }
  });

  // Error event
  imapClient.on('error', (err) => {
    logger.error('IMAP error', { error: err.message });
    // Will be handled by reconnection logic in Phase 4
  });

  // Connection end event
  imapClient.on('end', () => {
    logger.warn('IMAP connection ended');
    // Will be handled by reconnection logic in Phase 4
  });
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('Initiating graceful shutdown');

  try {
    // Disconnect IMAP
    if (imapClient) {
      imapClient.disconnect();
    }

    // Close database
    if (db) {
      closeDatabase(db);
    }

    logger.info('Shutdown complete');
    process.exit(exitCode);
  } catch (error) {
    logger.error('Shutdown error', { error: error.message });
    process.exit(1);
  }
}

/**
 * Setup signal handlers for graceful shutdown
 */
process.on('SIGINT', () => {
  logger.info('Received SIGINT signal');
  gracefulShutdown(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal');
  gracefulShutdown(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  gracefulShutdown(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', { reason, promise });
  gracefulShutdown(1);
});

// Start the application
initialize().catch((error) => {
  logger.error('Fatal error during initialization', { error: error.message });
  process.exit(1);
});
