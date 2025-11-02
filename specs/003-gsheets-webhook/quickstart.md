# Quickstart: Google Sheets Webhook Server

**Feature**: 003-gsheets-webhook
**Date**: 2025-11-01
**For**: Developers implementing the webhook server

## Overview

This guide helps you quickly get the webhook server running and integrated with Google Apps Script. The webhook server receives email data from gmail-to-sheet.gs and stores it in the SQLite database.

## Prerequisites

- Node.js v24+ installed
- Existing database setup (src/database.js)
- Gmail-to-sheet.gs deployed in Google Apps Script
- Port 8455 available (not used by another process)

## Quick Start (5 minutes)

### Step 1: Start the Webhook Server

```bash
# From project root
npm run webhook-server

# Expected output:
# [INFO] Webhook server starting
# [INFO] Database connected at ./data/emails.db
# [INFO] Webhook server listening on port 8455
```

**Note**: This assumes the npm script is added to package.json:
```json
{
  "scripts": {
    "webhook-server": "node src/webhook-server.js"
  }
}
```

---

### Step 2: Test the Health Endpoint

```bash
curl http://localhost:8455/health

# Expected response:
{
  "status": "healthy",
  "uptime": 5,
  "port": 8455,
  "database": "connected",
  "timestamp": "2025-11-01T12:00:00.000Z"
}
```

✅ Server is running correctly!

---

### Step 3: Test Webhook Endpoint with Sample Email

```bash
curl -X POST http://localhost:8455/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-email-001",
    "thread_id": "test-thread-001",
    "received_at": "2025-11-01 10:30:00",
    "downloaded_at": "2025-11-01 10:31:00",
    "broadcasted_at": "",
    "from_address": "test@example.com",
    "to_address": "recipient@example.com",
    "cc_address": "",
    "subject": "Test Email",
    "labels": "INBOX",
    "body": "This is a test email."
  }'

# Expected response:
{
  "status": "success",
  "action": "stored",
  "id": "test-email-001"
}
```

✅ Email successfully stored!

---

### Step 4: Test Idempotency (Send Same Email Again)

```bash
# Send the exact same request again
curl -X POST http://localhost:8455/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-email-001",
    ...
  }'

# Expected response:
{
  "status": "success",
  "action": "skipped",
  "id": "test-email-001"
}
```

✅ Duplicate correctly skipped!

---

### Step 5: Verify Data in Database

```bash
# Using sqlite3 CLI
sqlite3 ./data/emails.db "SELECT id, subject FROM emails WHERE id = 'test-email-001'"

# Expected output:
test-email-001|Test Email
```

✅ Data persisted correctly!

---

## Google Apps Script Integration

### Update Webhook URL in gmail-to-sheet.gs

Edit line 184 in gmail-to-sheet.gs:

```javascript
// Before (example with localtunnel)
const WEBHOOK_URL = 'https://rafael-personai-assistent.loca.lt';

// After (local development)
const WEBHOOK_URL = 'http://localhost:8455/webhook';

// After (production deployment)
const WEBHOOK_URL = 'https://your-domain.com/webhook';
```

### Test Google Apps Script Integration

1. Open your Google Sheet
2. Go to Extensions > Apps Script
3. Run `syncUnreadEmails` function
4. Check execution logs in Apps Script
5. Verify webhook server logs show incoming requests

**Expected webhook server logs**:
```json
[INFO] Request received - POST /webhook
[INFO] Email stored - messageId: 18f3a8b9c7d2e1f0
[INFO] Response sent - 200 OK - 42ms
```

---

## Common Issues & Solutions

### Issue 1: Port 8455 Already in Use

**Error**:
```
Error: Port 8455 is already in use
```

**Solution**:
```bash
# Find process using port 8455
lsof -i :8455

# Kill the process
kill -9 <PID>

# Or use a different port (requires code change)
# Edit src/webhook-server.js: const PORT = 8456;
```

---

### Issue 2: Database Connection Failed

**Error**:
```
Database initialization failed: unable to open database file
```

**Solution**:
```bash
# Ensure data directory exists
mkdir -p ./data

# Check file permissions
ls -la ./data/

# If database doesn't exist, create it
node -e "import('./src/database.js').then(db => db.initDatabase('./data/emails.db'))"
```

---

### Issue 3: Validation Error - Missing Fields

