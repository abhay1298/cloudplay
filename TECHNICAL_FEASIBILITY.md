# CloudPlay: Technical Feasibility Report

_Research date: 2026-11-04. Re-check before you integrate anything, because both services change without notice._

## 0. How this research was done, and its limits

- **Method:** web searches for official documentation, then attempts to read the official pages directly.
- **Limitation:** the build environment's network policy blocked direct page fetches to `www.terabox.com` and `diskwala.com` (DNS `ENOTFOUND`). Everything about official pages below comes from **search-engine excerpts of those pages**, not a full read. Where a fact could not be confirmed, it says **"not verified"**.
- **Rules followed:** no endpoint was inferred because it "seemed logical". Unofficial libraries, downloaders and reverse-engineered "APIs" were **not** treated as official. They are listed in §10 only so you know they exist and were deliberately not used.

---

## 1. Diskwala: verified capabilities

| Question | Finding | Confidence |
|---|---|---|
| What is it? | A file hosting and monetization platform. Creators upload videos and other files, and viewers access them mainly through the Diskwala mobile app. Uploads go through a web dashboard or Telegram bots. | Medium (official `diskwala.com/branding` page title and description in search results) |
| Official domain | `diskwala.com` (`www.diskwala.com`) | Medium |
| Share-link format | `https://www.diskwala.com/app/<FILE_ID>` | **Low.** Reported only by third-party sites. Another third-party page mentions `/share/...`. **Not verified** in official documentation. |
| Public developer API | **None found.** Searches for "Diskwala API developer documentation" returned no Diskwala results. | Medium (absence of evidence) |
| Authorized embedding / web playback | **None found.** Third-party sites say links are "usually opened in the Diskwala app". | Medium |
| Authorized download / export API | **None found.** | Medium |
| Look-alike domains | `diskwaala.com`, `playdiskwala.in` and many "Diskwala player/downloader" sites are **third parties**, not Diskwala. | High (`diskwaala.com` says so itself) |
| Terms of service | **Could not be read** (fetch blocked). Not verified. | n/a |

**Conclusion:** CloudPlay can **recognize** Diskwala links and **open them in Diskwala**. It cannot legitimately play, download or export Diskwala content.

## 2. TeraBox: verified capabilities

