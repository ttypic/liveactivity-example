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

// Push-to-start
document.getElementById('btn-start').addEventListener('click', () => {
  const btn = document.getElementById('btn-start');
  const deviceToken = document.getElementById('pts-token').value.trim();
  if (!deviceToken) { log('Push-to-start token is required', 'err'); return; }
  const channelId = document.getElementById('pts-channel').value.trim();
  apiPost('/api/push-to-start', {
    deviceToken,
    homeTeam: document.getElementById('pts-home').value.trim(),
    awayTeam: document.getElementById('pts-away').value.trim(),
    ...(channelId ? { channelId } : {}),
  }, btn);
});

// Update activity
document.getElementById('btn-update').addEventListener('click', () => {
  const btn = document.getElementById('btn-update');
  const activityToken = document.getElementById('update-token').value.trim();
  if (!activityToken) { log('Activity update token is required', 'err'); return; }
  apiPost('/api/update-activity', {
    activityToken,
    homeScore: parseInt(document.getElementById('update-home-score').value, 10),
    awayScore: parseInt(document.getElementById('update-away-score').value, 10),
    matchStatus: document.getElementById('update-status').value,
    lastEvent: document.getElementById('update-event').value.trim(),
  }, btn);
});

// End activity
document.getElementById('btn-end').addEventListener('click', () => {
  const btn = document.getElementById('btn-end');
  const activityToken = document.getElementById('update-token').value.trim();
  if (!activityToken) { log('Activity update token is required', 'err'); return; }
  apiPost('/api/end-activity', {
    activityToken,
    homeScore: parseInt(document.getElementById('update-home-score').value, 10),
    awayScore: parseInt(document.getElementById('update-away-score').value, 10),
  }, btn);
});

// Create channel
document.getElementById('btn-create-channel').addEventListener('click', async () => {
  const btn = document.getElementById('btn-create-channel');
  const data = await apiPost('/api/channels', {}, btn);
  if (data && data.success && data.channelId) {
    document.getElementById('bc-channel').value = data.channelId;
    log(`Channel created → ${data.channelId}`, 'ok');
  }
});

// List channels
document.getElementById('btn-list-channels').addEventListener('click', async () => {
  const btn = document.getElementById('btn-list-channels');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Loading...';
  try {
    const res = await fetch('/api/channels');
    const data = await res.json();
    if (data.success) {
      log(`Channels: ${JSON.stringify(data.channels)}`, 'ok');
    } else {
      log(`/api/channels → Error: ${data.error}`, 'err');
    }
  } catch (err) {
    log(`/api/channels → Network error: ${err.message}`, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
});

// Delete channel
document.getElementById('btn-delete-channel').addEventListener('click', async () => {
  const btn = document.getElementById('btn-delete-channel');
  const channelId = document.getElementById('bc-channel').value.trim();
  if (!channelId) { log('Channel ID is required to delete', 'err'); return; }
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Deleting...';
  try {
    const res = await fetch(`/api/channels/${encodeURIComponent(channelId)}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      log(`Channel deleted → ${channelId}`, 'ok');
      document.getElementById('bc-channel').value = '';
    } else {
      log(`Delete channel → Error: ${data.error}`, 'err');
    }
  } catch (err) {
    log(`Delete channel → Network error: ${err.message}`, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
});

// Broadcast update
document.getElementById('btn-broadcast').addEventListener('click', () => {
  const btn = document.getElementById('btn-broadcast');
  const channelId = document.getElementById('bc-channel').value.trim();
  if (!channelId) { log('Broadcast channel ID is required', 'err'); return; }
  apiPost('/api/broadcast-update', {
    channelId,
    homeScore: parseInt(document.getElementById('bc-home-score').value, 10),
    awayScore: parseInt(document.getElementById('bc-away-score').value, 10),
    matchStatus: document.getElementById('bc-status').value,
    lastEvent: document.getElementById('bc-event').value.trim(),
  }, btn);
});

// Broadcast end
document.getElementById('btn-broadcast-end').addEventListener('click', () => {
  const btn = document.getElementById('btn-broadcast-end');
  const channelId = document.getElementById('bc-channel').value.trim();
  if (!channelId) { log('Broadcast channel ID is required', 'err'); return; }
  apiPost('/api/broadcast-end', {
    channelId,
    homeScore: parseInt(document.getElementById('bc-home-score').value, 10),
    awayScore: parseInt(document.getElementById('bc-away-score').value, 10),
  }, btn);
});

// Clear log
document.getElementById('btn-clear').addEventListener('click', () => {
  document.getElementById('log').innerHTML = '';
});
