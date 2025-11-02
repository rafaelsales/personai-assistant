/**
 * Database operations for email storage
 * Uses better-sqlite3 for synchronous SQLite operations
 */

import Database from 'better-sqlite3';
import { dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';

/**
 * Check if database needs migration from old schema
 * @param {Database} db - Database instance
 * @returns {boolean} - True if migration needed
 */
function needsMigration(db) {
  try {
    // Check if emails table exists
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='emails'"
    ).get();

    if (!tableExists) {
      return false; // No table exists, will create new schema
    }

    // Get table schema info
    const tableInfo = db.prepare('PRAGMA table_info(emails)').all();

    // Check if id column is INTEGER (old schema)
    const idColumn = tableInfo.find(col => col.name === 'id');
    const hasThreadId = tableInfo.some(col => col.name === 'thread_id');

    // Migration needed if id is INTEGER and thread_id doesn't exist
    return idColumn && idColumn.type === 'INTEGER' && !hasThreadId;
  } catch (error) {
    console.error('Error checking migration status:', error.message);
    return false;
  }
}

/**
 * Migrate database schema from old to new format
 * @param {Database} db - Database instance
 */
function migrateSchema(db) {
  console.log('[Migration] Starting schema migration...');
  const startTime = Date.now();

  try {
    // Get count of old records for validation
    const oldCount = db.prepare('SELECT COUNT(*) as count FROM emails').get().count;
    console.log(`[Migration] Found ${oldCount} records to migrate`);

    // Execute migration in a transaction
    db.exec(`
      BEGIN TRANSACTION;

      -- Create new table with updated schema
      CREATE TABLE emails_new (
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

      -- Copy data from old table (convert integer id to text, add empty thread_id)
      INSERT INTO emails_new
      SELECT
        CAST(id AS TEXT) as id,
        '' as thread_id,
        received_at,
        downloaded_at,
        from_address,
        to_address,
        cc_address,
        subject,
        labels,
        body
      FROM emails;

      COMMIT;
    `);

    // Validate migration - check row counts match
    const newCount = db.prepare('SELECT COUNT(*) as count FROM emails_new').get().count;

    if (oldCount !== newCount) {
      throw new Error(`Migration validation failed: old count (${oldCount}) != new count (${newCount})`);
    }

    console.log(`[Migration] Validation passed: ${newCount} records migrated successfully`);

    // Drop old table and rename new table
    db.exec(`
      BEGIN TRANSACTION;
      DROP TABLE emails;
      ALTER TABLE emails_new RENAME TO emails;
      COMMIT;
    `);

    // Recreate indexes on new table
    db.exec(`
      CREATE INDEX idx_downloaded_at ON emails(downloaded_at);
      CREATE INDEX idx_from_address ON emails(from_address);
      CREATE INDEX idx_thread_id ON emails(thread_id);
    `);

    const duration = Date.now() - startTime;
    console.log(`[Migration] Schema migration completed successfully in ${duration}ms`);
  } catch (error) {
    console.error('[Migration] Migration failed:', error.message);
    // Try to rollback if possible
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      // Rollback may fail if transaction already committed/aborted
    }
    throw new Error(`Schema migration failed: ${error.message}`);
  }
}

/**
 * Initialize SQLite database with schema and indexes
 * @param {string} dbPath - Absolute path to SQLite database file
 * @returns {Database} - Database instance
 */
export function initDatabase(dbPath) {
  try {
    // Ensure parent directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Open database connection
    const db = new Database(dbPath);

    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    // Check if migration is needed
    if (needsMigration(db)) {
      console.log('[Database] Old schema detected, running migration...');
      migrateSchema(db);
    }

    // Create emails table with new schema if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS emails (
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
      )
    `);

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_downloaded_at ON emails(downloaded_at);
      CREATE INDEX IF NOT EXISTS idx_from_address ON emails(from_address);
      CREATE INDEX IF NOT EXISTS idx_thread_id ON emails(thread_id);
    `);

    return db;
  } catch (error) {
    throw new Error(`Database initialization failed: ${error.message}`);
  }
}

/**
 * Store email in database with duplicate prevention
 * @param {Database} db - Database instance
 * @param {Object} email - Email record object
 * @returns {boolean} - true if stored, false if duplicate
 */
export function storeEmail(db, email) {
  try {
    // Check for duplicate id (works with TEXT id)
    const exists = db.prepare('SELECT 1 FROM emails WHERE id = ?').get(email.id);
    if (exists) {
      return false; // Skip duplicate
    }

    // Insert email with new schema (includes thread_id)
    const stmt = db.prepare(`
      INSERT INTO emails (
        id, thread_id, received_at, downloaded_at,
        from_address, to_address, cc_address, subject, labels, body
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      email.id,
      email.thread_id || '',
      email.received_at,
      email.downloaded_at,
      email.from_address,
      email.to_address,
      email.cc_address,
      email.subject,
      email.labels,
      email.body
    );

    return true;
  } catch (error) {
    throw new Error(`Email insertion failed: ${error.message}`);
  }
}

/**
 * Retrieve email by id
 * @param {Database} db - Database instance
 * @param {string} id - Email id (text)
 * @returns {Object|null} - Email object or null
 */
export function getEmailById(db, id) {
  try {
    const stmt = db.prepare('SELECT * FROM emails WHERE id = ?');
    return stmt.get(id) || null;
  } catch (error) {
    throw new Error(`Email query failed: ${error.message}`);
  }
}

/**
 * Get all emails in a thread
 * @param {Database} db - Database instance
 * @param {string} threadId - Gmail thread ID
 * @returns {Array} - Array of email objects in chronological order
 */
export function getEmailsByThread(db, threadId) {
  try {
    const stmt = db.prepare(`
      SELECT * FROM emails
      WHERE thread_id = ? AND thread_id != ''
      ORDER BY received_at
    `);
    return stmt.all(threadId);
  } catch (error) {
    throw new Error(`Thread query failed: ${error.message}`);
  }
}

/**
 * Count total emails in database
 * @param {Database} db - Database instance
 * @returns {number} - Total email count
 */
export function countEmails(db) {
  try {
    const result = db.prepare('SELECT COUNT(*) as count FROM emails').get();
    return result.count;
  } catch (error) {
    throw new Error(`Email count failed: ${error.message}`);
  }
}

/**
 * Get recent emails in chronological order
 * @param {Database} db - Database instance
 * @param {number} limit - Maximum number of emails to retrieve
 * @returns {Array} - Array of email objects
 */
export function getRecentEmails(db, limit = 100) {
  try {
    const stmt = db.prepare(`
      SELECT id, from_address, subject, downloaded_at
      FROM emails
      ORDER BY downloaded_at DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  } catch (error) {
    throw new Error(`Recent emails query failed: ${error.message}`);
  }
}

/**
 * Gracefully close database connection
 * @param {Database} db - Database instance
 */
export function closeDatabase(db) {
  try {
    db.close();
  } catch (error) {
    console.warn(`Database close warning: ${error.message}`);
  }
}
