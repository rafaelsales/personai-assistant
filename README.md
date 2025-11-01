# Gmail IMAP Email Monitor

A local background program that monitors your Gmail inbox in real-time using IMAP, downloads emails immediately, and stores them in a local SQLite database.

## Features

- 🔄 Real-time email monitoring using IMAP IDLE (push notifications)
- 📥 Automatic download and storage of new emails
- 💾 Local SQLite database storage
- 🔌 Automatic reconnection and sync after network disruptions
- 🌙 Handles Mac hibernation/wake cycles
- 📊 State tracking with `current_state.json`

## Prerequisites

- Node.js v24 LTS or higher
- macOS (tested on macOS)
- Gmail account with IMAP enabled

## Gmail Setup Instructions

### Step 1: Enable IMAP in Gmail

1. Go to [Gmail Settings](https://mail.google.com/mail/u/0/#settings/fwdandpop)
2. Click on **"Forwarding and POP/IMAP"** tab
3. Under **"IMAP access"**, select **"Enable IMAP"**
4. Click **"Save Changes"**

### Step 2: Enable 2-Factor Authentication (Required for App Passwords)

1. Go to your [Google Account Security page](https://myaccount.google.com/security)
2. Under **"Signing in to Google"**, click on **"2-Step Verification"**
3. Follow the prompts to enable 2FA (if not already enabled)

### Step 3: Generate App Password

1. Go to [App Passwords page](https://myaccount.google.com/apppasswords)
   - Or: Google Account → Security → 2-Step Verification → App passwords
2. Sign in if prompted
3. Under **"Select app"**, choose **"Mail"**
4. Under **"Select device"**, choose **"Mac"** or **"Other (Custom name)"** and enter "IMAP Monitor"
5. Click **"Generate"**
6. **Copy the 16-character password** (shows as: `xxxx xxxx xxxx xxxx`)
7. **Save this password** - you won't see it again!

⚠️ **Important**: This is NOT your regular Gmail password. This is a special app password that only works for this application.

### Step 4: Test IMAP Connection (Optional)

You can verify IMAP is working using `openssl`:

```bash
openssl s_client -connect imap.gmail.com:993 -crlf
# Once connected, type:
# a1 LOGIN your-email@gmail.com your-app-password
# a2 LIST "" "*"
# a3 LOGOUT
```

## Installation

1. **Clone or navigate to the project directory:**
   ```bash
   cd personai-assistant
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```

4. **Edit `.env` with your credentials:**
   ```bash
   nano .env
   ```

   Add your Gmail credentials:
   ```env
   GMAIL_USER=your-email@gmail.com
   GMAIL_APP_PASSWORD=xxxxxxxxxxxx
   IMAP_HOST=imap.gmail.com
   IMAP_PORT=993
   IMAP_TLS=true
   DB_PATH=./data/emails.db
   STATE_FILE_PATH=./data/current_state.json
   LOG_LEVEL=info
   ```

   ⚠️ **Replace** `your-email@gmail.com` and `xxxxxxxxxxxx` with your actual Gmail address and the app password from Step 3.

5. **Create data directory:**
   ```bash
   mkdir -p data
   ```

## Usage

### Start the Monitor

```bash
npm start
```

The program will:
1. Connect to Gmail via IMAP
2. Initialize SQLite database if needed
3. Sync any missed emails since last run
4. Start monitoring for new emails in real-time

### View Logs

The program logs to console with timestamps:
```
[2025-11-01T10:30:45.123Z] INFO: Connected to imap.gmail.com
[2025-11-01T10:30:46.456Z] INFO: Syncing emails since UID 12345
[2025-11-01T10:30:47.789Z] INFO: Received email UID 12346: "Meeting Tomorrow" from boss@company.com
```

### Check Current State

View the current state:
```bash
cat data/current_state.json
```

Example output:
```json
{
  "last_uid": 12346,
  "last_uid_received_at": "2025-11-01T10:30:47.789Z",
  "last_connected_at": "2025-11-01T10:30:47.789Z",
  "last_error": null,
  "connection_status": "connected"
}
```

### Query Database

View stored emails:
```bash
sqlite3 data/emails.db "SELECT uid, subject, from_addr, received_at FROM emails ORDER BY received_at DESC LIMIT 10;"
```

### Stop the Monitor

Press `Ctrl+C` to gracefully shutdown. The program will:
1. Close IMAP connection
2. Save final state to `current_state.json`
3. Close database connections

## Run as Background Service (Optional)

### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start the service
pm2 start src/index.js --name gmail-monitor

# View logs
pm2 logs gmail-monitor

# Stop the service
pm2 stop gmail-monitor

# Restart the service
pm2 restart gmail-monitor

# Make it start on system boot
pm2 startup
pm2 save
```

### Using launchd (macOS Native)

Create `~/Library/LaunchAgents/com.personai.gmail-monitor.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.personai.gmail-monitor</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/YOUR_USERNAME/Code/ws/personai-assistant/src/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USERNAME/Code/ws/personai-assistant</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/gmail-monitor.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/gmail-monitor.error.log</string>
</dict>
</plist>
```

Load the service:
```bash
launchctl load ~/Library/LaunchAgents/com.personai.gmail-monitor.plist
```

## Troubleshooting

### "Invalid credentials" error

- Verify IMAP is enabled in Gmail settings
- Ensure you're using the **App Password**, not your regular Gmail password
- Check that 2FA is enabled on your Google account
- Try regenerating a new App Password

### "Connection timeout" error

- Check your internet connection
- Verify Gmail IMAP server is accessible: `ping imap.gmail.com`
- Check firewall settings (port 993 must be open)

### "Too many connections" error

- Gmail limits IMAP connections per account
- Close other IMAP clients (Apple Mail, Thunderbird, etc.)
- Wait a few minutes and try again

### Emails not syncing after wake from sleep

- This is normal - check logs for reconnection attempts
- The program should auto-reconnect within 1-60 seconds
- If it doesn't reconnect, restart the program

### Database locked error

- Ensure only one instance of the program is running
- Check `data/emails.db` isn't open in another program

## Security Notes

- ⚠️ **Never commit `.env` file** to version control
- Store `.env` file securely with restricted permissions: `chmod 600 .env`
- App Passwords have the same access as your Gmail password - keep them secure
- The SQLite database is stored locally and unencrypted - secure your Mac accordingly
- Consider using full disk encryption (FileVault) on macOS

## Database Schema

```sql
CREATE TABLE emails (
    uid INTEGER PRIMARY KEY,
    from_addr TEXT,
    to_addr TEXT,
    cc TEXT,
    subject TEXT,
    body TEXT,
    original_date TEXT,
    labels TEXT,
    received_at TEXT
);

CREATE INDEX idx_received_at ON emails(received_at);
```

## Project Structure

```
personai-assistant/
├── README.md                 # This file
├── REQUIREMENTS.md           # Detailed requirements
├── package.json              # Dependencies
├── .env                      # Your credentials (not in git)
├── .env.example              # Template for .env
├── src/
│   ├── index.js             # Main entry point
│   ├── imap-client.js       # IMAP connection handler
│   ├── email-processor.js   # Email parsing logic
│   ├── database.js          # SQLite operations
│   ├── state-manager.js     # State file management
│   └── config.js            # Configuration loader
└── data/
    ├── emails.db            # SQLite database
    └── current_state.json   # Current state
```

## Support

For issues and questions, please check:
1. This README and troubleshooting section
2. Gmail IMAP documentation: https://support.google.com/mail/answer/7126229
3. Project issues on GitHub

## License

MIT
