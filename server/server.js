'use strict';

require('dotenv').config();
const express = require('express');
const path = require('node:path');
const AblyLiveActivity = require('./ably-live-activity');
const { buildApnsConfig, createSandboxApp } = require('./ably-sandbox');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Resolved during bootstrap() before the server starts listening.
let liveActivity;
let mode = 'configured';
let appId;

// Use ABLY_API_KEY when provided; otherwise create an ephemeral Ably sandbox
// app and configure its APNS credentials from the Apple env vars.
async function bootstrap() {
  if (process.env.ABLY_API_KEY) {
    liveActivity = new AblyLiveActivity({ apiKey: process.env.ABLY_API_KEY });
    mode = 'configured';
    return;
  }

  const apns = buildApnsConfig();
  if (!apns) {
    throw new Error(
      'Sandbox mode needs APNS credentials: set APPLE_KEY_PATH (.p8), APPLE_KEY_ID, ' +
        'APPLE_TEAM_ID and APPLE_BUNDLE_ID in server/.env (or set ABLY_API_KEY to skip sandbox).'
    );
  }
  const created = await createSandboxApp(apns);
  appId = created.appId;
  console.log(`Created Ably sandbox app ${created.appId} (endpoint ${created.endpoint}) ${created.key.keyStr}`);
  liveActivity = new AblyLiveActivity({ apiKey: created.key, endpoint: created.endpoint });
  mode = 'sandbox';
}

// Config for the dashboard UI
app.get('/api/config', (req, res) => {
  res.json({
    bundleId: process.env.APPLE_BUNDLE_ID,
    apnsEnv: process.env.APNS_ENV || 'sandbox',
    mode,
    appId,
  });
});

// Ably token auth endpoint. The iOS app points its Ably `authUrl` here; we
// return a signed TokenRequest so the device can authenticate (and activate
// itself for Live Activity push-to-start) without ever seeing the API key.
app.get('/api/auth', async (req, res) => {
  try {
    const tokenRequest = await liveActivity.createTokenRequest({ clientId: req.query.clientId });
    res.json(tokenRequest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create an APNs broadcast channel via Ably.
// Returns the Ably broadcast `id` (used for start/update/end) and the
// `apnsChannelId` the iOS app subscribes to.
app.post('/api/broadcasts', async (req, res) => {
  try {
    const { id, apnsChannelId } = await liveActivity.createBroadcast();
    res.json({ success: true, id, apnsChannelId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Push-to-start a Live Activity on devices subscribed to the given Ably channels.
app.post('/api/live-activity/start', async (req, res) => {
  const { channels, deviceId, apnsBroadcast, apnsChannelId, homeTeam, awayTeam } = req.body;
  if (!apnsBroadcast) {
    return res.status(400).json({ error: 'apnsBroadcast is required' });
  }
  if (!apnsChannelId) {
    return res.status(400).json({ error: 'apnsChannelId is required' });
  }
  const hasChannels = Array.isArray(channels) && channels.length > 0;
  if (!hasChannels && !deviceId) {
    return res.status(400).json({ error: 'at least one channel or a deviceId is required' });
  }
  if (!homeTeam || !awayTeam) {
    return res.status(400).json({ error: 'homeTeam and awayTeam are required' });
  }
  try {
    await liveActivity.start({ channels, deviceId, apnsBroadcast, apnsChannelId, homeTeam, awayTeam });
    res.json({ success: true, apnsChannelId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Broadcast an update to all subscribed Live Activities.
app.post('/api/live-activity/update', async (req, res) => {
  const { apnsBroadcast, homeScore, awayScore, gameStatus, period, clock, lastPlay } = req.body;
  if (!apnsBroadcast) {
    return res.status(400).json({ error: 'apnsBroadcast is required' });
  }
  try {
    await liveActivity.update({ apnsBroadcast, homeScore, awayScore, gameStatus, period, clock, lastPlay });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Broadcast an end event to all subscribed Live Activities.
app.post('/api/live-activity/end', async (req, res) => {
  const { apnsBroadcast, homeScore, awayScore } = req.body;
  if (!apnsBroadcast) {
    return res.status(400).json({ error: 'apnsBroadcast is required' });
  }
  try {
    await liveActivity.end({ apnsBroadcast, homeScore, awayScore });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

bootstrap()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Dashboard running at http://localhost:${PORT} (mode: ${mode})`);
    });
    process.on('SIGTERM', () => server.close());
    process.on('SIGINT', () => server.close());
  })
  .catch((err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
