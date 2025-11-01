/**
 * Database operations for email storage
 * Uses better-sqlite3 for synchronous SQLite operations
 */

import Database from 'better-sqlite3';
import { dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';

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

    // Create emails table
    db.exec(`
      CREATE TABLE IF NOT EXISTS emails (
        uid INTEGER PRIMARY KEY NOT NULL,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        cc_address TEXT,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        original_date TEXT NOT NULL,
        labels TEXT NOT NULL,
        received_at TEXT NOT NULL
      )
    `);

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_received_at ON emails(received_at);
      CREATE INDEX IF NOT EXISTS idx_from_address ON emails(from_address);
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
    // Check for duplicate UID
    const exists = db.prepare('SELECT 1 FROM emails WHERE uid = ?').get(email.uid);
    if (exists) {
      return false; // Skip duplicate
    }

    // Insert email
    const stmt = db.prepare(`
      INSERT INTO emails (
        uid, from_address, to_address, cc_address, subject,
        body, original_date, labels, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      email.uid,
      email.from_address,
      email.to_address,
      email.cc_address,
      email.subject,
      email.body,
      email.original_date,
      email.labels,
      email.received_at
    );

    return true;
  } catch (error) {
    throw new Error(`Email insertion failed: ${error.message}`);
  }
}

/**
 * Retrieve email by UID
 * @param {Database} db - Database instance
 * @param {number} uid - Email UID
 * @returns {Object|null} - Email object or null
 */
export function getEmailByUid(db, uid) {
  try {
    const stmt = db.prepare('SELECT * FROM emails WHERE uid = ?');
    return stmt.get(uid) || null;
  } catch (error) {
    throw new Error(`Email query failed: ${error.message}`);
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
      SELECT uid, from_address, subject, received_at
      FROM emails
      ORDER BY received_at DESC
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
