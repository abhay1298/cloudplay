# CloudPlay iOS app (.ipa), installed without the App Store

CloudPlay's iOS app is a native wrapper (Capacitor 8, WKWebView) around **your hosted CloudPlay server**. GitHub's Mac computers build it, so **you don't need a Mac**. You install it with **Sideloadly** or **AltStore** using a free Apple ID.

> **Start with [DEPLOY.md](DEPLOY.md).** The app needs your CloudPlay server. The library, history and settings live there. Deploy the server first (README → Deployment) and make sure it's reachable over **https://** from your phone.

## Step 1: Build the .ipa on GitHub

**Automatic:** put your server address in `native-config/server-url.txt` and commit it, or send it to Claude. GitHub then builds the app by itself and publishes `CloudPlay-1.0.0.ipa` on the repository's **Releases** page: https://github.com/abhay1298/cloudplay/releases

**Manual alternative:**

1. Push this project to a GitHub repository.
2. On GitHub, open the repository, then **Actions → Build iOS app (.ipa) → Run workflow**.
3. Enter:
   - **server_url**: your CloudPlay address, e.g. `https://cloudplay.example.com`
   - **version**: e.g. `1.0.0`
4. Wait about 5–10 minutes for the build.
5. Open the finished run and download the **CloudPlay-ios-…** artifact under **Artifacts**. Unzip it to get `CloudPlay-1.0.0.ipa`.

GitHub Actions minutes: public repositories build free. Private repositories use your free monthly minutes, and macOS minutes count 10× (one build uses roughly 50–100 of the 2,000 free minutes).

The server address is built into the app. If it changes, run the workflow again.

## Step 2: Install on your iPhone (pick one)

### Option A: Sideloadly (Windows or Mac), simplest
1. Install **Sideloadly** from https://sideloadly.io and, on Windows, **iTunes and iCloud from Apple's website** (not the Microsoft Store versions).
2. Connect your iPhone by USB and tap **Trust** on the phone.
3. Drag `CloudPlay-1.0.0.ipa` into Sideloadly, enter your Apple ID, and click **Start**.
4. On the iPhone: **Settings → General → VPN & Device Management →** your Apple ID → **Trust**.
5. On iOS 16+: **Settings → Privacy & Security → Developer Mode → On**. The phone restarts; confirm.
6. Open **CloudPlay**.

### Option B: AltStore (automatic refresh)
1. Install **AltServer** on your Windows PC or Mac from https://altstore.io, then install **AltStore** on the iPhone through it.
2. Send the `.ipa` to the phone (AirDrop, Files, iCloud Drive), open AltStore → **My Apps → +**, and pick the file.
3. Trust the developer and enable Developer Mode as in Option A, steps 4–5.
4. AltStore re-signs the app in the background whenever the phone and AltServer are on the same Wi-Fi.

### Free Apple ID limits (set by Apple)
- The app **expires after 7 days**. Re-install it with Sideloadly, or let AltStore refresh it. Your data is on the server, so nothing is lost.
- At most 3 sideloaded apps per device.
- A paid Apple Developer account ($99/year) removes the 7-day limit (1-year signing). Sideloadly accepts paid accounts too.

## What's inside the app
- App name **CloudPlay**, bundle ID `com.cloudplay.app` (Sideloadly may change it for free accounts).
- iOS 15+, iPhone and iPad, portrait and landscape.
- Dark launch screen, CloudPlay icon, white status bar text.
- Background audio and picture-in-picture for video.
- The camera, microphone and photo-library permission prompts appear only if you pick "Take Video" or a library video in the file picker. Videos stay on the phone.
- External links ("Open in TeraBox", "Open in Diskwala", "Open TeraBox") open in Safari or the provider's app.
- If the server has `APP_PASSWORD` set, you sign in once and stay signed in for a year.
- If the server can't be reached, a "Can't reach your CloudPlay server" screen with **Try again** appears.

## Status, honestly
- The Xcode project was generated with the Capacitor CLI and configured in a Linux environment. **It hasn't been compiled yet.** The first GitHub Actions run is the first real build. If it fails, download the `xcodebuild-log` artifact and send me the error.
- The app adds no features beyond the website. Diskwala and TeraBox limitations are unchanged (TECHNICAL_FEASIBILITY.md).
- App Store submission isn't set up and would likely face review issues (Guideline 4.2, thin web wrapper).

## For developers

```bash
CLOUDPLAY_SERVER_URL=https://cloudplay.example.com npx cap sync ios
```
```bash
npx cap open ios
```
`cap sync` writes the config into the Xcode project. `cap open` (on a Mac) opens Xcode, where you can run on a device with your own signing team.

- Native config: `capacitor.config.ts` (rejects non-https server URLs).
- Native project: `ios/App` (Swift Package Manager; no CocoaPods).
- Fallback screens: `native-shell/www/index.html` (no server configured) and `error.html` (server unreachable).
- CI: `.github/workflows/ios-ipa.yml`.
