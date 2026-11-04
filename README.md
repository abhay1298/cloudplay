# CLOUDPLAY

**Your Cloud Videos. One Place.**

CloudPlay is a self-hosted web app for playing, organizing and moving cloud videos. It's honest about what Diskwala and TeraBox allow: it plays what can legitimately be played, labels everything else, and never fakes playback, metadata or conversions.

> **Read [TECHNICAL_FEASIBILITY.md](TECHNICAL_FEASIBILITY.md) first.** Neither Diskwala nor TeraBox offers a documented way to play share links in a third-party app or to move a file from Diskwala to TeraBox automatically. CloudPlay therefore recognizes those links, opens them in the official apps, and provides a verified **manual transfer** workflow.

## Feature status

| Feature | Status |
|---|---|
| Universal player for direct MP4/WebM/Ogg/MOV links | ✅ Working |
| HLS (`.m3u8`) playback with real quality levels | ✅ Working (host must allow CORS) |
| Play video files from your device | ✅ Working (never uploaded) |
| Player controls: play/pause, seek, volume, speed 0.5–2x, fullscreen, picture-in-picture, keyboard shortcuts, touch (tap, double-tap seek), loading state, error + retry, resume | ✅ Working |
| Subtitles: tracks from the stream, or load a local `.vtt`/`.srt` | ✅ Working |
| Diskwala link recognition + Open in Diskwala | ✅ Working |
| Diskwala in-app playback | ❌ Unsupported: no official API |
| TeraBox share-link recognition + Open in TeraBox | ✅ Working |
| TeraBox in-app playback of share links | ❌ Unsupported: not documented |
| Automatic Diskwala → TeraBox transfer | ❌ Unsupported. The engine is implemented and tested with mocks, but no official source or destination API is available to plug into it. |
| Manual transfer with in-browser SHA-256 verification | ✅ Working |
| Library (save, search, filter, sort, continue watching, remove) | ✅ Working |
| Conversion and watch history | ✅ Working |
| Settings (theme, default speed, autoplay, resume, privacy) | ✅ Working |
| Security: SSRF guard, CSP, CSRF, rate limiting, validation | ✅ Working (see SECURITY.md) |
| PostgreSQL | ⚠️ Not implemented. SQLite only; the repository layer is isolated. |

## Prerequisites

- **Node.js 22.13 or newer** (uses the built-in `node:sqlite`; no native modules to compile)
- npm 10+
- For browser tests: Chromium for Playwright (`npx playwright install chromium`)

## Installation

```bash
npm install
```

```bash
cp .env.example .env.local
```

## Development server

```bash
npm run dev
```

Then open http://localhost:3000. Node prints an `ExperimentalWarning` for SQLite; that's expected.

## Production build

```bash
npm run build
```

```bash
npm start
```

`npm start` serves on port 3000. Use `npx next start -p 8080 -H 0.0.0.0` for a different port or interface.

## Tests

```bash
npm test
```

```bash
npm run test:e2e
```

```bash
npm run lint
```

`npm test` runs the unit and integration tests (Vitest, 91 tests). `npm run test:e2e` runs the 14 browser tests (Playwright: desktop, Pixel 7 and an iPhone Safari user agent, including installable-app checks) and needs `npm run build` first. `npm run lint` runs the TypeScript type check.

If you use a pre-installed Chromium, set `PW_CHROMIUM_PATH=/path/to/chromium`.

**About the tests:**
- Tests in `tests/unit/conversion.test.ts` marked **[MOCKED]** run the real transfer engine against in-memory mock adapters. They prove the engine logic (byte preservation, SHA-256 verification, failure handling, temp cleanup, honest progress). They **do not** prove compatibility with Diskwala or TeraBox.
- Playback and SSRF tests use a **real local HTTP server** standing in for an arbitrary media host. No provider is emulated.
- **Live integration tests against Diskwala and TeraBox have not been run.** There are no official APIs or credentials to test against.

## Environment variables

