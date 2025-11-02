/**
 * Email processor
 * Handles email parsing, validation, and storage workflow
 */

import { simpleParser } from 'mailparser';
import { logger } from './logger.js';
import { storeEmail } from './database.js';
import { updateState } from './state-manager.js';

/**
 * Parse email headers from raw header string
 * @param {string} headerStr - Raw header string
 * @returns {Object} - Parsed headers
 */
export function parseHeaders(headerStr) {
  const headers = {};
  const lines = headerStr.split('\r\n');

  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      headers[key.toLowerCase()] = value.trim();
    }
  }

  return headers;
}

/**
 * Parse email body using mailparser
 * @param {string} bodyStr - Raw email body
 * @returns {Promise<Object>} - Parsed email data
 */
export async function parseBody(bodyStr) {
  try {
    const parsed = await simpleParser(bodyStr);
    return {
      text: parsed.text || '',
      html: parsed.html || '',
      subject: parsed.subject || '',
      from: parsed.from?.text || '',
      to: parsed.to?.text || '',
      cc: parsed.cc?.text || '',
      date: parsed.date || new Date(),
    };
  } catch (error) {
    logger.error('Email body parsing failed', { error: error.message });
    throw error;
  }
}

/**
 * Fetch and parse complete email
 * @param {ImapClient} imapClient - IMAP client instance
 * @param {number} id - Email id
 * @returns {Promise<Object>} - Parsed email record
 */
export async function fetchEmail(imapClient, id) {
  try {
    // Fetch raw email data from IMAP
    const emailData = await imapClient.fetchEmail(id);

    // Parse headers
    const headers = parseHeaders(emailData.headers || '');

    // Parse body (mailparser handles both plain and HTML)
    const fullEmail = `${emailData.headers}\r\n\r\n${emailData.body || ''}`;
    const parsed = await simpleParser(fullEmail);

    // Extract Gmail labels from IMAP attributes
    const labels = emailData.attrs?.['x-gm-labels'] || [];
    const labelsJson = JSON.stringify(Array.isArray(labels) ? labels : [labels]);

    // Extract Gmail thread ID from IMAP attributes (x-gm-thrid)
    const threadId = emailData.attrs?.['x-gm-thrid']
      ? String(emailData.attrs['x-gm-thrid'])
      : '';

    // Build email record with new schema
    // Field order: id, thread_id, received_at, downloaded_at, from_address, to_address, cc_address, subject, labels, body
    const emailRecord = {
      id: String(emailData.id), // Ensure text type
      thread_id: threadId,
      received_at: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
      downloaded_at: new Date().toISOString(),
      from_address: parsed.from?.text || headers.from || '',
      to_address: parsed.to?.text || headers.to || '',
      cc_address: parsed.cc?.text || headers.cc || null,
      subject: parsed.subject || headers.subject || '',
      labels: labelsJson,
      body: parsed.text || parsed.html || '',
    };

    return emailRecord;
  } catch (error) {
    logger.error('Email fetch failed', { id, error: error.message });
    throw error;
  }
}

/**
 * Validate email record per data-model.md rules
 * @param {Object} email - Email record object
 * @returns {Object} - Validated email record
 * @throws {Error} if validation fails
 */
export function validateEmailRecord(email) {
  // id validation - must be non-empty text
  if (!email.id || typeof email.id !== 'string') {
    throw new Error('id must be a non-empty string');
  }

  // thread_id validation - must be string (can be empty for migrated records)
  if (email.thread_id === null || email.thread_id === undefined) {
    email.thread_id = '';
  }
  if (typeof email.thread_id !== 'string') {
    throw new Error('thread_id must be a string');
  }

  // Required text fields
  if (!email.from_address || typeof email.from_address !== 'string') {
    throw new Error('from_address is required');
  }
  if (!email.to_address || typeof email.to_address !== 'string') {
    throw new Error('to_address is required');
  }

  // Subject and body can be empty strings but not null/undefined
  if (email.subject === null || email.subject === undefined) {
    email.subject = '';
  }
  if (email.body === null || email.body === undefined) {
    email.body = '';
  }

  // Labels must be valid JSON array
  if (email.labels) {
    try {
      const parsed = JSON.parse(email.labels);
      if (!Array.isArray(parsed)) {
        throw new Error('labels must be a JSON array');
      }
    } catch (e) {
      throw new Error('labels must be valid JSON array string');
    }
  } else {
    email.labels = '[]';
  }

  // Date validation (ISO 8601)
  if (!email.received_at || typeof email.received_at !== 'string') {
    throw new Error('received_at must be ISO 8601 format');
  }
  if (!email.downloaded_at || typeof email.downloaded_at !== 'string') {
    throw new Error('downloaded_at must be ISO 8601 format');
  }

  return email;
}

/**
 * Process email: parse → validate → store → update state
 * @param {ImapClient} imapClient - IMAP client instance
 * @param {Database} db - Database instance
 * @param {string} statePath - State file path
 * @param {number} id - Email id
 * @returns {Promise<boolean>} - true if processed successfully
 */
export async function processEmail(imapClient, db, statePath, id) {
  try {
    logger.debug('Processing email', { id });

    // Fetch and parse email
    const emailRecord = await fetchEmail(imapClient, id);

    // Validate email record
    validateEmailRecord(emailRecord);

    // Store in database (with duplicate prevention)
    const stored = storeEmail(db, emailRecord);

    if (!stored) {
      logger.warn('Duplicate email detected', { id });
      return false;
    }

    // Update state with new id
    updateState(statePath, {
      last_id: emailRecord.id,
      last_id_received_at: emailRecord.downloaded_at,
      last_error: null,
    });

    logger.info('Email processed successfully', {
      id: emailRecord.id,
      subject: emailRecord.subject,
      from: emailRecord.from_address,
    });

    return true;
  } catch (error) {
    logger.error('Email processing failed', { id, error: error.message });
    // Don't throw - graceful degradation (FR-014)
    return false;
  }
}
