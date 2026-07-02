import Ably
import Foundation

// Registers this device with Ably for Live Activity push-to-start.
//
// Uses the ably-cocoa branch API `push.activate(pushToStart:)`, which activates
// the device with ONLY the Live Activity push-to-start token — it does not
// request a normal APNs device token. Authentication uses Ably token auth via
// the server's `authUrl` endpoint, so the API key never reaches the device.
@Observable
final class AblyPushManager: NSObject, ARTPushRegistererDelegate {
    var isActivating = false
    var isActivated = false
    var deviceId: String?
    var statusMessage: String?
    var errorMessage: String?

    // Retained for the lifetime of the activation so its push registerer
    // delegate (self) stays wired and the device state persists.
    private var rest: ARTRest?

    // Activate the device with Ably using the Live Activity push-to-start token.
    // `serverBaseURL` is the base of the dashboard server (its `/api/auth`
    // endpoint mints the Ably TokenRequest consumed via authUrl).
    func activate(serverBaseURL: String, pushToStartToken: String, sandbox: Bool) {
        let base = serverBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let authUrl = URL(string: "\(base)/api/auth") else {
            errorMessage = "Invalid server URL"
            return
        }

        let options = ARTClientOptions()
        options.authUrl = authUrl
        options.authMethod = "GET"
        options.pushRegistererDelegate = self
        // Match the server's Ably environment. In sandbox mode the server mints
        // tokens against the "sandbox" environment, so the client must use it too.
        if sandbox {
            options.environment = "sandbox"
        }
        let rest = ARTRest(options: options)
        self.rest = rest

        isActivating = true
        isActivated = false
        errorMessage = nil
        statusMessage = "Activating device with push-to-start token…"

        rest.push.activate(pushToStart: pushToStartToken)
    }

    func deactivate() {
        statusMessage = "Deactivating device…"
        rest?.push.deactivate()
    }

    // MARK: - ARTPushRegistererDelegate

    func didActivateAblyPush(_ error: ARTErrorInfo?) {
        DispatchQueue.main.async {
            self.isActivating = false
            if let error {
                self.isActivated = false
                self.errorMessage = "Activation failed: \(error.message)"
                self.statusMessage = nil
            } else {
                self.isActivated = true
                self.errorMessage = nil
                self.deviceId = self.rest?.device.id
                self.statusMessage = "Device activated for push-to-start"
            }
        }
    }

    func didDeactivateAblyPush(_ error: ARTErrorInfo?) {
        DispatchQueue.main.async {
            self.isActivated = false
            self.deviceId = nil
            if let error {
                self.errorMessage = "Deactivation failed: \(error.message)"
            } else {
                self.errorMessage = nil
                self.statusMessage = "Device deactivated"
            }
        }
    }

    func didAblyPushRegistrationFail(_ error: ARTErrorInfo?) {
        DispatchQueue.main.async {
            self.isActivating = false
            self.errorMessage = "Registration failed: \(error?.message ?? "unknown error")"
        }
    }
}