**Error Response**:
```json
{
  "status": "error",
  "message": "Missing required fields: subject",
  "code": "VALIDATION_ERROR"
}
```

**Solution**:
- Verify payload includes all required fields:
  - id, thread_id, received_at, downloaded_at
  - from_address, to_address, subject, labels, body
- Check for typos in field names (case-sensitive)
- Ensure no fields are null or empty strings (except cc_address, labels, broadcasted_at)

---

### Issue 4: Invalid JSON Error

**Error Response**:
```json
{
  "status": "error",
  "message": "Invalid JSON in request body",
  "code": "INVALID_JSON"
}
```

**Solution**:
- Validate JSON syntax: https://jsonlint.com/
- Ensure Content-Type header is `application/json`
- Check for trailing commas in JSON
- Escape special characters in string values

---

## Testing Checklist

Before deploying to production:

- [ ] Health endpoint returns 200 OK
- [ ] Webhook accepts valid email payload
- [ ] Duplicate emails are skipped (idempotency)
- [ ] Validation errors return 400 Bad Request
- [ ] Invalid JSON returns 400 Bad Request
- [ ] Database persists email data correctly
- [ ] Server handles graceful shutdown (Ctrl+C)
- [ ] Server logs all requests and responses
- [ ] Google Apps Script can reach webhook URL
- [ ] Server runs for 1+ hour without crashes

---

## Production Deployment

### Environment Setup

**Option 1: Run as systemd service (Linux)**

Create `/etc/systemd/system/webhook-server.service`:

```ini
[Unit]
Description=Gmail Webhook Server
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/personai-assistant
ExecStart=/usr/bin/node src/webhook-server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Enable and start**:
```bash
sudo systemctl enable webhook-server
sudo systemctl start webhook-server
sudo systemctl status webhook-server
```

---

**Option 2: Run with PM2 (process manager)**

```bash
# Install PM2
npm install -g pm2

# Start webhook server
pm2 start src/webhook-server.js --name webhook-server

# Enable auto-restart on system reboot
pm2 startup
pm2 save

# Monitor logs
pm2 logs webhook-server
```

---

**Option 3: Docker deployment**

Create `Dockerfile`:

```dockerfile
FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
COPY data/ ./data/

EXPOSE 8455

CMD ["node", "src/webhook-server.js"]
```

**Build and run**:
```bash
docker build -t webhook-server .
docker run -d -p 8455:8455 -v $(pwd)/data:/app/data webhook-server
```

---

### Firewall Configuration

**Allow incoming connections on port 8455**:

```bash
# UFW (Ubuntu)
sudo ufw allow 8455/tcp

# iptables
sudo iptables -A INPUT -p tcp --dport 8455 -j ACCEPT

# firewalld (CentOS/RHEL)
sudo firewall-cmd --add-port=8455/tcp --permanent
sudo firewall-cmd --reload
```

---

### Reverse Proxy (Optional - for HTTPS)

**Nginx configuration** (if you want HTTPS):

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /webhook {
        proxy_pass http://localhost:8455/webhook;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /health {
        proxy_pass http://localhost:8455/health;
    }
}
```

**Update Google Apps Script URL**:
```javascript
const WEBHOOK_URL = 'https://your-domain.com/webhook';
```

---

## Monitoring & Maintenance

### Health Check Monitoring

**Set up periodic health checks**:

```bash
# Cron job (every 5 minutes)
*/5 * * * * curl -f http://localhost:8455/health || echo "Webhook server down!" | mail -s "Alert" admin@example.com
```

**Or use monitoring tools**:
- Uptime Robot: https://uptimerobot.com/
- Pingdom: https://www.pingdom.com/
- Datadog: https://www.datadoghq.com/

---

### Log Monitoring

**View real-time logs**:

```bash
# Systemd
sudo journalctl -u webhook-server -f

# PM2
pm2 logs webhook-server --lines 100

# Docker
docker logs -f <container-id>
```

**Log rotation** (prevent disk space issues):

```bash
# Systemd automatically rotates journald logs

# For file-based logs, use logrotate
# Create /etc/logrotate.d/webhook-server
/var/log/webhook-server.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
}
```

---

### Performance Monitoring

**Monitor key metrics**:

```bash
# Memory usage
ps aux | grep webhook-server

# CPU usage
top -p <webhook-server-pid>

# Open connections
netstat -an | grep 8455

# Database size
du -h ./data/emails.db
```

