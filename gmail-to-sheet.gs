/**
 * Gmail to Google Sheet Integration
 *
 * This script fetches all unread emails from Gmail and appends them to the active Google Sheet.
 * The script processes emails in batches to handle large volumes efficiently.
 *
 * Columns:
 * - id: Gmail message ID
 * - thread_id: Gmail message ID
 * - received_at: Date email was sent/received in Gmail
 * - downloaded_at: Timestamp when this script downloaded the email
 * - broadcasted_at: Timestamp when this script delivered the message to webhook endpoint
 * - from_address: Sender email address
 * - to_address: Recipient email addresses (comma-separated)
 * - cc_address: CC email addresses (comma-separated)
 * - subject: Email subject line
 * - labels: Gmail labels (comma-separated)
 * - body: Email body text (plain text preferred, falls back to HTML)
 *
 * Setup Instructions:
 * 1. Open your Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Replace the default code with this script
 * 4. Save the project
 * 5. Run the 'syncUnreadEmails' function
 * 6. Grant necessary permissions when prompted
 *
 * Optional: Set up a time-based trigger to run this automatically
 */

ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
const WEBHOOK_URL = 'https://rafael-personai-assistent.loca.lt/webhook';

/**
 * Main function to sync unread emails to the Google Sheet
 */
function syncUnreadEmails() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // Initialize sheet with headers if empty
  if (sheet.getLastRow() === 0) {
    const headers = [
      'id',
      'thread_id',
      'received_at',
      'downloaded_at',
      'broadcasted_at',
      'from_address',
      'to_address',
      'cc_address',
      'subject',
      'labels',
      'body'
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }

  // Get or create the "assistant-downloaded" label
  const labelName = 'assistant-downloaded';
  let assistantLabel;
  try {
    assistantLabel = GmailApp.getUserLabelByName(labelName);
    if (!assistantLabel) {
      assistantLabel = GmailApp.createLabel(labelName);
      Logger.log(`Created new label: ${labelName}`);
    }
  } catch (error) {
    Logger.log(`Error with label: ${error.message}`);
    throw new Error(`Failed to get or create label "${labelName}"`);
  }

  // Process unread emails without "assistant-downloaded" label
  const threads = GmailApp.search('is:unread -label:assistant-downloaded', 0, 500);
  let processedCount = 0;
  let errorCount = 0;

  Logger.log(`Found ${threads.length} unread threads without "${labelName}" label`);

  threads.forEach(thread => {
    const messages = thread.getMessages();
    let threadProcessedSuccessfully = true;

    messages.forEach(message => {
      const messageId = message.getId();

      try {
        const row = extractEmailData(message);
        sheet.appendRow(row);
        processedCount++;
      } catch (error) {
        Logger.log(`Error processing message ${messageId}: ${error.message}`);
        threadProcessedSuccessfully = false;
        errorCount++;
      }
    });

    // Add label to thread after all messages are processed successfully
    if (threadProcessedSuccessfully) {
      try {
        thread.addLabel(assistantLabel);
      } catch (error) {
        Logger.log(`Error adding label to thread: ${error.message}`);
      }
    }
  });

  Logger.log(`Sync complete: ${processedCount} emails added, ${errorCount} errors`);

  // Show completion message
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Synced ${processedCount} new unread emails and labeled them as "${labelName}".`,
    'Sync Complete',
    5
  );

  // Broadcast messages to external API
  if (processedCount > 0 || sheet.getLastRow() > 1) {
    Logger.log('Starting broadcast to external API...');
    broadcastMessages();
  }
}

/**
 * Extract email data into an array matching the column order
 * @param {GmailMessage} message - Gmail message object
 * @returns {Array} Row data array
 */
function extractEmailData(message) {
  const messageId = message.getId();
  const fromAddress = message.getFrom();
  const toAddress = message.getTo();
  const ccAddress = message.getCc() || '';
  const subject = message.getSubject();

  // Get plain text body, fall back to HTML if not available
  let body = message.getPlainBody();
  if (!body || body.trim() === '') {
    body = message.getBody();
    // Remove HTML tags for cleaner storage
    body = body.replace(/<[^>]*>/g, '');
  }

  // Truncate body if too long (Google Sheets cell limit is 50,000 characters)
  if (body.length > 50000) {
    body = body.substring(0, 49997) + '...';
  }

  const receivedAt = Utilities.formatDate(
    message.getDate(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm:ss'
  );

  // Get thread ID and labels
  const thread = message.getThread();
  const threadId = thread.getId();
  const labels = thread.getLabels().map(label => label.getName()).join(', ');

  const downloadedAt = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm:ss'
  );

  return [
    messageId,
    threadId,
    receivedAt,
    downloadedAt,
    '', // broadcasted_at - empty initially
    fromAddress,
    toAddress,
    ccAddress,
    subject,
    labels,
    body
  ];
}

/**
 * Broadcast messages to external API
 * Only broadcasts messages that haven't been broadcasted yet (broadcasted_at is empty)
 */
function broadcastMessages() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const WEBHOOK_URL = 'https://rafael-personai-assistent.loca.lt';
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 3000; // 3 seconds

  if (sheet.getLastRow() <= 1) {
    Logger.log('No messages to broadcast');
    return;
  }

  // Get all data from sheet
  const lastRow = sheet.getLastRow();
  const data = sheet.getRange(2, 1, lastRow - 1, 11).getValues(); // 11 columns including thread_id
  const headers = [
    'id',
    'thread_id',
    'received_at',
    'downloaded_at',
    'broadcasted_at',
    'from_address',
    'to_address',
    'cc_address',
    'subject',
    'labels',
    'body'
  ];

  let broadcastedCount = 0;
  let failedCount = 0;

  // Process each row
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNumber = i + 2; // +2 because: +1 for 0-index, +1 for header row
    const broadcastedAt = row[4]; // Column E (broadcasted_at)

    // Skip if already broadcasted
    if (broadcastedAt && broadcastedAt !== '') {
      continue;
    }

    // Build JSON payload
    const payload = {};
    headers.forEach((header, index) => {
      payload[header] = row[index] || '';
    });

    // Try to broadcast with retries
    const success = broadcastWithRetry(payload, WEBHOOK_URL, MAX_RETRIES, RETRY_DELAY_MS, rowNumber);

    if (success) {
      // Update broadcasted_at timestamp
      const timestamp = Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        'yyyy-MM-dd HH:mm:ss'
      );
      sheet.getRange(rowNumber, 5).setValue(timestamp); // Column E
      broadcastedCount++;
      Logger.log(`[Row ${rowNumber}] ✓ Broadcasted successfully`);
    } else {
      // Broadcasting failed after all retries - halt
      failedCount++;
      Logger.log(`[Row ${rowNumber}] ✗ Broadcasting failed after ${MAX_RETRIES} attempts. Halting broadcast.`);

      // Show error message and stop
      SpreadsheetApp.getActiveSpreadsheet().toast(
        `Broadcast halted at row ${rowNumber}. ${broadcastedCount} messages sent, 1 failed.`,
        'Broadcast Failed',
        10
      );
      return; // Halt broadcasting
    }
  }

  Logger.log(`Broadcast complete: ${broadcastedCount} messages sent successfully`);

  if (broadcastedCount > 0) {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Broadcasted ${broadcastedCount} messages to external API`,
      'Broadcast Complete',
      5
    );
  }
}

