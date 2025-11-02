# Quickstart Guide: Gmail IMAP Email Monitor

**Feature**: 001-gmail-imap-monitor
**Branch**: `001-gmail-imap-monitor`
**Date**: 2025-11-01

## Overview

This guide walks you through setting up and running the Gmail IMAP Email Monitor - a background service that maintains a persistent connection to Gmail, downloads new emails in real-time, and stores them locally in SQLite.

**Prerequisites**:
- macOS (Darwin)
- Node.js v24 LTS or higher
- Gmail account with IMAP enabled
- Gmail App Password (instructions below)

---

## Table of Contents

1. [Gmail Setup](#1-gmail-setup)
2. [Installation](#2-installation)
3. [Configuration](#3-configuration)
4. [Running the Monitor](#4-running-the-monitor)
5. [Monitoring Status](#5-monitoring-status)
6. [Querying Emails](#6-querying-emails)
7. [Troubleshooting](#7-troubleshooting)
8. [Stopping the Monitor](#8-stopping-the-monitor)

---

## 1. Gmail Setup

### Enable IMAP

1. Log in to Gmail
2. Click Settings (gear icon) → **See all settings**
3. Go to **Forwarding and POP/IMAP** tab
4. Under **IMAP access**, select **Enable IMAP**
5. Click **Save Changes**

### Generate App Password

**Important**: Use an App Password instead of your regular Gmail password.

1. Go to your Google Account: https://myaccount.google.com/
2. Navigate to **Security** → **2-Step Verification** (enable if not already)
3. Scroll down to **App passwords**
4. Click **App passwords**
5. Select **Mail** for app, **Mac** for device
6. Click **Generate**
7. **Copy the 16-character password** (shown without spaces)
8. Save this password securely - you'll need it for configuration

**Note**: If you don't see "App passwords", ensure 2-Step Verification is enabled first.

---

## 2. Installation

### Clone Repository

```bash
cd /path/to/your/projects
git clone <repository-url>
cd personai-assistant
git checkout 001-gmail-imap-monitor
```

### Install Dependencies

```bash
npm install
```

**Dependencies installed**:
- `imap` - IMAP client with IDLE support
- `better-sqlite3` - Fast SQLite library
- `mailparser` - Email content parsing
- `dotenv` - Environment variable management

### Verify Installation

```bash
node --version  # Should be v24.x or higher
npm list        # Verify dependencies installed
```

---

## 3. Configuration

### Create Environment File

Copy the example environment file:

```bash
cp .env.example .env
```

### Edit `.env` File

Open `.env` in your text editor and fill in your Gmail credentials:

```env
# Gmail Credentials
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-16-char-app-password

# IMAP Settings (defaults provided)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_TLS=true

# Storage Paths
DB_PATH=./data/emails.db
STATE_FILE_PATH=./data/current_state.json

# Logging
LOG_LEVEL=info  # Options: error, warn, info, debug
```

**Replace**:
- `your-email@gmail.com` with your Gmail address
- `your-16-char-app-password` with the App Password from step 1

**Security**: Add `.env` to `.gitignore` to prevent committing credentials.

### Create Data Directory

```bash
mkdir -p data
```

---

## 4. Running the Monitor

### Start the Monitor

```bash
npm start
```

**Expected output**:
```
{"timestamp":"2025-11-01T10:00:00.000Z","level":"INFO","message":"Starting Gmail IMAP Monitor"}
{"timestamp":"2025-11-01T10:00:01.234Z","level":"INFO","message":"Database initialized","dbPath":"./data/emails.db"}
{"timestamp":"2025-11-01T10:00:01.500Z","level":"INFO","message":"State initialized","last_id":0}
{"timestamp":"2025-11-01T10:00:02.000Z","level":"INFO","message":"Connecting to IMAP","host":"imap.gmail.com"}
{"timestamp":"2025-11-01T10:00:03.123Z","level":"INFO","message":"IMAP connected"}
{"timestamp":"2025-11-01T10:00:03.456Z","level":"INFO","message":"IDLE activated - monitoring for new emails"}
```

The monitor is now running and listening for new emails!

### Run in Background

For long-term operation, use a process manager:

**Option 1: Using `nohup`**
```bash
nohup npm start > logs/monitor.log 2>&1 &
echo $! > data/monitor.pid  # Save PID for stopping later
```

**Option 2: Using `pm2` (recommended)**
```bash
npm install -g pm2
pm2 start src/index.js --name gmail-monitor
pm2 save
pm2 startup  # Enable auto-start on system boot
```

**Option 3: Using macOS `launchd`** (system service)
```bash
# Create launch agent (example provided in docs/launchd/com.personai.gmail-monitor.plist)
cp docs/launchd/com.personai.gmail-monitor.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.personai.gmail-monitor.plist
```

---

## 5. Monitoring Status

### Check Connection State

```bash
cat data/current_state.json
```

**Example output**:
```json
{
  "last_id": 12345,
  "last_id_received_at": "2025-11-01T10:05:30.123Z",
  "last_connected_at": "2025-11-01T10:00:03.123Z",
  "last_error": null,
  "connection_status": "connected"
}
```

**Status Values**:
- `connected`: Actively monitoring for emails
- `reconnecting`: Attempting to reconnect after connection loss
- `disconnected`: Not connected (check `last_error` for reason)

### View Logs

**If running in foreground**: Logs appear in console

**If running with `nohup`**:
```bash
tail -f logs/monitor.log
```

**If running with `pm2`**:
```bash
pm2 logs gmail-monitor
pm2 logs gmail-monitor --lines 100  # Last 100 lines
```

### Monitor Real-Time

Send yourself a test email and watch it appear:

```bash
# In one terminal, watch the logs
tail -f logs/monitor.log  # or pm2 logs

# In another terminal, check the state file
watch -n 1 'cat data/current_state.json'
```

Expected log entry when email arrives:
```json
{"timestamp":"2025-11-01T10:10:15.123Z","level":"INFO","message":"Email received","id":12346,"subject":"Test Email","from":"sender@example.com"}
{"timestamp":"2025-11-01T10:10:15.234Z","level":"INFO","message":"Email stored","id":12346}
```

---

## 6. Querying Emails

### Using SQLite CLI

```bash
sqlite3 data/emails.db
```

**Useful queries**:

```sql
-- Count total emails
SELECT COUNT(*) FROM emails;

-- View recent emails
SELECT id, from_address, subject, downloaded_at
FROM emails
ORDER BY downloaded_at DESC
LIMIT 10;

-- Search by sender
SELECT id, subject, downloaded_at
FROM emails
WHERE from_address LIKE '%example.com%'
ORDER BY downloaded_at DESC;

-- Search by subject
SELECT id, from_address, subject, downloaded_at
FROM emails
WHERE subject LIKE '%meeting%'
ORDER BY downloaded_at DESC;

-- View email by id
SELECT * FROM emails WHERE id = 12345;

-- Count emails by date
SELECT DATE(downloaded_at) as date, COUNT(*) as count
FROM emails
GROUP BY DATE(downloaded_at)
ORDER BY date DESC;

-- Exit
.quit
```

### Using Node.js Script

Create `scripts/query-emails.js`:

```javascript
import Database from 'better-sqlite3';

const db = new Database('./data/emails.db', { readonly: true });

// Get recent emails
const recent = db.prepare(`
  SELECT id, from_address, subject, downloaded_at
  FROM emails
  ORDER BY downloaded_at DESC
  LIMIT 20
`).all();

console.log('Recent Emails:');
recent.forEach(email => {
  console.log(`[${email.id}] ${email.from_address}`);
  console.log(`  Subject: ${email.subject}`);
  console.log(`  Received: ${email.downloaded_at}\n`);
});

db.close();
```

Run:
```bash
node scripts/query-emails.js
```

---

## 7. Troubleshooting

### Authentication Failed

**Error**: `Authentication failed: Invalid credentials`

**Solutions**:
1. Verify `GMAIL_USER` is correct in `.env`
2. Verify `GMAIL_APP_PASSWORD` is the 16-character App Password (not your regular password)
3. Check that IMAP is enabled in Gmail settings
4. Regenerate App Password and update `.env`

### Connection Timeout

**Error**: `Connection timeout: ETIMEDOUT`

**Solutions**:
1. Check internet connectivity
2. Verify firewall isn't blocking port 993
3. Try `telnet imap.gmail.com 993` to test connectivity
4. Check if Gmail's IMAP service is operational: https://www.google.com/appsstatus/dashboard/

### Monitor Not Receiving New Emails

**Symptoms**: Monitor is connected but emails don't appear

**Debugging**:
1. Check state file: `cat data/current_state.json`
2. Verify `connection_status` is `connected`
3. Send test email to monitored account
4. Check logs for errors: `tail -f logs/monitor.log`
5. Verify IDLE is active: Look for "IDLE activated" in logs
6. Restart monitor: `pm2 restart gmail-monitor` or stop/start

### Database Locked

**Error**: `DatabaseError: database is locked`

**Solutions**:
1. Check if multiple instances are running: `ps aux | grep node`
2. Stop duplicate instances
3. If using WAL mode (default), this should be rare
4. Check disk space: `df -h`

### High Memory Usage

**Expected**: ~50-80MB for running process

**If higher**:
1. Check email count: `sqlite3 data/emails.db 'SELECT COUNT(*) FROM emails;'`
2. Check if processing large emails with attachments (not supported in MVP)
3. Restart monitor to clear any leaks
4. Monitor with: `ps aux | grep node` or `pm2 monit`

### State File Corrupted

**Error**: `StateError: Invalid state`

**Recovery**:
```bash
# Backup corrupted state
mv data/current_state.json data/current_state.json.backup

# Monitor will create new state on next start
npm start
```

**Note**: You may need to manually set `last_id` by checking the database:
```bash
sqlite3 data/emails.db 'SELECT MAX(id) FROM emails;'
# Update current_state.json with this id after creation
```

### Monitor Crashes on Mac Sleep/Wake

**Expected**: Monitor should detect and reconnect automatically

**If crashing**:
1. Check logs for error before crash
2. Ensure using latest Node.js v24 LTS
3. Update `imap` library: `npm update imap`
4. Use `pm2` for auto-restart: `pm2 start src/index.js --name gmail-monitor --restart-delay=5000`

---

## 8. Stopping the Monitor

### If Running in Foreground

Press `Ctrl+C` - monitor will gracefully shutdown:
- Close IMAP connection
- Flush state to disk
- Close database

### If Running with `nohup`

```bash
# Find PID
cat data/monitor.pid
# Or: ps aux | grep 'node.*index.js'

# Stop gracefully
kill $(cat data/monitor.pid)

# Or force stop if not responding
kill -9 $(cat data/monitor.pid)
```

### If Running with `pm2`

```bash
pm2 stop gmail-monitor      # Stop process
pm2 delete gmail-monitor    # Remove from pm2
# Or restart: pm2 restart gmail-monitor
```

### If Running as `launchd` Service

```bash
launchctl unload ~/Library/LaunchAgents/com.personai.gmail-monitor.plist
```

---

## Success Verification

After following this guide, verify the monitor is working:

- [ ] Monitor starts without errors
- [ ] State file shows `"connection_status": "connected"`
- [ ] Test email appears in database within 5 seconds
- [ ] Database contains email with all fields (from, to, subject, body, labels)
- [ ] Monitor survives Mac sleep/wake cycle
- [ ] Monitor automatically reconnects after network interruption

**Verification Script**:
```bash
# Check connection
cat data/current_state.json | grep connection_status

# Send test email (from another account or Gmail's web interface)
# Wait 10 seconds, then check:
sqlite3 data/emails.db 'SELECT COUNT(*) FROM emails;'
sqlite3 data/emails.db 'SELECT subject FROM emails ORDER BY downloaded_at DESC LIMIT 1;'
```

---

## Next Steps

- **Testing**: Run test suite with `npm test`
- **Development**: See [CONTRIBUTING.md](../../CONTRIBUTING.md)
- **API Integration**: Extend with REST API for email queries
- **Advanced Features**: Add email operations (labels, trash, mark read)

---

## Getting Help

- **Issues**: https://github.com/your-org/personai-assistant/issues
- **Documentation**: See `specs/001-gmail-imap-monitor/` for technical details
- **Logs**: Always include `current_state.json` and recent logs when reporting issues

---

## File Locations Summary

| File/Directory | Purpose | Location |
|----------------|---------|----------|
| Configuration | `.env` | Project root |
| Database | `emails.db` | `./data/emails.db` |
| State File | `current_state.json` | `./data/current_state.json` |
| Logs (nohup) | `monitor.log` | `./logs/monitor.log` |
| Logs (pm2) | Various | `~/.pm2/logs/` |
| Source Code | Main module | `./src/index.js` |
| Tests | Test files | `./tests/` |
| Documentation | Specs | `./specs/001-gmail-imap-monitor/` |
