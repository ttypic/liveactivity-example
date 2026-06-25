'use strict';

require('dotenv').config();
const express = require('express');
const path = require('node:path');
const AblyLiveActivity = require('./ably-live-activity');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const liveActivity = new AblyLiveActivity({ apiKey: process.env.ABLY_API_KEY });

// Config for the dashboard UI
app.get('/api/config', (req, res) => {
  res.json({
    bundleId: process.env.APPLE_BUNDLE_ID,
    apnsEnv: process.env.APNS_ENV || 'sandbox',
  });
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
  const { channels, deviceId, apnsBroadcast, homeTeam, awayTeam } = req.body;
  if (!apnsBroadcast) {
    return res.status(400).json({ error: 'apnsBroadcast is required' });
  }
  if (!Array.isArray(channels) || channels.length === 0) {
    return res.status(400).json({ error: 'at least one channel is required' });
  }
  if (!homeTeam || !awayTeam) {
    return res.status(400).json({ error: 'homeTeam and awayTeam are required' });
  }
  try {
    await liveActivity.start({ channels, deviceId, apnsBroadcast, homeTeam, awayTeam });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Broadcast an update to all subscribed Live Activities.
app.post('/api/live-activity/update', async (req, res) => {
  const { apnsBroadcast, homeScore, awayScore, matchStatus, lastEvent } = req.body;
  if (!apnsBroadcast) {
    return res.status(400).json({ error: 'apnsBroadcast is required' });
  }
  try {
    await liveActivity.update({ apnsBroadcast, homeScore, awayScore, matchStatus, lastEvent });
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
const server = app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
