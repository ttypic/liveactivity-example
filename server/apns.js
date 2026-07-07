'use strict';

const http2 = require('node:http2');
const fs = require('node:fs');
const jwt = require('jsonwebtoken');

const APNS_HOST = {
  sandbox: 'https://api.sandbox.push.apple.com',
  production: 'https://api.push.apple.com',
};

// Broadcast channel management API (create/list/delete channels). Note the
// non-default ports — these must be included for the HTTP/2 connection.
const APNS_MANAGE_HOST = {
  sandbox: 'https://api-manage-broadcast.sandbox.push.apple.com:2195',
  production: 'https://api-manage-broadcast.push.apple.com:2196',
};

class APNSClient {
  constructor({ teamId, keyId, keyPath, bundleId, env = 'sandbox' }) {
    this.teamId = teamId;
    this.keyId = keyId;
    this.privateKey = fs.readFileSync(keyPath, 'utf8');
    this.bundleId = bundleId;
    this.host = APNS_HOST[env] || APNS_HOST.sandbox;
    this.manageHost = APNS_MANAGE_HOST[env] || APNS_MANAGE_HOST.sandbox;
    this._token = null;
    this._tokenExpiry = 0;
    this._sessions = new Map();
  }

  _getJWT() {
    const now = Math.floor(Date.now() / 1000);
    if (this._token && now < this._tokenExpiry - 60) {
      return this._token;
    }
    this._token = jwt.sign(
      { iss: this.teamId, iat: now },
      this.privateKey,
      { algorithm: 'ES256', keyid: this.keyId }
    );
    this._tokenExpiry = now + 3600;
    return this._token;
  }

  _getSession(host) {
    const existing = this._sessions.get(host);
    if (existing && !existing.destroyed) {
      return existing;
    }
    const session = http2.connect(host);
    session.on('error', (err) => {
      console.error('APNS session error:', host, err.message);
      this._sessions.delete(host);
    });
    session.on('close', () => {
      this._sessions.delete(host);
    });
    this._sessions.set(host, session);
    return session;
  }

