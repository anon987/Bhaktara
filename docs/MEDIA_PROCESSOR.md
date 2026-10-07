# processMedia: admin media processing (Cloud Run)

Implements doc 22 §A4 step 4 (admin upload). Upload slots and storage layout are in [MEDIA_R2.md](MEDIA_R2.md).

```text
admin web ──requestUploadUrl──▶ Cloud Function ──presigned PUT──▶ admin web ──PUT──▶ R2 staging/{id}/{uuid}.{ext}
admin web ──processMedia──────▶ Cloud Function (role + DRAFT check)
                                   │  POST /v1/process, Authorization: Bearer <Google OIDC token>
                                   ▼
                                Cloud Run media-processor (ffmpeg)
                                   │  download staging → validate → render (scripts/media) → upload
                                   │  {type}/{id}/{variant}.{hash8}.{ext} → receipt → delete staging
                                   ▼
                                Cloud Function writes content.media + auditLogs entry (one transaction)
```

| Piece | Where |
| --- | --- |
| Wire contract (Zod), input rules per type | `src/domain/mediaProcessing.ts` |
| Callable, processor client, OIDC token | `functions/src/media.ts` (`processMedia` in `functions/src/index.ts`) |
| Processor service | `services/media-processor/` (`src/main.ts` config, `server.ts` HTTP, `auth.ts` OIDC, `processor.ts` pipeline, `store.ts` R2 or local directory) |
| Renditions, keys, R2 client | `scripts/media/process.ts`, `publish.ts`, `r2.ts` (shared with `media:publish`) |

## Callable API (admin web app)

`processMedia({ contentId, inputs })`. Roles: SUPER_ADMIN, CONTENT_ADMIN, EDITOR (`content.upload`). The content item must be `DRAFT`.

- `inputs`: `{ audio?, image?, video? }`. Each value is a `key` returned by `requestUploadUrl` for the same `contentId` (`staging/{contentId}/{uuid}.{ext}`). The media type comes from the stored content document. Requirements per type are in `mediaInputRules`:
  - BHAJAN / AARTI / MANTRA / CHALISA / RINGTONE: `audio` + `image` (thumbnail).
  - WALLPAPER: `image`.
  - STATUS: `video`, with an optional `image` for the poster (otherwise a frame 1 s in).
- Returns `{ contentId, media, durationSeconds, warnings, changed }`. `media` is the full merged `content.media`. Produced slots are replaced and other slots are kept. `warnings` holds advisory notes such as "master below 1440×3200". When `changed` is false, the retry changed nothing and no audit entry was written.
- Errors (`HttpsError` code → meaning):
  - `permission-denied`: the role cannot upload.
  - `invalid-argument`: bad input. `details.issues` lists `{ path, message }`. Also returned when the file is too large (`details.reason: "TOO_LARGE"`).
  - `not-found`: the content item, or the staging upload, is missing. Upload again.
  - `failed-precondition`: the item is not DRAFT, processing is not configured, or the file breaks a production rule (`details.reason: "INVALID_MEDIA"`). For a rule failure, the message is safe to show, e.g. "Ringtones must be 20–30 s".
  - `unavailable`: the processor failed or timed out. Retrying is safe.
- The callable timeout is 540 s. Set the client `httpsCallable` timeout to match (for example `{ timeout: 540_000 }`). The callable checks DRAFT again inside the write transaction. Replaced keys are recorded in the audit `beforeSummary` for the 30-day cleanup (doc 09 §5).

## Processor behaviour

