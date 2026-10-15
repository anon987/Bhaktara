# Content import

`npm run content:import` implements the seed/import script required by doc 18 §3, until the admin CMS exists. It reads a manifest (CSV or JSON) plus an asset folder. For each row it:
1. validates metadata and the doc 12 §5 checklist;
2. publishes media through the same pipeline as `media:publish` (renditions, metadata stripping, content-addressed keys, R2 upload);
3. upserts `content/{importKey}` and the private provenance record `contentPrivate/{importKey}`;
4. reports failures per row.

**Target:** the local Firestore emulator (`demo-bhaktara`) by default. `--project dev` writes to `bhaktara-dev` through the Firebase Admin SDK using Application Default Credentials: run `gcloud auth application-default login` as a member of the project. Staging and prod also need `--confirm-project <id>`. The script refuses a real project while `FIRESTORE_EMULATOR_HOST` is set. Media goes to the dev R2 bucket (credentials in `.env.r2`), or to a local folder with `--local-media`.

## Workflow

```sh
npm run emulators                 # terminal 1: Auth + Firestore emulators
npm run seed:emulators            # deities (and sample catalog) for validation
npm run content:import -- --manifest catalog/manifest.csv --dry-run   # check every row first
npm run content:import -- --manifest catalog/manifest.csv             # media → R2, docs → emulator
npm run content:import -- --manifest catalog/manifest.csv --project dev   # docs → bhaktara-dev
```

For the real dev project, seed its deities first with `npm run seed:dev` (no emulator needed).

| Option | Effect |
| --- | --- |
| `--assets <dir>` | Folder that `audio`/`image`/`video` paths are relative to (default: the manifest's folder) |
| `--dry-run` | Validates rows and renders media in a temporary folder; uploads and writes nothing. Deity IDs are only checked against Firestore in a real run |
| `--local-media <dir>` | Write renditions to a folder instead of R2 (offline testing; serve it and set `EXPO_PUBLIC_MEDIA_BASE_URL=http://127.0.0.1:<port>`) |
| `--project <dev\|staging\|prod>` | Write to a real project; `--confirm-project <id>` is required except for dev |
| `--publish-ready` | Emulator and dev only: rows with a complete checklist become PUBLISHED, so the app shows them |
| `--confirm-bucket <b>` | Required to upload to a bucket not ending in `-dev` |
| `--report <file>` | Writes the per-row results as JSON |

The command exits non-zero if any row fails. Other rows still import.

## Manifest

Start from `scripts/content/manifest.example.csv`. One row per item; the header names columns, and unknown column names are rejected so typos never silently drop data. Lists use `|` between values. Flags accept yes/no, true/false, y/n, 1/0 or x.

| Column | Required | Notes |
| --- | --- | --- |
| `importKey` | yes | Lowercase slug, stable forever. It becomes the content ID, so re-running updates instead of duplicating |
| `type` | yes | BHAJAN, AARTI, MANTRA, CHALISA, WALLPAPER, RINGTONE or STATUS |
| `title_hi`, `title_en` | yes | |
| `description_hi`, `description_en` | no | Never required. The app hides an empty description, and bhajans, aartis, mantras and chalisas show none in the admin editor |
| `deityIds` | yes | Must exist in `deities` (doc 18 §4 taxonomy) |
| `categoryIds`, `tags` | no | Tags should include transliterations; they feed search |
| `audioLanguage` | no | e.g. `hi`, `sa` |
| `audio` / `image` / `video` | by type | Audio types and ringtones: `audio` + `image` (thumbnail). Wallpaper: `image`. Status: `video` (+ optional poster `image`) |
| `saveGate` | no | Default REWARDED for WALLPAPER/RINGTONE/STATUS (D-038), otherwise FREE |
| `isShareable`, `adEligible`, `isFeatured` | no | Defaults: yes, yes, no |
| `sourceText`, `sourceTextRef` | AARTI/MANTRA/CHALISA | Canonical text and edition (doc 12 §3). Stored only in `contentPrivate` |
| `aiTool`, `aiPlan` | yes | Licence provenance (doc 12 §4); `licenseRecordId` optional |
| `check_<item>` | for READY | Doc 12 §5 checklist, below |

Checklist columns: everything gets `titleChecked`, `taxonomyChecked`, `thumbnailReadable`, `aiRecorded`, `savePolicySet`, `iconographyCorrect`, `noDistortions` and `respectfulFraming`.
- **AARTI/MANTRA/CHALISA** add `sourceTextStored`, `listenThroughText`, `sanskritChecked` and `noAudioArtifacts`.
- **BHAJAN** adds `listenThrough` and `noUnintendedLyrics`.
- **RINGTONE** adds `cleanStartEnd` and `loudEnough`.

## Status rules (D-036, doc 09 §4)

- Complete checklist → READY; anything missing → DRAFT (the report lists the missing items).
- PUBLISHED, SCHEDULED and ARCHIVED items keep their status on re-import. If such a row's checklist is no longer complete, the row fails rather than silently unpublishing.
- Server-owned fields survive re-imports: `popularityScore`, `publishedAt`, and `createdAt`/`createdBy` on the private record.
- `searchTokens` are generated from titles, tags, deity names and aliases, and category IDs. They use the app's shared normalization, standing in for the future `onContentWrite` function (doc 08).

## Not covered yet

- Collections, banners, deities and festivals.
- Deleting R2 objects replaced by new keys. That is the scheduled cleanup job in doc 09 §5.

## Verification

- `tests/import.test.ts`: CSV edge cases, column typos, per-field errors, checklist → status, locked statuses, derived fields, app-schema compatibility.
- `emulator-tests/import.test.ts`: real import into the emulator with synthetic media. It checks statuses and per-row failures (unknown deity, missing file), and that security rules expose only PUBLISHED content and never `contentPrivate`. It also confirms app search finds imported items, and that a re-run updates in place while preserving server fields.
