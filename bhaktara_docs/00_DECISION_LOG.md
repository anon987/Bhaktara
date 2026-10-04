# Bhaktara — Product Decision Log

This log records product decisions made by the product owner. When a decision here conflicts with another document, this log wins until that document is updated.

Format: ID · Decision · Date · Affects

## Round 1 — Launch and team (2026-09-22)

- **D-001 · Content team.** All content is created and reviewed by the product owner alone, using AI tools. There is no separate editor or Hindi/Sanskrit reviewer at launch. · Affects: 09, 12, 18
- **D-002 · First public release.** The first Play Store release includes the content app, the habit layer (Sadhana, XP, streak, challenges) and in-app ads. It replaces the old Phase 1 / Phase 2 / Phase 5 split. · Affects: 02, 16, CLAUDE.md
- **D-003 · Ads from launch.** In-app ads are enabled at launch, limited to native and banner formats. · Affects: 11, 16

## Round 2 — V1 scope (2026-09-22)

- **D-004 · V1 content types.** V1 ships with:
  - Bhakti audio: bhajan, aarti, mantra, chalisa
  - Wallpapers
  - Devotional ringtones
  - Status videos

  Scriptures, stories and the Gita are NOT in V1. · Affects: 01, 02, 03, 06, 18
- **D-005 · V1 utilities.** V1 includes a lean "Aaj ka Panchang" card and a festival list. Full Panchang, Rashifal, Vrat and Muhurat are post-V1. · Affects: 01, 02, 03, 16
- **D-006 · V1 competition.** Full weekly leagues ship in V1, including promotion and relegation. · Affects: 02, 10, 16
- **D-007 · Virtual Mandir.** Ships in V1 in a simple form: choose deity, light diya, offer flowers, ring bell, play aarti audio. · Affects: 02, 03, 16
- **D-008 · Name ringtones.** Name ringtones move to V1.x, not V1. · Affects: 01, 02, 16
- **D-009 · Platform (revised 2026-09-22).** Android-first. V1 ships on Android only. An iOS version is planned for later, after the Android app is successful and generating revenue. React Native was chosen for this reason. The codebase must stay iOS-ready from day 1: no Android-only architecture, and all platform-specific features must sit behind platform abstractions (doc 05 §Platform strategy). No iOS build, testing or App Store work is required before the iOS phase. · Affects: CLAUDE.md, 01, 02, 05, 14, 15, 16, 20, 21

## Round 3 — Content model (2026-09-22)

- **D-010 · Audio source.** All vocals are AI-generated, including mantra, chalisa and aarti. · Affects: 12, 17, 18
- **D-011 · Lyrics.** No lyrics or text are shown with audio in V1. · Affects: 03, 06, 09
- **D-012 · Long videos.** There are no long devotional videos in V1. Status videos are the only video content. · Affects: 02, 05, 06
- **D-013 · AI disclosure.** AI-generated vocals are mentioned only on the About/Credits page. There are no per-item labels. · Affects: 03, 12
- **D-014 · Report issue.** There is no user-facing "report issue" button in V1. · Affects: 03, 09
- **D-015 · Banner targets.** V1 banners support INTERNAL targets only. The YOUTUBE target type is removed from V1. It may return with long videos later. · Affects: 01, 03, 05, 06, 09

## Round 4 — Auth, guest, catalog (2026-09-22)

- **D-016 · Guest capabilities.** Guests can use every V1 feature, including Sadhana, XP, streak and challenges. When a guest signs in, their progress is kept. This requires Firebase Anonymous Auth, so every guest has a real UID. · Affects: 05, 06, 07, 08
- **D-017 · Account collision.** If a guest signs in with a Google account that already has Bhaktara data, the guest's progress is merged into that existing account. · Affects: 07, 08, 15
- **D-018 · Launch catalog.** The launch catalog uses the full targets from the original seeding plan (100+ bhajans, 200+ wallpapers, 100+ ringtones, 100+ status videos, etc.), limited to V1 content types. · Affects: 12, 16, 18
- **D-019 · Leagues require sign-in.** Guests are not placed in leagues. They see a league preview that invites them to sign in. · Affects: 03, 10, 21
- **D-020 · Merge rules.** When guest progress is merged into an existing account:
  - XP is added (deduplicated through the reward ledger)
  - current streak = max of the two accounts
  - longest streak = max of the two accounts
  - badges, favorites and Sadhana history are combined (union)
  - league placement is taken from the existing account

  · Affects: 08, 15, 21