- **Input**: a strict Zod schema. Keys outside `staging/{contentId}/` are rejected, as are unknown fields, types or extensions, and missing or extra inputs. The body limit is 16 KiB.
- **Limits**: the staging size limits are the same as the upload slot (40 MB images, 200 MB audio, 300 MB video), enforced while streaming. ffprobe must find the expected stream. Audio is limited to 2 h, video to 120 s and 4096 px per side, and images to 12,000 px per side. The doc 12 §6 rules in `process.ts` (ringtone 20–30 s, status 15–30 s, wallpaper ≥ 1080×2400) answer HTTP 422 with an operator-readable message. Each ffmpeg/ffprobe run is killed after 15 minutes.
- **Idempotent**: variant keys are content-addressed, and existing objects are not rewritten. After uploading, the processor writes a receipt at `staging/{id}/receipts/{hash}.json`, then deletes the staging originals. A retry of the same request returns the receipt even after the originals are gone. Staging files are deleted only after success, so a rejected upload can be fixed and retried.
- **Auth**: Cloud Run IAM (`roles/run.invoker`) is checked at the edge. In-process, `jose` verifies the Google-signed token: RS256 against Google's JWKS, issuer `accounts.google.com`, audience = `PROCESSOR_AUDIENCE`, expiry, and `email` = `INVOKER_SERVICE_ACCOUNT` with `email_verified`. The token travels in `Authorization`, which Cloud Run passes through intact. Do not use `X-Serverless-Authorization`, which Cloud Run strips of its signature.
- **Logs**: structured JSON with explicit fields only (content ID, type, caller email, timing, error class). Logs never contain headers, tokens, credentials or the environment. Startup errors name the missing variables, never their values.

## Run locally

```sh
npm run processor:install          # services/media-processor/node_modules (jose, esbuild, …)
npm run test:processor             # real ffmpeg on synthetic lavfi media, fake bucket on disk
npm run processor:typecheck
npm run processor:build            # → services/media-processor/dist/server.js (Git-ignored)

# Local mode: a directory stands in for the bucket, plus a shared token (≥ 16 chars).
# Refused when K_SERVICE (Cloud Run) or R2 credentials are set.
MEDIA_STORE_DIR=/tmp/bhaktara-bucket LOCAL_DEV_TOKEN=<local-token> PORT=8090 \
  node services/media-processor/dist/server.js
```

Put originals at `$MEDIA_STORE_DIR/staging/<contentId>/<uuid>.<ext>`. To drive the processor from the CMS emulator, start the emulator with `MEDIA_PROCESSOR_URL=http://127.0.0.1:8090 MEDIA_PROCESSOR_DEV_TOKEN=<local-token> npm run emulators:cms`. The emulator accepts only loopback processor URLs and uses the dev token in place of an OIDC token. `npm run test:functions` does the same against a stub processor on port 5098.

## Deployed on bhaktara-dev (2026-10-06)

