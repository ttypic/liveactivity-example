'use strict';

require('dotenv').config();
const express = require('express');
const path = require('node:path');
const APNSClient = require('./apns');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const apns = new APNSClient({
  teamId: process.env.APPLE_TEAM_ID,
  keyId: process.env.APPLE_KEY_ID,
  keyPath: process.env.APPLE_KEY_PATH,
  bundleId: process.env.APPLE_BUNDLE_ID,
  env: process.env.APNS_ENV || 'sandbox',
});

// Config for the dashboard UI
app.get('/api/config', (req, res) => {
  res.json({
    bundleId: process.env.APPLE_BUNDLE_ID,
    apnsEnv: process.env.APNS_ENV || 'sandbox',
  });
});

// Push-to-start: starts a new Live Activity on the device
app.post('/api/push-to-start', async (req, res) => {
  const { deviceToken, homeTeam, awayTeam } = req.body;
  if (!deviceToken || !homeTeam || !awayTeam) {
    return res.status(400).json({ error: 'deviceToken, homeTeam and awayTeam are required' });
  }
  try {
    await apns.pushToStart({ deviceToken, homeTeam, awayTeam });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a running Live Activity
app.post('/api/update-activity', async (req, res) => {
  const { activityToken, homeScore, awayScore, matchStatus, lastEvent } = req.body;
  if (!activityToken) {
    return res.status(400).json({ error: 'activityToken is required' });
  }
  try {
    await apns.updateActivity({ activityToken, homeScore, awayScore, matchStatus, lastEvent });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// End a Live Activity
app.post('/api/end-activity', async (req, res) => {
  const { activityToken, homeScore, awayScore } = req.body;
  if (!activityToken) {
    return res.status(400).json({ error: 'activityToken is required' });
  }
  try {
    await apns.endActivity({ activityToken, homeScore, awayScore });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Broadcast update via APNS channel (iOS 17.2+)
app.post('/api/broadcast-update', async (req, res) => {
  const { channelId, homeScore, awayScore, matchStatus, lastEvent } = req.body;
  if (!channelId) {
    return res.status(400).json({ error: 'channelId is required' });
  }
  try {
    await apns.broadcastUpdate({ channelId, homeScore, awayScore, matchStatus, lastEvent });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});

process.on('SIGTERM', () => { apns.destroy(); server.close(); });
process.on('SIGINT', () => { apns.destroy(); server.close(); });
