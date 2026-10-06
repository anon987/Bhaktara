# Media on Cloudflare R2

Implements doc 22 Part A (D-031) with the guardrails in doc 23. Public media lives in R2 behind the Cloudflare CDN; Firestore stores asset keys, never URLs.

## How it fits together

| Piece | Where | Notes |
| --- | --- | --- |
| Key format, validation, URL join | `src/domain/media.ts` | `{type}/{id}/{variant}.{hash8}.{ext}`; rejects URLs, `..`, query/hash |
| CDN base for a build | `EXPO_PUBLIC_MEDIA_BASE_URL` → `src/services/media/config.ts` | HTTPS only (HTTP allowed for localhost/127.0.0.1/10.0.2.2 testing). Unset = bundled placeholder art |
| Rendering | `src/components/DevotionalArt.tsx` | CDN keys load from R2; `placeholder/` keys, unconfigured builds and failed loads fall back to local symbolic art |
| Variant choice | Lists use `thumb`; Content detail uses `mobile` → `poster` → `thumb` (doc 22 §A5) | |
| Renditions + upload | `npm run media:publish` (`scripts/media/`) | ffmpeg processing, SHA-256 content addressing, immutable cache headers |
| Bucket CORS | `infra/r2/cors.json` | Public GET/HEAD with `Range` for audio/video seeking |
| Admin uploads | `requestUploadUrl` (presigned `staging/` PUT) → `processMedia` → Cloud Run `services/media-processor` | Same renditions as `media:publish`; see [MEDIA_PROCESSOR.md](MEDIA_PROCESSOR.md) |

Doc 06 reserves `appConfig/app.mediaBaseUrl` for a runtime override; that is not wired yet, so the CDN base is a build-time value. Because data holds only keys, changing the domain later needs a rebuild, not a data migration.

## Provisioned resources

| Env | Bucket | Location | Public read address | Status |
| --- | --- | --- | --- | --- |
| dev | `bhaktara-media-dev` | APAC | `https://pub-f2496a49baf34c8cbafe81d0b6cf0550.r2.dev` (r2.dev, rate-limited, dev only) | Created 2026-10-04 |
| staging / prod | not created | | needs a Bhaktara domain (D-047) | |

`infra/r2/cors.json` holds the dev CORS policy: public GET/HEAD with Range for the app, and PUT with `Content-Type` from the admin origins (bhaktara-dev.web.app, bhaktara-dev.firebaseapp.com, local Vite) for presigned admin uploads. **The PUT rule is not applied to the bucket yet (2026-10-06)**: it needs Cloudflare account access (`npx wrangler login`, then `npx wrangler r2 bucket cors set bhaktara-media-dev --file infra/r2/cors.json`); the R2 object token cannot change bucket settings. Public PUT and DELETE return 401. One synthetic test object, `test/pipeline-check.a1c76cb2.webp`, confirmed public serving, `image/webp` content type, byte-identical download, and HTTP Range (206) for audio seeking. It was uploaded through the Cloudflare API, which cannot set `Cache-Control`; real media must go through `media:publish`. `.env.local` (Git-ignored) points dev builds at this address. No API token, custom domain or DNS record exists yet.

## Environments (doc 23 §2)

| Env | Bucket | CDN hostname |
| --- | --- | --- |
| dev | `bhaktara-media-dev` | `media-dev.<domain>` |
| staging | `bhaktara-media-staging` | `media-staging.<domain>` |
| prod | `bhaktara-media-prod` | `media.<domain>` |

Dev is the default. `media:publish` refuses any bucket not ending in `-dev` unless `--confirm-bucket <bucket>` repeats its name. Staging/prod changes, DNS changes, cache purges and API-token creation require explicit owner approval (doc 23 §5).

## One-time provisioning (dev)

Authenticate once with `npx wrangler login`, or use the Cloudflare MCP server after `/reload-plugins`.

```sh
# APAC placement hint: most listeners are in India.
npx wrangler r2 bucket create bhaktara-media-dev --location apac
npx wrangler r2 bucket cors set bhaktara-media-dev --file infra/r2/cors.json
```

Public read access, choose one:

- **Custom domain (recommended, required for staging/prod).** The domain must be a zone in the same Cloudflare account. This creates a DNS record, so it needs owner approval:
  ```sh
  npx wrangler r2 bucket domain add bhaktara-media-dev --domain media-dev.<domain> --zone-id <zone-id> --min-tls 1.2
  ```
- **r2.dev URL (dev only).** Rate-limited, not CDN-cached, and not for production:
  ```sh
  npx wrangler r2 bucket dev-url enable bhaktara-media-dev
  ```

Never make a bucket publicly writable. Uploads use credentials; reads are public.

## Operator credentials

Create an R2 API token in the Cloudflare dashboard (R2 → Manage API tokens) with **Object Read & Write**, scoped to `bhaktara-media-dev` only. Save it in `.env.r2` at the project root (Git-ignored by the `.env.*` rule):

```sh
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=bhaktara-media-dev
```

Never prefix these with `EXPO_PUBLIC_`: Expo inlines those into the app bundle. The scripts never print them.

## Publishing media

```sh
# Wallpaper: master ≥ 1080×2400 (1440×3200 recommended) → thumb, mobile (WebP), full (JPEG)
npm run media:publish -- --type wallpaper --id wallpaper-1 --image master.png
# Bhajan/aarti/mantra/chalisa: AAC 128 kbps stream at −16 LUFS + square thumb
npm run media:publish -- --type bhajan --id bhajan-1 --audio song.wav --image cover.png
# Ringtone: 20–30 s → MP3 file + thumb
npm run media:publish -- --type ringtone --id ringtone-1 --audio bell.wav --image cover.png
# Status: 15–30 s → 720×1280 H.264 MP4 + poster + thumb (poster from --image, or 1 s in)
npm run media:publish -- --type status --id status-1 --video clip.mp4
# Banner / deity art: mobile + thumb
npm run media:publish -- --type deity --id hanuman --image hanuman.png
```

Add `--dry-run` to process locally into `media-out/` (Git-ignored) without uploading. Every rendition is stripped of EXIF/GPS and encoder metadata. Objects are uploaded with `Cache-Control: public, max-age=31536000, immutable`; a changed file gets a new key, so caches never need purging. Re-running with unchanged input skips existing objects.

The command prints the `media` object (keys plus `bytes`, `mime`, dimensions, duration, bitrate) for the Firestore content document (doc 06). Writing that document is a separate step (`content:import`, or the CMS upload flow in [MEDIA_PROCESSOR.md](MEDIA_PROCESSOR.md), which runs the same pipeline on Cloud Run).

Limitations: silence trimming is not automated; review audio before publishing. Image EXIF orientation is not applied, so export masters upright. Audio playback and native save/set (expo-audio, MediaStore) belong to the native milestone and need a development-build rebuild.

## Point the app at the CDN

```sh
EXPO_PUBLIC_MEDIA_BASE_URL=https://media-dev.<domain> npm start -- --clear
```

Use `--clear` whenever this value changes; Metro caches inlined `EXPO_PUBLIC_*` values.

## Verification

- `npm test`: key/URL/base validation, schema rejection of URLs, remote art with fallback (`tests/media.test.tsx`).
- `npm run media:publish -- --dry-run …`: every type was exercised with synthetic inputs, including rejection of short ringtones, undersized wallpapers, missing inputs, unsafe IDs, missing credentials and non-dev buckets. EXIF/GPS stripping was confirmed on JPEG input.
- After provisioning: publish one asset, fetch it with `curl -I` through the CDN hostname, and confirm `cache-control`, `content-type` and `cf-cache-status` on the second request.
