import ActivityKit
import SwiftUI
import WidgetKit

struct MatchScoreLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MatchAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.85))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    TeamScoreView(
                        team: context.attributes.homeTeam,
                        score: context.state.homeScore,
                        alignment: .leading
                    )
                }
                DynamicIslandExpandedRegion(.trailing) {
                    TeamScoreView(
                        team: context.attributes.awayTeam,
                        score: context.state.awayScore,
                        alignment: .trailing
                    )
                }
                DynamicIslandExpandedRegion(.center) {
                    StatusBadge(status: context.state.matchStatus)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.lastEvent)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                }
            } compactLeading: {
                Text("\(context.state.homeScore)")
                    .font(.headline).bold()
                    .monospacedDigit()
            } compactTrailing: {
                Text("\(context.state.awayScore)")
                    .font(.headline).bold()
                    .monospacedDigit()
            } minimal: {
                Text("\(context.state.homeScore)-\(context.state.awayScore)")
                    .font(.caption2).bold()
                    .monospacedDigit()
            }
        }
    }
}

// MARK: - Lock Screen View

private struct LockScreenView: View {
    let context: ActivityViewContext<MatchAttributes>

    var body: some View {
        HStack(spacing: 0) {
            TeamScoreView(
                team: context.attributes.homeTeam,
                score: context.state.homeScore,
                alignment: .center
            )
            .frame(maxWidth: .infinity)

            VStack(spacing: 6) {
                StatusBadge(status: context.state.matchStatus)
                Text(context.state.lastEvent)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity)

            TeamScoreView(
                team: context.attributes.awayTeam,
                score: context.state.awayScore,
                alignment: .center
            )
            .frame(maxWidth: .infinity)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
    }
}

// MARK: - Subviews

private struct TeamScoreView: View {
    let team: String
    let score: Int
    let alignment: HorizontalAlignment

    var body: some View {
        VStack(alignment: alignment, spacing: 2) {
            Text(team)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Text("\(score)")
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .monospacedDigit()
                .contentTransition(.numericText())
        }
    }
}

private struct StatusBadge: View {
    let status: MatchAttributes.ContentState.MatchStatus

    var body: some View {
        Text(status.rawValue.uppercased())
            .font(.caption2)
            .fontWeight(.bold)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(badgeColor.opacity(0.25))
            .foregroundStyle(badgeColor)
            .clipShape(Capsule())
    }

    private var badgeColor: Color {
        switch status {
        case .upcoming: return .blue
        case .live: return .red
        case .finished: return .gray
        }
    }
}
