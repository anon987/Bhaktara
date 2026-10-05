# Admin CMS

The admin web app (`admin/`) is the operator UI for the M1 CMS core (doc 09): content, banners and the audit log. It is a Vite + React + TypeScript app with its own `package.json` and lockfile. The backend is the Cloud Functions in `functions/`. The rules live in `src/domain/cms.ts` and `src/domain/checklist.ts`, and the app imports the same code to give instant feedback. The server still validates every write.

- **Reads** go straight to Firestore under the staff rules in `firestore.rules`. Roles come from the `role` custom claim. EDITOR can read content. Banners and the audit log need CONTENT_ADMIN or SUPER_ADMIN.
- **Writes** always go through the callables (`createContent`, `updateContent`, `transitionContentStatus`, `createBanner`/`updateBanner`/`deleteBanner`, `requestUploadUrl`). Each callable writes its own audit entry.

## Run it locally

The Firebase dev project is on the Spark plan, so Functions run only in the emulators.

```sh
npm run admin:install        # once: installs admin/ dependencies (npm ci)
npm run functions:install    # once: functions/ dependencies
npm run emulators:cms        # terminal 1: auth, firestore, functions (demo-bhaktara)
npm run seed:emulators       # optional: placeholder deities, banners, content
npm run admin:dev            # terminal 2: http://127.0.0.1:5173
```

1. Open http://127.0.0.1:5173 and choose **Sign in with Google**. The Auth emulator shows a fake account picker: add any account, for example `you@example.com`.
2. The app shows **No access** until the account has a role. Grant one with `npm run admin:grant-role -- --email you@example.com --role SUPER_ADMIN`. This targets the emulator by default, and `--create` adds the account if it has not signed in yet.
3. Choose **Refresh access**. The app reads the new claim from a fresh ID token.

If the functions emulator logs `Cannot determine backend specification. Timeout after 10000`, the machine is too busy to load the bundle in time. Start it with `FUNCTIONS_DISCOVERY_TIMEOUT=90 npm run emulators:cms`.

## Screens

- **Content**: the list filters by status and type and pages 25 items at a time, ordered by ID. The editor covers:
  - title and description (hi/en), type, deities, categories, tags and audio language
  - media variant keys, with the required slots for the type marked
  - flags, duration and expiry
  - the private provenance panel
  - the doc 12 §5 checklist for the type

  Shape errors (for example a URL where an asset key belongs) block saving and are shown on the field. Readiness problems are listed under **Needed before READY**. Fields can be edited only in DRAFT.
- **Status**: the panel shows only the D-036 moves the role allows and names the role each other move needs. Server refusals are shown as lists, for example "Not ready yet" followed by each missing field or checklist item. Permission and schedule errors are shown the same way.
- **Upload original**: the panel calls `requestUploadUrl` and then PUTs the file to the presigned R2 `staging/` URL, showing progress. Without the R2 settings the function refuses, and the app says that uploads are not configured here. `processMedia` (which renders variants and fills the keys) is not built yet. R2 needs a CORS rule that allows PUT from the admin origin.
- **Banners**: create, edit, enable/disable and delete. Targets come from the route whitelist, never a URL. The active window is entered in local time.
- **Audit log**: read-only, newest first, 25 entries per page.

## Checks

```sh
npm run admin:typecheck   # tsc (strict) over admin/ and the shared domain code
npm run admin:test        # Vitest: role gate, editor validation and transition errors, helpers
npm run admin:build       # production bundle in admin/dist
npm run admin:check       # all three
npm run admin:smoke       # emulators:exec + admin/e2e/emulator-smoke.ts (end to end)
```

`admin:smoke` drives the app's own data layer (`admin/src/api.ts`) against the emulators. It covers:

- the no-role refusal and the SUPER_ADMIN claim
- creating a draft and the checklist refusal on DRAFT → READY
- server field errors and the move to PUBLISHED
- list filters and pagination
- the upload "not configured" message
- banner create, update and delete
- audit pagination
- EDITOR refusals

Root `eslint .` lints `admin/` and ignores `admin/dist`. Root Jest ignores `admin/`, which has its own Vitest suite.

## Production seam

`admin/src/config.ts` reads Vite env vars (see `admin/.env.example`):

- **Emulator mode** is the default. It requires a `demo-*` project ID.
- **Project mode** (`VITE_USE_EMULATORS=false`) needs the web app config (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, optional `VITE_FIREBASE_APP_ID`) in `admin/.env.production.local`, which Git ignores. It refuses `demo-*` IDs.

`firebase.json` has a `hosting` block that serves `admin/dist` with an SPA rewrite and no-index/no-frame headers, and builds it first. Nothing has been deployed. Deploying Hosting alone works on Spark, but the app is useless until the Functions are deployed, which needs Blaze. Google sign-in on a real project also needs the Google provider enabled and the Hosting domain authorized.
