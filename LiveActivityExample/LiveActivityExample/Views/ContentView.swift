import SwiftUI

struct ContentView: View {
    @State private var manager = LiveActivityManager()

    var body: some View {
        NavigationStack {
            LiveActivityControlView(manager: manager)
                .navigationTitle("Live Activity Demo")
                .navigationBarTitleDisplayMode(.large)
        }
        .task {
            manager.restoreExistingActivities()
            manager.observePushToStartToken()
        }
    }
}