See [.env.example](.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_PATH` | `./data/cloudplay.db` | SQLite file |
| `API_TOKEN` | empty | Optional bearer token for non-browser clients |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-*` from your reverse proxy |
| `ALLOW_HTTP_MEDIA` | `false` | Allow `http://` direct media |
| `MAX_TRANSFER_BYTES` | 4 GiB | Transfer engine size cap |
| `MAX_CONCURRENT_TRANSFERS` | 2 | Transfer concurrency |
| `TRANSFER_TMP_DIR` | OS temp | Private temp directory for transfers |
| `TERABOX_CLIENT_ID` / `TERABOX_CLIENT_SECRET` | empty | Reserved for a future official integration (currently only changes the status shown in Settings) |

## Database setup

None required. The SQLite schema is created automatically on first start in `DATABASE_PATH`. Back it up by copying the `.db` file while the app is stopped, or use `sqlite3 cloudplay.db ".backup backup.db"`.

**PostgreSQL:** not implemented. To add it, reimplement the functions exported by `src/lib/database.ts` (same signatures) against `pg`. The tables are `library_items`, `watch_entries`, `conversions` and `settings`.

## API integration setup

### TeraBox Open Platform (official)
1. Read the official docs: https://www.terabox.com/integrations/docs
2. Apply for an Open Platform application through TeraBox and wait for approval. You receive a `client_id` and a `client_secret`.
3. Put them in `TERABOX_CLIENT_ID` and `TERABOX_CLIENT_SECRET`.
4. **Integration work still required:** implement `DestinationAdapter` in `src/services/conversion/adapters.ts` using the documented device-code OAuth (`/oauth/gettoken`, `/oauth/tokeninfo`) and upload flow (`/openapi/api/precreate` → `superfile2` → `/openapi/api/create`). Verify every parameter against the full docs. **Share-link creation is not documented**, so confirm with TeraBox before relying on it.

### Diskwala
No official API exists to integrate (as of 2026-11-04). Don't use third-party "Diskwala downloader" services; they aren't Diskwala and may violate its terms.

## Deployment

CloudPlay is a **single-user** app with no login system. On any network-reachable host:

1. Build: `npm ci && npm run build`.
2. Run under a process manager (systemd, pm2, Docker) with `NODE_ENV=production`, a persistent `DATABASE_PATH`, and Node 22.13+.
3. Put it behind a **TLS-terminating reverse proxy with authentication** (Caddy or nginx with basic auth, oauth2-proxy, Cloudflare Access, …). Set `TRUST_PROXY=true` and forward `X-Forwarded-Proto: https`; CloudPlay then sends HSTS and `upgrade-insecure-requests`.
4. Persist the `data/` directory and the transfer temp directory on a volume.
5. Serverless platforms (Vercel and similar) are **not** suitable: there's no persistent filesystem for SQLite and no long-running transfer jobs.

Example Caddyfile:
```
cloudplay.example.com {
  basicauth { you $2a$14$<bcrypt-hash> }
  reverse_proxy 127.0.0.1:3000
}
```

## Install on iPhone / iPad (iOS app)

CloudPlay is an installable **Progressive Web App**. On iOS it runs full-screen from the Home Screen with its own icon, like a native app.

1. Deploy CloudPlay to a server with **HTTPS** (see Deployment above). iOS only installs web apps from HTTPS sites, and the phone must be able to reach the server.
2. On the iPhone, open the site in **Safari**. On iOS 16.4+, other browsers also support this through their Share menu.
3. Tap **Share** (the square with an arrow), then **Add to Home Screen**, then **Add**. CloudPlay shows this hint once on iOS.
4. Launch **CloudPlay** from the Home Screen.

What the iOS app does:
- Full-screen standalone window, dark status bar, and layout padded for the notch and home indicator (`viewport-fit=cover` plus safe-area insets).
- **Play local videos** from Photos or Files ("Or play a video file from this device"). Files never leave the phone.
- HLS plays through Safari's native player. Fullscreen uses iOS's native video fullscreen; picture-in-picture works on iOS 14+. The volume slider is hidden because iOS only allows hardware volume buttons.
- A service worker caches app assets. Without a network, an offline page is shown. The library, history and playback need the server.

### Native iOS app (.ipa), sideloaded without the App Store
See **[IOS_APP.md](IOS_APP.md)**. GitHub Actions builds an unsigned `.ipa` on a Mac runner (no Mac needed). You install it with Sideloadly or AltStore using a free Apple ID; free-ID apps must be refreshed every 7 days.

### App Store (not set up)
A native `.ipa` can't be produced in a Linux environment. It needs a **Mac with Xcode** and an **Apple Developer Program** membership ($99/year). The usual route is a Capacitor shell that loads your hosted CloudPlay server. Keep in mind:
- The API routes and SQLite run on the server, so the native app would still need your hosted backend, or a rewrite to on-device storage.
- App Review may reject a thin web wrapper (Guideline 4.2, minimum functionality), and apps that facilitate access to third-party file-sharing content get extra scrutiny.

For personal use, the Home Screen install above gives the same experience without Apple's review.

## Known limitations

- Diskwala and TeraBox share links can't be played in-app or transferred automatically (see TECHNICAL_FEASIBILITY.md).
- Direct media from hosts without CORS can still play as progressive video, but HLS needs CORS for hls.js.
- Thumbnails aren't generated; they appear only if a provider supplies them, and today none do. Cards show a neutral placeholder.
- The rate limiter and job runner are in-memory and per process.
- Watch progress isn't saved for local files.
- The research couldn't read the official pages directly (network policy in the build environment), so some facts come from search excerpts. Each one is marked in TECHNICAL_FEASIBILITY.md.

## Project structure

```
src/
  app/                 pages (home, player, convert, library, history, settings) and API routes
  components/          Navbar, Sidebar, VideoPlayer, VideoControls, LinkInput, ConversionCard,
                       ManualTransfer, VideoCard, VideoLibrary, HistoryList, ErrorMessage, …
  services/
    diskwala/          link recognition + capability declaration
    terabox/           link recognition + capability declaration
    providers/         provider detection registry
    playback/          SSRF-guarded direct-media resolver
    conversion/        transfer engine, adapters, job runner, manual-transfer records
  lib/                 validation, security (SSRF, rate limit, CSRF), database, formatting
  types/               shared types
tests/unit             Vitest
tests/e2e              Playwright
```

## Legal

Use CloudPlay only with content you have the right to access and copy. It doesn't bypass passwords, logins, DRM or other access controls.
