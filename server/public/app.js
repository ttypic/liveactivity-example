'use strict';

// Load server config
fetch('/api/config')
  .then((r) => r.json())
  .then((cfg) => {
    document.getElementById('config-badge').textContent =
      `${cfg.bundleId} · ${cfg.apnsEnv}`;
  })
  .catch(() => {
    document.getElementById('config-badge').textContent = 'config unavailable';
  });

// Logging
function log(message, type = 'info') {
  const container = document.getElementById('log');
  const el = document.createElement('div');
  el.className = `log-entry ${type}`;
  const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
  el.innerHTML = `<span class="ts">${ts}</span><span class="msg">${escapeHtml(message)}</span>`;
  container.prepend(el);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// API helper
async function apiPost(endpoint, body, btn) {
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      log(`${endpoint} → 200 OK`, 'ok');
    } else {
      log(`${endpoint} → Error: ${data.error}`, 'err');
    }
    return data;
  } catch (err) {
    log(`${endpoint} → Network error: ${err.message}`, 'err');
    return { success: false, error: err.message };
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

// Create broadcast channel
document.getElementById('btn-create-broadcast').addEventListener('click', async () => {
  const btn = document.getElementById('btn-create-broadcast');
  const data = await apiPost('/api/broadcasts', {}, btn);
  if (data && data.success && data.id) {
    document.getElementById('bc-id').value = data.id;
    document.getElementById('bc-apns-channel').value = data.apnsChannelId || '';
    log(`Broadcast created → id=${data.id}, apnsChannelId=${data.apnsChannelId}`, 'ok');
  }
});

// Start Live Activity (push-to-start over Ably channels)
document.getElementById('btn-start').addEventListener('click', () => {
  const btn = document.getElementById('btn-start');
  const apnsBroadcast = document.getElementById('bc-id').value.trim();
  if (!apnsBroadcast) { log('Broadcast ID is required (create one above)', 'err'); return; }
  const channels = document.getElementById('start-channels').value
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  if (channels.length === 0) { log('At least one Ably channel is required', 'err'); return; }
  apiPost('/api/live-activity/start', {
    apnsBroadcast,
    channels,
    homeTeam: document.getElementById('start-home').value.trim(),
    awayTeam: document.getElementById('start-away').value.trim(),
  }, btn);
});

// Update activity (broadcast)
document.getElementById('btn-update').addEventListener('click', () => {
  const btn = document.getElementById('btn-update');
  const apnsBroadcast = document.getElementById('bc-id').value.trim();
  if (!apnsBroadcast) { log('Broadcast ID is required (create one above)', 'err'); return; }
  apiPost('/api/live-activity/update', {
    apnsBroadcast,
    homeScore: parseInt(document.getElementById('bc-home-score').value, 10),
    awayScore: parseInt(document.getElementById('bc-away-score').value, 10),
    matchStatus: document.getElementById('bc-status').value,
    lastEvent: document.getElementById('bc-event').value.trim(),
  }, btn);
});

// End activity (broadcast)
document.getElementById('btn-end').addEventListener('click', () => {
  const btn = document.getElementById('btn-end');
  const apnsBroadcast = document.getElementById('bc-id').value.trim();
  if (!apnsBroadcast) { log('Broadcast ID is required (create one above)', 'err'); return; }
  apiPost('/api/live-activity/end', {
    apnsBroadcast,
    homeScore: parseInt(document.getElementById('bc-home-score').value, 10),
    awayScore: parseInt(document.getElementById('bc-away-score').value, 10),
  }, btn);
});

// Clear log
document.getElementById('btn-clear').addEventListener('click', () => {
  document.getElementById('log').innerHTML = '';
});
