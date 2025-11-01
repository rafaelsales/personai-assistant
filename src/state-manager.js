/**
 * State manager for connection state persistence
 * Manages current_state.json with atomic writes
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { dirname } from 'path';

/**
 * Initial state structure
 */
const INITIAL_STATE = {
  last_uid: 0,
  last_uid_received_at: '1970-01-01T00:00:00.000Z',
  last_connected_at: '1970-01-01T00:00:00.000Z',
  last_error: null,
  connection_status: 'disconnected',
};

/**
 * Initialize or load connection state from file
 * @param {string} stateFilePath - Absolute path to state JSON file
 * @returns {Object} - Connection state object
 */
export function initState(stateFilePath) {
  try {
    // Ensure parent directory exists
    const dir = dirname(stateFilePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // If file exists, load and validate
    if (existsSync(stateFilePath)) {
      const state = readState(stateFilePath);
      return state;
    }

    // Create initial state
    const state = { ...INITIAL_STATE };
    writeStateAtomic(stateFilePath, state);
    return state;
  } catch (error) {
    throw new Error(`State initialization failed: ${error.message}`);
  }
}

/**
 * Read current state from file
 * @param {string} stateFilePath - Path to state JSON file
 * @returns {Object} - Connection state object
 */
export function readState(stateFilePath) {
  try {
    const data = readFileSync(stateFilePath, 'utf8');
    const state = JSON.parse(data);
    validateState(state);
    return state;
  } catch (error) {
    throw new Error(`State read failed: ${error.message}`);
  }
}

/**
 * Update state file with new values (atomic write)
 * @param {string} stateFilePath - Path to state JSON file
 * @param {Object} updates - Partial state updates
 * @returns {Object} - Updated state object
 */
export function updateState(stateFilePath, updates) {
  try {
    const currentState = readState(stateFilePath);
    const newState = { ...currentState, ...updates };
    validateState(newState);
    writeStateAtomic(stateFilePath, newState);
    return newState;
  } catch (error) {
    throw new Error(`State update failed: ${error.message}`);
  }
}

/**
 * Validate state object structure and types
 * @param {Object} state - State object to validate
 * @returns {Object} - Validated state
 * @throws {Error} if validation fails
 */
export function validateState(state) {
  // Check required fields
  const required = ['last_uid', 'last_uid_received_at', 'last_connected_at', 'last_error', 'connection_status'];
  for (const field of required) {
    if (!(field in state)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Validate types
  if (!Number.isInteger(state.last_uid) || state.last_uid < 0) {
    throw new Error('last_uid must be a non-negative integer');
  }

  // Validate connection_status enum
  const validStatuses = ['connected', 'reconnecting', 'disconnected'];
  if (!validStatuses.includes(state.connection_status)) {
    throw new Error(`connection_status must be one of: ${validStatuses.join(', ')}`);
  }

  // Validate date strings (basic check)
  if (!state.last_uid_received_at || typeof state.last_uid_received_at !== 'string') {
    throw new Error('last_uid_received_at must be a valid ISO 8601 string');
  }
  if (!state.last_connected_at || typeof state.last_connected_at !== 'string') {
    throw new Error('last_connected_at must be a valid ISO 8601 string');
  }

  // Validate last_error (string or null)
  if (state.last_error !== null && typeof state.last_error !== 'string') {
    throw new Error('last_error must be a string or null');
  }

  return state;
}

/**
 * Clear last error (convenience function)
 * @param {string} stateFilePath - Path to state JSON file
 * @returns {Object} - Updated state
 */
export function clearError(stateFilePath) {
  return updateState(stateFilePath, { last_error: null });
}

/**
 * Atomic write to state file (temp file + rename)
 * @private
 * @param {string} stateFilePath - Path to state JSON file
 * @param {Object} state - State object to write
 */
function writeStateAtomic(stateFilePath, state) {
  const tempPath = `${stateFilePath}.tmp`;
  const json = JSON.stringify(state, null, 2);

  try {
    writeFileSync(tempPath, json, 'utf8');
    renameSync(tempPath, stateFilePath); // Atomic on POSIX
  } catch (error) {
    // Clean up temp file if exists
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {}
    throw error;
  }
}
