'use strict';

const Ably = require('ably');

// Drives iOS Live Activities over an APNs broadcast channel via Ably's push
// admin API. Ably holds the APNs auth key (configured in the Ably app), so this
// server only needs an Ably API key — no .p8 / JWT signing of its own.
//
// Lifecycle:
//   1. createBroadcast()        -> { id, apnsChannelId }
//      `id`            : opaque Ably broadcast id, used in every later call.
//      `apnsChannelId` : Apple channel id the iOS app subscribes to
//                        (pushType: .channel(apnsChannelId)).
//   2. start()  : push-to-start to devices subscribed to the given Ably channels.
//   3. update() : single push fanned out by APNs to all subscribed devices.
//   4. end()    : ends the activity everywhere and invalidates the broadcast id.
//
// The `apns` payloads mirror the shapes the previous direct-APNs client built,
// so the iOS `MatchAttributes` contract is unchanged. Ably passes them to APNs
// as-is.
class AblyLiveActivity {
  constructor({ apiKey }) {
    this.apiKey = apiKey;
    this._rest = null;
  }

  // Lazily construct the Rest client so the server can still boot and serve the
  // dashboard without a key — requests then fail with a clear message.
  get rest() {
    if (!this._rest) {
      if (!this.apiKey) {
        throw new Error('ABLY_API_KEY is not set — add it to server/.env');
      }
      this._rest = new Ably.Rest({ key: this.apiKey });
    }
    return this._rest;
  }

  // Create an APNs broadcast channel. messageStoragePolicy: 1 caches the last
  // update so late-joining devices get the current content-state on subscribe.
  createBroadcast() {
    return this.rest.push.admin.createApnsBroadcast({ messageStoragePolicy: 1 });
  }

  // Push-to-start a new Live Activity on every device subscribed to one of the
  // given Ably channels (using their Ably-registered push-to-start tokens).
  start({ channels, deviceId, apnsBroadcast, homeTeam, awayTeam }) {
    const apns = {
      aps: {
        timestamp: Math.floor(Date.now() / 1000),
        event: 'start',
        'content-state': {
          homeScore: 0,
          awayScore: 0,
          matchStatus: 'upcoming',
          lastEvent: 'Match about to begin',
        },
        'attributes-type': 'MatchAttributes',
        attributes: { homeTeam, awayTeam },
        alert: {
          title: `${homeTeam} vs ${awayTeam}`,
          body: 'A match is starting!',
        },
      },
    };

    return this.rest.push.admin.liveActivity.start({
      recipient: { channels, ...(deviceId ? { deviceId } : {}) },
      apnsBroadcast,
      apns,
    });
  }

  // Broadcast a content-state update to all subscribed activities.
  update({ apnsBroadcast, homeScore, awayScore, matchStatus, lastEvent }) {
    const apns = {
      aps: {
        timestamp: Math.floor(Date.now() / 1000),
        event: 'update',
        'content-state': {
          homeScore: homeScore ?? 0,
          awayScore: awayScore ?? 0,
          matchStatus: matchStatus ?? 'live',
          lastEvent: lastEvent ?? '',
        },
      },
    };

    return this.rest.push.admin.liveActivity.update({
      apnsBroadcast,
      apns,
      headers: { 'apns-priority': 10 },
    });
  }

  // Broadcast an end event and clean up the channel.
  end({ apnsBroadcast, homeScore, awayScore }) {
    const apns = {
      aps: {
        timestamp: Math.floor(Date.now() / 1000),
        event: 'end',
        'content-state': {
          homeScore: homeScore ?? 0,
          awayScore: awayScore ?? 0,
          matchStatus: 'finished',
          lastEvent: 'Full time!',
        },
        'dismissal-date': Math.floor(Date.now() / 1000) + 3600,
      },
    };

    return this.rest.push.admin.liveActivity.end({
      apnsBroadcast,
      apns,
      headers: { 'apns-priority': 10 },
    });
  }
}

module.exports = AblyLiveActivity;
