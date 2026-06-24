# Live Activity Example

iOS Live Activity demo with a Node.js server dashboard. Shows all three ways to control Live Activities:

- **Local** — start/end directly from the app using ActivityKit
- **Remote (Push-to-Start)** — start a new Live Activity on the device without the app being open
- **Broadcast** — update all subscribed activities simultaneously via an APNS broadcast channel (iOS 17.2+)

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
  apns.js                   APNS HTTP/2 + JWT client
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
- An Apple `.p8` key with APNs enabled (download from Apple Developer Portal → Keys)

### Steps

```bash
cd server
npm install
cp .env.example .env
# Edit .env with your Apple credentials
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### .env values

| Variable | Where to find it |
|---|---|
| `APPLE_TEAM_ID` | Apple Developer → Membership |
| `APPLE_KEY_ID` | Developer Portal → Keys → your key |
| `APPLE_BUNDLE_ID` | The bundle ID you set in Xcode |
| `APPLE_KEY_PATH` | Path to the downloaded `.p8` file |
| `APNS_ENV` | `sandbox` for dev/TestFlight, `production` for App Store |

---

## How to Use

1. **Run the iOS app** on a physical device. The app displays three tokens:
   - **Push-to-Start Token** — paste into the dashboard to start an activity remotely
   - **Broadcast Channel ID** — paste into the dashboard to send broadcast updates
   - **Activity Update Token** — appears after starting an activity; paste to send targeted updates

2. **Start server**: `cd server && npm start` → open `http://localhost:3000`

3. **Test each flow**:
   - _Local start_: tap "Start Live Activity Locally" in the app
   - _Remote start_: paste push-to-start token in dashboard → "Start Live Activity Remotely"
   - _Update_: paste activity update token → adjust scores → "Send Update"
   - _Broadcast_: paste broadcast channel ID → adjust scores → "Send Broadcast Update"
   - _End_: "End Activity" button in dashboard or app

---

## APNS Notes

- Push-to-start uses `apns-push-type: liveactivity` with topic `{bundleId}.push-type.liveactivity`
- Broadcast channel endpoint: `POST /3/live-activity/{channelId}`
- The server uses Node's built-in `http2` module with a persistent session and JWT auth (ES256)
- JWT tokens are cached for 55 minutes and regenerated automatically
