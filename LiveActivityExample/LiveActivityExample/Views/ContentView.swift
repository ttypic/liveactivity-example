import SwiftUI

struct ContentView: View {
    @State private var manager = LiveActivityManager()
    @State private var pushManager = AblyPushManager()

    var body: some View {
        NavigationStack {
            LiveActivityControlView(manager: manager, pushManager: pushManager)
                .navigationTitle("Live Activity Demo")
                .navigationBarTitleDisplayMode(.large)
        }
        .task {
            manager.restoreExistingActivities()
            manager.observePushToStartToken()
        }
    }
}