**Set up alerts**:
- Memory > 100MB
- CPU > 50% sustained
- Database size > 10GB
- Health check failures > 3 consecutive

---

## Troubleshooting Commands

### Check Server Status

```bash
# Is server running?
ps aux | grep webhook-server

# Is port listening?
lsof -i :8455
netstat -tuln | grep 8455

# Test connectivity
curl http://localhost:8455/health
```

---

### Check Database

```bash
# Database file exists?
ls -lh ./data/emails.db

# Database integrity
sqlite3 ./data/emails.db "PRAGMA integrity_check;"

# Count emails
sqlite3 ./data/emails.db "SELECT COUNT(*) FROM emails;"

# Recent emails
sqlite3 ./data/emails.db "SELECT id, subject, downloaded_at FROM emails ORDER BY downloaded_at DESC LIMIT 10;"
```

---

### Test Webhook Locally

**Create test payload file** (`test-payload.json`):

```json
{
  "id": "manual-test-001",
  "thread_id": "manual-thread-001",
  "received_at": "2025-11-01 12:00:00",
  "downloaded_at": "2025-11-01 12:01:00",
  "broadcasted_at": "",
  "from_address": "manual@test.com",
  "to_address": "recipient@test.com",
  "cc_address": "",
  "subject": "Manual Test",
  "labels": "TESTING",
  "body": "Manual webhook test"
}
```

**Send test request**:
```bash
curl -X POST http://localhost:8455/webhook \
  -H "Content-Type: application/json" \
  -d @test-payload.json
```

---

## Performance Benchmarks

### Expected Performance

| Metric | Target | Measurement Command |
|--------|--------|---------------------|
| Startup time | < 5s | `time node src/webhook-server.js` |
| Health check latency | < 10ms | `curl -w "%{time_total}\n" http://localhost:8455/health` |
| Webhook latency (p95) | < 200ms | Use `ab` or `wrk` for load testing |
| Memory usage | < 100MB | `ps aux \| grep webhook-server` |
| Concurrent requests | 10+ | `ab -n 100 -c 10 ...` |

---

### Load Testing

**Install Apache Bench**:
```bash
# Ubuntu
sudo apt-get install apache2-utils

# macOS
brew install httpd
```

**Run load test**:
```bash
# Test with 100 requests, 10 concurrent
ab -n 100 -c 10 -p test-payload.json -T application/json http://localhost:8455/webhook

# Expected results:
# Requests per second: 50-100
# Time per request (mean): 10-20ms
# Time per request (mean, across concurrent): 100-200ms
# No failed requests
```

---

## Next Steps

After completing this quickstart:

1. ✅ Webhook server running locally
2. ✅ Integration with Google Apps Script tested
3. ✅ Database persistence verified
4. → **Production deployment** (choose systemd/PM2/Docker)
5. → **Set up monitoring** (health checks, logs, alerts)
6. → **Configure firewall** (if needed)
7. → **Optional: Set up reverse proxy** for HTTPS

---

## Additional Resources

- **Feature Spec**: [spec.md](./spec.md)
- **API Contract**: [contracts/webhook-api.md](./contracts/webhook-api.md)
- **Server Contract**: [contracts/http-server-contract.md](./contracts/http-server-contract.md)
- **Data Model**: [data-model.md](./data-model.md)
- **Research**: [research.md](./research.md)

---

## Support

**Common Questions**:

**Q: Can I change the port from 8455?**
A: Yes, but requires code change in `src/webhook-server.js`. Consider adding environment variable support: `const PORT = process.env.WEBHOOK_PORT || 8455;`

**Q: How do I stop the server?**
A: Press `Ctrl+C` in terminal (sends SIGINT), or `kill <pid>` (sends SIGTERM). Server will shut down gracefully.

**Q: Can I run multiple webhook servers?**
A: Not recommended - SQLite doesn't handle multiple writers well. Use a single instance with proper monitoring and auto-restart on failure.

**Q: How do I backup the database?**
A: SQLite supports hot backups with WAL mode. Use: `sqlite3 ./data/emails.db ".backup ./data/emails-backup.db"`

**Q: What if Google Apps Script can't reach the webhook?**
A: Use localtunnel (existing `src/tunnel.js`) for development, or deploy server to internet-accessible host for production.