- **D-021 · Sign-in prompts.** Sign-in is never forced. The app uses soft, dismissible reminders only. Leagues remain gated by sign-in (D-019). · Affects: 03, 21

## Round 5 — Gamification (2026-09-22)

- **D-022 · Leagues live from day 1** (resolves P-01). Leagues are active from launch. Cohort sizing rules for a small user base are defined in doc 10. · Affects: 10, 16
- **D-023 · Single currency.** XP is the only currency. Punya Points are removed from the product, schema, rewards, CMS and analytics. · Affects: 01, 06, 08, 09, 10, 13, 21
- **D-024 · Streak day boundary.** The streak day rolls over at 04:00 in the user's local time. · Affects: 06, 08, 10, 14, 15
- **D-025 · Sadhana tasks** (resolves P-02). The reading task is removed and replaced by the meditation task. V1 Sadhana task types are jaap, meditation and prayer checklist. · Affects: 01, 02, 03, 10
- **D-026 · Streak qualifying activity.** Any ONE of the following on a given day counts toward the streak:
  - a completed Sadhana task
  - a completed daily challenge
  - one completed jaap mala (108)

  · Affects: 08, 10, 15
- **D-027 · Rank names.** The ranks are Jigyasu → Sadhak → Bhakt → Ananya Bhakt → Param Bhakt. "Super Bhakt" is renamed to Param Bhakt. · Affects: CLAUDE.md, handoff, 10

## Round 6 — IA, Home, onboarding (2026-09-22)

- **D-028 · Bottom navigation.** The tabs are Home · Explore · Mandir · Sadhana · Profile. Challenges and League live inside the Sadhana tab. · Affects: 03, 04, CLAUDE.md
- **D-029 · Onboarding.** Onboarding asks for language only (Hindi/English). The Ishta Devta is picked on the first Mandir visit, not during onboarding. · Affects: 03, 13
- **D-030 · Home top.** The banner carousel is the first section on Home, directly below the header. · Affects: 03, 09

## Round 7 — Media, search, Panchang (2026-09-22)

- **D-031 · Media hosting.** All public media (audio, images, status videos) is hosted on Cloudflare R2 behind the Cloudflare CDN. Firestore stores asset keys, not full URLs. · Affects: 05, 06, 07, 09, 22
- **D-032 · Search.** Search uses Firestore keyword arrays (`searchTokens`) generated server-side on publish. · Affects: 05, 06, 08, 22
- **D-033 · Panchang out of V1.** The "Aaj ka Panchang" card is removed from V1 and moves to the post-V1 backlog. This supersedes part of D-005. Whether the festival list stays in V1 is pending P-07. · Affects: 02, 03, 16

## Round 8a — Pending closures (2026-09-22)

- **D-034 · Festival list in V1** (resolves P-07). The festival list and festival detail stay in V1. Festival dates are entered manually in the CMS by the operator. There is no calculation engine. · Affects: 02, 03, 09, 16
- **D-035 · Search is Firestore-only** (resolves P-06). Search uses Firestore `searchTokens` only. The on-device index proposal is rejected for V1. · Affects: 22
- **D-036 · CMS workflow** (resolves P-03). The content states are DRAFT → READY → SCHEDULED → PUBLISHED → ARCHIVED. READY requires the doc 12 §5 checklist to be complete. · Affects: 06, 09, 12

## Round 8b — Ads and privacy (2026-09-22)

- **D-037 · Native ads on all screens.** Native ads may appear on any screen, including Mandir, Sadhana and the audio player. Interstitials remain excluded from V1 (D-003). Ad-policy placement constraints still apply (see P-08). · Affects: 03, 04, 11, CLAUDE.md, 01
- **D-038 · Rewarded ads for saves.** A rewarded ad unlocks saving a wallpaper, ringtone or status video. · Affects: 03, 11, 13
- **D-039 · League names always shown.** Display names are always shown on league boards, with no hide option (resolves P-05). · Affects: 10, 21

