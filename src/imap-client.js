/**
 * IMAP connection manager
 * Handles connection, IDLE monitoring, and reconnection
 */

import Imap from 'imap';
import { EventEmitter } from 'events';
import { logger } from './logger.js';

/**
 * IMAP Client wrapper
 * Extends EventEmitter to emit 'mail', 'error', 'end' events
 */
export class ImapClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.imap = null;
    this.isConnected = false;
    this.isReconnecting = false;
  }

  /**
   * Connect to IMAP server and open INBOX
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        // Create IMAP connection
        this.imap = new Imap({
          user: this.config.gmail.user,
          password: this.config.gmail.password,
          host: this.config.imap.host,
          port: this.config.imap.port,
          tls: this.config.imap.tls,
          tlsOptions: {
            rejectUnauthorized: false, // For self-signed certs in dev
          },
        });

        // Connection ready
        this.imap.once('ready', () => {
          logger.info('IMAP connection established', {
            host: this.config.imap.host,
            user: this.config.gmail.user,
          });
          this.isConnected = true;
          this.openInbox()
            .then(() => resolve())
            .catch(reject);
        });

        // Connection error
        this.imap.once('error', (err) => {
          logger.error('IMAP connection error', { error: err.message });
          this.isConnected = false;
          this.emit('error', err);
          reject(err);
        });

        // Connection ended
        this.imap.once('end', () => {
          logger.warn('IMAP connection ended');
          this.isConnected = false;
          this.emit('end');
        });

        // Initiate connection
        this.imap.connect();
      } catch (error) {
        logger.error('IMAP connect failed', { error: error.message });
        reject(error);
      }
    });
  }

  /**
   * Open INBOX folder
   * @returns {Promise<void>}
   */
  async openInbox() {
    return new Promise((resolve, reject) => {
      this.imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          logger.error('Failed to open INBOX', { error: err.message });
          return reject(err);
        }
        logger.info('INBOX opened', { messages: box.messages.total });
        resolve();
      });
    });
  }

  /**
   * Start IDLE monitoring for new emails
   */
  startIDLE() {
    if (!this.imap || !this.isConnected) {
      throw new Error('Cannot start IDLE: not connected');
    }

    // Listen for new mail
    this.imap.on('mail', (numNewMsgs) => {
      logger.debug('New mail notification', { count: numNewMsgs });
      this.emit('mail', numNewMsgs);
    });

    logger.info('IDLE activated - monitoring for new emails');
  }

  /**
   * Search for emails by criteria
   * @param {Array} criteria - IMAP search criteria
   * @returns {Promise<Array<number>>} - Array of UIDs
   */
  async search(criteria) {
    return new Promise((resolve, reject) => {
      this.imap.search(criteria, (err, uids) => {
        if (err) {
          return reject(err);
        }
        resolve(uids || []);
      });
    });
  }

  /**
   * Fetch email by id
   * @param {number} id - Email id
   * @returns {Promise<Object>} - Email data
   */
  async fetchEmail(id) {
    return new Promise((resolve, reject) => {
      const fetch = this.imap.fetch([id], {
        bodies: ['HEADER.FIELDS (FROM TO CC SUBJECT DATE)', 'TEXT'],
        struct: true,
      });

      let emailData = {};

      fetch.on('message', (msg) => {
        msg.on('body', (stream, info) => {
          let buffer = '';
          stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
          });
          stream.once('end', () => {
            if (info.which === 'TEXT') {
              emailData.body = buffer;
            } else {
              emailData.headers = buffer;
            }
          });
        });

        msg.once('attributes', (attrs) => {
          emailData.attrs = attrs;
          emailData.id = attrs.id;
        });
      });

      fetch.once('error', (err) => {
        reject(err);
      });

      fetch.once('end', () => {
        resolve(emailData);
      });
    });
  }

  /**
   * Disconnect from IMAP server
   */
  disconnect() {
    if (this.imap) {
      this.imap.end();
      this.isConnected = false;
      logger.info('IMAP connection closed');
    }
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isReady() {
    return this.isConnected && this.imap !== null;
  }
}

export default ImapClient;
