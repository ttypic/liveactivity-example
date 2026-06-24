import ActivityKit
import Foundation

@Observable
final class LiveActivityManager {
    var currentActivity: Activity<MatchAttributes>?
    var activityUpdateToken: String?
    var pushToStartToken: String?
    var errorMessage: String?

    var isActivityRunning: Bool { currentActivity != nil }
    var activityId: String? { currentActivity?.id }

    // MARK: - Push-to-Start Token

    func observePushToStartToken() {
        Task {
            for await tokenData in Activity<MatchAttributes>.pushToStartTokenUpdates {
                let token = tokenData.map { String(format: "%02x", $0) }.joined()
                await MainActor.run { self.pushToStartToken = token }
            }
        }
    }

    // MARK: - Start Activity Locally

    func startActivity(homeTeam: String, awayTeam: String) async {
        let attributes = MatchAttributes(homeTeam: homeTeam, awayTeam: awayTeam)
        let initialState = MatchAttributes.ContentState(
            homeScore: 0,
            awayScore: 0,
            matchStatus: .upcoming,
            lastEvent: "Match about to begin"
        )
        let content = ActivityContent(state: initialState, staleDate: nil)

        do {
            let activity = try Activity.request(
                attributes: attributes,
                content: content,
                pushType: .token
            )
            await MainActor.run { self.currentActivity = activity }
            observeActivityTokens(activity: activity)
        } catch {
            await MainActor.run { self.errorMessage = error.localizedDescription }
        }
    }

    // MARK: - Token Observation

    private func observeActivityTokens(activity: Activity<MatchAttributes>) {
        Task {
            for await tokenData in activity.pushTokenUpdates {
                let token = tokenData.map { String(format: "%02x", $0) }.joined()
                await MainActor.run { self.activityUpdateToken = token }
            }
        }
    }

    // MARK: - End Activity

    func endActivity() async {
        guard let activity = currentActivity else { return }
        let finalState = MatchAttributes.ContentState(
            homeScore: activity.content.state.homeScore,
            awayScore: activity.content.state.awayScore,
            matchStatus: .finished,
            lastEvent: "Full time!"
        )
        let finalContent = ActivityContent(state: finalState, staleDate: nil)
        await activity.end(finalContent, dismissalPolicy: .after(.now + 300))
        await MainActor.run {
            self.currentActivity = nil
            self.activityUpdateToken = nil
        }
    }

    // MARK: - Restore on App Launch

    func restoreExistingActivities() {
        for activity in Activity<MatchAttributes>.activities {
            currentActivity = activity
            observeActivityTokens(activity: activity)
            break
        }
    }
}