/**
 * Broadcast a single message with retry logic
 * @param {Object} payload - JSON payload to send
 * @param {string} url - Webhook URL
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} delayMs - Delay between retries in milliseconds
 * @param {number} rowNumber - Row number for logging
 * @returns {boolean} True if successful, false otherwise
 */
function broadcastWithRetry(payload, url, maxRetries, delayMs, rowNumber) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      Logger.log(`[Row ${rowNumber}] Attempt ${attempt}/${maxRetries}: Broadcasting to ${url}`);

      const options = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true // Don't throw exceptions on non-2xx responses
      };

      const response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();

      // Check if response is 2xx (success)
      if (responseCode >= 200 && responseCode < 300) {
        Logger.log(`[Row ${rowNumber}] Attempt ${attempt}/${maxRetries}: Success (${responseCode})`);
        return true;
      } else {
        Logger.log(`[Row ${rowNumber}] Attempt ${attempt}/${maxRetries}: Failed with status ${responseCode}`);
        Logger.log(`[Row ${rowNumber}] Response: ${response.getContentText()}`);
      }
    } catch (error) {
      Logger.log(`[Row ${rowNumber}] Attempt ${attempt}/${maxRetries}: Error - ${error.message}`);
    }

    // Wait before retrying (except on last attempt)
    if (attempt < maxRetries) {
      Logger.log(`[Row ${rowNumber}] Waiting ${delayMs}ms before retry...`);
      Utilities.sleep(delayMs);
    }
  }

  // All retries exhausted
  return false;
}

/**
 * Optional: Mark downloaded emails as read
 * Run this function separately if you want to mark all "assistant-downloaded" emails as read
 */
function markDownloadedEmailsAsRead() {
  const threads = GmailApp.search('is:unread label:assistant-downloaded');

  threads.forEach(thread => {
    thread.markRead();
  });

  Logger.log(`Marked ${threads.length} downloaded threads as read`);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Marked ${threads.length} downloaded emails as read`,
    'Mark as Read Complete',
    3
  );
}

/**
 * Create a time-based trigger to run the sync automatically
 * Run this once to set up automatic syncing every hour
 */
function createHourlyTrigger() {
  // Delete existing triggers first to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'syncUnreadEmails') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new hourly trigger
  ScriptApp.newTrigger('syncUnreadEmails')
    .timeBased()
    .everyHours(1)
    .create();

  Logger.log('Hourly trigger created successfully');
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Automatic sync will run every hour',
    'Trigger Created',
    3
  );
}

/**
 * Delete all time-based triggers for this script
 */
function deleteAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });

  Logger.log('All triggers deleted');
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'All automatic triggers removed',
    'Triggers Deleted',
    3
  );
}