- Cloud Run `media-processor` in `asia-south1` (https://media-processor-83349652654.asia-south1.run.app), private, concurrency 1, 2 CPU / 2 GiB, timeout 900 s, max 3 instances, runtime account `media-processor@bhaktara-dev.iam.gserviceaccount.com` (secret accessor on the two R2 secrets only). The only invoker is the functions runtime account `83349652654-compute@developer.gserviceaccount.com`; `PROCESSOR_AUDIENCE` is the service URL.
- Secrets `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in Secret Manager; `functions/.env.bhaktara-dev` (Git-ignored) sets `R2_UPLOAD_SECRETS=true`, `R2_ACCOUNT_ID`, `R2_BUCKET` and `MEDIA_PROCESSOR_URL`. All functions were redeployed with the secrets bound.
- Image `asia-south1-docker.pkg.dev/bhaktara-dev/bhaktara/media-processor:<git-sha>`, built with Cloud Build (no local Docker): copy the allow-listed paths from `Dockerfile.dockerignore` plus the Dockerfile into an empty folder, add a `cloudbuild.yaml` with one `docker build -f services/media-processor/Dockerfile -t <image> .` step and `images: [<image>]`, then `gcloud builds submit . --region asia-south1 --config cloudbuild.yaml`. The context is about 256 KB.
- The bucket CORS allows PUT from the admin origins (applied 2026-10-06). Still to add: the R2 lifecycle rule that deletes `staging/` after 1 day (step 7).

## Deploy steps

Cloud Run, Secret Manager, Artifact Registry and 2nd-gen Functions all need Blaze (enabled on dev). Use region `asia-south1`, with Firestore in the same region. Start with dev (`bhaktara-media-dev`). Staging and prod need owner approval (doc 23 §5).

1. Enable the APIs: `run`, `artifactregistry`, `secretmanager` and `iamcredentials` (`gcloud services enable … --project <project>`).
2. Secrets in Secret Manager use the same names `requestUploadUrl` already binds: `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. Use an R2 token with Object Read & Write scoped to the one bucket; it needs delete for staging cleanup. Create each secret from stdin without echoing it (`gcloud secrets create R2_ACCESS_KEY_ID --data-file=-`). Never put them in env files.
3. Service accounts:
   - `media-processor@<project>.iam.gserviceaccount.com` is the Cloud Run runtime. Grant it `roles/secretmanager.secretAccessor` on the two secrets only.
   - The Functions runtime service account (`gcloud functions describe processMedia --region asia-south1 --format='value(serviceConfig.serviceAccountEmail)'`) is the only invoker.
4. Build and push from the repository root. The context is allow-listed by `services/media-processor/Dockerfile.dockerignore`.
   ```sh
   docker build -f services/media-processor/Dockerfile -t asia-south1-docker.pkg.dev/<project>/bhaktara/media-processor:<git-sha> .
   docker push asia-south1-docker.pkg.dev/<project>/bhaktara/media-processor:<git-sha>
   ```
5. Deploy (private, one request per instance, because ffmpeg is CPU-bound and `/tmp` is in memory):
   ```sh
   gcloud run deploy media-processor --region asia-south1 \
     --image asia-south1-docker.pkg.dev/<project>/bhaktara/media-processor:<git-sha> \
     --service-account media-processor@<project>.iam.gserviceaccount.com \
     --no-allow-unauthenticated --concurrency 1 --cpu 2 --memory 2Gi --timeout 900 --max-instances 3 \
     --set-env-vars R2_ACCOUNT_ID=<account-id>,R2_BUCKET=bhaktara-media-dev,INVOKER_SERVICE_ACCOUNT=<functions-sa> \
     --set-secrets R2_ACCESS_KEY_ID=R2_ACCESS_KEY_ID:latest,R2_SECRET_ACCESS_KEY=R2_SECRET_ACCESS_KEY:latest
   URL=$(gcloud run services describe media-processor --region asia-south1 --format='value(status.url)')
   gcloud run services update media-processor --region asia-south1 --update-env-vars PROCESSOR_AUDIENCE=$URL
   gcloud run services add-iam-policy-binding media-processor --region asia-south1 \
     --member serviceAccount:<functions-sa> --role roles/run.invoker
   ```
6. Functions: set `MEDIA_PROCESSOR_URL=<URL>` in `functions/.env.<projectId>`. The URL is not a secret, and the file is Git-ignored by the `.env.*` rule. `MEDIA_PROCESSOR_AUDIENCE` is optional and defaults to the URL's origin. Then run `firebase deploy --only functions:processMedia`.
7. In R2, add a lifecycle rule that deletes `staging/` objects after 1 day. This removes abandoned uploads, receipts and any staging file a failed delete left behind.
8. Verify with one synthetic upload through the CMS. Then check that the variants are reachable via the CDN with `cache-control: immutable`, that the staging key is gone, and that the `media.process` audit entry exists.

## Deferred

- No deployment yet (Blaze).
- The Docker image was not built here (no Docker on the build machine).
- The 30-day cleanup of replaced keys (doc 09 §5).
- Staging originals sit in the public media bucket under unguessable keys until they are processed. Consider a separate private staging bucket before launch.
- Silence trimming and EXIF orientation, as for `media:publish`.
- Banner and deity art go through `media:publish`. The processor supports both types, but no callable writes banner or deity documents yet.

## Inputs per type (2026-10-06, D-056)

At least one original is always needed. Audio types (bhajan, aarti, mantra, chalisa, ringtone) take audio, a cover image, or both: audio alone takes its cover from album art embedded in the file, or has no cover yet (a warning says so); a cover alone replaces just the thumb. Status takes a video, a poster image, or both (a poster alone replaces poster and thumb). Wallpaper, banner and deity art need their image. `processMedia` merges the produced variants into the item and keeps the others, which is how the admin panel replaces media.

