# Live Activity Example

iOS Live Activity demo with a Node.js server dashboard. The server drives Live
Activities over an **APNS broadcast channel via [Ably](https://ably.com)** — the
server holds only an Ably API key, and the Apple APNS auth key is configured in
the Ably app. Two ways to control a Live Activity:

- **Local** — start/end directly from the app using ActivityKit. Optionally
  subscribe the started activity to a broadcast channel (`pushType: .channel`).
- **Broadcast** — update or end all subscribed activities simultaneously via the
  Ably push admin API (iOS 18+).

> **Note on Push-to-Start:** the dashboard also exposes a push-to-start
> (`liveActivity.start`) action. Ably's push-to-start targets devices that are
> registered with Ably push and subscribed to an Ably channel — the iOS app in
> this example does **not** integrate the Ably SDK, so that action is wired but
> won't drive a device until Ably push is added to the app. The working
> end-to-end flow is: create broadcast → start the activity locally subscribed to
> the returned APNS channel id → update/end via the broadcast id.

The Live Activity displays a sports match score with Dynamic Island support.

---

## Project Structure

```
LiveActivityExample/        iOS Xcode project
  LiveActivityExample/      Main app target
    Models/MatchAttributes.swift    Shared ActivityAttributes (add to both targets)
    Services/LiveActivityManager.swift
    Views/
  MatchScoreWidget/         Widget extension target

server/                     Node.js dashboard
  ably-live-activity.js     Ably push admin client (broadcast + live activity)
  apns.js                   Legacy direct-APNS client (unused, kept for reference)
  server.js                 Express API server
  public/                   Web dashboard (HTML/CSS/JS)
```

---

## iOS Setup

### Requirements
- iOS 17.2+ deployment target
- Physical device (push notifications don't work in Simulator)
- Apple Developer account with push notifications enabled

### Steps

1. Open Xcode → File → New → Project → iOS App
   - Name: `LiveActivityExample`, Swift/SwiftUI

2. Add Widget Extension target:
   File → New → Target → Widget Extension
   - Name: `MatchScoreWidget`
   - Uncheck "Include Live Activity" (we write it manually)

3. Add source files to the project and set **target membership**:
   - `Models/MatchAttributes.swift` → **both** `LiveActivityExample` AND `MatchScoreWidget`
   - All other `LiveActivityExample/` files → `LiveActivityExample` only
   - All `MatchScoreWidget/` files → `MatchScoreWidget` only

4. Main app target → Signing & Capabilities → **+ Push Notifications**

5. Set deployment target to **iOS 17.2** for both targets

6. Use the provided `Info.plist` for the main app target (or merge the keys into your existing one):
   ```xml
   <key>NSSupportsLiveActivities</key><true/>
   <key>NSSupportsLiveActivitiesFrequentUpdates</key><true/>
   ```

7. Use the provided `.entitlements` file for the main app target (or verify `aps-environment` = `development`)

---

## Server Setup

### Requirements
- Node.js 18+
- An Ably account and an app with **Push** configured: upload your Apple APNS
  auth key (`.p8`) in the Ably app's Push settings. Create an API key with the
  **Push Admin** capability.
- The Ably JS SDK is vendored as `server/ably-2.22.1.tgz` and installed from there.

### Steps

```bash
cd server
npm install
cp .env.example .env
# Edit .env: set ABLY_API_KEY (and APPLE_BUNDLE_ID for the dashboard badge)
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### .env values

| Variable | Where to find it |
|---|---|
| `ABLY_API_KEY` | Ably dashboard → your app → API Keys (needs Push Admin) |
| `APPLE_BUNDLE_ID` | The bundle ID you set in Xcode (shown in the dashboard badge) |
| `APNS_ENV` | `sandbox`/`production` (shown in the dashboard badge) |

`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_KEY_PATH` are no longer used by the server
(the APNS key now lives in Ably); they remain only for the legacy `apns.js` helper.

---

## How to Use

1. **Start server**: `cd server && npm start` → open `http://localhost:3000`.

2. **Create a broadcast**: click "Create Broadcast". The dashboard shows:
   - **Broadcast ID** — the Ably id used for start/update/end.
   - **APNS Channel ID** — paste this into the iOS app.

3. **Run the iOS app** on a physical device, paste the **APNS Channel ID** into
   the "Broadcast Channel" field, then tap "Start Live Activity Locally". The
   activity subscribes to the channel via `pushType: .channel`.

4. **Update / End**: in the dashboard, adjust scores and use "Send Update" /
   "End Activity" — these broadcast to every subscribed activity via the
   Broadcast ID. You can also end locally from the app.

5. _(Advanced)_ **Start Live Activity** in the dashboard performs an Ably
   push-to-start to devices subscribed to the given Ably channel(s). This needs
   the app to integrate Ably push (not included here) — see the note at the top.

---

## API Notes

- The server uses the Ably JS SDK push admin API:
  - `rest.push.admin.createApnsBroadcast({ messageStoragePolicy })` → `{ id, apnsChannelId }`
  - `rest.push.admin.liveActivity.start({ recipient: { channels }, apnsBroadcast, apns })`
  - `rest.push.admin.liveActivity.update({ apnsBroadcast, apns, headers })`
  - `rest.push.admin.liveActivity.end({ apnsBroadcast, apns, headers })`
- The `apns` field is a standard APNS Live Activity payload (`{ aps: { event, content-state, … } }`), passed through to APNS by Ably.
- Ably holds the APNS auth key, so the server needs no `.p8` or JWT signing of its own.
