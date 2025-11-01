#!/usr/bin/env node
import { spawn } from 'child_process';
import { execSync } from 'child_process';

const TUNNEL_CONFIG = {
  port: 8455,
  subdomain: 'rafael-personai-assistent',
  printRequests: true
};

const BACKOFF_SCHEDULE = [
  10 * 1000,      // 10 seconds
  30 * 1000,      // 30 seconds
  60 * 1000,      // 1 minute
  5 * 60 * 1000,  // 5 minutes
  60 * 60 * 1000  // 1 hour (repeats)
];

let attemptCount = 0;

function sendNotification(message) {
  try {
    const script = `display notification "${message}" with title "PersonAI Assistant - Tunnel Error"`;
    execSync(`osascript -e '${script}'`);
    console.log(`📱 Notification sent: ${message}`);
  } catch (error) {
    console.error('Failed to send notification:', error.message);
  }
}

function getBackoffDelay(attempt) {
  if (attempt < BACKOFF_SCHEDULE.length) {
    return BACKOFF_SCHEDULE[attempt];
  }
  // After reaching the last interval, keep using it (1 hour)
  return BACKOFF_SCHEDULE[BACKOFF_SCHEDULE.length - 1];
}

function formatDelay(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  return `${seconds} second${seconds > 1 ? 's' : ''}`;
}

function startTunnel() {
  console.log(`\n🚇 Starting tunnel (attempt ${attemptCount + 1})...`);
  console.log(`   Port: ${TUNNEL_CONFIG.port}`);
  console.log(`   Subdomain: ${TUNNEL_CONFIG.subdomain}`);

  const args = [
    '--port', TUNNEL_CONFIG.port.toString(),
    '--subdomain', TUNNEL_CONFIG.subdomain
  ];

  if (TUNNEL_CONFIG.printRequests) {
    args.push('--print-requests');
  }

  const tunnel = spawn('npx', ['localtunnel', ...args], {
    stdio: 'inherit'
  });

  tunnel.on('error', (error) => {
    console.error('❌ Failed to start tunnel process:', error.message);
    handleRestart();
  });

  tunnel.on('exit', (code, signal) => {
    if (code !== 0 || signal) {
      console.error(`❌ Tunnel exited with code ${code} and signal ${signal}`);
      handleRestart();
    }
  });
}

function handleRestart() {
  const delay = getBackoffDelay(attemptCount);
  const formattedDelay = formatDelay(delay);

  console.log(`⏱️  Retrying in ${formattedDelay}...`);

  // Send notification for 5min+ attempts
  if (attemptCount >= 3) { // Index 3 is 5 minutes, index 4+ is 1 hour
    const attemptInfo = attemptCount === 3 ? 'after 5 minutes' : `attempt ${attemptCount + 1}`;
    sendNotification(`Tunnel failed to create connection (${attemptInfo}). Retrying in ${formattedDelay}.`);
  }

  setTimeout(() => {
    attemptCount++;
    startTunnel();
  }, delay);
}

// Start the tunnel
console.log('🚀 Localtunnel Manager Started');
console.log('================================');
startTunnel();
