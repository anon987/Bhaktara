# Admin CMS

The admin web app (`admin/`) is the operator panel for Bhaktara (doc 09, D-055). It is a Vite + React + TypeScript app with shadcn/ui and Tailwind v4, with its own `package.json` and lockfile. The backend is the Cloud Functions in `functions/`. Shared rules live in `src/domain/` (`cms.ts` for roles and the content workflow, `checklist.ts`, `admin.ts` for the panel v2 schemas), and the panel imports the same code to give instant feedback. The server still validates every write.

- **Reads** go straight to Firestore under the staff rules in `firestore.rules`. Roles come from the `role` custom claim; the permission table is `permissions` in `src/domain/cms.ts`.
- **Writes** always go through callables, and each writes its own audit entry in the same transaction.

## Layout

- A collapsible sidebar groups the pages (Overview, Content, Catalogue, Sadhana, Mandir & festivals, People) and shows only what the role may open. On phones it becomes a slide-in menu behind the hamburger button.
- The header has breadcrumbs, the environment badge, page search (⌘K / Ctrl+K) and the light/dark switch. The account menu holds the theme choice and sign-out.
- A page that hits a render error shows the error with **Try again**; the menu keeps working.

## Pages

| Page | What it does | Roles | Backend |
|---|---|---|---|
| Dashboard | Devotees (total, new, active), active streaks, XP given today, 14-day practice chart, content by status, challenge days queued, publishing this week, festivals in the next 45 days, alerts | all staff | `getDashboard` (cached 5 min in `jobState/dashboard`; **Refresh** forces) |
| Content library | Status tabs, type filter, title search, paging | SA, CA, EDITOR | Firestore reads |
| Content editor | The D-036 editor: fields, checklist, status moves, media upload (originals → `processMedia` renders every variant) | SA, CA, EDITOR | `createContent`, `updateContent`, `transitionContentStatus`, `requestUploadUrl`, `processMedia` |
| Media library | Images for banners, deities, festivals, offerings and covers; upload, preview, copy keys, remove. Editors pick from it with the asset picker | SA, CA, EDITOR | `requestAssetUpload`, `processAsset`, `deleteAsset`; `mediaAssets` reads |
| Home manager | Sections per language: reorder, show/hide, edit rails, quotes and shortcuts, phone preview, rebuild feeds | SA, CA | `getHomeLayout`, `updateHomeLayout`, `rebuildHomeFeed` |
| Banners | Banner manager with the image picker; internal targets only (D-015) | SA, CA | `createBanner`, `updateBanner`, `deleteBanner` |
| Collections, Deities, Categories, Challenges, Badges, Festivals, Mandir offerings | Card grid, search, live/off filter, side-sheet editor; challenges show an 8-week coverage strip | read: SA, CA, EDITOR, ANALYST; write: SA, CA | `saveCatalogItem`, `deleteCatalogItem` |
| Puja offerings, Sadhana plan, XP & levels | Versioned `appConfig/puja`, `appConfig/sadhana`, `appConfig/gamification` with history and restore | read: SA, CA, ANALYST; write: SA | `saveConfig`, `rollbackConfig` |
| Users | Search by user ID, email or display-name prefix; filters (signed in, guests, flagged, disabled); detail with account facts, practice, 42-day grid, badges and notes | read and moderate: SA, MODERATOR; disable/delete: SA | `searchUsers`, `getUserDetail`, `moderateUser`, `setUserDisabled`, `deleteUserAccount` |
| Staff roles | Staff accounts and roles; grant or remove a role | SA | `listAdmins`, `setAdminRole` |
| Audit log | Every admin change, newest first | SA, CA | Firestore reads |

Rules the server enforces:

- **Catalogue**: deities and categories are deactivated, never deleted (`DEACTIVATE_INSTEAD`); a deity cannot be active without Mandir art (`ART_REQUIRED`); challenge and offering dates are stored as Timestamps.
- **Config**: a save must name the version it started from, or it is refused (`STALE`). Every save and restore writes `appConfig/{id}/versions/{n}`. The daily XP cap cannot be below the largest award (`CAP_TOO_LOW`), at least one puja offering must be required (`NO_REQUIRED_OFFERING`), and forbidden flowers are refused per deity (`FORBIDDEN_OFFERING`).
- **Users**: nobody acts on their own account or on another staff account (`ADMIN_ACCOUNT`). Disabling also revokes refresh tokens. Deleting needs the user ID typed again; it removes the profile and its subcollections, `userStats`, `userAdmin`, `userChallenges` and the sign-in account, and keeps `rewardTransactions` with `uid: "deleted-user"`. Credentials and tokens are never returned.

