# Technical Architecture

## Client

React Native + TypeScript. Android-first: V1 ships on Android, iOS follows later (D-009).

Recommended layers:

``` text
UI Screens
  ↓
Feature Hooks / View Models
  ↓
Domain Services
  ↓
Repositories
  ↓
Firebase / HTTP / Local Storage
```

Do not let UI components directly contain complex Firestore queries.

## Suggested structure

``` text
src/
  app/
    navigation/
    providers/
    config/
  features/
    home/
    explore/
    content/
    player/
    sadhana/
    challenges/
    league/
    profile/
    festivals/
    mandir/
    auth/
    search/
  components/
  services/
    analytics/
    ads/
    auth/
    notifications/
    downloads/
    storage/
  repositories/
  domain/
  hooks/
  theme/
  utils/
  types/
```

## Platform strategy (D-009)

V1 is released on Android only. iOS is a planned later release, so the codebase must not become Android-only.

### iOS-readiness rules (apply from M0)

1. **Library choice.** Prefer libraries that support both Android and iOS. If an Android-only library is unavoidable, isolate it behind an interface.
2. **Platform services.** Put every platform-specific capability behind a service interface in `src/services/platform/`, with an Android implementation now and an iOS stub. Covered capabilities:
   - `WallpaperService`
   - `RingtoneService`
   - `MediaSaveService`
   - `ShareService`
   - `NotificationPermissionService`
3. **Capability flags.** Each service exposes what it supports, e.g. `canSetRingtone()` or `canSetWallpaperDirectly()`. The UI reads these flags instead of checking `Platform.OS` inside screens.
4. **No Android-specific assumptions in shared code.** This covers layouts, back behaviour, permissions and file paths. Use `Platform.select` only inside the platform services and the theme.
5. **Backend is platform-neutral.** Firebase, R2, Cloud Functions, the schema and the CMS need no change for iOS. Keep an `ios` value possible in `devices` and analytics.
6. **Project hygiene.** Keep the `ios/` folder in the repo. It must compile when the iOS phase starts, but it is not maintained or tested in V1.

### Known iOS differences (for the future iOS phase)

These are recorded now so V1 architecture does not block them.

| Feature | Android (V1) | iOS (later) |
|---|---|---|
| Set as ringtone | Direct, via `WRITE_SETTINGS` | Not possible for third-party apps. Fallback: save the file plus a GarageBand/Settings guide, or hide the action (`canSetRingtone = false`) |
| Set as wallpaper | Direct, via WallpaperManager | Not possible programmatically. Fallback: save to Photos plus a "set from Photos" guide |
| Save to gallery | MediaStore | Photos library (add-only permission) |
| WhatsApp status share | Share intent | Share sheet (works) |
| Google Sign-In | Credential Manager | Google Sign-In SDK. **Sign in with Apple** will likely be required by App Store rules when third-party login is offered. Doc 21 must keep the auth layer provider-agnostic. |
| Push | FCM | FCM via APNs (needs APNs key/certificate) |
| Ads | AdMob + Meta AN | Same, plus App Tracking Transparency prompt and SKAdNetwork IDs |
| Background audio | Foreground service + media session | Background audio mode + Now Playing |
| Rewarded-ad save gate | As specified | Re-check App Store review expectations before launch |
| Future subscription | Play Billing | StoreKit. The entitlement model in doc 06 is already provider-neutral (`subscriptionProvider`). |

## Backend

Firebase: - Authentication - Firestore - Storage - Cloud Functions -
FCM - Analytics - Crashlytics - App Check - Remote Config

## Trusted operations

Move these to Cloud Functions: - award XP - validate challenge
completion - update streak - issue rewards - calculate weekly league -
grant badges - subscription entitlement - admin publishing workflows -
scheduled notifications - aggregate analytics - cleanup expired
content - process scheduled campaigns

## Client local storage

Use a local persistence layer for: - onboarding completion - cached
content - favorites cache - downloaded media metadata - playback state -
pending analytics - offline Sadhana progress

Server remains authoritative for account progression.

## Media

See `22_MEDIA_AND_SEARCH.md` (authoritative).

- Media is served from Cloudflare R2 through the Cloudflare CDN (D-031).
- Firestore stores asset keys and variant metadata, not URLs.
- Variants: `thumb`, `mobile`, `full`, `stream`, `poster`, as applicable.
- Never send a full-resolution asset where a thumbnail is enough.

## Search

Server-generated `searchTokens` arrays only (D-032, D-035). See doc 22.

## YouTube

Not used in V1 (D-012, D-015). If long videos return later: store a video ID only, validate it server-side, and use a policy-compliant YouTube player.

## Scalability

Use: - pagination - denormalized counters where justified - Cloud
Functions for aggregation - batched writes - indexes - cached home
sections - CDN/cache headers - lazy media loading

Avoid unbounded Firestore queries.

## Environment

Maintain separate: - development - staging - production

Never use production destructive operations during local development.
