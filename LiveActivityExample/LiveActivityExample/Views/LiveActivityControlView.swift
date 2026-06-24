import SwiftUI

struct LiveActivityControlView: View {
    let manager: LiveActivityManager

    @State private var homeTeam = "Arsenal"
    @State private var awayTeam = "Chelsea"

    var body: some View {
        Form {
            Section("Match Setup") {
                TextField("Home Team", text: $homeTeam)
                TextField("Away Team", text: $awayTeam)
            }

            Section("Activity Control") {
                if manager.isActivityRunning {
                    Label("Live Activity Running", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    if let id = manager.activityId {
                        Text("ID: \(id)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Button("End Activity", role: .destructive) {
                        Task { await manager.endActivity() }
                    }
                } else {
                    Button("Start Live Activity Locally") {
                        Task { await manager.startActivity(homeTeam: homeTeam, awayTeam: awayTeam) }
                    }
                }
            }

            Section("Push-to-Start Token") {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Paste this into the server dashboard to start a Live Activity remotely.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TokenDisplayView(
                        label: "Device Token",
                        token: manager.pushToStartToken,
                        placeholder: "Waiting for token..."
                    )
                }
            }

            if manager.isActivityRunning {
                Section("Activity Update Token") {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Paste into the server dashboard to update this specific activity.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        TokenDisplayView(
                            label: "Update Token",
                            token: manager.activityUpdateToken,
                            placeholder: "Waiting for token..."
                        )
                    }
                }
            }

            if let error = manager.errorMessage {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
            }
        }
    }
}