  _request({ host = this.host, method = 'POST', path, headers, payload }) {
    return new Promise((resolve, reject) => {
      const session = this._getSession(host);
      const url = new URL(host);
      // Include the port in :authority only when it is non-default (the
      // management host uses 2195/2196); the send host stays the bare hostname.
      const authority = url.port ? `${url.hostname}:${url.port}` : url.hostname;

      const hasBody = payload !== undefined && payload !== null;
      const bodyBuffer = hasBody
        ? Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload), 'utf8')
        : null;

      const reqHeaders = {
        ':method': method,
        ':path': path,
        ':scheme': 'https',
        ':authority': authority,
        'authorization': `bearer ${this._getJWT()}`,
        'content-type': 'application/json',
        ...(hasBody ? { 'content-length': bodyBuffer.length } : {}),
        ...headers,
      };

      const req = session.request(reqHeaders);
      let responseHeaders = {};
      const chunks = [];

      req.on('response', (hdrs) => {
        responseHeaders = hdrs;
      });
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const status = responseHeaders[':status'];
        const responseBody = Buffer.concat(chunks).toString('utf8');
        if (status >= 200 && status < 300) {
          resolve({ status, headers: responseHeaders, body: responseBody });
        } else {
          const parsed = responseBody ? (() => { try { return JSON.parse(responseBody); } catch { return responseBody; } })() : '';
          const reason = parsed && parsed.reason ? parsed.reason : responseBody;
          reject(new Error(`APNS ${status}: ${reason}`));
        }
      });
      req.on('error', reject);

      if (hasBody) req.write(bodyBuffer);
      req.end();
    });
  }

  // Start a new Live Activity on device (push-to-start).
  // When `channelId` is given, the started activity subscribes to that broadcast
  // channel (via `input-push-channel`) so it can later be updated via broadcast.
  pushToStart({ deviceToken, homeTeam, awayTeam, channelId }) {
    const payload = {
      aps: {
        timestamp: Math.floor(Date.now() / 1000),
        event: 'start',
        ...(channelId ? { 'input-push-channel': channelId } : {}),
        'content-state': {
          homeScore: 0,
          awayScore: 0,
          gameStatus: 'scheduled',
          period: 'Q1',
          clock: '12:00',
          lastPlay: 'Tip-off soon',
        },
        'attributes-type': 'GameAttributes',
        attributes: { homeTeam, awayTeam },
        alert: {
          title: `${homeTeam} vs ${awayTeam}`,
          body: 'Game starting!',
        },
      },
    };

    return this._request({
      path: `/3/device/${deviceToken}`,
      headers: {
        'apns-push-type': 'liveactivity',
        'apns-topic': `${this.bundleId}.push-type.liveactivity`,
        'apns-priority': '10',
      },
      payload,
    });
  }

  // Update a running Live Activity via its push token
  updateActivity({ activityToken, homeScore, awayScore, gameStatus, period, clock, lastPlay }) {
    const payload = {
      aps: {
        timestamp: Math.floor(Date.now() / 1000),
        event: 'update',
        'content-state': {
          homeScore: homeScore ?? 0,
          awayScore: awayScore ?? 0,
          gameStatus: gameStatus ?? 'live',
          period: period ?? 'Q1',
          clock: clock ?? '',
          lastPlay: lastPlay ?? '',
        },
      },
    };

    return this._request({
      path: `/3/device/${activityToken}`,
      headers: {
        'apns-push-type': 'liveactivity',
        'apns-topic': `${this.bundleId}.push-type.liveactivity`,
        'apns-priority': '10',
      },
      payload,
    });
  }

  // End a running Live Activity
  endActivity({ activityToken, homeScore, awayScore }) {
    const payload = {
      aps: {
        timestamp: Math.floor(Date.now() / 1000),
        event: 'end',
        'content-state': {
          homeScore: homeScore ?? 0,
          awayScore: awayScore ?? 0,
          gameStatus: 'finished',
          period: 'Final',
          clock: '',
          lastPlay: 'Final',
        },
        'dismissal-date': Math.floor(Date.now() / 1000) + 3600,
      },
    };

    return this._request({
      path: `/3/device/${activityToken}`,
      headers: {
        'apns-push-type': 'liveactivity',
        'apns-topic': `${this.bundleId}.push-type.liveactivity`,
        'apns-priority': '10',
      },
      payload,
    });
  }

  // --- Broadcast channels (iOS 18+) ----------------------------------------

  // Create a new broadcast channel. The channel id is returned in the
  // `apns-channel-id` response header (the body is typically empty).
  createChannel() {
    return this._request({
      host: this.manageHost,
      method: 'POST',
      path: `/1/apps/${this.bundleId}/channels`,
      payload: { 'push-type': 'LiveActivity', 'message-storage-policy': 1 },
    }).then((res) => {
      const channelId = res.headers['apns-channel-id'];
      if (!channelId) {
        throw new Error('APNS create channel: no apns-channel-id in response');
      }
      return { channelId, status: res.status };
    });
  }

  // List all broadcast channels for this app.
  listChannels() {
    return this._request({
      host: this.manageHost,
      method: 'GET',
      path: `/1/apps/${this.bundleId}/all-channels`,
    }).then((res) => {
      let channels = [];
      if (res.body) {
        try { channels = JSON.parse(res.body); } catch { channels = res.body; }
      }
      return { channels, status: res.status };
    });
  }

  // Delete a broadcast channel.
  deleteChannel({ channelId }) {
    return this._request({
      host: this.manageHost,
      method: 'DELETE',
      path: `/1/apps/${this.bundleId}/channels`,
      headers: { 'apns-channel-id': channelId },
    }).then((res) => ({ status: res.status }));
  }

  // Broadcast an update to every Live Activity subscribed to the channel.
  // No apns-topic header for broadcasts; the channel id is sent in apns-channel-id.
  broadcastUpdate({ channelId, homeScore, awayScore, gameStatus, period, clock, lastPlay }) {
    const payload = {
      aps: {
        timestamp: Math.floor(Date.now() / 1000),
        event: 'update',
        'content-state': {
          homeScore: homeScore ?? 0,
          awayScore: awayScore ?? 0,
          gameStatus: gameStatus ?? 'live',
          period: period ?? 'Q1',
          clock: clock ?? '',
          lastPlay: lastPlay ?? '',
        },
      },
    };

    return this._request({
      host: this.host,
      path: `/4/broadcasts/apps/${this.bundleId}`,
      headers: {
        'apns-push-type': 'liveactivity',
        'apns-channel-id': channelId,
        'apns-priority': '5',
        // Broadcasts require apns-expiration; store/deliver for up to 1 hour.
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600),
      },
      payload,
    });
  }

  // Broadcast an end event to every Live Activity subscribed to the channel.
  broadcastEnd({ channelId, homeScore, awayScore }) {
    const payload = {
      aps: {
        timestamp: Math.floor(Date.now() / 1000),
        event: 'end',
        'content-state': {
          homeScore: homeScore ?? 0,
          awayScore: awayScore ?? 0,
          gameStatus: 'finished',
          period: 'Final',
          clock: '',
          lastPlay: 'Final',
        },
        'dismissal-date': Math.floor(Date.now() / 1000) + 3600,
      },
    };

    return this._request({
      host: this.host,
      path: `/4/broadcasts/apps/${this.bundleId}`,
      headers: {
        'apns-push-type': 'liveactivity',
        'apns-channel-id': channelId,
        'apns-priority': '5',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600),
      },
      payload,
    });
  }

  destroy() {
    for (const session of this._sessions.values()) {
      session.destroy();
    }
    this._sessions.clear();
  }
}

module.exports = APNSClient;