| Question | Finding | Confidence |
|---|---|---|
| Official developer documentation | **TeraBox Open Platform Integration Document**: `https://www.terabox.com/integrations/docs` | High (official domain) |
| Authentication | User authorization by **device-code / QR-code flow**: send the user to a TeraBox login page or have them scan a QR code in the TeraBox app, then poll with the device code to get an `access_token`. Token endpoint: `POST /oauth/gettoken` (with `client_id`). Token info: `/oauth/tokeninfo` returns an `api_domain` and an `upload_domain`, which can differ per user. | Medium-High (excerpts of the official doc) |
| Getting credentials | You must **apply for an Open Platform app and wait for approval** (from a third-party note). The application process is **not verified**. | Low-Medium |
| File APIs (user's own files) | Under `/openapi/api/`: `quota`, `precreate`, `create`, `filemanager`, `list`, `filemetas`, `search`, `download`, streaming | Medium (path list from excerpts; **parameters not verified**) |
| Upload flow | `/openapi/api/precreate` (pre-upload, `access_tokens` query parameter) → chunk upload to `upload_domain` at `/rest/2.0/pcs/superfile2` → `/openapi/api/create`, whose `block_list` is a JSON list of per-chunk **MD5** hashes that must match `precreate` | Medium (excerpts; chunk size and response fields **not verified**) |
| Create a public share link via API | **Not found** in the official documentation excerpts | Medium (absence) |
| Resolve or play **someone else's** share link via official API | **Not found.** The Open Platform is scoped to "user-authorized resources". | Medium |
| Import from external URL (remote/offline download) | **Not found** in official docs | Medium (absence) |
| Embedded playback of share links | **Not documented** | Medium |
| Share-link formats | `/s/1<id>` and `/sharing/link?surl=<id>`. A urlscan record shows `1024terabox.com/s/1…` redirecting to `terabox.app/sharing/link?surl=…`. | Medium (third-party observations) |
| Share domains | `terabox.com` (official). Also observed in several independent sources: `terabox.app`, `1024terabox.com`, `teraboxapp.com`, `1024tera.com`, `nephobox.com`, `4funbox.com`, `mirrobox.com` | Medium |
| Download links (`dlink`) | Third-party projects note signed, short-lived URLs that need session cookies. **Not used.** | n/a |

**Conclusion:** an official API exists for **a signed-in user's own files** (list, metadata, upload, download, streaming). It requires an approved app and the user's OAuth consent. **Share-link creation is not documented**, so a fully automatic "produce a TeraBox share link" step can't be built on documented APIs. Playing third-party share links in-app isn't supported by any documented API.

## 3. Available official APIs (summary)

| Service | Official API | Status in CloudPlay |
|---|---|---|
| Diskwala | None found | Link recognition plus "Open in Diskwala" only |
| TeraBox | Open Platform (OAuth device flow plus `/openapi/api/*`) | **Not integrated.** Parameter-level documentation couldn't be verified, and share creation is undocumented. An adapter interface is ready (`src/services/conversion/adapters.ts`). |

## 4. Authentication requirements

- **Diskwala:** none for CloudPlay, since nothing is integrated. CloudPlay never asks for Diskwala credentials.
- **TeraBox Open Platform:** an approved `client_id` / `client_secret` plus a per-user OAuth `access_token` from the device-code flow. Tokens must stay server-side, encrypted at rest. CloudPlay doesn't implement this flow yet, so it stores no tokens.

## 5. Supported video playback methods

| Source | Method | Works? |
|---|---|---|
| Direct HTTPS media (MP4/H.264+AAC, WebM, Ogg, MOV/H.264) | HTML5 `<video>` loading the original URL in the user's browser | **Yes** |
| Direct HLS (`.m3u8`) | hls.js (MSE) or native HLS (Safari). Quality menu shown only when the manifest has more than one variant. | **Yes**, if the host allows CORS |
| Local file on the user's device | `blob:` object URL; never uploaded | **Yes** |
| Diskwala share links | n/a | **No.** No authorized method. |
| TeraBox share links | n/a | **No.** No documented method for third-party shares. |
| MKV / AVI / FLV / WMV / MPEG-TS | n/a | Reported as an **unsupported format**; browsers can't play them reliably |

## 6. Conversion (Diskwala → TeraBox) feasibility

| Step | Feasible via official means? |
|---|---|
| Identify Diskwala file | Link recognition only |
| Retrieve original bytes from Diskwala | **No.** No API or authorized download. |
| Upload to TeraBox | Documented for the user's own account (precreate/superfile2/create), but parameters are unverified and it isn't integrated |
| Verify the uploaded file | Partially: `filemetas` likely exposes size and possibly MD5 (unverified) |
| Generate a TeraBox share link | **No documented endpoint** |

**Verdict:** automatic conversion is **not feasible** today. The first step (getting the bytes from Diskwala) has no legitimate mechanism, and the last step (share link) isn't documented. CloudPlay:

1. runs a **real conversion engine** (streaming download, SHA-256/MD5 hashing, private temp files, upload, verification, share link, guaranteed cleanup) behind an adapter interface. With the production adapters it ends honestly in **`unsupported`**.
2. offers a **manual transfer workflow**: open in Diskwala, download if permitted, upload through the official TeraBox interface, paste the share link. Optional **in-browser SHA-256 fingerprinting** of the original and of a copy re-downloaded from TeraBox proves byte-identical preservation. These records are labeled **Manual transfer** everywhere.

## 7. Unsupported operations (deliberately not implemented)

- Extracting media URLs from Diskwala or TeraBox web pages, scraping, or reverse-engineered endpoints
- Using browser session cookies (`ndus`, `jsToken`, …) to call internal TeraBox endpoints
- Unlocking password-protected shares, bypassing logins, DRM or access controls
- Creating TeraBox share links
- Importing into TeraBox from a remote URL
- Generating fake quality options, thumbnails, or metadata

## 8. Security considerations

- The server **never fetches Diskwala or TeraBox**. The only outbound request is a header probe of user-supplied **direct media URLs**, guarded against SSRF (see `SECURITY.md`).
- Playback of direct media happens in the user's browser, from the original URL.
- No provider credentials, cookies or passwords are accepted or stored.
- The transfer engine writes to a `0700` temp directory and always deletes it.

## 9. Implementation decisions

1. **Provider recognition uses explicit domain allowlists**, with look-alike domains explicitly rejected.
2. **Original links are never rewritten** to another domain.
3. **Capability matrix in code** (`CAPABILITIES`) drives the UI's "Feature availability" indicators, so the UI can't claim more than the code does.
4. **Adapter pattern for transfers.** A future official TeraBox integration only needs to implement `DestinationAdapter` (`upload`, `stat`, `createShareLink`). The engine, verification, progress and UI already exist and are tested with clearly labeled mocks.
5. **SQLite via Node's built-in `node:sqlite`** (no native build). The repository layer is isolated in `src/lib/database.ts` so it can be replaced with PostgreSQL. A PostgreSQL implementation is **not** included.
6. **Single-user deployment model.** There is no user-account system. Protect a public deployment with an authenticating reverse proxy (see README).

## 10. Sources

Official or first-party:
- TeraBox Open Platform Integration Document: https://www.terabox.com/integrations/docs (read through search excerpts; direct fetch blocked)
- Diskwala branding/about page: https://diskwala.com/branding (search excerpt only)
- TeraBox iOS app listing: https://apps.apple.com/de/app/terabox/id1509453185

Third-party (context only, **not** treated as official):
- Netify TeraBox application profile (domains): https://www.netify.ai/resources/applications/terabox
- urlscan redirect record for a 1024terabox share link: https://urlscan.io/result/019bd7eb-c0b3-7456-b897-39984c2a7435
- Apify TeraBox actor (domain/link-format list): https://apify.com/khadinakbar/terabox-video-downloader.md
- Unofficial TeraBox libraries (cookie/jsToken based, NOT used): https://pypi.org/project/aioterabox/, https://pypi.org/project/terabox-gateway/, https://github.com/Pahadi10/terabox-upload-tool, https://herobenhero.github.io/1024TeraBox-REST-API/index.html
- Third-party Diskwala "players" (not Diskwala; link-format claims): https://diskwaala.com/video-player, https://playdiskwala.in/, https://teradl.in/diskwala.html
- Diskwala APK listing: https://apkpure.com/diskwala-app/com.diskwalaapp
- Diskwala comparison article: https://bytedisk.net/blog/diskwala-alternative-india

### To finish verification

1. From a normal network, read the full TeraBox Open Platform docs and the developer application process.
2. Confirm whether a share-creation or "offline download" endpoint exists for approved apps (ask TeraBox developer support).
3. Contact Diskwala to ask whether any partner API or export mechanism exists.
4. Update `src/services/*/index.ts` capability entries and implement adapters **only** against what you confirm.
