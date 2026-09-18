# CoreLog iOS POC

This folder contains the first SwiftUI proof of concept for CoreLog. It lists entries, opens entry details, and creates text/tag entries through the existing `/api` routes.

## Open in Xcode

1. Install the full Xcode app and select it in Xcode's command line tools settings.
2. Open `CoreLog/CoreLog.xcodeproj`.
3. The Swift files in the `CoreLog` folder are already part of the app target.
4. For the iPhone Simulator, leave the API URL as `http://localhost:3002`.
5. For a physical iPhone, replace `localhost` in `CoreLogAPI.swift` with the Mac's local-network IP, then run `npm run dev` from the repository root.

The physical-device setup will eventually need HTTPS and authentication before the server is exposed beyond a trusted local network.
