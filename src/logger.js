/**
 * Structured logger utility
 * Outputs JSON format with ISO 8601 timestamps
 */

/**
 * Log levels
 */
const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
};

/**
 * Current log level from environment (default: INFO)
 */
let currentLogLevel = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';

/**
 * Log level priorities for filtering
 */
const LEVEL_PRIORITY = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

/**
 * Check if message should be logged based on level
 * @private
 * @param {string} level - Message log level
 * @returns {boolean} - Whether to log
 */
function shouldLog(level) {
  const messagePriority = LEVEL_PRIORITY[level] ?? LEVEL_PRIORITY.INFO;
  const currentPriority = LEVEL_PRIORITY[currentLogLevel] ?? LEVEL_PRIORITY.INFO;
  return messagePriority <= currentPriority;
}

/**
 * Format log entry as JSON
 * @private
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} meta - Additional metadata
 * @returns {string} - JSON string
 */
function formatLog(level, message, meta = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  return JSON.stringify(logEntry);
}

/**
 * Logger object with level methods
 */
export const logger = {
  /**
   * Log error message
   * @param {string} message - Error message
   * @param {Object} meta - Additional metadata
   */
  error(message, meta = {}) {
    if (shouldLog(LOG_LEVELS.ERROR)) {
      console.error(formatLog(LOG_LEVELS.ERROR, message, meta));
    }
  },

  /**
   * Log warning message
   * @param {string} message - Warning message
   * @param {Object} meta - Additional metadata
   */
  warn(message, meta = {}) {
    if (shouldLog(LOG_LEVELS.WARN)) {
      console.warn(formatLog(LOG_LEVELS.WARN, message, meta));
    }
  },

  /**
   * Log info message
   * @param {string} message - Info message
   * @param {Object} meta - Additional metadata
   */
  info(message, meta = {}) {
    if (shouldLog(LOG_LEVELS.INFO)) {
      console.log(formatLog(LOG_LEVELS.INFO, message, meta));
    }
  },

  /**
   * Log debug message
   * @param {string} message - Debug message
   * @param {Object} meta - Additional metadata
   */
  debug(message, meta = {}) {
    if (shouldLog(LOG_LEVELS.DEBUG)) {
      console.log(formatLog(LOG_LEVELS.DEBUG, message, meta));
    }
  },

  /**
   * Set log level dynamically
   * @param {string} level - New log level (ERROR, WARN, INFO, DEBUG)
   */
  setLevel(level) {
    const upperLevel = level?.toUpperCase();
    if (LEVEL_PRIORITY[upperLevel] !== undefined) {
      currentLogLevel = upperLevel;
    }
  },
};

export default logger;