## Round 8c (2026-09-22)

- **D-040 · Mandir special offerings via rewarded ad.** The Mandir has a "special offerings" set (ornaments, special flowers, etc.). The user watches one rewarded ad to use one special offering once. Basic diya, flowers and bell always stay free. · Affects: 02, 03, 06, 09, 11, 13
- **D-041 · Rewarded gate scope** (resolves P-09). Saving to the device (wallpaper, ringtone, status) requires a rewarded ad. Sharing a status to WhatsApp is free and not gated. · Affects: 03, 11
- **D-042 · League display name** (resolves P-10). Leagues show an editable display name. The default is first name + last initial from the Google profile. Users can edit it anytime, subject to a profanity filter and length limits. · Affects: 10, 21, 06
- **C-001 · Compliance rule (not a product preference).** Native ads must not be placed adjacent to or overlapping repeated-tap targets: the jaap counter and the Mandir diya, flowers and bell. This follows ad-network accidental-click policy. D-037 still applies everywhere else. The product owner may raise objections, but a placement that violates network policy cannot ship. · Affects: 04, 11

## Round 8d (2026-09-22)

- **D-043 · Notification cap.** A user receives at most 2 push notifications per day. · Affects: 14
- **D-044 · Ad networks.** V1 uses AdMob with Meta Audience Network through AdMob mediation (bidding). · Affects: 11
- **D-045 · Stotra.** Stotra is not in V1. It moves to the post-V1 backlog. · Affects: 02, 03, 06, 18

## Round 9 — Dev tooling (2026-09-22)

- **D-046 · MCP servers.** The project uses three MCP servers with Claude Code:
  - **Stitch MCP:** UI design source
  - **Firebase MCP:** Firebase project operations
  - **Cloudflare MCP:** R2/CDN/DNS operations

  Usage rules and guardrails are in doc 23. · Affects: CLAUDE.md, handoff, 04, 05, 23

## Round 10 — Media infrastructure (2026-10-04)

- **D-047 · Dev media endpoint.** The dev bucket `bhaktara-media-dev` (APAC location hint) serves public reads through its rate-limited r2.dev address until a Bhaktara domain is bought. A Bhaktara-owned domain (`media.<domain>`) is required before the first public release, because shipped builds embed the media base URL. · Affects: 22, 23

## Pending / resolved items

- ~~P-01~~ Resolved by D-022.
- ~~P-02~~ Resolved by D-025.
- ~~P-03~~ Resolved by D-036.
- ~~P-04~~ Resolved in schema v2: the `contentPrivate` and `licenseRecords` collections (doc 06).
- ~~P-05~~ Resolved by D-039. Original question: Leaderboard privacy. Decide whether a user's display name is shown on the league board by default, and whether it can be hidden. (Round 8)
- ~~P-06~~ Resolved by D-035 (rejected). Original proposal: instead of (or in addition to) Firestore keyword arrays, publish a compact search index JSON to the CDN and search on-device. This is free, typo-tolerant and works offline for a catalog of this size. (Round 8)
- ~~P-07~~ Resolved by D-034. Original question: Confirm whether the festival list stays in V1 now that the Panchang card is out. If it stays, dates are entered manually in the CMS. (Round 8)
- ~~P-08~~ Resolved (see Round 8c). Original: Ad exclusion zones for policy compliance.** Keep ads away from the jaap tap counter and the Mandir tap targets (diya, flowers, bell) to avoid accidental-click violations. (Round 8c)
- ~~P-09~~ Resolved (see Round 8c). Original: Scope of the rewarded gate.** Decide whether sharing a status to WhatsApp is also gated, and whether some saves per day are free. (Round 8c)
- ~~P-10~~ Resolved (see Round 8c). Original: League display name source.** Decide whether the league name is the full Google name or an editable display name (default: first name + initial). (Round 8c)
- **P-12 · North-star metric.** Confirm the primary KPI (candidate: % of DAU with a qualifying streak activity).
- **P-11 · Canonical deity list.** Confirm the final V1 deity list in doc 18 §4, including whether Sai Baba is included.
