/**
 * Configuration loader and validator
 * Loads environment variables and provides validated configuration
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load .env file from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

dotenv.config({ path: resolve(projectRoot, '.env') });

/**
 * Validates required environment variables
 * @throws {Error} if required variables are missing
 */
function validateConfig() {
  const required = ['GMAIL_USER', 'GMAIL_APP_PASSWORD'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Validate configuration on load
validateConfig();

/**
 * Application configuration object
 */
export const config = {
  gmail: {
    user: process.env.GMAIL_USER,
    password: process.env.GMAIL_APP_PASSWORD,
  },

  imap: {
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    tls: process.env.IMAP_TLS !== 'false', // Default true
  },

  database: {
    path: process.env.DB_PATH || './data/emails.db',
  },

  state: {
    path: process.env.STATE_FILE_PATH || './data/current_state.json',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info', // error, warn, info, debug
  },
};

export default config;
