# Firebase Security Model

## Principles

-   Least privilege
-   deny by default
-   user-owned data is writable only by its owner
-   published content is publicly readable only when intended
-   admin writes require custom claims
-   sensitive operations happen in Cloud Functions

## Authentication

See `21_AUTH_AND_ACCOUNTS.md` (authoritative).

- **V1 providers:** Anonymous (guest) and Google.
- **Later:** Phone, linked to the existing account. Never exposed in V1.
- **Not used:** email/password.
- League features require a non-anonymous sign-in provider (D-019).

## Custom claims

Examples: - SUPER_ADMIN - CONTENT_ADMIN - EDITOR - MODERATOR - ANALYST

Authorization uses custom claims only. There is no `isAdmin` field (schema v2).

## Firestore

Users can: - read/update permitted profile fields - read their own
progress - create permitted user-generated preference records

Users cannot:
- write `userStats`, `entitlements`, `days`, `sessions`, `badges`, `userChallenges`, `leagueMembers` or `rewardTransactions` (server-only)
- read `contentPrivate`, `licenseRecords`, `auditLogs` or `accountMerges`
- read unpublished content
- publish content
- modify ad configuration
- modify other users

Anonymous users cannot read `leagueCohorts` or `leagueMembers` (D-019).

Owner-writable fields on `users/{uid}` are limited to: `language`, `mandirDeityId`, `notificationPreferences`, `photoUrl`. `displayName` and `timezone` are changed via functions.

## Media storage (Cloudflare R2 — D-031)

- Public media is public-read through the CDN.
- Uploads only happen through presigned URLs, which are issued by a Cloud Function after an admin custom-claim check. They are scoped to the `staging/` prefix and short-lived.
- R2 credentials exist only in server secret storage and on the operator's machine.
- The processor validates file type, size, duration and dimensions before any file is promoted out of `staging/`.
- Firebase Storage, if used at all (e.g. internal exports), stays deny-by-default with admin-only access.

## Cloud Functions

Trusted functions must: - validate inputs - enforce authorization - use
idempotency where retries can occur - log security-sensitive failures -
avoid leaking internal error details

## App Check

Enable App Check for supported Firebase services and enforce it
progressively after validating legitimate clients.

## Secrets

Never place: - Firebase Admin private keys - payment secrets - Meta
secrets - server credentials - third-party private API keys

inside the mobile bundle.

## Privacy

Collect only data necessary for: - account - product analytics -
notifications - monetization - security

Provide: - privacy policy - consent flows where required - account
deletion - data deletion/export procedures where applicable

## Implementation checkpoint — 2026-10-04

Root `firestore.rules` implements the current local-emulator subset, with auth-required published/active catalog reads and query limits, owner-only profile updates and favorites, blocked client progression writes, and signed-in-only league reads. Sensitive and unimplemented collections remain denied, including CMS client writes and device registration. Server profile provisioning is not implemented. Rules are exercised by `npm run test:emulators`; no rules have been deployed to a cloud project. See [Firebase development](../docs/FIREBASE_DEVELOPMENT.md).

## Implementation checkpoint — 2026-10-05 (Home feed)

`homeFeeds/{language}` allows a single-document `get` to any authenticated session (including anonymous) for `hi`/`en` when `isPublished == true`. A missing doc reads as absent, so the app can show its empty state. List queries and all client writes are denied; `homeLayout` stays admin-only through the default deny. Covered by `emulator-tests/home.test.ts`. Not yet deployed to any cloud project.