## Run it locally

```sh
npm run admin:install        # once: installs admin/ dependencies (npm ci)
npm run functions:install    # once: functions/ dependencies
npm run emulators:cms        # terminal 1: auth, firestore, functions (demo-bhaktara)
npm run seed:emulators       # optional: placeholder deities, banners, content, habit config
npm run admin:dev            # terminal 2: http://127.0.0.1:5173
```

1. Open http://127.0.0.1:5173 and choose **Sign in with Google**. The Auth emulator shows a fake account picker: add any account, for example `you@example.com`.
2. The app shows **No access** until the account has a role. Grant one with `npm run admin:grant-role -- --email you@example.com --role SUPER_ADMIN`. This targets the emulator by default, and `--create` adds the account if it has not signed in yet.
3. Choose **Refresh access**. The app reads the new claim from a fresh ID token.

**Memory:** the emulator scripts pass `--inspect-functions 9229`, which serves every function from one Node worker (about 180 MB). Without it the emulator starts a worker per function (about 180 MB each, about 6 GB for a full test run), and on the 7 GB development laptop `systemd-oomd` then kills the editor or the desktop session. Keep the flag, and do not run the emulators together with Metro, Gradle or a browser test run.

If the functions emulator logs `Cannot determine backend specification. Timeout after 10000`, the machine is too busy to load the bundle in time. Start it with `FUNCTIONS_DISCOVERY_TIMEOUT=90 npm run emulators:cms`.

## Checks

```sh
npm run admin:typecheck   # tsc (strict) over admin/ and the shared domain code
npm run admin:test        # Vitest: role gate, editor validation, routes, helpers
npm run admin:build       # production bundle in admin/dist
npm run admin:check       # all three
npm run admin:smoke       # emulators:exec + admin/e2e/emulator-smoke.ts (M1 flows end to end)
npm run test:functions    # includes functions/test/admin.test.ts (panel v2 callables)
npm run test:emulators    # includes the staff read rules (emulator-tests/admin-rules.test.ts)
```

Root `eslint .` lints `admin/` (the `@/` alias is resolved by TypeScript) and ignores `admin/dist`. Root Jest ignores `admin/`, which has its own Vitest suite.

## Production seam

`admin/src/config.ts` reads Vite env vars (see `admin/.env.example`):

- **Emulator mode** is the default. It requires a `demo-*` project ID.
- **Project mode** (`VITE_USE_EMULATORS=false`) needs the web app config (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, optional `VITE_FIREBASE_APP_ID`) in `admin/.env.production.local`, which Git ignores. It refuses `demo-*` IDs. `VITE_MEDIA_BASE_URL` (the app's `EXPO_PUBLIC_MEDIA_BASE_URL`) turns media keys into previews.

`firebase.json` has a `hosting` block that serves `admin/dist` with an SPA rewrite and no-index/no-frame headers, and builds it first. **Panel v2 is deployed to `bhaktara-dev` (2026-10-06): https://bhaktara-dev.web.app** (`npx firebase deploy --project dev --only hosting`). The Google provider is enabled and the default `web.app`/`firebaseapp.com` domains are authorized.

An operator account needs a role first: sign in once, then `GOOGLE_CLOUD_QUOTA_PROJECT=bhaktara-dev npm run admin:grant-role -- --email <email> --role SUPER_ADMIN --project dev --confirm-project bhaktara-dev` (with user Application Default Credentials the Auth Admin API needs a quota project), then sign out and in again to refresh the claim. Later roles can be granted on the **Staff roles** page. The operator account `informdhananjay@gmail.com` holds SUPER_ADMIN on `bhaktara-dev` since 2026-10-06.

Uploads answer "not configured" until the R2 secrets exist (`R2_UPLOAD_SECRETS=true` in `functions/.env.bhaktara-dev`), and rendering needs the Cloud Run media processor (`MEDIA_PROCESSOR_URL`; [MEDIA_PROCESSOR.md](MEDIA_PROCESSOR.md)). R2 needs a CORS rule that allows PUT from the admin origin.
