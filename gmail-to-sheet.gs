/**
 * Gmail to Google Sheet Integration
 *
 * This script fetches all unread emails from Gmail and appends them to the active Google Sheet.
 * The script processes emails in batches to handle large volumes efficiently.
 *
 * Columns:
 * - id: Gmail message ID
 * - from_address: Sender email address
 * - to_address: Recipient email addresses (comma-separated)
 * - cc_address: CC email addresses (comma-separated)
 * - subject: Email subject line
 * - body: Email body text (plain text preferred, falls back to HTML)
 * - original_date: Date email was sent
 * - labels: Gmail labels (comma-separated)
 * - received_at: Timestamp when this script processed the email
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

/**
 * Main function to sync unread emails to the Google Sheet
 */
function syncUnreadEmails() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // Initialize sheet with headers if empty
  if (sheet.getLastRow() === 0) {
    const headers = [
      'id',
      'from_address',
      'to_address',
      'cc_address',
      'subject',
      'body',
      'original_date',
      'labels',
      'received_at'
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }

  // Get existing message IDs to avoid duplicates
  const existingIds = getExistingMessageIds(sheet);

  // Process unread emails
  const threads = GmailApp.search('is:unread', 0, 500); // Process up to 500 threads at a time
  let processedCount = 0;
  let skippedCount = 0;

  Logger.log(`Found ${threads.length} unread threads`);

  threads.forEach(thread => {
    const messages = thread.getMessages();

    messages.forEach(message => {
      const messageId = message.getId();

      // Skip if already in sheet
      if (existingIds.has(messageId)) {
        skippedCount++;
        return;
      }

      try {
        const row = extractEmailData(message);
        sheet.appendRow(row);
        processedCount++;
      } catch (error) {
        Logger.log(`Error processing message ${messageId}: ${error.message}`);
      }
    });
  });

  Logger.log(`Sync complete: ${processedCount} new emails added, ${skippedCount} skipped (already in sheet)`);

  // Show completion message
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Synced ${processedCount} new unread emails. ${skippedCount} already in sheet.`,
    'Sync Complete',
    5
  );
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

  const originalDate = Utilities.formatDate(
    message.getDate(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm:ss'
  );

  // Get thread labels
  const thread = message.getThread();
  const labels = thread.getLabels().map(label => label.getName()).join(', ');

  const receivedAt = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm:ss'
  );

  return [
    messageId,
    fromAddress,
    toAddress,
    ccAddress,
    subject,
    body,
    originalDate,
    labels,
    receivedAt
  ];
}

/**
 * Get existing message IDs from the sheet to avoid duplicates
 * @param {Sheet} sheet - Google Sheet object
 * @returns {Set} Set of existing message IDs
 */
function getExistingMessageIds(sheet) {
  const existingIds = new Set();

  if (sheet.getLastRow() <= 1) {
    return existingIds; // Empty sheet (only headers or nothing)
  }

  // Get all IDs from column A (id column)
  const idColumn = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  idColumn.forEach(row => {
    if (row[0]) {
      existingIds.add(row[0]);
    }
  });

  return existingIds;
}

/**
 * Optional: Mark synced emails as read
 * Run this function separately if you want to mark all unread emails as read after syncing
 */
function markUnreadEmailsAsRead() {
  const threads = GmailApp.search('is:unread');

  threads.forEach(thread => {
    thread.markRead();
  });

  Logger.log(`Marked ${threads.length} threads as read`);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Marked ${threads.length} emails as read`,
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

