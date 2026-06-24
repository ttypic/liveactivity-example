'use strict';

const http2 = require('node:http2');
const fs = require('node:fs');
const jwt = require('jsonwebtoken');

const APNS_HOST = {
  sandbox: 'https://api.sandbox.push.apple.com',
  production: 'https://api.push.apple.com',
};

class APNSClient {
  constructor({ teamId, keyId, keyPath, bundleId, env = 'sandbox' }) {
    this.teamId = teamId;
    this.keyId = keyId;
    this.privateKey = fs.readFileSync(keyPath, 'utf8');
    this.bundleId = bundleId;
    this.host = APNS_HOST[env] || APNS_HOST.sandbox;
    this._token = null;
    this._tokenExpiry = 0;
    this._session = null;
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

  _getSession() {
    if (this._session && !this._session.destroyed) {
      return this._session;
    }
    this._session = http2.connect(this.host);
    this._session.on('error', (err) => {
      console.error('APNS session error:', err.message);
      this._session = null;
    });
    this._session.on('close', () => {
      this._session = null;
    });
    return this._session;
  }

  _request({ path, headers, payload }) {
    return new Promise((resolve, reject) => {
      const session = this._getSession();
      const hostname = new URL(this.host).hostname;
      const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const bodyBuffer = Buffer.from(body, 'utf8');

      const reqHeaders = {
        ':method': 'POST',
        ':path': path,
        ':scheme': 'https',
        ':authority': hostname,
        'authorization': `bearer ${this._getJWT()}`,
        'content-type': 'application/json',
        'content-length': bodyBuffer.length,
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
        if (status === 200) {
          resolve({ status, body: responseBody });
        } else {
          const parsed = responseBody ? (() => { try { return JSON.parse(responseBody); } catch { return responseBody; } })() : '';
          const reason = parsed && parsed.reason ? parsed.reason : responseBody;
          reject(new Error(`APNS ${status}: ${reason}`));
        }
      });
      req.on('error', reject);

      req.write(bodyBuffer);
      req.end();
    });
  }

  // Start a new Live Activity on device (push-to-start)
  pushToStart({ deviceToken, homeTeam, awayTeam }) {
    const payload = {
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
  updateActivity({ activityToken, homeScore, awayScore, matchStatus, lastEvent }) {
    const payload = {
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
          matchStatus: 'finished',
          lastEvent: 'Full time!',
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

  // Broadcast update via channel ID (iOS 17.2+)
  broadcastUpdate({ channelId, homeScore, awayScore, matchStatus, lastEvent }) {
    const payload = {
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

    return this._request({
      path: `/3/live-activity/${channelId}`,
      headers: {
        'apns-push-type': 'liveactivity',
        'apns-topic': `${this.bundleId}.push-type.liveactivity`,
        'apns-priority': '5',
      },
      payload,
    });
  }

  destroy() {
    if (this._session) {
      this._session.destroy();
      this._session = null;
    }
  }
}

module.exports = APNSClient;
