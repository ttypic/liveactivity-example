'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Bootstraps an ephemeral Ably "sandbox" test app so the dashboard can run
// without a pre-provisioned Ably account. Mirrors how the Ably SDK test suites
// spin up a throwaway app (see ably-java .../test/helper/SandboxApp.kt):
//   POST https://sandbox.realtime.ably-nonprod.net/apps  (no auth) with the
//   shared ably-common test-app spec plus the APNS token (.p8) credentials.
// The new app is then reached via endpoint "nonprod:sandbox".
const SANDBOX_HOST = 'sandbox.realtime.ably-nonprod.net';
const APP_SETUP_URL =
  'https://raw.githubusercontent.com/ably/ably-common/refs/heads/main/test-resources/test-app-setup.json';
// Routing policy for the Ably client — connects to the same nonprod sandbox
// cluster the app was created on.
const ENDPOINT = 'nonprod:sandbox';

// Minimal fallback spec used if the shared ably-common spec can't be fetched
// (e.g. offline). One full-capability key + a push-enabled namespace is enough
// for push-admin / Live Activity broadcasts.
const FALLBACK_SPEC = {
  keys: [{ capability: '{ "[*]*":["*"] }' }],
  namespaces: [{ id: 'pushenabled', pushEnabled: true }],
};

// Build APNS token-auth config from the Apple env vars. Returns null when the
// required pieces are missing so the caller can warn and still create an app.
function buildApnsConfig() {
  const keyPath = process.env.APPLE_KEY_PATH;
  const keyId = process.env.APPLE_KEY_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const bundleId = process.env.APPLE_BUNDLE_ID;
  // Treat the .env.example placeholders (all-X) as "not set".
  const isPlaceholder = (v) => !v || /^X+$/.test(v) || /XXXXXXXX/.test(v);
  const missing = Object.entries({
    APPLE_KEY_PATH: keyPath,
    APPLE_KEY_ID: keyId,
    APPLE_TEAM_ID: teamId,
    APPLE_BUNDLE_ID: bundleId,
  })
    .filter(([, v]) => isPlaceholder(v))
    .map(([k]) => k);
  if (missing.length) {
    console.warn(`APNS config incomplete — missing/placeholder: ${missing.join(', ')}`);
    return null;
  }

  const resolved = path.isAbsolute(keyPath) ? keyPath : path.join(__dirname, keyPath);
  let signingKey;
  try {
    signingKey = fs.readFileSync(resolved, 'utf8');
  } catch (err) {
    console.warn(`Could not read APNS key at ${resolved}: ${err.message}`);
    return null;
  }

  return {
    apnsAuthType: 'token',
    apnsSigningKey: signingKey,
    apnsSigningKeyId: keyId,
    apnsIssuerKey: teamId,
    apnsTopicHeader: bundleId,
    apnsUseSandboxEndpoint: (process.env.APNS_ENV || 'sandbox') !== 'production',
  };
}

// Fetch the shared test-app spec; fall back to the inline minimal spec.
async function loadAppSpec() {
  try {
    const res = await fetch(APP_SETUP_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json && json.post_apps) return json.post_apps;
    throw new Error('no post_apps in spec');
  } catch (err) {
    console.warn(`Falling back to inline sandbox spec (${err.message})`);
    return { ...FALLBACK_SPEC };
  }
}

// Create a sandbox app with APNS credentials (if provided) in the same create
// call, and return the credentials needed to build an Ably client. APNS token
// fields are merged into the create body — the sandbox uses the same /apps API
// for app config, so no separate admin call is needed.
async function createSandboxApp(apnsConfig) {
  const spec = await loadAppSpec();
  if (apnsConfig) Object.assign(spec, apnsConfig);

  console.log('Creating sandbox app with APNS:', {
    apnsAuthType: spec.apnsAuthType,
    apnsSigningKey: spec.apnsSigningKey ? '<present>' : '<missing>',
    apnsSigningKeyId: spec.apnsSigningKeyId,
    apnsTopicHeader: spec.apnsTopicHeader,
    apnsUseSandboxEndpoint: spec.apnsUseSandboxEndpoint,
  });

  const res = await fetch(`https://${SANDBOX_HOST}/apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Sandbox app creation failed (HTTP ${res.status}): ${body}`);
  }
  const parsed = JSON.parse(body);

  return {
    appId: parsed.appId,
    key: parsed.keys[0],
    endpoint: ENDPOINT,
  };
}

module.exports = { buildApnsConfig, createSandboxApp, ENDPOINT, SANDBOX_HOST };
