import SwiftUI

@main
struct CoreLogApp: App {
    @StateObject private var store = EntryStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
        }
    }
}
