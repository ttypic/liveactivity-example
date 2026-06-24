import ActivityKit
import Foundation

struct MatchAttributes: ActivityAttributes {
    let homeTeam: String
    let awayTeam: String

    struct ContentState: Codable, Hashable {
        var homeScore: Int
        var awayScore: Int
        var matchStatus: MatchStatus
        var lastEvent: String

        enum MatchStatus: String, Codable, Hashable {
            case upcoming
            case live
            case finished
        }
    }
}
