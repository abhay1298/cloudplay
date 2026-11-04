# CloudPlay HTTP API

All endpoints are same-origin JSON APIs under `/api`. Rules:

- `POST`/`PUT`/`DELETE` need an `Origin` header matching `Host` (browsers send it automatically) **or** `Authorization: Bearer <API_TOKEN>` when `API_TOKEN` is set.
- Request bodies: `Content-Type: application/json`, at most 16 KiB.
- Errors: `{ "error": string, "code"?: string }`, with HTTP 400/403/404/413/415/429.
- Responses send `Cache-Control: no-store`.

---

## Playback

### `POST /api/resolve`
Identify a URL and decide whether it can be played. Rate limit: burst 20, refilling 1 per 2 s.

Request: `{ "url": "https://cdn.example.com/movie.mp4" }`

Response (playable):
```json
{
  "ok": true,
  "kind": "progressive",            // or "hls"
  "src": "https://cdn.example.com/movie.mp4",   // always the original URL
  "match": { "provider": "direct", "linkType": "direct-media", "shareId": null, "normalizedUrl": "...", "hostname": "cdn.example.com" },
  "metadata": { "fileName": "movie.mp4", "title": "movie.mp4", "contentType": "video/mp4", "format": "video/mp4", "fileSizeBytes": 1048576 }
}
```
Metadata fields are present **only** when obtained from the server's response (or, for HLS, the master manifest's `RESOLUTION`).

Response (not playable):
```json
{ "ok": false, "code": "UNSUPPORTED_PROVIDER_PLAYBACK", "provider": "terabox",
  "message": "…", "externalUrl": "https://www.terabox.com/s/1…", "match": { … } }
```
`code` is one of: `INVALID_URL`, `UNKNOWN_PROVIDER`, `BLOCKED_DESTINATION`, `UNSUPPORTED_PROVIDER_PLAYBACK`, `UNSUPPORTED_FORMAT`, `NOT_MEDIA`, `NOT_FOUND`, `ACCESS_DENIED`, `EXPIRED`, `TIMEOUT`, `UPSTREAM_ERROR`.

### `GET /api/watch`
`?url=<url>` returns `{ entry: WatchEntry | null }`. Without `url`, returns `{ items: WatchEntry[] }` (24 most recent).

### `POST /api/watch`
`{ url, positionSeconds, durationSeconds?, title? }` saves playback position. Only direct media URLs are accepted. Returns `{ ok, saved }`; `saved` is `false` when watch history is disabled in settings.

### `DELETE /api/watch`
Clears all watch history and saved positions.

## Library

### `GET /api/library?provider=&search=&sort=`
`provider` is one of `diskwala | terabox | direct`. `sort` is `added` (default) or `watched`. Returns `{ items: LibraryItem[] }`.

### `POST /api/library`
`{ url, title?, durationSeconds? }`. The URL must be a recognized Diskwala, TeraBox or direct media link. Re-adding the same URL updates it. Returns `201 { item }`.

### `DELETE /api/library/:id`

## Conversion

### `POST /api/convert`
`{ url }` must be a Diskwala sharing link (`/app/<id>`). Creates a job and runs the transfer engine in the background. Returns `202 { record }`. Rate limit: burst 10, refilling 1 per 5 s.

With the production adapters the job ends in **`unsupported`**. See TECHNICAL_FEASIBILITY.md.

### `GET /api/conversions/:id`
Poll a job: `{ record: ConversionRecord }`.

### `GET /api/conversions` / `DELETE /api/conversions`
List (most recent 200) or clear the history.

### `DELETE /api/conversions/:id`

### `POST /api/conversions/manual`
Record a transfer **the user performed** with the official apps.
```json
{
  "sourceUrl": "https://www.diskwala.com/app/abc123",
  "resultUrl": "https://www.terabox.com/s/1Xyz…",      // must be a TeraBox share link
  "fileName": "movie.mp4", "fileSizeBytes": 123,
  "originalSha256": "<64 hex>", "copySha256": "<64 hex>", "copySizeBytes": 123
}
```
Returns `201 { record }` with `mode: "manual"`, `status: "completed"`, and a `verification` report that compares the checksums when both are given.

### `ConversionRecord`
```ts
{
  id: string; mode: "automatic" | "manual";
  status: "waiting" | "validating" | "resolving_source" | "downloading" | "uploading"
        | "verifying" | "generating_share_link" | "completed" | "failed" | "unsupported";
  sourceUrl: string; resultUrl: string | null;
  fileName: string | null; fileSizeBytes: number | null;
  progress: number | null;        // 0..<1 during byte transfer; null when not measurable; 1 only when completed
  error: string | null;
  verification: { sizeMatch: boolean|null; checksumMatch: boolean|null; sourceSha256: string|null;
                  destinationChecksum: string|null; notes: string[] } | null;
  steps: { status, at, detail }[]; // every state actually entered
  createdAt: string; updatedAt: string;
}
```

## Settings and capabilities

### `GET /api/settings` / `PUT /api/settings`
```json
{ "theme": "dark|light|system", "defaultSpeed": 0.5|0.75|1|1.25|1.5|1.75|2,
  "autoplay": false, "resumePlayback": true, "saveWatchHistory": true }
```
`PUT` accepts a partial object. Unknown keys are rejected.

### `GET /api/capabilities`
The provider capability matrix, plus `automaticConversion: { available, reason, credentialsConfigured }`.

---

## Extending: adding an official integration
Implement the interfaces in `src/services/conversion/adapters.ts` against a **documented** API:

```ts
interface DestinationAdapter {
  readiness(): { ready: true } | { ready: false; reason; kind };
  upload(filePath, { fileName, sizeBytes, sha256, md5 }, onProgress, signal): Promise<{ remoteId, remoteSizeBytes?, remoteChecksum? }>;
  stat(remoteId, signal): Promise<{ sizeBytes?, checksum? }>;
  createShareLink(remoteId, signal): Promise<string>;
}
```
Then wire it up in `src/services/conversion/jobs.ts` and update the capability entries in `src/services/*/index.ts`. The engine already handles hashing, verification, progress, size limits and temp-file cleanup.
